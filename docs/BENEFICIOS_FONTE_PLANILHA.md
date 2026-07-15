# Benefícios Fiscais — resolução automática da planilha do Portal da Transparência

> A tela `/beneficios` importa planilhas do Compete e do Invest publicadas pelo
> Portal da Transparência do ES. Este documento explica como o botão "Baixar"
> descobre **sozinho** qual é o arquivo do mês, o que acontece quando o portal
> muda, e como consertar.
>
> Implementado em 2026-07-15. Código: `src/services/FontePlanilhaService.ts`,
> `src/controllers/BeneficiosController.ts` (`fontePlanilha`),
> `frontend/src/components/Beneficios/FontePlanilha.tsx`.

---

## Contexto

As listas de beneficiários vêm de <https://transparencia.es.gov.br/Comum/IncentivosFiscais>.
O portal **não tem API e não tem deep-link** — foi verificado no HTML e no JS dele:

- Não há tratamento de `location.hash`, `location.search` nem `URLSearchParams`
  em lugar nenhum da página.
- As seções são acordeões `collapse` do Bootstrap 4. O Bootstrap não expande por
  fragmento de URL, e o painel fechado é `display:none` — ou seja, abrir
  `…/IncentivosFiscais#item-341` **não** abre a seção 04. Só rolaria até um
  elemento invisível.

Portanto **não é possível** mandar o operador para "o portal já na seção 04".
O que é possível é melhor: pular o portal e ir direto no arquivo.

### O problema que isto resolve

Antes, importar exigia: abrir o portal → achar a seção certa entre 11 → expandir
→ escolher entre dois arquivos → baixar → voltar e importar. Agora é um clique.

### Por que a URL do arquivo não pode ser fixada no código

O link do CSV é `/Comum/IncentivosFiscais/Download/<id>`, e **o `<id>` muda a cada
publicação mensal** (07/2026 = `547` no Compete, `550` no Invest). Fixar esse id
funcionaria hoje e, no mês seguinte, apontaria **em silêncio** para a planilha
velha — sem erro, sem aviso, só número errado na conferência. Num sistema fiscal
esse é o pior tipo de falha. Daí a resolução ser feita na hora.

## Como funciona

```
Carrega /beneficios
   └─ FontePlanilha (1 por aba) → GET /api/beneficios/fonte/:programa
        └─ FontePlanilhaService.obter(programa)
             └─ GET transparencia.es.gov.br/…/ObterFilhos/<itemId>?NivelAnterior=0
                  └─ devolve <li><a href="/…/Download/547">…Ativos em 07.2026</a></li>
                       └─ escolhe o link cujo rótulo casa /ativos/i
                            └─ { arquivoUrl, arquivoLabel } → botão "Baixar …"
```

O `ObterFilhos/<itemId>` é o mesmo endpoint que o próprio portal chama por AJAX
quando o operador clica no título da seção. Ele devolve um fragmento HTML curto
(~380 bytes) com os arquivos daquela seção.

**Roda no backend por necessidade**, não por preferência: o portal não envia
header de CORS, então o navegador não consegue chamá-lo direto.

### Mapa das seções (conferido em 07/2026)

| Programa | Seção | `itemId` | Endpoint |
|----------|-------|----------|----------|
| Compete  | 04    | `341`    | `ObterFilhos/341?NivelAnterior=0` |
| Invest   | 05    | `240`    | `ObterFilhos/240?NivelAnterior=0` |

Outras seções do portal, caso um dia entrem no sistema: `01`=1, `02`=2, `03`=3,
`04.1` (Compete mensal)=52, `05.1` (Invest mensal)=267, `06` (GERAR)=522,
`07`=377, `08`=370, `09`=427.

Cada seção publica **dois** arquivos: `Ativos` e `Excluidos_cancelados`. Só o
`Ativos` é oferecido — é o que a tela importa.

A escolha é **por rótulo** (`/ativos/i` e não `/exclu|cancel/i`), não por posição
na lista, para não baixar o arquivo errado caso o portal inverta a ordem.

### O endpoint

```
GET /api/beneficios/fonte/compete
GET /api/beneficios/fonte/invest
```

```json
{
  "programa": "compete",
  "secao": "04",
  "descricao": "Lista de Beneficiários do programa Compete",
  "portalUrl": "https://transparencia.es.gov.br/Comum/IncentivosFiscais",
  "arquivoUrl": "https://transparencia.es.gov.br/Comum/IncentivosFiscais/Download/547",
  "arquivoLabel": "Programa Compete - ES - Ativos em 07.2026",
  "erro": null
}
```

Responde **200 mesmo quando o portal falha** — nesse caso `arquivoUrl: null` e
`erro` traz o motivo. Portal fora do ar não é erro desta API, e não pode virar um
500 na tela de importação. Programa diferente de `compete`/`invest` → 400.

## O que é dinâmico e o que é fixo

| Item | Dinâmico? | Observação |
|------|-----------|------------|
| Id do arquivo (`547`) | ✅ resolvido a cada load | muda todo mês, por design |
| Mês / rótulo do arquivo | ✅ vem do portal | aparece escrito no botão |
| Id da seção (`341`, `240`) | ❌ fixo no código | só muda se o portal for reestruturado |
| Palavra "Ativos" | ❌ fixa no código | usada para escolher entre os 2 arquivos |

Não existe "zero hardcode" aqui: o portal não oferece contrato nenhum, então
sempre sobra alguma âncora. A escolha foi ancorar no que muda menos (id da seção)
e resolver o que muda sempre (id do arquivo).

### A proteção mais importante é o rótulo do botão

O botão diz **"Baixar Programa Compete - ES - Ativos em 07.2026"**. O mês está
escrito ali. Se a resolução um dia emperrar, o operador *vê* o mês errado antes
de clicar. Planilha desatualizada deixa de ser invisível — que é o risco real
deste tipo de integração.

## Degradação (o que o operador vê quando o portal muda)

`FontePlanilhaService.obter()` **nunca lança**. Timeout de 10s. Qualquer falha —
portal fora, HTML redesenhado, seção renumerada, arquivo renomeado — resulta em
`arquivoUrl: null`, e o card volta ao comportamento antigo:

- botão vira **"Abrir Portal da Transparência"**;
- aparece o aviso *"Não identifiquei o arquivo do mês automaticamente — baixe
  pela seção 04 do portal"*;
- o fallback de link (copiar URL) continua disponível.

Ou seja: **falha visível e segura, nunca arquivo errado em silêncio.** O
operador perde a conveniência, não a capacidade de trabalhar.

O `erro` técnico vai para o log do backend (`[BENEFICIOS] Fonte … não resolvida`),
não para a tela — o operador precisa saber o que fazer, não que o HTML mudou.

## Runbook — o botão parou de resolver

1. **Confirmar pelo backend**, que já mostra o motivo:
   ```bash
   curl -s http://localhost:38572/api/beneficios/fonte/compete
   ```
   `erro` populado + `arquivoUrl: null` → o portal mudou ou está fora.

2. **Ver o que a seção devolve hoje:**
   ```bash
   curl -s "https://transparencia.es.gov.br/Comum/IncentivosFiscais/ObterFilhos/341?NivelAnterior=0"
   ```
   - Devolve os `<li><a href="/…/Download/N">`? → o problema é o casamento do
     rótulo. Verificar se ainda existe "Ativos" no nome do arquivo e ajustar o
     regex em `extrairAtivos()`.
   - Devolve vazio/erro? → o `itemId` mudou. Ir ao passo 3.

3. **Redescobrir o `itemId`** — cada acordeão da página tem um `<h5>` com o id e
   a URL, e o título na linha seguinte:
   ```bash
   curl -s https://transparencia.es.gov.br/Comum/IncentivosFiscais \
     | grep -A1 'h5 data-id="item-' \
     | grep -oE 'ObterFilhos/[0-9]+|<span>[^<]{4,70}</span>'
   ```
   Saída (o id vem imediatamente **antes** do título a que pertence):
   ```
   ObterFilhos/341
   <span>04. Lista de Benefici&#225;rios do programa Compete</span>
   ObterFilhos/52
   <span>04.1 Lista de Benefici&#225;rios do programa Compete (mensal)</span>
   ```
   Atualizar `PROGRAMAS` em `FontePlanilhaService.ts` com o id novo.

4. Atualizar a tabela de seções **deste documento** e rodar os testes.

Enquanto isso, a tela continua utilizável pelo link do portal — não é urgência.

## Testes

- `tests/services/FontePlanilhaService.test.ts` (10) — parser, escolha por
  rótulo, ordem invertida, virada do mês (`08.2026` → id novo sem tocar em
  código), e os caminhos de degradação.
- `frontend/src/components/Beneficios/__tests__/FontePlanilha.test.tsx` (13) —
  botão direto, degradação para o portal quando o backend não resolve e quando a
  API está fora, fallback do link e o copiar.

O parser é raspagem de HTML de terceiro: é a peça mais frágil da feature, e os
testes fixam o contrato observado em 07/2026 justamente para que uma mudança do
portal apareça como teste vermelho.

## Decisões

**Botão é `<a href>`, não `window.open`.** Funciona com clique do meio, "abrir em
nova aba" e teclado, e bloqueador de pop-up não barra navegação de âncora
iniciada pelo usuário. O `rel="noopener noreferrer"` fecha o tab-nabbing via
`window.opener`. O fallback dinâmico (revelar a URL se em ~1,2s a aba não perdeu
o foco) cobre navegador embarcado/kiosk.

**Copiar link usa `execCommand`, não só a Clipboard API.** A app é servida por
HTTP num IP de LAN (`192.168.0.47:5173`), que **não é secure context** — logo
`navigator.clipboard` é `undefined` justamente no ambiente onde ela roda. O
código tenta a Clipboard API se houver contexto seguro e cai no `execCommand`
caso contrário; se nem isso, a URL fica selecionável (`select-all`).

**Duas consultas por load.** A página monta as duas abas de uma vez (a inativa só
fica escondida por CSS), então cada visita resolve Compete **e** Invest — ~0,3s
cada. O lado bom: trocar de aba já mostra o botão resolvido. Não há cache no
backend; se o volume incomodar, um TTL de 30–60min é seguro (a planilha muda uma
vez por mês).

### Alternativas descartadas

- **Fixar o link do CSV** — 1 clique e zero backend, mas aponta para a planilha
  do mês passado assim que publicarem a nova, sem avisar. Descartado.
- **Deep-link para a seção** — o que foi pedido originalmente; o portal não
  suporta (ver Contexto).
- **Resolver a seção pelo nome em vez do id** — sobrevive a renumeração, mas
  passa a depender do texto do título e custa uma requisição a mais (a página
  tem ~137 KB contra ~380 bytes do fragmento). Troca uma âncora por outra; fica
  como opção se o id provar ser instável.
- **Baixar e importar direto do portal** (botão "Atualizar agora") — elimina o
  passo manual inteiro, mas tira a conferência visual do arquivo antes de
  importar. Não descartado, apenas fora do escopo desta entrega.

## Arquivos

| Arquivo | Papel |
|---------|-------|
| `src/services/FontePlanilhaService.ts` | resolve a seção no portal; nunca lança |
| `src/controllers/BeneficiosController.ts` → `fontePlanilha()` | valida o programa; 200 mesmo em falha |
| `src/routes/beneficios.ts` | `GET /fonte/:programa` |
| `frontend/src/services/beneficios.ts` | `obterFonte()` + `FontePlanilhaDto` |
| `frontend/src/components/Beneficios/FontePlanilha.tsx` | card, botão e fallbacks |
| `frontend/src/pages/Beneficios.tsx` | `FONTES` (seção por aba) e render do card |
