import { useMemo, useState } from 'react';
import type { StageDefinition } from '../core/model/stage';
import type { Guard, LogEntry, Thief, VmState, WorldState } from '../core/model/types';
import type { HslError } from '../core/hsl/errors';
import { formatHslError } from '../core/hsl/errors';
import { COMMAND_DOCS, PREDICATE_DOCS } from './monaco/setup';
import { labelOf, stageEntities } from './stageInfo';
import type { ThiefExplanation } from './explain';

export type LogFilter = 'all' | 'important' | 'thief' | 'guard' | 'error';

const IMPORTANT_EVENTS = new Set(['SPOTTED', 'CAPTURED', 'CAPTURE_PREPARE', 'KNOCKOUT', 'KNOCKOUT_FAILED', 'STEAL', 'ALARM', 'SIGNAL', 'HANDLER_START', 'RESUME', 'GUARD_WAKE', 'GUARD_FOUND_UNCONSCIOUS', 'OPEN', 'HIDE', 'SUCCESS', 'STOPPED', 'TIMEOUT', 'PATH_BLOCKED', 'PATH_NOT_FOUND', 'ACTION_FAILED', 'SCRIPT_BUDGET_EXCEEDED', 'HANDLER_TIMEOUT']);

export function LogPanel({ logs, thiefIds, guardIds, onJumpLine, onSeek, currentTick, onMinimize }: { logs: LogEntry[]; thiefIds: string[]; guardIds: string[]; onJumpLine: (thiefId: string, line: number) => void; onSeek: (tick: number) => void; currentTick: number; onMinimize?: () => void }) {
  const [filter, setFilter] = useState<LogFilter>('all');
  const filtered = useMemo(() => {
    const items = logs.filter((l) => {
      if (filter === 'all') return true;
      if (filter === 'error') return l.level === 'error';
      if (filter === 'important') return IMPORTANT_EVENTS.has(l.eventType);
      if (filter === 'thief') return thiefIds.includes(l.actorId);
      if (filter === 'guard') return guardIds.includes(l.actorId) || l.actorId.startsWith('cam');
      return true;
    });
    return items.slice(-300);
  }, [logs, filter, thiefIds, guardIds]);
  return (
    <section className="panel log-panel" aria-label="実行ログ">
      <header className="panel-header">
        <h2>実行ログ</h2>
        <div className="seg" role="radiogroup" aria-label="ログフィルタ">
          {(['all', 'important', 'thief', 'guard', 'error'] as LogFilter[]).map((f) => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)} aria-pressed={filter === f}>
              {f === 'all' ? '全部' : f === 'important' ? '重要' : f === 'thief' ? '怪盗' : f === 'guard' ? '警備' : 'エラー'}
            </button>
          ))}
        </div>
        {onMinimize && (
          <button className="subtle" onClick={onMinimize} title="下部パネルを最小化">
            ▁ 最小化
          </button>
        )}
      </header>
      <ol className="log-list" data-testid="log-list">
        {filtered.length === 0 && <li className="log-empty">{logs.length === 0 ? 'まだログはありません。実行すると表示されます。' : '該当するログはありません。'}</li>}
        {filtered.map((l, i) => (
          <li key={i} className={`log-${l.level} ${l.tick === currentTick ? 'log-current' : ''} ${l.tick > currentTick ? 'log-future' : ''}`} onClick={() => onSeek(l.tick)} title="クリックでこの tick を表示">
            <span className="log-tick">t{l.tick}</span>
            <span className="log-actor">{l.actorId}</span>
            <span className="log-type">{l.eventType}</span>
            <span className="log-details">{l.details}</span>
            {l.scriptLine !== null && thiefIds.includes(l.actorId) && (
              <button className="log-line" onClick={() => onJumpLine(l.actorId, l.scriptLine!)} title="この行へ移動">
                L{l.scriptLine}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function describeAction(vm: VmState | undefined): string {
  if (!vm) return '-';
  if (vm.halted) return '停止（エラー）';
  const a = vm.action;
  if (!a) return vm.finished ? 'スクリプト終了' : '次の命令を実行待ち';
  switch (a.kind) {
    case 'move':
      return `move ${a.targetId}（残り ${a.path.length} タイル）`;
    case 'wait':
      return `wait（残り ${a.remaining} tick）`;
    case 'waitUntil':
      return 'wait until（条件待ち）';
    case 'timed':
      return `${a.command}${a.targetId ? ' ' + a.targetId : ''}（残り ${a.remaining} tick）`;
  }
}

const GUARD_STATE_JA: Record<Guard['state'], string> = {
  PATROL: '巡回',
  INVESTIGATE: '調査',
  CHASE: '追跡！',
  SEARCH: '捜索',
  UNCONSCIOUS: '気絶',
};

export function InspectorPanel({ world, stage, selectedId, onSelect, explanation }: { world: WorldState | null; stage: StageDefinition; selectedId: string | null; onSelect: (id: string) => void; explanation: ThiefExplanation | null }) {
  if (!world) {
    return (
      <section className="panel inspector" aria-label="インスペクタ">
        <header className="panel-header">
          <h2>状態</h2>
        </header>
        <p className="muted">実行を開始すると怪盗・警備員の状態がここに表示されます。</p>
      </section>
    );
  }
  const thief = world.thieves.find((t) => t.id === selectedId);
  const guard = world.guards.find((g) => g.id === selectedId);
  const camera = world.cameras.find((c) => c.id === selectedId);
  const vm = thief ? world.vms.find((v) => v.thiefId === thief.id) : undefined;
  const required = world.requiredTreasureIds;
  const taken = required.filter((id) => world.objects.find((o) => o.id === id)?.takenBy !== null);
  return (
    <section className="panel inspector" aria-label="インスペクタ">
      <header className="panel-header">
        <h2>状態</h2>
        <div className="chips">
          {[...world.thieves.map((t) => t.id), ...world.guards.map((g) => g.id), ...world.cameras.map((c) => c.id)].map((id) => (
            <button key={id} className={`chip ${id === selectedId ? 'active' : ''}`} onClick={() => onSelect(id)} title={id}>
              {labelOf(stage, id)}
            </button>
          ))}
        </div>
      </header>
      <div className="inspector-body">
        <dl className="kv">
          <dt>クリア条件</dt>
          <dd data-testid="objective">
            宝物 {taken.length}/{required.length}、全員が出口へ{world.alarmActive ? '（警戒中）' : ''}
          </dd>
        </dl>
        {thief && <ThiefInfo thief={thief} vm={vm} world={world} label={labelOf(stage, thief.id)} />}
        {thief && explanation && <ExplanationView ex={explanation} />}
        {guard && <GuardInfo guard={guard} world={world} label={labelOf(stage, guard.id)} />}
        {camera && (
          <dl className="kv">
            <dt>カメラ</dt>
            <dd>
              {labelOf(stage, camera.id)}（{camera.id}）位置 ({camera.x},{camera.y}) 向き {camera.direction} 範囲 {camera.range}
              {camera.rotateEveryTicks > 0 ? ` 回転 ${camera.rotateEveryTicks}tick` : ' 固定'}
            </dd>
          </dl>
        )}
        {!thief && !guard && !camera && <p className="muted">マップ上の人物をクリックするか、上のボタンで選択してください。</p>}
      </div>
    </section>
  );
}

function ThiefInfo({ thief, vm, world, label }: { thief: Thief; vm: VmState | undefined; world: WorldState; label: string }) {
  return (
    <dl className="kv" data-testid="thief-info">
      <dt>怪盗</dt>
      <dd>
        {label}（{thief.id}）{thief.captured ? ' 逮捕' : thief.hidden ? ' 隠れ中' : ''}
      </dd>
      <dt>位置/向き</dt>
      <dd>
        ({thief.x},{thief.y}) {thief.direction}
      </dd>
      <dt>命令</dt>
      <dd>
        {vm && vm.currentLine > 0 ? `${vm.currentLine}行目: ` : ''}
        {describeAction(vm)}
        {vm?.handler ? `（on ${vm.handler.event} 実行中）` : ''}
      </dd>
      <dt>所持品</dt>
      <dd>{thief.inventory.length ? thief.inventory.join(', ') : 'なし'}{thief.carrying ? `／${thief.carrying} を運搬中` : ''}</dd>
      <dt>シグナル</dt>
      <dd>{Object.keys(world.signals).filter((k) => world.signals[k]).join(', ') || 'なし'}</dd>
    </dl>
  );
}

function GuardInfo({ guard, world, label }: { guard: Guard; world: WorldState; label: string }) {
  return (
    <dl className="kv" data-testid="guard-info">
      <dt>警備員</dt>
      <dd>
        {label}（{guard.id}）― {GUARD_STATE_JA[guard.state]}
        {guard.carriedBy ? `（${guard.carriedBy} が運搬中）` : ''}
      </dd>
      <dt>位置/向き</dt>
      <dd>
        ({guard.x},{guard.y}) {guard.direction}
      </dd>
      <dt>巡回</dt>
      <dd>
        {guard.patrolRoute.length ? `地点 ${guard.patrolIndex + 1}/${guard.patrolRoute.length}` : 'なし'}
        {guard.patrolWaitRemaining > 0 ? `（待機 残り ${guard.patrolWaitRemaining}）` : ''}
      </dd>
      {guard.chaseTargetId && (
        <>
          <dt>追跡対象</dt>
          <dd>
            {guard.chaseTargetId}（最終目撃 ({guard.lastSeenPos?.x},{guard.lastSeenPos?.y})）{guard.capture ? ' 捕獲準備中！' : ''}
          </dd>
        </>
      )}
      {(guard.state === 'INVESTIGATE' || guard.state === 'SEARCH') && guard.targetPos && (
        <>
          <dt>{guard.state === 'INVESTIGATE' ? '調査先' : '捜索中'}</dt>
          <dd>
            ({guard.targetPos.x},{guard.targetPos.y})
            {guard.reviveTargetId ? `／${guard.reviveTargetId} を起こしに行く` : ''}
            {guard.state === 'SEARCH' ? `／残り ${guard.observeRemaining} tick` : ''}
          </dd>
        </>
      )}
      {guard.state === 'UNCONSCIOUS' && (
        <>
          <dt>目覚めまで</dt>
          <dd>{guard.wakeTick !== null ? `${Math.max(0, guard.wakeTick - world.tick)} tick` : `停止中（残り ${guard.sleepRemaining ?? 0} tick）`}</dd>
        </>
      )}
      <dt>視認中</dt>
      <dd>{guard.visibleThiefIds.join(', ') || 'なし'}</dd>
    </dl>
  );
}

function ExplanationView({ ex }: { ex: ThiefExplanation }) {
  return (
    <div className="explain" data-testid="thief-explain">
      <div className="explain-doing">
        <span className="muted">いま: </span>
        {ex.doing}
      </div>
      {ex.why.map((w, i) => (
        <div key={i} className="explain-why">
          {w}
        </div>
      ))}
      {ex.waiting && (
        <div className="explain-wait">
          <code>{ex.waiting.expr}</code> → <strong className={ex.waiting.value ? 'ok' : 'ng'}>{ex.waiting.value ? '真' : '偽'}</strong>
          {ex.waiting.parts.length > 1 && (
            <span className="muted">
              {' '}
              （{ex.waiting.parts.map((p) => `${p.name}=${p.value ? '真' : '偽'}`).join(', ')}）
            </span>
          )}
        </div>
      )}
      <div className="pred-grid" title="選択中の怪盗から見た各条件の現在値">
        {ex.predicates.map((p) => (
          <span key={p.name} className={`pred ${p.value ? 'ok' : 'ng'}`}>
            <code>{p.name}</code> {p.value ? '真' : '偽'}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ErrorList({ errors, onJump }: { errors: HslError[]; onJump: (line: number) => void }) {
  if (errors.length === 0) return null;
  return (
    <ul className="error-list" role="alert" data-testid="error-list">
      {errors.map((e, i) => (
        <li key={i}>
          <button onClick={() => onJump(e.line)}>{formatHslError(e)}</button>
        </li>
      ))}
    </ul>
  );
}

export function HintPanel({ stage, onInsertSample }: { stage: StageDefinition; onInsertSample: (code: string) => void }) {
  const [level, setLevel] = useState(0);
  const hints = stage.hints ?? [];
  return (
    <section className="panel hint-panel" aria-label="ヒント">
      {(stage.learn || stage.goal || stage.firstStep) && (
        <dl className="kv learn" data-testid="learn-panel">
          {stage.learn && (
            <>
              <dt>学ぶ命令</dt>
              <dd>
                {stage.learn.map((l) => (
                  <code key={l} className="learn-cmd">
                    {l}
                  </code>
                ))}
              </dd>
            </>
          )}
          {stage.goal && (
            <>
              <dt>ゴール</dt>
              <dd>{stage.goal}</dd>
            </>
          )}
          {stage.firstStep && (
            <>
              <dt>最初の一歩</dt>
              <dd>{stage.firstStep}</dd>
            </>
          )}
        </dl>
      )}
      <header className="panel-header">
        <h2>ヒント</h2>
        <button onClick={() => setLevel((l) => Math.min(hints.length, l + 1))} disabled={level >= hints.length} data-testid="hint-next">
          ヒントを見る（{level}/{hints.length}）
        </button>
      </header>
      <ol className="hint-list">
        {hints.slice(0, level).map((h, i) => (
          <li key={i}>
            {i === hints.length - 1 ? (
              <>
                <pre className="code">{h}</pre>
                <button onClick={() => onInsertSample(h)}>このコードをエディタに入れる</button>
              </>
            ) : (
              h
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function HelpPanel({ stage }: { stage: StageDefinition }) {
  const ids = stageEntities(stage);
  const firstWaypoint = stage.waypoints.find((w) => w.id !== 'exit')?.id ?? 'exit';
  const treasure = stage.objects.find((o) => o.type === 'treasure')?.id ?? 'jewel';
  const guard = stage.guards[0]?.id ?? 'guard_1';
  const door = stage.objects.find((o) => o.type === 'door')?.id ?? 'door';
  const example = (name: string): string => {
    switch (name) {
      case 'move':
        return `move ${firstWaypoint}`;
      case 'steal':
        return `steal ${treasure}`;
      case 'knockout':
        return `knockout ${guard}`;
      case 'carry':
        return `carry ${guard}`;
      case 'open':
        return `open ${door}`;
      default:
        return COMMAND_DOCS.find((c) => c.name === name)?.example.split('\n')[0] ?? name;
    }
  };
  return (
    <section className="panel help-panel" aria-label="命令ヘルプ">
      <header className="panel-header">
        <h2>このステージで使える ID</h2>
      </header>
      <p className="muted small">
        命令の後ろには下の ID（英語の名前）をそのまま書く。例: <code>{example('move')}</code>
      </p>
      <table className="help-table id-table" data-testid="id-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>意味</th>
            <th>使い方</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((r) => (
            <tr key={r.id}>
              <td>
                <code>{r.id}</code>
              </td>
              <td>
                <strong>{r.label}</strong>
                <span className="muted"> {r.kind !== r.label ? `${r.kind} ` : ''}{r.pos}</span>
                {r.description && <div className="muted">{r.description}</div>}
              </td>
              <td>
                <code>{r.usage}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <header className="panel-header">
        <h2>命令</h2>
      </header>
      <table className="help-table">
        <thead>
          <tr>
            <th>書き方</th>
            <th>意味</th>
            <th>例</th>
          </tr>
        </thead>
        <tbody>
          {COMMAND_DOCS.map((c) => (
            <tr key={c.name} className={stage.unlockedCommands.includes(c.name) ? '' : 'locked'}>
              <td>
                <code>{c.signature}</code>
                {!stage.unlockedCommands.includes(c.name) && <span className="lock" title="このステージでは未解禁">未解禁</span>}
              </td>
              <td>
                {c.summary}
                <span className="muted"> 所要: {c.ticks}</span>
              </td>
              <td>
                <code className="pre">{example(c.name)}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <header className="panel-header">
        <h2>条件（if / wait until / while に書く）</h2>
      </header>
      <table className="help-table">
        <tbody>
          {PREDICATE_DOCS.map((p) => (
            <tr key={p.name}>
              <td>
                <code>{p.name}</code>
              </td>
              <td colSpan={2}>{p.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        文法: 1行1命令。ブロックは end で閉じる。# 以降はコメント。大文字小文字は区別。条件は and / or / not / ( ) で組み合わせられる。
      </p>
    </section>
  );
}
