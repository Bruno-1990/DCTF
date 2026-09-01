/**
 * Destinatário interno dos e-mails do sistema.
 *
 * Todo envio disparado pela tela vai para alguém de dentro, então o usuário
 * digita só o prefixo e o domínio é fixo — digitar o domínio inteiro toda vez é
 * onde nascem os erros de digitação que fazem o relatório sumir sem aviso.
 *
 * Mora aqui, e não na página que precisou disso primeiro, porque a segunda tela
 * a mandar e-mail (DET) copiaria a regra e as duas divergiriam na primeira
 * mudança — foi exatamente o que aconteceu com os templates de e-mail do
 * backend antes do `email.layout`.
 */

export const DOMINIO_EMAIL = '@central-rnc.com.br';

/** Prefixos válidos de caixa: sem espaço, sem @ e sem acento. */
export const PREFIXO_VALIDO = /^[a-z0-9._+-]+$/;

/**
 * Normaliza o que foi digitado no campo de prefixo.
 *
 * Aceita colar o endereço inteiro ("ti@central-rnc.com.br") e fica só com o
 * que vem antes do @ — caso contrário o envio sairia para
 * "ti@central-rnc.com.br@central-rnc.com.br".
 */
export function normalizarPrefixoEmail(valor: string): string {
  return (valor || '').trim().toLowerCase().split('@')[0] ?? '';
}
