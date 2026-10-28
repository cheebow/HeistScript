import Phaser from 'phaser';
import { HeistScene, type RenderOptions, type SceneCallbacks } from './HeistScene';
import { TILE } from './pixelArt';
import type { WorldState } from '../core/model/types';

export interface GameHandle {
  game: Phaser.Game;
  scene: HeistScene;
  setWorld(world: WorldState, options: RenderOptions, effects?: boolean): void;
  /** 倍率を設定（0 = 自動）。戻り値は実際の倍率 */
  setZoom(level: number, containerWidth: number, containerHeight: number): number;
  /** 領域に収まる最大倍率 */
  fitZoom(containerWidth: number, containerHeight: number): number;
  resize(containerWidth: number, containerHeight: number): void;
  showBanner(text: string, color?: string): void;
  /** 成功演出 */
  celebrate(): void;
  /** 画面座標（clientX/Y）からタイル座標を求める。キャンバス外なら null */
  tileAt(clientX: number, clientY: number): { x: number; y: number } | null;
  destroy(): void;
}

/** Phaser ゲームを生成する。整数倍率・nearest-neighbor で 8ビット風に拡大する。 */
export function createGame(parent: HTMLElement, width: number, height: number, callbacks: SceneCallbacks): GameHandle {
  const scene = new HeistScene(callbacks);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: width * TILE,
    height: height * TILE,
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    backgroundColor: '#0b0b14',
    scene: [scene],
    // 中央寄せは CSS（margin: auto）で行う。Phaser に任せると枠より大きいときに負のマージンで上が切れる
    scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER },
    audio: { noAudio: true },
    banner: false,
  });
  let pending: { world: WorldState; options: RenderOptions } | null = null;
  let zoomLevel = 0;
  // 高解像度ディスプレイでは、見た目の倍率 × 端末のピクセル比で内部描画する。
  // ドット絵は整数倍のまま、文字・視界・経路などの線は端末の解像度で描かれる
  const dpr = Math.max(1, Math.min(3, Math.round((typeof window !== 'undefined' && window.devicePixelRatio) || 1)));
  const fit = (cw: number, ch: number) => Math.max(1, Math.min(4, Math.floor(Math.min(cw / (width * TILE), ch / (height * TILE)))));
  const handle: GameHandle = {
    game,
    scene,
    setWorld(world, options, effects = true) {
      pending = { world, options };
      scene.setWorld(world, options, effects);
    },
    fitZoom(cw, ch) {
      return fit(cw, ch);
    },
    setZoom(level, cw, ch) {
      zoomLevel = level;
      const zoom = level > 0 ? level : fit(cw, ch);
      const k = zoom * dpr;
      const bw = width * TILE * k;
      const bh = height * TILE * k;
      if (game.scale.width !== bw || game.scale.height !== bh) game.scale.resize(bw, bh);
      game.scale.setZoom(1 / dpr); // CSS 上の大きさは width*TILE*zoom
      scene.setRenderScale(k);
      return zoom;
    },
    resize(cw, ch) {
      handle.setZoom(zoomLevel, cw, ch);
    },
    showBanner(text, color) {
      scene.showBanner(text, color);
    },
    celebrate() {
      scene.celebrate();
    },
    tileAt(clientX, clientY) {
      const rect = game.canvas.getBoundingClientRect();
      if (clientX < rect.left || clientY < rect.top || clientX >= rect.right || clientY >= rect.bottom) return null;
      const sx = rect.width / (width * TILE);
      const sy = rect.height / (height * TILE);
      const x = Math.floor((clientX - rect.left) / sx / TILE);
      const y = Math.floor((clientY - rect.top) / sy / TILE);
      if (x < 0 || y < 0 || x >= width || y >= height) return null;
      return { x, y };
    },
    destroy() {
      game.destroy(true);
    },
  };
  game.events.once('ready', () => {
    if (pending) scene.setWorld(pending.world, pending.options);
  });
  return handle;
}
