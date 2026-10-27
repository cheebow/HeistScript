import type { Program } from '../hsl/ast';
import type { SimConfig } from '../model/config';
import type { Guard, LogEntry, LogLevel, WorldState } from '../model/types';

export interface SimContext {
  programs: Record<string, Program>;
  config: SimConfig;
}

export function log(
  world: WorldState,
  actorId: string,
  eventType: string,
  details: string,
  scriptLine: number | null = null,
  level: LogLevel = 'info',
): LogEntry {
  const entry: LogEntry = { tick: world.tick, actorId, eventType, details, scriptLine, level };
  world.tickLog.push(entry);
  return entry;
}

export function findThief(world: WorldState, id: string) {
  return world.thieves.find((t) => t.id === id);
}

export function findGuard(world: WorldState, id: string) {
  return world.guards.find((g) => g.id === id);
}

export function findObject(world: WorldState, id: string) {
  return world.objects.find((o) => o.id === id);
}

export function findVm(world: WorldState, thiefId: string) {
  return world.vms.find((v) => v.thiefId === thiefId);
}

export function isGuardActive(g: { state: string; carriedBy: string | null }): boolean {
  return g.state !== 'UNCONSCIOUS' && g.carriedBy === null;
}

/** 警備員の視界射程（ステージごとの上書きがなければ設定値） */
export function guardRange(g: Guard, config: SimConfig): number {
  return g.visionRange ?? config.guardVisionRange;
}
