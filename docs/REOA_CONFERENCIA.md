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
- **Abrir um card** → modal puxa o cliente **ao vivo do SCI** (Quadro 1), mostra os 12 meses reais, e **persiste** em `reoa_faturamento`.
- Depois de puxado, o card passa a mostrar o dado real (**"● SCI ao vivo"**) e **sobrevive ao reload** (a conferência passa a lê-lo de `reoa_faturamento`). Reabrir não re-consulta o SCI (há botão para forçar).

## Aviso por e-mail
Card na página (fora do modal): campo de destinatários (padrão `fiscal@` e `leg@ central-rnc.com.br`) + botão com confirmação. Envia a lista dos clientes **não-ok** (com algum mês abaixo), com os faturamentos por mês, **link da página** e disclaimer para copiar/colar o link. Não envia se estiver tudo ok. Usa `EmailService` (Gmail SMTP do `.env`).

## Endpoints (`/api/beneficios`)
| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/substituto/conferencia` | Lista clientes SUBSTITUTO + 12 meses (reoa preferido, cache fallback) |
| GET | `/substituto/faturamento/:clienteId` | Puxa **ao vivo do SCI** (Quadro 1) 1 cliente e persiste |
| POST | `/substituto/aviso` | Envia e-mail com os clientes não-ok (`{ destinatarios? }`) |

## Variáveis de ambiente
| Var | Default | Uso |
|-----|---------|-----|
| `SUBSTITUTO_THRESHOLD` | `300000` | Limite mensal |
| `SUBSTITUTO_ALERT_EMAILS` | `fiscal@…,leg@…` | Destinatários padrão do aviso |
| `REOA_PAGE_URL` | `http://192.168.0.47:5173/beneficios` | Link no e-mail |

## Arquivos
| Camada | Arquivo |
|--------|---------|
| Serviço | `src/services/SubstitutoService.ts` (conferência, live SCI, persistência, e-mail) |
| Controller | `src/controllers/BeneficiosController.ts` (`conferenciaSubstituto`, `faturamentoAoVivoSubstituto`, `enviarAvisoSubstituto`) |
| Rotas | `src/routes/beneficios.ts` |
| Migration | `docs/migrations/mysql/035_create_reoa_faturamento.sql` (tabela criada também via `ensureReoaTable`) |
| Frontend | `frontend/src/components/Beneficios/ReoaTab.tsx`, `frontend/src/pages/Beneficios.tsx` (aba), `frontend/src/services/beneficios.ts` |

## Pendências / próxima fase
- **Rotina mensal automática** (hoje o aviso é manual). Quando ativar: usar `reoa_faturamento` + tabela de dedupe (`cliente_id, bdref, enviado_em`) para não reenviar, e plugar um job (padrão `IrpfScheduler`).
- Frescor: `reoa_faturamento` só tem o que foi puxado; a atualização mensal de todos depende de puxar cada cliente (ou a futura rotina).
