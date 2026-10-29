import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, cancelRender, continueRender, delayRender, staticFile, useCurrentFrame} from 'remotion';
import * as THREE from 'three';
import type {Escalation} from '../escalation.ts';
import {frameAt, shotsOf} from '../timeline.ts';
import {createHud, type Hud} from '../world/hud.ts';
import {createStage, type Stage} from '../world/stage.ts';

export type StagedFont = {file: string; family: string; weight: string; style: 'normal' | 'italic'};

export type WhatIfProps = {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  escalation: Escalation;
  fonts: StagedFont[];
};

function useFonts(fonts: StagedFont[]) {
  const [handle] = useState(() => delayRender('Load the what-if fonts'));
  useEffect(() => {
    Promise.all(fonts.map(font => new FontFace(font.family, `url("${staticFile(font.file)}")`, {weight: font.weight, style: font.style}).load()))
      .then(loaded => {
        for (const face of loaded) document.fonts.add(face);
        return document.fonts.ready;
      })
      .then(() => continueRender(handle))
      .catch(error => cancelRender(error instanceof Error ? error : new Error(String(error))));
  }, [fonts, handle]);
}

type Engine = {stage: Stage; hud: Hud};

export function WhatIf({width, height, fps, escalation, fonts}: WhatIfProps) {
  useFonts(fonts);
  const frame = useCurrentFrame();
  const canvas = useRef<HTMLCanvasElement>(null);
  const hudHost = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);

  useLayoutEffect(() => {
    if (!engine.current && canvas.current && hudHost.current) {
      const renderer = new THREE.WebGLRenderer({canvas: canvas.current, antialias: true, preserveDrawingBuffer: true});
      renderer.setPixelRatio(1);
      const hud = createHud();
      hud.fit(width);
      hudHost.current.appendChild(hud.element);
      engine.current = {stage: createStage(renderer, width, height, shotsOf(escalation)), hud};
    }
    const current = engine.current;
    if (!current) return;
    const state = frameAt(escalation, frame / fps);
    current.stage.render(state.timeline);
    current.hud.update(state.hud);
  });

  return (
    <AbsoluteFill style={{background: '#000'}}>
      <canvas ref={canvas} width={width} height={height} style={{position: 'absolute', left: 0, top: 0, width, height}}/>
      <div ref={hudHost} style={{position: 'absolute', left: 0, top: 0, width, height}}/>
    </AbsoluteFill>
  );
}
