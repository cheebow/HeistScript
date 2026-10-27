/**
 * ステージ調整用 CLI: npx tsx scripts/sim.ts <stageId> [thiefId=script.hsl ...] [--trace]
 * スクリプト未指定ならステージの solution を使う。
 */
import { readFileSync } from 'node:fs';
import { getStage } from '../src/core/stages';
import { createRun } from '../src/core/runner';

const [stageId, ...rest] = process.argv.slice(2);
const stage = getStage(stageId ?? '');
if (!stage) {
  console.error('stage not found:', stageId);
  process.exit(1);
}
const trace = rest.includes('--trace');
const scripts: Record<string, string> = { ...(stage.solution ?? {}) };
for (const arg of rest) {
  const m = /^([a-z_0-9]+)=(.+)$/.exec(arg);
  if (m) scripts[m[1]!] = m[2]!.endsWith('.hsl') ? readFileSync(m[2]!, 'utf8') : m[2]!.replace(/\\n/g, '\n');
}
const r = createRun(stage, scripts);
if (!r.run) {
  console.error(JSON.stringify(r.compile.errors, null, 2));
  process.exit(1);
}
const run = r.run;
while (!run.done) {
  run.step();
  if (trace) {
    const w = run.world;
    const th = w.thieves.map((t) => `${t.id}@(${t.x},${t.y})${t.hidden ? 'H' : ''}`).join(' ');
    const gs = w.guards.map((g) => `${g.id}@(${g.x},${g.y})${g.direction[0]}:${g.state}`).join(' ');
    console.log(`t${w.tick} ${th} | ${gs} | ${w.tickLog.map((l) => l.eventType).join(',')}`);
  }
}
for (const l of run.logs) if (!trace || l.level !== 'info') console.log(`t${l.tick} [${l.level}] ${l.actorId} ${l.eventType} ${l.details}`);
console.log('RESULT', run.world.result?.status, run.world.result?.reason, 'tick', run.world.tick, 'stats', JSON.stringify(run.world.stats));
