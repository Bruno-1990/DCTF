# 📝 Exemplo de Requisição para API da Receita Federal

## 🔗 Estrutura da Requisição

Baseado na requisição que você fez, aqui está a estrutura completa:

### Endpoint
```
POST https://[URL_DA_API_RECEITA]/[ENDPOINT]
```

### Headers
```json
{
  "Content-Type": "application/json",
  "Accept": "application/json",
  "Authorization": "Bearer [TOKEN]" // Se necessário
}
```

### Payload da Requisição
```json
{
  "contratante": {
    "numero": "32401481000133",
    "tipo": 2
  },
  "autorPedidoDados": {
    "numero": "32401481000133",
    "tipo": 2
  },
  "contribuinte": {
    "numero": "32401481000133",
    "tipo": 2
  },
  "pedidoDados": {
    "idSistema": "PAGTOWEB",
    "idServico": "PAGAMENTOS71",
    "versaoSistema": "1.0",
    "dados": {
      "intervaloDataArrecadacao": {
        "dataInicial": "2025-05-01",
        "dataFinal": "2025-11-30"
      },
      "primeiroDaPagina": 0,
      "tamanhoDaPagina": 100
    }
  }
}
```

### Resposta de Sucesso
```json
{
  "status": 200,
  "responseId": "527d96ed-91fc-4a8f-ba20-a5cfe2bf0345",
  "responseDateTime": "2025-11-15T15:06:06.953Z",
  "dados": "[...string JSON ou array...]",
  "mensagens": [
    {
      "codigo": "Sucesso-PAGTOWEB-00000",
      "texto": "Requisição efetuada com sucesso."
    }
  ]
}
```

## 🔧 Configuração no Sistema

### Variáveis de Ambiente (.env)

```env
# URL do servidor de autenticação (obter token)
RECEITA_AUTH_URL=https://auth-token-server-production-ce0e.up.railway.app
RECEITA_AUTH_ENDPOINT=/serpro/token

# URL base da API da Receita Federal
RECEITA_API_URL=https://api.receita.fazenda.gov.br

# Endpoint específico da API
RECEITA_API_ENDPOINT=/api/v1/PAGTOWEB/PAGAMENTOS71/consultar

# Identificação do sistema
RECEITA_ID_SISTEMA=PAGTOWEB
RECEITA_ID_SERVICO=PAGAMENTOS71
RECEITA_VERSAO_SISTEMA=1.0

# Token de acesso manual (opcional - se não usar obterToken automático)
RECEITA_API_TOKEN=seu_token_aqui

# Configurações
RECEITA_TAMANHO_PAGINA=100
RECEITA_API_TIMEOUT=60000
RECEITA_USE_JWT=false
```

### Fluxo de Autenticação

O sistema **automaticamente** obtém o token de acesso antes de fazer requisições:

1. **Primeira requisição**: Busca token no servidor de autenticação
2. **Cache do token**: Armazena token em memória com expiração
3. **Reutilização**: Usa token em cache enquanto válido
4. **Renovação automática**: Obtém novo token quando expira

## 📋 Estrutura dos Dados Retornados

Cada item retornado tem a seguinte estrutura:

```json
{
  "numeroDocumento": "7202528359025462",
  "tipoDocumento": "DOCUMENTO DE ARRECADAÇÃO DO SIMPLES NACIONAL",
  "periodoApuracao": "2025-09-01",
  "competencia": "2025-09",
  "dataArrecadacao": "2025-10-20",
  "dataVencimento": "2025-10-20",
  "codigoReceitaDoc": "3333",
  "valorDocumento": 22596.42,
  "valorSaldoDocumento": 0,
  "valorPrincipal": 22596.42,
  "valorSaldoPrincipal": 0,
  "sequencial": "1",
  "codigoReceitaLinha": "1001",
  "descricaoReceitaLinha": "IRPJ - Simples Nacional",
  "periodoApuracaoLinha": "2025-09-01",
  "dataVencimentoLinha": "2025-10-20",
  "valorLinha": 1359.18,
  "valorPrincipalLinha": 1359.18,
  "valorSaldoLinha": 0
}
```

## 🚀 Como Usar

### 1. Configurar Variáveis de Ambiente

Edite o arquivo `.env` na raiz do projeto e adicione as variáveis necessárias.

### 2. Configurar Autenticação (se necessário)

```typescript
const receitaService = new ReceitaFederalService();

// Se usar token
receitaService.setAccessToken(process.env['RECEITA_API_TOKEN']);

// Se usar certificado digital
// receitaService.configureCertificate(certPath, keyPath);
```

### 3. Fazer Requisição

```typescript
try {
  const pagamentos = await receitaService.consultarPagamentos(
    '32401481000133', // CNPJ
    '2025-05-01',    // Data inicial (opcional)
    '2025-11-30',    // Data final (opcional)
    '2025-09'        // Período de apuração (opcional)
  );

  console.log(`Encontrados ${pagamentos.length} pagamentos`);
} catch (error) {
  console.error('Erro:', error.message);
}
```

## ⚠️ Importante

1. **Endpoint Real**: Ajuste `RECEITA_API_ENDPOINT` conforme a URL real da API que você usa
2. **Autenticação**: Verifique se precisa de token, certificado digital ou outros métodos
3. **Formato de Resposta**: A resposta pode vir como string JSON no campo `dados` - o sistema trata automaticamente
4. **Rate Limiting**: A API pode ter limites de requisições - implemente delays se necessário
5. **Erros**: Sempre trate erros e verifique mensagens da API

## 🔍 Debug

O serviço inclui logs detalhados para debug. Verifique o console para:
- URL e endpoint utilizados
- Payload enviado
- Status da resposta
- Estrutura dos dados retornados
- Erros detalhados

---

**Nota**: Consulte sempre a documentação oficial da Receita Federal para garantir que está usando a API corretamente.

