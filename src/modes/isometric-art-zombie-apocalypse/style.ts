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

const camera = 'True isometric 3D render, orthographic camera at 35 degrees elevation looking from the front-left corner, consistent across the series.';

const framing: Record<z.infer<typeof Framing>, string> = {
  'diorama': 'Large miniature diorama built on a single floating square tile with visible cut soil and pavement edges; the tile is big, spanning nearly the full width of the frame edge to edge, centred vertically, with modest empty space above and below.',
  'cutaway-room': 'Large isometric cutaway room with two walls and a floor on a thin square base, dollhouse cross-section; the room is big, spanning nearly the full width of the frame edge to edge, centred vertically.',
  'close-diorama': 'Close-up corner of a miniature diorama on a floating tile, the subject large and centred, shallow tilt-shift depth of field.',
};

const render = 'Stylised low-poly game-art render, soft global illumination, clean bevelled shapes, subtle tilt-shift miniature blur at the edges, tactile clay and painted-wood materials, crisp silhouettes, high detail props, cinematic contrast.';

const phase: Record<z.infer<typeof Phase>, string> = {
  'dusk': 'Golden dusk: low warm amber sun, long soft shadows, windows glowing orange, a calm cosy palette of amber, cream and muted teal with the first hint of something wrong.',
  'twilight': 'Blue-hour twilight: cold teal sky light, sodium streetlights flickering on, thin ground fog, a sickly green tint creeping into the shadows, dread building.',
  'night': 'Deep night: cold blue moonlight from the upper left, dense low green-tinted fog hugging the ground, small red warning-light accents, deep shadows, eerie silent mood.',
  'interior-night': 'Night interior: a single warm lamp pool against cold blue moonlight through the windows, deep shadows in the corners, claustrophobic and tense.',
  'blackout': 'Power cut: almost total darkness, only cold moonlight slivers and the faint blue glow of a television, heavy vignette.',
};

const constraints = 'Empty scene with no people, no characters, no creatures and no bodies; no text, no letters, no logos, no watermark, no UI. Dark seamless gradient background matching the lighting.';

export function composePlatePrompt(plate: Plate): string {
  return [camera, framing[plate.framing], `Scene: ${plate.subject}`, phase[plate.phase], render, constraints].join(' ');
}
