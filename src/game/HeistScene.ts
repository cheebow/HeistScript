import Phaser from 'phaser';
import type { Direction, Guard, LogEntry, Thief, WorldState } from '../core/model/types';
import { DEFAULT_CONFIG } from '../core/model/config';
import { visibleTiles } from '../core/sim/vision';
import { isGuardActive } from '../core/sim/context';
import { buildAllSprites, drawPixelMap, TILE, type PixelMap } from './pixelArt';

export interface RenderOptions {
  showVision: boolean;
  showPaths: boolean;
  selectedId: string | null;
}

export interface SceneCallbacks {
  onSelect: (id: string | null) => void;
}

const DEPTH = { tiles: 0, vision: 1, path: 2, objects: 3, ko: 4, actors: 5, marks: 6, fx: 7, text: 8, overlay: 9 };
const WALK_FRAMES: (0 | 1 | 2)[] = [1, 0, 2, 0];

/** Phaser シーン。WorldState を受け取って描画・演出するだけで、ゲームロジックは持たない。 */
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
  private overlay!: Phaser.GameObjects.Rectangle;
  private walkPhase = 0;
  private lastFxTick = -1;
  private callbacks: SceneCallbacks;
  private dirty = true;
  private ready = false;

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
    this.overlay = this.add.rectangle(0, 0, 4096, 4096, 0xd8434e, 0).setOrigin(0, 0).setDepth(DEPTH.overlay);
    this.time.addEvent({
      delay: 140,
      loop: true,
      callback: () => {
        this.walkPhase = (this.walkPhase + 1) % WALK_FRAMES.length;
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
    this.ready = true;
    if (this.world) this.render();
  }

  private makeTexture(key: string, map: PixelMap): void {
    if (this.textures.exists(key)) return;
    const h = map.length;
    const w = map[0]!.length;
    const canvas = this.textures.createCanvas(key, w, h);
    if (!canvas) return;
    drawPixelMap(canvas.getContext(), map);
    canvas.refresh();
  }

  private createTextures(): void {
    for (const [key, map] of Object.entries(buildAllSprites())) this.makeTexture(key, map);
  }

  setWorld(world: WorldState, options: RenderOptions): void {
    this.world = world;
    this.options = options;
    this.dirty = true;
    if (this.ready) this.render();
  }

  override update(): void {
    if (this.dirty && this.world) this.render();
  }

  private render(): void {
    const world = this.world;
    if (!world || !this.ready) return;
    this.dirty = false;
    this.renderTiles(world);
    this.renderObjects(world);
    this.renderVision(world);
    this.renderPaths(world);
    this.renderActors(world);
    this.renderSelection(world);
    this.playEffects(world);
  }

  /* ---------------- タイル ---------------- */

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
        let key = `floor_${(x * 7 + y * 13) % 5 === 0 ? 1 : (x * 3 + y * 5) % 7 === 0 ? 2 : 0}`;
        if (kind === 'wall') key = 'wall';
        else if (kind === 'hiding_spot') key = 'hiding_spot';
        else if (kind === 'exit') key = 'exit';
        else if (kind === 'door') {
          const door = world.objects.find((o) => o.type === 'door' && o.x === x && o.y === y);
          key = door && door.open ? 'door_open' : 'door_closed';
        }
        this.tileSprites.push(this.add.image(x * TILE, y * TILE, key).setOrigin(0, 0).setDepth(DEPTH.tiles));
      }
    }
    for (const o of world.objects) {
      if (o.type !== 'locker') continue;
      this.tileSprites.push(this.add.image(o.x * TILE, o.y * TILE, 'hiding_spot').setOrigin(0, 0).setDepth(DEPTH.tiles));
    }
  }

  private renderObjects(world: WorldState): void {
    const seen = new Set<string>();
    for (const o of world.objects) {
      if (o.type !== 'treasure') continue;
      seen.add(o.id);
      let img = this.objectSprites.get(o.id);
      if (!img) {
        img = this.add.image(o.x * TILE, o.y * TILE, 'treasure').setOrigin(0, 0).setDepth(DEPTH.objects);
        this.objectSprites.set(o.id, img);
        // 宝石は上下にゆっくり浮く
        this.tweens.add({ targets: img, y: o.y * TILE - 2, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
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
      const color = guard.state === 'CHASE' ? 0xd8434e : guard.state === 'PATROL' ? 0xf3d35a : 0xf08a3c;
      g.fillStyle(color, 0.2);
      for (const t of visibleTiles(world, { x: guard.x, y: guard.y, direction: guard.direction, range: DEFAULT_CONFIG.guardVisionRange })) {
        g.fillRect(t.x * TILE, t.y * TILE, TILE, TILE);
      }
    }
    for (const cam of world.cameras) {
      g.fillStyle(0x4fc7dc, 0.18);
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
      g.lineStyle(2, 0x4fc7dc, 0.45);
      let prev = { x: thief.x, y: thief.y };
      const half = TILE / 2;
      for (const p of vm.action.path) {
        g.lineBetween(prev.x * TILE + half, prev.y * TILE + half, p.x * TILE + half, p.y * TILE + half);
        prev = p;
      }
      g.fillStyle(0x4fc7dc, 0.8);
      g.fillRect(vm.action.goal.x * TILE + half - 3, vm.action.goal.y * TILE + half - 3, 6, 6);
    }
  }

  /* ---------------- 人物 ---------------- */

  private interpolated(entity: { x: number; y: number }, next: { x: number; y: number } | undefined, progress: number, ticksPerTile: number) {
    if (!next) return { px: entity.x * TILE, py: entity.y * TILE };
    const f = Math.min(1, progress / ticksPerTile);
    return { px: (entity.x + (next.x - entity.x) * f) * TILE, py: (entity.y + (next.y - entity.y) * f) * TILE };
  }

  private actorTexture(base: 'thief' | 'guard', dir: Direction, moving: boolean): string {
    const frame = moving ? WALK_FRAMES[this.walkPhase]! : 0;
    return `${base}_${dir}_${frame}`;
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

  /** 頭上マーク（上下に揺れる） */
  private getMark(id: string, key: string): Phaser.GameObjects.Image {
    let img = this.markSprites.get(id);
    if (!img) {
      img = this.add.image(0, 0, key).setOrigin(0.5, 1).setDepth(DEPTH.marks);
      this.markSprites.set(id, img);
      img.setData('bob', 0);
      const state = { v: 0 };
      const mark = img;
      const tween = this.tweens.add({
        targets: state,
        v: 3,
        duration: 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          mark.setData('bob', state.v);
          this.dirty = true;
        },
      });
      mark.setData('tween', tween);
    } else if (img.texture.key !== key) img.setTexture(key);
    return img;
  }

  private placeMark(img: Phaser.GameObjects.Image, px: number, py: number): void {
    const bob = (img.getData('bob') as number) ?? 0;
    img.setPosition(px + TILE / 2, py - 2 - bob).setVisible(true);
  }

  private thiefRenderPos(world: WorldState, thief: Thief) {
    const vm = world.vms.find((v) => v.thiefId === thief.id);
    const next = vm && vm.action && vm.action.kind === 'move' ? vm.action.path[0] : undefined;
    const ticks = thief.carrying ? DEFAULT_CONFIG.thiefCarryTicksPerTile : DEFAULT_CONFIG.thiefTicksPerTile;
    return this.interpolated(thief, next, thief.moveProgress, ticks);
  }

  private guardRenderPos(world: WorldState, guard: Guard) {
    if (guard.carriedBy) {
      const thief = world.thieves.find((t) => t.id === guard.carriedBy);
      if (thief) {
        const p = this.thiefRenderPos(world, thief);
        return { px: p.px, py: p.py - 10 };
      }
    }
    const ticks = guard.state === 'CHASE' ? DEFAULT_CONFIG.guardChaseTicksPerTile : DEFAULT_CONFIG.guardPatrolTicksPerTile;
    return this.interpolated(guard, guard.path[0], guard.moveProgress, ticks);
  }

  private renderActors(world: WorldState): void {
    const seenActors = new Set<string>();
    const seenMarks = new Set<string>();
    this.fxGfx.clear();

    for (const guard of world.guards) {
      seenActors.add(guard.id);
      const pos = this.guardRenderPos(world, guard);
      if (guard.carriedBy || guard.state === 'UNCONSCIOUS') {
        const img = this.getActor(guard.id, 'guard_ko', guard.carriedBy ? DEPTH.actors + 0.5 : DEPTH.ko);
        img.setPosition(pos.px, pos.py).setVisible(true).setAlpha(1);
        if (!guard.carriedBy) {
          const mark = this.getMark(`${guard.id}:zzz`, 'mark_zzz');
          this.placeMark(mark, pos.px + 6, pos.py + 4);
          seenMarks.add(`${guard.id}:zzz`);
        }
        continue;
      }
      const moving = guard.path.length > 0;
      const img = this.getActor(guard.id, this.actorTexture('guard', guard.direction, moving), DEPTH.actors);
      img.setPosition(pos.px, pos.py).setVisible(true).setAlpha(1);
      if (guard.state === 'CHASE') {
        this.placeMark(this.getMark(`${guard.id}:state`, 'mark_exclaim'), pos.px, pos.py);
        seenMarks.add(`${guard.id}:state`);
      } else if (guard.state === 'INVESTIGATE' || guard.state === 'SEARCH') {
        this.placeMark(this.getMark(`${guard.id}:state`, 'mark_question'), pos.px, pos.py);
        seenMarks.add(`${guard.id}:state`);
      }
      if (guard.capture) {
        this.fxGfx.lineStyle(2, 0xd8434e, 0.9);
        this.fxGfx.strokeRect(pos.px + 1, pos.py + 1, TILE - 2, TILE - 2);
      }
    }

    for (const thief of world.thieves) {
      seenActors.add(thief.id);
      const vm = world.vms.find((v) => v.thiefId === thief.id);
      const moving = !!vm && !!vm.action && vm.action.kind === 'move' && vm.action.path.length > 0;
      const pos = this.thiefRenderPos(world, thief);
      const img = this.getActor(thief.id, this.actorTexture('thief', thief.direction, moving), DEPTH.actors);
      img.setPosition(pos.px, pos.py).setVisible(true);
      img.setAlpha(thief.hidden ? 0.4 : 1);
      if (thief.hidden) {
        this.placeMark(this.getMark(`${thief.id}:hidden`, 'mark_hidden'), pos.px, pos.py);
        seenMarks.add(`${thief.id}:hidden`);
      }
      if (thief.captured) {
        this.fxGfx.fillStyle(0xd8434e, 0.35);
        this.fxGfx.fillRect(pos.px, pos.py, TILE, TILE);
      }
    }

    for (const cam of world.cameras) {
      seenActors.add(cam.id);
      const img = this.getActor(cam.id, `camera_${cam.direction}`, DEPTH.actors);
      img.setPosition(cam.x * TILE, cam.y * TILE).setVisible(true);
      if (cam.visibleThiefIds.length > 0) {
        this.placeMark(this.getMark(`${cam.id}:state`, 'mark_exclaim'), cam.x * TILE, cam.y * TILE + 6);
        seenMarks.add(`${cam.id}:state`);
      }
    }

    for (const [id, img] of this.actorSprites) {
      if (!seenActors.has(id)) {
        img.destroy();
        this.actorSprites.delete(id);
      }
    }
    for (const [id, img] of this.markSprites) {
      if (!seenMarks.has(id)) {
        (img.getData('tween') as Phaser.Tweens.Tween | undefined)?.destroy();
        img.destroy();
        this.markSprites.delete(id);
      }
    }
  }

  private renderSelection(world: WorldState): void {
    const g = this.selectGfx;
    g.clear();
    const id = this.options.selectedId;
    if (!id) return;
    const ent = world.thieves.find((t) => t.id === id) ?? world.guards.find((gd) => gd.id === id) ?? world.cameras.find((c) => c.id === id);
    if (!ent) return;
    g.lineStyle(1, 0xffffff, 0.8);
    g.strokeRect(ent.x * TILE + 0.5, ent.y * TILE + 0.5, TILE - 1, TILE - 1);
  }

  /* ---------------- 演出 ---------------- */

  /** tick が進んだときに、その tick のログから一度だけ演出を起動する */
  private playEffects(world: WorldState): void {
    if (world.tick === this.lastFxTick) return;
    const jumped = world.tick !== this.lastFxTick + 1; // シークなどで飛んだときは演出しない
    this.lastFxTick = world.tick;
    if (jumped || world.tick === 0) return;
    for (const entry of world.tickLog) this.effectFor(world, entry);
  }

  private posOf(world: WorldState, id: string): { px: number; py: number } | null {
    const thief = world.thieves.find((t) => t.id === id);
    if (thief) return this.thiefRenderPos(world, thief);
    const guard = world.guards.find((g) => g.id === id);
    if (guard) return this.guardRenderPos(world, guard);
    const cam = world.cameras.find((c) => c.id === id);
    if (cam) return { px: cam.x * TILE, py: cam.y * TILE };
    return null;
  }

  private effectFor(world: WorldState, entry: LogEntry): void {
    switch (entry.eventType) {
      case 'SPOTTED': {
        const p = this.posOf(world, entry.actorId);
        if (p) {
          this.popMark(p.px + TILE / 2, p.py - 4, 'mark_exclaim', 1.6);
          this.ring(p.px + TILE / 2, p.py + TILE / 2, 0xd8434e);
        }
        this.flash(0xd8434e, 0.18, 220);
        break;
      }
      case 'GUARD_INVESTIGATE':
      case 'GUARD_SEARCH':
      case 'GUARD_WAKE': {
        const p = this.posOf(world, entry.actorId);
        if (p) this.popMark(p.px + TILE / 2, p.py - 4, 'mark_question', 1.3);
        break;
      }
      case 'ALARM': {
        const p = this.posOf(world, entry.actorId);
        if (p) this.ring(p.px + TILE / 2, p.py + TILE / 2, 0xf08a3c);
        this.flash(0xf08a3c, 0.22, 400);
        this.floatText(TILE * (world.width / 2), TILE * 1.2, '警報！', '#f08a3c');
        break;
      }
      case 'STEAL': {
        const p = this.posOf(world, entry.actorId);
        if (p) {
          this.sparkle(p.px + TILE / 2, p.py + TILE / 2, 0xf3d35a, 10);
          this.floatText(p.px + TILE / 2, p.py - 6, '宝石を手に入れた！', '#f3d35a');
        }
        break;
      }
      case 'KNOCKOUT': {
        const target = /^(\S+) を/.exec(entry.details)?.[1];
        const p = target ? this.posOf(world, target) : null;
        if (p) this.orbitStars(p.px + TILE / 2, p.py + 6);
        break;
      }
      case 'HIDE': {
        const p = this.posOf(world, entry.actorId);
        if (p) this.puff(p.px + TILE / 2, p.py + TILE / 2);
        break;
      }
      case 'OPEN': {
        const door = world.objects.find((o) => o.id === entry.details.split(' ')[0]);
        if (door) this.sparkle(door.x * TILE + TILE / 2, door.y * TILE + TILE / 2, 0xc9ced9, 6);
        break;
      }
      case 'CAPTURED': {
        const target = /^(\S+) を/.exec(entry.details)?.[1];
        const p = target ? this.posOf(world, target) : null;
        if (p) {
          this.ring(p.px + TILE / 2, p.py + TILE / 2, 0xd8434e);
          this.shake(target!);
          this.floatText(p.px + TILE / 2, p.py - 6, '逮捕！', '#d8434e');
        }
        this.flash(0xd8434e, 0.4, 600);
        break;
      }
      case 'SUCCESS': {
        for (const t of world.thieves) {
          const p = this.thiefRenderPos(world, t);
          this.sparkle(p.px + TILE / 2, p.py + TILE / 2, 0x73cf93, 14);
        }
        this.floatText(TILE * (world.width / 2), TILE * (world.height / 2), 'ミッション成功', '#73cf93', 22);
        break;
      }
      case 'SIGNAL': {
        const p = this.posOf(world, entry.actorId);
        if (p) this.floatText(p.px + TILE / 2, p.py - 6, entry.details.replace(/^シグナル /, '').replace(/ を送った$/, ''), '#4fc7dc');
        break;
      }
      case 'CARRY':
      case 'DROP': {
        const p = this.posOf(world, entry.actorId);
        if (p) this.puff(p.px + TILE / 2, p.py + TILE - 4);
        break;
      }
      default:
        break;
    }
  }

  private popMark(x: number, y: number, key: string, scale: number): void {
    const img = this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(DEPTH.fx).setScale(0.2);
    this.tweens.add({
      targets: img,
      scale,
      y: y - 10,
      duration: 180,
      ease: 'Back.easeOut',
      onComplete: () => this.tweens.add({ targets: img, alpha: 0, y: y - 18, delay: 350, duration: 250, onComplete: () => img.destroy() }),
    });
  }

  private ring(x: number, y: number, color: number): void {
    const g = this.add.graphics().setDepth(DEPTH.fx);
    const state = { r: 4, a: 0.9 };
    this.tweens.add({
      targets: state,
      r: TILE * 1.2,
      a: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        g.clear();
        g.lineStyle(2, color, state.a);
        g.strokeCircle(x, y, state.r);
      },
      onComplete: () => g.destroy(),
    });
  }

  private flash(color: number, alpha: number, duration: number): void {
    this.overlay.setFillStyle(color, alpha);
    this.tweens.killTweensOf(this.overlay);
    this.tweens.add({ targets: this.overlay, fillAlpha: 0, duration, ease: 'Quad.easeOut' });
  }

  private sparkle(x: number, y: number, tint: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const dist = TILE * 0.6 + (i % 3) * 5;
      const s = this.add.image(x, y, 'mark_spark').setDepth(DEPTH.fx).setTint(tint);
      this.tweens.add({
        targets: s,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist - 6,
        alpha: 0,
        scale: 0.3,
        duration: 450 + (i % 4) * 60,
        ease: 'Cubic.easeOut',
        onComplete: () => s.destroy(),
      });
    }
  }

  private orbitStars(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      const s = this.add.image(x, y, 'mark_star').setDepth(DEPTH.fx);
      const state = { t: (i / 3) * Math.PI * 2 };
      this.tweens.add({
        targets: state,
        t: state.t + Math.PI * 4,
        duration: 1200,
        onUpdate: () => s.setPosition(x + Math.cos(state.t) * 12, y + Math.sin(state.t) * 4),
        onComplete: () => s.destroy(),
      });
    }
  }

  private puff(x: number, y: number): void {
    for (let i = 0; i < 4; i++) {
      const s = this.add.image(x, y, 'mark_smoke').setDepth(DEPTH.fx).setAlpha(0.7).setScale(0.5);
      const angle = (Math.PI * 2 * i) / 4 + Math.PI / 4;
      this.tweens.add({ targets: s, x: x + Math.cos(angle) * 12, y: y + Math.sin(angle) * 8 - 4, alpha: 0, scale: 1.2, duration: 400, ease: 'Quad.easeOut', onComplete: () => s.destroy() });
    }
  }

  private shake(id: string): void {
    const img = this.actorSprites.get(id);
    if (!img) return;
    const ox = img.x;
    this.tweens.add({ targets: img, x: ox + 3, duration: 40, yoyo: true, repeat: 5, onComplete: () => img.setX(ox) });
  }

  private floatText(x: number, y: number, text: string, color: string, size = 11): void {
    const t = this.add
      .text(x, y, text, { fontFamily: '"Hiragino Sans", "Noto Sans JP", sans-serif', fontSize: `${size}px`, color, stroke: '#0d0d14', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.text)
      .setResolution(2);
    this.tweens.add({ targets: t, y: y - 16, duration: 900, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: 600, duration: 400, onComplete: () => t.destroy() });
  }
}
