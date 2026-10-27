import type { Expr } from '../hsl/ast';
import type { SimConfig } from '../model/config';
import type { Thief, WorldState } from '../model/types';
import { guardRange, isGuardActive } from './context';
import { manhattan, samePos } from './grid';
import { canSee } from './vision';

/** 述語を現在の確定ワールド状態で評価する（副作用なし） */
export function evaluatePredicate(world: WorldState, thief: Thief, name: string, arg: string | null, config: SimConfig): boolean {
  switch (name) {
    case 'guard_visible':
      return world.guards.some(
        (g) => isGuardActive(g) && canSee(world, { x: g.x, y: g.y, direction: g.direction, range: guardRange(g, config) }, thief),
      );
    case 'guard_near':
      return world.guards.some((g) => isGuardActive(g) && manhattan(g, thief) <= config.guardNearDistance);
    case 'guard_away':
      return !world.guards.some((g) => isGuardActive(g) && manhattan(g, thief) <= config.guardNearDistance);
    case 'has_treasure':
      return thief.inventory.some((id) => world.requiredTreasureIds.includes(id));
    case 'safe': {
      // 「今この場で姿を現しても見られない」: 隠れ状態に関係なく視線が通っていないこと、
      // かつ距離2以内に警戒中（CHASE/SEARCH/INVESTIGATE）の警備員がいないこと (D-07)
      const seen = world.guards.some(
        (g) => isGuardActive(g) && canSee(world, { x: g.x, y: g.y, direction: g.direction, range: guardRange(g, config) }, thief),
      );
      if (seen) return false;
      return !world.guards.some(
        (g) => isGuardActive(g) && g.state !== 'PATROL' && manhattan(g, thief) <= config.safeChaseDistance,
      );
    }
    case 'at_exit':
      return samePos(thief, world.exit);
    case 'signal_received':
      return arg !== null && world.signals[arg] === true;
    default:
      return false;
  }
}

export function evaluateExpr(world: WorldState, thief: Thief, expr: Expr, config: SimConfig): boolean {
  switch (expr.kind) {
    case 'bool':
      return expr.value;
    case 'pred':
      return evaluatePredicate(world, thief, expr.name, expr.arg, config);
    case 'not':
      return !evaluateExpr(world, thief, expr.expr, config);
    case 'and':
      return evaluateExpr(world, thief, expr.left, config) && evaluateExpr(world, thief, expr.right, config);
    case 'or':
      return evaluateExpr(world, thief, expr.left, config) || evaluateExpr(world, thief, expr.right, config);
  }
}
