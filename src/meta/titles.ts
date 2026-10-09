/**
 * 称号: short labels a player earns by playing and shows under their name (home, profile, VS screen, ranking).
 * Every title is unlocked by numbers kept on the device. Conditions only use rules every set shares (wins, games,
 * the clock, reservations, lanes, the base, the deck), so new cards, sets or looks never change what one means.
 * Pure data and logic: the ranking server imports it to accept only real title ids.
 */

/** 格: how rare a title is, from the plainest to the most prestigious (each has its own look). */
export type TitleTone = 'yellow' | 'green' | 'blue' | 'bronze' | 'silver' | 'gold' | 'red';
export const TONE_ORDER: TitleTone[] = ['yellow', 'green', 'blue', 'bronze', 'silver', 'gold', 'red'];
export const TONE_NAMES: Record<TitleTone, string> = { yellow: '黄', green: '緑', blue: '青', bronze: '銅', silver: '銀', gold: '金', red: '赤' };
export type TitleGroup = '勝利' | '対戦' | 'レート戦' | '戦い方' | '勝ち方' | '収集と継続' | '季の称号';
export interface TitleDef {
  id: string; name: string; how: string; tone: TitleTone; group: TitleGroup;
  /** 季の称号: which season and rank (drawn as that season's plate instead of the grade's). */
  season?: { id: number; tier: string; label: string; rank: string };
}

/** What the unlock checks look at (all of it is on the device already). */
export interface TitleCtx {
  wins: number;
  battles: number;
  /** Lifetime counters: attack, summon, spell, reserve, pack…, craft, customWin and the 勝ち方 (win…). */
  counters: Record<string, number>;
  loginDays: number;
  packs: number;
  ownsLegend: boolean;
  /** Every card of 第1弾 owned at least once. */
  set1Complete: boolean;
  /** Themes owned with all three parts. */
  themesComplete: number;
  ratedGames: number;
  ratedPeak: number;
  /** Longest run of rated wins. */
  ratedStreak: number;
  /** Best rank (tier id) of each finished season, by season id. */
  seasonTiers?: Record<number, string>;
}

import { SEASONS, TIERS } from './ranks';

/** Rated games before the first rating counts as settled (rating.ts PLACEMENT_GAMES). */
const PLACEMENT = 10;
type T = TitleDef & { test: (c: TitleCtx) => boolean };
const g = (group: TitleGroup) => (id: string, name: string, how: string, tone: TitleTone, test: (c: TitleCtx) => boolean, season?: TitleDef['season']): T => ({ id, name, how, tone, group, test, ...(season ? { season } : {}) });
const win = g('勝利'), war = g('対戦'), rate = g('レート戦'), act = g('戦い方'), way = g('勝ち方'), keep = g('収集と継続');
const n = (c: TitleCtx, k: string) => c.counters[k] ?? 0;
const rated = (peak: number) => (c: TitleCtx) => c.ratedGames > 0 && c.ratedPeak >= peak;
const acts: [string, string, [string, string, string]][] = [
  ['reserve', '予約', ['予約の心得', '予約の名手', '未来を編む者']],
  ['summon', 'ユニットの召喚', ['召喚の心得', '召喚の名手', '千の軍勢']],
  ['spell', '術の使用', ['術の心得', '術の名手', '大術師']],
  ['attack', 'ユニットでの攻撃', ['攻撃の心得', '攻撃の名手', '千の刃']],
];

const ALL: T[] = [
  win('first', 'はじめての勝利', '対戦で1回勝つ', 'yellow', (c) => c.wins >= 1),
  win('ten', '十の勝ち星', '合計10回勝つ', 'green', (c) => c.wins >= 10),
  win('win50', '五十の勝ち星', '合計50回勝つ', 'blue', (c) => c.wins >= 50),
  win('win100', '百勝の針', '合計100回勝つ', 'bronze', (c) => c.wins >= 100),
  win('win300', '三百勝の歯車', '合計300回勝つ', 'silver', (c) => c.wins >= 300),
  win('win500', '五百勝の時計塔', '合計500回勝つ', 'gold', (c) => c.wins >= 500),

  war('war10', 'ねじを巻く者', '10回対戦する', 'yellow', (c) => c.battles >= 10),
  war('war50', '歴戦の歯車', '50回対戦する', 'green', (c) => c.battles >= 50),
  war('war100', '百戦の針', '100回対戦する', 'blue', (c) => c.battles >= 100),
  war('war300', '三百刻の旅人', '300回対戦する', 'bronze', (c) => c.battles >= 300),
  war('war500', '五百戦の古強者', '500回対戦する', 'silver', (c) => c.battles >= 500),
  war('war1000', '千戦の振り子', '1000回対戦する', 'gold', (c) => c.battles >= 1000),

  rate('debut', '初陣', `レート戦を${PLACEMENT}回戦う`, 'yellow', (c) => c.ratedGames >= PLACEMENT),
  rate('r1200', '刻士', 'レート戦で刻士（1200）に届く', 'blue', rated(1200)),
  rate('r1400', '刻匠', 'レート戦で刻匠（1400）に届く', 'bronze', rated(1400)),
  rate('r1600', '刻豪', 'レート戦で刻豪（1600）に届く', 'silver', rated(1600)),
  rate('r1800', '刻聖', 'レート戦で刻聖（1800）に届く', 'gold', rated(1800)),
  rate('r2000', '刻神', 'レート戦で刻神（2000）に届く', 'red', rated(2000)),
  rate('streak5', '五連の歯車', 'レート戦で5連勝する', 'bronze', (c) => c.ratedStreak >= 5),
  rate('streak10', '十連の時計', 'レート戦で10連勝する', 'gold', (c) => c.ratedStreak >= 10),

  ...acts.flatMap(([k, verb, [a, b, cc]]) => [
    act(`${k}100`, a, `${verb}を合計100回`, 'green', (c) => n(c, k) >= 100),
    act(`${k}500`, b, `${verb}を合計500回`, 'blue', (c) => n(c, k) >= 500),
    act(`${k}1000`, cc, `${verb}を合計1000回`, 'silver', (c) => n(c, k) >= 1000),
  ]),
  act('prophecy', '予言の成就', '予約の効果でとどめを刺して勝つ', 'blue', (c) => n(c, 'winResv') >= 1),

  way('doomWin', '終焉を越えて', '終焉（20刻）に入ってから勝つ', 'green', (c) => n(c, 'winDoom') >= 1),
  way('lateWin', '遅れて来た者', '相手より時計が進んだ（時間を多く使った）状態で勝つ', 'green', (c) => n(c, 'winLate') >= 1),
  way('lanes', '三列制圧', '自分の3列すべてにユニットがいる状態で勝つ', 'blue', (c) => n(c, 'winLanes') >= 1),
  way('legendBlow', '伝説の一撃', '伝説のカードでとどめを刺して勝つ', 'bronze', (c) => n(c, 'winLegend') >= 1),
  way('flawless', '無傷の凱旋', '拠点の体力が満タンのまま勝つ', 'bronze', (c) => n(c, 'winFlawless') >= 1),
  way('swift', '疾風の決着', '自分の時計が20刻になる前に相手の拠点を壊す', 'silver', (c) => n(c, 'winSwift') >= 1),
  way('comeback', '土壇場の逆転', '拠点の体力が3以下になってから勝つ', 'silver', (c) => n(c, 'winComeback') >= 1),
  way('empty', '空の砂時計', '手札も山札も0枚の状態で勝つ', 'silver', (c) => n(c, 'winEmpty') >= 1),
  way('perfect', '完全なる時計', '自分の時計がぴったり40刻のときに相手の拠点を壊す', 'gold', (c) => n(c, 'winPerfect') >= 1),
  way('untouched', '時を止めた者', '拠点に1度もダメージを受けずに勝つ', 'gold', (c) => n(c, 'winUntouched') >= 1),

  keep('pack10', '開封の儀', 'パックを10回開ける', 'yellow', (c) => c.packs >= 10),
  keep('pack100', '開封の達人', 'パックを100回開ける', 'blue', (c) => c.packs >= 100),
  keep('legend', '伝説の主', '伝説のカードを手に入れる', 'blue', (c) => c.ownsLegend),
  keep('craft10', '欠片の錬金術師', '欠片でカードを10枚作る', 'green', (c) => n(c, 'craft') >= 10),
  keep('set1', '第1弾の蒐集家', '第1弾のカードをすべて集める', 'gold', (c) => c.set1Complete),
  keep('custom30', '自作の歯車', '自分で作ったデッキで30回勝つ', 'blue', (c) => n(c, 'customWin') >= 30),
  keep('login7', '七日の鐘', 'ログイン7日', 'yellow', (c) => c.loginDays >= 7),
  keep('login30', '三十日の鐘', 'ログイン30日', 'green', (c) => c.loginDays >= 30),
  keep('login100', '百日の鐘', 'ログイン100日', 'bronze', (c) => c.loginDays >= 100),
  keep('tailor', '仕立て屋', 'テーマの文字盤・スリーブ・マットを3点そろえる', 'green', (c) => c.themesComplete >= 1),
];
// 季の称号: one title per finished season, for the best rank reached there (見習い to 刻神)
const SEASON_TONE: Record<string, TitleTone> = { novice: 'green', shi: 'blue', sho: 'bronze', go: 'silver', sei: 'gold', shin: 'red' };
const season = g('季の称号');
for (const se of SEASONS) {
  for (const t of TIERS) {
    const tone = SEASON_TONE[t.id];
    if (tone) ALL.push(season(`season${se.id}-${t.id}`, `${se.name} ${t.name}`, `${se.name}（${se.set}）の最高ランクが${t.name}`, tone, (c) => c.seasonTiers?.[se.id] === t.id, { id: se.id, tier: t.id, label: se.name, rank: t.name }));
  }
}
/** The titles every player can work towards (the season ones are added as seasons go by). */
export const BASE_TITLE_COUNT = ALL.filter((t) => t.group !== '季の称号').length;
export const TITLES: TitleDef[] = ALL.map(({ id, name, how, tone, group, season: se }) => ({ id, name, how, tone, group, ...(se ? { season: se } : {}) }));

/**
 * Titles of the first list (0.19 and before) that live on under a new id. Ids not listed here and not in TITLES
 * are gone; whoever had one keeps whatever the new list gives for the same numbers.
 */
export const RENAMED_TITLES: Record<string, string> = { war30: 'war10', master: 'r1200', sage: 'r1400', eternal: 'r1600', all: 'set1' };
export const titleById = (id: string | undefined | null): TitleDef | undefined => {
  if (!id) return undefined;
  const real = RENAMED_TITLES[id] ?? id;
  return TITLES.find((t) => t.id === real);
};
/** Ids of the titles `c` has earned, in list order. */
export function earnedTitles(c: TitleCtx): string[] {
  return ALL.filter((t) => t.test(c)).map((t) => t.id);
}
