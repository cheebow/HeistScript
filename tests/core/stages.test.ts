import { describe, expect, it } from 'vitest';
import { simulate } from '../../src/core/runner';
import { getStages } from '../../src/core/stages';
import { validateStage } from '../../src/core/stages/validate';

describe('組み込みステージ', () => {
  const stages = getStages();

  it('全ステージが検証を通過する', () => {
    for (const s of stages) expect(validateStage(s).ok).toBe(true);
  });

  for (const s of stages) {
    it(`${s.id}: サンプル解答（最終ヒント）で成功する`, () => {
      expect(s.solution).toBeDefined();
      const { world } = simulate(s, s.solution!);
      expect(world.result?.status).toBe('SUCCESS');
      // 最終ヒントは solution と同じコードであること
      const lastHint = s.hints?.[s.hints.length - 1];
      expect(lastHint).toBeDefined();
      const hintScripts: Record<string, string> = {};
      const parts = (lastHint ?? '').split(/^--- (\w+) ---\n/m).filter((x) => x !== '');
      if (parts.length >= 2) for (let i = 0; i < parts.length; i += 2) hintScripts[parts[i]!] = parts[i + 1]!;
      else hintScripts[s.thieves[0]!.id] = lastHint ?? '';
      expect(simulate(s, hintScripts).world.result?.status).toBe('SUCCESS');
    });

    it(`${s.id}: 同一コードで100回実行しても結果が一致する`, () => {
      const first = JSON.stringify(simulate(s, s.solution!).world);
      for (let i = 0; i < 99; i++) expect(JSON.stringify(simulate(s, s.solution!).world)).toBe(first);
    });

    it(`${s.id}: tick上限に達しても正常終了する`, () => {
      const scripts: Record<string, string> = {};
      for (const t of s.thieves) scripts[t.id] = 'while true\n  wait 5\nend\n';
      const { world } = simulate({ ...s, unlockedCommands: ['wait', 'while'] }, scripts);
      expect(world.result?.status).toBe('FAILED');
      expect(world.tick).toBe(s.maxTicks);
    });
  }

  it('stage_02: 何も考えず進むと捕まる', () => {
    const s = stages.find((x) => x.id === 'stage_02')!;
    const { world } = simulate(s, { thief_a: 'move jewel\nsteal jewel\nmove exit\n' });
    expect(world.result?.status).toBe('FAILED');
    expect(world.stats.spottedCount).toBeGreaterThan(0);
    expect(world.thieves[0]!.captured).toBe(true);
  });

  it('stage_03: hide なしでは見つかる', () => {
    const s = stages.find((x) => x.id === 'stage_03')!;
    const { world } = simulate(s, { thief_a: 'move locker_a\nwait until guard_away\nmove jewel\nsteal jewel\nmove locker_b\nwait until guard_away\nmove exit\n' });
    expect(world.stats.spottedCount).toBeGreaterThan(0);
    expect(world.result?.status).not.toBe('SUCCESS');
  });
});
