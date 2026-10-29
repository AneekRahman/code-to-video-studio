import {useEffect, useState} from 'react';
import {AbsoluteFill, Composition, Sequence, cancelRender, continueRender, delayRender, registerRoot, staticFile, useCurrentFrame} from 'remotion';
import type {RenderProps, CompiledScene, Brand} from '../contracts.ts';
import {getCaptionClearance} from '../captions.ts';
import {ProgressBar, SafeArea} from './components.tsx';
import {Backdrop, FilmGrain} from './motion/Backdrop.tsx';
import {MotionCaptions} from './motion/Captions.tsx';
import {SceneClock, SettledClock} from './motion/clock.tsx';
import {SceneBackground, SceneLayout} from './motion/Scene.tsx';
import {paletteFor} from './motion/theme.ts';
import {SceneShell, TransitionLayer, transitionInto} from './motion/Transitions.tsx';
import {IsoHorror} from '../modes/isometric-art-zombie-apocalypse/rendering/scene.tsx';
import type {IsoProps} from '../modes/isometric-art-zombie-apocalypse/shots.ts';
import {IsoStory} from '../modes/isometric-art-zombie-apocalypse/rendering/story-scene.tsx';
import type {StoryProps} from '../modes/isometric-art-zombie-apocalypse/story.ts';
import {overflowsItsBox} from './layout-overflow.ts';

const FIRST_SCENE_LEAD = 10;

export function validateSceneLayout(
  scene: CompiledScene,
  brand: Brand,
  dimensions: {width: number; height: number}
): string | null {
  const el = document.getElementById(`measure-scene-${scene.scene_id}`);
  if (!el) return null;

  const captionReserve = brand.caption_mode === 'none' ? 0 : getCaptionClearance(brand.caption_mode);
  const safeBottom = brand.caption_mode === 'none'
    ? brand.safe_area.bottom
    : Math.max(brand.safe_area.bottom, 220) + captionReserve;
  const maxAllowedBottom = dimensions.height - safeBottom;
  const availableHeight = maxAllowedBottom - brand.safe_area.top;
  const maxAllowedRight = dimensions.width - brand.safe_area.right;
  const availableWidth = maxAllowedRight - brand.safe_area.left;

  const containerRect = el.getBoundingClientRect();
  let maxChildBottom = containerRect.top;
  let maxChildRight = containerRect.left;

  const descendants = el.querySelectorAll('*');
  for (const node of descendants) {
    for (const childNode of node.childNodes) {
      if (childNode.nodeType === Node.TEXT_NODE && childNode.textContent?.trim()) {
        const range = document.createRange();
        range.selectNode(childNode);
        const rangeRect = range.getBoundingClientRect();
        if (rangeRect.right > maxAllowedRight) {
          const overflow = Math.round(rangeRect.right - maxAllowedRight);
          return `text content in <${node.tagName.toLowerCase()}> extends to ${Math.round(rangeRect.right)}px and exceeds safe boundary ${maxAllowedRight}px by ${overflow}px`;
        }
      }
    }
  }

  for (const node of descendants) {
    const elem = node as HTMLElement;
    if (overflowsItsBox({scrollWidth: elem.scrollWidth, clientWidth: elem.clientWidth, overflowX: getComputedStyle(elem).overflowX})) {
      const overflow = Math.round(elem.scrollWidth - elem.clientWidth);
      return `content width ${Math.round(elem.scrollWidth)}px in <${elem.tagName.toLowerCase()}> exceeds container width ${Math.round(elem.clientWidth)}px by ${overflow}px`;
    }
  }

  for (const child of el.children) {
    const r = child.getBoundingClientRect();
    if (r.bottom > maxChildBottom) maxChildBottom = r.bottom;
    if (r.right > maxChildRight) maxChildRight = r.right;
  }

  const measuredHeight = maxChildBottom - containerRect.top;
  const measuredWidth = maxChildRight - containerRect.left;

  if (maxChildBottom > maxAllowedBottom) {
    const overflow = Math.round(maxChildBottom - maxAllowedBottom);
    return `content height ${Math.round(measuredHeight)}px exceeds available safe height ${Math.round(availableHeight)}px by ${overflow}px (collides with caption reserve at bottom ${maxAllowedBottom}px)`;
  }

  if (maxChildRight > maxAllowedRight) {
    const overflow = Math.round(maxChildRight - maxAllowedRight);
    return `content width ${Math.round(measuredWidth)}px exceeds available safe width ${Math.round(availableWidth)}px by ${overflow}px`;
  }

  return null;
}

function loadFace(family: string, file: string) {
  return new FontFace(family, `url("${staticFile(file)}")`, {weight: '100 900'}).load();
}

function Explainer({timeline, brand, stills, font, fonts}: RenderProps) {
  const frame = useCurrentFrame();
  const [fontHandle] = useState(() => delayRender('Load pinned brand font and validate layout'));
  const palette = paletteFor(brand);
  const intensity = brand.motion ?? 'dynamic';
  const total = timeline.scenes.length;
  const current = Math.max(0, timeline.scenes.findIndex(scene => frame >= scene.startFrame && frame < scene.endFrame));

  useEffect(() => {
    let isCancelled = false;
    const faces = [loadFace('StudioBrand', font), ...(fonts ? [loadFace('StudioDisplay', fonts.display), loadFace('StudioMono', fonts.mono)] : [])];
    Promise.all(faces).then(async loaded => {
      if (isCancelled) return;
      for (const face of loaded) document.fonts.add(face);
      await document.fonts.ready;

      for (const scene of timeline.scenes) {
        const error = validateSceneLayout(scene, brand, {width: timeline.width, height: timeline.height});
        if (error) {
          cancelRender(new Error(`LAYOUT_OVERFLOW: Scene '${scene.scene_id}' (${scene.title}): ${error}`));
          return;
        }
      }

      continueRender(fontHandle);
    }).catch(err => {
      cancelRender(err instanceof Error ? err : new Error(String(err)));
    });

    return () => {
      isCancelled = true;
    };
  }, [font, fonts, fontHandle, brand, stills, timeline]);

  return (
    <AbsoluteFill style={{color: palette.foreground, fontFamily: 'StudioBrand', overflow: 'hidden'}}>
      <Backdrop palette={palette} intensity={intensity} width={timeline.width} height={timeline.height} sceneIndex={current}/>
      {timeline.scenes.map((scene, index) => {
        const frames = scene.endFrame - scene.startFrame;
        return (
          <Sequence key={scene.scene_id} from={scene.startFrame} durationInFrames={frames}>
            <SceneShell enter={transitionInto(timeline.scenes, index)} exit={index + 1 < total ? transitionInto(timeline.scenes, index + 1) : 'cut'} frames={frames}>
              <SceneClock scene={scene} words={timeline.words} intensity={intensity} lead={index === 0 ? FIRST_SCENE_LEAD : 0}>
                <SceneBackground scene={scene} stills={stills} palette={palette}/>
                <SafeArea brand={brand}>
                  <SceneLayout scene={scene} index={index} total={total} stills={stills} palette={palette}/>
                </SafeArea>
              </SceneClock>
            </SceneShell>
          </Sequence>
        );
      })}
      <TransitionLayer scenes={timeline.scenes} palette={palette} width={timeline.width} height={timeline.height}/>
      <MotionCaptions
        words={timeline.words.filter(word =>
          timeline.scenes.some(scene => frame >= scene.startFrame && frame < scene.endFrame && scene.narration_segment_ids.includes(word.segment_id))
        )}
        frame={frame}
        brand={brand}
        palette={palette}
        emphasis={timeline.scenes[current]?.emphasis ?? []}
      />
      {palette.look === 'paper' ? null : <FilmGrain width={timeline.width} height={timeline.height}/>}
      {palette.look === 'paper' ? null : <ProgressBar progress={frame / Math.max(1, timeline.durationInFrames - 1)} accent={brand.accent}/>}

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: timeline.width,
          height: timeline.height,
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      >
        {timeline.scenes.map((scene, index) => (
          <div
            key={scene.scene_id}
            id={`measure-scene-${scene.scene_id}`}
            style={{
              position: 'absolute',
              top: brand.safe_area.top,
              left: brand.safe_area.left,
              width: timeline.width - brand.safe_area.left - brand.safe_area.right,
              display: 'flex',
              flexDirection: 'column',
              gap: 36,
              boxSizing: 'border-box',
            }}
          >
            <SettledClock scene={scene} words={timeline.words} intensity={intensity}>
              <SceneLayout scene={scene} index={index} total={total} stills={stills} palette={palette}/>
            </SettledClock>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}

const defaults: RenderProps = {
  timeline: {schema_version: '1.0', job_id: 'unconfigured', rounding: 'nearest-half-up', fps: 30, width: 1080, height: 1920, durationInFrames: 30, scenes: [], words: []},
  brand: {schema_version: '1.0', brand_id: 'unconfigured', version: '1', background: '#111827', foreground: '#ffffff', accent: '#56e3c2', font_asset_id: 'font', caption_mode: 'word-highlight', safe_area: {top: 160, bottom: 280, left: 90, right: 90}},
  stills: {},
  font: 'unconfigured.woff2',
};

const isoDefaults: IsoProps = {width: 1080, height: 1920, fps: 30, durationInFrames: 30, plates: {}, shots: []};
const storyDefaults: StoryProps = {...isoDefaults, segments: [], overlays: [], fonts: {display: 'unconfigured.woff2', mono: 'unconfigured.woff2', caption: 'unconfigured.woff2'}};

function Root() {
  return (
    <>
    <Composition
      id="IsoStory"
      component={IsoStory}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={30}
      defaultProps={storyDefaults}
      calculateMetadata={({props}) => ({durationInFrames: props.durationInFrames, fps: props.fps, width: props.width, height: props.height})}
    />
    <Composition
      id="IsoHorror"
      component={IsoHorror}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={30}
      defaultProps={isoDefaults}
      calculateMetadata={({props}) => ({durationInFrames: props.durationInFrames, fps: props.fps, width: props.width, height: props.height})}
    />
    <Composition
      id="VideoStudio"
      component={Explainer}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={30}
      defaultProps={defaults}
      calculateMetadata={({props}) => ({
        durationInFrames: props.timeline.durationInFrames,
        fps: props.timeline.fps,
        width: props.timeline.width,
        height: props.timeline.height,
      })}
    />
    </>
  );
}

registerRoot(Root);
