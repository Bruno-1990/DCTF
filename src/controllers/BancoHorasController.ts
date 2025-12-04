import { Request, Response } from 'express';
import { BancoHorasService } from '../services/BancoHorasService';
import * as fs from 'fs';

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
}

