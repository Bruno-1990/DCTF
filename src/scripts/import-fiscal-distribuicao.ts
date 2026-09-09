/**
 * Carga inicial da ficha fiscal a partir da planilha de distribuição.
 *
 * Lê `Distribuicao_por_colaborador.xlsx` (uma aba por colaborador) e cria a
 * linha de cada empresa na carteira de quem a atende. Só o vínculo e a
 * particularidade vêm da planilha — CNPJ, razão, regime e benefício continuam
 * saindo de `clientes` por JOIN na hora de exibir.
 *
 * Uso: npm run import:fiscal-distribuicao
 *      npm run import:fiscal-distribuicao -- "D:\\caminho\\outra.xlsx"
 *
 * IDEMPOTENTE, E DE PROPÓSITO CONSERVADOR: usa INSERT IGNORE. Rodar de novo
 * recria só o que falta e NÃO sobrescreve perfil, volume, SPED ou particularidade
 * que alguém já preencheu na tela. Se a intenção for reimportar por cima, isso
 * tem de ser uma decisão explícita — não o efeito colateral de repetir um
 * comando.
 *
 * Empresa que não existe em `clientes` não é criada aqui: sai na lista de
 * pendências no fim. Cadastro nasce no cadastro, não numa importação de
 * planilha, senão o CNPJ entra sem razão social conferida e vira lixo.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
// Carrega o .env ANTES de importar o pool MySQL (que lê process.env no load).
dotenv.config({ path: path.join(process.cwd(), '.env') });
import * as XLSX from 'xlsx';
import { mysqlPool } from '../config/mysql';

const PLANILHA_PADRAO = 'D:\\FABIANA\\Distribuicao_por_colaborador.xlsx';

/** Aba de listas da planilha; não é carteira de ninguém. */
const ABA_AUXILIAR = 'AUX';

/**
 * A aba OBSERVAÇÃO não é uma pessoa: são as exceções que ficaram fora da
 * distribuição (SOMENTE DP, SOMENTE LEG, não localizadas no Controle de
 * Inspeção). Vão para um colaborador de mesmo nome para continuarem visíveis
 * e reclamáveis, em vez de sumirem na importação.
 */
const COLABORADOR_SEM_DONO = 'Sem responsável';
const ABAS_SEM_DONO = ['OBSERVAÇÃO', 'OBSERVACAO'];

interface LinhaPlanilha {
  aba: string;
  documento: string;
  documentoBruto: string;
  razaoSocial: string;
  particularidade: string | null;
}

/** Normaliza o cabeçalho para comparar sem depender de acento nem de caixa. */
function chave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

/** Lê todas as abas de carteira da planilha. */
function lerPlanilha(caminho: string): LinhaPlanilha[] {
  const wb = XLSX.readFile(caminho);
  const linhas: LinhaPlanilha[] = [];

  for (const nomeAba of wb.SheetNames) {
    if (chave(nomeAba) === ABA_AUXILIAR) continue;

    const sheet = wb.Sheets[nomeAba];
    if (!sheet) continue;

    const registros = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null });

    for (const registro of registros) {
      // O cabeçalho da planilha tem acento e caixa alta ("RAZÃO SOCIAL"); a
      // busca por chave normalizada sobrevive a alguém corrigir a grafia.
      const entradas = Object.entries(registro);
      const pegar = (rotulo: string) =>
        entradas.find(([k]) => chave(k) === chave(rotulo))?.[1] ?? null;

      const documentoBruto = pegar('CNPJ');
      if (!documentoBruto) continue;

      const documento = String(documentoBruto).replace(/\D/g, '');
      if (!documento) continue;

      // O cabecalho na planilha continua 'OBSERVAÇÃO' — o nome mudou aqui
      // dentro, nao no arquivo de origem.
      const particularidade = pegar('OBSERVAÇÃO');

      linhas.push({
        aba: nomeAba,
        documento,
        documentoBruto: String(documentoBruto),
        razaoSocial: String(pegar('RAZÃO SOCIAL') ?? '').trim(),
        particularidade: particularidade ? String(particularidade).trim().slice(0, 500) : null,
      });
    }
  }

  return linhas;
}

async function run(): Promise<void> {
  const caminho = process.argv[2] ?? PLANILHA_PADRAO;

  if (!fs.existsSync(caminho)) {
    console.error('Planilha não encontrada:', caminho);
    process.exit(1);
  }

  console.log('Lendo', caminho);
  const linhas = lerPlanilha(caminho);
  console.log(`${linhas.length} linhas em ${new Set(linhas.map((l) => l.aba)).size} abas.\n`);

  const connection = await mysqlPool.getConnection();
  try {
    // Mapa CNPJ → cliente. Uma consulta só; a base toda cabe de sobra em
    // memória e evita 209 idas ao banco.
    const [clientes] = await connection.query<any[]>(
      'SELECT id, cnpj_limpo, razao_social FROM clientes WHERE cnpj_limpo IS NOT NULL'
    );
    const porCnpj = new Map<string, { id: string; razao: string }>(
      clientes.map((c) => [String(c.cnpj_limpo), { id: String(c.id), razao: String(c.razao_social) }])
    );

    const [colaboradores] = await connection.query<any[]>(
      'SELECT id, nome FROM fiscal_colaboradores'
    );
    const porNome = new Map<string, number>(
      colaboradores.map((c) => [chave(String(c.nome)), Number(c.id)])
    );

    let inseridas = 0;
    let jaExistiam = 0;
    const semCadastro: LinhaPlanilha[] = [];
    const semColaborador = new Set<string>();
    const porAba = new Map<string, number>();

    for (const linha of linhas) {
      const nomeColaborador = ABAS_SEM_DONO.includes(chave(linha.aba))
        ? COLABORADOR_SEM_DONO
        : linha.aba;

      const colaboradorId = porNome.get(chave(nomeColaborador));
      if (!colaboradorId) {
        semColaborador.add(linha.aba);
        continue;
      }

      const cliente = porCnpj.get(linha.documento);
      if (!cliente) {
        semCadastro.push(linha);
        continue;
      }

      const [res] = await connection.query<any>(
        `INSERT IGNORE INTO fiscal_ficha
           (colaborador_id, cliente_id, particularidade, origem)
         VALUES (?, ?, ?, 'planilha')`,
        [colaboradorId, cliente.id, linha.particularidade]
      );

      if (res.affectedRows > 0) {
        inseridas++;
        porAba.set(linha.aba, (porAba.get(linha.aba) ?? 0) + 1);
      } else {
        jaExistiam++;
      }
    }

    console.log('--- Resultado ---');
    for (const [aba, n] of [...porAba.entries()].sort()) {
      console.log(`  ${aba.padEnd(16)} ${n} linhas criadas`);
    }
    console.log(`\ncriadas: ${inseridas} | já existiam: ${jaExistiam} | sem cadastro: ${semCadastro.length}`);

    if (semColaborador.size > 0) {
      console.log('\nAbas sem colaborador correspondente (rode a migration 053):');
      for (const aba of semColaborador) console.log('  ', aba);
    }

    if (semCadastro.length > 0) {
      console.log('\n--- PENDÊNCIAS: não existem em `clientes`, ficaram de fora ---');
      console.log('Cadastre em Clientes e rode este import de novo para incluí-las.\n');
      for (const l of semCadastro) {
        console.log(`  [${l.aba}] ${l.documentoBruto}  ${l.razaoSocial}`);
      }
    }

    const [total] = await connection.query<any[]>(
      `SELECT col.nome, COUNT(f.id) AS n
         FROM fiscal_colaboradores col
         LEFT JOIN fiscal_ficha f ON f.colaborador_id = col.id AND f.inutilizado = 0
        GROUP BY col.id, col.nome
        ORDER BY col.ordem, col.nome`
    );
    console.log('\n--- Carteira no banco ---');
    for (const t of total) console.log(`  ${String(t.nome).padEnd(16)} ${t.n}`);
  } catch (err: any) {
    console.error('Erro na importação:', err.message);
    process.exit(1);
  } finally {
    connection.release();
    await mysqlPool.end();
  }
}

run();
