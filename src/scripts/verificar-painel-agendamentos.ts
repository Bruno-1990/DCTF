/**
 * Verificação de ponta a ponta do painel de agendamentos, contra o banco real.
 *
 * NÃO sobe o servidor inteiro de propósito: os schedulers agora iniciam sempre,
 * e um segundo processo rodando ao lado do de produção poderia disparar um job
 * de verdade. Aqui só a rota do painel é montada, em memória (supertest), sem
 * porta e sem agendador.
 *
 * As escritas são idempotentes: o horário é salvo com o MESMO valor que já
 * estava, e o e-mail de teste é adicionado e removido em seguida. O que sobra é
 * o rastro no histórico, que é justamente o que se quer provar que funciona.
 *
 * Uso: npx ts-node --transpile-only src/scripts/verificar-painel-agendamentos.ts
 */
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

// eslint-disable-next-line import/first
import express from 'express';
// eslint-disable-next-line import/first
import request from 'supertest';
// eslint-disable-next-line import/first
import agendamentosRoutes from '../routes/agendamentos';
// eslint-disable-next-line import/first
import agendamentoConfigService from '../services/agendamentos/AgendamentoConfigService';
// eslint-disable-next-line import/first
import { mysqlPool } from '../config/mysql';

const EMAIL_TESTE = 'teste-painel@central-rnc.com.br';

const app = express();
app.use(express.json());
app.use('/api/agendamentos', agendamentosRoutes);

let falhas = 0;
const checar = (condicao: boolean, descricao: string, detalhe?: unknown): void => {
  console.log(`${condicao ? 'OK  ' : 'FALHA'} ${descricao}`);
  if (!condicao) {
    falhas++;
    if (detalhe !== undefined) console.log('      →', JSON.stringify(detalhe).slice(0, 300));
  }
};

async function main(): Promise<void> {
  console.log('=== semeadura ===');
  await agendamentoConfigService.semear();

  console.log('\n=== GET /api/agendamentos ===');
  const lista = await request(app).get('/api/agendamentos');
  checar(lista.status === 200, 'responde 200', lista.status);
  const itens: any[] = lista.body?.data ?? [];
  checar(itens.length === 9, `lista os 9 itens do catálogo (veio ${itens.length})`);

  for (const item of itens) {
    const emails = item.emails.map((l: any) => `${l.chave}=[${l.enderecos.join(', ')}]`).join(' ');
    console.log(
      `  ${item.id.padEnd(30)} ${item.janela.padEnd(46)} última: ${item.ultimaExecucao?.inicio ?? '—'} ${emails}`
    );
  }

  const cota = itens.find((i) => i.id === 'cota-aprendizagem');
  checar(cota?.janela?.includes('Todo dia'), 'cota descreve a janela mensal', cota?.janela);
  checar(
    cota?.emails?.find((l: any) => l.chave === 'enquadramento')?.enderecos?.includes('lideres@central-rnc.com.br'),
    'cota semeou o destinatário do .env (lideres@)',
    cota?.emails
  );
  const darf = itens.find((i) => i.id === 'darf-lote');
  checar(darf?.janela?.includes('fora do sistema'), 'DARF aparece como externo', darf?.janela);
  checar(darf?.config?.ativo === false, 'DARF continua desligado (Server Manager dispara)', darf?.config);

  console.log('\n=== PATCH horário (mesmo valor: idempotente) ===');
  const antes = cota.config;
  const patch = await request(app)
    .patch('/api/agendamentos/cota-aprendizagem')
    .set('x-usuario', 'verificação automática')
    .send({ dia: antes.dia, hora: antes.hora, minuto: antes.minuto ?? 0 });
  checar(patch.status === 200, 'salva e responde 200', patch.body);
  checar(patch.body?.data?.janela === cota.janela, 'janela recalculada segue igual', patch.body?.data?.janela);

  console.log('\n=== PATCH inválido é recusado ===');
  const ruim = await request(app).patch('/api/agendamentos/cota-aprendizagem').send({ hora: 99 });
  checar(ruim.status === 400, 'hora 99 → 400', ruim.status);
  checar(/hora/i.test(ruim.body?.error ?? ''), 'mensagem explica o problema', ruim.body?.error);

  const externo = await request(app).patch('/api/agendamentos/darf-lote').send({ hora: 7 });
  checar(externo.status === 400, 'mudar horário do DARF → 400 (é externo)', externo.body?.error);

  console.log('\n=== e-mails: adiciona e remove ===');
  const add = await request(app)
    .post('/api/agendamentos/cota-aprendizagem/emails')
    .set('x-usuario', 'verificação automática')
    .send({ lista: 'cota', email: EMAIL_TESTE });
  checar(add.status === 201 && add.body?.data?.enderecos?.includes(EMAIL_TESTE), 'adiciona', add.body);

  const invalido = await request(app)
    .post('/api/agendamentos/cota-aprendizagem/emails')
    .send({ lista: 'cota', email: 'sem-arroba' });
  checar(invalido.status === 400, 'e-mail inválido → 400', invalido.body?.error);

  const del = await request(app)
    .delete('/api/agendamentos/cota-aprendizagem/emails')
    .query({ lista: 'cota', email: EMAIL_TESTE });
  checar(del.status === 200 && !del.body?.data?.enderecos?.includes(EMAIL_TESTE), 'remove', del.body);

  console.log('\n=== histórico ===');
  const hist = await request(app).get('/api/agendamentos/cota-aprendizagem/historico');
  checar(hist.status === 200, 'responde 200', hist.status);
  const registros: any[] = hist.body?.data ?? [];
  checar(registros.length >= 2, `registrou as alterações (${registros.length})`);
  for (const r of registros.slice(0, 4)) {
    console.log(`  ${r.alterado_em} ${r.campo}: ${r.valor_anterior ?? '—'} → ${r.valor_novo ?? '—'} (${r.alterado_por})`);
  }

  console.log('\n=== estado final da lista de e-mails (tem que estar como antes) ===');
  const depois = await request(app).get('/api/agendamentos');
  const cotaDepois = (depois.body?.data ?? []).find((i: any) => i.id === 'cota-aprendizagem');
  const listaCota = cotaDepois?.emails?.find((l: any) => l.chave === 'cota')?.enderecos ?? [];
  console.log('  cota →', listaCota.join(', ') || '(vazia)');
  checar(!listaCota.includes(EMAIL_TESTE), 'e-mail de teste não ficou para trás');

  console.log(`\n${falhas === 0 ? 'TUDO OK' : `${falhas} FALHA(S)`}`);
  await mysqlPool.end();
  process.exit(falhas === 0 ? 0 : 1);
}

void main().catch(async (err) => {
  console.error('ERRO:', err?.message || err);
  await mysqlPool.end().catch(() => undefined);
  process.exit(1);
});
