import {useEffect, useState} from 'react';
import {AbsoluteFill, Sequence, cancelRender, continueRender, delayRender, staticFile, useCurrentFrame} from 'remotion';
import {plateToFrame} from '../projection.ts';
import {normalizeWord} from '../reveal.ts';
import type {StoryProps} from '../story.ts';
import {IsoShot} from './scene.tsx';
import {BroadcastChrome, CaptionBand, LightsOut, RuleCard, TitleCard, WindowShadows} from './overlays.tsx';

const layer: Record<StoryProps['overlays'][number]['kind'], number> = {'window-shadows': 0, 'lights-out': 0, 'broadcast': 1, 'title': 2, 'rule': 2, 'cut-to-black': 3};

function useStoryFonts(fonts: StoryProps['fonts']) {
  const [handle] = useState(() => delayRender('Load pinned story fonts'));
  useEffect(() => {
    const faces = [
      new FontFace('StoryDisplay', `url("${staticFile(fonts.display)}")`),
      new FontFace('StoryMono', `url("${staticFile(fonts.mono)}")`),
      new FontFace('StoryCaption', `url("${staticFile(fonts.caption)}")`, {weight: '800'}),
    ];
    Promise.all(faces.map(face => face.load()))
      .then(loaded => {
        for (const face of loaded) document.fonts.add(face);
        return document.fonts.ready;
      })
      .then(() => continueRender(handle))
      .catch(error => cancelRender(error instanceof Error ? error : new Error(String(error))));
  }, [fonts, handle]);
}

export function IsoStory(props: StoryProps) {
  const {shots, plates, segments, overlays, width, height, fps, fonts} = props;
  useStoryFonts(fonts);
  const frame = useCurrentFrame();
  const shotById = new Map(shots.map(s => [s.shot_id, s]));
  const ruleSegments = new Set(overlays.flatMap(o => (o.kind === 'rule' ? [o.segment_id] : [])));
  const broadcastIntro = new Set(overlays.flatMap(o => (o.kind === 'broadcast' && o.intro_segment_id ? [o.intro_segment_id] : [])));
  const captioned = segments.filter(s => !ruleSegments.has(s.segment_id) && !broadcastIntro.has(s.segment_id));
  const shotEnd = (id: string) => {
    const shot = shotById.get(id)!;
    return shot.startFrame + shot.durationInFrames;
  };
  const shotAt = (id: string, fraction: number) => {
    const shot = shotById.get(id)!;
    return shot.startFrame + Math.round(fraction * shot.durationInFrames);
  };
  const ruleEnd = (segmentId: string) => {
    const segment = segments.find(s => s.segment_id === segmentId)!;
    const owner = shots.find(s => segment.startFrame >= s.startFrame && segment.startFrame < s.startFrame + s.durationInFrames);
    return owner ? owner.startFrame + owner.durationInFrames : segment.endFrame + 15;
  };

  return (
    <AbsoluteFill style={{background: '#000'}}>
      {shots.map(shot => {
        const shadows = overlays.filter(o => o.kind === 'window-shadows' && o.shot_id === shot.shot_id);
        return (
          <Sequence key={shot.shot_id} from={shot.startFrame} durationInFrames={shot.durationInFrames}>
            <IsoShot
              shot={shot}
              plate={plates[shot.plate_id]!}
              width={width}
              height={height}
              fps={fps}
              world={shadows.length === 0 ? undefined : (fit, local) => shadows.map((o, i) => {
                if (o.kind !== 'window-shadows') return null;
                const [left, top] = plateToFrame(fit, o.region.x, o.region.y);
                return <WindowShadows key={i} left={left} top={top} width={o.region.w * fit.width} height={o.region.h * fit.height} frame={local} count={o.count} seed={`${shot.shot_id}-${i}`}/>;
              })}
            />
          </Sequence>
        );
      })}
      {[...overlays].sort((a, b) => layer[a.kind] - layer[b.kind]).map((overlay, i) => {
        switch (overlay.kind) {
          case 'title':
            return <TitleCard key={i} lines={overlay.lines} frame={frame} startFrame={shotAt(overlay.shot_id, overlay.from)} endFrame={shotAt(overlay.shot_id, overlay.to)}/>;
          case 'broadcast':
            return <BroadcastChrome key={i} label={overlay.label} frame={frame} startFrame={shotAt(overlay.shot_id, overlay.from)} endFrame={shotEnd(overlay.until_shot_id)} intro={segments.find(s => s.segment_id === overlay.intro_segment_id) ?? null}/>;
          case 'rule': {
            const segment = segments.find(s => s.segment_id === overlay.segment_id)!;
            return <RuleCard key={i} number={overlay.number} text={overlay.text} segment={segment} frame={frame} endFrame={ruleEnd(overlay.segment_id)}/>;
          }
          case 'lights-out': {
            const segment = segments.find(s => s.segment_id === overlay.segment_id)!;
            const word = segment.words.find(w => normalizeWord(w.text) === normalizeWord(overlay.word));
            const at = word ? word.endFrame : segment.endFrame;
            return frame < shotEnd(overlay.shot_id) ? <LightsOut key={i} frame={frame} at={at}/> : null;
          }
          case 'cut-to-black':
            return frame >= shotAt(overlay.shot_id, overlay.from) && frame < shotEnd(overlay.shot_id) ? <AbsoluteFill key={i} style={{background: '#000'}}/> : null;
          default:
            return null;
        }
      })}
      <CaptionBand segments={captioned} frame={frame}/>
    </AbsoluteFill>
  );
}
