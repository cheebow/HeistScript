import type { Guard, Position, WorldState } from '../model/types';
import { findPath } from './astar';
import { isGuardActive, log, type SimContext } from './context';
import { directionFromTo, manhattan, occupiedTiles, posKey, rotateClockwise, samePos } from './grid';
import { tryStep } from './movement';

function setPathTo(world: WorldState, g: Guard, goal: Position, allowOccupiedGoal: boolean): void {
  if (g.path.length > 0 && samePos(g.path[g.path.length - 1]!, goal)) return;
  const path = findPath(world, g, goal, { blocked: undefined, allowBlockedGoal: allowOccupiedGoal });
  g.path = path ?? [];
}

function enterSearch(world: WorldState, g: Guard, at: Position, ctx: SimContext): void {
  g.state = 'SEARCH';
  g.targetPos = { x: at.x, y: at.y };
  g.observeRemaining = ctx.config.searchTicks;
  g.searchTurnCounter = 0;
  g.chaseTargetId = null;
  g.capture = null;
  g.path = [];
  log(world, g.id, 'GUARD_SEARCH', `(${at.x},${at.y}) 周辺を捜索開始`);
}

function enterPatrol(world: WorldState, g: Guard): void {
  g.state = 'PATROL';
  g.targetPos = null;
  g.chaseTargetId = null;
  g.lastSeenPos = null;
  g.capture = null;
  g.path = [];
  g.moveProgress = 0;
  log(world, g.id, 'GUARD_PATROL', '巡回に戻った');
}

export function enterInvestigate(world: WorldState, g: Guard, at: Position, reason: string): void {
  g.state = 'INVESTIGATE';
  g.targetPos = { x: at.x, y: at.y };
  g.observeRemaining = 0;
  g.chaseTargetId = null;
  g.capture = null;
  g.path = [];
  log(world, g.id, 'GUARD_INVESTIGATE', `(${at.x},${at.y}) を調査: ${reason}`, null, 'warn');
}

export function enterChase(world: WorldState, g: Guard, thiefId: string, at: Position): void {
  const wasChasing = g.state === 'CHASE' && g.chaseTargetId === thiefId;
  g.state = 'CHASE';
  g.chaseTargetId = thiefId;
  g.lastSeenPos = { x: at.x, y: at.y };
  g.targetPos = { x: at.x, y: at.y };
  g.path = [];
  if (!wasChasing) log(world, g.id, 'GUARD_CHASE', `${thiefId} を追跡開始！`, null, 'warn');
}

/**
 * フェーズ3: 警備員の行動意図（目標・経路・待機）を決める。移動自体はフェーズ4。
 * 戻り値: この tick に移動を試みるか。
 */
export function decideGuard(world: WorldState, g: Guard, ctx: SimContext): boolean {
  if (!isGuardActive(g)) return false;
  switch (g.state) {
    case 'PATROL': {
      if (g.patrolRoute.length === 0) return false;
      if (g.patrolWaitRemaining > 0) {
        g.patrolWaitRemaining--;
        return false;
      }
      const point = g.patrolRoute[g.patrolIndex % g.patrolRoute.length]!;
      if (samePos(g, point)) {
        g.patrolIndex = (g.patrolIndex + 1) % g.patrolRoute.length;
        g.path = [];
        if (point.waitTicks > 0) {
          g.patrolWaitRemaining = point.waitTicks - 1;
          return false;
        }
        const nextPoint = g.patrolRoute[g.patrolIndex]!;
        if (samePos(g, nextPoint)) return false;
        setPathTo(world, g, nextPoint, false);
        return true;
      }
      setPathTo(world, g, point, false);
      return true;
    }
    case 'INVESTIGATE': {
      const target = g.targetPos;
      if (!target) {
        enterPatrol(world, g);
        return false;
      }
      if (samePos(g, target) || g.observeRemaining > 0 || (g.path.length === 0 && g.observeRemaining === 0 && !canReach(world, g, target))) {
        if (g.observeRemaining === 0 && samePos(g, target)) {
          g.observeRemaining = ctx.config.investigateObserveTicks;
        } else if (g.observeRemaining === 0) {
          // 到達不能: その場で観察
          g.observeRemaining = ctx.config.investigateObserveTicks;
        }
        g.observeRemaining--;
        g.direction = rotateClockwise(g.direction);
        if (g.observeRemaining <= 0) enterSearch(world, g, g, ctx);
        return false;
      }
      setPathTo(world, g, target, false);
      return true;
    }
    case 'CHASE': {
      const target = g.lastSeenPos ?? g.targetPos;
      if (!target) {
        enterSearch(world, g, g, ctx);
        return false;
      }
      const thief = world.thieves.find((t) => t.id === g.chaseTargetId);
      const visible = !!thief && g.visibleThiefIds.includes(thief.id);
      const targetOccupied = occupiedTiles(world, g.id).has(posKey(target));
      if (samePos(g, target) || (!visible && manhattan(g, target) <= 1 && targetOccupied)) {
        // 最終確認地点に到達（または隣接していて侵入できない）。対象が見えていなければ捜索
        if (!visible) {
          enterSearch(world, g, g, ctx);
          return false;
        }
        return false;
      }
      // 追跡対象のタイルは占有されているが、隣接まで進む
      g.path = findPath(world, g, target, { allowBlockedGoal: true }) ?? [];
      if (g.path.length === 0) {
        enterSearch(world, g, g, ctx);
        return false;
      }
      return true;
    }
    case 'SEARCH': {
      g.observeRemaining--;
      g.searchTurnCounter++;
      if (g.searchTurnCounter % 2 === 0) g.direction = rotateClockwise(g.direction);
      if (g.observeRemaining <= 0) enterPatrol(world, g);
      return false;
    }
    case 'UNCONSCIOUS':
      return false;
  }
}

function canReach(world: WorldState, from: Position, to: Position): boolean {
  return findPath(world, from, to) !== null;
}

/** フェーズ4: 警備員の移動。 */
export function moveGuard(world: WorldState, g: Guard, ctx: SimContext): void {
  if (!isGuardActive(g) || g.path.length === 0) return;
  const ticksPerTile = g.state === 'CHASE' ? ctx.config.guardChaseTicksPerTile : ctx.config.guardPatrolTicksPerTile;
  g.moveProgress++;
  if (g.moveProgress < ticksPerTile) return;
  const result = tryStep(world, g, g.path);
  if (result === 'moved') {
    g.moveProgress = 0;
    faceChaseTarget(world, g);
    return;
  }
  if (result === 'impassable') {
    g.path = [];
    return;
  }
  // ブロック: 動的占有を避けて再探索（追跡時は対象の隣で止まる）
  const goal = g.path[g.path.length - 1]!;
  const blocked = occupiedTiles(world, g.id);
  const replanned = findPath(world, g, goal, { blocked, allowBlockedGoal: g.state === 'CHASE' });
  if (replanned && replanned.length > 0) g.path = replanned;
}

/** 追跡中は対象（最後に見た位置）の方向を向く。4方向移動でジグザグしても視線を切らさないため。 */
function faceChaseTarget(world: WorldState, g: Guard): void {
  if (g.state !== 'CHASE') return;
  const target = world.thieves.find((t) => t.id === g.chaseTargetId);
  const at = target && !target.captured ? target : g.lastSeenPos;
  if (!at) return;
  const dir = directionFromTo(g, at);
  if (dir) g.direction = dir;
}

/** フェーズ1: 気絶解除 */
export function wakeGuards(world: WorldState, ctx: SimContext): void {
  for (const g of world.guards) {
    if (g.state !== 'UNCONSCIOUS' || g.carriedBy !== null) continue;
    if (g.wakeTick !== null && world.tick >= g.wakeTick) {
      g.wakeTick = null;
      g.sleepRemaining = null;
      log(world, g.id, 'GUARD_WAKE', '目を覚ました', null, 'warn');
      enterSearch(world, g, g, ctx);
    }
  }
}

export { enterSearch, enterPatrol };
