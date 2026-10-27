import {z} from 'zod';

export const modeId = 'isometric-art-zombie-apocalypse' as const;

export const Phase = z.enum(['dusk', 'twilight', 'night', 'interior-night', 'blackout']);
export const Framing = z.enum(['diorama', 'cutaway-room', 'close-diorama']);

export const PlateSchema = z.strictObject({
  plate_id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  framing: Framing,
  phase: Phase,
  subject: z.string().min(20).max(900),
  seed: z.number().int().min(1).max(4_294_967_295),
  width: z.number().int(),
  height: z.number().int(),
});
export const PlateSetSchema = z.strictObject({
  schema_version: z.literal('1.0'),
  mode: z.literal(modeId),
  plates: z.array(PlateSchema).min(1).max(16),
});
export type Plate = z.infer<typeof PlateSchema>;
export type PlateSet = z.infer<typeof PlateSetSchema>;

const camera = 'True isometric 3D render, orthographic camera, 35 degree elevation from the front-left.';

const framing: Record<z.infer<typeof Framing>, string> = {
  'diorama': 'Miniature diorama on one floating square tile with cut soil edges, tile spanning the frame width, centred.',
  'cutaway-room': 'Isometric dollhouse cutaway room, two walls and floor on a thin base, spanning the frame width, centred.',
  'close-diorama': 'Close-up corner of a miniature diorama on a floating tile, the subject large and centred, shallow tilt-shift depth of field.',
};

const render = 'Stylised low-poly game art, soft global illumination, bevelled clay and painted-wood materials, tilt-shift blur, cinematic contrast.';

const phase: Record<z.infer<typeof Phase>, string> = {
  'dusk': 'Golden dusk, warm amber sun, long shadows, glowing orange windows, calm palette with a hint of wrong.',
  'twilight': 'Blue-hour twilight, cold teal light, flickering sodium streetlights, thin fog, sickly green shadows.',
  'night': 'Deep night, cold blue moonlight, low green fog, small red warning lights, deep eerie shadows.',
  'interior-night': 'Night interior, one warm lamp against cold blue window moonlight, dark corners, tense.',
  'blackout': 'Power cut, near darkness, moonlight slivers, faint blue TV glow, heavy vignette.',
};

const constraints = 'Empty scene: no people, creatures, bodies, text, logos or UI. Dark seamless gradient background.';

export function composePlatePrompt(plate: Plate): string {
  return [camera, framing[plate.framing], `Scene: ${plate.subject}`, phase[plate.phase], render, constraints].join(' ');
}
