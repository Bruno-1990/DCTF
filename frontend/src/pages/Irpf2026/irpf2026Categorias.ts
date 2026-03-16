/**
 * Categorias de documentos do checklist IRPF 2026 (ano-calendário 2025).
 * Usado nos cards de upload e na barra de progresso.
 */

export const IRPF2026_CATEGORIAS: { code: string; label: string }[] = [
  { code: 'dados_cadastrais', label: 'Dados cadastrais atualizados' },
  { code: 'rendimentos_salario', label: 'Rendimentos – salários, pró-labore, aposentadoria, pensão' },
  { code: 'rendimentos_bancarios', label: 'Informes bancários, aplicações, corretoras e previdência' },
  { code: 'rendimentos_aluguel', label: 'Comprovantes de aluguéis recebidos' },
  { code: 'rendimentos_exterior', label: 'Rendimentos do exterior' },
  { code: 'lucros_dividendos', label: 'Lucros e dividendos' },
  { code: 'despesas_medicas', label: 'Despesas médicas e odontológicas' },
  { code: 'plano_saude', label: 'Plano de saúde' },
  { code: 'despesas_educacao', label: 'Despesas com educação' },
  { code: 'pensao_alimenticia', label: 'Pensão alimentícia judicial' },
  { code: 'previdencia_privada', label: 'Previdência privada dedutível' },
  { code: 'outras_deducoes', label: 'Outras deduções fiscais' },
  { code: 'bens_imoveis_veiculos', label: 'Compra e venda de imóveis, veículos e bens (2025)' },
  { code: 'saldos_investimentos', label: 'Saldos bancários e investimentos' },
  { code: 'financiamentos_emprestimos', label: 'Financiamentos, empréstimos e consórcios' },
  { code: 'participacao_societaria', label: 'Participação societária (alteração)' },
  { code: 'criptoativos_exterior', label: 'Criptoativos e bens no exterior' },
  { code: 'movimentacoes_heranca_doacao', label: 'Herança ou doação' },
  { code: 'acoes_judiciais', label: 'Ações judiciais com recebimento de valores' },
  { code: 'bolsa_valores', label: 'Operações em bolsa de valores' },
  { code: 'atividade_rural', label: 'Atividade rural' },
  { code: 'novos_ultima_declaracao', label: '(Novos) Última declaração IR' },
  { code: 'novos_recibo_entrega', label: '(Novos) Recibo de entrega da última declaração' },
  { code: 'novos_docs_pessoais', label: '(Novos) Documentos pessoais' },
  { code: 'outros', label: 'Outros documentos' },
];

export const STATUS_DECLARACAO_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  aguardando_docs: 'Aguardando documentos',
  em_analise: 'Em análise',
  documentacao_incompleta: 'Documentação incompleta',
  concluida: 'Concluída',
};
