export type Rgb = [number, number, number];
export type Swatch = {hex: string; share: number};

export const toHex = ([r, g, b]: Rgb): string => `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
export const fromHex = (hex: string): Rgb => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

export function rgbToLab([r, g, b]: Rgb): [number, number, number] {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)] as [number, number, number];
  const x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047;
  const y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
  const z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIE76 colour difference: about 2.3 is just noticeable, 10 is clearly different, 50 is a different colour. */
export function deltaE(a: Rgb, b: Rgb): number {
  const [l1, a1, b1] = rgbToLab(a);
  const [l2, a2, b2] = rgbToLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Deterministic k-means over pixels: seeds are the most common coarse colours, so the same pixels always give the same palette. */
export function dominantColors(pixels: Rgb[], k = 6, mergeBelow = 12): Swatch[] {
  if (pixels.length === 0) return [];
  const buckets = new Map<number, {count: number; sum: Rgb}>();
  for (const p of pixels) {
    const key = ((p[0] >> 4) << 8) | ((p[1] >> 4) << 4) | (p[2] >> 4);
    const bucket = buckets.get(key) ?? {count: 0, sum: [0, 0, 0] as Rgb};
    bucket.count++;
    bucket.sum = [bucket.sum[0] + p[0], bucket.sum[1] + p[1], bucket.sum[2] + p[2]];
    buckets.set(key, bucket);
  }
  const seeds: Rgb[] = [];
  for (const bucket of [...buckets.entries()].sort((a, b) => b[1].count - a[1].count || a[0] - b[0]).map(entry => entry[1])) {
    const center: Rgb = [bucket.sum[0] / bucket.count, bucket.sum[1] / bucket.count, bucket.sum[2] / bucket.count];
    if (seeds.every(seed => deltaE(seed, center) >= mergeBelow)) seeds.push(center);
    if (seeds.length === k) break;
  }
  let centers = seeds;
  let counts: number[] = [];
  for (let iteration = 0; iteration < 10; iteration++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const p of pixels) {
      let best = 0;
      let bestDistance = Infinity;
      for (const [i, c] of centers.entries()) {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bestDistance) {
          bestDistance = d;
          best = i;
        }
      }
      const s = sums[best]!;
      s[0]! += p[0];
      s[1]! += p[1];
      s[2]! += p[2];
      s[3]! += 1;
    }
    counts = sums.map(s => s[3]!);
    centers = centers.map((c, i) => (counts[i]! > 0 ? [sums[i]![0]! / counts[i]!, sums[i]![1]! / counts[i]!, sums[i]![2]! / counts[i]!] as Rgb : c));
  }
  return centers.map((c, i) => ({hex: toHex(c), share: counts[i]! / pixels.length})).filter(s => s.share > 0).sort((a, b) => b.share - a.share).map(s => ({...s, share: Number(s.share.toFixed(4))}));
}

/** Cut times from a per-frame scene-change score: a cut is a local maximum at or above the threshold; cuts closer than `gap` merge into the first. */
export function cutsFromScores(scores: {time: number; score: number}[], threshold = 0.3, gap = 0.25): {time: number; score: number}[] {
  const peaks: {time: number; score: number}[] = [];
  for (const [i, s] of scores.entries()) {
    if (s.score < threshold) continue;
    const near = scores.filter((o, j) => j !== i && Math.abs(o.time - s.time) <= 0.15);
    if (near.every(o => o.score <= s.score)) peaks.push({time: Number(s.time.toFixed(3)), score: Number(s.score.toFixed(3))});
  }
  const merged: {time: number; score: number}[] = [];
  for (const peak of peaks) {
    const last = merged.at(-1);
    if (last && peak.time - last.time < gap) {
      if (peak.score > last.score) merged[merged.length - 1] = peak;
    } else merged.push(peak);
  }
  return merged;
}

export function resample(values: number[], points: number): number[] {
  if (values.length === 0) return Array.from({length: points}, () => 0);
  return Array.from({length: points}, (_, i) => {
    const position = (i / Math.max(1, points - 1)) * (values.length - 1);
    const lower = Math.floor(position);
    const upper = Math.min(values.length - 1, lower + 1);
    return values[lower]! + (values[upper]! - values[lower]!) * (position - lower);
  });
}

export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const meanA = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const meanB = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i]! - meanA) * (b[i]! - meanB);
    varA += (a[i]! - meanA) ** 2;
    varB += (b[i]! - meanB) ** 2;
  }
  return varA === 0 || varB === 0 ? 0 : cov / Math.sqrt(varA * varB);
}

export const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** Weighted distance from each reference swatch to the closest sample swatch: 0 when the sample uses the reference's colours in kind. */
export function paletteDistance(reference: Swatch[], sample: Swatch[]): number {
  if (reference.length === 0 || sample.length === 0) return Infinity;
  const total = reference.reduce((s, r) => s + r.share, 0) || 1;
  return reference.reduce((sum, r) => sum + (r.share / total) * Math.min(...sample.map(s => deltaE(fromHex(r.hex), fromHex(s.hex)))), 0);
}

/**
 * A video's own activity decides what counts as a cut: graphics animating inside a persistent frame change far less per frame than live
 * footage cutting between shots, so a fixed threshold either misses every beat or fires on every flicker.
 */
export function autoCutThreshold(scores: number[]): number {
  if (scores.length === 0) return 0.3;
  const sorted = [...scores].sort((a, b) => a - b);
  const p90 = sorted[Math.floor(sorted.length * 0.9)]!;
  return Number(Math.min(0.3, Math.max(0.02, p90 * 1.5)).toFixed(3));
}
