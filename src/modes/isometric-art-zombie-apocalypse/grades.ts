import type {Shot} from './shots.ts';

export type Grade = {
  filter: string;
  tint: string;
  tintBlend: 'soft-light' | 'color' | 'multiply' | 'overlay';
  tintOpacity: number;
  vignette: number;
  grain: number;
  fogColor: string;
  light: {
    sky: string;
    ground: string;
    hemi: number;
    key: string;
    keyIntensity: number;
    keyDirection: [number, number, number];
    rim: string;
    rimIntensity: number;
    rimDirection: [number, number, number];
  };
};

export const grades: Record<Shot['grade'], Grade> = {
  'dusk': {
    filter: 'saturate(1.05) contrast(1.04)',
    tint: '#ff9a4d', tintBlend: 'soft-light', tintOpacity: 0.12, vignette: 0.45, grain: 0.06, fogColor: '#d9b48f',
    light: {sky: '#ffe2bd', ground: '#3b2a20', hemi: 1.4, key: '#ffb26b', keyIntensity: 2.6, keyDirection: [3, 2.2, 1.5], rim: '#7fb0ff', rimIntensity: 0.7, rimDirection: [-2, 1.5, -2]},
  },
  'twilight': {
    filter: 'saturate(0.9) contrast(1.08)',
    tint: '#2f8f86', tintBlend: 'soft-light', tintOpacity: 0.18, vignette: 0.55, grain: 0.07, fogColor: '#8fb3a8',
    light: {sky: '#8fbfd0', ground: '#15211f', hemi: 1.0, key: '#a8d4ff', keyIntensity: 1.6, keyDirection: [-2, 3, 1.2], rim: '#ffcf8a', rimIntensity: 1.1, rimDirection: [2, 1.2, -2]},
  },
  'night': {
    filter: 'saturate(0.82) contrast(1.12) brightness(0.96)',
    tint: '#3fae6a', tintBlend: 'soft-light', tintOpacity: 0.16, vignette: 0.68, grain: 0.085, fogColor: '#7fa890',
    light: {sky: '#5f7fb8', ground: '#0a1210', hemi: 0.75, key: '#9ab8ff', keyIntensity: 1.7, keyDirection: [-2.5, 3, 1], rim: '#c8ffd8', rimIntensity: 0.9, rimDirection: [2, 1.5, -2.5]},
  },
  'interior-night': {
    filter: 'saturate(0.92) contrast(1.1)',
    tint: '#ff8f40', tintBlend: 'soft-light', tintOpacity: 0.08, vignette: 0.7, grain: 0.08, fogColor: '#2a2f3a',
    light: {sky: '#3b4a6b', ground: '#140d08', hemi: 0.7, key: '#ffb06a', keyIntensity: 1.9, keyDirection: [-2.5, 2.2, 1.2], rim: '#86a8ff', rimIntensity: 1.1, rimDirection: [2.5, 1.5, -1.5]},
  },
  'blackout': {
    filter: 'saturate(0.75) contrast(1.08) brightness(1.08)',
    tint: '#2a5cff', tintBlend: 'soft-light', tintOpacity: 0.14, vignette: 0.82, grain: 0.1, fogColor: '#1b2230',
    light: {sky: '#26324d', ground: '#06070a', hemi: 0.22, key: '#7fa6ff', keyIntensity: 0.45, keyDirection: [2.5, 2, -1], rim: '#6ad0ff', rimIntensity: 0.9, rimDirection: [1.5, 1.2, -2.5]},
  },
};
