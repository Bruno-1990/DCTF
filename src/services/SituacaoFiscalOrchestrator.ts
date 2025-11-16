import axios from 'axios';
import { supabaseAdmin, supabase } from '../config/database';

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
  return (data as any) ?? null;
}

async function upsertState(partial: Partial<SitfState> & { cnpj: string }) {
  const client = supabaseAdmin || supabase;
  const payload = { ...partial, cnpj: normalizeCnpj(partial.cnpj) };
  const { error } = await client.from('sitf_protocols').upsert(payload, { onConflict: 'cnpj' });
  if (error) {
    console.error('[Sitf] upsertState error', error);
  }
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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
  };
  
  // Adicionar JWT token se disponível
  if (jwtToken) {
    headers['jwt_token'] = jwtToken;
  }
  
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
    console.error('[Sitf] Erro na requisição ao SERPRO:', {
      message: err?.message,
      status: err?.response?.status,
      statusText: err?.response?.statusText,
      data: err?.response?.data,
    });
    throw err;
  }
  
  // Verificar status HTTP
  if (res.status === 403) {
    const errorMsg = res.data?.mensagens?.[0]?.texto || res.data?.message || 'Acesso negado (403)';
    console.error('[Sitf] SERPRO retornou 403:', {
      url,
      responseData: res.data,
      errorMsg,
    });
    throw new Error(`SERPRO retornou 403: ${errorMsg}`);
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
    console.error('[Sitf] Resposta completa do SERPRO (sem protocolo):', JSON.stringify(res.data, null, 2));
    throw new Error('Protocolo não retornado pelo SERPRO');
  }
  return { protocolo, waitMs, raw: res.data };
}

async function emitirRelatorio(protocolo: string, cnpj: string) {
  const baseUrl = process.env['SERPRO_BASE_URL'] || process.env['RECEITA_API_URL'] || 'https://gateway.apiserpro.serpro.gov.br';
  const path = process.env['SERPRO_EMITIR_PATH'] || '/integra-contador/v1/Emitir';
  const { accessToken, jwtToken } = await fetchAuthTokens();
  const url = `${baseUrl}${path}`;
  const cnpjFixo = normalizeCnpj(process.env['SERPRO_CONTRATANTE_CNPJ'] || '32401481000133');
  const body = {
    contratante: { numero: cnpjFixo, tipo: 2 },
    autorPedidoDados: { numero: cnpjFixo, tipo: 2 },
    contribuinte: { numero: normalizeCnpj(cnpj), tipo: 2 },
    pedidoDados: {
      idSistema: 'SITFIS',
      idServico: 'RELATORIOSITFIS92',
      versaoSistema: '2.0',
      // 'dados' deve ser uma string JSON com o protocolo limpo
      dados: JSON.stringify({ protocoloRelatorio: protocolo }),
    },
  };
  // Construir headers com autenticação (mesmo padrão do ReceitaFederalService)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
  };
  
  // Adicionar JWT token se disponível
  if (jwtToken) {
    headers['jwt_token'] = jwtToken;
  }
  
  console.log('[Sitf] Emitir relatório:', { 
    url, 
    protocolo: protocolo.substring(0, 50) + '...',
    cnpj: normalizeCnpj(cnpj),
  });
  console.log('[Sitf] Body emitir relatório:', JSON.stringify(body, null, 2));
  
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
      // Extrair PDF base64: o campo 'dados' é uma string JSON contendo {"pdf":"..."}
      let pdf: string | undefined = undefined;
      
      if (typeof res.data?.dados === 'string') {
        try {
          // Parse da string JSON: "{\"pdf\":\"JVBERi0xLjQK...\"}"
          const dadosParsed = JSON.parse(res.data.dados);
          pdf = dadosParsed?.pdf;
          console.log('[Sitf] PDF extraído de string JSON:', pdf ? `SIM (${pdf.substring(0, 50)}...)` : 'NÃO');
        } catch (parseErr) {
          console.warn('[Sitf] Erro ao fazer parse do dados como JSON:', parseErr);
        }
      } else if (res.data?.dados && typeof res.data.dados === 'object') {
        // Se dados é um objeto, extrair diretamente
        pdf = res.data.dados.pdf;
        console.log('[Sitf] PDF extraído de objeto:', pdf ? `SIM (${pdf.substring(0, 50)}...)` : 'NÃO');
      }
      
      if (!pdf) {
        // Pode ser que o status dentro dos dados indique que ainda está processando
        const statusInterno = res.data?.status;
        const mensagens: any[] = res.data?.mensagens || [];
        console.warn('[Sitf] Status 200 mas sem PDF. Status interno:', statusInterno, 'Mensagens:', mensagens);
        
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
        
        throw new Error('PDF base64 ausente na resposta do SERPRO');
      }
      console.log('[Sitf] PDF obtido com sucesso!');
      return { status: 200 as const, pdfBase64: pdf, raw: res.data };
    }
    if (res.status === 304) {
      const mensagens: any[] = res.data?.mensagens || [];
      const tempoMsg = mensagens.find((m) => String(m.codigo || '').toLowerCase().includes('aviso'));
      const waitMs = parseTempoEspera(tempoMsg?.texto) ?? 5000;
      console.log('[Sitf] SERPRO retornou 304, waitMs:', waitMs);
      return { status: 304 as const, waitMs, raw: res.data };
    }
    console.warn('[Sitf] Status inesperado do SERPRO:', res.status);
    return { status: res.status as any, raw: res.data };
  } catch (e: any) {
    throw e;
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

    // 2) Cooldown ativo?
    if (state.protocolo && state.next_eligible_at) {
      const next = new Date(state.next_eligible_at).getTime();
      if (!Number.isNaN(next) && now < next) {
        const retry = Math.ceil((next - now) / 1000);
        return { type: 'wait' as const, retryAfter: retry, step: 'emitir' as const };
    }
    }

    // 3) Tentar emitir se já há protocolo
    if (state.protocolo) {
      console.log('[Sitf] Tentando emitir relatório com protocolo existente...');
      const emit = await emitirRelatorio(state.protocolo, clean);
      if (emit.status === 200) {
        // Upload opcional para storage e criar histórico
        const url = await uploadPdfAndGetSignedUrl(emit.pdfBase64, clean);
        if (url) {
          // salvar em downloads e atualizar state
          const client = supabaseAdmin || supabase;
          
          // Proteção contra duplicatas: verificar se já existe registro recente (últimos 10 segundos)
          const recentThreshold = new Date(now - 10000).toISOString();
          const { data: recent } = await client
            .from('sitf_downloads')
            .select('id')
            .eq('cnpj', clean)
            .gte('created_at', recentThreshold)
            .limit(1);
          
          // Só inserir se não houver registro recente
          if (!recent || recent.length === 0) {
            await client.from('sitf_downloads').insert({ cnpj: clean, file_url: url });
          }
          
          await upsertState({ cnpj: clean, status: 'pronto', last_response: emit.raw, file_url: url });
        } else {
          await upsertState({ cnpj: clean, status: 'pronto', last_response: emit.raw });
        }
        return { type: 'ready-base64' as const, base64: emit.pdfBase64, url: url ?? undefined, step: 'concluido' as const };
      }
      // Tratar 202 (Accepted) - relatório ainda em processamento
      if (emit.status === 202) {
        const next = new Date(now + (emit.waitMs ?? 5000)).toISOString();
        await upsertState({ cnpj: clean, status: 'aguardando', next_eligible_at: next, last_response: emit.raw });
        return { type: 'wait' as const, retryAfter: Math.ceil((emit.waitMs ?? 5000) / 1000), step: 'emitir' as const };
      }
      if (emit.status === 304) {
        const next = new Date(now + (emit.waitMs ?? 5000)).toISOString();
        await upsertState({ cnpj: clean, status: 'aguardando', next_eligible_at: next, last_response: emit.raw });
        return { type: 'wait' as const, retryAfter: Math.ceil((emit.waitMs ?? 5000) / 1000), step: 'emitir' as const };
      }
      await upsertState({ cnpj: clean, status: 'erro', last_response: emit.raw });
      throw new Error(`Falha ao emitir: status ${emit.status}`);
    }

    // 4) Solicitar protocolo (primeira vez - ainda não temos protocolo)
    console.log('[Sitf] Solicitando protocolo pela primeira vez...');
    const req = await solicitarProtocolo(clean);
    console.log('[Sitf] Protocolo obtido com sucesso, waitMs:', req.waitMs);
    const next = new Date(now + req.waitMs).toISOString();
    await upsertState({
      cnpj: clean,
      protocolo: req.protocolo,
      status: 'aguardando',
      next_eligible_at: next,
      last_response: req.raw,
    });
    return { type: 'wait' as const, retryAfter: Math.ceil(req.waitMs / 1000), step: 'protocolo' as const };
  }
}

export function base64ToBuffer(b64: string): Buffer {
  const clean = b64.includes(';base64,') ? b64.split(';base64,').pop()! : b64;
  return Buffer.from(clean, 'base64');
}


