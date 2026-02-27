/**
 * Serviço DIRF: parse de XMLs S-5002 e totalizadores por CPF/mês/ano.
 */

export interface MesAgregado {
  verbas: Record<string, number>;
  totalMes: number;
}

export interface CpfAgregado {
  meses: Record<string, MesAgregado>;
  totalAno: number;
}

export interface DirfParseResult {
  porCpf: Record<string, CpfAgregado>;
  arquivosProcessados: number;
  errosPorArquivo: Record<string, string>;
}

export interface DirfParseResponse {
  success: boolean;
  data?: DirfParseResult;
  error?: string;
}

export interface DirfVerbasResponse {
  success: boolean;
  data?: Record<string, string>;
}

const API_BASE = '/api/dirf';

export async function parseXmls(files: File[]): Promise<DirfParseResponse> {
  const form = new FormData();
  files.forEach((f) => form.append('arquivos', f));

  const res = await fetch(`${API_BASE}/parse`, {
    method: 'POST',
    body: form,
  });
  return res.json();
}

export async function getVerbas(): Promise<DirfVerbasResponse> {
  const res = await fetch(`${API_BASE}/verbas`);
  return res.json();
}
