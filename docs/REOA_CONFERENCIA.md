# REOA — Conferência de faturamento (grupo SUBSTITUTO)

> Aba **REOA** na página de Benefícios (`/beneficios`). Confere, para os clientes
> do grupo **SUBSTITUTO**, se o faturamento **mensal de cada estabelecimento**
> ficou **acima de R$ 300.000,00** nos últimos 12 meses. Puxa os dados reais do
> SCI (Firebird) sob demanda, persiste o resultado e permite disparar um aviso
> por e-mail com os clientes fora do limite.
>
> Implementado em 2026-07-16.

---

## Regra de negócio
- Clientes com o benefício `SUBSTITUTO` (coluna `clientes.beneficios_fiscais`, match por token) devem manter faturamento **mensal por estabelecimento ≥ R$ 300.000,00** (limite em `SUBSTITUTO_THRESHOLD`).
- Janela = **últimos 12 meses** (do mês anterior ao atual, deslizante).
- **R$ 0,00 ou mês ausente = "sem dados"** (cinza), não conta como abaixo — no SCI, 0 significa mês ainda não apurado/sincronizado (evita alerta falso). Só valor **positivo < limite** é "abaixo" (vermelho).

### Status: três respostas, não duas

O status de um estabelecimento (e do cliente, pelo pior deles) é **tri-estado**:

| Status | Quando | O que fazer |
|---|---|---|
| `ABAIXO` | algum mês da janela comprovadamente abaixo do limite | tratar com o cliente |
| `INDETERMINADO` | nenhum mês abaixo, **mas falta mês na janela** | abrir o card e puxar o SCI |
| `OK` | janela completa e todos os meses acima do limite | nada |

**Por que não um booleano.** "Doze meses conferidos e acima do limite" e "doze meses vazios" davam a mesma resposta — `temAlgumAbaixo: false`, verde na tela. Como a janela é calculada pelo **relógio** e os dados só entram **sob demanda**, a segunda virava a primeira sozinha: a cada mês sem coleta, um mês real saía da janela e um vazio entrava, até que um cliente com doze meses abaixo do limite aparecia como conforme. A falha não aparecia — ela sumia, e quanto mais velho o dado, mais conforme o relatório ficava.

A assimetria é a mesma do motor da cota de aprendizagem: **dado incompleto pode confirmar o caso ruim, nunca o bom**. Um buraco na janela não desmente um mês que já se viu abaixo (segue `ABAIXO`), mas impede afirmar conformidade (vira `INDETERMINADO`).

O campo `temAlgumAbaixo` continua no payload por compatibilidade; quem decide é o `status`. O **e-mail de aviso continua saindo só para `ABAIXO`** — indeterminado é pendência de coleta, não de cliente.

## Fontes de dados (em ordem de preferência)
1. **`reoa_faturamento`** (dados REAIS já puxados do SCI) — preferida.
2. **`irpf_faturamento_detalhado`** (cache do módulo IRPF) — prévia/fallback para quem ainda não foi puxado.

### SCI — SP_BI_FAT (QUADRO 1)
Parâmetros: `SP_BI_FAT(EMPRESA, PLANO, QUADRO, DATA_INI, DATA_FIM, SOMAMATRIZFILIAL)`.
A conferência REOA usa **PLANO=2, QUADRO=1 (consolidada), SOMA=0 (separa matriz/filial)**, datas `YYYY-MM-DD`. No Quadro 1 o SCI retorna 1 linha por mês (`BDREF`) com `BDORDEM=1` = faturamento; `BDCODEMP` = código do estabelecimento (o código SCI para a matriz).
- **Cautela contra travar a procedure:** as chamadas ao SCI são **serializadas** (no máx. 1 `SP_BI_FAT` ativa por vez em todo o processo) + timeout de 150s. Monitorar com `python/scripts/investigar_sp_bi_fat.py`.
- A página **nunca** dispara o SCI automaticamente em massa — só **sob demanda, por cliente** (ao abrir o card/modal).

## Fluxo na tela
- **Página**: grid de cards (um por cliente). Cada card = prévia rápida (cache) com mini-fita dos 12 meses (verde/vermelho/cinza) e badge de status.
- **Busca** (razão social/CNPJ/SCI) + **filtro de status**: `Todos` (default), `Abaixo` (alerta), `OK` — filtra pelos dados efetivos (ao vivo quando já puxado).
- **Abrir um card** → modal puxa o cliente **ao vivo do SCI** (Quadro 1), mostra os 12 meses reais, e **persiste** em `reoa_faturamento`.
- Depois de puxado, o card mostra o dado real e **sobrevive ao reload** (a conferência passa a lê-lo de `reoa_faturamento`). Reabrir não re-consulta o SCI (há botão para forçar).
- O rodapé do card traz **quando o SCI foi consultado** ("coletado 17/07/26 · 34 dias" / "nunca coletado"), não mais um "● SCI ao vivo" que só significava "existe linha na tabela" — e seguia dizendo isso para dado de um mês atrás.

### Frescor: `coletado_em`

A coluna `consultado_em` **não serve** como carimbo de coleta. Ela é `TIMESTAMP ... ON UPDATE CURRENT_TIMESTAMP`, e o MySQL só dispara o `ON UPDATE` quando a linha **muda de valor**; em mês fechado — a maioria dos 12 — re-puxar grava o mesmo número, a linha não muda e o carimbo não anda. Ela responde "quando este valor mudou pela última vez", e a pergunta da tela é "há quanto tempo ninguém confere este cliente".

Daí a coluna `coletado_em` (migration 043, aplicada também sob demanda por `ensureReoaTable`), gravada à mão em toda coleta. Linhas anteriores a ela ficam `NULL`, lidas como "nunca coletado" — some no primeiro pull.

### Persistência: a coleta SUBSTITUI a janela

Cada pull grava **os 12 meses da janela, zeros inclusive**, e apaga as linhas da janela de estabelecimentos que não vieram no retorno.

A versão anterior gravava só mês com valor positivo, em UPSERT que nunca apagava nada. Um mês que o SCI passasse a devolver zero — estorno, reprocessamento, empresa reclassificada — simplesmente não era escrito, e o **valor antigo continuava na tabela**: o REOA exibia um faturamento que o SCI já não confirmava. Como valor alto é justamente o que não gera alerta, o erro caía sempre para o lado silencioso. Gravado passa a significar "foi isto que o SCI respondeu nesta coleta".

## Entrada automática no grupo (auto-pull do SCI)
Quando um cliente **entra no grupo SUBSTITUTO**, o sistema puxa o faturamento do
SCI em **background** (serializado) e persiste em `reoa_faturamento` — o cliente
já aparece no REOA com dados reais, sem precisar abrir o card. Gatilhos:
- **Painel de edição** (`PUT /api/clientes/:id`): quando `beneficios_fiscais` é
  salvo contendo `SUBSTITUTO`, dispara `SubstitutoService.faturamentoAoVivo(id)`
  (fire-and-forget) — `ClienteController.atualizarCliente`.
- **Sincronização OneClick** (`Cliente.sincronizarComOneClick`): coleta os clientes
  que entram (INSERT novo) ou passam a ter (UPDATE) `SUBSTITUTO` e puxa cada um em
  sequência ao final da sync.
A lista do REOA em si **sempre** foi dinâmica (a conferência filtra `clientes` por
token SUBSTITUTO a cada request); o auto-pull garante que venham já **com os dados**.

## Aviso por e-mail
Card na página (fora do modal): destinatários em **tags** (Tab/Enter/vírgula fecham a tag e liberam o próximo; `×` remove; Backspace com campo vazio remove a última) — padrão `fiscal@` e `leg@ central-rnc.com.br` — + botão com confirmação. Envia a lista dos clientes **não-ok** (com algum mês abaixo), com os faturamentos por mês, **link da página** e disclaimer para copiar/colar o link. Não envia se estiver tudo ok. Usa `EmailService` (Gmail SMTP do `.env`).

## Coleta mensal automática

Job próprio (`SubstitutoScheduler`), no padrão do `CotaAprendizagemScheduler`. **Desligado por padrão** — precisa de `REOA_SCHEDULER_ENABLED=true`.

Duas etapas, nesta ordem:

1. **Coleta** — puxa o SCI de todos os clientes do grupo, **um a um**. Sequencial de propósito: a `SP_BI_FAT` já é serializada pelo `comLockSci`, e disparar seis de uma vez só encheria a fila do lock com o timeout de 150s correndo contra quem nem começou. Erro em um cliente não derruba a rodada.
2. **E-mail** — avisa quem ficou `ABAIXO`. Depois da coleta, nunca antes: avisar sobre a janela velha é avisar sobre o mês errado. `INDETERMINADO` **não** entra — falta de coleta é pendência nossa, não do cliente, e mandá-la ao Fiscal treinaria todo mundo a ignorar o aviso.

**Dia 5, não dia 1º**, pelo mesmo motivo do job da cota: o mês fechado só aparece no SCI depois dos lançamentos do fiscal, e mês pela metade abaixo de R$ 300 mil vira alerta falso. **2h**, uma hora depois da cota, para os dois não disputarem o lock do SCI.

**Recuperação**: a janela é `dia >= 5`, não `dia === 5`. Com igualdade exata, servidor fora do ar naquela hora pularia a competência inteira — e mês pulado é buraco permanente na janela, exatamente o que o job existe para evitar. Perdido o dia 5, roda no 6, no 7, e assim por diante.

**Trava**: `reoa_execucao_log` com `UNIQUE(bdref)`, reservado por `INSERT IGNORE` **antes** da coleta começar (sobrevive a restart no meio da varredura, que leva minutos). Linha com `concluido_em` nulo = rodada que não terminou; não é retentada sozinha, a saída é a execução manual com alguém olhando o motivo.

**Execução manual**: `POST /substituto/coletar` (ou o botão "Coletar todos" na tela) ignora dia, hora e trava. É o que resolve cliente do grupo nunca coletado sem esperar o dia 5.

## Endpoints (`/api/beneficios`)
| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/substituto/conferencia` | Lista clientes SUBSTITUTO + 12 meses (reoa preferido, cache fallback) |
| GET | `/substituto/faturamento/:clienteId` | Puxa **ao vivo do SCI** (Quadro 1) 1 cliente e persiste |
| POST | `/substituto/coletar` | Coleta em lote de todos do grupo. Responde **202** na hora — a varredura leva minutos |
| GET | `/substituto/coleta/status` | Andamento da coleta em lote (a tela faz polling de 3s) |
| POST | `/substituto/aviso` | Envia e-mail com os clientes não-ok (`{ destinatarios? }`) |

## Variáveis de ambiente
| Var | Default | Uso |
|-----|---------|-----|
| `SUBSTITUTO_THRESHOLD` | `300000` | Limite mensal |
| `SUBSTITUTO_ALERT_EMAILS` | `fiscal@…,leg@…` | Destinatários padrão do aviso |
| `REOA_PAGE_URL` | `http://192.168.0.47:5173/beneficios?aba=reoa` | Link no e-mail. O `?aba=reoa` é obrigatório — sem ele a página abre em Compete |
| `REOA_SCHEDULER_ENABLED` | `false` | Liga a coleta mensal automática |
| `REOA_SCHEDULER_DIA` | `5` | Dia do mês da coleta |
| `REOA_SCHEDULER_HORA` | `2` | Hora, exigida só na primeira oportunidade |

## Arquivos
| Camada | Arquivo |
|--------|---------|
| Serviço | `src/services/SubstitutoService.ts` (conferência, live SCI, persistência, coleta em lote, e-mail) |
| Job mensal | `src/services/SubstitutoScheduler.ts` (registrado no `server.ts`) |
| Testes | `src/services/__tests__/substituto.rules.test.ts` (janela, limite, tri-estado, status e envelhecimento) |
| Controller | `src/controllers/BeneficiosController.ts` (`conferenciaSubstituto`, `faturamentoAoVivoSubstituto`, `coletarSubstituto`, `statusColetaSubstituto`, `enviarAvisoSubstituto`) |
| Rotas | `src/routes/beneficios.ts` |
| Migrations | `035_create_reoa_faturamento.sql`, `043_reoa_coletado_em.sql`, `044_reoa_execucao_log.sql` (as tabelas também são criadas sob demanda pelo código) |
| Frontend | `frontend/src/components/Beneficios/ReoaTab.tsx`, `frontend/src/pages/Beneficios.tsx` (aba), `frontend/src/services/beneficios.ts` |

## Pendências / próxima fase
- **Dado órfão**: cliente que sai do grupo mantém as linhas em `reoa_faturamento`. Não atrapalha a leitura (a conferência filtra por quem tem o benefício hoje), mas se voltar meses depois a coleta velha se mistura com a nova.
- **Fonte do fallback não aparece na tela**: sem linha em `reoa_faturamento`, a conferência cai no cache do IRPF, que tem outra semântica de `codigo_empresa` (1/2 em vez do código SCI). Hoje o caso está dormente — todos os clientes do grupo têm dado REOA —, mas é o que vai atender um cliente novo. O e-mail deveria recusar sair sobre prévia.
- **Estabelecimento fantasma**: sem coleta nenhuma, `construirEstabelecimentos` inventa um código `1` e o rótulo vira "Filial 1". Já sai como `INDETERMINADO` (não passa por conforme) e não é persistido, mas o card não deveria existir.
