# Phase 7 テスト結果（2026-10-27）

実際に実行したコマンドと結果。環境: macOS (Darwin 25.6.0), Node v22.16.0, npm 11.13.0, Chromium 1248 (Playwright 1.64.1)。

## 実行コマンドと結果

| コマンド | 結果 |
|---|---|
| `npm test` (Vitest 5.0.5) | 9 ファイル / 83 件すべて成功 |
| `npm run build` (tsc --noEmit + vite build 8.3.5) | 成功（dist/assets/index 約 5.4 MB、gzip 約 1.4 MB） |
| `npm run test:e2e` (Playwright, chromium, build + preview 4173) | 11 件すべて成功（約 31 秒） |
| `npx tsx scripts/sim.ts stage_0N`（N=1..5、サンプル解答） | 5 ステージすべて SUCCESS（61 / 92 / 121 / 101 / 144 tick） |
| `npx tsx scripts/sim.ts stage_02 'thief_a=move jewel\nsteal jewel\nmove exit'` | FAILED（t19 逮捕）＝無策では捕まる |
| `npx tsx scripts/sim.ts stage_05 'thief_b=wait until signal_received(ready)\nmove jewel\nsteal jewel\nmove exit'` | FAILED（t72 逮捕）＝ `on spotted` なしでは捕まる |
| 性能計測（32×24、警備員10、カメラ10、怪盗2、1000 tick、スナップショット込み） | 147 ms（0.15 ms/tick） |

## 追加したテスト

- `tests/core/audit.test.ts`
  - 固定 seed のランダム HSL スクリプト 400 本（入れ子 if/while、on spotted/alarm、全命令）を 5 ステージで実行: 例外なし、`maxTicks` 以内で終了、同一スクリプトの 2 回実行が完全一致、怪盗同士のタイル重複なし。
  - 最大規模ステージの性能（2 秒以内）。
- `tests/core/mechanics.test.ts` に「気絶した警備員の上に立ったまま目覚めると視認・捕獲される」回帰テスト（D-17）。

## 修正した不具合

| 不具合 | 重大度 | 修正 | 再発防止 |
|---|---|---|---|
| 気絶した警備員の上に怪盗が立ったまま目覚めると同一タイルに重なり、警備員が気づかない | 中 | 同一タイルは常に視認、捕獲準備は距離1以下（D-17） | `mechanics.test.ts` |

Phase 6 中に発見して修正済み（Phase 7 で回帰テストの存在を確認）: 隠れた怪盗への永久 CHASE（D-15）、`safe` の即時成立（D-07）、描画の遅延、出口タイルの占有、resume 後の隠れ状態。

## 手動確認（Playwright スクリプトによる通しプレイ）

- 5 ステージをサンプル解答で UI 上クリア。`pageerror` / `console.error` の出力なし。
- Stage 5 のロッカー・警備員にマウスを乗せてツールチップ表示を確認。

## 残存リスク・未対応

- 1幅の環状通路で2人の怪盗が互いに迂回し続けるライブロック（現行ステージでは発生しない。低）。
- 互いの signal を待つデッドロックは tick 上限で終了するが、原因説明は Phase 10 で対応。
- E2E はウィンドウ幅 1400×900 のみ。Phase 8 で 1280 / 1920 を追加予定。
- Playwright の E2E はビルド済み成果物（preview）を対象にしており、開発サーバーでは実行していない。
