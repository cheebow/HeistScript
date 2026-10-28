/**
 * 保存リポジトリ (SPEC 13節)。localStorage を標準実装とし、将来 IndexedDB へ切替可能。
 */
export const SAVE_SCHEMA_VERSION = 1;

export interface BestRecord {
  ticks: number;
  instructions: number;
  spotted: number;
  knockouts: number;
  alarms: number;
  /** 達成したチャレンジID */
  challenges: string[];
  /** そのときのスクリプト */
  scripts: Record<string, string>;
}

export interface StageProgress {
  /** 怪盗ID → スクリプト */
  scripts: Record<string, string>;
  cleared: boolean;
  /** 最良クリアtick */
  bestTicks: number | null;
  /** 達成したチャレンジID */
  challenges: string[];
  /** 最速クリアの記録（スクリプトつき） */
  best?: BestRecord | null;
  /** チャレンジごとの達成時スクリプト */
  challengeScripts?: Record<string, Record<string, string>>;
}

export interface SaveData {
  schemaVersion: number;
  stages: Record<string, StageProgress>;
  /** インポートしたカスタムステージ（検証済み JSON をそのまま保持） */
  customStages: unknown[];
  settings: {
    showVision: boolean;
    showCameraVision: boolean;
    showPaths: boolean;
    showWaypoints: boolean;
    showCoords: boolean;
    reducedMotion: boolean;
    /** 0 = 自動 */
    zoom: 0 | 1 | 2 | 3 | 4;
    speed: 1 | 2 | 4;
    lastStageId: string | null;
  };
}

export function defaultSaveData(): SaveData {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    stages: {},
    customStages: [],
    settings: { showVision: true, showCameraVision: true, showPaths: true, showWaypoints: true, showCoords: true, reducedMotion: false, zoom: 0, speed: 1, lastStageId: null },
  };
}

export interface SaveRepository {
  load(): SaveData;
  save(data: SaveData): void;
  clear(): void;
}

const KEY = 'heistscript.save';

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** 破損データや旧バージョンを安全に既定値へ補完する */
export function sanitizeSaveData(raw: unknown): SaveData {
  const d = defaultSaveData();
  if (!isObj(raw)) return d;
  if (raw.schemaVersion !== SAVE_SCHEMA_VERSION) return d;
  if (isObj(raw.stages)) {
    for (const [id, p] of Object.entries(raw.stages)) {
      if (!isObj(p)) continue;
      const scripts: Record<string, string> = {};
      if (isObj(p.scripts)) {
        for (const [tid, src] of Object.entries(p.scripts)) if (typeof src === 'string') scripts[tid] = src;
      }
      const best = isObj(p.best) && typeof p.best.ticks === 'number' && isObj(p.best.scripts) ? (p.best as unknown as BestRecord) : null;
      const challengeScripts: Record<string, Record<string, string>> = {};
      if (isObj(p.challengeScripts)) {
        for (const [cid, sc] of Object.entries(p.challengeScripts)) if (isObj(sc)) challengeScripts[cid] = Object.fromEntries(Object.entries(sc).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
      }
      d.stages[id] = {
        scripts,
        cleared: p.cleared === true,
        bestTicks: typeof p.bestTicks === 'number' ? p.bestTicks : null,
        challenges: Array.isArray(p.challenges) ? p.challenges.filter((c): c is string => typeof c === 'string') : [],
        best,
        challengeScripts,
      };
    }
  }
  if (Array.isArray(raw.customStages)) d.customStages = raw.customStages.filter(isObj);
  if (isObj(raw.settings)) {
    const s = raw.settings;
    if (typeof s.showVision === 'boolean') d.settings.showVision = s.showVision;
    if (typeof s.showCameraVision === 'boolean') d.settings.showCameraVision = s.showCameraVision;
    if (typeof s.showPaths === 'boolean') d.settings.showPaths = s.showPaths;
    if (typeof s.showWaypoints === 'boolean') d.settings.showWaypoints = s.showWaypoints;
    if (typeof s.showCoords === 'boolean') d.settings.showCoords = s.showCoords;
    if (typeof s.reducedMotion === 'boolean') d.settings.reducedMotion = s.reducedMotion;
    if (s.zoom === 0 || s.zoom === 1 || s.zoom === 2 || s.zoom === 3 || s.zoom === 4) d.settings.zoom = s.zoom;
    if (s.speed === 1 || s.speed === 2 || s.speed === 4) d.settings.speed = s.speed;
    if (typeof s.lastStageId === 'string') d.settings.lastStageId = s.lastStageId;
  }
  return d;
}

export class LocalStorageRepository implements SaveRepository {
  constructor(private readonly storage: Storage, private readonly key = KEY) {}
  load(): SaveData {
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return defaultSaveData();
      return sanitizeSaveData(JSON.parse(raw));
    } catch {
      return defaultSaveData();
    }
  }
  save(data: SaveData): void {
    try {
      this.storage.setItem(this.key, JSON.stringify(data));
    } catch {
      // 容量超過などは無視（ゲームは続行可能）
    }
  }
  clear(): void {
    this.storage.removeItem(this.key);
  }
}

export class MemoryRepository implements SaveRepository {
  private data: SaveData = defaultSaveData();
  load(): SaveData {
    return structuredClone(this.data);
  }
  save(data: SaveData): void {
    this.data = structuredClone(data);
  }
  clear(): void {
    this.data = defaultSaveData();
  }
}

export function createRepository(): SaveRepository {
  try {
    if (typeof localStorage !== 'undefined') return new LocalStorageRepository(localStorage);
  } catch {
    // fallthrough
  }
  return new MemoryRepository();
}
