/* Play statistics: `npm run test:stats` */
import assert from 'node:assert/strict';
import type { KV } from '../server/leaderboard';
import { PlayStats, impacts, type MatchReport, type StatsAgg, type StoredLog } from '../server/stats';
import { chooseAction } from '../core/ai';
import { PRESET_DECKS } from '../core/decks';
import { actor, apply, createGame, mulberry32, type Action } from '../core/engine';
import type { GameLog } from '../core/gamelog';

const mem = new Map<string, unknown>();
const kv: KV = { get: async <T>(k: string) => structuredClone(mem.get(k)) as T | undefined, put: async (k, v) => { mem.set(k, structuredClone(v)); }, list: async <T>(p: string) => [...mem.entries()].filter(([k]) => k.startsWith(p)).map(([, v]) => v as T),
  page: async <T>(p: string, after: string | undefined, limit: number) => [...mem.entries()].filter(([k]) => k.startsWith(p) && (!after || k > after)).sort(([a], [b]) => (a < b ? -1 : 1)).slice(0, limit).map(([k, v]) => [k, structuredClone(v) as T] as [string, T]) };
let now = 1000;
const st = new PlayStats(kv, () => now++, 'secret-token');
/** A real game against the AI, recorded the way the client does it (optionally stopped early). */
function game(seed: number, stopAt = Infinity): { log: GameLog; score: 0 | 0.5 | 1; reason: string } {
  const decks: [string[], string[]] = [PRESET_DECKS[0].cards.slice(), PRESET_DECKS[1].cards.slice()];
  const { state } = createGame(decks, seed, 0);
  const log: GameLog = { seed, first: 0, decks, actions: [] };
  const r = mulberry32(seed);
  while (!state.over && log.actions.length < stopAt) { const a: Action = chooseAction(state, actor(state) as 0 | 1, 'easy', r); log.actions.push(a); apply(state, a); }
  if (!state.over) return { log, score: 0, reason: 'surrender' };
  return { log, score: state.over.winner === 0 ? 1 : state.over.winner === -1 ? 0.5 : 0, reason: state.over.reason };
}
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
  // ---------------------------------------------------------------- full game records
  const g = game(11);
  const rep = (o: Partial<MatchReport>) => base({ v: '0.13.0', deck: g.log.decks[0], played: [], score: g.score, reason: g.reason, log: g.log, deckName: '均衡の刻', foe: '秒針突撃', ...o });
  assert.equal(((await st.record(rep({ gid: 'L1' }))).body as { logged: boolean }).logged, true, 'a real game is kept');
  const bent = structuredClone(g.log); bent.actions[3] = { t: 'wait' };
  const kept = async (o: Partial<MatchReport>) => ((await st.record(rep(o))).body as { logged: boolean }).logged;
  assert.equal(await kept({ gid: 'L2', log: bent }), true, 'a record that does not replay is kept, marked');
  assert.equal(await kept({ gid: 'L3', score: g.score === 1 ? 0 : 1 }), true, 'so is one whose result differs');
  assert.equal(await kept({ gid: 'L4', deck: PRESET_DECKS[2].cards }), true, 'and one whose deck differs');
  const quit = game(12, 30);
  assert.equal(await kept({ gid: 'L5', log: quit.log, score: 0, reason: 'surrender' }), true, 'a game given up is kept up to that point');
  const instant = game(13, 2);
  const shortRes = (await st.record(rep({ gid: 'L7', log: instant.log, score: 0, reason: 'surrender', actions: 1 }))).body as { ok: boolean; logged: boolean };
  assert.deepEqual([shortRes.ok, shortRes.logged], [false, true], 'a very short game is kept in full but not counted in the totals');
  assert.equal(await kept({ gid: 'L6', mode: 'online', ai: undefined }), false, 'online games are recorded by the room, not the client');
  await st.keepRoom({ gid: 'ROOM-1', v: '0.13.0', at: now++, names: ['アリス', 'ボブ'], winner: 0, reason: 'ko', ms: 1, log: g.log });
  mem.set(`p:${dev}`, { name: 'レジあいす' });

  assert.equal((await st.logs({ token: 'nope' })).status, 403, 'the records need the admin token');
  const all: StoredLog[] = [];
  let after: string | null = null, pages = 0;
  do {
    const pg = (await st.logs({ token: 'secret-token', v: '0.13.0', after: after ?? undefined, limit: 3 })).body as { items: StoredLog[]; next: string | null };
    all.push(...pg.items); after = pg.next; pages++;
  } while (after);
  assert.ok(pages >= 3, 'paged');
  assert.deepEqual(all.map((x) => x.gid), ['L1', 'L2', 'L3', 'L4', 'L5', 'L7', 'ROOM-1'], 'kept records in time order');
  assert.deepEqual(all.map((x) => x.problem ?? ''), ['', '途中から再現できない', '結果が再現と違う', 'デッキが報告と違う', '', '', ''], 'problems are marked');
  assert.deepEqual(all[0].names, ['レジあいす', '秒針突撃'], 'ranked players are named');
  assert.equal(all[4].winner, 1);
  assert.equal(all[6].src, 'room');
  console.log('stats ok');
})();
