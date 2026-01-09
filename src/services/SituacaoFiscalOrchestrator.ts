import axios from 'axios';
import { randomUUID } from 'crypto';
import { createSupabaseAdapter } from './SupabaseAdapter';
import { saveExtractedSitfData, upsertExtractedSitfData, type SitfExtractedData } from './SitfDataExtractorService';
import { extrairSociosComPythonBase64, converterSociosPythonParaNode } from '../utils/pythonExtractor';

const supabaseAdmin = createSupabaseAdapter() as any;
const supabase = createSupabaseAdapter() as any;

// Classes de erro específicas para melhor tratamento
export class SerproError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public serproData?: any
  ) {
    super(message);
    this.name = 'SerproError';
  }
}

export class AuthorizationError extends SerproError {
  constructor(message: string, serproData?: any) {
    super(message, 403, serproData);
    this.name = 'AuthorizationError';
  }
}

export class NetworkError extends Error {
  constructor(message: string, public originalError?: any) {
    super(message);
    this.name = 'NetworkError';
  }
}

// Importação do pdf-parse (CommonJS module)
// Na versão 2.x, pdf-parse pode ter API diferente - vamos tentar ambas
const pdfParseModule = require('pdf-parse');
// Tentar usar a função diretamente (versão 1.x) ou a classe (versão 2.x)
const pdfParse = pdfParseModule.default || pdfParseModule;
const PDFParse = pdfParseModule.PDFParse;

export type SitfState = {
  cnpj: string;
  protocolo?: string | null;
  status: 'novo' | 'aguardando' | 'pronto' | 'erro';
  next_eligible_at?: string | null;
  expires_at?: string | null;
  file_url?: string | null;
  last_response?: any;
  attempts?: number;
};

function normalizeCnpj(value: string): string {
  return (value || '').replace(/\D/g, '');
}

/**
 * Gera headers que simulam um navegador real para evitar detecção de automação
 * APIs frequentemente detectam automação pela falta desses headers
 */
function gerarHeadersNavegador(accessToken: string, jwtToken?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    // Headers de navegador para simular requisição manual
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
    'Origin': 'https://www.gov.br',
    'Referer': 'https://www.gov.br/',
  };
  
  // Adicionar JWT token se disponível
  if (jwtToken) {
    headers['jwt_token'] = jwtToken;
  }
  
  return headers;
}

async function ensureBucket(bucket: string) {
  if (!supabaseAdmin) return;
  try {
    const { data, error } = await supabaseAdmin.storage.getBucket(bucket);
    if (error || !data) {
      await supabaseAdmin.storage.createBucket(bucket, { public: false });
    }
  } catch {
    // ignore
  }
}

async function uploadPdfAndGetSignedUrl(base64: string, cnpj: string): Promise<string | null> {
  if (!supabaseAdmin) return null;
  await ensureBucket('sitf');
  const filename = `${normalizeCnpj(cnpj)}_${Date.now()}.pdf`;
  const bytes = base64ToBuffer(base64);
  const { error: upErr } = await supabaseAdmin.storage.from('sitf').upload(filename, bytes, { contentType: 'application/pdf', upsert: false });
  if (upErr) {
    console.warn('[Sitf] upload erro', upErr);
    return null;
  }
  const { data: signed, error: signErr } = await supabaseAdmin.storage.from('sitf').createSignedUrl(filename, 60 * 60 * 24); // 24h
  if (signErr || !signed?.signedUrl) {
    console.warn('[Sitf] signed url erro', signErr);
    return null;
  }
  return signed.signedUrl;
}

function parseTempoEspera(msOrText?: unknown): number | null {
  if (typeof msOrText === 'number') return msOrText;
  if (typeof msOrText === 'string') {
    const m = msOrText.match(/(\\d+)[ ]*(ms|milisseg|seg|s)/i);
    if (m) {
      const n = parseInt(m[1], 10);
      const unit = m[2].toLowerCase();
      if (unit.startsWith('ms') || unit.startsWith('miliss')) return n;
      return n * 1000;
    }
    const onlyNumber = msOrText.match(/\\d+/);
    if (onlyNumber) return parseInt(onlyNumber[0], 10) * 1000;
  }
  return null;
}

async function getState(cnpj: string): Promise<SitfState | null> {
  const clean = normalizeCnpj(cnpj);
  const client = supabaseAdmin || supabase;
  const { data, error } = await client
    .from('sitf_protocols')
    .select('*')
    .eq('cnpj', clean)
    .maybeSingle();
  if (error) {
    console.warn('[Sitf] getState error', error);
    return null;
  }
  
  if (data) {
    console.log('[Sitf] Estado recuperado do banco:', {
      hasProtocolo: !!data.protocolo,
      status: data.status,
      nextEligibleAt: data.next_eligible_at,
    });
  } else {
    console.log('[Sitf] Nenhum estado encontrado no banco para CNPJ:', clean);
  }
  
  return (data as any) ?? null;
}

async function upsertState(partial: Partial<SitfState> & { cnpj: string }) {
  const client = supabaseAdmin || supabase;
  const payload: any = { ...partial, cnpj: normalizeCnpj(partial.cnpj) };
  
  // Converter todos os undefined para null (MySQL não aceita undefined)
  Object.keys(payload).forEach(key => {
    if (payload[key] === undefined) {
      payload[key] = null;
    }
  });
  
  // Validar e converter last_response para JSON válido (MySQL JSON não aceita strings vazias)
  if (payload.last_response !== null && payload.last_response !== undefined) {
    if (typeof payload.last_response === 'string') {
      // Se for string vazia, converter para null
      if (payload.last_response.trim() === '') {
        payload.last_response = null;
      } else {
        // Tentar fazer parse se for JSON string
        try {
          payload.last_response = JSON.parse(payload.last_response);
        } catch {
          // Se não for JSON válido, envolver em objeto
          payload.last_response = { raw: payload.last_response };
        }
      }
    } else if (typeof payload.last_response !== 'object') {
      // Se não for objeto nem string, envolver em objeto
      payload.last_response = { raw: payload.last_response };
    }
  } else {
    payload.last_response = null;
  }
  
  // Converter datas ISO para formato MySQL (YYYY-MM-DD HH:MM:SS)
  // MySQL TIMESTAMP aceita formato: YYYY-MM-DD HH:MM:SS (sem timezone)
  if (payload.next_eligible_at) {
    try {
      const date = typeof payload.next_eligible_at === 'string' 
        ? new Date(payload.next_eligible_at) 
        : payload.next_eligible_at;
      
      if (date instanceof Date && !isNaN(date.getTime())) {
        // Converter para formato MySQL: YYYY-MM-DD HH:MM:SS
        // Usar métodos locais para manter o timezone correto
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        payload.next_eligible_at = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        console.log('[Sitf] next_eligible_at convertido para MySQL (local):', payload.next_eligible_at);
      } else {
        console.warn('[Sitf] next_eligible_at inválido, removendo:', payload.next_eligible_at);
        delete payload.next_eligible_at;
      }
    } catch (err) {
      console.error('[Sitf] Erro ao converter next_eligible_at:', err);
      delete payload.next_eligible_at;
    }
  }
  
  if (payload.expires_at) {
    try {
      const date = typeof payload.expires_at === 'string' 
        ? new Date(payload.expires_at) 
        : payload.expires_at;
      
      if (date instanceof Date && !isNaN(date.getTime())) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(date.getUTCSeconds()).padStart(2, '0');
        payload.expires_at = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      } else {
        delete payload.expires_at;
      }
    } catch (err) {
      console.error('[Sitf] Erro ao converter expires_at:', err);
      delete payload.expires_at;
    }
  }
  
  console.log('[Sitf] Salvando estado no banco:', {
    cnpj: payload.cnpj,
    hasProtocolo: !!payload.protocolo,
    status: payload.status,
    next_eligible_at: payload.next_eligible_at,
  });
  
  const { error } = await client.from('sitf_protocols').upsert(payload, { onConflict: 'cnpj' });
  if (error) {
    console.error('[Sitf] upsertState error', error);
    throw error; // Re-throw para que o erro seja propagado
  }
  
  console.log('[Sitf] Estado salvo com sucesso no banco');
}

export async function fetchAccessToken(): Promise<string> {
  // 1) Preferir proxy/gateway de token (GET), quando configurado
  let proxyUrl = process.env['SERPRO_TOKEN_PROXY_URL'];
  if (!proxyUrl) {
    // Fallback: reaproveitar a mesma configuração usada em Pagamentos (ReceitaFederalService)
    const authBase = process.env['RECEITA_AUTH_URL'] || 'https://auth-token-server-production-ce0e.up.railway.app';
    const authEndpoint = process.env['RECEITA_AUTH_ENDPOINT'] || '/serpro/token';
    proxyUrl = `${authBase}${authEndpoint}`;
  }
  if (proxyUrl) {
    const { data } = await axios.get(proxyUrl, { timeout: 20000 });
    const token = data?.access_token;
    if (!token) throw new Error('Token proxy não retornou access_token');
    return token;
  }
  // 2) Fallback: fluxo OAuth client_credentials direto no SERPRO
  const url = process.env['SERPRO_TOKEN_URL'];
  const clientId = process.env['SERPRO_CLIENT_ID'];
  const clientSecret = process.env['SERPRO_CLIENT_SECRET'];
  if (!url || !clientId || !clientSecret) {
    throw new Error('Configuração de token ausente (SERPRO_TOKEN_PROXY_URL ou SERPRO_TOKEN_URL/CLIENT_ID/CLIENT_SECRET)');
  }
  const params = new URLSearchParams();
  params.set('grant_type', 'client_credentials');
  const { data } = await axios.post(url, params.toString(), {
    auth: { username: clientId, password: clientSecret },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 30000,
  });
  const token = data?.access_token;
  if (!token) throw new Error('Não foi possível obter access_token do SERPRO');
  return token;
}

/**
 * Retorna ambos tokens (access e jwt) quando disponíveis no proxy.
 */
async function fetchAuthTokens(): Promise<{ accessToken: string; jwtToken?: string | null }> {
  // 1) Preferir proxy/gateway de token (GET), quando configurado
  let proxyUrl = process.env['SERPRO_TOKEN_PROXY_URL'];
  if (!proxyUrl) {
    // Fallback: reaproveitar a mesma configuração usada em Pagamentos (ReceitaFederalService)
    const authBase = process.env['RECEITA_AUTH_URL'] || 'https://auth-token-server-production-ce0e.up.railway.app';
    const authEndpoint = process.env['RECEITA_AUTH_ENDPOINT'] || '/serpro/token';
    proxyUrl = `${authBase}${authEndpoint}`;
  }
  if (proxyUrl) {
    console.log('[Sitf] Obtendo tokens do proxy:', proxyUrl);
    const { data } = await axios.get(proxyUrl, { timeout: 20000 });
    const accessToken = data?.access_token;
    if (!accessToken) throw new Error('Token proxy não retornou access_token');
    const jwtToken = data?.jwt_token ?? null;
    console.log('[Sitf] Tokens obtidos:', { hasAccessToken: !!accessToken, hasJwtToken: !!jwtToken });
    return { accessToken, jwtToken };
  }
  // 2) Fallback: só access token via OAuth
  console.log('[Sitf] Usando fallback OAuth para access token');
  const accessToken = await fetchAccessToken();
  return { accessToken, jwtToken: null };
}

async function solicitarProtocolo(cnpj: string) {
  const baseUrl = process.env['SERPRO_BASE_URL'] || process.env['RECEITA_API_URL'] || 'https://gateway.apiserpro.serpro.gov.br';
  const path = process.env['SERPRO_APOIAR_PATH'] || '/integra-contador/v1/Apoiar';
  const { accessToken, jwtToken } = await fetchAuthTokens();
  const url = `${baseUrl}${path}`;
  const cnpjFixo = normalizeCnpj(process.env['SERPRO_CONTRATANTE_CNPJ'] || '32401481000133');
  const body = {
    contratante: { numero: cnpjFixo, tipo: 2 },
    autorPedidoDados: { numero: cnpjFixo, tipo: 2 },
    contribuinte: { numero: normalizeCnpj(cnpj), tipo: 2 },
    pedidoDados: { idSistema: 'SITFIS', idServico: 'SOLICITARPROTOCOLO91', versaoSistema: '2.0', dados: '' },
  };
  console.log('[Sitf] Solicitar protocolo:', { 
    url, 
    cnpj: normalizeCnpj(cnpj),
    hasAccessToken: !!accessToken,
    hasJwtToken: !!jwtToken,
    accessTokenPreview: accessToken ? `${accessToken.substring(0, 20)}...` : 'N/A'
  });
  console.log('[Sitf] Body da requisição:', JSON.stringify(body, null, 2));
  
  // Usar headers que simulam navegador para evitar detecção de automação
  const headers = gerarHeadersNavegador(accessToken, jwtToken);
  
  console.log('[Sitf] Headers da requisição:', {
    'Content-Type': headers['Content-Type'],
    'Accept': headers['Accept'],
    'Authorization': headers['Authorization'] ? 'Bearer ***' : 'NÃO DEFINIDO',
    'jwt_token': headers['jwt_token'] ? '***' : 'NÃO DEFINIDO',
  });
  let res;
  try {
    res = await axios.post(url, body, {
      headers,
      timeout: 30000,
      validateStatus: () => true, // não lançar erro automaticamente
    });
  } catch (err: any) {
    // Tratar erros de rede/timeout
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      const mensagemClara = 'Tempo de espera esgotado ao conectar com a Receita Federal. Verifique sua conexão com a internet e tente novamente.';
      console.error('[Sitf] Timeout na requisição ao SERPRO:', {
        url,
        timeout: err.config?.timeout,
        message: err.message,
      });
      throw new NetworkError(mensagemClara, err);
    }
    
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      const mensagemClara = 'Não foi possível conectar com a Receita Federal. Verifique sua conexão com a internet.';
      console.error('[Sitf] Erro de conexão com SERPRO:', {
        url,
        code: err.code,
        message: err.message,
      });
      throw new NetworkError(mensagemClara, err);
    }
    
    // Se já é um erro tratado (SerproError, AuthorizationError, etc.), re-lançar
    if (err instanceof SerproError || err instanceof AuthorizationError || err instanceof NetworkError) {
      throw err;
    }
    
    // Erro genérico
    console.error('[Sitf] Erro na requisição ao SERPRO:', {
      message: err?.message,
      status: err?.response?.status,
      statusText: err?.response?.statusText,
      data: err?.response?.data,
      code: err?.code,
    });
    
    const mensagemClara = err?.response?.data?.mensagens?.[0]?.texto 
      || err?.response?.data?.message 
      || err?.message 
      || 'Erro ao comunicar com a Receita Federal. Tente novamente.';
    
    throw new SerproError(mensagemClara, err?.response?.status || 500, err?.response?.data);
  }
  
  // Verificar status HTTP
  if (res.status === 403) {
    const mensagens = res.data?.mensagens || [];
    const errorMsg = mensagens[0]?.texto || res.data?.message || 'Acesso negado';
    
    // Extrair informações específicas do erro
    const autorCNPJ = res.data?.autorPedidoDados?.numero;
    const contribuinteCNPJ = res.data?.contribuinte?.numero;
    
    let mensagemClara = 'Acesso negado pela Receita Federal.';
    if (errorMsg.includes('procuração')) {
      mensagemClara = `Procuração não autorizada. O CNPJ ${autorCNPJ || 'do contratante'} não possui procuração autorizada no Portal eCAC para consultar o CNPJ ${contribuinteCNPJ || 'do contribuinte'}. É necessário autorizar a procuração no Portal eCAC da Receita Federal.`;
    } else if (errorMsg.includes('credenciais') || errorMsg.includes('token')) {
      mensagemClara = 'Credenciais inválidas ou token expirado. Verifique as configurações de acesso à API da Receita Federal.';
    } else {
      mensagemClara = errorMsg;
    }
    
    console.error('[Sitf] SERPRO retornou 403 (Acesso Negado):', {
      url,
      autorCNPJ,
      contribuinteCNPJ,
      mensagemOriginal: errorMsg,
      mensagemClara,
      responseData: res.data,
    });
    
    throw new AuthorizationError(mensagemClara, res.data);
  }
  
  if (res.status === 401) {
    const mensagemClara = 'Não autorizado. Verifique se as credenciais de acesso à API da Receita Federal estão corretas e válidas.';
    console.error('[Sitf] SERPRO retornou 401 (Não Autorizado):', {
      url,
      responseData: res.data,
    });
    throw new AuthorizationError(mensagemClara, res.data);
  }
  
  if (res.status >= 500) {
    const mensagemClara = 'Erro no servidor da Receita Federal. Tente novamente em alguns instantes.';
    console.error('[Sitf] SERPRO retornou erro do servidor:', {
      status: res.status,
      url,
      responseData: res.data,
    });
    throw new SerproError(mensagemClara, res.status, res.data);
  }
  
  // Tratar 304 (Not Modified) - pode significar que já existe protocolo em processamento
  if (res.status === 304) {
    const mensagens: any[] = res.data?.mensagens || [];
    const tempoMsg = mensagens.find((m) => 
      String(m.codigo || '').toLowerCase().includes('aviso') || 
      String(m.texto || '').toLowerCase().includes('processamento') ||
      String(m.texto || '').toLowerCase().includes('aguarde')
    );
    const waitMs = parseTempoEspera(tempoMsg?.texto) ?? 5000;
    console.log('[Sitf] SERPRO retornou 304 (protocolo ainda processando ou já existe), waitMs:', waitMs);
    
    // Tentar extrair protocolo mesmo com 304 (pode estar na resposta)
    let protocolo: string | undefined = undefined;
    if (typeof res.data?.dados === 'string') {
      try {
        const s = res.data.dados.replace(/^"+|"+$/g, '');
        const parsed = JSON.parse(s);
        protocolo = parsed?.protocoloRelatorio;
      } catch {
        // Ignorar erro de parse
      }
    } else if (res.data?.dados && typeof res.data.dados === 'object') {
      protocolo = res.data.dados.protocoloRelatorio;
    }
    
    // Se não temos protocolo, retornar erro para aguardar
    if (!protocolo) {
      throw new Error(`Protocolo ainda em processamento. Aguarde ${Math.ceil(waitMs / 1000)}s e tente novamente.`);
    }
    
    // Se temos protocolo mesmo com 304, retornar normalmente
    console.log('[Sitf] Protocolo extraído mesmo com status 304:', protocolo.substring(0, 50) + '...');
    return { protocolo, waitMs, raw: res.data };
  }
  
  if (res.status !== 200 && res.status !== 202) {
    const errorMsg = res.data?.mensagens?.[0]?.texto || res.data?.message || `Erro HTTP ${res.status}`;
    console.error('[Sitf] SERPRO retornou erro:', {
      status: res.status,
      url,
      responseData: res.data,
      errorMsg,
    });
    throw new Error(`SERPRO retornou ${res.status}: ${errorMsg}`);
  }
  
  // Log da resposta completa para debug
  console.log('[Sitf] Resposta do SERPRO /Apoiar:', {
    status: res.status,
    hasData: !!res.data,
    dataKeys: res.data ? Object.keys(res.data) : [],
    dadosType: typeof res.data?.dados,
    dadosPreview: typeof res.data?.dados === 'string' ? res.data.dados.substring(0, 200) : res.data?.dados,
  });
  
  // Extrair e limpar protocolo
  let protocolo: string | undefined = res.data?.dados?.protocoloRelatorio;
  let tempoEsperaExtraido: number | null = null;
  
  // Se dados é uma string JSON, fazer parse
  if (typeof res.data?.dados === 'string') {
    try {
      // alguns retornos vêm como string JSON escapada: "{\"protocoloRelatorio\":\"...\",\"tempoEspera\":4000}"
      const s = res.data.dados.replace(/^"+|"+$/g, '');
      const parsed = JSON.parse(s);
      protocolo = parsed?.protocoloRelatorio;
      tempoEsperaExtraido = parsed?.tempoEspera ? parseInt(String(parsed.tempoEspera), 10) : null;
      console.log('[Sitf] Dados parseados de string JSON:', {
        hasProtocolo: !!protocolo,
        tempoEspera: tempoEsperaExtraido,
      });
    } catch (parseErr) {
      console.warn('[Sitf] Erro ao fazer parse do dados como JSON:', parseErr);
    }
  } else if (res.data?.dados && typeof res.data.dados === 'object') {
    // Se dados é um objeto, extrair diretamente
    protocolo = res.data.dados.protocoloRelatorio;
    tempoEsperaExtraido = res.data.dados.tempoEspera ? parseInt(String(res.data.dados.tempoEspera), 10) : null;
  }
  
  // garantir protocolo limpo (sem aspas extras/espacos)
  protocolo = (protocolo || '').toString().trim().replace(/^"+|"+$/g, '');
  
  // Determinar waitMs: usar tempoEspera extraído, senão tentar das mensagens, senão usar padrão
  let waitMs = 5000;
  if (tempoEsperaExtraido && !Number.isNaN(tempoEsperaExtraido)) {
    waitMs = tempoEsperaExtraido;
    console.log('[Sitf] Usando tempoEspera da resposta:', waitMs, 'ms');
  } else {
    const mensagens: any[] = res.data?.mensagens || [];
    const tempoMsg = mensagens.find((m) => String(m.codigo || '').toLowerCase().includes('aviso'));
    const waitFromMsg = parseTempoEspera(tempoMsg?.texto);
    if (waitFromMsg) {
      waitMs = waitFromMsg;
      console.log('[Sitf] Usando tempoEspera das mensagens:', waitMs, 'ms');
    } else {
      console.log('[Sitf] Usando tempoEspera padrão:', waitMs, 'ms');
    }
  }
  
  console.log('[Sitf] Protocolo final:', protocolo ? `${protocolo.substring(0, 50)}...` : 'NÃO ENCONTRADO');
  
  if (!protocolo) {
    const mensagens = res.data?.mensagens || [];
    const mensagemErro = mensagens[0]?.texto || 'Protocolo não retornado pela Receita Federal';
    console.error('[Sitf] Resposta completa do SERPRO (sem protocolo):', JSON.stringify(res.data, null, 2));
    throw new SerproError(
      `Não foi possível obter o protocolo de consulta. ${mensagemErro}`,
      res.status,
      res.data
    );
  }
  return { protocolo, waitMs, raw: res.data };
}

async function emitirRelatorio(protocolo: string, cnpj: string) {
  const baseUrl = process.env['SERPRO_BASE_URL'] || process.env['RECEITA_API_URL'] || 'https://gateway.apiserpro.serpro.gov.br';
  const path = process.env['SERPRO_EMITIR_PATH'] || '/integra-contador/v1/Emitir';
  const { accessToken, jwtToken } = await fetchAuthTokens();
  const url = `${baseUrl}${path}`;
  const cnpjFixo = normalizeCnpj(process.env['SERPRO_CONTRATANTE_CNPJ'] || '32401481000133');
  // Limpar protocolo (remover espaços, aspas extras, etc.)
  const protocoloLimpo = (protocolo || '').toString().trim().replace(/^"+|"+$/g, '').replace(/\s+/g, '');
  
  const body = {
    contratante: { numero: cnpjFixo, tipo: 2 },
    autorPedidoDados: { numero: cnpjFixo, tipo: 2 },
    contribuinte: { numero: normalizeCnpj(cnpj), tipo: 2 },
    pedidoDados: {
      idSistema: 'SITFIS',
      idServico: 'RELATORIOSITFIS92',
      versaoSistema: '2.0',
      // 'dados' deve ser uma string JSON com o protocolo limpo
      dados: JSON.stringify({ protocoloRelatorio: protocoloLimpo }),
    },
  };
  // Usar headers que simulam navegador para evitar detecção de automação
  const headers = gerarHeadersNavegador(accessToken, jwtToken);
  
  console.log('[Sitf] Emitir relatório:', { 
    url, 
    protocoloOriginal: protocolo.substring(0, 50) + '...',
    protocoloLimpo: protocoloLimpo.substring(0, 50) + '...',
    cnpj: normalizeCnpj(cnpj),
  });
  console.log('[Sitf] Body emitir relatório:', JSON.stringify(body, null, 2));
  console.log('[Sitf] Protocolo no dados (string):', body.pedidoDados.dados);
  
  try {
    const res = await axios.post(url, body, {
      headers,
      validateStatus: () => true,
      timeout: 30000,
    });
    
    console.log('[Sitf] Resposta do SERPRO /Emitir:', {
      status: res.status,
      hasData: !!res.data,
      dataKeys: res.data ? Object.keys(res.data) : [],
      dadosType: typeof res.data?.dados,
      dadosPreview: typeof res.data?.dados === 'string' ? res.data.dados.substring(0, 200) : res.data?.dados,
      mensagens: res.data?.mensagens,
    });
    
    // Verificar se retornou 202 (Accepted) - relatório ainda em processamento
    if (res.status === 202) {
      const mensagens: any[] = res.data?.mensagens || [];
      const tempoMsg = mensagens.find((m) => String(m.codigo || '').toLowerCase().includes('aviso') || String(m.codigo || '').toLowerCase().includes('processamento'));
      const waitMs = parseTempoEspera(tempoMsg?.texto) ?? 5000;
      console.log('[Sitf] SERPRO retornou 202 (em processamento), waitMs:', waitMs);
      return { status: 202 as const, waitMs, raw: res.data };
    }
    
    if (res.status === 200) {
      // Extrair PDF base64: o campo 'dados' pode vir em diferentes formatos:
      // 1. String JSON: "{\"pdf\":\"JVBERi0xLjQK...\"}"
      // 2. Objeto: { pdf: "JVBERi0xLjQK..." }
      // 3. Base64 direto (string longa que parece base64)
      let pdf: string | undefined = undefined;
      
      if (typeof res.data?.dados === 'string') {
        const dadosStr = res.data.dados.trim();
        
        // Tentar parsear como JSON primeiro
        try {
          const dadosParsed = JSON.parse(dadosStr);
          pdf = dadosParsed?.pdf;
          console.log('[Sitf] PDF extraído de string JSON parseada:', pdf ? `SIM (${pdf.substring(0, 50)}...)` : 'NÃO');
        } catch (parseErr) {
          // Se não for JSON válido, verificar se é base64 direto
          // Base64 geralmente tem caracteres alfanuméricos, +, /, = e é bem longo
          const isBase64Like = /^[A-Za-z0-9+/=]+$/.test(dadosStr) && dadosStr.length > 100;
          if (isBase64Like) {
            pdf = dadosStr;
            console.log('[Sitf] PDF extraído como base64 direto (não JSON):', pdf ? `SIM (${pdf.substring(0, 50)}...)` : 'NÃO');
          } else {
            console.warn('[Sitf] Dados não é JSON válido nem parece base64:', dadosStr.substring(0, 100));
          }
        }
      } else if (res.data?.dados && typeof res.data.dados === 'object') {
        // Se dados é um objeto, extrair diretamente
        pdf = res.data.dados.pdf;
        console.log('[Sitf] PDF extraído de objeto:', pdf ? `SIM (${pdf.substring(0, 50)}...)` : 'NÃO');
        
        // Se não encontrou em .pdf, verificar outras chaves possíveis
        if (!pdf) {
          pdf = res.data.dados.base64 || res.data.dados.conteudo || res.data.dados.arquivo;
          if (pdf) {
            console.log('[Sitf] PDF encontrado em chave alternativa:', Object.keys(res.data.dados).join(', '));
          }
        }
      }
      
      if (!pdf) {
        // Pode ser que o status dentro dos dados indique que ainda está processando
        const statusInterno = res.data?.status;
        const mensagens: any[] = res.data?.mensagens || [];
        console.warn('[Sitf] Status 200 mas sem PDF. Status interno:', statusInterno, 'Mensagens:', mensagens);
        console.warn('[Sitf] Estrutura completa de dados:', JSON.stringify(res.data?.dados, null, 2).substring(0, 500));
        
        // Se houver mensagem indicando processamento, tratar como 202
        const processandoMsg = mensagens.find((m) => 
          String(m.texto || '').toLowerCase().includes('processamento') ||
          String(m.texto || '').toLowerCase().includes('aguarde') ||
          String(m.codigo || '').toLowerCase().includes('aviso')
        );
        if (processandoMsg) {
          const waitMs = parseTempoEspera(processandoMsg.texto) ?? 5000;
          console.log('[Sitf] Tratando como 202 (processamento), waitMs:', waitMs);
          return { status: 202 as const, waitMs, raw: res.data };
        }
        
        throw new Error('PDF base64 ausente na resposta do SERPRO. Verifique os logs para mais detalhes.');
      }
      
      // Validar que o PDF base64 parece válido (começa com indicador de PDF)
      const pdfHeader = Buffer.from(pdf.substring(0, Math.min(20, pdf.length)), 'base64').toString('utf-8');
      const isValidPdf = pdfHeader.includes('%PDF') || pdf.length > 1000; // PDFs são geralmente grandes
      
      if (!isValidPdf && pdf.length < 100) {
        console.warn('[Sitf] PDF base64 parece muito curto ou inválido. Tamanho:', pdf.length);
      }
      
      console.log('[Sitf] PDF obtido com sucesso! Tamanho base64:', pdf.length, 'caracteres');
      return { status: 200 as const, pdfBase64: pdf, raw: res.data };
    }
    if (res.status === 304) {
      // HTTP 304 (Not Modified) significa que o relatório ainda não está pronto
      // Tratar como 202 (Accepted) - relatório em processamento
      const mensagens: any[] = res.data?.mensagens || [];
      const tempoMsg = mensagens.find((m) => 
        String(m.codigo || '').toLowerCase().includes('aviso') || 
        String(m.texto || '').toLowerCase().includes('processamento') ||
        String(m.texto || '').toLowerCase().includes('aguarde')
      );
      const waitMs = parseTempoEspera(tempoMsg?.texto) ?? 5000;
      console.log('[Sitf] SERPRO retornou 304 (Not Modified - relatório ainda processando), waitMs:', waitMs);
      // Tratar 304 como 202 para manter consistência
      return { status: 202 as const, waitMs, raw: res.data };
    }
  
  // Tratar 204 (No Content) - relatório ainda não está pronto
  if (res.status === 204) {
    const waitMs = 5000; // Padrão de 5 segundos para 204
    console.log('[Sitf] SERPRO retornou 204 (No Content) - relatório ainda não está pronto, aguardando:', waitMs, 'ms');
    return { status: 204 as const, waitMs, raw: res.data || {} };
  }
  
  // Tratar erros de autorização
  if (res.status === 403 || res.status === 401) {
    const mensagens = res.data?.mensagens || [];
    const errorMsg = mensagens[0]?.texto || res.data?.message || 'Acesso negado';
    let mensagemClara = 'Acesso negado pela Receita Federal.';
    if (errorMsg.includes('procuração')) {
      mensagemClara = 'Procuração não autorizada. É necessário autorizar a procuração no Portal eCAC da Receita Federal.';
    }
    console.error('[Sitf] SERPRO retornou erro de autorização ao emitir relatório:', {
      status: res.status,
      mensagem: errorMsg,
      mensagemClara,
    });
    throw new AuthorizationError(mensagemClara, res.data);
  }
  
  // Tratar outros erros HTTP
  if (res.status >= 400 && res.status < 500) {
    const mensagens = res.data?.mensagens || [];
    const errorMsg = mensagens[0]?.texto || res.data?.message || `Erro na requisição (${res.status})`;
    console.error('[Sitf] SERPRO retornou erro ao emitir relatório:', {
      status: res.status,
      mensagem: errorMsg,
      responseData: res.data,
    });
    throw new SerproError(errorMsg, res.status, res.data);
  }
  
  if (res.status >= 500) {
    // Verificar se o erro indica que o protocolo está inválido
    const mensagens = res.data?.mensagens || [];
    const errorMsg = mensagens[0]?.texto || '';
    const isProtocolInvalid = errorMsg.includes('Inicie uma nova solicitação') || 
                              errorMsg.includes('ER05') ||
                              errorMsg.includes('protocolo');
    
    let mensagemClara = 'Erro no servidor da Receita Federal. Tente novamente em alguns instantes.';
    if (isProtocolInvalid) {
      mensagemClara = 'O protocolo utilizado não é mais válido. É necessário solicitar um novo protocolo.';
    }
    
    console.error('[Sitf] SERPRO retornou erro do servidor ao emitir relatório:', {
      status: res.status,
      mensagem: errorMsg,
      isProtocolInvalid,
      responseData: res.data,
    });
    
    const error = new SerproError(mensagemClara, res.status, res.data);
    // Adicionar flag para indicar que o protocolo está inválido
    (error as any).isProtocolInvalid = isProtocolInvalid;
    throw error;
  }
  
  console.warn('[Sitf] Status inesperado do SERPRO ao emitir relatório:', res.status);
    return { status: res.status as any, raw: res.data };
  } catch (e: any) {
    // Se já é um erro tratado, re-lançar
    if (e instanceof SerproError || e instanceof AuthorizationError || e instanceof NetworkError) {
    throw e;
    }
    
    // Tratar erros de rede/timeout
    if (e.code === 'ECONNABORTED' || e.message?.includes('timeout')) {
      const mensagemClara = 'Tempo de espera esgotado ao conectar com a Receita Federal. Verifique sua conexão e tente novamente.';
      throw new NetworkError(mensagemClara, e);
    }
    
    if (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND') {
      const mensagemClara = 'Não foi possível conectar com a Receita Federal. Verifique sua conexão com a internet.';
      throw new NetworkError(mensagemClara, e);
    }
    
    // Erro genérico
    const mensagemClara = e?.response?.data?.mensagens?.[0]?.texto 
      || e?.response?.data?.message 
      || e?.message 
      || 'Erro ao emitir relatório na Receita Federal';
    throw new SerproError(mensagemClara, e?.response?.status || 500, e?.response?.data);
  }
}

export class SituacaoFiscalOrchestrator {
  static async handleDownload(cnpj: string) {
    const clean = normalizeCnpj(cnpj);
    const now = Date.now();
    const state = (await getState(clean)) ?? { cnpj: clean, status: 'novo' as const };
    
    console.log('[Sitf] handleDownload iniciado:', {
      cnpj: clean,
      hasProtocolo: !!state.protocolo,
      status: state.status,
      hasFileUrl: !!state.file_url,
      nextEligibleAt: state.next_eligible_at,
    });

    // 1) Já temos arquivo pronto? (aqui usamos file_url como flag; pode ser expandido para storage real)
    if (state.file_url) {
      return { type: 'ready-url' as const, url: state.file_url };
    }

    // 2) Tentar emitir se já há protocolo (antes de verificar cooldown)
    // Isso garante que sempre tentamos buscar o PDF quando temos protocolo
    if (state.protocolo) {
      console.log('[Sitf] Tentando emitir relatório com protocolo existente...');
      try {
      const emit = await emitirRelatorio(state.protocolo, clean);
      if (emit.status === 200) {
        // Upload opcional para storage (pode falhar se não tiver Supabase Storage configurado)
        const url = await uploadPdfAndGetSignedUrl(emit.pdfBase64, clean);
        
        // Verificar se há dados estruturados na resposta (além do PDF)
        // A API pode retornar JSON estruturado em emit.raw
        let structuredDataFromApi: SitfExtractedData | null = null;
        
        // Tentar extrair JSON estruturado da resposta da API
        // A API SERPRO pode retornar dados estruturados em diferentes formatos
        try {
          const rawData = emit.raw;
          
          // 1. Verificar se dados é um objeto com campos estruturados
          if (rawData?.dados && typeof rawData.dados === 'object') {
            const dadosObj = rawData.dados;
            
            // Tentar encontrar JSON em campos comuns
            if (dadosObj.json || dadosObj.data || dadosObj.estruturado) {
              const jsonData = dadosObj.json || dadosObj.data || dadosObj.estruturado;
              if (jsonData && typeof jsonData === 'object') {
                structuredDataFromApi = jsonData as SitfExtractedData;
                console.log('[Sitf] ✅ JSON estruturado encontrado em dados.json/data/estruturado');
              }
            }
            
            // 2. Se dados é um objeto completo (não apenas {pdf: "..."}), pode ser o JSON completo
            if (!structuredDataFromApi && dadosObj && Object.keys(dadosObj).length > 1) {
              // Verificar se tem campos esperados do JSON estruturado
              if (dadosObj.empresa || dadosObj.fonte || dadosObj.certidao_conjunta_rfb_pgfn) {
                structuredDataFromApi = dadosObj as SitfExtractedData;
                console.log('[Sitf] ✅ JSON estruturado encontrado diretamente em dados (objeto completo)');
              }
            }
          }
          
          // 3. Verificar se há um campo separado com dados estruturados na resposta raiz
          if (!structuredDataFromApi && rawData) {
            if (rawData.estruturado || rawData.json || rawData.data) {
              const jsonData = rawData.estruturado || rawData.json || rawData.data;
              if (jsonData && typeof jsonData === 'object') {
                structuredDataFromApi = jsonData as SitfExtractedData;
                console.log('[Sitf] ✅ JSON estruturado encontrado na raiz da resposta');
              }
            }
          }
          
          // 4. Se dados é uma string JSON, tentar parsear
          if (!structuredDataFromApi && rawData?.dados && typeof rawData.dados === 'string') {
            try {
              const parsed = JSON.parse(rawData.dados);
              // Se o parseado não é apenas {pdf: "..."}, pode ser o JSON completo
              if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 1) {
                if (parsed.empresa || parsed.fonte || parsed.certidao_conjunta_rfb_pgfn) {
                  structuredDataFromApi = parsed as SitfExtractedData;
                  console.log('[Sitf] ✅ JSON estruturado encontrado parseando dados como string JSON');
                }
              }
            } catch (parseErr) {
              // Ignorar erro de parse
            }
          }
          
          if (structuredDataFromApi) {
            console.log('[Sitf] ✅ JSON estruturado extraído da API:', {
              hasEmpresa: !!structuredDataFromApi.empresa,
              hasCertidao: !!structuredDataFromApi.certidao_conjunta_rfb_pgfn,
              hasEndereco: !!structuredDataFromApi.endereco,
            });
          } else {
            console.log('[Sitf] ⚠️ JSON estruturado não encontrado na resposta da API, será extraído do PDF');
          }
        } catch (err) {
          console.warn('[Sitf] Erro ao tentar extrair JSON da resposta da API:', err);
        }
        
        // Salvar em downloads mesmo sem URL do storage (armazenar base64 no banco)
        const client = supabaseAdmin || supabase;
        
        // ✅ NOVA LÓGICA: Verificar se já existe registro para este CNPJ
        // Buscar o registro mais recente para o CNPJ
        const { data: existingRecords, error: checkError } = await client
            .from('sitf_downloads')
          .select('id, created_at, file_url, pdf_base64')
            .eq('cnpj', clean)
            .order('created_at', { ascending: false })
            .limit(1);
          
          if (checkError) {
          console.warn('[Sitf] Erro ao verificar registros existentes:', checkError);
        }
        
        let downloadId: string;
        let isUpdate = false;
        
        // Se existe registro, vamos atualizar ao invés de inserir
        if (existingRecords && existingRecords.length > 0) {
          const existingRecord = existingRecords[0];
          downloadId = existingRecord.id;
          isUpdate = true;
          
          console.log('[Sitf] Registro existente encontrado, atualizando com dados mais novos:', {
            id: downloadId,
            cnpj: clean,
            created_at: existingRecord.created_at,
          });
          
          // Atualizar registro existente
          const updateData: any = {
            file_url: url || existingRecord.file_url, // Manter URL existente se nova for null
            pdf_base64: emit.pdfBase64, // Sempre atualizar com o PDF mais recente
          };
          
          try {
            const { error: updateError } = await client
              .from('sitf_downloads')
              .update(updateData)
              .eq('id', downloadId);
            
            if (updateError) {
              console.error('[Sitf] Erro ao atualizar download no banco:', {
                code: updateError.code,
                message: updateError.message,
                details: 'O PDF foi gerado com sucesso, mas não foi possível atualizar no histórico.'
              });
            } else {
              console.log('[Sitf] Download atualizado com sucesso no banco (com base64)');
            }
          } catch (updateErr: any) {
            console.error('[Sitf] Erro ao atualizar download no banco:', {
              message: updateErr?.message,
              details: 'O PDF foi gerado com sucesso, mas não foi possível atualizar no histórico.'
            });
          }
        } else {
          // Não existe registro, inserir novo
          downloadId = randomUUID();
          isUpdate = false;
          
              const insertData: any = { 
            id: downloadId,
                cnpj: clean, 
            file_url: url || null,
            pdf_base64: emit.pdfBase64,
              };
              
          console.log('[Sitf] Salvando novo PDF base64 no banco para extração sob demanda');
          try {
            const { data: insertedData, error: insertError } = await client.from('sitf_downloads').insert(insertData);
              if (insertError) {
                if (insertError.code === '23505' || insertError.message?.includes('duplicate') || insertError.message?.includes('unique')) {
                console.log('[Sitf] Registro duplicado detectado pelo banco (constraint), tentando atualizar...');
                // Se deu erro de duplicata, tentar buscar o ID existente e atualizar
                const { data: existingRecords } = await client
                  .from('sitf_downloads')
                  .select('id')
                  .eq('cnpj', clean)
                  .order('created_at', { ascending: false })
                  .limit(1);
                
                const existing = existingRecords && Array.isArray(existingRecords) && existingRecords.length > 0 
                  ? existingRecords[0] 
                  : null;
                
                if (existing && existing.id) {
                  downloadId = existing.id;
                  isUpdate = true;
                  const { error: updateErr } = await client
                    .from('sitf_downloads')
                    .update({ pdf_base64: emit.pdfBase64, file_url: url || null })
                    .eq('id', downloadId);
                  
                  if (updateErr) {
                    console.error('[Sitf] Erro ao atualizar após duplicata:', updateErr);
                } else {
                    console.log('[Sitf] Registro atualizado após detecção de duplicata');
                  }
                }
              } else {
                console.error('[Sitf] Erro ao inserir download no banco:', {
                  code: insertError.code,
                  message: insertError.message,
                  details: 'O PDF foi gerado com sucesso, mas não foi possível salvar no histórico. O usuário ainda pode visualizar o relatório.'
                });
                }
              } else {
                console.log('[Sitf] Download salvo com sucesso no banco (com base64)');
              }
          } catch (saveError: any) {
            console.error('[Sitf] Erro ao salvar download no banco:', {
              message: saveError?.message,
              details: 'O PDF foi gerado com sucesso, mas não foi possível salvar no histórico.'
            });
          }
        }
        
        // ✅ NOVA FUNCIONALIDADE: Extrair dados automaticamente após salvar/atualizar
        if (downloadId && emit.pdfBase64) {
          // Se já temos dados estruturados da API, salvar/atualizar diretamente
          if (structuredDataFromApi) {
            upsertExtractedSitfData(downloadId, clean, structuredDataFromApi).catch((saveError: any) => {
              console.error('[Sitf] Erro ao salvar/atualizar dados estruturados da API (não crítico):', {
                id: downloadId,
                cnpj: clean,
                error: saveError?.message,
              });
            });
          }
          
          // Extrair dados do PDF de forma assíncrona (não bloquear a resposta)
          extractDataAndSave(downloadId, emit.pdfBase64, clean, structuredDataFromApi).catch((extractError: any) => {
            console.error('[Sitf] Erro ao extrair dados do PDF (não crítico):', {
              id: downloadId,
              cnpj: clean,
              error: extractError?.message,
              details: 'O PDF foi salvo, mas a extração de dados falhou. Pode ser extraído manualmente depois via /extract/:id'
            });
          });
        }
        
        try {
          // Preservar expires_at se já existir, senão calcular novo (24h a partir de agora)
          let expiresAt = state.expires_at;
          if (!expiresAt) {
            const newExpiresAt = new Date();
            newExpiresAt.setHours(newExpiresAt.getHours() + 24);
            expiresAt = newExpiresAt.toISOString();
          }
          await upsertState({ 
            cnpj: clean, 
            status: 'pronto', 
            last_response: emit.raw, 
            file_url: url || null,
            expires_at: expiresAt, // Preservar ou definir expires_at
          });
        } catch (stateError: any) {
          console.error('[Sitf] Erro ao salvar estado no banco:', {
            message: stateError?.message,
            details: 'O PDF foi gerado com sucesso, mas não foi possível atualizar o estado.'
          });
          // Continuar mesmo com erro ao salvar estado
        }
        
        return { 
          type: 'ready-base64' as const, 
          base64: emit.pdfBase64, 
          url: url ?? undefined, 
          step: 'concluido' as const,
        };
      }
      // Tratar 202 (Accepted), 204 (No Content) ou 304 (Not Modified) - relatório ainda em processamento
      if (emit.status === 202 || emit.status === 204 || emit.status === 304) {
        const next = new Date(now + (emit.waitMs ?? 5000)).toISOString();
        // Garantir que last_response seja um JSON válido ou null
        const lastResponse = emit.raw && typeof emit.raw === 'object' ? emit.raw : (emit.raw ? { raw: emit.raw } : null);
        // Preservar expires_at se já existir
        const expiresAt = state.expires_at || null;
        await upsertState({ 
          cnpj: clean, 
          status: 'aguardando', 
          next_eligible_at: next, 
          last_response: lastResponse,
          expires_at: expiresAt, // Preservar expires_at
        });
        return { type: 'wait' as const, retryAfter: Math.ceil((emit.waitMs ?? 5000) / 1000), step: 'emitir' as const };
      }
      // Status não esperado - tratar como erro
      const mensagens = emit.raw?.mensagens || [];
      const errorMsg = mensagens[0]?.texto || `Status HTTP ${emit.status} retornado pela Receita Federal`;
      const mensagemClara = `Não foi possível emitir o relatório. ${errorMsg}`;
      
      console.error('[Sitf] Status não esperado ao emitir relatório:', {
        status: emit.status,
        mensagem: errorMsg,
        mensagemClara,
      });
      
      // Garantir que last_response seja um JSON válido ou null
      const lastResponse = emit.raw && typeof emit.raw === 'object' ? emit.raw : (emit.raw ? { raw: emit.raw } : null);
      
      try {
        await upsertState({ cnpj: clean, status: 'erro', last_response: lastResponse });
      } catch (saveError) {
        console.error('[Sitf] Erro ao salvar estado de erro no banco:', saveError);
        // Continuar mesmo com erro ao salvar
      }
      
      throw new SerproError(mensagemClara, emit.status, emit.raw);
      } catch (emitError: any) {
        // Verificar se o erro indica que o protocolo está inválido
        if (emitError instanceof SerproError && (emitError as any).isProtocolInvalid) {
          console.log('[Sitf] ⚠️ Protocolo inválido detectado, invalidando e solicitando novo protocolo...');
          
          // Invalidar o protocolo no banco de dados
          try {
            await upsertState({
              cnpj: clean,
              protocolo: null, // Remover protocolo inválido
              status: 'erro',
            });
            console.log('[Sitf] ✅ Protocolo inválido removido do banco de dados');
          } catch (invalidateError) {
            console.error('[Sitf] Erro ao invalidar protocolo:', invalidateError);
            // Continuar mesmo com erro ao invalidar
          }
          
          // Continuar para solicitar um novo protocolo
          console.log('[Sitf] Solicitando novo protocolo após detectar protocolo inválido...');
        } else {
          // Se não for erro de protocolo inválido, re-lançar o erro
          throw emitError;
        }
      }
    }

    // 4) Solicitar protocolo (primeira vez - ainda não temos protocolo OU protocolo foi invalidado)
    console.log('[Sitf] Solicitando protocolo pela primeira vez...');
    const req = await solicitarProtocolo(clean);
    console.log('[Sitf] Protocolo obtido com sucesso, waitMs:', req.waitMs);
    const next = new Date(now + req.waitMs).toISOString();
    
    // Calcular expires_at: protocolos geralmente expiram em 24 horas
    // Se houver informação na resposta da API, usar; senão, usar 24h como padrão
    const nowDate = new Date(now);
    const expiresAt = new Date(nowDate);
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 horas de validade padrão
    console.log('[Sitf] Calculando expires_at:', {
      now: nowDate.toISOString(),
      expiresAt: expiresAt.toISOString(),
      diffHours: (expiresAt.getTime() - nowDate.getTime()) / (1000 * 60 * 60),
    });
    
    try {
      await upsertState({
        cnpj: clean,
        protocolo: req.protocolo,
        status: 'aguardando',
        next_eligible_at: next,
        expires_at: expiresAt.toISOString(),
        last_response: req.raw,
      });
      console.log('[Sitf] Estado salvo com sucesso. Protocolo:', req.protocolo.substring(0, 50) + '...');
      console.log('[Sitf] Protocolo expira em:', expiresAt.toISOString());
    } catch (saveError: any) {
      console.error('[Sitf] Erro ao salvar estado após obter protocolo:', saveError);
      // Mesmo com erro ao salvar, retornar o resultado para que o frontend possa aguardar
      // O protocolo será solicitado novamente na próxima chamada, mas pelo menos não quebra o fluxo
    }
    
    return { type: 'wait' as const, retryAfter: Math.ceil(req.waitMs / 1000), step: 'protocolo' as const };
  }
}

export function base64ToBuffer(b64: string): Buffer {
  const clean = b64.includes(';base64,') ? b64.split(';base64,').pop()! : b64;
  return Buffer.from(clean, 'base64');
}

/**
 * Extrai dados estruturados do PDF a partir do base64
 * Usa o base64 diretamente, sem precisar salvar em arquivo
 */
export async function extractDataFromPdfBase64(base64Pdf: string): Promise<{
  text: string;
  numPages: number;
  info?: any;
  metadata?: any;
  debitos?: Array<{
    codigoReceita?: string;
    tipoReceita?: string;
    periodo?: string;
    dataVencimento?: string;
    valorOriginal?: number;
    saldoDevedor?: number;
    multa?: number;
    juros?: number;
    saldoDevedorConsolidado?: number;
    situacao?: string;
    tipo?: 'pendencia' | 'exigibilidade_suspensa'; // Tipo de débito
  }>;
  pendencias?: Array<{
    tipo?: string;
    descricao?: string;
    situacao?: string;
  }>;
  socios?: Array<{
    nome: string;
    cpf?: string;
    qual?: string;
    qualificacao?: string; // ✅ NOVO: Formato alternativo para compatibilidade
    situacao_cadastral?: string; // ✅ NOVO: Situação cadastral extraída do Python
    participacao_percentual?: number;
  }>; // ✅ NOVO: Sócios extraídos via Python
  cnpj?: string; // ✅ NOVO: CNPJ extraído do PDF via Python
}> {
  try {
    // Converter base64 diretamente para Buffer
    const buffer = base64ToBuffer(base64Pdf);
    
    let text = '';
    let info: any = {};
    let numPages = 0;
    let metadata: any = {};
    
    // Tentar usar pdf-parse diretamente (API padrão - mais comum)
    try {
      if (typeof pdfParse === 'function') {
        const result = await pdfParse(buffer);
        text = result?.text || '';
        info = result?.info || result || {};
        numPages = result?.numPages || result?.numpages || info?.numpages || info?.numPages || 0;
        metadata = result?.metadata || info?.metadata || {};
      } else {
        throw new Error('pdf-parse não é uma função');
      }
    } catch (parseError: any) {
      // Fallback: tentar API 2.x com classe PDFParse
      console.log('[Sitf Extract] Tentando API alternativa do pdf-parse...');
      try {
        const uint8Array = new Uint8Array(buffer);
        if (PDFParse) {
    const parser = new PDFParse(uint8Array);
    await parser.load();
          const textRaw = await parser.getText();
          const parserInfo = parser.getInfo() || {};
          
          // Garantir que text seja sempre uma string
          if (typeof textRaw === 'string') {
            text = textRaw;
          } else if (textRaw && typeof textRaw === 'object' && 'text' in textRaw) {
            text = String(textRaw.text || '');
          } else if (textRaw != null) {
            text = String(textRaw);
          }
          
          info = parserInfo;
          numPages = parserInfo.numpages || parserInfo.numPages || 0;
          metadata = parserInfo.metadata || {};
        } else {
          throw parseError;
        }
      } catch (fallbackError: any) {
        console.error('[Sitf Extract] Erro em ambas as APIs do pdf-parse:', fallbackError);
        throw new Error(`Falha ao extrair texto do PDF: ${fallbackError.message || parseError.message}`);
      }
    }
    
    // Garantir que text seja sempre uma string
    if (typeof text !== 'string') {
      text = String(text || '');
    }
    
    // Log para debug: verificar se texto foi extraído de todas as páginas
    console.log('[Sitf Extract] 📄 Texto extraído do PDF:', {
      totalCaracteres: text.length,
      numPages: numPages,
      primeiros500: text.substring(0, 500),
      ultimos500: text.substring(Math.max(0, text.length - 500)),
      contemCertidao: text.includes('Certidão'),
      contemPositiva: text.includes('Positiva'),
      contemNegativa: text.includes('Negativa'),
    });
    
    console.log('[Sitf Extract] Texto extraído:', {
      textLength: text.length,
      numPages,
      hasText: !!text,
      textType: typeof text,
      textPreview: text.length > 0 ? text.substring(0, 200) : '(vazio)',
    });
    
    // Validar que temos texto antes de processar
    if (!text || text.length === 0) {
      console.warn('[Sitf] PDF não contém texto extraível ou texto está vazio');
    }
    
    // Tentar extrair informações estruturadas do texto
    // (ajustar conforme o formato real do PDF da Receita Federal)
    const debitos = text ? extractDebitos(text) : [];
    const pendencias = text ? extractPendencias(text) : [];
    
    // ✅ NOVO: Usar Python (pdfplumber) para extrair sócios (mais robusto para tabelas)
    let sociosExtraidos: Array<{
      nome: string;
      cpf?: string;
      qual?: string;
      participacao_percentual?: number;
    }> | undefined = undefined;
    let cnpjExtraido: string | undefined = undefined;
    
    try {
      console.log('[Sitf Extract] 🐍 Tentando usar Python (pdfplumber) para extrair sócios do base64...');
      console.log('[Sitf Extract] Base64 recebido para Python:', {
        tamanho: base64Pdf.length,
        primeiros100: base64Pdf.substring(0, 100),
        ultimos100: base64Pdf.substring(Math.max(0, base64Pdf.length - 100)),
        temPrefix: base64Pdf.includes(';base64,'),
        temDataPrefix: base64Pdf.includes('data:'),
      });
      
      const pythonResult = await extrairSociosComPythonBase64(base64Pdf);
      
      if (pythonResult.success && pythonResult.socios && pythonResult.socios.length > 0) {
        sociosExtraidos = converterSociosPythonParaNode(pythonResult.socios);
        cnpjExtraido = pythonResult.cnpj;
        console.log(`[Sitf Extract] ✅ ${sociosExtraidos.length} sócios extraídos com Python (pdfplumber)`);
        if (cnpjExtraido) {
          console.log(`[Sitf Extract] ✅ CNPJ extraído do PDF via Python: ${cnpjExtraido}`);
        }
      } else {
        console.log('[Sitf Extract] ⚠️ Python não retornou sócios, continuando sem eles');
      }
    } catch (pythonError: any) {
      console.warn('[Sitf Extract] ⚠️ Erro ao usar Python para extrair sócios (continuando com extração Node.js):', pythonError.message);
      // Continuar sem sócios do Python se houver erro
      // A extração de sócios via Node.js continuará funcionando como fallback
    }
    
    console.log('[Sitf Extract] Dados extraídos:', {
      debitosCount: debitos.length,
      pendenciasCount: pendencias.length,
      sociosCount: sociosExtraidos?.length || 0,
      cnpjExtraido: cnpjExtraido || 'não extraído',
      debitosPreview: debitos.slice(0, 2),
      pendenciasPreview: pendencias.slice(0, 2),
      sociosPreview: sociosExtraidos?.slice(0, 2),
    });
    
    return {
      text,
      numPages,
      info,
      metadata,
      debitos,
      pendencias,
      socios: sociosExtraidos, // ✅ NOVO: Sócios extraídos via Python
      cnpj: cnpjExtraido, // ✅ NOVO: CNPJ extraído do PDF via Python
    };
  } catch (error: any) {
    console.error('[Sitf] Erro ao extrair dados do PDF:', error);
    throw new Error(`Falha ao extrair dados do PDF: ${error.message}`);
  }
}

/**
 * Extrai informações de débitos do texto do PDF
 * Extrai dados de AMBAS as seções:
 * 1. "Pendência - Débito (SIEF)" - com multa, juros e saldo consolidado
 * 2. "Débito com Exigibilidade Suspensa (SIEF)" - sem multa/juros
 */
function extractDebitos(text: string): Array<{
  codigoReceita?: string;
  tipoReceita?: string;
  periodo?: string;
  dataVencimento?: string;
  valorOriginal?: number;
  saldoDevedor?: number;
  multa?: number;
  juros?: number;
  saldoDevedorConsolidado?: number;
  situacao?: string;
  tipo?: 'pendencia' | 'exigibilidade_suspensa';
}> {
  const debitos: Array<{
    codigoReceita?: string;
    tipoReceita?: string;
    periodo?: string;
    dataVencimento?: string;
    valorOriginal?: number;
    saldoDevedor?: number;
    multa?: number;
    juros?: number;
    saldoDevedorConsolidado?: number;
    situacao?: string;
    tipo?: 'pendencia' | 'exigibilidade_suspensa';
  }> = [];
  
  // Validar entrada
  if (!text || typeof text !== 'string') {
    console.warn('[Sitf extractDebitos] Texto inválido ou vazio');
    return debitos;
  }
  
  // Log inicial para debug
  console.log('[Sitf extractDebitos] Iniciando extração de débitos:', {
    textLength: text.length,
    contemPendencia: text.includes('Pendência'),
    contemDebito: text.includes('Débito'),
    contemSIEF: text.includes('SIEF'),
    contemExigibilidade: text.includes('Exigibilidade'),
  });
  
  // ============================================
  // SEÇÃO 1: "Pendência - Débito (SIEF)"
  // Formato: Receita | PA/Exerc. | Dt. Vcto | Vl. Original | Sdo. Devedor | Multa | Juros | Sdo. Dev. Cons. | Situação
  // ============================================
  // Melhorar regex para capturar mesmo quando está em múltiplas páginas
  // Buscar o índice de início da seção - tentar múltiplas variações
  let secaoPendenciaIndex = text.search(/Pendência\s*-\s*Débito[^\n]*\(SIEF\)/i);
  if (secaoPendenciaIndex === -1) {
    // Tentar variação sem hífen
    secaoPendenciaIndex = text.search(/Pendência\s+Débito[^\n]*\(SIEF\)/i);
  }
  if (secaoPendenciaIndex === -1) {
    // Tentar variação com "Pendência" e "Débito" em linhas diferentes
    secaoPendenciaIndex = text.search(/Pendência[^\n]*Débito[^\n]*\(SIEF\)/i);
  }
  
  let secaoPendenciaTexto = '';
  
  if (secaoPendenciaIndex !== -1) {
    // Encontrar onde a seção termina - buscar por marcadores de fim de seção
    const marcadoresFim = [
      /Débito com Exigibilidade Suspensa[^\n]*\(SIEF\)/i,
      /Parcelamento com Exigibilidade Suspensa/i,
      /Inscrição com Exigibilidade Suspensa/i,
      /Diagnóstico Fiscal na (?:Receita Federal|Procuradoria)/i,
      /Final do Relatório/i,
    ];
    
    let fimIndex = text.length; // Por padrão, vai até o fim do texto
    
    // Encontrar o primeiro marcador de fim após o início da seção
    for (const marcador of marcadoresFim) {
      const matchFim = text.substring(secaoPendenciaIndex).match(marcador);
      if (matchFim && matchFim.index !== undefined) {
        const novoFim = secaoPendenciaIndex + matchFim.index;
        if (novoFim < fimIndex) {
          fimIndex = novoFim;
        }
      }
    }
    
    // Extrair o texto da seção (pular o cabeçalho)
    const inicioTexto = text.indexOf('\n', secaoPendenciaIndex) + 1;
    secaoPendenciaTexto = text.substring(inicioTexto, fimIndex);
    
    console.log('[Sitf extractDebitos] Seção "Pendência - Débito" encontrada:', {
      inicio: secaoPendenciaIndex,
      fim: fimIndex,
      tamanho: secaoPendenciaTexto.length,
      previewPrimeiros500: secaoPendenciaTexto.substring(0, 500),
      previewUltimos500: secaoPendenciaTexto.substring(Math.max(0, secaoPendenciaTexto.length - 500))
    });
  }
  
  if (secaoPendenciaTexto) {
    
    // Regex para capturar linhas da tabela de PENDÊNCIA (com multa, juros e saldo consolidado)
    // Formato: código-tipo (ex: 8109-02) + tipo (ex: PIS) + período + data + valor1 + valor2 + multa + juros + saldo_cons + situação
    // Exemplo: "8109-02 PIS 08/2025 25/09/2025 189,28 189,28 37,85 4,31 231,44 DEVEDOR"
    // Exemplo com trimestre: "2089-01 IRPJ 3° TRIM/2025 31/10/2025 3.755,60 3.755,60 347,01 37,55 4.140,16 DEVEDOR"
    const linhaPendenciaPattern = /(\d{4}-\d{2})\s+([A-Z\s-]+?)\s+(\d{1,2}\s*(?:°|º)?\s*(?:TRIM|TRIMESTRE)?\/\d{4}|\d{1,2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([A-Z\s-]+(?:\s+[A-Z\s-]+)*)/g;
  
  let match;
    let matchCount = 0;
    while ((match = linhaPendenciaPattern.exec(secaoPendenciaTexto)) !== null) {
      const codigoReceita = match[1].trim();
      const tipoReceita = match[2].trim();
      const periodo = match[3].trim().replace(/\s+/g, ' '); // Limpar espaços extras
      const dataVencimento = match[4].trim();
      const valorOriginalStr = match[5].trim().replace(/\./g, '').replace(',', '.');
      const saldoDevedorStr = match[6].trim().replace(/\./g, '').replace(',', '.');
      const multaStr = match[7].trim().replace(/\./g, '').replace(',', '.');
      const jurosStr = match[8].trim().replace(/\./g, '').replace(',', '.');
      const saldoConsolidadoStr = match[9].trim().replace(/\./g, '').replace(',', '.');
      const situacao = match[10].trim();
      
      // Ignorar linhas que parecem ser cabeçalhos (contêm palavras como "Receita", "PA", "Exerc", etc.)
      if (codigoReceita.includes('Receita') || tipoReceita.includes('Receita') || 
          periodo.includes('PA') || periodo.includes('Exerc') || 
          dataVencimento.includes('Vcto') || dataVencimento.includes('Dt')) {
        console.log('[Sitf extractDebitos] Ignorando linha que parece ser cabeçalho:', match[0].substring(0, 100));
        continue;
      }
    
    const valorOriginal = parseFloat(valorOriginalStr) || 0;
    const saldoDevedor = parseFloat(saldoDevedorStr) || 0;
      const multa = parseFloat(multaStr) || 0;
      const juros = parseFloat(jurosStr) || 0;
      const saldoDevedorConsolidado = parseFloat(saldoConsolidadoStr) || 0;
      
      // Validar que temos pelo menos um valor numérico válido
      if (valorOriginal === 0 && saldoDevedor === 0 && multa === 0 && juros === 0 && saldoDevedorConsolidado === 0) {
        console.log('[Sitf extractDebitos] Ignorando linha sem valores válidos:', match[0].substring(0, 100));
        continue;
      }
    
    debitos.push({
      codigoReceita,
      tipoReceita,
      periodo,
      dataVencimento,
      valorOriginal,
      saldoDevedor,
        multa,
        juros,
        saldoDevedorConsolidado,
      situacao,
        tipo: 'pendencia',
      });
      matchCount++;
    }
    
    console.log(`[Sitf extractDebitos] Processadas ${matchCount} linhas da seção "Pendência - Débito"`);
    
    console.log(`[Sitf extractDebitos] ✅ Extraídos ${debitos.length} débitos da seção "Pendência - Débito"`);
  } else {
    console.log('[Sitf extractDebitos] ⚠️ Seção "Pendência - Débito" não encontrada no texto');
    // Buscar qualquer ocorrência de "Pendência" ou "Débito" para debug
    const indicesPendencia = [];
    const indicesDebito = [];
    let searchIndex = 0;
    while ((searchIndex = text.indexOf('Pendência', searchIndex)) !== -1) {
      indicesPendencia.push(searchIndex);
      searchIndex += 1;
    }
    searchIndex = 0;
    while ((searchIndex = text.indexOf('Débito', searchIndex)) !== -1) {
      indicesDebito.push(searchIndex);
      searchIndex += 1;
    }
    console.log('[Sitf extractDebitos] Debug - Ocorrências encontradas:', {
      indicesPendencia: indicesPendencia.slice(0, 5),
      indicesDebito: indicesDebito.slice(0, 5),
      previewPendencia: indicesPendencia.length > 0 ? text.substring(indicesPendencia[0], indicesPendencia[0] + 200) : null,
      previewDebito: indicesDebito.length > 0 ? text.substring(indicesDebito[0], indicesDebito[0] + 200) : null,
    });
  }
  
  // ============================================
  // SEÇÃO 2: "Débito com Exigibilidade Suspensa (SIEF)"
  // Formato: Receita | PA/Exerc. | Dt. Vcto | Vl. Original | Sdo. Devedor | Situação
  // ============================================
  // Melhorar regex para capturar mesmo quando está em múltiplas páginas
  // Buscar o índice de início da seção - tentar múltiplas variações
  let secaoSuspensaIndex = text.search(/Débito com Exigibilidade Suspensa[^\n]*\(SIEF\)/i);
  if (secaoSuspensaIndex === -1) {
    // Tentar variação sem "com"
    secaoSuspensaIndex = text.search(/Débito\s+Exigibilidade\s+Suspensa[^\n]*\(SIEF\)/i);
  }
  if (secaoSuspensaIndex === -1) {
    // Tentar variação com "Exigibilidade Suspensa" separado
    secaoSuspensaIndex = text.search(/Exigibilidade\s+Suspensa[^\n]*\(SIEF\)/i);
  }
  let secaoSuspensaTexto = '';
  
  if (secaoSuspensaIndex !== -1) {
    // Encontrar onde a seção termina - buscar por marcadores de fim de seção
    const marcadoresFim = [
      /Pendência\s*-\s*Débito[^\n]*\(SIEF\)/i,
      /Parcelamento com Exigibilidade Suspensa/i,
      /Inscrição com Exigibilidade Suspensa/i,
      /Diagnóstico Fiscal na (?:Receita Federal|Procuradoria)/i,
      /Final do Relatório/i,
    ];
    
    let fimIndex = text.length; // Por padrão, vai até o fim do texto
    
    // Encontrar o primeiro marcador de fim após o início da seção
    for (const marcador of marcadoresFim) {
      const matchFim = text.substring(secaoSuspensaIndex).match(marcador);
      if (matchFim && matchFim.index !== undefined) {
        const novoFim = secaoSuspensaIndex + matchFim.index;
        if (novoFim < fimIndex) {
          fimIndex = novoFim;
        }
      }
    }
    
    // Extrair o texto da seção (pular o cabeçalho)
    const inicioTexto = text.indexOf('\n', secaoSuspensaIndex) + 1;
    secaoSuspensaTexto = text.substring(inicioTexto, fimIndex);
    
    console.log('[Sitf extractDebitos] Seção "Débito com Exigibilidade Suspensa" encontrada:', {
      inicio: secaoSuspensaIndex,
      fim: fimIndex,
      tamanho: secaoSuspensaTexto.length
    });
  }
  
  const secaoSuspensaMatch = secaoSuspensaTexto ? { 1: secaoSuspensaTexto } : null;
  if (secaoSuspensaMatch) {
    const secaoSuspensaTexto = secaoSuspensaMatch[1];
    console.log('[Sitf extractDebitos] Seção "Débito com Exigibilidade Suspensa" encontrada, tamanho:', secaoSuspensaTexto.length);
    console.log('[Sitf extractDebitos] Preview da seção (primeiros 500):', secaoSuspensaTexto.substring(0, 500));
    console.log('[Sitf extractDebitos] Preview da seção (últimos 500):', secaoSuspensaTexto.substring(Math.max(0, secaoSuspensaTexto.length - 500)));
    
    // Regex para capturar linhas da tabela de EXIGIBILIDADE SUSPENSA (sem multa/juros)
    // Formato: código-tipo + tipo + período + data + valor1 + valor2 + situação
    // Exemplo: "8109-02 PIS 10/2025 25/11/2025 471,04 471,04 A ANALISAR-A VENCER"
    const linhaSuspensaPattern = /(\d{4}-\d{2})\s+([A-Z\s-]+?)\s+(\d{1,2}\s*(?:°|º)?\s*(?:TRIM|TRIMESTRE)?\/\d{4}|\d{1,2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)\s+([\d.,]+)\s+([A-Z\s-]+(?:\s+[A-Z\s-]+)*)/g;
    
    let match;
    let matchCount = 0;
    while ((match = linhaSuspensaPattern.exec(secaoSuspensaTexto)) !== null) {
      const codigoReceita = match[1].trim();
      const tipoReceita = match[2].trim();
      const periodo = match[3].trim();
      const dataVencimento = match[4].trim();
      const valorOriginalStr = match[5].trim().replace(/\./g, '').replace(',', '.');
      const saldoDevedorStr = match[6].trim().replace(/\./g, '').replace(',', '.');
      const situacao = match[7].trim();
      
      // Ignorar linhas que parecem ser cabeçalhos
      if (codigoReceita.includes('Receita') || tipoReceita.includes('Receita') || 
          periodo.includes('PA') || periodo.includes('Exerc') || 
          dataVencimento.includes('Vcto') || dataVencimento.includes('Dt')) {
        console.log('[Sitf extractDebitos] Ignorando linha que parece ser cabeçalho:', match[0].substring(0, 100));
        continue;
      }
      
      const valorOriginal = parseFloat(valorOriginalStr) || 0;
      const saldoDevedor = parseFloat(saldoDevedorStr) || 0;
      
      // Validar que temos pelo menos um valor numérico válido
      if (valorOriginal === 0 && saldoDevedor === 0) {
        console.log('[Sitf extractDebitos] Ignorando linha sem valores válidos:', match[0].substring(0, 100));
        continue;
      }
      
      debitos.push({
        codigoReceita,
        tipoReceita,
        periodo,
        dataVencimento,
        valorOriginal,
        saldoDevedor,
        multa: 0,
        juros: 0,
        saldoDevedorConsolidado: saldoDevedor, // Usar saldo devedor como consolidado quando não há multa/juros
        situacao,
        tipo: 'exigibilidade_suspensa',
      });
      matchCount++;
    }
    
    console.log(`[Sitf extractDebitos] Processadas ${matchCount} linhas da seção "Débito com Exigibilidade Suspensa"`);
    
    console.log(`[Sitf extractDebitos] ✅ Extraídos ${debitos.length - debitos.filter(d => d.tipo === 'pendencia').length} débitos da seção "Débito com Exigibilidade Suspensa"`);
  } else {
    console.log('[Sitf extractDebitos] ⚠️ Seção "Débito com Exigibilidade Suspensa" não encontrada no texto');
  }
  
  // ============================================
  // SEÇÃO 3: "Diagnóstico Fiscal na Procuradoria-Geral da Fazenda Nacional"
  // Buscar débitos após esta seção quando há "Exigibilidade Suspensa"
  // ============================================
  const secaoProcuradoriaIndex = text.search(/Diagnóstico Fiscal na Procuradoria-Geral da Fazenda Nacional/i);
  
  if (secaoProcuradoriaIndex !== -1) {
    console.log('[Sitf extractDebitos] 🔍 Seção "Diagnóstico Fiscal na Procuradoria" encontrada na posição:', secaoProcuradoriaIndex);
    
    // Buscar por "Exigibilidade Suspensa" após o diagnóstico
    const textoAposDiagnostico = text.substring(secaoProcuradoriaIndex);
    
    // Procurar por diferentes variações de "Exigibilidade Suspensa"
    const variacoesExigibilidade = [
      /Inscrição com Exigibilidade Suspensa[^\n]*\(SIDA\)/i,
      /Parcelamento com Exigibilidade Suspensa[^\n]*\(SISPAR\)/i,
      /Exigibilidade\s+Suspensa/i,
    ];
    
    let exigibilidadeIndex = -1;
    let variacaoEncontrada = '';
    
    for (const variacao of variacoesExigibilidade) {
      const match = textoAposDiagnostico.match(variacao);
      if (match && match.index !== undefined) {
        exigibilidadeIndex = match.index;
        variacaoEncontrada = match[0];
        break;
      }
    }
    
    if (exigibilidadeIndex !== -1) {
      console.log('[Sitf extractDebitos] ✅ "Exigibilidade Suspensa" encontrada após diagnóstico:', variacaoEncontrada);
      
      // Encontrar onde começa a seção de débitos (após o título da seção)
      const inicioSecao = secaoProcuradoriaIndex + exigibilidadeIndex;
      const textoSecao = text.substring(inicioSecao);
      
      // Buscar marcadores de fim de seção
      const marcadoresFim = [
        /Diagnóstico Fiscal na Receita Federal/i,
        /Final do Relatório/i,
        /Página:\s*\d+\s*\/\s*\d+/i,
        /Não foram detectadas pendências/i,
      ];
      
      let fimSecao = text.length;
      for (const marcador of marcadoresFim) {
        const matchFim = textoSecao.match(marcador);
        if (matchFim && matchFim.index !== undefined) {
          const novoFim = inicioSecao + matchFim.index;
          if (novoFim < fimSecao && novoFim > inicioSecao) {
            fimSecao = novoFim;
          }
        }
      }
      
      const secaoTexto = text.substring(inicioSecao, fimSecao);
      console.log('[Sitf extractDebitos] 📄 Seção de Exigibilidade Suspensa (Procuradoria):', {
        inicio: inicioSecao,
        fim: fimSecao,
        tamanho: secaoTexto.length,
        preview: secaoTexto.substring(0, 500),
      });
      
      // Extrair débitos desta seção usando busca global na seção específica
      const chavesExistentes = new Set(debitos.map(d => 
        `${d.codigoReceita || ''}-${d.periodo || ''}-${d.dataVencimento || ''}`
      ));
      
      // Padrão completo (com multa/juros) - 10 campos
      const padraoCompleto = /(\d{4}-\d{2})\s+([A-Z\s-]+?)\s+(\d{1,2}\s*(?:°|º)?\s*(?:TRIM|TRIMESTRE)?\/\d{4}|\d{1,2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([A-Z\s-]+(?:\s+[A-Z\s-]+)*)/g;
      
      let match;
      let matchCount = 0;
      while ((match = padraoCompleto.exec(secaoTexto)) !== null) {
        const codigoReceita = match[1].trim();
        const tipoReceita = match[2].trim();
        const periodo = match[3].trim().replace(/\s+/g, ' ');
        const dataVencimento = match[4].trim();
        
        // Validar que não é cabeçalho
        if (codigoReceita.includes('Receita') || tipoReceita.includes('Receita') || 
            periodo.includes('PA') || periodo.includes('Exerc') || 
            dataVencimento.includes('Vcto') || dataVencimento.includes('Dt') ||
            codigoReceita.includes('Inscrição') || codigoReceita.includes('Conta')) {
          continue;
        }
        
        // Verificar se já existe
        const chave = `${codigoReceita}-${periodo}-${dataVencimento}`;
        if (chavesExistentes.has(chave)) {
          continue;
        }
        chavesExistentes.add(chave);
        
        const valorOriginalStr = match[5].trim().replace(/\./g, '').replace(',', '.');
        const saldoDevedorStr = match[6].trim().replace(/\./g, '').replace(',', '.');
        const multaStr = match[7].trim().replace(/\./g, '').replace(',', '.');
        const jurosStr = match[8].trim().replace(/\./g, '').replace(',', '.');
        const saldoConsolidadoStr = match[9].trim().replace(/\./g, '').replace(',', '.');
        const situacao = match[10].trim();
        
        const valorOriginal = parseFloat(valorOriginalStr) || 0;
        const saldoDevedor = parseFloat(saldoDevedorStr) || 0;
        const multa = parseFloat(multaStr) || 0;
        const juros = parseFloat(jurosStr) || 0;
        const saldoDevedorConsolidado = parseFloat(saldoConsolidadoStr) || 0;
        
        // Validar valores
        if (valorOriginal === 0 && saldoDevedor === 0 && multa === 0 && juros === 0 && saldoDevedorConsolidado === 0) {
          continue;
        }
        
        debitos.push({
          codigoReceita,
          tipoReceita,
          periodo,
          dataVencimento,
          valorOriginal,
          saldoDevedor,
          multa,
          juros,
          saldoDevedorConsolidado,
          situacao,
          tipo: 'exigibilidade_suspensa',
        });
        matchCount++;
      }
      
      // Se não encontrou com padrão completo, tentar padrão simplificado (sem multa/juros)
      if (matchCount === 0) {
        console.log('[Sitf extractDebitos] Tentando padrão simplificado (sem multa/juros)...');
        const padraoSimplificado = /(\d{4}-\d{2})\s+([A-Z\s-]+?)\s+(\d{1,2}\s*(?:°|º)?\s*(?:TRIM|TRIMESTRE)?\/\d{4}|\d{1,2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)\s+([\d.,]+)\s+([A-Z\s-]+(?:\s+[A-Z\s-]+)*)/g;
        
        while ((match = padraoSimplificado.exec(secaoTexto)) !== null) {
          const codigoReceita = match[1].trim();
          const tipoReceita = match[2].trim();
          const periodo = match[3].trim().replace(/\s+/g, ' ');
          const dataVencimento = match[4].trim();
          
          // Validar que não é cabeçalho
          if (codigoReceita.includes('Receita') || tipoReceita.includes('Receita') || 
              periodo.includes('PA') || periodo.includes('Exerc') || 
              dataVencimento.includes('Vcto') || dataVencimento.includes('Dt') ||
              codigoReceita.includes('Inscrição') || codigoReceita.includes('Conta')) {
            continue;
          }
          
          // Verificar se já existe
          const chave = `${codigoReceita}-${periodo}-${dataVencimento}`;
          if (chavesExistentes.has(chave)) {
            continue;
          }
          chavesExistentes.add(chave);
          
          const valorOriginalStr = match[5].trim().replace(/\./g, '').replace(',', '.');
          const saldoDevedorStr = match[6].trim().replace(/\./g, '').replace(',', '.');
          const situacao = match[7].trim();
          
          const valorOriginal = parseFloat(valorOriginalStr) || 0;
          const saldoDevedor = parseFloat(saldoDevedorStr) || 0;
          
          if (valorOriginal === 0 && saldoDevedor === 0) {
            continue;
          }
          
          debitos.push({
            codigoReceita,
            tipoReceita,
            periodo,
            dataVencimento,
            valorOriginal,
            saldoDevedor,
            multa: 0,
            juros: 0,
            saldoDevedorConsolidado: saldoDevedor,
            situacao,
            tipo: 'exigibilidade_suspensa',
          });
          matchCount++;
        }
      }
      
      console.log(`[Sitf extractDebitos] ✅ Extraídos ${matchCount} débitos da seção "Diagnóstico Fiscal na Procuradoria"`);
    } else {
      console.log('[Sitf extractDebitos] ⚠️ "Exigibilidade Suspensa" não encontrada após diagnóstico da Procuradoria');
    }
  } else {
    console.log('[Sitf extractDebitos] ℹ️ Seção "Diagnóstico Fiscal na Procuradoria" não encontrada');
  }
  
  // ============================================
  // ESTRATÉGIA COMPLEMENTAR: Busca global em TODO o texto
  // Aplicar apenas se não encontrou seções OU encontrou poucos débitos
  // ============================================
  const debitosPorBuscaGlobal: typeof debitos = [];
  const precisaBuscaGlobal = debitos.length === 0 || debitos.length < 3;
  
  if (precisaBuscaGlobal) {
    console.log('[Sitf extractDebitos] 🔍 Fazendo busca global complementar em TODO o texto...');
    
    // Criar Set para evitar duplicatas (usando chave única: codigo-periodo-data)
    const chavesExistentes = new Set(debitos.map(d => 
      `${d.codigoReceita || ''}-${d.periodo || ''}-${d.dataVencimento || ''}`
    ));
    
    // Padrão 1: Débitos com multa/juros (formato completo - 10 campos)
    const padraoCompleto = /(\d{4}-\d{2})\s+([A-Z\s-]+?)\s+(\d{1,2}\s*(?:°|º)?\s*(?:TRIM|TRIMESTRE)?\/\d{4}|\d{1,2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([A-Z\s-]+(?:\s+[A-Z\s-]+)*)/g;
    
    let match;
    while ((match = padraoCompleto.exec(text)) !== null) {
      const codigoReceita = match[1].trim();
      const tipoReceita = match[2].trim();
      const periodo = match[3].trim().replace(/\s+/g, ' ');
      const dataVencimento = match[4].trim();
      
      // Validar que não é cabeçalho
      if (codigoReceita.includes('Receita') || tipoReceita.includes('Receita') || 
          periodo.includes('PA') || periodo.includes('Exerc') || 
          dataVencimento.includes('Vcto') || dataVencimento.includes('Dt')) {
        continue;
      }
      
      // Verificar se já existe (evitar duplicatas)
      const chave = `${codigoReceita}-${periodo}-${dataVencimento}`;
      if (chavesExistentes.has(chave)) {
        continue;
      }
      chavesExistentes.add(chave);
      
      const valorOriginalStr = match[5].trim().replace(/\./g, '').replace(',', '.');
      const saldoDevedorStr = match[6].trim().replace(/\./g, '').replace(',', '.');
      const multaStr = match[7].trim().replace(/\./g, '').replace(',', '.');
      const jurosStr = match[8].trim().replace(/\./g, '').replace(',', '.');
      const saldoConsolidadoStr = match[9].trim().replace(/\./g, '').replace(',', '.');
      const situacao = match[10].trim();
      
      const valorOriginal = parseFloat(valorOriginalStr) || 0;
      const saldoDevedor = parseFloat(saldoDevedorStr) || 0;
      const multa = parseFloat(multaStr) || 0;
      const juros = parseFloat(jurosStr) || 0;
      const saldoDevedorConsolidado = parseFloat(saldoConsolidadoStr) || 0;
      
      // Validar valores
      if (valorOriginal === 0 && saldoDevedor === 0 && multa === 0 && juros === 0 && saldoDevedorConsolidado === 0) {
        continue;
      }
      
      debitosPorBuscaGlobal.push({
        codigoReceita,
        tipoReceita,
        periodo,
        dataVencimento,
        valorOriginal,
        saldoDevedor,
        multa,
        juros,
        saldoDevedorConsolidado,
        situacao,
        tipo: 'pendencia',
      });
    }
    
    // Padrão 2: Débitos sem multa/juros (formato simplificado - 7 campos)
    // Aplicar apenas se não encontrou com padrão completo
    if (debitosPorBuscaGlobal.length === 0) {
      const padraoSimplificado = /(\d{4}-\d{2})\s+([A-Z\s-]+?)\s+(\d{1,2}\s*(?:°|º)?\s*(?:TRIM|TRIMESTRE)?\/\d{4}|\d{1,2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)\s+([\d.,]+)\s+([A-Z\s-]+(?:\s+[A-Z\s-]+)*)/g;
      
      while ((match = padraoSimplificado.exec(text)) !== null) {
        const codigoReceita = match[1].trim();
        const tipoReceita = match[2].trim();
        const periodo = match[3].trim().replace(/\s+/g, ' ');
        const dataVencimento = match[4].trim();
        
        // Validar que não é cabeçalho
        if (codigoReceita.includes('Receita') || tipoReceita.includes('Receita') || 
            periodo.includes('PA') || periodo.includes('Exerc') || 
            dataVencimento.includes('Vcto') || dataVencimento.includes('Dt')) {
          continue;
        }
        
        // Verificar se já existe
        const chave = `${codigoReceita}-${periodo}-${dataVencimento}`;
        if (chavesExistentes.has(chave)) {
          continue;
        }
        chavesExistentes.add(chave);
        
        const valorOriginalStr = match[5].trim().replace(/\./g, '').replace(',', '.');
        const saldoDevedorStr = match[6].trim().replace(/\./g, '').replace(',', '.');
        const situacao = match[7].trim();
        
        const valorOriginal = parseFloat(valorOriginalStr) || 0;
        const saldoDevedor = parseFloat(saldoDevedorStr) || 0;
        
        if (valorOriginal === 0 && saldoDevedor === 0) {
          continue;
        }
        
        debitosPorBuscaGlobal.push({
          codigoReceita,
          tipoReceita,
          periodo,
          dataVencimento,
          valorOriginal,
          saldoDevedor,
          multa: 0,
          juros: 0,
          saldoDevedorConsolidado: saldoDevedor,
          situacao,
          tipo: 'exigibilidade_suspensa',
        });
      }
    }
    
    // Adicionar débitos encontrados na busca global ao array principal
    if (debitosPorBuscaGlobal.length > 0) {
      console.log(`[Sitf extractDebitos] ✅ Busca global encontrou ${debitosPorBuscaGlobal.length} débitos adicionais`);
      debitos.push(...debitosPorBuscaGlobal);
    } else {
      console.log('[Sitf extractDebitos] ⚠️ Busca global não encontrou débitos adicionais');
    }
  } else {
    console.log('[Sitf extractDebitos] ℹ️ Busca global não necessária (já encontrou débitos suficientes por seções)');
  }
  
  console.log(`[Sitf extractDebitos] 📊 RESUMO: Total de ${debitos.length} débitos extraídos (${debitos.filter(d => d.tipo === 'pendencia').length} pendências + ${debitos.filter(d => d.tipo === 'exigibilidade_suspensa').length} exigibilidade suspensa)`);
  
  return debitos;
}

/**
 * Extrai informações de pendências do texto do PDF
 * Extrai mensagens de diagnóstico fiscal
 */
function extractPendencias(text: string): Array<{
  tipo?: string;
  descricao?: string;
  situacao?: string;
}> {
  const pendencias: Array<{
    tipo?: string;
    descricao?: string;
    situacao?: string;
  }> = [];
  
  // Procurar por mensagens de diagnóstico
  // Exemplo: "Não foram detectadas pendências/exigibilidades suspensas..."
  const diagnosticoPattern = /Diagnóstico Fiscal[^\n]*\n([^\n]+(?:\n[^\n]+)*?)(?=Final do Relatório|$)/gi;
  let match;
  
  while ((match = diagnosticoPattern.exec(text)) !== null) {
    const diagnosticoTexto = match[1].trim();
    if (diagnosticoTexto && diagnosticoTexto.length > 10) {
      pendencias.push({
        tipo: 'Diagnóstico Fiscal',
        descricao: diagnosticoTexto,
        situacao: diagnosticoTexto.includes('Não foram detectadas') ? 'SEM PENDÊNCIAS' : 'COM PENDÊNCIAS',
      });
    }
  }
  
  return pendencias;
}

/**
 * Extrai dados estruturados do PDF e salva no banco de forma assíncrona
 * Não bloqueia a resposta ao usuário
 * @param structuredDataFromApi - Dados estruturados já obtidos da API (opcional)
 */
async function extractDataAndSave(
  downloadId: string, 
  pdfBase64: string, 
  cnpj: string,
  structuredDataFromApi?: SitfExtractedData | null
): Promise<void> {
  try {
    console.log('[Sitf Extract] Iniciando extração automática para ID:', downloadId);
    
    // Buscar sócios existentes do cliente para fazer matching por nome
    let sociosExistentes: Array<{ nome: string; cpf?: string | null }> = [];
    try {
      const { Cliente } = await import('../models/Cliente');
      const clienteModel = new Cliente();
      
      // Buscar cliente por CNPJ
      const clienteResult = await clienteModel.findByCNPJ(cnpj);
      if (clienteResult.success && clienteResult.data) {
        const cliente = clienteResult.data as any;
        const sociosResult = await clienteModel.listarSocios(cliente.id);
        if (sociosResult.success && sociosResult.data) {
          sociosExistentes = sociosResult.data.map((s: any) => ({
            nome: s.nome || '',
            cpf: s.cpf || null,
          }));
          console.log(`[Sitf Extract] ✅ ${sociosExistentes.length} sócios existentes encontrados para matching`);
        }
      }
    } catch (sociosError: any) {
      console.warn('[Sitf Extract] ⚠️ Erro ao buscar sócios existentes (não crítico):', sociosError?.message);
    }
    
    // Extrair texto e dados básicos do PDF
    const extractedData = await extractDataFromPdfBase64(pdfBase64);
    
    console.log('[Sitf Extract] Dados básicos extraídos:', {
      id: downloadId,
      cnpj,
      textLength: extractedData.text?.length || 0,
      numPages: extractedData.numPages || 0,
      hasDebitos: extractedData.debitos && extractedData.debitos.length > 0,
      hasPendencias: extractedData.pendencias && extractedData.pendencias.length > 0,
      hasSociosPython: extractedData.socios && extractedData.socios.length > 0,
      cnpjExtraidoPython: extractedData.cnpj || 'não extraído',
      debitosCount: extractedData.debitos?.length || 0,
      pendenciasCount: extractedData.pendencias?.length || 0,
      sociosPythonCount: extractedData.socios?.length || 0,
      textPreview: extractedData.text?.substring(0, 200) || 'N/A',
    });
    
    // ✅ NOVO: Se Python extraiu sócios, usá-los diretamente (mais preciso)
    let structuredData = structuredDataFromApi;
    if (!structuredData) {
      // Tentar extrair dados estruturados do texto do PDF
      structuredData = extractStructuredDataFromText(extractedData.text, cnpj, sociosExistentes);
    }
    
    // ✅ Se Python extraiu sócios, usar eles diretamente (mais robusto)
    if (extractedData.socios && extractedData.socios.length > 0) {
      console.log('[Sitf Extract] ✅ Usando sócios extraídos via Python (pdfplumber) - mais preciso');
      if (!structuredData) {
        structuredData = {};
      }
      // Converter sócios do Python para formato SitfExtractedData
      // ✅ Suporte para formato Python (qual) ou formato Node.js (qualificacao)
      // ✅ NOVO: Filtrar sócios que contenham "Qualif. Resp." antes de converter
      const sociosFiltrados = extractedData.socios.filter(s => {
        const nome = (s.nome || '').toUpperCase();
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
      
      structuredData.socios = sociosFiltrados.map(s => ({
        cpf: s.cpf || undefined,
        nome: s.nome || '',
        qualificacao: s.qual || s.qualificacao || undefined, // Suporte para ambos os formatos
        situacao_cadastral: s.situacao_cadastral || 'ATIVA', // ✅ Usar do Python se disponível, senão default
        participacao_percentual: s.participacao_percentual || undefined,
      }));
      console.log(`[Sitf Extract] ✅ ${structuredData.socios.length} sócios do Python incluídos nos dados estruturados`);
    }
    
    if (structuredData) {
      // Salvar ou atualizar dados estruturados na tabela sitf_extracted_data
      await upsertExtractedSitfData(downloadId, cnpj, structuredData);
      console.log('[Sitf Extract] ✅ Dados estruturados salvos/atualizados na tabela sitf_extracted_data');
    } else {
      console.warn('[Sitf Extract] ⚠️ Não foi possível extrair dados estruturados do PDF');
    }
    
    // Salvar dados extraídos (texto, débitos, pendências, sócios) no campo extracted_data do sitf_downloads
    // Garantir que débitos, pendências e sócios estão incluídos
    const extractedDataToSave = {
      ...extractedData,
      debitos: extractedData.debitos || [],
      pendencias: extractedData.pendencias || [],
      socios: extractedData.socios || undefined, // ✅ NOVO: Incluir sócios extraídos via Python
      cnpj: extractedData.cnpj || undefined, // ✅ NOVO: Incluir CNPJ extraído via Python
    };
    
    console.log('[Sitf Extract] Salvando dados extraídos:', {
      id: downloadId,
      debitosCount: extractedDataToSave.debitos?.length || 0,
      pendenciasCount: extractedDataToSave.pendencias?.length || 0,
      sociosCount: extractedDataToSave.socios?.length || 0,
      cnpjExtraido: extractedDataToSave.cnpj || 'não extraído',
      debitosPreview: extractedDataToSave.debitos?.slice(0, 2),
      sociosPreview: extractedDataToSave.socios?.slice(0, 2),
    });
    
    const client = supabaseAdmin || supabase;
    const { error: updateError } = await client
      .from('sitf_downloads')
      .update({ extracted_data: extractedDataToSave })
      .eq('id', downloadId);
    
    if (updateError) {
      console.error('[Sitf Extract] Erro ao salvar dados extraídos no sitf_downloads:', updateError);
      throw updateError;
    } else {
      console.log('[Sitf Extract] ✅ Dados salvos no banco com sucesso para ID:', downloadId, {
        debitosCount: extractedDataToSave.debitos?.length || 0,
        pendenciasCount: extractedDataToSave.pendencias?.length || 0,
        sociosCount: extractedDataToSave.socios?.length || 0,
        cnpjExtraido: extractedDataToSave.cnpj || 'não extraído',
      });
    }
  } catch (error: any) {
    // Log do erro mas não propagar (não é crítico)
    console.error('[Sitf Extract] Erro na extração automática:', {
      id: downloadId,
      cnpj,
      error: error?.message,
      stack: error?.stack,
    });
    throw error; // Re-throw para que o .catch() no chamador possa logar
  }
}

/**
 * Extrai dados estruturados do texto do PDF
 * Tenta encontrar JSON embutido ou extrair informações do texto
 */
function extractStructuredDataFromText(
  text: string, 
  cnpj: string,
  sociosExistentes: Array<{ nome: string; cpf?: string | null }> = []
): SitfExtractedData | null {
  try {
    if (!text || typeof text !== 'string' || text.length < 100) {
      console.warn('[Sitf Extract] Texto muito curto ou inválido para extração estruturada');
      return null;
    }
    
    // Primeiro, tentar encontrar JSON embutido no texto
    // O JSON pode estar em diferentes formatos no PDF
    // Vamos usar uma abordagem mais robusta: encontrar blocos JSON completos
    const jsonPatterns = [
      // JSON completo com todas as chaves principais
      /\{[\s\S]*?"fonte"[\s\S]*?"certidao_conjunta_rfb_pgfn"[\s\S]*?\}/,
      // JSON com empresa e certidão
      /\{[\s\S]*?"empresa"[\s\S]*?"certidao_conjunta_rfb_pgfn"[\s\S]*?\}/,
      // JSON com empresa
      /\{[\s\S]*?"empresa"[\s\S]*?"cnpj"[\s\S]*?\}/,
      // JSON com fonte
      /\{[\s\S]*?"fonte"[\s\S]*?\}/,
      // Qualquer objeto JSON grande (mais de 200 caracteres)
      /\{[^{}]{200,}\}/,
    ];
    
    for (const pattern of jsonPatterns) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        // Tentar cada match encontrado
        for (const match of matches) {
          try {
            // Limpar o match (remover quebras de linha extras, espaços)
            const cleaned = match.trim().replace(/\s+/g, ' ');
            
            // Tentar parsear
            const parsed = JSON.parse(cleaned);
            
            // Validar que é um objeto com pelo menos uma propriedade esperada
            if (parsed && typeof parsed === 'object' && 
                (parsed.fonte || parsed.empresa || parsed.certidao_conjunta_rfb_pgfn)) {
              console.log('[Sitf Extract] ✅ JSON encontrado e parseado do PDF:', {
                hasFonte: !!parsed.fonte,
                hasEmpresa: !!parsed.empresa,
                hasCertidao: !!parsed.certidao_conjunta_rfb_pgfn,
              });
              return parsed as SitfExtractedData;
            }
          } catch (parseError) {
            // Continuar tentando outros matches ou padrões
            continue;
          }
        }
      }
    }
    
    // Tentar encontrar JSON em múltiplas linhas (formato mais comum em PDFs)
    // Buscar por blocos que começam com { e terminam com }
    const multilineJsonPattern = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/s;
    const multilineMatches = text.match(multilineJsonPattern);
    if (multilineMatches) {
      for (const match of multilineMatches) {
        // Pular matches muito pequenos (provavelmente não são o JSON completo)
        if (match.length < 100) continue;
        
        try {
          const parsed = JSON.parse(match);
          if (parsed && typeof parsed === 'object' && 
              (parsed.fonte || parsed.empresa || parsed.certidao_conjunta_rfb_pgfn)) {
            console.log('[Sitf Extract] ✅ JSON multilinha encontrado e parseado do PDF');
            return parsed as SitfExtractedData;
          }
        } catch (parseError) {
          // Continuar tentando
          continue;
        }
      }
    }
    
    // Se não encontrou JSON, tentar extrair do texto formatado
    console.log('[Sitf Extract] JSON não encontrado no texto do PDF, tentando extrair do texto formatado');
    console.log('[Sitf Extract] Texto do PDF (primeiros 500 caracteres):', text.substring(0, 500));
    console.log('[Sitf Extract] Texto do PDF (últimos 500 caracteres):', text.substring(Math.max(0, text.length - 500)));
    
    const data: SitfExtractedData = {};
    
    // Extrair fonte
    const fonteMatch = text.match(/Integra Contador[^\n]*/i);
    if (fonteMatch) {
      data.fonte = fonteMatch[0].trim();
    }
    
    // Extrair data de emissão (formato ISO ou brasileiro)
    const emissaoMatch = text.match(/(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}[-\+]\d{2}:\d{2})/);
    if (emissaoMatch) {
      data.emissao_relatorio = emissaoMatch[1];
    }
    
    // Extrair CNPJ do solicitante
    const solicitanteMatch = text.match(/Solicitante[^\n]*CNPJ[^\n]*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i);
    if (solicitanteMatch) {
      data.solicitante = { cnpj: solicitanteMatch[1] };
    }
    
    // Extrair razão social da empresa
    const razaoMatch = text.match(/Razão Social[^\n]*:?\s*([A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ][A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ\s&\.]+(?:LTDA|EIRELI|ME|EPP|SA|S\/A|S\.A\.)?)/i);
    if (razaoMatch) {
      if (!data.empresa) data.empresa = {};
      data.empresa.razao_social = razaoMatch[1].trim();
    }
    
    // Extrair CNPJ da empresa
    const cnpjMatch = text.match(/CNPJ[^\n]*:?\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i);
    if (cnpjMatch) {
      if (!data.empresa) data.empresa = {};
      data.empresa.cnpj = cnpjMatch[1];
      const cnpjLimpo = cnpjMatch[1].replace(/\D/g, '');
      data.empresa.cnpj_raiz = cnpjLimpo.substring(0, 8);
    }
    
    // Extrair situação cadastral
    const situacaoMatch = text.match(/Situação Cadastral[^\n]*:?\s*([A-Z]+)/i);
    if (situacaoMatch) {
      if (!data.empresa) data.empresa = {};
      data.empresa.situacao_cadastral = situacaoMatch[1].trim();
    }
    
    // Extrair porte
    const porteMatch = text.match(/Porte[^\n]*:?\s*([^\n]+)/i);
    if (porteMatch) {
      if (!data.empresa) data.empresa = {};
      data.empresa.porte = porteMatch[1].trim();
    }
    
    // Extrair data de abertura
    const dataAberturaMatch = text.match(/Data de Abertura[^\n]*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (dataAberturaMatch) {
      if (!data.empresa) data.empresa = {};
      data.empresa.data_abertura = dataAberturaMatch[1];
    }
    
    // Extrair Natureza Jurídica (formato: "Código - Descrição" ou apenas código)
    const naturezaMatch = text.match(/Natureza Jurídica[^\n]*:?\s*(?:(\d+)\s*-\s*)?([A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ\s]+?)(?:\n|$)/i);
    if (naturezaMatch) {
      if (!data.empresa) data.empresa = {};
      data.empresa.natureza_juridica = {
        codigo: naturezaMatch[1]?.trim() || undefined,
        descricao: naturezaMatch[2]?.trim() || undefined,
      };
    }
    
    // Extrair CNAE Principal (formato: "Código - Descrição")
    const cnaeMatch = text.match(/CNAE[^\n]*Principal[^\n]*:?\s*(\d{4}-\d{1}\/\d{2})\s*-\s*([^\n]+)/i);
    if (cnaeMatch) {
      if (!data.empresa) data.empresa = {};
      data.empresa.cnae_principal = {
        codigo: cnaeMatch[1].trim(),
        descricao: cnaeMatch[2].trim(),
      };
    }
    
    // Extrair Responsável (CPF e Nome)
    const responsavelMatch = text.match(/Responsável[^\n]*:?\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\s*-\s*([A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ\s]+?)(?:\n|$)/i);
    if (responsavelMatch) {
      data.responsavel = {
        cpf: responsavelMatch[1].trim(),
        nome: responsavelMatch[2].trim(),
      };
    }
    
    // Extrair Domicílio Fiscal
    const domicilioUnidadeMatch = text.match(/UA de Domicílio[^\n]*:?\s*([^\n]+)/i);
    const domicilioCodigoMatch = text.match(/Código[^\n]*Domicílio[^\n]*:?\s*([A-Z0-9-]+)/i);
    if (domicilioUnidadeMatch || domicilioCodigoMatch) {
      data.domicilio_fiscal = {
        unidade: domicilioUnidadeMatch?.[1]?.trim() || undefined,
        codigo: domicilioCodigoMatch?.[1]?.trim() || undefined,
      };
    }
    
    // Extrair Simples Nacional
    const simplesInclusaoMatch = text.match(/Simples Nacional[^\n]*Inclusão[^\n]*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
    const simplesExclusaoMatch = text.match(/Simples Nacional[^\n]*Exclusão[^\n]*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (simplesInclusaoMatch || simplesExclusaoMatch) {
      data.simples_nacional = {
        data_inclusao: simplesInclusaoMatch?.[1] || undefined,
        data_exclusao: simplesExclusaoMatch?.[1] || undefined,
      };
    }
    
    // ✅ Função auxiliar para normalizar nome (remover acentos, espaços extras, etc.)
    const normalizarNome = (nome: string): string => {
      if (!nome) return '';
      return nome
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    };
    
    // ✅ Função auxiliar para fazer matching por nome (com tolerância a diferenças)
    const fazerMatchPorNome = (nomeSitf: string, sociosExistentes: Array<{ nome: string; cpf?: string | null }>): { nome: string; cpf?: string | null } | null => {
      const nomeSitfNormalizado = normalizarNome(nomeSitf);
      
      // Tentar match exato primeiro
      for (const socioExistente of sociosExistentes) {
        const nomeExistenteNormalizado = normalizarNome(socioExistente.nome);
        if (nomeExistenteNormalizado === nomeSitfNormalizado) {
          return socioExistente;
        }
      }
      
      // Tentar match parcial (nome contém ou é contido)
      for (const socioExistente of sociosExistentes) {
        const nomeExistenteNormalizado = normalizarNome(socioExistente.nome);
        // Verificar se um nome contém o outro (para casos como "FRANCIANE DE FATIMA SOUZA LOPES DE" vs "FRANCIANE DE FATIMA SOUZA LOPES DE PONTES")
        if (nomeSitfNormalizado.includes(nomeExistenteNormalizado) || nomeExistenteNormalizado.includes(nomeSitfNormalizado)) {
          // Verificar se a diferença é pequena (apenas algumas palavras a mais/menos)
          const palavrasSitf = nomeSitfNormalizado.split(/\s+/);
          const palavrasExistente = nomeExistenteNormalizado.split(/\s+/);
          const diferenca = Math.abs(palavrasSitf.length - palavrasExistente.length);
          if (diferenca <= 2) { // Tolerância de até 2 palavras de diferença
            return socioExistente;
          }
        }
      }
      
      return null;
    };
    
    // Extrair Sócios (tabela de sócios)
    // Formato: CPF/CNPJ | Nome | Qualificação | Situação Cadastral | Cap. Social | Cap. Votante
    // Exemplo do PDF: "525.635.617-87 LUIZ CARLOS BERTOLLO SÓCIO-ADMINISTRADOR REGULAR 50,00%"
    // ✅ Melhorar regex para capturar toda a seção, mesmo com muitos sócios
    // ✅ Detectar múltiplas páginas e ignorar área vermelha (cabeçalho do MINISTÉRIO)
    
    // Detectar se há múltiplas páginas (pelo padrão "Página: X / Y" ou cabeçalho do MINISTÉRIO)
    const temMultiplasPaginas = /Página\s*:\s*\d+\s*\/\s*\d+/i.test(text) || /MINISTÉRIO\s+DA\s+ECONOMIA/i.test(text);
    
    // Buscar todas as seções "Sócios e Administradores" (pode haver mais de uma em múltiplas páginas)
    const todasSecoesSocios: string[] = [];
    
    // Primeira seção: desde "Sócios e Administradores" até encontrar uma seção seguinte, fim do documento, ou cabeçalho do MINISTÉRIO
    const primeiraSecaoMatch = text.match(/Sócios\s+e\s+Administradores[\s\S]*?(?=(?:MINISTÉRIO\s+DA\s+ECONOMIA|SECRETARIA\s+ESPECIAL|Certidão|Domicílio|Simples\s+Nacional|Final|Página\s*:\s*\d+\s*\/\s*\d+|$))/i);
    if (primeiraSecaoMatch) {
      todasSecoesSocios.push(primeiraSecaoMatch[0]);
    }
    
    // Se há múltiplas páginas, buscar segunda seção (após o cabeçalho do MINISTÉRIO)
    if (temMultiplasPaginas) {
      // ✅ MELHORAR: Buscar segunda seção mesmo quando há CNPJ diferente antes de "Sócios e Administradores"
      // Pode haver: "CNPJ: 50.599.076 - DARWIN CAPIXABA EDITORA LTDA" antes da seção
      const segundaSecaoMatch = text.match(/MINISTÉRIO\s+DA\s+ECONOMIA[\s\S]*?(?:CNPJ[:\s]+[\d\s\-\.]+[\s\-\s]+[^\n]+)?\s*Sócios\s+e\s+Administradores[\s\S]*?(?=(?:Certidão|Domicílio|Simples\s+Nacional|Final|Página\s*:\s*\d+\s*\/\s*\d+|$))/i);
      if (segundaSecaoMatch) {
        // Extrair apenas a parte após "Sócios e Administradores"
        const segundaSecaoTexto = segundaSecaoMatch[0].replace(/[\s\S]*?Sócios\s+e\s+Administradores/i, 'Sócios e Administradores');
        todasSecoesSocios.push(segundaSecaoTexto);
        console.log('[Sitf Extract] ✅ Segunda seção de sócios encontrada (após área vermelha)');
      }
      
      // ✅ Buscar também se houver "Sócios e Administradores" após qualquer CNPJ na segunda página
      const todasSecoesAlternativas = text.matchAll(/Sócios\s+e\s+Administradores[\s\S]*?(?=(?:Sócios\s+e\s+Administradores|Certidão|Domicílio|Simples\s+Nacional|Final|Página\s*:\s*\d+\s*\/\s*\d+|$))/gi);
      for (const secaoAlternativa of todasSecoesAlternativas) {
        if (secaoAlternativa[0] && !todasSecoesSocios.includes(secaoAlternativa[0])) {
          // Verificar se esta seção está após o cabeçalho do MINISTÉRIO
          const indexNoTexto = secaoAlternativa.index || 0;
          const textoAntes = text.substring(0, indexNoTexto);
          if (textoAntes.includes('MINISTÉRIO DA ECONOMIA')) {
            todasSecoesSocios.push(secaoAlternativa[0]);
            console.log('[Sitf Extract] ✅ Seção adicional de sócios encontrada (alternativa)');
          }
        }
      }
    }
    
    // Processar todas as seções encontradas
    const sociosSectionMatch = todasSecoesSocios.length > 0 ? { 0: todasSecoesSocios.join('\n\n--- SEÇÃO SEPARADORA ---\n\n') } : null;
    if (sociosSectionMatch) {
      const sociosText = sociosSectionMatch[0];
      console.log(`[Sitf Extract] Texto da seção de sócios (${sociosText.length} caracteres, ${todasSecoesSocios.length} seção(ões), primeiros 1000 chars):`, sociosText.substring(0, 1000));
      
      const socios: Array<{cpf?: string; nome?: string; qualificacao?: string; situacao_cadastral?: string; participacao_percentual?: number}> = [];
      
      // ✅ Rastrear quais sócios existentes já foram encontrados (para identificar faltantes)
      const sociosEncontrados = new Set<string>();
      
      // Dividir em linhas e processar cada linha
      const lines = sociosText.split('\n');
      let currentSocio: any = null;
      
      // ✅ Função auxiliar para buscar percentual em múltiplas colunas da tabela
      const buscarPercentualNaLinha = (linha: string): { valor: number; match: string } | null => {
        // Buscar TODOS os percentuais na linha (pode haver múltiplos em uma tabela)
        const percentuaisMatch = linha.matchAll(/\b(\d{1,3}[,\.]\d{2})\s*%\b/g);
        const percentuais: Array<{ valor: number; match: string }> = [];
        
        for (const match of percentuaisMatch) {
          const percentValue = match[1].replace(',', '.');
          const percent = parseFloat(percentValue);
          if (!isNaN(percent) && percent <= 100) {
            percentuais.push({ valor: percent > 100 ? percent / 100 : percent, match: match[0] });
          }
        }
        
        // Se encontrou múltiplos percentuais, usar o último (geralmente é o Cap. Social)
        // Se encontrou apenas um, usar esse
        return percentuais.length > 0 ? percentuais[percentuais.length - 1] : null;
      };
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // ✅ Padrão 1: Linha com "CPF Representante Legal" - buscar CPF e anexar ao sócio anterior (empresa)
        const cpfRepLegalMatch = line.match(/CPF\s+Representante\s+Legal[:\s]+(\d{2,3}\.\d{3}\.\d{3}-\d{2})/i);
        if (cpfRepLegalMatch && socios.length > 0) {
          const ultimoSocio = socios[socios.length - 1];
          // Verificar se o último sócio é uma empresa (tem LTDA, S/A, etc no nome)
          if (ultimoSocio.nome && /LTDA|S\/A|EIRELI|HOLDING|PARTICIPACOES|EMPRESARIAIS/i.test(ultimoSocio.nome)) {
            // Extrair também o "Qualif. Resp." se houver
            const qualifRespMatch = line.match(/Qualif\.\s*Resp\.\s*:\s*([^\n]+)/i);
            if (qualifRespMatch) {
              ultimoSocio.qualificacao = ultimoSocio.qualificacao 
                ? `${ultimoSocio.qualificacao} (Representante: ${qualifRespMatch[1].trim()})` 
                : `Representante: ${qualifRespMatch[1].trim()}`;
            }
            // Não adicionar o CPF do representante como sócio novo
            console.log(`[Sitf Extract] ✅ CPF Representante Legal encontrado para ${ultimoSocio.nome}: ${cpfRepLegalMatch[1]} (não será criado como novo sócio)`);
            continue;
          }
        }
        
        // Procurar por padrão: CPF/CNPJ seguido de dados
        // CPF: \d{3}\.\d{3}\.\d{3}-\d{2} ou CNPJ: \d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}
        const cpfCnpjPattern = /(\d{2,3}\.\d{3}\.\d{3}(?:\/\d{4})?-\d{2})/;
        const cpfMatch = line.match(cpfCnpjPattern);
        
        if (cpfMatch) {
          const cpf = cpfMatch[1];
          const restOfLine = line.substring(cpfMatch.index! + cpf.length).trim();
          
          // Verificar se esta linha é apenas informação adicional (ex: "Qualif. Resp.: PAI" ou "CONTRATANTE: 32.401.481/0001-33")
          // e não um novo sócio. Se o CPF já existe em um sócio anterior, anexar a informação
          const isInfoLine = /^(Qualif\.\s*Resp\.|CPF\s*Representante|Representante|CONTRATANTE)/i.test(restOfLine.trim()) ||
                             restOfLine.includes('CONTRATANTE: 32.401.481') || restOfLine.includes('CONTRATANTE: 32401481');
          
          // Verificar se tem percentual na linha - se não tiver, provavelmente é apenas informação adicional
          const temPercentualNaLinha = /(\d{1,3}[,\.]\d{2})\s*%/.test(restOfLine);
          
          // Verificar se tem um nome válido (não apenas "Qualif. Resp." ou "CONTRATANTE" ou similar)
          const temNomeValido = restOfLine.trim().length > 0 && 
            !/^(Qualif\.\s*Resp\.|CPF\s*Representante|Representante|CONTRATANTE)/i.test(restOfLine.trim()) &&
            !restOfLine.includes('CONTRATANTE: 32.401.481') && !restOfLine.includes('CONTRATANTE: 32401481') &&
            restOfLine.trim().split(/\s+/).length >= 2; // Pelo menos 2 palavras (nome completo)
          
          if (isInfoLine || (!temPercentualNaLinha && !temNomeValido)) {
            // Esta é uma linha de informação adicional, não um novo sócio
            // Procurar se já existe um sócio com este CPF
            const existingSocioIndex = socios.findIndex(s => s.cpf === cpf);
            if (existingSocioIndex >= 0) {
              // Anexar informação ao sócio existente
              const respMatch = restOfLine.match(/Qualif\.\s*Resp\.\s*:\s*([^\n]+)/i);
              if (respMatch) {
                socios[existingSocioIndex].qualificacao = socios[existingSocioIndex].qualificacao 
                  ? `${socios[existingSocioIndex].qualificacao} (${respMatch[1].trim()})` 
                  : respMatch[1].trim();
                console.log('[Sitf Extract] ✅ Informação de representante anexada ao sócio existente:', socios[existingSocioIndex].nome);
              }
              continue; // Pular esta linha, não criar novo sócio
            } else if (currentSocio && currentSocio.cpf === cpf) {
              // Anexar ao sócio atual sendo processado
              const respMatch = restOfLine.match(/Qualif\.\s*Resp\.\s*:\s*([^\n]+)/i);
              if (respMatch) {
                currentSocio.qualificacao = currentSocio.qualificacao 
                  ? `${currentSocio.qualificacao} (${respMatch[1].trim()})` 
                  : respMatch[1].trim();
                console.log('[Sitf Extract] ✅ Informação de representante anexada ao sócio atual:', currentSocio.nome);
              }
              continue; // Pular esta linha, não criar novo sócio
            } else {
              // Procurar o sócio anterior (último salvo) para anexar a informação
              if (socios.length > 0) {
                const ultimoSocio = socios[socios.length - 1];
                const respMatch = restOfLine.match(/Qualif\.\s*Resp\.\s*:\s*([^\n]+)/i);
                if (respMatch) {
                  ultimoSocio.qualificacao = ultimoSocio.qualificacao 
                    ? `${ultimoSocio.qualificacao} (${respMatch[1].trim()})` 
                    : respMatch[1].trim();
                  console.log('[Sitf Extract] ✅ Informação de representante anexada ao último sócio:', ultimoSocio.nome);
                }
                continue; // Pular esta linha, não criar novo sócio
              }
            }
          }
          
          // Se já temos um sócio sendo processado, salvá-lo antes de começar um novo
          if (currentSocio && currentSocio.nome) {
            // ✅ Fazer matching por nome com sócios existentes
            const matchExistente = fazerMatchPorNome(currentSocio.nome, sociosExistentes);
            if (matchExistente) {
              console.log(`[Sitf Extract] ✅ Match encontrado por nome: "${currentSocio.nome}" → "${matchExistente.nome}"`);
              sociosEncontrados.add(normalizarNome(matchExistente.nome));
              
              // Se o sócio existente tem CPF mas o extraído não tem, usar o existente
              if (!currentSocio.cpf && matchExistente.cpf) {
                currentSocio.cpf = matchExistente.cpf;
                console.log(`[Sitf Extract] ✅ CPF do sócio existente usado: ${currentSocio.cpf}`);
              }
            }
            
            socios.push(currentSocio);
            console.log('[Sitf Extract] ✅ Sócio salvo:', currentSocio);
          }
          
          console.log('[Sitf Extract] Linha com CPF encontrada:', { cpf, restOfLine });
          
          // ✅ MELHORAR: Buscar porcentagem em múltiplas colunas da tabela
          // A porcentagem pode estar em qualquer coluna, não necessariamente na mesma linha que o CPF/CNPJ
          let participacaoPercentual: number | undefined;
          let percentMatch: RegExpMatchArray | null = null;
          
          // Primeiro, buscar na linha atual usando função auxiliar (busca em múltiplas colunas)
          const percentualNaLinha = buscarPercentualNaLinha(restOfLine);
          if (percentualNaLinha) {
            participacaoPercentual = percentualNaLinha.valor;
            percentMatch = [percentualNaLinha.match, percentualNaLinha.match.replace('%', '').trim()];
            console.log('[Sitf Extract] Porcentagem encontrada (múltiplas colunas):', percentualNaLinha.match, '→', participacaoPercentual);
          } else {
            // Se não encontrou, tentar padrões alternativos
            // Padrão 1: XX,XX% ou XX.XX% (com vírgula ou ponto e símbolo %)
            percentMatch = restOfLine.match(/(\d{1,3}[,\.]\d{2})\s*%/);
            
            // Padrão 2: XX,XX ou XX.XX (sem símbolo %, mas com vírgula/ponto) - verificar se está no contexto de Cap. Social
            if (!percentMatch) {
              const percentPattern2 = /Cap\.\s*Social[^\n]*:?\s*(\d{1,3}[,\.]\d{2})/i;
              percentMatch = restOfLine.match(percentPattern2);
            }
            
            // Padrão 3: XX,XX ou XX.XX seguido de espaço ou fim de linha (sem %)
            if (!percentMatch) {
              const percentPattern3 = /(\d{1,3}[,\.]\d{2})(?:\s|$)/;
              const tempMatch = restOfLine.match(percentPattern3);
              // Verificar se não é parte de um número maior (ex: data, CEP)
              if (tempMatch && parseFloat(tempMatch[1].replace(',', '.')) <= 100) {
                percentMatch = tempMatch;
              }
            }
            
            // Padrão 4: XX% (número inteiro com %)
            if (!percentMatch) {
              const percentPattern4 = /(\d{1,3})\s*%/;
              percentMatch = restOfLine.match(percentPattern4);
            }
            
          if (percentMatch) {
            const percentValue = percentMatch[1].replace(',', '.');
            participacaoPercentual = parseFloat(percentValue);
              if (isNaN(participacaoPercentual)) {
                participacaoPercentual = undefined;
              } else {
                // Garantir que está entre 0 e 100
                if (participacaoPercentual > 100) {
                  participacaoPercentual = participacaoPercentual / 100; // Se for 5000, transformar em 50.00
                }
              }
              console.log('[Sitf Extract] Porcentagem encontrada:', percentMatch[1], '→', participacaoPercentual);
            }
          }
          
          // ✅ MELHORAR: Se não encontrou na linha atual, buscar nas próximas 2 linhas e na linha anterior
          if (!participacaoPercentual) {
            // Buscar na linha anterior (pode estar na coluna anterior da tabela)
            if (i > 0) {
              const prevLine = lines[i - 1].trim();
              const prevPercentual = buscarPercentualNaLinha(prevLine);
              if (prevPercentual && prevPercentual.valor <= 100) {
                participacaoPercentual = prevPercentual.valor;
                console.log('[Sitf Extract] Porcentagem encontrada na linha anterior:', prevPercentual.match, '→', participacaoPercentual);
              }
            }
            
            // Buscar nas próximas 2 linhas
            if (!participacaoPercentual && i + 1 < lines.length) {
              for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
                const nextLine = lines[j].trim();
                const nextPercentual = buscarPercentualNaLinha(nextLine);
                if (nextPercentual && nextPercentual.valor <= 100) {
                  participacaoPercentual = nextPercentual.valor;
                  console.log(`[Sitf Extract] Porcentagem encontrada na linha ${j + 1}:`, nextPercentual.match, '→', participacaoPercentual);
                  break;
                }
              }
            }
          }
          
          // Remover porcentagem para processar o resto (usar match encontrado)
          let restWithoutPercent = restOfLine;
          if (participacaoPercentual !== undefined) {
            // Remover todos os percentuais encontrados na linha
            restWithoutPercent = restOfLine.replace(/\b\d{1,3}[,\.]\d{2}\s*%\b/g, '').trim();
          }
          
          // Procurar situação cadastral (REGULAR, IRREGULAR, etc.)
          const situacaoPattern = /\b(REGULAR|IRREGULAR|SUSPENSO|CANCELADO|BAIXADO|ATIVA|INATIVA)\b/i;
          const situacaoMatch = restWithoutPercent.match(situacaoPattern);
          const situacao = situacaoMatch ? situacaoMatch[1].toUpperCase() : null;
          
          // Remover situação para obter nome e qualificação
          let restWithoutSituacao = restWithoutPercent;
          if (situacaoMatch) {
            const situacaoIndex = restWithoutPercent.indexOf(situacaoMatch[0]);
            restWithoutSituacao = (restWithoutPercent.substring(0, situacaoIndex).trim() + ' ' + restWithoutPercent.substring(situacaoIndex + situacaoMatch[0].length).trim()).trim();
          }
          
          // Tentar separar nome e qualificação
          // Qualificações comuns: SÓCIO-ADMINISTRADOR, ADMINISTRADOR, SÓCIO OU ACIONISTA MENOR, etc.
          // Melhorar regex para capturar qualificações mais complexas incluindo parênteses
          const qualificacaoPattern = /(SÓCIO\s*OU\s*ACIONISTA\s*MENOR\s*\([^)]+\)|SÓCIO\s*OU\s*ACIONISTA\s*MENOR|SÓCIO-ADMINISTRADOR|ADMINISTRADOR|SÓCIO|QUOTISTA|DIRETOR|PRESIDENTE|GERENTE)/i;
          const qualificacaoMatch = restWithoutSituacao.match(qualificacaoPattern);
          
          let nome = '';
          let qualificacao = '';
          
          if (qualificacaoMatch) {
            qualificacao = qualificacaoMatch[1].toUpperCase();
            const qualIndex = restWithoutSituacao.indexOf(qualificacaoMatch[0]);
            nome = restWithoutSituacao.substring(0, qualIndex).trim();
          } else {
            // Se não encontrou qualificação, assumir que tudo é nome
            nome = restWithoutSituacao.trim();
          }
          
          // Limpar nome de espaços extras e caracteres indesejados
          nome = nome.replace(/\s+/g, ' ').trim();
          
          // Validar se o nome não é apenas uma descrição (ex: "Qualif. Resp.: PAI" ou "CONTRATANTE: 32.401.481/0001-33")
          const isNomeDescricao = /^(Qualif\.\s*Resp\.|CPF\s*Representante|Representante|CONTRATANTE)/i.test(nome) ||
                                   nome.includes('CONTRATANTE: 32.401.481') || nome.includes('CONTRATANTE: 32401481');
          
          // Verificar se tem um nome válido (não apenas descrições)
          const nomeValido = nome && nome.length >= 3 && !isNomeDescricao && nome.split(/\s+/).length >= 2;
          
          // ✅ Melhorar validação: aceitar sócio mesmo sem percentual se tiver nome válido e CPF
          // O percentual pode estar em outra linha ou pode não estar disponível
          // Se não tem nome válido, não criar sócio (pode ser apenas informação adicional)
          if (isNomeDescricao || !nomeValido) {
            console.warn('[Sitf Extract] ⚠️ Linha ignorada (sem nome válido):', { cpf, restOfLine, nome, participacaoPercentual, isNomeDescricao, nomeValido });
            
            // Tentar anexar ao último sócio salvo se for informação de representante
            if (isNomeDescricao && socios.length > 0) {
              const ultimoSocio = socios[socios.length - 1];
              const respMatch = restOfLine.match(/Qualif\.\s*Resp\.\s*:\s*([^\n]+)/i);
              if (respMatch) {
                ultimoSocio.qualificacao = ultimoSocio.qualificacao 
                  ? `${ultimoSocio.qualificacao} (${respMatch[1].trim()})` 
                  : respMatch[1].trim();
                console.log('[Sitf Extract] ✅ Informação de representante anexada ao último sócio:', ultimoSocio.nome);
              }
            }
            
            continue; // Pular esta linha, não criar sócio
          }
          
          // ✅ Se tem nome válido mas não tem percentual, ainda criar o sócio
          // O percentual pode estar em outra linha ou pode não estar disponível
          if (participacaoPercentual === undefined) {
            console.warn('[Sitf Extract] ⚠️ Sócio sem percentual na linha inicial, tentando buscar nas próximas linhas:', { cpf, nome });
          }
          
          // Inicializar o sócio atual
          currentSocio = {
              cpf,
              nome,
              qualificacao: qualificacao || null,
              situacao_cadastral: situacao || null,
            participacao_percentual: participacaoPercentual, // Pode ser undefined, será buscado nas próximas linhas
          };
          
          // Verificar se a próxima linha tem informações de representante legal
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim();
            // Verificar se a próxima linha tem "Qualif. Resp." ou "CPF Representante"
            if (nextLine.match(/Qualif\.\s*Resp\.|CPF\s*Representante/i)) {
              const respMatch = nextLine.match(/Qualif\.\s*Resp\.\s*:\s*([^\n]+)/i);
              if (respMatch) {
                currentSocio.qualificacao = currentSocio.qualificacao 
                  ? `${currentSocio.qualificacao} (${respMatch[1].trim()})` 
                  : respMatch[1].trim();
                i++; // Pular a linha de representante legal
              }
            }
          }
          
          if (!currentSocio.nome) {
            console.warn('[Sitf Extract] ⚠️ CPF encontrado mas nome vazio:', { cpf, restWithoutSituacao });
            currentSocio = null;
          }
        } else {
          // ✅ NOVO: Processar linha que pode começar com NOME (sem CPF/CNPJ inicial)
          // Padrão: Nome em letras maiúsculas (possivelmente empresa com LTDA, S/A, etc)
          const nomePattern = /^([A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ][A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ\s\.\&\-]+(?:LTDA|S\/A|EIRELI|ME|EPP|HOLDING|PARTICIPACOES|ADMINISTRACAO|EMPRESARIAIS|S\/A)?)/;
          const nomeMatch = line.match(nomePattern);
          
          // Verificar se não é uma linha de informação (Qualif. Resp., CPF Representante, CONTRATANTE, etc)
          const isInfoLine = /^(Qualif\.\s*Resp\.|CPF\s*Representante|Representante|Cap\.\s*Votante|Cap\.\s*Social|CONTRATANTE)/i.test(line) ||
                             line.includes('CONTRATANTE: 32.401.481') || line.includes('CONTRATANTE: 32401481');
          
          if (nomeMatch && !isInfoLine && nomeMatch[1].split(/\s+/).length >= 2) {
            const nomeInicial = nomeMatch[1].trim();
            console.log('[Sitf Extract] 🔍 Linha com nome encontrada (sem CPF inicial):', nomeInicial);
            
            // Buscar CPF/CNPJ e percentual nas linhas seguintes e anteriores
            let cpfParaSocio: string | undefined;
            let percentualParaSocio: number | undefined;
            let qualificacaoParaSocio: string | null = null;
            let situacaoParaSocio: string | null = null;
            
            // Buscar nas próximas 3 linhas e na linha anterior
            const linhasParaBuscar = [
              ...(i > 0 ? [lines[i - 1].trim()] : []), // Linha anterior
              line, // Linha atual
              ...(i + 1 < lines.length ? lines.slice(i + 1, Math.min(i + 4, lines.length)).map(l => l.trim()) : []), // Próximas 3 linhas
            ];
            
            for (const linhaParaBuscar of linhasParaBuscar) {
              if (!linhaParaBuscar) continue;
              
              // Buscar CPF/CNPJ
              const cpfNextMatch = linhaParaBuscar.match(/(\d{2,3}\.\d{3}\.\d{3}(?:\/\d{4})?-\d{2})/);
              if (cpfNextMatch && !cpfParaSocio) {
                // Verificar se não é um "CPF Representante Legal" (vem após o nome da empresa)
                if (!/CPF\s+Representante\s+Legal/i.test(linhaParaBuscar)) {
                  cpfParaSocio = cpfNextMatch[1];
                  console.log(`[Sitf Extract] ✅ CPF/CNPJ encontrado para ${nomeInicial}: ${cpfParaSocio}`);
                }
              }
              
              // Buscar percentual
              const percentualEncontrado = buscarPercentualNaLinha(linhaParaBuscar);
              if (percentualEncontrado && !percentualParaSocio) {
                percentualParaSocio = percentualEncontrado.valor;
                console.log(`[Sitf Extract] ✅ Percentual encontrado para ${nomeInicial}: ${percentualParaSocio}%`);
              }
              
              // Buscar qualificação
              if (!qualificacaoParaSocio) {
                const qualMatch = linhaParaBuscar.match(/(SÓCIO\s*OU\s*ACIONISTA\s*MENOR\s*\([^)]+\)|SÓCIO\s*OU\s*ACIONISTA\s*MENOR|SÓCIO-ADMINISTRADOR|ADMINISTRADOR|SÓCIO|QUOTISTA|DIRETOR|PRESIDENTE|GERENTE)/i);
                if (qualMatch) {
                  qualificacaoParaSocio = qualMatch[1].toUpperCase();
                }
              }
              
              // Buscar situação cadastral
              if (!situacaoParaSocio) {
                const situacaoMatch = linhaParaBuscar.match(/\b(REGULAR|IRREGULAR|SUSPENSO|CANCELADO|BAIXADO|ATIVA|INATIVA)\b/i);
                if (situacaoMatch) {
                  situacaoParaSocio = situacaoMatch[1].toUpperCase();
                }
              }
            }
            
            // ✅ Fazer matching com sócios existentes para melhorar extração
            const matchExistente = fazerMatchPorNome(nomeInicial, sociosExistentes);
            if (matchExistente) {
              console.log(`[Sitf Extract] ✅ Match encontrado por nome (sem CPF inicial): "${nomeInicial}" → "${matchExistente.nome}"`);
              sociosEncontrados.add(normalizarNome(matchExistente.nome));
              
              // Usar CPF do sócio existente se não encontrou na extração
              if (!cpfParaSocio && matchExistente.cpf) {
                cpfParaSocio = matchExistente.cpf;
                console.log(`[Sitf Extract] ✅ CPF do sócio existente usado: ${cpfParaSocio}`);
              }
            }
            
            // Criar sócio mesmo sem CPF/CNPJ se encontrou nome válido
            // Isso é importante para sócios que vieram do QSA sem CPF
            if (nomeInicial.length >= 3 && nomeInicial.split(/\s+/).length >= 2) {
              // Se já temos um sócio sendo processado, salvá-lo antes de começar um novo
              if (currentSocio && currentSocio.nome) {
                // ✅ Fazer matching por nome com sócios existentes
                const matchExistenteCurrent = fazerMatchPorNome(currentSocio.nome, sociosExistentes);
                if (matchExistenteCurrent) {
                  console.log(`[Sitf Extract] ✅ Match encontrado por nome: "${currentSocio.nome}" → "${matchExistenteCurrent.nome}"`);
                  sociosEncontrados.add(normalizarNome(matchExistenteCurrent.nome));
                  
                  if (!currentSocio.cpf && matchExistenteCurrent.cpf) {
                    currentSocio.cpf = matchExistenteCurrent.cpf;
                  }
                }
                socios.push(currentSocio);
                console.log('[Sitf Extract] ✅ Sócio salvo antes de processar novo:', currentSocio);
              }
              
              const novoSocio = {
                cpf: cpfParaSocio || undefined,
                nome: nomeInicial,
                qualificacao: qualificacaoParaSocio,
                situacao_cadastral: situacaoParaSocio,
                participacao_percentual: percentualParaSocio,
              };
              
              currentSocio = novoSocio;
              console.log(`[Sitf Extract] ✅ Sócio extraído por nome (sem CPF inicial): ${nomeInicial}`, novoSocio);
              
              // Pular linhas que já foram processadas (até 2 linhas à frente se necessário)
              if (i + 2 < lines.length && cpfParaSocio && lines[i + 1].trim().includes(cpfParaSocio)) {
                i++; // Pular uma linha se o CPF está na próxima linha
              }
              
              continue; // Continuar para próxima iteração (sócio já foi criado)
            }
          }
          
          // Se não é uma linha com CPF nem com nome, pode ser uma linha de continuação ou informação adicional
          // Verificar se é informação de representante legal para o sócio atual
          if (currentSocio) {
            const lineLower = line.toLowerCase();
            if (lineLower.includes('qualif. resp.') || lineLower.includes('cpf representante')) {
              const respMatch = line.match(/Qualif\.\s*Resp\.\s*:\s*([^\n]+)/i);
              if (respMatch) {
                currentSocio.qualificacao = currentSocio.qualificacao 
                  ? `${currentSocio.qualificacao} (${respMatch[1].trim()})` 
                  : respMatch[1].trim();
              }
            }
            // Verificar se há porcentagem nesta linha que não foi capturada antes
            if (currentSocio.participacao_percentual === undefined) {
              const percentualEncontrado = buscarPercentualNaLinha(line);
              if (percentualEncontrado) {
                currentSocio.participacao_percentual = percentualEncontrado.valor;
                console.log('[Sitf Extract] Porcentagem encontrada em linha adicional:', percentualEncontrado.match, '→', currentSocio.participacao_percentual);
              }
            }
          }
        }
      }
      
      // Salvar o último sócio se houver
      if (currentSocio && currentSocio.nome) {
        // ✅ Fazer matching por nome com sócios existentes
        const matchExistente = fazerMatchPorNome(currentSocio.nome, sociosExistentes);
        if (matchExistente) {
          console.log(`[Sitf Extract] ✅ Match encontrado por nome: "${currentSocio.nome}" → "${matchExistente.nome}"`);
          sociosEncontrados.add(normalizarNome(matchExistente.nome));
          
          // Se o sócio existente tem CPF mas o extraído não tem, usar o existente
          if (!currentSocio.cpf && matchExistente.cpf) {
            currentSocio.cpf = matchExistente.cpf;
            console.log(`[Sitf Extract] ✅ CPF do sócio existente usado: ${currentSocio.cpf}`);
          }
        }
        
        socios.push(currentSocio);
        console.log('[Sitf Extract] ✅ Último sócio salvo:', currentSocio);
      }
      
      // ✅ Verificar se há sócios existentes que não foram encontrados na extração
      if (sociosExistentes.length > 0) {
        const sociosFaltantes = sociosExistentes.filter(s => {
          const nomeNormalizado = normalizarNome(s.nome);
          return !sociosEncontrados.has(nomeNormalizado);
        });
        
        if (sociosFaltantes.length > 0) {
          console.warn(`[Sitf Extract] ⚠️ ${sociosFaltantes.length} sócio(s) existente(s) não encontrado(s) na extração:`, 
            sociosFaltantes.map(s => s.nome).join(', '));
          
          // Se há múltiplas páginas e sócios faltantes, tentar buscar na segunda seção
          if (temMultiplasPaginas && todasSecoesSocios.length > 1) {
            console.log('[Sitf Extract] 🔍 Tentando buscar sócios faltantes na segunda seção...');
            // A segunda seção já foi incluída no sociosText, então os sócios devem ter sido extraídos
            // Mas vamos verificar se ainda há faltantes após processar todas as seções
          }
          } else {
          console.log('[Sitf Extract] ✅ Todos os sócios existentes foram encontrados na extração');
        }
      }
      
      // Remover duplicatas por CPF (manter o primeiro com mais informações)
      const sociosUnicos: any[] = [];
      const cpfMap = new Map<string, any>();
      
      for (const socio of socios) {
        if (!socio.cpf) {
          // Se não tem CPF, adicionar diretamente (pode ser CNPJ ou informação incompleta)
          sociosUnicos.push(socio);
          continue;
        }
        
        const cpfLimpo = socio.cpf.replace(/\D/g, '');
        const existing = cpfMap.get(cpfLimpo);
        
        if (!existing) {
          // Primeira ocorrência deste CPF
          cpfMap.set(cpfLimpo, socio);
          sociosUnicos.push(socio);
        } else {
          // CPF duplicado - mesclar informações (manter o que tem mais dados)
          if (socio.nome && socio.nome.length > (existing.nome?.length || 0)) {
            // Substituir se o novo tem nome mais completo
            const index = sociosUnicos.indexOf(existing);
            if (index >= 0) {
              sociosUnicos[index] = socio;
              cpfMap.set(cpfLimpo, socio);
            }
          } else if (socio.qualificacao && !existing.qualificacao) {
            // Adicionar qualificação se não tinha
            existing.qualificacao = socio.qualificacao;
          } else if (socio.participacao_percentual !== undefined && existing.participacao_percentual === undefined) {
            // Adicionar percentual se não tinha
            existing.participacao_percentual = socio.participacao_percentual;
          }
        }
      }
      
      // Validar e ajustar soma dos percentuais
      // ✅ IMPORTANTE: Não ajustar percentuais - usar exatamente o que vem da Situação Fiscal
      // Apenas calcular os valores usando: Capital Social × Porcentagem (SITF) / 100
      const totalPercentual = sociosUnicos.reduce((sum, s) => {
        const percent = s.participacao_percentual || 0;
        return sum + percent;
      }, 0);
      
      console.log(`[Sitf Extract] Total de sócios extraídos: ${sociosUnicos.length}`);
      console.log(`[Sitf Extract] Soma dos percentuais (da SITF, sem ajuste): ${totalPercentual.toFixed(2)}%`);
      
      // Log detalhado de cada sócio
      if (sociosUnicos.length > 0) {
        console.log('[Sitf Extract] Total de sócios extraídos (após remoção de duplicatas):', sociosUnicos.length);
        sociosUnicos.forEach((s, idx) => {
          console.log(`[Sitf Extract] Sócio ${idx + 1}: ${s.nome} - CPF/CNPJ: ${s.cpf || 'N/A'} - ${s.participacao_percentual?.toFixed(2) || 'N/A'}%`);
        });
        
        data.socios = sociosUnicos;
      } else {
        console.warn('[Sitf Extract] ⚠️ Nenhum sócio encontrado na seção');
      }
    }
    
    // Extrair endereço (múltiplos formatos)
    // Formato 1: "Rua Exemplo, 123 - Complemento, Bairro, Cidade, UF, CEP: 12345-678"
    let enderecoMatch = text.match(/([A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ\s]+),\s*(\d+)(?:\s*-\s*([^\n,]+))?[,\s]+([A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ\s]+)[,\s]+([A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ\s]+)[,\s]+([A-Z]{2})[,\s]+(?:CEP[:\s]*)?(\d{5}-?\d{3})/i);
    
    // Formato 2: "Logradouro, Número, Bairro, Município - UF, CEP"
    if (!enderecoMatch) {
      enderecoMatch = text.match(/([A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ\s]+),\s*(\d+)[,\s]+([A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ\s]+)[,\s]+([A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ\s]+)\s*-\s*([A-Z]{2})[,\s]+(?:CEP[:\s]*)?(\d{5}-?\d{3})/i);
    }
    
    // Formato 3: Buscar campos individuais
    if (!enderecoMatch) {
      const logradouroMatch = text.match(/Logradouro[^\n]*:?\s*([^\n]+)/i);
      const numeroMatch = text.match(/Número[^\n]*:?\s*([^\n]+)/i);
      const complementoMatch = text.match(/Complemento[^\n]*:?\s*([^\n]+)/i);
      const bairroMatch = text.match(/Bairro[^\n]*:?\s*([^\n]+)/i);
      const municipioMatch = text.match(/Município[^\n]*:?\s*([^\n]+)/i);
      const ufMatch = text.match(/UF[^\n]*:?\s*([A-Z]{2})/i);
      const cepMatch = text.match(/CEP[^\n]*:?\s*(\d{5}-?\d{3})/i);
      
      if (logradouroMatch || municipioMatch) {
        data.endereco = {
          logradouro: logradouroMatch?.[1]?.trim() || undefined,
          numero: numeroMatch?.[1]?.trim() || undefined,
          complemento: complementoMatch?.[1]?.trim() || undefined,
          bairro: bairroMatch?.[1]?.trim() || undefined,
          municipio: municipioMatch?.[1]?.trim() || undefined,
          uf: ufMatch?.[1]?.trim() || undefined,
          cep: cepMatch?.[1]?.trim() || undefined,
        };
      }
    } else {
      data.endereco = {
        logradouro: enderecoMatch[1].trim(),
        numero: enderecoMatch[2].trim(),
        complemento: enderecoMatch[3]?.trim() || undefined,
        bairro: enderecoMatch[4]?.trim() || undefined,
        municipio: enderecoMatch[5]?.trim() || undefined,
        uf: enderecoMatch[6]?.trim() || undefined,
        cep: enderecoMatch[7]?.trim() || undefined,
      };
    }
    
    // Extrair certidão - buscar em TODO o texto do PDF (não apenas contexto limitado)
    // Primeiro, buscar todas as ocorrências de "Certidão" no texto completo
    const certidaoMatches: Array<{ tipo: string; index: number; texto: string }> = [];
    
    // Buscar "Certidão Positiva" - verificar se tem "Efeitos de Negativa" no contexto
    // Primeiro, encontrar todas as ocorrências de "Certidão Positiva"
    const certidaoPositivaRegex = /Certidão\s+Positiva/gi;
    const matchesPositiva: Array<{ index: number; contexto: string }> = [];
    let matchPositiva: RegExpExecArray | null;
    
    while ((matchPositiva = certidaoPositivaRegex.exec(text)) !== null) {
      // Pegar contexto maior (até 300 caracteres) para verificar se tem "Efeitos"
      const contextoStart = matchPositiva.index;
      const contextoEnd = Math.min(contextoStart + 300, text.length);
      const contexto = text.substring(contextoStart, contextoEnd);
      
      matchesPositiva.push({
        index: matchPositiva.index,
        contexto: contexto
      });
    }
    
    // Processar cada ocorrência encontrada
    for (const matchPositiva of matchesPositiva) {
      // Verificar se no contexto tem "Efeitos de Negativa" (pode estar em linhas diferentes)
      const temEfeitos = /Efeitos\s+de\s+Negativa/i.test(matchPositiva.contexto) || 
                        /com\s+Efeitos\s+de\s+Negativa/i.test(matchPositiva.contexto);
      
      if (temEfeitos) {
        // Verificar se já não foi adicionada
        const jaAdicionada = certidaoMatches.some(m => 
          m.index === matchPositiva.index || 
          (matchPositiva.index >= m.index && matchPositiva.index < m.index + 300)
        );
        if (!jaAdicionada) {
          certidaoMatches.push({
            tipo: 'Certidão Positiva com Efeitos de Negativa',
            index: matchPositiva.index,
            texto: matchPositiva.contexto.substring(0, 150)
          });
        }
      } else {
        // É Positiva simples - verificar se já não foi adicionada como "com Efeitos"
        const jaAdicionada = certidaoMatches.some(m => 
          m.tipo === 'Certidão Positiva com Efeitos de Negativa' &&
          (matchPositiva.index >= m.index && matchPositiva.index < m.index + 300)
        );
        if (!jaAdicionada) {
          certidaoMatches.push({
            tipo: 'Certidão Positiva',
            index: matchPositiva.index,
            texto: 'Certidão Positiva'
          });
        }
      }
    }
    
    // Buscar "Certidão Negativa" (apenas se não encontrou Positiva com Efeitos)
    const certidaoNegativaRegex = /Certidão\s+Negativa[^\n]*/gi;
    let matchNegativa;
    while ((matchNegativa = certidaoNegativaRegex.exec(text)) !== null) {
      // Verificar se já não foi adicionada como Positiva com Efeitos
      const jaAdicionada = certidaoMatches.some(m => 
        m.tipo === 'Certidão Positiva com Efeitos de Negativa' &&
        (matchNegativa.index >= m.index && matchNegativa.index < m.index + 300)
      );
      if (!jaAdicionada) {
        certidaoMatches.push({
          tipo: 'Certidão Negativa',
          index: matchNegativa.index,
          texto: matchNegativa[0]
        });
      }
    }
    
    // Se encontrou alguma certidão, usar a primeira ocorrência (mais provável de ser a principal)
    if (certidaoMatches.length > 0) {
      // Ordenar por índice (primeira ocorrência no texto)
      certidaoMatches.sort((a, b) => a.index - b.index);
      const certidaoMatch = certidaoMatches[0];
      
      console.log('[Sitf Extract] 📋 Certidão encontrada:', {
        tipo: certidaoMatch.tipo,
        index: certidaoMatch.index,
        totalOcorrencias: certidaoMatches.length,
        todasOcorrencias: certidaoMatches.map(m => ({ tipo: m.tipo, index: m.index }))
      });
      
      // Buscar informações da certidão em TODO o texto (não apenas contexto limitado)
      // Número da certidão - buscar em todo o texto, procurar padrões comuns
      // Formato 1: Número com pontos (ex: 29DC.9064.5D16.BF5F ou E258.0FE9.EBC9.B129)
      const numeroMatch1 = text.match(/(?:Certidão|Número|Certidão\s+Emitida)[^\n]*:?\s*([A-Z0-9]{2,}\.[A-Z0-9]{2,}\.[A-Z0-9]{2,}\.[A-Z0-9]{2,})/i);
      // Formato 2: Número sem pontos mas com formato similar
      const numeroMatch2 = text.match(/(?:Certidão|Número|Certidão\s+Emitida)[^\n]*:?\s*([A-Z0-9]{8,})/i);
      // Formato 3: Buscar próximo à palavra "Certidão" (até 200 caracteres depois)
      const certidaoIndex = certidaoMatch.index;
      const contextoCertidao = text.substring(certidaoIndex, Math.min(certidaoIndex + 500, text.length));
      const numeroMatch3 = contextoCertidao.match(/(?:Número|Certidão)[^\n]*:?\s*([A-Z0-9\.]+(?:\.[A-Z0-9]+){2,})/i);
      
      const numeroCertidao = numeroMatch1?.[1] || numeroMatch3?.[1] || numeroMatch2?.[1];
      
      // Buscar datas - procurar em todo o texto, mas priorizar as que estão próximas à seção de certidão
      // Primeiro, tentar encontrar na seção completa da certidão (aumentar range para até 50 linhas)
      const certidaoSecaoMatch = text.match(/Certidão\s+(?:Positiva|Negativa)[^\n]*(?:com\s+Efeitos\s+de\s+Negativa)?[^\n]*\n(?:[^\n]*\n){0,50}?(?:Emissão|Data\s+de\s+Emissão)[^\n]*:?\s*(\d{2}\/\d{2}\/\d{4})[^\n]*\n(?:[^\n]*\n){0,50}?(?:Validade|Data\s+de\s+Validade)[^\n]*:?\s*(\d{2}\/\d{2}\/\d{4})/is);
      
      let dataEmissao: string | undefined;
      let dataValidade: string | undefined;
      
      if (certidaoSecaoMatch && certidaoSecaoMatch[1] && certidaoSecaoMatch[2]) {
        // Usar as datas encontradas na seção completa
        dataEmissao = certidaoSecaoMatch[1];
        dataValidade = certidaoSecaoMatch[2];
        console.log('[Sitf Extract] ✅ Datas da certidão extraídas da seção completa:', {
          emissao: dataEmissao,
          validade: dataValidade
        });
      } else {
        // Fallback: buscar individualmente em TODO o texto
        // Buscar todas as ocorrências de "Data de Emissão" e "Data de Validade"
        const todasEmissoes = [...text.matchAll(/(?:Emissão|Data\s+de\s+Emissão)[^\n]*:?\s*(\d{2}\/\d{2}\/\d{4})/gi)];
        const todasValidades = [...text.matchAll(/(?:Validade|Data\s+de\s+Validade)[^\n]*:?\s*(\d{2}\/\d{2}\/\d{4})/gi)];
        
        // Usar a primeira ocorrência de cada (mais provável de ser da certidão principal)
        dataEmissao = todasEmissoes[0]?.[1];
        dataValidade = todasValidades[0]?.[1];
        
        console.log('[Sitf Extract] ⚠️ Datas da certidão extraídas de busca global:', {
          emissao: dataEmissao,
          validade: dataValidade,
          totalEmissoes: todasEmissoes.length,
          totalValidades: todasValidades.length
        });
      }
      
      // Verificar se há pendências - buscar em TODO o texto
      const pendenciasText = text.match(/(?:Pendências|Pendência)[^\n]*(?:Detectadas|Encontradas)?[^\n]*:?\s*(Sim|Não|COM|SEM|true|false)/i);
      const pendenciasDetectadas = pendenciasText?.[1]?.toUpperCase().includes('SIM') || 
                                   pendenciasText?.[1]?.toUpperCase().includes('COM') ||
                                   pendenciasText?.[1]?.toLowerCase() === 'true';
      
      // Buscar observação - buscar em TODO o texto
      const observacaoMatch = text.match(/(?:Observação|Obs)[^\n]*:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\n|$)/i);
      
      data.certidao_conjunta_rfb_pgfn = {
        tipo: certidaoMatch.tipo,
        numero: numeroCertidao?.trim() || undefined,
        data_emissao: dataEmissao,
        data_validade: dataValidade,
        pendencias_detectadas: pendenciasDetectadas,
        observacao: observacaoMatch?.[1]?.trim() || undefined,
      };
      
      console.log('[Sitf Extract] 📋 Certidão extraída:', {
        tipo: data.certidao_conjunta_rfb_pgfn.tipo,
        numero: data.certidao_conjunta_rfb_pgfn.numero,
        data_emissao: data.certidao_conjunta_rfb_pgfn.data_emissao,
        data_validade: data.certidao_conjunta_rfb_pgfn.data_validade,
        pendencias: data.certidao_conjunta_rfb_pgfn.pendencias_detectadas
      });
    }
    
    // Log dos dados extraídos para debug
    console.log('[Sitf Extract] 📊 Dados extraídos do texto:', {
      hasFonte: !!data.fonte,
      hasEmpresa: !!data.empresa,
      empresaFields: data.empresa ? Object.keys(data.empresa) : [],
      hasEndereco: !!data.endereco,
      enderecoFields: data.endereco ? Object.keys(data.endereco) : [],
      hasResponsavel: !!data.responsavel,
      hasSocios: !!data.socios && data.socios.length > 0,
      sociosCount: data.socios?.length || 0,
      hasDomicilioFiscal: !!data.domicilio_fiscal,
      hasSimplesNacional: !!data.simples_nacional,
      hasCertidao: !!data.certidao_conjunta_rfb_pgfn,
      certidaoFields: data.certidao_conjunta_rfb_pgfn ? Object.keys(data.certidao_conjunta_rfb_pgfn) : [],
    });
    
    // Se conseguiu extrair pelo menos alguns dados, retornar
    if (data.empresa || data.endereco || data.certidao_conjunta_rfb_pgfn || data.responsavel || data.socios) {
      console.log('[Sitf Extract] ✅ Retornando dados estruturados extraídos do texto');
      return data;
    }
    
    console.log('[Sitf Extract] ⚠️ Nenhum dado estruturado foi extraído do texto');
    return null;
  } catch (error: any) {
    console.error('[Sitf Extract] Erro ao extrair dados estruturados do texto:', error);
    return null;
  }
}









