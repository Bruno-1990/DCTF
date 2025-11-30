/**
 * SERVIÇO: Extração e Armazenamento de Dados Estruturados do SITF
 * 
 * Extrai dados estruturados do JSON retornado pela API do SITF
 * e salva na tabela sitf_extracted_data para consultas rápidas
 */

import { randomUUID } from 'crypto';
import { executeQuery } from '../config/mysql';

/**
 * Converte uma data do formato brasileiro (DD/MM/YYYY) ou ISO para formato MySQL (YYYY-MM-DD)
 * Aceita também formatos ISO e outros formatos comuns
 */
function normalizeDate(dateStr: string | null | undefined): string | null {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }
  
  const trimmed = dateStr.trim();
  if (!trimmed) {
    return null;
  }
  
  // Se já está no formato ISO (YYYY-MM-DD), retornar como está
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  
  // Se está no formato brasileiro (DD/MM/YYYY)
  const brazilianFormat = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (brazilianFormat) {
    const [, day, month, year] = brazilianFormat;
    const normalized = `${year}-${month}-${day}`;
    console.log('[Sitf Data Extractor] 📅 Data normalizada:', trimmed, '→', normalized);
    return normalized;
  }
  
  // Tentar parsear como Date e converter para ISO
  try {
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      const normalized = date.toISOString().split('T')[0]; // YYYY-MM-DD
      console.log('[Sitf Data Extractor] 📅 Data parseada e normalizada:', trimmed, '→', normalized);
      return normalized;
    }
  } catch (e) {
    // Ignorar erro
  }
  
  // Se não conseguiu converter, retornar null
  console.warn('[Sitf Data Extractor] ⚠️ Data em formato não reconhecido:', trimmed);
  return null;
}

/**
 * Trunca uma string para o tamanho máximo especificado
 * Se truncar, adiciona "..." no final para indicar que foi truncado
 */
function truncateString(str: string | null | undefined, maxLength: number): string | null {
  if (!str || typeof str !== 'string') {
    return null;
  }
  
  const trimmed = str.trim();
  if (!trimmed) {
    return null;
  }
  
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  
  // Truncar e adicionar "..." se necessário
  const truncated = trimmed.substring(0, maxLength - 3) + '...';
  console.warn(`[Sitf Data Extractor] ⚠️ String truncada de ${trimmed.length} para ${maxLength} caracteres:`, truncated);
  return truncated;
}

export interface SitfExtractedData {
  fonte?: string;
  emissao_relatorio?: string;
  solicitante?: { cnpj?: string };
  empresa?: {
    razao_social?: string;
    cnpj_raiz?: string;
    cnpj?: string;
    natureza_juridica?: { codigo?: string; descricao?: string };
    data_abertura?: string;
    porte?: string;
    cnae_principal?: { codigo?: string; descricao?: string };
    situacao_cadastral?: string;
  };
  endereco?: {
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cep?: string;
    municipio?: string;
    uf?: string;
  };
  domicilio_fiscal?: {
    unidade?: string;
    codigo?: string;
  };
  responsavel?: {
    cpf?: string;
    nome?: string;
  };
  socios?: Array<{
    cpf?: string;
    nome?: string;
    qualificacao?: string;
    situacao_cadastral?: string;
    capital_votante_percentual?: number;
  }>;
  simples_nacional?: {
    data_inclusao?: string;
    data_exclusao?: string | null;
  };
  certidao_conjunta_rfb_pgfn?: {
    tipo?: string;
    numero?: string;
    data_emissao?: string;
    data_validade?: string;
    pendencias_detectadas?: boolean;
    observacao?: string;
  };
}

/**
 * Busca registro existente de dados extraídos por sitf_download_id
 */
export async function getExtractedSitfDataByDownloadId(
  sitfDownloadId: string
): Promise<any | null> {
  try {
    const query = `
      SELECT * FROM sitf_extracted_data
      WHERE sitf_download_id = ?
      LIMIT 1
    `;
    
    const results = await executeQuery<any[]>(query, [sitfDownloadId]);
    
    if (results && results.length > 0) {
      const data: any = results[0];
      
      // Parsear campos JSON
      if (data.empresa_natureza_juridica) {
        data.empresa_natureza_juridica = JSON.parse(data.empresa_natureza_juridica);
      }
      if (data.empresa_cnae_principal) {
        data.empresa_cnae_principal = JSON.parse(data.empresa_cnae_principal);
      }
      if (data.socios) {
        data.socios = JSON.parse(data.socios);
      }
      if (data.dados_completos) {
        data.dados_completos = JSON.parse(data.dados_completos);
      }
      
      return data;
    }
    
    return null;
  } catch (error: any) {
    console.error('[Sitf Data Extractor] ❌ Erro ao buscar dados estruturados:', error);
    throw error;
  }
}

/**
 * Atualiza dados estruturados existentes na tabela sitf_extracted_data
 */
export async function updateExtractedSitfData(
  sitfDownloadId: string,
  cnpj: string,
  extractedData: SitfExtractedData
): Promise<void> {
  try {
    // Normalizar CNPJ (remover formatação)
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    
    // Preparar dados para atualização
    const updateData = {
      // Dados do Relatório
      fonte: truncateString(extractedData.fonte, 255),
      emissao_relatorio: extractedData.emissao_relatorio 
        ? new Date(extractedData.emissao_relatorio).toISOString().slice(0, 19).replace('T', ' ')
        : null,
      
      // Solicitante
      solicitante_cnpj: extractedData.solicitante?.cnpj?.replace(/\D/g, '') || null,
      
      // Empresa
      empresa_razao_social: truncateString(extractedData.empresa?.razao_social, 255),
      empresa_cnpj_raiz: extractedData.empresa?.cnpj_raiz?.replace(/\D/g, '') || null,
      empresa_cnpj: extractedData.empresa?.cnpj || null,
      empresa_data_abertura: normalizeDate(extractedData.empresa?.data_abertura),
      empresa_porte: truncateString(extractedData.empresa?.porte, 100),
      empresa_situacao_cadastral: truncateString(extractedData.empresa?.situacao_cadastral, 50),
      empresa_natureza_juridica: extractedData.empresa?.natureza_juridica 
        ? JSON.stringify(extractedData.empresa.natureza_juridica) 
        : null,
      empresa_cnae_principal: extractedData.empresa?.cnae_principal 
        ? JSON.stringify(extractedData.empresa.cnae_principal) 
        : null,
      
      // Endereço
      endereco_logradouro: truncateString(extractedData.endereco?.logradouro, 255),
      endereco_numero: truncateString(extractedData.endereco?.numero, 20),
      endereco_complemento: truncateString(extractedData.endereco?.complemento, 100),
      endereco_bairro: truncateString(extractedData.endereco?.bairro, 100),
      endereco_cep: extractedData.endereco?.cep?.replace(/\D/g, '') || null,
      endereco_municipio: truncateString(extractedData.endereco?.municipio, 100),
      endereco_uf: truncateString(extractedData.endereco?.uf, 2),
      
      // Domicílio Fiscal
      domicilio_fiscal_unidade: truncateString(extractedData.domicilio_fiscal?.unidade, 100),
      domicilio_fiscal_codigo: truncateString(extractedData.domicilio_fiscal?.codigo, 20),
      
      // Responsável
      responsavel_cpf: extractedData.responsavel?.cpf?.replace(/\D/g, '') || null,
      responsavel_nome: truncateString(extractedData.responsavel?.nome, 255),
      
      // Sócios (JSON Array)
      socios: extractedData.socios && extractedData.socios.length > 0
        ? JSON.stringify(extractedData.socios)
        : null,
      
      // Simples Nacional
      simples_nacional_data_inclusao: normalizeDate(extractedData.simples_nacional?.data_inclusao),
      simples_nacional_data_exclusao: normalizeDate(extractedData.simples_nacional?.data_exclusao),
      
      // Certidão
      certidao_tipo: truncateString(extractedData.certidao_conjunta_rfb_pgfn?.tipo, 100),
      certidao_numero: truncateString(extractedData.certidao_conjunta_rfb_pgfn?.numero, 50),
      certidao_data_emissao: normalizeDate(extractedData.certidao_conjunta_rfb_pgfn?.data_emissao),
      certidao_data_validade: normalizeDate(extractedData.certidao_conjunta_rfb_pgfn?.data_validade),
      certidao_pendencias_detectadas: extractedData.certidao_conjunta_rfb_pgfn?.pendencias_detectadas === true ? 1 : 0,
      certidao_observacao: extractedData.certidao_conjunta_rfb_pgfn?.observacao || null,
      
      // Dados completos (backup)
      dados_completos: JSON.stringify(extractedData),
    };
    
    // Construir query de UPDATE
    const fields = Object.keys(updateData)
      .map(key => `\`${key}\` = ?`)
      .join(', ');
    
    const values = Object.values(updateData);
    
    const query = `
      UPDATE sitf_extracted_data
      SET ${fields}
      WHERE sitf_download_id = ?
    `;
    
    await executeQuery(query, [...values, sitfDownloadId]);
    
    console.log('[Sitf Data Extractor] ✅ Dados estruturados atualizados com sucesso:', {
      sitfDownloadId,
      cnpj: cnpjLimpo,
      razaoSocial: updateData.empresa_razao_social,
    });
  } catch (error: any) {
    console.error('[Sitf Data Extractor] ❌ Erro ao atualizar dados estruturados:', error);
    throw error;
  }
}

/**
 * Salva ou atualiza dados estruturados extraídos do PDF do SITF na tabela sitf_extracted_data
 * Se já existir um registro para o sitf_download_id, atualiza. Caso contrário, insere.
 */
export async function upsertExtractedSitfData(
  sitfDownloadId: string,
  cnpj: string,
  extractedData: SitfExtractedData
): Promise<void> {
  try {
    // Verificar se já existe registro
    const existing = await getExtractedSitfDataByDownloadId(sitfDownloadId);
    
    if (existing) {
      // Atualizar registro existente
      await updateExtractedSitfData(sitfDownloadId, cnpj, extractedData);
    } else {
      // Inserir novo registro
      await saveExtractedSitfData(sitfDownloadId, cnpj, extractedData);
    }
  } catch (error: any) {
    console.error('[Sitf Data Extractor] ❌ Erro ao fazer upsert de dados estruturados:', error);
    throw error;
  }
}

/**
 * Salva dados estruturados extraídos do PDF do SITF na tabela sitf_extracted_data
 */
export async function saveExtractedSitfData(
  sitfDownloadId: string,
  cnpj: string,
  extractedData: SitfExtractedData
): Promise<void> {
  try {
    const id = randomUUID();
    
    // Normalizar CNPJ (remover formatação)
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    
    // Preparar dados para inserção
    const insertData = {
      id,
      sitf_download_id: sitfDownloadId,
      cnpj: cnpjLimpo,
      
      // Dados do Relatório
      fonte: truncateString(extractedData.fonte, 255),
      emissao_relatorio: extractedData.emissao_relatorio 
        ? new Date(extractedData.emissao_relatorio).toISOString().slice(0, 19).replace('T', ' ')
        : null,
      
      // Solicitante
      solicitante_cnpj: extractedData.solicitante?.cnpj?.replace(/\D/g, '') || null,
      
      // Empresa
      empresa_razao_social: truncateString(extractedData.empresa?.razao_social, 255),
      empresa_cnpj_raiz: extractedData.empresa?.cnpj_raiz?.replace(/\D/g, '') || null,
      empresa_cnpj: extractedData.empresa?.cnpj || null,
      empresa_data_abertura: normalizeDate(extractedData.empresa?.data_abertura),
      empresa_porte: truncateString(extractedData.empresa?.porte, 100),
      empresa_situacao_cadastral: truncateString(extractedData.empresa?.situacao_cadastral, 50),
      empresa_natureza_juridica: extractedData.empresa?.natureza_juridica 
        ? JSON.stringify(extractedData.empresa.natureza_juridica) 
        : null,
      empresa_cnae_principal: extractedData.empresa?.cnae_principal 
        ? JSON.stringify(extractedData.empresa.cnae_principal) 
        : null,
      
      // Endereço
      endereco_logradouro: truncateString(extractedData.endereco?.logradouro, 255),
      endereco_numero: truncateString(extractedData.endereco?.numero, 20),
      endereco_complemento: truncateString(extractedData.endereco?.complemento, 100),
      endereco_bairro: truncateString(extractedData.endereco?.bairro, 100),
      endereco_cep: extractedData.endereco?.cep?.replace(/\D/g, '') || null,
      endereco_municipio: truncateString(extractedData.endereco?.municipio, 100),
      endereco_uf: truncateString(extractedData.endereco?.uf, 2),
      
      // Domicílio Fiscal
      domicilio_fiscal_unidade: truncateString(extractedData.domicilio_fiscal?.unidade, 100),
      domicilio_fiscal_codigo: truncateString(extractedData.domicilio_fiscal?.codigo, 20),
      
      // Responsável
      responsavel_cpf: extractedData.responsavel?.cpf?.replace(/\D/g, '') || null,
      responsavel_nome: truncateString(extractedData.responsavel?.nome, 255),
      
      // Sócios (JSON Array)
      socios: extractedData.socios && extractedData.socios.length > 0
        ? JSON.stringify(extractedData.socios)
        : null,
      
      // Simples Nacional
      simples_nacional_data_inclusao: normalizeDate(extractedData.simples_nacional?.data_inclusao),
      simples_nacional_data_exclusao: normalizeDate(extractedData.simples_nacional?.data_exclusao),
      
      // Certidão
      certidao_tipo: truncateString(extractedData.certidao_conjunta_rfb_pgfn?.tipo, 100),
      certidao_numero: truncateString(extractedData.certidao_conjunta_rfb_pgfn?.numero, 50),
      certidao_data_emissao: normalizeDate(extractedData.certidao_conjunta_rfb_pgfn?.data_emissao),
      certidao_data_validade: normalizeDate(extractedData.certidao_conjunta_rfb_pgfn?.data_validade),
      certidao_pendencias_detectadas: extractedData.certidao_conjunta_rfb_pgfn?.pendencias_detectadas === true ? 1 : 0,
      certidao_observacao: extractedData.certidao_conjunta_rfb_pgfn?.observacao || null,
      
      // Dados completos (backup)
      dados_completos: JSON.stringify(extractedData),
    };
    
    // Preparar array de valores na mesma ordem das colunas
    const values = [
      insertData.id,
      insertData.sitf_download_id,
      insertData.cnpj,
      insertData.fonte,
      insertData.emissao_relatorio,
      insertData.solicitante_cnpj,
      insertData.empresa_razao_social,
      insertData.empresa_cnpj_raiz,
      insertData.empresa_cnpj,
      insertData.empresa_data_abertura,
      insertData.empresa_porte,
      insertData.empresa_situacao_cadastral,
      insertData.empresa_natureza_juridica,
      insertData.empresa_cnae_principal,
      insertData.endereco_logradouro,
      insertData.endereco_numero,
      insertData.endereco_complemento,
      insertData.endereco_bairro,
      insertData.endereco_cep,
      insertData.endereco_municipio,
      insertData.endereco_uf,
      insertData.domicilio_fiscal_unidade,
      insertData.domicilio_fiscal_codigo,
      insertData.responsavel_cpf,
      insertData.responsavel_nome,
      insertData.socios,
      insertData.simples_nacional_data_inclusao,
      insertData.simples_nacional_data_exclusao,
      insertData.certidao_tipo,
      insertData.certidao_numero,
      insertData.certidao_data_emissao,
      insertData.certidao_data_validade,
      insertData.certidao_pendencias_detectadas,
      insertData.certidao_observacao,
      insertData.dados_completos,
    ];
    
    // Validar que temos exatamente 35 valores
    if (values.length !== 35) {
      throw new Error(`Número incorreto de valores: esperado 35, encontrado ${values.length}`);
    }
    
    // Inserir no banco
    const query = `
      INSERT INTO sitf_extracted_data (
        id, sitf_download_id, cnpj,
        fonte, emissao_relatorio,
        solicitante_cnpj,
        empresa_razao_social, empresa_cnpj_raiz, empresa_cnpj,
        empresa_data_abertura, empresa_porte, empresa_situacao_cadastral,
        empresa_natureza_juridica, empresa_cnae_principal,
        endereco_logradouro, endereco_numero, endereco_complemento,
        endereco_bairro, endereco_cep, endereco_municipio, endereco_uf,
        domicilio_fiscal_unidade, domicilio_fiscal_codigo,
        responsavel_cpf, responsavel_nome,
        socios,
        simples_nacional_data_inclusao, simples_nacional_data_exclusao,
        certidao_tipo, certidao_numero, certidao_data_emissao,
        certidao_data_validade, certidao_pendencias_detectadas, certidao_observacao,
        dados_completos
      ) VALUES (
        ?, ?, ?,
        ?, ?,
        ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?,
        ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?
      )
    `;
    
    // Validar que temos exatamente 35 placeholders
    const placeholderCount = (query.match(/\?/g) || []).length;
    if (placeholderCount !== 35) {
      throw new Error(`Número incorreto de placeholders: esperado 35, encontrado ${placeholderCount}`);
    }
    
    console.log('[Sitf Data Extractor] Executando INSERT com', values.length, 'valores');
    await executeQuery(query, values);
    
    console.log('[Sitf Data Extractor] ✅ Dados estruturados salvos com sucesso:', {
      id,
      sitfDownloadId,
      cnpj: cnpjLimpo,
      razaoSocial: insertData.empresa_razao_social,
    });
  } catch (error: any) {
    console.error('[Sitf Data Extractor] ❌ Erro ao salvar dados estruturados:', error);
    throw error;
  }
}


/**
 * Busca dados estruturados por CNPJ (último registro)
 */
export async function getLatestExtractedSitfDataByCnpj(
  cnpj: string
): Promise<any | null> {
  try {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    
    const query = `
      SELECT * FROM sitf_extracted_data
      WHERE cnpj = ?
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    const results = await executeQuery<any[]>(query, [cnpjLimpo]);
    
    if (results && results.length > 0) {
      const data: any = results[0];
      
      // Parsear campos JSON
      if (data.empresa_natureza_juridica) {
        data.empresa_natureza_juridica = JSON.parse(data.empresa_natureza_juridica);
      }
      if (data.empresa_cnae_principal) {
        data.empresa_cnae_principal = JSON.parse(data.empresa_cnae_principal);
      }
      if (data.socios) {
        data.socios = JSON.parse(data.socios);
      }
      if (data.dados_completos) {
        data.dados_completos = JSON.parse(data.dados_completos);
      }
      
      return data;
    }
    
    return null;
  } catch (error: any) {
    console.error('[Sitf Data Extractor] ❌ Erro ao buscar dados estruturados por CNPJ:', error);
    throw error;
  }
}

