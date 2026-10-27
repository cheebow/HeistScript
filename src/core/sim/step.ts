import type { WorldState } from '../model/types';
import { findVm, log, type SimContext } from './context';
import { decideGuard, moveGuard, wakeGuards } from './guardAi';
import { judgeMission, processCameras, processGuardVision } from './judge';
import { processThiefAction } from './thiefActions';
import { updateGimmicks } from './gimmicks';
import { runVmTick } from './vm';

/**
 * 1tick 進める（SPEC 5節の順序）。world を直接更新する。
 * 1. tick++、タイマー、前tickのイベントキュー処理
 * 2. 怪盗 VM（ID昇順）
 * 3. 警備員 AI / カメラの行動決定
 * 4. 行動の完了と競合解決（警備員ID昇順 → 怪盗ID昇順）
 * 5. 視認・警戒・捕獲・拾得・勝敗判定
 * 6. ログ（tickLog に蓄積。呼び出し側で収集）
 */
export function step(world: WorldState, ctx: SimContext): void {
  if (world.result) return;
  world.tick++;
  world.tickLog = [];

  // 1. タイマーとイベント（扉・スイッチ・レーザーの状態もここで確定）
  wakeGuards(world, ctx);
  updateGimmicks(world, ctx);
  dispatchEvents(world, ctx);

  // 2. 怪盗 VM
  for (const thief of world.thieves) {
    const vm = findVm(world, thief.id);
    if (vm) runVmTick(world, vm, thief, ctx);
  }

  // 3. 警備員 AI
  for (const g of world.guards) decideGuard(world, g, ctx);

  // 4. 移動・行動完了（警備員 → 怪盗）
  for (const g of world.guards) moveGuard(world, g, ctx);
  for (const thief of world.thieves) {
    const vm = findVm(world, thief.id);
    if (vm) processThiefAction(world, vm, thief, ctx);
  }

  // 5. 判定（気絶成立はフェーズ4で適用済み → 視認より先）
  processCameras(world, ctx);
  processGuardVision(world, ctx);
  judgeMission(world);
}

/** 前tick末に投入されたイベントを各VMの保留キューへ振り分ける（同種は1件に集約） */
function dispatchEvents(world: WorldState, ctx: SimContext): void {
  const queue = world.eventQueue;
  world.eventQueue = [];
  for (const ev of queue) {
    for (const vm of world.vms) {
      if (ev.type === 'spotted' && ev.targetId !== vm.thiefId) continue;
      const program = ctx.programs[vm.thiefId];
      if (!program || !program.handlers[ev.type]) {
        if (ev.type === 'spotted') log(world, vm.thiefId, 'EVENT_IGNORED', `on ${ev.type} ハンドラがないため通常処理を継続`, null);
        continue;
      }
      if (vm.pendingEvents.some((e) => e.type === ev.type)) continue;
      vm.pendingEvents.push(ev);
    }
  }
}
