/**
 * AIのデッキ帳: the rivals' lists as the daily tools improve them, handed out by the server (POST /api/decks).
 * The game checks every list against its 設計図 before using it and falls back to the built-in list otherwise,
 * so a bad book can never put a broken or off-plan deck in front of a player.
 */
import { checkList, originList } from './blueprints';

export interface BookEntry {
  /** Version of this archetype's list (1 = the built-in list). */
  v: number;
  cards: string[];
  /** A new version on trial: used in `share` of the games (by game id), the rest keep `cards`. */
  trial?: { v: number; cards: string[]; share: number; since?: number };
}
/**
 * `decks` is keyed by archetype for the lists of Lv8–10 (improved for strength), and archetype + '~lo' for Lv1–7
 * (changed for variety only, kept as strong as before). Version numbers are unique across the whole book, so a
 * game report's (archetype, version) always names one list.
 */
export interface DeckBook { version: number; at: number; decks: Record<string, BookEntry> }
/** The book key for a rival of Lv `lv` playing archetype `id`. */
export const bookKey = (id: string, lv: number) => (lv >= 8 ? id : `${id}~lo`);
/** The archetype a book key is for. */
export const archeOf = (key: string) => key.replace(/~lo$/, '');
export const EMPTY_BOOK: DeckBook = { version: 0, at: 0, decks: {} };

/** The book with every entry that fails its checks removed (a bad trial is dropped on its own). */
export function cleanBook(raw: unknown): DeckBook {
  const b = raw as Partial<DeckBook> | null;
  if (!b || typeof b !== 'object' || typeof b.version !== 'number' || typeof b.decks !== 'object' || !b.decks) return EMPTY_BOOK;
  const decks: Record<string, BookEntry> = {};
  for (const [id, e] of Object.entries(b.decks as Record<string, Partial<BookEntry>>)) {
    if (!e || typeof e.v !== 'number' || !Array.isArray(e.cards) || checkList(archeOf(id), e.cards as string[]).length) continue;
    const t = e.trial;
    const trialOk = t && typeof t.v === 'number' && Array.isArray(t.cards) && typeof t.share === 'number' && t.share > 0 && t.share <= 1 && !checkList(archeOf(id), t.cards).length;
    decks[id] = { v: e.v, cards: (e.cards as string[]).slice(), ...(trialOk ? { trial: { v: t!.v, cards: t!.cards.slice(), share: t!.share, ...(typeof t!.since === 'number' ? { since: t!.since } : {}) } } : {}) };
  }
  return { version: b.version, at: typeof b.at === 'number' ? b.at : 0, decks };
}

/** Small stable hash of a game id, in [0, 1). */
const unit = (s: string) => { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619) >>> 0; } return h / 2 ** 32; };
/**
 * The list a rival plays for book key `key` (see bookKey) in game `gid`, and its version: the trial in its share of
 * games, else the book's list, else the built-in one (version 1). Decks without a 設計図 always use their built-in list.
 */
export function listFor(book: DeckBook, key: string, gid: string, builtIn: string[]): { cards: string[]; v: number } {
  const e = book.decks[key];
  if (!e || !originList(archeOf(key))) return { cards: builtIn, v: 1 };
  if (e.trial && unit(gid + ':' + key) < e.trial.share) return { cards: e.trial.cards, v: e.trial.v };
  return { cards: e.cards, v: e.v };
}
