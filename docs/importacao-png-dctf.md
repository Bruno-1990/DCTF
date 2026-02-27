# Importação de declarações DCTF a partir de imagens PNG

## Visão geral

O painel administrativo permite importar declarações DCTF a partir de **imagens PNG** (prints da tela oficial da Receita Federal). O sistema usa OCR (Tesseract.js) para extrair o texto e um parser para identificar a tabela com as colunas oficiais, gravando os registros em `dctf_declaracoes` (MySQL e Supabase).

## Requisitos das imagens

- **Formato:** PNG (prints da tela com a tabela de declarações).
- **Layout:** A tabela deve conter as colunas na ordem esperada: Tipo NI, Número de Identificação, Período de Apuração, Data Transmissão, Categoria, Origem, Tipo, Situação, Débito Apurado, Saldo a Pagar.
- **Observação:** Se a Receita Federal alterar o layout da tela oficial, o parser em `src/services/DCTFPngExtractorService.ts` pode precisar de ajuste (regex, posições ou regras de colunas).

## Normalização aplicada

- **CNPJ:** Apenas dígitos (14 caracteres).
- **Data de transmissão:** Convertida para `YYYY-MM-DD HH:mm:ss` quando em DD/MM/YYYY.
- **Débito apurado e Saldo a pagar:** Vírgula substituída por ponto; valor numérico quando possível.

## Uso

1. Acesse **Administração** e faça login.
2. Na seção **"Importar de imagens PNG"**, clique em **Selecionar PNG** e escolha uma ou mais imagens.
3. Clique em **Importar**. O backend processa cada imagem (OCR + parser) e insere os registros em `dctf_declaracoes`.
4. O resumo exibe quantos registros foram inseridos e, por arquivo, quantas linhas foram extraídas e inseridas (ou erros).

## Endpoint

- **POST** `/api/dctf/admin/import-from-png`
- **Body:** `multipart/form-data`, campo `images` (até 20 arquivos PNG, 10 MB cada).

## Verificação: dados nas imagens x MySQL (teste_png)

Para conferir se os dados inseridos no MySQL batem com o que está nas imagens (principalmente **data de transmissão** e **período de apuração**), use o script que re-executa o OCR em todas as imagens da pasta DCTF_WEB e compara com a tabela `teste_png`:

```bash
# Usar pasta padrão (Pictures/DCTF_WEB no Windows)
npm run verify:ocr-vs-mysql

# Ou informar a pasta das imagens
npx ts-node src/scripts/verificar-ocr-vs-mysql-dctf.ts "C:\caminho\para\DCTF_WEB"
```

Variável de ambiente opcional: `DCTF_WEB_IMAGES_PATH` — caminho da pasta que contém os PNGs.

O script lista:
- **Divergência em data de transmissão:** valor na imagem (OCR) x valor no MySQL
- **Divergência em período de apuração:** valor na imagem x valor no MySQL
- **Registros no MySQL** sem correspondência em nenhuma imagem (mesmo CNPJ + período)
- **Linhas extraídas das imagens** sem registro correspondente no MySQL
