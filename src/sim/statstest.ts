/* Play statistics: `npm run test:stats` */
import assert from 'node:assert/strict';
import type { KV } from '../server/leaderboard';
import { PlayStats, impacts, type MatchReport, type StatsAgg } from '../server/stats';

const mem = new Map<string, unknown>();
const kv: KV = { get: async <T>(k: string) => structuredClone(mem.get(k)) as T | undefined, put: async (k, v) => { mem.set(k, structuredClone(v)); }, list: async <T>(p: string) => [...mem.entries()].filter(([k]) => k.startsWith(p)).map(([, v]) => v as T) };
const st = new PlayStats(kv, () => 1000);
const dev = 'device-aaaaaaaaaaaaaaaa';
const base = (o: Partial<MatchReport>): MatchReport => ({ gid: Math.random().toString(36), id: dev, v: '0.11.0', mode: 'free', ai: 'normal', deck: ['arrow', 'arrow', 'gear'], played: ['arrow'], score: 1, reason: 'ko', actions: 20, ms: 90000, ...o });

(async () => {
  const r1 = base({ gid: 'g1' });
  assert.equal((await st.record(r1)).status, 200);
  assert.deepEqual((await st.record(r1)).body, { ok: true, dup: true }, 'the same game counts once');
  await st.record(base({ played: [], score: 0 }));
  await st.record(base({ mode: 'online', ai: undefined, played: ['gear'], score: 0.5 }));
  assert.equal((await st.record(base({ deck: ['nope'] }))).status, 400, 'unknown cards are refused');
  assert.equal((await st.record(base({ deck: ['e_image'] }))).status, 400, 'tokens are not deck cards');
  assert.equal(((await st.record(base({ actions: 2 }))).body as { ok: boolean }).ok, false, 'an early surrender is not counted');
  await st.record(base({ v: '0.12.0' }));

  const s = (await st.summary({})).body as { versions: string[]; agg: StatsAgg };
  assert.deepEqual(s.versions, ['0.12.0', '0.11.0'], 'newest first');
  assert.equal(s.agg.v, '0.12.0');
  const old = ((await st.summary({ v: '0.11.0' })).body as { agg: StatsAgg }).agg;
  assert.deepEqual(old.games['free-normal'], [2, 1]);
  assert.deepEqual(old.games.online, [1, 0.5]);
  assert.deepEqual(old.cards.arrow['free-normal'], [2, 1, 1, 1], 'deck twice (1 point), used once and won');
  const imp = Object.fromEntries(impacts(old).map((x) => [x.id, x]));
  assert.equal(imp.arrow.used, 1);
  assert.equal(imp.arrow.lift, 50, 'won the only game it was used in, the mode average is 50%');
  assert.equal(imp.gear.winUsed, 50);
  console.log('stats ok');
})();
