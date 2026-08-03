/**
 * Substituto do pacote `uuid` NOS TESTES.
 *
 * POR QUE: o uuid v13 é publicado só em ESM (`export {...}`), sem versão
 * CommonJS. O Jest roda em CommonJS e não converte node_modules, então
 * qualquer suíte que encostasse no MySQLDatabaseService — que importa uuid —
 * morria com "Unexpected token 'export'" antes de rodar um teste sequer.
 *
 * A saída é honesta porque o `crypto.randomUUID` do Node gera UUID v4 pelo
 * mesmo padrão (RFC 4122), com entropia criptográfica. Todo o código do
 * projeto usa exclusivamente `v4` — conferido nos 15 pontos de uso.
 *
 * Se um dia alguém precisar de v1/v5/v7, isto aqui vai estourar "não é uma
 * função" na hora, e não silenciosamente — que é o comportamento desejado
 * para um substituto.
 *
 * ALTERNATIVA MAIS LIMPA (não feita aqui por sair do escopo): trocar o pacote
 * pelo `crypto.randomUUID` no código de produção e remover a dependência.
 */
import { randomUUID } from 'crypto';

export const v4 = (): string => randomUUID();

export default { v4 };
