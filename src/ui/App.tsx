import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compileScript } from '../core/hsl/compile';
import type { HslError } from '../core/hsl/errors';
import type { StageDefinition } from '../core/model/stage';
import { getStages } from '../core/stages';
import { validateStage } from '../core/stages/validate';
import { createRepository, type SaveData } from '../storage/repository';
import { Editor } from './Editor';
import { describeTile } from './describeTile';
import { formatHsl } from './format';
import { explainThief } from './explain';
import { DEFAULT_CONFIG } from '../core/model/config';
import { audio, type SfxName } from '../game/audio';
import { TitleScreen } from './screens/TitleScreen';
import { StageSelect } from './screens/StageSelect';
import { Briefing } from './screens/Briefing';
import { GameView } from './GameView';
import { ErrorList, HelpPanel, HintPanel, InspectorPanel, LogPanel } from './panels';
import { setStageCompletions } from './monaco/setup';
import { useRunController, type Speed } from './useRunController';

const repository = createRepository();

type SideTab = 'hint' | 'help';

export function App() {
  const [save, setSave] = useState<SaveData>(() => repository.load());
  // カスタムステージは内容が同じなら同一オブジェクトを保つ（stage の同一性が変わると実行がリセットされるため）
  const customKey = useMemo(() => JSON.stringify(save.customStages), [save.customStages]);
  const stages = useMemo(() => {
    const builtIn = getStages();
    const custom: StageDefinition[] = [];
    for (const raw of JSON.parse(customKey) as unknown[]) {
      const r = validateStage(raw);
      if (r.ok && !builtIn.some((b) => b.id === r.stage.id) && !custom.some((c) => c.id === r.stage.id)) custom.push(r.stage);
    }
    return [...builtIn, ...custom];
  }, [customKey]);
  const [stageId, setStageId] = useState<string>(() => {
    const m = /^#stage=([A-Za-z0-9_]+)/.exec(typeof window !== 'undefined' ? window.location.hash : '');
    if (m && stages.some((s) => s.id === m[1])) return m[1]!;
    return save.settings.lastStageId && stages.some((s) => s.id === save.settings.lastStageId) ? save.settings.lastStageId : stages[0]!.id;
  });
  const stage = useMemo(() => stages.find((s) => s.id === stageId) ?? stages[0]!, [stages, stageId]);
  const [scripts, setScripts] = useState<Record<string, string>>(() => initialScripts(stage, save));
  const [activeThief, setActiveThief] = useState<string>(stage.thieves[0]!.id);
  const [selectedId, setSelectedId] = useState<string | null>(stage.thieves[0]!.id);
  const [showVision, setShowVision] = useState(save.settings.showVision);
  const [showCameraVision, setShowCameraVision] = useState(save.settings.showCameraVision);
  const [showPaths, setShowPaths] = useState(save.settings.showPaths);
  const [reducedMotion, setReducedMotion] = useState(save.settings.reducedMotion);
  const [zoom, setZoom] = useState<number>(save.settings.zoom);
  const [appliedZoom, setAppliedZoom] = useState<{ zoom: number; maxFit: number }>({ zoom: 1, maxFit: 1 });
  const [banner, setBanner] = useState<{ key: number; text: string; color?: string } | null>(null);
  const [bottomHeight, setBottomHeight] = useState(() => Math.max(160, Math.min(300, Math.round(window.innerHeight * 0.26))));
  const [bottomMinimized, setBottomMinimized] = useState(false);
  const [sideTab, setSideTab] = useState<SideTab>('hint');
  const [breakpoints, setBreakpointsState] = useState<Record<string, Set<number>>>({});
  const [showResult, setShowResult] = useState(false);
  const [showStageIO, setShowStageIO] = useState(false);
  // URL ハッシュ: #play でタイトルを飛ばしてゲーム画面、#stage=ID でそのステージを直接開く（テスト・共有用）
  const initialHash = typeof window !== 'undefined' ? window.location.hash : '';
  const [screen, setScreen] = useState<'title' | 'select' | 'game'>(initialHash.startsWith('#play') || initialHash.startsWith('#stage=') ? 'game' : 'title');
  const [showBriefing, setShowBriefing] = useState(false);
  const [soundOn, setSoundOn] = useState(save.settings.soundOn);
  const [volume, setVolume] = useState(save.settings.volume);
  const sfxIndexRef = useRef(0);
  const [importError, setImportError] = useState<string[] | null>(null);
  const [editorWidth, setEditorWidth] = useState(460);
  const editorManualRef = useRef(false);
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
      d.settings.showCameraVision = showCameraVision;
      d.settings.showPaths = showPaths;
      d.settings.reducedMotion = reducedMotion;
      d.settings.zoom = zoom as 0 | 1 | 2 | 3 | 4;
      d.settings.speed = ctl.speed;
      d.settings.soundOn = soundOn;
      d.settings.volume = volume;
    });
  }, [stage.id, showVision, showCameraVision, showPaths, reducedMotion, zoom, ctl.speed, soundOn, volume, persist]);

  // 音: 設定の反映、BGM の切替、効果音
  useEffect(() => {
    audio.setMuted(!soundOn);
    audio.setVolume(volume);
  }, [soundOn, volume]);
  useEffect(() => {
    audio.setBgm(screen !== 'game' ? 'plan' : ctl.status === 'running' && !ctl.isReplay ? 'infiltrate' : 'plan');
  }, [screen, ctl.status, ctl.isReplay]);
  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);
  useEffect(() => {
    const logs = ctl.logs;
    if (!ctl.run || ctl.isReplay) {
      sfxIndexRef.current = logs.length;
      return;
    }
    const SFX: Record<string, SfxName> = { STEAL: 'treasure', ALARM: 'alarm', SPOTTED: 'spotted', KNOCKOUT: 'knockout', HIDE: 'hide', CAPTURED: 'captured', SUCCESS: 'success', SIGNAL: 'signal', OPEN: 'door', DOOR_OPEN: 'door', GUARD_WAKE: 'wake', GUARD_REVIVE: 'wake' };
    for (let i = sfxIndexRef.current; i < logs.length; i++) {
      const name = SFX[logs[i]!.eventType];
      if (name) audio.playSfx(name);
    }
    sfxIndexRef.current = logs.length;
  }, [ctl.logs, ctl.run, ctl.isReplay]);

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
      if (autoPlay) {
        setBanner((b) => ({ key: (b?.key ?? 0) + 1, text: '作戦開始' }));
        audio.playSfx('start');
      }
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
        const usedScripts = { ...scripts };
        persist((d) => {
          const p = d.stages[stage.id] ?? { scripts: {}, cleared: false, bestTicks: null, challenges: [] };
          p.cleared = true;
          p.bestTicks = p.bestTicks === null ? ticks : Math.min(p.bestTicks, ticks);
          const achieved: string[] = [];
          for (const c of stage.challenges) {
            const ok =
              (c.type === 'maxTicks' && c.value !== undefined && ticks <= c.value) ||
              (c.type === 'noSpotted' && stats.spottedCount === 0) ||
              (c.type === 'noKnockout' && stats.knockoutCount === 0) ||
              (c.type === 'noAlarm' && stats.alarmCount === 0);
            if (ok) {
              achieved.push(c.id);
              if (!p.challenges.includes(c.id)) p.challenges.push(c.id);
              p.challengeScripts = { ...(p.challengeScripts ?? {}), [c.id]: usedScripts };
            }
          }
          if (!p.best || ticks < p.best.ticks) {
            p.best = { ticks, instructions: stats.instructionCount, spotted: stats.spottedCount, knockouts: stats.knockoutCount, alarms: stats.alarmCount, challenges: achieved, scripts: usedScripts };
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
  const nameTags = useMemo(() => Object.fromEntries(stage.thieves.map((t) => [t.id, t.label ?? t.id])), [stage]);
  const renderOptions = useMemo(
    () => ({ showVision, showCameraVision, showPaths, reducedMotion, selectedId, nameTags }),
    [showVision, showCameraVision, showPaths, reducedMotion, selectedId, nameTags],
  );
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

  /** 結果の原因となった tick（逮捕・エラー・停止のログから） */
  const causeTick = useMemo(() => {
    if (!ctl.run || !result) return null;
    const logs = ctl.run.logs;
    for (let i = logs.length - 1; i >= 0; i--) {
      const l = logs[i]!;
      if (l.level === 'error' || l.eventType === 'SUCCESS' || l.eventType === 'STOPPED') return l.tick;
    }
    return ctl.run.world.tick;
  }, [ctl.run, result]);
  const causeLog = useMemo(() => {
    if (!ctl.run || causeTick === null) return null;
    return [...ctl.run.logs].reverse().find((l) => l.tick === causeTick && (l.level === 'error' || l.level === 'warn')) ?? null;
  }, [ctl.run, causeTick]);

  const explanation = useMemo(() => {
    const w = world ?? initialWorld;
    const thief = w.thieves.find((t) => t.id === selectedId);
    if (!thief) return null;
    if (!ctl.run) return { doing: '実行待ち', why: ['実行を押すと、ここに「いま何をしていて、なぜ進まないか」が出る'], waiting: null, predicates: [] };
    const vm = w.vms.find((v) => v.thiefId === thief.id);
    return explainThief(w, thief, vm, ctl.run.programs[thief.id], DEFAULT_CONFIG, ctl.logs);
  }, [world, initialWorld, selectedId, ctl.run, ctl.logs]);

  const progress = save.stages[stage.id];
  const statusLabel = ctl.isReplay
    ? ctl.status === 'running'
      ? '過去のコマを再生中'
      : '過去のコマを表示中（閲覧専用）'
    : ctl.status === 'editing'
      ? '編集中'
      : ctl.status === 'running'
        ? '実行中'
        : ctl.status === 'paused'
          ? '一時停止'
          : '終了';

  // マップを優先した自動レイアウト: 2x 表示に必要な幅が確保できるならエディタ幅を詰める（手動調整後は行わない）
  useEffect(() => {
    if (zoom !== 0) return;
    const apply = () => {
      if (editorManualRef.current) return;
      const needed = stage.width * 32 * 2 + 40;
      const available = window.innerWidth - 6;
      const w = available - needed;
      setEditorWidth(w >= 360 ? Math.min(700, w) : 460);
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [stage.width, zoom]);

  // ドラッグで境界調整
  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    editorManualRef.current = true;
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

  // キーボード操作（エディタや入力欄にフォーカスがあるときは無効）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const active = document.activeElement as HTMLElement | null;
      const inEditor = (el: HTMLElement | null) =>
        !!el && (el.closest('.monaco-editor') !== null || el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.classList.contains('native-edit-context'));
      if (inEditor(t) || inEditor(active)) return;
      if (e.key === 'Escape') {
        setShowResult(false);
        setShowStageIO(false);
        return;
      }
      if (screen !== 'game' || showBriefing) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (ctl.status === 'running') ctl.pause();
        else if (ctl.run && ctl.status !== 'finished') ctl.play();
        else if (!hasErrors) startRun(true);
      } else if (e.key === 'n' || e.key === 'N') {
        if (hasErrors) return;
        if (!ctl.run) startRun(false);
        ctl.stepOnce();
      } else if (e.key === 'r' || e.key === 'R') {
        if (!hasErrors) startRun(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, showBriefing, ctl, hasErrors, startRun]);

  const onBottomDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = bottomHeight;
    const move = (ev: MouseEvent) => setBottomHeight(Math.max(120, Math.min(600, startH - (ev.clientY - startY))));
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const builtInCount = getStages().length;
  const hasProgress = Object.values(save.stages).some((p) => p.cleared || Object.keys(p.scripts).length > 0);
  const openStage = (id: string) => {
    setStageId(id);
    setScreen('game');
    setShowBriefing(true);
    audio.playSfx('ui');
  };

  if (screen === 'title') {
    return <TitleScreen hasProgress={hasProgress} onStart={() => { setScreen('select'); audio.playSfx('ui'); }} onContinue={() => openStage(stage.id)} />;
  }
  if (screen === 'select') {
    return <StageSelect stages={stages} builtInCount={builtInCount} save={save} onSelect={openStage} onBack={() => setScreen('title')} />;
  }

  return (
    <div className="app" style={{ ['--editor-width' as string]: `${editorWidth}px`, ['--bottom-height' as string]: bottomMinimized ? '34px' : `${bottomHeight}px` }}>
      {showBriefing && <Briefing stage={stage} index={stages.findIndex((s) => s.id === stage.id)} onStart={() => { setShowBriefing(false); audio.playSfx('ui'); }} />}
      <header className="topbar">
        <button className="brand subtle" onClick={() => setScreen('select')} title="ステージ選択へ戻る" data-testid="btn-to-select">
          <span className="logo">Heist</span>
          <span className="logo2">Script</span>
        </button>
        <label className="stage-select">
          ステージ
          <select value={stage.id} onChange={(e) => setStageId(e.target.value)} data-testid="stage-select">
            {stages.map((s, i) => (
              <option key={s.id} value={s.id}>
                {i + 1}. {s.title}
                {i >= getStages().length ? '（カスタム）' : ''} {save.stages[s.id]?.cleared ? '✔' : ''}
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
          <details className="menu">
            <summary title="表示と音の設定">設定</summary>
            <div className="menu-body">
              <label className="toggle">
                <input type="checkbox" checked={soundOn} onChange={(e) => setSoundOn(e.target.checked)} data-testid="toggle-sound" /> 音を鳴らす（既定はオフ）
              </label>
              <label className="toggle">
                音量
                <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} data-testid="volume" />
              </label>
              <label className="toggle">
                <input type="checkbox" checked={showVision} onChange={(e) => setShowVision(e.target.checked)} data-testid="toggle-guard-vision" /> 警備員の視界
              </label>
              <label className="toggle">
                <input type="checkbox" checked={showCameraVision} onChange={(e) => setShowCameraVision(e.target.checked)} data-testid="toggle-camera-vision" /> カメラの視界
              </label>
              <label className="toggle">
                <input type="checkbox" checked={showPaths} onChange={(e) => setShowPaths(e.target.checked)} data-testid="toggle-paths" /> 移動予定の経路
              </label>
              <label className="toggle">
                <input type="checkbox" checked={reducedMotion} onChange={(e) => setReducedMotion(e.target.checked)} data-testid="toggle-reduced-motion" /> 演出を減らす
              </label>
              <label className="toggle">
                拡大率
                <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))} data-testid="zoom-select">
                  <option value={0}>自動（{appliedZoom.maxFit}x まで）</option>
                  {[1, 2, 3, 4].map((z) => (
                    <option key={z} value={z}>
                      {z}x{z > appliedZoom.maxFit ? '（スクロール）' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </details>
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
            <button className="subtle" onClick={() => onScriptChange(activeThief, formatHsl(scripts[activeThief] ?? ''))} title="インデントを整える" data-testid="btn-format">
              整形
            </button>
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
            {progress?.cleared && (
              <span className="badge" title={progress.best ? `最速 ${progress.best.ticks} tick／命令 ${progress.best.instructions}／発見 ${progress.best.spotted}／気絶 ${progress.best.knockouts}／警報 ${progress.best.alarms}` : ''}>
                クリア済み（最良 {progress.bestTicks} tick）
              </span>
            )}
            {stage.challenges.length > 0 && (
              <span className="challenge-list" title="チャレンジ（クリア条件とは別の記録）">
                {stage.challenges.map((c) => (
                  <span key={c.id} className={`chal ${progress?.challenges.includes(c.id) ? 'done' : ''}`} title={c.title ?? c.id}>
                    {progress?.challenges.includes(c.id) ? '★' : '☆'}
                  </span>
                ))}
              </span>
            )}
            {progress?.best && (
              <button
                className="subtle"
                onClick={() => {
                  if (window.confirm(`最速クリア（${progress.best!.ticks} tick）のときのコードを読み込みますか？ 今のコードは上書きされます`)) {
                    for (const [tid, src] of Object.entries(progress.best!.scripts)) onScriptChange(tid, src);
                  }
                }}
                data-testid="btn-load-best"
                title="最速クリア時のコードをエディタに戻す"
              >
                ベストのコードを読み込む
              </button>
            )}
            <button className="subtle" onClick={() => setShowBriefing(true)} data-testid="btn-briefing" title="作戦ブリーフィングをもう一度見る">
              ブリーフィング
            </button>
            <button className="subtle" onClick={() => setShowStageIO(true)} data-testid="btn-stage-io" title="ステージ JSON の読み込み・書き出し">
              ステージの読込/書出
            </button>
          </div>
          <GameView
            world={previewWorld ?? initialWorld}
            options={renderOptions}
            version={ctl.version}
            onSelect={(id) => {
              setSelectedId(id);
              if (id && stage.thieves.some((t) => t.id === id)) setActiveThief(id);
            }}
            describeTile={(x, y) => describeTile(stage, previewWorld ?? initialWorld, x, y)}
            zoom={zoom}
            onZoomApplied={(z, maxFit) => setAppliedZoom((prev) => (prev.zoom === z && prev.maxFit === maxFit ? prev : { zoom: z, maxFit }))}
            banner={banner}
          />
          {ctl.isReplay && <div className="replay-banner">過去のコマを表示中（閲覧専用）。やり直すには「最初に戻す」</div>}
          <div className="legend" aria-label="凡例">
            <span><i className="sw sw-thief" />怪盗</span>
            <span><i className="sw sw-guard" />警備員</span>
            <span><i className="sw sw-vision" />警備員の視界</span>
            <span><i className="sw sw-camera" />カメラの視界</span>
            <span><i className="sw sw-locker" />隠れ場所</span>
            <span><i className="sw sw-exit" />出口</span>
            {stage.objects.some((o) => o.type === 'laser') && <span><i className="sw sw-laser" />レーザー（赤いとき作動）</span>}
            {stage.objects.some((o) => o.type === 'switch') && <span><i className="sw sw-switch" />スイッチ</span>}
            <span><i className="sw sw-path" />移動予定の経路</span>
            <span className="muted">人物をクリックすると状態を表示</span>
          </div>
        </section>
      </main>

      <div className="hsplitter" onMouseDown={onBottomDragStart} role="separator" aria-orientation="horizontal" title="ドラッグで高さを調整" />
      <footer className={`bottom ${bottomMinimized ? 'minimized' : ''}`}>
        {bottomMinimized ? (
          <div className="bottom-bar">
            <button className="subtle" onClick={() => setBottomMinimized(false)} data-testid="bottom-restore">
              ▔ ログ・状態・ヒントを表示
            </button>
            {causeLog && <span className="muted">最後の出来事: t{causeLog.tick} {causeLog.details}</span>}
          </div>
        ) : (
          <>
        <LogPanel
          logs={ctl.logs}
          thiefIds={stage.thieves.map((t) => t.id)}
          guardIds={stage.guards.map((g) => g.id)}
          onJumpLine={(thiefId) => setActiveThief(thiefId)}
          onSeek={(tick) => ctl.seek(tick)}
          currentTick={ctl.viewTick}
          onMinimize={() => setBottomMinimized(true)}
        />
        <InspectorPanel world={world ?? initialWorld} stage={stage} selectedId={selectedId} onSelect={setSelectedId} explanation={explanation} />
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
          </>
        )}
      </footer>

      {showStageIO && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="ステージの読込/書出" data-testid="stage-io-dialog">
          <div className="modal">
            <h2>ステージの読込 / 書出</h2>
            <p className="muted small">ステージは JSON ファイル（SPEC.md 10 節の形式）。読み込んだステージは検証に通ればこのブラウザに保存され、一覧の末尾に追加されます。</p>
            <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
              <label className="file-btn">
                JSON を読み込む
                <input
                  type="file"
                  accept="application/json,.json"
                  data-testid="stage-import"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const raw: unknown = JSON.parse(await file.text());
                      const r = validateStage(raw);
                      if (!r.ok) {
                        setImportError(r.errors.map((er) => `${er.path}: ${er.message}`));
                        return;
                      }
                      if (getStages().some((b) => b.id === r.stage.id)) {
                        setImportError([`id '${r.stage.id}' は組み込みステージと重複しています。別の id にしてください`]);
                        return;
                      }
                      persist((d) => {
                        d.customStages = [...d.customStages.filter((c) => (c as { id?: string }).id !== r.stage.id), raw];
                      });
                      setImportError(null);
                      setShowStageIO(false);
                      setStageId(r.stage.id);
                    } catch (err) {
                      setImportError([`JSON を読み込めません: ${(err as Error).message}`]);
                    } finally {
                      e.target.value = '';
                    }
                  }}
                />
              </label>
              <button
                onClick={() => {
                  const blob = new Blob([JSON.stringify(stage, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${stage.id}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                data-testid="stage-export"
              >
                現在のステージを書き出す
              </button>
              {!getStages().some((b) => b.id === stage.id) && (
                <button
                  onClick={() => {
                    if (window.confirm(`カスタムステージ '${stage.id}' を削除しますか？`)) {
                      persist((d) => {
                        d.customStages = d.customStages.filter((c) => (c as { id?: string }).id !== stage.id);
                      });
                      setStageId(getStages()[0]!.id);
                      setShowStageIO(false);
                    }
                  }}
                >
                  このカスタムステージを削除
                </button>
              )}
            </div>
            {importError && (
              <ul className="error-list" data-testid="import-errors">
                {importError.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            )}
            <div className="modal-actions">
              <button onClick={() => { setShowStageIO(false); setImportError(null); }}>閉じる</button>
            </div>
          </div>
        </div>
      )}

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
            {result.status !== 'SUCCESS' && causeTick !== null && (
              <p className="result-cause">
                発生 tick: {causeTick}
                {result.actorId ? `／関係: ${result.actorId}` : ''}
                {causeLog && causeLog.actorId !== result.actorId ? `／${causeLog.actorId}` : ''}
                <button
                  className="link"
                  onClick={() => {
                    setShowResult(false);
                    ctl.seek(Math.max(0, causeTick - 5));
                    if (result.actorId && stage.thieves.some((t) => t.id === result.actorId)) {
                      setActiveThief(result.actorId);
                      setSelectedId(result.actorId);
                    }
                  }}
                  data-testid="result-jump"
                >
                  その直前（t{Math.max(0, causeTick - 5)}）から見る
                </button>
              </p>
            )}
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
                <button className="primary" onClick={() => { setShowResult(false); openStage(stages[stages.findIndex((s) => s.id === stage.id) + 1]!.id); }} data-testid="result-next">
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
