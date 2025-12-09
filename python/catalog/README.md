# Catálogo SCI - Gerador de SQL

Este módulo contém o catálogo unificado do banco SCI e o retriever para busca inteligente de tabelas e views.

## Estrutura

```
python/catalog/
├── catalog.json              # Catálogo unificado (4002 objetos)
├── catalog_retriever.py      # Classe para buscar no catálogo
├── buscar_catalog.py         # Script CLI usado pelo backend
└── __init__.py               # Módulo Python
```

## Como Funciona

1. **Frontend** → Usuário preenche formulário (Busca, Área, Tipo, Quantidade)
2. **Backend** → Recebe JSON e chama script Python
3. **Python** → Busca no `catalog.json` usando `CatalogRetriever`
4. **Backend** → Retorna resultados para o frontend
5. **Frontend** → Mostra VIEWs/TABLEs encontradas
6. **Usuário** → Clica em "Gerar SQL" para uma VIEW/TABLE
7. **Backend** → Gera SQL dinâmico baseado nas colunas
8. **Frontend** → Mostra SQL gerado (pode copiar)

## Endpoints

### POST `/api/sci/catalog/buscar`

Busca objetos no catálogo.

**Request:**
```json
{
  "query": "colaborador centro de custo",
  "domain": "rh",
  "type": "VIEW",
  "top_k": 10
}
```

**Response:**
```json
{
  "objetos": [
    {
      "object": "VW_COLABORADOR_CC",
      "type": "VIEW",
      "score": 0.95,
      "layer": "analitica",
      "metadata": {
        "name": "VW_COLABORADOR_CC",
        "domain_tags": ["rh"],
        "total_colunas": 25,
        "colunas": [...]
      }
    }
  ]
}
```

### POST `/api/sci/catalog/gerar-sql`

Gera SQL baseado em um objeto.

**Request:**
```json
{
  "objeto": "VW_COLABORADOR_CC",
  "tipo": "VIEW",
  "colunas": [
    {"nome": "BDCODCOL", "tipo": "INTEGER"},
    {"nome": "BDNOMCOL", "tipo": "VARCHAR"}
  ]
}
```

**Response:**
```json
{
  "sql": "SELECT BDCODCOL, BDNOMCOL FROM VW_COLABORADOR_CC WHERE 1=1 ..."
}
```

## Atualizar o Catálogo

Se precisar atualizar o `catalog.json`:

1. Copie o novo arquivo de `BANCO SCI/Struct_SCI/catalog.json`
2. Cole em `DCTF_MPC/python/catalog/catalog.json`
3. Reinicie o backend

## Dependências Python

O script usa apenas bibliotecas padrão do Python:
- `json`
- `pathlib`
- `typing`

Não requer instalação de pacotes adicionais.

