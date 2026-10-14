/* 攻略wiki（/wiki/）。カード・デッキ・ルールの数値はゲーム本体のデータをそのまま読むので、
 * カードを追加・調整すると次のビルドでwikiも更新されます。勝率は `npm run wiki:stats` で更新。
 *
 * 画面: ページ（#cards など）と、どのページの上にも重ねて開くカード詳細（#card-<id>）。
 * カード詳細は履歴に1つ積むので、スマホの「戻る」で閉じると元のページの同じ位置に戻ります。 */
import './wiki.css';
import { CARD_LIST, KEYWORD_HELP, SET_NAMES, keywordsOf, setOf, type CardDef, type CardSet, type Rarity } from '../core/cards';
import { RULES } from '../core/rules';
import { CRAFT_COST, DAILY_BONUS, DAILY_MATCH_CAP, DUPE_SHARDS, LAST_SLOT, LOOKS, MATCH_REWARD, MIN_ACTIONS, PACKS, PITY, THEMES, THEME_PRICES, THEME_SET_PRICE } from '../meta/economy';
import { NEWS } from '../meta/progress';
import { cardFace, loadCardPics, setCardPicBase } from '../render/cardArt';
import { VERSION } from '../version';
import { GLOSS, KW_TIPS, MEMO } from './content';
import { STATS } from './stats';
import { META } from './meta';
import { serverUrl } from '../net/server';
import { impacts, type StatsAgg, type StoredLog } from '../server/statsCore';
import { narrate } from '../core/narrate';
import { fxSegments } from '../core/cardText';
import { ROSTER_DECKS, type RosterDeck } from '../sim/rosterDecks';
import { DECK_TYPES, TIER_CUTS, TIER_MARKS, TIER_MIN_GAMES, TIER_SHRINK, cleanTier, type TierMark, type TierRow, type TierSnapshot } from '../meta/envtier';
import { SEASONS, SEASON_REWARDS, TIERS as RANKS, jstDay, seasonAt } from '../meta/ranks';
import { BASICS, GUIDE } from './guide';
import { BAND_DECKS, BUILD_LV, LV_COUNT } from './envdata';

const RN: Record<Rarity, string> = { C: '通常', R: '希少', E: '秘宝', L: '伝説' };
const RO: Record<Rarity, number> = { C: 0, R: 1, E: 2, L: 3 };
const C: Record<string, CardDef> = Object.fromEntries(CARD_LIST.map((c) => [c.id, c]));
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const main = $('main');
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};
/** Card text with its signed numbers coloured. */
const fx = (t: string | undefined) => fxSegments(t ?? '').map((x) => (x.fx ? `<span class="fx-${x.fx}">${esc(x.t)}</span>` : esc(x.t))).join('');
const setShort = (s: CardSet) => (s === 'base' ? '基本' : SET_NAMES[s].replace(/「.*」/, ''));

// ------------------------------------------------------------------ numbers from the game
const doomLevels: string[] = [];
for (let t = RULES.DOOM_AT, n = 1; t < RULES.END; t += RULES.DOOM_STEP, n++) doomLevels.push(`${t}刻で+${n}`);
const pack = PACKS[0];
const V: Record<string, string | number> = {
  ...Object.fromEntries(Object.entries(RULES).filter(([, v]) => typeof v === 'number')),
  BELLS: RULES.BELLS.join('・'),
  DOOM_LIST: doomLevels.join('、'),
  REAL_MIN: '20試合',
  CARD_COUNT: CARD_LIST.length,
  BASE_COUNT: CARD_LIST.filter((c) => setOf(c) === 'base').length,
  ECHO_COUNT: CARD_LIST.filter((c) => setOf(c) === 'echo').length,
  VERSION,
  PACK_PRICE: pack.price,
  PACK_SIZE: pack.size,
  LAST_SLOT: LAST_SLOT.map(([r, p]) => `${RN[r]} ${Math.round(p * 100)}%`).join(' / '),
  PITY,
  DAILY_BONUS,
  DAILY_CAP: DAILY_MATCH_CAP,
  MIN_ACTIONS,
  STATS_GAMES: STATS.games.toLocaleString('ja-JP'),
  STATS_DATE: STATS.date,
  STATS_PER: STATS.perPair,
  META_GAMES: META.games.toLocaleString('ja-JP'),
  META_PER: META.perPair,
  META_DATE: META.date,
  META_DECKS: META.decks.length,
  TYPE_COUNT: DECK_TYPES.length,
  BUILD_COUNT: ROSTER_DECKS.length,
  TIER_MIN: TIER_MIN_GAMES,
  TIER_SHRINK,
  TIER_S: `+${TIER_CUTS[0]}`,
  TIER_A: `+${TIER_CUTS[1]}`,
  TIER_B: `${TIER_CUTS[2]}`,
  THEME_COUNT: THEMES.length,
  THEME_DIAL: THEME_PRICES.dial,
  THEME_BACK: THEME_PRICES.back,
  THEME_MAT: THEME_PRICES.mat,
  THEME_SET: THEME_SET_PRICE,
};
const fillValues = (root: ParentNode) => root.querySelectorAll<HTMLElement>('[data-v]').forEach((el) => {
  const v = V[el.dataset.v!];
  if (v !== undefined) el.textContent = String(v);
});

// ------------------------------------------------------------------ card images (the game's own card faces)
// Faces are drawn with the web fonts, so wait for them once; then draw each face the first time it scrolls into view.
const FONT_FACES = ['700 30px "Shippori Mincho B1"', 'italic 400 16px "Shippori Mincho B1"', '500 19px "Zen Kaku Gothic New"', '700 16px "Zen Kaku Gothic New"', '700 30px "Cinzel"'];
setCardPicBase('../cards/');
const fontsReady: Promise<void> = (async () => {
  const pics = loadCardPics();
  try { await Promise.race([Promise.all(FONT_FACES.map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]); } catch { /* draw with fallbacks */ }
  await pics;
})();
const faceUrls = new Map<string, string>();
function faceUrl(id: string): string {
  let u = faceUrls.get(id);
  if (!u) { u = cardFace(id).toDataURL('image/webp', 0.86); faceUrls.set(id, u); }
  return u;
}
const paint = (img: HTMLImageElement) => { if (!img.src && C[img.dataset.face!]) img.src = faceUrl(img.dataset.face!); };
const io = 'IntersectionObserver' in window
  ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io!.unobserve(e.target); paint(e.target as HTMLImageElement); } }), { rootMargin: '800px' })
  : null;
function hydrate(root: ParentNode) {
  void fontsReady.then(() => root.querySelectorAll<HTMLImageElement>('img[data-face]:not([src])').forEach((img) => (io ? io.observe(img) : paint(img))));
}
const img = (id: string, cls = 'face') => `<img class="${cls}" data-face="${id}" alt="${esc(C[id]?.name)}" width="340" height="476" decoding="async">`;

// ------------------------------------------------------------------ ratings (environment round robin, strongest AI)
type Tier = 'SS' | 'S' | 'A' | 'B' | 'C';
const TIERS: Tier[] = ['SS', 'S', 'A', 'B', 'C'];
/** 影響: how much more often a deck won in the games where the card was used, than that deck's average (%). */
const SCORE: Record<string, number> = Object.fromEntries(Object.entries(META.cards).filter(([id]) => C[id] && !C[id].token).map(([id, x]) => [id, x[0]]));
const sign = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}`;
const RANKED = CARD_LIST.filter((c) => SCORE[c.id] != null).sort((a, b) => SCORE[b.id] - SCORE[a.id] || a.cost - b.cost);
const TIER: Record<string, Tier> = {};
const RANK: Record<string, number> = {};
{
  const n = RANKED.length;
  const cuts = [0.1, 0.3, 0.55, 0.8].map((f) => SCORE[RANKED[Math.max(0, Math.ceil(n * f) - 1)]?.id] ?? 0);
  RANKED.forEach((c, i) => {
    const w = SCORE[c.id];
    const t = cuts.findIndex((x) => w >= x);
    TIER[c.id] = TIERS[t < 0 ? 4 : t];
    RANK[c.id] = i === 0 || w !== SCORE[RANKED[i - 1].id] ? i + 1 : RANK[RANKED[i - 1].id];
  });
}
/** Real games (the ranking server's totals for the newest version), loaded once on demand. */
let realLift: Record<string, { used: number; lift: number }> | null = null;
let realLoading: Promise<void> | null = null;
function loadReal(): Promise<void> {
  const base = serverUrl()?.replace(/^ws/, 'http');
  if (!base) { realLift = {}; return Promise.resolve(); }
  return (realLoading ??= (async () => {
    try {
      const r = await fetch(base + '/api/stats', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const agg = r.ok ? ((await r.json()) as { agg: StatsAgg | null }).agg : null;
      realLift = agg ? Object.fromEntries(impacts(agg).map((x) => [x.id, { used: x.used, lift: x.lift }])) : {};
    } catch { realLift = {}; }
  })());
}
const tierBadge = (id: string) => (TIER[id] ? `<span class="tb ${TIER[id]}">${TIER[id]}</span>` : '<span class="tb none">—</span>');

// ------------------------------------------------------------------ decks (the rated rivals' 15 types and 37 builds)
interface Build { d: RosterDeck; count: Record<string, number>; ids: string[]; lv?: [number, number]; type: number }
const countOf = (cards: string[]) => { const n: Record<string, number> = {}; for (const c of cards) n[c] = (n[c] ?? 0) + 1; return n; };
const byCost = (a: string, b: string) => C[a].cost - C[b].cost || C[a].name.localeCompare(C[b].name, 'ja');
const BUILDS: Build[] = ROSTER_DECKS.map((d) => {
  const count = countOf(d.cards);
  return { d, count, ids: Object.keys(count).filter((id) => C[id]).sort(byCost), lv: BUILD_LV[d.id], type: DECK_TYPES.indexOf(d.type) };
});
const buildsOf = (t: string) => BUILDS.filter((b) => b.d.type === t);
/** The 型 part of a build's name: 秒針 アグロ（振り子兵型） → 振り子兵型. */
const buildName = (b: Build) => b.d.name.match(/（(.+)）/)?.[1] ?? b.d.name;
const decksWith = (id: string) => BUILDS.filter((b) => b.count[id]);
const lvText = (lv?: [number, number]) => (!lv ? '' : lv[0] === lv[1] ? `Lv${lv[0]}` : `Lv${lv[0]}〜${lv[1]}`);
/** The card that stands for each type (its picture in the tier list). */
const KEY_NAME: Record<string, string> = {
  '秒針 アグロ': '秒針の斥候', '急襲 アグロ': '奇襲の騎兵', '影法師 アグロ': '影法師', '急襲 テンポ': '逆転の針',
  '牢獄 コントロール': '遅延術師', '籠城 バーン': '永劫回帰', '予約 バーン': '残響術士', '破約 コントロール': '破約の刃',
  '一掃 コントロール': '夜明けの竜', '槍兵 ビート': '突撃槍兵', '予約狩り ビート': '予見の巫女', '巨像 コントロール': '永劫の巨像',
  '充填 ビート': '刻溜めの巨兵', 'ヴェルナ ループ': '刻を繰る者ヴェルナ', '共鳴 コンボ': '共鳴の鐘守',
};
const BY_NAME = new Map(CARD_LIST.map((c) => [c.name, c.id]));
const keyCard = (t: string) => BY_NAME.get(KEY_NAME[t]) ?? buildsOf(t)[0]?.ids.at(-1) ?? CARD_LIST[0].id;
/** Lv range of a whole type (the union of its builds). */
const typeLv = (t: string): [number, number] | undefined => {
  const ls = buildsOf(t).map((b) => b.lv).filter((x): x is [number, number] => !!x);
  return ls.length ? [Math.min(...ls.map((x) => x[0])), Math.max(...ls.map((x) => x[1]))] : undefined;
};

// ------------------------------------------------------------------ 環境Tier (real games, worked out every day; see src/meta/envtier.ts)
let tierNow: TierSnapshot | null = null;
let tierLoading: Promise<void> | null = null;
let tierTried = false;
function loadTier(): Promise<void> {
  const base = serverUrl()?.replace(/^ws/, 'http');
  if (!base) { tierTried = true; return Promise.resolve(); }
  return (tierLoading ??= (async () => {
    try {
      const r = await fetch(base + '/api/wiki', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (r.ok) { tierNow = cleanTier(((await r.json()) as { tier: unknown }).tier); }
    } catch { /* offline */ }
    tierTried = true;
  })());
}
const tierOfType = (t: string): TierRow | undefined => tierNow?.rows.find((r) => r.type === t);
const markRank = (m: TierMark | null | undefined) => (m ? TIER_MARKS.indexOf(m) : 9);
const markBadge = (m: TierMark | null | undefined) => (m ? `<span class="tb ${m}">${m}</span>` : '<span class="tb none">集計中</span>');
/** ↑ ↓ NEW against the snapshot before (nothing when there was none). */
function moveOf(r: TierRow): string {
  if (r.was === undefined || !r.tier) return '';
  if (r.was === null) return '<i class="mv new" title="前回は集計中">NEW</i>';
  const d = markRank(r.was) - markRank(r.tier);
  return d > 0 ? `<i class="mv up" title="前回 ${r.was}">↑</i>` : d < 0 ? `<i class="mv down" title="前回 ${r.was}">↓</i>` : '';
}
const signed = (n: number, d = 1) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(d)}`;
const winPct = (g: number, s: number) => (g ? `${Math.round((100 * s) / g)}%` : '—');
const dayFmt = (d: string) => (d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : d.replace(/-/g, '.'));
/** A type as a chip: its key card, name and arrow (opens its section on the deck page). */
const typeChip = (t: string, r?: TierRow) => `<button type="button" class="tchip" data-type="${DECK_TYPES.indexOf(t)}">${img(keyCard(t), 'face')}<span><b>${esc(t)}</b><small>${r ? `${r.all[0]}試合・${signed(r.perf)}` : '集計中'}</small></span>${r ? moveOf(r) : ''}</button>`;
/** The tier list: S〜C rows and 集計中 (every type is listed, the ones with no snapshot yet as 集計中). */
function tierRows(limit?: TierMark[]): string {
  const rows = DECK_TYPES.map((t) => ({ t, r: tierOfType(t) }));
  const marks = (limit ?? TIER_MARKS) as (TierMark | null)[];
  const out = [...marks, ...(limit ? [] : [null])].map((m) => {
    const xs = rows.filter((x) => (x.r?.tier ?? null) === m).sort((a, b) => (b.r?.perf ?? 0) - (a.r?.perf ?? 0) || (b.r?.all[0] ?? 0) - (a.r?.all[0] ?? 0));
    if (!xs.length && !m) return '';
    return `<div class="tier ${m ?? 'none'}"><b>${m ?? '集計中'}</b><div class="tchips">${xs.length ? xs.map((x) => typeChip(x.t, x.r)).join('') : '<span class="small mute">該当なし</span>'}</div></div>`;
  }).join('');
  return out;
}
const tierLegend = () => `<p class="legend small mute"><i class="mv up">↑</i>前回より上がった <i class="mv down">↓</i>前回より下がった <i class="mv new">NEW</i>前回は集計中　数字は試合数と期待との差（ポイント）</p>`;

// ------------------------------------------------------------------ pages
const svg = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON: Record<string, string> = {
  home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  ranking: svg('<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/><path d="M5 19h14"/>'),
  cards: svg('<rect x="3" y="5" width="11" height="15" rx="1.5"/><path d="M8 3h11.5A1.5 1.5 0 0 1 21 4.5V17"/>'),
  decks: svg('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
  rules: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  keywords: svg('<path d="M12 3l2.6 5.6L20 9.3l-4 4 1 5.7-5-2.8-5 2.8 1-5.7-4-4 5.4-.7z"/>'),
  tips: svg('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.7.5 1 1.2 1 2.1h5c0-.9.3-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
  packs: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 8h14M9 13l3 3 3-3"/>'),
  real: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  gloss: svg('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M9 8h6M9 12h4"/>'),
  tier: svg('<path d="M4 6h16M4 12h11M4 18h6"/><path d="M18 15l2 3-2 3"/>'),
  rated: svg('<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>'),
  themes: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="3"/>'),
  history: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'),
  season: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  news: svg('<path d="M4 5h13v14H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v8a2 2 0 0 1-2 2"/><path d="M8 9h5M8 13h5"/>'),
};
interface Page { id: string; label: string; title: string; desc: string; intro?: string; hidden?: boolean }
const PAGES: Page[] = [
  { id: 'home', label: 'トップ', title: 'クロノ・デュエル攻略wiki', desc: 'このwikiの使い方' },
  { id: 'tier', label: '環境Tier', title: '環境Tier表（実戦データ）', desc: '毎日更新・15タイプの強さ',
    intro: 'レート戦とフレンド対戦の実際の試合から、デッキタイプごとの強さを毎日集計したTier表です。プレイヤーが使ったデッキも、レート戦の相手が使ったデッキも数えています。' },
  { id: 'decks', label: 'デッキ解説', title: '全デッキ解説（15タイプ・37型）', desc: 'レシピ・立ち回り・相性',
    intro: 'レート戦で使われている15タイプ・37型のデッキについて、20枚のレシピ、型の違い、立ち回り、得意・苦手な相手をまとめました。カードの画像をタップすると、その場で性能を確認できます。' },
  { id: 'rated', label: 'レート戦', title: 'レート戦・ランク・季のまとめ', desc: '刻神Ⅰ〜Ⅴ・報酬・相手のLv',
    intro: 'レート戦のランク、刻神Ⅰ〜Ⅴ、季（シーズン）の報酬とリセット、相手のAIのLvとデッキをまとめました。' },
  { id: 'ranking', label: 'カード評価', title: '最強カードランキング', desc: '全カードを5段階で評価',
    intro: '全カードを、いちばん強いAI同士で環境デッキを総当たりさせたときの「使った試合でどれだけ勝ちやすくなったか（影響）」で5段階に分けたランキングです。みんなの実際の対戦での影響も並べています。カードの画像をタップすると、その場で詳しい性能と攻略メモを見られます。' },
  { id: 'cards', label: 'カード一覧', title: `カード一覧（全${CARD_LIST.length}種）`, desc: '検索・絞り込み・評価つき',
    intro: 'セット・種類・レアリティ・効果で絞り込めます。行をタップすると詳細が開き、「前へ／次へ」で絞り込んだ一覧の中を順番に見られます。' },
  { id: 'rules', label: '基本ルール', title: '基本ルールと遊び方', desc: '時計・行動コスト・鐘・終焉・予約',
    intro: 'クロノ・デュエルにはターンがありません。時計と行動コストの仕組みを押さえれば、すぐに遊べます。' },
  { id: 'keywords', label: 'キーワード', title: 'キーワード一覧と使い方', desc: '残響・共鳴・急襲・充填など',
    intro: 'カードに書かれたキーワードの効果と、使うときのポイントです。各キーワードを持つカードも一覧にしています。' },
  { id: 'tips', label: '立ち回り', title: '勝つための立ち回り・定石9選', desc: '時間の使い方のコツ',
    intro: 'ルールの仕組みから言える定石です。デッキや相手によって例外はあります。' },
  { id: 'packs', label: 'パック・報酬', title: 'パックの確率とカードの集め方', desc: '提供割合・報酬・欠片' },
  { id: 'themes', label: 'テーマ', title: 'テーマ一覧（文字盤・スリーブ・プレイマット）', desc: '全8テーマの絵と価格',
    intro: 'ショップでコインと交換できる見た目のテーマです。1つのテーマに文字盤・スリーブ・プレイマットの3つがあり、1つずつでも、まとめてでも交換できます。' },
  { id: 'real', label: '実戦データ', title: '実戦データ（カード別の成績）', desc: 'みんなの対戦の集計',
    intro: 'みんなが実際に遊んだ対戦（フリー対戦・レート戦・フレンド対戦）から集計した、カードごとの成績です。AI同士の統計では分からない「人が使ったときの強さ」が見えます。バージョンごとに集計するので、調整前の数字は混ざりません。' },
  { id: 'history', label: '更新履歴', title: '更新履歴', desc: 'バージョンごとの変更点' },
  { id: 'gloss', label: '用語集', title: '用語集', desc: '刻、世界の時刻、燃えるなど' },
  { id: 'admin', label: '対戦の記録', title: '対戦の記録（管理用）', desc: '', hidden: true },
];
const PAGE: Record<string, Page> = Object.fromEntries(PAGES.map((p) => [p.id, p]));
const MENU = PAGES.filter((p) => !p.hidden);

// ------------------------------------------------------------------ card list page
type Filter = { q: string; set: string; kind: string; rar: string; kw: string; sort: string; view: string };
const F: Filter = { q: '', set: 'all', kind: 'all', rar: 'all', kw: 'all', sort: 'cost', view: store.get('cdwiki.view') === 'grid' ? 'grid' : 'list' };
const ALL_KW = [...new Set(CARD_LIST.flatMap(keywordsOf))];
function chips(id: string, key: keyof Filter, opts: [string, string][]) {
  const el = $(id);
  el.innerHTML = opts.map(([v, l]) => `<button type="button" data-v2="${v}" aria-pressed="${F[key] === v}">${l}</button>`).join('');
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    F[key] = b.dataset.v2!;
    el.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderCards();
  };
}
const matches = (c: CardDef, q: string) => !q || [c.name, c.text, c.resvText, MEMO[c.id], keywordsOf(c).join(' ')].join(' ').includes(q);
const stat = (c: CardDef) => (c.kind === 'unit' ? `<span class="st"><span class="a">${c.atk}</span>/<span class="h">${c.hp}</span>/<span class="r">${c.reload}</span></span>` : '<span class="mute">—</span>');
const cname = (c: CardDef) => `<div class="cname">${img(c.id)}<div><b>${esc(c.name)}</b><small><span class="rar ${c.rarity}">${RN[c.rarity]}</span>${c.kind === 'unit' ? 'ユニット' : '術'}・${setShort(setOf(c))}</small></div></div>`;
function renderCards() {
  const q = F.q.trim();
  const list = CARD_LIST.filter((c) =>
    (F.set === 'all' || setOf(c) === F.set) && (F.kind === 'all' || c.kind === F.kind) && (F.rar === 'all' || c.rarity === F.rar) &&
    (F.kw === 'all' || keywordsOf(c).includes(F.kw)) && matches(c, q));
  const by: Record<string, (a: CardDef, b: CardDef) => number> = {
    cost: (a, b) => a.cost - b.cost || RO[a.rarity] - RO[b.rarity],
    tier: (a, b) => (RANK[a.id] ?? 999) - (RANK[b.id] ?? 999),
    rar: (a, b) => RO[b.rarity] - RO[a.rarity] || a.cost - b.cost,
    name: (a, b) => a.name.localeCompare(b.name, 'ja'),
  };
  list.sort(by[F.sort]);
  $('count').textContent = `${list.length} / ${CARD_LIST.length} 種`;
  document.querySelectorAll('#f-view button').forEach((b) => b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.view === F.view)));
  const out = $('cardlist');
  if (!list.length) { out.innerHTML = '<p class="empty">条件に合うカードはありません。検索語か絞り込みを変えてください。</p>'; return; }
  out.innerHTML = F.view === 'grid'
    ? `<div class="thumbs">${list.map((c) => `<button type="button" class="thumb" data-card="${c.id}">${img(c.id)}<span class="nm">${esc(c.name)}</span></button>`).join('')}</div>`
    : `<div class="tw"><table class="gt list"><tr><th>カード</th><th class="num">コスト</th><th>攻/体/間</th><th class="wide">効果</th><th>評価</th></tr>${list.map((c) =>
      `<tr data-card="${c.id}" tabindex="0"><td>${cname(c)}</td><td class="num"><span class="costb">${c.cost}</span></td><td>${stat(c)}</td><td class="eff wide">${fx(c.text) || '<span class="mute">（効果なし）</span>'}${c.resvText ? `<br><small class="resv">予約 ${fx(c.resvText)}</small>` : ''}</td><td>${tierBadge(c.id)}</td></tr>`).join('')}</table></div>`;
  hydrate(out);
}
function initCards() {
  const sets = [...new Set(CARD_LIST.map(setOf))];
  chips('f-set', 'set', [['all', 'すべて'], ...sets.map((s): [string, string] => [s, setShort(s)])]);
  chips('f-kind', 'kind', [['all', 'すべて'], ['unit', 'ユニット'], ['spell', '術']]);
  chips('f-rar', 'rar', [['all', 'すべて'], ['C', '通常'], ['R', '希少'], ['E', '秘宝'], ['L', '伝説']]);
  chips('f-kw', 'kw', [['all', 'すべて'], ...ALL_KW.map((k): [string, string] => [k, k])]);
  const sortSel = $<HTMLSelectElement>('f-sort'), qIn = $<HTMLInputElement>('q');
  sortSel.value = F.sort; qIn.value = F.q;
  sortSel.onchange = () => { F.sort = sortSel.value; renderCards(); };
  qIn.oninput = () => { F.q = qIn.value; renderCards(); };
  $('f-view').onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-view]');
    if (!b) return;
    F.view = b.dataset.view!; store.set('cdwiki.view', F.view); renderCards();
  };
  renderCards();
}

// ------------------------------------------------------------------ ranking page
const thumb = (id: string, extra = '') => `<button type="button" class="thumb" data-card="${id}">${img(id)}${extra}<span class="nm">${esc(C[id].name)}</span></button>`;
const tierRow = (t: Tier, ids: string[]) => `<div class="tier ${t}"><b>${t}</b><div><div class="thumbs sm">${ids.map((id) => thumb(id)).join('')}</div></div></div>`;
function initRanking() {
  $('tierlist').innerHTML = TIERS.map((t) => tierRow(t, RANKED.filter((c) => TIER[c.id] === t).map((c) => c.id))).join('');
  const table = () => {
    $('ranktable').innerHTML = '<tr><th class="num">順位</th><th>カード</th><th>評価</th><th class="num">影響（AI戦）</th><th class="num">影響（実戦）</th><th class="num wide">使われた試合</th></tr>' +
      RANKED.map((c) => {
        const r = realLift?.[c.id], m = META.cards[c.id];
        const real = r && r.used >= 20 ? `<b class="n">${sign(r.lift)}</b>` : r ? `<span class="mute">${sign(r.lift)}</span>` : '<span class="mute">—</span>';
        return `<tr data-card="${c.id}" tabindex="0"><td class="ranknum">${RANK[c.id]}</td><td>${cname(c)}</td><td>${tierBadge(c.id)}</td><td class="num"><b class="n">${sign(SCORE[c.id])}</b></td><td class="num">${real}</td><td class="num wide small">${m?.[1] ?? 0}</td></tr>`;
      }).join('');
    hydrate($('ranktable'));
  };
  table();
  if (!realLift) void loadReal().then(() => { if (document.body.contains($('ranktable'))) { table(); $('ranktable').classList.add('list'); } });
  $('ranktable').classList.add('list');
}

// ------------------------------------------------------------------ text with **bold** and card names that open the card
const CARD_NAMES = [...new Set(CARD_LIST.filter((c) => !c.token).map((c) => c.name))].sort((a, b) => b.length - a.length);
const NAME_RE = new RegExp(CARD_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
const md = (s: string) => esc(s).replace(NAME_RE, (n) => `<button type="button" class="clink" data-card="${BY_NAME.get(n)}">${n}</button>`).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

// ------------------------------------------------------------------ decks page (15 types, 37 builds)
interface BookEntryLite { v: number; cards: string[] }
let book: Record<string, BookEntryLite> | null = null;
let bookLoading: Promise<void> | null = null;
function loadBook(): Promise<void> {
  const base = serverUrl()?.replace(/^ws/, 'http');
  if (!base) return Promise.resolve();
  return (bookLoading ??= (async () => {
    try {
      const r = await fetch(base + '/api/decks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (r.ok) book = ((await r.json()) as { decks?: Record<string, BookEntryLite> }).decks ?? {};
    } catch { /* offline */ }
  })());
}
/** What the daily improvement changed in a build (the list the stronger rivals bring now), or ''. */
function bookDiff(b: Build): string {
  if (!book) return '';
  const out: string[] = [];
  for (const [key, label] of [[b.d.id, 'Lv8以上'], [`${b.d.id}~lo`, 'Lv7以下']] as const) {
    const e = book[key];
    if (!e || !Array.isArray(e.cards) || e.v <= 1) continue;
    const now = countOf(e.cards), add: string[] = [], cut: string[] = [];
    for (const id of new Set([...Object.keys(now), ...Object.keys(b.count)])) {
      const d = (now[id] ?? 0) - (b.count[id] ?? 0);
      if (!C[id] || !d) continue;
      (d > 0 ? add : cut).push(`${C[id].name}${Math.abs(d) > 1 ? `×${Math.abs(d)}` : ''}`);
    }
    if (add.length || cut.length) out.push(`<li><b>${label}のAI（版${e.v}）</b>${add.length ? `<span class="plus">＋${esc(add.join('・'))}</span>` : ''}${cut.length ? `<span class="minus">－${esc(cut.join('・'))}</span>` : ''}</li>`);
  }
  return out.length ? `<div class="bookdiff"><b>毎日の改良で変わったカード</b><ul>${out.join('')}</ul></div>` : '';
}
function buildBlock(b: Build) {
  const units = b.d.cards.filter((id) => C[id]?.kind === 'unit').length;
  const curve = Array(9).fill(0) as number[];
  b.d.cards.forEach((id) => { if (C[id]) curve[Math.min(9, Math.max(1, C[id].cost)) - 1]++; });
  const mx = Math.max(...curve);
  const avgCost = b.d.cards.reduce((s, id) => s + (C[id]?.cost ?? 0), 0) / b.d.cards.length;
  const rec = tierOfType(b.d.type)?.builds[b.d.id];
  return `<section class="deck" id="build-${b.d.id}" data-ctx="${esc(b.d.name)}">
    <div class="deck-hd"><div><h3>${esc(buildName(b))}</h3><div class="tags">${b.lv ? `<span class="tag">レート戦のAI ${lvText(b.lv)}</span>` : ''}${rec && rec[0] ? `<span class="small mute">実戦 ${rec[0]}試合・勝率${winPct(rec[0], rec[1])}</span>` : ''}</div></div></div>
    <div class="deck-bd">
      <div class="thumbs sm">${b.ids.map((id) => thumb(id, b.count[id] > 1 ? `<span class="cnt">×${b.count[id]}</span>` : '')).join('')}</div>
      <div class="deck-meta"><div class="curve" aria-label="コスト分布">${curve.map((k, i) => `<div><i style="height:${mx ? (k / mx) * 34 : 0}px"></i>${i + 1}</div>`).join('')}</div>
        <div>ユニット ${units}枚 ／ 術 ${b.d.cards.length - units}枚<br>平均コスト ${avgCost.toFixed(2)}</div></div>
      <div class="bd-live" data-build="${b.d.id}">${bookDiff(b)}</div>
    </div></section>`;
}
function typeSection(t: string, i: number) {
  const g = GUIDE[t], r = tierOfType(t);
  const bs = buildsOf(t);
  return `<h2 id="type-${i}">${esc(t)}</h2>
    <div class="type-hd" data-ctx="${esc(t)}">${thumb(keyCard(t))}
      <div><div class="type-tier">${markBadge(r?.tier)}${r ? moveOf(r) : ''}<span class="small mute">${r ? `実戦 ${r.all[0]}試合・期待との差 ${signed(r.perf)}` : '実戦データは集計中'}</span></div>
      <p>${md(g?.lead ?? '')}</p><p class="small mute">型の数：${bs.length}　レート戦のAI：${lvText(typeLv(t)) || '—'}</p></div></div>
    <h3>レシピ</h3>${bs.map(buildBlock).join('')}
    ${g?.builds.length ? `<h3>型の違い</h3><ul class="dots">${g.builds.map((x) => `<li>${md(x)}</li>`).join('')}</ul>` : ''}
    ${g ? `<h3>立ち回り</h3><ol class="steps">${g.steps.map((x) => `<li>${md(x)}</li>`).join('')}</ol>` : ''}
    ${g ? `<h3>コツと相性</h3><ul class="dots">${g.tips.map((x) => `<li>${md(x)}</li>`).join('')}</ul>` : ''}`;
}
const ARCH_ORDER = [...new Set(ROSTER_DECKS.map((d) => d.arch))];
function initDecks() {
  $('basics').innerHTML = BASICS.map((x) => `<li>${md(x)}</li>`).join('');
  const drawList = () => {
    $('typegrid').innerHTML = ARCH_ORDER.map((a) => `<div class="arch"><b>${esc(a)}</b><div class="tchips">${DECK_TYPES.filter((t) => ROSTER_DECKS.find((d) => d.type === t)?.arch === a).map((t) => typeChip(t, tierOfType(t))).join('')}</div></div>`).join('');
    hydrate($('typegrid'));
  };
  drawList();
  $('typelist').innerHTML = DECK_TYPES.map(typeSection).join('');
  const refresh = () => {
    if (page !== 'decks') return;
    drawList();
    DECK_TYPES.forEach((t, i) => {
      const r = tierOfType(t), box = document.querySelector(`#type-${i} + .type-hd .type-tier`);
      if (box) box.innerHTML = `${markBadge(r?.tier)}${r ? moveOf(r) : ''}<span class="small mute">${r ? `実戦 ${r.all[0]}試合・期待との差 ${signed(r.perf)}` : '実戦データは集計中'}</span>`;
    });
    document.querySelectorAll<HTMLElement>('[data-build]').forEach((el) => { const b = BUILDS.find((x) => x.d.id === el.dataset.build); if (b) el.innerHTML = bookDiff(b); });
  };
  void loadTier().then(refresh);
  void loadBook().then(refresh);
}

// ------------------------------------------------------------------ 環境Tier page
function initTier() {
  const draw = () => {
    if (page !== 'tier') return;
    const t = tierNow;
    $('tier-when').innerHTML = t ? `集計日 <b>${dayFmt(t.date)}</b>（${dayFmt(t.days[0])}〜${dayFmt(t.days[1])}の7日間）${t.prevDate ? `／ 矢印は ${dayFmt(t.prevDate)} との比較` : ''}`
      : tierTried ? 'まだ集計がありません。毎日4:30ごろに更新されます。' : '読み込み中…';
    $('tierlist2').innerHTML = tierRows() + tierLegend();
    const rows = DECK_TYPES.map((x) => tierOfType(x)).filter((x): x is TierRow => !!x).sort((a, b) => markRank(a.tier) - markRank(b.tier) || b.perf - a.perf);
    $('tiertable').innerHTML = '<tr><th class="num">順位</th><th>デッキタイプ</th><th>Tier</th><th class="num">試合</th><th class="num wide">人／AI</th><th class="num">期待との差</th><th class="num">勝率</th></tr>' +
      (rows.length ? rows.map((r, i) => `<tr><td class="ranknum">${i + 1}</td><td><button type="button" class="clink" data-type="${DECK_TYPES.indexOf(r.type)}">${esc(r.type)}</button></td><td>${markBadge(r.tier)}${moveOf(r)}</td><td class="num"><b class="n">${r.all[0]}</b></td><td class="num wide small">${r.human[0]}／${r.ai[0]}</td><td class="num"><b class="n">${signed(r.perf)}</b></td><td class="num">${winPct(r.all[0], r.all[1])}</td></tr>`).join('')
        : '<tr><td colspan="7" class="mute">集計中</td></tr>');
    const bl = BUILDS.map((b) => ({ b, r: tierOfType(b.d.type)?.builds[b.d.id] })).filter((x) => x.r && x.r[0] > 0).sort((a, b) => b.r![0] - a.r![0]);
    $('buildtable').innerHTML = '<tr><th>型</th><th class="num">試合</th><th class="num">期待との差</th><th class="num">勝率</th></tr>' +
      (bl.length ? bl.map(({ b, r }) => `<tr><td><button type="button" class="clink" data-type="${b.type}">${esc(b.d.name)}</button></td><td class="num">${r![0]}</td><td class="num">${signed((100 * (r![1] - r![2])) / (r![0] + TIER_SHRINK))}</td><td class="num">${winPct(r![0], r![1])}</td></tr>`).join('')
        : '<tr><td colspan="4" class="mute">集計中</td></tr>');
    const bands = t ? RANKS.filter((k) => t.bands[k.id]) : [];
    $('bandtable').innerHTML = '<tr><th>ランク</th><th class="num">試合</th><th>よく使われるデッキ</th></tr>' +
      (bands.length ? bands.map((k) => {
        const tab = t!.bands[k.id], all = Object.values(tab).reduce((a, b) => a + b, 0);
        const top = Object.entries(tab).sort((a, b) => b[1] - a[1]).slice(0, 3);
        return `<tr><td><span class="rk-name" style="color:${k.color}">${esc(k.name)}</span></td><td class="num">${all}</td><td class="small">${top.map(([x, n]) => `${esc(x)} <b class="n">${Math.round((100 * n) / all)}%</b>`).join('、')}</td></tr>`;
      }).join('') : '<tr><td colspan="3" class="mute">集計中</td></tr>');
    hydrate($('tierlist2'));
  };
  draw();
  void loadTier().then(draw);
}

// ------------------------------------------------------------------ rated page
const LV_NOTE: [number, number, string][] = [
  [1, 3, '読みはなく、ときどきミスをします。カードの使い方を覚える相手。'],
  [4, 7, 'デッキの作戦どおりに動き、少し先まで読みます。ミスはほとんどしません。'],
  [8, 10, '何手も先まで読み、あなたの手札や予約を推測して動きます。'],
  [11, 12, 'Lv10と同じ考え方で、近い候補をずっと長く読み比べます（1手に最大20秒）。'],
];
function initRated() {
  const today = jstDay(Date.now()), cur = seasonAt(today);
  const days = Math.floor((Date.parse(today) - Date.parse(cur.start)) / 86_400_000) + 1;
  const next = SEASONS.find((x) => x.start > today);
  $('season-box').innerHTML = `<div class="season"><span class="ic">${ICON.season}</span><div><b>${esc(cur.name)}（${esc(cur.set)}）</b><br>${dayFmt(cur.start)} から開催中・${days}日目${next ? `<br>次の季：${dayFmt(next.start)} から` : '<br>終わり：次の弾が出る日（未定）'}</div></div>`;
  const lvOf = (id: string) => { const b = BAND_DECKS[id]; return b ? lvText(b.lv) : '—'; };
  $('ranktable2').innerHTML = '<tr><th>ランク</th><th class="num">レート</th><th>相手のLv</th><th class="num">季末の報酬</th></tr>' +
    RANKS.map((k, i) => {
      const nx = RANKS[i + 1], rw = SEASON_REWARDS[k.id];
      return `<tr><td><span class="rk-name" style="color:${k.color}">${esc(k.name)}</span></td><td class="num">${k.min ? `${k.min}〜${nx ? nx.min - 1 : ''}` : `〜${nx!.min - 1}`}</td><td>${lvOf(k.id)}</td><td class="num small">${rw ? `${rw.coins}コイン${rw.tickets ? `・チケット${rw.tickets}枚` : ''}` : '—'}</td></tr>`;
    }).join('');
  $('lvtable').innerHTML = '<tr><th>Lv</th><th class="num">相手の数</th><th>強さ</th></tr>' +
    LV_NOTE.map(([a, b, note]) => `<tr><td>Lv${a}〜${b}</td><td class="num">${Array.from({ length: b - a + 1 }, (_, i) => LV_COUNT[a + i] ?? 0).reduce((x, y) => x + y, 0)}人</td><td class="small">${esc(note)}</td></tr>`).join('');
  $('banddecks').innerHTML = RANKS.filter((k) => BAND_DECKS[k.id]).map((k) => {
    const b = BAND_DECKS[k.id];
    const byType: Record<string, number> = {};
    for (const [id, n] of Object.entries(b.decks)) { const tp = ROSTER_DECKS.find((d) => d.id === id)?.type; if (tp) byType[tp] = (byType[tp] ?? 0) + n; }
    const list = Object.entries(byType).sort((x, y) => y[1] - x[1]);
    return `<div class="band"><div class="band-hd"><span class="rk-name" style="color:${k.color}">${esc(k.name)}</span><span class="small mute">${lvText(b.lv)}・${b.rivals}人</span></div><div class="tchips">${list.map(([tp]) => typeChip(tp)).join('')}</div></div>`;
  }).join('');
  hydrate($('banddecks'));
}

// ------------------------------------------------------------------ themes page
const themePic = (t: string, k: string) => `../themes/${t}_${k}.webp`;
function initThemes() {
  const KIND: Record<string, string> = { dial: '文字盤', back: 'スリーブ', mat: 'プレイマット' };
  $('themelist').innerHTML = THEMES.map((t) => {
    const parts = LOOKS.filter((l) => l.theme === t.id);
    return `<section class="theme"><h2>${esc(t.name)}</h2><p>${esc(t.blurb)}</p>
      <div class="theme-pics">${parts.map((l) => `<figure class="tp-${l.kind}"><img src="${themePic(t.id, l.kind)}" alt="${esc(l.name)}" loading="lazy" decoding="async"><figcaption><b>${esc(l.name)}</b><small>${KIND[l.kind]}・${l.price}コイン</small><span>${esc(l.blurb)}</span></figcaption></figure>`).join('')}</div>
      <p class="small mute">3つまとめて ${THEME_SET_PRICE}コイン（別々なら ${parts.reduce((a, l) => a + l.price, 0)}コイン）</p></section>`;
  }).join('');
}

// ------------------------------------------------------------------ history page
function initHistory() {
  const byDay = new Map<string, typeof NEWS>();
  for (const n of NEWS) { const l = byDay.get(n.date) ?? []; l.push(n); byDay.set(n.date, l); }
  $('historylist').innerHTML = [...byDay].map(([d, ns]) => `<h2>${dayFmt(d)}</h2><ul class="news">${ns.map((n) => `<li><details open><summary><span class="tag ${n.tag}">${n.tag}</span><span>${esc(n.title)}</span></summary><p>${esc(n.body)}</p></details></li>`).join('')}</ul>`).join('');
}

// ------------------------------------------------------------------ home
function initHome() {
  const legends = ['dragon', 'e_verna', 'titan'].filter((id) => C[id]);
  $('kv-cards').innerHTML = legends.map((id) => img(id)).join('');
  const today = jstDay(Date.now()), cur = seasonAt(today);
  const pins: [string, string, string][] = [
    ['tier', '【毎日更新】環境Tier表（実戦データ）', '今いちばん勝っているデッキは？'],
    ['rated', '【第1季】刻神Ⅰ〜Ⅴと季の報酬まとめ', '最高ランクが5段階に'],
    ['decks', '【全37型】デッキ解説・レシピ・立ち回り', '15タイプを網羅'],
    ['themes', '【新テーマ】絶対零度・木漏れ日の森・封印の魔導書', '全8テーマの絵と価格'],
  ];
  $('home-pins').innerHTML = pins.map(([p, a, b]) => `<a href="#${p}" data-go="${p}"><b>${esc(a)}</b><small>${esc(b)}</small></a>`).join('');
  const toc: [string, string, string][] = [['h-news', 'news', '最新情報'], ['h-season', 'season', '開催中の季'], ['h-tier', 'tier', '環境Tier'], ['h-rank', 'ranking', 'ランキング'], ['h-decks', 'decks', 'デッキ解説'], ['h-begin', 'tips', '初心者向け'], ['h-theme', 'themes', 'テーマ'], ['h-cards', 'cards', 'カードリスト']];
  $('home-toc').innerHTML = toc.map(([h, ic, l]) => `<a href="#" data-jump="${h}"><span class="ic">${ICON[ic] ?? ''}</span><b>${l}</b></a>`).join('');
  $('home-news').innerHTML = NEWS.slice(0, 4).map((n) => `<li><details><summary><time>${n.date.replace(/-/g, '.')}</time><span class="tag ${n.tag}">${n.tag}</span><span>${esc(n.title)}</span></summary><p>${esc(n.body)}</p></details></li>`).join('');
  const days = Math.floor((Date.parse(today) - Date.parse(cur.start)) / 86_400_000) + 1;
  $('home-season').innerHTML = `<div class="season"><span class="ic">${ICON.season}</span><div><b>${esc(cur.name)}（${esc(cur.set)}）</b>　${dayFmt(cur.start)} から開催中・${days}日目<br><span class="small">季の最高ランクで報酬（刻神Ⅴなら${SEASON_REWARDS.shin5.coins}コイン・チケット${SEASON_REWARDS.shin5.tickets}枚）。季の称号には最終順位も入ります。</span></div></div>`;
  const drawTier = () => {
    if (page !== 'home') return;
    $('home-tier').innerHTML = tierRows(['S', 'A']) + tierLegend();
    $('home-tier-when').textContent = tierNow ? `${dayFmt(tierNow.date)} 更新（直近7日の実戦）` : tierTried ? 'まだ集計がありません（毎日4:30ごろ更新）' : '読み込み中…';
    $('home-types').innerHTML = DECK_TYPES.map((t) => typeChip(t, tierOfType(t))).join('');
    hydrate($('home-tier')); hydrate($('home-types'));
    const u = document.getElementById('upd-date');
    if (u && tierNow && tierNow.date > NEWS[0].date) u.textContent = dayFmt(tierNow.date);
  };
  drawTier();
  void loadTier().then(drawTier);
  $('home-ranks').innerHTML = ([['tier', '最強デッキ', '環境Tier（実戦）'], ['ranking', '最強カード', 'AI同士の総当たり'], ['real', 'カード実戦成績', 'みんなの対戦の集計'], ['rated', 'ランクと報酬', '刻神Ⅰ〜Ⅴ']] as [string, string, string][])
    .map(([p, a, b]) => `<a href="#${p}" data-go="${p}"><span class="ic">${ICON[p] ?? ''}</span><b>${a}</b><small>${b}</small></a>`).join('');
  $('home-themes').innerHTML = THEMES.map((t) => `<a href="#themes" data-go="themes" class="th"><img src="${themePic(t.id, 'dial')}" alt="" loading="lazy" decoding="async"><span>${esc(t.name)}</span></a>`).join('');
  const sets = [...new Set(CARD_LIST.map(setOf))];
  $('home-sets').innerHTML = '<tr><th>収録</th><th class="num">種類</th></tr>' + sets.map((st) => `<tr><td><a href="#cards" data-set="${st}">${esc(SET_NAMES[st])}</a></td><td class="num">${CARD_LIST.filter((c) => setOf(c) === st && !c.token).length}</td></tr>`).join('');
}

// ------------------------------------------------------------------ keywords, packs, glossary
function initKeywords() {
  const tips = KW_TIPS.filter((k) => CARD_LIST.some((c) => keywordsOf(c).includes(k.k)));
  $('kwlist').innerHTML = tips.map((k, i) => {
    const ids = CARD_LIST.filter((c) => keywordsOf(c).includes(k.k)).sort((a, b) => a.cost - b.cost).map((c) => c.id);
    return `<div class="kw-item"><h2 id="h-kw${i}">${esc(k.label)} <span class="small mute" style="font-family:var(--f-body)">（${esc(k.set)}）</span></h2>
      <p>${esc(KEYWORD_HELP[k.k])}</p>
      <div class="box point tip"><b>ポイント</b>${esc(k.tip)}</div>
      <h3>「${esc(k.k)}」を持つカード（${ids.length}種）</h3>
      <div class="thumbs sm" data-ctx="キーワード「${esc(k.k)}」">${ids.map((id) => thumb(id)).join('')}</div></div>`;
  }).join('');
}
function initPacks() {
  const [nw, nl, nd] = MATCH_REWARD['ai-normal'], [hw, hl, hd] = MATCH_REWARD['ai-hard'], [ow, ol, od] = MATCH_REWARD['online'];
  const range = (...xs: number[]) => (Math.min(...xs) === Math.max(...xs) ? `${xs[0]}` : `${Math.min(...xs)}〜${Math.max(...xs)}`);
  const row = (l: string, v: string | number) => `<tr><td>${l}</td><td class="num"><b class="n">${v}</b></td></tr>`;
  $('rewards').innerHTML = '<tr><th>結果</th><th class="num">コイン</th></tr>' +
    row('AI（ふつう）に勝利', nw) + row('AI（つよい）に勝利', hw) + row('オンラインで勝利', ow) +
    row('敗北', range(nl, hl, ol)) + row('引き分け', range(nd, hd, od)) + row('その日の初勝利ボーナス', `+${DAILY_BONUS}`);
  $('shards').innerHTML = '<tr><th>レアリティ</th><th class="num">もらえる欠片</th><th class="num">作成に必要</th></tr>' +
    (['C', 'R', 'E', 'L'] as Rarity[]).map((r) => `<tr><td><span class="rar ${r}">${RN[r]}</span></td><td class="num"><b class="n">${DUPE_SHARDS[r]}</b></td><td class="num"><b class="n">${CRAFT_COST[r]}</b></td></tr>`).join('');
}
function drawClock() {
  const el = $('clocksvg') as unknown as SVGSVGElement;
  const E = RULES.END, x0 = 30, x1 = 770, y = 70, X = (t: number) => x0 + ((x1 - x0) * t) / E;
  const sans = 'font-family="Zen Kaku Gothic New, sans-serif"';
  let s = '';
  for (let t = RULES.DOOM_AT, n = 1; t < E; t += RULES.DOOM_STEP, n++) {
    const t2 = Math.min(E, t + RULES.DOOM_STEP);
    s += `<rect x="${X(t)}" y="${y - 10}" width="${X(t2) - X(t)}" height="20" fill="rgba(214,51,74,${0.12 + n * 0.12})"/>`;
    s += `<text x="${(X(t) + X(t2)) / 2}" y="${y + 52}" fill="#d6334a" font-size="12" font-weight="700" text-anchor="middle" ${sans}>終焉 +${n}</text>`;
  }
  s += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="#2d4f5c" stroke-width="2"/>`;
  for (let t = 0; t <= E; t++) {
    const big = t % 4 === 0;
    s += `<line x1="${X(t)}" y1="${y - (big ? 10 : 5)}" x2="${X(t)}" y2="${y + (big ? 10 : 5)}" stroke="${big ? '#8fa9ad' : '#2d4f5c'}" stroke-width="1"/>`;
    if (big) s += `<text x="${X(t)}" y="${y + 30}" fill="#8fa9ad" font-family="Cinzel, serif" font-size="13" text-anchor="middle">${t}</text>`;
  }
  for (const b of RULES.BELLS) {
    s += `<circle cx="${X(b)}" cy="${y - 30}" r="9" fill="#0e202b" stroke="#e0b25c" stroke-width="1.5"/>`;
    s += `<path d="M${X(b) - 4} ${y - 27} q4 -9 8 0 z" fill="#e0b25c"/>`;
  }
  s += `<text x="${X(RULES.BELLS[0])}" y="${y - 46}" fill="#e0b25c" font-size="12" text-anchor="middle" ${sans}>鐘（1枚引く）</text>`;
  s += `<text x="${X(E)}" y="${y - 22}" fill="#f1e7d0" font-size="12" text-anchor="end" ${sans}>${E} 終わり</text>`;
  el.innerHTML = s;
}

// ------------------------------------------------------------------ play statistics from real games
const REAL_MIN = 20;
const MODE_NAMES: Record<string, string> = { 'free-easy': 'フリー（やさしい）', 'free-normal': 'フリー（ふつう）', 'free-hard': 'フリー（つよい）', 'free-expert': 'フリー（超つよい）', rated: 'レート戦', online: 'フレンド対戦' };
async function initReal(ver?: string) {
  const body = $('real-body'), sel = $('real-ver') as HTMLSelectElement, sum = $('real-sum');
  const base = serverUrl()?.replace(/^ws/, 'http');
  if (!base) { body.innerHTML = '<p class="mute">この環境では実戦データのサーバーにつながっていません。</p>'; return; }
  let res: { versions: string[]; agg: StatsAgg | null } | null = null;
  try {
    const r = await fetch(base + '/api/stats', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ver ? { v: ver } : {}) });
    if (r.ok) res = await r.json();
  } catch { /* offline */ }
  if (!document.body.contains(body)) return; // the reader moved to another page meanwhile
  if (!res) { body.innerHTML = '<p class="mute">実戦データを読み込めませんでした。通信状態を確かめてください。</p>'; return; }
  sel.innerHTML = res.versions.map((v) => `<option value="${esc(v)}"${v === res!.agg?.v ? ' selected' : ''}>Ver. ${esc(v)}${v === VERSION ? '（最新）' : ''}</option>`).join('');
  sel.onchange = () => void initReal(sel.value);
  const agg = res.agg;
  if (!agg) { body.innerHTML = '<p class="mute">まだ対戦データがありません。遊ぶと自動で集まります。</p>'; sum.textContent = ''; return; }
  const total = Object.values(agg.games).reduce((n, [g]) => n + g, 0);
  sum.textContent = `${total}試合 ・ ` + Object.entries(agg.games).map(([k, [g]]) => `${MODE_NAMES[k] ?? k} ${g}`).join(' / ');
  const rows = impacts(agg).filter((x) => C[x.id] && x.used > 0).sort((a, b) => (b.used >= REAL_MIN ? 1 : 0) - (a.used >= REAL_MIN ? 1 : 0) || b.lift - a.lift);
  const sign = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}`;
  body.innerHTML = `<div class="tw"><table class="gt list"><tr><th>カード</th><th class="num">使用</th><th class="num">勝率</th><th class="num">影響</th><th class="num">AI評価</th></tr>` +
    rows.map((x) => {
      const faint = x.used < REAL_MIN ? ' style="opacity:.45"' : '';
      const col = x.used < REAL_MIN ? '' : x.lift >= 5 ? ' style="color:var(--you)"' : x.lift <= -5 ? ' style="color:var(--foe)"' : '';
      return `<tr data-card="${x.id}" tabindex="0"${faint}><td>${cname(C[x.id])}</td><td class="num">${x.used}</td><td class="num">${x.winUsed.toFixed(0)}%</td><td class="num"${col}><b>${sign(x.lift)}</b></td><td class="num">${tierBadge(x.id)}</td></tr>`;
    }).join('') + '</table></div><p class="small mute">使用＝使われた試合数、勝率＝使ったときの勝率、AI評価＝最強カードランキングでのランク（参考）。</p>';
  hydrate(body);
}

// ------------------------------------------------------------------ game records (admin only, #admin; not in the menu)
const ADM_KEY = 'cd.adminToken';
const REASON_JA: Record<string, string> = { ko: '拠点破壊', time: '時間切れ', surrender: '降参', timeout: '放置', disconnect: '切断' };
function initAdmin() {
  const base = serverUrl()?.replace(/^ws/, 'http');
  const tok = $('adm-token') as HTMLInputElement, ver = $('adm-ver') as HTMLSelectElement, q = $('adm-q') as HTMLInputElement;
  const list = $('adm-list'), sum = $('adm-sum'), game = $('adm-game');
  tok.value = store.get(ADM_KEY) ?? '';
  if (!base) { sum.textContent = 'この環境ではサーバーにつながっていません。'; return; }
  let items: StoredLog[] = [];
  let versions: string[] = [];
  const seatNames = (r: StoredLog): [string, string] => [r.names?.[0] || (r.src === 'report' ? `未登録(${(r.id ?? '').slice(-6)})` : '?'), r.src === 'report' ? `AI（${r.deckNames?.[1] || '?'}・${r.ai ?? ''}）` : r.names?.[1] || '?'];
  const copy = async (text: string, btn: HTMLButtonElement) => {
    try { await navigator.clipboard.writeText(text); btn.textContent = 'コピーしました'; }
    catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); btn.textContent = 'コピーしました'; }
  };
  const render = () => {
    const f = q.value.trim();
    const rows = items.filter((r) => !f || seatNames(r).some((n) => n.includes(f))).slice().reverse();
    sum.textContent = `${items.length}試合中 ${rows.length}試合を表示（新しい順）`;
    list.innerHTML = rows.slice(0, 200).map((r) => {
      const [a, b] = seatNames(r);
      const res = r.winner === -1 ? '引き分け' : `${r.winner === 0 ? a : b}の勝ち`;
      const t = new Date(r.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `<div class="item"><div><b>${esc(a)}</b> vs <b>${esc(b)}</b></div><div class="small mute">${t} ・ ${r.src === 'room' ? 'オンライン' : r.mode === 'rated' ? 'レート戦' : 'フリー'} ・ ${esc(res)}（${REASON_JA[r.reason] ?? esc(r.reason)}） ・ ${r.log.actions.length}手 ・ Ver. ${esc(r.v)}${r.problem ? ` ・ <span style="color:var(--foe)">⚠ ${esc(r.problem)}</span>` : ''}</div><button type="button" class="btn" data-g="${esc(r.gid)}" style="margin-top:4px">経過を見る</button></div>`;
    }).join('');
  };
  list.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-g]');
    const r = b && items.find((x) => x.gid === b.dataset.g);
    if (!r) return;
    const [na, nb] = seatNames(r);
    const text = `試合 ${r.gid}（Ver. ${r.v}）${na} vs ${nb}\n` + narrate(r.log, [na, r.src === 'report' ? 'AI' : nb]);
    game.innerHTML = `<h3>試合の経過</h3><div class="frow"><button type="button" class="btn" id="adm-ct">経過をコピー</button><button type="button" class="btn" id="adm-cj">記録（JSON）をコピー</button><button type="button" class="btn" id="adm-back">一覧へ戻る</button></div><pre>${esc(text)}</pre>`;
    list.style.display = 'none';
    ($('adm-ct') as HTMLButtonElement).onclick = (ev) => void copy(text, ev.currentTarget as HTMLButtonElement);
    ($('adm-cj') as HTMLButtonElement).onclick = (ev) => void copy(JSON.stringify(r), ev.currentTarget as HTMLButtonElement);
    ($('adm-back') as HTMLButtonElement).onclick = () => { game.innerHTML = ''; list.style.display = ''; };
    window.scrollTo({ top: game.offsetTop - 120 });
  };
  q.oninput = render;
  const load = async () => {
    store.set(ADM_KEY, tok.value.trim());
    sum.textContent = '読み込み中…'; items = []; game.innerHTML = ''; list.style.display = '';
    // one version, or all of them (oldest first, so the list ends with the newest)
    const want = ver.value === '*' ? versions.slice().reverse() : [ver.value || undefined];
    try {
      for (const v of want) {
        let after: string | null = null;
        for (;;) {
          const res = await fetch(base + '/api/logs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: tok.value.trim(), v, after, limit: 200 }) });
          if (res.status === 403) { sum.textContent = 'トークンが違います。'; return; }
          if (!res.ok) { sum.textContent = `サーバーエラー（${res.status}）`; return; }
          const page = (await res.json()) as { v: string | null; items: StoredLog[]; next: string | null };
          items.push(...page.items); after = page.next;
          sum.textContent = `${items.length}試合を読み込み中…`;
          if (!after) break;
        }
      }
    } catch { sum.textContent = '読み込めませんでした。通信状態を確かめてください。'; return; }
    items.sort((a, b) => a.at - b.at);
    render();
  };
  ($('adm-load') as HTMLButtonElement).onclick = () => void load();
  void (async () => {
    try {
      const r = await fetch(base + '/api/stats', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      versions = r.ok ? ((await r.json()) as { versions: string[] }).versions : [];
      ver.innerHTML = '<option value="*">すべてのバージョン</option>' + versions.map((v, i) => `<option value="${esc(v)}"${i === 0 ? ' selected' : ''}>Ver. ${esc(v)}</option>`).join('');
    } catch { /* offline: the newest version is used */ }
    if (tok.value) void load();
  })();
}

// ------------------------------------------------------------------ page frame
let page = '';
const lastUpdate = () => [NEWS[0]?.date ?? '', tierNow?.date ?? ''].sort().at(-1)!;
function renderPage(id: string) {
  const p = PAGE[id];
  page = id;
  main.innerHTML = `<nav class="crumbs" aria-label="現在地"><a href="#home" data-go="home">クロノ・デュエル攻略wiki</a>${id !== 'home' ? `<span>${esc(p.label)}</span>` : ''}</nav>
    <article class="art"><h1>${esc(p.title)}</h1>
      <div class="updated"><span>最終更新：<b id="upd-date">${esc(dayFmt(lastUpdate()))}</b></span><span>対応バージョン：<b>Ver. ${esc(VERSION)}</b></span>${id === 'ranking' ? `<span>評価データ：<b>${esc(META.date)}</b> 集計</span>` : ''}</div>
      ${p.intro ? `<p class="intro">${esc(p.intro)}</p>` : ''}
      <div id="page-body"></div></article>`;
  const bodyEl = $('page-body');
  bodyEl.appendChild(($(`t-${id}`) as HTMLTemplateElement).content.cloneNode(true));
  ({ home: initHome, tier: initTier, rated: initRated, themes: initThemes, history: initHistory, ranking: initRanking, cards: initCards, decks: initDecks, rules: drawClock, keywords: initKeywords, packs: initPacks,
    real: () => void initReal(), admin: initAdmin, gloss: () => { $('gloss').innerHTML = GLOSS.map(([t, d]) => `<dt>${t}</dt><dd>${esc(d)}</dd>`).join(''); } } as Record<string, () => void>)[id]?.();
  fillValues(main);
  // 目次（見出しが3つ以上あるページ）
  const hs = [...bodyEl.querySelectorAll<HTMLElement>('h2')];
  if (hs.length >= 3 && id !== 'home') {
    hs.forEach((h, i) => { if (!h.id) h.id = `sec-${i}`; });
    const toc = document.createElement('details');
    toc.className = 'toc'; toc.open = hs.length <= 10 || window.innerWidth > 700;
    toc.innerHTML = `<summary>目次</summary><ol>${hs.map((h) => `<li><a href="#" data-jump="${h.id}">${esc(h.textContent)}</a></li>`).join('')}</ol>`;
    bodyEl.before(toc);
  }
  hydrate(main);
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if ((a as HTMLElement).dataset.nav === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = id === 'home' ? 'クロノ・デュエル攻略wiki' : `${p.title} | クロノ・デュエル攻略wiki`;
}

function renderChrome() {
  $('gnav').innerHTML = MENU.map((p) => `<a href="#${p.id}" data-go="${p.id}" data-nav="${p.id}">${ICON[p.id] ?? ''}${p.label}</a>`).join('');
  const top = RANKED.slice(0, 5);
  $('side').innerHTML = `
    <div class="sbox"><a class="banner" href="../"><b>クロノ・デュエル</b><span>ターンのない対戦カードゲーム。ブラウザですぐ遊べます。</span><br><em>ゲームで遊ぶ</em></a></div>
    <div class="sbox menu"><h2>攻略メニュー</h2><ul class="smenu">${MENU.map((p) => `<li><a href="#${p.id}" data-go="${p.id}" data-nav="${p.id}">${ICON[p.id] ?? ''}${p.label}</a></li>`).join('')}</ul></div>
    <div class="sbox"><h2>環境Tier（実戦）</h2><div id="side-tier" class="stier"><p class="small mute">読み込み中…</p></div><p class="more"><a href="#tier" data-go="tier">Tier表を見る</a></p></div>
    <div class="sbox"><h2>最強カード TOP5</h2><ul class="stop" data-ctx="最強カードTOP5">${top.map((c, i) => `<li><button type="button" data-card="${c.id}"><i>${i + 1}</i>${img(c.id)}<span>${esc(c.name)}</span><small>${sign(SCORE[c.id])}</small></button></li>`).join('')}</ul></div>
    <div class="sbox"><h2>お知らせ</h2><ul class="snews">${NEWS.slice(0, 4).map((n) => `<li><time>${n.date.replace(/-/g, '.')}</time>${esc(n.title)}</li>`).join('')}</ul></div>`;
  fillValues(document);
  hydrate($('side'));
  void loadTier().then(() => {
    const rows = (tierNow?.rows ?? []).filter((r) => r.tier).slice(0, 5);
    $('side-tier').innerHTML = rows.length ? `<ol>${rows.map((r) => `<li><button type="button" data-type="${DECK_TYPES.indexOf(r.type)}">${markBadge(r.tier)}<span>${esc(r.type)}</span>${moveOf(r)}</button></li>`).join('')}</ol>` : '<p class="small mute">集計中（毎日4:30ごろ更新）</p>';
    const u = document.getElementById('upd-date');
    if (u) u.textContent = dayFmt(lastUpdate());
  });
}

// ------------------------------------------------------------------ card detail (opens over the current page)
let ctx: { label: string; ids: string[] } = { label: 'カード一覧', ids: CARD_LIST.map((c) => c.id) };
let current: string | null = null;
let pushed = false; // the detail added a history entry, so closing goes back
let opener: HTMLElement | null = null;
const modal = $('modal'), sheet = $('sheet');

function ctxFrom(el: HTMLElement | null): { label: string; ids: string[] } {
  const box = el?.closest<HTMLElement>('[data-ctx]');
  if (!box) return { label: 'カード一覧', ids: CARD_LIST.map((c) => c.id) };
  const ids = [...new Set([...box.querySelectorAll<HTMLElement>('[data-card]')].map((x) => x.dataset.card!).filter((id) => C[id]))];
  return { label: box.dataset.ctx!, ids };
}
function renderDetail(id: string) {
  const c = C[id];
  current = id;
  const i = ctx.ids.indexOf(id);
  const n = ctx.ids.length;
  const w = STATS.win[id], u = STATS.use[id];
  const kws = keywordsOf(c);
  const ds = decksWith(id);
  const rows: [string, string][] = [['コスト', `<b class="n">${c.cost}</b> 刻${c.rush ? `（急襲${c.rush}）` : ''}${c.charge ? `（充填${c.charge}）` : ''}`], ['種類', c.kind === 'unit' ? 'ユニット' : '術'], ['レアリティ', `<span class="rar ${c.rarity}">${RN[c.rarity]}</span>`], ['収録', esc(SET_NAMES[setOf(c)])]];
  if (c.kind === 'unit') rows.splice(1, 0, ['攻撃／体力', `<b class="n" style="color:var(--atk)">${c.atk}</b> ／ <b class="n" style="color:var(--hp)">${c.hp}</b>`], ['攻撃の間隔', `<b class="n">${c.reload}</b> 刻`]);
  sheet.innerHTML = `
    <div class="m-top">
      <span class="ctx">${i >= 0 ? `${esc(ctx.label)}<b>${i + 1} / ${n}</b>` : ''}</span>
      <button type="button" data-act="prev" ${i <= 0 ? 'disabled' : ''} aria-label="前のカード">‹ 前へ</button>
      <button type="button" data-act="next" ${i < 0 || i >= n - 1 ? 'disabled' : ''} aria-label="次のカード">次へ ›</button>
      <button type="button" class="x" data-act="close" aria-label="閉じる">×</button>
    </div>
    <div class="m-body">
      <div class="m-img">${img(id)}<p class="flv">「${esc(c.flavor)}」</p></div>
      <div>
        <h2 class="m-name" id="m-name">${esc(c.name)}</h2>
        <div class="m-sub">${kws.map((k) => `<span class="rar C">${k}</span>`).join('')}</div>
        <div class="m-eval">${tierBadge(id)}<div>${SCORE[id] != null ? `影響 <b>${sign(SCORE[id])}</b>（全${RANKED.length}種中 ${RANK[id]}位）<br>` : ''}${w != null ? `AI「ふつう」での採用時勝率 ${w}% ／ 1試合あたり 使用 ${u?.[0].toFixed(2) ?? '0'}回${u?.[1] ? ` ／ 予約 ${u[1].toFixed(2)}回` : ''}` : ''}${SCORE[id] == null && w == null ? 'このカードはまだ評価データがありません。' : ''}</div></div>
        <div class="tw"><table class="gt spec">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table></div>
        <div class="m-sec"><h4>効果</h4><p>${fx(c.text) || '<span class="mute">（効果なし）</span>'}</p>${c.resvText ? `<p class="resv"><b>予約</b>${fx(c.resvText)}</p>` : ''}</div>
        ${MEMO[id] ? `<div class="m-sec"><h4>攻略メモ</h4><p>${esc(MEMO[id])}</p></div>` : ''}
        ${kws.length ? `<div class="m-sec"><h4>キーワード</h4><div class="m-kw">${kws.map((k) => `<div><b>${k}</b>${esc(KEYWORD_HELP[k] ?? '')}</div>`).join('')}</div></div>` : ''}
        <div class="m-sec"><h4>このカードが入っているデッキ</h4>${ds.length ? `<div class="m-decks">${ds.map((b) => `<button type="button" data-type="${b.type}" data-build="${b.d.id}">${esc(b.d.name)}<small>×${b.count[id]}</small></button>`).join('')}</div>` : '<p class="small mute">解説しているデッキには入っていません。</p>'}</div>
      </div>
    </div>`;
  sheet.scrollTop = 0;
  hydrate(sheet);
}
function showDetail(id: string) {
  if (!ctx.ids.includes(id)) ctx = { label: 'カード一覧', ids: CARD_LIST.map((c) => c.id) };
  renderDetail(id);
  if (modal.hidden) {
    modal.hidden = false;
    document.body.classList.add('locked');
    sheet.focus({ preventScroll: true });
  }
  document.title = `${C[id].name} | クロノ・デュエル攻略wiki`;
}
function hideDetail() {
  if (modal.hidden) return;
  modal.hidden = true;
  document.body.classList.remove('locked');
  current = null; pushed = false;
  if (page) document.title = page === 'home' ? 'クロノ・デュエル攻略wiki' : `${PAGE[page].title} | クロノ・デュエル攻略wiki`;
  opener?.focus({ preventScroll: true }); opener = null;
}
function step(d: number) {
  const i = ctx.ids.indexOf(current ?? '');
  const id = ctx.ids[i + d];
  if (!id) return;
  setHash(`card-${id}`, true);
  renderDetail(id);
}
function closeDetail() {
  if (pushed) { pushed = false; history.back(); return; }
  setHash(page || 'home', true);
  hideDetail();
}

// ------------------------------------------------------------------ routing (#page or #card-<id>)
const hash = () => decodeURIComponent(location.hash.slice(1));
function setHash(h: string, replace = false) {
  try {
    if (replace) history.replaceState(null, '', `#${h}`);
    else if (hash() !== h) { location.hash = h; return true; }
  } catch { /* embedded previews may refuse */ }
  return false;
}
function route(h = hash()) {
  if (h.startsWith('card-')) {
    const id = h.slice(5);
    if (!C[id]) { route('cards'); return; }
    if (!page) renderPage('cards');
    showDetail(id);
    return;
  }
  hideDetail();
  const id = PAGE[h] ? h : 'home';
  if (id !== page) { renderPage(id); window.scrollTo({ top: 0 }); }
}
function go(h: string) { if (!setHash(h)) route(h); } // with a working hash, the hashchange event routes
function openCard(id: string, el: HTMLElement | null) {
  ctx = ctxFrom(el);
  opener = el;
  if (setHash(`card-${id}`)) pushed = true; else route(`card-${id}`);
}
window.addEventListener('hashchange', () => route());

// ------------------------------------------------------------------ clicks and keys
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('[data-close]')) { closeDetail(); return; }
  const act = t.closest<HTMLElement>('[data-act]');
  if (act) { const a = act.dataset.act; if (a === 'prev') step(-1); else if (a === 'next') step(1); else closeDetail(); return; }
  const ty = t.closest<HTMLElement>('[data-type]');
  if (ty) {
    const target = ty.dataset.build ? `build-${ty.dataset.build}` : `type-${ty.dataset.type}`;
    hideDetail();
    setHash('decks', true); pushed = false;
    if (page !== 'decks') route('decks');
    requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: 'start' }));
    return;
  }
  const st = t.closest<HTMLElement>('a[data-set]');
  if (st) { e.preventDefault(); Object.assign(F, { q: '', set: st.dataset.set!, kind: 'all', rar: 'all', kw: 'all' }); go('cards'); return; }
  const jump = t.closest<HTMLElement>('[data-jump]');
  if (jump) { e.preventDefault(); document.getElementById(jump.dataset.jump!)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const card = t.closest<HTMLElement>('[data-card]');
  if (card && !card.closest('.suggest')) { e.preventDefault(); openCard(card.dataset.card!, card); return; }
  const a = t.closest<HTMLAnchorElement>('a[data-go]');
  if (a) { e.preventDefault(); go(a.dataset.go!); }
});
document.addEventListener('keydown', (e) => {
  if (!modal.hidden) {
    if (e.key === 'Escape') { e.preventDefault(); closeDetail(); }
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    return;
  }
  const row = (e.target as HTMLElement).closest?.<HTMLElement>('tr[data-card]');
  if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openCard(row.dataset.card!, row); }
});

// ------------------------------------------------------------------ header search
{
  const qIn = $<HTMLInputElement>('gq'), box = $('suggest');
  let hits: string[] = [];
  let sel = -1;
  const draw = () => {
    const q = qIn.value.trim();
    if (!q) { box.hidden = true; return; }
    hits = CARD_LIST.filter((c) => matches(c, q)).sort((a, b) => Number(!a.name.includes(q)) - Number(!b.name.includes(q)) || a.cost - b.cost).slice(0, 6).map((c) => c.id);
    box.innerHTML = hits.map((id, i) => `<button type="button" data-hit="${i}" class="${i === sel ? 'on' : ''}">${img(id)}<span>${esc(C[id].name)}</span>${tierBadge(id)}</button>`).join('') +
      `<a href="#cards" class="all" data-all>「${esc(q)}」でカード一覧を絞り込む（${CARD_LIST.filter((c) => matches(c, q)).length}件）</a>`;
    box.hidden = false;
    hydrate(box);
  };
  const pick = (i: number) => {
    const id = hits[i];
    if (!id) return;
    box.hidden = true;
    ctx = { label: `検索「${qIn.value.trim()}」`, ids: CARD_LIST.filter((c) => matches(c, qIn.value.trim())).map((c) => c.id) };
    opener = qIn;
    if (setHash(`card-${id}`)) pushed = true; else route(`card-${id}`);
  };
  const all = () => {
    Object.assign(F, { q: qIn.value.trim(), set: 'all', kind: 'all', rar: 'all', kw: 'all' });
    box.hidden = true;
    if (page === 'cards') { $<HTMLInputElement>('q').value = F.q; renderCards(); } else go('cards');
  };
  qIn.addEventListener('input', () => { sel = -1; draw(); });
  qIn.addEventListener('focus', draw);
  qIn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(hits.length - 1, sel + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(-1, sel - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (sel >= 0) pick(sel); else if (qIn.value.trim()) all(); }
    else if (e.key === 'Escape') box.hidden = true;
  });
  box.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus so the click lands
  box.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const b = t.closest<HTMLElement>('[data-hit]');
    if (b) { pick(+b.dataset.hit!); return; }
    if (t.closest('[data-all]')) { e.preventDefault(); e.stopPropagation(); all(); }
  });
  qIn.addEventListener('blur', () => setTimeout(() => (box.hidden = true), 120));
}

// ------------------------------------------------------------------ start
renderChrome();
route();
