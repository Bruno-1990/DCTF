import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowUpTrayIcon,
  DocumentIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

export interface PreCheckResult {
  xmlCount: number;
  xmlValid: number;
  xmlErrors: string[];
  spedRecords: number;
  competencias: string[];
  nfeKeys: string[];
  nfeDuplicates: string[];
  isValid: boolean;
}

export interface Step2FileUploadProps {
  onFilesSelected: (spedFile: File | null, xmlFiles: File[]) => void;
  onPreCheckComplete?: (result: PreCheckResult) => void;
  onNext?: () => void; // Callback para avançar para próxima etapa
  isLoading?: boolean;
  error?: string | null;
}

const Step2FileUpload: React.FC<Step2FileUploadProps> = ({
  onFilesSelected,
  onPreCheckComplete,
  onNext,
  isLoading = false,
  error = null,
}) => {
  const [spedFile, setSpedFile] = useState<File | null>(null);
  const [xmlFiles, setXmlFiles] = useState<File[]>([]);
  const [isDraggingSped, setIsDraggingSped] = useState(false);
  const [isDraggingXml, setIsDraggingXml] = useState(false);
  const [preCheckResult, setPreCheckResult] = useState<PreCheckResult | null>(null);
  const [isPreChecking, setIsPreChecking] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const spedInputRef = useRef<HTMLInputElement>(null);
  const xmlInputRef = useRef<HTMLInputElement>(null);
  const spedDropZoneRef = useRef<HTMLDivElement>(null);
  const xmlDropZoneRef = useRef<HTMLDivElement>(null);

  // Debug: Log sempre que xmlFiles mudar
  useEffect(() => {
    console.log('[Step2FileUpload] 📊 Estado atual de xmlFiles:', xmlFiles.length, 'arquivos');
    if (xmlFiles.length > 0) {
      const nomesUnicos = new Set(xmlFiles.map(f => f.name));
      if (nomesUnicos.size !== xmlFiles.length) {
        console.error('[Step2FileUpload] ⚠️ ATENÇÃO: Há arquivos duplicados no state!', {
          total: xmlFiles.length,
          unicos: nomesUnicos.size,
          duplicatas: xmlFiles.length - nomesUnicos.size
        });
      }
    }
  }, [xmlFiles]);

  // Handlers para SPED
  const handleSpedFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.name.endsWith('.txt') || file.name.endsWith('.sped')) {
        setSpedFile(file);
        setPreCheckResult(null);
        setUploadError(null);
        onFilesSelected(file, xmlFiles);
        // Navegação automática será feita no componente pai após extração de metadados
      } else {
        const errorMsg = 'Arquivo SPED deve ser .txt ou .sped';
        setUploadError(errorMsg);
        console.error(errorMsg);
      }
    }
    // Reset input para permitir selecionar o mesmo arquivo novamente
    if (spedInputRef.current) {
      spedInputRef.current.value = '';
    }
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
    const txtFile = files.find(f => f.name.endsWith('.txt') || f.name.endsWith('.sped'));

    if (txtFile) {
      setSpedFile(txtFile);
      setPreCheckResult(null);
      setUploadError(null);
      onFilesSelected(txtFile, xmlFiles);
    } else if (files.length > 0) {
      const errorMsg = 'Por favor, arraste um arquivo .txt ou .sped para o campo SPED';
      setUploadError(errorMsg);
    }
  };


  // Handlers para XML (padrão v1.0: apenas XMLs diretos, SEM extração de ZIP)
  const handleXmlFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const xmlFilesOnly = files.filter(f => f.name.endsWith('.xml'));
    
    console.log('[Step2FileUpload] 🔄 handleXmlFilesChange chamado');
    console.log('  - Arquivos selecionados:', files.length);
    console.log('  - XMLs válidos:', xmlFilesOnly.length);
    console.log('  - XMLs no state ANTES:', xmlFiles.length);
    
    // Rejeitar se houver arquivos que não são XML (igual v1.0)
    if (xmlFilesOnly.length !== files.length) {
      const errorMsg = 'Apenas arquivos XML são permitidos';
      setUploadError(errorMsg);
      console.warn('[Step2FileUpload] ❌', errorMsg);
      return;
    }
    
    setUploadError(null);
    
    // Validar limite (igual v1.0)
    const novoTotal = xmlFiles.length + xmlFilesOnly.length;
    
    console.log('[Step2FileUpload] 📊 Validação de limite:');
    console.log('  - XMLs já no state:', xmlFiles.length);
    console.log('  - XMLs novos:', xmlFilesOnly.length);
    console.log('  - Total após upload:', novoTotal);
    
    // Bloquear se passar do limite (4999 XMLs)
    if (novoTotal > 4999) {
      const errorMsg = `❌ LIMITE EXCEDIDO: Máximo de 4.999 arquivos XML permitidos. Você terá ${novoTotal.toLocaleString('pt-BR')} no total. Por favor, remova arquivos ou divida em lotes menores.`;
      setUploadError(errorMsg);
      console.error('[Step2FileUpload] ❌ BLOQUEADO:', errorMsg);
      return;
    }
    
    // Avisar se houver muitos arquivos (mais de 3000)
    if (novoTotal > 3000) {
      const avisoMsg = `⚠️ ATENÇÃO: Você terá ${novoTotal.toLocaleString('pt-BR')} XMLs no total. O processamento pode demorar vários minutos. Considere processar em lotes menores se possível.`;
      console.warn('[Step2FileUpload] ⚠️', avisoMsg);
    }
    
    // Adicionar XMLs diretamente ao state (igual v1.0)
    const arquivosAtualizados = [...xmlFiles, ...xmlFilesOnly];
    setXmlFiles(arquivosAtualizados);
    console.log('[Step2FileUpload] ✅ State atualizado com', arquivosAtualizados.length, 'XMLs');
    
    // Notificar componente pai
    onFilesSelected(spedFile, arquivosAtualizados);
    
    // Reset input
    if (xmlInputRef.current) {
      xmlInputRef.current.value = '';
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

    console.log('[Step2FileUpload] 🔄 handleXmlDrop chamado');
    console.log('  - Arquivos arrastados:', files.length);
    console.log('  - XMLs válidos:', xmlFilesOnly.length);
    console.log('  - XMLs no state ANTES:', xmlFiles.length);

    if (xmlFilesOnly.length > 0) {
      setUploadError(null);
      
      // Validar limite (igual v1.0)
      const novoTotal = xmlFiles.length + xmlFilesOnly.length;
      
      console.log('[Step2FileUpload] 📊 Validação de limite (drag):');
      console.log('  - XMLs já no state:', xmlFiles.length);
      console.log('  - XMLs novos:', xmlFilesOnly.length);
      console.log('  - Total após upload:', novoTotal);
      
      // Bloquear se passar do limite (4999 XMLs)
      if (novoTotal > 4999) {
        const errorMsg = `❌ LIMITE EXCEDIDO: Máximo de 4.999 arquivos XML permitidos. Você terá ${novoTotal.toLocaleString('pt-BR')} no total. Por favor, remova arquivos ou divida em lotes menores.`;
        setUploadError(errorMsg);
        console.error('[Step2FileUpload] ❌ BLOQUEADO (drag):', errorMsg);
        return;
      }
      
      // Avisar se houver muitos arquivos (mais de 3000)
      if (novoTotal > 3000) {
        const avisoMsg = `⚠️ ATENÇÃO: Você terá ${novoTotal.toLocaleString('pt-BR')} XMLs no total. O processamento pode demorar vários minutos. Considere processar em lotes menores se possível.`;
        console.warn('[Step2FileUpload] ⚠️', avisoMsg);
      }
      
      // Adicionar XMLs diretamente ao state (igual v1.0)
      const arquivosAtualizados = [...xmlFiles, ...xmlFilesOnly];
      setXmlFiles(arquivosAtualizados);
      console.log('[Step2FileUpload] ✅ State atualizado (drag) com', arquivosAtualizados.length, 'XMLs');
      
      // Notificar componente pai
      onFilesSelected(spedFile, arquivosAtualizados);
    } else if (files.length > 0) {
      // Rejeitar se houver arquivos que não são XML (igual v1.0)
      const errorMsg = 'Por favor, arraste apenas arquivos .xml para o campo XMLs';
      setUploadError(errorMsg);
      console.warn('[Step2FileUpload] ❌', errorMsg);
    }
  };

  const removeXmlFile = (index: number) => {
    const newXmlFiles = xmlFiles.filter((_, i) => i !== index);
    setXmlFiles(newXmlFiles);
    setPreCheckResult(null);
    onFilesSelected(spedFile, newXmlFiles);
  };

  const removeSpedFile = () => {
    setSpedFile(null);
    setPreCheckResult(null);
    onFilesSelected(null, xmlFiles);
  };

  // Função para validar XML e retornar o texto também
  const validateXml = async (file: File): Promise<{ valid: boolean; error?: string; xmlText?: string }> => {
    try {
      const text = await file.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, 'text/xml');
      
      // Verificar se há erros de parsing
      const parserError = xmlDoc.querySelector('parsererror');
      if (parserError) {
        return { valid: false, error: 'XML malformado ou inválido' };
      }
      
      // Verificar se é um XML válido (tem elementos)
      if (!xmlDoc.documentElement) {
        return { valid: false, error: 'XML vazio ou sem estrutura válida' };
      }
      
      return { valid: true, xmlText: text };
    } catch (error: any) {
      return { valid: false, error: error.message || 'Erro ao processar XML' };
    }
  };

  // Função para extrair chave NF-e de XML (retorna apenas UMA chave válida por XML)
  const extractNfeKey = (xmlText: string, fileName: string): string | null => {
    // Normalizar o texto (remover espaços, quebras de linha extras)
    const normalizedText = xmlText.replace(/\s+/g, ' ').trim();
    
    // Regex para chave NF-e (44 dígitos) - ordem de prioridade
    // 1. infNFe Id (mais comum e confiável)
    // 2. chNFe tag
    // 3. chave tag
    // 4. Qualquer Id="NFe..." (fallback)
    const nfeKeyPatterns = [
      /<infNFe[^>]*Id="NFe(\d{44})"/i,
      /<chNFe>(\d{44})<\/chNFe>/i,
      /<chave>(\d{44})<\/chave>/i,
      /Id="NFe(\d{44})"/i,
    ];
    
    const chavesEncontradas: string[] = [];
    
    // Tentar cada padrão na ordem de prioridade
    for (const pattern of nfeKeyPatterns) {
      const matches = normalizedText.matchAll(new RegExp(pattern.source, pattern.flags + 'g'));
      for (const match of matches) {
        if (match && match[1]) {
          const chave = match[1].trim();
          // Validar que é exatamente 44 dígitos numéricos
          if (/^\d{44}$/.test(chave)) {
            chavesEncontradas.push(chave);
          }
        }
      }
    }
    
    // Remover duplicatas do mesmo XML (caso haja múltiplas ocorrências da mesma chave)
    const chavesUnicas = Array.from(new Set(chavesEncontradas));
    
    if (chavesUnicas.length === 0) {
      return null;
    }
    
    // Se houver múltiplas chaves diferentes no mesmo XML, isso é um problema
    if (chavesUnicas.length > 1) {
      console.warn(`[Step2FileUpload] ⚠️ ATENÇÃO: Arquivo ${fileName} contém ${chavesUnicas.length} chaves NF-e diferentes!`, {
        chaves: chavesUnicas.slice(0, 3)
      });
      // Retornar a primeira chave encontrada (prioridade)
      return chavesUnicas[0];
    }
    
    return chavesUnicas[0];
  };

  // Função principal de pré-check
  const performPreCheck = useCallback(async () => {
    if (xmlFiles.length === 0) {
      setPreCheckResult(null);
      return;
    }

    setIsPreChecking(true);
    const result: PreCheckResult = {
      xmlCount: xmlFiles.length,
      xmlValid: 0,
      xmlErrors: [],
      spedRecords: 0,
      competencias: [],
      nfeKeys: [],
      nfeDuplicates: [],
      isValid: false,
    };

    const nfeKeysMap = new Map<string, { count: number; files: string[] }>();
    const processedFiles = new Set<string>(); // Garantir que cada arquivo é processado apenas uma vez

    console.log(`[Step2FileUpload] 🔍 Iniciando pré-check de ${xmlFiles.length} arquivos XML...`);

    // Validar cada XML (processar uma vez só para evitar reler arquivos)
    for (let i = 0; i < xmlFiles.length; i++) {
      const file = xmlFiles[i];
      
      // Garantir que o arquivo não foi processado antes (por segurança)
      if (processedFiles.has(file.name)) {
        console.warn(`[Step2FileUpload] ⚠️ Arquivo ${file.name} já foi processado, pulando...`);
        continue;
      }
      processedFiles.add(file.name);
      
      const validation = await validateXml(file);
      
      if (validation.valid && validation.xmlText) {
        result.xmlValid++;
        
        // Extrair chave NF-e (já temos o texto do XML, não precisa ler novamente)
        try {
          const nfeKey = extractNfeKey(validation.xmlText, file.name);
          
          if (nfeKey) {
            // Normalizar a chave (garantir que é exatamente 44 dígitos, sem espaços ou caracteres especiais)
            const chaveNormalizada = nfeKey.replace(/\D/g, ''); // Remove tudo que não é dígito
            
            // Validar novamente após normalização
            if (chaveNormalizada.length !== 44 || !/^\d{44}$/.test(chaveNormalizada)) {
              console.warn(`[Step2FileUpload] ⚠️ Chave NF-e inválida extraída de ${file.name}: ${chaveNormalizada} (tamanho: ${chaveNormalizada.length})`);
              // Não adicionar chaves inválidas, pular para próximo arquivo
            } else {
              // Validar que a chave é única para este arquivo (não deve ter múltiplas chaves no mesmo XML)
              // Se já existe no map, é porque está em outro arquivo (duplicata REAL)
              const existing = nfeKeysMap.get(chaveNormalizada);
              if (existing) {
                existing.count++;
                existing.files.push(file.name);
                console.warn(`[Step2FileUpload] ⚠️ Chave NF-e duplicada detectada: ${chaveNormalizada}`, {
                  arquivoAtual: file.name,
                  arquivosAnteriores: existing.files,
                  totalOcorrencias: existing.count
                });
              } else {
                nfeKeysMap.set(chaveNormalizada, { count: 1, files: [file.name] });
                result.nfeKeys.push(chaveNormalizada);
              }
            }
          }
        } catch (error) {
          // Ignorar erros na extração de chave
          console.warn(`[Step2FileUpload] Erro ao extrair chave NF-e de ${file.name}:`, error);
        }
      } else {
        result.xmlErrors.push(`${file.name}: ${validation.error || 'Erro desconhecido'}`);
      }
    }

    // Detectar duplicatas REALMENTE duplicadas (mesma chave em MÚLTIPLOS arquivos XML diferentes)
    // Uma chave que aparece mais de 1 vez = duplicata REAL
    console.log(`[Step2FileUpload] 📊 Total de chaves NF-e únicas encontradas: ${nfeKeysMap.size}`);
    console.log(`[Step2FileUpload] 📊 Total de arquivos XML processados: ${processedFiles.size}`);
    
    // Verificar se há arquivos duplicados no state (mesmo nome de arquivo)
    const nomesArquivos = Array.from(processedFiles);
    const nomesUnicos = new Set(nomesArquivos);
    if (nomesArquivos.length !== nomesUnicos.size) {
      console.error(`[Step2FileUpload] ⚠️ ERRO: Há arquivos com nomes duplicados no processamento!`, {
        total: nomesArquivos.length,
        unicos: nomesUnicos.size
      });
    }
    
    // Verificar duplicatas com mais detalhes
    const duplicatasDetalhadas: Array<{ chave: string; arquivos: string[]; count: number }> = [];
    
    nfeKeysMap.forEach((data, key) => {
      // Validar que a chave não está vazia ou inválida
      if (!key || key.length !== 44 || !/^\d{44}$/.test(key)) {
        console.error(`[Step2FileUpload] ⚠️ Chave inválida detectada no map: ${key}`, {
          tamanho: key?.length,
          arquivos: data.files
        });
        return;
      }
      
      if (data.count > 1) {
        // Chave encontrada em múltiplos arquivos XML = duplicata real
        // IMPORTANTE: Verificar se são arquivos DIFERENTES (não o mesmo arquivo processado duas vezes)
        const arquivosUnicos = Array.from(new Set(data.files));
        
        if (arquivosUnicos.length > 1) {
          // Realmente são arquivos diferentes com a mesma chave
          result.nfeDuplicates.push(key);
          duplicatasDetalhadas.push({
            chave: key,
            arquivos: arquivosUnicos,
            count: data.count
          });
          
          console.warn(`[Step2FileUpload] ⚠️ Chave NF-e duplicada encontrada em ${arquivosUnicos.length} arquivos diferentes:`, {
            chave: key,
            arquivos: arquivosUnicos.slice(0, 10),
            totalArquivos: arquivosUnicos.length,
            totalOcorrencias: data.count
          });
        } else {
          // Mesmo arquivo processado múltiplas vezes (erro no código)
          console.error(`[Step2FileUpload] ⚠️ ERRO: Chave ${key} marcada como duplicada mas está no mesmo arquivo: ${arquivosUnicos[0]}`, {
            count: data.count,
            files: data.files
          });
        }
      }
    });
    
    // Log final detalhado
    if (duplicatasDetalhadas.length > 0) {
      console.warn(`[Step2FileUpload] ⚠️ RESUMO: ${duplicatasDetalhadas.length} chaves NF-e únicas encontradas em múltiplos arquivos:`, {
        duplicatas: duplicatasDetalhadas.slice(0, 5).map(d => ({
          chave: d.chave,
          numArquivos: d.arquivos.length
        }))
      });
    }
    
    console.log(`[Step2FileUpload] ✅ Pré-check concluído: ${result.xmlValid} XMLs válidos, ${result.nfeDuplicates.length} chaves duplicadas detectadas`);

    // Validar SPED (básico - contar linhas)
    // Nota: A pré-checagem do SPED é feita no backend para evitar problemas de encoding
    // Aqui apenas contamos linhas básicas, a extração de metadados será feita no backend
    if (spedFile) {
      try {
        // Tentar ler como texto primeiro (browser tenta detectar encoding automaticamente)
        let spedText = '';
        try {
          spedText = await spedFile.text();
        } catch (e) {
          // Se falhar, tentar com arrayBuffer e decodificar como latin1
          const arrayBuffer = await spedFile.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          // Converter bytes para string usando latin1 (suporta todos os bytes 0-255)
          // Processar em chunks para evitar problemas com arrays grandes
          const chunkSize = 65536; // 64KB chunks
          let textParts: string[] = [];
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.slice(i, i + chunkSize);
            textParts.push(String.fromCharCode.apply(null, Array.from(chunk)));
          }
          spedText = textParts.join('');
        }
        
        const lines = spedText.split('\n').filter(line => line.trim().length > 0);
        result.spedRecords = lines.length;
        
        // Extrair competências do SPED (buscar por registros 0000)
        // Formato do SPED: |0000|CNPJ|DDMMAAAA|...
        // Regex: captura DDMMAAAA após o CNPJ
        const competenciaPattern = /\|0000\|[^|]+\|(\d{8})\|/g;
        const competenciasSet = new Set<string>();
        let match;
        
        while ((match = competenciaPattern.exec(spedText)) !== null) {
          const competenciaStr = match[1];
          // Formato: DDMMAAAA (dia + mês + ano)
          if (competenciaStr.length === 8) {
            const dia = competenciaStr.substring(0, 2);
            const mes = competenciaStr.substring(2, 4);
            const ano = competenciaStr.substring(4, 8);
            competenciasSet.add(`${ano}-${mes}`);
          }
        }
        
        result.competencias = Array.from(competenciasSet);
      } catch (error) {
        // Ignorar erros no processamento do SPED na pré-checagem
        // A extração real será feita no backend
        console.warn('Erro na pré-checagem do SPED (será processado no backend):', error);
      }
    }

    result.isValid = result.xmlValid > 0 && result.xmlErrors.length === 0 && result.nfeDuplicates.length === 0;
    
    setPreCheckResult(result);
    setIsPreChecking(false);
    
    if (onPreCheckComplete) {
      onPreCheckComplete(result);
    }
  }, [xmlFiles, spedFile, onPreCheckComplete]);

  // Executar pré-check quando arquivos mudarem
  useEffect(() => {
    if (xmlFiles.length > 0) {
      // Debounce para evitar múltiplas execuções
      const timeoutId = setTimeout(() => {
        performPreCheck();
      }, 500);
      
      return () => clearTimeout(timeoutId);
    } else {
      setPreCheckResult(null);
    }
  }, [xmlFiles, spedFile, performPreCheck]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Upload de Arquivos
        </h3>
        <p className="text-sm text-gray-600">
          Faça upload do arquivo SPED e dos XMLs das notas fiscais para iniciar a validação
        </p>
      </div>

      {(error || uploadError) && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <div className="flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
            <span>{error || uploadError}</span>
          </div>
        </div>
      )}

      {/* Upload SPED */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Arquivo SPED Fiscal *
        </label>
        <div
          ref={spedDropZoneRef}
          onDragOver={handleSpedDragOver}
          onDragLeave={handleSpedDragLeave}
          onDrop={handleSpedDrop}
          className={`relative transition-all duration-200 ${
            isDraggingSped
              ? 'border-blue-500 bg-blue-50 scale-[1.02] shadow-lg'
              : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          } border-2 border-dashed rounded-lg p-8 min-h-[150px] flex flex-col items-center justify-center`}
        >
          <div className="text-center space-y-4 w-full">
            {isDraggingSped ? (
              <>
                <div className="mx-auto w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center">
                  <ArrowUpTrayIcon className="h-8 w-8 text-white" />
                </div>
                <p className="text-lg font-medium text-blue-600">Solte o arquivo aqui</p>
              </>
            ) : (
              <>
                <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                  <DocumentIcon className="h-8 w-8 text-gray-400" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">
                    Arraste e solte o arquivo SPED aqui
                  </p>
                  <p className="text-xs text-gray-500">ou</p>
                  <label className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 cursor-pointer transition-colors">
                    <ArrowUpTrayIcon className="h-4 w-4 mr-2" />
                    Selecionar arquivo
                    <input
                      ref={spedInputRef}
                      type="file"
                      accept=".txt,.sped"
                      onChange={handleSpedFileChange}
                      className="sr-only"
                      disabled={isLoading}
                    />
                  </label>
                </div>
                <p className="text-xs text-gray-400 mt-2">Formato: .txt ou .sped</p>
              </>
            )}
            {spedFile && !isDraggingSped && (
              <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircleIcon className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-green-800">{spedFile.name}</span>
                <button
                  type="button"
                  onClick={removeSpedFile}
                  className="ml-2 text-red-600 hover:text-red-800"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload XML */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Arquivos XML (NF-e/CT-e) *
        </label>
        <div
          ref={xmlDropZoneRef}
          onDragOver={handleXmlDragOver}
          onDragLeave={handleXmlDragLeave}
          onDrop={handleXmlDrop}
          className={`relative transition-all duration-200 ${
            isDraggingXml
              ? 'border-blue-500 bg-blue-50 scale-[1.02] shadow-lg'
              : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          } border-2 border-dashed rounded-lg p-8 min-h-[200px] flex flex-col items-center justify-center`}
        >
          <div className="text-center space-y-4 w-full">
            {isDraggingXml ? (
              <>
                <div className="mx-auto w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center">
                  <ArrowUpTrayIcon className="h-8 w-8 text-white" />
                </div>
                <p className="text-lg font-medium text-blue-600">Solte os arquivos aqui</p>
              </>
            ) : (
              <>
                <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                  <DocumentIcon className="h-8 w-8 text-gray-400" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">
                    Arraste e solte os arquivos XML aqui
                  </p>
                  <p className="text-xs text-gray-500">ou</p>
                  <label className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 cursor-pointer transition-colors">
                    <ArrowUpTrayIcon className="h-4 w-4 mr-2" />
                    Selecionar arquivos
                    <input
                      ref={xmlInputRef}
                      type="file"
                      accept=".xml"
                      multiple
                      onChange={handleXmlFilesChange}
                      className="sr-only"
                      disabled={isLoading}
                    />
                  </label>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Formato: .xml (múltiplos arquivos permitidos)
                </p>
              </>
            )}
            {xmlFiles.length > 0 && !isDraggingXml && (
              <div className="mt-4 w-full max-h-48 overflow-y-auto space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    {xmlFiles.length.toLocaleString('pt-BR')} arquivo(s) selecionado(s)
                  </span>
                  {xmlFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setXmlFiles([]);
                        setPreCheckResult(null);
                        setUploadError(null);
                        onFilesSelected(spedFile, []);
                        console.log('[Step2FileUpload] 🗑️ Todos os XMLs foram removidos');
                      }}
                      className="px-3 py-1 text-xs font-medium text-red-600 hover:text-white hover:bg-red-600 border border-red-600 rounded-md transition-colors"
                    >
                      🗑️ Limpar todos
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {xmlFiles.slice(0, 10).map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                      <span className="text-sm text-gray-700 truncate flex-1">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeXmlFile(index)}
                        className="ml-2 text-red-600 hover:text-red-800"
                      >
                        <XMarkIcon className="h-4 w-4" />
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
      </div>

      {/* Resultado do Pré-Check */}
      {isPreChecking && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <span className="text-sm font-medium text-blue-800">Executando pré-check...</span>
          </div>
        </div>
      )}

      {preCheckResult && !isPreChecking && (
        <div className={`border rounded-lg p-4 ${
          preCheckResult.isValid
            ? 'bg-green-50 border-green-200'
            : 'bg-yellow-50 border-yellow-200'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            {preCheckResult.isValid ? (
              <CheckCircleIcon className="h-5 w-5 text-green-600" />
            ) : (
              <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />
            )}
            <h4 className="font-semibold text-gray-900">
              Resultado do Pré-Check
            </h4>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <div className="text-2xl font-bold text-gray-900">{preCheckResult.xmlCount}</div>
              <div className="text-xs text-gray-600">Total XMLs</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{preCheckResult.xmlValid}</div>
              <div className="text-xs text-gray-600">XMLs Válidos</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">{preCheckResult.nfeKeys.length}</div>
              <div className="text-xs text-gray-600">Chaves NF-e</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">{preCheckResult.spedRecords}</div>
              <div className="text-xs text-gray-600">Registros SPED</div>
            </div>
          </div>

          {preCheckResult.competencias.length > 0 && (
            <div className="mb-3">
              <div className="text-sm font-medium text-gray-700 mb-1">Competências:</div>
              <div className="flex flex-wrap gap-2">
                {preCheckResult.competencias.map((comp, idx) => (
                  <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                    {comp}
                  </span>
                ))}
              </div>
            </div>
          )}

          {preCheckResult.xmlErrors.length > 0 && (
            <div className="mb-3">
              <div className="text-sm font-medium text-red-700 mb-1">Erros encontrados:</div>
              <ul className="list-disc list-inside text-xs text-red-600 space-y-1">
                {preCheckResult.xmlErrors.slice(0, 5).map((error, idx) => (
                  <li key={idx}>{error}</li>
                ))}
                {preCheckResult.xmlErrors.length > 5 && (
                  <li>... e mais {preCheckResult.xmlErrors.length - 5} erro(s)</li>
                )}
              </ul>
            </div>
          )}

          {preCheckResult.nfeDuplicates.length > 0 && (
            <div className="mb-3">
              <div className="text-sm font-medium text-orange-700 mb-1">
                Chaves NF-e duplicadas ({preCheckResult.nfeDuplicates.length}):
              </div>
              <div className="text-xs text-orange-600 space-y-1">
                {preCheckResult.nfeDuplicates.slice(0, 3).map((key, idx) => (
                  <div key={idx} className="font-mono">{key}</div>
                ))}
                {preCheckResult.nfeDuplicates.length > 3 && (
                  <div>... e mais {preCheckResult.nfeDuplicates.length - 3} chave(s)</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Botão Próxima (aparece quando tiver SPED e XMLs) */}
      {spedFile && xmlFiles.length > 0 && onNext && (
        <div className="flex justify-end pt-6 border-t border-gray-200 mt-6">
          <button
            type="button"
            onClick={onNext}
            disabled={isPreChecking || isLoading}
            className="inline-flex items-center px-8 py-4 text-lg font-semibold rounded-xl shadow-lg text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105"
          >
            {isPreChecking || isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processando...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 mr-2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
                Próxima
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default Step2FileUpload;

