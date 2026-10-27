import type { StageDefinition } from '../../core/model/stage';

export function Briefing({ stage, index, onStart }: { stage: StageDefinition; index: number; onStart: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="作戦ブリーフィング" data-testid="briefing">
      <div className="modal briefing">
        <div className="briefing-head">
          <span className="muted">MISSION {String(index + 1).padStart(2, '0')}{stage.chapter ? ` ／ ${stage.chapter}` : ''}{stage.difficulty ? ` ／ 難しさ ${'★'.repeat(stage.difficulty)}` : ''}</span>
          <h2>{stage.title}</h2>
        </div>
        <p className="briefing-desc">{stage.description}</p>
        <dl className="kv">
          {stage.goal && (
            <>
              <dt>ゴール</dt>
              <dd>{stage.goal}</dd>
            </>
          )}
          {stage.learn && stage.learn.length > 0 && (
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
          <dt>怪盗団</dt>
          <dd>
            {stage.thieves.map((t) => (
              <div key={t.id}>
                <strong>{t.label ?? t.id}</strong>
                <span className="muted"> {t.id}</span>
                {t.description ? ` — ${t.description}` : ''}
              </div>
            ))}
          </dd>
          <dt>警備</dt>
          <dd>
            {stage.guards.length ? `警備員 ${stage.guards.length} 人` : '警備員なし'}
            {stage.cameras.length ? `、監視カメラ ${stage.cameras.length} 台` : ''}
            {stage.objects.some((o) => o.type === 'laser') ? '、レーザー' : ''}
            {stage.objects.some((o) => o.type === 'door' && o.cycle) ? '、タイマー扉' : ''}
            {stage.objects.some((o) => o.type === 'switch') ? '、感圧スイッチ' : ''}
          </dd>
          {stage.firstStep && (
            <>
              <dt>最初の一歩</dt>
              <dd>{stage.firstStep}</dd>
            </>
          )}
        </dl>
        <div className="modal-actions">
          <button className="primary big" onClick={onStart} data-testid="briefing-start" autoFocus>
            作戦開始
          </button>
        </div>
      </div>
    </div>
  );
}
