/**
 * Serviço para integração com API da Receita Federal
 * Consulta dados de pagamento e sincroniza com nosso sistema
 */

import axios, { AxiosInstance } from 'axios';

export interface ReceitaPagamentoRequest {
  contratante: {
    numero: string; // CNPJ (apenas números)
    tipo: number; // 2 para CNPJ
  };
  autorPedidoDados: {
    numero: string;
    tipo: number;
  };
  contribuinte: {
    numero: string;
    tipo: number;
  };
  pedidoDados: {
    idSistema: string;
    idServico: string;
    dados: string; // String JSON conforme formato da API SERPRO
  };
}

export interface ReceitaPagamentoItem {
  numeroDocumento: string;
  tipoDocumento: string;
  periodoApuracao: string; // Formato: YYYY-MM-DD
  competencia: string; // Formato: YYYY-MM
  dataArrecadacao: string; // YYYY-MM-DD
  dataVencimento: string; // YYYY-MM-DD
  codigoReceitaDoc: string;
  valorDocumento: number;
  valorSaldoDocumento: number;
  valorPrincipal: number;
  valorSaldoPrincipal: number;
  sequencial?: string;
  codigoReceitaLinha?: string;
  descricaoReceitaLinha?: string;
  periodoApuracaoLinha?: string;
  dataVencimentoLinha?: string;
  valorLinha?: number;
  valorPrincipalLinha?: number;
  valorSaldoLinha?: number;
}

export interface ReceitaPagamentoResponse {
  status: number;
  dados: ReceitaPagamentoItem[];
  mensagens?: Array<{
    codigo: string;
    texto: string;
  }>;
}

interface TokenResponse {
  access_token: string;
  jwt_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  jwt_pucomex?: string | null;
}

export class ReceitaFederalService {
  private client: AxiosInstance;
  private authClient: AxiosInstance;
  private baseURL: string;
  private authURL: string;
  private accessToken?: string;
  private jwtToken?: string;
  private tokenExpiresAt?: Date;

  constructor() {
    // URL base da API da Receita Federal (SERPRO)
    this.baseURL = process.env['RECEITA_API_URL'] || 'https://gateway.apiserpro.serpro.gov.br';
    
    // URL do servidor de autenticação (token)
    this.authURL = process.env['RECEITA_AUTH_URL'] || 'https://auth-token-server-production-ce0e.up.railway.app';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    this.authClient = axios.create({
      baseURL: this.authURL,
      timeout: 15000,
      headers: {
        'Accept': 'application/json',
      },
    });
  }

  /**
   * Obtém token de acesso do servidor de autenticação
   * SEMPRE obtém um novo token, não usa cache (garantia de token válido)
   */
  async obterToken(forceRenew: boolean = true): Promise<TokenResponse> {
    try {
      // Verificar cache apenas se não forçar renovação
      if (!forceRenew && this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date()) {
        console.log('[ReceitaFederal] Usando token em cache (válido até ' + this.tokenExpiresAt.toISOString() + ')');
        return {
          access_token: this.accessToken,
          jwt_token: this.jwtToken || '',
          token_type: 'Bearer',
          expires_in: Math.floor((this.tokenExpiresAt.getTime() - Date.now()) / 1000),
        };
      }

      console.log('[ReceitaFederal] Obtendo novo token de acesso...');
      console.log(`[ReceitaFederal] URL de autenticação: ${this.authURL}`);
      const endpoint = process.env['RECEITA_AUTH_ENDPOINT'] || '/serpro/token';
      console.log(`[ReceitaFederal] Endpoint de autenticação: ${endpoint}`);
      
      console.log(`[ReceitaFederal] Fazendo requisição para: ${this.authURL}${endpoint}`);
      const response = await this.authClient.get<TokenResponse>(endpoint);

      console.log(`[ReceitaFederal] Status da resposta de autenticação: ${response.status}`);
      
      if (response.status !== 200) {
        console.error(`[ReceitaFederal] Erro ao obter token: HTTP ${response.status}`, response.data);
        throw new Error(`Erro ao obter token: HTTP ${response.status} - ${JSON.stringify(response.data)}`);
      }

      const tokenData = response.data;

      console.log(`[ReceitaFederal] Resposta do token:`, {
        hasAccessToken: !!tokenData.access_token,
        hasJwtToken: !!tokenData.jwt_token,
        tokenType: tokenData.token_type,
        expiresIn: tokenData.expires_in,
      });

      if (!tokenData.access_token) {
        console.error(`[ReceitaFederal] Token de acesso não retornado na resposta:`, tokenData);
        throw new Error('Token de acesso não retornado na resposta da API de autenticação');
      }

      // Armazenar tokens
      this.accessToken = tokenData.access_token;
      this.jwtToken = tokenData.jwt_token;

      // Calcular expiração (usar expires_in se disponível, senão usar 1 hora)
      const expiresIn = tokenData.expires_in || 3600;
      this.tokenExpiresAt = new Date(Date.now() + (expiresIn - 60) * 1000); // -60s para margem de segurança

      console.log(`[ReceitaFederal] Token obtido com sucesso. Expira em: ${this.tokenExpiresAt.toISOString()}`);
      
      // Configurar token nos headers do cliente principal
      this.client.defaults.headers.common['Authorization'] = `Bearer ${tokenData.access_token}`;

      return tokenData;
    } catch (error) {
      console.error('[ReceitaFederal] Erro ao obter token:', error);
      
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const statusText = error.response?.statusText;
        const responseData = error.response?.data;
        
        let errorMessage = 'Erro ao obter token de acesso';
        let errorDetails: string | undefined;

        if (status === 401) {
          errorMessage = 'Erro de autenticação: Credenciais inválidas no servidor de autenticação.';
        } else if (status === 403) {
          errorMessage = 'Erro de autorização: Acesso negado ao servidor de autenticação.';
        } else if (status === 404) {
          errorMessage = 'Endpoint de autenticação não encontrado. Verifique RECEITA_AUTH_URL e RECEITA_AUTH_ENDPOINT.';
        } else if (status === 500) {
          errorMessage = 'Erro no servidor de autenticação. Tente novamente mais tarde.';
        } else if (status) {
          errorMessage = `Erro HTTP ${status}: ${statusText || 'Erro desconhecido'}`;
        }

        errorDetails = responseData?.message 
          || responseData?.error 
          || error.message;

        const fullError = new Error(`${errorMessage}${errorDetails ? ` - ${errorDetails}` : ''}`);
        (fullError as any).statusCode = status;
        (fullError as any).responseData = responseData;
        throw fullError;
      }
      
      if (error instanceof Error) {
        throw error;
      }
      
      throw new Error(`Erro desconhecido ao obter token: ${String(error)}`);
    }
  }

  /**
   * Configura token de acesso manualmente (se necessário)
   */
  setAccessToken(token: string, jwtToken?: string): void {
    this.accessToken = token;
    this.jwtToken = jwtToken;
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    // Definir expiração para 1 hora (padrão)
    this.tokenExpiresAt = new Date(Date.now() + 3600 * 1000);
  }

  /**
   * Configura certificado digital (se necessário)
   */
  configureCertificate(certPath: string, keyPath: string): void {
    // Implementar configuração de certificado SSL
    // Isso varia conforme a biblioteca usada (https, axios com cert, etc)
  }

  /**
   * Consulta pagamentos de um contribuinte
   * @param cnpj CNPJ do contribuinte (será usado no campo 'contribuinte')
   * @param dataInicial Data inicial do intervalo (formato YYYY-MM-DD)
   * @param dataFinal Data final do intervalo (formato YYYY-MM-DD)
   * @param periodoApuracao Período de apuração (formato YYYY-MM)
   */
  /**
   * Busca comprovante de pagamento por CNPJ e número do documento
   * Usa o endpoint COMPARRECADACAO72 da API SERPRO
   */
  async buscarComprovantePagamento(cnpj: string, numeroDocumento: string): Promise<any> {
    try {
      // 1. Obter token de validação
      console.log('[ReceitaFederal] Obtendo token para consulta de comprovante...');
      await this.obterToken(true);
      
      if (!this.accessToken) {
        throw new Error('Token de acesso não foi obtido. Não é possível fazer a consulta.');
      }

      // 2. Preparar CNPJs
      const cnpjContribuinte = cnpj.replace(/\D/g, '');
      
      if (cnpjContribuinte.length !== 14) {
        throw new Error('CNPJ inválido. Deve conter 14 dígitos.');
      }

      const cnpjContratanteFixo = process.env['RECEITA_CNPJ_CONTRATANTE'] || '32401481000133';
      const cnpjAutorPedidoFixo = process.env['RECEITA_CNPJ_AUTOR_PEDIDO'] || '32401481000133';
      
      const cnpjContratante = cnpjContratanteFixo.replace(/\D/g, '');
      const cnpjAutorPedido = cnpjAutorPedidoFixo.replace(/\D/g, '');

      // 3. Construir payload para COMPARRECADACAO72
      // Formato: {"numeroDocumento": "XXXXXXXXXXXXXX"}
      const numeroDocumentoLimpo = numeroDocumento.replace(/\D/g, ''); // Apenas números
      const dadosObjeto = {
        numeroDocumento: numeroDocumentoLimpo,
      };

      const dadosString = JSON.stringify(dadosObjeto);
      
      console.log(`[ReceitaFederal] Número do documento (limpo): ${numeroDocumentoLimpo}`);
      console.log(`[ReceitaFederal] Dados stringificados: ${dadosString}`);

      const request: ReceitaPagamentoRequest = {
        contratante: {
          numero: cnpjContratante,
          tipo: 2,
        },
        autorPedidoDados: {
          numero: cnpjAutorPedido,
          tipo: 2,
        },
        contribuinte: {
          numero: cnpjContribuinte,
          tipo: 2,
        },
        pedidoDados: {
          idSistema: process.env['RECEITA_ID_SISTEMA'] || 'PAGTOWEB',
          idServico: process.env['RECEITA_ID_SERVICO_COMPROVANTE'] || 'COMPARRECADACAO72',
          dados: dadosString,
        },
      };

      // 4. Fazer requisição
      // Endpoint correto para emitir/buscar comprovante: /integra-contador/v1/Emitir
      const endpoint = process.env['RECEITA_API_ENDPOINT_COMPROVANTE'] || '/integra-contador/v1/Emitir';
      
      console.log(`[ReceitaFederal] Consultando comprovante para CNPJ: ${cnpjContribuinte}, Documento: ${numeroDocumento}`);
      console.log(`[ReceitaFederal] Endpoint: ${this.baseURL}${endpoint}`);
      console.log(`[ReceitaFederal] Payload:`, JSON.stringify(request, null, 2));

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
      };

      if (this.jwtToken) {
        headers['jwt_token'] = this.jwtToken;
      }

      if (process.env['RECEITA_API_KEY']) {
        headers['X-API-Key'] = process.env['RECEITA_API_KEY'];
      }

      const response = await this.client.post<any>(
        endpoint,
        request,
        {
          headers,
          timeout: parseInt(process.env['RECEITA_API_TIMEOUT'] || '60000'),
        }
      );

      console.log(`[ReceitaFederal] Status da resposta (comprovante): ${response.status}`);
      console.log(`[ReceitaFederal] Estrutura da resposta:`, {
        status: response.status,
        hasData: !!response.data,
        dataKeys: response.data ? Object.keys(response.data) : [],
      });
      
      // O endpoint /Emitir pode retornar diferentes status:
      // 200: PDF pronto (base64)
      // 202: Em processamento
      // 304: Not Modified (ainda processando)
      
      if (response.status === 202) {
        // Em processamento - retornar informação para o usuário aguardar
        const mensagens = response.data?.mensagens || [];
        const tempoMsg = mensagens.find((m: any) => 
          String(m.texto || '').toLowerCase().includes('processamento') ||
          String(m.texto || '').toLowerCase().includes('aguarde')
        );
        throw new Error('Comprovante em processamento. Aguarde alguns instantes e tente novamente.');
      }
      
      if (response.status === 304) {
        // Not Modified - ainda processando
        throw new Error('Comprovante ainda está sendo processado. Tente novamente em alguns instantes.');
      }
      
      if (response.status === 200 && response.data) {
        // Verificar se a resposta contém PDF base64
        const responseData = response.data;
        
        // Seguir o mesmo padrão usado em SituacaoFiscalOrchestrator para extrair PDF
        let pdfBase64: string | null = null;
        
        // Tentar extrair de diferentes estruturas possíveis
        if (typeof responseData.dados === 'string') {
          const dadosStr = responseData.dados.trim();
          
          // Tentar parsear como JSON primeiro
          try {
            const dadosParsed = JSON.parse(dadosStr);
            pdfBase64 = dadosParsed?.pdf || dadosParsed?.base64 || dadosParsed?.conteudo;
            console.log('[ReceitaFederal] PDF extraído de string JSON parseada:', pdfBase64 ? `SIM (${pdfBase64.substring(0, 50)}...)` : 'NÃO');
          } catch (parseErr) {
            // Se não for JSON válido, verificar se é base64 direto
            // Base64 geralmente tem caracteres alfanuméricos, +, /, = e é bem longo
            const isBase64Like = /^[A-Za-z0-9+/=]+$/.test(dadosStr) && dadosStr.length > 100;
            if (isBase64Like) {
              pdfBase64 = dadosStr;
              console.log('[ReceitaFederal] PDF extraído como base64 direto (não JSON)');
            } else {
              console.warn('[ReceitaFederal] Dados não é JSON válido nem parece base64:', dadosStr.substring(0, 100));
            }
          }
        } else if (responseData.dados && typeof responseData.dados === 'object') {
          // Se dados é um objeto, extrair diretamente
          pdfBase64 = responseData.dados.pdf || 
                     responseData.dados.base64 || 
                     responseData.dados.conteudo || 
                     responseData.dados.arquivo;
          console.log('[ReceitaFederal] PDF extraído de objeto dados:', pdfBase64 ? `SIM` : 'NÃO');
        } else if (responseData.pdf) {
          pdfBase64 = typeof responseData.pdf === 'string' ? responseData.pdf : responseData.pdf.conteudo;
        } else if (responseData.base64) {
          pdfBase64 = responseData.base64;
        } else if (responseData.conteudo) {
          pdfBase64 = responseData.conteudo;
        } else if (responseData.arquivo) {
          pdfBase64 = typeof responseData.arquivo === 'string' ? responseData.arquivo : responseData.arquivo.conteudo;
        }
        
        if (!pdfBase64) {
          // Verificar se há mensagens indicando processamento
          const mensagens: any[] = responseData?.mensagens || [];
          const processandoMsg = mensagens.find((m: any) => 
            String(m.texto || '').toLowerCase().includes('processamento') ||
            String(m.texto || '').toLowerCase().includes('aguarde') ||
            String(m.codigo || '').toLowerCase().includes('aviso')
          );
          
          if (processandoMsg) {
            throw new Error('Comprovante em processamento. Aguarde alguns instantes e tente novamente.');
          }
          
          console.warn('[ReceitaFederal] PDF base64 não encontrado na resposta. Estrutura completa:', JSON.stringify(responseData, null, 2));
          throw new Error('PDF base64 não encontrado na resposta da Receita Federal. Verifique os logs para mais detalhes.');
        }
        
        // Validar que o base64 parece ser um PDF válido
        try {
          // Decodificar uma pequena parte para verificar se é PDF
          const pdfHeader = Buffer.from(pdfBase64.substring(0, Math.min(100, pdfBase64.length)), 'base64').toString('utf-8');
          const isValidPdf = pdfHeader.includes('%PDF') || pdfBase64.length > 1000;
          
          if (!isValidPdf && pdfBase64.length < 100) {
            console.warn('[ReceitaFederal] PDF base64 parece muito curto ou inválido. Tamanho:', pdfBase64.length);
          }
        } catch (e) {
          console.warn('[ReceitaFederal] Erro ao validar PDF base64:', e);
        }
        
        console.log(`[ReceitaFederal] PDF base64 encontrado (tamanho: ${pdfBase64.length} caracteres)`);
        
        return {
          pdfBase64,
          numeroDocumento: numeroDocumentoLimpo,
          cnpj: cnpjContribuinte,
          formato: 'base64',
        };
      } else {
        throw new Error(`Erro ao buscar comprovante: Status ${response.status}`);
      }
    } catch (error: any) {
      console.error('[ReceitaFederal] Erro ao buscar comprovante:', error);
      if (error.response) {
        console.error('[ReceitaFederal] Resposta de erro:', error.response.data);
        throw new Error(`Erro ao buscar comprovante: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Consulta processos eletrônicos (E-Processos) por CNPJ
   * Usa o serviço CONSPROCPORINTER271 da API SERPRO
   */
  async consultarEProcessos(cnpj: string): Promise<any> {
    try {
      // 1. Obter token de validação
      console.log('[ReceitaFederal] Obtendo token para consulta de E-Processos...');
      await this.obterToken(true);
      
      if (!this.accessToken) {
        throw new Error('Token de acesso não foi obtido. Não é possível fazer a consulta.');
      }

      // 2. Preparar CNPJs
      const cnpjContribuinte = cnpj.replace(/\D/g, '');
      
      if (cnpjContribuinte.length !== 14) {
        throw new Error('CNPJ inválido. Deve conter 14 dígitos.');
      }

      const cnpjContratanteFixo = process.env['RECEITA_CNPJ_CONTRATANTE'] || '32401481000133';
      const cnpjAutorPedidoFixo = process.env['RECEITA_CNPJ_AUTOR_PEDIDO'] || '32401481000133';
      
      const cnpjContratante = cnpjContratanteFixo.replace(/\D/g, '');
      const cnpjAutorPedido = cnpjAutorPedidoFixo.replace(/\D/g, '');

      // 3. Construir payload para CONSPROCPORINTER271
      // dados deve ser um objeto JSON vazio stringificado
      const dadosString = JSON.stringify({});

      const request: ReceitaPagamentoRequest = {
        contratante: {
          numero: cnpjContratante,
          tipo: 2,
        },
        autorPedidoDados: {
          numero: cnpjAutorPedido,
          tipo: 2,
        },
        contribuinte: {
          numero: cnpjContribuinte,
          tipo: 2,
        },
        pedidoDados: {
          idSistema: 'EPROCESSO',
          idServico: 'CONSPROCPORINTER271',
          dados: dadosString,
        },
      };

      // Adicionar versaoSistema se necessário (pode estar no pedidoDados ou no nível superior)
      // Vou adicionar como propriedade adicional no request
      const requestWithVersion: any = {
        ...request,
        pedidoDados: {
          ...request.pedidoDados,
          versaoSistema: '2.0',
        },
      };

      // 4. Fazer requisição
      const endpoint = process.env['RECEITA_API_ENDPOINT'] || '/integra-contador/v1/Consultar';
      
      console.log(`[ReceitaFederal] Consultando E-Processos para CNPJ: ${cnpjContribuinte}`);
      console.log(`[ReceitaFederal] Endpoint: ${this.baseURL}${endpoint}`);
      console.log(`[ReceitaFederal] Payload:`, JSON.stringify(requestWithVersion, null, 2));

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
      };

      if (this.jwtToken) {
        headers['jwt_token'] = this.jwtToken;
      }

      if (process.env['RECEITA_API_KEY']) {
        headers['X-API-Key'] = process.env['RECEITA_API_KEY'];
      }

      const response = await this.client.post<any>(
        endpoint,
        requestWithVersion,
        {
          headers,
          timeout: parseInt(process.env['RECEITA_API_TIMEOUT'] || '60000'),
        }
      );

      console.log(`[ReceitaFederal] Status da resposta (E-Processos): ${response.status}`);
      console.log(`[ReceitaFederal] Estrutura da resposta:`, {
        status: response.status,
        hasData: !!response.data,
        dataKeys: response.data ? Object.keys(response.data) : [],
      });
      
      // Log detalhado da resposta para debug
      if (response.data) {
        console.log(`[ReceitaFederal] Resposta completa (primeiros 500 chars):`, JSON.stringify(response.data).substring(0, 500));
        
        // Processar os dados: a API retorna 'dados' como string JSON que contém um array de strings JSON
        if (response.data.dados) {
          console.log(`[ReceitaFederal] Tipo de 'dados':`, typeof response.data.dados);
          
          let processosArray: any[] = [];
          
          if (typeof response.data.dados === 'string') {
            console.log(`[ReceitaFederal] 'dados' é string, parseando JSON...`);
            try {
              const parsed = JSON.parse(response.data.dados);
              console.log(`[ReceitaFederal] 'dados' parseado. Tipo:`, Array.isArray(parsed) ? 'array' : typeof parsed);
              
              if (Array.isArray(parsed)) {
                console.log(`[ReceitaFederal] Array parseado tem ${parsed.length} itens`);
                
                // Cada item do array pode ser uma string JSON que precisa ser parseada
                processosArray = parsed.map((item: any, index: number) => {
                  if (typeof item === 'string') {
                    try {
                      const itemParsed = JSON.parse(item);
                      console.log(`[ReceitaFederal] Item ${index} parseado com sucesso`);
                      return itemParsed;
                    } catch (e) {
                      console.warn(`[ReceitaFederal] Erro ao parsear item ${index}:`, e);
                      return item; // Retornar string original se não conseguir parsear
                    }
                  } else if (typeof item === 'object' && item !== null) {
                    // Já é um objeto, retornar diretamente
                    return item;
                  } else {
                    return item;
                  }
                });
                
                console.log(`[ReceitaFederal] Total de processos parseados: ${processosArray.length}`);
              } else if (typeof parsed === 'object' && parsed !== null) {
                // Se parseado resultou em objeto, pode ter um array dentro
                if (Array.isArray(parsed.Dados)) {
                  processosArray = parsed.Dados;
                } else if (Array.isArray(parsed.dados)) {
                  processosArray = parsed.dados;
                } else {
                  // Se for um único objeto, colocar em array
                  processosArray = [parsed];
                }
              }
            } catch (e) {
              console.error(`[ReceitaFederal] Erro ao parsear 'dados' como JSON:`, e);
            }
          } else if (Array.isArray(response.data.dados)) {
            // Se já é um array direto
            processosArray = response.data.dados.map((item: any) => {
              if (typeof item === 'string') {
                try {
                  return JSON.parse(item);
                } catch (e) {
                  return item;
                }
              }
              return item;
            });
          } else if (typeof response.data.dados === 'object') {
            // Se é objeto, verificar se tem array dentro
            if (Array.isArray(response.data.dados.Dados)) {
              processosArray = response.data.dados.Dados;
            } else if (Array.isArray(response.data.dados.dados)) {
              processosArray = response.data.dados.dados;
            }
          }
          
          // Substituir o campo 'dados' com o array parseado
          response.data.dados = processosArray;
          response.data.Dados = processosArray; // Também adicionar em maiúscula para compatibilidade
        }
      }
      
      if (response.status === 200 && response.data) {
        return response.data;
      } else {
        throw new Error(`Erro ao consultar E-Processos: Status ${response.status}`);
      }
    } catch (error: any) {
      console.error('[ReceitaFederal] Erro ao consultar E-Processos:', error);
      if (error.response) {
        console.error('[ReceitaFederal] Resposta de erro:', error.response.data);
        throw new Error(`Erro ao consultar E-Processos: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  async consultarPagamentos(
    cnpj: string,
    dataInicial?: string,
    dataFinal?: string,
    periodoApuracao?: string
  ): Promise<ReceitaPagamentoItem[]> {
    try {
      // ============================================================
      // PASSO 1: SEMPRE obter token de validação PRIMEIRO
      // ============================================================
      // A ordem OBRIGATÓRIA é:
      // 1. Obter token de validação (obterToken)
      // 2. Depois fazer a consulta na Receita Federal
      // 
      // NÃO fazer a consulta antes de obter o token!
      // ============================================================
      console.log('[ReceitaFederal] PASSO 1: Obtendo token de validação...');
      await this.obterToken(true); // Sempre forçar novo token (forceRenew = true)
      
      // Verificar se o token foi obtido com sucesso
      if (!this.accessToken) {
        throw new Error('Token de acesso não foi obtido. Não é possível fazer a consulta.');
      }
      
      console.log('[ReceitaFederal] Token obtido com sucesso. Prosseguindo com PASSO 2: Consulta na Receita Federal...');

      // ============================================================
      // PASSO 2: Preparar CNPJs para a requisição
      // ============================================================
      // IMPORTANTE sobre os CNPJs no body da requisição:
      // - contratante: CNPJ ESTÁTICO (32401481000133 ou variável de ambiente)
      // - autorPedidoDados: CNPJ ESTÁTICO (32401481000133 ou variável de ambiente)
      // - contribuinte: CNPJ DINÂMICO (o CNPJ que está sendo consultado/iterado)
      // 
      // Os 2 primeiros campos (contratante e autorPedidoDados) são ESTÁTICOS.
      // Apenas o campo contribuinte varia dinamicamente.
      // ============================================================
      
      // Limpar CNPJ do contribuinte (apenas números) - será usado no campo 'contribuinte'
      const cnpjContribuinte = cnpj.replace(/\D/g, '');

      // Validar CNPJ do contribuinte
      if (cnpjContribuinte.length !== 14) {
        throw new Error('CNPJ inválido. Deve conter 14 dígitos.');
      }

      // CNPJs FIXOS (ESTÁTICOS) para contratante e autorPedidoDados
      // SEMPRE usar o CNPJ fixo 32401481000133 (ou da variável de ambiente se configurada)
      // NUNCA usar o CNPJ do contribuinte nestes campos
      const cnpjContratanteFixo = process.env['RECEITA_CNPJ_CONTRATANTE'] || '32401481000133';
      const cnpjAutorPedidoFixo = process.env['RECEITA_CNPJ_AUTOR_PEDIDO'] || '32401481000133';
      
      const cnpjContratante = cnpjContratanteFixo.replace(/\D/g, '');
      const cnpjAutorPedido = cnpjAutorPedidoFixo.replace(/\D/g, '');

      // Validar CNPJs fixos
      if (cnpjContratante.length !== 14) {
        throw new Error('CNPJ do contratante inválido. Deve conter 14 dígitos.');
      }
      if (cnpjAutorPedido.length !== 14) {
        throw new Error('CNPJ do autor do pedido inválido. Deve conter 14 dígitos.');
      }

      // Construir objeto de dados primeiro
      const dadosObjeto: any = {
        primeiroDaPagina: 0,
        tamanhoDaPagina: parseInt(process.env['RECEITA_TAMANHO_PAGINA'] || '100'),
      };

      // Adicionar filtros opcionais (variáveis)
      if (dataInicial && dataFinal) {
        dadosObjeto.intervaloDataArrecadacao = {
          dataInicial,
          dataFinal,
        };
      }

      if (periodoApuracao) {
        // Garantir formato YYYY-MM
        const periodoFormatado = periodoApuracao.replace(/-/g, '-').substring(0, 7);
        dadosObjeto.periodoApuracao = periodoFormatado;
      }

      // Converter dados para string JSON (formato exigido pela API SERPRO)
      const dadosString = JSON.stringify(dadosObjeto);

      // Construir payload da requisição conforme estrutura da Receita
      // IMPORTANTE: O CNPJ iterado é usado APENAS no campo 'contribuinte'
      const request: ReceitaPagamentoRequest = {
        contratante: {
          numero: cnpjContratante, // CNPJ ESTÁTICO (fixo: 32401481000133)
          tipo: 2, // CNPJ
        },
        autorPedidoDados: {
          numero: cnpjAutorPedido, // CNPJ ESTÁTICO (fixo: 32401481000133)
          tipo: 2,
        },
        contribuinte: {
          numero: cnpjContribuinte, // CNPJ DINÂMICO (varia conforme a iteração)
          tipo: 2,
        },
        pedidoDados: {
          idSistema: process.env['RECEITA_ID_SISTEMA'] || 'PAGTOWEB',
          idServico: process.env['RECEITA_ID_SERVICO'] || 'PAGAMENTOS71',
          dados: dadosString, // String JSON conforme formato da API SERPRO
        },
      };

      // Fazer requisição
      // Endpoint da API SERPRO da Receita Federal
      const endpoint = process.env['RECEITA_API_ENDPOINT'] || '/integra-contador/v1/Consultar';
      
      // Garantir que temos o token antes de fazer a requisição
      if (!this.accessToken) {
        throw new Error('Token de acesso não disponível. Execute obterToken() primeiro.');
      }

      // Armazenar endpoint em variável de escopo superior para uso no catch
      const apiEndpoint = endpoint;
      
      console.log(`[ReceitaFederal] PASSO 2: Consultando pagamentos na Receita Federal`);
      console.log(`[ReceitaFederal] CNPJ Contratante (ESTÁTICO): ${cnpjContratante}`);
      console.log(`[ReceitaFederal] CNPJ Autor Pedido (ESTÁTICO): ${cnpjAutorPedido}`);
      console.log(`[ReceitaFederal] CNPJ Contribuinte (DINÂMICO): ${cnpjContribuinte}`);
      console.log(`[ReceitaFederal] Endpoint: ${this.baseURL}${endpoint}`);
      console.log(`[ReceitaFederal] Token disponível: ${this.accessToken ? 'Sim' : 'Não'}`);
      console.log(`[ReceitaFederal] JWT Token disponível: ${this.jwtToken ? 'Sim' : 'Não'}`);
      console.log(`[ReceitaFederal] Payload:`, JSON.stringify(request, null, 2));

      // Construir headers com autenticação
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`, // SEMPRE incluir Authorization
      };

      // Adicionar JWT token se disponível
      if (this.jwtToken) {
        headers['jwt_token'] = this.jwtToken;
      }

      // Adicionar API Key se configurada
      if (process.env['RECEITA_API_KEY']) {
        headers['X-API-Key'] = process.env['RECEITA_API_KEY'];
      }

      console.log(`[ReceitaFederal] Headers da requisição:`, {
        'Content-Type': headers['Content-Type'],
        'Accept': headers['Accept'],
        'Authorization': headers['Authorization'] ? 'Bearer ***' : 'NÃO DEFINIDO',
        'jwt_token': headers['jwt_token'] ? '***' : 'NÃO DEFINIDO',
        'X-API-Key': headers['X-API-Key'] ? '***' : 'NÃO DEFINIDO',
      });

      const response = await this.client.post<any>(
        endpoint,
        request,
        {
          headers,
          timeout: parseInt(process.env['RECEITA_API_TIMEOUT'] || '60000'), // 60s padrão
        }
      );

      console.log(`[ReceitaFederal] Status da resposta: ${response.status}`);
      console.log(`[ReceitaFederal] Estrutura da resposta:`, {
        status: response.data?.status,
        hasDados: !!response.data?.dados,
        dadosType: typeof response.data?.dados,
        mensagens: response.data?.mensagens,
      });
      
      // Log completo da resposta para debug (primeiros 2 itens se for array)
      if (response.data?.dados) {
        const dadosDebug = typeof response.data.dados === 'string' 
          ? JSON.parse(response.data.dados) 
          : response.data.dados;
        
        if (Array.isArray(dadosDebug) && dadosDebug.length > 0) {
          console.log(`[ReceitaFederal] Primeiro item da resposta (completo):`, JSON.stringify(dadosDebug[0], null, 2));
          if (dadosDebug.length > 1) {
            console.log(`[ReceitaFederal] Segundo item da resposta (completo):`, JSON.stringify(dadosDebug[1], null, 2));
          }
        } else if (dadosDebug && typeof dadosDebug === 'object') {
          console.log(`[ReceitaFederal] Resposta completa (objeto):`, JSON.stringify(dadosDebug, null, 2));
        }
      }

      // Verificar status HTTP da resposta
      if (response.status !== 200) {
        throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
      }

      // Verificar status na resposta (se presente)
      if (response.data?.status && response.data.status !== 200) {
        const mensagemErro = response.data.mensagens?.[0]?.texto || 'Erro desconhecido';
        const codigoErro = response.data.mensagens?.[0]?.codigo || 'ERRO_DESCONHECIDO';
        throw new Error(`Erro na API da Receita [${codigoErro}]: ${mensagemErro}`);
      }

      // Tratar resposta - pode vir como string JSON ou objeto
      let dados: any = response.data?.dados;
      
      // Se dados vier como string JSON, fazer parse
      if (typeof dados === 'string') {
        try {
          dados = JSON.parse(dados);
          console.log(`[ReceitaFederal] Dados parseados de string JSON`);
        } catch (parseError) {
          console.error(`[ReceitaFederal] Erro ao fazer parse do JSON:`, parseError);
          throw new Error('Erro ao processar resposta da Receita: dados JSON inválidos');
        }
      }

      // Se dados é um array, processar diretamente
      if (Array.isArray(dados)) {
        console.log(`[ReceitaFederal] Retornando ${dados.length} pagamentos encontrados`);
        // Log do primeiro item para debug dos valores
        if (dados.length > 0) {
          console.log(`[ReceitaFederal] Estrutura do primeiro item:`, JSON.stringify(dados[0], null, 2));
        }
        return this.processarItensPagamento(dados);
      }

      // Se dados é um objeto, procurar array de itens dentro
      if (dados && typeof dados === 'object') {
        // Tentar diferentes estruturas comuns
        if (Array.isArray(dados.itens)) {
          console.log(`[ReceitaFederal] Encontrado array em 'itens': ${dados.itens.length} itens`);
          return this.processarItensPagamento(dados.itens);
        }
        if (Array.isArray(dados.items)) {
          console.log(`[ReceitaFederal] Encontrado array em 'items': ${dados.items.length} itens`);
          return this.processarItensPagamento(dados.items);
        }
        if (Array.isArray(dados.dados)) {
          console.log(`[ReceitaFederal] Encontrado array em 'dados': ${dados.dados.length} itens`);
          return this.processarItensPagamento(dados.dados);
        }
        if (Array.isArray(dados.pagamentos)) {
          console.log(`[ReceitaFederal] Encontrado array em 'pagamentos': ${dados.pagamentos.length} itens`);
          return this.processarItensPagamento(dados.pagamentos);
        }

        // Se não encontrou array, mas há propriedades que parecem itens
        console.warn(`[ReceitaFederal] Estrutura de resposta não reconhecida:`, Object.keys(dados));
      }

      console.warn(`[ReceitaFederal] Nenhum dado de pagamento encontrado na resposta`);
      return [];
    } catch (error) {
      console.error(`[ReceitaFederal] Erro na consulta de pagamentos:`, error);
      
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const statusText = error.response?.statusText;
        const responseData = error.response?.data;
        
        let errorMessage = 'Erro ao consultar Receita Federal';
        let errorDetails: string | undefined;

        // Mensagens específicas por status HTTP
        if (status === 401) {
          errorMessage = 'Erro de autenticação: Token inválido ou expirado. O sistema tentará obter um novo token.';
          errorDetails = 'O token de acesso pode ter expirado ou ser inválido.';
        } else if (status === 403) {
          errorMessage = 'Erro de autorização: Acesso negado à API da Receita Federal.';
          errorDetails = 'Verifique as permissões e credenciais configuradas.';
        } else if (status === 404) {
          errorMessage = 'Endpoint não encontrado. Verifique RECEITA_API_URL e RECEITA_API_ENDPOINT.';
          const apiEndpoint = process.env['RECEITA_API_ENDPOINT'] || '/integra-contador/v1/Consultar';
          errorDetails = `URL: ${this.baseURL}${apiEndpoint}`;
        } else if (status === 429) {
          errorMessage = 'Muitas requisições: Limite de rate limiting atingido. Aguarde antes de tentar novamente.';
          errorDetails = 'A API da Receita Federal tem limites de requisições por minuto.';
        } else if (status === 500 || status === 502 || status === 503 || status === 504) {
          errorMessage = `Erro no servidor da Receita Federal: ${status} ${statusText || 'Erro do servidor'}`;
          errorDetails = 'O servidor da Receita Federal está temporariamente indisponível. Tente novamente mais tarde.';
        } else if (status) {
          errorMessage = `Erro HTTP ${status}: ${statusText || 'Erro desconhecido'}`;
        }

        // Tentar extrair mensagem da resposta da API
        const apiMessage = responseData?.mensagens?.[0]?.texto 
          || responseData?.message 
          || responseData?.error
          || error.message;

        if (apiMessage && apiMessage !== error.message) {
          errorDetails = `${errorDetails ? errorDetails + ' ' : ''}Mensagem da API: ${apiMessage}`;
        }

        // Log detalhado para debug
        const apiEndpoint = process.env['RECEITA_API_ENDPOINT'] || '/integra-contador/v1/Consultar';
        console.error(`[ReceitaFederal] Detalhes do erro:`, {
          status,
          statusText,
          message: errorMessage,
          details: errorDetails,
          responseData: responseData ? JSON.stringify(responseData, null, 2) : 'N/A',
          url: `${this.baseURL}${apiEndpoint}`,
          cnpjContribuinte: cnpj.replace(/\D/g, '').substring(0, 8) + '***',
        });

        const fullError = new Error(`${errorMessage}${errorDetails ? ` - ${errorDetails}` : ''}`);
        (fullError as any).statusCode = status;
        (fullError as any).responseData = responseData;
        (fullError as any).apiMessage = apiMessage;
        throw fullError;
      }
      
      // Se o erro já é uma instância de Error com informações, propagar
      if (error instanceof Error) {
        console.error(`[ReceitaFederal] Erro propagado:`, {
          message: error.message,
          name: error.name,
          stack: error.stack,
        });
        throw error;
      }
      
      // Erro desconhecido
      console.error(`[ReceitaFederal] Erro desconhecido:`, error);
      throw new Error(`Erro desconhecido ao consultar Receita Federal: ${String(error)}`);
    }
  }

  /**
   * Processa array de itens de pagamento da Receita
   * Adaptado da lógica do n8n para tratar desmembramentos corretamente
   */
  private processarItensPagamento(items: any[]): ReceitaPagamentoItem[] {
    const saida: ReceitaPagamentoItem[] = [];

    for (const doc of items) {
      if (!doc || typeof doc !== 'object') continue;

      // Criar objeto base com dados do documento
      const base: ReceitaPagamentoItem = {
        numeroDocumento: doc.numeroDocumento || '',
        tipoDocumento: doc.tipo?.descricaoAbreviada || doc.tipo?.descricao || '',
        periodoApuracao: doc.periodoApuracao ? String(doc.periodoApuracao).slice(0, 10) : '',
        competencia: doc.periodoApuracao ? String(doc.periodoApuracao).slice(0, 7) : '',
        dataArrecadacao: doc.dataArrecadacao ? String(doc.dataArrecadacao).slice(0, 10) : '',
        dataVencimento: doc.dataVencimento ? String(doc.dataVencimento).slice(0, 10) : '',
        codigoReceitaDoc: doc.receitaPrincipal?.codigo || '',
        valorDocumento: parseFloat(doc.valorTotal || 0),
        valorSaldoDocumento: parseFloat(doc.valorSaldoTotal || 0),
        valorPrincipal: parseFloat(doc.valorPrincipal || 0),
        valorSaldoPrincipal: parseFloat(doc.valorSaldoPrincipal || 0),
        sequencial: undefined,
        codigoReceitaLinha: undefined,
        descricaoReceitaLinha: undefined,
        periodoApuracaoLinha: undefined,
        dataVencimentoLinha: undefined,
        valorLinha: undefined,
        valorPrincipalLinha: undefined,
        valorSaldoLinha: undefined,
      };

      // Se houver desmembramentos, criar uma linha para cada desmembramento
      if (Array.isArray(doc.desmembramentos) && doc.desmembramentos.length > 0) {
        for (const d of doc.desmembramentos) {
          saida.push({
            ...base,
            sequencial: d.sequencial?.toString() || undefined,
            codigoReceitaLinha: d.receitaPrincipal?.codigo || '',
            descricaoReceitaLinha: d.receitaPrincipal?.descricao || '',
            periodoApuracaoLinha: d.periodoApuracao ? String(d.periodoApuracao).slice(0, 10) : undefined,
            dataVencimentoLinha: d.dataVencimento ? String(d.dataVencimento).slice(0, 10) : undefined,
            valorLinha: parseFloat(d.valorTotal || 0),
            valorPrincipalLinha: parseFloat(d.valorPrincipal || 0),
            valorSaldoLinha: parseFloat(d.valorSaldoTotal || 0),
          });
        }
      } else {
        // Se não houver desmembramentos, adicionar apenas o documento base
        saida.push(base);
      }
    }

    return saida;
  }

  /**
   * Mapeia item bruto da Receita para nosso formato padronizado
   * MÉTODO LEGADO - Mantido para compatibilidade, mas o processamento
   * real agora é feito em processarItensPagamento()
   * @deprecated Use processarItensPagamento() que trata desmembramentos corretamente
   */
  private mapearItemReceita(item: any): ReceitaPagamentoItem {
    // Este método ainda é usado em alguns lugares, então mantemos compatibilidade
    // Mas o processamento principal deve usar processarItensPagamento()
    
    const base = {
      numeroDocumento: item.numeroDocumento || '',
      tipoDocumento: item.tipo?.descricaoAbreviada || item.tipo?.descricao || item.tipoDocumento || '',
      periodoApuracao: item.periodoApuracao ? String(item.periodoApuracao).slice(0, 10) : '',
      competencia: item.periodoApuracao ? String(item.periodoApuracao).slice(0, 7) : (item.competencia || ''),
      dataArrecadacao: item.dataArrecadacao ? String(item.dataArrecadacao).slice(0, 10) : '',
      dataVencimento: item.dataVencimento ? String(item.dataVencimento).slice(0, 10) : '',
      codigoReceitaDoc: item.receitaPrincipal?.codigo || item.codigoReceitaDoc || '',
      valorDocumento: parseFloat(item.valorTotal || item.valorDocumento || 0),
      valorSaldoDocumento: parseFloat(item.valorSaldoTotal || item.valorSaldoDocumento || 0),
      valorPrincipal: parseFloat(item.valorPrincipal || 0),
      valorSaldoPrincipal: parseFloat(item.valorSaldoPrincipal || 0),
      sequencial: item.sequencial?.toString() || undefined,
      codigoReceitaLinha: item.codigoReceitaLinha || item.receitaPrincipal?.codigo || undefined,
      descricaoReceitaLinha: item.descricaoReceitaLinha || item.receitaPrincipal?.descricao || undefined,
      periodoApuracaoLinha: item.periodoApuracaoLinha ? String(item.periodoApuracaoLinha).slice(0, 10) : undefined,
      dataVencimentoLinha: item.dataVencimentoLinha ? String(item.dataVencimentoLinha).slice(0, 10) : undefined,
      valorLinha: item.valorLinha !== undefined ? parseFloat(item.valorLinha || item.valorTotal || 0) : undefined,
      valorPrincipalLinha: item.valorPrincipalLinha !== undefined ? parseFloat(item.valorPrincipalLinha || 0) : undefined,
      valorSaldoLinha: item.valorSaldoLinha !== undefined ? parseFloat(item.valorSaldoLinha || item.valorSaldoTotal || 0) : undefined,
    };

    return base;
  }

  /**
   * Mapeia dados da Receita para formato do nosso sistema
   */
  mapearParaSistemaPagamento(item: ReceitaPagamentoItem): {
    statusPagamento: 'pago' | 'parcelado' | 'pendente';
    dataPagamento: string;
    comprovantePagamento: string;
    observacoesPagamento?: string;
    periodoApuracao: string; // YYYY-MM
    valorPago: number;
    valorSaldo: number;
  } {
    const statusPagamento: 'pago' | 'parcelado' | 'pendente' = 
      item.valorSaldoDocumento === 0 
        ? 'pago' 
        : item.valorSaldoDocumento < item.valorDocumento 
          ? 'parcelado' 
          : 'pendente';

    // Converter período de apuração (YYYY-MM-DD) para YYYY-MM
    const periodoApuracao = item.competencia || item.periodoApuracao.substring(0, 7);

    return {
      statusPagamento,
      dataPagamento: item.dataArrecadacao || item.dataVencimento,
      comprovantePagamento: item.numeroDocumento,
      observacoesPagamento: `Sincronizado automaticamente da Receita Federal. Tipo: ${item.tipoDocumento}`,
      periodoApuracao,
      valorPago: item.valorDocumento - item.valorSaldoDocumento,
      valorSaldo: item.valorSaldoDocumento,
    };
  }

  /**
   * Busca pagamentos paginados
   */
  async consultarPagamentosPaginados(
    cnpj: string,
    pagina: number = 0,
    tamanhoPagina: number = 100,
    filtros?: {
      dataInicial?: string;
      dataFinal?: string;
      periodoApuracao?: string;
    }
  ): Promise<{
    items: ReceitaPagamentoItem[];
    total: number;
    pagina: number;
    tamanhoPagina: number;
  }> {
    const items = await this.consultarPagamentos(
      cnpj,
      filtros?.dataInicial,
      filtros?.dataFinal,
      filtros?.periodoApuracao
    );

    // Aplicar paginação localmente (ou ajustar se a API suportar paginação)
    const inicio = pagina * tamanhoPagina;
    const fim = inicio + tamanhoPagina;
    const itemsPaginados = items.slice(inicio, fim);

    return {
      items: itemsPaginados,
      total: items.length,
      pagina,
      tamanhoPagina,
    };
  }
}

