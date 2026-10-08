/*
 * Rated rivals against each other: `npm run sim:rivals -- <lvA> <lvB> [games] [persona]`
 * Each side plays a random main deck of a rival of its Lv (as in rated play), seats and first player alternate.
 * The target (仕様書): the higher Lv wins 62–66% against the Lv just below it. With a persona, side A uses it and
 * side B is 堅実型 at the same Lv and deck pool (the persona check: within ±3%).
 */
import { LV, chooseRival, newMind, quirksOf, tuneLv, type Persona, type RivalCfg } from '../core/rival';
import { actor, apply, createGame, mulberry32, type PlayerIndex } from '../core/engine';
import { ROSTER, deckAvailable, rivalDeckCards } from '../meta/roster';

const proc = process as unknown as { argv: string[]; env: Record<string, string | undefined>; stdout: { write(s: string): void } };
const A = +(proc.argv[2] ?? 1), B = +(proc.argv[3] ?? 2), N = +(proc.argv[4] ?? 100);
const persona = proc.argv[5] as Persona | undefined;
const seed0 = +(proc.env.SEED ?? 1);
// TUNE='{"3":{"noise":4}}' tries other Lv parameters (miss values are merged)
if (proc.env.TUNE) for (const [lv, p] of Object.entries(JSON.parse(proc.env.TUNE) as Record<string, Record<string, unknown>>)) {
  const { miss, ...rest } = p as { miss?: Record<string, number> };
  tuneLv(+lv, { ...rest, ...(miss ? { miss: { ...LV[+lv].miss, ...miss } } : {}) });
}

const decksOf = (lv: number) => [...new Set(ROSTER.filter((r) => r.lv === lv).map((r) => (deckAvailable(r.deck) ? r.deck : r.sub)))];
const cfg = (lv: number, deck: string, p: Persona, name: string): RivalCfg => ({ name, lv, persona: p, deck, quirks: quirksOf(name) });

let aw = 0, d = 0, acts = 0;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const seed = seed0 * 100000 + i;
  const r = mulberry32(seed);
  const da = decksOf(A), db = decksOf(B);
  const deckA = persona ? da[i % da.length] : da[Math.floor(r() * da.length)];
  const deckB = persona ? deckA : db[Math.floor(r() * db.length)];
  const sa = (i % 2) as PlayerIndex; // A's seat
  const ca = cfg(A, deckA, persona ?? 'steady', `a${i}`), cb = cfg(B, deckB, 'steady', `b${i}`);
  const decks: [string[], string[]] = sa === 0 ? [rivalDeckCards(deckA), rivalDeckCards(deckB)] : [rivalDeckCards(deckB), rivalDeckCards(deckA)];
  const { state } = createGame(decks, seed, ((i >> 1) % 2) as PlayerIndex);
  const minds = [newMind(r), newMind(r)];
  let k = 0;
  for (; !state.over && k < 600; k++) {
    const pi = actor(state);
    if (pi === -1) break;
    const mine = pi === sa;
    const m = chooseRival(state, pi, mine ? ca : cb, minds[pi], r);
    if (m.surrender) { state.over = { winner: (1 - pi) as PlayerIndex, reason: 'ko' }; break; }
    apply(state, m.action);
  }
  acts += k;
  const w = state.over?.winner ?? -1;
  if (w === sa) aw++; else if (w === -1) d++;
}
const score = (aw + d / 2) / N;
const se = Math.sqrt(score * (1 - score) / N);
proc.stdout.write(JSON.stringify({ A, B, persona: persona ?? null, games: N, scoreA: +(score * 100).toFixed(1), se: +(se * 100).toFixed(1), draws: d, secPerGame: +((Date.now() - t0) / 1000 / N).toFixed(2), actsPerGame: Math.round(acts / N) }) + '\n');
