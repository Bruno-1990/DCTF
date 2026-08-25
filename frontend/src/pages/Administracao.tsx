import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { dctfService } from '../services/dctf';
import { sendEmailSemDCTFComMovimento } from '../services/conferences-modules';
import { relatoriosService } from '../services/relatorios';
import { clientesService } from '../services/clientes';
import { ExclamationTriangleIcon, DocumentArrowDownIcon, TrashIcon, LockClosedIcon, ArrowPathIcon, ArrowLeftIcon, DocumentTextIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { exportToExcel, formatarValorLegivel } from '../utils/exportExcel';

const ADMIN_CREDENTIALS = {
  username: 'Admin',
  password: 'Admin',
};

const STORAGE_KEY = 'dctf_admin_authenticated';
// AUTH_TIMEOUT removido - não expira automaticamente na aba admin para não atrapalhar consultas em lote

const Administracao: React.FC = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearConfirmCode, setClearConfirmCode] = useState('');
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);
  const [clearSuccess, setClearSuccess] = useState<string | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{
    total: number;
    processed: number;
    inserted: number;
    updated: number;
    errors: number;
    skippedDuplicate?: number;
    skippedIds?: string[];
    currentBatch: number;
    totalBatches: number;
    errorLog?: string[];
  } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [lastSyncErrors, setLastSyncErrors] = useState<string[]>([]);
  const [lastBackup, setLastBackup] = useState<{ dateFormatted: string } | null>(null);
  const [restoring, setRestoring] = useState(false);
  
  // Estados para envio de email (destino dinâmico: usuário digita nome, sufixo @central-rnc.com.br)
  const EMAIL_SUFFIX = '@central-rnc.com.br';
  const [emailDestinoInput, setEmailDestinoInput] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Estados para envio de email "Clientes sem DCTF mas com Movimento"
  const [emailDestinoSemDCTFInput, setEmailDestinoSemDCTFInput] = useState('');
  const [sendingEmailSemDCTF, setSendingEmailSemDCTF] = useState(false);
  const [emailSuccessSemDCTF, setEmailSuccessSemDCTF] = useState<string | null>(null);
  const [emailErrorSemDCTF, setEmailErrorSemDCTF] = useState<string | null>(null);

  const getEmailDestinoCompleto = (): string => {
    const v = emailDestinoInput.trim();
    if (!v) return '';
    return v.includes('@') ? v : `${v}${EMAIL_SUFFIX}`;
  };
  const emailDestinoValido = (): boolean => {
    const full = getEmailDestinoCompleto();
    return full.length > 0 && full.toLowerCase().endsWith(EMAIL_SUFFIX) && full.indexOf('@') > 0;
  };
  const aplicaAutocompleteEmail = () => {
    const v = emailDestinoInput.trim();
    if (v && !v.includes('@')) setEmailDestinoInput(`${v}${EMAIL_SUFFIX}`);
  };

  const getEmailDestinoSemDCTFCompleto = (): string => {
    const v = emailDestinoSemDCTFInput.trim();
    if (!v) return '';
    return v.includes('@') ? v : `${v}${EMAIL_SUFFIX}`;
  };
  const emailDestinoSemDCTFValido = (): boolean => {
    const full = getEmailDestinoSemDCTFCompleto();
    return full.length > 0 && full.toLowerCase().endsWith(EMAIL_SUFFIX) && full.indexOf('@') > 0;
  };
  const aplicaAutocompleteEmailSemDCTF = () => {
    const v = emailDestinoSemDCTFInput.trim();
    if (v && !v.includes('@')) setEmailDestinoSemDCTFInput(`${v}${EMAIL_SUFFIX}`);
  };
  
  // Estados para atualização do cadastro pelo cartão CNPJ (ReceitaWS),
  // de forma não-destrutiva: nada que já existe no cadastro é apagado
  const [atualizandoRazao, setAtualizandoRazao] = useState(false);
  const [razaoSimular, setRazaoSimular] = useState(false);
  const [razaoIgnorarCaixa, setRazaoIgnorarCaixa] = useState(true);
  const [razaoSomenteNome, setRazaoSomenteNome] = useState(false);
  const cancelarRazaoRef = useRef(false);
  const [razaoProgresso, setRazaoProgresso] = useState<{
    total: number;
    processados: number;
    atualizados: number;
    semAlteracao: number;
    erros: number;
    atual: string;
    segundosRestantes: number;
  } | null>(null);
  type RazaoResultado = {
    total: number;
    atualizados: number;
    semAlteracao: number;
    erros: number;
    cancelado: boolean;
    simulado: boolean;
    salvoEm?: string;
    itens: Array<{
      cnpj: string;
      status: string;
      antes: string;
      depois?: string;
      erro?: string;
      clienteId?: string;
      alteracoes?: Array<{ campo: string; antes: any; depois: any }>;
      sociosNovos?: Array<{ nome: string; qual?: string | null }>;
      sociosQualificacao?: Array<{ socio_id: string; nome: string; antes: any; depois: string }>;
      sociosAusentes?: string[];
    }>;
  };

  // A simulação leva ~73 min. Guardamos o resultado no navegador para que
  // recarregar a página (ou voltar depois) não obrigue a rodar tudo de novo.
  const RAZAO_STORAGE_KEY = 'dctf_simulacao_cartao_cnpj';

  const [razaoResultado, setRazaoResultado] = useState<RazaoResultado | null>(() => {
    try {
      const bruto = localStorage.getItem(RAZAO_STORAGE_KEY);
      return bruto ? (JSON.parse(bruto) as RazaoResultado) : null;
    } catch {
      return null;
    }
  });

  // Persiste (ou limpa) o resultado sempre que ele muda.
  useEffect(() => {
    try {
      if (razaoResultado) {
        localStorage.setItem(RAZAO_STORAGE_KEY, JSON.stringify(razaoResultado));
      } else {
        localStorage.removeItem(RAZAO_STORAGE_KEY);
      }
    } catch {
      // Sem espaço no localStorage: o relatório segue disponível na tela.
    }
  }, [razaoResultado]);
  const [razaoError, setRazaoError] = useState<string | null>(null);

  // Registro do que a ReceitaWS já alterou no cadastro (histórico gravado no banco)
  const [histDesde, setHistDesde] = useState('');
  const [histAte, setHistAte] = useState('');
  const [histBaixando, setHistBaixando] = useState(false);
  const [histResumo, setHistResumo] = useState<string | null>(null);
  const [histErro, setHistErro] = useState<string | null>(null);

  // Gravação do que foi calculado na simulação (não consulta a ReceitaWS de novo)
  const [aplicandoSimulacao, setAplicandoSimulacao] = useState(false);
  const [aplicacaoResultado, setAplicacaoResultado] = useState<{
    clientes: number;
    camposGravados: number;
    sociosInseridos: number;
    sociosMarcados: number;
    conflitos: Array<{ cliente: string; campo: string; esperado: any; encontrado: any }>;
    erros: Array<{ cliente: string; erro: string }>;
  } | null>(null);

  // Estados para consulta em lote de Situação Fiscal
  const [consultandoSITF, setConsultandoSITF] = useState(false);
  const [progressIdSITF, setProgressIdSITF] = useState<string | null>(null);
  const [apenasFaltantesSITF, setApenasFaltantesSITF] = useState(true); // Por padrão, processar apenas faltantes
  const [progressoSITF, setProgressoSITF] = useState<{
    total: number;
    processados: number;
    sucessos: number;
    erros: number;
    porcentagem: number;
    cnpjAtual?: string;
    status: 'em_andamento' | 'concluida' | 'erro' | 'cancelada';
    erros_detalhados?: Array<{ cnpj: string; razao_social: string; erro: string }>;
  } | null>(null);
  const [resultadoSITF, setResultadoSITF] = useState<any>(null);
  const [erroSITF, setErroSITF] = useState<string | null>(null);
  const pollingIntervalSITFRef = useRef<NodeJS.Timeout | null>(null);
  
  // Estados para consulta em lote de CNPJs pendentes (com divergências)
  const [populandoPendentes, setPopulandoPendentes] = useState(false);
  const [totalPendentes, setTotalPendentes] = useState<number | null>(null);
  const [consultandoPendentes, setConsultandoPendentes] = useState(false);
  const [progressIdPendentes, setProgressIdPendentes] = useState<string | null>(null);

  // Função para verificar progresso SITF
  const verificarProgressoSITF = async (progressId: string) => {
    try {
      const progressRes = await axios.get(`/api/situacao-fiscal/lote/progresso/${progressId}`);
      const data = progressRes.data.data;
      
      setProgressoSITF(data);
      
      if (data.status === 'concluida' || data.status === 'erro' || data.status === 'cancelada') {
        if (pollingIntervalSITFRef.current) {
          clearInterval(pollingIntervalSITFRef.current);
          pollingIntervalSITFRef.current = null;
        }
        setConsultandoSITF(false);
        setConsultandoPendentes(false);
        setResultadoSITF(data);
        setProgressIdSITF(null);
        setProgressIdPendentes(null);
        // Atualizar total de pendentes após conclusão
        buscarTotalPendentes();
      }
    } catch (error: any) {
      console.error('[Administracao] Erro ao consultar progresso SITF:', error);
      // Se o progresso não for encontrado, parar o polling
      if (error.response?.status === 404) {
        if (pollingIntervalSITFRef.current) {
          clearInterval(pollingIntervalSITFRef.current);
          pollingIntervalSITFRef.current = null;
        }
        setConsultandoSITF(false);
        setProgressIdSITF(null);
      }
    }
  };

  // Verificar autenticação ao carregar
  // Não expira automaticamente - logout apenas manual para não atrapalhar consultas em lote
  useEffect(() => {
    const authData = sessionStorage.getItem(STORAGE_KEY);
    if (authData) {
      try {
        // Verificar se há dados de autenticação (formato antigo ou novo)
        const parsed = JSON.parse(authData);
        // Se existe autenticação, permitir acesso independente do timestamp
        setIsAuthenticated(true);
        setShowLoginModal(false);
      } catch {
        // Formato inválido, remover
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
    // Verificar se há processamento SITF em andamento no banco de dados
    const verificarProcessamentoSITF = async () => {
      try {
        const response = await axios.get('/api/situacao-fiscal/lote/em-andamento');
        if (response.data.success && response.data.emAndamento) {
          console.log('[Administracao] Processamento SITF em andamento encontrado:', response.data.progressId);
          setConsultandoSITF(true);
          setProgressIdSITF(response.data.progressId);
          // Iniciar polling
          if (!pollingIntervalSITFRef.current) {
            const interval = setInterval(() => {
              verificarProgressoSITF(response.data.progressId);
            }, 2000);
            pollingIntervalSITFRef.current = interval;
          }
          // Primeira verificação imediata
          verificarProgressoSITF(response.data.progressId);
        }
      } catch (error: any) {
        console.warn('[Administracao] Erro ao verificar processamento SITF em andamento:', error);
        // Não mostrar erro ao usuário, apenas log
      }
    };
    
    verificarProcessamentoSITF();
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
      setIsAuthenticated(true);
      setShowLoginModal(false);
      // Armazenar autenticação sem timeout - logout apenas manual
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ authenticated: true, timestamp: Date.now() }));
      setUsername('');
      setPassword('');
      // Não configurar timeout automático - não expira durante consultas em lote
    } else {
      setLoginError('Usuário ou senha incorretos');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setShowLoginModal(true);
    sessionStorage.removeItem(STORAGE_KEY);
    setUsername('');
    setPassword('');
  };

  // ReceitaWS (plano gratuito) aceita 3 consultas por minuto → 20s entre cada CNPJ.
  const RAZAO_INTERVALO_MS = 20000;

  /**
   * Descreve uma alteração de forma legível. Para a lista de CNAEs secundários,
   * despejar o array inteiro é ilegível (e truncado esconde a mudança real):
   * mostramos só os itens que entraram e saíram.
   */
  const descreverAlteracao = (alt: { campo: string; antes: any; depois: any }): React.ReactNode => {
    const comoTexto = (v: any) =>
      v === null || v === undefined || v === ''
        ? '(vazio)'
        : String(typeof v === 'object' ? JSON.stringify(v) : v);

    if (alt.campo === 'atividades_secundarias') {
      const normalizar = (v: any): Array<{ code?: string; text?: string }> => {
        try {
          const arr = typeof v === 'string' ? JSON.parse(v) : v;
          return Array.isArray(arr) ? arr : [];
        } catch {
          return [];
        }
      };
      const rotulo = (a: any) => `${a?.code || ''} ${a?.text || ''}`.trim();
      const antes = normalizar(alt.antes).map(rotulo);
      const depois = normalizar(alt.depois).map(rotulo);
      const removidos = antes.filter((x) => !depois.includes(x));
      const incluidos = depois.filter((x) => !antes.includes(x));

      return (
        <>
          {removidos.map((x, i) => (
            <div key={`r${i}`} className="text-red-700 line-through">− {x}</div>
          ))}
          {incluidos.map((x, i) => (
            <div key={`i${i}`} className="text-green-700">+ {x}</div>
          ))}
          {removidos.length === 0 && incluidos.length === 0 && (
            <span className="text-gray-500">(reordenação apenas)</span>
          )}
        </>
      );
    }

    return (
      <>
        <span className="text-red-700 line-through">{comoTexto(alt.antes).slice(0, 160)}</span>
        {' → '}
        <span className="text-green-700 font-semibold">{comoTexto(alt.depois).slice(0, 160)}</span>
      </>
    );
  };

  /**
   * Percorre todos os clientes com CNPJ válido e atualiza o cadastro com os
   * dados do cartão CNPJ (ReceitaWS), sem apagar nada do que já existe:
   * campo vazio é preenchido, campo desatualizado é corrigido, campo que a
   * Receita não informa fica como está. Nenhum cliente novo é criado.
   */
  const handleAtualizarRazoesSociais = async () => {
    cancelarRazaoRef.current = false;
    setAtualizandoRazao(true);
    setRazaoError(null);
    setRazaoResultado(null);

    try {
      // Carregar todos os clientes (paginado)
      let clientes: any[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await clientesService.getAll({ page, limit: 100 });
        if (response.items && response.items.length > 0) {
          clientes = [...clientes, ...response.items];
          if (response.pagination) {
            hasMore = page < response.pagination.totalPages;
            page++;
          } else {
            hasMore = response.items.length === 100;
            page++;
          }
        } else {
          hasMore = false;
        }
      }

      const clientesComCNPJ = clientes.filter((c: any) => {
        const cnpj = c.cnpj_limpo || c.cnpj;
        return cnpj && String(cnpj).replace(/\D/g, '').length === 14;
      });

      const total = clientesComCNPJ.length;
      const itens: Array<{
        cnpj: string;
        status: string;
        antes: string;
        depois?: string;
        erro?: string;
        clienteId?: string;
        alteracoes?: Array<{ campo: string; antes: any; depois: any }>;
        sociosNovos?: Array<{ nome: string; qual?: string | null }>;
        sociosQualificacao?: Array<{ socio_id: string; nome: string; antes: any; depois: string }>;
        sociosAusentes?: string[];
      }> = [];
      let atualizados = 0;
      let semAlteracao = 0;
      let erros = 0;

      setRazaoProgresso({
        total,
        processados: 0,
        atualizados: 0,
        semAlteracao: 0,
        erros: 0,
        atual: '',
        segundosRestantes: Math.round((total * RAZAO_INTERVALO_MS) / 1000),
      });

      for (let i = 0; i < total; i++) {
        if (cancelarRazaoRef.current) break;

        const cliente = clientesComCNPJ[i];
        const cnpj = String(cliente.cnpj_limpo || cliente.cnpj).replace(/\D/g, '');
        const razaoAtual = cliente.razao_social || cliente.nome || '';

        setRazaoProgresso(prev => (prev ? { ...prev, atual: `${razaoAtual} (${cnpj})` } : null));

        try {
          const resp = await clientesService.atualizarCadastroReceitaWS(cnpj, {
            dryRun: razaoSimular,
            ignorarCaixa: razaoIgnorarCaixa,
            somenteRazaoSocial: razaoSomenteNome,
          });

          const d = resp?.data || {};
          if (resp?.success && d.status === 'atualizado') {
            atualizados++;
            itens.push({
              cnpj,
              status: 'atualizado',
              antes: d.razao_social_antes || razaoAtual,
              depois: d.razao_social_depois,
              clienteId: d.cliente_id,
              alteracoes: d.alteracoes || [],
              sociosNovos: d.socios_novos || [],
              sociosQualificacao: d.socios_qualificacao || [],
              sociosAusentes: d.socios_ausentes_no_cartao || [],
            });
          } else if (resp?.success) {
            semAlteracao++;
            itens.push({
              cnpj,
              status: d.status || 'sem_alteracao',
              antes: d.razao_social_antes || razaoAtual,
              clienteId: d.cliente_id,
              sociosAusentes: d.socios_ausentes_no_cartao || [],
            });
          } else {
            erros++;
            itens.push({ cnpj, status: 'erro', antes: razaoAtual, erro: resp?.error || 'Erro desconhecido' });
          }
        } catch (error: any) {
          erros++;
          itens.push({
            cnpj,
            status: 'erro',
            antes: razaoAtual,
            erro: error?.response?.data?.error || error?.message || 'Erro ao consultar',
          });
        }

        const processados = i + 1;
        setRazaoProgresso(prev =>
          prev
            ? {
                ...prev,
                processados,
                atualizados,
                semAlteracao,
                erros,
                segundosRestantes: Math.round(((total - processados) * RAZAO_INTERVALO_MS) / 1000),
              }
            : null
        );

        // Respeitar o limite de 3 consultas/min (exceto após o último)
        if (processados < total) {
          const passos = RAZAO_INTERVALO_MS / 1000;
          for (let s = 0; s < passos; s++) {
            if (cancelarRazaoRef.current) break;
            await new Promise(resolve => setTimeout(resolve, 1000));
            setRazaoProgresso(prev =>
              prev ? { ...prev, segundosRestantes: Math.max(0, prev.segundosRestantes - 1) } : null
            );
          }
        }
      }

      setRazaoResultado({
        total,
        atualizados,
        semAlteracao,
        erros,
        cancelado: cancelarRazaoRef.current,
        simulado: razaoSimular,
        salvoEm: new Date().toISOString(),
        itens,
      });
      setRazaoProgresso(null);
    } catch (error: any) {
      setRazaoError(
        error?.response?.data?.error || error?.message || 'Erro ao atualizar razões sociais'
      );
      setRazaoProgresso(null);
    } finally {
      cancelarRazaoRef.current = false;
      setAtualizandoRazao(false);
    }
  };

  /**
   * Grava o que a simulação já calculou. Não consulta a ReceitaWS de novo, então
   * não há espera de 20s: roda em segundos. Cada campo só é gravado se o valor
   * no banco ainda for o mesmo de quando simulamos (o backend confere).
   */
  const handleAplicarSimulacao = async () => {
    if (!razaoResultado) return;

    setAplicandoSimulacao(true);
    setRazaoError(null);
    setAplicacaoResultado(null);

    try {
      // Inclui também quem não teve campo alterado mas tem sócio fora do cartão:
      // a flag de aviso precisa ser gravada nesses casos.
      const pendentes = razaoResultado.itens.filter(
        (it) => it.clienteId && (it.status === 'atualizado' || (it.sociosAusentes || []).length > 0)
      );

      let camposGravados = 0;
      let sociosInseridos = 0;
      let sociosMarcados = 0;
      const conflitos: Array<{ cliente: string; campo: string; esperado: any; encontrado: any }> = [];
      const erros: Array<{ cliente: string; erro: string }> = [];

      setRazaoProgresso({
        total: pendentes.length,
        processados: 0,
        atualizados: 0,
        semAlteracao: 0,
        erros: 0,
        atual: '',
        segundosRestantes: 0,
      });

      for (let i = 0; i < pendentes.length; i++) {
        const it = pendentes[i];
        setRazaoProgresso((prev) => (prev ? { ...prev, atual: `${it.antes} (${it.cnpj})` } : null));

        try {
          const resp = await clientesService.aplicarCadastroSimulado({
            cliente_id: it.clienteId!,
            alteracoes: it.alteracoes || [],
            socios_novos: it.sociosNovos || [],
            socios_qualificacao: it.sociosQualificacao || [],
            socios_ausentes_no_cartao: it.sociosAusentes || [],
            ignorarCaixa: razaoIgnorarCaixa,
          });

          const d = resp?.data || {};
          if (resp?.success) {
            camposGravados += (d.campos_gravados || []).length;
            sociosInseridos += (d.socios_inseridos || []).length;
            sociosMarcados += (d.socios_marcados_ausentes || []).length;
            for (const c of d.campos_em_conflito || []) {
              conflitos.push({ cliente: it.antes, campo: c.campo, esperado: c.esperado, encontrado: c.encontrado });
            }
          } else {
            erros.push({ cliente: it.antes, erro: resp?.error || 'Erro desconhecido' });
          }
        } catch (error: any) {
          erros.push({
            cliente: it.antes,
            erro: error?.response?.data?.error || error?.message || 'Erro ao gravar',
          });
        }

        setRazaoProgresso((prev) => (prev ? { ...prev, processados: i + 1 } : null));
      }

      setAplicacaoResultado({
        clientes: pendentes.length,
        camposGravados,
        sociosInseridos,
        sociosMarcados,
        conflitos,
        erros,
      });
      setRazaoProgresso(null);
      // A simulação já foi aplicada: some com o botão para não gravar duas vezes.
      setRazaoResultado((prev) => (prev ? { ...prev, simulado: false } : prev));
    } catch (error: any) {
      setRazaoError(error?.response?.data?.error || error?.message || 'Erro ao aplicar a simulação');
      setRazaoProgresso(null);
    } finally {
      setAplicandoSimulacao(false);
    }
  };

  /**
   * Baixa o relatório da simulação/gravação em planilha, a partir dos dados que
   * já estão em memória — não refaz nenhuma consulta na ReceitaWS.
   *
   * Usa o mesmo modelo das demais planilhas do sistema (`exportToExcel`), com
   * duas linhas em branco a cada CNPJ novo: assim dá para ver de relance quais
   * registros foram alterados em cada empresa.
   */
  const baixarRelatorioSimulacao = async () => {
    if (!razaoResultado) return;

    // JSON (CNAEs, por exemplo) sai em texto corrido, não como estrutura crua.
    const texto = formatarValorLegivel;

    const cnpjFormatado = (v: any) => {
      const digitos = String(v || '').replace(/\D/g, '');
      return digitos.length === 14
        ? digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
        : String(v || '');
    };

    const linhas: string[][] = [];

    for (const it of razaoResultado.itens) {
      const cnpj = cnpjFormatado(it.cnpj);
      for (const alt of it.alteracoes || []) {
        linhas.push([it.antes, cnpj, 'campo', alt.campo, texto(alt.antes), texto(alt.depois)]);
      }
      for (const sq of it.sociosQualificacao || []) {
        linhas.push([it.antes, cnpj, 'sócio (qualificação)', sq.nome, texto(sq.antes), texto(sq.depois)]);
      }
      for (const sn of it.sociosNovos || []) {
        linhas.push([it.antes, cnpj, 'sócio novo', sn.nome, '', texto(sn.qual)]);
      }
      for (const sa of it.sociosAusentes || []) {
        linhas.push([it.antes, cnpj, 'sócio fora do cartão', sa, 'consta no cadastro', 'não consta no cartão']);
      }
      if (it.status === 'erro') {
        linhas.push([it.antes, cnpj, 'erro', '', '', texto(it.erro)]);
      }
    }

    try {
      await exportToExcel({
        filename: `simulacao-cartao-cnpj-${new Date().toISOString().slice(0, 10)}.xlsx`,
        sheetName: 'Alterações Cartão CNPJ',
        headers: ['Cliente', 'CNPJ', 'Tipo', 'Campo', 'Antes', 'Depois'],
        data: linhas,
        groupByColumn: 1, // CNPJ
        groupSpacing: 2,
        wrapText: false, // valores longos (CNAEs, endereços) truncam em vez de quebrar
      });
    } catch (error: any) {
      setRazaoError(error?.message || 'Erro ao gerar a planilha do relatório');
    }
  };

  /** Mostra quantas alterações existem no período, sem baixar nada. */
  const handleConsultarHistorico = async () => {
    setHistErro(null);
    setHistResumo(null);
    try {
      const resp = await clientesService.historicoReceitaWS({
        desde: histDesde || undefined,
        ate: histAte || undefined,
      });
      const registros = resp?.data || [];
      if (registros.length === 0) {
        setHistResumo('Nenhuma alteração registrada no período.');
        return;
      }
      const clientes = new Set(registros.map((r: any) => r.cliente_id)).size;
      const ultima = registros[0]?.aplicado_em
        ? new Date(registros[0].aplicado_em).toLocaleString('pt-BR')
        : '—';
      setHistResumo(
        `${registros.length} alteração(ões) em ${clientes} cliente(s). Mais recente: ${ultima}.`
      );
    } catch (error: any) {
      setHistErro(error?.response?.data?.error || error?.message || 'Erro ao consultar o histórico');
    }
  };

  /** Baixa o histórico em XLSX. */
  const handleBaixarHistorico = async () => {
    setHistBaixando(true);
    setHistErro(null);
    try {
      const blob = await clientesService.baixarHistoricoReceitaWS({
        desde: histDesde || undefined,
        ate: histAte || undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `alteracoes-receitaws-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      setHistErro(error?.response?.data?.error || error?.message || 'Erro ao baixar o histórico');
    } finally {
      setHistBaixando(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      setExporting(true);
      const blob = await relatoriosService.generateAndDownload({ reportType: 'dctf', format: 'xlsx' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup_dctf_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setClearSuccess('Backup exportado com sucesso!');
      setTimeout(() => setClearSuccess(null), 3000);
    } catch (err: any) {
      setClearError(err.response?.data?.error || 'Erro ao exportar backup');
      setTimeout(() => setClearError(null), 5000);
    } finally {
      setExporting(false);
    }
  };

  const handleClearAll = async () => {
    if (clearConfirmCode !== 'LIMPAR_TODAS_DECLARACOES' || clearConfirmText !== 'CONFIRMAR') {
      setClearError('Código de confirmação ou texto incorretos. Por favor, verifique.');
      return;
    }

    setClearing(true);
    setClearError(null);
    setClearSuccess(null);

    try {
      const result = await dctfService.clearAll();
      if (result.success) {
        setClearSuccess(result.message || 'Limpeza concluída com sucesso!');
        setTimeout(() => {
          setShowClearModal(false);
          setClearConfirmCode('');
          setClearConfirmText('');
          setClearError(null);
          // NÃO recarregar a página - manter dados na tela
          // setClearSuccess(null);
        }, 3000);
      } else {
        setClearError(result.message || 'Erro ao limpar declarações');
      }
    } catch (err: any) {
      setClearError(err.response?.data?.error || 'Erro ao limpar declarações');
    } finally {
      setClearing(false);
    }
  };

  const handleSyncFromScrapecac = async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncSuccess(null);
    setSyncProgress(null);

    try {
      const result = await dctfService.syncFromScrapecac();
      if (result.success) {
        const message = result.message || 
          `Sincronização concluída: ${result.data?.inserted ?? 0} inseridos${(result.data?.errors ?? 0) > 0 ? `, ${result.data?.errors} erros` : ''}`;
        setSyncSuccess(message);
        setSyncProgress(result.data || null);
        if (result.data?.errorLog) {
          setLastSyncErrors(result.data.errorLog);
        }
        fetchLastBackup(); // atualiza data do último backup (criado antes do sync)
      } else {
        setSyncError(result.error || 'Erro ao sincronizar declarações');
      }
    } catch (err: any) {
      setSyncError(err.response?.data?.error || err.message || 'Erro ao sincronizar declarações');
    } finally {
      setSyncing(false);
    }
  };

  const handleDownloadLog = async () => {
    try {
      const blob = await dctfService.downloadSyncErrorsLog();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sync-errors-${new Date().toISOString().slice(0,10)}.log`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      if (err.response?.status === 404) {
        alert('Nenhum log de erros encontrado. Execute a sincronização primeiro.');
      } else {
        alert('Erro ao baixar log: ' + (err.message || 'Erro desconhecido'));
      }
    }
  };

  const handleRestore = async () => {
    if (!lastBackup) return;
    if (!window.confirm(`Restaurar a tabela dctf_declaracoes para o backup de ${lastBackup.dateFormatted}? Os dados atuais serão substituídos.`)) return;
    setRestoring(true);
    setSyncError(null);
    setSyncSuccess(null);
    try {
      const result = await dctfService.restoreFromBackup();
      if (result.success) {
        setSyncSuccess(result.message || `Restauração concluída: ${result.data?.restored ?? 0} registros.`);
      } else {
        setSyncError(result.error || 'Erro ao restaurar');
      }
    } catch (err: any) {
      setSyncError(err.response?.data?.error || err.message || 'Erro ao restaurar');
    } finally {
      setRestoring(false);
    }
  };

  const handleRetrySyncErrors = async () => {
    setRetrying(true);
    setSyncError(null);
    setSyncSuccess(null);
    setSyncProgress(null);

    try {
      const result = await dctfService.retrySyncErrors();
      if (result.success) {
        const message = result.message || 
          `Retry concluído: ${result.data?.inserted ?? 0} inseridos${(result.data?.errors ?? 0) > 0 ? `, ${result.data?.errors} erros` : ''}`;
        setSyncSuccess(message);
        setSyncProgress(result.data || null);
        if (result.data?.errorLog) {
          setLastSyncErrors(result.data.errorLog);
        }
      } else {
        setSyncError(result.error || 'Erro ao fazer retry de sincronização');
      }
    } catch (err: any) {
      setSyncError(err.response?.data?.error || err.message || 'Erro ao fazer retry');
    } finally {
      setRetrying(false);
    }
  };

  /**
   * Envia email com DCTFs em andamento
   */
  const handleSendEmailPending = async () => {
    const to = getEmailDestinoCompleto();
    if (!to || !emailDestinoValido()) return;
    setSendingEmail(true);
    setEmailError(null);
    setEmailSuccess(null);

    try {
      const result = await dctfService.sendEmailPending(to);
      if (result.success) {
        setEmailSuccess(`Email enviado com sucesso! ${result.total ?? 0} registros enviados para ${to}`);
      } else {
        setEmailError('Erro ao enviar email');
      }
    } catch (err: any) {
      setEmailError(err.response?.data?.message || err.response?.data?.error || err.message || 'Erro ao enviar email');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleSendEmailSemDCTFComMovimento = async () => {
    const to = getEmailDestinoSemDCTFCompleto();
    if (!to || !emailDestinoSemDCTFValido()) return;
    setSendingEmailSemDCTF(true);
    setEmailErrorSemDCTF(null);
    setEmailSuccessSemDCTF(null);
    try {
      const result = await sendEmailSemDCTFComMovimento(to);
      if (result.success) {
        setEmailSuccessSemDCTF(`Email enviado com sucesso! ${result.total ?? 0} cliente(s) no relatório para ${to}`);
      } else {
        setEmailErrorSemDCTF(result.message || 'Erro ao enviar email');
      }
    } catch (err: any) {
      setEmailErrorSemDCTF(err.response?.data?.message || err.response?.data?.error || err.message || 'Erro ao enviar email');
    } finally {
      setSendingEmailSemDCTF(false);
    }
  };

  // Função para cancelar consulta de Situação Fiscal
  const handleCancelarConsultaSITF = async () => {
    if (!progressIdSITF) return;

    try {
      const response = await axios.post(`/api/situacao-fiscal/lote/${progressIdSITF}/cancelar`);
      
      if (response.data.success) {
        // Parar polling
        if (pollingIntervalSITFRef.current) {
          clearInterval(pollingIntervalSITFRef.current);
          pollingIntervalSITFRef.current = null;
        }
        
        setConsultandoSITF(false);
        setErroSITF('Consulta cancelada pelo usuário.');
        setProgressIdSITF(null);
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Erro ao cancelar consulta';
      setErroSITF(errorMessage);
    }
  };

  // Função para popular tabela de CNPJs pendentes
  const handlePopularPendentes = async () => {
    setPopulandoPendentes(true);
    setTotalPendentes(null);
    
    try {
      const response = await axios.post('/api/situacao-fiscal/lote/popular-pendentes');
      
      if (response.data.success) {
        setTotalPendentes(response.data.total);
        alert(`✅ ${response.data.total} CNPJs com divergências adicionados à fila de processamento!`);
      } else {
        alert(`❌ Erro: ${response.data.error || 'Erro ao popular tabela'}`);
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Erro ao popular tabela';
      alert(`❌ Erro: ${errorMessage}`);
    } finally {
      setPopulandoPendentes(false);
    }
  };

  // Função para iniciar consulta em lote de pendentes
  const handleIniciarConsultaPendentes = async () => {
    setConsultandoPendentes(true);
    setErroSITF(null);
    setProgressoSITF(null);
    
    try {
      const response = await axios.post('/api/situacao-fiscal/lote/iniciar-pendentes');
      
      if (response.data.success) {
        setProgressIdPendentes(response.data.progressId);
        // Usar o mesmo polling do SITF normal
        setProgressIdSITF(response.data.progressId);
        if (!pollingIntervalSITFRef.current) {
          const interval = setInterval(() => {
            verificarProgressoSITF(response.data.progressId);
          }, 2000);
          pollingIntervalSITFRef.current = interval;
        }
        verificarProgressoSITF(response.data.progressId);
      } else {
        setErroSITF(response.data.error || 'Erro ao iniciar consulta');
        setConsultandoPendentes(false);
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Erro ao iniciar consulta';
      setErroSITF(errorMessage);
      setConsultandoPendentes(false);
    }
  };

  // Função para buscar total de pendentes
  const buscarTotalPendentes = async () => {
    try {
      const response = await axios.get('/api/situacao-fiscal/lote/pendentes?status=pendente');
      if (response.data.success) {
        setTotalPendentes(response.data.total || 0);
      }
    } catch (err) {
      // Ignorar erro silenciosamente
    }
  };

  // Buscar total de pendentes ao carregar
  useEffect(() => {
    buscarTotalPendentes();
  }, []);

  const fetchLastBackup = async () => {
    try {
      const res = await dctfService.getLastBackup();
      if (res.success && res.data) {
        setLastBackup({ dateFormatted: res.data.dateFormatted });
      } else {
        setLastBackup(null);
      }
    } catch {
      setLastBackup(null);
    }
  };

  useEffect(() => {
    if (isAuthenticated) fetchLastBackup();
  }, [isAuthenticated]);

  // Se não estiver autenticado, mostrar modal de login
  if (!isAuthenticated || showLoginModal) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="fixed inset-0 p-4 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
            <div className="flex items-center justify-center mb-6">
              <div className="bg-blue-100 rounded-full p-3">
                <LockClosedIcon className="h-8 w-8 text-blue-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Acesso Administrativo</h2>
            <p className="text-sm text-gray-600 text-center mb-6">
              Esta área requer autenticação. Por favor, faça login para continuar.
            </p>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Usuário
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Digite o usuário"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Senha
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite a senha"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              {loginError && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded text-sm">
                  {loginError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="flex items-center justify-center gap-2 flex-1 bg-gray-200 text-gray-700 px-4 py-3 rounded-lg hover:bg-gray-300 font-medium transition-colors"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                  Voltar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 font-medium transition-colors"
                >
                  Entrar
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Administração</h1>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium"
        >
          Sair
        </button>
      </div>

      {/* Aviso de Segurança */}
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
        <div className="flex">
          <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 mr-3 mt-0.5" />
          <div>
            <p className="text-sm text-yellow-700">
              <strong>Atenção:</strong> Esta página contém operações administrativas críticas que podem afetar permanentemente os dados do sistema. 
              Use com extrema cautela e apenas quando necessário.
            </p>
          </div>
        </div>
      </div>

      {/* Seção de Limpeza de Declarações */}
      <div className="bg-red-50 border-2 border-red-200 shadow-lg rounded-lg p-6 mb-6">
        <div className="flex items-start mb-4">
          <TrashIcon className="h-6 w-6 text-red-600 mr-3 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-red-900 mb-2">Limpeza de Declarações DCTF (MySQL)</h2>
            <p className="text-sm text-red-700 mb-4">
              Esta operação irá <strong>deletar permanentemente</strong> todas as declarações DCTF e seus dados relacionados do banco de dados <strong>MySQL</strong>.
              Esta ação é <strong>irreversível</strong> e deve ser executada antes de sincronizar novos dados do e-CAC.
            </p>
            
            <div className="bg-white rounded-lg p-4 border border-red-300 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">O que será deletado (apenas no MySQL):</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside mb-4">
                <li>Todas as declarações da tabela <code className="bg-gray-100 px-1 rounded">dctf_declaracoes</code> no <strong>MySQL</strong></li>
                <li>Todos os dados relacionados da tabela <code className="bg-gray-100 px-1 rounded">dctf_dados</code> no <strong>MySQL</strong></li>
                <li>Todos os registros de análise e flags associados no <strong>MySQL</strong></li>
                <li className="text-green-700 font-semibold">✓ Os dados em <code className="bg-gray-100 px-1 rounded">scrapecac</code> (origem do scraping) NÃO serão afetados</li>
              </ul>
              
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Fluxo Recomendado:</h3>
              <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside mb-4">
                <li><strong>1. Limpar dados do MySQL</strong> (este botão) - Remove dados antigos do MySQL</li>
                <li><strong>2. Sincronizar do e-CAC</strong> (botão abaixo) - Busca registros novos da tabela <code className="bg-gray-100 px-1 rounded">scrapecac</code> e insere em <code className="bg-gray-100 px-1 rounded">dctf_declaracoes</code></li>
              </ol>
              
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Recomendações:</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                <li><strong>Sempre</strong> faça um backup antes de executar esta operação</li>
                <li>Execute esta operação antes de sincronizar novos dados do e-CAC</li>
                <li>Verifique se não há processos importantes em andamento</li>
                <li>Certifique-se de que todos os relatórios necessários foram gerados</li>
              </ul>
            </div>

            {clearSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded mb-4">
                {clearSuccess}
              </div>
            )}

            {clearError && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
                {clearError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleExportBackup}
                disabled={exporting || clearing}
                className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                <DocumentArrowDownIcon className="h-5 w-5" />
                {exporting ? 'Exportando...' : 'Exportar Backup (XLSX)'}
              </button>
              <button
                onClick={() => setShowClearModal(true)}
                disabled={clearing}
                className="flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                <TrashIcon className="h-5 w-5" />
                Limpar Todas as Declarações
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Confirmação */}
      {showClearModal && (
        <div className="fixed inset-0 p-4 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start mb-4">
              <ExclamationTriangleIcon className="h-6 w-6 text-red-600 mr-3 mt-1" />
              <h3 className="text-xl font-bold text-red-900">Confirmar Limpeza de Declarações</h3>
            </div>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-800 font-semibold mb-2">
                ⚠️ ATENÇÃO: Esta operação é IRREVERSÍVEL
              </p>
              <p className="text-sm text-red-700 mb-2">
                Esta ação irá deletar permanentemente:
              </p>
              <ul className="text-sm text-red-700 space-y-1 list-disc list-inside mb-2">
                <li>Todas as declarações DCTF</li>
                <li>Todos os dados relacionados (dctf_dados)</li>
                <li>Todos os registros de análise</li>
              </ul>
              <p className="text-sm text-red-800 font-semibold">
                Certifique-se de ter feito um backup antes de continuar!
              </p>
            </div>
            
            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Digite o código de confirmação: <strong className="text-red-600">LIMPAR_TODAS_DECLARACOES</strong>
                </label>
                <input
                  type="text"
                  value={clearConfirmCode}
                  onChange={(e) => setClearConfirmCode(e.target.value)}
                  placeholder="LIMPAR_TODAS_DECLARACOES"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Digite <strong className="text-red-600">"CONFIRMAR"</strong> para prosseguir:
                </label>
                <input
                  type="text"
                  value={clearConfirmText}
                  onChange={(e) => setClearConfirmText(e.target.value)}
                  placeholder="CONFIRMAR"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>
            </div>

            {clearError && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4 text-sm">
                {clearError}
              </div>
            )}

            {clearSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded mb-4 text-sm">
                {clearSuccess}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowClearModal(false);
                  setClearConfirmCode('');
                  setClearConfirmText('');
                  setClearError(null);
                  setClearSuccess(null);
                }}
                disabled={clearing}
                className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 disabled:opacity-50 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleClearAll}
                disabled={clearing || clearConfirmCode !== 'LIMPAR_TODAS_DECLARACOES' || clearConfirmText !== 'CONFIRMAR'}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {clearing ? 'Limpando...' : 'Confirmar e Limpar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Seção de Atualização do Cadastro pelo Cartão CNPJ (ReceitaWS) */}
      <div className="bg-indigo-50 border-2 border-indigo-200 shadow-lg rounded-lg p-6 mb-6">
        <div className="flex items-start mb-4">
          <ArrowPathIcon className="h-6 w-6 text-indigo-600 mr-3 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-indigo-900 mb-2">
              Atualizar Cadastro pelo Cartão CNPJ (ReceitaWS)
            </h2>
            <p className="text-sm text-indigo-700 mb-4">
              Percorre todos os clientes com CNPJ válido e atualiza o cadastro com os dados do cartão
              CNPJ: razão social, nome fantasia, situação cadastral, porte, natureza jurídica, datas,
              CNAEs, endereço, contatos da Receita, capital social e Simples/SIMEI.{' '}
              <strong>Nada que já existe no cadastro é apagado</strong>: campo vazio é preenchido, campo
              desatualizado é corrigido, e o que a Receita não informa fica exatamente como está.
            </p>

            <div className="bg-white rounded-lg p-4 border border-indigo-300 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Como funciona:</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside mb-4">
                <li>Consulta 1 CNPJ por vez, aguardando <strong>20 segundos</strong> entre cada um (limite da ReceitaWS: 3 consultas/minuto)</li>
                <li>Compara campo a campo e grava <strong>somente as colunas que mudaram</strong></li>
                <li>Nunca grava vazio por cima de um valor já preenchido</li>
                <li>
                  Ignora as <strong>máscaras da Receita</strong> — empresas baixadas voltam com CNAE
                  <code className="bg-gray-100 px-1 rounded">00.00-0-00</code>,{' '}
                  <code className="bg-gray-100 px-1 rounded">********</code> e "Não informada"; nada disso
                  substitui o CNAE real do cadastro
                </li>
                <li><strong>E-mail, telefone e endereço</strong> digitados pela equipe só são preenchidos se estiverem vazios — nunca substituídos</li>
                <li><strong>Regime tributário</strong> só é promovido para Simples Nacional quando a Receita confirma a opção; nunca é zerado</li>
                <li>
                  <strong>Sócios</strong>: quem entrou é acrescentado e a qualificação é corrigida —
                  ninguém é excluído. Quem sumiu do cartão fica marcado com o aviso{' '}
                  <span className="text-amber-700 font-semibold">"não consta mais no cartão CNPJ"</span>,
                  visível no cadastro do cliente (aba Participação), com CPF e participação preservados
                </li>
                <li>Código SCI, pasta de rede, benefícios fiscais e demais campos internos não são tocados</li>
                <li>Ao final, mostra o <strong>antes → depois</strong> de cada campo alterado</li>
              </ul>

              <h3 className="text-lg font-semibold text-gray-900 mb-2">Antes de começar:</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                <li>Mantenha esta aba aberta até o fim — o ritmo é controlado por esta tela</li>
                <li>Use o modo <strong>Simular</strong> para ver o que mudaria sem gravar nada</li>
                <li>Dá para <strong>cancelar</strong> a qualquer momento; o que já foi gravado permanece</li>
              </ul>
            </div>

            {/* Opções */}
            <div className="bg-white rounded-lg p-4 border border-indigo-300 mb-4 space-y-3">
              <label className="flex items-start gap-2 text-sm text-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={razaoSimular}
                  onChange={(e) => setRazaoSimular(e.target.checked)}
                  disabled={atualizandoRazao}
                  className="mt-1"
                />
                <span>
                  <strong>Simular (não grava nada)</strong> — lista tudo que mudaria. Ao final aparece o
                  botão <em>"Gravar as alterações simuladas"</em>, que aplica o resultado sem precisar
                  consultar a Receita de novo (leva segundos).
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={razaoIgnorarCaixa}
                  onChange={(e) => setRazaoIgnorarCaixa(e.target.checked)}
                  disabled={atualizandoRazao}
                  className="mt-1"
                />
                <span>
                  <strong>Ignorar diferença de maiúsculas/minúsculas</strong> — vale para todos os campos
                  de texto: "Extinção Por Encerramento" e "EXTINÇÃO POR ENCERRAMENTO" são tratados como
                  iguais, evitando gravar dezenas de clientes por diferença puramente cosmética
                  (recomendado).
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={razaoSomenteNome}
                  onChange={(e) => setRazaoSomenteNome(e.target.checked)}
                  disabled={atualizandoRazao}
                  className="mt-1"
                />
                <span>
                  <strong>Atualizar somente a razão social</strong> — ignora os demais campos do cartão.
                </span>
              </label>
            </div>

            {/* Registro do que já foi alterado pela Receita */}
            <div className="bg-white rounded-lg p-4 border border-indigo-300 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Registro de alterações já aplicadas
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                Tudo que a ReceitaWS mudou no cadastro fica gravado: cliente, campo, valor anterior, valor
                novo e data. Consulta o histórico — não gasta consulta na API.
              </p>

              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">De</label>
                  <input
                    type="date"
                    value={histDesde}
                    onChange={(e) => setHistDesde(e.target.value)}
                    className="h-10 px-3 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Até</label>
                  <input
                    type="date"
                    value={histAte}
                    onChange={(e) => setHistAte(e.target.value)}
                    className="h-10 px-3 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <button
                  onClick={handleConsultarHistorico}
                  className="h-10 px-4 border-2 border-indigo-300 text-indigo-700 bg-white rounded-lg hover:bg-indigo-50 text-sm font-semibold transition-colors"
                >
                  Consultar
                </button>

                <button
                  onClick={handleBaixarHistorico}
                  disabled={histBaixando}
                  className="h-10 px-4 flex items-center gap-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-semibold transition-colors"
                >
                  {histBaixando ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span>Gerando...</span>
                    </>
                  ) : (
                    <>
                      <DocumentArrowDownIcon className="h-4 w-4" />
                      Baixar registro (XLSX)
                    </>
                  )}
                </button>

                {(histDesde || histAte) && (
                  <button
                    onClick={() => {
                      setHistDesde('');
                      setHistAte('');
                      setHistResumo(null);
                    }}
                    className="h-10 px-3 text-sm text-gray-500 hover:text-gray-700 underline"
                  >
                    Limpar período
                  </button>
                )}
              </div>

              {histResumo && <p className="text-sm text-indigo-800 mt-3 font-medium">{histResumo}</p>}
              {histErro && <p className="text-sm text-red-700 mt-3">{histErro}</p>}
              {!histDesde && !histAte && (
                <p className="text-xs text-gray-500 mt-2">
                  Sem período informado, traz o histórico completo.
                </p>
              )}
            </div>

            {razaoError && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4 text-sm">
                {razaoError}
              </div>
            )}

            {/* Progresso */}
            {razaoProgresso && (
              <div className="bg-indigo-100 border border-indigo-300 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-indigo-900">
                    {razaoSimular ? 'Simulando' : 'Atualizando'} razões sociais...
                  </div>
                  <div className="text-sm font-semibold text-indigo-700">
                    {razaoProgresso.processados} de {razaoProgresso.total} (
                    {razaoProgresso.total > 0
                      ? Math.round((razaoProgresso.processados / razaoProgresso.total) * 100)
                      : 0}
                    %)
                  </div>
                </div>

                <div className="w-full bg-indigo-200 rounded-full h-4 mb-2 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${
                        razaoProgresso.total > 0
                          ? Math.round((razaoProgresso.processados / razaoProgresso.total) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>

                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-100 text-green-700">
                    Alterados: <strong>{razaoProgresso.atualizados}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 text-gray-700">
                    Já corretos: <strong>{razaoProgresso.semAlteracao}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-700">
                    Erros: <strong>{razaoProgresso.erros}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-200 text-indigo-800">
                    Tempo restante: <strong>~{Math.floor(razaoProgresso.segundosRestantes / 60)}min {razaoProgresso.segundosRestantes % 60}s</strong>
                  </span>
                </div>

                {razaoProgresso.atual && (
                  <div className="text-xs text-indigo-700 mt-2">
                    Consultando: <span className="font-mono font-semibold">{razaoProgresso.atual}</span>
                  </div>
                )}
              </div>
            )}

            {/* Resultado */}
            {razaoResultado && (
              <div className="bg-white border border-indigo-300 rounded-lg p-4 mb-4">
                <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                  <div>
                    <h3 className="text-lg font-semibold text-indigo-900">
                      {razaoResultado.cancelado ? 'Processo cancelado' : 'Processo concluído'}
                      {razaoResultado.simulado ? ' (simulação — nada foi gravado)' : ''}
                    </h3>
                    {razaoResultado.salvoEm && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Relatório de {new Date(razaoResultado.salvoEm).toLocaleString('pt-BR')} — fica
                        guardado neste navegador mesmo se você recarregar a página.
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={baixarRelatorioSimulacao}
                      className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 text-sm font-semibold transition-colors"
                      title="Baixa o relatório completo em planilha, agrupado por CNPJ, sem consultar a Receita de novo"
                    >
                      <DocumentArrowDownIcon className="h-4 w-4" />
                      Baixar relatório (XLSX)
                    </button>
                    <button
                      onClick={() => {
                        setRazaoResultado(null);
                        setAplicacaoResultado(null);
                      }}
                      className="px-4 py-2 bg-white border-2 border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
                      title="Descarta o relatório guardado neste navegador"
                    >
                      Descartar
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-800">{razaoResultado.total}</div>
                    <div className="text-sm text-gray-600">Clientes</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-700">{razaoResultado.atualizados}</div>
                    <div className="text-sm text-green-600">
                      {razaoResultado.simulado ? 'Seriam alterados' : 'Alterados'}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-700">{razaoResultado.semAlteracao}</div>
                    <div className="text-sm text-gray-600">Já corretos</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-700">{razaoResultado.erros}</div>
                    <div className="text-sm text-red-600">Erros</div>
                  </div>
                </div>

                {razaoResultado.atualizados > 0 && (
                  <details className="mb-2" open>
                    <summary className="cursor-pointer text-sm font-semibold text-indigo-800 hover:text-indigo-900">
                      Ver clientes {razaoResultado.simulado ? 'que mudariam' : 'alterados'} ({razaoResultado.atualizados})
                    </summary>
                    <div className="mt-2 max-h-96 overflow-y-auto">
                      {razaoResultado.itens
                        .filter((it) => it.status === 'atualizado')
                        .map((it, idx) => (
                          <div key={idx} className="text-xs text-gray-800 p-2 border-b border-gray-200">
                            <div className="font-semibold text-gray-900">
                              {it.antes} <span className="font-mono font-normal text-gray-500">({it.cnpj})</span>
                            </div>

                            {(it.alteracoes || []).map((alt, i) => (
                              <div key={i} className="ml-3 mt-1">
                                <span className="font-mono text-indigo-700">{alt.campo}</span>
                                {': '}
                                {descreverAlteracao(alt)}
                              </div>
                            ))}

                            {(it.sociosNovos || []).length > 0 && (
                              <div className="ml-3 mt-1 text-green-700">
                                + Sócios acrescentados: {(it.sociosNovos || []).map((s) => s.nome).join(', ')}
                              </div>
                            )}

                            {(it.sociosQualificacao || []).map((sq, i) => (
                              <div key={`q${i}`} className="ml-3 mt-1">
                                <span className="font-mono text-indigo-700">sócio {sq.nome} (qualificação)</span>
                                {': '}
                                <span className="text-red-700 line-through">{sq.antes || '(vazio)'}</span>
                                {' → '}
                                <span className="text-green-700 font-semibold">{sq.depois}</span>
                              </div>
                            ))}

                            {(it.sociosAusentes || []).length > 0 && (
                              <div className="ml-3 mt-1 text-amber-700">
                                ⚠ Não constam mais no cartão (mantidos no cadastro, confira manualmente):{' '}
                                {(it.sociosAusentes || []).join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  </details>
                )}

                {razaoResultado.itens.some((it) => it.status !== 'atualizado' && (it.sociosAusentes || []).length > 0) && (
                  <details className="mb-2">
                    <summary className="cursor-pointer text-sm font-semibold text-amber-700 hover:text-amber-800">
                      Sócios que não constam mais no cartão CNPJ (nenhum foi excluído)
                    </summary>
                    <div className="mt-2 max-h-60 overflow-y-auto">
                      {razaoResultado.itens
                        .filter((it) => it.status !== 'atualizado' && (it.sociosAusentes || []).length > 0)
                        .map((it, idx) => (
                          <div key={idx} className="text-xs text-amber-800 p-2 border-b border-amber-200">
                            <strong>{it.antes}</strong> ({it.cnpj}): {(it.sociosAusentes || []).join(', ')}
                          </div>
                        ))}
                    </div>
                  </details>
                )}

                {razaoResultado.erros > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold text-red-700 hover:text-red-800">
                      Ver erros ({razaoResultado.erros})
                    </summary>
                    <div className="mt-2 max-h-60 overflow-y-auto">
                      {razaoResultado.itens
                        .filter((it) => it.status === 'erro')
                        .map((it, idx) => (
                          <div key={idx} className="text-xs text-red-700 p-2 border-b border-red-200">
                            <strong>{it.antes}</strong> ({it.cnpj}): {it.erro}
                          </div>
                        ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* Resultado da gravação da simulação */}
            {aplicacaoResultado && (
              <div className="bg-green-50 border border-green-300 rounded-lg p-4 mb-4">
                <h3 className="text-lg font-semibold text-green-900 mb-2">Alterações gravadas</h3>
                <div className="text-sm text-green-800">
                  <strong>{aplicacaoResultado.camposGravados}</strong> campo(s) gravado(s) em{' '}
                  <strong>{aplicacaoResultado.clientes}</strong> cliente(s)
                  {aplicacaoResultado.sociosInseridos > 0 && (
                    <> · <strong>{aplicacaoResultado.sociosInseridos}</strong> sócio(s) acrescentado(s)</>
                  )}
                </div>

                {aplicacaoResultado.sociosMarcados > 0 && (
                  <div className="mt-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    ⚠ <strong>{aplicacaoResultado.sociosMarcados}</strong> sócio(s) marcado(s) como "não
                    consta mais no cartão CNPJ". Nenhum foi excluído — o aviso aparece no cadastro do
                    cliente, na aba de Participação.
                  </div>
                )}

                {aplicacaoResultado.conflitos.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-semibold text-amber-700 hover:text-amber-800">
                      Campos pulados porque o cadastro mudou depois da simulação ({aplicacaoResultado.conflitos.length})
                    </summary>
                    <div className="mt-2 max-h-60 overflow-y-auto">
                      {aplicacaoResultado.conflitos.map((c, idx) => (
                        <div key={idx} className="text-xs text-amber-800 p-2 border-b border-amber-200">
                          <strong>{c.cliente}</strong> · <span className="font-mono">{c.campo}</span>: a
                          simulação viu "{String(c.esperado ?? '')}" mas o banco está com "
                          {String(c.encontrado ?? '')}" — nada foi sobrescrito.
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {aplicacaoResultado.erros.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-semibold text-red-700 hover:text-red-800">
                      Erros ao gravar ({aplicacaoResultado.erros.length})
                    </summary>
                    <div className="mt-2 max-h-60 overflow-y-auto">
                      {aplicacaoResultado.erros.map((e, idx) => (
                        <div key={idx} className="text-xs text-red-700 p-2 border-b border-red-200">
                          <strong>{e.cliente}</strong>: {e.erro}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            <div className="flex gap-3 flex-wrap">
              {razaoResultado &&
                razaoResultado.simulado &&
                (razaoResultado.atualizados > 0 ||
                  razaoResultado.itens.some((it) => (it.sociosAusentes || []).length > 0)) && (
                <button
                  onClick={handleAplicarSimulacao}
                  disabled={aplicandoSimulacao || atualizandoRazao}
                  className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {aplicandoSimulacao ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span>Gravando...</span>
                    </>
                  ) : (
                    <span>Gravar as {razaoResultado.atualizados} alterações simuladas</span>
                  )}
                </button>
              )}

              <button
                onClick={handleAtualizarRazoesSociais}
                disabled={atualizandoRazao || aplicandoSimulacao}
                className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {atualizandoRazao ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span>{razaoSimular ? 'Simulando...' : 'Atualizando...'}</span>
                  </>
                ) : (
                  <>
                    <ArrowPathIcon className="h-5 w-5" />
                    <span>
                      {razaoSimular
                        ? 'Simular Atualização pelo Cartão CNPJ'
                        : 'Atualizar Cadastros pelo Cartão CNPJ'}
                    </span>
                  </>
                )}
              </button>

              {atualizandoRazao && (
                <button
                  onClick={() => {
                    cancelarRazaoRef.current = true;
                  }}
                  className="flex items-center gap-2 bg-gray-200 text-gray-800 px-6 py-3 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Seção de Sincronização do e-CAC */}
      <div className="bg-green-50 border-2 border-green-200 shadow-lg rounded-lg p-6 mb-6">
        <div className="flex items-start mb-4">
          <ArrowPathIcon className="h-6 w-6 text-green-600 mr-3 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-green-900 mb-2">Sincronização de Declarações DCTF (scrapecac → dctf_declaracoes)</h2>
            <p className="text-sm text-green-700 mb-4">
              Esta operação irá <strong>buscar todas as declarações DCTF</strong> da tabela <code className="bg-green-100 px-1 rounded">scrapecac</code> (populada pelo scraping do e-CAC)
              e <strong>sincronizar</strong> para a tabela <code className="bg-green-100 px-1 rounded">dctf_declaracoes</code>. Apenas <strong>novos</strong> registros são inseridos; só é ignorado quem já existe com o <strong>mesmo ID</strong>. Mesmo CNPJ e período com outros campos diferentes (ex.: Original vs Retificadora) são inseridos como registros distintos.
            </p>

            <div className="bg-white rounded-lg p-4 border border-green-300 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Como funciona:</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside mb-4">
                <li>O sistema lê todos os registros da tabela <code className="bg-gray-100 px-1 rounded">scrapecac</code> (mesmo banco MySQL)</li>
                <li>Processa em lotes de 100 e traduz formatos (data BR → DATETIME, valores BR → DECIMAL, período MM/AAAA → AAAA-MM)</li>
                <li><strong>Antes de sincronizar</strong>, é criado um backup automático de <code className="bg-gray-100 px-1 rounded">dctf_declaracoes</code></li>
                <li>Registros já existentes (mesmo ID SHA-1) são ignorados; o restante é inserido</li>
                <li>O processo mostra progresso em tempo real</li>
                <li>Use o botão <strong>Restaurar</strong> (com a data do último backup) para reverter</li>
              </ul>

              <h3 className="text-lg font-semibold text-gray-900 mb-2">Recomendações:</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                <li>Execute esta operação após o projeto de scraping atualizar <code className="bg-gray-100 px-1 rounded">scrapecac</code></li>
                <li>Esta operação pode levar alguns minutos dependendo da quantidade de registros</li>
                <li>Você pode executar quantas vezes quiser — é idempotente por ID</li>
              </ul>
            </div>

            {syncSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded mb-4">
                {syncSuccess}
              </div>
            )}

            {syncError && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
                {syncError}
              </div>
            )}

            {syncProgress && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-blue-900">Resultado da Sincronização</h4>
                  <button
                    onClick={() => {
                      setSyncProgress(null);
                      setSyncSuccess(null);
                      setSyncError(null);
                    }}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    title="Limpar resultado"
                  >
                    ✕ Fechar
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                  <div>
                    <div className="text-gray-600">Total</div>
                    <div className="text-2xl font-bold text-gray-900">{syncProgress.total}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Processados</div>
                    <div className="text-2xl font-bold text-blue-600">{syncProgress.processed}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Inseridos</div>
                    <div className="text-2xl font-bold text-green-600">{syncProgress.inserted}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Atualizados</div>
                    <div className="text-2xl font-bold text-purple-600">{syncProgress.updated}</div>
                  </div>
                  {syncProgress.skippedDuplicate != null && syncProgress.skippedDuplicate > 0 && (
                    <div>
                      <div className="text-gray-600">Ignorados (já existia)</div>
                      <div className="text-2xl font-bold text-amber-600">{syncProgress.skippedDuplicate}</div>
                    </div>
                  )}
                </div>
                {syncProgress.skippedDuplicate != null && syncProgress.skippedDuplicate > 0 && (
                  <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-2">
                    {syncProgress.skippedDuplicate} registro(s) ignorado(s): já existia no MySQL (mesmo ID).
                    {syncProgress.skippedIds && syncProgress.skippedIds.length > 0 && (
                      <div className="mt-1 font-mono text-xs break-all">
                        IDs ignorados: {syncProgress.skippedIds.join(', ')}
                      </div>
                    )}
                    <div className="mt-1">
                      Se <code className="bg-amber-100 px-1 rounded">dctf_declaracoes</code> estava limpa antes do sync, esses IDs estão <strong>duplicados na tabela <code className="bg-amber-100 px-1 rounded">scrapecac</code></strong> (mesmo SHA-1 em mais de um registro). Só o primeiro de cada ID é inserido; para inserir os demais é preciso corrigir as duplicatas em <code className="bg-amber-100 px-1 rounded">scrapecac</code>.
                    </div>
                  </div>
                )}
                {syncProgress.errors > 0 && (
                  <div className="text-sm text-red-600 mb-2 bg-red-50 border border-red-200 rounded p-2">
                    <strong>⚠️ Erros:</strong> {syncProgress.errors} registro(s) com erro durante a sincronização.
                    {syncProgress.errors === syncProgress.total && (
                      <div className="mt-1 text-xs">
                        Todos os registros falharam. Confira o log de erros para investigar.
                      </div>
                    )}
                  </div>
                )}
                {syncProgress.processed === syncProgress.total && syncProgress.errors === 0 && (
                  <div className="text-sm text-green-600 mb-2 bg-green-50 border border-green-200 rounded p-2">
                    ✅ Sincronização concluída com sucesso! Todos os registros foram processados.
                  </div>
                )}
                <div className="w-full bg-blue-200 rounded-full h-4 overflow-hidden mb-2">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${Math.min(100, Math.round((syncProgress.processed / syncProgress.total) * 100))}%` }}
                  />
                </div>
                <div className="text-xs text-blue-600">
                  Lote {syncProgress.currentBatch} de {syncProgress.totalBatches} • {Math.round((syncProgress.processed / syncProgress.total) * 100)}% concluído
                </div>
              </div>
            )}

            {/* Monitoramento de Erros - Opção B */}
            {syncProgress && syncProgress.errors > 0 && (
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4 mt-4 mb-4">
                <div className="flex items-start">
                  <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 mr-2 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-yellow-900 mb-2">
                      🔍 Monitoramento de Erros
                    </h4>
                    <div className="text-sm text-yellow-800 mb-3">
                      <strong>{syncProgress.errors}</strong> registro(s) falharam na sincronização
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mb-3">
                      {/* Opção A: Botão para baixar log */}
                      <button
                        onClick={handleDownloadLog}
                        className="flex items-center gap-2 bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 text-sm font-medium transition-colors"
                        title="Baixar arquivo com detalhes completos dos erros"
                      >
                        <DocumentArrowDownIcon className="h-4 w-4" />
                        📥 Baixar Log de Erros
                      </button>
                      
                      {/* Opção C: Botão de retry automático */}
                      <button
                        onClick={handleRetrySyncErrors}
                        disabled={retrying}
                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                        title="Tentar sincronizar novamente os registros com erro"
                      >
                        <ArrowPathIcon className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} />
                        🔄 {retrying ? 'Tentando novamente...' : 'Tentar Novamente'}
                      </button>
                    </div>

                    {/* Opção B: Painel mostrando últimos erros em tempo real */}
                    {lastSyncErrors.length > 0 && (
                      <details className="mt-3" open={lastSyncErrors.length <= 5}>
                        <summary className="text-sm font-medium text-yellow-900 cursor-pointer hover:text-yellow-700 mb-2">
                          📋 Ver Últimos Erros ({lastSyncErrors.length})
                        </summary>
                        <div className="mt-2 bg-white rounded border border-yellow-300 p-3 max-h-60 overflow-y-auto">
                          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                            {lastSyncErrors.slice(0, 15).join('\n\n---\n\n')}
                            {lastSyncErrors.length > 15 && '\n\n... e mais ' + (lastSyncErrors.length - 15) + ' erros (baixe o log completo)'}
                          </pre>
                        </div>
                      </details>
                    )}
                    
                    {lastSyncErrors.length === 0 && (
                      <div className="text-xs text-yellow-700 bg-yellow-100 rounded p-2">
                        💡 <strong>Dica:</strong> Clique em "Baixar Log de Erros" para ver detalhes completos dos problemas
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3 items-center">
              <button
                onClick={handleSyncFromScrapecac}
                disabled={syncing || clearing}
                className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                <ArrowPathIcon className="h-5 w-5" />
                {syncing ? 'Sincronizando...' : 'Sincronizar do e-CAC (scrapecac → dctf_declaracoes)'}
              </button>
              <button
                onClick={handleRestore}
                disabled={restoring || !lastBackup || syncing || clearing}
                className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                title="Restaura a tabela dctf_declaracoes a partir do backup mais recente (criado antes da última sincronização)"
              >
                <ArrowUturnLeftIcon className="h-5 w-5" />
                {restoring ? 'Restaurando...' : lastBackup ? `Restaurar (${lastBackup.dateFormatted})` : 'Restaurar'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Seção de Envio de Email com DCTFs em Andamento */}
      <div className="bg-purple-50 border-2 border-purple-200 shadow-lg rounded-lg p-6 mb-6">
        <div className="flex items-start mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6 text-purple-600 mr-3 mt-1">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-purple-900 mb-2">Enviar Email - DCTFs em Andamento</h2>
            <p className="text-sm text-purple-700 mb-4">
              Envia um email formatado com todas as DCTFs em status <strong>"Em andamento"</strong> (Clientes Ativos).
              Digite o nome do destinatário; o sufixo <strong>@central-rnc.com.br</strong> é preenchido automaticamente ao sair do campo ou ao pressionar Tab.
            </p>

            <div className="flex flex-wrap items-center gap-2 mb-4">
              <label htmlFor="email-destino" className="text-sm font-medium text-purple-900">Destinatário:</label>
              <div className="flex items-center rounded-lg border-2 border-purple-300 bg-white focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-200">
                <input
                  id="email-destino"
                  type="text"
                  value={emailDestinoInput}
                  onChange={(e) => setEmailDestinoInput(e.target.value)}
                  onBlur={aplicaAutocompleteEmail}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab') aplicaAutocompleteEmail();
                  }}
                  placeholder="Ex: ti"
                  className="px-3 py-2 rounded-l-md border-0 focus:ring-0 min-w-[120px] text-gray-900 placeholder-gray-400"
                  autoComplete="off"
                />
                <span className="px-3 py-2 text-gray-500 bg-gray-50 border-l border-purple-200 rounded-r-md text-sm select-none">
                  @central-rnc.com.br
                </span>
              </div>
            </div>
            
            <div className="bg-white rounded-lg p-4 border border-purple-300 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">O que será incluído:</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                <li>Todas as DCTFs com situação <strong>"Em andamento"</strong></li>
                <li>Informações completas: CNPJ, Período, Data/Hora transmissão, Categoria, Origem, Tipo</li>
                <li>Valores financeiros: Débito Apurado e Saldo a Pagar</li>
                <li>Totalizadores: Total de registros, soma de débitos e soma de saldos</li>
                <li>HTML bem formatado para fácil leitura</li>
              </ul>
            </div>

            {emailSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded mb-4">
                ✅ {emailSuccess}
              </div>
            )}

            {emailError && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
                ❌ {emailError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleSendEmailPending}
                disabled={sendingEmail || !emailDestinoValido()}
                className="flex items-center gap-2 bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
                {sendingEmail ? 'Enviando Email...' : 'Enviar Email'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Seção Envio de Email - Clientes sem DCTF mas com Movimento */}
      <div className="bg-orange-50 border-2 border-orange-200 shadow-lg rounded-lg p-6 mb-6">
        <div className="flex items-start mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6 text-orange-600 mr-3 mt-1">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-orange-900 mb-2">Enviar Email - Clientes sem DCTF mas com Movimento</h2>
            <p className="text-sm text-orange-700 mb-4">
              Envia um email com corpo em HTML formatado contendo o relatório de <strong>clientes que tiveram movimento</strong> e ainda não enviaram a DCTF para a competência vigente.
              Digite o nome do destinatário; o sufixo <strong>@central-rnc.com.br</strong> é preenchido automaticamente ao sair do campo ou ao pressionar Tab.
            </p>

            <div className="flex flex-wrap items-center gap-2 mb-4">
              <label htmlFor="email-destino-sem-dctf" className="text-sm font-medium text-orange-900">Destinatário:</label>
              <div className="flex items-center rounded-lg border-2 border-orange-300 bg-white focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-200">
                <input
                  id="email-destino-sem-dctf"
                  type="text"
                  value={emailDestinoSemDCTFInput}
                  onChange={(e) => setEmailDestinoSemDCTFInput(e.target.value)}
                  onBlur={aplicaAutocompleteEmailSemDCTF}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab') aplicaAutocompleteEmailSemDCTF();
                  }}
                  placeholder="Ex: ti"
                  className="px-3 py-2 rounded-l-md border-0 focus:ring-0 min-w-[120px] text-gray-900 placeholder-gray-400"
                  autoComplete="off"
                />
                <span className="px-3 py-2 text-gray-500 bg-gray-50 border-l border-orange-200 rounded-r-md text-sm select-none">
                  @central-rnc.com.br
                </span>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-orange-300 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">O que será incluído:</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                <li>Empresa, CNPJ, Regime, Competência Obrigação, Movimento em</li>
                <li>Tipos Movimento, Total Movimentações, Vencimento, Dias até Vencimento</li>
                <li>Possível Obrigação de Envio</li>
                <li>HTML formatado para fácil leitura</li>
              </ul>
            </div>

            {emailSuccessSemDCTF && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded mb-4">
                ✅ {emailSuccessSemDCTF}
              </div>
            )}

            {emailErrorSemDCTF && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
                ❌ {emailErrorSemDCTF}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleSendEmailSemDCTFComMovimento}
                disabled={sendingEmailSemDCTF || !emailDestinoSemDCTFValido()}
                className="flex items-center gap-2 bg-orange-600 text-white px-6 py-3 rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
                {sendingEmailSemDCTF ? 'Enviando Email...' : 'Enviar Email'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Seção de Consulta em Lote de CNPJs com Divergências */}
      <div className="bg-amber-50 border-2 border-amber-200 shadow-lg rounded-lg p-6 mb-6">
        <div className="flex items-start mb-4">
          <ExclamationTriangleIcon className="h-6 w-6 text-amber-600 mr-3 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-amber-900 mb-2">Consulta em Lote - CNPJs com Divergências</h2>
            <p className="text-sm text-amber-700 mb-4">
              Consulta apenas os CNPJs de empresas na aba Participação que têm divergências
              (percentuais não somam 100% ou valores não batem com Capital Social).
              Os CNPJs são armazenados em uma tabela temporária e removidos após processamento bem-sucedido.
            </p>

            <div className="bg-white rounded-lg p-4 border border-amber-300 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Como funciona:</h3>
              <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside">
                <li>Clique em "Popular Tabela" para identificar CNPJs com divergências</li>
                <li>Clique em "Iniciar Consulta" para processar os CNPJs da tabela temporária</li>
                <li>Cada CNPJ é removido da tabela após ser processado com sucesso</li>
                <li>CNPJs com erro permanecem na tabela para nova tentativa</li>
              </ol>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={handlePopularPendentes}
                disabled={populandoPendentes || consultandoPendentes}
                className="flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {populandoPendentes ? (
                  <>
                    <LoadingSpinner size="sm" />
                    Populando...
                  </>
                ) : (
                  <>
                    <ArrowPathIcon className="h-4 w-4" />
                    Popular Tabela
                  </>
                )}
              </button>

              <button
                onClick={handleIniciarConsultaPendentes}
                disabled={consultandoPendentes || consultandoSITF || !totalPendentes || totalPendentes === 0}
                className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {consultandoPendentes ? (
                  <>
                    <LoadingSpinner size="sm" />
                    Processando...
                  </>
                ) : (
                  <>
                    <DocumentTextIcon className="h-4 w-4" />
                    Iniciar Consulta
                  </>
                )}
              </button>

              {totalPendentes !== null && (
                <span className="text-sm font-semibold text-amber-700 bg-amber-100 px-3 py-2 rounded">
                  {totalPendentes} CNPJ{totalPendentes !== 1 ? 's' : ''} pendente{totalPendentes !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Seção de Consulta em Lote de Situação Fiscal */}
      <div className="bg-emerald-50 border-2 border-emerald-200 shadow-lg rounded-lg p-6 mb-6">
        <div className="flex items-start mb-4">
          <DocumentTextIcon className="h-6 w-6 text-emerald-600 mr-3 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-emerald-900 mb-2">Consulta em Lote - Situação Fiscal (SITF)</h2>
            <p className="text-sm text-emerald-700 mb-4">
              Consulta a Situação Fiscal (SITF) de todos os CNPJs cadastrados no sistema.
              O sistema irá iterar sobre cada CNPJ, fazer requisições na Receita Federal
              e salvar os PDFs e dados extraídos na tabela <code className="bg-emerald-100 px-1 rounded">sitf_downloads</code>.
            </p>

            <div className="bg-white rounded-lg p-4 border border-emerald-300 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Informações Importantes:</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                <li>A consulta é feita de forma sequencial (um CNPJ por vez)</li>
                <li>Aguarda 3 segundos entre cada requisição para não sobrecarregar a API</li>
                <li>Os PDFs são baixados e os dados são extraídos automaticamente</li>
                <li>Sócios, débitos e pendências são atualizados no sistema</li>
                <li>A operação pode levar vários minutos dependendo da quantidade de clientes</li>
              </ul>
            </div>

            {erroSITF && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4 text-sm">
                <strong>Erro:</strong> {erroSITF}
              </div>
            )}

            {resultadoSITF && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded mb-4 text-sm">
                <strong>Consulta Concluída!</strong>
                <ul className="mt-2 list-disc list-inside">
                  <li>Total processado: {resultadoSITF.total || 0} CNPJs</li>
                  {resultadoSITF.totalOriginal && resultadoSITF.totalOriginal > (resultadoSITF.total || 0) && (
                    <li className="text-blue-700">
                      CNPJs já processados ignorados: {resultadoSITF.totalOriginal - (resultadoSITF.total || 0)}
                    </li>
                  )}
                  <li>Sucessos: {resultadoSITF.sucessos || 0}</li>
                  <li>Erros: {resultadoSITF.erros || 0}</li>
                </ul>
                {resultadoSITF.erros_detalhados && resultadoSITF.erros_detalhados.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-green-300">
                    <details className="cursor-pointer">
                      <summary className="font-semibold text-red-700 hover:text-red-800">
                        Ver erros detalhados ({resultadoSITF.erros_detalhados.length})
                      </summary>
                      <div className="mt-2 max-h-64 overflow-y-auto">
                        <table className="min-w-full divide-y divide-red-200 text-xs">
                          <thead className="bg-red-100 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-red-900">CNPJ</th>
                              <th className="px-3 py-2 text-left font-semibold text-red-900">Razão Social</th>
                              <th className="px-3 py-2 text-left font-semibold text-red-900">Erro</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-red-100">
                            {resultadoSITF.erros_detalhados.map((erro: any, idx: number) => (
                              <tr key={idx} className="hover:bg-red-50">
                                <td className="px-3 py-2 font-mono text-red-800">{erro.cnpj}</td>
                                <td className="px-3 py-2 text-red-700">{erro.razao_social}</td>
                                <td className="px-3 py-2 text-red-600">{erro.erro}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            )}

            {/* Log de Erros Detalhados */}
            {progressoSITF && progressoSITF.erros_detalhados && progressoSITF.erros_detalhados.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-semibold text-red-900 mb-3 flex items-center gap-2">
                  <ExclamationTriangleIcon className="h-5 w-5" />
                  Log de Erros ({progressoSITF.erros_detalhados.length} erro{progressoSITF.erros_detalhados.length !== 1 ? 's' : ''})
                </h4>
                <div className="max-h-64 overflow-y-auto">
                  <table className="min-w-full divide-y divide-red-200 text-xs">
                    <thead className="bg-red-100 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-red-900">CNPJ</th>
                        <th className="px-3 py-2 text-left font-semibold text-red-900">Razão Social</th>
                        <th className="px-3 py-2 text-left font-semibold text-red-900">Erro</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-red-100">
                      {progressoSITF.erros_detalhados.map((erro, idx) => (
                        <tr key={idx} className="hover:bg-red-50">
                          <td className="px-3 py-2 font-mono text-red-800">{erro.cnpj}</td>
                          <td className="px-3 py-2 text-red-700">{erro.razao_social}</td>
                          <td className="px-3 py-2 text-red-600">{erro.erro}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {progressoSITF && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-emerald-900">
                    Processando consulta em lote de Situação Fiscal...
                  </div>
                  <div className="text-sm font-semibold text-emerald-700">
                    {progressoSITF.processados} de {progressoSITF.total} CNPJs ({progressoSITF.porcentagem}%)
                  </div>
                </div>
                
                {/* Barra de progresso visual */}
                <div className="w-full bg-emerald-200 rounded-full h-4 mb-2 overflow-hidden">
                  <div
                    className="bg-emerald-600 h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progressoSITF.porcentagem}%` }}
                  />
                </div>

                {/* Métricas em tempo real */}
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-100 text-green-700">
                    Sucessos: <strong>{progressoSITF.sucessos}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-700">
                    Erros: <strong>{progressoSITF.erros}</strong>
                  </span>
                </div>
                
                {progressoSITF.cnpjAtual && (
                  <div className="text-xs text-emerald-600 mt-2">
                    Processando CNPJ: <span className="font-mono font-semibold">{progressoSITF.cnpjAtual}</span>
                  </div>
                )}

                {(progressoSITF.status === 'em_andamento') && (
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={handleCancelarConsultaSITF}
                      className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 font-medium text-sm"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Parar Consulta
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Opção para escolher processar todos ou apenas faltantes */}
            <div className="bg-white rounded-lg p-4 border border-emerald-300 mb-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={apenasFaltantesSITF}
                  onChange={(e) => setApenasFaltantesSITF(e.target.checked)}
                  disabled={consultandoSITF}
                  className="w-5 h-5 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    Processar apenas CNPJs faltantes
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    Se marcado, processa apenas CNPJs que ainda não têm registros de Situação Fiscal. 
                    Isso evita reprocessar CNPJs já consultados.
                  </div>
                </div>
              </label>
            </div>

            <button
              onClick={async () => {
                setConsultandoSITF(true);
                setErroSITF(null);
                setResultadoSITF(null);
                
                try {
                  const response = await axios.post('/api/situacao-fiscal/lote/iniciar', {
                    apenasFaltantes: apenasFaltantesSITF
                  }, {
                    params: {
                      apenasFaltantes: apenasFaltantesSITF
                    }
                  });
                  const { progressId, total, totalOriginal, jaProcessados, message } = response.data;
                  
                  // Mostrar mensagem informativa se houver CNPJs já processados
                  if (jaProcessados > 0) {
                    console.log(`[SITF] ${jaProcessados} CNPJs já processados foram ignorados`);
                  }
                  
                  setProgressIdSITF(progressId);
                  
                  // Iniciar polling do progresso
                  if (pollingIntervalSITFRef.current) {
                    clearInterval(pollingIntervalSITFRef.current);
                  }
                  
                  const interval = setInterval(() => {
                    verificarProgressoSITF(progressId);
                  }, 2000);
                  
                  pollingIntervalSITFRef.current = interval;
                  
                  // Primeira verificação imediata
                  verificarProgressoSITF(progressId);
                  
                } catch (error: any) {
                  setErroSITF(error.response?.data?.error || error.message || 'Erro ao iniciar consulta');
                  setConsultandoSITF(false);
                }
              }}
              disabled={consultandoSITF}
              className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {consultandoSITF ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Consultando...</span>
                </>
              ) : (
                <>
                  <DocumentTextIcon className="h-5 w-5" />
                  <span>Iniciar Consulta de Situação Fiscal</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Administracao;

