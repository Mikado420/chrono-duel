/**
 * 設計図 (仕様書「デッキ構築の学習」): what each archetype must keep when its rivals' lists are improved. The cores
 * and ranges keep a beatdown deck a beatdown deck; the play numbers were measured with `つよい` vs every other deck
 * (16 decks × 300 games, 第2弾 264) and are what a changed list must still look like in simulation.
 * Shared by the game (it checks every delivered list before using it), the server and the daily tools.
 */
import { CARDS, cardDef } from '../core/cards';
import { RULES } from '../core/rules';
import { META_DECKS } from '../sim/metaDecks';
import { SET2_TEST_DECKS } from '../sim/set2Decks';

export type Style = 'beat' | 'burn' | 'endure' | 'resv' | 'mid';
export const STYLE_NAMES: Record<Style, string> = { beat: 'ビートダウン', burn: 'バーン', endure: '耐久', resv: '予約・時計', mid: 'ミッドレンジ' };
export interface ListProfile { avgCost: number; cheap: number; units: number; taunt: number; big: number }
export interface PlayProfile { end: number; koShare: number; dmg20: number; atk: number; resv: number; hpEnd: number }
export interface Blueprint { style: Style; core: Record<string, number>; list: ListProfile; roles: Record<string, number>; play: PlayProfile }

export const BLUEPRINTS: Record<string, Blueprint> = {
  verna: { style: 'resv', core: {"e_verna": 1, "e_eternal": 1, "e_draw": 2, "e_pray": 2, "rewind": 2}, list: {"avgCost": 2.65, "cheap": 15, "units": 6, "taunt": 1, "big": 3}, roles: {"引く": 4, "回復": 4, "軽いユニット": 3, "直接ダメージ": 3, "大型ユニット": 2, "時計操作": 5, "予約への対策": 2, "単体除去": 1, "全体除去": 1, "挑発": 1}, play: {"end": 37.4, "koShare": 23, "dmg20": 2.9, "atk": 2.1, "resv": 5.6, "hpEnd": 9.1} },
  p_rush: { style: 'beat', core: {"e_page": 2, "e_raider": 2, "haste": 2, "bolt": 2}, list: {"avgCost": 2.05, "cheap": 16, "units": 12, "taunt": 0, "big": 0}, roles: {"軽いユニット": 8, "中型ユニット": 4, "時計操作": 1, "強化": 2, "単体除去": 3, "直接ダメージ": 2}, play: {"end": 33.3, "koShare": 69, "dmg20": 5.5, "atk": 4.7, "resv": 2.1, "hpEnd": 5.5} },
  antiv: { style: 'beat', core: {"e_page": 2, "e_raider": 2, "e_break": 2, "e_peek": 2}, list: {"avgCost": 2, "cheap": 18, "units": 8, "taunt": 0, "big": 0}, roles: {"軽いユニット": 6, "中型ユニット": 2, "予約への対策": 4, "時計操作": 2, "強化": 2, "単体除去": 2, "直接ダメージ": 2}, play: {"end": 31.1, "koShare": 79, "dmg20": 6.2, "atk": 3.5, "resv": 3.6, "hpEnd": 4.8} },
  rush: { style: 'beat', core: {"scout": 2, "archer": 2, "haste": 2, "bolt": 2}, list: {"avgCost": 2.3, "cheap": 14, "units": 14, "taunt": 0, "big": 0}, roles: {"軽いユニット": 8, "時計操作": 3, "中型ユニット": 6, "強化": 3, "単体除去": 2, "直接ダメージ": 2}, play: {"end": 34, "koShare": 70, "dmg20": 5.4, "atk": 5.1, "resv": 1.4, "hpEnd": 5} },
  balance: { style: 'mid', core: {"dragon": 1, "collapse": 1, "gear": 2, "arrow": 2}, list: {"avgCost": 2.7, "cheap": 12, "units": 14, "taunt": 1, "big": 2}, roles: {"軽いユニット": 6, "挑発": 1, "中型ユニット": 5, "引く": 2, "時計操作": 1, "大型ユニット": 2, "全体除去": 2, "単体除去": 3, "直接ダメージ": 1}, play: {"end": 36.7, "koShare": 52, "dmg20": 2.8, "atk": 4.9, "resv": 1.9, "hpEnd": 6.6} },
  p_balance: { style: 'mid', core: {"dragon": 1, "collapse": 1, "e_break": 1, "e_slash": 1}, list: {"avgCost": 2.8, "cheap": 11, "units": 14, "taunt": 1, "big": 2}, roles: {"軽いユニット": 6, "挑発": 1, "中型ユニット": 5, "引く": 2, "時計操作": 1, "大型ユニット": 2, "全体除去": 2, "単体除去": 2, "予約への対策": 1, "直接ダメージ": 1}, play: {"end": 36.7, "koShare": 54, "dmg20": 2.5, "atk": 4.9, "resv": 1.3, "hpEnd": 6.3} },
  titan: { style: 'endure', core: {"titan": 1, "warden": 2, "heavy": 2, "rewind": 2}, list: {"avgCost": 3.35, "cheap": 9, "units": 14, "taunt": 3, "big": 5}, roles: {"軽いユニット": 2, "挑発": 3, "中型ユニット": 5, "引く": 4, "強化": 1, "大型ユニット": 4, "予約への対策": 1, "全体除去": 2, "単体除去": 3, "回復": 2}, play: {"end": 37.7, "koShare": 36, "dmg20": 1, "atk": 4, "resv": 1.8, "hpEnd": 8.1} },
  p_titan: { style: 'endure', core: {"titan": 1, "e_colossus": 2, "warden": 2, "e_guard": 1}, list: {"avgCost": 3.25, "cheap": 9, "units": 14, "taunt": 4, "big": 5}, roles: {"軽いユニット": 2, "挑発": 4, "中型ユニット": 4, "引く": 2, "大型ユニット": 4, "予約への対策": 1, "単体除去": 3, "全体除去": 1, "回復": 2}, play: {"end": 38.4, "koShare": 23, "dmg20": 0.8, "atk": 3.7, "resv": 1.4, "hpEnd": 8.9} },
  p_echo: { style: 'mid', core: {"e_tuner": 2, "e_bellkeeper": 2, "e_twin": 2, "e_storm": 1, "e_mage": 1}, list: {"avgCost": 3, "cheap": 9, "units": 13, "taunt": 0, "big": 2}, roles: {"軽いユニット": 4, "直接ダメージ": 3, "中型ユニット": 7, "強化": 4, "単体除去": 5, "回復": 1, "引く": 1, "全体除去": 2, "大型ユニット": 2, "時計操作": 2}, play: {"end": 35.8, "koShare": 51, "dmg20": 2.8, "atk": 4.1, "resv": 1.6, "hpEnd": 7} },
  oracle: { style: 'mid', core: {"oracle": 1, "stop": 1, "delayer": 2, "bolt": 2, "breaker": 1}, list: {"avgCost": 2.6, "cheap": 12, "units": 13, "taunt": 0, "big": 2}, roles: {"軽いユニット": 6, "時計操作": 5, "中型ユニット": 5, "予約への対策": 2, "大型ユニット": 2, "単体除去": 3, "直接ダメージ": 2, "全体除去": 1}, play: {"end": 36.4, "koShare": 52, "dmg20": 3.9, "atk": 5, "resv": 1.8, "hpEnd": 5.5} },
  reso: { style: 'resv', core: {"e_tuner": 2, "e_bellkeeper": 2, "e_verna": 1, "e_mage": 1, "e_draw": 2}, list: {"avgCost": 2.6, "cheap": 12, "units": 10, "taunt": 0, "big": 1}, roles: {"軽いユニット": 4, "強化": 2, "中型ユニット": 5, "単体除去": 4, "大型ユニット": 1, "時計操作": 2, "直接ダメージ": 3, "引く": 2, "回復": 2, "予約への対策": 2, "全体除去": 1}, play: {"end": 35.5, "koShare": 52, "dmg20": 2.9, "atk": 3.5, "resv": 3.4, "hpEnd": 7.8} },
  lock: { style: 'resv', core: {"delayer": 2, "e_reverse": 2, "stop": 1, "cage": 2, "bolt": 2}, list: {"avgCost": 2.4, "cheap": 14, "units": 7, "taunt": 4, "big": 0}, roles: {"中型ユニット": 3, "時計操作": 5, "単体除去": 3, "挑発": 4, "強化": 1, "引く": 2, "回復": 2, "直接ダメージ": 2, "予約への対策": 2, "全体除去": 1}, play: {"end": 37.4, "koShare": 26, "dmg20": 4, "atk": 2.9, "resv": 5.7, "hpEnd": 7.8} },
  charge: { style: 'endure', core: {"e_colossus": 2, "e_blade": 2, "e_slash": 2, "titan": 1}, list: {"avgCost": 2.85, "cheap": 14, "units": 12, "taunt": 5, "big": 4}, roles: {"大型ユニット": 3, "軽いユニット": 4, "単体除去": 3, "挑発": 5, "引く": 3, "回復": 4}, play: {"end": 38.1, "koShare": 16, "dmg20": 0.7, "atk": 3, "resv": 2.2, "hpEnd": 10.1} },
  burn: { style: 'burn', core: {"bolt": 2, "e_eternal": 1, "e_sprite": 2, "e_shot": 2, "warden": 2}, list: {"avgCost": 2.1, "cheap": 17, "units": 6, "taunt": 4, "big": 0}, roles: {"直接ダメージ": 5, "単体除去": 6, "軽いユニット": 2, "挑発": 4, "引く": 2, "回復": 4, "時計操作": 1}, play: {"end": 35.6, "koShare": 34, "dmg20": 5.7, "atk": 1.7, "resv": 4, "hpEnd": 6.2} },
  control: { style: 'endure', core: {"e_break": 2, "breaker": 1, "collapse": 1, "e_storm": 1, "e_atra": 1, "dragon": 1}, list: {"avgCost": 3.3, "cheap": 10, "units": 8, "taunt": 0, "big": 5}, roles: {"大型ユニット": 5, "予約への対策": 5, "全体除去": 4, "中型ユニット": 3, "強化": 1, "単体除去": 4, "引く": 2, "回復": 2}, play: {"end": 36.7, "koShare": 37, "dmg20": 0.9, "atk": 3, "resv": 2.6, "hpEnd": 6.9} },
  shadow: { style: 'beat', core: {"e_twin": 2, "e_march": 2, "haste": 2, "ghost": 2}, list: {"avgCost": 2.1, "cheap": 14, "units": 13, "taunt": 0, "big": 0}, roles: {"軽いユニット": 8, "時計操作": 5, "中型ユニット": 5, "強化": 4, "直接ダメージ": 3, "引く": 2}, play: {"end": 34, "koShare": 59, "dmg20": 5.1, "atk": 5.4, "resv": 3, "hpEnd": 5} },
  g_bells: { style: 'endure', core: {"g_ringmaster": 1, "g_archer": 2, "g_turret": 1, "g_seres": 1, "g_saint": 1, "g_resonance": 1}, list: {"avgCost": 3.1, "cheap": 7, "units": 15, "taunt": 1, "big": 3}, roles: {"軽いユニット": 4, "強化": 3, "単体除去": 7, "中型ユニット": 8, "引く": 4, "回復": 2, "全体除去": 2, "挑発": 1, "大型ユニット": 2, "時計操作": 1}, play: {"end": 38.1, "koShare": 28, "dmg20": 0.9, "atk": 5.1, "resv": 1.1, "hpEnd": 9.2} },
  g_maze: { style: 'beat', core: {"g_architect": 1, "g_flanker": 2, "g_detour": 2, "g_reroute": 2}, list: {"avgCost": 2.3, "cheap": 12, "units": 16, "taunt": 0, "big": 2}, roles: {"軽いユニット": 9, "中型ユニット": 5, "直接ダメージ": 1, "強化": 3, "大型ユニット": 2, "全体除去": 1}, play: {"end": 34.3, "koShare": 67, "dmg20": 5, "atk": 5.3, "resv": 0.8, "hpEnd": 6.7} },
  g_mid: { style: 'endure', core: {"g_waker": 2, "g_bigcog": 1, "g_gearlord": 1, "g_oiler": 1}, list: {"avgCost": 3, "cheap": 10, "units": 14, "taunt": 0, "big": 3}, roles: {"軽いユニット": 5, "強化": 4, "中型ユニット": 6, "単体除去": 7, "大型ユニット": 3}, play: {"end": 36.9, "koShare": 45, "dmg20": 1.4, "atk": 5.3, "resv": 1.4, "hpEnd": 7.3} },
  g_quiet: { style: 'endure', core: {"g_hush": 2, "g_silence": 2, "g_erase": 1, "g_wall": 2}, list: {"avgCost": 2.6, "cheap": 8, "units": 8, "taunt": 3, "big": 1}, roles: {"挑発": 3, "中型ユニット": 5, "回復": 2, "引く": 2, "予約への対策": 5, "強化": 2, "単体除去": 2, "全体除去": 2}, play: {"end": 37.1, "koShare": 19, "dmg20": 1.1, "atk": 3.6, "resv": 3.4, "hpEnd": 7} },
};

/** The first version of each archetype's list (what every later version is compared with). */
export function originList(id: string): string[] | undefined {
  return [...META_DECKS, ...SET2_TEST_DECKS].find((d) => d.id === id)?.cards;
}

// ------------------------------------------------------------------ profiles
/** Roles a card plays besides its size (units are also counted by size: 軽い・中型・大型・挑発). */
export const ROLE_CARDS: Record<string, string[]> = {
  '単体除去': ['arrow', 'cage', 'e_shot', 'e_slash', 'g_spanner', 'g_trap', 'g_hammer', 'g_jammer', 'g_ringer', 'g_archer', 'e_bellkeeper'],
  '全体除去': ['collapse', 'e_storm', 'dragon', 'e_atra', 'g_quake', 'g_gearstorm', 'g_maze', 'g_turret', 'g_rewire'],
  '直接ダメージ': ['bolt', 'e_eternal', 'e_sprite', 'g_courier'],
  '予約への対策': ['e_break', 'breaker', 'e_peek', 'oracle', 'g_hush', 'g_silence', 'g_erase'],
  '引く': ['insight', 'e_draw', 'scribe', 'rewind', 'g_blueprint', 'g_resonance', 'g_clerk', 'g_engineer'],
  '回復': ['rewind', 'e_pray', 'g_warden', 'g_saint'],
  '時計操作': ['stop', 'e_reverse', 'delayer', 'g_seres', 'e_mage', 'e_verna', 'ghost'],
  '強化': ['haste', 'g_reroute', 'g_tune', 'g_overclock', 'g_shield', 'g_overdrive', 'e_march', 'g_lever', 'e_tuner', 'sentinel', 'g_belltoy', 'g_ringmaster', 'g_oiler'],
};
export function sizeRole(id: string): string | null {
  const c = cardDef(id);
  if (c.kind !== 'unit') return null;
  return c.keywords?.includes('taunt') ? '挑発' : c.cost <= 2 ? '軽いユニット' : c.cost <= 4 ? '中型ユニット' : '大型ユニット';
}
export function rolesOf(cards: string[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const id of cards) {
    const s = sizeRole(id);
    if (s) r[s] = (r[s] ?? 0) + 1;
    for (const [k, ids] of Object.entries(ROLE_CARDS)) if (ids.includes(id)) r[k] = (r[k] ?? 0) + 1;
  }
  return r;
}
export function listProfile(cards: string[]): ListProfile {
  const cs = cards.map(cardDef);
  return {
    avgCost: Math.round((cs.reduce((a, c) => a + c.cost, 0) / Math.max(1, cs.length)) * 100) / 100,
    cheap: cs.filter((c) => c.cost <= 2).length,
    units: cs.filter((c) => c.kind === 'unit').length,
    taunt: cs.filter((c) => c.keywords?.includes('taunt')).length,
    big: cs.filter((c) => c.cost >= 5).length,
  };
}
/** 戦型 from play numbers, checked in this order (the first that fits). */
export function styleOf(p: Pick<PlayProfile, 'end' | 'koShare' | 'dmg20' | 'resv'> & { cast: number }): Style {
  if (p.end <= 34.5 && p.koShare >= 58) return 'beat';
  if (p.cast >= 3.8 && p.dmg20 >= 4) return 'burn';
  if (p.dmg20 <= 1.4 && p.end >= 36.7) return 'endure';
  if (p.resv >= 3.4) return 'resv';
  return 'mid';
}
/** Cards two lists share (each card counted up to the smaller number of copies). */
export function shared(a: string[], b: string[]): number {
  const m = new Map<string, number>();
  for (const c of a) m.set(c, (m.get(c) ?? 0) + 1);
  let n = 0;
  for (const c of b) { const k = m.get(c) ?? 0; if (k > 0) { n++; m.set(c, k - 1); } }
  return n;
}
/** Two lists belong together from this many shared cards (of 20). */
export const SAME_GROUP = 12;
/** The archetype a list belongs to: the nearest origin list sharing at least 12 cards, or null (未分類). */
export function classify(cards: string[]): string | null {
  let best: string | null = null, bn = SAME_GROUP - 1;
  for (const id of Object.keys(BLUEPRINTS)) {
    const o = originList(id);
    if (!o) continue;
    const n = shared(o, cards);
    if (n > bn) { bn = n; best = id; }
  }
  return best;
}

// ------------------------------------------------------------------ the checks a changed list must pass
/** Most cards a list may differ from its archetype's first version by. */
export const MAX_FROM_ORIGIN = 6;
/**
 * Everything wrong with `cards` as a list of archetype `id` (empty = fine): legal deck, only cards in the game,
 * the core kept, at most 6 cards away from the first version, the list and role numbers inside their ranges.
 */
export function checkList(id: string, cards: string[]): string[] {
  const bp = BLUEPRINTS[id];
  const o = originList(id);
  if (!bp || !o) return ['知らないアーキタイプ'];
  const out: string[] = [];
  if (cards.length !== RULES.DECK_SIZE) out.push(`${cards.length}枚`);
  const count: Record<string, number> = {};
  for (const c of cards) {
    if (!CARDS[c] || CARDS[c].token) { out.push(`ゲームにないカード ${c}`); continue; }
    count[c] = (count[c] ?? 0) + 1;
  }
  if (out.length) return out;
  for (const [c, n] of Object.entries(count)) if (n > (cardDef(c).rarity === 'L' ? RULES.MAX_LEGEND_COPIES : RULES.MAX_COPIES)) out.push(`${c}が多すぎる`);
  for (const [c, n] of Object.entries(bp.core)) if ((count[c] ?? 0) < n) out.push(`核の${c}が足りない`);
  if (RULES.DECK_SIZE - shared(o, cards) > MAX_FROM_ORIGIN) out.push(`最初の版から${RULES.DECK_SIZE - shared(o, cards)}枚違う`);
  const p = listProfile(cards), b = bp.list;
  if (Math.abs(p.avgCost - b.avgCost) > 0.3) out.push(`平均コスト${p.avgCost}`);
  if (Math.abs(p.cheap - b.cheap) > 3) out.push(`2コスト以下${p.cheap}枚`);
  if (Math.abs(p.units - b.units) > 2) out.push(`ユニット${p.units}枚`);
  if (p.taunt > b.taunt + 1) out.push(`挑発${p.taunt}枚`);
  if (p.big > b.big + 1) out.push(`5コスト以上${p.big}枚`);
  const r = rolesOf(cards);
  const coreRoles = new Set(Object.keys(bp.core).flatMap((c) => Object.keys(rolesOf([c]))));
  for (const k of new Set([...Object.keys(r), ...Object.keys(bp.roles)])) {
    const now = r[k] ?? 0, was = bp.roles[k] ?? 0;
    if (now > Math.max(2, was + 2) || now < was - 2) out.push(`${k}${now}枚`);
    if (coreRoles.has(k) && now < was) out.push(`核の役割「${k}」が減った`);
  }
  return out;
}
/** Whether simulated play numbers still look like the archetype (the same 戦型, each number within its range). */
export function checkPlay(id: string, p: PlayProfile & { cast: number }): string[] {
  const bp = BLUEPRINTS[id];
  if (!bp) return ['知らないアーキタイプ'];
  const b = bp.play, out: string[] = [];
  if (styleOf(p) !== bp.style) out.push(`戦型が${STYLE_NAMES[styleOf(p)]}になる`);
  // 歯車 sits on the 耐久 line (20刻までの拠点ダメージ1.4), so its range is narrower
  const dmgRange = id === 'g_mid' ? 1.0 : 1.5;
  if (Math.abs(p.end - b.end) > 1.5) out.push(`終わる刻${p.end}`);
  if (Math.abs(p.koShare - b.koShare) > 10) out.push(`KO勝ち${p.koShare}%`);
  if (Math.abs(p.dmg20 - b.dmg20) > dmgRange) out.push(`20刻までの拠点ダメージ${p.dmg20}`);
  if (b.atk > 0 && Math.abs(p.atk - b.atk) / b.atk > 0.3) out.push(`攻撃${p.atk}回`);
  if (b.resv > 0 && Math.abs(p.resv - b.resv) / b.resv > 0.3) out.push(`予約${p.resv}回`);
  if (Math.abs(p.hpEnd - b.hpEnd) > 1.5) out.push(`終了時の自拠点${p.hpEnd}`);
  return out;
}
