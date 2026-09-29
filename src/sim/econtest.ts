/* Pack and reward checks: `npm run test:econ` */
import assert from 'node:assert/strict';
import { CARD_LIST, setOf } from '../core/cards';
import { mulberry32 } from '../core/engine';
import { NEW_WALLET, PACKS, PITY, applyReward, canOpen, missingCards, openPack, ownedCount, reward, setProgress } from '../meta/economy';

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
assert.equal(r1.total, 140, 'win + daily bonus');
applyReward(w, r1, today);
assert.equal(reward(w, { mode: 'ai', level: 'normal', winner: 0, reason: 'ko', myActions: 12, today }).total, 40, 'bonus once a day');
assert.equal(reward(w, { mode: 'online', level: 'normal', winner: 1, reason: 'surrender', myActions: 12, today }).total, 0, 'surrendering pays nothing');
assert.equal(reward(w, { mode: 'online', level: 'normal', winner: 0, reason: 'surrender', myActions: 2, today: '2026-10-01' }).total, 0, 'instant wins pay nothing');
assert.equal(reward(w, { mode: 'ai', level: 'hard', winner: 1, reason: 'ko', myActions: 9, today }).total, 20);

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
  for (const p of o.pulls) { counts[p.rarity]++; if (p.dupeCoins) dupes++; }
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
console.log(`dupes turned into coins: ${dupes}`);
console.log('all economy tests passed');
