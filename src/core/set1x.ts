/**
 * 第1弾「残響の刻」の追加カード（8枚：通常3・希少3・秘宝1・伝説1）。1枚ごとに今のカードプールにない役割を1つ持つ。
 *
 * NOT IN THE GAME YET. Balance tools call `registerSet1x()` (`npm run balance -- set1x --set1x`).
 * To release: call `registerSet1x()` at start-up (or move these entries into CARDS); they join the 第1弾 pack.
 */
import { CARDS, CARD_LIST, type CardDef } from './cards';

type Def = Omit<CardDef, 'id' | 'set'>;
const DEFS: Record<string, Def> = {
  x_ram: { name: '城崩しの槌兵', kind: 'unit', rarity: 'C', cost: 3, atk: 2, hp: 3, reload: 2, hook: 'tauntBreaker', text: '挑発を持つユニットを攻撃するとき、攻撃+3。', flavor: '門は、叩くためにある。', motif: 'flame' },
  x_sentry: { name: '時計塔の衛士', kind: 'unit', rarity: 'C', cost: 3, atk: 1, hp: 4, reload: 2, keywords: ['taunt'], hook: 'oppResonateAtk', text: '挑発。相手の予約か残響が発動するたび、攻撃+1（最大+5）。', flavor: '敵の鐘の音を、数えている。', motif: 'shield' },
  x_gust: { name: '送り返しの風', kind: 'spell', rarity: 'C', cost: 3, effect: 'xGust', text: '攻撃力が最も高い敵ユニットを持ち主の手札に戻す（手札がいっぱいなら失われる）。', resvText: 'さらにカードを1枚引く。', flavor: '来た道を、もう一度。', motif: 'wave' },
  x_oblivion: { name: '忘却の砂', kind: 'spell', rarity: 'R', cost: 1, effect: 'xOblivion', text: '相手は手札を1枚選んで捨てる。', resvText: 'さらにカードを1枚引く。', flavor: '思い出せないなら、なかったのと同じ。', motif: 'hourglass' },
  x_seer: { name: '星読みの占者', kind: 'unit', rarity: 'R', cost: 2, atk: 1, hp: 3, reload: 2, hook: 'seer', text: '登場時：山札の上3枚を見て1枚を選んで手札に加え、残りを山札の下に置く。', flavor: '明日の星は、もう見えている。', motif: 'eye' },
  x_decoy: { name: '囮の書', kind: 'spell', rarity: 'R', cost: 2, effect: 'xDecoy', text: '4刻後に発動する偽の予約を1つ置く（相手からは本物と区別できず、発動しても何も起きない。予約枠を使わない）。カードを1枚引く。', resvText: 'さらにカードを1枚引く。', flavor: 'どれが本物か、当ててごらん。', motif: 'spiral' },
  x_usurper: { name: '時の簒奪者', kind: 'unit', rarity: 'E', cost: 5, atk: 3, hp: 4, reload: 3, hook: 'stealResv', text: '登場時：相手の最も早い予約か残響を1つ奪い、自分のものにする。奪った予約は1刻早く発動する。', flavor: 'その時間は、私が使う。', motif: 'pendulum' },
  x_mirea: { name: '記憶の司書ミレア', kind: 'unit', rarity: 'L', cost: 5, atk: 3, hp: 5, reload: 3, hook: 'recall', text: '登場時：このゲームで自分が使った呪文（伝説を除く）を1枚選び、コストを払わずに使う。', flavor: '書かれたことは、何度でも読める。', motif: 'crown' },
};
export const SET1X: Record<string, CardDef> = Object.fromEntries(Object.entries(DEFS).map(([id, d]) => [id, { ...d, id, set: 'echo' } as CardDef]));
let registered = false;
export function registerSet1x() {
  if (registered) return;
  registered = true;
  for (const [id, c] of Object.entries(SET1X)) { CARDS[id] = c; CARD_LIST.push(c); }
}
