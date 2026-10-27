import { collectPredicates, exprToString, type Program } from '../core/hsl/ast';
import type { SimConfig } from '../core/model/config';
import type { LogEntry, Thief, VmState, WorldState } from '../core/model/types';
import { evaluateExpr, evaluatePredicate } from '../core/sim/predicates';

export interface PredicateValue {
  name: string;
  value: boolean;
}

export interface ThiefExplanation {
  /** 今していること（1行） */
  doing: string;
  /** なぜ進まないか／次に何が起きるか（補足。なければ空） */
  why: string[];
  /** 待機中の条件式と評価結果 */
  waiting: { expr: string; value: boolean; parts: PredicateValue[] } | null;
  /** 主要述語の現在値 */
  predicates: PredicateValue[];
}

const PREDICATE_LIST = ['guard_visible', 'guard_near', 'guard_away', 'has_treasure', 'safe', 'at_exit'] as const;

/** 選択中の怪盗について「今何をしていて、なぜ動かないのか」を日本語で説明する（純粋関数） */
export function explainThief(world: WorldState, thief: Thief, vm: VmState | undefined, program: Program | undefined, config: SimConfig, recentLogs: LogEntry[]): ThiefExplanation {
  const predicates: PredicateValue[] = PREDICATE_LIST.map((name) => ({ name, value: evaluatePredicate(world, thief, name, null, config) }));
  const why: string[] = [];
  let waiting: ThiefExplanation['waiting'] = null;
  if (!vm) return { doing: '-', why, waiting, predicates };

  if (thief.captured) return { doing: '逮捕された', why: ['ミッション失敗。見つかった場所と時刻を実行ログで確認し、隠れる・待つ・逃げる手順を足そう'], waiting, predicates };
  if (vm.halted) {
    const err = [...recentLogs].reverse().find((l) => l.actorId === thief.id && l.level === 'error');
    return { doing: 'エラーで停止', why: [err ? err.details : 'スクリプトが停止した'], waiting, predicates };
  }
  const a = vm.action;
  const handler = vm.handler ? `（on ${vm.handler.event} の中）` : '';
  if (!a) {
    if (vm.finished && !vm.handler) {
      const notAtExit = !(thief.x === world.exit.x && thief.y === world.exit.y);
      const missing = world.requiredTreasureIds.filter((id) => world.objects.find((o) => o.id === id)?.takenBy === null);
      const w: string[] = ['スクリプトの最後まで実行した'];
      if (notAtExit) w.push('出口に着いていない。最後に move exit を足そう');
      if (missing.length) w.push(`まだ盗んでいない宝物: ${missing.join(', ')}`);
      if (world.thieves.length > 1 && !notAtExit) w.push('他の怪盗が出口に着くのを待っている');
      return { doing: 'スクリプト終了', why: w, waiting, predicates };
    }
    if (vm.pendingEvents.length) why.push(`次の tick に on ${vm.pendingEvents[0]!.type} ハンドラが始まる`);
    return { doing: `次の命令を実行待ち${handler}`, why, waiting, predicates };
  }
  switch (a.kind) {
    case 'move': {
      const blocked = recentLogs.filter((l) => l.actorId === thief.id && l.eventType === 'MOVE_BLOCKED' && l.tick >= world.tick - 3);
      if (blocked.length) why.push(`進路がふさがれている（${blocked.length} 回）。他の人物が通路にいる。3 回連続でふさがれると停止する`);
      if (a.path.length === 0) why.push('到着した。次の tick から次の命令に進む');
      return { doing: `${a.targetId} へ移動中${handler}（残り ${a.path.length} マス）`, why, waiting, predicates };
    }
    case 'wait':
      return { doing: `待機中${handler}（残り ${a.remaining} tick）`, why, waiting, predicates };
    case 'waitUntil': {
      const stmt = program?.blocks[a.blockId]?.[a.index];
      if (stmt && stmt.kind === 'waitUntil') {
        const value = evaluateExpr(world, thief, stmt.cond, config);
        const parts = collectPredicates(stmt.cond).map((p) => ({ name: p.arg !== null ? `${p.name}(${p.arg})` : p.name, value: evaluatePredicate(world, thief, p.name, p.arg, config) }));
        waiting = { expr: exprToString(stmt.cond), value, parts };
        if (!value) {
          const falseSignals = collectPredicates(stmt.cond).filter((p) => p.name === 'signal_received' && p.arg && !world.signals[p.arg]);
          for (const p of falseSignals) why.push(`合図 ${p.arg} をまだ誰も送っていない（signal ${p.arg} を実行する怪盗が必要）`);
          const falseParts = parts.filter((p) => !p.value && !p.name.startsWith('signal_received'));
          if (falseParts.length) why.push(`条件が成立していない: ${falseParts.map((p) => p.name).join(', ')} が false`);
        } else {
          why.push('条件が成立した。この tick の終わりに次の命令へ進む');
        }
      }
      return { doing: `条件待ち${handler}`, why, waiting, predicates };
    }
    case 'timed':
      return { doing: `${a.command}${a.targetId ? ' ' + a.targetId : ''} を実行中${handler}（残り ${a.remaining} tick）`, why, waiting, predicates };
  }
}
