/**
 * Regras puras da sincronização SCI → host_dados (aba Clientes > Lançamentos).
 *
 * Sem banco e sem Firebird, para ser testável sem carregar nada — o
 * HostDadosSciService consome daqui.
 *
 * DE ONDE VEIO CADA REGRA. A sincronização rodava num script Python externo
 * (Documents\export\Automatico) que sumiu da máquina sem deixar fonte. As regras
 * abaixo foram reconstruídas contra o que ele gravou em host_dados (07/2026 como
 * gabarito, conferido também em 03, 05 e 06/2026):
 *
 *   FISE  notas de ENTRADA do mês (data de entrada), por espécie, sem canceladas
 *   FISS  notas de SAÍDA do mês (data de saída), por espécie, sem canceladas
 *   CTB   lançamentos contábeis do mês (data do lançamento)
 *   FPG   admissões + rescisões do mês — não é contagem de funcionários: empresa
 *         com 94 colaboradores na folha tinha FPG = 10 no gabarito
 *
 * Fiscal e contábil bateram exatos onde o SCI não mudou desde a extração antiga;
 * as diferenças restantes são lançamentos feitos depois dela. No FPG, rescisões
 * pela tabela de rescisões (data da rescisão) acertaram mais meses que pela view
 * de movimentações, que não traz todas.
 */

export interface Competencia {
  ano: number;
  mes: number;
}

export type Relatorio = 'FISE' | 'FISS' | 'CTB' | 'FPG';

/** Uma linha de host_dados, pronta para INSERT. */
export interface LinhaHostDados {
  cod_emp: number;
  razao: string;
  cnpj: string;
  ano: number;
  mes: number;
  movimentacao: number;
  tipo: string;
  relatorio: Relatorio;
  especie: string | null;
}

export interface EmpresaSci {
  razao: string;
  cnpj: string;
}

/** Resultado bruto das consultas ao SCI de UM mês. */
export interface ContagensSci {
  /** [codEmpresa, espécie, quantidade] */
  entradas: Array<[number, string | null, number]>;
  saidas: Array<[number, string | null, number]>;
  /** [codEmpresa, quantidade] */
  contabil: Array<[number, number]>;
  admissoes: Array<[number, number]>;
  rescisoes: Array<[number, number]>;
}

/** `host_dados.tipo` é VARCHAR(10); a espécie vai nele para FISE/FISS. */
const TAMANHO_TIPO = 10;
const ESPECIE_VAZIA = 'OUTROS';

/** Competência anterior à data (o que o botão "Atualizar" sincroniza). */
export function mesAnterior(agora: Date): Competencia {
  const mes = agora.getMonth() + 1;
  return mes === 1 ? { ano: agora.getFullYear() - 1, mes: 12 } : { ano: agora.getFullYear(), mes: mes - 1 };
}

/** Primeiro e último dia do mês, em `YYYY-MM-DD` (formato aceito pelo Firebird). */
export function limitesDoMes({ ano, mes }: Competencia): { ini: string; fim: string } {
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const mm = String(mes).padStart(2, '0');
  return { ini: `${ano}-${mm}-01`, fim: `${ano}-${mm}-${String(ultimoDia).padStart(2, '0')}` };
}

/**
 * Meses tocados pelo intervalo, do primeiro ao último.
 *
 * host_dados é mensal e cada sincronização SUBSTITUI o mês inteiro. Um
 * intervalo que corta um mês ao meio (10 a 20/07) não pode gravar só esses
 * dias: apagaria o resto de julho. Então o intervalo vira meses completos.
 */
export function mesesDoIntervalo(dataIni: string, dataFim: string): Competencia[] {
  const re = /^(\d{4})-(\d{2})-\d{2}$/;
  const a = re.exec(dataIni);
  const b = re.exec(dataFim);
  if (!a || !b) throw new Error('Datas devem estar no formato YYYY-MM-DD');
  let ano = Number(a[1]);
  let mes = Number(a[2]);
  const fimAno = Number(b[1]);
  const fimMes = Number(b[2]);
  if (mes < 1 || mes > 12 || fimMes < 1 || fimMes > 12) throw new Error('Mês inválido nas datas informadas');
  // YYYY-MM-DD compara certo como texto — inclusive o dia, dentro do mesmo mês.
  if (dataIni > dataFim) throw new Error('Data inicial não pode ser maior que data final');

  const meses: Competencia[] = [];
  while (ano * 100 + mes <= fimAno * 100 + fimMes) {
    meses.push({ ano, mes });
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return meses;
}

function somar(mapa: Map<string, number>, chave: string, n: number): void {
  mapa.set(chave, (mapa.get(chave) || 0) + n);
}

/**
 * Transforma as contagens do SCI nas linhas de host_dados de uma competência.
 *
 * Só entra quem teve movimento (> 0), como no script antigo. Empresa que não
 * está no cadastro do SCI ainda entra — perder o movimento é pior que gravar
 * sem razão social —, com o código no lugar do nome.
 */
export function montarLinhas(
  comp: Competencia,
  contagens: ContagensSci,
  empresas: Map<number, EmpresaSci>
): LinhaHostDados[] {
  const fiscal = new Map<string, number>(); // "rel|cod|especie" → n
  for (const [rel, linhas] of [
    ['FISE', contagens.entradas],
    ['FISS', contagens.saidas],
  ] as const) {
    for (const [cod, especie, n] of linhas) {
      const esp = String(especie ?? '').trim() || ESPECIE_VAZIA;
      somar(fiscal, `${rel}|${cod}|${esp}`, Number(n) || 0);
    }
  }

  const fpg = new Map<string, number>();
  for (const [cod, n] of [...contagens.admissoes, ...contagens.rescisoes]) somar(fpg, String(cod), Number(n) || 0);

  const linha = (
    cod: number,
    relatorio: Relatorio,
    especie: string | null,
    movimentacao: number
  ): LinhaHostDados => {
    const emp = empresas.get(cod);
    return {
      cod_emp: cod,
      razao: emp?.razao || `EMPRESA ${cod}`,
      cnpj: emp?.cnpj || '',
      ano: comp.ano,
      mes: comp.mes,
      movimentacao,
      tipo: (especie ?? relatorio).slice(0, TAMANHO_TIPO),
      relatorio,
      especie,
    };
  };

  const linhas: LinhaHostDados[] = [];
  for (const [chave, n] of fiscal) {
    const [rel, cod, esp] = chave.split('|');
    linhas.push(linha(Number(cod), rel as Relatorio, esp, n));
  }
  for (const [cod, n] of contagens.contabil) linhas.push(linha(Number(cod), 'CTB', null, Number(n) || 0));
  for (const [cod, n] of fpg) linhas.push(linha(Number(cod), 'FPG', null, n));

  return linhas.filter((l) => l.movimentacao > 0);
}

/** Cadastro de empresas do SCI indexado por código, CNPJ só com dígitos. */
export function indexarEmpresas(rows: Array<[number, string | null, string | null]>): Map<number, EmpresaSci> {
  const mapa = new Map<number, EmpresaSci>();
  for (const [cod, nome, cnpj] of rows) {
    mapa.set(Number(cod), {
      razao: String(nome ?? '').trim(),
      cnpj: String(cnpj ?? '').replace(/\D/g, ''),
    });
  }
  return mapa;
}
