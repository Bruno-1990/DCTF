/**
 * Testes de montagem dos três avisos que não tinham cobertura nenhuma:
 * "Registros oficiais em aberto", "Clientes com movimento e sem DCTF" e o
 * aviso REOA.
 *
 * Nenhum SMTP é tocado: só as funções que produzem o HTML. O que se protege
 * aqui é o que um redesenho pode quebrar sem ninguém perceber — escape do que
 * vem do cadastro, estado vazio explícito, e a regra de não repetir na tabela
 * o valor que é igual em todas as linhas.
 */

import EmailService from '../EmailService';
import { montarHtmlAviso, TITULO_EMAIL_REOA } from '../SubstitutoService';

describe('assunto padrão dos avisos', () => {
  it('leva prefixo, contagem e data — dá para agir sem abrir', () => {
    const s = EmailService.montarAssunto('Teste', 3);
    expect(s).toMatch(/^DCTF · Teste \(3\) — \d{2}\/\d{2}\/\d{4}$/);
  });

  it('não usa emoji: parte dos clientes o mostra como quadrado vazio', () => {
    expect(EmailService.montarAssunto('Teste', 0)).toMatch(/^[\x20-\x7EÀ-ɏ·—()\/\d]+$/u);
  });
});

describe('Registros oficiais em aberto', () => {
  const dctf = (over: Record<string, any> = {}) => ({
    razao_social: 'ACME LTDA',
    cnpj: '11222333000181',
    periodo_apuracao: '2026-07',
    categoria: 'PJ em Geral',
    tipo: 'Original',
    origem: 'eSocial',
    situacao: 'Em andamento',
    debito_apurado: '1000.00',
    saldo_a_pagar: '250.00',
    ...over,
  });

  it('soma os totais e destaca o saldo devedor', () => {
    const html = EmailService.generateDCTFEmailHTML([
      dctf(),
      dctf({ razao_social: 'BETA LTDA', debito_apurado: '500.00', saldo_a_pagar: '0.00' }),
    ]);
    expect(html).toContain('Registros oficiais em aberto');
    expect(html).toContain('ACME LTDA');
    expect(html).toContain('BETA LTDA');
    expect(html).toContain('1.500,00'); // débito somado
    expect(html).toContain('250,00'); // saldo somado
  });

  it('escapa a razão social vinda do cadastro', () => {
    const html = EmailService.generateDCTFEmailHTML([dctf({ razao_social: 'ACME <b>&</b> CIA' })]);
    expect(html).toContain('ACME &lt;b&gt;&amp;&lt;/b&gt; CIA');
    expect(html).not.toContain('ACME <b>');
  });

  it('valor igual em toda linha vira contexto, não coluna', () => {
    // Uma coluna inteira repetindo "Em andamento" gasta largura e esconde o
    // que varia — a situação é o próprio recorte do relatório.
    const html = EmailService.generateDCTFEmailHTML([dctf(), dctf({ razao_social: 'BETA' })]);
    expect(html).toContain('Situação:');
    expect(html.match(/Em andamento/g)?.length).toBe(1);
  });

  it('quando a situação varia, ela volta a ser coluna', () => {
    const html = EmailService.generateDCTFEmailHTML([
      dctf(),
      dctf({ razao_social: 'BETA', situacao: 'Transmitida' }),
    ]);
    expect(html).toContain('Transmitida');
    expect(html.match(/Em andamento/g)?.length).toBe(1); // agora dentro da tabela
  });

  it('lista vazia vira mensagem explícita, não tabela sem linhas', () => {
    const html = EmailService.generateDCTFEmailHTML([]);
    expect(html).toContain('Nenhum registro em aberto');
    expect(html).not.toContain('<thead>');
  });
});

describe('Clientes com movimento e sem DCTF', () => {
  const cli = (over: Record<string, any> = {}) => ({
    razao_social: 'GAMA LTDA',
    cnpj: '11222333000181',
    regime_tributario: 'LUCRO PRESUMIDO',
    competencia_obrigacao: '07/2026',
    competencia_movimento: '07/2026',
    tipos_movimento: ['CTB', 'FISE'],
    total_movimentacoes: 12,
    prazoVencimento: '2026-08-21',
    diasAteVencimento: 4,
    ...over,
  });

  it('traduz os códigos de tipo de movimento', () => {
    // "CTB" e "FISE" são código de sistema; quem lê o e-mail é gente.
    const html = EmailService.generateSemDCTFComMovimentoEmailHTML([cli()]);
    expect(html).toContain('Contábil');
    expect(html).toContain('Fiscal entrada');
    expect(html).not.toContain('>CTB<');
  });

  it('mostra o prazo e marca o vencido', () => {
    const emDia = EmailService.generateSemDCTFComMovimentoEmailHTML([cli()]);
    expect(emDia).toContain('vence em 4 dias');
    const vencido = EmailService.generateSemDCTFComMovimentoEmailHTML([
      cli({ diasAteVencimento: -2 }),
    ]);
    expect(vencido).toContain('vencido há 2 dias');
  });

  it('escapa a razão social vinda do cadastro', () => {
    const html = EmailService.generateSemDCTFComMovimentoEmailHTML([
      cli({ razao_social: 'GAMA <img src=x> LTDA' }),
    ]);
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).not.toContain('<img src=x>');
  });

  it('lista vazia vira mensagem explícita', () => {
    const html = EmailService.generateSemDCTFComMovimentoEmailHTML([]);
    expect(html).toContain('Nenhum cliente nesta situação');
  });
});

describe('Aviso REOA', () => {
  const conf = (over: Record<string, any> = {}) => ({
    threshold: 300000,
    janela: [
      { ano: 2025, mes: 8 },
      { ano: 2026, mes: 7 },
    ],
    ...over,
  });

  const cliente = (over: Record<string, any> = {}) => ({
    razao_social: 'DELTA COMERCIO LTDA',
    cnpj: '11222333000181',
    codigo_sci: 42,
    estabelecimentos: [
      {
        rotulo: 'Matriz',
        meses: [
          { ano: 2026, mes: 5, faturamento: 280000, abaixo: true },
          { ano: 2026, mes: 6, faturamento: 350000, abaixo: false },
          { ano: 2026, mes: 7, faturamento: 190000, abaixo: true },
        ],
      },
    ],
    ...over,
  });

  it('lista só os meses abaixo do limite, com o faturamento de cada um', () => {
    const html = montarHtmlAviso(conf(), [cliente()]);
    expect(html).toContain('DELTA COMERCIO LTDA');
    expect(html).toContain('mai/2026');
    expect(html).toContain('jul/2026');
    expect(html).not.toContain('jun/2026'); // acima do limite: não é caso
    expect(html).toContain('280.000,00');
    expect(html).toContain('190.000,00');
  });

  it('escapa a razão social — era o furo deste e-mail', () => {
    // Antes da padronização a razão social entrava crua no HTML: um "&" no
    // cadastro bastava para quebrar o corpo da mensagem.
    const html = montarHtmlAviso(conf(), [cliente({ razao_social: 'DELTA <b>&</b> CIA' })]);
    expect(html).toContain('DELTA &lt;b&gt;&amp;&lt;/b&gt; CIA');
    expect(html).not.toContain('DELTA <b>');
  });

  it('conta clientes e meses fora do limite no painel', () => {
    const html = montarHtmlAviso(conf(), [cliente(), cliente({ razao_social: 'EPSILON LTDA' })]);
    expect(html).toContain('Clientes fora do limite');
    expect(html).toContain('Meses abaixo');
    expect(html).toContain('>4<'); // 2 clientes × 2 meses
  });

  it('identifica o cliente por CNPJ e SCI', () => {
    const html = montarHtmlAviso(conf(), [cliente()]);
    expect(html).toContain('11.222.333/0001-81');
    expect(html).toContain('SCI 42');
  });

  it('sem ninguém fora do limite, diz isso em vez de vir vazio', () => {
    const html = montarHtmlAviso(conf(), []);
    expect(html).toContain('Nenhum cliente abaixo do limite.');
  });

  it('usa o mesmo esqueleto dos outros avisos', () => {
    const html = montarHtmlAviso(conf(), [cliente()]);
    expect(html).toContain('Sistema DCTF');
    expect(html).toContain(TITULO_EMAIL_REOA);
    expect(html).toContain('Se o botão não funcionar');
    // A paleta carmim própria deste e-mail saiu junto com a moldura antiga.
    expect(html).not.toContain('#be123c');
  });
});
