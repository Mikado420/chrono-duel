/* 0.23.0 のカード調整: `npm run test:v23` */
import assert from 'node:assert/strict';
import { cardDef } from '../core/cards';
import { actor, apply, createGame, type GameState, type PlayerIndex, type Unit } from '../core/engine';
import { PRESET_DECKS } from '../core/decks';
import { chooseChoice } from '../core/ai';

const fresh = (): GameState => createGame([PRESET_DECKS[0].cards, PRESET_DECKS[2].cards], 7, 0).state;
const give = (s: GameState, pi: PlayerIndex, card: string) => { const uid = s.nextUid++; s.players[pi].hand.push({ uid, card }); return uid; };
/** `pi` to act, with its clock at `t` and the other one at `o`. */
const at = (s: GameState, pi: PlayerIndex, t: number, o: number) => { s.players[pi].time = t; s.players[1 - pi].time = o; s.last = (1 - pi) as PlayerIndex; };
const put = (s: GameState, pi: PlayerIndex, lane: number, card: string): Unit => {
  const d = cardDef(card);
  const u: Unit = { uid: s.nextUid++, card, atk: d.atk!, hp: d.hp!, maxHp: d.hp!, reload: d.reload!, readyAt: 0, taunt: !!d.keywords?.includes('taunt'), pierce: !!d.keywords?.includes('pierce') };
  s.players[pi].field[lane] = u;
  return u;
};

// 予見の巫女: reveals every pin and pushes them 3 ticks; one pushed past 40 never fires
{
  const s = fresh(); at(s, 0, 0, 5);
  s.players[1].resv = [{ uid: 900, card: 'bolt', T: 10, revealed: false }, { uid: 901, card: 'bolt', T: 39, revealed: false }, { uid: 902, card: 'e_shot', T: 8, revealed: true, echo: 'shot2' }];
  apply(s, { t: 'play', hand: give(s, 0, 'oracle'), lane: 0 });
  assert.deepEqual(s.players[1].resv.map((r) => [r.T, r.revealed]), [[13, true], [42, true], [11, true]]);
  for (let k = 0; k < 200 && actor(s) !== -1; k++) apply(s, s.pending ? chooseChoice(s, s.pending.pi) : { t: 'wait' });
  assert.ok(s.players[1].resv.some((r) => r.T === 42), 'the one past 40 is still waiting when the game ends');
}
// 刻壊し: 4 ticks, reveals, its player picks one pin (reservation or echo) to destroy
{
  const s = fresh(); at(s, 0, 0, 5);
  assert.equal(cardDef('breaker').cost, 4);
  s.players[1].resv = [{ uid: 900, card: 'bolt', T: 10, revealed: false }, { uid: 901, card: 'stop', T: 20, revealed: false }];
  apply(s, { t: 'play', hand: give(s, 0, 'breaker'), lane: 0 });
  assert.equal(s.pending?.kind, 'break');
  assert.ok(s.players[1].resv.every((r) => r.revealed));
  apply(s, { t: 'choose', i: 1 });
  assert.deepEqual(s.players[1].resv.map((r) => r.uid), [900]);
}
// 双子時計のアトラ: +1/+1 per tick ahead, then the opponent's clock catches up half the gap (rounded down)
{
  const s = fresh(); at(s, 0, 3, 4);
  apply(s, { t: 'play', hand: give(s, 0, 'e_atra'), lane: 1 });
  assert.equal(s.players[0].time, 9);
  const u = s.players[0].field[1]!;
  assert.deepEqual([u.atk, u.hp], [2 + 5, 3 + 5], 'grows by the whole gap');
  assert.equal(s.players[1].time, 4 + 2, 'half of 5, rounded down');
  assert.equal(actor(s), 1);
}
{
  const s = fresh(); at(s, 0, 0, 8);
  apply(s, { t: 'play', hand: give(s, 0, 'e_atra'), lane: 1 });
  assert.equal(s.players[1].time, 8, 'never pulls a clock back');
  assert.equal(s.players[0].field[1]!.atk, 2);
}
// 遅延術師: every spell of the opponent (cast or reserved) sets their clock 1 ahead
{
  const s = fresh(); at(s, 1, 0, 10);
  put(s, 0, 0, 'delayer');
  apply(s, { t: 'cast', hand: give(s, 1, 'insight') });
  assert.equal(s.players[1].time, 2 + 1);
  apply(s, { t: 'reserve', hand: give(s, 1, 'bolt'), T: 20 });
  assert.equal(s.players[1].time, 3 + 2 + 1);
  apply(s, { t: 'play', hand: give(s, 1, 'scout'), lane: 0 });
  assert.equal(s.players[1].time, 6 + 2, 'units are not taxed');
}
// 残響術士: spells cast right away use the reserved strength
{
  const s = fresh(); at(s, 0, 0, 10);
  put(s, 0, 0, 'e_mage');
  const hp = s.players[1].hp;
  apply(s, { t: 'cast', hand: give(s, 0, 'bolt') });
  assert.equal(s.players[1].hp, hp - 5);
  const v = put(s, 1, 1, 'heavy');
  apply(s, { t: 'cast', hand: give(s, 0, 'e_slash'), x: 1 });
  assert.equal(v.hp, 6 - 5, '一閃: reserved 4 + X');
}
// 永劫の巨像: 8 ticks, taunt, no pierce; each attack on it mends its owner's base by 1
{
  const s = fresh(); at(s, 0, 0, 10);
  assert.equal(cardDef('titan').cost, 8);
  assert.ok(!cardDef('titan').keywords?.includes('pierce'));
  put(s, 1, 0, 'titan');
  s.players[1].hp = 10;
  put(s, 0, 0, 'gear');
  apply(s, { t: 'attack', lane: 0 });
  assert.equal(s.players[1].hp, 11);
}
// 刻溜めの巨兵: taunt from X=2
{
  const s = fresh(); at(s, 0, 0, 10);
  apply(s, { t: 'play', hand: give(s, 0, 'e_colossus'), lane: 0, x: 2 });
  const u = s.players[0].field[0]!;
  assert.ok(u.taunt);
  assert.deepEqual([u.atk, u.hp, s.players[0].time], [6, 7, 6]);
}
// 共鳴の鐘守 −2, 夜明けの竜 −3, こだま撃ち echo −2, 記録係 draws 2
{
  const s = fresh(); at(s, 0, 0, 10);
  const v = put(s, 1, 0, 'heavy'), w = put(s, 1, 2, 'warden');
  apply(s, { t: 'play', hand: give(s, 0, 'dragon'), lane: 1 });
  assert.deepEqual([v.hp, w.hp], [3, 1]);
}
{
  const s = fresh(); at(s, 0, 0, 10);
  const v = put(s, 1, 0, 'heavy');
  apply(s, { t: 'cast', hand: give(s, 0, 'e_shot') });
  assert.equal(v.hp, 4);
  const echo = s.players[0].resv.find((r) => r.echo)!;
  assert.deepEqual([echo.echo, echo.T], ['shot2', 5]);
  const n = s.players[0].hand.length;
  apply(s, { t: 'play', hand: give(s, 0, 'scribe'), lane: 0 });
  assert.equal(s.players[0].hand.length, n + 2);
}
console.log('v23 ok');
