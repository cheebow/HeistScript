import { describe, expect, it } from 'vitest';
import { compileScript } from '../../src/core/hsl/compile';
import { createRun } from '../../src/core/runner';
import { makeStage } from './helpers';

describe('座標指定の move / distract', () => {
  const stage = () =>
    makeStage(['##########', '#........#', '#..#.....#', '#........#', '##########'], {
      thieves: [{ id: 'thief_a', x: 1, y: 1, direction: 'right', starterScript: '' }],
      guards: [{ id: 'g', x: 8, y: 3, direction: 'down', patrolRoute: [{ x: 8, y: 3, waitTicks: 0 }] }],
      objects: [{ id: 'jewel', type: 'treasure', x: 8, y: 1, required: true }],
      exit: { x: 1, y: 3 },
    });

  it('move x,y で座標へ移動できる', () => {
    const r = createRun(stage(), { thief_a: 'move 5,1\nwait 2\n' }).run!;
    r.runToEnd();
    expect(r.world.thieves[0]!).toMatchObject({ x: 5, y: 1 });
  });

  it('壁やマップ外の座標は編集時のエラーになる', () => {
    expect(compileScript('move 3,2\n', stage()).errors.map((e) => e.message).join()).toContain('壁');
    expect(compileScript('move 30,1\n', stage()).errors.map((e) => e.message).join()).toContain('マップの外');
    expect(compileScript('move 3;2\n', stage()).errors.length).toBeGreaterThan(0);
  });

  it('distract x,y で座標に物音を立てられる', () => {
    const r = createRun(stage(), { thief_a: 'move 5,1\ndistract 8,1\nwait 10\n' }).run!;
    r.runToEnd();
    expect(r.logs.some((l) => l.eventType === 'NOISE' && l.details.includes('(8,1)'))).toBe(true);
    expect(r.logs.some((l) => l.eventType === 'GUARD_INVESTIGATE')).toBe(true);
  });
});
