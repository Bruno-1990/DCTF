/**
 * Schemas de validação específicos para cada entidade
 * Centraliza todas as validações Joi do sistema
 */

import Joi from 'joi';
import { commonSchemas } from './validation';

// ==============================================
// SCHEMAS DE CLIENTE
// ==============================================

export const clienteSchemas = {
  create: Joi.object({
    razao_social: Joi.string().min(2).max(255).required().messages({
      'string.min': 'Razão Social deve ter pelo menos 2 caracteres',
      'string.max': 'Razão Social deve ter no máximo 255 caracteres',
      'any.required': 'Razão Social é obrigatória',
    }),
    cnpj_limpo: Joi.string().pattern(/^\d{14}$/).required().messages({
      'string.pattern.base': 'CNPJ Limpo deve conter 14 dígitos',
      'any.required': 'CNPJ é obrigatório',
    }),
    cnpj: Joi.string().pattern(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/).optional().allow('').messages({
      'string.pattern.base': 'CNPJ deve estar no formato 00.000.000/0000-00',
    }),
    email: commonSchemas.email.optional().allow('').messages({
      'string.email': 'Email deve ter um formato válido',
    }),
    // Telefone pode vir em múltiplos formatos (inclusive múltiplos números)
    telefone: Joi.string().max(255).optional().allow(''),
    endereco: Joi.string().max(500).optional().allow('').messages({
      'string.max': 'Endereço deve ter no máximo 500 caracteres',
    }),
    tipo_empresa: Joi.string()
      .valid('Matriz', 'Filial')
      .optional()
      .allow('', null)
      .messages({
        'any.only': 'Tipo de empresa deve ser: Matriz ou Filial',
      }),
    regime_tributario: Joi.string()
      .valid('Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'A Definir')
      .optional()
      .allow('', null)
      .messages({
        'any.only': 'Regime tributário deve ser: Simples Nacional, Lucro Presumido, Lucro Real ou A Definir',
      }),
  }).unknown(true),

  update: Joi.object({
    razao_social: Joi.string().min(2).max(255).optional().messages({
      'string.min': 'Razão Social deve ter pelo menos 2 caracteres',
      'string.max': 'Razão Social deve ter no máximo 255 caracteres',
    }),
    cnpj_limpo: Joi.string().pattern(/^\d{14}$/).optional().messages({
      'string.pattern.base': 'CNPJ Limpo deve conter 14 dígitos',
    }),
    cnpj: Joi.string().pattern(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/).optional().allow('').messages({
      'string.pattern.base': 'CNPJ deve estar no formato 00.000.000/0000-00',
    }),
    email: commonSchemas.email.optional().allow(''),
    telefone: Joi.string().max(255).optional().allow(''),
    endereco: Joi.string().max(500).optional().allow(''),
    tipo_empresa: Joi.string()
      .valid('Matriz', 'Filial')
      .optional()
      .allow('', null)
      .messages({
        'any.only': 'Tipo de empresa deve ser: Matriz ou Filial',
      }),
    regime_tributario: Joi.string()
      .valid('Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'A Definir')
      .optional()
      .allow('', null)
      .messages({
        'any.only': 'Regime tributário deve ser: Simples Nacional, Lucro Presumido, Lucro Real ou A Definir',
      }),
  }).unknown(true),

  params: Joi.object({
    id: commonSchemas.uuid
  }),

  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(500).default(10),
    search: Joi.string().allow('').optional(),
    nome: Joi.string().allow('').optional(),
    cnpj: Joi.alternatives().try(
      commonSchemas.cnpj,
      Joi.string().allow('')
    ).optional()
    ,
    socio: Joi.string().allow('').optional()
  })
};

// ==============================================
// SCHEMAS DE DCTF
// ==============================================

export const dctfSchemas = {
  create: Joi.object({
    clienteId: commonSchemas.uuid.messages({
      'any.required': 'ID do cliente é obrigatório',
    }),
    periodo: commonSchemas.periodo.required().messages({
      'any.required': 'Período é obrigatório',
    }),
    dataDeclaracao: commonSchemas.date.required().messages({
      'any.required': 'Data da declaração é obrigatória',
    }),
    status: Joi.string()
      .valid('pendente', 'processando', 'concluido', 'erro')
      .default('pendente')
      .messages({
        'any.only': 'Status deve ser: pendente, processando, concluido ou erro',
      }),
    arquivoOriginal: Joi.string().uri().optional().messages({
      'string.uri': 'Arquivo original deve ser uma URI válida',
    }),
    observacoes: Joi.string().max(1000).optional().allow('').messages({
      'string.max': 'Observações devem ter no máximo 1000 caracteres',
    }),
    debitoApurado: Joi.number().precision(2).optional(),
    saldoAPagar: Joi.number().precision(2).optional(),
    situacao: Joi.string().max(100).optional().allow(''),
  }),

  update: Joi.object({
    clienteId: commonSchemas.uuid.optional(),
    periodo: commonSchemas.periodo.optional(),
    dataDeclaracao: commonSchemas.date.optional(),
    status: Joi.string()
      .valid('pendente', 'processando', 'concluido', 'erro')
      .optional(),
    arquivoOriginal: Joi.string().uri().optional(),
    observacoes: Joi.string().max(1000).optional().allow(''),
    debitoApurado: Joi.number().precision(2).optional(),
    saldoAPagar: Joi.number().precision(2).optional(),
    situacao: Joi.string().max(100).optional().allow(''),
  }),

  params: Joi.object({
    id: commonSchemas.uuid
  }),

  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    clienteId: commonSchemas.uuid.optional(),
    periodo: Joi.string().pattern(/^\d{4}-\d{2}$/).optional().allow('').messages({
      'string.pattern.base': 'Período deve estar no formato YYYY-MM'
    }),
    periodoTransmissao: Joi.string().pattern(/^\d{4}-\d{2}$/).optional().allow('').messages({
      'string.pattern.base': 'Período de transmissão deve estar no formato YYYY-MM (ex: 2026-01)'
    }),
    status: Joi.string()
      .valid('pendente', 'processando', 'concluido', 'erro')
      .optional(),
    situacao: Joi.string().max(100).optional().allow(''),
    tipo: Joi.string().max(100).optional().allow(''),
    search: Joi.string().allow('').optional(),
    orderBy: Joi.string()
      .valid('razaoSocial', 'cnpj', 'periodo', 'dataDeclaracao', 'dataTransmissao', 'situacao', 'debitoApurado', 'saldoAPagar')
      .optional(),
    order: Joi.string()
      .valid('asc', 'desc')
      .optional()
  })
};

// ==============================================
// SCHEMAS DE RELATÓRIO
// ==============================================

export const relatorioSchemas = {
  create: Joi.object({
    declaracaoId: commonSchemas.uuid.required().messages({
      'any.required': 'ID da declaração é obrigatório',
    }),
    tipoRelatorio: Joi.string().max(50).required().messages({
      'string.max': 'Tipo de relatório deve ter no máximo 50 caracteres',
      'any.required': 'Tipo de relatório é obrigatório',
    }),
    titulo: Joi.string().min(5).max(255).required().messages({
      'string.min': 'Título deve ter pelo menos 5 caracteres',
      'string.max': 'Título deve ter no máximo 255 caracteres',
      'any.required': 'Título é obrigatório',
    }),
    conteudo: Joi.string().optional().allow('').messages({
      'string.base': 'Conteúdo deve ser uma string',
    }),
    arquivoPdf: Joi.string().uri().optional().messages({
      'string.uri': 'Arquivo PDF deve ser uma URI válida',
    }),
    parametros: Joi.object().optional().messages({
      'object.base': 'Parâmetros deve ser um objeto',
    }),
  }),

  update: Joi.object({
    declaracaoId: commonSchemas.uuid.optional(),
    tipoRelatorio: Joi.string().max(50).optional(),
    titulo: Joi.string().min(5).max(255).optional(),
    conteudo: Joi.string().optional().allow(''),
    arquivoPdf: Joi.string().uri().optional(),
    parametros: Joi.object().optional(),
  }),

  generate: Joi.object({
    declaracaoId: commonSchemas.uuid.required().messages({
      'any.required': 'ID da declaração é obrigatório',
    }),
    tipoRelatorio: Joi.string().max(50).required().messages({
      'any.required': 'Tipo de relatório é obrigatório',
    }),
    parametros: Joi.object().optional()
  }),

  params: Joi.object({
    id: commonSchemas.uuid
  }),

  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    declaracaoId: commonSchemas.uuid.optional(),
    tipoRelatorio: Joi.string().max(50).optional()
  })
};

// ==============================================
// SCHEMAS DE CÓDIGOS DCTF
// ==============================================

export const dctfCodesSchemas = {
  create: Joi.object({
    codigo: Joi.string().max(10).required().messages({
      'string.max': 'Código deve ter no máximo 10 caracteres',
      'any.required': 'Código é obrigatório',
    }),
    descricao: Joi.string().max(255).required().messages({
      'string.max': 'Descrição deve ter no máximo 255 caracteres',
      'any.required': 'Descrição é obrigatória',
    }),
    tipo: Joi.string()
      .valid('receita', 'deducao', 'retencao', 'outros')
      .required()
      .messages({
        'any.only': 'Tipo deve ser: receita, deducao, retencao ou outros',
        'any.required': 'Tipo é obrigatório',
      }),
    ativo: Joi.boolean().default(true),
    periodoInicio: commonSchemas.periodo.optional(),
    periodoFim: commonSchemas.periodo.optional(),
    observacoes: Joi.string().max(1000).optional().allow('')
  }),

  update: Joi.object({
    codigo: Joi.string().max(10).optional(),
    descricao: Joi.string().max(255).optional(),
    tipo: Joi.string()
      .valid('receita', 'deducao', 'retencao', 'outros')
      .optional(),
    ativo: Joi.boolean().optional(),
    periodoInicio: commonSchemas.periodo.optional(),
    periodoFim: commonSchemas.periodo.optional(),
    observacoes: Joi.string().max(1000).optional().allow('')
  }),

  params: Joi.object({
    codigo: Joi.string().max(10).required()
  }),

  query: Joi.object({
    tipo: Joi.string()
      .valid('receita', 'deducao', 'retencao', 'outros')
      .optional(),
    ativo: Joi.boolean().optional(),
    periodo: commonSchemas.periodo.optional(),
    q: Joi.string().optional() // Query de busca
  })
};

// ==============================================
// SCHEMAS DE ANÁLISE
// ==============================================

export const analiseSchemas = {
  create: Joi.object({
    dctfId: commonSchemas.uuid.required().messages({
      'any.required': 'ID da declaração DCTF é obrigatório',
    }),
    tipoAnalise: Joi.string().max(50).required().messages({
      'string.max': 'Tipo de análise deve ter no máximo 50 caracteres',
      'any.required': 'Tipo de análise é obrigatório',
    }),
    severidade: Joi.string()
      .valid('baixa', 'media', 'alta', 'critica')
      .default('media')
      .messages({
        'any.only': 'Severidade deve ser: baixa, media, alta ou critica',
      }),
    descricao: Joi.string().max(1000).optional().allow(''),
    recomendacoes: Joi.array().items(Joi.string()).optional(),
    status: Joi.string()
      .valid('pendente', 'em_analise', 'concluida')
      .default('pendente')
      .messages({
        'any.only': 'Status deve ser: pendente, em_analise ou concluida',
      })
  }),

  update: Joi.object({
    dctfId: commonSchemas.uuid.optional(),
    tipoAnalise: Joi.string().max(50).optional(),
    severidade: Joi.string()
      .valid('baixa', 'media', 'alta', 'critica')
      .optional(),
    descricao: Joi.string().max(1000).optional().allow(''),
    recomendacoes: Joi.array().items(Joi.string()).optional(),
    status: Joi.string()
      .valid('pendente', 'em_analise', 'concluida')
      .optional()
  }),

  params: Joi.object({
    id: commonSchemas.uuid
  }),

  query: Joi.object({
    dctfId: commonSchemas.uuid.optional(),
    tipoAnalise: Joi.string().max(50).optional(),
    severidade: Joi.string()
      .valid('baixa', 'media', 'alta', 'critica')
      .optional(),
    status: Joi.string()
      .valid('pendente', 'em_analise', 'concluida')
      .optional()
  })
};

// ==============================================
// SCHEMAS DE FLAG
// ==============================================

export const flagSchemas = {
  create: Joi.object({
    dctfId: commonSchemas.uuid.required().messages({
      'any.required': 'ID da declaração DCTF é obrigatório',
    }),
    codigoFlag: Joi.string().max(20).required().messages({
      'string.max': 'Código da flag deve ter no máximo 20 caracteres',
      'any.required': 'Código da flag é obrigatório',
    }),
    descricao: Joi.string().max(500).required().messages({
      'string.max': 'Descrição deve ter no máximo 500 caracteres',
      'any.required': 'Descrição é obrigatória',
    }),
    severidade: Joi.string()
      .valid('baixa', 'media', 'alta', 'critica')
      .default('media')
      .messages({
        'any.only': 'Severidade deve ser: baixa, media, alta ou critica',
      }),
    resolvido: Joi.boolean().default(false),
    resolucao: Joi.string().max(1000).optional().allow('')
  }),

  update: Joi.object({
    dctfId: commonSchemas.uuid.optional(),
    codigoFlag: Joi.string().max(20).optional(),
    descricao: Joi.string().max(500).optional(),
    severidade: Joi.string()
      .valid('baixa', 'media', 'alta', 'critica')
      .optional(),
    resolvido: Joi.boolean().optional(),
    resolucao: Joi.string().max(1000).optional().allow('')
  }),

  resolve: Joi.object({
    resolucao: Joi.string().min(3).max(1000).required().messages({
      'any.required': 'Resolução é obrigatória',
      'string.min': 'Resolução deve ter pelo menos 3 caracteres',
      'string.max': 'Resolução deve ter no máximo 1000 caracteres',
    }),
  }),

  validateRun: Joi.object({
    declaracaoId: commonSchemas.uuid.optional(),
    clienteId: commonSchemas.uuid.optional(),
    periodo: commonSchemas.periodo.optional(),
  }),

  params: Joi.object({
    id: commonSchemas.uuid
  }),

  query: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    orderBy: Joi.string().valid('created_at', 'codigo_flag', 'severidade').optional(),
    order: Joi.string().valid('asc', 'desc').optional(),
    dctfId: commonSchemas.uuid.optional(),
    codigoFlag: Joi.string().max(20).optional(),
    severidade: Joi.string()
      .valid('baixa', 'media', 'alta', 'critica')
      .optional(),
    resolvido: Joi.boolean().optional()
  })
};
