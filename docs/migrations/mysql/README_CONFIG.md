# Configuração para Migração Supabase → MySQL DCTF_WEB

Este documento explica como configurar as credenciais para migrar dados do Supabase para o MySQL DCTF_WEB.

## 📋 Configuração

### Opção 1: Usando arquivo .env (Recomendado)

1. **Crie um arquivo `.env` na raiz do projeto DCTF_MPC**

   Na pasta: `C:\Users\bruno\Desktop\DCTF WEB\DCTF_MPC`

2. **Adicione as seguintes variáveis de ambiente:**

   ```env
   # Supabase (origem)
   SUPABASE_URL=https://seu-projeto.supabase.co
   SUPABASE_ANON_KEY=sua-chave-anon-key
   SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role-key

   # MySQL DCTF_WEB (destino)
   MYSQL_HOST=localhost
   MYSQL_PORT=3306
   MYSQL_USER=root
   MYSQL_PASSWORD=sua-senha-mysql
   MYSQL_DATABASE=DCTF_WEB
   ```

3. **Use o arquivo `.env.example` como modelo**

   Existe um arquivo `.env.example` na raiz do projeto que você pode copiar e renomear para `.env`

### Opção 2: Ajustar diretamente no arquivo de configuração

Se preferir não usar arquivo `.env`, edite diretamente o arquivo:

**`docs/migrations/mysql/config_migration.py`**

Ajuste as configurações diretamente no código:

```python
MYSQL_CONFIG = {
    'host': 'localhost',      # Seu host MySQL
    'port': 3306,             # Porta MySQL
    'user': 'root',           # Usuário MySQL
    'password': 'sua-senha',  # Senha MySQL
    'database': 'DCTF_WEB',
    'charset': 'utf8mb4',
    'collation': 'utf8mb4_unicode_ci',
    'autocommit': False
}
```

## 🔍 Como Obter as Credenciais

### Credenciais do Supabase

1. Acesse [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto
3. Vá em **Settings** → **API**
4. Copie:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (recomendado para migração)

### Credenciais do MySQL DCTF_WEB

As credenciais do MySQL dependem da conexão configurada no Cursor:

1. **No Cursor, abra a conexão MySQL**
2. **Verifique as configurações de conexão:**
   - Host (geralmente `localhost` ou `127.0.0.1`)
   - Porta (geralmente `3306`)
   - Usuário (geralmente `root`)
   - Senha (se configurada)
   - Database: `DCTF_WEB`

**Se não souber as credenciais:**
- Verifique o arquivo de configuração do MySQL Workbench ou SQLTools
- Ou teste a conexão diretamente no Cursor para ver quais credenciais funcionam

## ✅ Validar Configuração

Após configurar, execute o script de migração. Ele validará automaticamente:

```bash
python docs/migrations/mysql/migrate_supabase_to_mysql.py
```

O script irá:
1. ✅ Verificar se todas as configurações estão definidas
2. ✅ Mostrar as configurações (sem senhas)
3. ✅ Tentar conectar ao Supabase
4. ✅ Tentar conectar ao MySQL DCTF_WEB
5. ✅ Executar a migração se tudo estiver correto

## 🔒 Segurança

⚠️ **Importante:**
- Nunca commit o arquivo `.env` no Git (ele já está no `.gitignore`)
- Mantenha suas credenciais seguras
- Use `.env.example` como template público

## 📝 Exemplo Completo

Arquivo `.env` completo de exemplo:

```env
# Supabase
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# MySQL DCTF_WEB
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=minhasenha123
MYSQL_DATABASE=DCTF_WEB
```

## 🆘 Problemas Comuns

### Erro: "SUPABASE_URL não configurado"
- Verifique se o arquivo `.env` está na raiz do projeto DCTF_MPC
- Verifique se o nome da variável está correto (deve ser exatamente `SUPABASE_URL`)

### Erro: "Não foi possível conectar ao MySQL"
- Verifique se o MySQL está rodando
- Verifique se o banco `DCTF_WEB` existe
- Verifique se as credenciais estão corretas
- Teste a conexão manualmente no Cursor primeiro

### Erro: "Access denied for user"
- Verifique se o usuário MySQL tem permissão para acessar o banco `DCTF_WEB`
- Verifique se a senha está correta
- Verifique se o usuário tem privilégios suficientes

## 📚 Próximos Passos

Após configurar corretamente:
1. ✅ Execute o script de criação do schema: `001_create_schema_dctf_web.sql`
2. ✅ Execute o script de migração: `migrate_supabase_to_mysql.py`
3. ✅ Verifique os dados migrados no MySQL

