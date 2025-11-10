# API de Flags DCTF

Base URL: `/api/flags`

## Listar flags

- **GET** `/api/flags`
- Parâmetros de query:
  - `page` (opcional, padrão 1)
  - `limit` (opcional, padrão 20, máximo 100)
  - `orderBy` (`created_at`, `codigo_flag`, `severidade`)
  - `order` (`asc`, `desc`)
  - `dctfId`, `codigo`, `severidade`, `resolvido`
- Resposta:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "declaracaoId": "uuid",
      "codigoFlag": "FLAG_ATRASO_ENVIO",
      "descricao": "...",
      "severidade": "critica",
      "resolvido": false,
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 5 }
}
```

## Obter flag

- **GET** `/api/flags/:id`
- Retorna flag por ID.

## Resolver flag

- **POST** `/api/flags/:id/resolve`
- Body:
```json
{ "resolucao": "Descrição da correção" }
```

## Reabrir flag

- **POST** `/api/flags/:id/reopen`
- Remove resolução e marca como pendente.

## Executar motor de validação

- **POST** `/api/flags/validate/run`
- Body (opcional):
```json
{ "declaracaoId": "..."} 
// ou { "clienteId": "..."} 
// ou { "periodo": "2025-08" }
```
- Sem filtros lança validação para todas as declarações.
- Resposta: resultados de análise com resumo de findings.


