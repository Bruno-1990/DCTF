/**
 * Resolvedor de hCaptcha via 2Captcha — REDE DE SEGURANÇA, não caminho normal.
 *
 * O login do DET pelo CERTIFICADO não passa por captcha: medido em 24/08/2026,
 * as falhas de login mostraram `frames: []` e nenhum challenge — o que trava é
 * o timing do handshake do certificado, resolvido reabrindo o navegador. O
 * hCaptcha do gov.br está preso ao fluxo de CPF+senha, que não usamos.
 *
 * ENTÃO POR QUE ISTO EXISTE: o gov.br tem antiabuse. Se um dia ele passar a
 * exigir um challenge ATIVO no fluxo do certificado — por frequência, por IP,
 * pelo que for — sem isto a coleta trava e ninguém sabe por quê. O operador
 * autorizou usar a chave 2Captcha nesse caso. A regra de ouro: só dispara
 * quando há um challenge REAL na tela; nunca "por via das dúvidas", que
 * queimaria saldo e tempo em toda coleta.
 *
 * hCaptcha resolve-se assim: manda-se (sitekey, url) ao 2Captcha, ele devolve
 * um token, e injeta-se o token nos campos que o widget lê
 * (`h-captcha-response` / `g-recaptcha-response`) disparando o callback. Não há
 * imagem para "ver" do nosso lado — o 2Captcha faz isso e entrega o token.
 */

const API_KEY = process.env['2CAPTCHA_API_TOKEN'] || '';
const IN_URL = 'https://2captcha.com/in.php';
const RES_URL = 'https://2captcha.com/res.php';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function temChaveCaptcha(): boolean {
  return API_KEY.trim().length >= 20;
}

/**
 * Pede ao 2Captcha um token para um hCaptcha. Devolve o token ou lança.
 * `timeoutMs` cobre a espera pela resolução humana do outro lado (dezenas de
 * segundos é normal para hCaptcha).
 */
export async function resolverHCaptcha(
  sitekey: string,
  pageUrl: string,
  log: (m: string) => void = () => {},
  timeoutMs = 180000
): Promise<string> {
  if (!temChaveCaptcha()) throw new Error('2CAPTCHA_API_TOKEN ausente ou inválido no .env');

  const criar = new URLSearchParams({
    key: API_KEY,
    method: 'hcaptcha',
    sitekey,
    pageurl: pageUrl,
    json: '1',
  });
  const criado: any = await fetch(`${IN_URL}?${criar.toString()}`).then((r) => r.json());
  if (String(criado.status) !== '1') {
    throw new Error(`2Captcha recusou o pedido: ${criado.request || JSON.stringify(criado)}`);
  }
  const idCaptcha = criado.request;
  log(`2Captcha aceitou o desafio (id ${idCaptcha}); aguardando resolução...`);

  const consultar = new URLSearchParams({ key: API_KEY, action: 'get', id: idCaptcha, json: '1' });
  const inicio = Date.now();
  // O 2Captcha pede pelo menos ~5s antes da primeira consulta.
  await sleep(15000);
  while (Date.now() - inicio < timeoutMs) {
    const r: any = await fetch(`${RES_URL}?${consultar.toString()}`).then((x) => x.json());
    if (String(r.status) === '1') {
      log('2Captcha devolveu o token');
      return r.request as string;
    }
    if (r.request && r.request !== 'CAPCHA_NOT_READY') {
      throw new Error(`2Captcha falhou: ${r.request}`);
    }
    await sleep(5000);
  }
  throw new Error('2Captcha não resolveu dentro do tempo limite');
}
