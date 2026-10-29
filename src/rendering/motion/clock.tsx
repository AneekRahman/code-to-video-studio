import {createContext, useContext, type ReactNode} from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import type {Brand, CompiledScene, CompiledWord} from '../../contracts.ts';
import {cueFrames, spokenFrames} from './cues.ts';

export {cueFrames, spokenFrames};

export type Intensity = NonNullable<Brand['motion']>;

export const feels = {
  calm: {damping: 26, stiffness: 110, stagger: 5, distance: 34, drift: 0.6},
  dynamic: {damping: 16, stiffness: 150, stagger: 4, distance: 54, drift: 1},
  punchy: {damping: 11, stiffness: 190, stagger: 3, distance: 78, drift: 1.4},
} as const;

export type Clock = {
  frame: number;
  fps: number;
  duration: number;
  settled: boolean;
  feel: (typeof feels)[Intensity];
  spoken: number[];
};

const ClockContext = createContext<Clock | null>(null);

export function useClock(): Clock {
  const clock = useContext(ClockContext);
  if (!clock) throw new Error('Motion components need a SceneClock or SettledClock');
  return clock;
}

export function SceneClock({scene, words, intensity, lead, children}: {scene: CompiledScene; words: CompiledWord[]; intensity: Intensity; lead: number; children: ReactNode}) {
  const local = useCurrentFrame();
  const {fps} = useVideoConfig();
  const value: Clock = {frame: local + lead, fps, duration: scene.endFrame - scene.startFrame, settled: false, feel: feels[intensity], spoken: spokenFrames(scene, words)};
  return <ClockContext.Provider value={value}>{children}</ClockContext.Provider>;
}

/** The end state of every animation, used to measure the layout a viewer sees once the scene has settled. */
export function SettledClock({scene, words, intensity, children}: {scene: CompiledScene; words: CompiledWord[]; intensity: Intensity; children: ReactNode}) {
  const duration = scene.endFrame - scene.startFrame;
  const value: Clock = {frame: duration, fps: 30, duration, settled: true, feel: feels[intensity], spoken: spokenFrames(scene, words)};
  return <ClockContext.Provider value={value}>{children}</ClockContext.Provider>;
}

export function springAt(clock: Clock, delay = 0, config: {damping?: number; stiffness?: number; mass?: number} = {}): number {
  if (clock.settled) return 1;
  return spring({frame: clock.frame - delay, fps: clock.fps, config: {damping: clock.feel.damping, stiffness: clock.feel.stiffness, mass: 1, ...config}});
}

export function easeAt(clock: Clock, start: number, frames: number, easing: (t: number) => number = Easing.out(Easing.cubic)): number {
  if (clock.settled) return 1;
  return interpolate(clock.frame, [start, start + frames], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing});
}
