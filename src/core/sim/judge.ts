import type { Guard, Thief, WorldState } from '../model/types';
import { isGuardActive, log, type SimContext } from './context';
import { enterChase, enterInvestigate } from './guardAi';
import { euclid, manhattan, rotateClockwise, samePos } from './grid';
import { canSee } from './vision';

function sortIds(ids: string[]): string[] {
  return [...ids].sort();
}

/** フェーズ5-a: カメラ回転とカメラ検知（警報） */
export function processCameras(world: WorldState, ctx: SimContext): void {
  for (const cam of world.cameras) {
    if (cam.rotateEveryTicks > 0 && world.tick % cam.rotateEveryTicks === 0) {
      cam.direction = rotateClockwise(cam.direction);
    }
    const nowVisible: string[] = [];
    for (const t of world.thieves) {
      if (t.captured || t.hidden) continue;
      if (canSee(world, { x: cam.x, y: cam.y, direction: cam.direction, range: cam.range }, t)) nowVisible.push(t.id);
    }
    const prev = cam.visibleThiefIds;
    for (const id of nowVisible) {
      if (prev.includes(id)) continue;
      const thief = world.thieves.find((t) => t.id === id)!;
      raiseAlarm(world, cam.id, thief, `カメラ ${cam.id} が ${thief.id} を検知`, ctx);
    }
    cam.visibleThiefIds = sortIds(nowVisible);
  }
}

/** 警報を発生させる: カウント加算、警備員へ調査指示、alarm イベント投入 */
export function raiseAlarm(world: WorldState, sourceId: string, at: { x: number; y: number }, reason: string, ctx: SimContext): void {
  void ctx;
  world.stats.alarmCount++;
  world.alarmActive = true;
  world.lastAlarmPos = { x: at.x, y: at.y };
  log(world, sourceId, 'ALARM', `警報！ ${reason} (${at.x},${at.y})`, null, 'warn');
  for (const g of world.guards) {
    if (!isGuardActive(g)) continue;
    if (g.state === 'PATROL' || g.state === 'SEARCH' || g.state === 'INVESTIGATE') {
      enterInvestigate(world, g, at, '警報を受信');
    }
  }
  world.eventQueue.push({ type: 'alarm', tick: world.tick, targetId: '', sourceId, x: at.x, y: at.y });
}

/** フェーズ5-b: 警備員の視認・状態遷移・捕獲判定 */
export function processGuardVision(world: WorldState, ctx: SimContext): void {
  const cfg = ctx.config;
  const prevSeen = new Set<string>();
  for (const g of world.guards) for (const id of g.visibleThiefIds) prevSeen.add(id);

  const nowSeen = new Set<string>();
  const spottedBy = new Map<string, string>(); // thiefId → first guard id

  for (const g of world.guards) {
    if (!isGuardActive(g)) {
      g.visibleThiefIds = [];
      continue;
    }
    const viewer = { x: g.x, y: g.y, direction: g.direction, range: cfg.guardVisionRange };
    const visible: Thief[] = [];
    for (const t of world.thieves) {
      if (t.captured || t.hidden) continue;
      if (canSee(world, viewer, t)) visible.push(t);
    }
    g.visibleThiefIds = sortIds(visible.map((t) => t.id));
    for (const t of visible) {
      nowSeen.add(t.id);
      if (!spottedBy.has(t.id)) spottedBy.set(t.id, g.id);
    }

    if (visible.length > 0) {
      // 最も近い怪盗を追跡（同距離はID順）
      let target = visible[0]!;
      for (const t of visible) {
        const dt = euclid(g, t);
        const dc = euclid(g, target);
        if (dt < dc || (dt === dc && t.id < target.id)) target = t;
      }
      enterChase(world, g, target.id, target);
    } else if (g.state !== 'CHASE') {
      // 気絶した仲間の発見
      for (const other of world.guards) {
        if (other.id === g.id || other.state !== 'UNCONSCIOUS' || other.carriedBy || other.unconsciousReported) continue;
        if (canSee(world, viewer, other)) {
          other.unconsciousReported = true;
          log(world, g.id, 'GUARD_FOUND_UNCONSCIOUS', `気絶した ${other.id} を発見`, null, 'warn');
          raiseAlarm(world, g.id, other, `${g.id} が気絶した ${other.id} を発見`, ctx);
          enterInvestigate(world, g, other, `気絶した ${other.id}`);
          break;
        }
      }
    }
  }

  // spotted イベント（未発見→発見の立ち上がり）
  for (const t of world.thieves) {
    if (nowSeen.has(t.id) && !prevSeen.has(t.id)) {
      world.stats.spottedCount++;
      const by = spottedBy.get(t.id)!;
      log(world, by, 'SPOTTED', `${t.id} を発見！`, null, 'warn');
      world.eventQueue.push({ type: 'spotted', tick: world.tick, targetId: t.id, sourceId: by, x: t.x, y: t.y });
    }
  }

  // 捕獲判定
  for (const g of world.guards) {
    if (!isGuardActive(g) || g.state !== 'CHASE' || !g.chaseTargetId) {
      g.capture = null;
      continue;
    }
    const target = world.thieves.find((t) => t.id === g.chaseTargetId);
    // 距離1で捕獲準備。同一タイル（目覚め時の重なり）も隣接とみなす (D-17)
    if (!target || target.captured || target.hidden || manhattan(g, target) > 1) {
      g.capture = null;
      continue;
    }
    if (g.capture && g.capture.targetId === target.id && g.capture.preparedAtTick < world.tick) {
      target.captured = true;
      log(world, g.id, 'CAPTURED', `${target.id} を逮捕した`, null, 'error');
      world.result = { status: 'FAILED', reason: `${target.id} が ${g.id} に逮捕されました`, actorId: target.id, scriptLine: null };
    } else if (!g.capture || g.capture.targetId !== target.id) {
      g.capture = { targetId: target.id, preparedAtTick: world.tick };
      log(world, g.id, 'CAPTURE_PREPARE', `${target.id} に手が届きそうだ…`, null, 'warn');
    }
  }

  world.alarmActive = world.guards.some((g) => isGuardActive(g) && g.state !== 'PATROL');
}

/** フェーズ5-c: 勝敗判定 */
export function judgeMission(world: WorldState): void {
  if (world.result) return;
  const allTreasures = world.requiredTreasureIds.every((id) => world.objects.find((o) => o.id === id)?.takenBy !== null);
  const allAtExit = world.thieves.every((t) => samePos(t, world.exit));
  if (allTreasures && allAtExit) {
    world.result = { status: 'SUCCESS', reason: '宝物を手に入れて全員脱出した！', actorId: null, scriptLine: null };
    log(world, 'mission', 'SUCCESS', world.result.reason, null, 'success');
    return;
  }
  if (world.tick >= world.maxTicks) {
    world.result = { status: 'FAILED', reason: `制限時間 ${world.maxTicks} tick を超過しました`, actorId: null, scriptLine: null };
    log(world, 'mission', 'TIMEOUT', world.result.reason, null, 'error');
    return;
  }
  const halted = world.vms.find((v) => v.halted);
  if (halted) {
    const err = world.tickLog.find((l) => l.actorId === halted.thiefId && l.level === 'error');
    world.result = {
      status: 'STOPPED',
      reason: err ? `${halted.thiefId}: ${err.details}` : `${halted.thiefId} のスクリプトが停止しました`,
      actorId: halted.thiefId,
      scriptLine: err?.scriptLine ?? halted.currentLine,
    };
    return;
  }
  const allFinished = world.vms.every((v) => v.finished && v.action === null && v.handler === null && v.pendingEvents.length === 0);
  if (allFinished) {
    const missing: string[] = [];
    if (!allTreasures) missing.push('必須の宝物が未取得');
    if (!allAtExit) missing.push('出口に到達していない怪盗がいる');
    world.result = {
      status: 'STOPPED',
      reason: `すべてのスクリプトが終了しましたが、クリア条件を満たしていません（${missing.join('、')}）`,
      actorId: null,
      scriptLine: null,
    };
    log(world, 'mission', 'STOPPED', world.result.reason, null, 'warn');
  }
}

export type { Guard };
