import { Router } from 'express';
import { SituacaoFiscalOrchestrator, base64ToBuffer, fetchAccessToken, extractDataFromPdfBase64 } from '../services/SituacaoFiscalOrchestrator';
import { supabase, supabaseAdmin } from '../config/database';

const router = Router();

// GET /api/situacao-fiscal/token -> valida acesso ao token (sem expor o token)
router.get('/token', async (_req, res, next) => {
  try {
    const token = await fetchAccessToken();
    if (!token) return res.status(502).json({ success: false, error: 'Falha ao obter token' });
    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/situacao-fiscal/:cnpj/download
router.post('/:cnpj/download', async (req, res, next) => {
  try {
    const { cnpj } = req.params;
    const result = await SituacaoFiscalOrchestrator.handleDownload(cnpj);

    if (result.type === 'wait') {
      res.setHeader('Retry-After', String(result.retryAfter));
      return res.status(202).json({
        success: true,
        message: `Relatório em processamento. Tente novamente em ${result.retryAfter}s.`,
        retryAfter: result.retryAfter,
        step: result.step, // 'protocolo' ou 'emitir'
      });
    }

    if (result.type === 'ready-url') {
      return res.status(200).json({ success: true, url: result.url, step: 'concluido' });
    }

    if (result.type === 'ready-base64') {
      // PDF já foi salvo no storage e registrado no histórico
      // Retornar apenas JSON indicando sucesso, sem forçar download
      return res.status(200).json({ 
        success: true, 
        message: 'Relatório gerado com sucesso',
        step: 'concluido',
        url: result.url, // URL do arquivo salvo no storage (se disponível)
      });
    }

    return res.status(500).json({ success: false, error: 'Estado inesperado' });
  } catch (err) {
    next(err);
  }
});

// GET /api/situacao-fiscal/history?cnpj=...&limit=20
router.get('/history', async (req, res, next) => {
  try {
    const cnpj = String(req.query.cnpj || '').replace(/\D/g, '');
    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100);
    const client = supabaseAdmin || supabase;
    
    // Buscar downloads
    let q = client
      .from('sitf_downloads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (cnpj) q = q.eq('cnpj', cnpj);
    
    const { data: downloads, error } = await q;
    if (error) return res.status(500).json({ success: false, error: error.message });
    
    // Buscar clientes correspondentes (join manual usando cnpj_limpo)
    const cnpjs = [...new Set((downloads ?? []).map((d: any) => d.cnpj))];
    const { data: clientes } = await client
      .from('clientes')
      .select('cnpj_limpo, razao_social')
      .in('cnpj_limpo', cnpjs);
    
    // Criar mapa de CNPJ -> cliente
    const clientesMap = new Map((clientes ?? []).map((c: any) => [c.cnpj_limpo, c]));
    
    // Combinar dados (NÃO retornar pdf_base64 por segurança - muito grande)
    const items = (downloads ?? []).map((item: any) => {
      const { pdf_base64, ...itemWithoutBase64 } = item; // Remover base64 da resposta
      return {
        ...itemWithoutBase64,
        cliente: clientesMap.get(item.cnpj) ? { razao_social: clientesMap.get(item.cnpj)!.razao_social } : null,
        // Garantir que extracted_data seja incluído se existir
        extracted_data: item.extracted_data || null,
        // Flag indicando se tem base64 disponível para extração
        has_pdf_base64: !!item.pdf_base64,
      };
    });
    
    // Log para debug
    const itemsComDados = items.filter((item: any) => item.extracted_data);
    const itemsComBase64 = items.filter((item: any) => item.has_pdf_base64);
    console.log(`[Sitf History] Total: ${items.length}, Com dados extraídos: ${itemsComDados.length}, Com base64: ${itemsComBase64.length}`);
    
    return res.status(200).json({ success: true, items });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/situacao-fiscal/history/:id
router.delete('/history/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const client = supabaseAdmin || supabase;
    
    const { error } = await client
      .from('sitf_downloads')
      .delete()
      .eq('id', id);
    
    if (error) return res.status(500).json({ success: false, error: error.message });
    
    return res.status(200).json({ success: true, message: 'Registro excluído com sucesso' });
  } catch (err) {
    next(err);
  }
});

// POST /api/situacao-fiscal/extract/:id
// Extrai dados do PDF base64 armazenado no banco (sob demanda)
router.post('/extract/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const client = supabaseAdmin || supabase;
    
    // Buscar registro no banco
    const { data: download, error: fetchError } = await client
      .from('sitf_downloads')
      .select('id, pdf_base64, extracted_data')
      .eq('id', id)
      .single();
    
    if (fetchError || !download) {
      return res.status(404).json({ 
        success: false, 
        error: 'Registro não encontrado' 
      });
    }
    
    // Se já tem dados extraídos, retornar
    if (download.extracted_data) {
      return res.status(200).json({
        success: true,
        data: download.extracted_data,
        cached: true,
      });
    }
    
    // Se não tem base64, não pode extrair
    if (!download.pdf_base64) {
      return res.status(400).json({ 
        success: false, 
        error: 'PDF base64 não disponível para este registro' 
      });
    }
    
    // Extrair dados do PDF
    console.log('[Sitf Extract] Iniciando extração para ID:', id);
    const extractedData = await extractDataFromPdfBase64(download.pdf_base64);
    console.log('[Sitf Extract] Dados extraídos com sucesso:', {
      hasDebitos: extractedData.debitos && extractedData.debitos.length > 0,
      hasPendencias: extractedData.pendencias && extractedData.pendencias.length > 0,
      debitosCount: extractedData.debitos?.length || 0,
      pendenciasCount: extractedData.pendencias?.length || 0,
    });
    
    // Salvar dados extraídos no banco
    const { error: updateError } = await client
      .from('sitf_downloads')
      .update({ extracted_data: extractedData })
      .eq('id', id);
    
    if (updateError) {
      console.error('[Sitf Extract] Erro ao salvar dados extraídos:', updateError);
      // Retornar mesmo assim, mas sem salvar
    } else {
      console.log('[Sitf Extract] Dados salvos no banco com sucesso para ID:', id);
    }
    
    return res.status(200).json({
      success: true,
      data: {
        numPages: extractedData.numPages,
        textLength: extractedData.text.length,
        debitos: extractedData.debitos,
        pendencias: extractedData.pendencias,
        info: extractedData.info,
        metadata: extractedData.metadata,
      },
      cached: false,
    });
  } catch (err: any) {
    console.error('[Sitf Extract] Erro:', err);
    return res.status(500).json({ 
      success: false, 
      error: err.message || 'Erro ao extrair dados do PDF' 
    });
  }
});

// POST /api/situacao-fiscal/test-extract
// Endpoint de teste para extrair dados de um PDF base64
// Permite enviar o base64 e receber os dados extraídos formatados
router.post('/test-extract', async (req, res, next) => {
  try {
    const { base64 } = req.body;
    
    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'Base64 do PDF é obrigatório no body: { "base64": "..." }' 
      });
    }
    
    const extractedData = await extractDataFromPdfBase64(base64);
    
    return res.status(200).json({
      success: true,
      data: {
        numPages: extractedData.numPages,
        textLength: extractedData.text.length,
        text: extractedData.text, // Texto completo extraído
        debitos: extractedData.debitos,
        pendencias: extractedData.pendencias,
        info: extractedData.info,
        metadata: extractedData.metadata,
      }
    });
  } catch (err: any) {
    return res.status(500).json({ 
      success: false, 
      error: err.message || 'Erro ao extrair dados do PDF' 
    });
  }
});

export default router;


