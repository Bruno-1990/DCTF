/**
 * Motor de regras da cota de aprendizagem — classificação de porte ME/EPP/Demais.
 *
 * Base legal: LC 123/2006 art. 3º (enquadramento por receita bruta) combinado
 * com a IN SIT/MTE 146/2018 art. 3º, I (ME e EPP são ISENTAS da cota de
 * aprendizagem). Especificação em `Regra/regras-cota-aprendizagem.md`.
 *
 * ESCOPO: só o porte. Não calcula número de aprendizes — não existe fonte de
 * quantidade de empregados por CBO no sistema.
 *
 * Funções PURAS: nada de banco, nada de rede, nenhum `new Date()` interno. A
 * data entra por parâmetro, que é o que permite testar virada de ano sem mock.
 *
 * DINHEIRO EM CENTAVOS INTEIROS, sempre. Dois motivos:
 *   1. `mysql2` devolve DECIMAL como string (ver comentário em
 *      SubstitutoService.ts:286) — somar string concatena silenciosamente.
 *   2. Em float, 12 × 400.000,01 dá 4.800.000,119999999, e a comparação na
 *      fronteira exata de R$ 4.800.000,00 vira loteria. Em centavos é exato, e
 *      Number.MAX_SAFE_INTEGER cobre R$ 90 trilhões.
 */

// ─── Limites legais (LC 123/2006 art. 3º) ────────────────────────────────────
export const LIMITE_ME_CENTAVOS = 36_000_000; // R$   360.000,00 — inciso I
export const LIMITE_EPP_CENTAVOS = 480_000_000; // R$ 4.800.000,00 — inciso II
export const LIMITE_20PCT_CENTAVOS = 576_000_000; // R$ 5.760.000,00 — §9º-A (+20%)

/**
 * O TETO DE EPP É O MESMO TETO DO SIMPLES NACIONAL — e isso não é coincidência
 * nem confusão: os R$ 4.800.000,00 do art. 3º, II definem quem É empresa de
 * pequeno porte, e o Simples Nacional é o regime facultado a quem tem essa
 * condição (art. 12 c/c art. 3º). Um número, duas consequências.
 *
 * Três desdobramentos que importam aqui:
 *
 * 1. Ser optante do Simples é EVIDÊNCIA INDEPENDENTE de porte. Se o cadastro
 *    diz "Simples Nacional" e a receita apurada passa de R$ 4,8 mi, um dos dois
 *    está errado — cadastro desatualizado ou faturamento coletado do lugar
 *    errado. Ver `divergenciaComSimples`.
 *
 * 2. A recíproca NÃO vale. Estar fora do Simples não diz nada sobre o porte: a
 *    opção é facultativa e há vedações (art. 17) que nada têm a ver com
 *    receita. Uma ME no Lucro Presumido é ME — e continua isenta da cota, que
 *    depende do PORTE e não do regime.
 *
 * 3. O SUBLIMITE de R$ 3.600.000,00 não entra nesta conta. Ele só regula a
 *    saída do ICMS/ISS de dentro do DAS (art. 19/20) e não altera a condição de
 *    ME/EPP nem a isenção da cota.
 */
export const LIMITE_SIMPLES_CENTAVOS = LIMITE_EPP_CENTAVOS;

/**
 * Versão do motor, gravada em cada linha classificada.
 *
 * Sem isso não há como distinguir uma linha apurada pela regra vigente de outra
 * deixada por uma execução antiga — e a competência 202607 chegou a acumular as
 * duas coisas ao mesmo tempo, com marcações de revisão sem motivo registrado.
 *
 * 1.1.0 — sócio no exterior e sócio advogado deixaram de pedir revisão (não são
 *         impedimento do art. 3º §4º); entrou a divergência com o Simples.
 * 1.2.0 — consórcio deixou de ser classificado pela receita: sem personalidade
 *         jurídica (Lei 6.404/76 art. 278 §1º), não é sujeito do art. 3º da
 *         LC 123 e não pode ser ME/EPP por receita nenhuma.
 */
export const MOTOR_VERSAO = '1.2.0';

export type Porte = 'ME' | 'EPP' | 'DEMAIS' | 'SEM_DADOS';
export type MotivoPorte = 'RBAA' | 'EXCESSO_20PCT' | 'SEM_DADOS' | 'SEM_PERSONALIDADE';

/**
 * A REGRA, em uma frase: passar de R$ 4,8 mi já torna a empresa Demais — o que
 * o excesso define é apenas A PARTIR DE QUANDO.
 *
 *   excesso até 20% (RBA ≤ R$ 5,76 mi)  → vale a partir de 1º/jan do ano seguinte
 *   excesso acima de 20% (RBA > R$ 5,76 mi) → vale a partir do 1º dia do mês
 *                                             seguinte ÀQUELE em que passou de
 *                                             R$ 5,76 mi, ainda no ano corrente
 *
 * Os dois meses continuam sendo calculados e gravados — `mesExcessoLimite`
 * (quando passou de 4,8 mi) documenta o fato que originou o enquadramento, e
 * `mesExcesso20pct` é o que determina a data quando há antecipação.
 */

export interface MesReceita {
  mes: number; // 1..12
  centavos: number;
}

export interface SerieMes {
  mes: number;
  receitaMesCentavos: number | null; // null = mês AUSENTE (desconhecido)
  rbaCentavos: number | null; // acumulado jan..mes
  ausente: boolean;
}

// ─── Conversão de dinheiro ───────────────────────────────────────────────────

/**
 * DECIMAL(15,2) (string do mysql2) ou number → centavos inteiros.
 *
 * Usa `toFixed(2)` em vez de `Math.round(v * 100)` porque a multiplicação por
 * 100 em float reintroduz o erro que estamos tentando evitar (1234.565 * 100 =
 * 123456.49999999999).
 *
 * Lança em entrada inválida em vez de devolver 0: um zero silencioso viraria
 * "empresa sem faturamento" e, portanto, "ME isenta" — o falso negativo mais
 * caro desta feature.
 */
export function parseValorParaCentavos(valor: string | number | null | undefined): number {
  if (valor === null || valor === undefined || valor === '') {
    throw new Error('parseValorParaCentavos: valor ausente (use null explicitamente no chamador)');
  }
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(n)) {
    throw new Error(`parseValorParaCentavos: valor inválido "${valor}"`);
  }
  return Math.round(Number(n.toFixed(2)) * 100);
}

/** Centavos → número em reais, para gravar em DECIMAL(15,2) e exibir. */
export function centavosParaReais(centavos: number): number {
  return centavos / 100;
}

// ─── Acumulação ──────────────────────────────────────────────────────────────

/**
 * Monta a série 1..12 com receita do mês e RBA acumulada.
 *
 * Mês ausente NÃO vira zero — vira `null`, e a partir daí a RBA acumulada
 * continua somando o que existe (é um piso da receita real, não o valor real).
 * Quem decide o que fazer com isso é `classificar`, usando `mesesFaltantes`.
 */
export function acumularSerie(meses: MesReceita[], ateMes = 12): SerieMes[] {
  const porMes = new Map<number, number>();
  for (const m of meses) {
    porMes.set(m.mes, (porMes.get(m.mes) ?? 0) + m.centavos);
  }

  const serie: SerieMes[] = [];
  let acumulado = 0;
  for (let mes = 1; mes <= ateMes; mes++) {
    const receita = porMes.get(mes);
    const ausente = receita === undefined;
    if (!ausente) acumulado += receita;
    serie.push({
      mes,
      receitaMesCentavos: ausente ? null : receita,
      rbaCentavos: acumulado,
      ausente,
    });
  }
  return serie;
}

/** Soma total de uma lista de meses, em centavos. */
export function acumular(meses: MesReceita[]): number {
  return meses.reduce((soma, m) => soma + m.centavos, 0);
}

/** Meses de 1..ateMes que não vieram na lista. */
export function mesesFaltantes(meses: MesReceita[], ateMes = 12): number[] {
  const presentes = new Set(meses.map((m) => m.mes));
  const faltantes: number[] = [];
  for (let mes = 1; mes <= ateMes; mes++) {
    if (!presentes.has(mes)) faltantes.push(mes);
  }
  return faltantes;
}

// ─── Referência temporal ─────────────────────────────────────────────────────

/**
 * Último mês FECHADO em relação a `hoje`. A data entra por parâmetro de
 * propósito — é isso que permite testar a virada de ano sem mock de relógio.
 *
 * Em 05/01/2027 o último mês fechado é 12/2026.
 */
export function mesReferencia(hoje: Date): { ano: number; mes: number } {
  let ano = hoje.getFullYear();
  let mes = hoje.getMonth(); // 0-based; getMonth() já é o mês ANTERIOR em 1-based
  if (mes === 0) {
    mes = 12;
    ano -= 1;
  }
  return { ano, mes };
}

/** `YYYYMM` — formato de competência usado pelo SCI (BDREF). */
export function bdrefDe(ano: number, mes: number): number {
  return ano * 100 + mes;
}

// ─── Classificação ───────────────────────────────────────────────────────────

/**
 * Faixa de porte pela receita. Implementa o "superior a" literal da lei: o
 * valor EXATO no limite fica na faixa de baixo.
 *   art. 3º, I  — ME:  receita "igual ou inferior a R$ 360.000,00"
 *   art. 3º, II — EPP: "superior a R$ 360.000,00 e igual ou inferior a
 *                       R$ 4.800.000,00"
 */
export function classificarPorReceita(centavos: number): 'ME' | 'EPP' | 'DEMAIS' {
  if (centavos <= LIMITE_ME_CENTAVOS) return 'ME';
  if (centavos <= LIMITE_EPP_CENTAVOS) return 'EPP';
  return 'DEMAIS';
}

/** Porte do ano a partir da receita do ano anterior (RBAA). */
export function portePorRBAA(rbaaCentavos: number | null): Porte {
  if (rbaaCentavos === null) return 'SEM_DADOS';
  return classificarPorReceita(rbaaCentavos);
}

/**
 * Localiza os dois meses candidatos de excesso na série do ano corrente.
 * Ambos, sempre — a escolha entre eles é do chamador (ver CriterioMesExcesso).
 */
export function detectarExcesso(serie: SerieMes[]): {
  mesExcessoLimite: number | null;
  mesExcesso20pct: number | null;
  rbaFinalCentavos: number | null;
} {
  let mesExcessoLimite: number | null = null;
  let mesExcesso20pct: number | null = null;

  for (const item of serie) {
    if (item.rbaCentavos === null) continue;
    if (mesExcessoLimite === null && item.rbaCentavos > LIMITE_EPP_CENTAVOS) {
      mesExcessoLimite = item.mes;
    }
    if (mesExcesso20pct === null && item.rbaCentavos > LIMITE_20PCT_CENTAVOS) {
      mesExcesso20pct = item.mes;
    }
  }

  const ultimo = serie.length > 0 ? serie[serie.length - 1] : undefined;
  return {
    mesExcessoLimite,
    mesExcesso20pct,
    rbaFinalCentavos: ultimo?.rbaCentavos ?? null,
  };
}

/**
 * Data em que o novo enquadramento passa a valer, em `YYYY-MM-DD`.
 *
 * - Excesso acima de 20% (§9º): 1º dia do mês SEGUINTE ao do fato. Se o fato
 *   for em dezembro, rola naturalmente para 01/01 do ano seguinte — e nesse
 *   caso nenhum mês do ano corrente vira "Demais".
 * - Excesso até 20% (§9º-A) e ME→EPP (§7º): 1º de janeiro do ano seguinte.
 */
export function calcularDataEfeito(input: {
  ano: number;
  mesFato: number | null;
  imediato: boolean;
}): string | null {
  const { ano, mesFato, imediato } = input;
  if (!imediato) {
    return `${ano + 1}-01-01`;
  }
  if (mesFato === null) return null;
  const anoEfeito = mesFato === 12 ? ano + 1 : ano;
  const mesEfeito = mesFato === 12 ? 1 : mesFato + 1;
  return `${anoEfeito}-${String(mesEfeito).padStart(2, '0')}-01`;
}

export interface EntradaClassificacao {
  ano: number;
  /** Receita bruta acumulada do ano ANTERIOR. `null` = indisponível (≠ zero). */
  rbaaCentavos: number | null;
  /** Meses do ano CORRENTE já coletados. */
  mesesAnoCorrente: MesReceita[];
  /** Até que mês o ano corrente já deveria ter dado (1..12). */
  ateMes: number;
  /** Suspeita de sócio PJ no capital. SINALIZA, não decide — ver abaixo. */
  impedimentoSuspeita?: boolean;
  /**
   * Consórcio: sem personalidade jurídica, não é sujeito do art. 3º da LC 123.
   * Ao contrário da suspeita de sócio PJ, este DECIDE — ver `ehConsorcio`.
   */
  semPersonalidade?: boolean;
  /** Empresa aberta no próprio ano: limite seria proporcional (art. 3º §2º). */
  inicioAtividade?: boolean;
}

export interface ResultadoClassificacao {
  porte: Porte;
  /** Porte só pela RBAA, antes da regra dos 20%. */
  porteBase: Porte;
  motivo: MotivoPorte;
  /** TRI-ESTADO: true = sujeita; false = isenta; null = não foi possível concluir. */
  sujeitaCota: boolean | null;
  rbaCentavos: number | null;
  serie: SerieMes[];

  /** RBA passou de 4,8 mi — vira Demais em 1º/jan se o excesso ficar ≤ 20%. */
  excedeTetoEpp: boolean;
  /** RBA passou de 360 mil — ME vira EPP em 1º/jan (não muda a isenção). */
  excedeTetoMe: boolean;

  mesExcessoLimite: number | null;
  mesExcesso20pct: number | null;
  mesFatoAplicado: number | null;
  dataEfeito: string | null;

  mesesFaltantes: number[];
  dadoConfiavel: boolean;
  revisarJuridico: boolean;
  /** Há sócio PJ no quadro — o art. 3º §4º, I afasta ME/EPP por si só. */
  impedimentoSocietario: boolean;
  /** Consórcio: fora do regime da LC 123, não "acima do teto". */
  semPersonalidade: boolean;
}

/**
 * Classifica o porte de um cliente numa competência.
 *
 * O ponto delicado é o que fazer com dado incompleto. A RBA é soma de parcelas
 * não-negativas, então uma RBA com buracos é um LIMITE INFERIOR da real. Daí a
 * assimetria que governa esta função:
 *
 *   - RBA parcial JÁ acima do limite → concluir "DEMAIS" é seguro: a receita
 *     real só pode ser maior.
 *   - RBA parcial ABAIXO do limite → NÃO dá para concluir ME/EPP: os meses que
 *     faltam podem levá-la acima. Sai `SEM_DADOS` com `sujeitaCota: null`.
 *
 * Sem essa assimetria, todo cliente com coleta incompleta viraria "ME isenta" —
 * o falso negativo mais caro aqui, porque o cliente deixaria de contratar
 * aprendizes achando-se dispensado.
 *
 * IMPEDIMENTO SOCIETÁRIO: o art. 3º §4º, I afasta ME/EPP quando há sócio pessoa
 * jurídica, independentemente da receita. A suspeita NÃO muda o porte apurado —
 * inferir "Demais" de um retrato do QSA que pode estar meses desatualizado
 * criaria obrigação real de contratar aprendizes —, mas TAMBÉM NÃO deixa mais
 * afirmar isenção:
 *
 *   porte ME/EPP + sócio PJ  →  `sujeitaCota: null` (indefinido)
 *
 * Antes desta ressalva a mesma linha dizia "ME, isenta" e "há sócio PJ" ao
 * mesmo tempo — duas afirmações que se contradizem, e a errada era justamente a
 * que dispensava o cliente de contratar aprendiz. Nem sim nem não: conferir o
 * cartão CNPJ. É a mesma assimetria aplicada ao dado incompleto — na dúvida,
 * não se declara isenção.
 */
export function classificar(entrada: EntradaClassificacao): ResultadoClassificacao {
  const {
    ano,
    rbaaCentavos,
    mesesAnoCorrente,
    ateMes,
    impedimentoSuspeita = false,
    inicioAtividade = false,
    semPersonalidade = false,
  } = entrada;

  const serie = acumularSerie(mesesAnoCorrente, ateMes);
  const faltantes = mesesFaltantes(mesesAnoCorrente, ateMes);
  const dadoConfiavel = faltantes.length === 0;

  const { mesExcessoLimite, mesExcesso20pct, rbaFinalCentavos } = detectarExcesso(serie);

  const porteBase = portePorRBAA(rbaaCentavos);
  const excedeTetoEpp = mesExcessoLimite !== null;
  const excedeTetoMe =
    rbaFinalCentavos !== null && rbaFinalCentavos > LIMITE_ME_CENTAVOS && porteBase === 'ME';

  // A regra dos 20%: excesso acima de R$ 5,76 mi tira o enquadramento ainda no
  // ano vigente. Vale mesmo com RBAA indisponível — o §9º-A não depende do ano
  // anterior, só do excesso do ano corrente.
  //
  // Mas NÃO se aplica a quem já entrou o ano como Demais: não há enquadramento
  // diferenciado a perder. Sem esta ressalva, uma empresa que já era Demais
  // pela receita do ano anterior receberia o motivo "excedeu os 20%" e a frase
  // "deixou de ser EPP neste ano" — descrevendo uma transição que não houve.
  const excessoImediato = mesExcesso20pct !== null && porteBase !== 'DEMAIS';

  let porte: Porte;
  let motivo: MotivoPorte;
  let mesFatoAplicado: number | null = null;
  let dataEfeito: string | null = null;

  if (semPersonalidade) {
    // Antes de qualquer conta: consórcio não é sujeito do art. 3º da LC 123, e
    // por isso não há faixa de receita que o enquadre. Cai em "Demais" porque é
    // assim que este motor representa "não faz jus ao tratamento diferenciado"
    // — e não porque tenha estourado teto nenhum. O motivo próprio existe para
    // a tela e a planilha não dizerem "pela receita do ano anterior".
    porte = 'DEMAIS';
    motivo = 'SEM_PERSONALIDADE';
  } else if (excessoImediato) {
    porte = 'DEMAIS';
    motivo = 'EXCESSO_20PCT';
    // A antecipação é contada do mês em que passou de R$ 5,76 mi.
    mesFatoAplicado = mesExcesso20pct;
    dataEfeito = calcularDataEfeito({ ano, mesFato: mesFatoAplicado, imediato: true });
  } else if (porteBase === 'SEM_DADOS') {
    porte = 'SEM_DADOS';
    motivo = 'SEM_DADOS';
  } else if (!dadoConfiavel && porteBase !== 'DEMAIS') {
    // Coleta incompleta e o que temos não basta para concluir isenção.
    porte = 'SEM_DADOS';
    motivo = 'SEM_DADOS';
  } else {
    porte = porteBase;
    motivo = 'RBAA';
    // Efeito só em 1º/jan do ano seguinte — o porte do ano NÃO muda agora.
    // Não vale para quem já é Demais: não há nível acima para onde subir, e
    // uma data de efeito aqui anunciaria uma transição inexistente.
    if (porte !== 'DEMAIS' && (excedeTetoEpp || excedeTetoMe)) {
      dataEfeito = calcularDataEfeito({ ano, mesFato: null, imediato: false });
    }
  }

  // Sócio PJ no quadro impede o enquadramento diferenciado (§4º, I): não dá
  // para dizer "isenta" só porque a receita cabe na faixa. Quem já é Demais não
  // muda — a conclusão dele não dependia do quadro societário.
  const sujeitaCota =
    porte === 'SEM_DADOS' ? null : porte === 'DEMAIS' ? true : impedimentoSuspeita ? null : false;

  // Cruzar 4,8 mi num mês e 5,76 mi em outro NÃO é motivo de revisão: a regra
  // é determinada — o primeiro define que a empresa passa a Demais, o segundo
  // define se isso vale já no ano corrente ou só em 1º/jan.
  const revisarJuridico = impedimentoSuspeita || inicioAtividade;

  return {
    porte,
    porteBase,
    motivo,
    sujeitaCota,
    rbaCentavos: rbaFinalCentavos,
    serie,
    excedeTetoEpp,
    excedeTetoMe,
    mesExcessoLimite,
    mesExcesso20pct,
    mesFatoAplicado,
    dataEfeito,
    mesesFaltantes: faltantes,
    dadoConfiavel,
    revisarJuridico,
    impedimentoSocietario: impedimentoSuspeita,
    semPersonalidade,
  };
}

// ─── Coerência com o regime tributário ───────────────────────────────────────

/**
 * O cadastro diz "Simples Nacional" mas a receita apurada passa do teto?
 *
 * O teto do Simples é o MESMO teto de EPP (R$ 4,8 mi), então as duas
 * informações falam do mesmo fato e não podem discordar. Quando discordam, uma
 * das duas está errada:
 *
 *   - o cadastro está desatualizado (a empresa foi excluída do Simples e
 *     ninguém atualizou o regime), ou
 *   - o faturamento veio do lugar errado (código SCI apontando para outra
 *     empresa, ou soma indevida de estabelecimentos de PJs diferentes).
 *
 * Qualquer das duas muda a conclusão sobre a cota, então isto SINALIZA para
 * conferência e NÃO decide o porte. A recíproca não é checada de propósito:
 * estar fora do Simples não diz nada sobre o porte (a opção é facultativa e o
 * art. 17 tem vedações que nada têm a ver com receita).
 */
export function divergenciaComSimples(input: {
  regimeTributario: string | null | undefined;
  rbaCentavos: number | null;
}): boolean {
  const { regimeTributario, rbaCentavos } = input;
  if (rbaCentavos === null) return false;
  if (!/SIMPLES/i.test(String(regimeTributario ?? ''))) return false;
  return rbaCentavos > LIMITE_SIMPLES_CENTAVOS;
}

// ─── Consórcio: fora do regime, não "acima do teto" ─────────────────────────

/**
 * A empresa é um consórcio — e consórcio NÃO PODE ser ME ou EPP, por receita
 * nenhuma.
 *
 * O motivo é anterior a qualquer conta: o consórcio dos arts. 278 e 279 da Lei
 * 6.404/76 **não tem personalidade jurídica** (art. 278, §1º). Ele é uma união
 * contratual entre empresas que já existem, para executar um empreendimento
 * específico — não é sociedade, não é empresário, e não está registrado no
 * Registro de Empresas Mercantis nem no RCPJ. O art. 3º da LC 123 lista
 * exatamente esses sujeitos, e o consórcio não é nenhum deles.
 *
 * Some-se o art. 3º, §4º, I: o consórcio é composto de pessoas jurídicas, o que
 * afastaria o enquadramento mesmo que a personalidade existisse. São dois
 * fundamentos independentes para a mesma conclusão.
 *
 * POR QUE ISTO DECIDE, e não apenas sinaliza — ao contrário do sócio PJ. O
 * quadro societário vem de um retrato do cartão CNPJ que pode estar meses
 * desatualizado, e por isso a suspeita ali só liga `revisar_juridico`. A
 * natureza jurídica não é retrato: é o que a empresa É. Um consórcio não vira
 * sociedade no mês seguinte.
 *
 * O QUE ISSO CORRIGE. Sem esta regra o motor classificava pela receita, e o
 * consórcio da base — receita zerada no SCI — saía como **ME**. Não virou
 * "isenta" por sorte: o sócio PJ derrubou a conclusão para `null`. Ou seja, o
 * que impedia a tela de afirmar uma isenção juridicamente impossível era um
 * sinal acessório, que depende de a tabela de sócios estar preenchida. Com o
 * quadro vazio, a mesma linha diria "ME, isenta".
 */
export function ehConsorcio(naturezaJuridica: string | null | undefined): boolean {
  // Cobre "215-1 - Consórcio de Sociedades" e as demais naturezas de consórcio
  // (inclusive as públicas), com ou sem acento — o campo vem digitado do
  // cadastro e nem sempre acentuado.
  return /cons[óo]rcio/i.test(String(naturezaJuridica ?? ''));
}
// ─── Sociedade de advogados: o "Demais" que não é cadastro atrasado ──────────

/**
 * A empresa é sociedade de advogados — aquela para a qual o porte "Demais" no
 * CNPJ é obrigatório, e não sinal de cadastro desatualizado.
 *
 * Três leis encadeadas produzem esse resultado:
 *
 *   1. Lei 8.906/94, art. 16 — sociedade de advogados não pode adotar forma ou
 *      característica mercantil, e o registro dos atos constitutivos é feito
 *      exclusivamente no Conselho Seccional da OAB (art. 15, §1º): nem Junta
 *      Comercial, nem Registro Civil de Pessoas Jurídicas.
 *   2. LC 123/2006, art. 3º — o enquadramento formal como ME/EPP é reservado a
 *      quem está inscrito no Registro de Empresas Mercantis OU no RCPJ. A OAB
 *      não é nenhum dos dois, então não existe órgão para comunicar o
 *      enquadramento à Receita e o porte do CNPJ permanece "Demais".
 *   3. Código Civil, art. 966, parágrafo único — profissão intelectual não é
 *      atividade empresária, o que fecha a porta da Junta pelo outro lado.
 *
 * A consequência aqui: quando o cadastro diz "Demais" e a receita apurada diz
 * ME/EPP, no resto da carteira isso é um reenquadramento que ninguém pediu —
 * nesta empresa é o estado permanente e correto. Tratar como pendência manda o
 * Fiscal atrás de um pedido que a lei não permite protocolar.
 *
 * A ISENÇÃO DA COTA NÃO MUDA. A IN SIT/MTE 146/2018, art. 3º, I dispensa "ME e
 * EPP" — a condição, não a anotação cadastral. O motor sempre classificou pela
 * receita bruta e nunca pelo porte do CNPJ, e é por isso que estas empresas já
 * saíam isentas: o mesmo desenho que acerta uma EPP com cadastro atrasado
 * acerta a sociedade de advogados.
 *
 * DETECÇÃO CONSERVADORA, por um motivo concreto na base: há cliente com
 * "ADVOGADOS" na razão social e CNAE 69.11-7 que é Sociedade Empresária
 * Limitada com atividade de agente de propriedade industrial (69.11-7/03) —
 * essa registra na Junta e pode constar EPP normalmente. Daí exigir natureza
 * jurídica não-empresária JUNTO com a atividade, e ignorar a razão social:
 * nome não é órgão de registro.
 *
 * Sem natureza jurídica no cadastro devolve `false`. É a assimetria de sempre —
 * na dúvida não se apaga um sinal.
 */
export function ehSociedadeDeAdvogados(input: {
  naturezaJuridica: string | null | undefined;
  atividadePrincipalCodigo: string | null | undefined;
  atividadePrincipalTexto: string | null | undefined;
}): boolean {
  const nj = String(input.naturezaJuridica ?? '');
  if (!nj.trim()) return false;

  // "Sociedade Unipessoal de Advocacia" é natureza jurídica própria e dispensa
  // conferir a atividade: só advogado a constitui.
  if (/advocacia|advogad/i.test(nj)) return true;

  // Fora dela, sociedade simples é a forma que resta a quem não pode ser
  // empresária. Qualquer natureza empresária cai fora por aqui.
  if (!/sociedade\s+simples/i.test(nj)) return false;

  const codigo = String(input.atividadePrincipalCodigo ?? '').replace(/\D/g, '');
  const texto = String(input.atividadePrincipalTexto ?? '');
  // 69.11-7/01 — Serviços advocatícios. As outras subclasses do 69.11-7 são
  // atividades auxiliares da justiça (/02) e agente de propriedade industrial
  // (/03), que não constituem sociedade de advogados.
  return codigo.startsWith('6911701') || /servi[çc]os?\s+advocat[íi]cios/i.test(texto);
}

// ─── Receita zerada: ausência de dado disfarçada de fato ─────────────────────

export interface ReceitaZerada {
  /** Zerado no ano anterior, mas faturando neste — e é o anterior que define o porte. */
  anoAnterior: boolean;
  /** Zerado neste ano, mas faturou no anterior. */
  anoCorrente: boolean;
  /** Zerado nos DOIS anos: o porte ME não tem nenhum faturamento por trás. */
  semFaturamento: boolean;
}

/**
 * O SCI devolveu ZERO onde deveria haver faturamento?
 *
 * Doze meses de zeros e doze meses ausentes chegam aqui como coisas
 * diferentes — `rbaaCentavos: 0` contra `null` —, e o motor trata a segunda
 * como desconhecida. Mas o zero também pode ser ausência: cliente que entrou no
 * escritório neste ano, ou que teve o código SCI trocado, tem o histórico
 * anterior gravado como zero em vez de faltando.
 *
 * Isso importa porque RBAA zerada classifica a empresa como **ME** — e ME é
 * isenta da cota. Uma empresa aberta em 2017, faturando R$ 5 mi neste ano e
 * "zero" no anterior, seria declarada isenta com base num dado que provavelmente
 * não existe.
 *
 * SINALIZA e não decide, pelo mesmo motivo de sempre: zero pode ser zero. Há
 * empresa sem movimento no ano, e transformá-la em "sem dados" seria trocar um
 * erro por outro.
 *
 * A idade da empresa é o primeiro filtro: só há suspeita quando ela existia
 * durante TODO o ano em questão — quem abriu no meio do ano anterior tem motivo
 * de sobra para ter fechado aquele ano em zero.
 *
 * O segundo filtro é o que separa TRÊS problemas que não são o mesmo:
 *
 *  - Zerado num ano e faturando no outro: os dois anos se contradizem, e o
 *    zerado é quase certamente dado ausente. É o caso grave quando o zerado é o
 *    ANTERIOR, porque é ele que define o porte.
 *  - Zerado nos dois: não há contradição, há ausência total. O porte ME sai de
 *    lugar nenhum — mas é problema de cobertura, não de classificação duvidosa,
 *    e misturá-lo com os outros encheria a fila de conferência.
 *
 * Sem essa separação, 47 dos 217 clientes entravam na mesma fila que os 6 casos
 * realmente contraditórios — e fila cheia de caso sem urgência é fila que
 * ninguém confere.
 */
export function receitaZeradaSuspeita(input: {
  ano: number;
  /** Data de abertura em `YYYY-MM-DD`. Sem ela, não há como julgar. */
  aberturaIso: string | null | undefined;
  rbaaCentavos: number | null;
  rbaCentavos: number | null;
  /** Meses do ano corrente que não vieram. Com buracos, zero não é conclusão. */
  mesesFaltantes: number[];
}): ReceitaZerada {
  const { ano, aberturaIso, rbaaCentavos, rbaCentavos, mesesFaltantes } = input;
  const nada: ReceitaZerada = { anoAnterior: false, anoCorrente: false, semFaturamento: false };

  const anoAbertura = aberturaIso ? Number(String(aberturaIso).slice(0, 4)) : null;
  if (!anoAbertura || !Number.isFinite(anoAbertura)) return nada;

  // RBAA só é diferente de null quando os 12 meses vieram — zero aqui é
  // "coletou o ano inteiro e deu zero".
  const anteriorZerado = rbaaCentavos === 0 && anoAbertura < ano - 1;
  // No ano corrente é preciso exigir a coleta completa: sem os meses, o zero é
  // só ausência, que o motor já trata como SEM_DADOS.
  const correnteZerado = rbaCentavos === 0 && mesesFaltantes.length === 0 && anoAbertura < ano;

  const faturouAnterior = rbaaCentavos !== null && rbaaCentavos > 0;
  const faturouCorrente = rbaCentavos !== null && rbaCentavos > 0;

  return {
    anoAnterior: anteriorZerado && faturouCorrente,
    anoCorrente: correnteZerado && faturouAnterior,
    semFaturamento: anteriorZerado && correnteZerado,
  };
}

// ─── Diagnóstico: onde a empresa está, para onde vai e quando ────────────────

export type SituacaoFaixa =
  /** Dentro da faixa do porte atual, sem transição à vista. */
  | 'DENTRO_DA_FAIXA'
  /** Passou do teto, mas o efeito só vem em 1º de janeiro. */
  | 'MUDA_EM_JANEIRO'
  /** Passou de 20% acima do teto de EPP: já mudou dentro do ano. */
  | 'MUDOU_NO_ANO'
  /** Já é Demais e continua Demais. */
  | 'JA_SUJEITA'
  | 'INDETERMINADO';

export interface Diagnostico {
  porteAtual: Porte;
  /** Para onde vai, se houver transição. `null` quando não há. */
  proximoPorte: Porte | null;
  situacao: SituacaoFaixa;
  /** Teto da faixa em que a empresa está hoje, em centavos. */
  limiteDaFaixaCentavos: number | null;
  /** Quanto ainda cabe antes de estourar o teto da faixa. Negativo = já passou. */
  folgaCentavos: number | null;
  /** Percentual do teto da faixa já consumido. */
  percentualDoLimite: number | null;
  dataEfeito: string | null;
  /** Frase pronta para a tela e o e-mail. */
  resumo: string;
  /** true = a cota é (ou será) exigível; false = isenta; null = indefinido. */
  sujeitaCota: boolean | null;
}

function brl(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function mesPorExtenso(mes: number): string {
  const nomes = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  return nomes[mes - 1] ?? String(mes);
}

/**
 * Traduz a classificação em "onde a empresa está, para onde vai e em que prazo".
 *
 * O ponto central: **cada porte tem os seus limites relevantes**. Avisar uma
 * EPP de que passou de R$ 360 mil é ruído — esse valor está dentro da faixa
 * dela. Os limites que importam por porte:
 *
 *   ME     → teto R$ 360 mil. Passar disso a leva a EPP em 1º/jan (art. 3º §7º,
 *            sem regra de 20%). Continua isenta da cota nos dois portes.
 *   EPP    → teto R$ 4,8 mi. Passar disso a leva a Demais em 1º/jan; passar de
 *            R$ 5,76 mi (20% acima) a leva a Demais já no ano corrente (§9º-A).
 *   DEMAIS → já sujeita à cota; não há "próximo nível" para subir.
 */
export function diagnosticar(input: {
  resultado: ResultadoClassificacao;
  ano: number;
}): Diagnostico {
  const { resultado: r, ano } = input;
  const rba = r.rbaCentavos;

  if (r.porte === 'SEM_DADOS' || rba === null) {
    return {
      porteAtual: 'SEM_DADOS',
      proximoPorte: null,
      situacao: 'INDETERMINADO',
      limiteDaFaixaCentavos: null,
      folgaCentavos: null,
      percentualDoLimite: null,
      dataEfeito: null,
      sujeitaCota: null,
      resumo:
        'Não foi possível concluir o enquadramento — falta faturamento. Não é o mesmo que estar isenta.',
    };
  }

  // Já é Demais: não há próximo nível, a cota é exigível.
  if (r.porte === 'DEMAIS') {
    const porExcesso = r.motivo === 'EXCESSO_20PCT';
    // O consórcio também cai aqui, mas a frase não pode falar em receita: ele
    // não estourou teto, está fora do regime.
    const semPersonalidade = r.motivo === 'SEM_PERSONALIDADE';
    return {
      porteAtual: 'DEMAIS',
      proximoPorte: null,
      situacao: porExcesso ? 'MUDOU_NO_ANO' : 'JA_SUJEITA',
      limiteDaFaixaCentavos: null,
      folgaCentavos: null,
      percentualDoLimite: null,
      dataEfeito: r.dataEfeito,
      sujeitaCota: true,
      resumo: semPersonalidade
        ? 'Consórcio não tem personalidade jurídica (Lei 6.404/76, art. 278, §1º) e não é sujeito do art. 3º da LC 123 — não pode ser ME nem EPP por receita nenhuma. Sem enquadramento diferenciado, a isenção da cota não alcança.'
        : porExcesso
          ? `Passou de ${brl(LIMITE_20PCT_CENTAVOS)} em ${mesPorExtenso(r.mesFatoAplicado ?? 0)} — mais de 20% acima do teto de EPP. Deixou de ser EPP ainda neste ano e a cota de aprendizagem passou a ser exigível.`
          : `Enquadrada como Demais pela receita do ano anterior. A cota de aprendizagem é exigível.`,
    };
  }

  // Sócio PJ no quadro: a receita cabe na faixa, mas o §4º I afasta ME/EPP
  // independentemente dela. A tela não pode anunciar isenção antes de alguém
  // conferir o cartão CNPJ — e também não pode anunciar obrigação a partir de
  // um QSA que talvez esteja desatualizado.
  if (r.impedimentoSocietario) {
    return {
      porteAtual: r.porte,
      proximoPorte: null,
      situacao: 'INDETERMINADO',
      limiteDaFaixaCentavos: null,
      folgaCentavos: null,
      percentualDoLimite: null,
      dataEfeito: null,
      sujeitaCota: null,
      resumo:
        `A receita cabe na faixa de ${r.porte}, mas há sócio pessoa jurídica no quadro — e o ` +
        'art. 3º §4º, I da LC 123 afasta ME/EPP independentemente da receita. Confirme o cartão ' +
        'CNPJ antes de tratar como isenta da cota.',
    };
  }

  // ME e EPP: cada uma com o seu teto.
  const ehME = r.porte === 'ME';
  const tetoDaFaixa = ehME ? LIMITE_ME_CENTAVOS : LIMITE_EPP_CENTAVOS;
  const folga = tetoDaFaixa - rba;
  const percentual = tetoDaFaixa > 0 ? (rba / tetoDaFaixa) * 100 : null;
  const proximoAno = ano + 1;

  // Passou do teto da própria faixa → sobe de nível em 1º de janeiro.
  const passouDoTeto = rba > tetoDaFaixa;

  if (!passouDoTeto) {
    const resumo = ehME
      ? `Dentro do teto de ME (${brl(LIMITE_ME_CENTAVOS)}). Ainda cabem ${brl(folga)} neste ano antes de passar a EPP. Isenta da cota.`
      : `Dentro do teto de EPP (${brl(LIMITE_EPP_CENTAVOS)}). Ainda cabem ${brl(folga)} neste ano antes de passar a Demais. Isenta da cota.`;
    return {
      porteAtual: r.porte,
      proximoPorte: null,
      situacao: 'DENTRO_DA_FAIXA',
      limiteDaFaixaCentavos: tetoDaFaixa,
      folgaCentavos: folga,
      percentualDoLimite: percentual,
      dataEfeito: null,
      sujeitaCota: false,
      resumo,
    };
  }

  // Passou do teto. ME vira EPP; EPP vira Demais — em ambos, só em 1º/jan.
  const proximoPorte: Porte = ehME ? 'EPP' : 'DEMAIS';
  const resumo = ehME
    ? `Passou do teto de ME (${brl(LIMITE_ME_CENTAVOS)}) — acumulado de ${brl(rba)}. Passa a EPP em 1º de janeiro de ${proximoAno}. Continua isenta da cota: ME e EPP são igualmente isentas.`
    : `Passou do teto de EPP (${brl(LIMITE_EPP_CENTAVOS)}) — acumulado de ${brl(rba)}. Como o excesso ficou dentro dos 20%, passa a Demais só em 1º de janeiro de ${proximoAno}, quando a cota se torna exigível. Se ainda este ano ultrapassar ${brl(LIMITE_20PCT_CENTAVOS)}, a mudança antecipa para o mês seguinte ao excesso.`;

  return {
    porteAtual: r.porte,
    proximoPorte,
    situacao: 'MUDA_EM_JANEIRO',
    limiteDaFaixaCentavos: tetoDaFaixa,
    folgaCentavos: folga, // negativo — já passou
    percentualDoLimite: percentual,
    dataEfeito: `${proximoAno}-01-01`,
    // A cota só passa a valer quando o porte vira Demais. ME→EPP não muda nada.
    sujeitaCota: false,
    resumo,
  };
}

/**
 * Quais limites fazem sentido sinalizar para uma empresa deste porte.
 *
 * É isto que impede o ruído de avisar uma EPP sobre os R$ 360 mil — valor que
 * está dentro da faixa dela e não representa evento algum.
 */
export function limitesRelevantes(porteBase: Porte): number[] {
  switch (porteBase) {
    case 'ME':
      // Uma ME acompanha o próprio teto e também os de EPP: se estourar
      // 20% acima de 4,8 mi, vai direto para Demais dentro do ano.
      return [LIMITE_ME_CENTAVOS, LIMITE_EPP_CENTAVOS, LIMITE_20PCT_CENTAVOS];
    case 'EPP':
      return [LIMITE_EPP_CENTAVOS, LIMITE_20PCT_CENTAVOS];
    case 'DEMAIS':
      // Já é Demais: nenhum limite acima muda a situação dela.
      return [];
    default:
      return [];
  }
}

// ─── Detecção de eventos (alimenta a tela e o e-mail) ────────────────────────

export type TipoEvento =
  | 'VIRADA_PORTE'
  | 'PROJECAO_ME_EPP'
  | 'PROJECAO_EPP_DEMAIS'
  | 'REGRESSAO';

/** `MES_SEGUINTE` = já vale; `PRIMEIRO_JAN` = só no ano que vem. */
export type Vigencia = 'MES_SEGUINTE' | 'PRIMEIRO_JAN';

export interface Evento {
  tipo: TipoEvento;
  de: Porte | null;
  para: Porte;
  motivo: MotivoPorte;
  vigencia: Vigencia;
  dataEfeito: string | null;
}

const ORDEM_PORTE: Record<Porte, number> = { SEM_DADOS: -1, ME: 0, EPP: 1, DEMAIS: 2 };

/**
 * Compara a classificação da competência anterior com a atual e devolve o que
 * merece aparecer na tela e no e-mail.
 *
 * Duas distinções que evitam ruído:
 *
 *  1. VIRADA ≠ PROJEÇÃO. Passar de R$ 360 mil (ME→EPP) ou de R$ 4,8 mi com
 *     excesso ≤ 20% NÃO muda o porte no mês — o efeito é 1º/jan (doc §1.2).
 *     Só a regra dos 20% muda dentro do ano. Anunciar isso como "mudou" faria
 *     a tela afirmar uma mudança que ainda não valeu.
 *
 *  2. Projeção dispara na TRANSIÇÃO false→true, não em todo mês em que o valor
 *     segue acima do limite — senão o mesmo cliente reapareceria no e-mail
 *     todos os meses até o fim do ano.
 */
export function detectarEventos(
  anterior: ResultadoClassificacao | null,
  atual: ResultadoClassificacao
): Evento[] {
  const eventos: Evento[] = [];
  const porteAnterior = anterior?.porte ?? null;

  // 1. Mudança de porte que JÁ vale
  if (porteAnterior !== null && porteAnterior !== atual.porte) {
    const subiu = ORDEM_PORTE[atual.porte] > ORDEM_PORTE[porteAnterior];
    const relevante = atual.porte !== 'SEM_DADOS' && porteAnterior !== 'SEM_DADOS';
    if (relevante) {
      eventos.push({
        tipo: subiu ? 'VIRADA_PORTE' : 'REGRESSAO',
        de: porteAnterior,
        para: atual.porte,
        motivo: atual.motivo,
        vigencia: atual.motivo === 'EXCESSO_20PCT' ? 'MES_SEGUINTE' : 'PRIMEIRO_JAN',
        dataEfeito: atual.dataEfeito,
      });
    }
  }

  // 2. Projeções — só na transição
  if (atual.excedeTetoEpp && !anterior?.excedeTetoEpp && atual.motivo !== 'EXCESSO_20PCT') {
    eventos.push({
      tipo: 'PROJECAO_EPP_DEMAIS',
      de: atual.porte,
      para: 'DEMAIS',
      motivo: 'RBAA',
      vigencia: 'PRIMEIRO_JAN',
      dataEfeito: atual.dataEfeito,
    });
  }

  if (atual.excedeTetoMe && !anterior?.excedeTetoMe) {
    eventos.push({
      tipo: 'PROJECAO_ME_EPP',
      de: 'ME',
      para: 'EPP',
      motivo: 'RBAA',
      vigencia: 'PRIMEIRO_JAN',
      dataEfeito: atual.dataEfeito,
    });
  }

  return eventos;
}
// ─── Cadastro da Receita × porte apurado: a leitura da divergência ───────────

/**
 * O texto por extenso do porte no cartão CNPJ vira a sigla que o motor usa.
 *
 * A Receita grava "MICROEMPRESA", "EMPRESA DE PEQUENO PORTE" e "DEMAIS";
 * comparar isso com o `Porte` apurado exigiria fazer a tradução na cabeça em
 * todo lugar onde os dois aparecem lado a lado.
 *
 * ESTA FUNÇÃO TEM UMA GÊMEA no frontend (`CotaAprendizagemTab.tsx`), porque a
 * tela recebe `porte_declarado` cru da API. As duas precisam concordar: é a
 * mesma frase que sai na tabela e na planilha.
 */
export function normalizarPorteDeclarado(texto: string | null | undefined): Porte | null {
  const t = String(texto ?? '').trim().toUpperCase();
  if (!t) return null;
  if (t.includes('MICRO')) return 'ME';
  if (t.includes('PEQUENO')) return 'EPP';
  if (t.includes('DEMAIS')) return 'DEMAIS';
  return null;
}

export type DivergenciaCadastro = 'DESENQUADRAR' | 'REENQUADRAR' | 'REGISTRO_OAB';

/**
 * O que significa o cadastro discordar do porte apurado — e não é a mesma coisa
 * nos três casos. Gêmea da função homônima no frontend.
 *
 * DESENQUADRAR: consta ME/EPP e a receita apurada já é de Demais. Único caso
 * que muda a conclusão sobre a cota: ou o desenquadramento não foi pedido, ou o
 * faturamento veio do código SCI errado.
 *
 * REENQUADRAR: o inverso. Não muda a cota (a isenção sai do porte apurado), mas
 * a empresa pode simplesmente não ter pedido o reenquadramento.
 *
 * REGISTRO_OAB: o mesmo desenho numa sociedade de advogados, onde o "Demais" do
 * CNPJ é obrigatório e permanente — ver `ehSociedadeDeAdvogados`. Não é
 * pendência: não há reenquadramento a protocolar.
 */
export function divergenciaCadastro(
  declarado: Porte | null,
  apurado: Porte,
  sociedadeAdvogados = false
): DivergenciaCadastro | null {
  if (declarado === null || apurado === 'SEM_DADOS' || declarado === apurado) return null;
  if (apurado === 'DEMAIS') return 'DESENQUADRAR';
  if (declarado === 'DEMAIS') return sociedadeAdvogados ? 'REGISTRO_OAB' : 'REENQUADRAR';
  return null;
}

/** Rótulos de situação quando não há pendência de cadastro a relatar. */
const ROTULO_SITUACAO: Record<SituacaoFaixa, string> = {
  DENTRO_DA_FAIXA: 'Permanece',
  MUDA_EM_JANEIRO: 'Muda em 1º de janeiro',
  MUDOU_NO_ANO: 'Mudou dentro do ano',
  JA_SUJEITA: 'Permanece Demais',
  INDETERMINADO: 'A conferir',
};

/**
 * A frase da coluna "Situação" da planilha. A tela tem a sua própria versão,
 * em duas linhas (título e subtítulo), mas os rótulos de PENDÊNCIA saem daqui
 * palavra por palavra: quem confere o Excel e quem confere a tela precisa ler a
 * mesma coisa sobre a mesma empresa.
 *
 * "PERMANECE" SÓ QUANDO NÃO HÁ NADA A FAZER. O `Diagnostico` sozinho não sabe
 * disso: ele compara a empresa com os limites da lei e conclui "já é Demais e
 * segue Demais" — verdade sobre a receita, e leitura errada quando a Receita
 * Federal ainda registra ME/EPP. Numa competência real, 43 linhas saíram com o
 * mesmo "Permanece Demais" e em 4 delas o desenquadramento nunca foi feito: a
 * coluna dizia que estava tudo no lugar justamente onde faltava providência.
 *
 * Quando há pendência, o rótulo deixa de descrever o PRAZO e passa a descrever
 * a PROVIDÊNCIA. "Deveria ser" e não "passa a ser" porque não há data futura
 * envolvida — o enquadramento pela receita já é este, o que falta é o cadastro
 * acompanhar.
 *
 * Sociedade de advogados fica de fora de propósito: ela ESTÁ onde deveria
 * estar, e "Permanece" é a leitura correta.
 */
export function rotuloSituacao(input: {
  situacao: SituacaoFaixa;
  porteApurado: Porte;
  /** Porte que consta na Receita, já normalizado. Sem ele não há pendência. */
  declarado: Porte | null;
  sociedadeAdvogados?: boolean;
}): string {
  const { situacao, porteApurado, declarado, sociedadeAdvogados = false } = input;
  const divergencia = divergenciaCadastro(declarado, porteApurado, sociedadeAdvogados);
  if (divergencia === 'DESENQUADRAR') return 'Deveria ser Demais';
  if (divergencia === 'REENQUADRAR') return `Poderia ser ${porteApurado === 'ME' ? 'ME' : 'EPP'}`;
  return ROTULO_SITUACAO[situacao] ?? situacao;
}
