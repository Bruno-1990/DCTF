/**
 * Testes da conferência REOA (grupo SUBSTITUTO) — janela, limite e tri-estado.
 *
 * Zero mocks, zero I/O: as três funções exercitadas aqui são puras, e a data
 * entra por parâmetro. É isso que permite testar a coisa que mais importa nesta
 * regra e que nenhum teste de snapshot pegaria — o que acontece com uma coleta
 * PARADA quando o relógio anda por cima dela.
 *
 * O que estes testes congelam, além do óbvio:
 *
 *  - A janela é calculada pelo RELÓGIO e os dados só entram sob demanda. As
 *    duas coisas andam em velocidades diferentes, e o bloco "dinamismo" no fim
 *    do arquivo mede exatamente esse descompasso.
 *  - O limite é "abaixo de", não "até": R$ 300.000,00 cravado está DENTRO.
 *  - Mês ausente e mês zerado são a mesma coisa para a regra (ambos "sem
 *    dados") — decisão deliberada, para não alarmar com mês que o SCI ainda não
 *    fechou. O preço dela está documentado no último describe.
 */

import {
  THRESHOLD_MENSAL,
  construirJanela,
  construirEstabelecimentos,
} from '../SubstitutoService';

/** Índice codEmpresa → bdref → faturamento, no formato que a montagem espera. */
function indice(porEmpresa: Record<number, Record<number, number>>) {
  const idx = new Map<number, Map<number, number>>();
  for (const [cod, meses] of Object.entries(porEmpresa)) {
    const m = new Map<number, number>();
    for (const [bdref, valor] of Object.entries(meses)) m.set(Number(bdref), valor);
    idx.set(Number(cod), m);
  }
  return idx;
}

/** Uma coleta cheia: os 12 meses da janela de `hoje`, todos com o mesmo valor. */
function coletaCheia(hoje: Date, valor: number, cod = 100) {
  const meses: Record<number, number> = {};
  for (const j of construirJanela(hoje)) meses[j.bdref] = valor;
  return indice({ [cod]: meses });
}

const rotuloFixo = () => 'Matriz';
const bdrefs = (hoje: Date) => construirJanela(hoje).map((j) => j.bdref);

// ─── Janela ──────────────────────────────────────────────────────────────────

describe('construirJanela — 12 meses fechados, terminando no mês anterior', () => {
  it('devolve 12 meses, do mais antigo para o mais recente', () => {
    const janela = construirJanela(new Date(2026, 7, 20)); // 20/08/2026
    expect(janela).toHaveLength(12);
    expect(janela[0].bdref).toBe(202508);
    expect(janela[11].bdref).toBe(202607);
  });

  it('termina no mês ANTERIOR — o mês corrente ainda não fechou no SCI', () => {
    const janela = construirJanela(new Date(2026, 7, 20));
    expect(janela.map((j) => j.bdref)).not.toContain(202608);
  });

  it('vira o ano: em janeiro o último mês fechado é dezembro do ano anterior', () => {
    const janela = construirJanela(new Date(2027, 0, 5)); // 05/01/2027
    expect(janela[11].bdref).toBe(202612);
    expect(janela[0].bdref).toBe(202601);
  });

  it('atravessa a virada no meio da janela', () => {
    const janela = construirJanela(new Date(2026, 2, 15)); // 15/03/2026
    expect(janela[0].bdref).toBe(202503);
    expect(janela[11].bdref).toBe(202602);
    expect(janela.map((j) => j.bdref)).toContain(202512);
    expect(janela.map((j) => j.bdref)).toContain(202601);
  });

  it('o dia do mês não muda a janela — dia 1 e dia 31 dão a mesma coisa', () => {
    expect(bdrefs(new Date(2026, 7, 1))).toEqual(bdrefs(new Date(2026, 7, 31)));
  });

  it('a sequência é contígua e sem repetição', () => {
    const janela = construirJanela(new Date(2026, 0, 10)); // 10/01/2026
    const refs = janela.map((j) => j.bdref);
    expect(new Set(refs).size).toBe(12);
    for (let i = 1; i < janela.length; i++) {
      const anterior = janela[i - 1];
      const esperado =
        anterior.mes === 12
          ? { ano: anterior.ano + 1, mes: 1 }
          : { ano: anterior.ano, mes: anterior.mes + 1 };
      expect({ ano: janela[i].ano, mes: janela[i].mes }).toEqual(esperado);
    }
  });

  it('bdref é ano*100+mes, o formato de competência do SCI', () => {
    for (const j of construirJanela(new Date(2026, 5, 9))) {
      expect(j.bdref).toBe(j.ano * 100 + j.mes);
    }
  });
});

// ─── Limite mensal ───────────────────────────────────────────────────────────

describe('limite mensal — "abaixo de", não "até"', () => {
  const hoje = new Date(2026, 7, 20);
  const primeiro = construirJanela(hoje)[0].bdref;

  const statusCom = (valor: number) => {
    const idx = indice({ 100: { [primeiro]: valor } });
    const { estabelecimentos } = construirEstabelecimentos(idx, construirJanela(hoje), rotuloFixo);
    return estabelecimentos[0].meses[0];
  };

  it('o valor EXATO no limite não é abaixo', () => {
    expect(statusCom(THRESHOLD_MENSAL).abaixo).toBe(false);
  });

  it('um centavo abaixo do limite é abaixo', () => {
    expect(statusCom(THRESHOLD_MENSAL - 0.01).abaixo).toBe(true);
  });

  it('acima do limite não é abaixo', () => {
    expect(statusCom(THRESHOLD_MENSAL + 0.01).abaixo).toBe(false);
  });
});

// ─── Tri-estado do mês ───────────────────────────────────────────────────────

describe('mês ausente, zerado e positivo são três coisas', () => {
  const hoje = new Date(2026, 7, 20);
  const janela = construirJanela(hoje);
  const [m1, m2, m3] = [janela[0].bdref, janela[1].bdref, janela[2].bdref];

  const montar = () =>
    construirEstabelecimentos(
      // m1 positivo abaixo · m2 zerado · m3 ausente (não está no índice)
      indice({ 100: { [m1]: 1000, [m2]: 0 } }),
      janela,
      rotuloFixo
    ).estabelecimentos[0];

  it('positivo abaixo do limite é "abaixo", com o valor preservado', () => {
    const mes = montar().meses[0];
    expect(mes).toMatchObject({ bdref: m1, faturamento: 1000, abaixo: true, semDados: false });
  });

  it('zero é "sem dados" e NÃO conta como abaixo — no SCI, 0 é mês não apurado', () => {
    const mes = montar().meses[1];
    expect(mes).toMatchObject({ bdref: m2, faturamento: null, abaixo: false, semDados: true });
  });

  it('mês ausente do índice é "sem dados", igual ao zero', () => {
    const mes = montar().meses[2];
    expect(mes).toMatchObject({ bdref: m3, faturamento: null, abaixo: false, semDados: true });
  });

  it('valor negativo (estorno) não vira alerta — cai em "sem dados"', () => {
    const idx = indice({ 100: { [m1]: -5000 } });
    const est = construirEstabelecimentos(idx, janela, rotuloFixo).estabelecimentos[0];
    expect(est.meses[0]).toMatchObject({ faturamento: null, abaixo: false, semDados: true });
  });

  it('mesesSemDados conta os dois casos juntos', () => {
    expect(montar().mesesSemDados).toBe(11); // 12 − 1 positivo
  });
});

// ─── Estabelecimentos ────────────────────────────────────────────────────────

describe('um card por estabelecimento — o limite é de cada um, não da soma', () => {
  const hoje = new Date(2026, 7, 20);
  const janela = construirJanela(hoje);
  const mes = janela[0].bdref;

  it('separa os códigos e mantém a ordem crescente', () => {
    const idx = indice({ 300: { [mes]: 999999 }, 100: { [mes]: 999999 } });
    const { estabelecimentos } = construirEstabelecimentos(idx, janela, rotuloFixo);
    expect(estabelecimentos.map((e) => e.codigo_empresa)).toEqual([100, 300]);
  });

  it('uma filial abaixo derruba o cliente inteiro, mesmo com a matriz bem', () => {
    const idx = indice({ 100: { [mes]: 999999 }, 300: { [mes]: 1000 } });
    const r = construirEstabelecimentos(idx, janela, rotuloFixo);
    expect(r.estabelecimentos[0].temAlgumAbaixo).toBe(false);
    expect(r.estabelecimentos[1].temAlgumAbaixo).toBe(true);
    expect(r.temAlgumAbaixo).toBe(true);
  });

  it('o rótulo separa matriz de filial pelo código SCI do cliente', () => {
    const idx = indice({ 100: { [mes]: 999999 }, 300: { [mes]: 999999 } });
    const label = (cod: number) => (cod === 100 ? 'Matriz' : `Filial ${cod}`);
    const { estabelecimentos } = construirEstabelecimentos(idx, janela, label);
    expect(estabelecimentos.map((e) => e.rotulo)).toEqual(['Matriz', 'Filial 300']);
  });

  /**
   * Cliente sem NENHUMA coleta cai num código fixo `1`. Para quem tem código SCI
   * diferente de 1 — que é a regra — isso produz um card rotulado "Filial 1",
   * um estabelecimento que não existe. Está aqui para o dia em que for corrigido
   * a mudança ser deliberada, e não um efeito colateral.
   *
   * O que já não acontece: esse card fantasma passar por conforme. Sem mês
   * nenhum conferido, o status é INDETERMINADO.
   */
  it('sem coleta nenhuma, inventa um estabelecimento de código 1', () => {
    const r = construirEstabelecimentos(undefined, janela, (cod) =>
      cod === 320 ? 'Matriz' : `Filial ${cod}`
    );
    expect(r.estabelecimentos).toHaveLength(1);
    expect(r.estabelecimentos[0].codigo_empresa).toBe(1);
    expect(r.estabelecimentos[0].rotulo).toBe('Filial 1');
    expect(r.estabelecimentos[0].mesesSemDados).toBe(12);
    expect(r.temAlgumAbaixo).toBe(false);
    expect(r.status).toBe('INDETERMINADO');
  });

  it('uma filial sem coleta impede afirmar OK do cliente inteiro', () => {
    // Matriz conferida e acima do limite nos 12 meses; filial sem nada.
    const meses: Record<number, number> = {};
    for (const j of janela) meses[j.bdref] = 999999;
    const idx = indice({ 100: meses, 300: {} });
    idx.set(300, new Map()); // estabelecimento existe, mês nenhum
    const r = construirEstabelecimentos(idx, janela, rotuloFixo);
    expect(r.estabelecimentos[0].status).toBe('OK');
    expect(r.estabelecimentos[1].status).toBe('INDETERMINADO');
    expect(r.status).toBe('INDETERMINADO');
  });
});

// ─── Status: três respostas, não duas ────────────────────────────────────────

describe('status — "conferido e ok" não é "vazio e ok"', () => {
  const hoje = new Date(2026, 7, 20);
  const janela = construirJanela(hoje);

  const comValores = (valor: number, quantos = 12) => {
    const meses: Record<number, number> = {};
    janela.slice(0, quantos).forEach((j) => (meses[j.bdref] = valor));
    return construirEstabelecimentos(indice({ 100: meses }), janela, rotuloFixo);
  };

  it('janela completa e toda acima do limite: OK', () => {
    expect(comValores(999999).status).toBe('OK');
  });

  it('algum mês comprovadamente abaixo: ABAIXO', () => {
    expect(comValores(1000).status).toBe('ABAIXO');
  });

  it('nenhum abaixo, mas falta mês: INDETERMINADO, não OK', () => {
    expect(comValores(999999, 11).status).toBe('INDETERMINADO');
  });

  it('um mês faltando não apaga um abaixo já provado — buraco não desmente fato', () => {
    const meses: Record<number, number> = {};
    janela.slice(0, 11).forEach((j) => (meses[j.bdref] = 999999));
    meses[janela[0].bdref] = 1000; // o primeiro estava abaixo
    const r = construirEstabelecimentos(indice({ 100: meses }), janela, rotuloFixo);
    expect(r.estabelecimentos[0].mesesSemDados).toBe(1);
    expect(r.status).toBe('ABAIXO');
  });

  it('janela inteira vazia nunca vira OK', () => {
    expect(comValores(999999, 0).status).toBe('INDETERMINADO');
  });
});

// ─── Dinamismo: a janela anda, a coleta não ──────────────────────────────────

describe('dinamismo — o que o tempo faz com uma coleta parada', () => {
  const coleta = new Date(2026, 6, 17); // 17/07/2026, a última coleta real da base
  const abaixoDoLimite = THRESHOLD_MENSAL - 1;

  /** Lê a MESMA coleta com o relógio adiantado em `meses`. */
  const lerDepoisDe = (meses: number) => {
    const idx = coletaCheia(coleta, abaixoDoLimite);
    const relogio = new Date(coleta.getFullYear(), coleta.getMonth() + meses, 20);
    return construirEstabelecimentos(idx, construirJanela(relogio), rotuloFixo);
  };

  it('no dia da coleta, os 12 meses batem com a janela', () => {
    const r = lerDepoisDe(0);
    expect(r.estabelecimentos[0].mesesSemDados).toBe(0);
    expect(r.temAlgumAbaixo).toBe(true);
  });

  it('um mês depois, a janela perde o mês mais antigo e ganha um vazio no fim', () => {
    const r = lerDepoisDe(1);
    const meses = r.estabelecimentos[0].meses;
    expect(r.estabelecimentos[0].mesesSemDados).toBe(1);
    expect(meses[11].semDados).toBe(true); // o mês novo, que ninguém puxou
    expect(meses[0].semDados).toBe(false); // o mais antigo da coleta ainda cabe
  });

  it('o buraco cresce um mês por mês, sem ninguém tocar em nada', () => {
    expect(lerDepoisDe(3).estabelecimentos[0].mesesSemDados).toBe(3);
    expect(lerDepoisDe(6).estabelecimentos[0].mesesSemDados).toBe(6);
    expect(lerDepoisDe(11).estabelecimentos[0].mesesSemDados).toBe(11);
  });

  it('com 11 meses de atraso ainda sobra um mês real, e o alerta se segura', () => {
    const r = lerDepoisDe(11);
    expect(r.estabelecimentos[0].meses.filter((m) => m.abaixo)).toHaveLength(1);
    expect(r.temAlgumAbaixo).toBe(true);
  });

  /**
   * O DEFEITO QUE ESTE TESTE MARCAVA — e a correção que o inverteu.
   *
   * Antes: um cliente com doze meses abaixo do limite passava a "ok" no décimo
   * segundo mês sem coleta. Não porque faturou, mas porque o último mês real
   * saiu da janela. A falha não aparecia: ela sumia, e quanto mais velho o dado,
   * mais conforme o relatório ficava.
   *
   * Agora o alerta continua não existindo — nenhum mês PROVA que está abaixo,
   * porque não há mês nenhum —, mas o resultado também não é conformidade: é
   * INDETERMINADO, que é a resposta honesta para "não conferimos". Quem lê a
   * tela vê que falta coletar, em vez de ver um verde que ninguém auditou.
   */
  it('no 12º mês sem coleta o alerta some, mas NÃO vira "ok": vira indeterminado', () => {
    const r = lerDepoisDe(12);
    expect(r.estabelecimentos[0].mesesSemDados).toBe(12);
    expect(r.estabelecimentos[0].meses.every((m) => m.semDados)).toBe(true);
    expect(r.temAlgumAbaixo).toBe(false);
    expect(r.status).toBe('INDETERMINADO'); // ← antes desta correção, era "ok"
  });

  it('e a virada de ano não muda a leitura: cruzando dezembro dá o mesmo', () => {
    const coletaDez = new Date(2026, 11, 10); // 10/12/2026
    const idx = coletaCheia(coletaDez, abaixoDoLimite);
    const r = construirEstabelecimentos(
      idx,
      construirJanela(new Date(2027, 11, 10)),
      rotuloFixo
    );
    expect(r.temAlgumAbaixo).toBe(false);
    expect(r.status).toBe('INDETERMINADO');
  });

  /**
   * O contraste que fecha o bloco: envelhecer nunca produz conformidade, e
   * conformidade só sai de janela cheia.
   */
  it('só janela completa e toda acima do limite produz OK', () => {
    const idx = coletaCheia(coleta, THRESHOLD_MENSAL + 1);
    expect(construirEstabelecimentos(idx, construirJanela(coleta), rotuloFixo).status).toBe('OK');
    const relogio = new Date(coleta.getFullYear(), coleta.getMonth() + 1, 20);
    expect(construirEstabelecimentos(idx, construirJanela(relogio), rotuloFixo).status).toBe(
      'INDETERMINADO'
    );
  });
});
