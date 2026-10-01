/* 第2弾: every card resolves, a few effects checked, then AI games with the test decks. `npm run test:set2` */
import assert from 'node:assert/strict';
import { chooseAction } from '../core/ai';
import { CARDS, cardDef } from '../core/cards';
import { validateDeck } from '../core/decks';
import { actor, apply, createGame, legalActions, mulberry32, type GameState, type PlayerIndex, type Unit } from '../core/engine';
import { SET2, registerSet2 } from '../core/set2';
import { SET2_TEST_DECKS } from './set2Decks';
import { PRESET_DECKS } from '../core/decks';

registerSet2();
const ids = Object.keys(SET2).filter((id) => !SET2[id].token);
assert.equal(ids.length, 48, '48 cards');
const count = (r: string) => ids.filter((id) => SET2[id].rarity === r).length;
assert.deepEqual([count('C'), count('R'), count('E'), count('L')], [20, 16, 8, 4]);
for (const d of SET2_TEST_DECKS) assert.ok(validateDeck(d.cards).ok, `${d.name}: ${validateDeck(d.cards).problems}`);

const unit = (card: string, atk: number, hp: number, extra: Partial<Unit> = {}): Unit => ({ uid: Math.floor(Math.random() * 1e9), card, atk, hp, maxHp: hp, reload: 2, readyAt: 0, taunt: false, pierce: false, ...extra });
const board = (): GameState => {
  const { state } = createGame([Array(20).fill('pendulum'), Array(20).fill('pendulum')], 9, 0);
  state.players[0].time = 0; state.players[1].time = 6;
  state.players[0].field = [unit('gear', 3, 3), null, null];
  state.players[1].field = [unit('heavy', 5, 5), null, unit('scout', 1, 2)];
  state.players[1].resv.push({ uid: 7000, card: 'e_sprite', T: 9, revealed: true, echo: 'ping1' });
  return state;
};
// every card: play it (unit into the middle lane, spell cast) without errors
for (const id of ids) {
  const s = board(), uid = s.nextUid++;
  s.players[0].hand.push({ uid, card: id });
  const d = cardDef(id);
  apply(s, d.kind === 'unit' ? { t: 'play', hand: uid, lane: 1 } : { t: 'cast', hand: uid });
}
// a few effects
{
  const s = board(); const uid = s.nextUid++; s.players[0].hand.push({ uid, card: 'g_hammer' });
  apply(s, { t: 'cast', hand: uid }); assert.equal(s.players[1].field[0]!.hp, 1, '鉄槌 hits the sturdiest for 4');
}
{
  const s = board(); const uid = s.nextUid++; s.players[0].hand.push({ uid, card: 'g_erase' });
  apply(s, { t: 'cast', hand: uid }); assert.equal(s.players[1].resv.filter((r) => r.echo).length, 0, '歯車停止 erases echoes');
}
{
  const s = board(); s.players[0].field[1] = unit('g_detour', 2, 3, { shift: true });
  apply(s, { t: 'move', lane: 1, to: 2 }); assert.equal(s.players[0].field[2]!.atk, 3, '回り道の剣士 grows when it moves');
}
{
  const s = board(); s.players[0].field[2] = unit('g_architect', 3, 5, { shift: true });
  assert.ok(legalActions(s, 0).some((a) => a.t === 'move' && a.lane === 0), '設計者 gives 転移 to the others');
}
{
  const s = board(); s.players[0].time = 14; s.players[1].time = 20;
  s.players[0].field = [unit('g_archer', 2, 3), unit('g_engineer', 3, 4), null];
  const hand = s.players[0].hand.length;
  apply(s, { t: 'draw' });
  assert.equal(s.players[1].field[0]!.hp, 3, 'the archer rings once (2)');
  assert.equal(s.players[0].hand.length, hand + 3, 'draw + bell + 機関士');
}
{
  const s = board(); s.players[1].field[1] = unit('gear', 3, 3);
  const uid = s.nextUid++; s.players[0].hand.push({ uid, card: 'g_rewire' });
  apply(s, { t: 'cast', hand: uid });
  assert.deepEqual(s.players[1].field.map((u) => u?.card ?? null), ['scout', 'heavy', 'gear'], '配線し直し rotates right');
}
// AI games: set 2 decks against each other and the base decks
let games = 0;
const all = [...SET2_TEST_DECKS, ...PRESET_DECKS];
for (const A of SET2_TEST_DECKS) for (const B of all) for (let i = 0; i < 3; i++) {
  const seed = 100 + games;
  const { state } = createGame([A.cards, B.cards], seed, (seed % 2) as PlayerIndex);
  const r = mulberry32(seed);
  for (let g = 0; !state.over && g < 400; g++) { const pi = actor(state); if (pi === -1) break; apply(state, chooseAction(state, pi, 'hard', r)); }
  assert.ok(state.over, 'games end');
  games++;
}
void CARDS;
console.log(`set2 ok (${ids.length} cards, ${games} games)`);
