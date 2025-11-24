# Relatório de Comparação de Schemas: Supabase vs MySQL

## 📊 Resumo Executivo

Este documento compara o schema real do Supabase com o schema MySQL criado para garantir que sejam espelhos idênticos.

## ✅ Tabelas Principais (Espelhadas Corretamente)

### 1. `clientes`
**Supabase:**
- id (UUID)
- razao_social (VARCHAR)
- cnpj_limpo (VARCHAR(14))
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

**MySQL:**
- ✅ Todas as colunas do Supabase presentes
- ⚠️ Colunas extras (mantidas para integração com Export):
  - email (varchar(255))
  - telefone (varchar(20))
  - endereco (text)
  - cod_emp (int)

**Status:** ✅ Compatível (colunas extras são aceitáveis)

### 2. `dctf_declaracoes`
**Supabase (Estrutura Real):**
- id (UUID)
- cliente_id (UUID)
- cnpj (VARCHAR)
- periodo_apuracao (VARCHAR)
- data_transmissao (TIMESTAMP)
- hora_transmissao (VARCHAR)
- situacao (VARCHAR)
- tipo_ni (VARCHAR)
- categoria (VARCHAR)
- origem (VARCHAR)
- tipo (VARCHAR) ⚠️ **FALTANDO NO MYSQL**
- debito_apurado (DECIMAL)
- saldo_a_pagar (DECIMAL)
- metadados (TEXT) ⚠️ **FALTANDO NO MYSQL**
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

**MySQL:**
- ✅ Colunas do Supabase presentes (após correção)
- ⚠️ Colunas extras (não existem no Supabase real):
  - periodo (varchar(7))
  - data_declaracao (date)
  - status (varchar(20))
  - numero_identificacao (varchar(20))
  - tipo_declaracao (varchar(50))
  - arquivo_original (varchar(500))
  - arquivo_processado (varchar(500))
  - total_registros (int)
  - observacoes (text)

**Status:** ⚠️ **PRECISA AJUSTE** - Colunas `tipo` e `metadados` foram adicionadas, mas colunas extras podem causar problemas.

## 🔧 Ações Necessárias

### 1. ✅ CONCLUÍDO: Adicionar colunas faltantes
- [x] Adicionar coluna `metadados` (TEXT)
- [x] Adicionar coluna `tipo` (VARCHAR(20))
- [x] Criar índice para `tipo`

### 2. ⚠️ RECOMENDADO: Remover ou marcar colunas extras
As seguintes colunas existem no MySQL mas NÃO no Supabase:
- `periodo` - Não existe no Supabase (apenas `periodo_apuracao`)
- `data_declaracao` - Não existe no Supabase
- `status` - Não existe no Supabase
- `numero_identificacao` - Não existe no Supabase
- `tipo_declaracao` - Não existe no Supabase
- `arquivo_original` - Não existe no Supabase
- `arquivo_processado` - Não existe no Supabase
- `total_registros` - Não existe no Supabase
- `observacoes` - Não existe no Supabase

**Decisão necessária:**
- **Opção A:** Remover essas colunas para ser 100% espelho
- **Opção B:** Manter como colunas opcionais (não serão populadas do Supabase)

### 3. 📋 Tabelas que existem no MySQL mas não no Supabase
Estas tabelas foram criadas baseadas no arquivo `database-schema.sql`, mas não existem no Supabase real:
- `analises`
- `dctf_aliquotas`
- `dctf_codes`
- `dctf_dados`
- `dctf_receita_codes`
- `flags`
- `relatorios`

**Decisão necessária:**
- Se essas tabelas não existem no Supabase, elas não serão populadas na migração
- Podem ser mantidas para uso futuro ou removidas

## 🎯 Recomendações

1. **Para ser 100% espelho do Supabase:**
   - Remover colunas extras de `dctf_declaracoes` que não existem no Supabase
   - Remover ou manter vazias as tabelas que não existem no Supabase

2. **Para manter compatibilidade com Export:**
   - Manter colunas extras em `clientes` (email, telefone, endereco, cod_emp)
   - Manter colunas extras em `dctf_declaracoes` como opcionais

3. **Script de migração:**
   - ✅ Atualizado para usar apenas campos do Supabase real
   - ✅ Inclui `metadados` e `tipo`

## 📝 Próximos Passos

1. Decidir se quer remover colunas extras ou mantê-las
2. Executar migração completa com estrutura corrigida
3. Validar que todos os dados foram migrados corretamente





