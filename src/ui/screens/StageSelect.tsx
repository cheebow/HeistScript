import { Fragment } from 'react';
import type { StageDefinition } from '../../core/model/stage';
import type { SaveData } from '../../storage/repository';

export interface StageSelectProps {
  stages: StageDefinition[];
  builtInCount: number;
  save: SaveData;
  onSelect: (id: string) => void;
  onBack: () => void;
}

export function StageSelect({ stages, builtInCount, save, onSelect, onBack }: StageSelectProps) {
  return (
    <div className="screen select-screen" data-testid="stage-select-screen">
      <header className="select-header">
        <button className="subtle" onClick={onBack}>
          ← タイトル
        </button>
        <h1>ステージを選ぶ</h1>
        <span className="muted small">クリア済み {stages.filter((s) => save.stages[s.id]?.cleared).length} / {stages.length}</span>
      </header>
      <div className="stage-grid">
        {stages.map((s, i) => {
          const p = save.stages[s.id];
          const custom = i >= builtInCount;
          const chapterOf = (idx: number) => (idx >= builtInCount ? 'カスタムステージ' : (stages[idx]!.chapter ?? 'その他'));
          const chapter = chapterOf(i);
          const head = i === 0 || chapter !== chapterOf(i - 1) ? <h2 className="chapter-head">{chapter}</h2> : null;
          return (
            <Fragment key={s.id}>
            {head}
            <button className={`stage-card ${p?.cleared ? 'cleared' : ''}`} onClick={() => onSelect(s.id)} data-testid={`stage-card-${s.id}`}>
              <div className="stage-card-top">
                <span className="stage-num">{custom ? 'C' : i + 1}</span>
                <span className="stage-title">{s.title}</span>
                {s.difficulty && <span className="stage-diff" title={`難しさ ${s.difficulty}/5`}>{'★'.repeat(s.difficulty)}{'☆'.repeat(5 - s.difficulty)}</span>}
                {p?.cleared && <span className="stage-check">済</span>}
              </div>
              <div className="stage-learn">{s.learn?.length ? s.learn.map((l) => <code key={l}>{l}</code>) : <span className="muted">{custom ? 'カスタム' : ''}</span>}</div>
              <div className="stage-meta muted">
                {p?.bestTicks !== null && p?.bestTicks !== undefined ? `最良 ${p.bestTicks} tick` : '未クリア'}
                {s.challenges.length > 0 && (
                  <span className="challenge-list">
                    {' '}
                    {s.challenges.map((c) => (
                      <span key={c.id} className={`chal ${p?.challenges.includes(c.id) ? 'done' : ''}`} title={c.title ?? c.id}>
                        {p?.challenges.includes(c.id) ? '★' : '☆'}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </button>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
