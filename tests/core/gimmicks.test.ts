import { describe, expect, it } from 'vitest';
import { createRun, Run } from '../../src/core/runner';
import { makeStage } from './helpers';

function stepN(run: Run, n: number) {
  for (let i = 0; i < n && !run.done; i++) run.step();
}

describe('レーザー', () => {
  const stage = () =>
    makeStage(['#########', '#.......#', '#.......#', '#########'], {
      thieves: [{ id: 'thief_a', x: 1, y: 1, direction: 'right', starterScript: '' }],
      guards: [{ id: 'guard_1', x: 7, y: 2, direction: 'down', patrolRoute: [] }],
      objects: [{ id: 'laser_1', type: 'laser', x: 3, y: 1, onTicks: 4, offTicks: 4, offset: 0 }],
      exit: { x: 7, y: 1 },
      waypoints: [{ id: 'on_it', x: 3, y: 1 }],
    });

  it('周期で作動し、作動中に触れると警報が1回鳴る', () => {
    const r = createRun(stage(), { thief_a: 'move on_it\nwait 20\n' }).run!;
    // tick 1..3 作動 (t%8<4), 4..7 停止, 8..11 作動
    r.step();
    expect(r.world.objects[0]!.active).toBe(true);
    stepN(r, 3); // t4: 到着（(1,1)→(3,1) = 4tick）
    expect(r.world.thieves[0]!.x).toBe(3);
    expect(r.world.objects[0]!.active).toBe(false);
    expect(r.world.stats.alarmCount).toBe(0);
    stepN(r, 4); // t8: 作動 → 警報
    expect(r.world.objects[0]!.active).toBe(true);
    expect(r.world.stats.alarmCount).toBe(1);
    expect(r.world.guards[0]!.state).toBe('INVESTIGATE');
    stepN(r, 3);
    expect(r.world.stats.alarmCount).toBe(1); // 乗り続けても1回
    stepN(r, 8); // 一度止まって再作動 → 再度警報
    expect(r.world.stats.alarmCount).toBe(2);
  });

  it('停止中に通過すれば警報は鳴らない', () => {
    const r = createRun(stage(), { thief_a: 'wait 1\nmove exit\n' }).run!; // t3 (2,1), t5 (3,1) 停止中, t7 (4,1)
    r.runToEnd();
    expect(r.world.result?.status).toBe('SUCCESS');
    expect(r.world.stats.alarmCount).toBe(0);
  });
});

describe('タイマー扉', () => {
  const stage = () =>
    makeStage(['#######', '#..#..#', '#..D..#', '#..#..#', '#######'], {
      thieves: [{ id: 'thief_a', x: 1, y: 2, direction: 'right', starterScript: '' }],
      objects: [
        { id: 'tdoor', type: 'door', x: 3, y: 2, open: false, cycle: { openTicks: 4, closedTicks: 6, offset: 0 } },
        { id: 'gem', type: 'treasure', x: 5, y: 2 },
      ],
      exit: { x: 1, y: 1 },
    });

  it('周期で開閉し、閉じた扉の前では回数に数えずに待つ', () => {
    const r = createRun(stage(), { thief_a: 'move gem\nsteal gem\nmove exit\n' }).run!;
    r.step();
    expect(r.logs.some((l) => l.eventType === 'PATH_NOT_FOUND')).toBe(false);
    r.runToEnd();
    expect(r.world.result?.status).toBe('SUCCESS');
    expect(r.logs.some((l) => l.eventType === 'PATH_BLOCKED')).toBe(false);
    expect(r.logs.some((l) => l.eventType === 'DOOR_OPEN')).toBe(true);
    expect(r.logs.some((l) => l.eventType === 'DOOR_CLOSE')).toBe(true);
  });

  it('扉のマスに人物がいる間は閉じない', () => {
    const s = stage();
    s.waypoints = [{ id: 'in_door', x: 3, y: 2 }];
    const r = createRun(s, { thief_a: 'move in_door\nwait 30\n' }).run!;
    stepN(r, 40);
    const door = r.world.objects.find((o) => o.id === 'tdoor')!;
    // 怪盗が扉上にいる間は常に open
    expect(r.world.thieves[0]!.x).toBe(3);
    expect(door.open).toBe(true);
  });
});

describe('感圧スイッチ', () => {
  const stage = () =>
    makeStage(['#########', '#...#...#', '#...D...#', '#...#...#', '#########'], {
      thieves: [
        { id: 'thief_a', x: 1, y: 1, direction: 'right', starterScript: '' },
        { id: 'thief_b', x: 1, y: 3, direction: 'right', starterScript: '' },
      ],
      guards: [{ id: 'guard_1', x: 3, y: 1, direction: 'right', patrolRoute: [] }],
      objects: [
        { id: 'sdoor', type: 'door', x: 4, y: 2, open: false },
        { id: 'plate', type: 'switch', x: 1, y: 2, targetDoorId: 'sdoor' },
        { id: 'gem', type: 'treasure', x: 7, y: 2 },
      ],
      exit: { x: 7, y: 3 },
    });

  it('怪盗が乗っている間だけ扉が開き、気絶した警備員を置いても開く', () => {
    const r = createRun(stage(), { thief_a: 'move plate\nwait 40\n', thief_b: 'wait 2\nmove gem\nsteal gem\nmove exit\n' }).run!;
    stepN(r, 4);
    const door = () => r.world.objects.find((o) => o.id === 'sdoor')!;
    expect(r.world.objects.find((o) => o.id === 'plate')!.pressed).toBe(true);
    expect(door().open).toBe(true);
    r.runToEnd();
    // A は乗ったまま（スクリプト終了後も出口に行かない）→ 成功条件未達で STOPPED
    expect(r.world.result?.status).toBe('STOPPED');
    expect(r.world.thieves[1]!.inventory).toEqual(['gem']);

    // 気絶した警備員をスイッチに置く: guard_1 (3,1) right 向き → 背後は (2,1)
    const s2 = stage();
    s2.waypoints = [{ id: 'behind', x: 2, y: 1 }];
    const r2 = createRun(s2, { thief_a: 'move behind\nknockout guard_1\ncarry guard_1\nmove plate\ndrop\nmove gem\nsteal gem\nmove exit\n', thief_b: 'wait 20\nmove exit\n' }).run!;
    r2.runToEnd();
    expect(r2.logs.some((l) => l.eventType === 'SWITCH_ON')).toBe(true);
    expect(r2.world.result?.status).toBe('SUCCESS');
  });
});
