/**
 * Sincronização SCI (Firebird) → MySQL `host_dados` — a aba Clientes >
 * Lançamentos (SCI) e as conferências de obrigação da DCTFWeb leem daqui.
 *
 * ANTES, isto chamava scripts Python fora do projeto (Documents\export\
 * Automatico\main.py e afins). Eles sumiram da máquina e o botão "Atualizar"
 * passou a dar erro 500. As consultas foram reconstruídas contra o que aqueles
 * scripts gravaram — ver `hostDadosSci.rules.ts` — e agora rodam daqui, pela
 * mesma ponte Python que o resto do backend usa para ler o SCI.
 *
 * CADA MÊS É SUBSTITUÍDO INTEIRO, numa transação (DELETE do mês + INSERT). Não
 * é UPSERT de propósito: a chave única de host_dados inclui `especie`, que é
 * NULL em CTB e FPG, e NULL nunca colide em UNIQUE — o upsert do script antigo
 * duplicava essas linhas a cada rodada. Substituir também faz sair do mês o que
 * foi excluído no SCI. O DELETE só acontece depois de todas as consultas do mês
 * voltarem: SCI fora do ar não apaga nada.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { executeQuery, getConnection } from '../config/mysql';
import { comLockSci } from './sciLock';
import {
  Competencia,
  ContagensSci,
  LinhaHostDados,
  indexarEmpresas,
  limitesDoMes,
  mesAnterior,
  mesesDoIntervalo,
  montarLinhas,
} from './hostDadosSci.rules';

const execAsync = promisify(exec);

/** Por consulta. As mais pesadas (saídas, contábil) levam ~30s num mês cheio. */
const SCI_TIMEOUT_MS = 5 * 60 * 1000;

interface SyncResult {
  success: boolean;
  periodo: string;
  data_ini?: string;
  data_fim?: string;
  /** Linhas gravadas por relatório. */
  fpg?: number;
  ctb?: number;
  fise?: number;
  fiss?: number;
  total?: number;
  erros?: string[];
  error?: string;
}

/**
 * Trava do processo inteiro, não da instância: o controller cria o serviço a
 * cada request e o agendador tem o seu. Duas sincronizações ao mesmo tempo
 * disputariam o DELETE/INSERT do mesmo mês.
 */
let emAndamento = false;

export function sincronizacaoEmAndamento(): boolean {
  return emAndamento;
}

function rotulo({ ano, mes }: Competencia): string {
  return `${String(mes).padStart(2, '0')}/${ano}`;
}

async function consultarSci(sql: string): Promise<any[][]> {
  const scriptPath = path.join(__dirname, '../../python/catalog/executar_sql.py');
  const b64 = Buffer.from(sql, 'utf-8').toString('base64');
  const { stdout } = await comLockSci(() =>
    execAsync(`python "${scriptPath}" --base64 ${b64}`, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
      timeout: SCI_TIMEOUT_MS,
    })
  );
  let parsed: any;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error('Resposta inválida do SCI.');
  }
  if (!parsed?.success) throw new Error(parsed?.error || 'Falha na consulta ao SCI.');
  return parsed.rows || [];
}

async function coletarMes(comp: Competencia): Promise<LinhaHostDados[]> {
  const { ini, fim } = limitesDoMes(comp);
  const entre = (coluna: string) => `${coluna} BETWEEN '${ini}' AND '${fim}'`;

  // Uma por vez: o lock do SCI serializaria de qualquer jeito.
  const entradas = await consultarSci(
    `SELECT BDCODEMP, BDESPECIE, COUNT(*) FROM VW_VEF_CONSULTA_LAN_ENTRADA ` +
      `WHERE ${entre('BDDATAENTRADAENT')} AND BDDATACANC IS NULL GROUP BY 1, 2`
  );
  const saidas = await consultarSci(
    `SELECT BDCODEMP, BDESPECIE, COUNT(*) FROM VW_VEF_CONSULTA_LAN_SAIDA ` +
      `WHERE ${entre('BDDATASAIDA')} AND BDDATACANC IS NULL GROUP BY 1, 2`
  );
  const contabil = await consultarSci(
    `SELECT EMP_BDCODEMP, COUNT(*) FROM VWGR_VSUC_LANCAMENTO WHERE ${entre('LAN_BDDATA')} GROUP BY 1`
  );
  const admissoes = await consultarSci(
    `SELECT BDCODEMP, COUNT(*) FROM VW_COLABORADORES WHERE ${entre('BDDATAADMCOL')} GROUP BY 1`
  );
  const rescisoes = await consultarSci(
    `SELECT BDCODEMP, COUNT(*) FROM VRH_EMP_TRESCISAO WHERE ${entre('BDDATARESCISAO')} GROUP BY 1`
  );
  const empresas = await consultarSci(`SELECT BDCODEMP, BDNOMEMP, BDCNPJEMP FROM VW_TEMPRESAS_REF`);

  const contagens: ContagensSci = {
    entradas: entradas as ContagensSci['entradas'],
    saidas: saidas as ContagensSci['saidas'],
    contabil: contabil as ContagensSci['contabil'],
    admissoes: admissoes as ContagensSci['admissoes'],
    rescisoes: rescisoes as ContagensSci['rescisoes'],
  };
  return montarLinhas(comp, contagens, indexarEmpresas(empresas as any));
}

async function gravarMes(comp: Competencia, linhas: LinhaHostDados[]): Promise<void> {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM host_dados WHERE ano = ? AND mes = ?', [comp.ano, comp.mes]);
    if (linhas.length > 0) {
      await connection.query(
        'INSERT INTO host_dados (cod_emp, razao, cnpj, ano, mes, movimentacao, tipo, relatorio, especie) VALUES ?',
        [linhas.map((l) => [l.cod_emp, l.razao, l.cnpj, l.ano, l.mes, l.movimentacao, l.tipo, l.relatorio, l.especie])]
      );
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export type OrigemSync = 'manual' | 'agendado';

export interface UltimaSincronizacao {
  concluidoEm: string;
  periodo: string;
  origem: OrigemSync;
  linhas: number;
  sucesso: boolean;
  erro: string | null;
}

let histTableReady = false;

/**
 * Histórico de TODA sincronização (botão, período manual e agendada). O
 * `host_dados_sync_log` do agendador só tem a rodada das 4h e serve de trava do
 * dia; não diz quando o dado foi atualizado de fato por quem clicou.
 */
async function garantirTabelaHistorico(): Promise<void> {
  if (histTableReady) return;
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS host_dados_sync_hist (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      iniciado_em DATETIME NOT NULL,
      concluido_em DATETIME NOT NULL,
      periodo VARCHAR(40) NOT NULL,
      origem VARCHAR(10) NOT NULL,
      linhas INT NOT NULL DEFAULT 0,
      sucesso TINYINT(1) NOT NULL,
      erro TEXT NULL,
      PRIMARY KEY (id),
      KEY idx_host_dados_sync_hist_fim (concluido_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  histTableReady = true;
}

async function registrarExecucao(
  iniciadoEm: Date,
  periodo: string,
  origem: OrigemSync,
  linhas: number,
  erro: string | undefined
): Promise<void> {
  try {
    await garantirTabelaHistorico();
    await executeQuery(
      `INSERT INTO host_dados_sync_hist (iniciado_em, concluido_em, periodo, origem, linhas, sucesso, erro)
       VALUES (?, NOW(), ?, ?, ?, ?, ?)`,
      [iniciadoEm, periodo, origem, linhas, erro ? 0 : 1, erro ? erro.slice(0, 2000) : null]
    );
  } catch (err: any) {
    // Registro é informativo: nunca derruba uma sincronização que já gravou.
    console.error('[FirebirdSync] Não consegui registrar o histórico:', err?.message || err);
  }
}

/** Última sincronização que TERMINOU (com sucesso ou não), ou null se nunca houve. */
export async function ultimaSincronizacao(): Promise<UltimaSincronizacao | null> {
  await garantirTabelaHistorico();
  const rows: any[] = await executeQuery(
    `SELECT DATE_FORMAT(concluido_em, '%Y-%m-%dT%H:%i:%s') AS concluido_em, periodo, origem, linhas, sucesso, erro
       FROM host_dados_sync_hist ORDER BY concluido_em DESC, id DESC LIMIT 1`
  );
  const r = rows?.[0];
  if (!r) return null;
  return {
    concluidoEm: r.concluido_em,
    periodo: r.periodo,
    origem: r.origem,
    linhas: Number(r.linhas),
    sucesso: !!r.sucesso,
    erro: r.erro ?? null,
  };
}

export class FirebirdSyncService {
  /** Sincroniza uma competência (ano/mês). */
  async sincronizarPeriodo(ano: number, mes: number, origem: OrigemSync = 'manual'): Promise<SyncResult> {
    if (mes < 1 || mes > 12) {
      return { success: false, periodo: rotulo({ ano, mes }), error: 'Mês deve estar entre 1 e 12' };
    }
    return this.sincronizar([{ ano, mes }], rotulo({ ano, mes }), origem);
  }

  /** Botão "Atualizar" e agendamento diário: a competência anterior à data de hoje. */
  async sincronizarAutomatico(origem: OrigemSync = 'manual'): Promise<SyncResult> {
    const comp = mesAnterior(new Date());
    return this.sincronizar([comp], rotulo(comp), origem);
  }

  /** "Manual" da tela: cada mês tocado pelo intervalo, sempre inteiro. */
  async sincronizarPorDatas(dataIni: string, dataFim: string, origem: OrigemSync = 'manual'): Promise<SyncResult> {
    let meses: Competencia[];
    try {
      meses = mesesDoIntervalo(dataIni, dataFim);
    } catch (err: any) {
      return { success: false, periodo: `${dataIni} a ${dataFim}`, error: err.message };
    }
    const periodo =
      meses.length === 1 ? rotulo(meses[0]) : `${rotulo(meses[0])} a ${rotulo(meses[meses.length - 1])}`;
    return this.sincronizar(meses, periodo, origem);
  }

  private async sincronizar(meses: Competencia[], periodo: string, origem: OrigemSync): Promise<SyncResult> {
    if (emAndamento) {
      return { success: false, periodo, error: 'Já existe uma sincronização com o SCI em andamento. Aguarde terminar.' };
    }
    emAndamento = true;

    const iniciadoEm = new Date();
    const contagem = { FPG: 0, CTB: 0, FISE: 0, FISS: 0 };
    const erros: string[] = [];
    try {
      for (const comp of meses) {
        const inicio = Date.now();
        try {
          const linhas = await coletarMes(comp);
          await gravarMes(comp, linhas);
          for (const l of linhas) contagem[l.relatorio] += 1;
          console.log(
            `[FirebirdSync] ${rotulo(comp)}: ${linhas.length} linha(s) gravada(s) em ${Math.round((Date.now() - inicio) / 1000)}s`
          );
        } catch (err: any) {
          const msg = `${rotulo(comp)}: ${err?.message || err}`;
          console.error('[FirebirdSync] Falha —', msg);
          erros.push(msg);
        }
      }
    } finally {
      emAndamento = false;
    }

    const total = contagem.FPG + contagem.CTB + contagem.FISE + contagem.FISS;
    await registrarExecucao(iniciadoEm, periodo, origem, total, erros.length > 0 ? erros.join('; ') : undefined);
    const primeiro = limitesDoMes(meses[0]);
    const ultimo = limitesDoMes(meses[meses.length - 1]);
    return {
      success: erros.length === 0,
      periodo,
      data_ini: primeiro.ini,
      data_fim: ultimo.fim,
      fpg: contagem.FPG,
      ctb: contagem.CTB,
      fise: contagem.FISE,
      fiss: contagem.FISS,
      total,
      erros,
      error: erros.length > 0 ? erros.join('; ') : undefined,
    };
  }
}
