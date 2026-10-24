import {useEffect, useState} from 'react';
import {AbsoluteFill, Composition, Sequence, cancelRender, continueRender, delayRender, registerRoot, staticFile, useCurrentFrame} from 'remotion';
import type {RenderProps, CompiledScene, Brand} from '../contracts.ts';
import {getCaptionClearance} from '../captions.ts';
import {
  CaptionTrack,
  ChecklistCard,
  ComparisonCard,
  HookHeadline,
  ImagePanel,
  NarrativeCard,
  ProgressBar,
  SafeArea,
  SceneNumber,
  StatCounter,
  StatSteps,
} from './components.tsx';

export function SceneContent({scene, stills, accent}: {scene: CompiledScene; stills: Record<string, string>; accent: string}) {
  const hasStill = scene.still_asset_id && stills[scene.still_asset_id];
  return (
    <>
      <HookHeadline text={scene.title} accent={accent}/>
      {hasStill ? <ImagePanel src={stills[scene.still_asset_id!]!}/> : null}
      {scene.treatment === 'stat' ? (
        <>
          <StatCounter value={scene.value ?? 0} suffix={scene.suffix ?? ''} accent={accent}/>
          {scene.lines.length > 0 ? <StatSteps lines={scene.lines} accent={accent}/> : null}
        </>
      ) : null}
      {scene.treatment === 'checklist' ? (
        <ChecklistCard lines={scene.lines} accent={accent}/>
      ) : null}
      {scene.treatment === 'comparison' ? (
        <ComparisonCard lines={scene.lines} accent={accent}/>
      ) : null}
      {scene.treatment === 'headline' ? (
        <NarrativeCard lines={scene.lines} accent={accent}/>
      ) : null}
    </>
  );
}

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
    if (elem.scrollWidth > elem.clientWidth + 12) {
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

function Explainer({timeline, brand, stills, font}: RenderProps) {
  const frame = useCurrentFrame();
  const [fontHandle] = useState(() => delayRender('Load pinned brand font and validate layout'));

  useEffect(() => {
    let isCancelled = false;
    const face = new FontFace('StudioBrand', `url("${staticFile(font)}")`);
    face.load().then(async loaded => {
      if (isCancelled) return;
      document.fonts.add(loaded);
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
  }, [font, fontHandle, brand, stills, timeline]);

  return (
    <AbsoluteFill style={{background: brand.background, color: brand.foreground, fontFamily: 'StudioBrand', overflow: 'hidden'}}>
      <div style={{position: 'absolute', width: 1000, height: 1000, left: 480, top: -500, borderRadius: 500, border: `90px solid ${brand.accent}`, opacity: 0.06}}/>
      {timeline.scenes.map((scene, index) => (
        <Sequence key={scene.scene_id} from={scene.startFrame} durationInFrames={scene.endFrame - scene.startFrame}>
          <SafeArea brand={brand}>
            <SceneNumber index={index} total={timeline.scenes.length} accent={brand.accent}/>
            <SceneContent scene={scene} stills={stills} accent={brand.accent}/>
          </SafeArea>
        </Sequence>
      ))}
      <CaptionTrack
        words={timeline.words.filter(word =>
          timeline.scenes.some(scene => frame >= scene.startFrame && frame < scene.endFrame && scene.narration_segment_ids.includes(word.segment_id))
        )}
        frame={frame}
        brand={brand}
      />
      <ProgressBar progress={frame / Math.max(1, timeline.durationInFrames - 1)} accent={brand.accent}/>

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
        {timeline.scenes.map(scene => (
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
            <SceneNumber index={0} total={timeline.scenes.length} accent={brand.accent}/>
            <SceneContent scene={scene} stills={stills} accent={brand.accent}/>
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

function Root() {
  return (
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
  );
}

registerRoot(Root);
