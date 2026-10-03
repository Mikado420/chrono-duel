/**
 * 第1弾「残響の刻」の追加カード（8枚：通常3・希少3・秘宝1・伝説1）。各デッキの軸を強めるためのカード。
 *
 * NOT IN THE GAME YET. Balance tools call `registerSet1x()` (`npm run balance -- set1x --set1x`).
 * To release: call `registerSet1x()` at start-up (or move these entries into CARDS); they join the 第1弾 pack.
 */
import { CARDS, CARD_LIST, type CardDef } from './cards';

type Def = Omit<CardDef, 'id' | 'set'>;
const DEFS: Record<string, Def> = {
  x_striker: { name: '連刻の剣士', kind: 'unit', rarity: 'C', cost: 2, atk: 1, hp: 2, reload: 1, rush: 1, hook: 'baseGrow', text: '急襲1。敵拠点にダメージを与えるたび、攻撃+1。', flavor: '一太刀ごとに、腕が覚える。', motif: 'flame' },
  x_formation: { name: '陣形の時計番', kind: 'unit', rarity: 'C', cost: 3, atk: 2, hp: 3, reload: 2, hook: 'formation', text: '自分のユニットが3体並んでいるとき、攻撃+2。', flavor: '針が揃えば、時は進む。', motif: 'pendulum' },
  x_sentry: { name: '時計塔の衛士', kind: 'unit', rarity: 'C', cost: 3, atk: 1, hp: 4, reload: 2, keywords: ['taunt'], hook: 'oppResonateAtk', text: '挑発。相手の予約か残響が発動するたび、攻撃+1。', flavor: '敵の鐘の音を、数えている。', motif: 'shield' },
  x_foresee: { name: '先読みの書', kind: 'spell', rarity: 'R', cost: 1, effect: 'xForesee', text: '相手の予約を全て公開し、最も早い予約を1つ相手の手札に戻す（払った刻は戻らない）。', resvText: 'さらにカードを1枚引く。', flavor: 'その頁は、もう読んだ。', motif: 'eye' },
  x_hoarder: { name: '溜め込む砂時計', kind: 'unit', rarity: 'R', cost: 2, atk: 1, hp: 3, reload: 2, hook: 'chargeGrow', text: '自分が充填で刻を多く払うたび、攻撃+1・体力+1。', flavor: '落ちた砂は、捨てずに取っておく。', motif: 'hourglass' },
  x_ember: { name: '残り火の兵', kind: 'unit', rarity: 'R', cost: 2, atk: 2, hp: 1, reload: 2, hook: 'emberClock', text: '破壊されたとき：相手の時計を1進める。', flavor: '消えたあとも、熱だけが残る。', motif: 'flame' },
  x_band: { name: 'こだまの楽団長', kind: 'unit', rarity: 'E', cost: 4, atk: 2, hp: 4, reload: 2, hook: 'echoBand', text: '登場時：自分の他の残響を持つユニット1体につき、攻撃+1・体力+1。', flavor: '一人では鳴らせない和音がある。', motif: 'wave' },
  x_ordo: { name: '刻守の将オルド', kind: 'unit', rarity: 'L', cost: 5, atk: 4, hp: 5, reload: 3, hook: 'ordoReady', text: '自分の他のユニットが攻撃したあと、そのユニットの準備を1刻早める。', flavor: '号令は一度。兵は何度でも。', motif: 'crown' },
};
export const SET1X: Record<string, CardDef> = Object.fromEntries(Object.entries(DEFS).map(([id, d]) => [id, { ...d, id, set: 'echo' } as CardDef]));
let registered = false;
export function registerSet1x() {
  if (registered) return;
  registered = true;
  for (const [id, c] of Object.entries(SET1X)) { CARDS[id] = c; CARD_LIST.push(c); }
}
