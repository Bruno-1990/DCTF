import { Request, Response } from 'express';
import { BancoHorasService } from '../services/BancoHorasService';
import * as fs from 'fs';
import ExcelJS from 'exceljs';

export class BancoHorasController {
  private bancoHorasService: BancoHorasService;

  constructor() {
    this.bancoHorasService = new BancoHorasService();
  }


  /**
   * Gera relatório de banco de horas
   * POST /api/sci/banco-horas/gerar
   */
  async gerarRelatorio(req: Request, res: Response): Promise<void> {
    try {
      const { cnpj, dataInicial, dataFinal } = req.body;

      // Validações
      if (!cnpj) {
        res.status(400).json({ error: 'CNPJ é obrigatório' });
        return;
      }

      if (!dataInicial) {
        res.status(400).json({ error: 'Data Inicial é obrigatória' });
        return;
      }

      if (!dataFinal) {
        res.status(400).json({ error: 'Data Final é obrigatória' });
        return;
      }

      // Validar formato de data
      const dataInicialDate = new Date(dataInicial);
      const dataFinalDate = new Date(dataFinal);

      if (isNaN(dataInicialDate.getTime())) {
        res.status(400).json({ error: 'Data Inicial inválida' });
        return;
      }

      if (isNaN(dataFinalDate.getTime())) {
        res.status(400).json({ error: 'Data Final inválida' });
        return;
      }

      if (dataFinalDate < dataInicialDate) {
        res.status(400).json({ error: 'Data Final deve ser maior ou igual à Data Inicial' });
        return;
      }

      // Limpar CNPJ (apenas números)
      const cnpjLimpo = cnpj.replace(/\D/g, '');

      if (cnpjLimpo.length !== 14) {
        res.status(400).json({ error: 'CNPJ deve ter 14 dígitos' });
        return;
      }

      // Buscar razão social da empresa (opcional, pode ser adicionado depois)
      // Por enquanto, vamos gerar sem razão social

      // Gerar relatório (executa em background)
      const resultado = await this.bancoHorasService.gerarRelatorio({
        cnpj: cnpjLimpo,
        dataInicial,
        dataFinal,
      });

      // Se houve erro imediato (ex: validação), retornar erro
      if (!resultado.success && !resultado.relatorioId) {
        res.status(500).json({
          error: resultado.error || 'Erro ao iniciar geração do relatório',
        });
        return;
      }

      // Se o relatório foi criado mas ainda está gerando, retornar o ID
      if (resultado.relatorioId && !resultado.filePath) {
        res.json({
          success: true,
          relatorioId: resultado.relatorioId,
          status: 'gerando',
          message: 'Geração do relatório iniciada. Acompanhe o progresso no histórico.',
        });
        return;
      }

      // Se o relatório já foi gerado (caso raro, mas possível), retornar o arquivo
      if (resultado.success && resultado.filePath) {
        try {
          const fileBuffer = await this.bancoHorasService.lerArquivoGerado(resultado.filePath);

          // Configurar headers para download
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="Banco_Horas_${cnpjLimpo}_${dataInicial}_${dataFinal}.xlsx"`
          );

          // Enviar arquivo
          res.send(fileBuffer);
        } catch (error: any) {
          // Se não conseguir ler o arquivo, retornar o ID para acompanhamento
          res.json({
            success: true,
            relatorioId: resultado.relatorioId,
            status: 'gerando',
            message: 'Geração do relatório em andamento. Acompanhe o progresso no histórico.',
          });
        }
        return;
      }

      // Fallback: retornar erro
      res.status(500).json({
        error: resultado.error || 'Erro desconhecido ao gerar relatório',
      });
    } catch (error: any) {
      console.error('Erro no controller de banco de horas:', error);
      res.status(500).json({
        error: error.message || 'Erro interno ao gerar relatório',
      });
    }
  }

  /**
   * Stream de logs em tempo real via SSE
   * GET /api/sci/banco-horas/gerar/:relatorioId/logs
   */
  async streamLogs(req: Request, res: Response): Promise<void> {
    try {
      const { relatorioId } = req.params;
      console.log(`[BancoHoras] SSE conectado para relatório ID: ${relatorioId}`);
      
      // Configurar headers para SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Desabilitar buffering do nginx
      
      // Enviar heartbeat para manter conexão viva
      const heartbeat = setInterval(() => {
        try {
          res.write(': heartbeat\n\n');
        } catch (err) {
          // Cliente desconectou
          clearInterval(heartbeat);
        }
      }, 30000); // A cada 30 segundos
      
      // Função para verificar e enviar status
      const verificarEEnviarStatus = async (): Promise<boolean> => {
        try {
          const relatorio = await this.bancoHorasService.buscarRelatorioPorId(relatorioId);
          
          if (!relatorio) {
            res.write(`data: ${JSON.stringify({ type: 'error', message: 'Relatório não encontrado' })}\n\n`);
            return false;
          }
          
          console.log(`[BancoHoras] Status do relatório ${relatorioId}: ${relatorio.status}`);
          
          // Verificar se está em "gerando" há muito tempo (mais de 35 minutos)
          // Isso detecta possíveis travamentos mesmo com timeout
          if (relatorio.status === 'gerando' && relatorio.createdAt) {
            let dataCriacao: Date | null = null;
            if (typeof relatorio.createdAt === 'string') {
              dataCriacao = new Date(relatorio.createdAt);
            } else if (relatorio.createdAt instanceof Date) {
              dataCriacao = relatorio.createdAt;
            }
            
            if (dataCriacao && !isNaN(dataCriacao.getTime())) {
              const minutosDesdeCriacao = (new Date().getTime() - dataCriacao.getTime()) / (60 * 1000);
              if (minutosDesdeCriacao > 35) {
                // Possível timeout - verificar se arquivo foi gerado mesmo assim
                const arquivoExiste = relatorio.arquivoPath && relatorio.arquivoPath !== '' && fs.existsSync(relatorio.arquivoPath);
                if (arquivoExiste) {
                  // Arquivo existe mas status está errado - corrigir
                  console.log(`[BancoHoras] Relatório ${relatorioId} tem arquivo mas está em 'gerando' há ${minutosDesdeCriacao.toFixed(1)} min, corrigindo status para 'concluido'`);
                  await this.bancoHorasService.relatorioModel.updateStatus(relatorioId, 'concluido');
                  // Continuar para enviar evento de conclusão abaixo (não retornar false)
                } else {
                  // Realmente não tem arquivo - marcar como erro
                  console.warn(`[BancoHoras] Relatório ${relatorioId} está em 'gerando' há ${minutosDesdeCriacao.toFixed(1)} minutos sem arquivo - timeout`);
                  await this.bancoHorasService.relatorioModel.updateStatus(
                    relatorioId,
                    'erro',
                    'Timeout: O relatório está demorando muito para ser gerado. Tente novamente ou verifique se o servidor está sobrecarregado.'
                  );
                  res.write(`data: ${JSON.stringify({ 
                    type: 'error',
                    status: 'erro',
                    message: 'Timeout: O relatório está demorando muito para ser gerado. Tente novamente ou verifique se o servidor está sobrecarregado.'
                  })}\n\n`);
                  return false;
                }
              }
            }
          }
          
          // Se já está concluído, enviar status final
          if (relatorio.status === 'concluido') {
            const downloadUrl = `/api/sci/banco-horas/historico/${relatorioId}/download`;
            const downloadFormatadoUrl = `/api/sci/banco-horas/historico/${relatorioId}/download-formatado`;
            
            console.log(`[BancoHoras] Enviando evento 'complete' para relatório ${relatorioId}`);
            res.write(`data: ${JSON.stringify({ 
              type: 'complete',
              relatorioId,
              status: 'concluido',
              downloadUrl,
              downloadFormatadoUrl,
              nomeArquivo: relatorio.nomeArquivo
            })}\n\n`);
            return false; // Finalizar
          }
          
          // Se está em erro, verificar se arquivo existe antes de enviar erro
          // Se arquivo existe, corrigir status e enviar como concluido
          if (relatorio.status === 'erro') {
            const arquivoExiste = relatorio.arquivoPath && relatorio.arquivoPath !== '' && fs.existsSync(relatorio.arquivoPath);
            
            if (arquivoExiste) {
              // Arquivo existe mas status está como erro - corrigir
              console.log(`[BancoHoras] Relatório ${relatorioId} tem arquivo mas status é 'erro', corrigindo...`);
              await this.bancoHorasService.relatorioModel.updateStatus(relatorioId, 'concluido');
              
              // Enviar como concluido
              const downloadUrl = `/api/sci/banco-horas/download/${relatorioId}`;
              const downloadFormatadoUrl = relatorio.arquivoFormatadoPath 
                ? `/api/sci/banco-horas/download-formatado/${relatorioId}`
                : null;
              
              console.log(`[BancoHoras] Enviando evento 'complete' para relatório ${relatorioId} (corrigido)`);
              res.write(`data: ${JSON.stringify({ 
                type: 'complete',
                relatorioId,
                status: 'concluido',
                downloadUrl,
                downloadFormatadoUrl,
                nomeArquivo: relatorio.nomeArquivo,
                arquivoPath: relatorio.arquivoPath,
                arquivoFormatadoPath: relatorio.arquivoFormatadoPath
              })}\n\n`);
              return false; // Finalizar
            } else {
              // Realmente está em erro e não tem arquivo
              // MAS: verificar se foi criado recentemente (menos de 5 minutos)
              // Se sim, pode ser que o arquivo ainda esteja sendo gerado
              let deveAguardar = false;
              if (relatorio.createdAt) {
                let dataCriacao: Date | null = null;
                if (typeof relatorio.createdAt === 'string') {
                  dataCriacao = new Date(relatorio.createdAt);
                } else if (relatorio.createdAt instanceof Date) {
                  dataCriacao = relatorio.createdAt;
                }
                
                if (dataCriacao && !isNaN(dataCriacao.getTime())) {
                  const minutosDesdeCriacao = (new Date().getTime() - dataCriacao.getTime()) / (60 * 1000);
                  // Se foi criado há menos de 5 minutos, pode estar ainda gerando
                  if (minutosDesdeCriacao >= 0 && minutosDesdeCriacao < 5) {
                    console.log(`[BancoHoras] Relatório ${relatorioId} marcado como erro mas foi criado há apenas ${minutosDesdeCriacao.toFixed(1)} min, aguardando...`);
                    deveAguardar = true;
                  }
                }
              }
              
              if (deveAguardar) {
                // Continuar monitorando em vez de enviar erro
                return true;
              }
              
              // Realmente está em erro e não foi criado recentemente
              console.log(`[BancoHoras] Enviando evento 'error' para relatório ${relatorioId}`);
              res.write(`data: ${JSON.stringify({ 
                type: 'error',
                status: 'erro',
                message: relatorio.erro || 'Erro ao gerar relatório'
              })}\n\n`);
              return false; // Finalizar
            }
          }
          
          // Se ainda está gerando, enviar status atual
          if (relatorio.status === 'gerando') {
            res.write(`data: ${JSON.stringify({ 
              type: 'status', 
              status: relatorio.status,
              progress: 'processando'
            })}\n\n`);
            return true; // Continuar monitorando
          }
          
          return true; // Continuar por padrão
        } catch (error: any) {
          console.error('[BancoHoras] Erro ao verificar status:', error);
          res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            message: 'Erro ao verificar status do relatório'
          })}\n\n`);
          return false;
        }
      };
      
      // Verificar status imediatamente
      let continuar = await verificarEEnviarStatus();
      
      if (!continuar) {
        // Já finalizou (concluido ou erro)
        clearInterval(heartbeat);
        res.end();
        return;
      }
      
      // Enviar status inicial
      res.write(`data: ${JSON.stringify({ 
        type: 'status', 
        status: 'gerando',
        progress: 'iniciando'
      })}\n\n`);
      
      // Monitorar status do relatório e enviar atualizações
      const monitorInterval = setInterval(async () => {
        continuar = await verificarEEnviarStatus();
        
        if (!continuar) {
          // Finalizar monitoramento
          clearInterval(monitorInterval);
          clearInterval(heartbeat);
          try {
            res.end();
          } catch (err) {
            // Cliente já desconectou
          }
        }
      }, 1000); // Verificar a cada 1 segundo (mais frequente)
      
      // Limpar intervalos quando cliente desconectar
      req.on('close', () => {
        console.log(`[BancoHoras] Cliente desconectou do SSE para relatório ${relatorioId}`);
        clearInterval(monitorInterval);
        clearInterval(heartbeat);
        try {
          res.end();
        } catch (err) {
          // Já estava fechado
        }
      });
    } catch (error: any) {
      console.error('[BancoHoras] Erro no stream de logs:', error);
      try {
        res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
        res.end();
      } catch (err) {
        // Cliente já desconectou
      }
    }
  }

  /**
   * Baixa arquivo de relatório por ID (endpoint simplificado)
   * GET /api/sci/banco-horas/download/:id
   */
  async downloadArquivo(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const relatorio = await this.bancoHorasService.buscarRelatorioPorId(id);

      if (!relatorio || !relatorio.arquivoPath || !fs.existsSync(relatorio.arquivoPath)) {
        res.status(404).setHeader('Content-Type', 'application/json').json({ 
          success: false, 
          error: 'Arquivo não encontrado' 
        });
        return;
      }

      const fileBuffer = fs.readFileSync(relatorio.arquivoPath);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${relatorio.nomeArquivo}"`);
      res.send(fileBuffer);
    } catch (error: any) {
      console.error('Erro ao baixar arquivo:', error);
      res.status(500).setHeader('Content-Type', 'application/json').json({
        success: false,
        error: error.message || 'Erro ao baixar arquivo',
      });
    }
  }

  /**
   * Baixa arquivo formatado por ID (endpoint simplificado)
   * GET /api/sci/banco-horas/download-formatado/:id
   */
  async downloadArquivoFormatado(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const relatorio = await this.bancoHorasService.buscarRelatorioPorId(id);

      if (!relatorio) {
        res.status(404).setHeader('Content-Type', 'application/json').json({ 
          success: false, 
          error: 'Relatório não encontrado' 
        });
        return;
      }

      const arquivoFormatadoPath = relatorio.arquivoFormatadoPath || 
        (relatorio.arquivoPath ? relatorio.arquivoPath.replace('.xlsx', '_FORMATADO.xlsx') : null);

      if (!arquivoFormatadoPath || !fs.existsSync(arquivoFormatadoPath)) {
        res.status(404).setHeader('Content-Type', 'application/json').json({ 
          success: false, 
          error: 'Arquivo formatado não encontrado' 
        });
        return;
      }

      const fileBuffer = fs.readFileSync(arquivoFormatadoPath);
      const nomeArquivo = relatorio.arquivoFormatadoNome || 
        (relatorio.nomeArquivo ? relatorio.nomeArquivo.replace('.xlsx', '_FORMATADO.xlsx') : 'Banco_Horas_FORMATADO.xlsx');

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
      res.send(fileBuffer);
    } catch (error: any) {
      console.error('Erro ao baixar arquivo formatado:', error);
      res.status(500).setHeader('Content-Type', 'application/json').json({
        success: false,
        error: error.message || 'Erro ao baixar arquivo formatado',
      });
    }
  }

  /**
   * Converte formato HH:MM para horas decimais (ex: '220:30' -> 220.5)
   */
  private converterHorasParaDecimal(horasStr: string): number {
    if (!horasStr || horasStr === '0:00' || horasStr === '') {
      return 0.0;
    }
    
    try {
      const partes = horasStr.toString().split(':');
      if (partes.length !== 2) {
        return 0.0;
      }
      const horas = parseInt(partes[0], 10);
      const minutos = parseInt(partes[1], 10);
      return horas + (minutos / 60.0);
    } catch {
      return 0.0;
    }
  }

  /**
   * Converte horas decimais para formato HH:MM (ex: 220.5 -> '220:30')
   */
  private formatarHoras(valor: number): string {
    if (!valor || valor === 0) {
      return '0:00';
    }
    
    const horas = Math.floor(valor);
    const minutos = Math.round((valor - horas) * 60);
    return `${horas}:${minutos.toString().padStart(2, '0')}`;
  }

  /**
   * Formata planilha Excel enviada pelo frontend
   * Consolida Horas Trabalhadas + Horas Extras em uma única coluna por mês
   * POST /api/sci/banco-horas/formatar
   */
  async formatarPlanilha(req: Request, res: Response): Promise<void> {
    try {
      const file = req.file as Express.Multer.File;
      if (!file) {
        res.status(400).json({ error: 'Nenhum arquivo enviado' });
        return;
      }

      // Ler planilha do buffer
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file.buffer);

      const worksheet = workbook.getWorksheet(1); // Primeira aba

      if (!worksheet) {
        res.status(400).json({ error: 'Planilha vazia' });
        return;
      }

      const headerRow = worksheet.getRow(1);
      const totalRows = worksheet.rowCount;
      
      // Identificar colunas base (que não são horas trabalhadas/extras)
      const colunasBase = [
        'cnpj_empresa', 'razao_social_empresa', 'codigo_centro_custo',
        'descricao_centro_custo', 'matricula_colaborador', 'nome_colaborador',
        'carga_horaria_regime'
      ];

      // Mapear nomes de colunas para índices
      const colunasMap: { [key: string]: number } = {};
      const colunasHorasTrabalhadas: { [mes: string]: number } = {};
      const colunasHorasExtras: { [mes: string]: number } = {};
      const mesesDetectados: string[] = [];

      headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const headerValue = cell.value?.toString().toLowerCase() || '';
        colunasMap[headerValue] = colNumber;

        // Detectar colunas de horas trabalhadas e extras
        if (headerValue.startsWith('horas_trabalhadas_')) {
          const mes = headerValue.replace('horas_trabalhadas_', '').toUpperCase();
          colunasHorasTrabalhadas[mes] = colNumber;
          if (!mesesDetectados.includes(mes)) {
            mesesDetectados.push(mes);
          }
        } else if (headerValue.startsWith('horas_extras_')) {
          const mes = headerValue.replace('horas_extras_', '').toUpperCase();
          colunasHorasExtras[mes] = colNumber;
        }
      });

      // Ordenar meses detectados
      const mesesOrdem = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 
                          'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
      mesesDetectados.sort((a, b) => {
        const indexA = mesesOrdem.indexOf(a);
        const indexB = mesesOrdem.indexOf(b);
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
      });

      // Criar novo workbook com estrutura consolidada
      const novoWorkbook = new ExcelJS.Workbook();
      const novaWorksheet = novoWorkbook.addWorksheet('Planilha Formatada');

      // Definir cabeçalhos
      const novosCabecalhos = [
        'CNPJ',
        'Razão Social',
        'Cód. Centro Custo',
        'Centro de Custo',
        'Matrícula',
        'Nome do Colaborador',
        'Carga Horária',
        ...mesesDetectados,
        'Total de Horas'
      ];

      // Escrever cabeçalhos
      const novaHeaderRow = novaWorksheet.getRow(1);
      novosCabecalhos.forEach((header, index) => {
        novaHeaderRow.getCell(index + 1).value = header;
      });

      // Processar cada linha de dados
      for (let rowNum = 2; rowNum <= totalRows; rowNum++) {
        const row = worksheet.getRow(rowNum);
        const novaRow = novaWorksheet.addRow([]);

        // Copiar colunas base
        let colIndex = 1;
        if (colunasMap['cnpj_empresa']) {
          novaRow.getCell(colIndex++).value = row.getCell(colunasMap['cnpj_empresa']).value;
        }
        if (colunasMap['razao_social_empresa']) {
          novaRow.getCell(colIndex++).value = row.getCell(colunasMap['razao_social_empresa']).value;
        }
        if (colunasMap['codigo_centro_custo']) {
          novaRow.getCell(colIndex++).value = row.getCell(colunasMap['codigo_centro_custo']).value;
        }
        if (colunasMap['descricao_centro_custo']) {
          novaRow.getCell(colIndex++).value = row.getCell(colunasMap['descricao_centro_custo']).value;
        }
        if (colunasMap['matricula_colaborador']) {
          novaRow.getCell(colIndex++).value = row.getCell(colunasMap['matricula_colaborador']).value;
        }
        if (colunasMap['nome_colaborador']) {
          novaRow.getCell(colIndex++).value = row.getCell(colunasMap['nome_colaborador']).value;
        }
        if (colunasMap['carga_horaria_regime']) {
          novaRow.getCell(colIndex++).value = row.getCell(colunasMap['carga_horaria_regime']).value;
        }

        // Consolidar horas por mês (Trabalhadas + Extras)
        let totalGeralDecimal = 0.0;

        mesesDetectados.forEach((mes) => {
          let horasTrabalhadasDecimal = 0.0;
          let horasExtrasDecimal = 0.0;

          // Obter horas trabalhadas
          if (colunasHorasTrabalhadas[mes]) {
            const horasTrabalhadasCell = row.getCell(colunasHorasTrabalhadas[mes]);
            const horasTrabalhadasStr = horasTrabalhadasCell.value?.toString() || '0:00';
            horasTrabalhadasDecimal = this.converterHorasParaDecimal(horasTrabalhadasStr);
          }

          // Obter horas extras
          if (colunasHorasExtras[mes]) {
            const horasExtrasCell = row.getCell(colunasHorasExtras[mes]);
            const horasExtrasStr = horasExtrasCell.value?.toString() || '0:00';
            horasExtrasDecimal = this.converterHorasParaDecimal(horasExtrasStr);
          }

          // Somar e adicionar à linha
          const totalMesDecimal = horasTrabalhadasDecimal + horasExtrasDecimal;
          totalGeralDecimal += totalMesDecimal;
          novaRow.getCell(colIndex++).value = this.formatarHoras(totalMesDecimal);
        });

        // Adicionar total de horas
        novaRow.getCell(colIndex).value = this.formatarHoras(totalGeralDecimal);
      }

      // Aplicar formatação
      const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 
                     'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

      // Formatar cabeçalho
      const novaHeaderRowFormat = novaWorksheet.getRow(1);
      novaHeaderRowFormat.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      novaHeaderRowFormat.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF366092' }
      };
      novaHeaderRowFormat.height = 25;
      
      // Centralizar TODAS as células do cabeçalho
      novaHeaderRowFormat.eachCell((cell) => {
        cell.alignment = { 
          horizontal: 'center', 
          vertical: 'middle', 
          wrapText: true 
        };
      });

      // Verificar quais colunas têm conteúdo (para ocultar vazias)
      const colunasComConteudo: Set<number> = new Set();
      novaWorksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Pular cabeçalho
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const value = cell.value;
          if (value !== null && value !== undefined && value !== '') {
            colunasComConteudo.add(colNumber);
          }
        });
      });

      // Ocultar colunas vazias (exceto as colunas base que sempre devem aparecer)
      const colunasBaseCount = 7; // CNPJ, Razão Social, Cód. Centro Custo, Centro de Custo, Matrícula, Nome, Carga Horária
      novaWorksheet.columns.forEach((column, index) => {
        const colNumber = index + 1;
        // Sempre mostrar colunas base e coluna Total de Horas
        const headerValue = novaHeaderRowFormat.getCell(colNumber).value?.toString() || '';
        if (colNumber <= colunasBaseCount || headerValue === 'Total de Horas') {
          column.hidden = false;
        } else {
          // Ocultar colunas de meses que não têm conteúdo
          column.hidden = !colunasComConteudo.has(colNumber);
        }
      });

      // Aplicar bordas, alinhamento e altura das linhas
      novaWorksheet.eachRow((row, rowNumber) => {
        // Altura das linhas: cabeçalho 25, demais 20
        row.height = rowNumber === 1 ? 25 : 20;

        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };

          const headerValue = novaHeaderRowFormat.getCell(colNumber).value?.toString() || '';
          
          // Formatação especial para "Razão Social"
          if (headerValue === 'Razão Social') {
            cell.alignment = { 
              horizontal: 'left', 
              vertical: 'top',
              wrapText: true 
            };
          } else if (rowNumber === 1) {
            // Cabeçalho: tudo centralizado
            cell.alignment = { 
              horizontal: 'center', 
              vertical: 'middle',
              wrapText: true 
            };
          } else {
            // Linhas de dados
            if (meses.includes(headerValue) || headerValue === 'Total de Horas' || 
                headerValue === 'Matrícula' || headerValue === 'Carga Horária') {
              // Horários, Matrícula e Carga Horária: centralizados
              cell.alignment = { horizontal: 'center', vertical: 'middle' };
            } else if (headerValue === 'Cód. Centro Custo') {
              // Código Centro Custo: à direita
              cell.alignment = { horizontal: 'right', vertical: 'middle' };
            } else {
              // Demais colunas: à esquerda
              cell.alignment = { horizontal: 'left', vertical: 'middle' };
            }
          }
        });
      });

      // Ajustar larguras das colunas
      novaWorksheet.columns.forEach((column, index) => {
        const header = novaHeaderRowFormat.getCell(index + 1).value?.toString() || '';
        
        if (header === 'CNPJ') column.width = 18;
        else if (header === 'Razão Social') column.width = 40;
        else if (header === 'Cód. Centro Custo') column.width = 18;
        else if (header === 'Centro de Custo') column.width = 30;
        else if (header === 'Matrícula') column.width = 12;
        else if (header === 'Nome do Colaborador') column.width = 35;
        else if (header === 'Carga Horária') column.width = 15;
        else if (meses.includes(header)) column.width = 12;
        else if (header === 'Total de Horas') column.width = 18;
        else column.width = 15;
      });

      // Congelar apenas a primeira linha (cabeçalho)
      novaWorksheet.views = [{
        state: 'frozen',
        ySplit: 1,
        xSplit: 0, // Não congela colunas, apenas a linha do cabeçalho
      }];

      // Gerar buffer da planilha formatada
      const buffer = await novoWorkbook.xlsx.writeBuffer();

      res.setHeader('Content-Type', 
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 
        `attachment; filename="${file.originalname.replace(/\.(xlsx|xls)$/i, '_FORMATADO.xlsx')}"`);
      
      res.send(buffer);
    } catch (error) {
      console.error('[BancoHoras] Erro ao formatar planilha:', error);
      res.status(500).json({ 
        error: 'Erro ao formatar planilha',
        details: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    }
  }
}

