import { describe, expect, it } from 'vitest';
import { createRun, Run } from '../../src/core/runner';
import { makeStage } from './helpers';

/** 横長の部屋: 警備員が左右を巡回、怪盗は上段 */
function room() {
  return makeStage(
    [
      '################',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '################',
    ],
    {
      thieves: [{ id: 'thief_a', x: 6, y: 5, direction: 'right', starterScript: '' }],
      guards: [{ id: 'guard_1', x: 2, y: 5, direction: 'right', patrolRoute: [{ x: 12, y: 5, waitTicks: 2 }, { x: 2, y: 5, waitTicks: 2 }] }],
      exit: { x: 1, y: 1 },
      objects: [{ id: 'jewel', type: 'treasure', x: 14, y: 1 }],
    },
  );
}

function stepUntil(run: Run, pred: () => boolean, limit = 300): number {
  let n = 0;
  while (!pred() && !run.done && n < limit) {
    run.step();
    n++;
  }
  return n;
}

describe('警備員AI', () => {
  it('巡回→視認→追跡→見失う→捜索→巡回', () => {
    const stage = room();
    // 怪盗は壁際で待機し、後で視界の外へ逃げる
    const r = createRun(stage, { thief_a: 'move jewel\nwait 100\n' }).run!;
    const g = () => r.world.guards[0]!;
    expect(g().state).toBe('PATROL');
    r.step();
    // 初期状態で視界内（距離4・正面）なので tick1 末に視認→CHASE
    expect(g().state).toBe('CHASE');
    expect(g().chaseTargetId).toBe('thief_a');
    expect(r.world.stats.spottedCount).toBe(1);
    for (let i = 0; i < 8; i++) r.step();
    // 追跡中は対象の方を向き続けるので spotted は1回のまま
    expect(g().state).toBe('CHASE');
    expect(r.world.stats.spottedCount).toBe(1);
    // 怪盗が視界から消える（テスト用の直接操作: 隠れ状態にする）
    r.world.thieves[0]!.hidden = true;
    const lastSeen = { ...g().lastSeenPos! };
    const n = stepUntil(r, () => g().state === 'SEARCH', 60);
    expect(n).toBeLessThan(60);
    expect(g().x).toBe(lastSeen.x);
    expect(g().y).toBe(lastSeen.y);
    stepUntil(r, () => g().state === 'PATROL', 12);
    expect(g().state).toBe('PATROL');
  });

  it('巡回ポイントで指定tick待機し、ルートを循環する', () => {
    const stage = { ...room(), thieves: [{ id: 'thief_a', x: 1, y: 1, direction: 'right' as const, starterScript: '' }] };
    const r = createRun(stage, { thief_a: 'wait 200\n' }).run!;
    const g = () => r.world.guards[0]!;
    const n = stepUntil(r, () => g().x === 12 && g().y === 5, 100);
    expect(n).toBe(30); // 10タイル × 3tick
    r.step();
    r.step();
    expect(g().x).toBe(12); // 待機 2tick
    stepUntil(r, () => g().x === 2, 100);
    expect(g().direction).toBe('left');
  });
});

describe('捕獲', () => {
  function closeStage() {
    return makeStage(['########', '#......#', '#......#', '########'], {
      thieves: [{ id: 'thief_a', x: 4, y: 1, direction: 'left', starterScript: '' }],
      guards: [{ id: 'guard_1', x: 1, y: 1, direction: 'right', patrolRoute: [] }],
      exit: { x: 6, y: 2 },
    });
  }

  it('隣接1tickで準備、次tickも隣接なら捕獲成立で失敗', () => {
    const r = createRun(closeStage(), { thief_a: 'wait 50\n' }).run!;
    const g = () => r.world.guards[0]!;
    r.step(); // t1: 視認 → CHASE
    expect(g().state).toBe('CHASE');
    stepUntil(r, () => g().capture !== null, 20);
    const prepTick = r.world.tick;
    expect(g().capture!.targetId).toBe('thief_a');
    expect(r.world.result).toBeNull();
    r.step();
    expect(r.world.tick).toBe(prepTick + 1);
    expect(r.world.result?.status).toBe('FAILED');
    expect(r.world.thieves[0]!.captured).toBe(true);
  });

  it('離脱すると捕獲準備がキャンセルされる', () => {
    // 怪盗は追跡されつつ逃げ続ける（同速なので捕まらない）
    const stage = makeStage(['############', '#..........#', '#..........#', '############'], {
      thieves: [{ id: 'thief_a', x: 3, y: 1, direction: 'right', starterScript: '' }],
      guards: [{ id: 'guard_1', x: 1, y: 1, direction: 'right', patrolRoute: [] }],
      exit: { x: 10, y: 2 },
      waypoints: [{ id: 'far', x: 10, y: 1 }],
    });
    const r = createRun(stage, { thief_a: 'wait 2\nmove far\nwait 1\nmove exit\n' }).run!;
    const g = () => r.world.guards[0]!;
    stepUntil(r, () => g().capture !== null, 20);
    expect(g().capture).not.toBeNull();
    const t = r.world.tick;
    stepUntil(r, () => g().capture === null, 10);
    expect(r.world.tick).toBeGreaterThan(t);
    expect(r.world.result?.status ?? 'RUNNING').not.toBe('FAILED');
  });
});
