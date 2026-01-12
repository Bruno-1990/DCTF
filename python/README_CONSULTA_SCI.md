# Como Fazer Consultas no Banco SCI

Este guia explica como usar a classe `SCIConnection` para fazer consultas no banco de dados SCI (Firebird).

## 📋 Pré-requisitos

1. **Python 3.7+** instalado
2. **Biblioteca `fdb`** (Firebird driver) instalada:
   ```bash
   pip install fdb
   ```
3. **DLL do Firebird** (`fbclient.dll`) disponível
4. **Variáveis de ambiente** configuradas no arquivo `.env`:
   ```
   SCI_FB_HOST=192.168.0.2
   SCI_FB_DATABASE=S:\SCI\banco\VSCI.SDB
   SCI_FB_USER=INTEGRACOES
   SCI_FB_PASSWORD=8t0Ry!W,
   SCI_FB_DLL_PATH=C:\caminho\para\fbclient.dll
   ```

## 🔧 Classe SCIConnection

A classe `SCIConnection` está localizada em `python/core/connection.py` e fornece métodos seguros para consultas no banco SCI.

### Características de Segurança

- ✅ **Apenas consultas SELECT** são permitidas
- ✅ **Bloqueia comandos perigosos**: INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, etc.
- ✅ **Validação automática** de todas as queries
- ✅ **Conexão automática** com o banco

## 📝 Exemplos de Uso

### 1. Consulta Simples

```python
from core.connection import SCIConnection

# Criar instância
conn = SCIConnection()

# Executar consulta
sql = """
SELECT FIRST 10 
    BDCODCOL,
    BDNOMECOL,
    BDDATAADMCOL
FROM BDCOL
WHERE BDDATAADMCOL >= '2024-01-01'
ORDER BY BDNOMECOL
"""

resultados = conn.execute_query(sql)

# Processar resultados
for row in resultados:
    codigo, nome, data = row
    print(f"{codigo}: {nome} - {data}")
```

### 2. Consulta com Limite

```python
conn = SCIConnection()

sql = "SELECT * FROM BDCOL ORDER BY BDNOMECOL"

# Limitar a 20 registros
resultados = conn.execute_query(sql, limit=20)
```

### 3. Consulta Scalar (valor único)

```python
conn = SCIConnection()

sql = "SELECT COUNT(*) FROM BDCOL WHERE BDDATAADMCOL >= '2024-01-01'"

total = conn.execute_scalar(sql)
print(f"Total: {total}")
```

### 4. Consulta com JOIN

```python
conn = SCIConnection()

sql = """
SELECT FIRST 10
    c.BDCODCOL,
    c.BDNOMECOL,
    cc.BDNOMECC
FROM BDCOL c
INNER JOIN BDCC cc ON c.BDCODCC = cc.BDCODCC
WHERE c.BDDATAADMCOL >= '2024-01-01'
ORDER BY c.BDNOMECOL
"""

resultados = conn.execute_query(sql)
```

## 🚀 Scripts Prontos

### Script de Exemplo Completo

Execute o arquivo `exemplo_consulta_sci.py` para ver vários exemplos:

```bash
python exemplo_consulta_sci.py
```

### Script de Consulta Rápida

Use `consulta_sci.py` para fazer consultas rápidas via linha de comando:

```bash
# Consulta simples
python consulta_sci.py "SELECT FIRST 10 * FROM BDCOL"

# Consulta com filtro
python consulta_sci.py "SELECT BDCODCOL, BDNOMECOL FROM BDCOL WHERE BDCODCOL = 123"

# Consulta com limite
python consulta_sci.py "SELECT * FROM BDCOL" 50
```

## ⚠️ Observações Importantes

### Sintaxe Firebird

O banco SCI usa **Firebird**, que tem algumas diferenças do SQL padrão:

1. **FIRST N** ao invés de **LIMIT**:
   ```sql
   -- ✅ Correto (Firebird)
   SELECT FIRST 10 * FROM BDCOL
   
   -- ❌ Errado (não funciona no Firebird)
   SELECT * FROM BDCOL LIMIT 10
   ```

2. **Sem ponto e vírgula** no final:
   ```sql
   -- ✅ Correto
   SELECT * FROM BDCOL
   
   -- ❌ Evitar
   SELECT * FROM BDCOL;
   ```

3. **Aspas simples** para strings:
   ```sql
   WHERE BDNOMECOL = 'João Silva'
   ```

### Tabelas Principais

Algumas tabelas comuns no banco SCI:

- **BDCOL**: Colaboradores
- **BDEMP**: Empresas
- **BDCC**: Centro de Custos
- **BDLAN**: Lançamentos
- **BDMOV**: Movimentações

### Segurança

A classe `SCIConnection` **bloqueia automaticamente**:
- ❌ INSERT, UPDATE, DELETE
- ❌ DROP, CREATE, ALTER
- ❌ TRUNCATE, EXECUTE, EXEC
- ❌ GRANT, REVOKE, COMMIT, ROLLBACK

Apenas consultas **SELECT** são permitidas.

## 🔍 Troubleshooting

### Erro: "fbclient.dll não encontrado"

1. Verifique se a DLL está no caminho especificado em `SCI_FB_DLL_PATH`
2. Ou coloque a DLL em `BANCO SCI/Dll/fbclient.dll`

### Erro: "Erro ao conectar"

1. Verifique se o servidor Firebird está rodando
2. Verifique as credenciais no arquivo `.env`
3. Verifique se o caminho do banco está correto

### Erro: "Apenas consultas SELECT são permitidas"

- Certifique-se de que sua query começa com `SELECT` ou `WITH`
- Remova qualquer comando de modificação (INSERT, UPDATE, DELETE, etc.)

## 📚 Recursos Adicionais

- **CatalogController**: Endpoint `/api/sci/catalog/executar-sql` para executar SQL via API
- **CatalogController**: Endpoint `/api/sci/catalog/buscar` para buscar objetos no catálogo
- **Scripts Python**: Veja `python/catalog/` para mais exemplos

## 💡 Dicas

1. **Use FIRST N** para limitar resultados e melhorar performance
2. **Sempre use WHERE** quando possível para filtrar dados
3. **Use índices**: Colunas como `BDCODCOL`, `BDCODEMP` geralmente são indexadas
4. **Teste queries pequenas** antes de executar consultas grandes
5. **Use comentários** no SQL para documentar suas consultas:
   ```sql
   -- Consulta de colaboradores ativos
   SELECT * FROM BDCOL WHERE BDDATAADMCOL >= '2024-01-01'
   ```

