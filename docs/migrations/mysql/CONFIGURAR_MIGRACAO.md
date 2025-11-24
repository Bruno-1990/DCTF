# 🔧 Configurar Migração Supabase → MySQL DCTF_WEB

## Passo 1: Criar arquivo .env

Na raiz do projeto DCTF_MPC (`C:\Users\bruno\Desktop\DCTF WEB\DCTF_MPC`), crie um arquivo chamado **`.env`** com o seguinte conteúdo:

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

## Passo 2: Preencher as credenciais

### Obter credenciais do Supabase:
1. Acesse: https://app.supabase.com
2. Selecione seu projeto
3. Vá em **Settings** → **API**
4. Copie:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`

### Obter credenciais do MySQL DCTF_WEB:
Verifique no Cursor qual conexão MySQL você está usando para o banco `DCTF_WEB`:
- **Host:** Geralmente `localhost`
- **Porta:** Geralmente `3306`
- **Usuário:** Geralmente `root`
- **Senha:** A senha que você configurou
- **Database:** `DCTF_WEB`

## Passo 3: Verificar configuração

Depois de criar o arquivo `.env` com as credenciais, execute:

```bash
python docs/migrations/mysql/migrate_supabase_to_mysql.py
```

O script irá:
- ✅ Validar todas as configurações
- ✅ Mostrar as configurações (sem senhas)
- ✅ Tentar conectar ao Supabase
- ✅ Tentar conectar ao MySQL DCTF_WEB
- ✅ Executar a migração

## 📝 Exemplo de arquivo .env

```env
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY0NTIzNDU2NywiZXhwIjoxOTYwODEwNTY3fQ.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjQ1MjM0NTY3LCJleHAiOjE5NjA4MTA1Njd9.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=minhasenha123
MYSQL_DATABASE=DCTF_WEB
```

## ⚠️ Importante

- O arquivo `.env` já está no `.gitignore`, então não será commitado no Git
- Mantenha suas credenciais seguras
- Nunca compartilhe o arquivo `.env` publicamente

