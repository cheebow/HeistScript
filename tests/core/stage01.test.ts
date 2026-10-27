import { describe, expect, it } from 'vitest';
import { createRun, simulate } from '../../src/core/runner';
import { getStage } from '../../src/core/stages';

const stage = () => getStage('stage_01')!;

describe('Stage 1', () => {
  it('サンプルスクリプトでクリアできる', () => {
    const { world } = simulate(stage(), stage().solution!);
    expect(world.result?.status).toBe('SUCCESS');
    expect(world.thieves[0]!.inventory).toEqual(['jewel']);
    expect(world.tick).toBeLessThan(100);
  });

  it('スターターコードは出口へ行かないため STOPPED', () => {
    const s = stage();
    const { world } = simulate(s, { thief_a: s.thieves[0]!.starterScript });
    expect(world.result?.status).toBe('STOPPED');
  });

  it('隣接していない宝物を steal すると ACTION_FAILED で停止', () => {
    const { world, run } = simulate(stage(), { thief_a: 'steal jewel\n' });
    expect(world.result?.status).toBe('STOPPED');
    expect(run.logs.some((l) => l.eventType === 'ACTION_FAILED' && l.scriptLine === 1)).toBe(true);
  });

  it('wait 0 は1tick消費する', () => {
    const { world } = simulate(stage(), { thief_a: 'wait 0\nwait 0\n' });
    // 2tick 待機 → 3tick目に SCRIPT_END → STOPPED
    expect(world.tick).toBe(3);
  });

  it('移動は 2tick/タイル', () => {
    const r = createRun(stage(), { thief_a: 'move hall\n' });
    const run = r.run!;
    run.step();
    expect(run.world.thieves[0]).toMatchObject({ x: 2, y: 1 });
    run.step();
    expect(run.world.thieves[0]).toMatchObject({ x: 3, y: 1 });
  });

  it('同一コードの100回実行で状態ハッシュが一致する', () => {
    const first = JSON.stringify(simulate(stage(), stage().solution!).world);
    for (let i = 0; i < 99; i++) {
      expect(JSON.stringify(simulate(stage(), stage().solution!).world)).toBe(first);
    }
  });

  it('コンパイルエラーがあると実行できない', () => {
    const r = createRun(stage(), { thief_a: 'move nowhere\n' });
    expect(r.run).toBeNull();
    expect(r.compile.errors['thief_a']![0]!.message).toContain('nowhere');
  });
});
