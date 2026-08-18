/**
 * Padrão visual ÚNICO dos e-mails do sistema.
 *
 * Todo aviso passa por aqui: assim um e-mail não evolui e deixa os outros para
 * trás — que era exatamente o que vinha acontecendo, com dois templates
 * paralelos (o de conferências, por classe CSS, e o da cota, por estilo inline)
 * divergindo em fonte, margem, cor e tamanho de número.
 *
 * ─── Duas decisões que valem explicação ──────────────────────────────────────
 *
 * 1. ESTILO INLINE, não `<style>`. Outlook desktop e vários webmails descartam
 *    ou reescrevem o bloco `<style>`; atributo `style` em cada elemento é o
 *    único que todos respeitam. Custa verbosidade no HTML gerado — que ninguém
 *    lê — e paga em e-mail que chega igual em todo cliente.
 *
 * 2. LAYOUT EM TABELA, não em div com float/flex. Pelo mesmo motivo: `<table>`
 *    com `width` percentual é o mecanismo de colunas que sobrevive ao Outlook.
 *    Onde há `<div>`, é empilhamento vertical simples, que não quebra.
 *
 * Sóbrio de propósito: sem gradiente, sem sombra, sem ícone decorativo. Quem
 * recebe está conferindo obrigação fiscal — o que precisa saltar é o dado, não
 * a moldura. Cor entra só para hierarquia e para o número que exige ação.
 *
 * Tudo aqui é função PURA: recebe texto pronto e devolve string. Nada de banco,
 * nada de `new Date()` interno (data entra por parâmetro, senão não se testa).
 */

// ─── Tokens ──────────────────────────────────────────────────────────────────

export const FONTE = "'Segoe UI', system-ui, 'Helvetica Neue', Arial, sans-serif";

/**
 * Paleta. Os cinzas são a escala slate; o azul é o da identidade do sistema.
 * As cores de estado (`ALERTA`, `ATENCAO`, `OK`, `INFO`) existem para semântica
 * — usar vermelho porque "fica bonito" é o começo do e-mail que ninguém mais lê
 * com atenção.
 */
export const C = {
  AZUL: '#1e3a8a',
  AZUL_CLARO: '#93c5fd',
  AZUL_PALIDO: '#bfdbfe',
  TINTA: '#0f172a',
  TEXTO: '#334155',
  APAGADO: '#64748b',
  FRACO: '#94a3b8',
  INERTE: '#cbd5e1',
  LINHA: '#e2e8f0',
  LINHA_FINA: '#eef2f6',
  FUNDO: '#f1f5f9',
  FUNDO_SUAVE: '#f8fafc',
  ZEBRA: '#fbfcfe',
  BRANCO: '#ffffff',

  ALERTA: '#b91c1c',
  ALERTA_FUNDO: '#fef2f2',
  URGENTE: '#c2410c',
  URGENTE_FUNDO: '#fff7ed',
  ATENCAO: '#b45309',
  ATENCAO_FUNDO: '#fffbeb',
  ATENCAO_BORDA: '#fde68a',
  INFO: '#0369a1',
  INFO_FUNDO: '#f0f9ff',
  OK: '#15803d',
  OK_ESCURO: '#166534',
  OK_FUNDO: '#f0fdf4',
  OK_BORDA: '#bbf7d0',
} as const;

// ─── Helpers de texto ────────────────────────────────────────────────────────

/**
 * Escapa texto vindo do banco antes de entrar no HTML.
 *
 * Razão social é dado de terceiro: um "&" ou "<" no nome já basta para quebrar
 * a tabela do e-mail. Centralizado aqui porque, quando cada template tinha o
 * seu, um deles esquecia.
 */
export function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Valor em reais. `null` vira travessão — nunca "R$ 0,00", que é outro fato. */
export function moeda(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : BRL.format(v);
}

export function formatCnpj(v: string | null | undefined): string {
  const n = String(v ?? '').replace(/\D/g, '');
  if (n.length !== 14) return v || '—';
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
}

/** `YYYY-MM-DD` → `DD/MM/AAAA`. Quem lê confere contra o e-CAC, que é BR. */
export function dataBr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : String(iso);
}

/** `YYYY-MM` → `MM/AAAA` (competência). */
export function periodoBr(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '—';
  const m = s.match(/^(\d{4})-(\d{2})$/);
  return m ? `${m[2]}/${m[1]}` : s;
}

// ─── Peças ───────────────────────────────────────────────────────────────────

/** Rótulo miúdo em versalete — abre cada faixa do e-mail. */
export function rotulo(texto: string, cor: string = C.APAGADO): string {
  return `<div style="font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:${cor};">${texto}</div>`;
}

/** Selo de contagem: número sobre cor sólida, sempre no mesmo eixo. */
export function selo(texto: string | number, cor: string): string {
  return `<span style="display:inline-block;padding:2px 10px;border-radius:11px;background:${cor};color:${C.BRANCO};font-size:11.5px;font-weight:700;">${texto}</span>`;
}

/** Etiqueta discreta para qualificar um dado dentro da linha. */
export function tag(texto: string): string {
  return `<span style="display:inline-block;padding:1px 8px;border-radius:10px;background:${C.LINHA_FINA};color:${C.APAGADO};font-size:11.5px;margin-right:3px;">${texto}</span>`;
}

/**
 * Barra de proporção — duas células de tabela, sem imagem e sem CSS moderno.
 *
 * É o único desenho que sobrevive a Outlook, Gmail e webmail ao mesmo tempo.
 * Ver a barra quase cheia comunica num relance o que dois valores lado a lado
 * não comunicam.
 */
export function barra(percentual: number, cor: string, corTrilho: string): string {
  const cheio = Math.max(2, Math.min(100, Math.round(percentual)));
  return `
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:8px 0 2px;">
      <tr>
        <td width="${cheio}%" style="height:6px;background:${cor};font-size:0;line-height:0;border-radius:3px 0 0 3px;">&nbsp;</td>
        <td width="${100 - cheio}%" style="height:6px;background:${corTrilho};font-size:0;line-height:0;border-radius:0 3px 3px 0;">&nbsp;</td>
      </tr>
    </table>`;
}

// ─── Faixa de totais ─────────────────────────────────────────────────────────

export interface ColunaTotal {
  valor: string | number;
  titulo: string;
  detalhe?: string;
  cor?: string;
}

/**
 * Painel de totais no topo: a foto do período, renderizada SEMPRE.
 *
 * É o que separa "nada mudou" de "o job morreu": sem ele, os dois casos chegam
 * na caixa de entrada com a mesma cara. Zero sai em cinza-claro para ocupar o
 * lugar sem competir com o número que importa.
 */
export function painelTotais(colunas: ColunaTotal[], titulo = 'Totalizadores'): string {
  const largura = Math.floor(100 / Math.max(1, colunas.length));
  const celulas = colunas
    .map((c, i) => {
      const zerado = c.valor === 0 || c.valor === '0';
      const cor = zerado ? C.INERTE : (c.cor ?? C.TINTA);
      const divisor = i === colunas.length - 1 ? '' : `border-right:1px solid ${C.LINHA};`;
      return `
      <td width="${largura}%" style="text-align:center;padding:2px 12px;vertical-align:top;${divisor}">
        <div style="font-size:27px;font-weight:700;color:${cor};line-height:1.1;font-variant-numeric:tabular-nums;">${c.valor}</div>
        <div style="font-size:12px;font-weight:600;color:${C.TEXTO};margin-top:4px;">${c.titulo}</div>
        ${c.detalhe ? `<div style="font-size:11px;color:${C.FRACO};margin-top:1px;">${c.detalhe}</div>` : ''}
      </td>`;
    })
    .join('');

  return `
      <div style="background:${C.FUNDO_SUAVE};border-bottom:1px solid ${C.LINHA};padding:18px 24px 16px;">
        ${rotulo(titulo)}
        <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:12px;">
          <tr>${celulas}</tr>
        </table>
      </div>`;
}

/**
 * Faixa de contexto: o que vale para TODAS as linhas fica aqui, uma vez.
 *
 * Repetir o mesmo valor em cada linha da tabela rouba largura e esconde o que
 * de fato varia — uma coluna inteira dizendo "Em andamento" num relatório de
 * pendentes não informa nada.
 */
export function faixaContexto(itens: Array<{ rot: string; val: string }>): string {
  if (itens.length === 0) return '';
  const pills = itens
    .map(
      (i) =>
        `<span style="display:inline-block;margin:3px 5px;padding:5px 12px;background:#fef3c7;border:1px solid ${C.ATENCAO_BORDA};border-radius:6px;font-size:12.5px;"><span style="color:#92400e;">${i.rot}:</span> <span style="color:#78350f;font-weight:700;">${i.val}</span></span>`
    )
    .join('');
  return `
      <div style="padding:12px 24px;background:${C.BRANCO};border-bottom:1px solid ${C.LINHA};text-align:center;">${pills}</div>`;
}

export interface LinhaQuadro {
  texto: string;
  valor: string | number;
  cor?: string;
}

/**
 * Quadro de linhas rotuladas — o desdobramento dos totais.
 *
 * Diferente das seções: aqui o ZERO é informação ("conferido, nenhum"), então
 * a linha aparece mesmo zerada, apagada. `rodape` recebe o total somado.
 */
export function quadroLinhas(titulo: string, linhas: LinhaQuadro[], rodape?: string): string {
  const corpo = linhas
    .map((l) => {
      const ativo = l.valor !== 0 && l.valor !== '0';
      const cor = l.cor ?? C.TEXTO;
      return `
    <tr>
      <td style="padding:6px 0;font-size:12.5px;color:${ativo ? C.TEXTO : C.FRACO};">
        <span style="display:inline-block;width:7px;height:7px;border-radius:4px;background:${
          ativo ? cor : '#dbe2ea'
        };margin-right:8px;"></span>${l.texto}
      </td>
      <td style="padding:6px 0;font-size:13.5px;font-weight:700;color:${
        ativo ? cor : C.INERTE
      };text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;">${l.valor}</td>
    </tr>`;
    })
    .join('');

  return `
      <div style="padding:16px 24px;border-bottom:1px solid ${C.LINHA};">
        ${rotulo(titulo)}
        <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:6px;">${corpo}</table>
        ${
          rodape
            ? `<div style="margin-top:12px;padding-top:10px;border-top:1px solid ${C.LINHA_FINA};font-size:12px;color:${C.APAGADO};">${rodape}</div>`
            : ''
        }
      </div>`;
}

// ─── Seções e listas ─────────────────────────────────────────────────────────

/**
 * Cartão de seção: filete colorido à esquerda, título e a contagem num selo.
 *
 * A contagem sai do meio da frase e vira selo à direita — assim o título se lê
 * como frase e o número fica no mesmo eixo em todas as seções, comparável de
 * relance. Seção sem conteúdo NÃO deve ser renderizada: os zeros vivem no
 * painel de totais, uma vez só.
 */
export function secao(input: {
  titulo: string;
  /** Identificação secundária (CNPJ, código) — logo abaixo do título. */
  subtitulo?: string;
  contagem: number | string;
  cor: string;
  fundo: string;
  itens: string;
}): string {
  const { titulo, subtitulo, contagem, cor, fundo, itens } = input;
  return `
    <div style="margin:0 0 16px;border:1px solid ${C.LINHA};border-left:3px solid ${cor};border-radius:8px;overflow:hidden;">
      <table role="presentation" style="width:100%;border-collapse:collapse;background:${fundo};">
        <tr>
          <td style="padding:11px 16px;border-bottom:1px solid ${C.LINHA};">
            <span style="font-size:13px;font-weight:700;color:${cor};letter-spacing:-0.01em;">${titulo}</span>
            ${subtitulo ? `<div style="font-size:11.5px;color:${C.APAGADO};margin-top:2px;font-weight:400;">${subtitulo}</div>` : ''}
          </td>
          <td style="padding:11px 16px;border-bottom:1px solid ${C.LINHA};text-align:right;white-space:nowrap;width:1%;">
            ${selo(contagem, cor)}
          </td>
        </tr>
      </table>
      <table role="presentation" style="width:100%;border-collapse:collapse;background:${C.BRANCO};">${itens}</table>
    </div>`;
}

/**
 * Linha de lista: identificação à esquerda, o número que importa à direita.
 *
 * Sem tabela de colunas — com um registro por linha o olho desce a lista sem
 * reler cabeçalho, e a mensagem não estoura a largura no celular. O zebrado
 * existe para o olho não pular de linha em lista longa.
 */
export function itemLista(input: {
  titulo: string;
  meta?: string;
  valor: string;
  complemento?: string | null;
  cor: string;
  indice?: number;
  zebra?: string;
}): string {
  const { titulo, meta, valor, complemento, cor, indice = 0, zebra = C.ZEBRA } = input;
  const fundo = indice % 2 === 1 ? `background:${zebra};` : '';
  return `
    <tr>
      <td style="${fundo}padding:11px 16px;border-bottom:1px solid ${C.LINHA_FINA};">
        <div style="font-size:13.5px;font-weight:600;color:${C.TINTA};line-height:1.35;">${titulo}</div>
        ${meta ? `<div style="font-size:11.5px;color:${C.APAGADO};margin-top:2px;">${meta}</div>` : ''}
      </td>
      <td style="${fundo}padding:11px 16px;border-bottom:1px solid ${C.LINHA_FINA};text-align:right;white-space:nowrap;vertical-align:top;">
        <div style="font-size:14px;font-weight:700;color:${cor};font-variant-numeric:tabular-nums;">${valor}</div>
        ${complemento ? `<div style="font-size:11.5px;color:${C.APAGADO};margin-top:3px;">${complemento}</div>` : ''}
      </td>
    </tr>`;
}

/** Nota dentro de uma seção — a ressalva que vale para a lista inteira. */
export function notaDaSecao(texto: string, cor: string, fundo: string): string {
  return `<tr><td colspan="2" style="padding:10px 16px;background:${fundo};font-size:11.5px;color:${cor};line-height:1.5;">${texto}</td></tr>`;
}

/** Bloco neutro, para o que é só registro e não merece cartão próprio. */
export function blocoNeutro(html: string): string {
  return `
      <div style="margin:0 0 16px;padding:13px 16px;background:${C.FUNDO_SUAVE};border:1px solid ${C.LINHA};border-radius:8px;">
        <div style="font-size:12.5px;color:${C.TEXTO};line-height:1.6;">${html}</div>
      </div>`;
}

/** Caixa âmbar das ressalvas de cobertura — o que o relatório NÃO garante. */
export function blocoRessalvas(itens: string[], titulo = 'Ressalvas de cobertura'): string {
  if (itens.length === 0) return '';
  return `
      <div style="margin:0 0 16px;padding:12px 16px;background:${C.ATENCAO_FUNDO};border:1px solid ${C.ATENCAO_BORDA};border-left:3px solid #f59e0b;border-radius:8px;">
        ${rotulo(titulo, '#92400e')}
        <div style="margin-top:5px;">
          ${itens
            .map((r) => `<div style="font-size:12.5px;color:#78350f;line-height:1.6;">${r}</div>`)
            .join('')}
        </div>
      </div>`;
}

/**
 * Estado vazio — nunca silêncio.
 *
 * Caixa de entrada sem e-mail é ambíguo entre "não havia nada" e "o job
 * morreu"; e-mail que chega dizendo "nada a tratar" resolve os dois.
 */
export function blocoVazio(titulo: string, texto?: string): string {
  return `
      <div style="padding:26px 18px;background:${C.OK_FUNDO};border:1px solid ${C.OK_BORDA};border-radius:8px;text-align:center;">
        <div style="font-size:15px;color:${C.OK_ESCURO};font-weight:600;">${titulo}</div>
        ${texto ? `<div style="font-size:12.5px;color:#3f7f57;margin-top:5px;">${texto}</div>` : ''}
      </div>`;
}

// ─── Tabela (relatórios com muitas colunas) ──────────────────────────────────

export interface ColunaTabela {
  titulo: string;
  /** Alinha à direita e não deixa quebrar — para valor monetário e data. */
  num?: boolean;
}

/**
 * Tabela de relatório, no mesmo idioma visual das listas.
 *
 * Só vale a pena quando há três ou mais dados por registro. Com dois,
 * `itemLista` lê melhor no celular. As `linhas` já vêm montadas com `celula`.
 */
export function tabela(colunas: ColunaTabela[], linhas: string): string {
  const cabecalho = colunas
    .map(
      (c) =>
        `<th style="padding:10px 12px;text-align:${c.num ? 'right' : 'left'};font-weight:700;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${C.APAGADO};background:${C.FUNDO_SUAVE};border-bottom:1px solid ${C.INERTE};">${c.titulo}</th>`
    )
    .join('');
  return `
    <div style="margin:0 0 16px;border:1px solid ${C.LINHA};border-radius:8px;overflow:hidden;">
      <table role="presentation" style="width:100%;border-collapse:collapse;">
        <thead><tr>${cabecalho}</tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`;
}

/** Célula da tabela. `principal` destaca a coluna que identifica a linha. */
export function celula(
  conteudo: string,
  opts: { num?: boolean; principal?: boolean; cor?: string; indice?: number } = {}
): string {
  const { num = false, principal = false, cor, indice = 0 } = opts;
  const fundo = indice % 2 === 1 ? `background:${C.ZEBRA};` : '';
  return `<td style="${fundo}padding:11px 12px;border-bottom:1px solid ${C.LINHA_FINA};font-size:13px;color:${
    cor ?? (principal ? C.TINTA : C.TEXTO)
  };${principal ? 'font-weight:600;' : ''}${
    num ? 'text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;' : ''
  }">${conteudo}</td>`;
}

// ─── Moldura ─────────────────────────────────────────────────────────────────

/**
 * Esqueleto do e-mail: cabeçalho, faixas, corpo, botão e rodapé.
 *
 * `faixas` é o que fica colado ao cabeçalho e vale para a mensagem inteira
 * (totais, contexto); `corpo` são as seções. A separação existe porque a faixa
 * sangra de ponta a ponta e o corpo tem margem — misturar os dois foi o que
 * deixou o layout antigo desalinhado.
 */
export function moldura(input: {
  titulo: string;
  /** Competência ou período — a segunda linha do cabeçalho. */
  subtitulo?: string;
  /** Uma linha miúda de cobertura: "N clientes avaliados a partir de…". */
  cobertura?: string;
  faixas?: string;
  corpo: string;
  cta?: { url: string; texto: string };
  /** Letra miúda do rodapé (base legal, aviso de automação). */
  rodape?: { titulo: string; texto: string };
  /**
   * Largura máxima. 660 é o padrão e serve a listas; relatórios com tabela de
   * muitas colunas precisam de mais espaço, senão as colunas se espremem.
   */
  largura?: number;
}): string {
  const { titulo, subtitulo, cobertura, faixas = '', corpo, cta, rodape, largura = 660 } = input;
  return `
  <div style="margin:0;padding:24px 12px;background:${C.FUNDO};font-family:${FONTE};line-height:1.55;color:${C.TEXTO};">
    <div style="max-width:${largura}px;margin:0 auto;background:${C.BRANCO};border-radius:12px;overflow:hidden;border:1px solid ${C.LINHA};">

      <div style="background:${C.AZUL};padding:24px;text-align:center;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${C.AZUL_CLARO};">Sistema DCTF</div>
        <div style="color:${C.BRANCO};font-size:22px;font-weight:600;letter-spacing:-0.01em;margin-top:6px;">${titulo}</div>
        ${subtitulo ? `<div style="color:${C.AZUL_PALIDO};font-size:14px;margin-top:4px;">${subtitulo}</div>` : ''}
        ${cobertura ? `<div style="color:${C.AZUL_CLARO};font-size:12px;margin-top:8px;">${cobertura}</div>` : ''}
      </div>

      ${faixas}

      <div style="padding:20px 24px 4px;">${corpo}</div>

      ${
        cta
          ? `<div style="padding:8px 24px 26px;text-align:center;">
               <a href="${cta.url}" style="display:inline-block;padding:12px 26px;background:${C.AZUL};color:${C.BRANCO};text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;">${cta.texto} &rarr;</a>
               <div style="margin-top:11px;font-size:12.5px;color:${C.FRACO};">
                 Se o botão não funcionar, acesse:
                 <a href="${cta.url}" style="color:${C.APAGADO};text-decoration:underline;">${cta.url}</a>
               </div>
             </div>`
          : ''
      }

      ${
        rodape
          ? `<div style="padding:16px 24px;background:${C.FUNDO_SUAVE};border-top:1px solid ${C.LINHA};">
               ${rotulo(rodape.titulo, C.FRACO)}
               <p style="margin:6px 0 0;font-size:11px;color:${C.FRACO};line-height:1.6;">${rodape.texto}</p>
             </div>`
          : ''
      }
    </div>
  </div>`;
}
