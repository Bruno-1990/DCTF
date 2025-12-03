import { Request, Response } from 'express';
import { BancoHorasService } from '../services/BancoHorasService';
import * as fs from 'fs';

export class BancoHorasController {
  private bancoHorasService: BancoHorasService;

  constructor() {
    this.bancoHorasService = new BancoHorasService();
  }

  /**
   * Lista histórico de relatórios gerados
   * GET /api/sci/banco-horas/historico
   */
  async listarHistorico(req: Request, res: Response): Promise<void> {
    try {
      const relatorios = await this.bancoHorasService.listarRelatorios();
      res.json({ success: true, data: relatorios });
    } catch (error: any) {
      console.error('Erro ao listar histórico:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao listar histórico',
      });
    }
  }

  /**
   * Baixa relatório do histórico por ID
   * GET /api/sci/banco-horas/historico/:id/download
   */
  async baixarDoHistorico(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const relatorio = await this.bancoHorasService.buscarRelatorioPorId(id);

      if (!relatorio) {
        res.status(404).json({ success: false, error: 'Relatório não encontrado' });
        return;
      }

      if (relatorio.status !== 'concluido') {
        res.status(400).json({
          success: false,
          error: `Relatório ainda está ${relatorio.status === 'gerando' ? 'sendo gerado' : 'com erro'}`,
        });
        return;
      }

      if (!relatorio.arquivoPath || !fs.existsSync(relatorio.arquivoPath)) {
        res.status(404).json({ success: false, error: 'Arquivo não encontrado no servidor' });
        return;
      }

      // Ler arquivo e enviar como resposta
      const fileBuffer = fs.readFileSync(relatorio.arquivoPath);

      // Configurar headers para download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${relatorio.nomeArquivo}"`);

      // Enviar arquivo
      res.send(fileBuffer);
    } catch (error: any) {
      console.error('Erro ao baixar relatório:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao baixar relatório',
      });
    }
  }

  /**
   * Baixa relatório formatado do histórico por ID
   * GET /api/sci/banco-horas/historico/:id/download-formatado
   */
  async baixarFormatadoDoHistorico(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const relatorio = await this.bancoHorasService.buscarRelatorioPorId(id);

      if (!relatorio) {
        res.status(404).json({ success: false, error: 'Relatório não encontrado' });
        return;
      }

      if (relatorio.status !== 'concluido') {
        res.status(400).json({
          success: false,
          error: `Relatório ainda está ${relatorio.status === 'gerando' ? 'sendo gerado' : 'com erro'}`,
        });
        return;
      }

      // Buscar arquivo formatado (pode estar em metadados ou inferir do nome)
      const arquivoFormatadoPath = relatorio.arquivoFormatadoPath || 
        (relatorio.arquivoPath ? relatorio.arquivoPath.replace('.xlsx', '_FORMATADO.xlsx') : null);

      if (!arquivoFormatadoPath || !fs.existsSync(arquivoFormatadoPath)) {
        res.status(404).json({ success: false, error: 'Arquivo formatado não encontrado no servidor' });
        return;
      }

      // Ler arquivo e enviar como resposta
      const fileBuffer = fs.readFileSync(arquivoFormatadoPath);
      const nomeArquivo = relatorio.arquivoFormatadoNome || 
        (relatorio.nomeArquivo ? relatorio.nomeArquivo.replace('.xlsx', '_FORMATADO.xlsx') : 'Banco_Horas_FORMATADO.xlsx');

      // Configurar headers para download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);

      // Enviar arquivo
      res.send(fileBuffer);
    } catch (error: any) {
      console.error('Erro ao baixar relatório formatado:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao baixar relatório formatado',
      });
    }
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

      // Gerar relatório
      const resultado = await this.bancoHorasService.gerarRelatorio({
        cnpj: cnpjLimpo,
        dataInicial,
        dataFinal,
      });

      if (!resultado.success || !resultado.filePath) {
        res.status(500).json({
          error: resultado.error || 'Erro ao gerar relatório',
        });
        return;
      }

      // Ler arquivo e enviar como resposta
      const fileBuffer = await this.bancoHorasService.lerArquivoGerado(resultado.filePath);

      // Configurar headers para download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="Banco_Horas_${cnpjLimpo}_${dataInicial}_${dataFinal}.xlsx"`
      );

      // Enviar arquivo
      res.send(fileBuffer);

      // Limpar arquivo após envio (opcional, pode manter para histórico)
      // fs.unlinkSync(resultado.filePath);
    } catch (error: any) {
      console.error('Erro no controller de banco de horas:', error);
      res.status(500).json({
        error: error.message || 'Erro interno ao gerar relatório',
      });
    }
  }

  /**
   * Deleta um relatório do histórico
   * DELETE /api/sci/banco-horas/historico/:id
   */
  async deletarHistorico(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ success: false, error: 'ID do relatório é obrigatório' });
        return;
      }

      const resultado = await this.bancoHorasService.deletarRelatorio(id);

      if (!resultado.success) {
        res.status(500).json({
          success: false,
          error: resultado.error || 'Erro ao deletar relatório',
        });
        return;
      }

      res.json({ success: true, message: 'Relatório deletado com sucesso' });
    } catch (error: any) {
      console.error('Erro ao deletar histórico:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Erro interno ao deletar relatório',
      });
    }
  }
}

