import childProcess, {spawn as nodeSpawn} from 'node:child_process';
import {StudioError} from './errors.ts';

const processGroups = new Set<number>();
const originalSpawn = childProcess.spawn;

function trackProcessGroup(child: ReturnType<typeof nodeSpawn>) {
  if (!child.pid) return;
  const pid = child.pid;
  processGroups.add(pid);
  child.once('exit', () => processGroups.delete(pid));
}

function killProcessGroups() {
  for (const pid of processGroups) {
    try {
      process.kill(process.platform === 'win32' ? pid : -pid, 'SIGKILL');
    } catch {
      processGroups.delete(pid);
    }
  }
}

process.once('SIGINT', killProcessGroups);
process.once('SIGTERM', killProcessGroups);
process.once('exit', killProcessGroups);

childProcess.spawn = ((...args: Parameters<typeof nodeSpawn>) => {
  const options = args[2];
  const child = originalSpawn(...args);
  if (options?.detached) trackProcessGroup(child);
  return child;
}) as typeof childProcess.spawn;

function spawnTool(binary: string, args: string[], timeoutMs: number): Promise<{stdout: string; stderr: string}> {
  return new Promise((resolve, reject) => {
    const child = nodeSpawn(binary, args, {detached: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
    trackProcessGroup(child);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout?.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr?.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) {
        try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
      }
    }, timeoutMs);
    child.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', code => {
      clearTimeout(timer);
      if (timedOut) reject(new StudioError('DEADLINE_EXCEEDED', 'Job execution deadline expired'));
      else if (code !== 0) reject(new StudioError('TOOL_FAILED', `${binary} failed`, {exit_code: code}));
      else resolve({stdout, stderr});
    });
  });
}

export async function runToolCapture(binary: string, args: string[], timeoutMs = 30_000): Promise<{stdout: string; stderr: string}> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new StudioError('DEADLINE_EXCEEDED', 'Job execution deadline expired');
  try {
    const {stdout, stderr} = await spawnTool(binary, args, timeoutMs);
    if (stdout.length + stderr.length > 4 * 1024 * 1024) throw new StudioError('TOOL_FAILED', `${binary} output exceeded its limit`);
    return {stdout, stderr};
  } catch (error) {
    if (error instanceof StudioError) throw error;
    const outcome = error as {killed?: boolean; code?: unknown};
    throw new StudioError('TOOL_FAILED', `${binary} failed`, {exit_code: typeof outcome.code === 'number' ? outcome.code : null});
  }
}

export async function runTool(binary: string, args: string[], timeoutMs = 30_000): Promise<string> {
  return (await runToolCapture(binary, args, timeoutMs)).stdout;
}
