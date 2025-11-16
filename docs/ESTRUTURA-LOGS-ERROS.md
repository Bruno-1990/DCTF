# 📋 Estrutura de Logs de Erros - Receita Federal

## 🎯 Objetivo

Armazenar logs detalhados de erros ocorridos durante consultas em lote à API da Receita Federal, facilitando:
- **Diagnóstico**: Identificar CNPJs que falharam e motivos
- **Análise**: Relatórios de erros por tipo, período, CNPJ
- **Reprocessamento**: Rastrear e reprocessar erros específicos
- **Monitoramento**: Acompanhar taxa de erros e padrões

## 🗄️ Solução Implementada

### Tabela: `receita_erros_consulta`

Nova tabela dedicada para logs de erros, separada da tabela `receita_sincronizacoes` para:
- ✅ **Consultas mais rápidas**: Índices específicos para análise de erros
- ✅ **Estrutura otimizada**: Campos específicos para classificação e reprocessamento
- ✅ **Histórico completo**: Rastreamento de erros por CNPJ ao longo do tempo
- ✅ **Relatórios facilitados**: Agregações e estatísticas mais simples

### Estrutura da Tabela

```sql
CREATE TABLE receita_erros_consulta (
  id UUID PRIMARY KEY,
  
  -- Relacionamento
  sincronizacao_id UUID REFERENCES receita_sincronizacoes(id),
  
  -- CNPJ que causou o erro
  cnpj_contribuinte VARCHAR(14) NOT NULL,
  
  -- Período consultado
  periodo_inicial DATE,
  periodo_final DATE,
  
  -- Tipo de consulta
  tipo_consulta VARCHAR(50) CHECK (
    tipo_consulta IN ('consulta_simples', 'consulta_lote', 'sincronizacao_cliente', 'sincronizacao_todos')
  ),
  
  -- Classificação do erro
  tipo_erro VARCHAR(50) CHECK (
    tipo_erro IN (
      'erro_api',              -- Erro na API da Receita Federal
      'erro_autenticacao',     -- Erro de autenticação/token
      'erro_rate_limit',       -- Rate limiting atingido
      'erro_validacao',        -- Erro de validação (CNPJ inválido, etc)
      'erro_banco_dados',      -- Erro ao salvar no banco
      'erro_rede',             -- Erro de rede/timeout
      'erro_desconhecido'      -- Erro não categorizado
    )
  ),
  
  -- Detalhes do erro
  mensagem_erro TEXT NOT NULL,
  detalhes_erro JSONB,         -- Stack trace, response HTTP, etc.
  codigo_http INTEGER,
  status_http VARCHAR(50),
  
  -- Dados para reprocessamento
  dados_requisicao JSONB,
  
  -- Timestamps
  ocorrido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Controle de reprocessamento
  reprocessado BOOLEAN DEFAULT false,
  reprocessado_em TIMESTAMPTZ,
  reprocessado_sincronizacao_id UUID REFERENCES receita_sincronizacoes(id),
  
  -- Observações
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## 🔍 Índices Criados

Para otimizar consultas comuns:

```sql
-- Busca por sincronização
idx_receita_erros_sincronizacao

-- Busca por CNPJ
idx_receita_erros_cnpj

-- Análise por tipo de erro
idx_receita_erros_tipo_erro

-- Análise temporal
idx_receita_erros_ocorrido

-- Busca de erros não reprocessados
idx_receita_erros_reprocessado

-- Análise combinada (CNPJ + tipo + data)
idx_receita_erros_cnpj_tipo
```

## 📊 Vantagens desta Abordagem

### 1. **Separação de Responsabilidades**
- `receita_sincronizacoes`: Resumo geral da execução
- `receita_erros_consulta`: Detalhes específicos de cada erro

### 2. **Consultas Mais Eficientes**
```sql
-- Buscar todos os erros de um CNPJ específico
SELECT * FROM receita_erros_consulta 
WHERE cnpj_contribuinte = '12345678000190'
ORDER BY ocorrido_em DESC;

-- Erros por tipo
SELECT tipo_erro, COUNT(*) 
FROM receita_erros_consulta 
GROUP BY tipo_erro;

-- CNPJs com mais erros
SELECT cnpj_contribuinte, COUNT(*) as total_erros
FROM receita_erros_consulta
WHERE reprocessado = false
GROUP BY cnpj_contribuinte
ORDER BY total_erros DESC;
```

### 3. **Facilita Reprocessamento**
- Campo `reprocessado` para rastrear tentativas
- Campo `dados_requisicao` com parâmetros originais
- Link com sincronização de reprocessamento

### 4. **Análise e Relatórios**
- Estatísticas por tipo de erro
- Tendências temporais
- CNPJs problemáticos
- Taxa de sucesso/reprocessamento

## 🔄 Fluxo de Uso

### 1. Durante Consulta em Lote

```typescript
try {
  // Consultar CNPJ
  const pagamentos = await receitaService.consultarPagamentos(cnpj, ...);
} catch (error) {
  // Registrar erro automaticamente
  await erroConsultaModel.registrarErro({
    sincronizacao_id: sincronizacaoId,
    cnpj_contribuinte: cnpj,
    tipo_consulta: 'consulta_lote',
    tipo_erro: classificarTipoErro(error),
    mensagem_erro: error.message,
    detalhes_erro: extrairDetalhesErro(error),
    dados_requisicao: { cnpj, periodoInicial, periodoFinal },
  });
}
```

### 2. Análise de Erros

```typescript
// Buscar erros não reprocessados
const errosNaoReprocessados = await erroConsultaModel.buscarNaoReprocessados();

// Estatísticas
const estatisticas = await erroConsultaModel.obterEstatisticas();
// Retorna: { totalErros, porTipoErro, porCNPJ, naoReprocessados }
```

### 3. Reprocessamento

```typescript
// Marcar erro como reprocessado após sucesso
await erroConsultaModel.marcarComoReprocessado(erroId, novaSincronizacaoId);
```

## 🆚 Alternativa Considerada (Não Implementada)

### Opção: Usar apenas `receita_sincronizacoes.erros JSONB`

**Desvantagens:**
- ❌ Consultas complexas em JSONB são mais lentas
- ❌ Dificulta análise por CNPJ específico
- ❌ Não permite índices eficientes
- ❌ Mistura resumo com detalhes

**Por isso escolhemos**: Tabela dedicada com estrutura normalizada

## 📝 Próximos Passos Sugeridos

1. **Interface de Visualização**: Criar página para visualizar erros
2. **Reprocessamento Manual**: Permiti reprocessar CNPJs específicos
3. **Alertas**: Notificar sobre CNPJs com muitos erros
4. **Dashboard**: Gráficos de taxa de erro por tipo/período

---

**Nota**: A migração `005_create_receita_erros_consulta.sql` deve ser aplicada no banco antes de usar esta funcionalidade.

