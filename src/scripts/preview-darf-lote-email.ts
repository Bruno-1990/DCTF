/**
 * Renderiza o relatório do lote num arquivo HTML, sem enviar nada.
 *
 * Existe porque a alternativa para conferir o layout era mandar um e-mail de
 * teste para a caixa do DP — que é um time real, não um ambiente de testes.
 *
 *   npx ts-node --transpile-only src/scripts/preview-darf-lote-email.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { montarRelatorio } from '../services/darfLote.email';
import type { ItemLote, ResultadoLote } from '../services/DarfLoteService';

const ok = (
  sci: string,
  razao: string,
  cnpj: string,
  doc: string,
  valor: number,
  status: 'emitido' | 'reaproveitado'
): ItemLote => ({
  cnpj,
  razaoSocial: razao,
  codigoSci: sci,
  status,
  darfId: 1,
  numeroDocumento: doc,
  valorTotal: valor,
  vencimento: '2026-09-18',
  arquivo: `${cnpj}_DARF_PREVIDENCIARIO_082026.pdf`,
  erro: null,
});

const falha = (sci: string, razao: string, cnpj: string, erro: string): ItemLote => ({
  cnpj,
  razaoSocial: razao,
  codigoSci: sci,
  status: 'falha',
  darfId: null,
  numeroDocumento: null,
  valorTotal: null,
  vencimento: null,
  arquivo: null,
  erro,
});

const itens: ItemLote[] = [
  ok('238', 'AJ PORT CONSULTORIA LTDA', '47306185000120', '07.16.26247.3908130-2', 502.51, 'reaproveitado'),
  ok('49', 'CURTUME SILVESTRE LTDA.', '39811708000168', '07.16.26247.3912900-1', 8123.44, 'emitido'),
  ok('427', 'AKL TECNOLOGIA E SERVICOS LTDA', '64515496000119', '07.16.26247.3909170-7', 178.31, 'reaproveitado'),
  ok('144', 'UP LOG SOLUCOES EM ARMAZENS E LOGISTICA LTDA', '30691293000161', '07.16.26247.3911568-1', 4374.75, 'reaproveitado'),
  falha(
    '120',
    'RV NEGOCIOS IMOBILIARIOS, RURAIS E URBANOS LTDA',
    '05755778000124',
    'Não há débitos com saldo a pagar para emissão da guia de pagamento. Emissor Guia Pagamento executado, mas retornou erro.'
  ),
];

const r: ResultadoLote = {
  execucaoId: 1,
  anoPA: '2026',
  mesPA: '08',
  categoria: 'GERAL_MENSAL',
  pastaDestino: '\\\\192.168.0.1\\Envio_Acessorias',
  itens,
  total: 17,
  emitidos: 1,
  reaproveitados: 3,
  falhas: 1,
  valorTotal: itens.reduce((s, i) => s + Number(i.valorTotal ?? 0), 0),
  emailEnviado: false,
  emailErro: null,
  abortadoPor: null,
};

const destino = path.join(process.cwd(), 'preview-darf-lote.html');
fs.writeFileSync(destino, montarRelatorio(r), 'utf8');
console.log('Relatório escrito em', destino);

// A segunda variação: a rodada que nem começou. É a que menos se vê e a que
// mais precisa estar legível, porque chega justamente quando algo quebrou.
const abortado: ResultadoLote = {
  ...r,
  itens: [],
  emitidos: 0,
  reaproveitados: 0,
  falhas: 0,
  valorTotal: 0,
  abortadoPor:
    'A pasta de destino não respondeu (\\\\192.168.0.1\\Envio_Acessorias). Nenhuma guia foi emitida.',
};
const destino2 = path.join(process.cwd(), 'preview-darf-lote-abortado.html');
fs.writeFileSync(destino2, montarRelatorio(abortado), 'utf8');
console.log('Variação abortada em', destino2);
