/**
 * Contrato do painel de agendamentos.
 *
 * Duas fontes, separadas de propósito:
 *
 *   CATÁLOGO (código, `catalogo.ts`) — o que o job É: nome, o que faz, que tipo
 *     de janela ele respeita, quais campos fazem sentido editar e quais listas
 *     de e-mail ele dispara. Muda junto com o código, então mora no código.
 *
 *   CONFIG (banco, tabela `agendamentos`) — QUANDO ele roda e para QUEM avisa.
 *     Muda pela tela, então mora no banco. O .env continua valendo como semente:
 *     na primeira subida, o valor de lá vira a linha inicial.
 *
 * Por que a distinção importa: o painel precisa mostrar um job novo assim que
 * ele existir (vem do catálogo, sem cadastro manual) sem perder o horário que
 * alguém ajustou na tela (vem do banco).
 */

/**
 * Semântica da janela de disparo. NÃO são intercambiáveis — cada uma reflete
 * uma decisão já tomada nos schedulers, documentada no cabeçalho de cada um:
 *
 *   mensal      `dia >= DIA`, com a hora exigida só no dia exato. Dia perdido é
 *               recuperado no dia seguinte (cota, REOA, DARF).
 *   diario      `hora >= HORA`. Servidor que volta às 9h roda no mesmo dia
 *               (Lançamentos SCI).
 *   semanal     hora E minuto exatos, apenas nos dias da semana escolhidos.
 *               Perder o minuto perde o dia (DET).
 *   sob-demanda Não tem horário: dispara por botão/rota. Entra no painel pelos
 *               destinatários, que é o que se edita nele.
 *   externo     Quem agenda é outro sistema (hoje o Server Manager, no DARF).
 *               Horário é informativo; ligar aqui duplicaria o disparo.
 */
export type TipoJanela = 'mensal' | 'diario' | 'semanal' | 'sob-demanda' | 'externo';

/** Uma lista de destinatários de um job. Um job pode ter mais de uma (a cota tem duas). */
export interface ListaEmail {
  /** Identificador estável da lista dentro do job, em kebab-case. */
  chave: string;
  /** Rótulo para a tela. Ex.: "Aviso de enquadramento de porte". */
  rotulo: string;
  /** Quando o aviso sai, em uma frase. */
  quando: string;
  /**
   * Variável de ambiente que a lista substitui, usada para semear a tabela na
   * primeira subida. `null` quando a lista nunca teve env (destinatário vinha
   * do corpo da requisição).
   */
  envLegado: string | null;
  /** Usado só na semeadura, quando a env não existe. */
  padrao: string[];
}

/** O que o job é. Vive no código. */
export interface AgendamentoCatalogo {
  /** kebab-case, estável: é a chave no banco e na URL. */
  id: string;
  nome: string;
  /** O que o job faz, em linguagem de quem opera — vai direto para a tela. */
  descricao: string;
  tipo: TipoJanela;
  /** Caminho do arquivo do scheduler, relativo à raiz do repo (o teste de arquitetura confere). */
  arquivoScheduler: string | null;
  /** Horário pode ser mudado pela tela? Falso em 'externo' e 'sob-demanda'. */
  editavel: boolean;
  listasEmail: ListaEmail[];
  /** Variável de ambiente que ligava/desligava o job, para semear `ativo`. */
  envAtivo?: string | null;
  /** Tabela de histórico, quando existe, e as colunas que o painel lê. */
  log?: {
    tabela: string;
    colunaInicio: string;
    colunaFim?: string | null;
    /** Coluna de erro, quando o job registra o motivo da falha. */
    colunaErro?: string | null;
  } | null;
  /** Há "executar agora"? Só onde o scheduler já expõe execução manual segura. */
  executarAgora?: boolean;
  /** Aviso que a tela mostra em destaque (ex.: o DARF, agendado fora daqui). */
  alerta?: string | null;
}

/** Quando ele roda e se está ligado. Vive no banco. */
export interface AgendamentoConfig {
  id: string;
  ativo: boolean;
  /** Dia do mês (1-28) para 'mensal'; `null` nos demais tipos. */
  dia: number | null;
  /** Hora (0-23); `null` em 'sob-demanda'. */
  hora: number | null;
  /** Minuto (0-59). Só o tipo 'semanal' usa valor diferente de 0 hoje. */
  minuto: number | null;
  /** Dias da semana (0=dom … 6=sáb) para 'semanal'; `null` nos demais. */
  diasSemana: number[] | null;
  atualizadoEm?: Date | string | null;
  /** Quem salvou pela última vez, para o histórico da tela. */
  atualizadoPor?: string | null;
}

/** Campos que a tela pode mandar num PATCH. Tudo opcional: ausente = não mexer. */
export type AgendamentoPatch = Partial<Pick<AgendamentoConfig, 'ativo' | 'dia' | 'hora' | 'minuto' | 'diasSemana'>>;

/** Última execução lida da tabela de log do job. */
export interface UltimaExecucao {
  inicio: Date | string;
  fim: Date | string | null;
  /** concluído, em andamento (fim nulo) ou com erro registrado. */
  situacao: 'concluida' | 'em-andamento' | 'erro';
  erro?: string | null;
}

/** O que a API devolve para a tela: catálogo + config + estado. */
export interface AgendamentoView extends AgendamentoCatalogo {
  config: AgendamentoConfig;
  /** Frase pronta: "Todo dia 5 às 01:00". */
  janela: string;
  proximaExecucao: string | null;
  ultimaExecucao: UltimaExecucao | null;
  emails: Array<{ chave: string; rotulo: string; quando: string; enderecos: string[] }>;
}
