/* The rated rivals' brain: `npm run test:rivals` */
import assert from 'node:assert/strict';
import { LV, chooseRival, findLethal, incoming, newMind, quirksOf, thinkMs, type RivalCfg } from '../core/rival';
import { planBonus } from '../core/plans';
import { actor, apply, createGame, legalActions, mulberry32, type Action, type GameState } from '../core/engine';
import { ROSTER, rivalCfg, rivalDeckCards } from '../meta/roster';

const rand = mulberry32(5);
const unit = (card: string, atk: number, hp: number, ready = 0) => ({ uid: 900 + atk * 10 + hp, card, atk, hp, maxHp: hp, reload: 1, readyAt: ready, taunt: false, pierce: false });
const fresh = (): GameState => {
  const { state } = createGame([rivalDeckCards('rush'), rivalDeckCards('titan')], 3, 1);
  return state;
};

// とどめ: a ready unit facing an empty lane finishes a base on 2
{
  const s = fresh();
  s.players[1].time = 0; s.players[0].time = 5;
  s.players[1].field[0] = unit('gear', 3, 3);
  s.players[0].hp = 2;
  const a = findLethal(s, 1);
  assert.ok(a && a.t === 'attack' && a.lane === 0, 'finds the attack that wins');
  const cfg: RivalCfg = { name: 't', lv: 7, persona: 'guard', deck: 'titan', quirks: quirksOf('t') };
  const m = chooseRival(s, 1, cfg, newMind(rand), rand);
  assert.equal(m.why, 'lethal');
  assert.deepEqual(m.action, a, 'even a 守り型 takes the win');
}
// 必ず守る: two ready attackers into open lanes would finish us
{
  const s = fresh();
  s.players[1].time = 0; s.players[0].time = 1;
  s.players[0].field[0] = unit('gear', 3, 3); s.players[0].field[2] = unit('gear', 3, 3);
  s.players[1].hp = 5;
  assert.equal(incoming(s, 1), 6);
  const m = chooseRival(s, 1, { name: 't', lv: 6, persona: 'attack', deck: 'titan', quirks: quirksOf('t') }, newMind(rand), rand);
  assert.ok(m.why === 'defend' || m.surrender || m.why === 'lethal', `defends (${m.why})`);
}
// every Lv answers a fresh game with a legal move
for (let lv = 1; lv <= 7; lv++) {
  const s = fresh();
  const q = actor(s);
  const r = ROSTER.find((x) => x.lv === lv)!;
  const m = chooseRival(s, q as 0 | 1, rivalCfg(r, q === 0 ? 'rush' : 'titan'), newMind(rand), rand);
  const legal = legalActions(s, q as 0 | 1).map((a) => JSON.stringify(a));
  assert.ok(legal.includes(JSON.stringify(m.action)) || m.action.t === 'play' || m.action.t === 'reserve', `Lv${lv}: ${JSON.stringify(m.action)}`);
  apply(s, m.action);
}
// Lv table: the higher the Lv, the fewer mistakes and the narrower ε
for (let lv = 2; lv <= 10; lv++) {
  assert.ok(LV[lv].eps <= LV[lv - 1].eps && LV[lv].noise <= LV[lv - 1].noise, `Lv${lv} is no sloppier than Lv${lv - 1}`);
  assert.ok(LV[lv].miss.attackMiss <= LV[lv - 1].miss.attackMiss);
}
assert.ok([4, 5, 6, 7, 8, 9, 10].every((lv) => LV[lv].miss.missLethal === 0 && LV[lv].miss.forgetDefend === 0), 'from Lv4 no finish is missed');
// quirks: always the same for a name
assert.deepEqual(quirksOf('黎明'), quirksOf('黎明'));
assert.ok(new Set(ROSTER.map((r) => JSON.stringify(quirksOf(r.name)))).size > 20, 'names give varied quirks');
// thinking time stays inside the 45 s move clock (and far below it)
{
  const s = fresh();
  for (const kind of ['obvious', 'normal', 'torn', 'key'] as const) for (let i = 0; i < 50; i++) {
    const ms = thinkMs({ action: { t: 'wait' }, kind }, { name: 'x', lv: 1 + (i % 10), persona: 'steady', deck: 'rush', quirks: quirksOf(String(i)) }, s, { streak: i % 3 === 0, first: i % 5 === 0 }, rand);
    assert.ok(ms >= 200 && ms <= 9000, `${kind}: ${ms}`);
  }
}
// 鐘を押し出す: 時間停止 just before the opponent's bell gets the shared bonus
{
  const s = fresh();
  s.players[1].time = 3; s.players[0].time = 6;
  s.players[1].hand = [{ uid: 777, card: 'stop' }];
  const a: Action = { t: 'cast', hand: 777 };
  assert.ok(planBonus('oracle', 'all', s, s, 1, a) >= 2.5, 'pushes the opponent past bell 8');
  s.players[0].time = 3;
  assert.ok(planBonus('oracle', 'all', s, s, 1, a) < 1, 'no bell to push past');
}
console.log('all rival tests passed');
