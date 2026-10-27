import Phaser from 'phaser';
import { HeistScene, type RenderOptions, type SceneCallbacks } from './HeistScene';
import { TILE } from './pixelArt';
import type { WorldState } from '../core/model/types';

export interface GameHandle {
  game: Phaser.Game;
  scene: HeistScene;
  setWorld(world: WorldState, options: RenderOptions): void;
  resize(containerWidth: number, containerHeight: number): void;
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
    scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.CENTER_BOTH },
    audio: { noAudio: true },
    banner: false,
  });
  let pending: { world: WorldState; options: RenderOptions } | null = null;
  const handle: GameHandle = {
    game,
    scene,
    setWorld(world, options) {
      pending = { world, options };
      scene.setWorld(world, options);
    },
    resize(cw, ch) {
      const zoom = Math.max(1, Math.floor(Math.min(cw / (width * TILE), ch / (height * TILE))));
      game.scale.setZoom(zoom);
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
