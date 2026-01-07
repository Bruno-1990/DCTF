/**
 * MÓDULO 1: Clientes sem DCTF na Competência Vigente
 * 
 * Objetivo: Listar todos os clientes cadastrados que NÃO têm DCTF enviada
 * para a competência vigente (mês anterior à data atual).
 * 
 * IMPORTANTE: Considera apenas DCTFs do tipo "Original". 
 * DCTFs do tipo "Retificadora" são desconsideradas.
 * 
 * Fonte de dados: MySQL (tabelas clientes e dctf_declaracoes)
 */

import { randomUUID } from 'crypto';
import { executeQuery } from '../../../config/mysql';
import { Cliente } from '../../../models/Cliente';
import type { Cliente as ICliente } from '../../../types';

export interface ClienteSemDCTFVigente {
  id: string;
  cnpj: string;
  razao_social: string;
  competencia_vigente: string;
  vencimento: string;
  severidade: 'high' | 'medium' | 'low';
  mensagem: string;
}

/**
 * Calcula a competência vigente (sempre mês anterior à data atual)
 */
function calcularCompetenciaVigente(today: Date = new Date()): {
  mes: number;
  ano: number;
  competencia: string; // Formato MM/YYYY
  periodoSql: string; // Formato YYYY-MM
} {
  const currentMonth = today.getMonth() + 1; // getMonth() retorna 0-11
  const currentYear = today.getFullYear();
  
  const competenciaMes = currentMonth === 1 ? 12 : currentMonth - 1;
  const competenciaAno = currentMonth === 1 ? currentYear - 1 : currentYear;
  
  const competencia = `${String(competenciaMes).padStart(2, '0')}/${competenciaAno}`;
  const periodoSql = `${competenciaAno}-${String(competenciaMes).padStart(2, '0')}`;
  
  return {
    mes: competenciaMes,
    ano: competenciaAno,
    competencia,
    periodoSql,
  };
}

/**
 * Calcula o vencimento legal (último dia útil do mês seguinte)
 */
function calcularVencimento(ano: number, mes: number): Date {
  const nextMonth = mes === 12 ? 1 : mes + 1;
  const nextYear = mes === 12 ? ano + 1 : ano;
  
  const lastDayOfMonth = new Date(nextYear, nextMonth, 0).getDate();
  let dueDate = new Date(Date.UTC(nextYear, nextMonth - 1, lastDayOfMonth, 12, 0, 0, 0));
  
  let dayOfWeek = dueDate.getUTCDay();
  while (dayOfWeek === 0 || dayOfWeek === 6) {
    dueDate.setUTCDate(dueDate.getUTCDate() - 1);
    dayOfWeek = dueDate.getUTCDay();
  }
  
  return dueDate;
}

/**
 * Normaliza CNPJ removendo caracteres não numéricos
 */
function normalizarCNPJ(cnpj: string | null | undefined): string | null {
  if (!cnpj) return null;
  const limpo = cnpj.replace(/\D/g, '');
  return limpo.length >= 11 ? limpo : null;
}

/**
 * Lista clientes sem DCTF na competência vigente
 */
export async function listarClientesSemDCTFVigente(): Promise<ClienteSemDCTFVigente[]> {
  try {
    const today = new Date();
    const { mes, ano, competencia, periodoSql } = calcularCompetenciaVigente(today);
    
    console.log(`[Conferência Módulo 1] 🔍 Competência vigente: ${competencia}`);
    
    // 1. Buscar todos os clientes
    const clienteModel = new Cliente();
    const resultClientes = await clienteModel.findAll();
    
    if (!resultClientes.success || !resultClientes.data) {
      console.log('[Conferência Módulo 1] ⚠️ Nenhum cliente encontrado');
      return [];
    }
    
    const todosClientes: ICliente[] = resultClientes.data;
    console.log(`[Conferência Módulo 1] 📊 Total de clientes: ${todosClientes.length}`);
    
    // 2. Buscar CNPJs que TÊM DCTF na competência vigente
    // IMPORTANTE: Considerar tanto Original quanto Retificadora para verificar se TEM DCTF
    // Se tem retificadora, significa que já enviou original antes
    const dctfsComCNPJ = await executeQuery<{ cnpj_normalizado: string }>(
      `
      SELECT DISTINCT 
        REPLACE(REPLACE(REPLACE(
          COALESCE(c.cnpj_limpo, d.cnpj),
          '.', ''), '/', ''), '-', ''
        ) as cnpj_normalizado
      FROM dctf_declaracoes d
      LEFT JOIN clientes c ON d.cliente_id = c.id
      WHERE (
        TRIM(d.periodo_apuracao) = ?
        OR TRIM(d.periodo_apuracao) = ?
      )
      AND (
        c.id IS NOT NULL
        OR d.cnpj IS NOT NULL
      )
      `,
      [periodoSql, competencia]
    );
    
    const cnpjsComDCTF = new Set(
      dctfsComCNPJ
        .map(r => r.cnpj_normalizado)
        .filter(cnpj => cnpj && cnpj.length >= 11) as string[]
    );
    
    console.log(`[Conferência Módulo 1] ✅ Clientes COM DCTF: ${cnpjsComDCTF.size}`);
    
    // 3. Filtrar clientes SEM DCTF
    // IMPORTANTE: Considerar apenas clientes "Matriz", excluir "Filial"
    const vencimento = calcularVencimento(ano, mes);
    const hoje = new Date();
    const diasAteVencimento = Math.floor((vencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    
    const clientesSemDCTF: ClienteSemDCTFVigente[] = todosClientes
      .filter((cliente: ICliente) => {
        // Excluir clientes "Filial" - apenas "Matriz" tem obrigatoriedade
        const tipoEmpresa = (cliente as any).tipo_empresa || (cliente as any).tipoEmpresa;
        if (tipoEmpresa === 'Filial') {
          return false;
        }
        
        const cnpjNormalizado = normalizarCNPJ(cliente.cnpj_limpo);
        if (!cnpjNormalizado) return false;
        return !cnpjsComDCTF.has(cnpjNormalizado);
      })
      .map((cliente: ICliente) => {
        const severidade: 'high' | 'medium' | 'low' = 
          diasAteVencimento < 0 ? 'high' : 
          diasAteVencimento <= 5 ? 'high' : 
          'medium';
        
        return {
          id: randomUUID(),
          cnpj: cliente.cnpj_limpo || '',
          razao_social: cliente.razao_social || '',
          competencia_vigente: competencia,
          vencimento: vencimento.toISOString(),
          severidade,
          mensagem: `Cliente sem DCTF na competência ${competencia}. Verificar se houve movimento para o mês seguinte.`,
        };
      });
    
    console.log(`[Conferência Módulo 1] ⚠️ Clientes SEM DCTF: ${clientesSemDCTF.length}`);
    
    return clientesSemDCTF;
  } catch (error: any) {
    console.error('[Conferência Módulo 1] ❌ Erro:', error);
    throw error;
  }
}

