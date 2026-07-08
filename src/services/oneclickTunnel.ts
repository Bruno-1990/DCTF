/**
 * Auto-heal do túnel SSH do OneClick (DCTF .47 → Postgres de prod na VPS).
 *
 * O Postgres de produção fica em `127.0.0.1:54322` na VPS (só localhost) e é
 * alcançado por um túnel SSH que roda como a Tarefa Agendada do Windows
 * `OneClick-DCTF-Tunnel` (ver `VPS HOSTINGER/oneclick-tunnel/`). Como o backend
 * roda no MESMO host (.47), ele consegue verificar a porta local e, se o túnel
 * estiver caído, subir a tarefa e esperar a porta responder antes de consultar
 * o banco — evitando o erro "ECONNREFUSED 127.0.0.1:54322" no botão OneClick.
 */

import { createConnection } from 'net';
import { execFile } from 'child_process';

const HOST = process.env['ONECLICK_PG_HOST'] || '127.0.0.1';
const PORT = parseInt(process.env['ONECLICK_PG_PORT'] || '54322', 10);
// Nome da Tarefa Agendada que sobe o túnel (configurável p/ outros ambientes).
const TASK_NAME = process.env['ONECLICK_TUNNEL_TASK'] || 'OneClick-DCTF-Tunnel';

const isWindows = process.platform === 'win32';

/** Tenta um connect TCP na porta do túnel. Resolve true se abrir, false caso contrário. */
export function isTunnelUp(timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: HOST, port: PORT });
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

/** Dispara `schtasks /run` na tarefa do túnel. Ignora erro se ela já estiver rodando. */
function runTunnelTask(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isWindows) {
      reject(
        new Error(
          `Túnel do OneClick está fora do ar e o backend não roda no Windows (platform=${process.platform}), ` +
            `então não é possível subir a Tarefa Agendada "${TASK_NAME}" automaticamente. Suba o túnel manualmente.`,
        ),
      );
      return;
    }
    // /run em tarefa já em execução retorna erro benigno — tratamos no polling da porta.
    execFile('schtasks', ['/run', '/tn', TASK_NAME], (err) => {
      if (err) {
        console.warn(`[oneclickTunnel] schtasks /run "${TASK_NAME}" retornou aviso: ${err.message}`);
      }
      resolve();
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface EnsureTunnelResult {
  active: boolean;
  alreadyUp: boolean;
  startedTask: boolean;
  waitedMs: number;
}

/**
 * Garante que o túnel esteja no ar antes de usar o banco do OneClick.
 * Se já estiver, retorna imediatamente. Se não, sobe a Tarefa Agendada e faz
 * polling na porta até responder (ou estourar o timeout). Lança erro claro se falhar.
 */
export async function ensureTunnel(maxWaitMs = 20_000): Promise<EnsureTunnelResult> {
  if (await isTunnelUp()) {
    return { active: true, alreadyUp: true, startedTask: false, waitedMs: 0 };
  }

  console.log(`[oneclickTunnel] Túnel ${HOST}:${PORT} fora do ar — subindo a tarefa "${TASK_NAME}"...`);
  await runTunnelTask();

  const startedAt = Date.now();
  const pollInterval = 500;
  while (Date.now() - startedAt < maxWaitMs) {
    await sleep(pollInterval);
    if (await isTunnelUp()) {
      const waitedMs = Date.now() - startedAt;
      console.log(`[oneclickTunnel] Túnel no ar após ${waitedMs}ms.`);
      return { active: true, alreadyUp: false, startedTask: true, waitedMs };
    }
  }

  throw new Error(
    `Não foi possível ativar o túnel do OneClick (${HOST}:${PORT}) via tarefa "${TASK_NAME}" ` +
      `dentro de ${Math.round(maxWaitMs / 1000)}s. Verifique a chave SSH e a conectividade com a VPS.`,
  );
}

export interface TunnelStatus {
  active: boolean;
  host: string;
  port: number;
  taskName: string;
}

/** Status atual do túnel, para exibir indicador no frontend. */
export async function getTunnelStatus(): Promise<TunnelStatus> {
  return {
    active: await isTunnelUp(),
    host: HOST,
    port: PORT,
    taskName: TASK_NAME,
  };
}
