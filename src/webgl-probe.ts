import {mkdir, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {openBrowser} from '@remotion/renderer';
import {glRenderer} from './composition.ts';

export type WebglVerdict = {verdict: 'fast' | 'slow' | 'too_slow' | 'unavailable'; renderer: string; ms_per_frame: number; webgl_budget: number};

/** Fill-rate benchmark at a quarter of the render size; a render's WebGL scenes cost roughly 10 to 25 times one of these frames. */
const page = (width: number, height: number) => `<!doctype html><meta charset="utf-8"><pre id="r">pending</pre><script>
const out = (v) => { document.getElementById('r').textContent = JSON.stringify(v); };
try {
  const canvas = document.createElement('canvas'); canvas.width = ${width}; canvas.height = ${height};
  const gl = canvas.getContext('webgl2', {antialias: false, preserveDrawingBuffer: true});
  if (!gl) throw new Error('no webgl2');
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, '#version 300 es\\nin vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }'));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, '#version 300 es\\nprecision highp float; out vec4 o; uniform float t; void main(){ vec2 u = gl_FragCoord.xy / 500.; float v = 0.; for (int i = 0; i < 160; i++) { v += sin(u.x * float(i) + t) * cos(u.y * float(i) - t); u = u.yx + 0.01; } o = vec4(v, v * .5, 1. - v, 1.); }'));
  gl.linkProgram(p); gl.useProgram(p);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const a = gl.getAttribLocation(p, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  const t = gl.getUniformLocation(p, 't'); const px = new Uint8Array(4);
  gl.uniform1f(t, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const frames = 4; const start = performance.now();
  for (let i = 0; i < frames; i++) { gl.uniform1f(t, i); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  out({renderer, ms: (performance.now() - start) / frames});
} catch (e) { out({error: String(e)}); }
</script>`;

/**
 * Thresholds are estimates from two measurements, not a calibration: on an Apple M1 this benchmark takes about 4 ms on the GPU, and a
 * quarter of its shader work took 7 ms on SwiftShader (CPU). A GPU-less 4-vCPU Linux runner took 879 s for the isometric mode's 48 s
 * fixture, about 7 times slower than the same M1. Re-tune the numbers after running `doctor` on the real host.
 */
export function webglVerdict(msPerFrame: number, renderer: string): WebglVerdict {
  const verdict = msPerFrame <= 45 ? 'fast' : msPerFrame <= 220 ? 'slow' : 'too_slow';
  return {verdict, renderer, ms_per_frame: Math.round(msPerFrame * 10) / 10, webgl_budget: verdict === 'fast' ? 3 : verdict === 'slow' ? 1 : 0};
}

/** Runs the benchmark in the same headless browser and GL backend the renderer uses. */
export async function probeWebgl(root: string): Promise<WebglVerdict> {
  const unavailable = (renderer: string): WebglVerdict => ({verdict: 'unavailable', renderer, ms_per_frame: 0, webgl_budget: 0});
  const work = resolve(root, 'work');
  await mkdir(work, {recursive: true, mode: 0o700});
  const file = resolve(work, `.doctor-webgl-${process.pid}.html`);
  await writeFile(file, page(540, 960), {mode: 0o600});
  let browser: Awaited<ReturnType<typeof openBrowser>> | undefined;
  try {
    browser = await Promise.race([
      openBrowser('chrome', {logLevel: 'error', chromiumOptions: {gl: glRenderer}}),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('browser did not start')), 60_000).unref()),
    ]);
    const tab = await browser.newPage({context: {getOriginalPosition: async () => null} as never, logLevel: 'error', indent: false, pageIndex: 0, onBrowserLog: null, onLog: () => undefined});
    await tab.goto({url: `file://${file}`, timeout: 90_000} as never);
    const text = await (tab as never as {evaluate: (expression: string) => Promise<unknown>}).evaluate('document.getElementById("r").textContent');
    const parsed = JSON.parse(String(text)) as {renderer?: string; ms?: number; error?: string};
    if (parsed.ms === undefined) return unavailable(parsed.error ?? 'benchmark did not report');
    return webglVerdict(parsed.ms, parsed.renderer ?? 'unknown');
  } catch (error) {
    return unavailable(error instanceof Error ? error.message.slice(0, 80) : 'benchmark failed to run');
  } finally {
    await browser?.close({silent: true});
    await rm(file, {force: true});
  }
}
