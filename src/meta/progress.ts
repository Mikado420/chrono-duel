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
  /** 称号 shown under the name ('' = none). */
  title: string;
  /** Titles the player has already looked at in the title list (the rest show NEW). */
  titlesSeen: string[];
  /** Titles earned so far. A title once earned is kept (e.g. すべての刻 when new cards come out). */
  titlesEarned?: string[];
  /** One-off gifts already given (GIFTS). */
  giftsGot?: string[];
  /** ひとこと on the profile. */
  comment: string;
  /** Recent matches, newest first (戦歴 and the deck rings on the profile). */
  history: MatchRec[];
  /** Matches per deck since this was added, keyed by deck id. */
  deckUse: Record<string, { name: string; n: number }>;
  /** Presents already taken, newest first (受け取り履歴). */
  presentLog: PresentLog[];
  /** `seq` when the present box was last opened: presents above it show NEW. */
  presentsSeen: number;
}
export interface MatchRec { at: number; mode: 'free' | 'rated' | 'online'; result: 'win' | 'lose' | 'draw'; foe: string; deck: string; deckId: string; myHp: number; foeHp: number; reason: string }
export interface PresentLog { from: string; text: string; prize: Prize; at: string; got: string }
export const NEW_META = (): Meta => ({
  v: 1, exp: 0, loginDays: 0, lastLogin: '', day: '', daily: {}, dailyClaimed: [], counters: {}, beginnerClaimed: [], presents: [], seq: 0, newsRead: [], favorite: '', battles: 0,
  title: '', titlesSeen: [], comment: '', history: [], deckUse: {}, presentLog: [], presentsSeen: 0,
});

// ------------------------------------------------------------------ rank
/** EXP needed to go from rank r to r+1. */
export const expFor = (r: number) => 100 + r * 60;
export function rankOf(exp: number) {
  let r = 1, left = exp;
  while (left >= expFor(r) && r < 99) { left -= expFor(r); r++; }
  return { rank: r, into: left, need: expFor(r) };
}
export const rankPrize = (r: number): Prize => (r % 5 === 0 ? { coins: 50, tickets: 1 } : { coins: 50 });

// ------------------------------------------------------------------ presents
function give(m: Meta, from: string, text: string, prize: Prize, today: string) {
  m.presents.unshift({ id: `p${++m.seq}`, from, text, prize, at: today });
}
/** The reward for a finished season, as a present. */
export function grantSeasonReward(m: Meta, text: string, prize: { coins: number; tickets: number }, today: string) {
  give(m, '運営', text, { coins: prize.coins, ...(prize.tickets ? { tickets: prize.tickets } : {}) }, today);
}
export function claimPresents(m: Meta, ids?: string[], today = ''): Prize {
  const take = m.presents.filter((p) => !ids || ids.includes(p.id));
  m.presents = m.presents.filter((p) => !take.includes(p));
  m.presentLog = [...take.map((p) => ({ from: p.from, text: p.text, prize: p.prize, at: p.at, got: today })), ...(m.presentLog ?? [])].slice(0, 50);
  return take.reduce<Prize>((a, p) => ({ coins: (a.coins ?? 0) + (p.prize.coins ?? 0), tickets: (a.tickets ?? 0) + (p.prize.tickets ?? 0) }), {});
}

// ------------------------------------------------------------------ login bonus
export const LOGIN_CALENDAR: Prize[] = [{ coins: 30 }, { coins: 40 }, { coins: 50 }, { coins: 40 }, { coins: 60 }, { coins: 40 }, { tickets: 1 }];
/** Call when the home screen opens. Returns the calendar day (1..7) granted today, or null if already done. */
/** One-off gifts to every player (an event, a release), each given once into the present box. */
export const GIFTS: { id: string; from: string; text: string; prize: Prize; until?: string }[] = [
  { id: 'set1x', from: '運営', text: '第1弾 追加カード配信記念', prize: { tickets: 3 }, until: '2026-11-30' },
];
export function grantGifts(m: Meta, today: string): number {
  m.giftsGot ??= [];
  let n = 0;
  for (const g of GIFTS) {
    if (m.giftsGot.includes(g.id) || (g.until && today > g.until)) continue;
    m.giftsGot.push(g.id);
    give(m, g.from, g.text, g.prize, today);
    n++;
  }
  return n;
}
export function checkLogin(m: Meta, today: string): number | null {
  rollDay(m, today);
  grantGifts(m, today);
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
  { id: 'd_play2', text: '対戦を2回する', stat: 'play', goal: 2, prize: { coins: 20 } },
  { id: 'd_win1', text: '対戦で1回勝利する', stat: 'win', goal: 1, prize: { coins: 20 } },
  { id: 'd_spell5', text: '術を5回使う（予約を含む）', stat: 'spell', goal: 5, prize: { coins: 15 } },
  { id: 'd_summon8', text: 'ユニットを8体召喚する', stat: 'summon', goal: 8, prize: { coins: 15 } },
  { id: 'd_resv3', text: '未来予約を3回する', stat: 'reserve', goal: 3, prize: { coins: 15 } },
  { id: 'd_attack10', text: 'ユニットで10回攻撃する', stat: 'attack', goal: 10, prize: { coins: 15 } },
];
export const DAILY_ALL_BONUS: Prize = { coins: 30 };
export const BEGINNER: Mission[] = [
  { id: 'b_play', text: 'はじめての対戦をする', stat: 'play', goal: 1, prize: { coins: 100 } },
  { id: 'b_win', text: 'AIに勝利する', stat: 'win', goal: 1, prize: { coins: 100 } },
  { id: 'b_pack', text: 'パックを開封する', stat: 'pack', goal: 1, prize: { coins: 100 } },
  { id: 'b_deck', text: '自分のデッキを保存する', stat: 'deck', goal: 1, prize: { tickets: 1 } },
  { id: 'b_resv', text: '未来予約を合計10回する', stat: 'reserve', goal: 10, prize: { coins: 150 } },
  { id: 'b_win5', text: '合計5回勝利する', stat: 'win', goal: 5, prize: { tickets: 1 } },
  { id: 'b_hard', text: 'AI「つよい」に勝利する', stat: 'hardWin', goal: 1, prize: { tickets: 1 } },
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

/** Adds to a lifetime counter only (titles that have no daily mission). */
export function bump(meta: Meta, key: string, n = 1) {
  if (n) meta.counters[key] = (meta.counters[key] ?? 0) + n;
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

// ------------------------------------------------------------------ match history
/** Keeps a finished match for 戦歴 and counts it towards the deck it was played with. */
export function recordMatch(meta: Meta, r: MatchRec) {
  meta.history = [r, ...(meta.history ?? [])].slice(0, 30);
  meta.deckUse ??= {};
  const u = meta.deckUse[r.deckId] ?? { name: r.deck, n: 0 };
  meta.deckUse[r.deckId] = { name: r.deck, n: u.n + 1 };
}
export interface DeckShare { id: string; name: string; n: number; share: number }
/** Decks by how often they were played (largest first); the long tail is folded into one 'その他' slice. */
export function deckShares(counts: Record<string, { name: string; n: number }>, keep = 3): DeckShare[] {
  const rows = Object.entries(counts).map(([id, v]) => ({ id, name: v.name, n: v.n })).filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
  const total = rows.reduce((a, r) => a + r.n, 0);
  if (!total) return [];
  const head = rows.slice(0, keep), rest = rows.slice(keep).reduce((a, r) => a + r.n, 0);
  const out = head.map((r) => ({ ...r, share: r.n / total }));
  if (rest) out.push({ id: '', name: 'その他', n: rest, share: rest / total });
  return out;
}
/** The same for the last `n` matches. */
export function recentShares(meta: Meta, n = 20, keep = 3): DeckShare[] {
  const counts: Record<string, { name: string; n: number }> = {};
  for (const h of (meta.history ?? []).slice(0, n)) { const c = counts[h.deckId] ?? { name: h.deck, n: 0 }; c.n++; c.name = c.name || h.deck; counts[h.deckId] = c; }
  return deckShares(counts, keep);
}

// ------------------------------------------------------------------ news
export interface News { id: string; date: string; tag: 'お知らせ' | '新カード' | '機能追加' | '不具合修正'; title: string; body: string }
export const NEWS: News[] = [
  { id: 'n32', date: '2026-10-09', tag: '機能追加', title: 'レートのランクと称号を一新しました', body: 'レート戦のランクを「見習い・刻士（1200）・刻匠（1400）・刻豪（1600）・刻聖（1800）・刻神（2000）」の6段階にしました。称号は53種に増え、黄・緑・青・銅・銀・金・赤の7つの格に分かれます。格が高いほど札が豪華になり、銀と金には光が走り、赤は炎のように揺らめきます。「無傷の凱旋」「完全なる時計」など、勝ち方で手に入る称号も加わりました。名前が変わった称号は新しい称号へ引き継いでいます。また、基本デッキを削除できるようになりました（デッキ一覧からいつでも戻せます）。' },
  { id: 'n31', date: '2026-10-09', tag: 'お知らせ', title: '着せ替えの品ぞろえと価格を変更しました', body: '「カードの裏面」の名前を「スリーブ」に変えました。着せ替えは標準と8つのテーマだけになり、テーマの文字盤・マットは400コイン、スリーブは200コイン、3点セットは800コインです（一部を持っているときはその分を引いた額でそろえられます）。販売を終えたスリーブ・文字盤・マットを持っていた方には、代金をコインでお返ししています。' },
  { id: 'n30', date: '2026-10-09', tag: '機能追加', title: 'プレイマットと8つのテーマが登場しました', body: '自分の側の盤面に敷く「プレイマット」が加わりました。あわせて、文字盤・カードの裏面・マットがそろった8つのテーマ（透かし機械・天文時計・大聖堂・蒸気機関・和時計・深海の羅針盤・鍛冶場・記憶の書庫）をショップに追加しました。文字盤の奥で歯車が回ったり、終焉が近づくと縁が赤熱したりします。どれも300コインで、2点以上をまとめて交換すると2割引です。以前の色違いの文字盤は販売を終え、交換していた方には代金をコインでお返ししています。オンライン対戦では、あなたの裏面とマットが相手にも見えます。' },
  { id: 'n29', date: '2026-10-09', tag: '新カード', title: '第1弾「残響の刻」に追加カード8種が登場', body: '「残響の刻」パックに8種のカードが加わりました（通常3・希少3・秘宝1・伝説1）。新しい「予約専用」の囮の書は、相手に破棄されると相手の時計が4進み、発動すればカードを1枚引きます。忘却の砂は2刻で、相手に1枚捨てさせて自分は1枚引きます。配信記念として、11月30日までにログインするとパックチケット3枚をプレゼントします。また、一度獲得した称号は条件から外れても残るようになりました。' },
  { id: 'n28', date: '2026-10-09', tag: '機能追加', title: 'レート戦の対戦相手が、デッキを少しずつ調整するようになりました', body: 'レート戦の対戦相手は、みんなの対戦の傾向を見て、デッキのカードを少しずつ入れ替えるようになります。デッキの持ち味（速攻なら速攻、耐えるデッキなら耐える戦い方）は変わりません。強い相手ほど勝つための調整を、そうでない相手は顔ぶれを変える調整をします。' },
  { id: 'n27', date: '2026-10-09', tag: 'お知らせ', title: '対戦記録の使い道を追加しました', body: 'レート戦の対戦相手のデッキを改良するため、対戦記録を「どのレート帯でどんなデッキが使われ、どれくらい勝っているか」の集計にも使うようになりました。集計に使うのは端末ごとの匿名のIDとデッキ・勝敗だけで、名前や個人を特定できる形では公開しません。' },
  { id: 'n26', date: '2026-10-09', tag: '機能追加', title: 'レート戦の上位の相手が、あなたのデッキを読むようになりました', body: 'レートの高い相手は、あなたが出したカードからデッキを見抜き、それに合わせた戦い方をしてきます。最上位の相手は、伏せた予約の時刻も気にかけて動きます（中身はのぞきません）。あわせて、AIが試し打ちの中で伏せた予約の中身を参照していた問題を直しました。フリー対戦の「超つよい」も、伏せた予約の中身は分からないまま考えます。' },
  { id: 'n25', date: '2026-10-08', tag: '機能追加', title: 'レート戦の対戦相手が一新されました', body: 'レート戦に、それぞれ違う戦い方をする120人の対戦相手が登場します。攻めが得意な人、守りを固める人、予約で仕掛けてくる人など、相手ごとに性格と得意なデッキがあり、何度も当たると癖が見えてきます。前回あなたに負けた相手は、別のデッキで挑んでくることもあります。強い相手ほど読みが深く、ミスも少なくなります。' },
  { id: 'n24', date: '2026-10-08', tag: '機能追加', title: '観戦と、部屋の中でのデッキ・名前変更に対応しました', body: 'フレンド対戦の「観戦する」から、あいことばで友達の対戦を見られるようになりました（両者の手札は伏せたまま表示されます）。また、対戦が始まる前なら部屋の中でデッキと名前を変えられます。' },
  { id: 'n23', date: '2026-10-08', tag: '機能追加', title: '称号・着せ替え・攻撃の予告を追加しました', body: '遊んだ記録に応じて手に入る「称号」を20種追加しました。プロフィールで選ぶと、名前の下や対戦前のVS画面、ランキングに表示されます。ショップでカードの裏面と盤面の文字盤をコインで交換でき、デッキごとに選べます。対戦では攻撃できるユニットを選ぶと攻撃先と結果が先に見えるようになりました。ランキングには前日の順位が付きます。設定で振動のオン／オフを選べます。' },
  { id: 'n22', date: '2026-10-08', tag: '機能追加', title: '画面のデザインを一新しました', body: 'ホーム・バトル・デッキ・ショップ・その他の画面を、真鍮の時計の世界観に合わせて作り直しました。対戦の前に両者のカードと先手・後手が出るVS画面、パック開封で時計の針が次のカードを指す演出、まとめて見られる開封結果、プロフィールの戦歴とよく使うデッキ、結果画面でのミッションの進み具合を追加しています。' },
  { id: 'n21', date: '2026-10-02', tag: 'お知らせ', title: '最強デッキ・カードランキングを更新しました', body: '攻略wikiの最強デッキランキングを、環境デッキ（ヴェルナループなど）からファンデッキまで16個に広げ、いちばん強いAI同士の総当たりでTier分けしました。最強カードランキングも同じ対戦から計算し直し、みんなの実際の対戦での成績も並べて見られるようにしました。' },
  { id: 'n20', date: '2026-10-02', tag: '機能追加', title: '攻略wikiをリニューアルしました', body: '攻略wikiの見た目を一新し、カードの画像つきで見られるようにしました。全カードを5段階で評価した「最強カードランキング」と「最強デッキランキング」を追加しました。カードをタップすると、ページを移らずにその場で詳しい性能が開き、「前へ／次へ」で同じデッキや一覧のカードを順番に確認できます。' },
  { id: 'n19', date: '2026-10-02', tag: '機能追加', title: 'レート戦のマッチングを改善しました', body: 'レート戦で、自分のレートとかけ離れた相手と当たることがある問題を直しました。相手の強さの段階を増やし、自分のレートに近い相手と当たるようになります（上位帯でも、より手強い相手が出るようになりました）。' },
  { id: 'n18', date: '2026-10-01', tag: 'お知らせ', title: '対戦の記録を保存するようになりました', body: 'カードやルールの調整をより正確にするため、対戦が終わるたびに、その試合の記録（両者のデッキと、試合中のすべての行動）をサーバーに保存するようになりました。オンライン対戦はサーバーが記録します。記録は開発者が調整のために見るほか、レート戦の対戦相手のデッキを改良するための集計（どのレート帯でどんなデッキが使われ、どれくらい勝っているか）に使います。名前や個人を特定できる形では公開しません。ランキングに参加している場合は、ランキングの名前と結びつけて見ることがあります。カード別の成績の集計（攻略wikiの「実戦データ」）はこれまでどおりです。' },
  { id: 'n17', date: '2026-10-01', tag: 'お知らせ', title: '「鐘楼の歩哨」の表記を変更しました', body: '鐘楼の歩哨の能力を、新しいキーワード「鐘鳴」（自分の時計が鐘を越えるたびに効果が起きる）で表すようにしました。効果はこれまでと同じです。鐘鳴は今後のカードにも登場します。' },
  { id: 'n16', date: '2026-10-01', tag: '機能追加', title: '対戦データの集計と「実戦データ」ページを追加しました', body: 'カードの調整に役立てるため、対戦が終わるたびに、自分側のデッキ・使ったカード・勝敗を匿名で集計するようになりました（名前や対戦の中身は送りません）。集計結果は攻略wikiの「実戦データ」で誰でも見られます。人が使ったときに強いカード・弱いカードが分かるので、今後の調整の参考にします。' },
  { id: 'n15', date: '2026-10-01', tag: 'お知らせ', title: 'ルール変更：終焉の刻はユニットの攻撃にだけ乗るようになりました', body: 'ルールを変更しました。終焉の刻による拠点ダメージの増加は、ユニットの攻撃（貫通の超過分を含む）にだけ乗るようになりました。術や残響による拠点へのダメージは、終盤でもカードに書かれた数値のままです。盤面を無視して拠点を削る手段が終盤に強くなりすぎないようにするための変更です。あわせて、刻印の雷のコストを3→2に下げました。' },
  { id: 'n14', date: '2026-10-01', tag: 'お知らせ', title: 'カードのバランス調整を行いました', body: 'カードの強さを調整しました。【弱く】溜めの一閃：2+X→1+Xダメージ（予約時4→3）／崩落の刻：コスト3→4／刻溜めの巨兵：挑発を得る条件をX2以上→X3に／こだま撃ち：残響3→残響4／双子時計のアトラ：攻撃4→3。【強く】砂時計の番人：コスト3→2／残響術士：体力3→5／残響の歩兵：体力2→3／破約の刃：相手の予約を全て公開し、最も遅い予約か残響を破棄するように（予約時は遅い順に2つ）／停滞の檻：4刻→6刻（予約時6→8）／残響の祈り：回復2→3（残響も3、予約時3→4）。あわせて、AIが破約の刃を壊す相手がいないときに使わないようにしました。' },
  { id: 'n13', date: '2026-09-30', tag: '不具合修正', title: 'BGMが流れ始めるまでの時間を短縮しました', body: '次に流れる曲をあらかじめ読み込んでおくようにし、画面を切り替えてからBGMが流れ始めるまでの待ち時間を短くしました。無音の状態から曲が始まるときのフェードインも短くしています。' },
  { id: 'n12', date: '2026-09-30', tag: '機能追加', title: 'BGMを追加しました', body: 'タイトル画面・ホーム画面・対戦中にBGMが流れるようになりました。対戦中の曲は3曲からランダムに選ばれ、曲が終わると別の曲に切り替わります。ブラウザの仕様で最初のタップまでは音が出せないため、起動後はじめてタイトル画面をタップすると音楽が始まり、もう一度タップするとホームへ進みます。設定で「BGM」と「効果音」の音量を別々に調整できます。' },
  { id: 'n11', date: '2026-09-30', tag: '機能追加', title: 'デッキ編集画面をリニューアルしました', body: 'デッキ編集を1画面にまとめ、カード一覧とデッキを左右に並べて表示するようにしました。カードをタップするとデッキに入り、デッキ側のカードをタップすると1枚抜けます。長押しでカードの説明が見られます。上部に枚数・コスト分布・ユニットと術の枚数を常に表示し、カード名や効果での検索、並び替え（コスト・レア度・名前）、絞り込み（種類・セット・所持カードのみ）にも対応しました。「確認」では対戦に使えるかどうかと足りないカードをまとめて確認できます。' },
  { id: 'n10', date: '2026-09-30', tag: '不具合修正', title: 'スマホでのデッキ編集を使いやすくしました', body: 'スマホでカード一覧のカードを長押ししても説明が見られない（指を離すと1枚追加されてしまう）不具合を修正しました。各カードに「i」ボタンも付け、タップで説明を開けるようにしました。また、カード一覧の画面下に今のデッキを常に表示するようにしました。枚数の確認、カードを押しての1枚抜き、保存をタブを切り替えずに行えます。' },
  { id: 'n9', date: '2026-09-30', tag: '不具合修正', title: '充填ユニットが出せないことがある不具合を修正しました', body: '「溜め斬りの剣士」「刻溜めの巨兵」などの充填ユニットを、ドラッグで置いたとき、または空きレーンが1つだけのときに「召喚する」を押したとき、充填の選択がすぐ閉じて召喚できない不具合を修正しました。あわせて、自分のユニットをタップして攻撃を選ぶ操作が効かなかった不具合も修正しました。ご報告ありがとうございました。' },
  { id: 'n8', date: '2026-09-30', tag: '機能追加', title: 'レート戦と友達ランキングを追加しました', body: 'バトルに「レート戦」が加わりました。レートの近い相手とマッチングして対戦し、段位（見習い・刻守・時計師・刻匠・時の賢者・永劫）を目指しましょう。段位が上がるほど手強い相手が待っています。レートは友達ランキングで比べられます。1手45秒の持ち時間があり、降参や途中でアプリを閉じた場合は敗北になります。フリー対戦ではAIの強さに「やさしい」「超つよい」も選べるようになりました。' },
  { id: 'n7', date: '2026-09-30', tag: 'お知らせ', title: '攻略wikiを公開しました', body: 'ルール、全カードの効果と攻略メモ、デッキの相性表、立ち回りのコツ、パックの提供割合をまとめた攻略wikiを公開しました。「メニュー」→「攻略wiki」、または「遊び方」の一番下から開けます。' },
  { id: 'n6', date: '2026-09-30', tag: 'お知らせ', title: '「欠片」とカード作成を追加し、報酬を見直しました', body: '上限枚数を超えて出たカードは、コインではなく「欠片」になりました。欠片を集めると、カード図鑑やデッキ編集から好きなカードを作成できます（通常40・希少100・秘宝400・伝説1600）。あわせて、対戦・ミッション・ログインボーナスの報酬を見直し、対戦の報酬に1日の上限（250コイン）を設けました。パックの価格は100コインのままです。すでにお持ちのコインとカードはそのまま使えます。' },
  { id: 'n5', date: '2026-09-30', tag: '機能追加', title: 'ホーム画面・ミッション・ログインボーナスを追加しました', body: 'ホーム画面をリニューアルしました。毎日のログインボーナス、デイリーミッション、初心者ミッション、プレゼントボックス、プレイヤーランクが加わりました。報酬はすべてゲーム内のコインとパックチケットです。' },
  { id: 'n4', date: '2026-09-30', tag: '新カード', title: '第1弾パック「残響の刻」配信開始', body: '新キーワード「残響」「共鳴」「急襲」「充填」を持つ新カード22種を収録した第1弾パックを配信しました。ショップでコインまたはパックチケットと交換できます。提供割合はショップ画面の「提供割合」からご確認いただけます。' },
  { id: 'n3', date: '2026-09-30', tag: '不具合修正', title: 'スマートフォンで画面が崩れる不具合を修正しました', body: '端末を横にしてから縦に戻すと、対戦画面の配置が崩れる場合がある不具合を修正しました。また、縦画面でも対戦中に行動ログを確認できるようになりました（画面右上のログボタン）。' },
  { id: 'n2', date: '2026-09-29', tag: '機能追加', title: 'オンライン対戦（フレンド対戦）を開始しました', body: 'あいことば、または招待リンクで友達と対戦できるようになりました。1手45秒の持ち時間があり、接続が切れても60秒以内なら続きから再開できます。' },
  { id: 'n1', date: '2026-09-29', tag: 'お知らせ', title: 'クロノ・デュエルへようこそ', body: 'ターンのない対戦カードゲーム「クロノ・デュエル」を遊んでいただきありがとうございます。すべての行動は時間（刻）を支払い、時計が遅れている方が次に動きます。はじめての方は「メニュー」→「遊び方」もご覧ください。' },
];
export const unreadNews = (m: Meta) => NEWS.filter((n) => !m.newsRead.includes(n.id)).length;
