import type { StageDefinition } from '../../src/core/model/stage';
import { assertStage } from '../../src/core/stages/validate';

export const ALL_UNLOCKED = ['move', 'steal', 'wait', 'hide', 'knockout', 'carry', 'drop', 'open', 'signal', 'resume', 'if', 'while', 'on'];

export function makeStage(tiles: string[], extra: Partial<StageDefinition> = {}): StageDefinition {
  const height = tiles.length;
  const width = tiles[0]!.length;
  return assertStage({
    schemaVersion: 1,
    id: 'test',
    title: 'test',
    width,
    height,
    tiles,
    waypoints: [],
    thieves: [{ id: 'thief_a', x: 1, y: 1, direction: 'right', starterScript: '' }],
    guards: [],
    cameras: [],
    objects: [],
    exit: { x: 1, y: 1 },
    maxTicks: 200,
    unlockedCommands: ALL_UNLOCKED,
    challenges: [],
    ...extra,
  });
}
