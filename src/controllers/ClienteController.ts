/**
 * Controlador para operações de Cliente
 * Gerencia as requisições HTTP relacionadas aos clientes
 */

import { Request, Response } from 'express';
import { Cliente } from '../models/Cliente';
import { ApiResponse } from '../types';
import ExcelJS from 'exceljs';

export class ClienteController {
  private clienteModel: Cliente;

  constructor() {
    this.clienteModel = new Cliente();
  }


  /**
   * Atualizar todos os clientes na ReceitaWS (execução única)
   * Atualiza cada CNPJ com intervalo de 20 segundos entre cada atualização
   */
  async atualizarTodosReceitaWS(req: Request, res: Response): Promise<void> {
    try {
      console.log('[Atualizar Todos ReceitaWS] Iniciando atualização em massa...');
      
      // Buscar todos os clientes com CNPJ
      const result = await this.clienteModel.findAll();
      
      if (!result.success || !result.data) {
        res.status(400).json({
          success: false,
          error: 'Erro ao buscar clientes',
          data: null,
        });
        return;
      }

      const clientes = result.data as any[];
      
      // Filtrar apenas clientes com CNPJ válido
      const clientesComCNPJ = clientes.filter((c: any) => {
        const cnpj = c.cnpj_limpo || c.cnpj;
        return cnpj && String(cnpj).replace(/\D/g, '').length === 14;
      });

      console.log(`[Atualizar Todos ReceitaWS] Encontrados ${clientesComCNPJ.length} clientes com CNPJ válido`);

      const resultados: Array<{
        cnpj: string;
        razao_social: string;
        sucesso: boolean;
        erro?: string;
      }> = [];

      // Processar cada cliente com intervalo de 20 segundos
      for (let i = 0; i < clientesComCNPJ.length; i++) {
        const cliente = clientesComCNPJ[i];
        const cnpj = String(cliente.cnpj_limpo || cliente.cnpj).replace(/\D/g, '');
        const razaoSocial = cliente.razao_social || cliente.nome || 'N/A';

        console.log(`[Atualizar Todos ReceitaWS] Processando ${i + 1}/${clientesComCNPJ.length}: ${razaoSocial} (${cnpj})`);

        try {
          // Importar dados da ReceitaWS com overwrite
          const importResult = await this.clienteModel.importarReceitaWS(cnpj, { overwrite: true });
          
          if (importResult.success) {
            resultados.push({
              cnpj,
              razao_social: razaoSocial,
              sucesso: true,
            });
            console.log(`[Atualizar Todos ReceitaWS] ✓ Sucesso para ${razaoSocial}`);
          } else {
            resultados.push({
              cnpj,
              razao_social: razaoSocial,
              sucesso: false,
              erro: importResult.error || 'Erro desconhecido',
            });
            console.log(`[Atualizar Todos ReceitaWS] ✗ Erro para ${razaoSocial}: ${importResult.error}`);
          }
        } catch (error: any) {
          resultados.push({
            cnpj,
            razao_social: razaoSocial,
            sucesso: false,
            erro: error.message || 'Erro ao processar',
          });
          console.error(`[Atualizar Todos ReceitaWS] ✗ Exceção para ${razaoSocial}:`, error);
        }

        // Aguardar 20 segundos antes do próximo (exceto no último)
        if (i < clientesComCNPJ.length - 1) {
          console.log(`[Atualizar Todos ReceitaWS] Aguardando 20 segundos antes do próximo...`);
          await new Promise(resolve => setTimeout(resolve, 20000));
        }
      }

      const sucessos = resultados.filter(r => r.sucesso).length;
      const erros = resultados.filter(r => !r.sucesso).length;

      console.log(`[Atualizar Todos ReceitaWS] Concluído: ${sucessos} sucessos, ${erros} erros`);

      res.json({
        success: true,
        data: {
          total: clientesComCNPJ.length,
          sucessos,
          erros,
          resultados,
        },
        message: `Atualização concluída: ${sucessos} sucessos, ${erros} erros`,
      });
    } catch (error: any) {
      console.error('[Atualizar Todos ReceitaWS] Erro geral:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao atualizar clientes na ReceitaWS',
        data: null,
      });
    }
  }

  /**
   * Listar todos os clientes
   */
  async listarClientes(req: Request, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 10, search, nome, cnpj, socio } = req.query;

      let result: ApiResponse<any> = await this.clienteModel.findAll();

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      let data = result.data || [];

      // Filtros (compatível com 'search' legado e novos 'nome'/'cnpj')
      // Se 'search' for fornecido, busca tanto em razão social quanto em CNPJ
      if (search && typeof search === 'string' && search.trim()) {
        const searchTerm = search.trim();
        const searchDigits = searchTerm.replace(/\D/g, '');
        const searchLower = searchTerm.toLowerCase();
        
        data = data.filter((c: any) => {
          // Buscar por razão social (case-insensitive)
          const razaoSocial = (c.razao_social || c.nome || '').toLowerCase();
          const matchRazaoSocial = razaoSocial.includes(searchLower);
          
          // Buscar por CNPJ (apenas dígitos)
          const cnpjLimpo = String(c.cnpj_limpo || '').replace(/\D/g, '');
          const matchCNPJ = searchDigits && cnpjLimpo.includes(searchDigits);
          
          return matchRazaoSocial || matchCNPJ;
        });
      } else {
        // Filtros específicos (mantidos para compatibilidade)
        const q = (nome as string) || '';
        if (q) {
          const qLower = q.toLowerCase();
          data = data.filter((c: any) => 
            (c.razao_social || c.nome || '').toLowerCase().includes(qLower)
          );
        }

        if (cnpj) {
          const cnpjStr = String(cnpj).replace(/\D/g, '');
          data = data.filter((c: any) => 
            String(c.cnpj_limpo || '').replace(/\D/g, '').includes(cnpjStr)
          );
        }
      }

      // Filtro por sócio (nome exato vindo do select box)
      let participacoesSocio: Record<string, number | null> = {};
      if (socio && typeof socio === 'string' && socio.trim()) {
        const socioNome = socio.trim();
        const idsResp = await this.clienteModel.buscarClienteIdsPorSocioNome(socioNome);
        if (idsResp.success) {
          const ids = new Set(idsResp.data || []);
          data = data.filter((c: any) => ids.has(String(c.id)));
          
          // Buscar porcentagem de participação do sócio em cada cliente
          const participacoesResp = await this.clienteModel.buscarParticipacaoSocioPorNome(socioNome);
          if (participacoesResp.success) {
            participacoesSocio = participacoesResp.data || {};
          }
        } else {
          // Se falhar, não quebrar a listagem; apenas retornar vazio para evitar resultados incorretos
          console.warn('[ClienteController] Falha ao filtrar por sócio:', idsResp.error);
          data = [];
        }
      }

      // Paginação simples (sem contagens para performance)
      const pageNum = Number(page);
      const limitNum = Number(limit);
      const startIndex = (pageNum - 1) * limitNum;
      const endIndex = startIndex + limitNum;
      let paginatedData = data.slice(startIndex, endIndex);

      // Enriquecimento LEVE: apenas boolean `hasPayments` por página (1 query IN)
      // Não retornamos contagens para manter performance.
      try {
        if (process.env['SUPABASE_URL']) {
          const { supabase: supabaseClient } = this.clienteModel as any;
          const cnpjsPagina: string[] = paginatedData
            .map((c: any) => {
              const bruto = String(c.cnpj_limpo || c.cnpj || '');
              return bruto.replace(/\D/g, '');
            })
            .filter((v: string) => v.length === 14);

          if (cnpjsPagina.length > 0) {
            // Consulta individual por CNPJ para evitar falsos negativos
            // (IN pode falhar em edge cases de formatação/tipagem)
            const resultados: Record<string, boolean> = {};
            for (const cnpj of cnpjsPagina) {
              try {
                const { count, error } = await supabaseClient
                  .from('receita_pagamentos')
                  .select('*', { head: true, count: 'exact' })
                  .eq('cnpj_contribuinte', cnpj)
                  .limit(1);
                if (!error) {
                  resultados[cnpj] = (count || 0) > 0;
                } else {
                  resultados[cnpj] = false;
                }
              } catch {
                resultados[cnpj] = false;
              }
            }

            paginatedData = paginatedData.map((c: any) => {
              const cnpjLimpo = String(c.cnpj_limpo || c.cnpj || '').replace(/\D/g, '');
              const has = cnpjLimpo.length === 14 ? Boolean(resultados[cnpjLimpo]) : false;
              return { ...c, hasPayments: has };
            });
          }
        }
      } catch (enrichErr) {
        // Silencioso para não impactar UX
        console.warn('[ClienteController] Enriquecimento leve (hasPayments) falhou:', enrichErr);
      }

      // Enriquecer cada cliente com participacao_percentual se houver filtro por sócio
      if (Object.keys(participacoesSocio).length > 0) {
        paginatedData = paginatedData.map((c: any) => {
          const participacao = participacoesSocio[String(c.id)];
          if (participacao !== undefined) {
            (c as any).socio_participacao_percentual = participacao;
          }
          return c;
        });
      }

      // Carregar sócios para cada cliente da página (para aba Participação)
      try {
        for (const cliente of paginatedData) {
          if (cliente?.id) {
            const sociosResult = await this.clienteModel.listarSocios(cliente.id);
            if (sociosResult.success) {
              (cliente as any).socios = sociosResult.data || [];
            }
          }
        }
      } catch (sociosErr) {
        console.warn('[ClienteController] Erro ao carregar sócios (não crítico):', sociosErr);
      }

      res.json({
        success: true,
        data: paginatedData,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: data.length,
          totalPages: Math.ceil(data.length / limitNum),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Listar sócios distintos (para select box)
   * GET /api/clientes/socios
   */
  async listarSociosDistinct(_req: Request, res: Response): Promise<void> {
    try {
      const result = await this.clienteModel.listarSociosDistinct();
      if (!result.success) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Obter cliente por ID
   */
  async obterCliente(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID do cliente é obrigatório',
        });
        return;
      }

      const result = await this.clienteModel.findById(id);

      if (!result.success) {
        res.status(404).json(result);
        return;
      }

      // Incluir sócios (QSA), quando disponível
      try {
        const cliente = result.data as any;
        if (cliente?.id) {
          const socios = await this.clienteModel.listarSocios(cliente.id);
          if (socios.success) {
            (cliente as any).socios = socios.data || [];
          }
        }
      } catch {}

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Criar novo cliente
   */
  async criarCliente(req: Request, res: Response): Promise<void> {
    try {
      const clienteData = req.body;

      const result = await this.clienteModel.createCliente(clienteData);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Atualizar cliente
   */
  async atualizarCliente(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID do cliente é obrigatório',
        });
        return;
      }

      const result = await this.clienteModel.updateCliente(id, updates);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Deletar cliente
   */
  async deletarCliente(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID do cliente é obrigatório',
        });
        return;
      }

      const result = await this.clienteModel.delete(id);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json({
        success: true,
        message: 'Cliente deletado com sucesso',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Importar clientes em lote via JSON
   * Body esperado: { clientes: [{ nome: string, cnpj: string, email?, telefone?, endereco? }, ...] }
   * Verifica duplicatas por CNPJ e processa apenas os registros que ainda não existem
   */
  async importarClientesJson(req: Request, res: Response): Promise<void> {
    try {
      const { clientes } = req.body as any;
      if (!Array.isArray(clientes) || clientes.length === 0) {
        res.status(400).json({ success: false, error: 'Campo "clientes" é obrigatório e deve ser um array não-vazio' });
        return;
      }

      // Normalizar CNPJ e preparar dados
      const clientesNormalizados = clientes.map((item: any) => {
        const cnpjLimpo = (item.cnpj_limpo || item.cnpj || '').replace(/\D/g, '');
        return {
          ...item,
          cnpj_limpo: cnpjLimpo,
          razao_social: item.razao_social || item.nome || '',
        };
      }).filter((item: any) => item.cnpj_limpo && item.cnpj_limpo.length === 14);

      if (clientesNormalizados.length === 0) {
        res.status(400).json({ success: false, error: 'Nenhum cliente válido encontrado. Verifique os CNPJs.' });
        return;
      }

      // Buscar todos os CNPJs existentes
      const cnpjsParaVerificar = clientesNormalizados.map((c: any) => c.cnpj_limpo);
      const clientesExistentes = new Set<string>();
      
      // Verificar quais CNPJs já existem
      for (const cnpj of cnpjsParaVerificar) {
        const result = await this.clienteModel.findByCNPJ(cnpj);
        if (result.success && result.data) {
          clientesExistentes.add(cnpj);
        }
      }

      // Filtrar apenas os clientes que não existem
      const clientesNovos = clientesNormalizados.filter((c: any) => !clientesExistentes.has(c.cnpj_limpo));
      const totalExistentes = clientesExistentes.size;
      const totalNovos = clientesNovos.length;

      const resultados: { 
        ok: number; 
        fail: number; 
        erros: string[];
        totalProcessados: number;
        jaExistentes: number;
        criados: number;
      } = { 
        ok: 0, 
        fail: 0, 
        erros: [],
        totalProcessados: clientesNormalizados.length,
        jaExistentes: totalExistentes,
        criados: 0,
      };

      // Criar apenas os clientes novos
      for (const item of clientesNovos) {
        try {
          const resp = await this.clienteModel.createCliente(item);
          if (resp.success) {
            resultados.ok += 1;
            resultados.criados += 1;
          } else {
            resultados.fail += 1;
            if (resp.error) resultados.erros.push(`CNPJ ${item.cnpj_limpo}: ${resp.error}`);
          }
        } catch (e: any) {
          resultados.fail += 1;
          resultados.erros.push(`CNPJ ${item.cnpj_limpo || 'desconhecido'}: ${e?.message || 'Erro desconhecido'}`);
        }
      }

      res.json({ 
        success: resultados.fail === 0, 
        data: resultados,
        message: `Processados: ${resultados.totalProcessados} | Já existentes: ${resultados.jaExistentes} | Criados: ${resultados.criados} | Falhas: ${resultados.fail}`
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' });
    }
  }

  /**
   * Upload e processamento de planilha de clientes
   * Verifica duplicatas por CNPJ e processa apenas os registros que ainda não existem
   */

  /**
   * Formatar CNPJ para exibição
   */
  private formatCNPJ(cnpj: string): string {
    const clean = cnpj.replace(/\D/g, '');
    return clean
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }

  /**
   * Gerar modelo de planilha para upload de clientes
   */
  async downloadModelo(req: Request, res: Response): Promise<void> {
    try {
      // Criar workbook com ExcelJS
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Clientes');

      // Definir cabeçalhos - apenas CNPJ e Razão Social
      worksheet.columns = [
        { header: 'CNPJ', key: 'cnpj', width: 20 },
        { header: 'Razão Social', key: 'razao_social', width: 50 },
      ];

      // Estilizar cabeçalho
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF538DD5' }, // Azul claro
      };
      worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
      worksheet.getRow(1).height = 22;

      // Adicionar linha de exemplo
      worksheet.addRow({
        cnpj: '12.345.678/0001-90',
        razao_social: 'Empresa Exemplo Ltda',
      });

      // Estilizar linha de exemplo (cinza claro)
      const exampleRow = worksheet.getRow(2);
      exampleRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF0F0F0' },
      };
      exampleRow.font = { italic: true, color: { argb: 'FF666666' } };

      // Configurar altura das linhas
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.height = 18;
        }
        row.alignment = { vertical: 'middle', horizontal: 'left' };
      });

      // Gerar buffer
      const buffer = await workbook.xlsx.writeBuffer();

      // Configurar headers para download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="modelo-clientes.xlsx"');
      
      // Converter ArrayBuffer para Buffer do Node.js
      const nodeBuffer = Buffer.from(buffer);
      res.setHeader('Content-Length', nodeBuffer.length);
      
      // Enviar o buffer
      res.end(nodeBuffer);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro ao gerar modelo',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Buscar cliente por CNPJ
   */
  async buscarPorCNPJ(req: Request, res: Response): Promise<void> {
    try {
      const { cnpj } = req.params;

      if (!cnpj) {
        res.status(400).json({
          success: false,
          error: 'CNPJ é obrigatório',
        });
        return;
      }

      const result = await this.clienteModel.findByCNPJ(cnpj);

      if (!result.success) {
        res.status(404).json(result);
        return;
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Consultar dados cadastrais via ReceitaWS (sem salvar)
   * GET /api/clientes/receita-ws/cnpj/:cnpj
   */
  async consultarReceitaWS(req: Request, res: Response): Promise<void> {
    try {
      const { cnpj } = req.params;
      if (!cnpj) {
        res.status(400).json({ success: false, error: 'CNPJ é obrigatório' });
        return;
      }
      const result = await this.clienteModel.consultarReceitaWS(cnpj);
      if (!result.success) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Importar dados cadastrais via ReceitaWS (salva/atualiza + sócios)
   * POST /api/clientes/import-receita-ws
   * Body: { cnpj: string, overwrite?: boolean }
   */
  async importarReceitaWS(req: Request, res: Response): Promise<void> {
    try {
      const { cnpj, overwrite } = req.body || {};
      if (!cnpj) {
        res.status(400).json({ success: false, error: 'Campo "cnpj" é obrigatório' });
        return;
      }
      const result = await this.clienteModel.importarReceitaWS(String(cnpj), { overwrite: overwrite === true });
      if (!result.success) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Obter estatísticas dos clientes
   */
  async obterEstatisticas(_req: Request, res: Response): Promise<void> {
    try {
      const result = await this.clienteModel.getStats();

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Atualizar sócios do cliente a partir da situação fiscal mais recente
   */
  /**
   * Recalcula os valores de participação dos sócios baseado no Capital Social do cliente
   * Não busca na Situação Fiscal, apenas recalcula usando as porcentagens já salvas
   */
  async recalcularValoresParticipacao(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID do cliente é obrigatório',
        });
        return;
      }

      const result = await this.clienteModel.recalcularValoresParticipacao(id);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json({
        success: true,
        data: result.data,
        message: `${result.data?.atualizados || 0} valor(es) de participação recalculado(s) com sucesso`,
      });
    } catch (error: any) {
      console.error('[ClienteController] Erro ao recalcular valores de participação:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao recalcular valores de participação',
      });
    }
  }

  async atualizarSociosPorSituacaoFiscal(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID do cliente é obrigatório',
        });
        return;
      }

      // Buscar cliente pelo ID
      const clienteResult = await this.clienteModel.findById(id);
      if (!clienteResult.success || !clienteResult.data) {
        res.status(404).json({
          success: false,
          error: 'Cliente não encontrado',
        });
        return;
      }

      const cliente = clienteResult.data;
      let cnpjLimpo = (cliente as any).cnpj_limpo;
      
      // Garantir que o CNPJ está no formato correto (apenas números, 14 dígitos)
      if (cnpjLimpo) {
        cnpjLimpo = String(cnpjLimpo).replace(/\D/g, '');
      }
      
      if (!cnpjLimpo || cnpjLimpo.length !== 14) {
        res.status(400).json({
          success: false,
          error: 'CNPJ do cliente inválido',
        });
        return;
      }

      // Buscar download mais recente da situação fiscal para este CNPJ
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        res.status(500).json({
          success: false,
          error: 'Configuração do Supabase não encontrada',
        });
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseKey);
      
      console.log('[Atualizar Sócios] Buscando situação fiscal para CNPJ:', cnpjLimpo);
      console.log('[Atualizar Sócios] Tipo do CNPJ:', typeof cnpjLimpo, 'Tamanho:', cnpjLimpo.length);
      
      // Buscar o download mais recente para este CNPJ
      // Tentar buscar com o CNPJ limpo (apenas números)
      let { data: downloads, error: downloadError } = await supabase
        .from('sitf_downloads')
        .select('id, cnpj, created_at')
        .eq('cnpj', cnpjLimpo)
        .order('created_at', { ascending: false })
        .limit(1);

      console.log('[Atualizar Sócios] Resultado da busca (CNPJ limpo):', {
        downloadsCount: downloads?.length || 0,
        error: downloadError?.message,
        downloadId: downloads?.[0]?.id,
        cnpjEncontrado: downloads?.[0]?.cnpj,
      });

      // Se não encontrou, tentar buscar todos os registros e filtrar manualmente (fallback)
      if ((!downloads || downloads.length === 0) && !downloadError) {
        console.log('[Atualizar Sócios] Tentando busca alternativa (buscar todos e filtrar)...');
        const { data: allDownloads, error: allError } = await supabase
          .from('sitf_downloads')
          .select('id, cnpj, created_at')
          .order('created_at', { ascending: false })
          .limit(100); // Limitar a 100 registros mais recentes
        
        if (!allError && allDownloads) {
          // Filtrar manualmente comparando CNPJs sem formatação
          downloads = allDownloads.filter((d: any) => {
            const cnpjStored = String(d.cnpj || '').replace(/\D/g, '');
            return cnpjStored === cnpjLimpo;
          }).slice(0, 1); // Pegar apenas o primeiro
        
          console.log('[Atualizar Sócios] Resultado da busca alternativa:', {
            downloadsCount: downloads?.length || 0,
            downloadId: downloads?.[0]?.id,
            cnpjEncontrado: downloads?.[0]?.cnpj,
          });
        }
      }

      if (downloadError) {
        console.error('[Atualizar Sócios] Erro ao buscar download:', downloadError);
        res.status(500).json({
          success: false,
          error: 'Erro ao buscar situação fiscal',
          message: downloadError.message,
        });
        return;
      }

      if (!downloads || downloads.length === 0) {
        console.warn('[Atualizar Sócios] Nenhuma situação fiscal encontrada para CNPJ:', cnpjLimpo);
        res.status(404).json({
          success: false,
          error: 'Nenhuma situação fiscal encontrada para este CNPJ. Por favor, consulte a Situação Fiscal primeiro.',
          details: 'É necessário consultar a Situação Fiscal antes de poder atualizar os sócios.',
        });
        return;
      }

      const downloadId = downloads[0].id;
      console.log('[Atualizar Sócios] Download ID encontrado:', downloadId);

      // Buscar dados extraídos no MySQL
      const { executeQuery } = await import('../config/mysql');
      
      // Primeiro, tentar buscar pelo sitf_download_id
      let extractedDataQuery = `
        SELECT socios, empresa_razao_social
        FROM sitf_extracted_data
        WHERE sitf_download_id = ?
        LIMIT 1
      `;
      
      let extractedDataResults = await executeQuery<any[]>(extractedDataQuery, [downloadId]);
      console.log('[Atualizar Sócios] Busca por sitf_download_id:', {
        downloadId,
        resultsCount: extractedDataResults?.length || 0,
      });
      
      // Se não encontrou, tentar buscar pelo CNPJ (pode ter sido inserido de outra forma)
      if (!extractedDataResults || extractedDataResults.length === 0) {
        console.log('[Atualizar Sócios] Não encontrado por download_id, tentando buscar por CNPJ...');
        extractedDataQuery = `
          SELECT socios, empresa_razao_social
          FROM sitf_extracted_data
          WHERE cnpj = ?
          ORDER BY created_at DESC
          LIMIT 1
        `;
        extractedDataResults = await executeQuery<any[]>(extractedDataQuery, [cnpjLimpo]);
        console.log('[Atualizar Sócios] Busca por CNPJ:', {
          cnpj: cnpjLimpo,
          resultsCount: extractedDataResults?.length || 0,
        });
      }
      
      if (!extractedDataResults || extractedDataResults.length === 0) {
        console.error('[Atualizar Sócios] Nenhum dado extraído encontrado no MySQL');
        res.status(404).json({
          success: false,
          error: 'Dados extraídos da situação fiscal não encontrados. A situação fiscal pode não ter sido processada ainda.',
        });
        return;
      }

      const extractedData = extractedDataResults[0];
      console.log('[Atualizar Sócios] Dados extraídos encontrados:', {
        hasSocios: !!extractedData.socios,
        sociosType: typeof extractedData.socios,
      });
      
      // Parsear sócios do JSON
      let socios: any[] = [];
      if (extractedData.socios) {
        try {
          socios = typeof extractedData.socios === 'string'
            ? JSON.parse(extractedData.socios)
            : extractedData.socios;
          
          console.log('[Atualizar Sócios] Sócios parseados:', {
            count: Array.isArray(socios) ? socios.length : 0,
            isArray: Array.isArray(socios),
            firstSocio: Array.isArray(socios) && socios.length > 0 ? socios[0] : null,
          });
        } catch (e) {
          console.error('[Atualizar Sócios] Erro ao parsear sócios:', e);
          console.error('[Atualizar Sócios] Valor de socios:', extractedData.socios);
          res.status(500).json({
            success: false,
            error: 'Erro ao processar dados dos sócios',
            details: e instanceof Error ? e.message : 'Erro desconhecido',
          });
          return;
        }
      }

      if (!Array.isArray(socios) || socios.length === 0) {
        console.warn('[Atualizar Sócios] Nenhum sócio encontrado nos dados extraídos');
        res.status(404).json({
          success: false,
          error: 'Nenhum sócio encontrado na situação fiscal',
        });
        return;
      }

      // Buscar capital social do cliente
      const capitalSocial = (cliente as any).capital_social;

      // Preparar sócios com participação
      const sociosComParticipacao = socios.map((s: any) => ({
        nome: s.nome || '',
        qual: s.qualificacao || s.qual || null,
        participacao_percentual: s.participacao_percentual !== null && s.participacao_percentual !== undefined
          ? parseFloat(String(s.participacao_percentual))
          : null,
      }));

      console.log('[Atualizar Sócios] Sócios preparados para atualização:', {
        count: sociosComParticipacao.length,
        socios: sociosComParticipacao,
        capitalSocial,
      });

      // Atualizar sócios
      const updateResult = await this.clienteModel.atualizarSociosComParticipacao(
        cliente.id!,
        sociosComParticipacao,
        capitalSocial
      );

      if (!updateResult.success) {
        console.error('[Atualizar Sócios] Erro ao atualizar sócios:', updateResult.error);
        res.status(400).json(updateResult);
        return;
      }

      console.log('[Atualizar Sócios] Sócios atualizados com sucesso');

      // Buscar sócios atualizados
      const sociosAtualizados = await this.clienteModel.listarSocios(cliente.id!);
      
      res.json({
        success: true,
        data: {
          clienteId: cliente.id,
          sociosAtualizados: sociosAtualizados.success ? sociosAtualizados.data : [],
          message: `${sociosComParticipacao.length} sócio(s) atualizado(s) com sucesso`,
        },
      });
    } catch (error) {
      console.error('[ClienteController] Erro ao atualizar sócios por situação fiscal:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Identificar clientes sem DCTF no mês vigente
   * Conforme IN RFB 2.237/2024, 2.267/2025 e 2.248/2025
   * Faz confronto direto entre tabelas clientes e dctf_declaracoes
   */
  async identificarClientesSemDCTF(req: Request, res: Response): Promise<void> {
    try {
      const { ClientesSemDCTFService } = await import('../services/ClientesSemDCTFService');
      const service = new ClientesSemDCTFService();
      
      // Permitir data customizada via query param (útil para testes)
      const dataParam = req.query.data as string;
      const today = dataParam ? new Date(dataParam) : new Date();
      
      const result = await service.identificarClientesSemDCTF(today);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json(result);
    } catch (error) {
      console.error('[ClienteController] Erro ao identificar clientes sem DCTF:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

}

