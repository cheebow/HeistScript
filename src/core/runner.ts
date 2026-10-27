import { compileScripts, type CompileAllResult } from './hsl/compile';
import type { Program } from './hsl/ast';
import { DEFAULT_CONFIG, type SimConfig } from './model/config';
import type { StageDefinition } from './model/stage';
import type { LogEntry, WorldState } from './model/types';
import { ReplayRecorder } from './replay/recorder';
import { createVmState, peekNextLine } from './sim/vm';
import { step } from './sim/step';
import { createWorld } from './stages/createWorld';
import type { SimContext } from './sim/context';

export interface StepOutcome {
  /** ブレークポイントで停止した（tick は進んでいない） */
  breakpoint: { thiefId: string; line: number } | null;
  /** ミッションが終了した */
  done: boolean;
}

/**
 * 1回の実行セッション。初期状態 + コンパイル済みプログラム + リプレイ記録を保持する。
 * 決定的: 同じステージとスクリプトからは常に同じ履歴が得られる。
 */
export class Run {
  readonly stage: StageDefinition;
  readonly programs: Record<string, Program>;
  readonly config: SimConfig;
  readonly world: WorldState;
  readonly recorder = new ReplayRecorder();
  readonly logs: LogEntry[] = [];
  readonly breakpoints = new Map<string, Set<number>>();
  private skipBreakpointOnce = false;
  private readonly ctx: SimContext;

  constructor(stage: StageDefinition, programs: Record<string, Program>, config: SimConfig = DEFAULT_CONFIG) {
    this.stage = stage;
    this.programs = programs;
    this.config = config;
    this.world = createWorld(stage);
    for (const t of this.world.thieves) this.world.vms.push(createVmState(t.id));
    this.ctx = { programs, config };
    this.recorder.record(this.world);
  }

  get done(): boolean {
    return this.world.result !== null;
  }

  /** ブレークポイントに当たるなら {thiefId,line} を返す */
  private checkBreakpoints(): { thiefId: string; line: number } | null {
    if (this.breakpoints.size === 0) return null;
    for (const vm of this.world.vms) {
      const bps = this.breakpoints.get(vm.thiefId);
      if (!bps || bps.size === 0) continue;
      const program = this.programs[vm.thiefId];
      if (!program) continue;
      const line = peekNextLine(vm, program);
      if (line !== null && bps.has(line)) return { thiefId: vm.thiefId, line };
    }
    return null;
  }

  /** 1tick 進める。ブレークポイントで停止する場合は tick を進めない。 */
  step(): StepOutcome {
    if (this.done) return { breakpoint: null, done: true };
    if (!this.skipBreakpointOnce) {
      const bp = this.checkBreakpoints();
      if (bp) {
        this.skipBreakpointOnce = true;
        return { breakpoint: bp, done: false };
      }
    }
    this.skipBreakpointOnce = false;
    step(this.world, this.ctx);
    for (const l of this.world.tickLog) this.logs.push(l);
    this.recorder.record(this.world);
    return { breakpoint: null, done: this.done };
  }

  /** 終了まで（または maxSteps まで）進める */
  runToEnd(maxSteps = 100000): WorldState {
    let n = 0;
    while (!this.done && n < maxSteps) {
      const r = this.step();
      if (r.breakpoint) this.skipBreakpointOnce = true;
      n++;
    }
    return this.world;
  }

  /** 指定tickの記録状態（閲覧専用） */
  snapshotAt(tick: number): WorldState | undefined {
    return this.recorder.at(tick);
  }
}

export interface CreateRunResult {
  run: Run | null;
  compile: CompileAllResult;
}

export function createRun(stage: StageDefinition, scripts: Record<string, string>, config: SimConfig = DEFAULT_CONFIG): CreateRunResult {
  const compile = compileScripts(stage, scripts);
  if (!compile.ok) return { run: null, compile };
  return { run: new Run(stage, compile.programs, config), compile };
}

/** スクリプトを実行し終了状態を返す（テスト・検証用） */
export function simulate(stage: StageDefinition, scripts: Record<string, string>, config: SimConfig = DEFAULT_CONFIG): { run: Run; world: WorldState } {
  const r = createRun(stage, scripts, config);
  if (!r.run) {
    const msgs = Object.entries(r.compile.errors)
      .map(([id, errs]) => `${id}: ` + errs.map((e) => `${e.line}:${e.col} ${e.message}`).join('; '))
      .join('\n');
    throw new Error('コンパイルエラー:\n' + msgs);
  }
  r.run.runToEnd();
  return { run: r.run, world: r.run.world };
}
