import { CARD_LIST, RARITY_NAMES, SET_NAMES, cardDef, keywordsOf, KEYWORD_HELP, setOf, type CardSet } from '../core/cards';
import { maxCopies, PRESET_DECKS, validateDeck, type DeckDef } from '../core/decks';
import { NET, normalizeCode } from '../core/net';
import { RULES } from '../core/rules';
import { inviteLink } from '../net/config';
import type { OnlineFlow } from '../net/flow';
import { audio } from '../render/audio';
import type { BattleResult } from '../render/battle';
import { cardFace, packArt } from '../render/cardArt';
import { DAILY_BONUS, DUPE_COINS, LAST_SLOT, MIN_ACTIONS, PACKS, PITY, canOpen, ownedCount, setProgress, type Reward } from '../meta/economy';
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
    w.tickets ? h('span', { class: 'ticket', 'aria-label': `パックチケット ${w.tickets}枚` }, h('i', {}), `×${w.tickets}`) : null);
}
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
  title() {
    const r = store.record;
    const click = (fn: () => void) => () => { audio.play('select'); fn(); };
    this.mount(h('div', { class: 'screen title' },
      h('div', { class: 'logo' },
        h('span', { class: 'en' }, 'CHRONO DUEL'),
        h('h1', {}, 'クロノ・デュエル'),
        h('span', { class: 'tag' }, 'ターンはない。時間を奪い合え。'),
      ),
      purse(),
      h('div', { class: 'menu' },
        h('button', { class: 'btn primary', onclick: click(() => this.setup()) }, 'AIと対戦'),
        h('button', { class: 'btn primary', onclick: click(() => this.onlineMenu()) }, '友達とオンライン対戦'),
        h('button', { class: 'btn shop-btn', onclick: click(() => this.shop()) }, 'ショップ',
          PACKS.some((p) => canOpen(store.wallet, p)) ? h('span', { class: 'dot', 'aria-label': '開封できるパックがあります' }) : null,
          h('span', { class: 'new-set' }, '第1弾')),
        h('button', { class: 'btn', onclick: click(() => this.decks()) }, 'デッキ編集'),
        h('button', { class: 'btn', onclick: click(() => this.rules(() => this.title())) }, '遊び方'),
        h('button', { class: 'btn', onclick: click(() => this.settings(() => this.title())) }, '設定'),
      ),
      h('div', { class: 'record', html: `戦績　<b>${r.win}</b> 勝　<b>${r.lose}</b> 敗${r.draw ? `　<b>${r.draw}</b> 分` : ''}` }),
    ));
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
          h('div', { class: 'head' }, h('h2', {}, '対戦の準備'), h('button', { class: 'btn small', onclick: () => this.title() }, '戻る')),
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
    this.mount(h('div', { class: 'screen dim' },
      h('div', { class: 'panel' },
        h('div', { class: 'head' }, h('h2', {}, 'デッキ'), h('button', { class: 'btn small', onclick: () => this.title() }, '戻る')),
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
    if (!rw.total) return h('div', { class: 'reward none' }, `コインは短すぎる対戦（自分の行動${MIN_ACTIONS}回未満）や降参では得られません`);
    const total = h('b', {}, '+0');
    const box = h('div', { class: 'reward' },
      h('div', { class: 'lines' }, ...rw.lines.map((l) => h('div', {}, h('span', {}, l.label), h('span', {}, `+${l.coins}`)))),
      h('div', { class: 'total' }, h('i', { class: 'coin-ic' }), total, h('span', {}, ` コイン（所持 ${store.wallet.coins}）`)));
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

  private resultView(r: BattleResult, foeLabel: string, buttons: (HTMLElement | null)[], note?: string, rw?: Reward) {
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
      h('div', { class: 'menu' }, ...buttons));
  }

  result(r: BattleResult, again: () => void, leave: () => void, rw?: Reward) {
    this.mount(this.resultView(r, 'AI', [
      h('button', { class: 'btn primary', onclick: again }, 'もう一度'),
      this.shopLink(leave),
      h('button', { class: 'btn', onclick: () => { leave(); this.setup(); } }, 'デッキを変えて対戦'),
      h('button', { class: 'btn', onclick: () => { leave(); this.title(); } }, 'タイトルへ'),
    ], undefined, rw));
  }

  // ---------------------------------------------------------------- online
  onlineMenu(invite?: string) {
    const flow = this.host.flow();
    if (!flow.available) {
      this.mount(h('div', { class: 'screen dim' }, h('div', { class: 'panel' },
        h('div', { class: 'head' }, h('h2', {}, 'オンライン対戦'), h('button', { class: 'btn small', onclick: () => this.title() }, '戻る')),
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
          h('div', { class: 'head' }, h('h2', {}, 'オンライン対戦'), h('button', { class: 'btn small', onclick: () => this.title() }, '戻る')),
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

  resultOnline(r: BattleResult, leave: () => void, rw?: Reward) {
    const flow = this.host.flow();
    const build = () => {
      const foe = flow.foe, rm = flow.rematch;
      const here = !!foe && foe.online;
      const label = rm.me ? '相手の返事を待っています…' : rm.foe ? '再戦する（相手が待っています）' : '再戦する';
      const note = !foe ? '相手は部屋を出ました' : !foe.online ? '相手の接続が切れています' : rm.foe && !rm.me ? '相手が再戦を希望しています' : '';
      return this.resultView(r, foe?.name ?? '相手', [
        h('button', { class: 'btn primary', disabled: rm.me || !here, onclick: () => { audio.play('select'); flow.requestRematch(); } }, label),
        h('button', { class: 'btn', onclick: () => { flow.leave(); leave(); this.onlineMenu(); } }, '部屋を出る'),
        h('button', { class: 'btn', onclick: () => { flow.leave(); leave(); this.title(); } }, 'タイトルへ'),
      ], note, rw);
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
      this.mount(h('div', { class: 'screen dim' },
        h('div', { class: 'panel shop' },
          h('div', { class: 'head' }, h('h2', {}, 'ショップ'), purse(), h('button', { class: 'btn small', onclick: () => this.title() }, '戻る')),
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
            h('li', {}, 'AI（ふつう）に勝利 40 ・ AI（つよい）に勝利 60 ・ オンラインで勝利 50'),
            h('li', {}, '負けても参加で 15〜20、引き分け 25〜35'),
            h('li', {}, `その日はじめての勝利で +${DAILY_BONUS}`),
            h('li', {}, `上限枚数を超えて出たカードはコインに（通常${DUPE_COINS.C}・希少${DUPE_COINS.R}・秘宝${DUPE_COINS.E}・伝説${DUPE_COINS.L}）`)),
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
