/** Test decks for balance runs that use the 第1弾 cards (not shown in the game). */
import type { DeckDef } from '../core/decks';

const expand = (m: Record<string, number>) => Object.entries(m).flatMap(([k, n]) => Array(n).fill(k) as string[]);

export const PACK_TEST_DECKS: DeckDef[] = [
  { id: 'p_echo', name: '残響', cards: expand({ e_sprite: 2, e_march: 2, e_tuner: 2, e_shot: 2, e_pray: 1, e_twin: 2, e_bellkeeper: 2, e_draw: 1, e_storm: 1, e_atra: 1, e_mage: 1, e_verna: 1, e_eternal: 1, arrow: 1 }) },
  { id: 'p_rush', name: '急襲', cards: expand({ e_page: 2, scout: 2, archer: 2, e_raider: 2, e_blade: 2, gear: 2, e_reverse: 1, haste: 2, arrow: 2, bolt: 2, e_slash: 1 }) },
  { id: 'p_balance', name: '均衡+', cards: expand({ scout: 2, archer: 2, pendulum: 2, e_guard: 1, gear: 2, scribe: 1, lancer: 1, delayer: 1, heavy: 1, dragon: 1, arrow: 1, e_slash: 1, e_break: 1, bolt: 1, collapse: 1, e_draw: 1 }) },
  { id: 'p_titan', name: '城塞+', cards: expand({ pendulum: 2, warden: 2, gear: 2, scribe: 2, e_guard: 1, heavy: 1, e_colossus: 2, breaker: 1, titan: 1, arrow: 1, cage: 2, collapse: 1, e_pray: 2 }) },
  // 第1弾 追加カードの参考構築（0.18.0）
  { id: 'p_archive', name: '記憶の書庫', cards: expand({ x_seer: 2, x_oblivion: 2, x_mirea: 1, x_gust: 2, x_decoy: 2, arrow: 2, collapse: 1, insight: 1, warden: 2, heavy: 2, rewind: 2, e_draw: 1 }) },
  { id: 'p_usurp', name: '簒奪の衛士', cards: expand({ scout: 2, archer: 2, x_sentry: 2, e_guard: 1, x_ram: 2, scribe: 1, lancer: 1, delayer: 1, x_usurper: 1, dragon: 1, arrow: 1, e_slash: 1, e_break: 1, bolt: 1, collapse: 1, e_draw: 1 }) },
];
