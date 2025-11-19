/**
 * Serviço para identificar clientes sem DCTF no mês vigente
 * 
 * Conforme legislação:
 * - IN RFB 2.237/2024: Disciplina a DCTFWeb
 * - IN RFB 2.267/2025: Regras complementares
 * - IN RFB 2.248/2025: Altera prazos de entrega
 * 
 * Realiza confronto direto entre tabelas:
 * - clientes (cnpj_limpo)
 * - dctf_declaracoes (numero_identificacao ou via cliente_id)
 */

import { supabaseAdmin } from '../config/database';
import { ApiResponse } from '../types';

export interface ClienteSemDCTF {
  id: string;
  cnpj_limpo: string;
  razao_social: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  competenciaVigente: string;
  prazoVencimento: string;
  diasAteVencimento: number;
  ultimaDCTF?: {
    periodo: string;
    dataTransmissao?: string;
    status: string;
  };
}

export interface ClientesSemDCTFResult {
  competenciaVigente: string;
  prazoVencimento: string;
  totalClientes: number;
  clientesComDCTF: number;
  clientesSemDCTF: number;
  clientes: ClienteSemDCTF[];
  geradoEm: string;
}

export class ClientesSemDCTFService {
  /**
   * Calcula a competência vigente (mês anterior ao atual)
   * Conforme IN RFB 2.248/2025, a competência vigente é o mês anterior
   */
  private calcularCompetenciaVigente(today: Date = new Date()): {
    competencia: string; // Formato MM/YYYY
    competenciaSQL: string; // Formato YYYY-MM
    month: number;
    year: number;
  } {
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    
    // Competência vigente é o mês anterior
    const competenciaMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const competenciaYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    
    const competencia = `${String(competenciaMonth).padStart(2, '0')}/${competenciaYear}`;
    const competenciaSQL = `${competenciaYear}-${String(competenciaMonth).padStart(2, '0')}`;
    
    return {
      competencia,
      competenciaSQL,
      month: competenciaMonth,
      year: competenciaYear,
    };
  }

  /**
   * Calcula o prazo de vencimento conforme IN RFB 2.248/2025:
   * Último dia útil do mês seguinte ao fato gerador
   */
  private calcularPrazoVencimento(year: number, month: number): Date {
    // Mês seguinte ao fato gerador
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    
    // Último dia do mês seguinte
    const lastDayOfMonth = new Date(nextYear, nextMonth, 0).getDate();
    let dueDate = new Date(Date.UTC(nextYear, nextMonth - 1, lastDayOfMonth, 12, 0, 0, 0));
    
    // Ajustar para o último dia útil (não pode ser sábado ou domingo)
    let dayOfWeek = dueDate.getUTCDay(); // 0 = domingo, 6 = sábado
    
    // Retroceder até encontrar um dia útil (segunda a sexta)
    while (dayOfWeek === 0 || dayOfWeek === 6) {
      dueDate.setUTCDate(dueDate.getUTCDate() - 1);
      dayOfWeek = dueDate.getUTCDay();
    }
    
    return dueDate;
  }

  /**
   * Identifica clientes sem DCTF no mês vigente
   * Usa consulta SQL direta para melhor performance
   */
  async identificarClientesSemDCTF(
    today: Date = new Date()
  ): Promise<ApiResponse<ClientesSemDCTFResult>> {
    try {
      const { competencia, competenciaSQL, month, year } = this.calcularCompetenciaVigente(today);
      const prazoVencimento = this.calcularPrazoVencimento(year, month);
      const prazoVencimentoISO = prazoVencimento.toISOString();
      
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const prazoStart = new Date(prazoVencimento.getFullYear(), prazoVencimento.getMonth(), prazoVencimento.getDate());
      const diasAteVencimento = Math.floor((prazoStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));

      console.log('[ClientesSemDCTF] 🔍 Verificando clientes sem DCTF:', {
        competencia,
        competenciaSQL,
        prazoVencimento: prazoVencimentoISO,
        diasAteVencimento,
      });

      if (!supabaseAdmin) {
        return {
          success: false,
          error: 'Supabase admin não configurado. Configure SUPABASE_SERVICE_ROLE_KEY.',
        };
      }

      // Consulta SQL moderna usando LEFT JOIN para identificar clientes sem DCTF
      // Compara cnpj_limpo da tabela clientes com numero_identificacao da tabela dctf_declaracoes
      // Também verifica via cliente_id para garantir cobertura completa
      const { data: clientesSemDCTF, error: errorSemDCTF } = await supabaseAdmin
        .rpc('get_clientes_sem_dctf', {
          competencia_param: competenciaSQL,
        })
        .catch(async () => {
          // Se a função RPC não existir, usar consulta direta
          console.log('[ClientesSemDCTF] Função RPC não encontrada, usando consulta direta');
          return this.consultarClientesSemDCTFDireto(competenciaSQL);
        });

      if (errorSemDCTF && !clientesSemDCTF) {
        // Se deu erro e não retornou dados, tentar consulta direta
        console.log('[ClientesSemDCTF] Erro na RPC, usando consulta direta:', errorSemDCTF.message);
        const resultadoDireto = await this.consultarClientesSemDCTFDireto(competenciaSQL);
        
        if (!resultadoDireto.success) {
          return resultadoDireto;
        }
        
        const clientes = resultadoDireto.data || [];
        
        // Buscar última DCTF de cada cliente
        const clientesComUltimaDCTF = await this.enriquecerComUltimaDCTF(clientes);
        
        // Buscar total de clientes e clientes com DCTF
        const estatisticas = await this.obterEstatisticas(competenciaSQL);
        
        return {
          success: true,
          data: {
            competenciaVigente: competencia,
            prazoVencimento: prazoVencimentoISO,
            totalClientes: estatisticas.totalClientes,
            clientesComDCTF: estatisticas.clientesComDCTF,
            clientesSemDCTF: clientesComUltimaDCTF.length,
            clientes: clientesComUltimaDCTF.map(cliente => ({
              ...cliente,
              competenciaVigente: competencia,
              prazoVencimento: prazoVencimentoISO,
              diasAteVencimento,
            })),
            geradoEm: new Date().toISOString(),
          },
        };
      }

      // Se a RPC funcionou, processar resultado
      const clientes = (clientesSemDCTF as any[]) || [];
      const clientesComUltimaDCTF = await this.enriquecerComUltimaDCTF(clientes);
      const estatisticas = await this.obterEstatisticas(competenciaSQL);

      return {
        success: true,
        data: {
          competenciaVigente: competencia,
          prazoVencimento: prazoVencimentoISO,
          totalClientes: estatisticas.totalClientes,
          clientesComDCTF: estatisticas.clientesComDCTF,
          clientesSemDCTF: clientesComUltimaDCTF.length,
          clientes: clientesComUltimaDCTF.map(cliente => ({
            ...cliente,
            competenciaVigente: competencia,
            prazoVencimento: prazoVencimentoISO,
            diasAteVencimento,
          })),
          geradoEm: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error('[ClientesSemDCTF] ❌ Erro ao identificar clientes sem DCTF:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido ao identificar clientes sem DCTF',
      };
    }
  }

  /**
   * Consulta direta usando Supabase query builder
   * Faz LEFT JOIN entre clientes e dctf_declaracoes
   */
  private async consultarClientesSemDCTFDireto(
    competenciaSQL: string
  ): Promise<ApiResponse<any[]>> {
    try {
      if (!supabaseAdmin) {
        return {
          success: false,
          error: 'Supabase admin não configurado',
        };
      }

      // Buscar todos os clientes
      const { data: todosClientes, error: errorClientes } = await supabaseAdmin
        .from('clientes')
        .select('id, cnpj_limpo, razao_social, email, telefone, endereco')
        .not('cnpj_limpo', 'is', null);

      if (errorClientes) {
        return {
          success: false,
          error: `Erro ao buscar clientes: ${errorClientes.message}`,
        };
      }

      if (!todosClientes || todosClientes.length === 0) {
        return {
          success: true,
          data: [],
        };
      }

      // Buscar DCTFs da competência vigente
      // Verificar tanto por numero_identificacao (CNPJ) quanto por cliente_id
      // O período pode estar em formato YYYY-MM ou MM/YYYY
      const competenciaFormatoAlternativo = competenciaSQL.replace(/(\d{4})-(\d{2})/, '$2/$1'); // Converte YYYY-MM para MM/YYYY
      
      const { data: dctfsCompetencia, error: errorDCTF } = await supabaseAdmin
        .from('dctf_declaracoes')
        .select('id, cliente_id, numero_identificacao, periodo, data_transmissao, status')
        .or(`periodo.eq.${competenciaSQL},periodo.eq.${competenciaFormatoAlternativo}`)
        .in('status', ['concluido', 'processando']);

      if (errorDCTF) {
        console.warn('[ClientesSemDCTF] Erro ao buscar DCTFs:', errorDCTF.message);
      }

      // Criar set de CNPJs que TÊM DCTF na competência
      // Normalizar todos os CNPJs para formato limpo (14 dígitos) para comparação
      const cnpjsComDCTF = new Set<string>();
      
      if (dctfsCompetencia) {
        // Processar DCTFs que têm cliente_id (mais confiável)
        dctfsCompetencia.forEach(dctf => {
          if (dctf.cliente_id) {
            const cliente = todosClientes.find(c => c.id === dctf.cliente_id);
            if (cliente?.cnpj_limpo) {
              const cnpjLimpo = cliente.cnpj_limpo.replace(/\D/g, '');
              if (cnpjLimpo.length === 14) {
                cnpjsComDCTF.add(cnpjLimpo);
              }
            }
          }
          
          // Processar DCTFs que têm numero_identificacao (CNPJ direto)
          // Pode estar formatado (XX.XXX.XXX/XXXX-XX) ou limpo
          if (dctf.numero_identificacao) {
            const cnpjLimpo = dctf.numero_identificacao.replace(/\D/g, '');
            if (cnpjLimpo.length === 14) {
              cnpjsComDCTF.add(cnpjLimpo);
            }
          }
        });
      }

      // Filtrar clientes que NÃO têm DCTF
      // Normalizar CNPJ do cliente para comparação (14 dígitos)
      const clientesSemDCTF = todosClientes.filter(cliente => {
        const cnpjLimpo = cliente.cnpj_limpo?.replace(/\D/g, '');
        return cnpjLimpo && cnpjLimpo.length === 14 && !cnpjsComDCTF.has(cnpjLimpo);
      });

      return {
        success: true,
        data: clientesSemDCTF,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro na consulta direta',
      };
    }
  }

  /**
   * Enriquece clientes com informação da última DCTF enviada
   */
  private async enriquecerComUltimaDCTF(
    clientes: any[]
  ): Promise<ClienteSemDCTF[]> {
    if (!supabaseAdmin || clientes.length === 0) {
      return clientes.map(c => ({
        ...c,
        ultimaDCTF: undefined,
      }));
    }

    try {
      const cnpjs = clientes.map(c => c.cnpj_limpo?.replace(/\D/g, '')).filter(Boolean);
      
      // Buscar última DCTF de cada cliente
      const { data: ultimasDCTFs, error } = await supabaseAdmin
        .from('dctf_declaracoes')
        .select('id, cliente_id, numero_identificacao, periodo, data_transmissao, status')
        .order('data_transmissao', { ascending: false })
        .limit(1000); // Limite razoável

      if (error) {
        console.warn('[ClientesSemDCTF] Erro ao buscar últimas DCTFs:', error.message);
      }

      // Criar mapa de última DCTF por CNPJ
      const ultimaDCTFMap = new Map<string, any>();
      
      if (ultimasDCTFs) {
        ultimasDCTFs.forEach(dctf => {
          let cnpj: string | null = null;
          
          // Tentar obter CNPJ via cliente_id
          if (dctf.cliente_id) {
            const cliente = clientes.find(c => c.id === dctf.cliente_id);
            if (cliente?.cnpj_limpo) {
              cnpj = cliente.cnpj_limpo.replace(/\D/g, '');
            }
          }
          
          // Tentar obter CNPJ via numero_identificacao
          if (!cnpj && dctf.numero_identificacao) {
            cnpj = dctf.numero_identificacao.replace(/\D/g, '');
          }
          
          if (cnpj && cnpj.length === 14) {
            if (!ultimaDCTFMap.has(cnpj)) {
              ultimaDCTFMap.set(cnpj, {
                periodo: dctf.periodo,
                dataTransmissao: dctf.data_transmissao,
                status: dctf.status,
              });
            }
          }
        });
      }

      // Mapear clientes com última DCTF
      return clientes.map(cliente => {
        const cnpjLimpo = cliente.cnpj_limpo?.replace(/\D/g, '');
        const ultimaDCTF = cnpjLimpo ? ultimaDCTFMap.get(cnpjLimpo) : undefined;
        
        return {
          ...cliente,
          ultimaDCTF,
        };
      });
    } catch (error) {
      console.error('[ClientesSemDCTF] Erro ao enriquecer com última DCTF:', error);
      return clientes.map(c => ({
        ...c,
        ultimaDCTF: undefined,
      }));
    }
  }

  /**
   * Obtém estatísticas totais
   */
  private async obterEstatisticas(competenciaSQL: string): Promise<{
    totalClientes: number;
    clientesComDCTF: number;
  }> {
    try {
      if (!supabaseAdmin) {
        return { totalClientes: 0, clientesComDCTF: 0 };
      }

      // Contar total de clientes
      const { count: totalClientes, error: errorTotal } = await supabaseAdmin
        .from('clientes')
        .select('*', { count: 'exact', head: true })
        .not('cnpj_limpo', 'is', null);

      // Contar clientes com DCTF na competência
      // O período pode estar em formato YYYY-MM ou MM/YYYY
      const competenciaFormatoAlternativo = competenciaSQL.replace(/(\d{4})-(\d{2})/, '$2/$1');
      
      const { data: dctfsCompetencia, error: errorDCTF } = await supabaseAdmin
        .from('dctf_declaracoes')
        .select('cliente_id, numero_identificacao')
        .or(`periodo.eq.${competenciaSQL},periodo.eq.${competenciaFormatoAlternativo}`)
        .in('status', ['concluido', 'processando']);

      // Buscar todos os clientes para mapear cliente_id -> cnpj_limpo
      const { data: todosClientes, error: errorClientes } = await supabaseAdmin
        .from('clientes')
        .select('id, cnpj_limpo')
        .not('cnpj_limpo', 'is', null);

      const clientesMap = new Map<string, string>();
      if (todosClientes) {
        todosClientes.forEach((c: any) => {
          if (c.cnpj_limpo) {
            const cnpjLimpo = c.cnpj_limpo.replace(/\D/g, '');
            if (cnpjLimpo.length === 14) {
              clientesMap.set(c.id, cnpjLimpo);
            }
          }
        });
      }

      const clientesComDCTF = new Set<string>();
      
      if (dctfsCompetencia) {
        dctfsCompetencia.forEach(dctf => {
          // Processar via cliente_id (mais confiável)
          if (dctf.cliente_id && clientesMap.has(dctf.cliente_id)) {
            clientesComDCTF.add(clientesMap.get(dctf.cliente_id)!);
          }
          
          // Processar via numero_identificacao (CNPJ direto)
          if (dctf.numero_identificacao) {
            const cnpj = dctf.numero_identificacao.replace(/\D/g, '');
            if (cnpj.length === 14) {
              clientesComDCTF.add(cnpj);
            }
          }
        });
      }

      return {
        totalClientes: totalClientes || 0,
        clientesComDCTF: clientesComDCTF.size,
      };
    } catch (error) {
      console.error('[ClientesSemDCTF] Erro ao obter estatísticas:', error);
      return { totalClientes: 0, clientesComDCTF: 0 };
    }
  }
}

