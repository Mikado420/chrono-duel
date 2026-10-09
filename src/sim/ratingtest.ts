/* Rated play and the friends' ranking: `npm run test:rating` */
import assert from 'node:assert/strict';
import { AI_RATING, NEW_RATED, RATING_RESET, applyRatingReset, resetRating, RATED_FOES, START_RATING, finishRated, foeById, makeOpponent, nextRating, opponentPool, pickOpponent, rivalPool, startRated, tierOf } from '../meta/rating';
import { ROSTER, deckAvailable, rivalById, rivalDeck, rivalId } from '../meta/roster';
import { Leaderboard, MIN_GAME_MS, rankDay, type KV } from '../server/leaderboard';
import { mulberry32 } from '../core/engine';

// tiers and matchmaking
assert.equal(tierOf(START_RATING).tier.name, '見習い');
assert.equal(tierOf(0).tier.id, 'novice');
assert.equal(tierOf(99999).tier.id, 'shin');
assert.equal(tierOf(1000).tier.name, '見習い');
assert.equal(tierOf(1199).tier.name, '見習い');
assert.equal(tierOf(1200).tier.name, '刻士');
assert.equal(tierOf(1999).tier.name, '刻聖');
assert.equal(tierOf(2000).tier.name, '刻神');
const top = RATED_FOES[RATED_FOES.length - 1].rating, bottom = RATED_FOES[0].rating;
for (let r = 0; r < 2200; r += 25) {
  const pool = opponentPool(r);
  assert.ok(Math.abs(pool.reduce((a, [, w]) => a + w, 0) - 1) < 1e-9, `weights sum to 1 at ${r}`);
  assert.ok(pool.every(([id]) => foeById(id)), 'known opponents only');
  // inside the range of opponents, the expected gap stays small
  const gap = pool.reduce((a, [id, w]) => a + w * Math.abs(foeById(id)!.rating - r), 0);
  if (r >= bottom && r <= top) assert.ok(gap <= 70, `opponents near ${r} (average gap ${gap.toFixed(0)})`);
}
assert.deepEqual(opponentPool(3000), [[RATED_FOES[RATED_FOES.length - 1].id, 1]], 'the strongest above the top');
assert.ok(RATED_FOES.every((f, i) => i === 0 || f.rating > RATED_FOES[i - 1].rating), 'steps in order');
assert.deepEqual(['easy', 'normal', 'hard', 'expert'].map((id) => foeById(id)!.rating), [AI_RATING.easy, AI_RATING.normal, AI_RATING.hard, AI_RATING.expert], 'the old ids keep their ratings');
const rand = mulberry32(1);
assert.ok(Array.from({ length: 200 }, () => pickOpponent(1290, rand)).every((l) => l !== 'normal' && l !== 'easy'), 'no weak opponent for a 1290 player any more');
assert.ok(Array.from({ length: 200 }, () => pickOpponent(800, rand)).every((l) => l === 'easy' || l === 'easy+'), 'beginners meet the weaker AIs');

// Elo: beating a stronger AI is worth more; every result moves the number
const upHard = nextRating(1000, 50, AI_RATING.hard, 1) - 1000, upEasy = nextRating(1000, 50, AI_RATING.easy, 1) - 1000;
assert.ok(upHard > upEasy && upEasy >= 1, 'bigger gain against a stronger AI');
assert.ok(nextRating(1000, 50, AI_RATING.easy, 0) < 1000);
assert.ok(nextRating(1000, 0, AI_RATING.normal, 1) - 1000 > nextRating(1000, 50, AI_RATING.normal, 1) - 1000, 'placement games swing more');
assert.ok(nextRating(2400, 50, AI_RATING.expert, 1) > 2400, 'a win always gains');
assert.equal(nextRating(100, 50, AI_RATING.expert, 0), 100, 'floor');
// where does a player settle who wins 60% against 超つよい? (sanity: above the AI's own rating)
let r = START_RATING, g = 0;
const rr = mulberry32(9);
for (let i = 0; i < 3000; i++) { r = nextRating(r, g++, AI_RATING.expert, rr() < 0.6 ? 1 : 0); }
assert.ok(r > AI_RATING.expert && r < AI_RATING.expert + 200, `60% vs 超つよい settles near ${r}`);

// local record: pending → finished, outbox
// opponents are the roster's rivals: near the player's rating, never the player's own name or a recent one
const names = new Set(ROSTER.map((x) => x.name));
for (let i = 0; i < 300; i++) {
  const o = makeOpponent(950 + i * 4, 'たっくん', ['二度寝の刻'], rand);
  assert.ok(names.has(o.name) && o.name !== 'たっくん' && o.name !== '二度寝の刻');
  assert.equal(o.rating, foeById(o.ai)!.rating, 'a rival always shows its own rating');
  assert.ok(o.deck && deckAvailable(o.deck), 'a deck that exists in the game');
  assert.ok(!/AI|つよい|やさしい|ふつう/.test(o.name), 'names never give the AI away');
}
for (let r = 900; r <= 2200; r += 50) {
  const pool = rivalPool(r);
  assert.ok(Math.abs(pool.reduce((a, [, w]) => a + w, 0) - 1) < 1e-9);
  const gap = pool.reduce((a, [id, w]) => a + w * Math.abs(foeById(id)!.rating - r), 0);
  if (r >= 1000 && r <= 2100) assert.ok(gap <= 90, `rivals near ${r} (average gap ${gap.toFixed(0)})`);
}
assert.equal(ROSTER.length, 120);
assert.ok(ROSTER.every((x) => rivalById(rivalId(x)) === x && foeById(rivalId(x))!.rating === x.rating), 'every rival id resolves');
// 第2弾 is not out: a rival whose main deck is 第2弾 brings its second deck
const g2 = ROSTER.find((x) => x.deck.startsWith('g_'))!;
assert.equal(rivalDeck(g2, false), g2.sub);
// a rival that lost last time sometimes switches decks
const both = ROSTER.find((x) => !x.deck.startsWith('g_') && !x.sub.startsWith('g_'))!;
const switched = Array.from({ length: 400 }, () => rivalDeck(both, true, rand)).filter((d) => d === both.sub).length;
assert.ok(switched > 80 && switched < 160, `about 30% switch (${switched}/400)`);
assert.ok(Array.from({ length: 50 }, () => rivalDeck(both, false, rand)).every((d) => d === both.deck));

const me = NEW_RATED();
assert.equal(finishRated(me, 1, 10, 1000, 'x'), null, 'nothing to finish without a start');
startRated(me, { ai: 'normal', name: 'みなと', rating: 1010 }, 'balance', 1000);
const done = finishRated(me, 1, 12, 1000 + 5 * 60_000, 'g1')!;
assert.ok(done.after > done.before && me.games === 1 && me.wins === 1 && me.outbox.length === 1 && !me.pending);
assert.equal(done.after, nextRating(1000, 0, 1010, 1), 'the shown rating is the one used');
assert.equal(done.foe, 'みなと');

// ranking server replays the same rules and never trusts a client number
const mem = new Map<string, unknown>();
const kv: KV = { get: async (k) => structuredClone(mem.get(k)) as never, put: async (k, v) => { mem.set(k, structuredClone(v)); }, list: async (p) => [...mem.entries()].filter(([k]) => k.startsWith(p)).map(([, v]) => structuredClone(v)) as never };
let now = 10_000_000;
const lb = new Leaderboard(kv, () => now);
const A = { id: 'aaaaaaaaaaaaaaaaaaaa', secret: 'sssssssssssssssssssss', name: 'アリス' };
const B = { id: 'bbbbbbbbbbbbbbbbbbbb', secret: 'tttttttttttttttttttttt', name: 'ボブ' };
const game = (gid: string, score: 0 | 0.5 | 1, at: number, ms = 5 * 60_000, actions = 15, opp?: number) => ({ gid, ai: 'hard' as const, opp, score, actions, ms, at });
let res = await lb.submit({ ...A, games: [game('a1', 1, now)] });
assert.equal(res.status, 200);
const r1 = (res.body as { rating: number }).rating;
assert.equal(r1, nextRating(START_RATING, 0, AI_RATING.hard, 1), 'server uses the shared rules');
// a made-up very strong opponent falls back to the level's rating
{ const lb2 = new Leaderboard(kv, () => now); const C = { id: 'cccccccccccccccccccc', secret: 'uuuuuuuuuuuuuuuuuuuuuu', name: 'c' };
  const x = await lb2.submit({ ...C, games: [game('c1', 1, now, 5 * 60_000, 15, 2400)] });
  assert.equal((x.body as { rating: number }).rating, nextRating(START_RATING, 0, AI_RATING.hard, 1), 'opponent rating is bounded by its level');
  mem.delete(`p:${C.id}`);
  // the steps between levels are known to the server; an unknown opponent is refused
  const y = await lb2.submit({ ...C, games: [{ ...game('c2', 1, now), ai: 'hard+' }, { ...game('c3', 1, now + 2 * MIN_GAME_MS), ai: 'super' }] });
  assert.equal((y.body as { rating: number }).rating, nextRating(START_RATING, 0, foeById('hard+')!.rating, 1), 'a step has its own rating');
  assert.deepEqual((y.body as { refused: string[] }).refused, ['c3']);
  mem.delete(`p:${C.id}`); }
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
// titles and featured cards: only real ones are kept; places of the day before come back as `prev`
await lb.submit({ ...A, title: 'first', fav: 'dragon', games: [] });
await lb.submit({ ...B, title: 'fake', fav: 'not-a-card', games: [] });
type Row = { name: string; rating?: number; title?: string; fav?: string; prev?: number | null };
let rows = ((await lb.ranking({})).body as { top: Row[] }).top;
assert.equal(rows.find((r) => r.name === 'アリス')!.title, 'first');
assert.equal(rows.find((r) => r.name === 'アリス')!.fav, 'dragon');
assert.equal(rows.find((r) => r.name === 'ボブ')!.title, undefined, 'unknown titles are not kept');
assert.equal(rows.find((r) => r.name === 'ボブ')!.fav, undefined, 'unknown cards are not kept');
assert.equal(rows[0].prev, null, 'no earlier day yet');
// the next day アリス overtakes ボブ: yesterday's places are reported
now += 24 * 3600_000;
for (let i = 0; i < 6; i++) { now += 2 * MIN_GAME_MS; await lb.submit({ ...A, games: [{ ...game(`a-up${i}`, 1, now), ai: 'expert' as const }] }); }
rows = ((await lb.ranking({})).body as { top: Row[] }).top;
assert.equal(rows[0].name, 'アリス');
assert.equal(rows[0].prev, 2, 'アリス was 2nd the day before');
assert.equal(rows[1].prev, 1, 'ボブ was 1st the day before');
assert.equal(rankDay(Date.UTC(2026, 9, 8, 15, 30)), '2026-10-09', 'the ranking day is Japan time');
// the one-time reset when the ranks were redrawn: 刻匠 and above → 1400, 刻士 → 1200, the rest → 1000
assert.deepEqual([2150, 1400, 1399, 1200, 1199, 1000, 850].map(resetRating), [1400, 1400, 1200, 1200, 1000, 1000, 1000]);
{
  const old = { rating: 1720, streak: 4 } as { rating: number; streak?: number; reset?: string };
  assert.equal(applyRatingReset(old), true);
  assert.equal(old.rating, 1400); assert.equal(old.streak, 0);
  assert.equal(applyRatingReset(old), false, 'only once');
  assert.equal(NEW_RATED().reset, RATING_RESET, 'new players start already reset');
  // the server: a record saved before the reset is shown reset in the ranking, and saved reset when the player returns
  const D = { id: 'dddddddddddddddddddd', secret: 'vvvvvvvvvvvvvvvvvvvvvv', name: 'でぃー' };
  await lb.submit({ ...D, games: [] });
  const recD = mem.get(`p:${D.id}`) as { rating: number; games: number; reset?: string };
  mem.set(`p:${D.id}`, { ...recD, rating: 1650, games: 30, reset: undefined });
  const shown = ((await lb.ranking({})).body as { top: Row[] }).top.find((r) => r.name === 'でぃー');
  assert.equal(shown?.rating, 1400);
  const back = (await lb.submit({ ...D, games: [] })).body as { rating: number };
  assert.equal(back.rating, 1400);
  assert.equal((mem.get(`p:${D.id}`) as { reset?: string }).reset, RATING_RESET);
}
console.log(`rating after one hard win: ${r1}; ranking ok`);
console.log('all rating tests passed');
