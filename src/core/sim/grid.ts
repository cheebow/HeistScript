import {
  DIRECTION_ORDER,
  DIRECTION_VECTORS,
  type Direction,
  type Position,
  type WorldState,
} from '../model/types';

export function posKey(p: Position): string {
  return `${p.x},${p.y}`;
}

export function samePos(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

export function manhattan(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function euclid(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function inBounds(world: Pick<WorldState, 'width' | 'height'>, p: Position): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < world.width && p.y < world.height;
}

export function tileAt(world: WorldState, p: Position) {
  const row = world.tiles[p.y];
  return row ? row[p.x] : undefined;
}

export function doorAt(world: WorldState, p: Position) {
  return world.objects.find((o) => o.type === 'door' && o.x === p.x && o.y === p.y);
}

export type MoverKind = 'thief' | 'guard';

/** 静的に通行可能か（壁・閉扉のみ考慮。動的エンティティは考慮しない）。通風口は怪盗だけが通れる */
export function isStaticPassable(world: WorldState, p: Position, mover: MoverKind = 'thief'): boolean {
  if (!inBounds(world, p)) return false;
  const t = tileAt(world, p);
  if (t === undefined || t === 'wall') return false;
  if (t === 'vent' && mover === 'guard') return false;
  const door = doorAt(world, p);
  if (door && !door.open) return false;
  return true;
}

/** 経路計画用: 周期／スイッチで開閉する扉は「いずれ開く」ものとして通行可とみなす */
export function isPlannable(world: WorldState, p: Position, mover: MoverKind = 'thief'): boolean {
  if (isStaticPassable(world, p, mover)) return true;
  if (!inBounds(world, p)) return false;
  const t = tileAt(world, p);
  if (t === undefined || t === 'wall') return false;
  if (t === 'vent' && mover === 'guard') return false;
  const door = doorAt(world, p);
  if (door && !door.open && (door.cycle || world.objects.some((o) => o.type === 'switch' && o.targetDoorId === door.id))) return true;
  return false;
}

/** 視線を遮るか（壁・閉扉・通風口） */
export function blocksSight(world: WorldState, p: Position): boolean {
  if (!inBounds(world, p)) return true;
  const t = tileAt(world, p);
  if (t === undefined || t === 'wall' || t === 'vent') return true;
  const door = doorAt(world, p);
  if (door && !door.open) return true;
  return false;
}

/** 隠れられるタイルか (H タイル または locker オブジェクト) */
export function isHidingSpot(world: WorldState, p: Position): boolean {
  if (tileAt(world, p) === 'hiding_spot') return true;
  return world.objects.some((o) => o.type === 'locker' && o.x === p.x && o.y === p.y);
}

export function stepInDirection(p: Position, d: Direction, n = 1): Position {
  const v = DIRECTION_VECTORS[d];
  return { x: p.x + v.dx * n, y: p.y + v.dy * n };
}

export function directionFromTo(from: Position, to: Position): Direction | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

export function oppositeDirection(d: Direction): Direction {
  switch (d) {
    case 'up':
      return 'down';
    case 'down':
      return 'up';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
  }
}

export function rotateClockwise(d: Direction): Direction {
  const i = DIRECTION_ORDER.indexOf(d);
  return DIRECTION_ORDER[(i + 1) % 4]!;
}

/** 固定順序 [up,right,down,left] の隣接タイル */
export function neighbors(p: Position): Position[] {
  return DIRECTION_ORDER.map((d) => stepInDirection(p, d));
}

/**
 * 動的占有されているタイルの集合（warning: 気絶した警備員・運搬中の警備員は占有しない。
 * 出口タイルは複数怪盗の共有を許す）。
 */
export function occupiedTiles(world: WorldState, excludeId: string | null): Set<string> {
  const set = new Set<string>();
  for (const g of world.guards) {
    if (g.id === excludeId) continue;
    if (g.state === 'UNCONSCIOUS' || g.carriedBy) continue;
    set.add(posKey(g));
  }
  for (const t of world.thieves) {
    if (t.id === excludeId) continue;
    if (t.captured) continue;
    // 出口タイルは複数の怪盗が共有できる (SPEC 3)
    if (samePos(t, world.exit)) continue;
    set.add(posKey(t));
  }
  return set;
}

export function isExitTile(world: WorldState, p: Position): boolean {
  return samePos(world.exit, p);
}
