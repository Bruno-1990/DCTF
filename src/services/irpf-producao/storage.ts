/**
 * Storage IRPF Produção (PRD 8.1, 8.2, 8.5)
 * Path por ANO/CASEID; subpastas 00_cadastro a 11_dec, 99_auditoria.
 * Escrita atômica: .uploading → rename. RNF-001: sem CPF/nome no path.
 */

import { mkdirSync, existsSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const SUBFOLDERS = [
  '00_cadastro',
  '01_rendimentos',
  '02_bancos',
  '03_investimentos',
  '04_saude',
  '05_educacao',
  '06_pensao_dependentes',
  '07_bens_direitos',
  '08_dividas_onus',
  '09_especiais',
  '10_protocolos',
  '11_dec',
  '99_auditoria',
] as const;

function getBasePath(): string {
  const base = process.env.IRPF_STORAGE_PATH;
  if (base) return base.trim().replace(/\/*$/, '');
  return join(process.cwd(), 'irpf_storage');
}

/**
 * Monta o path da pasta do case: {BASE}/{ANO}/{CASEID}
 */
export function resolveCasePath(ano: number, caseId: string): string {
  const base = getBasePath();
  return join(base, String(ano), String(caseId));
}

/**
 * Cria as subpastas 00_cadastro a 11_dec e 99_auditoria sob o path do case.
 */
export async function ensureSubfolders(casePath: string): Promise<void> {
  for (const sub of SUBFOLDERS) {
    const full = join(casePath, sub);
    if (!existsSync(full)) {
      mkdirSync(full, { recursive: true });
    }
  }
}

/**
 * Escrita atômica: grava em {dir}/{filename}.uploading e renomeia para {dir}/{filename}.
 * Nome do arquivo não deve conter CPF (RNF-001).
 */
export async function saveFileAtomically(
  dir: string,
  filename: string,
  content: Buffer
): Promise<string> {
  const tempPath = join(dir, `${filename}.uploading`);
  const finalPath = join(dir, filename);
  writeFileSync(tempPath, content);
  renameSync(tempPath, finalPath);
  return finalPath;
}

/**
 * SHA-256 do conteúdo (para deduplicação, PRD 8.6).
 */
export function computeSha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}
