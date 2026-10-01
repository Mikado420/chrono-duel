/* 転移 and 鐘鳴: `npm run test:keywords` (test-only cards, never in the game) */
import assert from 'node:assert/strict';
import { CARDS } from '../core/cards';
import { apply, createGame, legalActions, type GameState } from '../core/engine';
import { sameAction } from '../core/net';
import { chooseAction } from '../core/ai';

CARDS.t_shift = { id: 't_shift', name: '試験用・転移', kind: 'unit', rarity: 'C', cost: 2, atk: 2, hp: 3, reload: 2, keywords: ['shift'], text: '転移', flavor: '', motif: 'gear' };
CARDS.t_bellshot = { id: 't_bellshot', name: '試験用・鐘鳴', kind: 'unit', rarity: 'R', cost: 3, atk: 2, hp: 3, reload: 2, bell: 'shot2', text: '鐘鳴：2ダメージ', flavor: '', motif: 'bell' };
CARDS.t_bellready = { id: 't_bellready', name: '試験用・鐘鳴準備', kind: 'unit', rarity: 'R', cost: 3, atk: 2, hp: 3, reload: 9, bell: 'ready', text: '鐘鳴：準備', flavor: '', motif: 'bell' };

const game = (): GameState => {
  const { state } = createGame([Array(20).fill('pendulum'), Array(20).fill('pendulum')], 3, 0);
  state.players[0].time = 0; state.players[1].time = 5;
  return state;
};
const give = (s: GameState, card: string) => { const uid = s.nextUid++; s.players[0].hand.push({ uid, card }); return uid; };

// 転移: summon in the middle, it may move left or right for 1 tick, keeping its readiness
{
  const s = game();
  apply(s, { t: 'play', hand: give(s, 't_shift'), lane: 1 });
  const u = s.players[0].field[1]!;
  assert.equal(u.shift, true);
  const moves = legalActions(s, 0).filter((a) => a.t === 'move');
  assert.deepEqual(moves.map((a) => (a as { to: number }).to).sort(), [0, 2], 'both neighbours are free');
  const ready = u.readyAt, t0 = s.players[0].time;
  const ev = apply(s, { t: 'move', lane: 1, to: 2 });
  assert.ok(ev.some((e) => e.e === 'move'));
  assert.equal(s.players[0].field[2], u); assert.equal(s.players[0].field[1], null);
  assert.equal(s.players[0].time, t0 + 1, 'costs 1 tick');
  assert.equal(u.readyAt, ready, 'readiness unchanged');
  assert.throws(() => apply(s, { t: 'move', lane: 2, to: 0 }), 'only next to it');
  s.players[0].field[1] = { uid: 999, card: 'gear', atk: 3, hp: 3, maxHp: 3, reload: 2, readyAt: 0, taunt: false, pierce: false };
  assert.equal(legalActions(s, 0).filter((a) => a.t === 'move').length, 0, 'blocked by a neighbour');
  assert.ok(!legalActions(s, 0).some((a) => a.t === 'move' && a.lane === 1), 'a unit without 転移 never moves');
}
// online: a move is told apart by its destination
assert.equal(sameAction({ t: 'move', lane: 1, to: 0 }, { t: 'move', lane: 1, to: 2 }), false);
assert.equal(sameAction({ t: 'move', lane: 1, to: 2 }, { t: 'move', lane: 1, to: 2 }), true);

// 鐘鳴: passing the 8 bell fires each bell unit once (and 鐘楼の歩哨 still grows)
{
  const s = game();
  s.players[0].time = 6; s.players[1].time = 12;
  s.players[0].field[0] = { uid: 500, card: 't_bellshot', atk: 2, hp: 3, maxHp: 3, reload: 2, readyAt: 0, taunt: false, pierce: false };
  s.players[0].field[1] = { uid: 501, card: 'sentinel', atk: 2, hp: 5, maxHp: 5, reload: 2, readyAt: 0, taunt: false, pierce: false };
  s.players[0].field[2] = { uid: 502, card: 't_bellready', atk: 2, hp: 3, maxHp: 3, reload: 9, readyAt: 30, taunt: false, pierce: false };
  s.players[1].field[1] = { uid: 600, card: 'heavy', atk: 5, hp: 5, maxHp: 5, reload: 3, readyAt: 0, taunt: false, pierce: false };
  apply(s, { t: 'draw' });
  assert.equal(s.players[0].time, 8);
  assert.equal(s.players[1].field[1]!.hp, 3, 'the strongest enemy took 2');
  assert.equal(s.players[0].field[1]!.atk, 3, '鐘楼の歩哨 grew');
  assert.equal(s.players[0].field[2]!.readyAt, 8, 'became ready');
  apply(s, { t: 'wait' });
  assert.equal(s.players[1].field[1]!.hp, 3, 'no bell, nothing more');
}
// the AI can use 転移 without errors
{
  const s = game();
  apply(s, { t: 'play', hand: give(s, 't_shift'), lane: 0 });
  for (let i = 0; i < 30 && !s.over; i++) { const pi = s.players[0].time <= s.players[1].time ? 0 : 1; apply(s, chooseAction(s, pi as 0 | 1, 'hard')); }
}
console.log('keywords ok');
