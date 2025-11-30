import { Router } from 'express';
import { SituacaoFiscalOrchestrator, base64ToBuffer, fetchAccessToken, extractDataFromPdfBase64, SerproError, AuthorizationError, NetworkError } from '../services/SituacaoFiscalOrchestrator';
import { createSupabaseAdapter } from '../services/SupabaseAdapter';
import { executeQuery } from '../config/mysql';

const supabase = createSupabaseAdapter() as any;
const supabaseAdmin = createSupabaseAdapter() as any;

const router = Router();

// GET /api/situacao-fiscal/token -> valida acesso ao token (sem expor o token)
router.get('/token', async (_req, res, next) => {
  try {
    const token = await fetchAccessToken();
    if (!token) {
      return res.status(502).json({ 
        success: false, 
        error: 'Falha ao obter token. Verifique as credenciais da API SERPRO.' 
      });
    }
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[Sitf Token] Erro ao obter token:', err);
    
    // Mensagens de erro mais específicas
    let errorMessage = 'Falha ao validar acesso';
    
    if (err.message?.includes('Configuração de token ausente')) {
      errorMessage = 'Credenciais da API SERPRO não configuradas. Verifique as variáveis de ambiente.';
    } else if (err.message?.includes('timeout') || err.code === 'ECONNABORTED') {
      errorMessage = 'Timeout ao conectar com o servidor de autenticação. Tente novamente.';
    } else if (err.response?.status === 401 || err.response?.status === 403) {
      errorMessage = 'Credenciais inválidas. Verifique SERPRO_CLIENT_ID e SERPRO_CLIENT_SECRET.';
    } else if (err.message) {
      errorMessage = err.message;
    }
    
    return res.status(502).json({ 
      success: false, 
      error: errorMessage 
    });
  }
});

// POST /api/situacao-fiscal/:cnpj/download
router.post('/:cnpj/download', async (req, res, next) => {
  try {
    const { cnpj } = req.params;
    
    // Validar CNPJ
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) {
      return res.status(400).json({
        success: false,
        error: 'CNPJ inválido. O CNPJ deve conter 14 dígitos.',
        code: 'INVALID_CNPJ'
      });
    }
    
    const result = await SituacaoFiscalOrchestrator.handleDownload(cnpj);

    if (result.type === 'wait') {
      const stepMessages = {
        protocolo: 'Solicitando protocolo de consulta na Receita Federal...',
        emitir: 'Relatório em processamento na Receita Federal...'
      };
      const message = stepMessages[result.step] || `Relatório em processamento. Tente novamente em ${result.retryAfter}s.`;
      
      res.setHeader('Retry-After', String(result.retryAfter));
      return res.status(202).json({
        success: true,
        message,
        retryAfter: result.retryAfter,
        step: result.step,
      });
    }

    if (result.type === 'ready-url') {
      return res.status(200).json({ 
        success: true, 
        message: 'Relatório gerado com sucesso',
        url: result.url, 
        step: 'concluido' 
      });
    }

    if (result.type === 'ready-base64') {
      return res.status(200).json({ 
        success: true, 
        message: 'Relatório gerado com sucesso e disponível na tabela de downloads',
        step: 'concluido',
        url: result.url,
      });
    }

    return res.status(500).json({ 
      success: false, 
      error: 'Estado inesperado do processamento',
      code: 'UNEXPECTED_STATE'
    });
  } catch (err: any) {
    // Tratar erros específicos com mensagens claras
    if (err instanceof AuthorizationError) {
      return res.status(403).json({
        success: false,
        error: err.message,
        code: 'AUTHORIZATION_ERROR',
        details: 'Verifique se a procuração está autorizada no Portal eCAC da Receita Federal.'
      });
    }
    
    if (err instanceof NetworkError) {
      return res.status(503).json({
        success: false,
        error: err.message,
        code: 'NETWORK_ERROR',
        details: 'Problema de conexão com a Receita Federal. Verifique sua internet e tente novamente.'
      });
    }
    
    if (err instanceof SerproError) {
      const statusCode = err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
      return res.status(statusCode).json({
        success: false,
        error: err.message,
        code: 'SERPRO_ERROR',
        statusCode: err.statusCode
      });
    }
    
    // Erro genérico
    console.error('[Sitf Route] Erro não tratado:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Erro ao processar consulta de situação fiscal',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/situacao-fiscal/companies - Lista empresas com seus registros agrupados
router.get('/companies', async (req, res, next) => {
  try {
    const client = (supabaseAdmin || supabase) as any;
    
    // Buscar todos os downloads agrupados por CNPJ (incluindo extracted_data que contém débitos e pendências)
    const { data: downloads, error } = await client
      .from('sitf_downloads')
      .select('id, cnpj, created_at, file_url, pdf_base64, extracted_data')
      .order('created_at', { ascending: false });
    
    if (error) return res.status(500).json({ success: false, error: error.message });
    
    // Buscar dados extraídos para todos os downloads (usando MySQL diretamente)
    const downloadIds = (downloads ?? []).map((d: any) => d.id);
    let extractedDataMap = new Map();
    
    if (downloadIds.length > 0) {
      try {
        // Usar MySQL diretamente para buscar dados extraídos
        const placeholders = downloadIds.map(() => '?').join(',');
        const query = `
          SELECT * FROM sitf_extracted_data
          WHERE sitf_download_id IN (${placeholders})
        `;
        
        const extractedData = await executeQuery<any[]>(query, downloadIds);
        
        if (extractedData && Array.isArray(extractedData)) {
          extractedData.forEach((item: any) => {
            // Parsear campos JSON
            const parsedItem: any = { ...item };
            if (item.empresa_natureza_juridica) {
              try {
                parsedItem.empresa_natureza_juridica = typeof item.empresa_natureza_juridica === 'string'
                  ? JSON.parse(item.empresa_natureza_juridica)
                  : item.empresa_natureza_juridica;
              } catch (e) {
                console.error('[Sitf Companies] Erro ao parsear natureza jurídica:', e);
              }
            }
            if (item.empresa_cnae_principal) {
              try {
                parsedItem.empresa_cnae_principal = typeof item.empresa_cnae_principal === 'string'
                  ? JSON.parse(item.empresa_cnae_principal)
                  : item.empresa_cnae_principal;
              } catch (e) {
                console.error('[Sitf Companies] Erro ao parsear CNAE:', e);
              }
            }
            if (item.socios) {
              try {
                parsedItem.socios = typeof item.socios === 'string'
                  ? JSON.parse(item.socios)
                  : item.socios;
              } catch (e) {
                console.error('[Sitf Companies] Erro ao parsear sócios:', e);
              }
            }
            if (item.dados_completos) {
              try {
                parsedItem.dados_completos = typeof item.dados_completos === 'string'
                  ? JSON.parse(item.dados_completos)
                  : item.dados_completos;
              } catch (e) {
                console.error('[Sitf Companies] Erro ao parsear dados completos:', e);
              }
            }
            extractedDataMap.set(item.sitf_download_id, parsedItem);
          });
        }
      } catch (err) {
        console.error('[Sitf Companies] Erro ao buscar dados extraídos:', err);
      }
    }
    
    // Agrupar por CNPJ
    const companiesMap = new Map<string, {
      cnpj: string;
      razao_social: string | null;
      total_registros: number;
      ultimo_registro: string;
      registros: Array<{
        id: string;
        created_at: string;
        file_url: string | null;
        has_pdf_base64: boolean;
        extracted_data: any | null;
        debitos_pendencias: any | null;
      }>;
    }>();
    
    // Processar downloads e agrupar por CNPJ
    (downloads ?? []).forEach((item: any) => {
      const cnpj = item.cnpj;
      if (!companiesMap.has(cnpj)) {
        companiesMap.set(cnpj, {
          cnpj,
          razao_social: null,
          total_registros: 0,
          ultimo_registro: item.created_at,
          registros: [],
        });
      }
      
      const company = companiesMap.get(cnpj)!;
      company.total_registros += 1;
      if (new Date(item.created_at) > new Date(company.ultimo_registro)) {
        company.ultimo_registro = item.created_at;
      }
      
      // Buscar dados extraídos para este registro
      const extractedData = extractedDataMap.get(item.id) || null;
      
      // Parsear extracted_data do sitf_downloads (contém débitos e pendências)
      let debitosPendencias = null;
      if (item.extracted_data) {
        try {
          debitosPendencias = typeof item.extracted_data === 'string'
            ? JSON.parse(item.extracted_data)
            : item.extracted_data;
        } catch (e) {
          console.error('[Sitf Companies] Erro ao parsear extracted_data:', e);
        }
      }
      
      company.registros.push({
        id: item.id,
        created_at: item.created_at,
        file_url: item.file_url,
        has_pdf_base64: !!item.pdf_base64,
        extracted_data: extractedData,
        debitos_pendencias: debitosPendencias, // Débitos e pendências do PDF
      });
    });
    
    // Buscar dados dos clientes
    const cnpjs = Array.from(companiesMap.keys());
    if (cnpjs.length > 0) {
      try {
        const { data: clientes, error: clientesError } = await client
          .from('clientes')
          .select('cnpj_limpo, razao_social')
          .in('cnpj_limpo', cnpjs);
        
        if (clientesError) {
          console.error('[Sitf Companies] Erro ao buscar clientes:', clientesError);
          // Continuar mesmo com erro ao buscar clientes
        } else {
          // Atualizar razão social
          (clientes ?? []).forEach((cliente: any) => {
            const company = companiesMap.get(cliente.cnpj_limpo);
            if (company) {
              company.razao_social = cliente.razao_social;
            }
          });
        }
      } catch (clientesErr: any) {
        console.error('[Sitf Companies] Erro ao buscar clientes:', clientesErr);
        // Continuar mesmo com erro ao buscar clientes
      }
    }
    
    // Converter para array e ordenar por último registro (mais recente primeiro)
    const companies = Array.from(companiesMap.values())
      .sort((a, b) => new Date(b.ultimo_registro).getTime() - new Date(a.ultimo_registro).getTime());
    
    return res.status(200).json({ success: true, companies });
  } catch (err) {
    next(err);
  }
});

// GET /api/situacao-fiscal/history?cnpj=...&limit=20
router.get('/history', async (req, res, next) => {
  try {
    const cnpj = String(req.query.cnpj || '').replace(/\D/g, '');
    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100);
    const client = (supabaseAdmin || supabase) as any;
    
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
    let clientesMap = new Map();
    
    // Só buscar clientes se houver CNPJs
    if (cnpjs.length > 0) {
      try {
        const { data: clientes, error: clientesError } = await client
          .from('clientes')
          .select('cnpj_limpo, razao_social')
          .in('cnpj_limpo', cnpjs);
        
        if (clientesError) {
          console.error('[Sitf History] Erro ao buscar clientes:', clientesError);
          // Continuar mesmo com erro ao buscar clientes
        } else {
          // Criar mapa de CNPJ -> cliente
          clientesMap = new Map((clientes ?? []).map((c: any) => [c.cnpj_limpo, c]));
        }
      } catch (clientesErr: any) {
        console.error('[Sitf History] Erro ao buscar clientes:', clientesErr);
        // Continuar mesmo com erro ao buscar clientes
      }
    }
    
    // Combinar dados (NÃO retornar pdf_base64 por segurança - muito grande)
    const items = (downloads ?? []).map((item: any) => {
      const { pdf_base64, ...itemWithoutBase64 } = item; // Remover base64 da resposta
      return {
        ...itemWithoutBase64,
        cliente: clientesMap.get(item.cnpj) ? { razao_social: (clientesMap.get(item.cnpj) as any)?.razao_social } : null,
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

// GET /api/situacao-fiscal/pdf/:id - Servir PDF do banco de dados
router.get('/pdf/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const client = (supabaseAdmin || supabase) as any;
    
    // Buscar registro no banco
    const { data: download, error: fetchError } = await client
      .from('sitf_downloads')
      .select('id, pdf_base64, cnpj')
      .eq('id', id)
      .single();
    
    if (fetchError || !download) {
      return res.status(404).json({ 
        success: false, 
        error: 'Registro não encontrado' 
      });
    }
    
    // Se não tem base64, retornar erro
    if (!download.pdf_base64) {
      return res.status(404).json({ 
        success: false, 
        error: 'PDF não disponível para este registro' 
      });
    }
    
    // Converter base64 para buffer
    const pdfBuffer = Buffer.from(download.pdf_base64, 'base64');
    
    // Retornar PDF com headers corretos
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="situacao-fiscal-${download.cnpj}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error('[Sitf PDF] Erro ao servir PDF:', err);
    return res.status(500).json({ 
      success: false, 
      error: err.message || 'Erro ao servir PDF' 
    });
  }
});

// DELETE /api/situacao-fiscal/history/:id
router.delete('/history/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const client = (supabaseAdmin || supabase) as any;
    
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
    const client = (supabaseAdmin || supabase) as any;
    
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

/**
 * Helper para calcular tempo restante até expiração do protocolo
 */
function calcularTempoRestante(expiresAt: string | null | undefined): {
  dias: number;
  horas: number;
  minutos: number;
  total_segundos: number;
  is_valid: boolean;
  texto_formatado: string;
} | null {
  if (!expiresAt) {
    return null;
  }
  
  try {
    const expires = new Date(expiresAt);
    const now = new Date();
    const diffMs = expires.getTime() - now.getTime();
    const totalSegundos = Math.floor(diffMs / 1000);
    
    if (totalSegundos <= 0) {
      return {
        dias: 0,
        horas: 0,
        minutos: 0,
        total_segundos: 0,
        is_valid: false,
        texto_formatado: 'Expirado',
      };
    }
    
    const dias = Math.floor(totalSegundos / 86400);
    const horas = Math.floor((totalSegundos % 86400) / 3600);
    const minutos = Math.floor((totalSegundos % 3600) / 60);
    
    let texto = '';
    if (dias > 0) {
      texto = `${dias} dia${dias > 1 ? 's' : ''}`;
      if (horas > 0) {
        texto += ` e ${horas} hora${horas > 1 ? 's' : ''}`;
      }
    } else if (horas > 0) {
      texto = `${horas} hora${horas > 1 ? 's' : ''}`;
      if (minutos > 0) {
        texto += ` e ${minutos} minuto${minutos > 1 ? 's' : ''}`;
      }
    } else {
      texto = `${minutos} minuto${minutos > 1 ? 's' : ''}`;
    }
    
    return {
      dias,
      horas,
      minutos,
      total_segundos: totalSegundos,
      is_valid: true,
      texto_formatado: `Expira em ${texto}`,
    };
  } catch (error) {
    console.error('[Sitf Protocols] Erro ao calcular tempo restante:', error);
    return null;
  }
}

// GET /api/situacao-fiscal/protocols/archived
// Lista todos os protocolos arquivados (que têm protocolo salvo)
router.get('/protocols/archived', async (req, res, next) => {
  try {
    // Buscar todos os protocolos que têm protocolo salvo
    const query = `
      SELECT 
        sp.cnpj,
        sp.protocolo,
        sp.status,
        sp.expires_at,
        sp.next_eligible_at,
        sp.created_at,
        sp.updated_at,
        c.razao_social
      FROM sitf_protocols sp
      LEFT JOIN clientes c ON c.cnpj_limpo = sp.cnpj
      WHERE sp.protocolo IS NOT NULL 
        AND sp.protocolo != ''
      ORDER BY sp.updated_at DESC
    `;
    
    const protocols = await executeQuery<any[]>(query, []);
    
    console.log('[Sitf Protocols Archived] Protocolos encontrados:', protocols?.length || 0);
    
    // Processar protocolos e calcular tempo restante
    const archivedProtocols = (protocols || []).map((p: any) => {
      let tempoRestante = calcularTempoRestante(p.expires_at);
      
      // Se não tem expires_at, calcular baseado na data de criação ou atualização (protocolos antigos)
      if (!p.expires_at) {
        // Usar updated_at se disponível, senão created_at
        const referenceDate = p.updated_at ? new Date(p.updated_at) : (p.created_at ? new Date(p.created_at) : null);
        
        if (referenceDate) {
          const now = new Date();
          const diffHours = (now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60);
          
          if (diffHours > 24) {
            // Protocolo antigo, já expirado (mais de 24h desde criação/atualização)
            tempoRestante = {
              dias: 0,
              horas: 0,
              minutos: 0,
              total_segundos: 0,
              is_valid: false,
              texto_formatado: 'Expirado',
            };
          } else {
            // Protocolo antigo mas ainda dentro de 24h, calcular tempo restante
            const expiresAt = new Date(referenceDate);
            expiresAt.setHours(expiresAt.getHours() + 24);
            tempoRestante = calcularTempoRestante(expiresAt.toISOString());
          }
        } else {
          // Sem data de referência, considerar expirado
          tempoRestante = {
            dias: 0,
            horas: 0,
            minutos: 0,
            total_segundos: 0,
            is_valid: false,
            texto_formatado: 'Expirado',
          };
        }
      }
      
      return {
        cnpj: p.cnpj,
        razao_social: p.razao_social || null,
        protocolo: p.protocolo,
        protocolo_truncado: p.protocolo ? `${p.protocolo.substring(0, 30)}...` : null,
        status: p.status,
        expires_at: p.expires_at,
        next_eligible_at: p.next_eligible_at,
        created_at: p.created_at,
        updated_at: p.updated_at,
        tempo_restante: tempoRestante,
      };
    });
    
    // Desabilitar cache para evitar problemas com 304
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    return res.status(200).json({
      success: true,
      protocols: archivedProtocols,
      total: archivedProtocols.length,
    });
  } catch (error: any) {
    console.error('[Sitf Protocols Archived] Erro:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao buscar protocolos arquivados',
      details: error.message,
    });
  }
});

// POST /api/situacao-fiscal/protocols/:cnpj/restore
// Restaura um protocolo para fazer nova consulta
router.post('/protocols/:cnpj/restore', async (req, res, next) => {
  try {
    const { cnpj } = req.params;
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    
    if (cnpjLimpo.length !== 14) {
      return res.status(400).json({
        success: false,
        error: 'CNPJ inválido',
      });
    }
    
    // Buscar protocolo
    const query = `
      SELECT * FROM sitf_protocols
      WHERE cnpj = ?
      LIMIT 1
    `;
    
    const results = await executeQuery<any[]>(query, [cnpjLimpo]);
    
    if (!results || results.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Protocolo não encontrado para este CNPJ',
      });
    }
    
    const protocol: any = results[0];
    
    if (!protocol.protocolo) {
      return res.status(400).json({
        success: false,
        error: 'Este CNPJ não possui protocolo salvo',
      });
    }
    
    // Verificar se protocolo ainda é válido
    let tempoRestante = calcularTempoRestante(protocol.expires_at);
    let isProtocolValid = tempoRestante?.is_valid ?? false;
    
    // Se não tem expires_at ou está expirado, verificar baseado na data de criação/atualização
    if (!isProtocolValid) {
      if (!protocol.expires_at) {
        // Protocolo antigo sem expires_at - verificar se foi criado/atualizado há menos de 24h
        const referenceDate = protocol.updated_at ? new Date(protocol.updated_at) : (protocol.created_at ? new Date(protocol.created_at) : null);
        if (referenceDate) {
          const now = new Date();
          const diffHours = (now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60);
          if (diffHours > 24) {
            return res.status(400).json({
              success: false,
              error: 'Protocolo expirado. É necessário solicitar um novo protocolo.',
              expires_at: protocol.expires_at,
              diff_hours: diffHours.toFixed(2),
            });
          }
          // Protocolo ainda válido (menos de 24h), permitir usar
          console.log('[Sitf Protocols Restore] ✅ Protocolo antigo sem expires_at, mas ainda válido (criado há', diffHours.toFixed(2), 'horas)');
          isProtocolValid = true;
          // Calcular tempo restante baseado na data de referência
          const expiresAt = new Date(referenceDate);
          expiresAt.setHours(expiresAt.getHours() + 24);
          tempoRestante = calcularTempoRestante(expiresAt.toISOString());
        } else {
          return res.status(400).json({
            success: false,
            error: 'Protocolo sem data de referência. É necessário solicitar um novo protocolo.',
          });
        }
      } else {
        // Tem expires_at mas está expirado
        return res.status(400).json({
          success: false,
          error: 'Protocolo expirado. É necessário solicitar um novo protocolo.',
          expires_at: protocol.expires_at,
        });
      }
    }
    
    if (!isProtocolValid) {
      return res.status(400).json({
        success: false,
        error: 'Protocolo inválido. É necessário solicitar um novo protocolo.',
      });
    }
    
    // Verificar se pode fazer nova consulta (next_eligible_at)
    const now = new Date();
    let canUseNow = true;
    let waitSeconds = 0;
    
    if (protocol.next_eligible_at) {
      const nextEligible = new Date(protocol.next_eligible_at);
      if (nextEligible > now) {
        canUseNow = false;
        waitSeconds = Math.ceil((nextEligible.getTime() - now.getTime()) / 1000);
      }
    }
    
    // Se pode usar agora, fazer a consulta diretamente
    if (canUseNow) {
      try {
        const result = await SituacaoFiscalOrchestrator.handleDownload(cnpj);
        
        if (result.type === 'wait') {
          return res.status(202).json({
            success: true,
            message: 'Consulta iniciada. Aguarde o processamento.',
            retryAfter: result.retryAfter,
            step: result.step,
          });
        }
        
        if (result.type === 'ready-url' || result.type === 'ready-base64') {
          return res.status(200).json({
            success: true,
            message: 'Relatório gerado com sucesso usando protocolo restaurado',
            url: result.url,
            step: 'concluido',
          });
        }
        
        return res.status(500).json({
          success: false,
          error: 'Estado inesperado do processamento',
        });
      } catch (error: any) {
        console.error('[Sitf Protocols Restore] Erro ao fazer consulta:', error);
        return res.status(500).json({
          success: false,
          error: 'Erro ao fazer consulta com protocolo restaurado',
          details: error.message,
        });
      }
    } else {
      // Precisa aguardar
      return res.status(202).json({
        success: true,
        message: `Protocolo restaurado. Aguarde ${Math.ceil(waitSeconds / 60)} minutos antes de fazer nova consulta.`,
        retryAfter: waitSeconds,
        step: 'wait',
        next_eligible_at: protocol.next_eligible_at,
      });
    }
  } catch (error: any) {
    console.error('[Sitf Protocols Restore] Erro:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao restaurar protocolo',
      details: error.message,
    });
  }
});

export default router;


