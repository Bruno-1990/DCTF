-- Constraints de Negócio para DCTF
-- Implementa regras de integridade referencial e validações específicas

-- ==============================================
-- CONSTRAINTS DE INTEGRIDADE REFERENCIAL
-- ==============================================

-- Constraint: Cliente deve existir antes de criar DCTF
ALTER TABLE dctf_declaracoes 
ADD CONSTRAINT fk_dctf_cliente 
FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE;

-- Constraint: DCTF deve existir antes de criar DCTF Dados
ALTER TABLE dctf_dados 
ADD CONSTRAINT fk_dctf_dados_declaracao 
FOREIGN KEY (dctf_id) REFERENCES dctf_declaracoes(id) ON DELETE CASCADE;

-- Constraint: DCTF deve existir antes de criar Análise
ALTER TABLE analises 
ADD CONSTRAINT fk_analise_dctf 
FOREIGN KEY (dctf_id) REFERENCES dctf_declaracoes(id) ON DELETE CASCADE;

-- Constraint: DCTF deve existir antes de criar Flags
ALTER TABLE flags 
ADD CONSTRAINT fk_flag_dctf 
FOREIGN KEY (dctf_id) REFERENCES dctf_declaracoes(id) ON DELETE CASCADE;

-- Constraint: Cliente deve existir antes de criar Relatório
ALTER TABLE relatorios 
ADD CONSTRAINT fk_relatorio_cliente 
FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE;

-- ==============================================
-- CONSTRAINTS DE VALIDAÇÃO DE PERÍODOS
-- ==============================================

-- Constraint: Período deve estar no formato YYYY-MM
ALTER TABLE dctf_declaracoes 
ADD CONSTRAINT chk_dctf_periodo_formato 
CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- Constraint: Período não pode ser futuro além de 3 meses
ALTER TABLE dctf_declaracoes 
ADD CONSTRAINT chk_dctf_periodo_futuro 
CHECK (periodo <= TO_CHAR(CURRENT_DATE + INTERVAL '3 months', 'YYYY-MM'));

-- Constraint: Período não pode ser anterior a 2020
ALTER TABLE dctf_declaracoes 
ADD CONSTRAINT chk_dctf_periodo_historico 
CHECK (periodo >= '2020-01');

-- Constraint: Data de ocorrência deve estar dentro do período
ALTER TABLE dctf_dados 
ADD CONSTRAINT chk_dctf_dados_data_periodo 
CHECK (
  data_ocorrencia IS NULL OR 
  TO_CHAR(data_ocorrencia, 'YYYY-MM') = (
    SELECT periodo FROM dctf_declaracoes WHERE id = dctf_dados.dctf_id
  )
);

-- ==============================================
-- CONSTRAINTS DE VALORES OBRIGATÓRIOS
-- ==============================================

-- Constraint: Valores monetários não podem ser negativos
ALTER TABLE dctf_dados 
ADD CONSTRAINT chk_dctf_dados_valor_positivo 
CHECK (valor >= 0);

-- Constraint: Valores de receita devem ser positivos
ALTER TABLE dctf_dados 
ADD CONSTRAINT chk_dctf_dados_receita_positiva 
CHECK (
  codigo NOT LIKE '001%' OR valor > 0
);

-- Constraint: Valores de dedução não podem exceder receita
ALTER TABLE dctf_dados 
ADD CONSTRAINT chk_dctf_dados_deducao_limite 
CHECK (
  codigo NOT LIKE '1%' OR 
  valor <= (
    SELECT COALESCE(SUM(valor), 0) 
    FROM dctf_dados d2 
    WHERE d2.dctf_id = dctf_dados.dctf_id 
    AND d2.codigo LIKE '001%'
  )
);

-- Constraint: Código DCTF deve existir na tabela de códigos
ALTER TABLE dctf_dados 
ADD CONSTRAINT fk_dctf_dados_codigo 
FOREIGN KEY (codigo) REFERENCES dctf_codes(codigo);

-- Constraint: Código de receita deve existir se informado
ALTER TABLE dctf_dados 
ADD CONSTRAINT fk_dctf_dados_codigo_receita 
FOREIGN KEY (codigo_receita) REFERENCES dctf_receita_codes(codigo);

-- ==============================================
-- CONSTRAINTS DE CONSISTÊNCIA DE DADOS
-- ==============================================

-- Constraint: Receita líquida deve ser calculada corretamente
ALTER TABLE dctf_declaracoes 
ADD CONSTRAINT chk_dctf_receita_liquida 
CHECK (
  receita_liquida = receita_bruta - COALESCE(total_deducoes, 0)
);

-- Constraint: Total de impostos deve ser calculado corretamente
ALTER TABLE dctf_declaracoes 
ADD CONSTRAINT chk_dctf_total_impostos 
CHECK (
  total_impostos = COALESCE(irrf, 0) + COALESCE(csll, 0) + 
                   COALESCE(pis, 0) + COALESCE(cofins, 0) + 
                   COALESCE(inss, 0) + COALESCE(outros_impostos, 0)
);

-- Constraint: Status deve ser válido
ALTER TABLE dctf_declaracoes 
ADD CONSTRAINT chk_dctf_status_valido 
CHECK (status IN ('rascunho', 'validando', 'validado', 'processando', 'processado', 'erro'));

-- Constraint: Tipo de arquivo deve ser válido
ALTER TABLE dctf_declaracoes 
ADD CONSTRAINT chk_dctf_tipo_arquivo 
CHECK (tipo_arquivo IN ('xls', 'xlsx', 'csv'));

-- ==============================================
-- CONSTRAINTS DE FORMATO DE DADOS
-- ==============================================

-- Constraint: CNPJ deve ter formato válido
ALTER TABLE clientes 
ADD CONSTRAINT chk_cliente_cnpj_formato 
CHECK (cnpj ~ '^[0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2}$');

-- Constraint: Email deve ter formato válido
ALTER TABLE clientes 
ADD CONSTRAINT chk_cliente_email_formato 
CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- Constraint: Telefone deve ter formato válido
ALTER TABLE clientes 
ADD CONSTRAINT chk_cliente_telefone_formato 
CHECK (telefone ~ '^[0-9]{10,11}$');

-- Constraint: Código DCTF deve ter formato válido
ALTER TABLE dctf_dados 
ADD CONSTRAINT chk_dctf_dados_codigo_formato 
CHECK (codigo ~ '^[0-9]{3}$');

-- Constraint: Código de receita deve ter formato válido
ALTER TABLE dctf_dados 
ADD CONSTRAINT chk_dctf_dados_codigo_receita_formato 
CHECK (
  codigo_receita IS NULL OR 
  codigo_receita ~ '^[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{2}\.[0-9]{2}$'
);

-- ==============================================
-- CONSTRAINTS DE NEGÓCIO ESPECÍFICOS
-- ==============================================

-- Constraint: Não pode haver DCTF duplicado para o mesmo cliente e período
ALTER TABLE dctf_declaracoes 
ADD CONSTRAINT uk_dctf_cliente_periodo 
UNIQUE (cliente_id, periodo);

-- Constraint: Análise só pode ser criada para DCTF validado
ALTER TABLE analises 
ADD CONSTRAINT chk_analise_dctf_validado 
CHECK (
  EXISTS (
    SELECT 1 FROM dctf_declaracoes 
    WHERE id = analises.dctf_id 
    AND status IN ('validado', 'processado')
  )
);

-- Constraint: Flag só pode ser criada para DCTF processado
ALTER TABLE flags 
ADD CONSTRAINT chk_flag_dctf_processado 
CHECK (
  EXISTS (
    SELECT 1 FROM dctf_declaracoes 
    WHERE id = flags.dctf_id 
    AND status = 'processado'
  )
);

-- Constraint: Relatório só pode ser gerado para DCTF processado
ALTER TABLE relatorios 
ADD CONSTRAINT chk_relatorio_dctf_processado 
CHECK (
  EXISTS (
    SELECT 1 FROM dctf_declaracoes 
    WHERE id = relatorios.dctf_id 
    AND status = 'processado'
  )
);

-- ==============================================
-- CONSTRAINTS DE PERFORMANCE E LIMITES
-- ==============================================

-- Constraint: Limite de tamanho de arquivo (10MB)
ALTER TABLE dctf_declaracoes 
ADD CONSTRAINT chk_dctf_tamanho_arquivo 
CHECK (tamanho_arquivo <= 10485760); -- 10MB em bytes

-- Constraint: Limite de linhas por DCTF (10000)
ALTER TABLE dctf_declaracoes 
ADD CONSTRAINT chk_dctf_linhas_limite 
CHECK (total_linhas <= 10000);

-- Constraint: Limite de observações (1000 caracteres)
ALTER TABLE dctf_dados 
ADD CONSTRAINT chk_dctf_dados_observacoes_limite 
CHECK (LENGTH(observacoes) <= 1000);

-- ==============================================
-- TRIGGERS PARA VALIDAÇÕES COMPLEXAS
-- ==============================================

-- Função para validar consistência de dados DCTF
CREATE OR REPLACE FUNCTION validate_dctf_consistency()
RETURNS TRIGGER AS $$
DECLARE
  receita_bruta_total DECIMAL(15,2);
  receita_liquida_total DECIMAL(15,2);
  deducoes_total DECIMAL(15,2);
BEGIN
  -- Calcular totais dos dados
  SELECT 
    COALESCE(SUM(CASE WHEN codigo LIKE '001%' THEN valor ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN codigo LIKE '1%' THEN valor ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN codigo LIKE '1%' AND codigo NOT LIKE '001%' THEN valor ELSE 0 END), 0)
  INTO receita_bruta_total, receita_liquida_total, deducoes_total
  FROM dctf_dados 
  WHERE dctf_id = NEW.dctf_id;

  -- Validar receita líquida
  IF NEW.receita_liquida != (receita_bruta_total - deducoes_total) THEN
    RAISE EXCEPTION 'Receita líquida inconsistente com dados calculados';
  END IF;

  -- Validar receita bruta
  IF NEW.receita_bruta != receita_bruta_total THEN
    RAISE EXCEPTION 'Receita bruta inconsistente com dados calculados';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para validar consistência ao atualizar DCTF
CREATE TRIGGER trg_validate_dctf_consistency
  BEFORE UPDATE ON dctf_declaracoes
  FOR EACH ROW
  EXECUTE FUNCTION validate_dctf_consistency();

-- Função para validar códigos DCTF ativos
CREATE OR REPLACE FUNCTION validate_dctf_code_active()
RETURNS TRIGGER AS $$
DECLARE
  code_exists BOOLEAN;
  period_valid BOOLEAN;
BEGIN
  -- Verificar se código existe e está ativo
  SELECT EXISTS(
    SELECT 1 FROM dctf_codes 
    WHERE codigo = NEW.codigo AND ativo = TRUE
  ) INTO code_exists;

  IF NOT code_exists THEN
    RAISE EXCEPTION 'Código DCTF % não existe ou não está ativo', NEW.codigo;
  END IF;

  -- Verificar se código está ativo no período
  SELECT EXISTS(
    SELECT 1 FROM dctf_codes c
    JOIN dctf_declaracoes d ON d.id = NEW.dctf_id
    WHERE c.codigo = NEW.codigo 
    AND c.ativo = TRUE
    AND (c.periodo_inicio IS NULL OR d.periodo >= c.periodo_inicio)
    AND (c.periodo_fim IS NULL OR d.periodo <= c.periodo_fim)
  ) INTO period_valid;

  IF NOT period_valid THEN
    RAISE EXCEPTION 'Código DCTF % não está ativo no período da declaração', NEW.codigo;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para validar códigos DCTF
CREATE TRIGGER trg_validate_dctf_code_active
  BEFORE INSERT OR UPDATE ON dctf_dados
  FOR EACH ROW
  EXECUTE FUNCTION validate_dctf_code_active();

-- ==============================================
-- ÍNDICES PARA PERFORMANCE
-- ==============================================

-- Índices compostos para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_dctf_declaracoes_cliente_periodo 
ON dctf_declaracoes(cliente_id, periodo);

CREATE INDEX IF NOT EXISTS idx_dctf_dados_codigo_valor 
ON dctf_dados(codigo, valor);

CREATE INDEX IF NOT EXISTS idx_dctf_dados_data_ocorrencia 
ON dctf_dados(data_ocorrencia);

CREATE INDEX IF NOT EXISTS idx_analises_dctf_tipo 
ON analises(dctf_id, tipo);

CREATE INDEX IF NOT EXISTS idx_flags_dctf_severidade 
ON flags(dctf_id, severidade);

-- Índices parciais para otimização
CREATE INDEX IF NOT EXISTS idx_dctf_declaracoes_status_ativo 
ON dctf_declaracoes(status) 
WHERE status IN ('validado', 'processado');

CREATE INDEX IF NOT EXISTS idx_dctf_dados_valor_positivo 
ON dctf_dados(valor) 
WHERE valor > 0;

-- ==============================================
-- COMENTÁRIOS NAS CONSTRAINTS
-- ==============================================

COMMENT ON CONSTRAINT fk_dctf_cliente ON dctf_declaracoes IS 'Garante que cliente existe antes de criar DCTF';
COMMENT ON CONSTRAINT chk_dctf_periodo_formato ON dctf_declaracoes IS 'Valida formato YYYY-MM do período';
COMMENT ON CONSTRAINT chk_dctf_dados_valor_positivo ON dctf_dados IS 'Valores não podem ser negativos';
COMMENT ON CONSTRAINT uk_dctf_cliente_periodo ON dctf_declaracoes IS 'Evita DCTF duplicado por cliente/período';
COMMENT ON CONSTRAINT chk_dctf_receita_liquida ON dctf_declaracoes IS 'Valida cálculo de receita líquida';
COMMENT ON CONSTRAINT chk_dctf_total_impostos ON dctf_declaracoes IS 'Valida cálculo de total de impostos';
