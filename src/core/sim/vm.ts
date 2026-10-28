import { MAIN_BLOCK, type Program, type Statement } from '../hsl/ast';
import type { Action, EventType, Frame, GameEvent, Thief, VmState, WorldState } from '../model/types';
import { findPath } from './astar';
import { findGuard, findObject, log, type SimContext } from './context';
import { isHidingSpot, manhattan, occupiedTiles, oppositeDirection, stepInDirection, samePos } from './grid';
import { evaluateExpr } from './predicates';
import { isAdjacent, isAdjacentOrSame, isGuardActive, parseCoordinate, resolveMoveTarget } from './targets';

export function createVmState(thiefId: string): VmState {
  return {
    thiefId,
    frames: [{ blockId: MAIN_BLOCK, pc: 0, loop: null }],
    action: null,
    finished: false,
    halted: false,
    handler: null,
    pendingEvents: [],
    currentLine: 0,
    lastLine: 0,
  };
}

const EVENT_PRIORITY: Record<EventType, number> = { spotted: 0, alarm: 1 };

function pickNextEvent(vm: VmState): GameEvent | null {
  if (vm.pendingEvents.length === 0) return null;
  const sorted = [...vm.pendingEvents].sort(
    (a, b) =>
      EVENT_PRIORITY[a.type] - EVENT_PRIORITY[b.type] ||
      a.tick - b.tick ||
      (a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0),
  );
  const ev = sorted[0]!;
  vm.pendingEvents = vm.pendingEvents.filter((e) => e !== ev);
  return ev;
}

/** スクリプトを致命的エラーで停止させる */
export function haltVm(world: WorldState, vm: VmState, code: string, message: string, line: number | null): void {
  vm.halted = true;
  vm.action = null;
  log(world, vm.thiefId, code, message, line, 'error');
}

function startHandler(world: WorldState, vm: VmState, program: Program, ev: GameEvent): void {
  const h = program.handlers[ev.type];
  if (!h) return;
  vm.handler = {
    event: ev.type,
    startTick: world.tick,
    savedFrames: vm.frames,
    savedAction: vm.action,
    savedFinished: vm.finished,
  };
  vm.frames = [{ blockId: h.blockId, pc: 0, loop: null }];
  vm.action = null;
  vm.finished = false;
  log(world, vm.thiefId, 'HANDLER_START', `on ${ev.type} ハンドラを開始（${ev.sourceId} による）`, h.line);
}

/** ハンドラから本体へ復帰する。移動は再探索、他の時間消費アクションは最初からやり直す。 */
function resumeFromHandler(world: WorldState, vm: VmState, thief: Thief, line: number | null): void {
  const h = vm.handler;
  if (!h) return;
  vm.handler = null;
  vm.frames = h.savedFrames;
  vm.finished = h.savedFinished;
  const saved = h.savedAction;
  vm.action = null;
  if (saved) {
    switch (saved.kind) {
      case 'move': {
        const path = findPath(world, thief, saved.goal);
        if (path === null) {
          haltVm(world, vm, 'PATH_NOT_FOUND', `${saved.line}行目: '${saved.targetId}' への経路が見つかりません（復帰時の再探索）`, saved.line);
          return;
        }
        vm.action = { ...saved, path, blockedCount: 0 };
        thief.moveProgress = 0;
        thief.hidden = false; // 移動開始で隠れ状態は解除 (SPEC 9.3)
        log(world, vm.thiefId, 'RESUME', `${saved.targetId} への移動を再開`, line);
        break;
      }
      case 'timed':
        vm.action = { ...saved, remaining: saved.total };
        log(world, vm.thiefId, 'RESUME', `${saved.command} を最初からやり直し`, line);
        break;
      case 'wait':
        vm.action = { ...saved };
        log(world, vm.thiefId, 'RESUME', `待機を再開（残り ${saved.remaining} tick）`, line);
        break;
      case 'waitUntil':
        vm.action = { ...saved };
        log(world, vm.thiefId, 'RESUME', '条件待ちを再開', line);
        break;
    }
  } else {
    log(world, vm.thiefId, 'RESUME', '本体へ復帰', line);
  }
}

function fail(world: WorldState, vm: VmState, stmt: Statement, message: string): void {
  haltVm(world, vm, 'ACTION_FAILED', `${stmt.line}行目: ${message}`, stmt.line);
}

/** アクション命令の前提条件を検証し、Action を生成する。失敗時は VM を停止して null を返す。 */
function startAction(world: WorldState, vm: VmState, thief: Thief, stmt: Statement & { kind: 'action' }, ctx: SimContext): Action | null {
  const t = ctx.config.actionTicks;
  const target = stmt.target ?? '';
  switch (stmt.command) {
    case 'move': {
      const r = resolveMoveTarget(world, thief, target);
      if (!r.ok) {
        fail(world, vm, stmt, `move ${target}: ${r.message}`);
        return null;
      }
      if (samePos(r.goal, thief)) {
        // すでに目的地にいる: 0tick で完了扱いにせず 1tick の移動アクションとして即完了
        thief.hidden = false;
        log(world, thief.id, 'MOVE_START', `${target} へ移動（すでに到着）`, stmt.line);
        return { kind: 'move', targetId: target, goal: r.goal, path: [], blockedCount: 0, line: stmt.line };
      }
      const path = findPath(world, thief, r.goal);
      if (path === null) {
        haltVm(world, vm, 'PATH_NOT_FOUND', `${stmt.line}行目: '${target}' への経路が見つかりません（壁や閉じた扉で遮られています）。対処: 閉じた扉なら隣まで move してから open 扉ID で開ける。別の怪盗が開けるのを wait until signal_received(...) で待つ`, stmt.line);
        return null;
      }
      thief.hidden = false;
      thief.moveProgress = 0;
      log(world, thief.id, 'MOVE_START', `${target} (${r.goal.x},${r.goal.y}) へ移動開始: ${path.length} タイル`, stmt.line);
      return { kind: 'move', targetId: target, goal: r.goal, path, blockedCount: 0, line: stmt.line };
    }
    case 'steal': {
      const obj = findObject(world, target);
      if (!obj || (obj.type !== 'treasure' && obj.type !== 'key')) {
        fail(world, vm, stmt, `'${target}' は宝物でも鍵でもありません`);
        return null;
      }
      if (obj.takenBy !== null) {
        fail(world, vm, stmt, `'${target}' はすでに取得されています`);
        return null;
      }
      if (!isAdjacentOrSame(thief, obj)) {
        fail(world, vm, stmt, `'${target}' に隣接していません。対処: 先に move ${target} で隣まで移動してから steal する`);
        return null;
      }
      log(world, thief.id, 'STEAL_START', `${target} を盗み始めた（${t.steal} tick）`, stmt.line);
      return { kind: 'timed', command: 'steal', targetId: target, remaining: t.steal, total: t.steal, line: stmt.line };
    }
    case 'hide': {
      if (!isHidingSpot(world, thief)) {
        fail(world, vm, stmt, 'ここは隠れ場所ではありません。対処: 緑のロッカーのマスまで move してから hide する（ID は命令ヘルプの一覧）');
        return null;
      }
      log(world, thief.id, 'HIDE_START', '隠れようとしている', stmt.line);
      return { kind: 'timed', command: 'hide', targetId: '', remaining: t.hide, total: t.hide, line: stmt.line };
    }
    case 'knockout': {
      const g = findGuard(world, target);
      if (!g) {
        fail(world, vm, stmt, `'${target}' は警備員ではありません`);
        return null;
      }
      if (thief.carrying) {
        fail(world, vm, stmt, '警備員を担いだままでは knockout できません');
        return null;
      }
      const reason = knockoutPreconditionError(world, thief, g);
      if (reason) {
        fail(world, vm, stmt, `knockout ${target}: ${reason}`);
        return null;
      }
      thief.hidden = false;
      log(world, thief.id, 'KNOCKOUT_START', `${target} を背後から気絶させようとしている（${t.knockout} tick）`, stmt.line);
      return { kind: 'timed', command: 'knockout', targetId: target, remaining: t.knockout, total: t.knockout, line: stmt.line };
    }
    case 'carry': {
      const g = findGuard(world, target);
      if (!g) {
        fail(world, vm, stmt, `'${target}' は警備員ではありません`);
        return null;
      }
      const reason = carryPreconditionError(world, thief, g);
      if (reason) {
        fail(world, vm, stmt, `carry ${target}: ${reason}`);
        return null;
      }
      log(world, thief.id, 'CARRY_START', `${target} を担ぎ始めた（${t.carry} tick）`, stmt.line);
      return { kind: 'timed', command: 'carry', targetId: target, remaining: t.carry, total: t.carry, line: stmt.line };
    }
    case 'drop': {
      if (!thief.carrying) {
        fail(world, vm, stmt, '何も担いでいません');
        return null;
      }
      log(world, thief.id, 'DROP_START', `${thief.carrying} を下ろす`, stmt.line);
      return { kind: 'timed', command: 'drop', targetId: thief.carrying, remaining: t.drop, total: t.drop, line: stmt.line };
    }
    case 'open': {
      const door = findObject(world, target);
      if (!door || door.type !== 'door') {
        fail(world, vm, stmt, `'${target}' は扉ではありません`);
        return null;
      }
      const reason = openPreconditionError(world, thief, door);
      if (reason) {
        fail(world, vm, stmt, `open ${target}: ${reason}`);
        return null;
      }
      log(world, thief.id, 'OPEN_START', `${target} を開け始めた（${t.open} tick）`, stmt.line);
      return { kind: 'timed', command: 'open', targetId: target, remaining: t.open, total: t.open, line: stmt.line };
    }
    case 'distract': {
      const pos = noisePosition(world, target);
      if (!pos) {
        fail(world, vm, stmt, `'${target}' は物音を立てられる地点ではありません`);
        return null;
      }
      const dist = manhattan(thief, pos);
      if (dist > ctx.config.distractRange) {
        fail(world, vm, stmt, `'${target}' は遠すぎます（距離 ${dist}、届くのは ${ctx.config.distractRange} まで）。対処: もっと近くの地点へ move してから distract する`);
        return null;
      }
      log(world, thief.id, 'DISTRACT_START', `${target} (${pos.x},${pos.y}) へ向けて物音を立てる（${t.distract} tick）`, stmt.line);
      return { kind: 'timed', command: 'distract', targetId: target, remaining: t.distract, total: t.distract, line: stmt.line };
    }
  }
}

/** distract の対象（地点またはオブジェクト）の座標 */
export function noisePosition(world: WorldState, id: string): { x: number; y: number } | null {
  const coord = parseCoordinate(id);
  if (coord) return coord;
  const wp = world.waypoints[id];
  if (wp) return { x: wp.x, y: wp.y };
  const obj = world.objects.find((o) => o.id === id);
  if (obj) return { x: obj.x, y: obj.y };
  return null;
}

export function knockoutPreconditionError(world: WorldState, thief: Thief, g: WorldState['guards'][number]): string | null {
  if (!isGuardActive(g)) return `${g.id} はすでに気絶しています`;
  const behind = stepInDirection(g, oppositeDirection(g.direction));
  if (!samePos(behind, thief)) {
    if (isAdjacent(thief, g)) return `${g.id} の背後にいません（警備員は ${g.direction} を向いています）。対処: 警備員の向きの反対側の隣のマスへ回り込む`;
    return `${g.id} の背後の隣接タイル (${behind.x},${behind.y}) にいません。対処: その位置の地点 ID へ move してから knockout する`;
  }
  void world;
  return null;
}

export function carryPreconditionError(world: WorldState, thief: Thief, g: WorldState['guards'][number]): string | null {
  if (thief.carrying) return 'すでに警備員を担いでいます';
  if (g.state !== 'UNCONSCIOUS') return `${g.id} は気絶していません（意識のある相手は運べません）`;
  if (g.carriedBy) return `${g.id} はすでに運搬中です`;
  if (!isAdjacentOrSame(thief, g)) return `${g.id} に隣接していません`;
  void world;
  return null;
}

export function openPreconditionError(world: WorldState, thief: Thief, door: WorldState['objects'][number]): string | null {
  if (door.open) return 'すでに開いています';
  if (door.locked && !hasKeyFor(world, thief, door.id)) {
    const key = world.objects.find((o) => o.type === 'key' && o.unlocks === door.id);
    return key ? `施錠されています。対処: 先に鍵 ${key.id} を move ${key.id} → steal ${key.id} で手に入れる` : '施錠されています';
  }
  if (!isAdjacent(thief, door)) return '扉に隣接していません';
  return null;
}

/** 怪盗がその扉を開けられる鍵を持っているか */
export function hasKeyFor(world: WorldState, thief: Thief, doorId: string): boolean {
  return thief.inventory.some((id) => world.objects.some((o) => o.id === id && o.type === 'key' && o.unlocks === doorId));
}

/**
 * フェーズ2: 怪盗の VM を1tick分進める。
 * アクション実行中なら命令は実行しない（waitUntil の条件のみ評価）。
 */
export function runVmTick(world: WorldState, vm: VmState, thief: Thief, ctx: SimContext): void {
  const program = ctx.programs[vm.thiefId];
  if (!program || vm.halted || thief.captured) return;

  // イベントハンドラ起動（ハンドラ実行中は起動しない）
  if (vm.handler === null && vm.pendingEvents.length > 0) {
    const ev = pickNextEvent(vm);
    if (ev) startHandler(world, vm, program, ev);
  }

  if (vm.handler && world.tick - vm.handler.startTick >= ctx.config.handlerTimeoutTicks) {
    haltVm(world, vm, 'HANDLER_TIMEOUT', `on ${vm.handler.event} ハンドラが ${ctx.config.handlerTimeoutTicks} tick 以内に終了しませんでした`, vm.currentLine);
    return;
  }

  if (vm.action === null) {
    executeStatements(world, vm, thief, program, ctx);
  }

  // waitUntil の条件はこの tick の確定状態で評価
  if (vm.action && vm.action.kind === 'waitUntil') {
    const stmt = program.blocks[vm.action.blockId]![vm.action.index]!;
    if (stmt.kind === 'waitUntil') {
      const ok = evaluateExpr(world, thief, stmt.cond, ctx.config);
      vm.action = { ...vm.action, satisfied: ok };
    }
  }
}

function executeStatements(world: WorldState, vm: VmState, thief: Thief, program: Program, ctx: SimContext): void {
  let budget = ctx.config.instructionBudgetPerTick;
  while (true) {
    if (vm.halted || vm.action !== null) return;
    const frame: Frame | undefined = vm.frames[vm.frames.length - 1];
    if (!frame) {
      if (vm.handler) {
        // ハンドラ末尾に到達: 暗黙の resume
        resumeFromHandler(world, vm, thief, null);
        continue;
      }
      if (!vm.finished) {
        vm.finished = true;
        log(world, vm.thiefId, 'SCRIPT_END', 'スクリプトの末尾に到達した', null);
      }
      return;
    }
    const block = program.blocks[frame.blockId]!;
    if (frame.pc >= block.length) {
      if (frame.loop) {
        if (budget <= 0) break;
        budget--;
        world.stats.instructionCount++;
        const whileStmt = program.blocks[frame.loop.blockId]![frame.loop.index]!;
        if (whileStmt.kind === 'while' && evaluateExpr(world, thief, whileStmt.cond, ctx.config)) {
          frame.pc = 0;
          continue;
        }
      }
      vm.frames.pop();
      continue;
    }
    if (budget <= 0) break;
    budget--;
    world.stats.instructionCount++;
    const stmt = block[frame.pc]!;
    vm.currentLine = stmt.line;
    switch (stmt.kind) {
      case 'if': {
        frame.pc++;
        const cond = evaluateExpr(world, thief, stmt.cond, ctx.config);
        if (cond) vm.frames.push({ blockId: stmt.thenBlock, pc: 0, loop: null });
        else if (stmt.elseBlock !== null) vm.frames.push({ blockId: stmt.elseBlock, pc: 0, loop: null });
        break;
      }
      case 'while': {
        const loopRef = { blockId: frame.blockId, index: frame.pc };
        frame.pc++;
        if (evaluateExpr(world, thief, stmt.cond, ctx.config)) {
          vm.frames.push({ blockId: stmt.body, pc: 0, loop: loopRef });
        }
        break;
      }
      case 'wait': {
        frame.pc++;
        vm.action = { kind: 'wait', remaining: Math.max(1, stmt.ticks), line: stmt.line };
        log(world, vm.thiefId, 'WAIT', `${stmt.ticks} tick 待機`, stmt.line);
        return;
      }
      case 'waitUntil': {
        vm.action = { kind: 'waitUntil', blockId: frame.blockId, index: frame.pc, line: stmt.line, satisfied: false };
        frame.pc++;
        log(world, vm.thiefId, 'WAIT_UNTIL', '条件が成立するまで待機', stmt.line);
        return;
      }
      case 'signal': {
        frame.pc++;
        vm.action = {
          kind: 'timed',
          command: 'signal',
          targetId: stmt.name,
          remaining: ctx.config.actionTicks.signal,
          total: ctx.config.actionTicks.signal,
          line: stmt.line,
        };
        return;
      }
      case 'resume': {
        frame.pc++;
        if (vm.handler) resumeFromHandler(world, vm, thief, stmt.line);
        break;
      }
      case 'action': {
        frame.pc++;
        const action = startAction(world, vm, thief, stmt, ctx);
        if (action) vm.action = action;
        return;
      }
    }
  }
  haltVm(
    world,
    vm,
    'SCRIPT_BUDGET_EXCEEDED',
    `${vm.currentLine}行目付近: 1tick あたりの命令数上限（${ctx.config.instructionBudgetPerTick}）を超えました。無限ループになっていませんか？ 対処: while の中に wait 1 を入れて、毎 tick 1 回だけ判定するようにする`,
    vm.currentLine,
  );
}

/** ブレークポイント用: 次に実行される文の行番号（アクション実行中や終了時は null） */
export function peekNextLine(vm: VmState, program: Program): number | null {
  if (vm.halted || vm.action !== null) return null;
  for (let i = vm.frames.length - 1; i >= 0; i--) {
    const f = vm.frames[i]!;
    const block = program.blocks[f.blockId]!;
    if (f.pc < block.length) return block[f.pc]!.line;
  }
  return null;
}

/** 動的占有を考慮した再探索（ブロック時） */
export function replanAround(world: WorldState, thief: Thief, goal: { x: number; y: number }) {
  const blocked = occupiedTiles(world, thief.id);
  return findPath(world, thief, goal, { blocked });
}
