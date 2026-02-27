/**
 * MÓDULO 2: Clientes sem DCTF mas COM Movimento no SCI
 * 
 * Objetivo: Listar clientes que NÃO têm DCTF na competência vigente,
 * mas TÊM movimento no Banco SCI no mês anterior.
 * 
 * Fonte de dados: MySQL (tabelas clientes, host_dados e dctf_declaracoes)
 * 
 * Lógica: Se houve movimento no mês X, há obrigação de enviar DCTF no mês X+1
 */

import { HostDadosObrigacaoService } from '../../HostDadosObrigacaoService';

export interface ClienteSemDCTFComMovimento {
  cnpj: string;
  razao_social: string;
  regime_tributario?: string | null;
  cod_emp: number | null;
  competencia_obrigacao: string; // Competência que deveria ter DCTF
  competencia_movimento: string; // Competência do movimento
  ano_movimento: number;
  mes_movimento: number;
  tipos_movimento: string[];
  total_movimentacoes: number;
  prazoVencimento: string;
  diasAteVencimento: number;
  possivelObrigacaoEnvio: boolean;
  motivoObrigacao?: string;
}

/**
 * Lista clientes sem DCTF mas com movimento no SCI
 */
export async function listarClientesSemDCTFComMovimento(
  ano?: number,
  mes?: number
): Promise<ClienteSemDCTFComMovimento[]> {
  try {
    const service = new HostDadosObrigacaoService();
    const resultado = await service.listarClientesSemDCTFComMovimento(ano, mes);
    
    console.log(`[Conferência Módulo 2] ✅ Encontrados ${resultado.length} clientes sem DCTF mas com movimento`);
    
    return resultado;
  } catch (error: any) {
    console.error('[Conferência Módulo 2] ❌ Erro:', error);
    throw error;
  }
}

