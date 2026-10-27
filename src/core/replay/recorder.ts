import type { WorldState } from '../model/types';

/** 構造化クローンでスナップショットを取る（WorldState は純粋データ） */
export function snapshot(world: WorldState): WorldState {
  return structuredClone(world);
}

export class ReplayRecorder {
  private readonly frames: WorldState[] = [];

  record(world: WorldState): void {
    this.frames[world.tick] = snapshot(world);
  }

  get length(): number {
    return this.frames.length;
  }

  at(tick: number): WorldState | undefined {
    return this.frames[tick];
  }

  last(): WorldState | undefined {
    return this.frames[this.frames.length - 1];
  }
}
