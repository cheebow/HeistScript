import { describe, expect, it } from 'vitest';
import { parse } from '../../src/core/hsl/parser';
import { compileScript } from '../../src/core/hsl/compile';
import { HslSyntaxError } from '../../src/core/hsl/errors';
import { getStage } from '../../src/core/stages';

function syntaxError(src: string): HslSyntaxError {
  try {
    parse(src);
  } catch (e) {
    if (e instanceof HslSyntaxError) return e;
    throw e;
  }
  throw new Error('エラーが発生しませんでした');
}

describe('HSL パーサ', () => {
  it('コメントと空行を無視する', () => {
    const p = parse('# コメント\n\nmove jewel # 末尾コメント\n\nsteal jewel\n');
    expect(p.blocks[0]!.length).toBe(2);
    expect(p.blocks[0]![0]).toMatchObject({ kind: 'action', command: 'move', target: 'jewel', line: 3 });
  });

  it('if/else/while を解析する', () => {
    const p = parse('if guard_visible and not safe\n  wait 1\nelse\n  move exit\nend\nwhile not at_exit\n  wait 2\nend\n');
    const main = p.blocks[0]!;
    expect(main[0]!.kind).toBe('if');
    expect(main[1]!.kind).toBe('while');
    const ifs = main[0]! as Extract<typeof main[number], { kind: 'if' }>;
    expect(ifs.cond).toMatchObject({ kind: 'and' });
    expect(p.blocks[ifs.thenBlock]![0]).toMatchObject({ kind: 'wait', ticks: 1 });
    expect(p.blocks[ifs.elseBlock!]![0]).toMatchObject({ kind: 'action', command: 'move' });
  });

  it('wait until と signal_received を解析する', () => {
    const p = parse('wait until signal_received(ready) or guard_away\n');
    expect(p.blocks[0]![0]).toMatchObject({ kind: 'waitUntil', cond: { kind: 'or' } });
  });

  it('on spotted ハンドラ', () => {
    const p = parse('on spotted\n  move exit\n  resume\nend\nmove jewel\n');
    expect(p.handlers.spotted).toBeDefined();
    expect(p.blocks[p.handlers.spotted!.blockId]!.length).toBe(2);
    expect(p.blocks[0]!.length).toBe(1);
  });

  it('終端忘れは行列つきエラー', () => {
    const e = syntaxError('move jewel\nif safe\n  wait 1\n');
    expect(e.line).toBe(2);
    expect(e.message).toContain('end');
  });

  it('不明な命令', () => {
    const e = syntaxError('move jewel\njump exit\n');
    expect(e.line).toBe(2);
    expect(e.col).toBe(1);
    expect(e.message).toContain('jump');
  });

  it('引数不足', () => {
    const e = syntaxError('move\n');
    expect(e.line).toBe(1);
    expect(e.message).toContain('move');
  });

  it('余分なトークン', () => {
    const e = syntaxError('move jewel now\n');
    expect(e.col).toBe(12);
  });

  it('resume はハンドラ外で禁止', () => {
    const e = syntaxError('resume\n');
    expect(e.message).toContain('resume');
  });

  it('同じイベントの二重定義', () => {
    const e = syntaxError('on spotted\nend\non spotted\nend\n');
    expect(e.line).toBe(3);
  });

  it('大文字小文字を区別する', () => {
    const e = syntaxError('Move jewel\n');
    expect(e.message).toContain('Move');
  });
});

describe('HSL 意味検査', () => {
  const stage = getStage('stage_01')!;
  it('存在しないIDはエラー', () => {
    const r = compileScript('move vault\n', stage);
    expect(r.program).toBeNull();
    expect(r.errors[0]!.message).toContain('vault');
    expect(r.errors[0]!.line).toBe(1);
  });
  it('未解禁命令はエラー', () => {
    const r = compileScript('move jewel\nhide\n', stage);
    expect(r.program).toBeNull();
    expect(r.errors[0]!.line).toBe(2);
    expect(r.errors[0]!.message).toContain('hide');
  });
  it('正しいコードは通る', () => {
    const r = compileScript('move jewel\nsteal jewel\nmove exit\n', stage);
    expect(r.program).not.toBeNull();
    expect(r.errors).toEqual([]);
  });
});
