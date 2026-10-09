/**
 * Rated play. Opponents are AI players presented as ordinary players (a name and a rating, never "AI" or a
 * difficulty). Their strength is picked near the player's rating from nine steps (RATED_FOES).
 * Pure logic: the client uses it for instant feedback and the ranking server runs the same code to keep the
 * authoritative number, so both always agree.
 */
import type { AiLevel, AiSpec } from '../core/ai';
import { ROSTER, rivalById, rivalCard, rivalDeck, rivalId, rivalLevel, rivalTitle } from './roster';

export const START_RATING = 1000;
export const MIN_RATING = 100;
/** Each AI level plays at a fixed rating. Spacing follows AI-vs-AI results (each level beats the one below ~60–70%). */
export const AI_RATING: Record<AiLevel, number> = { easy: 850, normal: 1000, hard: 1200, expert: 1450 };
/** Bigger swings while the rating is still settling in. */
export const PLACEMENT_GAMES = 10;
export const K_PLACEMENT = 40;
export const K_NORMAL = 24;

export { TIERS, type Tier } from './ranks';
import { SEASONS, TIERS, seasonAt, type Season, type Tier } from './ranks';
export { SEASONS, seasonAt, type Season };

/**
 * Rated opponents: the four AI levels plus steps between and above them, so there is always one near the player.
 * A step between two levels plays each move at one or the other (half and half); the steps above 超つよい search
 * harder. Ratings keep the scale of the four levels; the steps are placed by AI-vs-AI games (scripts in README):
 * easy→normal +127, normal→hard +40, hard→expert +108 Elo in AI games, mapped onto the existing 850/1000/1200/1450.
 * The ids are stored in players' records and sent to the ranking server, so existing ids never change meaning.
 */
export interface RatedFoe { id: string; rating: number; spec: AiSpec }
export const RATED_FOES: RatedFoe[] = [
  { id: 'easy', rating: 850, spec: { level: 'easy' } },
  { id: 'easy+', rating: 925, spec: { level: 'easy', mix: { level: 'normal', p: 0.5 } } },
  { id: 'normal', rating: 1000, spec: { level: 'normal' } },
  { id: 'normal+', rating: 1100, spec: { level: 'normal', mix: { level: 'hard', p: 0.5 } } },
  { id: 'hard', rating: 1200, spec: { level: 'hard' } },
  { id: 'hard+', rating: 1325, spec: { level: 'hard', mix: { level: 'expert', p: 0.5 } } },
  { id: 'expert', rating: 1450, spec: { level: 'expert' } },
  { id: 'expert+', rating: 1530, spec: { level: 'expert', search: { candidates: 8, rollouts: 24, depth: 30 } } },
  { id: 'expert++', rating: 1600, spec: { level: 'expert', search: { candidates: 12, rollouts: 40, depth: 30 } } },
];
/** A rated opponent by id: the 120 rivals of the roster ('rv:' + name), or one of the older strength steps (games recorded before the roster). */
export function foeById(id: string): RatedFoe | undefined {
  const r = rivalById(id);
  if (r) return { id, rating: r.rating, spec: { level: rivalLevel(r.lv) } };
  return RATED_FOES.find((f) => f.id === id);
}
/** The plain level a rated opponent is closest to (rewards, statistics, which decks it may use). */
export const foeLevel = (id: string): AiLevel => foeById(id)?.spec.level ?? 'normal';
/** How wide the choice around the player's rating is: steps further away than this are rare. */
export const MATCH_WIDTH = 90;

/**
 * One-time rating reset when the ranks were redrawn (2026-10): 刻匠 and above go to the start of 刻匠 (1400), 刻士
 * to the start of 刻士 (1200), everyone else to the start of 見習い (1000). Games, wins and the best rating stay.
 * The client and the ranking server both apply it once (a record remembers the reset it has had).
 */
export const RATING_RESET = '2026-10-ranks';
export function resetRating(rating: number): number {
  return rating >= 1400 ? 1400 : rating >= 1200 ? 1200 : START_RATING;
}
/** Applies the reset to a record that has not had it yet; true when something changed. */
export function applyRatingReset(r: { rating: number; reset?: string; streak?: number }): boolean {
  if (r.reset === RATING_RESET) return false;
  r.reset = RATING_RESET;
  r.rating = resetRating(r.rating);
  if (r.streak !== undefined) r.streak = 0;
  return true;
}
// ------------------------------------------------------------------ seasons (one per card set)
export interface SeasonResult { season: number; peak: number; tier: string; games: number; wins: number }
/** What the best rank of a season pays (as a present when the next season starts). */
export const SEASON_REWARDS: Record<string, { coins: number; tickets: number }> = {
  novice: { coins: 100, tickets: 0 }, shi: { coins: 200, tickets: 1 }, sho: { coins: 300, tickets: 2 },
  go: { coins: 400, tickets: 3 }, sei: { coins: 500, tickets: 4 }, shin: { coins: 800, tickets: 5 },
};
/** A new season starts at the beginning of the rank below the one held (見習い stays at 1000). */
export function seasonStartRating(rating: number): number {
  const i = TIERS.indexOf(tierOf(rating).tier);
  return Math.max(START_RATING, TIERS[Math.max(0, i - 1)].min);
}
/**
 * Moves a record into the season of `day`. Returns the result of the season that ended, if the player played in
 * it (rewards and the season title come from it), else null. The first time, the record just joins the season.
 */
export function rollSeason(r: { rating: number; games?: number; wins?: number; season?: number; sPeak?: number; sGames?: number; sWins?: number; seasons?: SeasonResult[]; streak?: number }, day: string): SeasonResult | null {
  const cur = seasonAt(day);
  // records from before seasons existed join the first one with what they have played so far
  if (r.season === undefined) { r.season = cur.id; r.sPeak = r.rating; r.sGames = r.sGames ?? r.games ?? 0; r.sWins = r.sWins ?? r.wins ?? 0; return null; }
  if (r.season >= cur.id) return null;
  const peak = Math.max(r.sPeak ?? r.rating, r.rating);
  const res: SeasonResult | null = r.sGames ? { season: r.season, peak, tier: tierOf(peak).tier.id, games: r.sGames, wins: r.sWins ?? 0 } : null;
  if (res) r.seasons = [res, ...(r.seasons ?? [])].slice(0, 50);
  r.rating = seasonStartRating(r.rating);
  r.season = cur.id; r.sPeak = r.rating; r.sGames = 0; r.sWins = 0;
  if (r.streak !== undefined) r.streak = 0;
  return res;
}

export function tierOf(rating: number): { tier: Tier; next: Tier | null; into: number; span: number } {
  let i = 0;
  while (i + 1 < TIERS.length && rating >= TIERS[i + 1].min) i++;
  const tier = TIERS[i], next = TIERS[i + 1] ?? null;
  return { tier, next, into: rating - tier.min, span: next ? next.min - tier.min : 0 };
}

/**
 * Which rated opponents can appear at a rating, with their weights: the nearest steps, more likely the nearer they
 * are. Below the weakest or above the strongest step, that step.
 */
export function opponentPool(rating: number): [string, number][] {
  const raw = RATED_FOES.map((f) => [f.id, Math.exp(-(((rating - f.rating) / MATCH_WIDTH) ** 2))] as [string, number]).filter(([, w]) => w > 0.05);
  if (!raw.length) return [[(rating < RATED_FOES[0].rating ? RATED_FOES[0] : RATED_FOES[RATED_FOES.length - 1]).id, 1]];
  const sum = raw.reduce((a, [, w]) => a + w, 0);
  return raw.map(([id, w]) => [id, w / sum]);
}
export function pickOpponent(rating: number, rand: () => number = Math.random): string {
  const pool = opponentPool(rating);
  let r = rand();
  for (const [id, w] of pool) { if (r < w) return id; r -= w; }
  return pool[pool.length - 1][0];
}

export const expected = (me: number, them: number) => 1 / (1 + Math.pow(10, (them - me) / 400));
/** How far an opponent's shown rating may sit from its level's rating. */
export const OPP_SPREAD = 60;
/** New rating after one game against an opponent rated `opp`. `score` is 1 for a win, 0.5 for a draw, 0 for a loss. */
export function nextRating(rating: number, games: number, opp: number, score: 0 | 0.5 | 1): number {
  const k = games < PLACEMENT_GAMES ? K_PLACEMENT : K_NORMAL;
  const d = Math.round(k * (score - expected(rating, opp)));
  // never a zero-point win or a zero-point loss: every game moves the needle
  const step = d === 0 ? (score === 1 ? 1 : score === 0 ? -1 : 0) : d;
  return Math.max(MIN_RATING, rating + step);
}

// ------------------------------------------------------------------ opponents
/** Handles in the style players pick for themselves. */
export const PLAYER_NAMES = [
  'ときのすけ', 'Rei_0423', '秒針マニア', 'kuro', 'みなと', '夜更かしP', 'はるか', 'Sora', 'たかし', 'ゆずポン', 'Kaito', 'あおい',
  'りんご飴', 'mochi', 'シン', 'つばさ', 'Hikaru7', 'こはる', 'ねこまる', '刻の旅人', 'yuu', 'しゅん', 'Mei', 'だいち',
  'ぽてと', 'Ren', 'さくら', 'かげろう', 'Taku', 'ひなた', '歯車好き', 'nagi', 'そうま', 'Yuki_K', 'みけ', 'あらた',
  'ちひろ', 'Shiro', 'かなで', 'まっちゃ', 'Kei', 'いぶき', 'ひろと', 'ruri', 'つむぎ', '終焉の鐘', 'Haru', 'れん',
  'のぞみ', 'Aki', 'ゆうと', 'しずく', 'Natsu', 'けいた', 'ことは', 'Mugi', 'はやて', 'すず', 'Ryo', 'あかね',
];
/** `ai` is the rated opponent's id (a rival of the roster). `deck` is the deck it brings; `card` and `title` are what it shows. */
export interface Opponent { ai: string; name: string; rating: number; deck?: string; card?: string; title?: string }
/** How likely each rival is to be drawn at a rating: the nearer its rating, the likelier (the same width as before). */
export function rivalPool(rating: number, exclude: string[] = []): [string, number][] {
  const raw = ROSTER.filter((r) => !exclude.includes(r.name)).map((r) => [rivalId(r), Math.exp(-(((rating - r.rating) / MATCH_WIDTH) ** 2))] as [string, number]).filter(([, w]) => w > 0.02);
  if (!raw.length) {
    const near = [...ROSTER].sort((a, b) => Math.abs(a.rating - rating) - Math.abs(b.rating - rating))[0];
    return [[rivalId(near), 1]];
  }
  const sum = raw.reduce((a, [, w]) => a + w, 0);
  return raw.map(([id, w]) => [id, w / sum]);
}
/**
 * Draws the next rated opponent: a rival of the roster near the player's rating (not one of the last few), with the
 * deck it brings today. `lastScore` tells, per rival name, how the player's last game against it ended.
 */
export function makeOpponent(rating: number, myName: string, recent: string[], rand: () => number = Math.random, lastScore: Record<string, number> = {}): Opponent {
  const pool = rivalPool(rating, [...recent, myName]);
  let x = rand(), id = pool[pool.length - 1][0];
  for (const [k, w] of pool) { if (x < w) { id = k; break; } x -= w; }
  const r = rivalById(id)!;
  const deck = rivalDeck(r, lastScore[r.name] === 1, rand);
  return { ai: id, name: r.name, rating: r.rating, deck, card: rivalCard(deck), title: rivalTitle(r) };
}

// ------------------------------------------------------------------ the player's rated record
export interface RatedGame { at: number; ai: string; score: 0 | 0.5 | 1; before: number; after: number; deck: string; foe: string; foeRating: number }
export interface Rated {
  rating: number;
  games: number;
  wins: number;
  peak: number;
  history: RatedGame[];
  /** Rated wins in a row now, and the longest run so far. */
  streak?: number;
  bestStreak?: number;
  /** The last one-time reset applied (RATING_RESET). */
  reset?: string;
  /** The season these numbers belong to, and this season's best rating, games and wins. */
  season?: number;
  sPeak?: number;
  sGames?: number;
  sWins?: number;
  /** Results of the seasons played, newest first. */
  seasons?: SeasonResult[];
  /** A rated game that was started and not finished yet. If the app is closed mid-game, it counts as a loss. */
  pending: { at: number; ai: string; deck: string; foe: string; foeRating: number } | null;
  /** Results not yet accepted by the ranking server. */
  outbox: SubmitReq[];
}
export const NEW_RATED = (): Rated => ({ rating: START_RATING, games: 0, wins: 0, peak: START_RATING, history: [], pending: null, outbox: [], reset: RATING_RESET });

/** What the client sends to the ranking server for one finished game. */
export interface SubmitReq { gid: string; ai: string; opp?: number; score: 0 | 0.5 | 1; actions: number; ms: number; at: number }

export function startRated(r: Rated, o: Opponent, deck: string, now: number) {
  r.pending = { at: now, ai: o.ai, deck, foe: o.name, foeRating: o.rating };
}
/** Records a finished (or abandoned) game locally. Returns the change for the result screen. */
export function finishRated(r: Rated, score: 0 | 0.5 | 1, actions: number, now: number, gid: string): RatedGame | null {
  const p = r.pending;
  if (!p) return null;
  r.pending = null;
  const before = r.rating;
  const opp = p.foeRating ?? foeById(p.ai)?.rating ?? START_RATING;
  const after = nextRating(before, r.games, opp, score);
  r.rating = after;
  r.games++;
  if (score === 1) r.wins++;
  r.streak = score === 1 ? (r.streak ?? 0) + 1 : 0;
  r.sGames = (r.sGames ?? 0) + 1;
  if (score === 1) r.sWins = (r.sWins ?? 0) + 1;
  r.sPeak = Math.max(r.sPeak ?? after, after);
  r.bestStreak = Math.max(r.bestStreak ?? 0, r.streak);
  r.peak = Math.max(r.peak, after);
  const g: RatedGame = { at: now, ai: p.ai, score, before, after, deck: p.deck, foe: p.foe ?? '', foeRating: opp };
  r.history.unshift(g);
  r.history = r.history.slice(0, 30);
  r.outbox.push({ gid, ai: p.ai, opp, score, actions, ms: now - p.at, at: now });
  return g;
}
