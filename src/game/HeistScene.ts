import Phaser from 'phaser';
import type { Direction, Guard, Thief, WorldState } from '../core/model/types';
import { DEFAULT_CONFIG } from '../core/model/config';
import { visibleTiles } from '../core/sim/vision';
import { isGuardActive } from '../core/sim/context';
import { drawPixelMap, flipH, SPRITES, TILE, walkFrame, type PixelMap } from './pixelArt';

export interface RenderOptions {
  showVision: boolean;
  showPaths: boolean;
  selectedId: string | null;
}

export interface SceneCallbacks {
  onSelect: (id: string | null) => void;
}

const DEPTH = { tiles: 0, vision: 1, path: 2, objects: 3, ko: 4, actors: 5, marks: 6, fx: 7 };

/** Phaser シーン。WorldState を受け取って描画するだけで、ゲームロジックは持たない。 */
export class HeistScene extends Phaser.Scene {
  private world: WorldState | null = null;
  private options: RenderOptions = { showVision: true, showPaths: true, selectedId: null };
  private tileSprites: Phaser.GameObjects.Image[] = [];
  private tileStageId: string | null = null;
  private tileDoorState = '';
  private actorSprites = new Map<string, Phaser.GameObjects.Image>();
  private markSprites = new Map<string, Phaser.GameObjects.Image>();
  private objectSprites = new Map<string, Phaser.GameObjects.Image>();
  private visionGfx!: Phaser.GameObjects.Graphics;
  private pathGfx!: Phaser.GameObjects.Graphics;
  private selectGfx!: Phaser.GameObjects.Graphics;
  private fxGfx!: Phaser.GameObjects.Graphics;
  private frameToggle = 0;
  private callbacks: SceneCallbacks;
  private dirty = true;

  constructor(callbacks: SceneCallbacks) {
    super('heist');
    this.callbacks = callbacks;
  }

  create(): void {
    this.createTextures();
    this.visionGfx = this.add.graphics().setDepth(DEPTH.vision);
    this.pathGfx = this.add.graphics().setDepth(DEPTH.path);
    this.selectGfx = this.add.graphics().setDepth(DEPTH.marks);
    this.fxGfx = this.add.graphics().setDepth(DEPTH.fx);
    this.time.addEvent({
      delay: 250,
      loop: true,
      callback: () => {
        this.frameToggle = 1 - this.frameToggle;
        this.dirty = true;
      },
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.world) return;
      const tx = Math.floor(pointer.worldX / TILE);
      const ty = Math.floor(pointer.worldY / TILE);
      const hit =
        this.world.thieves.find((t) => t.x === tx && t.y === ty) ??
        this.world.guards.find((g) => g.x === tx && g.y === ty && !g.carriedBy) ??
        this.world.cameras.find((c) => c.x === tx && c.y === ty);
      this.callbacks.onSelect(hit ? hit.id : null);
    });
    if (this.world) this.render();
  }

  private makeTexture(key: string, map: PixelMap): void {
    if (this.textures.exists(key)) return;
    const canvas = this.textures.createCanvas(key, TILE, TILE);
    if (!canvas) return;
    const ctx = canvas.getContext();
    drawPixelMap(ctx, map);
    canvas.refresh();
  }

  private createTextures(): void {
    for (const [key, map] of Object.entries(SPRITES)) this.makeTexture(key, map);
    for (const base of ['thief', 'guard']) {
      const right = SPRITES[`${base}_right`]!;
      this.makeTexture(`${base}_left`, flipH(right));
      for (const dir of ['down', 'up', 'right']) {
        this.makeTexture(`${base}_${dir}_1`, walkFrame(SPRITES[`${base}_${dir}`]!));
      }
      this.makeTexture(`${base}_left_1`, flipH(walkFrame(right)));
    }
    this.makeTexture('camera_left', flipH(SPRITES['camera_right']!));
  }

  setWorld(world: WorldState, options: RenderOptions): void {
    this.world = world;
    this.options = options;
    this.dirty = true;
    if (this.sys.isActive()) this.render();
  }

  override update(): void {
    if (this.dirty && this.world) this.render();
  }

  private actorTexture(base: 'thief' | 'guard', dir: Direction, moving: boolean): string {
    const frame = moving && this.frameToggle === 1 ? '_1' : '';
    return `${base}_${dir}${frame}`;
  }

  private render(): void {
    const world = this.world;
    if (!world) return;
    this.dirty = false;
    this.renderTiles(world);
    this.renderObjects(world);
    this.renderVision(world);
    this.renderPaths(world);
    this.renderActors(world);
    this.renderSelection(world);
  }

  private renderTiles(world: WorldState): void {
    const doorState = world.objects.filter((o) => o.type === 'door').map((d) => `${d.id}:${d.open ? 1 : 0}`).join(',');
    if (this.tileStageId === world.stageId && this.tileDoorState === doorState && this.tileSprites.length > 0) return;
    for (const s of this.tileSprites) s.destroy();
    this.tileSprites = [];
    this.tileStageId = world.stageId;
    this.tileDoorState = doorState;
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const kind = world.tiles[y]![x]!;
        let key = 'floor';
        if (kind === 'wall') key = 'wall';
        else if (kind === 'hiding_spot') key = 'hiding_spot';
        else if (kind === 'exit') key = 'exit';
        else if (kind === 'door') {
          const door = world.objects.find((o) => o.type === 'door' && o.x === x && o.y === y);
          key = door && door.open ? 'door_open' : 'door_closed';
        }
        const img = this.add.image(x * TILE, y * TILE, key).setOrigin(0, 0).setDepth(DEPTH.tiles);
        this.tileSprites.push(img);
      }
    }
    // ロッカー（オブジェクト）はタイルと同じ見た目
    for (const o of world.objects) {
      if (o.type !== 'locker') continue;
      const img = this.add.image(o.x * TILE, o.y * TILE, 'hiding_spot').setOrigin(0, 0).setDepth(DEPTH.tiles);
      this.tileSprites.push(img);
    }
  }

  private renderObjects(world: WorldState): void {
    const seen = new Set<string>();
    for (const o of world.objects) {
      if (o.type !== 'treasure') continue;
      seen.add(o.id);
      let img = this.objectSprites.get(o.id);
      if (!img) {
        img = this.add.image(0, 0, 'treasure').setOrigin(0, 0).setDepth(DEPTH.objects);
        this.objectSprites.set(o.id, img);
      }
      img.setPosition(o.x * TILE, o.y * TILE);
      img.setVisible(o.takenBy === null);
    }
    for (const [id, img] of this.objectSprites) {
      if (!seen.has(id)) {
        img.destroy();
        this.objectSprites.delete(id);
      }
    }
  }

  private renderVision(world: WorldState): void {
    const g = this.visionGfx;
    g.clear();
    if (!this.options.showVision) return;
    for (const guard of world.guards) {
      if (!isGuardActive(guard)) continue;
      const color = guard.state === 'CHASE' ? 0xd7263d : guard.state === 'PATROL' ? 0xf5d547 : 0xf08a24;
      g.fillStyle(color, 0.22);
      for (const t of visibleTiles(world, { x: guard.x, y: guard.y, direction: guard.direction, range: DEFAULT_CONFIG.guardVisionRange })) {
        g.fillRect(t.x * TILE, t.y * TILE, TILE, TILE);
      }
    }
    for (const cam of world.cameras) {
      g.fillStyle(0x35c0d6, 0.22);
      for (const t of visibleTiles(world, cam)) g.fillRect(t.x * TILE, t.y * TILE, TILE, TILE);
    }
  }

  private renderPaths(world: WorldState): void {
    const g = this.pathGfx;
    g.clear();
    if (!this.options.showPaths) return;
    for (const thief of world.thieves) {
      const vm = world.vms.find((v) => v.thiefId === thief.id);
      if (!vm || !vm.action || vm.action.kind !== 'move') continue;
      g.lineStyle(2, 0x35c0d6, 0.6);
      let prev = { x: thief.x, y: thief.y };
      for (const p of vm.action.path) {
        g.lineBetween(prev.x * TILE + 8, prev.y * TILE + 8, p.x * TILE + 8, p.y * TILE + 8);
        prev = p;
      }
      g.fillStyle(0x35c0d6, 0.9);
      g.fillRect(vm.action.goal.x * TILE + 6, vm.action.goal.y * TILE + 6, 4, 4);
    }
  }

  private interpolated(entity: { x: number; y: number }, next: { x: number; y: number } | undefined, progress: number, ticksPerTile: number) {
    if (!next) return { px: entity.x * TILE, py: entity.y * TILE };
    const f = Math.min(1, progress / ticksPerTile);
    return { px: (entity.x + (next.x - entity.x) * f) * TILE, py: (entity.y + (next.y - entity.y) * f) * TILE };
  }

  private getActor(id: string, key: string, depth: number): Phaser.GameObjects.Image {
    let img = this.actorSprites.get(id);
    if (!img) {
      img = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(depth);
      this.actorSprites.set(id, img);
    } else if (img.texture.key !== key) {
      img.setTexture(key);
    }
    img.setDepth(depth);
    return img;
  }

  private getMark(id: string, key: string): Phaser.GameObjects.Image {
    let img = this.markSprites.get(id);
    if (!img) {
      img = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(DEPTH.marks);
      this.markSprites.set(id, img);
    } else if (img.texture.key !== key) img.setTexture(key);
    return img;
  }

  private renderActors(world: WorldState): void {
    const seenActors = new Set<string>();
    const seenMarks = new Set<string>();
    this.fxGfx.clear();

    for (const guard of world.guards) {
      seenActors.add(guard.id);
      if (guard.carriedBy) {
        const img = this.getActor(guard.id, 'guard_down_ko', DEPTH.ko);
        const thief = world.thieves.find((t) => t.id === guard.carriedBy);
        const pos = thief ? this.thiefRenderPos(world, thief) : { px: guard.x * TILE, py: guard.y * TILE };
        img.setPosition(pos.px, pos.py - 6).setVisible(true);
        continue;
      }
      if (guard.state === 'UNCONSCIOUS') {
        const img = this.getActor(guard.id, 'guard_down_ko', DEPTH.ko);
        img.setPosition(guard.x * TILE, guard.y * TILE).setVisible(true);
        const mark = this.getMark(`${guard.id}:ko`, this.frameToggle ? 'zzz' : 'star');
        mark.setPosition(guard.x * TILE + 4, guard.y * TILE - 8).setVisible(true);
        seenMarks.add(`${guard.id}:ko`);
        continue;
      }
      const moving = guard.path.length > 0;
      const ticks = guard.state === 'CHASE' ? DEFAULT_CONFIG.guardChaseTicksPerTile : DEFAULT_CONFIG.guardPatrolTicksPerTile;
      const pos = this.interpolated(guard, guard.path[0], guard.moveProgress, ticks);
      const img = this.getActor(guard.id, this.actorTexture('guard', guard.direction, moving), DEPTH.actors);
      img.setPosition(pos.px, pos.py).setVisible(true);
      if (guard.state === 'CHASE' || guard.state === 'INVESTIGATE') {
        const mark = this.getMark(`${guard.id}:alert`, 'alert_mark');
        mark.setPosition(pos.px, pos.py - 12).setVisible(true);
        seenMarks.add(`${guard.id}:alert`);
      }
      if (guard.capture && this.frameToggle) {
        this.fxGfx.lineStyle(2, 0xd7263d, 1);
        this.fxGfx.strokeRect(pos.px - 1, pos.py - 1, TILE + 2, TILE + 2);
      }
    }

    for (const thief of world.thieves) {
      seenActors.add(thief.id);
      const vm = world.vms.find((v) => v.thiefId === thief.id);
      const moving = !!vm && !!vm.action && vm.action.kind === 'move' && vm.action.path.length > 0;
      const pos = this.thiefRenderPos(world, thief);
      const img = this.getActor(thief.id, this.actorTexture('thief', thief.direction, moving), DEPTH.actors);
      img.setPosition(pos.px, pos.py).setVisible(true);
      img.setAlpha(thief.hidden ? 0.45 : 1);
      if (thief.hidden) {
        const mark = this.getMark(`${thief.id}:hidden`, 'hidden_mark');
        mark.setPosition(pos.px, pos.py - 12).setVisible(true);
        seenMarks.add(`${thief.id}:hidden`);
      }
      if (thief.captured) {
        this.fxGfx.fillStyle(0xd7263d, this.frameToggle ? 0.5 : 0.2);
        this.fxGfx.fillRect(pos.px, pos.py, TILE, TILE);
      }
    }

    for (const cam of world.cameras) {
      seenActors.add(cam.id);
      const img = this.getActor(cam.id, `camera_${cam.direction}`, DEPTH.actors);
      img.setPosition(cam.x * TILE, cam.y * TILE).setVisible(true);
    }

    for (const [id, img] of this.actorSprites) {
      if (!seenActors.has(id)) {
        img.destroy();
        this.actorSprites.delete(id);
      }
    }
    for (const [id, img] of this.markSprites) {
      if (!seenMarks.has(id)) {
        img.destroy();
        this.markSprites.delete(id);
      }
    }
  }

  private thiefRenderPos(world: WorldState, thief: Thief) {
    const vm = world.vms.find((v) => v.thiefId === thief.id);
    const next = vm && vm.action && vm.action.kind === 'move' ? vm.action.path[0] : undefined;
    const ticks = thief.carrying ? DEFAULT_CONFIG.thiefCarryTicksPerTile : DEFAULT_CONFIG.thiefTicksPerTile;
    return this.interpolated(thief, next, thief.moveProgress, ticks);
  }

  private renderSelection(world: WorldState): void {
    const g = this.selectGfx;
    g.clear();
    const id = this.options.selectedId;
    if (!id) return;
    const ent: Thief | Guard | { x: number; y: number } | undefined =
      world.thieves.find((t) => t.id === id) ?? world.guards.find((gd) => gd.id === id) ?? world.cameras.find((c) => c.id === id);
    if (!ent) return;
    g.lineStyle(1, 0xffffff, 0.9);
    g.strokeRect(ent.x * TILE + 0.5, ent.y * TILE + 0.5, TILE - 1, TILE - 1);
  }
}
