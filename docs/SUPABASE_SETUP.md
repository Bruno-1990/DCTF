# Configuração do Supabase

Este documento contém as instruções para configurar o Supabase para o projeto DCTF.

## 1. Criar Projeto no Supabase

1. Acesse [https://supabase.com](https://supabase.com)
2. Faça login ou crie uma conta
3. Clique em "New Project"
4. Preencha os dados:
   - **Name**: DCTF-MPC
   - **Database Password**: [senha segura]
   - **Region**: [escolha a região mais próxima]
5. Clique em "Create new project"

## 2. Obter Credenciais

Após a criação do projeto:

1. Vá para **Settings** > **API**
2. Copie as seguintes informações:
   - **Project URL** (SUPABASE_URL)
   - **Project API keys** > **anon public** (SUPABASE_ANON_KEY)
   - **Project API keys** > **service_role** (SUPABASE_SERVICE_ROLE_KEY)

## 3. Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com:

```env
# Configurações do Supabase
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua_chave_anon_aqui
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role_aqui

# Configurações da Aplicação
NODE_ENV=development
PORT=3000

# Configurações de Upload
MAX_FILE_SIZE=10485760
UPLOAD_DIR=uploads
```

## 4. Executar Schema do Banco

1. Acesse o **SQL Editor** no Supabase
2. Copie o conteúdo do arquivo `docs/database-schema.sql`
3. Cole no editor e execute

## 5. Testar Conexão

Execute o comando para testar a conexão:

```bash
npm run test:connection
```

## 6. Configurar RLS (Row Level Security)

Após criar as tabelas, configure as políticas de segurança:

1. Vá para **Authentication** > **Policies**
2. Para cada tabela, crie políticas de acesso
3. Exemplo de política para tabela `clientes`:

```sql
-- Habilitar RLS
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

-- Política para leitura
CREATE POLICY "Permitir leitura para usuários autenticados" ON clientes
    FOR SELECT USING (auth.role() = 'authenticated');

-- Política para inserção
CREATE POLICY "Permitir inserção para usuários autenticados" ON clientes
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Política para atualização
CREATE POLICY "Permitir atualização para usuários autenticados" ON clientes
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Política para exclusão
CREATE POLICY "Permitir exclusão para usuários autenticados" ON clientes
    FOR DELETE USING (auth.role() = 'authenticated');
```

## 7. Verificar Configuração

Após seguir todos os passos:

1. Execute `npm run test:connection`
2. Verifique se não há erros
3. Teste as operações CRUD básicas

## Troubleshooting

### Erro de Conexão
- Verifique se as URLs e chaves estão corretas
- Confirme se o projeto está ativo no Supabase
- Verifique se não há restrições de rede

### Erro de Permissão
- Verifique se as políticas RLS estão configuradas
- Confirme se está usando a chave correta (anon vs service_role)

### Erro de Schema
- Verifique se o schema foi executado completamente
- Confirme se todas as tabelas foram criadas
- Verifique os logs no Supabase para erros específicos
