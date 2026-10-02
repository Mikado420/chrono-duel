/**
 * The decks of the current environment, for the wiki's deck ranking and `npm run meta`: the starter decks, the
 * reference builds with 第1弾, the decks players actually use (ヴェルナループ…) and fun decks.
 */
import { PRESET_DECKS } from '../core/decks';
import { PACK_TEST_DECKS } from './packDecks';

const ex = (o: Record<string, number>) => Object.entries(o).flatMap(([k, n]) => Array(n).fill(k) as string[]);
const P = (id: string) => [...PRESET_DECKS, ...PACK_TEST_DECKS].find((d) => d.id === id)!.cards;
export type MetaKind = 'player' | 'preset' | 'reference' | 'fun';
export const META_KIND_NAME: Record<MetaKind, string> = { player: '環境デッキ', preset: '基本デッキ', reference: '参考構築', fun: 'ファンデッキ' };
export interface MetaDeck { id: string; name: string; kind: MetaKind; cards: string[] }

export const META_DECKS: MetaDeck[] = [
  { id: 'verna', name: 'ヴェルナループ', kind: 'player', cards: ex({ rewind: 2, e_sprite: 2, e_verna: 1, e_peek: 2, e_reverse: 2, stop: 1, e_eternal: 1, e_draw: 2, e_pray: 2, cage: 1, e_storm: 1, ghost: 1, e_colossus: 1, titan: 1 }) },
  { id: 'p_rush', name: '急襲', kind: 'reference', cards: P('p_rush') },
  { id: 'antiv', name: '急襲D型（対ヴェルナ）', kind: 'player', cards: ex({ e_page: 2, archer: 2, e_raider: 2, e_blade: 2, e_peek: 2, e_break: 2, e_reverse: 2, haste: 2, arrow: 2, bolt: 2 }) },
  { id: 'rush', name: '秒針突撃', kind: 'preset', cards: P('rush') },
  { id: 'balance', name: '均衡の刻', kind: 'preset', cards: P('balance') },
  { id: 'p_balance', name: '均衡+', kind: 'reference', cards: P('p_balance') },
  { id: 'titan', name: '永劫の城塞', kind: 'preset', cards: P('titan') },
  { id: 'p_titan', name: '城塞+', kind: 'reference', cards: P('p_titan') },
  { id: 'p_echo', name: '残響', kind: 'reference', cards: P('p_echo') },
  { id: 'oracle', name: PRESET_DECKS[3].name, kind: 'preset', cards: PRESET_DECKS[3].cards },
  { id: 'reso', name: '共鳴サーカス', kind: 'fun', cards: ex({ e_tuner: 2, e_bellkeeper: 2, e_verna: 1, e_mage: 1, e_sprite: 2, e_shot: 2, e_draw: 2, e_pray: 2, e_peek: 2, e_storm: 1, e_eternal: 1, e_twin: 2 }) },
  { id: 'lock', name: '時間牢獄', kind: 'fun', cards: ex({ delayer: 2, e_reverse: 2, stop: 1, cage: 2, warden: 2, e_guard: 2, sentinel: 1, rewind: 2, bolt: 2, e_peek: 2, collapse: 1, arrow: 1 }) },
  { id: 'charge', name: '巨兵充填', kind: 'fun', cards: ex({ e_colossus: 2, e_blade: 2, e_slash: 2, warden: 2, pendulum: 2, e_guard: 2, heavy: 1, titan: 1, rewind: 2, e_pray: 2, insight: 1, cage: 1 }) },
  { id: 'burn', name: '籠城バーン', kind: 'fun', cards: ex({ bolt: 2, e_eternal: 1, arrow: 2, e_shot: 2, e_sprite: 2, e_slash: 2, warden: 2, e_guard: 2, rewind: 2, e_pray: 2, stop: 1 }) },
  { id: 'control', name: '破約コントロール', kind: 'fun', cards: ex({ breaker: 1, e_break: 2, e_peek: 2, collapse: 1, e_storm: 1, e_atra: 1, dragon: 1, heavy: 2, lancer: 2, sentinel: 1, arrow: 2, e_shot: 2, rewind: 2 }) },
  { id: 'shadow', name: '影法師の群れ', kind: 'fun', cards: ex({ ghost: 2, e_twin: 2, e_march: 2, e_page: 2, scout: 2, e_sprite: 2, haste: 2, e_mage: 1, e_reverse: 2, e_draw: 2, e_eternal: 1 }) },
];
