/**
 * Os questionários fechados da aba Fiscal — definição em código, não no banco.
 *
 * Mesma decisão de FiscalOpcoes.ts, pelo mesmo motivo: a tela monta o formulário
 * a partir DESTA estrutura e o backend valida a resposta contra ELA. Se a
 * definição morasse numa tabela e a validação aqui, as duas poderiam discordar
 * em silêncio — a tela ofereceria uma opção que o backend recusa. Um enunciado
 * novo é decisão de produto, não operação de usuário: mexe no código, sobe, e
 * `versao` marca a virada.
 *
 * O que VAI para o banco é só a resposta (fiscal_questionario_respostas), um
 * mapa `id da pergunta → valor`, gravado por colaborador.
 *
 * O primeiro questionário ("CFOP: XML ou SPED?") nasceu de um HTML avulso que
 * circulava por link; os textos abaixo são transcrição fiel dele, incluindo os
 * números apurados na run de 14/09/2026 contra o livro retificado do SCI.
 */

/** Um par rótulo → texto do bloco "caso" que contextualiza a pergunta. */
export interface LinhaCaso {
  rotulo: string;
  texto: string;
}

/** Uma alternativa. `valor` é o que fica gravado; `texto` é o que se lê. */
export interface OpcaoPergunta {
  valor: string;
  texto: string;
}

/**
 * `unica` = radio (grava string), `multipla` = checkbox (grava array de
 * strings), `texto` = campo livre (grava string). A observação por pergunta
 * existe em qualquer um dos três e é gravada sob a chave `obs:<id>`.
 */
export type TipoPergunta = 'unica' | 'multipla' | 'texto';

export interface PerguntaDefinicao {
  /** Identificador estável — é a chave no JSON de respostas. Nunca reaproveitar. */
  id: string;
  /** Número visível na tela, contínuo dentro do questionário. */
  numero: number;
  enunciado: string;
  /** Os dados do caso concreto, quando a pergunta tem um. */
  caso?: LinhaCaso[];
  tipo: TipoPergunta;
  opcoes?: OpcaoPergunta[];
  /** A regra de código que a resposta fecha. Aparece em letra miúda. */
  defineNoMotor?: string;
  placeholderObs?: string;
}

export interface SecaoDefinicao {
  /** Letra da seção, como no original: A, B, C… */
  codigo: string;
  titulo: string;
  intro?: string;
  perguntas: PerguntaDefinicao[];
  /** Seção que é só um campo de texto no fim (a H do primeiro questionário). */
  observacoesGerais?: { placeholder: string };
}

export interface QuestionarioDefinicao {
  slug: string;
  /** A linha de chapéu acima do título ("eyebrow" no HTML de origem). */
  chapeu?: string;
  titulo: string;
  lead: string;
  comoResponder: string[];
  versao: number;
  secoes: SecaoDefinicao[];
}

/** Resumo para a listagem — a tela não precisa baixar 21 perguntas para isso. */
export interface QuestionarioResumo {
  slug: string;
  titulo: string;
  versao: number;
  totalPerguntas: number;
}

const CFOP_XML_OU_SPED: QuestionarioDefinicao = {
  slug: 'cfop-xml-ou-sped',
  versao: 1,
  chapeu: 'Centria · Motor de apuração de ICMS · Questionário ao analista fiscal',
  titulo: 'CFOP: XML ou SPED?',
  lead:
    'Numa nota de compra, o XML traz o CFOP do fornecedor. O que a empresa fez com a ' +
    'mercadoria — revender, consumir, usar no serviço — só está no SPED dela. Este ' +
    'questionário fixa, com casos reais da Ouro Preto Explosivos (07/2026), qual documento ' +
    'manda em cada situação, para que a regra entre no motor de uma vez e não volte como ' +
    'dúvida a cada cliente.',
  comoResponder: [
    'Marque uma opção por pergunta. Os valores são os apurados na run de 14/09/2026 contra o ' +
      'livro retificado do SCI. CFOPs escritos com ponto (1.126) seguem o livro; sem ponto ' +
      '(1126) é como o motor grava.',
    'Cada pergunta termina com "Define no motor": é a regra de código que a resposta fecha. Se ' +
      'nenhuma opção serve, escreva a sua no campo de observação.',
  ],
  secoes: [
    {
      codigo: 'A',
      titulo: 'Fonte do CFOP em entradas de terceiros',
      intro:
        'Hoje o motor acata o SPED só para quatro CFOPs de uso/consumo (1407 1556 2407 2556) e, ' +
        'para todo o resto, usa o espelho do XML (fornecedor 5.102 → 1.102). A Ouro Preto expôs ' +
        '219 itens em 1.126, 228 em 1.653 e outros que o livro classifica de outro jeito.',
      perguntas: [
        {
          id: 'q1',
          numero: 1,
          enunciado:
            'Em nota emitida por terceiro, escriturada e vinculada ao XML, qual CFOP deve valer ' +
            'na apuração?',
          tipo: 'unica',
          opcoes: [
            {
              valor: 'sped_sempre',
              texto: 'O do SPED, sempre. O espelho do XML serve só para apontar divergência.',
            },
            {
              valor: 'xml_sempre',
              texto: 'O espelho do XML, sempre. O SPED é conferido, nunca adotado.',
            },
            {
              valor: 'lista',
              texto:
                'Depende do CFOP do SPED — manter uma lista de CFOPs em que o SPED manda ' +
                '(responder a 2).',
            },
          ],
          defineNoMotor:
            'cfop_adoption.py: se a adoção é regra geral com gates, ou lista fechada ' +
            'CONSUMPTION_CFOPS.',
          placeholderObs: 'Observação (opcional)',
        },
        {
          id: 'q2',
          numero: 2,
          enunciado: 'Se a resposta a 1 foi "depende": em quais famílias o SPED manda?',
          tipo: 'multipla',
          opcoes: [
            { valor: '1126', texto: '1.126 / 2.126 — compra para utilização na prestação de serviço' },
            { valor: '1653', texto: '1.653 / 2.653 — combustível ou lubrificante para consumo' },
            { valor: '1551', texto: '1.551 / 2.551 — ativo imobilizado' },
            {
              valor: '1556',
              texto: '1.407 / 1.556 / 2.407 / 2.556 — uso e consumo (já adotados hoje)',
            },
            {
              valor: '1202',
              texto: '1.202 / 2.202 — devolução de venda de mercadoria adquirida de terceiros',
            },
            { valor: '1101', texto: '1.101 / 1.102 — industrialização × comercialização' },
            { valor: '19xx', texto: '1.9xx / 2.9xx — outras entradas (1.904, 1.929, 1.949)' },
          ],
          defineNoMotor: 'o conteúdo da lista, se lista houver.',
          placeholderObs: 'Outras famílias, ou por que estas',
        },
        {
          id: 'q3',
          numero: 3,
          enunciado:
            'Quando o CFOP do SPED difere do espelho do XML, o achado P03 ("CFOP divergente") ' +
            'deve ter que peso?',
          tipo: 'unica',
          opcoes: [
            {
              valor: 'warning_sempre',
              texto: 'WARNING sempre — toda divergência pede olhar humano.',
            },
            {
              valor: 'por_credito',
              texto:
                'WARNING só quando a divergência muda o direito a crédito; INFO quando é só ' +
                'destinação (serviço, consumo, ativo).',
            },
            {
              valor: 'so_credito',
              texto: 'Só gerar achado quando muda o crédito; destinação coerente não é achado.',
            },
          ],
          defineNoMotor:
            'p03_cfop_divergence.py: severidade por classe de divergência. Hoje: 724 WARNING + ' +
            '418 INFO na Ouro Preto.',
          placeholderObs: 'Observação (opcional)',
        },
      ],
    },
    {
      codigo: 'B',
      titulo: 'Casos da Ouro Preto, um a um',
      intro:
        'Cada caso abaixo aconteceu nesta run. A pergunta é sempre a mesma: a apuração deve ' +
        'seguir o que o SCI escriturou?',
      perguntas: [
        {
          id: 'q4',
          numero: 4,
          enunciado: 'Compras internas escrituradas como uso na prestação de serviço',
          caso: [
            {
              rotulo: 'XML',
              texto:
                '73 notas, 219 itens · fornecedor emitiu 5.102 → espelho 1102 · ICMS destacado ' +
                'R$ 3.537,43',
            },
            { rotulo: 'SPED', texto: '1126 · sem crédito' },
            { rotulo: 'Livro', texto: '1.126 = R$ 102.926,98 em "Outras", crédito 0,00' },
            { rotulo: 'Motor hoje', texto: 'credita os R$ 3.537,43 (SUB_TOTAL do regime)' },
          ],
          tipo: 'unica',
          opcoes: [
            { valor: 'sped', texto: 'Seguir o SPED: sem crédito, e avisar a divergência.' },
            {
              valor: 'xml',
              texto: 'Seguir o XML: creditar, porque a escrituração em 1.126 está errada.',
            },
            { valor: 'pendencia', texto: 'Não decidir: virar pendência para o operador, nota a nota.' },
          ],
          defineNoMotor: 'adoção de 1126/2126 e o bucket do item no Compete.',
          placeholderObs: 'Observação (opcional)',
        },
        {
          id: 'q5',
          numero: 5,
          enunciado: 'Abastecimento em posto, cupom registrado em ECF',
          caso: [
            {
              rotulo: 'XML',
              texto:
                '219 notas, 228 itens · postos emitiram 5.929 → espelho 1929 · ICMS R$ 156,88',
            },
            { rotulo: 'SPED', texto: '1653 combustível para consumo · sem crédito' },
            { rotulo: 'Livro', texto: '1.653 = R$ 351.498,81 em "Outras"' },
            {
              rotulo: 'Motor hoje',
              texto:
                '1929 está no catálogo FORA — por acaso não credita; mas apura e exibe como 1.929',
            },
          ],
          tipo: 'unica',
          opcoes: [
            { valor: 'sped', texto: 'Seguir o SPED: apurar e exibir como 1.653.' },
            { valor: 'xml', texto: 'Manter 1.929 e só avisar.' },
          ],
          defineNoMotor:
            'adoção de 1653/2653; o quadro por CFOP do livro (IcmsBookService) passa a bater ' +
            'com o SCI.',
          placeholderObs: 'Observação (opcional)',
        },
        {
          id: 'q6',
          numero: 6,
          enunciado: 'Devolução de venda: produção própria ou mercadoria adquirida?',
          caso: [
            {
              rotulo: 'XML',
              texto:
                '1 nota · cliente emitiu 5.201 → espelho 1201 (devolução de venda de produção do ' +
                'estabelecimento)',
            },
            {
              rotulo: 'SPED',
              texto: '1202 (de mercadoria adquirida de terceiros) · crédito R$ 396,90 nos dois',
            },
            { rotulo: 'Motor hoje', texto: '1201 é "desconhecido" → sem crédito, pendência' },
          ],
          tipo: 'unica',
          opcoes: [
            {
              valor: 'sempre_1202',
              texto:
                'Atacadista não produz: devolução de venda é sempre 1.202/2.202. Seguir o SPED.',
            },
            { valor: 'caso', texto: 'Depende do produto — decidir caso a caso.' },
            { valor: 'xml', texto: 'Manter o espelho do XML.' },
          ],
          defineNoMotor: 'adoção de 1202/2202 e a entrada de 1201/2201 no catálogo do Compete.',
          placeholderObs: 'Observação (opcional)',
        },
        {
          id: 'q7',
          numero: 7,
          enunciado: 'Devolução de venda interestadual: gera crédito?',
          caso: [
            { rotulo: 'XML', texto: '2 notas · espelho 2201 · ICMS destacado R$ 1.074,60' },
            { rotulo: 'SPED', texto: '2202 · base 0, ICMS 0' },
            {
              rotulo: 'Livro',
              texto:
                '2.202 = R$ 8.955,00 em "Outras", sem crédito (e outras 6 notas 2.202 com ' +
                'crédito de R$ 7.157,00)',
            },
          ],
          tipo: 'unica',
          opcoes: [
            {
              valor: 'credita',
              texto:
                'Devolução de venda tributada gera crédito do ICMS debitado na saída — essas 2 ' +
                'notas estão escrituradas errado.',
            },
            {
              valor: 'nao_credita',
              texto:
                'Está certo sem crédito — há motivo (CST, venda original sem débito, prazo). ' +
                'Seguir o SPED.',
            },
            {
              valor: 'depende',
              texto: 'Depende do CST/da venda original; o motor deve cruzar com a NF referenciada.',
            },
          ],
          defineNoMotor:
            'regra de crédito em devolução (S14 já exige refNFe) e se o SPED com base 0 é ' +
            'acatado ou apontado.',
          placeholderObs: 'Observação (opcional)',
        },
        {
          id: 'q8',
          numero: 8,
          enunciado: 'Compra escriturada como ativo imobilizado',
          caso: [
            { rotulo: 'XML', texto: '4 notas · espelho 2106 · ICMS R$ 964,09' },
            { rotulo: 'SPED', texto: '2551 ativo imobilizado · base 0' },
            {
              rotulo: 'Livro',
              texto:
                '1.551 + 2.551 = R$ 29.905,79 em "Outras"; CIAP lançado à parte: R$ 39.547,20',
            },
          ],
          tipo: 'unica',
          opcoes: [
            {
              valor: 'ciap',
              texto:
                'Ativo não credita na nota; o crédito é 1/48 via CIAP, informado à mão. Seguir o ' +
                'SPED.',
            },
            { valor: 'nota', texto: 'Creditar na nota.' },
          ],
          defineNoMotor: 'adoção de 1551/2551 e confirmação de que CIAP segue como ajuste manual.',
          placeholderObs: 'Observação (opcional)',
        },
        {
          id: 'q9',
          numero: 9,
          enunciado: 'Saída própria reclassificada pelo SCI: venda a não contribuinte',
          caso: [
            { rotulo: 'XML', texto: '57 notas, 451 itens · a Ouro Preto emitiu tudo como 6102' },
            {
              rotulo: 'SPED',
              texto:
                'C190 separa 6.102 = R$ 1.530.356,75 e 6.108 = R$ 218.778,45 (não contribuinte)',
            },
            { rotulo: 'Motor hoje', texto: 'tudo em 6102; soma bate, linha não' },
          ],
          tipo: 'unica',
          opcoes: [
            {
              valor: 'derivar',
              texto:
                'O motor deriva 6.108 sozinho pelo destinatário do XML (indIEDest = 9), sem ' +
                'olhar o SPED.',
            },
            { valor: 'c190', texto: 'Acatar o C190 do SPED também em saída própria.' },
            {
              valor: 'manter',
              texto: 'Manter o XML e apontar a divergência; o emitente é quem errou.',
            },
          ],
          defineNoMotor:
            'se emissão própria entra na adoção (hoje é barrada) ou ganha derivação própria.',
          placeholderObs: 'Observação (opcional)',
        },
      ],
    },
    {
      codigo: 'C',
      titulo: 'Quando o SPED prejudica o cliente',
      intro:
        'Se o motor passa a seguir o SPED, um SPED errado a desfavor do cliente vira apuração ' +
        '"certa" contra o livro — e o crédito fica na mesa.',
      perguntas: [
        {
          id: 'q10',
          numero: 10,
          enunciado:
            'Mercadoria de revenda escriturada como uso e consumo (1.556). O Centria deve:',
          tipo: 'unica',
          opcoes: [
            { valor: 'p03', texto: 'Só apontar a divergência de CFOP (P03), como hoje.' },
            {
              valor: 'achado_credito',
              texto: 'Gerar achado próprio: "crédito possivelmente não aproveitado", com o valor.',
            },
            { valor: 'bloquear', texto: 'Bloquear o fechamento até a escrituração ser corrigida.' },
          ],
          defineNoMotor: 'se nasce uma família de achados de recuperação de crédito.',
          placeholderObs: 'Como o motor saberia que é revenda? (NCM, histórico, cadastro)',
        },
        {
          id: 'q11',
          numero: 11,
          enunciado: 'Quem corrige um SPED errado?',
          tipo: 'unica',
          opcoes: [
            {
              valor: 'retificar',
              texto: 'O SPED é retificado no SCI e reenviado; o Centria roda de novo.',
            },
            {
              valor: 'operador',
              texto:
                'O operador ajusta o CFOP dentro do Centria, com justificativa, sem mexer no ' +
                'SPED.',
            },
          ],
          defineNoMotor: 'se existe (ou não) ato humano sobre CFOP na plataforma.',
          placeholderObs: 'Observação (opcional)',
        },
      ],
    },
    {
      codigo: 'D',
      titulo: 'Prova do vínculo',
      intro:
        'Acatar o SPED exige certeza de que a linha do SPED é aquela nota. Hoje a adoção item a ' +
        'item exige vínculo UNIQUE com o C170; emissão própria só tem C190.',
      perguntas: [
        {
          id: 'q12',
          numero: 12,
          enunciado:
            'Quando a nota não tem C170 vinculável mas o C190 traz um único CFOP, pode acatar?',
          tipo: 'unica',
          opcoes: [
            {
              valor: 'sim',
              texto: 'Sim — C190 com um só CFOP e valor total conferido é prova suficiente.',
            },
            { valor: 'nao', texto: 'Não — sem C170 item a item, manter o XML.' },
          ],
          defineNoMotor: 'o gate whole_invoice_gate em cfop_adoption.py.',
          placeholderObs: 'Observação (opcional)',
        },
        {
          id: 'q13',
          numero: 13,
          enunciado:
            'Nota com dois CFOPs no C190 (parte 1.102, parte 1.556) e vínculo por item ambíguo:',
          tipo: 'unica',
          opcoes: [
            { valor: 'pendencia', texto: 'Pendência para o operador dizer qual item é qual.' },
            {
              valor: 'rateio',
              texto: 'Ratear pelo C190 (valor por CFOP), sem decidir item a item.',
            },
            { valor: 'xml', texto: 'Manter o XML na nota inteira e avisar.' },
          ],
          defineNoMotor: 'tratamento de AMBIGUOUS (10 itens na Ouro Preto).',
          placeholderObs: 'Observação (opcional)',
        },
      ],
    },
    {
      codigo: 'E',
      titulo: 'Catálogo do regime Compete Atacadista',
      intro:
        'Independente da fonte do CFOP, o classificador precisa saber em que bucket cada CFOP ' +
        'cai. Na Ouro Preto, 3.265 itens ficaram pendentes por CFOP "desconhecido".',
      perguntas: [
        {
          id: 'q14',
          numero: 14,
          enunciado: 'Remessa para venda fora do estabelecimento (5.904) e seu retorno (1.904)',
          caso: [
            {
              rotulo: 'Volume',
              texto:
                '5.904: 231 notas, débito R$ 1.878.611,17 · 1.904: 332 notas, 2.811 itens, ' +
                'crédito R$ 1.792.214,58',
            },
            {
              rotulo: 'Motor hoje',
              texto: '5.904 → FORA (auto) · 1.904 → "desconhecido", 2.811 pendências',
            },
          ],
          tipo: 'unica',
          opcoes: [
            {
              valor: 'fora_par',
              texto:
                'Os dois FORA do regime, sem pendência: débito e crédito se anulam pela natureza ' +
                'da operação.',
            },
            { valor: 'dentro', texto: 'Dentro do regime (compõem a base do benefício).' },
            { valor: 'nao_sei', texto: 'Preciso confirmar na legislação.' },
          ],
          defineNoMotor: 'entrada de 1904/5904 no catálogo atacadista_classifier.py.',
          placeholderObs: 'Observação (opcional)',
        },
        {
          id: 'q15',
          numero: 15,
          enunciado: 'Transferência interna recebida com redução de base (1.152)',
          caso: [
            {
              rotulo: 'Volume',
              texto: '20 notas, 179 itens, crédito R$ 23.579,03 · confiança MEDIUM, pendente',
            },
          ],
          tipo: 'unica',
          opcoes: [
            {
              valor: 'auto',
              texto: 'Sempre SUB_TOTAL 2 (dentro, com redução) — pode aprovar sozinho.',
            },
            {
              valor: 'cst',
              texto: 'Depende do CST/cBenef do item — regra determinística, sem pendência.',
            },
            { valor: 'pendencia', texto: 'Manter pendência: precisa de olhar humano.' },
          ],
          defineNoMotor: 'confiança da decisão para 1152/2152 com redução.',
          placeholderObs: 'Observação (opcional)',
        },
        {
          id: 'q16',
          numero: 16,
          enunciado: 'Transferência interna enviada (5.152): entra no 534-ZZA?',
          caso: [
            {
              rotulo: 'Volume',
              texto:
                '9 notas, 17 itens, débito R$ 31.890,56 · pendente: "confirmar opção pela ' +
                'equiparação"',
            },
          ],
          tipo: 'unica',
          opcoes: [
            { valor: 'sim', texto: 'Sim, sempre.' },
            { valor: 'nao', texto: 'Não, nunca.' },
            {
              valor: 'opcao',
              texto:
                'Só se a empresa formalizou a opção — cadastro por empresa, não pendência por ' +
                'nota.',
            },
          ],
          defineNoMotor: 'opção fiscal por organização (organization_fiscal_options) vs pendência.',
          placeholderObs: 'Observação (opcional)',
        },
        {
          id: 'q17',
          numero: 17,
          enunciado: 'CFOP que o catálogo não conhece: o que o motor faz?',
          tipo: 'unica',
          opcoes: [
            { valor: 'pendencia', texto: 'Pendência item a item para o operador, como hoje.' },
            {
              valor: 'pendencia_cfop',
              texto:
                'Uma pendência por CFOP (não por item): o operador decide uma vez e vale para ' +
                'todos.',
            },
            {
              valor: 'bloquear',
              texto: 'Não publicar resultado até a TI incluir o CFOP no catálogo.',
            },
          ],
          defineNoMotor:
            'granularidade da decisão para "desconhecido" (hoje: 2.811 cliques para o 1.904).',
          placeholderObs: 'Observação (opcional)',
        },
      ],
    },
    {
      codigo: 'F',
      titulo: 'Achados repetidos',
      intro:
        'Uma compra reclassificada para consumo gera hoje três achados na mesma nota: P03 ' +
        '(CFOP), P04 (ICMS difere) e P05 (base difere) — porque o SCI escritura consumo com ' +
        'base 0.',
      perguntas: [
        {
          id: 'q18',
          numero: 18,
          enunciado:
            'P04 e P05 quando o SPED escriturou sem crédito por CFOP de consumo/serviço/ativo:',
          caso: [
            {
              rotulo: 'Volume',
              texto:
                'P04: 128 CRITICAL, R$ 9.340,70 · P05: 130 WARNING, R$ 78.483,06 · quase todos ' +
                'neste padrão',
            },
          ],
          tipo: 'unica',
          opcoes: [
            {
              valor: 'suprimir',
              texto: 'Suprimir: base 0 é o esperado nesses CFOPs; o P03 já cobre.',
            },
            { valor: 'info', texto: 'Manter como INFO.' },
            { valor: 'manter', texto: 'Manter como está.' },
          ],
          defineNoMotor: 'condição de disparo de P04/P05 em função do CFOP do SPED.',
          placeholderObs: 'Observação (opcional)',
        },
        {
          id: 'q19',
          numero: 19,
          enunciado: 'Agrupar P03 + P04 + P05 da mesma nota num achado só?',
          tipo: 'unica',
          opcoes: [
            { valor: 'sim', texto: 'Sim — um achado por nota, com os três fatos dentro.' },
            { valor: 'nao', texto: 'Não — cada regra é um achado; o operador filtra.' },
          ],
          defineNoMotor: 'publicação por família (P) e o que o operador vê na estação.',
          placeholderObs: 'Observação (opcional)',
        },
      ],
    },
    {
      codigo: 'G',
      titulo: 'Fontes',
      perguntas: [
        {
          id: 'q20',
          numero: 20,
          enunciado: 'SPED original × retificado',
          caso: [
            {
              rotulo: 'Ouro Preto',
              texto:
                'arquivo enviado: "Remessa de arquivo original", E110 = R$ 217.852,71 · livro ' +
                'retificado = R$ 221.699,72 (FEEF R$ 3.865,42 só entrou na retificação)',
            },
          ],
          tipo: 'unica',
          opcoes: [
            { valor: 'recente', texto: 'Usar o SPED mais recente enviado, seja qual for.' },
            {
              valor: 'exigir',
              texto: 'Se existe retificação, exigir o retificado; original só serve antes da entrega.',
            },
            {
              valor: 'avisar',
              texto: 'Aceitar qualquer um e avisar a finalidade (COD_FIN) no resultado.',
            },
          ],
          defineNoMotor: 'regra D6 (fonte vigente por COD_FIN) e o que a tela declara.',
          placeholderObs: 'Observação (opcional)',
        },
        {
          id: 'q21',
          numero: 21,
          enunciado:
            'CT-e emitido pela empresa (6.353 = R$ 14.791,68; 6.932 = R$ 1.954,44 de débito): ' +
            'entra na apuração?',
          caso: [
            {
              rotulo: 'Hoje',
              texto:
                'o motor não leva o bloco D à linha 001; é exatamente a diferença de débito ' +
                'contra o livro (R$ 16.746,12)',
            },
          ],
          tipo: 'unica',
          opcoes: [
            { valor: 'sim', texto: 'Sim — débito do D190 soma na linha 001, e o estorno do 6.932 na 007.' },
            {
              valor: 'nao',
              texto: 'Não — CT-e fica só na conferência (regras T); apuração é só NF-e.',
            },
          ],
          defineNoMotor: 'escopo do assessment_calculator e do livro.',
          placeholderObs: 'Observação (opcional)',
        },
      ],
    },
    {
      codigo: 'H',
      titulo: 'Observações gerais',
      perguntas: [],
      observacoesGerais: {
        placeholder:
          'Casos que não couberam acima, ressalvas, base legal que devemos citar no código',
      },
    },
  ],
};

/** Todos os questionários disponíveis. A ordem é a que a tela lista. */
export const QUESTIONARIOS: QuestionarioDefinicao[] = [CFOP_XML_OU_SPED];

/** Prefixo das chaves de observação por pergunta dentro do JSON de respostas. */
export const PREFIXO_OBSERVACAO = 'obs:';

/** Tamanho máximo de qualquer campo de texto livre (observação ou resposta). */
export const TEXTO_MAX = 4000;

/** A definição pelo slug, ou `null` quando o slug não existe. */
export function questionarioPorSlug(slug: string): QuestionarioDefinicao | null {
  return QUESTIONARIOS.find((q) => q.slug === slug) ?? null;
}

/** Todas as perguntas de um questionário, achatadas na ordem das seções. */
export function perguntasDe(questionario: QuestionarioDefinicao): PerguntaDefinicao[] {
  return questionario.secoes.flatMap((s) => s.perguntas);
}

/** O resumo que a listagem mostra. */
export function resumirQuestionario(questionario: QuestionarioDefinicao): QuestionarioResumo {
  return {
    slug: questionario.slug,
    titulo: questionario.titulo,
    versao: questionario.versao,
    totalPerguntas: perguntasDe(questionario).length,
  };
}

/** Todos os resumos, para `GET /api/fiscal/questionarios`. */
export function listarQuestionarios(): QuestionarioResumo[] {
  return QUESTIONARIOS.map(resumirQuestionario);
}
