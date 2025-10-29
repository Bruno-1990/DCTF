/**
 * Script para popular banco com códigos DCTF de exemplo
 * Insere códigos padrão e dados de teste
 */

import { supabase } from '../config/database';

interface CodeData {
  codigo: string;
  descricao: string;
  tipo: 'receita' | 'deducao' | 'retencao' | 'outros';
  ativo: boolean;
  periodo_inicio?: string;
  periodo_fim?: string;
  observacoes?: string;
}

interface ReceitaCodeData {
  codigo: string;
  descricao: string;
  categoria: string;
  subcategoria?: string;
  ativo: boolean;
  periodo_inicio?: string;
  periodo_fim?: string;
  observacoes?: string;
}

interface AliquotaData {
  codigo_dctf: string;
  codigo_receita?: string;
  aliquota: number;
  base_calculo: string;
  periodo_inicio: string;
  periodo_fim?: string;
  observacoes?: string;
}

async function populateDCTFCodes() {
  console.log('🚀 Populando banco com códigos DCTF...');

  try {
    // Dados de códigos DCTF
    const dctfCodes: CodeData[] = [
      // Códigos de Receita
      { codigo: '001', descricao: 'Receita Bruta', tipo: 'receita', ativo: true },
      { codigo: '002', descricao: 'Receita Líquida', tipo: 'receita', ativo: true },
      { codigo: '003', descricao: 'Receita de Vendas', tipo: 'receita', ativo: true },
      { codigo: '004', descricao: 'Receita de Serviços', tipo: 'receita', ativo: true },
      { codigo: '005', descricao: 'Receita Financeira', tipo: 'receita', ativo: true },
      { codigo: '006', descricao: 'Receita de Aluguéis', tipo: 'receita', ativo: true },
      { codigo: '007', descricao: 'Receita de Royalties', tipo: 'receita', ativo: true },
      { codigo: '008', descricao: 'Outras Receitas', tipo: 'receita', ativo: true },
      
      // Códigos de Dedução
      { codigo: '101', descricao: 'Deduções Legais', tipo: 'deducao', ativo: true },
      { codigo: '102', descricao: 'Descontos Incondicionais', tipo: 'deducao', ativo: true },
      { codigo: '103', descricao: 'Devoluções de Vendas', tipo: 'deducao', ativo: true },
      { codigo: '104', descricao: 'Cancelamentos', tipo: 'deducao', ativo: true },
      { codigo: '105', descricao: 'Abatimentos', tipo: 'deducao', ativo: true },
      { codigo: '106', descricao: 'Impostos sobre Vendas', tipo: 'deducao', ativo: true },
      { codigo: '107', descricao: 'Comissões sobre Vendas', tipo: 'deducao', ativo: true },
      { codigo: '108', descricao: 'Outras Deduções', tipo: 'deducao', ativo: true },
      
      // Códigos de Retenção
      { codigo: '201', descricao: 'IRRF - Imposto de Renda Retido na Fonte', tipo: 'retencao', ativo: true },
      { codigo: '202', descricao: 'CSLL - Contribuição Social sobre Lucro Líquido', tipo: 'retencao', ativo: true },
      { codigo: '203', descricao: 'PIS - Programa de Integração Social', tipo: 'retencao', ativo: true },
      { codigo: '204', descricao: 'COFINS - Contribuição para Financiamento da Seguridade Social', tipo: 'retencao', ativo: true },
      { codigo: '205', descricao: 'INSS - Instituto Nacional do Seguro Social', tipo: 'retencao', ativo: true },
      { codigo: '206', descricao: 'ISS - Imposto sobre Serviços', tipo: 'retencao', ativo: true },
      { codigo: '207', descricao: 'ICMS - Imposto sobre Circulação de Mercadorias e Serviços', tipo: 'retencao', ativo: true },
      { codigo: '208', descricao: 'Outras Retenções', tipo: 'retencao', ativo: true },
      
      // Outros Códigos
      { codigo: '301', descricao: 'Ajustes de Exercícios Anteriores', tipo: 'outros', ativo: true },
      { codigo: '302', descricao: 'Compensações', tipo: 'outros', ativo: true },
      { codigo: '303', descricao: 'Restituições', tipo: 'outros', ativo: true },
      { codigo: '304', descricao: 'Outros Ajustes', tipo: 'outros', ativo: true }
    ];

    // Dados de códigos de receita
    const receitaCodes: ReceitaCodeData[] = [
      // Receitas de Vendas
      { codigo: '1.1.1.01.01', descricao: 'Vendas de Produtos', categoria: 'Vendas', subcategoria: 'Produtos', ativo: true },
      { codigo: '1.1.1.01.02', descricao: 'Vendas de Mercadorias', categoria: 'Vendas', subcategoria: 'Mercadorias', ativo: true },
      { codigo: '1.1.1.01.03', descricao: 'Vendas de Serviços', categoria: 'Vendas', subcategoria: 'Serviços', ativo: true },
      { codigo: '1.1.1.01.04', descricao: 'Vendas de Bens do Ativo Imobilizado', categoria: 'Vendas', subcategoria: 'Ativo Imobilizado', ativo: true },
      
      // Receitas Financeiras
      { codigo: '1.1.2.01.01', descricao: 'Juros sobre Aplicações Financeiras', categoria: 'Financeira', subcategoria: 'Juros', ativo: true },
      { codigo: '1.1.2.01.02', descricao: 'Rendimentos de Fundos de Investimento', categoria: 'Financeira', subcategoria: 'Fundos', ativo: true },
      { codigo: '1.1.2.01.03', descricao: 'Ganhos em Operações de Câmbio', categoria: 'Financeira', subcategoria: 'Câmbio', ativo: true },
      { codigo: '1.1.2.01.04', descricao: 'Outras Receitas Financeiras', categoria: 'Financeira', subcategoria: 'Outras', ativo: true },
      
      // Receitas de Aluguéis
      { codigo: '1.1.3.01.01', descricao: 'Aluguéis de Imóveis', categoria: 'Aluguéis', subcategoria: 'Imóveis', ativo: true },
      { codigo: '1.1.3.01.02', descricao: 'Aluguéis de Equipamentos', categoria: 'Aluguéis', subcategoria: 'Equipamentos', ativo: true },
      { codigo: '1.1.3.01.03', descricao: 'Aluguéis de Veículos', categoria: 'Aluguéis', subcategoria: 'Veículos', ativo: true },
      
      // Outras Receitas
      { codigo: '1.1.4.01.01', descricao: 'Royalties', categoria: 'Outras', subcategoria: 'Royalties', ativo: true },
      { codigo: '1.1.4.01.02', descricao: 'Franquias', categoria: 'Outras', subcategoria: 'Franquias', ativo: true },
      { codigo: '1.1.4.01.03', descricao: 'Licenças', categoria: 'Outras', subcategoria: 'Licenças', ativo: true },
      { codigo: '1.1.4.01.04', descricao: 'Outras Receitas Operacionais', categoria: 'Outras', subcategoria: 'Operacionais', ativo: true }
    ];

    // Dados de alíquotas
    const aliquotas: AliquotaData[] = [
      // IRRF
      { codigo_dctf: '201', aliquota: 0.0150, base_calculo: 'Valor da Operação', periodo_inicio: '2024-01' },
      { codigo_dctf: '201', aliquota: 0.0125, base_calculo: 'Valor da Operação', periodo_inicio: '2024-07' },
      
      // CSLL
      { codigo_dctf: '202', aliquota: 0.0100, base_calculo: 'Valor da Operação', periodo_inicio: '2024-01' },
      
      // PIS
      { codigo_dctf: '203', aliquota: 0.0065, base_calculo: 'Valor da Operação', periodo_inicio: '2024-01' },
      
      // COFINS
      { codigo_dctf: '204', aliquota: 0.0300, base_calculo: 'Valor da Operação', periodo_inicio: '2024-01' },
      
      // INSS
      { codigo_dctf: '205', aliquota: 0.1100, base_calculo: 'Valor da Operação', periodo_inicio: '2024-01' },
      
      // ISS
      { codigo_dctf: '206', aliquota: 0.0500, base_calculo: 'Valor da Operação', periodo_inicio: '2024-01' },
      
      // ICMS
      { codigo_dctf: '207', aliquota: 0.1800, base_calculo: 'Valor da Operação', periodo_inicio: '2024-01' }
    ];

    // Inserir códigos DCTF
    console.log('📝 Inserindo códigos DCTF...');
    const { error: dctfError } = await supabase
      .from('dctf_codes')
      .upsert(dctfCodes, { onConflict: 'codigo' });

    if (dctfError) {
      console.error('❌ Erro ao inserir códigos DCTF:', dctfError.message);
    } else {
      console.log(`✅ ${dctfCodes.length} códigos DCTF inseridos`);
    }

    // Inserir códigos de receita
    console.log('📝 Inserindo códigos de receita...');
    const { error: receitaError } = await supabase
      .from('dctf_receita_codes')
      .upsert(receitaCodes, { onConflict: 'codigo' });

    if (receitaError) {
      console.error('❌ Erro ao inserir códigos de receita:', receitaError.message);
    } else {
      console.log(`✅ ${receitaCodes.length} códigos de receita inseridos`);
    }

    // Inserir alíquotas
    console.log('📝 Inserindo alíquotas...');
    const { error: aliquotaError } = await supabase
      .from('dctf_aliquotas')
      .upsert(aliquotas, { onConflict: 'id' });

    if (aliquotaError) {
      console.error('❌ Erro ao inserir alíquotas:', aliquotaError.message);
    } else {
      console.log(`✅ ${aliquotas.length} alíquotas inseridas`);
    }

    // Verificar dados inseridos
    console.log('\n🔍 Verificando dados inseridos...');
    
    const { data: dctfCount, error: dctfCountError } = await supabase
      .from('dctf_codes')
      .select('id', { count: 'exact' });

    if (dctfCountError) {
      console.error('❌ Erro ao contar códigos DCTF:', dctfCountError.message);
    } else {
      console.log(`📊 Códigos DCTF: ${dctfCount?.length || 0} registros`);
    }

    const { data: receitaCount, error: receitaCountError } = await supabase
      .from('dctf_receita_codes')
      .select('id', { count: 'exact' });

    if (receitaCountError) {
      console.error('❌ Erro ao contar códigos de receita:', receitaCountError.message);
    } else {
      console.log(`📊 Códigos de Receita: ${receitaCount?.length || 0} registros`);
    }

    const { data: aliquotaCount, error: aliquotaCountError } = await supabase
      .from('dctf_aliquotas')
      .select('id', { count: 'exact' });

    if (aliquotaCountError) {
      console.error('❌ Erro ao contar alíquotas:', aliquotaCountError.message);
    } else {
      console.log(`📊 Alíquotas: ${aliquotaCount?.length || 0} registros`);
    }

    console.log('\n🎉 População do banco concluída com sucesso!');

  } catch (error: any) {
    console.error('❌ Erro durante população do banco:', error.message);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  populateDCTFCodes()
    .then(() => {
      console.log('✅ Script finalizado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro fatal:', error);
      process.exit(1);
    });
}

export { populateDCTFCodes };
