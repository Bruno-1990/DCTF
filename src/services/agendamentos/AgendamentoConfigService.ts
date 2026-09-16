/**
 * Configuração viva dos agendamentos: lê do banco, semeia do .env e registra
 * quem mudou o quê.
 *
 * POR QUE ELE EXISTE. Cada scheduler lia o .env em constante de topo de módulo,
 * avaliada uma única vez no require. Mudar horário exigia editar o arquivo no
 * servidor e reiniciar o processo. Aqui a configuração passa a ser consultada a
 * cada verificação (uma vez por minuto), com cache curto para não transformar
 * isso em uma consulta por minuto por job.
 *
 * A SEMENTE. Na primeira subida, cada job vira uma linha com o que já estava no
 * .env (ou o padrão do código). Isso preserva exatamente o comportamento atual:
 * ninguém chega na segunda-feira e descobre que a cota mudou de dia sozinha.
 * A existência da linha é o que marca "já semeado" — apagar todos os e-mails de
 * uma lista é uma escolha legítima (job sem aviso) e não é resemeado.
 *
 * O CACHE. 30 segundos, invalidado na hora em que a tela salva. Na prática:
 * salvou, vale na próxima verificação do minuto seguinte.
 */
import { mysqlPool } from '../../config/mysql';
import { CATALOGO, buscarNoCatalogo } from './catalogo';
import { ErroValidacaoAgendamento, normalizarEmails, validarConfig } from './regras';
import type { AgendamentoCatalogo, AgendamentoConfig, AgendamentoPatch, UltimaExecucao } from './tipos';

const CACHE_MS = 30 * 1000;

/**
 * De onde a semente de cada job vem, no formato antigo (.env).
 *
 * Mora aqui, e não no catálogo, porque é migração de legado: quando todo mundo
 * estiver editando pela tela, estas variáveis param de importar e este mapa
 * pode sumir sem tocar no catálogo.
 */
type Semente = Pick<AgendamentoConfig, 'dia' | 'hora' | 'minuto' | 'diasSemana'>;

const num = (v: string | undefined, padrao: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : padrao;
};

const listaDias = (v: string | undefined, padrao: number[]): number[] => {
  if (!v) return padrao;
  const dias = v
    .split(',')
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return dias.length ? dias : padrao;
};

const SEMENTES: Record<string, () => Semente> = {
  'cota-aprendizagem': () => ({
    dia: num(process.env['COTA_SCHEDULER_DIA'], 5),
    hora: num(process.env['COTA_SCHEDULER_HORA'], 1),
    minuto: 0,
    diasSemana: null,
  }),
  'reoa-substituto': () => ({
    dia: num(process.env['REOA_SCHEDULER_DIA'], 5),
    hora: num(process.env['REOA_SCHEDULER_HORA'], 2),
    minuto: 0,
    diasSemana: null,
  }),
  'det-procuracoes': () => ({
    dia: null,
    hora: num(process.env['DET_PROCURACOES_HORA'], 22),
    minuto: num(process.env['DET_PROCURACOES_MINUTO'], 0),
    diasSemana: listaDias(process.env['DET_SCHEDULER_DIAS'], [1, 2, 3, 4, 5]),
  }),
  'det-caixas': () => ({
    dia: null,
    hora: num(process.env['DET_SCHEDULER_HORA'], 6),
    minuto: num(process.env['DET_SCHEDULER_MINUTO'], 0),
    diasSemana: listaDias(process.env['DET_SCHEDULER_DIAS'], [1, 2, 3, 4, 5]),
  }),
  'lancamentos-sci': () => ({
    dia: null,
    hora: num(process.env['HOST_DADOS_SCHEDULER_HORA'], 4),
    minuto: 0,
    diasSemana: null,
  }),
  'darf-lote': () => ({
    dia: num(process.env['DARF_LOTE_DIA'], 25),
    hora: num(process.env['DARF_LOTE_HORA'], 6),
    minuto: 0,
    diasSemana: null,
  }),
};

const sementeDe = (cat: AgendamentoCatalogo): AgendamentoConfig => {
  const base = SEMENTES[cat.id]?.() ?? { dia: null, hora: null, minuto: 0, diasSemana: null };
  // Sem env de liga/desliga (avisos sob demanda), o item nasce ligado: ele não
  // "roda" sozinho, e desligado na tela some o sentido de listar os destinatários.
  const ativo = cat.envAtivo ? process.env[cat.envAtivo] === 'true' : true;
  return { id: cat.id, ativo, ...base };
};

const csvParaDias = (v: string | null): number[] | null =>
  v == null || v.trim() === ''
    ? null
    : v
        .split(',')
        .map((d) => Number(d.trim()))
        .filter((d) => Number.isInteger(d));

export class AgendamentoConfigService {
  private cache: Map<string, AgendamentoConfig> | null = null;
  private cacheEm = 0;
  private semeado = false;

  /** Cria a linha de cada job do catálogo que ainda não existe, com os valores do .env. */
  async semear(): Promise<void> {
    if (this.semeado) return;
    for (const cat of CATALOGO) {
      const s = sementeDe(cat);
      await mysqlPool.query(
        `INSERT IGNORE INTO agendamentos (id, ativo, dia, hora, minuto, dias_semana, atualizado_por)
         VALUES (?, ?, ?, ?, ?, ?, 'semente (.env)')`,
        [s.id, s.ativo ? 1 : 0, s.dia, s.hora, s.minuto ?? 0, s.diasSemana?.join(',') ?? null]
      );

      for (const lista of cat.listasEmail) {
        const doEnv = lista.envLegado ? process.env[lista.envLegado] : undefined;
        const enderecos = normalizarEmails(doEnv ?? lista.padrao);
        for (const email of enderecos) {
          await mysqlPool.query(
            `INSERT IGNORE INTO agendamento_emails (agendamento_id, lista, email, criado_por)
             VALUES (?, ?, ?, 'semente (.env)')`,
            [cat.id, lista.chave, email]
          );
        }
      }
    }
    this.semeado = true;
    this.invalidar();
  }

  invalidar(): void {
    this.cache = null;
    this.cacheEm = 0;
  }

  private async carregar(): Promise<Map<string, AgendamentoConfig>> {
    if (this.cache && Date.now() - this.cacheEm < CACHE_MS) return this.cache;

    const [linhas]: any = await mysqlPool.query(
      `SELECT id, ativo, dia, hora, minuto, dias_semana, atualizado_em, atualizado_por FROM agendamentos`
    );
    const mapa = new Map<string, AgendamentoConfig>();
    for (const l of linhas as any[]) {
      mapa.set(l.id, {
        id: l.id,
        ativo: Number(l.ativo) === 1,
        dia: l.dia == null ? null : Number(l.dia),
        hora: l.hora == null ? null : Number(l.hora),
        minuto: l.minuto == null ? 0 : Number(l.minuto),
        diasSemana: csvParaDias(l.dias_semana),
        atualizadoEm: l.atualizado_em ?? null,
        atualizadoPor: l.atualizado_por ?? null,
      });
    }
    this.cache = mapa;
    this.cacheEm = Date.now();
    return mapa;
  }

  /**
   * Configuração de um job. Nunca devolve `undefined`: sem linha no banco
   * (job recém-criado, banco recém-migrado), vale a semente do .env — o job
   * continua rodando como sempre rodou.
   */
  async obter(id: string): Promise<AgendamentoConfig> {
    const cat = buscarNoCatalogo(id);
    if (!cat) throw new ErroValidacaoAgendamento(`Agendamento desconhecido: ${id}`);
    const mapa = await this.carregar();
    return mapa.get(id) ?? sementeDe(cat);
  }

  /** Destinatários de uma lista, já normalizados. Lista vazia é resposta válida. */
  async emails(id: string, lista?: string): Promise<Record<string, string[]>> {
    const [linhas]: any = await mysqlPool.query(
      lista
        ? `SELECT lista, email FROM agendamento_emails WHERE agendamento_id = ? AND lista = ? ORDER BY email`
        : `SELECT lista, email FROM agendamento_emails WHERE agendamento_id = ? ORDER BY lista, email`,
      lista ? [id, lista] : [id]
    );
    const por: Record<string, string[]> = {};
    for (const l of linhas as any[]) {
      (por[l.lista] ??= []).push(l.email);
    }
    return por;
  }

  /**
   * Destinatários prontos para o envio, com rede de segurança.
   *
   * Se a tabela ainda não foi semeada (primeira subida logo após a migration),
   * cai no .env em vez de mandar e-mail para ninguém — perder um aviso é pior
   * do que mandar para a lista antiga.
   */
  async destinatarios(id: string, lista: string): Promise<string[]> {
    const doBanco = (await this.emails(id, lista))[lista];
    if (doBanco && doBanco.length) return doBanco;

    const cat = buscarNoCatalogo(id);
    const meta = cat?.listasEmail.find((l) => l.chave === lista);
    if (!meta) return [];
    const existeLinha = (await this.carregar()).has(id);
    if (existeLinha) return []; // já semeado: lista vazia é escolha de quem opera
    const doEnv = meta.envLegado ? process.env[meta.envLegado] : undefined;
    return normalizarEmails(doEnv ?? meta.padrao);
  }

  /** Salva horário/liga-desliga. Campo ausente não é tocado. */
  async atualizar(id: string, patch: AgendamentoPatch, quem: string): Promise<AgendamentoConfig> {
    const cat = buscarNoCatalogo(id);
    if (!cat) throw new ErroValidacaoAgendamento(`Agendamento desconhecido: ${id}`);
    validarConfig(cat, patch);

    const atual = await this.obter(id);
    await this.garantirLinha(id, atual);

    const candidatos: Array<[string, unknown, unknown]> = []; // [coluna, valorNovo, valorAnterior]
    if (patch.ativo !== undefined) candidatos.push(['ativo', patch.ativo ? 1 : 0, atual.ativo ? 1 : 0]);
    if (patch.dia !== undefined) candidatos.push(['dia', patch.dia, atual.dia]);
    if (patch.hora !== undefined) candidatos.push(['hora', patch.hora, atual.hora]);
    if (patch.minuto !== undefined) candidatos.push(['minuto', patch.minuto, atual.minuto]);
    if (patch.diasSemana !== undefined) {
      candidatos.push(['dias_semana', patch.diasSemana?.join(',') ?? null, atual.diasSemana?.join(',') ?? null]);
    }

    // Só o que realmente mudou. A tela salva no blur de cada campo, então sem
    // este filtro um clique fora do campo viraria "hora: 1 → 1" no histórico —
    // e histórico cheio de linha inútil não é histórico, é ruído.
    const campos = candidatos.filter(([, novo, anterior]) => String(novo ?? '') !== String(anterior ?? ''));
    if (campos.length === 0) return atual;

    await mysqlPool.query(
      `UPDATE agendamentos SET ${campos.map(([c]) => `${c} = ?`).join(', ')}, atualizado_por = ? WHERE id = ?`,
      [...campos.map(([, novo]) => novo), quem, id]
    );
    for (const [coluna, novo, anterior] of campos) {
      await this.registrarAlteracao(id, coluna, anterior, novo, quem);
    }

    this.invalidar();
    return this.obter(id);
  }

  async adicionarEmail(id: string, lista: string, email: string, quem: string): Promise<string[]> {
    const cat = buscarNoCatalogo(id);
    const meta = cat?.listasEmail.find((l) => l.chave === lista);
    if (!cat || !meta) throw new ErroValidacaoAgendamento(`Lista de e-mail desconhecida: ${id}/${lista}`);

    const [endereco] = normalizarEmails(email);
    if (!endereco) throw new ErroValidacaoAgendamento('Informe um e-mail.');

    await this.garantirLinha(id, await this.obter(id));
    await mysqlPool.query(
      `INSERT IGNORE INTO agendamento_emails (agendamento_id, lista, email, criado_por) VALUES (?, ?, ?, ?)`,
      [id, lista, endereco, quem]
    );
    await this.registrarAlteracao(id, 'email', null, `${lista}: +${endereco}`, quem);
    return (await this.emails(id, lista))[lista] ?? [];
  }

  async removerEmail(id: string, lista: string, email: string, quem: string): Promise<string[]> {
    const [endereco] = normalizarEmails(email);
    if (!endereco) throw new ErroValidacaoAgendamento('Informe um e-mail.');
    await mysqlPool.query(
      `DELETE FROM agendamento_emails WHERE agendamento_id = ? AND lista = ? AND email = ?`,
      [id, lista, endereco]
    );
    await this.registrarAlteracao(id, 'email', `${lista}: ${endereco}`, null, quem);
    return (await this.emails(id, lista))[lista] ?? [];
  }

  /**
   * Última execução do job, lida da tabela de log que o catálogo declara.
   *
   * Os nomes de tabela e coluna vêm do catálogo (código), nunca da requisição —
   * por isso podem ser interpolados. Se a tabela ainda não existe (as do REOA e
   * dos Lançamentos são criadas na primeira execução do job), devolve null em
   * vez de derrubar o painel inteiro.
   */
  async ultimaExecucao(cat: AgendamentoCatalogo): Promise<UltimaExecucao | null> {
    if (!cat.log) return null;
    const { tabela, colunaInicio, colunaFim, colunaErro } = cat.log;
    const colunas = [`${colunaInicio} AS inicio`];
    colunas.push(colunaFim ? `${colunaFim} AS fim` : 'NULL AS fim');
    colunas.push(colunaErro ? `${colunaErro} AS erro` : 'NULL AS erro');

    try {
      const [linhas]: any = await mysqlPool.query(
        `SELECT ${colunas.join(', ')} FROM ${tabela} ORDER BY ${colunaInicio} DESC LIMIT 1`
      );
      const l = (linhas as any[])[0];
      if (!l) return null;
      const erro = l.erro ? String(l.erro) : null;
      return {
        inicio: l.inicio,
        fim: l.fim ?? null,
        situacao: erro ? 'erro' : l.fim || !colunaFim ? 'concluida' : 'em-andamento',
        erro,
      };
    } catch (err: any) {
      if (err?.code === 'ER_NO_SUCH_TABLE') return null;
      throw err;
    }
  }

  async historico(id: string, limite = 20): Promise<any[]> {
    const [linhas]: any = await mysqlPool.query(
      `SELECT campo, valor_anterior, valor_novo, alterado_por, alterado_em
         FROM agendamento_alteracoes WHERE agendamento_id = ?
        ORDER BY alterado_em DESC LIMIT ?`,
      [id, Number(limite)]
    );
    return linhas as any[];
  }

  /** Garante a linha antes de um UPDATE: job semeado por outra instância ou recém-criado. */
  private async garantirLinha(id: string, atual: AgendamentoConfig): Promise<void> {
    await mysqlPool.query(
      `INSERT IGNORE INTO agendamentos (id, ativo, dia, hora, minuto, dias_semana, atualizado_por)
       VALUES (?, ?, ?, ?, ?, ?, 'semente (.env)')`,
      [id, atual.ativo ? 1 : 0, atual.dia, atual.hora, atual.minuto ?? 0, atual.diasSemana?.join(',') ?? null]
    );
  }

  private async registrarAlteracao(
    id: string,
    campo: string,
    anterior: unknown,
    novo: unknown,
    quem: string
  ): Promise<void> {
    await mysqlPool.query(
      `INSERT INTO agendamento_alteracoes (agendamento_id, campo, valor_anterior, valor_novo, alterado_por)
       VALUES (?, ?, ?, ?, ?)`,
      [id, campo, anterior == null ? null : String(anterior), novo == null ? null : String(novo), quem]
    );
  }
}

export const agendamentoConfigService = new AgendamentoConfigService();
export default agendamentoConfigService;
