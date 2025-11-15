# 🔗 Integração com API da Receita Federal - Verificação de Pagamentos

## 📋 Visão Geral

Este documento explica como integrar o sistema com a API da Receita Federal para verificar automaticamente o status de pagamento de débitos DCTF.

## 🎯 Objetivo

Automatizar a verificação de pagamentos consultando diretamente a API da Receita Federal, eliminando a necessidade de verificação manual no eCAC.

## 📊 Estrutura dos Dados da Receita

Com base na resposta da API da Receita, temos os seguintes dados:

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
  "sequencial": "1",
  "codigoReceitaLinha": "1001",
  "descricaoReceitaLinha": "IRPJ - Simples Nacional",
  "valorLinha": 1359.18,
  "valorSaldoLinha": 0
}
```

### Campos Importantes:

- **`numeroDocumento`**: Número do documento de arrecadação (usado como comprovante)
- **`periodoApuracao`**: Período de apuração (usado para matching com DCTF)
- **`competencia`**: Competência no formato YYYY-MM
- **`valorSaldoDocumento`**: Se = 0, o documento foi pago completamente
- **`valorSaldoLinha`**: Saldo pendente por linha (se houver parcelamento)
- **`dataArrecadacao`**: Data em que o pagamento foi arrecadado
- **`dataVencimento`**: Data de vencimento do documento

## 🔑 Chaves para Matching

Para relacionar dados da Receita com nossas DCTFs:

1. **CNPJ** (`contratante.numero`)
2. **Período de Apuração** (`periodoApuracao` ou `competencia`)
3. **Valor** (aproximado, para validação)

## 🛠️ Implementação

### 1. Serviço de Integração com Receita

Criar serviço que:
- Faz requisição para API da Receita Federal
- Autentica usando certificado digital ou token
- Processa resposta e mapeia para nosso formato
- Atualiza status de pagamento automaticamente

### 2. Endpoint de Sincronização

Criar endpoint que:
- Recebe CNPJ e período
- Consulta API da Receita
- Atualiza status de pagamento das DCTFs correspondentes
- Retorna resumo das atualizações

### 3. Job Automatizado (Opcional)

Criar job que:
- Roda periodicamente (ex: diariamente)
- Consulta todos os débitos pendentes
- Atualiza status de pagamento automaticamente

## 📝 Requisitos de Autenticação

**IMPORTANTE**: A API da Receita Federal geralmente requer:

1. **Certificado Digital A1 ou A3** (e-CPF ou e-CNPJ)
2. **Token de Acesso** (se usar OAuth)
3. **Credenciais específicas** (variam conforme serviço)

⚠️ **Atenção**: Verifique os termos de uso e documentação oficial da Receita antes de implementar.

## 🔄 Fluxo de Sincronização

1. **Identificar débitos pendentes** no nosso sistema
2. **Para cada cliente/período**, fazer requisição na API da Receita
3. **Comparar dados**:
   - CNPJ deve coincidir
   - Período deve corresponder
   - Valores devem ser aproximados (tolerância de pequenas diferenças)
4. **Atualizar status**:
   - Se `valorSaldoDocumento = 0` → marcar como `pago`
   - Se `valorSaldoDocumento > 0` → marcar como `parcelado` ou manter `pendente`
   - Adicionar `numeroDocumento` como `comprovantePagamento`
   - Adicionar `dataArrecadacao` como `dataPagamento`

## 💡 Próximos Passos

1. **Configurar autenticação** com a Receita
2. **Criar serviço** de integração
3. **Implementar endpoint** de sincronização
4. **Testar com dados reais**
5. **Criar job automatizado** (opcional)

---

**Nota**: Esta integração deve seguir rigorosamente os termos de uso e políticas da Receita Federal. Consulte sempre um contador ou advogado antes de implementar automações com órgãos públicos.

