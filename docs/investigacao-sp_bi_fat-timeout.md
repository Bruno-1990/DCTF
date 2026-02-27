# Investigação: timeout / worker travado em SP_BI_FAT (Firebird SCI)

Quando a procedure `SP_BI_FAT` está dando timeout, use as consultas abaixo no banco SCI (Firebird) para ver se há alguma requisição travada.

## 1. Statements que mencionam SP_BI_FAT (sua consulta original)

```sql
SELECT
    MON$STAT_ID,
    MON$ATTACHMENT_ID,
    MON$TRANSACTION_ID,
    MON$TIMESTAMP,
    MON$SQL_TEXT
FROM MON$STATEMENTS
WHERE MON$SQL_TEXT LIKE '%SP_BI_FAT%';
```

## 2. Versão com estado (MON$STATE) – só chamadas da aplicação

- **MON$STATE = 0** → idle  
- **MON$STATE = 1** → active (em execução; se ficar 1 por muito tempo, pode ser o travamento)  
- O filtro `NOT LIKE '%MON$STATEMENTS%'` evita listar a própria consulta de monitoramento.

```sql
SELECT
    S.MON$STAT_ID,
    S.MON$ATTACHMENT_ID,
    S.MON$TRANSACTION_ID,
    S.MON$STATE,
    S.MON$TIMESTAMP,
    S.MON$SQL_TEXT
FROM MON$STATEMENTS S
WHERE S.MON$SQL_TEXT LIKE '%SP_BI_FAT%'
  AND S.MON$SQL_TEXT NOT LIKE '%MON$STATEMENTS%';
```

## 3. Todas as statements ativas (qualquer uma, não só SP_BI_FAT)

Útil para ver carga geral no banco:

```sql
SELECT
    MON$STAT_ID,
    MON$ATTACHMENT_ID,
    MON$TRANSACTION_ID,
    MON$STATE,
    MON$TIMESTAMP,
    MON$SQL_TEXT
FROM MON$STATEMENTS
WHERE MON$STATE = 1
ORDER BY MON$TIMESTAMP;
```

## Como rodar

- **Pelo projeto (mesma conexão do app):**  
  Na raiz do DCTF_MPC:  
  `python python/scripts/investigar_sp_bi_fat.py`

- **Diretamente no Firebird:**  
  FlameRobin, isql ou outro cliente: conecte no banco SCI e execute uma das consultas acima.

## Interpretação

- Se a consulta 1 ou 2 **não retornar linhas**: não há nenhuma execução de SP_BI_FAT no momento (nenhum worker travado nela).
- Se retornar linhas com **MON$STATE = 1**: há ao menos uma execução ativa; se isso persistir por tempo longo (ex.: > 3 min), é candidata a ser a que está dando timeout.
- **MON$TIMESTAMP**: indica quando a statement foi iniciada; compare com o horário atual para ver há quanto tempo está rodando.
