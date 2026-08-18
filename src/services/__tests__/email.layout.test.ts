/**
 * Testes do padrão visual comum dos e-mails.
 *
 * Funções puras — nenhum SMTP é tocado aqui. O que estes testes protegem não é
 * a aparência (que muda), e sim as regras que a aparência carrega: escapar o
 * que vem do cadastro, distinguir zero de ausente, e nunca deixar um e-mail
 * chegar sem o mínimo (moldura, botão, rodapé).
 */

import {
  esc,
  moeda,
  formatCnpj,
  periodoBr,
  dataBr,
  rotulo,
  selo,
  barra,
  painelTotais,
  quadroLinhas,
  faixaContexto,
  secao,
  itemLista,
  blocoVazio,
  blocoRessalvas,
  tabela,
  celula,
  moldura,
} from '../email.layout';

describe('formatação', () => {
  it('esc neutraliza HTML vindo do cadastro', () => {
    // Razão social é texto livre digitado por gente — e já quebrou e-mail.
    expect(esc('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(esc('CIA & CIA')).toBe('CIA &amp; CIA');
    expect(esc('aspas "duplas"')).toBe('aspas &quot;duplas&quot;');
    expect(esc(null)).toBe('');
  });

  it('moeda distingue zero de ausente', () => {
    // "R$ 0,00" é um fato apurado; "—" é a falta dele. Colapsar os dois faria
    // cliente sem dado parecer cliente sem faturamento.
    expect(moeda(0)).toContain('0,00');
    expect(moeda(null)).toBe('—');
    expect(moeda(undefined)).toBe('—');
    expect(moeda(1234.5)).toContain('1.234,50');
  });

  it('formatCnpj mascara 14 dígitos e devolve o original quando não dá', () => {
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatCnpj('123')).toBe('123');
    expect(formatCnpj(null)).toBe('—');
  });

  it('período e data saem no padrão brasileiro', () => {
    // Quem lê confere contra o e-CAC, que mostra MM/AAAA e DD/MM/AAAA.
    expect(periodoBr('2026-07')).toBe('07/2026');
    expect(periodoBr('')).toBe('—');
    expect(dataBr('2026-09-01')).toBe('01/09/2026');
    expect(dataBr(null)).toBe('—');
  });
});

describe('peças', () => {
  it('rotulo e selo saem com o texto pedido', () => {
    expect(rotulo('Totalizadores')).toContain('Totalizadores');
    expect(selo(7, '#b91c1c')).toContain('7');
  });

  it('a barra respeita os limites e nunca some por completo', () => {
    // 0% viraria uma célula de largura zero: o trilho apareceria "quebrado" em
    // vez de vazio. O piso de 2% mantém a barra legível.
    expect(barra(0, '#f00', '#eee')).toContain('width="2%"');
    expect(barra(87.4, '#f00', '#eee')).toContain('width="87%"');
    expect(barra(150, '#f00', '#eee')).toContain('width="100%"');
  });

  it('painelTotais apaga o zero em vez de escondê-lo', () => {
    // O zero precisa ocupar o lugar — é ele que diz "conferido, nenhum" — mas
    // sem competir com o número que exige ação.
    const html = painelTotais([
      { valor: 0, titulo: 'Sujeitas', cor: '#b91c1c' },
      { valor: 12, titulo: 'Isentas', detalhe: 'ME 5', cor: '#0f172a' },
    ]);
    expect(html).toContain('Sujeitas');
    expect(html).toContain('ME 5');
    expect(html).toContain('#cbd5e1'); // cinza do zero
  });

  it('quadroLinhas mostra as linhas zeradas e o rodapé de total', () => {
    const html = quadroLinhas(
      'Movimento',
      [
        { texto: 'Entraram', valor: 0 },
        { texto: 'Saíram', valor: 3, cor: '#15803d' },
      ],
      'Somado: R$ 10,00'
    );
    expect(html).toContain('Entraram');
    expect(html).toContain('Saíram');
    expect(html).toContain('Somado: R$ 10,00');
  });

  it('faixaContexto some quando não há contexto', () => {
    expect(faixaContexto([])).toBe('');
    expect(faixaContexto([{ rot: 'Situação', val: 'Em andamento' }])).toContain('Em andamento');
  });

  it('secao carrega título, contagem e itens', () => {
    const html = secao({
      titulo: 'Passaram a Demais',
      contagem: 2,
      cor: '#b91c1c',
      fundo: '#fef2f2',
      itens: itemLista({ titulo: 'ACME LTDA', valor: 'R$ 1,00', cor: '#b91c1c' }),
    });
    expect(html).toContain('Passaram a Demais');
    expect(html).toContain('>2<');
    expect(html).toContain('ACME LTDA');
  });

  it('itemLista zebra a linha ímpar e só rende complemento quando existe', () => {
    const par = itemLista({ titulo: 'A', valor: 'R$ 1,00', cor: '#000', indice: 0 });
    const impar = itemLista({ titulo: 'B', valor: 'R$ 2,00', cor: '#000', indice: 1 });
    expect(par).not.toContain('background:#fbfcfe');
    expect(impar).toContain('background:#fbfcfe');
    expect(par).not.toContain('margin-top:3px');
    expect(
      itemLista({ titulo: 'C', valor: 'R$ 3,00', complemento: 'desde ontem', cor: '#000' })
    ).toContain('desde ontem');
  });

  it('blocoRessalvas não ocupa espaço quando não há ressalva', () => {
    expect(blocoRessalvas([])).toBe('');
    expect(blocoRessalvas(['<strong>3</strong> sem código'])).toContain('sem código');
  });

  it('blocoVazio diz o que aconteceu — silêncio seria ambíguo', () => {
    const html = blocoVazio('Nada a tratar.', 'A apuração rodou.');
    expect(html).toContain('Nada a tratar.');
    expect(html).toContain('A apuração rodou.');
  });

  it('tabela alinha à direita só as colunas numéricas', () => {
    const html = tabela(
      [{ titulo: 'Cliente' }, { titulo: 'Saldo', num: true }],
      `<tr>${celula('ACME', { principal: true })}${celula('R$ 1,00', { num: true })}</tr>`
    );
    expect(html).toContain('Cliente');
    expect(html).toContain('Saldo');
    expect(html).toContain('ACME');
    // Duas ocorrências de alinhamento à direita: cabeçalho e célula.
    expect(html.match(/text-align:right/g)?.length).toBe(2);
  });
});

describe('moldura', () => {
  const base = { titulo: 'Aviso de Teste', corpo: '<p>corpo</p>' };

  it('monta cabeçalho, corpo e identidade do sistema', () => {
    const html = moldura({ ...base, subtitulo: 'julho de 2026', cobertura: '10 clientes' });
    expect(html).toContain('Sistema DCTF');
    expect(html).toContain('Aviso de Teste');
    expect(html).toContain('julho de 2026');
    expect(html).toContain('10 clientes');
    expect(html).toContain('<p>corpo</p>');
  });

  it('o botão vira link de verdade, com alternativa em texto', () => {
    // Cliente de e-mail que não renderiza o botão precisa deixar a URL copiável
    // — foi por isso que um dos avisos exibia a URL crua numa caixa tracejada.
    const html = moldura({ ...base, cta: { url: 'http://x/y', texto: 'Abrir' } });
    expect(html).toContain('href="http://x/y"');
    expect(html).toContain('Abrir');
    expect(html).toContain('Se o botão não funcionar');
  });

  it('sem cta e sem rodapé, não sobra bloco vazio', () => {
    const html = moldura(base);
    expect(html).not.toContain('Se o botão não funcionar');
    expect(html).not.toContain('border-top:1px solid');
  });

  it('a largura maior é opção, não padrão — listas ficam em 660', () => {
    expect(moldura(base)).toContain('max-width:660px');
    expect(moldura({ ...base, largura: 900 })).toContain('max-width:900px');
  });

  it('não injeta <style>: folha de estilo é descartada por parte dos clientes', () => {
    expect(moldura({ ...base, cta: { url: 'u', texto: 't' } })).not.toContain('<style');
  });
});
