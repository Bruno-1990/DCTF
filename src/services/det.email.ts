/**
 * E-mail das notificações do DET (Domicílio Eletrônico Trabalhista).
 *
 * Recorte: as empresas com ao menos uma NOTIFICAÇÃO na caixa postal — o mesmo
 * critério do filtro "Notificações" da tela. Aviso fica de fora de propósito:
 * chega todo mês (Crédito do Trabalhador), não tem prazo, e numa lista única
 * afogaria justamente o que tem prazo correndo.
 *
 * Notificação LIDA continua entrando. Um cliente não pode sumir do aviso só
 * porque alguém abriu a mensagem no portal — abrir gera ciência e é aí que o
 * prazo começa a correr; some do e-mail exatamente quando mais importa.
 *
 * Uma linha por EMPRESA, não por notificação: o que se leva daqui é "de quais
 * clientes eu preciso cuidar". O desdobramento (assunto por assunto) está na
 * tela, e o botão leva para lá — a mesma divisão de trabalho dos outros avisos.
 *
 * Montagem PURA: recebe as linhas já lidas do banco e devolve string. Sem SMTP
 * e sem `new Date()` interno (a data entra por parâmetro), senão não se testa.
 */

import {
  C,
  esc,
  formatCnpj,
  dataBr,
  moldura,
  painelTotais,
  tabela,
  celula,
  blocoVazio,
  blocoNeutro,
  blocoRessalvas,
  type ColunaTabela,
} from './email.layout';

export const TITULO_EMAIL_DET = 'Notificações no DET';

/**
 * Teto de bytes para as linhas da tabela.
 *
 * O Gmail corta a mensagem por volta de 102 KB e a substitui por um "Mensagem
 * truncada" — no MEIO de uma linha, sem dizer o que ficou de fora. Com ~1,2 KB
 * por empresa, as 71 empresas de hoje já dão 87 KB — cabem, mas com pouca
 * folga; a lista crescendo, o relatório chegaria mutilado sem ninguém perceber.
 *
 * O teto vale só para as LINHAS: a moldura soma ~6 KB por fora, e o
 * quoted-printable do envio infla mais uns 3%. 88 KB de linhas deixa o pior
 * caso em ~97 KB — abaixo do corte, e com as 71 de hoje passando inteiras.
 *
 * Cortar aqui, avisando quantas ficaram, é a única forma de a mensagem ser
 * honesta sobre o próprio limite. Enquanto couber — que é o caso hoje —, a
 * enumeração continua COMPLETA, que é o ponto do relatório.
 */
const TETO_LINHAS_BYTES = 88_000;

export const DET_PAGE_URL =
  process.env['DET_PAGE_URL'] || 'http://192.168.0.47:5173/trabalhista';

/** Uma notificação da caixa postal, como sai de `det_notificacoes`. */
export interface NotificacaoDet {
  assunto: string | null;
  remetente: string | null;
  /** Data como o DET exibe ("21 ago 26"). Preferida sobre a normalizada. */
  data_texto: string | null;
  data_envio: string | null;
  nao_lida: number | boolean;
}

/** Uma empresa e as notificações dela — já agrupadas. */
export interface EmpresaComNotificacoes {
  cnpj: string;
  razao_social: string;
  notificacoes: NotificacaoDet[];
}

const naoLida = (n: NotificacaoDet) => Number(n.nao_lida) === 1;

/** A data que o DET mostrou, quando existe; senão a normalizada. */
const dataDaNotificacao = (n: NotificacaoDet): string =>
  (n.data_texto ?? '').trim() || dataBr(n.data_envio);

/**
 * Ordem da tabela: primeiro quem tem notificação sem ciência, depois quem tem
 * mais notificações, e o nome só desempata.
 *
 * O critério é o da urgência, não o do alfabeto: uma lista de 71 linhas em
 * ordem alfabética faz o caso urgente cair na linha 60 e não ser visto.
 */
export function ordenarEmpresas(
  empresas: EmpresaComNotificacoes[]
): EmpresaComNotificacoes[] {
  return [...empresas].sort((a, b) => {
    const naoLidasA = a.notificacoes.filter(naoLida).length;
    const naoLidasB = b.notificacoes.filter(naoLida).length;
    if (naoLidasA !== naoLidasB) return naoLidasB - naoLidasA;
    if (a.notificacoes.length !== b.notificacoes.length)
      return b.notificacoes.length - a.notificacoes.length;
    return a.razao_social.localeCompare(b.razao_social, 'pt-BR');
  });
}

/**
 * Corpo do aviso, no padrão visual comum (`email.layout`).
 *
 * `geradoEm` entra por parâmetro para o teste poder fixar a data.
 */
export function montarHtmlNotificacoesDet(
  empresas: EmpresaComNotificacoes[],
  geradoEm: Date = new Date()
): string {
  const ordenadas = ordenarEmpresas(empresas);

  const totalNotificacoes = ordenadas.reduce((s, e) => s + e.notificacoes.length, 0);
  const totalNaoLidas = ordenadas.reduce(
    (s, e) => s + e.notificacoes.filter(naoLida).length,
    0
  );

  const colunas: ColunaTabela[] = [
    { titulo: 'Cliente' },
    { titulo: 'Notificação mais recente' },
    { titulo: 'Data', num: true },
    { titulo: 'Notif.', num: true },
    { titulo: 'Sem ciência', num: true },
  ];

  // A ordem já é a da urgência, então cortar pelo fim corta o menos crítico.
  const cabem: EmpresaComNotificacoes[] = [];
  let bytes = 0;
  const linhasMontadas = ordenadas
    .map((e, i) => {
      // As notificações já chegam da mais recente para a mais antiga.
      const recente = e.notificacoes[0];
      const semCiencia = e.notificacoes.filter(naoLida).length;

      // Razão social em cima, CNPJ embaixo: identifica sem gastar coluna.
      const cliente =
        `${esc(e.razao_social) || '—'}` +
        `<div style="font-size:11.5px;color:${C.APAGADO};margin-top:1px;">${formatCnpj(e.cnpj)}</div>`;

      // Assunto em cima, remetente embaixo: é o remetente que diz de qual
      // órgão veio, e é por ele que se sabe a quem responder.
      const assunto = recente
        ? `${esc(recente.assunto) || '—'}` +
          (recente.remetente
            ? `<div style="font-size:11.5px;color:${C.APAGADO};margin-top:1px;">${esc(recente.remetente)}</div>`
            : '')
        : '—';

      return `
            <tr>
              ${celula(cliente, { principal: true, indice: i })}
              ${celula(assunto, { indice: i })}
              ${celula(recente ? esc(dataDaNotificacao(recente)) : '—', { num: true, indice: i })}
              ${celula(String(e.notificacoes.length), { num: true, indice: i, cor: C.ALERTA })}
              ${celula(semCiencia > 0 ? String(semCiencia) : '—', {
                num: true,
                indice: i,
                // Só o que ainda não teve ciência recebe cor: é a linha que
                // exige alguém abrir o portal hoje.
                cor: semCiencia > 0 ? C.URGENTE : C.FRACO,
              })}
            </tr>`;
    });

  for (let i = 0; i < linhasMontadas.length; i++) {
    bytes += linhasMontadas[i]!.length;
    if (bytes > TETO_LINHAS_BYTES && cabem.length > 0) break;
    cabem.push(ordenadas[i]!);
  }
  const linhas = linhasMontadas.slice(0, cabem.length).join('');
  const cortadas = ordenadas.length - cabem.length;

  const carimbo = geradoEm.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return moldura({
    titulo: TITULO_EMAIL_DET,
    subtitulo: 'Domicílio Eletrônico Trabalhista — caixa postal dos clientes',
    cobertura: `${ordenadas.length} empresa(s) com notificação · ${totalNotificacoes} notificação(ões) no total`,
    largura: 900,
    faixas: painelTotais([
      { valor: ordenadas.length, titulo: 'Empresas', detalhe: 'com notificação', cor: C.ALERTA },
      { valor: totalNotificacoes, titulo: 'Notificações', detalhe: 'lidas e não lidas', cor: C.TINTA },
      {
        valor: totalNaoLidas,
        titulo: 'Sem ciência',
        detalhe: 'ninguém abriu ainda',
        cor: C.URGENTE,
      },
    ]),
    corpo:
      ordenadas.length > 0
        ? tabela(colunas, linhas) +
          (cortadas > 0
            ? blocoNeutro(
                `<strong>${cortadas} empresa(s) não couberam nesta mensagem</strong> — o e-mail seria ` +
                  `truncado pelo provedor. São as de menor urgência da ordenação (sem notificação ` +
                  `pendente de ciência). A lista inteira está na tela.`
              )
            : '') +
          blocoRessalvas(
            [
              'A leitura é apenas da LISTAGEM da caixa postal — o sistema não abre as mensagens.',
              '<strong>Abrir a mensagem no DET gera ciência</strong> e dispara o prazo legal. Faça isso conscientemente.',
              'Só entram aqui clientes com procuração ativa: quem não outorgou é invisível para a coleta.',
            ],
            'Antes de abrir no portal'
          )
        : blocoVazio(
            'Nenhuma notificação em aberto',
            'Nenhum cliente com procuração ativa tem Notificação na caixa postal do DET.'
          ),
    cta: { url: DET_PAGE_URL, texto: 'Abrir o DET no sistema' },
    rodape: {
      titulo: 'Domicílio Eletrônico Trabalhista',
      texto: `Levantado em ${carimbo} a partir da última coleta da caixa postal. Avisos (sem prazo) não entram neste relatório. Enviado automaticamente; não responda.`,
    },
  });
}
