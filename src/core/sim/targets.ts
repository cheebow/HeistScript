import type { Position, Thief, WorldState } from '../model/types';
import { findPath } from './astar';
import { isGuardActive } from './context';
import { isPlannable, isStaticPassable, neighbors, occupiedTiles, posKey, samePos } from './grid';

export type ResolvedTarget =
  | { ok: true; goal: Position; dynamic: boolean }
  | { ok: false; message: string };

/**
 * move の対象IDを到達目標タイルへ解決する。
 * - ウェイポイント / 宝物 / 扉 / ロッカー / exit: そのタイル
 * - 怪盗 / 警備員（動的）: 対象に隣接する到達可能なタイルのうち最短経路のもの（同長は [up,right,down,left] 順）
 */
/** "x,y" 形式の座標なら Position にする */
export function parseCoordinate(id: string): Position | null {
  const m = /^(\d+),(\d+)$/.exec(id);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

export function resolveMoveTarget(world: WorldState, thief: Thief, targetId: string): ResolvedTarget {
  const coord = parseCoordinate(targetId);
  if (coord) {
    if (!isStaticPassable(world, coord) && !isPlannable(world, coord)) return { ok: false, message: `(${coord.x},${coord.y}) は通れないマスです` };
    return { ok: true, goal: coord, dynamic: false };
  }
  const wp = world.waypoints[targetId];
  if (wp) return { ok: true, goal: { x: wp.x, y: wp.y }, dynamic: false };
  const obj = world.objects.find((o) => o.id === targetId);
  if (obj) {
    if (obj.type === 'treasure' && obj.takenBy !== null) {
      return { ok: false, message: `'${targetId}' はすでに取得済みで、マップ上にありません` };
    }
    return { ok: true, goal: { x: obj.x, y: obj.y }, dynamic: false };
  }
  const entity =
    world.guards.find((g) => g.id === targetId) ?? world.thieves.find((t) => t.id === targetId);
  if (entity) {
    if (entity.id === thief.id) return { ok: false, message: '自分自身へは移動できません' };
    if ('carriedBy' in entity && entity.carriedBy !== null) {
      return { ok: false, message: `'${targetId}' は運搬中のため移動先にできません` };
    }
    const occupied = occupiedTiles(world, thief.id);
    // 対象自身のタイルは侵入不可
    occupied.add(posKey(entity));
    let best: { goal: Position; len: number } | null = null;
    for (const nb of neighbors(entity)) {
      if (!isStaticPassable(world, nb)) continue;
      if (samePos(nb, thief)) {
        best = { goal: nb, len: 0 };
        break;
      }
      if (occupied.has(posKey(nb))) continue;
      const path = findPath(world, thief, nb, { blocked: occupied });
      if (path === null) continue;
      if (best === null || path.length < best.len) best = { goal: nb, len: path.length };
    }
    if (best === null) return { ok: false, message: `'${targetId}' の隣へ到達できる経路がありません` };
    return { ok: true, goal: best.goal, dynamic: true };
  }
  return { ok: false, message: `'${targetId}' はこのステージに存在しません` };
}

/** 対象が隣接（マンハッタン距離1）または同一タイルか */
export function isAdjacentOrSame(a: Position, b: Position): boolean {
  const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  return d <= 1;
}

export function isAdjacent(a: Position, b: Position): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

export { isGuardActive };
