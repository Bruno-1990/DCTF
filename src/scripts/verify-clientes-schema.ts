/**
 * Script para verificar a estrutura da tabela clientes e comparar com o esperado
 * Verifica se todos os campos existem e se os tipos estão corretos
 */

import 'dotenv/config';
import { getConnection } from '../config/mysql';

type ColumnInfo = {
  Field: string;
  Type: string;
  Null: string;
  Key: string;
  Default: string | null;
  Extra: string;
};

async function verifyClientesSchema() {
  console.log('🔍 Verificando estrutura da tabela clientes...\n');
  const connection = await getConnection();

  try {
    // Obter estrutura atual da tabela
    const [rows] = await connection.query(`SHOW COLUMNS FROM \`clientes\``);
    const currentColumns = new Map<string, ColumnInfo>();
    for (const row of rows as ColumnInfo[]) {
      currentColumns.set(row.Field, row);
    }

    // Definir estrutura esperada
    const expectedColumns: Record<string, { type: string; nullable: boolean; description: string }> = {
      // Campos básicos (já existentes)
      id: { type: 'CHAR(36)', nullable: false, description: 'UUID do cliente' },
      razao_social: { type: 'VARCHAR(255)', nullable: false, description: 'Razão social' },
      cnpj_limpo: { type: 'VARCHAR(14)', nullable: true, description: 'CNPJ sem formatação' },
      email: { type: 'VARCHAR(255)', nullable: true, description: 'Email' },
      telefone: { type: 'VARCHAR(255)', nullable: true, description: 'Telefone (aumentado para suportar múltiplos)' },
      endereco: { type: 'VARCHAR(500)', nullable: true, description: 'Endereço completo (linha única)' },
      created_at: { type: 'TIMESTAMP', nullable: true, description: 'Data de criação' },
      updated_at: { type: 'TIMESTAMP', nullable: true, description: 'Data de atualização' },

      // Campos ReceitaWS - Dados básicos
      fantasia: { type: 'VARCHAR(255)', nullable: true, description: 'Nome fantasia' },
      tipo_estabelecimento: { type: 'VARCHAR(30)', nullable: true, description: 'Tipo de estabelecimento' },
      situacao_cadastral: { type: 'VARCHAR(50)', nullable: true, description: 'Situação cadastral' },
      porte: { type: 'VARCHAR(80)', nullable: true, description: 'Porte da empresa' },
      natureza_juridica: { type: 'VARCHAR(120)', nullable: true, description: 'Natureza jurídica' },

      // Campos ReceitaWS - Datas (DATE)
      abertura: { type: 'DATE', nullable: true, description: 'Data de abertura' },
      data_situacao: { type: 'DATE', nullable: true, description: 'Data da situação' },
      data_situacao_especial: { type: 'DATE', nullable: true, description: 'Data da situação especial' },
      motivo_situacao: { type: 'VARCHAR(255)', nullable: true, description: 'Motivo da situação' },
      situacao_especial: { type: 'VARCHAR(255)', nullable: true, description: 'Situação especial' },
      efr: { type: 'VARCHAR(255)', nullable: true, description: 'EFR' },

      // Campos ReceitaWS - Atividades
      atividade_principal_code: { type: 'VARCHAR(20)', nullable: true, description: 'Código da atividade principal' },
      atividade_principal_text: { type: 'VARCHAR(255)', nullable: true, description: 'Texto da atividade principal' },
      atividades_secundarias: { type: 'JSON', nullable: true, description: 'Atividades secundárias' },

      // Campos ReceitaWS - Endereço detalhado
      logradouro: { type: 'VARCHAR(255)', nullable: true, description: 'Logradouro' },
      numero: { type: 'VARCHAR(30)', nullable: true, description: 'Número' },
      complemento: { type: 'VARCHAR(255)', nullable: true, description: 'Complemento' },
      bairro: { type: 'VARCHAR(120)', nullable: true, description: 'Bairro' },
      municipio: { type: 'VARCHAR(120)', nullable: true, description: 'Município' },
      uf: { type: 'VARCHAR(2)', nullable: true, description: 'UF' },
      cep: { type: 'VARCHAR(20)', nullable: true, description: 'CEP' },

      // Campos ReceitaWS - Contato
      receita_email: { type: 'VARCHAR(255)', nullable: true, description: 'Email da Receita' },
      receita_telefone: { type: 'VARCHAR(255)', nullable: true, description: 'Telefone da Receita' },

      // Campos ReceitaWS - Financeiro
      capital_social: { type: 'DECIMAL(15,2)', nullable: true, description: 'Capital social' },
      simples_optante: { type: 'BOOLEAN', nullable: true, description: 'Optante do Simples Nacional' },
      simples_data_opcao: { type: 'DATE', nullable: true, description: 'Data de opção pelo Simples' },
      simples_data_exclusao: { type: 'DATE', nullable: true, description: 'Data de exclusão do Simples' },
      simei_optante: { type: 'BOOLEAN', nullable: true, description: 'Optante do SIMEI' },
      simei_data_opcao: { type: 'DATE', nullable: true, description: 'Data de opção pelo SIMEI' },
      simei_data_exclusao: { type: 'DATE', nullable: true, description: 'Data de exclusão do SIMEI' },

      // Campos ReceitaWS - Metadados
      receita_ws_status: { type: 'VARCHAR(20)', nullable: true, description: 'Status da consulta ReceitaWS' },
      receita_ws_message: { type: 'TEXT', nullable: true, description: 'Mensagem da consulta ReceitaWS' },
      receita_ws_consulta_em: { type: 'TIMESTAMP', nullable: true, description: 'Data/hora da consulta ReceitaWS' },
      receita_ws_ultima_atualizacao: { type: 'TIMESTAMP', nullable: true, description: 'Última atualização ReceitaWS' },
      receita_ws_payload: { type: 'JSON', nullable: true, description: 'Payload completo da ReceitaWS' },
    };

    console.log('📊 Comparando estrutura esperada com a atual...\n');

    const issues: Array<{ field: string; issue: string; fix?: string }> = [];
    const missing: string[] = [];
    const typeMismatches: Array<{ field: string; expected: string; actual: string }> = [];

    // Verificar campos esperados
    for (const [fieldName, expected] of Object.entries(expectedColumns)) {
      const current = currentColumns.get(fieldName);

      if (!current) {
        missing.push(fieldName);
        issues.push({
          field: fieldName,
          issue: `Campo não existe`,
          fix: `ALTER TABLE \`clientes\` ADD COLUMN \`${fieldName}\` ${expected.type} ${expected.nullable ? 'NULL' : 'NOT NULL'}`
        });
        continue;
      }

      // Normalizar tipos para comparação
      const normalizeType = (type: string): string => {
        const t = type.toUpperCase();
        // MySQL pode retornar tipos como "varchar(255)", "tinyint(1)", "datetime", etc.
        if (t.startsWith('VARCHAR')) return 'VARCHAR';
        if (t.startsWith('CHAR')) return 'CHAR';
        if (t.startsWith('TEXT')) return 'TEXT';
        if (t.startsWith('DECIMAL') || t.startsWith('NUMERIC')) return 'DECIMAL';
        if (t.startsWith('TINYINT(1)') || t === 'BOOLEAN' || t === 'BOOL') return 'BOOLEAN';
        if (t === 'DATE') return 'DATE';
        if (t === 'DATETIME' || t === 'TIMESTAMP') return 'TIMESTAMP';
        if (t === 'JSON' || t === 'LONGTEXT') return 'JSON'; // JSON pode ser armazenado como LONGTEXT em algumas versões
        return t;
      };

      const expectedNormalized = normalizeType(expected.type);
      const actualNormalized = normalizeType(current.Type);

      // Verificar tipo
      if (expectedNormalized !== actualNormalized) {
        typeMismatches.push({
          field: fieldName,
          expected: expected.type,
          actual: current.Type
        });
        issues.push({
          field: fieldName,
          issue: `Tipo incorreto: esperado ${expected.type}, encontrado ${current.Type}`,
          fix: `ALTER TABLE \`clientes\` MODIFY COLUMN \`${fieldName}\` ${expected.type} ${expected.nullable ? 'NULL' : 'NOT NULL'}`
        });
      }

      // Verificar nullable
      const isNullable = current.Null === 'YES';
      if (expected.nullable !== isNullable) {
        issues.push({
          field: fieldName,
          issue: `Nullable incorreto: esperado ${expected.nullable ? 'NULL' : 'NOT NULL'}, encontrado ${isNullable ? 'NULL' : 'NOT NULL'}`,
          fix: `ALTER TABLE \`clientes\` MODIFY COLUMN \`${fieldName}\` ${current.Type} ${expected.nullable ? 'NULL' : 'NOT NULL'}`
        });
      }
    }

    // Verificar campos extras (que não deveriam existir)
    const extraFields: string[] = [];
    for (const [fieldName] of currentColumns) {
      if (!expectedColumns[fieldName]) {
        extraFields.push(fieldName);
      }
    }

    // Relatório
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 RELATÓRIO DE VERIFICAÇÃO DA TABELA clientes');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (missing.length > 0) {
      console.log(`❌ CAMPOS FALTANDO (${missing.length}):`);
      missing.forEach(f => {
        const expected = expectedColumns[f];
        console.log(`   - ${f} (${expected.type}, ${expected.description})`);
      });
      console.log('');
    }

    if (typeMismatches.length > 0) {
      console.log(`⚠️  TIPOS INCORRETOS (${typeMismatches.length}):`);
      typeMismatches.forEach(({ field, expected, actual }) => {
        console.log(`   - ${field}: esperado ${expected}, encontrado ${actual}`);
      });
      console.log('');
    }

    if (extraFields.length > 0) {
      console.log(`ℹ️  CAMPOS EXTRAS (${extraFields.length} - podem ser ignorados):`);
      extraFields.forEach(f => console.log(`   - ${f}`));
      console.log('');
    }

    if (issues.length === 0) {
      console.log('✅ Estrutura da tabela está correta! Todos os campos existem com os tipos corretos.\n');
    } else {
      console.log(`\n🔧 CORREÇÕES NECESSÁRIAS (${issues.length}):\n`);
      issues.forEach(({ field, issue, fix }) => {
        console.log(`   Campo: ${field}`);
        console.log(`   Problema: ${issue}`);
        if (fix) {
          console.log(`   SQL para corrigir:`);
          console.log(`   ${fix};`);
        }
        console.log('');
      });
    }

    // Verificar tabela clientes_socios
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📋 VERIFICANDO TABELA clientes_socios');
    console.log('═══════════════════════════════════════════════════════════\n');

    const [sociosTables] = await connection.query(
      `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'clientes_socios'`
    );
    const sociosExists = Number((sociosTables as any[])[0]?.cnt || 0) > 0;

    if (!sociosExists) {
      console.log('❌ Tabela clientes_socios não existe!\n');
      console.log('SQL para criar:');
      console.log(`
CREATE TABLE IF NOT EXISTS \`clientes_socios\` (
  id CHAR(36) PRIMARY KEY COMMENT 'UUID',
  cliente_id CHAR(36) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  qual VARCHAR(120) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_clientes_socios_cliente_id (cliente_id),
  INDEX idx_clientes_socios_nome (nome),
  CONSTRAINT fk_clientes_socios_cliente_id FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    } else {
      const [sociosCols] = await connection.query(`SHOW COLUMNS FROM \`clientes_socios\``);
      const sociosColsArray = sociosCols as ColumnInfo[];
      console.log(`✅ Tabela clientes_socios existe com ${sociosColsArray.length} colunas:`);
      sociosColsArray.forEach(col => {
        console.log(`   - ${col.Field}: ${col.Type} ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'}`);
      });
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');

  } catch (error: any) {
    console.error('❌ Erro ao verificar schema:', error.message);
    throw error;
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  verifyClientesSchema()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Erro:', err);
      process.exit(1);
    });
}

export default verifyClientesSchema;

