/**
 * 8bit 風の効果音・BGM を WebAudio で合成する（外部素材なし）。
 * ゲームロジックには一切関与しない（描画層と同じ扱い）。
 */
export type SfxName = 'start' | 'treasure' | 'alarm' | 'spotted' | 'knockout' | 'hide' | 'captured' | 'success' | 'signal' | 'door' | 'wake' | 'ui';
export type BgmMode = 'none' | 'plan' | 'infiltrate';

type Note = { f: number; d: number; t?: OscillatorType; v?: number } | null;

/** 音名 → 周波数 */
const N = (name: string): number => {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  if (!m) return 440;
  const base: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  const semis = base[m[1]!]! + (m[2] ? 1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * Math.pow(2, semis / 12);
};

const SFX: Record<SfxName, Note[]> = {
  start: [{ f: N('C5'), d: 0.08 }, { f: N('E5'), d: 0.08 }, { f: N('G5'), d: 0.16 }],
  treasure: [{ f: N('E5'), d: 0.07 }, { f: N('G5'), d: 0.07 }, { f: N('C6'), d: 0.07 }, { f: N('E6'), d: 0.18 }],
  alarm: [{ f: N('A4'), d: 0.12, t: 'sawtooth' }, { f: N('D5'), d: 0.12, t: 'sawtooth' }, { f: N('A4'), d: 0.12, t: 'sawtooth' }, { f: N('D5'), d: 0.12, t: 'sawtooth' }],
  spotted: [{ f: N('G5'), d: 0.06, t: 'square' }, { f: N('C6'), d: 0.14, t: 'square' }],
  knockout: [{ f: N('C4'), d: 0.08, t: 'triangle' }, { f: N('G3'), d: 0.08, t: 'triangle' }, { f: N('C3'), d: 0.2, t: 'triangle' }],
  hide: [{ f: N('A4'), d: 0.05, t: 'triangle', v: 0.5 }, { f: N('E4'), d: 0.1, t: 'triangle', v: 0.4 }],
  captured: [{ f: N('E4'), d: 0.15, t: 'sawtooth' }, { f: N('D#4'), d: 0.15, t: 'sawtooth' }, { f: N('D4'), d: 0.15, t: 'sawtooth' }, { f: N('C#4'), d: 0.4, t: 'sawtooth' }],
  success: [{ f: N('C5'), d: 0.1 }, { f: N('E5'), d: 0.1 }, { f: N('G5'), d: 0.1 }, { f: N('C6'), d: 0.1 }, null, { f: N('G5'), d: 0.08 }, { f: N('C6'), d: 0.35 }],
  signal: [{ f: N('A5'), d: 0.05, t: 'triangle' }, { f: N('A5'), d: 0.05, t: 'triangle' }],
  door: [{ f: N('D3'), d: 0.08, t: 'square', v: 0.4 }, { f: N('F3'), d: 0.12, t: 'square', v: 0.4 }],
  wake: [{ f: N('C5'), d: 0.06, t: 'triangle' }, null, { f: N('C5'), d: 0.06, t: 'triangle' }, { f: N('E5'), d: 0.1, t: 'triangle' }],
  ui: [{ f: N('C6'), d: 0.04, t: 'square', v: 0.3 }],
};

/** BGM パターン（16 ステップ、各ステップは [メロディ, ベース]。null は休符） */
const BGM: Record<Exclude<BgmMode, 'none'>, { bpm: number; mel: (string | null)[]; bass: (string | null)[]; melType: OscillatorType }> = {
  plan: {
    bpm: 96,
    melType: 'triangle',
    mel: ['E5', null, 'G5', null, 'B5', null, 'G5', null, 'D5', null, 'F#5', null, 'A5', null, 'F#5', null],
    bass: ['E3', null, null, null, 'E3', null, null, null, 'D3', null, null, null, 'D3', null, null, null],
  },
  infiltrate: {
    bpm: 150,
    melType: 'square',
    mel: ['A4', 'A4', null, 'C5', null, 'A4', 'E5', null, 'A4', 'A4', null, 'C5', 'D5', null, 'C5', null],
    bass: ['A2', null, 'A2', null, 'A2', null, 'A2', null, 'G2', null, 'G2', null, 'G2', null, 'G2', null],
  },
};

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 0.5;
  private muted = true;
  private bgmMode: BgmMode = 'none';
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private bgmNextTime = 0;

  /** ユーザー操作のあとに呼ぶ（ブラウザの自動再生制限を解除） */
  unlock(): void {
    if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.applyVolume();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.bgmMode !== 'none' && this.bgmTimer === null) this.startBgmLoop();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolume();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  private applyVolume(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume * 0.4;
  }

  playSfx(name: SfxName): void {
    if (!this.ctx || !this.master || this.muted) return;
    const seq = SFX[name];
    let t = this.ctx.currentTime;
    for (const n of seq) {
      if (n) this.tone(n.f, t, n.d, n.t ?? 'square', n.v ?? 0.6);
      t += n ? n.d : 0.08;
    }
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(g).connect(this.master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  setBgm(mode: BgmMode): void {
    if (mode === this.bgmMode) return;
    this.bgmMode = mode;
    this.bgmStep = 0;
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    if (mode !== 'none' && this.ctx) this.startBgmLoop();
  }

  private startBgmLoop(): void {
    if (!this.ctx) return;
    this.bgmNextTime = this.ctx.currentTime + 0.05;
    const tick = () => {
      if (!this.ctx || this.bgmMode === 'none') return;
      const pat = BGM[this.bgmMode];
      const stepDur = 60 / pat.bpm / 2; // 8分音符
      while (this.bgmNextTime < this.ctx.currentTime + 0.3) {
        if (!this.muted) {
          const i = this.bgmStep % 16;
          const m = pat.mel[i];
          const b = pat.bass[i];
          if (m) this.tone(N(m), this.bgmNextTime, stepDur * 0.9, pat.melType, 0.25);
          if (b) this.tone(N(b), this.bgmNextTime, stepDur * 1.8, 'triangle', 0.3);
        }
        this.bgmStep++;
        this.bgmNextTime += stepDur;
      }
    };
    tick();
    this.bgmTimer = window.setInterval(tick, 120);
  }
}

export const audio = new AudioEngine();
