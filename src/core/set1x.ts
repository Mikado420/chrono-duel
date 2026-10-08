/**
 * 第1弾「残響の刻」の追加カード（8枚）。0.18.0 でゲームに入り、定義は cards.ts に移った（第1弾のパックに入る）。
 * Kept for the balance tools: `SET1X` lists the added cards, `registerSet1x()` does nothing any more.
 */
import { CARDS, type CardDef } from './cards';

export const SET1X_IDS = ['x_ram', 'x_sentry', 'x_gust', 'x_oblivion', 'x_seer', 'x_decoy', 'x_usurper', 'x_mirea'] as const;
export const SET1X: Record<string, CardDef> = Object.fromEntries(SET1X_IDS.map((id) => [id, CARDS[id]]));
export function registerSet1x() { /* in the card pool since 0.18.0 */ }
