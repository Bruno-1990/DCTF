# OneClick — Túnel SSH com auto-heal sob demanda

> Garante que o túnel SSH até o Postgres de produção esteja no ar **antes** de
> cada operação do OneClick (preview/sincronização), subindo-o automaticamente se
> estiver caído. Elimina o erro `ECONNREFUSED 127.0.0.1:54322` no botão OneClick.
>
> Implementado em 2026-07-08. Complementa `docs/plano-sync-oneclick-v2.md` (a
> migração da fonte de dados MySQL v1 → Postgres de prod).

---

## Contexto

O Postgres de produção (banco `oneclick`, container `n8n-postgres-1` na VPS
`72.60.155.69`) é publicado **apenas** em `127.0.0.1:54322` na VPS. O host do DCTF
(`192.168.0.47`, onde o backend roda **direto no Windows**, não em Docker) alcança
esse Postgres por um **túnel SSH** que roda como a Tarefa Agendada do Windows
`OneClick-DCTF-Tunnel` (S4U, sobe no boot). Scripts do túnel em
`D:\aplicativos\VPS HOSTINGER\oneclick-tunnel\` (ver o README de lá).

Problema que isto resolve: se a tarefa do túnel for encerrada (ex.: parada manual
sem reboot), a porta `54322` fica fechada e qualquer clique no OneClick falha com
`ECONNREFUSED`. Antes exigia subir o túnel na mão.

## Como funciona

Fluxo do botão **OneClick**:

```
Clique "OneClick"
   └─ previewOneClick / sincronizarOneClick (backend, no host .47)
        └─ ensureTunnel()
             ├─ porta 127.0.0.1:54322 responde?  → segue direto
             └─ não responde → schtasks /run "OneClick-DCTF-Tunnel"
                                 → polling na porta (até 20s) → segue quando abrir
        └─ consulta public.clientes no Postgres de prod
```

Como o backend roda no **mesmo host** do túnel, ele mesmo verifica a porta local e
dispara a Tarefa Agendada quando necessário.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/services/oneclickTunnel.ts` | `ensureTunnel()`, `isTunnelUp()`, `getTunnelStatus()` |
| `src/controllers/ClienteController.ts` | `previewOneClick` / `sincronizarOneClick` chamam `ensureTunnel()`; handler `oneClickStatus` |
| `src/routes/clientes.ts` | `GET /api/clientes/oneclick/status` |
| `frontend/src/services/clientes.ts` | `oneClickStatus()` |
| `frontend/src/pages/Clientes.tsx` | indicador (bolinha) + estados "Conectando..." / poll de status |

## API

### `GET /api/clientes/oneclick/status`
Status atual do túnel (não sobe nada — só verifica a porta).
```json
{ "success": true, "data": { "active": true, "host": "127.0.0.1", "port": 54322, "taskName": "OneClick-DCTF-Tunnel" } }
```

### `GET /api/clientes/oneclick/preview` e `POST /api/clientes/sincronizar-oneclick`
Sem mudança de contrato. Ambas agora chamam `ensureTunnel()` no início — se o túnel
estiver caído, sobem-no e esperam antes de consultar. Se não conseguirem ativar em
~20s, retornam `500` com mensagem clara.

## Indicador no frontend

Ao lado do botão OneClick (página **Clientes**):

- 🟢 verde (pulsando): túnel **ativo**
- 🔴 vermelho: túnel **inativo** (será ativado ao clicar)
- ⚪ cinza: verificando

O status é consultado ao montar a página, a cada 30s, e após cada preview/sync.
Durante a subida do túnel o botão mostra **"Conectando..."**.

## Configuração (env)

| Var | Default | Descrição |
|---|---|---|
| `ONECLICK_PG_HOST` | `127.0.0.1` | host local do túnel |
| `ONECLICK_PG_PORT` | `54322` | porta local do túnel |
| `ONECLICK_TUNNEL_TASK` | `OneClick-DCTF-Tunnel` | nome da Tarefa Agendada que sobe o túnel |

## Requisitos / limitações

- **Windows + host.** O auto-start usa `schtasks /run`, então só funciona com o
  backend rodando no **host Windows** (não em Docker/Linux). Em outros ambientes,
  `ensureTunnel()` ainda verifica a porta, mas não sobe a tarefa — lança erro
  pedindo para subir o túnel manualmente. (Configurável por `ONECLICK_TUNNEL_TASK`.)
- O usuário do backend precisa ter permissão para executar a Tarefa Agendada
  (mesma conta que a registrou, ou admin).
- O `ssh.exe` do túnel roda sob **S4U** e não pode ser encerrado por uma sessão
  não-elevada (bom para robustez; para limpar túneis órfãos, reboot ou prompt admin).

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| Botão fica em "Conectando..." e falha em ~20s | túnel não sobe (chave/VPS) | testar `oneclick-tunnel.ps1` manual; ver chave `dctf_tunnel` |
| Bolinha vermelha e não ativa ao clicar | tarefa ausente/sem permissão | `Get-ScheduledTask OneClick-DCTF-Tunnel`; reinstalar com `install-task.ps1` |
| Backend em Docker/Linux | `schtasks` indisponível | subir o túnel por fora (autossh/serviço) e deixar a porta `54322` no host |
