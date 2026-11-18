/**
 * Atualiza a participação dos sócios (aba Clientes > Participação) a partir da última Situação
 * Fiscal já extraída — sem nenhuma consulta ao SERPRO. A consulta (individual ou em lote) só
 * grava os sócios em sitf_extracted_data; é aqui que eles chegam a clientes_socios.
 *
 * A prévia e a gravação usam o mesmo planejador, e a gravação refaz o plano no servidor com os
 * dados do momento (nunca confia no que a tela mandou).
 */
import { v4 as uuidv4 } from 'uuid';
import { executeQuery, executeTransaction } from '../../config/mysql';
import { Cliente } from '../../models/Cliente';
import { planejarParticipacao, type PlanoParticipacao, type SocioCadastro, type SocioSitf } from './planejador';
import { emitirParticipacao } from './eventos';

/**
 * 'desatualizada': há Situação Fiscal, mas não consultada no mês corrente. Ela não pode ser
 * aplicada (o quadro pode ter mudado desde então) e entra na fila de consulta obrigatória,
 * junto com 'sem_sitf'. As outras três só existem para a Situação Fiscal vigente.
 */
export type SituacaoParticipacao = 'sem_sitf' | 'desatualizada' | 'em_dia' | 'atualizar' | 'revisar';

export interface ItemPrevia {
  clienteId: string;
  razaoSocial: string;
  cnpj: string;
  situacao: SituacaoParticipacao;
  extraidoEm: string | null;
  /** Quando o relatório veio do SERPRO (sitf_downloads.consultado_em): é o que define a vigência. */
  consultadoEm: string | null;
  vigente: boolean;
  plano: PlanoParticipacao | null;
}

export interface ItemFila {
  cnpj: string;
  razaoSocial: string;
  clienteId: string;
  motivo: string;
}

export interface ClienteBase {
  id: string;
  razao_social: string | null;
  cnpj_limpo: string | null;
}

export interface ExtracaoSitf {
  cnpj: string;
  socios: SocioSitf[] | string | null;
  created_at: Date | string;
  consultado_em?: Date | string | null;
}

/** Acesso ao banco, separado para os testes. */
export interface RepositorioParticipacao {
  clientes(clienteIds?: string[]): Promise<ClienteBase[]>;
  idsPorCnpj(cnpj: string): Promise<string[]>;
  extracoes(cnpjs: string[]): Promise<ExtracaoSitf[]>;
  socios(clienteIds: string[]): Promise<Array<SocioCadastro & { cliente_id: string }>>;
  gravar(clienteId: string, plano: PlanoParticipacao): Promise<number>;
  recalcularValores(clienteId: string): Promise<void>;
  /** Põe na fila do lote de pendentes (sitf_lote_cnpjs_pendentes); não mexe em quem está em processamento. */
  enfileirar(itens: ItemFila[]): Promise<{ enfileirados: number; emProcessamento: number }>;
}

const soDigitos = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '');

/** Brasília não tem horário de verão desde 2019: o mês começa às 00:00 de -03:00. */
const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;

export function inicioDoMesVigente(agora: Date): Date {
  const local = new Date(agora.getTime() - OFFSET_BRASILIA_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + OFFSET_BRASILIA_MS);
}

/** "MM/AAAA" no horário de Brasília. */
const mesAno = (d: Date): string => {
  const local = new Date(d.getTime() - OFFSET_BRASILIA_MS);
  return `${String(local.getUTCMonth() + 1).padStart(2, '0')}/${local.getUTCFullYear()}`;
};

const temOQueGravar = (plano: PlanoParticipacao): boolean =>
  plano.mudancas.length + plano.entradas.length + plano.saidas.length > 0;

const situacaoDo = (plano: PlanoParticipacao): SituacaoParticipacao => {
  if (temOQueGravar(plano)) return 'atualizar';
  const temPendencia =
    plano.conflitos.length + plano.ambiguos.length + plano.soNaSitf.length + plano.soNoCadastro.length + plano.alertas.length;
  return temPendencia > 0 ? 'revisar' : 'em_dia';
};

export class ParticipacaoSitfService {
  constructor(
    private readonly repo: RepositorioParticipacao = repositorioMySql,
    private readonly agora: () => Date = () => new Date(),
  ) {}

  async previa(clienteIds?: string[]): Promise<ItemPrevia[]> {
    const clientes = await this.repo.clientes(clienteIds);
    if (clientes.length === 0) return [];
    const cnpjs = clientes.map((c) => soDigitos(c.cnpj_limpo)).filter((c) => c.length === 14);
    const [extracoes, socios] = await Promise.all([
      cnpjs.length ? this.repo.extracoes(cnpjs) : Promise.resolve([]),
      this.repo.socios(clientes.map((c) => c.id)),
    ]);

    // Mais de uma extração do mesmo CNPJ: vale a mais recente.
    const ultima = new Map<string, ExtracaoSitf>();
    for (const e of extracoes) {
      const atual = ultima.get(e.cnpj);
      if (!atual || new Date(e.created_at) > new Date(atual.created_at)) ultima.set(e.cnpj, e);
    }

    const inicioMes = inicioDoMesVigente(this.agora()).getTime();
    return clientes.map((c): ItemPrevia => {
      const cnpj = soDigitos(c.cnpj_limpo);
      const base = { clienteId: c.id, razaoSocial: c.razao_social ?? '', cnpj };
      const e = ultima.get(cnpj);
      if (!e) return { ...base, situacao: 'sem_sitf', extraidoEm: null, consultadoEm: null, vigente: false, plano: null };
      const consultado = e.consultado_em ? new Date(e.consultado_em) : null;
      const vigente = !!consultado && consultado.getTime() >= inicioMes;
      const plano = planejarParticipacao(socios.filter((s) => s.cliente_id === c.id), lerSocios(e.socios));
      return {
        ...base,
        situacao: vigente ? situacaoDo(plano) : 'desatualizada',
        extraidoEm: new Date(e.created_at).toISOString(),
        consultadoEm: consultado ? consultado.toISOString() : null,
        vigente,
        plano,
      };
    });
  }

  /**
   * Consulta obrigatória: quem não tem Situação Fiscal do mês corrente vai para a fila do lote
   * de pendentes (/api/situacao-fiscal/lote/iniciar-pendentes).
   */
  async enfileirarConsultaObrigatoria(): Promise<{ enfileirados: number; emProcessamento: number; mesVigente: string }> {
    const mesVigente = mesAno(this.agora());
    const itens = (await this.previa()).filter((i) => !i.vigente && i.cnpj.length === 14);
    if (itens.length === 0) return { enfileirados: 0, emProcessamento: 0, mesVigente };
    const fila: ItemFila[] = itens.map((i) => ({
      cnpj: i.cnpj,
      razaoSocial: i.razaoSocial,
      clienteId: i.clienteId,
      motivo: i.consultadoEm
        ? `Situação Fiscal de ${mesAno(new Date(i.consultadoEm))}, fora de ${mesVigente}`
        : i.situacao === 'sem_sitf'
          ? 'Sem Situação Fiscal consultada'
          : `Situação Fiscal sem data de consulta, fora de ${mesVigente}`,
    }));
    return { ...(await this.repo.enfileirar(fila)), mesVigente };
  }

  /** A linha de um cliente (o SSE manda a linha refeita depois de gravar). */
  async previaDoCliente(clienteId: string): Promise<ItemPrevia[]> {
    return this.previa([clienteId]);
  }

  /** As linhas dos clientes ativos com este CNPJ (o SSE manda depois que a extração termina). */
  async previaDoCnpj(cnpj: string): Promise<ItemPrevia[]> {
    const ids = await this.repo.idsPorCnpj(soDigitos(cnpj));
    return ids.length ? this.previa(ids) : [];
  }

  /** Grava só as mudanças do plano refeito agora; quem não tem o que mudar é devolvido como ignorado. */
  async aplicar(clienteIds: string[]): Promise<{
    aplicados: Array<{ clienteId: string; sociosAtualizados: number }>;
    ignorados: Array<{ clienteId: string; motivo: string }>;
  }> {
    const ids = [...new Set(clienteIds.filter(Boolean))];
    const itens = await this.previa(ids);
    const aplicados: Array<{ clienteId: string; sociosAtualizados: number }> = [];
    const ignorados: Array<{ clienteId: string; motivo: string }> = [];
    const encontrados = new Set(itens.map((i) => i.clienteId));
    for (const id of ids) if (!encontrados.has(id)) ignorados.push({ clienteId: id, motivo: 'cliente não encontrado' });

    for (const item of itens) {
      if (!item.plano) {
        ignorados.push({ clienteId: item.clienteId, motivo: 'sem Situação Fiscal extraída' });
        continue;
      }
      if (!item.vigente) {
        const de = item.consultadoEm ? mesAno(new Date(item.consultadoEm)) : 'data desconhecida';
        ignorados.push({ clienteId: item.clienteId, motivo: `Situação Fiscal de ${de}: consulte de novo antes de aplicar` });
        continue;
      }
      if (!temOQueGravar(item.plano)) {
        ignorados.push({ clienteId: item.clienteId, motivo: 'nada a mudar' });
        continue;
      }
      const n = await this.repo.gravar(item.clienteId, item.plano);
      const mexeuNoCapital =
        item.plano.mudancas.some((m) => m.percentual || m.volta) || item.plano.entradas.length > 0 || item.plano.saidas.length > 0;
      if (mexeuNoCapital) await this.repo.recalcularValores(item.clienteId);
      aplicados.push({ clienteId: item.clienteId, sociosAtualizados: n });
      emitirParticipacao({ tipo: 'aplicado', clienteId: item.clienteId, sociosAtualizados: n });
    }
    return { aplicados, ignorados };
  }
}

function lerSocios(v: ExtracaoSitf['socios']): SocioSitf[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try {
    const p = JSON.parse(v);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

const marcas = (n: number) => Array(n).fill('?').join(',');

export const repositorioMySql: RepositorioParticipacao = {
  async clientes(clienteIds) {
    const filtro = clienteIds && clienteIds.length ? ` AND id IN (${marcas(clienteIds.length)})` : '';
    return executeQuery<ClienteBase>(
      `SELECT id, razao_social, cnpj_limpo FROM clientes WHERE COALESCE(ativo, 1) = 1${filtro} ORDER BY razao_social`,
      clienteIds && clienteIds.length ? clienteIds : [],
    );
  },
  async idsPorCnpj(cnpj) {
    const rows = await executeQuery<{ id: string }>(
      'SELECT id FROM clientes WHERE cnpj_limpo = ? AND COALESCE(ativo, 1) = 1',
      [cnpj],
    );
    return rows.map((r) => r.id);
  },
  async extracoes(cnpjs) {
    return executeQuery<ExtracaoSitf>(
      // A nova consulta do mesmo CNPJ atualiza a linha: o created_at fica o da primeira extração e o
      // updated_at (ON UPDATE CURRENT_TIMESTAMP) é a data da extração vigente.
      // consultado_em (migration 058) vem do download: reextrair o mesmo PDF não renova a vigência.
      `SELECT e.cnpj, e.socios, COALESCE(e.updated_at, e.created_at) AS created_at, d.consultado_em
         FROM sitf_extracted_data e
         LEFT JOIN sitf_downloads d ON d.id = e.sitf_download_id
        WHERE e.cnpj IN (${marcas(cnpjs.length)})`,
      cnpjs,
    );
  },
  async socios(clienteIds) {
    if (clienteIds.length === 0) return [];
    return executeQuery<SocioCadastro & { cliente_id: string }>(
      `SELECT id, cliente_id, nome, cpf, qual, participacao_percentual, ausente_no_cartao FROM clientes_socios WHERE cliente_id IN (${marcas(clienteIds.length)})`,
      clienteIds,
    );
  },
  async gravar(clienteId, plano) {
    return executeTransaction(async (conn) => {
      let n = 0;
      for (const m of plano.mudancas) {
        // As condições repetem o plano no banco: CPF só onde está vazio, sempre do próprio cliente.
        if (m.cpf) {
          await conn.execute(
            "UPDATE clientes_socios SET cpf = ?, updated_at = NOW() WHERE id = ? AND cliente_id = ? AND (cpf IS NULL OR cpf = '')",
            [m.cpf.para, m.socioId, clienteId],
          );
        }
        if (m.percentual) {
          await conn.execute(
            'UPDATE clientes_socios SET participacao_percentual = ?, updated_at = NOW() WHERE id = ? AND cliente_id = ?',
            [m.percentual.para, m.socioId, clienteId],
          );
        }
        if (m.volta) {
          await conn.execute(
            'UPDATE clientes_socios SET ausente_no_cartao = 0, ausente_no_cartao_em = NULL, updated_at = NOW() WHERE id = ? AND cliente_id = ?',
            [m.socioId, clienteId],
          );
        }
        n++;
      }
      // Saiu do quadro: marca, nunca apaga (o botão da tela apaga quem está marcado, se o analista quiser).
      for (const s of plano.saidas) {
        await conn.execute(
          'UPDATE clientes_socios SET ausente_no_cartao = 1, ausente_no_cartao_em = COALESCE(ausente_no_cartao_em, NOW()), updated_at = NOW() WHERE id = ? AND cliente_id = ?',
          [s.socioId, clienteId],
        );
        n++;
      }
      for (const e of plano.entradas) {
        // Idempotente: se outro clique já criou o sócio com este CPF/CNPJ, não duplica.
        const [ja]: any = await conn.query('SELECT id FROM clientes_socios WHERE cliente_id = ? AND cpf = ? LIMIT 1', [clienteId, e.cpf]);
        if ((ja as any[]).length) continue;
        await conn.execute(
          `INSERT INTO clientes_socios (id, cliente_id, nome, cpf, qual, participacao_percentual, ausente_no_cartao)
           VALUES (?, ?, ?, ?, ?, ?, 0)`,
          [uuidv4(), clienteId, e.nome.slice(0, 255), e.cpf, e.qual.slice(0, 120), e.participacao_percentual],
        );
        n++;
      }
      return n;
    });
  },
  async enfileirar(itens) {
    return executeTransaction(async (conn) => {
      const [ocupados]: any = await conn.query(
        `SELECT cnpj FROM sitf_lote_cnpjs_pendentes WHERE status = 'processando' AND cnpj IN (${marcas(itens.length)})`,
        itens.map((i) => i.cnpj),
      );
      const emProcessamento = new Set<string>((ocupados as Array<{ cnpj: string }>).map((o) => o.cnpj));
      const livres = itens.filter((i) => !emProcessamento.has(i.cnpj));
      for (const i of livres) {
        // uk_cnpj: quem já estava na fila (concluído, com erro ou pendente) volta para 'pendente' do zero.
        await conn.execute(
          `INSERT INTO sitf_lote_cnpjs_pendentes (cnpj, razao_social, cliente_id, motivo, status, tentativas)
           VALUES (?, ?, ?, ?, 'pendente', 0)
           ON DUPLICATE KEY UPDATE razao_social = VALUES(razao_social), cliente_id = VALUES(cliente_id),
             motivo = VALUES(motivo), status = 'pendente', tentativas = 0, ultimo_erro = NULL,
             processado_em = NULL, progress_id = NULL, criado_em = CURRENT_TIMESTAMP`,
          [i.cnpj, i.razaoSocial.slice(0, 255), i.clienteId, i.motivo.slice(0, 255)],
        );
      }
      return { enfileirados: livres.length, emProcessamento: emProcessamento.size };
    });
  },
  async recalcularValores(clienteId) {
    const r = await new Cliente().recalcularValoresParticipacao(clienteId);
    if (!r.success) throw new Error(r.error || 'Erro ao recalcular os valores de participação');
  },
};
