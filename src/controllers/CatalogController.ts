import { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

export class CatalogController {
  private pythonScriptPath: string;
  private catalogPath: string;

  constructor() {
    // Caminho para o script Python
    this.pythonScriptPath = path.join(
      __dirname,
      '../../python/catalog/buscar_catalog.py'
    );
    this.catalogPath = path.join(
      __dirname,
      '../../python/catalog/catalog.json'
    );
  }

  /**
   * Busca objetos no catálogo
   * POST /api/sci/catalog/buscar
   */
  async buscarTabelas(req: Request, res: Response): Promise<void> {
    try {
      const { query, domain, type, top_k } = req.body;

      // Validações
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        res.status(400).json({ error: 'Campo "query" é obrigatório' });
        return;
      }

      // Verificar se o catálogo existe
      if (!fs.existsSync(this.catalogPath)) {
        res.status(404).json({ 
          error: 'Catálogo não encontrado. Execute a geração do catálogo primeiro.' 
        });
        return;
      }

      // Construir comando Python
      const args: string[] = [
        `"${query}"`,
      ];

      if (domain) {
        args.push('--domain', domain);
      }

      if (type) {
        args.push('--type', type);
      }

      if (top_k) {
        args.push('--top', top_k.toString());
      }

      const command = `python "${this.pythonScriptPath}" ${args.join(' ')}`;

      // Executar script Python
      const { stdout, stderr } = await execAsync(command, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      if (stderr && !stderr.includes('INFO')) {
        console.error('Python stderr:', stderr);
      }

      // Parse do resultado JSON
      try {
        const resultado = JSON.parse(stdout);
        
        if (resultado.error) {
          res.status(500).json({ error: resultado.error });
          return;
        }

        res.json({ objetos: resultado.objetos || [] });
      } catch (parseError) {
        console.error('Erro ao parsear resultado:', parseError);
        console.error('Stdout:', stdout);
        res.status(500).json({ 
          error: 'Erro ao processar resultado do catálogo',
          details: stdout 
        });
      }
    } catch (error: any) {
      console.error('Erro ao buscar no catálogo:', error);
      res.status(500).json({ 
        error: 'Erro ao buscar no catálogo',
        message: error.message 
      });
    }
  }

  /**
   * Executa SQL no banco SCI
   * POST /api/sci/catalog/executar-sql
   */
  async executarSQL(req: Request, res: Response): Promise<void> {
    try {
      const { sql, limit } = req.body;

      // Validações
      if (!sql || typeof sql !== 'string' || sql.trim().length === 0) {
        res.status(400).json({ error: 'Campo "sql" é obrigatório' });
        return;
      }

      // VALIDAÇÃO DE SEGURANÇA - Apenas SELECT é permitido
      const sqlUpper = sql.trim().toUpperCase();
      
      // Remover comentários para análise mais precisa
      const sqlClean = sqlUpper
        .replace(/--.*$/gm, '') // Comentários de linha
        .replace(/\/\*[\s\S]*?\*\//g, ''); // Comentários de bloco
      
      // Verificar se começa com SELECT ou WITH (CTE)
      if (!sqlClean.trim().startsWith('SELECT') && !sqlClean.trim().startsWith('WITH')) {
        res.status(400).json({ 
          error: 'Apenas consultas SELECT são permitidas por segurança. Operações de INSERT, UPDATE, DELETE são bloqueadas.' 
        });
        return;
      }

      // Verificar comandos perigosos usando word boundaries para evitar falsos positivos
      const forbiddenKeywords = [
        'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
        'TRUNCATE', 'EXECUTE', 'EXEC', 'GRANT', 'REVOKE', 'COMMIT', 'ROLLBACK'
      ];
      
      for (const keyword of forbiddenKeywords) {
        // Usar regex com word boundary para evitar falsos positivos
        const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
        if (pattern.test(sqlClean)) {
          res.status(400).json({ 
            error: `Comando '${keyword}' não é permitido. Apenas consultas SELECT são permitidas por segurança.` 
          });
          return;
        }
      }

      // Limpar SQL: remover comentários e normalizar espaços
      // Isso ajuda na validação e execução
      const sqlLimpo = sql
        .replace(/--.*$/gm, '') // Remove comentários de linha
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comentários de bloco
        .replace(/\s+/g, ' ') // Normaliza espaços em branco
        .trim();

      // Se após limpar ficou vazio, retornar erro
      if (!sqlLimpo) {
        res.status(400).json({ error: 'SQL inválido após remover comentários' });
        return;
      }

      // Caminho para o script Python
      const scriptPath = path.join(
        __dirname,
        '../../python/catalog/executar_sql.py'
      );

      // Usar base64 para passar SQL de forma segura (evita problemas com caracteres especiais)
      const sqlBase64 = Buffer.from(sql, 'utf-8').toString('base64');

      // Construir comando Python
      const args: string[] = [
        '--base64',
        sqlBase64,
      ];

      if (limit) {
        args.push('--limit', limit.toString());
      }

      const command = `python "${scriptPath}" ${args.join(' ')}`;

      // Executar script Python
      const { stdout, stderr } = await execAsync(command, {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024, // 50MB para resultados grandes
      });

      if (stderr && !stderr.includes('INFO')) {
        console.error('Python stderr:', stderr);
      }

      // Parse do resultado JSON
      try {
        const resultado = JSON.parse(stdout);
        
        if (!resultado.success) {
          res.status(500).json({ error: resultado.error || 'Erro ao executar SQL' });
          return;
        }

        res.json({
          success: true,
          columns: resultado.columns || [],
          rows: resultado.rows || [],
          rowCount: resultado.rowCount || 0
        });
      } catch (parseError) {
        console.error('Erro ao parsear resultado:', parseError);
        console.error('Stdout:', stdout);
        res.status(500).json({ 
          error: 'Erro ao processar resultado da consulta',
          details: stdout 
        });
      }
    } catch (error: any) {
      console.error('Erro ao executar SQL:', error);
      res.status(500).json({ 
        error: 'Erro ao executar SQL',
        message: error.message 
      });
    }
  }

  /**
   * Gera SQL baseado em um objeto do catálogo
   * POST /api/sci/catalog/gerar-sql
   */
  async gerarSQL(req: Request, res: Response): Promise<void> {
    try {
      const { objeto, tipo, colunas } = req.body;

      // Validações
      if (!objeto || typeof objeto !== 'string') {
        res.status(400).json({ error: 'Campo "objeto" é obrigatório' });
        return;
      }

      if (!tipo || !['VIEW', 'TABLE'].includes(tipo)) {
        res.status(400).json({ error: 'Campo "tipo" deve ser "VIEW" ou "TABLE"' });
        return;
      }

      // Gerar SQL básico
      const colunasSelect = colunas && Array.isArray(colunas) && colunas.length > 0
        ? colunas
            .slice(0, 15) // Limitar a 15 colunas
            .map((c: any) => {
              const nome = c.nome || c;
              return nome;
            })
            .join(', ')
        : '*';

      // SQL base com comentários úteis
      const sql = `-- Query gerada automaticamente para: ${objeto} (${tipo})
-- ${tipo === 'VIEW' ? 'VIEW recomendada - já traz regras de negócio aplicadas' : 'TABLE transacional - dados brutos'}

SELECT ${colunasSelect}
FROM ${objeto}
WHERE 1=1
  -- Adicione seus filtros aqui
  -- Exemplos:
  -- AND BDCODEMP = 1  -- Filtrar por empresa
  -- AND BDCODCOL = 123  -- Filtrar por colaborador
  -- AND BDDATAADMCOL >= '2024-01-01'  -- Filtrar por data
ORDER BY 
  -- Adicione ordenação aqui
  -- Exemplo: BDCODCOL, BDDATAADMCOL
LIMIT 100;  -- Ajuste o limite conforme necessário

-- Dica: Para VIEWs, geralmente não é necessário fazer JOINs
--       Para TABLEs, você pode precisar fazer JOINs com outras tabelas`;

      res.json({ sql });
    } catch (error: any) {
      console.error('Erro ao gerar SQL:', error);
      res.status(500).json({ 
        error: 'Erro ao gerar SQL',
        message: error.message 
      });
    }
  }

  /**
   * Consulta personalizada de centro de custo e colaborador
   * POST /api/sci/catalog/consulta-centro-custo
   */
  async consultaCentroCusto(req: Request, res: Response): Promise<void> {
    try {
      const { cod_cc, cod_col, nome_col, view } = req.body;

      const scriptPath = path.join(
        __dirname,
        '../../python/catalog/consulta_centro_custo.py'
      );

      const args: string[] = [];
      
      if (cod_cc) {
        args.push('--cod-cc', cod_cc.toString());
      }
      if (cod_col) {
        args.push('--cod-col', cod_col.toString());
      }
      if (nome_col) {
        args.push('--nome-col', nome_col.toString());
      }
      if (view) {
        args.push('--view', view.toString());
      }

      const command = `python "${scriptPath}" ${args.join(' ')}`;

      const { stdout, stderr } = await execAsync(command, {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024,
      });

      if (stderr && !stdout) {
        res.status(500).json({ 
          error: 'Erro ao executar consulta',
          details: stderr 
        });
        return;
      }

      try {
        const resultado = JSON.parse(stdout.trim());
        res.json(resultado);
      } catch (parseError) {
        console.error('Erro ao parsear resultado:', parseError);
        console.error('Stdout:', stdout);
        res.status(500).json({ 
          error: 'Erro ao processar resultado da consulta',
          details: stdout 
        });
      }
    } catch (error: any) {
      console.error('Erro ao consultar centro de custo:', error);
      res.status(500).json({ 
        error: 'Erro ao consultar centro de custo',
        message: error.message 
      });
    }
  }

  /**
   * Consulta de faturamento (TPEDIDOS_BI_FAT_RESULTADOS)
   * POST /api/sci/catalog/consulta-faturamento
   * Body: { cod_emp: number, ano?: string }
   */
  async consultaFaturamento(req: Request, res: Response): Promise<void> {
    try {
      const { cod_emp, ano } = req.body;

      // Validações
      if (!cod_emp || typeof cod_emp !== 'number') {
        res.status(400).json({ error: 'Campo "cod_emp" é obrigatório e deve ser um número' });
        return;
      }

      // Ano padrão: ano atual se não informado
      const anoConsulta = ano || new Date().getFullYear().toString();

      // SQL da consulta - Ajustada para Firebird
      // BDREF pode ser INTEGER ou VARCHAR, então convertemos para string para fazer SUBSTRING
      const sql = `
        SELECT
          BDREF,
          MAX(CASE WHEN BDORDEM = 1 THEN BDVALOR END) AS VENDAS_BRUTAS,
          MAX(CASE WHEN BDORDEM = 2 THEN BDVALOR END) AS DEVOLUCOES_DEDUCOES,
          MAX(CASE WHEN BDORDEM = 3 THEN BDVALOR END) AS VENDAS_LIQUIDAS,
          MAX(CASE WHEN BDORDEM = 4 THEN BDVALOR END) AS SERVICOS,
          MAX(CASE WHEN BDORDEM = 5 THEN BDVALOR END) AS OUTRAS_RECEITAS,
          MAX(CASE WHEN BDORDEM = 6 THEN BDVALOR END) AS OPERACOES_IMOBILIARIAS,
          MAX(CASE WHEN BDORDEM = 7 THEN BDVALOR END) AS FATURAMENTO_TOTAL
        FROM TPEDIDOS_BI_FAT_RESULTADOS
        WHERE BDCODEMP = ${cod_emp}
          AND SUBSTRING(CAST(BDREF AS VARCHAR(50)) FROM 1 FOR 4) = '${anoConsulta}'
        GROUP BY BDREF
        ORDER BY BDREF
      `;

      // Caminho para o script Python
      const scriptPath = path.join(
        __dirname,
        '../../python/catalog/executar_sql.py'
      );

      // Usar base64 para passar SQL de forma segura
      const sqlBase64 = Buffer.from(sql, 'utf-8').toString('base64');

      // Construir comando Python
      const command = `python "${scriptPath}" --base64 ${sqlBase64}`;

      // Executar script Python
      const { stdout, stderr } = await execAsync(command, {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024, // 50MB
      });

      if (stderr && !stderr.includes('INFO')) {
        console.error('Python stderr:', stderr);
      }

      // Parse do resultado JSON
      try {
        const resultado = JSON.parse(stdout);
        
        if (!resultado.success) {
          res.status(500).json({ 
            error: resultado.error || 'Erro ao executar consulta de faturamento',
            details: resultado.details 
          });
          return;
        }

        res.json({
          success: true,
          cod_emp,
          ano: anoConsulta,
          columns: resultado.columns || [],
          rows: resultado.rows || [],
          rowCount: resultado.rowCount || 0
        });
      } catch (parseError) {
        console.error('Erro ao parsear resultado:', parseError);
        console.error('Stdout:', stdout);
        res.status(500).json({ 
          error: 'Erro ao processar resultado da consulta',
          details: stdout 
        });
      }
    } catch (error: any) {
      console.error('Erro ao consultar faturamento:', error);
      res.status(500).json({ 
        error: 'Erro ao consultar faturamento',
        message: error.message 
      });
    }
  }

  /**
   * Executar stored procedure SP_BI_FAT
   * POST /api/sci/catalog/sp-bi-fat
   * Body: { cod_emp: number, param1?: number, param2?: number, data_inicio?: string, data_fim?: string, param3?: number }
   */
  async executarSP_BI_FAT(req: Request, res: Response): Promise<void> {
    try {
      const { cod_emp, param1, param2, data_inicio, data_fim, param3 } = req.body;

      // Validações
      if (!cod_emp || typeof cod_emp !== 'number') {
        res.status(400).json({ error: 'Campo "cod_emp" é obrigatório e deve ser um número' });
        return;
      }

      // Valores padrão
      const p1 = param1 !== undefined ? param1 : 2;
      const p2 = param2 !== undefined ? param2 : 2;
      const dataIni = data_inicio || '01.12.2024';
      const dataFim = data_fim || '31.12.2024';
      const p3 = param3 !== undefined ? param3 : 1;

      // SQL para executar a stored procedure
      // No Firebird, stored procedures são chamadas via SELECT * FROM nome_procedure(params)
      const sql = `SELECT * FROM SP_BI_FAT(${cod_emp}, ${p1}, ${p2}, '${dataIni}', '${dataFim}', ${p3})`;

      // Caminho para o script Python
      const scriptPath = path.join(
        __dirname,
        '../../python/catalog/executar_sql.py'
      );

      // Usar base64 para passar SQL de forma segura
      const sqlBase64 = Buffer.from(sql, 'utf-8').toString('base64');

      // Construir comando Python
      const command = `python "${scriptPath}" --base64 ${sqlBase64}`;

      // Executar script Python
      const { stdout, stderr } = await execAsync(command, {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024, // 50MB
      });

      if (stderr && !stderr.includes('INFO')) {
        console.error('Python stderr:', stderr);
      }

      // Parse do resultado JSON
      try {
        const resultado = JSON.parse(stdout);
        
        if (!resultado.success) {
          res.status(500).json({ 
            error: resultado.error || 'Erro ao executar stored procedure SP_BI_FAT',
            details: resultado.details 
          });
          return;
        }

        res.json({
          success: true,
          cod_emp,
          parametros: {
            param1: p1,
            param2: p2,
            data_inicio: dataIni,
            data_fim: dataFim,
            param3: p3,
          },
          columns: resultado.columns || [],
          rows: resultado.rows || [],
          rowCount: resultado.rowCount || 0
        });
      } catch (parseError) {
        console.error('Erro ao parsear resultado:', parseError);
        console.error('Stdout:', stdout);
        res.status(500).json({ 
          error: 'Erro ao processar resultado da stored procedure',
          details: stdout 
        });
      }
    } catch (error: any) {
      console.error('Erro ao executar SP_BI_FAT:', error);
      res.status(500).json({ 
        error: 'Erro ao executar stored procedure SP_BI_FAT',
        message: error.message 
      });
    }
  }
}

