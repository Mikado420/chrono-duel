/**
 * Ranks and seasons of rated play. No imports, so the title list, the rating rules and the server can all use it.
 */
export interface Tier { id: string; name: string; min: number; color: string }
/**
 * Ranks of rated play, every 200 from 1000 (everything below 1200, the start included, is 見習い); 刻神 has five steps
 * of 100 (Ⅰ〜Ⅱ against Lv10, Ⅲ〜Ⅳ against Lv11, Ⅴ against Lv12). Colours follow the 称号 grades.
 * Ids are stored in records and titles ('shin' is 刻神Ⅰ, the 刻神 of before the steps): never rename one.
 */
export const TIERS: Tier[] = [
  { id: 'novice', name: '見習い', min: 0, color: '#8fd96a' },
  { id: 'shi', name: '刻士', min: 1200, color: '#6aa8ff' },
  { id: 'sho', name: '刻匠', min: 1400, color: '#d08a4e' },
  { id: 'go', name: '刻豪', min: 1600, color: '#d6dde4' },
  { id: 'sei', name: '刻聖', min: 1800, color: '#ffcf4a' },
  { id: 'shin', name: '刻神Ⅰ', min: 2000, color: '#ff4a4a' },
  { id: 'shin2', name: '刻神Ⅱ', min: 2100, color: '#ff4a4a' },
  { id: 'shin3', name: '刻神Ⅲ', min: 2200, color: '#ff4a4a' },
  { id: 'shin4', name: '刻神Ⅳ', min: 2300, color: '#ff4a4a' },
  { id: 'shin5', name: '刻神Ⅴ', min: 2400, color: '#ff4a4a' },
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
/** What each rank pays at the end of a season (the rank of the season's peak). */
export const SEASON_REWARDS: Record<string, { coins: number; tickets: number }> = {
  novice: { coins: 100, tickets: 0 }, shi: { coins: 200, tickets: 1 }, sho: { coins: 300, tickets: 2 },
  go: { coins: 400, tickets: 3 }, sei: { coins: 500, tickets: 4 }, shin: { coins: 800, tickets: 5 },
  shin2: { coins: 900, tickets: 5 }, shin3: { coins: 1000, tickets: 6 }, shin4: { coins: 1100, tickets: 6 }, shin5: { coins: 1200, tickets: 7 },
};
/** 刻神 and its steps. */
export const isShin = (tierId: string) => tierId.startsWith('shin');
/** The rival Lv a player of this rating meets from 刻神 up (null below 刻神). */
export const shinLv = (rating: number): number | null => (rating >= 2400 ? 12 : rating >= 2200 ? 11 : rating >= 2000 ? 10 : null);
export const seasonById = (id: number) => SEASONS.find((s) => s.id === id);
