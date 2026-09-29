/**
 * Long-term progression shown on the home screen: player rank, login bonus, daily and beginner missions,
 * the present box and news. Pure logic over a serializable `Meta` object (the UI stores it).
 */
export type Prize = { coins?: number; tickets?: number };
export const prizeText = (p: Prize) => [p.coins ? `コイン ${p.coins}` : '', p.tickets ? `パックチケット ${p.tickets}枚` : ''].filter(Boolean).join('・');

export interface Present { id: string; from: string; text: string; prize: Prize; at: string }
export interface Meta {
  v: 1;
  exp: number;
  /** Cumulative login days (the bonus calendar repeats every 7). */
  loginDays: number;
  lastLogin: string;
  /** Daily mission progress for `day`. */
  day: string;
  daily: Record<string, number>;
  dailyClaimed: string[];
  /** Beginner (one-time) missions. */
  counters: Record<string, number>;
  beginnerClaimed: string[];
  presents: Present[];
  seq: number;
  newsRead: string[];
  /** Card shown large on the home screen. */
  favorite: string;
  battles: number;
}
export const NEW_META = (): Meta => ({ v: 1, exp: 0, loginDays: 0, lastLogin: '', day: '', daily: {}, dailyClaimed: [], counters: {}, beginnerClaimed: [], presents: [], seq: 0, newsRead: [], favorite: '', battles: 0 });

// ------------------------------------------------------------------ rank
/** EXP needed to go from rank r to r+1. */
export const expFor = (r: number) => 100 + r * 60;
export function rankOf(exp: number) {
  let r = 1, left = exp;
  while (left >= expFor(r) && r < 99) { left -= expFor(r); r++; }
  return { rank: r, into: left, need: expFor(r) };
}
export const rankPrize = (r: number): Prize => (r % 5 === 0 ? { coins: 100, tickets: 1 } : { coins: 100 });

// ------------------------------------------------------------------ presents
function give(m: Meta, from: string, text: string, prize: Prize, today: string) {
  m.presents.unshift({ id: `p${++m.seq}`, from, text, prize, at: today });
}
export function claimPresents(m: Meta, ids?: string[]): Prize {
  const take = m.presents.filter((p) => !ids || ids.includes(p.id));
  m.presents = m.presents.filter((p) => !take.includes(p));
  return take.reduce<Prize>((a, p) => ({ coins: (a.coins ?? 0) + (p.prize.coins ?? 0), tickets: (a.tickets ?? 0) + (p.prize.tickets ?? 0) }), {});
}

// ------------------------------------------------------------------ login bonus
export const LOGIN_CALENDAR: Prize[] = [{ coins: 50 }, { coins: 100 }, { tickets: 1 }, { coins: 100 }, { coins: 150 }, { coins: 100 }, { tickets: 2 }];
/** Call when the home screen opens. Returns the calendar day (1..7) granted today, or null if already done. */
export function checkLogin(m: Meta, today: string): number | null {
  rollDay(m, today);
  if (m.lastLogin === today) return null;
  m.lastLogin = today;
  const d = (m.loginDays % 7) + 1;
  m.loginDays++;
  give(m, 'ログインボーナス', `${d}日目のログインボーナス`, LOGIN_CALENDAR[d - 1], today);
  return d;
}

// ------------------------------------------------------------------ missions
export type Stat = 'play' | 'win' | 'spell' | 'summon' | 'reserve' | 'attack' | 'hardWin' | 'online' | 'pack' | 'deck';
export interface Mission { id: string; text: string; stat: Stat; goal: number; prize: Prize }

/** Daily missions are drawn from this pool, three per day. */
const DAILY_POOL: Mission[] = [
  { id: 'd_play2', text: '対戦を2回する', stat: 'play', goal: 2, prize: { coins: 40 } },
  { id: 'd_win1', text: '対戦で1回勝利する', stat: 'win', goal: 1, prize: { coins: 50 } },
  { id: 'd_spell5', text: '術を5回使う（予約を含む）', stat: 'spell', goal: 5, prize: { coins: 30 } },
  { id: 'd_summon8', text: 'ユニットを8体召喚する', stat: 'summon', goal: 8, prize: { coins: 30 } },
  { id: 'd_resv3', text: '未来予約を3回する', stat: 'reserve', goal: 3, prize: { coins: 30 } },
  { id: 'd_attack10', text: 'ユニットで10回攻撃する', stat: 'attack', goal: 10, prize: { coins: 30 } },
];
export const DAILY_ALL_BONUS: Prize = { coins: 50 };
export const BEGINNER: Mission[] = [
  { id: 'b_play', text: 'はじめての対戦をする', stat: 'play', goal: 1, prize: { coins: 100 } },
  { id: 'b_win', text: 'AIに勝利する', stat: 'win', goal: 1, prize: { coins: 100 } },
  { id: 'b_pack', text: 'パックを開封する', stat: 'pack', goal: 1, prize: { coins: 100 } },
  { id: 'b_deck', text: '自分のデッキを保存する', stat: 'deck', goal: 1, prize: { tickets: 1 } },
  { id: 'b_resv', text: '未来予約を合計10回する', stat: 'reserve', goal: 10, prize: { coins: 150 } },
  { id: 'b_win5', text: '合計5回勝利する', stat: 'win', goal: 5, prize: { tickets: 1 } },
  { id: 'b_hard', text: 'AI「つよい」に勝利する', stat: 'hardWin', goal: 1, prize: { tickets: 2 } },
  { id: 'b_online', text: 'オンライン対戦をする', stat: 'online', goal: 1, prize: { coins: 200 } },
];

function hash(s: string) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
/** Today's three daily missions (same for everyone on the same date). */
export function dailyMissions(day: string): Mission[] {
  const pool = DAILY_POOL.slice();
  const out: Mission[] = [pool.splice(pool.findIndex((m) => m.id === 'd_play2'), 1)[0]];
  let h = hash(day);
  while (out.length < 3) { out.push(pool.splice(h % pool.length, 1)[0]); h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0; }
  return out;
}
function rollDay(m: Meta, today: string) {
  if (m.day === today) return;
  m.day = today; m.daily = {}; m.dailyClaimed = [];
}

export interface MissionView { m: Mission; now: number; done: boolean; claimed: boolean }
export function dailyView(meta: Meta, today: string): MissionView[] {
  rollDay(meta, today);
  return dailyMissions(today).map((m) => {
    const now = Math.min(m.goal, meta.daily[m.stat] ?? 0);
    return { m, now, done: now >= m.goal, claimed: meta.dailyClaimed.includes(m.id) };
  });
}
export function beginnerView(meta: Meta): MissionView[] {
  return BEGINNER.map((m) => {
    const now = Math.min(m.goal, meta.counters[m.stat] ?? 0);
    return { m, now, done: now >= m.goal, claimed: meta.beginnerClaimed.includes(m.id) };
  });
}
/** Missions finished but not yet claimed (the red badge on the home screen). */
export function claimable(meta: Meta, today: string): number {
  const d = dailyView(meta, today);
  const allBonus = d.every((x) => x.claimed) && !meta.dailyClaimed.includes('all') ? 1 : 0;
  return d.filter((x) => x.done && !x.claimed).length + beginnerView(meta).filter((x) => x.done && !x.claimed).length + allBonus;
}
export function claimMission(meta: Meta, id: string, today: string): Prize | null {
  const d = dailyView(meta, today);
  if (id === 'all') {
    if (!d.every((x) => x.claimed) || meta.dailyClaimed.includes('all')) return null;
    meta.dailyClaimed.push('all');
    return DAILY_ALL_BONUS;
  }
  const v = d.find((x) => x.m.id === id) ?? beginnerView(meta).find((x) => x.m.id === id);
  if (!v || !v.done || v.claimed) return null;
  if (id.startsWith('d_')) meta.dailyClaimed.push(id); else meta.beginnerClaimed.push(id);
  return v.m.prize;
}

export function track(meta: Meta, stat: Stat, n: number, today: string) {
  if (!n) return;
  rollDay(meta, today);
  meta.daily[stat] = (meta.daily[stat] ?? 0) + n;
  meta.counters[stat] = (meta.counters[stat] ?? 0) + n;
}

// ------------------------------------------------------------------ battles
export interface BattleStats { won: boolean; played: boolean; hard: boolean; online: boolean; spells: number; summons: number; reserves: number; attacks: number }
/** Counts a finished match towards missions and rank. Returns EXP gained and any rank-ups (rewards go to presents). */
export function recordBattle(meta: Meta, b: BattleStats, today: string): { exp: number; before: number; after: number } {
  const before = rankOf(meta.exp).rank;
  if (!b.played) return { exp: 0, before, after: before };
  meta.battles++;
  track(meta, 'play', 1, today);
  if (b.won) track(meta, 'win', 1, today);
  if (b.won && b.hard) track(meta, 'hardWin', 1, today);
  if (b.online) track(meta, 'online', 1, today);
  track(meta, 'spell', b.spells + b.reserves, today);
  track(meta, 'summon', b.summons, today);
  track(meta, 'reserve', b.reserves, today);
  track(meta, 'attack', b.attacks, today);
  const exp = Math.round((b.won ? 100 : 40) * (b.hard ? 1.5 : 1) * (b.online ? 1.2 : 1));
  meta.exp += exp;
  const after = rankOf(meta.exp).rank;
  for (let r = before + 1; r <= after; r++) give(meta, 'ランクアップ', `ランク${r}到達のお祝い`, rankPrize(r), today);
  return { exp, before, after };
}

// ------------------------------------------------------------------ news
export interface News { id: string; date: string; tag: 'お知らせ' | '新カード' | '機能追加' | '不具合修正'; title: string; body: string }
export const NEWS: News[] = [
  { id: 'n5', date: '2026-09-30', tag: '機能追加', title: 'ホーム画面・ミッション・ログインボーナスを追加しました', body: 'ホーム画面をリニューアルしました。毎日のログインボーナス、デイリーミッション、初心者ミッション、プレゼントボックス、プレイヤーランクが加わりました。報酬はすべてゲーム内のコインとパックチケットです。' },
  { id: 'n4', date: '2026-09-30', tag: '新カード', title: '第1弾パック「残響の刻」配信開始', body: '新キーワード「残響」「共鳴」「急襲」「充填」を持つ新カード22種を収録した第1弾パックを配信しました。ショップでコインまたはパックチケットと交換できます。提供割合はショップ画面の「提供割合」からご確認いただけます。' },
  { id: 'n3', date: '2026-09-30', tag: '不具合修正', title: 'スマートフォンで画面が崩れる不具合を修正しました', body: '端末を横にしてから縦に戻すと、対戦画面の配置が崩れる場合がある不具合を修正しました。また、縦画面でも対戦中に行動ログを確認できるようになりました（画面右上のログボタン）。' },
  { id: 'n2', date: '2026-09-29', tag: '機能追加', title: 'オンライン対戦（フレンド対戦）を開始しました', body: 'あいことば、または招待リンクで友達と対戦できるようになりました。1手45秒の持ち時間があり、接続が切れても60秒以内なら続きから再開できます。' },
  { id: 'n1', date: '2026-09-29', tag: 'お知らせ', title: 'クロノ・デュエルへようこそ', body: 'ターンのない対戦カードゲーム「クロノ・デュエル」を遊んでいただきありがとうございます。すべての行動は時間（刻）を支払い、時計が遅れている方が次に動きます。はじめての方は「メニュー」→「遊び方」もご覧ください。' },
];
export const unreadNews = (m: Meta) => NEWS.filter((n) => !m.newsRead.includes(n.id)).length;
