## API de Planilhas DCTF

### POST /api/spreadsheet/validate
- Valida arquivo enviado e retorna preview apenas de linhas válidas (até 10), junto com contagem de válidos/ inválidos.
- Body (multipart/form-data): `arquivo`
- Resposta: `{ success, data: { metadados, totalLinhas, validos, invalidos, dados }, errors, warnings }`

### POST /api/spreadsheet/upload
- Upload e processamento completo com registro em histórico (em memória/DB) sem persistir dados detalhados.
- Body (multipart/form-data): `arquivo`, `clienteId`, `periodo`
- Resposta: `{ success, data: { metadados, totalLinhas, processadas, clienteId, periodo }, warnings }`

### POST /api/spreadsheet/import
- Importa e persiste linhas válidas em lotes (chunks) usando `createBulkDCTFDados`.
- Body (multipart/form-data): `arquivo`, `declaracaoId`, `chunkSize?` (padrão 1000, máx 5000)
- Resposta: `{ success, data: { totalLinhasArquivo, validos, invalidos, persisted, failed, chunkSize }, errors, warnings }`

### GET /api/spreadsheet/template
- Download do template XLSX (layout PT-BR) com cabeçalhos e exemplo.

### POST /api/spreadsheet/export
- Gera planilha a partir de um array de objetos homogêneos.
- Body: `{ dados: any[] }`

### GET /api/spreadsheet/validation-rules
- Tabela de formatos esperados para colunas e exemplos.

### GET /api/spreadsheet/uploads
- Histórico de uploads, com paginação e formatação de datas em pt-BR.

Notas gerais
- Datas de entrada aceitas: `dd/mm/yyyy` ou ISO. Datas de saída são pt-BR.
- Preview de validação não retorna linhas inválidas; contagens são informadas.

