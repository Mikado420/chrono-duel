/**
 * 第2弾「歯車の迷宮」(48 cards + 1 token). Keywords: 転移 (move to the next empty lane for 1 tick) and 鐘鳴 (an effect
 * each time your clock passes a bell).
 *
 * NOT IN THE GAME YET. Nothing registers these cards in normal play; balance tools call `registerSet2()` to try them.
 * To release the set: call `registerSet2()` at start-up (or move these entries into CARDS) and add its pack.
 */
import { CARDS, CARD_LIST, type CardDef } from './cards';
import { RULES } from './rules';

type Def = Omit<CardDef, 'id' | 'set'>;
const U = (o: Def) => o;

const DEFS: Record<string, Def> = {
  // ================================================================ 通常 (20)
  // -- units (12)
  g_cog: U({ name: '歯車の小人', kind: 'unit', rarity: 'C', cost: 1, atk: 1, hp: 2, reload: 1, keywords: ['shift'], text: '転移', flavor: '小さな歯は、どこにでも噛み合う。', motif: 'gear' }),
  g_runner: U({ name: '迷路の伝令', kind: 'unit', rarity: 'C', cost: 1, atk: 2, hp: 1, reload: 1, keywords: ['swift', 'shift'], text: '速攻・転移', flavor: '近道を知っている者は、遠回りもうまい。', motif: 'hand' }),
  g_walker: U({ name: '迷宮の歩兵', kind: 'unit', rarity: 'C', cost: 2, atk: 2, hp: 3, reload: 2, keywords: ['shift'], text: '転移', flavor: '壁が動くなら、こちらも動けばいい。', motif: 'gear' }),
  g_charger: U({ name: '歯車の突撃兵', kind: 'unit', rarity: 'C', cost: 3, atk: 3, hp: 3, reload: 2, keywords: ['shift'], text: '転移', flavor: '空いた道を見つけるのが仕事だ。', motif: 'flame' }),
  g_drill: U({ name: '掘削機', kind: 'unit', rarity: 'C', cost: 4, atk: 4, hp: 4, reload: 2, keywords: ['shift'], text: '転移', flavor: '道がなければ、掘ればいい。', motif: 'gear' }),
  g_belltoy: U({ name: '鐘番の少年', kind: 'unit', rarity: 'C', cost: 2, atk: 1, hp: 3, reload: 2, bell: 'grow', text: '鐘鳴：攻撃+1・体力+1。', flavor: '鐘の数だけ、背が伸びた気がする。', motif: 'bell' }),
  g_ringer: U({ name: '鐘つき人形', kind: 'unit', rarity: 'C', cost: 2, atk: 2, hp: 2, reload: 2, bell: 'shot1', text: '鐘鳴：攻撃力が最も高い敵ユニットに1ダメージ。', flavor: 'ぜんまいが切れるまで、鳴らし続ける。', motif: 'bell' }),
  g_clerk: U({ name: '時報の書記', kind: 'unit', rarity: 'C', cost: 3, atk: 2, hp: 3, reload: 2, bell: 'draw1', text: '鐘鳴：カードを1枚引く。', flavor: '鐘が鳴るたび、一行書き足す。', motif: 'eye' }),
  g_warden: U({ name: '鐘楼の衛兵', kind: 'unit', rarity: 'C', cost: 3, atk: 2, hp: 4, reload: 2, bell: 'heal2', text: '鐘鳴：自拠点を2回復。', flavor: '鐘が鳴れば、門はまた固くなる。', motif: 'shield' }),
  g_wall: U({ name: '歯車の壁', kind: 'unit', rarity: 'C', cost: 4, atk: 2, hp: 6, reload: 3, keywords: ['taunt'], text: '挑発', flavor: '回らない歯車にも、役目はある。', motif: 'shield' }),
  g_bigcog: U({ name: '大歯車の兵', kind: 'unit', rarity: 'C', cost: 5, atk: 4, hp: 6, reload: 3, bell: 'ready', text: '鐘鳴：準備完了になる。', flavor: '鐘の音で、重い歯車が回り出す。', motif: 'gear' }),
  g_oiler: U({ name: '油差し', kind: 'unit', rarity: 'C', cost: 2, atk: 2, hp: 3, reload: 2, hook: 'readyAlly', text: '登場時：攻撃力が最も高い自分の他のユニットを準備完了にする。', flavor: 'きしむ音は、出番の合図。', motif: 'hand' }),
  // -- spells (8)
  g_spanner: U({ name: 'スパナ投げ', kind: 'spell', rarity: 'C', cost: 2, effect: 'gSpanner', text: '攻撃力が最も低い敵ユニットに2ダメージ（いなければ敵拠点に1）。', resvText: '3ダメージ（拠点なら1）。', flavor: '一番小さな歯車から外れる。', motif: 'hand' }),
  g_reroute: U({ name: '組み替え', kind: 'spell', rarity: 'C', cost: 1, effect: 'gReroute', text: '攻撃力が最も高い自分のユニットを準備完了にし、攻撃+2と転移を与える。', resvText: '攻撃+3。', flavor: '配置を変えれば、同じ兵でも別の軍になる。', motif: 'gear' }),
  g_trap: U({ name: '迷宮の罠', kind: 'spell', rarity: 'C', cost: 2, effect: 'gTrap', text: '攻撃力が最も高い敵ユニットに2ダメージを与え、生き残れば隣の空いたレーンへ動かす。', resvText: '3ダメージ。', flavor: '気づいたときには、壁の向こう。', motif: 'spiral' }),
  g_blueprint: U({ name: '設計図', kind: 'spell', rarity: 'C', cost: 1, effect: 'gBlueprint', text: 'カードを1枚引く。手札に転移か鐘鳴のカードがあれば、さらに1枚引く。', resvText: '2枚引き、条件を満たせばさらに1枚。', flavor: '迷宮は、まず紙の上に建つ。', motif: 'eye' }),
  g_shield: U({ name: '歯車の盾', kind: 'spell', rarity: 'C', cost: 2, effect: 'gFortify', text: '自分のユニット全ての体力+2。', resvText: '体力+3。', flavor: '噛み合った歯は、簡単には割れない。', motif: 'shield' }),
  g_hammer: U({ name: '鉄槌', kind: 'spell', rarity: 'C', cost: 3, effect: 'gHammer', text: '体力が最も高い敵ユニットに4ダメージ。', resvText: '4ダメージ。', flavor: '大きな歯車ほど、よく響く。', motif: 'gear' }),
  g_hush: U({ name: '静けさの歯車', kind: 'spell', rarity: 'C', cost: 1, effect: 'gHush', text: '相手の残響を全て3刻遅らせ、カードを1枚引く。遅らせた残響があれば、さらに1枚引く。', resvText: '4刻遅らせる。', flavor: '音が止む。考える時間が生まれる。', motif: 'wave' }),
  g_overclock: U({ name: '過回転', kind: 'spell', rarity: 'C', cost: 2, effect: 'gRally', text: '自分のユニット全ての攻撃+1・体力+1。', resvText: '攻撃+1・体力+2。', flavor: '回せ。焼き切れる手前まで。', motif: 'flame' }),

  // ================================================================ 希少 (16)
  // -- units (9)
  g_detour: U({ name: '回り道の剣士', kind: 'unit', rarity: 'R', cost: 3, atk: 3, hp: 3, reload: 2, keywords: ['shift'], hook: 'shiftGrow', text: '転移。転移するたび、攻撃+1。', flavor: '遠回りした分だけ、刃は研がれる。', motif: 'hand' }),
  g_courier: U({ name: '歯車の運び屋', kind: 'unit', rarity: 'R', cost: 2, atk: 2, hp: 3, reload: 2, keywords: ['shift'], hook: 'shiftPing', text: '転移。転移したとき、敵拠点に1ダメージ。', flavor: '荷物は爆薬。届け先は、いつも敵陣。', motif: 'gear' }),
  g_flanker: U({ name: '歯車泥棒', kind: 'unit', rarity: 'R', cost: 2, atk: 2, hp: 3, reload: 2, keywords: ['shift'], hook: 'flank', text: '転移。敵拠点を攻撃するとき、攻撃+2。', flavor: '正面には立たない主義だ。', motif: 'hand' }),
  g_archer: U({ name: '鐘楼の射手', kind: 'unit', rarity: 'R', cost: 3, atk: 2, hp: 3, reload: 2, bell: 'shot2', text: '鐘鳴：攻撃力が最も高い敵ユニットに2ダメージ。', flavor: '鐘の音が、狙いを定める合図。', motif: 'bell' }),
  g_turret: U({ name: '回転砲台', kind: 'unit', rarity: 'R', cost: 3, atk: 1, hp: 4, reload: 3, bell: 'storm1', text: '鐘鳴：敵ユニット全てに1ダメージ。', flavor: '一周するたび、全方位を撃つ。', motif: 'gear' }),
  g_waker: U({ name: '目覚めの鐘', kind: 'unit', rarity: 'R', cost: 4, atk: 4, hp: 4, reload: 3, bell: 'ready', text: '鐘鳴：準備完了になる。', flavor: '眠っていても、鐘が鳴れば跳ね起きる。', motif: 'bell' }),
  g_jammer: U({ name: '歯車詰まり', kind: 'unit', rarity: 'R', cost: 4, atk: 3, hp: 4, reload: 2, hook: 'stunTop3', text: '登場時：攻撃力が最も高い敵ユニットの準備を3刻遅らせる。', flavor: '砂ひと粒で、大時計は止まる。', motif: 'hourglass' }),
  g_ringmaster: U({ name: '鐘楼長', kind: 'unit', rarity: 'R', cost: 4, atk: 3, hp: 5, reload: 2, bell: 'blessOthers', text: '鐘鳴：自分の他の鐘鳴ユニット全ての体力+2。', flavor: '号令ひとつで、塔じゅうの鐘番が背筋を伸ばす。', motif: 'bell' }),
  g_sentry: U({ name: '迷宮の番兵', kind: 'unit', rarity: 'R', cost: 5, atk: 2, hp: 5, reload: 3, keywords: ['taunt'], bell: 'hp2', text: '挑発。鐘鳴：体力+2。', flavor: '鐘が鳴るたび、盾は厚くなる。', motif: 'shield' }),
  // -- spells (7)
  g_resonance: U({ name: '大鐘の共振', kind: 'spell', rarity: 'R', cost: 1, effect: 'gRing', text: 'カードを1枚引き、攻撃力が最も高い自分の鐘鳴ユニットの鐘鳴を起こす。', resvText: '2枚引く。', flavor: '鐘は、鐘を呼ぶ。', motif: 'bell' }),
  g_silence: U({ name: '静寂の鐘', kind: 'spell', rarity: 'R', cost: 1, effect: 'gSilence', text: '相手の予約と残響を全て4刻遅らせ、カードを1枚引く。', resvText: '6刻遅らせ、1枚引く。', flavor: 'この鐘が鳴ると、ほかの鐘は黙る。', motif: 'bell' }),
  g_maze: U({ name: '迷宮化', kind: 'spell', rarity: 'R', cost: 2, effect: 'gMaze', text: '敵ユニット全てに1ダメージ。生き残ったものを右の空いたレーンへ動かせるものから動かし、準備を2刻遅らせる。', resvText: '準備を3刻遅らせる。', flavor: '道は、入るたびに形を変える。', motif: 'spiral' }),
  g_tune: U({ name: '歯車調整', kind: 'spell', rarity: 'R', cost: 1, effect: 'gTune', text: '攻撃力が最も高い自分のユニットに攻撃+2・体力+1と転移を与える。', resvText: '攻撃+3・体力+1。', flavor: '一枚の歯を替えるだけで、速さが変わる。', motif: 'gear' }),
  g_gearstorm: U({ name: '歯車の嵐', kind: 'spell', rarity: 'R', cost: 3, effect: 'gGearstorm', text: '敵ユニット全てに1ダメージ。自分の転移ユニットが1体いれば2、2体以上なら3ダメージ。', resvText: '+1ダメージ。', flavor: '外れた歯車は、刃になって降る。', motif: 'gear' }),
  g_mirror: U({ name: '映し鏡', kind: 'spell', rarity: 'R', cost: 4, effect: 'gMirror', text: '空いたレーンに、攻撃力が最も高い敵ユニットと同じ攻撃・体力の「歯車人形」（転移）を出す。', resvText: '攻撃+1して出す。', flavor: '鏡の迷宮で、敵は自分と戦う。', motif: 'eye' }),
  g_lever: U({ name: '切り替えレバー', kind: 'spell', rarity: 'R', cost: 1, effect: 'gLever', text: '攻撃力が最も高い自分のユニットと最も低いユニットの位置を入れ替え、両方を準備完了にして攻撃+1。', resvText: '攻撃+2。', flavor: 'がちゃん。それだけで、戦場が入れ替わる。', motif: 'hand' }),

  // ================================================================ 秘宝 (8)
  g_colossus: U({ name: '大歯車の守護者', kind: 'unit', rarity: 'E', cost: 5, atk: 3, hp: 5, reload: 3, keywords: ['shift'], bell: 'grow', text: '転移。鐘鳴：攻撃+1・体力+1。', flavor: '迷宮の中心で、ゆっくりと回り続ける。', motif: 'gear' }),
  g_engineer: U({ name: '時計塔の機関士', kind: 'unit', rarity: 'E', cost: 4, atk: 3, hp: 4, reload: 2, hook: 'bellDraw', text: '自分の大鐘（16刻・32刻）が鳴るたび、カードをさらに1枚引く。', flavor: '鐘の数だけ、次の手が見えてくる。', motif: 'bell' }),
  g_phantom: U({ name: '幻影の騎兵', kind: 'unit', rarity: 'E', cost: 5, atk: 5, hp: 5, reload: 2, keywords: ['swift', 'shift'], hook: 'shiftHaste', text: '速攻・転移。転移したとき、準備が1刻早まる。', flavor: '見えた場所には、もういない。', motif: 'flame' }),
  g_saint: U({ name: '鐘の聖女', kind: 'unit', rarity: 'E', cost: 5, atk: 3, hp: 5, reload: 2, bell: 'blessAll', text: '鐘鳴：自分のユニット全ての体力+1、自拠点を2回復。', flavor: '祈りは鐘に乗って、遠くまで届く。', motif: 'bell' }),
  g_carpenter: U({ name: '機巧の大工', kind: 'unit', rarity: 'E', cost: 3, atk: 1, hp: 2, reload: 2, hook: 'dolls', text: '登場時：空いたレーン全てに「歯車人形」（攻撃1・体力1・転移）を出す。', flavor: '一晩で、迷宮に住人が増えた。', motif: 'hand' }),
  g_rewire: U({ name: '配線し直し', kind: 'spell', rarity: 'E', cost: 2, effect: 'gRewire', text: '敵ユニット全てを1つ右のレーンへずらし（右端は左端へ）、1ダメージを与える。自分のユニット全てを準備完了にする。', resvText: 'さらに自分のユニット全ての攻撃+1。', flavor: 'つなぎ方ひとつで、別の機械になる。', motif: 'spiral' }),
  g_quake: U({ name: '大鐘楼の響き', kind: 'spell', rarity: 'E', cost: 4, effect: 'gQuake', text: '敵ユニット全てに2ダメージ。自分の鐘鳴ユニット全ての体力+1。', resvText: '3ダメージ。', flavor: '塔が鳴る。足元の石まで震える。', motif: 'bell' }),
  g_erase: U({ name: '歯車停止', kind: 'spell', rarity: 'E', cost: 1, effect: 'gErase', text: '相手の予約と残響を全て消し、消した数だけカードを引く（最大2枚）。何も消せなければ1枚引く。', resvText: '最大3枚。', flavor: '止まった歯車は、何も繰り返さない。', motif: 'gear' }),

  // ================================================================ 伝説 (4)
  g_gearlord: U({ name: '迷宮の主ギアロード', kind: 'unit', rarity: 'L', cost: 6, atk: 6, hp: 6, reload: 3, bell: 'gearShift', text: '鐘鳴：自分のユニットを右の空いたレーンへ動かせるものから動かし、全て準備完了にする。', flavor: '迷宮そのものが、彼の体だ。', motif: 'crown' }),
  g_seres: U({ name: '時告げのセレス', kind: 'unit', rarity: 'L', cost: 6, atk: 4, hp: 6, reload: 2, bell: 'oppClock1', text: '鐘鳴：相手の時計を1進める。', flavor: '彼女が鐘を鳴らすと、世界のほうが急ぎだす。', motif: 'crown' }),
  g_architect: U({ name: '迷宮の設計者', kind: 'unit', rarity: 'L', cost: 5, atk: 3, hp: 5, reload: 2, keywords: ['shift'], hook: 'shiftAura', text: '転移。自分のユニットは全て転移を持つ。', flavor: '図面の上では、どの壁も動く。', motif: 'crown' }),
  g_overdrive: U({ name: '永劫の歯車', kind: 'spell', rarity: 'L', cost: 3, effect: 'gOverdrive', echo: [{ delay: 4, effect: 'overdrive' }], text: '自分のユニット全てを準備完了にし、攻撃+1・体力+1。残響4：もう一度。', resvText: '攻撃+2・体力+1。残響は発動時刻から。', flavor: '止まらない歯車が、ひとつだけある。', motif: 'crown' }),

  // ================================================================ token
  g_doll: U({ name: '歯車人形', kind: 'unit', rarity: 'C', cost: 0, atk: 1, hp: 1, reload: 2, keywords: ['shift'], token: true, text: '転移', flavor: 'ねじを巻けば、どこへでも。', motif: 'gear' }),
};

export const SET2: Record<string, CardDef> = Object.fromEntries(Object.entries(DEFS).map(([id, d]) => [id, { ...d, id, set: 'gear' as const }]));

/**
 * Rules that change with 第2弾: 鐘鳴 rings only at the great bells (16 and 32). With four rings a deck full of 鐘鳴
 * won ~80% of its games in testing; two rings bring it near 60% (2026-10-01).
 */
export const SET2_RULES = { BELL_RING_AT: [16, 32] as readonly number[] };

let registered = false;
/** Adds 第2弾 to the card pool (balance tools now; the game on release). Safe to call more than once. */
export function registerSet2() {
  if (registered) return;
  registered = true;
  Object.assign(RULES as Record<string, unknown>, SET2_RULES);
  for (const [id, c] of Object.entries(SET2)) {
    CARDS[id] = c;
    if (!c.token) CARD_LIST.push(c);
  }
}
