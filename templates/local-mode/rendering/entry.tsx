import {AbsoluteFill, Composition, interpolate, registerRoot, useCurrentFrame} from 'remotion';
import {HookHeadline} from '../../../src/rendering/mode-api.tsx';

type Card = {title: string; subtitle: string; background: string; accent: string};
type Props = {card: Card; durationInFrames: number; fps: number};

function TitleCard({card}: Props) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: card.background, color: '#ffffff', opacity}}>
      <HookHeadline text={card.title} accent={card.accent}/>
      <div style={{position: 'absolute', bottom: 420, width: '100%', textAlign: 'center', fontSize: 54, fontFamily: 'sans-serif'}}>{card.subtitle}</div>
    </AbsoluteFill>
  );
}

const defaults: Props = {card: {title: 'Title', subtitle: '', background: '#000000', accent: '#ffffff'}, durationInFrames: 30, fps: 30};

registerRoot(() => (
  <Composition
    id="ExampleTitleCard"
    component={TitleCard}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={30}
    defaultProps={defaults}
    calculateMetadata={({props}) => ({durationInFrames: props.durationInFrames, fps: props.fps})}
  />
));
