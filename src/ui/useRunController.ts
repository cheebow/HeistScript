import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CompileAllResult } from '../core/hsl/compile';
import type { StageDefinition } from '../core/model/stage';
import type { LogEntry, WorldState } from '../core/model/types';
import { createRun, Run } from '../core/runner';

export type RunStatus = 'editing' | 'running' | 'paused' | 'finished';
export type Speed = 1 | 2 | 4;

export interface RunController {
  status: RunStatus;
  run: Run | null;
  /** 表示中のワールド（ライブまたはリプレイ） */
  world: WorldState | null;
  viewTick: number;
  liveTick: number;
  isReplay: boolean;
  speed: Speed;
  logs: LogEntry[];
  lastBreakpoint: { thiefId: string; line: number } | null;
  /** 状態更新ごとに増えるカウンタ（描画同期用） */
  version: number;
  start(scripts: Record<string, string>, autoPlay: boolean): CompileAllResult | null;
  play(): void;
  pause(): void;
  stepOnce(): void;
  seek(tick: number): void;
  reset(): void;
  setSpeed(s: Speed): void;
  setBreakpoints(thiefId: string, lines: Set<number>): void;
}

const BASE_INTERVAL_MS = 100;

export function useRunController(stage: StageDefinition | null, initialSpeed: Speed = 1): RunController {
  const runRef = useRef<Run | null>(null);
  const [status, setStatus] = useState<RunStatus>('editing');
  const [speed, setSpeedState] = useState<Speed>(initialSpeed);
  const [viewTick, setViewTick] = useState(0);
  const [version, setVersion] = useState(0);
  const [lastBreakpoint, setLastBreakpoint] = useState<{ thiefId: string; line: number } | null>(null);
  const breakpointsRef = useRef(new Map<string, Set<number>>());
  const viewTickRef = useRef(0);
  const statusRef = useRef<RunStatus>('editing');
  statusRef.current = status;

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const reset = useCallback(() => {
    runRef.current = null;
    viewTickRef.current = 0;
    setStatus('editing');
    setViewTick(0);
    setLastBreakpoint(null);
    bump();
  }, [bump]);

  useEffect(() => {
    reset();
  }, [stage, reset]);

  const applyBreakpoints = (run: Run) => {
    run.breakpoints.clear();
    for (const [id, lines] of breakpointsRef.current) run.breakpoints.set(id, new Set(lines));
  };

  const start = useCallback(
    (scripts: Record<string, string>, autoPlay: boolean) => {
      if (!stage) return null;
      const r = createRun(stage, scripts);
      if (!r.run) {
        runRef.current = null;
        setStatus('editing');
        bump();
        return r.compile;
      }
      applyBreakpoints(r.run);
      runRef.current = r.run;
      viewTickRef.current = 0;
      setViewTick(0);
      setLastBreakpoint(null);
      setStatus(autoPlay ? 'running' : 'paused');
      bump();
      return r.compile;
    },
    [stage, bump],
  );

  /** 1tick 進める（リプレイ閲覧中なら表示tickを進める） */
  const advance = useCallback((): boolean => {
    const run = runRef.current;
    if (!run) return false;
    if (viewTickRef.current < run.world.tick) {
      viewTickRef.current++;
      setViewTick(viewTickRef.current);
      bump();
      return true;
    }
    const out = run.step();
    if (out.breakpoint) {
      setLastBreakpoint(out.breakpoint);
      setStatus('paused');
      bump();
      return false;
    }
    viewTickRef.current = run.world.tick;
    setViewTick(run.world.tick);
    bump();
    if (out.done) {
      setStatus('finished');
      return false;
    }
    return true;
  }, [bump]);

  useEffect(() => {
    if (status !== 'running') return;
    const id = window.setInterval(() => {
      if (statusRef.current !== 'running') return;
      advance();
    }, BASE_INTERVAL_MS / speed);
    return () => window.clearInterval(id);
  }, [status, speed, advance]);

  const play = useCallback(() => {
    const run = runRef.current;
    if (!run) return;
    if (run.done && viewTickRef.current >= run.world.tick) return;
    setLastBreakpoint(null);
    setStatus('running');
  }, []);

  const pause = useCallback(() => {
    if (statusRef.current === 'running') setStatus('paused');
  }, []);

  const stepOnce = useCallback(() => {
    const run = runRef.current;
    if (!run) return;
    if (statusRef.current === 'running') setStatus('paused');
    setLastBreakpoint(null);
    advance();
  }, [advance]);

  const seek = useCallback(
    (tick: number) => {
      const run = runRef.current;
      if (!run) return;
      const t = Math.max(0, Math.min(tick, run.world.tick));
      viewTickRef.current = t;
      setViewTick(t);
      if (statusRef.current === 'running') setStatus('paused');
      bump();
    },
    [bump],
  );

  const setSpeed = useCallback((s: Speed) => setSpeedState(s), []);

  const setBreakpoints = useCallback(
    (thiefId: string, lines: Set<number>) => {
      breakpointsRef.current.set(thiefId, new Set(lines));
      if (runRef.current) applyBreakpoints(runRef.current);
      bump();
    },
    [bump],
  );

  const run = runRef.current;
  const world = useMemo(() => {
    void version;
    if (!run) return null;
    if (viewTick >= run.world.tick) return run.world;
    return run.snapshotAt(viewTick) ?? run.world;
  }, [run, viewTick, version]);

  // ログは全件返す（過去のコマを表示中は、先の tick の行を UI 側で薄く表示する）
  const logs = useMemo(() => {
    void version;
    if (!run) return [];
    return run.logs.slice();
  }, [run, version]);

  return {
    status,
    run,
    world,
    viewTick,
    liveTick: run ? run.world.tick : 0,
    isReplay: !!run && viewTick < run.world.tick,
    speed,
    logs,
    lastBreakpoint,
    version,
    start,
    play,
    pause,
    stepOnce,
    seek,
    reset,
    setSpeed,
    setBreakpoints,
  };
}
