/**
 * DARF numerado — emissão pela DCTFWeb.
 *
 * O formulário é curto de propósito: a guia numerada já vem vinculada ao débito
 * da declaração, então não há valor, código de receita, multa nem juros para
 * informar. Só se diz QUAL declaração se quer pagar.
 *
 * Se algum dia aparecer aqui um campo de valor, é sinal de que quem mexeu
 * queria o Sicalc — e provavelmente vai gerar um DARF que não bate com o que
 * foi declarado.
 */

import React, { useMemo, useState } from 'react';
import {
  DocumentCheckIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowTopRightOnSquareIcon,
  ChevronDownIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import {
  darfService,
  formatMoeda,
  formatData,
  type CategoriaDctfWeb,
  type CategoriaId,
  type GuiaEmitida,
  type FormularioGuia,
} from '../../services/darf';
import { useToast } from '../../hooks/useToast';
import SeletorCliente, { type ClienteOpcao } from './SeletorCliente';

// ─── Peças de formulário ───────────────────────────────────────────────────

const rotulo = 'block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5';

const campo =
  'h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-900 ' +
  'outline-none transition placeholder:text-gray-400 ' +
  'focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10';

/**
 * `<select>` nativo com a seta do sistema escondida e uma nossa por cima.
 * A do sistema muda de desenho e de tamanho entre Windows, macOS e Linux, e é
 * o que mais denuncia um formulário sem acabamento.
 */
const Selecao: React.FC<{
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}> = ({ value, onChange, children, className = '' }) => (
  <div className="relative">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${campo} appearance-none pr-10 cursor-pointer ${className}`}
    >
      {children}
    </select>
    <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
  </div>
);

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/**
 * Competência anterior à atual — o padrão certo quase sempre.
 *
 * Folha se fecha no mês seguinte: em setembro se paga a de agosto. Abrir a tela
 * já no mês corrente faria todo mundo trocar para o anterior toda vez.
 */
function competenciaPadrao(): { ano: string; mes: string } {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { ano: String(d.getFullYear()), mes: String(d.getMonth() + 1).padStart(2, '0') };
}

/** Um número do painel de resultado. */
const Stat: React.FC<{
  titulo: string;
  valor: string;
  destaque?: boolean;
  tom?: 'neutro' | 'ambar' | 'verde';
}> = ({ titulo, valor, destaque = false, tom = 'neutro' }) => (
  <div>
    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{titulo}</div>
    <div
      className={`tabular-nums leading-tight ${
        destaque ? 'text-2xl font-bold' : 'text-base font-semibold'
      } ${tom === 'ambar' ? 'text-amber-700' : tom === 'verde' ? 'text-emerald-700' : 'text-gray-900'}`}
    >
      {valor}
    </div>
  </div>
);

// ─── Formulário ────────────────────────────────────────────────────────────

const GuiaDctfWebForm: React.FC<{
  cliente: ClienteOpcao | null;
  onCliente: (c: ClienteOpcao | null) => void;
  categorias: CategoriaDctfWeb[];
  onEmitido: () => void;
}> = ({ cliente, onCliente, categorias, onEmitido }) => {
  const toast = useToast();
  const padrao = useMemo(competenciaPadrao, []);

  const [form, setForm] = useState<Partial<FormularioGuia>>({
    categoria: 'GERAL_MENSAL',
    anoPA: padrao.ano,
    mesPA: padrao.mes,
  });
  const [emitindo, setEmitindo] = useState(false);
  const [emitida, setEmitida] = useState<GuiaEmitida | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [avancado, setAvancado] = useState(false);

  const set = <K extends keyof FormularioGuia>(k: K, v: FormularioGuia[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const cat = categorias.find((c) => c.id === form.categoria);

  /**
   * O que ainda falta, em texto.
   *
   * Um botão cinza que não diz por que está cinza obriga o usuário a caçar o
   * campo vazio. Dizer o que falta custa uma linha e resolve.
   */
  const faltando = useMemo(() => {
    const f: string[] = [];
    if (!cliente) f.push('o contribuinte');
    if (!/^\d{4}$/.test(form.anoPA ?? '')) f.push('o ano');
    if (cat?.exigeMes && !form.mesPA) f.push('o mês');
    if (cat?.exigeDia && !form.diaPA) f.push('o dia');
    if (cat?.exigeCno && !form.cnoAfericao) f.push('o CNO da obra');
    if (cat?.exigeProcesso && !form.numProcReclamatoria) f.push('o número do processo');
    return f;
  }, [cliente, cat, form]);

  const podeEmitir = faltando.length === 0 && !!cat;

  /** Resumo do que será pedido — confere antes de gastar uma ida ao SERPRO. */
  const resumo = useMemo(() => {
    if (!cliente || !cat) return null;
    const quando = cat.exigeMes && form.mesPA ? `${form.mesPA}/${form.anoPA}` : form.anoPA;
    return `${cat.rotulo} · ${quando}`;
  }, [cliente, cat, form]);

  const emitir = async () => {
    if (!cliente || !cat) return;
    setEmitindo(true);
    setErro(null);
    try {
      const { guia, aviso } = await darfService.emitirGuia({
        ...(form as FormularioGuia),
        contribuinte: cliente.cnpj,
        // Categorias de 13º não têm mês. Mandar um mês nelas é o que a
        // documentação exclui, e o backend também remove — aqui é só para o
        // corpo da requisição não carregar um campo que não vale.
        mesPA: cat.exigeMes ? form.mesPA : undefined,
      });
      setEmitida(guia);
      if (aviso) toast.warning(aviso, 9000);
      else toast.success('Guia gerada.');
      onEmitido();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setEmitindo(false);
    }
  };

  const abrirPdf = () => {
    if (!emitida) return;
    // URL do servidor, não blob: a tela roda em HTTP na rede do escritório
    // (contexto não seguro), onde o download por blob trava embora funcione
    // em localhost.
    if (emitida.id) {
      window.open(darfService.urlPdf(emitida.id), '_blank', 'noopener');
      return;
    }
    const bytes = Uint8Array.from(atob(emitida.pdfBase64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `DARF-${cliente?.cnpj ?? ''}-${emitida.numeroDocumento || 'guia'}.pdf`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const acrescimos =
    emitida?.lidos.valorTotal != null && emitida?.lidos.valorPrincipal != null
      ? emitida.lidos.valorTotal - emitida.lidos.valorPrincipal
      : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
      {/* ─── Cabeçalho ─────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center gap-3 border-b border-gray-100 bg-gradient-to-r from-emerald-50/70 to-transparent px-6 py-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
          <DocumentCheckIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold leading-tight text-gray-900">
            Emitir DARF numerado
          </h2>
          <p className="text-xs text-gray-500">
            A guia vem vinculada à declaração — os valores são os declarados, não informados aqui.
          </p>
        </div>
        <span className="hidden shrink-0 rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-gray-500 ring-1 ring-gray-200 sm:inline">
          DCTFWeb · Integra Contador
        </span>
      </header>

      <div className="p-6">
        {/* ─── Contribuinte ────────────────────────────────────────────── */}
        <div className="mb-5">
          <label className={rotulo}>Contribuinte</label>
          <SeletorCliente
            valor={cliente}
            onChange={(c) => {
              onCliente(c);
              setEmitida(null);
              setErro(null);
            }}
          />
        </div>

        {/* ─── Declaração e período ────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label className={rotulo}>Categoria da declaração</label>
            <Selecao
              value={form.categoria ?? 'GERAL_MENSAL'}
              onChange={(v) => {
                setForm((f) => ({ ...f, categoria: v as CategoriaId }));
                setEmitida(null);
              }}
            >
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.rotulo}
                </option>
              ))}
            </Selecao>
          </div>

          <div>
            <label className={rotulo}>Ano</label>
            <input
              type="text"
              inputMode="numeric"
              value={form.anoPA ?? ''}
              onChange={(e) => set('anoPA', e.target.value.replace(/\D/g, '').slice(0, 4))}
              className={`${campo} tabular-nums`}
            />
          </div>

          {/* Sem mês nas categorias de 13º: o décimo terceiro é anual. Em vez
              de desabilitar um campo vazio, explicamos por que ele sumiu. */}
          {cat?.exigeMes ? (
            <div>
              <label className={rotulo}>Mês</label>
              <Selecao value={form.mesPA ?? ''} onChange={(v) => set('mesPA', v)}>
                <option value="">—</option>
                {MESES.map((m, i) => (
                  <option key={m} value={String(i + 1).padStart(2, '0')}>
                    {m}
                  </option>
                ))}
              </Selecao>
            </div>
          ) : (
            <div className="flex items-end">
              <p className="rounded-xl bg-gray-50 px-3 py-2.5 text-[11px] leading-snug text-gray-500 ring-1 ring-gray-100">
                Categoria anual — não tem mês de apuração.
              </p>
            </div>
          )}

          {cat?.exigeDia && (
            <div>
              <label className={rotulo}>Dia</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.diaPA ?? ''}
                onChange={(e) => set('diaPA', e.target.value.replace(/\D/g, '').slice(0, 2))}
                className={`${campo} tabular-nums`}
              />
            </div>
          )}

          {cat?.exigeCno && (
            <div>
              <label className={rotulo}>CNO da obra</label>
              <input
                type="text"
                value={form.cnoAfericao ?? ''}
                onChange={(e) => set('cnoAfericao', e.target.value.replace(/\D/g, ''))}
                className={`${campo} font-mono`}
              />
            </div>
          )}

          {cat?.exigeProcesso && (
            <div className="sm:col-span-2">
              <label className={rotulo}>Número do processo</label>
              <input
                type="text"
                value={form.numProcReclamatoria ?? ''}
                onChange={(e) => set('numProcReclamatoria', e.target.value)}
                className={`${campo} font-mono`}
              />
            </div>
          )}
        </div>

        {/* ─── Avançado ────────────────────────────────────────────────── */}
        {/* Recibo e data de acolhimento quase nunca são preenchidos: sem recibo
            a RFB usa o mais recente, que é o que se quer. Escondidos para não
            sugerir que precisam de decisão. */}
        <button
          type="button"
          onClick={() => setAvancado((v) => !v)}
          className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-gray-500 transition hover:text-gray-800"
        >
          <ChevronDownIcon
            className={`h-3.5 w-3.5 transition-transform ${avancado ? 'rotate-180' : ''}`}
          />
          Opções avançadas
        </button>

        {avancado && (
          <div className="mt-3 grid gap-4 rounded-xl bg-gray-50/80 p-4 ring-1 ring-gray-100 sm:grid-cols-2">
            <div>
              <label className={rotulo}>Recibo da declaração</label>
              <input
                type="text"
                value={form.numeroReciboEntrega ?? ''}
                onChange={(e) => set('numeroReciboEntrega', e.target.value.replace(/\D/g, ''))}
                placeholder="vazio = a RFB usa o mais recente"
                className={`${campo} font-mono`}
              />
            </div>
            <div>
              <label className={rotulo}>Data de pagamento pretendida</label>
              <input
                type="date"
                value={form.dataAcolhimento ?? ''}
                onChange={(e) => set('dataAcolhimento', e.target.value)}
                className={campo}
              />
            </div>
          </div>
        )}

        {erro && (
          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p className="text-sm leading-snug text-red-900">{erro}</p>
          </div>
        )}

        {/* ─── Ação ────────────────────────────────────────────────────── */}
        <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-gray-100 pt-5">
          <button
            type="button"
            onClick={emitir}
            disabled={!podeEmitir || emitindo}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500
              to-teal-600 px-6 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25
              transition hover:shadow-emerald-500/40 hover:brightness-105 active:scale-[.99]
              disabled:cursor-not-allowed disabled:from-gray-200 disabled:to-gray-200
              disabled:text-gray-400 disabled:shadow-none"
          >
            {emitindo ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Gerando…
              </>
            ) : (
              <>
                <SparklesIcon className="h-4 w-4" />
                Gerar guia
              </>
            )}
          </button>

          {emitindo ? (
            <span className="text-xs text-gray-500">
              Consultando a Receita — pode levar alguns segundos.
            </span>
          ) : faltando.length ? (
            <span className="text-xs text-gray-500">Falta escolher {faltando.join(' e ')}.</span>
          ) : (
            resumo && (
              <span className="min-w-0 text-xs text-gray-600">
                <span className="font-semibold text-gray-800">{cliente?.nome}</span> · {resumo}
              </span>
            )
          )}
        </div>
      </div>

      {/* ─── Resultado ─────────────────────────────────────────────────── */}
      {emitida && (
        <div className="border-t-2 border-emerald-200 bg-gradient-to-b from-emerald-50/80 to-white px-6 py-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
            <span className="text-sm font-bold text-emerald-900">Guia gerada</span>
            {emitida.numeroDocumento && (
              <span className="rounded-md bg-white px-2 py-0.5 font-mono text-xs text-emerald-800 ring-1 ring-emerald-200">
                {emitida.numeroDocumento}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="grid flex-1 grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
              <Stat titulo="Principal" valor={formatMoeda(emitida.lidos.valorPrincipal)} />
              <Stat
                titulo="Multa e juros"
                tom="ambar"
                valor={acrescimos != null && acrescimos > 0 ? formatMoeda(acrescimos) : '—'}
              />
              <Stat
                titulo="Total a pagar"
                valor={formatMoeda(emitida.lidos.valorTotal)}
                destaque
                tom="verde"
              />
              <Stat titulo="Pagar até" valor={formatData(emitida.lidos.vencimento)} />
            </div>

            <button
              type="button"
              onClick={abrirPdf}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-5
                text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition
                hover:bg-emerald-700 active:scale-[.99]"
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              Abrir PDF
            </button>
          </div>

          {emitida.lidos.numeroRecibo && (
            <p className="mt-3 text-[11px] text-gray-500">
              Recibo da declaração{' '}
              <span className="font-mono text-gray-700">{emitida.lidos.numeroRecibo}</span>
            </p>
          )}

          {/* Os valores vêm da leitura do PDF, não de um campo da API. Quando a
              leitura falha, dizer isso é melhor do que mostrar traços e deixar
              o usuário achar que a guia veio zerada. */}
          {emitida.lidos.valorTotal == null && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800 ring-1 ring-amber-200">
              Não foi possível ler os valores do PDF — abra o documento para conferi-los. A guia em
              si está correta.
            </p>
          )}
        </div>
      )}
    </section>
  );
};

export default GuiaDctfWebForm;
