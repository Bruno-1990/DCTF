/**
 * Serviço para integração com API da Receita Federal
 * (comprovante de pagamento, E-Processos, token)
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
}

