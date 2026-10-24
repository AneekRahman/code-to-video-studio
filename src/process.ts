import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {StudioError} from './errors.ts';

const execute = promisify(execFile);
export async function runTool(binary: string, args: string[], timeoutMs = 30_000): Promise<string> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new StudioError('DEADLINE_EXCEEDED', 'Job execution deadline expired');
  try {
    const {stdout} = await execute(binary, args, {timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024, encoding: 'utf8', windowsHide: true});
    return stdout;
  } catch (error) {
    const outcome = error as {killed?: boolean; code?: unknown};
    throw new StudioError(outcome.killed ? 'DEADLINE_EXCEEDED' : 'TOOL_FAILED', `${binary} failed`, {exit_code: typeof outcome.code === 'number' ? outcome.code : null});
  }
}
