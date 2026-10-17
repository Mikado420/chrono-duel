/* 環境の集計・設計図・AIのデッキ帳: `npm run test:env` */
import assert from 'node:assert/strict';
import { BLUEPRINTS, MAX_FROM_ORIGIN, checkList, checkPlay, classify, listProfile, originList, shared, signatureOf, styleOf, tooNear } from '../meta/blueprints';
import { cleanBook, listFor, type DeckBook } from '../meta/deckbook';
import { EnvStats, jstDay } from '../server/env';
import { PlayStats } from '../server/stats';
import type { KV } from '../server/leaderboard';
import { ROSTER, rivalId } from '../meta/roster';
import { candidates, findNewDecks, findVariants, flexCards, oneSwaps, paired, type ListRow } from './evolve';
import { archeOf, bookKey } from '../meta/deckbook';
import { ROSTER_DECKS } from './rosterDecks';
import { DECK_TYPES, cardAdoption, cleanTier, computeTier, deckType } from '../meta/envtier';

const base = Object.keys(BLUEPRINTS).filter((id) => !id.startsWith('g_'));
// every built-in list passes its own 設計図 and belongs to its own archetype
for (const id of base) {
  const o = originList(id)!;
  assert.deepEqual(checkList(id, o), [], `${id}: ${checkList(id, o).join(', ')}`);
  // the roster's builds of one 型 share most of their cards (and with the older archetypes), so for them any archetype will do
  // players' lists are only sorted into today's decks (the roster's builds); an older archetype goes to one of them or to 未分類
  if (ROSTER_DECKS.some((d) => d.id === id)) assert.ok(classify(o), `${id} belongs to some archetype`);
  else assert.ok(classify(o) === null || ROSTER_DECKS.some((d) => d.id === classify(o)), `${id} goes to a roster build or 未分類`);
}
// a measured play profile is its own 戦型
for (const [id, b] of Object.entries(BLUEPRINTS)) {
  const cast = b.style === 'burn' ? 4.2 : 2;
  assert.equal(styleOf({ ...b.play, cast }), b.style, `${id} 戦型`);
  assert.deepEqual(checkPlay(id, { ...b.play, cast }), []);
}
// changes the checks catch
{
  const rush = originList('rush')!;
  const noCore = rush.map((c) => (c === 'bolt' ? 'arrow' : c));
  assert.ok(checkList('rush', noCore).some((p) => p.includes('核')), 'the core cannot go');
  // the beatdown deck drifting into a slow deck: cheap units out, big ones in
  const slow = rush.slice();
  let k = 0;
  for (let i = 0; i < slow.length && k < 4; i++) if (['pendulum', 'ghost'].includes(slow[i])) { slow[i] = ['heavy', 'heavy', 'warden', 'warden'][k++]; }
  assert.ok(checkList('rush', slow).length > 0, `drift is refused (${checkList('rush', slow).join(', ')})`);
  const slowPlay = { ...BLUEPRINTS.rush.play, end: 37.5, koShare: 45, dmg20: 2.5, cast: 1.5 };
  assert.ok(checkPlay('rush', slowPlay).some((p) => p.includes('戦型')), 'a slower play pattern is another 戦型');
  // a small, legal tweak passes: one 振り子兵 → 歯車騎士 is still a 秒針突撃
  const tweak = rush.slice(); tweak[tweak.indexOf('pendulum')] = 'e_page';
  assert.deepEqual(checkList('rush', tweak), []);
  assert.equal(classify(tweak), 'second_aggro_pendulum', 'a list near the starter deck goes to the roster build it became');
  assert.ok(20 - shared(originList('rush')!, tweak) <= MAX_FROM_ORIGIN);
  assert.equal(listProfile(rush).units, BLUEPRINTS.rush.list.units);
  assert.equal(classify(Array(20).fill('scout')), null, 'far from everything: 未分類');
}
// the deck book: bad lists are dropped, trials go to their share of games, only today's builds are kept
{
  const id = 'raid_aggro_ram';
  const ram = originList(id)!;
  const tweak = oneSwaps(id, ram)[0];
  assert.ok(tweak, 'a one-card change that passes');
  const book = cleanBook({ version: 3, at: 1, decks: {
    [id]: { v: 2, cards: ram, trial: { v: 3, cards: tweak, share: 0.5 } },
    titan_control_cage: { v: 2, cards: Array(20).fill('scout') },
    rush: { v: 2, cards: originList('rush')! },
    nope: { v: 2, cards: ram },
  } });
  assert.deepEqual(Object.keys(book.decks), [id], 'only lists that pass their 設計図, and only the roster\'s builds');
  let trial = 0;
  for (let i = 0; i < 1000; i++) if (listFor(book, id, `g${i}`, ram).v === 3) trial++;
  assert.ok(trial > 430 && trial < 570, `trial share ${trial}/1000`);
  assert.equal(listFor(book, 'titan_control_cage', 'x', originList('titan_control_cage')!).v, 1, 'a missing entry: the built-in list');
  assert.equal(listFor(book, id, 'g1', ram).v, listFor(book, id, 'g1', ram).v, 'the same game always gets the same list');
  assert.deepEqual(cleanBook('junk'), { version: 0, at: 0, decks: {} });
}
// 型: the named cards stay, and a list never drifts onto a sibling build
{
  for (const d of ROSTER_DECKS) assert.deepEqual(checkList(d.id, d.cards), [], `${d.id}: its own first list passes`);
  assert.deepEqual(signatureOf('raid_tempo_raider_guard'), { e_raider: 2, e_guard: 2 });
  const g = originList('raid_tempo_guard')!.slice();
  g[g.indexOf('e_guard')] = 'e_shot';
  assert.ok(checkList('raid_tempo_guard', g).some((x) => x.startsWith('型の')), 'without 時計塔の守衛 it is not the 守衛型');
  // 籠城 バーン（祈り型） with ミレア's cards in place of its own 2 different cards is the ミレア型
  const pray = originList('siege_burn_pray')!, mirea = originList('siege_burn_mirea')!;
  assert.equal(tooNear('siege_burn_pray', mirea), 'siege_burn_mirea');
  for (const x of oneSwaps('siege_burn_pray', pray)) assert.equal(tooNear('siege_burn_pray', x), null);
  for (const x of ROSTER_DECKS) for (const c of oneSwaps(x.id, x.cards).slice(0, 8)) assert.deepEqual(checkList(x.id, c), []);
}

// the server side
const mem = new Map<string, unknown>();
const kv: KV = {
  get: async (k) => structuredClone(mem.get(k)) as never, put: async (k, v) => { mem.set(k, structuredClone(v)); },
  list: async (p) => [...mem.entries()].filter(([k]) => k.startsWith(p)).map(([, v]) => structuredClone(v)) as never,
};
let now = Date.UTC(2026, 9, 9, 3);
const env = new EnvStats(kv, () => now, 'secret');
const rv = ROSTER.find((r) => r.lv === 1 && !r.deck.startsWith('g_'))!;
const myRush = originList('rush')!;
const ok = await env.rated({ id: 'device-0000000001', deck: myRush, score: 1, rival: rivalId(rv), rivalLv: rv.lv, rivalDeck: rv.deck, rivalDeckV: 1, rating: 1000 });
assert.ok(ok);
assert.equal(await env.rated({ id: 'device-0000000001', deck: myRush, score: 1, rival: rivalId(rv), rivalLv: 9, rivalDeck: rv.deck, rating: 1000 }), false, 'a wrong Lv is skipped');
assert.equal(await env.rated({ id: 'device-0000000001', deck: myRush, score: 1, rival: 'rv:だれ', rivalLv: 1, rivalDeck: rv.deck, rating: 1000 }), false, 'an unknown rival is skipped');
assert.equal(await env.rated({ id: 'device-0000000001', deck: myRush, score: 1, rival: rivalId(rv), rivalLv: rv.lv, rivalDeck: 'verna', rating: 1000 }), false, 'a deck the rival does not use is skipped');
await env.rated({ id: 'device-0000000002', deck: myRush, score: 0, rival: rivalId(rv), rivalLv: rv.lv, rivalDeck: rv.deck, rivalDeckV: 1, rating: 1010 });
now += 86_400_000;
await env.rated({ id: 'device-0000000001', deck: myRush, score: 0.5, rival: rivalId(rv), rivalLv: rv.lv, rivalDeck: rv.deck, rivalDeckV: 2, rating: 1000 });
const week = (await env.env({})).body as { days: [string, string]; bands: Record<string, Record<string, { games: number; players: number; score: number; expected: number }>>; rivals: Record<string, { games: number }> };
assert.deepEqual(week.days, [jstDay(now - 6 * 86_400_000), jstDay(now)]);
const cell = week.bands.novice.second_aggro_pendulum;
assert.equal(cell.games, 3);
assert.equal(cell.players, 2, 'players are counted once');
assert.equal(cell.score, 1.5);
assert.ok(cell.expected > 0.5 * 3 && cell.expected < 3, 'a 1000 player against a lower-rated Lv1 rival is expected to win more than half');
assert.equal(week.rivals[`${rv.deck}@1`].games, 2);
assert.equal(week.rivals[`${rv.deck}@2`].games, 1, 'each version of a rival list is kept apart');
const today = (await env.env({ days: 1 })).body as typeof week;
assert.equal(today.bands.novice.second_aggro_pendulum.games, 1);
assert.equal((await env.lists({ token: 'nope' })).status, 403);
const lists = (await env.lists({ token: 'secret', min: 1 })).body as { lists: { g: number; arche: string; players: number }[] };
assert.equal(lists.lists[0].g, 3);
assert.equal(lists.lists[0].arche, 'second_aggro_pendulum');
assert.equal(lists.lists[0].players, 2);
// the deck book: admin only, checked, versions go up, the previous one is kept
assert.deepEqual((await env.book()).body, { version: 0, at: 0, decks: {} });
const good: DeckBook = { version: 1, at: 0, decks: { raid_aggro_ram: { v: 2, cards: originList('raid_aggro_ram')! } } };
assert.equal((await env.publish({ token: 'nope', book: good })).status, 403);
assert.equal((await env.publish({ token: 'secret', book: { version: 1, at: 0, decks: { raid_aggro_ram: { v: 2, cards: Array(20).fill('scout') } } } })).status, 400, 'a list off its 設計図 is refused');
assert.equal((await env.publish({ token: 'secret', book: { version: 1, at: 0, decks: { rush: { v: 2, cards: myRush } } } })).status, 400, 'an older archetype is refused');
assert.equal((await env.publish({ token: 'secret', book: good })).status, 200);
assert.equal((await env.publish({ token: 'secret', book: good })).status, 409, 'the version must go up');
assert.equal(((await env.book()).body as DeckBook).version, 1);
assert.ok(mem.has('book:prev'));
// 環境Tier for the wiki: every type listed, marks only with enough games, arrows against the day before, admin-only publish
{
  assert.equal(DECK_TYPES.length, 15);
  assert.equal(deckType('tempo_haste'), '急襲 テンポ', 'old ids count for their type');
  assert.equal(deckType('rush'), '秒針 アグロ', 'the starter decks count for a type');
  assert.equal(deckType('g_maze'), null);
  const tab = (s: number, g = 100) => ({ games: g, players: 4, score: s, expected: g / 2 });
  const day1 = computeTier({ days: ['20261001', '20261007'], bands: { sei: { raid_tempo_haste: tab(72), lancer_beat_scribe: tab(28), other: tab(90) } }, rivals: { 'verna_loop_guard@2': tab(30), 'raid_aggro_arrow@1': tab(70), 'rush_haste@1': tab(4.5, 9) }, friends: { 'rush|verna': [10, 6] } }, '2026-10-07');
  assert.equal(day1.rows.length, 15);
  const row = (t: string, s = day1) => s.rows.find((r) => r.type === t)!;
  assert.equal(row('急襲 テンポ').tier, 'S');
  assert.equal(row('ヴェルナ ループ').tier, 'C');
  assert.equal(row('秒針 アグロ').tier, null, 'under 20 games: 集計中');
  assert.deepEqual(row('秒針 アグロ').all, [19, 10.5, 9.5], 'the old rival id and the online game both count');
  assert.equal(row('急襲 テンポ').builds.raid_tempo_haste[0], 100);
  assert.equal(day1.rows[0].type, '急襲 テンポ', 'strongest first');
  // the rivals fall short of their expectation on the whole: a rival deck is compared with the other rival decks
  const lowAi = computeTier({ days: ['20261001', '20261007'], bands: {}, rivals: { 'raid_tempo_guard@1': tab(42), 'siege_burn_pray@1': tab(28) }, friends: {} }, '2026-10-07');
  assert.equal(lowAi.rows.find((r) => r.type === '急襲 テンポ')!.tier, 'S', 'the better rival deck is marked up');
  assert.ok(lowAi.rows.find((r) => r.type === '籠城 バーン')!.perf < 0);
  assert.equal(row('急襲 テンポ').was, undefined);
  const day2 = computeTier({ days: ['20261002', '20261008'], bands: { go: { raid_tempo_haste: tab(50) } }, rivals: {}, friends: {} }, '2026-10-08', day1);
  assert.equal(row('急襲 テンポ', day2).was, 'S');
  assert.equal(row('急襲 テンポ', day2).tier, 'B', 'the only deck of a rank wins as often as the rank: no strength from that');
  // the upper ranks' choice counts: a deck nearly all of 刻聖 and up play is marked up even with nothing to compare it with
  const day3 = computeTier({ days: ['20261002', '20261008'], bands: { shin: { raid_tempo_haste: tab(45, 90), siege_burn_pray: tab(5, 10) } }, rivals: {}, friends: {} }, '2026-10-08');
  assert.equal(row('急襲 テンポ', day3).use, 90);
  assert.equal(row('急襲 テンポ', day3).tier, 'S');
  // people are compared by win rate within their rank, not by their rating's expectation
  const day4 = computeTier({ days: ['20261002', '20261008'], bands: { go: { raid_tempo_haste: { games: 50, players: 3, score: 35, expected: 45 }, siege_burn_pray: { games: 50, players: 3, score: 15, expected: 10 } } }, rivals: {}, friends: {} }, '2026-10-08');
  assert.ok(row('急襲 テンポ', day4).perf > 0 && row('籠城 バーン', day4).perf < 0);
  assert.ok(cleanTier(JSON.parse(JSON.stringify(day2))));
  // card adoption: rated and online decks only
  const ad = cardAdoption({ v: '1', updated: 0, games: { rated: [80, 40], online: [20, 10], 'free-easy': [500, 400] }, cards: { bolt: { rated: [60, 30, 50, 25], online: [10, 5, 9, 4], 'free-easy': [500, 400, 400, 300] } } });
  assert.deepEqual(ad.bolt, [70, 100]);
  assert.ok(cleanTier({ ...day2, cards: ad }));
  assert.equal(cleanTier({ ...day2, cards: { bolt: [1] } }), null);
  assert.equal(cleanTier({ ...day2, rows: [{ ...day2.rows[0], type: 'たっくん' }] }), null, 'only deck types');
  assert.ok(!JSON.stringify(day2).includes('rv:'), 'nothing about the rivals but their decks');
  assert.deepEqual((await env.wiki()).body, { tier: null, prev: null });
  assert.equal((await env.publishWiki({ token: 'nope', tier: day1 })).status, 403);
  assert.equal((await env.publishWiki({ token: 'secret', tier: { v: 1 } })).status, 400);
  assert.equal((await env.publishWiki({ token: 'secret', tier: day1 })).status, 200);
  assert.equal((await env.publishWiki({ token: 'secret', tier: day1 })).status, 200, 'the same day again replaces it');
  assert.equal(((await env.wiki()).body as { prev: unknown }).prev, null);
  assert.equal((await env.publishWiki({ token: 'secret', tier: day2 })).status, 200);
  const w = (await env.wiki()).body as { tier: { date: string }; prev: { date: string } };
  assert.equal(w.tier.date, '2026-10-08'); assert.equal(w.prev.date, '2026-10-07');
  assert.equal((await env.publishWiki({ token: 'secret', tier: day1 })).status, 409, 'an older day is refused');
}
// a rated report reaches the 環境 through /api/match; older clients without the fields still count for the cards
const ps = new PlayStats(kv, () => now);
const rep = { gid: 'g-rated-1', id: 'device-0000000003', v: '0.15.0', mode: 'rated' as const, ai: 'easy' as const, deck: myRush, played: ['scout'], score: 1 as const, reason: 'ko', actions: 12, ms: 60000 };
const r1 = await ps.record({ ...rep, rival: rivalId(rv), rivalLv: rv.lv, rivalDeck: rv.deck, rivalDeckV: 1, rating: 1000 });
assert.equal((r1.body as { env: boolean }).env, true);
const r2 = await ps.record({ ...rep, gid: 'g-rated-2' });
assert.equal((r2.body as { ok: boolean; env: boolean }).ok, true);
assert.equal((r2.body as { env: boolean }).env, false);
// 毎日の改良: every candidate keeps the core, passes the 設計図 and changes 1–2 cards
{
  const rush = originList('rush')!;
  assert.ok(!flexCards('rush', rush).includes('bolt') || rush.filter((c) => c === 'bolt').length > 2, 'core cards are not flex');
  const ones = oneSwaps('rush', rush);
  assert.ok(ones.length > 10, `${ones.length} one-card swaps`);
  const cs = candidates('rush', rush, 20, 7);
  assert.ok(cs.length > 0 && cs.length <= 20);
  for (const c of cs) {
    assert.deepEqual(checkList('rush', c), []);
    const d = 20 - shared(rush, c);
    assert.ok(d >= 1 && d <= 2, `changes ${d} cards`);
  }
  assert.deepEqual(candidates('rush', rush, 20, 7), cs, 'the same day gives the same candidates');
  // a paired run of a list against itself shows no difference
  const p = paired(rush, rush, [{ id: 'titan', cards: originList('titan')!, w: 1 }], 6, 3, 'normal');
  assert.equal(p.diff, 0);
  assert.equal(bookKey('rush', 9), 'rush');
  assert.equal(archeOf(bookKey('rush', 3)), 'rush');
  // decks renamed in 0.22.x: an old id (and an old book key) means the new deck
  assert.equal(archeOf('rush_haste~lo'), 'second_aggro_pendulum');
  assert.equal(bookKey('tempo_guard', 9), 'raid_tempo_guard');
  assert.equal(Object.keys(cleanBook({ version: 1, decks: { 'rush_haste~lo': { v: 1, cards: originList('second_aggro_pendulum')! } } }).decks)[0], 'second_aggro_pendulum~lo');
}
// 発見: a new deck needs 15 players, 100 games and 3 days; a 型 8 players and 50 games
{
  const nd = ['e_tuner', 'e_tuner', 'e_blade', 'e_blade', 'e_guard', 'e_guard', 'warden', 'warden', 'e_shot', 'e_shot', 'e_pray', 'e_pray', 'e_draw', 'e_draw', 'e_storm', 'scribe', 'scribe', 'e_colossus', 'e_colossus', 'insight'];
  assert.equal(classify(nd), null);
  const row = (players: number, g: number, first = '20261001', last = '20261005'): ListRow => ({ cards: nd, g, s: g / 2, e: g / 2, first, last, arche: null, players });
  assert.equal(findNewDecks([row(20, 150)]).length, 1);
  assert.equal(findNewDecks([row(10, 150)]).length, 0, 'too few players');
  assert.equal(findNewDecks([row(20, 50)]).length, 0, 'too few games');
  assert.equal(findNewDecks([row(20, 150, '20261005', '20261006')]).length, 0, 'too new');
  const d = findNewDecks([row(20, 150)])[0];
  assert.equal(d.core.e_tuner, 2);
  const rush = originList('rush')!;
  const v = rush.slice(); v[v.indexOf('pendulum')] = 'e_page'; v[v.indexOf('pendulum')] = 'e_page'; v[v.indexOf('delayer')] = 'e_raider';
  const vr: ListRow = { cards: v, g: 60, s: 30, e: 30, first: '20261001', last: '20261003', arche: 'rush', players: 9 };
  assert.equal(findVariants([vr]).length, 1);
  assert.equal(findVariants([{ ...vr, players: 5 }]).length, 0);
  const close = rush.slice(); close[close.indexOf('pendulum')] = 'e_page';
  assert.equal(findVariants([{ ...vr, cards: close }]).length, 0, 'one card away is the same list, not a 型');
}
console.log('all env tests passed');
