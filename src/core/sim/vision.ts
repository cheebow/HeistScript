import { DIRECTION_VECTORS, type Direction, type Position, type WorldState } from '../model/types';
import { blocksSight, euclid, samePos, tileAt } from './grid';

/**
 * supercover 格子レイ: from から to までに通過するタイル（from, to を含む）を返す。
 * 角を通るときは両側のタイルを含める（厳密に遮蔽判定するため）。
 */
export function supercoverLine(from: Position, to: Position): Position[] {
  const result: Position[] = [];
  let x = from.x;
  let y = from.y;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const nx = Math.abs(dx);
  const ny = Math.abs(dy);
  const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  result.push({ x, y });
  let ix = 0;
  let iy = 0;
  while (ix < nx || iy < ny) {
    const decision = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (decision === 0) {
      // 角を正確に通過: 両隣も含める
      result.push({ x: x + sx, y });
      result.push({ x, y: y + sy });
      x += sx;
      y += sy;
      ix++;
      iy++;
    } else if (decision < 0) {
      x += sx;
      ix++;
    } else {
      y += sy;
      iy++;
    }
    result.push({ x, y });
  }
  return result;
}

/** from と to の間（両端を除く）に視線を遮るタイルがないか */
export function hasLineOfSight(world: WorldState, from: Position, to: Position): boolean {
  const line = supercoverLine(from, to);
  for (const p of line) {
    if (samePos(p, from) || samePos(p, to)) continue;
    if (blocksSight(world, p)) return false;
  }
  return true;
}

/** 向き dir を中心とした 90 度の円錐内か（境界の対角線は含む）。自タイルは含まない。 */
export function inCone(origin: Position, dir: Direction, target: Position): boolean {
  const v = DIRECTION_VECTORS[dir];
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const forward = dx * v.dx + dy * v.dy;
  const lateral = Math.abs(dx * v.dy - dy * v.dx);
  return forward > 0 && forward >= lateral;
}

export interface Viewer {
  x: number;
  y: number;
  direction: Direction;
  range: number;
}

/** 視認判定: 円錐内・射程内・視線が通る。同一タイル（気絶から目覚めた警備員の上に怪盗がいる等）は常に見える。 */
export function canSee(world: WorldState, viewer: Viewer, target: Position): boolean {
  if (viewer.x === target.x && viewer.y === target.y) return true;
  if (tileAt(world, target) === 'vent') return false; // 通風口の中は外から見えない
  if (!inCone(viewer, viewer.direction, target)) return false;
  if (euclid(viewer, target) > viewer.range + 1e-9) return false;
  return hasLineOfSight(world, viewer, target);
}

/** 視界に含まれるタイル一覧（描画用）。 */
export function visibleTiles(world: WorldState, viewer: Viewer): Position[] {
  const out: Position[] = [];
  const r = Math.ceil(viewer.range);
  for (let y = viewer.y - r; y <= viewer.y + r; y++) {
    for (let x = viewer.x - r; x <= viewer.x + r; x++) {
      if (x < 0 || y < 0 || x >= world.width || y >= world.height) continue;
      const p = { x, y };
      if (canSee(world, viewer, p)) out.push(p);
    }
  }
  return out;
}
