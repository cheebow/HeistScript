import { describe, expect, it } from 'vitest';
import { LocalStorageRepository, SAVE_SCHEMA_VERSION, sanitizeSaveData } from '../../src/storage/repository';

class FakeStorage implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

describe('保存', () => {
  it('schemaVersion 付きでステージ別に保存される', () => {
    const repo = new LocalStorageRepository(new FakeStorage());
    const d = repo.load();
    d.stages['stage_01'] = { scripts: { thief_a: 'move jewel' }, cleared: true, bestTicks: 50, challenges: [] };
    repo.save(d);
    const loaded = repo.load();
    expect(loaded.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(loaded.stages['stage_01']!.scripts['thief_a']).toBe('move jewel');
    expect(loaded.stages['stage_01']!.bestTicks).toBe(50);
  });
  it('ベスト記録とカスタムステージを保存・復元し、不正な値は捨てる', () => {
    const repo = new LocalStorageRepository(new FakeStorage());
    const d = repo.load();
    d.stages['stage_01'] = {
      scripts: {},
      cleared: true,
      bestTicks: 61,
      challenges: ['fast'],
      best: { ticks: 61, instructions: 3, spotted: 0, knockouts: 0, alarms: 0, challenges: ['fast'], scripts: { thief_a: 'move jewel' } },
      challengeScripts: { fast: { thief_a: 'move jewel' } },
    };
    d.customStages = [{ id: 'custom_x' }, 'junk' as unknown as object];
    repo.save(d);
    const loaded = repo.load();
    expect(loaded.stages['stage_01']!.best?.scripts['thief_a']).toBe('move jewel');
    expect(loaded.stages['stage_01']!.challengeScripts?.['fast']?.['thief_a']).toBe('move jewel');
    expect(loaded.customStages).toEqual([{ id: 'custom_x' }]);
    expect(sanitizeSaveData({ schemaVersion: 1, stages: { a: { best: { ticks: 'x' } } } }).stages['a']!.best).toBeNull();
  });

  it('破損データは既定値へ安全に復帰する', () => {
    const st = new FakeStorage();
    st.setItem('heistscript.save', '{not json');
    const repo = new LocalStorageRepository(st);
    expect(repo.load().stages).toEqual({});
    expect(sanitizeSaveData({ schemaVersion: 99, stages: { a: 1 } }).stages).toEqual({});
    expect(sanitizeSaveData({ schemaVersion: 1, stages: { a: { scripts: { x: 1, y: 'ok' }, cleared: 'yes' } } }).stages['a']).toEqual({
      scripts: { y: 'ok' },
      cleared: false,
      bestTicks: null,
      challenges: [],
      best: null,
      challengeScripts: {},
    });
  });
});
