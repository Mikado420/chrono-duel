/**
 * 称号: short labels a player earns by playing and shows under their name (home, profile, VS screen, ranking).
 * Every title is unlocked by numbers the game already keeps, so nothing new has to be tracked to earn one.
 * Pure data and logic: the ranking server imports it to accept only real title ids.
 */
export type TitleTone = 'green' | 'teal' | 'blue' | 'purple' | 'gold';
export interface TitleDef { id: string; name: string; how: string; tone: TitleTone }

/** What the unlock checks look at (all of it is on the device already). */
export interface TitleCtx {
  wins: number;
  battles: number;
  counters: Record<string, number>;
  loginDays: number;
  rank: number;
  packs: number;
  /** Collection progress over every collectible card, 0–100. */
  collected: number;
  ownsLegend: boolean;
  ratedGames: number;
  ratedPeak: number;
}

const T = (id: string, name: string, how: string, tone: TitleTone, test: (c: TitleCtx) => boolean) => ({ id, name, how, tone, test });
const ALL = [
  T('first', 'はじめての勝利', '対戦で1回勝つ', 'green', (c) => c.wins >= 1),
  T('ten', '十の勝ち星', '合計10回勝つ', 'green', (c) => c.wins >= 10),
  T('login7', '七日の鐘', 'ログイン7日', 'green', (c) => c.loginDays >= 7),
  T('war30', '歴戦の歯車', '30回対戦する', 'teal', (c) => c.battles >= 30),
  T('war100', '百戦の針', '100回対戦する', 'blue', (c) => c.battles >= 100),
  T('resv', '予約の名手', '未来予約を合計50回する', 'teal', (c) => (c.counters.reserve ?? 0) >= 50),
  T('summon', '百の召喚', 'ユニットを合計100体召喚する', 'teal', (c) => (c.counters.summon ?? 0) >= 100),
  T('spell', '術の探究者', '術を合計100回使う', 'teal', (c) => (c.counters.spell ?? 0) >= 100),
  T('attack', '突撃の号令', 'ユニットで合計300回攻撃する', 'blue', (c) => (c.counters.attack ?? 0) >= 300),
  T('hard', '強者を討つ', 'AI「つよい」以上に勝つ', 'blue', (c) => (c.counters.hardWin ?? 0) >= 1),
  T('friend', '時を競う友', 'オンライン対戦を10回する', 'blue', (c) => (c.counters.online ?? 0) >= 10),
  T('pack10', '開封の儀', 'パックを10回開ける', 'teal', (c) => c.packs >= 10),
  T('legend', '伝説の主', '伝説のカードを手に入れる', 'gold', (c) => c.ownsLegend),
  T('half', '蒐集家', 'カードを半分集める', 'purple', (c) => c.collected >= 50),
  T('all', 'すべての刻', 'カードをすべて集める', 'gold', (c) => c.collected >= 100),
  T('rank10', '熟練の針', 'ランク10になる', 'purple', (c) => c.rank >= 10),
  T('smith', '時計師', 'レート戦で時計師に届く', 'blue', (c) => c.ratedGames > 0 && c.ratedPeak >= 1100),
  T('master', '刻匠', 'レート戦で刻匠に届く', 'purple', (c) => c.ratedGames > 0 && c.ratedPeak >= 1300),
  T('sage', '時の賢者', 'レート戦で時の賢者に届く', 'gold', (c) => c.ratedGames > 0 && c.ratedPeak >= 1500),
  T('eternal', '永劫', 'レート戦で永劫に届く', 'gold', (c) => c.ratedGames > 0 && c.ratedPeak >= 1700),
];
export const TITLES: TitleDef[] = ALL.map(({ id, name, how, tone }) => ({ id, name, how, tone }));
export const titleById = (id: string | undefined | null): TitleDef | undefined => (id ? TITLES.find((t) => t.id === id) : undefined);
/** Ids of the titles `c` has earned, in list order. */
export function earnedTitles(c: TitleCtx): string[] {
  return ALL.filter((t) => t.test(c)).map((t) => t.id);
}
