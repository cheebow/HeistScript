import type { EventType } from '../model/types';

export type PredicateName =
  | 'guard_visible'
  | 'guard_near'
  | 'guard_away'
  | 'has_treasure'
  | 'safe'
  | 'at_exit'
  | 'signal_received';

export const PREDICATE_NAMES: readonly PredicateName[] = [
  'guard_visible',
  'guard_near',
  'guard_away',
  'has_treasure',
  'safe',
  'at_exit',
  'signal_received',
];

export type Expr =
  | { kind: 'bool'; value: boolean; line: number; col: number }
  | { kind: 'pred'; name: PredicateName; arg: string | null; line: number; col: number }
  | { kind: 'not'; expr: Expr; line: number; col: number }
  | { kind: 'and'; left: Expr; right: Expr; line: number; col: number }
  | { kind: 'or'; left: Expr; right: Expr; line: number; col: number };

export type ActionCommand = 'move' | 'steal' | 'hide' | 'knockout' | 'carry' | 'drop' | 'open';

export type Statement =
  | { kind: 'action'; command: ActionCommand; target: string | null; line: number; col: number }
  | { kind: 'wait'; ticks: number; line: number; col: number }
  | { kind: 'waitUntil'; cond: Expr; line: number; col: number }
  | { kind: 'signal'; name: string; line: number; col: number }
  | { kind: 'resume'; line: number; col: number }
  | { kind: 'if'; cond: Expr; thenBlock: number; elseBlock: number | null; line: number; col: number }
  | { kind: 'while'; cond: Expr; body: number; line: number; col: number };

export interface HandlerDef {
  event: EventType;
  blockId: number;
  line: number;
}

export interface Program {
  /** blocks[0] が本体 */
  blocks: Statement[][];
  handlers: Partial<Record<EventType, HandlerDef>>;
  /** 文の総数（統計表示用） */
  statementCount: number;
}

export const MAIN_BLOCK = 0;

/** 式を HSL の表記に戻す（状態パネルの表示用） */
export function exprToString(e: Expr): string {
  switch (e.kind) {
    case 'bool':
      return e.value ? 'true' : 'false';
    case 'pred':
      return e.arg !== null ? `${e.name}(${e.arg})` : e.name;
    case 'not':
      return `not ${wrap(e.expr)}`;
    case 'and':
      return `${wrap(e.left)} and ${wrap(e.right)}`;
    case 'or':
      return `${wrap(e.left)} or ${wrap(e.right)}`;
  }
}

function wrap(e: Expr): string {
  return e.kind === 'and' || e.kind === 'or' ? `(${exprToString(e)})` : exprToString(e);
}

/** 式に含まれる述語を列挙（重複なし、出現順） */
export function collectPredicates(e: Expr, out: { name: PredicateName; arg: string | null }[] = []): { name: PredicateName; arg: string | null }[] {
  switch (e.kind) {
    case 'pred':
      if (!out.some((p) => p.name === e.name && p.arg === e.arg)) out.push({ name: e.name, arg: e.arg });
      break;
    case 'not':
      collectPredicates(e.expr, out);
      break;
    case 'and':
    case 'or':
      collectPredicates(e.left, out);
      collectPredicates(e.right, out);
      break;
    default:
      break;
  }
  return out;
}
