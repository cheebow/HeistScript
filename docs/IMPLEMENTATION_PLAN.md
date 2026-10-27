# HeistScript 実装計画

SPEC.md v1.0 に基づく実装計画。仕様書15節の順序で進め、各フェーズ終了時に `npm test` と `npm run build` を通す。

## 技術構成

| 領域 | 採用 |
|---|---|
| 言語/ビルド | TypeScript (strict), Vite |
| UI | React 19, Monaco Editor (ローカルバンドル・CDN不使用) |
| 描画 | Phaser 3 (3.90系)。8ビット風素材はコードで生成 |
| テスト | Vitest (unit/integration), Playwright (E2E) |
| 保存 | localStorage (Repository インターフェース経由、schemaVersion付き) |

## ディレクトリ

SPEC.md 2節の推奨構成に従う。`src/core` は React/Phaser/DOM に依存しない純粋TypeScript。

```
src/core/model    ワールド・人物・ステージ型・設定値
src/core/sim      grid, A*, 視界, 警備員AI, カメラ, 怪盗アクション, step
src/core/hsl      lexer, ast, parser, analyzer(意味検査), vm, errors
src/core/replay   tickごとのスナップショット記録
src/core/stages   ステージJSON検証・初期WorldState生成・組み込みステージ登録
src/core/runner   compile + world + step + replay をまとめた実行セッション
src/game          Phaser シーン、ピクセルアート生成
src/ui            React コンポーネント (エディタ/操作/ログ/インスペクタ/ヒント)
src/storage       保存リポジトリ
stages/           ステージJSON (5面)
tests/core        Vitest
tests/e2e         Playwright
```

## コアの設計方針

- `WorldState` は構造化クローン可能な純粋データ。VM状態・イベントキュー・ログカーソルも含める。
- `step(world, programs, config)` は同期・決定的。tick順序は SPEC 5節の 1〜6 に対応する関数に分割。
- 乱数・壁時計・描画状態は参照しない。ID昇順/方向順 `[up,right,down,left]` で安定順序。
- HSL は独自 lexer → parser → AST → analyzer → VM。`eval`/`new Function` 不使用。
- VM のフレームは AST ノードを直接持たず `blockId/pc` で参照し、スナップショットを軽量に保つ。
- 1tick あたり怪盗ごと100命令の予算。超過で `SCRIPT_BUDGET_EXCEEDED`。
- 仕様の曖昧点は `docs/DECISIONS.md` に記録。

## フェーズ

1. **Core基礎**: 型、ステージ検証/読み込み、grid、A*、tickスケルトン、Vitest。
2. **HSL順次実行**: lexer/parser/AST/VM、move/wait/steal、Stage1、エラーの行列表示。
3. **ステルス**: 警備員 PATROL/INVESTIGATE/CHASE/SEARCH、視界、捕獲、Stage2-3。
4. **制圧ギミック**: knockout/carry/drop/hide/camera/door、Stage4。
5. **複数人**: 2怪盗、signal、イベント割込/resume、Stage5。
6. **UXと完成**: React+Phaser+Monaco統合、ログ/リプレイ/ブレークポイント、ヒント、保存、E2E、ドット絵仕上げ。

Stage1 の縦切り（編集→実行→宝石取得→脱出→クリア）を最初に動かすため、フェーズ1-2のコアに加えて最小UIを先に用意し、その後フェーズ3-5をコア中心に進め、フェーズ6で統合を完成させる。

## 進捗（2026-10-27 時点）

| フェーズ | 状態 | 備考 |
|---|---|---|
| 1. Core基礎 | 完了 | 型・ステージ検証/読み込み・grid・A*・step・Vitest |
| 2. HSL順次実行 | 完了 | lexer/parser/analyzer/VM、Stage1、行列つきエラー |
| 3. ステルス | 完了 | 警備員FSM・視界・CHASE/SEARCH・捕獲、Stage2-3 |
| 4. 制圧ギミック | 完了 | knockout/carry/drop/hide/camera/door、Stage4 |
| 5. 複数人 | 完了 | 2怪盗・signal・イベント割込/resume・HANDLER_TIMEOUT、Stage5 |
| 6. UXと完成 | ほぼ完了 | React+Phaser+Monaco、ログ/リプレイ/ブレークポイント、ヒント、保存、E2E。音は未実装 |

## Phase 7–12（ROADMAP_PHASE7_12.md、2026-10-27）

| フェーズ | 状態 | 成果物 |
|---|---|---|
| 7. 実装監査・安定化 | 完了 | `docs/PHASE7_AUDIT.md`, `docs/PHASE7_TEST_RESULTS.md`、D-17 |
| 8. 見やすさ・プレイ体験 | 完了 | `docs/PHASE8_PLAN.md`, `docs/PHASE8_RESULTS.md`、D-18 |
| 9. ステルス AI・複数解法 | 完了 | `docs/PHASE9_PLAN.md`, `docs/PHASE9_RESULTS.md`、stage_06、D-19〜21 |
| 10. HSL・エディタ・学習体験 | 完了 | `docs/PHASE10_PLAN.md`, `docs/PHASE10_RESULTS.md` |
| 11. ステージ拡充・やり込み・エディタ | 完了（GUI エディタは後続） | `docs/PHASE11_PLAN.md`, `docs/PHASE11_RESULTS.md`, `docs/STAGES.md`、stage_07〜11、D-22 |
| 12. 仕上げ・リリース準備 | 完了 | `docs/PHASE12_PLAN.md`, `docs/PHASE12_RESULTS.md`、LICENSE |

未実装・今後: GUI ステージエディタ、固定 seed PRNG、Safari/Firefox の検証、音のバリエーション。
