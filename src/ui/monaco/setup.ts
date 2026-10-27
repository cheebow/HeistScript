import * as monaco from 'monaco-editor/editor';
import 'monaco-editor/features/register.all';
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import { PREDICATE_NAMES } from '../../core/hsl/ast';
import type { StageDefinition } from '../../core/model/stage';

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

// ワーカーはローカルにバンドル（CDN 不使用・オフライン動作）
self.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

export const HSL_LANGUAGE = 'hsl';

export interface CommandDoc {
  name: string;
  signature: string;
  summary: string;
  ticks: string;
  example: string;
}

export const COMMAND_DOCS: CommandDoc[] = [
  { name: 'move', signature: 'move <目的地>', summary: '最短経路で目的地へ自動移動する。目的地はウェイポイント・宝物・扉・出口・人物のID。', ticks: '距離に応じる（2tick/タイル、運搬中は4tick）', example: 'move jewel' },
  { name: 'steal', signature: 'steal <宝物>', summary: '隣接または同じマスの宝物を盗む。', ticks: '3 tick', example: 'steal jewel' },
  { name: 'wait', signature: 'wait <n> / wait until <条件>', summary: 'n tick 待つ、または条件が成立するまで毎tick判定しながら待つ。', ticks: 'n tick（0は1）/ 条件次第', example: 'wait until guard_away' },
  { name: 'hide', signature: 'hide', summary: '隠れ場所（緑のロッカー）にいるときだけ隠れる。移動や knockout で解除。', ticks: '1 tick', example: 'hide' },
  { name: 'knockout', signature: 'knockout <警備員>', summary: '警備員の真後ろの隣接マスにいるときだけ気絶させられる。30 tick 後に目覚める。', ticks: '2 tick', example: 'knockout guard_1' },
  { name: 'carry', signature: 'carry <警備員>', summary: '隣接する気絶中の警備員を担ぐ。運搬中は移動が遅くなる。', ticks: '3 tick', example: 'carry guard_1' },
  { name: 'drop', signature: 'drop', summary: '担いでいる警備員を現在地に下ろす。', ticks: '1 tick', example: 'drop' },
  { name: 'open', signature: 'open <扉>', summary: '隣接する扉を開ける。', ticks: '2 tick', example: 'open service_door' },
  { name: 'signal', signature: 'signal <名前>', summary: '味方全員が signal_received(名前) で確認できるフラグを立てる。', ticks: '1 tick', example: 'signal ready' },
  { name: 'if', signature: 'if <条件> ... else ... end', summary: '評価した瞬間の条件で分岐する。', ticks: '0 tick', example: 'if guard_visible\n  hide\nend' },
  { name: 'while', signature: 'while <条件> ... end', summary: '条件が真の間くり返す。中に wait を入れないと命令数上限で停止する。', ticks: '0 tick（本体次第）', example: 'while not at_exit\n  wait 1\nend' },
  { name: 'on', signature: 'on spotted / on alarm ... end', summary: 'イベントハンドラ。発見・警報の次tickに実行中の命令を中断して起動する。', ticks: '-', example: 'on spotted\n  move safe_room\n  hide\n  wait until safe\n  resume\nend' },
  { name: 'resume', signature: 'resume', summary: 'ハンドラから中断した元の命令へ復帰する（移動は再探索、他は最初からやり直し）。', ticks: '0 tick', example: 'resume' },
];

export const PREDICATE_DOCS: { name: string; summary: string }[] = [
  { name: 'guard_visible', summary: '自分に向けて視線が通っている警備員が1人以上いる' },
  { name: 'guard_near', summary: 'マンハッタン距離3以内に稼働中の警備員がいる' },
  { name: 'guard_away', summary: '距離3以内に稼働中の警備員がいない' },
  { name: 'has_treasure', summary: '必須の宝物を1つ以上持っている' },
  { name: 'safe', summary: '今見られておらず、距離2以内に追跡中の警備員がいない' },
  { name: 'at_exit', summary: '出口のマスにいる' },
  { name: 'signal_received(id)', summary: 'シグナル id が立っている' },
];

let registered = false;

export function registerHslLanguage(): void {
  if (registered) return;
  registered = true;
  monaco.languages.register({ id: HSL_LANGUAGE, extensions: ['.hsl'] });
  monaco.languages.setMonarchTokensProvider(HSL_LANGUAGE, {
    keywords: ['if', 'else', 'end', 'while', 'on', 'wait', 'until', 'resume', 'signal'],
    actions: ['move', 'steal', 'hide', 'knockout', 'carry', 'drop', 'open'],
    predicates: [...PREDICATE_NAMES, 'true', 'false'],
    operators: ['and', 'or', 'not'],
    events: ['spotted', 'alarm'],
    tokenizer: {
      root: [
        [/#.*$/, 'comment'],
        [/\d+/, 'number'],
        [/[()]/, 'delimiter.parenthesis'],
        [
          /[A-Za-z_][A-Za-z0-9_]*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@actions': 'keyword.action',
              '@predicates': 'variable.predefined',
              '@operators': 'operator',
              '@events': 'type',
              '@default': 'identifier',
            },
          },
        ],
      ],
    },
  });
  monaco.languages.setLanguageConfiguration(HSL_LANGUAGE, {
    comments: { lineComment: '#' },
    brackets: [['(', ')']],
    autoClosingPairs: [{ open: '(', close: ')' }],
  });
  monaco.editor.defineTheme('heist-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'f5d547', fontStyle: 'bold' },
      { token: 'keyword.action', foreground: '35c0d6', fontStyle: 'bold' },
      { token: 'variable.predefined', foreground: 'f08a24' },
      { token: 'operator', foreground: 'c678dd' },
      { token: 'type', foreground: 'd7263d' },
      { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
      { token: 'number', foreground: '98c379' },
      { token: 'identifier', foreground: 'f4e8c1' },
    ],
    colors: { 'editor.background': '#111527', 'editorLineNumber.foreground': '#4b5270' },
  });
}

let completionDisposable: monaco.IDisposable | null = null;

/** ステージ依存の補完（ID 一覧）を登録し直す */
export function setStageCompletions(stage: StageDefinition | null): void {
  completionDisposable?.dispose();
  completionDisposable = null;
  if (!stage) return;
  const ids = [
    ...stage.waypoints.map((w) => ({ id: w.id, detail: `ウェイポイント (${w.x},${w.y})` })),
    { id: 'exit', detail: `出口 (${stage.exit.x},${stage.exit.y})` },
    ...stage.objects.map((o) => ({ id: o.id, detail: `${o.type === 'treasure' ? '宝物' : o.type === 'door' ? '扉' : 'ロッカー'} (${o.x},${o.y})` })),
    ...stage.guards.map((g) => ({ id: g.id, detail: '警備員' })),
    ...stage.thieves.map((t) => ({ id: t.id, detail: '怪盗' })),
  ].filter((v, i, arr) => arr.findIndex((w) => w.id === v.id) === i);
  completionDisposable = monaco.languages.registerCompletionItemProvider(HSL_LANGUAGE, {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      const suggestions: monaco.languages.CompletionItem[] = [];
      for (const c of COMMAND_DOCS) {
        if (!stage.unlockedCommands.includes(c.name)) continue;
        suggestions.push({
          label: c.name,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: c.name === 'if' ? 'if ${1:safe}\n\t$0\nend' : c.name === 'while' ? 'while ${1:not at_exit}\n\t$0\nend' : c.name === 'on' ? 'on ${1:spotted}\n\t$0\n\tresume\nend' : c.name,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: c.signature,
          documentation: `${c.summary}\n所要: ${c.ticks}`,
          range,
        });
      }
      for (const p of PREDICATE_DOCS) {
        suggestions.push({
          label: p.name,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: p.name.startsWith('signal_received') ? 'signal_received(${1:ready})' : p.name,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: '条件',
          documentation: p.summary,
          range,
        });
      }
      for (const id of ids) {
        suggestions.push({ label: id.id, kind: monaco.languages.CompletionItemKind.Variable, insertText: id.id, detail: id.detail, range });
      }
      for (const op of ['and', 'or', 'not', 'until', 'else', 'end', 'resume']) {
        suggestions.push({ label: op, kind: monaco.languages.CompletionItemKind.Operator, insertText: op, range });
      }
      return { suggestions };
    },
  });
}

export { monaco };
