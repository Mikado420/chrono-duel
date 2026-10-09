/** Small DOM building blocks shared by the menu screens: elements, icons, currency pills, headers, ribbons. */
import { cardDef } from '../core/cards';
import { audio } from '../render/audio';
import { cardBack, cardFace, packArt } from '../render/cardArt';
import { backSvg } from '../render/lookArt';
import { artBack, isArtBack } from '../render/looks';
import type { Tier } from '../meta/rating';
import { titleById } from '../meta/titles';
import { store } from './storage';

type Child = Node | string | null | undefined | false;
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), (e) => { audio.unlock(); (v as (e: Event) => void)(e); });
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
}

const cache = new Map<string, string>();
const memo = (key: string, make: () => HTMLCanvasElement, type = 'image/webp', q = 0.9) => {
  let u = cache.get(key);
  if (!u) { u = make().toDataURL(type, q); cache.set(key, u); }
  return u;
};
export const cardImg = (id: string) => memo('f:' + id, () => cardFace(id));
export const backImg = (style: string) => (isArtBack(style) && !artBack(style) ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(backSvg(style, 340, 476, true))}` : memo('b:' + style, () => cardBack(style)));
/** Themed pictures straight from their SVG (previews in menus). */
export const svgImg = (svgText: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
export const packImg = (name: string, sub: string) => memo('p:' + name, () => packArt(name, sub), 'image/webp', 0.92);
/** The illustration part of a card face, as a CSS background (art box: 18,62 to 322,250 on a 340×476 face). */
export const artStyle = (id: string) => `background-image:url("${cardImg(id)}")`;

export const svg = (d: string, w = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
/** Line icons used by the tab bar, the home shortcuts and the menus. */
export const ICON = {
  home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  battle: svg('<path d="M4 4l9 9M20 4l-9 9"/><path d="M4 4h4M4 4v4M20 4h-4M20 4v4"/><path d="M9 15l-4 4M15 15l4 4"/><path d="M7 13l4 4M17 13l-4 4"/>'),
  deck: svg('<rect x="7" y="3" width="12" height="16" rx="2"/><path d="M5 6v13a2 2 0 0 0 2 2h9"/>'),
  shop: svg('<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>'),
  menu: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'),
  news: svg('<path d="M4 10v4l11 5V5z"/><path d="M15 9a3 3 0 0 1 0 6"/><path d="M7 14l1 5"/>'),
  mission: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 12l2 2 4-4.5"/>'),
  sprout: svg('<path d="M12 20v-9"/><path d="M12 11C12 6 8.5 4.5 5 4.5c0 4 2.5 6.5 7 6.5z"/><path d="M12 12c0-4 3.5-6 7-6 0 4-2.5 6-7 6"/>'),
  gift: svg('<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11"/><path d="M12 9c-2-4-6-4-6-1s6 1 6 1c2-4 6-4 6-1s-6 1-6 1"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'),
  book: svg('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M9 7h6"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7"/><path d="M12 17h.01"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  door: svg('<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>'),
  wiki: svg('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'),
  trophy: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8 20h8"/>'),
  pen: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  swap: svg('<path d="M4 8h14l-3-3M20 16H6l3 3"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>', 2.4),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>', 2.4),
  search: svg('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>'),
  star: svg('<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.2 6.1L12 16.8 6.5 19.7l1.2-6.1-4.5-4.2 6.1-.8z"/>'),
  eye: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 2.4),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V4h12"/>'),
  share: svg('<path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6"/>'),
  chev: svg('<path d="M9 5l7 7-7 7"/>', 2.4),
  sound: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>'),
  mute: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
};

/** Coin, ticket and 欠片 counters. */
export function purse(opts: { shards?: boolean } = {}) {
  const w = store.wallet;
  const n = (v: number) => v.toLocaleString('ja-JP');
  return h('div', { class: 'purse' },
    h('span', { class: 'pill coin', 'aria-label': `コイン ${w.coins}` }, h('i', {}), n(w.coins)),
    h('span', { class: 'pill ticket', 'aria-label': `パックチケット ${w.tickets}枚` }, h('i', {}), n(w.tickets)),
    opts.shards !== false ? h('span', { class: 'pill shard', 'aria-label': `時の欠片 ${w.shards}` }, h('i', {}), n(w.shards)) : null);
}

/** The bar at the top of a sub-screen: a brass back arrow, the title and anything on the right. */
export function topBar(title: string, back: (() => void) | null, ...right: Child[]) {
  return h('header', { class: 'cd-top' },
    back ? h('button', { class: 'back-arrow', onclick: () => { audio.play('select'); back(); } }, '戻る') : null,
    h('h1', {}, title),
    ...right);
}

/** The plate of a 称号: the grander its grade (黄→赤), the grander the plate. */
export function ribbon(titleId: string | undefined, cls = '') {
  const t = titleById(titleId);
  if (!t) return null;
  if (t.season) return h('span', { class: `stt sv-${t.season.tier} sea-${t.season.id} ${cls}`, title: t.how, 'aria-label': t.name, html: seasonPlate(t.season.tier, t.season.label, t.season.rank) });
  return h('span', { class: `ttl t-${t.tone} ${cls}`, title: t.how }, h('b', {}, t.name));
}

/**
 * 季の称号 (第1季「残響の刻」: blue, bells and ripples). The same plate for every rank, growing with it: 見習い to 刻匠 only
 * deepen the blue and the emblem; 刻豪 adds a bell, ripples and sound waves outside; 刻聖 a belfry crown, a swinging bell
 * and an afterimage; 刻神 blade wings, a halo, a turning dial, a threefold afterimage and sparks. Colours live in skin.css.
 */
function seasonPlate(tier: string, label: string, rank: string): string {
  const L = TIER_LEVEL[tier] ?? 0;
  const txt = `<span class="stt-ki">${label}</span><span class="stt-nm">${rank}</span>`;
  if (L <= 2) {
    const em = [
      '<circle cx="8" cy="8" r="2" fill="currentColor"/><circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.2" opacity=".8"/>',
      '<circle cx="8" cy="8" r="2" fill="currentColor"/><circle cx="8" cy="8" r="4.6" stroke="currentColor" stroke-width="1.2" opacity=".85"/><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1" stroke-dasharray="2.6 1.8" opacity=".5"/>',
      '<circle cx="8" cy="8" r="2" fill="currentColor"/><circle cx="8" cy="8" r="4.3" stroke="currentColor" stroke-width="1.2" opacity=".9"/><circle cx="8" cy="8" r="6.3" stroke="currentColor" stroke-width=".9" stroke-dasharray="2.2 1.6" opacity=".55"/><path d="M8 .3V2M8 14v1.7M.3 8H2m12 0h1.7" stroke="currentColor" stroke-width="1.2"/>',
    ][L];
    return `<span class="stt-pl"><svg class="stt-em" viewBox="0 0 16 16" fill="none">${em}</svg><span class="stt-ki">${label}</span><i class="stt-dv"></i><span class="stt-nm">${rank}</span></span>`;
  }
  const bellBody = 'M7 2.2C4.2 2.2 3.2 5 3.2 8.2L2 11.8h10l-1.2-3.6C10.8 5 9.8 2.2 7 2.2Z';
  if (L === 3) {
    const fl = (r: boolean) => `<svg class="stt-fl${r ? ' r' : ''}" viewBox="0 0 10 22" fill="none"><path d="M8.5 5Q3.5 11 8.5 17" stroke="currentColor" stroke-width="1.3"/><path d="M4.6 7.6Q1.8 11 4.6 14.4" stroke="currentColor" stroke-width="1" opacity=".6"/></svg>`;
    return `${fl(false)}<span class="stt-pl"><i class="stt-rp"></i><i class="stt-rp" style="--d:1.2s"></i><svg class="stt-bl" viewBox="0 0 14 16" fill="none"><path d="M7 .8v1.4" stroke="#c3d9f7" stroke-width="1.2"/><path d="${bellBody}" fill="#c3d9f7" stroke="#0a2566"/><circle cx="7" cy="13.4" r="1.5" fill="#c3d9f7"/></svg><span class="stt-tw">${txt}</span></span>${fl(true)}`;
  }
  const echo = (x: number, d: number) => `<span class="stt-echo" style="--x:${x}px;--d:${d}s">${txt}</span>`;
  if (L === 4) {
    const fl = (r: boolean) => `<svg class="stt-fl${r ? ' r' : ''}" viewBox="0 0 16 22" fill="none"><path d="M14 3Q7 11 14 19" stroke="currentColor" stroke-width="1.5"/><path d="M10 6q-4.4 5 0 10" stroke="currentColor" stroke-width="1.2" opacity=".75"/><path d="M6.2 8.4Q4 11 6.2 13.6" stroke="currentColor" opacity=".5"/><path d="M.6 11l1.8-1.8L4.2 11l-1.8 1.8Z" fill="currentColor" opacity=".8"/></svg>`;
    return `<svg class="stt-cr" viewBox="0 0 28 8" fill="none"><path d="M2 8Q14-1.5 26 8" stroke="currentColor" stroke-width="1.1"/><path d="M14 .4l1.3 2.2L14 4.8l-1.3-2.2Z" fill="currentColor"/></svg>${fl(false)}<span class="stt-pl"><i class="stt-rp"></i><i class="stt-rp" style="--d:.35s"></i><i class="stt-gl"></i><svg class="stt-bl" viewBox="0 0 14 16" fill="none"><path d="M7 .8v1.4" stroke="#eaf5ff" stroke-width="1.2"/><path d="${bellBody}" fill="#dcefff" stroke="#06144a"/><path d="M4.4 6.6c.3-1.9 1-2.9 2-3.2" stroke="#fff" stroke-width=".8"/><path d="M3 10.2h8" stroke="#6f9fe0" stroke-width=".6"/><circle cx="7" cy="13.4" r="1.5" fill="#eaf5ff"/></svg><span class="stt-tw">${txt}${echo(7, 0)}</span></span>${fl(true)}`;
  }
  const blade = (r: boolean) => `<svg class="stt-fl${r ? ' r' : ''}" viewBox="0 0 24 28" fill="none"><defs><linearGradient id="stt-blade" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#e6f6ff"/><stop offset="1" stop-color="#2a6fd8"/></linearGradient></defs><path d="M24 5 5 1.5l9 8Z" fill="url(#stt-blade)"/><path d="M24 23 5 26.5l9-8Z" fill="url(#stt-blade)"/><path d="M24 10.5 0 14l24 3.5Z" fill="url(#stt-blade)"/><path d="M19 7.5q-6 6.5 0 13" stroke="#9fdcff" stroke-width="1.1"/></svg>`;
  const sparks = [[20, 0, -3], [36, 0.8, 2], [52, 1.6, -2], [68, 0.4, 4], [82, 2.1, -1]].map(([l, d, dx]) => `<i class="stt-spk" style="left:${l}%;--d:${d}s;--dx:${dx}px"></i>`).join('');
  return `<svg class="stt-cr" viewBox="0 0 44 12" fill="none"><path d="M3 12Q22-2 41 12" stroke="#9fdcff" stroke-width="1.1"/><path d="m8 8.3-1.2-1.4M36 8.3l1.2-1.4M14 5l-.7-1.6M30 5l.7-1.6" stroke="#9fdcff"/><path d="m22 0 1.8 5.5L22 8l-1.8-2.5Z" fill="#eaf8ff"/><path d="m16.5 3.4 1.1 4.2-1.9.3Z" fill="#6fd0ff"/><path d="m27.5 3.4-1.1 4.2 1.9.3Z" fill="#6fd0ff"/></svg>${blade(false)}<span class="stt-pl"><svg class="stt-rg" viewBox="0 0 42 42" fill="none"><circle cx="21" cy="21" r="17" stroke="#6fd0ff" stroke-width=".8" stroke-dasharray="1.2 3.2"/><path d="M5 21a16 16 0 0 1 7-13M30 8a16 16 0 0 1 7 13" stroke="#6fd0ff" stroke-width="1.2"/><path d="M21 2v4m0 30v4M2 21h4m30 0h4" stroke="#bfeaff"/></svg><i class="stt-rp"></i><i class="stt-rp" style="--d:.3s"></i><i class="stt-gl"></i><svg class="stt-bl" viewBox="0 0 14 16" fill="none"><path d="M5 1.6 5.8.2 7 1.2 8.2.2 9 1.6Z" fill="#9fdcff"/><path d="M7 2C4.2 2 3.2 5 3.2 8.2L2 11.8h10l-1.2-3.6C10.8 5 9.8 2 7 2Z" fill="#0d1f66" stroke="#8fd4ff" stroke-width=".9"/><path d="M7.7 2.6 6.3 5.6l1.9 2.1-1.6 3.9" stroke="#cff3ff" stroke-width=".7"/><path d="M2 11.8h10" stroke="#cff3ff" stroke-width=".8"/><circle cx="7" cy="13.4" r="1.5" fill="#8fd4ff"/></svg><span class="stt-tw">${txt}${echo(4, 0)}${echo(8, 0.12)}${echo(12, 0.24)}</span></span>${blade(true)}${sparks}`;
}
/** Hexagonal badge of a rank, with or without its name. Higher ranks wear more: frame, rivets, laurels, rays, a crown, fire. */
export function tierBadge(t: Tier, size: 'sm' | 'lg' = 'sm', withName = true) {
  return h('span', { class: `tier-badge ${size} tb-${t.id}`, style: `--tier:${t.color}` }, h('span', { class: 'te', html: tierEmblem(t.id) }), withName ? h('b', {}, t.name) : null);
}
const TIER_LOOK: Record<string, [string, string, string]> = {
  novice: ['#d9f5bf', '#6cc04a', '#244f14'], shi: ['#dbe9ff', '#4a86e8', '#173269'], sho: ['#ffd9b5', '#b9692d', '#43200c'],
  go: ['#ffffff', '#b7c1cb', '#46525e'], sei: ['#fff5c8', '#e4aa2a', '#5e3f05'], shin: ['#ffe0a6', '#d61c2a', '#3d040c'],
};
const TIER_LEVEL: Record<string, number> = { novice: 0, shi: 1, sho: 2, go: 3, sei: 4, shin: 5 };
/** The emblem of a rank as SVG (100×100). */
export function tierEmblem(id: string): string {
  const L = TIER_LEVEL[id] ?? 0;
  const [hi, mid, lo] = TIER_LOOK[id] ?? TIER_LOOK.novice;
  const hex = (r: number, cx = 50, cy = 52) => Array.from({ length: 6 }, (_, k) => { const a = (Math.PI / 3) * k - Math.PI / 2; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
  const g = `te-${id}`;
  const defs = `<defs><linearGradient id="${g}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset=".45" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></linearGradient><radialGradient id="${g}c" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="${hi}"/><stop offset=".5" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></radialGradient><clipPath id="${g}k"><polygon points="${hex(26)}"/></clipPath></defs>`;
  const parts: string[] = [];
  // 刻神: a turning cog ring and flames behind everything
  if (L >= 5) {
    parts.push(`<g class="te-spin"><circle cx="50" cy="52" r="45" fill="none" stroke="${mid}" stroke-width="5" stroke-dasharray="5 4.4" opacity=".85"/><circle cx="50" cy="52" r="41" fill="none" stroke="${hi}" stroke-width="1" opacity=".6"/></g>`);
    parts.push(`<g class="te-pulse" fill="${hi}" opacity=".9">${[-60, -30, 0, 30, 60].map((a) => `<path d="M50 6 Q56 16 50 24 Q44 16 50 6 Z" transform="rotate(${a} 50 52)"/>`).join('')}</g>`);
  }
  // 刻聖 and up: rays
  if (L >= 4) parts.push(`<g class="${L >= 5 ? 'te-rays' : ''}" fill="${hi}" opacity="${L >= 5 ? 0.55 : 0.45}">${Array.from({ length: 12 }, (_, k) => `<polygon points="50,52 48,8 52,8" transform="rotate(${k * 30 + 15} 50 52)"/>`).join('')}</g>`);
  // 刻豪 and up: laurels
  if (L >= 3) {
    // two sprays climbing the sides from the bottom
    const leaves = (side: 1 | -1) => Array.from({ length: 6 }, (_, k) => {
      const deg = 100 + k * 19, a = (deg * Math.PI) / 180;
      const xl = 50 + 41 * Math.cos(a), y = 52 + 41 * Math.sin(a);
      const x = side === 1 ? xl : 100 - xl;
      return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="3" ry="7.5" transform="rotate(${side * deg} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }).join('');
    parts.push(`<g fill="${mid}" stroke="${lo}" stroke-width=".8">${leaves(1)}${leaves(-1)}</g>`);
  }
  // the hexagon: a frame from 刻士, bevelled with rivets from 刻匠
  if (L >= 1) parts.push(`<polygon points="${hex(L >= 2 ? 36 : 33)}" fill="url(#${g}f)" stroke="${lo}" stroke-width="1.5"/>`);
  if (L >= 2) parts.push(`<polygon points="${hex(33)}" fill="none" stroke="${hi}" stroke-width="1" opacity=".8"/><g fill="${hi}" stroke="${lo}" stroke-width=".8">${hex(31).split(' ').map((p) => { const [x, y] = p.split(','); return `<circle cx="${x}" cy="${y}" r="2"/>`; }).join('')}</g>`);
  parts.push(`<polygon points="${hex(L >= 1 ? 26 : 30)}" fill="url(#${g}c)" stroke="${L >= 1 ? lo : mid}" stroke-width="${L >= 1 ? 1.5 : 2.5}"/>`);
  if (L >= 1) parts.push(`<polygon points="${hex(22)}" fill="none" stroke="${hi}" stroke-width=".9" opacity=".7"/>`);
  // the centre: a dot, then clock hands, then a cog behind them
  if (L >= 2) parts.push(`<circle cx="50" cy="52" r="11" fill="none" stroke="${lo}" stroke-width="3.5" stroke-dasharray="2.6 2.2" opacity=".75"/><circle cx="50" cy="52" r="8" fill="none" stroke="${hi}" stroke-width="1" opacity=".7"/>`);
  if (L >= 1) parts.push(`<g stroke="${L >= 4 ? lo : hi}" stroke-width="2.6" stroke-linecap="round"><path d="M50 52 V40"/><path d="M50 52 L58 57"/></g><circle cx="50" cy="52" r="2.6" fill="${L >= 4 ? lo : hi}"/>`);
  else parts.push(`<circle cx="50" cy="52" r="5" fill="${hi}" opacity=".85"/>`);
  // 刻豪 and up: a gleam across the face
  if (L >= 3) parts.push(`<g clip-path="url(#${g}k)"><rect class="te-gleam" x="-40" y="0" width="16" height="110" fill="#fff" opacity=".55" transform="rotate(20 50 52)"/></g>`);
  // 刻聖 and up: a crown, with gems for 刻神
  if (L >= 4) parts.push(`<path d="M36 14 L40 4 L45 11 L50 1 L55 11 L60 4 L64 14 Z" fill="url(#${g}f)" stroke="${lo}" stroke-width="1"/><rect x="36" y="13" width="28" height="4" rx="1" fill="${mid}" stroke="${lo}" stroke-width=".8"/>${L >= 5 ? `<circle cx="50" cy="6" r="2" fill="#fff4c0"/><circle cx="43" cy="11" r="1.4" fill="#ffd27a"/><circle cx="57" cy="11" r="1.4" fill="#ffd27a"/>` : ''}`);
  // 刻神: a star below
  if (L >= 5) parts.push(`<path d="M50 84 L53 91 L60 92 L55 97 L56 100 L50 97 L44 100 L45 97 L40 92 L47 91 Z" fill="${hi}" stroke="${lo}" stroke-width=".8"/>`);
  return `<svg viewBox="0 0 100 104" aria-hidden="true">${defs}${parts.join('')}</svg>`;
}
/** NEW tag (skewed, brass) for things the player has not looked at yet. */
export const newTag = (cls = '') => h('span', { class: `new-tag ${cls}` }, 'NEW');
/** Red count bubble. */
export const countBadge = (n: number) => (n > 0 ? h('b', { class: 'count-badge' }, String(Math.min(n, 99))) : null);

/** A pressable that also does something on a long press (touch) or right click. The tap that ends a long press is swallowed. */
export function pressable<T extends HTMLElement>(el: T, tap: () => void, long: () => void): T {
  let timer = 0, longed = false, sx = 0, sy = 0;
  const stop = () => clearTimeout(timer);
  el.addEventListener('touchstart', (e) => { longed = false; stop(); sx = e.touches[0].clientX; sy = e.touches[0].clientY; timer = window.setTimeout(() => { longed = true; try { navigator.vibrate?.(12); } catch { /* not allowed */ } long(); }, 450); }, { passive: true });
  el.addEventListener('touchmove', (e) => { if (Math.hypot(e.touches[0].clientX - sx, e.touches[0].clientY - sy) > 10) stop(); }, { passive: true });
  el.addEventListener('touchend', (e) => { stop(); if (longed) e.preventDefault(); });
  el.addEventListener('touchcancel', stop);
  el.addEventListener('click', () => { if (longed) { longed = false; return; } audio.unlock(); tap(); });
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!longed) long(); });
  return el;
}

/** Counts a number up from 0 (or `from`) so a gain registers. */
export function countUp(el: HTMLElement, to: number, opts: { from?: number; ms?: number; prefix?: string; done?: () => void } = {}) {
  const from = opts.from ?? 0, ms = opts.ms ?? 900, t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    el.textContent = `${opts.prefix ?? ''}${Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))).toLocaleString('ja-JP')}`;
    if (k < 1 && el.isConnected) requestAnimationFrame(step); else opts.done?.();
  };
  requestAnimationFrame(step);
}

/** Display name of a card id ('' for unknown ids). */
export const cardName = (id: string) => { try { return cardDef(id).name; } catch { return ''; } };
