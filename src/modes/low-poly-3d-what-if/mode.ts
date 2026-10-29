import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineMode, modeApiVersion} from '../mode.ts';
import {durationRange, modeId} from './escalation.ts';
import {finishWhatIf, loadWhatIfJob, renderWhatIfVisual, type LoadedWhatIfJob} from './job.ts';
import {packageWhatIf} from './package.ts';

const dir = `src/modes/${modeId}`;
const template = (name: string) => fileURLToPath(new URL(name, import.meta.url));

export const lowPolyWhatIfMode = defineMode<LoadedWhatIfJob>({
  api: modeApiVersion.major,
  card: {
    id: modeId,
    title: 'Low-poly 3D "what if" escalation short',
    role: 'specialised',
    summary: 'A silent-narrator "what if" in one flat-shaded low-poly 3D world: a counter doubles (or steps) every second or two, a comparison line and one caption name each size, and the camera outgrows the street, the city, the planet and the sun until a quiet punchline. Sound is a voiced shout and a bass hit per rung that grow to the end, then silence.',
    use_when: [
      'a "what if X doubled every second / was twice as loud / twice as strong as the last" escalation told through scale',
      'a counter with a unit (dB, PSI, joules, kilograms, people) climbing past everyday, then absurd, then cosmic comparisons',
      'a new episode of the low-poly "what if" series: a different premise, counter, comparisons and ending',
    ],
    not_for: [
      'stories with dialogue, plot or several characters (use a story mode)',
      'data explainers, lists, tips or charts (use the explainer)',
      'photorealistic, hand-drawn or isometric-miniature looks',
      'content that needs real footage, screen recordings or generated video',
    ],
    aspect: '9:16',
    duration_seconds: {min: durationRange[0], max: durationRange[1]},
    inputs: ['escalation script (title, counter, rungs, shots, news overlays, ending)', 'audio plan (shout and bass levels, muted rungs)', 'optional shout clip (MP3) from a voice provider'],
    skill: 'skills/low-poly-3d-what-if.md',
    templates: [`${dir}/escalation.template.json`, `${dir}/audio.template.json`],
    commands: ['package-what-if', 'validate', 'compile', 'preview', 'render', 'finish', 'run', 'verify', 'analyze-reference', 'compare-reference'],
  },
  load: loadWhatIfJob,
  runtime: loaded => ({
    renderVisual: (dir, kind, deadline) => renderWhatIfVisual(loaded, dir, kind, deadline),
    finish: (visual, dir, deadline) => finishWhatIf(loaded, visual, dir, deadline),
  }),
  fixture: async out => (await packageWhatIf({escalation: template('escalation.template.json'), audio: template('audio.template.json'), out: resolve(out, 'job')})).job,
});
