/**
 * FiscalQuestionarioService — leitura e gravação das respostas do questionário.
 *
 * A definição das perguntas NÃO está aqui: vive em FiscalQuestionarios.ts, e é
 * contra ela que toda resposta é validada. Este arquivo só guarda e devolve o
 * que cada colaborador marcou.
 *
 * O formato gravado é um JSON único por (questionário, colaborador):
 *
 *     { "q1": "sped_sempre", "q2": ["1126","1653"], "obs:q1": "texto livre" }
 *
 * Uma coluna por pergunta seria 21 colunas e uma migration a cada enunciado
 * novo. Como a validação já é feita contra a definição em código antes do
 * INSERT, o JSON não é "campo solto": nada entra que a definição não preveja.
 */

import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { mysqlPool } from '../config/mysql';
import { ErroValidacao } from './FiscalFichaService';
import {
  PREFIXO_OBSERVACAO,
  TEXTO_MAX,
  listarQuestionarios,
  perguntasDe,
  questionarioPorSlug,
} from './FiscalQuestionarios';
import type { QuestionarioDefinicao, QuestionarioResumo } from './FiscalQuestionarios';

/** Valor de uma pergunta: string (única/texto) ou array de strings (múltipla). */
export type ValorResposta = string | string[];

/** Mapa `id da pergunta` (ou `obs:<id>`) → valor. */
export type MapaRespostas = Record<string, ValorResposta>;

export interface RespostaQuestionario {
  id: number;
  questionarioSlug: string;
  questionarioVersao: number;
  colaboradorId: number;
  colaboradorNome: string;
  respostas: MapaRespostas;
  observacoes: string | null;
  criadoEm: string | null;
  atualizadoEm: string | null;
}

/** `Date`/`string` do driver → ISO, ou null. Mesmo helper de FiscalFichaService. */
function iso(valor: any): string | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * O driver devolve JSON já parseado quando a coluna é JSON, mas devolve string
 * quando a conexão está com `typeCast` diferente (ou quando o valor veio de um
 * dump antigo em TEXT). Aceitar os dois evita um bug que só aparece em produção.
 */
function lerMapa(valor: any): MapaRespostas {
  if (!valor) return {};
  if (typeof valor === 'string') {
    try {
      const parsed = JSON.parse(valor);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof valor === 'object' && !Array.isArray(valor) ? (valor as MapaRespostas) : {};
}

function linhaParaResposta(row: RowDataPacket): RespostaQuestionario {
  return {
    id: Number(row['id']),
    questionarioSlug: String(row['questionario_slug']),
    questionarioVersao: Number(row['questionario_versao']),
    colaboradorId: Number(row['colaborador_id']),
    colaboradorNome: String(row['colaborador_nome'] ?? ''),
    respostas: lerMapa(row['respostas']),
    observacoes: row['observacoes'] ?? null,
    criadoEm: iso(row['criado_em']),
    atualizadoEm: iso(row['atualizado_em']),
  };
}

const SELECT_BASE = `
  SELECT r.id, r.questionario_slug, r.questionario_versao, r.colaborador_id,
         c.nome AS colaborador_nome, r.respostas, r.observacoes,
         r.criado_em, r.atualizado_em
    FROM fiscal_questionario_respostas r
    JOIN fiscal_colaboradores c ON c.id = r.colaborador_id
`;

/**
 * Valida o mapa de respostas contra a definição do questionário.
 *
 * Estrito de propósito, como `valorValido` de FiscalOpcoes: chave que não é
 * pergunta conhecida, ou valor fora das opções, é erro de tela — aceitar calado
 * gravaria lixo que ninguém consegue interpretar depois. Devolve o mapa
 * normalizado (sem chaves vazias) para ir ao banco.
 */
export function validarRespostas(
  questionario: QuestionarioDefinicao,
  bruto: unknown
): MapaRespostas {
  if (bruto === null || bruto === undefined) return {};
  if (typeof bruto !== 'object' || Array.isArray(bruto)) {
    throw new ErroValidacao('As respostas devem vir como um objeto.');
  }

  const perguntas = perguntasDe(questionario);
  const porId = new Map(perguntas.map((p) => [p.id, p]));
  const saida: MapaRespostas = {};

  for (const [chave, valor] of Object.entries(bruto as Record<string, unknown>)) {
    // Observação por pergunta: `obs:q1`. Texto livre, mas a pergunta tem de existir.
    if (chave.startsWith(PREFIXO_OBSERVACAO)) {
      const alvo = chave.slice(PREFIXO_OBSERVACAO.length);
      if (!porId.has(alvo)) {
        throw new ErroValidacao(`Observação de pergunta desconhecida: ${chave}`);
      }
      if (valor === null || valor === undefined || valor === '') continue;
      if (typeof valor !== 'string') {
        throw new ErroValidacao(`A observação de ${alvo} deve ser texto.`);
      }
      if (valor.length > TEXTO_MAX) {
        throw new ErroValidacao(`A observação de ${alvo} passa de ${TEXTO_MAX} caracteres.`);
      }
      saida[chave] = valor;
      continue;
    }

    const pergunta = porId.get(chave);
    if (!pergunta) {
      throw new ErroValidacao(`Pergunta desconhecida: ${chave}`);
    }

    // Vazio = "ainda não respondi". Não grava chave, para a consolidação não
    // contar como resposta quem só passou o olho.
    if (valor === null || valor === undefined || valor === '') continue;

    const permitidos = (pergunta.opcoes ?? []).map((o) => o.valor);

    if (pergunta.tipo === 'texto') {
      if (typeof valor !== 'string') {
        throw new ErroValidacao(`A resposta de ${chave} deve ser texto.`);
      }
      if (valor.length > TEXTO_MAX) {
        throw new ErroValidacao(`A resposta de ${chave} passa de ${TEXTO_MAX} caracteres.`);
      }
      saida[chave] = valor;
      continue;
    }

    if (pergunta.tipo === 'unica') {
      if (typeof valor !== 'string' || !permitidos.includes(valor)) {
        throw new ErroValidacao(`Opção inválida em ${chave}: ${String(valor)}`);
      }
      saida[chave] = valor;
      continue;
    }

    // múltipla
    if (!Array.isArray(valor)) {
      throw new ErroValidacao(`A resposta de ${chave} deve ser uma lista.`);
    }
    const marcadas: string[] = [];
    for (const item of valor) {
      if (typeof item !== 'string' || !permitidos.includes(item)) {
        throw new ErroValidacao(`Opção inválida em ${chave}: ${String(item)}`);
      }
      if (!marcadas.includes(item)) marcadas.push(item);
    }
    if (marcadas.length === 0) continue;
    saida[chave] = marcadas;
  }

  return saida;
}

/** Observações gerais: texto livre, ou NULL quando em branco. */
export function validarObservacoes(bruto: unknown): string | null {
  if (bruto === null || bruto === undefined) return null;
  if (typeof bruto !== 'string') {
    throw new ErroValidacao('As observações gerais devem ser texto.');
  }
  if (bruto.length > TEXTO_MAX) {
    throw new ErroValidacao(`As observações gerais passam de ${TEXTO_MAX} caracteres.`);
  }
  const texto = bruto.trim();
  return texto === '' ? null : texto;
}

export class FiscalQuestionarioService {
  /** Os questionários existentes, em resumo. */
  listar(): QuestionarioResumo[] {
    return listarQuestionarios();
  }

  /** A definição completa, ou `null` quando o slug não existe. */
  definicao(slug: string): QuestionarioDefinicao | null {
    return questionarioPorSlug(slug);
  }

  /** Todas as respostas de um questionário — é a visão consolidada. */
  async respostas(slug: string): Promise<RespostaQuestionario[]> {
    const [rows] = await mysqlPool.query<RowDataPacket[]>(
      `${SELECT_BASE} WHERE r.questionario_slug = ? ORDER BY c.ordem, c.nome`,
      [slug]
    );
    return rows.map(linhaParaResposta);
  }

  /** O que um colaborador respondeu, ou `null` se ainda não respondeu. */
  async respostaDe(slug: string, colaboradorId: number): Promise<RespostaQuestionario | null> {
    const [rows] = await mysqlPool.query<RowDataPacket[]>(
      `${SELECT_BASE} WHERE r.questionario_slug = ? AND r.colaborador_id = ? LIMIT 1`,
      [slug, colaboradorId]
    );
    const linha = rows[0];
    return linha ? linhaParaResposta(linha) : null;
  }

  /**
   * Grava as respostas de um colaborador (cria ou substitui).
   *
   * O PUT manda o formulário inteiro a cada autosave, então o UPDATE substitui
   * o JSON em vez de mesclar: desmarcar uma opção tem de sumir com ela, e um
   * merge deixaria a escolha antiga viva para sempre.
   */
  async salvar(
    slug: string,
    colaboradorId: number,
    respostasBrutas: unknown,
    observacoesBrutas: unknown
  ): Promise<RespostaQuestionario> {
    const questionario = questionarioPorSlug(slug);
    if (!questionario) {
      throw new ErroValidacao(`Questionário desconhecido: ${slug}`);
    }
    if (!Number.isInteger(colaboradorId) || colaboradorId <= 0) {
      throw new ErroValidacao('Informe o colaborador.');
    }

    const respostas = validarRespostas(questionario, respostasBrutas);
    const observacoes = validarObservacoes(observacoesBrutas);

    await mysqlPool.query<ResultSetHeader>(
      `INSERT INTO fiscal_questionario_respostas
         (questionario_slug, questionario_versao, colaborador_id, respostas, observacoes)
       VALUES (?, ?, ?, CAST(? AS JSON), ?)
       ON DUPLICATE KEY UPDATE
         questionario_versao = VALUES(questionario_versao),
         respostas           = VALUES(respostas),
         observacoes         = VALUES(observacoes)`,
      [slug, questionario.versao, colaboradorId, JSON.stringify(respostas), observacoes]
    );

    const gravado = await this.respostaDe(slug, colaboradorId);
    if (!gravado) {
      // Só acontece se a FK deixou passar um colaborador que sumiu no meio.
      throw new ErroValidacao('Colaborador não encontrado.');
    }
    return gravado;
  }
}

export const fiscalQuestionarioService = new FiscalQuestionarioService();
export default fiscalQuestionarioService;
