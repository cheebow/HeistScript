# Phase 8 計画: ビジュアル・UI/UX のブラッシュアップ

前提: Phase 7 監査（`docs/PHASE7_AUDIT.md`）の推奨順に沿う。コア（`src/core`）は変更しない。描画・UI 層のみ。

## 変更対象

| 項目 | 内容 | ファイル |
|---|---|---|
| ズーム | 整数倍率 1x〜4x の手動選択 + 自動（領域に収まる最大）。領域より大きい場合はスクロールでパン | `src/game/createGame.ts`, `src/ui/GameView.tsx`, `App.tsx` |
| 中央配置 | 既存の中央配置を維持し、スクロール時も左上基準で崩れない | `styles.css` |
| 識別性 | 怪盗が2人のとき名前タグ（A/B）を表示。選択中の人物は白枠 + 名前タグ強調 | `HeistScene.ts` |
| オーバーレイ | 警備員視界 / カメラ視界 / 経路 を個別に ON/OFF。設定を保存 | `HeistScene.ts`, `App.tsx`, `storage/repository.ts` |
| コード⇄マップ | マップ上の怪盗クリックでエディタのタブも切替 | `App.tsx` |
| 重要イベント | ログフィルタに「重要」を追加。ログ行クリックでその tick へシーク | `panels.tsx`, `App.tsx` |
| 失敗原因 | 結果画面に原因 tick・関係者・行番号を表示し「その時点を見る」で移動 | `App.tsx` |
| パネル | 下部パネルの高さをドラッグ変更、最小化ボタン | `App.tsx`, `styles.css` |
| 演出 | 実行開始時の「作戦開始」バナー。演出を減らす設定（モーション軽減） | `HeistScene.ts`, `App.tsx` |

## 非対象

- コアロジック、HSL、ステージデータ。
- 新しいギミック（Phase 9）、エディタ支援（Phase 10）。

## 互換性

- 保存データに `settings.showGuardVision` / `showCameraVision` / `showPaths` / `reducedMotion` / `zoom` を追加。欠けていれば既定値で補う（`sanitizeSaveData`）。schemaVersion は据え置き（追加のみで後方互換）。

## 受け入れテスト

- E2E: 1280×720 と 1920×1080 で Stage 1 と Stage 5 を開き、キャンバスが領域内に収まり、怪盗をクリックすると選択される（クリック座標の対応）。
- E2E: オーバーレイを切り替えても tick・結果が変わらない。
- 既存のユニット 83 件、E2E 11 件が引き続き成功。
