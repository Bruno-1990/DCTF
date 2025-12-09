# Módulo SPED Validação - Documentação

## Visão Geral

O módulo SPED Validação foi integrado ao projeto DCTF_MPC para fornecer validação e conferência de SPED Fiscal (EFD ICMS/IPI) com suporte a XMLs de notas fiscais.

## Estrutura Implementada

### Backend (TypeScript/Node.js)

- **`src/routes/sped.ts`**: Rotas da API para validação SPED
- **`src/controllers/SpedController.ts`**: Controller para gerenciar requisições
- **`src/services/SpedValidationService.ts`**: Serviço para processamento assíncrono

### Frontend (React/TypeScript)

- **`frontend/src/pages/SpedValidacao.tsx`**: Página principal de validação
- **`frontend/src/components/sped/FileUploader.tsx`**: Componente de upload de arquivos
- **`frontend/src/components/sped/ValidationProgress.tsx`**: Componente de progresso (SSE)
- **`frontend/src/components/sped/ResultsDashboard.tsx`**: Dashboard de resultados
- **`frontend/src/components/sped/DivergenciasTable.tsx`**: Tabela de divergências
- **`frontend/src/services/sped.ts`**: Serviço de API do frontend

### Python (Processamento)

- **`python/sped/`**: Módulo Python com toda a lógica de validação
  - `parsers.py`: Parsers de SPED e XML
  - `validators.py`: Validações EFD
  - `reconcile.py`: Reconciliação e geração de relatórios
  - `common.py`: Utilitários e constantes
  - `excelio.py`: Geração de Excel
  - `format.py`: Formatação de planilhas
  - `processar_validacao.py`: Script principal chamado pela API
  - `rules/`: Regras YAML por setor

## Funcionalidades

### 1. Upload de Arquivos
- Upload de arquivo SPED (.txt)
- Upload múltiplo de XMLs (NF-e/CT-e)
- Seleção de setor para regras específicas

### 2. Processamento Assíncrono
- Processamento em background
- Atualização de progresso via Server-Sent Events (SSE)
- Status em tempo real

### 3. Validações Implementadas
- Validações estruturais EFD (C100↔C170↔C190)
- Conferência de cadastros (0150/0190/0200)
- Apurações (E110/E116/E310/E316)
- Conferência SPED × XML
- Regras configuráveis por setor (YAML)

### 4. Relatórios
- Dashboard com resumo
- Tabela de divergências com filtros
- Exportação para Excel
- Múltiplas abas de relatórios

## Endpoints da API

### POST `/api/sped/validar`
Inicia validação de SPED e XMLs.

**Body (multipart/form-data):**
- `sped`: Arquivo SPED (.txt)
- `xmls`: Arquivos XML (múltiplos)
- `setor`: Setor opcional (string)

**Response:**
```json
{
  "validationId": "uuid",
  "message": "Validação iniciada",
  "status": "processing"
}
```

### GET `/api/sped/validacao/:id`
Obtém resultado da validação.

### GET `/api/sped/validacao/:id/progress`
Stream de progresso via SSE.

### GET `/api/sped/validacao/:id/export/excel`
Exporta resultado para Excel.

### GET `/api/sped/validacao/:id/export/pdf`
Exporta resultado para PDF.

### GET `/api/sped/historico`
Lista histórico de validações.

### DELETE `/api/sped/validacao/:id`
Deleta validação.

## Rotas Frontend

- `/sped`: Página principal de validação SPED

## Dependências

### Python
- pandas >= 2.0
- openpyxl >= 3.1
- pyyaml >= 6.0

### Node.js
- Já incluídas no projeto (multer, exceljs, uuid, etc.)

## Próximos Passos

1. **Testes**: Implementar testes unitários e de integração
2. **Melhorias**: 
   - Cache de validações
   - Histórico persistente (banco de dados)
   - Comparação entre períodos
   - Notificações
3. **Otimizações**:
   - Processamento paralelo de XMLs
   - Compressão de resultados
   - Limpeza automática de arquivos temporários

## Notas de Implementação

- O processamento Python é executado de forma assíncrona
- Arquivos temporários são armazenados em `os.tmpdir()/sped_validations/`
- O status é mantido em memória (considerar persistência futura)
- SSE é usado para atualização de progresso em tempo real

