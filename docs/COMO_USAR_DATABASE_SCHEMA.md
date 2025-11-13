# Como Usar o database-schema.sql

## 📋 O Que É Este Arquivo

O arquivo `docs/database-schema.sql` contém **TODA a estrutura SQL necessária** para criar o banco de dados completo no Supabase.

## ✅ O Que Este Arquivo Faz

Este script SQL cria:

1. **Todas as tabelas necessárias**:
   - `clientes` (com `cnpj_limpo` normalizado)
   - `dctf_declaracoes` (com todos os campos necessários)
   - `dctf_dados`
   - `analises`
   - `flags`
   - `relatorios`
   - `upload_history`
   - `dctf_codes`
   - `dctf_receita_codes`
   - `dctf_aliquotas`

2. **Todos os índices** para performance

3. **Todos os relacionamentos** (foreign keys)

4. **Triggers** para atualizar `updated_at` automaticamente

5. **Funções auxiliares** para validação e cálculos

## 🚀 Como Usar

### **Opção 1: Banco Novo (Recomendado)**

Se você está criando um banco **do zero**:

1. Acesse [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto
3. Vá em **SQL Editor**
4. Copie **TODO o conteúdo** de `docs/database-schema.sql`
5. Cole no editor
6. Clique em **Run** ou pressione `Ctrl+Enter`
7. ✅ Pronto! Todas as tabelas serão criadas

### **Opção 2: Banco Existente**

Se você já tem um banco com dados:

⚠️ **CUIDADO**: Este script usa `CREATE TABLE IF NOT EXISTS`, então:
- Tabelas que **já existem** não serão alteradas
- Tabelas **novas** serão criadas
- **Dados existentes não serão perdidos**

**Recomendação**: 
- Se você já tem dados, use as **migrações** em `docs/migrations/` em vez deste script
- Ou faça **backup** antes de executar

## 📝 Ordem de Execução Recomendada

Se você está configurando um banco novo:

1. ✅ **Primeiro**: Execute `docs/database-schema.sql` (cria toda estrutura)
2. ✅ **Segundo**: Execute `docs/dctf-constraints.sql` (adiciona constraints extras)
3. ✅ **Terceiro**: Execute `docs/dctf-performance-indexes.sql` (otimiza performance)
4. ✅ **Opcional**: Execute `docs/rls-policies.sql` (políticas de segurança)

## ⚠️ Importante: Normalização do CNPJ

O schema atual já está atualizado com:
- ✅ Coluna `cnpj_limpo` (14 dígitos, sem formatação)
- ✅ Coluna `razao_social` (obrigatória)
- ❌ **NÃO** tem coluna `cnpj` formatada (removida)

Se você já tem um banco com a coluna `cnpj` formatada:
- Execute `docs/migrations/001_normalize_cnpj_column.sql` primeiro
- Depois execute este schema (ou apenas as partes que faltam)

## 🔍 Verificação Pós-Execução

Após executar o script, verifique:

```sql
-- Ver todas as tabelas criadas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Ver estrutura da tabela clientes
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'clientes'
ORDER BY ordinal_position;

-- Verificar se cnpj_limpo existe
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'clientes' AND column_name = 'cnpj_limpo';
```

## 📊 Tabelas Criadas

| Tabela | Descrição | Status |
|--------|-----------|--------|
| `clientes` | Dados dos clientes | ✅ Criada |
| `dctf_declaracoes` | Declarações DCTF | ✅ Criada |
| `dctf_dados` | Dados processados | ✅ Criada |
| `analises` | Análises realizadas | ✅ Criada |
| `flags` | Sinalizações de problemas | ✅ Criada |
| `relatorios` | Relatórios gerados | ✅ Criada |
| `upload_history` | Histórico de uploads | ✅ Criada |
| `dctf_codes` | Códigos DCTF válidos | ✅ Criada |
| `dctf_receita_codes` | Códigos de receita | ✅ Criada |
| `dctf_aliquotas` | Alíquotas por período | ✅ Criada |

## 🐛 Problemas Comuns

### **"relation already exists"**

**Causa**: A tabela já existe no banco.

**Solução**: 
- O script usa `IF NOT EXISTS`, então é seguro executar novamente
- Se quiser recriar, delete a tabela primeiro: `DROP TABLE IF EXISTS nome_tabela CASCADE;`

### **"column already exists"**

**Causa**: A coluna já existe na tabela.

**Solução**: 
- O script não tenta criar colunas, apenas tabelas
- Se precisar adicionar colunas, use uma migração

### **"permission denied"**

**Causa**: Você não tem permissão para criar tabelas.

**Solução**: 
- Use uma conta com permissões de administrador
- Ou execute via Supabase Dashboard (que tem permissões)

## ✅ Próximos Passos

Após executar o schema:

1. ✅ Verifique se todas as tabelas foram criadas
2. ✅ Configure as variáveis de ambiente (`SUPABASE_URL`, etc)
3. ✅ Reinicie o servidor backend
4. ✅ Teste criando um cliente via interface
5. ✅ Verifique os logs para confirmar uso do Supabase

## 📚 Documentação Relacionada

- `docs/ARQUITETURA_BANCO_DADOS.md` - Explicação completa da arquitetura
- `docs/NORMALIZACAO_CNPJ.md` - Detalhes sobre normalização do CNPJ
- `docs/migrations/README.md` - Como aplicar migrações

