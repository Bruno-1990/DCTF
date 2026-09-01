/**
 * Integra Contador (SERPRO) — autenticação e transporte.
 *
 * Extraído do caminho da Situação Fiscal, que já rodava em produção contra o
 * mesmo gateway. Todo serviço do Integra Contador — SITFIS, SICALC, DCTFWeb —
 * compartilha exatamente o mesmo envelope e os mesmos dois tokens; o que muda
 * de um para o outro é só o par idSistema/idServico e o conteúdo de `dados`.
 *
 * O SituacaoFiscalOrchestrator NÃO foi migrado para cá de propósito: são 3.281
 * linhas em produção e a troca não traria nada além de risco. Quem mexer nele
 * um dia deve apagar as cópias de lá e passar a importar daqui.
 */

import axios from 'axios';

const BASE_URL =
  process.env['SERPRO_BASE_URL'] ||
  process.env['RECEITA_API_URL'] ||
  'https://gateway.apiserpro.serpro.gov.br';

/** CNPJ do escritório: é sempre ele o contratante e o autor do pedido. */
const CNPJ_ESCRITORIO = (process.env['SERPRO_CONTRATANTE_CNPJ'] || '32401481000133').replace(
  /\D/g,
  ''
);

export type EndpointIntegra = 'Apoiar' | 'Emitir' | 'Consultar' | 'Declarar' | 'Monitorar';

export interface RespostaIntegra {
  status: number;
  /** String JSON. O SERPRO devolve o payload útil serializado dentro do JSON. */
  dados?: string;
  mensagens?: Array<{ codigo: string; texto: string }>;
  [k: string]: unknown;
}

/** Erro que já carrega o que a tela precisa mostrar, sem stack de axios. */
export class IntegraContadorError extends Error {
  constructor(
    message: string,
    public readonly httpStatus?: number,
    public readonly resposta?: unknown
  ) {
    super(message);
    this.name = 'IntegraContadorError';
  }
}

/**
 * Os dois tokens: `access_token` (OAuth, vai no Authorization) e `jwt_token`
 * (procuração eletrônica, vai num header próprio). Sem o segundo o gateway
 * aceita a chamada e devolve erro de autorização no corpo — falha silenciosa
 * que já custou tempo na Situação Fiscal.
 */
export async function obterTokens(): Promise<{ accessToken: string; jwtToken: string | null }> {
  let proxyUrl = process.env['SERPRO_TOKEN_PROXY_URL'];
  if (!proxyUrl) {
    const authBase =
      process.env['RECEITA_AUTH_URL'] ||
      'https://auth-token-server-production-ce0e.up.railway.app';
    const authEndpoint = process.env['RECEITA_AUTH_ENDPOINT'] || '/serpro/token';
    proxyUrl = `${authBase}${authEndpoint}`;
  }

  try {
    const { data } = await axios.get(proxyUrl, { timeout: 20000 });
    const accessToken = data?.access_token;
    if (!accessToken) {
      throw new IntegraContadorError('O servidor de token não devolveu access_token.');
    }
    return { accessToken, jwtToken: data?.jwt_token ?? null };
  } catch (err) {
    if (err instanceof IntegraContadorError) throw err;
    if (axios.isAxiosError(err)) {
      throw new IntegraContadorError(
        `Falha ao obter o token do SERPRO (${err.response?.status ?? 'sem resposta'}). ` +
          'Verifique se o servidor de autenticação está no ar.',
        err.response?.status,
        err.response?.data
      );
    }
    throw err;
  }
}

/**
 * Headers de navegador real. Não é superstição: o gateway barra requisição sem
 * User-Agent/Origin, e o sintoma é um 403 sem corpo. Copiado do que funciona na
 * Situação Fiscal.
 */
function montarHeaders(accessToken: string, jwtToken?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    Connection: 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
    Origin: 'https://www.gov.br',
    Referer: 'https://www.gov.br/',
  };
  if (jwtToken) headers['jwt_token'] = jwtToken;
  return headers;
}

export const soDigitos = (v: unknown): string => String(v ?? '').replace(/\D/g, '');

/** 11 dígitos = CPF (tipo 1), 14 = CNPJ (tipo 2). */
export function tipoDocumento(numero: string): 1 | 2 {
  return soDigitos(numero).length === 11 ? 1 : 2;
}

/**
 * Uma chamada ao Integra Contador.
 *
 * `dados` entra como objeto e sai serializado: o SERPRO exige o campo `dados`
 * como STRING contendo JSON, não como objeto. Errar isso rende um 400 genérico.
 */
export async function chamarIntegraContador(params: {
  endpoint: EndpointIntegra;
  contribuinte: string;
  idSistema: string;
  idServico: string;
  versaoSistema: string;
  dados?: Record<string, unknown>;
  timeout?: number;
}): Promise<RespostaIntegra> {
  const { accessToken, jwtToken } = await obterTokens();

  const contribuinte = soDigitos(params.contribuinte);
  const body = {
    contratante: { numero: CNPJ_ESCRITORIO, tipo: 2 },
    autorPedidoDados: { numero: CNPJ_ESCRITORIO, tipo: 2 },
    contribuinte: { numero: contribuinte, tipo: tipoDocumento(contribuinte) },
    pedidoDados: {
      idSistema: params.idSistema,
      idServico: params.idServico,
      versaoSistema: params.versaoSistema,
      dados: params.dados ? JSON.stringify(params.dados) : '',
    },
  };

  const url = `${BASE_URL}/integra-contador/v1/${params.endpoint}`;

  console.log(`[Integra] ${params.idServico} -> ${url}`, {
    contribuinte,
    temJwt: !!jwtToken,
    dados: params.dados,
  });

  let res;
  try {
    res = await axios.post<RespostaIntegra>(url, body, {
      headers: montarHeaders(accessToken, jwtToken),
      timeout: params.timeout ?? 60000,
      // Tratamos o status no corpo: o gateway devolve 4xx com mensagem útil, e
      // deixar o axios lançar esconderia justamente essa mensagem.
      validateStatus: () => true,
    });
  } catch (err) {
    throw new IntegraContadorError(
      axios.isAxiosError(err) && err.code === 'ECONNABORTED'
        ? 'O SERPRO não respondeu no tempo limite.'
        : `Falha de rede ao chamar o SERPRO: ${(err as Error).message}`
    );
  }

  console.log(`[Integra] ${params.idServico} <- HTTP ${res.status}`, {
    statusCorpo: res.data?.status,
    mensagens: res.data?.mensagens,
  });

  if (res.status !== 200 || (res.data?.status && Number(res.data.status) !== 200)) {
    throw new IntegraContadorError(mensagemDeErro(res.status, res.data), res.status, res.data);
  }

  return res.data;
}

/**
 * As mensagens que dizem alguma coisa ao usuário.
 *
 * O Integra Contador mistura, no MESMO array, o carimbo da chamada e o motivo
 * do negócio. Conferido em 01/09/2026 pedindo uma guia de competência ainda não
 * declarada: veio HTTP 200 com
 *
 *   [Sucesso-DCTFWEB]          Requisição efetuada com sucesso.
 *   [Aviso-DCTFWEB-MSGIC01]    Houve erro de negócio. Favor verificar as demais mensagens.
 *   [Aviso-DCTFWEB-MG08]       Não foi encontrada Declaração com os dados informados.
 *
 * O "Sucesso" é sobre o transporte, não sobre o pedido — mostrá-lo esconderia o
 * MG08, que é a única linha acionável. E o MSGIC01 é literalmente "veja as
 * outras mensagens": uma instrução para quem programa, não para quem usa.
 */
export function mensagensDeNegocio(resposta: RespostaIntegra | undefined): string[] {
  return (resposta?.mensagens ?? [])
    .filter((m) => {
      const codigo = (m?.codigo ?? '').toUpperCase();
      if (codigo.includes('SUCESSO')) return false;
      if (codigo.includes('MSGIC01')) return false;
      return !!m?.texto?.trim();
    })
    .map((m) => m.texto.trim());
}

/**
 * Traduz a resposta de erro para algo acionável na tela.
 *
 * As mensagens vêm no formato `[Erro-SISTEMA-XX] texto` e o texto já é legível —
 * o trabalho aqui é não perdê-lo dentro de um "Request failed with status
 * code 400".
 */
function mensagemDeErro(httpStatus: number, corpo: RespostaIntegra | undefined): string {
  const doServidor = mensagensDeNegocio(corpo).join(' ');
  if (doServidor) return doServidor;

  if (httpStatus === 401) {
    return 'Token recusado pelo SERPRO. O access_token expirou ou é inválido.';
  }
  if (httpStatus === 403) {
    return (
      'Acesso negado pelo SERPRO. Confira se há procuração eletrônica válida do ' +
      'contribuinte para o escritório e se o contrato do Integra Contador cobre o SICALC.'
    );
  }
  if (httpStatus === 404) return 'Serviço não encontrado no gateway do SERPRO.';
  if (httpStatus >= 500) {
    return 'O SERPRO está indisponível no momento. Tente novamente em instantes.';
  }
  return `O SERPRO recusou a requisição (HTTP ${httpStatus}).`;
}

/** O payload útil vem serializado dentro de `dados`. */
export function extrairDados<T = any>(resposta: RespostaIntegra): T {
  if (!resposta?.dados) return {} as T;
  if (typeof resposta.dados !== 'string') return resposta.dados as T;
  try {
    return JSON.parse(resposta.dados) as T;
  } catch {
    throw new IntegraContadorError('O SERPRO devolveu um corpo que não é JSON válido.');
  }
}
