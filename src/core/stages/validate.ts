import type { StageDefinition } from '../model/stage';
import { ALL_COMMANDS } from '../model/stage';
import type { Direction } from '../model/types';

export interface StageValidationError {
  path: string;
  message: string;
}

const DIRECTIONS: Direction[] = ['up', 'right', 'down', 'left'];

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * ステージ JSON の自前バリデータ。必須属性・ID一意性・座標・巡回点到達性・出口存在を検証する。
 */
export function validateStage(raw: unknown): { ok: true; stage: StageDefinition } | { ok: false; errors: StageValidationError[] } {
  const errors: StageValidationError[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });

  if (!isObj(raw)) return { ok: false, errors: [{ path: '', message: 'ステージはオブジェクトである必要があります' }] };
  const s = raw;

  if (s.schemaVersion !== 1) err('schemaVersion', 'schemaVersion は 1 である必要があります');
  if (typeof s.id !== 'string' || !s.id) err('id', 'id は空でない文字列');
  if (typeof s.title !== 'string') err('title', 'title は文字列');
  if (!isInt(s.width) || (s.width as number) < 4) err('width', 'width は4以上の整数');
  if (!isInt(s.height) || (s.height as number) < 4) err('height', 'height は4以上の整数');
  if (!isInt(s.maxTicks) || (s.maxTicks as number) <= 0) err('maxTicks', 'maxTicks は正の整数');

  const width = isInt(s.width) ? s.width : 0;
  const height = isInt(s.height) ? s.height : 0;

  if (!Array.isArray(s.tiles)) {
    err('tiles', 'tiles は文字列配列');
  } else {
    if (s.tiles.length !== height) err('tiles', `tiles の行数 ${s.tiles.length} が height ${height} と一致しません`);
    s.tiles.forEach((row, y) => {
      if (typeof row !== 'string') {
        err(`tiles[${y}]`, '文字列である必要があります');
        return;
      }
      if (row.length !== width) err(`tiles[${y}]`, `幅 ${row.length} が width ${width} と一致しません`);
      for (let x = 0; x < row.length; x++) {
        const c = row[x]!;
        if (!'#.HDE'.includes(c)) err(`tiles[${y}][${x}]`, `不明なタイル文字 '${c}'`);
      }
    });
  }
  const tiles = Array.isArray(s.tiles) ? (s.tiles as string[]) : [];
  const tileAt = (x: number, y: number): string | undefined => tiles[y]?.[x];
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  const walkable = (x: number, y: number) => inBounds(x, y) && tileAt(x, y) !== '#';

  const ids = new Map<string, string>();
  const checkId = (id: unknown, path: string): string | null => {
    if (typeof id !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) {
      err(path, `id '${String(id)}' は識別子（英字/アンダースコア開始、英数字とアンダースコア）である必要があります`);
      return null;
    }
    if (ids.has(id)) {
      err(path, `id '${id}' が重複しています（${ids.get(id)}）`);
      return null;
    }
    ids.set(id, path);
    return id;
  };
  const checkPos = (o: Record<string, unknown>, path: string, mustWalk = true) => {
    if (!isInt(o.x) || !isInt(o.y) || !inBounds(o.x, o.y)) {
      err(path, `座標 (${String(o.x)},${String(o.y)}) がマップ外または整数でありません`);
      return false;
    }
    if (mustWalk && !walkable(o.x, o.y)) {
      err(path, `座標 (${o.x},${o.y}) は壁です`);
      return false;
    }
    return true;
  };
  const checkLabel = (o: Record<string, unknown>, path: string) => {
    if (o.label !== undefined && typeof o.label !== 'string') err(`${path}.label`, '文字列が必要です');
    if (o.description !== undefined && typeof o.description !== 'string') err(`${path}.description`, '文字列が必要です');
  };
  const checkDir = (d: unknown, path: string) => {
    if (!DIRECTIONS.includes(d as Direction)) err(path, `direction '${String(d)}' は up/right/down/left のいずれか`);
  };

  // exit
  if (!isObj(s.exit)) err('exit', 'exit は {x,y}');
  else checkPos(s.exit, 'exit');

  // waypoints
  if (!Array.isArray(s.waypoints)) err('waypoints', '配列が必要です');
  else
    s.waypoints.forEach((w, i) => {
      if (!isObj(w)) return err(`waypoints[${i}]`, 'オブジェクトが必要です');
      checkId(w.id, `waypoints[${i}].id`);
      checkPos(w, `waypoints[${i}]`);
      checkLabel(w, `waypoints[${i}]`);
    });

  // thieves
  if (!Array.isArray(s.thieves) || s.thieves.length < 1 || s.thieves.length > 3) {
    err('thieves', '怪盗は1〜3人');
  } else
    s.thieves.forEach((t, i) => {
      if (!isObj(t)) return err(`thieves[${i}]`, 'オブジェクトが必要です');
      checkId(t.id, `thieves[${i}].id`);
      checkPos(t, `thieves[${i}]`);
      checkLabel(t, `thieves[${i}]`);
      checkDir(t.direction, `thieves[${i}].direction`);
      if (typeof t.starterScript !== 'string') err(`thieves[${i}].starterScript`, '文字列が必要です');
    });

  // guards
  if (!Array.isArray(s.guards)) err('guards', '配列が必要です');
  else
    s.guards.forEach((g, i) => {
      if (!isObj(g)) return err(`guards[${i}]`, 'オブジェクトが必要です');
      checkId(g.id, `guards[${i}].id`);
      checkPos(g, `guards[${i}]`);
      checkLabel(g, `guards[${i}]`);
      checkDir(g.direction, `guards[${i}].direction`);
      if (!Array.isArray(g.patrolRoute)) err(`guards[${i}].patrolRoute`, '配列が必要です');
      else
        g.patrolRoute.forEach((p, j) => {
          if (!isObj(p)) return err(`guards[${i}].patrolRoute[${j}]`, 'オブジェクトが必要です');
          checkPos(p, `guards[${i}].patrolRoute[${j}]`);
          if (!isInt(p.waitTicks) || (p.waitTicks as number) < 0) err(`guards[${i}].patrolRoute[${j}].waitTicks`, '0以上の整数');
        });
    });

  // cameras
  if (!Array.isArray(s.cameras)) err('cameras', '配列が必要です');
  else
    s.cameras.forEach((c, i) => {
      if (!isObj(c)) return err(`cameras[${i}]`, 'オブジェクトが必要です');
      checkId(c.id, `cameras[${i}].id`);
      checkPos(c, `cameras[${i}]`, false);
      checkLabel(c, `cameras[${i}]`);
      checkDir(c.direction, `cameras[${i}].direction`);
      if (!isInt(c.range) || (c.range as number) <= 0) err(`cameras[${i}].range`, '正の整数');
      if (!isInt(c.rotateEveryTicks) || (c.rotateEveryTicks as number) < 0) err(`cameras[${i}].rotateEveryTicks`, '0以上の整数');
    });

  // objects
  const doorTiles = new Set<string>();
  if (!Array.isArray(s.objects)) err('objects', '配列が必要です');
  else
    s.objects.forEach((o, i) => {
      if (!isObj(o)) return err(`objects[${i}]`, 'オブジェクトが必要です');
      checkId(o.id, `objects[${i}].id`);
      checkLabel(o, `objects[${i}]`);
      if (!['treasure', 'door', 'locker', 'laser', 'switch'].includes(o.type as string)) err(`objects[${i}].type`, 'treasure/door/locker/laser/switch のいずれか');
      if (o.type === 'laser') {
        if (!isInt(o.onTicks) || (o.onTicks as number) <= 0) err(`objects[${i}].onTicks`, '正の整数');
        if (!isInt(o.offTicks) || (o.offTicks as number) < 0) err(`objects[${i}].offTicks`, '0以上の整数');
        if (o.offset !== undefined && !isInt(o.offset)) err(`objects[${i}].offset`, '整数');
      }
      if (o.type === 'door' && o.cycle !== undefined) {
        const c = o.cycle;
        if (!isObj(c) || !isInt(c.openTicks) || (c.openTicks as number) <= 0 || !isInt(c.closedTicks) || (c.closedTicks as number) <= 0) err(`objects[${i}].cycle`, 'openTicks/closedTicks は正の整数');
        else if (c.offset !== undefined && !isInt(c.offset)) err(`objects[${i}].cycle.offset`, '整数');
      }
      if (o.type === 'switch') {
        if (typeof o.targetDoorId !== 'string') err(`objects[${i}].targetDoorId`, '扉の ID が必要です');
        else if (!(s.objects as unknown[]).some((d) => isObj(d) && d.type === 'door' && d.id === o.targetDoorId)) err(`objects[${i}].targetDoorId`, `扉 '${String(o.targetDoorId)}' が存在しません`);
      }
      if (checkPos(o, `objects[${i}]`)) {
        if (o.type === 'door') {
          doorTiles.add(`${o.x},${o.y}`);
          if (tileAt(o.x as number, o.y as number) !== 'D') err(`objects[${i}]`, '扉は D タイルに置く必要があります');
          if (o.locked === true) err(`objects[${i}].locked`, 'MVPでは施錠扉は使用できません');
        }
      }
    });
  // D タイルには扉オブジェクトが必須
  tiles.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'D' && !doorTiles.has(`${x},${y}`)) err(`tiles[${y}][${x}]`, 'D タイルに対応する扉オブジェクトがありません');
      if (row[x] === 'E' && isObj(s.exit) && !(s.exit.x === x && s.exit.y === y)) err(`tiles[${y}][${x}]`, 'E タイルの座標が exit と一致しません');
    }
  });

  // unlockedCommands
  if (!Array.isArray(s.unlockedCommands)) err('unlockedCommands', '配列が必要です');
  else
    s.unlockedCommands.forEach((c, i) => {
      if (!(ALL_COMMANDS as readonly string[]).includes(c as string)) err(`unlockedCommands[${i}]`, `不明な命令 '${String(c)}'`);
    });

  if (s.challenges !== undefined && !Array.isArray(s.challenges)) err('challenges', '配列が必要です');

  // 巡回点到達性: 床タイルのみで BFS（扉は通行可とみなす）
  if (errors.length === 0) {
    const stage = s as unknown as StageDefinition;
    const reach = (from: { x: number; y: number }, to: { x: number; y: number }): boolean => {
      const seen = new Set<string>();
      const q = [from];
      seen.add(`${from.x},${from.y}`);
      while (q.length) {
        const c = q.shift()!;
        if (c.x === to.x && c.y === to.y) return true;
        for (const [dx, dy] of [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ] as const) {
          const n = { x: c.x + dx, y: c.y + dy };
          const k = `${n.x},${n.y}`;
          if (seen.has(k) || !walkable(n.x, n.y)) continue;
          seen.add(k);
          q.push(n);
        }
      }
      return false;
    };
    stage.guards.forEach((g, i) => {
      let prev = { x: g.x, y: g.y };
      g.patrolRoute.forEach((p, j) => {
        if (!reach(prev, p)) err(`guards[${i}].patrolRoute[${j}]`, `巡回点 (${p.x},${p.y}) へ到達できません`);
        prev = p;
      });
    });
    stage.thieves.forEach((t, i) => {
      if (!reach(t, stage.exit)) err(`thieves[${i}]`, '出口へ到達できません（扉を含む静的経路）');
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, stage: s as unknown as StageDefinition };
}

export function assertStage(raw: unknown): StageDefinition {
  const r = validateStage(raw);
  if (!r.ok) {
    throw new Error('ステージ検証エラー:\n' + r.errors.map((e) => `  ${e.path}: ${e.message}`).join('\n'));
  }
  return r.stage;
}
