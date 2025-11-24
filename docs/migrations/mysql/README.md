# Migração Supabase → MySQL DCTF_WEB

Este diretório contém scripts para migrar dados do Supabase (PostgreSQL) para o MySQL DCTF_WEB.

## 📋 Pré-requisitos

1. **Python 3.7+**
2. **Bibliotecas Python:**
   ```bash
   pip install mysql-connector-python supabase python-dotenv
   ```
3. **Conexão MySQL configurada no Cursor** com o banco `DCTF_WEB`
4. **Credenciais do Supabase** configuradas

## 🔧 Configuração

### 1. Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto ou configure as variáveis de ambiente:

```env
# Supabase
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua-chave-anon
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role  # Opcional, mas recomendado

# MySQL (ou ajuste diretamente no script Python)
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=DCTF_WEB
```

### 2. Ajustar Configurações no Script

Se preferir, ajuste diretamente no arquivo `migrate_supabase_to_mysql.py`:

```python
MYSQL_CONFIG = {
    'host': 'localhost',      # Ajuste conforme sua conexão
    'user': 'root',           # Ajuste conforme sua conexão
    'password': '',           # Ajuste conforme sua conexão
    'database': 'DCTF_WEB',
    'charset': 'utf8mb4',
    'collation': 'utf8mb4_unicode_ci'
}
```

## 📝 Passos para Executar

### Passo 1: Criar o Schema MySQL

1. Abra a conexão MySQL no Cursor
2. Selecione o banco `DCTF_WEB`
3. Execute o script SQL:
   ```sql
   -- Execute o arquivo: docs/migrations/mysql/001_create_schema_dctf_web.sql
   ```

Ou execute diretamente na janela SQL do Cursor:

```sql
USE DCTF_WEB;
-- Copie e cole o conteúdo do arquivo 001_create_schema_dctf_web.sql
```

### Passo 2: Executar a Migração de Dados

Execute o script Python:

```bash
cd "C:\Users\bruno\Desktop\DCTF WEB\DCTF_MPC"
python docs/migrations/mysql/migrate_supabase_to_mysql.py
```

O script irá:
1. ✅ Conectar ao Supabase
2. ✅ Conectar ao MySQL DCTF_WEB
3. ✅ Migrar todas as tabelas na ordem correta (respeitando foreign keys)
4. ✅ Mostrar progresso e estatísticas

## 📊 Tabelas Migradas

O script migra as seguintes tabelas na ordem correta:

1. **clientes** - Tabela de clientes
2. **dctf_declaracoes** - Metadados das declarações DCTF
3. **dctf_dados** - Dados processados das declarações
4. **analises** - Resultados de análises
5. **flags** - Sinalizações de problemas
6. **relatorios** - Relatórios gerados
7. **upload_history** - Histórico de uploads
8. **dctf_codes** - Códigos DCTF

## 🔍 Verificar Migração

Após executar, verifique os dados:

```sql
-- Verificar contagem de registros
SELECT 'clientes' as tabela, COUNT(*) as total FROM clientes
UNION ALL
SELECT 'dctf_declaracoes', COUNT(*) FROM dctf_declaracoes
UNION ALL
SELECT 'dctf_dados', COUNT(*) FROM dctf_dados
UNION ALL
SELECT 'analises', COUNT(*) FROM analises
UNION ALL
SELECT 'flags', COUNT(*) FROM flags;

-- Verificar alguns registros
SELECT * FROM clientes LIMIT 5;
SELECT * FROM dctf_declaracoes LIMIT 5;
```

## ⚠️ Observações Importantes

1. **Duplicatas**: O script usa `ON DUPLICATE KEY UPDATE` para evitar duplicatas. Se executar novamente, atualizará registros existentes.

2. **Foreign Keys**: As tabelas são migradas na ordem que respeita as dependências de foreign keys.

3. **Timestamps**: Os timestamps são convertidos do formato Supabase (com timezone) para o formato MySQL.

4. **JSON Fields**: Campos JSON/arrays do Supabase são convertidos para strings JSON do MySQL.

5. **Performance**: Para grandes volumes de dados, considere migrar em lotes.

## 🐛 Troubleshooting

### Erro de Conexão MySQL
- Verifique se o banco `DCTF_WEB` existe
- Verifique as credenciais de conexão
- Teste a conexão manualmente no MySQL

### Erro de Conexão Supabase
- Verifique se `SUPABASE_URL` e `SUPABASE_ANON_KEY` estão corretos
- Teste a conexão com o Supabase manualmente

### Erro de Foreign Key
- Certifique-se de executar o schema SQL primeiro
- Verifique se os clientes foram migrados antes das declarações

### Dados não aparecem
- Verifique se há dados no Supabase
- Verifique os logs do script para erros específicos
- Execute queries de verificação no MySQL

## 📚 Próximos Passos

Após migrar os dados do Supabase:

1. ✅ Verificar se todos os dados foram migrados corretamente
2. ✅ Migrar dados do Export (host_dados) se necessário
3. ✅ Atualizar aplicação para usar MySQL ao invés de Supabase
4. ✅ Testar a aplicação com o novo banco de dados

## 📞 Suporte

Se encontrar problemas:
1. Verifique os logs do script Python
2. Verifique os logs do MySQL
3. Compare os dados entre Supabase e MySQL
4. Execute as queries de verificação acima

