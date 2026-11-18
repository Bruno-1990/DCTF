/**
 * Participação dos sócios a partir da Situação Fiscal já extraída (sem consultar o SERPRO).
 *
 * GET  /api/participacao-sitf/previa[?clienteId=...]  o que mudaria, cliente a cliente (só leitura)
 * POST /api/participacao-sitf/aplicar { clienteIds }  grava as mudanças (o plano é refeito aqui)
 */
import { Router } from 'express';
import { ParticipacaoSitfService } from '../services/participacaoSitf/ParticipacaoSitfService';
import {
  barramentoParticipacao,
  ligarReplanejamento,
  resumirLote,
  type EventoParticipacao,
} from '../services/participacaoSitf/eventos';
import { fecharLotesOrfaos, ultimoLoteInterrompido } from '../services/participacaoSitf/lotesInterrompidos';
import { requireAdmin } from '../middleware/requireAdmin';

const router = Router();
const service = new ParticipacaoSitfService();
const MAX_POR_VEZ = 500;

ligarReplanejamento(barramentoParticipacao, service);

// Na subida do processo nenhum lote está vivo: o que o banco tiver 'em_andamento' morreu com o
// processo anterior. Fecha agora para não bloquear o próximo lote nem enganar a tela.
setTimeout(() => {
  fecharLotesOrfaos().catch((e: any) => console.error('[Participação SITF] Erro ao fechar lotes órfãos:', e?.message));
}, 3000);

/**
 * GET /api/participacao-sitf/eventos (SSE)
 * Eventos: 'lote' (progresso do lote de Situação Fiscal), 'extracao' (extração de um CNPJ
 * terminou), 'aplicado' (participação gravada) e 'cliente' (a linha da prévia refeita).
 * Ao conectar, manda o lote em andamento, se houver.
 */
router.get('/eventos', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // O compression() do server.ts segura o corpo até encher o buffer: sem o flush, o evento não sai.
  const enviar = (evento: string, dados: unknown) => {
    res.write(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`);
    (res as any).flush?.();
  };

  const progressos = ((global as any).sitfLoteProgress || {}) as Record<string, any>;
  const emAndamento = Object.entries(progressos).find(([, p]) => p?.status === 'em_andamento');
  const lote = emAndamento ? resumirLote(emAndamento[0], emAndamento[1]) : null;
  // Sem lote vivo: avisa se o último parou no meio (processo reiniciado), para a tela oferecer retomar.
  (lote ? Promise.resolve(null) : fecharLotesOrfaos().then(() => ultimoLoteInterrompido()))
    .catch((e: any) => {
      console.error('[Participação SITF] Erro ao ler o último lote:', e?.message);
      return null;
    })
    .then((interrompido) => enviar('pronto', { lote, interrompido }));

  const ouvir = (e: EventoParticipacao) => enviar(e.tipo, e);
  barramentoParticipacao.on('evento', ouvir);
  const batimento = setInterval(() => {
    res.write(': batimento\n\n');
    (res as any).flush?.();
  }, 15000);

  req.on('close', () => {
    barramentoParticipacao.off('evento', ouvir);
    clearInterval(batimento);
  });
});

router.get('/previa', async (req, res) => {
  try {
    const clienteId = typeof req.query.clienteId === 'string' && req.query.clienteId.trim() ? req.query.clienteId.trim() : null;
    const itens = await service.previa(clienteId ? [clienteId] : undefined);
    const resumo = itens.reduce<Record<string, number>>((t, i) => ({ ...t, [i.situacao]: (t[i.situacao] || 0) + 1 }), {});
    res.json({ success: true, data: { resumo, itens } });
  } catch (e: any) {
    console.error('[Participação SITF] Erro na prévia:', e?.message);
    res.status(500).json({ success: false, error: 'Erro ao montar a prévia da participação' });
  }
});

/**
 * POST /api/participacao-sitf/fila-consulta
 * Consulta obrigatória: põe na fila do lote de pendentes todo cliente ativo sem Situação Fiscal
 * consultada no mês corrente. Quem roda a fila é /api/situacao-fiscal/lote/iniciar-pendentes.
 */
router.post('/fila-consulta', requireAdmin, async (_req, res) => {
  try {
    // Solta os CNPJs presos em 'processando' por um lote que morreu, antes de montar a fila.
    await fecharLotesOrfaos();
    const progressos = ((global as any).sitfLoteProgress || {}) as Record<string, any>;
    if (Object.values(progressos).some((p) => p?.status === 'em_andamento')) {
      return res.status(409).json({ success: false, error: 'Já há um lote de Situação Fiscal rodando. Espere ele terminar.' });
    }
    const data = await service.enfileirarConsultaObrigatoria();
    console.log(`[Participação SITF] Fila de consulta obrigatória (${data.mesVigente}): ${data.enfileirados} CNPJ(s)`);
    res.json({ success: true, data });
  } catch (e: any) {
    console.error('[Participação SITF] Erro ao montar a fila:', e?.message);
    res.status(500).json({ success: false, error: 'Erro ao montar a fila de consulta' });
  }
});

router.post('/aplicar', async (req, res) => {
  const ids = req.body?.clienteIds;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i: unknown) => typeof i === 'string' && i.trim())) {
    return res.status(400).json({ success: false, error: 'Informe clienteIds (lista de ids).' });
  }
  if (ids.length > MAX_POR_VEZ) {
    return res.status(400).json({ success: false, error: `No máximo ${MAX_POR_VEZ} clientes por vez.` });
  }
  try {
    const data = await service.aplicar(ids.map((i: string) => i.trim()));
    console.log(`[Participação SITF] Aplicado: ${data.aplicados.length} cliente(s); ignorados: ${data.ignorados.length}`);
    res.json({ success: true, data });
  } catch (e: any) {
    console.error('[Participação SITF] Erro ao aplicar:', e?.message);
    res.status(500).json({ success: false, error: 'Erro ao atualizar a participação dos sócios' });
  }
});

export default router;
