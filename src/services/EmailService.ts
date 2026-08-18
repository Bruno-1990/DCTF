import nodemailer from 'nodemailer';
import {
  C,
  esc,
  formatCnpj,
  periodoBr,
  moldura,
  painelTotais,
  faixaContexto,
  tabela,
  celula,
  blocoVazio,
  tag,
  type ColunaTabela,
} from './email.layout';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * Endereço público do sistema, usado nos links dos emails.
 *
 * `FRONTEND_URL` é uma LISTA de origens permitidas pelo CORS (separadas por
 * vírgula) e costuma começar por localhost — que não serve para quem abre o
 * email em outra máquina. Por isso a preferência é uma variável própria; sem
 * ela, pega a primeira origem que não seja localhost.
 */
function baseUrlPublica(): string {
  const explicita = (process.env['APP_PUBLIC_URL'] ?? '').trim();
  if (explicita) return explicita.replace(/\/+$/, '');

  const origens = (process.env['FRONTEND_URL'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const externa = origens.find((o) => !/localhost|127\.0\.0\.1/i.test(o));
  return (externa ?? origens[0] ?? 'http://192.168.0.47:5173').replace(/\/+$/, '');
}


export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Configuração do Gmail SMTP com porta 587 (menos bloqueada)
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // true para 465, false para outras portas
      auth: {
        user: process.env.EMAIL_USER || 'seu-email@gmail.com',
        pass: process.env.EMAIL_PASSWORD || 'sua-senha-app',
      },
      tls: {
        rejectUnauthorized: false, // Ignora erros de certificado (útil em redes corporativas)
      },
    });
  }

  /**
   * Envia email com DCTFs em andamento
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      console.log(`[Email] Enviando email para: ${options.to}`);
      
      const info = await this.transporter.sendMail({
        from: `"Sistema DCTF" <${process.env.EMAIL_USER}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });

      console.log(`[Email] ✅ Email enviado com sucesso: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('[Email] ❌ Erro ao enviar email:', error);
      throw error;
    }
  }

  /**
   * Formata CNPJ para exibição: XX.XXX.XXX/XXXX-XX
   */
  /**
   * Monta o assunto no padrão único dos avisos.
   *
   * Centralizado pelo mesmo motivo do corpo: os dois assuntos tinham ficado
   * diferentes — um com emoji, outro sem, e nomenclaturas distintas —, o que
   * atrapalha ordenar, filtrar e reconhecer os avisos na caixa de entrada.
   *
   * Sem emoji: alguns clientes de email o renderizam como quadrado vazio, e a
   * contagem entre parênteses informa muito mais. Com ela dá para agir sem
   * abrir a mensagem — inclusive ver que está zerado.
   */
  montarAssunto(titulo: string, total: number): string {
    const data = new Date().toLocaleDateString('pt-BR');
    return `DCTF · ${titulo} (${total}) — ${data}`;
  }

  /**
   * Escape e formatação vêm do padrão comum (`email.layout`). Ficam como
   * método por compatibilidade com os dois relatórios que já os usavam assim.
   */
  private esc = esc;
  private formatPeriodo = periodoBr;
  private formatCnpjForEmail = formatCnpj;

  /**
   * Esqueleto dos relatórios em tabela.
   *
   * A aparência é a mesma de todos os avisos do sistema — vem de
   * `email.layout`. O que sobra aqui é a composição própria deste formato:
   * faixa de contexto, painel de resumo e uma tabela (ou o estado vazio).
   *
   * Largura maior que o padrão: são sete colunas, e a 660px elas se espremem.
   */
  private renderEmail(o: {
    titulo: string;
    subtitulo: string;
    /** Valores iguais em todas as linhas: entram aqui, não na tabela. */
    contexto?: Array<{ rot: string; val: string }>;
    resumo: Array<{ label: string; valor: string; alerta?: boolean }>;
    colunas: ColunaTabela[];
    linhas: string;
    vazio: { titulo: string; texto: string };
    temLinhas: boolean;
  }): string {
    const url = `${baseUrlPublica()}/conferencias`;
    const geradoEm = new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return moldura({
      titulo: o.titulo,
      subtitulo: o.subtitulo,
      largura: 900,
      faixas:
        faixaContexto(o.contexto ?? []) +
        painelTotais(
          o.resumo.map((r) => ({
            valor: r.valor,
            titulo: r.label,
            cor: r.alerta ? C.ALERTA : C.TINTA,
          })),
          'Resumo'
        ),
      corpo: o.temLinhas
        ? tabela(o.colunas, o.linhas)
        : blocoVazio(o.vazio.titulo, o.vazio.texto),
      cta: { url, texto: 'Abrir conferências no sistema' },
      rodape: {
        titulo: 'Sistema de Gestão DCTF',
        texto: `Relatório gerado em ${geradoEm}. Enviado automaticamente; não responda.`,
      },
    });
  }

  /**
   * Relatório de declarações "Em andamento" (registros oficiais em aberto).
   */
  generateDCTFEmailHTML(dctfs: any[]): string {
    const totalDebito = dctfs.reduce((s, d) => s + (parseFloat(d.debito_apurado) || 0), 0);
    const totalSaldo = dctfs.reduce((s, d) => s + (parseFloat(d.saldo_a_pagar) || 0), 0);
    const brl = (v: number) =>
      `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Coluna que vale o MESMO em toda linha vira contexto, não coluna.
    // Medido nos dados reais: "Situação" é sempre "Em andamento" (é o próprio
    // recorte do relatório) e a data de transmissão é sempre vazia — por
    // definição, o que está em andamento ainda não foi transmitido. Repetir
    // isso 25 vezes gasta largura e esconde o que de fato varia.
    const unico = (campo: string): string | null => {
      const vs = Array.from(
        new Set(dctfs.map((d) => (d[campo] ?? '').toString().trim()).filter(Boolean)),
      );
      return vs.length === 1 ? (vs[0] as string) : null;
    };
    const situacaoUnica = unico('situacao');
    const categoriaUnica = unico('categoria');

    const contexto: Array<{ rot: string; val: string }> = [];
    if (situacaoUnica) contexto.push({ rot: 'Situação', val: situacaoUnica });
    if (categoriaUnica) contexto.push({ rot: 'Categoria', val: categoriaUnica });

    const colunas: ColunaTabela[] = [
      { titulo: 'Cliente' },
      { titulo: 'Período' },
      ...(categoriaUnica ? [] : [{ titulo: 'Categoria' }]),
      { titulo: 'Tipo' },
      { titulo: 'Origem' },
      ...(situacaoUnica ? [] : [{ titulo: 'Situação' }]),
      { titulo: 'Débito apurado', num: true },
      { titulo: 'Saldo a pagar', num: true },
    ];

    const linhas = dctfs
      .map((d, i) => {
        const debito = parseFloat(d.debito_apurado) || 0;
        const saldo = parseFloat(d.saldo_a_pagar) || 0;
        const razao = (d.razao_social || '').toString().trim();
        const cnpj = this.formatCnpjForEmail(d.cnpj);
        // Razão social em cima, CNPJ embaixo: identifica sem gastar coluna.
        const nomeCliente = razao
          ? `${this.esc(razao)}<div style="font-size:11.5px;color:${C.APAGADO};margin-top:1px;">${cnpj}</div>`
          : cnpj;
        return `
            <tr>
              ${celula(nomeCliente, { principal: true, indice: i })}
              ${celula(this.formatPeriodo(d.periodo_apuracao), { indice: i })}
              ${categoriaUnica ? '' : celula(this.esc(d.categoria) || '—', { indice: i })}
              ${celula(this.esc(d.tipo) || '—', { indice: i })}
              ${celula(this.esc(d.origem) || '—', { indice: i, cor: C.APAGADO })}
              ${situacaoUnica ? '' : celula(this.esc(d.situacao) || '—', { indice: i })}
              ${celula(brl(debito), { num: true, indice: i })}
              ${celula(brl(saldo), {
                num: true,
                indice: i,
                // Só o saldo devedor recebe cor: é o número que exige ação.
                cor: saldo === 0 ? C.FRACO : C.ALERTA,
              })}
            </tr>`;
      })
      .join('');

    return this.renderEmail({
      titulo: 'Registros oficiais em aberto',
      subtitulo: 'Declarações pendentes de transmissão — clientes ativos',
      contexto,
      resumo: [
        { label: 'Declarações', valor: String(dctfs.length) },
        { label: 'Débito apurado', valor: brl(totalDebito) },
        { label: 'Saldo a pagar', valor: brl(totalSaldo), alerta: totalSaldo > 0 },
      ],
      colunas,
      linhas,
      temLinhas: dctfs.length > 0,
      vazio: {
        titulo: 'Nenhum registro em aberto',
        texto: 'Não há declarações pendentes de transmissão no momento.',
      },
    });
  }

  /**
   * Clientes com movimentação no período e sem DCTF enviada.
   */
  generateSemDCTFComMovimentoEmailHTML(clientes: any[]): string {
    const totalMov = clientes.reduce((s, c) => s + (Number(c.total_movimentacoes) || 0), 0);

    const formatDate = (v: any): string => {
      if (!v) return '—';
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('pt-BR');
    };
    const rotuloTipo = (t: string): string => {
      const map: Record<string, string> = {
        CTB: 'Contábil',
        FISE: 'Fiscal entrada',
        FPG: 'Trabalhista',
        FISS: 'Fiscal saída',
      };
      return map[String(t).toUpperCase()] || t;
    };

    // Mesma regra do outro email. Medido: competência, vencimento e "possível
    // obrigação" não variam entre as linhas — esta última é o próprio critério
    // do relatório, então uma coluna inteira dizendo "Sim" não informa nada.
    const unico = (campo: string): string | null => {
      const vs = Array.from(
        new Set(clientes.map((c) => (c[campo] ?? '').toString().trim()).filter(Boolean)),
      );
      return vs.length === 1 ? (vs[0] as string) : null;
    };
    const compObrig = unico('competencia_obrigacao');
    const compMov = unico('competencia_movimento');
    const vencUnico = unico('prazoVencimento');
    const diasSet = Array.from(new Set(clientes.map((c) => Number(c.diasAteVencimento ?? 0))));
    const diasUnico = diasSet.length === 1 ? (diasSet[0] as number) : null;

    const textoDias = (n: number) => {
      const d = Math.abs(n);
      const plural = d === 1 ? 'dia' : 'dias';
      if (n < 0) return `vencido há ${d} ${plural}`;
      if (n === 0) return 'vence hoje';
      return `vence em ${d} ${plural}`;
    };

    const contexto: Array<{ rot: string; val: string }> = [];
    if (compObrig) contexto.push({ rot: 'Competência da obrigação', val: compObrig });
    if (compMov) contexto.push({ rot: 'Movimento em', val: compMov });
    // Só a data aqui: o "faltam N dias" já aparece em destaque no resumo, e
    // repetir a mesma informação em dois lugares dilui os dois.
    if (vencUnico) contexto.push({ rot: 'Vencimento', val: formatDate(vencUnico) });

    const colunas: ColunaTabela[] = [
      { titulo: 'Cliente' },
      { titulo: 'Regime' },
      ...(compObrig ? [] : [{ titulo: 'Competência' }]),
      ...(compMov ? [] : [{ titulo: 'Movimento em' }]),
      { titulo: 'Tipos de movimento' },
      { titulo: 'Movimentações', num: true },
      ...(vencUnico ? [] : [{ titulo: 'Vencimento' }]),
    ];

    const linhas = clientes
      .map((c, i) => {
        const tipos =
          (c.tipos_movimento || []).map((t: string) => tag(this.esc(rotuloTipo(t)))).join('') || '—';
        const nomeCliente = `${this.esc(c.razao_social) || '—'}<div style="font-size:11.5px;color:${C.APAGADO};margin-top:1px;">${this.formatCnpjForEmail(c.cnpj)}</div>`;
        return `
            <tr>
              ${celula(nomeCliente, { principal: true, indice: i })}
              ${celula(c.regime_tributario ? this.esc(String(c.regime_tributario)) : '—', { indice: i })}
              ${compObrig ? '' : celula(this.esc(c.competencia_obrigacao) || '—', { indice: i })}
              ${compMov ? '' : celula(this.esc(c.competencia_movimento) || '—', { indice: i })}
              ${celula(tipos, { indice: i })}
              ${celula(Number(c.total_movimentacoes ?? 0).toLocaleString('pt-BR'), {
                num: true,
                indice: i,
              })}
              ${vencUnico ? '' : celula(formatDate(c.prazoVencimento), { indice: i })}
            </tr>`;
      })
      .join('');

    const vencido = diasUnico !== null && diasUnico < 0;

    return this.renderEmail({
      titulo: 'Clientes com movimento e sem DCTF',
      subtitulo: 'Possível obrigação de envio não cumprida',
      contexto,
      resumo: [
        { label: 'Clientes', valor: String(clientes.length), alerta: clientes.length > 0 },
        { label: 'Movimentações', valor: totalMov.toLocaleString('pt-BR') },
        ...(diasUnico !== null
          ? [{ label: 'Prazo', valor: textoDias(diasUnico), alerta: vencido }]
          : []),
      ],
      colunas,
      linhas,
      temLinhas: clientes.length > 0,
      vazio: {
        titulo: 'Nenhum cliente nesta situação',
        texto: 'Todos os clientes com movimento no período têm DCTF enviada.',
      },
    });
  }
}

export default new EmailService();
