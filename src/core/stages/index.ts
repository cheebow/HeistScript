import type { StageDefinition } from '../model/stage';
import { assertStage } from './validate';
import stage01 from '../../../stages/stage_01.json';
import stage02 from '../../../stages/stage_02.json';
import stage03 from '../../../stages/stage_03.json';
import stage04 from '../../../stages/stage_04.json';
import stage05 from '../../../stages/stage_05.json';
import stage06 from '../../../stages/stage_06.json';
import stage07 from '../../../stages/stage_07.json';
import stage08 from '../../../stages/stage_08.json';
import stage09 from '../../../stages/stage_09.json';
import stage10 from '../../../stages/stage_10.json';
import stage11 from '../../../stages/stage_11.json';
import stage12 from '../../../stages/stage_12.json';
import stage13 from '../../../stages/stage_13.json';
import stage14 from '../../../stages/stage_14.json';
import stage15 from '../../../stages/stage_15.json';
import stage16 from '../../../stages/stage_16.json';
import stage17 from '../../../stages/stage_17.json';
import stage18 from '../../../stages/stage_18.json';
import stage19 from '../../../stages/stage_19.json';
import stage20 from '../../../stages/stage_20.json';
import stage21 from '../../../stages/stage_21.json';
import stage22 from '../../../stages/stage_22.json';
import stage23 from '../../../stages/stage_23.json';
import stage24 from '../../../stages/stage_24.json';
import stage25 from '../../../stages/stage_25.json';
import stage26 from '../../../stages/stage_26.json';
import stage27 from '../../../stages/stage_27.json';
import stage28 from '../../../stages/stage_28.json';
import stage29 from '../../../stages/stage_29.json';
import stage30 from '../../../stages/stage_30.json';
import stage31 from '../../../stages/stage_31.json';
import stage32 from '../../../stages/stage_32.json';
import stage33 from '../../../stages/stage_33.json';
import stage34 from '../../../stages/stage_34.json';
import stage35 from '../../../stages/stage_35.json';
import stage36 from '../../../stages/stage_36.json';
import stage37 from '../../../stages/stage_37.json';
import stage38 from '../../../stages/stage_38.json';
import stage39 from '../../../stages/stage_39.json';
import stage40 from '../../../stages/stage_40.json';
import stage41 from '../../../stages/stage_41.json';
import stage42 from '../../../stages/stage_42.json';
import stage43 from '../../../stages/stage_43.json';
import stage44 from '../../../stages/stage_44.json';
import stage45 from '../../../stages/stage_45.json';
import stage46 from '../../../stages/stage_46.json';
import stage47 from '../../../stages/stage_47.json';
import stage48 from '../../../stages/stage_48.json';
import stage49 from '../../../stages/stage_49.json';
import stage50 from '../../../stages/stage_50.json';
import stage51 from '../../../stages/stage_51.json';
import stage52 from '../../../stages/stage_52.json';
import stage53 from '../../../stages/stage_53.json';
import stage54 from '../../../stages/stage_54.json';
import stage55 from '../../../stages/stage_55.json';
import stage56 from '../../../stages/stage_56.json';
import stage57 from '../../../stages/stage_57.json';

// 表示順（章ごと）。ID は固定なので、順番を変えてもセーブデータは壊れない
const RAW_STAGES: unknown[] = [stage01, stage02, stage03, stage24, stage25, stage36, stage37, stage26, stage27, stage04, stage28, stage06, stage08, stage13, stage38, stage39, stage41, stage40, stage42, stage30, stage29, stage43, stage07, stage09, stage10, stage46, stage12, stage14, stage44, stage45, stage34, stage35, stage47, stage48, stage05, stage11, stage15, stage17, stage18, stage31, stage32, stage33, stage50, stage49, stage19, stage20, stage21, stage22, stage16, stage23, stage51, stage52, stage53, stage55, stage54, stage56, stage57];

let cache: StageDefinition[] | null = null;

/** 組み込みステージ（検証済み、順序固定） */
export function getStages(): StageDefinition[] {
  if (!cache) cache = RAW_STAGES.map((s) => assertStage(s));
  return cache;
}

export function getStage(id: string): StageDefinition | undefined {
  return getStages().find((s) => s.id === id);
}
