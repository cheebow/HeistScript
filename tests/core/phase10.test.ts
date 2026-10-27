import { describe, expect, it } from 'vitest';
import { exprToString, collectPredicates } from '../../src/core/hsl/ast';
import { suggestId } from '../../src/core/hsl/analyzer';
import { compileScript } from '../../src/core/hsl/compile';
import { parse } from '../../src/core/hsl/parser';
import { DEFAULT_CONFIG } from '../../src/core/model/config';
import { createRun, simulate } from '../../src/core/runner';
import { getStage } from '../../src/core/stages';
import { explainThief } from '../../src/ui/explain';
import { formatHsl } from '../../src/ui/format';
import { makeStage } from './helpers';

describe('整形', () => {
  it('ブロックの深さでインデントし、コメントと空行を保つ', () => {
    const src = 'on spotted\nmove safe\n  resume\nend\n\n# c\nif safe\nwait 1\nelse\nwhile true\nwait 1\nend\nend\nmove exit';
    expect(formatHsl(src)).toBe('on spotted\n  move safe\n  resume\nend\n\n# c\nif safe\n  wait 1\nelse\n  while true\n    wait 1\n  end\nend\nmove exit\n');
  });
  it('整形してもパース結果が変わらない', () => {
    const src = 'if guard_near and not safe\nhide\nend\nwhile not at_exit\nmove exit\nend\n';
    const strip = (v: unknown) => JSON.stringify(v, (k, val) => (k === 'col' ? undefined : val));
    expect(strip(parse(formatHsl(src)).blocks)).toBe(strip(parse(src).blocks));
  });
});

describe('式の文字列化・候補提示', () => {
  it('exprToString は HSL 表記に戻す', () => {
    const p = parse('wait until (guard_near or signal_received(go)) and not safe\n');
    const stmt = p.blocks[0]![0]!;
    expect(stmt.kind).toBe('waitUntil');
    if (stmt.kind === 'waitUntil') {
      expect(exprToString(stmt.cond)).toBe('(guard_near or signal_received(go)) and not safe');
      expect(collectPredicates(stmt.cond).map((x) => x.name)).toEqual(['guard_near', 'signal_received', 'safe']);
    }
  });
  it('suggestId は近い ID を返し、遠ければ null', () => {
    expect(suggestId('jewl', ['jewel', 'exit', 'pillar'])).toBe('jewel');
    expect(suggestId('Exit', ['jewel', 'exit'])).toBe('exit');
    expect(suggestId('vault', ['jewel', 'exit'])).toBeNull();
  });
  it('未定義 ID のエラーに「もしかして」が付く', () => {
    const r = compileScript('move jewl\n', getStage('stage_01')!);
    expect(r.errors[0]!.message).toContain('もしかして: jewel');
  });
});

describe('なぜ動かないかの説明', () => {
  const stage = () =>
    makeStage(['##########', '#........#', '#........#', '##########'], {
      thieves: [
        { id: 'thief_a', x: 1, y: 1, direction: 'right', starterScript: '' },
        { id: 'thief_b', x: 8, y: 1, direction: 'left', starterScript: '' },
      ],
      guards: [{ id: 'guard_1', x: 8, y: 2, direction: 'left', patrolRoute: [] }],
      exit: { x: 1, y: 2 },
    });

  it('合図待ちは「まだ誰も送っていない」と説明する', () => {
    const r = createRun(stage(), { thief_a: 'wait until signal_received(go)\n', thief_b: 'wait 50\n' }).run!;
    r.step();
    const ex = explainThief(r.world, r.world.thieves[0]!, r.world.vms[0], r.programs['thief_a'], DEFAULT_CONFIG, r.logs);
    expect(ex.doing).toContain('条件待ち');
    expect(ex.waiting?.expr).toBe('signal_received(go)');
    expect(ex.waiting?.value).toBe(false);
    expect(ex.why.join(' ')).toContain('合図 go');
  });

  it('条件不成立は偽の述語名を挙げる', () => {
    const r = createRun(stage(), { thief_a: 'wait until at_exit and guard_away\n', thief_b: 'wait 50\n' }).run!;
    r.step();
    const ex = explainThief(r.world, r.world.thieves[0]!, r.world.vms[0], r.programs['thief_a'], DEFAULT_CONFIG, r.logs);
    expect(ex.why.join(' ')).toContain('at_exit');
    expect(ex.predicates.find((p) => p.name === 'guard_away')?.value).toBe(true);
  });

  it('スクリプト終了時は足りないことを示す', () => {
    const r = createRun(stage(), { thief_a: 'wait 1\n', thief_b: 'wait 50\n' }).run!;
    r.step();
    r.step();
    const ex = explainThief(r.world, r.world.thieves[0]!, r.world.vms[0], r.programs['thief_a'], DEFAULT_CONFIG, r.logs);
    expect(ex.doing).toBe('スクリプト終了');
    expect(ex.why.join(' ')).toContain('move exit');
  });

  it('エラー停止は原因と対処を示す', () => {
    const { run, world } = simulate(stage(), { thief_a: 'hide\n', thief_b: 'wait 50\n' });
    const ex = explainThief(world, world.thieves[0]!, world.vms[0], run.programs['thief_a'], DEFAULT_CONFIG, run.logs);
    expect(ex.doing).toBe('エラーで停止');
    expect(ex.why[0]).toContain('対処');
  });
});
