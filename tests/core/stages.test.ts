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

  it('stage_06: 3 つの解法がそれぞれ成立し、指標が戦術に対応する', () => {
    const s = stages.find((x) => x.id === 'stage_06')!;
    const byId = Object.fromEntries(s.solutions!.map((sol) => [sol.id, simulate(s, sol.scripts).world]));
    const stealth = byId['stealth']!;
    const knockout = byId['knockout']!;
    const decoy = byId['decoy']!;
    expect(stealth.result?.status).toBe('SUCCESS');
    expect(stealth.stats.spottedCount).toBe(0);
    expect(stealth.stats.knockoutCount).toBe(0);
    expect(knockout.result?.status).toBe('SUCCESS');
    expect(knockout.stats.knockoutCount).toBe(1);
    expect(knockout.stats.spottedCount).toBe(0);
    expect(decoy.result?.status).toBe('SUCCESS');
    expect(decoy.stats.spottedCount).toBeGreaterThanOrEqual(1);
    expect(decoy.stats.knockoutCount).toBe(0);
    // 指標を記録（PHASE9_RESULTS に転記）
    console.log(`stage_06 metrics: stealth=${stealth.tick} knockout=${knockout.tick} decoy=${decoy.tick}`);
    // 無策では捕まる
    const naive = simulate(s, { thief_a: 'move jewel\nsteal jewel\nmove exit\n' }).world;
    expect(naive.result?.status).toBe('FAILED');
    expect(naive.thieves[0]!.captured).toBe(true);
  });

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
