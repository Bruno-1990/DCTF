/**
 * Aviso avulso: tutorial do atalho Serv01 (pastas de rede da empresa).
 *
 * Usa o mesmo molde dos outros avisos (`email.layout` + `EmailService`), mas é
 * disparo manual, não agendador. Sem argumento, manda só para ti@ (teste).
 *
 * Uso: npx ts-node --transpile-only src/scripts/enviar-tutorial-serv01.ts [dest1,dest2,...]
 */
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

// eslint-disable-next-line import/first
import { blocoNeutro, moldura } from '../services/email.layout';
// eslint-disable-next-line import/first
import { EmailService } from '../services/EmailService';

const LINK = 'http://192.168.0.47:5176/tutoriais/atalho-servidor';

const destinatarios = (process.argv[2] ?? 'ti@central-rnc.com.br')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const html = moldura({
  titulo: 'Como acessar Documentos Específicos no Serv01',
  subtitulo: 'Tutorial passo a passo',
  corpo: blocoNeutro(
    'Preparamos um tutorial com imagens de como criar, na sua área de trabalho, o atalho <strong>Serv01</strong> ' +
      'e acessar as pastas de rede da empresa, como <strong>Documentos Específicos</strong>. São 8 passos rápidos, e cada um mostra a tela correspondente.' +
      '<br><br>Se o Windows pedir credenciais, o tutorial também mostra como entrar com o seu usuário.'
  ),
  cta: { url: LINK, texto: 'Abrir o tutorial' },
  rodape: {
    titulo: 'Central Contábil · TI',
    texto: 'O link funciona dentro da rede da empresa. Dúvidas? Fale com a TI.',
  },
});

async function main(): Promise<void> {
  const service = new EmailService();
  const ok = await service.sendEmail({
    to: destinatarios.join(', '),
    subject: 'Tutorial · Como acessar Documentos Específicos no Serv01',
    html,
  });
  console.log(ok ? `Enviado para: ${destinatarios.join(', ')}` : 'Falha no envio.');
  process.exit(ok ? 0 : 1);
}

void main();
