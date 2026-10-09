/**
 * Ranks and seasons of rated play. No imports, so the title list, the rating rules and the server can all use it.
 */
export interface Tier { id: string; name: string; min: number; color: string }
/** Ranks of rated play, every 200 from 1000 (everything below 1200, the start included, is 見習い). Colours follow the 称号 grades. */
export const TIERS: Tier[] = [
  { id: 'novice', name: '見習い', min: 0, color: '#8fd96a' },
  { id: 'shi', name: '刻士', min: 1200, color: '#6aa8ff' },
  { id: 'sho', name: '刻匠', min: 1400, color: '#d08a4e' },
  { id: 'go', name: '刻豪', min: 1600, color: '#d6dde4' },
  { id: 'sei', name: '刻聖', min: 1800, color: '#ffcf4a' },
  { id: 'shin', name: '刻神', min: 2000, color: '#ff4a4a' },
];

/**
 * Seasons: one per card set. A season starts on the day its set is released (Japan time) and ends when the next
 * one starts; add an entry with the release day when a new set is shipped.
 */
export interface Season { id: number; name: string; set: string; start: string }
export const SEASONS: Season[] = [
  { id: 1, name: '第1季', set: '第1弾「残響の刻」', start: '2026-10-09' },
];
/** The day in Japan time (the players' day). */
export const jstDay = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
/** The season running on `day` (YYYY-MM-DD, Japan time). */
export function seasonAt(day: string): Season {
  let cur = SEASONS[0];
  for (const s of SEASONS) if (s.start <= day) cur = s;
  return cur;
}
export const seasonById = (id: number) => SEASONS.find((s) => s.id === id);
