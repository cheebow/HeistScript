import type { Position, WorldState } from '../model/types';
import { directionFromTo, isStaticPassable, occupiedTiles, posKey, type MoverKind } from './grid';

export interface Mover {
  id: string;
  x: number;
  y: number;
  direction: WorldState['thieves'][number]['direction'];
}

export type StepResult = 'moved' | 'blocked' | 'impassable' | 'none';

/**
 * 経路の先頭タイルへ1歩進もうとする。占有されていれば blocked。
 * 成功時は位置・向きを更新し、path の先頭を取り除く。
 */
export function tryStep(world: WorldState, mover: Mover, path: Position[], kind: MoverKind = 'thief'): StepResult {
  const next = path[0];
  if (!next) return 'none';
  if (!isStaticPassable(world, next, kind)) return 'impassable';
  const occupied = occupiedTiles(world, mover.id);
  if (occupied.has(posKey(next))) return 'blocked';
  const dir = directionFromTo(mover, next);
  if (dir) mover.direction = dir;
  mover.x = next.x;
  mover.y = next.y;
  path.shift();
  return 'moved';
}
