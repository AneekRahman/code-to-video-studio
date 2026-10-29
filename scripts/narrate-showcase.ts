import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {createElevenLabsProvider} from '../src/audiogen/elevenlabs.ts';
import {resolveSecret} from '../src/imagegen/credentials.ts';
import {narrateExplainer} from '../src/modes/explainer/narrate.ts';
import {showcaseScript} from './create-showcase.ts';

const {values} = parseArgs({options: {out: {type: 'string'}, voice: {type: 'string', default: 'pNInz6obpgDQGcFmaJgB'}, only: {type: 'string'}}});
const result = await narrateExplainer({script: showcaseScript(values.only?.split(',')), out: resolve(values.out ?? 'work/showcase-narration'), provider: createElevenLabsProvider(await resolveSecret('ELEVENLABS')), voiceId: values.voice});
process.stdout.write(`${JSON.stringify(result)}\n`);
