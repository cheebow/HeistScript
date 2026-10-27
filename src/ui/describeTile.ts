import type { StageDefinition } from '../core/model/stage';
import type { WorldState } from '../core/model/types';
import type { TileInfo } from './GameView';
import { stageEntities } from './stageInfo';

const DIR_JA: Record<string, string> = { up: '上', right: '右', down: '下', left: '左' };
const GUARD_STATE_JA: Record<string, string> = { PATROL: '巡回中', INVESTIGATE: '調査中', CHASE: '追跡中！', SEARCH: '捜索中', UNCONSCIOUS: '気絶中' };

/** マップ上のタイルの説明（ツールチップ用）。何もない床なら null。 */
export function describeTile(stage: StageDefinition, world: WorldState, x: number, y: number): TileInfo | null {
  const ents = stageEntities(stage);
  const info = (id: string) => ents.find((e) => e.id === id);
  const lines: string[] = [];
  let title = '';

  for (const t of world.thieves) {
    if (t.x !== x || t.y !== y) continue;
    const e = info(t.id);
    title = `${e?.label ?? '怪盗'}（${t.id}）`;
    if (e?.description) lines.push(e.description);
    const st = t.captured ? '逮捕された' : t.hidden ? '隠れている' : '行動中';
    lines.push(`状態: ${st}／向き: ${DIR_JA[t.direction]}`);
    if (t.inventory.length) lines.push(`所持: ${t.inventory.join(', ')}`);
    if (t.carrying) lines.push(`${t.carrying} を担いでいる`);
  }
  for (const g of world.guards) {
    if (g.x !== x || g.y !== y || g.carriedBy) continue;
    const e = info(g.id);
    if (title) lines.push('');
    title = title || `${e?.label ?? '警備員'}（${g.id}）`;
    if (!title.includes(g.id)) lines.push(`${e?.label ?? '警備員'}（${g.id}）`);
    if (e?.description) lines.push(e.description);
    lines.push(`状態: ${GUARD_STATE_JA[g.state]}／向き: ${DIR_JA[g.direction]}`);
    if (g.state === 'UNCONSCIOUS' && g.wakeTick !== null) lines.push(`目覚めまで ${Math.max(0, g.wakeTick - world.tick)} tick`);
    if (g.state !== 'UNCONSCIOUS') lines.push(`真後ろ（${DIR_JA[oppositeOf(g.direction)]}側の隣）から knockout ${g.id} できる`);
  }
  for (const c of world.cameras) {
    if (c.x !== x || c.y !== y) continue;
    const e = info(c.id);
    title = title || `${e?.label ?? '監視カメラ'}（${c.id}）`;
    if (e?.description) lines.push(e.description);
    lines.push(`向き: ${DIR_JA[c.direction]}／範囲 ${c.range} マス${c.rotateEveryTicks ? `／${c.rotateEveryTicks} tick ごとに回転` : ''}。映ると警報が鳴る`);
  }
  for (const o of world.objects) {
    if (o.x !== x || o.y !== y) continue;
    if ((o.type === 'treasure' || o.type === 'key') && o.takenBy !== null) continue;
    const e = info(o.id);
    const kind = o.type === 'treasure' ? '宝物' : o.type === 'key' ? '鍵' : o.type === 'door' ? '扉' : o.type === 'locker' ? 'ロッカー' : o.type === 'laser' ? 'レーザー' : 'スイッチ';
    title = title || `${e?.label ?? kind}（${o.id}）`;
    if (e?.description) lines.push(e.description);
    if (o.type === 'treasure') lines.push(`move ${o.id} で隣まで行き、steal ${o.id} で盗む${o.required ? '（必須）' : ''}`);
    if (o.type === 'key') lines.push(`move ${o.id} で隣まで行き、steal ${o.id} で手に入れる。扉 ${o.unlocks} を open できるようになる`);
    if (o.type === 'door') {
      const sw = world.objects.find((x) => x.type === 'switch' && x.targetDoorId === o.id);
      if (sw) lines.push(`${o.open ? '開いている' : '閉まっている'}。スイッチ ${sw.id} が押されている間だけ開く`);
      else if (o.cycle) lines.push(`${o.open ? '開いている' : '閉まっている'}。${o.cycle.openTicks} tick 開いて ${o.cycle.closedTicks} tick 閉じる周期。閉じているときは開くまで待つ`);
      else if (o.locked) lines.push(`施錠されている。鍵 ${world.objects.find((k) => k.type === 'key' && k.unlocks === o.id)?.id ?? '?'} を持って隣接し、open ${o.id} で開ける`);
      else lines.push(o.open ? '開いている' : `閉まっている。隣接して open ${o.id} で開ける`);
    }
    if (o.type === 'locker') lines.push(`move ${o.id} で乗り、hide で隠れる`);
    if (o.type === 'laser') lines.push(`${o.active ? '作動中！' : '停止中'}（${o.laser?.onTicks} tick 作動／${o.laser?.offTicks} tick 停止）。作動中に触れると警報が鳴る`);
    if (o.type === 'switch') lines.push(`${o.pressed ? '押されている' : '押されていない'}。怪盗か気絶した警備員が乗っている間、扉 ${o.targetDoorId} が開く`);
  }
  for (const [id, pos] of Object.entries(world.waypoints)) {
    if (pos.x !== x || pos.y !== y) continue;
    const e = info(id);
    if (title && lines.some((l) => l.includes(id))) continue;
    if (!title) title = `${e?.label ?? id}（${id}）`;
    else lines.push(`地点 ${e?.label ?? id}（${id}）`);
    if (e?.description) lines.push(e.description);
    if (id !== 'exit' || !stage.objects.some((o) => o.x === x && o.y === y)) lines.push(`move ${id} でここへ移動`);
  }

  const kind = world.tiles[y]?.[x];
  if (kind === 'exit' && !title) {
    title = '出口（exit）';
    lines.push('宝物を手に入れた怪盗が全員ここに着くとクリア。move exit で移動');
  } else if (kind === 'hiding_spot' && !lines.some((l) => l.includes('hide'))) {
    if (!title) title = '隠れ場所';
    lines.push('このマスの上で hide を実行すると姿を隠せる（警備員・カメラから見えなくなる）');
  } else if (kind === 'vent') {
    if (!title) title = '通風口';
    lines.push('怪盗だけが通れる。警備員は入れず、中は外から見えない（経路は move が自動で使う）');
  } else if (kind === 'wall') {
    if (!title) title = '壁';
    lines.push('通れない。視線も遮る');
  } else if (kind === 'door' && !title) {
    title = '扉';
  }
  if (!title) return null;
  return { title, lines: lines.filter((l) => l !== '') };
}

function oppositeOf(d: string): string {
  return d === 'up' ? 'down' : d === 'down' ? 'up' : d === 'left' ? 'right' : 'left';
}
