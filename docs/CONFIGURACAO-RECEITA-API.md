# 🔧 Configuração da API da Receita Federal

## 📋 Pré-requisitos

Para usar a integração com a API da Receita Federal, você precisa:

1. **Acesso à API da Receita Federal**
   - Verificar documentação oficial
   - Obter credenciais/token de acesso
   - Entender endpoints disponíveis

2. **Autenticação**
   - Token de acesso (OAuth)
   - Ou Certificado Digital A1/A3
   - Ou credenciais específicas

## 🔑 Variáveis de Ambiente

Adicione no seu arquivo `.env`:

```env
# URL do servidor de autenticação (obter token)
RECEITA_AUTH_URL=https://auth-token-server-production-ce0e.up.railway.app
RECEITA_AUTH_ENDPOINT=/serpro/token

# URL base da API da Receita Federal (SERPRO)
RECEITA_API_URL=https://gateway.apiserpro.serpro.gov.br

# Endpoint específico da API SERPRO
RECEITA_API_ENDPOINT=/integra-contador/v1/Consultar

# CNPJs fixos para contratante e autor do pedido (opcional - se não informado, usa o mesmo do contribuinte)
RECEITA_CNPJ_CONTRATANTE=32401481000133
RECEITA_CNPJ_AUTOR_PEDIDO=32401481000133

# Token de acesso manual (opcional - se não usar obterToken automático)
RECEITA_API_TOKEN=seu_token_aqui

# Certificado Digital (se necessário)
RECEITA_CERT_PATH=/caminho/para/certificado.pfx
RECEITA_CERT_PASSWORD=sua_senha_certificado

# Configurações adicionais
RECEITA_ID_SISTEMA=PAGTOWEB
RECEITA_ID_SERVICO=PAGAMENTOS71
RECEITA_VERSAO_SISTEMA=1.0
RECEITA_TAMANHO_PAGINA=100
RECEITA_API_TIMEOUT=60000
RECEITA_USE_JWT=false
```

### ⚠️ Importante sobre CNPJs

- **`RECEITA_CNPJ_CONTRATANTE`**: CNPJ do contratante (fixo). Se não informado, usa o mesmo do contribuinte iterado.
- **`RECEITA_CNPJ_AUTOR_PEDIDO`**: CNPJ do autor do pedido (fixo). Se não informado, usa o mesmo do contribuinte iterado.
- **CNPJ do Contribuinte**: O CNPJ que é iterado (da tabela de clientes) é usado **APENAS** no campo `contribuinte` da requisição.

## 📝 Configuração do Endpoint

### Endpoint Atual (API SERPRO):
- **URL Base**: `https://gateway.apiserpro.serpro.gov.br`
- **Endpoint**: `/integra-contador/v1/Consultar`
- **Método**: `POST`
- **Serviço**: `PAGAMENTOS71`
- **Sistema**: `PAGTOWEB`

### Estrutura da Requisição:

```json
{
  "contratante": {
    "numero": "32401481000133",  // CNPJ fixo (via RECEITA_CNPJ_CONTRATANTE)
    "tipo": 2
  },
  "autorPedidoDados": {
    "numero": "32401481000133",  // CNPJ fixo (via RECEITA_CNPJ_AUTOR_PEDIDO)
    "tipo": 2
  },
  "contribuinte": {
    "numero": "{cnpj_iterado}",  // CNPJ variável (iterado da tabela clientes)
    "tipo": 2
  },
  "pedidoDados": {
    "idSistema": "PAGTOWEB",
    "idServico": "PAGAMENTOS71",
    "dados": "{string_json_com_datas_e_filtros}"
  }
}
```

**Nota**: O campo `dados` dentro de `pedidoDados` deve ser uma **string JSON**, não um objeto.

## 🧪 Testando a Integração

### 1. Testar Requisição Manual

```bash
POST /api/pagamentos/sincronizar/cliente
Content-Type: application/json

{
  "cnpj": "32401481000133",
  "periodoInicial": "2025-05-01",
  "periodoFinal": "2025-11-30"
}
```

### 2. Testar Sincronização de um Débito

```bash
POST /api/pagamentos/sincronizar/debito/{id-do-dctf}
```

### 3. Testar Sincronização de Todos (limitado)

```bash
POST /api/pagamentos/sincronizar/todos
Content-Type: application/json

{
  "limiteClientes": 5,
  "periodoInicial": "2025-05-01",
  "periodoFinal": "2025-11-30"
}
```

## 🔍 Ajustes Necessários

### 1. Endpoint da API

Ajuste a URL base e o endpoint conforme a documentação oficial:

```typescript
// src/services/ReceitaFederalService.ts

constructor() {
  // Ajustar para URL real da API
  this.baseURL = process.env['RECEITA_API_URL'] || 'https://api.receita.fazenda.gov.br';
}

async consultarPagamentos(...) {
  // Ajustar endpoint conforme documentação
  const response = await this.client.post(
    '/v1/pagamentos/consultar', // ⚠️ AJUSTAR
    request
  );
}
```

### 2. Estrutura da Requisição

Ajuste a estrutura da requisição conforme o formato real esperado pela API:

```typescript
const request: ReceitaPagamentoRequest = {
  contratante: {
    numero: cnpjContratante,  // CNPJ fixo (via variável de ambiente)
    tipo: 2,
  },
  autorPedidoDados: {
    numero: cnpjAutorPedido,  // CNPJ fixo (via variável de ambiente)
    tipo: 2,
  },
  contribuinte: {
    numero: cnpjContribuinte,  // CNPJ variável (iterado)
    tipo: 2,
  },
  pedidoDados: {
    idSistema: "PAGTOWEB",
    idServico: "PAGAMENTOS71",
    dados: dadosString,  // String JSON com filtros e datas
  },
};
```

### 3. Autenticação

Implemente autenticação conforme o tipo usado pela API:

**Se for token:**
```typescript
this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
```

**Se for certificado:**
```typescript
// Configurar certificado SSL
const httpsAgent = new https.Agent({
  cert: fs.readFileSync(certPath),
  key: fs.readFileSync(keyPath),
  passphrase: password
});
```

### 4. Tratamento de Resposta

Ajuste o tratamento da resposta conforme o formato real:

```typescript
// Ajustar conforme estrutura real da resposta
if (response.data.status !== 200) {
  // Tratar erro
}
```

## 📊 Mapeamento de Dados

O sistema mapeia os dados da Receita para nosso formato:

| Receita Federal | Nosso Sistema |
|----------------|---------------|
| `numeroDocumento` | `comprovantePagamento` |
| `periodoApuracao` / `competencia` | `periodo` (YYYY-MM) |
| `dataArrecadacao` | `dataPagamento` |
| `valorSaldoDocumento = 0` | `statusPagamento = "pago"` |
| `valorSaldoDocumento > 0` | `statusPagamento = "parcelado"` ou `"pendente"` |

## 🔄 Fluxo de Sincronização

1. **Buscar débitos pendentes** no nosso sistema
2. **Para cada CNPJ**, fazer requisição na API da Receita
3. **Comparar dados**:
   - CNPJ deve coincidir
   - Período deve corresponder
   - Valores devem ser aproximados (tolerância de 10%)
4. **Atualizar status** automaticamente

## ⚠️ Limitações e Cuidados

1. **Rate Limiting**: A API da Receita pode ter limites de requisições
2. **Autenticação**: Pode expirar, precisa renovar
3. **Dados Sensíveis**: Tratar com segurança (certificados, tokens)
4. **Termos de Uso**: Verificar se automação é permitida
5. **Erros**: Implementar retry e tratamento robusto de erros

## 🚀 Próximos Passos

1. **Obter credenciais** da Receita Federal
2. **Configurar variáveis de ambiente**
3. **Ajustar endpoints** conforme documentação oficial
4. **Testar com dados reais**
5. **Implementar job automatizado** (opcional)

---

**Nota**: Consulte sempre a documentação oficial da Receita Federal e um contador/advogado antes de implementar automações com órgãos públicos.

