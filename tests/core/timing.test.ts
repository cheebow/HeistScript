import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/core/runner';
import { cameraTurnIn, describePeriodic, doorCycleInfo, laserInfo, periodicInfos } from '../../src/core/sim/timing';
import { makeStage } from './helpers';

describe('周期設備の「次に変わるまで」', () => {
  const stage = () =>
    makeStage(['############', '#..........#', '#..........#', '#......D...#', '############'], {
      thieves: [{ id: 'thief_a', x: 1, y: 1, direction: 'right', starterScript: '' }],
      cameras: [{ id: 'cam', x: 10, y: 1, direction: 'left', range: 5, rotateEveryTicks: 10 }],
      objects: [
        { id: 'laser', type: 'laser', x: 5, y: 1, onTicks: 4, offTicks: 6, offset: 0 },
        { id: 'gate', type: 'door', x: 7, y: 3, open: true, cycle: { openTicks: 8, closedTicks: 8, offset: 0 } },
      ],
      exit: { x: 1, y: 2 },
    });

  it('カメラ・レーザー・扉の残り tick が実際の変化と一致する', () => {
    const r = createRun(stage(), { thief_a: 'wait 60\n' }).run!;
    for (let i = 0; i < 40; i++) {
      r.step();
      const w = r.world;
      const cam = w.cameras[0]!;
      const n = cameraTurnIn(cam, w.tick)!;
      const li = laserInfo(w.objects.find((o) => o.id === 'laser')!, w.tick)!;
      const di = doorCycleInfo(w.objects.find((o) => o.id === 'gate')!, w.tick)!;
      // 予告どおりの tick まで進めて、状態が変わることを確かめる
      const dir = cam.direction;
      const laserActive = w.objects.find((o) => o.id === 'laser')!.active;
      const doorOpen = w.objects.find((o) => o.id === 'gate')!.open;
      const probe = createRun(stage(), { thief_a: 'wait 60\n' }).run!;
      for (let k = 0; k < w.tick + n; k++) probe.step();
      expect(probe.world.cameras[0]!.direction, `cam at t${w.tick}`).not.toBe(dir);
      const probe2 = createRun(stage(), { thief_a: 'wait 60\n' }).run!;
      for (let k = 0; k < w.tick + li.remaining; k++) probe2.step();
      expect(probe2.world.objects.find((o) => o.id === 'laser')!.active, `laser at t${w.tick}`).toBe(!laserActive);
      const probe3 = createRun(stage(), { thief_a: 'wait 60\n' }).run!;
      for (let k = 0; k < w.tick + di.remaining; k++) probe3.step();
      expect(probe3.world.objects.find((o) => o.id === 'gate')!.open, `door at t${w.tick}`).toBe(!doorOpen);
    }
  });

  it('一覧と文章が作れる', () => {
    const r = createRun(stage(), { thief_a: 'wait 5\n' }).run!;
    r.step();
    const infos = periodicInfos(r.world);
    expect(infos.map((i) => i.kind).sort()).toEqual(['camera', 'door', 'laser']);
    for (const i of infos) expect(describePeriodic(i)).toMatch(/tick 後に/);
  });
});
