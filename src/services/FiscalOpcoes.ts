/**
 * As três listas fechadas da ficha fiscal — o que era a aba AUX da planilha.
 *
 * Fonte única: a tela lê estes valores por `/api/fiscal/opcoes` para montar os
 * selects, e o backend usa os MESMOS arrays para validar o que chega no PATCH.
 * Se a lista viesse de uma tabela e a validação daqui, as duas poderiam
 * discordar em silêncio — a tela ofereceria uma opção que o backend recusa.
 *
 * A particularidade não está aqui de propósito: é o único campo de texto livre.
 */

/** Perfil da empresa. Da aba AUX, sem a linha '.' que era sujeira da planilha. */
export const PERFIS = ['Serviço', 'Comércio', 'Indústria'] as const;

/**
 * Faixas de volume de notas fiscais.
 *
 * Os rótulos são os da planilha, com o espaço duplo de '500  - 999' corrigido.
 * Note que a formatação de milhar é inconsistente na origem ('1000 - 4999' mas
 * '5000 - 9.999'): mantida como está, porque é assim que o time lê as faixas e
 * mudar agora invalidaria comparação com o que já foi preenchido na planilha.
 */
export const VOLUMES_NF = [
  // Primeiro da escala: empresa que não emite nota nenhuma. Não é o mesmo que
  // "0 - 499", que é volume baixo de quem opera — e é diferente de deixar o
  // campo vazio, que continua significando "ainda não respondi".
  'Sem Movimento',
  '0 - 499',
  '500 - 999',
  '1000 - 4999',
  '5000 - 9.999',
  '10.000 - 19.999',
  '> 20.000',
] as const;

/**
 * Quem transmite o SPED Fiscal.
 *
 * Não é um sim/não: empresa obrigada ao SPED sempre envia, e o que o time
 * precisa saber é de quem é a mão. "Sim" saiu da lista por ser exatamente a
 * soma das duas primeiras opções — mantê-lo deixaria o mesmo fato ser gravado
 * de três jeitos, que é o que uma lista fechada existe para impedir.
 */
export const OPCOES_SPED = ['Feito no Escritório', 'Enviado pelo Cliente', 'Não'] as const;

export type Perfil = (typeof PERFIS)[number];
export type VolumeNf = (typeof VOLUMES_NF)[number];
export type OpcaoSped = (typeof OPCOES_SPED)[number];

/** Tamanho máximo da particularidade — igual ao VARCHAR(500) da coluna. */
export const PARTICULARIDADE_MAX = 500;

/**
 * Aceita o valor exato da lista, ou `null` para "ainda não respondido".
 *
 * Deliberadamente estrito: sem normalizar acento, caixa ou espaço. Uma tela que
 * manda 'servico' em vez de 'Serviço' está com bug, e aceitar calado gravaria
 * duas grafias do mesmo perfil no banco — exatamente o problema que a planilha
 * sem validação criava.
 */
export function valorValido<T extends readonly string[]>(
  lista: T,
  valor: unknown
): valor is T[number] | null {
  if (valor === null || valor === undefined || valor === '') return true;
  return typeof valor === 'string' && (lista as readonly string[]).includes(valor);
}

/** Vazio e `undefined` viram NULL: "não respondido" tem uma representação só. */
export function normalizarOpcao(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  return texto === '' ? null : texto;
}

/** Todas as listas, no formato que a tela consome. */
export function opcoesFicha() {
  return {
    perfis: [...PERFIS],
    volumesNf: [...VOLUMES_NF],
    opcoesSped: [...OPCOES_SPED],
    particularidadeMax: PARTICULARIDADE_MAX,
  };
}
