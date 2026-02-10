/**
 * Script: preencher campo Rede (nome_pasta_rede) a partir do CSV de pastas.
 * Match por razão social normalizada, ignorando natureza jurídica (LTDA, ME, EPP, etc.).
 * Gera log de erros no final com todos os itens sem match.
 *
 * Uso: npx ts-node src/scripts/preencher-rede-por-pastas-csv.ts [caminho-do-csv]
 * npm run preencher:rede-pastas
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const projectRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const PREFIXO_PASTA_REDE = '\\\\192.168.0.9\\Clientes\\';

/**
 * Normaliza para match: trim, minúsculas, sem acentos, Ç→c, & e caracteres especiais ignorados, espaços colapsados.
 */
function normalize(str: string): string {
  let s = str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/ç/g, 'c').replace(/Ç/g, 'c');
  s = s.replace(/\s*&\s*/g, ' e ');
  return s.replace(/\s+/g, ' ').trim();
}

/** Expressões de natureza jurídica (texto normalizado) para remover do nome. Ordem: frases longas primeiro. */
const NATUREZA_JURIDICA_PATTERNS: (string | RegExp)[] = [
  'sociedade limitada (ltda)',
  'sociedade limitada',
  'sociedade anonima (s/a)',
  'sociedade anonima (s.a.)',
  'sociedade anonima',
  'sociedade em nome coletivo',
  'sociedade em comandita simples',
  'sociedade em comandita por acoes',
  'sociedade em conta de participacao (scp)',
  'sociedade em conta de participacao',
  'empresario individual (ei)',
  'empresario individual',
  'estabelecimento no brasil de empresa estrangeira',
  'servico notarial e registral (cartorio)',
  'servico notarial e registral',
  'sociedade de economia mista',
  'consorcio publico',
  'condominio edilicio',
  'consorcio de empresas',
  'fundacao publica',
  'empresa publica',
  'orgao publico',
  'associacao privada',
  'fundacao privada',
  'organizacao religiosa',
  'partido politico',
  'entidade sindical',
  'autarquia',
  'cooperativa',
  /\s*-\s*(me|epp|ei|eireli|ltda)\s*$/i,
  /\s+-\s*me\s*$/i,
  /\b(ltda|s\/a|s\.a\.|s\s*a)\s*$/i,
  /\b(me|epp|ei|eireli|scp|sc)\s*$/i,
];

/** Remove natureza jurídica do texto já normalizado para comparação. */
function removeNaturezaJuridica(normalized: string): string {
  let s = normalized;
  for (const p of NATUREZA_JURIDICA_PATTERNS) {
    if (typeof p === 'string') {
      const re = new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      s = s.replace(re, ' ');
    } else {
      s = s.replace(p, ' ');
    }
  }
  return s.replace(/\s+/g, ' ').trim();
}

/** Chave para match: normalizado e sem natureza jurídica. */
function matchKey(razaoSocial: string): string {
  return removeNaturezaJuridica(normalize(razaoSocial));
}

const SIMILARITY_THRESHOLD = 0.8;

/** Compatibilidade por palavras: % das palavras do CSV que aparecem no cliente (0 a 1). */
function similarityWords(keyCsv: string, keyClient: string): number {
  const wordsCsv = keyCsv.split(/\s+/).filter(Boolean);
  const wordsClient = new Set(keyClient.split(/\s+/).filter(Boolean));
  if (wordsCsv.length === 0) return 0;
  const match = wordsCsv.filter((w) => wordsClient.has(w)).length;
  return match / wordsCsv.length;
}

/** Lê o CSV e retorna lista de razões sociais (nome da pasta = razão social para match). */
function parseCsvRazoesSociais(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const first = lines[0];
  const sep = first.includes(';') ? ';' : first.includes(',') ? ',' : '\t';
  const header = first.toLowerCase();
  const isHeader =
    header.includes('nomepasta') ||
    header.includes('nome_pasta') ||
    header.includes('razao') ||
    header.includes('razão') ||
    header === 'nome pasta';
  const start = isHeader ? 1 : 0;

  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const row = lines[i].split(sep).map((c) => c.trim());
    const val = (row[0] ?? '').trim();
    if (val) out.push(val);
  }
  return out;
}

async function main() {
  const csvPath = process.argv[2] || path.join(process.env['USERPROFILE'] || '', 'Desktop', 'pastas_clientes_192.168.0.9.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('Arquivo CSV não encontrado:', csvPath);
    process.exit(1);
  }

  const razoesFromCsv = parseCsvRazoesSociais(csvPath);
  console.log(`[Rede] CSV carregado: ${razoesFromCsv.length} razões sociais (${path.basename(csvPath)})\n`);
  console.log('[Rede] Match: exato ou ≥80% compatibilidade (palavras). Natureza jurídica ignorada; Ç→c; & ignorados.\n');

  const erros: string[] = [];
  let atualizados = 0;

  const { getConnection } = await import('../config/mysql');
  let connection;
  try {
    connection = await getConnection();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    erros.push(`[ERRO DE CONEXÃO] ${msg}`);
    console.error('[Rede] Erro ao conectar MySQL. Configure .env (MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE).');
    writeLogDeErros(csvPath, erros, 0);
    process.exit(1);
  }

  try {
    const [rows] = await connection.execute('SELECT id, razao_social FROM clientes');
    const clientes = (rows as { id: string; razao_social: string }[]).filter((c) => c.razao_social != null);

    const byKey = new Map<string, { id: string; razao_social: string }[]>();
    for (const c of clientes) {
      const k = matchKey(c.razao_social);
      if (!k) continue;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(c);
    }

    for (const razaoPasta of razoesFromCsv) {
      const fullPath = PREFIXO_PASTA_REDE + razaoPasta;
      const key = matchKey(razaoPasta);
      const matches = key ? byKey.get(key) : undefined;

      if (matches && matches.length > 0) {
        for (const cliente of matches) {
          await connection.execute('UPDATE clientes SET nome_pasta_rede = ? WHERE id = ?', [fullPath, cliente.id]);
          atualizados++;
        }
        continue;
      }

      if (!key) {
        erros.push(razaoPasta);
        continue;
      }

      let bestCliente: { id: string; razao_social: string } | null = null;
      let bestScore = 0;
      for (const c of clientes) {
        const kc = matchKey(c.razao_social);
        if (!kc) continue;
        const score = similarityWords(key, kc);
        if (score >= SIMILARITY_THRESHOLD && score > bestScore) {
          bestScore = score;
          bestCliente = c;
        }
      }
      if (bestCliente) {
        await connection.execute('UPDATE clientes SET nome_pasta_rede = ? WHERE id = ?', [fullPath, bestCliente.id]);
        atualizados++;
      } else {
        erros.push(razaoPasta);
      }
    }

    console.log(`[Rede] Atualizados: ${atualizados} cliente(s).`);
    console.log(`[Rede] Sem match (razão social não encontrada no banco): ${erros.length}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    erros.push(`[ERRO DE EXECUÇÃO] ${msg}`);
    console.error('[Rede] Erro:', msg);
  } finally {
    connection!.release();
  }

  writeLogDeErros(csvPath, erros, atualizados);

  const semMatch = erros.filter((l) => !l.startsWith('[ERRO DE'));
  const errosExec = erros.filter((l) => l.startsWith('[ERRO DE'));
  console.log('\n========================================');
  console.log('LOG DE ERROS (final)');
  console.log('========================================');
  console.log(`Arquivo: ${path.join(process.cwd(), 'log_pastas_rede_erros.txt')}`);
  console.log(`Atualizados: ${atualizados}`);
  console.log(`Sem match (razão social): ${semMatch.length}`);
  if (errosExec.length) console.log(`Erros de execução: ${errosExec.length}`);
  console.log('========================================\n');
}

function writeLogDeErros(csvPath: string, erros: string[], atualizados: number): void {
  const logPath = path.join(process.cwd(), 'log_pastas_rede_erros.txt');
  const semMatch = erros.filter((l) => !l.startsWith('[ERRO DE'));
  const errosExec = erros.filter((l) => l.startsWith('[ERRO DE'));
  const logContent = [
    '========================================',
    'LOG DE ERROS - Preenchimento Rede (CSV)',
    '========================================',
    `Data: ${new Date().toISOString()}`,
    `CSV: ${csvPath}`,
    `Clientes atualizados: ${atualizados}`,
    `Total sem match (exato nem ≥80% compatibilidade): ${semMatch.length}`,
    '',
    '--- Itens sem match ---',
    '',
    ...semMatch,
    ...(errosExec.length ? ['', '--- Erros de conexão / execução ---', '', ...errosExec] : []),
    '',
    '========================================',
  ].join('\n');
  fs.writeFileSync(logPath, logContent, 'utf-8');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
