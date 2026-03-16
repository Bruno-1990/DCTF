import { Router } from 'express';
import { ConferenciaController } from '../controllers/ConferenciaController';
import { gerarResumoConferencias } from '../services/conferences/ConferenceModulesService';
import EmailService from '../services/EmailService';

const router = Router();
const controller = new ConferenciaController();

const DOMINIO_EMAIL = '@central-rnc.com.br';

// GET /api/conferencias/resumo?cnpj=&clienteId=&inicio=YYYY-MM&fim=YYYY-MM
router.get('/resumo', (req, res) => controller.resumo(req, res));

// GET /api/conferencias/detalhe?cnpj=&competencia=YYYY-MM
router.get('/detalhe', (req, res) => controller.detalhe(req, res));

// GET /api/conferencias/summary - Novo resumo modular de conferências
router.get('/summary', async (req, res) => {
  try {
    const summary = await gerarResumoConferencias();
    res.json({ success: true, data: summary });
  } catch (error: any) {
    console.error('[Conferências] Erro ao gerar resumo:', error);
    res.status(500).json({
      success: false,
      error: 'Falha ao gerar resumo de conferências',
      details: error?.message,
    });
  }
});

// POST /api/conferencias/send-email-sem-dctf-com-movimento - Envia email com relatório "Clientes sem DCTF mas com Movimento"
router.post('/send-email-sem-dctf-com-movimento', async (req, res) => {
  try {
    const emailDestinoRaw = (req.body?.to ?? req.body?.email ?? '').toString().trim();
    if (!emailDestinoRaw) {
      res.status(400).json({
        success: false,
        error: 'Destinatário obrigatório',
        message: 'Informe o email de destino (ex: ti ou ti@central-rnc.com.br).',
      });
      return;
    }
    const emailDestino = emailDestinoRaw.includes('@')
      ? emailDestinoRaw
      : `${emailDestinoRaw}${DOMINIO_EMAIL}`;
    if (!emailDestino.toLowerCase().endsWith(DOMINIO_EMAIL)) {
      res.status(400).json({
        success: false,
        error: 'Destinatário inválido',
        message: `Só é permitido enviar para emails ${DOMINIO_EMAIL}`,
      });
      return;
    }

    const summary = await gerarResumoConferencias();
    const clientes = summary?.modulos?.clientesSemDCTFComMovimento ?? [];

    const htmlContent = EmailService.generateSemDCTFComMovimentoEmailHTML(clientes);
    await EmailService.sendEmail({
      to: emailDestino,
      subject: `Clientes sem DCTF mas com Movimento - ${new Date().toLocaleDateString('pt-BR')}`,
      html: htmlContent,
    });

    res.json({
      success: true,
      message: `Email enviado com sucesso para ${emailDestino}`,
      data: { total: clientes.length, destinatario: emailDestino },
    });
  } catch (error: any) {
    console.error('[Conferências] Erro ao enviar email sem DCTF com movimento:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao enviar email',
      message: error?.message || 'Erro desconhecido',
    });
  }
});

export default router;


