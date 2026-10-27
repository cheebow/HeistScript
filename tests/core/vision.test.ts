import { describe, expect, it } from 'vitest';
import { canSee, inCone, supercoverLine } from '../../src/core/sim/vision';
import { createWorld } from '../../src/core/stages/createWorld';
import { makeStage } from './helpers';

const open = () =>
  createWorld(
    makeStage([
      '############',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '############',
    ]),
  );

describe('視界', () => {
  it('正面は見え、背面は見えない', () => {
    const world = open();
    const viewer = { x: 5, y: 4, direction: 'right' as const, range: 5 };
    expect(canSee(world, viewer, { x: 8, y: 4 })).toBe(true);
    expect(canSee(world, viewer, { x: 2, y: 4 })).toBe(false);
    expect(canSee(world, viewer, { x: 5, y: 1 })).toBe(false); // 真横
  });

  it('90度円錐: 対角は含み、それより外は含まない', () => {
    expect(inCone({ x: 0, y: 0 }, 'up', { x: 2, y: -2 })).toBe(true);
    expect(inCone({ x: 0, y: 0 }, 'up', { x: 3, y: -2 })).toBe(false);
    expect(inCone({ x: 0, y: 0 }, 'up', { x: 0, y: 0 })).toBe(false);
    expect(inCone({ x: 0, y: 0 }, 'left', { x: -1, y: 1 })).toBe(true);
  });

  it('射程端: 距離5は見え、5を超えると見えない', () => {
    const world = open();
    const viewer = { x: 1, y: 4, direction: 'right' as const, range: 5 };
    expect(canSee(world, viewer, { x: 6, y: 4 })).toBe(true);
    expect(canSee(world, viewer, { x: 7, y: 4 })).toBe(false);
    // (4,3): 距離5 → 見える / (5,2): 距離 sqrt(20) → 見える / (5,1): sqrt(25)=5 → 境界で見える
    expect(canSee(world, viewer, { x: 5, y: 1 })).toBe(true); // forward4 >= lateral3、距離5 → 見える
  });

  it('壁と閉じた扉で遮断される', () => {
    const world = createWorld(
      makeStage(
        ['#########', '#...#...#', '#...D...#', '#.......#', '#########'],
        { objects: [{ id: 'door', type: 'door', x: 4, y: 2, open: false }] },
      ),
    );
    const viewer = { x: 1, y: 1, direction: 'right' as const, range: 6 };
    expect(canSee(world, viewer, { x: 6, y: 1 })).toBe(false); // 壁
    const v2 = { x: 2, y: 2, direction: 'right' as const, range: 6 };
    expect(canSee(world, v2, { x: 6, y: 2 })).toBe(false); // 閉扉
    world.objects[0]!.open = true;
    expect(canSee(world, v2, { x: 6, y: 2 })).toBe(true); // 開扉
    const v3 = { x: 1, y: 3, direction: 'right' as const, range: 6 };
    expect(canSee(world, v3, { x: 6, y: 3 })).toBe(true); // 下の通路は見える
  });

  it('supercover は角で両側を含む', () => {
    const line = supercoverLine({ x: 0, y: 0 }, { x: 2, y: 2 });
    expect(line).toContainEqual({ x: 1, y: 0 });
    expect(line).toContainEqual({ x: 0, y: 1 });
    expect(line[line.length - 1]).toEqual({ x: 2, y: 2 });
  });
});
