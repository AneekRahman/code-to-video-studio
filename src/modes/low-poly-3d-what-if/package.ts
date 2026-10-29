import {copyFile, mkdir, readFile, readdir, realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {AudioPlanSchema, EscalationSchema, modeId} from './escalation.ts';
import {WhatIfJobSchema} from './job.ts';
import {readJson, sha256, writeJson} from '../../files.ts';
import {requireCondition} from '../../errors.ts';
import {planAudio} from './audio.ts';

const limits = {max_operation_attempts: 4, max_runtime_seconds: 7200, max_input_bytes: 100_000_000, max_output_bytes: 400_000_000, concurrency: 1} as const;

/** Assembles a self-contained, hash-pinned what-if job directory from the script, the audio plan and an optional shout clip. */
export async function packageWhatIf(options: {escalation: string; audio: string; shout?: string | undefined; out: string; jobId?: string | undefined; provenance?: string | undefined}) {
  const escalationPath = await realpath(resolve(options.escalation));
  const audioPath = await realpath(resolve(options.audio));
  const escalation = await readJson(escalationPath, EscalationSchema);
  const audio = await readJson(audioPath, AudioPlanSchema);
  planAudio(escalation, audio);
  const out = resolve(options.out);
  await mkdir(out, {recursive: true, mode: 0o700});
  requireCondition((await readdir(out)).length === 0, 'OUTPUT_EXISTS', 'Job directory must be empty');
  const pin = async (source: string, name: string) => {
    await copyFile(source, resolve(out, name));
    return {path: name, sha256: sha256(await readFile(resolve(out, name)))};
  };
  const assets = [];
  if (options.shout) {
    await mkdir(resolve(out, 'audio'));
    assets.push({asset_id: 'shout', kind: 'audio' as const, file: await pin(await realpath(resolve(options.shout)), 'audio/shout.mp3'), provenance: options.provenance ?? 'supplied shout clip', usage_rights: 'declared by the job owner'});
  }
  const frames = Math.round(escalation.duration_seconds * escalation.fps);
  const job = WhatIfJobSchema.parse({
    schema_version: '1.0', adapter: 'local-fixture', mode: modeId, job_id: options.jobId ?? escalation.what_if_id, status: 'approved_for_visual_production',
    format: {width: 1080, height: 1920, fps: 30, duration_seconds: frames / escalation.fps, codec: 'h264', container: 'mp4'},
    inputs: {escalation: await pin(escalationPath, 'escalation.json'), audio: await pin(audioPath, 'audio.json')},
    assets,
    limits: {...limits, max_frames: frames},
  });
  await writeJson(resolve(out, 'job.json'), job);
  return {status: 'job_ready', job: resolve(out, 'job.json'), job_id: job.job_id, duration_seconds: job.format.duration_seconds, assets: assets.length};
}
