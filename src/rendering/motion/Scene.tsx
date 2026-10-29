import type {CompiledScene} from '../../contracts.ts';
import type {Palette} from './theme.ts';
import {Kicker, SplitTitle, StillBackground, StillPanel} from './Title.tsx';
import {BarChart, CheckRows, PointRows, QuoteBlock, StatBlock, StepsRail, VersusRows} from './Treatments.tsx';
import {CodeWindow} from './Code.tsx';
import {ChipGrid, Gauge} from './Showpieces.tsx';
import {BarField, OrbitHero} from './Showpieces3D.tsx';
import {LogoStage} from './Logos3D.tsx';

const compactStill = new Set<CompiledScene['treatment']>(['code', 'chart', 'steps', 'grid', 'gauge', 'orbit']);

function Body({scene, palette}: {scene: CompiledScene; palette: Palette}) {
  switch (scene.treatment) {
    case 'comparison': return <VersusRows lines={scene.lines} palette={palette}/>;
    case 'checklist': return <CheckRows lines={scene.lines} palette={palette}/>;
    case 'stat': return <StatBlock value={scene.value ?? 0} suffix={scene.suffix ?? ''} lines={scene.lines} palette={palette}/>;
    case 'quote': return <QuoteBlock lines={scene.lines} palette={palette}/>;
    case 'steps': return <StepsRail lines={scene.lines} palette={palette}/>;
    case 'logos': return <div style={{display: 'flex', flexDirection: 'column', gap: 24}}><LogoStage platforms={scene.logos ?? ['youtube', 'instagram']} palette={palette}/>{scene.lines.length > 0 ? <PointRows lines={scene.lines} palette={palette}/> : null}</div>;
    case 'orbit': return <OrbitHero count={scene.value ?? 3} label={scene.suffix ?? ''} palette={palette}/>;
    case 'grid': return <ChipGrid count={scene.value ?? 1} label={scene.suffix ?? ''} lines={scene.lines} palette={palette}/>;
    case 'gauge': return <Gauge value={scene.value ?? 0} label={scene.suffix ?? ''} verdict={scene.lines[0]} palette={palette}/>;
    case 'chart': return scene.chart_style === 'iso' ? <BarField data={scene.data ?? []} unit={scene.unit ?? ''} palette={palette}/> : <BarChart data={scene.data ?? []} unit={scene.unit ?? ''} palette={palette}/>;
    case 'code': return scene.code ? <CodeWindow language={scene.code.language} text={scene.code.text} highlight={scene.code.highlight ?? []} palette={palette}/> : null;
    case 'headline': return scene.lines.length > 0 ? <PointRows lines={scene.lines} palette={palette}/> : null;
  }
}

export function SceneBackground({scene, stills, palette}: {scene: CompiledScene; stills: Record<string, string>; palette: Palette}) {
  const src = scene.still_asset_id ? stills[scene.still_asset_id] : undefined;
  if (!src || scene.still_layout !== 'full') return null;
  return <StillBackground src={src} palette={palette} motion={scene.still_motion ?? 'push-in'}/>;
}

/** The flowing content of one scene, in the order it is read: chapter rail, title, still, treatment. */
export function SceneLayout({scene, index, total, stills, palette}: {scene: CompiledScene; index: number; total: number; stills: Record<string, string>; palette: Palette}) {
  const src = scene.still_asset_id ? stills[scene.still_asset_id] : undefined;
  return (
    <>
      <Kicker text={scene.kicker} index={index} total={total} palette={palette}/>
      <SplitTitle text={scene.title} palette={palette} compact={scene.treatment === 'quote'}/>
      {src && scene.still_layout !== 'full' ? <StillPanel src={src} palette={palette} motion={scene.still_motion ?? 'push-in'} height={compactStill.has(scene.treatment) ? 340 : 440}/> : null}
      <div style={{flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: scene.still_layout === 'full' && src ? 'flex-end' : 'center'}}>
        <Body scene={scene} palette={palette}/>
      </div>
    </>
  );
}
