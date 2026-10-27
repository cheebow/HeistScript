import { useState } from 'react';

export interface TitleScreenProps {
  hasProgress: boolean;
  onStart: () => void;
  onContinue: () => void;
}

export function TitleScreen({ hasProgress, onStart, onContinue }: TitleScreenProps) {
  const [credits, setCredits] = useState(false);
  return (
    <div className="screen title-screen" data-testid="title-screen">
      <div className="title-box">
        <div className="title-logo">
          <span>Heist</span>
          <span className="title-logo2">Script</span>
        </div>
        <p className="title-tag">怪盗団に指令を書け。警備の目をかいくぐり、宝を盗み、全員で脱出せよ。</p>
        <div className="title-actions">
          {hasProgress && (
            <button className="primary big" onClick={onContinue} data-testid="title-continue">
              つづきから
            </button>
          )}
          <button className={hasProgress ? 'big' : 'primary big'} onClick={onStart} data-testid="title-start">
            {hasProgress ? 'ステージを選ぶ' : 'はじめる'}
          </button>
          <button className="subtle" onClick={() => setCredits(true)}>
            クレジット
          </button>
        </div>
        <p className="muted small">キーボード: Space 実行/一時停止、N 1コマ進める、R 最初に戻す、Esc 閉じる</p>
      </div>
      {credits && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="クレジット" onClick={() => setCredits(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>クレジット</h2>
            <p>HeistScript — 8ビット風プログラミング・ステルスパズル。</p>
            <p className="muted small">
              ドット絵・効果音・BGM はすべてコードで生成したオリジナル素材です。
              <br />
              使用ライブラリ: Phaser 3 (MIT), Monaco Editor (MIT), React (MIT), Vite (MIT)。
              <br />
              本作のコードは MIT License で公開されています。
            </p>
            <div className="modal-actions">
              <button onClick={() => setCredits(false)}>閉じる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
