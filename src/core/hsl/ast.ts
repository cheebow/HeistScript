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
