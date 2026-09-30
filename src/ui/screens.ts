import { CARDS, CARD_LIST, RARITY_NAMES, SET_NAMES, cardDef, keywordsOf, KEYWORD_HELP, setOf, type CardSet } from '../core/cards';
import { maxCopies, PRESET_DECKS, validateDeck, type DeckDef } from '../core/decks';
import { NET, cleanName, normalizeCode } from '../core/net';
import { RULES } from '../core/rules';
import { inviteLink } from '../net/config';
import type { OnlineFlow } from '../net/flow';
import { audio } from '../render/audio';
import type { BattleResult } from '../render/battle';
import { cardFace, packArt } from '../render/cardArt';
import { CRAFT_COST, DAILY_BONUS, DAILY_MATCH_CAP, DUPE_SHARDS, LAST_SLOT, MATCH_REWARD, MIN_ACTIONS, PACKS, PITY, canOpen, craft, craftBlock, craftable, localDate, ownedCount, setProgress, type Reward } from '../meta/economy';
import {
  DAILY_ALL_BONUS, LOGIN_CALENDAR, NEWS, beginnerView, track, checkLogin, claimMission, claimPresents, claimable, dailyView, prizeText, rankOf, unreadNews,
  type MissionView, type News, type Prize,
} from '../meta/progress';
import { VERSION } from '../version';
import { pwa } from '../pwa';
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

const packImgCache = new Map<string, string>();
function packImg(name: string, sub: string): string {
  let u = packImgCache.get(name);
  if (!u) { u = packArt(name, sub).toDataURL('image/webp', 0.92); packImgCache.set(name, u); }
  return u;
}
/** Coin and ticket counter shown at the top of menus. */
function purse() {
  const w = store.wallet;
  return h('div', { class: 'purse' },
    h('span', { class: 'coin', 'aria-label': `コイン ${w.coins}` }, h('i', {}), String(w.coins)),
    w.tickets ? h('span', { class: 'ticket', 'aria-label': `パックチケット ${w.tickets}枚` }, h('i', {}), `×${w.tickets}`) : null,
    w.shards ? h('span', { class: 'shard', 'aria-label': `欠片 ${w.shards}` }, h('i', {}), String(w.shards)) : null);
}
/** 欠片 balance and a "create" button for one card. `done` runs after a card is created. */
function craftBox(id: string, done: () => void) {
  if (!craftable(id)) return null;
  const w = store.wallet;
  const cost = CRAFT_COST[cardDef(id).rarity];
  const block = craftBlock(w, id);
  return h('div', { class: 'craft' },
    h('div', { class: 'craft-info' }, h('span', { class: 'shard-ic' }), h('span', {}, `所持 ${w.shards}`), h('span', { class: 'sep' }, '／'), h('span', {}, `作成に ${cost}`)),
    h('button', { class: `btn small${block ? '' : ' primary'}`, disabled: !!block, onclick: () => { if (craft(store.wallet, id)) { store.saveWallet(); audio.play('rareR'); done(); } } }, block ?? '欠片で作成'));
}
type Tab = 'home' | 'battle' | 'deck' | 'shop' | 'menu';
export interface XpGain { exp: number; before: number; after: number }
/** Collection progress over every collectible card. */
function setProgressAll() {
  const kinds = CARD_LIST.filter((c) => ownedCount(store.wallet, c.id) > 0).length;
  return { kinds, total: CARD_LIST.length, pct: Math.round((kinds / CARD_LIST.length) * 100) };
}
const svg = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
/** Line icons for the tab bar and home shortcuts. */
const ICON = {
  home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  battle: svg('<path d="M4 4l9 9M20 4l-9 9"/><path d="M4 4h4M4 4v4M20 4h-4M20 4v4"/><path d="M9 15l-4 4M15 15l4 4"/><path d="M7 13l4 4M17 13l-4 4"/>'),
  deck: svg('<rect x="7" y="3" width="12" height="16" rx="2"/><path d="M5 6v13a2 2 0 0 0 2 2h9"/>'),
  shop: svg('<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>'),
  menu: svg('<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>'),
  news: svg('<path d="M4 10v4l11 5V5z"/><path d="M15 9a3 3 0 0 1 0 6"/><path d="M7 14l1 5"/>'),
  mission: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8l1.5 1.5L13 7M9 13l1.5 1.5L13 12"/><path d="M15 8h1M15 13h1"/>'),
  gift: svg('<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11"/><path d="M12 9c-2-4-6-4-6-1s6 1 6 1c2-4 6-4 6-1s-6 1-6 1"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'),
  book: svg('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M9 7h6"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7"/><path d="M12 17h.01"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  door: svg('<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>'),
  wiki: svg('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'),
};
/** Opens the strategy wiki (built as a second page at ./wiki/) in a new tab. */
const openWiki = () => window.open('./wiki/', '_blank', 'noopener');
const imgCache = new Map<string, string>();
function cardImg(id: string): string {
  let u = imgCache.get(id);
  if (!u) { u = cardFace(id).toDataURL('image/webp', 0.9); imgCache.set(id, u); }
  return u;
}

export interface ScreenHost {
  root: HTMLElement;
  openPack(id: string): void;
  startBattle(deck: DeckDef, ai: DeckDef, level: 'normal' | 'hard'): void;
  applySettings(): void;
  flow(): OnlineFlow;
}

export class Screens {
  constructor(private host: ScreenHost) {}
  private cleanup: (() => void) | null = null;
  private mount(el: HTMLElement) {
    this.cleanup?.(); this.cleanup = null;
    this.host.root.replaceChildren(el);
    return el;
  }
  /** A screen that redraws itself whenever `subscribe` fires (lobby status, rematch votes). */
  private live(build: () => HTMLElement, subscribe: (fn: () => void) => () => void) {
    this.mount(build());
    this.cleanup = subscribe(() => this.host.root.replaceChildren(build()));
  }
  clear() { this.cleanup?.(); this.cleanup = null; this.host.root.replaceChildren(); }

  // ---------------------------------------------------------------- title
  /** Key visual and TAP TO START. First launch asks for a player name before entering the home screen. */
  title() {
    const legends = ['dragon', 'e_verna', 'titan'];
    let gone = false;
    const start = () => {
      if (gone) return;
      gone = true;
      audio.unlock();
      audio.play('bell');
      el.classList.add('leaving');
      setTimeout(() => (store.settings.name ? this.home() : this.nameEntry(() => this.home())), 380);
    };
    const el = h('div', { class: 'screen titlekv', onclick: start, role: 'button', 'aria-label': 'タップしてスタート' },
      h('div', { class: 'kv-rings', 'aria-hidden': 'true' }, h('i', {}), h('i', {}), h('i', {})),
      h('div', { class: 'kv-cards', 'aria-hidden': 'true' }, ...legends.map((id, i) => h('img', { class: `c${i}`, src: cardImg(id), alt: '' }))),
      h('div', { class: 'logo' },
        h('span', { class: 'en' }, 'CHRONO DUEL'),
        h('h1', {}, 'クロノ・デュエル'),
        h('span', { class: 'tag' }, 'ターンはない。時間を奪い合え。'),
      ),
      h('div', { class: 'tap' }, 'TAP TO START'),
      h('div', { class: 'title-foot' },
        h('button', { class: 'link', onclick: (e: Event) => { e.stopPropagation(); this.newsModal(); } }, 'お知らせ'),
        h('span', {}, `Ver. ${VERSION}`),
        h('button', { class: 'link', onclick: (e: Event) => { e.stopPropagation(); this.settings(() => this.title()); } }, '設定')),
    );
    this.mount(el);
  }

  /** First launch: pick the name shown to friends online and on the profile. */
  nameEntry(done: () => void) {
    let name = store.settings.name;
    const input = h('input', { class: 'text', id: 'first-name', maxlength: String(NET.NAME_MAX), placeholder: 'プレイヤー名', autocomplete: 'nickname', value: name, oninput: (e: Event) => { name = (e.target as HTMLInputElement).value; ok.disabled = !name.trim(); } });
    const ok = h('button', { class: 'btn primary', disabled: !name.trim(), onclick: () => { store.settings.name = cleanName(name); store.saveSettings(); audio.play('reserve'); done(); } }, '決定');
    this.mount(h('div', { class: 'screen dim title' }, h('div', { class: 'panel modal-in', style: 'width:min(420px,100%)' },
      h('div', { class: 'step' }, 'WELCOME'),
      h('h2', {}, 'プレイヤー名を決めてください'),
      h('p', {}, `オンライン対戦で相手に表示されます（${NET.NAME_MAX}文字まで・あとで変更できます）。`),
      input, ok)));
    setTimeout(() => input.focus(), 50);
  }

  // ---------------------------------------------------------------- hub (header + bottom tabs)
  private tab: Tab = 'home';
  private hub(tab: Tab, body: HTMLElement) {
    this.tab = tab;
    const w = store.wallet, m = store.meta;
    const rk = rankOf(m.exp);
    const today = localDate();
    const missions = claimable(m, today);
    const canPack = PACKS.some((p) => canOpen(w, p));
    const go = (t: Tab) => () => { if (t === this.tab && t !== 'home') return; audio.play('select'); this.openTab(t); };
    const nav = (t: Tab, label: string, icon: string, badge = false) => h('button', { class: `tab${t === tab ? ' on' : ''}`, 'aria-current': t === tab ? 'page' : undefined, onclick: go(t) },
      h('span', { class: 'ic', html: icon }), h('span', {}, label), badge ? h('i', { class: 'badge-dot' }) : null);
    const root = h('div', { class: `hub hub-${tab}` },
      h('header', { class: 'hub-top' },
        h('button', { class: 'me', 'aria-label': 'プロフィール', onclick: () => this.profileModal() },
          h('span', { class: 'rank' }, h('small', {}, 'RANK'), String(rk.rank)),
          h('span', { class: 'who' }, h('b', {}, store.settings.name || 'プレイヤー'), h('span', { class: 'exp' }, h('i', { style: `width:${(rk.into / rk.need) * 100}%` })))),
        purse()),
      h('main', { class: 'hub-body' }, body),
      h('nav', { class: 'hub-nav', 'aria-label': 'メインメニュー' },
        nav('home', 'ホーム', ICON.home, missions > 0 || m.presents.length > 0),
        nav('battle', 'バトル', ICON.battle),
        nav('deck', 'デッキ', ICON.deck, store.wallet.fresh.length > 0),
        nav('shop', 'ショップ', ICON.shop, canPack),
        nav('menu', 'メニュー', ICON.menu, unreadNews(m) > 0)));
    this.mount(root);
    return root;
  }
  openTab(t: Tab) {
    if (t === 'home') this.home();
    else if (t === 'battle') this.battleTab();
    else if (t === 'deck') this.decks();
    else if (t === 'shop') this.shop();
    else this.menuTab();
  }

  // ---------------------------------------------------------------- home
  home() {
    const m = store.meta;
    const today = localDate();
    const loginDay = checkLogin(m, today);
    store.saveMeta();
    const fav = m.favorite && CARDS[m.favorite] ? m.favorite : 'dragon';
    const favDef = cardDef(fav);
    const missions = claimable(m, today);
    const deck = store.deckById(store.settings.lastDeck);
    const quick = deck && deck.valid ? deck : store.allDecks()[0];
    const banners = this.banners();
    let slide = 0;
    const track = h('div', { class: 'banner-track' }, ...banners);
    const dots = h('div', { class: 'banner-dots' }, ...banners.map((_, i) => h('i', { class: i === 0 ? 'on' : '' })));
    const setSlide = (i: number) => { slide = (i + banners.length) % banners.length; track.style.transform = `translateX(${-slide * 100}%)`; [...dots.children].forEach((d, k) => d.classList.toggle('on', k === slide)); };
    let sx = 0;
    const carousel = h('div', { class: 'banners', 'aria-roledescription': 'カルーセル' }, track, dots);
    carousel.addEventListener('pointerdown', (e) => { sx = e.clientX; });
    carousel.addEventListener('pointerup', (e) => { const d = e.clientX - sx; if (Math.abs(d) > 40) { setSlide(slide + (d < 0 ? 1 : -1)); e.stopPropagation(); } });
    const iconBtn = (label: string, icon: string, n: number, fn: () => void) => h('button', { class: 'side-btn', 'aria-label': `${label}${n ? `（${n}件）` : ''}`, onclick: () => { audio.play('select'); fn(); } },
      h('span', { class: 'ic', html: icon }), h('span', {}, label), n ? h('b', { class: 'count-badge' }, String(Math.min(n, 99))) : null);
    const dv = dailyView(m, today);
    const body = h('div', { class: 'home' },
      h('div', { class: 'kv' },
        h('div', { class: 'kv-rays', 'aria-hidden': 'true' }),
        h('button', { class: 'fav', 'aria-label': `看板カード ${favDef.name}`, onclick: () => this.zoomCard(fav) }, h('img', { src: cardImg(fav), alt: favDef.name })),
        h('div', { class: 'fav-name' }, h('small', {}, '看板カード'), favDef.name)),
      h('div', { class: 'side left' },
        h('button', { class: 'daily-card', onclick: () => this.missionsModal('daily') },
          h('b', {}, 'デイリーミッション'),
          h('span', { class: 'dm-sum' }, `達成 ${dv.filter((x) => x.done).length}/${dv.length}`, dv.some((x) => x.done && !x.claimed) ? h('i', { class: 'badge-dot' }) : null),
          ...dv.map((x) => h('div', { class: `dm${x.claimed ? ' claimed' : x.done ? ' done' : ''}` }, h('span', {}, x.m.text), h('span', { class: 'n' }, x.claimed ? '済' : `${x.now}/${x.m.goal}`))))),
      h('div', { class: 'side right' },
        iconBtn('お知らせ', ICON.news, unreadNews(m), () => this.newsModal()),
        iconBtn('ミッション', ICON.mission, missions, () => this.missionsModal(dv.some((x) => x.done && !x.claimed) || !beginnerView(m).some((x) => x.done && !x.claimed) ? 'daily' : 'beginner')),
        iconBtn('プレゼント', ICON.gift, m.presents.length, () => this.presentsModal())),
      carousel,
      h('div', { class: 'home-cta' },
        h('button', { class: 'battle-cta', onclick: () => { audio.play('summon'); this.clear(); this.host.startBattle(quick, PRESET_DECKS[Math.floor(Math.random() * PRESET_DECKS.length)], store.settings.level); } },
          h('span', { class: 'big' }, 'バトル開始'),
          h('small', {}, `${quick.name} ・ AI${store.settings.level === 'hard' ? '（つよい）' : '（ふつう）'}`)),
        h('button', { class: 'btn cta-sub', onclick: () => this.battleTab() }, 'モード選択')),
    );
    this.hub('home', body);
    const timer = window.setInterval(() => { if (!carousel.isConnected) { clearInterval(timer); return; } setSlide(slide + 1); }, 5000);
    if (loginDay) setTimeout(() => this.loginModal(loginDay), 350);
  }

  private banners(): HTMLElement[] {
    const pack = PACKS[0];
    const flow = this.host.flow();
    const b = (cls: string, kicker: string, title: string, sub: string, fn: () => void, art?: HTMLElement) =>
      h('button', { class: `banner ${cls}`, onclick: () => { audio.play('select'); fn(); } }, h('div', { class: 'txt' }, h('small', {}, kicker), h('b', {}, title), h('span', {}, sub)), art ?? null);
    return [
      b('b-pack', '第1弾 配信中', `「${pack.name}」`, '新カード22種・伝説は15パックで確定', () => this.shop(), h('img', { src: packImg(pack.name, pack.sub), alt: '' })),
      b('b-online', 'フレンド対戦', '友達と時間を奪い合え', flow.available ? 'あいことば・招待リンクですぐ対戦' : '準備中', () => this.onlineMenu(), h('img', { src: cardImg('e_atra'), alt: '' })),
      b('b-mission', 'デイリーミッション', '毎日コインを集めよう', `全達成でさらに${DAILY_ALL_BONUS.coins}コイン`, () => this.missionsModal('daily'), h('img', { src: cardImg('e_bellkeeper'), alt: '' })),
    ];
  }

  // ---------------------------------------------------------------- battle tab
  battleTab() {
    const flow = this.host.flow();
    const r = store.record, o = store.onlineRecord;
    const mode = (cls: string, title: string, sub: string, art: string, fn: (() => void) | null, note?: string) =>
      h('button', { class: `mode ${cls}`, disabled: !fn, onclick: () => { if (!fn) return; audio.play('select'); fn(); } },
        h('img', { src: cardImg(art), alt: '' }), h('div', { class: 'txt' }, h('b', {}, title), h('span', {}, sub), note ? h('small', {}, note) : null));
    this.hub('battle', h('div', { class: 'tab-page' },
      h('h2', { class: 'page-title' }, 'バトル'),
      mode('m-ai', 'AI対戦', '4種類のAIデッキと練習・腕試し', 'gear', () => this.setup(), `戦績 ${r.win}勝 ${r.lose}敗 ・ 勝利でコイン${MATCH_REWARD['ai-normal'][0]}〜${MATCH_REWARD['ai-hard'][0]}`),
      mode('m-online', 'フレンド対戦', 'あいことば・招待リンクで友達とオンライン対戦', 'e_atra', flow.available ? () => this.onlineMenu() : null, flow.available ? `戦績 ${o.win}勝 ${o.lose}敗 ・ 勝利でコイン${MATCH_REWARD['online'][0]}` : '準備中'),
      mode('m-guide', '遊び方', 'ルールと操作をおさらい', 'oracle', () => this.rules(() => this.battleTab())),
    ));
  }

  // ---------------------------------------------------------------- menu tab
  menuTab() {
    const m = store.meta;
    const tile = (label: string, icon: string, fn: () => void, badge = 0) => h('button', { class: 'menu-tile', onclick: () => { audio.play('select'); fn(); } },
      h('span', { class: 'ic', html: icon }), h('span', {}, label), badge ? h('b', { class: 'count-badge' }, String(badge)) : null);
    this.hub('menu', h('div', { class: 'tab-page' },
      h('h2', { class: 'page-title' }, 'メニュー'),
      h('div', { class: 'menu-grid' },
        tile('プロフィール', ICON.user, () => this.profileModal()),
        tile('カード図鑑', ICON.book, () => this.collection()),
        tile('ミッション', ICON.mission, () => this.missionsModal('daily'), claimable(m, localDate())),
        tile('プレゼント', ICON.gift, () => this.presentsModal(), m.presents.length),
        tile('お知らせ', ICON.news, () => this.newsModal(), unreadNews(m)),
        tile('遊び方', ICON.help, () => this.rules(() => this.menuTab())),
        tile('攻略wiki', ICON.wiki, openWiki),
        tile('設定', ICON.gear, () => this.settings(() => this.menuTab())),
        tile('タイトルへ', ICON.door, () => this.title())),
      h('div', { class: 'ver' }, `クロノ・デュエル Ver. ${VERSION}`)));
  }

  // ---------------------------------------------------------------- modals
  private modal(title: string, body: (HTMLElement | null)[], opts: { cls?: string; onClose?: () => void; foot?: HTMLElement[] } = {}) {
    const close = () => { wrap.classList.add('out'); setTimeout(() => { wrap.remove(); opts.onClose?.(); }, 160); };
    const wrap = h('div', { class: `modal-wrap ${opts.cls ?? ''}`, onclick: (e: Event) => { if (e.target === wrap) close(); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-label': title },
        h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'x', 'aria-label': '閉じる', onclick: close }, '×')),
        h('div', { class: 'modal-body' }, ...body),
        opts.foot ? h('div', { class: 'modal-foot' }, ...opts.foot) : null));
    this.host.root.append(wrap);
    return { wrap, close };
  }
  private refreshHub() { this.openTab(this.tab); }
  private grant(p: Prize, from: string) {
    if (p.coins) store.wallet.coins += p.coins;
    if (p.tickets) store.wallet.tickets += p.tickets;
    store.saveWallet(); store.saveMeta();
    audio.play('coin');
    this.toast(`${from}：${prizeText(p)}を受け取りました`);
  }
  private toast(text: string) {
    const t = h('div', { class: 'ui-toast', role: 'status' }, text);
    this.host.root.append(t);
    setTimeout(() => t.classList.add('out'), 1800);
    setTimeout(() => t.remove(), 2200);
  }

  loginModal(day: number) {
    const cells = LOGIN_CALENDAR.map((p, i) => h('div', { class: `lb${i + 1 < day ? ' got' : i + 1 === day ? ' today' : ''}` },
      h('small', {}, `${i + 1}日目`),
      h('span', { class: p.tickets ? 'ic-ticket' : 'ic-coin' }),
      h('b', {}, p.tickets ? `×${p.tickets}` : String(p.coins)),
      i + 1 <= day ? h('i', { class: 'stamp' }, '済') : null));
    audio.play('reserve');
    const { close } = this.modal('ログインボーナス', [
      h('p', { class: 'center' }, `ログイン${store.meta.loginDays}日目！　${prizeText(LOGIN_CALENDAR[day - 1])}をプレゼントボックスに送りました。`),
      h('div', { class: 'lb-grid' }, ...cells),
      h('p', { class: 'small center' }, '7日ごとにくり返します。毎日ログインしてパックチケットを手に入れよう。'),
    ], { cls: 'login', onClose: () => this.refreshHub(), foot: [h('button', { class: 'btn primary', onclick: () => { close(); setTimeout(() => this.presentsModal(), 200); } }, 'プレゼントを受け取る'), h('button', { class: 'btn', onclick: () => close() }, '閉じる')] });
  }

  missionsModal(tab: 'daily' | 'beginner') {
    const m = store.meta;
    const today = localDate();
    let cur = tab;
    let ref: { wrap: HTMLElement; close: () => void };
    const row = (v: MissionView) => h('div', { class: `ms${v.claimed ? ' claimed' : v.done ? ' done' : ''}` },
      h('div', { class: 'ms-main' }, h('b', {}, v.m.text), h('div', { class: 'bar' }, h('i', { style: `width:${(v.now / v.m.goal) * 100}%` })), h('small', {}, `${v.now} / ${v.m.goal}　報酬：${prizeText(v.m.prize)}`)),
      h('button', { class: `btn small${v.done && !v.claimed ? ' primary' : ''}`, disabled: !v.done || v.claimed, onclick: () => { const p = claimMission(m, v.m.id, today); if (p) { this.grant(p, 'ミッション'); render(); } } }, v.claimed ? '受取済' : v.done ? '受け取る' : '挑戦中'));
    const render = () => {
      const dv = dailyView(m, today);
      const allDone = dv.every((x) => x.claimed), allGot = m.dailyClaimed.includes('all');
      const list = cur === 'daily'
        ? [...dv.map(row), h('div', { class: `ms all${allGot ? ' claimed' : allDone ? ' done' : ''}` },
            h('div', { class: 'ms-main' }, h('b', {}, 'デイリーミッションをすべて達成'), h('small', {}, `報酬：${prizeText(DAILY_ALL_BONUS)}`)),
            h('button', { class: `btn small${allDone && !allGot ? ' primary' : ''}`, disabled: !allDone || allGot, onclick: () => { const p = claimMission(m, 'all', today); if (p) { this.grant(p, 'ミッション'); render(); } } }, allGot ? '受取済' : allDone ? '受け取る' : '挑戦中')),
          h('p', { class: 'small center' }, '毎日0時（端末の時刻）に新しいミッションに入れ替わります。')]
        : beginnerView(m).map(row);
      const body = ref.wrap.querySelector('.modal-body')!;
      body.scrollTop = 0;
      body.replaceChildren(
        h('div', { class: 'seg full sticky' },
          h('button', { 'aria-pressed': String(cur === 'daily'), onclick: () => { cur = 'daily'; render(); } }, 'デイリー'),
          h('button', { 'aria-pressed': String(cur === 'beginner'), onclick: () => { cur = 'beginner'; render(); } }, `初心者${beginnerView(m).some((x) => x.done && !x.claimed) ? ' ●' : ''}`)),
        ...list);
    };
    ref = this.modal('ミッション', [], { onClose: () => this.refreshHub() });
    render();
  }

  presentsModal() {
    const m = store.meta;
    let ref: { wrap: HTMLElement; close: () => void };
    const render = () => {
      const body = ref.wrap.querySelector('.modal-body')!;
      const foot = ref.wrap.querySelector('.modal-foot button') as HTMLButtonElement | null;
      if (foot) foot.disabled = !m.presents.length;
      body.replaceChildren(...(m.presents.length ? m.presents.map((p) => h('div', { class: 'pr' },
        h('span', { class: p.prize.tickets ? 'ic-ticket' : 'ic-coin' }),
        h('div', { class: 'pr-main' }, h('b', {}, prizeText(p.prize)), h('small', {}, `${p.from}：${p.text}（${p.at}）`)),
        h('button', { class: 'btn small primary', onclick: () => { this.grant(claimPresents(m, [p.id]), 'プレゼント'); render(); } }, '受け取る'))) : [h('p', { class: 'empty' }, '受け取れるプレゼントはありません')]));
    };
    ref = this.modal('プレゼントボックス', [], {
      onClose: () => this.refreshHub(),
      foot: [h('button', { class: 'btn primary', onclick: () => { if (!m.presents.length) return; this.grant(claimPresents(m), 'プレゼント'); render(); } }, '一括受け取り')],
    });
    render();
  }

  newsModal() {
    const m = store.meta;
    let ref: { wrap: HTMLElement; close: () => void };
    const list = () => ref.wrap.querySelector('.modal-body')!.replaceChildren(...NEWS.map((n) => h('button', { class: `news${m.newsRead.includes(n.id) ? '' : ' unread'}`, onclick: () => detail(n) },
      h('span', { class: `tag t-${n.tag}` }, n.tag), h('b', {}, n.title), h('small', {}, n.date))));
    const detail = (n: News) => {
      if (!m.newsRead.includes(n.id)) { m.newsRead.push(n.id); store.saveMeta(); }
      ref.wrap.querySelector('.modal-body')!.replaceChildren(
        h('button', { class: 'btn small', onclick: list }, '← 一覧へ'),
        h('div', { class: 'news-detail' }, h('span', { class: `tag t-${n.tag}` }, n.tag), h('h3', {}, n.title), h('small', {}, n.date), h('p', {}, n.body)));
    };
    ref = this.modal('お知らせ', [], { onClose: () => { if (this.host.root.querySelector('.hub')) this.refreshHub(); } });
    list();
  }

  profileModal() {
    const m = store.meta;
    const rk = rankOf(m.exp);
    const r = store.record, o = store.onlineRecord;
    const wins = r.win + o.win, games = r.win + r.lose + r.draw + o.win + o.lose + o.draw;
    const base = setProgressAll();
    let name = store.settings.name;
    const owned = CARD_LIST.filter((c) => ownedCount(store.wallet, c.id) > 0);
    const favGrid = h('div', { class: 'fav-grid' }, ...owned.sort((a, b) => 'LERC'.indexOf(a.rarity) - 'LERC'.indexOf(b.rarity)).map((c) => h('button', { class: `tile${(m.favorite || 'dragon') === c.id ? ' picked' : ''}`, 'aria-label': `${c.name}を看板カードにする`, onclick: (e: Event) => {
      m.favorite = c.id; store.saveMeta(); audio.play('select');
      favGrid.querySelectorAll('.picked').forEach((x) => x.classList.remove('picked'));
      (e.currentTarget as HTMLElement).classList.add('picked');
    } }, h('img', { src: cardImg(c.id), alt: c.name, loading: 'lazy' }))));
    this.modal('プロフィール', [
      h('div', { class: 'prof' },
        h('div', { class: 'rank-big' }, h('small', {}, 'RANK'), String(rk.rank)),
        h('div', {}, h('div', { class: 'exp wide' }, h('i', { style: `width:${(rk.into / rk.need) * 100}%` })), h('small', {}, `次のランクまで ${rk.need - rk.into} EXP`))),
      h('label', { class: 'line' }, 'プレイヤー名', h('input', { class: 'text', maxlength: String(NET.NAME_MAX), value: name, oninput: (e: Event) => { name = (e.target as HTMLInputElement).value; }, onchange: () => { store.settings.name = cleanName(name); store.saveSettings(); } })),
      h('div', { class: 'stat-grid' },
        h('div', {}, h('b', {}, String(games)), h('span', {}, '対戦数')),
        h('div', {}, h('b', {}, games ? `${Math.round((wins / games) * 100)}%` : '—'), h('span', {}, '勝率')),
        h('div', {}, h('b', {}, `${o.win}-${o.lose}`), h('span', {}, 'オンライン')),
        h('div', {}, h('b', {}, `${base.pct}%`), h('span', {}, 'カード収集'))),
      h('h3', {}, '看板カード（ホームに表示）'),
      favGrid,
    ], { onClose: () => this.refreshHub() });
  }

  zoomCard(id: string, after?: () => void) {
    const d = cardDef(id);
    let ref: { wrap: HTMLElement; close: () => void };
    const body = () => [
      h('img', { class: 'zoom-img', src: cardImg(id), alt: d.name }),
      craftable(id) ? h('p', { class: 'kw center' }, `${RARITY_NAMES[d.rarity]} ・ 所持 ${ownedCount(store.wallet, id)} / ${maxCopies(id)}枚`) : null,
      craftBox(id, () => { this.toast(`「${d.name}」を作成しました`); ref.wrap.querySelector('.modal-body')!.replaceChildren(...(body().filter(Boolean) as HTMLElement[])); }),
      ...keywordsOf(d).filter((k) => KEYWORD_HELP[k]).map((k) => h('p', { class: 'kw' }, h('b', {}, k), `：${KEYWORD_HELP[k]}`)),
    ];
    ref = this.modal(d.name, body(), { cls: 'card-zoom', onClose: after });
  }

  // ---------------------------------------------------------------- collection
  collection() {
    let setF: 'all' | CardSet = 'all';
    let rar: 'all' | 'C' | 'R' | 'E' | 'L' = 'all';
    const render = () => {
      const w = store.wallet;
      const list = CARD_LIST.filter((c) => (setF === 'all' || setOf(c) === setF) && (rar === 'all' || c.rarity === rar)).sort((a, b) => (setOf(a) === setOf(b) ? 0 : setOf(a) === 'base' ? -1 : 1) || a.cost - b.cost);
      const seg = <T extends string>(cur: T, set: (v: T) => void, opts: [T, string][]) => h('div', { class: 'seg fit' }, ...opts.map(([v, t]) => h('button', { 'aria-pressed': String(cur === v), onclick: () => { set(v); render(); } }, t)));
      const all = setProgressAll();
      const echo = setProgress(w, 'echo');
      this.mount(h('div', { class: 'screen dim' }, h('div', { class: 'panel' },
        h('div', { class: 'head' }, h('h2', {}, 'カード図鑑'), h('button', { class: 'btn small', onclick: () => this.menuTab() }, '戻る')),
        h('div', { class: 'progress' }, h('i', { style: `width:${all.pct}%` })),
        h('div', { class: 'small' }, `全体 ${all.kinds}/${all.total}種（${all.pct}%）・ 第1弾 ${echo.kinds}/${echo.kindsTotal}種`),
        seg(setF, (v) => (setF = v), [['all', '全セット'], ['base', '基本'], ['echo', '第1弾']]),
        seg(rar, (v) => (rar = v), [['all', 'すべて'], ['C', '通常'], ['R', '希少'], ['E', '秘宝'], ['L', '伝説']]),
        h('div', { class: 'grid' }, ...list.map((c) => {
          const o = ownedCount(w, c.id);
          return h('button', { class: `tile${o ? '' : ' locked'}`, 'aria-label': `${c.name}${o ? '' : '（未所持）'}`, onclick: () => this.zoomCard(c.id, render) },
            h('img', { src: cardImg(c.id), alt: c.name, loading: 'lazy' }), setOf(c) !== 'base' ? h('span', { class: 'own' }, o ? `所持 ${o}` : '未所持') : null);
        })))));
    };
    render();
  }

  // ---------------------------------------------------------------- match setup
  setup() {
    const decks = store.allDecks();
    let mine = decks.find((d) => d.id === store.settings.lastDeck && d.valid) ?? decks[0];
    let ai: DeckDef | 'random' = 'random';
    let level = store.settings.level;
    const render = () => {
      const deckOpts = decks.map((d) => h('button', {
        class: 'opt', 'aria-pressed': String(d.id === mine.id), disabled: !d.valid,
        onclick: () => { mine = d; audio.play('select'); render(); },
      }, h('div', {}, h('div', { class: 'nm' }, d.name), h('div', { class: 'ds' }, d.blurb ?? `${d.cards.length}枚・自作デッキ`)), !d.valid ? h('span', { class: 'badge' }, d.missing.length ? '未所持あり' : '未完成') : null));
      const aiOpts = [h('button', { class: 'opt', 'aria-pressed': String(ai === 'random'), onclick: () => { ai = 'random'; render(); } }, h('div', {}, h('div', { class: 'nm' }, 'おまかせ'), h('div', { class: 'ds' }, '4種のデッキから選ばれます'))),
        ...PRESET_DECKS.map((d) => h('button', { class: 'opt', 'aria-pressed': String(ai !== 'random' && ai.id === d.id), onclick: () => { ai = d; render(); } }, h('div', {}, h('div', { class: 'nm' }, d.name), h('div', { class: 'ds' }, d.blurb ?? ''))))];
      const lv = (v: 'normal' | 'hard', t: string) => h('button', { 'aria-pressed': String(level === v), onclick: () => { level = v; render(); } }, t);
      this.mount(h('div', { class: 'screen dim' },
        h('div', { class: 'panel' },
          h('div', { class: 'head' }, h('h2', {}, '対戦の準備'), h('button', { class: 'btn small', onclick: () => this.battleTab() }, '戻る')),
          h('h3', {}, 'あなたのデッキ'), h('div', { class: 'opt-list' }, ...deckOpts),
          h('h3', {}, '相手（AI）のデッキ'), h('div', { class: 'opt-list' }, ...aiOpts),
          h('h3', {}, 'AIの強さ'), h('div', { class: 'seg' }, lv('normal', 'ふつう'), lv('hard', 'つよい')),
          h('button', {
            class: 'btn primary', onclick: () => {
              store.settings.lastDeck = mine.id; store.settings.level = level; store.saveSettings();
              const aiDeck = ai === 'random' ? PRESET_DECKS[Math.floor(Math.random() * PRESET_DECKS.length)] : ai;
              audio.play('summon');
              this.clear();
              this.host.startBattle(mine, aiDeck, level);
            },
          }, '対戦開始'),
        )));
    };
    render();
  }

  // ---------------------------------------------------------------- deck list + editor
  decks() {
    const list = store.allDecks();
    this.hub('deck', h('div', { class: 'tab-page' },
      h('div', { class: 'panel' },
        h('div', { class: 'head' }, h('h2', {}, 'デッキ')),
        h('p', {}, `デッキは${RULES.DECK_SIZE}枚。同じカードは${RULES.MAX_COPIES}枚まで、伝説カードは${RULES.MAX_LEGEND_COPIES}枚までです。基本デッキは複製してから編集できます。`),
        h('div', { class: 'opt-list' }, ...list.map((d) => h('div', { class: 'opt' },
          h('div', { style: 'min-width:0' }, h('div', { class: 'nm' }, d.name), h('div', { class: 'ds' }, d.preset ? '基本デッキ' : `自作デッキ・${d.cards.length}枚`)),
          h('span', { class: 'spacer' }),
          !d.valid ? h('span', { class: 'badge' }, d.missing.length ? '未所持あり' : '未完成') : null,
          h('button', { class: 'btn small', onclick: () => this.editor(d.preset ? { id: `c${Date.now()}`, name: `${d.name}（改）`, cards: d.cards.slice() } : { id: d.id, name: d.name, cards: d.cards.slice() }) }, d.preset ? '複製して編集' : '編集'),
        ))),
        h('button', { class: 'btn primary', onclick: () => this.editor({ id: `c${Date.now()}`, name: '新しいデッキ', cards: [] }) }, '新しいデッキを作る'),
      )));
  }

  editor(deck: DeckDef) {
    const cards = deck.cards.slice();
    let name = deck.name;
    let filter: 'all' | 'unit' | 'spell' = 'all';
    let setF: 'all' | CardSet = 'all';
    const fresh = new Set(store.wallet.fresh);
    if (fresh.size) { store.wallet.fresh = []; store.saveWallet(); }
    const own = (id: string) => ownedCount(store.wallet, id);
    let tab: 'pool' | 'deck' = 'pool';
    let confirmDelete = false;
    const exists = store.customDecks.some((d) => d.id === deck.id);
    const count = (id: string) => cards.filter((c) => c === id).length;
    let flash = '';
    const add = (id: string) => {
      if (count(id) >= own(id)) { audio.play('deny'); flash = own(id) === 0 ? `「${cardDef(id).name}」は持っていません。ショップのパックで手に入ります` : `「${cardDef(id).name}」は${own(id)}枚しか持っていません`; render(); return; }
      if (count(id) >= maxCopies(id) || cards.length >= RULES.DECK_SIZE) { audio.play('deny'); return; }
      flash = ''; cards.push(id); audio.play('draw'); render();
    };
    const remove = (id: string) => { const i = cards.lastIndexOf(id); if (i >= 0) { cards.splice(i, 1); audio.play('select'); render(); } };
    const zoom = (id: string) => {
      const d = cardDef(id);
      const z = h('div', { class: 'zoom', onclick: (e: Event) => { if (e.target === z) z.remove(); } },
        h('div', { class: 'box' },
          h('img', { src: cardImg(id), alt: d.name }),
          ...keywordsOf(d).filter((k) => KEYWORD_HELP[k]).map((k) => h('p', { class: 'kw' }, h('b', {}, k), `：${KEYWORD_HELP[k]}`)),
          setOf(d) !== 'base' ? h('p', { class: 'kw' }, `${SET_NAMES[setOf(d)]} ・ ${RARITY_NAMES[d.rarity]} ・ 所持 ${own(id)}枚`) : null,
          craftBox(id, () => { z.remove(); flash = `「${d.name}」を欠片で作成しました`; render(); zoom(id); }),
          h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: () => { remove(id); z.remove(); } }, '1枚抜く'),
            h('button', { class: 'btn primary', onclick: () => { add(id); z.remove(); } }, '1枚入れる'),
            h('button', { class: 'btn', onclick: () => z.remove() }, '閉じる'),
          )));
      this.host.root.firstElementChild?.append(z);
    };
    const render = () => {
      const v = validateDeck(cards);
      const pool = CARD_LIST.filter((c) => (filter === 'all' || c.kind === filter) && (setF === 'all' || setOf(c) === setF))
        .sort((a, b) => Number(own(b.id) > 0) - Number(own(a.id) > 0) || a.cost - b.cost || a.kind.localeCompare(b.kind));
      const sbtn = (f: typeof setF, t: string) => h('button', { 'aria-pressed': String(setF === f), onclick: () => { setF = f; render(); } }, t);
      const grouped = [...new Set(cards)].map((id) => cardDef(id)).sort((a, b) => a.cost - b.cost);
      const curve = Array.from({ length: 8 }, (_, i) => cards.filter((c) => Math.min(7, cardDef(c).cost) === i + 1 || (i === 0 && cardDef(c).cost === 0)).length);
      const maxC = Math.max(1, ...curve);
      const units = cards.filter((c) => cardDef(c).kind === 'unit').length;
      const fbtn = (f: typeof filter, t: string) => h('button', { 'aria-pressed': String(filter === f), onclick: () => { filter = f; render(); } }, t);
      const tbtn = (t: typeof tab, s: string) => h('button', { 'aria-pressed': String(tab === t), onclick: () => { tab = t; render(); } }, s);
      const save = () => {
        const d: DeckDef = { id: deck.id, name: name.trim() || '名前のないデッキ', cards: cards.slice() };
        const i = store.customDecks.findIndex((x) => x.id === d.id);
        if (i >= 0) store.customDecks[i] = d; else store.customDecks.push(d);
        store.saveDecks();
        track(store.meta, 'deck', 1, localDate()); store.saveMeta();
        audio.play('reserve');
        this.decks();
      };
      const scrollY = this.host.root.firstElementChild?.scrollTop ?? 0;
      this.mount(h('div', { class: 'screen dim' },
        h('div', { class: 'editor', 'data-tab': tab },
          h('div', { class: 'tabs seg', style: 'grid-column:1/-1' }, tbtn('pool', 'カード一覧'), tbtn('deck', `デッキ ${cards.length}/${RULES.DECK_SIZE}`)),
          h('div', { class: 'panel pool' },
            h('div', { class: 'head' }, h('h2', {}, 'カード一覧'), h('button', { class: 'btn small', onclick: () => this.decks() }, '戻る')),
            h('div', { class: 'filters seg' }, fbtn('all', 'すべて'), fbtn('unit', 'ユニット'), fbtn('spell', '術')),
            h('div', { class: 'filters seg' }, sbtn('all', '全セット'), sbtn('base', '基本'), sbtn('echo', '第1弾')),
            flash ? h('div', { class: 'note warn' }, flash) : null,
            h('p', { style: 'font-size:13px;color:var(--mute)' }, 'タップで1枚追加。長押し（右クリック）で拡大表示。'),
            h('div', { class: 'grid' }, ...pool.map((c) => {
              const n = count(c.id);
              const o = own(c.id);
              const t = h('button', { class: `tile${n >= Math.min(o, maxCopies(c.id)) ? ' maxed' : ''}${o === 0 ? ' locked' : ''}`, 'aria-label': o ? `${c.name}を追加` : `${c.name}（未所持）`, onclick: () => add(c.id), oncontextmenu: (e: Event) => { e.preventDefault(); zoom(c.id); } },
                h('img', { src: cardImg(c.id), alt: c.name, loading: 'lazy' }),
                n ? h('span', { class: 'cnt' }, String(n)) : null,
                setOf(c) !== 'base' ? h('span', { class: 'own' }, o ? `所持 ${o}` : '未所持') : null,
                fresh.has(c.id) ? h('span', { class: 'new' }, 'NEW') : null);
              let timer = 0;
              t.addEventListener('touchstart', () => { timer = window.setTimeout(() => zoom(c.id), 450); }, { passive: true });
              t.addEventListener('touchend', () => clearTimeout(timer));
              t.addEventListener('touchmove', () => clearTimeout(timer), { passive: true });
              return t;
            })),
          ),
          h('div', { class: 'panel decklist' },
            h('input', { id: 'deck-name', value: name, maxlength: '20', 'aria-label': 'デッキ名', oninput: (e: Event) => { name = (e.target as HTMLInputElement).value; } }),
            h('div', { class: 'row' }, h('span', { class: `count ${v.ok ? 'ok' : 'bad'}` }, `${cards.length} / ${RULES.DECK_SIZE}`), h('span', { class: 'spacer' }), h('span', { style: 'font-size:13px;color:var(--mute)' }, `ユニット ${units}・術 ${cards.length - units}`)),
            h('div', { class: 'curve', 'aria-label': 'コスト分布' }, ...curve.map((n, i) => h('div', {}, n ? String(n) : '', h('i', { style: `height:${(n / maxC) * 100}%` }), i === 7 ? '7+' : String(i + 1)))),
            h('div', { class: 'dl-rows' }, ...grouped.map((c) => h('div', { class: 'dl-row' },
              h('span', { class: 'c' }, String(c.cost)), h('span', { class: 'n', onclick: () => zoom(c.id) }, c.name), h('span', { class: 'x' }, `×${count(c.id)}`),
              h('button', { 'aria-label': `${c.name}を1枚抜く`, onclick: () => remove(c.id) }, '−')))),
            !v.ok && cards.length ? h('div', { class: 'problems' }, ...v.problems.map((p) => h('div', {}, p))) : null,
            (() => { const miss = [...new Set(cards)].filter((c) => count(c) > own(c)); return miss.length ? h('div', { class: 'problems' }, ...miss.map((c) => h('div', {}, `「${cardDef(c).name}」が足りません（所持${own(c)}枚）`))) : null; })(),
            h('button', { class: 'btn primary', onclick: save }, '保存'),
            exists ? (confirmDelete
              ? h('div', { class: 'confirm' }, h('div', {}, 'このデッキを削除しますか？'), h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => { confirmDelete = false; render(); } }, 'やめる'), h('button', { class: 'btn small danger', onclick: () => { store.customDecks = store.customDecks.filter((d) => d.id !== deck.id); store.saveDecks(); this.decks(); } }, '削除する')))
              : h('button', { class: 'btn small', onclick: () => { confirmDelete = true; render(); } }, 'デッキを削除')) : null,
          ),
        )));
      const sc = this.host.root.firstElementChild;
      if (sc) sc.scrollTop = scrollY;
    };
    render();
  }

  // ---------------------------------------------------------------- rules
  rules(back: () => void) {
    this.mount(h('div', { class: 'screen dim' },
      h('div', { class: 'panel rules' },
        h('div', { class: 'head' }, h('h2', {}, '遊び方'), h('button', { class: 'btn small', onclick: back }, '戻る')),
        h('section', {}, h('h3', {}, 'ターンはありません'),
          h('p', { html: 'カードを使う・攻撃する、すべての行動は<span class="key">時間（刻）</span>を支払います。支払うと自分の時計の針が進み、<span class="key">時計が遅れている方が次に行動</span>します。同じ時刻なら、直前に動かなかった方が先です。' })),
        h('section', {}, h('h3', {}, '勝ち方'),
          h('ul', {}, h('li', {}, `相手の拠点の体力（${RULES.BASE_HP}）を0にすれば勝ち。`), h('li', {}, `両者の時計が${RULES.END}刻に達したら、体力が多い方の勝ち。`))),
        h('section', {}, h('h3', {}, '行動'),
          h('ul', {},
            h('li', { html: 'ユニットを召喚／術を使う：カードの<span class="key">コスト</span>分の刻' }),
            h('li', { html: `攻撃：<span class="kbd">${RULES.COST_ATTACK}</span>刻。正面の敵と戦い、正面が空なら拠点を攻撃` }),
            h('li', { html: `ドロー：<span class="kbd">${RULES.COST_DRAW}</span>刻　待機：<span class="kbd">${RULES.COST_WAIT}</span>刻` }),
            h('li', {}, `自分の時計が ${RULES.BELLS.join('・')} 刻を越えると鐘が鳴り、1枚引けます。`))),
        h('section', {}, h('h3', {}, 'ユニット'),
          h('ul', {},
            h('li', { html: '召喚した直後は1刻待たないと攻撃できません（<span class="key">速攻</span>は例外）。' }),
            h('li', { html: '攻撃すると<span class="key">間隔</span>の分だけ、次の攻撃まで待ちます。右上の丸が緑になれば攻撃できます。' }),
            h('li', { html: '<span class="key">挑発</span>：隣の空いたレーンへの攻撃も受け止める。<span class="key">貫通</span>：倒した相手の体力を超えた分が拠点に届く。' }))),
        h('section', {}, h('h3', {}, '未来予約'),
          h('p', { html: `術カードは、時計の上に重ねて離すと<span class="key">未来の時刻に予約</span>できます（各${RULES.MAX_RESV}枚まで）。支払いは今すぐですが、発動するときは<span class="key">効果が強化</span>されます。両者の時計がその時刻に達した瞬間に発動します。相手には時刻しか見えません。` })),
        h('section', {}, h('h3', {}, '第1弾「残響の刻」のキーワード'),
          h('ul', {}, ...['残響', '共鳴', '急襲', '充填'].map((k) => h('li', { html: `<span class="key">${k}</span>：${KEYWORD_HELP[k]}` }))),
          h('p', { html: `残響は時計に丸いピンで表示され、相手にも中身が見えます（同時に${RULES.MAX_ECHO}つまで）。「破約の刃」や「刻壊し」で消すこともできます。` })),
        h('section', {}, h('h3', {}, 'コインとパック'),
          h('p', {}, '対戦するとコインがもらえ、ショップで第1弾のパックと交換できます。基本カードは最初から全て使えます。コインはゲーム内で遊んで得るもので、現金では買えません。')),
        h('section', {}, h('h3', {}, '終焉の刻'),
          h('p', { html: `両者の時計が${RULES.DOOM_AT}刻に達すると、拠点へのダメージが+1されます。その後${RULES.DOOM_STEP}刻ごとにさらに+1。終盤ほど一撃が重くなります。` })),
        h('section', {}, h('h3', {}, '操作'),
          h('ul', {},
            h('li', {}, '手札のカードをドラッグ：ユニットはレーンへ、術は盤面で離すと使用、時計に重ねると予約。'),
            h('li', {}, 'カードをタップすると詳細と操作ボタンが出ます。'),
            h('li', {}, '攻撃できるユニットをタップして矢印を確認、もう一度タップ（または上へドラッグ）で攻撃。'),
            h('li', {}, 'カードを選ぶと、時計に「使った後の針」が薄く表示されます。'))),
        h('section', {}, h('h3', {}, 'もっと詳しく'),
          h('p', {}, '全カードの効果と攻略メモ、デッキの相性表、立ち回りのコツは攻略wikiにまとめています。'),
          h('button', { class: 'btn small', onclick: openWiki }, '攻略wikiを開く')),
      )));
  }

  // ---------------------------------------------------------------- settings
  settings(back: () => void) {
    const s = store.settings;
    const commit = () => { store.saveSettings(); this.host.applySettings(); };
    const pwaBlock = () => {
      if (pwa.installed) return h('div', { class: 'line' }, h('b', {}, 'アプリ'), h('span', { style: 'color:var(--you)' }, 'ホーム画面から起動しています'));
      if (pwa.canPrompt) return h('div', { class: 'line' }, h('b', {}, 'アプリとして追加'), h('p', {}, 'ホーム画面に追加すると、全画面で遊べてオフラインでも起動します。'), h('button', { class: 'btn small primary', onclick: async () => { await pwa.install(); this.settings(back); } }, 'ホーム画面に追加'));
      if (pwa.isIOS) return h('div', { class: 'line' }, h('b', {}, 'アプリとして追加'), h('p', {}, 'Safariの共有ボタン → 「ホーム画面に追加」で、全画面のアプリとして遊べます。'));
      return h('div', { class: 'line' }, h('b', {}, 'アプリとして追加'), h('p', {}, 'ブラウザのメニューの「インストール」または「ホーム画面に追加」から追加できます。'));
    };
    const speedBtn = (v: number, t: string) => h('button', { 'aria-pressed': String(s.speed === v), onclick: () => { s.speed = v; commit(); this.settings(back); } }, t);
    this.mount(h('div', { class: 'screen dim' },
      h('div', { class: 'panel' },
        h('div', { class: 'head' }, h('h2', {}, '設定'), h('button', { class: 'btn small', onclick: back }, '戻る')),
        h('label', { class: 'line', for: 'vol' }, '音量', h('input', { id: 'vol', type: 'range', min: '0', max: '1', step: '0.05', value: String(s.volume), oninput: (e: Event) => { s.volume = +(e.target as HTMLInputElement).value; commit(); }, onchange: () => audio.play('hit') })),
        h('label', { class: 'check' }, h('input', { id: 'mute', type: 'checkbox', checked: s.muted, onchange: (e: Event) => { s.muted = (e.target as HTMLInputElement).checked; commit(); } }), '消音'),
        h('div', { class: 'line' }, h('b', {}, '演出の速さ'), h('div', { class: 'seg' }, speedBtn(1, '標準'), speedBtn(1.5, '速い'), speedBtn(2.2, 'とても速い'))),
        pwaBlock(),
        h('label', { class: 'check' }, h('input', { id: 'reduced', type: 'checkbox', checked: s.reduced, onchange: (e: Event) => { s.reduced = (e.target as HTMLInputElement).checked; commit(); } }), '動きを減らす（揺れ・パーティクルを抑える）'),
      )));
  }

  // ---------------------------------------------------------------- first-match guide
  guide(done: () => void) {
    const B = '#e0b25c', Y = '#5fd0b5', F = '#e9674f', M = '#8fa9ad';
    const dial = (you: number, foe: number, extra = '') => `<svg viewBox="0 0 400 250" role="img"><g transform="translate(0 30)"><path d="M40 170 A160 160 0 0 1 360 170" fill="none" stroke="${B}" stroke-width="3"/>${[0, 10, 20, 30, 40].map((t) => { const a = Math.PI + (t / 40) * Math.PI; return `<text x="${200 + Math.cos(a) * 138}" y="${176 + Math.sin(a) * 138}" fill="${B}" font-size="12" text-anchor="middle">${t}</text>`; }).join('')}${[[you, Y, 150], [foe, F, 115]].map(([t, c, r]) => { const a = Math.PI + (Number(t) / 40) * Math.PI; return `<line x1="200" y1="170" x2="${200 + Math.cos(a) * Number(r)}" y2="${170 + Math.sin(a) * Number(r)}" stroke="${c}" stroke-width="6" stroke-linecap="round"/><circle cx="${200 + Math.cos(a) * (Number(r) + 12)}" cy="${170 + Math.sin(a) * (Number(r) + 12)}" r="13" fill="#08141c" stroke="${c}" stroke-width="3"/><text x="${200 + Math.cos(a) * (Number(r) + 12)}" y="${175 + Math.sin(a) * (Number(r) + 12)}" fill="${c}" font-size="13" font-weight="700" text-anchor="middle">${t}</text>`; }).join('')}<circle cx="200" cy="170" r="8" fill="${B}"/>${extra}</g></svg>`;
    const steps = [
      { t: '時計が遅れている方が動く', p: 'ターンはありません。緑の針があなた、赤の針が相手の時計です。針が遅れている方が行動します。', svg: dial(6, 11, `<text x="200" y="205" fill="${Y}" font-size="16" font-weight="700" text-anchor="middle">あなたの番（5刻ぶん連続で動ける）</text>`) },
      { t: '行動すると針が進む', p: 'カードのコストは「刻」。重いカードを使うほど針が大きく進み、その間に相手が動けます。カードを選ぶと、使った後の針が薄く表示されます。', svg: dial(11, 11, `<line x1="200" y1="170" x2="${200 + Math.cos(Math.PI * 1.4) * 150}" y2="${170 + Math.sin(Math.PI * 1.4) * 150}" stroke="${Y}" stroke-width="4" opacity=".4" stroke-dasharray="6 6"/><text x="200" y="205" fill="${M}" font-size="15" text-anchor="middle">16刻へ進む → 相手の番</text>`) },
      { t: 'ドラッグで召喚・攻撃', p: 'ユニットは手札からレーンへドラッグ。右上の丸が緑になったユニットは、タップして攻撃できます。正面が空なら相手の拠点を直接攻撃します。', svg: `<svg viewBox="0 0 400 190"><rect x="40" y="20" width="90" height="70" rx="10" fill="none" stroke="${F}" stroke-width="2"/><rect x="155" y="20" width="90" height="70" rx="10" fill="none" stroke="${F}" stroke-width="2"/><rect x="270" y="20" width="90" height="70" rx="10" fill="none" stroke="${F}" stroke-width="2"/><rect x="155" y="105" width="90" height="70" rx="10" fill="#16303d" stroke="${Y}" stroke-width="3"/><circle cx="232" cy="118" r="9" fill="${Y}"/><path d="M200 105 Q200 70 200 30" stroke="#ffd9c9" stroke-width="4" fill="none"/><path d="M190 42 L200 26 L210 42" fill="#ffd9c9"/></svg>` },
      { t: '未来を予約する', p: '術カードを時計の上に重ねて離すと、未来の時刻に予約できます。発動は両者の針がその時刻に届いた瞬間で、効果は強化されます。相手には時刻しか見えません。', svg: dial(8, 9, `${[[25, B, '★']].map(([t, c, s]) => { const a = Math.PI + (Number(t) / 40) * Math.PI; return `<path d="M${200 + Math.cos(a) * 172} ${170 + Math.sin(a) * 172 - 14} l14 14 l-14 14 l-14 -14z" fill="#08141c" stroke="${c}" stroke-width="3"/><text x="${200 + Math.cos(a) * 172}" y="${175 + Math.sin(a) * 172}" fill="${c}" font-size="12" text-anchor="middle">${s}</text>`; }).join('')}<text x="200" y="205" fill="${B}" font-size="15" font-weight="700" text-anchor="middle">25刻に「刻印の雷」が落ちる</text>`) },
    ];
    let i = 0;
    const render = () => {
      const st = steps[i];
      this.mount(h('div', { class: 'screen dim guide' },
        h('div', { class: 'panel' },
          h('div', { class: 'step' }, `GUIDE ${i + 1} / ${steps.length}`),
          h('h2', {}, st.t),
          h('div', { html: st.svg }),
          h('p', {}, st.p),
          h('div', { class: 'dots' }, ...steps.map((_, k) => h('i', { class: k === i ? 'on' : '' }))),
          h('div', { class: 'row end' },
            h('button', { class: 'btn small', onclick: () => { this.clear(); done(); } }, 'スキップ'),
            h('span', { class: 'spacer' }),
            i > 0 ? h('button', { class: 'btn small', onclick: () => { i--; render(); } }, '戻る') : null,
            h('button', { class: 'btn small primary', onclick: () => { if (i < steps.length - 1) { i++; render(); } else { this.clear(); done(); } } }, i < steps.length - 1 ? '次へ' : 'はじめる'),
          ),
        )));
    };
    render();
  }

  // ---------------------------------------------------------------- in-battle
  battleMenu(resume: () => void, surrender: () => void) {
    let confirm = false;
    const render = () => this.mount(h('div', { class: 'screen dim title' },
      h('div', { class: 'panel', style: 'width:min(380px,100%)' },
        h('h2', {}, 'メニュー'),
        h('button', { class: 'btn primary', onclick: () => { this.clear(); resume(); } }, '対戦に戻る'),
        h('button', { class: 'btn', onclick: () => this.rules(render) }, '遊び方'),
        h('button', { class: 'btn', onclick: () => this.settings(render) }, '設定'),
        confirm
          ? h('div', { class: 'confirm' }, h('div', {}, '降参すると敗北になります。'), h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => { confirm = false; render(); } }, 'やめる'), h('button', { class: 'btn small danger', onclick: () => { this.clear(); surrender(); } }, '降参する')))
          : h('button', { class: 'btn danger', onclick: () => { confirm = true; render(); } }, '降参する'),
      )));
    render();
  }

  /** Coins earned, counted up so the reward registers. */
  private rewardView(rw?: Reward) {
    if (!rw) return null;
    if (!rw.total) return h('div', { class: 'reward none' }, rw.capped ? `本日の対戦報酬は上限（${DAILY_MATCH_CAP}コイン）に達しました。ミッションやログインボーナスは引き続き受け取れます` : `コインは短すぎる対戦（自分の行動${MIN_ACTIONS}回未満）や降参では得られません`);
    const total = h('b', {}, '+0');
    const box = h('div', { class: 'reward' },
      h('div', { class: 'lines' }, ...rw.lines.map((l) => h('div', {}, h('span', {}, l.label), h('span', {}, `+${l.coins}`)))),
      h('div', { class: 'total' }, h('i', { class: 'coin-ic' }), total, h('span', {}, ` コイン（所持 ${store.wallet.coins}）`)),
      rw.capped ? h('div', { class: 'cap-note' }, `本日の対戦報酬は上限（${DAILY_MATCH_CAP}コイン）に達しました`) : null);
    const t0 = performance.now(), dur = 900;
    const stepFn = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      total.textContent = `+${Math.round(rw.total * (1 - Math.pow(1 - k, 3)))}`;
      if (k < 1 && box.isConnected) requestAnimationFrame(stepFn); else audio.play('coin');
    };
    requestAnimationFrame(stepFn);
    return box;
  }
  private shopLink(leave: () => void) {
    return PACKS.some((p) => canOpen(store.wallet, p)) ? h('button', { class: 'btn shop-btn', onclick: () => { leave(); this.shop(); } }, 'パックを開封する', h('span', { class: 'dot' })) : null;
  }

  /** EXP gained and rank-ups after a match. */
  private expView(xp?: XpGain) {
    if (!xp || !xp.exp) return null;
    const rk = rankOf(store.meta.exp);
    const fill = h('i', { style: `width:${xp.after > xp.before ? 0 : ((rk.into - xp.exp) / rk.need) * 100}%` });
    requestAnimationFrame(() => setTimeout(() => { fill.style.width = `${(rk.into / rk.need) * 100}%`; }, 250));
    return h('div', { class: 'xp' },
      h('div', { class: 'xp-row' }, h('span', { class: 'rank' }, h('small', {}, 'RANK'), String(rk.rank)), h('div', { class: 'exp wide' }, fill), h('b', {}, `EXP +${xp.exp}`)),
      xp.after > xp.before ? h('div', { class: 'rankup' }, `RANK UP!  ランク${xp.after}　報酬をプレゼントボックスに送りました`) : null);
  }

  private resultView(r: BattleResult, foeLabel: string, buttons: (HTMLElement | null)[], note?: string, rw?: Reward, xp?: XpGain) {
    const kind = r.winner === 0 ? 'win' : r.winner === 1 ? 'lose' : 'draw';
    const win = kind === 'win';
    const title = win ? '勝利' : kind === 'lose' ? '敗北' : '引き分け';
    const why = {
      ko: win ? '相手の拠点を破壊した' : '拠点を破壊された',
      time: `${RULES.END}刻に到達 ・ 体力の差で決着`,
      surrender: win ? `${foeLabel}が降参した` : '降参した',
      timeout: win ? `${foeLabel}が時間切れを重ねた` : '時間切れを重ねた',
      disconnect: win ? `${foeLabel}が戻ってこなかった` : '接続が戻らなかった',
    }[r.reason];
    return h('div', { class: `screen dim result ${kind}` },
      h('h1', {}, title),
      h('div', { class: 'why' }, why),
      h('div', { class: 'stats' },
        h('div', {}, h('b', {}, String(Math.max(0, r.myHp))), h('span', {}, 'あなたの体力')),
        h('div', {}, h('b', {}, String(Math.max(0, r.foeHp))), h('span', {}, `${foeLabel}の体力`)),
        h('div', {}, h('b', {}, String(r.actions)), h('span', {}, '総行動数'))),
      note ? h('div', { class: 'why' }, note) : null,
      this.rewardView(rw),
      this.expView(xp),
      h('div', { class: 'menu' }, ...buttons));
  }

  result(r: BattleResult, again: () => void, leave: () => void, rw?: Reward, xp?: XpGain) {
    this.mount(this.resultView(r, 'AI', [
      h('button', { class: 'btn primary', onclick: again }, 'もう一度'),
      this.shopLink(leave),
      h('button', { class: 'btn', onclick: () => { leave(); this.setup(); } }, 'デッキを変えて対戦'),
      h('button', { class: 'btn', onclick: () => { leave(); this.home(); } }, 'ホームへ'),
    ], undefined, rw, xp));
  }

  // ---------------------------------------------------------------- online
  onlineMenu(invite?: string) {
    const flow = this.host.flow();
    if (!flow.available) {
      this.mount(h('div', { class: 'screen dim' }, h('div', { class: 'panel' },
        h('div', { class: 'head' }, h('h2', {}, 'オンライン対戦'), h('button', { class: 'btn small', onclick: () => this.battleTab() }, '戻る')),
        h('p', {}, 'オンライン対戦は現在準備中です。公開までもうしばらくお待ちください。'))));
      return;
    }
    const decks = store.allDecks();
    let mine = decks.find((d) => d.id === store.settings.lastDeck && d.valid) ?? decks.find((d) => d.valid) ?? decks[0];
    let name = store.settings.name;
    let code = invite ?? '';
    const go = (join: boolean) => {
      store.settings.lastDeck = mine.id; store.settings.name = name.trim(); store.saveSettings();
      audio.play('summon');
      if (join) flow.join(normalizeCode(code)!, name, mine.cards); else flow.create(name, mine.cards);
    };
    const render = () => {
      const deckOpts = decks.map((d) => h('button', {
        class: 'opt', 'aria-pressed': String(d.id === mine.id), disabled: !d.valid,
        onclick: () => { mine = d; audio.play('select'); render(); },
      }, h('div', {}, h('div', { class: 'nm' }, d.name), h('div', { class: 'ds' }, d.blurb ?? `${d.cards.length}枚・自作デッキ`)), !d.valid ? h('span', { class: 'badge' }, d.missing.length ? '未所持あり' : '未完成') : null));
      const joinBtn = h('button', { class: 'btn primary', disabled: !normalizeCode(code), onclick: () => go(true) }, '入室');
      const r = store.onlineRecord;
      this.mount(h('div', { class: 'screen dim' },
        h('div', { class: 'panel' },
          h('div', { class: 'head' }, h('h2', {}, 'オンライン対戦'), h('button', { class: 'btn small', onclick: () => this.battleTab() }, '戻る')),
          invite ? h('div', { class: 'invite' }, '友達から招待されています。名前とデッキを選んで「入室」を押してください。') : null,
          h('h3', {}, 'あなたの名前'),
          h('input', { class: 'text', id: 'pname', value: name, maxlength: String(NET.NAME_MAX), placeholder: 'プレイヤー', autocomplete: 'nickname', 'aria-label': '名前', oninput: (e: Event) => { name = (e.target as HTMLInputElement).value; } }),
          h('h3', {}, 'デッキ'), h('div', { class: 'opt-list' }, ...deckOpts),
          h('h3', {}, 'あいことばで入る'),
          h('div', { class: 'row' },
            h('input', {
              class: 'text code-in', id: 'pcode', value: code, maxlength: String(NET.CODE_LEN + 2), placeholder: 'ABCDE', autocomplete: 'off', autocapitalize: 'characters', 'aria-label': 'あいことば',
              oninput: (e: Event) => { const el = e.target as HTMLInputElement; code = el.value.toUpperCase(); el.value = code; joinBtn.disabled = !normalizeCode(code); },
            }),
            joinBtn),
          h('div', { class: 'or' }, 'または'),
          h('button', { class: `btn${invite ? '' : ' primary'}`, id: 'create', onclick: () => go(false) }, '部屋を作って友達を招待'),
          h('div', { class: 'record' }, `オンライン戦績　${r.win}勝 ${r.lose}敗${r.draw ? ` ${r.draw}分` : ''}`),
        )));
    };
    render();
  }

  connecting(msg: string) {
    const flow = this.host.flow();
    this.mount(h('div', { class: 'screen dim title' }, h('div', { class: 'panel wait' },
      h('div', { class: 'spinner', 'aria-hidden': 'true' }),
      h('h2', {}, msg),
      h('button', { class: 'btn small', onclick: () => { flow.leave(); this.onlineMenu(); } }, 'やめる'))));
  }

  error(msg: string, back: () => void) {
    this.mount(h('div', { class: 'screen dim title' }, h('div', { class: 'panel' },
      h('h2', {}, 'つながりませんでした'),
      h('p', {}, msg),
      h('button', { class: 'btn primary', onclick: back }, '戻る'))));
  }

  lobby() {
    const flow = this.host.flow();
    let note = '';
    const copy = async (text: string) => {
      try { await navigator.clipboard.writeText(text); note = 'コピーしました'; }
      catch { note = '長押しでコピーしてください'; }
      this.host.root.replaceChildren(build());
    };
    const build = () => {
      const foe = flow.foe;
      const link = inviteLink(flow.code);
      return h('div', { class: 'screen dim title' }, h('div', { class: 'panel lobby' },
        h('h2', {}, foe ? `${foe.name} が入室しました` : '友達を招待しよう'),
        h('p', {}, 'あいことばを伝えるか、招待リンクを送ってください。相手が入ると自動で始まります。'),
        h('div', { class: 'code', 'aria-label': `あいことば ${flow.code}` }, ...[...flow.code].map((c) => h('span', {}, c))),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn small primary', onclick: () => copy(link) }, '招待リンクをコピー'),
          h('button', { class: 'btn small', onclick: () => copy(flow.code) }, 'あいことばをコピー'),
          typeof navigator.share === 'function' ? h('button', { class: 'btn small', onclick: () => { void navigator.share({ title: 'クロノ・デュエル', text: 'クロノ・デュエルで勝負しよう！', url: link }).catch(() => undefined); } }, '共有') : null),
        note ? h('div', { class: 'note' }, note) : null,
        h('div', { class: `foe-line${foe ? ' in' : ''}` }, h('i', {}), foe ? `${foe.name}（${foe.online ? '接続中' : '接続が切れています'}）` : '相手を待っています…'),
        flow.linkStatus === 'reconnecting' ? h('div', { class: 'note warn' }, '接続を再試行中…') : null,
        h('button', { class: 'btn', onclick: () => { flow.leave(); this.onlineMenu(); } }, '部屋を閉じる')));
    };
    this.live(build, (fn) => flow.onChange(fn));
  }

  resultOnline(r: BattleResult, leave: () => void, rw?: Reward, xp?: XpGain) {
    const flow = this.host.flow();
    const build = () => {
      const foe = flow.foe, rm = flow.rematch;
      const here = !!foe && foe.online;
      const label = rm.me ? '相手の返事を待っています…' : rm.foe ? '再戦する（相手が待っています）' : '再戦する';
      const note = !foe ? '相手は部屋を出ました' : !foe.online ? '相手の接続が切れています' : rm.foe && !rm.me ? '相手が再戦を希望しています' : '';
      return this.resultView(r, foe?.name ?? '相手', [
        h('button', { class: 'btn primary', disabled: rm.me || !here, onclick: () => { audio.play('select'); flow.requestRematch(); } }, label),
        h('button', { class: 'btn', onclick: () => { flow.leave(); leave(); this.onlineMenu(); } }, '部屋を出る'),
        h('button', { class: 'btn', onclick: () => { flow.leave(); leave(); this.home(); } }, 'ホームへ'),
      ], note, rw, xp);
    };
    this.live(build, (fn) => flow.onChange(fn));
  }

  // ---------------------------------------------------------------- shop
  shop() {
    let showOdds = false;
    let showList = false;
    const pack = PACKS[0];
    const render = () => {
      const w = store.wallet;
      const pay = canOpen(w, pack);
      const prog = setProgress(w, pack.set);
      const left = PITY - w.pity;
      const cards = CARD_LIST.filter((c) => setOf(c) === pack.set).sort((a, b) => 'CREL'.indexOf(b.rarity) - 'CREL'.indexOf(a.rarity) || a.cost - b.cost);
      const slot = (r: string, pr: number) => h('tr', {}, h('td', {}, RARITY_NAMES[r as 'C']), h('td', {}, `${Math.round(pr * 1000) / 10}%`), h('td', {}, `${cards.filter((c) => c.rarity === r).length}種`));
      this.hub('shop', h('div', { class: 'tab-page' },
        h('div', { class: 'panel shop' },
          h('div', { class: 'head' }, h('h2', {}, 'ショップ')),
          h('div', { class: 'pack-show' },
            h('div', { class: 'pack-img' }, h('img', { src: packImg(pack.name, pack.sub), alt: `${pack.name} パック` }), h('i', { class: 'sheen' })),
            h('div', { class: 'pack-info' },
              h('div', { class: 'set' }, SET_NAMES[pack.set]),
              h('h3', {}, `${pack.name} パック`),
              h('p', {}, '残響・共鳴・急襲・充填。時間の使い方を広げる新カード22種。1パック5枚入り、うち1枚は希少以上。'),
              h('div', { class: 'progress', 'aria-label': `収集 ${prog.have}/${prog.total}` }, h('i', { style: `width:${(prog.have / prog.total) * 100}%` })),
              h('div', { class: 'small' }, `収集 ${prog.kinds}/${prog.kindsTotal}種 ・ ${prog.have}/${prog.total}枚`),
              h('div', { class: 'small pity' }, left <= 1 ? '次のパックで伝説が確定！' : `あと${left}パック以内に伝説が1枚確定`),
              h('button', { class: 'btn primary open', disabled: !pay, onclick: () => { audio.play('summon'); this.host.openPack(pack.id); } },
                pay === 'ticket' ? `開封する（チケット 残り${w.tickets}）` : `開封する（${pack.price} コイン）`),
              !pay ? h('div', { class: 'small warn' }, `コインが足りません（あと${pack.price - w.coins}）。対戦で集めましょう。`) : null,
            )),
          h('h3', {}, 'コインの集め方'),
          h('ul', { class: 'earn' },
            h('li', {}, `AI（ふつう）に勝利 ${MATCH_REWARD['ai-normal'][0]} ・ AI（つよい）に勝利 ${MATCH_REWARD['ai-hard'][0]} ・ オンラインで勝利 ${MATCH_REWARD.online[0]}`),
            h('li', {}, `負けても参加で ${MATCH_REWARD['ai-normal'][1]}〜${MATCH_REWARD.online[1]}、引き分け ${MATCH_REWARD['ai-normal'][2]}〜${MATCH_REWARD.online[2]}`),
            h('li', {}, `その日はじめての勝利で +${DAILY_BONUS}（対戦の報酬は1日${DAILY_MATCH_CAP}コインまで）`),
            h('li', {}, 'ログインボーナス・デイリーミッション・ランクアップでも手に入ります')),
          h('h3', {}, '欠片とカード作成'),
          h('ul', { class: 'earn' },
            h('li', {}, `上限枚数を超えて出たカードは欠片に（通常${DUPE_SHARDS.C}・希少${DUPE_SHARDS.R}・秘宝${DUPE_SHARDS.E}・伝説${DUPE_SHARDS.L}）`),
            h('li', {}, `欠片で好きなカードを作成できます（通常${CRAFT_COST.C}・希少${CRAFT_COST.R}・秘宝${CRAFT_COST.E}・伝説${CRAFT_COST.L}）。図鑑かデッキ編集でカードを開いてください`)),
          h('button', { class: 'btn small toggle', 'aria-expanded': String(showOdds), onclick: () => { showOdds = !showOdds; render(); } }, `提供割合 ${showOdds ? '▲' : '▼'}`),
          showOdds ? h('div', { class: 'odds' },
            h('p', {}, '1パック5枚：1〜3枚目は通常、4枚目は希少、5枚目は下の割合で決まります。同じレア度の中では各カードが等しい確率で出ます（伝説は未所持のカードを優先）。'),
            h('table', {}, h('tr', {}, h('th', {}, '5枚目'), h('th', {}, '確率'), h('th', {}, '収録')), ...LAST_SLOT.map(([r, pr]) => slot(r, pr))),
            h('p', {}, `天井：伝説が出ないまま${PITY}パック目を開けると、5枚目は必ず伝説になります。ゲーム内コインは遊んで得るもので、現金では購入できません。`)) : null,
          h('button', { class: 'btn small toggle', 'aria-expanded': String(showList), onclick: () => { showList = !showList; render(); } }, `収録カード一覧 ${showList ? '▲' : '▼'}`),
          showList ? h('div', { class: 'grid' }, ...cards.map((c) => {
            const o = ownedCount(w, c.id);
            return h('div', { class: `tile${o ? '' : ' locked'}` }, h('img', { src: cardImg(c.id), alt: c.name, loading: 'lazy' }), h('span', { class: 'own' }, o ? `所持 ${o}` : '未所持'));
          })) : null,
        )));
    };
    render();
  }
}
