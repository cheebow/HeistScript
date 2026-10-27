import type { GameObject, WorldState } from '../model/types';
import { log, type SimContext } from './context';
import { posKey } from './grid';

function phaseOn(tick: number, on: number, off: number, offset: number): boolean {
  const period = on + off;
  if (period <= 0) return true;
  const t = (((tick + offset) % period) + period) % period;
  return t < on;
}

/** レーザーが作動中か（tick に対して決定的） */
export function laserActiveAt(o: GameObject, tick: number): boolean {
  return !!o.laser && phaseOn(tick, o.laser.onTicks, o.laser.offTicks, o.laser.offset);
}

/** タイマー扉が「開いているべき」tick か */
export function cycleDoorShouldBeOpen(o: GameObject, tick: number): boolean {
  return !!o.cycle && phaseOn(tick, o.cycle.openTicks, o.cycle.closedTicks, o.cycle.offset);
}

/** 人物（怪盗・床の警備員）が占めているタイル */
function personTiles(world: WorldState): Set<string> {
  const set = new Set<string>();
  for (const t of world.thieves) if (!t.captured) set.add(posKey(t));
  for (const g of world.guards) if (!g.carriedBy) set.add(posKey(g));
  return set;
}

/**
 * フェーズ1: ギミックの状態更新（タイマー扉・スイッチ・レーザー）。
 * 扉は「閉じるべきだが人物がいる」間は開いたままにする（挟まない）。
 */
export function updateGimmicks(world: WorldState, ctx: SimContext): void {
  void ctx;
  const people = personTiles(world);
  // スイッチ: 怪盗か床の気絶警備員が乗っていれば押下
  for (const sw of world.objects) {
    if (sw.type !== 'switch') continue;
    // 怪盗、または床にいる警備員（気絶中でも立っていても）が乗っていれば押下
    const onIt = world.thieves.some((t) => !t.captured && t.x === sw.x && t.y === sw.y) || world.guards.some((g) => !g.carriedBy && g.x === sw.x && g.y === sw.y);
    if (onIt !== sw.pressed) {
      sw.pressed = onIt;
      log(world, sw.id, onIt ? 'SWITCH_ON' : 'SWITCH_OFF', onIt ? `スイッチ ${sw.id} が押された` : `スイッチ ${sw.id} が離された`);
    }
  }
  for (const door of world.objects) {
    if (door.type !== 'door') continue;
    let shouldOpen: boolean | null = null;
    const switches = world.objects.filter((o) => o.type === 'switch' && o.targetDoorId === door.id);
    if (switches.length > 0) shouldOpen = switches.some((o) => o.pressed);
    else if (door.cycle) shouldOpen = cycleDoorShouldBeOpen(door, world.tick);
    if (shouldOpen === null) continue;
    if (shouldOpen && !door.open) {
      door.open = true;
      log(world, door.id, 'DOOR_OPEN', `扉 ${door.id} が開いた`);
    } else if (!shouldOpen && door.open) {
      if (people.has(posKey(door))) continue; // 人物がいる間は閉じない
      door.open = false;
      log(world, door.id, 'DOOR_CLOSE', `扉 ${door.id} が閉じた`);
    }
  }
  for (const laser of world.objects) {
    if (laser.type !== 'laser') continue;
    laser.active = laserActiveAt(laser, world.tick);
  }
}

/** フェーズ5: 作動中のレーザーに触れた怪盗で警報（立ち上がりのみ）。raiseAlarm は judge から渡す */
export function processLasers(world: WorldState, raise: (sourceId: string, at: { x: number; y: number }, reason: string) => void): void {
  for (const laser of world.objects) {
    if (laser.type !== 'laser') continue;
    const now: string[] = [];
    if (laser.active) {
      for (const t of world.thieves) {
        if (t.captured) continue;
        if (t.x === laser.x && t.y === laser.y) now.push(t.id);
      }
    }
    for (const id of now) {
      if (laser.hitThiefIds.includes(id)) continue;
      raise(laser.id, laser, `${id} がレーザー ${laser.id} に触れた`);
    }
    laser.hitThiefIds = now.sort();
  }
}
