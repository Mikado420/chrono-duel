/**
 * レート戦の対戦相手の名簿（120人：Lv1〜10に12人ずつ）。名前ごとにLv・性格・得意デッキが決まっている。
 * 名前から戦い方は分からないようにしている。性格は判断の重みと得意デッキだけを変え、読みの深さ（＝Lvの強さ）は変えない。
 * 各Lvの内訳：攻め型4・守り型2・策士型4・堅実型2。
 * デッキ（0.22.x で白紙から組み直し。src/sim/rosterDecks.ts）は Lv に合わせて段階的に強くなる：
 *   Lv1〜2 弱め（素直なアグロ・ミッドレンジ・破約・巨像など）／Lv3 その上位／Lv4〜5 中位（急襲アグロ・耐久・共鳴・予約バーン・全体除去）／
 *   Lv6 中位の上位／Lv7 中位＋環境デッキの一部／Lv8 環境デッキ（控えめな型を含む）／Lv9〜10 環境デッキ（急襲時計・ヴェルナ・時間牢獄・籠城バーン）。
 * 隣の Lv にはおよそ 55〜65% 勝つ（npm run sim:rivals で確認）。性格に合わせて、攻め型は殴るデッキ、守り型は耐えるデッキ、
 * 策士型は予約・時計のデッキ、堅実型はミッドレンジを持つ。deck / sub は rosterDecks.ts の id（古い記録の id は metaDecks.ts / set2Decks.ts で引ける）。
 * Rated play draws its opponents from here (rating.ts makeOpponent); the brain is src/core/rival.ts.
 * Ids are 'rv:' + name. They are stored in players' records and checked by the ranking server, so names never change.
 */
import { cardDef } from '../core/cards';
import { quirksOf, type Persona, type RivalCfg } from '../core/rival';
import { META_DECKS } from '../sim/metaDecks';
import { ROSTER_DECKS } from '../sim/rosterDecks';
import { SET2_TEST_DECKS } from '../sim/set2Decks';
import { TITLES } from './titles';
export type { Persona };
export const PERSONA_NAMES: Record<Persona, string> = { attack: '攻め型', guard: '守り型', schemer: '策士型', steady: '堅実型' };
export interface Rival { name: string; lv: number; rating: number; persona: Persona; deck: string; sub: string }
/** Lvごとの目安レート（Lv10は2000〜）。 */
export const LV_RATING = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1730, 1860, 2000];
export const ROSTER: Rival[] = [
  {name: "たっくん",lv: 1,rating: 965,persona: "attack",deck: "rush_haste",sub: "wide_march"},
  {name: "二度寝の刻",lv: 1,rating: 1010,persona: "attack",deck: "wide_march",sub: "rush_sprite"},
  {name: "nekoyama",lv: 1,rating: 1030,persona: "attack",deck: "rush_sprite",sub: "raid_break"},
  {name: "今日こそ勝つ",lv: 1,rating: 980,persona: "attack",deck: "raid_break",sub: "rush_haste"},
  {name: "みーこ",lv: 1,rating: 1040,persona: "guard",deck: "fort_titan",sub: "charge_taunt"},
  {name: "目覚まし3回目",lv: 1,rating: 995,persona: "guard",deck: "charge_taunt",sub: "fort_titan"},
  {name: "ゆっきー",lv: 1,rating: 1025,persona: "schemer",deck: "break_usurp",sub: "rburn_decoy"},
  {name: "腹時計",lv: 1,rating: 970,persona: "schemer",deck: "rburn_decoy",sub: "lock_sentry"},
  {name: "mii_mii",lv: 1,rating: 1000,persona: "schemer",deck: "lock_sentry",sub: "break_obliv"},
  {name: "ノリで来た",lv: 1,rating: 1015,persona: "schemer",deck: "break_obliv",sub: "break_usurp"},
  {name: "ぽんちゃん",lv: 1,rating: 985,persona: "steady",deck: "mid_scribe",sub: "sweep_gust"},
  {name: "昼寝のプロ",lv: 1,rating: 1035,persona: "steady",deck: "sweep_gust",sub: "mid_bell"},
  {name: "もっちー",lv: 2,rating: 1065,persona: "attack",deck: "rush_haste",sub: "wide_march"},
  {name: "時差ボケ太郎",lv: 2,rating: 1110,persona: "attack",deck: "wide_march",sub: "rush_sprite"},
  {name: "yuzu.p",lv: 2,rating: 1130,persona: "attack",deck: "rush_sprite",sub: "raid_break"},
  {name: "本気出すのは明日",lv: 2,rating: 1080,persona: "attack",deck: "raid_break",sub: "rush_haste"},
  {name: "三日坊主",lv: 2,rating: 1140,persona: "guard",deck: "fort_titan",sub: "charge_taunt"},
  {name: "まるちゃん",lv: 2,rating: 1095,persona: "guard",deck: "charge_taunt",sub: "fort_titan"},
  {name: "sakana_9",lv: 2,rating: 1125,persona: "schemer",deck: "break_usurp",sub: "rburn_decoy"},
  {name: "ガチ勢見習い",lv: 2,rating: 1070,persona: "schemer",deck: "rburn_decoy",sub: "lock_sentry"},
  {name: "りっちゃん",lv: 2,rating: 1100,persona: "schemer",deck: "lock_sentry",sub: "break_obliv"},
  {name: "朝ごはん抜き",lv: 2,rating: 1115,persona: "schemer",deck: "break_obliv",sub: "break_usurp"},
  {name: "けんけん",lv: 2,rating: 1085,persona: "steady",deck: "mid_scribe",sub: "sweep_gust"},
  {name: "tora7",lv: 2,rating: 1135,persona: "steady",deck: "sweep_gust",sub: "mid_bell"},
  {name: "あーちゃん",lv: 3,rating: 1165,persona: "attack",deck: "rush_haste",sub: "raid_ram"},
  {name: "遅刻魔王",lv: 3,rating: 1210,persona: "attack",deck: "raid_ram",sub: "rush_haste"},
  {name: "Haru_jp",lv: 3,rating: 1230,persona: "attack",deck: "raid_break",sub: "rush_haste"},
  {name: "運だけで来た",lv: 3,rating: 1180,persona: "attack",deck: "rush_haste",sub: "raid_break"},
  {name: "ひなっち",lv: 3,rating: 1240,persona: "guard",deck: "charge_taunt",sub: "fort_titan"},
  {name: "夏休みの宿題",lv: 3,rating: 1195,persona: "guard",deck: "fort_titan",sub: "charge_taunt"},
  {name: "kenji1205",lv: 3,rating: 1225,persona: "schemer",deck: "break_obliv",sub: "tempo_decoy"},
  {name: "はるるん",lv: 3,rating: 1170,persona: "schemer",deck: "tempo_decoy",sub: "break_obliv"},
  {name: "5分前行動",lv: 3,rating: 1200,persona: "schemer",deck: "lock_sentry",sub: "break_obliv"},
  {name: "手札事故の帝王",lv: 3,rating: 1215,persona: "schemer",deck: "break_obliv",sub: "lock_sentry"},
  {name: "aoba_x",lv: 3,rating: 1185,persona: "steady",deck: "mid_bell",sub: "mid_scribe"},
  {name: "そらっち",lv: 3,rating: 1235,persona: "steady",deck: "mid_scribe",sub: "mid_bell"},
  {name: "定時退社",lv: 4,rating: 1265,persona: "attack",deck: "raid_rev",sub: "rush_lance"},
  {name: "よっしー",lv: 4,rating: 1310,persona: "attack",deck: "rush_lance",sub: "wide_mage"},
  {name: "ryu_44",lv: 4,rating: 1330,persona: "attack",deck: "wide_mage",sub: "raid_ram"},
  {name: "一生カード引いてたい",lv: 4,rating: 1280,persona: "attack",deck: "raid_ram",sub: "raid_rev"},
  {name: "かずぴ",lv: 4,rating: 1340,persona: "guard",deck: "fort_dragon",sub: "charge_clock"},
  {name: "月曜の朝",lv: 4,rating: 1295,persona: "guard",deck: "charge_clock",sub: "burn_sentry"},
  {name: "Rin.k",lv: 4,rating: 1325,persona: "schemer",deck: "rburn_mage",sub: "reso_bell"},
  {name: "実家のような安心感",lv: 4,rating: 1270,persona: "schemer",deck: "reso_bell",sub: "verna_mage"},
  {name: "こーへー",lv: 4,rating: 1300,persona: "schemer",deck: "verna_mage",sub: "lock_delay"},
  {name: "終電ダッシュ",lv: 4,rating: 1315,persona: "schemer",deck: "lock_delay",sub: "reso_rev"},
  {name: "mzk_0811",lv: 4,rating: 1285,persona: "steady",deck: "mid_ram",sub: "sweep_dragon"},
  {name: "なっつん",lv: 4,rating: 1335,persona: "steady",deck: "sweep_dragon",sub: "mid_sentry"},
  {name: "締切前夜",lv: 5,rating: 1365,persona: "attack",deck: "raid_rev",sub: "rush_lance"},
  {name: "T.Kaz",lv: 5,rating: 1410,persona: "attack",deck: "rush_lance",sub: "wide_mage"},
  {name: "つっきー",lv: 5,rating: 1430,persona: "attack",deck: "wide_mage",sub: "raid_ram"},
  {name: "最強の凡人",lv: 5,rating: 1380,persona: "attack",deck: "raid_ram",sub: "raid_rev"},
  {name: "寝落ち常習犯",lv: 5,rating: 1440,persona: "guard",deck: "fort_dragon",sub: "charge_clock"},
  {name: "natsu_rx",lv: 5,rating: 1395,persona: "guard",deck: "charge_clock",sub: "burn_sentry"},
  {name: "まなりん",lv: 5,rating: 1425,persona: "schemer",deck: "rburn_mage",sub: "reso_bell"},
  {name: "時給950円",lv: 5,rating: 1370,persona: "schemer",deck: "reso_bell",sub: "verna_mage"},
  {name: "akari22",lv: 5,rating: 1400,persona: "schemer",deck: "verna_mage",sub: "lock_delay"},
  {name: "神引き待ち",lv: 5,rating: 1415,persona: "schemer",deck: "lock_delay",sub: "reso_rev"},
  {name: "しーくん",lv: 5,rating: 1385,persona: "steady",deck: "mid_ram",sub: "sweep_dragon"},
  {name: "体内時計バグ",lv: 5,rating: 1435,persona: "steady",deck: "sweep_dragon",sub: "mid_sentry"},
  {name: "kaede_0",lv: 6,rating: 1465,persona: "attack",deck: "raid_rev",sub: "tempo_decoy"},
  {name: "にっしー",lv: 6,rating: 1510,persona: "attack",deck: "tempo_decoy",sub: "raid_rev"},
  {name: "残業の申し子",lv: 6,rating: 1530,persona: "attack",deck: "raid_rev",sub: "raid_ram"},
  {name: "引退撤回3回目",lv: 6,rating: 1480,persona: "attack",deck: "raid_ram",sub: "raid_rev"},
  {name: "ShunSK",lv: 6,rating: 1540,persona: "guard",deck: "charge_clock",sub: "burn_sentry"},
  {name: "ちゃんみ",lv: 6,rating: 1495,persona: "guard",deck: "burn_sentry",sub: "charge_clock"},
  {name: "勝ったら寝る",lv: 6,rating: 1525,persona: "schemer",deck: "rburn_mage",sub: "lock_delay"},
  {name: "umi_no_ko",lv: 6,rating: 1470,persona: "schemer",deck: "lock_delay",sub: "rburn_mage"},
  {name: "おさむん",lv: 6,rating: 1500,persona: "schemer",deck: "reso_bell",sub: "verna_mage"},
  {name: "理論値の人",lv: 6,rating: 1515,persona: "schemer",deck: "verna_mage",sub: "rburn_mage"},
  {name: "ゆうちゃん",lv: 6,rating: 1485,persona: "steady",deck: "mid_sentry",sub: "sweep_dragon"},
  {name: "月末の残高",lv: 6,rating: 1535,persona: "steady",deck: "sweep_dragon",sub: "mid_sentry"},
  {name: "hiroto_v2",lv: 7,rating: 1565,persona: "attack",deck: "tempo_decoy",sub: "raid_rev"},
  {name: "負けたら引退",lv: 7,rating: 1610,persona: "attack",deck: "tempo_mix",sub: "tempo_decoy"},
  {name: "あっきー",lv: 7,rating: 1630,persona: "attack",deck: "raid_rev",sub: "tempo_decoy"},
  {name: "Mochi_kun",lv: 7,rating: 1580,persona: "attack",deck: "tempo_decoy",sub: "tempo_mix"},
  {name: "世界一の負けず嫌い",lv: 7,rating: 1640,persona: "guard",deck: "burn_sentry",sub: "charge_clock"},
  {name: "sora-lab",lv: 7,rating: 1595,persona: "guard",deck: "burn_heal",sub: "burn_sentry"},
  {name: "徹夜明けの本気",lv: 7,rating: 1625,persona: "schemer",deck: "rburn_mage",sub: "lock_delay"},
  {name: "Nao.T",lv: 7,rating: 1570,persona: "schemer",deck: "lock_delay",sub: "verna_mage"},
  {name: "ねむり姫(仮)",lv: 7,rating: 1600,persona: "schemer",deck: "verna_mage",sub: "rburn_mage"},
  {name: "yoshi_ta",lv: 7,rating: 1615,persona: "schemer",deck: "lock_delay",sub: "rburn_mage"},
  {name: "優勝したい",lv: 7,rating: 1585,persona: "steady",deck: "burn_heal",sub: "mid_sentry"},
  {name: "rkt_0",lv: 7,rating: 1635,persona: "steady",deck: "mid_sentry",sub: "burn_heal"},
  {name: "蒼",lv: 8,rating: 1695,persona: "attack",deck: "tempo_mix",sub: "tempo_decoy"},
  {name: "kuro_93",lv: 8,rating: 1740,persona: "attack",deck: "tempo_decoy",sub: "tempo_mix"},
  {name: "まだ本気じゃない",lv: 8,rating: 1760,persona: "attack",deck: "tempo_mix",sub: "raid_rev"},
  {name: "凛",lv: 8,rating: 1710,persona: "attack",deck: "tempo_haste",sub: "tempo_mix"},
  {name: "嶺",lv: 8,rating: 1770,persona: "guard",deck: "burn_heal",sub: "burn_mirea"},
  {name: "休日出勤",lv: 8,rating: 1725,persona: "guard",deck: "burn_mirea",sub: "burn_heal"},
  {name: "Orca",lv: 8,rating: 1755,persona: "schemer",deck: "lock_mirea",sub: "lock_delay"},
  {name: "akatsuki_s",lv: 8,rating: 1700,persona: "schemer",deck: "verna_mage",sub: "verna_titan"},
  {name: "朝まで一本勝負",lv: 8,rating: 1730,persona: "schemer",deck: "lock_delay",sub: "lock_mirea"},
  {name: "雅",lv: 8,rating: 1745,persona: "schemer",deck: "verna_titan",sub: "verna_mage"},
  {name: "ふーみん",lv: 8,rating: 1715,persona: "steady",deck: "burn_heal",sub: "tempo_guard"},
  {name: "負けイベント拒否",lv: 8,rating: 1765,persona: "steady",deck: "tempo_guard",sub: "burn_heal"},
  {name: "玄",lv: 9,rating: 1825,persona: "attack",deck: "tempo_haste",sub: "tempo_mix"},
  {name: "Vega",lv: 9,rating: 1870,persona: "attack",deck: "tempo_mix",sub: "tempo_haste"},
  {name: "全国大会帰り",lv: 9,rating: 1890,persona: "attack",deck: "tempo_haste",sub: "tempo_decoy"},
  {name: "tsubame_k",lv: 9,rating: 1840,persona: "attack",deck: "tempo_mix",sub: "tempo_guard"},
  {name: "朧",lv: 9,rating: 1900,persona: "guard",deck: "burn_mirea",sub: "verna_guard"},
  {name: "ラスボスの前座",lv: 9,rating: 1855,persona: "guard",deck: "verna_guard",sub: "burn_heal"},
  {name: "鴉",lv: 9,rating: 1885,persona: "schemer",deck: "lock_mirea",sub: "verna_titan"},
  {name: "hayate.n",lv: 9,rating: 1830,persona: "schemer",deck: "verna_titan",sub: "tempo_guard"},
  {name: "有給消化中",lv: 9,rating: 1860,persona: "schemer",deck: "tempo_guard",sub: "lock_mirea"},
  {name: "煌",lv: 9,rating: 1875,persona: "schemer",deck: "lock_mirea",sub: "verna_guard"},
  {name: "ハル",lv: 9,rating: 1845,persona: "steady",deck: "tempo_guard",sub: "burn_heal"},
  {name: "勝率しか見てない",lv: 9,rating: 1895,persona: "steady",deck: "burn_heal",sub: "burn_mirea"},
  {name: "Ace",lv: 10,rating: 2040,persona: "attack",deck: "tempo_haste",sub: "tempo_mix"},
  {name: "櫻",lv: 10,rating: 2070,persona: "attack",deck: "tempo_mix",sub: "tempo_haste"},
  {name: "零",lv: 10,rating: 2020,persona: "attack",deck: "tempo_haste",sub: "tempo_decoy"},
  {name: "zenith_k",lv: 10,rating: 2100,persona: "attack",deck: "tempo_mix",sub: "tempo_guard"},
  {name: "刹那",lv: 10,rating: 2060,persona: "guard",deck: "burn_mirea",sub: "verna_guard"},
  {name: "無敗の二番手",lv: 10,rating: 2090,persona: "guard",deck: "verna_guard",sub: "burn_heal"},
  {name: "黎明",lv: 10,rating: 2150,persona: "schemer",deck: "lock_mirea",sub: "verna_titan"},
  {name: "Noir",lv: 10,rating: 2120,persona: "schemer",deck: "verna_titan",sub: "tempo_guard"},
  {name: "seiryu_x",lv: 10,rating: 2110,persona: "schemer",deck: "tempo_guard",sub: "lock_mirea"},
  {name: "時間外労働",lv: 10,rating: 2130,persona: "schemer",deck: "lock_mirea",sub: "verna_guard"},
  {name: "天",lv: 10,rating: 2080,persona: "steady",deck: "tempo_guard",sub: "burn_heal"},
  {name: "神様の暇つぶし",lv: 10,rating: 2140,persona: "steady",deck: "burn_heal",sub: "burn_mirea"},
];

export const rivalId = (r: Rival) => `rv:${r.name}`;
const BY_ID = new Map(ROSTER.map((r) => [rivalId(r), r]));
export const rivalById = (id: string): Rival | undefined => BY_ID.get(id);

/** Every deck a rival may use, by id (and the older ones, for names in old records). 第2弾 decks count only once the set is in the card pool. */
const DECKS = [...ROSTER_DECKS, ...META_DECKS, ...SET2_TEST_DECKS];
export function deckAvailable(id: string): boolean {
  const d = DECKS.find((x) => x.id === id);
  if (!d) return false;
  try { d.cards.forEach((c) => cardDef(c)); return true; } catch { return false; }
}
export const rivalDeckCards = (id: string): string[] => DECKS.find((x) => x.id === id)?.cards ?? DECKS[0].cards;
export const rivalDeckName = (id: string): string => DECKS.find((x) => x.id === id)?.name ?? id;
/**
 * The deck a rival brings: its main deck, or its second deck when the main one is not out yet (第2弾) or, 30% of
 * the time, when it lost to this player last time (デッキの持ち替え).
 */
export function rivalDeck(r: Rival, lostLastTime: boolean, rand: () => number = Math.random): string {
  const main = deckAvailable(r.deck), sub = deckAvailable(r.sub);
  if (main && sub && lostLastTime && rand() < 0.3) return r.sub;
  if (main) return r.deck;
  if (sub) return r.sub;
  return 'balance';
}
/** The card a rival shows on the VS screen: the rarest, then dearest card of its deck. */
export function rivalCard(deck: string): string {
  const R = { C: 0, R: 1, E: 2, L: 3 } as const;
  return [...new Set(rivalDeckCards(deck))].sort((a, b) => R[cardDef(b).rarity] - R[cardDef(a).rarity] || cardDef(b).cost - cardDef(a).cost)[0];
}
/** A title that fits the rival's Lv, always the same for the same name (some show none). */
export function rivalTitle(r: Rival): string | undefined {
  const h = (rivalHash(r.name) >>> 16) % 100;
  if (h < 15) return undefined;
  const tones = r.lv <= 3 ? ['green', 'teal'] : r.lv <= 7 ? ['teal', 'blue', 'purple'] : ['purple', 'gold'];
  const pool = TITLES.filter((t) => tones.includes(t.tone));
  return pool[h % pool.length]?.id;
}
const rivalHash = (n: string) => { let h = 2166136261; for (const ch of n) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619) >>> 0; } return h; };
/** What the battle needs to play a rival. */
export const rivalCfg = (r: Rival, deck: string): RivalCfg => ({ name: r.name, lv: r.lv, persona: r.persona, deck, quirks: quirksOf(r.name) });
/** The rival's strength as one of the four plain levels (rewards and statistics). */
export const rivalLevel = (lv: number) => (lv <= 1 ? 'easy' : lv <= 3 ? 'normal' : lv <= 5 ? 'hard' : 'expert') as 'easy' | 'normal' | 'hard' | 'expert';
