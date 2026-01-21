# SPED v2.0 - Sistema de Validação e Correção

## Visão Geral

Sistema completo de validação e correção de arquivos SPED (EFD ICMS/IPI) com integração de documentos legais, RAG (Retrieval-Augmented Generation) e correção automática assistida.

## Arquitetura

### Camadas de Validação

1. **Camada A - Normalização**: Conversão de XML e EFD para modelo canônico
2. **Camada B - Validação Interna**: Validação de consistência interna do SPED
3. **Camada C - Matching**: Confronto conceitual XML × EFD
4. **Camada D - Classificação**: Matriz de legitimação e score de confiança
5. **Camada E - Correção**: Motor de correção com guardrails e auditoria

### Componentes Principais

#### Backend (Python)

- **Normalização**: `python/sped/v2/normalization/`
  - `xml_normalizer.py`: Normalização de XMLs
  - `efd_normalizer.py`: Normalização de EFD

- **Validação**: `python/sped/v2/validation/`
  - `efd_internal_validator.py`: Validação interna
  - `xml_efd_validator.py`: Confronto XML × EFD

- **Classificação**: `python/sped/v2/classification/`
  - `matriz_legitimacao.py`: Matriz de legitimação
  - `score_calculator.py`: Cálculo de score de confiança

- **Correção**: `python/sped/v2/corrections/`
  - `plan_generator.py`: Geração de plano de correções
  - `corrector.py`: Motor de correção
  - `guardrails.py`: Validações de segurança

- **Conhecimento**: `python/sped/v2/knowledge/`
  - `document_parser.py`: Parser de documentos legais
  - `chunking.py`: Sistema de chunking inteligente
  - `legal_rag.py`: Sistema RAG
  - `hybrid_query.py`: Consulta híbrida RAG + Banco
  - `versioning.py`: Versionamento e vigência
  - `cache_manager.py`: Cache e otimizações

- **Packs**: `python/sped/v2/packs/`
  - Packs por segmento (Comércio, Bebidas, Indústria, E-commerce)

#### Frontend (React/TypeScript)

- **Componentes Principais**: `frontend/src/components/sped/v2/`
  - `Step1ClientProfile.tsx`: Seleção de cliente e perfil fiscal
  - `Step2FileUpload.tsx`: Upload de arquivos
  - `Step3ProcessingPipeline.tsx`: Pipeline de processamento
  - `Step4ResultsView.tsx`: Resultados com filtros
  - `Step5CorrectionPlan.tsx`: Plano de correções
  - `Step6Approval.tsx`: Modal de aprovação
  - `Step7Execution.tsx`: Execução de correções
  - `EvidenceDrawer.tsx`: Drawer de evidências
  - `DownloadPackage.tsx`: Download de pacotes
  - `OperationsDashboard.tsx`: Dashboard de operações

- **Páginas**: `frontend/src/pages/`
  - `SpedValidacaoV2.tsx`: Página principal
  - `SpedKnowledgeBase.tsx`: Base de conhecimento

## Fluxo de Trabalho

1. **Seleção de Cliente e Perfil**: Configuração do cliente e perfil fiscal
2. **Upload de Arquivos**: Upload de SPED e XMLs com pré-checks
3. **Processamento**: Pipeline de validação em tempo real
4. **Resultados**: Visualização de divergências com filtros
5. **Plano de Correções**: Geração e revisão do plano
6. **Aprovação**: Modal de aprovação em 2 níveis
7. **Execução**: Aplicação de correções com feedback em tempo real
8. **Download**: Download do pacote corrigido

## Sistema de Conhecimento

### Documentos Legais

- **Tipos**: Guia Prático, Ato COTEPE, Convênio, Portaria, Nota Técnica
- **Versionamento**: Por período de vigência (mês/ano)
- **Indexação**: Chunking inteligente + embeddings para RAG

### Regras Estruturadas

- **Extração**: Automática de documentos legais
- **Classificação**: VALIDACAO, OBRIGATORIEDADE, TOLERANCIA, EXCECAO
- **Referências**: Links para documentos, artigos, seções

### Consulta Híbrida

- **RAG**: Busca semântica em documentos
- **Banco**: Regras estruturadas por categoria/tipo
- **Combinação**: Prioriza regras estruturadas, complementa com RAG

## Packs por Segmento

- **Comércio**: CFOPs típicos, tolerâncias padrão
- **Bebidas**: ST/PMPF/MVA, CESTs críticos
- **Indústria**: IPI, insumos, Bloco G
- **E-commerce**: DIFAL/FCP, operações interestaduais

## Configuração

### Variáveis de Ambiente

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: Configuração do MySQL
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.: Chaves de API para LLMs

### Banco de Dados

Execute as migrações em `docs/migrations/mysql/` na ordem numérica.

## Uso

### Ingestão de Documentos

```bash
python python/sped/v2/knowledge/ingest_docs.py --docs-folder "SPED 2.0/DOCS"
```

### Validação via API

```bash
POST /api/sped/v2/validar
{
  "cliente_id": 1,
  "competencia": "2024-01",
  "arquivo_sped": "...",
  "arquivos_xml": [...]
}
```

## Testes

Execute testes unitários e de integração conforme necessário.

## Documentação Adicional

- Arquitetura detalhada: `docs/architecture.md`
- Guia de uso: `docs/user-guide.md`
- API Reference: `docs/api-reference.md`

