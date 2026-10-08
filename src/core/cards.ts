export type CardKind = 'unit' | 'spell';
/** C 通常, R 希少, E 秘宝, L 伝説 */
export type Rarity = 'C' | 'R' | 'E' | 'L';
export type Keyword = 'taunt' | 'pierce' | 'swift' | 'shift';
/** 鐘鳴: what a unit does each time its owner's clock passes a bell. */
export type BellEffect = 'grow' | 'shot2' | 'draw1' | 'ready'
  // 第2弾
  | 'shot1' | 'heal2' | 'hp2' | 'storm1' | 'blessAll' | 'blessOthers' | 'gearShift' | 'oppClock1';
/** Card sets. `base` is owned by everyone; later sets come from packs. */
export type CardSet = 'base' | 'echo' | 'gear';
export const SET_NAMES: Record<CardSet, string> = { base: '基本', echo: '第1弾「残響の刻」', gear: '第2弾「歯車の迷宮」' };
export const RARITY_NAMES: Record<Rarity, string> = { C: '通常', R: '希少', E: '秘宝', L: '伝説' };

/** Effects that an echo (a delayed, weaker repeat) can carry. */
export type EchoEffect = 'ping1' | 'ping2' | 'shot1' | 'heal2' | 'heal3' | 'draw1' | 'rally' | 'image' | 'storm1' | 'overdrive';

/** Ability hooks the engine knows how to run. Kept as ids so card data stays serializable. */
export type UnitHook =
  | 'draw1' | 'revealResv' | 'delayOpp1' | 'breakResv' | 'dawnBurst' | 'echoOnDeath'
  // 第1弾
  | 'resonateAtk' | 'resonatePing' | 'resonateRewind' | 'hasten2' | 'storm1'
  // 第2弾: on summon
  | 'readyAlly' | 'stunTop3' | 'ringAll' | 'dolls'
  // 第2弾: when this unit moves (転移), on its attacks, or while it is on the board
  | 'shiftGrow' | 'shiftPing' | 'shiftHaste' | 'flank' | 'bellDraw' | 'shiftAura'
  // 第1弾 追加
  | 'baseGrow' | 'formation' | 'oppResonateAtk' | 'chargeGrow' | 'emberClock' | 'echoBand' | 'ordoReady'
  | 'tauntBreaker' | 'seer' | 'stealResv' | 'recall';

export type SpellEffect =
  | 'arrow' | 'cage' | 'bolt' | 'collapse' | 'rewind' | 'haste' | 'insight' | 'stop'
  // 第1弾
  | 'eShot' | 'ePray' | 'eSlash' | 'ePeek' | 'eBreak' | 'eDraw' | 'eReverse' | 'eStorm' | 'eEternal'
  // 第2弾
  | 'gSpanner' | 'gReroute' | 'gTrap' | 'gBlueprint' | 'gFortify' | 'gHammer' | 'gHush' | 'gRally' | 'gRing' | 'gSilence'
  | 'gMaze' | 'gTune' | 'gGearstorm' | 'gMirror' | 'gLever' | 'gRewire' | 'gQuake' | 'gErase' | 'gOverdrive'
  // 第1弾 追加
  | 'xForesee' | 'xGust' | 'xOblivion' | 'xDecoy';

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
  /** 鐘鳴 */
  bell?: BellEffect;
  hook?: UnitHook;
  effect?: SpellEffect;
  text: string;
  /** Spell text when it fires from a reservation (always stronger). */
  resvText?: string;
  flavor: string;
  /** Defaults to 'base'. */
  set?: CardSet;
  /** Not collectible: only created by other cards. */
  token?: boolean;
  /** 残響: repeats a weaker effect this many ticks after it resolves. */
  echo?: { delay: number; effect: EchoEffect }[];
  /** 急襲: costs this much less (minimum 1) when your clock is 2 or more behind the opponent's. */
  rush?: number;
  /** 充填: you may pay up to this many extra ticks for a bigger effect (only when used right away). */
  charge?: number;
  /** Emblem shape used by the procedural art. */
  motif: 'gear' | 'hourglass' | 'pendulum' | 'bell' | 'hand' | 'spiral' | 'eye' | 'shield' | 'flame' | 'crown' | 'wave';
}

export const CARDS: Record<string, CardDef> = {
  // ---- units ----------------------------------------------------------
  scout: { id: 'scout', name: '秒針の斥候', kind: 'unit', rarity: 'C', cost: 1, atk: 1, hp: 2, reload: 1, keywords: ['swift'], text: '速攻', flavor: '一秒を刻むたび、一歩前へ。', motif: 'hand' },
  archer: { id: 'archer', name: '早鐘の射手', kind: 'unit', rarity: 'C', cost: 2, atk: 3, hp: 2, reload: 1, text: '', flavor: '鐘より早く、矢は届く。', motif: 'bell' },
  pendulum: { id: 'pendulum', name: '振り子兵', kind: 'unit', rarity: 'C', cost: 2, atk: 2, hp: 3, reload: 2, text: '', flavor: '行って、戻る。それが務め。', motif: 'pendulum' },
  ghost: { id: 'ghost', name: '残響の影', kind: 'unit', rarity: 'C', cost: 2, atk: 2, hp: 3, reload: 2, hook: 'echoOnDeath', text: '破壊されたとき：自分の時計を1戻す。', flavor: '消える音ほど長く残る。', motif: 'spiral' },
  warden: { id: 'warden', name: '砂時計の番人', kind: 'unit', rarity: 'C', cost: 2, atk: 1, hp: 4, reload: 3, keywords: ['taunt'], text: '挑発', flavor: '砂が落ちきるまで、ここは通さぬ。', motif: 'hourglass' },
  gear: { id: 'gear', name: '歯車騎士', kind: 'unit', rarity: 'C', cost: 3, atk: 3, hp: 3, reload: 2, text: '', flavor: '噛み合えば、止まらない。', motif: 'gear' },
  scribe: { id: 'scribe', name: '刻の記録係', kind: 'unit', rarity: 'R', cost: 3, atk: 2, hp: 3, reload: 2, hook: 'draw1', text: '登場時：カードを1枚引く。', flavor: '全ての瞬間は、書き留められる。', motif: 'eye' },
  oracle: { id: 'oracle', name: '予見の巫女', kind: 'unit', rarity: 'R', cost: 3, atk: 3, hp: 3, reload: 2, hook: 'revealResv', text: '登場時：相手の予約を全て公開する。', flavor: 'あなたの明日は、もう見えている。', motif: 'eye' },
  lancer: { id: 'lancer', name: '突撃槍兵', kind: 'unit', rarity: 'R', cost: 4, atk: 4, hp: 4, reload: 2, keywords: ['pierce'], text: '貫通', flavor: '盾ごと、時間ごと貫く。', motif: 'flame' },
  delayer: { id: 'delayer', name: '遅延術師', kind: 'unit', rarity: 'R', cost: 4, atk: 3, hp: 4, reload: 2, hook: 'delayOpp1', text: '登場時：相手の時計を1進める。', flavor: '少しだけ、待っていてもらおう。', motif: 'spiral' },
  sentinel: { id: 'sentinel', name: '鐘楼の歩哨', kind: 'unit', rarity: 'R', cost: 4, atk: 2, hp: 5, reload: 2, bell: 'grow', text: '鐘鳴：攻撃+1・体力+1。', flavor: '鐘の数だけ強くなる。', motif: 'bell' },
  heavy: { id: 'heavy', name: '刻の重装兵', kind: 'unit', rarity: 'C', cost: 5, atk: 5, hp: 5, reload: 3, text: '', flavor: '重い一歩は、戻らない。', motif: 'shield' },
  breaker: { id: 'breaker', name: '刻壊し', kind: 'unit', rarity: 'R', cost: 5, atk: 4, hp: 5, reload: 2, hook: 'breakResv', text: '登場時：相手の最も近い予約を1つ破棄する。', flavor: '約束された未来など、ない。', motif: 'gear' },
  dragon: { id: 'dragon', name: '夜明けの竜', kind: 'unit', rarity: 'L', cost: 7, atk: 5, hp: 5, reload: 3, hook: 'dawnBurst', text: '登場時：敵ユニット全てに2ダメージ。', flavor: '夜が明ける。それは終わりの合図。', motif: 'flame' },
  titan: { id: 'titan', name: '永劫の巨像', kind: 'unit', rarity: 'L', cost: 9, atk: 6, hp: 8, reload: 4, keywords: ['taunt', 'pierce'], text: '挑発・貫通', flavor: '時が止まっても、それは立っている。', motif: 'crown' },
  // ---- spells ---------------------------------------------------------
  arrow: { id: 'arrow', name: '時の矢', kind: 'spell', rarity: 'C', cost: 2, effect: 'arrow', text: '攻撃力が最も高い敵ユニットに3ダメージ。いなければ敵拠点に2。', resvText: '4ダメージ（拠点なら3）。', flavor: '放たれた矢は、戻らない。', motif: 'hand' },
  cage: { id: 'cage', name: '停滞の檻', kind: 'spell', rarity: 'C', cost: 1, effect: 'cage', text: '攻撃力が最も高い敵ユニットの準備を6刻遅らせる。', resvText: '8刻遅らせる。', flavor: 'その一瞬を、永遠に。', motif: 'hourglass' },
  bolt: { id: 'bolt', name: '刻印の雷', kind: 'spell', rarity: 'R', cost: 2, effect: 'bolt', text: '敵拠点に4ダメージ。', resvText: '敵拠点に5ダメージ。', flavor: '刻まれた時刻に、雷は落ちる。', motif: 'flame' },
  collapse: { id: 'collapse', name: '崩落の刻', kind: 'spell', rarity: 'R', cost: 4, effect: 'collapse', text: '敵ユニット全てに2ダメージ。', resvText: '全てに3ダメージ。', flavor: '時計塔が崩れる音がした。', motif: 'gear' },
  rewind: { id: 'rewind', name: '巻き戻し', kind: 'spell', rarity: 'C', cost: 2, effect: 'rewind', text: '自拠点を3回復し、カードを1枚引く。', resvText: '4回復し、2枚引く。', flavor: '少しだけ、昨日へ。', motif: 'spiral' },
  haste: { id: 'haste', name: '加速', kind: 'spell', rarity: 'C', cost: 1, effect: 'haste', text: '自分のユニット全てを準備完了にし、攻撃+1。', resvText: '攻撃+2。', flavor: '針よ、走れ。', motif: 'hand' },
  insight: { id: 'insight', name: '未来視', kind: 'spell', rarity: 'C', cost: 2, effect: 'insight', text: 'カードを2枚引く。', resvText: '3枚引く。', flavor: '先に見た者が、先に動く。', motif: 'eye' },
  stop: { id: 'stop', name: '時間停止', kind: 'spell', rarity: 'L', cost: 2, effect: 'stop', text: '相手の時計を3進める。', resvText: '相手の時計を4進める。', flavor: '世界が止まる。あなた以外の。', motif: 'crown' },
  // ---- 第1弾「残響の刻」 ------------------------------------------------
  e_sprite: { id: 'e_sprite', set: 'echo', name: 'こだまの妖精', kind: 'unit', rarity: 'C', cost: 1, atk: 1, hp: 1, reload: 1, echo: [{ delay: 3, effect: 'ping1' }], text: '残響3：敵拠点に1ダメージ。', flavor: '呼べば、少し遅れて返事がくる。', motif: 'wave' },
  e_page: { id: 'e_page', set: 'echo', name: '鐘つき見習い', kind: 'unit', rarity: 'C', cost: 2, atk: 2, hp: 2, reload: 1, rush: 1, text: '急襲1', flavor: '遅刻したぶん、走ればいい。', motif: 'bell' },
  e_tuner: { id: 'e_tuner', set: 'echo', name: '調律師', kind: 'unit', rarity: 'C', cost: 2, atk: 1, hp: 3, reload: 2, hook: 'resonateAtk', text: '共鳴：攻撃+1。', flavor: 'ずれた音ほど、よく響く。', motif: 'pendulum' },
  e_march: { id: 'e_march', set: 'echo', name: '残響の歩兵', kind: 'unit', rarity: 'C', cost: 3, atk: 2, hp: 3, reload: 2, echo: [{ delay: 3, effect: 'rally' }], text: '残響3：自分のユニット全ての攻撃+1。', flavor: '足音が、あとから隊列を連れてくる。', motif: 'wave' },
  e_guard: { id: 'e_guard', set: 'echo', name: '時計塔の守衛', kind: 'unit', rarity: 'C', cost: 4, atk: 2, hp: 5, reload: 3, keywords: ['taunt'], rush: 1, text: '挑発・急襲1', flavor: '鐘が鳴る前に、持ち場へ。', motif: 'shield' },
  e_shot: { id: 'e_shot', set: 'echo', name: 'こだま撃ち', kind: 'spell', rarity: 'C', cost: 2, effect: 'eShot', echo: [{ delay: 4, effect: 'shot1' }], text: '攻撃力が最も高い敵ユニットに2ダメージ（いなければ敵拠点に1）。残響4：攻撃力が最も高い敵ユニットに1ダメージ（いなければ敵拠点に1）。', resvText: '3ダメージ（拠点なら1）。残響は発動時刻から。', flavor: '一発目は合図。二発目が本命。', motif: 'hand' },
  e_pray: { id: 'e_pray', set: 'echo', name: '残響の祈り', kind: 'spell', rarity: 'C', cost: 2, effect: 'ePray', echo: [{ delay: 3, effect: 'heal3' }], text: '自拠点を3回復。残響3：自拠点を3回復。', resvText: '4回復。残響は発動時刻から。', flavor: '祈りは、遅れて届く。', motif: 'wave' },
  e_slash: { id: 'e_slash', set: 'echo', name: '溜めの一閃', kind: 'spell', rarity: 'C', cost: 1, effect: 'eSlash', charge: 4, text: '充填4。攻撃力が最も高い敵ユニットに1+Xダメージ（いなければ敵拠点に1）。', resvText: '3ダメージ（拠点なら2）。', flavor: '抜くまでが、長い。', motif: 'flame' },
  e_peek: { id: 'e_peek', set: 'echo', name: '覗き時計', kind: 'spell', rarity: 'C', cost: 1, effect: 'ePeek', text: '相手の予約を全て公開し、カードを1枚引く。', resvText: '公開し、2枚引く。', flavor: '文字盤の裏側にも、針はある。', motif: 'eye' },
  e_twin: { id: 'e_twin', set: 'echo', name: '影法師', kind: 'unit', rarity: 'R', cost: 3, atk: 2, hp: 2, reload: 2, echo: [{ delay: 3, effect: 'image' }], text: '残響3：空いたレーンに「残像」（攻撃1・体力1・速攻）を呼ぶ。', flavor: '影は、本人より少し遅れて歩く。', motif: 'spiral' },
  e_blade: { id: 'e_blade', set: 'echo', name: '溜め斬りの剣士', kind: 'unit', rarity: 'R', cost: 2, atk: 2, hp: 2, reload: 2, charge: 3, text: '充填3。X刻多く払うと、攻撃+X・体力+X。', flavor: '構えた時間だけ、刃は重くなる。', motif: 'hand' },
  e_raider: { id: 'e_raider', set: 'echo', name: '奇襲の騎兵', kind: 'unit', rarity: 'R', cost: 4, atk: 4, hp: 3, reload: 2, keywords: ['swift'], rush: 2, text: '速攻・急襲2', flavor: '遅れて来た者だけが、背後を取れる。', motif: 'flame' },
  e_bellkeeper: { id: 'e_bellkeeper', set: 'echo', name: '共鳴の鐘守', kind: 'unit', rarity: 'R', cost: 4, atk: 3, hp: 3, reload: 2, hook: 'resonatePing', text: '共鳴：攻撃力が最も高い敵ユニットに1ダメージ。', flavor: '一つ鳴れば、塔じゅうが鳴る。', motif: 'bell' },
  e_break: { id: 'e_break', set: 'echo', name: '破約の刃', kind: 'spell', rarity: 'R', cost: 2, effect: 'eBreak', text: '相手の予約を全て公開し、最も遅い予約か残響を1つ破棄する。', resvText: '公開し、遅い順に2つ破棄する。', flavor: 'その約束、ここで断つ。', motif: 'gear' },
  e_draw: { id: 'e_draw', set: 'echo', name: '響く未来視', kind: 'spell', rarity: 'R', cost: 2, effect: 'eDraw', echo: [{ delay: 3, effect: 'draw1' }], text: 'カードを1枚引く。残響3：カードを1枚引く。', resvText: '2枚引く。残響は発動時刻から。', flavor: '見えた未来が、もう一度見える。', motif: 'eye' },
  e_reverse: { id: 'e_reverse', set: 'echo', name: '逆転の針', kind: 'spell', rarity: 'R', cost: 2, effect: 'eReverse', rush: 1, text: '急襲1。相手の時計を2進める。', resvText: '相手の時計を3進める。', flavor: '遅れているのは、どちらだろう。', motif: 'pendulum' },
  e_mage: { id: 'e_mage', set: 'echo', name: '残響術士', kind: 'unit', rarity: 'E', cost: 4, atk: 3, hp: 5, reload: 2, hook: 'hasten2', text: '登場時：自分の予約と残響の発動時刻を全て2刻早める。', flavor: '明日を、今日に引き寄せる。', motif: 'spiral' },
  e_atra: { id: 'e_atra', set: 'echo', name: '双子時計のアトラ', kind: 'unit', rarity: 'E', cost: 6, atk: 3, hp: 4, reload: 2, hook: 'storm1', echo: [{ delay: 4, effect: 'storm1' }], text: '登場時と残響4：敵ユニット全てに1ダメージ。', flavor: '片方の時計が鳴れば、もう片方も鳴る。', motif: 'wave' },
  e_colossus: { id: 'e_colossus', set: 'echo', name: '刻溜めの巨兵', kind: 'unit', rarity: 'E', cost: 5, atk: 4, hp: 5, reload: 3, charge: 3, text: '充填3。X刻多く払うと、攻撃+X・体力+X。Xが3なら挑発を得る。', flavor: '眠っていた分だけ、目覚めは大きい。', motif: 'shield' },
  e_storm: { id: 'e_storm', set: 'echo', name: '残響の嵐', kind: 'spell', rarity: 'E', cost: 4, effect: 'eStorm', echo: [{ delay: 2, effect: 'storm1' }, { delay: 4, effect: 'storm1' }], text: '敵ユニット全てに1ダメージ。残響2と残響4：もう一度。', resvText: '全てに2ダメージ。残響は発動時刻から。', flavor: '嵐は一度では終わらない。', motif: 'wave' },
  e_verna: { id: 'e_verna', set: 'echo', name: '刻を繰る者ヴェルナ', kind: 'unit', rarity: 'L', cost: 6, atk: 4, hp: 5, reload: 3, hook: 'resonateRewind', text: '共鳴：自分の時計を1戻す。', flavor: '響きが消えるたび、彼女は少し若返る。', motif: 'crown' },
  e_eternal: { id: 'e_eternal', set: 'echo', name: '永劫回帰', kind: 'spell', rarity: 'L', cost: 4, effect: 'eEternal', echo: [{ delay: 3, effect: 'ping2' }, { delay: 6, effect: 'ping2' }], text: '敵拠点に2ダメージ。残響3と残響6：敵拠点に2ダメージ。', resvText: '敵拠点に3ダメージ。残響は発動時刻から。', flavor: '同じ瞬間は、何度でも訪れる。', motif: 'crown' },
  e_image: { id: 'e_image', set: 'echo', token: true, name: '残像', kind: 'unit', rarity: 'C', cost: 0, atk: 1, hp: 1, reload: 1, keywords: ['swift'], text: '速攻', flavor: 'まだ、そこにいる気がする。', motif: 'spiral' },
};

/** Every card a player can put in a deck (tokens excluded). */
export const CARD_LIST = Object.values(CARDS).filter((c) => !c.token);
export const setOf = (c: CardDef): CardSet => c.set ?? 'base';

/** Plain-language help for every keyword, shown when a card is inspected. */
export const KEYWORD_HELP: Record<string, string> = {
  速攻: '召喚した直後から攻撃できる。',
  挑発: '隣の空いたレーンへの攻撃も受け止める。',
  貫通: '倒した相手の体力を超えた分が拠点に届く。',
  残響: '効果が解決してからN刻後に、弱い効果がもう一度起きる。時計にピンとして表示され、両者の針が届くと発動。予約の枠は使わない。',
  共鳴: '自分の予約か残響が発動するたびに効果が起きる。',
  急襲: '自分の時計が相手より2刻以上遅れているとき、コストがN少なくなる（最低1）。',
  転移: '1刻払って、隣の空いたレーンへ移れる。準備の状態はそのまま。',
  鐘鳴: '自分の時計が鐘（8・16・24・32刻）を越えるたびに効果が起きる。',
  充填: '今すぐ使うとき、最大N刻まで多く払って効果を強められる（X＝多く払った刻）。予約するときはX＝0。',
};
export function keywordsOf(c: CardDef): string[] {
  const k: string[] = (c.keywords ?? []).map((x) => ({ taunt: '挑発', pierce: '貫通', swift: '速攻', shift: '転移' })[x]);
  if (c.bell) k.push('鐘鳴');
  if (c.echo) k.push('残響');
  if (c.hook?.startsWith('resonate')) k.push('共鳴');
  if (c.rush) k.push('急襲');
  if (c.charge) k.push('充填');
  return k;
}
export const cardDef = (id: string): CardDef => {
  const c = CARDS[id];
  if (!c) throw new Error(`unknown card ${id}`);
  return c;
};
