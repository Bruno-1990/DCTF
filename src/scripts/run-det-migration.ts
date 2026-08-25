/**
 * Executa a migration 045 (tabelas do DET) e faz a carga inicial de
 * `det_procuracoes` a partir do retrato do SPE de 21/08/2026.
 *
 * Passo A: cria as 3 tabelas a partir do .sql.
 * Passo B: cruza `clientes` (ativos) com o retrato do SPE e grava quem tem
 *          procuracao. A regra e a mesma validada no DET em 21/08/2026
 *          (amostra de 12 casos, 11 confirmados + 1 caso especial explicado):
 *            1. proprio escritorio  -> acessa sem procuracao
 *            2. procuracao ATIVA no proprio CNPJ
 *            3. procuracao ATIVA na RAIZ (matriz cobre filial — confirmado
 *               com a filial 03.597.050/0002-77)
 *            4. senao, indeferido (distinguindo "nunca teve" de "revogada/
 *               expirada", porque a acao com o cliente e diferente)
 *
 * Linhas com origem='manual' NAO sao sobrescritas: elas vieram de alguem que
 * informou e foi confirmado ao vivo contra o DET, o que e mais forte do que
 * um retrato de arquivo.
 *
 * Idempotente: pode rodar de novo.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
// Carrega o .env ANTES de importar o pool MySQL (que lê process.env no load).
dotenv.config({ path: path.join(process.cwd(), '.env') });
import { mysqlPool } from '../config/mysql';

const MIGRATION_FILE = path.join(
  process.cwd(),
  'docs',
  'migrations',
  'mysql',
  '045_create_det_notificacoes.sql'
);

const SPE_SNAPSHOT = path.join(
  process.cwd(),
  'data',
  'det',
  'spe-recebidas-2026-08-21.json'
);

const CNPJ_ESCRITORIO = '32401481000133';

interface ProcSpe {
  cnpj: string;
  nome: string;
  nivel: string;
  vigencia: string;
  situacao: string;
}

const soDigitos = (s: string): string => String(s ?? '').replace(/\D/g, '');

/** "19/01/2024 a 18/01/2029" -> ['2024-01-19', '2029-01-18'] */
function parseVigencia(v: string): [string | null, string | null] {
  const m = String(v ?? '').match(
    /(\d{2})\/(\d{2})\/(\d{4})\s*a\s*(\d{2})\/(\d{2})\/(\d{4})/
  );
  if (!m) return [null, null];
  return [`${m[3]}-${m[2]}-${m[1]}`, `${m[6]}-${m[5]}-${m[4]}`];
}

async function run(): Promise<void> {
  if (!fs.existsSync(MIGRATION_FILE)) {
    console.error('Migration não encontrada:', MIGRATION_FILE);
    process.exit(1);
  }
  if (!fs.existsSync(SPE_SNAPSHOT)) {
    console.error('Retrato do SPE não encontrado:', SPE_SNAPSHOT);
    process.exit(1);
  }

  // Tira as linhas de comentario ANTES de dividir. Dividir primeiro e depois
  // descartar o que "comeca com --" (padrao usado em migrations anteriores)
  // aqui apagaria os CREATE TABLE inteiros: cada um vem precedido de um bloco
  // de comentario, entao o statement todo comeca com '--'.
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  const statements = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const conn = await mysqlPool.getConnection();
  try {
    // ─── Passo A: criar tabelas ───
    for (const stmt of statements) {
      if (stmt.toUpperCase().startsWith('USE ')) continue;
      await conn.query(stmt + ';');
      const nome = stmt.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
      if (nome) console.log('  tabela OK:', nome[1]);
    }
    console.log('Passo A concluído — 3 tabelas criadas/verificadas.');

    // ─── Passo B: carga inicial ───
    const proc: ProcSpe[] = JSON.parse(fs.readFileSync(SPE_SNAPSHOT, 'utf8'));
    const porCnpj = new Map<string, ProcSpe[]>();
    const porRaiz = new Map<string, ProcSpe[]>();
    for (const p of proc) {
      const d = soDigitos(p.cnpj);
      if (d.length !== 14) continue;
      if (!porCnpj.has(d)) porCnpj.set(d, []);
      porCnpj.get(d)!.push(p);
      const r = d.slice(0, 8);
      if (!porRaiz.has(r)) porRaiz.set(r, []);
      porRaiz.get(r)!.push(p);
    }
    const ativas = (l: ProcSpe[] = []) =>
      l.filter((x) => x.situacao.trim().toLowerCase() === 'ativa');

    const [clientes] = await conn.query<any[]>(
      'SELECT cnpj_limpo, razao_social FROM `clientes` WHERE `ativo` = 1'
    );
    console.log(`Passo B — ${clientes.length} clientes ativos.`);

    // preserva o que foi informado manualmente
    const [manuais] = await conn.query<any[]>(
      "SELECT cnpj FROM `det_procuracoes` WHERE origem = 'manual'"
    );
    const protegidos = new Set(manuais.map((m) => m.cnpj));
    if (protegidos.size) console.log(`  ${protegidos.size} linha(s) manual(is) preservada(s).`);

    let deferidos = 0;
    let indeferidos = 0;
    let porRaizN = 0;

    for (const c of clientes) {
      const cnpj = soDigitos(c.cnpj_limpo);
      if (cnpj.length !== 14 || protegidos.has(cnpj)) continue;

      let situacao: 'deferido' | 'indeferido' = 'indeferido';
      let origem: 'spe' | 'manual' | 'proprio' = 'spe';
      let outorgante: string | null = null;
      let ini: string | null = null;
      let fim: string | null = null;
      let sitSpe: string | null = null;
      let obs = '';

      const exatas = ativas(porCnpj.get(cnpj));
      const raizes = ativas(porRaiz.get(cnpj.slice(0, 8)));

      if (cnpj === CNPJ_ESCRITORIO) {
        situacao = 'deferido';
        origem = 'proprio';
        obs = 'Próprio escritório — acessa sem procuração';
      } else if (exatas.length) {
        situacao = 'deferido';
        outorgante = cnpj;
        [ini, fim] = parseVigencia(exatas[0].vigencia);
        sitSpe = exatas[0].situacao;
        obs = 'Procuração no próprio CNPJ';
      } else if (raizes.length) {
        situacao = 'deferido';
        outorgante = soDigitos(raizes[0].cnpj);
        [ini, fim] = parseVigencia(raizes[0].vigencia);
        sitSpe = raizes[0].situacao;
        obs = `Coberto pela procuração da raiz (${raizes[0].cnpj})`;
        porRaizN++;
      } else {
        const antigas = porCnpj.get(cnpj) ?? porRaiz.get(cnpj.slice(0, 8)) ?? [];
        if (antigas.length) {
          sitSpe = antigas[0].situacao;
          [ini, fim] = parseVigencia(antigas[0].vigencia);
          obs = `Procuração ${antigas[0].situacao.toLowerCase()} — precisa renovar`;
        } else {
          obs = 'Nenhuma procuração no SPE — precisa ser outorgada';
        }
      }

      situacao === 'deferido' ? deferidos++ : indeferidos++;

      await conn.query(
        `INSERT INTO det_procuracoes
           (cnpj, situacao, origem, outorgante_cnpj, vigencia_inicio, vigencia_fim,
            situacao_spe, observacao, verificado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           situacao = VALUES(situacao),
           origem = VALUES(origem),
           outorgante_cnpj = VALUES(outorgante_cnpj),
           vigencia_inicio = VALUES(vigencia_inicio),
           vigencia_fim = VALUES(vigencia_fim),
           situacao_spe = VALUES(situacao_spe),
           observacao = VALUES(observacao),
           verificado_em = NOW()`,
        [cnpj, situacao, origem, outorgante, ini, fim, sitSpe, obs]
      );
    }

    console.log(`  deferido  : ${deferidos}  (${porRaizN} pela raiz)`);
    console.log(`  indeferido: ${indeferidos}`);

    const [chk] = await conn.query<any[]>(
      `SELECT situacao, COUNT(*) AS n FROM det_procuracoes GROUP BY situacao`
    );
    console.log('\nConferência na tabela:', JSON.stringify(chk));
    console.log('Migration 045 concluída.');
  } finally {
    conn.release();
    await mysqlPool.end();
  }
}

run().catch((e) => {
  console.error('ERRO:', e?.message ?? e);
  process.exit(1);
});
