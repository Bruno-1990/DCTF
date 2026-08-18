/**
 * Os DOIS e-mails mensais da apuração de porte.
 *
 * Mesma apuração, dois recortes: `montarHtmlEnquadramento` (Fiscal) e
 * `montarHtmlCota` (Departamento Pessoal). O que muda entre eles está
 * documentado em cada função.
 *
 * Ambos são organizados por PRAZO — é o prazo que decide o que se faz com a
 * informação:
 *
 *  1. Totalizadores: a foto do mês, sempre presente (mesmo sem mudança).
 *  2. Já mudou, dentro deste ano (regra dos 20%).
 *  3. Pode mudar no mês seguinte: projeção pela média mensal.
 *  4. Muda em 1º/jan do ano seguinte.
 *  5. Registro (regressões) e ressalvas de cobertura.
 *
 * Nas listas a enumeração é COMPLETA — quem lê precisa saber de quais empresas
 * se trata, não só quantas. Seção sem conteúdo não é renderizada: nada de "0
 * clientes"; os zeros aparecem uma única vez, nos totalizadores.
 *
 * O QUE NÃO ENTRA: detalhe que não muda a decisão de quem lê. Método de
 * cálculo, texto de lei e desdobramento por cliente ficam na tela — o e-mail
 * leva o botão para lá. Cada linha a mais em corpo 11px é uma linha a menos de
 * atenção na que importa.
 *
 * A montagem do HTML é função PURA (testável sem SMTP); o envio e a
 * deduplicação ficam no serviço.
 */

import type { LinhaClassificacao } from './CotaAprendizagemService';
import { LIMITE_20PCT_CENTAVOS, calcularDataEfeito } from './cotaAprendizagem.rules';
import {
  C,
  esc,
  formatCnpj,
  moeda,
  dataBr,
  barra,
  secao,
  itemLista,
  notaDaSecao,
  blocoNeutro,
  blocoVazio,
  blocoRessalvas,
  painelTotais,
  quadroLinhas,
  moldura,
} from './email.layout';

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export const COTA_PAGE_URL =
  process.env['COTA_PAGE_URL'] || 'http://192.168.0.47:5173/clientes?tab=cota-aprendizagem';

/**
 * A apuração é uma só, mas os avisos são DOIS — públicos diferentes.
 *
 *   ENQUADRAMENTO → Fiscal. O porte (ME/EPP/Demais) e suas transições, que é o
 *                   que muda regime, obrigação acessória e limite de receita.
 *   COTA          → Departamento Pessoal. Quem precisa contratar aprendiz, a
 *                   partir de quando, e quem deixou de precisar.
 *
 * Num e-mail só, cada time tinha de garimpar no meio do assunto do outro: o DP
 * lia "passa de ME a EPP" (que não muda nada para ele) e o Fiscal lia "cota
 * exigível" (que não é da sua alçada). Mesmo dado de origem, recortes e prazos
 * distintos.
 */
export const TITULO_ENQUADRAMENTO = 'Enquadramento de Porte';
export const TITULO_COTA = 'Cota de Aprendizagem';

export function labelCompetencia(ano: number, mes: number): string {
  return `${MESES[mes - 1]} de ${ano}`;
}

// Formatação e escape vêm do padrão comum — reexportados porque são parte da
// interface deste módulo desde antes de existir o `email.layout`.
export { esc, formatCnpj, moeda, dataBr } from './email.layout';

// ─── Projeção: quem pode virar Demais já no mês seguinte ─────────────────────

/**
 * Média mensal do que já foi apurado no ano, em centavos.
 *
 * Divide pelos meses que TÊM dado, não pelo mês de referência: com coleta
 * incompleta, dividir por 7 quando só 4 meses vieram produziria uma média
 * artificialmente baixa e esconderia justamente quem está prestes a estourar.
 */
export function mediaMensalCentavos(c: LinhaClassificacao): number | null {
  if (c.rba === null) return null;
  const mesesComDado = c.mes - c.meses_faltantes;
  if (mesesComDado <= 0) return null;
  return Math.round((c.rba * 100) / mesesComDado);
}

/**
 * Margem de variação sobre a média mensal.
 *
 * Um corte estrito (`falta > média` ⇒ não avisa) erra por pouco justamente no
 * caso que mais importa: com R$ 5,03 mi acumulados em 7 meses, a projeção pela
 * média para R$ 11 mil abaixo do limite — e o cliente ficaria de fora do aviso
 * por 0,2%. Faturamento mensal não é constante; o que a seção responde é "o que
 * falta cabe em UM mês típico deste cliente?", e um mês típico varia.
 */
const MARGEM_VARIACAO_MENSAL = 1.2;

export interface Suscetibilidade {
  rbaCentavos: number;
  mediaCentavos: number;
  /** RBA + média: onde a empresa chega se o mês seguinte repetir o padrão. */
  projecaoCentavos: number;
  /** Quanto ainda falta para os R$ 5,76 mi. */
  faltaCentavos: number;
  /** Data em que a cota passaria a ser exigível se o excesso se confirmar. */
  dataEfeitoPrevista: string | null;
}

/**
 * A empresa está a um mês de perder o enquadramento DENTRO do ano?
 *
 * A regra dos 20% (LC 123 art. 3º §9º-A) é a única que muda o porte no meio do
 * ano, e ela dispara ao passar de R$ 5,76 mi. Este cálculo responde "pelo ritmo
 * do próprio cliente, o que falta cabe no mês que vem?" — comparando o que
 * falta com a média mensal mais a margem de variação acima.
 *
 * É PROJEÇÃO, não fato: serve para o analista avisar o cliente antes, não para
 * mudar classificação nenhuma. Nada aqui grava porte.
 *
 * Devolve `null` (não é caso desta seção) quando:
 *  - o porte não é ME/EPP — quem já é Demais não tem o que perder, e SEM_DADOS
 *    não permite concluir coisa alguma;
 *  - a competência é dezembro — não existe "mês seguinte" dentro do
 *    ano-calendário, a RBA zera em janeiro;
 *  - a RBA já passou de R$ 5,76 mi — aí não é suscetibilidade, é fato
 *    consumado, e o cliente sai na seção de quem já virou.
 */
export function avaliarSuscetibilidade(c: LinhaClassificacao): Suscetibilidade | null {
  if (c.porte !== 'ME' && c.porte !== 'EPP') return null;
  if (c.mes >= 12) return null;
  if (c.rba === null) return null;

  const rbaCentavos = Math.round(c.rba * 100);
  if (rbaCentavos > LIMITE_20PCT_CENTAVOS) return null;

  const mediaCentavos = mediaMensalCentavos(c);
  if (mediaCentavos === null || mediaCentavos <= 0) return null;

  const faltaCentavos = LIMITE_20PCT_CENTAVOS - rbaCentavos;
  if (faltaCentavos > mediaCentavos * MARGEM_VARIACAO_MENSAL) return null;

  const projecaoCentavos = rbaCentavos + mediaCentavos;

  return {
    rbaCentavos,
    mediaCentavos,
    projecaoCentavos,
    faltaCentavos,
    // Estourando no mês seguinte, o efeito é o 1º dia do mês subsequente.
    dataEfeitoPrevista: calcularDataEfeito({
      ano: c.ano,
      mesFato: c.mes + 1,
      imediato: true,
    }),
  };
}

export interface SecoesEmail {
  viraramDemais: LinhaClassificacao[];
  /** Podem estourar R$ 5,76 mi no mês seguinte e antecipar a virada. */
  suscetiveis: LinhaClassificacao[];
  projecaoDemais: LinhaClassificacao[];
  projecaoEpp: LinhaClassificacao[];
  regressoes: LinhaClassificacao[];
  semDados: LinhaClassificacao[];
  revisarJuridico: LinhaClassificacao[];
  /**
   * A relação que o Departamento Pessoal precisa analisar.
   *
   * As outras seções contam o que MUDOU; esta responde "quem eu preciso olhar
   * agora", que não se responde somando as mudanças de um mês.
   *
   * Entram DOIS grupos:
   *
   *  1. Quem está em Demais — sujeita à cota, conclusão fechada.
   *  2. Quem tem sócio pessoa jurídica sem estar em Demais. Pela receita cairia
   *     em ME/EPP, mas o art. 3º §4º, I afasta esse enquadramento — logo ela
   *     NÃO é isenta. Deixá-la de fora dispensaria da análise justamente o caso
   *     em que a isenção é duvidosa.
   *
   * É o mesmo critério do filtro "Sujeitas a contratar aprendiz" da tela: a
   * lista do e-mail e a da tela têm de dar o mesmo conjunto, senão quem confere
   * numa não acha o que viu na outra.
   */
  sujeitasHoje: LinhaClassificacao[];
}

/**
 * Separa os clientes nas seções do e-mail.
 *
 * A distinção que importa é o PRAZO: "virou Demais AGORA" (regra dos 20%) é
 * obrigação que já nasceu; "pode virar no mês seguinte" é projeção; "vira em
 * 1º/jan" é aviso com meses de antecedência. Misturar os três faria o analista
 * tratar como urgente algo com prazo longo — ou o contrário, que é pior.
 *
 * Cada cliente aparece em UMA seção só. Quem é suscetível também está na rota
 * de 1º/jan (se não antecipar, vira lá), mas sai apenas na seção de
 * suscetíveis, onde o texto já cobre as duas datas — repeti-lo abaixo daria a
 * impressão de dois clientes diferentes e inflaria a contagem.
 */
export function separarSecoes(clientes: LinhaClassificacao[]): SecoesEmail {
  const viraramDemais = clientes.filter(
    (c) => c.mudou && c.porte === 'DEMAIS' && c.motivo === 'EXCESSO_20PCT'
  );
  const idsViraram = new Set(viraramDemais.map((c) => c.id));

  const suscetiveis = clientes.filter(
    (c) => !idsViraram.has(c.id) && avaliarSuscetibilidade(c) !== null
  );
  const idsSuscetiveis = new Set(suscetiveis.map((c) => c.id));

  const jaListado = (c: LinhaClassificacao) =>
    idsViraram.has(c.id) || idsSuscetiveis.has(c.id);

  // Maior acumulado primeiro: quem está mais perto do limite é quem interessa
  // ler antes.
  const porRbaDesc = (a: LinhaClassificacao, b: LinhaClassificacao) =>
    (b.rba ?? 0) - (a.rba ?? 0);

  return {
    viraramDemais,
    suscetiveis: [...suscetiveis].sort(porRbaDesc),
    projecaoDemais: clientes
      .filter((c) => !jaListado(c) && c.excede_teto_epp && c.porte !== 'DEMAIS')
      .sort(porRbaDesc),
    // ME que passou dos R$ 4,8 mi não vai para EPP em 1º/jan: vai direto para
    // Demais, e é na lista de cima que ela precisa aparecer. Sem o
    // `!excede_teto_epp` o mesmo cliente saía nas duas, anunciando dois
    // destinos diferentes para a mesma data.
    projecaoEpp: clientes
      .filter((c) => !jaListado(c) && c.excede_teto_me && !c.excede_teto_epp)
      .sort(porRbaDesc),
    regressoes: clientes.filter(
      (c) => c.mudou && c.porte !== 'DEMAIS' && c.porte_anterior === 'DEMAIS'
    ),
    // Por nome: aqui a lista é relação de cadastro, para procurar um cliente,
    // não ranking — ordenar por faturamento obrigaria a varrer tudo.
    sujeitasHoje: clientes
      .filter((c) => c.sujeita_cota === true || c.impedimento_societario)
      .sort((a, b) => String(a.razao_social).localeCompare(String(b.razao_social), 'pt-BR')),
    semDados: clientes.filter((c) => c.porte === 'SEM_DADOS'),
    revisarJuridico: clientes.filter((c) => c.revisar_juridico),
  };
}

// ─── Totalizadores ───────────────────────────────────────────────────────────

export interface Totalizadores {
  avaliados: number;
  me: number;
  epp: number;
  demais: number;
  semDados: number;
  /** Demais — a cota é exigível hoje. */
  sujeitas: number;
  /** ME + EPP — isentas pela IN 146/2018 art. 3º, I. */
  isentas: number;
  /**
   * Nem sujeitas nem isentas: faltou faturamento para concluir, ou há sócio PJ
   * no quadro (art. 3º §4º, I) e a isenção depende de conferir o cartão CNPJ.
   *
   * Existe para que as três contagens FECHEM com o total. Sem ela, quem tem
   * impedimento societário sumia da conta: não entrava em sujeitas nem em
   * isentas, e os cartões não somavam o total avaliado.
   */
  indefinidas: number;
  viraramDemais: number;
  suscetiveis: number;
  viramDemaisEmJaneiro: number;
  viramEppEmJaneiro: number;
  regressoes: number;
  revisarJuridico: number;
  semCodigoSci: number;
  /** Soma das RBAs apuradas, em reais — volume que a apuração cobriu. */
  rbaTotal: number;
}

/**
 * Conta o mês inteiro, não só o que mudou.
 *
 * Os totalizadores existem para responder "a apuração cobriu o quê?" antes de
 * qualquer lista: sem eles, um mês sem mudança nenhuma chega indistinguível de
 * um mês em que a coleta falhou.
 */
export function calcularTotalizadores(
  clientes: LinhaClassificacao[],
  secoes: SecoesEmail,
  semCodigoSci = 0
): Totalizadores {
  const contarPorte = (p: string) => clientes.filter((c) => c.porte === p).length;
  return {
    avaliados: clientes.length,
    me: contarPorte('ME'),
    epp: contarPorte('EPP'),
    demais: contarPorte('DEMAIS'),
    semDados: contarPorte('SEM_DADOS'),
    sujeitas: clientes.filter((c) => c.sujeita_cota === true).length,
    isentas: clientes.filter((c) => c.sujeita_cota === false).length,
    indefinidas: clientes.filter((c) => c.sujeita_cota === null).length,
    viraramDemais: secoes.viraramDemais.length,
    suscetiveis: secoes.suscetiveis.length,
    viramDemaisEmJaneiro: secoes.projecaoDemais.length,
    viramEppEmJaneiro: secoes.projecaoEpp.length,
    regressoes: secoes.regressoes.length,
    revisarJuridico: secoes.revisarJuridico.length,
    semCodigoSci,
    rbaTotal: clientes.reduce((soma, c) => soma + (c.rba ?? 0), 0),
  };
}

// ─── Montagem do e-mail ──────────────────────────────────────────────────────
//
// A aparência (moldura, seções, listas, painel de totais) vem inteira do padrão
// comum em `email.layout`. Aqui fica só o que é DESTE aviso: quais seções
// existem, o que entra em cada uma e como cada cliente é descrito.

/**
 * Ressalva de coleta incompleta, colada ao cliente.
 *
 * Diz "mês sem dado" e não "faltam N meses" porque na seção dos suscetíveis a
 * linha de baixo já usa "faltam" para a distância até o limite em reais — dois
 * "faltam" com sentidos diferentes na mesma linha se confundem.
 */
function ressalvaDeDado(c: LinhaClassificacao): string {
  if (c.dado_confiavel) return '';
  const n = c.meses_faltantes;
  return ` &middot; <span style="color:${C.ATENCAO};font-weight:600;">${n} ${
    n === 1 ? 'mês' : 'meses'
  } sem dado</span>`;
}

/** Identificação do cliente: CNPJ, código no SCI e a ressalva de coleta. */
function metaCliente(c: LinhaClassificacao): string {
  return `${formatCnpj(c.cnpj)}${
    c.codigo_sci ? ` &middot; SCI ${c.codigo_sci}` : ''
  }${ressalvaDeDado(c)}`;
}

/** Uma linha por cliente, no formato padrão de lista. */
function itemCliente(
  c: LinhaClassificacao,
  valor: string,
  complemento: string | null,
  cor: string,
  indice = 0
): string {
  // A ressalva de dado incompleto anda junto do cliente, não numa seção à
  // parte: é lendo aquele número que se precisa saber que ele é um piso.
  return itemLista({
    titulo: esc(c.razao_social),
    meta: metaCliente(c),
    valor,
    complemento,
    cor,
    indice,
  });
}

/** Lista compacta de nomes, para o que é informativo e não exige ação. */
function listaNomes(clientes: LinhaClassificacao[], limite = 8): string {
  const nomes = clientes.slice(0, limite).map((c) => esc(c.razao_social));
  const resto = clientes.length - nomes.length;
  return nomes.join(' &middot; ') + (resto > 0 ? ` <em>e mais ${resto}</em>` : '');
}

/**
 * Linha do suscetível — a única que ganha desenho próprio.
 *
 * Aqui o número sozinho não conta a história: R$ 5,03 mi só significa alguma
 * coisa contra os R$ 5,76 mi do limite. A barra dá essa proporção de imediato,
 * e a linha de baixo destrincha o que a sustenta (o que falta, o ritmo mensal e
 * a data que vale se o excesso se confirmar).
 */
function itemSuscetivel(c: LinhaClassificacao, indice: number): string {
  const s = avaliarSuscetibilidade(c);
  if (!s) return itemCliente(c, moeda(c.rba), null, '#c2410c', indice);

  const fundo = indice % 2 === 1 ? 'background:#fffdfa;' : '';

  return `
    <tr>
      <td colspan="2" style="${fundo}padding:12px 16px;border-bottom:1px solid ${C.LINHA_FINA};">
        <table role="presentation" style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="vertical-align:top;">
              <div style="font-size:13.5px;font-weight:600;color:${C.TINTA};line-height:1.35;">${esc(c.razao_social)}</div>
              <div style="font-size:11.5px;color:${C.APAGADO};margin-top:2px;">${metaCliente(c)}</div>
            </td>
            <td style="text-align:right;white-space:nowrap;vertical-align:top;">
              <div style="font-size:14px;font-weight:700;color:${C.URGENTE};font-variant-numeric:tabular-nums;">${moeda(c.rba)}</div>
              <div style="font-size:11px;color:${C.FRACO};margin-top:2px;">de ${moeda(LIMITE_20PCT_CENTAVOS / 100)}</div>
            </td>
          </tr>
        </table>
        ${barra((s.rbaCentavos / LIMITE_20PCT_CENTAVOS) * 100, '#ea580c', '#fed7aa')}
        <div style="font-size:11.5px;color:#7c2d12;line-height:1.5;">
          faltam <strong>${moeda(s.faltaCentavos / 100)}</strong>
          &middot; efeito em <strong>${dataBr(s.dataEfeitoPrevista)}</strong>
        </div>
      </td>
    </tr>`;
}

// ─── Totalizadores em HTML ───────────────────────────────────────────────────

/**
 * Painel do e-mail do FISCAL: a distribuição por porte.
 *
 * Renderizado SEMPRE — é o que separa "nada mudou" de "a coleta falhou": sem
 * ele, os dois casos chegam na caixa de entrada com a mesma cara.
 */
function totaisEnquadramento(t: Totalizadores, proximoAno: number): string {
  return (
    // A faixa de receita fica só onde define o número (ME e EPP); em "Demais" e
    // "Sem dados" o rótulo já diz tudo, e repetir vira ruído.
    painelTotais([
      { valor: t.me, titulo: 'ME', detalhe: 'até R$ 360 mil', cor: C.TINTA },
      { valor: t.epp, titulo: 'EPP', detalhe: 'até R$ 4,8 mi', cor: C.TINTA },
      { valor: t.demais, titulo: 'Demais', cor: C.ATENCAO },
      { valor: t.semDados, titulo: 'Sem dados', cor: C.ATENCAO },
    ]) +
    quadroLinhas('Movimento da competência', [
      { texto: 'Passaram a Demais neste ano', valor: t.viraramDemais, cor: C.ALERTA },
      { texto: 'Podem virar Demais já no mês seguinte', valor: t.suscetiveis, cor: C.URGENTE },
      {
        texto: `Viram Demais em 1º/jan/${proximoAno}`,
        valor: t.viramDemaisEmJaneiro,
        cor: C.ATENCAO,
      },
      {
        texto: `Passam de ME a EPP em 1º/jan/${proximoAno}`,
        valor: t.viramEppEmJaneiro,
        cor: C.INFO,
      },
      { texto: 'Voltaram de Demais para EPP/ME', valor: t.regressoes, cor: C.OK },
    ])
  );
}

/**
 * Painel do e-mail do DEPARTAMENTO PESSOAL: quem deve a cota.
 *
 * Aqui a distribuição por porte não interessa — ME e EPP são igualmente
 * isentas (IN 146/2018, art. 3º, I), então separá-las só acrescenta um número
 * que não muda decisão nenhuma. O que muda decisão é: deve, não deve, ou não
 * foi possível concluir.
 */
function totaisCota(t: Totalizadores, proximoAno: number): string {
  return (
    // "A conferir" e não "Sem dados": além de quem ficou sem faturamento, entra
    // quem tem sócio PJ no quadro — a receita cabe na faixa, mas o §4º I afasta
    // ME/EPP e a isenção depende do cartão CNPJ. As três colunas fecham com o
    // total avaliado.
    painelTotais([
      { valor: t.sujeitas, titulo: 'Sujeitas à cota', cor: C.ALERTA },
      { valor: t.isentas, titulo: 'Isentas', cor: C.TINTA },
      { valor: t.indefinidas, titulo: 'A conferir', cor: C.ATENCAO },
    ]) +
    quadroLinhas(
      'Movimento da competência',
      [
        { texto: 'Passaram a estar sujeitas à cota neste ano', valor: t.viraramDemais, cor: C.ALERTA },
        {
          texto: 'Podem passar a estar sujeitas já no mês seguinte',
          valor: t.suscetiveis,
          cor: C.URGENTE,
        },
        {
          texto: `Passam a estar sujeitas em 1º/jan/${proximoAno}`,
          valor: t.viramDemaisEmJaneiro,
          cor: C.ATENCAO,
        },
        { texto: 'Deixaram de estar sujeitas', valor: t.regressoes, cor: C.OK },
      ]
    )
  );
}

/**
 * Ressalvas de cobertura — o que a apuração NÃO garante. Iguais nos dois
 * e-mails; isso não muda conforme quem lê. Zero não vira linha.
 *
 * Cada uma cabe em uma linha: o e-mail avisa QUE existe a ressalva, e quem
 * precisar do detalhe abre a tela. A única que carrega explicação é a de dado
 * faltante, porque sem ela "não classificada" se lê como "isenta" — o erro
 * mais caro desta apuração.
 */
function ressalvasDeCobertura(secoes: SecoesEmail, totais: Totalizadores): string[] {
  const r: string[] = [];
  if (secoes.semDados.length > 0) {
    r.push(
      `<strong>${secoes.semDados.length}</strong> não classificadas por falta de faturamento — não são isentas`
    );
  }
  if (totais.semCodigoSci > 0) {
    r.push(`<strong>${totais.semCodigoSci}</strong> sem código SCI`);
  }
  if (secoes.revisarJuridico.length > 0) {
    r.push(`<strong>${secoes.revisarJuridico.length}</strong> a conferir com o jurídico`);
  }
  return r;
}

/** Seção dos suscetíveis — a mesma projeção, com o texto de cada público. */
function secaoSuscetiveis(
  secoes: SecoesEmail,
  titulo: string,
  nota: string
): string {
  return secao({
    titulo,
    contagem: secoes.suscetiveis.length,
    cor: C.URGENTE,
    fundo: C.URGENTE_FUNDO,
    itens:
      secoes.suscetiveis.map((c, i) => itemSuscetivel(c, i)).join('') +
      notaDaSecao(nota, '#7c2d12', C.URGENTE_FUNDO),
  });
}

export interface EntradaEmail {
  ano: number;
  mes: number;
  secoes: SecoesEmail;
  totais: Totalizadores;
}

/**
 * E-MAIL DO FISCAL — o porte e suas transições.
 *
 * Fala de enquadramento do começo ao fim: em que faixa cada cliente está, para
 * onde vai e em que data. Não menciona cota — quem cuida disso recebe o outro
 * e-mail, e citar aqui uma obrigação trabalhista só desviaria a leitura.
 *
 * Função pura: recebe tudo pronto e devolve string.
 */
export function montarHtmlEnquadramento(input: EntradaEmail): string {
  const { ano, mes, secoes, totais } = input;
  const competencia = labelCompetencia(ano, mes);
  const proximoAno = ano + 1;
  const mesSeguinte = MESES[mes % 12];

  const partes: string[] = [];

  // 1. JÁ MUDOU — a regra dos 20% tira o enquadramento dentro do ano.
  if (secoes.viraramDemais.length > 0) {
    partes.push(
      secao({
        titulo: 'Passaram a Demais neste ano · perderam o enquadramento de EPP',
        contagem: secoes.viraramDemais.length,
        cor: C.ALERTA,
        fundo: C.ALERTA_FUNDO,
        itens: secoes.viraramDemais
          .map((c, i) =>
            itemCliente(
              c,
              moeda(c.rba),
              `desde <strong style="color:${C.ALERTA};">${dataBr(c.data_efeito)}</strong>`,
              C.ALERTA,
              i
            )
          )
          .join(''),
      })
    );
  }

  // 2. ANTECEDÊNCIA CURTA — projeção pela média mensal do próprio cliente.
  //    Não muda classificação nenhuma; serve para avisar antes de acontecer.
  if (secoes.suscetiveis.length > 0) {
    partes.push(
      secaoSuscetiveis(
        secoes,
        `Podem virar Demais já em ${mesSeguinte} · projeção pela média mensal`,
        `<strong>Projeção, não fato:</strong> só muda acima de R$ 5.760.000,00 — senão, 1º/jan/${proximoAno}.`
      )
    );
  }

  // 3. PLANEJAMENTO — vira Demais na virada do ano. Lista completa: o analista
  //    precisa saber QUAIS empresas avisar, não só quantas são.
  if (secoes.projecaoDemais.length > 0) {
    partes.push(
      secao({
        // O rótulo do número vai no cabeçalho, uma vez — repeti-lo em cada
        // linha só ocupa espaço sem acrescentar nada.
        titulo: `Viram Demais em 1º/jan/${proximoAno} · acumulado no ano`,
        contagem: secoes.projecaoDemais.length,
        cor: C.ATENCAO,
        fundo: C.ATENCAO_FUNDO,
        itens: secoes.projecaoDemais
          .map((c, i) => itemCliente(c, moeda(c.rba), null, C.ATENCAO, i))
          .join(''),
      })
    );
  }

  // 4. ME→EPP em 1º/jan. Só existe neste e-mail: muda enquadramento, e é o
  //    Fiscal que trabalha com isso.
  if (secoes.projecaoEpp.length > 0) {
    partes.push(
      secao({
        titulo: `Passam de ME a EPP em 1º/jan/${proximoAno} · passaram de R$ 360 mil`,
        contagem: secoes.projecaoEpp.length,
        cor: C.INFO,
        fundo: C.INFO_FUNDO,
        itens: secoes.projecaoEpp
          .map((c, i) => itemCliente(c, moeda(c.rba), null, C.INFO, i))
          .join(''),
      })
    );
  }

  // 5. REGISTRO — não gera ação nem prazo. Uma linha de nomes basta.
  if (secoes.regressoes.length > 0) {
    const verbo = secoes.regressoes.length === 1 ? 'voltou' : 'voltaram';
    partes.push(
      blocoNeutro(
        `<strong style="color:${C.OK};">${secoes.regressoes.length}</strong> ${verbo} de Demais para EPP/ME: ${listaNomes(secoes.regressoes)}`
      )
    );
  }

  const corpo =
    partes.length > 0
      ? partes.join('')
      : blocoVazio(
          `Nenhuma mudança de porte em ${competencia}.`,
          'Os totalizadores acima confirmam que a apuração rodou.'
        );

  return moldura({
    titulo: TITULO_ENQUADRAMENTO,
    subtitulo: competencia,
    cobertura: `${totais.avaliados} clientes avaliados`,
    faixas: totaisEnquadramento(totais, proximoAno),
    corpo: corpo + blocoRessalvas(ressalvasDeCobertura(secoes, totais)),
    cta: { url: COTA_PAGE_URL, texto: 'Abrir no sistema' },
    rodape: {
      titulo: 'Base legal',
      // As faixas já estão no painel e o prazo, em cada seção. Aqui fica só a
      // norma — quem precisar do texto dela não vai procurar num e-mail.
      texto: `Porte pela receita bruta anual (LC 123/2006, art. 3º).
          Enviado automaticamente; não responda.`,
    },
  });
}

/**
 * E-MAIL DO DEPARTAMENTO PESSOAL — quem precisa contratar aprendiz.
 *
 * Recorte diferente do e-mail do Fiscal, e não um subconjunto dele:
 *
 *  - ME→EPP não aparece. As duas são isentas (IN 146/2018, art. 3º, I), então
 *    essa transição não muda nada aqui — era a linha que mais confundia.
 *  - A RELAÇÃO COMPLETA de quem está sujeito hoje aparece, mesmo sem ter
 *    mudado. É a pergunta do DP, e ela não se responde somando as mudanças do
 *    mês.
 *  - O texto fala em "passou a dever a cota", não em "mudou de porte": porte é
 *    o meio, a obrigação é o fim.
 *
 * Função pura: recebe tudo pronto e devolve string.
 */
export function montarHtmlCota(input: EntradaEmail): string {
  const { ano, mes, secoes, totais } = input;
  const competencia = labelCompetencia(ano, mes);
  const proximoAno = ano + 1;
  const mesSeguinte = MESES[mes % 12];

  const partes: string[] = [];

  // 1. AÇÃO IMEDIATA — a cota já é exigível, com data de início.
  if (secoes.viraramDemais.length > 0) {
    partes.push(
      secao({
        titulo: 'Passaram a estar sujeitas à cota neste ano',
        contagem: secoes.viraramDemais.length,
        cor: C.ALERTA,
        fundo: C.ALERTA_FUNDO,
        // A data É o valor da linha, e vem com a preposição junto: "desde
        // 01/07/2026" se lê sozinho. Rótulo em linha separada abaixo do número
        // ficava invertido ("01/07/2026" e só então "exigível desde").
        itens: secoes.viraramDemais
          .map((c, i) => itemCliente(c, `desde ${dataBr(c.data_efeito)}`, null, C.ALERTA, i))
          .join(''),
      })
    );
  }

  // 2. AVISO COM POUCO PRAZO — pode entrar na obrigação já no mês que vem.
  if (secoes.suscetiveis.length > 0) {
    partes.push(
      secaoSuscetiveis(
        secoes,
        `Podem passar a estar sujeitas já em ${mesSeguinte} · projeção`,
        `<strong>Projeção, não fato:</strong> só passa a valer acima de R$ 5.760.000,00 — senão, 1º/jan/${proximoAno}.`
      )
    );
  }

  // 3. PLANEJAMENTO — entra na obrigação na virada do ano. É o prazo que o DP
  //    tem para preparar contratação, então a lista vai nominal.
  if (secoes.projecaoDemais.length > 0) {
    partes.push(
      secao({
        titulo: `Passam a estar sujeitas à cota em 1º/jan/${proximoAno}`,
        contagem: secoes.projecaoDemais.length,
        cor: C.ATENCAO,
        fundo: C.ATENCAO_FUNDO,
        itens: secoes.projecaoDemais
          .map((c, i) => itemCliente(c, moeda(c.rba), null, C.ATENCAO, i))
          .join(''),
      })
    );
  }

  // 4. SAÍDA DA OBRIGAÇÃO — nominal, não como linha de nomes: aqui a mudança
  //    dispensa contratação, e dispensar por engano é caro.
  if (secoes.regressoes.length > 0) {
    partes.push(
      secao({
        titulo: 'Deixaram de estar sujeitas à cota',
        contagem: secoes.regressoes.length,
        cor: C.OK,
        fundo: C.OK_FUNDO,
        itens: secoes.regressoes
          .map((c, i) => itemCliente(c, moeda(c.rba), null, C.OK, i))
          .join(''),
      })
    );
  }

  // 5. A RELAÇÃO — quem precisa ser analisado, tenha mudado ou não. Inclui os
  //    da primeira seção: uma relação com buracos não serve para conferir.
  if (secoes.sujeitasHoje.length > 0) {
    const aConferir = secoes.sujeitasHoje.filter((c) => c.sujeita_cota !== true).length;
    partes.push(
      secao({
        titulo: `Para análise de CBO em ${competencia} · relação completa`,
        contagem: secoes.sujeitasHoje.length,
        cor: C.AZUL,
        fundo: '#eef2ff',
        // No lugar do valor vai o ESTADO da conclusão. Para o DP a receita não
        // muda nada — o que ela decide (o porte) já está resolvido pelo fato de
        // a empresa estar nesta lista. O que ele precisa saber é se o caso está
        // fechado ou depende de conferência.
        itens:
          secoes.sujeitasHoje
            .map((c, i) =>
              c.sujeita_cota === true
                ? itemCliente(c, 'sujeita', null, C.ALERTA, i)
                : itemCliente(c, 'a conferir', 'sócio PJ afasta ME/EPP', C.ATENCAO, i)
            )
            .join('') +
          (aConferir > 0
            ? notaDaSecao(
                `<strong>${aConferir}</strong> ${aConferir === 1 ? 'entra' : 'entram'} por sócio pessoa jurídica no quadro: o art. 3º §4º, I afasta ME/EPP
                 independentemente da receita, então ${aConferir === 1 ? 'ela não é isenta' : 'elas não são isentas'} — confirme o cartão CNPJ.`,
                C.APAGADO,
                C.FUNDO_SUAVE
              )
            : ''),
      })
    );
  }

  const corpo =
    partes.length > 0
      ? partes.join('')
      : blocoVazio(
          `Nenhuma empresa sujeita à cota em ${competencia}.`,
          'Os totalizadores acima confirmam que a apuração rodou.'
        );

  const ressalvas = ressalvasDeCobertura(secoes, totais);
  // A ressalva de ESCOPO é específica deste e-mail e não pode faltar: o
  // sistema apura QUEM deve a cota, nunca QUANTOS aprendizes. Sem ela, o DP
  // pode ler a lista como se o número já estivesse calculado.
  ressalvas.push('apura <strong>quem</strong> está sujeito à cota, não <strong>quantos</strong> aprendizes');

  return moldura({
    titulo: TITULO_COTA,
    subtitulo: competencia,
    cobertura: `${totais.avaliados} clientes avaliados`,
    faixas: totaisCota(totais, proximoAno),
    corpo: corpo + blocoRessalvas(ressalvas),
    cta: { url: COTA_PAGE_URL, texto: 'Abrir no sistema' },
    rodape: {
      titulo: 'Base legal',
      // Do texto legal fica só o que muda a leitura da lista: a norma da
      // isenção e a ressalva da analogia — esta última porque é ela que
      // recomenda conferir antes de tratar a data como definitiva.
      texto: `ME e EPP são isentas da cota (IN SIT/MTE 146/2018, art. 3º, I; CLT art. 429).
          Aplicar a data de corte da LC 123 ao campo trabalhista é construção por analogia —
          confirme com o jurídico. Enviado automaticamente; não responda.`,
    },
  });
}
