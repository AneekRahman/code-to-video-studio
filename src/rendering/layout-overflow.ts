const TOLERANCE_PX = 12;

/** A box that clips its own overflow holds wider content on purpose, such as a slowly zooming still, so only an unclipped box can overflow. */
export function overflowsItsBox(box: {scrollWidth: number; clientWidth: number; overflowX: string}): boolean {
  if (box.overflowX === 'hidden' || box.overflowX === 'clip') return false;
  return box.scrollWidth > box.clientWidth + TOLERANCE_PX;
}
