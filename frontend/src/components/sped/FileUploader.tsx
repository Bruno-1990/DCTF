import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowUpTrayIcon, 
  DocumentIcon, 
  XMarkIcon, 
  CheckCircleIcon,
  InformationCircleIcon,
  LightBulbIcon
} from '@heroicons/react/24/outline';
import { spedService } from '../../services/sped';

interface FileUploaderProps {
  onUploadStart: (validationId: string, setor: string) => void;
  onError: (error: string) => void;
}

const MAX_XML_FILES = 10000;
const WARNING_THRESHOLD = 8000;

const SETORES = [
  { value: '', label: 'Base (padrão)', desc: 'Regras gerais aplicáveis a todos os setores' },
  { value: 'autopecas', label: 'Autopeças', desc: 'Peças automotivas, pneus, óleos e lubrificantes' },
  { value: 'bebidas', label: 'Bebidas', desc: 'Cervejas, refrigerantes, sucos, vinhos e destilados' },
  { value: 'comercio', label: 'Comércio', desc: 'Varejo, atacado e distribuição' },
  { value: 'construcao', label: 'Construção', desc: 'Materiais de construção, cimento, argamassa' },
  { value: 'cosmeticos', label: 'Cosméticos', desc: 'Perfumes, maquiagem, produtos de higiene' },
  { value: 'ecommerce', label: 'E-commerce', desc: 'Vendas online e marketplace' },
  { value: 'industria', label: 'Indústria', desc: 'Produção e manufatura industrial' },
  { value: 'transporte', label: 'Transporte', desc: 'Logística, frete e serviços de transporte' }
];

const FileUploader: React.FC<FileUploaderProps> = ({ onUploadStart, onError }) => {
  const [spedFile, setSpedFile] = useState<File | null>(null);
  const [xmlFiles, setXmlFiles] = useState<File[]>([]);
  const [setorDetectado, setSetorDetectado] = useState<string | null>(null);
  const [setoresSelecionados, setSetoresSelecionados] = useState<string[]>([]);
  const [isDetectando, setIsDetectando] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [mostrarDetalhesSetor, setMostrarDetalhesSetor] = useState(false);
  const [mostrarSeletorSetor, setMostrarSeletorSetor] = useState(false);
  const [isDraggingSped, setIsDraggingSped] = useState(false);
  const [isDraggingXml, setIsDraggingXml] = useState(false);
  
  const spedInputRef = useRef<HTMLInputElement>(null);
  const xmlInputRef = useRef<HTMLInputElement>(null);
  const spedDropZoneRef = useRef<HTMLDivElement>(null);
  const xmlDropZoneRef = useRef<HTMLDivElement>(null);

  // Detectar setor automaticamente quando SPED e XMLs estiverem prontos
  // Com debounce para evitar múltiplas chamadas quando muitos arquivos são adicionados
  useEffect(() => {
    // Se já detectou com sucesso (não é null e não é string vazia) ou está detectando, não fazer nada
    if ((setorDetectado !== null && setorDetectado !== '') || isDetectando) {
      return;
    }

    // Se não tem arquivos necessários, não fazer nada
    if (!spedFile || xmlFiles.length === 0) {
      return;
    }

    // Debounce: aguardar 1.5 segundos após a última mudança antes de detectar
    const timeoutId = setTimeout(async () => {
      // Verificar novamente se ainda não foi detectado (pode ter mudado durante o debounce)
      if ((setorDetectado !== null && setorDetectado !== '') || isDetectando || !spedFile || xmlFiles.length === 0) {
        return;
      }

        setIsDetectando(true);
        try {
        const setores = await spedService.detectarSetor(spedFile, xmlFiles);
        if (setores && setores.length > 0) {
          // Se detectou múltiplos setores, selecionar todos automaticamente
          setSetoresSelecionados(setores);
          // Para compatibilidade, manter setorDetectado como o primeiro
          setSetorDetectado(setores[0]);
          } else {
          // Se não encontrou setor, definir como string vazia mas permitir nova tentativa se arquivos mudarem
            setSetorDetectado('');
            setSetoresSelecionados([]);
          }
      } catch (error: any) {
        // Não logar erro 429 repetidamente
        if (error.response?.status !== 429) {
          console.warn('Erro ao detectar setor:', error);
        }
        // Em caso de erro, resetar para null para permitir nova tentativa
        setSetorDetectado(null);
          setSetoresSelecionados([]);
        } finally {
          setIsDetectando(false);
        }
    }, 1500); // 1.5 segundos de debounce

    return () => {
      clearTimeout(timeoutId);
    };
  }, [spedFile, xmlFiles.length, setorDetectado, isDetectando]);

  const handleSpedFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.name.endsWith('.txt')) {
        setSpedFile(file);
        setSetorDetectado(null); // Reset para detectar novamente
      } else {
        onError('O arquivo SPED deve ser um arquivo .txt');
      }
    }
  };

  const handleXmlFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const xmlFilesOnly = files.filter(f => f.name.endsWith('.xml'));
    
    if (xmlFilesOnly.length !== files.length) {
      onError('Apenas arquivos XML são permitidos');
    }
    
    const newTotal = xmlFiles.length + xmlFilesOnly.length;
    
    if (newTotal > MAX_XML_FILES) {
      onError(`Limite excedido! Máximo permitido: ${MAX_XML_FILES.toLocaleString('pt-BR')} arquivos XML.`);
      return;
    }
    
    setXmlFiles(prev => [...prev, ...xmlFilesOnly]);
    setSetorDetectado(null); // Reset para detectar novamente
  };

  const removeXmlFile = (index: number) => {
    setXmlFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSpedDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingSped(true);
    }
  };

  const handleSpedDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = spedDropZoneRef.current?.getBoundingClientRect();
    if (rect) {
      const x = e.clientX;
      const y = e.clientY;
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        setIsDraggingSped(false);
      }
    }
  };

  const handleSpedDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingSped(false);

    const files = Array.from(e.dataTransfer.files);
    const txtFile = files.find(f => f.name.endsWith('.txt'));

    if (txtFile) {
      setSpedFile(txtFile);
      setSetorDetectado(null);
    } else {
      onError('Por favor, arraste um arquivo .txt para o campo SPED');
    }
  };

  const handleXmlDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingXml(true);
    }
  };

  const handleXmlDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = xmlDropZoneRef.current?.getBoundingClientRect();
    if (rect) {
      const x = e.clientX;
      const y = e.clientY;
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        setIsDraggingXml(false);
      }
    }
  };

  const handleXmlDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingXml(false);

    const files = Array.from(e.dataTransfer.files);
    const xmlFilesOnly = files.filter(f => f.name.endsWith('.xml'));

    if (xmlFilesOnly.length > 0) {
      const newTotal = xmlFiles.length + xmlFilesOnly.length;
      
      if (newTotal > MAX_XML_FILES) {
        onError(`Limite excedido! Máximo permitido: ${MAX_XML_FILES.toLocaleString('pt-BR')} arquivos XML.`);
        return;
      }
      
      setXmlFiles(prev => [...prev, ...xmlFilesOnly]);
      setSetorDetectado(null);
    } else if (files.length > 0) {
      onError('Por favor, arraste apenas arquivos .xml para o campo XMLs');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!spedFile) {
      onError('Por favor, selecione o arquivo SPED');
      return;
    }

    if (xmlFiles.length === 0) {
      onError('Por favor, selecione pelo menos um arquivo XML');
      return;
    }

    setIsUploading(true);

    try {
      // Filtrar setores vazios, mas permitir se apenas base estiver selecionado
      const setores = setoresSelecionados.filter(s => s !== '');
      // Se não houver setores específicos, usar base (array vazio = base)
      const setoresParaEnviar = setores.length > 0 ? setores : [];
      const validationId = await spedService.validar(spedFile, xmlFiles, setoresParaEnviar.length > 0 ? setoresParaEnviar : undefined);
      onUploadStart(validationId, setoresParaEnviar.length > 0 ? setoresParaEnviar.join(',') : 'base');
    } catch (error: any) {
      onError(error.message || 'Erro ao iniciar validação');
    } finally {
      setIsUploading(false);
    }
  };

  const setorInfo = setorDetectado ? SETORES.find(s => s.value === setorDetectado) : null;
  const setoresSelecionadosInfo = setoresSelecionados
    .filter(s => s !== '')
    .map(s => SETORES.find(setor => setor.value === s))
    .filter(Boolean);

  return (
    <div className="bg-white rounded-xl shadow-lg p-8">
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Upload SPED - Design Moderno */}
        <div>
          <label className="block text-lg font-semibold text-gray-900 mb-4">
            Arquivo SPED Fiscal (.txt) *
          </label>
          <div
            ref={spedDropZoneRef}
            onDragOver={handleSpedDragOver}
            onDragLeave={handleSpedDragLeave}
            onDrop={handleSpedDrop}
            className={`relative transition-all duration-200 ${
              isDraggingSped
                ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-blue-100 scale-[1.02]'
                : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            } border-3 border-dashed rounded-2xl p-12 min-h-[200px] flex flex-col items-center justify-center`}
          >
            <div className="text-center space-y-4 w-full">
              {isDraggingSped ? (
                <>
                  <div className="mx-auto w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center animate-pulse">
                    <ArrowUpTrayIcon className="h-10 w-10 text-white" />
                  </div>
                  <p className="text-xl font-semibold text-blue-600">Solte o arquivo aqui</p>
                </>
              ) : (
                <>
                  <div className="mx-auto w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
                    <DocumentIcon className="h-10 w-10 text-gray-400" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-lg font-medium text-gray-700">
                      Arraste e solte o arquivo SPED aqui
                    </p>
                    <p className="text-sm text-gray-500">ou</p>
                    <label className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 cursor-pointer transition-colors shadow-md hover:shadow-lg">
                      <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
                      Selecionar arquivo
                  <input
                    ref={spedInputRef}
                    type="file"
                    accept=".txt"
                    onChange={handleSpedFileChange}
                    className="sr-only"
                  />
                </label>
              </div>
                  <p className="text-xs text-gray-400 mt-4">Formato: .txt | Tamanho máximo: 50MB</p>
                </>
              )}
              {spedFile && !isDraggingSped && (
                <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircleIcon className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium text-green-800">{spedFile.name}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Upload XMLs - Design Moderno */}
        <div>
          <label className="block text-lg font-semibold text-gray-900 mb-4">
            Arquivos XML (NF-e/CT-e) * 
            <span className="text-sm font-normal text-gray-500 ml-2">
              (máximo {MAX_XML_FILES.toLocaleString('pt-BR')} arquivos)
            </span>
          </label>
          <div
            ref={xmlDropZoneRef}
            onDragOver={handleXmlDragOver}
            onDragLeave={handleXmlDragLeave}
            onDrop={handleXmlDrop}
            className={`relative transition-all duration-200 ${
              isDraggingXml
                ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-blue-100 scale-[1.02]'
                : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            } border-3 border-dashed rounded-2xl p-12 min-h-[250px] flex flex-col items-center justify-center`}
          >
            <div className="text-center space-y-4 w-full">
              {isDraggingXml ? (
                <>
                  <div className="mx-auto w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center animate-pulse">
                    <ArrowUpTrayIcon className="h-10 w-10 text-white" />
                  </div>
                  <p className="text-xl font-semibold text-blue-600">Solte os arquivos aqui</p>
                </>
              ) : (
                <>
                  <div className="mx-auto w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
                    <DocumentIcon className="h-10 w-10 text-gray-400" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-lg font-medium text-gray-700">
                      Arraste e solte os arquivos XML aqui
                    </p>
                    <p className="text-sm text-gray-500">ou</p>
                    <label className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 cursor-pointer transition-colors shadow-md hover:shadow-lg">
                      <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
                      Selecionar arquivos
                  <input
                    ref={xmlInputRef}
                    type="file"
                    accept=".xml"
                    multiple
                    onChange={handleXmlFilesChange}
                    className="sr-only"
                  />
                </label>
              </div>
                  <p className="text-xs text-gray-400 mt-4">Formato: .xml | Múltiplos arquivos permitidos</p>
                </>
              )}
              {xmlFiles.length > 0 && !isDraggingXml && (
                <div className="mt-6 w-full max-h-60 overflow-y-auto space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      {xmlFiles.length} arquivo(s) selecionado(s)
                    </span>
                    {xmlFiles.length > 10 && (
                      <button
                        type="button"
                        onClick={() => setXmlFiles([])}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Limpar todos
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                    {xmlFiles.slice(0, 10).map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-50 px-4 py-2 rounded-lg border border-gray-200">
                        <span className="text-sm text-gray-700 truncate flex-1">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeXmlFile(index)}
                          className="ml-2 text-red-600 hover:text-red-800"
                        >
                          <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
                    {xmlFiles.length > 10 && (
                      <p className="text-xs text-gray-500 text-center py-2">
                        + {xmlFiles.length - 10} arquivo(s) adicional(is)
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          {xmlFiles.length > 0 && (
            <div className="mt-3">
              <p className={`text-sm font-medium ${
                xmlFiles.length >= MAX_XML_FILES
                  ? 'text-red-600'
                  : xmlFiles.length >= WARNING_THRESHOLD
                  ? 'text-yellow-600'
                  : 'text-gray-600'
              }`}>
                {xmlFiles.length.toLocaleString('pt-BR')} de {MAX_XML_FILES.toLocaleString('pt-BR')} arquivos
              </p>
            </div>
          )}
        </div>

        {/* Detecção de Setor - Design Moderno */}
        {spedFile && xmlFiles.length > 0 && (
          <div className="border-t border-gray-200 pt-8">
            {isDetectando ? (
              <div className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 rounded-2xl border-2 border-blue-200 shadow-lg">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400/10 to-purple-400/10 animate-pulse"></div>
                <div className="relative flex items-center justify-center gap-4 p-8">
                  <div className="relative">
                    <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20"></div>
                    <div className="relative bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full p-4 shadow-xl">
                      <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">Analisando arquivos...</h3>
                    <p className="text-sm text-gray-600">Detectando setor baseado em CFOPs, NCMs, CSTs e descrições</p>
                    <div className="mt-3 w-full bg-white/50 rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            ) : setorDetectado !== null && (
              <div className="space-y-5">
                {setorDetectado ? (
                  <div className="relative overflow-hidden bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 rounded-2xl border-2 border-emerald-300 shadow-xl">
                    {/* Decorative elements */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-200/20 rounded-full -mr-16 -mt-16"></div>
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-teal-200/20 rounded-full -ml-12 -mb-12"></div>
                    
                    <div className="relative p-8">
                      <div className="flex items-start gap-5 mb-6">
                        <div className="flex-shrink-0">
                          <div className="relative group">
                            <div className="absolute inset-0 bg-emerald-400 rounded-2xl blur-xl opacity-50 group-hover:opacity-70 transition-opacity animate-pulse"></div>
                            <div className="relative bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600 rounded-2xl p-5 shadow-2xl transform group-hover:scale-105 transition-transform">
                              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-2xl"></div>
                              <LightBulbIcon className="h-10 w-10 text-white relative z-10 drop-shadow-lg" />
                            </div>
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full animate-ping"></div>
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full"></div>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-800 border-2 border-emerald-300 shadow-sm">
                              <svg className="h-3.5 w-3.5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              Detectado Automaticamente
                            </span>
                          </div>
                          {setoresSelecionados.length > 0 ? (
                            <div className="space-y-3">
                              <h3 className="text-2xl font-extrabold bg-gradient-to-r from-emerald-700 via-green-700 to-teal-700 bg-clip-text text-transparent mb-3">
                                {setoresSelecionados.length === 1 
                                  ? setorInfo?.label || setorDetectado
                                  : `${setoresSelecionados.length} Setores Selecionados`
                                }
                              </h3>
                              <div className="flex flex-wrap gap-2">
                                {setoresSelecionadosInfo.map((info, idx) => (
                                  <div
                                    key={idx}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-100 to-green-100 border-2 border-emerald-300 rounded-xl shadow-sm"
                                  >
                                    <span className="text-sm font-bold text-emerald-800">{info?.label}</span>
                                  </div>
                                ))}
                              </div>
                              {setoresSelecionados.length > 1 && (
                                <p className="text-xs text-gray-600 italic">
                                  As regras de todos os setores selecionados serão combinadas na validação
                                </p>
                              )}
                            </div>
                          ) : (
                            <>
                              <h3 className="text-3xl font-extrabold bg-gradient-to-r from-emerald-700 via-green-700 to-teal-700 bg-clip-text text-transparent mb-2">
                                {setorInfo?.label || setorDetectado}
                              </h3>
                              <p className="text-sm text-gray-700 leading-relaxed font-medium">
                                {setorInfo?.desc || 'Setor identificado com base na análise dos arquivos'}
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                      
                      <button
                        type="button"
                        onClick={() => setMostrarDetalhesSetor(!mostrarDetalhesSetor)}
                        className="group flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-emerald-700 bg-white/90 hover:bg-white rounded-xl border-2 border-emerald-200 hover:border-emerald-400 transition-all hover:shadow-lg transform hover:scale-[1.02]"
                      >
                        <InformationCircleIcon className={`h-5 w-5 transition-all duration-300 ${mostrarDetalhesSetor ? 'rotate-180 text-emerald-600' : 'text-emerald-500'}`} />
                        <span className="transition-colors">{mostrarDetalhesSetor ? 'Ocultar detalhes técnicos' : 'Ver detalhes técnicos'}</span>
                        <svg className={`h-4 w-4 transition-transform duration-300 ${mostrarDetalhesSetor ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      
                      {mostrarDetalhesSetor && (
                        <div className="mt-5 p-6 bg-gradient-to-br from-white to-emerald-50/50 backdrop-blur-sm rounded-2xl border-2 border-emerald-200 shadow-xl animate-in fade-in slide-in-from-top-2 duration-300">
                          <h4 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-lg p-1.5">
                              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                            Como foi detectado?
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {[
                              { icon: '📋', title: 'CFOPs', desc: 'Análise de CFOPs específicos do setor nos documentos fiscais' },
                              { icon: '🏷️', title: 'NCMs', desc: 'Verificação de NCMs (Nomenclatura Comum do Mercosul) característicos' },
                              { icon: '🔢', title: 'CSTs', desc: 'Identificação de CSTs (Código de Situação Tributária) esperados' },
                              { icon: '📝', title: 'Descrições', desc: 'Análise de descrições de produtos nos XMLs e SPED' }
                            ].map((item, idx) => (
                              <div key={idx} className="flex items-start gap-3 p-3 bg-white/80 rounded-xl border border-emerald-100 hover:border-emerald-300 transition-all hover:shadow-md">
                                <span className="text-2xl flex-shrink-0">{item.icon}</span>
                                <div>
                                  <p className="text-xs font-bold text-emerald-700 mb-1">{item.title}</p>
                                  <p className="text-xs text-gray-600 leading-relaxed">{item.desc}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="relative overflow-hidden bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 rounded-2xl border-2 border-amber-200 shadow-lg">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-200/20 rounded-full -mr-12 -mt-12"></div>
                    <div className="relative p-6">
                      <div className="flex items-center gap-4">
                        <div className="flex-shrink-0">
                          <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl p-3 shadow-lg">
                            <InformationCircleIcon className="h-6 w-6 text-white" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-900 mb-1">Setor não detectado automaticamente</h3>
                          <p className="text-sm text-gray-600">Você pode escolher um setor manualmente para aplicar as regras específicas</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {!mostrarSeletorSetor ? (
                  <button
                    type="button"
                    onClick={() => setMostrarSeletorSetor(true)}
                    className="group relative w-full px-6 py-4 text-base font-bold text-white bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 rounded-2xl border-2 border-blue-400 hover:border-blue-500 transition-all duration-300 shadow-lg hover:shadow-2xl flex items-center justify-center gap-3 overflow-hidden transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {/* Efeito de brilho animado */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                    
                    {/* Ícone com animação */}
                    <div className="relative z-10 flex items-center justify-center">
                      <svg className="h-6 w-6 text-white group-hover:rotate-90 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    </div>
                    
                    {/* Texto */}
                    <span className="relative z-10">
                      {setoresSelecionados.length > 0 ? 'Gerenciar Setores Selecionados' : 'Adicionar Setor'}
                    </span>
                    
                    {/* Badge com contador se houver setores selecionados */}
                    {setoresSelecionados.length > 0 && (
                      <span className="relative z-10 inline-flex items-center justify-center px-3 py-1 text-xs font-bold text-blue-600 bg-white rounded-full shadow-md">
                        {setoresSelecionados.length}
                      </span>
                    )}
                    
                    {/* Efeito de brilho no hover */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-400/50 via-white/30 to-indigo-400/50 blur-xl"></div>
                    </div>
                  </button>
                ) : (
                  <div className="relative overflow-hidden bg-gradient-to-br from-gray-50 to-blue-50 rounded-2xl border-2 border-gray-200 shadow-lg p-6">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-200/10 rounded-full -mr-16 -mt-16"></div>
                    <div className="relative">
                      <label className="block text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                        Selecionar Setor(es) - Múltipla Seleção
                      </label>
                      <p className="text-xs text-gray-600 mb-4">
                        Você pode selecionar múltiplos setores. As regras serão combinadas para validação.
                      </p>
                      <div 
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto pr-2"
                        style={{ scrollbarWidth: 'thin' }}
                        onWheel={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        {SETORES.map(s => {
                          const isSelected = setoresSelecionados.includes(s.value);
                          return (
                            <label
                              key={s.value}
                              className={`relative flex flex-col gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-blue-50 border-blue-400 shadow-md'
                                  : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSetoresSelecionados([...setoresSelecionados, s.value]);
                                    } else {
                                      setSetoresSelecionados(setoresSelecionados.filter(v => v !== s.value));
                                    }
                                  }}
                                  className="mt-0.5 h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className={`font-semibold text-sm ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                                    {s.label}
                                  </p>
                                </div>
                                {isSelected && (
                                  <CheckCircleIcon className="h-5 w-5 text-blue-600 flex-shrink-0" />
                                )}
                              </div>
                              <p className="text-xs text-gray-600 leading-relaxed pl-7">{s.desc}</p>
                            </label>
                          );
                        })}
                      </div>
                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setMostrarSeletorSetor(false);
                            if (setorDetectado && setoresSelecionados.length === 0) {
                              setSetoresSelecionados([setorDetectado]);
                            }
                          }}
                          className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-xl border border-blue-600 transition-all shadow-md hover:shadow-lg"
                        >
                          Concluir Seleção
                        </button>
                        {setoresSelecionados.length === 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setSetoresSelecionados(['']);
                              setMostrarSeletorSetor(false);
                            }}
                            className="px-4 py-2.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl border-2 border-blue-300 transition-colors"
                          >
                            Usar Base
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Botão Submit */}
        {spedFile && xmlFiles.length > 0 && !mostrarSeletorSetor && (
          <div className="flex justify-end pt-6 border-t border-gray-200">
            <button
              type="submit"
              disabled={isUploading || isDetectando}
              className="inline-flex items-center px-8 py-4 text-lg font-semibold rounded-xl shadow-lg text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105"
            >
              {isUploading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processando...
                </>
              ) : (
                <>
                  <ArrowUpTrayIcon className="h-6 w-6 mr-2" />
                  Iniciar Validação
                </>
              )}
            </button>
          </div>
        )}
      </form>
    </div>
  );
};

export default FileUploader;
