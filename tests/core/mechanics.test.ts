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

/** 警備員が上を向いて立っている小部屋。怪盗はその真下（背後）。 */
function koStage(thiefPos: { x: number; y: number }, guardDir: 'up' | 'down' | 'left' | 'right' = 'up') {
  return makeStage(['#########', '#.......#', '#.......#', '#.......#', '#.......#', '#########'], {
    thieves: [{ id: 'thief_a', x: thiefPos.x, y: thiefPos.y, direction: 'up', starterScript: '' }],
    guards: [{ id: 'guard_1', x: 4, y: 2, direction: guardDir, patrolRoute: [] }],
    exit: { x: 1, y: 4 },
    waypoints: [{ id: 'spot', x: 7, y: 4 }],
  });
}

describe('気絶', () => {
  it('背後から2tickで成功し、30tick後に目覚めて捜索する', () => {
    const r = createRun(koStage({ x: 4, y: 3 }), { thief_a: 'knockout guard_1\nwait 60\n' }).run!;
    r.step();
    expect(r.world.guards[0]!.state).toBe('PATROL');
    r.step();
    expect(r.world.guards[0]!.state).toBe('UNCONSCIOUS');
    expect(r.world.guards[0]!.wakeTick).toBe(32);
    expect(r.world.stats.knockoutCount).toBe(1);
    stepUntil(r, () => r.world.tick === 31);
    expect(r.world.guards[0]!.state).toBe('UNCONSCIOUS');
    r.step();
    expect(r.world.guards[0]!.state).toBe('SEARCH');
  });

  it('正面からは失敗する', () => {
    const { world, run } = simulate(koStage({ x: 4, y: 1 }), { thief_a: 'knockout guard_1\n' });
    expect(world.result?.status).toBe('STOPPED');
    expect(run.logs.some((l) => l.eventType === 'ACTION_FAILED' && l.details.includes('背後'))).toBe(true);
    expect(world.guards[0]!.state).not.toBe('UNCONSCIOUS');
  });

  it('完了時に条件が変わっていれば KNOCKOUT_FAILED', () => {
    const stage = koStage({ x: 4, y: 3 });
    // 警備員は1tick後に巡回で右へ動き出す
    stage.guards[0]!.patrolRoute = [{ x: 7, y: 2, waitTicks: 0 }, { x: 4, y: 2, waitTicks: 0 }];
    const r = createRun(stage, { thief_a: 'knockout guard_1\n' }).run!;
    r.step();
    // 2tick目: 警備員が動いて向きが変わる前に完了するかはタイミング次第 → 向きを強制変更して再検証を確かめる
    r.world.guards[0]!.direction = 'down';
    r.step();
    expect(r.world.result?.status).toBe('STOPPED');
    expect(r.logs.some((l) => l.eventType === 'KNOCKOUT_FAILED')).toBe(true);
  });

  it('運搬中はタイマーが止まり、drop で再開する', () => {
    const r = createRun(koStage({ x: 4, y: 3 }), { thief_a: 'knockout guard_1\ncarry guard_1\nmove spot\ndrop\nwait 100\n' }).run!;
    stepN(r, 2);
    expect(r.world.guards[0]!.state).toBe('UNCONSCIOUS');
    stepUntil(r, () => r.world.guards[0]!.carriedBy !== null, 10);
    const g = r.world.guards[0]!;
    expect(g.carriedBy).toBe('thief_a');
    expect(g.wakeTick).toBeNull();
    const remaining = g.sleepRemaining!;
    expect(remaining).toBeGreaterThan(20);
    // 運搬中は 4tick/タイルで移動し、警備員は怪盗に追従
    const t0 = r.world.tick;
    stepN(r, 4);
    expect(r.world.thieves[0]!.x).toBe(5);
    expect(r.world.guards[0]!.x).toBe(5);
    stepUntil(r, () => r.world.guards[0]!.carriedBy === null, 60);
    const g2 = r.world.guards[0]!;
    expect(g2.x).toBe(7);
    expect(g2.y).toBe(4);
    expect(g2.wakeTick).toBe(r.world.tick + remaining);
    expect(r.world.tick - t0).toBeGreaterThanOrEqual(13); // 3タイル×4tick + drop 1tick
    stepUntil(r, () => r.world.guards[0]!.state !== 'UNCONSCIOUS', 100);
    expect(r.world.guards[0]!.state).toBe('SEARCH');
  });

  it('意識のある警備員は運べない', () => {
    const { world, run } = simulate(koStage({ x: 4, y: 3 }), { thief_a: 'carry guard_1\n' });
    expect(world.result?.status).toBe('STOPPED');
    expect(run.logs.some((l) => l.eventType === 'ACTION_FAILED' && l.details.includes('気絶していません'))).toBe(true);
  });

  it('気絶した仲間を見た警備員は警報を出して調査する', () => {
    const stage = makeStage(['###########', '#.........#', '#.........#', '#.........#', '#.........#', '###########'], {
      thieves: [{ id: 'thief_a', x: 4, y: 3, direction: 'up', starterScript: '' }],
      guards: [
        { id: 'guard_1', x: 4, y: 2, direction: 'up', patrolRoute: [] },
        { id: 'guard_2', x: 9, y: 4, direction: 'up', patrolRoute: [{ x: 9, y: 2, waitTicks: 0 }, { x: 8, y: 2, waitTicks: 0 }, { x: 9, y: 4, waitTicks: 0 }] },
      ],
      exit: { x: 1, y: 4 },
      waypoints: [{ id: 'away', x: 1, y: 1 }],
    });
    // 気絶させたら怪盗は部屋の隅（guard_2 の視界外）へ退避
    const r = createRun(stage, { thief_a: 'knockout guard_1\nmove away\nwait 40\n' }).run!;
    stepUntil(r, () => r.world.guards[1]!.state === 'INVESTIGATE', 60);
    expect(r.world.guards[1]!.state).toBe('INVESTIGATE');
    expect(r.world.stats.alarmCount).toBe(1);
    expect(r.world.guards[0]!.unconsciousReported).toBe(true);
  });
});

describe('カメラと扉', () => {
  it('カメラに映ると警報が立ち、警備員が調査に来る。カメラ自身は追跡しない', () => {
    const stage = makeStage(['############', '#..........#', '#..........#', '#..........#', '############'], {
      thieves: [{ id: 'thief_a', x: 1, y: 1, direction: 'right', starterScript: '' }],
      guards: [{ id: 'guard_1', x: 10, y: 3, direction: 'down', patrolRoute: [] }],
      cameras: [{ id: 'cam_1', x: 6, y: 1, direction: 'left', range: 4, rotateEveryTicks: 0 }],
      exit: { x: 1, y: 3 },
      waypoints: [{ id: 'p', x: 3, y: 1 }],
    });
    const r = createRun(stage, { thief_a: 'move p\nwait 30\n' }).run!;
    r.step();
    expect(r.world.stats.alarmCount).toBe(0); // (1,1) は距離5で射程外
    r.step();
    expect(r.world.thieves[0]!.x).toBe(2);
    expect(r.world.stats.alarmCount).toBe(1);
    expect(r.world.alarmActive).toBe(true);
    expect(r.world.guards[0]!.state).toBe('INVESTIGATE');
    expect(r.world.eventQueue.some((e) => e.type === 'alarm')).toBe(true);
    stepN(r, 10);
    expect(r.world.stats.alarmCount).toBe(1); // 映り続けても1回
    expect(r.world.thieves[0]!.captured).toBe(false);
  });

  it('カメラは rotateEveryTicks ごとに時計回りに回転する', () => {
    const stage = makeStage(['#######', '#.....#', '#.....#', '#######'], {
      cameras: [{ id: 'cam_1', x: 3, y: 1, direction: 'up', range: 3, rotateEveryTicks: 5 }],
      thieves: [{ id: 'thief_a', x: 1, y: 2, direction: 'right', starterScript: '' }],
      exit: { x: 5, y: 2 },
    });
    const r = createRun(stage, { thief_a: 'wait 30\n' }).run!;
    stepN(r, 4);
    expect(r.world.cameras[0]!.direction).toBe('up');
    r.step();
    expect(r.world.cameras[0]!.direction).toBe('right');
    stepN(r, 5);
    expect(r.world.cameras[0]!.direction).toBe('down');
  });

  it('閉じた扉は経路を遮り、open で通れるようになる', () => {
    const stage = makeStage(['#######', '#..#..#', '#..D..#', '#..#..#', '#######'], {
      thieves: [{ id: 'thief_a', x: 1, y: 2, direction: 'right', starterScript: '' }],
      objects: [
        { id: 'door', type: 'door', x: 3, y: 2, open: false },
        { id: 'gem', type: 'treasure', x: 5, y: 2 },
      ],
      exit: { x: 1, y: 1 },
      waypoints: [{ id: 'front', x: 2, y: 2 }],
    });
    const blocked = simulate(stage, { thief_a: 'move gem\n' });
    expect(blocked.world.result?.status).toBe('STOPPED');
    expect(blocked.run.logs.some((l) => l.eventType === 'PATH_NOT_FOUND')).toBe(true);
    const ok = simulate(stage, { thief_a: 'move front\nopen door\nmove gem\nsteal gem\nmove exit\n' });
    expect(ok.world.result?.status).toBe('SUCCESS');
    expect(ok.world.objects.find((o) => o.id === 'door')!.open).toBe(true);
    const far = simulate(stage, { thief_a: 'open door\n' });
    expect(far.run.logs.some((l) => l.eventType === 'ACTION_FAILED' && l.details.includes('隣接'))).toBe(true);
  });
});

describe('隠れる', () => {
  const stage = () =>
    makeStage(['##########', '#........#', '#...H....#', '#........#', '##########'], {
      thieves: [{ id: 'thief_a', x: 1, y: 2, direction: 'right', starterScript: '' }],
      guards: [{ id: 'guard_1', x: 8, y: 2, direction: 'left', patrolRoute: [] }],
      exit: { x: 1, y: 1 },
      waypoints: [{ id: 'locker', x: 4, y: 2 }],
    });

  it('隠れ場所以外では hide が失敗する', () => {
    const { run } = simulate(stage(), { thief_a: 'hide\n' });
    expect(run.logs.some((l) => l.eventType === 'ACTION_FAILED' && l.details.includes('隠れ場所'))).toBe(true);
  });

  it('隠れると視認されず、移動開始で解除される', () => {
    const r = createRun(stage(), { thief_a: 'move locker\nhide\nwait 5\nmove exit\n' }).run!;
    // 怪盗は最初から警備員の正面（距離7 → 射程外）。ロッカー (4,2) は距離4で視界内
    stepUntil(r, () => r.world.thieves[0]!.hidden, 20);
    expect(r.world.thieves[0]!.hidden).toBe(true);
    const spottedBefore = r.world.stats.spottedCount;
    stepN(r, 3);
    expect(r.world.stats.spottedCount).toBe(spottedBefore);
    expect(r.world.guards[0]!.visibleThiefIds).toEqual([]);
    stepUntil(r, () => !r.world.thieves[0]!.hidden, 10);
    expect(r.world.thieves[0]!.hidden).toBe(false);
  });
});
