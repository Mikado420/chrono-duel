/* Rated play and the friends' ranking: `npm run test:rating` */
import assert from 'node:assert/strict';
import { AI_RATING, EXPERT_ONLY, NEW_RATED, START_RATING, TIERS, finishRated, nextRating, opponentPool, pickOpponent, startRated, tierOf } from '../meta/rating';
import { Leaderboard, MIN_GAME_MS, type KV } from '../server/leaderboard';
import { mulberry32 } from '../core/engine';

// tiers and matchmaking
assert.equal(tierOf(START_RATING).tier.name, '刻守');
assert.equal(tierOf(0).tier.id, 'novice');
assert.equal(tierOf(99999).tier.id, 'eternal');
for (let r = 0; r < 2200; r += 25) {
  const pool = opponentPool(r);
  assert.ok(Math.abs(pool.reduce((a, [, w]) => a + w, 0) - 1) < 1e-9, `weights sum to 1 at ${r}`);
  if (r >= EXPERT_ONLY) assert.deepEqual(pool.map(([l]) => l), ['expert'], 'only 超つよい at the top');
}
const rand = mulberry32(1);
assert.ok(Array.from({ length: 200 }, () => pickOpponent(1400, rand)).some((l) => l === 'expert'), 'expert already appears in 刻匠');
assert.ok(Array.from({ length: 200 }, () => pickOpponent(800, rand)).every((l) => l === 'easy' || l === 'normal'), 'beginners meet the weaker AIs');
assert.equal(TIERS.find((t) => t.min === EXPERT_ONLY)?.name, '時の賢者');

// Elo: beating a stronger AI is worth more; every result moves the number
const upHard = nextRating(1000, 50, 'hard', 1) - 1000, upEasy = nextRating(1000, 50, 'easy', 1) - 1000;
assert.ok(upHard > upEasy && upEasy >= 1, 'bigger gain against a stronger AI');
assert.ok(nextRating(1000, 50, 'easy', 0) < 1000);
assert.ok(nextRating(1000, 0, 'normal', 1) - 1000 > nextRating(1000, 50, 'normal', 1) - 1000, 'placement games swing more');
assert.ok(nextRating(2400, 50, 'expert', 1) > 2400, 'a win always gains');
assert.equal(nextRating(100, 50, 'expert', 0), 100, 'floor');
// where does a player settle who wins 60% against 超つよい? (sanity: above the AI's own rating)
let r = START_RATING, g = 0;
const rr = mulberry32(9);
for (let i = 0; i < 3000; i++) { r = nextRating(r, g++, 'expert', rr() < 0.6 ? 1 : 0); }
assert.ok(r > AI_RATING.expert && r < AI_RATING.expert + 200, `60% vs 超つよい settles near ${r}`);

// local record: pending → finished, outbox
const me = NEW_RATED();
assert.equal(finishRated(me, 1, 10, 1000, 'x'), null, 'nothing to finish without a start');
startRated(me, 'normal', 'balance', 1000);
const done = finishRated(me, 1, 12, 1000 + 5 * 60_000, 'g1')!;
assert.ok(done.after > done.before && me.games === 1 && me.wins === 1 && me.outbox.length === 1 && !me.pending);

// ranking server replays the same rules and never trusts a client number
const mem = new Map<string, unknown>();
const kv: KV = { get: async (k) => structuredClone(mem.get(k)) as never, put: async (k, v) => { mem.set(k, structuredClone(v)); }, list: async (p) => [...mem.entries()].filter(([k]) => k.startsWith(p)).map(([, v]) => structuredClone(v)) as never };
let now = 10_000_000;
const lb = new Leaderboard(kv, () => now);
const A = { id: 'aaaaaaaaaaaaaaaaaaaa', secret: 'sssssssssssssssssssss', name: 'アリス' };
const B = { id: 'bbbbbbbbbbbbbbbbbbbb', secret: 'tttttttttttttttttttttt', name: 'ボブ' };
const game = (gid: string, score: 0 | 0.5 | 1, at: number, ms = 5 * 60_000, actions = 15) => ({ gid, ai: 'hard' as const, score, actions, ms, at });
let res = await lb.submit({ ...A, games: [game('a1', 1, now)] });
assert.equal(res.status, 200);
const r1 = (res.body as { rating: number }).rating;
assert.equal(r1, nextRating(START_RATING, 0, 'hard', 1), 'server uses the shared rules');
res = await lb.submit({ ...A, games: [game('a1', 1, now + 70_000)] });
assert.deepEqual((res.body as { refused: string[] }).refused, ['a1'], 'the same game counts once');
res = await lb.submit({ ...A, games: [game('a2', 1, now + 10_000)] });
assert.deepEqual((res.body as { refused: string[] }).refused, ['a2'], 'wins too close together are refused');
now += 3 * MIN_GAME_MS;
res = await lb.submit({ ...A, games: [game('a3', 1, now, 20_000)] });
assert.deepEqual((res.body as { refused: string[] }).refused, ['a3'], 'a very short win is refused');
res = await lb.submit({ ...A, games: [game('a4', 0, now, 5_000, 0)] });
assert.deepEqual((res.body as { accepted: string[] }).accepted, ['a4'], 'a loss always counts, however short');
res = await lb.submit({ id: A.id, secret: 'xxxxxxxxxxxxxxxxxxxxxxxx', games: [game('a5', 1, now)] });
res = await lb.submit({ ...A, games: [game('a6', 1, now + 10 * 60_000)] });
assert.deepEqual((res.body as { refused: string[] }).refused, ['a6'], 'games from the future are refused');
res = await lb.submit({ id: A.id, secret: 'xxxxxxxxxxxxxxxxxxxxxxxx', games: [game('a5', 1, now)] });
assert.equal(res.status, 403, 'someone else cannot post for you');
now += 20 * 60_000;
await lb.submit({ ...B, games: [game('b1', 1, now - 12 * 60_000), game('b2', 1, now - 6 * 60_000), game('b3', 1, now)] });
now += 60 * 60_000;
res = await lb.ranking({ id: A.id, secret: A.secret });
const rk = res.body as { total: number; top: { name: string; me?: boolean }[]; me: { place: number } };
assert.equal(rk.total, 2);
assert.equal(rk.top[0].name, 'ボブ', 'sorted by rating');
assert.ok(rk.top[1].me && rk.me.place === 2, 'my own row is marked');
assert.ok(!JSON.stringify(res.body).includes(A.id) && !JSON.stringify(res.body).includes('key'), 'no ids or keys leak');
console.log(`rating after one hard win: ${r1}; ranking ok`);
console.log('all rating tests passed');
