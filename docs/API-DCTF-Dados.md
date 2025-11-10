## Endpoint: Listar dados da declaração DCTF

- Método: GET
- URL: `/api/dctf/:id/dados`
- Descrição: Retorna os dados processados (`dctf_dados`) de uma declaração, com suporte a filtros, ordenação, paginação e datas formatadas em pt-BR na resposta.

### Parâmetros de rota
- `id` (string, obrigatório): ID da declaração DCTF.

### Query params (opcionais)
- `page` (number, padrão: 1): página.
- `limit` (number, padrão: 50): itens por página.
- `codigo` (string): filtra por código DCTF (case-insensitive; sanitizado com trim/upper).
- `codigoReceita` (string): filtra por código de receita (case-insensitive; sanitizado com trim/upper).
- `valorMin` (number): valor mínimo.
- `valorMax` (number): valor máximo.
- `dataInicio` (string): data inicial (aceita `dd/mm/yyyy` ou ISO `yyyy-mm-dd`).
- `dataFim` (string): data final (aceita `dd/mm/yyyy` ou ISO `yyyy-mm-dd`).
- `search` (string): termo aplicado em `codigo`, `descricao`, `observacoes` (normalizado para busca).
- `orderBy` (string): campo de ordenação. Suportados:
  - Quando Supabase ativo: `linha`, `valor`, `codigo`, `codigo_receita`, `data_ocorrencia`, `created_at`.
  - Fallback em memória: `linha`, `valor`, `codigo`, `codigoReceita`, `dataOcorrencia`, `createdAt`.
- `order` (string, `asc` | `desc`, padrão: `asc`).

### Resposta (200)
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "declaracaoId": "...",
      "linha": 1,
      "codigo": "001",
      "descricao": "...",
      "valor": 123.45,
      "dataOcorrencia": "15/01/2024", // formatado pt-BR
      "observacoes": "...",
      "createdAt": "01/02/2024" // formatado pt-BR
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 120,
    "totalPages": 3
  }
}
```

### Notas de implementação
- Se Supabase estiver configurado (`SUPABASE_URL`), filtros/ordenação/paginação são aplicados no banco via PostgREST, com `count: 'exact'`.
- Sem Supabase, os filtros/ordenação/paginação são aplicados em memória com base no resultado de `findByDeclaracao`.
- Datas aceitas em entrada: `dd/mm/yyyy` e ISO `yyyy-mm-dd`.
- Datas na resposta são sempre formatadas em pt-BR (`dd/mm/yyyy`).

### Exemplos
- Paginado com filtro por período e ordenação por valor decrescente:
```
GET /api/dctf/UUID-DECLARACAO/dados?dataInicio=01/01/2024&dataFim=31/01/2024&orderBy=valor&order=desc&page=1&limit=100
```

- Filtrar por `codigo=001` e `codigoReceita=1.1.1.01.01`:
```
GET /api/dctf/UUID-DECLARACAO/dados?codigo=001&codigoReceita=1.1.1.01.01
```


