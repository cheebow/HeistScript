import type { Direction } from './types';

/** ステージ JSON の型 (SPEC 10節) */
export interface StageDefinition {
  schemaVersion: number;
  id: string;
  title: string;
  description?: string;
  width: number;
  height: number;
  tiles: string[];
  waypoints: StageWaypoint[];
  thieves: StageThief[];
  guards: StageGuard[];
  cameras: StageCamera[];
  objects: StageObject[];
  exit: { x: number; y: number };
  maxTicks: number;
  unlockedCommands: string[];
  challenges: StageChallenge[];
  hints?: string[];
  /** 検証で成功が担保されているサンプルスクリプト (thiefId → script) */
  solution?: Record<string, string>;
  /** 複数解法（それぞれテストで成功を担保） */
  solutions?: { id: string; title: string; scripts: Record<string, string> }[];
}

/** ID に付ける日本語名と説明（ヘルプ・補完・インスペクタで表示） */
export interface Labeled {
  label?: string;
  description?: string;
}

export interface StageWaypoint extends Labeled {
  id: string;
  x: number;
  y: number;
}

export interface StageThief extends Labeled {
  id: string;
  x: number;
  y: number;
  direction: Direction;
  starterScript: string;
}

export interface StageGuard extends Labeled {
  id: string;
  x: number;
  y: number;
  direction: Direction;
  patrolRoute: { x: number; y: number; waitTicks: number }[];
}

export interface StageCamera extends Labeled {
  id: string;
  x: number;
  y: number;
  direction: Direction;
  range: number;
  rotateEveryTicks: number;
}

export interface StageObject extends Labeled {
  id: string;
  type: 'treasure' | 'door' | 'locker';
  x: number;
  y: number;
  required?: boolean;
  open?: boolean;
  locked?: boolean;
}

export interface StageChallenge {
  id: string;
  type: 'maxTicks' | 'noSpotted' | 'noKnockout' | 'noAlarm';
  value?: number;
  title?: string;
}

export const ALL_COMMANDS = [
  'move',
  'steal',
  'hide',
  'knockout',
  'carry',
  'drop',
  'open',
  'wait',
  'signal',
  'resume',
  'if',
  'while',
  'on',
] as const;

export type CommandName = (typeof ALL_COMMANDS)[number];
