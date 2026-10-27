# HeistScript

プログラミングした怪盗たちが宝を盗み出す、8ビット風ステルス・パズルゲーム。怪盗ごとに専用言語 **HSL (HeistScript Language)** のスクリプトを書き、警備員・監視カメラを避けて宝物を盗み、全員で脱出する。ローカル完結・オフライン・シングルプレイヤーで、コードは外部に送信しない。

- 仕様: [`SPEC.md`](SPEC.md)（正）
- 実装計画: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)
- 仕様解釈の記録: [`docs/DECISIONS.md`](docs/DECISIONS.md)
- 言語リファレンス: ゲーム内「命令ヘルプ」タブ

## 起動・テスト

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest (core 単体/統合)
npm run build      # 型検査 + Vite ビルド (dist/)
npm run test:e2e   # Playwright（初回は npx playwright install chromium）
npm run preview    # dist/ を配信
npx tsx scripts/sim.ts stage_02 'thief_a=move jewel\nsteal jewel\nmove exit' --trace   # CLI でステージを検証
```

推奨解像度 1280×720 以上（デスクトップブラウザ）。

## 遊び方

0. 起動するとタイトル画面。「はじめる」でステージ選択、ステージを選ぶと作戦ブリーフィング（状況・ゴール・学ぶ命令・怪盗団）が出て「作戦開始」でゲーム画面へ。ヘッダのロゴでステージ選択に戻れる。`#stage=stage_05` のように URL で直接開くこともできる。
1. 上部でステージを選ぶ。左のエディタに怪盗ごとのスクリプトを書く（タブで切替）。構文/意味エラーは赤線と下部のリストに行・列つきで表示され、エラーがある間は実行できない。
2. **実行** で初期状態から再生。実行中は同じボタンで一時停止、**1コマ進める** で 1 tick ずつ、**x1/x2/x4** で速度変更、タイムラインで過去の tick へ移動（閲覧専用）。**最初に戻す** でコードを保ったまま初期状態へ。
3. 下部に実行ログ（全部/重要/怪盗/警備/エラーのフィルタ。行をクリックするとその tick へ移動）、選択中の怪盗・警備員・カメラの状態、ヒント（3段階、最終段階は実行可能なサンプルコード）、命令ヘルプ（そのステージで使える ID の一覧つき）。下部パネルは高さをドラッグで変更でき、最小化もできる。
4. 右上の **表示** メニューで、警備員の視界・カメラの視界・移動予定の経路の表示切替、演出の省略、拡大率（自動／1x〜4x）を設定できる。マップのマスにマウスを乗せると、その場所の説明が出る。
5. 失敗したときは結果画面の「その直前から見る」で、原因の少し前の tick に戻って状況を確認できる。
6. エディタの行番号左をクリックするとブレークポイント（その行の実行前で一時停止）。キーボード: Space 実行/一時停止、N 1コマ進める、R 最初に戻す、Esc ダイアログを閉じる（エディタ入力中は無効）。
7. 結果画面: 成功/失敗/停止の理由と発生 tick、経過 tick、発見・気絶・警報回数、命令数、チャレンジ達成。

コード編集・クリア記録・速度・視界表示設定は localStorage に保存され、リロード後も残る。「コード初期化」で怪盗のスクリプトをステージ初期コードに戻せる。

## HSL 早見表

```hsl
# コメント。1行1命令、ブロックは end で閉じる。大文字小文字を区別。
on spotted              # 見つかったとき（次tick）に割り込む。resume で元の命令へ戻る
  move safe_room
  hide
  wait until safe
  resume
end

move jewel              # 目的地へ自動移動（ウェイポイント/宝物/扉/出口/人物のID）
steal jewel             # 隣接または同じマスの宝物を盗む (3tick)
wait 5                  # 5tick 待つ（wait 0 も 1tick）
wait until guard_away   # 条件が真になるまで毎tick判定
if guard_near           # if / else / end, while / end
  hide                  # 隠れ場所(H / ロッカー)の上でだけ成功
end
knockout guard_1        # 背後の隣接マスからのみ。30tick で目覚める
carry guard_1 / drop    # 気絶した警備員を担ぐ/下ろす
open service_door       # 隣接した扉を開ける
signal ready            # 共有フラグ。signal_received(ready) で読む
```

条件: `guard_visible`, `guard_near`, `guard_away`, `has_treasure`, `safe`, `at_exit`, `signal_received(id)`, `true`, `false`、演算子 `and` / `or` / `not` / `( )`。

## 実装済み機能

- **Core（React/Phaser 非依存の純粋 TypeScript）**: 固定 tick の決定的シミュレーション（SPEC 5 節の順序）、決定的 A*（同スコア安定化・隣接順固定）、supercover 視線と90度円錐視界、警備員 FSM（PATROL/INVESTIGATE/CHASE/SEARCH/UNCONSCIOUS）、捕獲（隣接1tick準備→成立）、カメラ（固定/回転・警報）、扉、隠れ場所、気絶/運搬/ドロップ（運搬中タイマー停止）、シグナル、イベント（spotted/alarm）とハンドラ割込/resume/HANDLER_TIMEOUT、命令予算（100命令/tick）、tick 上限、ブレークポイント、tick ごとのスナップショット（リプレイ）。
- **HSL**: 独自 lexer / parser / AST / analyzer / VM。`eval` や `new Function` は使わない。構文エラーは行・列つき、意味エラー（未定義ID・未解禁命令・ハンドラ重複・ハンドラ外の resume）は複数まとめて表示。
- **ステージ**: 5面（JSON、自前バリデータでID一意性・座標・巡回点到達性・出口到達性を検証）。各ステージに3段階ヒントと、テストで成功が担保されたサンプル解答。
- **UI**: React + Monaco（HSL シンタックスハイライト・文脈に応じた補完・ホバーヘルプ・エラーマーカーと修正ガイド・整形・実行行ハイライト・ブレークポイント）、状態パネルの「なぜ動かないか」説明と条件の現在値、ステージごとの「学ぶ命令・ゴール・最初の一歩」+ Phaser 3（コード生成の 32×32 ドット絵、整数倍率、視界扇形、経路表示、発見「！」/調査「？」/宝石取得/気絶/隠れる/逮捕/警報の演出アニメーション）。再生/一時停止/1tick/速度/タイムラインシーク/初期状態へ、ログフィルタ、インスペクタ、ヒント、命令ヘルプ、結果画面、エディタ幅のドラッグ調整。
- **保存**: localStorage（`schemaVersion` 付き、破損データは既定値へ復帰）。Repository インターフェースで IndexedDB へ差し替え可能。

## テスト

- `npm test`: Vitest 127 件（A*、視界、HSL 構文/意味、VM 実行時、警備員 AI、捕獲、気絶/運搬、カメラ/扉、隠れる、2人の怪盗、保存、全ステージのサンプル解答成功・100回ハッシュ一致・tick 上限終了）。
- `npm run test:e2e`: Playwright 28 件（Stage1 の編集→再生→クリア→結果画面、エラーコードの実行禁止、一時停止→ステップ→巻き戻し→再再生、リロード後の保存、Stage2〜5 のクリア、失敗画面、ヒント挿入、ブレークポイント、1280×720 / 1920×1080 での表示とクリック選択、オーバーレイ切替で結果不変、失敗 tick へのジャンプ、パネル最小化と設定保存）。

## ビルドと配布

```bash
npm run build      # dist/ に静的ファイルを出力（phaser / monaco / react / app に分割）
npm run preview    # dist/ をローカル配信して確認
```

`dist/` をそのまま静的ホスティング（または `file://` ではなく任意の HTTP サーバー）に置けば動きます。本番ビルドではサービスワーカーが登録され、一度読み込んだあとはネットワークがなくても起動できます。サーバー・API・アカウントは不要で、スクリプトやセーブは localStorage のみに保存されます。

## トラブルシューティング

- **実行ボタンが押せない**: エディタ下の赤いエラー一覧を直してください（行・列と対処が出ます）。
- **マップが小さい／切れる**: 設定メニューの拡大率を変えるか、下部パネルを最小化・エディタ幅をドラッグで調整してください。領域より大きい倍率はスクロールで見られます。
- **セーブを消したい**: ブラウザの localStorage から `heistscript.save` を削除してください（開発者ツール → Application）。壊れたセーブは自動的に既定値に戻ります。
- **古いキャッシュが残る**: サービスワーカーはハッシュ付きアセットをキャッシュします。更新が反映されないときはリロード（Shift+更新）してください。
- **E2E が失敗する**: `npx playwright install chromium` でブラウザを入れてください。

## 未実装項目 / 既知の制限

- 効果音・BGM はなし（思考を妨げないため意図的に採用しない）。すべての情報は視覚で分かる。
- Safari / Firefox での動作は未検証（Chromium で確認）。
- 施錠扉・`hack`、複数種の警備員、乱数（固定 seed PRNG）、ステージエディタ、スクリプト共有は MVP 対象外（SPEC 1.1）。怪盗 3 人目は Stage 18 のために上限を広げた（D-24）。
- 1幅通路で2人の怪盗が正面衝突すると迂回路がない限り `PATH_BLOCKED` で停止する（仕様通り。すれ違いは2幅以上の通路で可能）。
- リプレイはメモリ上のみ（リロードで消える）。
- Playwright の E2E は `devices` プリセットを使わない（UA を上書きすると Monaco の Cmd/Ctrl 判定がホストとずれるため）。
- 監視カメラの回転パターンは「N tick ごとに時計回り」のみ。
- Stage 8 は眠らせた見張りを運ばなくても逃げ切れる場合がある（未発見チャレンジは不可）。

## ディレクトリ

```
src/core/model   型・設定値・ステージスキーマ
src/core/sim     grid, astar, vision, guardAi, judge, thiefActions, vm, step
src/core/hsl     lexer, parser, ast, analyzer, compile, errors
src/core/replay  スナップショット記録
src/core/stages  検証・WorldState 生成・組み込みステージ
src/core/runner  実行セッション (Run)
src/game         Phaser シーン・ドット絵生成
src/ui           React UI・Monaco 設定
src/storage      保存リポジトリ
stages/          ステージ JSON
tests/core       Vitest / tests/e2e Playwright
scripts/sim.ts   ステージ検証 CLI
```
