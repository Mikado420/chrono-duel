/* 攻略wiki（/wiki/）。カード・デッキ・ルールの数値はゲーム本体のデータをそのまま読むので、
 * カードを追加・調整すると次のビルドでwikiも更新されます。勝率は `npm run wiki:stats` で更新。 */
import './wiki.css';
import { CARD_LIST, KEYWORD_HELP, keywordsOf, setOf, type CardDef, type Rarity } from '../core/cards';
import { PRESET_DECKS, type DeckDef } from '../core/decks';
import { RULES } from '../core/rules';
import { CRAFT_COST, DAILY_BONUS, DAILY_MATCH_CAP, DUPE_SHARDS, LAST_SLOT, MATCH_REWARD, MIN_ACTIONS, PACKS, PITY } from '../meta/economy';
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

// ------------------------------------------------------------------ cards
function cardHTML(c: CardDef) {
  const w = STATS.win[c.id], u = STATS.use[c.id];
  const kw = keywordsOf(c);
  const stats = c.kind === 'unit'
    ? `<div class="stats"><span class="a"><small>攻</small>${c.atk}</span><span class="h"><small>体</small>${c.hp}</span><span class="r"><small>再</small>${c.reload}</span></div>` : '';
  const wr = w != null ? `<div class="wr" title="このカードを使った試合の勝率（AIふつう同士）"><span>採用時勝率</span><span class="bar"><i class="${w >= 53 ? 'hi' : w <= 45 ? 'lo' : ''}" style="width:${w}%"></i></span><b>${w}%</b></div>` : '';
  const use = u && (u[0] || u[1]) ? `<div class="small mute">1試合あたり 使用 ${u[0].toFixed(2)}回${u[1] ? ` ／ 予約 ${u[1].toFixed(2)}回` : ''}</div>` : '';
  return `<article class="card ${c.rarity}" id="card-${c.id}">
    <div class="hd"><div class="cost" aria-label="コスト${c.cost}">${c.cost}</div>
      <div><div class="name">${esc(c.name)}</div>
      <div class="sub"><span class="rar ${c.rarity}">${RN[c.rarity]}</span><span>${c.kind === 'unit' ? 'ユニット' : '術'}</span><span>・${setOf(c) === 'base' ? '基本' : '第1弾'}</span></div></div></div>
    ${stats}
    ${c.text ? `<div class="txt">${esc(c.text)}</div>` : '<div class="txt mute">（効果なし）</div>'}
    ${c.resvText ? `<div class="resv"><b>予約時</b>${esc(c.resvText)}</div>` : ''}
    ${kw.length ? `<div class="kw">${kw.map((k) => `<span>${k}</span>`).join('')}</div>` : ''}
    ${MEMO[c.id] ? `<div class="memo"><b>攻略</b>${esc(MEMO[c.id])}</div>` : ''}
    ${wr}${use}
    <div class="flavor">「${esc(c.flavor)}」</div>
  </article>`;
}

type Filter = { q: string; set: string; kind: string; rar: string; kw: string; sort: string };
const F: Filter = { q: '', set: 'all', kind: 'all', rar: 'all', kw: 'all', sort: 'cost' };
function seg(id: string, key: keyof Filter, opts: [string, string][]) {
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
function renderCards() {
  const q = F.q.trim();
  const list = CARD_LIST.filter((c) =>
    (F.set === 'all' || setOf(c) === F.set) && (F.kind === 'all' || c.kind === F.kind) && (F.rar === 'all' || c.rarity === F.rar) &&
    (F.kw === 'all' || keywordsOf(c).includes(F.kw)) &&
    (!q || [c.name, c.text, c.resvText, MEMO[c.id], keywordsOf(c).join(' ')].join(' ').includes(q)));
  const by: Record<string, (a: CardDef, b: CardDef) => number> = {
    cost: (a, b) => a.cost - b.cost || RO[a.rarity] - RO[b.rarity],
    win: (a, b) => (STATS.win[b.id] ?? 0) - (STATS.win[a.id] ?? 0),
    rar: (a, b) => RO[b.rarity] - RO[a.rarity] || a.cost - b.cost,
  };
  list.sort(by[F.sort]);
  $('count').textContent = `${list.length} / ${CARD_LIST.length} 種`;
  $('cardgrid').innerHTML = list.length ? list.map(cardHTML).join('') : '<p class="empty">条件に合うカードはありません。検索語か絞り込みを変えてください。</p>';
}
function initCards() {
  seg('f-set', 'set', [['all', 'すべて'], ['base', '基本'], ['echo', '第1弾']]);
  seg('f-kind', 'kind', [['all', 'すべて'], ['unit', 'ユニット'], ['spell', '術']]);
  seg('f-rar', 'rar', [['all', '全レア'], ['C', '通常'], ['R', '希少'], ['E', '秘宝'], ['L', '伝説']]);
  const kwSel = $<HTMLSelectElement>('f-kw'), sortSel = $<HTMLSelectElement>('f-sort'), qIn = $<HTMLInputElement>('q');
  kwSel.innerHTML = '<option value="all">キーワード：すべて</option>' + ['速攻', '挑発', '貫通', '残響', '共鳴', '急襲', '充填'].map((k) => `<option>${k}</option>`).join('');
  kwSel.value = F.kw; sortSel.value = F.sort; qIn.value = F.q;
  kwSel.onchange = () => { F.kw = kwSel.value; renderCards(); };
  sortSel.onchange = () => { F.sort = sortSel.value; renderCards(); };
  qIn.oninput = () => { F.q = qIn.value; renderCards(); };
  renderCards();
}

// ------------------------------------------------------------------ decks
function initDecks() {
  const decks: (DeckDef & { preset: boolean })[] = [...PRESET_DECKS.map((d) => ({ ...d, preset: true })), ...PACK_TEST_DECKS.map((d) => ({ ...d, preset: false }))];
  $('decklist').innerHTML = decks.map((d) => {
    const n: Record<string, number> = {};
    for (const c of d.cards) n[c] = (n[c] ?? 0) + 1;
    const ids = Object.keys(n).sort((a, b) => C[a].cost - C[b].cost || C[a].name.localeCompare(C[b].name, 'ja'));
    const curve = Array(9).fill(0) as number[];
    ids.forEach((id) => (curve[Math.min(9, Math.max(1, C[id].cost)) - 1] += n[id]));
    const mx = Math.max(...curve);
    const units = ids.reduce((s, id) => s + (C[id].kind === 'unit' ? n[id] : 0), 0);
    return `<div class="panel deck">
      <h3>${esc(d.name)} <span class="tag ${d.preset ? '' : 'test'}">${d.preset ? '基本デッキ' : '参考構築（第1弾入り）'}</span></h3>
      ${d.blurb ? `<p class="mute small" style="margin:0">${esc(d.blurb)}</p>` : ''}
      ${DECK_NOTE[d.id] ? `<p class="small" style="margin:6px 0 0">${esc(DECK_NOTE[d.id])}</p>` : ''}
      <div class="curve" aria-label="コスト分布">${curve.map((k, i) => `<div><i style="height:${mx ? (k / mx) * 34 : 0}px"></i>${i + 1}</div>`).join('')}</div>
      <p class="small mute" style="margin:4px 0 0">ユニット ${units}枚 ／ 術 ${d.cards.length - units}枚</p>
      <div class="dl">${ids.map((id) => `<div><span class="c">${C[id].cost}</span><a href="#cards" data-card="${id}">${esc(C[id].name)}</a><span class="n">×${n[id]}</span></div>`).join('')}</div>
    </div>`;
  }).join('');
  const cols = STATS.decks;
  $('matrix').innerHTML = `<tr><th class="row">行 ＼ 列</th>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>` +
    cols.map((r) => `<tr><th class="row">${esc(r)}</th>${(STATS.matrix[r] ?? []).map((x, i) => {
      const bg = r === cols[i] ? 'rgba(143,169,173,.10)' : x >= 55 ? 'rgba(95,208,181,.22)' : x <= 45 ? 'rgba(233,103,79,.22)' : 'transparent';
      return `<td style="background:${bg}">${x}</td>`;
    }).join('')}</tr>`).join('');
}

// ------------------------------------------------------------------ other pages
function initKeywords() {
  $('kwlist').innerHTML = KW_TIPS.map((k) => `<div class="panel block">
    <h3>${k.label} <span class="small mute" style="font-family:var(--f-body)">・${k.set}</span></h3>
    <p style="margin:0">${esc(KEYWORD_HELP[k.k])}</p>
    <p class="small" style="margin:0"><b style="color:var(--brass)">ポイント</b>　${esc(k.tip)}</p>
    <p class="small mute" style="margin:0">代表カード：${k.ex.filter((id) => C[id]).map((id) => `<a href="#cards" data-card="${id}">${esc(C[id].name)}</a>`).join('、')}</p>
  </div>`).join('');
}
function initPacks() {
  const [nw, nl, nd] = MATCH_REWARD['ai-normal'], [hw, hl, hd] = MATCH_REWARD['ai-hard'], [ow, ol, od] = MATCH_REWARD['online'];
  const range = (...xs: number[]) => (Math.min(...xs) === Math.max(...xs) ? `${xs[0]}` : `${Math.min(...xs)}〜${Math.max(...xs)}`);
  const row = (l: string, v: string | number) => `<tr><td>${l}</td><td class="num tick">${v}</td></tr>`;
  $('rewards').innerHTML = '<tr><th>結果</th><th class="num">コイン</th></tr>' +
    row('AI（ふつう）に勝利', nw) + row('AI（つよい）に勝利', hw) + row('オンラインで勝利', ow) +
    row('敗北', range(nl, hl, ol)) + row('引き分け', range(nd, hd, od)) + row('その日の初勝利ボーナス', `+${DAILY_BONUS}`);
  $('shards').innerHTML = '<tr><th>レアリティ</th><th class="num">もらえる欠片</th><th class="num">作成に必要</th></tr>' +
    (['C', 'R', 'E', 'L'] as Rarity[]).map((r) => `<tr><td><span class="rar ${r}">${RN[r]}</span></td><td class="num tick">${DUPE_SHARDS[r]}</td><td class="num tick">${CRAFT_COST[r]}</td></tr>`).join('');
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
  if (!document.body.contains(body)) return; // the reader moved to another tab meanwhile
  if (!res) { body.innerHTML = '<p class="mute">実戦データを読み込めませんでした。通信状態を確かめてください。</p>'; return; }
  sel.innerHTML = res.versions.map((v) => `<option value="${esc(v)}"${v === res!.agg?.v ? ' selected' : ''}>Ver. ${esc(v)}${v === VERSION ? '（最新）' : ''}</option>`).join('');
  sel.onchange = () => void initReal(sel.value);
  const agg = res.agg;
  if (!agg) { body.innerHTML = '<p class="mute">まだ対戦データがありません。遊ぶと自動で集まります。</p>'; sum.textContent = ''; return; }
  const total = Object.values(agg.games).reduce((n, [g]) => n + g, 0);
  sum.textContent = `${total}試合 ・ ` + Object.entries(agg.games).map(([k, [g]]) => `${MODE_NAMES[k] ?? k} ${g}`).join(' / ');
  const rows = impacts(agg).filter((x) => C[x.id] && x.used > 0).sort((a, b) => (b.used >= REAL_MIN ? 1 : 0) - (a.used >= REAL_MIN ? 1 : 0) || b.lift - a.lift);
  const sign = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}`;
  body.innerHTML = `<div style="overflow-x:auto"><table><tr><th>カード</th><th class="num">使用</th><th class="num">勝率</th><th class="num">影響</th><th class="num">AI戦</th></tr>` +
    rows.map((x) => {
      const ai = STATS.win[x.id];
      const faint = x.used < REAL_MIN ? ' style="opacity:.45"' : '';
      const col = x.used < REAL_MIN ? '' : x.lift >= 5 ? ' style="color:var(--you)"' : x.lift <= -5 ? ' style="color:var(--foe)"' : '';
      return `<tr${faint}><td style="white-space:nowrap"><a href="#cards" data-card="${x.id}">${esc(C[x.id].name)}</a></td><td class="num">${x.used}</td><td class="num">${x.winUsed.toFixed(0)}%</td><td class="num"${col}><b>${sign(x.lift)}</b></td><td class="num">${ai !== undefined ? ai + '%' : '—'}</td></tr>`;
    }).join('') + '</table></div><p class="small mute">使用＝使われた試合数、勝率＝使ったときの勝率、AI戦＝AI同士の対戦での採用時勝率（参考）。</p>';
}
// ------------------------------------------------------------------ game records (admin only, #admin; not in the menu)
const ADM_KEY = 'cd.adminToken';
const REASON_JA: Record<string, string> = { ko: '拠点破壊', time: '時間切れ', surrender: '降参', timeout: '放置', disconnect: '切断' };
function initAdmin() {
  const base = serverUrl()?.replace(/^ws/, 'http');
  const tok = $('adm-token') as HTMLInputElement, ver = $('adm-ver') as HTMLSelectElement, q = $('adm-q') as HTMLInputElement;
  const list = $('adm-list'), sum = $('adm-sum'), game = $('adm-game');
  try { tok.value = localStorage.getItem(ADM_KEY) ?? ''; } catch { /* storage blocked */ }
  if (!base) { sum.textContent = 'この環境ではサーバーにつながっていません。'; return; }
  let items: StoredLog[] = [];
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
      return `<div class="panel" style="padding:8px 10px;margin:6px 0"><div><b>${esc(a)}</b> vs <b>${esc(b)}</b></div><div class="small mute">${t} ・ ${r.src === 'room' ? 'オンライン' : r.mode === 'rated' ? 'レート戦' : 'フリー'} ・ ${esc(res)}（${REASON_JA[r.reason] ?? esc(r.reason)}） ・ ${r.log.actions.length}手</div><button type="button" data-g="${esc(r.gid)}" style="margin-top:4px">経過を見る</button></div>`;
    }).join('');
  };
  list.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-g]');
    const r = b && items.find((x) => x.gid === b.dataset.g);
    if (!r) return;
    const [na, nb] = seatNames(r);
    const text = `試合 ${r.gid}（Ver. ${r.v}）${na} vs ${nb}\n` + narrate(r.log, [na, r.src === 'report' ? 'AI' : nb]);
    game.innerHTML = `<h3>試合の経過</h3><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" id="adm-ct">経過をコピー</button><button type="button" id="adm-cj">記録（JSON）をコピー</button><button type="button" id="adm-back">一覧へ戻る</button></div><pre style="white-space:pre-wrap;font-size:12px;line-height:1.5;margin-top:8px">${esc(text)}</pre>`;
    list.style.display = 'none';
    ($('adm-ct') as HTMLButtonElement).onclick = (ev) => void copy(text, ev.currentTarget as HTMLButtonElement);
    ($('adm-cj') as HTMLButtonElement).onclick = (ev) => void copy(JSON.stringify(r), ev.currentTarget as HTMLButtonElement);
    ($('adm-back') as HTMLButtonElement).onclick = () => { game.innerHTML = ''; list.style.display = ''; };
    window.scrollTo({ top: game.offsetTop - 10 });
  };
  q.oninput = render;
  const load = async () => {
    try { localStorage.setItem(ADM_KEY, tok.value.trim()); } catch { /* storage blocked */ }
    sum.textContent = '読み込み中…'; items = []; game.innerHTML = ''; list.style.display = '';
    let after: string | null = null;
    try {
      for (;;) {
        const res = await fetch(base + '/api/logs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: tok.value.trim(), v: ver.value || undefined, after, limit: 200 }) });
        if (res.status === 403) { sum.textContent = 'トークンが違います。'; return; }
        if (!res.ok) { sum.textContent = `サーバーエラー（${res.status}）`; return; }
        const page = (await res.json()) as { v: string | null; items: StoredLog[]; next: string | null };
        items.push(...page.items); after = page.next;
        sum.textContent = `${items.length}試合を読み込み中…`;
        if (!after) break;
      }
    } catch { sum.textContent = '読み込めませんでした。通信状態を確かめてください。'; return; }
    render();
  };
  ($('adm-load') as HTMLButtonElement).onclick = () => void load();
  void (async () => {
    try {
      const r = await fetch(base + '/api/stats', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const vs = r.ok ? ((await r.json()) as { versions: string[] }).versions : [];
      ver.innerHTML = vs.map((v) => `<option value="${esc(v)}">Ver. ${esc(v)}</option>`).join('');
    } catch { /* offline: the newest version is used */ }
    if (tok.value) void load();
  })();
}
function drawClock() {
  const svg = $('clocksvg') as unknown as SVGSVGElement;
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
  svg.innerHTML = s;
}

// ------------------------------------------------------------------ navigation
const TABS: [string, string, string][] = [
  ['home', 'トップ', 'このwikiの使い方'],
  ['rules', 'ルール', '時計・行動コスト・鐘・終焉・予約・勝敗'],
  ['keywords', 'キーワード', '速攻・挑発・貫通・鐘鳴と、第1弾の残響・共鳴・急襲・充填'],
  ['cards', 'カード', `全${CARD_LIST.length}種を検索・絞り込み。攻略メモと採用時勝率つき`],
  ['decks', 'デッキ', '基本デッキ、参考構築、相性表'],
  ['tips', '立ち回り', '時間の使い方の定石9つ'],
  ['packs', 'パック', '提供割合、報酬、欠片、効率のよい集め方'],
  ['real', '実戦データ', 'みんなの対戦から集計したカード別の成績'],
  ['gloss', '用語集', '刻、世界の時刻、燃える、天井など'],
];

function show(id: string, cardId?: string) {
  if (id === 'admin') {
    document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', 'false'));
    main.innerHTML = '';
    main.appendChild(($('t-admin') as HTMLTemplateElement).content.cloneNode(true));
    document.title = '対戦の記録 | クロノ・デュエル攻略wiki';
    initAdmin();
    return;
  }
  if (!TABS.some((t) => t[0] === id)) id = 'home';
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String((b as HTMLElement).dataset.id === id)));
  main.innerHTML = '';
  main.appendChild(($(`t-${id}`) as HTMLTemplateElement).content.cloneNode(true));
  if (id === 'home') $('home-links').innerHTML = TABS.slice(1).map(([k, l, d]) => `<a class="panel" href="#${k}" data-go="${k}" style="text-decoration:none;color:inherit;display:block"><h3>${l}</h3><p class="small mute" style="margin:0">${d}</p></a>`).join('');
  if (id === 'rules') drawClock();
  if (id === 'keywords') initKeywords();
  if (id === 'cards') {
    if (cardId && C[cardId]) Object.assign(F, { q: C[cardId].name, set: 'all', kind: 'all', rar: 'all', kw: 'all' });
    initCards();
  }
  if (id === 'decks') initDecks();
  if (id === 'packs') initPacks();
  if (id === 'real') void initReal();
  if (id === 'gloss') $('gloss').innerHTML = GLOSS.map(([t, d]) => `<dt>${t}</dt><dd>${esc(d)}</dd>`).join('');
  fillValues(main);
  const title = TABS.find((t) => t[0] === id)![1];
  document.title = id === 'home' ? 'クロノ・デュエル攻略wiki' : `${title} | クロノ・デュエル攻略wiki`;
  if (location.hash.slice(1) !== id) { try { history.replaceState(null, '', `#${id}`); } catch { /* embedded previews may refuse */ } }
}

$('tabs').innerHTML = TABS.map(([k, l]) => `<button type="button" role="tab" data-id="${k}">${l}</button>`).join('');
$('tabs').onclick = (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (b) { show(b.dataset.id!); window.scrollTo({ top: 0 }); }
};
main.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-go], a[data-card]');
  if (!a) return;
  e.preventDefault();
  show(a.dataset.go ?? 'cards', a.dataset.card);
  window.scrollTo({ top: 0 });
});
window.addEventListener('hashchange', () => show(location.hash.slice(1)));
fillValues(document);
show(location.hash.slice(1) || 'home');
