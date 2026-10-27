import type { StageDefinition } from '../model/stage';
import type { Expr, Program, Statement } from './ast';
import type { HslError } from './errors';

/** 編集距離（候補提示用） */
function editDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array.from({ length: b.length }, () => 0)]);
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length]![b.length]!;
}

/** 入力に近い ID を返す（距離が短く、十分に似ているもの） */
export function suggestId(input: string, candidates: Iterable<string>): string | null {
  let best: { id: string; d: number } | null = null;
  for (const c of candidates) {
    const d = editDistance(input.toLowerCase(), c.toLowerCase());
    if (best === null || d < best.d || (d === best.d && c < best.id)) best = { id: c, d };
  }
  if (!best) return null;
  const limit = Math.max(1, Math.floor(input.length / 3));
  return best.d <= limit || (input.length >= 4 && best.id.toLowerCase().includes(input.toLowerCase())) ? best.id : null;
}

/**
 * 意味検査: ターゲットIDの存在、命令の解禁状態、ハンドラの制約。
 * 複数のエラーをまとめて返す。
 */
export function analyze(program: Program, stage: StageDefinition): HslError[] {
  const errors: HslError[] = [];
  const unlocked = new Set(stage.unlockedCommands);
  const waypointIds = new Set(stage.waypoints.map((w) => w.id));
  waypointIds.add('exit');
  const treasures = new Set(stage.objects.filter((o) => o.type === 'treasure').map((o) => o.id));
  const doors = new Set(stage.objects.filter((o) => o.type === 'door').map((o) => o.id));
  const lockers = new Set(stage.objects.filter((o) => o.type === 'locker').map((o) => o.id));
  const switches = new Set(stage.objects.filter((o) => o.type === 'switch').map((o) => o.id));
  const guards = new Set(stage.guards.map((g) => g.id));
  const thieves = new Set(stage.thieves.map((t) => t.id));
  const moveTargets = new Set([...waypointIds, ...treasures, ...doors, ...lockers, ...switches, ...guards, ...thieves]);

  const push = (line: number, col: number, message: string) => errors.push({ kind: 'semantic', line, col, message });
  const maybe = (input: string, cands: Iterable<string>): string => {
    const sug = suggestId(input, cands);
    return sug ? `。もしかして: ${sug}` : '';
  };
  const checkUnlocked = (cmd: string, line: number, col: number) => {
    if (!unlocked.has(cmd)) {
      push(line, col, `'${cmd}' はこのステージではまだ使えません。この行を消すか、使える命令で書き直してください（使える命令: ${stage.unlockedCommands.join(', ')}）`);
    }
  };

  const visitExpr = (e: Expr): void => {
    switch (e.kind) {
      case 'not':
        visitExpr(e.expr);
        break;
      case 'and':
      case 'or':
        visitExpr(e.left);
        visitExpr(e.right);
        break;
      default:
        break;
    }
  };

  const visitBlock = (blockId: number, seen: Set<number>): void => {
    if (seen.has(blockId)) return;
    seen.add(blockId);
    for (const stmt of program.blocks[blockId]!) visitStatement(stmt, seen);
  };

  const visitStatement = (stmt: Statement, seen: Set<number>): void => {
    switch (stmt.kind) {
      case 'action': {
        checkUnlocked(stmt.command, stmt.line, stmt.col);
        const target = stmt.target;
        switch (stmt.command) {
          case 'move':
            if (target && !moveTargets.has(target)) {
              push(stmt.line, stmt.col, `'${target}' はこのステージに存在しません${maybe(target, moveTargets)}（移動先に使える ID: ${[...moveTargets].join(', ')}）`);
            }
            break;
          case 'steal':
            if (target && !treasures.has(target)) {
              push(stmt.line, stmt.col, `'${target}' は盗める宝物ではありません${maybe(target, treasures)}（宝物: ${[...treasures].join(', ') || 'なし'}）`);
            }
            break;
          case 'open':
            if (target && !doors.has(target)) {
              push(stmt.line, stmt.col, `'${target}' は扉ではありません${maybe(target, doors)}（扉: ${[...doors].join(', ') || 'なし'}）`);
            }
            break;
          case 'knockout':
          case 'carry':
            if (target && !guards.has(target)) {
              push(stmt.line, stmt.col, `'${target}' は警備員ではありません${maybe(target, guards)}（警備員: ${[...guards].join(', ') || 'なし'}）`);
            }
            break;
          default:
            break;
        }
        break;
      }
      case 'wait':
        checkUnlocked('wait', stmt.line, stmt.col);
        break;
      case 'waitUntil':
        checkUnlocked('wait', stmt.line, stmt.col);
        visitExpr(stmt.cond);
        break;
      case 'signal':
        checkUnlocked('signal', stmt.line, stmt.col);
        break;
      case 'resume':
        checkUnlocked('resume', stmt.line, stmt.col);
        break;
      case 'if':
        checkUnlocked('if', stmt.line, stmt.col);
        visitExpr(stmt.cond);
        visitBlock(stmt.thenBlock, seen);
        if (stmt.elseBlock !== null) visitBlock(stmt.elseBlock, seen);
        break;
      case 'while':
        checkUnlocked('while', stmt.line, stmt.col);
        visitExpr(stmt.cond);
        visitBlock(stmt.body, seen);
        break;
    }
  };

  const seen = new Set<number>();
  visitBlock(0, seen);
  for (const h of Object.values(program.handlers)) {
    if (!h) continue;
    checkUnlocked('on', h.line, 1);
    visitBlock(h.blockId, seen);
  }
  // 行順に並べる
  errors.sort((a, b) => a.line - b.line || a.col - b.col);
  return errors;
}
