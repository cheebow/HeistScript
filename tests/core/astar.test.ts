import { describe, expect, it } from 'vitest';
import { findPath } from '../../src/core/sim/astar';
import { createWorld } from '../../src/core/stages/createWorld';
import { makeStage } from './helpers';

describe('A*', () => {
  it('同距離経路は [up,right,down,left] の順で決定的に選ぶ', () => {
    const world = createWorld(
      makeStage(['######', '#....#', '#....#', '#....#', '######']),
    );
    const path = findPath(world, { x: 1, y: 1 }, { x: 3, y: 3 });
    expect(path).not.toBeNull();
    expect(path!.length).toBe(4);
    // 同じ結果が常に得られる
    const path2 = findPath(world, { x: 1, y: 1 }, { x: 3, y: 3 });
    expect(path2).toEqual(path);
    // 先頭は右 (up は壁)
    expect(path![0]).toEqual({ x: 2, y: 1 });
  });

  it('壁を回避する', () => {
    const world = createWorld(makeStage(['#######', '#..#..#', '#..#..#', '#.....#', '#######']));
    const path = findPath(world, { x: 1, y: 1 }, { x: 5, y: 1 });
    expect(path).not.toBeNull();
    expect(path!.length).toBe(8);
    for (const p of path!) expect(world.tiles[p.y]![p.x]).not.toBe('wall');
    expect(path![path!.length - 1]).toEqual({ x: 5, y: 1 });
  });

  it('到達不能なら null', () => {
    const world = createWorld(makeStage(['#######', '#..#..#', '#..#..#', '#..#..#', '#######'], { exit: { x: 1, y: 1 } }));
    expect(findPath(world, { x: 1, y: 1 }, { x: 5, y: 1 })).toBeNull();
  });

  it('動的閉塞タイルを避ける', () => {
    const world = createWorld(makeStage(['#######', '#.....#', '#.....#', '#######']));
    const blocked = new Set(['2,1']);
    const path = findPath(world, { x: 1, y: 1 }, { x: 5, y: 1 }, { blocked });
    expect(path).not.toBeNull();
    expect(path!.some((p) => p.x === 2 && p.y === 1)).toBe(false);
    expect(path!.length).toBe(6);
  });

  it('同一地点なら空配列', () => {
    const world = createWorld(makeStage(['#####', '#...#', '#...#', '#####']));
    expect(findPath(world, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([]);
  });
});
