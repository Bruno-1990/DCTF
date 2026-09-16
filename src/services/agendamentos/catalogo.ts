/**
 * Catálogo dos agendamentos e dos disparos de e-mail.
 *
 * É a fonte da verdade do painel: o que aparece na tela sai daqui, não de
 * cadastro manual. Agendou coisa nova? Acrescente uma entrada aqui e ela já
 * nasce no painel, com horário editável e destinatários editáveis.
 *
 * O teste tests/architecture/agendamentos-catalogo.test.ts recusa o commit se
 * um agendador iniciado no server.ts ficar de fora — é o que impede o painel de
 * envelhecer em silêncio.
 *
 * Os valores em `padrao` e `envAtivo` NÃO são a configuração em vigor: servem
 * só para semear a tabela `agendamentos` na primeira subida, preservando o que
 * já estava no .env. Depois disso, quem manda é o banco (e a tela).
 */
import type { AgendamentoCatalogo } from './tipos';

export const CATALOGO: AgendamentoCatalogo[] = [
  {
    id: 'cota-aprendizagem',
    nome: 'Cota de Aprendizagem',
    descricao:
      'Atualiza o cadastro pela ReceitaWS, apura o faturamento no SCI, classifica o porte de cada cliente e envia os dois avisos do mês.',
    tipo: 'mensal',
    arquivoScheduler: 'src/services/CotaAprendizagemScheduler.ts',
    editavel: true,
    envAtivo: 'COTA_SCHEDULER_ENABLED',
    log: {
      tabela: 'cota_aviso_log',
      colunaInicio: 'enviado_em',
      colunaFim: null,
      colunaErro: null,
    },
    executarAgora: true,
    listasEmail: [
      {
        chave: 'enquadramento',
        rotulo: 'Aviso de enquadramento de porte',
        quando: 'Na apuração mensal, para quem mudou de porte (ME, EPP ou demais).',
        envLegado: 'ENQUADRAMENTO_ALERT_EMAILS',
        padrao: ['ti@central-rnc.com.br'],
      },
      {
        chave: 'cota',
        rotulo: 'Aviso da cota de aprendizagem',
        quando: 'Na mesma apuração, com os clientes obrigados à cota.',
        envLegado: 'COTA_ALERT_EMAILS',
        padrao: ['ti@central-rnc.com.br'],
      },
    ],
  },
  {
    id: 'reoa-substituto',
    nome: 'REOA (grupo Substituto)',
    descricao:
      'Coleta no SCI o faturamento dos 12 meses fechados dos clientes do grupo e avisa quem ficou abaixo de R$ 300 mil.',
    tipo: 'mensal',
    arquivoScheduler: 'src/services/SubstitutoScheduler.ts',
    editavel: true,
    envAtivo: 'REOA_SCHEDULER_ENABLED',
    log: {
      tabela: 'reoa_execucao_log',
      colunaInicio: 'iniciado_em',
      colunaFim: 'concluido_em',
      colunaErro: null,
    },
    executarAgora: true,
    listasEmail: [
      {
        chave: 'reoa',
        rotulo: 'Aviso de faturamento abaixo do limite',
        quando: 'Depois da coleta mensal, quando há cliente abaixo de R$ 300 mil.',
        envLegado: 'SUBSTITUTO_ALERT_EMAILS',
        padrao: ['fiscal@central-rnc.com.br', 'leg@central-rnc.com.br'],
      },
    ],
  },
  {
    id: 'det-procuracoes',
    nome: 'DET — procurações',
    descricao:
      'Faz o login gov.br no SPE e atualiza quem tem procuração. Roda à noite, separado da coleta das caixas, para não disparar o antiabuse com dois logins seguidos.',
    tipo: 'semanal',
    arquivoScheduler: 'src/services/DetScheduler.ts',
    editavel: true,
    envAtivo: 'DET_SCHEDULER_ENABLED',
    log: {
      tabela: 'det_coletas',
      colunaInicio: 'iniciado_em',
      colunaFim: 'concluido_em',
      colunaErro: 'mensagem_erro',
    },
    executarAgora: false,
    listasEmail: [],
  },
  {
    id: 'det-caixas',
    nome: 'DET — caixas postais',
    descricao:
      'Varre as caixas postais do DET usando a lista de procurações da véspera. Termina antes do expediente para o Departamento Pessoal já encontrar a tela pronta.',
    tipo: 'semanal',
    arquivoScheduler: 'src/services/DetScheduler.ts',
    editavel: true,
    envAtivo: 'DET_SCHEDULER_ENABLED',
    log: {
      tabela: 'det_coletas',
      colunaInicio: 'iniciado_em',
      colunaFim: 'concluido_em',
      colunaErro: 'mensagem_erro',
    },
    executarAgora: true,
    listasEmail: [],
  },
  {
    id: 'lancamentos-sci',
    nome: 'Lançamentos (SCI)',
    descricao:
      'Sincroniza a competência anterior do SCI para a tabela host_dados — o mesmo que o botão "Atualizar" da aba Lançamentos faz.',
    tipo: 'diario',
    arquivoScheduler: 'src/services/HostDadosScheduler.ts',
    editavel: true,
    envAtivo: 'HOST_DADOS_SCHEDULER_ENABLED',
    log: {
      tabela: 'host_dados_sync_log',
      colunaInicio: 'iniciado_em',
      colunaFim: 'concluido_em',
      colunaErro: 'erro',
    },
    executarAgora: true,
    listasEmail: [],
  },
  {
    id: 'darf-lote',
    nome: 'DARF em lote (Acessórias)',
    descricao:
      'Emite o DARF previdenciário de todos os clientes do lote, grava os PDFs na pasta de rede da Acessórias e manda o relatório ao Departamento Pessoal.',
    tipo: 'mensal',
    arquivoScheduler: 'src/services/DarfLoteScheduler.ts',
    editavel: true,
    envAtivo: 'DARF_LOTE_ENABLED',
    /*
     * Passou a ser agendado AQUI em 16/09/2026, a pedido: antes quem disparava
     * era o Server Manager (porta 9000), chamando `npm run darf:lote`.
     *
     * A troca é uma só e não admite meio-termo: a tarefa `darf-lote-acessorias`
     * do Server Manager foi para `"habilitada": false` no port-registry.json no
     * mesmo movimento. Os dois ligados produzem duas execuções e dois e-mails ao
     * DP no mesmo dia — a segunda rodada reaproveita as guias da primeira, então
     * não sai guia duplicada, mas o DP recebe o relatório duas vezes.
     */
    alerta:
      'Este lote é agendado aqui desde 16/09/2026. A tarefa equivalente no Server Manager (porta 9000) foi desativada no mesmo dia — não reative lá sem desligar aqui, senão o Departamento Pessoal recebe o relatório duas vezes.',
    log: {
      tabela: 'darf_lote_execucoes',
      colunaInicio: 'iniciado_em',
      colunaFim: 'concluido_em',
      colunaErro: 'email_erro',
    },
    executarAgora: false,
    listasEmail: [
      {
        chave: 'darf-lote',
        rotulo: 'Relatório do lote de DARF',
        quando: 'Ao fim de cada rodada do lote, com o resumo das guias emitidas.',
        envLegado: 'DARF_LOTE_EMAILS',
        padrao: ['dp@central-rnc.com.br'],
      },
    ],
  },
  {
    id: 'aviso-ficha-fiscal',
    nome: 'Aviso da Ficha Fiscal',
    descricao:
      'E-mail com as fichas fiscais que faltam preencher. Não tem horário: sai quando alguém clica em "Enviar aviso" na tela Fiscal.',
    tipo: 'sob-demanda',
    arquivoScheduler: null,
    editavel: false,
    envAtivo: null,
    log: null,
    executarAgora: false,
    listasEmail: [
      {
        chave: 'fiscal',
        rotulo: 'Fichas fiscais pendentes',
        quando: 'Ao clicar em "Enviar aviso" na tela Fiscal.',
        envLegado: 'FISCAL_ALERT_EMAILS',
        padrao: ['fiscal@central-rnc.com.br'],
      },
    ],
  },
  {
    id: 'aviso-registros-oficiais',
    nome: 'Aviso de registros oficiais em aberto',
    descricao:
      'E-mail com as DCTFs que seguem "Em andamento". Disparado por botão na tela de DCTF; o destinatário é escolhido na hora do envio.',
    tipo: 'sob-demanda',
    arquivoScheduler: null,
    editavel: false,
    envAtivo: null,
    log: null,
    executarAgora: false,
    listasEmail: [
      {
        chave: 'registros-oficiais',
        rotulo: 'Destinatários padrão',
        quando: 'Sugeridos na tela; hoje o endereço é digitado a cada envio.',
        envLegado: null,
        padrao: [],
      },
    ],
  },
  {
    id: 'aviso-sem-dctf-com-movimento',
    nome: 'Aviso de clientes com movimento e sem DCTF',
    descricao:
      'E-mail da conferência de clientes que tiveram movimento mas não têm DCTF. Disparado por botão na tela de Conferências.',
    tipo: 'sob-demanda',
    arquivoScheduler: null,
    editavel: false,
    envAtivo: null,
    log: null,
    executarAgora: false,
    listasEmail: [
      {
        chave: 'sem-dctf',
        rotulo: 'Destinatários padrão',
        quando: 'Sugeridos na tela; hoje o endereço é digitado a cada envio.',
        envLegado: null,
        padrao: [],
      },
    ],
  },
];

/** Busca por id — usado pelas rotas antes de qualquer escrita. */
export function buscarNoCatalogo(id: string): AgendamentoCatalogo | undefined {
  return CATALOGO.find((c) => c.id === id);
}

export default CATALOGO;
