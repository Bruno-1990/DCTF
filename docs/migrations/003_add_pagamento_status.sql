-- Migração 003: Adicionar campos de status de pagamento na tabela dctf_declaracoes
-- Data: 2025-01-XX
-- Descrição: Adiciona campos para rastrear status de pagamento de débitos DCTF

-- Adicionar colunas de pagamento
ALTER TABLE dctf_declaracoes 
ADD COLUMN IF NOT EXISTS status_pagamento VARCHAR(20) DEFAULT 'pendente',
ADD COLUMN IF NOT EXISTS data_pagamento DATE,
ADD COLUMN IF NOT EXISTS comprovante_pagamento VARCHAR(255),
ADD COLUMN IF NOT EXISTS observacoes_pagamento TEXT,
ADD COLUMN IF NOT EXISTS usuario_que_atualizou VARCHAR(255),
ADD COLUMN IF NOT EXISTS data_atualizacao_pagamento TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Adicionar comentários para documentação
COMMENT ON COLUMN dctf_declaracoes.status_pagamento IS 'Status do pagamento: pendente, pago, parcelado, cancelado, em_analise';
COMMENT ON COLUMN dctf_declaracoes.data_pagamento IS 'Data em que o pagamento foi efetuado';
COMMENT ON COLUMN dctf_declaracoes.comprovante_pagamento IS 'Número do comprovante de pagamento (DARF, DAS, etc)';
COMMENT ON COLUMN dctf_declaracoes.observacoes_pagamento IS 'Observações sobre o pagamento';
COMMENT ON COLUMN dctf_declaracoes.usuario_que_atualizou IS 'Usuário que atualizou o status de pagamento';
COMMENT ON COLUMN dctf_declaracoes.data_atualizacao_pagamento IS 'Data e hora da última atualização do status de pagamento';

-- Criar índice para consultas rápidas de pendências
CREATE INDEX IF NOT EXISTS idx_dctf_status_pagamento 
ON dctf_declaracoes(status_pagamento) 
WHERE status_pagamento = 'pendente' AND saldo_a_pagar > 0;

-- Criar índice composto para consultas por cliente e status
CREATE INDEX IF NOT EXISTS idx_dctf_cliente_status_pagamento 
ON dctf_declaracoes(cliente_id, status_pagamento) 
WHERE status_pagamento = 'pendente';

-- Adicionar constraint para valores válidos de status
ALTER TABLE dctf_declaracoes 
ADD CONSTRAINT IF NOT EXISTS check_status_pagamento 
CHECK (status_pagamento IN ('pendente', 'pago', 'parcelado', 'cancelado', 'em_analise'));

