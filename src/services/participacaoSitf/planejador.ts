/**
 * Compara os sócios do cadastro (clientes_socios) com os da última Situação Fiscal extraída
 * (sitf_extracted_data.socios) e diz o que mudaria. Função pura: a prévia da tela e a gravação
 * usam o mesmo plano, então o que o analista vê é exatamente o que vai para o banco.
 *
 * Regras (mais estritas que as de Cliente.atualizarSociosComParticipacao, de propósito):
 * - casa primeiro pelo CPF/CNPJ; sem CPF, pelo nome normalizado idêntico ou com as mesmas palavras
 *   em outra ordem. Nada de "um nome contém o outro": isso trocava pai e filho ("FULANO FILHO").
 * - um nome que casa com mais de um sócio do cadastro fica de fora (ambíguo).
 * - quadro completo (soma 100%, sem ambíguo nem conflito): quem só está na SITF e tem CPF/CNPJ vira
 *   entrada (é criado) e quem só está no cadastro vira saída (marcado ausente_no_cartao, nunca
 *   apagado). Sócio marcado ausente que voltou na SITF é reativado. Quadro incompleto: só lista.
 * - CPF: só preenche o vazio. CPF diferente casado pelo nome é conflito e não grava nada.
 * - percentual: grava o da SITF quando ele existe e difere; ausente na SITF preserva o do cadastro.
 */

export interface SocioCadastro {
  id: string;
  nome: string;
  cpf: string | null;
  qual: string | null;
  participacao_percentual: number | string | null;
  /** 1 = já marcado fora do quadro (não conta na soma da tela). */
  ausente_no_cartao?: number | boolean | null;
}

export interface SocioSitf {
  nome?: string | null;
  cpf?: string | null;
  participacao_percentual?: number | string | null;
  qualificacao?: string | null;
}

export interface MudancaSocio {
  socioId: string;
  nome: string;
  casadoPor: 'cpf' | 'nome';
  cpf?: { de: string | null; para: string };
  percentual?: { de: number | null; para: number };
  /** Estava marcado fora do quadro e voltou na SITF: reativar. */
  volta?: true;
}

export interface EntradaSocio {
  nome: string;
  cpf: string;
  participacao_percentual: number | null;
  /** A da SITF quando vem; senão "Sócio" (com capital) ou "Sem capital" (a tela trata como 0%). */
  qual: string;
}

export interface PlanoParticipacao {
  mudancas: MudancaSocio[];
  conflitos: Array<{ socioId: string; nome: string; cpfCadastro: string; cpfSitf: string }>;
  ambiguos: string[];
  soNaSitf: Array<{ nome: string; cpf: string | null; participacao_percentual: number | null; qualificacao?: string }>;
  soNoCadastro: Array<{ socioId: string; nome: string }>;
  /** Sócios a criar (só com quadro completo). */
  entradas: EntradaSocio[];
  /** Sócios que saíram do quadro: marcar ausente_no_cartao (só com quadro completo). */
  saidas: Array<{ socioId: string; nome: string }>;
  somaSitf: number | null;
  alertas: string[];
}

/** A extração cola o resto do relatório no nome do último sócio ("... Certidão Emitida ____ CNPJ: ..."). */
const FIM_DO_NOME = /\s*(?:certid|_{3,}|cnpj\s*:|diagn[oóÓ�]?stico|final do relat)/i;

/** Em consórcio, a qualificação e a situação da consorciada caem no meio do nome. */
const SITUACAO_DA_CONSORCIADA = /\s+SOCIEDADE CONSORCIADA(?:\s+(?:ATIVA|INAPTA|BAIXADA|SUSPENSA|NULA))?(?=\s|$)/gi;

/**
 * As colunas Qualificação / Situação / Cap. Social às vezes caem no fim do nome:
 * "... PESSOA JURÍDICA ATIVA DOMICILIADO NO EXTERIOR", "... SEM CAPITAL", "... TITULAR FALECIDO".
 */
const RESTO_NO_FIM = /\s+(?:PESSOA\s+(?:JUR\S*DICA|F\S*SICA)\b.*|SEM CAPITAL|TITULAR FALECIDO|DIRETOR|PRESIDENTE)\s*$/i;

export function limparNomeSocio(nome: string | null | undefined): string {
  if (!nome) return '';
  const corte = String(nome).search(FIM_DO_NOME);
  const base = corte >= 0 ? String(nome).slice(0, corte) : String(nome);
  return base.replace(SITUACAO_DA_CONSORCIADA, ' ').replace(/\s+/g, ' ').trim().replace(RESTO_NO_FIM, '').trim();
}

const normalizar = (nome: string): string =>
  limparNomeSocio(nome)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const palavras = (nome: string): string => normalizar(nome).split(' ').filter(Boolean).sort().join(' ');

const digitos = (doc: string | null | undefined): string | null => {
  const d = String(doc ?? '').replace(/\D/g, '');
  return d.length === 11 || d.length === 14 ? d : null;
};

const numero = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const ausente = (c: SocioCadastro): boolean => c.ausente_no_cartao === 1 || c.ausente_no_cartao === true;

const ehLinhaDeResponsavel = (nome: string): boolean => {
  const n = nome.toUpperCase();
  return (
    n.includes('QUALIF. RESP') ||
    n.includes('QUALIF RESP') ||
    n.startsWith('CONTRATANTE') ||
    n.startsWith('QUADRO SOCIET') // "QUADRO SOCIETÁRIO NÃO OBRIGATÓRIO POR SUA NATUREZA JURÍDICA"
  );
};

export function planejarParticipacao(cadastro: SocioCadastro[], sitfBruto: SocioSitf[]): PlanoParticipacao {
  const sitf = sitfBruto
    .map((s) => ({
      nome: limparNomeSocio(s.nome),
      cpf: digitos(s.cpf),
      participacao_percentual: numero(s.participacao_percentual),
      qualificacao: s.qualificacao ? String(s.qualificacao).trim() : undefined,
    }))
    .filter((s) => s.nome && !ehLinhaDeResponsavel(s.nome));

  const plano: PlanoParticipacao = {
    mudancas: [],
    conflitos: [],
    ambiguos: [],
    soNaSitf: [],
    soNoCadastro: [],
    entradas: [],
    saidas: [],
    somaSitf: null,
    alertas: [],
  };

  const usados = new Set<string>();
  const livres = () => cadastro.filter((c) => !usados.has(c.id));

  // Primeiro todos os que casam pelo CPF, para que um nome parecido não roube o par certo.
  const pendentes: typeof sitf = [];
  const pares: Array<{ c: SocioCadastro; s: (typeof sitf)[number]; por: 'cpf' | 'nome' }> = [];
  for (const s of sitf) {
    const c = s.cpf ? livres().find((x) => digitos(x.cpf) === s.cpf) : undefined;
    if (c) {
      usados.add(c.id);
      pares.push({ c, s, por: 'cpf' });
    } else {
      pendentes.push(s);
    }
  }

  for (const s of pendentes) {
    const alvo = normalizar(s.nome);
    let candidatos = livres().filter((x) => normalizar(x.nome) === alvo);
    if (candidatos.length === 0) candidatos = livres().filter((x) => palavras(x.nome) === palavras(s.nome));
    if (candidatos.length > 1) {
      plano.ambiguos.push(s.nome);
      continue;
    }
    if (candidatos.length === 0) {
      plano.soNaSitf.push(s);
      continue;
    }
    usados.add(candidatos[0].id);
    pares.push({ c: candidatos[0], s, por: 'nome' });
  }

  for (const { c, s, por } of pares) {
    const cpfCadastro = digitos(c.cpf);
    if (por === 'nome' && cpfCadastro && s.cpf && cpfCadastro !== s.cpf) {
      plano.conflitos.push({ socioId: c.id, nome: c.nome, cpfCadastro, cpfSitf: s.cpf });
      continue;
    }
    const m: MudancaSocio = { socioId: c.id, nome: c.nome, casadoPor: por };
    if (!cpfCadastro && s.cpf) m.cpf = { de: c.cpf ?? null, para: s.cpf };
    const pctCadastro = numero(c.participacao_percentual);
    if (s.participacao_percentual !== null && (pctCadastro === null || Math.abs(pctCadastro - s.participacao_percentual) > 0.005)) {
      m.percentual = { de: pctCadastro, para: s.participacao_percentual };
    }
    if (ausente(c)) m.volta = true;
    if (m.cpf || m.percentual || m.volta) plano.mudancas.push(m);
  }

  // Quem já está marcado fora do quadro e não voltou não é pendência.
  plano.soNoCadastro = cadastro
    .filter((c) => !usados.has(c.id) && !ausente(c))
    .map((c) => ({ socioId: c.id, nome: c.nome }));

  const comPct = sitf.filter((s) => s.participacao_percentual !== null);
  if (comPct.length > 0) {
    plano.somaSitf = Math.round(comPct.reduce((t, s) => t + (s.participacao_percentual as number), 0) * 100) / 100;
    if (Math.abs(plano.somaSitf - 100) > 0.5) {
      plano.alertas.push(`A soma dos percentuais na Situação Fiscal é ${plano.somaSitf}%, não 100%.`);
    }
  }

  // Só com o quadro completo e sem dúvida a SITF manda em quem entra e quem sai.
  const quadroCompleto =
    plano.somaSitf !== null && Math.abs(plano.somaSitf - 100) <= 0.5 && plano.ambiguos.length === 0 && plano.conflitos.length === 0;
  if (quadroCompleto) {
    plano.entradas = plano.soNaSitf
      .filter((s): s is typeof s & { cpf: string } => !!s.cpf)
      .map((s) => ({
        nome: s.nome,
        cpf: s.cpf,
        participacao_percentual: s.participacao_percentual,
        qual: s.qualificacao || (s.participacao_percentual ? 'Sócio' : 'Sem capital'),
      }));
    plano.soNaSitf = plano.soNaSitf.filter((s) => !s.cpf);
    plano.saidas = plano.soNoCadastro;
    plano.soNoCadastro = [];
  }
  return plano;
}
