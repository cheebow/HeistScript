import type { StageDefinition } from '../core/model/stage';

export interface EntityInfo {
  id: string;
  /** 日本語名 */
  label: string;
  /** 種類（日本語） */
  kind: string;
  description: string;
  pos: string;
  /** 使える命令の例 */
  usage: string;
  /** 補完で対象にできる命令 */
  commands: string[];
}

/** ステージ内で命令の対象にできる ID と、その日本語名・説明 */
export function stageEntities(stage: StageDefinition): EntityInfo[] {
  const rows: EntityInfo[] = [];
  const exitWp = stage.waypoints.find((w) => w.id === 'exit');
  rows.push({
    id: 'exit',
    label: exitWp?.label ?? '出口',
    kind: '出口',
    description: exitWp?.description ?? '全員がここに着くとクリア',
    pos: `(${stage.exit.x},${stage.exit.y})`,
    usage: 'move exit',
    commands: ['move'],
  });
  for (const w of stage.waypoints) {
    if (w.id === 'exit') continue;
    rows.push({ id: w.id, label: w.label ?? w.id, kind: '地点', description: w.description ?? '', pos: `(${w.x},${w.y})`, usage: `move ${w.id}`, commands: ['move', 'distract'] });
  }
  for (const o of stage.objects) {
    const pos = `(${o.x},${o.y})`;
    if (o.type === 'treasure') {
      rows.push({ id: o.id, label: o.label ?? '宝物', kind: '宝物', description: o.description ?? '', pos, usage: `move ${o.id} → steal ${o.id}`, commands: ['move', 'steal', 'distract'] });
    } else if (o.type === 'key') {
      rows.push({ id: o.id, label: o.label ?? '鍵', kind: '鍵', description: o.description ?? `扉 ${o.unlocks} を開けられるカードキー`, pos, usage: `move ${o.id} → steal ${o.id}`, commands: ['move', 'steal', 'distract'] });
    } else if (o.type === 'door') {
      rows.push({ id: o.id, label: o.label ?? '扉', kind: '扉', description: o.description ?? (o.locked ? '施錠されている。鍵を持って open' : ''), pos, usage: o.locked ? `鍵を steal → open ${o.id}（隣接して）` : `open ${o.id}（隣接して）`, commands: ['move', 'open', 'distract'] });
    } else if (o.type === 'locker') {
      rows.push({ id: o.id, label: o.label ?? 'ロッカー', kind: 'ロッカー', description: o.description ?? '', pos, usage: `move ${o.id} → hide`, commands: ['move', 'distract'] });
    } else if (o.type === 'laser') {
      rows.push({ id: o.id, label: o.label ?? 'レーザー', kind: 'レーザー', description: o.description ?? `${o.onTicks ?? 1} tick 作動・${o.offTicks ?? 0} tick 停止の周期。作動中に触れると警報`, pos, usage: '（止まっている間に通る）', commands: [] });
    } else {
      rows.push({ id: o.id, label: o.label ?? 'スイッチ', kind: 'スイッチ', description: o.description ?? `乗っている間だけ扉 ${o.targetDoorId} が開く`, pos, usage: `move ${o.id}（乗る）`, commands: ['move', 'distract'] });
    }
  }
  for (const g of stage.guards) {
    rows.push({ id: g.id, label: g.label ?? '警備員', kind: '警備員', description: `${g.description ?? ''}${g.visionRange !== undefined ? `（視界 ${g.visionRange} マス）` : ''}`, pos: `(${g.x},${g.y}) から`, usage: `knockout ${g.id} / carry ${g.id}`, commands: ['move', 'knockout', 'carry'] });
  }
  for (const c of stage.cameras) {
    rows.push({ id: c.id, label: c.label ?? '監視カメラ', kind: 'カメラ', description: c.description ?? '', pos: `(${c.x},${c.y})`, usage: '（命令の対象にはならない）', commands: [] });
  }
  for (const t of stage.thieves) {
    rows.push({ id: t.id, label: t.label ?? '怪盗', kind: '怪盗', description: t.description ?? '', pos: `(${t.x},${t.y}) から`, usage: `move ${t.id}（隣まで）`, commands: ['move'] });
  }
  return rows;
}

/** ID → 日本語名 */
export function labelOf(stage: StageDefinition, id: string): string {
  return stageEntities(stage).find((e) => e.id === id)?.label ?? id;
}
