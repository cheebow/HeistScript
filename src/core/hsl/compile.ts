import type { StageDefinition } from '../model/stage';
import { analyze } from './analyzer';
import type { Program } from './ast';
import { HslSyntaxError, type HslError } from './errors';
import { parse } from './parser';

export interface CompileResult {
  program: Program | null;
  errors: HslError[];
}

/** 1怪盗分のスクリプトを解析・検査する。エラーがあれば program は null。 */
export function compileScript(source: string, stage: StageDefinition): CompileResult {
  let program: Program;
  try {
    program = parse(source);
  } catch (e) {
    if (e instanceof HslSyntaxError) return { program: null, errors: [e.toError()] };
    throw e;
  }
  const errors = analyze(program, stage);
  if (errors.length > 0) return { program: null, errors };
  return { program, errors: [] };
}

export interface CompileAllResult {
  ok: boolean;
  programs: Record<string, Program>;
  errors: Record<string, HslError[]>;
}

/** 全怪盗のスクリプトをコンパイル。1つでもエラーがあれば ok=false。 */
export function compileScripts(stage: StageDefinition, scripts: Record<string, string>): CompileAllResult {
  const programs: Record<string, Program> = {};
  const errors: Record<string, HslError[]> = {};
  let ok = true;
  for (const t of stage.thieves) {
    const src = scripts[t.id] ?? '';
    const r = compileScript(src, stage);
    if (r.program) programs[t.id] = r.program;
    else {
      ok = false;
      errors[t.id] = r.errors;
    }
  }
  return { ok, programs, errors };
}
