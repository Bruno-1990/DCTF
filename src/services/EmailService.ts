import nodemailer from 'nodemailer';

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

/**
 * Padrão visual único dos emails.
 *
 * Sóbrio de propósito: sem gradiente, sem sombra em texto, sem ícone
 * decorativo. Quem recebe está conferindo obrigação fiscal — o que precisa
 * saltar é o dado, não a moldura. A cor é usada só para hierarquia (cabeçalho,
 * rótulos) e alerta (saldo devedor).
 */
const EMAIL_BASE_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', system-ui, 'Helvetica Neue', Arial, sans-serif;
    background: #f1f5f9;
    padding: 24px 12px;
    line-height: 1.55;
    font-size: 14px;
    color: #334155;
    -webkit-font-smoothing: antialiased;
  }
  .container {
    max-width: 900px;
    width: 100%;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid #e2e8f0;
  }

  /* Cabeçalho: cor sólida. Gradiente e sombra em texto envelhecem rápido e
     competem com o conteúdo. */
  .header {
    background: #1e3a8a;
    color: #ffffff;
    padding: 26px 24px;
    text-align: center;
  }
  .header h1 {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .header p {
    font-size: 15px;
    margin-top: 5px;
    color: #bfdbfe;
  }

  /* Faixa de contexto: o que vale para TODAS as linhas fica aqui, uma vez.
     Repetir o mesmo valor em cada linha rouba largura e esconde o que varia. */
  .contexto {
    padding: 14px 24px;
    background: #ffffff;
    border-bottom: 1px solid #e2e8f0;
    font-size: 13.5px;
    color: #475569;
    text-align: center;
  }
  /* Fundo âmbar: é a condição que vale para a lista inteira. Destacar aqui
     permitiu tirar a coluna que repetia esse mesmo valor em toda linha. */
  .contexto .item {
    display: inline-block;
    margin: 3px 6px;
    padding: 5px 12px;
    background: #fef3c7;
    border: 1px solid #fde68a;
    border-radius: 5px;
  }
  .contexto .rot { color: #92400e; }
  .contexto .val { color: #78350f; font-weight: 700; }

  .summary-wrap { padding: 20px 24px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
  .summary-table { width: 100%; border-collapse: collapse; }
  .summary-table td {
    text-align: center;
    padding: 0 14px;
    vertical-align: top;
  }
  .summary-table .label {
    font-size: 12px;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
    display: block;
    margin-bottom: 3px;
  }
  .summary-table .value { font-size: 22px; font-weight: 700; color: #0f172a; }
  .summary-table .value.alerta { color: #b91c1c; }

  .valor-monetario { font-variant-numeric: tabular-nums; }
  .table-wrap { padding: 20px 24px 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  thead th {
    padding: 10px 11px;
    text-align: left;
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #475569;
    background: #f8fafc;
    border-bottom: 1px solid #cbd5e1;
  }
  th.num { text-align: right; }
  tbody tr { background: #ffffff; }
  tbody tr:nth-child(even) { background: #fbfcfe; }
  td {
    padding: 11px 11px;
    color: #334155;
    vertical-align: middle;
    border-bottom: 1px solid #eef2f6;
    text-align: left;
  }
  /* Valor monetário nunca quebra em duas linhas: "R$" órfão no fim de uma
     linha e o número na seguinte é ilegível numa conferência. */
  td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.compacto { white-space: nowrap; }
  td.forte { font-weight: 600; color: #0f172a; }
  td.mono { font-family: Consolas, 'Courier New', monospace; font-size: 12px; }
  .razao { display: block; font-size: 12.5px; color: #64748b; margin-top: 1px; }
  /* Origem é detalhe técnico (eSocial, REINF...): fica legível, mas não
     compete com o valor devido pela atenção de quem lê. */
  td.secundario { font-size: 12.5px; color: #64748b; }
  /* Só o saldo devedor recebe cor: é o número que exige ação. */
  td.devedor { color: #b91c1c; font-weight: 600; }
  td.quitado { color: #94a3b8; }
  .tag {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 10px;
    font-size: 12px;
    background: #eef2f6;
    color: #475569;
    margin-right: 3px;
  }

  /* Chamada para o painel — discreta, no fim, depois do dado.
     O estilo de botão fica numa CLASSE, nunca num seletor por tag: o Gmail
     converte URL escrita em texto num link automático, e uma regra aplicada a
     todo "a" dentro do bloco pintaria esse link como um segundo botão. */
  .cta { padding: 4px 24px 24px; text-align: center; }
  .cta .botao {
    display: inline-block;
    padding: 12px 26px;
    background: #1e3a8a;
    color: #ffffff !important;
    text-decoration: none;
    border-radius: 6px;
    font-size: 15px;
    font-weight: 600;
  }
  .cta .obs { display: block; margin-top: 11px; font-size: 12.5px; color: #94a3b8; }
  .cta .obs a { color: #64748b; text-decoration: underline; font-weight: 400; }

  .footer {
    background: #f8fafc;
    padding: 16px 24px;
    text-align: center;
    border-top: 1px solid #e2e8f0;
  }
  .footer p { color: #64748b; font-size: 12.5px; }
  .no-data { padding: 44px 24px; color: #64748b; text-align: center; font-size: 14px; }
  .no-data h3 { margin-bottom: 7px; font-size: 17px; font-weight: 600; color: #1e3a8a; }
`;

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
   * Escapa texto vindo do banco antes de entrar no HTML.
   *
   * Razão social é dado de terceiro: um "&" ou "<" no nome já bastaria para
   * quebrar a tabela do email, e o antigo template escapava só em um dos dois
   * relatórios.
   */
  private esc(v: unknown): string {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Período no padrão brasileiro. O banco guarda `YYYY-MM` (normalizado para
   * ordenar), mas quem lê o email confere contra o eCAC, que mostra `MM/AAAA`.
   */
  private formatPeriodo(v: unknown): string {
    const s = String(v ?? '').trim();
    if (!s) return '—';
    const m = s.match(/^(\d{4})-(\d{2})$/);
    return m ? `${m[2]}/${m[1]}` : s;
  }

  private formatCnpjForEmail(v: string | null | undefined): string {
    if (!v) return '—';
    const n = String(v).replace(/\D/g, '');
    if (n.length !== 14) return v;
    return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
  }

  /**
   * Esqueleto ÚNICO dos emails. Os dois relatórios passam por aqui, então não
   * há como um evoluir e o outro ficar para trás — que era o risco de manter
   * dois HTML paralelos.
   */
  private renderEmail(o: {
    titulo: string;
    subtitulo: string;
    /** Valores iguais em todas as linhas: entram aqui, não na tabela. */
    contexto?: Array<{ rot: string; val: string }>;
    resumo: Array<{ label: string; valor: string; alerta?: boolean }>;
    cabecalhos: string;
    linhas: string;
    vazio: { titulo: string; texto: string };
    temLinhas: boolean;
    estilosExtra?: string;
  }): string {
    const url = `${baseUrlPublica()}/conferencias`;
    const geradoEm = new Date().toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const contextoHtml = o.contexto?.length
      ? `<div class="contexto">${o.contexto
          .map((c) => `<span class="item"><span class="rot">${c.rot}:</span> <span class="val">${c.val}</span></span>`)
          .join('')}</div>`
      : '';

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${o.titulo}</title>
  <style>${EMAIL_BASE_STYLES}${o.estilosExtra ?? ''}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${o.titulo}</h1>
      <p>${o.subtitulo}</p>
    </div>
    ${contextoHtml}
    <div class="summary-wrap">
      <table class="summary-table" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          ${o.resumo
            .map(
              (r) =>
                `<td><span class="label">${r.label}</span><span class="value${r.alerta ? ' alerta' : ''}">${r.valor}</span></td>`,
            )
            .join('')}
        </tr>
      </table>
    </div>
    ${
      o.temLinhas
        ? `<div class="table-wrap">
      <table cellpadding="0" cellspacing="0">
        <thead><tr>${o.cabecalhos}</tr></thead>
        <tbody>${o.linhas}</tbody>
      </table>
    </div>`
        : `<div class="no-data"><h3>${o.vazio.titulo}</h3><p>${o.vazio.texto}</p></div>`
    }
    <div class="cta">
      <a class="botao" href="${url}">Abrir conferências no sistema &rarr;</a>
      <span class="obs">Se o botão não funcionar, acesse: <a href="${url}">${url}</a></span>
    </div>
    <div class="footer">
      <p>Sistema de Gestão DCTF &middot; gerado em ${geradoEm}</p>
    </div>
  </div>
</body>
</html>`.trim();
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

    const cabecalhos =
      '<th>Cliente</th><th>Período</th>' +
      (categoriaUnica ? '' : '<th>Categoria</th>') +
      '<th>Tipo</th><th>Origem</th>' +
      (situacaoUnica ? '' : '<th>Situação</th>') +
      '<th class="num">Débito apurado</th><th class="num">Saldo a pagar</th>';

    const linhas = dctfs
      .map((d) => {
        const debito = parseFloat(d.debito_apurado) || 0;
        const saldo = parseFloat(d.saldo_a_pagar) || 0;
        const razao = (d.razao_social || '').toString().trim();
        const colCategoria = categoriaUnica ? '' : `<td>${this.esc(d.categoria) || '—'}</td>`;
        const colSituacao = situacaoUnica ? '' : `<td>${this.esc(d.situacao) || '—'}</td>`;
        const nomeCliente = razao
          ? `${this.esc(razao)}<span class="razao">${this.formatCnpjForEmail(d.cnpj)}</span>`
          : `${this.formatCnpjForEmail(d.cnpj)}`;
        return `
            <tr>
              <td class="forte">${nomeCliente}</td>
              <td class="compacto">${this.formatPeriodo(d.periodo_apuracao)}</td>
              ${colCategoria}
              <td class="compacto">${this.esc(d.tipo) || '—'}</td>
              <td class="secundario">${this.esc(d.origem) || '—'}</td>
              ${colSituacao}
              <td class="num valor-monetario">${brl(debito)}</td>
              <td class="num valor-monetario ${saldo === 0 ? 'quitado' : 'devedor'}">${brl(saldo)}</td>
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
      cabecalhos,
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

    const cabecalhos =
      '<th>Cliente</th><th>Regime</th>' +
      (compObrig ? '' : '<th>Competência</th>') +
      (compMov ? '' : '<th>Movimento em</th>') +
      '<th>Tipos de movimento</th><th class="num">Movimentações</th>' +
      (vencUnico ? '' : '<th>Vencimento</th>');

    const linhas = clientes
      .map((c) => {
        const tipos =
          (c.tipos_movimento || [])
            .map((t: string) => `<span class="tag">${this.esc(rotuloTipo(t))}</span>`)
            .join('') || '—';
        const colComp = compObrig ? '' : `<td>${this.esc(c.competencia_obrigacao) || '—'}</td>`;
        const colMov = compMov ? '' : `<td>${this.esc(c.competencia_movimento) || '—'}</td>`;
        const colVenc = vencUnico ? '' : `<td>${formatDate(c.prazoVencimento)}</td>`;
        return `
            <tr>
              <td class="forte">${this.esc(c.razao_social) || '—'}<span class="razao">${this.formatCnpjForEmail(c.cnpj)}</span></td>
              <td>${c.regime_tributario ? this.esc(String(c.regime_tributario)) : '—'}</td>
              ${colComp}
              ${colMov}
              <td>${tipos}</td>
              <td class="num">${Number(c.total_movimentacoes ?? 0).toLocaleString('pt-BR')}</td>
              ${colVenc}
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
      cabecalhos,
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
