/* 第1弾 追加カード: `npm run test:set1x` */
import assert from 'node:assert/strict';
import { CARDS, CARD_LIST, cardDef } from '../core/cards';
import { actor, apply, createGame, legalActions, type GameState, type PlayerIndex } from '../core/engine';
import { HIDDEN, viewEvent, viewState } from '../core/net';
import { PRESET_DECKS } from '../core/decks';
import { PACKS } from '../meta/economy';

const fresh = (first: PlayerIndex = 0): GameState => createGame([PRESET_DECKS[0].cards, PRESET_DECKS[2].cards], 11, first).state;
const give = (s: GameState, pi: PlayerIndex, card: string) => { const uid = s.nextUid++; s.players[pi].hand.push({ uid, card }); return uid; };
const turn = (s: GameState, pi: PlayerIndex) => { s.players[pi].time = 0; s.players[1 - pi].time = 10; };

// the 8 cards are in the pool and in the 第1弾 pack
for (const id of ['x_ram', 'x_sentry', 'x_gust', 'x_oblivion', 'x_seer', 'x_decoy', 'x_usurper', 'x_mirea']) {
  assert.ok(CARDS[id] && CARD_LIST.includes(CARDS[id]), id);
  assert.equal(cardDef(id).set, 'echo');
}
assert.equal(CARD_LIST.filter((c) => c.set === 'echo' && !c.token).length, 30, '第1弾 is 30 cards now');
assert.ok(PACKS.some((p) => p.set === 'echo'));

// 忘却の砂: 2 ticks, the opponent throws a card away (their choice), its user draws one (two from a reservation)
{
  const s = fresh(); turn(s, 0);
  assert.equal(cardDef('x_oblivion').cost, 2);
  const uid = give(s, 0, 'x_oblivion');
  const hand0 = s.players[0].hand.length, foe = s.players[1].hand.length;
  apply(s, { t: 'cast', hand: uid });
  assert.equal(s.players[0].time, 2);
  assert.equal(s.players[0].hand.length, hand0 - 1 + 1, 'used one, drew one');
  assert.equal(s.pending?.kind, 'discard');
  assert.equal(s.pending?.pi, 1, 'the opponent chooses');
  assert.equal(actor(s), 1);
  apply(s, { t: 'choose', i: 0 });
  assert.equal(s.players[1].hand.length, foe - 1);
}
// 囮の書: reservation only, 充填 paid on reserving; while it waits it cuts the next hit on its owner's base by 3+X
{
  const s = fresh(); turn(s, 0);
  const uid = give(s, 0, 'x_decoy');
  const acts = legalActions(s, 0).filter((a) => 'hand' in a && a.hand === uid);
  assert.ok(acts.length > 0 && acts.every((a) => a.t === 'reserve'), 'only reservations');
  assert.ok(acts.some((a) => a.t === 'reserve' && a.x === 2), 'charge on reserving');
  assert.throws(() => apply(s, { t: 'cast', hand: uid }));
  apply(s, { t: 'reserve', hand: uid, T: 12, x: 2 });
  assert.equal(s.players[0].time, 3, '1 + X ticks');
  // the opponent never sees the charge or the shield
  const v = viewState(s, 1);
  assert.equal(v.players[1].resv[0].shield, undefined);
  assert.equal(v.players[1].resv[0].card, HIDDEN);
}
{
  const s = fresh(); turn(s, 0);
  const uid = give(s, 0, 'x_decoy');
  apply(s, { t: 'reserve', hand: uid, T: 30, x: 1 });
  // a 5-point bolt from the opponent: 4 are cut, the reservation is used up
  s.players[1].time = 0;
  const hp = s.players[0].hp;
  const b = give(s, 1, 'bolt');
  const ev = apply(s, { t: 'cast', hand: b });
  assert.ok(ev.some((e) => e.e === 'shield' && e.amount === 4));
  assert.equal(s.players[0].hp, hp, '4 (bolt) - 4 = 0');
  assert.equal(s.players[0].resv.length, 0);
  // the next hit lands in full
  const b2 = give(s, 1, 'bolt');
  s.players[1].time = 0;
  apply(s, { t: 'cast', hand: b2 });
  assert.equal(s.players[0].hp, hp - 4);
}
{
  const s = fresh(); turn(s, 0);
  const uid = give(s, 0, 'x_decoy');
  apply(s, { t: 'reserve', hand: uid, T: 5 });
  // coming due unused, it just ends (and counts as a reservation that fired)
  for (let k = 0; k < 40 && s.players[0].resv.length; k++) { const a = actor(s); if (a === -1) break; apply(s, s.pending ? { t: 'choose', i: 0 } : { t: 'wait' }); }
  assert.equal(s.players[0].resv.length, 0, 'it fired');
}
// 星読みの占者 online: the chooser sees the three cards, the opponent sees three hidden ones; the card taken stays hidden
{
  const s = fresh(); turn(s, 0);
  const uid = give(s, 0, 'x_seer');
  apply(s, { t: 'play', hand: uid, lane: 0 });
  assert.equal(s.pending?.kind, 'seer');
  const mine = viewState(s, 0), theirs = viewState(s, 1);
  assert.ok(mine.pending && mine.pending.options.every((o) => o !== HIDDEN));
  assert.ok(theirs.pending && theirs.pending.options.every((o) => o === HIDDEN) && theirs.pending.pi === 1, 'the opponent only knows a choice is being made');
  const ev = apply(s, { t: 'choose', i: 1 });
  const fetch = ev.find((e) => e.e === 'fetch')!;
  assert.ok(fetch);
  assert.notEqual((viewEvent(fetch, 0) as { card: string }).card, HIDDEN);
  assert.equal((viewEvent(fetch, 1) as { card: string }).card, HIDDEN, 'the card taken is secret');
}
// 記憶の司書ミレア: chooses among the spells used this game (public, both sides see them)
{
  const s = fresh(); turn(s, 0);
  s.players[0].used = ['arrow', 'insight', 'stop'];
  const uid = give(s, 0, 'x_mirea');
  s.players[0].time = 0;
  apply(s, { t: 'play', hand: uid, lane: 1 });
  assert.equal(s.pending?.kind, 'recall');
  assert.ok(!s.pending!.options.includes('stop'), 'no legends');
  assert.deepEqual(viewState(s, 1).pending!.options, s.pending!.options);
  assert.deepEqual(viewState(s, 1).players[1].used, ['arrow', 'insight', 'stop']);
}
// 時の簒奪者: shows the opponent's reservations, takes the one its player picks and fires it at once (reserved strength)
{
  const s = fresh(); turn(s, 0);
  s.players[1].resv = [{ uid: 900, card: 'bolt', T: 15, revealed: false }, { uid: 901, card: 'insight', T: 20, revealed: false }, { uid: 902, card: 'e_shot', T: 12, revealed: true, echo: 'shot2' }];
  const uid = give(s, 0, 'x_usurper');
  apply(s, { t: 'play', hand: uid, lane: 2 });
  assert.equal(s.pending?.kind, 'steal');
  assert.deepEqual(s.pending!.options, [900, 901], 'echoes cannot be taken');
  assert.ok(s.players[1].resv.every((r) => r.revealed));
  const hp = s.players[1].hp;
  apply(s, { t: 'choose', i: 0 });
  assert.equal(s.players[1].hp, hp - 5, 'bolt at reserved strength');
  assert.deepEqual(s.players[1].resv.map((r) => r.uid).sort(), [901, 902]);
  assert.equal(s.players[0].resv.length, 0);
}
console.log('set1x ok');
