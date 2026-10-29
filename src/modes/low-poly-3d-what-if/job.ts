import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {extname, resolve} from 'node:path';
import {AudioPlanSchema, EscalationSchema, modeId, type AudioPlan, type Escalation} from './escalation.ts';
import {isMp3} from '../../audiogen/provider.ts';
import {modeJobSchema, loadJobFiles} from '../../job-files.ts';
import {readJson} from '../../files.ts';
import {requireCondition, StudioError} from '../../errors.ts';
import {renderComposition} from '../../composition.ts';
import {mixWhatIf, muxWhatIf, planAudio} from './audio.ts';
import {measureExport, whatIfRubric} from './quality.ts';
import {stageWhatIfFonts} from './fonts.ts';
import {rungStart, rungText} from './timeline.ts';

export const WhatIfJobSchema = modeJobSchema(modeId, ['escalation', 'audio'], ['audio']);

export async function loadWhatIfJob(manifestPath: string, started = Date.now()) {
  void started;
  const files = await loadJobFiles(manifestPath, WhatIfJobSchema);
  const {job, assetPaths} = files;
  let escalation: Escalation;
  let audio: AudioPlan;
  try {
    escalation = await readJson(files.paths.escalation, EscalationSchema);
    audio = await readJson(files.paths.audio, AudioPlanSchema);
  } catch (error) {
    if (error instanceof StudioError) throw error;
    throw new StudioError('INVALID_CONTRACT', error instanceof Error ? error.message : 'The what-if script is inconsistent');
  }
  const frames = Math.round(escalation.duration_seconds * escalation.fps);
  requireCondition(frames <= job.limits.max_frames, 'FRAME_LIMIT', 'Job exceeds the configured frame allowance');
  requireCondition(Math.abs(frames / escalation.fps - job.format.duration_seconds) <= 1 / escalation.fps, 'TIMING_CONFLICT', 'Job duration does not match the what-if script');
  const shout = assetPaths.shout;
  if (shout) {
    requireCondition(extname(shout).toLowerCase() === '.mp3' && isMp3((await readFile(shout)).subarray(0, 16)), 'UNSUPPORTED_ASSET', 'The shout clip must be an MP3 file');
  }
  for (const id of Object.keys(assetPaths)) requireCondition(id === 'shout', 'UNSUPPORTED_ASSET', `Unknown asset ${id}; the only asset is "shout"`);
  let plan: ReturnType<typeof planAudio>;
  try {
    plan = planAudio(escalation, audio);
  } catch (error) {
    if (error instanceof StudioError) throw error;
    throw new StudioError('INVALID_MIX', error instanceof Error ? error.message : 'The audio plan is inconsistent');
  }
  const timeline = {
    schema_version: '1.0', job_id: job.job_id, mode: modeId, fps: escalation.fps, durationInFrames: frames,
    rungs: escalation.counter.rungs, first_rung: {at: rungStart(escalation, 1), text: rungText(escalation, 1)}, last_rung: {at: rungStart(escalation, escalation.counter.rungs), text: rungText(escalation, escalation.counter.rungs)},
    shots: escalation.shots.map(s => ({world: s.world, variant: s.variant ?? null, from_seconds: s.from_seconds, to_seconds: s.to_seconds})),
    audio_cues: plan.cues.length, silence: plan.silence,
  };
  return {mode: modeId, ...files, escalation, audio, shoutFile: shout, timeline};
}

export type LoadedWhatIfJob = Awaited<ReturnType<typeof loadWhatIfJob>>;

export async function renderWhatIfVisual(loaded: LoadedWhatIfJob, dir: string, kind: 'preview' | 'render', deadline: number) {
  const publicDir = resolve(dir, 'public');
  await mkdir(publicDir, {recursive: true});
  const {escalation} = loaded;
  const fps = escalation.fps;
  const props = {width: 1080, height: 1920, fps, durationInFrames: Math.round(escalation.duration_seconds * fps), escalation, fonts: await stageWhatIfFonts(publicDir)};
  const scale = kind === 'preview' ? 0.5 : 1;
  const sample = Math.min(escalation.shots.length, 12);
  const picks = Array.from({length: sample}, (_, i) => escalation.shots[Math.floor((i * escalation.shots.length) / sample)]!);
  const stills = picks.map((shot, i) => ({name: `shot-${String(i + 1).padStart(2, '0')}-${shot.world}.png`, frame: Math.min(props.durationInFrames - 1, Math.round((shot.from_seconds + (shot.to_seconds - shot.from_seconds) * 0.7) * fps)), scale: 0.25, format: 'png' as const}));
  const size = await renderComposition({composition: 'WhatIf', inputProps: props, publicDir, workDir: dir, video: {path: resolve(dir, 'visual.mp4'), scale}, stills, deadline});
  return {video: 'visual.mp4', thumbnails: stills.map(s => s.name), width: size.width * scale, height: size.height * scale};
}

export async function finishWhatIf(loaded: LoadedWhatIfJob, visualPath: string, dir: string, deadline: number) {
  const work = resolve(dir, 'mix');
  await mkdir(work);
  const mix = await mixWhatIf(loaded.escalation, loaded.audio, loaded.shoutFile, work);
  requireCondition(Date.now() < deadline, 'DEADLINE_EXCEEDED', 'Job deadline expired while mixing');
  await muxWhatIf(visualPath, resolve(work, mix.master), loaded.escalation.duration_seconds, resolve(dir, 'final.mp4'));
  await rm(work, {recursive: true, force: true});
  const checks = [...whatIfRubric(loaded.escalation), ...await measureExport(resolve(dir, 'final.mp4'), loaded.escalation)];
  requireCondition(Date.now() < deadline, 'DEADLINE_EXCEEDED', 'Job deadline expired during quality measurement');
  const write = (name: string, value: unknown) => writeFile(resolve(dir, name), `${JSON.stringify(value, null, 2)}\n`, {flag: 'wx', mode: 0o600});
  await write('mix-report.json', {schema_version: '1.0', loudness: mix.loudness, cues: mix.cues, silence: mix.silence});
  await write('quality.json', {schema_version: '1.0', all_checks_passed: checks.every(c => c.pass), creative_acceptance: 'not_reviewed', checks});
  return {video: 'final.mp4', artifacts: ['mix-report.json', 'quality.json']};
}
