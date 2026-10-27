import { describe, expect, it } from 'vitest';
import { createRun, Run } from '../../src/core/runner';
import { findPath } from '../../src/core/sim/astar';
import { canSee } from '../../src/core/sim/vision';
import { createWorld } from '../../src/core/stages/createWorld';
import { validateStage } from '../../src/core/stages/validate';
import { makeStage } from './helpers';

function stepN(run: Run, n: number) {
  for (let i = 0; i < n && !run.done; i++) run.step();
}

describe('通風口（V タイル）', () => {
  const stage = () =>
    makeStage(['#########', '#..VVV..#', '#.......#', '#########'], {
      thieves: [{ id: 'thief_a', x: 1, y: 1, direction: 'right', starterScript: '' }],
      guards: [{ id: 'guard_1', x: 7, y: 1, direction: 'left', patrolRoute: [{ x: 1, y: 2, waitTicks: 0 }, { x: 7, y: 1, waitTicks: 0 }] }],
      exit: { x: 7, y: 2 },
      waypoints: [{ id: 'inside', x: 4, y: 1 }],
    });

  it('怪盗は通れるが警備員は通れない（経路は下の列へ回る）', () => {
    const world = createWorld(stage());
    const thiefPath = findPath(world, { x: 1, y: 1 }, { x: 7, y: 1 }, { mover: 'thief' })!;
    const guardPath = findPath(world, { x: 7, y: 1 }, { x: 1, y: 1 }, { mover: 'guard' })!;
    expect(thiefPath.length).toBe(6);
    expect(guardPath.length).toBeGreaterThan(6);
    expect(guardPath.some((p) => p.y === 1 && p.x >= 3 && p.x <= 5)).toBe(false);
  });

  it('通風口の中にいる怪盗は隣からでも見えず、視線も遮られる', () => {
    const r = createRun(stage(), { thief_a: 'move inside\nwait 30\n' }).run!;
    stepN(r, 8);
    expect(r.world.thieves[0]!).toMatchObject({ x: 4, y: 1 });
    const viewer = { x: 6, y: 1, direction: 'left' as const, range: 5 };
    expect(canSee(r.world, viewer, { x: 4, y: 1 })).toBe(false);
    expect(canSee(r.world, viewer, { x: 2, y: 1 })).toBe(false); // 通風口の向こう側も見えない
    stepN(r, 30);
    expect(r.world.stats.spottedCount).toBe(0);
  });

  it('警備員の巡回点が通風口でしか繋がっていなければ検証エラー', () => {
    const r = validateStage({
      ...stage(),
      tiles: ['#########', '#..VVV..#', '#########'],
      height: 3,
      guards: [{ id: 'guard_1', x: 1, y: 1, direction: 'right', patrolRoute: [{ x: 7, y: 1, waitTicks: 0 }] }],
      exit: { x: 7, y: 1 },
    });
    expect(r.ok).toBe(false);
  });
});

describe('カードキーと施錠扉', () => {
  const stage = () =>
    makeStage(['########', '#..D..E#', '#..#####', '########'], {
      thieves: [{ id: 'thief_a', x: 1, y: 1, direction: 'right', starterScript: '' }],
      objects: [
        { id: 'door_1', type: 'door', x: 3, y: 1, open: false, locked: true },
        { id: 'key_1', type: 'key', x: 1, y: 2, unlocks: 'door_1' },
      ],
      exit: { x: 6, y: 1 },
      waypoints: [{ id: 'front', x: 2, y: 1 }],
    });

  it('鍵なしでは開かず、理由に鍵の入手方法が出る', () => {
    const r = createRun(stage(), { thief_a: 'move front\nopen door_1\nmove exit\n' }).run!;
    r.runToEnd();
    expect(r.world.result?.status).toBe('STOPPED');
    const fail = r.logs.find((l) => l.eventType === 'ACTION_FAILED')!;
    expect(fail.details).toContain('施錠');
    expect(fail.details).toContain('steal key_1');
    expect(r.world.objects.find((o) => o.id === 'door_1')!.open).toBe(false);
  });

  it('鍵を steal してから open すれば開いて脱出できる', () => {
    const r = createRun(stage(), { thief_a: 'move key_1\nsteal key_1\nmove front\nopen door_1\nmove exit\n' }).run!;
    r.runToEnd();
    expect(r.world.result?.status).toBe('SUCCESS');
    const door = r.world.objects.find((o) => o.id === 'door_1')!;
    expect(door.locked).toBe(false);
    expect(door.open).toBe(true);
    expect(r.world.thieves[0]!.inventory).toContain('key_1');
    expect(r.logs.some((l) => l.eventType === 'OPEN' && l.details.includes('鍵で'))).toBe(true);
  });

  it('鍵のない施錠扉はステージ検証エラー', () => {
    const r = validateStage({ ...stage(), objects: [{ id: 'door_1', type: 'door', x: 3, y: 1, open: false, locked: true }] });
    expect(r.ok).toBe(false);
  });
});

describe('distract（物音）', () => {
  const stage = () =>
    makeStage(['###########', '#H........#', '#.........#', '#.........#', '###########'], {
      thieves: [{ id: 'thief_a', x: 1, y: 1, direction: 'right', starterScript: '' }],
      guards: [{ id: 'guard_1', x: 8, y: 2, direction: 'right', patrolRoute: [{ x: 8, y: 2, waitTicks: 0 }] }],
      exit: { x: 1, y: 3 },
      waypoints: [
        { id: 'spot', x: 5, y: 3 },
        { id: 'far', x: 9, y: 1 },
        { id: 'quiet', x: 1, y: 3 },
      ],
    });

  it('距離 6 以内の地点に物音を立てると、聞こえた警備員が調べに来てから持ち場に戻る', () => {
    const r = createRun(stage(), { thief_a: 'distract spot\nhide\nwait 40\n' }).run!;
    stepN(r, 2);
    const g = r.world.guards[0]!;
    expect(g.state).toBe('INVESTIGATE');
    expect(g.targetPos).toEqual({ x: 5, y: 3 });
    expect(r.logs.some((l) => l.eventType === 'NOISE')).toBe(true);
    stepN(r, 30);
    expect(r.world.guards[0]!.state).toBe('PATROL');
    expect(r.world.stats.spottedCount).toBe(0);
  });

  it('遠すぎる地点には届かず、スクリプトは停止する', () => {
    const r = createRun(stage(), { thief_a: 'distract far\nwait 5\n' }).run!;
    r.runToEnd();
    expect(r.world.result?.status).toBe('STOPPED');
    expect(r.logs.find((l) => l.eventType === 'ACTION_FAILED')!.details).toContain('遠すぎ');
  });

  it('物音から距離 6 より遠い警備員には聞こえない', () => {
    const r = createRun(stage(), { thief_a: 'distract quiet\nwait 5\n' }).run!;
    stepN(r, 3);
    expect(r.world.guards[0]!.state).toBe('PATROL');
  });

  it('解禁されていないステージでは意味エラー', () => {
    const s = { ...stage(), unlockedCommands: ['move', 'wait'] };
    const r = createRun(s, { thief_a: 'distract spot\n' });
    expect(r.run).toBeNull();
    expect(JSON.stringify(r.compile.errors)).toContain('distract');
  });
});

describe('警備員ごとの視界', () => {
  const tiles = ['############', '#..........#', '#..........#', '############'];
  it('visionRange を広げると遠くの怪盗も見える', () => {
    const wide = makeStage(tiles, {
      thieves: [{ id: 'thief_a', x: 8, y: 1, direction: 'left', starterScript: '' }],
      guards: [{ id: 'guard_1', x: 1, y: 1, direction: 'right', patrolRoute: [{ x: 1, y: 1, waitTicks: 0 }], visionRange: 8 }],
      exit: { x: 10, y: 1 },
    });
    const r = createRun(wide, { thief_a: 'wait 3\n' }).run!;
    stepN(r, 2);
    expect(r.world.stats.spottedCount).toBe(1);
    const normal = makeStage(tiles, {
      thieves: [{ id: 'thief_a', x: 8, y: 1, direction: 'left', starterScript: '' }],
      guards: [{ id: 'guard_1', x: 1, y: 1, direction: 'right', patrolRoute: [{ x: 1, y: 1, waitTicks: 0 }] }],
      exit: { x: 10, y: 1 },
    });
    const r2 = createRun(normal, { thief_a: 'wait 3\n' }).run!;
    stepN(r2, 2);
    expect(r2.world.stats.spottedCount).toBe(0);
  });
});
