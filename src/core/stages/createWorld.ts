import type { StageDefinition } from '../model/stage';
import type { Camera, GameObject, Guard, Position, Thief, TileKind, WorldState } from '../model/types';

function charToTile(c: string): TileKind {
  switch (c) {
    case '#':
      return 'wall';
    case 'H':
      return 'hiding_spot';
    case 'D':
      return 'door';
    case 'E':
      return 'exit';
    case 'V':
      return 'vent';
    default:
      return 'floor';
  }
}

/** ステージ定義から初期 WorldState を生成する（VM は runner 側で追加） */
export function createWorld(stage: StageDefinition): WorldState {
  const tiles: TileKind[][] = stage.tiles.map((row) => row.split('').map(charToTile));
  // exit 座標のタイルを exit に昇格
  const exitRow = tiles[stage.exit.y];
  if (exitRow && exitRow[stage.exit.x] !== 'wall') exitRow[stage.exit.x] = 'exit';

  const waypoints: Record<string, Position> = {};
  for (const w of stage.waypoints) waypoints[w.id] = { x: w.x, y: w.y };
  if (!waypoints['exit']) waypoints['exit'] = { x: stage.exit.x, y: stage.exit.y };

  const thieves: Thief[] = [...stage.thieves]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((t) => ({
      id: t.id,
      x: t.x,
      y: t.y,
      direction: t.direction,
      hidden: false,
      inventory: [],
      carrying: null,
      moveProgress: 0,
      captured: false,
    }));

  const guards: Guard[] = [...stage.guards]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((g) => ({
      id: g.id,
      x: g.x,
      y: g.y,
      direction: g.direction,
      patrolRoute: g.patrolRoute.map((p) => ({ x: p.x, y: p.y, waitTicks: p.waitTicks })),
      visionRange: g.visionRange ?? null,
      homeDirection: g.direction,
      state: 'PATROL',
      patrolIndex: 0,
      patrolWaitRemaining: 0,
      moveProgress: 0,
      path: [],
      targetPos: null,
      chaseTargetId: null,
      lastSeenPos: null,
      observeRemaining: 0,
      searchTurnCounter: 0,
      wakeTick: null,
      sleepRemaining: null,
      carriedBy: null,
      unconsciousReported: false,
      capture: null,
      reviveTargetId: null,
      reviveRemaining: 0,
      visibleThiefIds: [],
    }));

  const cameras: Camera[] = [...stage.cameras]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((c) => ({
      id: c.id,
      x: c.x,
      y: c.y,
      direction: c.direction,
      range: c.range,
      rotateEveryTicks: c.rotateEveryTicks,
      visibleThiefIds: [],
    }));

  const objects: GameObject[] = [...stage.objects]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((o) => ({
      id: o.id,
      type: o.type,
      x: o.x,
      y: o.y,
      required: o.type === 'treasure' ? o.required !== false : false,
      takenBy: null,
      open: o.type === 'door' ? o.open === true : false,
      locked: o.type === 'door' ? o.locked === true : false,
      initiallyOpen: o.type === 'door' ? o.open === true : false,
      noticed: false,
      cycle: o.type === 'door' && o.cycle ? { openTicks: o.cycle.openTicks, closedTicks: o.cycle.closedTicks, offset: o.cycle.offset ?? 0 } : null,
      laser: o.type === 'laser' ? { onTicks: o.onTicks ?? 1, offTicks: o.offTicks ?? 0, offset: o.offset ?? 0 } : null,
      active: false,
      hitThiefIds: [],
      targetDoorId: o.type === 'switch' ? (o.targetDoorId ?? null) : null,
      pressed: false,
      unlocks: o.type === 'key' ? (o.unlocks ?? null) : null,
    }));

  for (const o of objects) {
    if (o.laser) o.active = (((0 + o.laser.offset) % (o.laser.onTicks + o.laser.offTicks)) + (o.laser.onTicks + o.laser.offTicks)) % (o.laser.onTicks + o.laser.offTicks) < o.laser.onTicks;
    if (o.cycle) o.open = (((0 + o.cycle.offset) % (o.cycle.openTicks + o.cycle.closedTicks)) + (o.cycle.openTicks + o.cycle.closedTicks)) % (o.cycle.openTicks + o.cycle.closedTicks) < o.cycle.openTicks;
  }

  return {
    stageId: stage.id,
    tick: 0,
    width: stage.width,
    height: stage.height,
    tiles,
    waypoints,
    exit: { x: stage.exit.x, y: stage.exit.y },
    thieves,
    guards,
    cameras,
    objects,
    vms: [],
    signals: {},
    eventQueue: [],
    alarmActive: false,
    lastAlarmPos: null,
    stats: { spottedCount: 0, knockoutCount: 0, alarmCount: 0, instructionCount: 0 },
    result: null,
    maxTicks: stage.maxTicks,
    tickLog: [],
    requiredTreasureIds: objects.filter((o) => o.type === 'treasure' && o.required).map((o) => o.id),
  };
}
