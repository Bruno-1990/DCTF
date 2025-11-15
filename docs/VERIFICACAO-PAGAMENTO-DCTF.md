# 💳 Verificação de Pagamento de Débitos DCTF

## 📋 Visão Geral

Este documento explica como verificar se os clientes pagaram os débitos DCTF identificados através do eCAC (portal da Receita Federal) e como automatizar essa verificação para todos os clientes.

## 🎯 Problema

Quando analisamos DCTFs, identificamos débitos que os clientes precisam pagar. No eCAC existe uma opção para consultar se o cliente pagou, mas fazer isso manualmente para todos os clientes é trabalhoso e demorado.

## 🔍 Opções de Integração

### ❌ **Limitação: Não há API pública da Receita Federal**

A Receita Federal **NÃO oferece API pública** para consultar status de pagamento de débitos DCTF. Por isso, temos algumas opções:

---

## ✅ **Opção 1: Interface Manual + Atualização em Lote** (Recomendada)

### Como Funciona:

1. **No eCAC**, você consulta o pagamento de cada cliente:
   - Acesse: https://cav.receita.fazenda.gov.br/
   - Vá em: **Pagamentos e Parcelamentos** → **Consulta Comprovante de Pagamento - DARF, DAS, DAE e DJE**
   - Informe CNPJ e período
   - Verifique se há comprovantes de pagamento

2. **No nosso sistema**, você marca como pago:
   - Interface para atualizar status de pagamento
   - Pode fazer em lote para vários clientes
   - Sistema armazena o status no banco de dados

### Vantagens:
- ✅ Simples e direto
- ✅ Não viola termos de uso
- ✅ Total controle dos dados
- ✅ Rastreável e auditável

### Implementação:
- Campo `statusPagamento` na tabela `dctf_declaracoes`
- Interface no dashboard para marcar/atualizar status
- Filtros para ver apenas pendentes
- Relatório de pagamentos pendentes

---

## 🔐 **Opção 2: Integração via Certificado Digital** (Avançada)

### Como Funciona:

A Receita Federal oferece alguns serviços que exigem **Certificado Digital A1 ou A3**:

1. **Web Services da Receita:**
   - Requer certificado digital
   - Autenticação complexa
   - Documentação limitada

2. **NFCe API (para nota fiscal):**
   - Não aplica para DCTF

3. **Sistemas terceiros:**
   - Algumas empresas oferecem integração via certificado
   - Exigem contrato/licenciamento

### Requisitos:
- ✅ Certificado Digital A1 (e-CPF ou e-CNPJ)
- ✅ Configuração de ambiente específico
- ✅ Desenvolvimento de integração customizada
- ⚠️ Pode violar termos de uso se não autorizado

### ⚠️ **Atenção:**
Usar certificado digital para automação pode violar os termos de uso da Receita Federal. **Consulte sempre um contador/advogado antes**.

---

## 🤖 **Opção 3: Web Scraping** (Não Recomendado)

### ⚠️ **NÃO RECOMENDADO**:
- ❌ Viola termos de uso da Receita
- ❌ Pode ser bloqueado
- ❌ Pode ter implicações legais
- ❌ Instável (muda com atualizações do site)

**NÃO implementaremos esta opção.**

---

## 💡 **Opção 4: Importação em Lote** (Prática)

### Como Funciona:

1. **No eCAC**, você pode exportar informações de pagamento (se disponível)
2. **No sistema**, importa um arquivo CSV/Excel com:
   - CNPJ
   - Período
   - Status de pagamento
   - Data do pagamento
   - Número do comprovante (opcional)

3. **Sistema atualiza automaticamente** todos os registros

### Vantagens:
- ✅ Atualização rápida em lote
- ✅ Histórico preservado
- ✅ Validação de dados antes de importar

---

## 🛠️ **Implementação Recomendada**

### 1. Adicionar Campo no Banco

```sql
-- Adicionar coluna na tabela dctf_declaracoes
ALTER TABLE dctf_declaracoes 
ADD COLUMN IF NOT EXISTS status_pagamento VARCHAR(20) DEFAULT 'pendente',
ADD COLUMN IF NOT EXISTS data_pagamento DATE,
ADD COLUMN IF NOT EXISTS comprovante_pagamento VARCHAR(255),
ADD COLUMN IF NOT EXISTS observacoes_pagamento TEXT;

-- Valores possíveis: 'pendente', 'pago', 'parcelado', 'cancelado', 'em_analise'
```

### 2. Interface no Sistema

**Funcionalidades:**
- ✅ Lista de débitos pendentes por cliente
- ✅ Filtros: CNPJ, período, valor
- ✅ Marcar como pago (individual ou em lote)
- ✅ Importar CSV com status de pagamento
- ✅ Relatório de pendências
- ✅ Histórico de atualizações

### 3. Fluxo de Trabalho

1. **Sistema identifica débitos pendentes** (saldoAPagar > 0)
2. **Usuário consulta no eCAC** para verificar pagamento
3. **Usuário marca como pago** no sistema
4. **Sistema atualiza** status e data do pagamento
5. **Relatórios** mostram apenas pendentes

---

## 📊 **Exemplo de Interface**

```
┌─────────────────────────────────────────────────────────────┐
│  Débitos DCTF - Verificação de Pagamento                   │
├─────────────────────────────────────────────────────────────┤
│  Filtros:                                                   │
│  [CNPJ: ______] [Período: ___/____] [Status: [Pendentes▼]] │
│  [Buscar] [Importar CSV] [Marcar Selecionados como Pago]   │
├─────────────────────────────────────────────────────────────┤
│  Cliente            │ Período │ Débito  │ Saldo   │ Status │
├─────────────────────┼─────────┼─────────┼─────────┼────────┤
│ ✓ Empresa A Ltda   │ 01/2024 │ R$ 1.500│ R$ 950  │ Pendente│
│ ✓ Empresa B S.A.   │ 02/2024 │ R$ 3.200│ R$ 0    │ Pago   │
│   Empresa C EIRELI │ 01/2024 │ R$ 800  │ R$ 800  │ Pendente│
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 **Próximos Passos**

1. **Decidir qual opção implementar** (recomendamos Opção 1)
2. **Adicionar campo no banco de dados**
3. **Criar serviço de gerenciamento de pagamento**
4. **Criar interface no frontend**
5. **Criar endpoint de API**
6. **Testar e validar**

---

## 📝 **Notas Importantes**

- ⚠️ **Sempre consulte um contador** antes de implementar automações com a Receita Federal
- ✅ **Mantenha histórico** de todas as atualizações
- ✅ **Valide dados** antes de marcar como pago
- ✅ **Audite regularmente** as pendências
- ✅ **Documente processos** de verificação

---

## 🔗 **Links Úteis**

- eCAC: https://cav.receita.fazenda.gov.br/
- Consulta Comprovante de Pagamento: https://cav.receita.fazenda.gov.br/autenticacao/login
- Documentação Receita Federal: https://www.gov.br/receitafederal/

---

**Precisa de ajuda?** Abra uma issue no repositório ou consulte um contador especializado.

