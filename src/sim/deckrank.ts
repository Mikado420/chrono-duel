/*
 * Round robin of the roster's decks with the rival brain on both sides: `npx tsx src/sim/deckrank.ts <lv> <games per pair> [shard] [shards]`
 * Prints one JSON line per pair: { a, b, score (of a), games }. Seats and first player alternate.
 */
import { newMind, quirksOf, chooseRival, type RivalCfg } from '../core/rival';
import { actor, apply, createGame, mulberry32, type PlayerIndex } from '../core/engine';
import { ROSTER_DECKS } from './rosterDecks';

const proc = process as unknown as { argv: string[]; stdout: { write(s: string): void } };
const LVL = +(proc.argv[2] ?? 8), N = +(proc.argv[3] ?? 12), SH = +(proc.argv[4] ?? 0), SHS = +(proc.argv[5] ?? 1);
const cfg = (deck: string, n: string): RivalCfg => ({ name: n, lv: LVL, persona: 'steady', deck, quirks: quirksOf(n) });
let pair = 0;
for (let x = 0; x < ROSTER_DECKS.length; x++) for (let y = x + 1; y < ROSTER_DECKS.length; y++) {
  if (pair++ % SHS !== SH) continue;
  const A = ROSTER_DECKS[x], B = ROSTER_DECKS[y];
  let s = 0;
  for (let i = 0; i < N; i++) {
    const seed = 500000 + pair * 997 + i;
    const r = mulberry32(seed);
    const sa = (i % 2) as PlayerIndex;
    const decks: [string[], string[]] = sa === 0 ? [A.cards, B.cards] : [B.cards, A.cards];
    const { state } = createGame(decks, seed, ((i >> 1) % 2) as PlayerIndex);
    const minds = [newMind(r), newMind(r)];
    const ca = cfg(A.id, 'a' + i), cb = cfg(B.id, 'b' + i);
    for (let k = 0; !state.over && k < 600; k++) {
      const pi = actor(state);
      if (pi === -1) break;
      const m = chooseRival(state, pi, pi === sa ? ca : cb, minds[pi], r);
      if (m.surrender) { state.over = { winner: (1 - pi) as PlayerIndex, reason: 'ko' }; break; }
      apply(state, m.action);
    }
    const w = state.over?.winner ?? -1;
    s += w === sa ? 1 : w === -1 ? 0.5 : 0;
  }
  proc.stdout.write(JSON.stringify({ a: A.id, b: B.id, score: s, games: N }) + '\n');
}
