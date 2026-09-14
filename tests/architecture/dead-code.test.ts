/**
 * Testes de arquitetura: impedem que código morto volte a se acumular.
 *
 * POR QUE EXISTEM: a auditoria de 2026-09-14 achou módulos inteiros com rota,
 * controller e service que nunca eram montados no server.ts, telas chamando uma
 * API desligada, dependências sem nenhum import e scripts Python que ninguém
 * chama. Nada disso quebra o build, então nada avisava.
 *
 * Tudo aqui é análise estática de texto: nenhum módulo da aplicação é importado,
 * então o teste não abre conexão com banco nem liga agendador.
 *
 * Um arquivo só usado por testes conta como morto — teste cobrindo código que a
 * aplicação não executa dá falsa sensação de cobertura. Exceção consciente vai
 * para a ALLOWLIST com o motivo.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');
const FE = path.join(ROOT, 'frontend', 'src');
const PY = path.join(ROOT, 'python');

/** Arquivos mantidos de propósito mesmo sem uso em runtime (caminho relativo à raiz → motivo). */
const ALLOWLIST: Record<string, string> = {
  'src/services/DCTFBusinessRulesService.ts':
    'Regras de negócio da DCTF com testes próprios, sem consumidor em runtime. Mantido na limpeza de 2026-09-14 até decidir se volta a ser ligado ou sai.',
  'python/scripts/investigar_sp_bi_fat.py':
    'Ferramenta manual de monitoramento da SP_BI_FAT, citada em docs/REOA_CONFERENCIA.md e docs/investigacao-sp_bi_fat-timeout.md.',
};

const norm = (p: string): string => path.resolve(p).replace(/\\/g, '/');
const rel = (p: string): string => path.relative(ROOT, p).replace(/\\/g, '/');

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (/^(node_modules|__pycache__|dist|\.git)$/.test(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, exts));
    else if (exts.includes(path.extname(e.name))) out.push(p);
  }
  return out;
}

const read = (f: string): string => fs.readFileSync(f, 'utf8');
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const isTestFile = (f: string): boolean => /(__tests__|[\\/]test[\\/]|\.(test|spec)\.tsx?$)/.test(f);

// ---------------------------------------------------------------- grafo TS

interface Edge {
  to: string;
  typeOnly: boolean;
}

function resolveTs(fromFile: string, spec: string, aliasRoot: string): string | null {
  let base: string;
  if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else if (spec.startsWith('@/')) base = path.join(aliasRoot, spec.slice(2));
  else return null;
  const candidates = [
    base,
    ...['.ts', '.tsx', '.js', '.jsx', '.json'].map((x) => base + x),
    ...['index.ts', 'index.tsx', 'index.js'].map((x) => path.join(base, x)),
  ];
  for (const c of candidates) if (fs.existsSync(c) && fs.statSync(c).isFile()) return norm(c);
  return null;
}

function edgesOf(file: string, aliasRoot: string): Edge[] {
  const txt = stripComments(read(file));
  const edges: Edge[] = [];
  const re =
    /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([\s\S]*?)\sfrom\s+['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt))) {
    const spec = m[3] || m[4] || m[5] || m[6];
    const clause = (m[2] || '').trim();
    const typeOnly = !!m[1] || /^\{\s*(type\s+\w+\s*,?\s*)+\}$/.test(clause);
    const to = resolveTs(file, spec, aliasRoot);
    if (to) edges.push({ to, typeOnly });
  }
  return edges;
}

/**
 * Arquivos alcançáveis a partir das raízes. `import type` conta como uso: um
 * arquivo só de tipos (ex.: types/index.ts) é vivo enquanto alguém o referencia.
 */
function reachable(roots: string[], aliasRoot: string): Set<string> {
  const seen = new Set<string>();
  const stack = roots.map(norm);
  while (stack.length) {
    const f = stack.pop() as string;
    if (seen.has(f)) continue;
    seen.add(f);
    if (!/\.(ts|tsx|js|jsx)$/.test(f)) continue;
    for (const e of edgesOf(f, aliasRoot)) stack.push(e.to);
  }
  return seen;
}

function unreachable(files: string[], reach: Set<string>): string[] {
  return files
    .filter((f) => !reach.has(norm(f)))
    .map(rel)
    .filter((f) => !ALLOWLIST[f])
    .sort();
}

// ---------------------------------------------------------------- server.ts

function mountedRouteFiles(): Set<string> {
  const server = stripComments(read(path.join(SRC, 'server.ts')));
  const byVar: Record<string, string> = {};
  for (const m of server.matchAll(/import\s+(\w+)\s+from\s+['"]\.\/routes\/([\w-]+)['"]/g)) byVar[m[1]] = m[2];
  for (const m of server.matchAll(/const\s+(\w+)\s*=\s*require\(\s*['"]\.\/routes\/([\w-]+)['"]\s*\)/g)) byVar[m[1]] = m[2];
  const mounted = new Set<string>();
  for (const m of server.matchAll(/\.use\(\s*['"][^'"]+['"]\s*,([^)]*)\)/g)) {
    for (const arg of m[1].split(',').map((a) => a.trim())) if (byVar[arg]) mounted.add(byVar[arg]);
  }
  return mounted;
}

// ================================================================= testes

describe('Arquitetura — sem código morto', () => {
  it('toda rota em src/routes está montada no server.ts', () => {
    const mounted = mountedRouteFiles();
    const naoMontadas = walk(path.join(SRC, 'routes'), ['.ts'])
      .map((f) => path.basename(f, '.ts'))
      .filter((r) => !mounted.has(r))
      .sort();
    expect(naoMontadas).toEqual([]);
  });

  it('todo arquivo do backend é alcançável a partir do src/index.ts ou de um script', () => {
    const scripts = walk(path.join(SRC, 'scripts'), ['.ts', '.js']);
    const reach = reachable([path.join(SRC, 'index.ts'), ...scripts], SRC);
    const files = walk(SRC, ['.ts', '.js']).filter((f) => !isTestFile(f) && !f.endsWith('.d.ts'));
    expect(unreachable(files, reach)).toEqual([]);
  });

  it('todo arquivo do frontend é alcançável a partir do main.tsx', () => {
    const reach = reachable([path.join(FE, 'main.tsx')], FE);
    const files = walk(FE, ['.ts', '.tsx']).filter(
      (f) => !isTestFile(f) && !f.endsWith('.d.ts') && !/[\\/]setupTests?\.ts$/.test(f),
    );
    expect(unreachable(files, reach)).toEqual([]);
  });

  it('toda dependência de produção do backend é importada em algum lugar de src/', () => {
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
    const code = walk(SRC, ['.ts', '.js']).map(read).join('\n');
    const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const semImport = Object.keys(pkg.dependencies || {})
      .filter((d) => !d.startsWith('@types/'))
      .filter((d) => !new RegExp(`(from\\s+|require\\(\\s*|import\\(\\s*)['"]${esc(d)}(/[^'"]*)?['"]`).test(code))
      .sort();
    expect(semImport).toEqual([]);
  });

  it('todo script Python é chamado pelo Node, importado por outro .py ou coberto por teste', () => {
    const pyFiles = walk(PY, ['.py']);
    const isPyTest = (f: string): boolean => /[\\/]tests?[\\/]|[\\/]test_[^\\/]+\.py$/.test(f);
    const tsText = walk(SRC, ['.ts', '.js']).map(read).join('\n');
    const byStem = new Map<string, string[]>();
    for (const f of pyFiles) {
      const stem = path.basename(f, '.py');
      byStem.set(stem, [...(byStem.get(stem) || []), norm(f)]);
    }

    // arestas: `import x` / `from x import y` / caminho literal 'x.py' (importlib)
    const edges = new Map<string, string[]>();
    for (const f of pyFiles) {
      const txt = read(f);
      const tos = new Set<string>();
      // Import pode vir indentado (dentro de try), com comentário no fim (`from format import x  # type: ignore`)
      // ou com a lista de nomes só na linha seguinte (`from validacao_e110 import (`).
      for (const m of txt.matchAll(/^\s*(?:from\s+\.*([\w.]+)\s+import\s+\(?([\w, *]*)|import\s+([\w.]+))/gm)) {
        const parts = [...(m[1] || m[3]).split('.'), ...(m[2] ? m[2].replace(/[()\s]/g, '').split(',') : [])];
        for (const p of parts) (byStem.get(p) || []).forEach((t) => tos.add(t));
      }
      for (const m of txt.matchAll(/['"/]([\w]+)\.py['"]/g)) (byStem.get(m[1]) || []).forEach((t) => tos.add(t));
      edges.set(norm(f), [...tos]);
    }

    const roots = pyFiles.filter(
      (f) => isPyTest(f) || new RegExp(`['"\`/\\\\]${path.basename(f).replace('.', '\\.')}['"\`]`).test(tsText),
    );
    const seen = new Set<string>();
    const stack = roots.map(norm);
    while (stack.length) {
      const f = stack.pop() as string;
      if (seen.has(f)) continue;
      seen.add(f);
      (edges.get(f) || []).forEach((t) => stack.push(t));
    }

    const orfaos = pyFiles
      .filter((f) => !isPyTest(f) && path.basename(f) !== '__init__.py' && !seen.has(norm(f)))
      .map(rel)
      .filter((f) => !ALLOWLIST[f])
      .sort();
    expect(orfaos).toEqual([]);
  });

  it('todo teste (backend e frontend) importa apenas arquivos que existem', () => {
    // Cada teste resolve `@/` contra a própria árvore: tests/ e src/ → src; frontend → frontend/src.
    const suites: Array<[string[], string]> = [
      [[...walk(path.join(ROOT, 'tests'), ['.ts']), ...walk(SRC, ['.ts']).filter(isTestFile)], SRC],
      [walk(FE, ['.ts', '.tsx']).filter(isTestFile), FE],
    ];
    const quebrados: string[] = [];
    for (const [testFiles, aliasRoot] of suites) {
      for (const f of testFiles) {
        const txt = stripComments(read(f));
        for (const m of txt.matchAll(/(?:from\s+|require\(\s*|(?:jest|vi)\.mock\(\s*)['"](\.[^'"]+)['"]/g)) {
          if (!resolveTs(f, m[1], aliasRoot)) quebrados.push(`${rel(f)} -> ${m[1]}`);
        }
      }
    }
    expect(quebrados.sort()).toEqual([]);
  });
});
