/**
 * Caracterização da API: a lista de endpoints que o server.ts monta.
 *
 * O retrato foi tirado antes da limpeza de código morto de 2026-09-14. Remover
 * arquivo morto não pode tirar nem acrescentar endpoint — se este teste mudar,
 * alguma coisa viva foi junto. Atualize o snapshot (`jest -u`) só quando a
 * mudança na API for intencional.
 *
 * Lê os arquivos em vez de importá-los, por dois motivos: o construtor do
 * `Server` liga os agendadores (DET, DARF, cota...), e importar as rotas faz o
 * ts-jest checar os tipos de toda a árvore — que hoje já tem erros antigos em
 * `reports/ReportPdfService.ts`, alheios a esta caracterização.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '..', '..', 'src');
const read = (f: string): string =>
  fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

interface Mount {
  prefix: string;
  file: string;
}

function mounts(): Mount[] {
  const server = read(path.join(SRC, 'server.ts'));
  const byVar: Record<string, string> = {};
  for (const m of server.matchAll(/import\s+(\w+)\s+from\s+['"]\.\/routes\/([\w-]+)['"]/g)) byVar[m[1]] = m[2];
  for (const m of server.matchAll(/const\s+(\w+)\s*=\s*require\(\s*['"]\.\/routes\/([\w-]+)['"]\s*\)/g)) byVar[m[1]] = m[2];
  const out: Mount[] = [];
  for (const m of server.matchAll(/\.use\(\s*['"]([^'"]+)['"]\s*,([^)]*)\)/g)) {
    const routeVar = m[2].split(',').map((a) => a.trim()).find((a) => byVar[a]);
    if (routeVar) out.push({ prefix: m[1], file: byVar[routeVar] });
  }
  return out;
}

function endpoints({ prefix, file }: Mount): string[] {
  const txt = read(path.join(SRC, 'routes', `${file}.ts`));
  return [...txt.matchAll(/\brouter\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g)].map(
    (m) => `${m[1].toUpperCase()} ${prefix}${m[2] === '/' ? '' : m[2]}`,
  );
}

describe('Caracterização — endpoints montados no server.ts', () => {
  it('a tabela de rotas da API não muda', () => {
    const table = mounts().flatMap(endpoints).sort();

    expect(table.length).toBeGreaterThan(200);
    expect(table).toMatchSnapshot();
  });
});
