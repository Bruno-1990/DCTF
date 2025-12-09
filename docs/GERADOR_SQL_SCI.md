# Gerador de SQL - SCI

## 📋 Visão Geral

A aba "Gerador de SQL" permite buscar tabelas e views no catálogo SCI e gerar queries SQL automaticamente de forma inteligente.

## 🎯 Funcionalidades

1. **Busca Inteligente**: Busca no catálogo de 4002 objetos (VIEWs e TABLEs)
2. **Filtros Avançados**: Por domínio (RH, Fiscal, Estoque, etc) e tipo (VIEW/TABLE)
3. **Priorização Automática**: VIEWs são priorizadas sobre TABLEs
4. **Geração de SQL**: Gera queries SQL dinâmicas baseadas nas colunas encontradas

## 🚀 Como Usar

### 1. Acessar a Aba

Navegue para: **SCI → Gerador SQL** no menu lateral

### 2. Preencher o Formulário

- **Busca** (obrigatório): Digite palavras-chave (ex: "centro de custo", "colaborador")
- **Área**: Selecione o domínio (RH, Fiscal, Estoque, Contábil, Vendas) ou deixe "Todas"
- **Tipo**: Selecione VIEW (recomendado), TABLE ou "Todos"
- **Quantidade**: Número de resultados (1-50, padrão: 10)

### 3. Buscar

Clique em "Buscar" para encontrar VIEWs/TABLEs relevantes.

### 4. Gerar SQL

Clique em "Gerar SQL" em qualquer resultado para gerar uma query SQL baseada nas colunas da VIEW/TABLE.

### 5. Copiar SQL

Use o botão "Copiar SQL" para copiar a query gerada.

## 📁 Estrutura de Arquivos

```
DCTF_MPC/
├── frontend/src/
│   ├── pages/
│   │   └── GeradorSQL.tsx          # Página principal
│   └── services/
│       └── geradorSQL.ts           # Serviço frontend
├── src/
│   ├── controllers/
│   │   └── CatalogController.ts    # Controller backend
│   └── routes/
│       └── sci.ts                  # Rotas SCI (atualizado)
└── python/catalog/
    ├── catalog.json                 # Catálogo unificado (4002 objetos)
    ├── catalog_retriever.py        # Retriever Python
    ├── buscar_catalog.py           # Script CLI
    └── __init__.py                  # Módulo Python
```

## 🔌 Endpoints da API

### POST `/api/sci/catalog/buscar`

Busca objetos no catálogo.

**Request Body:**
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

**Request Body:**
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

## 💡 Dicas de Uso

1. **Sempre especifique o domínio**: Reduz drasticamente o tempo de busca
2. **Prefira VIEWs**: Elas já trazem regras de negócio aplicadas
3. **Use palavras-chave específicas**: "centro de custo" é melhor que "custo"
4. **Ajuste a quantidade**: Use 5-10 para contexto de IA, 20-50 para listagem

## 🔄 Atualizar o Catálogo

Se o banco SCI mudar, atualize o catálogo:

1. Execute no projeto BANCO SCI:
   ```bash
   cd "BANCO SCI/Struct_SCI"
   python gerar_catalog_unificado.py
   ```

2. Copie o novo `catalog.json`:
   ```bash
   copy "BANCO SCI\Struct_SCI\catalog.json" "DCTF_MPC\python\catalog\catalog.json"
   ```

3. Reinicie o backend Node.js

## 🐛 Troubleshooting

### Erro: "Catálogo não encontrado"

Verifique se o arquivo existe em `python/catalog/catalog.json`

### Erro: "Erro ao buscar no catálogo"

- Verifique se Python está instalado e no PATH
- Verifique se o script `buscar_catalog.py` está acessível
- Verifique os logs do backend para mais detalhes

### Busca muito lenta

- Especifique o domínio (reduz de 4002 para ~500-800 objetos)
- Especifique o tipo (VIEW ou TABLE)
- Reduza a quantidade de resultados

## 📊 Performance

| Filtros | Objetos Processados | Tempo Estimado |
|---------|---------------------|----------------|
| Nenhum | 4002 | ~500ms |
| Domínio | ~500-800 | ~100ms |
| Domínio + Tipo | ~300-600 | ~50ms |
| Domínio + Tipo + Top 10 | ~10-50 | ~10-20ms |

## 🎨 Interface

A interface possui:
- ✅ 4 campos de busca (Busca, Área, Tipo, Quantidade)
- ✅ Lista de resultados com scores de relevância
- ✅ Botão "Gerar SQL" para cada resultado
- ✅ Visualizador de SQL gerado com syntax highlighting
- ✅ Botão para copiar SQL
- ✅ Feedback visual (loading, erros, sucesso)

