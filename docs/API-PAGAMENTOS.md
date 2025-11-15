# 📋 API de Pagamentos - DCTF MPC

Documentação da API para gerenciar status de pagamento de débitos DCTF.

## 🎯 Objetivo

Permitir verificar, atualizar e consultar o status de pagamento de débitos DCTF identificados para todos os clientes.

## 📝 Endpoints

### 1. Listar Débitos com Filtros

**GET** `/api/pagamentos`

Lista débitos DCTF com filtros opcionais.

**Query Parameters:**
- `clienteId` (string, opcional) - ID do cliente
- `cnpj` (string, opcional) - CNPJ do cliente (com ou sem formatação)
- `periodo` (string, opcional) - Período da declaração (YYYY-MM)
- `statusPagamento` (string, opcional) - Status: `pendente`, `pago`, `parcelado`, `cancelado`, `em_analise` (pode ser múltiplo: `pago,parcelado`)
- `apenasPendentes` (boolean, opcional) - Se `true`, retorna apenas débitos pendentes com saldo > 0
- `saldoMinimo` (number, opcional) - Valor mínimo do saldo a pagar

**Exemplo:**
```bash
GET /api/pagamentos?apenasPendentes=true&statusPagamento=pendente
GET /api/pagamentos?cnpj=12.345.678/0001-90&periodo=2024-01
GET /api/pagamentos?clienteId=uuid-do-cliente
```

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "clienteId": "uuid",
      "periodo": "2024-01",
      "debitoApurado": 1500.75,
      "saldoAPagar": 950.5,
      "statusPagamento": "pendente",
      "dataPagamento": null,
      "comprovantePagamento": null,
      "cliente": {
        "id": "uuid",
        "razao_social": "Empresa Exemplo Ltda",
        "cnpj_limpo": "12345678000190"
      }
    }
  ]
}
```

---

### 2. Obter Estatísticas

**GET** `/api/pagamentos/estatisticas`

Retorna estatísticas de pagamento de débitos.

**Resposta:**
```json
{
  "success": true,
  "data": {
    "total": 150,
    "pendentes": 80,
    "pagos": 60,
    "parcelados": 10,
    "valorTotalPendente": 125000.50,
    "valorTotalPago": 95000.25
  }
}
```

---

### 3. Atualizar Pagamento (Individual)

**PUT** `/api/pagamentos/:id`

Atualiza status de pagamento de um débito específico.

**Body:**
```json
{
  "statusPagamento": "pago",
  "dataPagamento": "2024-01-15",
  "comprovantePagamento": "DARF-123456",
  "observacoesPagamento": "Pagamento confirmado no eCAC",
  "usuarioQueAtualizou": "usuario@email.com"
}
```

**Campos:**
- `statusPagamento` (string, **obrigatório**) - Status: `pendente`, `pago`, `parcelado`, `cancelado`, `em_analise`
- `dataPagamento` (string, opcional) - Data do pagamento (YYYY-MM-DD)
- `comprovantePagamento` (string, opcional) - Número do comprovante (DARF, DAS, etc)
- `observacoesPagamento` (string, opcional) - Observações sobre o pagamento
- `usuarioQueAtualizou` (string, opcional) - Usuário que fez a atualização

**Exemplo:**
```bash
PUT /api/pagamentos/uuid-do-dctf
Content-Type: application/json

{
  "statusPagamento": "pago",
  "dataPagamento": "2024-01-15",
  "comprovantePagamento": "DARF-123456"
}
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "statusPagamento": "pago",
    "dataPagamento": "2024-01-15",
    ...
  },
  "message": "Status de pagamento atualizado com sucesso"
}
```

---

### 4. Atualizar Pagamento em Lote

**PUT** `/api/pagamentos/lote`

Atualiza status de pagamento de múltiplos débitos de uma vez.

**Body:**
```json
{
  "ids": ["uuid-1", "uuid-2", "uuid-3"],
  "statusPagamento": "pago",
  "dataPagamento": "2024-01-15",
  "comprovantePagamento": "DARF-123456",
  "observacoesPagamento": "Pagamento em lote confirmado",
  "usuarioQueAtualizou": "usuario@email.com"
}
```

**Campos:**
- `ids` (array, **obrigatório**) - Array de IDs das declarações DCTF
- `statusPagamento` (string, **obrigatório**) - Status a aplicar em todos
- `dataPagamento` (string, opcional) - Data do pagamento
- `comprovantePagamento` (string, opcional) - Número do comprovante
- `observacoesPagamento` (string, opcional) - Observações
- `usuarioQueAtualizou` (string, opcional) - Usuário que fez a atualização

**Exemplo:**
```bash
PUT /api/pagamentos/lote
Content-Type: application/json

{
  "ids": ["uuid-1", "uuid-2"],
  "statusPagamento": "pago",
  "dataPagamento": "2024-01-15"
}
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "quantidadeAtualizada": 2
  },
  "message": "2 débito(s) atualizado(s) com sucesso"
}
```

---

## 🎯 Casos de Uso

### Caso 1: Listar todos os débitos pendentes

```bash
GET /api/pagamentos?apenasPendentes=true
```

### Caso 2: Verificar débitos de um cliente específico

```bash
GET /api/pagamentos?cnpj=12.345.678/0001-90&apenasPendentes=true
```

### Caso 3: Marcar débito como pago após verificar no eCAC

```bash
PUT /api/pagamentos/uuid-do-dctf
{
  "statusPagamento": "pago",
  "dataPagamento": "2024-01-15",
  "comprovantePagamento": "DARF-123456",
  "observacoesPagamento": "Confirmado no eCAC - Comprovante de Pagamento"
}
```

### Caso 4: Atualizar múltiplos débitos de uma vez

```bash
PUT /api/pagamentos/lote
{
  "ids": ["uuid-1", "uuid-2", "uuid-3"],
  "statusPagamento": "pago",
  "dataPagamento": "2024-01-15"
}
```

### Caso 5: Ver estatísticas gerais

```bash
GET /api/pagamentos/estatisticas
```

---

## 📊 Status de Pagamento

| Status | Descrição |
|--------|-----------|
| `pendente` | Débito ainda não foi pago (padrão) |
| `pago` | Débito foi pago completamente |
| `parcelado` | Débito está sendo pago em parcelas |
| `cancelado` | Débito foi cancelado |
| `em_analise` | Débito está sendo analisado |

---

## ⚠️ Observações Importantes

1. **Migração do Banco**: Antes de usar, execute a migração `003_add_pagamento_status.sql` no Supabase
2. **Validação**: O sistema valida que `statusPagamento` seja um dos valores permitidos
3. **Auditoria**: Todas as atualizações são rastreadas com `usuarioQueAtualizou` e `dataAtualizacaoPagamento`
4. **Filtros**: Use `apenasPendentes=true` para ver apenas débitos que precisam ser pagos

---

## 🔗 Links Relacionados

- Ver documentação completa: `docs/VERIFICACAO-PAGAMENTO-DCTF.md`
- Migração SQL: `docs/migrations/003_add_pagamento_status.sql`

