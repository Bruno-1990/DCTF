/**
 * Trava que mantém o painel de agendamentos sempre completo.
 *
 * O pedido era "toda vez que formos agendar alguma coisa, isso já ir de forma
 * automática para essa área". Só documentar não sustenta: o próximo job novo
 * nasceria invisível no painel, e ninguém descobriria até alguém perguntar por
 * que um e-mail não chegou.
 *
 * Então: se o server.ts inicia um agendador, ele TEM que estar no catálogo —
 * e todo item do catálogo tem que apontar para um arquivo que existe. Igual aos
 * outros testes de arquitetura, é análise estática de texto: não importa a
 * aplicação, não abre banco e não liga agendador.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');
const CATALOGO = path.join(SRC, 'services', 'agendamentos', 'catalogo.ts');

const read = (f: string): string =>
  fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** Agendadores que o server.ts realmente liga: `xScheduler.start()` + de onde vêm. */
function schedulersIniciados(): string[] {
  const server = read(path.join(SRC, 'server.ts'));
  const origem: Record<string, string> = {};
  for (const m of server.matchAll(/import\s+(\w+)\s+from\s+['"]\.\/services\/([\w/.-]+)['"]/g)) {
    origem[m[1]] = m[2];
  }
  const iniciados = new Set<string>();
  for (const m of server.matchAll(/(\w+)\s*\.\s*start\s*\(\s*\)/g)) {
    const arquivo = origem[m[1]];
    if (arquivo) iniciados.add(`src/services/${arquivo}.ts`);
  }
  return [...iniciados].sort();
}

describe('Arquitetura — painel de agendamentos', () => {
  it('todo agendador iniciado no server.ts está no catálogo', () => {
    const catalogo = read(CATALOGO);
    const faltando = schedulersIniciados().filter((arquivo) => !catalogo.includes(arquivo));
    expect(faltando).toEqual([]);
  });

  it('o catálogo não aponta para arquivo que não existe', () => {
    const catalogo = read(CATALOGO);
    const inexistentes = [...catalogo.matchAll(/arquivoScheduler:\s*['"]([^'"]+)['"]/g)]
      .map((m) => m[1])
      .filter((rel) => !fs.existsSync(path.join(ROOT, rel)))
      .sort();
    expect(inexistentes).toEqual([]);
  });

  it('todo id do catálogo é único e em kebab-case', () => {
    const catalogo = read(CATALOGO);
    const ids = [...catalogo.matchAll(/^\s*id:\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))).toEqual([]);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('toda lista de e-mail do catálogo declara a variável de ambiente que ela substitui', () => {
    const catalogo = read(CATALOGO);
    const listas = [...catalogo.matchAll(/\{\s*chave:\s*['"][^'"]+['"][^}]*\}/g)].map((m) => m[0]);
    expect(listas.length).toBeGreaterThan(0);
    // envLegado pode ser null (lista que nasce sem env, ex.: destinatário vinha do request),
    // mas a chave tem que estar presente — é o que documenta de onde veio cada endereço.
    expect(listas.filter((l) => !/envLegado:/.test(l))).toEqual([]);
  });
});
