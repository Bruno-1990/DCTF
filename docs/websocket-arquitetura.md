# Arquitetura de WebSocket para DCTF Analyzer

## Objetivo

Fornecer atualizações de eventos críticos (conclusão de análises e flags) em tempo real para o frontend e sistemas integrados, garantindo segurança, escalabilidade e simplicidade de manutenção.

## Tecnologia escolhida

- **Biblioteca:** [Socket.IO v4](https://socket.io/)
- **Motivação:**
  - Handshake HTTP + WebSocket com fallback automático (long polling), reduzindo problemas de firewall.
  - API simples no Node/TypeScript e integração pronta no React.
  - Namespaces e salas facilitam broadcast para clientes específicos (por CNPJ/declaração).
  - Suporte a middlewares de autenticação e reconexão automática.
  - Ferramentas de monitoramento (adapter) para ambientes clusterizados.

## Topologia de canais

- **Namespace:** `/realtime`
- **Salas:** 
  - `client:<clienteId>` – eventos exclusivos de determinado cliente.
  - `global:critical` – flags/alertas críticos para usuários com permissão (monitoramento central).
  - `analysis:<declaracaoId>` – atualização detalhada sobre a declaração específica.

```
┌─────────┐     Socket.IO      ┌─────────────────────┐
│ Frontend│  <-------------->  │ Gateway WebSocket   │
└─────────┘   (namespace /realtime)   │
                               │ ├─ Sala client:123  │
                               │ ├─ Sala global:*    │
                               │ └─ Sala analysis:d1 │
                               └─────────────────────┘
```

## Eventos principais

| Evento | Emissor | Payload | Destino |
|--------|---------|---------|---------|
| `analysis.completed` | DCTFAnalysisService | `{ dctfId, clienteId, periodo, riskScore, estimatedPenalty, summary }` | `client:<clienteId>` e `analysis:<dctfId>` |
| `flags.created` | FlagValidationService | `{ flagId, dctfId, clienteId, codigo, severidade, descricao }` | `client:<clienteId>` (+ `global:critical` se `severidade === 'critica'`) |
| `flags.resolved` | FlagController | `{ flagId, dctfId, clienteId, codigo }` | `client:<clienteId>` |
| `health.ping` | Gateway | `{ timestamp }` | broadcast (aplicação de keepalive) |

Todos os payloads seguem JSON e devem incluir `timestamp` ISO e `eventId` (UUID) para rastreabilidade.

## Autenticação

- Handshake Socket.IO com header `Authorization: Bearer <token>` (mesmo JWT utilizado nas APIs).
- Middleware valida token e associa `clienteId`/`roles` ao socket (guardadas em `socket.data`).
- Conexões rejeitadas quando token inválido ou usuário sem permissão para o namespace/room.

## Segurança e boas práticas

- Limitar taxa de eventos enviados por cliente (debounce) para evitar flooding.
- Armazenar métricas: conexões ativas, eventos emitidos por tipo, tempo médio de sessão.
- Logar conexões e desconexões via `AuditTrailService` com `socket.id`, IP e usuário.
- Considerar adapter Redis para escalar múltiplas instâncias (futuro).

## Documentação adicional

- Endpoint de health (`GET /ws/health`) informando status do servidor Socket.IO.
- Atualizar `docs/API-Flags.md`/`docs/DCTF-analise-robusta.md` com referência aos eventos em tempo real.


