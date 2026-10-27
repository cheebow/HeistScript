import type { Position, WorldState } from '../model/types';
import { isStaticPassable, neighbors, posKey, samePos } from './grid';

export interface PathOptions {
  /** 追加で通行不可とみなすタイル（動的占有） */
  blocked?: Set<string>;
  /** 目標タイルが blocked に含まれていても許可する */
  allowBlockedGoal?: boolean;
}

interface Node {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: Node | null;
}

/**
 * 決定的 A*。同スコアの比較は f → h → y → x の順で安定化し、隣接探索は [up,right,down,left] 固定。
 * 戻り値は start を含まず goal で終わる経路。start === goal の場合は空配列。到達不能なら null。
 */
export function findPath(
  world: WorldState,
  start: Position,
  goal: Position,
  options: PathOptions = {},
): Position[] | null {
  if (samePos(start, goal)) return [];
  if (!isStaticPassable(world, goal)) return null;
  const blocked = options.blocked;
  if (blocked && blocked.has(posKey(goal)) && !options.allowBlockedGoal) return null;

  const h = (p: Position) => Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y);
  const open: Node[] = [];
  const bestG = new Map<string, number>();
  const closed = new Set<string>();
  const startNode: Node = { x: start.x, y: start.y, g: 0, h: h(start), f: h(start), parent: null };
  open.push(startNode);
  bestG.set(posKey(start), 0);

  const better = (a: Node, b: Node): boolean => {
    if (a.f !== b.f) return a.f < b.f;
    if (a.h !== b.h) return a.h < b.h;
    if (a.y !== b.y) return a.y < b.y;
    return a.x < b.x;
  };

  while (open.length > 0) {
    // 線形探索で最良ノードを選ぶ（マップは小さいので十分、順序の安定性を優先）
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      if (better(open[i]!, open[bi]!)) bi = i;
    }
    const current = open.splice(bi, 1)[0]!;
    const ck = posKey(current);
    if (closed.has(ck)) continue;
    closed.add(ck);

    if (current.x === goal.x && current.y === goal.y) {
      const path: Position[] = [];
      let n: Node | null = current;
      while (n && n.parent) {
        path.push({ x: n.x, y: n.y });
        n = n.parent;
      }
      path.reverse();
      return path;
    }

    for (const nb of neighbors(current)) {
      const key = posKey(nb);
      if (closed.has(key)) continue;
      if (!isStaticPassable(world, nb)) continue;
      const isGoal = nb.x === goal.x && nb.y === goal.y;
      if (blocked && blocked.has(key) && !(isGoal && options.allowBlockedGoal)) continue;
      const g = current.g + 1;
      const prev = bestG.get(key);
      if (prev !== undefined && prev <= g) continue;
      bestG.set(key, g);
      const hh = h(nb);
      open.push({ x: nb.x, y: nb.y, g, h: hh, f: g + hh, parent: current });
    }
  }
  return null;
}

/** 経路長（到達不能なら Infinity） */
export function pathLength(world: WorldState, start: Position, goal: Position, options?: PathOptions): number {
  const p = findPath(world, start, goal, options);
  return p === null ? Infinity : p.length;
}
