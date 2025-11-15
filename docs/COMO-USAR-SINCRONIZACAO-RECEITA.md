# 🚀 Como Usar a Sincronização com Receita Federal

## 📋 Visão Geral

Esta funcionalidade permite **sincronizar automaticamente** o status de pagamento de débitos DCTF consultando diretamente a API da Receita Federal.

## ⚙️ Configuração Inicial

### 1. Configurar Variáveis de Ambiente

No arquivo `.env` da raiz do projeto:

```env
# URL base da API da Receita Federal
RECEITA_API_URL=https://sua-url-da-receita.gov.br

# Token de acesso (se necessário)
RECEITA_API_TOKEN=seu_token_aqui

# Endpoint específico (ajustar conforme necessário)
RECEITA_API_ENDPOINT=/api/v1/PAGTOWEB/PAGAMENTOS71/consultar
```

### 2. Ajustar Endpoint da API

Edite `src/services/ReceitaFederalService.ts` e ajuste:
- A URL base (`RECEITA_API_URL`)
- O endpoint específico (`RECEITA_API_ENDPOINT`)
- O formato da requisição (se necessário)

**Baseado na sua requisição**, parece que você já tem:
- `idSistema`: `PAGTOWEB`
- `idServico`: `PAGAMENTOS71`
- `versaoSistema`: `1.0`

## 🎯 Como Usar

### Opção 1: Sincronizar um Cliente Específico

**Endpoint:**
```
POST /api/pagamentos/sincronizar/cliente
```

**Body:**
```json
{
  "cnpj": "32401481000133",
  "periodoInicial": "2025-05-01",
  "periodoFinal": "2025-11-30"
}
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "totalConsultados": 5,
    "totalEncontrados": 3,
    "totalAtualizados": 3,
    "totalErros": 0,
    "detalhes": [
      {
        "dctfId": "uuid",
        "cnpj": "32401481000133",
        "periodo": "2025-09",
        "status": "atualizado",
        "mensagem": "Status atualizado para: pago"
      }
    ]
  }
}
```

### Opção 2: Sincronizar Todos os Clientes

**Endpoint:**
```
POST /api/pagamentos/sincronizar/todos
```

**Body:**
```json
{
  "limiteClientes": 10,
  "periodoInicial": "2025-05-01",
  "periodoFinal": "2025-11-30"
}
```

**⚠️ Atenção**: Por padrão, limita a 10 clientes para evitar sobrecarga. Ajuste `limiteClientes` conforme necessário.

### Opção 3: Sincronizar um Débito Específico

**Endpoint:**
```
POST /api/pagamentos/sincronizar/debito/{id-do-dctf}
```

## 🔄 Como Funciona

1. **Busca débitos pendentes** no nosso sistema
2. **Para cada CNPJ**, faz requisição na API da Receita Federal
3. **Compara dados**:
   - CNPJ deve coincidir
   - Período deve corresponder
   - Valores devem ser aproximados (tolerância de 10%)
4. **Atualiza status automaticamente**:
   - Se `valorSaldoDocumento = 0` → marca como `pago`
   - Se `valorSaldoDocumento > 0` → marca como `parcelado`
   - Adiciona número do documento como comprovante
   - Adiciona data de arrecadação como data de pagamento

## 📊 Exemplo de Uso via cURL

```bash
# Sincronizar um cliente
curl -X POST http://localhost:3000/api/pagamentos/sincronizar/cliente \
  -H "Content-Type: application/json" \
  -d '{
    "cnpj": "32401481000133",
    "periodoInicial": "2025-05-01",
    "periodoFinal": "2025-11-30"
  }'

# Sincronizar um débito específico
curl -X POST http://localhost:3000/api/pagamentos/sincronizar/debito/uuid-do-dctf
```

## 🎯 Mapeamento de Dados

Os dados da Receita são mapeados assim:

| Campo Receita | Campo Nosso Sistema | Exemplo |
|---------------|---------------------|---------|
| `numeroDocumento` | `comprovantePagamento` | `"7202528359025462"` |
| `competencia` | `periodo` | `"2025-09"` |
| `dataArrecadacao` | `dataPagamento` | `"2025-10-20"` |
| `valorSaldoDocumento = 0` | `statusPagamento` | `"pago"` |
| `valorSaldoDocumento > 0` | `statusPagamento` | `"parcelado"` ou `"pendente"` |
| `tipoDocumento` | `observacoesPagamento` | Informação sobre tipo |

## ⚠️ Requisitos Importantes

1. **Autenticação**: Você precisa ter:
   - Token de acesso configurado, OU
   - Certificado digital configurado
   - Credenciais válidas da Receita

2. **Endpoint Correto**: Ajuste `RECEITA_API_ENDPOINT` conforme o endpoint real que você usa

3. **Formato da Requisição**: Se o formato for diferente, ajuste em `ReceitaFederalService.ts`

## 🔍 Debug

Se houver erros, verifique:

1. **Logs do backend** - verificar erros de requisição
2. **Resposta da Receita** - pode ter estrutura diferente
3. **Autenticação** - token/certificado válidos?
4. **Endpoint** - URL está correta?

## 💡 Próximos Passos

1. **Testar com um cliente**: Use a opção 1 primeiro
2. **Verificar resultados**: Cheque se os dados foram atualizados
3. **Ajustar mapeamento**: Se os dados não baterem, ajuste a lógica de matching
4. **Automatizar**: Criar job que roda periodicamente (opcional)

---

**Precisa de ajuda?** Verifique:
- `docs/CONFIGURACAO-RECEITA-API.md` - Configuração detalhada
- `docs/API-PAGAMENTOS.md` - Documentação da API
- `docs/VERIFICACAO-PAGAMENTO-DCTF.md` - Visão geral

