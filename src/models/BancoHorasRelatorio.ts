/**
 * Modelo BancoHorasRelatorio - Representa relatórios de banco de horas gerados
 */

import { DatabaseService } from '../services/DatabaseService';
import { ApiResponse } from '../types';

export interface BancoHorasRelatorio {
  id?: string;
  cnpj: string;
  razaoSocial?: string;
  dataInicial: string;
  dataFinal: string;
  arquivoPath: string;
  nomeArquivo: string;
  tamanhoArquivo?: number;
  arquivoFormatadoPath?: string;  // Caminho do arquivo formatado
  arquivoFormatadoNome?: string;  // Nome do arquivo formatado
  status: 'gerando' | 'concluido' | 'erro';
  erro?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class BancoHorasRelatorioModel extends DatabaseService<BancoHorasRelatorio> {
  constructor() {
    super('banco_horas_relatorios');
    // Tentar criar a tabela se não existir (apenas em desenvolvimento)
    if (process.env['NODE_ENV'] !== 'production') {
      this.ensureTableExists().catch(err => {
        console.warn('Aviso: Não foi possível verificar/criar tabela banco_horas_relatorios:', err.message);
      });
    }
  }

  /**
   * Garantir que a tabela existe (criar se não existir)
   */
  private async ensureTableExists(): Promise<void> {
    try {
      const { executeQuery } = await import('../config/mysql');
      // Verificar se a tabela existe
      const checkTable = `SELECT COUNT(*) as count FROM information_schema.tables 
        WHERE table_schema = DATABASE() AND table_name = 'banco_horas_relatorios'`;
      const result = await executeQuery<any>(checkTable);
      
      if (result.length === 0 || result[0].count === 0) {
        console.log('Criando tabela banco_horas_relatorios...');
        const createTableSQL = `
          CREATE TABLE IF NOT EXISTS banco_horas_relatorios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            cnpj VARCHAR(18) NOT NULL COMMENT 'CNPJ da empresa (apenas números)',
            razao_social VARCHAR(255) NULL COMMENT 'Razão social da empresa',
            data_inicial DATE NOT NULL COMMENT 'Data inicial do período',
            data_final DATE NOT NULL COMMENT 'Data final do período',
            arquivo_path VARCHAR(500) NOT NULL DEFAULT '' COMMENT 'Caminho completo do arquivo gerado',
            nome_arquivo VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'Nome do arquivo gerado',
            tamanho_arquivo BIGINT NULL COMMENT 'Tamanho do arquivo em bytes',
            status ENUM('gerando', 'concluido', 'erro') NOT NULL DEFAULT 'gerando' COMMENT 'Status da geração',
            erro TEXT NULL COMMENT 'Mensagem de erro (se houver)',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Data de criação do registro',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Data de atualização',
            INDEX idx_banco_horas_cnpj (cnpj),
            INDEX idx_banco_horas_status (status),
            INDEX idx_banco_horas_created_at (created_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          COMMENT='Histórico de relatórios de banco de horas gerados'
        `;
        await executeQuery(createTableSQL);
        console.log('✅ Tabela banco_horas_relatorios criada com sucesso!');
      }
    } catch (error) {
      // Ignorar erros silenciosamente - a tabela pode já existir ou não ter permissão
      console.warn('Não foi possível criar/verificar tabela:', (error as Error).message);
    }
  }

  /**
   * Mapear dados do banco (snake_case) para o modelo (camelCase)
   */
  private mapFromDb(row: any): BancoHorasRelatorio {
    return {
      id: row.id?.toString(),
      cnpj: row.cnpj,
      razaoSocial: row.razao_social,
      dataInicial: row.data_inicial,
      dataFinal: row.data_final,
      arquivoPath: row.arquivo_path || '',
      nomeArquivo: row.nome_arquivo || '',
      tamanhoArquivo: row.tamanho_arquivo,
      arquivoFormatadoPath: row.arquivo_formatado_path || undefined,
      arquivoFormatadoNome: row.arquivo_formatado_nome || undefined,
      status: row.status,
      erro: row.erro,
      createdAt: row.created_at ? new Date(row.created_at) : new Date(),
      updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
    };
  }

  /**
   * Buscar todos os relatórios ordenados por data de criação (mais recente primeiro)
   */
  async findAll(): Promise<ApiResponse<BancoHorasRelatorio[]>> {
    try {
      // Se não tiver banco configurado, usar armazenamento em memória
      if (!process.env['SUPABASE_URL'] && !process.env['MYSQL_HOST']) {
        return this.getInMemoryData();
      }

      const result = await super.findAll();
      if (result.success && result.data) {
        // Mapear campos snake_case para camelCase
        const mappedData: BancoHorasRelatorio[] = (result.data as any[]).map(row => this.mapFromDb(row));
        
        // Ordenar por data de criação (mais recente primeiro)
        mappedData.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
        
        return { success: true, data: mappedData };
      }
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Buscar registro por ID
   */
  async findById(id: string | number): Promise<ApiResponse<BancoHorasRelatorio>> {
    try {
      // Se não tiver banco configurado, usar armazenamento em memória
      if (!process.env['SUPABASE_URL'] && !process.env['MYSQL_HOST']) {
        const inMemory = this.getInMemoryData();
        if (inMemory.success && inMemory.data) {
          const found = inMemory.data.find(r => r.id === id.toString());
          if (found) {
            return { success: true, data: found };
          }
          return { success: false, error: 'Registro não encontrado' };
        }
      }

      const result = await super.findById(id);
      if (result.success && result.data) {
        return { success: true, data: this.mapFromDb(result.data as any) };
      }
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Buscar relatórios por CNPJ
   */
  async findByCnpj(cnpj: string): Promise<ApiResponse<BancoHorasRelatorio[]>> {
    try {
      if (!process.env['SUPABASE_URL'] && !process.env['MYSQL_HOST']) {
        const inMemory = this.getInMemoryData();
        if (inMemory.success && inMemory.data) {
          const filtered = inMemory.data.filter(r => r.cnpj === cnpj);
          return { success: true, data: filtered };
        }
      }

      return this.findBy({ cnpj });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Criar novo registro de relatório
   */
  async createRelatorio(data: Omit<BancoHorasRelatorio, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<BancoHorasRelatorio>> {
    try {
      const relatorio: BancoHorasRelatorio = {
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (!process.env['SUPABASE_URL'] && !process.env['MYSQL_HOST']) {
        return this.saveInMemory(relatorio);
      }

      // Mapear campos camelCase para snake_case do MySQL
      const dbRecord: any = {
        cnpj: relatorio.cnpj,
        razao_social: relatorio.razaoSocial || null,
        data_inicial: relatorio.dataInicial,
        data_final: relatorio.dataFinal,
        arquivo_path: relatorio.arquivoPath,
        nome_arquivo: relatorio.nomeArquivo,
        tamanho_arquivo: relatorio.tamanhoArquivo || null,
        status: relatorio.status,
        erro: relatorio.erro || null,
      };

      const result = await this.create(dbRecord);
      
      if (result.success && result.data) {
        // Mapear de volta para camelCase
        return { success: true, data: this.mapFromDb(result.data as any) };
      }
      
      return result as ApiResponse<BancoHorasRelatorio>;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Atualizar status do relatório
   */
  async updateStatus(id: string, status: BancoHorasRelatorio['status'], erro?: string): Promise<ApiResponse<BancoHorasRelatorio>> {
    try {
      if (!process.env['SUPABASE_URL'] && !process.env['MYSQL_HOST']) {
        const updates: Partial<BancoHorasRelatorio> = {
          status,
          updatedAt: new Date(),
        };
        if (erro) {
          updates.erro = erro;
        }
        return this.updateInMemory(id, updates);
      }

      // Mapear campos camelCase para snake_case do MySQL
      const dbUpdates: any = {
        status,
      };

      if (erro) {
        dbUpdates.erro = erro;
      }

      const result = await this.update(id, dbUpdates);
      
      if (result.success && result.data) {
        // Mapear de volta para camelCase
        return { success: true, data: this.mapFromDb(result.data as any) };
      }
      
      return result as ApiResponse<BancoHorasRelatorio>;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Deletar registro (override para suportar memória)
   */
  async delete(id: string | number): Promise<ApiResponse<boolean>> {
    try {
      if (!process.env['SUPABASE_URL'] && !process.env['MYSQL_HOST']) {
        const index = this.inMemoryData.findIndex(r => r.id === id.toString());
        if (index === -1) {
          return { success: false, error: 'Relatório não encontrado' };
        }
        this.inMemoryData.splice(index, 1);
        return { success: true, data: true };
      }

      return await super.delete(id);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Atualizar registro (override para mapear campos)
   */
  async update(id: string | number, updates: Partial<BancoHorasRelatorio>): Promise<ApiResponse<BancoHorasRelatorio>> {
    try {
      if (!process.env['SUPABASE_URL'] && !process.env['MYSQL_HOST']) {
        return this.updateInMemory(id.toString(), updates);
      }

      // Mapear campos camelCase para snake_case do MySQL
      const dbUpdates: any = {};
      if (updates.cnpj !== undefined) dbUpdates.cnpj = updates.cnpj;
      if (updates.razaoSocial !== undefined) dbUpdates.razao_social = updates.razaoSocial;
      if (updates.dataInicial !== undefined) dbUpdates.data_inicial = updates.dataInicial;
      if (updates.dataFinal !== undefined) dbUpdates.data_final = updates.dataFinal;
      if (updates.arquivoPath !== undefined) dbUpdates.arquivo_path = updates.arquivoPath;
      if (updates.nomeArquivo !== undefined) dbUpdates.nome_arquivo = updates.nomeArquivo;
      if (updates.tamanhoArquivo !== undefined) dbUpdates.tamanho_arquivo = updates.tamanhoArquivo;
      if (updates.arquivoFormatadoPath !== undefined) dbUpdates.arquivo_formatado_path = updates.arquivoFormatadoPath;
      if (updates.arquivoFormatadoNome !== undefined) dbUpdates.arquivo_formatado_nome = updates.arquivoFormatadoNome;
      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.erro !== undefined) dbUpdates.erro = updates.erro;

      const result = await super.update(id, dbUpdates);
      
      if (result.success && result.data) {
        return { success: true, data: this.mapFromDb(result.data as any) };
      }
      
      return result as ApiResponse<BancoHorasRelatorio>;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  // Armazenamento em memória (fallback quando não há banco configurado)
  private inMemoryData: BancoHorasRelatorio[] = [];

  private getInMemoryData(): ApiResponse<BancoHorasRelatorio[]> {
    return {
      success: true,
      data: [...this.inMemoryData].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      }),
    };
  }

  private saveInMemory(relatorio: BancoHorasRelatorio): ApiResponse<BancoHorasRelatorio> {
    const id = Date.now().toString();
    const relatorioComId = { ...relatorio, id };
    this.inMemoryData.push(relatorioComId);
    return {
      success: true,
      data: relatorioComId,
    };
  }

  private updateInMemory(id: string, updates: Partial<BancoHorasRelatorio>): ApiResponse<BancoHorasRelatorio> {
    const index = this.inMemoryData.findIndex(r => r.id === id);
    if (index === -1) {
      return {
        success: false,
        error: 'Relatório não encontrado',
      };
    }

    this.inMemoryData[index] = {
      ...this.inMemoryData[index],
      ...updates,
      updatedAt: new Date(),
    };

    return {
      success: true,
      data: this.inMemoryData[index],
    };
  }
}

