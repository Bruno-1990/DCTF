/**
 * As ações da Administração exigem credencial de administrador NO SERVIDOR.
 *
 * Lê os arquivos de rota como texto, como o route-table.test.ts (importar as rotas puxa a árvore
 * inteira e os agendadores). Cada rota abaixo precisa ter `requireAdmin` como primeiro middleware,
 * e o login precisa estar montado em /api/admin.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '..', '..', 'src');
const semComentarios = (f: string): string =>
  fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** [arquivo de rota, método, caminho dentro do router] */
const PROTEGIDAS: Array<[string, string, string]> = [
  // Zona de risco e e-CAC
  ['dctf', 'post', '/admin/clear'],
  ['dctf', 'post', '/admin/restore'],
  ['dctf', 'post', '/admin/sync'],
  ['dctf', 'post', '/admin/retry-sync-errors'],
  // E-mails em massa
  ['dctf', 'post', '/admin/send-email-pending'],
  ['conferencias', 'post', '/send-email-sem-dctf-com-movimento'],
  // Cartão CNPJ (ReceitaWS) gravando no cadastro
  ['clientes', 'post', '/atualizar-cadastro-receita-ws'],
  ['clientes', 'post', '/aplicar-cadastro-simulado'],
  // Situação Fiscal em lote (consultas cobradas no SERPRO)
  ['situacao-fiscal', 'post', '/lote/iniciar'],
  ['situacao-fiscal', 'post', '/lote/iniciar-pendentes'],
  ['situacao-fiscal', 'post', '/lote/popular-pendentes'],
  ['situacao-fiscal', 'post', '/lote/:progressId/cancelar'],
  ['participacao-sitf', 'post', '/fila-consulta'],
  // Agendamentos (configurar e disparar)
  ['agendamentos', 'patch', '/:id'],
  ['agendamentos', 'post', '/:id/emails'],
  ['agendamentos', 'delete', '/:id/emails'],
  ['agendamentos', 'post', '/:id/executar'],
];

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('Rotas da Administração exigem administrador no servidor', () => {
  it.each(PROTEGIDAS)('%s: %s %s tem requireAdmin', (arquivo, metodo, caminho) => {
    const txt = semComentarios(path.join(SRC, 'routes', `${arquivo}.ts`));
    const declaracao = new RegExp(`router\\.${metodo}\\(\\s*['"\`]${escapar(caminho)}['"\`]\\s*,([^\\n]*)`);
    const m = txt.match(declaracao);
    expect(m).not.toBeNull();
    expect(m![1].trim().startsWith('requireAdmin')).toBe(true);
    expect(txt).toMatch(/import\s*\{\s*requireAdmin\s*\}\s*from\s*['"]\.\.\/middleware\/requireAdmin['"]/);
  });

  it('o login da Administração está montado em /api/admin', () => {
    const server = semComentarios(path.join(SRC, 'server.ts'));
    expect(server).toMatch(/import\s+adminAuthRoutes\s+from\s+['"]\.\/routes\/admin-auth['"]/);
    expect(server).toMatch(/\.use\(\s*['"]\/api\/admin['"]\s*,\s*adminAuthRoutes\s*\)/);
  });

  it('o .env.example documenta as variáveis (sem valor real)', () => {
    const exemplo = fs.readFileSync(path.resolve(SRC, '..', '.env.example'), 'utf8');
    expect(exemplo).toMatch(/^ADMIN_PASSWORD=\s*$/m);
    expect(exemplo).toMatch(/^ADMIN_TOKEN_SECRET=\s*$/m);
  });
});
