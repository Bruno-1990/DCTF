import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * Padrão visual dos emails: tons azuis e branco, fonte legível, cabeçalhos em negrito,
 * texto centralizado onde cabível, valores monetários em itálico.
 */
const EMAIL_BASE_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', system-ui, 'Helvetica Neue', Arial, sans-serif;
    background: #e0e7ff;
    padding: 24px 12px;
    line-height: 1.6;
    color: #334155;
    -webkit-font-smoothing: antialiased;
  }
  .container {
    max-width: 96%;
    width: 100%;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(30, 64, 175, 0.08);
    overflow: hidden;
    border: 1px solid #e2e8f0;
  }
  .header {
    background: linear-gradient(135deg, #1e40af 0%, #2563eb 100%);
    color: #ffffff;
    padding: 28px 20px;
    text-align: center;
    border-bottom: 3px solid #1e3a8a;
  }
  .header h1 {
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 8px;
    letter-spacing: -0.02em;
    text-shadow: 0 1px 2px rgba(0,0,0,0.1);
  }
  .header p {
    font-size: 14px;
    opacity: 0.95;
    font-weight: 500;
  }
  .summary-wrap {
    padding: 20px 16px;
    background: #eff6ff;
    border-bottom: 1px solid #dbeafe;
    text-align: center;
  }
  .summary-table {
    width: 100%;
    max-width: 100%;
    border-collapse: collapse;
    margin: 0 auto;
  }
  .summary-table td {
    width: 33.33%;
    text-align: center;
    padding: 18px 12px;
    background: #ffffff;
    border: 1px solid #dbeafe;
    vertical-align: middle;
  }
  .summary-table .label {
    font-size: 11px;
    color: #1e40af;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 6px;
    font-weight: 700;
    display: block;
  }
  .summary-table .value {
    font-size: 20px;
    font-weight: 700;
    color: #1e3a8a;
  }
  .valor-monetario { font-style: italic; color: #1e3a8a; font-weight: 600; }
  .table-wrap { padding: 20px 16px 24px; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    overflow: hidden;
  }
  thead { background: #1e40af; color: #ffffff; }
  th {
    padding: 14px 12px;
    text-align: center;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border-bottom: 2px solid #1e3a8a;
  }
  th.num { text-align: right; }
  th:first-child { text-align: left; }
  tbody tr { background: #ffffff; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  td {
    padding: 12px 14px;
    color: #334155;
    vertical-align: middle;
    border-bottom: 1px solid #f1f5f9;
    text-align: center;
  }
  td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; }
  td.valor-monetario { font-style: italic; color: #1e3a8a; font-weight: 600; }
  .footer {
    background: #f1f5f9;
    padding: 20px 16px;
    text-align: center;
    border-top: 1px solid #e2e8f0;
  }
  .footer p { color: #475569; font-size: 12px; margin-bottom: 6px; font-weight: 500; }
  .footer .timestamp { color: #64748b; font-size: 11px; }
  .no-data {
    text-align: center;
    padding: 48px 28px;
    color: #64748b;
  }
  .no-data h3 { margin-bottom: 10px; font-size: 18px; font-weight: 700; color: #1e40af; }
  .no-data p { text-align: center; }
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
  private formatCnpjForEmail(v: string | null | undefined): string {
    if (!v) return '—';
    const n = String(v).replace(/\D/g, '');
    if (n.length !== 14) return v;
    return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
  }

  /**
   * Gera HTML do relatório de email no formato dos registros oficiais em aberto
   * (mesmo layout das fotos: Tipo NI, Número Identificação, Período, Data Transmissão, etc.)
   */
  generateDCTFEmailHTML(dctfs: any[]): string {
    const totalDebito = dctfs.reduce((sum, d) => sum + (parseFloat(d.debito_apurado) || 0), 0);
    const totalSaldo = dctfs.reduce((sum, d) => sum + (parseFloat(d.saldo_a_pagar) || 0), 0);

    const dataGeracao = new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const ultimaAtualizacaoRaw = dctfs.length > 0
      ? dctfs.reduce((max: Date | null, d: any) => {
          const v = d.updated_at ?? d.updatedAt;
          if (!v) return max;
          const date = v instanceof Date ? v : new Date(v);
          if (isNaN(date.getTime())) return max;
          return !max || date.getTime() > max.getTime() ? date : max;
        }, null as Date | null)
      : null;
    const ultimaAtualizacao = ultimaAtualizacaoRaw
      ? ultimaAtualizacaoRaw.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : dataGeracao;

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Registros oficiais em aberto</title>
  <style>
    ${EMAIL_BASE_STYLES}
    .identificacao-cell { min-width: 180px; max-width: 420px; text-align: left; }
    .identificacao-cell .linha-unica { font-size: 13px; color: #334155; }
    .cnpj-cell { font-weight: 700; color: #1e40af; }
    .cnpj-tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 700;
      background: #dbeafe;
      color: #1e40af;
      margin: 0 6px 0 4px;
    }
    .identificacao-cell .razao { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.02em; }
    .badge {
      display: inline-block;
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      background: #dbeafe;
      color: #1e40af;
      border: 1px solid #93c5fd;
    }
    .valor-saldo-destaque { font-style: italic; color: #b91c1c; font-weight: 600; }
    .valor-saldo.zero { font-style: italic; color: #64748b; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Registros oficiais em aberto</h1>
      <p>Relação de Declarações – Em andamento (Clientes Ativos)</p>
    </div>
    <div class="summary-wrap">
      <table class="summary-table" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td>
            <span class="label">Total de Registros</span>
            <span class="value">${dctfs.length}</span>
          </td>
          <td>
            <span class="label">Débito Apurado Total</span>
            <span class="value valor-monetario">R$ ${totalDebito.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </td>
          <td>
            <span class="label">Saldo a Pagar Total</span>
            <span class="value valor-monetario">R$ ${totalSaldo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </td>
        </tr>
      </table>
    </div>
    ${dctfs.length === 0 ? `
    <div class="no-data">
      <h3>Nenhum registro em aberto</h3>
      <p>Não há declarações "Em andamento" de clientes com razão social no momento.</p>
    </div>
    ` : `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Número de Identificação</th>
            <th>Período de Apuração</th>
            <th>Data Transmissão</th>
            <th>Categoria</th>
            <th>Origem</th>
            <th>Tipo</th>
            <th>Situação</th>
            <th class="num">Débito Apurado</th>
            <th class="num">Saldo a Pagar</th>
          </tr>
        </thead>
        <tbody>
          ${dctfs.map((dctf) => {
            const dataTransmissao = dctf.data_transmissao 
              ? new Date(dctf.data_transmissao).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '—';
            const debitoApurado = parseFloat(dctf.debito_apurado) || 0;
            const saldoAPagar = parseFloat(dctf.saldo_a_pagar) || 0;
            const cnpjFormatado = this.formatCnpjForEmail(dctf.cnpj);
            const razaoSocial = (dctf.razao_social || '').toString().trim();
            const saldoClass = saldoAPagar === 0 ? 'valor-monetario valor-saldo zero' : 'valor-monetario valor-saldo-destaque';
            return `
            <tr>
              <td class="identificacao-cell">
                <span class="linha-unica"><span class="cnpj-cell">${cnpjFormatado}</span><span class="cnpj-tag">CNPJ</span>${razaoSocial ? ` <span class="razao">${razaoSocial}</span>` : ''}</span>
              </td>
              <td>${dctf.periodo_apuracao || '—'}</td>
              <td>${dataTransmissao}</td>
              <td>${dctf.categoria || '—'}</td>
              <td>${dctf.origem || '—'}</td>
              <td>${dctf.tipo || '—'}</td>
              <td><span class="badge">${dctf.situacao || 'Em andamento'}</span></td>
              <td class="num valor-monetario">R$ ${debitoApurado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td class="num ${saldoClass}">R$ ${saldoAPagar.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    `}
    <div class="footer">
      <p><strong>Sistema de Gestão DCTF</strong></p>
      <p class="timestamp">Gerado em ${dataGeracao}</p>
      <p class="timestamp">Última atualização dos dados: ${ultimaAtualizacao}</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Gera HTML do relatório "Clientes sem DCTF mas com Movimento" para envio por email.
   * Campos: Empresa, CNPJ, Regime, Competência Obrigação, Movimento em, Tipos Movimento,
   * Total Movimentações, Vencimento, Dias até Vencimento, Possível Obrigação de Envio.
   */
  generateSemDCTFComMovimentoEmailHTML(clientes: any[]): string {
    const dataGeracao = new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const totalMovimentacoes = clientes.reduce((s, c) => s + (Number(c.total_movimentacoes) || 0), 0);
    const comObrigacao = clientes.filter((c) => c.possivelObrigacaoEnvio).length;

    const formatDate = (v: string | null | undefined) => {
      if (!v) return '—';
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('pt-BR');
    };

    const formatTipos = (tipos: string[] | null | undefined) => {
      if (!tipos || !Array.isArray(tipos)) return '—';
      const map: Record<string, string> = {
        CTB: 'CONTÁBIL',
        FISE: 'FISCAL ENTRADA',
        FPG: 'TRABALHISTA',
        FISS: 'FISCAL SAÍDA',
      };
      return tipos.map((t) => map[String(t).toUpperCase()] || t).join(', ');
    };

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Clientes sem DCTF mas com Movimento</title>
  <style>
    ${EMAIL_BASE_STYLES}
    .competencia { color: #1e40af; font-weight: 700; }
    .obrigacao-sim { color: #b91c1c; font-weight: 700; }
    .tag { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; margin: 0 2px; }
    .tag-ctb { background: #dbeafe; color: #1e40af; }
    .tag-fise { background: #d1fae5; color: #065f46; }
    .tag-fiss { background: #fed7aa; color: #9a3412; }
    .tag-fpg { background: #e9d5ff; color: #5b21b6; }
    td:first-child { text-align: left; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Clientes sem DCTF mas com Movimento</h1>
      <p>Relatório de clientes com movimentação e possível obrigação de envio de DCTF</p>
    </div>
    <div class="summary-wrap">
      <table class="summary-table" role="presentation">
        <tr>
          <td><span class="label">Total de clientes</span><span class="value">${clientes.length}</span></td>
          <td><span class="label">Total movimentações</span><span class="value">${totalMovimentacoes.toLocaleString('pt-BR')}</span></td>
          <td><span class="label">Possível obrigação: Sim</span><span class="value">${comObrigacao}</span></td>
        </tr>
      </table>
    </div>
    ${clientes.length === 0 ? `
    <div class="no-data">
      <h3>Nenhum registro no momento</h3>
      <p>Nenhum cliente sem DCTF com movimento no momento.</p>
    </div>
    ` : `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Empresa</th>
            <th>CNPJ</th>
            <th>Regime</th>
            <th>Competência Obrigação</th>
            <th>Movimento em</th>
            <th>Tipos Movimento</th>
            <th class="num">Total Movimentações</th>
            <th>Vencimento</th>
            <th class="num">Dias até Vencimento</th>
            <th>Possível Obrigação de Envio</th>
          </tr>
        </thead>
        <tbody>
          ${clientes.map((c) => {
            const dias = c.diasAteVencimento ?? 0;
            const tiposHtml = (c.tipos_movimento || []).map((t: string) => {
              const u = String(t).toUpperCase();
              const cls = u === 'CTB' ? 'tag-ctb' : u === 'FISE' ? 'tag-fise' : u === 'FISS' ? 'tag-fiss' : u === 'FPG' ? 'tag-fpg' : '';
              return `<span class="tag ${cls}">${formatTipos([t])}</span>`;
            }).join(' ') || '—';
            return `
            <tr>
              <td>${(c.razao_social || '—').toString().replace(/</g, '&lt;')}</td>
              <td>${this.formatCnpjForEmail(c.cnpj)}</td>
              <td>${(c.regime_tributario ? String(c.regime_tributario).toUpperCase() : '—')}</td>
              <td class="competencia">${c.competencia_obrigacao || '—'}</td>
              <td>${c.competencia_movimento || '—'}</td>
              <td>${tiposHtml}</td>
              <td class="num">${(c.total_movimentacoes ?? 0)}</td>
              <td>${formatDate(c.prazoVencimento)}</td>
              <td class="num">${dias < 0 ? `${Math.abs(dias)} dias vencido` : `${dias} dias`}</td>
              <td class="${c.possivelObrigacaoEnvio ? 'obrigacao-sim' : ''}">${c.possivelObrigacaoEnvio ? 'Sim' : 'Não'}</td>
            </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    `}
    <div class="footer">
      <p><strong>Sistema de Gestão DCTF</strong> – Clientes sem DCTF mas com Movimento</p>
      <p class="timestamp">Gerado em ${dataGeracao}</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }
}

export default new EmailService();
