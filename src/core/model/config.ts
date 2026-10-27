/** 数値バランス設定 (SPEC 4,5,6,7,8,9節)。ステージやUIから上書き可能。 */
export interface SimConfig {
  thiefTicksPerTile: number;
  thiefCarryTicksPerTile: number;
  guardPatrolTicksPerTile: number;
  guardChaseTicksPerTile: number;
  guardVisionRange: number;
  cameraDefaultRange: number;
  investigateObserveTicks: number;
  searchTicks: number;
  knockoutSleepTicks: number;
  /** 気絶した仲間を起こすのに要する tick */
  reviveTicks: number;
  /** 1tickあたりのゼロコスト命令上限 */
  instructionBudgetPerTick: number;
  /** 1イベントハンドラあたりの最大tick */
  handlerTimeoutTicks: number;
  /** 連続ブロック上限 */
  maxConsecutiveBlocks: number;
  /** guard_near / guard_away の距離 */
  guardNearDistance: number;
  /** safe 述語の CHASE 警備員距離 */
  safeChaseDistance: number;
  actionTicks: {
    steal: number;
    hide: number;
    knockout: number;
    carry: number;
    drop: number;
    open: number;
    signal: number;
  };
}

export const DEFAULT_CONFIG: SimConfig = {
  thiefTicksPerTile: 2,
  thiefCarryTicksPerTile: 4,
  guardPatrolTicksPerTile: 3,
  guardChaseTicksPerTile: 2,
  guardVisionRange: 5,
  cameraDefaultRange: 5,
  investigateObserveTicks: 3,
  searchTicks: 8,
  knockoutSleepTicks: 30,
  reviveTicks: 3,
  instructionBudgetPerTick: 100,
  handlerTimeoutTicks: 200,
  maxConsecutiveBlocks: 3,
  guardNearDistance: 3,
  safeChaseDistance: 2,
  actionTicks: {
    steal: 3,
    hide: 1,
    knockout: 2,
    carry: 3,
    drop: 1,
    open: 2,
    signal: 1,
  },
};
