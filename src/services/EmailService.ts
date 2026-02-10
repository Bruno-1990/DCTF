import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
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
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #f1f3f5;
      padding: 24px 12px;
      line-height: 1.5;
      color: #495057;
    }
    .container {
      max-width: 96%;
      width: 100%;
      margin: 0 auto;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(180deg, #f0f4f8 0%, #e6eaf0 100%);
      color: #374151;
      padding: 28px 20px;
      text-align: center;
      border-bottom: 1px solid #e2e8f0;
    }
    .header h1 {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 6px;
      color: #1e293b;
      letter-spacing: -0.02em;
    }
    .header p {
      font-size: 14px;
      color: #64748b;
      font-weight: 500;
    }
    .summary-wrap { padding: 20px 16px; background: #f8fafc; border-bottom: 1px solid #e9ecef; }
    .summary-table {
      width: 100%;
      max-width: 100%;
      border-collapse: collapse;
    }
    .summary-table td {
      width: 33%;
      text-align: center;
      padding: 20px 12px;
      background: #fff;
      border: 1px solid #e9ecef;
      vertical-align: middle;
    }
    .summary-table .total { border-left: 4px solid #5eead4; }
    .summary-table .debito { border-left: 4px solid #94a3b8; }
    .summary-table .saldo { border-left: 4px solid #fda4af; }
    .summary-table .label {
      font-size: 10px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 8px;
      font-weight: 600;
      display: block;
    }
    .summary-table .value {
      font-size: 22px;
      font-weight: 700;
      color: #1e293b;
    }
    .summary-table .total .value { color: #0d9488; }
    .summary-table .debito .value { color: #475569; }
    .summary-table .saldo .value { color: #b91c1c; }
    .table-wrap { padding: 20px 16px 24px; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      border: 1px solid #e9ecef;
      border-radius: 10px;
      overflow: hidden;
    }
    thead { background: #e8ecf0; }
    th {
      padding: 12px 14px;
      text-align: left;
      font-weight: 600;
      font-size: 10px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #374151;
      border-bottom: 1px solid #dee2e6;
    }
    th.num { text-align: right; }
    tbody tr { background: #fff; }
    tbody tr:nth-child(even) { background: #fafbfc; }
    td {
      padding: 12px 14px;
      color: #495057;
      vertical-align: middle;
      border-bottom: 1px solid #f1f3f5;
    }
    td.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-weight: 500;
    }
    .identificacao-cell { min-width: 180px; max-width: 420px; }
    .identificacao-cell .linha-unica {
      display: inline;
      font-size: 13px;
      color: #374151;
    }
    .cnpj-cell { font-weight: 600; color: #374151; }
    .cnpj-tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 600;
      background: #e9ecef;
      color: #6b7280;
      margin: 0 6px 0 4px;
    }
    .identificacao-cell .razao {
      font-size: 11px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .badge {
      display: inline-block;
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      background: #fef3c7;
      color: #92400e;
      border: 1px solid #fde68a;
    }
    .valor-debito { color: #495057; font-weight: 700; }
    .valor-saldo { color: #b91c1c; font-weight: 700; }
    .valor-saldo.zero { color: #495057; font-weight: 700; }
    .footer {
      background: #f8f9fa;
      padding: 16px 16px;
      text-align: center;
      border-top: 1px solid #e9ecef;
    }
    .footer p { color: #6b7280; font-size: 12px; margin-bottom: 4px; }
    .footer .timestamp { color: #9ca3af; font-size: 11px; }
    .no-data {
      text-align: center;
      padding: 48px 28px;
      color: #6b7280;
    }
    .no-data h3 { margin-bottom: 8px; font-size: 18px; color: #374151; }
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
          <td class="total">
            <span class="label">Total de Registros</span>
            <span class="value">${dctfs.length}</span>
          </td>
          <td class="debito">
            <span class="label">Débito Apurado Total</span>
            <span class="value">R$ ${totalDebito.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </td>
          <td class="saldo">
            <span class="label">Saldo a Pagar Total</span>
            <span class="value">R$ ${totalSaldo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
            const saldoClass = saldoAPagar === 0 ? 'valor-saldo zero' : 'valor-saldo';
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
              <td class="num valor-debito">R$ ${debitoApurado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
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
}

export default new EmailService();
