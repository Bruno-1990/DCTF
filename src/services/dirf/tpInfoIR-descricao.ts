/**
 * Mapa de códigos tpInfoIR (eSocial S-5002) para descrição da verba.
 * Fonte: S-5002_evtIrrfBenef.xsd - enumeração do elemento infoIR/tpInfoIR.
 */

export const TP_INFO_IR_DESCRICAO: Record<string, string> = {
  '11': 'Rendimentos tributáveis – Remuneração mensal',
  '12': '13º salário',
  '14': 'PLR',
  '31': 'Retenções do IRRF – Remuneração mensal',
  '32': 'Retenções do IRRF – 13º salário',
  '34': 'Retenções do IRRF – PLR',
  '41': 'Deduções – Previdência Social Oficial (PSO) – Remuneração mensal',
  '42': 'PSO – 13º salário',
  '46': 'Previdência complementar – Salário mensal',
  '47': 'Previdência complementar – 13º salário',
  '51': 'Pensão alimentícia – Remuneração mensal',
  '52': 'Pensão alimentícia – 13º salário',
  '54': 'Pensão alimentícia – PLR',
  '61': 'FAPI – Remuneração mensal',
  '62': 'FAPI – 13º salário',
  '63': 'Fundação previdência complementar servidor público – Mensal',
  '64': 'Fundação previdência complementar servidor público – 13º',
  '67': 'Plano privado coletivo de assistência à saúde',
  '67_titular': 'Plano de saúde – Titular',
  '67_dependente': 'Plano de saúde – Dependente',
  '68': 'Desconto simplificado mensal',
  '70': 'Parcela isenta 65 anos – Remuneração mensal',
  '71': 'Parcela isenta 65 anos – 13º salário',
  '72': 'Diárias',
  '73': 'Ajuda de custo',
  '74': 'Indenização e rescisão (PDV, acidentes)',
  '75': 'Abono pecuniário',
  '76': 'Moléstia grave – Remuneração mensal',
  '77': 'Moléstia grave – 13º salário',
  '79': 'Outras isenções',
  '700': 'Auxílio moradia',
  '701': 'Parte não tributável – transporte passageiros/cargas',
  '702': 'Bolsa médico residente – mensal',
  '703': 'Bolsa médico residente – 13º',
  '704': 'Juros de mora',
  '7900': 'Verba diversa (convênio, consignações, etc.)',
  '7950': 'Rendimento não tributável (compatibilidade)',
  '7951': 'Rendimento não tributável – bitributação',
  '7952': 'Rendimento tributável – RRA',
  '7953': 'Retenção de IR – RRA',
  '7954': 'PSO – RRA',
  '7955': 'Pensão alimentícia – RRA',
  '7956': 'Valores MEI/EPP (exceto pró-labore e aluguéis)',
  '7957': 'Depósito judicial',
  '7958': 'Compensação judicial – ano-calendário',
  '7959': 'Compensação judicial – anos anteriores',
  '7960': 'Exigibilidade suspensa – Remuneração mensal',
  '7961': 'Exigibilidade suspensa – 13º',
  '7962': 'Exigibilidade suspensa – Férias',
  '7963': 'Exigibilidade suspensa – PLR',
  '7964': 'Exigibilidade suspensa – RRA',
  '9011': 'Exig. suspensa – Rend. tributável – Mensal',
  '9012': 'Exig. suspensa – 13º',
  '9014': 'Exig. suspensa – PLR',
  '9031': 'Exig. suspensa – Retenção IR – Mensal',
  '9032': 'Exig. suspensa – Retenção IR – 13º',
  '9034': 'Exig. suspensa – Retenção IR – PLR',
  '9041': 'Exig. suspensa – PSO – Mensal',
  '9042': 'Exig. suspensa – PSO – 13º',
  '9046': 'Exig. suspensa – Previdência complementar – Mensal',
  '9047': 'Exig. suspensa – Previdência complementar – 13º',
  '9051': 'Exig. suspensa – Pensão alimentícia – Mensal',
  '9052': 'Exig. suspensa – Pensão alimentícia – 13º',
  '9054': 'Exig. suspensa – Pensão alimentícia – PLR',
  '9061': 'Exig. suspensa – FAPI – Mensal',
  '9062': 'Exig. suspensa – FAPI – 13º',
  '9063': 'Exig. suspensa – Fund. prev. serv. público – Mensal',
  '9064': 'Exig. suspensa – Fund. prev. serv. público – 13º',
  '9067': 'Exig. suspensa – Plano saúde',
  '9067_titular': 'Exig. suspensa – Plano saúde – Titular',
  '9067_dependente': 'Exig. suspensa – Plano saúde – Dependente',
  '9082': 'Compensação judicial – ano-calendário',
  '9083': 'Compensação judicial – anos anteriores',
  '9831': 'Depósito judicial – Mensal',
  '9832': 'Depósito judicial – 13º',
  '9834': 'Depósito judicial – PLR',
};

/** Prefixo de chave para verba diversa destrinchada por descRendimento (XSD: infoIR/descRendimento ← dscRubr S-1010). */
const VERBA_DIVERSA_PREFIX = '7900_';

/**
 * Humaniza sufixo normalizado (ex.: convenio_farmacia → Convenio farmacia).
 */
function humanizeSuffix(suffix: string): string {
  return suffix
    .split('_')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

/**
 * Retorna a descrição da verba para um código tpInfoIR.
 * Suporta códigos compostos (ex.: 67_titular, 67_dependente, 7900_convenio_farmacia).
 * Para 7900_<suffix>, exibe "Verba diversa – <descrição>" conforme tag descRendimento do XSD.
 * Se não existir no mapa, retorna o código como string.
 */
export function descricaoTpInfoIR(codigo: string | number): string {
  const key = String(codigo);
  if (TP_INFO_IR_DESCRICAO[key]) return TP_INFO_IR_DESCRICAO[key];
  if (key.startsWith(VERBA_DIVERSA_PREFIX)) {
    const suffix = key.slice(VERBA_DIVERSA_PREFIX.length);
    if (suffix) return `Verba diversa – ${humanizeSuffix(suffix)}`;
  }
  const base = key.replace(/_titular$|_dependente$/, '');
  const baseDesc = TP_INFO_IR_DESCRICAO[base];
  if (baseDesc && key.endsWith('_titular')) return `${baseDesc} – Titular`;
  if (baseDesc && key.endsWith('_dependente')) return `${baseDesc} – Dependente`;
  return key;
}
