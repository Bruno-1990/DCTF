/**
 * Utilitários para cálculos de datas e prazos relacionados a DCTF
 */

/**
 * Calcula a competência vigente (sempre mês anterior à data atual)
 */
export function calcularCompetenciaVigente(today: Date = new Date()): {
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
 * Calcula o vencimento legal (último dia útil do mês seguinte à competência)
 * Exemplo: Competência 11/2024 → Vencimento: último dia útil de 12/2024
 */
export function calcularVencimento(ano: number, mes: number): Date {
  const nextMonth = mes === 12 ? 1 : mes + 1;
  const nextYear = mes === 12 ? ano + 1 : ano;
  
  const lastDayOfMonth = new Date(nextYear, nextMonth, 0).getDate();
  let dueDate = new Date(Date.UTC(nextYear, nextMonth - 1, lastDayOfMonth, 12, 0, 0, 0));
  
  // Ajustar para último dia útil (não pode ser sábado ou domingo)
  let dayOfWeek = dueDate.getUTCDay();
  while (dayOfWeek === 0 || dayOfWeek === 6) {
    dueDate.setUTCDate(dueDate.getUTCDate() - 1);
    dayOfWeek = dueDate.getUTCDay();
  }
  
  return dueDate;
}

/**
 * Calcula dias até o vencimento (negativo se já vencido)
 */
export function calcularDiasAteVencimento(ano: number, mes: number, hoje: Date = new Date()): number {
  const vencimento = calcularVencimento(ano, mes);
  const diffTime = vencimento.getTime() - hoje.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Parse período de apuração (MM/YYYY ou YYYY-MM) para objeto
 */
export function parsePeriodo(periodo: string | null | undefined): { mes: number; ano: number } | null {
  if (!periodo) return null;
  
  // Formato MM/YYYY
  const match1 = periodo.match(/^(\d{2})\/(\d{4})$/);
  if (match1) {
    return {
      mes: parseInt(match1[1], 10),
      ano: parseInt(match1[2], 10),
    };
  }
  
  // Formato YYYY-MM
  const match2 = periodo.match(/^(\d{4})-(\d{2})$/);
  if (match2) {
    return {
      mes: parseInt(match2[2], 10),
      ano: parseInt(match2[1], 10),
    };
  }
  
  return null;
}

/**
 * Formata período para MM/YYYY
 */
export function formatarPeriodo(mes: number, ano: number): string {
  return `${String(mes).padStart(2, '0')}/${ano}`;
}




