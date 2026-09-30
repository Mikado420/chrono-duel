/**
 * In-game currency, rewards and packs. Pure logic (state in, state out) so it can be tested without a browser.
 * Currency can only be earned by playing; there is no way to buy it.
 */
import { CARD_LIST, cardDef, setOf, type CardSet, type Rarity } from '../core/cards';
import { maxCopies } from '../core/decks';

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
}
export const NEW_WALLET = (): Wallet => ({ coins: 0, tickets: 3, owned: {}, pity: 0, opened: 0, dailyWin: '', fresh: [], shards: 0, matchDay: '', matchCoins: 0 });

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
export interface RewardInput { mode: 'ai' | 'online'; level: 'normal' | 'hard'; winner: 0 | 1 | -1; reason: string; myActions: number; today: string }
export interface Reward { lines: { label: string; coins: number }[]; total: number; capped?: boolean }

/** [win, loss, draw] coins per match type. */
export const MATCH_REWARD: Record<string, [number, number, number]> = { 'ai-normal': [25, 10, 15], 'ai-hard': [35, 12, 18], online: [30, 12, 18] };
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
  if (r.winner === 0) lines.push({ label: r.mode === 'online' ? 'オンライン勝利' : r.level === 'hard' ? '勝利（つよい）' : '勝利', coins: pay });
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
