/**
 * Reconcilia `det_procuracoes` com o que o SPE mostra AGORA.
 *
 * Separado de `DetProcuracoesRegra` de propósito: lá é regra pura (entra
 * retrato, sai classificação) e dá para testar sem banco; aqui é o efeito
 * colateral. Quem quiser entender a decisão lê a regra; quem quiser entender a
 * escrita lê isto.
 *
 * MODO SECO: `dryRun` calcula o diff inteiro e não escreve nada. É o caminho
 * para conferir contra a tela do SPE antes de deixar a coleta gravar — mesma
 * ideia do `scrape:dry` do scraper do eCAC.
 *
 * LINHAS `origem='manual'`: não são sobrescritas às cegas. Foram alguém
 * declarando "esse cliente tem procuração" antes de o SPE mostrar. Duas saídas:
 *   - o SPE agora confirma  -> a linha vira `spe` (a declaração virou prova, e
 *                              o aviso "ainda não confirmado" some da tela)
 *   - o SPE segue sem nada  -> a linha continua deferida, mas a observação diz
 *                              que o SPE não confirma. Sem isso um palpite
 *                              errado ficaria sendo varrido para sempre, com a
 *                              tela contando o cliente como coberto.
 */

import { mysqlPool } from '../config/mysql';
import { classificar, indexar, soDigitos, type ProcSpe } from './DetProcuracoesRegra';

export interface MudancaProcuracao {
  cnpj: string;
  razaoSocial: string;
  de: string;
  para: string;
  motivo: string;
}

export interface ResumoSincronizacao {
  lidasNoSpe: number;
  clientesAvaliados: number;
  deferidos: number;
  indeferidos: number;
  ganharam: number;
  perderam: number;
  manuaisConfirmadas: number;
  manuaisSemConfirmacao: number;
  mudancas: MudancaProcuracao[];
  dryRun: boolean;
}

export async function reconciliarProcuracoes(
  procsSpe: ProcSpe[],
  opts: { dryRun?: boolean; log?: (m: string) => void } = {}
): Promise<ResumoSincronizacao> {
  const dryRun = opts.dryRun === true;
  const log = opts.log ?? (() => {});
  const idx = indexar(procsSpe);

  const conn = await mysqlPool.getConnection();
  try {
    const [clientes] = await conn.query<any[]>(
      'SELECT cnpj_limpo, razao_social FROM `clientes` WHERE `ativo` = 1'
    );
    const [atuaisRows] = await conn.query<any[]>(
      'SELECT cnpj, situacao, origem, observacao FROM `det_procuracoes`'
    );
    const atuais = new Map<string, any>(atuaisRows.map((r: any) => [r.cnpj, r]));

    const res: ResumoSincronizacao = {
      lidasNoSpe: idx.total,
      clientesAvaliados: 0,
      deferidos: 0,
      indeferidos: 0,
      ganharam: 0,
      perderam: 0,
      manuaisConfirmadas: 0,
      manuaisSemConfirmacao: 0,
      mudancas: [],
      dryRun,
    };

    for (const c of clientes) {
      const cnpj = soDigitos(c.cnpj_limpo);
      if (cnpj.length !== 14) continue;
      res.clientesAvaliados++;

      const antes = atuais.get(cnpj);
      const cls = classificar(cnpj, idx);
      const razao = String(c.razao_social ?? '').slice(0, 60);

      // Declaração manual que o SPE ainda não confirma: preserva o acesso,
      // mas deixa registrado que não há prova.
      if (antes?.origem === 'manual' && cls.situacao === 'indeferido') {
        res.manuaisSemConfirmacao++;
        res.deferidos++;
        if (!dryRun) {
          await conn.query(
            `UPDATE det_procuracoes
                SET observacao = ?, situacao_spe = NULL, verificado_em = NOW()
              WHERE cnpj = ?`,
            ['Informado manualmente — o SPE não confirma', cnpj]
          );
        }
        continue;
      }
      if (antes?.origem === 'manual' && cls.situacao === 'deferido') {
        res.manuaisConfirmadas++;
        res.mudancas.push({
          cnpj, razaoSocial: razao,
          de: 'manual (não confirmado)', para: 'confirmado no SPE',
          motivo: cls.observacao,
        });
      }

      cls.situacao === 'deferido' ? res.deferidos++ : res.indeferidos++;

      const situacaoAntes = antes?.situacao ?? '(inexistente)';
      if (situacaoAntes !== cls.situacao) {
        if (cls.situacao === 'deferido') res.ganharam++;
        else if (antes) res.perderam++;
        res.mudancas.push({
          cnpj, razaoSocial: razao,
          de: situacaoAntes, para: cls.situacao,
          motivo: cls.observacao,
        });
      }

      if (dryRun) continue;

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
        [
          cnpj, cls.situacao, cls.origem, cls.outorgante,
          cls.vigenciaInicio, cls.vigenciaFim, cls.situacaoSpe, cls.observacao,
        ]
      );
    }

    log(
      `SPE: ${res.lidasNoSpe} procuração(ões) lida(s) · ${res.deferidos} deferido(s), ` +
        `${res.indeferidos} indeferido(s) · ${res.ganharam} ganhou, ${res.perderam} perdeu` +
        (dryRun ? ' (modo seco — nada gravado)' : '')
    );
    return res;
  } finally {
    conn.release();
  }
}
