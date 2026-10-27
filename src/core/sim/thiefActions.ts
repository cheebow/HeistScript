import type { Thief, VmState, WorldState } from '../model/types';
import { findGuard, findObject, log, type SimContext } from './context';
import { isHidingSpot, isExitTile, occupiedTiles, posKey, samePos } from './grid';
import { tryStep } from './movement';
import { findPath } from './astar';
import { carryPreconditionError, haltVm, knockoutPreconditionError, noisePosition, openPreconditionError } from './vm';
import { enterInvestigate } from './guardAi';
import { isGuardActive } from './context';
import { manhattan } from './grid';
import { isAdjacentOrSame } from './targets';

/** 運搬中の警備員を怪盗の位置に追従させる */
export function syncCarried(world: WorldState, thief: Thief): void {
  if (!thief.carrying) return;
  const g = findGuard(world, thief.carrying);
  if (g) {
    g.x = thief.x;
    g.y = thief.y;
  }
}

/** フェーズ4: 怪盗のアクションを進め、期限が来たものを完了する。 */
export function processThiefAction(world: WorldState, vm: VmState, thief: Thief, ctx: SimContext): void {
  const action = vm.action;
  if (!action || vm.halted || thief.captured) return;
  const cfg = ctx.config;

  switch (action.kind) {
    case 'move': {
      if (action.path.length === 0) {
        vm.action = null;
        log(world, thief.id, 'MOVE_END', `${action.targetId} に到着 (${thief.x},${thief.y})`, action.line);
        return;
      }
      const ticksPerTile = thief.carrying ? cfg.thiefCarryTicksPerTile : cfg.thiefTicksPerTile;
      thief.moveProgress++;
      if (thief.moveProgress < ticksPerTile) return;
      const result = tryStep(world, thief, action.path);
      if (result === 'moved') {
        thief.moveProgress = 0;
        action.blockedCount = 0;
        syncCarried(world, thief);
        if (action.path.length === 0) {
          vm.action = null;
          log(world, thief.id, 'MOVE_END', `${action.targetId} に到着 (${thief.x},${thief.y})`, action.line);
        }
        return;
      }
      if (result === 'impassable') {
        // 閉じた扉（タイマー／スイッチ）: 開くまで待つ。3回制限には数えない
        const next = action.path[0]!;
        const door = world.objects.find((o) => o.type === 'door' && o.x === next.x && o.y === next.y);
        if (door && !door.open && (door.cycle || world.objects.some((o) => o.type === 'switch' && o.targetDoorId === door.id))) {
          thief.moveProgress = cfg.thiefTicksPerTile; // 開いた tick にすぐ進めるようにしておく
          if (action.blockedCount === 0) log(world, thief.id, 'MOVE_WAIT_DOOR', `扉 ${door.id} が開くのを待っている`, action.line);
          action.blockedCount = 0;
          return;
        }
      }
      // ブロック: 動かず、1タイル分の時間を置いて再試行（進行度リセット）。動的占有を避けて再探索
      action.blockedCount++;
      thief.moveProgress = 0;
      const occupied = occupiedTiles(world, thief.id);
      // 出口タイルは共有可能
      if (isExitTile(world, action.goal)) occupied.delete(posKey(action.goal));
      const replanned = findPath(world, thief, action.goal, { blocked: occupied });
      if (replanned && replanned.length > 0) {
        action.path = replanned;
      }
      if (action.blockedCount >= cfg.maxConsecutiveBlocks) {
        haltVm(
          world,
          vm,
          'PATH_BLOCKED',
          `${action.line}行目: '${action.targetId}' への移動が ${cfg.maxConsecutiveBlocks} 回連続でふさがれました（他の人物が進路上にいます）。対処: wait until guard_away などで相手が離れるのを待ってから move する`,
          action.line,
        );
        return;
      }
      log(world, thief.id, 'MOVE_BLOCKED', `進路がふさがれている (${action.blockedCount}/${cfg.maxConsecutiveBlocks})`, action.line, 'warn');
      return;
    }
    case 'wait': {
      action.remaining--;
      if (action.remaining <= 0) vm.action = null;
      return;
    }
    case 'waitUntil': {
      if (action.satisfied) {
        vm.action = null;
        log(world, thief.id, 'WAIT_UNTIL_END', '条件が成立した', action.line);
      }
      return;
    }
    case 'timed': {
      action.remaining--;
      if (action.remaining > 0) return;
      completeTimedAction(world, vm, thief, action, ctx);
      return;
    }
  }
}

function completeTimedAction(world: WorldState, vm: VmState, thief: Thief, action: Extract<VmState['action'], { kind: 'timed' }>, ctx: SimContext): void {
  vm.action = null;
  const line = action.line;
  switch (action.command) {
    case 'steal': {
      const obj = findObject(world, action.targetId);
      if (!obj || (obj.type !== 'treasure' && obj.type !== 'key') || obj.takenBy !== null || !isAdjacentOrSame(thief, obj)) {
        haltVm(world, vm, 'ACTION_FAILED', `${line}行目: steal ${action.targetId} に失敗しました（対象から離れたか、すでに取得済み）`, line);
        return;
      }
      obj.takenBy = thief.id;
      thief.inventory.push(obj.id);
      if (obj.type === 'key') log(world, thief.id, 'STEAL', `鍵 ${obj.id} を手に入れた（扉 ${obj.unlocks} を開けられる）`, line, 'success');
      else log(world, thief.id, 'STEAL', `${obj.id} を手に入れた！`, line, 'success');
      return;
    }
    case 'hide': {
      if (!isHidingSpot(world, thief)) {
        haltVm(world, vm, 'ACTION_FAILED', `${line}行目: hide に失敗しました（隠れ場所にいません）`, line);
        return;
      }
      thief.hidden = true;
      log(world, thief.id, 'HIDE', '隠れた', line);
      return;
    }
    case 'knockout': {
      const g = findGuard(world, action.targetId);
      const reason = g ? knockoutPreconditionError(world, thief, g) : '警備員が見つかりません';
      if (!g || reason) {
        haltVm(world, vm, 'KNOCKOUT_FAILED', `${line}行目: knockout ${action.targetId} に失敗しました（${reason}）`, line);
        return;
      }
      g.state = 'UNCONSCIOUS';
      g.wakeTick = world.tick + ctx.config.knockoutSleepTicks;
      g.sleepRemaining = null;
      g.capture = null;
      g.chaseTargetId = null;
      g.targetPos = null;
      g.path = [];
      g.moveProgress = 0;
      g.visibleThiefIds = [];
      g.unconsciousReported = false;
      world.stats.knockoutCount++;
      log(world, thief.id, 'KNOCKOUT', `${g.id} を気絶させた（${ctx.config.knockoutSleepTicks} tick 後に目覚める）`, line, 'success');
      return;
    }
    case 'carry': {
      const g = findGuard(world, action.targetId);
      const reason = g ? carryPreconditionError(world, thief, g) : '警備員が見つかりません';
      if (!g || reason) {
        haltVm(world, vm, 'ACTION_FAILED', `${line}行目: carry ${action.targetId} に失敗しました（${reason}）`, line);
        return;
      }
      g.carriedBy = thief.id;
      g.sleepRemaining = g.wakeTick !== null ? Math.max(0, g.wakeTick - world.tick) : 0;
      g.wakeTick = null;
      g.x = thief.x;
      g.y = thief.y;
      thief.carrying = g.id;
      log(world, thief.id, 'CARRY', `${g.id} を担いだ（気絶タイマー停止: 残り ${g.sleepRemaining} tick）`, line);
      return;
    }
    case 'drop': {
      const g = thief.carrying ? findGuard(world, thief.carrying) : undefined;
      if (!g) {
        haltVm(world, vm, 'ACTION_FAILED', `${line}行目: drop に失敗しました（何も担いでいません）`, line);
        return;
      }
      g.carriedBy = null;
      g.x = thief.x;
      g.y = thief.y;
      g.wakeTick = world.tick + (g.sleepRemaining ?? 0);
      g.sleepRemaining = null;
      thief.carrying = null;
      log(world, thief.id, 'DROP', `${g.id} を (${thief.x},${thief.y}) に下ろした（${g.wakeTick - world.tick} tick 後に目覚める）`, line);
      return;
    }
    case 'open': {
      const door = findObject(world, action.targetId);
      const reason = door && door.type === 'door' ? openPreconditionError(world, thief, door) : '扉が見つかりません';
      if (!door || reason) {
        haltVm(world, vm, 'ACTION_FAILED', `${line}行目: open ${action.targetId} に失敗しました（${reason}）`, line);
        return;
      }
      const wasLocked = door.locked;
      door.locked = false;
      door.open = true;
      log(world, thief.id, 'OPEN', wasLocked ? `鍵で ${door.id} を開けた` : `${door.id} を開けた`, line, 'success');
      return;
    }
    case 'distract': {
      const pos = noisePosition(world, action.targetId);
      if (!pos) {
        haltVm(world, vm, 'ACTION_FAILED', `${line}行目: distract ${action.targetId} に失敗しました（地点が見つかりません）`, line);
        return;
      }
      log(world, thief.id, 'NOISE', `${action.targetId} (${pos.x},${pos.y}) で物音がした`, line, 'warn');
      // 聞こえる範囲の警備員は調べに行く（追跡中・気絶中・仲間を起こしに行く途中は無視）
      for (const g of world.guards) {
        if (!isGuardActive(g) || g.state === 'CHASE' || g.reviveTargetId) continue;
        if (manhattan(g, pos) > ctx.config.hearingRange) continue;
        if (g.state === 'INVESTIGATE' && g.targetPos && samePos(g.targetPos, pos)) continue;
        enterInvestigate(world, g, pos, `物音（${action.targetId}）`);
      }
      return;
    }
    case 'signal': {
      world.signals[action.targetId] = true;
      log(world, thief.id, 'SIGNAL', `シグナル '${action.targetId}' を送った`, line);
      return;
    }
  }
}

export { samePos };
