/**
 * Verifica se os dados da tabela teste_png (MySQL) batem com o que está nas imagens
 * da pasta DCTF_WEB (re-executando OCR). Lista divergências, principalmente:
 * - Data de transmissão
 * - Período de apuração (data de apuração)
 *
 * Uso:
 *   npx ts-node src/scripts/verificar-ocr-vs-mysql-dctf.ts
 *   npx ts-node src/scripts/verificar-ocr-vs-mysql-dctf.ts "C:\caminho\para\DCTF_WEB"
 *
 * Variável de ambiente opcional: DCTF_WEB_IMAGES_PATH (pasta com os PNGs)
 */

import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { executeQuery } from '../config/mysql';
import {
  extractFromPngBuffers,
  terminatePngExtractor,
} from '../services/DCTFPngExtractorService';
import type { DCTFExtractedRow } from '../services/DCTFPngExtractorService';

const DEFAULT_IMAGES_PATH =
  process.env['DCTF_WEB_IMAGES_PATH'] ||
  path.join(process.env['USERPROFILE'] || process.env['HOME'] || '', 'Pictures', 'DCTF_WEB');

function onlyDigits(s: string): string {
  return (s || '').replace(/\D/g, '');
}

/** Normaliza data para comparação: retorna YYYY-MM-DD ou null */
function normalizeDateForCompare(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  // DD/MM/YYYY ou DD/MM/YYYY HH:MM
  const ddmmyyyy = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return s || null;
}

/** Normaliza data MySQL (pode vir como Date ou string YYYY-MM-DD HH:MM:SS) */
function normalizeMysqlDate(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === 'object' && 'toISOString' in value) {
    return (value as Date).toISOString().slice(0, 10);
  }
  return normalizeDateForCompare(String(value));
}

/** Normaliza período de apuração para comparação (trim, maiúsculas) */
function normalizePeriodo(s: string | null | undefined): string {
  if (s == null || s === '') return '';
  return String(s).trim();
}

/** CNPJ apenas dígitos para matching */
function normalizeCnpjForMatch(s: string | null | undefined): string {
  if (s == null || s === '') return '';
  const d = onlyDigits(String(s));
  return d.length >= 11 ? d.slice(0, 14) : d;
}

interface TestePngRow {
  id: string;
  cnpj: string | null;
  periodo_apuracao: string | null;
  data_transmissao: string | null;
}

interface Divergencia {
  tipo: 'data_transmissao' | 'periodo_apuracao' | 'ambos' | 'registro_sem_imagem' | 'imagem_sem_registro';
  id?: string;
  cnpj: string;
  periodo_apuracao_esperado?: string;
  periodo_apuracao_mysql?: string;
  data_transmissao_esperada?: string | null;
  data_transmissao_mysql?: string | null;
  arquivo?: string;
  indice_linha?: number;
}

async function main() {
  const imagesPath = process.argv[2] || DEFAULT_IMAGES_PATH;
  if (!fs.existsSync(imagesPath)) {
    console.error('Pasta de imagens não encontrada:', imagesPath);
    console.error('Uso: npx ts-node src/scripts/verificar-ocr-vs-mysql-dctf.ts [pasta_DCTF_WEB]');
    process.exit(1);
  }

  const files = fs.readdirSync(imagesPath).filter((f) => /\.png$/i.test(f));
  if (files.length === 0) {
    console.error('Nenhum arquivo .png encontrado em:', imagesPath);
    process.exit(1);
  }

  console.log('\n=== Verificação OCR (imagens) x MySQL (teste_png) ===\n');
  console.log('Pasta de imagens:', imagesPath);
  console.log('Arquivos PNG:', files.length);

  // 1) Extrair dados das imagens (OCR)
  const fileInputs = files.map((f) => ({
    buffer: fs.readFileSync(path.join(imagesPath, f)),
    filename: f,
  }));

  console.log('\nExecutando OCR nas imagens...');
  const perFileResults = await extractFromPngBuffers(fileInputs);

  const linhasPorArquivo: { filename: string; rows: DCTFExtractedRow[] }[] = [];
  let totalLinhasOcr = 0;
  for (const r of perFileResults) {
    if (r.error) {
      console.warn('  Aviso:', r.filename, '-', r.error);
      linhasPorArquivo.push({ filename: r.filename, rows: [] });
    } else {
      linhasPorArquivo.push({ filename: r.filename, rows: r.rows });
      totalLinhasOcr += r.rows.length;
    }
  }
  console.log('Total de linhas extraídas das imagens:', totalLinhasOcr);

  // 2) Buscar todos os registros de teste_png
  const mysqlRows = await executeQuery<TestePngRow>(
    `SELECT id, cnpj, periodo_apuracao, data_transmissao FROM teste_png ORDER BY created_at, id`
  );
  console.log('Total de registros em teste_png (MySQL):', mysqlRows.length);

  // 3) Montar lista de "esperados" do OCR (todas as linhas, com origem arquivo)
  const esperados: (DCTFExtractedRow & { _arquivo: string; _indice: number })[] = [];
  for (const { filename, rows } of linhasPorArquivo) {
    rows.forEach((row, i) => {
      esperados.push({ ...row, _arquivo: filename, _indice: i + 1 });
    });
  }

  const divergencias: Divergencia[] = [];
  const mysqlUsados = new Set<string>(); // ids de teste_png que deram match

  // 4) Para cada registro MySQL, tentar encontrar linha OCR com mesmo cnpj + periodo
  for (const mysql of mysqlRows) {
    const cnpjNorm = normalizeCnpjForMatch(mysql.cnpj);
    const periodNorm = normalizePeriodo(mysql.periodo_apuracao);
    const dataMysql = normalizeMysqlDate(mysql.data_transmissao);

    const candidatos = esperados.filter((e) => {
      const ecnpj = normalizeCnpjForMatch(e.cnpj);
      const eper = normalizePeriodo(e.periodo_apuracao);
      return ecnpj === cnpjNorm && eper === periodNorm;
    });

    if (candidatos.length === 0) {
      divergencias.push({
        tipo: 'registro_sem_imagem',
        id: mysql.id,
        cnpj: mysql.cnpj || cnpjNorm || '(vazio)',
        periodo_apuracao_mysql: mysql.periodo_apuracao ?? undefined,
        data_transmissao_mysql: mysql.data_transmissao ?? undefined,
      });
      continue;
    }

    // Usar o primeiro candidato para comparação (se houver vários com mesmo cnpj+periodo, consideramos o primeiro)
    const ocr = candidatos[0];
    mysqlUsados.add(mysql.id);

    const dataOcr = normalizeDateForCompare(ocr.data_transmissao);
    const periodoOcr = normalizePeriodo(ocr.periodo_apuracao);
    const periodoMysql = normalizePeriodo(mysql.periodo_apuracao);

    const diffData = dataOcr !== dataMysql;
    const diffPeriodo = periodoOcr !== periodoMysql;

    if (diffData && diffPeriodo) {
      divergencias.push({
        tipo: 'ambos',
        id: mysql.id,
        cnpj: mysql.cnpj || cnpjNorm || '(vazio)',
        periodo_apuracao_esperado: ocr.periodo_apuracao ?? undefined,
        periodo_apuracao_mysql: mysql.periodo_apuracao ?? undefined,
        data_transmissao_esperada: ocr.data_transmissao ?? undefined,
        data_transmissao_mysql: mysql.data_transmissao ?? undefined,
        arquivo: ocr._arquivo,
        indice_linha: ocr._indice,
      });
    } else if (diffData) {
      divergencias.push({
        tipo: 'data_transmissao',
        id: mysql.id,
        cnpj: mysql.cnpj || cnpjNorm || '(vazio)',
        periodo_apuracao_esperado: ocr.periodo_apuracao ?? undefined,
        periodo_apuracao_mysql: mysql.periodo_apuracao ?? undefined,
        data_transmissao_esperada: ocr.data_transmissao ?? undefined,
        data_transmissao_mysql: mysql.data_transmissao ?? undefined,
        arquivo: ocr._arquivo,
        indice_linha: ocr._indice,
      });
    } else if (diffPeriodo) {
      divergencias.push({
        tipo: 'periodo_apuracao',
        id: mysql.id,
        cnpj: mysql.cnpj || cnpjNorm || '(vazio)',
        periodo_apuracao_esperado: ocr.periodo_apuracao ?? undefined,
        periodo_apuracao_mysql: mysql.periodo_apuracao ?? undefined,
        data_transmissao_esperada: ocr.data_transmissao ?? undefined,
        data_transmissao_mysql: mysql.data_transmissao ?? undefined,
        arquivo: ocr._arquivo,
        indice_linha: ocr._indice,
      });
    }
  }

  // 5) Linhas OCR que não encontraram par no MySQL (por cnpj + periodo)
  const mysqlKeys = new Set(
    mysqlRows.map((r) => `${normalizeCnpjForMatch(r.cnpj)}|${normalizePeriodo(r.periodo_apuracao)}`)
  );
  for (const e of esperados) {
    const key = `${normalizeCnpjForMatch(e.cnpj)}|${normalizePeriodo(e.periodo_apuracao)}`;
    if (!mysqlKeys.has(key)) {
      divergencias.push({
        tipo: 'imagem_sem_registro',
        cnpj: e.cnpj ?? '(vazio)',
        periodo_apuracao_esperado: e.periodo_apuracao ?? undefined,
        data_transmissao_esperada: e.data_transmissao ?? undefined,
        arquivo: e._arquivo,
        indice_linha: e._indice,
      });
    }
  }

  // 6) Relatório
  const divData = divergencias.filter((d) => d.tipo === 'data_transmissao');
  const divPeriodo = divergencias.filter((d) => d.tipo === 'periodo_apuracao');
  const divAmbos = divergencias.filter((d) => d.tipo === 'ambos');
  const semImagem = divergencias.filter((d) => d.tipo === 'registro_sem_imagem');
  const semRegistro = divergencias.filter((d) => d.tipo === 'imagem_sem_registro');

  console.log('\n--- RESUMO ---');
  console.log('Divergência DATA DE TRANSMISSÃO:', divData.length);
  console.log('Divergência PERÍODO DE APURAÇÃO:', divPeriodo.length);
  console.log('Divergência em AMBOS (data e período):', divAmbos.length);
  console.log('Registros no MySQL sem correspondência na imagem:', semImagem.length);
  console.log('Linhas nas imagens sem registro no MySQL:', semRegistro.length);

  if (divData.length > 0) {
    console.log('\n--- DIVERGÊNCIAS: DATA DE TRANSMISSÃO ---');
    divData.forEach((d) => {
      console.log(
        `  ID ${d.id} | CNPJ ${d.cnpj} | Período ${d.periodo_apuracao_mysql ?? '-'} | ` +
          `Imagem: ${d.data_transmissao_esperada ?? '-'} | MySQL: ${d.data_transmissao_mysql ?? '-'} | Arquivo: ${d.arquivo ?? '-'}`
      );
    });
  }

  if (divPeriodo.length > 0) {
    console.log('\n--- DIVERGÊNCIAS: PERÍODO DE APURAÇÃO ---');
    divPeriodo.forEach((d) => {
      console.log(
        `  ID ${d.id} | CNPJ ${d.cnpj} | Imagem: ${d.periodo_apuracao_esperado ?? '-'} | MySQL: ${d.periodo_apuracao_mysql ?? '-'} | Arquivo: ${d.arquivo ?? '-'}`
      );
    });
  }

  if (divAmbos.length > 0) {
    console.log('\n--- DIVERGÊNCIAS: DATA E PERÍODO ---');
    divAmbos.forEach((d) => {
      console.log(
        `  ID ${d.id} | CNPJ ${d.cnpj} | Período Imagem: ${d.periodo_apuracao_esperado ?? '-'} MySQL: ${d.periodo_apuracao_mysql ?? '-'} | ` +
          `Data Imagem: ${d.data_transmissao_esperada ?? '-'} MySQL: ${d.data_transmissao_mysql ?? '-'} | ${d.arquivo ?? '-'}`
      );
    });
  }

  if (semImagem.length > 0) {
    console.log('\n--- REGISTROS NO MYSQL SEM CORRESPONDÊNCIA NA IMAGEM (CNPJ+período) ---');
    semImagem.forEach((d) => {
      console.log(`  ID ${d.id} | CNPJ ${d.cnpj} | Período ${d.periodo_apuracao_mysql ?? '-'} | Data ${d.data_transmissao_mysql ?? '-'}`);
    });
  }

  if (semRegistro.length > 0) {
    console.log('\n--- LINHAS NAS IMAGENS SEM REGISTRO NO MYSQL ---');
    semRegistro.forEach((d) => {
      console.log(
        `  Arquivo ${d.arquivo ?? '-'} linha ${d.indice_linha ?? '-'} | CNPJ ${d.cnpj} | Período ${d.periodo_apuracao_esperado ?? '-'} | Data ${d.data_transmissao_esperada ?? '-'}`
      );
    });
  }

  const totalDiv = divData.length + divPeriodo.length + divAmbos.length;
  if (totalDiv === 0 && semImagem.length === 0 && semRegistro.length === 0) {
    console.log('\nNenhuma divergência encontrada entre imagens e MySQL.');
  } else {
    console.log('\nTotal de itens com divergência/ausência listados acima.');
  }

  console.log('');
  await terminatePngExtractor();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await terminatePngExtractor().catch(() => {});
  process.exit(1);
});
