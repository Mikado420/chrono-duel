/* イベント: every event sets up games that play to the end: `npx tsx src/sim/eventstest.ts` */
import assert from 'node:assert/strict';
import { DRAFT_PICKS, EVENTS, EVENT_PRIZES, STORM_TIMES, aiDraft, draftOffer, eventOf, eventProgress, recordEventGame, weekOf } from '../meta/events';
import { maxCopies } from '../core/decks';
import { resvCount } from '../core/engine';
import { PRESET_DECKS } from '../core/decks';
import { actor, apply, createGame } from '../core/engine';
import { chooseAction } from '../core/ai';
import { CARDS, cardDef } from '../core/cards';
import { RULES } from '../core/rules';
import { mulberry32 } from '../core/engine';

// one event a week, Monday to Sunday, all of them in turn
assert.equal(weekOf('2026-10-12'), weekOf('2026-10-18'), 'Monday to Sunday is one week');
assert.equal(weekOf('2026-10-19'), weekOf('2026-10-18') + 1);
assert.equal(eventOf('2026-10-14').until, '2026-10-18');
const seen = new Set(Array.from({ length: EVENTS.length }, (_, i) => eventOf(new Date(Date.UTC(2026, 9, 12 + i * 7)).toISOString().slice(0, 10)).event.id));
assert.equal(seen.size, EVENTS.length, 'every event comes round');

for (const ev of EVENTS) {
  for (let g = 0; g < 6; g++) {
    const rand = mulberry32(100 + g);
    const set = ev.setup(ev.ownDeck ? PRESET_DECKS[g % PRESET_DECKS.length].cards : ev.draft ? aiDraft(rand) : null, rand);
    assert.ok(set.lv >= 1 && set.lv <= 10, `${ev.id}: AI Lv`);
    const mine = set.myDeck ?? PRESET_DECKS[0].cards;
    for (const d of [mine, set.aiDeck]) { assert.equal(d.length, RULES.DECK_SIZE, `${ev.id}: a full deck`); assert.ok(d.every((c) => CARDS[c] && !CARDS[c].token)); }
    const { state } = createGame([mine, set.aiDeck], 1000 + g, (g % 2) as 0 | 1);
    set.open?.(state);
    if (ev.id === 'doom') { assert.equal(state.doomAt, 0); assert.equal(state.doom, 1, 'doom from the start'); }
    if (ev.id === 'storm') for (const p of state.players) {
      const spells = [...p.deck, ...p.resv.map((r) => r.card)].filter((c) => cardDef(c).kind === 'spell' && !cardDef(c).reserveOnly).length; // the deck after the opening hand
      assert.equal(p.resv.length, Math.min(spells, STORM_TIMES.length), 'as many as the deck allows');
      assert.deepEqual(p.resv.map((r) => r.T), STORM_TIMES.slice(0, p.resv.length));
      assert.equal(resvCount(p), 0, 'the preset ones use no slot');
    }
    if (ev.id === 'quick') assert.equal(set.turnMs, 10_000);
    let n = 0;
    while (!state.over && n++ < 900) { const pi = actor(state); if (pi === -1) break; apply(state, chooseAction(state, pi, 'easy')); }
    assert.ok(state.over, `${ev.id}: the game ends`);
  }
}
// 刻の継承: three different cards each time, never past a card's copy limit; the AI drafts a full deck
{
  const rand = mulberry32(7);
  const picks: string[] = [];
  while (picks.length < DRAFT_PICKS) {
    const o = draftOffer(picks, rand);
    assert.equal(new Set(o).size, 3);
    for (const c of o) assert.ok(picks.filter((x) => x === c).length < maxCopies(c));
    picks.push(o[Math.floor(rand() * 3)]);
  }
  const ai = aiDraft(rand);
  assert.equal(ai.length, RULES.DECK_SIZE);
  for (const c of new Set(ai)) assert.ok(ai.filter((x) => x === c).length <= maxCopies(c));
}
assert.equal(eventOf('2026-10-09').event.id, 'storm', 'this week stays 予約の嵐');
// the week's prizes come at 1, 3 and 5 wins, once; a new week starts from zero
const p = eventProgress(undefined, '2026-10-14');
const got = [true, false, true, true, true, true].flatMap((w) => recordEventGame(p, w).map((x) => x.wins));
assert.deepEqual(got, [1, 3, 5]);
assert.equal(p.wins, 5); assert.equal(p.games, 6);
assert.equal(eventProgress(p, '2026-10-16'), p);
assert.equal(eventProgress(p, '2026-10-19').wins, 0);
assert.equal(EVENT_PRIZES.length, 3);
console.log(`events ok (${EVENTS.length})`);
