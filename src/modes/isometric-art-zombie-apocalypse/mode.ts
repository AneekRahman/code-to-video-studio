import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generatePlates} from '../../plates.ts';
import {generateAudio} from '../../audio.ts';
import {createMockImageProvider} from '../../imagegen/mock.ts';
import {createMockAudioProvider} from '../../audiogen/mock.ts';
import {defineMode, modeApiVersion} from '../mode.ts';
import {packageStory} from './package.ts';
import {finishStory, loadStoryJob, renderStoryVisual, type LoadedStoryJob} from './job.ts';
import {durationRange} from './quality.ts';
import {modeId} from './style.ts';

const dir = `src/modes/${modeId}`;
const template = (name: string) => fileURLToPath(new URL(name, import.meta.url));

export const isometricZombieMode = defineMode<LoadedStoryJob>({
  api: modeApiVersion.major,
  card: {
    id: modeId,
    title: 'Isometric zombie-apocalypse rules short',
    role: 'specialised',
    summary: 'A narrated isometric horror story: a character escapes zombies and locks himself in, an emergency broadcast lists the rules for surviving the night, and an uncanny twist loops back to the opening shot.',
    use_when: [
      'a zombie or apocalypse survival story told in isometric miniature',
      'horror "rules for surviving" shorts with an emergency-broadcast reveal',
      'a new episode of this series: a different location, rules or twist',
    ],
    not_for: [
      'gore or graphic violence (the mode is uncanny, never gory)',
      'horror outside the zombie-survival premise, such as hauntings or slashers',
      'factual or educational content that merely mentions zombies',
    ],
    aspect: '9:16',
    duration_seconds: {min: durationRange[0], max: durationRange[1]},
    inputs: ['story (voiced segments, shots, overlays)', 'plate set', 'sound design (cast, effects, music, cues)', 'NVIDIA_NIM and ELEVENLABS keys for generation'],
    skill: 'skills/isometric-horror-story.md',
    templates: [`${dir}/story.template.json`, `${dir}/plates.template.json`, `${dir}/sound.template.json`],
    commands: ['generate-plates', 'preview-shots', 'preview-story', 'generate-audio', 'package-story', 'run', 'verify'],
  },
  load: loadStoryJob,
  runtime: loaded => ({
    renderVisual: (dir, kind, deadline) => renderStoryVisual(loaded, dir, kind, deadline),
    finish: (visual, dir, deadline) => finishStory(loaded, visual, dir, deadline),
  }),
  fixture: async out => {
    const story = template('story.template.json');
    const sound = template('sound.template.json');
    await generatePlates({plates: template('plates.template.json'), out: resolve(out, 'plates'), provider: createMockImageProvider()});
    await generateAudio({story, sound, out: resolve(out, 'audio'), provider: createMockAudioProvider()});
    return (await packageStory({story, sound, plates: resolve(out, 'plates'), audio: resolve(out, 'audio'), out: resolve(out, 'job')})).job;
  },
});
