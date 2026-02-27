/**
 * Base legal e regras de conferência DCTF
 *
 * Centraliza referências à legislação vigente (Lei 10.168/2000, IN RFB, prazos)
 * para manutenção e auditoria. Usado pelo ConferenceModulesService e pelos
 * componentes de conferência no frontend.
 */

export interface BaseLegal {
  norma: string;
  descricao: string;
}

/** Competência vigente: mês anterior à data atual (regra administrativa RFB). */
export const COMPETENCIA_VIGENTE_DESCRICAO =
  'Competência vigente é o mês anterior à data atual. A DCTF refere-se aos fatos geradores do mês de apuração.';

/** Vencimento: último dia útil do mês seguinte à competência. */
export const VENCIMENTO_NORMA = 'Instrução Normativa RFB (prazo de entrega)';
export const VENCIMENTO_DESCRICAO =
  'O prazo para entrega da DCTF é o último dia útil do mês seguinte ao da competência.';

/** Dispensa: Original sem movimento – IN RFB 2.237/2024. */
export const DISPENSA_ORIGINAL_SEM_MOVIMENTO: BaseLegal = {
  norma: 'IN RFB 2.237/2024, Art. 3º, § 3º',
  descricao:
    'Após transmitir DCTF "Original sem movimento", o declarante fica dispensado de transmitir nas competências seguintes até que haja movimentação que exija nova declaração.',
};

/** Obrigatoriedade geral e multa por atraso. */
export const MULTA_ATRASO: BaseLegal = {
  norma: 'Lei 10.168/2000',
  descricao:
    'A transmissão em atraso da DCTF pode sujeitar o declarante a multa conforme legislação vigente.',
};

/** Base legal por tipo de conferência (para API e frontend). */
export const BASE_LEGAL_SEM_DCTF_VIGENTE: BaseLegal = {
  norma: 'Lei 10.168/2000 e IN RFB (prazo)',
  descricao: `Obrigatoriedade de entrega da DCTF. ${VENCIMENTO_DESCRICAO}`,
};

export const BASE_LEGAL_SEM_DCTF_COM_MOVIMENTO: BaseLegal = {
  norma: 'Lei 10.168/2000',
  descricao:
    'Quando há movimentação tributária na competência, o declarante deve transmitir a DCTF dentro do prazo (último dia útil do mês seguinte).',
};

export const BASE_LEGAL_FORA_DO_PRAZO: BaseLegal = MULTA_ATRASO;

export const BASE_LEGAL_PERIODO_INCONSISTENTE: BaseLegal = {
  norma: 'Instrução Normativa RFB (DCTF)',
  descricao:
    'O período de apuração da declaração deve corresponder à competência dos fatos geradores. Inconsistência pode exigir retificação.',
};

export const BASE_LEGAL_SEM_MOVIMENTACAO: BaseLegal = {
  norma: 'Informativo',
  descricao:
    'Cliente sem movimentação recente. Verificar se há dispensa (ex.: IN RFB 2.237/2024 – Original sem movimento) ou se deve transmitir DCTF.',
};

export const BASE_LEGAL_HISTORICO_ATRASO: BaseLegal = {
  norma: 'Lei 10.168/2000',
  descricao:
    'Histórico de transmissões em atraso. Recomenda-se regularizar e evitar novos atrasos para não incorrer em multas.',
};

export const BASE_LEGAL_EM_ANDAMENTO: BaseLegal = {
  norma: 'Informativo',
  descricao:
    'DCTFs com situação "Em andamento" aguardam processamento ou conclusão na Receita Federal.',
};

export const BASE_LEGAL_DISPENSADOS: BaseLegal = DISPENSA_ORIGINAL_SEM_MOVIMENTO;

/** Recomendações por tipo de conferência ("O que fazer"). */
export function getRecomendacaoSemDCTFVigente(competencia: string, vencimentoFormatado: string): string {
  return `Transmitir DCTF da competência ${competencia} até ${vencimentoFormatado}, ou verificar se há dispensa (ex.: IN RFB 2.237/2024 – Original sem movimento).`;
}

export const RECOMENDACAO_SEM_DCTF_COM_MOVIMENTO =
  'Transmitir a DCTF da competência indicada até o vencimento. Cliente com movimentação tem obrigação de declarar.';

export const RECOMENDACAO_FORA_DO_PRAZO =
  'Regularizar a transmissão em atraso. Transmissão após o prazo pode sujeitar a multa conforme Lei 10.168/2000.';

export const RECOMENDACAO_PERIODO_INCONSISTENTE =
  'Conferir o período de apuração da declaração e retificar se necessário para que corresponda à competência correta.';

export const RECOMENDACAO_SEM_MOVIMENTACAO =
  'Conferir se o cliente está dispensado (ex.: já transmitiu Original sem movimento) ou se deve enviar DCTF para a competência vigente.';

export const RECOMENDACAO_HISTORICO_ATRASO =
  'Acompanhar prazos e evitar novas transmissões em atraso. Regularizar pendências quando houver.';

export const RECOMENDACAO_EM_ANDAMENTO =
  'Acompanhar o processamento das DCTFs em andamento na Receita Federal. Não é necessária ação até a conclusão ou eventual exigência.';

export const RECOMENDACAO_DISPENSADOS =
  'Nenhuma ação necessária. Cliente dispensado de transmitir na competência vigente em razão da IN RFB 2.237/2024 (Original sem movimento).';
