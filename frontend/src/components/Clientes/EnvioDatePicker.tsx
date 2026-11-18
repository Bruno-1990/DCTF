import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  formatDistanceToNow,
  isAfter,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarDaysIcon,
  ClockIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

interface Props {
  /** Elemento que abriu o popover (posição de ancoragem) */
  anchorEl: HTMLElement;
  /** Data atual gravada (ISO) — ponto de partida da edição */
  value: string | null;
  saving: boolean;
  /** Recebe a data escolhida em ISO; resolve true quando salvou */
  onSave: (iso: string) => Promise<boolean>;
  onClose: () => void;
}

const PANEL_WIDTH = 300;
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const pad = (n: number) => String(n).padStart(2, '0');
const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Junta o dia escolhido com a hora "HH:mm" */
function combinar(dia: Date, hora: string): Date {
  const [h, m] = hora.split(':').map(Number);
  const d = new Date(dia);
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

export default function EnvioDatePicker({ anchorEl, value, saving, onSave, onClose }: Props) {
  const inicial = useMemo(() => {
    const d = value ? new Date(value) : new Date();
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }, [value]);

  const [dia, setDia] = useState<Date>(startOfDay(inicial));
  const [hora, setHora] = useState(`${pad(inicial.getHours())}:${pad(inicial.getMinutes())}`);
  const [mes, setMes] = useState<Date>(startOfMonth(inicial));
  const [direcao, setDirecao] = useState(0); // -1 mês anterior, 1 próximo (anima o slide)
  const [pos, setPos] = useState<{ top: number; left: number; acima: boolean } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const hoje = startOfDay(new Date());
  const escolhida = combinar(dia, hora);
  const noFuturo = isAfter(escolhida, new Date());
  const semMudanca = value ? Math.abs(escolhida.getTime() - new Date(value).getTime()) < 60_000 : false;

  // ── Posicionamento (fixed, ancorado no gatilho; abre para cima se faltar espaço) ──
  useLayoutEffect(() => {
    const posicionar = () => {
      const r = anchorEl.getBoundingClientRect();
      const altura = panelRef.current?.offsetHeight ?? 440;
      const acima = r.bottom + altura + 12 > window.innerHeight && r.top > altura + 12;
      const left = Math.min(Math.max(8, r.right - PANEL_WIDTH), window.innerWidth - PANEL_WIDTH - 8);
      setPos({ top: acima ? r.top - altura - 8 : r.bottom + 8, left, acima });
    };
    posicionar();
    window.addEventListener('scroll', posicionar, true);
    window.addEventListener('resize', posicionar);
    return () => {
      window.removeEventListener('scroll', posicionar, true);
      window.removeEventListener('resize', posicionar);
    };
  }, [anchorEl]);

  // ── Fechar com clique fora / Esc ──
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorEl.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorEl, onClose]);

  const dias = useMemo(
    () => eachDayOfInterval({ start: startOfWeek(startOfMonth(mes)), end: endOfWeek(endOfMonth(mes)) }),
    [mes],
  );
  const podeAvancar = !isAfter(addMonths(mes, 1), hoje);

  const irPara = (d: Date, h?: string) => {
    const novoMes = startOfMonth(d);
    setDirecao(novoMes > mes ? 1 : novoMes < mes ? -1 : 0);
    setMes(novoMes);
    setDia(startOfDay(d));
    if (h) setHora(h);
  };

  const atalhos = [
    { label: 'Agora', acao: () => { const n = new Date(); irPara(n, `${pad(n.getHours())}:${pad(n.getMinutes())}`); } },
    { label: 'Ontem', acao: () => irPara(subDays(new Date(), 1)) },
    { label: 'Há 7 dias', acao: () => irPara(subDays(new Date(), 7)) },
  ];

  const salvar = async () => {
    if (noFuturo || saving) return;
    const ok = await onSave(escolhida.toISOString());
    if (ok) onClose();
  };

  return createPortal(
    <motion.div
      ref={panelRef}
      role="dialog"
      aria-label="Editar data de envio"
      initial={{ opacity: 0, y: pos?.acima ? 8 : -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: PANEL_WIDTH, zIndex: 60 }}
      className="rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') salvar(); }}
    >
      {/* Prévia da data escolhida */}
      <div className="bg-gradient-to-br from-emerald-500 to-teal-600 px-4 py-3 text-white">
        <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-100">Data de envio</p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={escolhida.getTime()}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            <p className="text-base font-semibold leading-tight mt-0.5">
              {capitalizar(format(escolhida, "EEEE, d 'de' MMM", { locale: ptBR }))}
              <span className="font-normal text-emerald-100"> · {format(escolhida, 'HH:mm')}</span>
            </p>
            <p className="text-xs text-emerald-100 mt-0.5">
              {noFuturo ? 'no futuro' : formatDistanceToNow(escolhida, { locale: ptBR, addSuffix: true })}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="p-3 space-y-3">
        {/* Atalhos */}
        <div className="flex gap-1.5">
          {atalhos.map(a => (
            <motion.button
              key={a.label}
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={a.acao}
              className="flex-1 rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
            >
              {a.label}
            </motion.button>
          ))}
        </div>

        {/* Navegação de mês */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => { setDirecao(-1); setMes(m => subMonths(m, 1)); }}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Mês anterior"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 capitalize">
            <CalendarDaysIcon className="h-4 w-4 text-emerald-600" />
            {format(mes, 'MMMM yyyy', { locale: ptBR })}
          </span>
          <button
            type="button"
            onClick={() => { setDirecao(1); setMes(m => addMonths(m, 1)); }}
            disabled={!podeAvancar}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Próximo mês"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Calendário */}
        <div>
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className="text-center text-[10px] font-semibold text-gray-400">{w}</span>
            ))}
          </div>
          <div className="relative overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false} custom={direcao}>
              <motion.div
                key={mes.getTime()}
                custom={direcao}
                initial={{ x: direcao * 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direcao * -40, opacity: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="grid grid-cols-7 gap-y-0.5"
              >
                {dias.map(d => {
                  const futuro = isAfter(d, hoje);
                  const selecionado = isSameDay(d, dia);
                  const ehHoje = isSameDay(d, hoje);
                  const foraDoMes = !isSameMonth(d, mes);
                  return (
                    <button
                      key={d.getTime()}
                      type="button"
                      disabled={futuro}
                      onClick={() => irPara(d)}
                      className={`relative mx-auto h-8 w-8 rounded-full text-xs transition-colors
                        ${futuro ? 'text-gray-200 cursor-not-allowed' : 'hover:bg-emerald-50'}
                        ${!futuro && foraDoMes ? 'text-gray-300' : ''}
                        ${!futuro && !foraDoMes && !selecionado ? 'text-gray-700' : ''}
                        ${ehHoje && !selecionado ? 'font-bold text-emerald-600' : ''}`}
                    >
                      {selecionado && (
                        <motion.span
                          layoutId="ebef-dia-selecionado"
                          className="absolute inset-0 rounded-full bg-emerald-600 shadow-md shadow-emerald-600/30"
                          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                        />
                      )}
                      <span className={`relative ${selecionado ? 'text-white font-semibold' : ''}`}>
                        {format(d, 'd')}
                      </span>
                    </button>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Hora */}
        <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-1.5 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition">
          <ClockIcon className="h-4 w-4 text-gray-400" />
          <span className="text-xs text-gray-500">Hora</span>
          <input
            type="time"
            value={hora}
            onChange={(e) => e.target.value && setHora(e.target.value)}
            className="ml-auto border-0 p-0 text-sm font-medium text-gray-800 focus:ring-0 bg-transparent"
          />
        </label>

        {/* Ações */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100"
          >
            Cancelar
          </button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={salvar}
            disabled={noFuturo || saving || semMudanca}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none transition-colors"
          >
            {saving
              ? <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              : <CheckIcon className="h-3.5 w-3.5" />}
            {saving ? 'Salvando' : 'Salvar'}
          </motion.button>
        </div>
      </div>
    </motion.div>,
    document.body,
  );
}
