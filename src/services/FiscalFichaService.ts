/**
 * FiscalFichaService — leitura e escrita da ficha fiscal por colaborador.
 *
 * A regra que organiza este arquivo inteiro: `fiscal_ficha` guarda SÓ o que o
 * usuário digita (perfil, volume de NF, envia SPED, particularidade). Tudo o que
 * identifica a empresa — CNPJ, razão social, regime, benefício — vem de
 * `clientes` por JOIN em toda leitura. Nada é copiado, então nada envelhece:
 * cliente que muda de regime no cadastro aparece com o regime novo na ficha,
 * sem ninguém sincronizar coisa alguma.
 */

import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { mysqlPool } from '../config/mysql';
import {
  PERFIS,
  VOLUMES_NF,
  OPCOES_SPED,
  PARTICULARIDADE_MAX,
  valorValido,
  normalizarOpcao,
} from './FiscalOpcoes';

export interface Colaborador {
  id: number;
  nome: string;
  ordem: number;
  /** Linhas ativas (não inutilizadas) na carteira. */
  total: number;
  /** Ativas com perfil, volume e SPED respondidos. */
  preenchidas: number;
  /** Marcadas como "não é minha". */
  inutilizadas: number;
}

export interface LinhaFicha {
  id: number;
  clienteId: string;
  cnpj: string | null;
  razaoSocial: string;
  codigoSci: string | null;
  regimeTributario: string | null;
  beneficiosFiscais: string | null;
  /** `clientes.ativo` — empresa inativada no cadastro ainda aparece, sinalizada. */
  clienteAtivo: boolean;
  /**
   * Município e UF do cadastro. Não cabem numa coluna da tabela, mas o modo
   * foco tem espaço — e é o que ajuda a reconhecer de qual filial se trata
   * quando três empresas dividem a mesma razão social.
   */
  municipio: string | null;
  uf: string | null;
  perfil: string | null;
  volumeNf: string | null;
  enviaSped: string | null;
  particularidade: string | null;
  inutilizado: boolean;
  inutilizadoEm: string | null;
  inutilizadoMotivo: string | null;
  origem: string;
  atualizadoEm: string | null;
}

export interface ClienteDisponivel {
  id: string;
  cnpj: string | null;
  razaoSocial: string;
  codigoSci: string | null;
  regimeTributario: string | null;
  ativo: boolean;
  /** Nomes de quem já tem essa empresa na carteira. Vazio = livre. */
  jaCom: string[];
}

/** Campos que o PATCH aceita. Qualquer outro é ignorado, não é erro. */
export interface EdicaoFicha {
  perfil?: unknown;
  volumeNf?: unknown;
  enviaSped?: unknown;
  particularidade?: unknown;
}

export class ErroValidacao extends Error {}

/** `Date`/`string` do driver → ISO, ou null. */
function iso(valor: any): string | null {
  if (!valor) return null;
  if (valor instanceof Date) return valor.toISOString();
  return String(valor);
}

class FiscalFichaService {
  // ─── Colaboradores ───────────────────────────────────────────────────────

  /**
   * Colaboradores ativos com o progresso de cada um.
   *
   * Os contadores vêm no mesmo SELECT porque o seletor da tela mostra
   * "IAN — 12/65" no próprio dropdown: buscar isso depois, um por colaborador,
   * seriam dez requisições só para desenhar um combo.
   */
  async listarColaboradores(): Promise<Colaborador[]> {
    const [rows] = await mysqlPool.query<RowDataPacket[]>(`
      SELECT
        col.id,
        col.nome,
        col.ordem,
        COALESCE(SUM(f.inutilizado = 0), 0) AS total,
        COALESCE(SUM(
          f.inutilizado = 0
          AND f.perfil IS NOT NULL
          AND f.volume_nf IS NOT NULL
          AND f.envia_sped IS NOT NULL
        ), 0) AS preenchidas,
        COALESCE(SUM(f.inutilizado = 1), 0) AS inutilizadas
      FROM fiscal_colaboradores col
      LEFT JOIN fiscal_ficha f ON f.colaborador_id = col.id
      WHERE col.ativo = 1
      GROUP BY col.id, col.nome, col.ordem
      ORDER BY col.ordem, col.nome
    `);

    return rows.map((r) => ({
      id: Number(r.id),
      nome: String(r.nome),
      ordem: Number(r.ordem),
      total: Number(r.total),
      preenchidas: Number(r.preenchidas),
      inutilizadas: Number(r.inutilizadas),
    }));
  }

  // ─── Ficha ───────────────────────────────────────────────────────────────

  /** A carteira de um colaborador, com os dados da empresa vindos de `clientes`. */
  async listarFicha(colaboradorId: number): Promise<LinhaFicha[]> {
    const [rows] = await mysqlPool.query<RowDataPacket[]>(
      `SELECT
         f.id, f.cliente_id, f.perfil, f.volume_nf, f.envia_sped, f.particularidade,
         f.inutilizado, f.inutilizado_em, f.inutilizado_motivo, f.origem,
         f.atualizado_em,
         c.razao_social, c.cnpj_limpo, c.codigo_sci, c.municipio, c.uf,
         c.regime_tributario, c.beneficios_fiscais, c.ativo AS cliente_ativo
       FROM fiscal_ficha f
       JOIN clientes c ON c.id = f.cliente_id
       WHERE f.colaborador_id = ?
       ORDER BY f.inutilizado ASC, c.razao_social ASC, c.cnpj_limpo ASC`,
      [colaboradorId]
    );

    return rows.map((r) => ({
      id: Number(r.id),
      clienteId: String(r.cliente_id),
      cnpj: r.cnpj_limpo ?? null,
      razaoSocial: String(r.razao_social),
      codigoSci: r.codigo_sci ?? null,
      regimeTributario: r.regime_tributario ?? null,
      beneficiosFiscais: r.beneficios_fiscais ?? null,
      clienteAtivo: Number(r.cliente_ativo) === 1,
      municipio: r.municipio ?? null,
      uf: r.uf ?? null,
      perfil: r.perfil ?? null,
      volumeNf: r.volume_nf ?? null,
      enviaSped: r.envia_sped ?? null,
      particularidade: r.particularidade ?? null,
      inutilizado: Number(r.inutilizado) === 1,
      inutilizadoEm: iso(r.inutilizado_em),
      inutilizadoMotivo: r.inutilizado_motivo ?? null,
      origem: String(r.origem),
      atualizadoEm: iso(r.atualizado_em),
    }));
  }

  /**
   * Grava os campos preenchidos na tela.
   *
   * Só toca nos campos que vieram no corpo — mandar `{ perfil }` não apaga a
   * particularidade que já estava lá. `null` é diferente de ausente: significa
   * "limpar", e é assim que a tela desfaz uma escolha errada.
   */
  async atualizar(fichaId: number, dados: EdicaoFicha): Promise<LinhaFicha | null> {
    const sets: string[] = [];
    const params: any[] = [];

    if ('perfil' in dados) {
      const valor = normalizarOpcao(dados.perfil);
      if (!valorValido(PERFIS, valor)) {
        throw new ErroValidacao(`Perfil inválido: ${String(dados.perfil)}`);
      }
      sets.push('perfil = ?');
      params.push(valor);
    }
    if ('volumeNf' in dados) {
      const valor = normalizarOpcao(dados.volumeNf);
      if (!valorValido(VOLUMES_NF, valor)) {
        throw new ErroValidacao(`Volume de NF inválido: ${String(dados.volumeNf)}`);
      }
      sets.push('volume_nf = ?');
      params.push(valor);
    }
    if ('enviaSped' in dados) {
      const valor = normalizarOpcao(dados.enviaSped);
      if (!valorValido(OPCOES_SPED, valor)) {
        throw new ErroValidacao(`Valor inválido para envia SPED: ${String(dados.enviaSped)}`);
      }
      sets.push('envia_sped = ?');
      params.push(valor);
    }
    if ('particularidade' in dados) {
      const texto = normalizarOpcao(dados.particularidade);
      if (texto !== null && texto.length > PARTICULARIDADE_MAX) {
        throw new ErroValidacao(`Particularidade passa de ${PARTICULARIDADE_MAX} caracteres.`);
      }
      sets.push('particularidade = ?');
      params.push(texto);
    }

    if (sets.length === 0) throw new ErroValidacao('Nada para atualizar.');

    // Carimba a primeira vez que os três campos ficam completos. O COALESCE
    // preserva o carimbo original: quem preencheu em agosto e corrigiu em
    // setembro continua com a data de agosto.
    sets.push(`preenchido_em = CASE
        WHEN perfil IS NOT NULL AND volume_nf IS NOT NULL AND envia_sped IS NOT NULL
        THEN COALESCE(preenchido_em, NOW())
        ELSE NULL END`);

    params.push(fichaId);
    const [res] = await mysqlPool.query<ResultSetHeader>(
      `UPDATE fiscal_ficha SET ${sets.join(', ')} WHERE id = ?`,
      params
    );
    if (res.affectedRows === 0) return null;

    return this.buscarLinha(fichaId);
  }

  /** Uma linha só, no mesmo formato de `listarFicha` — usada nas respostas de escrita. */
  async buscarLinha(fichaId: number): Promise<LinhaFicha | null> {
    const [rows] = await mysqlPool.query<RowDataPacket[]>(
      'SELECT colaborador_id FROM fiscal_ficha WHERE id = ?',
      [fichaId]
    );
    if (rows.length === 0) return null;
    const linhas = await this.listarFicha(Number(rows[0].colaborador_id));
    return linhas.find((l) => l.id === fichaId) ?? null;
  }

  // ─── Adicionar / inutilizar ──────────────────────────────────────────────

  /**
   * Põe um cliente já cadastrado na carteira de alguém.
   *
   * Não bloqueia quando a empresa já é de outro colaborador — devolve o aviso
   * junto com a linha criada. Bloquear seria decidir, no lugar do time, qual
   * das duas atribuições está certa; avisar deixa a decisão com quem sabe.
   */
  async adicionar(
    colaboradorId: number,
    clienteId: string
  ): Promise<{ linha: LinhaFicha; aviso: string | null }> {
    const [cliente] = await mysqlPool.query<RowDataPacket[]>(
      'SELECT id FROM clientes WHERE id = ?',
      [clienteId]
    );
    if (cliente.length === 0) {
      throw new ErroValidacao('Cliente não encontrado no cadastro.');
    }

    const [jaExiste] = await mysqlPool.query<RowDataPacket[]>(
      'SELECT id, inutilizado FROM fiscal_ficha WHERE colaborador_id = ? AND cliente_id = ?',
      [colaboradorId, clienteId]
    );

    let fichaId: number;
    if (jaExiste.length > 0) {
      // Já esteve na lista e foi dispensada: adicionar de novo é reativar, não
      // criar uma segunda linha (e a UNIQUE impediria de qualquer forma).
      fichaId = Number(jaExiste[0].id);
      if (Number(jaExiste[0].inutilizado) === 1) {
        await mysqlPool.query(
          `UPDATE fiscal_ficha
             SET inutilizado = 0, inutilizado_em = NULL, inutilizado_motivo = NULL
           WHERE id = ?`,
          [fichaId]
        );
      }
    } else {
      const [res] = await mysqlPool.query<ResultSetHeader>(
        `INSERT INTO fiscal_ficha (colaborador_id, cliente_id, origem)
         VALUES (?, ?, 'manual')`,
        [colaboradorId, clienteId]
      );
      fichaId = res.insertId;
    }

    const [outros] = await mysqlPool.query<RowDataPacket[]>(
      `SELECT col.nome
         FROM fiscal_ficha f
         JOIN fiscal_colaboradores col ON col.id = f.colaborador_id
        WHERE f.cliente_id = ? AND f.colaborador_id <> ? AND f.inutilizado = 0`,
      [clienteId, colaboradorId]
    );

    const linha = await this.buscarLinha(fichaId);
    if (!linha) throw new Error('Linha não encontrada após inserir.');

    const nomes = outros.map((o) => String(o.nome));
    return {
      linha,
      aviso: nomes.length
        ? `Esta empresa também está na carteira de ${nomes.join(', ')}.`
        : null,
    };
  }

  /** "Essa empresa não é minha." A linha fica, riscada, com o motivo. */
  async inutilizar(fichaId: number, motivo: string | null): Promise<LinhaFicha | null> {
    const texto = normalizarOpcao(motivo);
    if (texto !== null && texto.length > 255) {
      throw new ErroValidacao('Motivo passa de 255 caracteres.');
    }
    const [res] = await mysqlPool.query<ResultSetHeader>(
      `UPDATE fiscal_ficha
          SET inutilizado = 1, inutilizado_em = NOW(), inutilizado_motivo = ?
        WHERE id = ?`,
      [texto, fichaId]
    );
    if (res.affectedRows === 0) return null;
    return this.buscarLinha(fichaId);
  }

  /** Desfaz o "não é minha". O que já estava preenchido continua lá. */
  async reativar(fichaId: number): Promise<LinhaFicha | null> {
    const [res] = await mysqlPool.query<ResultSetHeader>(
      `UPDATE fiscal_ficha
          SET inutilizado = 0, inutilizado_em = NULL, inutilizado_motivo = NULL
        WHERE id = ?`,
      [fichaId]
    );
    if (res.affectedRows === 0) return null;
    return this.buscarLinha(fichaId);
  }

  // ─── Busca para o "adicionar empresa" ────────────────────────────────────

  /**
   * Clientes do cadastro que ainda não estão na carteira do colaborador.
   *
   * Busca por razão social, CNPJ (com ou sem máscara) ou código SCI. Inativos
   * entram no resultado sinalizados em vez de sumirem: empresa inativada por
   * engano no cadastro é caso real, e escondê-la aqui deixaria o usuário sem
   * entender por que não acha a empresa que ele sabe que existe.
   */
  async clientesDisponiveis(
    colaboradorId: number,
    termo: string,
    limite = 30
  ): Promise<ClienteDisponivel[]> {
    const busca = (termo ?? '').trim();
    const digitos = busca.replace(/\D/g, '');
    const like = `%${busca}%`;
    // Interpolado, não parametrizado: LIMIT com placeholder quebra em
    // prepared statements do MySQL. Por isso passa por Number + clamp antes.
    const max = Math.min(Math.max(Number(limite) || 30, 1), 100);

    const [rows] = await mysqlPool.query<RowDataPacket[]>(
      `SELECT c.id, c.cnpj_limpo, c.razao_social, c.codigo_sci,
              c.regime_tributario, c.ativo,
              GROUP_CONCAT(DISTINCT col.nome ORDER BY col.nome SEPARATOR '||') AS donos
         FROM clientes c
         LEFT JOIN fiscal_ficha f
           ON f.cliente_id = c.id AND f.inutilizado = 0
         LEFT JOIN fiscal_colaboradores col
           ON col.id = f.colaborador_id
        WHERE NOT EXISTS (
                SELECT 1 FROM fiscal_ficha fx
                 WHERE fx.cliente_id = c.id
                   AND fx.colaborador_id = ?
                   AND fx.inutilizado = 0
              )
          AND (
                ? = ''
                OR c.razao_social LIKE ?
                OR c.codigo_sci LIKE ?
                OR (? <> '' AND c.cnpj_limpo LIKE ?)
              )
        GROUP BY c.id, c.cnpj_limpo, c.razao_social, c.codigo_sci,
                 c.regime_tributario, c.ativo
        ORDER BY c.ativo DESC, c.razao_social ASC
        LIMIT ${max}`,
      [colaboradorId, busca, like, like, digitos, `%${digitos}%`]
    );

    return rows.map((r) => ({
      id: String(r.id),
      cnpj: r.cnpj_limpo ?? null,
      razaoSocial: String(r.razao_social),
      codigoSci: r.codigo_sci ?? null,
      regimeTributario: r.regime_tributario ?? null,
      ativo: Number(r.ativo) === 1,
      jaCom: r.donos ? String(r.donos).split('||') : [],
    }));
  }
}

export const fiscalFichaService = new FiscalFichaService();
export default fiscalFichaService;
