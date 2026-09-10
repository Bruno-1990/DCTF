/**
 * Aviso de preenchimento da ficha fiscal.
 *
 * Quem lê é quem coordena o preenchimento, e a pergunta que a pessoa traz ao
 * abrir é uma só: "quanto falta, e de quem?". O e-mail responde isso no painel
 * de totais e na tabela por colaborador — e termina no botão que abre a aba
 * Fiscal já pronta para preencher.
 *
 * POR QUE OS PENDENTES VÊM PRIMEIRO, E ORDENADOS POR QUANTIDADE:
 *   Quem está com 53 empresas em branco precisa de mais aviso do que quem está
 *   com duas. Listar em ordem alfabética espalharia a urgência pela tabela; o
 *   topo tem de ser a fila mais longa.
 *
 * POR QUE O E-MAIL SAI MESMO COM TUDO EM BRANCO:
 *   Este aviso é convite, não relatório de execução. No primeiro disparo TODO
 *   mundo está em zero — é exatamente esse o momento em que ele mais serve.
 *
 * POR QUE "SEM RESPONSÁVEL" VIRA RESSALVA E NÃO LINHA COMUM:
 *   Aquelas empresas não estão atrasadas: elas não têm dono. Misturá-las na
 *   tabela cobraria de alguém um preenchimento que ninguém assumiu.
 *
 * A aparência vem inteira de `email.layout`: este arquivo escolhe o que dizer,
 * não como desenhar.
 */

import {
  C,
  esc,
  moldura,
  painelTotais,
  faixaContexto,
  tabela,
  celula,
  barra,
  blocoNeutro,
  blocoVazio,
  blocoRessalvas,
  type ColunaTabela,
} from './email.layout';
import { EmailService } from './EmailService';
import { PERFIS, VOLUMES_NF, OPCOES_SPED } from './FiscalOpcoes';
import type { Colaborador } from './FiscalFichaService';

/**
 * Para quem vai. Vírgula separa vários, no padrão dos outros avisos
 * (`DARF_LOTE_EMAILS`, `COTA_ALERT_EMAILS`).
 */
const DESTINATARIOS_PADRAO = (
  process.env['FISCAL_ALERT_EMAILS']?.trim() || 'fiscal@central-rnc.com.br'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Nome do colaborador de plantão para o que não tem dono — casa com a migration 053. */
const SEM_RESPONSAVEL = 'Sem responsável';

const COLUNAS: ColunaTabela[] = [
  { titulo: 'Colaborador' },
  { titulo: 'Na carteira', num: true },
  { titulo: 'Respondidas', num: true },
  { titulo: 'Faltam', num: true },
  { titulo: 'Progresso' },
];

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);

/**
 * Assunto do aviso.
 *
 * Local, e nao `EmailService.montarAssunto`, por causa do prefixo: aquele
 * helper abre todo assunto com "DCTF · ", que faz sentido para os avisos de
 * obrigacao (DARF, cota, enquadramento) — sao todos do mesmo assunto e o
 * prefixo agrupa a caixa de entrada. Este e-mail nao fala de DCTF: pede o
 * preenchimento de uma ficha cadastral, e o prefixo so roubava as primeiras
 * letras do que importa na lista de mensagens.
 *
 * O resto do formato continua igual ao dos outros — titulo, contagem entre
 * parenteses e data —, que e o que deixa ordenar e agir sem abrir a mensagem.
 */
function assunto(faltam: number): string {
  const data = new Date().toLocaleDateString('pt-BR');
  return `Ficha Fiscal a preencher (${faltam}) — ${data}`;
}

/**
 * Endereço público do sistema para o link do e-mail. Mesma regra do
 * `EmailService` e do `darfLote.email`: `FRONTEND_URL` é lista de origens do
 * CORS e costuma começar por localhost, que não serve para quem abre o e-mail
 * em outra máquina.
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

/** A linha de um colaborador, com a barra que se lê de relance. */
function linhaColaborador(c: Colaborador, indice: number): string {
  const faltam = c.total - c.preenchidas;
  const p = pct(c.preenchidas, c.total);
  const corFalta = faltam === 0 ? C.OK : faltam > 20 ? C.ALERTA : C.ATENCAO;
  const corBarra = p === 100 ? C.OK : p >= 50 ? C.INFO : C.ATENCAO;

  return `<tr>
    ${celula(esc(c.nome), { principal: true, indice })}
    ${celula(String(c.total), { num: true, indice })}
    ${celula(String(c.preenchidas), { num: true, indice, cor: c.preenchidas > 0 ? C.OK : C.FRACO })}
    ${celula(String(faltam), { num: true, indice, cor: corFalta })}
    ${celula(
      `${barra(p, corBarra, C.LINHA)}<div style="font-size:11px;color:${C.APAGADO};">${p}%</div>`,
      { indice }
    )}
  </tr>`;
}

/** O que se espera que a pessoa preencha — dito uma vez, com as opções reais. */
function blocoOQuePreencher(): string {
  return blocoNeutro(
    `<strong style="color:${C.TINTA};">O que preencher em cada empresa:</strong><br>` +
      `<strong>Perfil</strong> — ${PERFIS.join(' · ')}<br>` +
      `<strong>Volume de NF</strong> — ${VOLUMES_NF.join(' · ')}<br>` +
      `<strong>SPED</strong> — ${OPCOES_SPED.join(' · ')}<br>` +
      `<strong>Particularidade</strong> — texto livre, opcional.<br><br>` +
      `CNPJ, razão social, regime e benefício já vêm do cadastro e não precisam ser digitados. ` +
      `Cada resposta é gravada sozinha, sem botão de salvar. ` +
      `Empresa que não for sua: use <em>“não é minha”</em> — ela fica na lista, riscada, e nada é excluído.`
  );
}

export function montarAviso(colaboradores: Colaborador[]): string {
  const comCarteira = colaboradores.filter((c) => c.total > 0);
  const semDono = comCarteira.find((c) => c.nome === SEM_RESPONSAVEL) ?? null;
  const pessoas = comCarteira.filter((c) => c.nome !== SEM_RESPONSAVEL);

  const total = pessoas.reduce((s, c) => s + c.total, 0);
  const respondidas = pessoas.reduce((s, c) => s + c.preenchidas, 0);
  const dispensadas = pessoas.reduce((s, c) => s + c.inutilizadas, 0);
  const faltam = total - respondidas;
  const concluido = pct(respondidas, total);

  // Fila mais longa no topo; empate desempata pelo nome, para a ordem não
  // dançar entre um disparo e outro.
  const pendentes = pessoas
    .filter((c) => c.total - c.preenchidas > 0)
    .sort(
      (a, b) =>
        b.total - b.preenchidas - (a.total - a.preenchidas) ||
        a.nome.localeCompare(b.nome, 'pt-BR')
    );
  const concluidas = pessoas.filter((c) => c.total - c.preenchidas === 0);

  const ressalvas: string[] = [];
  if (semDono) {
    ressalvas.push(
      `<strong>${semDono.total}</strong> ${semDono.total === 1 ? 'empresa está' : 'empresas estão'} ` +
        `em “${SEM_RESPONSAVEL}” — vieram da aba OBSERVAÇÃO da planilha (somente DP, somente legalização, ` +
        `não localizadas no Controle de Inspeção) e ainda não têm quem preencha.`
    );
  }
  if (dispensadas > 0) {
    ressalvas.push(
      `<strong>${dispensadas}</strong> ${dispensadas === 1 ? 'linha foi marcada' : 'linhas foram marcadas'} ` +
        `como “não é minha” e ${dispensadas === 1 ? 'não entra' : 'não entram'} nas contagens acima.`
    );
  }

  const corpo =
    blocoOQuePreencher() +
    (pendentes.length === 0
      ? blocoVazio(
          'Ficha fiscal completa',
          'Todas as empresas com responsável já têm perfil, volume de NF e SPED respondidos.'
        )
      : tabela(COLUNAS, pendentes.map(linhaColaborador).join('')) +
        (concluidas.length > 0
          ? blocoNeutro(
              `<strong style="color:${C.OK};">Já concluíram:</strong> ` +
                concluidas.map((c) => `${esc(c.nome)} (${c.total})`).join(' · ')
            )
          : '')) +
    blocoRessalvas(ressalvas, 'Fora da contagem');

  const geradoEm = new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return moldura({
    titulo: 'Ficha Fiscal — perfil, volume de NF e SPED',
    subtitulo: 'Preenchimento por colaborador',
    cobertura: `${total} ${total === 1 ? 'empresa distribuída' : 'empresas distribuídas'} entre ${pessoas.length} ${
      pessoas.length === 1 ? 'colaborador' : 'colaboradores'
    }`,
    largura: 760,
    faixas:
      faixaContexto([
        { rot: 'Onde', val: 'Sistema DCTF › Fiscal' },
        { rot: 'Origem', val: 'Distribuição da carteira fiscal' },
      ]) +
      painelTotais(
        [
          { valor: total, titulo: 'Na carteira' },
          { valor: respondidas, titulo: 'Respondidas', cor: C.OK },
          { valor: faltam, titulo: 'Faltam responder', cor: faltam > 0 ? C.ATENCAO : C.OK },
          { valor: `${concluido}%`, titulo: 'Concluído' },
        ],
        'Situação do preenchimento'
      ),
    corpo,
    cta: { url: `${baseUrl()}/fiscal`, texto: 'Abrir a aba Fiscal no sistema' },
    rodape: {
      titulo: 'Sistema de Gestão DCTF',
      texto:
        `Situação de ${geradoEm}. A aba Fiscal substitui a planilha ` +
        `<code>Distribuicao_por_colaborador.xlsx</code>: cada um escolhe o próprio nome no topo da tela ` +
        `e responde só a carteira dele. A tabela é operável pelo teclado — setas navegam, Enter desce, ` +
        `Ctrl+D repete a linha de cima. Enviado pelo sistema; não responda.`,
    },
  });
}

export interface EnvioAviso {
  enviado: boolean;
  erro: string | null;
  destinatarios: string[];
}

/**
 * Monta e envia. Não lança: quem chama é um endpoint de tela, e uma falha de
 * SMTP tem de virar mensagem legível no botão, não erro 500 sem explicação.
 */
export async function enviarAviso(
  colaboradores: Colaborador[],
  destinatarios: string[] = DESTINATARIOS_PADRAO
): Promise<EnvioAviso> {
  if (destinatarios.length === 0) {
    return {
      enviado: false,
      erro: 'Nenhum destinatário configurado (FISCAL_ALERT_EMAILS).',
      destinatarios: [],
    };
  }

  const pessoas = colaboradores.filter((c) => c.total > 0 && c.nome !== SEM_RESPONSAVEL);
  const faltam = pessoas.reduce((s, c) => s + (c.total - c.preenchidas), 0);

  const service = new EmailService();
  try {
    await service.sendEmail({
      to: destinatarios.join(', '),
      subject: assunto(faltam),
      html: montarAviso(colaboradores),
    });
    return { enviado: true, erro: null, destinatarios };
  } catch (erro) {
    const msg = (erro as Error)?.message ?? 'Falha desconhecida no envio.';
    console.error('[FISCAL] Aviso não enviado:', msg);
    return { enviado: false, erro: msg, destinatarios };
  }
}
