/* イベント: every event sets up games that play to the end: `npx tsx src/sim/eventstest.ts` */
import assert from 'node:assert/strict';
import { EVENTS, EVENT_PRIZES, eventOf, eventProgress, recordEventGame, weekOf } from '../meta/events';
import { PRESET_DECKS } from '../core/decks';
import { actor, apply, createGame } from '../core/engine';
import { chooseAction } from '../core/ai';
import { CARDS } from '../core/cards';
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
    const set = ev.setup(ev.ownDeck ? PRESET_DECKS[g % PRESET_DECKS.length].cards : null, rand);
    const mine = set.myDeck ?? PRESET_DECKS[0].cards;
    for (const d of [mine, set.aiDeck]) { assert.equal(d.length, RULES.DECK_SIZE, `${ev.id}: a full deck`); assert.ok(d.every((c) => CARDS[c] && !CARDS[c].token)); }
    const { state } = createGame([mine, set.aiDeck], 1000 + g, (g % 2) as 0 | 1);
    set.open?.(state);
    let n = 0;
    while (!state.over && n++ < 900) { const pi = actor(state); if (pi === -1) break; apply(state, chooseAction(state, pi, 'easy')); }
    assert.ok(state.over, `${ev.id}: the game ends`);
  }
}
// the week's prizes come at 1, 3 and 5 wins, once; a new week starts from zero
const p = eventProgress(undefined, '2026-10-14');
const got = [true, false, true, true, true, true].flatMap((w) => recordEventGame(p, w).map((x) => x.wins));
assert.deepEqual(got, [1, 3, 5]);
assert.equal(p.wins, 5); assert.equal(p.games, 6);
assert.equal(eventProgress(p, '2026-10-16'), p);
assert.equal(eventProgress(p, '2026-10-19').wins, 0);
assert.equal(EVENT_PRIZES.length, 3);
console.log(`events ok (${EVENTS.length})`);
