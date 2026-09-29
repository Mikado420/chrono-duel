export type CardKind = 'unit' | 'spell';
export type Rarity = 'C' | 'R' | 'L';
export type Keyword = 'taunt' | 'pierce' | 'swift';

/** Ability hooks the engine knows how to run. Kept as ids so card data stays serializable. */
export type UnitHook =
  | 'draw1' | 'revealResv' | 'delayOpp1' | 'bellGrow' | 'breakResv' | 'dawnBurst' | 'echoOnDeath';

export type SpellEffect =
  | 'arrow' | 'cage' | 'bolt' | 'collapse' | 'rewind' | 'haste' | 'insight' | 'stop';

export interface CardDef {
  id: string;
  name: string;
  kind: CardKind;
  rarity: Rarity;
  cost: number;
  atk?: number;
  hp?: number;
  /** Time a unit needs after attacking before it can attack again. */
  reload?: number;
  keywords?: Keyword[];
  hook?: UnitHook;
  effect?: SpellEffect;
  text: string;
  /** Spell text when it fires from a reservation (always stronger). */
  resvText?: string;
  flavor: string;
  /** Emblem shape used by the procedural art. */
  motif: 'gear' | 'hourglass' | 'pendulum' | 'bell' | 'hand' | 'spiral' | 'eye' | 'shield' | 'flame' | 'crown';
}

export const CARDS: Record<string, CardDef> = {
  // ---- units ----------------------------------------------------------
  scout: { id: 'scout', name: '秒針の斥候', kind: 'unit', rarity: 'C', cost: 1, atk: 1, hp: 2, reload: 1, keywords: ['swift'], text: '速攻', flavor: '一秒を刻むたび、一歩前へ。', motif: 'hand' },
  archer: { id: 'archer', name: '早鐘の射手', kind: 'unit', rarity: 'C', cost: 2, atk: 3, hp: 2, reload: 1, text: '', flavor: '鐘より早く、矢は届く。', motif: 'bell' },
  pendulum: { id: 'pendulum', name: '振り子兵', kind: 'unit', rarity: 'C', cost: 2, atk: 2, hp: 3, reload: 2, text: '', flavor: '行って、戻る。それが務め。', motif: 'pendulum' },
  ghost: { id: 'ghost', name: '残響の影', kind: 'unit', rarity: 'C', cost: 2, atk: 2, hp: 3, reload: 2, hook: 'echoOnDeath', text: '破壊されたとき：自分の時計を1戻す。', flavor: '消える音ほど長く残る。', motif: 'spiral' },
  warden: { id: 'warden', name: '砂時計の番人', kind: 'unit', rarity: 'C', cost: 3, atk: 1, hp: 4, reload: 3, keywords: ['taunt'], text: '挑発', flavor: '砂が落ちきるまで、ここは通さぬ。', motif: 'hourglass' },
  gear: { id: 'gear', name: '歯車騎士', kind: 'unit', rarity: 'C', cost: 3, atk: 3, hp: 3, reload: 2, text: '', flavor: '噛み合えば、止まらない。', motif: 'gear' },
  scribe: { id: 'scribe', name: '刻の記録係', kind: 'unit', rarity: 'R', cost: 3, atk: 2, hp: 3, reload: 2, hook: 'draw1', text: '登場時：カードを1枚引く。', flavor: '全ての瞬間は、書き留められる。', motif: 'eye' },
  oracle: { id: 'oracle', name: '予見の巫女', kind: 'unit', rarity: 'R', cost: 3, atk: 3, hp: 3, reload: 2, hook: 'revealResv', text: '登場時：相手の予約を全て公開する。', flavor: 'あなたの明日は、もう見えている。', motif: 'eye' },
  lancer: { id: 'lancer', name: '突撃槍兵', kind: 'unit', rarity: 'R', cost: 4, atk: 4, hp: 4, reload: 2, keywords: ['pierce'], text: '貫通', flavor: '盾ごと、時間ごと貫く。', motif: 'flame' },
  delayer: { id: 'delayer', name: '遅延術師', kind: 'unit', rarity: 'R', cost: 4, atk: 3, hp: 4, reload: 2, hook: 'delayOpp1', text: '登場時：相手の時計を1進める。', flavor: '少しだけ、待っていてもらおう。', motif: 'spiral' },
  sentinel: { id: 'sentinel', name: '鐘楼の歩哨', kind: 'unit', rarity: 'R', cost: 4, atk: 2, hp: 5, reload: 2, hook: 'bellGrow', text: '自分の鐘が鳴るたび、攻撃+1・体力+1。', flavor: '鐘の数だけ強くなる。', motif: 'bell' },
  heavy: { id: 'heavy', name: '刻の重装兵', kind: 'unit', rarity: 'C', cost: 5, atk: 5, hp: 5, reload: 3, text: '', flavor: '重い一歩は、戻らない。', motif: 'shield' },
  breaker: { id: 'breaker', name: '刻壊し', kind: 'unit', rarity: 'R', cost: 5, atk: 4, hp: 5, reload: 2, hook: 'breakResv', text: '登場時：相手の最も近い予約を1つ破棄する。', flavor: '約束された未来など、ない。', motif: 'gear' },
  dragon: { id: 'dragon', name: '夜明けの竜', kind: 'unit', rarity: 'L', cost: 7, atk: 5, hp: 5, reload: 3, hook: 'dawnBurst', text: '登場時：敵ユニット全てに2ダメージ。', flavor: '夜が明ける。それは終わりの合図。', motif: 'flame' },
  titan: { id: 'titan', name: '永劫の巨像', kind: 'unit', rarity: 'L', cost: 9, atk: 6, hp: 8, reload: 4, keywords: ['taunt', 'pierce'], text: '挑発・貫通', flavor: '時が止まっても、それは立っている。', motif: 'crown' },
  // ---- spells ---------------------------------------------------------
  arrow: { id: 'arrow', name: '時の矢', kind: 'spell', rarity: 'C', cost: 2, effect: 'arrow', text: '攻撃力が最も高い敵ユニットに3ダメージ。いなければ敵拠点に2。', resvText: '4ダメージ（拠点なら3）。', flavor: '放たれた矢は、戻らない。', motif: 'hand' },
  cage: { id: 'cage', name: '停滞の檻', kind: 'spell', rarity: 'C', cost: 1, effect: 'cage', text: '攻撃力が最も高い敵ユニットの準備を4刻遅らせる。', resvText: '6刻遅らせる。', flavor: 'その一瞬を、永遠に。', motif: 'hourglass' },
  bolt: { id: 'bolt', name: '刻印の雷', kind: 'spell', rarity: 'R', cost: 3, effect: 'bolt', text: '敵拠点に4ダメージ。', resvText: '敵拠点に5ダメージ。', flavor: '刻まれた時刻に、雷は落ちる。', motif: 'flame' },
  collapse: { id: 'collapse', name: '崩落の刻', kind: 'spell', rarity: 'R', cost: 3, effect: 'collapse', text: '敵ユニット全てに2ダメージ。', resvText: '全てに3ダメージ。', flavor: '時計塔が崩れる音がした。', motif: 'gear' },
  rewind: { id: 'rewind', name: '巻き戻し', kind: 'spell', rarity: 'C', cost: 2, effect: 'rewind', text: '自拠点を3回復し、カードを1枚引く。', resvText: '4回復し、2枚引く。', flavor: '少しだけ、昨日へ。', motif: 'spiral' },
  haste: { id: 'haste', name: '加速', kind: 'spell', rarity: 'C', cost: 1, effect: 'haste', text: '自分のユニット全てを準備完了にし、攻撃+1。', resvText: '攻撃+2。', flavor: '針よ、走れ。', motif: 'hand' },
  insight: { id: 'insight', name: '未来視', kind: 'spell', rarity: 'C', cost: 2, effect: 'insight', text: 'カードを2枚引く。', resvText: '3枚引く。', flavor: '先に見た者が、先に動く。', motif: 'eye' },
  stop: { id: 'stop', name: '時間停止', kind: 'spell', rarity: 'L', cost: 2, effect: 'stop', text: '相手の時計を3進める。', resvText: '相手の時計を4進める。', flavor: '世界が止まる。あなた以外の。', motif: 'crown' },
};

export const CARD_LIST = Object.values(CARDS);
export const cardDef = (id: string): CardDef => {
  const c = CARDS[id];
  if (!c) throw new Error(`unknown card ${id}`);
  return c;
};
