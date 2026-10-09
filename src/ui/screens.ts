import { CARDS, CARD_LIST, RARITY_NAMES, SET_NAMES, cardDef, keywordsOf, KEYWORD_HELP, setOf, type CardDef, type CardSet, type Rarity } from '../core/cards';
import { maxCopies, PRESET_DECKS, validateDeck, type DeckDef } from '../core/decks';
import { NET, cleanName, normalizeCode, type Presence } from '../core/net';
import { RULES } from '../core/rules';
import { inviteLink } from '../net/config';
import type { OnlineFlow } from '../net/flow';
import { audio } from '../render/audio';
import type { BattleResult } from '../render/battle';
import { DIAL_SKINS } from '../render/dial';
import { DIAL_ART, MAT_ART, dialPreviewSvg, matFlatSvg } from '../render/lookArt';
import {
  CRAFT_COST, DAILY_BONUS, DAILY_MATCH_CAP, DUPE_SHARDS, LAST_SLOT, LOOKS, MATCH_REWARD, MIN_ACTIONS, PACKS, PITY,
  THEMES, THEME_SET_PRICE, buyLook, buyTheme, canOpen, craft, craftBlock, craftable, localDate, lookBlock, lookById, ownedCount, ownsLook, setProgress, themeOffer, type LookKind, type PackDef, type Reward,
} from '../meta/economy';
import {
  DAILY_ALL_BONUS, LOGIN_CALENDAR, NEWS, beginnerView, track, checkLogin, claimMission, claimPresents, claimable, dailyView, prizeText, rankOf, recentShares, deckShares, unreadNews,
  type MissionView, type News, type Prize, type Stat,
} from '../meta/progress';
import { TITLES } from '../meta/titles';
import { VERSION } from '../version';
import { pwa } from '../pwa';
import { store } from './storage';
import { AI_LEVEL_NAMES, type AiLevel } from '../core/ai';
import { PLACEMENT_GAMES, tierOf, type Opponent, type RatedGame } from '../meta/rating';
import { fetchRanking, rankingAvailable, syncRated } from '../net/api';
import { ICON, artStyle, backImg, svgImg, cardImg, cardName, countBadge, countUp, h, newTag, packImg, pressable, purse, ribbon, svg, tierBadge, topBar } from './kit';
import { deckKey, deckLook, favCard, myTitles, newTitles, shownTitle } from './profile';

export { h } from './kit';

type Tab = 'home' | 'battle' | 'deck' | 'shop' | 'menu';
type AnyDeck = ReturnType<typeof store.allDecks>[number];
export interface XpGain { exp: number; before: number; after: number }
/** A daily mission this match moved (for the result screen). */
export interface MissionDelta { text: string; before: number; after: number; goal: number }
/** Who meets whom on the VS screen. */
export interface VsSide { name: string; card: string; first: boolean; tierRating?: number; title?: string; deck?: string }

/** Collection progress over every collectible card. */
function setProgressAll() {
  const kinds = CARD_LIST.filter((c) => ownedCount(store.wallet, c.id) > 0).length;
  return { kinds, total: CARD_LIST.length, pct: Math.round((kinds / CARD_LIST.length) * 100) };
}
/** Opens the strategy wiki (built as a second page at ./wiki/) in a new tab. */
const openWiki = () => window.open('./wiki/', '_blank', 'noopener');
const RANK = { C: 0, R: 1, E: 2, L: 3 } as const;
const RARE_COLOR: Record<Rarity, string> = { C: '#9fb3b8', R: '#5fd0b5', E: '#c9a8ff', L: '#ffd66e' };
const fmt = (n: number) => n.toLocaleString('ja-JP');
const hasTokens = (d: { cards: string[] }) => d.cards.filter((c) => CARDS[c] && !CARDS[c].token);

/** A playmat as a picture (shop, deck slot); 'mat:none' is the plain board. */
function matPreview(id: string, lanes = true): HTMLElement {
  if (!MAT_ART[id]) return h('div', { class: 'matpv none' }, h('span', {}, 'いつもの盤面'));
  return h('img', { class: 'matpv', src: svgImg(matFlatSvg(id, 390, 414, lanes)), alt: '' });
}
/** What a look looks like, whatever its kind. */
const lookPreview = (kind: LookKind, id: string) => (kind === 'back' ? h('img', { src: backImg(id), alt: '' }) : kind === 'dial' ? dialPreview(id) : matPreview(id));
const LOOK_TITLE: Record<LookKind, string> = { back: 'スリーブ', dial: '盤面の文字盤', mat: 'プレイマット' };

/** Clock-face colours as a small canvas (shop preview and deck slot). */
function dialPreview(id: string, w = 160, h2 = 90): HTMLElement {
  if (DIAL_ART[id]) return h('img', { class: 'dialpv', src: svgImg(dialPreviewSvg(id, w * 2)), alt: '', style: 'object-fit:contain' });
  const k = DIAL_SKINS[id] ?? DIAL_SKINS['dial:brass'];
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  const cv = document.createElement('canvas'); cv.width = w * 2; cv.height = h2 * 2;
  const c = cv.getContext('2d')!;
  c.scale(2, 2);
  const cx = w / 2, cy = h2 - 6, R = Math.min(w / 2 - 6, h2 - 12);
  c.beginPath(); c.moveTo(cx - R, cy); c.arc(cx, cy, R, Math.PI, Math.PI * 2); c.closePath(); c.fillStyle = hex(k.face); c.fill();
  if (k.star) { for (let i = 0; i < 26; i++) { const a = Math.PI + ((i * 37) % 100) / 100 * Math.PI, r = 10 + ((i * 53) % 100) / 100 * (R - 12); c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.4, 1.4); } }
  c.strokeStyle = hex(k.rim); c.lineWidth = 2.5; c.beginPath(); c.arc(cx, cy, R, Math.PI, Math.PI * 2); c.stroke();
  c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.stroke();
  c.strokeStyle = hex(k.inner); c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, R * 0.72, Math.PI, Math.PI * 2); c.stroke();
  for (let i = 0; i <= 40; i++) {
    const a = Math.PI + (i / 40) * Math.PI, major = i % 5 === 0;
    c.strokeStyle = hex(major ? k.tick : k.minor); c.lineWidth = major ? 2 : 1;
    c.beginPath(); c.moveTo(cx + Math.cos(a) * (R - 2), cy + Math.sin(a) * (R - 2)); c.lineTo(cx + Math.cos(a) * (R - (major ? 10 : 6)), cy + Math.sin(a) * (R - (major ? 10 : 6))); c.stroke();
  }
  c.strokeStyle = '#5fd0b5'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(Math.PI * 1.32) * R * 0.8, cy + Math.sin(Math.PI * 1.32) * R * 0.8); c.stroke();
  c.strokeStyle = '#e9674f'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(Math.PI * 1.55) * R * 0.6, cy + Math.sin(Math.PI * 1.55) * R * 0.6); c.stroke();
  c.fillStyle = hex(k.rim); c.beginPath(); c.arc(cx, cy, 5, 0, Math.PI * 2); c.fill();
  return cv;
}
/** Curve of a deck (cost 1..5 and 6+), as bars with counts. */
function curveBars(cards: string[]) {
  const n = Array.from({ length: 6 }, (_, i) => cards.filter((c) => (i === 5 ? cardDef(c).cost >= 6 : Math.max(1, cardDef(c).cost) === i + 1)).length);
  const max = Math.max(1, ...n);
  return h('div', { class: 'curve2', 'aria-label': '刻（コスト）ごとの枚数' }, ...n.map((k, i) => h('div', {}, h('span', {}, k ? String(k) : ''), h('i', { style: `height:${(k / max) * 70}%` }), h('b', {}, i === 5 ? '6+' : String(i + 1)))));
}
const unitCount = (cards: string[]) => cards.filter((c) => cardDef(c).kind === 'unit').length;

export interface ScreenHost {
  root: HTMLElement;
  openPack(id: string): void;
  /** Starts a game against the AI (the VS screen plays over its opening). */
  startBattle(deck: DeckDef, ai: DeckDef, level: AiLevel): void;
  startRated(deck: DeckDef): void;
  /** One-off message for the home screen (e.g. an abandoned rated game), or ''. */
  takeNotice(): string;
  applySettings(): void;
  flow(): OnlineFlow;
  /** Opens the action log of the game on screen (the result screen keeps the finished game behind it). */
  openLog(): void;
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
  /** A sub-screen: the brass top bar and a scrolling body. */
  private page(title: string, back: (() => void) | null, body: (HTMLElement | null)[], right: (HTMLElement | null)[] = [], cls = '') {
    return this.mount(h('div', { class: `cd-page ${cls}` }, topBar(title, back, ...right), h('div', { class: 'cd-scroll' }, ...body)));
  }

  // ---------------------------------------------------------------- title
  /** Key visual and TAP TO START. First launch asks for a player name before entering the home screen. */
  title() {
    const legends = ['dragon', 'e_verna', 'titan'];
    let gone = false;
    audio.bgm('title');
    // measured when the finger goes down, before any click handler has woken the sound
    let wasOn = audio.musicOn;
    const start = () => {
      if (gone) return;
      // Browsers keep sound off until the first tap. If this tap is the one that starts the title music, let it play
      // and wait for the next tap to go in (otherwise the title theme would never be heard).
      audio.unlock();
      if (!wasOn && audio.musicOn) { wasOn = true; audio.play('reveal'); el.classList.add('awake'); return; }
      gone = true;
      audio.play('bell');
      el.classList.add('leaving');
      setTimeout(() => (store.settings.name ? this.transition('', () => this.home(), 650) : this.nameEntry(() => this.home())), 380);
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
    el.addEventListener('pointerdown', () => { wasOn = audio.musicOn; }, true);
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

  // ---------------------------------------------------------------- transition
  private static TIPS = [
    '予約したカードは、相手には発動する時刻しか見えません。何が起きるかで相手を迷わせましょう。',
    '時計が遅れている方が動きます。重いカードを使うと、その間に相手が続けて動けます。',
    `両者の時計が${RULES.DOOM_AT}刻に達すると終焉の刻。ユニットが拠点に与えるダメージが増えます。`,
    `鐘（${RULES.BELLS.join('・')}刻）を越えると1枚引けます。鐘の手前でドローするかは悩みどころ。`,
    '攻撃するユニットを押している間、相手の体力がどうなるか、反撃で倒れるかが表示されます。',
    '残響は時計に丸いピンで公開されます。相手の残響の時刻も見て動きましょう。',
    `伝説は${PITY}パック以内に必ず1枚出ます。ショップの目盛りで残りを確かめられます。`,
  ];
  /**
   * The clock face closes over the screen and opens on the next one. `ms` is how long it stays; `then` runs when
   * the face is fully shown (the next screen is built underneath).
   */
  transition(msg: string, then: () => void, ms = 700) {
    const tip = Screens.TIPS[Math.floor(Math.random() * Screens.TIPS.length)];
    const ticks = Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; const r1 = i % 3 ? 44 : 40, r2 = 48; return `<path d="M${50 + Math.cos(a) * r1} ${50 + Math.sin(a) * r1}L${50 + Math.cos(a) * r2} ${50 + Math.sin(a) * r2}" stroke="#e0b25c" stroke-width="${i % 3 ? 0.8 : 1.4}"/>`; }).join('');
    const el = h('div', { class: 'trans', 'aria-live': 'polite' },
      h('i', { class: 'gear a' }), h('i', { class: 'gear b' }),
      h('div', { class: 'face', html: `<svg viewBox="0 0 100 100" fill="none">${ticks}<circle cx="50" cy="50" r="34" stroke="#e0b25c" stroke-opacity=".4" stroke-dasharray=".6 2.4"/><path d="M50 50L60 26" stroke="#fff3d4" stroke-width="2.4" stroke-linecap="round"/><path d="M50 50L28 42" stroke="#5fd0b5" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="50" r="5" fill="#c99640"/></svg>` }, h('i', { class: 'sweep' })),
      h('div', { class: 'cap' }, h('small', {}, 'CHRONO DUEL'), msg ? h('span', {}, msg) : null),
      h('div', { class: 'tip' }, h('b', {}, 'ヒント'), h('p', {}, tip)));
    this.host.root.append(el);
    setTimeout(() => {
      then();
      if (!el.isConnected) this.host.root.append(el);
      el.classList.add('out');
      setTimeout(() => el.remove(), 330);
    }, ms);
  }

  // ---------------------------------------------------------------- hub (header + bottom tabs)
  private tab: Tab = 'home';
  private hub(tab: Tab, body: HTMLElement) {
    audio.bgm('home');
    this.tab = tab;
    const w = store.wallet, m = store.meta;
    const rk = rankOf(m.exp);
    const today = localDate();
    const missions = claimable(m, today);
    const canPack = PACKS.some((p) => canOpen(w, p));
    const go = (t: Tab) => () => { if (t === this.tab && t !== 'home') return; audio.play('select'); this.openTab(t); };
    const nav = (t: Tab, label: string, en: string, icon: string, badge = false, fresh = false) => h('div', { class: 'tab-wrap' },
      h('button', { class: `tab${t === tab ? ' on' : ''}`, 'aria-current': t === tab ? 'page' : undefined, onclick: go(t) }, h('span', { class: 'ic', html: icon }), h('span', {}, label), h('span', { class: 'en' }, en)),
      fresh ? newTag('tab-new') : badge ? h('i', { class: 'badge-dot' }) : null);
    const root = h('div', { class: `hub hub-${tab}` },
      h('header', { class: 'hub-top' },
        h('button', { class: 'me', 'aria-label': 'プロフィール', onclick: () => this.profile() },
          h('span', { class: 'hexmark' }, h('span', {}, h('small', {}, 'RANK'), h('b', {}, String(rk.rank)))),
          h('span', { class: 'me-main' },
            h('span', { class: 'me-lv' }, 'Lv.', h('b', {}, String(rk.rank)), h('span', { class: 'bar' }, h('i', { style: `width:${(rk.into / rk.need) * 100}%` }))),
            ribbon(shownTitle()?.id),
            h('span', { class: 'me-name' }, store.settings.name || 'プレイヤー'))),
        purse()),
      h('main', { class: 'hub-body' }, body),
      h('nav', { class: 'hub-nav', 'aria-label': 'メインメニュー' },
        nav('home', 'ホーム', 'HOME', ICON.home, missions > 0 || m.presents.length > 0),
        nav('battle', 'バトル', 'BATTLE', ICON.battle),
        nav('deck', 'デッキ', 'DECK', ICON.deck, false, store.wallet.fresh.length > 0),
        nav('shop', 'ショップ', 'SHOP', ICON.shop, canPack),
        nav('menu', 'その他', 'MENU', ICON.menu, unreadNews(m) > 0 || newTitles().length > 0)));
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
    const fav = favCard();
    const favDef = cardDef(fav);
    const deck = store.deckById(store.settings.lastDeck);
    const quick = deck && deck.valid ? deck : store.allDecks()[0];
    const banners = this.banners();
    let slide = 0;
    const track = h('div', { class: 'banner-track' }, ...banners);
    const dots = h('div', { class: 'banner-dots' }, ...banners.map((_, i) => h('i', { class: i === 0 ? 'on' : '' })));
    const setSlide = (i: number) => { slide = (i + banners.length) % banners.length; track.style.transform = `translateX(${-slide * 100}%)`; [...dots.children].forEach((d, k) => d.classList.toggle('on', k === slide)); };
    let sx = 0;
    const carousel = h('div', { class: 'banners2', 'aria-roledescription': 'カルーセル' }, track, dots);
    carousel.addEventListener('pointerdown', (e) => { sx = e.clientX; });
    carousel.addEventListener('pointerup', (e) => { const d = e.clientX - sx; if (Math.abs(d) > 40) { setSlide(slide + (d < 0 ? 1 : -1)); e.stopPropagation(); } });
    const dv = dailyView(m, today), bv = beginnerView(m);
    const dailyReady = dv.filter((x) => x.done && !x.claimed).length + (dv.every((x) => x.claimed) && !m.dailyClaimed.includes('all') ? 1 : 0);
    const beginReady = bv.filter((x) => x.done && !x.claimed).length;
    const beginLeft = bv.some((x) => !x.claimed);
    const dia = (label: string, icon: string, fn: () => void, n = 0, isNew = false, cls = '') => h('button', { class: `dia ${cls}`, 'aria-label': `${label}${n ? `（${n}件）` : ''}`, onclick: () => { audio.play('select'); fn(); } },
      h('i', { html: icon }), h('small', {}, label), n ? countBadge(n) : isNew ? newTag() : null);
    const done = dv.filter((x) => x.done).length;
    const rt = store.rated, tr = tierOf(rt.rating).tier;
    const body = h('div', { class: 'home2' },
      h('div', { class: 'home-row1' },
        h('button', { class: 'daily-mini', onclick: () => this.missions('daily') },
          h('b', {}, 'デイリーミッション'),
          h('div', { class: 'ln' }, `${done}/${dv.length}`, h('i', {}, h('u', { style: `width:${(done / dv.length) * 100}%` }))),
          dailyReady ? h('i', { class: 'badge-dot' }) : null),
        h('div', { class: 'dias' },
          beginLeft ? dia('はじめて', ICON.sprout, () => this.missions('beginner'), beginReady, false, 'sprout') : null,
          dia('お知らせ', ICON.news, () => this.newsModal(), 0, unreadNews(m) > 0),
          dia('プレゼント', ICON.gift, () => this.presents(), m.presents.length),
          dia('ミッション', ICON.mission, () => this.missions('daily'), dailyReady))),
      carousel,
      h('div', { class: 'stage' },
        h('div', { class: 'pedestal' },
          h('button', { class: 'feat', 'aria-label': `看板カード ${favDef.name}`, onclick: () => this.cardDetail(fav) }, h('span', {}, h('img', { src: cardImg(fav), alt: favDef.name }))),
          h('div', { class: 'feat-name' }, h('small', {}, '看板カード'), h('b', {}, favDef.name)))),
      h('div', { class: 'home-cta2' },
        h('button', { class: 'cta-main', onclick: () => { audio.play('summon'); this.clear(); this.host.startBattle(quick, PRESET_DECKS[Math.floor(Math.random() * PRESET_DECKS.length)], store.settings.level); } },
          h('b', {}, 'バトル'),
          h('small', {}, `フリー対戦 ・ ${quick.name} ・ AI ${AI_LEVEL_NAMES[store.settings.level] ?? 'ふつう'}`)),
        h('button', { class: 'cta-side', style: `--tier:${tr.color}`, onclick: () => this.rated() }, 'レート戦', h('small', {}, `${tr.name} ${fmt(rt.rating)}`))),
    );
    this.hub('home', body);
    const timer = window.setInterval(() => { if (!carousel.isConnected) { clearInterval(timer); return; } setSlide(slide + 1); }, 5000);
    if (loginDay) setTimeout(() => this.loginModal(loginDay), 350);
    const notice = this.host.takeNotice();
    // important, so it waits to be read (after the login bonus if both appear)
    if (notice) setTimeout(() => { const { close } = this.modal('レート戦', [h('p', {}, notice)], { foot: [h('button', { class: 'btn primary', onclick: () => close() }, 'OK')] }); }, loginDay ? 600 : 400);
  }

  private banners(): HTMLElement[] {
    const pack = PACKS[0];
    const flow = this.host.flow();
    const setCards = CARD_LIST.filter((c) => setOf(c) === pack.set).sort((a, b) => RANK[b.rarity] - RANK[a.rarity]);
    const b = (cls: string, kicker: string, title: string, sub: string, fn: () => void, imgs: string[]) =>
      h('button', { class: `bnr ${cls}`, onclick: () => { audio.play('select'); fn(); } },
        ...imgs.slice(0, 2).map((id, i) => h('img', { class: i ? 'b' : 'a', src: cardImg(id), alt: '' })),
        h('div', { class: 'txt' }, h('small', {}, kicker), h('b', {}, title), h('span', {}, sub)));
    return [
      b('b-pack', 'SET 1 ・ NOW ON', pack.name, `新カード${setCards.length}種 ・ 伝説は${PITY}パックで確定`, () => this.packShop(pack), setCards.slice(0, 2).map((c) => c.id)),
      b('b-rated', 'RATED', 'レート戦', `いま「${tierOf(store.rated.rating).tier.name}」・ レート${store.rated.rating}`, () => this.rated(), ['e_verna']),
      b('b-online', 'FRIEND', 'フレンド対戦', flow.available ? 'あいことば・招待リンク・観戦' : '準備中', () => this.onlineMenu(), ['e_atra']),
      b('b-mission', 'DAILY', 'デイリーミッション', `全達成でさらに${DAILY_ALL_BONUS.coins}コイン`, () => this.missions('daily'), ['e_bellkeeper']),
    ];
  }

  // ---------------------------------------------------------------- VS
  /**
   * Who meets whom, before a game: the opponent on top, you at the bottom (as on the board), a clock hand
   * between, and who moves first. Tap to skip. `done` runs when it goes away.
   */
  versus(me: VsSide, foe: VsSide, done: () => void, ms = 2300) {
    let gone = false;
    const plate = (s: VsSide, side: 'you' | 'foe') => {
      const t = s.tierRating !== undefined ? tierOf(s.tierRating).tier : null;
      return h('div', { class: `vs-plate ${side}` },
        h('b', {}, s.name),
        t ? h('div', { class: 'tr', style: `color:${t.color}` }, h('span', { class: 'tier-badge', style: `--tier:${t.color}` }, h('i', {})), t.name, h('span', { class: 'num' }, fmt(s.tierRating!))) : null,
        ribbon(s.title),
        s.deck ? h('small', {}, `デッキ：${s.deck}`) : null);
    };
    const half = (s: VsSide, side: 'you' | 'foe') => h('div', { class: `half ${side}` },
      h('div', { class: 'vs-card2' }, h('img', { src: cardImg(s.card), alt: '' })),
      h('div', { class: 'vs-order' }, s.first ? '先手' : '後手'));
    const close = () => { if (gone) return; gone = true; el.style.transition = 'opacity .25s'; el.style.opacity = '0'; setTimeout(() => { el.remove(); done(); }, 250); };
    const el = h('div', { class: 'versus', onclick: close, role: 'dialog', 'aria-label': `${me.name} 対 ${foe.name}` },
      half(foe, 'foe'), half(me, 'you'), plate(foe, 'foe'), plate(me, 'you'),
      h('i', { class: 'vs-line' }),
      h('div', { class: 'vs-medal' }, h('span', {}, h('b', {}, 'VS'))),
      h('div', { class: 'vs-foot' }, '時計が遅れている方が行動します'));
    audio.play('bell');
    this.host.root.append(el);
    setTimeout(close, ms);
  }

  // ---------------------------------------------------------------- rated play
  rated() {
    const decks = store.allDecks();
    let mine = decks.find((d) => d.id === store.settings.lastDeck && d.valid) ?? decks.find((d) => d.valid) ?? decks[0];
    const render = () => {
      const r = store.rated;
      const t = tierOf(r.rating);
      const deckOpts = decks.map((d) => h('button', { class: 'opt', 'aria-pressed': String(d.id === mine.id), disabled: !d.valid, onclick: () => { mine = d; audio.play('select'); render(); } },
        h('div', {}, h('div', { class: 'nm' }, d.name), h('div', { class: 'ds' }, d.blurb ?? `${d.cards.length}枚・自作デッキ`)), !d.valid ? h('span', { class: 'badge' }, d.missing.length ? '未所持あり' : '未完成') : null));
      const hist = r.history.slice(0, 8).map((g) => h('div', { class: `rh ${g.score === 1 ? 'w' : g.score === 0 ? 'l' : 'd'}` },
        h('b', {}, g.score === 1 ? '勝' : g.score === 0 ? '敗' : '分'), h('span', { class: 'foe' }, g.foe ? `${g.foe}（${g.foeRating}）` : '対戦相手'), h('span', { class: 'dl' }, `${g.after - g.before >= 0 ? '+' : ''}${g.after - g.before}`), h('span', { class: 'rt' }, String(g.after))));
      this.page('レート戦', () => this.battleTab(), [
        h('div', { class: 'rated-card', style: `--tier:${t.tier.color}` },
          tierBadge(t.tier, 'lg'),
          h('div', { class: 'rating' }, h('small', {}, 'RATING'), h('b', {}, String(r.rating))),
          h('div', { class: 'progress tier-prog' }, h('i', { style: `width:${t.next ? (t.into / t.span) * 100 : 100}%` })),
          h('div', { class: 'small' }, t.next ? `次の段位「${t.next.name}」まで ${t.next.min - r.rating}` : '最高段位', `　・　最高 ${r.peak}　・　${r.games}戦${r.wins}勝`)),
        h('ul', { class: 'earn' },
          h('li', {}, 'レートの近い相手とマッチングします。段位が上がるほど手強い相手が待っています'),
          h('li', {}, '自分よりレートの高い相手に勝つほど大きく上がり、低い相手に負けるほど大きく下がります'),
          h('li', {}, `はじめの${PLACEMENT_GAMES}戦は変動が大きくなります`),
          h('li', {}, '1手45秒の持ち時間があります。降参・途中でアプリを閉じた場合は敗北になります')),
        h('div', { class: 'sec-title' }, 'デッキ'), h('div', { class: 'opt-list' }, ...deckOpts),
        h('button', { class: 'hexbtn gold big', disabled: !mine.valid, onclick: () => { store.settings.lastDeck = mine.id; store.saveSettings(); audio.play('summon'); this.host.startRated(mine); } }, 'レート戦を開始'),
        hist.length ? h('div', { class: 'sec-title' }, '最近の結果') : null,
        hist.length ? h('div', { class: 'rhist' }, ...hist) : null,
      ], [h('button', { class: 'chip-btn gold', onclick: () => this.ranking(() => this.rated()) }, 'ランキング')]);
    };
    render();
  }

  /** Friends' ranking: gold, silver and bronze rows, the place the day before, and your own row pinned at the bottom. */
  ranking(back: () => void) {
    const board = h('div', { class: 'rk2' });
    const pin = h('div', { class: 'rk-pin' });
    const note = h('p', { class: 'shop-note' });
    const row = (place: number, r: { name: string; rating: number; prev?: number | null; title?: string; fav?: string; me?: boolean }) => {
      const t = tierOf(r.rating).tier;
      const prev = r.prev ?? null;
      const move = prev === null ? h('small', {}, '前日 ―') : h('small', {}, `前日${prev}位 `, h('em', { class: prev > place ? 'up' : prev < place ? 'down' : 'flat' }, prev > place ? '↑' : prev < place ? '↓' : '→'));
      const rising = prev !== null && prev - place >= 5;
      const sfx = place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th';
      return h('div', { class: `rkrow${r.me ? ' me' : ''}${place <= 3 && !r.me ? ` top${place}` : ''}` },
        h('div', { class: 'pl' }, String(place), h('sup', {}, sfx), move),
        h('div', { class: 'av', style: artStyle(r.fav && CARDS[r.fav] ? r.fav : 'gear') }),
        h('div', { class: 'nm' }, h('b', {}, r.name, r.me ? h('span', { class: 'you-tag' }, 'あなた') : null),
          h('div', { class: 'sub' }, h('span', { class: 'tier-badge', style: `--tier:${t.color}` }, h('i', {}), h('b', {}, t.name)), ribbon(r.title))),
        h('div', { class: 'rt' }, rising ? h('span', { class: 'rise' }, '急上昇') : h('small', {}, 'レート'), h('br', {}), h('span', {}, fmt(r.rating))));
    };
    const load = async () => {
      if (!rankingAvailable()) { board.replaceChildren(h('p', { class: 'empty-note' }, 'オンラインのサーバーが設定されていないため、ランキングは表示できません。レートはこの端末に記録されます。')); return; }
      board.replaceChildren(h('p', { class: 'empty-note' }, '読み込み中…'));
      await syncRated();
      const res = await fetchRanking();
      if (!board.isConnected) return;
      if (!res) { board.replaceChildren(h('p', { class: 'empty-note' }, 'ランキングを読み込めませんでした。通信状況を確かめて、あとでもう一度開いてください。')); return; }
      board.replaceChildren(...(res.top.length ? res.top.map((r, i) => row(i + 1, r)) : [h('p', { class: 'empty-note' }, 'まだ誰もレート戦をしていません。最初の1人になろう。')]));
      pin.replaceChildren(...(res.me ? [row(res.me.place, res.me)] : []));
      const unsent = store.rated.outbox.length;
      note.textContent = `参加者 ${res.total}人 ・ 前日の順位は、その日に最後に見たときの順位です${unsent ? ` ・ 未送信の結果 ${unsent}件` : ''}`;
    };
    this.page('ランキング', back, [board, note, pin], rankingAvailable() ? [h('button', { class: 'chip-btn', onclick: () => void load() }, '更新')] : []);
    void load();
  }

  /**
   * Matchmaking: a short search, then the VS screen. The wait is a few seconds, like finding a player online;
   * cancelling during the search does not count as a game.
   */
  matching(o: Opponent, deck: DeckDef, start: (first: 0 | 1) => void, cancel: () => void) {
    const me = store.rated;
    let cancelled = false;
    const secs = h('span', {}, '0');
    const t0 = performance.now();
    const tick = window.setInterval(() => { secs.textContent = String(Math.floor((performance.now() - t0) / 1000)); }, 250);
    const stop = () => clearInterval(tick);
    const search = h('div', { class: 'screen dim title' }, h('div', { class: 'panel wait matching' },
      h('div', { class: 'radar', 'aria-hidden': 'true' }, h('i', {}), h('i', {}), h('i', {})),
      h('h2', {}, '対戦相手を探しています'),
      h('p', { class: 'small' }, `レート ${me.rating} 付近 ・ 経過 `, secs, ' 秒'),
      h('button', { class: 'btn small', onclick: () => { cancelled = true; stop(); cancel(); } }, 'やめる')));
    this.mount(search);
    const wait = 1800 + Math.random() * 3800;
    setTimeout(() => {
      if (cancelled || !search.isConnected) return;
      stop();
      const first = (Math.random() < 0.5 ? 0 : 1) as 0 | 1;
      // the opponent's featured card and title: each rival always shows the same ones
      const foeCard = o.card ?? 'dragon';
      const foeTitle = o.title;
      this.clear();
      this.versus(
        { name: store.settings.name || 'あなた', card: favCard(), first: first === 0, tierRating: me.rating, title: shownTitle()?.id, deck: deck.name },
        { name: o.name, card: foeCard, first: first === 1, tierRating: o.rating, title: foeTitle },
        () => { if (!cancelled) start(first); }, 2400);
    }, wait);
  }

  // ---------------------------------------------------------------- battle tab
  battleTab() {
    const flow = this.host.flow();
    const rt = store.rated, tr = tierOf(rt.rating);
    const today = localDate();
    const won = store.wallet.dailyWin === today;
    const tile = (title: string, en: string, emblem: string, sub: string, fn: (() => void) | null) =>
      h('button', { class: 'mtile', disabled: !fn, onclick: () => { if (!fn) return; audio.play('select'); fn(); } },
        h('span', {}, h('span', { class: 'em', html: emblem }), h('span', { class: 'pl' }, h('b', {}, title), h('small', {}, en)), h('span', { class: 'st' }, sub)));
    const E = {
      rated: '<svg viewBox="0 0 118 128" fill="none"><path d="M59 4l52 30v60l-52 30-52-30V34z" fill="#c99640"/><path d="M59 12l45 26v52l-45 26-45-26V38z" fill="#0f3a35"/><path d="M59 20l38 22v44l-38 22-38-22V42z" stroke="#5fd0b5" stroke-width="2"/><circle cx="59" cy="64" r="24" stroke="#e0b25c" stroke-width="2"/><path d="M59 64V46M59 64l13 8" stroke="#fff3d4" stroke-width="3" stroke-linecap="round"/><circle cx="59" cy="64" r="3.5" fill="#e0b25c"/><path d="M59 0l4 7h-8z" fill="#fff3d4"/></svg>',
      free: '<svg viewBox="0 0 118 118" fill="none"><g fill="#c99640"><rect x="54" y="2" width="10" height="18" rx="2"/><rect x="54" y="98" width="10" height="18" rx="2"/><rect x="2" y="54" width="18" height="10" rx="2"/><rect x="98" y="54" width="18" height="10" rx="2"/><rect x="54" y="2" width="10" height="18" rx="2" transform="rotate(45 59 59)"/><rect x="54" y="2" width="10" height="18" rx="2" transform="rotate(-45 59 59)"/><rect x="54" y="98" width="10" height="18" rx="2" transform="rotate(45 59 59)"/><rect x="54" y="98" width="10" height="18" rx="2" transform="rotate(-45 59 59)"/></g><circle cx="59" cy="59" r="42" fill="#c99640"/><circle cx="59" cy="59" r="34" fill="#13323b"/><circle cx="59" cy="59" r="26" stroke="#e0b25c" stroke-width="1.5" stroke-dasharray="2 4"/><path d="M44 74l30-30M74 74L44 44" stroke="#fff3d4" stroke-width="4" stroke-linecap="round"/></svg>',
      friend: '<svg viewBox="0 0 130 100" fill="none"><circle cx="46" cy="50" r="36" fill="#0f3a35" stroke="#5fd0b5" stroke-width="4"/><circle cx="84" cy="50" r="36" fill="#3a1a14" fill-opacity=".85" stroke="#e9674f" stroke-width="4"/><path d="M46 50V28M46 50l12 8" stroke="#b9ffe9" stroke-width="3" stroke-linecap="round"/><path d="M84 50V26M84 50l-11 9" stroke="#ffd0c4" stroke-width="3" stroke-linecap="round"/><path d="M65 20a36 36 0 010 60" stroke="#c99640" stroke-width="5"/></svg>',
      guide: '<svg viewBox="0 0 120 100" fill="none"><path d="M8 22c18-6 34-6 52 4v66c-18-10-34-10-52-4z" fill="#13323b" stroke="#c99640" stroke-width="3"/><path d="M112 22c-18-6-34-6-52 4v66c18-10 34-10 52-4z" fill="#13323b" stroke="#c99640" stroke-width="3"/><circle cx="86" cy="52" r="15" stroke="#e0b25c" stroke-width="2"/><path d="M86 52v-9M86 52l6 4" stroke="#fff3d4" stroke-width="2.4" stroke-linecap="round"/><path d="M20 40h28M20 52h28M20 64h20" stroke="#8fa9ad" stroke-width="2"/></svg>',
    };
    const r = store.record, o = store.onlineRecord;
    this.hub('battle', h('div', { class: 'tab-page' },
      h('div', { class: 'mode-head' }, h('i', {}), h('div', {}, h('b', {}, 'バトル'), h('small', {}, 'BATTLE')), h('i', {})),
      h('div', { class: 'modes' },
        tile('レート戦', 'RATED', E.rated, `${tr.tier.name} ・ ${fmt(rt.rating)}`, () => this.rated()),
        tile('フリー対戦', 'FREE', E.free, `AIの強さを選んで練習 ・ ${r.win}勝${r.lose}敗`, () => this.setup()),
        tile('フレンド対戦', 'FRIEND', E.friend, flow.available ? `あいことば・招待・観戦 ・ ${o.win}勝${o.lose}敗` : '準備中', flow.available ? () => this.onlineMenu() : null),
        tile('遊び方', 'GUIDE', E.guide, 'ルールと操作をおさらい', () => this.rules(() => this.battleTab()))),
      h('div', { class: `first-win${won ? ' done' : ''}` }, h('b', {}, '今日の初勝利'), won ? '受け取りました。また明日' : h('span', {}, `コイン `, h('span', { class: 'num', style: 'color:var(--gold)' }, `+${DAILY_BONUS}`), ` ・ 対戦の報酬は1日${DAILY_MATCH_CAP}コインまで`)),
    ));
  }

  // ---------------------------------------------------------------- menu tab
  menuTab() {
    const m = store.meta;
    const tile = (label: string, icon: string, fn: () => void, badge = 0) => h('button', { class: 'mtile2', onclick: () => { audio.play('select'); fn(); } },
      h('span', { class: 'ic', html: icon }), h('span', {}, label), countBadge(badge));
    this.hub('menu', h('div', { class: 'tab-page' },
      h('div', { class: 'mode-head' }, h('i', {}), h('div', {}, h('b', {}, 'その他'), h('small', {}, 'MENU')), h('i', {})),
      h('div', { class: 'menu-grid2' },
        tile('プロフィール', ICON.user, () => this.profile(), newTitles().length),
        tile('カード図鑑', ICON.book, () => this.collection()),
        tile('ミッション', ICON.mission, () => this.missions('daily'), claimable(m, localDate())),
        tile('プレゼント', ICON.gift, () => this.presents(), m.presents.length),
        tile('お知らせ', ICON.news, () => this.newsModal(), unreadNews(m)),
        tile('ランキング', ICON.trophy, () => this.ranking(() => this.menuTab())),
        tile('遊び方', ICON.help, () => this.rules(() => this.menuTab())),
        tile('攻略wiki', ICON.wiki, openWiki),
        tile('設定', ICON.gear, () => this.settings(() => this.menuTab())),
        tile('タイトルへ', ICON.door, () => this.title())),
      h('div', { class: 'ver' }, `クロノ・デュエル Ver. ${VERSION}`)));
  }

  // ---------------------------------------------------------------- modals and sheets
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
  /** A brass sheet over the current screen (presents, pickers, confirmations). */
  private sheet(title: string, icon: string | null, body: (HTMLElement | null)[], foot: (HTMLElement | null)[] = [], onClose?: () => void) {
    const close = () => { wrap.classList.add('out'); setTimeout(() => { wrap.remove(); onClose?.(); }, 160); };
    const bodyEl = h('div', { class: 'sheet-body' }, ...body);
    const footEl = foot.some(Boolean) ? h('div', { class: 'sheet-foot' }, ...foot) : null;
    const wrap = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
      h('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
        h('div', { class: 'sheet-head' }, icon ? h('span', { class: 'ic', html: icon }) : null, h('h2', {}, title), h('button', { class: 'round-btn', 'aria-label': '閉じる', onclick: close, html: ICON.close })),
        bodyEl, footEl));
    this.host.root.append(wrap);
    return { wrap, close, body: bodyEl, foot: footEl };
  }
  private refreshHub() { if (this.host.root.querySelector('.hub')) this.openTab(this.tab); }
  private grant(p: Prize, from: string) {
    if (p.coins) store.wallet.coins += p.coins;
    if (p.tickets) store.wallet.tickets += p.tickets;
    store.saveWallet(); store.saveMeta();
    audio.play('coin');
    this.toast(`${from}：${prizeText(p)}を受け取りました`);
  }
  toast(text: string) {
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
    ], { cls: 'login', onClose: () => this.refreshHub(), foot: [h('button', { class: 'btn primary', onclick: () => { close(); setTimeout(() => this.presents(), 200); } }, 'プレゼントを受け取る'), h('button', { class: 'btn', onclick: () => close() }, '閉じる')] });
  }

  // ---------------------------------------------------------------- missions
  /** Where a mission is played (tapping an unfinished tile goes there). */
  private missionGo(stat: Stat): (() => void) | null {
    const flow = this.host.flow();
    switch (stat) {
      case 'pack': return () => this.packShop(PACKS[0]);
      case 'deck': return () => this.decks();
      case 'hardWin': return () => this.setup('hard');
      case 'online': return flow.available ? () => this.onlineMenu() : null;
      default: return () => this.battleTab();
    }
  }
  missionsModal(tab: 'daily' | 'beginner') { this.missions(tab); }
  missions(tab: 'daily' | 'beginner', back?: () => void) {
    const m = store.meta;
    const today = localDate();
    let cur = tab;
    let stamped = '';
    const leave = back ?? (() => this.openTab(this.tab));
    const reward = (p: Prize) => p.tickets
      ? h('span', { class: 'rw tk' }, h('span', { class: 'ic-ticket' }), `チケット ${p.tickets}`)
      : h('span', { class: 'rw' }, h('span', { class: 'ic-coin' }), `コイン ${p.coins}`);
    const tileOf = (v: MissionView) => {
      const ready = v.done && !v.claimed;
      const go = !v.done ? this.missionGo(v.m.stat) : null;
      return h('button', { class: `mt${ready ? ' ready' : ''}${v.claimed ? ' claimed' : ''}`, onclick: () => {
        if (ready) { const p = claimMission(m, v.m.id, today); if (p) { stamped = v.m.id; this.grant(p, 'ミッション'); render(); } return; }
        if (go) { audio.play('select'); go(); }
      } },
        reward(v.m.prize),
        h('p', {}, v.m.text),
        ready ? h('span', { class: 'hexbtn gold' }, '受け取る') : h('div', { class: 'bar2' }, h('u', { style: `width:${(v.now / v.m.goal) * 100}%` }), h('span', {}, `${v.now}/${v.m.goal}`)),
        v.claimed ? h('i', { class: `seal${stamped === v.m.id ? ' fresh' : ''}` }, h('b', {}, '達成'), h('small', {}, 'DONE')) : null);
    };
    const render = () => {
      const dv = dailyView(m, today), bv = beginnerView(m);
      const allDone = dv.every((x) => x.claimed), allGot = m.dailyClaimed.includes('all');
      const dReady = dv.filter((x) => x.done && !x.claimed).length + (allDone && !allGot ? 1 : 0);
      const bReady = bv.filter((x) => x.done && !x.claimed).length;
      const total = BEGINNER_TOTAL();
      const got = bv.filter((x) => x.claimed).length;
      const banner = cur === 'daily'
        ? h('div', { class: 'ms-banner' }, h('span', { html: '<svg viewBox="0 0 120 120" fill="none"><circle cx="60" cy="60" r="52" stroke="#f4d692" stroke-width="3"/><path d="M60 60V22M60 60l24 14" stroke="#f4d692" stroke-width="5" stroke-linecap="round"/></svg>' }),
          h('b', {}, '今日のミッション'), h('span', {}, `ぜんぶ達成で さらにコイン `, h('span', { class: 'num' }, String(DAILY_ALL_BONUS.coins))),
          h('div', { class: 'prog' }, h('i', {}, h('u', { style: `width:${(dv.filter((x) => x.done).length / dv.length) * 100}%` })), h('span', { class: 'num' }, `${dv.filter((x) => x.done).length}/${dv.length}`)))
        : h('div', { class: 'ms-banner' }, h('span', { html: '<svg viewBox="0 0 120 120" fill="none"><circle cx="60" cy="60" r="52" stroke="#f4d692" stroke-width="3"/><path d="M60 60V22M60 60l24 14" stroke="#f4d692" stroke-width="5" stroke-linecap="round"/></svg>' }),
          h('b', {}, 'はじめてのミッション'), h('span', {}, 'ぜんぶで コイン ', h('span', { class: 'num' }, String(total.coins)), ' ・ チケット ', h('span', { class: 'num' }, String(total.tickets)), '枚'),
          h('div', { class: 'prog' }, h('i', {}, h('u', { style: `width:${(got / bv.length) * 100}%` })), h('span', { class: 'num' }, `${got}/${bv.length}`)));
      const tiles = cur === 'daily'
        ? [...dv.map(tileOf), h('button', { class: `mt mt-all${allDone && !allGot ? ' ready' : ''}${allGot ? ' claimed' : ''}`, onclick: () => { const p = claimMission(m, 'all', today); if (p) { stamped = 'all'; this.grant(p, 'ミッション'); render(); } } },
            h('p', {}, h('b', {}, 'デイリーをすべて達成'), h('br', {}), h('small', { class: 'muted' }, `報酬：${prizeText(DAILY_ALL_BONUS)}`)),
            allGot ? h('i', { class: `seal${stamped === 'all' ? ' fresh' : ''}`, style: 'top:-2px;right:10px;width:60px;height:60px' }, h('b', { style: 'font-size:16px' }, '達成'), h('small', {}, 'DONE')) : h('span', { class: `hexbtn ${allDone ? 'gold' : ''}` }, allDone ? '受け取る' : '挑戦中'))]
        : bv.map(tileOf);
      this.page('ミッション', leave, [
        h('div', { class: 'seg2' },
          h('button', { 'aria-pressed': String(cur === 'daily'), onclick: () => { cur = 'daily'; render(); } }, 'デイリー', countBadge(dReady)),
          h('button', { 'aria-pressed': String(cur === 'beginner'), onclick: () => { cur = 'beginner'; render(); } }, 'はじめて', countBadge(bReady))),
        banner,
        h('div', { class: 'mgrid' }, ...tiles),
        h('p', { class: 'shop-note' }, cur === 'daily' ? '毎日0時（端末の時刻）に新しいミッションに入れ替わります。タイルを押すと、その場所へ移動します。' : 'タイルを押すと、その場所へ移動します。'),
      ]);
    };
    render();
  }

  // ---------------------------------------------------------------- presents
  presentsModal() { this.presents(); }
  presents() {
    const m = store.meta;
    const seen = m.presentsSeen ?? 0;
    m.presentsSeen = m.seq; store.saveMeta();
    let cur: 'box' | 'log' = 'box';
    const icon = (p: Prize) => h('span', { class: 'ic' }, h('span', { class: p.tickets ? 'ic-ticket' : 'ic-coin' }), h('span', { class: 'q' }, p.tickets ? `×${p.tickets}` : `×${p.coins}`));
    const ref = this.sheet('プレゼント', ICON.gift, [], [], () => this.refreshHub());
    const render = () => {
      const tabs = h('div', { class: 'seg2' },
        h('button', { 'aria-pressed': String(cur === 'box'), onclick: () => { cur = 'box'; render(); } }, '未受け取り', countBadge(m.presents.length)),
        h('button', { 'aria-pressed': String(cur === 'log'), onclick: () => { cur = 'log'; render(); } }, '受け取り履歴'));
      const list = cur === 'box'
        ? (m.presents.length ? m.presents.map((p) => h('div', { class: 'item' },
            Number(p.id.slice(1)) > seen ? newTag('red') : null,
            icon(p.prize),
            h('div', { class: 'tx' }, h('b', {}, p.text), h('small', {}, `${p.from} ・ ${p.at}`)),
            h('button', { class: 'hexbtn gold', onclick: () => { this.grant(claimPresents(m, [p.id], localDate()), 'プレゼント'); render(); } }, '受け取る'))) : [h('p', { class: 'empty' }, '受け取れるプレゼントはありません')])
        : ((m.presentLog ?? []).length ? (m.presentLog ?? []).map((p) => h('div', { class: 'item got' }, icon(p.prize), h('div', { class: 'tx' }, h('b', {}, p.text), h('small', {}, `${p.from} ・ 受け取り ${p.got || p.at}`)))) : [h('p', { class: 'empty' }, 'まだ受け取ったプレゼントはありません')]);
      ref.body.replaceChildren(tabs, ...list);
      const foot = ref.wrap.querySelector('.sheet') as HTMLElement;
      foot.querySelector('.sheet-foot')?.remove();
      if (cur === 'box') foot.append(h('div', { class: 'sheet-foot' },
        h('small', {}, 'プレゼントに期限はありません'),
        h('button', { class: 'hexbtn gold big', disabled: !m.presents.length, onclick: () => { if (!m.presents.length) return; this.grant(claimPresents(m, undefined, localDate()), 'プレゼント'); render(); } }, '一括受け取り')));
    };
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
    ref = this.modal('お知らせ', [], { onClose: () => this.refreshHub() });
    list();
  }

  // ---------------------------------------------------------------- profile
  profileModal() { this.profile(); }
  profile(back?: () => void) {
    const m = store.meta;
    const leave = back ?? (() => this.openTab(this.tab));
    const render = () => {
      const rk = rankOf(m.exp);
      const r = store.record, o = store.onlineRecord;
      const wins = r.win + o.win, games = r.win + r.lose + r.draw + o.win + o.lose + o.draw;
      const t = tierOf(store.rated.rating).tier;
      const fav = favCard();
      const title = shownTitle();
      const COLORS = ['#e0b25c', '#5fd0b5', '#c9a8ff', '#8fa9ad'];
      const ringOf = (label: string, shares: ReturnType<typeof deckShares>, n: number) => {
        let at = 0;
        const stops = shares.map((s, i) => { const a = at; at += s.share * 100; return `${COLORS[i % COLORS.length]} ${a}% ${at}%`; }).join(',');
        return h('div', { class: 'ring' }, h('div', { class: 'donut', style: `background:${shares.length ? `conic-gradient(${stops})` : '#16303d'}` }, h('span', {}, h('b', {}, String(n)), h('small', {}, '戦'))), h('small', {}, label));
      };
      const recent = recentShares(m, 20), total = deckShares(m.deckUse ?? {});
      const nRecent = Math.min(20, (m.history ?? []).length), nTotal = total.reduce((a, s) => a + s.n, 0);
      const legendRows = (recent.length ? recent : total).map((s, i) => h('div', {}, h('i', { style: `background:${COLORS[i % COLORS.length]}` }), h('span', {}, s.name), h('b', { class: 'num' }, `${Math.round(s.share * 100)}%`)));
      const editName = () => {
        let name = store.settings.name;
        const input = h('input', { class: 'text', maxlength: String(NET.NAME_MAX), value: name, oninput: (e: Event) => { name = (e.target as HTMLInputElement).value; } });
        const s = this.sheet('名前を変える', ICON.pen, [h('p', { class: 'shop-note' }, `オンライン対戦とランキングで表示されます（${NET.NAME_MAX}文字まで）`), input],
          [h('button', { class: 'hexbtn gold', onclick: () => { store.settings.name = cleanName(name); store.saveSettings(); void syncRated(); s.close(); render(); } }, '決定')]);
        setTimeout(() => input.focus(), 50);
      };
      const editComment = () => {
        let text = m.comment ?? '';
        const input = h('textarea', { class: 'text', maxlength: '40', rows: '3', style: 'font:14px var(--f-body);min-height:80px', oninput: (e: Event) => { text = (e.target as HTMLTextAreaElement).value; } }, text);
        const s = this.sheet('ひとこと', ICON.pen, [h('p', { class: 'shop-note' }, '40文字まで。プロフィールに表示されます'), input],
          [h('button', { class: 'hexbtn gold', onclick: () => { m.comment = text.replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, 40); store.saveMeta(); s.close(); render(); } }, '決定')]);
        setTimeout(() => input.focus(), 50);
      };
      this.page('プロフィール', leave, [
        h('div', { class: 'pn prof2-wrap' },
          h('div', { class: 'prof2' },
            h('button', { class: 'favcard', onclick: () => this.favPicker(render) }, h('img', { src: cardImg(fav), alt: cardDef(fav).name }), h('span', {}, '看板カード')),
            h('div', { class: 'pside' },
              h('div', { class: 'prof-line' }, h('div', { class: 'pname' }, h('small', {}, 'PLAYER NAME'), h('b', {}, store.settings.name || 'プレイヤー')), h('button', { class: 'round-btn', 'aria-label': '名前を変える', onclick: editName, html: ICON.pen })),
              h('div', { class: 'prof-line' }, title ? ribbon(title.id) : h('span', { class: 'muted', style: 'font-size:12px' }, '称号なし'), h('button', { class: 'round-btn', 'aria-label': '称号を変える', onclick: () => this.titlePicker(render), html: ICON.swap }, newTitles().length ? h('i', { class: 'badge-dot', style: 'top:-2px;right:-2px' }) : null)),
              h('div', { class: 'prof-line' }, h('div', { class: 'comment' }, m.comment || h('span', { class: 'muted' }, 'ひとことを書けます')), h('button', { class: 'round-btn', 'aria-label': 'ひとことを変える', onclick: editComment, html: ICON.pen }))))),
        h('div', { class: 'two' },
          h('div', { class: 'pn lvbox' }, h('span', { class: 'hd' }, 'プレイヤーランク'),
            h('div', { class: 'big' }, h('span', { class: 'num muted', style: 'font-size:11px' }, 'Lv.'), h('b', {}, String(rk.rank))),
            h('div', { class: 'bar' }, h('i', { style: `width:${(rk.into / rk.need) * 100}%` })),
            h('div', { class: 'muted', style: 'font-size:10px;text-align:right;margin-top:3px' }, `次まで ${rk.need - rk.into} EXP`)),
          h('button', { class: 'pn', style: `--tier:${t.color};text-align:left;color:inherit;border:1px solid #2d6070`, onclick: () => this.rated() }, h('span', { class: 'hd' }, 'レート戦'),
            h('div', { class: 'rtbox' }, h('span', { class: 'hex' }), h('div', {}, h('span', {}, t.name), h('b', {}, fmt(store.rated.rating)))),
            h('div', { class: 'muted', style: 'font-size:10px;margin-top:4px' }, `最高 ${fmt(store.rated.peak)} ・ ${store.rated.wins}勝 ${store.rated.games - store.rated.wins}敗`))),
        h('div', { class: 'pn' }, h('span', { class: 'hd' }, '戦績'),
          h('div', { class: 'stat3' },
            h('div', {}, h('b', {}, String(games)), h('span', {}, '対戦数')),
            h('div', {}, h('b', {}, games ? `${Math.round((wins / games) * 100)}%` : '―'), h('span', {}, '勝率')),
            h('div', {}, h('b', {}, `${setProgressAll().pct}%`), h('span', {}, 'カード収集')))),
        h('div', { class: 'pn' }, h('span', { class: 'hd' }, 'よく使うデッキ'),
          nTotal ? h('div', { class: 'rings' }, ringOf(`最近${nRecent}戦`, recent, nRecent), ringOf('累計', total, nTotal), h('div', { class: 'legend' }, ...legendRows))
            : h('p', { class: 'empty-note' }, '対戦すると、よく使うデッキがここに表示されます')),
        h('div', { class: 'btn-row' },
          h('button', { class: 'hexbtn', onclick: () => this.historySheet() }, '戦歴'),
          h('button', { class: 'hexbtn', onclick: () => this.titlePicker(render) }, '称号', newTitles().length ? newTag() : null),
          h('button', { class: 'hexbtn', onclick: () => this.favPicker(render) }, '看板カード')),
      ]);
    };
    render();
  }
  private historySheet() {
    const hs = store.meta.history ?? [];
    const label = { free: 'フリー', rated: 'レート', online: 'フレンド' } as const;
    const ago = (at: number) => { const d = new Date(at); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    this.sheet('戦歴', ICON.trophy, hs.length ? [h('div', { class: 'hist' }, ...hs.map((x) => h('div', { class: `hist-row ${x.result}` },
      h('b', {}, x.result === 'win' ? '勝' : x.result === 'lose' ? '敗' : '分'),
      h('span', {}, `${x.foe} ・ ${x.deck}`),
      h('small', {}, `${label[x.mode]} ・ ${ago(x.at)}`))))] : [h('p', { class: 'empty' }, 'まだ対戦の記録がありません')]);
  }
  private titlePicker(done: () => void) {
    const got = myTitles();
    const m = store.meta;
    const fresh = new Set(newTitles());
    m.titlesSeen = [...new Set([...(m.titlesSeen ?? []), ...got])]; store.saveMeta();
    const cur = shownTitle()?.id ?? '';
    const ref = this.sheet('称号', ICON.star, [
      h('p', { class: 'shop-note' }, `${got.length}/${TITLES.length} 獲得 ・ 選んだ称号は名前の下と対戦相手の画面に表示されます`),
      h('div', { class: 'title-list' },
        h('button', { class: 'title-item', 'aria-pressed': String(!cur), onclick: () => { m.title = '-'; store.saveMeta(); ref.close(); done(); } }, h('span', { class: 'ribbon', style: 'background:#16303d;color:#8fa9ad' }, 'つけない'), h('small', {}, '称号を表示しない')),
        ...TITLES.map((t) => {
          const has = got.includes(t.id);
          return h('button', { class: `title-item${has ? '' : ' locked'}`, 'aria-pressed': String(cur === t.id), 'aria-disabled': has ? undefined : 'true', onclick: () => { if (!has) return; m.title = t.id; store.saveMeta(); audio.play('select'); ref.close(); done(); void syncRated(); } },
            ribbon(t.id), h('small', {}, has ? t.how : `未獲得：${t.how}`), fresh.has(t.id) ? newTag() : null);
        })),
    ], [], done);
  }
  private favPicker(done: () => void) {
    const m = store.meta;
    const owned = CARD_LIST.filter((c) => ownedCount(store.wallet, c.id) > 0).sort((a, b) => RANK[b.rarity] - RANK[a.rarity] || b.cost - a.cost);
    const ref = this.sheet('看板カード', ICON.star, [
      h('p', { class: 'shop-note' }, 'ホームと対戦相手の画面に表示されます'),
      h('div', { class: 'fav-grid' }, ...owned.map((c) => h('button', { class: `tile${favCard() === c.id ? ' picked' : ''}`, 'aria-label': `${c.name}を看板カードにする`, onclick: () => {
        m.favorite = c.id; store.saveMeta(); audio.play('select'); ref.close(); done(); void syncRated();
      } }, h('img', { src: cardImg(c.id), alt: c.name, loading: 'lazy' })))),
    ], [], done);
  }

  // ---------------------------------------------------------------- card detail
  zoomCard(id: string, after?: () => void) { this.cardDetail(id, { onClose: after }); }
  /**
   * The full card: big, with its numbers, its text and the keyword help, a way through the list it came from
   * (arrows or a swipe) and, in the deck editor, −/＋ to put it in or take it out. 欠片 craft it here.
   */
  cardDetail(id: string, opts: { list?: string[]; deck?: { count(id: string): number; max(id: string): number; add(id: string): void; remove(id: string): void }; onClose?: () => void } = {}) {
    const list = opts.list && opts.list.includes(id) ? opts.list : [id];
    let i = list.indexOf(id);
    let tab: 'text' | 'info' = 'text';
    const el = h('div', { class: 'cdx', role: 'dialog' });
    const close = () => { el.remove(); opts.onClose?.(); };
    const render = () => {
      const cid = list[i];
      const d = cardDef(cid);
      const w = store.wallet;
      const own = ownedCount(w, cid);
      const rc = RARE_COLOR[d.rarity];
      const kws = keywordsOf(d).filter((k) => KEYWORD_HELP[k]);
      const isFav = favCard() === cid;
      const block = craftable(cid) ? craftBlock(w, cid) : null;
      const cost = CRAFT_COST[d.rarity];
      const dk = opts.deck;
      const textBox = tab === 'text'
        ? h('div', { class: 'cdx-text' }, h('div', {}, d.text || '能力なし'), d.resvText ? h('div', { class: 'resv' }, `予約時：${d.resvText}`) : null,
            ...kws.map((k) => h('div', { class: 'kwnote' }, h('b', {}, k), ` … ${KEYWORD_HELP[k]}`)))
        : h('div', { class: 'cdx-text' }, d.flavor ? h('div', { class: 'flavor' }, d.flavor) : null,
            h('div', { class: 'kwnote' }, `収録：${SET_NAMES[setOf(d)]} ・ ${RARITY_NAMES[d.rarity]}`),
            setOf(d) !== 'base' ? h('div', { class: 'kwnote' }, `欠片で作る：${CRAFT_COST[d.rarity]} ・ 上限を超えて出ると欠片 ${DUPE_SHARDS[d.rarity]}`) : h('div', { class: 'kwnote' }, '基本カードは最初から2枚ずつ使えます'));
      el.style.setProperty('--glow', `${rc}55`);
      el.style.setProperty('--rc', rc);
      el.replaceChildren(h('div', { class: 'cdx-in' },
        h('div', { class: 'cdx-top' },
          h('button', { class: 'round-btn', 'aria-label': isFav ? '看板カード' : '看板カードにする', style: isFav ? 'color:#ffd66e;border-color:#ffd66e' : '', onclick: () => { store.meta.favorite = cid; store.saveMeta(); this.toast(`「${d.name}」を看板カードにしました`); render(); void syncRated(); }, html: ICON.star }),
          h('button', { class: 'round-btn', 'aria-label': '閉じる', onclick: close, html: ICON.close })),
        h('div', { class: 'cdx-card' },
          h('button', { class: 'arw l', 'aria-label': '前のカード', disabled: i === 0, onclick: () => { i--; render(); }, html: ICON.chev }),
          h('img', { src: cardImg(cid), alt: d.name }),
          h('button', { class: 'arw', 'aria-label': '次のカード', disabled: i >= list.length - 1, onclick: () => { i++; render(); }, html: ICON.chev })),
        list.length > 1 ? h('div', { class: 'pos' }, '左右にスワイプで前後のカード ・ ', h('span', { class: 'num' }, String(i + 1)), `/${list.length}`) : null,
        h('div', { class: 'cdx-info' },
          h('div', { class: 'nmrow' }, h('b', {}, d.name), h('span', { class: 'rar' }, RARITY_NAMES[d.rarity])),
          h('div', { class: 'attrs' },
            h('div', {}, h('small', {}, '種類'), h('b', {}, d.kind === 'unit' ? 'ユニット' : '術')),
            h('div', {}, h('small', {}, '刻（コスト）'), h('b', { class: 'num', style: 'color:var(--gold-hi)' }, String(d.cost))),
            h('div', {}, h('small', {}, '収録'), h('b', { style: 'font-size:12px' }, setOf(d) === 'base' ? '基本' : SET_NAMES[setOf(d)].replace(/^.*「|」$/g, ''))),
            ...(d.kind === 'unit' ? [
              h('div', {}, h('small', {}, '攻撃'), h('b', { class: 'num', style: 'color:#ff9a6a' }, String(d.atk))),
              h('div', {}, h('small', {}, '体力'), h('b', { class: 'num', style: 'color:#7fe0a8' }, String(d.hp))),
              h('div', {}, h('small', {}, '間隔'), h('b', { class: 'num' }, String(d.reload))),
            ] : [])),
          h('div', { class: 'cdx-tabs' },
            h('button', { 'aria-pressed': String(tab === 'text'), onclick: () => { tab = 'text'; render(); } }, '効果'),
            h('button', { 'aria-pressed': String(tab === 'info'), onclick: () => { tab = 'info'; render(); } }, 'ことば・収録')),
          textBox),
        dk ? h('div', { class: 'cdx-count' },
          h('div', { class: 'stepper' },
            h('button', { 'aria-label': '1枚抜く', disabled: !dk.count(cid), onclick: () => { dk.remove(cid); render(); } }, '−'),
            h('div', {}, 'デッキに ', h('b', {}, String(dk.count(cid))), h('span', { class: 'num' }, `/${dk.max(cid)}`)),
            h('button', { 'aria-label': '1枚入れる', disabled: dk.count(cid) >= dk.max(cid), onclick: () => { dk.add(cid); render(); } }, '＋')),
          h('div', { class: 'own-box' }, '所持 ', h('b', {}, setOf(d) === 'base' ? '―' : String(own)), h('br', {}), '欠片 ', h('span', { class: 'num', style: 'color:#cff6ff' }, fmt(w.shards)))) : null,
        dk && setOf(d) !== 'base' && own < maxCopies(cid) ? h('div', { class: 'note' }, own === 0 ? 'このカードは持っていません。パックか欠片で手に入ります' : `もう${maxCopies(cid) - own}枚作ると、デッキに${maxCopies(cid)}枚まで入れられます`) : null,
        craftable(cid) ? h('button', { class: `hexbtn ${block ? '' : 'gold'} big`, disabled: !!block, onclick: () => {
          if (craft(store.wallet, cid)) { store.saveWallet(); audio.play('rareR'); this.toast(`「${d.name}」を欠片で作りました`); render(); }
        } }, '欠片で作る', h('small', {}, block ?? `欠片 ${fmt(w.shards)} → ${fmt(w.shards - cost)}`)) : null,
      ));
    };
    let sx = 0, sy = 0;
    el.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { const j = i + (dx < 0 ? 1 : -1); if (j >= 0 && j < list.length) { i = j; audio.play('flip'); render(); } }
    });
    audio.play('select');
    render();
    this.host.root.append(el);
  }

  // ---------------------------------------------------------------- collection
  collection(mode: 'all' | 'craft' = 'all', back?: () => void) {
    let setF: 'all' | CardSet = mode === 'craft' ? 'echo' : 'all';
    let rar: 'all' | 'C' | 'R' | 'E' | 'L' = 'all';
    const leave = back ?? (() => (mode === 'craft' ? this.shop() : this.menuTab()));
    const render = () => {
      const w = store.wallet;
      const list = CARD_LIST.filter((c) => (setF === 'all' || setOf(c) === setF) && (rar === 'all' || c.rarity === rar) && (mode !== 'craft' || craftable(c.id)))
        .sort((a, b) => (setOf(a) === setOf(b) ? 0 : setOf(a) === 'base' ? -1 : 1) || a.cost - b.cost);
      const seg = <T extends string>(cur: T, set: (v: T) => void, opts: [T, string][]) => h('div', { class: 'seg2' }, ...opts.map(([v, t]) => h('button', { 'aria-pressed': String(cur === v), onclick: () => { set(v); render(); } }, t)));
      const all = setProgressAll();
      const echo = setProgress(w, 'echo');
      const ids = list.map((c) => c.id);
      this.page(mode === 'craft' ? '欠片で作る' : 'カード図鑑', leave, [
        mode === 'craft'
          ? h('div', { class: 'pn' }, h('span', { class: 'hd' }, '時の欠片'), h('p', { style: 'margin:8px 0 0;font-size:12px;line-height:1.7;color:#c2d2d4' }, `所持 `, h('b', { class: 'num', style: 'color:#cff6ff;font-size:16px' }, fmt(w.shards)), `　・　作るのに 通常${CRAFT_COST.C}・希少${CRAFT_COST.R}・秘宝${CRAFT_COST.E}・伝説${CRAFT_COST.L}`, h('br', {}), `上限枚数を超えて出たカードは欠片になります（通常${DUPE_SHARDS.C}・希少${DUPE_SHARDS.R}・秘宝${DUPE_SHARDS.E}・伝説${DUPE_SHARDS.L}）`))
          : h('div', {}, h('div', { class: 'progress' }, h('i', { style: `width:${all.pct}%` })), h('div', { class: 'shop-note', style: 'text-align:left;margin-top:4px' }, `全体 ${all.kinds}/${all.total}種（${all.pct}%）・ 第1弾 ${echo.kinds}/${echo.kindsTotal}種`)),
        mode === 'craft' ? null : seg(setF, (v) => (setF = v), [['all', '全セット'], ['base', '基本'], ['echo', '第1弾']]),
        seg(rar, (v) => (rar = v), [['all', 'すべて'], ['C', '通常'], ['R', '希少'], ['E', '秘宝'], ['L', '伝説']]),
        h('div', { class: 'grid' }, ...list.map((c) => {
          const o = ownedCount(w, c.id);
          const tag = setOf(c) === 'base' ? null : mode === 'craft' ? (o >= maxCopies(c.id) ? `所持 ${o}・上限` : `欠片 ${CRAFT_COST[c.rarity]}`) : o ? `所持 ${o}` : '未所持';
          return h('button', { class: `tile${o ? '' : ' locked'}`, 'aria-label': `${c.name}${o ? '' : '（未所持）'}`, onclick: () => this.cardDetail(c.id, { list: ids, onClose: render }) },
            h('img', { src: cardImg(c.id), alt: c.name, loading: 'lazy' }), tag ? h('span', { class: 'own' }, tag) : null);
        })),
      ], [purse()]);
    };
    render();
  }

  // ---------------------------------------------------------------- match setup
  setup(level0?: AiLevel) {
    const decks = store.allDecks();
    let mine = decks.find((d) => d.id === store.settings.lastDeck && d.valid) ?? decks[0];
    let ai: DeckDef | 'random' = 'random';
    let level = level0 ?? store.settings.level;
    const render = () => {
      const deckOpts = decks.map((d) => h('button', {
        class: 'opt', 'aria-pressed': String(d.id === mine.id), disabled: !d.valid,
        onclick: () => { mine = d; audio.play('select'); render(); },
      }, h('div', {}, h('div', { class: 'nm' }, d.name), h('div', { class: 'ds' }, d.blurb ?? `${d.cards.length}枚・自作デッキ`)), !d.valid ? h('span', { class: 'badge' }, d.missing.length ? '未所持あり' : '未完成') : null));
      const aiOpts = [h('button', { class: 'opt', 'aria-pressed': String(ai === 'random'), onclick: () => { ai = 'random'; render(); } }, h('div', {}, h('div', { class: 'nm' }, 'おまかせ'), h('div', { class: 'ds' }, '4種のデッキから選ばれます'))),
        ...PRESET_DECKS.map((d) => h('button', { class: 'opt', 'aria-pressed': String(ai !== 'random' && ai.id === d.id), onclick: () => { ai = d; render(); } }, h('div', {}, h('div', { class: 'nm' }, d.name), h('div', { class: 'ds' }, d.blurb ?? ''))))];
      const lv = (v: AiLevel, t: string) => h('button', { 'aria-pressed': String(level === v), onclick: () => { level = v; render(); } }, t);
      this.page('フリー対戦', () => this.battleTab(), [
        h('div', { class: 'sec-title' }, 'あなたのデッキ'), h('div', { class: 'opt-list' }, ...deckOpts),
        h('div', { class: 'sec-title' }, '相手（AI）のデッキ'), h('div', { class: 'opt-list' }, ...aiOpts),
        h('div', { class: 'sec-title' }, 'AIの強さ'), h('div', { class: 'seg2' }, lv('easy', 'やさしい'), lv('normal', 'ふつう'), lv('hard', 'つよい'), lv('expert', '超つよい')),
        h('button', {
          class: 'hexbtn gold big', onclick: () => {
            store.settings.lastDeck = mine.id; store.settings.level = level; store.saveSettings();
            const aiDeck = ai === 'random' ? PRESET_DECKS[Math.floor(Math.random() * PRESET_DECKS.length)] : ai;
            audio.play('summon');
            this.clear();
            this.host.startBattle(mine, aiDeck, level);
          },
        }, '対戦開始'),
      ]);
    };
    render();
  }

  // ---------------------------------------------------------------- deck list
  private selDeck = '';
  decks() {
    const list = store.allDecks();
    const pick = list.find((d) => d.id === (this.selDeck || store.settings.lastDeck)) ?? list[0];
    this.selDeck = pick.id;
    const key = deckKey(pick);
    const v = validateDeck(pick.cards);
    const units = unitCount(hasTokens(pick));
    const back = deckLook(pick.id, 'back'), dial = deckLook(pick.id, 'dial'), mat = deckLook(pick.id, 'mat');
    const dk = DIAL_SKINS[dial] ?? DIAL_SKINS['dial:brass'];
    const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
    const custom = store.customDecks.some((d) => d.id === pick.id);
    const copyOf = (d: AnyDeck): DeckDef => ({ id: `c${Date.now()}`, name: `${d.name}（改）`, cards: d.cards.slice() });
    const del = () => {
      const k = this.sheet('デッキを削除', null, [h('p', { style: 'margin:0;text-align:center;line-height:1.8' }, `「${pick.name}」を削除しますか？`, h('br', {}), h('small', { class: 'muted' }, '削除したデッキは元に戻せません'))],
        [h('div', { class: 'btn-row', style: 'width:100%' },
          h('button', { class: 'hexbtn silver', onclick: () => k.close() }, 'やめる'),
          h('button', { class: 'hexbtn red', onclick: () => { k.close(); store.customDecks = store.customDecks.filter((d) => d.id !== pick.id); store.saveDecks(); delete store.deckLooks[pick.id]; store.saveDeckLooks(); this.selDeck = ''; this.decks(); } }, '削除する'))]);
    };
    this.hub('deck', h('div', { class: 'tab-page' },
      h('div', { class: 'pn gold deck-detail' },
        h('div', { class: 'key', style: artStyle(key) },
          h('span', { class: 'hd' }, 'キーカード'),
          h('button', { class: 'chip-btn', onclick: () => this.keyPicker(pick) }, 'キーカードを選ぶ'),
          h('div', { class: 'nmrow' }, h('b', {}, pick.name), pick.id === store.settings.lastDeck ? h('span', { class: 'ribbon tone-gold', style: 'height:18px;font-size:10px' }, 'バトルで使用中') : null)),
        h('div', { class: 'mid' },
          h('div', { style: 'flex:1;min-width:0' }, curveBars(hasTokens(pick)), h('div', { class: 'muted', style: 'font-size:10px;margin-top:4px' }, '刻（コスト）ごとの枚数')),
          h('div', { class: 'counts' },
            h('div', {}, h('span', {}, 'ユニット'), h('b', { class: 'num' }, String(units))),
            h('div', {}, h('span', {}, '術'), h('b', { class: 'num' }, String(pick.cards.length - units))),
            h('div', { class: `tot${pick.valid ? '' : ' bad'}` }, h('b', {}, String(pick.cards.length)), h('span', { class: 'num muted' }, `/${RULES.DECK_SIZE}`)))),
        h('div', { class: 'slots' },
          h('button', { class: 'slot', onclick: () => this.lookPicker(pick.id, 'back', () => this.decks()) }, h('img', { src: backImg(back), alt: '' }), h('span', {}, 'スリーブ', h('br', {}), h('small', {}, lookById(back)?.name ?? ''))),
          h('button', { class: 'slot', onclick: () => this.lookPicker(pick.id, 'dial', () => this.decks()) }, h('i', { class: 'dialmini', style: `--c:${hex(dk.rim)};--f:${hex(dk.face)}` }), h('span', {}, '文字盤', h('br', {}), h('small', {}, lookById(dial)?.name ?? ''))),
          h('button', { class: 'slot', onclick: () => this.lookPicker(pick.id, 'mat', () => this.decks()) }, h('span', { class: 'matmini' }, matPreview(mat, false)), h('span', {}, 'マット', h('br', {}), h('small', {}, lookById(mat)?.name ?? ''))))),
      h('div', { class: 'btn-row' },
        h('button', { class: 'hexbtn red', style: 'flex:.8', disabled: !custom, onclick: del }, '削除'),
        h('button', { class: 'hexbtn silver', onclick: () => this.deckCheck(pick.cards, pick.name) }, '確認'),
        h('button', { class: 'hexbtn gold', style: 'flex:1.3', onclick: () => this.editor(pick.preset ? copyOf(pick) : { id: pick.id, name: pick.name, cards: pick.cards.slice() }) }, pick.preset ? '複製して編集' : '編集する')),
      !v.ok || pick.missing.length ? h('p', { class: 'shop-note', style: 'color:#ff9a80' }, pick.missing.length ? '持っていないカードが入っているため、このままでは対戦に使えません' : v.problems[0]) : null,
      h('div', { class: 'sec-title' }, `デッキ ${list.length} ・ タップで選ぶ（選んだデッキがホームのバトルで使われます）`),
      h('div', { class: 'dtiles' },
        ...list.map((d) => h('button', { class: `dtile${d.id === pick.id ? ' on' : ''}${d.preset ? ' preset' : ''}`, style: artStyle(deckKey(d)), onclick: () => {
          this.selDeck = d.id;
          if (d.valid) { store.settings.lastDeck = d.id; store.saveSettings(); }
          audio.play('select'); this.decks();
        } }, h('div', { class: 't' }, h('b', {}, d.name), h('small', { class: d.valid ? '' : 'bad' }, d.valid ? `${d.cards.length}/${RULES.DECK_SIZE}${d.id === store.settings.lastDeck ? ' ・ 使用中' : ''}` : d.missing.length ? '未所持あり' : `${d.cards.length}/${RULES.DECK_SIZE} ・ 未完成`)))),
        h('button', { class: 'dtile add', onclick: () => this.editor({ id: `c${Date.now()}`, name: '新しいデッキ', cards: [] }) }, h('span', { html: ICON.plus }), '新規作成')),
    ));
  }
  /** Every card of a deck at a glance, with its curve and anything that stops it from being played. */
  private deckCheck(cards: string[], name: string, opts: { remove?: (id: string) => void; refresh?: () => void } = {}) {
    const ref = this.sheet(name, ICON.deck, []);
    const render = () => {
      const v = validateDeck(cards);
      const own = (id: string) => ownedCount(store.wallet, id);
      const count = (id: string) => cards.filter((c) => c === id).length;
      const miss = [...new Set(cards)].filter((c) => count(c) > own(c));
      const grouped = [...new Set(cards)].map((id) => cardDef(id)).sort((a, b) => a.cost - b.cost || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'ja'));
      ref.body.replaceChildren(
        h('div', { class: `de-verdict ${v.ok && !miss.length ? 'ok' : 'bad'}` }, v.ok && !miss.length ? 'このデッキで対戦できます' : 'このままでは対戦に使えません'),
        ...v.problems.map((t) => h('p', { class: 'problems' }, t)),
        ...miss.map((c) => h('p', { class: 'problems' }, `「${cardDef(c).name}」が足りません（所持${own(c)}枚）`)),
        curveBars(cards),
        ...(opts.remove ? [h('p', { class: 'shop-note' }, 'カードをタップすると1枚抜けます')] : []),
        h('div', { class: 'deck-rows' }, ...grouped.map((c) => h('button', { class: `de-row${count(c.id) > own(c.id) ? ' short' : ''}`, style: `--art:url("${cardImg(c.id)}")`, disabled: !opts.remove, onclick: () => { opts.remove?.(c.id); render(); opts.refresh?.(); } },
          h('b', { class: 'c' }, String(c.cost)), h('span', { class: 'nm' }, h('span', {}, c.name), c.kind === 'unit' ? h('small', {}, `${c.atk}/${c.hp}`) : h('small', {}, '術')), h('b', { class: 'x' }, `×${count(c.id)}`)))),
        ...(!cards.length ? [h('p', { class: 'empty' }, 'まだカードが入っていません')] : []));
    };
    render();
  }
  private keyPicker(d: AnyDeck) {
    const ids = [...new Set(hasTokens(d))];
    const ref = this.sheet('キーカード', ICON.star, [
      h('p', { class: 'shop-note' }, 'デッキの顔になるカード。一覧と対戦前の画面に出ます'),
      h('div', { class: 'fav-grid' }, ...ids.map((id) => h('button', { class: `tile${deckKey(d) === id ? ' picked' : ''}`, onclick: () => {
        store.deckLooks[d.id] = { ...store.lookOf(d.id), key: id }; store.saveDeckLooks(); ref.close(); this.decks();
      } }, h('img', { src: cardImg(id), alt: cardName(id) })))),
    ]);
  }
  private lookPicker(deckId: string, kind: LookKind, done: () => void) {
    const cur = deckLook(deckId, kind);
    const owned = LOOKS.filter((l) => l.kind === kind && ownsLook(store.wallet, l.id));
    const ref = this.sheet(LOOK_TITLE[kind], null, [
      h('div', { class: 'looks' }, ...owned.map((l) => h('button', { class: `look${l.id === cur ? ' on' : ''}`, onclick: () => {
        store.deckLooks[deckId] = { ...store.lookOf(deckId), [kind]: l.id }; store.saveDeckLooks(); audio.play('select'); ref.close(); done();
      } }, h('div', { class: 'pv' }, lookPreview(kind, l.id)), h('b', {}, l.name), h('small', {}, l.id === cur ? 'このデッキで使用中' : l.blurb)))),
    ], [h('button', { class: 'hexbtn', onclick: () => { ref.close(); this.looksShop(kind); } }, 'ショップで探す')]);
  }

  // ---------------------------------------------------------------- deck editor
  /**
   * Deck editor for a phone held upright: the deck's numbers on top, a search line and a row of keyword marks,
   * then the cards in three columns. Tap a card to put it in; hold it for the full card with −/＋.
   * The deck itself opens from「デッキ確認」(tap a card there to take it out).
   */
  editor(deck: DeckDef) {
    const cards = deck.cards.slice();
    let name = deck.name;
    let filt = 'all';
    let ownedOnly = false;
    let sort: 'cost' | 'costDesc' | 'name' | 'rarity' = 'cost';
    let query = '';
    let dirty = false;
    const fresh = new Set(store.wallet.fresh);
    if (fresh.size) { store.wallet.fresh = []; store.saveWallet(); }
    const own = (id: string) => ownedCount(store.wallet, id);
    const count = (id: string) => cards.filter((c) => c === id).length;
    const cap = (id: string) => Math.min(own(id), maxCopies(id));

    const add = (id: string, quiet = false) => {
      if (count(id) >= own(id)) { audio.play('deny'); this.toast(own(id) === 0 ? `「${cardDef(id).name}」は持っていません（パックか欠片で入手）` : `「${cardDef(id).name}」は${own(id)}枚しか持っていません`); return; }
      if (count(id) >= maxCopies(id)) { audio.play('deny'); this.toast(`「${cardDef(id).name}」は${maxCopies(id)}枚までです`); return; }
      if (cards.length >= RULES.DECK_SIZE) { audio.play('deny'); this.toast(`デッキは${RULES.DECK_SIZE}枚までです`); return; }
      cards.push(id); dirty = true; if (!quiet) audio.play('draw'); paint();
    };
    const remove = (id: string) => { const i = cards.lastIndexOf(id); if (i >= 0) { cards.splice(i, 1); dirty = true; audio.play('select'); paint(); } };
    const save = () => {
      const d: DeckDef = { id: deck.id, name: name.trim() || '名前のないデッキ', cards: cards.slice() };
      const i = store.customDecks.findIndex((x) => x.id === d.id);
      if (i >= 0) store.customDecks[i] = d; else store.customDecks.push(d);
      store.saveDecks();
      track(store.meta, 'deck', 1, localDate()); store.saveMeta();
      audio.play('reserve');
      this.selDeck = d.id;
      this.decks();
    };
    const back = () => {
      if (!dirty) { this.decks(); return; }
      const k = this.sheet('保存していません', null, [h('p', { style: 'margin:0;text-align:center' }, '変更を保存せずに戻りますか？')],
        [h('div', { class: 'btn-row', style: 'width:100%' },
          h('button', { class: 'hexbtn silver', onclick: () => { k.close(); this.decks(); } }, '保存せず戻る'),
          h('button', { class: 'hexbtn gold', onclick: () => { k.close(); save(); } }, '保存して戻る'))]);
    };
    /** Fills the deck up to 20 from the collection: second copies first, then cards that fill the curve. */
    const suggest = () => {
      const target = [3, 5, 5, 3, 2, 2];
      const pres = PRESET_DECKS.map((p) => ({ p, n: p.cards.filter((c) => cards.includes(c)).length })).sort((a, b) => b.n - a.n)[0]?.p;
      let added = 0;
      while (cards.length < RULES.DECK_SIZE) {
        const curve = Array.from({ length: 6 }, (_, i) => cards.filter((c) => (i === 5 ? cardDef(c).cost >= 6 : Math.max(1, cardDef(c).cost) === i + 1)).length);
        const units = unitCount(cards);
        const pool = CARD_LIST.filter((c) => count(c.id) < cap(c.id));
        if (!pool.length) break;
        const score = (c: CardDef) => {
          const slot = c.cost >= 6 ? 5 : Math.max(1, c.cost) - 1;
          return (count(c.id) ? 3 : 0) + (pres?.cards.includes(c.id) ? 2 : 0) + (target[slot] - curve[slot]) * 1.5 + (c.kind === 'unit' ? (units < 13 ? 1 : -0.5) : (cards.length - units < 7 ? 1 : -0.5)) + RANK[c.rarity] * 0.4;
        };
        const best = pool.sort((a, b) => score(b) - score(a) || a.cost - b.cost)[0];
        cards.push(best.id); added++;
      }
      if (added) { dirty = true; audio.play('reserve'); this.toast(`おすすめで${added}枚入れました`); paint(); }
      else this.toast(cards.length >= RULES.DECK_SIZE ? `デッキは${RULES.DECK_SIZE}枚そろっています` : '入れられるカードがありません');
    };

    // keyword rail: kinds and the keywords that appear in the card pool
    const KW: { id: string; label: string; mark: string; c: string; t?: string; r?: string; test: (c: CardDef) => boolean }[] = [
      { id: 'all', label: 'すべて', mark: '', c: '', test: () => true },
      { id: 'unit', label: 'ユニット', mark: '兵', c: '#13323b', r: '#e0b25c', test: (c) => c.kind === 'unit' },
      { id: 'spell', label: '術', mark: '術', c: '#13323b', r: '#c9a8ff', test: (c) => c.kind === 'spell' },
      { id: 'new', label: 'NEW', mark: '新', c: '#d6334a', t: '#fff', test: (c) => fresh.has(c.id) },
      ...([['速攻', '速', '#5fd0b5'], ['挑発', '挑', '#7fb8ff'], ['貫通', '貫', '#e9674f'], ['残響', '響', '#c9a8ff'], ['共鳴', '鳴', '#8ff0e0'], ['急襲', '襲', '#ffb07a'], ['充填', '充', '#f4d692'], ['鐘鳴', '鐘', '#e0b25c'], ['転移', '移', '#9fe8ff']] as const)
        .filter(([k]) => CARD_LIST.some((c) => keywordsOf(c).includes(k)))
        .map(([k, mark, c]) => ({ id: k, label: k, mark, c, t: '#08141c', test: (x: CardDef) => keywordsOf(x).includes(k) })),
      { id: 'echo', label: '第1弾', mark: '1', c: '#2a1d47', r: '#c9a8ff', test: (c) => setOf(c) === 'echo' },
    ];
    if (!fresh.size) KW.splice(3, 1);
    const strip = h('div', { class: 'de-strip' });
    const grid = h('div', { class: 'cgrid', role: 'list' });
    const rail = h('div', { class: 'kwrail' });
    const ownBtn = h('button', { class: 'chip-btn', 'aria-pressed': 'false', onclick: () => { ownedOnly = !ownedOnly; ownBtn.setAttribute('aria-pressed', String(ownedOnly)); paintGrid(); } }, '所持のみ');
    const checkBtn = h('button', { class: 'hexbtn silver', onclick: () => this.deckCheck(cards, name || 'デッキ', { remove, refresh: paint }) }, 'デッキ確認 ', h('span', { class: 'num' }, ''));
    const matches = (c: CardDef) => {
      if (!KW.find((k) => k.id === filt)!.test(c)) return false;
      if (ownedOnly && !own(c.id)) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return [c.name, c.text, c.resvText ?? '', ...keywordsOf(c)].some((t) => t.toLowerCase().includes(q));
    };
    const shown = () => CARD_LIST.filter(matches).sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name, 'ja')
        : sort === 'rarity' ? RANK[b.rarity] - RANK[a.rarity] || a.cost - b.cost
          : (sort === 'costDesc' ? b.cost - a.cost : a.cost - b.cost) || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'ja'));
    const paintStrip = () => {
      const v = validateDeck(cards), units = unitCount(cards);
      strip.replaceChildren(curveBars(cards),
        h('div', { class: 'kinds' }, 'ユニット ', h('b', {}, String(units)), h('br', {}), '術 ', h('b', {}, String(cards.length - units))),
        h('div', { class: 'tot' }, h('small', {}, 'デッキ'), h('b', { class: v.ok ? 'ok' : '' }, String(cards.length)), h('span', {}, `/${RULES.DECK_SIZE}`)));
      (checkBtn.lastChild as HTMLElement).textContent = String(cards.length);
    };
    const paintRail = () => rail.replaceChildren(...KW.map((k) => h('button', { class: 'kw2', 'aria-pressed': String(filt === k.id), onclick: () => { filt = k.id; paintRail(); paintGrid(); } },
      k.mark ? h('i', { style: `--c:${k.c};${k.t ? `--t:${k.t};` : ''}${k.r ? `--r:${k.r};` : ''}` }, k.mark) : null, k.label)));
    const paintGrid = () => {
      const list = shown();
      const ids = list.map((c) => c.id);
      grid.replaceChildren(...(list.length ? list.map((c) => {
        const n = count(c.id), o = own(c.id), mx = cap(c.id);
        return pressable(h('button', { class: `cc${o ? '' : ' locked'}${n ? ' in' : ''}${n && n >= mx ? ' full' : ''}`, role: 'listitem', 'aria-label': `${c.name}（所持${o}・デッキ${n}）` },
          h('img', { src: cardImg(c.id), alt: '', loading: 'lazy', draggable: 'false' }),
          h('span', { class: 'n' }, n ? `${n}/${mx}` : `×${o}`),
          fresh.has(c.id) ? newTag('red') : null),
        () => add(c.id), () => this.cardDetail(c.id, { list: ids, deck: { count, max: (id) => Math.max(count(id), cap(id)), add, remove }, onClose: paint }));
      }) : [h('p', { class: 'de-empty' }, '条件に合うカードがありません')]));
    };
    const paint = () => { paintStrip(); paintGrid(); };
    const search = h('input', { type: 'search', placeholder: 'カード名・効果で探す', enterkeyhint: 'search', 'aria-label': '検索', oninput: (e: Event) => { query = (e.target as HTMLInputElement).value.trim(); paintGrid(); } });
    const sortSel = h('select', { 'aria-label': '並び順', onchange: (e: Event) => { sort = (e.target as HTMLSelectElement).value as typeof sort; paintGrid(); } },
      ...([['cost', '刻の小さい順'], ['costDesc', '刻の大きい順'], ['rarity', 'レア度順'], ['name', '名前順']] as const).map(([v, t]) => h('option', { value: v }, t)));
    this.mount(h('div', { class: 'de2' },
      h('header', { class: 'cd-top' },
        h('button', { class: 'back-arrow', onclick: back }, '戻る'),
        h('input', { class: 'de-nm', value: name, maxlength: '20', 'aria-label': 'デッキ名', oninput: (e: Event) => { name = (e.target as HTMLInputElement).value; dirty = true; } }),
        h('span', { class: 'round-btn', html: ICON.pen, 'aria-hidden': 'true' })),
      h('div', { class: 'de2-body' },
        strip,
        h('div', { class: 'de-tools2' }, h('label', { class: 'srch', html: ICON.search }, search), sortSel, ownBtn),
        rail,
        grid),
      h('div', { class: 'de-foot' },
        h('p', {}, `タップで入れる ・ 長押しで詳しく ・ 同じカードは${RULES.MAX_COPIES}枚まで（伝説は${RULES.MAX_LEGEND_COPIES}枚）`),
        h('div', { class: 'btn-row' },
          h('button', { class: 'hexbtn', style: 'flex:.9', onclick: suggest }, 'おすすめ'),
          checkBtn,
          h('button', { class: 'hexbtn gold', onclick: save }, '保存')))));
    paintRail();
    paint();
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
          h('p', {}, '対戦するとコインがもらえ、ショップで第1弾のパックと交換できます。基本カードは最初から全て使えます。スリーブ・文字盤・プレイマットもコインで交換できます。コインはゲーム内で遊んで得るもので、現金では買えません。')),
        h('section', {}, h('h3', {}, '終焉の刻'),
          h('p', { html: `両者の時計が${RULES.DOOM_AT}刻に達すると、ユニットの攻撃で拠点に与えるダメージが+1されます。その後${RULES.DOOM_STEP}刻ごとにさらに+1。終盤ほどユニットの一撃が重くなります（術や残響による拠点へのダメージは増えません）。` })),
        h('section', {}, h('h3', {}, '操作'),
          h('ul', {},
            h('li', {}, '手札のカードをドラッグ：ユニットはレーンへ、術は盤面で離すと使用、時計に重ねると予約。'),
            h('li', {}, 'カードをタップすると詳細と操作ボタンが出ます。'),
            h('li', {}, '攻撃できるユニットを押すと、狙う相手に山形の矢印が伸び、攻撃したときの相手の体力と反撃の結果が出ます。もう一度タップ（または上へドラッグして離す）で攻撃。'),
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
    const toggle = (key: 'reduced' | 'vibeBig' | 'vibeTap' | 'attackPreview' | 'packConfirm', label: string, sub?: string) => {
      const b = h('button', { class: 'toggle2', role: 'switch', 'aria-checked': String(!!s[key]), 'aria-label': label, onclick: () => { s[key] = !s[key]; b.setAttribute('aria-checked', String(!!s[key])); commit(); if (key.startsWith('vibe') && s[key]) { try { navigator.vibrate?.(20); } catch { /* not allowed */ } } } });
      return h('div', { class: 'set-row' }, h('div', { class: 'tx' }, h('b', {}, label), sub ? h('small', {}, sub) : null), b);
    };
    const slider = (label: string, en: string, get: () => number, set: (v: number) => void, test?: () => void) => {
      const mute = h('button', { class: 'round-btn', style: 'width:40px;height:40px', 'aria-label': '消音', 'aria-pressed': String(s.muted), html: s.muted ? ICON.mute : ICON.sound, onclick: () => { s.muted = !s.muted; commit(); this.settings(back); } });
      return h('div', { class: 'set-row' }, h('div', { class: 'l' }, h('b', {}, label), h('small', {}, en)),
        h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(get()), 'aria-label': label, oninput: (e: Event) => { set(+(e.target as HTMLInputElement).value); commit(); }, onchange: () => test?.() }), mute);
    };
    const speedBtn = (v: number, t: string) => h('button', { 'aria-pressed': String(s.speed === v), onclick: () => { s.speed = v; commit(); this.settings(back); } }, t);
    const pwaRow = () => {
      if (pwa.installed) return h('div', { class: 'set-row' }, h('div', { class: 'tx' }, h('b', {}, 'アプリ'), h('small', { style: 'color:var(--you)' }, 'ホーム画面から起動しています')));
      if (pwa.canPrompt) return h('div', { class: 'set-row' }, h('div', { class: 'tx' }, h('b', {}, 'アプリとして追加'), h('small', {}, 'ホーム画面に追加すると、全画面で遊べてオフラインでも起動します')), h('button', { class: 'chip-btn gold', onclick: async () => { await pwa.install(); this.settings(back); } }, '追加する'));
      if (pwa.isIOS) return h('div', { class: 'set-row' }, h('div', { class: 'tx' }, h('b', {}, 'アプリとして追加'), h('small', {}, 'Safariの共有ボタン → 「ホーム画面に追加」で、全画面のアプリとして遊べます')));
      return h('div', { class: 'set-row' }, h('div', { class: 'tx' }, h('b', {}, 'アプリとして追加'), h('small', {}, 'ブラウザのメニューの「インストール」または「ホーム画面に追加」から追加できます')));
    };
    const vib = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    this.page('設定', back, [
      h('div', { class: 'set-sec' }, '音'),
      slider('BGM', 'MUSIC', () => s.bgm ?? 0.5, (v) => { s.bgm = v; }),
      slider('効果音', 'SOUND', () => s.volume, (v) => { s.volume = v; }, () => audio.play('hit')),
      h('div', { class: 'set-sec' }, '演出'),
      h('div', { class: 'set-row wrap' }, h('div', { class: 'tx' }, h('b', {}, '演出の速さ')), h('div', { class: 'seg2' }, speedBtn(1, '標準'), speedBtn(1.5, '速い'), speedBtn(2.2, 'とても速い'))),
      toggle('reduced', '動きを減らす', '揺れ・光の粒、文字盤やマットの動きを抑えます'),
      toggle('vibeBig', '盛り上がる場面で振動', vib ? '伝説の登場、決着の一撃、拠点への大きなダメージ' : 'この端末やブラウザは振動に対応していません'),
      toggle('vibeTap', '操作の手応えで振動', vib ? 'カードを出した、攻撃した、などを短く' : 'この端末やブラウザは振動に対応していません'),
      h('div', { class: 'set-sec' }, '遊びやすさ'),
      toggle('attackPreview', '攻撃の前に結果を見せる', 'ユニットを選んでいる間、相手の体力と反撃の結果を表示'),
      toggle('packConfirm', 'パックを引く前に確認する'),
      h('div', { class: 'set-sec' }, 'そのほか'),
      pwaRow(),
    ]);
  }

  // ---------------------------------------------------------------- first-match guide
  guide(done: () => void) {
    const B = '#e0b25c', Y = '#5fd0b5', F = '#e9674f', M = '#8fa9ad';
    const dial = (you: number, foe: number, extra = '') => `<svg viewBox="0 0 400 250" role="img"><g transform="translate(0 30)"><path d="M40 170 A160 160 0 0 1 360 170" fill="none" stroke="${B}" stroke-width="3"/>${[0, 10, 20, 30, 40].map((t) => { const a = Math.PI + (t / 40) * Math.PI; return `<text x="${200 + Math.cos(a) * 138}" y="${176 + Math.sin(a) * 138}" fill="${B}" font-size="12" text-anchor="middle">${t}</text>`; }).join('')}${[[you, Y, 150], [foe, F, 115]].map(([t, c, r]) => { const a = Math.PI + (Number(t) / 40) * Math.PI; return `<line x1="200" y1="170" x2="${200 + Math.cos(a) * Number(r)}" y2="${170 + Math.sin(a) * Number(r)}" stroke="${c}" stroke-width="6" stroke-linecap="round"/><circle cx="${200 + Math.cos(a) * (Number(r) + 12)}" cy="${170 + Math.sin(a) * (Number(r) + 12)}" r="13" fill="#08141c" stroke="${c}" stroke-width="3"/><text x="${200 + Math.cos(a) * (Number(r) + 12)}" y="${175 + Math.sin(a) * (Number(r) + 12)}" fill="${c}" font-size="13" font-weight="700" text-anchor="middle">${t}</text>`; }).join('')}<circle cx="200" cy="170" r="8" fill="${B}"/>${extra}</g></svg>`;
    const steps = [
      { t: '時計が遅れている方が動く', p: 'ターンはありません。緑の針があなた、赤の針が相手の時計です。針が遅れている方が行動します。', svg: dial(6, 11, `<text x="200" y="205" fill="${Y}" font-size="16" font-weight="700" text-anchor="middle">あなたの番（5刻ぶん連続で動ける）</text>`) },
      { t: '行動すると針が進む', p: 'カードのコストは「刻」。重いカードを使うほど針が大きく進み、その間に相手が動けます。カードを選ぶと、使った後の針が薄く表示されます。', svg: dial(11, 11, `<line x1="200" y1="170" x2="${200 + Math.cos(Math.PI * 1.4) * 150}" y2="${170 + Math.sin(Math.PI * 1.4) * 150}" stroke="${Y}" stroke-width="4" opacity=".4" stroke-dasharray="6 6"/><text x="200" y="205" fill="${M}" font-size="15" text-anchor="middle">16刻へ進む → 相手の番</text>`) },
      { t: 'ドラッグで召喚・攻撃', p: 'ユニットは手札からレーンへドラッグ。右上の丸が緑になったユニットは攻撃できます。押すと狙う相手に矢印が伸び、攻撃したときの結果が出ます。正面が空なら相手の拠点を直接攻撃します。', svg: `<svg viewBox="0 0 400 190"><rect x="40" y="20" width="90" height="70" rx="10" fill="none" stroke="${F}" stroke-width="2"/><rect x="155" y="20" width="90" height="70" rx="10" fill="none" stroke="#f4d692" stroke-width="4"/><rect x="270" y="20" width="90" height="70" rx="10" fill="none" stroke="${F}" stroke-width="2"/><rect x="155" y="105" width="90" height="70" rx="10" fill="#16303d" stroke="${Y}" stroke-width="3"/><circle cx="232" cy="118" r="9" fill="${Y}"/>${[100, 88, 76].map((y) => `<path d="M188 ${y + 6} L200 ${y - 4} L212 ${y + 6}" stroke="#f4d692" stroke-width="4" fill="none" stroke-linecap="round"/>`).join('')}</svg>` },
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
  /** Menu while looking on: keep watching, or leave the room. */
  watchMenu(resume: () => void, leave: () => void) {
    this.mount(h('div', { class: 'screen dim title' },
      h('div', { class: 'panel', style: 'width:min(380px,100%)' },
        h('h2', {}, '観戦中'),
        h('button', { class: 'btn primary', onclick: () => { this.clear(); resume(); } }, '観戦に戻る'),
        h('button', { class: 'btn', onclick: () => this.rules(() => this.watchMenu(resume, leave)) }, '遊び方'),
        h('button', { class: 'btn danger', onclick: () => { this.clear(); leave(); } }, '観戦をやめる'))));
  }

  // ---------------------------------------------------------------- result
  /**
   * The end of a game: the word, how it ended, the rank bar, coins, the missions this game moved and the daily
   * coin cap, then「もう一戦」as the largest button.
   */
  private resultView(r: BattleResult, foeLabel: string, buttons: { main: HTMLElement[]; chips?: (HTMLElement | null)[]; foot?: string }, extra: { note?: string; rw?: Reward; xp?: XpGain; rated?: RatedGame | null; missions?: MissionDelta[]; card?: string; watch?: [string, string] } = {}) {
    const kind = r.winner === 0 ? 'win' : r.winner === 1 ? 'lose' : 'draw';
    const win = kind === 'win';
    const watch = extra.watch;
    const title = watch ? (kind === 'draw' ? '引き分け' : '決着') : win ? '勝利' : kind === 'lose' ? '敗北' : '引き分け';
    const en = watch ? 'GAME' : win ? 'VICTORY' : kind === 'lose' ? 'DEFEAT' : 'DRAW';
    const me = watch ? watch[0] : 'あなた';
    const why = watch
      ? (kind === 'draw' ? `${RULES.END}刻に到達・同じ体力` : `${kind === 'win' ? watch[0] : watch[1]}の勝ち`)
      : {
        ko: win ? '相手の拠点を破壊した' : '拠点を破壊された',
        time: `${RULES.END}刻に到達 ・ 体力の差で決着`,
        surrender: win ? `${foeLabel}が降参した` : '降参した',
        timeout: win ? `${foeLabel}が時間切れを重ねた` : '時間切れを重ねた',
        disconnect: win ? `${foeLabel}が戻ってこなかった` : '接続が戻らなかった',
      }[r.reason];
    const rw = extra.rw, xp = extra.xp;
    // rank bar: the part gained this game glows
    const rk = rankOf(store.meta.exp);
    const gainPct = xp && xp.exp ? Math.min(rk.into, xp.exp) / rk.need * 100 : 0;
    const basePct = xp && xp.after > xp.before ? 0 : rk.into / rk.need * 100 - gainPct;
    const glow = h('u', { style: `left:${basePct}%;width:0` });
    if (xp && xp.exp) setTimeout(() => { glow.style.width = `${xp.after > xp.before ? rk.into / rk.need * 100 : gainPct}%`; }, 300);
    const gains = rw && rw.total
      ? h('div', { class: 'gains' }, ...rw.lines.map((l, i) => { const b = h('b', {}, '+0'); setTimeout(() => countUp(b, l.coins, { prefix: '+', done: i === 0 ? () => audio.play('coin') : undefined }), 200 + i * 150); return h('div', { style: `animation-delay:${0.1 + i * 0.12}s` }, h('span', { class: 'ic-coin' }), b, h('small', {}, l.label)); }))
      : rw ? h('div', { class: 'gains none' }, h('div', {}, rw.capped ? `本日の対戦報酬は上限（${DAILY_MATCH_CAP}コイン）に達しました` : `コインは短すぎる対戦（自分の行動${MIN_ACTIONS}回未満）や降参では得られません`)) : null;
    const missions = (extra.missions ?? []).filter((x) => x.after > x.before);
    const msBox = missions.length ? h('div', { class: 'msbox' },
      h('div', { class: 'head' }, h('span', { class: 'hd' }, 'デイリーミッション'), h('small', {}, 'この対戦で進んだもの')),
      ...missions.map((x) => {
        const done = x.after >= x.goal;
        return h('div', { class: `msrow${done ? ' done' : ''}` }, h('i', { class: 'st' }), h('span', {}, x.text),
          h('div', { class: 'pg' }, h('span', { style: done ? 'color:var(--gold-hi)' : '' }, `${Math.min(x.after, x.goal)}`, h('span', { class: 'muted', style: 'font-size:10px' }, `/${x.goal}`)), h('i', {}, h('u', { style: `width:${Math.min(1, x.after / x.goal) * 100}%` }))),
          h('span', { class: 'tag' }, done && x.before < x.goal ? h('span', { class: 'new-tag' }, '達成') : `+${x.after - x.before}`));
      })) : null;
    const w = store.wallet, today = localDate();
    const used = w.matchDay === today ? w.matchCoins : 0;
    const cap = rw ? h('div', { class: 'capbar' }, h('div', {}, h('span', {}, '今日の対戦報酬'), h('span', {}, h('span', { class: 'num', style: 'color:var(--ivory)' }, String(used)), ` / ${DAILY_MATCH_CAP} コイン`)), h('i', {}, h('u', { style: `width:${(used / DAILY_MATCH_CAP) * 100}%` }))) : null;
    return h('div', { class: `result2 ${kind}` },
      h('div', { class: 'hero' },
        h('div', { class: 'art', style: `background-image:url("${cardImg(extra.card ?? favCard())}")` }),
        h('div', { class: 'rays' }),
        h('div', { class: 'word' },
          h('small', {}, en), h('h1', {}, title),
          h('div', { class: 'why2' }, h('span', {}, '決着'), h('span', {}, `${me} 体力 `, h('span', { class: 'num', style: 'color:var(--you)' }, String(Math.max(0, r.myHp))), ` ・ ${foeLabel} `, h('span', { class: 'num', style: 'color:#ff9a80' }, String(Math.max(0, r.foeHp))))),
          h('span', { class: 'reason' }, why, extra.note ? `　${extra.note}` : ''))),
      h('div', { class: 'body' },
        this.ratedView(extra.rated ?? undefined),
        xp && xp.exp ? h('div', {},
          h('div', { class: 'lvrow' }, h('span', { class: 'lv' }, `Lv. ${rk.rank}`), h('span', { class: 'gain' }, `+${xp.exp} EXP`)),
          h('div', { class: 'lvbar' }, h('i', { style: `width:${basePct}%` }), glow),
          h('div', { class: 'lvnext' }, `次のLvまで `, h('span', { class: 'num', style: 'color:var(--ivory)' }, String(rk.need - rk.into))),
          xp.after > xp.before ? h('div', { class: 'rankup2' }, `ランク${xp.after}になりました ・ 報酬をプレゼントに送りました`) : null) : null,
        gains,
        msBox,
        cap,
        buttons.chips && buttons.chips.some(Boolean) ? h('div', { class: 'chips' }, ...buttons.chips) : null,
        h('div', { class: 'main-btns' }, ...buttons.main),
        buttons.foot ? h('div', { class: 'foot-note' }, buttons.foot) : null));
  }
  /** Rating change on the result screen, counted up, with a promotion/demotion line. */
  private ratedView(g?: RatedGame) {
    if (!g) return null;
    const d = g.after - g.before;
    const t0 = tierOf(g.before).tier, t1 = tierOf(g.after).tier;
    const num = h('b', {}, String(g.before));
    setTimeout(() => countUp(num, g.after, { from: g.before }), 300);
    const up = t1.min > t0.min, down = t1.min < t0.min;
    if (up) setTimeout(() => audio.play('rareE'), 900);
    return h('div', { class: `rated2 ${d >= 0 ? 'up' : 'down'}`, style: `--tier:${t1.color}` },
      h('div', { class: 'rr' }, tierBadge(t1), h('span', { class: 'muted', style: 'font-size:13px' }, 'レート'), num, h('span', { class: 'delta' }, `${d >= 0 ? '+' : ''}${d}`)),
      h('small', {}, `対戦相手：${g.foe || '対戦相手'}（レート ${g.foeRating}）`),
      up ? h('div', { class: 'promo' }, `昇格！「${t1.name}」になりました`) : down ? h('small', {}, `「${t1.name}」に降格しました`) : null);
  }
  private resultChips(leave: () => void) {
    return [
      h('button', { class: 'chip-btn', onclick: () => this.host.openLog() }, '対戦のログ'),
      h('button', { class: 'chip-btn', onclick: () => { leave(); this.decks(); } }, 'デッキを変える'),
      claimable(store.meta, localDate()) ? h('button', { class: 'chip-btn gold', onclick: () => { leave(); this.missions('daily', () => this.home()); } }, 'ミッションへ') : PACKS.some((p) => canOpen(store.wallet, p)) ? h('button', { class: 'chip-btn gold', onclick: () => { leave(); this.packShop(PACKS[0]); } }, 'パックを引く') : null,
    ];
  }

  result(r: BattleResult, again: () => void, leave: () => void, rw?: Reward, xp?: XpGain, rated?: RatedGame | null, missions?: MissionDelta[], card?: string) {
    if (rated) {
      this.mount(this.resultView(r, rated.foe || '相手', {
        chips: this.resultChips(leave),
        main: [h('button', { class: 'hexbtn silver', onclick: () => { leave(); this.home(); } }, 'ホームへ'), h('button', { class: 'hexbtn gold', onclick: again }, '次のレート戦')],
        foot: '同じデッキで、次の相手を探します',
      }, { rw, xp, rated, missions, card }));
      return;
    }
    this.mount(this.resultView(r, 'AI', {
      chips: this.resultChips(leave),
      main: [h('button', { class: 'hexbtn silver', onclick: () => { leave(); this.home(); } }, 'ホームへ'), h('button', { class: 'hexbtn gold', onclick: again }, 'もう一戦')],
      foot: '同じ相手・同じデッキですぐ始まります',
    }, { rw, xp, missions, card }));
  }

  resultOnline(r: BattleResult, leave: () => void, rw?: Reward, xp?: XpGain, missions?: MissionDelta[], card?: string) {
    const flow = this.host.flow();
    const build = () => {
      const foe = flow.foe, rm = flow.rematch;
      const here = !!foe && foe.online;
      const label = rm.me ? '相手の返事を待っています…' : rm.foe ? '再戦する（相手が待っています）' : '再戦する';
      const note = !foe ? '相手は部屋を出ました' : !foe.online ? '相手の接続が切れています' : rm.foe && !rm.me ? '相手が再戦を希望しています' : '';
      return this.resultView(r, foe?.name ?? '相手', {
        chips: [h('button', { class: 'chip-btn', onclick: () => this.host.openLog() }, '対戦のログ'), h('button', { class: 'chip-btn', onclick: () => { flow.leave(); leave(); this.onlineMenu(); } }, '部屋を出る')],
        main: [h('button', { class: 'hexbtn silver', onclick: () => { flow.leave(); leave(); this.home(); } }, 'ホームへ'), h('button', { class: 'hexbtn gold', disabled: rm.me || !here, onclick: () => { audio.play('select'); flow.requestRematch(); } }, label)],
        foot: note,
      }, { rw, xp, missions, card });
    };
    this.live(build, (fn) => flow.onChange(fn));
  }
  /** The end of a game you were watching. A rematch between the two players starts the next game on its own. */
  resultWatch(r: BattleResult, leave: () => void) {
    const flow = this.host.flow();
    const names: [string, string] = [flow.seats[0]?.name ?? 'プレイヤー1', flow.seats[1]?.name ?? 'プレイヤー2'];
    this.mount(this.resultView(r, names[1], {
      chips: [h('button', { class: 'chip-btn', onclick: () => this.host.openLog() }, '対戦のログ')],
      main: [h('button', { class: 'hexbtn silver', onclick: () => { flow.leave(); leave(); this.home(); } }, '観戦を終える')],
      foot: '2人が再戦すると、続けて観戦できます',
    }, { watch: names, card: flow.seats[r.winner === 1 ? 1 : 0]?.fav }));
  }

  // ---------------------------------------------------------------- online: friend match
  onlineMenu(invite?: string) {
    const flow = this.host.flow();
    if (!flow.available) {
      this.page('フレンド対戦', () => this.battleTab(), [h('div', { class: 'pn' }, h('p', { style: 'margin:12px 0 0;line-height:1.8' }, 'オンライン対戦は現在準備中です。公開までもうしばらくお待ちください。'))]);
      return;
    }
    const o = store.onlineRecord;
    const door = (cls: string, title: string, en: string, sub: string, icon: string, fn: () => void, tag?: HTMLElement) =>
      h('button', { class: `door ${cls}`, onclick: () => { audio.play('select'); fn(); } }, h('span', {}, h('span', { html: icon }), h('span', { class: 't' }, h('b', {}, title), en ? h('em', {}, en) : null, h('small', {}, sub)), tag ?? null));
    this.page('フレンド対戦', () => this.battleTab(), [
      h('div', { class: 'doors' },
        door('create', '部屋を作る', 'CREATE', 'あいことばと招待リンクを\n友達に送ります', '<svg viewBox="0 0 92 104" fill="none"><path d="M46 4l40 22v52L46 100 6 78V26z" fill="#0f3a35" stroke="#5fd0b5" stroke-width="3"/><path d="M46 30v40M26 50h40" stroke="#b9ffe9" stroke-width="5" stroke-linecap="round"/></svg>', () => this.createRoom()),
        door('join', 'あいことばで入る', 'JOIN', `友達から聞いた\n${NET.CODE_LEN}文字を入れます`, '<svg viewBox="0 0 92 104" fill="none"><rect x="14" y="10" width="54" height="84" rx="4" fill="#2a1d07" stroke="#e0b25c" stroke-width="3"/><circle cx="56" cy="54" r="4" fill="#e0b25c"/><path d="M90 52H40M54 38l-14 14 14 14" stroke="#fff3d4" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>', () => this.codeSheet('join')),
        door('watch', '観戦する', '', 'あいことばで友達の対戦を見る', '<svg viewBox="0 0 60 60" fill="none"><path d="M4 30s10-16 26-16 26 16 26 16-10 16-26 16S4 30 4 30z" stroke="#c2d2d4" stroke-width="3"/><circle cx="30" cy="30" r="8" fill="#c2d2d4"/></svg>', () => this.codeSheet('watch'))),
      h('div', { class: 'pn' }, h('p', { style: 'margin:10px 0 0;font-size:12px;line-height:1.7;color:#c2d2d4' }, '招待リンクを開いた友達は、名前とデッキを選ぶだけで入れます。部屋の中でもデッキと名前を変えられます。', h('br', {}), `フレンド対戦の戦績 ${o.win}勝 ${o.lose}敗${o.draw ? ` ${o.draw}分` : ''} ・ 勝利でコイン${MATCH_REWARD.online[0]}`)),
    ]);
    if (invite) setTimeout(() => this.codeSheet('join', invite), 60);
  }
  private bestDeck() {
    const decks = store.allDecks();
    return decks.find((d) => d.id === store.settings.lastDeck && d.valid) ?? decks.find((d) => d.valid) ?? decks[0];
  }
  private createRoom() {
    const flow = this.host.flow();
    const d = this.bestDeck();
    audio.play('summon');
    flow.create(store.settings.name || 'プレイヤー', d.cards);
  }
  /** Enter a room code: to play (with a name and a deck) or to look on. */
  private codeSheet(mode: 'join' | 'watch', code0 = '') {
    const flow = this.host.flow();
    let code = code0;
    let deck = this.bestDeck();
    let name = store.settings.name;
    const go = h('button', { class: 'hexbtn gold big', disabled: !normalizeCode(code), onclick: () => {
      const c = normalizeCode(code); if (!c) return;
      store.settings.name = cleanName(name); if (mode === 'join') store.settings.lastDeck = deck.id; store.saveSettings();
      ref.close();
      audio.play('summon');
      if (mode === 'join') flow.join(c, name, deck.cards); else flow.watch(c, name);
    } }, mode === 'join' ? '入室' : '観戦する');
    const input = h('input', { class: 'code-input', value: code, maxlength: String(NET.CODE_LEN + 2), placeholder: 'ABCDE', autocomplete: 'off', autocapitalize: 'characters', 'aria-label': 'あいことば',
      oninput: (e: Event) => { const el = e.target as HTMLInputElement; code = el.value.toUpperCase(); el.value = code; go.disabled = !normalizeCode(code); } });
    const deckRow = () => h('button', { class: 'deckban', style: artStyle(deckKey(deck)), onclick: () => this.deckPick(deck.id, (d) => { deck = d; rows.replaceChildren(deckRow()); }) }, h('small', {}, 'デッキ（タップで変える）'), h('b', {}, deck.name));
    const rows = h('div', {}, deckRow());
    const ref = this.sheet(mode === 'join' ? 'あいことばで入る' : '観戦する', mode === 'join' ? ICON.door : ICON.eye, [
      code0 ? h('div', { class: 'invite' }, '友達から招待されています。名前とデッキを確かめて「入室」を押してください。') : null,
      h('div', { class: 'sec-title' }, 'あいことば'), input,
      h('div', { class: 'sec-title' }, 'あなたの名前'),
      h('input', { class: 'text', value: name, maxlength: String(NET.NAME_MAX), placeholder: 'プレイヤー', autocomplete: 'nickname', 'aria-label': '名前', oninput: (e: Event) => { name = (e.target as HTMLInputElement).value; } }),
      mode === 'join' ? rows : h('p', { class: 'shop-note' }, '観戦中は、両方の手札は見えません'),
    ], [go]);
    if (!code0) setTimeout(() => input.focus(), 60);
  }
  /** Pick one of the decks that can be played. */
  private deckPick(cur: string, done: (d: AnyDeck) => void) {
    const ref = this.sheet('デッキを選ぶ', ICON.deck, [h('div', { class: 'dtiles' }, ...store.allDecks().map((d) => h('button', { class: `dtile${d.id === cur ? ' on' : ''}${d.preset ? ' preset' : ''}`, style: artStyle(deckKey(d)), disabled: !d.valid, onclick: () => { ref.close(); done(d); } },
      h('div', { class: 't' }, h('b', {}, d.name), h('small', { class: d.valid ? '' : 'bad' }, d.valid ? `${d.cards.length}枚` : '使えません')))))]);
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

  /** The room: the other seat on top (as on the board), the code in the middle, you at the bottom. */
  lobby() {
    const flow = this.host.flow();
    let note = '';
    const copy = async (text: string) => {
      try { await navigator.clipboard.writeText(text); note = 'コピーしました'; }
      catch { note = '長押しでコピーしてください'; }
      this.host.root.replaceChildren(build());
    };
    const seatCard = (p: { name: string; title?: string; fav?: string }, side: 'you' | 'foe', extra: HTMLElement | null) => h('div', { class: 'seat-card' },
      h('span', { class: 'fav' }, h('img', { src: cardImg(p.fav && CARDS[p.fav] ? p.fav : 'gear'), alt: '' })),
      h('div', { class: 'info' }, h('span', { class: 'who' }, side === 'you' ? 'あなた' : '相手'), h('b', {}, p.name), ribbon(p.title), extra));
    const build = () => {
      const foe = flow.foe;
      const link = inviteLink(flow.code);
      const myDeck = store.allDecks().find((d) => d.cards.length === flow.myDeck.length && d.cards.every((c, i) => c === flow.myDeck[i])) ?? this.bestDeck();
      return h('div', { class: 'room' },
        h('div', { class: 'seat foe' },
          h('header', { class: 'cd-top' }, h('button', { class: 'back-arrow', onclick: () => { flow.leave(); this.onlineMenu(); } }, '部屋を出る'), h('h1', {}, 'フレンド対戦')),
          foe ? seatCard(foe, 'foe', h('small', { class: 'muted' }, foe.online ? '入室しました' : '接続が切れています'))
            : h('div', { class: 'wait-slot' }, h('span', { html: '<svg viewBox="0 0 44 44" fill="none"><circle cx="22" cy="22" r="19" stroke="currentColor" stroke-width="2" stroke-dasharray="3 5"/><path d="M22 22V10M22 22l8 5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>' }),
                h('b', {}, '相手を待っています…'), h('small', {}, 'あいことばを伝えるか、招待リンクを送ってください', h('br', {}), '相手が入ると自動で始まります'))),
        h('div', { class: 'room-mid' },
          h('small', {}, 'あいことば'),
          h('div', { class: 'codebox', 'aria-label': `あいことば ${flow.code}` }, ...[...flow.code].map((c) => h('span', {}, c))),
          h('div', { class: 'row2' },
            h('button', { class: 'chip-btn', onclick: () => copy(flow.code) }, h('span', { html: ICON.copy }), 'あいことばをコピー'),
            typeof navigator.share === 'function'
              ? h('button', { class: 'chip-btn gold', onclick: () => { void navigator.share({ title: 'クロノ・デュエル', text: 'クロノ・デュエルで勝負しよう！', url: link }).catch(() => undefined); } }, h('span', { html: ICON.share }), '招待リンクを送る')
              : h('button', { class: 'chip-btn gold', onclick: () => copy(link) }, h('span', { html: ICON.share }), '招待リンクをコピー')),
          note ? h('div', { class: 'note' }, note) : null,
          flow.linkStatus === 'reconnecting' ? h('div', { class: 'note warn' }, '接続を再試行中…') : null),
        h('div', { class: 'seat you' },
          seatCard({ name: flow.myName || store.settings.name, title: shownTitle()?.id, fav: favCard() }, 'you',
            h('div', { class: 'deckban', style: artStyle(deckKey(myDeck)) }, h('small', {}, 'デッキ'), h('b', {}, myDeck.name))),
          h('div', { class: 'foot' }, h('div', { class: 'btn-row' },
            h('button', { class: 'hexbtn', disabled: !!foe, onclick: () => this.deckPick(myDeck.id, (d) => { store.settings.lastDeck = d.id; store.saveSettings(); flow.setup({ deck: d.cards }); }) }, 'デッキを変える'),
            h('button', { class: 'hexbtn', disabled: !!foe, onclick: () => {
              let name = flow.myName;
              const input = h('input', { class: 'text', maxlength: String(NET.NAME_MAX), value: name, oninput: (e: Event) => { name = (e.target as HTMLInputElement).value; } });
              const s = this.sheet('名前を変える', ICON.pen, [input], [h('button', { class: 'hexbtn gold', onclick: () => { store.settings.name = cleanName(name); store.saveSettings(); flow.setup({ name }); s.close(); } }, '決定')]);
              setTimeout(() => input.focus(), 50);
            } }, '名前を変える')))));
    };
    this.live(build, (fn) => flow.onChange(fn));
  }
  /** Looking on, before the game starts (or between games). */
  watchLobby() {
    const flow = this.host.flow();
    const build = () => {
      const [a, b] = flow.seats;
      const nm = (p: Presence | null) => p ? p.name : '―';
      return h('div', { class: 'cd-page' },
        topBar('観戦', () => { flow.leave(); this.onlineMenu(); }),
        h('div', { class: 'cd-scroll' },
          h('div', { class: 'pn gold' }, h('span', { class: 'hd' }, `あいことば ${flow.code}`),
            h('div', { class: 'watch-wait' },
              h('div', { class: 'seats' }, h('b', {}, nm(a)), h('i', {}, 'VS'), h('b', {}, nm(b))),
              h('div', { class: 'spinner', 'aria-hidden': 'true' }),
              h('p', { class: 'shop-note' }, flow.phase === 'lobby' ? (b ? '対戦が始まるのを待っています' : 'もう1人が入るのを待っています') : '対戦の終わりを待っています', h('br', {}), `観戦中 ${flow.watchers}人`)))));
    };
    this.live(build, (fn) => flow.onChange(fn));
  }

  // ---------------------------------------------------------------- shop
  shop() {
    const w = store.wallet;
    const pack = PACKS[0];
    const setCards = CARD_LIST.filter((c) => setOf(c) === pack.set).sort((a, b) => RANK[b.rarity] - RANK[a.rarity]);
    const tile = (title: string, sub: string, vis: HTMLElement, fn: () => void, tag?: HTMLElement | null) => h('button', { class: 'stile', onclick: () => { audio.play('select'); fn(); } },
      tag ?? null, h('span', {}, h('span', { class: 'vis' }, vis), h('span', { class: 'lb' }, h('b', {}, title), h('small', {}, sub))));
    const backs = LOOKS.filter((l) => l.kind === 'back' && !ownsLook(w, l.id)).length;
    const dials = LOOKS.filter((l) => l.kind === 'dial' && !ownsLook(w, l.id)).length;
    const mats = LOOKS.filter((l) => l.kind === 'mat' && !ownsLook(w, l.id)).length;
    this.hub('shop', h('div', { class: 'tab-page' },
      h('button', { class: 'feat-strip', onclick: () => this.packShop(pack) },
        h('img', { src: cardImg(setCards[0]?.id ?? 'dragon'), alt: '' }),
        h('div', {}, h('small', {}, 'NEW PACK'), h('b', {}, `${SET_NAMES[pack.set].replace(/^第1弾/, '第1弾 ')}`), h('span', {}, `新カード${setCards.length}種 ・ 1パック${pack.size}枚、最後の1枚は希少以上`))),
      h('div', { class: 'stiles' },
        tile('パックを引く', 'コイン・チケット', h('span', {}, h('img', { class: 'l', src: cardImg(setCards[1]?.id ?? 'gear'), alt: '' }), h('img', { class: 'r', src: cardImg(setCards[0]?.id ?? 'gear'), alt: '' })), () => this.packShop(pack), canOpen(w, pack) ? h('span', { class: 'new-tag' }, '引ける') : null),
        tile('スリーブ', backs ? `コインで交換 ・ ${backs}種` : 'すべて持っています', h('span', { html: `<svg viewBox="0 0 120 130" fill="none"><rect x="14" y="14" width="64" height="92" rx="6" fill="#13323b" stroke="#8fa9ad" stroke-width="2" transform="rotate(-10 46 60)"/><rect x="40" y="20" width="64" height="92" rx="6" fill="#3a1a14" stroke="#e0b25c" stroke-width="2.5" transform="rotate(8 72 66)"/><g transform="rotate(8 72 66)"><path d="M72 42l14 24-14 24-14-24z" stroke="#e0b25c" stroke-width="2"/><circle cx="72" cy="66" r="7" fill="#e0b25c"/></g></svg>` }), () => this.looksShop('back')),
        tile('盤面の文字盤', dials ? `対戦中の時計 ・ ${dials}種` : 'すべて持っています', h('span', { html: '<svg viewBox="0 0 132 132" fill="none"><circle cx="66" cy="66" r="58" fill="#0f2f33" stroke="#c99640" stroke-width="5"/><circle cx="66" cy="66" r="48" stroke="#e0b25c" stroke-width="1" stroke-dasharray="2 5"/><g stroke="#f1e7d0" stroke-width="2.4"><path d="M66 12v10M66 110v10M12 66h10M110 66h10"/></g><path d="M66 66V30" stroke="#fff3d4" stroke-width="4" stroke-linecap="round"/><path d="M66 66l26 16" stroke="#5fd0b5" stroke-width="4" stroke-linecap="round"/><circle cx="66" cy="66" r="6" fill="#e0b25c"/></svg>' }), () => this.looksShop('dial')),
        tile('プレイマット', mats ? `自分の側の盤面 ・ ${mats}種` : 'すべて持っています', h('span', { html: '<svg viewBox="0 0 132 120" fill="none"><path d="M10 40 L122 40 L114 108 L18 108 Z" fill="#1d170e" stroke="#c99640" stroke-width="3"/><g transform="translate(40 92)"><circle r="26" stroke="#8a6a32" stroke-width="7" stroke-dasharray="5 5"/><circle r="17" fill="#2a2214" stroke="#a7843f" stroke-width="2"/></g><g fill="#0a1418" stroke="#e8dcc0" stroke-opacity=".5" stroke-width="1.5"><rect x="26" y="50" width="22" height="28" rx="3"/><rect x="55" y="50" width="22" height="28" rx="3"/><rect x="84" y="50" width="22" height="28" rx="3"/></g><path d="M10 40 H122" stroke="#e0b25c" stroke-width="2"/></svg>' }), () => this.looksShop('mat')),
        tile('テーマ一式', `3点セット ・ ${THEME_SET_PRICE}コイン`, h('span', { html: '<svg viewBox="0 0 132 120" fill="none"><rect x="64" y="22" width="44" height="62" rx="5" fill="#2a1f10" stroke="#e0b25c" stroke-width="2.5" transform="rotate(10 86 53)"/><path d="M10 96 A50 50 0 0 1 110 96 Z" fill="#13285e" stroke="#e0b85a" stroke-width="3"/><circle cx="60" cy="96" r="30" fill="none" stroke="#e0b85a" stroke-width="7" stroke-opacity=".5" stroke-dasharray="14 2"/><path d="M60 96 L30 80" stroke="#5fd0b5" stroke-width="4" stroke-linecap="round"/></svg>' }), () => this.themeShop(), h('span', { class: 'new-tag' }, 'NEW')),
        tile('欠片で作る', `時の欠片 ${fmt(w.shards)}`, h('span', { html: '<svg viewBox="0 0 130 120" fill="none"><path d="M34 30l14 14-14 26-14-26z" fill="#9fe8ff" stroke="#e0f9ff" stroke-width="1.4"/><path d="M96 24l12 12-12 22-12-22z" fill="#9fe8ff" stroke="#e0f9ff" stroke-width="1.4"/><rect x="44" y="40" width="44" height="62" rx="5" fill="#13323b" stroke="#e0b25c" stroke-width="2.5"/><path d="M66 56v22M55 67h22" stroke="#e0b25c" stroke-width="3" stroke-linecap="round"/></svg>' }), () => this.collection('craft'))),
      h('div', { class: 'sec-title' }, 'コインの集め方'),
      h('ul', { class: 'earn' },
        h('li', {}, `AI（ふつう）に勝利 ${MATCH_REWARD['ai-normal'][0]} ・ AI（つよい）に勝利 ${MATCH_REWARD['ai-hard'][0]} ・ オンラインで勝利 ${MATCH_REWARD.online[0]}`),
        h('li', {}, `負けても参加で ${MATCH_REWARD['ai-normal'][1]}〜${MATCH_REWARD.online[1]}、引き分け ${MATCH_REWARD['ai-normal'][2]}〜${MATCH_REWARD.online[2]}`),
        h('li', {}, `その日はじめての勝利で +${DAILY_BONUS}（対戦の報酬は1日${DAILY_MATCH_CAP}コインまで）`),
        h('li', {}, 'ログインボーナス・デイリーミッション・ランクアップでも手に入ります')),
      h('p', { class: 'shop-note' }, 'すべてゲーム内で手に入る通貨で交換できます。現金では買えません。'),
    ));
  }

  /** One pack: its art, what is inside, the pity count, and how to pay. */
  packShop(pack: PackDef) {
    const render = () => {
      const w = store.wallet;
      const pay = canOpen(w, pack);
      const left = PITY - w.pity;
      const setCards = CARD_LIST.filter((c) => setOf(c) === pack.set).sort((a, b) => RANK[b.rarity] - RANK[a.rarity] || a.cost - b.cost);
      const hero = setCards[0]?.id ?? 'dragon';
      const open = () => {
        if (!canOpen(store.wallet, pack)) return;
        if (store.settings.packConfirm) this.packConfirm(pack, () => this.host.openPack(pack.id));
        else { audio.play('summon'); this.host.openPack(pack.id); }
      };
      const prog = setProgress(w, pack.set);
      this.page('パックを引く', () => this.shop(), [
        h('div', { class: 'ptabs' }, h('button', { class: 'ptab', style: `background-image:url("${cardImg(hero)}")` }, h('b', {}, pack.name), h('span', { class: 'new-tag' }, 'NEW'))),
        h('div', { class: 'pstage' },
          h('div', { class: 'bg', style: `background-image:url("${cardImg(hero)}")` }),
          h('div', { class: 'info' },
            h('small', {}, 'BOOSTER ・ SET 1'), h('b', {}, pack.name),
            h('p', {}, '使った術が、少し遅れて', h('br', {}), 'もう一度響く。'),
            h('div', { class: 'spec' }, `1パック${pack.size}枚`, h('br', {}), '最後の1枚は 希少以上', h('br', {}), `収集 ${prog.kinds}/${prog.kindsTotal}種`)),
          h('div', { class: 'pack' }, h('img', { src: packImg(pack.name, pack.sub), alt: `${pack.name} パック` })),
          h('div', { class: 'pity' },
            h('div', { class: 'ln' }, h('b', {}, '伝説の確定まで'), h('span', {}, left <= 1 ? '次のパックで確定！' : h('span', {}, 'あと ', h('span', { class: 'num', style: 'font-size:15px;color:var(--gold-hi)' }, String(left)), ' パック'))),
            h('div', { class: 'ticks' }, ...Array.from({ length: PITY }, (_, i) => h('i', { class: i < w.pity ? 'on' : i === PITY - 1 ? 'goal' : '' })))),
          h('div', { class: 'links' },
            h('button', { class: 'chip-btn', onclick: () => this.packList(pack) }, '入っているカード'),
            h('button', { class: 'chip-btn', onclick: () => this.packOdds(pack) }, '出る確率'))),
        h('div', { class: 'buyrow' },
          h('div', { class: 'p' }, h('b', {}, h('span', { class: 'ic-ticket', style: 'width:20px;height:13px' }), 'チケット ', h('span', { class: 'num' }, '1'), '枚'), h('small', {}, `所持 ${w.tickets}枚 ・ 先に使われます`)),
          h('button', { class: 'hexbtn teal', disabled: pay !== 'ticket', onclick: open }, 'チケットで引く')),
        h('div', { class: 'buyrow' },
          h('div', { class: 'p' }, h('b', {}, h('span', { class: 'ic-coin', style: 'width:18px;height:18px' }), 'コイン ', h('span', { class: 'num' }, String(pack.price))), h('small', {}, w.tickets ? `所持 ${fmt(w.coins)} ・ チケットがある間はチケットを使います` : `所持 ${fmt(w.coins)}`)),
          h('button', { class: 'hexbtn gold', disabled: pay !== 'coins', onclick: open }, 'コインで引く')),
        !pay ? h('p', { class: 'shop-note', style: 'color:#ff9a80' }, `コインが足りません（あと${pack.price - w.coins}）。対戦で集めましょう。`) : null,
        h('p', { class: 'shop-note' }, '同じカードが上限を超えたら 時の欠片 に変わります'),
      ], [purse({ shards: false })]);
    };
    render();
  }
  private packConfirm(pack: PackDef, go: () => void) {
    const w = store.wallet;
    const pay = canOpen(w, pack);
    if (!pay) return;
    let skip = false;
    const left = PITY - w.pity - 1;
    const ref = this.sheet('このパックを引きますか？', null, [
      h('div', { class: 'confirm-pack' },
        h('img', { src: packImg(pack.name, pack.sub), alt: '' }),
        h('div', { style: 'font-size:14px' }, `${pack.name} `, h('span', { class: 'num' }, '×1'), h('span', { class: 'muted', style: 'font-size:12px' }, ` ・ ${pack.size}枚`)),
        h('div', { class: 'pay-box' },
          pay === 'ticket'
            ? h('div', {}, h('span', { class: 'ic-ticket', style: 'width:22px;height:14px' }), h('span', { class: 'lbl' }, 'チケット'), h('span', { class: 'num' }, String(w.tickets)), h('span', { class: 'arrow' }, '→'), h('span', { class: 'num to' }, String(w.tickets - 1)))
            : h('div', {}, h('span', { class: 'ic-coin', style: 'width:20px;height:20px' }), h('span', { class: 'lbl' }, 'コイン'), h('span', { class: 'num' }, fmt(w.coins)), h('span', { class: 'arrow' }, '→'), h('span', { class: 'num to' }, fmt(w.coins - pack.price))),
          pay === 'ticket' ? h('div', {}, h('span', { class: 'lbl' }, `コイン ${fmt(w.coins)}（減りません）`)) : null),
        h('div', { class: 'shop-note' }, left <= 0 ? 'このパックで伝説が確定します' : `この1パックで 伝説の確定まで あと ${left} パック`)),
    ], [
      h('div', { class: 'btn-row', style: 'width:100%' },
        h('button', { class: 'hexbtn silver', onclick: () => ref.close() }, 'やめる'),
        h('button', { class: `hexbtn ${pay === 'ticket' ? 'teal' : 'gold'}`, style: 'flex:1.4', onclick: () => { if (skip) { store.settings.packConfirm = false; store.saveSettings(); } ref.close(); audio.play('summon'); go(); } }, pay === 'ticket' ? 'チケットで引く' : 'コインで引く')),
      h('label', { class: 'check2' }, h('input', { type: 'checkbox', onchange: (e: Event) => { skip = (e.target as HTMLInputElement).checked; } }), '次から確認しない（設定で戻せます）'),
    ]);
  }
  private packList(pack: PackDef) {
    const cards = CARD_LIST.filter((c) => setOf(c) === pack.set).sort((a, b) => RANK[b.rarity] - RANK[a.rarity] || a.cost - b.cost);
    const ids = cards.map((c) => c.id);
    this.sheet('入っているカード', ICON.book, [
      h('p', { class: 'shop-note' }, `${cards.length}種 ・ タップで詳しく`),
      h('div', { class: 'grid' }, ...cards.map((c) => { const o = ownedCount(store.wallet, c.id); return h('button', { class: `tile${o ? '' : ' locked'}`, onclick: () => this.cardDetail(c.id, { list: ids }) }, h('img', { src: cardImg(c.id), alt: c.name, loading: 'lazy' }), h('span', { class: 'own' }, o ? `所持 ${o}` : '未所持')); })),
    ]);
  }
  private packOdds(pack: PackDef) {
    const cards = CARD_LIST.filter((c) => setOf(c) === pack.set);
    this.sheet('出る確率', null, [h('div', { class: 'odds2' },
      h('p', { style: 'margin:0 0 8px;font-size:13px;line-height:1.7' }, `1パック${pack.size}枚：1〜3枚目は通常、4枚目は希少、5枚目は下の割合で決まります。同じレア度の中では各カードが等しい確率で出ます（伝説は未所持のカードを優先）。`),
      h('table', {}, h('tr', {}, h('th', {}, '5枚目'), h('th', {}, '確率'), h('th', {}, '収録')), ...LAST_SLOT.map(([r, pr]) => h('tr', {}, h('td', {}, RARITY_NAMES[r]), h('td', {}, `${Math.round(pr * 1000) / 10}%`), h('td', {}, `${cards.filter((c) => c.rarity === r).length}種`)))),
      h('p', { style: 'margin:8px 0 0;font-size:13px;line-height:1.7' }, `天井：伝説が出ないまま${PITY}パック目を開けると、5枚目は必ず伝説になります。ゲーム内コインは遊んで得るもので、現金では購入できません。`))]);
  }

  /** Card backs or clock faces: buy with coins, then pick one per deck. */
  looksShop(kind: LookKind) {
    const render = () => {
      const w = store.wallet;
      const list = LOOKS.filter((l) => l.kind === kind);
      const cur = deckLook(store.settings.lastDeck, kind);
      const note: Record<LookKind, string> = {
        back: 'カードの裏の柄です。山札の束と、伏せて出したカードに出て、対戦相手にも見えます。デッキごとに選べます（デッキ一覧の「スリーブ」）。',
        dial: '対戦中の時計の見た目です。デッキごとに選べます（デッキ一覧の「文字盤」）。',
        mat: '対戦中、自分の側の盤面に敷くマットです。相手の画面にも、相手側に薄く映ります。デッキごとに選べます（デッキ一覧の「マット」）。',
      };
      this.page(LOOK_TITLE[kind], () => this.shop(), [
        h('p', { class: 'shop-note', style: 'text-align:left' }, note[kind]),
        h('button', { class: 'chip-btn', style: 'justify-self:start', onclick: () => this.themeShop() }, `テーマ一式でまとめて交換（3点${THEME_SET_PRICE}コイン）`),
        h('div', { class: 'looks' }, ...list.map((l) => {
          const owned = ownsLook(w, l.id);
          const block = lookBlock(w, l.id);
          return h('div', { class: `look${l.id === cur ? ' on' : ''}` },
            h('div', { class: 'pv' }, lookPreview(kind, l.id)),
            h('b', {}, l.name), h('small', {}, l.theme ? `${THEMES.find((t) => t.id === l.theme)?.name}・${l.blurb}` : l.blurb),
            owned
              ? h('button', { class: `hexbtn ${l.id === cur ? 'silver' : ''}`, disabled: l.id === cur, onclick: () => { const id = store.settings.lastDeck; store.deckLooks[id] = { ...store.lookOf(id), [kind]: l.id }; store.saveDeckLooks(); audio.play('select'); this.toast(`いまのデッキで「${l.name}」を使います`); render(); } }, l.id === cur ? '使用中' : 'いまのデッキで使う')
              : h('button', { class: `hexbtn ${block ? '' : 'gold'}`, disabled: !!block, onclick: () => { if (buyLook(store.wallet, l.id)) { store.saveWallet(); audio.play('rareR'); this.toast(`「${l.name}」を手に入れました`); render(); } } }, h('span', {}, h('span', { class: 'ic-coin', style: 'width:14px;height:14px;vertical-align:-2px;margin-right:4px' }), fmt(l.price)), block && block !== '持っています' ? h('small', {}, block) : null));
        })),
      ], [purse({ shards: false })]);
    };
    render();
  }

  /** Themes: the three looks that belong together, with a set price for what is still missing. */
  themeShop() {
    const render = () => {
      const w = store.wallet;
      const deck = store.settings.lastDeck;
      this.page('テーマ一式', () => this.shop(), [
        h('p', { class: 'shop-note', style: 'text-align:left' }, `文字盤・スリーブ・マットの3点がそろったテーマです。3点セットは${THEME_SET_PRICE}コイン。一部を持っているときは、セット価格からその分を引いた額でそろえられます。`),
        ...THEMES.map((t) => {
          const parts = LOOKS.filter((l) => l.theme === t.id);
          const offer = themeOffer(w, t.id);
          const all = !offer.ids.length;
          const using = parts.every((l) => deckLook(deck, l.kind) === l.id);
          return h('div', { class: 'theme-row pn' },
            h('div', { class: 'theme-hd' }, h('b', {}, t.name), h('small', {}, t.blurb)),
            h('div', { class: 'theme-pv' },
              h('div', { class: 'tp dial' }, dialPreview(`dial:${t.id}`)),
              h('div', { class: 'tp back' }, h('img', { src: backImg(`back:${t.id}`), alt: '' })),
              h('div', { class: 'tp mat' }, matPreview(`mat:${t.id}`))),
            h('div', { class: 'theme-own' }, ...parts.map((l) => h('span', { class: ownsLook(w, l.id) ? 'ok' : '' }, `${LOOK_TITLE[l.kind].replace('盤面の', '')}「${l.name}」${ownsLook(w, l.id) ? ' ✓' : ` ${fmt(l.price)}`}`))),
            all
              ? h('button', { class: `hexbtn ${using ? 'silver' : 'gold'}`, disabled: using, onclick: () => { store.deckLooks[deck] = { ...store.lookOf(deck), back: `back:${t.id}`, dial: `dial:${t.id}`, mat: `mat:${t.id}` }; store.saveDeckLooks(); audio.play('select'); this.toast(`いまのデッキを「${t.name}」にしました`); render(); } }, using ? 'いまのデッキで使用中' : 'いまのデッキを3点ともこのテーマに')
              : h('button', { class: 'hexbtn gold', disabled: w.coins < offer.price, onclick: () => { if (buyTheme(store.wallet, t.id)) { store.saveWallet(); audio.play('rareR'); this.toast(`「${t.name}」をそろえました`); render(); } } },
                h('span', {}, h('span', { class: 'ic-coin', style: 'width:14px;height:14px;vertical-align:-2px;margin-right:4px' }), fmt(offer.price), offer.price < offer.full ? h('s', { style: 'opacity:.6;margin-left:6px;font-size:.85em' }, fmt(offer.full)) : null),
                w.coins < offer.price ? h('small', {}, `コインが${fmt(offer.price - w.coins)}足りません`) : h('small', {}, `${offer.ids.length}点をまとめて交換`)));
        }),
      ], [purse({ shards: false })]);
    };
    render();
  }
}

/** Everything the beginner missions pay out in total. */
function BEGINNER_TOTAL() {
  return beginnerView({ counters: {}, beginnerClaimed: [] } as never).reduce((a, v) => ({ coins: a.coins + (v.m.prize.coins ?? 0), tickets: a.tickets + (v.m.prize.tickets ?? 0) }), { coins: 0, tickets: 0 });
}
// keep imports used only in types or in rarely used paths from being dropped by mistake
void svg;
