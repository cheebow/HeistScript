/**
 * HeistScript コアモデル型定義。
 * ここにある型はすべて構造化クローン可能な純粋データであること（関数・クラスインスタンス禁止）。
 */

export type Direction = 'up' | 'right' | 'down' | 'left';

/** 隣接探索の固定順序 (SPEC 4節) */
export const DIRECTION_ORDER: readonly Direction[] = ['up', 'right', 'down', 'left'];

export const DIRECTION_VECTORS: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  right: { dx: 1, dy: 0 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
};

export interface Position {
  x: number;
  y: number;
}

export type TileKind = 'wall' | 'floor' | 'hiding_spot' | 'door' | 'exit' | 'vent';

export interface PatrolPoint extends Position {
  waitTicks: number;
}

export type GuardState = 'PATROL' | 'INVESTIGATE' | 'CHASE' | 'SEARCH' | 'UNCONSCIOUS';

export interface GuardCapture {
  /** 捕獲準備中の対象怪盗 */
  targetId: string;
  /** 捕獲準備を開始した tick */
  preparedAtTick: number;
}

export interface Guard {
  id: string;
  x: number;
  y: number;
  direction: Direction;
  /** 初期巡回ルート（ステージ定義のコピー） */
  patrolRoute: PatrolPoint[];
  /** 視界の射程（null なら設定値 guardVisionRange） */
  visionRange: number | null;
  /** 開始時の向き。持ち場が 1 点の見張りは、持ち場に戻るとこの向きに戻る */
  homeDirection: Direction;
  state: GuardState;
  /** 次に向かう巡回ポイントのインデックス */
  patrolIndex: number;
  /** 巡回ポイントで待機中の残りtick */
  patrolWaitRemaining: number;
  /** 移動の進行度（ticksPerTile に達すると次タイルへ進む） */
  moveProgress: number;
  /** 直近に計算した経路（先頭は次に入るタイル） */
  path: Position[];
  /** INVESTIGATE / CHASE / SEARCH の目標位置 */
  targetPos: Position | null;
  /** CHASE 対象の怪盗ID */
  chaseTargetId: string | null;
  /** 最後に怪盗を確認した位置（CHASE中のみ更新） */
  lastSeenPos: Position | null;
  /** INVESTIGATE 到達後の観察残りtick / SEARCH の残りtick */
  observeRemaining: number;
  /** SEARCH 中の向き変更に使う内部カウンタ */
  searchTurnCounter: number;
  /** 気絶解除tick（UNCONSCIOUS中のみ有効） */
  wakeTick: number | null;
  /** 運搬中に停止した気絶残りtick */
  sleepRemaining: number | null;
  /** 怪盗に運搬されているか */
  carriedBy: string | null;
  /** 気絶を他の警備員に報告済みか */
  unconsciousReported: boolean;
  /** 捕獲準備状態 */
  capture: GuardCapture | null;
  /** 蘇生しようとしている仲間のID（INVESTIGATE 中） */
  reviveTargetId: string | null;
  /** 蘇生の残りtick */
  reviveRemaining: number;
  /** 直前tickに視認していた怪盗ID一覧（昇順） */
  visibleThiefIds: string[];
}

export interface Camera {
  id: string;
  x: number;
  y: number;
  direction: Direction;
  range: number;
  /** 0なら固定。N>0 なら N tick ごとに時計回りに回転 */
  rotateEveryTicks: number;
  /** 直前tickに検知していた怪盗ID一覧 */
  visibleThiefIds: string[];
}

export type GameObjectType = 'treasure' | 'door' | 'locker' | 'laser' | 'switch' | 'key';

export interface GameObject {
  id: string;
  type: GameObjectType;
  x: number;
  y: number;
  /** treasure: 必須宝物か */
  required: boolean;
  /** treasure: 取得した怪盗ID（nullなら未取得） */
  takenBy: string | null;
  /** door: 開いているか */
  open: boolean;
  /** door: 施錠されているか（MVPでは常にfalse） */
  locked: boolean;
  /** door: 開始時に開いていたか（開いた扉の調査判定に使う） */
  initiallyOpen: boolean;
  /** door: 警備員が「開いている」ことに気づいたか（一度だけ調査する） */
  noticed: boolean;
  /** door: タイマー開閉（なければ固定） */
  cycle: { openTicks: number; closedTicks: number; offset: number } | null;
  /** laser: 作動周期 */
  laser: { onTicks: number; offTicks: number; offset: number } | null;
  /** laser: 作動中か（表示・判定用キャッシュ、毎 tick 更新） */
  active: boolean;
  /** laser: 直前 tick に当たっていた怪盗 */
  hitThiefIds: string[];
  /** switch: 開ける扉 */
  targetDoorId: string | null;
  /** switch: 押されているか */
  pressed: boolean;
  /** key: 開けられる施錠扉の ID */
  unlocks: string | null;
}

export interface Thief {
  id: string;
  x: number;
  y: number;
  direction: Direction;
  hidden: boolean;
  /** 所持している宝物ID一覧 */
  inventory: string[];
  /** 担いでいる警備員ID */
  carrying: string | null;
  moveProgress: number;
  /** 逮捕されたか */
  captured: boolean;
}

export type EventType = 'spotted' | 'alarm';

export interface GameEvent {
  type: EventType;
  tick: number;
  /** spotted: 発見された怪盗ID。alarm: 空文字 */
  targetId: string;
  /** 発生源（警備員/カメラID） */
  sourceId: string;
  /** 発生位置 */
  x: number;
  y: number;
}

export type LogLevel = 'info' | 'warn' | 'error' | 'success';

export interface LogEntry {
  tick: number;
  actorId: string;
  eventType: string;
  details: string;
  scriptLine: number | null;
  level: LogLevel;
}

export type MissionStatus = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'STOPPED';

export interface MissionResult {
  status: MissionStatus;
  /** 終了理由（日本語） */
  reason: string;
  /** 関連する怪盗ID等 */
  actorId: string | null;
  scriptLine: number | null;
}

export interface Stats {
  spottedCount: number;
  knockoutCount: number;
  alarmCount: number;
  /** VM が実行した文の総数 */
  instructionCount: number;
}

/* ---------------- VM 状態 ---------------- */

export interface Frame {
  blockId: number;
  pc: number;
  /** while ループの本体であれば、その while 文の位置 */
  loop: { blockId: number; index: number } | null;
}

export type Action =
  | {
      kind: 'move';
      targetId: string;
      /** 到達目標タイル */
      goal: Position;
      /** 残り経路（先頭が次のタイル） */
      path: Position[];
      /** 連続ブロック回数 */
      blockedCount: number;
      line: number;
    }
  | { kind: 'wait'; remaining: number; line: number }
  | { kind: 'waitUntil'; blockId: number; index: number; line: number; satisfied: boolean }
  | {
      kind: 'timed';
      command: 'steal' | 'hide' | 'knockout' | 'carry' | 'drop' | 'open' | 'signal' | 'distract';
      targetId: string;
      remaining: number;
      total: number;
      line: number;
    };

export interface HandlerContext {
  event: EventType;
  /** ハンドラ開始tick（HANDLER_TIMEOUT 判定用） */
  startTick: number;
  /** 中断した本体のフレーム */
  savedFrames: Frame[];
  /** 中断したアクション */
  savedAction: Action | null;
  /** 中断前に本体が終了していたか */
  savedFinished: boolean;
}

export interface VmState {
  thiefId: string;
  frames: Frame[];
  action: Action | null;
  /** 本体プログラムが終了したか */
  finished: boolean;
  /** 致命的エラーで停止したか */
  halted: boolean;
  handler: HandlerContext | null;
  /** 次tick開始時に起動待ちのイベント（集約済み） */
  pendingEvents: GameEvent[];
  /** 現在実行中/待機中の行（1始まり、0は未実行） */
  currentLine: number;
  /** 直前tickに評価中だった行（UI表示用） */
  lastLine: number;
}

/* ---------------- ワールド ---------------- */

export interface WorldState {
  stageId: string;
  tick: number;
  width: number;
  height: number;
  /** tiles[y][x] */
  tiles: TileKind[][];
  waypoints: Record<string, Position>;
  exit: Position;
  thieves: Thief[];
  guards: Guard[];
  cameras: Camera[];
  objects: GameObject[];
  vms: VmState[];
  signals: Record<string, boolean>;
  /** 前tick末に投入され、次tick冒頭で処理されるイベント */
  eventQueue: GameEvent[];
  alarmActive: boolean;
  /** 最後の警報発生位置 */
  lastAlarmPos: Position | null;
  stats: Stats;
  result: MissionResult | null;
  maxTicks: number;
  /** この tick に追加されたログ（毎tick空にしてから追記） */
  tickLog: LogEntry[];
  /** 必須宝物を全て取得済みか（表示用キャッシュ） */
  requiredTreasureIds: string[];
}
