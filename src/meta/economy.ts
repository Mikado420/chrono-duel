/**
 * In-game currency, rewards and packs. Pure logic (state in, state out) so it can be tested without a browser.
 * Currency can only be earned by playing; there is no way to buy it.
 */
import { CARD_LIST, cardDef, setOf, type CardSet, type Rarity } from '../core/cards';
import { maxCopies } from '../core/decks';
import { AI_LEVEL_NAMES, type AiLevel } from '../core/ai';

export interface PackDef { id: string; set: CardSet; name: string; sub: string; price: number; size: number }
export const PACKS: PackDef[] = [
  { id: 'echo1', set: 'echo', name: '残響の刻', sub: '第1弾ブースターパック', price: 100, size: 5 },
];
export const packById = (id: string) => PACKS.find((p) => p.id === id) ?? PACKS[0];

/** Odds for the last slot of a pack (the first four are fixed: 3 通常 and 1 希少). */
export const LAST_SLOT: [Rarity, number][] = [['R', 0.72], ['E', 0.23], ['L', 0.05]];
/** A 伝説 is guaranteed by this many packs without one (天井). */
export const PITY = 15;
/**
 * 欠片 (shards) for a copy you can no longer put in a deck, and the cost to create a card from shards.
 * A pack's worth of duplicates is worth far less than a pack, so packs can never pay for themselves.
 */
export const DUPE_SHARDS: Record<Rarity, number> = { C: 5, R: 20, E: 100, L: 400 };
export const CRAFT_COST: Record<Rarity, number> = { C: 40, R: 100, E: 400, L: 1600 };

export interface Wallet {
  coins: number;
  /** Free pack tickets (a welcome gift). */
  tickets: number;
  owned: Record<string, number>;
  /** Packs opened since the last 伝説. */
  pity: number;
  opened: number;
  /** Local date (YYYY-MM-DD) of the last daily first-win bonus. */
  dailyWin: string;
  /** Cards pulled but not yet looked at in the deck editor (shows NEW). */
  fresh: string[];
  /** 欠片, spent on creating specific cards. */
  shards: number;
  /** Coins earned from matches today (capped per day). */
  matchDay: string;
  matchCoins: number;
  /** Card backs and clock faces bought with coins (ids from LOOKS). The default of each kind is always owned. */
  looks: string[];
}
export const NEW_WALLET = (): Wallet => ({ coins: 0, tickets: 3, owned: {}, pity: 0, opened: 0, dailyWin: '', fresh: [], shards: 0, matchDay: '', matchCoins: 0, looks: [] });

// ------------------------------------------------------------------ looks (cosmetic only, bought with coins)
export type LookKind = 'back' | 'dial' | 'mat';
export interface LookDef { id: string; kind: LookKind; name: string; price: number; blurb: string; theme?: string }
/** Themes: a clock face, a card back and a playmat that belong together (sold one by one or as a set). */
export interface ThemeDef { id: string; name: string; blurb: string }
export const THEMES: ThemeDef[] = [
  { id: 'skeleton', name: '透かし機械', blurb: '盤の奥で歯車が噛み合い、時計が進むと回る' },
  { id: 'astro', name: '天文時計', blurb: '青い天空に金の黄道。星と天球儀' },
  { id: 'cathedral', name: '大聖堂', blurb: '石の薔薇窓と、光の落ちる迷宮の床' },
  { id: 'steam', name: '蒸気機関', blurb: '白い圧力計と、蒸気の漏れるボイラー室' },
  { id: 'wadokei', name: '和時計', blurb: '黒漆に金蒔絵、漢数字と梵鐘' },
  { id: 'compass', name: '深海の羅針盤', blurb: '方位盤と浮標、波紋の広がる夜の水面' },
  { id: 'forge', name: '鍛冶場', blurb: '赤熱する鋳鉄と、炉の照り返し' },
  { id: 'archive', name: '記憶の書庫', blurb: '羊皮紙と羽根ペン、開いた古書' },
];
/** A whole theme bought at once costs this share of its parts. */
export const THEME_SET_RATE = 0.8;
const themed = (t: string, dial: [string, string], back: [string, string], mat: [string, string]): LookDef[] => [
  { id: `dial:${t}`, kind: 'dial', name: dial[0], price: 800, blurb: dial[1], theme: t },
  { id: `back:${t}`, kind: 'back', name: back[0], price: 600, blurb: back[1], theme: t },
  { id: `mat:${t}`, kind: 'mat', name: mat[0], price: 1000, blurb: mat[1], theme: t },
];
/** Card backs (your deck pile, cards you show face down) and clock faces (the dial during your games). */
export const LOOKS: LookDef[] = [
  { id: 'back:brass', kind: 'back', name: '真鍮の時計', price: 0, blurb: 'はじめから持っている裏面' },
  { id: 'back:gear', kind: 'back', name: '真鍮の歯車', price: 300, blurb: '噛み合う歯車を刻んだ裏面' },
  { id: 'back:ember', kind: 'back', name: '熾火の文字盤', price: 400, blurb: '赤く燃える針の裏面' },
  { id: 'back:tide', kind: 'back', name: '潮の満ち引き', price: 400, blurb: '残響の波紋を描いた裏面' },
  { id: 'back:star', kind: 'back', name: '夜明けの星図', price: 500, blurb: '星の運行を記した裏面' },
  { id: 'dial:brass', kind: 'dial', name: '標準', price: 0, blurb: 'はじめから持っている文字盤' },
  { id: 'dial:verdigris', kind: 'dial', name: '緑青', price: 400, blurb: '古びた銅の緑が浮く文字盤' },
  { id: 'dial:ember', kind: 'dial', name: '熾火', price: 500, blurb: '炉の火を映した文字盤' },
  { id: 'dial:ivory', kind: 'dial', name: '象牙', price: 500, blurb: '白く磨いた文字盤' },
  { id: 'dial:night', kind: 'dial', name: '星夜', price: 600, blurb: '夜空を閉じ込めた文字盤' },
  { id: 'mat:none', kind: 'mat', name: 'なし', price: 0, blurb: 'いつもの盤面' },
  { id: 'mat:felt', kind: 'mat', name: '緑の卓', price: 300, blurb: '真鍮の金具を付けた緑のフェルト' },
  ...themed('skeleton', ['透かし機械', '奥で歯車が回る文字盤'], ['重なる歯車', '大歯車を中央に据えた裏面'], ['機械室', '端で大歯車がゆっくり回る']),
  ...themed('astro', ['天文時計', '黄道の輪がめぐる青い天空'], ['天球儀', '星空に金の天球儀'], ['天文台の床', '大理石に真鍮の子午線']),
  ...themed('cathedral', ['薔薇窓', '石の狭間に光る16の尖頭窓'], ['双子窓', '尖頭アーチの薔薇窓と細窓'], ['迷宮の床', '石床の迷宮に色ガラスの光']),
  ...themed('steam', ['刻圧計', '銅の縁に鋲を打った白い圧力計'], ['汽缶の銘板', '鋲打ちの鉄に真鍮の銘板'], ['ボイラー室', '鋲打ちの鉄板と銅管、漏れる蒸気']),
  ...themed('wadokei', ['和時計', '黒漆に漢数字と梵鐘'], ['青海波', '藍地の青海波に和時計'], ['金蒔絵', '漆の地に青海波と金の霞']),
  ...themed('compass', ['羅針盤', '方位の星と縄の縁、鐘は浮標'], ['錨と羅針', '太い錨を方位環で囲む'], ['夜の水面', '列の下から波紋が広がる']),
  ...themed('forge', ['鋳鉄', '終焉に近づくと縁が赤熱する'], ['灼ける刃', '鉄床の上で白熱した刃'], ['炉の照り返し', '口を開けた炉と舞う火の粉']),
  ...themed('archive', ['書庫の時計', '羊皮紙に羽根ペンの針'], ['革装丁', '金の留め金と砂時計の本'], ['開いた古書', '机に開いた古書と蝋燭の光']),
];
export const DEFAULT_LOOK: Record<LookKind, string> = { back: 'back:brass', dial: 'dial:brass', mat: 'mat:none' };
export const lookById = (id: string | undefined): LookDef | undefined => LOOKS.find((l) => l.id === id);
export const ownsLook = (w: Wallet, id: string) => lookById(id)?.price === 0 || (w.looks ?? []).includes(id);
/** Why a look cannot be bought, or null. */
export function lookBlock(w: Wallet, id: string): string | null {
  const l = lookById(id);
  if (!l) return '見つかりません';
  if (ownsLook(w, id)) return '持っています';
  if (w.coins < l.price) return `コインが${l.price - w.coins}足りません`;
  return null;
}
/** The looks of a theme the wallet does not have yet, and what they cost together. */
export function themeOffer(w: Wallet, theme: string): { ids: string[]; full: number; price: number } {
  const ids = LOOKS.filter((l) => l.theme === theme && !ownsLook(w, l.id)).map((l) => l.id);
  const full = ids.reduce((a, id) => a + lookById(id)!.price, 0);
  // the set price only applies when at least two parts are bought together
  return { ids, full, price: ids.length >= 2 ? Math.round((full * THEME_SET_RATE) / 10) * 10 : full };
}
export function buyTheme(w: Wallet, theme: string): boolean {
  const o = themeOffer(w, theme);
  if (!o.ids.length || w.coins < o.price) return false;
  w.coins -= o.price;
  w.looks = [...(w.looks ?? []), ...o.ids];
  return true;
}
export function buyLook(w: Wallet, id: string): boolean {
  if (lookBlock(w, id)) return false;
  w.coins -= lookById(id)!.price;
  w.looks = [...(w.looks ?? []), id];
  return true;
}

/** How many copies of a card the player may put in decks. Base cards are always complete. */
export function ownedCount(w: Wallet, id: string): number {
  const d = cardDef(id);
  if (setOf(d) === 'base') return maxCopies(id);
  return Math.min(maxCopies(id), w.owned[id] ?? 0);
}
export function missingCards(w: Wallet, cards: string[]): string[] {
  const n: Record<string, number> = {};
  for (const c of cards) n[c] = (n[c] ?? 0) + 1;
  return Object.entries(n).filter(([c, k]) => k > ownedCount(w, c)).map(([c]) => c);
}
export function setProgress(w: Wallet, set: CardSet) {
  const cards = CARD_LIST.filter((c) => setOf(c) === set);
  const total = cards.reduce((n, c) => n + maxCopies(c.id), 0);
  const have = cards.reduce((n, c) => n + ownedCount(w, c.id), 0);
  return { have, total, kinds: cards.filter((c) => ownedCount(w, c.id) > 0).length, kindsTotal: cards.length };
}

// ------------------------------------------------------------------ crafting
export const craftable = (id: string) => setOf(cardDef(id)) !== 'base' && !cardDef(id).token;
/** Why a card cannot be created right now, or null if it can. */
export function craftBlock(w: Wallet, id: string): string | null {
  if (!craftable(id)) return 'このカードは最初から持っています';
  if ((w.owned[id] ?? 0) >= maxCopies(id)) return '上限枚数まで持っています';
  const cost = CRAFT_COST[cardDef(id).rarity];
  if (w.shards < cost) return `欠片が${cost - w.shards}足りません`;
  return null;
}
export function craft(w: Wallet, id: string): boolean {
  if (craftBlock(w, id)) return false;
  w.shards -= CRAFT_COST[cardDef(id).rarity];
  w.owned[id] = (w.owned[id] ?? 0) + 1;
  return true;
}

// ------------------------------------------------------------------ rewards
export interface RewardInput { mode: 'ai' | 'online' | 'rated'; level: AiLevel; winner: 0 | 1 | -1; reason: string; myActions: number; today: string }
export interface Reward { lines: { label: string; coins: number }[]; total: number; capped?: boolean }

/** [win, loss, draw] coins per match type. */
export const MATCH_REWARD: Record<string, [number, number, number]> = { 'ai-easy': [20, 8, 12], 'ai-normal': [25, 10, 15], 'ai-hard': [35, 12, 18], 'ai-expert': [45, 15, 22], online: [30, 12, 18] };
/** Matches you give up on almost at once pay nothing, so surrendering in a loop cannot farm coins. */
export const MIN_ACTIONS = 5;
export const DAILY_BONUS = 50;
/** Coins from match results per day (the first-win bonus and missions are on top of this). */
export const DAILY_MATCH_CAP = 250;

export function reward(w: Wallet, r: RewardInput): Reward {
  const lines: Reward['lines'] = [];
  const key = r.mode === 'online' ? 'online' : `ai-${r.level}`;
  const [win, lose, draw] = MATCH_REWARD[key];
  // matches over almost at once (either side gave up) pay nothing, so two devices cannot farm coins
  if (r.myActions < MIN_ACTIONS) return { lines: [], total: 0 };
  const used = w.matchDay === r.today ? w.matchCoins : 0;
  const room = Math.max(0, DAILY_MATCH_CAP - used);
  const base = r.winner === 0 ? win : r.winner === -1 ? draw : r.reason !== 'surrender' ? lose : 0;
  const pay = Math.min(base, room);
  if (r.winner === 0) lines.push({ label: r.mode === 'online' ? 'オンライン勝利' : r.mode === 'rated' ? 'レート戦勝利' : r.level === 'normal' ? '勝利' : `勝利（${AI_LEVEL_NAMES[r.level]}）`, coins: pay });
  else if (r.winner === -1) lines.push({ label: '引き分け', coins: pay });
  else lines.push({ label: '対戦に参加', coins: pay });
  if (r.winner === 0 && w.dailyWin !== r.today) lines.push({ label: '本日の初勝利ボーナス', coins: DAILY_BONUS });
  const kept = lines.filter((l) => l.coins > 0);
  return { lines: kept, total: kept.reduce((n, l) => n + l.coins, 0), capped: base > pay };
}
export function applyReward(w: Wallet, rw: Reward, today: string) {
  w.coins += rw.total;
  if (w.matchDay !== today) { w.matchDay = today; w.matchCoins = 0; }
  w.matchCoins += rw.lines.filter((l) => l.label !== '本日の初勝利ボーナス').reduce((n, l) => n + l.coins, 0);
  if (rw.lines.some((l) => l.label === '本日の初勝利ボーナス')) w.dailyWin = today;
}
export const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ------------------------------------------------------------------ packs
export interface Pull { card: string; rarity: Rarity; isNew: boolean; dupeShards: number }
export interface Opening { pack: PackDef; pulls: Pull[]; best: Rarity; pityHit: boolean; paidWith: 'ticket' | 'coins' }

export function canOpen(w: Wallet, p: PackDef): 'ticket' | 'coins' | null {
  if (w.tickets > 0) return 'ticket';
  if (w.coins >= p.price) return 'coins';
  return null;
}

const RANK: Record<Rarity, number> = { C: 0, R: 1, E: 2, L: 3 };

function pick<T>(arr: T[], rand: () => number): T { return arr[Math.floor(rand() * arr.length)]; }

/** Draws one card of `rarity`, preferring legends the player does not own yet (so a legend is never wasted early). */
function draw(w: Wallet, set: CardSet, rarity: Rarity, rand: () => number, inPack: string[]): string {
  const pool = CARD_LIST.filter((c) => setOf(c) === set && c.rarity === rarity);
  if (rarity === 'L') {
    const unowned = pool.filter((c) => !(w.owned[c.id] ?? 0) && !inPack.includes(c.id));
    if (unowned.length) return pick(unowned, rand).id;
  }
  return pick(pool, rand).id;
}

/** Opens one pack: pays for it, rolls the cards and adds them to the collection. Mutates `w`. */
export function openPack(w: Wallet, p: PackDef, rand: () => number = Math.random): Opening {
  const pay = canOpen(w, p);
  if (!pay) throw new Error('not enough coins');
  if (pay === 'ticket') w.tickets--; else w.coins -= p.price;

  const rarities: Rarity[] = ['C', 'C', 'C', 'R'];
  let last: Rarity = 'R';
  let roll = rand();
  for (const [r, pr] of LAST_SLOT) { if (roll < pr) { last = r; break; } roll -= pr; }
  const pityHit = last !== 'L' && w.pity + 1 >= PITY;
  if (pityHit) last = 'L';
  rarities.push(last);

  const cards: string[] = [];
  for (const r of rarities) cards.push(draw(w, p.set, r, rand, cards));
  const pulls: Pull[] = cards.map((card) => {
    const rarity = cardDef(card).rarity;
    const before = w.owned[card] ?? 0;
    const isNew = before === 0;
    let dupeShards = 0;
    if (before >= maxCopies(card)) { dupeShards = DUPE_SHARDS[rarity]; w.shards += dupeShards; }
    else w.owned[card] = before + 1;
    if (isNew && !w.fresh.includes(card)) w.fresh.push(card);
    return { card, rarity, isNew, dupeShards };
  });
  w.pity = rarities.includes('L') ? 0 : w.pity + 1;
  w.opened++;
  const best = rarities.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'C' as Rarity);
  // reveal order: the best card last, for suspense
  pulls.sort((a, b) => RANK[a.rarity] - RANK[b.rarity]);
  return { pack: p, pulls, best, pityHit, paidWith: pay };
}
