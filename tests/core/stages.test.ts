import { describe, expect, it } from 'vitest';
import { createRun, simulate } from '../../src/core/runner';
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
    }, 60_000); // 長いステージ（400 tick 超）は CI の遅い環境で 5 秒を超える

    it(`${s.id}: tick上限に達しても正常終了する`, () => {
      const scripts: Record<string, string> = {};
      for (const t of s.thieves) scripts[t.id] = 'while true\n  wait 5\nend\n';
      const { world } = simulate({ ...s, unlockedCommands: ['wait', 'while'] }, scripts);
      expect(world.result?.status).toBe('FAILED');
      // 開始位置で待ち続けても必ず正常終了する（tick 上限、または巡回中の警備員による逮捕）
      expect(world.tick).toBeLessThanOrEqual(s.maxTicks);
      if (!world.thieves.some((t) => t.captured)) expect(world.tick).toBe(s.maxTicks);
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

  it('stage_07〜11: 無策スクリプトは成功しない（警報・逮捕・停止）', () => {
    const naive: Record<string, Record<string, string>> = {
      stage_07: { thief_a: 'move jewel\nsteal jewel\nmove exit\n' },
      stage_08: { thief_a: 'move jewel\nsteal jewel\nmove exit\n' },
      stage_09: { thief_a: 'move jewel\nsteal jewel\nmove exit\n' },
      stage_10: { thief_a: 'move jewel\nsteal jewel\nmove exit\n' },
      stage_11: { thief_a: 'move plate\nwait 200\n', thief_b: 'wait 5\nmove jewel\nsteal jewel\nmove exit\n' },
    };
    for (const [id, scripts] of Object.entries(naive)) {
      const s = stages.find((x) => x.id === id)!;
      const { world } = simulate(s, scripts);
      expect(world.result?.status, id).not.toBe('SUCCESS');
    }
  });

  it('stage_07/09: サンプル解答は警報を鳴らさない', () => {
    for (const id of ['stage_07', 'stage_09']) {
      const s = stages.find((x) => x.id === id)!;
      const { world } = simulate(s, s.solution!);
      expect(world.stats.alarmCount, id).toBe(0);
      expect(world.stats.spottedCount, id).toBe(0);
    }
  });

  it('stage_08: 運ばずに眠らせるだけだと見つかる。運べば未発見', () => {
    const s = stages.find((x) => x.id === 'stage_08')!;
    const hidden = simulate(s, s.solution!).world;
    expect(hidden.result?.status).toBe('SUCCESS');
    expect(hidden.stats.spottedCount).toBe(0);
    const koOnly = simulate(s, { thief_a: 'move corner\nwait until guard_near\nwait until guard_away\nmove behind\nknockout guard_1\nmove jewel\nsteal jewel\nmove exit\n' }).world;
    expect(koOnly.stats.spottedCount).toBeGreaterThan(0);
  });

  it('stage_11: 連携と「見張りをおもりに」の両方が成立する', () => {
    const s = stages.find((x) => x.id === 'stage_11')!;
    const byId = Object.fromEntries(s.solutions!.map((sol) => [sol.id, simulate(s, sol.scripts).world]));
    expect(byId['coop']!.result?.status).toBe('SUCCESS');
    expect(byId['coop']!.stats.knockoutCount).toBe(0);
    expect(byId['weight']!.result?.status).toBe('SUCCESS');
    expect(byId['weight']!.stats.knockoutCount).toBe(1);
  });

  it('stage_17: 合図を待たずに動くと逮捕されるか、扉の前で止まる', () => {
    const s = stages.find((x) => x.id === 'stage_17')!;
    const naive = [
      { thief_a: 'move plate_a\nwait 300\n', thief_b: 'move jewel\nsteal jewel\nmove plate_b\nwait 100\n' },
      { thief_a: 'move plate_a\nwait until signal_received(got)\nmove exit\n', thief_b: 'wait 5\nmove jewel\nsteal jewel\nsignal got\nmove plate_b\nwait 100\n' },
    ];
    for (const scripts of naive) expect(simulate(s, scripts).world.result?.status).not.toBe('SUCCESS');
    const sol = simulate(s, s.solution!).world;
    expect(sol.result?.status).toBe('SUCCESS');
    expect(sol.stats.spottedCount).toBe(0);
  });

  it('stage_18: 怪盗 3 人。おとりなしでは盗む役が止まり、両方の解法が成立する', () => {
    const s = stages.find((x) => x.id === 'stage_18')!;
    expect(s.thieves).toHaveLength(3);
    const naive = { thief_a: 'move plate\nwait 300\n', thief_b: 'wait 5\nmove jewel\nsteal jewel\nmove exit\n', thief_c: 'move exit\n' };
    expect(simulate(s, naive).world.result?.status).not.toBe('SUCCESS');
    for (const sol of s.solutions!) {
      const w = simulate(s, sol.scripts).world;
      expect(w.result?.status).toBe('SUCCESS');
      expect(w.stats.knockoutCount).toBe(0);
    }
    expect(simulate(s, s.solutions![0]!.scripts).world.tick).toBeLessThanOrEqual(200);
  });

  it('stage_19〜23: 無策スクリプトは成功しないか、成功しても発見される', () => {
    const naive: Record<string, Record<string, string>> = {
      stage_19: { thief_a: 'move jewel\nsteal jewel\nmove exit\n' },
      stage_20: { thief_a: 'move office_in\nopen office_door\nmove keycard\nsteal keycard\nmove vault_in\nopen vault_door\nmove jewel\nsteal jewel\nmove exit\n' },
      stage_21: { thief_a: 'move ledge\ndistract crate_e\nwait 4\nmove jewel\nsteal jewel\nmove exit\n' },
      stage_22: { thief_a: 'move jewel\nsteal jewel\nmove exit\n' },
      stage_23: { thief_a: 'move keycard\nsteal keycard\nmove vault_in\nopen vault_door\nmove jewel\nsteal jewel\nmove exit\n', thief_b: 'wait 5\nmove exit\n' },
    };
    for (const [id, scripts] of Object.entries(naive)) {
      const s = stages.find((x) => x.id === id)!;
      const { world } = simulate(s, scripts);
      expect(world.result?.status !== 'SUCCESS' || world.stats.spottedCount > 0, id).toBe(true);
    }
  });

  it('stage_19〜23: サンプル解答は見つからずにクリアし、鍵なしでは金庫が開かない', () => {
    for (const id of ['stage_19', 'stage_20', 'stage_21', 'stage_22', 'stage_23']) {
      const s = stages.find((x) => x.id === id)!;
      const { world } = simulate(s, s.solution!);
      expect(world.result?.status, id).toBe('SUCCESS');
      expect(world.stats.spottedCount, id).toBe(0);
    }
    const s20 = stages.find((x) => x.id === 'stage_20')!;
    const noKey = simulate(s20, { thief_a: 'move vault_in\nopen vault_door\nmove jewel\nsteal jewel\nmove exit\n' }).world;
    expect(noKey.result?.status).toBe('STOPPED');
  });

  it('「宝物を順に取って出口へ」だけの無策スクリプトは、入門 3 面を除いて未発見では成功しない', () => {
    const trivial = new Set(['stage_01', 'stage_24', 'stage_34']); // 無策が正解そのものである入門面
    for (const s of stages) {
      if (trivial.has(s.id)) continue;
      const req = s.objects.filter((o) => o.type === 'treasure' && o.required !== false).map((o) => o.id);
      const scripts: Record<string, string> = {};
      s.thieves.forEach((t, i) => {
        scripts[t.id] = i === 0 ? req.map((id) => `move ${id}\nsteal ${id}\n`).join('') + 'move exit\n' : 'move exit\n';
      });
      const r = createRun(s, scripts);
      if (!r.run) continue;
      r.run.runToEnd();
      const w = r.run.world;
      expect(w.result?.status !== 'SUCCESS' || w.stats.spottedCount > 0 || w.stats.alarmCount > 0, s.id).toBe(true);
    }
  });

  it('登録済みの別解（solutions）はすべて成功する', () => {
    for (const s of stages) {
      for (const sol of s.solutions ?? []) {
        const { world } = simulate(s, sol.scripts);
        expect(world.result?.status, `${s.id}/${sol.id}`).toBe('SUCCESS');
      }
    }
  });

  it('stage_58/59: move と steal を分ける意味がある（隣から盗む／隠れたまま盗む）', () => {
    const s58 = stages.find((x) => x.id === 'stage_58')!;
    const naive58 = simulate(s58, { thief_a: 'move jewel\nsteal jewel\nmove exit\n' }).world;
    expect(naive58.stats.alarmCount).toBeGreaterThan(0);
    expect(naive58.result?.status).not.toBe('SUCCESS');
    const sol58 = simulate(s58, s58.solution!).world;
    expect(sol58.result?.status).toBe('SUCCESS');
    expect(sol58.stats.alarmCount).toBe(0);
    const s59 = stages.find((x) => x.id === 'stage_59')!;
    const naive59 = simulate(s59, { thief_a: 'move locker\nhide\nwait until guard_near\nwait until guard_away\nmove jewel\nsteal jewel\nmove exit\n' }).world;
    expect(naive59.stats.spottedCount).toBeGreaterThan(0);
    const sol59 = simulate(s59, s59.solution!).world;
    expect(sol59.result?.status).toBe('SUCCESS');
    expect(sol59.stats.spottedCount).toBe(0);
  });

  it('初期スクリプトのままではどのステージもクリアできない', () => {
    for (const s of stages) {
      const scripts: Record<string, string> = {};
      for (const t of s.thieves) scripts[t.id] = t.starterScript;
      const r = createRun(s, scripts);
      if (!r.run) continue; // コンパイルできない初期コードは「クリアできない」
      r.run.runToEnd();
      expect(r.run.world.result?.status, s.id).not.toBe('SUCCESS');
    }
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
