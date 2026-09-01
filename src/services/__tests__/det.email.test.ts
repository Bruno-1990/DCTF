/**
 * Montagem do e-mail de notificações do DET.
 *
 * Nenhum SMTP é tocado: só a função que produz o HTML. O que se protege aqui é
 * o que um redesenho quebraria em silêncio — a ordem por urgência (que decide o
 * que é visto numa lista de 70 linhas), o escape do que vem do cadastro, o
 * estado vazio explícito e o aviso de ciência, que é o risco legal da tela.
 */

import {
  montarHtmlNotificacoesDet,
  ordenarEmpresas,
  TITULO_EMAIL_DET,
  type EmpresaComNotificacoes,
  type NotificacaoDet,
} from '../det.email';

const notif = (over: Partial<NotificacaoDet> = {}): NotificacaoDet => ({
  assunto: 'Notificação de débito do FGTS Digital',
  remetente: 'FGTS Digital',
  data_texto: '27 jun 26',
  data_envio: '2026-06-27',
  nao_lida: 0,
  ...over,
});

const empresa = (over: Partial<EmpresaComNotificacoes> = {}): EmpresaComNotificacoes => ({
  cnpj: '11222333000181',
  razao_social: 'ACME LTDA',
  notificacoes: [notif()],
  ...over,
});

const DATA_FIXA = new Date('2026-08-31T14:20:00');

describe('ordem da lista', () => {
  it('quem não teve ciência vem antes de quem já teve', () => {
    const ordenadas = ordenarEmpresas([
      empresa({ razao_social: 'AAA JA LIDA', notificacoes: [notif(), notif(), notif()] }),
      empresa({ razao_social: 'ZZZ SEM CIENCIA', notificacoes: [notif({ nao_lida: 1 })] }),
    ]);
    // Alfabeticamente AAA viria primeiro, e tem mais notificações; ainda assim
    // quem tem prazo correndo sem ciência é que precisa ser visto primeiro.
    expect(ordenadas[0]!.razao_social).toBe('ZZZ SEM CIENCIA');
  });

  it('empatado em ciência, quem tem mais notificações vem antes', () => {
    const ordenadas = ordenarEmpresas([
      empresa({ razao_social: 'AAA UMA', notificacoes: [notif()] }),
      empresa({ razao_social: 'BBB TRES', notificacoes: [notif(), notif(), notif()] }),
    ]);
    expect(ordenadas[0]!.razao_social).toBe('BBB TRES');
  });

  it('não muda o array recebido', () => {
    const lista = [
      empresa({ razao_social: 'AAA' }),
      empresa({ razao_social: 'ZZZ', notificacoes: [notif({ nao_lida: 1 })] }),
    ];
    ordenarEmpresas(lista);
    expect(lista[0]!.razao_social).toBe('AAA');
  });
});

describe('corpo do e-mail', () => {
  it('soma empresas, notificações e o que está sem ciência', () => {
    const html = montarHtmlNotificacoesDet(
      [
        empresa({ notificacoes: [notif({ nao_lida: 1 }), notif()] }),
        empresa({ razao_social: 'BETA LTDA', cnpj: '99888777000166' }),
      ],
      DATA_FIXA
    );
    expect(html).toContain(TITULO_EMAIL_DET);
    expect(html).toContain('ACME LTDA');
    expect(html).toContain('BETA LTDA');
    expect(html).toContain('2 empresa(s) com notificação · 3 notificação(ões) no total');
  });

  it('formata o CNPJ como quem vai conferir no portal o lê', () => {
    const html = montarHtmlNotificacoesDet([empresa()], DATA_FIXA);
    expect(html).toContain('11.222.333/0001-81');
  });

  it('escapa razão social e assunto — os dois vêm de fora', () => {
    const html = montarHtmlNotificacoesDet(
      [
        empresa({
          razao_social: 'ACME <b>&</b> CIA',
          notificacoes: [notif({ assunto: 'Débito <script>alert(1)</script>' })],
        }),
      ],
      DATA_FIXA
    );
    expect(html).toContain('ACME &lt;b&gt;&amp;&lt;/b&gt; CIA');
    expect(html).not.toContain('<script>');
  });

  it('mostra a data como o DET a exibe, quando ela veio', () => {
    const html = montarHtmlNotificacoesDet([empresa()], DATA_FIXA);
    expect(html).toContain('27 jun 26');
  });

  it('sem data_texto, cai na data normalizada em formato BR', () => {
    const html = montarHtmlNotificacoesDet(
      [empresa({ notificacoes: [notif({ data_texto: null })] })],
      DATA_FIXA
    );
    expect(html).toContain('27/06/2026');
  });

  it('avisa que abrir no portal gera ciência — é o risco legal da tela', () => {
    const html = montarHtmlNotificacoesDet([empresa()], DATA_FIXA);
    expect(html).toContain('gera ciência');
  });

  it('lista vazia não vira silêncio: diz que não há nada a tratar', () => {
    const html = montarHtmlNotificacoesDet([], DATA_FIXA);
    expect(html).toContain('Nenhuma notificação em aberto');
    // O aviso de ciência não faz sentido quando não há o que abrir.
    expect(html).not.toContain('gera ciência');
  });

  it('leva o botão para a tela do DET, onde está o desdobramento', () => {
    const html = montarHtmlNotificacoesDet([empresa()], DATA_FIXA);
    expect(html).toContain('/trabalhista');
  });
});

describe('teto de tamanho', () => {
  /** Mais empresas do que cabe numa mensagem que o provedor não trunque. */
  const muitas = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      empresa({
        cnpj: String(10000000000000 + i),
        razao_social: `EMPRESA NUMERO ${i} COM RAZAO SOCIAL LONGA LTDA`,
      })
    );

  it('mantém a lista inteira enquanto ela cabe', () => {
    const html = montarHtmlNotificacoesDet(muitas(20), DATA_FIXA);
    expect(html).toContain('EMPRESA NUMERO 19');
    expect(html).not.toContain('não couberam nesta mensagem');
  });

  it('corta e AVISA quando não cabe, em vez de deixar o provedor truncar', () => {
    const html = montarHtmlNotificacoesDet(muitas(300), DATA_FIXA);
    expect(html).toContain('não couberam nesta mensagem');
    // Abaixo do corte do Gmail (~102 KB), com folga para o encoding.
    expect(html.length).toBeLessThan(100_000);
  });

  it('o corte é pelo fim da ordem — quem está sem ciência não se perde', () => {
    const lista = [
      ...muitas(300),
      empresa({ razao_social: 'URGENTE SEM CIENCIA', notificacoes: [notif({ nao_lida: 1 })] }),
    ];
    const html = montarHtmlNotificacoesDet(lista, DATA_FIXA);
    expect(html).toContain('URGENTE SEM CIENCIA');
  });

  it('o total no topo conta TODAS, inclusive as que não couberam', () => {
    const html = montarHtmlNotificacoesDet(muitas(300), DATA_FIXA);
    expect(html).toContain('300 empresa(s) com notificação');
  });
});
