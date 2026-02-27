# Checklist UX e copy — IRPF Produção (Task 24 / PRD 11.6)

Diretrizes para legendas, placeholders, empty states, mensagens de erro e acessibilidade.

## Legendas e placeholders

| Contexto | Texto sugerido |
|----------|----------------|
| Campo tipo declaração | "Simplificada (20%) ou Completa" |
| Campo exercício | "Ano da declaração (ex.: 2025)" |
| Status do case | Use `STATUS_LABELS` (ver abaixo) |
| Botão gerar .DEC | "Gerar arquivo .DEC" |
| Lista de documentos vazia | "Nenhum documento anexado. Faça o upload na pasta correspondente." |
| Lista de pendências vazia | "Nenhuma pendência no momento." |

## Status em português amigável

| Código | Label |
|--------|--------|
| NEW | Novo |
| INTAKE_IN_PROGRESS | Em preenchimento |
| INTAKE_COMPLETE | Preenchimento concluído |
| PROCESSING | Em processamento |
| PENDING_INTERNAL | Aguardando análise interna |
| PENDING_DOCS | Aguardando documentos |
| READY_FOR_REVIEW | Pronto para revisão |
| APPROVED | Aprovado |
| SUBMITTED | Enviado |
| POST_DELIVERY | Pós-entrega |
| CLOSED | Encerrado |

## Mensagens de erro que orientem

| Código / situação | Mensagem sugerida |
|-------------------|-------------------|
| RF072_STATUS_NOT_APPROVED | O case precisa estar aprovado para gerar o .DEC. Conclua a revisão antes. |
| RF070_BLOCKER_PRESENT | Existem pendências bloqueadoras. Resolva-as antes de gerar o .DEC. |
| RF075_* | Verifique o perfil (Simplificada/Completa) e recalcule os totais da declaração. |
| INVENTORY_REQUIRED | Inclua ao menos um documento no case antes de encerrar. |
| PROTOCOLO_REQUIRED | É necessário ao menos um comprovante de protocolo para marcar como enviado. |

## Empty states com CTA

- **Nenhum case:** "Você ainda não tem cases. Crie um case para começar."
- **Nenhum documento no case:** "Anexe os documentos deste case usando as pastas indicadas (cadastro, rendimentos, etc.)."
- **Nenhum .DEC gerado:** "Gere o arquivo .DEC após aprovação do case."

## Feedback loading e sucesso

- Loading: "Gerando arquivo .DEC..." / "Recalculando totais..."
- Sucesso geração: "Arquivo .DEC gerado. Documento registrado no case."
- Sucesso totais: "Totais recalculados com base nos rendimentos e no perfil."

## Acessibilidade

- Contraste mínimo conforme WCAG 2.1 (4.5:1 texto normal).
- Botões e links críticos com `aria-label` descritivo.
- Mensagens de erro associadas aos campos (`aria-describedby` / `id`).
