/** The player's public face (title, featured card) and deck keys, built from what is stored on the device. */
import { CARD_LIST, cardDef } from '../core/cards';
import type { DeckDef } from '../core/decks';
import { DEFAULT_LOOK, lookById, ownedCount, ownsLook, type LookKind } from '../meta/economy';
import { rankOf } from '../meta/progress';
import { TITLES, earnedTitles, titleById, type TitleCtx, type TitleDef } from '../meta/titles';
import { store } from './storage';

export function titleCtx(): TitleCtx {
  const w = store.wallet, m = store.meta, r = store.rated;
  const kinds = CARD_LIST.filter((c) => ownedCount(w, c.id) > 0).length;
  return {
    wins: store.record.win + store.onlineRecord.win,
    battles: m.battles,
    counters: m.counters,
    loginDays: m.loginDays,
    rank: rankOf(m.exp).rank,
    packs: w.opened,
    collected: CARD_LIST.length ? Math.floor((kinds / CARD_LIST.length) * 100) : 0,
    ownsLegend: CARD_LIST.some((c) => c.rarity === 'L' && (c.set ?? 'base') !== 'base' && (w.owned[c.id] ?? 0) > 0),
    ratedGames: r.games,
    ratedPeak: r.peak,
  };
}
/** Titles earned: those the numbers give now, plus every title earned before (a title once earned is kept). */
export function myTitles(): string[] {
  const now = earnedTitles(titleCtx());
  const m = store.meta;
  const kept = m.titlesEarned ?? [];
  const add = now.filter((t) => !kept.includes(t));
  if (add.length) { m.titlesEarned = [...kept, ...add]; store.saveMeta(); }
  const all = new Set([...kept, ...now]);
  return TITLES.map((t) => t.id).filter((id) => all.has(id));
}
/** The title shown under the name: the chosen one if it is still earned, else the newest earned, else none. */
export function shownTitle(): TitleDef | undefined {
  const got = myTitles();
  if (store.meta.title && got.includes(store.meta.title)) return titleById(store.meta.title);
  if (store.meta.title === '-') return undefined;
  return titleById(got[got.length - 1]);
}
/** Titles earned but not yet seen in the title list. */
export const newTitles = () => myTitles().filter((t) => !store.meta.titlesSeen.includes(t));

/** Card that stands for a deck: the one picked for it, else its rarest, then most expensive card. */
export function deckKey(d: Pick<DeckDef, 'id' | 'cards'>): string {
  const k = store.lookOf(d.id).key;
  if (k && d.cards.includes(k)) return k;
  const R = { C: 0, R: 1, E: 2, L: 3 } as const;
  const ids = [...new Set(d.cards)];
  if (!ids.length) return 'gear';
  return ids.sort((a, b) => R[cardDef(b).rarity] - R[cardDef(a).rarity] || cardDef(b).cost - cardDef(a).cost)[0];
}
/** The look a deck uses (falls back to the default when the chosen one is not owned). */
export function deckLook(deckId: string, kind: LookKind): string {
  const id = store.lookOf(deckId)[kind];
  return id && lookById(id)?.kind === kind && ownsLook(store.wallet, id) ? id : DEFAULT_LOOK[kind];
}
export function favCard(): string {
  const f = store.meta.favorite;
  try { if (f) { cardDef(f); return f; } } catch { /* card removed */ }
  return 'dragon';
}
