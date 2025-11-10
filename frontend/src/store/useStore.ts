import { create } from 'zustand';
import type { Cliente, DCTF, DCTFDados, Analise, Flag, Relatorio } from '../types';

interface AppState {
  // Clientes
  clientes: Cliente[];
  setClientes: (clientes: Cliente[]) => void;
  addCliente: (cliente: Cliente) => void;
  updateCliente: (id: string, cliente: Partial<Cliente>) => void;
  removeCliente: (id: string) => void;

  // DCTF
  dctfs: DCTF[];
  setDCTFs: (dctfs: DCTF[]) => void;
  addDCTF: (dctf: DCTF) => void;
  updateDCTF: (id: string, dctf: Partial<DCTF>) => void;
  removeDCTF: (id: string) => void;

  // DCTF Dados
  dctfDados: DCTFDados[];
  setDCTFDados: (dados: DCTFDados[]) => void;
  addDCTFDados: (dados: DCTFDados) => void;
  updateDCTFDados: (id: string, dados: Partial<DCTFDados>) => void;
  removeDCTFDados: (id: string) => void;

  // Análises
  analises: Analise[];
  setAnalises: (analises: Analise[]) => void;
  addAnalise: (analise: Analise) => void;
  updateAnalise: (id: string, analise: Partial<Analise>) => void;
  removeAnalise: (id: string) => void;

  // Flags
  flags: Flag[];
  setFlags: (flags: Flag[]) => void;
  addFlag: (flag: Flag) => void;
  updateFlag: (id: string, flag: Partial<Flag>) => void;
  removeFlag: (id: string) => void;

  // Relatórios
  relatorios: Relatorio[];
  setRelatorios: (relatorios: Relatorio[]) => void;
  addRelatorio: (relatorio: Relatorio) => void;
  updateRelatorio: (id: string, relatorio: Partial<Relatorio>) => void;
  removeRelatorio: (id: string) => void;

  // UI State
  loading: boolean;
  setLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export const useStore = create<AppState>((set) => ({
  // Clientes
  clientes: [],
  setClientes: (clientes) => set({ clientes }),
  addCliente: (cliente) => set((state) => ({ clientes: [...state.clientes, cliente] })),
  updateCliente: (id, cliente) => set((state) => ({
    clientes: state.clientes.map(c => c.id === id ? { ...c, ...cliente } : c)
  })),
  removeCliente: (id) => set((state) => ({
    clientes: state.clientes.filter(c => c.id !== id)
  })),

  // DCTF
  dctfs: [],
  setDCTFs: (dctfs) => set({ dctfs }),
  addDCTF: (dctf) => set((state) => ({ dctfs: [...state.dctfs, dctf] })),
  updateDCTF: (id, dctf) => set((state) => ({
    dctfs: state.dctfs.map(d => d.id === id ? { ...d, ...dctf } : d)
  })),
  removeDCTF: (id) => set((state) => ({
    dctfs: state.dctfs.filter(d => d.id !== id)
  })),

  // DCTF Dados
  dctfDados: [],
  setDCTFDados: (dados) => set({ dctfDados: dados }),
  addDCTFDados: (dados) => set((state) => ({ dctfDados: [...state.dctfDados, dados] })),
  updateDCTFDados: (id, dados) => set((state) => ({
    dctfDados: state.dctfDados.map(d => d.id === id ? { ...d, ...dados } : d)
  })),
  removeDCTFDados: (id) => set((state) => ({
    dctfDados: state.dctfDados.filter(d => d.id !== id)
  })),

  // Análises
  analises: [],
  setAnalises: (analises) => set({ analises }),
  addAnalise: (analise) => set((state) => ({ analises: [...state.analises, analise] })),
  updateAnalise: (id, analise) => set((state) => ({
    analises: state.analises.map(a => a.id === id ? { ...a, ...analise } : a)
  })),
  removeAnalise: (id) => set((state) => ({
    analises: state.analises.filter(a => a.id !== id)
  })),

  // Flags
  flags: [],
  setFlags: (flags) => set({ flags }),
  addFlag: (flag) => set((state) => ({ flags: [...state.flags, flag] })),
  updateFlag: (id, flag) => set((state) => ({
    flags: state.flags.map(f => f.id === id ? { ...f, ...flag } : f)
  })),
  removeFlag: (id) => set((state) => ({
    flags: state.flags.filter(f => f.id !== id)
  })),

  // Relatórios
  relatorios: [],
  setRelatorios: (relatorios) => set({ relatorios }),
  addRelatorio: (relatorio) => set((state) => ({ relatorios: [...state.relatorios, relatorio] })),
  updateRelatorio: (id, relatorio) => set((state) => ({
    relatorios: state.relatorios.map(r => r.id === id ? { ...r, ...relatorio } : r)
  })),
  removeRelatorio: (id) => set((state) => ({
    relatorios: state.relatorios.filter(r => r.id !== id)
  })),

  // UI State
  loading: false,
  setLoading: (loading) => set({ loading }),
  error: null,
  setError: (error) => set({ error }),
}));
