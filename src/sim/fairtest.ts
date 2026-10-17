/**
 * 公平さのテスト: `npx tsx src/sim/fairtest.ts [games]`. A rival (Lv8–12) must choose exactly the same move whatever
 * it cannot see: the order of its own deck, the cards in the player's hand and deck, and the spells inside the
 * player's hidden reservations. Positions come from real games between rivals; each one is replayed with the hidden
 * cards shuffled or swapped for others, with the same random numbers, and the move must not change.
 */
import assert from 'node:assert/strict';
import { CARD_LIST } from '../core/cards';
import { actor, apply, clone, createGame, mulberry32, type GameState, type PlayerIndex } from '../core/engine';
import { LV, chooseRival, newMind, quirksOf, type RivalCfg } from '../core/rival';
import { ROSTER_DECKS } from './rosterDecks';

const games = +(process.argv[2] ?? 6);
for (const lv of [11, 12]) LV[lv] = { ...LV[lv], timeMs: undefined }; // a time limit would make two runs differ
const pool = CARD_LIST.filter((c) => !c.token).map((c) => c.id);
/** The same position with everything `pi` cannot see changed. */
function scramble(s: GameState, pi: PlayerIndex, r: () => number): GameState {
  const c = clone(s);
  const me = c.players[pi], op = c.players[1 - pi];
  for (let i = me.deck.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [me.deck[i], me.deck[j]] = [me.deck[j], me.deck[i]]; }
  op.hand = op.hand.map((h) => ({ uid: h.uid, card: pool[Math.floor(r() * pool.length)] }));
  op.deck = op.deck.map(() => pool[Math.floor(r() * pool.length)]);
  op.resv = op.resv.map((x) => (x.revealed || x.echo ? x : { ...x, card: pool.filter((p) => CARD_LIST.find((q) => q.id === p)!.kind === 'spell')[Math.floor(r() * 10)] }));
  return c;
}
let checked = 0;
for (let g = 0; g < games; g++) {
  const lv = [8, 9, 10, 11, 12][g % 5];
  const r = mulberry32(1000 + g);
  const da = ROSTER_DECKS[Math.floor(r() * ROSTER_DECKS.length)], db = ROSTER_DECKS[Math.floor(r() * ROSTER_DECKS.length)];
  const { state } = createGame([da.cards, db.cards], 77 + g, (g % 2) as PlayerIndex);
  const cfg = (n: string, d: string): RivalCfg => ({ name: n, lv, persona: 'steady', deck: d, quirks: quirksOf(n) });
  const cfgs = [cfg('a', da.id), cfg('b', db.id)];
  const minds = [newMind(r), newMind(r)];
  for (let k = 0; !state.over && k < 60; k++) {
    const pi = actor(state) as PlayerIndex;
    if (pi < 0) break;
    const seed = Math.floor(r() * 2 ** 32);
    const mind0 = structuredClone(minds[pi]);
    const m = chooseRival(state, pi, cfgs[pi], minds[pi], mulberry32(seed));
    if (k % 4 === 1 && !state.pending) {
      // the same choice with the hidden cards changed (and the same memory of what was seen)
      const m2 = chooseRival(scramble(state, pi, mulberry32(seed ^ 0x5bd1e995)), pi, cfgs[pi], structuredClone(mind0), mulberry32(seed));
      assert.deepEqual(m2.action, m.action, `Lv${lv} game ${g} move ${k}: the move changed with cards it cannot see`);
      checked++;
    }
    if (m.surrender) break;
    apply(state, m.action);
  }
}
console.log(`fair: ${checked} positions at Lv8–12, the move never depended on hidden cards`);
