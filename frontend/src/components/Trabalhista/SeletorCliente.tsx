/**
 * Busca de contribuinte por nome ou CNPJ, com debounce.
 *
 * Não é um <select> com os 132 clientes carregados: a lista muda, e um select
 * longo é pior de usar do que digitar três letras do nome.
 *
 * Vive fora do formulário porque a busca de contribuinte não tem nada de
 * específico da emissão de DARF: é a mesma pergunta que qualquer outra tela
 * desta aba vai fazer primeiro.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  BuildingOffice2Icon,
} from '@heroicons/react/24/outline';
import { clientesService } from '../../services/clientes';
import { formatCnpj } from '../../services/darf';

export type ClienteOpcao = { cnpj: string; nome: string };

/** Iniciais da razão social, para o avatar. "CENTRAL CONTABIL LTDA" -> "CC". */
function iniciais(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    // Preposições não dizem nada e roubariam a segunda letra útil.
    .filter((p) => p.length > 2 && !['DE', 'DA', 'DO', 'DAS', 'DOS', 'E'].includes(p.toUpperCase()));
  return (partes[0]?.[0] ?? '?').toUpperCase() + (partes[1]?.[0] ?? '').toUpperCase();
}

const SeletorCliente: React.FC<{
  valor: ClienteOpcao | null;
  onChange: (c: ClienteOpcao | null) => void;
}> = ({ valor, onChange }) => {
  const [busca, setBusca] = useState('');
  const [opcoes, setOpcoes] = useState<ClienteOpcao[]>([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Clicar fora fecha a lista. Sem isso ela fica pendurada sobre o resto do
  // formulário e tapa os campos seguintes.
  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2) {
      setOpcoes([]);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    const t = window.setTimeout(async () => {
      try {
        const { items } = await clientesService.getAll({
          search: termo,
          limit: 20,
          ativo: 'ativos',
        });
        if (cancelado) return;
        setOpcoes(
          items
            .map((c) => ({
              cnpj: (c.cnpj_limpo || c.cnpj || '').replace(/\D/g, ''),
              nome: c.razao_social || c.nome || '',
            }))
            .filter((c) => c.cnpj.length === 14)
        );
      } catch {
        if (!cancelado) setOpcoes([]);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }, 350);
    return () => {
      cancelado = true;
      window.clearTimeout(t);
    };
  }, [busca]);

  if (valor) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-600 text-xs font-bold text-white">
          {iniciais(valor.nome)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-gray-900">{valor.nome}</div>
          <div className="text-xs tabular-nums text-gray-500">{formatCnpj(valor.cnpj)}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setBusca('');
          }}
          className="shrink-0 rounded-lg p-1.5 text-gray-400 transition hover:bg-white hover:text-gray-700"
          title="Trocar de contribuinte"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={caixa}>
      <MagnifyingGlassIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        value={busca}
        onChange={(e) => {
          setBusca(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        placeholder="Buscar cliente por nome ou CNPJ…"
        className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3.5 text-sm
          text-gray-900 outline-none transition placeholder:text-gray-400
          focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10"
      />

      {aberto && busca.trim().length >= 2 && (
        <div className="absolute z-30 mt-1.5 max-h-72 w-full overflow-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl shadow-gray-900/5">
          {carregando && (
            <div className="px-3 py-3 text-sm text-gray-500">Buscando…</div>
          )}
          {!carregando && opcoes.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-gray-500">
              <BuildingOffice2Icon className="h-4 w-4 text-gray-300" />
              Nenhum cliente ativo encontrado.
            </div>
          )}
          {opcoes.map((o) => (
            <button
              key={o.cnpj}
              type="button"
              onClick={() => {
                onChange(o);
                setAberto(false);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-emerald-50"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gray-100 text-[10px] font-bold text-gray-600">
                {iniciais(o.nome)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm text-gray-800">{o.nome}</span>
                <span className="block text-xs tabular-nums text-gray-500">
                  {formatCnpj(o.cnpj)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SeletorCliente;
