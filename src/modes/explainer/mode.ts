import {loadJob, type LoadedJob} from '../../load.ts';
import {renderVisual} from '../../render.ts';
import {finishAudio} from '../../mix.ts';
import {createFixture} from '../../../scripts/create-fixture.ts';
import {defineMode, modeApiVersion} from '../mode.ts';

export type LoadedExplainerJob = LoadedJob & {mode: 'explainer'};

export const explainerMode = defineMode<LoadedExplainerJob>({
  api: modeApiVersion.major,
  card: {
    id: 'explainer',
    title: 'Narrated explainer',
    role: 'fallback',
    summary: 'A narrated 9:16 short built from spring-animated titles, lists, quotes, process steps, charts (including an isometric 3D bar field), typed code, counters and gauges, over moving stills, in a dark studio or cream paper look, with scene transitions and word-synced captions, timed to finalized narration and word timestamps.',
    use_when: [
      'educational lists, tips, myths versus facts and how-tos',
      'comparisons, statistics, charts, timelines and processes',
      'quotes, kinetic typography and UI or product mockups',
      'any request that no specialised mode fits',
    ],
    not_for: [
      'stories that a specialised mode covers',
      'AI-generated video, moving footage, screen recordings or talking heads (excluded in v1)',
    ],
    aspect: '9:16',
    duration_seconds: null,
    inputs: ['script', 'storyboard', 'finalized narration audio', 'word-level timestamps', 'brand', 'permitted stills and fonts', 'optional mix tracks'],
    skill: 'skills/explainer-motion.md',
    templates: ['scripts/create-fixture.ts'],
    commands: ['validate', 'compile', 'preview', 'render', 'finish', 'run', 'verify', 'narrate-explainer'],
  },
  load: async (manifestPath, started) => ({...await loadJob(manifestPath, started), mode: 'explainer'}),
  runtime: loaded => ({
    renderVisual: (dir, kind, deadline) => renderVisual(loaded, dir, kind, deadline),
    finish: async (visual, dir, deadline) => ({video: await finishAudio(loaded, visual, dir, deadline), artifacts: []}),
  }),
  fixture: async dir => (await createFixture(dir)).job,
});

export {narrateExplainer} from './narrate.ts';
