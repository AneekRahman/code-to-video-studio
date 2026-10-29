/** Deterministic pseudo-random height for a context bar, so a re-render never reshuffles the field. */
export function contextHeight(col: number, row: number): number {
  const x = Math.sin(col * 12.9898 + row * 78.233) * 43758.5453;
  return 22 + (x - Math.floor(x)) * 78;
}
