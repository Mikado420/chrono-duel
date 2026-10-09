/* Pack and reward checks: `npm run test:econ` */
import assert from 'node:assert/strict';
import { CARD_LIST, setOf } from '../core/cards';
import { mulberry32 } from '../core/engine';
import { CRAFT_COST, DAILY_BONUS, DAILY_MATCH_CAP, DEFAULT_LOOK, DUPE_SHARDS, LOOKS, MATCH_REWARD, NEW_WALLET, PACKS, PITY, applyReward, buyLook, canOpen, craft, craftBlock, lookBlock, lookById, missingCards, openPack, ownedCount, ownsLook, reward, setProgress , THEMES, buyTheme, themeOffer} from '../meta/economy';

const rand = mulberry32(99);
const pack = PACKS[0];

// welcome tickets, then coins
const w = NEW_WALLET();
assert.equal(canOpen(w, pack), 'ticket');
for (let i = 0; i < 3; i++) openPack(w, pack, rand);
assert.equal(w.tickets, 0);
assert.equal(canOpen(w, pack), null, 'no coins, no pack');
assert.throws(() => openPack(w, pack, rand));

// rewards
const today = '2026-09-30';
const r1 = reward(w, { mode: 'ai', level: 'normal', winner: 0, reason: 'ko', myActions: 12, today });
const WIN = MATCH_REWARD['ai-normal'][0];
assert.equal(r1.total, WIN + DAILY_BONUS, 'win + daily bonus');
applyReward(w, r1, today);
assert.equal(reward(w, { mode: 'ai', level: 'normal', winner: 0, reason: 'ko', myActions: 12, today }).total, WIN, 'bonus once a day');
assert.equal(reward(w, { mode: 'online', level: 'normal', winner: 1, reason: 'surrender', myActions: 12, today }).total, 0, 'surrendering pays nothing');
assert.equal(reward(w, { mode: 'online', level: 'normal', winner: 0, reason: 'surrender', myActions: 2, today: '2026-10-01' }).total, 0, 'instant wins pay nothing');
assert.equal(reward(w, { mode: 'ai', level: 'hard', winner: 1, reason: 'ko', myActions: 9, today }).total, MATCH_REWARD['ai-hard'][1]);

// daily cap on match coins (the first-win bonus is on top)
const cw = NEW_WALLET();
let earned = 0;
for (let i = 0; i < 40; i++) { const r = reward(cw, { mode: 'ai', level: 'hard', winner: 0, reason: 'ko', myActions: 12, today }); applyReward(cw, r, today); earned += r.total; }
assert.equal(earned, DAILY_MATCH_CAP + DAILY_BONUS, 'match coins stop at the daily cap');
const capped = reward(cw, { mode: 'ai', level: 'hard', winner: 0, reason: 'ko', myActions: 12, today });
assert.ok(capped.capped && capped.total === 0, 'capped result says so');
assert.ok(reward(cw, { mode: 'ai', level: 'hard', winner: 0, reason: 'ko', myActions: 12, today: '2026-10-02' }).total > 0, 'cap resets the next day');

// odds over many packs
const big = NEW_WALLET();
big.coins = 1e9;
const counts: Record<string, number> = { C: 0, R: 0, E: 0, L: 0 };
let longest = 0, since = 0, dupes = 0;
const N = 20000;
for (let i = 0; i < N; i++) {
  const o = openPack(big, pack, rand);
  assert.equal(o.pulls.length, pack.size);
  assert.ok(o.pulls.every((p) => setOf(CARD_LIST.find((c) => c.id === p.card)!) === 'echo'), 'only cards of the set');
  assert.ok(o.pulls.filter((p) => p.rarity === 'C').length === 3 && o.pulls.filter((p) => p.rarity !== 'C').length === 2, '3 common + 2 better');
  for (const p of o.pulls) { counts[p.rarity]++; if (p.dupeShards) dupes++; }
  if (o.pulls.some((p) => p.rarity === 'L')) since = 0; else longest = Math.max(longest, ++since);
}
assert.ok(longest < PITY, `pity holds (${longest})`);
const lRate = counts.L / N;
console.log(`per pack: E ${(counts.E / N).toFixed(3)}  L ${lRate.toFixed(3)} (with pity)  longest dry run ${longest}`);
assert.ok(lRate > 0.07 && lRate < 0.12);

// collecting a full set
const col = NEW_WALLET(); col.coins = 1e9;
let packs = 0;
while (setProgress(col, 'echo').have < setProgress(col, 'echo').total && packs < 1000) { openPack(col, pack, rand); packs++; }
console.log(`full set of ${setProgress(col, 'echo').total} cards after ${packs} packs; first legend guaranteed within ${PITY}`);
assert.ok(missingCards(col, ['e_verna', 'e_verna']).length === 1, 'legend: one copy only');
assert.equal(ownedCount(NEW_WALLET(), 'titan'), 1, 'base cards are always owned');
assert.equal(ownedCount(NEW_WALLET(), 'e_sprite'), 0);
console.log(`dupes turned into shards: ${dupes}`);

// packs can never pay for themselves: even with a full collection, duplicates are worth far less than a pack
const full = NEW_WALLET(); full.coins = 1e9; full.tickets = 0;
for (const c of CARD_LIST.filter((c) => setOf(c) === 'echo')) full.owned[c.id] = 2;
let shards = 0;
for (let i = 0; i < 2000; i++) { const before = full.shards; openPack(full, pack, rand); shards += full.shards - before; }
const perPack = shards / 2000;
console.log(`shards per pack with a full collection: ${perPack.toFixed(1)} (pack ${pack.price} coins, a common costs ${CRAFT_COST.C})`);
assert.equal(full.coins, 1e9 - 2000 * pack.price, 'duplicates never refund coins');
assert.ok(perPack < CRAFT_COST.E / 2, 'a pack of duplicates is worth well under half a 秘宝');

// crafting
const cf = NEW_WALLET();
assert.equal(craftBlock(cf, 'titan'), 'このカードは最初から持っています');
assert.ok(craftBlock(cf, 'e_verna')?.includes('欠片'), 'not enough shards');
cf.shards = CRAFT_COST.L + CRAFT_COST.C;
assert.ok(craft(cf, 'e_verna'));
assert.equal(cf.owned.e_verna, 1);
assert.equal(craftBlock(cf, 'e_verna'), '上限枚数まで持っています', 'legend: one copy');
assert.ok(craft(cf, 'e_sprite'));
assert.equal(cf.shards, 0);
assert.ok(!craft(cf, 'e_sprite'), 'no shards left');
assert.ok(Object.values(DUPE_SHARDS).every((v, i) => v * 4 <= Object.values(CRAFT_COST)[i]), 'crafting costs at least 4 duplicates');
// looks: bought with coins, the defaults are free and always owned
{
  const w = NEW_WALLET();
  assert.ok(ownsLook(w, DEFAULT_LOOK.back) && ownsLook(w, DEFAULT_LOOK.dial));
  assert.ok(!ownsLook(w, 'back:gear'));
  assert.ok(lookBlock(w, 'back:gear'), 'no coins, no purchase');
  assert.equal(buyLook(w, 'back:gear'), false);
  w.coins = 1000;
  assert.equal(buyLook(w, 'back:gear'), true);
  assert.equal(w.coins, 1000 - lookById('back:gear')!.price);
  assert.ok(ownsLook(w, 'back:gear'));
  assert.equal(buyLook(w, 'back:gear'), false, 'only once');
  assert.ok(LOOKS.every((l) => l.price >= 0 && (l.kind === 'back' || l.kind === 'dial' || l.kind === 'mat')));
  // every kind has a free default, and every theme has one of each kind
  for (const k of ['back', 'dial', 'mat'] as const) assert.equal(lookById(DEFAULT_LOOK[k])?.price, 0);
  assert.equal(THEMES.length, 8);
  for (const t of THEMES) assert.deepEqual(LOOKS.filter((l) => l.theme === t.id).map((l) => l.kind).sort(), ['back', 'dial', 'mat']);
  assert.equal(new Set(LOOKS.map((l) => l.id)).size, LOOKS.length, 'ids are unique');
  // theme sets: cheaper together, only what is missing, only with enough coins
  const t = NEW_WALLET();
  const all = themeOffer(t, 'forge');
  assert.equal(all.ids.length, 3);
  assert.ok(all.price < all.full);
  t.coins = all.price - 1;
  assert.equal(buyTheme(t, 'forge'), false);
  t.coins = 5000;
  assert.ok(buyLook(t, 'back:forge'));
  const rest = themeOffer(t, 'forge');
  assert.deepEqual(rest.ids.sort(), ['dial:forge', 'mat:forge']);
  const before = t.coins;
  assert.ok(buyTheme(t, 'forge'));
  assert.equal(t.coins, before - rest.price);
  assert.ok(ownsLook(t, 'dial:forge') && ownsLook(t, 'mat:forge'));
  assert.equal(themeOffer(t, 'forge').ids.length, 0);
  assert.equal(buyTheme(t, 'forge'), false, 'nothing left to buy');
  assert.equal(themeOffer(t, 'astro').ids.length, 3);
  t.looks.push('back:astro', 'dial:astro');
  const one = themeOffer(t, 'astro');
  assert.equal(one.price, one.full, 'no discount for a single part');
}
console.log('all economy tests passed');
