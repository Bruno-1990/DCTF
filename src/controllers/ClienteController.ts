/**
 * Controlador para operações de Cliente
 * Gerencia as requisições HTTP relacionadas aos clientes
 */

import { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { Cliente } from '../models/Cliente';
import { ApiResponse } from '../types';
import ExcelJS from 'exceljs';

const execAsync = promisify(exec);

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
      // Regra do campo de busca: até 3 números = Código SCI; acima de 3 dígitos = CNPJ; texto = Razão Social
      if (search && typeof search === 'string' && search.trim()) {
        const searchTerm = search.trim();
        const searchDigits = searchTerm.replace(/\D/g, '');
        const searchLower = searchTerm.toLowerCase();
        const soNumeros = searchTerm === searchDigits; // termo contém apenas dígitos

        data = data.filter((c: any) => {
          // Apenas números: até 3 dígitos = busca por Código SCI; mais de 3 = CNPJ
          if (soNumeros && searchDigits.length > 0) {
            if (searchDigits.length <= 3) {
              const codigoSci = String(c.codigo_sci ?? c.codigoSci ?? '').replace(/\D/g, '');
              return codigoSci === searchDigits || codigoSci.startsWith(searchDigits);
            }
            const cnpjLimpo = String(c.cnpj_limpo || '').replace(/\D/g, '');
            return cnpjLimpo.includes(searchDigits);
          }

          // Texto (ou misto): busca por razão social (case-insensitive)
          const razaoSocial = (c.razao_social || c.nome || '').toLowerCase();
          const matchRazaoSocial = razaoSocial.includes(searchLower);

          // Se tiver dígitos no termo e mais de 3, também considerar CNPJ
          const cnpjLimpo = String(c.cnpj_limpo || '').replace(/\D/g, '');
          const matchCNPJ = searchDigits.length > 3 && cnpjLimpo.includes(searchDigits);

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

      // Ordenação padrão: A → Z por razão social
      data = data.sort((a: any, b: any) => {
        const nomeA = (a.razao_social || a.nome || '').toLowerCase().trim();
        const nomeB = (b.razao_social || b.nome || '').toLowerCase().trim();
        return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
      });

      // Paginação simples (sem contagens para performance)
      const pageNum = Number(page);
      const limitNum = Number(limit);
      const startIndex = (pageNum - 1) * limitNum;
      const endIndex = startIndex + limitNum;
      let paginatedData = data.slice(startIndex, endIndex);

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
   * Buscar clientes por CNAE (principal ou secundário)
   * GET /api/clientes/cnae/:cnae
   */
  async buscarPorCNAE(req: Request, res: Response): Promise<void> {
    try {
      const { cnae } = req.params;

      if (!cnae) {
        res.status(400).json({
          success: false,
          error: 'CNAE é obrigatório',
        });
        return;
      }

      // Limpar CNAE (remover formatação, manter apenas números)
      const cnaeLimpo = String(cnae).replace(/\D/g, '');

      // Validar mínimo de 2 dígitos
      if (cnaeLimpo.length < 2) {
        res.status(400).json({
          success: false,
          error: 'Código CNAE deve ter pelo menos 2 dígitos',
        });
        return;
      }

      // Buscar todos os clientes
      const result = await this.clienteModel.findAll();

      if (!result.success || !result.data) {
        res.status(400).json(result);
        return;
      }

      // Filtrar clientes que têm o CNAE (principal ou secundário)
      const clientesFiltrados = (result.data || []).filter((cliente: any) => {
        // Normalizar CNAE buscado (remover formatação)
        const cnaeBuscadoNormalizado = cnaeLimpo.replace(/[^\d]/g, '');
        
        // Verificar CNAE principal
        const cnaePrincipal = cliente.atividade_principal_code;
        if (cnaePrincipal) {
          const cnaePrincipalNormalizado = String(cnaePrincipal).replace(/[^\d]/g, '');
          // Comparar códigos normalizados (apenas números)
          if (cnaePrincipalNormalizado === cnaeBuscadoNormalizado || 
              cnaePrincipalNormalizado.startsWith(cnaeBuscadoNormalizado) ||
              cnaeBuscadoNormalizado.startsWith(cnaePrincipalNormalizado)) {
            return true;
          }
        }

        // Verificar atividades secundárias
        let atividadesSecundarias: any[] = [];
        try {
          const valor = cliente.atividades_secundarias;
          if (typeof valor === 'string') {
            atividadesSecundarias = JSON.parse(valor);
          } else if (Array.isArray(valor)) {
            atividadesSecundarias = valor;
          }
        } catch {
          // Ignorar erros de parsing
        }

        // Verificar se alguma atividade secundária corresponde
        for (const atividade of atividadesSecundarias) {
          if (atividade && atividade.code) {
            const cnaeSecundarioNormalizado = String(atividade.code).replace(/[^\d]/g, '');
            if (cnaeSecundarioNormalizado === cnaeBuscadoNormalizado ||
                cnaeSecundarioNormalizado.startsWith(cnaeBuscadoNormalizado) ||
                cnaeBuscadoNormalizado.startsWith(cnaeSecundarioNormalizado)) {
              return true;
            }
          }
        }

        return false;
      });

      // Ordenar por razão social
      clientesFiltrados.sort((a: any, b: any) => {
        const nomeA = (a.razao_social || a.nome || '').toLowerCase().trim();
        const nomeB = (b.razao_social || b.nome || '').toLowerCase().trim();
        return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
      });

      // Carregar sócios para cada cliente
      try {
        for (const cliente of clientesFiltrados) {
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
        data: clientesFiltrados,
        total: clientesFiltrados.length,
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
   * Função auxiliar para buscar grupos de CNAEs (retorna dados sem enviar resposta)
   */
  private async obterGruposCNAE(): Promise<Array<{ nome: string; palavrasChave: string[]; cnaes: Array<{ codigo: string; descricao: string }> }>> {
    try {
      // Buscar todos os clientes
      const result = await this.clienteModel.findAll();

      if (!result.success || !result.data) {
        return [];
      }

      // Coletar todos os CNAEs únicos (código + descrição)
      const cnaesMap = new Map<string, { codigo: string; descricao: string; tipo: 'principal' | 'secundario' }>();

      for (const cliente of result.data || []) {
        // CNAE Principal
        if ((cliente as any).atividade_principal_code && (cliente as any).atividade_principal_text) {
          const codigo = String((cliente as any).atividade_principal_code).trim();
          const descricao = String((cliente as any).atividade_principal_text).trim();
          if (codigo && descricao) {
            cnaesMap.set(codigo, { codigo, descricao, tipo: 'principal' });
          }
        }

        // CNAEs Secundários
        let atividadesSecundarias: any[] = [];
        try {
          const valor = (cliente as any).atividades_secundarias;
          if (typeof valor === 'string') {
            atividadesSecundarias = JSON.parse(valor);
          } else if (Array.isArray(valor)) {
            atividadesSecundarias = valor;
          }
        } catch {
          // Ignorar erros de parsing
        }

        for (const atividade of atividadesSecundarias) {
          if (atividade && atividade.code && atividade.text) {
            const codigo = String(atividade.code).trim();
            const descricao = String(atividade.text).trim();
            if (codigo && descricao) {
              // Se já existe, manter o tipo 'principal' se for, senão marcar como secundário
              const existente = cnaesMap.get(codigo);
              if (!existente || existente.tipo === 'secundario') {
                cnaesMap.set(codigo, { codigo, descricao, tipo: 'secundario' });
              }
            }
          }
        }
      }

      // Converter para array
      const todosCNAEs = Array.from(cnaesMap.values());

      // Definir grupos por palavras-chave comuns
      const grupos: Record<string, { nome: string; palavrasChave: string[]; cnaes: Array<{ codigo: string; descricao: string }> }> = {};

      // Função para normalizar texto (remover acentos, lowercase)
      const normalizarTexto = (texto: string): string => {
        return texto
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim();
      };

      // Função para verificar se um CNAE pertence a um grupo (busca mais precisa)
      const pertenceAoGrupo = (descricao: string, palavrasChave: string[], grupoNome?: string): boolean => {
        if (!descricao) return false;
        const descricaoNormalizada = normalizarTexto(descricao);
        
        // Lógica especial para "Aluguel e Locação" - mais restritiva
        if (grupoNome === 'Aluguel e Locação') {
          // Verificar se a descrição contém termos relacionados a aluguel/locação
          // mas excluir termos que podem causar falsos positivos
          const termosAluguel = ['aluguel', 'locação', 'locacao', 'arrendamento', 'leasing', 'locar', 'alugar'];
          const termosExcluir = ['venda', 'compra', 'comercialização', 'construção', 'construcao'];
          
          // Verificar se contém algum termo de aluguel
          const temTermoAluguel = termosAluguel.some(termo => {
            const regex = new RegExp(`\\b${termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            return regex.test(descricaoNormalizada);
          });
          
          // Se não tem termo de aluguel, não pertence
          if (!temTermoAluguel) return false;
          
          // Se tem termo de aluguel mas também tem termo de exclusão, verificar contexto
          const temTermoExclusao = termosExcluir.some(termo => {
            const regex = new RegExp(`\\b${termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            return regex.test(descricaoNormalizada);
          });
          
          // Se tem termo de exclusão, verificar se é realmente sobre aluguel
          // Exemplo: "Compra e venda de imóveis" não deve ser incluído
          // Mas "Aluguel de imóveis próprios" deve ser incluído
          if (temTermoExclusao) {
            // Se a descrição começa com "aluguel" ou "locação", é válido mesmo com exclusão
            if (descricaoNormalizada.startsWith('aluguel') || 
                descricaoNormalizada.startsWith('locação') ||
                descricaoNormalizada.startsWith('locacao')) {
              return true;
            }
            
            // Caso contrário, verificar se não é sobre compra/venda
            if (descricaoNormalizada.includes('compra') && !descricaoNormalizada.includes('aluguel')) {
              return false;
            }
          }
          
          return true;
        }
        
        // Para outros grupos, usar busca normal com word boundaries
        return palavrasChave.some(palavra => {
          const palavraNormalizada = normalizarTexto(palavra);
          
          // Criar regex para buscar a palavra como palavra completa (word boundary)
          // Isso evita matches parciais indesejados
          const regex = new RegExp(`\\b${palavraNormalizada.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          
          // Verificar se a palavra aparece na descrição
          if (regex.test(descricaoNormalizada)) {
            return true;
          }
          
          // Também verificar se a palavra aparece no início ou fim da descrição
          // (caso não tenha word boundary antes/depois)
          if (descricaoNormalizada.startsWith(palavraNormalizada + ' ') ||
              descricaoNormalizada.endsWith(' ' + palavraNormalizada) ||
              descricaoNormalizada === palavraNormalizada) {
            return true;
          }
          
          return false;
        });
      };

      // Definir grupos com suas palavras-chave
      const gruposDefinidos: Array<{ nome: string; palavrasChave: string[] }> = [
        { nome: 'Aluguel e Locação', palavrasChave: ['aluguel', 'locação', 'locacao', 'arrendamento', 'leasing', 'locar', 'alugar'] },
        { nome: 'Atacadista', palavrasChave: ['atacadista', 'atacado'] },
        { nome: 'Varejista', palavrasChave: ['varejista', 'varejo'] },
        { nome: 'Comércio', palavrasChave: ['comércio', 'comercio', 'venda', 'comercialização'] },
        { nome: 'Serviços', palavrasChave: ['serviço', 'servico', 'prestação', 'prestacao'] },
        { nome: 'Indústria', palavrasChave: ['indústria', 'industria', 'fabricação', 'fabricacao', 'produção', 'producao'] },
        { nome: 'Construção', palavrasChave: ['construção', 'construcao', 'obra', 'edificação', 'edificacao'] },
        { nome: 'Transporte', palavrasChave: ['transporte', 'frete', 'logística', 'logistica'] },
        { nome: 'Tecnologia', palavrasChave: ['tecnologia', 'informática', 'informatica', 'software', 'sistema', 'desenvolvimento'] },
        { nome: 'Saúde', palavrasChave: ['saúde', 'saude', 'médico', 'medico', 'hospital', 'clínica', 'clinica'] },
        { nome: 'Educação', palavrasChave: ['educação', 'educacao', 'ensino', 'escola', 'curso', 'academia'] },
        { nome: 'Alimentação', palavrasChave: ['alimentação', 'alimentacao', 'restaurante', 'lanchonete', 'bar', 'bebida'] },
        { nome: 'Imobiliária', palavrasChave: ['imobiliária', 'imobiliaria', 'imóvel', 'imovel', 'corretagem'] },
        { nome: 'Consultoria', palavrasChave: ['consultoria', 'consultor', 'assessoria', 'assessor'] },
        { nome: 'Publicidade', palavrasChave: ['publicidade', 'propaganda', 'marketing', 'comunicação', 'comunicacao'] },
        { nome: 'Limpeza', palavrasChave: ['limpeza', 'higienização', 'higienizacao', 'conservação', 'conservacao'] },
        { nome: 'Segurança', palavrasChave: ['segurança', 'seguranca', 'vigilância', 'vigilancia', 'proteção', 'protecao'] },
      ];

      // Agrupar CNAEs
      for (const grupoDef of gruposDefinidos) {
        const cnaesDoGrupo = todosCNAEs
          .filter(cnae => pertenceAoGrupo(cnae.descricao, grupoDef.palavrasChave, grupoDef.nome))
          .map(cnae => ({ codigo: cnae.codigo, descricao: cnae.descricao }));

        if (cnaesDoGrupo.length > 0) {
          grupos[grupoDef.nome] = {
            nome: grupoDef.nome,
            palavrasChave: grupoDef.palavrasChave,
            cnaes: cnaesDoGrupo,
          };
        }
      }

      // Converter para array e ordenar por nome
      const gruposArray = Object.values(grupos).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

      return gruposArray;
    } catch (error) {
      console.error('[ClienteController] Erro ao obter grupos CNAE:', error);
      return [];
    }
  }

  /**
   * Buscar grupos de CNAEs agrupados por palavras-chave
   * GET /api/clientes/cnae-grupos
   */
  async buscarGruposCNAE(_req: Request, res: Response): Promise<void> {
    try {
      const gruposArray = await this.obterGruposCNAE();
      res.json({
        success: true,
        data: gruposArray,
        total: gruposArray.length,
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
   * Buscar clientes por grupo de CNAE
   * GET /api/clientes/cnae-grupo/:grupo
   */
  async buscarPorGrupoCNAE(req: Request, res: Response): Promise<void> {
    try {
      const { grupo } = req.params;

      if (!grupo) {
        res.status(400).json({
          success: false,
          error: 'Nome do grupo é obrigatório',
        });
        return;
      }

      // Buscar os grupos CNAE para obter a lista de códigos CNAE do grupo
      const gruposArray = await this.obterGruposCNAE();

      // Encontrar o grupo selecionado
      const grupoSelecionado = gruposArray.find((g) => g.nome === grupo);
      if (!grupoSelecionado || !grupoSelecionado.cnaes || grupoSelecionado.cnaes.length === 0) {
        res.json({
          success: true,
          data: [],
          total: 0,
          grupo: grupo,
        });
        return;
      }

      // Criar um Set com os códigos CNAE do grupo (normalizados para comparação)
      const normalizarCodigoCNAE = (codigo: string | number | null | undefined): string => {
        if (!codigo) return '';
        // Converter para string e remover todos os caracteres não numéricos
        // Formato pode ser: "4637-1/99", "46.37-1-99", "4637199", "4637-1-99", etc.
        // CNAE tem 7 dígitos: XXXX-X/XX ou XXXX-X-XX
        let codigoStr = String(codigo).trim();
        
        // Remover todos os caracteres não numéricos
        codigoStr = codigoStr.replace(/\D/g, '');
        
        // Se tiver menos de 7 dígitos, pode estar incompleto - retornar como está
        // Se tiver mais de 7 dígitos, pegar apenas os primeiros 7
        if (codigoStr.length > 7) {
          codigoStr = codigoStr.substring(0, 7);
        }
        
        return codigoStr;
      };

      // Normalizar e criar Set com códigos do grupo
      const codigosCNAEGrupo = new Set<string>();
      for (const cnae of grupoSelecionado.cnaes) {
        const codigoNormalizado = normalizarCodigoCNAE(cnae.codigo);
        if (codigoNormalizado) {
          codigosCNAEGrupo.add(codigoNormalizado);
        }
      }

      console.log(`[buscarPorGrupoCNAE] Grupo: ${grupo}, Códigos CNAE do grupo (${codigosCNAEGrupo.size}):`, Array.from(codigosCNAEGrupo));

      // Buscar todos os clientes
      const result = await this.clienteModel.findAll();

      if (!result.success || !result.data) {
        res.status(400).json(result);
        return;
      }

      // Filtrar clientes que têm CNAE do grupo (verificando por código, não por descrição)
      const clientesFiltrados = (result.data || []).filter((cliente: any) => {
        let temCNAEDoGrupo = false;
        const codigosCliente: string[] = [];

        // Verificar CNAE principal pelo código
        const cnaePrincipalCode = (cliente as any).atividade_principal_code;
        if (cnaePrincipalCode) {
          const codigoNormalizado = normalizarCodigoCNAE(String(cnaePrincipalCode));
          codigosCliente.push(`Principal: ${codigoNormalizado} (original: ${cnaePrincipalCode})`);
          if (codigosCNAEGrupo.has(codigoNormalizado)) {
            temCNAEDoGrupo = true;
          }
        }

        // Verificar atividades secundárias pelo código
        let atividadesSecundarias: any[] = [];
        try {
          const valor = (cliente as any).atividades_secundarias;
          if (typeof valor === 'string') {
            atividadesSecundarias = JSON.parse(valor);
          } else if (Array.isArray(valor)) {
            atividadesSecundarias = valor;
          }
        } catch {
          // Ignorar erros de parsing
        }

        for (const atividade of atividadesSecundarias) {
          if (atividade && atividade.code) {
            const codigoNormalizado = normalizarCodigoCNAE(String(atividade.code));
            codigosCliente.push(`Secundário: ${codigoNormalizado} (original: ${atividade.code})`);
            if (codigosCNAEGrupo.has(codigoNormalizado)) {
              temCNAEDoGrupo = true;
            }
          }
        }

        // Log apenas para clientes que estão sendo incluídos incorretamente
        if (temCNAEDoGrupo && (cliente as any).razao_social?.includes('ACAI')) {
          console.log(`[buscarPorGrupoCNAE] Cliente incluído: ${(cliente as any).razao_social}`);
          console.log(`[buscarPorGrupoCNAE] Códigos do cliente:`, codigosCliente);
        }

        return temCNAEDoGrupo;
      });

      // Ordenar por razão social
      clientesFiltrados.sort((a: any, b: any) => {
        const nomeA = (a.razao_social || a.nome || '').toLowerCase().trim();
        const nomeB = (b.razao_social || b.nome || '').toLowerCase().trim();
        return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
      });

      // Carregar sócios para cada cliente
      try {
        for (const cliente of clientesFiltrados) {
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
        data: clientesFiltrados,
        total: clientesFiltrados.length,
        grupo: grupo,
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
   * Buscar clientes por múltiplos CNAEs e/ou grupos
   * POST /api/clientes/cnae-busca
   * Body: { cnaes?: string[], grupos?: string[] }
   */
  async buscarPorMultiplosCNAEsEGrupos(req: Request, res: Response): Promise<void> {
    try {
      // Garantir que temos arrays válidos (mesmo que vazios)
      const cnaes = Array.isArray(req.body.cnaes) ? req.body.cnaes : (req.body.cnaes ? [req.body.cnaes] : []);
      const grupos = Array.isArray(req.body.grupos) ? req.body.grupos : (req.body.grupos ? [req.body.grupos] : []);
      const mode = req.body.mode && ['OR', 'AND'].includes(req.body.mode) ? req.body.mode : 'OR';

      console.log('[buscarPorMultiplosCNAEsEGrupos] Recebido:', {
        cnaes: cnaes,
        grupos: grupos,
        mode: mode,
        cnaesLength: cnaes.length,
        gruposLength: grupos.length
      });

      // Validar que pelo menos um critério foi fornecido
      if (cnaes.length === 0 && grupos.length === 0) {
        res.status(400).json({
          success: false,
          error: 'É necessário informar pelo menos um CNAE ou um grupo',
        });
        return;
      }

      // Normalizar códigos CNAE
      const normalizarCodigoCNAE = (codigo: string | number | null | undefined): string => {
        if (!codigo) return '';
        let codigoStr = String(codigo).trim();
        codigoStr = codigoStr.replace(/\D/g, '');
        if (codigoStr.length > 7) {
          codigoStr = codigoStr.substring(0, 7);
        }
        return codigoStr;
      };

      // Coletar todos os códigos CNAE dos grupos selecionados
      // Para modo AND, precisamos manter os CNAEs separados por grupo
      const codigosCNAEGrupos = new Set<string>();
      const cnaePorGrupo = new Map<string, Set<string>>(); // Para modo AND
      
      if (grupos && grupos.length > 0) {
        const gruposArray = await this.obterGruposCNAE();
        console.log(`[buscarPorMultiplosCNAEsEGrupos] Grupos solicitados: ${grupos.join(', ')}`);
        console.log(`[buscarPorMultiplosCNAEsEGrupos] Grupos disponíveis no sistema: ${gruposArray.length}`);
        console.log(`[buscarPorMultiplosCNAEsEGrupos] Nomes dos grupos disponíveis:`, gruposArray.map(g => g.nome).slice(0, 10));
        
        for (const grupoNome of grupos) {
          // Buscar grupo (case-insensitive para maior flexibilidade)
          const grupoSelecionado = gruposArray.find((g) => 
            g.nome.toLowerCase().trim() === grupoNome.toLowerCase().trim()
          );
          
          if (grupoSelecionado && grupoSelecionado.cnaes && grupoSelecionado.cnaes.length > 0) {
            console.log(`[buscarPorMultiplosCNAEsEGrupos] ✅ Grupo "${grupoNome}" encontrado com ${grupoSelecionado.cnaes.length} CNAEs`);
            let cnaesAdicionados = 0;
            const cnaesDoGrupo = new Set<string>();
            
            for (const cnae of grupoSelecionado.cnaes) {
              if (cnae && cnae.codigo) {
                const codigoNormalizado = normalizarCodigoCNAE(cnae.codigo);
                if (codigoNormalizado && codigoNormalizado.length >= 2) {
                  codigosCNAEGrupos.add(codigoNormalizado);
                  cnaesDoGrupo.add(codigoNormalizado);
                  cnaesAdicionados++;
                }
              }
            }
            
            // Armazenar CNAEs por grupo (para modo AND)
            if (cnaesDoGrupo.size > 0) {
              cnaePorGrupo.set(grupoNome, cnaesDoGrupo);
            }
            
            console.log(`[buscarPorMultiplosCNAEsEGrupos] ✅ ${cnaesAdicionados} CNAEs válidos adicionados do grupo "${grupoNome}"`);
          } else {
            console.warn(`[buscarPorMultiplosCNAEsEGrupos] ⚠️ Grupo "${grupoNome}" não encontrado ou sem CNAEs`);
            if (grupoSelecionado) {
              console.warn(`[buscarPorMultiplosCNAEsEGrupos] Grupo encontrado mas sem CNAEs:`, {
                nome: grupoSelecionado.nome,
                cnaesCount: grupoSelecionado.cnaes?.length || 0
              });
            }
          }
        }
        console.log(`[buscarPorMultiplosCNAEsEGrupos] ✅ Total de CNAEs únicos coletados dos grupos: ${codigosCNAEGrupos.size}`);
        console.log(`[buscarPorMultiplosCNAEsEGrupos] ✅ Modo de busca: ${mode}`);
      }

      // Normalizar CNAEs individuais fornecidos
      const codigosCNAEIndividuais = new Set<string>();
      if (cnaes && Array.isArray(cnaes)) {
        console.log(`[buscarPorMultiplosCNAEsEGrupos] Processando ${cnaes.length} CNAEs individuais:`, cnaes);
        for (const cnae of cnaes) {
          const codigoNormalizado = normalizarCodigoCNAE(cnae);
          if (codigoNormalizado && codigoNormalizado.length >= 2) {
            codigosCNAEIndividuais.add(codigoNormalizado);
          } else {
            console.warn(`[buscarPorMultiplosCNAEsEGrupos] CNAE inválido ignorado: ${cnae} -> ${codigoNormalizado}`);
          }
        }
        console.log(`[buscarPorMultiplosCNAEsEGrupos] Total de CNAEs individuais válidos: ${codigosCNAEIndividuais.size}`);
      }

      // Combinar todos os códigos CNAE (grupos + individuais)
      const todosCodigosCNAE = new Set<string>();
      codigosCNAEGrupos.forEach(codigo => todosCodigosCNAE.add(codigo));
      codigosCNAEIndividuais.forEach(codigo => todosCodigosCNAE.add(codigo));

      console.log('[buscarPorMultiplosCNAEsEGrupos] Critérios de busca:', {
        grupos: grupos,
        gruposCNAEs: Array.from(codigosCNAEGrupos).slice(0, 10),
        cnaesIndividuais: Array.from(codigosCNAEIndividuais),
        totalCodigos: todosCodigosCNAE.size,
        todosCodigos: Array.from(todosCodigosCNAE).slice(0, 20)
      });

      if (todosCodigosCNAE.size === 0) {
        res.json({
          success: true,
          data: [],
          total: 0,
        });
        return;
      }

      // Buscar todos os clientes
      const result = await this.clienteModel.findAll();

      if (!result.success || !result.data) {
        res.status(400).json(result);
        return;
      }

      console.log(`[buscarPorMultiplosCNAEsEGrupos] Total de clientes para filtrar: ${(result.data || []).length}`);

      // Função auxiliar para verificar se um CNAE corresponde a algum dos buscados
      const correspondeAoCriterio = (codigoCliente: string): boolean => {
        if (!codigoCliente || codigoCliente.length < 2) return false;
        
        // Verificar correspondência exata ou parcial
        for (const codigoBuscado of todosCodigosCNAE) {
          if (!codigoBuscado || codigoBuscado.length < 2) continue;
          
          // Correspondência exata (mais comum e preciso)
          if (codigoCliente === codigoBuscado) {
            return true;
          }
          
          // Correspondência parcial: 
          // - Se o código buscado é prefixo do código do cliente (ex: buscar "46" encontra "4637199")
          // - Se o código do cliente é prefixo do código buscado (ex: buscar "4637199" encontra "4637")
          // Isso permite busca por códigos parciais
          if (codigoCliente.length >= codigoBuscado.length) {
            // Código do cliente é maior ou igual - verificar se começa com o buscado
            if (codigoCliente.startsWith(codigoBuscado)) {
              return true;
            }
          } else {
            // Código buscado é maior - verificar se começa com o código do cliente
            if (codigoBuscado.startsWith(codigoCliente)) {
              return true;
            }
          }
        }
        
        return false;
      };

      // Filtrar clientes baseado no modo de busca
      const clientesFiltrados = (result.data || []).filter((cliente: any) => {
        // Coletar todos os CNAEs do cliente (principal + secundários)
        const cnaesDoCliente = new Set<string>();
        
        // CNAE principal
        const cnaePrincipalCode = cliente.atividade_principal_code;
        if (cnaePrincipalCode) {
          const codigoNormalizado = normalizarCodigoCNAE(String(cnaePrincipalCode));
          if (codigoNormalizado && codigoNormalizado.length >= 2) {
            cnaesDoCliente.add(codigoNormalizado);
          }
        }

        // Atividades secundárias
        let atividadesSecundarias: any[] = [];
        try {
          const valor = cliente.atividades_secundarias;
          if (typeof valor === 'string') {
            atividadesSecundarias = JSON.parse(valor);
          } else if (Array.isArray(valor)) {
            atividadesSecundarias = valor;
          }
        } catch {
          // Ignorar erros de parsing
        }

        for (const atividade of atividadesSecundarias) {
          if (atividade && atividade.code) {
            const codigoNormalizado = normalizarCodigoCNAE(String(atividade.code));
            if (codigoNormalizado && codigoNormalizado.length >= 2) {
              cnaesDoCliente.add(codigoNormalizado);
            }
          }
        }

        // Modo OR (padrão): cliente tem QUALQUER UM dos CNAEs
        if (mode === 'OR') {
          for (const cnaeCliente of cnaesDoCliente) {
            if (correspondeAoCriterio(cnaeCliente)) {
              return true;
            }
          }
          return false;
        }
        
        // Modo AND: cliente tem TODOS os CNAEs/grupos buscados
        if (mode === 'AND') {
          // Caso 1: Busca por grupos - verificar se tem CNAE de cada grupo
          if (cnaePorGrupo.size > 0) {
            for (const [nomeGrupo, cnaesDoGrupo] of cnaePorGrupo.entries()) {
              let temCnaeDoGrupo = false;
              
              for (const cnaeCliente of cnaesDoCliente) {
                for (const cnaeGrupo of cnaesDoGrupo) {
                  if (cnaeCliente === cnaeGrupo || 
                      cnaeCliente.startsWith(cnaeGrupo) || 
                      cnaeGrupo.startsWith(cnaeCliente)) {
                    temCnaeDoGrupo = true;
                    break;
                  }
                }
                if (temCnaeDoGrupo) break;
              }
              
              if (!temCnaeDoGrupo) {
                return false;
              }
            }
            return true;
          }
          
          // Caso 2: Busca por CNAEs individuais - verificar se tem TODOS os CNAEs
          if (todosCodigosCNAE.size > 0) {
            for (const cnaeBuscado of todosCodigosCNAE) {
              let temEsteCnae = false;
              
              for (const cnaeCliente of cnaesDoCliente) {
                // Verificar correspondência
                if (cnaeCliente === cnaeBuscado || 
                    cnaeCliente.startsWith(cnaeBuscado) || 
                    cnaeBuscado.startsWith(cnaeCliente)) {
                  temEsteCnae = true;
                  break;
                }
              }
              
              // Se não tem este CNAE, não passa no filtro
              if (!temEsteCnae) {
                return false;
              }
            }
            
            // Passou por todos os CNAEs - tem todos
            return true;
          }
        }

        return false;
      });

      console.log(`[buscarPorMultiplosCNAEsEGrupos] Clientes filtrados: ${clientesFiltrados.length}`);

      // Remover duplicatas (caso um cliente tenha múltiplos CNAEs que correspondem)
      const clientesUnicos = Array.from(
        new Map(clientesFiltrados.map((cliente: any) => [cliente.id, cliente])).values()
      );

      // Ordenar por razão social
      clientesUnicos.sort((a: any, b: any) => {
        const nomeA = (a.razao_social || a.nome || '').toLowerCase().trim();
        const nomeB = (b.razao_social || b.nome || '').toLowerCase().trim();
        return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
      });

      // Carregar sócios para cada cliente
      try {
        for (const cliente of clientesUnicos) {
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
        data: clientesUnicos,
        total: clientesUnicos.length,
        criterios: {
          cnaes: Array.from(codigosCNAEIndividuais),
          grupos: grupos || [],
          totalCodigosCNAE: todosCodigosCNAE.size,
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
   * Atualizar código SCI do cliente
   * Busca o código SCI no banco SCI e atualiza no MySQL
   */
  async atualizarCodigoSCI(req: Request, res: Response): Promise<void> {
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

      const cliente = clienteResult.data as any;
      const cnpj = cliente.cnpj_limpo || cliente.cnpj;

      if (!cnpj) {
        res.status(400).json({
          success: false,
          error: 'Cliente não possui CNPJ cadastrado',
        });
        return;
      }

      // Normalizar CNPJ (apenas números)
      const cnpjLimpo = String(cnpj).replace(/\D/g, '');
      
      if (cnpjLimpo.length !== 14) {
        res.status(400).json({
          success: false,
          error: 'CNPJ do cliente inválido',
        });
        return;
      }

      // Executar script Python para buscar código SCI
      const pythonScript = path.join(__dirname, '../../python/buscar_codigo_sci.py');
      const command = `python "${pythonScript}" "${cnpjLimpo}"`;

      try {
        const { stdout, stderr } = await execAsync(command, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024, // 10MB
        });

        if (stderr && !stderr.includes('INFO')) {
          console.error('[Atualizar Código SCI] Python stderr:', stderr);
        }

        // Parse do resultado JSON
        const resultado = JSON.parse(stdout);

        if (!resultado.success) {
          res.status(400).json({
            success: false,
            error: resultado.error || 'Erro ao buscar código SCI',
          });
          return;
        }

        const codigoSci = resultado.codigo_sci;

        if (!codigoSci) {
          res.status(404).json({
            success: false,
            error: 'Código SCI não encontrado no banco SCI',
          });
          return;
        }

        // Atualizar código SCI no banco MySQL
        const updateResult = await this.clienteModel.updateCliente(id, {
          codigo_sci: codigoSci
        });

        if (!updateResult.success) {
          res.status(400).json(updateResult);
          return;
        }

        res.json({
          success: true,
          data: {
            codigo_sci: codigoSci,
            cliente: updateResult.data
          },
          message: 'Código SCI atualizado com sucesso',
        });

      } catch (execError: any) {
        console.error('[Atualizar Código SCI] Erro ao executar script Python:', execError);
        
        // Tentar parsear stderr como JSON
        try {
          const erroResultado = JSON.parse(execError.stdout || execError.stderr || '{}');
          res.status(400).json({
            success: false,
            error: erroResultado.error || 'Erro ao buscar código SCI',
          });
        } catch {
          res.status(500).json({
            success: false,
            error: 'Erro ao executar busca no banco SCI',
            message: execError.message || String(execError),
          });
        }
      }

    } catch (error: any) {
      console.error('[ClienteController] Erro ao atualizar código SCI:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message || 'Erro desconhecido',
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
      
      let extractedDataResults = await executeQuery<Array<{ socios?: string | any[]; empresa_razao_social?: string }>>(extractedDataQuery, [downloadId]);
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
        extractedDataResults = await executeQuery<Array<{ socios?: string | any[]; empresa_razao_social?: string }>>(extractedDataQuery, [cnpjLimpo]);
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

      const extractedData = extractedDataResults[0] as { socios?: string | any[]; empresa_razao_social?: string };
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
            : Array.isArray(extractedData.socios) ? extractedData.socios : [];
          
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
   * Editar participação manualmente (Capital Social e Participações dos Sócios)
   * PUT /api/clientes/:id/editar-participacao-manual
   * Body: { capital_social: number, socios: Array<{ id: number; participacao_percentual: number; participacao_valor: number }> }
   */
  async editarParticipacaoManual(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { capital_social, socios } = req.body;
      
      if (!id) {
        res.status(400).json({
          success: false,
          error: 'ID do cliente é obrigatório',
        });
        return;
      }

      // Validar capital_social
      if (capital_social === undefined || capital_social === null) {
        res.status(400).json({
          success: false,
          error: 'Capital Social é obrigatório',
        });
        return;
      }

      const capitalSocialNum = parseFloat(String(capital_social));
      if (isNaN(capitalSocialNum) || capitalSocialNum < 0) {
        res.status(400).json({
          success: false,
          error: 'Capital Social deve ser um número válido maior ou igual a zero',
        });
        return;
      }

      // Validar socios
      if (!Array.isArray(socios)) {
        res.status(400).json({
          success: false,
          error: 'Sócios deve ser um array',
        });
        return;
      }

      // Buscar cliente
      const clienteResult = await this.clienteModel.findById(id);
      if (!clienteResult.success || !clienteResult.data) {
        res.status(404).json({
          success: false,
          error: 'Cliente não encontrado',
        });
        return;
      }

      // Atualizar capital social
      const updateClienteResult = await this.clienteModel.updateCliente(id, {
        capital_social: capitalSocialNum,
      });

      if (!updateClienteResult.success) {
        res.status(400).json({
          success: false,
          error: 'Erro ao atualizar capital social',
          message: updateClienteResult.error,
        });
        return;
      }

      // Atualizar sócios
      const { executeQuery } = await import('../config/mysql');
      
      for (const socio of socios) {
        if (!socio.id || socio.participacao_percentual === undefined || socio.participacao_valor === undefined) {
          continue; // Pular sócios inválidos
        }

        const participacaoPercentual = parseFloat(String(socio.participacao_percentual)) || 0;
        const participacaoValor = parseFloat(String(socio.participacao_valor)) || 0;

        // Validar porcentagem (0-100)
        if (participacaoPercentual < 0 || participacaoPercentual > 100) {
          console.warn(`[Editar Participação] Porcentagem inválida para sócio ${socio.id}: ${participacaoPercentual}`);
          continue;
        }

        try {
          await executeQuery(
            'UPDATE clientes_socios SET participacao_percentual = ?, participacao_valor = ?, updated_at = NOW() WHERE id = ? AND cliente_id = ?',
            [participacaoPercentual, participacaoValor, socio.id, id]
          );
        } catch (error: any) {
          console.error(`[Editar Participação] Erro ao atualizar sócio ${socio.id}:`, error);
          // Continuar atualizando outros sócios mesmo se um falhar
        }
      }

      res.json({
        success: true,
        data: {
          clienteId: id,
          message: 'Participação atualizada com sucesso',
        },
      });
    } catch (error: any) {
      console.error('[Editar Participação] Erro:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao editar participação',
        message: error.message,
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

  /**
   * Atualizar regimes tributários em massa a partir de um arquivo
   * POST /api/clientes/atualizar-regimes-massa
   * Body: { dados: Array<{ cnpj: string, regime: string }> }
   */
  async atualizarRegimesMassa(req: Request, res: Response): Promise<void> {
    try {
      const { dados } = req.body || {};
      
      if (!dados || !Array.isArray(dados)) {
        res.status(400).json({ 
          success: false, 
          error: 'Campo "dados" é obrigatório e deve ser um array' 
        });
        return;
      }

      console.log(`[ClienteController] Iniciando atualização em massa de ${dados.length} registros`);

      const resultados = {
        total: dados.length,
        atualizados: 0,
        naoEncontrados: 0,
        erros: 0,
        detalhes: [] as Array<{ cnpj: string; status: string; mensagem?: string }>,
      };

      for (const item of dados) {
        const cnpjOriginal = item.cnpj;
        const regime = item.regime;

        // Limpar CNPJ (remover pontos, barras, traços, espaços)
        const cnpjLimpo = String(cnpjOriginal || '').replace(/\D/g, '');

        if (cnpjLimpo.length !== 14) {
          resultados.erros++;
          resultados.detalhes.push({
            cnpj: cnpjOriginal,
            status: 'erro',
            mensagem: `CNPJ inválido (${cnpjLimpo.length} dígitos)`,
          });
          continue;
        }

        try {
          // Buscar cliente pelo CNPJ
          const clienteResult = await this.clienteModel.findByCNPJ(cnpjLimpo);

          if (!clienteResult.success || !clienteResult.data) {
            resultados.naoEncontrados++;
            resultados.detalhes.push({
              cnpj: cnpjOriginal,
              status: 'não encontrado',
              mensagem: 'Cliente não cadastrado no sistema',
            });
            continue;
          }

          const cliente = clienteResult.data;

          // Atualizar apenas o campo regime_tributario
          const updateResult = await this.clienteModel.updateCliente(cliente.id!, {
            regime_tributario: regime,
          });

          if (updateResult.success) {
            resultados.atualizados++;
            resultados.detalhes.push({
              cnpj: cnpjOriginal,
              status: 'atualizado',
              mensagem: `Regime: ${regime}`,
            });
          } else {
            resultados.erros++;
            resultados.detalhes.push({
              cnpj: cnpjOriginal,
              status: 'erro',
              mensagem: updateResult.error || 'Erro ao atualizar',
            });
          }
        } catch (error) {
          resultados.erros++;
          resultados.detalhes.push({
            cnpj: cnpjOriginal,
            status: 'erro',
            mensagem: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      }

      console.log(`[ClienteController] Atualização concluída:`, {
        total: resultados.total,
        atualizados: resultados.atualizados,
        naoEncontrados: resultados.naoEncontrados,
        erros: resultados.erros,
      });

      res.json({
        success: true,
        data: resultados,
        message: `Atualização concluída. ${resultados.atualizados} registros atualizados, ${resultados.naoEncontrados} não encontrados, ${resultados.erros} erros.`,
      });
    } catch (error) {
      console.error('[ClienteController] Erro ao atualizar regimes em massa:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Exportar clientes personalizado (XLSX)
   * POST /api/clientes/exportar-personalizado
   * Body: { campos: string[], filtros?: { search?: string, socio?: string } }
   */
  async exportarClientesPersonalizado(req: Request, res: Response): Promise<void> {
    try {
      const { campos, filtros } = req.body;

      if (!campos || !Array.isArray(campos) || campos.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Campo "campos" é obrigatório e deve ser um array não vazio',
        });
        return;
      }

      // Buscar clientes (com filtros opcionais)
      const params: any = {};
      if (filtros?.search) {
        params.search = filtros.search;
      }
      if (filtros?.socio) {
        params.socio = filtros.socio;
      }

      const clientesResult = await this.clienteModel.findAll();

      if (!clientesResult.success || !clientesResult.data) {
        res.status(500).json({
          success: false,
          error: 'Erro ao buscar clientes',
        });
        return;
      }

      let clientes = clientesResult.data;

      // Aplicar filtros de busca se necessário
      if (filtros?.search) {
        const searchLower = filtros.search.toLowerCase();
        clientes = clientes.filter((cliente: any) => {
          const razaoSocial = (cliente.razao_social || cliente.nome || '').toLowerCase();
          const cnpj = (cliente.cnpj_limpo || cliente.cnpj || '').replace(/\D/g, '');
          return razaoSocial.includes(searchLower) || cnpj.includes(searchLower);
        });
      }

      // Aplicar filtro por sócio se necessário
      if (filtros?.socio && typeof filtros.socio === 'string' && filtros.socio.trim()) {
        const idsResp = await this.clienteModel.buscarClienteIdsPorSocioNome(filtros.socio.trim());
        if (idsResp.success && idsResp.data && idsResp.data.length > 0) {
          const idsSet = new Set(idsResp.data);
          clientes = clientes.filter((c: any) => idsSet.has(String(c.id)));
        } else {
          clientes = [];
        }
      }

      // Carregar sócios para cada cliente se o campo 'socios' foi solicitado
      const temSocios = campos.includes('socios');
      let maxSocios = 0;
      if (temSocios && clientes.length > 0) {
        for (const cliente of clientes) {
          const sociosResult = await this.clienteModel.listarSocios(cliente.id);
          const socios = sociosResult.success ? (sociosResult.data || []) : [];
          (cliente as any).socios = socios;
          if (socios.length > maxSocios) {
            maxSocios = socios.length;
          }
        }
      }

      // Mapear labels dos campos
      const campoLabels: Record<string, string> = {
        razao_social: 'Razão Social',
        fantasia: 'Nome Fantasia',
        cnpj: 'CNPJ',
        tipo_empresa: 'Tipo',
        email: 'E-mail',
        telefone: 'Telefone',
        receita_email: 'E-mail (Receita)',
        receita_telefone: 'Telefone (Receita)',
        logradouro: 'Logradouro',
        numero: 'Número',
        complemento: 'Complemento',
        bairro: 'Bairro',
        municipio: 'Município',
        uf: 'UF',
        cep: 'CEP',
        endereco: 'Endereço Completo',
        capital_social: 'Capital Social',
        regime_tributario: 'Regime Tributário',
        simples_optante: 'Optante Simples Nacional',
        simples_data_opcao: 'Data Opção Simples',
        simples_data_exclusao: 'Data Exclusão Simples',
        simei_optante: 'Optante SIMEI',
        situacao_cadastral: 'Situação Cadastral',
        data_situacao: 'Data da Situação',
        abertura: 'Data de Abertura',
        porte: 'Porte',
        natureza_juridica: 'Natureza Jurídica',
        atividade_principal_code: 'CNAE Principal',
        atividade_principal_text: 'Atividade Principal',
        atividades_secundarias: 'Atividades Secundárias',
        socios: 'Sócios',
        receita_ws_status: 'Status ReceitaWS',
        receita_ws_consulta_em: 'Última Consulta ReceitaWS',
        receita_ws_ultima_atualizacao: 'Última Atualização ReceitaWS',
      };

      // Verificar se atividades_secundarias está nos campos e processar dinamicamente
      const temAtividadesSecundarias = campos.includes('atividades_secundarias');
      let maxAtividades = 0;
      let todasAtividades: any[] = [];

      if (temAtividadesSecundarias) {
        // Encontrar o número máximo de atividades secundárias entre todos os clientes
        clientes.forEach((cliente: any) => {
          let atividades: any[] = [];
          try {
            const valor = cliente.atividades_secundarias;
            if (typeof valor === 'string') {
              const parsed = JSON.parse(valor);
              if (Array.isArray(parsed)) {
                atividades = parsed;
              }
            } else if (Array.isArray(valor)) {
              atividades = valor;
            }
          } catch {
            // Ignorar erros de parsing
          }
          if (atividades.length > maxAtividades) {
            maxAtividades = atividades.length;
          }
        });
      }

      // Preparar dados para o Excel
      const dadosExportacao = clientes.map((cliente: any) => {
        const row: any = {};
        campos.forEach(campo => {
          // Pular atividades_secundarias e socios aqui - serão processados separadamente
          if (campo === 'atividades_secundarias' || campo === 'socios') {
            return;
          }

          const label = campoLabels[campo] || campo;
          let valor = cliente[campo];

          // Formatação especial para alguns campos
          if (campo === 'cnpj') {
            // Buscar CNPJ em cnpj_limpo primeiro, depois cnpj formatado
            const cnpjLimpo = cliente.cnpj_limpo || (cliente.cnpj ? String(cliente.cnpj).replace(/\D/g, '') : '');
            if (cnpjLimpo && cnpjLimpo.length === 14) {
              valor = cnpjLimpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
            } else if (cliente.cnpj) {
              // Se já estiver formatado, usar diretamente
              valor = String(cliente.cnpj);
            } else {
              valor = '';
            }
          } else if (campo === 'capital_social' && valor) {
            const num = parseFloat(String(valor));
            if (!isNaN(num)) {
              valor = `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }
          } else if (['abertura', 'data_situacao', 'simples_data_opcao', 'simples_data_exclusao'].includes(campo) && valor) {
            try {
              const data = new Date(valor);
              if (!isNaN(data.getTime())) {
                valor = data.toLocaleDateString('pt-BR');
              }
            } catch {
              // Manter valor original se não conseguir formatar
            }
          } else if (['receita_ws_consulta_em', 'receita_ws_ultima_atualizacao'].includes(campo) && valor) {
            try {
              const data = new Date(valor);
              if (!isNaN(data.getTime())) {
                valor = data.toLocaleString('pt-BR');
              }
            } catch {
              // Manter valor original se não conseguir formatar
            }
          } else if (campo === 'simples_optante' || campo === 'simei_optante') {
            if (valor === true || valor === 1 || valor === '1') {
              valor = 'Sim';
            } else if (valor === false || valor === 0 || valor === '0') {
              valor = 'Não';
            }
          }

          row[label] = valor !== null && valor !== undefined ? String(valor) : '';
        });

        // Processar atividades secundárias em colunas separadas
        if (temAtividadesSecundarias) {
          let atividades: any[] = [];
          try {
            const valor = cliente.atividades_secundarias;
            if (typeof valor === 'string') {
              const parsed = JSON.parse(valor);
              if (Array.isArray(parsed)) {
                atividades = parsed;
              }
            } else if (Array.isArray(valor)) {
              atividades = valor;
            }
          } catch {
            // Ignorar erros de parsing
          }

          // Criar colunas dinâmicas para cada atividade
          // Usar índice sequencial como chave para facilitar a busca depois
          for (let i = 0; i < maxAtividades; i++) {
            const atividade = atividades[i];
            const chave = `atividade_secundaria_${i}`;
            if (atividade) {
              row[chave] = `${atividade.code || ''} - ${atividade.text || ''}`;
            } else {
              row[chave] = '';
            }
          }
        }

        // Processar sócios em colunas dinâmicas (Nome, Qual, Participação %)
        if (temSocios) {
          const socios: any[] = (cliente as any).socios || [];
          for (let i = 0; i < maxSocios; i++) {
            const socio = socios[i];
            row[`socio_${i}_nome`] = socio?.nome ?? '';
            row[`socio_${i}_qual`] = socio?.qual ?? '';
            row[`socio_${i}_participacao`] =
              socio?.participacao_percentual != null
                ? `${Number(socio.participacao_percentual).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
                : '';
          }
        }

        return row;
      });

      // Gerar Excel usando ExcelJS
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Clientes');

      // Preparar cabeçalhos (incluindo colunas dinâmicas de atividades e sócios)
      const headers: string[] = [];
      campos.forEach(campo => {
        if (campo === 'atividades_secundarias') {
          for (let i = 0; i < maxAtividades; i++) {
            headers.push('CNAE - Atividade');
          }
        } else if (campo === 'socios') {
          for (let i = 0; i < maxSocios; i++) {
            headers.push('Sócio (Nome)', 'Sócio (Qual)', 'Sócio (Participação %)');
          }
        } else {
          headers.push(campoLabels[campo] || campo);
        }
      });
      worksheet.addRow(headers);

      // Estilizar cabeçalho
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      headerRow.height = 25;

      // Adicionar dados
      dadosExportacao.forEach(row => {
        const rowData: any[] = [];
        campos.forEach(campo => {
          if (campo === 'atividades_secundarias') {
            for (let i = 0; i < maxAtividades; i++) {
              const chave = `atividade_secundaria_${i}`;
              rowData.push(row[chave] || '');
            }
          } else if (campo === 'socios') {
            for (let i = 0; i < maxSocios; i++) {
              rowData.push(row[`socio_${i}_nome`] || '', row[`socio_${i}_qual`] || '', row[`socio_${i}_participacao`] || '');
            }
          } else {
            const label = campoLabels[campo] || campo;
            rowData.push(row[label] || '');
          }
        });
        worksheet.addRow(rowData);
      });

      // Ajustar largura das colunas
      worksheet.columns.forEach((column: any) => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell: any) => {
          const cellLength = cell.value ? cell.value.toString().length : 0;
          if (cellLength > maxLength) {
            maxLength = cellLength;
          }
        });
        column.width = Math.min(Math.max(maxLength + 2, 12), 60);
      });

      // Congelar primeira linha (cabeçalho)
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];

      // Gerar buffer
      const buffer = await workbook.xlsx.writeBuffer();

      // Enviar arquivo
      const filename = `clientes_${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);

    } catch (error) {
      console.error('[ClienteController] Erro ao exportar clientes:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Atualizar capital_social usando dados do PDF
   * POST /api/clientes/atualizar-capital-social
   * Atualiza capital_social diretamente no banco usando dados do PDF
   */
  async atualizarCapitalSocial(req: Request, res: Response): Promise<void> {
    try {
      const { dryRun = false } = req.body;
      
      console.log('[ClienteController] Iniciando atualização de capital_social...');
      
      // Dados do PDF - CNPJ limpo (14 dígitos) -> Capital Social
      const dadosPDF: Record<string, number> = {
        "42081159000128": 1000.00,  // A G A P LTDA
        "13845695000154": 10000.00,  // A.C RAUPP SERVICOS ADMINISTRATIVOS
        "11318082000133": 80000.00,  // ACAI BRASIL INDUSTRIA E COMERCIO DE ALIMENTOS LTDA
        "43340265000141": 1000.00,  // ACBL INFORMACOES LTDA
        "07799121000194": 850000.00,  // ADRIA BRASIL IMPORTACAO E EXPORTACAO LTDA
        "47306185000120": 20000.00,  // AI PORT CONSULTORIA LTDA
        "36578434000110": 20000.00,  // ARAME NOBRE INDUSTRIA E COMERCIO LTDA
        "42532281000173": 200000.00,  // ARAUCARIA SERVICOS LTDA
        "63231837000161": 1000.00,  // ARCANA DESIGN LTDA
        "31332375000182": 20000.00,  // ATENTO . GESTAO EM RISCOS E PRODUTIVIDADE LTDA
        "59160869000146": 50000.00,  // AURORA INFORMATICA COMERCIO IMPORTACAO E EXPORTACAO LTDA
        "41004473000144": 100000.00,  // AYKO HOLDING E PARTICIPACOES LTDA
        "10338682000109": 681509.00,  // VITORIA ON-LINE SERVICOS DE INTERNET LTDA
        "61215139000147": 150000.00,  // VIX LONAS LTDA
        "37297680000167": 10000.00,  // VIXSELL COMERCIO E SERVICO LTDA
        "09104418000113": 100000.00,  // VLA TELECOMUNICACOES LTDA
        "22542368000114": 100000.00,  // VOE TELECOMUNICACOES LTDA
        "30393954000172": 1000000.00,  // WP COMPANY COMERCIO E SERVICOS TECNOLOGIA LTDA
        "34263516000140": 10000.00,  // ZAD COMUNICA LTDA
        "52945020000139": 10000.00,  // ZEGBOX INDUSTRIA E COMERCIO DE EMBALAGENS LTDA
        "59580750000122": 100000.00,  // ZENA LRF TRADING LTDA
        "59267356000139": 5000.00,  // ZENITH GESTAO EMPRESARIAL LTDA
        "24203997000145": 2500.00,  // ZORZAL GESTAO E TECNOLOGIA LTDA
        "07452963000175": 2500.00,  // ZORZAL TECNOLOGIA E GESTAO LTDA
      };
      
      const { executeQuery, executeTransaction } = await import('../config/mysql');
      
      let atualizados = 0;
      let naoEncontrados: string[] = [];
      let jaAtualizados: string[] = [];
      let erros: Array<{ cnpj: string; erro: string }> = [];
      
      console.log(`[ClienteController] Processando ${Object.keys(dadosPDF).length} registros...`);
      
      for (const [cnpjLimpo, capitalSocial] of Object.entries(dadosPDF)) {
        try {
          // Buscar cliente por CNPJ
          const clientes = await executeQuery<any>(
            'SELECT id, razao_social, capital_social FROM clientes WHERE cnpj_limpo = ? LIMIT 1',
            [cnpjLimpo]
          );
          
          if (!clientes || clientes.length === 0) {
            naoEncontrados.push(cnpjLimpo);
            console.log(`⚠️  Cliente não encontrado: ${cnpjLimpo}`);
            continue;
          }
          
          const cliente = clientes[0];
          const capitalAtual = cliente.capital_social ? parseFloat(String(cliente.capital_social)) : 0;
          
          // Verificar se já está atualizado
          if (Math.abs(capitalAtual - capitalSocial) < 0.01) {
            jaAtualizados.push(cnpjLimpo);
            continue;
          }
          
          // Atualizar capital_social
          if (!dryRun) {
            await executeQuery(
              'UPDATE clientes SET capital_social = ? WHERE id = ?',
              [capitalSocial, cliente.id]
            );
          }
          
          atualizados++;
          const capitalFormatado = new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
          }).format(capitalSocial);
          
          const status = dryRun ? '🔍 [DRY-RUN]' : '✅';
          console.log(`${status} [${atualizados}] ${cliente.razao_social.substring(0, 50).padEnd(50)} | CNPJ: ${cnpjLimpo} | Capital: ${capitalFormatado}`);
          
        } catch (error: any) {
          erros.push({ cnpj: cnpjLimpo, erro: error.message });
          console.error(`❌ Erro ao atualizar ${cnpjLimpo}: ${error.message}`);
        }
      }
      
      if (!dryRun) {
        console.log(`\n💾 Alterações commitadas no banco de dados`);
      } else {
        console.log(`\n🔍 DRY-RUN: Nenhuma alteração foi feita`);
      }
      
      const relatorio = {
        atualizados: atualizados,
        jaAtualizados: jaAtualizados.length,
        naoEncontrados: naoEncontrados.length,
        erros: erros.length,
        detalhes: {
          naoEncontrados: naoEncontrados.slice(0, 10),
          erros: erros.slice(0, 5),
        }
      };
      
      res.json({
        success: true,
        message: dryRun 
          ? 'Simulação de atualização concluída' 
          : 'Atualização de capital_social executada com sucesso',
        relatorio,
        dryRun,
      });
      
    } catch (error: any) {
      console.error('[ClienteController] Erro ao atualizar capital_social:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao executar atualização de capital_social',
        message: error.message,
      });
    }
  }

  /**
   * Atualizar participacao_percentual e participacao_valor dos sócios
   * POST /api/clientes/atualizar-socios
   * Atualiza valores e porcentagens dos sócios usando dados do PDF
   */
  async atualizarSocios(req: Request, res: Response): Promise<void> {
    try {
      const { dryRun = false } = req.body;
      
      console.log('[ClienteController] Iniciando atualização de sócios (participação)...');
      
      // Dados dos sócios - mesmos dados do script
      const dadosSocios: Record<string, Array<{
        nome: string;
        cpf?: string;
        participacao_percentual: number;
        participacao_valor: number;
      }>> = {
        "31332375000182": [
          { nome: "ANA PENHA BORGES LOVATO", cpf: "95276653704", participacao_percentual: 100, participacao_valor: 20000.00 }
        ],
        "41697567000146": [
          { nome: "WILLIAN NASCIMENTO LOVATO", cpf: "14706844703", participacao_percentual: 100, participacao_valor: 50000.00 }
        ],
        "03597050000196": [
          { nome: "EDSON DOS SANTOS", cpf: "98049291715", participacao_percentual: 6.33, participacao_valor: 3165.00 },
          { nome: "JOAO CARLOS SCARDUA SAADE", cpf: "48925870797", participacao_percentual: 3.12, participacao_valor: 1560.00 },
          { nome: "HELDER JORGE TELLES DE SA", cpf: "02021319717", participacao_percentual: 6.33, participacao_valor: 3165.00 },
          { nome: "PAULO DOMINGOS VIANNA GAUDIO", cpf: "71998969720", participacao_percentual: 3.12, participacao_valor: 1560.00 },
          { nome: "ANA PAULA BARRETO MONTEIRO ROTHEN", cpf: "05540482727", participacao_percentual: 0.53, participacao_valor: 265.00 },
          { nome: "FERNANDA MONTEIRO LORENZON", cpf: "10597382794", participacao_percentual: 0.53, participacao_valor: 265.00 },
          { nome: "JANE MARGARIDA NUNES BARRETO E MONTEIRO", cpf: "28260597772", participacao_percentual: 1.56, participacao_valor: 780.00 },
          { nome: "JONY JONES MOTTA E MOTTA", cpf: "57743924734", participacao_percentual: 3.14, participacao_valor: 1570.00 },
          { nome: "FRANCIS BARRETO MONTEIRO", cpf: "10710232764", participacao_percentual: 0.53, participacao_valor: 265.00 },
          { nome: "CARLOS ALBERTO BREGENSK", cpf: "39463397787", participacao_percentual: 3.12, participacao_valor: 1560.00 },
          { nome: "VICTOR AFFONSO BIASUTTI PIGNATON", cpf: "07434671750", participacao_percentual: 3.12, participacao_valor: 1560.00 },
          { nome: "JOSE GERALDO MONTEIRO DE MATOS", cpf: "47907800749", participacao_percentual: 3.12, participacao_valor: 1560.00 },
          { nome: "HELOISA HELENA MANNATO COUTINHO", cpf: "41848020791", participacao_percentual: 12.33, participacao_valor: 6165.00 },
          { nome: "PEDRO ABAURRE DE VASCONCELLOS", cpf: "12205154770", participacao_percentual: 3.12, participacao_valor: 1560.00 },
          { nome: "IDELZE MARIA VIEIRA PINTO", cpf: "00296889733", participacao_percentual: 3.12, participacao_valor: 1560.00 },
          { nome: "FABRICIO HENRIQUE SANTOS SILVA", cpf: "97960381704", participacao_percentual: 8.33, participacao_valor: 4165.00 },
          { nome: "RICARDO GONCALVES DE ASSIS", cpf: "57498768704", participacao_percentual: 3.13, participacao_valor: 1565.00 },
          { nome: "JOCIEL MOREIRA HEMERLY", cpf: "57747393768", participacao_percentual: 3.14, participacao_valor: 1570.00 },
          { nome: "ALBERTO DE SOUZA", cpf: "47907916704", participacao_percentual: 3.12, participacao_valor: 1560.00 },
          { nome: "CLEONICE TEREZINHA TREVELIN ROSSETTO", cpf: "00514021730", participacao_percentual: 3.12, participacao_valor: 1560.00 },
          { nome: "JUAREZ JOSE HENRIQUE CAMPOS", cpf: "47475447715", participacao_percentual: 3.12, participacao_valor: 1560.00 },
          { nome: "JOSE CESAR FELIPE", cpf: "45068259772", participacao_percentual: 3.12, participacao_valor: 1560.00 },
          { nome: "SONIA MARIA CARDOSO", cpf: "24971316787", participacao_percentual: 3.12, participacao_valor: 1560.00 },
          { nome: "SILVIO PANTELEAO", cpf: "02276528788", participacao_percentual: 8.35, participacao_valor: 4175.00 },
          { nome: "JOAO CARLOS CARVALHO DOS SANTOS", cpf: "98897420710", participacao_percentual: 8.33, participacao_valor: 4165.00 }
        ],
        "39811708000168": [
          { nome: "SILVESTRE FRITTOLI COUTINHO FILHO", cpf: "26558777568", participacao_percentual: 2.40, participacao_valor: 9966.55 },
          { nome: "HERMOLAO VALADAO COUTINHO", cpf: "15002322549", participacao_percentual: 0.60, participacao_valor: 2491.64 },
          { nome: "MARIA TERESA VALADAO COUTINHO", cpf: "10210296534", participacao_percentual: 1.00, participacao_valor: 4152.73 },
          { nome: "SILVESTRE FRITTOLI COUTINHO", cpf: "03406920578", participacao_percentual: 1.00, participacao_valor: 4152.73 },
          { nome: "CARLOS VALADAO COUTINHO", cpf: "33699267504", participacao_percentual: 0.60, participacao_valor: 2491.64 },
          { nome: "ROBERTO ANTONIO DALA BERNARDINA", cpf: "01078623520", participacao_percentual: 0.60, participacao_valor: 2491.64 },
          { nome: "DISTRIBUIDORA SILVESTRE LIMITADA", participacao_percentual: 93.80, participacao_valor: 389525.81 }
        ],
        "00956216000125": [
          { nome: "MARCUS TULLIUS BATALHA BARROCA", cpf: "45214964668", participacao_percentual: 50.00, participacao_valor: 1000.00 },
          { nome: "VALERIA MELO BARROCA", cpf: "85610003687", participacao_percentual: 50.00, participacao_valor: 1000.00 }
        ],
        "10338682000109": [
          { nome: "AYKO TECNOLOGIA LTDA", participacao_percentual: 100.00, participacao_valor: 681509.00 },
          { nome: "GIUSEPPE KENJI NAGATANI FEITOZA", cpf: "03458486755", participacao_percentual: 0.00, participacao_valor: 0.00 }
        ]
      };
      
      const { executeQuery } = await import('../config/mysql');
      
      // Funções auxiliares
      const normalizarNome = (nome: string): string => {
        return nome
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase()
          .trim();
      };
      
      const limparCpfCnpj = (cpfCnpj: string | undefined): string => {
        if (!cpfCnpj) return '';
        return String(cpfCnpj).replace(/\D/g, '');
      };
      
      let totalAtualizados = 0;
      let totalNaoEncontrados = 0;
      let totalErros = 0;
      const erros: Array<{ cnpj: string; socio: string; erro: string }> = [];
      
      console.log(`[ClienteController] Processando ${Object.keys(dadosSocios).length} empresas...`);
      
      for (const [cnpjLimpo, socios] of Object.entries(dadosSocios)) {
        try {
          // Buscar cliente por CNPJ
          const clientes = await executeQuery<any>(
            'SELECT id, razao_social FROM clientes WHERE cnpj_limpo = ? LIMIT 1',
            [cnpjLimpo]
          );
          
          if (!clientes || clientes.length === 0) {
            totalNaoEncontrados++;
            continue;
          }
          
          const cliente = clientes[0];
          
          // Buscar sócios existentes do cliente
          const sociosExistentes = await executeQuery<any>(
            'SELECT id, nome, cpf, participacao_percentual, participacao_valor FROM clientes_socios WHERE cliente_id = ?',
            [cliente.id]
          );
          
          if (!sociosExistentes || sociosExistentes.length === 0) {
            totalNaoEncontrados++;
            continue;
          }
          
          // Para cada sócio nos dados fornecidos, tentar encontrar e atualizar
          for (const socioDados of socios) {
            try {
              const nomeNormalizado = normalizarNome(socioDados.nome);
              const cpfLimpo = limparCpfCnpj(socioDados.cpf);
              
              // Tentar encontrar sócio por nome (normalizado) ou CPF
              let socioEncontrado = sociosExistentes.find((s: any) => {
                const nomeExistenteNormalizado = normalizarNome(s.nome || '');
                const cpfExistente = limparCpfCnpj(s.cpf);
                
                // Match por CPF (se ambos tiverem)
                if (cpfLimpo && cpfExistente && cpfLimpo === cpfExistente) {
                  return true;
                }
                
                // Match por nome normalizado
                if (nomeNormalizado === nomeExistenteNormalizado) {
                  return true;
                }
                
                // Match parcial por palavras-chave
                const palavrasDados = nomeNormalizado.split(/\s+/).filter(p => p.length > 2);
                const palavrasExistente = nomeExistenteNormalizado.split(/\s+/).filter(p => p.length > 2);
                if (palavrasDados.length > 0 && palavrasExistente.length > 0) {
                  const todasPalavrasPresentes = palavrasDados.every(p => 
                    palavrasExistente.some(pe => pe.includes(p) || p.includes(pe))
                  );
                  if (todasPalavrasPresentes && palavrasDados.length >= 2) {
                    return true;
                  }
                }
                
                return false;
              });
              
              if (socioEncontrado) {
                // Verificar se precisa atualizar
                const percentualAtual = socioEncontrado.participacao_percentual ? parseFloat(String(socioEncontrado.participacao_percentual)) : null;
                const valorAtual = socioEncontrado.participacao_valor ? parseFloat(String(socioEncontrado.participacao_valor)) : null;
                
                const precisaAtualizar = 
                  Math.abs((percentualAtual || 0) - socioDados.participacao_percentual) > 0.01 ||
                  Math.abs((valorAtual || 0) - socioDados.participacao_valor) > 0.01;
                
                if (!precisaAtualizar) {
                  continue;
                }
                
                // Atualizar sócio
                if (!dryRun) {
                  await executeQuery(
                    'UPDATE clientes_socios SET participacao_percentual = ?, participacao_valor = ? WHERE id = ?',
                    [socioDados.participacao_percentual, socioDados.participacao_valor, socioEncontrado.id]
                  );
                }
                
                totalAtualizados++;
              } else {
                totalNaoEncontrados++;
              }
            } catch (error: any) {
              totalErros++;
              erros.push({ cnpj: cnpjLimpo, socio: socioDados.nome, erro: error.message });
            }
          }
        } catch (error: any) {
          totalErros++;
          erros.push({ cnpj: cnpjLimpo, socio: 'N/A', erro: error.message });
        }
      }
      
      const relatorio = {
        totalProcessados: Object.keys(dadosSocios).length,
        atualizados: totalAtualizados,
        naoEncontrados: totalNaoEncontrados,
        erros: totalErros,
        detalhesErros: erros,
        dryRun: dryRun,
      };

      res.json({
        success: true,
        message: dryRun 
          ? 'Simulação de atualização de sócios concluída'
          : 'Atualização de sócios executada com sucesso',
        relatorio,
      });

    } catch (error: any) {
      console.error('[ClienteController] Erro ao atualizar sócios:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao executar atualização de sócios',
        message: error.message,
      });
    }
  }

  /**
   * Recalcular valores de participação para todos os clientes divergentes
   * POST /api/clientes/recalcular-valores-divergentes
   * Calcula participacao_valor = (capital_social * participacao_percentual) / 100
   * para todos os sócios que têm porcentagem mas não têm valor calculado
   */
  async recalcularValoresDivergentes(req: Request, res: Response): Promise<void> {
    try {
      console.log('[ClienteController] Iniciando recálculo de valores para clientes divergentes...');
      
      const { executeQuery } = await import('../config/mysql');
      
      // Buscar todos os clientes que têm capital_social e sócios com participacao_percentual
      const clientesComCapital = await executeQuery<any>(
        `SELECT DISTINCT c.id, c.razao_social, c.capital_social, c.cnpj_limpo
         FROM clientes c
         INNER JOIN clientes_socios cs ON cs.cliente_id = c.id
         WHERE c.capital_social IS NOT NULL 
           AND c.capital_social > 0
           AND cs.participacao_percentual IS NOT NULL
           AND cs.participacao_percentual > 0
         ORDER BY c.razao_social`
      );
      
      if (!clientesComCapital || clientesComCapital.length === 0) {
        res.json({
          success: true,
          message: 'Nenhum cliente encontrado com capital social e sócios com porcentagem',
          relatorio: {
            totalProcessados: 0,
            atualizados: 0,
            erros: 0
          }
        });
        return;
      }
      
      let totalAtualizados = 0;
      let totalErros = 0;
      const erros: Array<{ cliente: string; erro: string }> = [];
      
      console.log(`[ClienteController] Processando ${clientesComCapital.length} clientes...`);
      
      for (const cliente of clientesComCapital) {
        try {
          // Normalizar capital social
          let capitalSocialNum = 0;
          if (cliente.capital_social) {
            if (typeof cliente.capital_social === 'number') {
              capitalSocialNum = isNaN(cliente.capital_social) ? 0 : cliente.capital_social;
            } else {
              const str = String(cliente.capital_social).trim();
              const temVirgulaDecimal = /,\d{1,2}$/.test(str);
              const strLimpa = temVirgulaDecimal
                ? str.replace(/\./g, '').replace(',', '.')
                : str.replace(/[^\d.-]/g, '');
              capitalSocialNum = parseFloat(strLimpa) || 0;
            }
          }
          
          if (capitalSocialNum === 0) {
            continue; // Pular se capital social for zero
          }
          
          // Buscar sócios deste cliente que têm porcentagem
          const socios = await executeQuery<any>(
            `SELECT id, nome, participacao_percentual, participacao_valor
             FROM clientes_socios
             WHERE cliente_id = ? 
               AND participacao_percentual IS NOT NULL
               AND participacao_percentual > 0`,
            [cliente.id]
          );
          
          if (!socios || socios.length === 0) {
            continue;
          }
          
          // Recalcular valores para cada sócio
          for (const socio of socios) {
            try {
              const percentual = parseFloat(String(socio.participacao_percentual));
              if (isNaN(percentual) || percentual <= 0) {
                continue;
              }
              
              // Calcular novo valor: Capital Social × Porcentagem / 100
              // Arredondar para 2 casas decimais para evitar problemas de precisão
              const novoValor = Math.round((capitalSocialNum * percentual) / 100 * 100) / 100;
              
              // Verificar se precisa atualizar
              const valorAtual = socio.participacao_valor ? parseFloat(String(socio.participacao_valor)) : null;
              const precisaAtualizar = valorAtual === null || Math.abs(valorAtual - novoValor) > 0.01;
              
              if (precisaAtualizar) {
                await executeQuery(
                  'UPDATE clientes_socios SET participacao_valor = ? WHERE id = ?',
                  [novoValor, socio.id]
                );
                totalAtualizados++;
                console.log(`[ClienteController] ✅ Atualizado sócio ${socio.nome}: ${percentual}% de R$ ${capitalSocialNum.toFixed(2)} = R$ ${novoValor.toFixed(2)}`);
              }
            } catch (error: any) {
              totalErros++;
              erros.push({ cliente: cliente.razao_social, erro: `Sócio ${socio.nome}: ${error.message}` });
            }
          }
        } catch (error: any) {
          totalErros++;
          erros.push({ cliente: cliente.razao_social || cliente.cnpj_limpo, erro: error.message });
        }
      }
      
      const relatorio = {
        totalProcessados: clientesComCapital.length,
        atualizados: totalAtualizados,
        erros: totalErros,
        detalhesErros: erros.slice(0, 10), // Limitar a 10 erros no relatório
      };

      res.json({
        success: true,
        message: `Recálculo concluído! ${totalAtualizados} valores de participação atualizados.`,
        relatorio,
      });

    } catch (error: any) {
      console.error('[ClienteController] Erro ao recalcular valores divergentes:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao executar recálculo de valores',
        message: error.message,
      });
    }
  }
}

