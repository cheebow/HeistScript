/**
 * オリジナルのドット絵素材をコードで生成する（32×32、限定パレット）。
 * 文字列ピクセルマップではなく、小さな描画 API で部品を組み合わせて描く。外部素材は使用しない。
 */
export const TILE = 32;

export const PALETTE: Record<string, string> = {
  '.': '',
  K: '#0d0d14', // 黒
  k: '#1e1e2a', // 黒の明部
  N: '#24305c', // ネイビー
  n: '#182043', // ネイビー暗
  m: '#2e3c70', // ネイビー明
  G: '#7c8494', // グレー
  g: '#a9b0bf', // グレー明
  h: '#c9ced9', // グレー最明
  D: '#3a3f4d', // 暗グレー
  d: '#262a35', // 最暗グレー
  C: '#f2e6c4', // クリーム
  R: '#d8434e', // 赤
  r: '#9e2a33', // 赤暗
  c: '#4fc7dc', // シアン
  b: '#2b8fa3', // シアン暗
  Y: '#f3d35a', // 黄
  y: '#c79e2d', // 黄暗
  B: '#3b57c9', // 青（怪盗スーツ）
  v: '#27389a', // 青暗
  S: '#f0c8a2', // 肌
  s: '#d4a27e', // 肌影
  W: '#ffffff',
  M: '#8a5a33', // 茶
  o: '#5c3a1e', // 茶暗
  E: '#4caf72', // 緑
  e: '#2e7a4d', // 緑暗
  f: '#73cf93', // 緑明
  O: '#f08a3c', // オレンジ
  P: '#a56fd1', // 紫
  p: '#f0a39b', // ほほ
  F: '#101420', // 床（基本）
  Z: '#141a2a', // 床（明）
  z: '#0c1019', // 床（暗）
};

export type PixelMap = string[];

/** 小さなドット絵キャンバス（文字でピクセルを持つ） */
export class Pix {
  readonly cells: string[][];
  constructor(
    readonly w: number = TILE,
    readonly h: number = TILE,
    fill = '.',
  ) {
    this.cells = Array.from({ length: h }, () => Array.from({ length: w }, () => fill));
  }
  px(x: number, y: number, c: string): this {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y]![x] = c;
    return this;
  }
  rect(x: number, y: number, w: number, h: number, c: string): this {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, c);
    return this;
  }
  hline(x: number, y: number, w: number, c: string): this {
    return this.rect(x, y, w, 1, c);
  }
  vline(x: number, y: number, h: number, c: string): this {
    return this.rect(x, y, 1, h, c);
  }
  /** 枠線 */
  frame(x: number, y: number, w: number, h: number, c: string): this {
    return this.hline(x, y, w, c).hline(x, y + h - 1, w, c).vline(x, y, h, c).vline(x + w - 1, y, h, c);
  }
  /** 塗りつぶし楕円 */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string): this {
    for (let j = Math.floor(cy - ry); j <= Math.ceil(cy + ry); j++) {
      for (let i = Math.floor(cx - rx); i <= Math.ceil(cx + rx); i++) {
        const dx = (i + 0.5 - cx) / rx;
        const dy = (j + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(i, j, c);
      }
    }
    return this;
  }
  /** 別のマップを重ねる（'.' は透過） */
  blit(map: PixelMap, ox = 0, oy = 0): this {
    map.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (row[i] !== '.') this.px(ox + i, oy + j, row[i]!);
    });
    return this;
  }
  toMap(): PixelMap {
    return this.cells.map((r) => r.join(''));
  }
}

export function flipH(map: PixelMap): PixelMap {
  return map.map((row) => row.split('').reverse().join(''));
}

/** 時計回りに 90 度回転 */
export function rotate90(map: PixelMap): PixelMap {
  const h = map.length;
  const w = map[0]!.length;
  const out: string[][] = Array.from({ length: w }, () => Array.from({ length: h }, () => '.'));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x]![h - 1 - y] = map[y]![x]!;
  return out.map((r) => r.join(''));
}

/* ------------------------------------------------------------------ */
/* タイル                                                              */
/* ------------------------------------------------------------------ */

export function floorTile(variant = 0): PixelMap {
  const p = new Pix(TILE, TILE, 'F');
  // 石畳: 16px の大タイルに目地
  for (let y = 0; y < TILE; y += 16) for (let x = 0; x < TILE; x += 16) {
    p.hline(x, y, 16, 'z').vline(x, y, 16, 'z');
    p.hline(x + 1, y + 1, 15, 'Z').vline(x + 1, y + 1, 15, 'Z');
  }
  if (variant === 1) p.px(21, 9, 'Z').px(6, 24, 'Z');
  if (variant === 2) p.rect(10, 20, 2, 1, 'z');
  return p.toMap();
}

export function wallTile(): PixelMap {
  const p = new Pix(TILE, TILE, 'd');
  // レンガ: 高さ8、幅16、段ごとに半分ずらす
  for (let row = 0; row < 4; row++) {
    const y = row * 8;
    const offset = row % 2 === 0 ? 0 : 8;
    for (let x = -16; x < TILE; x += 16) {
      const bx = x + offset;
      p.rect(bx + 1, y + 1, 14, 6, 'G');
      p.hline(bx + 1, y + 1, 14, 'g'); // 上辺ハイライト
      p.vline(bx + 1, y + 1, 6, 'g');
      p.hline(bx + 2, y + 6, 13, 'D'); // 下辺の影
      p.vline(bx + 14, y + 2, 5, 'D');
    }
  }
  return p.toMap();
}

export function lockerTile(): PixelMap {
  const p = new Pix().blit(floorTile());
  p.rect(6, 2, 20, 28, 'e'); // 外枠
  p.rect(7, 3, 18, 26, 'E');
  p.hline(7, 3, 18, 'f'); // ハイライト
  p.vline(7, 3, 26, 'f');
  p.vline(16, 4, 24, 'e'); // 扉の合わせ目
  for (let y = 7; y <= 11; y += 2) {
    p.hline(9, y, 6, 'e');
    p.hline(18, y, 6, 'e');
  } // 通気口
  p.rect(13, 17, 2, 4, 'Y').rect(17, 17, 2, 4, 'Y'); // 取っ手
  p.hline(6, 29, 20, 'K'); // 影
  return p.toMap();
}

export function doorClosedTile(): PixelMap {
  const p = new Pix().blit(floorTile());
  p.rect(2, 0, 28, 32, 'o'); // 枠
  p.rect(4, 2, 24, 30, 'M');
  p.frame(6, 4, 9, 10, 'o').frame(17, 4, 9, 10, 'o'); // 上パネル
  p.frame(6, 17, 9, 12, 'o').frame(17, 17, 9, 12, 'o'); // 下パネル
  p.rect(14, 15, 3, 2, 'Y'); // ノブ
  p.vline(4, 2, 30, 'M').vline(27, 2, 30, 'o');
  return p.toMap();
}

export function doorOpenTile(): PixelMap {
  const p = new Pix().blit(floorTile());
  p.rect(0, 0, 3, 32, 'o').rect(29, 0, 3, 32, 'o'); // 枠だけ
  p.rect(3, 0, 4, 32, 'M'); // 開いた扉（横向き）
  p.vline(6, 0, 32, 'o');
  return p.toMap();
}

export function exitTile(): PixelMap {
  const p = new Pix().blit(floorTile());
  p.rect(4, 2, 24, 28, 'b'); // 光る出口枠
  p.rect(6, 4, 20, 24, 'Z');
  p.frame(6, 4, 20, 24, 'c');
  // 矢印（上向き）
  p.rect(14, 10, 4, 12, 'Y');
  p.hline(12, 12, 8, 'Y').hline(13, 11, 6, 'Y').hline(14, 10, 4, 'Y');
  p.px(11, 13, 'Y').px(20, 13, 'Y');
  p.hline(8, 25, 16, 'c'); // 足元の光
  return p.toMap();
}

export function treasureSprite(): PixelMap {
  const p = new Pix();
  // 台座
  p.rect(8, 24, 16, 4, 'y').rect(9, 23, 14, 1, 'Y').hline(8, 28, 16, 'K');
  // 宝石（ダイヤ形）
  const rows: [number, number, number][] = [
    [12, 8, 8],
    [11, 9, 10],
    [10, 10, 12],
    [10, 11, 12],
    [11, 12, 10],
    [12, 13, 8],
    [13, 14, 6],
    [14, 15, 4],
    [15, 16, 2],
  ];
  for (const [x, y, w] of rows) p.hline(x, y, w, 'c');
  p.hline(12, 9, 4, 'W').hline(11, 10, 2, 'W').px(12, 11, 'W'); // ハイライト
  p.hline(16, 12, 5, 'b').hline(17, 13, 3, 'b').hline(18, 14, 2, 'b'); // 影
  p.hline(10, 10, 12, 'b'); // 稜線
  // 星のきらめき
  p.px(7, 6, 'W').px(24, 7, 'W').px(25, 17, 'W');
  return p.toMap();
}

export function cameraSprite(dir: 'right' | 'up' | 'down'): PixelMap {
  const p = new Pix();
  if (dir === 'right') {
    p.rect(6, 6, 4, 6, 'D'); // 壁の取付
    p.rect(8, 8, 3, 3, 'G'); // 関節
    p.rect(10, 7, 14, 8, 'G'); // 本体
    p.hline(10, 7, 14, 'g');
    p.rect(22, 9, 6, 4, 'D'); // レンズ筒
    p.rect(26, 10, 2, 2, 'R'); // レンズ
    p.rect(12, 9, 3, 2, 'K'); // 録画ランプ
  } else if (dir === 'down') {
    p.rect(13, 4, 6, 4, 'D');
    p.rect(12, 8, 8, 12, 'G');
    p.vline(12, 8, 12, 'g');
    p.rect(13, 20, 6, 5, 'D');
    p.rect(15, 23, 2, 2, 'R');
  } else {
    p.rect(13, 24, 6, 4, 'D');
    p.rect(12, 12, 8, 12, 'G');
    p.vline(12, 12, 12, 'g');
    p.rect(13, 7, 6, 5, 'D');
    p.rect(15, 7, 2, 2, 'R');
  }
  return p.toMap();
}

/* ------------------------------------------------------------------ */
/* キャラクター                                                        */
/* ------------------------------------------------------------------ */

type Dir = 'down' | 'up' | 'right';

interface CharStyle {
  hat: 'thief' | 'guard';
  body: string;
  bodyDark: string;
  bodyLight: string;
}

const THIEF_STYLE: CharStyle = { hat: 'thief', body: 'B', bodyDark: 'v', bodyLight: 'B' };
const GUARD_STYLE: CharStyle = { hat: 'guard', body: 'N', bodyDark: 'n', bodyLight: 'm' };

/**
 * キャラクターを描く（デフォルメ: 大きな頭・小さな体・大きな目）。
 * frame 0/1/2 で歩行（0: 立ち, 1: 左足前, 2: 右足前）。
 */
export function characterSprite(style: CharStyle, dir: Dir, frame: 0 | 1 | 2): PixelMap {
  const p = new Pix();
  const bob = frame === 0 ? 0 : -1;
  const hair = style.hat === 'thief' ? 'K' : 'M';

  const headDownUp = (face: boolean) => {
    // 頭（角を落とした 16×14）
    p.rect(8, 4 + bob, 16, 14, 'S');
    p.px(8, 4 + bob, '.').px(23, 4 + bob, '.').px(8, 17 + bob, '.').px(23, 17 + bob, '.');
    p.vline(23, 6 + bob, 10, 's').hline(10, 17 + bob, 12, 's');
    if (face) {
      // 大きな目（3×4）とハイライト
      for (const ex of [11, 18]) {
        p.rect(ex, 9 + bob, 3, 4, 'W');
        p.rect(ex + 1, 10 + bob, 2, 3, 'K');
        p.px(ex + 1, 10 + bob, 'W');
      }
      p.px(10, 14 + bob, 'p').px(21, 14 + bob, 'p'); // ほほ
      p.hline(15, 15 + bob, 2, 's'); // 口
      if (style.hat === 'thief') {
        // 目元の黒いマスク（目の穴は残す）
        p.rect(8, 9 + bob, 16, 1, 'K').rect(8, 13 + bob, 16, 1, 'K');
        p.rect(8, 10 + bob, 3, 3, 'K').rect(14, 10 + bob, 4, 3, 'K').rect(21, 10 + bob, 3, 3, 'K');
      }
    } else {
      p.rect(8, 4 + bob, 16, 14, hair);
      p.px(8, 4 + bob, '.').px(23, 4 + bob, '.').px(8, 17 + bob, '.').px(23, 17 + bob, '.');
      p.rect(9, 15 + bob, 14, 3, 'S'); // うなじ
    }
    // 髪（前髪）か帽子
    if (style.hat === 'thief') {
      p.rect(9, 1 + bob, 14, 5, 'K'); // クラウン
      p.rect(6, 5 + bob, 20, 2, 'K'); // 広いつば
      p.hline(9, 4 + bob, 14, 'k'); // リボン
    } else {
      p.rect(9, 2 + bob, 14, 4, 'N');
      p.hline(9, 2 + bob, 14, 'm');
      p.rect(7, 6 + bob, 18, 2, face ? 'K' : 'n'); // つば
      if (face) p.rect(15, 3 + bob, 2, 2, 'Y'); // 帽章
      if (face) p.hline(9, 8 + bob, 14, hair); // 前髪
    }
  };

  if (dir === 'down' || dir === 'up') {
    const legL = frame === 1 ? -2 : 0;
    const legR = frame === 2 ? -2 : 0;
    // 足（短い）
    p.rect(11, 26 + legL, 4, 3, style.bodyDark).rect(11, 29 + legL, 4, 2, 'K');
    p.rect(17, 26 + legR, 4, 3, style.bodyDark).rect(17, 29 + legR, 4, 2, 'K');
    // 体（小さい）
    p.rect(10, 18 + bob, 12, 8, style.body);
    p.vline(10, 18 + bob, 8, style.bodyLight).vline(21, 18 + bob, 8, style.bodyDark);
    p.hline(10, 24 + bob, 12, 'K'); // ベルト
    if (style.hat === 'guard' && dir === 'down') p.rect(13, 20 + bob, 2, 2, 'Y'); // バッジ
    // 腕
    const armL = frame === 2 ? -1 : 0;
    const armR = frame === 1 ? -1 : 0;
    p.rect(8, 19 + bob + armL, 2, 5, style.body).rect(8, 24 + bob + armL, 2, 2, 'S');
    p.rect(22, 19 + bob + armR, 2, 5, style.body).rect(22, 24 + bob + armR, 2, 2, 'S');
    headDownUp(dir === 'down');
    return p.toMap();
  }

  // 横向き（右）
  const stride = frame === 0 ? 0 : frame === 1 ? 2 : -2;
  p.rect(12 - stride, 26, 4, 3, style.bodyDark).rect(12 - stride, 29, 4, 2, 'K');
  p.rect(16 + stride, 26, 4, 3, style.body).rect(16 + stride, 29, 4, 2, 'K');
  p.rect(11, 18 + bob, 10, 8, style.body);
  p.vline(20, 18 + bob, 8, style.bodyDark);
  p.hline(11, 24 + bob, 10, 'K');
  const swing = frame === 1 ? 2 : frame === 2 ? -2 : 0;
  p.rect(15 + swing, 19 + bob, 2, 5, style.bodyDark).rect(15 + swing, 24 + bob, 2, 2, 'S');
  // 頭（横顔: 後頭部は髪）
  p.rect(9, 4 + bob, 14, 14, 'S');
  p.px(9, 4 + bob, '.').px(22, 4 + bob, '.').px(9, 17 + bob, '.').px(22, 17 + bob, '.');
  p.rect(9, 5 + bob, 5, 12, hair);
  p.hline(11, 17 + bob, 10, 's');
  p.rect(17, 9 + bob, 3, 4, 'W').rect(18, 10 + bob, 2, 3, 'K').px(18, 10 + bob, 'W'); // 目
  p.px(21, 14 + bob, 'p');
  if (style.hat === 'thief') {
    p.rect(14, 9 + bob, 9, 1, 'K').rect(14, 13 + bob, 9, 1, 'K').rect(14, 10 + bob, 3, 3, 'K').rect(20, 10 + bob, 3, 3, 'K');
    p.rect(10, 1 + bob, 13, 5, 'K').rect(8, 5 + bob, 18, 2, 'K').hline(10, 4 + bob, 13, 'k');
  } else {
    p.rect(10, 2 + bob, 13, 4, 'N').hline(10, 2 + bob, 13, 'm').rect(12, 6 + bob, 14, 2, 'K');
    p.rect(13, 20 + bob, 2, 2, 'Y');
  }
  return p.toMap();
}

export function thiefSprite(dir: Dir, frame: 0 | 1 | 2): PixelMap {
  return characterSprite(THIEF_STYLE, dir, frame);
}
export function guardSprite(dir: Dir, frame: 0 | 1 | 2): PixelMap {
  return characterSprite(GUARD_STYLE, dir, frame);
}

/** 気絶して横たわる警備員（横向きを回転し、目を閉じる） */
export function guardKoSprite(): PixelMap {
  const base = rotate90(guardSprite('right', 0));
  const p = new Pix().blit(base, 0, 0);
  // 回転後は頭が右側・上向き。目を「x」に
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (p.cells[y]![x] === 'W') p.cells[y]![x] = 'S';
  return p.toMap();
}

/* ------------------------------------------------------------------ */
/* マーク・エフェクト                                                  */
/* ------------------------------------------------------------------ */

export function exclamationMark(): PixelMap {
  const p = new Pix(16, 16);
  p.rect(6, 1, 4, 9, 'R').rect(6, 12, 4, 3, 'R');
  p.vline(6, 1, 9, 'W');
  return p.toMap();
}

export function questionMark(): PixelMap {
  const p = new Pix(16, 16);
  p.rect(4, 1, 8, 2, 'Y').rect(3, 2, 2, 3, 'Y').rect(10, 2, 3, 4, 'Y').rect(8, 6, 3, 2, 'Y').rect(7, 8, 3, 2, 'Y').rect(7, 12, 3, 3, 'Y');
  return p.toMap();
}

export function zzzMark(): PixelMap {
  const p = new Pix(16, 16);
  // 小さな Z と大きな Z
  p.hline(1, 9, 5, 'W').px(4, 10, 'W').px(3, 11, 'W').px(2, 12, 'W').hline(1, 13, 5, 'W');
  p.hline(8, 1, 7, 'W').px(13, 2, 'W').px(12, 3, 'W').px(11, 4, 'W').px(10, 5, 'W').px(9, 6, 'W').hline(8, 7, 7, 'W');
  return p.toMap();
}

export function starMark(): PixelMap {
  const p = new Pix(8, 8);
  p.vline(3, 0, 8, 'Y').hline(0, 3, 8, 'Y').px(1, 1, 'Y').px(5, 1, 'Y').px(1, 5, 'Y').px(5, 5, 'Y').px(3, 3, 'W');
  return p.toMap();
}

export function hiddenMark(): PixelMap {
  const p = new Pix(16, 16);
  // 閉じた目（見えない）
  p.hline(2, 7, 12, 'f').px(1, 6, 'f').px(14, 6, 'f').px(3, 9, 'f').px(6, 10, 'f').px(9, 10, 'f').px(12, 9, 'f');
  return p.toMap();
}

export function sparkMark(): PixelMap {
  const p = new Pix(4, 4);
  p.rect(0, 0, 4, 4, 'Y').px(1, 1, 'W').px(2, 1, 'W').px(1, 2, 'W').px(2, 2, 'W');
  return p.toMap();
}

export function smokeMark(): PixelMap {
  const p = new Pix(12, 12);
  p.ellipse(6, 6, 5.5, 5.5, 'g').ellipse(5, 5, 3, 3, 'h');
  return p.toMap();
}

/** すべてのテクスチャ定義（key → PixelMap） */
export function buildAllSprites(): Record<string, PixelMap> {
  const out: Record<string, PixelMap> = {
    floor_0: floorTile(0),
    floor_1: floorTile(1),
    floor_2: floorTile(2),
    wall: wallTile(),
    hiding_spot: lockerTile(),
    door_closed: doorClosedTile(),
    door_open: doorOpenTile(),
    exit: exitTile(),
    treasure: treasureSprite(),
    camera_right: cameraSprite('right'),
    camera_left: flipH(cameraSprite('right')),
    camera_up: cameraSprite('up'),
    camera_down: cameraSprite('down'),
    guard_ko: guardKoSprite(),
    mark_exclaim: exclamationMark(),
    mark_question: questionMark(),
    mark_zzz: zzzMark(),
    mark_star: starMark(),
    mark_hidden: hiddenMark(),
    mark_spark: sparkMark(),
    mark_smoke: smokeMark(),
  };
  for (const [name, fn] of [
    ['thief', thiefSprite],
    ['guard', guardSprite],
  ] as const) {
    for (const frame of [0, 1, 2] as const) {
      out[`${name}_down_${frame}`] = fn('down', frame);
      out[`${name}_up_${frame}`] = fn('up', frame);
      out[`${name}_right_${frame}`] = fn('right', frame);
      out[`${name}_left_${frame}`] = flipH(fn('right', frame));
    }
  }
  return out;
}

/** ピクセルマップを Canvas に描画する（Phaser 非依存）。 */
export function drawPixelMap(ctx: CanvasRenderingContext2D, map: PixelMap, ox = 0, oy = 0): void {
  for (let y = 0; y < map.length; y++) {
    const row = map[y]!;
    for (let x = 0; x < row.length; x++) {
      const color = PALETTE[row[x]!];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}
