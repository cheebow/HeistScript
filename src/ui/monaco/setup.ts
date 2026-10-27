import * as monaco from 'monaco-editor/editor';
import 'monaco-editor/features/register.all';
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import { PREDICATE_NAMES } from '../../core/hsl/ast';
import type { StageDefinition } from '../../core/model/stage';
import { stageEntities } from '../stageInfo';

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
  { name: 'move', signature: 'move 目的地ID', summary: '最短経路で目的地へ自動移動する。目的地はウェイポイント・宝物・扉・出口・人物のID。', ticks: '距離に応じる（2tick/タイル、運搬中は4tick）', example: 'move jewel' },
  { name: 'steal', signature: 'steal 宝物ID', summary: '隣接または同じマスの宝物を盗む。', ticks: '3 tick', example: 'steal jewel' },
  { name: 'wait', signature: 'wait 数 / wait until 条件', summary: 'n tick 待つ、または条件が成立するまで毎tick判定しながら待つ。', ticks: 'n tick（0は1）/ 条件次第', example: 'wait until guard_away' },
  { name: 'hide', signature: 'hide', summary: '隠れ場所（緑のロッカー）にいるときだけ隠れる。移動や knockout で解除。', ticks: '1 tick', example: 'hide' },
  { name: 'knockout', signature: 'knockout 警備員ID', summary: '警備員の真後ろの隣接マスにいるときだけ気絶させられる。30 tick 後に目覚める。', ticks: '2 tick', example: 'knockout guard_1' },
  { name: 'carry', signature: 'carry 警備員ID', summary: '隣接する気絶中の警備員を担ぐ。運搬中は移動が遅くなる。', ticks: '3 tick', example: 'carry guard_1' },
  { name: 'drop', signature: 'drop', summary: '担いでいる警備員を現在地に下ろす。', ticks: '1 tick', example: 'drop' },
  { name: 'open', signature: 'open 扉ID', summary: '隣接する扉を開ける。施錠された扉は、その扉の鍵を steal で持っているときだけ開く。', ticks: '2 tick', example: 'open service_door' },
  { name: 'distract', signature: 'distract 地点ID', summary: '距離 6 以内の地点に物音を立てる。そこから距離 6 以内にいる巡回中・捜索中の警備員が調べに行く（追跡中の警備員は無視）。', ticks: '1 tick', example: 'distract corner' },
  { name: 'signal', signature: 'signal 名前', summary: '味方全員が signal_received(名前) で確認できるフラグを立てる。', ticks: '1 tick', example: 'signal ready' },
  { name: 'if', signature: 'if 条件 … else … end', summary: '評価した瞬間の条件で分岐する。', ticks: '0 tick', example: 'if guard_visible\n  hide\nend' },
  { name: 'while', signature: 'while 条件 … end', summary: '条件が真の間くり返す。中に wait を入れないと命令数上限で停止する。', ticks: '0 tick（本体次第）', example: 'while not at_exit\n  wait 1\nend' },
  { name: 'on', signature: 'on spotted … end / on alarm … end', summary: 'イベントハンドラ。発見・警報の次tickに実行中の命令を中断して起動する。', ticks: '-', example: 'on spotted\n  move safe_room\n  hide\n  wait until safe\n  resume\nend' },
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
      { token: 'keyword', foreground: 'c9a84c' },
      { token: 'keyword.action', foreground: '9fc3df' },
      { token: 'variable.predefined', foreground: 'd4a27a' },
      { token: 'operator', foreground: 'b39ddb' },
      { token: 'type', foreground: 'c88a8a' },
      { token: 'comment', foreground: '6c717c', fontStyle: 'italic' },
      { token: 'number', foreground: '9cc08d' },
      { token: 'identifier', foreground: 'd9dbe0' },
    ],
    colors: { 'editor.background': '#15171c', 'editorLineNumber.foreground': '#4a4f5a', 'editor.lineHighlightBackground': '#1c1f26' },
  });
}

let completionDisposable: monaco.IDisposable | null = null;
let hoverDisposable: monaco.IDisposable | null = null;

/** ステージ依存の補完を登録し直す。行の文脈（命令の直後か、条件の中か）に応じて候補を絞る。 */
export function setStageCompletions(stage: StageDefinition | null): void {
  completionDisposable?.dispose();
  completionDisposable = null;
  hoverDisposable?.dispose();
  hoverDisposable = null;
  if (!stage) return;
  const entities = stageEntities(stage);
  hoverDisposable = monaco.languages.registerHoverProvider(HSL_LANGUAGE, {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      const w = word.word;
      const cmd = COMMAND_DOCS.find((c) => c.name === w);
      if (cmd) {
        const locked = !stage.unlockedCommands.includes(cmd.name);
        return {
          range,
          contents: [
            { value: `**${cmd.signature}**${locked ? '　（このステージでは未解禁）' : ''}` },
            { value: `${cmd.summary}\n\n所要: ${cmd.ticks}` },
            { value: '例:\n```hsl\n' + cmd.example + '\n```' },
          ],
        };
      }
      const pred = PREDICATE_DOCS.find((p) => p.name === w || p.name.startsWith(w + '('));
      if (pred) return { range, contents: [{ value: `**${pred.name}**（条件）` }, { value: pred.summary }] };
      const ent = entities.find((e) => e.id === w);
      if (ent) {
        return {
          range,
          contents: [{ value: `**${ent.label}**（${ent.kind} ${ent.pos}） \`${ent.id}\`` }, { value: ent.description || '' }, { value: `使い方: \`${ent.usage}\`` }],
        };
      }
      const kw: Record<string, string> = {
        until: 'wait until 条件: 条件が成立するまで毎 tick 判定しながら待つ',
        end: 'if / while / on のブロックを閉じる',
        else: 'if の条件が偽のときに実行する部分',
        and: '両方が真のとき真',
        or: 'どちらかが真のとき真',
        not: '真偽を反転',
        resume: 'ハンドラから中断した元の命令へ戻る',
        spotted: 'on spotted: 警備員に見つかったとき（次の tick に起動）',
        alarm: 'on alarm: 警報が鳴ったとき（次の tick に起動）',
        true: '常に真',
        false: '常に偽',
      };
      if (kw[w]) return { range, contents: [{ value: `**${w}**` }, { value: kw[w]! }] };
      return null;
    },
  });
  const items = stageEntities(stage).map((e) => ({ id: e.id, detail: `${e.label}（${e.kind} ${e.pos}）`, doc: e.description, kinds: e.commands }));

  const TARGET_COMMANDS = ['move', 'steal', 'open', 'knockout', 'carry', 'distract'];
  const CONDITION_HEADS = ['if', 'while', 'until', 'and', 'or', 'not', '('];

  completionDisposable = monaco.languages.registerCompletionItemProvider(HSL_LANGUAGE, {
    triggerCharacters: [' ', '('],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      const before = model.getValueInRange(new monaco.Range(position.lineNumber, 1, position.lineNumber, word.startColumn)).trim();
      const tokens = before.split(/[\s(]+/).filter(Boolean);
      const last = tokens[tokens.length - 1] ?? '';
      const suggestions: monaco.languages.CompletionItem[] = [];
      const kind = monaco.languages.CompletionItemKind;

      // 1) 命令の直後: その命令に合う ID だけ
      if (TARGET_COMMANDS.includes(last) && tokens.length === 1) {
        for (const it of items) {
          if (!it.kinds.includes(last)) continue;
          suggestions.push({ label: it.id, kind: kind.Variable, insertText: it.id, detail: it.detail, documentation: it.doc, range, sortText: '0' + it.id });
        }
        return { suggestions };
      }
      if (last === 'wait' && tokens.length === 1) {
        suggestions.push({ label: 'until', kind: kind.Keyword, insertText: 'until ', detail: '条件が成立するまで待つ', range, command: { id: 'editor.action.triggerSuggest', title: '' } });
        for (const n of ['1', '5', '10']) suggestions.push({ label: n, kind: kind.Value, insertText: n, detail: `${n} tick 待つ`, range });
        return { suggestions };
      }
      if (last === 'on' && tokens.length === 1) {
        for (const ev of ['spotted', 'alarm']) suggestions.push({ label: ev, kind: kind.Event, insertText: `${ev}\n\t$0\n\tresume\nend`, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: ev === 'spotted' ? '見つかったとき' : '警報のとき', range });
        return { suggestions };
      }
      if (last === 'signal_received') {
        suggestions.push({ label: 'ready', kind: kind.Value, insertText: 'ready)', range });
        return { suggestions };
      }

      // 2) 条件の中: 述語と演算子
      const inCondition = tokens.some((t) => CONDITION_HEADS.includes(t)) || before.endsWith('(');
      if (inCondition) {
        for (const p of PREDICATE_DOCS) {
          suggestions.push({
            label: p.name,
            kind: kind.Function,
            insertText: p.name.startsWith('signal_received') ? 'signal_received(${1:ready})' : p.name,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: p.summary,
            range,
            sortText: '0' + p.name,
          });
        }
        for (const op of ['and', 'or', 'not', 'true', 'false']) suggestions.push({ label: op, kind: kind.Operator, insertText: op, range, sortText: '1' + op });
        return { suggestions };
      }

      // 3) 行頭: 解禁済みの命令
      if (tokens.length === 0) {
        for (const c of COMMAND_DOCS) {
          if (!stage.unlockedCommands.includes(c.name)) continue;
          const needsTarget = TARGET_COMMANDS.includes(c.name) || c.name === 'wait' || c.name === 'signal' || c.name === 'on';
          suggestions.push({
            label: c.name,
            kind: kind.Keyword,
            insertText:
              c.name === 'if' ? 'if ${1:safe}\n\t$0\nend' : c.name === 'while' ? 'while ${1:not at_exit}\n\t$0\nend' : c.name === 'on' ? 'on ${1:spotted}\n\t$0\n\tresume\nend' : needsTarget ? `${c.name} ` : c.name,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: c.signature,
            documentation: `${c.summary}\n所要: ${c.ticks}\n例: ${c.example.split('\n')[0]}`,
            range,
            sortText: '0' + c.name,
            // 対象が必要な命令はスペースを入れた直後に ID 候補を出す
            command: needsTarget && c.name !== 'on' ? { id: 'editor.action.triggerSuggest', title: '' } : undefined,
          });
        }
        for (const op of ['else', 'end']) suggestions.push({ label: op, kind: kind.Keyword, insertText: op, range, sortText: '1' + op });
        return { suggestions };
      }
      return { suggestions };
    },
  });
}

export { monaco };
