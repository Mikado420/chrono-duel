/** The player's public face (title, featured card) and deck keys, built from what is stored on the device. */
import { CARD_LIST, cardDef } from '../core/cards';
import type { DeckDef } from '../core/decks';
import { DEFAULT_LOOK, LOOKS, THEMES, lookById, ownsLook, setProgress, type LookKind } from '../meta/economy';
import { RENAMED_TITLES, TITLES, earnedTitles, titleById, type TitleCtx, type TitleDef } from '../meta/titles';
import { store } from './storage';

export function titleCtx(): TitleCtx {
  const w = store.wallet, m = store.meta, r = store.rated;
  const set1 = setProgress(w, 'echo');
  return {
    wins: store.record.win + store.onlineRecord.win,
    battles: m.battles,
    counters: m.counters,
    loginDays: m.loginDays,
    packs: w.opened,
    ownsLegend: CARD_LIST.some((c) => c.rarity === 'L' && (c.set ?? 'base') !== 'base' && (w.owned[c.id] ?? 0) > 0),
    set1Complete: set1.kindsTotal > 0 && set1.kinds >= set1.kindsTotal,
    themesComplete: THEMES.filter((t) => LOOKS.filter((l) => l.theme === t.id).every((l) => ownsLook(w, l.id))).length,
    ratedGames: r.games,
    ratedPeak: r.peak,
    ratedStreak: r.bestStreak ?? 0,
    seasonTiers: Object.fromEntries((r.seasons ?? []).map((x) => [x.season, x.tier])),
  };
}
/** Titles earned: those the numbers give now, plus every title earned before (a title once earned is kept). */
export function myTitles(): string[] {
  const now = earnedTitles(titleCtx());
  const m = store.meta;
  // titles of the first list: renamed ones move to their new id, retired ones are dropped
  const valid = new Set(TITLES.map((t) => t.id));
  const before = m.titlesEarned ?? [];
  const moved = [...new Set(before.map((id) => RENAMED_TITLES[id] ?? id).filter((id) => valid.has(id)))];
  if (moved.length !== before.length || moved.some((id, i) => id !== before[i])) { m.titlesEarned = moved; store.saveMeta(); }
  if (m.title && m.title !== '-' && !valid.has(m.title)) { m.title = RENAMED_TITLES[m.title] && valid.has(RENAMED_TITLES[m.title]) ? RENAMED_TITLES[m.title] : ''; store.saveMeta(); }
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
