/**
 * Phase 7 監査用テスト: ランダムな HSL スクリプトに対する堅牢性、決定性、性能。
 * 乱数はテスト内の固定 seed LCG のみ（コアには乱数を持ち込まない）。
 */
import { describe, expect, it } from 'vitest';
import { createRun, simulate } from '../../src/core/runner';
import { getStages } from '../../src/core/stages';
import type { StageDefinition } from '../../src/core/model/stage';
import { makeStage } from './helpers';

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const PREDS = ['guard_visible', 'guard_near', 'guard_away', 'has_treasure', 'safe', 'at_exit', 'true', 'false', 'not safe', 'guard_near and not safe', 'signal_received(go)'];

function randomProgram(stage: StageDefinition, rnd: () => number, depth = 0): string {
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]!;
  const targets = ['exit', ...stage.waypoints.map((w) => w.id), ...stage.objects.map((o) => o.id), ...stage.guards.map((g) => g.id), ...stage.thieves.map((t) => t.id)];
  const treasures = stage.objects.filter((o) => o.type === 'treasure').map((o) => o.id);
  const doors = stage.objects.filter((o) => o.type === 'door').map((o) => o.id);
  const guards = stage.guards.map((g) => g.id);
  const lines: string[] = [];
  const n = 1 + Math.floor(rnd() * 6);
  for (let i = 0; i < n; i++) {
    const r = rnd();
    if (r < 0.25) lines.push(`move ${pick(targets)}`);
    else if (r < 0.35 && treasures.length) lines.push(`steal ${pick(treasures)}`);
    else if (r < 0.45) lines.push(`wait ${Math.floor(rnd() * 8)}`);
    else if (r < 0.55) lines.push(`wait until ${pick(PREDS)}`);
    else if (r < 0.6) lines.push('hide');
    else if (r < 0.65 && guards.length) lines.push(`knockout ${pick(guards)}`);
    else if (r < 0.7 && guards.length) lines.push(`carry ${pick(guards)}`);
    else if (r < 0.73) lines.push('drop');
    else if (r < 0.78 && doors.length) lines.push(`open ${pick(doors)}`);
    else if (r < 0.83) lines.push('signal go');
    else if (r < 0.9 && depth < 2) lines.push(`if ${pick(PREDS)}`, randomProgram(stage, rnd, depth + 1), 'else', randomProgram(stage, rnd, depth + 1), 'end');
    else if (depth < 2) lines.push(`while ${pick(PREDS)}`, randomProgram(stage, rnd, depth + 1), rnd() < 0.7 ? 'wait 1' : '', 'end');
  }
  return lines.join('\n');
}

function withHandlers(stage: StageDefinition, rnd: () => number): string {
  let src = randomProgram(stage, rnd);
  if (rnd() < 0.5) src = `on spotted\n${randomProgram(stage, rnd)}\n${rnd() < 0.5 ? 'resume\n' : ''}end\n` + src;
  if (rnd() < 0.3) src = `on alarm\n${randomProgram(stage, rnd)}\nend\n` + src;
  return src;
}

describe('監査: ランダムスクリプトに対する堅牢性', () => {
  const stages = getStages().map((s) => ({ ...s, unlockedCommands: ['move', 'steal', 'wait', 'hide', 'knockout', 'carry', 'drop', 'open', 'signal', 'resume', 'if', 'while', 'on'] }));

  it('400 本のランダムスクリプトで例外なく終了し、tick 上限を超えず、2回実行の結果が一致する', () => {
    const rnd = lcg(20261027);
    let compiled = 0;
    const outcomes: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      const stage = stages[i % stages.length]!;
      const scripts: Record<string, string> = {};
      for (const t of stage.thieves) scripts[t.id] = withHandlers(stage, rnd);
      const r = createRun(stage, scripts);
      if (!r.run) continue; // 意味エラー（存在しない対象など）はスキップ
      compiled++;
      const run = r.run;
      expect(() => run.runToEnd()).not.toThrow();
      expect(run.world.result).not.toBeNull();
      expect(run.world.tick).toBeLessThanOrEqual(stage.maxTicks);
      const status = run.world.result!.status;
      outcomes[status] = (outcomes[status] ?? 0) + 1;
      // 決定性
      const again = createRun(stage, scripts).run!;
      again.runToEnd();
      expect(JSON.stringify(again.world)).toBe(JSON.stringify(run.world));
      // タイル重複（出口以外）がない
      const w = run.world;
      for (const a of w.thieves) for (const b of w.thieves) {
        if (a.id < b.id && a.x === b.x && a.y === b.y && !(a.x === w.exit.x && a.y === w.exit.y)) throw new Error(`thief overlap in run ${i}`);
      }
    }
    expect(compiled).toBeGreaterThan(200);
    expect(Object.keys(outcomes).length).toBeGreaterThan(1);
  }, 60_000);
});

describe('監査: 性能', () => {
  it('32×24 / 警備員10 / 怪盗2 / カメラ10 の 1000 tick が 2 秒以内', () => {
    const tiles: string[] = [];
    for (let y = 0; y < 24; y++) {
      let row = '';
      for (let x = 0; x < 32; x++) row += x === 0 || y === 0 || x === 31 || y === 23 || (x % 8 === 4 && y % 6 === 3) ? '#' : '.';
      tiles.push(row);
    }
    const guards = Array.from({ length: 10 }, (_, i) => ({
      id: `guard_${i}`,
      x: 2 + i * 2,
      y: 2 + (i % 3) * 5,
      direction: 'right' as const,
      patrolRoute: [
        { x: 2 + i * 2, y: 20, waitTicks: 2 },
        { x: 2 + i * 2, y: 2 + (i % 3) * 5, waitTicks: 2 },
      ],
    }));
    const cameras = Array.from({ length: 10 }, (_, i) => ({ id: `cam_${i}`, x: 3 + i * 2, y: 0, direction: 'down' as const, range: 5, rotateEveryTicks: 10 }));
    const stage = makeStage(tiles, {
      thieves: [
        { id: 'thief_a', x: 30, y: 22, direction: 'left', starterScript: '' },
        { id: 'thief_b', x: 29, y: 22, direction: 'left', starterScript: '' },
      ],
      guards,
      cameras,
      objects: [{ id: 'gem', type: 'treasure', x: 1, y: 1 }],
      exit: { x: 30, y: 1 },
      maxTicks: 1000,
    });
    const scripts = {
      thief_a: 'on spotted\n  wait 3\n  resume\nend\nwhile true\n  move gem\n  wait 2\n  move exit\n  wait 2\nend\n',
      thief_b: 'while true\n  move exit\n  wait 1\n  move gem\n  wait 1\nend\n',
    };
    const t0 = performance.now();
    const { world } = simulate(stage, scripts);
    const ms = performance.now() - t0;
    expect(world.tick).toBeGreaterThan(0);
    expect(ms).toBeLessThan(2000);
    console.log(`perf: ${world.tick} ticks in ${ms.toFixed(0)} ms (${(ms / world.tick).toFixed(2)} ms/tick), result=${world.result?.status}`);
  }, 60_000);
});
