import {explainerMode} from './explainer/mode.ts';
import {isometricZombieMode} from './isometric-art-zombie-apocalypse/mode.ts';

export const modes = [explainerMode, isometricZombieMode] as const;

export type RegisteredMode = (typeof modes)[number];
export type ModeId = RegisteredMode['card']['id'];
export type AnyLoadedJob = Awaited<ReturnType<RegisteredMode['load']>>;

export const fallbackModeId = explainerMode.card.id;

/** What a bot asks a person when their request falls back to the explainer. OpenMausBot shows `question` and the choice labels as one-tap buttons. */
export const newModeOffer = {
  ask_when: 'A person asked for this video in the conversation, and no specialised mode fits it, so it would fall back to the explainer. Ask once, before production starts.',
  ask_with: 'The OpenMausBot question card: the ask_user tool, or the engine\'s own AskUserQuestion tool.',
  question: 'No specialised video mode fits this request, so I would make it with the general explainer mode. If you will make more videos like this one, I can first build a dedicated mode for them: a short interview, a plan, then a sample for you to review after each build stage. How would you like to go?',
  choices: [
    {label: 'Just this video', action: 'Make it with the explainer mode.'},
    {label: 'New mode, then this video', action: 'Interview, plan and build the new mode (skills/create-mode.md); make this video in it once it ships.'},
    {label: 'New mode, and this video now', action: 'Make this video with the explainer now, and build the new mode alongside it.'},
  ],
  unattended: 'A job Showrunner dispatched without a person in the conversation never waits on this question: make it with the explainer and add a new-mode suggestion to the production report.',
} as const;

export function modeCatalog() {
  return {schema_version: '1.0' as const, fallback: fallbackModeId, modes: modes.map(mode => mode.card), new_mode_offer: newModeOffer};
}
