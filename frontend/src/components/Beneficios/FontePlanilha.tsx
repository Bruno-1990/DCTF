import React, { useState, useRef, useEffect } from 'react';
import { ArrowDownTrayIcon, ArrowTopRightOnSquareIcon, ClipboardDocumentIcon, ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';
import { beneficiosService } from '../../services/beneficios';
import type { FontePlanilhaDto, ProgramaBeneficio } from '../../services/beneficios';

/**
 * Página do portal. Serve de fallback quando o backend não resolve o link
 * direto do CSV, e de destino do "Abrir o portal".
 */
export const PORTAL_TRANSPARENCIA_URL = 'https://transparencia.es.gov.br/Comum/IncentivosFiscais';

/**
 * Paleta por aba. As classes precisam ser strings COMPLETAS: o Tailwind varre o
 * código procurando nomes de classe inteiros, então `bg-${cor}-600` não gera CSS.
 */
const TONE = {
  blue: {
    card: 'border-blue-200 bg-blue-50/60',
    iconWrap: 'bg-blue-100',
    icon: 'text-blue-600',
    button: 'bg-blue-600 hover:bg-blue-700 focus-visible:outline-blue-600',
    subtle: 'text-blue-700 hover:text-blue-900',
  },
  emerald: {
    card: 'border-emerald-200 bg-emerald-50/60',
    iconWrap: 'bg-emerald-100',
    icon: 'text-emerald-600',
    button: 'bg-emerald-600 hover:bg-emerald-700 focus-visible:outline-emerald-600',
    subtle: 'text-emerald-700 hover:text-emerald-900',
  },
} as const;

export interface FontePlanilhaProps {
  programa: ProgramaBeneficio;
  /** Seção do portal — mostrada enquanto o backend não respondeu. */
  secao: string;
  descricao: string;
  accentColor: 'blue' | 'emerald';
}

/**
 * Leva o operador até a planilha vigente desta aba.
 *
 * O portal não tem deep-link: o acordeão é um collapse do Bootstrap e não abre
 * por fragmento de URL. Então, em vez de mandar o operador navegar até a seção,
 * o backend lê a seção e devolve o link direto do CSV do mês — e o botão baixa
 * esse arquivo. Se o portal mudar de forma, cair ou demorar, o card degrada
 * para o link da página.
 *
 * O caminho principal é sempre um link de verdade (`<a>`), não `window.open`:
 * funciona com clique do meio, "abrir em nova aba" e teclado, e bloqueador de
 * pop-up não barra navegação de âncora. O "Ver o link" cobre o resto.
 */
const FontePlanilha: React.FC<FontePlanilhaProps> = ({ programa, secao, descricao, accentColor }) => {
  const [fonte, setFonte] = useState<FontePlanilhaDto | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [mostrarLink, setMostrarLink] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    let ativo = true;
    beneficiosService
      .obterFonte(programa)
      // O backend responde 200 com arquivoUrl:null quando o portal falha; este
      // catch é para a nossa API estar fora, não o portal.
      .then(dto => { if (ativo) setFonte(dto); })
      .catch(() => { if (ativo) setFonte(null); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [programa]);

  // Evita setState depois de desmontar (troca de aba com timer correndo).
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); };
  }, []);

  const agendar = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  };

  /**
   * Quando a aba nova abre, este documento perde foco/visibilidade. Se em ~1,2s
   * nada disso aconteceu, a abertura provavelmente foi bloqueada e revelamos o
   * link. Ctrl+clique (abre em segundo plano) também cai aqui — o resultado é
   * só mostrar o link a mais, que é inofensivo.
   */
  const detectarBloqueio = () => {
    let abriu = false;
    const marcar = () => { abriu = true; };

    window.addEventListener('blur', marcar, { once: true });
    window.addEventListener('pagehide', marcar, { once: true });
    document.addEventListener('visibilitychange', marcar, { once: true });

    agendar(() => {
      window.removeEventListener('blur', marcar);
      window.removeEventListener('pagehide', marcar);
      document.removeEventListener('visibilitychange', marcar);
      if (!abriu) setMostrarLink(true);
    }, 1200);
  };

  const temArquivo = !!fonte?.arquivoUrl;
  const linkFallback = fonte?.arquivoUrl ?? PORTAL_TRANSPARENCIA_URL;

  const copiar = async () => {
    try {
      // navigator.clipboard só existe em contexto seguro. Esta app é servida por
      // HTTP num IP de LAN, que não é seguro — então o caminho normal aqui é o
      // execCommand, não a Clipboard API.
      if (window.isSecureContext && navigator.clipboard) {
        await navigator.clipboard.writeText(linkFallback);
      } else {
        const ta = document.createElement('textarea');
        ta.value = linkFallback;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (!ok) throw new Error('execCommand copy falhou');
      }
      setCopiado(true);
      agendar(() => setCopiado(false), 2000);
    } catch {
      // Último fallback: a URL fica na tela, selecionável, para copiar à mão.
      setCopiado(false);
    }
  };

  const tone = TONE[accentColor];

  return (
    <div className={`mb-6 rounded-2xl border p-5 ${tone.card}`}>
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tone.iconWrap}`}>
          <ArrowDownTrayIcon className={`h-5 w-5 ${tone.icon}`} />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">Onde baixar a planilha atualizada</h3>

          <p className="mt-1 text-sm text-gray-600 leading-relaxed">
            {temArquivo ? (
              <>
                Baixe a planilha vigente e importe abaixo. Ela é publicada pelo{' '}
                <span className="font-medium text-gray-800">Portal da Transparência do Espírito Santo</span>, na seção{' '}
                <span className="font-medium text-gray-800">{fonte?.secao} — {fonte?.descricao}</span>.
              </>
            ) : (
              <>
                A planilha importada aqui é publicada pelo{' '}
                <span className="font-medium text-gray-800">Portal da Transparência do Espírito Santo</span>, na seção{' '}
                <span className="font-medium text-gray-800">{fonte?.secao ?? secao} — {fonte?.descricao ?? descricao}</span>.
                Baixe a versão mais recente por lá e importe abaixo.
              </>
            )}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {carregando ? (
              <div className="h-10 w-72 rounded-lg bg-white/70 animate-pulse" aria-label="Consultando o portal" />
            ) : temArquivo ? (
              <a
                href={fonte!.arquivoUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-white text-sm font-medium rounded-lg shadow-md hover:shadow-lg transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${tone.button}`}
              >
                <ArrowDownTrayIcon className="h-4 w-4 flex-shrink-0" />
                Baixar {fonte!.arquivoLabel}
              </a>
            ) : (
              <a
                href={PORTAL_TRANSPARENCIA_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={detectarBloqueio}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-white text-sm font-medium rounded-lg shadow-md hover:shadow-lg transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${tone.button}`}
              >
                <ArrowTopRightOnSquareIcon className="h-4 w-4 flex-shrink-0" />
                Abrir Portal da Transparência
              </a>
            )}

            {!carregando && temArquivo && (
              <a
                href={PORTAL_TRANSPARENCIA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-xs font-medium underline underline-offset-2 transition-colors ${tone.subtle}`}
              >
                Abrir o portal
              </a>
            )}

            {!carregando && !mostrarLink && (
              <button
                type="button"
                onClick={() => setMostrarLink(true)}
                className={`text-xs font-medium underline underline-offset-2 transition-colors ${tone.subtle}`}
              >
                Não abriu? Ver o link
              </button>
            )}
          </div>

          {/* O operador não precisa saber que o HTML do portal mudou — precisa
              saber que hoje vai ter que baixar na mão. */}
          {!carregando && !temArquivo && fonte?.erro && (
            <p className="mt-2 text-xs text-amber-700">
              Não identifiquei o arquivo do mês automaticamente — baixe pela seção {fonte.secao} do portal.
            </p>
          )}

          {mostrarLink && (
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs text-gray-500 mb-2">
                Se o botão não abrir, copie o endereço e cole no navegador:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 text-xs text-gray-700 break-all select-all font-mono">
                  {linkFallback}
                </code>
                <button
                  type="button"
                  onClick={copiar}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors flex-shrink-0"
                >
                  {copiado ? (
                    <><ClipboardDocumentCheckIcon className="h-4 w-4 text-green-600" /> Copiado!</>
                  ) : (
                    <><ClipboardDocumentIcon className="h-4 w-4" /> Copiar</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FontePlanilha;
