/**
 * Prévia local dos e-mails — grava um .html por aviso, sem enviar nada.
 *
 * Uso: ts-node --transpile-only --files src/scripts/preview-emails.ts <pasta>
 *
 * O aviso de enquadramento sai duas vezes: com os dados REAIS da última
 * apuração (é o que a caixa de entrada vai receber) e com um cenário demo em
 * que TODAS as seções têm conteúdo — só assim dá para revisar o que raramente
 * aparece.
 */
import 'dotenv/config';
import fs from 'fs';
import EmailService from '../services/EmailService';
import { montarHtmlAviso } from '../services/SubstitutoService';
import { cotaAprendizagemService } from '../services/CotaAprendizagemService';
import type { LinhaClassificacao } from '../services/CotaAprendizagemService';
import {
  separarSecoes,
  calcularTotalizadores,
  montarHtmlCota,
  montarHtmlEnquadramento,
} from '../services/cotaAprendizagem.email';

const dir = process.argv[2] || '.';
const gravar = (nome: string, html: string) => {
  fs.writeFileSync(`${dir}/${nome}.html`, html, 'utf-8');
  console.log(`  ${nome}.html`);
};

function demoCota(over: Partial<LinhaClassificacao>): LinhaClassificacao {
  return {
    id: over.razao_social ?? String(Math.random()),
    razao_social: 'EMPRESA DEMO LTDA',
    cnpj: '11222333000181',
    codigo_sci: 100,
    uf: 'ES',
    porte_declarado: null,
    abertura: null,
    sociedade_advogados: false,
    ano: 2026,
    mes: 7,
    bdref: 202607,
    rbaa: 100000,
    rba: 200000,
    porte: 'EPP',
    porte_base: 'EPP',
    motivo: 'RBAA',
    sujeita_cota: false,
    excede_teto_epp: false,
    excede_teto_me: false,
    mes_excesso_limite: null,
    mes_excesso_20pct: null,
    data_efeito: null,
    meses_faltantes: 0,
    meses_faltantes_lista: null,
    dado_confiavel: true,
    impedimento_societario: false,
    inicio_atividade: false,
    revisar_juridico: false,
    revisar_motivos: [],
    porte_anterior: 'EPP',
    mudou: false,
    eventos: [],
    diagnostico: {
      porteAtual: 'EPP',
      proximoPorte: null,
      situacao: 'DENTRO_DA_FAIXA',
      limiteDaFaixaCentavos: 480_000_000,
      folgaCentavos: 0,
      percentualDoLimite: 0,
      dataEfeito: null,
      resumo: '',
      sujeitaCota: false,
    },
    ...over,
  };
}

/** A mesma apuração vira os DOIS avisos: porte (Fiscal) e cota (DP). */
function renderPorteECota(
  clientes: LinhaClassificacao[],
  ano: number,
  mes: number,
  semSci = 0
): { enquadramento: string; cota: string } {
  const secoes = separarSecoes(clientes);
  const entrada = {
    ano,
    mes,
    secoes,
    totais: calcularTotalizadores(clientes, secoes, semSci),
  };
  return {
    enquadramento: montarHtmlEnquadramento(entrada),
    cota: montarHtmlCota(entrada),
  };
}

async function main() {
  console.log('Prévias geradas em', dir);

  // 1. Registros oficiais em aberto
  gravar(
    'email-1-registros-em-aberto',
    EmailService.generateDCTFEmailHTML([
      {
        razao_social: 'METALURGICA SANTOS & FILHOS LTDA',
        cnpj: '12345678000190',
        periodo_apuracao: '2026-07',
        categoria: 'PJ em Geral',
        tipo: 'Original',
        origem: 'eSocial',
        situacao: 'Em andamento',
        debito_apurado: '18400.55',
        saldo_a_pagar: '18400.55',
      },
      {
        razao_social: 'PADARIA CENTRAL LTDA',
        cnpj: '11122233000144',
        periodo_apuracao: '2026-07',
        categoria: 'PJ em Geral',
        tipo: 'Retificadora',
        origem: 'EFD-Reinf',
        situacao: 'Em andamento',
        debito_apurado: '3120.00',
        saldo_a_pagar: '0.00',
      },
      {
        razao_social: 'TRANSPORTES VALE VERDE LTDA',
        cnpj: '45678912000133',
        periodo_apuracao: '2026-06',
        categoria: 'PJ em Geral',
        tipo: 'Original',
        origem: 'eSocial',
        situacao: 'Em andamento',
        debito_apurado: '7890.10',
        saldo_a_pagar: '2100.00',
      },
    ])
  );

  // 2. Clientes com movimento e sem DCTF
  gravar(
    'email-2-movimento-sem-dctf',
    EmailService.generateSemDCTFComMovimentoEmailHTML([
      {
        razao_social: 'ARCANA DESIGN LTDA',
        cnpj: '63231837000161',
        regime_tributario: 'SIMPLES NACIONAL',
        competencia_obrigacao: '07/2026',
        competencia_movimento: '07/2026',
        tipos_movimento: ['CTB', 'FISE'],
        total_movimentacoes: 214,
        prazoVencimento: '2026-08-21',
        diasAteVencimento: 4,
      },
      {
        razao_social: 'OFICINA NOVA ERA LTDA',
        cnpj: '55566677000188',
        regime_tributario: 'LUCRO PRESUMIDO',
        competencia_obrigacao: '07/2026',
        competencia_movimento: '07/2026',
        tipos_movimento: ['FPG'],
        total_movimentacoes: 31,
        prazoVencimento: '2026-08-21',
        diasAteVencimento: 4,
      },
    ])
  );

  // 3. Aviso REOA
  gravar(
    'email-3-reoa',
    montarHtmlAviso(
      {
        threshold: 300000,
        janela: [
          { ano: 2025, mes: 8 },
          { ano: 2026, mes: 7 },
        ],
      },
      [
        {
          razao_social: 'DELTA COMERCIO LTDA',
          cnpj: '11222333000181',
          codigo_sci: 42,
          estabelecimentos: [
            {
              rotulo: 'Matriz',
              meses: [
                { ano: 2026, mes: 5, faturamento: 281450.9, abaixo: true },
                { ano: 2026, mes: 6, faturamento: 350000, abaixo: false },
                { ano: 2026, mes: 7, faturamento: 190320, abaixo: true },
              ],
            },
            {
              rotulo: 'Filial 0002',
              meses: [{ ano: 2026, mes: 7, faturamento: 96000, abaixo: true }],
            },
          ],
        },
        {
          razao_social: 'EPSILON INDUSTRIA LTDA',
          cnpj: '98765432000155',
          codigo_sci: 77,
          estabelecimentos: [
            {
              rotulo: 'Matriz',
              meses: [{ ano: 2026, mes: 4, faturamento: 250100, abaixo: true }],
            },
          ],
        },
      ]
    )
  );

  // 4 e 5. A mesma apuração, nos dois recortes — cenário demo (todas as seções)
  const demo = renderPorteECota(
    [
        demoCota({
          razao_social: 'METALURGICA SANTOS & FILHOS LTDA',
          cnpj: '12345678000190',
          codigo_sci: 512,
          mudou: true,
          porte: 'DEMAIS',
          sujeita_cota: true,
          motivo: 'EXCESSO_20PCT',
          porte_anterior: 'EPP',
          rba: 6_240_880.5,
          data_efeito: '2026-07-01',
        }),
        demoCota({
          razao_social: 'DISTRIBUIDORA HORIZONTE LTDA',
          cnpj: '98765432000155',
          codigo_sci: 301,
          porte: 'EPP',
          rba: 5_640_100,
          excede_teto_epp: true,
          dado_confiavel: false,
          meses_faltantes: 1,
        }),
        demoCota({
          razao_social: 'FINATTO COMERCIO LTDA',
          cnpj: '29236209000130',
          codigo_sci: 435,
          porte: 'EPP',
          rba: 5_030_323.27,
          excede_teto_epp: true,
        }),
        demoCota({
          razao_social: 'TRANSPORTES VALE VERDE LTDA',
          cnpj: '45678912000133',
          codigo_sci: 288,
          porte: 'EPP',
          rba: 4_910_000,
          excede_teto_epp: true,
        }),
        demoCota({
          razao_social: 'ARCANA DESIGN LTDA',
          cnpj: '63231837000161',
          codigo_sci: 415,
          porte: 'ME',
          rba: 415_979.35,
          excede_teto_me: true,
        }),
        demoCota({
          razao_social: 'AJ PORT CONSULTORIA LTDA',
          cnpj: '47306185000120',
          codigo_sci: 238,
          porte: 'ME',
          rba: 365_568,
          excede_teto_me: true,
        }),
        demoCota({
          razao_social: 'PADARIA CENTRAL LTDA',
          cnpj: '11122233000144',
          codigo_sci: 77,
          mudou: true,
          porte: 'EPP',
          porte_anterior: 'DEMAIS',
          rba: 3_100_000,
        }),
        demoCota({
          razao_social: 'OFICINA NOVA ERA LTDA',
          cnpj: '55566677000188',
          codigo_sci: 190,
          porte: 'SEM_DADOS',
          sujeita_cota: null,
          rba: 120_000,
          dado_confiavel: false,
          meses_faltantes: 3,
          revisar_juridico: true,
        }),
        demoCota({ razao_social: 'COMERCIO ALFA LTDA', porte: 'ME', rba: 88_000 }),
        demoCota({ razao_social: 'SERVICOS BETA LTDA', porte: 'EPP', rba: 1_400_000 }),
        demoCota({
          razao_social: 'INDUSTRIA GAMA SA',
          porte: 'DEMAIS',
          sujeita_cota: true,
          rba: 9_800_000,
        }),
    ],
    2026,
    7,
    4
  );
  gravar('email-4-enquadramento-demo', demo.enquadramento);
  gravar('email-5-cota-demo', demo.cota);

  // Os mesmos dois, com dados REAIS da última apuração
  try {
    const dados = await cotaAprendizagemService.classificacao();
    if (dados.bdref) {
      const real = renderPorteECota(
        dados.clientes,
        Math.floor(dados.bdref / 100),
        dados.bdref % 100
      );
      gravar('email-4-enquadramento-real', real.enquadramento);
      gravar('email-5-cota-real', real.cota);
    }
  } catch (e: any) {
    console.log('  (sem banco: prévia real não gerada —', e?.message, ')');
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
