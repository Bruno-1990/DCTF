/**
 * Coletor da caixa postal do DET.
 *
 * ─── A REGRA QUE GOVERNA ESTE ARQUIVO ─────────────────────────────────────
 * Abrir uma MENSAGEM no DET gera ciência e dispara prazo legal. Este coletor
 * lê SOMENTE A LISTAGEM, que expõe tipo, remetente, data, assunto e a classe
 * `nao-lida` sem abrir nada. Verificado em 21/08/2026 na caixa da própria
 * Central Contábil: depois de varrer a listagem, o contador seguiu
 * "Caixa de Entrada (2)" com as duas não-lidas intactas.
 *
 * NUNCA clique num item da lista. Um robô dando ciência em nome de 132
 * clientes cria exatamente o problema que ele deveria evitar.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * COMO ENTRA: o Edge tem, no registro do Windows, a política
 * `AutoSelectCertificateForUrls` fixando o e-CNPJ da Central Contábil para
 * `certificado.sso.acesso.gov.br`. Por isso o login por certificado acontece
 * sem interação — inclusive num perfil novo, porque a política é do usuário do
 * Windows, não do perfil do navegador.
 *
 * SESSÃO: o DET expira em 30 minutos. A varredura dos ~132 clientes com
 * espaçamento passa de uma hora, então reautenticar no meio é o caminho
 * normal, não exceção. O progresso é gravado cliente a cliente: uma queda
 * perde o cliente da vez, não a rodada.
 */

import * as crypto from 'crypto';
import { spawn } from 'child_process';
import type { ProcSpe } from './DetProcuracoesRegra';
import { reconciliarProcuracoes, type ResumoSincronizacao } from './DetProcuracoesSync';
import { resolverHCaptcha, temChaveCaptcha } from './HCaptchaSolver';
import { executeQuery, mysqlPool } from '../config/mysql';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const puppeteer = require('puppeteer-core');

/**
 * Os callbacks de `page.evaluate` rodam NO NAVEGADOR, não no Node. O tsconfig
 * do backend não inclui a lib "dom" — e não deve, porque isto é um servidor:
 * ligar "dom" faria o compilador aceitar `document` em qualquer arquivo, que é
 * justamente o erro que ele deveria pegar. Os globais do browser ficam
 * declarados aqui, com escopo deste módulo.
 */
declare const document: any;
declare const window: any;
declare const MouseEvent: any;
declare const location: any;
declare const Event: any;

const DET_URL = 'https://det.sit.trabalho.gov.br/';
const CAIXA_URL = 'https://det.sit.trabalho.gov.br/caixapostal';

// Aba "Recebidas (sou Outorgado)" do SPE — a lista de quem outorgou procuração
// AO escritório. É a fonte da verdade: uma leitura aqui responde o que exigiria
// centenas de trocas de perfil dentro do DET.
const SPE_URL = 'https://spe.sistema.gov.br/procuracao';

const EDGE_PATH =
  process.env['EDGE_PATH'] ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PERFIL_DIR =
  process.env['DET_EDGE_PROFILE'] || 'C:\\ProgramData\\dctf-det-edge';
const PORTA_CDP = Number(process.env['DET_CDP_PORT'] || 9222);

/** Espaçamento entre clientes. Rajada num sistema do governo é pedir bloqueio. */
const PAUSA_MIN_MS = Number(process.env['DET_PAUSA_MIN_MS'] || 15000);
const PAUSA_MAX_MS = Number(process.env['DET_PAUSA_MAX_MS'] || 28000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () =>
  PAUSA_MIN_MS + Math.floor(Math.random() * Math.max(1, PAUSA_MAX_MS - PAUSA_MIN_MS));

const CNPJ_ESCRITORIO_FMT = '32.401.481/0001-33';

const soDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const fmtCnpj = (c: string) =>
  `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;

const MESES: Record<string, string> = {
  jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
  jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12',
};

/**
 * "Hoje" | "Ontem" | "21 jul 26" -> "2026-07-21".
 *
 * A resolução acontece ANTES do hash. Se "Hoje" entrasse no hash, a mesma
 * mensagem viraria registro novo amanhã, quando a listagem passasse a exibir
 * a data — e a coleta diária inflaria o contador de novidades sozinha.
 */
export function resolverData(texto: string, hoje = new Date()): string | null {
  const t = (texto || '').trim().toLowerCase();
  if (!t) return null;

  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;

  if (t === 'hoje') return iso(hoje);
  if (t === 'ontem') {
    const d = new Date(hoje);
    d.setDate(d.getDate() - 1);
    return iso(d);
  }

  const m = t.match(/^(\d{1,2})\s+([a-zç]{3})\.?\s+(\d{2,4})$/i);
  if (m) {
    const mes = MESES[m[2].slice(0, 3)];
    if (!mes) return null;
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${ano}-${mes}-${m[1].padStart(2, '0')}`;
  }

  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return null;
}

export interface MensagemColetada {
  tipo: string;
  remetente: string;
  dataTexto: string;
  dataEnvio: string | null;
  assunto: string;
  naoLida: boolean;
}

export interface ResultadoCliente {
  cnpj: string;
  ok: boolean;
  motivo?: string;
  mensagens: number;
  novas: number;
  paginasNaoLidas?: boolean;
}

export interface ResultadoColeta {
  coletaId: number;
  total: number;
  coletados: number;
  erros: number;
  mensagensNovas: number;
  notificacoesNovas: number;
  reautenticacoes: number;

  /** Resumo da varredura de procurações no SPE. Ausente = o SPE não foi lido. */
  procuracoes?: ResumoSincronizacao;
  /** Preenchido quando o SPE falhou: a rodada usou a lista da vez anterior. */
  speErro?: string;
  detalhes: ResultadoCliente[];
}

let emAndamento = false;
export const coletaEmAndamento = () => emAndamento;

export class DetColetorService {
  private browser: any = null;
  private page: any = null;
  private processo: any = null;
  /** Conectou num Edge que já estava aberto — não é nosso para fechar. */
  private reaproveitou = false;
  private reautenticacoes = 0;
  private log: (m: string) => void;

  constructor(log: (m: string) => void = (m) => console.log('[DET]', m)) {
    this.log = log;
  }

  // ─── Navegador ───────────────────────────────────────────────────────────

  /**
   * O Edge é aberto por nós e o puppeteer apenas SE CONECTA nele.
   *
   * `puppeteer.launch` não serve aqui: ele acrescenta as flags de automação
   * (--enable-automation e companhia), e a tela de login do gov.br roda
   * hCaptcha. Com elas, o submit do formulário do certificado simplesmente não
   * acontece — testado, 45 segundos sem navegação nenhuma. Aberto como um
   * navegador comum e controlado por CDP, o login passa.
   */
  private async abrirNavegador(): Promise<void> {
    // Se já existe um Edge nosso com CDP no ar, reaproveita — inclusive a
    // sessão do gov.br que houver nele. É o que permite ao coletor rodar sem
    // refazer o login, que é a etapa que exige uma pessoa (o gov.br protege a
    // tela de login com captcha).
    try {
      const r = await fetch(`http://127.0.0.1:${PORTA_CDP}/json/version`);
      if (r.ok) {
        this.browser = await puppeteer.connect({
          browserURL: `http://127.0.0.1:${PORTA_CDP}`,
          defaultViewport: null,
        });
        const abas = (await this.browser.pages()).filter(
          (p: any) => !p.url().startsWith('devtools://')
        );
        this.page = abas[abas.length - 1] ?? (await this.browser.newPage());
        this.reaproveitou = true;
        this.log('reaproveitando o Edge já aberto');
        return;
      }
    } catch {
      /* nenhum Edge nosso no ar — abre um */
    }

    this.processo = spawn(
      EDGE_PATH,
      [
        `--remote-debugging-port=${PORTA_CDP}`,
        `--user-data-dir=${PERFIL_DIR}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1400,900',
        DET_URL,
      ],
      { detached: true, stdio: 'ignore' }
    );
    this.processo.unref();

    // espera o endpoint de depuração subir
    let pronto = false;
    for (let i = 0; i < 30 && !pronto; i++) {
      await sleep(1000);
      try {
        const r = await fetch(`http://127.0.0.1:${PORTA_CDP}/json/version`);
        pronto = r.ok;
      } catch {
        /* ainda subindo */
      }
    }
    if (!pronto) throw new Error(`Edge não abriu o CDP na porta ${PORTA_CDP}`);

    this.browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${PORTA_CDP}`,
      defaultViewport: null,
    });
    const paginas = (await this.browser.pages()).filter(
      (p: any) => !p.url().startsWith('devtools://')
    );
    this.page = paginas[paginas.length - 1] ?? (await this.browser.newPage());
  }

  /** Entra no DET. O certificado é escolhido pela política do registro. */
  /**
   * Autentica no DET, UMA PASSADA do início ao fim.
   *
   * POR QUE UMA PASSADA E NÃO UM LAÇO: a versão anterior repetia a tela num
   * laço de 4 tentativas. O problema é que clicar "Entrar com gov.br" gera um
   * `authorization_id` novo a cada vez; se o clique no certificado não avança
   * de primeira e o laço volta ao topo, ele reclica "Entrar com gov.br", queima
   * o id anterior e embaralha o estado do SSO — a partir daí NENHUM clique no
   * certificado avança. Medido em 24/08/2026: a passada única entra em
   * ~/servicos; o laço trava no SSO indefinidamente. A recuperação de um
   * travamento é reabrir o navegador limpo (ver `autenticarComReabertura`), não
   * reclicar na mesma janela suja.
   *
   * O clique no certificado é via DOM (`el.click()` dentro de page.evaluate),
   * não `page.click()` do Puppeteer: o clique físico por coordenada pode ser
   * interceptado pelo iframe invisível do hCaptcha que o gov.br mantém na
   * página, enquanto o evento DOM vai direto ao elemento. As esperas são fixas
   * e folgadas de propósito — o handshake do certificado com
   * `certificado.sso.acesso.gov.br` leva alguns segundos, e apressar aqui é o
   * que fazia o passo seguinte rodar cedo demais.
   */
  private async autenticar(): Promise<void> {
    await this.page.goto(DET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(4500);

    // Já dentro? (perfil com sessão viva entra direto)
    if (await this.empregadorAtual()) {
      this.log(`autenticado como ${await this.empregadorAtual()}`);
      return;
    }

    // 1) tela do DET → "Entrar com gov.br"  (clicado NO MÁXIMO uma vez)
    if (/det\.sit\.trabalho\.gov\.br\/login/.test(this.page.url())) {
      await this.page.evaluate(() => {
        const b = Array.from<any>(document.querySelectorAll('button, a')).find((e: any) =>
          /entrar com/i.test(e.innerText || '')
        );
        if (b) b.click();
      });
      await sleep(9000);
    }

    // 2) tela do gov.br → "Seu certificado digital" (exato, não o "em nuvem")
    if (/sso\.acesso\.gov\.br/.test(this.page.url())) {
      const achou = await this.page.evaluate(() => {
        const alt = Array.from<any>(document.querySelectorAll('button, a')).find(
          (e: any) => (e.innerText || '').trim() === 'Seu certificado digital'
        );
        if (!alt) return false;
        alt.click();
        return true;
      });
      if (achou) {
        // Espera folgada e observada: a política AutoSelectCertificateForUrls
        // seleciona o e-CNPJ sozinha em certificado.sso.acesso.gov.br e o
        // navegador volta para o DET. Confere a cada 3s por até ~36s.
        for (let i = 0; i < 12; i++) {
          await sleep(3000);
          if (await this.empregadorAtual()) break;
          if (/det\.sit\.trabalho\.gov\.br\/(servicos|$)/.test(this.page.url())) {
            await sleep(2000);
            break;
          }
        }

        // REDE DE SEGURANÇA: só se um challenge de hCaptcha ATIVO aparecer.
        // No fluxo do certificado isso nunca ocorreu (medido em 24/08/2026),
        // mas se o antiabuse do gov.br passar a exigir, resolve-se via 2Captcha
        // — com autorização do operador. Fora deste caso, não se toca no
        // captcha: disparar "por precaução" queimaria saldo em toda coleta.
        if (!(await this.empregadorAtual())) {
          await this.tentarResolverCaptcha();
        }
      }
    }

    const dentro = await this.empregadorAtual();
    if (!dentro) {
      throw new Error(`não foi possível autenticar no DET (parou em ${this.page.url()})`);
    }
    this.log(`autenticado como ${dentro}`);
  }

  /**
   * Detecta um challenge de hCaptcha ATIVO e, só então, aciona o 2Captcha.
   *
   * "Ativo" = existe um iframe de challenge com sitekey e ele está visível na
   * tela. O iframe invisível que o gov.br mantém sempre presente NÃO conta —
   * disparar por causa dele gastaria saldo em toda coleta sem nada travado.
   *
   * Ao receber o token, injeta-o nos campos que o widget lê e dispara o
   * callback registrado, que é o que faz o gov.br aceitar e prosseguir.
   */
  private async tentarResolverCaptcha(): Promise<void> {
    if (!temChaveCaptcha()) return;

    const alvo = await this.page.evaluate(() => {
      const frames = Array.from<any>(
        document.querySelectorAll('iframe[src*="hcaptcha"]')
      );
      // challenge ativo = iframe de desafio efetivamente renderizado
      const ativo = frames.some(
        (f: any) => /frame=challenge/.test(f.src) && f.offsetHeight > 100
      );
      if (!ativo) return null;
      const el =
        document.querySelector('[data-sitekey]') ||
        document.querySelector('.h-captcha[data-sitekey]');
      const sitekey = el ? (el as any).getAttribute('data-sitekey') : null;
      // fallback: extrai o sitekey da própria URL do iframe
      let doIframe: string | null = null;
      for (const f of frames) {
        const m = (f.src as string).match(/sitekey=([0-9a-f-]+)/i);
        if (m) doIframe = m[1];
      }
      return { sitekey: sitekey || doIframe, url: location.href };
    });

    if (!alvo || !alvo.sitekey) return; // nenhum challenge ativo — nada a fazer

    this.log('hCaptcha ATIVO detectado no login — acionando 2Captcha (autorizado)');
    const token = await resolverHCaptcha(alvo.sitekey, alvo.url, (m) => this.log(`   ${m}`));

    await this.page.evaluate((tok: string) => {
      const setar = (nome: string) => {
        let ta = document.querySelector(`textarea[name="${nome}"]`) as any;
        if (!ta) {
          ta = document.createElement('textarea');
          ta.name = nome;
          ta.style.display = 'none';
          document.body.appendChild(ta);
        }
        ta.value = tok;
      };
      setar('h-captcha-response');
      setar('g-recaptcha-response');
      // dispara o callback do widget, se houver
      try {
        const w: any = window as any;
        if (w.hcaptcha && typeof w.hcaptcha.getResponse === 'function') {
          // alguns fluxos leem direto do textarea; outros esperam submit
        }
        const form = document.querySelector('form');
        if (form) (form as any).requestSubmit?.();
      } catch {
        /* segue e confere pelo cabeçalho */
      }
    }, token);

    await sleep(6000);
    // confere a cada 3s se entrou
    for (let i = 0; i < 10; i++) {
      if (await this.empregadorAtual()) break;
      await sleep(3000);
    }
  }

  /**
   * Autentica com recuperação por REABERTURA, que é o único jeito confiável de
   * sair de um SSO embaralhado: fechar o navegador inteiro zera o
   * `authorization_id` queimado e os cookies de meio-login que travam o
   * certificado.
   *
   * Numa sessão REAPROVEITADA (Edge aberto por uma pessoa) não reabrimos: o
   * navegador não é nosso para fechar, e derrubá-lo destruiria um login que
   * custou interação humana. Aí a autenticação é tentada uma vez e o erro sobe.
   */
  private async autenticarComReabertura(maxTentativas = 3): Promise<void> {
    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
      try {
        await this.autenticar();
        return;
      } catch (e: any) {
        this.log(`autenticação falhou (tentativa ${tentativa}/${maxTentativas}): ${e?.message ?? e}`);

        if (this.reaproveitou) {
          // Não é nosso para fechar e reabrir. Sobe o erro.
          throw e;
        }
        if (tentativa === maxTentativas) throw e;

        this.log('reabrindo o navegador do zero para reiniciar o login');
        await this.fechar();
        await sleep(3000);
        await this.abrirNavegador();
      }
    }
  }

  private async empregadorAtual(): Promise<string | null> {
    try {
      return await this.page.evaluate(() => {
        const m = (document.body?.innerText || '').match(/Empregador:\s*([^\n]+)/);
        return m ? m[1].trim() : null;
      });
    } catch {
      return null;
    }
  }

  /** Sessão viva = ainda existe o cabeçalho do empregador e não voltou ao SSO. */
  private async sessaoViva(): Promise<boolean> {
    if (/sso\.acesso\.gov\.br|login/i.test(this.page.url())) return false;
    return !!(await this.empregadorAtual());
  }

  private async garantirSessao(): Promise<void> {
    if (await this.sessaoViva()) return;
    this.reautenticacoes++;
    this.log(`sessão expirou — reautenticando (${this.reautenticacoes}ª vez)`);
    await this.autenticarComReabertura();
  }

  // ─── Troca de perfil ─────────────────────────────────────────────────────

  /**
   * Assume o perfil de procurador do CNPJ. Devolve `null` em caso de sucesso
   * ou o motivo da recusa (que é a mensagem literal do portal).
   */
  private async assumirPerfil(cnpj: string): Promise<string | null> {
    // Volta para "Meu Perfil" antes de assumir o próximo cliente.
    //
    // Não é zelo: enquanto o perfil ativo é o de OUTRA empresa, o modal deixa
    // de oferecer "Procurador" e a troca falha com "opção Procurador
    // indisponível" — foi assim que o terceiro cliente do primeiro teste
    // quebrou, depois que o segundo deu certo.
    await this.voltarAoProprioPerfil();

    await this.page.evaluate(() => {
      const b = Array.from<any>(document.querySelectorAll('button, a')).find(
        (e) => ((e).innerText || '').trim() === 'Trocar Perfil'
      );
      if (b) b.click();
    });
    await sleep(2500);

    await this.page.evaluate(() => {
      const ng = document.querySelector('ng-select');
      if (ng)
        (ng.querySelector('.ng-arrow-wrapper') || ng).dispatchEvent(
          new MouseEvent('mousedown', { bubbles: true })
        );
    });
    await sleep(1200);

    const escolheu = await this.page.evaluate(() => {
      const o = Array.from<any>(document.querySelectorAll('.ng-dropdown-panel .ng-option')).find((x) =>
        (x).innerText.trim().toUpperCase().startsWith('PROCURADOR')
      );
      if (!o) return false;
      o.click();
      return true;
    });
    if (!escolheu) return 'opção Procurador indisponível';
    await sleep(1500);

    await this.page.evaluate((c: string) => {
      const inp = Array.from<any>(document.querySelectorAll('input')).find((i) => {
        const ph = (i.placeholder || '').toUpperCase();
        return ph.includes('CNPJ') || ph.includes('CPF');
      });
      if (!inp) return;
      const set = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!;
      set.call(inp, c);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      inp.dispatchEvent(new Event('blur', { bubbles: true }));
    }, cnpj);
    await sleep(1200);

    await this.page.evaluate(() => {
      const b = Array.from<any>(document.querySelectorAll('button')).find(
        (x) => ((x).innerText || '').trim().toUpperCase() === 'SELECIONAR'
      );
      if (b && !b.disabled) b.click();
    });
    await sleep(4500);

    const emp = (await this.empregadorAtual()) || '';
    if (emp.includes(fmtCnpj(cnpj))) return null;

    const erro = await this.page.evaluate(() => {
      const e = Array.from<any>(
        document.querySelectorAll('[class*=error], [class*=danger], .br-message')
      )
        .map((x) => ((x).innerText || '').trim())
        .find((x) => /procura|erro/i.test(x));
      return e || null;
    });

    await this.fecharModal();
    return (erro || 'perfil não assumido').replace(/\s+/g, ' ').slice(0, 240);
  }

  /** Devolve o perfil ativo ao do próprio escritório. */
  private async voltarAoProprioPerfil(): Promise<void> {
    const emp = (await this.empregadorAtual()) || '';
    if (emp.includes(CNPJ_ESCRITORIO_FMT)) return; // já está

    await this.page.evaluate(() => {
      const b = Array.from<any>(document.querySelectorAll('button, a')).find(
        (e: any) => ((e).innerText || '').trim() === 'Trocar Perfil'
      );
      if (b) b.click();
    });
    await sleep(2200);

    await this.page.evaluate(() => {
      const ng = document.querySelector('ng-select');
      if (ng)
        (ng.querySelector('.ng-arrow-wrapper') || ng).dispatchEvent(
          new MouseEvent('mousedown', { bubbles: true })
        );
    });
    await sleep(1100);

    await this.page.evaluate(() => {
      const o = Array.from<any>(document.querySelectorAll('.ng-dropdown-panel .ng-option')).find(
        (x: any) => (x).innerText.trim().toUpperCase().startsWith('MEU PERFIL')
      );
      if (o) o.click();
    });
    await sleep(1300);

    await this.page.evaluate(() => {
      const b = Array.from<any>(document.querySelectorAll('button')).find(
        (x: any) => ((x).innerText || '').trim().toUpperCase() === 'SELECIONAR'
      );
      if (b && !b.disabled) b.click();
    });
    await sleep(3500);
    await this.fecharModal();
  }

  private async fecharModal(): Promise<void> {
    await this.page.evaluate(() => {
      for (const t of ['FECHAR', 'CANCELAR']) {
        const b = Array.from<any>(document.querySelectorAll('button')).find(
          (x) => ((x).innerText || '').trim().toUpperCase() === t
        );
        if (b) b.click();
      }
    });
    await sleep(1200);
  }

  // ─── Leitura da caixa postal ─────────────────────────────────────────────

  private async lerCaixa(): Promise<{ msgs: MensagemColetada[]; maisPaginas: boolean }> {
    await this.page.goto(CAIXA_URL, { waitUntil: 'networkidle2', timeout: 45000 });
    await sleep(3500);

    // Amplia os itens por página. A caixa postal não é um datatable — a
    // paginação são dois `ng-select` soltos ("Exibir" e "Página"), sem setas de
    // avançar. O primeiro é o tamanho da página.
    // Até 3 tentativas: o painel do ng-select nem sempre está pronto logo após
    // a navegação, e uma tentativa única deixava a página em 15 itens — foi o
    // que truncou uma caixa de 17 em 15.
    let tamanho = 0;
    for (let t = 0; t < 3 && tamanho < 100; t++) {
      await this.page
        .evaluate(() => {
          const ng = document.querySelectorAll('ng-select')[0];
          if (ng)
            (ng.querySelector('.ng-arrow-wrapper') || ng).dispatchEvent(
              new MouseEvent('mousedown', { bubbles: true })
            );
        })
        .catch(() => {});
      await sleep(1800);
      tamanho = await this.page
        .evaluate(() => {
          const os = Array.from<any>(document.querySelectorAll('.ng-dropdown-panel .ng-option'));
          let melhor: any = null;
          let val = -1;
          for (const o of os) {
            const n = parseInt((o).innerText.trim(), 10);
            if (!isNaN(n) && n > val) {
              val = n;
              melhor = o;
            }
          }
          if (!melhor) return 0;
          melhor.click();
          return val;
        })
        .catch(() => 0);
      await sleep(2500);
    }
    await sleep(1200);
    // As opções são 10/15/20/50/100. Com 100 por página, nenhuma caixa vista
    // até aqui precisa de segunda página — a paginação abaixo é rede de
    // segurança, não o caminho normal.
    if (tamanho && tamanho < 100) this.log(`   itens por página: ${tamanho}`);

    const lerPagina = () =>
      this.page.evaluate(() => {
        const cont = document.querySelector('.tabela_mensagens');
        const linhas = cont ? Array.from<any>(cont.querySelectorAll('.linha')) : [];
        const msgs = linhas
          .map((l) => {
            const partes = ((l).innerText || '')
              .split('\n')
              .map((s: string) => s.trim())
              .filter(Boolean);

            // Parse POR CONTEÚDO, não por posição. Medido em 24/08/2026: algumas
            // caixas trazem o CNPJ prefixado como uma parte extra
            // (["39272778000195","Aviso","<remetente 57 chars>","23 fev 26",...]).
            // Com `dataTexto = partes[2]`, a data virava o remetente e estourava
            // o VARCHAR(30) — derrubando o cliente inteiro — e as linhas
            // deslocadas eram descartadas, o que explicava a "paginação
            // incompleta". A data é o ÂNCORA confiável: casa um formato fixo
            // ("21 jul 26" ou "Hoje"/"Ontem"); o remetente é a parte logo antes
            // dela e o assunto é tudo depois.
            const reData = /^(\d{1,2}\s+[A-Za-zçÇ]{3}\s+\d{2}|hoje|ontem)$/i;
            const reCnpj = /^\d{14}$|^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;
            const reTipo = /^(aviso|notifica)/i;

            const uteis = partes.filter((p: string) => !reCnpj.test(p));
            const idxData = uteis.findIndex((p: string) => reData.test(p));
            const dataTexto = idxData >= 0 ? uteis[idxData] : '';
            const tipo = uteis.find((p: string) => reTipo.test(p)) || '';
            const remetente = idxData >= 1 ? uteis[idxData - 1] : '';
            const assunto = idxData >= 0 ? uteis.slice(idxData + 1).join(' ') : '';

            return {
              tipo,
              remetente,
              dataTexto,
              assunto,
              naoLida: l.classList.contains('nao-lida'),
              dataEnvio: null as string | null,
            };
          })
          // Nem toda `.linha` é mensagem: a lista traz uma linha de estrutura
          // que aparecia como registro vazio (11 linhas para "1-10 de 16").
          //
          // O critério é tipo + data, NÃO o assunto: exigir assunto derrubava
          // mensagens legítimas que vêm sem ele — foi o que fez uma caixa de 17
          // ser lida como 15, de forma perfeitamente reproduzível.
          .filter((m: any) => m.tipo && m.dataTexto);
        const rod = (document.body.innerText || '').match(/(\d+)\s*-\s*(\d+)\s*de\s*(\d+)/);
        return {
          msgs,
          ate: rod ? Number(rod[2]) : msgs.length,
          total: rod ? Number(rod[3]) : msgs.length,
        };
      });

    const todas: MensagemColetada[] = [];
    let total = 0;
    let esgotouPaginas = false;
    let assinaturaAnterior = '';

    for (let pagina = 1; pagina <= 40; pagina++) {
      const p = await lerPagina();
      total = p.total;

      // Assinatura da PÁGINA (sequência de linhas), não das mensagens. Serve só
      // para detectar que a paginação não avançou (releu a mesma página) — e aí
      // parar. NÃO se usa dedup por CONTEÚDO de mensagem: a caixa tem avisos
      // legitimamente repetidos (mesmo tipo/data/assunto no mesmo dia, ex.:
      // "Crédito do Trabalhador"), e colapsá-los aqui é o que fazia "27" virar
      // "25" e disparar um falso "paginação incompleta". As duplicatas reais são
      // colapsadas depois, na gravação, pelo hash — então o banco não infla.
      const assinatura = p.msgs.map((m) => `${m.tipo}|${m.dataTexto}|${m.assunto}`).join('##');
      if (pagina > 1 && assinatura === assinaturaAnterior) {
        esgotouPaginas = true; // não avançou: mesma página de novo
        break;
      }
      assinaturaAnterior = assinatura;
      for (const m of p.msgs) todas.push(m);

      if (todas.length >= total) {
        esgotouPaginas = true;
        break;
      }

      const avancou = await this.page
        .evaluate(() => {
          const ng = document.querySelectorAll('ng-select')[1];
          if (!ng) return false;
          (ng.querySelector('.ng-arrow-wrapper') || ng).dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true })
          );
          return true;
        })
        .catch(() => false);
      if (!avancou) {
        esgotouPaginas = true;
        break;
      }
      await sleep(1000);

      const clicou = await this.page
        .evaluate((prox: number) => {
          const o = Array.from<any>(document.querySelectorAll('.ng-dropdown-panel .ng-option')).find(
            (x: any) => (x).innerText.trim() === String(prox)
          );
          if (!o) return false;
          o.click();
          return true;
        }, pagina + 1)
        .catch(() => false);
      if (!clicou) {
        esgotouPaginas = true;
        break;
      }
      await sleep(2600);
    }

    // "Incompleto" DE VERDADE = parei sem esgotar as páginas E li menos que o
    // anunciado. Se esgotei as páginas e ainda falta, a diferença são
    // duplicatas colapsadas na leitura — esperado, e o hash da gravação já
    // trata. Só o primeiro caso vira alerta; truncar calado faria a coleta
    // parecer completa quando não é.
    const faltouPagina = !esgotouPaginas && todas.length < total;
    if (faltouPagina) {
      this.log(`   paginação incompleta: ${todas.length} de ${total} anunciadas`);
    } else if (todas.length < total) {
      this.log(`   ${total - todas.length} duplicata(s) na caixa (colapsadas na gravação)`);
    }
    return { msgs: todas, maisPaginas: faltouPagina };
  }

  // ─── Persistência ────────────────────────────────────────────────────────

  /**
   * Registra em det_procuracoes quando este CNPJ foi varrido e com que
   * resultado — independente de ter mensagem. É o que permite à tela dizer
   * "sem mensagens" em vez de "nunca" para uma caixa conferida e vazia.
   */
  private async marcarColeta(
    cnpj: string,
    status: 'ok' | 'vazia' | 'erro',
    msgs: number | null
  ): Promise<void> {
    await mysqlPool.execute(
      `UPDATE det_procuracoes
          SET ultima_coleta_em = NOW(),
              ultima_coleta_status = ?,
              ultima_coleta_msgs = ?
        WHERE cnpj = ?`,
      [status, msgs, cnpj]
    );
  }

  private async gravar(cnpj: string, msgs: MensagemColetada[]): Promise<number> {
    let novas = 0;
    for (const m of msgs) {
      const dataEnvio = resolverData(m.dataTexto);
      const hash = crypto
        .createHash('sha256')
        .update(`${cnpj}|${m.tipo}|${dataEnvio ?? m.dataTexto}|${m.assunto}`)
        .digest('hex');

      try {
        // Pelo pool direto, e não por `executeQuery`: ela devolve [] em INSERT,
        // e sem o cabeçalho do resultado não há como distinguir mensagem NOVA de
        // mensagem revista — que é justamente o número que vira alerta na tela.
        const [r]: any = await mysqlPool.execute(
          `INSERT INTO det_notificacoes
             (cnpj, tipo, remetente, data_texto, data_envio, assunto, nao_lida, hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             nao_lida = VALUES(nao_lida),
             ultima_coleta_em = NOW()`,
          [cnpj, m.tipo, m.remetente, m.dataTexto, dataEnvio, m.assunto, m.naoLida ? 1 : 0, hash]
        );
        // mysql2 no UPSERT: affectedRows 1 = inserida, 2 = atualizada, 0 = igual
        if (Number(r?.affectedRows) === 1) novas++;
      } catch (e: any) {
        // Uma mensagem malformada NÃO derruba o cliente inteiro. Antes, um
        // INSERT que estourava (ex.: "Data too long") interrompia o loop e
        // perdia todas as mensagens seguintes daquele cliente. Aqui a linha
        // problemática é anunciada e pulada; as demais gravam. Anunciar, não
        // cortar em silêncio, é a regra que já governa o resto do coletor.
        this.log(
          `   msg ignorada (${cnpj}): ${String(e?.message ?? e).slice(0, 80)} | ` +
            `tipo="${m.tipo}" data="${m.dataTexto}" assunto="${(m.assunto || '').slice(0, 40)}"`
        );
      }
    }
    return novas;
  }

  // ─── Execução ────────────────────────────────────────────────────────────


  // ─── Procurações (SPE) ───────────────────────────────────────────────────

  /**
   * Lê a aba "Recebidas (sou Outorgado)" do SPE e devolve o retrato bruto.
   *
   * O QUE FOI MEDIDO NA TELA REAL em 24/08/2026 (a primeira versão deste método
   * errava em três pontos, todos descobertos rodando):
   *
   * 1. O SPE É OUTRA APLICAÇÃO, com login próprio. Ir direto na URL cai em
   *    `spe.sistema.gov.br/login`, não na grade — estar autenticado no DET não
   *    basta. Daqui sai o "Entrar com GOV.BR" e, se preciso, o certificado.
   *
   * 2. Depois do login aparece o modal "Escolha do Perfil", que BLOQUEIA a
   *    grade até alguém confirmar. Sem tratá-lo, a leitura devolve zero linha
   *    numa tela que parece carregada.
   *
   * 3. O painel tem TRÊS `ng-select`, e o primeiro é o filtro "Situação" —
   *    não a paginação. Pegar por índice ([0]=Exibir, [1]=Página) mexia no
   *    filtro achando que paginava. Aqui eles são achados pelo rodapé
   *    (`datatable-footer`), que é onde "Exibir" e "Página" realmente moram.
   *
   * Continuam valendo as armadilhas do levantamento de 21/08:
   *   - os dois painéis coexistem no DOM; sem escopar em
   *     `app-listar-procuracoes-outorgado` as linhas de "Cedidas" se misturam,
   *     e o escritório varreria a caixa de quem ELE outorgou;
   *   - a grade é ngx-datatable, não `<table>`;
   *   - a coluna 0 ("CPF/CNPJ Raiz") vem vazia.
   *
   * As células são lidas POR CONTEÚDO, não por posição: a coluna vazia já
   * desloca os índices uma vez, e uma coluna nova do SPE faria um mapeamento
   * posicional gravar vigência no lugar de nome sem erro aparente.
   *
   * GUARDA FINAL: o rodapé diz "1-10 de 136 itens". Esse total é conferido
   * contra o que foi lido — ler menos que o portal anuncia é falha, não
   * resultado parcial. É a mesma regra da caixa postal truncada.
   */
  private async lerProcuracoesSpe(): Promise<ProcSpe[]> {
    this.log('lendo procurações no SPE...');
    await this.page.goto(SPE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(4000);

    // ── Login do SPE (aplicação separada, login próprio) ──────────────────
    // UMA passada, espelhando o autenticar() do DET corrigido. O laço antigo
    // (4 tentativas) reclicava "Entrar com GOV.BR" e o certificado a cada volta;
    // reclicar gera novo authorization_id e embaralha o SSO — daí o SPE falhava
    // de forma intermitente ("painel não apareceu, parou no login"). Aqui cada
    // botão é clicado NO MÁXIMO uma vez, e a volta ao SPE é OBSERVADA (não um
    // sleep fixo curto que às vezes acabava antes do handshake do certificado).
    const noSpe = () =>
      /spe\.sistema\.gov\.br/.test(this.page.url()) && !/\/login/.test(this.page.url());

    // 1) tela de login do SPE → "Entrar com GOV.BR"
    if (/spe\.sistema\.gov\.br\/login/.test(this.page.url())) {
      await this.page.evaluate(() => {
        const b = Array.from<any>(document.querySelectorAll('button, a')).find((e: any) =>
          /entrar com/i.test(e.innerText || '')
        );
        if (b) b.click();
      });
      await sleep(9000);
    }

    // 2) tela do gov.br → "Seu certificado digital" (a política AutoSelect
    //    escolhe o e-CNPJ sozinha; basta acionar o fluxo e aguardar o retorno)
    if (/sso\.acesso\.gov\.br/.test(this.page.url())) {
      await this.page.evaluate(() => {
        const b =
          document.querySelector('#login-certificate') ||
          Array.from<any>(document.querySelectorAll('button, a')).find(
            (e: any) => (e.innerText || '').trim() === 'Seu certificado digital'
          );
        if (b) (b as any).click();
      });
      // espera OBSERVADA: até ~42s conferindo a cada 3s se voltou ao SPE
      for (let i = 0; i < 14 && !noSpe(); i++) {
        await sleep(3000);
      }
      // se um challenge de hCaptcha ATIVO aparecer no login do SPE, resolve
      // (mesma rede de segurança do DET); só age se houver challenge real
      if (!noSpe() && /sso\.acesso\.gov\.br/.test(this.page.url())) {
        await this.tentarResolverCaptcha();
        for (let i = 0; i < 6 && !noSpe(); i++) await sleep(3000);
      }
    }

    // ── Modal "Escolha do Perfil" ─────────────────────────────────────────
    // Aparece após o login e trava a grade. O valor padrão ("Meu Perfil") é o
    // que queremos: as procurações recebidas são do escritório, não de um
    // cliente. Basta confirmar.
    for (let t = 0; t < 3; t++) {
      const confirmou = await this.page
        .evaluate(() => {
          const b = Array.from<any>(document.querySelectorAll('button')).find(
            (e: any) => (e.innerText || '').trim().toUpperCase() === 'DEFINIR'
          );
          if (b && !b.disabled) {
            b.click();
            return true;
          }
          return false;
        })
        .catch(() => false);
      if (!confirmou) break;
      this.log('   SPE: perfil confirmado no modal');
      await sleep(6000);
    }

    const painelPresente = await this.page
      .evaluate(() => !!document.querySelector('app-listar-procuracoes-outorgado'))
      .catch(() => false);
    if (!painelPresente) {
      throw new Error(
        `painel "Recebidas (sou Outorgado)" não apareceu no SPE (parou em ${this.page.url()})`
      );
    }

    // ── Quantos itens o portal diz que existem ────────────────────────────
    const totalAnunciado = await this.page
      .evaluate(() => {
        const raiz = document.querySelector('app-listar-procuracoes-outorgado');
        const rodape = raiz ? raiz.querySelector('datatable-footer') : null;
        const txt = rodape ? (rodape.innerText || '').replace(/\s+/g, ' ') : '';
        const m = txt.match(/de\s+(\d+)\s+itens/i);
        return m ? Number(m[1]) : 0;
      })
      .catch(() => 0);
    if (totalAnunciado) this.log(`   SPE anuncia ${totalAnunciado} item(ns)`);

    // ── "Exibir" para o maior valor, achado PELO RODAPÉ ───────────────────
    for (let t = 0; t < 3; t++) {
      const abriu = await this.page
        .evaluate(() => {
          const raiz = document.querySelector('app-listar-procuracoes-outorgado');
          const rodape = raiz ? raiz.querySelector('datatable-footer') : null;
          const ng = rodape ? rodape.querySelectorAll('ng-select')[0] : null; // 0 = Exibir
          if (!ng) return false;
          (ng.querySelector('.ng-arrow-wrapper') || ng).dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true })
          );
          return true;
        })
        .catch(() => false);
      if (!abriu) {
        await sleep(1500);
        continue;
      }
      await sleep(1600);
      const escolhido = await this.page
        .evaluate(() => {
          const opcoes = Array.from<any>(
            document.querySelectorAll('.ng-dropdown-panel .ng-option')
          );
          let melhor: any = null;
          let val = -1;
          for (const o of opcoes) {
            const n = parseInt(((o.innerText || '') as string).trim(), 10);
            if (!isNaN(n) && n > val) {
              val = n;
              melhor = o;
            }
          }
          if (!melhor) return 0;
          melhor.click();
          return val;
        })
        .catch(() => 0);
      await sleep(3000);
      if (escolhido > 0) {
        this.log(`   SPE: ${escolhido} itens por página`);
        break;
      }
    }

    const lerPagina = (): Promise<ProcSpe[]> =>
      this.page.evaluate(() => {
        const raiz = document.querySelector('app-listar-procuracoes-outorgado');
        if (!raiz) return [];
        const linhas = Array.from<any>(raiz.querySelectorAll('datatable-body-row'));
        const reCnpj = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/;
        const reVig = /\d{2}\/\d{2}\/\d{4}\s*a\s*\d{2}\/\d{2}\/\d{4}/;
        const reSit = /^(ativa|revogada|expirada)$/i;

        return linhas
          .map((l: any) => {
            const cels = Array.from<any>(l.querySelectorAll('datatable-body-cell')).map(
              (c: any) => ((c.innerText || '') as string).trim()
            );
            const cnpj = cels.find((t: string) => reCnpj.test(t)) || '';
            const vigencia = cels.find((t: string) => reVig.test(t)) || '';
            const situacao = cels.find((t: string) => reSit.test(t)) || '';
            const nivel = cels.find((t: string) => /^\d{1,2}$/.test(t)) || '';
            const nome =
              cels
                .filter(
                  (t: string) =>
                    t && t !== cnpj && t !== vigencia && t !== situacao && t !== nivel
                )
                .sort((a: string, b: string) => b.length - a.length)[0] || '';
            return { cnpj, nome, nivel, vigencia, situacao };
          })
          .filter((r: any) => reCnpj.test(r.cnpj) && r.situacao);
      });

    // ── Paginação: "Página" é o SEGUNDO ng-select do rodapé ───────────────
    const todas: ProcSpe[] = [];
    const vistos = new Set<string>();

    for (let pagina = 1; pagina <= 60; pagina++) {
      const linhas = await lerPagina();
      let novas = 0;
      for (const r of linhas) {
        const chave = `${r.cnpj}|${r.vigencia}|${r.situacao}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        todas.push(r);
        novas++;
      }
      this.log(`   SPE página ${pagina}: ${linhas.length} linha(s), ${novas} nova(s)`);
      if (novas === 0 && pagina > 1) break;
      if (totalAnunciado && todas.length >= totalAnunciado) break;

      const avancou = await this.page
        .evaluate((alvo: number) => {
          const raiz = document.querySelector('app-listar-procuracoes-outorgado');
          const rodape = raiz ? raiz.querySelector('datatable-footer') : null;
          const sel = rodape ? rodape.querySelectorAll('ng-select')[1] : null; // 1 = Página
          if (!sel) return false;
          (sel.querySelector('.ng-arrow-wrapper') || sel).dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true })
          );
          const alvoStr = String(alvo);
          const o = Array.from<any>(
            document.querySelectorAll('.ng-dropdown-panel .ng-option')
          ).find((x: any) => ((x.innerText || '') as string).trim() === alvoStr);
          if (!o) return false;
          o.click();
          return true;
        }, pagina + 1)
        .catch(() => false);

      if (!avancou) break;
      await sleep(2800);
    }

    if (!todas.length) {
      throw new Error(
        'SPE respondeu, mas nenhuma procuração foi lida — não vou reconciliar contra lista vazia'
      );
    }

    // Ler menos do que o portal anuncia é falha, não resultado parcial: a
    // diferença viraria cliente marcado como "sem procuração" e nunca mais
    // conferido, sem nada na tela denunciando.
    if (totalAnunciado && todas.length < totalAnunciado) {
      throw new Error(
        `o SPE anuncia ${totalAnunciado} item(ns) e só ${todas.length} foi(ram) lido(s) — ` +
          'a lista está incompleta e reconciliar assim rebaixaria clientes por engano'
      );
    }

    this.log(`SPE: ${todas.length} procuração(ões) lida(s)`);
    return todas;
  }

  /**
   * Varredura completa das procurações: lê o SPE e reconcilia a tabela.
   * Reaproveita a sessão já aberta; se não houver, abre e autentica sozinha.
   */
  async sincronizarProcuracoes(
    opts: { dryRun?: boolean } = {}
  ): Promise<ResumoSincronizacao> {
    const abriuAqui = !this.page;
    if (abriuAqui) {
      await this.abrirNavegador();
      await this.autenticarComReabertura();
    } else {
      await this.garantirSessao();
    }
    try {
      await this.voltarAoProprioPerfil();
      const procs = await this.lerProcuracoesSpe();
      return await reconciliarProcuracoes(procs, {
        dryRun: opts.dryRun === true,
        log: (m) => this.log(m),
      });
    } finally {
      if (abriuAqui) await this.fechar();
    }
  }

  /**
   * Coleta SÓ as procurações (login DET + SPE), sem varrer caixas. Registra em
   * `det_coletas` com `total_clientes = 0` — é o que distingue esta rodada da
   * de caixas na trava do scheduler e no histórico.
   *
   * Existe para separar a checagem de procurações (agendada de noite, ex.: 22h)
   * da coleta de caixas (madrugada/manhã, ex.: 6h): cada uma faz UM login no
   * gov.br, ambas frias, e a de caixas roda com a lista já atualizada da véspera
   * sem refazer o SPE. Ideia do operador em 26/08/2026.
   */
  async executarProcuracoes(origem: 'cron' | 'manual' = 'manual'): Promise<void> {
    if (emAndamento) throw new Error('já existe uma coleta em andamento');
    emAndamento = true;
    try {
      const [ins]: any = await mysqlPool.execute(
        `INSERT INTO det_coletas (origem, total_clientes) VALUES (?, 0)`,
        [origem]
      );
      const coletaId = Number(ins?.insertId ?? 0);
      try {
        const sinc = await this.sincronizarProcuracoes(); // abre nav, loga DET, lê SPE
        await mysqlPool.execute(
          `UPDATE det_coletas
              SET procuracoes_lidas = ?, procuracoes_alteradas = ?,
                  procuracoes_ganharam = ?, procuracoes_perderam = ?,
                  concluido_em = NOW()
            WHERE id = ?`,
          [sinc.lidasNoSpe, sinc.mudancas.length, sinc.ganharam, sinc.perderam, coletaId]
        );
        this.log(
          `procurações: ${sinc.lidasNoSpe} lida(s) · ${sinc.deferidos} deferido(s), ` +
            `${sinc.indeferidos} indeferido(s) · ${sinc.ganharam} ganhou, ${sinc.perderam} perdeu`
        );
      } catch (e: any) {
        const motivo = String(e?.message ?? e).slice(0, 500);
        this.log(`SPE FALHOU: ${motivo}`);
        await mysqlPool
          .execute(`UPDATE det_coletas SET spe_erro = ?, concluido_em = NOW() WHERE id = ?`, [
            motivo,
            coletaId,
          ])
          .catch(() => undefined);
        throw e;
      }
    } finally {
      emAndamento = false;
    }
  }

  async executar(
    origem: 'cron' | 'manual' = 'manual',
    limite?: number,
    opts: { pularColetadosHoje?: boolean; pularSpe?: boolean } = {}
  ): Promise<ResultadoColeta> {
    if (emAndamento) throw new Error('já existe uma coleta em andamento');
    emAndamento = true;
    this.reautenticacoes = 0;

    // Direto no pool: `executeQuery` devolve [] para INSERT (ela só repassa
    // arrays), e sem o insertId todos os UPDATEs de progresso iriam para o
    // id 0 — a rodada terminaria registrada como "0 coletados".
    //
    // O total entra como 0 e é corrigido adiante: quem serão os alvos só se
    // sabe DEPOIS de reler as procurações no SPE, que é o passo que abre esta
    // rodada. Gravar aqui o total da lista velha seria registrar um número que
    // a própria coleta ainda vai desmentir.
    const [ins]: any = await mysqlPool.execute(
      `INSERT INTO det_coletas (origem, total_clientes) VALUES (?, 0)`,
      [origem]
    );
    const coletaId = Number(ins?.insertId ?? 0);

    const res: ResultadoColeta = {
      coletaId,
      total: 0,
      coletados: 0,
      erros: 0,
      mensagensNovas: 0,
      notificacoesNovas: 0,
      reautenticacoes: 0,
      detalhes: [],
    };

    let alvos: any[] = [];

    try {
      await this.abrirNavegador();

      // ─── Passo 1: autenticar no DET ─────────────────────────────────────
      // O DET entra primeiro e CRIA a sessão gov.br. Isso é pré-requisito do
      // passo seguinte: o SPE (aplicação separada) não consegue logar sozinho
      // pelo certificado — como 1º acesso fresh ele trava no SSO (medido no
      // cron de 26/08/2026: "painel Recebidas não apareceu, parou no login do
      // SPE"). Com a sessão do DET no ar, o SPE reaproveita via SSO e entra.
      await this.autenticarComReabertura();

      // ─── Passo 2: checagem de procurações no SPE (reaproveita a sessão) ──
      //
      // Vem antes de escolher os alvos porque é ela que define a lista: o SPE
      // diz quem tem procuração hoje. Reaproveita a sessão gov.br do DET —
      // testado frio em 26/08: leu 136 procurações sem captcha.
      //
      // `pularSpe` separa isto da coleta de caixas: as procurações são checadas
      // numa rodada própria (ex.: 22h) e a coleta de caixas (6h) apenas USA a
      // lista já atualizada, sem refazer o SPE. Assim cada rodada é um login só,
      // e a de caixas nunca é atrasada nem contaminada pela do SPE.
      if (!opts.pularSpe) try {
        const sinc = await this.sincronizarProcuracoes();
        res.procuracoes = sinc;
        await mysqlPool.execute(
          `UPDATE det_coletas
              SET procuracoes_lidas = ?, procuracoes_alteradas = ?,
                  procuracoes_ganharam = ?, procuracoes_perderam = ?
            WHERE id = ?`,
          [sinc.lidasNoSpe, sinc.mudancas.length, sinc.ganharam, sinc.perderam, coletaId]
        );
        if (sinc.mudancas.length) {
          this.log(
            `procurações: ${sinc.ganharam} entrou(entraram), ${sinc.perderam} saiu(saíram)`
          );
          for (const m of sinc.mudancas.slice(0, 20)) {
            this.log(`   ${fmtCnpj(m.cnpj)} ${m.razaoSocial}: ${m.de} -> ${m.para}`);
          }
          if (sinc.mudancas.length > 20) {
            this.log(`   (+${sinc.mudancas.length - 20} outra(s) mudança(s))`);
          }
        }
      } catch (e: any) {
        // Não aborta a coleta. O portal cair não pode custar o dia inteiro, e
        // o próprio DET corrige para baixo ao recusar quem perdeu procuração.
        // O que NÃO pode acontecer é isto passar em branco: quem outorgou
        // ontem fica de fora e ninguém fica sabendo. Por isso vai para o log
        // da coleta e para a tela.
        const motivo = String(e?.message ?? e).slice(0, 500);
        res.speErro = motivo;
        this.log(`SPE FALHOU: ${motivo}`);
        this.log('seguindo com a lista de procurações da rodada anterior');
        await mysqlPool
          .execute(`UPDATE det_coletas SET spe_erro = ? WHERE id = ?`, [motivo, coletaId])
          .catch(() => undefined);
      }

      // ─── Passo 3: voltar ao DET para varrer as caixas ───────────────────
      // O passo 2 deixou a página no SPE (spe.sistema.gov.br). Sem voltar ao
      // DET, o primeiro `assumirPerfil` procuraria "Trocar Perfil"/"Procurador"
      // na tela do SPE, que não tem essa opção — e TODOS os clientes recusariam.
      // `garantirSessao` reautentica se a sessão tiver expirado durante o SPE.
      await this.page.goto(DET_URL, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
      await sleep(3000);
      await this.garantirSessao();
      await this.voltarAoProprioPerfil();

      // ─── Passo 2: varrer a caixa de quem tem procuração ─────────────────
      // `pularColetadosHoje` retoma uma coleta interrompida sem refazer quem já
      // foi varrido hoje — o carimbo em det_procuracoes.ultima_coleta_em diz
      // quem já rodou. Sem isso, retomar recomeça do zero (redundante e ~25min
      // desperdiçados nos já feitos).
      // Retoma pulando quem já foi varrido HOJE com sucesso ('ok'/'vazia'),
      // mas RETENTA quem ficou como 'erro' hoje — o erro pode ter sido
      // transitório (ex.: disputa de perfil), não um problema do cliente.
      const filtroHoje = opts.pularColetadosHoje
        ? `AND (
             p.ultima_coleta_em IS NULL
             OR DATE(p.ultima_coleta_em) < CURDATE()
             OR p.ultima_coleta_status = 'erro'
           )`
        : '';
      alvos = await executeQuery<any>(
        `SELECT p.cnpj, c.razao_social
         FROM det_procuracoes p
         JOIN clientes c ON c.cnpj_limpo = p.cnpj AND c.ativo = 1
         WHERE p.situacao = 'deferido'
         ${filtroHoje}
         ORDER BY c.razao_social ASC
         ${limite ? `LIMIT ${Number(limite)}` : ''}`
      );
      res.total = alvos.length;
      await mysqlPool.execute(`UPDATE det_coletas SET total_clientes = ? WHERE id = ?`, [
        alvos.length,
        coletaId,
      ]);
      this.log(`${alvos.length} cliente(s) com procuração entram nesta coleta`);

      // Um erro num cliente (ex.: Navigation timeout) pode deixar a página
      // presa num perfil e travar TODOS os seguintes com "Procurador
      // indisponível" — visto em 24/08/2026: um timeout no cliente 7 derrubou
      // os 55 seguintes. Estes dois mecanismos contêm isso:
      //   `precisaReset` força um retorno LIMPO ao DET após qualquer falha,
      //   antes do próximo cliente, destravando o perfil;
      //   `falhasSeguidas` aborta se nem o reset recupera — melhor parar e
      //   deixar o resto para a retomada do que martelar o gov.br em vão.
      let precisaReset = false;
      let falhasSeguidas = 0;
      const MAX_FALHAS_SEGUIDAS = 8;

      for (let i = 0; i < alvos.length; i++) {
        const cnpj = soDigitos(alvos[i].cnpj);
        const nome = String(alvos[i].razao_social || '').slice(0, 40);
        this.log(`(${i + 1}/${alvos.length}) ${fmtCnpj(cnpj)} ${nome}`);

        // Recuperação: a iteração anterior falhou, então a página pode estar
        // num estado ruim. Volta ao DET fresco e reautentica se preciso, para
        // o assumirPerfil abaixo partir de um perfil próprio limpo.
        if (precisaReset) {
          try {
            await this.page.goto(DET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
            await sleep(2500);
            await this.garantirSessao();
            await this.voltarAoProprioPerfil();
            this.log('   (reset ao DET após falha anterior)');
          } catch (e: any) {
            this.log(`   reset falhou: ${String(e?.message ?? e).slice(0, 60)}`);
          }
          precisaReset = false;
        }

        try {
          await this.garantirSessao();
          const recusa = await this.assumirPerfil(cnpj);
          if (recusa) {
            res.erros++;
            res.detalhes.push({ cnpj, ok: false, motivo: recusa, mensagens: 0, novas: 0 });
            this.log(`   recusado: ${recusa.slice(0, 90)}`);
            precisaReset = true;
            falhasSeguidas++;

            // O portal é a autoridade. Se ele diz que não há procuração, o
            // registro se corrige sozinho — inclusive por cima de uma marcação
            // manual, que é declaração de intenção, não prova. Sem isto, um
            // "informei que tem" errado ficaria sendo tentado todo dia para
            // sempre, e a tela seguiria contando o cliente como coberto.
            if (/não existe procura|nao existe procura/i.test(recusa)) {
              await executeQuery(
                `UPDATE det_procuracoes
                 SET situacao='indeferido', origem='spe',
                     observacao='Recusado pelo DET na coleta — sem procuração ativa',
                     verificado_em=NOW()
                 WHERE cnpj = ?`,
                [cnpj]
              );
              this.log('   registro corrigido para indeferido');
            }
          } else {
            const { msgs, maisPaginas } = await this.lerCaixa();
            const novas = await this.gravar(cnpj, msgs);
            res.coletados++;
            res.mensagensNovas += novas;
            res.notificacoesNovas += msgs.filter(
              (m) => /notifica/i.test(m.tipo) && m.naoLida
            ).length;
            res.detalhes.push({
              cnpj,
              ok: true,
              mensagens: msgs.length,
              novas,
              paginasNaoLidas: maisPaginas,
            });
            // Carimbo de coleta POR CLIENTE. Caixa vazia é 'vazia', não ausência:
            // sem isto a tela mostraria "nunca" para quem foi conferido e não
            // tinha mensagem, indistinguível de quem nunca foi varrido.
            await this.marcarColeta(cnpj, msgs.length > 0 ? 'ok' : 'vazia', msgs.length);
            this.log(`   ${msgs.length} mensagem(ns), ${novas} nova(s)${maisPaginas ? ' — HÁ MAIS PÁGINAS' : ''}`);
            falhasSeguidas = 0; // sucesso: zera o contador de aborto
          }
        } catch (e: any) {
          res.erros++;
          res.detalhes.push({
            cnpj,
            ok: false,
            motivo: (e?.message ?? 'erro').slice(0, 240),
            mensagens: 0,
            novas: 0,
          });
          // Registra a TENTATIVA que falhou: o cliente fica visível como 'erro'
          // na tela para reprocessar, em vez de continuar como "nunca".
          await this.marcarColeta(cnpj, 'erro', null).catch(() => undefined);
          this.log(`   ERRO: ${e?.message}`);
          precisaReset = true;
          falhasSeguidas++;
        }

        // Estado quebrado que nem o reset recupera: aborta em vez de martelar o
        // gov.br falhando cliente após cliente. Os não-processados ficam como
        // estavam e entram na próxima retomada (--faltantes).
        if (falhasSeguidas >= MAX_FALHAS_SEGUIDAS) {
          this.log(
            `ABORTANDO: ${falhasSeguidas} falhas seguidas — estado não se recupera. ` +
              `${res.coletados} coletado(s) antes de parar; o resto fica para a retomada.`
          );
          await mysqlPool
            .execute(`UPDATE det_coletas SET mensagem_erro=? WHERE id=?`, [
              `abortada após ${falhasSeguidas} falhas seguidas`,
              coletaId,
            ])
            .catch(() => undefined);
          break;
        }

        // Progresso gravado a cada cliente: uma queda perde o cliente da vez,
        // não a rodada inteira.
        await executeQuery(
          `UPDATE det_coletas SET coletados=?, erros=?, mensagens_novas=?,
             notificacoes_novas=?, reautenticacoes=? WHERE id=?`,
          [res.coletados, res.erros, res.mensagensNovas, res.notificacoesNovas, this.reautenticacoes, coletaId]
        );

        if (i < alvos.length - 1) await sleep(jitter());
      }

      res.reautenticacoes = this.reautenticacoes;
      await executeQuery(
        `UPDATE det_coletas SET concluido_em = NOW(), coletados=?, erros=?,
           mensagens_novas=?, notificacoes_novas=?, reautenticacoes=? WHERE id=?`,
        [res.coletados, res.erros, res.mensagensNovas, res.notificacoesNovas, this.reautenticacoes, coletaId]
      );
      this.log(
        `fim: ${res.coletados}/${res.total} coletados, ${res.erros} erro(s), ${res.mensagensNovas} mensagem(ns) nova(s)`
      );
      return res;
    } catch (e: any) {
      await executeQuery(`UPDATE det_coletas SET mensagem_erro=? WHERE id=?`, [
        (e?.message ?? 'falha').slice(0, 1000),
        coletaId,
      ]);
      throw e;
    } finally {
      emAndamento = false;
      await this.fechar();
    }
  }

  /**
   * Encerra o navegador conforme a origem da sessão. Extraído do `finally` do
   * `executar()` quando a sincronização de procurações passou a poder rodar
   * sozinha: duas cópias desta lógica acabariam divergindo justo no ponto que
   * decide se o login feito à mão sobrevive ou não.
   */
  private async fechar(): Promise<void> {
    try {
      // Só desloga se o navegador for nosso. Numa sessão reaproveitada, sair
      // destruiria o login que uma pessoa precisou fazer à mão — e a próxima
      // rodada teria de incomodá-la de novo.
      if (!this.reaproveitou) {
        await this.page?.evaluate(() => {
          const s = Array.from<any>(document.querySelectorAll('button, a')).find(
            (e) => ((e).innerText || '').trim() === 'Sair'
          );
          if (s) s.click();
        });
        await sleep(2000);
      }
    } catch {
      /* logout é cortesia; se falhar, fechar o navegador basta */
    }
    if (this.reaproveitou) {
      // Navegador de outra pessoa (ou de uma sessão já autenticada à mão):
      // apenas solta a conexão. Fechá-lo derrubaria o login que custou uma
      // interação humana para existir.
      try {
        this.browser?.disconnect();
      } catch {
        /* ignore */
      }
    } else {
      // Foi este processo que abriu o Edge, então é ele que fecha. Deixar um
      // navegador autenticado no gov.br rodando até amanhã seria pior que
      // qualquer erro de coleta.
      try {
        await this.browser?.close();
      } catch {
        /* ignore */
      }
      try {
        if (this.processo?.pid) process.kill(this.processo.pid);
      } catch {
        /* já morreu */
      }
    }
    this.page = null;
    this.browser = null;
  }
}

export default DetColetorService;


