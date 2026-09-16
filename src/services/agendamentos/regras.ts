/**
 * Regras puras do painel de agendamentos: o texto da janela, a próxima
 * execução e as validações que impedem salvar algo impossível.
 *
 * Puras de propósito — sem banco e com o relógio recebido por parâmetro. É o
 * que permite testar a janela do DET numa sexta-feira sem esperar sexta-feira.
 */
import type { AgendamentoCatalogo, AgendamentoConfig, AgendamentoPatch } from './tipos';

export class ErroValidacaoAgendamento extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroValidacaoAgendamento';
  }
}

const NOMES_DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const doisDigitos = (n: number): string => String(n).padStart(2, '0');
const hhmm = (cfg: AgendamentoConfig): string => `${doisDigitos(cfg.hora ?? 0)}:${doisDigitos(cfg.minuto ?? 0)}`;
const maiuscula = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const minuscula = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** "seg, ter, qua, qui e sex" — vírgula entre todos, "e" antes do último. */
function listarDias(dias: number[]): string {
  const nomes = dias.map((d) => NOMES_DIAS[d] ?? String(d));
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/** Frase da janela sem o prefixo de ligado/desligado. */
function frasePura(cat: AgendamentoCatalogo, cfg: AgendamentoConfig): string {
  switch (cat.tipo) {
    case 'mensal':
      return `Todo dia ${cfg.dia ?? '?'} às ${hhmm(cfg)}`;
    case 'diario':
      return `Todos os dias às ${hhmm(cfg)}`;
    case 'semanal':
      return `${maiuscula(listarDias(cfg.diasSemana ?? []))} às ${hhmm(cfg)}`;
    default:
      return 'Sob demanda';
  }
}

/**
 * Texto que a tela mostra na coluna "quando roda".
 *
 * Desligado NÃO esconde o horário configurado: quem for religar precisa saber
 * para que horas o job volta, e é o mesmo texto que evita religar às cegas.
 */
export function descreverJanela(cat: AgendamentoCatalogo, cfg: AgendamentoConfig): string {
  if (cat.tipo === 'sob-demanda') return 'Sob demanda';
  if (cat.tipo === 'externo') return `${frasePuraExterno(cat, cfg)} (agendado fora do sistema)`;
  const frase = frasePura(cat, cfg);
  return cfg.ativo ? frase : `Desligado (rodaria ${minuscula(frase)})`;
}

/** O externo tem horário informativo: descreve como mensal/diário conforme os campos. */
function frasePuraExterno(cat: AgendamentoCatalogo, cfg: AgendamentoConfig): string {
  if (cfg.dia != null) return `Todo dia ${cfg.dia} às ${hhmm(cfg)}`;
  return `Todos os dias às ${hhmm(cfg)}`;
}

/**
 * Próxima data/hora em que o job dispararia.
 *
 * Devolve `null` quando não há o que prever: desligado, sob demanda, ou
 * agendado fora do sistema (prever ali seria inventar — quem manda é o outro
 * agendador).
 *
 * Atenção: é a janela NOMINAL. Os jobs mensais e o diário usam `>=`, então uma
 * execução perdida acontece depois desta data; o painel mostra a data-alvo, e a
 * coluna de última execução conta o que de fato aconteceu.
 */
export function proximaExecucao(
  cat: AgendamentoCatalogo,
  cfg: AgendamentoConfig,
  agora: Date = new Date()
): Date | null {
  if (!cfg.ativo || cat.tipo === 'sob-demanda' || cat.tipo === 'externo') return null;

  const hora = cfg.hora ?? 0;
  const minuto = cfg.minuto ?? 0;

  if (cat.tipo === 'mensal') {
    const dia = cfg.dia ?? 1;
    const candidato = new Date(agora.getFullYear(), agora.getMonth(), dia, hora, minuto, 0, 0);
    if (candidato > agora) return candidato;
    return new Date(agora.getFullYear(), agora.getMonth() + 1, dia, hora, minuto, 0, 0);
  }

  if (cat.tipo === 'diario') {
    const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), hora, minuto, 0, 0);
    if (hoje > agora) return hoje;
    return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1, hora, minuto, 0, 0);
  }

  // semanal: varre os próximos 7 dias e para no primeiro dia configurado.
  const dias = cfg.diasSemana ?? [];
  if (dias.length === 0) return null;
  for (let i = 0; i <= 7; i++) {
    const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + i, hora, minuto, 0, 0);
    if (dias.includes(d.getDay()) && d > agora) return d;
  }
  return null;
}

const inteiroNoIntervalo = (v: unknown, min: number, max: number): boolean =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/**
 * Valida o que a tela quer salvar. Campo ausente = não mexer.
 *
 * O dia do mês para em 28 por decisão de operação, não por preguiça: com 29, 30
 * ou 31, o mês que não tem aquele dia simplesmente não dispara — e a
 * competência é pulada em silêncio, que é justamente o que os jobs mensais
 * existem para evitar.
 */
export function validarConfig(cat: AgendamentoCatalogo, patch: AgendamentoPatch): void {
  const mexeNoHorario =
    patch.dia !== undefined ||
    patch.hora !== undefined ||
    patch.minuto !== undefined ||
    patch.diasSemana !== undefined;

  if (mexeNoHorario && !cat.editavel) {
    throw new ErroValidacaoAgendamento(
      'Este agendamento é controlado fora do sistema: o horário não pode ser alterado por aqui.'
    );
  }

  if (patch.hora !== undefined && !inteiroNoIntervalo(patch.hora, 0, 23)) {
    throw new ErroValidacaoAgendamento('Hora inválida: informe um número de 0 a 23.');
  }
  if (patch.minuto !== undefined && !inteiroNoIntervalo(patch.minuto, 0, 59)) {
    throw new ErroValidacaoAgendamento('Minuto inválido: informe um número de 0 a 59.');
  }
  if (patch.dia !== undefined && patch.dia !== null && !inteiroNoIntervalo(patch.dia, 1, 28)) {
    throw new ErroValidacaoAgendamento(
      'Dia inválido: informe um número de 1 a 28. De 29 a 31 o mês que não tem esse dia ficaria sem execução.'
    );
  }
  if (patch.diasSemana !== undefined) {
    const dias = patch.diasSemana;
    if (cat.tipo !== 'semanal') {
      throw new ErroValidacaoAgendamento('Dias da semana só valem para agendamentos semanais.');
    }
    if (!Array.isArray(dias) || dias.length === 0 || dias.some((d) => !inteiroNoIntervalo(d, 0, 6))) {
      throw new ErroValidacaoAgendamento(
        'Escolha ao menos um dia da semana válido (0 = domingo até 6 = sábado).'
      );
    }
  }
}

const EMAIL_VALIDO = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/**
 * Normaliza uma lista de destinatários: aceita string separada por vírgula ou
 * ponto e vírgula (formato que vinha do .env) ou array, apara, põe em
 * minúsculo e remove repetidos preservando a ordem.
 *
 * Lista vazia é válida — é assim que se desliga o aviso de um job sem desligar
 * o job. Endereço inválido, não: falha dizendo qual, porque um endereço torto
 * no meio da lista faz o envio inteiro falhar em silêncio na madrugada.
 */
export function normalizarEmails(entrada: string | string[] | null | undefined): string[] {
  if (entrada == null) return [];
  const bruto = Array.isArray(entrada) ? entrada : [entrada];
  const itens = bruto
    .flatMap((v) => String(v).split(/[,;\s]+/))
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0);

  const saida: string[] = [];
  for (const item of itens) {
    if (!EMAIL_VALIDO.test(item)) {
      throw new ErroValidacaoAgendamento(`E-mail inválido: ${item}`);
    }
    if (!saida.includes(item)) saida.push(item);
  }
  return saida;
}
