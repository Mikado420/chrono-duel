/**
 * Rated play against the AI. The AI's strength follows the player's rating, and from 時の賢者 up only 超つよい is left.
 * Pure logic: the client uses it for instant feedback and the ranking server runs the same code to keep the
 * authoritative number, so both always agree.
 */
import type { AiLevel } from '../core/ai';

export const START_RATING = 1000;
export const MIN_RATING = 100;
/** Each AI level plays at a fixed rating. Spacing follows AI-vs-AI results (each level beats the one below ~60–70%). */
export const AI_RATING: Record<AiLevel, number> = { easy: 850, normal: 1000, hard: 1200, expert: 1450 };
/** Bigger swings while the rating is still settling in. */
export const PLACEMENT_GAMES = 10;
export const K_PLACEMENT = 40;
export const K_NORMAL = 24;

export interface Tier { id: string; name: string; min: number; color: string }
export const TIERS: Tier[] = [
  { id: 'novice', name: '見習い', min: 0, color: '#9fb3b8' },
  { id: 'keeper', name: '刻守', min: 900, color: '#8fd9c8' },
  { id: 'smith', name: '時計師', min: 1100, color: '#7fc4ff' },
  { id: 'master', name: '刻匠', min: 1300, color: '#d9b8ff' },
  { id: 'sage', name: '時の賢者', min: 1500, color: '#ffd66e' },
  { id: 'eternal', name: '永劫', min: 1700, color: '#ff9f7a' },
];
/** From this rating on, only 超つよい is matched. */
export const EXPERT_ONLY = 1500;

export function tierOf(rating: number): { tier: Tier; next: Tier | null; into: number; span: number } {
  let i = 0;
  while (i + 1 < TIERS.length && rating >= TIERS[i + 1].min) i++;
  const tier = TIERS[i], next = TIERS[i + 1] ?? null;
  return { tier, next, into: rating - tier.min, span: next ? next.min - tier.min : 0 };
}

/** Which AI levels can appear at a rating, with their weights. */
export function opponentPool(rating: number): [AiLevel, number][] {
  if (rating >= EXPERT_ONLY) return [['expert', 1]];
  if (rating >= 1300) return [['hard', 0.65], ['expert', 0.35]];
  if (rating >= 1100) return [['normal', 0.3], ['hard', 0.7]];
  if (rating >= 900) return [['normal', 1]];
  return [['easy', 0.7], ['normal', 0.3]];
}
export function pickOpponent(rating: number, rand: () => number = Math.random): AiLevel {
  let r = rand();
  for (const [lv, w] of opponentPool(rating)) { if (r < w) return lv; r -= w; }
  return opponentPool(rating)[0][0];
}

export const expected = (me: number, them: number) => 1 / (1 + Math.pow(10, (them - me) / 400));
/** New rating after one game. `score` is 1 for a win, 0.5 for a draw, 0 for a loss. */
export function nextRating(rating: number, games: number, ai: AiLevel, score: 0 | 0.5 | 1): number {
  const k = games < PLACEMENT_GAMES ? K_PLACEMENT : K_NORMAL;
  const d = Math.round(k * (score - expected(rating, AI_RATING[ai])));
  // never a zero-point win or a zero-point loss: every game moves the needle
  const step = d === 0 ? (score === 1 ? 1 : score === 0 ? -1 : 0) : d;
  return Math.max(MIN_RATING, rating + step);
}

// ------------------------------------------------------------------ the player's rated record
export interface RatedGame { at: number; ai: AiLevel; score: 0 | 0.5 | 1; before: number; after: number; deck: string }
export interface Rated {
  rating: number;
  games: number;
  wins: number;
  peak: number;
  history: RatedGame[];
  /** A rated game that was started and not finished yet. If the app is closed mid-game, it counts as a loss. */
  pending: { at: number; ai: AiLevel; deck: string } | null;
  /** Results not yet accepted by the ranking server. */
  outbox: SubmitReq[];
}
export const NEW_RATED = (): Rated => ({ rating: START_RATING, games: 0, wins: 0, peak: START_RATING, history: [], pending: null, outbox: [] });

/** What the client sends to the ranking server for one finished game. */
export interface SubmitReq { gid: string; ai: AiLevel; score: 0 | 0.5 | 1; actions: number; ms: number; at: number }

export function startRated(r: Rated, ai: AiLevel, deck: string, now: number) {
  r.pending = { at: now, ai, deck };
}
/** Records a finished (or abandoned) game locally. Returns the change for the result screen. */
export function finishRated(r: Rated, score: 0 | 0.5 | 1, actions: number, now: number, gid: string): RatedGame | null {
  const p = r.pending;
  if (!p) return null;
  r.pending = null;
  const before = r.rating;
  const after = nextRating(before, r.games, p.ai, score);
  r.rating = after;
  r.games++;
  if (score === 1) r.wins++;
  r.peak = Math.max(r.peak, after);
  const g: RatedGame = { at: now, ai: p.ai, score, before, after, deck: p.deck };
  r.history.unshift(g);
  r.history = r.history.slice(0, 30);
  r.outbox.push({ gid, ai: p.ai, score, actions, ms: now - p.at, at: now });
  return g;
}
