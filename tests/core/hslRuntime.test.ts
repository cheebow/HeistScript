import { describe, expect, it } from 'vitest';
import { createRun, Run, simulate } from '../../src/core/runner';
import { makeStage } from './helpers';

function stepN(run: Run, n: number) {
  for (let i = 0; i < n && !run.done; i++) run.step();
}
function stepUntil(run: Run, pred: () => boolean, limit = 300): number {
  let n = 0;
  while (!pred() && !run.done && n < limit) {
    run.step();
    n++;
  }
  return n;
}

/** 警備員が右端から左を向いて立つ廊下。怪盗が右へ進むと視認される。隠れ場所は (2,2)。 */
function corridor() {
  return makeStage(['############', '#..........#', '#.H........#', '#..........#', '############'], {
    thieves: [{ id: 'thief_a', x: 1, y: 1, direction: 'right', starterScript: '' }],
    guards: [{ id: 'guard_1', x: 10, y: 3, direction: 'left', patrolRoute: [] }],
    exit: { x: 1, y: 3 },
    waypoints: [
      { id: 'far', x: 8, y: 1 },
      { id: 'locker', x: 2, y: 2 },
    ],
    objects: [{ id: 'gem', type: 'treasure', x: 9, y: 1 }],
  });
}

describe('HSL 実行時', () => {
  it('if/else と while が動き、述語を評価する', () => {
    const stage = corridor();
    const r = createRun(stage, { thief_a: 'if at_exit\n  wait 1\nelse\n  wait 2\nend\nwhile not at_exit\n  move exit\nend\nwait 1\n' }).run!;
    // else 側 (wait 2) → move exit (2タイル=4tick) → wait 1 → 終了
    r.runToEnd();
    expect(r.world.thieves[0]).toMatchObject({ x: 1, y: 3 });
    expect(r.logs.filter((l) => l.eventType === 'WAIT').map((l) => l.details)).toEqual(['2 tick 待機', '1 tick 待機']);
  });

  it('wait を含まない無限ループは命令予算超過で停止する', () => {
    const { world, run } = simulate(corridor(), { thief_a: 'while true\n  if safe\n  end\nend\n' });
    expect(world.result?.status).toBe('STOPPED');
    expect(run.logs.some((l) => l.eventType === 'SCRIPT_BUDGET_EXCEEDED')).toBe(true);
    expect(world.tick).toBe(1);
  });

  it('wait を含むループは毎tick1命令ずつ進む', () => {
    const r = createRun(corridor(), { thief_a: 'while true\n  wait 1\nend\n' }).run!;
    stepN(r, 50);
    expect(r.world.result).toBeNull();
    expect(r.world.vms[0]!.halted).toBe(false);
  });

  it('signal は1tickで立ち、signal_received で読める。再実行で初期化される', () => {
    const r = createRun(corridor(), { thief_a: 'signal go\nwait until signal_received(go)\nwait 5\n' }).run!;
    r.step();
    expect(r.world.signals['go']).toBe(true);
    r.step(); // wait until は真でも 1tick 消費 (D-01)
    expect(r.world.vms[0]!.action).toBeNull();
    r.step();
    expect(r.world.vms[0]!.action?.kind).toBe('wait');
    const r2 = createRun(corridor(), { thief_a: 'wait until signal_received(go)\n' }).run!;
    stepN(r2, 5);
    expect(r2.world.signals['go']).toBeUndefined();
    expect(r2.world.vms[0]!.action?.kind).toBe('waitUntil');
  });

  it('spotted はハンドラがなければログのみで中断しない', () => {
    const r = createRun(corridor(), { thief_a: 'move far\nwait 5\n' }).run!;
    stepUntil(r, () => r.world.stats.spottedCount > 0, 40);
    expect(r.world.stats.spottedCount).toBe(1);
    r.step();
    expect(r.logs.some((l) => l.eventType === 'EVENT_IGNORED')).toBe(true);
    expect(r.world.vms[0]!.action?.kind).toBe('move');
  });

  it('on spotted で移動を中断し、resume で同じ目標へ再探索する', () => {
    const src = 'on spotted\n  move locker\n  hide\n  wait until safe\n  resume\nend\nmove far\nwait 3\n';
    const r = createRun(corridor(), { thief_a: src }).run!;
    stepUntil(r, () => r.world.stats.spottedCount > 0, 40);
    const spottedTick = r.world.tick;
    expect(r.world.vms[0]!.handler).toBeNull();
    r.step(); // 次tick開始時にハンドラ起動
    expect(r.world.tick).toBe(spottedTick + 1);
    expect(r.world.vms[0]!.handler?.event).toBe('spotted');
    expect(r.world.vms[0]!.handler?.savedAction?.kind).toBe('move');
    stepUntil(r, () => r.world.thieves[0]!.hidden, 40);
    expect(r.world.thieves[0]!.hidden).toBe(true);
    // 警備員は固定なので、隠れていれば視認されず safe → resume → far へ再出発
    stepUntil(r, () => r.world.vms[0]!.handler === null, 40);
    expect(r.logs.some((l) => l.eventType === 'RESUME' && l.details.includes('far'))).toBe(true);
    expect(r.world.vms[0]!.action?.kind).toBe('move');
    expect(r.world.thieves[0]!.hidden).toBe(false);
  });

  it('ハンドラ末尾に到達すると暗黙の resume、resume 以降の文は実行しない', () => {
    const src = 'on spotted\n  wait 1\n  resume\n  wait 50\nend\nmove far\nwait 2\n';
    const r = createRun(corridor(), { thief_a: src }).run!;
    stepUntil(r, () => r.world.vms[0]!.handler !== null, 40);
    stepUntil(r, () => r.world.vms[0]!.handler === null, 10);
    expect(r.world.vms[0]!.handler).toBeNull();
    expect(r.logs.filter((l) => l.eventType === 'WAIT').some((l) => l.details.startsWith('50'))).toBe(false);
    const src2 = 'on spotted\n  wait 1\nend\nmove far\nwait 2\n';
    const r2 = createRun(corridor(), { thief_a: src2 }).run!;
    stepUntil(r2, () => r2.world.vms[0]!.handler !== null, 40);
    stepUntil(r2, () => r2.world.vms[0]!.handler === null, 10);
    expect(r2.logs.some((l) => l.eventType === 'RESUME')).toBe(true);
  });

  it('ハンドラが200tick続くと HANDLER_TIMEOUT', () => {
    // 警備員なし・カメラのみ（捕まらずにハンドラが続く）
    const stage = makeStage(['########', '#......#', '#......#', '########'], {
      thieves: [{ id: 'thief_a', x: 1, y: 1, direction: 'right', starterScript: '' }],
      cameras: [{ id: 'cam_1', x: 6, y: 1, direction: 'left', range: 5, rotateEveryTicks: 0 }],
      exit: { x: 1, y: 2 },
      waypoints: [{ id: 'far', x: 5, y: 1 }],
      maxTicks: 1000,
    });
    const src = 'on alarm\n  while true\n    wait 1\n  end\nend\nmove far\n';
    const { world, run } = simulate(stage, { thief_a: src });
    expect(world.result?.status).toBe('STOPPED');
    expect(run.logs.some((l) => l.eventType === 'HANDLER_TIMEOUT')).toBe(true);
  });

  it('ハンドラ中のイベントはキューに保持され、同種は1件に集約、spotted が alarm より優先', () => {
    const stage = makeStage(['############', '#..........#', '#..........#', '#..........#', '############'], {
      thieves: [{ id: 'thief_a', x: 2, y: 2, direction: 'right', starterScript: '' }],
      guards: [{ id: 'guard_1', x: 7, y: 2, direction: 'left', patrolRoute: [] }],
      cameras: [{ id: 'cam_1', x: 1, y: 1, direction: 'right', range: 3, rotateEveryTicks: 0 }],
      exit: { x: 10, y: 3 },
    });
    // 初期位置で警備員に視認され、カメラにも映る → 同tickに spotted と alarm
    const src = 'on alarm\n  wait 2\nend\non spotted\n  wait 2\nend\nwait 30\n';
    const r = createRun(stage, { thief_a: src }).run!;
    r.step();
    expect(r.world.eventQueue.map((e) => e.type).sort()).toEqual(['alarm', 'spotted']);
    r.step();
    const vm = r.world.vms[0]!;
    expect(vm.handler?.event).toBe('spotted');
    expect(vm.pendingEvents.map((e) => e.type)).toEqual(['alarm']);
    stepUntil(r, () => r.world.vms[0]!.handler?.event === 'alarm', 10);
    expect(r.world.vms[0]!.handler?.event).toBe('alarm');
  });

  it('捕まった怪盗を追う警備員が気絶していれば捕獲しない（捕獲条件の再検証）', () => {
    const stage = makeStage(['########', '#......#', '#......#', '########'], {
      thieves: [{ id: 'thief_a', x: 3, y: 1, direction: 'left', starterScript: '' }],
      guards: [{ id: 'guard_1', x: 1, y: 1, direction: 'right', patrolRoute: [] }],
      exit: { x: 6, y: 2 },
    });
    const r = createRun(stage, { thief_a: 'wait 50\n' }).run!;
    stepUntil(r, () => r.world.guards[0]!.capture !== null, 10);
    r.world.guards[0]!.state = 'UNCONSCIOUS';
    r.world.guards[0]!.wakeTick = 999;
    r.step();
    expect(r.world.result).toBeNull();
    expect(r.world.thieves[0]!.captured).toBe(false);
  });
});

describe('ブレークポイント', () => {
  it('該当行の実行前に停止し、再開すると1回だけスキップする', () => {
    const r = createRun(corridor(), { thief_a: 'wait 1\nwait 1\nmove exit\n' }).run!;
    r.breakpoints.set('thief_a', new Set([3]));
    r.step(); // wait 1 (t1)
    r.step(); // wait 1 (t2)
    const out = r.step(); // 3行目の実行前で停止、tick は進まない
    expect(out.breakpoint).toEqual({ thiefId: 'thief_a', line: 3 });
    expect(r.world.tick).toBe(2);
    const out2 = r.step();
    expect(out2.breakpoint).toBeNull();
    expect(r.world.tick).toBe(3);
    expect(r.world.vms[0]!.action?.kind).toBe('move');
  });
});

describe('2人の怪盗', () => {
  it('同じ通路を使ってもタイル重複・すり抜け・フリーズが起きない', () => {
    const stage = makeStage(
      ['##############', '#............#', '#.############', '#.############', '##############'],
      {
        thieves: [
          { id: 'thief_a', x: 1, y: 1, direction: 'right', starterScript: '' },
          { id: 'thief_b', x: 12, y: 1, direction: 'left', starterScript: '' },
        ],
        exit: { x: 1, y: 3 },
        waypoints: [
          { id: 'left', x: 1, y: 1 },
          { id: 'right', x: 12, y: 1 },
        ],
        maxTicks: 400,
      },
    );
    // すれ違い: A は右端へ、B は左端へ（1幅の通路）
    const r = createRun(stage, { thief_a: 'move right\nmove exit\n', thief_b: 'move left\nmove exit\n' }).run!;
    let maxBlocked = 0;
    while (!r.done) {
      r.step();
      const [a, b] = r.world.thieves;
      if (a!.x === b!.x && a!.y === b!.y && !(a!.x === 1 && a!.y === 3)) throw new Error(`tile overlap at tick ${r.world.tick}`);
      const blocked = r.world.tickLog.filter((l) => l.eventType === 'MOVE_BLOCKED').length;
      maxBlocked = Math.max(maxBlocked, blocked);
    }
    // 1幅通路で正面衝突 → 迂回路がないので PATH_BLOCKED で停止するのが正しい（フリーズしない）
    expect(r.world.result?.status).toBe('STOPPED');
    expect(r.logs.some((l) => l.eventType === 'PATH_BLOCKED')).toBe(true);
    expect(r.world.tick).toBeLessThan(100);
  });

  it('2幅通路なら動的占有を避けてすれ違える', () => {
    const stage = makeStage(
      ['##############', '#............#', '#............#', '##############'],
      {
        thieves: [
          { id: 'thief_a', x: 1, y: 1, direction: 'right', starterScript: '' },
          { id: 'thief_b', x: 12, y: 1, direction: 'left', starterScript: '' },
        ],
        exit: { x: 6, y: 2 },
        waypoints: [
          { id: 'left', x: 1, y: 1 },
          { id: 'right', x: 12, y: 1 },
        ],
      },
    );
    const { world } = simulate(stage, { thief_a: 'move right\nmove exit\n', thief_b: 'move left\nmove exit\n' });
    expect(world.result?.status).toBe('SUCCESS');
  });

  it('全員が出口に到達したときのみ成功（出口タイルは共有可能）', () => {
    const stage = makeStage(['########', '#......#', '#......#', '########'], {
      thieves: [
        { id: 'thief_a', x: 1, y: 1, direction: 'right', starterScript: '' },
        { id: 'thief_b', x: 6, y: 1, direction: 'left', starterScript: '' },
      ],
      exit: { x: 3, y: 2 },
    });
    const r = createRun(stage, { thief_a: 'move exit\n', thief_b: 'wait 10\nmove exit\n' }).run!;
    stepN(r, 8);
    expect(r.world.result).toBeNull();
    r.runToEnd();
    expect(r.world.result?.status).toBe('SUCCESS');
    expect(r.world.thieves.every((t) => t.x === 3 && t.y === 2)).toBe(true);
  });
});
