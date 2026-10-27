# 仕様解釈の記録 (DECISIONS)

SPEC.md に曖昧さ・矛盾があった箇所の「論点 / 採用した解釈 / 理由 / テスト」。SPEC.md が正であり、ここは実装時の最小解釈を記録する。

## D-01 `wait until` の最小所要時間

- 論点: 条件がすでに真のとき `wait until` が 0 tick で通過するか。
- 採用: 発行した tick に条件を評価し、真ならその tick 末に完了（最低 1 tick）。`wait 0` が 1 tick なのと揃える。
- 理由: ゼロコスト命令の無限回転を防ぐ（SPEC 9.2 の `wait 0` と同じ趣旨）。`while cond / wait until x / end` が安全になる。
- テスト: `tests/core/stage01.test.ts`（wait 0）、`tests/core/hslRuntime.test.ts`。

## D-02 ブロック時の再試行間隔と経路再計算

- 論点: 「ブロックされた場合は動かず、次に移動可能なtickで経路再計算。3回連続で詰まれば PATH_BLOCKED」の「回」の単位。
- 採用: ブロック時は進行度をリセットし、1タイル分の時間（怪盗 2 tick）後に再試行する。再試行前に**動的占有を避けた**経路を再探索し、見つかればそちらへ切り替える。3回連続で失敗したら `PATH_BLOCKED` でスクリプト停止（STOPPED）。
- 理由: 毎 tick 再試行だと、遅い警備員の後ろを歩くだけで 3 tick 以内に失敗してしまう。静的障害物のみの A* 方針（SPEC 4）は初回探索に適用し、ブロック時のみ動的占有を考慮する。
- テスト: `tests/core/multi.test.ts`（2人が同じ通路）、`tests/core/stage01.test.ts`。

## D-03 `PATH_BLOCKED` / `KNOCKOUT_FAILED` もスクリプト停止

- 論点: SPEC は `ACTION_FAILED` でスクリプト停止と書くが、`PATH_BLOCKED`、`KNOCKOUT_FAILED` の扱いが明記されていない。
- 採用: いずれも該当怪盗のスクリプトを停止し、ミッションは `STOPPED`。ログに行番号と原因を出す。
- 理由: MVP に例外処理はなく、失敗を放置すると怪盗が永久に止まる。原因をすぐ見せる方が学習しやすい。

## D-04 `alarmActive` の解除

- 採用: 稼働中の警備員が全員 `PATROL` に戻ったら false。警報発生時に true。
- 理由: SPEC 7 は「グローバル警戒フラグ」とだけ定義。最も単純で観測可能な定義を採用。

## D-05 警報を受ける警備員

- 採用: `PATROL` / `SEARCH` / `INVESTIGATE` の警備員が検知位置へ `INVESTIGATE`。`CHASE` 中は無視。
- 理由: 追跡中の警備員が調査へ切り替わると不自然。

## D-06 追跡中の向き

- 採用: `CHASE` 中の警備員は移動後、追跡対象（見失っていれば最終確認位置）の方向を向く。
- 理由: 4方向移動でジグザグに追うと、真横の怪盗を一瞬見失って `spotted` が連発する。SPEC 6「未発見→発見で一度だけ」の意図を守る。
- テスト: `tests/core/guardAi.test.ts`。

## D-07 `guard_visible` / `safe` と隠れ状態

- 論点: 隠れている怪盗にとって「視認されていない」をどう評価するか。
- 採用: `guard_visible` と `safe` の視線判定は隠れ状態を無視し「警備員の視線（円錐・射程・遮蔽）が自分のタイルに通っているか」で判定する。`safe` はさらに「距離2以内に警戒中（CHASE/SEARCH/INVESTIGATE）の警備員がいない」ことを要求する。
- 理由: 隠れ状態で `safe` を評価する用途は「今出ても大丈夫か」であり、隠れているから常に true では `on spotted → hide → wait until safe → resume` が即座に再発見される。SPEC 9.3 の「CHASE中警備員なし」を、最終確認地点で捜索中の警備員も含む最小の拡張とした。
- テスト: `tests/core/hslRuntime.test.ts`、`tests/core/stages.test.ts`（stage_05）。

## D-15 追跡中に最終確認地点へ到達できない場合

- 採用: `CHASE` 中、対象が見えず最終確認地点にマンハッタン距離1で隣接している（隠れた怪盗がそのタイルにいて侵入できない）場合も到達とみなし `SEARCH` へ移る。
- 理由: 隠れた怪盗のタイルは占有されたままなので、到達待ちだと永久に `CHASE` が続く。
- テスト: `tests/core/stages.test.ts`（stage_05 サンプル解答）。

## D-08 `move <動的エンティティ>` の目標タイル

- 採用: 対象に隣接する通行可能なタイルのうち経路長最短のもの。同長は `[up,right,down,left]` 順。経路は開始時に固定（対象が動いても追従しない）。
- 理由: SPEC 4 の通り。追従は MVP 対象外。

## D-09 ハンドラ中断からの `resume`

- 採用: `move` は現在位置から同じ目標タイルへ再探索。`steal/open/knockout/carry/drop/hide/signal` は残り時間を全量に戻して最初から。`wait n` は残り tick を保持。`wait until` は再評価。本体が終了済みだった場合は終了状態に戻る。
- 理由: SPEC 9.4 の記述に従う。`wait n` は「残時間を保存」の記述を優先。

## D-10 捕獲判定のタイミング

- 採用: tick 末に `CHASE` 状態で対象にマンハッタン距離 1 なら捕獲準備。次 tick 末も同条件（警備員が気絶しておらず、対象が隠れていない）なら捕獲。準備は同一 tick に `CHASE` へ遷移した場合も開始する。
- テスト: `tests/core/guardAi.test.ts`。

## D-11 スクリプト終了と STOPPED

- 採用: 全怪盗の本体が終了し、アクション・ハンドラ・保留イベントがない tick 末に成功条件未達なら `STOPPED`。成功判定・捕獲判定が優先。
- 理由: SPEC 3 の通り。警備員が追跡中でも停止させ、原因（出口未到達など）を表示する。

## D-12 出口タイルの共有

- 採用: 出口タイルのみ複数の怪盗が同時に存在できる。隠れ場所は1人まで（通常タイルと同じ）。
- 理由: SPEC 3「単一タイル脱出口は複数人の出入りを許す特殊扱い」。

## D-13 ステージ1の解禁命令

- 採用: SPEC のサンプルは `["move","steal"]` だが、`wait` も解禁する。
- 理由: 初心者が「待つ」を試すのを妨げない。学習目標に影響しない。

## D-14 依存ライブラリ

- TypeScript は 5.9 系を採用（最新 7.x は tsgo ベースで周辺ツールとの互換性リスクがあるため）。
- Monaco Editor 0.57 は `monaco-editor/editor` + `monaco-editor/features/register.all` + `monaco-editor/editor/editor.worker.js?worker` でローカルバンドル（CDN 不使用）。
- Phaser は SPEC 通り 3.x（3.90）。Vite 8 / Vitest 5 / Playwright 1.64。
