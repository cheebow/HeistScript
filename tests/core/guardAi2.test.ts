import { describe, expect, it } from 'vitest';
import { createRun, Run, simulate } from '../../src/core/runner';
import { getStages } from '../../src/core/stages';
import { makeStage } from './helpers';

function stepUntil(run: Run, pred: () => boolean, limit = 300): number {
  let n = 0;
  while (!pred() && !run.done && n < limit) {
    run.step();
    n++;
  }
  return n;
}

describe('Phase 9: 警備員 AI', () => {
  it('気絶した仲間を見つけた警備員は隣まで行き 3tick で起こす', () => {
    // 怪盗は気絶させた直後、その場のロッカーに隠れる（guard_2 からは仲間だけが見える）
    const stage = makeStage(['############', '#..........#', '#..........#', '#...H......#', '#..........#', '############'], {
      thieves: [{ id: 'thief_a', x: 4, y: 3, direction: 'up', starterScript: '' }],
      guards: [
        { id: 'guard_1', x: 4, y: 2, direction: 'up', patrolRoute: [] },
        { id: 'guard_2', x: 10, y: 2, direction: 'left', patrolRoute: [{ x: 8, y: 2, waitTicks: 0 }, { x: 10, y: 2, waitTicks: 0 }] },
      ],
      exit: { x: 1, y: 4 },
    });
    const script = 'knockout guard_1\nhide\nwait 60\n';
    const r = createRun(stage, { thief_a: script }).run!;
    stepUntil(r, () => r.world.guards[1]!.state === 'INVESTIGATE', 40);
    expect(r.world.guards[1]!.reviveTargetId).toBe('guard_1');
    const n = stepUntil(r, () => r.logs.some((l) => l.eventType === 'GUARD_REVIVE'), 60);
    expect(n).toBeLessThan(60);
    const reviveTick = r.world.tick;
    expect(r.logs.some((l) => l.eventType === 'GUARD_REVIVE_START')).toBe(true);
    r.step();
    expect(r.world.guards[0]!.state).not.toBe('UNCONSCIOUS');
    expect(r.world.guards[0]!.wakeTick).toBeNull();
    // 本来の目覚め (knockout + 30) より早い
    expect(reviveTick + 1).toBeLessThan(2 + 30);
    // 決定性
    const again = createRun(stage, { thief_a: script }).run!;
    again.runToEnd();
    r.runToEnd();
    expect(JSON.stringify(again.world)).toBe(JSON.stringify(r.world));
  });

  it('仲間が運ばれて消えていれば、その場を調べて捜索に移る', () => {
    const stage = makeStage(['###########', '#.........#', '#.........#', '#.........#', '#.........#', '###########'], {
      thieves: [{ id: 'thief_a', x: 4, y: 3, direction: 'up', starterScript: '' }],
      guards: [
        { id: 'guard_1', x: 4, y: 2, direction: 'up', patrolRoute: [] },
        { id: 'guard_2', x: 9, y: 2, direction: 'left', patrolRoute: [{ x: 8, y: 2, waitTicks: 0 }, { x: 9, y: 2, waitTicks: 0 }] },
      ],
      exit: { x: 1, y: 4 },
      waypoints: [{ id: 'away', x: 1, y: 1 }],
    });
    const r = createRun(stage, { thief_a: 'knockout guard_1\ncarry guard_1\nmove away\nwait 60\n' }).run!;
    stepUntil(r, () => r.world.guards[1]!.state === 'SEARCH' || r.world.guards[1]!.state === 'CHASE', 80);
    expect(r.logs.some((l) => l.eventType === 'GUARD_REVIVE')).toBe(false);
  });

  it('開始時に閉まっていた扉が開いていると巡回中の警備員が一度だけ調査する', () => {
    const stage = makeStage(['##########', '#...#....#', '#...D....#', '#...#....#', '##########'], {
      thieves: [{ id: 'thief_a', x: 1, y: 2, direction: 'right', starterScript: '' }],
      guards: [{ id: 'guard_1', x: 8, y: 2, direction: 'left', patrolRoute: [{ x: 8, y: 1, waitTicks: 2 }, { x: 8, y: 2, waitTicks: 0 }, { x: 6, y: 2, waitTicks: 2 }, { x: 8, y: 2, waitTicks: 0 }] }],
      objects: [{ id: 'door', type: 'door', x: 4, y: 2, open: false }],
      exit: { x: 1, y: 1 },
      waypoints: [{ id: 'front', x: 3, y: 2 }],
    });
    const r = createRun(stage, { thief_a: 'move front\nopen door\nmove exit\nwait 80\n' }).run!;
    const n = stepUntil(r, () => r.logs.some((l) => l.eventType === 'GUARD_FOUND_DOOR'), 120);
    expect(n).toBeLessThan(120);
    expect(r.world.guards[0]!.state).toBe('INVESTIGATE');
    stepUntil(r, () => r.world.guards[0]!.state === 'PATROL', 80);
    r.runToEnd();
    expect(r.logs.filter((l) => l.eventType === 'GUARD_FOUND_DOOR').length).toBe(1);
  });

  it('最初から開いている扉は調査しない', () => {
    const stage = makeStage(['##########', '#...#....#', '#...D....#', '#...#....#', '##########'], {
      thieves: [{ id: 'thief_a', x: 1, y: 1, direction: 'right', starterScript: '' }],
      guards: [{ id: 'guard_1', x: 8, y: 2, direction: 'left', patrolRoute: [] }],
      objects: [{ id: 'door', type: 'door', x: 4, y: 2, open: true }],
      exit: { x: 1, y: 3 },
    });
    const { run } = simulate(stage, { thief_a: 'wait 20\nmove exit\n' });
    expect(run.logs.some((l) => l.eventType === 'GUARD_FOUND_DOOR')).toBe(false);
  });

  it('追跡対象を見失うと GUARD_LOST を記録して捜索する', () => {
    const stage = makeStage(['############', '#..........#', '#..........#', '#..........#', '############'], {
      thieves: [{ id: 'thief_a', x: 6, y: 2, direction: 'right', starterScript: '' }],
      guards: [{ id: 'guard_1', x: 2, y: 2, direction: 'right', patrolRoute: [] }],
      exit: { x: 10, y: 3 },
    });
    const r = createRun(stage, { thief_a: 'wait 100\n' }).run!;
    r.step();
    expect(r.world.guards[0]!.state).toBe('CHASE');
    r.world.thieves[0]!.hidden = true; // テスト用: 視界から消す
    stepUntil(r, () => r.world.guards[0]!.state === 'SEARCH', 40);
    const lost = r.logs.find((l) => l.eventType === 'GUARD_LOST');
    expect(lost).toBeDefined();
    expect(lost!.details).toContain('(6,2)');
  });

  it('既存5ステージのサンプル解答の結果は Phase 8 以前と同じ', () => {
    const expected: Record<string, number> = { stage_01: 61, stage_02: 92, stage_03: 121, stage_04: 101, stage_05: 144 };
    for (const s of getStages()) {
      if (!(s.id in expected)) continue;
      const { world } = simulate(s, s.solution!);
      expect(world.result?.status).toBe('SUCCESS');
      expect(world.tick).toBe(expected[s.id]);
    }
  });
});
