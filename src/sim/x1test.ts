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
// 囮の書: reservation only; broken by the opponent → their clock +4; fires → its owner draws a card
{
  const s = fresh(); turn(s, 0);
  const uid = give(s, 0, 'x_decoy');
  const acts = legalActions(s, 0).filter((a) => 'hand' in a && a.hand === uid);
  assert.ok(acts.length > 0 && acts.every((a) => a.t === 'reserve'), 'only reservations');
  assert.throws(() => apply(s, { t: 'cast', hand: uid }));
  apply(s, { t: 'reserve', hand: uid, T: 12 });
  // the opponent breaks it with 破約の刃
  s.players[1].time = 0;
  const br = give(s, 1, 'e_break');
  const before = s.players[1].time;
  const ev = apply(s, { t: 'cast', hand: br });
  assert.ok(ev.some((e) => e.e === 'breakResv' && e.card === 'x_decoy'));
  assert.equal(s.players[1].time, before + cardDef('e_break').cost + 4, 'the breaker pays 4 more ticks');
}
{
  const s = fresh(); turn(s, 0);
  const uid = give(s, 0, 'x_decoy');
  apply(s, { t: 'reserve', hand: uid, T: 5 });
  const n = s.players[0].hand.length;
  // let the world clock pass 5: both sides wait
  for (let k = 0; k < 40 && s.players[0].resv.length; k++) { const a = actor(s); if (a === -1) break; apply(s, s.pending ? { t: 'choose', i: 0 } : { t: 'wait' }); }
  assert.equal(s.players[0].resv.length, 0, 'it fired');
  assert.ok(s.players[0].hand.length >= n + 1, 'and its owner drew');
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
// 時の簒奪者: takes the opponent's earliest reservation and fires it a tick sooner
{
  const s = fresh(); turn(s, 0);
  s.players[1].resv = [{ uid: 900, card: 'bolt', T: 15, revealed: false }];
  const uid = give(s, 0, 'x_usurper');
  apply(s, { t: 'play', hand: uid, lane: 2 });
  assert.equal(s.players[1].resv.length, 0);
  assert.equal(s.players[0].resv[0].card, 'bolt');
  assert.equal(s.players[0].resv[0].T, 14);
}
console.log('set1x ok');
