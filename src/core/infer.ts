/**
 * What a strong rival (Lv9 and up) works out about the opponent from what it has seen (仕様書「Lv9：相手のデッキを
 * 推測する」「Lv10：予約も先読みする」). Only public information is used: units on the board, spells that were used,
 * revealed reservations and the pins (times) of the hidden ones.
 */
import { CARD_LIST, cardDef } from './cards';
import { PRESET_DECKS } from './decks';
import { clone, other, resvRange, timeCost, type Action, type GameState, type PlayerIndex, type Reservation } from './engine';
import { RULES } from './rules';
import { META_DECKS } from '../sim/metaDecks';
import { SET2_TEST_DECKS } from '../sim/set2Decks';

export type Seen = Record<string, number>;
export interface Guess { id: string | null; p: number }

const playable = (cards: string[]) => { try { cards.forEach((c) => cardDef(c)); return true; } catch { return false; } };
/** The decks a guess can be: every deck the rivals use and the starter decks (第2弾 ones once the set is out). */
export function knownDecks(): { id: string; cards: string[] }[] {
  const out = new Map<string, string[]>();
  for (const d of [...META_DECKS, ...SET2_TEST_DECKS, ...PRESET_DECKS]) if (!out.has(d.id) && playable(d.cards)) out.set(d.id, d.cards);
  return [...out].map(([id, cards]) => ({ id, cards }));
}

/** Adds what is visible of the opponent now (board, used spells, revealed reservations) to `seen` (most copies at once). */
export function observe(seen: Seen, real: GameState, pi: PlayerIndex) {
  const op = real.players[other(pi)];
  const now: Seen = {};
  const add = (c: string) => { try { if (cardDef(c).token) return; } catch { return; } now[c] = (now[c] ?? 0) + 1; };
  for (const u of op.field) if (u) add(u.card);
  for (const c of op.used ?? []) add(c);
  for (const r of op.resv) if (r.revealed && !r.echo && !r.decoy) add(r.card);
  for (const [c, n] of Object.entries(now)) seen[c] = Math.max(seen[c] ?? 0, n);
}
export const seenCount = (seen: Seen) => Object.values(seen).reduce((a, b) => a + b, 0);

/**
 * How likely each known deck is, given the cards seen: every seen copy multiplies a deck's chance by
 * (its copies in the deck ÷ 20), or by 0.02 when the deck has no (more) copies of it. 「その他」 is 0.05 per card.
 */
export function guessDecks(seen: Seen): Guess[] {
  const decks = knownDecks();
  const logs: { id: string | null; l: number }[] = decks.map((d) => {
    let l = 0;
    for (const [c, n] of Object.entries(seen)) {
      const k = d.cards.filter((x) => x === c).length;
      l += Math.min(n, k) * Math.log(k / 20 || 0.02) + Math.max(0, n - k) * Math.log(0.02);
    }
    return { id: d.id, l };
  });
  logs.push({ id: null, l: seenCount(seen) * Math.log(0.05) });
  const top = Math.max(...logs.map((x) => x.l));
  const w = logs.map((x) => ({ id: x.id, p: Math.exp(x.l - top) }));
  const sum = w.reduce((a, x) => a + x.p, 0);
  return w.map((x) => ({ id: x.id, p: x.p / sum })).sort((a, b) => b.p - a.p);
}
/** The deck the opponent most likely plays, once the guess is good enough (60%). */
export function likelyDeck(g: Guess[]): string | null {
  return g[0] && g[0].id && g[0].p >= 0.6 ? g[0].id : null;
}

const COLLECTIBLE = () => CARD_LIST.filter((c) => !c.token);
const pick = <T>(xs: T[], rand: () => number) => xs[Math.floor(rand() * xs.length)];
function sample(g: Guess[], rand: () => number): string | null {
  let x = rand();
  for (const k of g) { if (x < k.p) return k.id; x -= k.p; }
  return g[g.length - 1]?.id ?? null;
}
/** The cards of `deck` not seen yet (a multiset), shuffled. */
function unseen(deck: string[], seen: Seen, rand: () => number): string[] {
  const left = { ...seen };
  const out: string[] = [];
  for (const c of deck) { if ((left[c] ?? 0) > 0) left[c]--; else out.push(c); }
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/**
 * One guess of the hidden information, from the deck guess: the opponent's hand and deck come from the unseen cards
 * of a deck drawn by its chance (with fewer than 3 cards seen, half the guesses still use any card). With `pins`, the
 * opponent's hidden reservations stay at their (public) times and get a spell that deck could have put there;
 * without, they are left out (as everywhere else). Our own deck is our real remaining cards in a random order.
 */
export function guessWorld(real: GameState, pi: PlayerIndex, g: Guess[], seen: Seen, pins: boolean, rand: () => number): GameState {
  const c = clone(real);
  const op = c.players[other(pi)];
  const any = COLLECTIBLE();
  const loose = seenCount(seen) < 3 && rand() < 0.5;
  const id = loose ? null : sample(g, rand);
  const list = id ? knownDecks().find((d) => d.id === id)?.cards ?? [] : [];
  const pool = id ? unseen(list, seen, rand) : [];
  const take = (spell = false) => {
    const i = spell ? pool.findIndex((x) => cardDef(x).kind === 'spell') : pool.length - 1;
    if (i >= 0) return pool.splice(i, 1)[0];
    return pick(spell ? any.filter((x) => x.kind === 'spell') : any, rand).id;
  };
  op.resv = op.resv.flatMap((r): Reservation[] => (r.revealed || r.echo ? [r] : pins ? [{ ...r, card: take(true), decoy: false }] : []));
  op.hand = op.hand.map((h) => ({ uid: h.uid, card: take() }));
  op.deck = op.deck.map(() => take());
  const mine = real.players[pi].deck.slice();
  for (let i = mine.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [mine[i], mine[j]] = [mine[j], mine[i]]; }
  c.players[pi].deck = mine;
  return c;
}

/**
 * Lv10's reservation times: on top of the usual few, just after the opponent's next move, a tick before each bell,
 * the doom tick (20) and a tick before each of the opponent's pins (to land first).
 */
export function moreReserveTimes(s: GameState, pi: PlayerIndex, legal: Action[], have: Action[]): Action[] {
  const op = s.players[other(pi)];
  const want = new Set<number>([op.time + 1, RULES.DOOM_AT, ...RULES.BELLS.map((b) => b - 1), ...op.resv.map((r) => r.T - 1)]);
  const key = (a: Action) => JSON.stringify(a);
  const got = new Set(have.map(key));
  const out = have.slice();
  for (const a of legal) {
    if (a.t !== 'reserve' || !want.has(a.T) || got.has(key(a))) continue;
    const r = resvRange(s, pi, timeCost(s, pi, a));
    if (!r || a.T < r[0] || a.T > r[1]) continue;
    out.push(a);
    got.add(key(a));
  }
  return out;
}
