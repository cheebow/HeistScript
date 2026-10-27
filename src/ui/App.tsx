import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compileScript } from '../core/hsl/compile';
import type { HslError } from '../core/hsl/errors';
import type { StageDefinition } from '../core/model/stage';
import { getStages } from '../core/stages';
import { createRepository, type SaveData } from '../storage/repository';
import { Editor } from './Editor';
import { describeTile } from './describeTile';
import { GameView } from './GameView';
import { ErrorList, HelpPanel, HintPanel, InspectorPanel, LogPanel } from './panels';
import { setStageCompletions } from './monaco/setup';
import { useRunController, type Speed } from './useRunController';

const repository = createRepository();

type SideTab = 'hint' | 'help';

export function App() {
  const stages = useMemo(() => getStages(), []);
  const [save, setSave] = useState<SaveData>(() => repository.load());
  const [stageId, setStageId] = useState<string>(() => save.settings.lastStageId && stages.some((s) => s.id === save.settings.lastStageId) ? save.settings.lastStageId : stages[0]!.id);
  const stage = useMemo(() => stages.find((s) => s.id === stageId) ?? stages[0]!, [stages, stageId]);
  const [scripts, setScripts] = useState<Record<string, string>>(() => initialScripts(stage, save));
  const [activeThief, setActiveThief] = useState<string>(stage.thieves[0]!.id);
  const [selectedId, setSelectedId] = useState<string | null>(stage.thieves[0]!.id);
  const [showVision, setShowVision] = useState(save.settings.showVision);
  const [sideTab, setSideTab] = useState<SideTab>('hint');
  const [breakpoints, setBreakpointsState] = useState<Record<string, Set<number>>>({});
  const [showResult, setShowResult] = useState(false);
  const [editorWidth, setEditorWidth] = useState(460);
  const ctl = useRunController(stage, save.settings.speed);
  const jumpRef = useRef<{ thiefId: string; line: number } | null>(null);

  // ステージ切替
  useEffect(() => {
    setScripts(initialScripts(stage, save));
    setActiveThief(stage.thieves[0]!.id);
    setSelectedId(stage.thieves[0]!.id);
    setBreakpointsState({});
    setShowResult(false);
    setStageCompletions(stage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // 保存
  const persist = useCallback(
    (mutate: (d: SaveData) => void) => {
      setSave((prev) => {
        const next = structuredClone(prev);
        mutate(next);
        repository.save(next);
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    persist((d) => {
      d.settings.lastStageId = stage.id;
      d.settings.showVision = showVision;
      d.settings.speed = ctl.speed;
    });
  }, [stage.id, showVision, ctl.speed, persist]);

  // コンパイル結果（エラー表示用）
  const compileErrors = useMemo(() => {
    const out: Record<string, HslError[]> = {};
    for (const t of stage.thieves) out[t.id] = compileScript(scripts[t.id] ?? '', stage).errors;
    return out;
  }, [scripts, stage]);
  const hasErrors = Object.values(compileErrors).some((e) => e.length > 0);

  const onScriptChange = useCallback(
    (thiefId: string, value: string) => {
      setScripts((prev) => {
        if (prev[thiefId] === value) return prev;
        return { ...prev, [thiefId]: value };
      });
      persist((d) => {
        const p = d.stages[stage.id] ?? { scripts: {}, cleared: false, bestTicks: null, challenges: [] };
        p.scripts[thiefId] = value;
        d.stages[stage.id] = p;
      });
      // コード変更は新しい実行としてリセット
      if (ctl.run) ctl.reset();
    },
    [persist, stage.id, ctl],
  );

  // E2E テスト用フック（コードを外部送信するものではない。ローカルのテストからのみ使用）
  useEffect(() => {
    const api = {
      setScript: (text: string, thiefId: string = activeThief) => onScriptChange(thiefId, text),
      getScript: (thiefId: string = activeThief) => scripts[thiefId] ?? '',
    };
    (window as unknown as { __heistTest?: typeof api }).__heistTest = api;
  }, [activeThief, onScriptChange, scripts]);

  /** 最終ヒントのサンプルコードをエディタへ。複数怪盗は `--- thief_id ---` 区切り */
  const insertSample = useCallback(
    (code: string) => {
      const parts = code.split(/^--- (\w+) ---\n/m).filter((x) => x !== '');
      if (parts.length >= 2) {
        for (let i = 0; i + 1 < parts.length; i += 2) onScriptChange(parts[i]!, parts[i + 1]!);
      } else {
        onScriptChange(activeThief, code);
      }
    },
    [onScriptChange, activeThief],
  );

  const startRun = useCallback(
    (autoPlay: boolean) => {
      const compile = ctl.start(scripts, autoPlay);
      if (compile && !compile.ok) return;
      setShowResult(false);
    },
    [ctl, scripts],
  );

  // 終了時の結果表示と記録
  const result = ctl.run?.world.result ?? null;
  useEffect(() => {
    if (ctl.status === 'finished' && result) {
      setShowResult(true);
      if (result.status === 'SUCCESS' && ctl.run) {
        const ticks = ctl.run.world.tick;
        const stats = ctl.run.world.stats;
        persist((d) => {
          const p = d.stages[stage.id] ?? { scripts: {}, cleared: false, bestTicks: null, challenges: [] };
          p.cleared = true;
          p.bestTicks = p.bestTicks === null ? ticks : Math.min(p.bestTicks, ticks);
          for (const c of stage.challenges) {
            const ok =
              (c.type === 'maxTicks' && c.value !== undefined && ticks <= c.value) ||
              (c.type === 'noSpotted' && stats.spottedCount === 0) ||
              (c.type === 'noKnockout' && stats.knockoutCount === 0) ||
              (c.type === 'noAlarm' && stats.alarmCount === 0);
            if (ok && !p.challenges.includes(c.id)) p.challenges.push(c.id);
          }
          d.stages[stage.id] = p;
        });
      }
    }
  }, [ctl.status, result, ctl.run, persist, stage]);

  const toggleBreakpoint = useCallback(
    (thiefId: string, line: number) => {
      setBreakpointsState((prev) => {
        const set = new Set(prev[thiefId] ?? []);
        if (set.has(line)) set.delete(line);
        else set.add(line);
        ctl.setBreakpoints(thiefId, set);
        return { ...prev, [thiefId]: set };
      });
    },
    [ctl],
  );

  const world = ctl.world;
  const activeVm = world?.vms.find((v) => v.thiefId === activeThief);
  const activeLine = ctl.run && activeVm ? activeVm.currentLine : null;
  const renderOptions = useMemo(() => ({ showVision, showPaths: true, selectedId }), [showVision, selectedId]);
  const previewWorld = useMemo(() => {
    if (world) return world;
    // 編集中は初期状態をプレビュー
    const r = ctl.run;
    void r;
    return null;
  }, [world, ctl.run]);
  const initialWorld = useMemo(() => {
    // 編集中プレビュー用の初期ワールド（VMなし）
    return createPreview(stage);
  }, [stage]);

  const progress = save.stages[stage.id];
  const statusLabel =
    ctl.status === 'editing' ? '編集中' : ctl.status === 'running' ? (ctl.isReplay ? 'リプレイ再生中' : '実行中') : ctl.status === 'paused' ? (ctl.isReplay ? 'リプレイ閲覧（閲覧専用）' : '一時停止') : '終了';

  // ドラッグで境界調整
  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = editorWidth;
    const move = (ev: MouseEvent) => setEditorWidth(Math.max(280, Math.min(900, startW + ev.clientX - startX)));
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <div className="app" style={{ ['--editor-width' as string]: `${editorWidth}px` }}>
      <header className="topbar">
        <div className="brand">
          <span className="logo">Heist</span>
          <span className="logo2">Script</span>
        </div>
        <label className="stage-select">
          ステージ
          <select value={stage.id} onChange={(e) => setStageId(e.target.value)} data-testid="stage-select">
            {stages.map((s, i) => (
              <option key={s.id} value={s.id}>
                {i + 1}. {s.title} {save.stages[s.id]?.cleared ? '✔' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="controls" role="group" aria-label="実行コントロール">
          <button
            className="primary"
            onClick={() => (ctl.status === 'running' ? ctl.pause() : ctl.run && ctl.status !== 'finished' ? ctl.play() : startRun(true))}
            disabled={hasErrors || (ctl.status === 'finished' && !ctl.isReplay)}
            data-testid="btn-play"
            title={hasErrors ? 'エラーを修正してください' : 'スクリプトを最初から実行する / 実行中は一時停止'}
          >
            {ctl.status === 'running' ? '一時停止' : ctl.run && ctl.status !== 'finished' ? '再開' : ctl.status === 'finished' && ctl.isReplay ? 'リプレイ再生' : '実行'}
          </button>
          <button
            onClick={() => {
              if (!ctl.run) startRun(false);
              ctl.stepOnce();
            }}
            disabled={hasErrors || (ctl.status === 'finished' && !ctl.isReplay)}
            data-testid="btn-step"
            title="時間を 1 コマ（1 tick = 0.1 秒）だけ進めて止める。動きを細かく確かめたいときに"
          >
            1コマ進める
          </button>
          <button onClick={() => startRun(false)} disabled={hasErrors} data-testid="btn-restart" title="最初の状態に戻して止める（コードは消えない）">
            最初に戻す
          </button>
          <div className="seg" role="radiogroup" aria-label="再生速度" title="再生速度（x1 = 1 秒に 10 tick）">
            {([1, 2, 4] as Speed[]).map((s) => (
              <button key={s} className={ctl.speed === s ? 'active' : ''} onClick={() => ctl.setSpeed(s)} aria-pressed={ctl.speed === s}>
                x{s}
              </button>
            ))}
          </div>
          <label className="timeline" title="経過時間。1 tick = 0.1 秒。スライダーで過去のコマに戻して見返せる（閲覧専用）">
            <span data-testid="tick-label">
              tick {ctl.viewTick}/{ctl.liveTick}
            </span>
            <input type="range" min={0} max={Math.max(ctl.liveTick, 1)} value={ctl.viewTick} onChange={(e) => ctl.seek(Number(e.target.value))} disabled={!ctl.run} data-testid="timeline" aria-label="タイムライン" />
          </label>
          <span className={`status status-${ctl.status}`} data-testid="run-status">
            {statusLabel}
          </span>
          <label className="toggle">
            <input type="checkbox" checked={showVision} onChange={(e) => setShowVision(e.target.checked)} /> 視界表示
          </label>
        </div>
      </header>

      <main className="main">
        <section className="editor-panel" aria-label="コードエディタ">
          <div className="tabs" role="tablist">
            {stage.thieves.map((t) => (
              <button key={t.id} role="tab" aria-selected={activeThief === t.id} className={activeThief === t.id ? 'active' : ''} onClick={() => { setActiveThief(t.id); setSelectedId(t.id); }}>
                {t.label ?? t.id} <span className="muted">{t.id}</span>
                {(compileErrors[t.id]?.length ?? 0) > 0 ? ' !' : ''}
              </button>
            ))}
            <span className="spacer" />
            <button
              className="subtle"
              onClick={() => {
                if (window.confirm(`${activeThief} のコードを初期状態に戻しますか？`)) {
                  onScriptChange(activeThief, stage.thieves.find((t) => t.id === activeThief)!.starterScript);
                }
              }}
              title="コード初期化"
            >
              コード初期化
            </button>
          </div>
          <Editor
            key={`${stage.id}:${activeThief}`}
            thiefId={activeThief}
            value={scripts[activeThief] ?? ''}
            onChange={(v) => onScriptChange(activeThief, v)}
            errors={compileErrors[activeThief] ?? []}
            activeLine={activeLine}
            breakpoints={breakpoints[activeThief] ?? new Set()}
            onToggleBreakpoint={(line) => toggleBreakpoint(activeThief, line)}
            readOnly={false}
          />
          <ErrorList errors={compileErrors[activeThief] ?? []} onJump={(line) => (jumpRef.current = { thiefId: activeThief, line })} />
          {ctl.lastBreakpoint && (
            <div className="notice" role="status">
              ブレークポイント: {ctl.lastBreakpoint.thiefId} の {ctl.lastBreakpoint.line} 行目の実行前で停止しました
            </div>
          )}
        </section>
        <div className="splitter" onMouseDown={onDragStart} role="separator" aria-orientation="vertical" title="ドラッグで幅を調整" />
        <section className="game-panel" aria-label="マップ">
          <div className="game-header">
            <h1>{stage.title}</h1>
            <span className="muted">{stage.description}</span>
            {progress?.cleared && <span className="badge">クリア済み（最良 {progress.bestTicks} tick）</span>}
          </div>
          <GameView
            world={previewWorld ?? initialWorld}
            options={renderOptions}
            version={ctl.version}
            onSelect={(id) => setSelectedId(id)}
            describeTile={(x, y) => describeTile(stage, previewWorld ?? initialWorld, x, y)}
          />
          {ctl.isReplay && <div className="replay-banner">過去のコマを表示中（閲覧専用）。やり直すには「最初に戻す」</div>}
          <div className="legend" aria-label="凡例">
            <span><i className="sw sw-thief" />怪盗</span>
            <span><i className="sw sw-guard" />警備員</span>
            <span><i className="sw sw-vision" />警備員の視界</span>
            <span><i className="sw sw-camera" />カメラの視界</span>
            <span><i className="sw sw-locker" />隠れ場所</span>
            <span><i className="sw sw-exit" />出口</span>
            <span><i className="sw sw-path" />移動予定の経路</span>
            <span className="muted">人物をクリックすると状態を表示</span>
          </div>
        </section>
      </main>

      <footer className="bottom">
        <LogPanel logs={ctl.logs} thiefIds={stage.thieves.map((t) => t.id)} guardIds={stage.guards.map((g) => g.id)} onJumpLine={(thiefId) => setActiveThief(thiefId)} />
        <InspectorPanel world={world} stage={stage} selectedId={selectedId} onSelect={setSelectedId} />
        <aside className="side-panel">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={sideTab === 'hint'} className={sideTab === 'hint' ? 'active' : ''} onClick={() => setSideTab('hint')}>
              ヒント
            </button>
            <button role="tab" aria-selected={sideTab === 'help'} className={sideTab === 'help' ? 'active' : ''} onClick={() => setSideTab('help')}>
              命令ヘルプ
            </button>
          </div>
          {sideTab === 'hint' ? <HintPanel stage={stage} onInsertSample={insertSample} /> : <HelpPanel stage={stage} />}
        </aside>
      </footer>

      {showResult && result && ctl.run && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="結果" data-testid="result-dialog">
          <div className={`modal result-${result.status}`}>
            <h2>
              {result.status === 'SUCCESS' ? 'ミッション成功' : result.status === 'FAILED' ? 'ミッション失敗' : '停止'}
            </h2>
            <p className="result-reason" data-testid="result-reason">
              {result.reason}
              {result.scriptLine ? `（${result.scriptLine}行目）` : ''}
            </p>
            <table className="stats">
              <tbody>
                <tr>
                  <td>経過tick</td>
                  <td>{ctl.run.world.tick}</td>
                </tr>
                <tr>
                  <td>発見回数</td>
                  <td>{ctl.run.world.stats.spottedCount}</td>
                </tr>
                <tr>
                  <td>気絶回数</td>
                  <td>{ctl.run.world.stats.knockoutCount}</td>
                </tr>
                <tr>
                  <td>警報回数</td>
                  <td>{ctl.run.world.stats.alarmCount}</td>
                </tr>
                <tr>
                  <td>実行命令数</td>
                  <td>{ctl.run.world.stats.instructionCount}</td>
                </tr>
              </tbody>
            </table>
            {result.status === 'SUCCESS' && stage.challenges.length > 0 && (
              <ul className="challenges">
                {stage.challenges.map((c) => (
                  <li key={c.id}>{save.stages[stage.id]?.challenges.includes(c.id) ? '★' : '☆'} {c.title ?? c.id}</li>
                ))}
              </ul>
            )}
            <div className="modal-actions">
              <button onClick={() => setShowResult(false)} data-testid="result-close">
                閉じる（リプレイを見る）
              </button>
              {result.status === 'SUCCESS' && stages.findIndex((s) => s.id === stage.id) < stages.length - 1 && (
                <button className="primary" onClick={() => { setShowResult(false); setStageId(stages[stages.findIndex((s) => s.id === stage.id) + 1]!.id); }} data-testid="result-next">
                  次のステージへ
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function initialScripts(stage: StageDefinition, save: SaveData): Record<string, string> {
  const saved = save.stages[stage.id]?.scripts ?? {};
  const out: Record<string, string> = {};
  for (const t of stage.thieves) out[t.id] = saved[t.id] ?? t.starterScript;
  return out;
}

import { createWorld } from '../core/stages/createWorld';
function createPreview(stage: StageDefinition) {
  return createWorld(stage);
}
