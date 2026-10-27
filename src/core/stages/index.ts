import type { StageDefinition } from '../model/stage';
import { assertStage } from './validate';
import stage01 from '../../../stages/stage_01.json';
import stage02 from '../../../stages/stage_02.json';
import stage03 from '../../../stages/stage_03.json';
import stage04 from '../../../stages/stage_04.json';
import stage05 from '../../../stages/stage_05.json';
import stage06 from '../../../stages/stage_06.json';

const RAW_STAGES: unknown[] = [stage01, stage02, stage03, stage04, stage05, stage06];

let cache: StageDefinition[] | null = null;

/** 組み込みステージ（検証済み、順序固定） */
export function getStages(): StageDefinition[] {
  if (!cache) cache = RAW_STAGES.map((s) => assertStage(s));
  return cache;
}

export function getStage(id: string): StageDefinition | undefined {
  return getStages().find((s) => s.id === id);
}
