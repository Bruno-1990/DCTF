import { Router } from 'express';
import { SituacaoFiscalOrchestrator, base64ToBuffer, fetchAccessToken } from '../services/SituacaoFiscalOrchestrator';
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
    
    // Combinar dados
    const items = (downloads ?? []).map((item: any) => ({
      ...item,
      cliente: clientesMap.get(item.cnpj) ? { razao_social: clientesMap.get(item.cnpj)!.razao_social } : null,
    }));
    
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

export default router;


