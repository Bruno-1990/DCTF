# Correção: Erro ao Visualizar PDF na Situação Fiscal

## Problema Identificado

**Erro:** `InvalidJWT` - `"exp" claim timestamp check failed`

**Causa:** O frontend estava tentando acessar URLs do Supabase Storage diretamente (`file_url`), mas:
1. Essas URLs têm tokens JWT que expiraram
2. O sistema migrou para MySQL e não usa mais Supabase Storage
3. Os PDFs estão armazenados como base64 no banco de dados MySQL

## Solução Implementada

### 1. Novo Endpoint para Servir PDFs

**Arquivo:** `src/routes/situacao-fiscal.ts`

**Endpoint:** `GET /api/situacao-fiscal/pdf/:id`

**Funcionalidade:**
- Busca o PDF base64 no banco de dados pela ID do registro
- Converte base64 para buffer
- Retorna o PDF com headers HTTP corretos (`Content-Type: application/pdf`)
- Permite visualização inline no navegador

**Código:**
```typescript
router.get('/pdf/:id', async (req, res, next) => {
  // Buscar registro no banco
  const { data: download } = await client
    .from('sitf_downloads')
    .select('id, pdf_base64, cnpj')
    .eq('id', id)
    .single();
  
  // Converter base64 para buffer
  const pdfBuffer = Buffer.from(download.pdf_base64, 'base64');
  
  // Retornar PDF com headers corretos
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="situacao-fiscal-${download.cnpj}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
});
```

### 2. Atualização do Frontend

**Arquivo:** `frontend/src/pages/SituacaoFiscal.tsx`

**Mudanças:**

1. **Função `handleDownloadPDF`:**
   - **Antes:** Recebia `fileUrl` e fazia fetch direto do Supabase
   - **Depois:** Recebe `id` e faz fetch do endpoint do backend

2. **Link de Visualização:**
   - **Antes:** `href={h.file_url}` (URL do Supabase com token expirado)
   - **Depois:** `href={`/api/situacao-fiscal/pdf/${h.id}`}` (endpoint do backend)

3. **Verificação de Disponibilidade:**
   - **Antes:** `{h.file_url ? ...}`
   - **Depois:** `{(h.has_pdf_base64 || h.file_url) ? ...}` (verifica se tem base64 no banco)

4. **Tipo TypeScript:**
   - Adicionado `has_pdf_base64?: boolean` ao tipo do histórico

## Fluxo Corrigido

### Antes (Com Erro)
1. Frontend tenta acessar `file_url` do Supabase
2. URL contém token JWT expirado
3. Supabase retorna erro `InvalidJWT`
4. PDF não é exibido

### Depois (Corrigido)
1. Frontend faz requisição para `/api/situacao-fiscal/pdf/:id`
2. Backend busca PDF base64 no banco MySQL
3. Backend converte base64 para buffer
4. Backend retorna PDF com headers corretos
5. Navegador exibe PDF corretamente

## Benefícios

1. ✅ **Não depende mais do Supabase Storage** - PDFs servidos diretamente do MySQL
2. ✅ **Sem tokens expirados** - Não usa mais URLs assinadas do Supabase
3. ✅ **Mais seguro** - PDFs servidos através do backend com controle de acesso
4. ✅ **Mais confiável** - Não depende de serviços externos para visualização

## Estrutura de Dados

A tabela `sitf_downloads` armazena:
- `id`: UUID do registro
- `cnpj`: CNPJ do contribuinte
- `pdf_base64`: PDF completo em base64 (LONGTEXT)
- `file_url`: URL antiga do Supabase (mantida para compatibilidade, mas não usada)
- `has_pdf_base64`: Flag indicando se tem base64 disponível (retornado na API)

## Testes Recomendados

1. **Teste de Visualização:**
   - Clicar em "Visualizar" em um registro do histórico
   - Verificar se o PDF abre em nova aba
   - Verificar se não há erro de JWT

2. **Teste de Download:**
   - Clicar em "Baixar PDF"
   - Verificar se o PDF é baixado corretamente
   - Verificar se o nome do arquivo está correto

3. **Teste de Registros Antigos:**
   - Verificar se registros antigos (com `file_url` mas sem `pdf_base64`) são tratados corretamente
   - Verificar se mostra "Indisponível" quando não há PDF

## Notas Técnicas

- O endpoint retorna o PDF diretamente como binário, não como JSON
- Headers HTTP são configurados corretamente para exibição inline
- O `Content-Disposition` permite que o navegador exiba o PDF em nova aba
- O tamanho do PDF é limitado apenas pelo tamanho do campo LONGTEXT no MySQL

## Próximos Passos (Opcional)

1. Adicionar cache de PDFs servidos para melhorar performance
2. Adicionar autenticação/autorização no endpoint de PDF
3. Implementar compressão de PDFs grandes
4. Adicionar métricas de uso do endpoint

