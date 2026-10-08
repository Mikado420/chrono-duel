/*
 * 毎日の改良と発見: `npm run daily` (GitHub Actions runs it every day at 4:30 JST, see .github/workflows/daily-decks.yml)
 *
 *   1. reads the server's tables (環境 of the last 7 days, the players' lists, the current deck book)
 *   2. settles the lists on trial: kept when they do as well as the list they would replace in real games, dropped
 *      when they do 5 points worse (300 games), kept after 14 days without enough games (the simulation backed them)
 *   3. improves a few book entries (rotating every day) by simulation: Lv8–10 for strength, Lv1–7 for variety
 *   4. finds new decks and 型 in the players' lists, and decks that may need a balance change
 *   5. publishes the new book (new lists go on trial in half of the games) and writes a report
 *
 * Settings (environment): SERVER (wss:// or https:// of the online server), ADMIN_TOKEN, ORIGIN (an allowed origin,
 * default https://mikado420.github.io), PUBLISH=1 to write the book, ENTRIES (book entries to improve per day,
 * default 4), BUDGET_MIN (minutes of simulation, default 40), OUT (report directory, default .), SCALE (games × this,
 * default 1), FAKE (a JSON file with { env, lists, book } to run without a server).
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { BLUEPRINTS, STYLE_NAMES, originList } from '../meta/blueprints';
import { EMPTY_BOOK, archeOf, bookKey, cleanBook, type BookEntry, type DeckBook } from '../meta/deckbook';
import { tierOf, TIERS } from '../meta/rating';
import { ROSTER, deckAvailable, rivalDeckName } from '../meta/roster';
import { findNewDecks, findVariants, improve, type ListRow, type Opp } from './evolve';
import { cardDef } from '../core/cards';

const proc = process as unknown as { env: Record<string, string | undefined>; exit(c: number): never; stdout: { write(s: string): void } };
const E = proc.env;
const log = (s: string) => proc.stdout.write(s + '\n');
const base = (E.SERVER ?? '').replace(/^ws/, 'http').replace(/\/$/, '');
const ORIGIN = E.ORIGIN ?? 'https://mikado420.github.io';
const ENTRIES = +(E.ENTRIES ?? 4);
const BUDGET_MS = +(E.BUDGET_MIN ?? 40) * 60_000;
const OUT = E.OUT ?? '.';
/** SCALE=0.1 runs a tenth of the games (for trying the tool quickly). */
const SCALE = +(E.SCALE ?? 1);
const sz = (n: number) => Math.max(4, Math.round(n * SCALE));
const t0 = Date.now();
const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const dayIndex = Math.floor((Date.now() + 9 * 3_600_000) / 86_400_000);

type Cell = { games: number; players: number; score: number; expected: number };
interface EnvRes { days: [string, string]; bands: Record<string, Record<string, Cell>>; rivals: Record<string, Cell>; friends: Record<string, [number, number]> }

/** POST with up to three tries (a connection left idle during the simulation may have been closed). */
async function post<T>(path: string, body: unknown): Promise<T | null> {
  if (!base) return null;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, connection: 'close' }, body: JSON.stringify(body) });
      if (!res.ok) { log(`${path}: HTTP ${res.status} ${await res.text()}`); return null; }
      return (await res.json()) as T;
    } catch (e) {
      log(`${path}: ${(e as Error).message}${i < 2 ? '（もう一度）' : ''}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return null;
}

// ---- 1. read
let env: EnvRes | null, lists: ListRow[], book: DeckBook;
if (E.FAKE) {
  const f = JSON.parse(readFileSync(E.FAKE, 'utf8')) as { env: EnvRes; lists: ListRow[]; book?: DeckBook };
  env = f.env; lists = f.lists; book = cleanBook(f.book ?? EMPTY_BOOK);
} else {
  env = await post<EnvRes>('/api/env', { days: 7 });
  lists = E.ADMIN_TOKEN ? (await post<{ lists: ListRow[] }>('/api/env/lists', { token: E.ADMIN_TOKEN, min: 1 }))?.lists ?? [] : [];
  book = cleanBook(await post<DeckBook>('/api/decks', {}));
}
if (!env) { log('サーバーから集計を読めませんでした（SERVER を確かめてください）。シミュレーションだけで進めます。'); env = { days: [today, today], bands: {}, rivals: {}, friends: {} }; }
const report: string[] = [`# 環境レポート ${today}`, '', `集計期間：${env.days[0]}〜${env.days[1]}（7日）`, ''];
const issues: string[] = [];

// ---- the book's entries: which archetypes the rivals use, at which strength
interface Entry { key: string; arche: string; mode: 'hi' | 'lo'; bands: Set<string>; rivals: string[] }
const entries = new Map<string, Entry>();
for (const r of ROSTER) for (const d of [r.deck, r.sub]) {
  if (!deckAvailable(d) || !BLUEPRINTS[d]) continue;
  const key = bookKey(d, r.lv);
  const e = entries.get(key) ?? { key, arche: d, mode: r.lv >= 8 ? 'hi' : 'lo', bands: new Set<string>(), rivals: [] };
  e.bands.add(tierOf(r.rating).tier.id);
  e.rivals.push(r.name);
  entries.set(key, e);
}
const entryOf = (key: string): BookEntry => book.decks[key] ?? { v: 1, cards: originList(archeOf(key))! };
const perf = (c?: Cell) => (c && c.games ? (c.score - c.expected) / c.games : 0);
const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}`;
const next: DeckBook = { version: book.version, at: Date.now(), decks: structuredClone(book.decks) };
let changed = false;
const maxV = () => Math.max(1, ...Object.values(next.decks).flatMap((e) => [e.v, e.trial?.v ?? 0]));

// ---- 2. trials
report.push('## お試し中のリスト', '');
let anyTrial = false;
for (const [key, e] of Object.entries(next.decks)) {
  if (!e.trial) continue;
  anyTrial = true;
  const a = archeOf(key);
  const main = env.rivals[`${a}@${e.v}`], trial = env.rivals[`${a}@${e.trial.v}`];
  const age = (Date.now() - (e.trial.since ?? Date.now())) / 86_400_000;
  const line = `- ${rivalDeckName(a)}（${key.endsWith('~lo') ? 'Lv1〜7' : 'Lv8〜10'}）版${e.trial.v}：実戦 ${trial?.games ?? 0}試合、期待との差 ${pct(perf(trial))}（今の版 ${pct(perf(main))}）`;
  if ((trial?.games ?? 0) >= 300) {
    if (perf(trial) < perf(main) - 0.05) { report.push(line + ' → **取り下げ**（今の版より5ポイント以上悪い）'); delete e.trial; }
    else { report.push(line + ' → **採用**'); next.decks[key] = { v: e.trial.v, cards: e.trial.cards }; }
    changed = true;
  } else if (age > 14) { report.push(line + ' → **採用**（14日で300試合に届かず、シミュレーションの結果で採用）'); next.decks[key] = { v: e.trial.v, cards: e.trial.cards }; changed = true; }
  else report.push(line + ` → 続ける（${Math.floor(age)}日目）`);
}
if (!anyTrial) report.push('なし');
report.push('');

// ---- 3. improve today's entries
const keys = [...entries.keys()].sort();
const todays: Entry[] = [];
for (let i = 0; i < keys.length && todays.length < ENTRIES; i++) {
  const e = entries.get(keys[(dayIndex * ENTRIES + i) % keys.length])!;
  if (!next.decks[e.key]?.trial && !todays.includes(e)) todays.push(e);
}
const usable = Object.keys(BLUEPRINTS).filter((id) => deckAvailable(id));
report.push('## 今日の改良', '');
for (const e of todays) {
  if (Date.now() - t0 > BUDGET_MS) { report.push(`- ${rivalDeckName(e.arche)}：時間切れで次回へ`); continue; }
  // the players' deck mix where these rivals play (uniform when there is too little data)
  const mix: Record<string, number> = {};
  for (const b of e.bands) for (const [a, c] of Object.entries(env.bands[b] ?? {})) if (a !== 'other' && usable.includes(a)) mix[a] = (mix[a] ?? 0) + c.games;
  const total = Object.values(mix).reduce((x, y) => x + y, 0);
  const opps: Opp[] = total >= 50 ? Object.entries(mix).map(([id, w]) => ({ id, w, cards: originList(id)! })) : usable.map((id) => ({ id, w: 1, cards: originList(id)! }));
  const cur = entryOf(e.key);
  const pick = improve(e.arche, cur.cards, opps, e.mode, { candidates: sz(20), screen: sz(60), confirm: sz(300), profile: sz(150), seed: dayIndex * 1000 + keys.indexOf(e.key), log });
  const label = `${rivalDeckName(e.arche)}（${e.mode === 'hi' ? 'Lv8〜10・強さ' : 'Lv1〜7・新しさ'}、相手は${total >= 50 ? 'プレイヤーの使用比率' : '全デッキ均等'}）`;
  if (!pick) { report.push(`- ${label}：変更なし`); continue; }
  const v = maxV() + 1;
  next.decks[e.key] = { v: cur.v, cards: cur.cards, trial: { v, cards: pick.cards, share: 0.5, since: Date.now() } };
  changed = true;
  report.push(`- ${label}：**${pick.why}** を版${v}としてお試し（勝率 ${pct(pick.diff)}±${(pick.se * 196).toFixed(1)}、戦型 ${STYLE_NAMES[BLUEPRINTS[e.arche].style]} のまま）`);
}
report.push('');

// ---- 4. the environment, new decks, 型, balance
report.push('## 段位ごとの使用デッキ', '');
for (const t of TIERS) {
  const tab = env.bands[t.id];
  if (!tab) continue;
  const all = Object.values(tab).reduce((a, c) => a + c.games, 0);
  const rows = Object.entries(tab).sort((a, b) => b[1].games - a[1].games).slice(0, 6);
  report.push(`- **${t.name}**（${all}試合）：` + rows.map(([a, c]) => `${a === 'other' ? '未分類' : rivalDeckName(a)} ${Math.round((100 * c.games) / all)}%（${c.players}人、期待との差 ${pct(perf(c))}）`).join('、'));
  for (const [a, c] of rows) if (a !== 'other' && c.games >= 100 && c.games / all >= 0.3 && perf(c) >= 0.05) issues.push(`バランス：${t.name}で「${rivalDeckName(a)}」が使用率${Math.round((100 * c.games) / all)}%・期待より${pct(perf(c))}ポイント勝っています。カードの調整が必要かもしれません。`);
}
report.push('');
const nm = (id: string) => { try { return cardDef(id).name; } catch { return id; } };
const fresh = findNewDecks(lists);
report.push('## 新しいデッキの候補', '');
if (!fresh.length) report.push(`なし（未分類のリスト ${lists.filter((l) => !l.arche).length}種類）`);
for (const d of fresh) {
  const t = `「${d.name}」：${d.players}人・${d.games}試合・${d.days}日、期待との差 ${pct(d.strength)}。核：${Object.entries(d.core).map(([c, n]) => `${nm(c)}×${n}`).join('・')}。入れ替え枠：${d.flex.map(nm).join('・') || 'なし'}`;
  report.push('- ' + t);
  issues.push('新しいデッキの候補 ' + t + '\n  中心のリスト：`' + d.center.join(',') + '`');
}
report.push('');
const vars = findVariants(lists);
report.push('## 型の候補', '');
if (!vars.length) report.push('なし');
for (const v of vars) {
  const t = `${rivalDeckName(v.arche)}の型（${v.differs[0]} を ${v.differs[1]} に）：${v.players}人・${v.games}試合、期待との差 ${pct(v.strength)}`;
  report.push('- ' + t);
  issues.push('型の候補 ' + t + '\n  リスト：`' + v.cards.join(',') + '`');
}
report.push('');

// ---- 5. publish
if (changed) next.version = book.version + 1;
report.push('## デッキ帳', '');
if (!changed) report.push(`変更なし（版${book.version}）`);
else if (E.PUBLISH === '1' && E.ADMIN_TOKEN && base) {
  const r = await post<{ ok: boolean; version: number }>('/api/decks/publish', { token: E.ADMIN_TOKEN, book: next });
  report.push(r?.ok ? `版${r.version}を公開しました` : '公開できませんでした（ログを確かめてください）');
  if (!r?.ok) issues.push('デッキ帳を公開できませんでした。ADMIN_TOKEN とサーバーの状態を確かめてください。');
} else report.push(`版${next.version}を作りました（公開はしていません：PUBLISH=1 と ADMIN_TOKEN が必要）`);
report.push('', `処理時間：${Math.round((Date.now() - t0) / 60000)}分`);

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/daily-report.md`, report.join('\n') + '\n');
writeFileSync(`${OUT}/daily-book.json`, JSON.stringify(next, null, 1));
writeFileSync(`${OUT}/daily-issues.md`, issues.length ? `# 確認が必要なこと（${today}）\n\n` + issues.map((x) => '- ' + x).join('\n') + '\n\n詳しくはこの日の Actions の実行結果（環境レポート）を見てください。\n' : '');
log(report.join('\n'));
