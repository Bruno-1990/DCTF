# Migration 019 – Coluna nome_pasta_rede (clientes)

Adiciona a coluna `nome_pasta_rede` na tabela `clientes` (campo Rede no cadastro).

## Como executar

### Opção 1: Script Node (recomendado)

Na **raiz do projeto** (`DCTF WEB\DCTF_MPC`), com o `.env` configurado (MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE):

```bash
node docs/migrations/mysql/run_migration_019.js
```

### Opção 2: Linha de comando MySQL

```bash
mysql -u root -p DCTF_WEB < "docs/migrations/mysql/019_add_clientes_nome_pasta_rede.sql"
```

(Substitua `root` e use a senha do MySQL quando solicitado.)

### Opção 3: MySQL Workbench (ou outro cliente)

1. Abra o MySQL Workbench e conecte ao servidor onde está o banco **DCTF_WEB**.
2. Abra o arquivo `019_add_clientes_nome_pasta_rede.sql` (File → Open SQL Script).
3. Execute o script (ícone do raio ou Ctrl+Shift+Enter).

---

A migration é idempotente: se a coluna já existir, nada é alterado e não gera erro.
