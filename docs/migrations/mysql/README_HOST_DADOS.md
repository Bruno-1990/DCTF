# Migração: Tabela host_dados

## Descrição

Esta migração cria a tabela `host_dados` no banco `dctf_web` para armazenar dados exportados do sistema SCI (Firebird).

## Dados Armazenados

A tabela armazena 4 tipos de relatórios:

- **FPG**: Funcionários (admissões e demissões)
- **CTB**: Contabilidade (lançamentos contábeis)
- **FISE**: Fiscal Entrada (notas fiscais de entrada)
- **FISS**: Fiscal Saída (notas fiscais de saída)

## Estrutura da Tabela

```sql
host_dados
├── id (INT, AUTO_INCREMENT, PRIMARY KEY)
├── cod_emp (INT) - Código da empresa no sistema SCI
├── razao (VARCHAR(255)) - Razão social da empresa
├── cnpj (VARCHAR(18)) - CNPJ da empresa
├── ano (INT) - Ano da movimentação
├── mes (INT) - Mês da movimentação (1-12)
├── movimentacao (INT) - Quantidade de movimentações
├── tipo (VARCHAR(10)) - Tipo: FPG, CTB, NFe, NFT, NFEE, NFST
├── relatorio (VARCHAR(10)) - Relatório: FPG, CTB, FISE, FISS
├── especie (VARCHAR(50)) - Espécie da nota fiscal (apenas FISE/FISS)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

## Como Executar

### Opção 1: Via SQL direto

```bash
mysql -u root -p dctf_web < docs/migrations/mysql/008_create_host_dados.sql
```

### Opção 2: Via script Python

```bash
cd C:\Users\bruno\Documents\export\Automatico
python create_table.py
```

## Configuração do Projeto Export

1. Copie o arquivo `.env.example` para `.env`:
   ```bash
   cd C:\Users\bruno\Documents\export\Automatico
   copy .env.example .env
   ```

2. Edite o arquivo `.env` com suas credenciais:
   ```env
   MYSQL_HOST=localhost
   MYSQL_PORT=3306
   MYSQL_USER=root
   MYSQL_PASSWORD=sua_senha
   MYSQL_DATABASE=dctf_web
   ```

3. Instale as dependências:
   ```bash
   pip install -r requirements.txt
   ```

4. Execute o script de export:
   ```bash
   python main.py
   ```

## Índices Criados

- `idx_host_dados_cod_emp`: Busca por código da empresa
- `idx_host_dados_cnpj`: Busca por CNPJ
- `idx_host_dados_tipo`: Busca por tipo
- `idx_host_dados_relatorio`: Busca por relatório
- `idx_host_dados_ano_mes`: Busca por ano e mês
- `idx_host_dados_cnpj_ano_mes`: Busca combinada CNPJ + ano + mês
- `uk_host_dados_unique`: Índice único para evitar duplicatas

## Relação com Tabela clientes

A tabela `host_dados` pode ser relacionada com a tabela `clientes` através do campo `cod_emp` ou `cnpj`:

```sql
SELECT h.*, c.razao_social, c.id as cliente_id
FROM host_dados h
LEFT JOIN clientes c ON h.cnpj = c.cnpj_limpo OR h.cod_emp = c.cod_emp;
```

## Notas

- A tabela usa `ON DUPLICATE KEY UPDATE` para evitar duplicatas
- O campo `especie` é NULL para FPG e CTB, e preenchido para FISE e FISS
- O campo `tipo` pode ser diferente de `relatorio` para dados fiscais (ex: NFe, NFT, NFEE, NFST)



