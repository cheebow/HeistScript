import type { Camera, GameObject, WorldState } from '../model/types';
import { rotateClockwise } from './grid';
import { cycleDoorShouldBeOpen, laserActiveAt } from './gimmicks';

const DIR_JA: Record<string, string> = { up: '上', right: '右', down: '下', left: '左' };

/** 周期のある設備の「次に状態が変わるまでの tick 数」。数えなくても分かるようにする（プレイヤーが周期を数える作業をなくす） */
export interface PeriodicInfo {
  id: string;
  kind: 'camera' | 'laser' | 'door';
  /** いまの状態（表示用） */
  state: string;
  /** 次の変化まで何 tick か */
  remaining: number;
  /** 次の状態（表示用） */
  next: string;
  /** 一周の長さ（tick） */
  period: number;
}

/** カメラが次に向きを変えるまでの tick 数（tick % R === 0 の tick に回る） */
export function cameraTurnIn(cam: Camera, tick: number): number | null {
  if (cam.rotateEveryTicks <= 0) return null;
  const r = cam.rotateEveryTicks;
  const m = ((tick % r) + r) % r;
  return r - m;
}

function phaseInfo(tick: number, on: number, off: number, offset: number): { active: boolean; remaining: number; period: number } {
  const period = on + off;
  if (period <= 0) return { active: true, remaining: 0, period: 0 };
  const t = (((tick + offset) % period) + period) % period;
  return t < on ? { active: true, remaining: on - t, period } : { active: false, remaining: period - t, period };
}

export function laserInfo(o: GameObject, tick: number): PeriodicInfo | null {
  if (!o.laser) return null;
  const p = phaseInfo(tick, o.laser.onTicks, o.laser.offTicks, o.laser.offset);
  // 表示中の tick の状態と一致させる
  const active = laserActiveAt(o, tick);
  return { id: o.id, kind: 'laser', state: active ? '作動中' : '停止中', remaining: p.remaining, next: active ? '停止' : '作動', period: p.period };
}

export function doorCycleInfo(o: GameObject, tick: number): PeriodicInfo | null {
  if (!o.cycle) return null;
  const p = phaseInfo(tick, o.cycle.openTicks, o.cycle.closedTicks, o.cycle.offset);
  const open = cycleDoorShouldBeOpen(o, tick);
  return { id: o.id, kind: 'door', state: open ? '開' : '閉', remaining: p.remaining, next: open ? '閉じる' : '開く', period: p.period };
}

export function cameraInfo(cam: Camera, tick: number): PeriodicInfo | null {
  const r = cameraTurnIn(cam, tick);
  if (r === null) return null;
  return { id: cam.id, kind: 'camera', state: DIR_JA[cam.direction] ?? cam.direction, remaining: r, next: DIR_JA[rotateClockwise(cam.direction)] ?? '', period: cam.rotateEveryTicks * 4 };
}

/** ステージ内の周期設備をすべて列挙する（カメラ → レーザー → タイマー扉の順、ID 順） */
export function periodicInfos(world: WorldState): PeriodicInfo[] {
  const out: PeriodicInfo[] = [];
  for (const c of world.cameras) {
    const i = cameraInfo(c, world.tick);
    if (i) out.push(i);
  }
  for (const o of world.objects) {
    const i = o.type === 'laser' ? laserInfo(o, world.tick) : o.type === 'door' ? doorCycleInfo(o, world.tick) : null;
    if (i) out.push(i);
  }
  return out;
}

/** 1 行の日本語にする */
export function describePeriodic(i: PeriodicInfo): string {
  if (i.kind === 'camera') return `いま${i.state}向き。${i.remaining} tick 後に${i.next}向きへ（一周 ${i.period} tick）`;
  if (i.kind === 'laser') return `いま${i.state}。${i.remaining} tick 後に${i.next}（周期 ${i.period} tick）`;
  return `いま${i.state}。${i.remaining} tick 後に${i.next}（周期 ${i.period} tick）`;
}
