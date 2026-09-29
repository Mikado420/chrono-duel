import { CARD_LIST, cardDef } from '../core/cards';
import { maxCopies, PRESET_DECKS, validateDeck, type DeckDef } from '../core/decks';
import { RULES } from '../core/rules';
import { audio } from '../render/audio';
import type { BattleResult } from '../render/battle';
import { cardFace } from '../render/cardArt';
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

const imgCache = new Map<string, string>();
function cardImg(id: string): string {
  let u = imgCache.get(id);
  if (!u) { u = cardFace(id).toDataURL('image/webp', 0.9); imgCache.set(id, u); }
  return u;
}

export interface ScreenHost {
  root: HTMLElement;
  startBattle(deck: DeckDef, ai: DeckDef, level: 'normal' | 'hard'): void;
  applySettings(): void;
}

export class Screens {
  constructor(private host: ScreenHost) {}
  private mount(el: HTMLElement) {
    this.host.root.replaceChildren(el);
    return el;
  }
  clear() { this.host.root.replaceChildren(); }

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
      h('div', { class: 'menu' },
        h('button', { class: 'btn primary', onclick: click(() => this.setup()) }, '対戦する'),
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
      }, h('div', {}, h('div', { class: 'nm' }, d.name), h('div', { class: 'ds' }, d.blurb ?? `${d.cards.length}枚・自作デッキ`)), !d.valid ? h('span', { class: 'badge' }, '未完成') : null));
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
          !d.valid ? h('span', { class: 'badge' }, '未完成') : null,
          h('button', { class: 'btn small', onclick: () => this.editor(d.preset ? { id: `c${Date.now()}`, name: `${d.name}（改）`, cards: d.cards.slice() } : { id: d.id, name: d.name, cards: d.cards.slice() }) }, d.preset ? '複製して編集' : '編集'),
        ))),
        h('button', { class: 'btn primary', onclick: () => this.editor({ id: `c${Date.now()}`, name: '新しいデッキ', cards: [] }) }, '新しいデッキを作る'),
      )));
  }

  editor(deck: DeckDef) {
    const cards = deck.cards.slice();
    let name = deck.name;
    let filter: 'all' | 'unit' | 'spell' = 'all';
    let tab: 'pool' | 'deck' = 'pool';
    let confirmDelete = false;
    const exists = store.customDecks.some((d) => d.id === deck.id);
    const count = (id: string) => cards.filter((c) => c === id).length;
    const add = (id: string) => { if (count(id) >= maxCopies(id) || cards.length >= RULES.DECK_SIZE) { audio.play('deny'); return; } cards.push(id); audio.play('draw'); render(); };
    const remove = (id: string) => { const i = cards.lastIndexOf(id); if (i >= 0) { cards.splice(i, 1); audio.play('select'); render(); } };
    const zoom = (id: string) => {
      const d = cardDef(id);
      const z = h('div', { class: 'zoom', onclick: (e: Event) => { if (e.target === z) z.remove(); } },
        h('div', { class: 'box' },
          h('img', { src: cardImg(id), alt: d.name }),
          h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: () => { remove(id); z.remove(); } }, '1枚抜く'),
            h('button', { class: 'btn primary', onclick: () => { add(id); z.remove(); } }, '1枚入れる'),
            h('button', { class: 'btn', onclick: () => z.remove() }, '閉じる'),
          )));
      this.host.root.firstElementChild?.append(z);
    };
    const render = () => {
      const v = validateDeck(cards);
      const pool = CARD_LIST.filter((c) => filter === 'all' || c.kind === filter).sort((a, b) => a.cost - b.cost || a.kind.localeCompare(b.kind));
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
            h('p', { style: 'font-size:13px;color:var(--mute)' }, 'タップで1枚追加。長押し（右クリック）で拡大表示。'),
            h('div', { class: 'grid' }, ...pool.map((c) => {
              const n = count(c.id);
              const t = h('button', { class: `tile${n >= maxCopies(c.id) ? ' maxed' : ''}`, 'aria-label': `${c.name}を追加`, onclick: () => add(c.id), oncontextmenu: (e: Event) => { e.preventDefault(); zoom(c.id); } },
                h('img', { src: cardImg(c.id), alt: c.name, loading: 'lazy' }),
                n ? h('span', { class: 'cnt' }, String(n)) : null);
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

  result(r: BattleResult, again: () => void, leave: () => void) {
    const kind = r.winner === 0 ? 'win' : r.winner === 1 ? 'lose' : 'draw';
    const title = kind === 'win' ? '勝利' : kind === 'lose' ? '敗北' : '引き分け';
    const why = r.reason === 'ko' ? (kind === 'win' ? '相手の拠点を破壊した' : '拠点を破壊された') : r.reason === 'surrender' ? '降参した' : `${RULES.END}刻に到達 ・ 体力の差で決着`;
    this.mount(h('div', { class: `screen dim result ${kind}` },
      h('h1', {}, title),
      h('div', { class: 'why' }, why),
      h('div', { class: 'stats' },
        h('div', {}, h('b', {}, String(Math.max(0, r.myHp))), h('span', {}, 'あなたの体力')),
        h('div', {}, h('b', {}, String(Math.max(0, r.foeHp))), h('span', {}, 'AIの体力')),
        h('div', {}, h('b', {}, String(r.actions)), h('span', {}, '総行動数'))),
      h('div', { class: 'menu' },
        h('button', { class: 'btn primary', onclick: again }, 'もう一度'),
        h('button', { class: 'btn', onclick: () => { leave(); this.setup(); } }, 'デッキを変えて対戦'),
        h('button', { class: 'btn', onclick: () => { leave(); this.title(); } }, 'タイトルへ')),
    ));
  }
}
