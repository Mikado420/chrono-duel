/* 攻略wiki（/wiki/）。カード・デッキ・ルールの数値はゲーム本体のデータをそのまま読むので、
 * カードを追加・調整すると次のビルドでwikiも更新されます。勝率は `npm run wiki:stats` で更新。
 *
 * 画面: ページ（#cards など）と、どのページの上にも重ねて開くカード詳細（#card-<id>）。
 * カード詳細は履歴に1つ積むので、スマホの「戻る」で閉じると元のページの同じ位置に戻ります。 */
import './wiki.css';
import { CARD_LIST, KEYWORD_HELP, SET_NAMES, keywordsOf, setOf, type CardDef, type CardSet, type Rarity } from '../core/cards';
import { PRESET_DECKS, type DeckDef } from '../core/decks';
import { RULES } from '../core/rules';
import { CRAFT_COST, DAILY_BONUS, DAILY_MATCH_CAP, DUPE_SHARDS, LAST_SLOT, MATCH_REWARD, MIN_ACTIONS, PACKS, PITY } from '../meta/economy';
import { NEWS } from '../meta/progress';
import { cardFace } from '../render/cardArt';
import { PACK_TEST_DECKS } from '../sim/packDecks';
import { VERSION } from '../version';
import { DECK_NOTE, GLOSS, KW_TIPS, MEMO } from './content';
import { STATS } from './stats';
import { serverUrl } from '../net/config';
import { impacts, type StatsAgg, type StoredLog } from '../server/stats';
import { narrate } from '../core/narrate';

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
};
const fillValues = (root: ParentNode) => root.querySelectorAll<HTMLElement>('[data-v]').forEach((el) => {
  const v = V[el.dataset.v!];
  if (v !== undefined) el.textContent = String(v);
});

// ------------------------------------------------------------------ card images (the game's own card faces)
// Faces are drawn with the web fonts, so wait for them once; then draw each face the first time it scrolls into view.
const FONT_FACES = ['700 30px "Shippori Mincho B1"', 'italic 400 16px "Shippori Mincho B1"', '500 19px "Zen Kaku Gothic New"', '700 16px "Zen Kaku Gothic New"', '700 30px "Cinzel"'];
const fontsReady: Promise<void> = (async () => {
  try { await Promise.race([Promise.all(FONT_FACES.map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]); } catch { /* draw with fallbacks */ }
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

// ------------------------------------------------------------------ ratings (from the AI simulation)
type Tier = 'SS' | 'S' | 'A' | 'B' | 'C';
const TIERS: Tier[] = ['SS', 'S', 'A', 'B', 'C'];
const RANKED = CARD_LIST.filter((c) => STATS.win[c.id] != null).sort((a, b) => STATS.win[b.id] - STATS.win[a.id] || a.cost - b.cost);
const TIER: Record<string, Tier> = {};
const RANK: Record<string, number> = {};
{
  const n = RANKED.length;
  const cuts = [0.1, 0.3, 0.55, 0.8].map((f) => STATS.win[RANKED[Math.max(0, Math.ceil(n * f) - 1)]?.id] ?? 0);
  RANKED.forEach((c, i) => {
    const w = STATS.win[c.id];
    const t = cuts.findIndex((x) => w >= x);
    TIER[c.id] = TIERS[t < 0 ? 4 : t];
    RANK[c.id] = i === 0 || w !== STATS.win[RANKED[i - 1].id] ? i + 1 : RANK[RANKED[i - 1].id];
  });
}
const tierBadge = (id: string) => (TIER[id] ? `<span class="tb ${TIER[id]}">${TIER[id]}</span>` : '<span class="tb none">—</span>');

// ------------------------------------------------------------------ decks
type WikiDeck = DeckDef & { preset: boolean; avg: number | null; count: Record<string, number>; ids: string[] };
const DECKS: WikiDeck[] = [...PRESET_DECKS.map((d) => ({ d, preset: true })), ...PACK_TEST_DECKS.map((d) => ({ d, preset: false }))].map(({ d, preset }) => {
  const count: Record<string, number> = {};
  for (const c of d.cards) count[c] = (count[c] ?? 0) + 1;
  const ids = Object.keys(count).filter((id) => C[id]).sort((a, b) => C[a].cost - C[b].cost || C[a].name.localeCompare(C[b].name, 'ja'));
  const row = STATS.matrix[d.name];
  const self = STATS.decks.indexOf(d.name);
  const others = row?.filter((_, i) => i !== self) ?? [];
  return { ...d, preset, count, ids, avg: others.length ? others.reduce((s, x) => s + x, 0) / others.length : null };
}).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
const decksWith = (id: string) => DECKS.filter((d) => d.count[id]);

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
};
interface Page { id: string; label: string; title: string; desc: string; intro?: string; hidden?: boolean }
const PAGES: Page[] = [
  { id: 'home', label: 'トップ', title: 'クロノ・デュエル攻略wiki', desc: 'このwikiの使い方' },
  { id: 'ranking', label: '最強ランキング', title: '最強カードランキング', desc: '全カードを5段階で評価',
    intro: '全カードを、AI同士の対戦で「使ったときに勝ちやすかったか」で5段階に分けたランキングです。カードの画像をタップすると、その場で詳しい性能と攻略メモを見られます。' },
  { id: 'cards', label: 'カード一覧', title: `カード一覧（全${CARD_LIST.length}種）`, desc: '検索・絞り込み・評価つき',
    intro: 'セット・種類・レアリティ・効果で絞り込めます。行をタップすると詳細が開き、「前へ／次へ」で絞り込んだ一覧の中を順番に見られます。' },
  { id: 'decks', label: 'デッキ', title: '最強デッキランキングと相性表', desc: '基本デッキと参考構築、相性表',
    intro: '最初から使える基本デッキと、バランス検証に使われている第1弾入りの参考構築です。' },
  { id: 'rules', label: '基本ルール', title: '基本ルールと遊び方', desc: '時計・行動コスト・鐘・終焉・予約',
    intro: 'クロノ・デュエルにはターンがありません。時計と行動コストの仕組みを押さえれば、すぐに遊べます。' },
  { id: 'keywords', label: 'キーワード', title: 'キーワード一覧と使い方', desc: '残響・共鳴・急襲・充填など',
    intro: 'カードに書かれたキーワードの効果と、使うときのポイントです。各キーワードを持つカードも一覧にしています。' },
  { id: 'tips', label: '立ち回り', title: '勝つための立ち回り・定石9選', desc: '時間の使い方のコツ',
    intro: 'ルールの仕組みから言える定石です。デッキや相手によって例外はあります。' },
  { id: 'packs', label: 'パック・報酬', title: 'パックの確率とカードの集め方', desc: '提供割合・報酬・欠片' },
  { id: 'real', label: '実戦データ', title: '実戦データ（カード別の成績）', desc: 'みんなの対戦の集計',
    intro: 'みんなが実際に遊んだ対戦（フリー対戦・レート戦・フレンド対戦）から集計した、カードごとの成績です。AI同士の統計では分からない「人が使ったときの強さ」が見えます。バージョンごとに集計するので、調整前の数字は混ざりません。' },
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
      `<tr data-card="${c.id}" tabindex="0"><td>${cname(c)}</td><td class="num"><span class="costb">${c.cost}</span></td><td>${stat(c)}</td><td class="eff wide">${esc(c.text) || '<span class="mute">（効果なし）</span>'}</td><td>${tierBadge(c.id)}</td></tr>`).join('')}</table></div>`;
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
  $('ranktable').innerHTML = '<tr><th class="num">順位</th><th>カード</th><th>評価</th><th class="num">採用時勝率</th><th class="num wide">使用／試合</th></tr>' +
    RANKED.map((c) => {
      const u = STATS.use[c.id];
      return `<tr data-card="${c.id}" tabindex="0"><td class="ranknum">${RANK[c.id]}</td><td>${cname(c)}</td><td>${tierBadge(c.id)}</td><td class="num"><b class="n">${STATS.win[c.id]}%</b></td><td class="num wide small">${u ? (u[0] + u[1]).toFixed(2) : '—'}</td></tr>`;
    }).join('');
  $('ranktable').classList.add('list');
}

// ------------------------------------------------------------------ decks page
function deckBlock(d: WikiDeck, rank: number, compact = false) {
  const units = d.cards.filter((id) => C[id]?.kind === 'unit').length;
  const head = `<div class="deck-hd"><span class="rk${rank <= 3 ? ' top' : ''}">${rank}</span>
    <div><h3>${esc(d.name)}</h3><div class="tags"><span class="tag ${d.preset ? '' : 'test'}">${d.preset ? '基本デッキ' : '参考構築（第1弾入り）'}</span>${d.blurb ? `<span class="small mute">${esc(d.blurb)}</span>` : ''}</div></div>
    <div class="wr">平均勝率<b>${d.avg != null ? d.avg.toFixed(1) + '%' : '—'}</b></div></div>`;
  if (compact) {
    const key = [...d.ids].sort((a, b) => C[b].cost - C[a].cost).slice(0, 8);
    return `<div class="deck">${head}<div class="deck-bd"><div class="mini" data-ctx="デッキ「${esc(d.name)}」">${key.map((id) => `<button type="button" class="thumb" data-card="${id}" title="${esc(C[id].name)}">${img(id)}</button>`).join('')}</div></div></div>`;
  }
  const curve = Array(9).fill(0) as number[];
  d.cards.forEach((id) => { if (C[id]) curve[Math.min(9, Math.max(1, C[id].cost)) - 1]++; });
  const mx = Math.max(...curve);
  const avgCost = d.cards.reduce((s, id) => s + (C[id]?.cost ?? 0), 0) / d.cards.length;
  return `<section class="deck" id="deck-${d.id}">${head}<div class="deck-bd">
    ${DECK_NOTE[d.id] ? `<p>${esc(DECK_NOTE[d.id])}</p>` : ''}
    <div class="thumbs sm" data-ctx="デッキ「${esc(d.name)}」">${d.ids.map((id) => thumb(id, d.count[id] > 1 ? `<span class="cnt">×${d.count[id]}</span>` : '')).join('')}</div>
    <div class="deck-meta"><div class="curve" aria-label="コスト分布">${curve.map((k, i) => `<div><i style="height:${mx ? (k / mx) * 34 : 0}px"></i>${i + 1}</div>`).join('')}</div>
      <div>ユニット ${units}枚 ／ 術 ${d.cards.length - units}枚<br>平均コスト ${avgCost.toFixed(1)}</div></div>
  </div></section>`;
}
function initDecks() {
  $('decklist').innerHTML = DECKS.map((d, i) => deckBlock(d, i + 1)).join('');
  const cols = STATS.decks;
  $('matrix').innerHTML = `<tr><th class="row">行 ＼ 列</th>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>` +
    cols.map((r) => `<tr><th class="row">${esc(r)}</th>${(STATS.matrix[r] ?? []).map((x, i) => {
      const bg = r === cols[i] ? 'rgba(143,169,173,.12)' : x >= 55 ? 'rgba(95,208,181,.24)' : x <= 45 ? 'rgba(233,103,79,.24)' : '';
      return `<td${bg ? ` style="background:${bg}"` : ''}>${x}</td>`;
    }).join('')}</tr>`).join('');
}

// ------------------------------------------------------------------ home
function initHome() {
  const legends = ['dragon', 'e_verna', 'titan'].filter((id) => C[id]);
  $('kv-cards').innerHTML = legends.map((id) => img(id)).join('');
  $('home-news').innerHTML = NEWS.slice(0, 5).map((n) => `<li><details><summary><time>${n.date.replace(/-/g, '.')}</time><span class="tag ${n.tag}">${n.tag}</span><span>${esc(n.title)}</span></summary><p>${esc(n.body)}</p></details></li>`).join('');
  $('home-tiles').innerHTML = MENU.slice(1).map((p) => `<a href="#${p.id}" data-go="${p.id}"><span class="ic">${ICON[p.id] ?? ''}</span><b>${p.label}</b><small>${p.desc}</small></a>`).join('');
  $('home-tier').innerHTML = (['SS', 'S'] as Tier[]).map((t) => tierRow(t, RANKED.filter((c) => TIER[c.id] === t).map((c) => c.id))).join('');
  $('home-tier').dataset.ctx = '最強カードランキング';
  $('home-decks').innerHTML = DECKS.slice(0, 3).map((d, i) => deckBlock(d, i + 1, true)).join('');
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
function renderPage(id: string) {
  const p = PAGE[id];
  page = id;
  main.innerHTML = `<nav class="crumbs" aria-label="現在地"><a href="#home" data-go="home">クロノ・デュエル攻略wiki</a>${id !== 'home' ? `<span>${esc(p.label)}</span>` : ''}</nav>
    <article class="art"><h1>${esc(p.title)}</h1>
      <div class="updated"><span>対応バージョン：<b>Ver. ${esc(VERSION)}</b></span><span>評価データ：<b>${esc(STATS.date)}</b> 集計</span></div>
      ${p.intro ? `<p class="intro">${esc(p.intro)}</p>` : ''}
      <div id="page-body"></div></article>`;
  const bodyEl = $('page-body');
  bodyEl.appendChild(($(`t-${id}`) as HTMLTemplateElement).content.cloneNode(true));
  ({ home: initHome, ranking: initRanking, cards: initCards, decks: initDecks, rules: drawClock, keywords: initKeywords, packs: initPacks,
    real: () => void initReal(), admin: initAdmin, gloss: () => { $('gloss').innerHTML = GLOSS.map(([t, d]) => `<dt>${t}</dt><dd>${esc(d)}</dd>`).join(''); } } as Record<string, () => void>)[id]?.();
  fillValues(main);
  // 目次（見出しが3つ以上あるページ）
  const hs = [...bodyEl.querySelectorAll<HTMLElement>('h2')];
  if (hs.length >= 3) {
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
    <div class="sbox"><h2>採用時勝率 TOP5</h2><ul class="stop" data-ctx="採用時勝率TOP5">${top.map((c, i) => `<li><button type="button" data-card="${c.id}"><i>${i + 1}</i>${img(c.id)}<span>${esc(c.name)}</span><small>${STATS.win[c.id]}%</small></button></li>`).join('')}</ul></div>
    <div class="sbox"><h2>お知らせ</h2><ul class="snews">${NEWS.slice(0, 4).map((n) => `<li><time>${n.date.replace(/-/g, '.')}</time>${esc(n.title)}</li>`).join('')}</ul></div>`;
  fillValues(document);
  hydrate($('side'));
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
        <div class="m-eval">${tierBadge(id)}<div>${w != null ? `採用時勝率 <b>${w}%</b>（全${RANKED.length}種中 ${RANK[id]}位）<br>1試合あたり 使用 ${u?.[0].toFixed(2) ?? '0'}回${u?.[1] ? ` ／ 予約 ${u[1].toFixed(2)}回` : ''}` : 'このカードはまだ評価データがありません。'}</div></div>
        <div class="tw"><table class="gt spec">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table></div>
        <div class="m-sec"><h4>効果</h4><p>${esc(c.text) || '<span class="mute">（効果なし）</span>'}</p>${c.resvText ? `<p class="resv"><b>予約時</b>${esc(c.resvText)}</p>` : ''}</div>
        ${MEMO[id] ? `<div class="m-sec"><h4>攻略メモ</h4><p>${esc(MEMO[id])}</p></div>` : ''}
        ${kws.length ? `<div class="m-sec"><h4>キーワード</h4><div class="m-kw">${kws.map((k) => `<div><b>${k}</b>${esc(KEYWORD_HELP[k] ?? '')}</div>`).join('')}</div></div>` : ''}
        <div class="m-sec"><h4>このカードが入っているデッキ</h4>${ds.length ? `<div class="m-decks">${ds.map((d) => `<button type="button" data-deck="${d.id}">${esc(d.name)}<small>×${d.count[id]}</small></button>`).join('')}</div>` : '<p class="small mute">掲載デッキには入っていません。</p>'}</div>
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
  const deck = t.closest<HTMLElement>('[data-deck]');
  if (deck) {
    const target = `deck-${deck.dataset.deck}`;
    setHash('decks', true); pushed = false; route('decks');
    requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: 'start' }));
    return;
  }
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
