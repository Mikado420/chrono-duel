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

/** Slanted label of a 称号, in its colour. */
export function ribbon(titleId: string | undefined, cls = '') {
  const t = titleById(titleId);
  if (!t) return null;
  return h('span', { class: `ribbon tone-${t.tone} ${cls}` }, t.name);
}
/** Hexagonal badge in a tier's colour, with or without its name. */
export function tierBadge(t: Tier, size: 'sm' | 'lg' = 'sm') {
  return h('span', { class: `tier-badge ${size}`, style: `--tier:${t.color}` }, h('i', {}), h('b', {}, t.name));
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
