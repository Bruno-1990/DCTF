-- Tabela de mapeamento leve de códigos de receita -> tributo
create table if not exists public.codigo_receita_map (
  codigo text primary key,
  tributo text not null,
  descricao text
);

-- seeds mínimos (idempotentes)
insert into public.codigo_receita_map (codigo, tributo, descricao) values
  ('8109','PIS','PIS - Faturamento'),
  ('2172','COFINS','COFINS - Faturamento')
on conflict (codigo) do nothing;

insert into public.codigo_receita_map (codigo, tributo, descricao) values
  ('2089','IRPJ','IRPJ - Lucro Presumido'),
  ('2372','CSLL','CSLL - Lucro Presumido'),
  ('1099','INSS','CP Segurados - Contribuintes Individuais'),
  ('1082','INSS','CP Segurados - Empregados/Avulso'),
  ('1138','INSS','CP Patronal - Empregados/Avulsos')
on conflict (codigo) do nothing;

-- View: Pagamentos agregados por competência e código
create or replace view public.vw_pagamentos_competencia as
select
  rp.cnpj_contribuinte,
  coalesce(
    nullif(rp.competencia, ''),
    to_char( date_trunc('month', (rp.periodo_apuracao::timestamptz)::date), 'YYYY-MM'),
    to_char( date_trunc('month', (rp.data_arrecadacao::timestamptz)::date), 'YYYY-MM')
  ) as competencia,
  coalesce(nullif(rp.codigo_receita_linha,''), nullif(rp.codigo_receita_doc,'')) as codigo_receita,
  sum(coalesce(rp.valor_principal_linha, rp.valor_principal, 0)) as total_principal,
  sum(coalesce(rp.valor_documento, 0)) as total_documento,
  max(
    greatest(
      0,
      ((rp.data_arrecadacao::timestamptz)::date - (rp.data_vencimento::timestamptz)::date)
    )
  ) as atraso_max_dias
from public.receita_pagamentos rp
group by 1,2,3;

-- View: Declarações agregadas por competência (total declarado)
create or replace view public.vw_dctf_competencia as
select
  d.cliente_id,
  d.periodo as competencia,
  sum(coalesce(dd.valor, 0)) as total_declarado
from public.dctf_declaracoes d
left join public.dctf_dados dd
  on dd.declaracao_id = d.id
group by 1,2;


