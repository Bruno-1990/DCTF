/**
 * Relatório do lote mensal de DARF previdenciário.
 *
 * Quem lê é o DP, e a pergunta que a pessoa traz ao abrir o e-mail é sempre a
 * mesma: "posso considerar a competência entregue?". O relatório responde isso
 * em duas linhas — o painel de totais e, quando existe, o bloco de pendências.
 *
 * POR QUE AS FALHAS VÊM ANTES DOS SUCESSOS:
 *   A lista de guias que deram certo é longa e não exige nada de ninguém. As
 *   falhas são três ou quatro e cada uma é uma tarefa. Enterrá-las depois de
 *   dezessete linhas verdes é o mesmo que não avisar.
 *
 * POR QUE O E-MAIL SAI MESMO QUANDO NADA FOI EMITIDO:
 *   Caixa de entrada vazia é ambígua entre "não havia o que fazer" e "o job
 *   morreu". Um relatório zerado, com o motivo, distingue os dois — é o mesmo
 *   princípio do `blocoVazio` no layout comum.
 *
 * A aparência vem inteira de `email.layout`: este arquivo escolhe o que dizer,
 * não como desenhar.
 */

import {
  C,
  esc,
  moeda,
  formatCnpj,
  dataBr,
  moldura,
  painelTotais,
  faixaContexto,
  tabela,
  celula,
  secao,
  itemLista,
  blocoVazio,
  blocoNeutro,
  tag,
  type ColunaTabela,
} from './email.layout';
import { EmailService } from './EmailService';
import type { ResultadoLote, ItemLote } from './DarfLoteService';

/** Para quem vai. Vírgula separa vários, no padrão dos outros avisos. */
const DESTINATARIOS = (
  process.env['DARF_LOTE_EMAILS']?.trim() || 'dp@central-rnc.com.br'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const competenciaPorExtenso = (mes: string, ano: string): string => {
  const i = Number(mes) - 1;
  return `${MESES[i] ?? mes}/${ano}`;
};

/** Razão social em cima, CNPJ e código SCI embaixo — identifica sem gastar coluna. */
function identificacao(item: ItemLote): string {
  const nome = (item.razaoSocial ?? '').trim();
  const codigo = item.codigoSci ? `SCI ${esc(item.codigoSci)} · ` : '';
  const linhaDeBaixo = `<div style="font-size:11.5px;color:${C.APAGADO};margin-top:1px;">${codigo}${formatCnpj(item.cnpj)}</div>`;
  return nome ? `${esc(nome)}${linhaDeBaixo}` : formatCnpj(item.cnpj);
}

/** Tabela das guias que estão na pasta. */
function tabelaEntregues(itens: ItemLote[]): string {
  const colunas: ColunaTabela[] = [
    { titulo: 'Cliente' },
    { titulo: 'Documento' },
    { titulo: 'Arquivo gravado' },
    { titulo: 'Vencimento', num: true },
    { titulo: 'Valor', num: true },
  ];

  const linhas = itens
    .map((item, i) => {
      // Reaproveitada = já existia no histórico e foi só copiada. A etiqueta
      // evita a leitura errada de que a Receita foi consultada de novo.
      const doc = item.numeroDocumento
        ? `${esc(item.numeroDocumento)}${item.status === 'reaproveitado' ? `<div style="margin-top:3px;">${tag('já emitida')}</div>` : ''}`
        : '—';
      return `
        <tr>
          ${celula(identificacao(item), { principal: true, indice: i })}
          ${celula(doc, { indice: i })}
          ${celula(`<span style="font-size:11.5px;color:${C.APAGADO};">${esc(item.arquivo ?? '—')}</span>`, { indice: i })}
          ${celula(dataBr(item.vencimento), { num: true, indice: i })}
          ${celula(moeda(item.valorTotal), { num: true, indice: i })}
        </tr>`;
    })
    .join('');

  return tabela(colunas, linhas);
}

/** Bloco das pendências, uma linha por cliente com o motivo da Receita. */
function blocoFalhas(itens: ItemLote[]): string {
  if (itens.length === 0) return '';

  const linhas = itens
    .map((item, i) =>
      itemLista({
        titulo: identificacao(item),
        // O motivo é a única coisa acionável aqui: vem inteiro, sem corte.
        meta: esc(item.erro ?? 'Motivo não informado.'),
        valor: 'sem guia',
        cor: C.ALERTA,
        indice: i,
      })
    )
    .join('');

  return secao({
    titulo: 'Sem guia nesta competência',
    subtitulo: 'Nenhum arquivo foi gravado na pasta para estes clientes',
    contagem: itens.length,
    cor: C.ALERTA,
    fundo: C.ALERTA_FUNDO,
    itens: linhas,
  });
}

export function montarRelatorio(r: ResultadoLote): string {
  const entregues = r.itens.filter((i) => i.status !== 'falha');
  const falhas = r.itens.filter((i) => i.status === 'falha');
  const competencia = competenciaPorExtenso(r.mesPA, r.anoPA);

  const geradoEm = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  // A rodada nem começou: a pasta não respondeu, ou a carteira está vazia. Um
  // painel de zeros sem explicação faria parecer que ninguém devia nada.
  const corpo = r.abortadoPor
    ? blocoNeutro(
        `<strong style="color:${C.ALERTA};">A rodada não foi executada.</strong><br>${esc(r.abortadoPor)}`
      )
    : entregues.length === 0 && falhas.length === 0
      ? blocoVazio('Nenhum cliente ativo no lote', 'Inclua as empresas na aba Trabalhista > DARF.')
      : blocoFalhas(falhas) +
        (entregues.length > 0
          ? tabelaEntregues(entregues)
          : blocoVazio('Nenhuma guia entregue', 'Todos os clientes do lote falharam — veja os motivos acima.'));

  return moldura({
    titulo: 'DARF previdenciário — envio à Acessórias',
    subtitulo: `Competência ${competencia}`,
    cobertura: `${r.total} ${r.total === 1 ? 'cliente' : 'clientes'} na carteira do lote`,
    largura: 900,
    faixas:
      faixaContexto([
        { rot: 'Pasta', val: esc(r.pastaDestino) },
        { rot: 'Categoria', val: 'Geral — mensal' },
      ]) +
      painelTotais(
        [
          { valor: entregues.length, titulo: 'Guias na pasta', cor: C.OK },
          { valor: r.emitidos, titulo: 'Emitidas agora', detalhe: 'ida à Receita' },
          { valor: r.reaproveitados, titulo: 'Já emitidas', detalhe: 'copiadas do histórico' },
          { valor: falhas.length, titulo: 'Sem guia', cor: C.ALERTA },
          { valor: moeda(r.valorTotal), titulo: 'Total a recolher' },
        ],
        'Resumo da competência'
      ),
    corpo,
    cta: { url: `${baseUrl()}/trabalhista?aba=darf`, texto: 'Abrir a aba DARF no sistema' },
    rodape: {
      titulo: 'Sistema de Gestão DCTF',
      texto:
        `Rodada de ${geradoEm}. Os arquivos seguem o padrão ` +
        `<code>CNPJ_DARF_PREVIDENCIARIO_MMAAAA.pdf</code> na pasta acima. ` +
        `Enviado automaticamente pelo lote mensal; não responda.`,
    },
  });
}

/**
 * Endereço público do sistema para o link do e-mail. Mesma regra do
 * `EmailService`: `FRONTEND_URL` é lista de origens do CORS e costuma começar
 * por localhost, que não serve para quem abre o e-mail em outra máquina.
 */
function baseUrl(): string {
  const explicita = (process.env['APP_PUBLIC_URL'] ?? '').trim();
  if (explicita) return explicita.replace(/\/+$/, '');
  const origens = (process.env['FRONTEND_URL'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const externa = origens.find((o) => !/localhost|127\.0\.0\.1/i.test(o));
  return (externa ?? origens[0] ?? 'http://192.168.0.47:5173').replace(/\/+$/, '');
}

export interface EnvioRelatorio {
  enviado: boolean;
  erro: string | null;
}

/**
 * Monta e envia. Não lança: o e-mail é o último passo da rodada, e uma falha de
 * SMTP não pode apagar o fato de que as guias já estão na pasta — ela vira
 * `email_erro` na execução, visível na tela.
 */
export async function enviarRelatorioLote(r: ResultadoLote): Promise<EnvioRelatorio> {
  if (DESTINATARIOS.length === 0) {
    return { enviado: false, erro: 'Nenhum destinatário configurado (DARF_LOTE_EMAILS).' };
  }

  const service = new EmailService();
  const entregues = r.itens.filter((i) => i.status !== 'falha').length;

  try {
    await service.sendEmail({
      to: DESTINATARIOS.join(', '),
      // Mesmo assunto padrão dos outros avisos: prefixo, título e contagem —
      // é o que deixa ordenar e filtrar na caixa de entrada.
      subject: service.montarAssunto(
        `DARF ${competenciaPorExtenso(r.mesPA, r.anoPA)} enviado à Acessórias`,
        entregues
      ),
      html: montarRelatorio(r),
    });
    return { enviado: true, erro: null };
  } catch (erro) {
    const msg = (erro as Error)?.message ?? 'Falha desconhecida no envio.';
    console.error('[DarfLote] Relatório não enviado:', msg);
    return { enviado: false, erro: msg };
  }
}
