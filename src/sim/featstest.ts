/* 勝ち方の記録 (core/feats.ts): `npx tsx src/sim/featstest.ts` */
import assert from 'node:assert/strict';
import { FeatTracker } from '../core/feats';
import { createGame, type GameState } from '../core/engine';
import { PRESET_DECKS } from '../core/decks';
import { RULES } from '../core/rules';

const base = (): GameState => createGame([PRESET_DECKS[0].cards, PRESET_DECKS[1].cards], 1, 0).state;
const won = (f: (s: GameState) => void) => { const s = base(); s.over = { winner: 0, reason: 'ko' }; f(s); return s; };

// a reservation finishes it at exactly 40, untouched, with full health
{
  const t = new FeatTracker();
  t.see({ e: 'trigger', pi: 0, uid: 1, card: 'arrow', T: 40 });
  t.see({ e: 'dmgBase', pi: 1, amount: 5, hp: 0, doom: false });
  const s = won((s) => { s.players[0].time = RULES.END; s.players[1].time = 38; s.players[0].hand = []; s.players[0].deck = []; s.doom = 3; });
  const r = t.result(s);
  for (const f of ['winResv', 'winPerfect', 'winUntouched', 'winFlawless', 'winEmpty', 'winDoom', 'winLate'] as const) assert.ok(r.includes(f), f);
  assert.ok(!r.includes('winSwift') && !r.includes('winComeback') && !r.includes('winLegend'));
}
// an early knock-out by a legend after being down to 2
{
  const t = new FeatTracker();
  t.see({ e: 'dmgBase', pi: 0, amount: 13, hp: 2, doom: false });
  t.see({ e: 'attack', pi: 0, lane: 1, target: null, card: 'dragon' });
  t.see({ e: 'dmgBase', pi: 1, amount: 9, hp: -1, doom: false });
  const s = won((s) => { s.players[0].time = 12; s.players[1].time = 14; s.players[0].hp = 2; });
  const r = t.result(s);
  for (const f of ['winSwift', 'winLegend', 'winComeback'] as const) assert.ok(r.includes(f), f);
  assert.ok(!r.includes('winUntouched') && !r.includes('winFlawless') && !r.includes('winResv') && !r.includes('winPerfect'));
}
// the opponent's own damage never counts as mine, and a loss gives nothing
{
  const t = new FeatTracker();
  t.see({ e: 'cast', pi: 1, card: 'arrow', fromHand: 0 });
  t.see({ e: 'dmgBase', pi: 1, amount: 3, hp: 0, doom: false });
  assert.ok(!t.result(won(() => {})).includes('winResv'));
  const lost = base(); lost.over = { winner: 1, reason: 'ko' };
  assert.deepEqual(t.result(lost), []);
}
console.log('feats ok');
