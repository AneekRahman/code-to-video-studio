export const glyphKinds = ['doc', 'image', 'scissors', 'search', 'calendar', 'chart', 'phone', 'list', 'check', 'play', 'bolt', 'chat'] as const;
export type GlyphKind = (typeof glyphKinds)[number];

/** Flat ink icons on a 256-px block face; plain strokes so they stay crisp under texture filtering. */
export function drawGlyph(ctx: CanvasRenderingContext2D, kind: GlyphKind): void {
  ctx.save();
  ctx.strokeStyle = '#141414';
  ctx.fillStyle = '#141414';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  switch (kind) {
    case 'doc':
      ctx.strokeRect(84, 56, 88, 144);
      line(104, 100, 152, 100);
      line(104, 130, 152, 130);
      line(104, 160, 140, 160);
      break;
    case 'image':
      ctx.strokeRect(58, 70, 140, 116);
      ctx.beginPath();
      ctx.moveTo(70, 176);
      ctx.lineTo(112, 120);
      ctx.lineTo(146, 156);
      ctx.lineTo(164, 136);
      ctx.lineTo(190, 176);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(160, 102, 10, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'scissors':
      ctx.beginPath();
      ctx.arc(92, 170, 20, 0, Math.PI * 2);
      ctx.arc(92, 90, 20, 0, Math.PI * 2);
      ctx.stroke();
      line(108, 156, 186, 74);
      line(108, 104, 186, 186);
      break;
    case 'search':
      ctx.beginPath();
      ctx.arc(116, 114, 46, 0, Math.PI * 2);
      ctx.stroke();
      line(150, 150, 190, 190);
      break;
    case 'calendar':
      ctx.strokeRect(62, 78, 132, 116);
      line(62, 112, 194, 112);
      line(94, 62, 94, 92);
      line(162, 62, 162, 92);
      ctx.fillRect(86, 138, 22, 22);
      ctx.fillRect(122, 138, 22, 22);
      break;
    case 'chart':
      line(72, 60, 72, 186);
      line(72, 186, 190, 186);
      ctx.beginPath();
      ctx.moveTo(86, 150);
      ctx.lineTo(118, 112);
      ctx.lineTo(146, 130);
      ctx.lineTo(184, 80);
      ctx.stroke();
      break;
    case 'phone':
      ctx.strokeRect(88, 52, 80, 152);
      line(116, 182, 140, 182);
      break;
    case 'list':
      for (const y of [84, 128, 172]) {
        ctx.fillRect(66, y - 7, 14, 14);
        line(100, y, 192, y);
      }
      break;
    case 'check':
      ctx.strokeRect(70, 62, 116, 132);
      ctx.beginPath();
      ctx.moveTo(98, 130);
      ctx.lineTo(120, 154);
      ctx.lineTo(160, 104);
      ctx.stroke();
      break;
    case 'play':
      ctx.beginPath();
      ctx.moveTo(94, 66);
      ctx.lineTo(94, 190);
      ctx.lineTo(194, 128);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'bolt':
      ctx.beginPath();
      ctx.moveTo(140, 56);
      ctx.lineTo(94, 138);
      ctx.lineTo(126, 138);
      ctx.lineTo(112, 202);
      ctx.lineTo(166, 114);
      ctx.lineTo(132, 114);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'chat':
      ctx.strokeRect(62, 70, 132, 92);
      ctx.beginPath();
      ctx.moveTo(96, 162);
      ctx.lineTo(96, 196);
      ctx.lineTo(128, 162);
      ctx.stroke();
      break;
  }
  ctx.restore();
}
