-- Migração: Corrigir funções que referenciam campo cnpj inexistente
-- Objetivo: Atualizar funções PostgreSQL para usar cnpj_limpo em vez de cnpj
-- Data: 2025-01-13

-- ============================================================================
-- FUNÇÃO 1: set_cliente_id_by_cnpj
-- ============================================================================
-- Esta função é executada por um trigger na tabela dctf_declaracoes
-- Precisa usar cnpj_limpo em vez de cnpj
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_cliente_id_by_cnpj()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Se cliente_id é null e temos um CNPJ na declaração, buscar cliente por cnpj_limpo
  IF NEW.cliente_id IS NULL AND NEW.cnpj IS NOT NULL THEN
    -- Normalizar o CNPJ da declaração e buscar na tabela clientes usando cnpj_limpo
    SELECT id INTO NEW.cliente_id 
    FROM public.clientes 
    WHERE cnpj_limpo = public.normalize_cnpj(NEW.cnpj)
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- FUNÇÃO 2: associar_declaracoes_a_cliente
-- ============================================================================
-- Esta função é executada quando um novo cliente é inserido
-- Precisa usar cnpj_limpo em vez de cnpj na tabela clientes
-- ============================================================================
CREATE OR REPLACE FUNCTION public.associar_declaracoes_a_cliente()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Associar declarações DCTF ao cliente usando cnpj_limpo
  -- A tabela dctf_declaracoes ainda tem coluna cnpj, então normalizamos ela
  UPDATE public.dctf_declaracoes
  SET cliente_id = NEW.id
  WHERE cliente_id IS NULL
    AND public.normalize_cnpj(dctf_declaracoes.cnpj) = NEW.cnpj_limpo;
  
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- FUNÇÃO 3: importar_dctf_json
-- ============================================================================
-- Esta função importa dados DCTF de JSON
-- Precisa usar cnpj_limpo em vez de cnpj na tabela clientes
-- ============================================================================
CREATE OR REPLACE FUNCTION public.importar_dctf_json(payload jsonb)
RETURNS TABLE(declaracao_id uuid, cliente_id uuid, periodo text, status text)
LANGUAGE plpgsql
AS $function$
DECLARE
  item jsonb;
  cnpj_raw text;
  cnpj_digits text;
  cnpj_limpo text;
  v_cliente_id uuid;
  v_declaracao_id uuid;
  v_periodo text;
  v_data date;
  v_status text;
  v_obs text;
  v_metadados jsonb;
BEGIN
  IF jsonb_typeof(payload) <> 'array' THEN
    RAISE EXCEPTION 'payload deve ser um array JSON';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(payload)
  LOOP
    cnpj_raw := COALESCE(item->>'CNPJ', '');
    cnpj_digits := REGEXP_REPLACE(cnpj_raw, '[^0-9]', '', 'g');
    cnpj_limpo := cnpj_digits; -- Usar apenas dígitos (cnpj_limpo)
    
    IF LENGTH(cnpj_limpo) != 14 THEN
      CONTINUE; -- Pular se CNPJ inválido
    END IF;

    -- Buscar cliente por cnpj_limpo (não mais por cnpj formatado)
    SELECT id INTO v_cliente_id 
    FROM public.clientes 
    WHERE cnpj_limpo = cnpj_limpo 
    LIMIT 1;
    
    -- Criar cliente se não existir (usando cnpj_limpo)
    IF v_cliente_id IS NULL THEN
      INSERT INTO public.clientes (id, razao_social, cnpj_limpo)
      VALUES (
        gen_random_uuid(), 
        COALESCE(item->>'Razão Social', 'Cliente sem nome'), 
        cnpj_limpo
      )
      ON CONFLICT (cnpj_limpo) DO NOTHING
      RETURNING id INTO v_cliente_id;
      
      IF v_cliente_id IS NULL THEN
        SELECT id INTO v_cliente_id 
        FROM public.clientes 
        WHERE cnpj_limpo = cnpj_limpo 
        LIMIT 1;
      END IF;
    END IF;

    -- Período MM/YYYY -> YYYY-MM
    v_periodo := NULL;
    IF COALESCE(item->>'Período de Apuração','') <> '' THEN
      v_periodo := TO_CHAR(TO_DATE('01/'||(item->>'Período de Apuração'),'DD/MM/YYYY'),'YYYY-MM');
    END IF;

    -- Data (DD/MM/YYYY)
    IF COALESCE(item->>'Data de Transmissão','') <> '' THEN
      v_data := TO_DATE(item->>'Data de Transmissão', 'DD/MM/YYYY');
    ELSE
      v_data := NOW()::date;
    END IF;

    -- Status a partir de "Situação"
    v_status := LOWER(COALESCE(item->>'Situação','pendente'));
    IF v_status NOT IN ('pendente','processando','concluido','erro') THEN
      v_status := 'pendente';
    END IF;

    v_metadados := jsonb_build_object(
      'Tipo_NI', item->>'Tipo NI',
      'Hora_Transmissao', item->>'Hora da Transmissão',
      'Categoria', item->>'Categoria',
      'Origem', item->>'Origem',
      'Tipo', item->>'Tipo',
      'Debito_Apurado', item->>'Débito Apurado',
      'Saldo_a_Pagar', item->>'Saldo a Pagar'
    );

    v_declaracao_id := gen_random_uuid();
    INSERT INTO public.dctf_declaracoes (id, cliente_id, periodo, data_declaracao, status, metadados, total_registros)
    VALUES (v_declaracao_id, v_cliente_id, v_periodo, v_data, v_status, v_metadados, 0);

    RETURN QUERY SELECT v_declaracao_id, v_cliente_id, v_periodo, v_status;
  END LOOP;
END;
$function$;

-- Comentários
COMMENT ON FUNCTION public.set_cliente_id_by_cnpj() IS 'Trigger function para associar cliente a declaração DCTF usando cnpj_limpo';
COMMENT ON FUNCTION public.associar_declaracoes_a_cliente() IS 'Trigger function para associar declarações DCTF a um novo cliente usando cnpj_limpo';
COMMENT ON FUNCTION public.importar_dctf_json(jsonb) IS 'Função para importar dados DCTF de JSON usando cnpj_limpo';

