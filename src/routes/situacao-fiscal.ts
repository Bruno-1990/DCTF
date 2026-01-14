import { Router } from 'express';
import multer from 'multer';
import { SituacaoFiscalOrchestrator, base64ToBuffer, fetchAccessToken, extractDataFromPdfBase64, SerproError, AuthorizationError, NetworkError } from '../services/SituacaoFiscalOrchestrator';
import { createSupabaseAdapter } from '../services/SupabaseAdapter';
import { executeQuery } from '../config/mysql';
import { Cliente } from '../models/Cliente';
import { extrairSociosComPython, converterSociosPythonParaNode } from '../utils/pythonExtractor';

const supabase = createSupabaseAdapter() as any;
const supabaseAdmin = createSupabaseAdapter() as any;

const router = Router();

// Configurar multer para upload de PDF
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB máximo
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos PDF são permitidos'));
    }
  },
});

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
    
    // Buscar todos os downloads do MySQL agrupados por CNPJ
    const downloadsQuery = `
      SELECT id, cnpj, created_at, file_url, pdf_base64, extracted_data
      FROM sitf_downloads
      ORDER BY created_at DESC
    `;
    const downloadsResult = await executeQuery(downloadsQuery);
    const downloads = Array.isArray(downloadsResult) ? downloadsResult : [];
    
    // Buscar dados extraídos para todos os downloads
    const downloadIds = downloads.map((d: any) => d.id);
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
    
    // Buscar dados dos clientes do MySQL
    const cnpjs = Array.from(companiesMap.keys());
    if (cnpjs.length > 0) {
      try {
        const placeholders = cnpjs.map(() => '?').join(',');
        const clientesQuery = `SELECT cnpj_limpo, razao_social FROM clientes WHERE cnpj_limpo IN (${placeholders})`;
        const clientesResult = await executeQuery(clientesQuery, cnpjs);
        
        if (Array.isArray(clientesResult)) {
          // Atualizar razão social
          clientesResult.forEach((cliente: any) => {
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
    const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);
    
    console.log(`[Sitf History] Parâmetros recebidos: cnpj=${cnpj || 'todos'}, limit=${limit}, offset=${offset}`);
    
    try {
      // Buscar do MySQL
      
      // Query para contar total
      let countQuery = 'SELECT COUNT(*) as total FROM sitf_downloads';
      let countParams: any[] = [];
      
      if (cnpj && cnpj.length === 14) {
        countQuery += ' WHERE cnpj = ?';
        countParams.push(cnpj);
      }
      
      console.log(`[Sitf History] Executando count query:`, countQuery, countParams);
      const countResult = await executeQuery(countQuery, countParams);
      const totalCount = countResult && countResult.length > 0 ? countResult[0].total : 0;
      
      console.log(`[Sitf History] Total de registros: ${totalCount}`);
      
      // Query para buscar dados com paginação
      // IMPORTANTE: LIMIT e OFFSET não podem ser placeholders, devem ser valores literais
      let dataQuery = `
        SELECT 
          id, cnpj, file_url, created_at, extracted_data, pdf_base64
        FROM sitf_downloads
      `;
      let dataParams: any[] = [];
      
      if (cnpj && cnpj.length === 14) {
        dataQuery += ' WHERE cnpj = ?';
        dataParams.push(cnpj);
      }
      
      // Garantir que limit e offset são números inteiros seguros
      const safeLimit = Math.max(1, Math.min(100, parseInt(String(limit), 10) || 10));
      const safeOffset = Math.max(0, parseInt(String(offset), 10) || 0);
      
      // Inserir LIMIT e OFFSET diretamente na query (não como placeholders)
      dataQuery += ` ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;
      
      console.log(`[Sitf History] Executando query MySQL:`, dataQuery);
      console.log(`[Sitf History] Parâmetros:`, dataParams);
      console.log(`[Sitf History] Paginação: LIMIT ${safeLimit}, OFFSET ${safeOffset}`);
      
      const downloadsResult = await executeQuery(dataQuery, dataParams.length > 0 ? dataParams : []);
      const downloadsArray = Array.isArray(downloadsResult) ? downloadsResult : [];
      
      console.log(`[Sitf History] Downloads encontrados: ${downloadsArray.length} de ${totalCount} total`);
      if (downloadsArray.length > 0) {
        console.log(`[Sitf History] Primeiro registro:`, downloadsArray[0]);
      }
      
      // Buscar clientes correspondentes do MySQL
      const cnpjs = [...new Set(downloadsArray.map((d: any) => d.cnpj))];
    let clientesMap = new Map();
    
    // Só buscar clientes se houver CNPJs
    if (cnpjs.length > 0) {
      try {
          const placeholders = cnpjs.map(() => '?').join(',');
          const clientesQuery = `SELECT cnpj_limpo, razao_social FROM clientes WHERE cnpj_limpo IN (${placeholders})`;
          const clientesResult = await executeQuery(clientesQuery, cnpjs);
          
          if (Array.isArray(clientesResult)) {
          // Criar mapa de CNPJ -> cliente
            clientesMap = new Map(clientesResult.map((c: any) => [c.cnpj_limpo, c]));
            console.log(`[Sitf History] Clientes encontrados: ${clientesMap.size} de ${cnpjs.length} CNPJs`);
        }
      } catch (clientesErr: any) {
        console.error('[Sitf History] Erro ao buscar clientes:', clientesErr);
        // Continuar mesmo com erro ao buscar clientes
      }
    }
    
    // Combinar dados (NÃO retornar pdf_base64 por segurança - muito grande)
      const items = downloadsArray.map((item: any) => {
      const { pdf_base64, ...itemWithoutBase64 } = item; // Remover base64 da resposta
        
        // Parsear extracted_data se for string JSON (MySQL retorna JSON como string)
        let extractedData = item.extracted_data;
        if (typeof extractedData === 'string') {
          try {
            extractedData = JSON.parse(extractedData);
          } catch (e) {
            console.warn(`[Sitf History] Erro ao parsear extracted_data para ${item.id}:`, e);
            extractedData = null;
          }
        }
        
      return {
        ...itemWithoutBase64,
        cliente: clientesMap.get(item.cnpj) ? { razao_social: (clientesMap.get(item.cnpj) as any)?.razao_social } : null,
          // Garantir que extracted_data seja incluído se existir (já parseado)
          extracted_data: extractedData || null,
        // Flag indicando se tem base64 disponível para extração
        has_pdf_base64: !!item.pdf_base64,
      };
    });
    
    // Log para debug
    const itemsComDados = items.filter((item: any) => item.extracted_data);
    const itemsComBase64 = items.filter((item: any) => item.has_pdf_base64);
    console.log(`[Sitf History] Total: ${items.length}, Com dados extraídos: ${itemsComDados.length}, Com base64: ${itemsComBase64.length}`);
    
      // Garantir que sempre retornamos um array, mesmo que vazio
      const totalPages = Math.ceil((totalCount || 0) / limit);
      const currentPage = Math.floor(offset / limit) + 1;
      
      const response = { 
        success: true, 
        items: items || [],
        total: totalCount || 0,
        limit: limit,
        offset: offset,
        showing: items.length,
        page: currentPage,
        totalPages: totalPages
      };
      console.log(`[Sitf History] Retornando ${response.items.length} itens de ${response.total} total (página ${currentPage}/${totalPages})`);
      
      return res.status(200).json(response);
    } catch (queryError: any) {
      console.error('[Sitf History] Erro ao executar query MySQL:', queryError);
      return res.status(500).json({ 
        success: false, 
        error: queryError.message || 'Erro ao buscar histórico do banco de dados',
        details: process.env.NODE_ENV === 'development' ? queryError.stack : undefined
      });
    }
  } catch (err) {
    console.error('[Sitf History] Erro geral:', err);
    next(err);
  }
});

// GET /api/situacao-fiscal/pdf/:id - Servir PDF do banco de dados
router.get('/pdf/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Buscar registro no MySQL
    const query = 'SELECT id, pdf_base64, cnpj FROM sitf_downloads WHERE id = ?';
    const result = await executeQuery(query, [id]);
    
    if (!result || result.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Registro não encontrado' 
      });
    }
    
    const download = result[0];
    
    // Se não tem base64, retornar erro
    if (!download.pdf_base64) {
      return res.status(404).json({ 
        success: false, 
        error: 'PDF não disponível para este registro' 
      });
    }
    
    // Atualizar a data quando o PDF for baixado
    // Atualizar created_at para que o registro apareça como mais recente na lista
    try {
      const updateQuery = 'UPDATE sitf_downloads SET created_at = NOW() WHERE id = ?';
      await executeQuery(updateQuery, [id]);
      console.log(`[Sitf PDF] Data de download atualizada para o registro ID: ${id}`);
    } catch (updateError: any) {
      // Log o erro mas não impede o download
      console.error('[Sitf PDF] Erro ao atualizar data do download:', updateError);
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
    
    const query = 'DELETE FROM sitf_downloads WHERE id = ?';
    const result = await executeQuery(query, [id]);
    
    // Verificar se algum registro foi deletado
    if (result && (result as any).affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Registro não encontrado' 
      });
    }
    
    return res.status(200).json({ success: true, message: 'Registro excluído com sucesso' });
  } catch (err: any) {
    console.error('[Sitf History Delete] Erro:', err);
    return res.status(500).json({ 
      success: false, 
      error: err.message || 'Erro ao excluir registro' 
    });
  }
});

// POST /api/situacao-fiscal/extract/:id
// Extrai dados do PDF base64 armazenado no banco (sob demanda)
router.post('/extract/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Buscar registro no MySQL
    const query = 'SELECT id, pdf_base64, extracted_data FROM sitf_downloads WHERE id = ?';
    const result = await executeQuery(query, [id]);
    
    if (!result || result.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Registro não encontrado' 
      });
    }
    
    const download = result[0];
    
    // Parsear extracted_data se for string JSON
    let extractedDataExisting = download.extracted_data;
    if (typeof extractedDataExisting === 'string') {
      try {
        extractedDataExisting = JSON.parse(extractedDataExisting);
      } catch (e) {
        extractedDataExisting = null;
      }
    }
    
    // Se já tem dados extraídos, retornar
    if (extractedDataExisting) {
      return res.status(200).json({
        success: true,
        data: extractedDataExisting,
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
      hasSociosPython: extractedData.socios && extractedData.socios.length > 0,
      cnpjExtraidoPython: extractedData.cnpj || 'não extraído',
      debitosCount: extractedData.debitos?.length || 0,
      pendenciasCount: extractedData.pendencias?.length || 0,
      sociosPythonCount: extractedData.socios?.length || 0,
    });
    
    // Salvar dados extraídos no MySQL
    const updateQuery = 'UPDATE sitf_downloads SET extracted_data = ? WHERE id = ?';
    try {
      await executeQuery(updateQuery, [JSON.stringify(extractedData), id]);
      console.log('[Sitf Extract] Dados salvos no banco com sucesso para ID:', id);
    } catch (updateError: any) {
      console.error('[Sitf Extract] Erro ao salvar dados extraídos:', updateError);
      // Retornar mesmo assim, mas sem salvar
    }

    // Atualizar sócios do cliente com participação se houver dados
    console.log('[Sitf Extract] Verificando sócios extraídos:', {
      hasSocios: !!extractedData.socios,
      sociosCount: Array.isArray(extractedData.socios) ? extractedData.socios.length : 0,
      socios: extractedData.socios,
    });
    
    if (extractedData.socios && Array.isArray(extractedData.socios) && extractedData.socios.length > 0) {
      try {
        const cnpjLimpo = download.cnpj?.replace(/\D/g, '');
        console.log('[Sitf Extract] CNPJ limpo para busca:', cnpjLimpo);
        
        if (cnpjLimpo && cnpjLimpo.length === 14) {
          // Buscar cliente pelo CNPJ
          const clienteModel = new Cliente();
          const clienteResult = await clienteModel.findByCNPJ(cnpjLimpo);
          
          console.log('[Sitf Extract] Resultado da busca do cliente:', {
            success: clienteResult.success,
            hasData: !!clienteResult.data,
            clienteId: clienteResult.data?.id,
          });
          
          if (clienteResult.success && clienteResult.data) {
            const cliente = clienteResult.data;
            
            // ✅ Usar Capital Social do cadastro do cliente (vem da API da Receita)
            // A Situação Fiscal fornece apenas a porcentagem de cada sócio
            // Cálculo: valor = Capital Social (cliente) × porcentagem (SITF) / 100
            const capitalSocial = (cliente as any).capital_social;
            
            console.log('[Sitf Extract] Capital Social do cliente (Receita):', capitalSocial);
            
            // Preparar sócios com participação e CPF
            // ✅ IMPORTANTE: Usar exatamente os percentuais da Situação Fiscal, sem ajustes
            // Apenas calcular os valores usando: Capital Social × Porcentagem (SITF) / 100
            // ✅ Suporte para formato Python (qual) ou formato Node.js (qualificacao)
            // ✅ NOVO: Filtrar sócios que contenham "Qualif. Resp." ou "CONTRATANTE" antes de processar
            const sociosFiltrados = extractedData.socios.filter((s: any) => {
              const nome = ((s.nome || '') + '').toUpperCase();
              const qual = ((s.qual || s.qualificacao || '') + '').toUpperCase();
              const temQualifResp = nome.includes('QUALIF. RESP') || nome.includes('QUALIF RESP') || 
                                    qual.includes('QUALIF. RESP') || qual.includes('QUALIF RESP');
              const temContratante = nome.includes('CONTRATANTE: 32.401.481') || nome.includes('CONTRATANTE: 32401481') ||
                                     qual.includes('CONTRATANTE: 32.401.481') || qual.includes('CONTRATANTE: 32401481');
              
              if (temQualifResp) {
                console.log(`[Sitf Extract] ⚠️ Sócio ignorado (contém Qualif. Resp.): ${s.nome}`);
              }
              
              if (temContratante) {
                console.log(`[Sitf Extract] ⚠️ Sócio ignorado (contém CONTRATANTE): ${s.nome}`);
              }
              
              return !temQualifResp && !temContratante;
            });
            
            console.log(`[Sitf Extract] ✅ Filtrados ${extractedData.socios.length - sociosFiltrados.length} sócios com "Qualif. Resp." ou "CONTRATANTE" (de ${extractedData.socios.length} total)`);
            
            const sociosComParticipacao = sociosFiltrados.map((s: any) => ({
              nome: s.nome || '',
              cpf: s.cpf || null, // CPF/CNPJ extraído da SITF (Python ou Node.js)
              qual: s.qual || s.qualificacao || null, // Suporte para ambos os formatos
              // Usar verificação explícita para não converter 0 em null
              participacao_percentual: s.participacao_percentual !== null && s.participacao_percentual !== undefined
                ? s.participacao_percentual
                : 0, // Se não houver participação definida, usar 0 (não null)
            }));
            
            // Log para verificação (sem ajustar)
            const totalPercentual = sociosComParticipacao.reduce((sum, s) => {
              const percent = s.participacao_percentual || 0;
              return sum + percent;
            }, 0);
            
            console.log(`[Sitf Extract] Total de sócios: ${sociosComParticipacao.length}`);
            console.log(`[Sitf Extract] Soma dos percentuais (da SITF): ${totalPercentual.toFixed(2)}%`);
            console.log('[Sitf Extract] Sócios preparados para atualização (sem ajuste de percentuais):', sociosComParticipacao);

            // Atualizar sócios
            const updateResult = await clienteModel.atualizarSociosComParticipacao(
              cliente.id!,
              sociosComParticipacao,
              capitalSocial
            );
            
            console.log('[Sitf Extract] Resultado da atualização de sócios:', updateResult);
          } else {
            console.warn('[Sitf Extract] Cliente não encontrado para CNPJ:', cnpjLimpo);
          }
        } else {
          console.warn('[Sitf Extract] CNPJ inválido:', download.cnpj);
        }
      } catch (sociosError: any) {
        console.error('[Sitf Extract] Erro ao atualizar sócios:', sociosError);
        console.error('[Sitf Extract] Stack trace:', sociosError.stack);
        // Não falhar a extração se houver erro ao atualizar sócios
      }
    } else {
      console.log('[Sitf Extract] Nenhum sócio encontrado nos dados extraídos');
    }
    
    return res.status(200).json({
      success: true,
      data: {
        numPages: extractedData.numPages,
        textLength: extractedData.text.length,
        debitos: extractedData.debitos,
        pendencias: extractedData.pendencias,
        socios: extractedData.socios, // ✅ NOVO: Incluir sócios extraídos via Python
        cnpj: extractedData.cnpj, // ✅ NOVO: Incluir CNPJ extraído via Python
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
        socios: extractedData.socios, // ✅ NOVO: Incluir sócios extraídos via Python
        cnpj: extractedData.cnpj, // ✅ NOVO: Incluir CNPJ extraído via Python
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
    const allArchivedProtocols = (protocols || []).map((p: any) => {
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
    
    // Filtrar apenas protocolos válidos (is_valid === true)
    const archivedProtocols = allArchivedProtocols.filter((p) => {
      return p.tempo_restante?.is_valid === true;
    });
    
    console.log('[Sitf Protocols Archived] Total encontrados:', allArchivedProtocols.length, '| Válidos:', archivedProtocols.length);
    
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
        
        // Verificar se o erro indica que o protocolo está inválido
        const isProtocolInvalid = error.isProtocolInvalid || 
                                  (error.message && (
                                    error.message.includes('protocolo') && 
                                    error.message.includes('não é mais válido')
                                  ));
        
        if (isProtocolInvalid) {
          // Invalidar o protocolo no banco de dados
          try {
            const invalidateQuery = `
              UPDATE sitf_protocols
              SET protocolo = NULL, status = 'erro'
              WHERE cnpj = ?
            `;
            await executeQuery(invalidateQuery, [cnpjLimpo]);
            console.log('[Sitf Protocols Restore] Protocolo invalidado no banco de dados');
          } catch (invalidateError) {
            console.error('[Sitf Protocols Restore] Erro ao invalidar protocolo:', invalidateError);
          }
          
          return res.status(400).json({
            success: false,
            error: 'O protocolo utilizado não é mais válido. É necessário solicitar um novo protocolo.',
            protocolInvalid: true,
          });
        }
        
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

/**
 * Função auxiliar para aguardar com verificação periódica de cancelamento
 */
async function aguardarComCancelamento(
  progressId: string,
  tempoTotalMs: number,
  intervaloVerificacaoMs: number = 1000
): Promise<boolean> {
  const inicio = Date.now();
  const fim = inicio + tempoTotalMs;
  
  while (Date.now() < fim) {
    // Verificar cancelamento a cada intervalo
    if (global.sitfLoteProgress[progressId]?.status === 'cancelada') {
      return false; // Cancelado
    }
    
    // Aguardar intervalo de verificação (máximo até o fim)
    const tempoRestante = fim - Date.now();
    const tempoAguardar = Math.min(intervaloVerificacaoMs, tempoRestante);
    
    if (tempoAguardar > 0) {
      await new Promise(resolve => setTimeout(resolve, tempoAguardar));
    } else {
      break;
    }
  }
  
  // Verificar uma última vez antes de retornar
  return global.sitfLoteProgress[progressId]?.status !== 'cancelada';
}

/**
 * Função auxiliar para aguardar conclusão completa de uma consulta
 * Faz polling até que o PDF esteja pronto (status 200)
 */
async function aguardarConclusaoConsulta(
  cnpjLimpo: string,
  baseUrl: string,
  progressId: string,
  maxTentativas: number = 60 // Máximo de 5 minutos (60 * 5s)
): Promise<{ sucesso: boolean; erro?: string }> {
  let tentativas = 0;
  let retryAfter = 5; // Começar com 5 segundos
  let rateLimitCount = 0; // Contador de rate limits consecutivos

  while (tentativas < maxTentativas) {
    // Verificar se foi cancelado
    if (global.sitfLoteProgress[progressId]?.status === 'cancelada') {
      return { sucesso: false, erro: 'Consulta cancelada pelo usuário' };
    }

    try {
      const downloadRes = await fetch(`${baseUrl}/api/situacao-fiscal/${cnpjLimpo}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      // Se retornou 202, ainda está processando - aguardar e tentar novamente
      if (downloadRes.status === 202) {
        const body = await downloadRes.json().catch(() => ({})) as any;
        retryAfter = Number(downloadRes.headers.get('Retry-After') || (body as any)?.retryAfter || 5);
        
        // Resetar contador de rate limit quando receber 202 (processo normal)
        rateLimitCount = 0;
        
        // Atualizar status no progresso
        global.sitfLoteProgress[progressId].cnpjAtual = `${cnpjLimpo} (${(body as any)?.step || 'processando'}...)`;
        
        // Aguardar antes de tentar novamente (com verificação de cancelamento)
        const naoCancelado = await aguardarComCancelamento(progressId, retryAfter * 1000);
        if (!naoCancelado) {
          return { sucesso: false, erro: 'Consulta cancelada pelo usuário' };
        }
        tentativas++;
        continue;
      }

      // Se retornou 200, consulta concluída com sucesso
      if (downloadRes.status === 200) {
        return { sucesso: true };
      }

      // Se retornou 429 (Too Many Requests), aguardar mais tempo e tentar novamente
      if (downloadRes.status === 429) {
        rateLimitCount++;
        const retryAfterHeader = downloadRes.headers.get('Retry-After');
        
        // Backoff exponencial: 30s, 60s, 90s, até 120s máximo
        // IMPORTANTE: Limitar o Retry-After da API a no máximo 120s (2 minutos)
        // A API pode retornar valores muito altos (ex: 716s), mas não devemos aguardar tanto
        const retryAfterValue = retryAfterHeader ? parseInt(retryAfterHeader, 10) : null;
        
        // Se o Retry-After for muito alto (> 300s = 5 minutos), marcar como erro e passar para o próximo
        if (retryAfterValue && retryAfterValue > 300) {
          return { 
            sucesso: false, 
            erro: `Rate limit muito alto (${retryAfterValue}s). Este CNPJ será pulado. Tente novamente mais tarde.` 
          };
        }
        
        const waitTime = retryAfterValue 
          ? Math.min(120, retryAfterValue) // Limitar a no máximo 2 minutos
          : Math.min(120, 30 + (rateLimitCount - 1) * 30);
        
        // Se exceder 3 rate limits consecutivos, desistir
        if (rateLimitCount > 3) {
          return { sucesso: false, erro: `Rate limit excedido múltiplas vezes. Aguarde alguns minutos antes de tentar novamente.` };
        }
        
        const waitTimeMin = Math.floor(waitTime / 60);
        const waitTimeSec = waitTime % 60;
        const waitTimeDisplay = waitTimeMin > 0 ? `${waitTimeMin}m ${waitTimeSec}s` : `${waitTimeSec}s`;
        
        console.log(`[SITF Lote] Rate limit atingido para ${cnpjLimpo} (tentativa ${rateLimitCount}/3). Aguardando ${waitTimeDisplay} (${waitTime}s)...`);
        global.sitfLoteProgress[progressId].cnpjAtual = `${cnpjLimpo} (rate limit ${rateLimitCount}/3 - aguardando ${waitTimeDisplay}...)`;
        
        // Aguardar com verificação de cancelamento
        const naoCancelado = await aguardarComCancelamento(progressId, waitTime * 1000);
        if (!naoCancelado) {
          return { sucesso: false, erro: 'Consulta cancelada pelo usuário' };
        }
        tentativas++;
        continue; // Tentar novamente
      }

      // Se retornou erro, tentar obter mensagem
      const errorBody = await downloadRes.json().catch(() => ({})) as any;
      const errorMsg = (errorBody as any)?.error || (errorBody as any)?.message || `Erro HTTP ${downloadRes.status}`;
      
      // Se for erro 429 mas não foi capturado acima, tratar como rate limit
      if (downloadRes.status === 429 || errorMsg.includes('429') || errorMsg.toLowerCase().includes('rate limit')) {
        rateLimitCount++;
        if (rateLimitCount > 3) {
          return { sucesso: false, erro: `Rate limit excedido múltiplas vezes. Aguarde alguns minutos antes de tentar novamente.` };
        }
        const waitTime = Math.min(120, 30 + (rateLimitCount - 1) * 30);
        console.log(`[SITF Lote] Rate limit detectado para ${cnpjLimpo} (tentativa ${rateLimitCount}/3). Aguardando ${waitTime}s...`);
        global.sitfLoteProgress[progressId].cnpjAtual = `${cnpjLimpo} (rate limit ${rateLimitCount}/3 - aguardando ${waitTime}s...)`;
        
        // Aguardar com verificação de cancelamento
        const naoCancelado = await aguardarComCancelamento(progressId, waitTime * 1000);
        if (!naoCancelado) {
          return { sucesso: false, erro: 'Consulta cancelada pelo usuário' };
        }
        tentativas++;
        continue;
      }
      
      return { sucesso: false, erro: errorMsg };
    } catch (error: any) {
      // Se o erro mencionar rate limit, tratar como tal
      if (error.message?.includes('429') || error.message?.toLowerCase().includes('rate limit')) {
        rateLimitCount++;
        if (rateLimitCount > 3) {
          return { sucesso: false, erro: `Rate limit excedido múltiplas vezes. Aguarde alguns minutos antes de tentar novamente.` };
        }
        const waitTime = Math.min(120, 30 + (rateLimitCount - 1) * 30);
        console.log(`[SITF Lote] Rate limit detectado (exceção) para ${cnpjLimpo} (tentativa ${rateLimitCount}/3). Aguardando ${waitTime}s...`);
        global.sitfLoteProgress[progressId].cnpjAtual = `${cnpjLimpo} (rate limit ${rateLimitCount}/3 - aguardando ${waitTime}s...)`;
        
        // Aguardar com verificação de cancelamento
        const naoCancelado = await aguardarComCancelamento(progressId, waitTime * 1000);
        if (!naoCancelado) {
          return { sucesso: false, erro: 'Consulta cancelada pelo usuário' };
        }
        tentativas++;
        continue;
      }
      return { sucesso: false, erro: error.message || 'Erro de conexão' };
    }
  }

  return { sucesso: false, erro: 'Timeout: consulta não concluída no tempo esperado' };
}

/**
 * Função auxiliar para converter data ISO para formato MySQL
 */
function formatarDataParaMySQL(dataISO: string | null | undefined): string | null {
  if (!dataISO) return null;
  try {
    const date = new Date(dataISO);
    // Formato MySQL: YYYY-MM-DD HH:MM:SS
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (e) {
    console.warn('[SITF Lote] Erro ao formatar data para MySQL:', e);
    return null;
  }
}

/**
 * Função auxiliar para salvar progresso no banco de dados
 */
async function salvarProgressoNoBanco(progressId: string, progressData: any): Promise<void> {
  try {
    const query = `
      INSERT INTO sitf_lote_progress (
        progress_id, total, processados, sucessos, erros, porcentagem, status,
        cnpj_atual, apenas_faltantes, total_original, ja_processados,
        erros_detalhados, ultimo_erro_rate_limit, iniciado_em, finalizado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        total = VALUES(total),
        processados = VALUES(processados),
        sucessos = VALUES(sucessos),
        erros = VALUES(erros),
        porcentagem = VALUES(porcentagem),
        status = VALUES(status),
        cnpj_atual = VALUES(cnpj_atual),
        ultimo_erro_rate_limit = VALUES(ultimo_erro_rate_limit),
        erros_detalhados = VALUES(erros_detalhados),
        finalizado_em = VALUES(finalizado_em)
    `;
    
    // Converter datas ISO para formato MySQL
    const iniciadoEm = formatarDataParaMySQL(progressData.iniciado_em) || formatarDataParaMySQL(new Date().toISOString());
    const finalizadoEm = formatarDataParaMySQL(progressData.finalizado_em);
    
    const params = [
      progressId,
      progressData.total || 0,
      progressData.processados || 0,
      progressData.sucessos || 0,
      progressData.erros || 0,
      progressData.porcentagem || 0,
      progressData.status || 'em_andamento',
      progressData.cnpjAtual || null,
      progressData.apenasFaltantes || false,
      progressData.totalOriginal || null,
      progressData.jaProcessados || null,
      JSON.stringify(progressData.erros_detalhados || []),
      progressData.ultimo_erro_rate_limit || false,
      iniciadoEm,
      finalizadoEm,
    ];
    
    await executeQuery(query, params);
  } catch (error: any) {
    console.error('[SITF Lote] Erro ao salvar progresso no banco:', error);
    // Não lançar erro para não interromper o processamento
  }
}

/**
 * Função auxiliar para carregar progresso do banco de dados
 */
async function carregarProgressoDoBanco(progressId: string): Promise<any | null> {
  try {
    const query = `
      SELECT 
        progress_id, total, processados, sucessos, erros, porcentagem, status,
        cnpj_atual, apenas_faltantes, total_original, ja_processados,
        erros_detalhados, ultimo_erro_rate_limit, iniciado_em, finalizado_em
      FROM sitf_lote_progress
      WHERE progress_id = ?
    `;
    
    const result = await executeQuery(query, [progressId]);
    
    if (!result || result.length === 0) {
      return null;
    }
    
    const row = result[0];
    
    // Parsear erros_detalhados se for string JSON
    let errosDetalhados = [];
    if (row.erros_detalhados) {
      try {
        errosDetalhados = typeof row.erros_detalhados === 'string' 
          ? JSON.parse(row.erros_detalhados) 
          : row.erros_detalhados;
      } catch (e) {
        console.warn('[SITF Lote] Erro ao parsear erros_detalhados:', e);
      }
    }
    
    return {
      progress_id: row.progress_id,
      total: row.total,
      processados: row.processados,
      sucessos: row.sucessos,
      erros: row.erros,
      porcentagem: row.porcentagem,
      status: row.status,
      cnpjAtual: row.cnpj_atual,
      apenasFaltantes: row.apenas_faltantes,
      totalOriginal: row.total_original,
      jaProcessados: row.ja_processados,
      erros_detalhados: errosDetalhados,
      ultimo_erro_rate_limit: row.ultimo_erro_rate_limit,
      iniciado_em: row.iniciado_em,
      finalizado_em: row.finalizado_em,
    };
  } catch (error: any) {
    console.error('[SITF Lote] Erro ao carregar progresso do banco:', error);
    return null;
  }
}

/**
 * Função auxiliar para verificar quais CNPJs já têm registros de Situação Fiscal
 * Consulta a tabela sitf_downloads para identificar CNPJs já processados
 */
async function verificarCNPJsProcessados(cnpjs: string[]): Promise<Set<string>> {
  const cnpjsProcessados = new Set<string>();
  
  try {
    // Buscar registros no MySQL (sitf_downloads)
    if (cnpjs.length === 0) {
      console.log('[SITF Lote] Nenhum CNPJ fornecido para verificação');
      return cnpjsProcessados;
    }
    
    // Garantir que todos os CNPJs estão limpos (apenas números)
    const cnpjsLimpos = cnpjs
      .map(cnpj => String(cnpj || '').replace(/\D/g, ''))
      .filter(cnpj => cnpj.length === 14);
    
    if (cnpjsLimpos.length === 0) {
      console.log('[SITF Lote] Nenhum CNPJ válido após limpeza');
      return cnpjsProcessados;
    }
    
    console.log(`[SITF Lote] Verificando ${cnpjsLimpos.length} CNPJs na tabela sitf_downloads...`);
    
    // Para evitar problemas com muitos placeholders, processar em lotes de 100
    const batchSize = 100;
    const batches: string[][] = [];
    
    for (let i = 0; i < cnpjsLimpos.length; i += batchSize) {
      batches.push(cnpjsLimpos.slice(i, i + batchSize));
    }
    
    console.log(`[SITF Lote] Processando em ${batches.length} lote(s) de até ${batchSize} CNPJs cada`);
    
    // Processar cada lote
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const placeholders = batch.map(() => '?').join(',');
      const query = `SELECT DISTINCT cnpj FROM sitf_downloads WHERE cnpj IN (${placeholders})`;
      
      try {
        const registros = await executeQuery(query, batch);
        
        if (Array.isArray(registros)) {
          registros.forEach((r: any) => {
            // Garantir que o CNPJ retornado também está limpo
            const cnpjLimpo = String(r.cnpj || '').replace(/\D/g, '');
            if (cnpjLimpo.length === 14) {
              cnpjsProcessados.add(cnpjLimpo);
            }
          });
          
          console.log(`[SITF Lote] Lote ${batchIndex + 1}/${batches.length}: ${registros.length} CNPJs encontrados na tabela`);
        }
      } catch (batchError: any) {
        console.warn(`[SITF Lote] Erro ao processar lote ${batchIndex + 1}:`, batchError.message);
        // Continuar com os próximos lotes mesmo se um falhar
      }
    }
    
    console.log(`[SITF Lote] Total de CNPJs já processados encontrados: ${cnpjsProcessados.size} de ${cnpjsLimpos.length}`);
    
  } catch (error: any) {
    console.error('[SITF Lote] Erro ao verificar CNPJs processados:', error);
    console.warn('[SITF Lote] Continuando mesmo assim (processará todos os CNPJs)');
  }
  
  return cnpjsProcessados;
}

/**
 * POST /api/situacao-fiscal/lote/iniciar
 * Inicia consulta em lote de Situação Fiscal para todos os clientes
 * Usa o mesmo processo de consulta individual, aguardando conclusão completa
 * 
 * Query params:
 * - apenasFaltantes: boolean - Se true, processa apenas CNPJs que ainda não têm registros
 */
router.post('/lote/iniciar', async (req, res, next) => {
  try {
    const { Cliente } = await import('../models/Cliente');
    const clienteModel = new Cliente();
    
    // Verificar se deve processar apenas faltantes
    const apenasFaltantes = req.query.apenasFaltantes === 'true' || req.body.apenasFaltantes === true;
    
    // Buscar todos os clientes
    const result = await clienteModel.findAll();
    if (!result.success || !result.data) {
      return res.status(400).json({
        success: false,
        error: 'Erro ao buscar clientes',
      });
    }

    let clientes = result.data;
    const totalClientesOriginal = clientes.length;
    let cnpjsProcessadosCount = 0;
    
    // Embaralhar ordem dos clientes para evitar padrões detectáveis de automação
    // Isso simula comportamento humano e evita sempre processar na mesma ordem
    console.log(`[SITF Lote] Embaralhando ordem dos ${clientes.length} clientes para evitar padrões...`);
    for (let i = clientes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [clientes[i], clientes[j]] = [clientes[j], clientes[i]];
    }
    console.log(`[SITF Lote] Ordem dos clientes embaralhada com sucesso`);
    
    // Se deve processar apenas faltantes, filtrar CNPJs que já têm registros na tabela sitf_downloads
    if (apenasFaltantes) {
      console.log(`[SITF Lote] Modo "Apenas CNPJs faltantes" ativado`);
      console.log(`[SITF Lote] Consultando tabela sitf_downloads para identificar CNPJs já processados...`);
      
      const cnpjs = clientes
        .map(c => String(c.cnpj_limpo || '').replace(/\D/g, ''))
        .filter(cnpj => cnpj.length === 14);
      
      console.log(`[SITF Lote] Total de ${cnpjs.length} CNPJs válidos encontrados nos clientes`);
      
      // Consultar tabela sitf_downloads para ver quais CNPJs já têm registros
      const cnpjsProcessados = await verificarCNPJsProcessados(cnpjs);
      cnpjsProcessadosCount = cnpjsProcessados.size;
      
      console.log(`[SITF Lote] Resultado da consulta na tabela sitf_downloads:`);
      console.log(`   - CNPJs já processados: ${cnpjsProcessados.size}`);
      console.log(`   - CNPJs faltantes: ${cnpjs.length - cnpjsProcessados.size}`);
      
      // Filtrar apenas clientes que ainda não foram processados (não estão na tabela sitf_downloads)
      const clientesAntes = clientes.length;
      clientes = clientes.filter(cliente => {
        const cnpjLimpo = String(cliente.cnpj_limpo || '').replace(/\D/g, '');
        const naoTemRegistro = cnpjLimpo.length === 14 && !cnpjsProcessados.has(cnpjLimpo);
        return naoTemRegistro;
      });
      
      console.log(`[SITF Lote] Filtro aplicado:`);
      console.log(`   - Clientes antes do filtro: ${clientesAntes}`);
      console.log(`   - Clientes após filtro (faltantes): ${clientes.length}`);
      console.log(`   - Clientes ignorados (já processados): ${clientesAntes - clientes.length}`);
    } else {
      console.log(`[SITF Lote] Modo "Todos os CNPJs" - processará todos os ${clientes.length} clientes`);
    }
    
    const totalClientes = clientes.length;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    // Inicializar progresso
    const progressId = `sitf-lote-${Date.now()}`;
    const progressData = {
      total: totalClientes,
      processados: 0,
      sucessos: 0,
      erros: 0,
      porcentagem: 0,
      status: 'em_andamento',
      iniciado_em: new Date().toISOString(),
      erros_detalhados: [] as Array<{ cnpj: string; razao_social: string; erro: string }>,
      ultimo_erro_rate_limit: false,
      apenasFaltantes,
      totalOriginal: apenasFaltantes ? totalClientesOriginal : totalClientes,
      jaProcessados: apenasFaltantes ? cnpjsProcessadosCount : 0,
      cnpjAtual: null as string | null,
    };

    // Armazenar progresso em memória (para performance) e no banco (para persistência)
    global.sitfLoteProgress = global.sitfLoteProgress || {};
    global.sitfLoteProgress[progressId] = progressData;
    
    // Salvar no banco de dados para persistir após refresh
    await salvarProgressoNoBanco(progressId, progressData);

    // Responder imediatamente
    res.json({
      success: true,
      progressId,
      total: totalClientes,
      totalOriginal: apenasFaltantes ? totalClientesOriginal : totalClientes,
      jaProcessados: apenasFaltantes ? cnpjsProcessadosCount : 0,
      apenasFaltantes,
      message: apenasFaltantes 
        ? `Consulta em lote iniciada: ${totalClientes} CNPJs para processar (${cnpjsProcessadosCount} já processados foram ignorados)`
        : 'Consulta em lote iniciada',
    });

    // Processar em background
    (async () => {
      console.log('\n' + '='.repeat(80));
      console.log(`[SITF Lote] 🚀 INICIANDO PROCESSAMENTO EM LOTE`);
      console.log(`[SITF Lote] Progress ID: ${progressId}`);
      console.log(`[SITF Lote] Total de CNPJs para processar: ${totalClientes}`);
      console.log(`[SITF Lote] Modo: ${apenasFaltantes ? 'Apenas CNPJs faltantes' : 'Todos os CNPJs'}`);
      if (apenasFaltantes) {
        console.log(`[SITF Lote] CNPJs já processados (ignorados): ${cnpjsProcessadosCount}`);
      }
      console.log(`[SITF Lote] Iniciado em: ${new Date().toLocaleString('pt-BR')}`);
      console.log('='.repeat(80) + '\n');
      
      for (let i = 0; i < clientes.length; i++) {
        // Verificar se foi cancelado
        if (global.sitfLoteProgress[progressId].status === 'cancelada') {
          global.sitfLoteProgress[progressId].finalizado_em = new Date().toISOString();
          global.sitfLoteProgress[progressId].cnpjAtual = null;
          await salvarProgressoNoBanco(progressId, global.sitfLoteProgress[progressId]);
          console.log('\n[SITF Lote] ⛔ Consulta cancelada pelo usuário');
          break;
        }

        const cliente = clientes[i];
        const cnpjLimpo = String(cliente.cnpj_limpo || '').replace(/\D/g, '');
        const razaoSocial = cliente.razao_social || cliente.nome || 'Sem nome';
        
        const numeroAtual = i + 1;
        console.log(`\n[SITF Lote] 📋 Processando CNPJ ${numeroAtual}/${totalClientes}: ${cnpjLimpo} - ${razaoSocial}`);
        
        if (cnpjLimpo.length !== 14) {
          console.log(`[SITF Lote] ⚠️  CNPJ inválido (não possui 14 dígitos) - pulando...`);
          global.sitfLoteProgress[progressId].processados++;
          global.sitfLoteProgress[progressId].erros++;
          global.sitfLoteProgress[progressId].erros_detalhados.push({
            cnpj: cnpjLimpo || 'N/A',
            razao_social: razaoSocial,
            erro: 'CNPJ inválido (não possui 14 dígitos)'
          });
          continue;
        }

        try {
          global.sitfLoteProgress[progressId].cnpjAtual = `${cnpjLimpo} - ${razaoSocial}`;
          await salvarProgressoNoBanco(progressId, global.sitfLoteProgress[progressId]);
          
          console.log(`[SITF Lote] 🔄 Iniciando requisição para ${cnpjLimpo}...`);
          
          // Usar a função auxiliar que aguarda conclusão completa
          const resultado = await aguardarConclusaoConsulta(cnpjLimpo, baseUrl, progressId);

          if (resultado.sucesso) {
            global.sitfLoteProgress[progressId].sucessos++;
            console.log(`[SITF Lote] ✅ ${cnpjLimpo} - ${razaoSocial}: Consulta concluída com sucesso`);
          } else {
            const erroMsg = resultado.erro || 'Erro desconhecido';
            const isRateLimit = erroMsg.includes('429') || erroMsg.toLowerCase().includes('rate limit');
            
            global.sitfLoteProgress[progressId].erros++;
            global.sitfLoteProgress[progressId].erros_detalhados.push({
              cnpj: cnpjLimpo,
              razao_social: razaoSocial,
              erro: erroMsg
            });
            
            if (isRateLimit) {
              console.error(`[SITF Lote] ⚠️  ${cnpjLimpo} - ${razaoSocial}: Rate limit detectado - ${erroMsg}`);
            } else {
              console.error(`[SITF Lote] ❌ ${cnpjLimpo} - ${razaoSocial}: ${erroMsg}`);
            }
            
            // Se foi rate limit, marcar para aguardar mais tempo antes do próximo
            if (isRateLimit) {
              global.sitfLoteProgress[progressId].ultimo_erro_rate_limit = true;
            }
          }
        } catch (error: any) {
          global.sitfLoteProgress[progressId].erros++;
          const erroMsg = error.message || 'Erro desconhecido';
          global.sitfLoteProgress[progressId].erros_detalhados.push({
            cnpj: cnpjLimpo,
            razao_social: razaoSocial,
            erro: erroMsg
          });
          console.error(`[SITF Lote] ❌ ${cnpjLimpo} - ${razaoSocial}: Erro inesperado - ${erroMsg}`);
        }

        global.sitfLoteProgress[progressId].processados++;
        global.sitfLoteProgress[progressId].porcentagem = Math.round(
          (global.sitfLoteProgress[progressId].processados / totalClientes) * 100
        );
        
        // Salvar progresso no banco de dados
        await salvarProgressoNoBanco(progressId, global.sitfLoteProgress[progressId]);
        
        // Log de progresso
        const progresso = global.sitfLoteProgress[progressId];
        console.log(`[SITF Lote] 📊 Progresso: ${progresso.processados}/${totalClientes} (${progresso.porcentagem}%) | Sucessos: ${progresso.sucessos} | Erros: ${progresso.erros}`);

        // Verificar novamente antes de aguardar
        if (global.sitfLoteProgress[progressId].status === 'cancelada') {
          console.log('[SITF Lote] Consulta cancelada pelo usuário');
          break;
        }

        // Aguardar entre requisições para evitar rate limiting
        // IMPORTANTE: SEMPRE aguardar pelo menos 30 segundos entre cada CNPJ
        // Adicionar variação aleatória para simular comportamento humano e evitar detecção de padrão
        if (i < clientes.length - 1) {
          // Verificar se houve rate limit no último processamento
          const teveRateLimit = global.sitfLoteProgress[progressId].ultimo_erro_rate_limit === true;
          
          // Base: 30 segundos (normal) ou 60 segundos (após rate limit)
          const baseWaitTime = teveRateLimit ? 60000 : 30000;
          
          // Adicionar variação aleatória de ±5 segundos para simular comportamento humano
          // Isso ajuda a evitar detecção de padrão de automação
          const variacaoAleatoria = Math.floor(Math.random() * 10000) - 5000; // -5s a +5s
          const waitTimeFinal = Math.max(baseWaitTime + variacaoAleatoria, baseWaitTime - 5000);
          
          const waitTimeSegundos = Math.round(waitTimeFinal / 1000);
          
          if (teveRateLimit) {
            console.log(`[SITF Lote] Rate limit detectado. Aguardando ${waitTimeSegundos}s (com variação aleatória) antes do próximo CNPJ...`);
            global.sitfLoteProgress[progressId].cnpjAtual = `Aguardando ${waitTimeSegundos}s após rate limit...`;
            // Resetar flag
            global.sitfLoteProgress[progressId].ultimo_erro_rate_limit = false;
          } else {
            console.log(`[SITF Lote] Aguardando ${waitTimeSegundos}s (com variação aleatória) antes do próximo CNPJ...`);
            global.sitfLoteProgress[progressId].cnpjAtual = `Aguardando ${waitTimeSegundos}s antes do próximo CNPJ...`;
          }
          
          // Aguardar com verificação de cancelamento
          const naoCancelado = await aguardarComCancelamento(progressId, waitTimeFinal);
          if (!naoCancelado) {
            console.log('[SITF Lote] Consulta cancelada durante espera entre CNPJs');
            break;
          }
        }
      }

      // Marcar como concluído apenas se não foi cancelado
      if (global.sitfLoteProgress[progressId].status !== 'cancelada') {
        global.sitfLoteProgress[progressId].status = 'concluida';
        global.sitfLoteProgress[progressId].finalizado_em = new Date().toISOString();
        global.sitfLoteProgress[progressId].cnpjAtual = null;
        await salvarProgressoNoBanco(progressId, global.sitfLoteProgress[progressId]);
        
        const progressoFinal = global.sitfLoteProgress[progressId];
        const tempoInicio = new Date(progressoFinal.iniciado_em);
        const tempoFim = new Date();
        const duracaoMinutos = Math.round((tempoFim.getTime() - tempoInicio.getTime()) / 1000 / 60);
        
        console.log('\n' + '='.repeat(80));
        console.log(`[SITF Lote] ✅ PROCESSAMENTO EM LOTE CONCLUÍDO`);
        console.log(`[SITF Lote] Progress ID: ${progressId}`);
        console.log(`[SITF Lote] Duração: ${duracaoMinutos} minutos`);
        console.log(`[SITF Lote] Total processado: ${progressoFinal.processados}/${totalClientes}`);
        console.log(`[SITF Lote] Sucessos: ${progressoFinal.sucessos}`);
        console.log(`[SITF Lote] Erros: ${progressoFinal.erros}`);
        console.log(`[SITF Lote] Taxa de sucesso: ${totalClientes > 0 ? Math.round((progressoFinal.sucessos / totalClientes) * 100) : 0}%`);
        if (progressoFinal.erros_detalhados.length > 0) {
          console.log(`[SITF Lote] CNPJs com erro: ${progressoFinal.erros_detalhados.length}`);
        }
        console.log(`[SITF Lote] Finalizado em: ${tempoFim.toLocaleString('pt-BR')}`);
        console.log('='.repeat(80) + '\n');
      } else {
        console.log('\n' + '='.repeat(80));
        console.log(`[SITF Lote] ⛔ PROCESSAMENTO CANCELADO PELO USUÁRIO`);
        console.log(`[SITF Lote] Progress ID: ${progressId}`);
        const progressoFinal = global.sitfLoteProgress[progressId];
        console.log(`[SITF Lote] Processados até o cancelamento: ${progressoFinal.processados}/${totalClientes}`);
        console.log(`[SITF Lote] Sucessos: ${progressoFinal.sucessos}`);
        console.log(`[SITF Lote] Erros: ${progressoFinal.erros}`);
        console.log('='.repeat(80) + '\n');
      }
    })().catch(error => {
      console.error('[SITF Lote] Erro fatal:', error);
      if (global.sitfLoteProgress[progressId].status !== 'cancelada') {
        global.sitfLoteProgress[progressId].status = 'erro';
        global.sitfLoteProgress[progressId].erro = error.message;
      }
    });

  } catch (error: any) {
    console.error('[SITF Lote] Erro ao iniciar:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao iniciar consulta em lote',
      details: error.message,
    });
  }
});

/**
 * GET /api/situacao-fiscal/lote/progresso/:progressId
 * Consulta o progresso da consulta em lote
 * Busca primeiro em memória, depois no banco de dados
 */
router.get('/lote/progresso/:progressId', async (req, res, next) => {
  try {
    const { progressId } = req.params;
    
    // Tentar buscar em memória primeiro (mais rápido)
    global.sitfLoteProgress = global.sitfLoteProgress || {};
    let progresso = global.sitfLoteProgress[progressId];

    // Se não estiver em memória, buscar do banco de dados
    if (!progresso) {
      console.log(`[SITF Lote Progresso] Progresso não encontrado em memória, buscando do banco...`);
      progresso = await carregarProgressoDoBanco(progressId);
      
      // Se encontrou no banco, restaurar em memória
      if (progresso) {
        global.sitfLoteProgress[progressId] = progresso;
        console.log(`[SITF Lote Progresso] Progresso restaurado do banco: ${progresso.status}`);
      }
    }

    if (!progresso) {
      return res.status(404).json({
        success: false,
        error: 'Progresso não encontrado',
      });
    }

    res.json({
      success: true,
      data: progresso,
    });
  } catch (error: any) {
    console.error('[SITF Lote Progresso] Erro:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao consultar progresso',
      details: error.message,
    });
  }
});

/**
 * GET /api/situacao-fiscal/lote/em-andamento
 * Verifica se há algum processamento em andamento
 * Útil para restaurar o progresso após refresh da página
 */
router.get('/lote/em-andamento', async (req, res, next) => {
  try {
    // Buscar processamentos em andamento no banco de dados
    const query = `
      SELECT progress_id, status, iniciado_em, processados, total
      FROM sitf_lote_progress
      WHERE status = 'em_andamento'
      ORDER BY iniciado_em DESC
      LIMIT 1
    `;
    
    const result = await executeQuery(query);
    
    if (result && result.length > 0) {
      const progresso = result[0];
      return res.json({
        success: true,
        emAndamento: true,
        progressId: progresso.progress_id,
        data: {
          status: progresso.status,
          iniciado_em: progresso.iniciado_em,
          processados: progresso.processados,
          total: progresso.total,
        }
      });
    }
    
    // Verificar também em memória (caso não tenha sido salvo no banco ainda)
    global.sitfLoteProgress = global.sitfLoteProgress || {};
    const progressosEmMemoria = Object.entries(global.sitfLoteProgress)
      .filter(([_, progresso]: [string, any]) => progresso.status === 'em_andamento');
    
    if (progressosEmMemoria.length > 0) {
      const [progressId, progresso] = progressosEmMemoria[0] as [string, any];
      return res.json({
        success: true,
        emAndamento: true,
        progressId,
        data: {
          status: progresso.status,
          iniciado_em: progresso.iniciado_em,
          processados: progresso.processados,
          total: progresso.total,
        }
      });
    }
    
    return res.json({
      success: true,
      emAndamento: false,
    });
  } catch (error: any) {
    console.error('[SITF Lote Em Andamento] Erro:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao verificar processamentos em andamento',
    });
  }
});

/**
 * POST /api/situacao-fiscal/lote/:progressId/cancelar
 * Cancela uma consulta em lote em andamento
 */
router.post('/lote/:progressId/cancelar', async (req, res, next) => {
  try {
    const { progressId } = req.params;
    
    global.sitfLoteProgress = global.sitfLoteProgress || {};
    let progresso = global.sitfLoteProgress[progressId];

    // Se não estiver em memória, buscar do banco
    if (!progresso) {
      progresso = await carregarProgressoDoBanco(progressId);
      if (progresso) {
        global.sitfLoteProgress[progressId] = progresso;
      }
    }

    if (!progresso) {
      return res.status(404).json({
        success: false,
        error: 'Progresso não encontrado',
      });
    }

    if (progresso.status !== 'em_andamento') {
      return res.status(400).json({
        success: false,
        error: 'Consulta não está em andamento',
      });
    }

    // Marcar como cancelada
    progresso.status = 'cancelada';
    progresso.finalizado_em = new Date().toISOString();
    progresso.cnpjAtual = null;
    
    // Salvar no banco
    await salvarProgressoNoBanco(progressId, progresso);

    res.json({
      success: true,
      message: 'Consulta cancelada com sucesso',
    });
  } catch (error: any) {
    console.error('[SITF Lote Cancelar] Erro:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao cancelar consulta',
      details: error.message,
    });
  }
});

/**
 * POST /api/situacao-fiscal/upload-pdf
 * Upload de PDF manual da Situação Fiscal para extração via Python (pdfplumber)
 * Mais robusto que extração via base64
 */
/**
 * POST /api/situacao-fiscal/lote/popular-pendentes
 * Popula a tabela temporária com CNPJs de empresas que têm divergências na aba Participação
 * Filtra apenas matrizes (tipo_empresa = 'Matriz') que têm divergências em percentuais ou valores
 */
router.post('/lote/popular-pendentes', async (req, res, next) => {
  try {
    const { Cliente } = await import('../models/Cliente');
    const clienteModel = new Cliente();
    
    console.log('[SITF Lote Pendentes] Iniciando população da tabela de CNPJs pendentes...');
    
    // Buscar todas as matrizes
    const result = await clienteModel.findAll();
    if (!result.success || !result.data) {
      return res.status(400).json({
        success: false,
        error: 'Erro ao buscar clientes',
      });
    }

    const todasMatrizes = result.data.filter(cliente => cliente.tipo_empresa === 'Matriz');
    console.log(`[SITF Lote Pendentes] Total de matrizes encontradas: ${todasMatrizes.length}`);
    
    // Buscar sócios para cada matriz
    const cnpjsComDivergencias: Array<{
      cnpj: string;
      razao_social: string;
      cliente_id: string;
      motivo: string;
    }> = [];
    
    for (const cliente of todasMatrizes) {
      const cnpjLimpo = String(cliente.cnpj_limpo || '').replace(/\D/g, '');
      if (cnpjLimpo.length !== 14) continue;
      
      // Buscar sócios do cliente
      const sociosResult = await clienteModel.listarSocios(cliente.id!);
      const socios = sociosResult.success && sociosResult.data ? sociosResult.data : [];
      
      // Filtrar apenas sócios com qualificação
      const sociosComQualificacao = socios.filter(s => s.qual && s.qual.trim() !== '');
      
      if (sociosComQualificacao.length === 0) continue;
      
      // Calcular soma de percentuais
      const somaPercentuais = sociosComQualificacao.reduce((acc, s) => {
        const percentual = s.participacao_percentual !== null && s.participacao_percentual !== undefined
          ? parseFloat(String(s.participacao_percentual))
          : 0;
        return acc + (isNaN(percentual) ? 0 : percentual);
      }, 0);
      
      // Calcular soma de valores
      const somaValores = sociosComQualificacao.reduce((acc, s) => {
        const valor = s.participacao_valor !== null && s.participacao_valor !== undefined
          ? parseFloat(String(s.participacao_valor))
          : 0;
        return acc + (isNaN(valor) ? 0 : valor);
      }, 0);
      
      // Normalizar capital social
      const capitalSocial = cliente.capital_social;
      let capitalSocialNum = 0;
      if (capitalSocial !== null && capitalSocial !== undefined && capitalSocial !== '') {
        if (typeof capitalSocial === 'number') {
          capitalSocialNum = capitalSocial;
        } else {
          const capitalStr = String(capitalSocial).replace(/[^\d,.-]/g, '').replace(',', '.');
          capitalSocialNum = parseFloat(capitalStr) || 0;
        }
      }
      
      // Verificar divergências
      const percentuaisOk = Math.abs(somaPercentuais - 100) < 0.01; // Tolerância de 0.01%
      const valoresOk = Math.abs(somaValores - capitalSocialNum) < 0.01; // Tolerância de R$ 0.01
      
      if (!percentuaisOk || !valoresOk) {
        const motivos: string[] = [];
        if (!percentuaisOk) {
          motivos.push(`Percentual: ${somaPercentuais.toFixed(2)}% (esperado: 100%)`);
        }
        if (!valoresOk) {
          motivos.push(`Soma de valores ≠ Capital Social`);
        }
        
        cnpjsComDivergencias.push({
          cnpj: cnpjLimpo,
          razao_social: cliente.razao_social || cliente.nome || 'Sem nome',
          cliente_id: cliente.id!,
          motivo: motivos.join(', '),
        });
      }
    }
    
    console.log(`[SITF Lote Pendentes] CNPJs com divergências encontrados: ${cnpjsComDivergencias.length}`);
    
    // Limpar tabela antes de popular (opcional - pode comentar se quiser manter histórico)
    await executeQuery('DELETE FROM sitf_lote_cnpjs_pendentes WHERE status = "pendente"', []);
    console.log('[SITF Lote Pendentes] Tabela limpa (apenas registros pendentes removidos)');
    
    // Inserir CNPJs na tabela temporária
    if (cnpjsComDivergencias.length > 0) {
      const values = cnpjsComDivergencias.map(c => [
        c.cnpj,
        c.razao_social,
        c.cliente_id,
        c.motivo,
        'pendente',
        0,
        null,
        null,
        null,
        null,
      ]);
      
      const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const query = `
        INSERT INTO sitf_lote_cnpjs_pendentes 
        (cnpj, razao_social, cliente_id, motivo, status, tentativas, ultimo_erro, criado_em, processado_em, progress_id)
        VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE
          razao_social = VALUES(razao_social),
          cliente_id = VALUES(cliente_id),
          motivo = VALUES(motivo),
          status = 'pendente',
          tentativas = 0,
          ultimo_erro = NULL,
          processado_em = NULL,
          progress_id = NULL
      `;
      
      const flatValues = values.flat();
      await executeQuery(query, flatValues);
      
      console.log(`[SITF Lote Pendentes] ${cnpjsComDivergencias.length} CNPJs inseridos na tabela temporária`);
    }
    
    return res.json({
      success: true,
      total: cnpjsComDivergencias.length,
      message: `${cnpjsComDivergencias.length} CNPJs com divergências adicionados à fila de processamento`,
    });
  } catch (error: any) {
    console.error('[SITF Lote Pendentes] Erro ao popular tabela:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro ao popular tabela de CNPJs pendentes',
    });
  }
});

/**
 * GET /api/situacao-fiscal/lote/pendentes
 * Retorna a lista de CNPJs pendentes na tabela temporária
 */
router.get('/lote/pendentes', async (req, res, next) => {
  try {
    const status = req.query.status as string || 'pendente';
    const query = `
      SELECT 
        id,
        cnpj,
        razao_social,
        cliente_id,
        motivo,
        status,
        tentativas,
        ultimo_erro,
        criado_em,
        processado_em,
        progress_id
      FROM sitf_lote_cnpjs_pendentes
      WHERE status = ?
      ORDER BY criado_em ASC
    `;
    
    const result = await executeQuery(query, [status]);
    
    return res.json({
      success: true,
      data: result || [],
      total: result?.length || 0,
    });
  } catch (error: any) {
    console.error('[SITF Lote Pendentes] Erro ao buscar pendentes:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro ao buscar CNPJs pendentes',
    });
  }
});

/**
 * POST /api/situacao-fiscal/lote/iniciar-pendentes
 * Inicia consulta em lote usando apenas os CNPJs da tabela temporária
 * Processa um CNPJ por vez e remove da tabela após sucesso
 */
router.post('/lote/iniciar-pendentes', async (req, res, next) => {
  try {
    // Buscar CNPJs pendentes da tabela
    const pendentesQuery = `
      SELECT 
        id,
        cnpj,
        razao_social,
        cliente_id,
        motivo
      FROM sitf_lote_cnpjs_pendentes
      WHERE status = 'pendente'
      ORDER BY criado_em ASC
    `;
    
    const pendentes = await executeQuery(pendentesQuery, []);
    
    if (!pendentes || pendentes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Nenhum CNPJ pendente encontrado. Use /lote/popular-pendentes primeiro.',
      });
    }
    
    const totalPendentes = pendentes.length;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    // Inicializar progresso
    const progressId = `sitf-lote-pendentes-${Date.now()}`;
    const progressData = {
      total: totalPendentes,
      processados: 0,
      sucessos: 0,
      erros: 0,
      porcentagem: 0,
      status: 'em_andamento',
      iniciado_em: new Date().toISOString(),
      erros_detalhados: [] as Array<{ cnpj: string; razao_social: string; erro: string }>,
      ultimo_erro_rate_limit: false,
      apenasFaltantes: false,
      totalOriginal: totalPendentes,
      jaProcessados: 0,
      cnpjAtual: null as string | null,
    };

    // Armazenar progresso em memória e no banco
    global.sitfLoteProgress = global.sitfLoteProgress || {};
    global.sitfLoteProgress[progressId] = progressData;
    await salvarProgressoNoBanco(progressId, progressData);

    // Responder imediatamente
    res.json({
      success: true,
      progressId,
      total: totalPendentes,
      message: `Consulta em lote iniciada: ${totalPendentes} CNPJs pendentes para processar`,
    });

    // Processar em background
    (async () => {
      console.log('\n' + '='.repeat(80));
      console.log(`[SITF Lote Pendentes] 🚀 INICIANDO PROCESSAMENTO EM LOTE`);
      console.log(`[SITF Lote Pendentes] Progress ID: ${progressId}`);
      console.log(`[SITF Lote Pendentes] Total de CNPJs pendentes: ${totalPendentes}`);
      console.log('='.repeat(80) + '\n');
      
      for (let i = 0; i < pendentes.length; i++) {
        // Verificar se foi cancelado
        if (global.sitfLoteProgress[progressId]?.status === 'cancelada') {
          global.sitfLoteProgress[progressId].finalizado_em = new Date().toISOString();
          global.sitfLoteProgress[progressId].cnpjAtual = null;
          await salvarProgressoNoBanco(progressId, global.sitfLoteProgress[progressId]);
          console.log('\n[SITF Lote Pendentes] ⛔ Consulta cancelada pelo usuário');
          break;
        }

        const pendente = pendentes[i];
        const cnpjLimpo = pendente.cnpj;
        const razaoSocial = pendente.razao_social || 'Sem nome';
        const pendenteId = pendente.id;
        
        const numeroAtual = i + 1;
        console.log(`\n[SITF Lote Pendentes] 📋 Processando CNPJ ${numeroAtual}/${totalPendentes}: ${cnpjLimpo} - ${razaoSocial}`);
        console.log(`[SITF Lote Pendentes] Motivo: ${pendente.motivo || 'N/A'}`);
        
        // Marcar como processando na tabela
        await executeQuery(
          'UPDATE sitf_lote_cnpjs_pendentes SET status = ?, progress_id = ? WHERE id = ?',
          ['processando', progressId, pendenteId]
        );

        try {
          global.sitfLoteProgress[progressId].cnpjAtual = `${cnpjLimpo} - ${razaoSocial}`;
          await salvarProgressoNoBanco(progressId, global.sitfLoteProgress[progressId]);
          
          console.log(`[SITF Lote Pendentes] 🔄 Iniciando requisição para ${cnpjLimpo}...`);
          
          // Usar a função auxiliar que aguarda conclusão completa
          const resultado = await aguardarConclusaoConsulta(cnpjLimpo, baseUrl, progressId);

          if (resultado.sucesso) {
            global.sitfLoteProgress[progressId].sucessos++;
            console.log(`[SITF Lote Pendentes] ✅ ${cnpjLimpo} - ${razaoSocial}: Consulta concluída com sucesso`);
            
            // Remover da tabela temporária após sucesso
            await executeQuery(
              'DELETE FROM sitf_lote_cnpjs_pendentes WHERE id = ?',
              [pendenteId]
            );
            console.log(`[SITF Lote Pendentes] 🗑️  CNPJ ${cnpjLimpo} removido da tabela temporária`);
          } else {
            const erroMsg = resultado.erro || 'Erro desconhecido';
            const isRateLimit = erroMsg.includes('429') || erroMsg.toLowerCase().includes('rate limit');
            
            global.sitfLoteProgress[progressId].erros++;
            global.sitfLoteProgress[progressId].erros_detalhados.push({
              cnpj: cnpjLimpo,
              razao_social: razaoSocial,
              erro: erroMsg
            });
            
            // Atualizar status na tabela para 'erro' e incrementar tentativas
            await executeQuery(
              'UPDATE sitf_lote_cnpjs_pendentes SET status = ?, tentativas = tentativas + 1, ultimo_erro = ? WHERE id = ?',
              ['erro', erroMsg.substring(0, 1000), pendenteId]
            );
            
            if (isRateLimit) {
              console.error(`[SITF Lote Pendentes] ⚠️  ${cnpjLimpo} - ${razaoSocial}: Rate limit detectado - ${erroMsg}`);
            } else {
              console.error(`[SITF Lote Pendentes] ❌ ${cnpjLimpo} - ${razaoSocial}: ${erroMsg}`);
            }
            
            if (isRateLimit) {
              global.sitfLoteProgress[progressId].ultimo_erro_rate_limit = true;
            }
          }
        } catch (error: any) {
          global.sitfLoteProgress[progressId].erros++;
          const erroMsg = error.message || 'Erro desconhecido';
          global.sitfLoteProgress[progressId].erros_detalhados.push({
            cnpj: cnpjLimpo,
            razao_social: razaoSocial,
            erro: erroMsg
          });
          
          // Atualizar status na tabela para 'erro'
          await executeQuery(
            'UPDATE sitf_lote_cnpjs_pendentes SET status = ?, tentativas = tentativas + 1, ultimo_erro = ? WHERE id = ?',
            ['erro', erroMsg.substring(0, 1000), pendenteId]
          );
          
          console.error(`[SITF Lote Pendentes] ❌ ${cnpjLimpo} - ${razaoSocial}: Erro inesperado - ${erroMsg}`);
        }

        global.sitfLoteProgress[progressId].processados++;
        global.sitfLoteProgress[progressId].porcentagem = Math.round(
          (global.sitfLoteProgress[progressId].processados / totalPendentes) * 100
        );
        
        await salvarProgressoNoBanco(progressId, global.sitfLoteProgress[progressId]);
        
        // Aguardar 30 segundos entre requisições (com variação aleatória)
        if (i < pendentes.length - 1) {
          const delay = 30000 + Math.floor(Math.random() * 10000); // 30-40 segundos
          console.log(`[SITF Lote Pendentes] ⏳ Aguardando ${Math.round(delay / 1000)}s antes do próximo CNPJ...`);
          await aguardarComCancelamento(progressId, delay);
        }
      }
      
      // Finalizar
      global.sitfLoteProgress[progressId].status = 'concluida';
      global.sitfLoteProgress[progressId].finalizado_em = new Date().toISOString();
      global.sitfLoteProgress[progressId].cnpjAtual = null;
      await salvarProgressoNoBanco(progressId, global.sitfLoteProgress[progressId]);
      
      console.log('\n' + '='.repeat(80));
      console.log(`[SITF Lote Pendentes] ✅ PROCESSAMENTO CONCLUÍDO`);
      console.log(`[SITF Lote Pendentes] Total processado: ${global.sitfLoteProgress[progressId].processados}`);
      console.log(`[SITF Lote Pendentes] Sucessos: ${global.sitfLoteProgress[progressId].sucessos}`);
      console.log(`[SITF Lote Pendentes] Erros: ${global.sitfLoteProgress[progressId].erros}`);
      console.log('='.repeat(80) + '\n');
    })();
  } catch (error: any) {
    console.error('[SITF Lote Pendentes] Erro ao iniciar consulta em lote:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro ao iniciar consulta em lote',
    });
  }
});

router.post('/upload-pdf', upload.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Nenhum PDF enviado. Por favor, selecione um arquivo PDF.',
      });
    }

    // Tentar extrair CNPJ do PDF primeiro, se não vier no body
    let cnpjLimpo = req.body.cnpj ? String(req.body.cnpj).replace(/\D/g, '') : '';
    
    // Se CNPJ não foi fornecido, será extraído do PDF pelo Python
    // Validaremos após a extração

    console.log('[Upload PDF] Iniciando processamento...', {
      cnpj: cnpjLimpo,
      tamanho: req.file.size,
      mimetype: req.file.mimetype,
    });

    // Usar script Python para extração (mais robusto para tabelas)
    console.log('[Upload PDF] Usando script Python (pdfplumber) para extração...');
    const pythonResult = await extrairSociosComPython(req.file.buffer);
    
    if (!pythonResult.success || !pythonResult.socios) {
      return res.status(500).json({
        success: false,
        error: pythonResult.error || 'Erro ao extrair sócios com Python. Verifique se Python e pdfplumber estão instalados.',
      });
    }

    console.log(`[Upload PDF] ✅ ${pythonResult.total || 0} sócios extraídos com Python`);

    // Usar CNPJ extraído do PDF se não foi fornecido no body
    if (!cnpjLimpo || cnpjLimpo.length !== 14) {
      if (pythonResult.cnpj && pythonResult.cnpj.length === 14) {
        cnpjLimpo = pythonResult.cnpj;
        console.log(`[Upload PDF] CNPJ extraído do PDF: ${cnpjLimpo}`);
      } else {
        return res.status(400).json({
          success: false,
          error: 'Não foi possível extrair o CNPJ do PDF. Por favor, forneça o CNPJ manualmente ou verifique se o PDF é válido.',
        });
      }
    } else {
      // Validar CNPJ fornecido
      if (cnpjLimpo.length !== 14) {
        return res.status(400).json({
          success: false,
          error: 'CNPJ inválido. O CNPJ deve conter 14 dígitos.',
        });
      }
      console.log(`[Upload PDF] CNPJ fornecido manualmente: ${cnpjLimpo}`);
    }

    // Converter formato Python → Node.js
    const sociosConvertidos = converterSociosPythonParaNode(pythonResult.socios);
    
    console.log('[Upload PDF] Sócios convertidos para formato Node.js:', sociosConvertidos.length);

    // Buscar cliente pelo CNPJ
    const clienteModel = new Cliente();
    const clienteResult = await clienteModel.findByCNPJ(cnpjLimpo);
    
    if (!clienteResult.success || !clienteResult.data) {
      return res.status(404).json({
        success: false,
        error: 'Cliente não encontrado. Por favor, cadastre o cliente primeiro.',
      });
    }

    const cliente = clienteResult.data;
    const capitalSocial = (cliente as any).capital_social;

    console.log('[Upload PDF] Cliente encontrado:', {
      id: cliente.id,
      razao_social: (cliente as any).razao_social,
      capital_social: capitalSocial,
    });

    // Atualizar sócios do cliente com participação
    const updateResult = await clienteModel.atualizarSociosComParticipacao(
      cliente.id!,
      sociosConvertidos,
      capitalSocial
    );

    if (!updateResult.success) {
      console.error('[Upload PDF] Erro ao atualizar sócios:', updateResult.error);
      return res.status(500).json({
        success: false,
        error: updateResult.error || 'Erro ao atualizar sócios no banco de dados',
      });
    }

    console.log('[Upload PDF] ✅ Sócios atualizados com sucesso:', {
      atualizados: updateResult.data?.atualizados || 0,
    });

    // Salvar PDF no histórico (simular como se fosse da API)
    const protocolo = `UPLOAD_${Date.now()}`;
    const now = new Date();
    const dataFormatada = now.toISOString().slice(0, 19).replace('T', ' ');

    // Converter buffer para base64 para salvar no banco
    const pdfBase64 = req.file.buffer.toString('base64');

    // Preparar dados extraídos para salvar no histórico
    const extractedData = {
      socios: sociosConvertidos,
      metadata: {
        source: 'upload_manual',
        extracted_via: 'python_pdfplumber',
        extracted_at: now.toISOString(),
      },
    };

    try {
      await executeQuery(
        `INSERT INTO sitf_downloads (cnpj, protocolo, pdf_base64, extracted_data, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          cnpjLimpo,
          protocolo,
          pdfBase64,
          JSON.stringify(extractedData),
          dataFormatada,
        ]
      );
      console.log('[Upload PDF] ✅ PDF salvo no histórico com protocolo:', protocolo);
    } catch (historyError: any) {
      console.warn('[Upload PDF] Erro ao salvar no histórico (continuando mesmo assim):', historyError);
      // Continuar mesmo se houver erro ao salvar no histórico
    }

    return res.json({
      success: true,
      data: {
        protocolo,
        sociosExtraidos: pythonResult.total || 0,
        sociosAtualizados: updateResult.data?.atualizados || 0,
        socios: sociosConvertidos,
      },
      message: `PDF processado com sucesso. ${pythonResult.total || 0} sócio(s) extraído(s) e atualizado(s).`,
    });
  } catch (error: any) {
    console.error('[Upload PDF] Erro:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro ao processar PDF',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

export default router;
