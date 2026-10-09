/**
 * イベント: one each week (Monday to Sunday, Japan time), in turn. Each one changes how a game against the AI is set
 * up — the decks, the opening, the clock for your moves — without touching the card rules.
 * Winning pays out at 1, 3 and 5 wins of the week (as presents).
 */
import { CARD_LIST, cardDef, setOf, type CardDef } from '../core/cards';
import { PRESET_DECKS, maxCopies } from '../core/decks';
import type { GameState } from '../core/engine';
import { RULES } from '../core/rules';

export interface EventSetup {
  /** Your deck: null means the deck you choose. */
  myDeck: string[] | null;
  aiDeck: string[];
  aiDeckName: string;
  /** Id of the AI's deck, when it is one of the base decks (its plan is known to the AI). */
  aiDeckId?: string;
  /** Strength of the AI (Lv1–10, as in rated play). */
  lv: number;
  /** Changes the opening position (after the opening hands are dealt). */
  open?: (s: GameState) => void;
  /** Time for each of your moves (ms); running out only makes you wait. */
  turnMs?: number;
}
export interface EventDef {
  id: string;
  name: string;
  /** One line under the name. */
  blurb: string;
  /** How a game of this event goes, line by line. */
  rules: string[];
  /** Whether you bring your own deck. */
  ownDeck: boolean;
  /** Whether you build the deck on the spot (刻の継承). */
  draft?: boolean;
  /** `myDeck`: your deck (own-deck events) or the deck you drafted. */
  setup(myDeck: string[] | null, rand?: () => number): EventSetup;
}

/** Cards that can be put in a deck today (sets still to come are left out). */
const pool = () => CARD_LIST.filter((c) => setOf(c) !== 'gear' && !c.token);
function randomDeck(rand: () => number, pick: (c: CardDef) => boolean = () => true): string[] {
  const cards = pool().filter(pick);
  const out: string[] = [];
  let guard = 0;
  while (out.length < RULES.DECK_SIZE && guard++ < 2000) {
    const c = cards[Math.floor(rand() * cards.length)];
    if (out.filter((x) => x === c.id).length < maxCopies(c.id)) out.push(c.id);
  }
  return out;
}
const presetOf = (rand: () => number) => PRESET_DECKS[Math.floor(rand() * PRESET_DECKS.length)];

// ------------------------------------------------------------------ 刻の継承 (draft)
export const DRAFT_PICKS = RULES.DECK_SIZE;
/** How often each rarity turns up among the three (legends are rare). */
const DRAFT_WEIGHT: Record<string, number> = { C: 1, R: 0.7, E: 0.4, L: 0.15 };
/** Three different cards to choose from, none already at its copy limit in `picked`. */
export function draftOffer(picked: string[], rand: () => number = Math.random): string[] {
  const free = pool().filter((c) => picked.filter((x) => x === c.id).length < maxCopies(c.id));
  const out: string[] = [];
  for (let k = 0; k < 3 && out.length < free.length; k++) {
    const left = free.filter((c) => !out.includes(c.id));
    const total = left.reduce((n, c) => n + (DRAFT_WEIGHT[c.rarity] ?? 1), 0);
    let r = rand() * total;
    const c = left.find((x) => (r -= DRAFT_WEIGHT[x.rarity] ?? 1) < 0) ?? left[left.length - 1];
    out.push(c.id);
  }
  return out;
}
const RARITY_SCORE: Record<string, number> = { C: 0, R: 1, E: 2, L: 3 };
/** The AI drafts too: the rarest card of each three, keeping about a third spells and a fair curve. */
export function aiDraft(rand: () => number = Math.random): string[] {
  const picks: string[] = [];
  while (picks.length < DRAFT_PICKS) {
    const offer = draftOffer(picks, rand);
    const spells = picks.filter((c) => cardDef(c).kind === 'spell').length;
    const score = (id: string) => {
      const d = cardDef(id);
      const wantSpell = spells < picks.length / 3;
      return RARITY_SCORE[d.rarity] + (d.kind === 'spell' ? (wantSpell ? 0.6 : -0.6) : 0) - (d.cost >= 6 ? 0.5 : 0) + rand() * 0.5;
    };
    picks.push(offer.reduce((a, b) => (score(b) > score(a) ? b : a)));
  }
  return picks;
}

// ------------------------------------------------------------------ 予約の嵐
export const STORM_TIMES = [6, 12, 18, 24, 30, 36];
/** Spells of the deck put on the clock at 6, 12 … 36 before the game, as many as the deck has (at most 6). */
function presetStorm(s: GameState) {
  for (const p of s.players) {
    const spells = p.deck.filter((c) => { const d = cardDef(c); return d.kind === 'spell' && !d.reserveOnly; }).slice(0, STORM_TIMES.length);
    spells.forEach((card, k) => {
      p.deck.splice(p.deck.indexOf(card), 1);
      p.resv.push({ uid: s.nextUid++, card, T: STORM_TIMES[k], revealed: false, preset: true });
    });
  }
}

export const EVENTS: EventDef[] = [
  {
    id: 'feast', name: '伝説の宴', blurb: '秘宝と伝説だけで組まれた豪華なデッキ同士の戦い', ownDeck: false,
    rules: ['あなたもAIも、秘宝・伝説・希少のカードだけでできたデッキを毎回くじで受け取ります', '伝説が飛び交う派手な一戦を楽しもう（AIはLv4）'],
    setup: (_d, rand = Math.random) => {
      const strong = (c: CardDef) => c.rarity === 'L' || c.rarity === 'E' || c.rarity === 'R';
      return { myDeck: randomDeck(rand, strong), aiDeck: randomDeck(rand, strong), aiDeckName: '宴の客人', lv: 4 };
    },
  },
  {
    id: 'mirror', name: '鏡の刻', blurb: 'あなたとAIがまったく同じデッキで戦う', ownDeck: false,
    rules: ['毎回くじで決まる20枚を、あなたとAIの両方が使います', 'デッキの差がないので、腕前だけが勝負を分けます（AIはLv6）'],
    setup: (_d, rand = Math.random) => { const d = randomDeck(rand); return { myDeck: d, aiDeck: d.slice(), aiDeckName: '鏡の向こう', lv: 6 }; },
  },
  {
    id: 'doom', name: '終焉開幕', blurb: '0刻から終焉。はじめから一撃が重い', ownDeck: true,
    rules: ['終焉の刻が20刻ではなく0刻から始まります。ユニットが拠点に与えるダメージは最初から+1、8刻ごとにさらに+1', '守りの薄い盤面はすぐに崩れる、激しい一戦です。自分のデッキで挑みます（AIはLv6）'],
    setup: (d, rand = Math.random) => {
      const ai = presetOf(rand);
      return { myDeck: d, aiDeck: ai.cards, aiDeckName: ai.name, aiDeckId: ai.id, lv: 6, open: (s) => { s.doomAt = 0; s.doom = 1; } };
    },
  },
  {
    id: 'storm', name: '予約の嵐', blurb: '6・12・18・24・30・36刻に、はじめから予約が並ぶ', ownDeck: true,
    rules: ['お互いの山札の術が、6・12・18・24・30・36刻にあらかじめ予約された状態で始まります（デッキにある術の数まで。相手の予約は時刻だけ見えます）', 'はじめの予約は予約の上限（2つ）に数えません。自分のデッキで挑みます（AIはLv4）'],
    setup: (d, rand = Math.random) => {
      const ai = presetOf(rand);
      return { myDeck: d, aiDeck: ai.cards, aiDeckName: ai.name, aiDeckId: ai.id, lv: 4, open: presetStorm };
    },
  },
  {
    id: 'chaos', name: '混沌の刻', blurb: 'デッキはすべてくじ。何が出るかわからない', ownDeck: false,
    rules: ['あなたもAIも、全カードからくじで選ばれた20枚で戦います', '毎回ちがうデッキ。引いたカードで勝ち筋を見つけよう（AIはLv4）'],
    setup: (_d, rand = Math.random) => ({ myDeck: randomDeck(rand), aiDeck: randomDeck(rand), aiDeckName: '混沌の使者', lv: 4 }),
  },
  {
    id: 'quick', name: '早指し', blurb: '1手10秒。考える前に指せ', ownDeck: true,
    rules: ['あなたの持ち時間は1手10秒。過ぎると自動で「待機」になります（何度過ぎても負けにはなりません）', '直感と手の速さが試される一戦。自分のデッキで挑みます（AIはLv5）'],
    setup: (d, rand = Math.random) => {
      const ai = presetOf(rand);
      return { myDeck: d, aiDeck: ai.cards, aiDeckName: ai.name, aiDeckId: ai.id, lv: 5, turnMs: 10_000 };
    },
  },
  {
    id: 'draft', name: '刻の継承', blurb: '3枚から1枚を選び、その場でデッキを作る', ownDeck: false, draft: true,
    rules: ['全カードから出る3枚のうち1枚を選ぶのを20回くり返して、その場でデッキを作ります（持っていないカードも使えます）', 'AIも同じやり方でデッキを作ります。組み立ての腕が試される一戦です（AIはLv4）'],
    setup: (d, rand = Math.random) => ({ myDeck: d, aiDeck: aiDraft(rand), aiDeckName: '継承者', lv: 4 }),
  },
];

/** Shifts the turn so the event of the week this list changed stays the same (予約の嵐). */
const ROTATION = 3;
/** The week a day falls in (weeks start on Monday). */
export function weekOf(day: string): number {
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Math.floor((ms - Date.parse('1970-01-05T00:00:00Z')) / (7 * 86_400_000));
}
/** The event of the week of `day`, and the last day it runs. */
export function eventOf(day: string): { event: EventDef; week: number; until: string } {
  const week = weekOf(day);
  const until = new Date(Date.parse('1970-01-05T00:00:00Z') + (week * 7 + 6) * 86_400_000).toISOString().slice(0, 10);
  const n = EVENTS.length;
  return { event: EVENTS[(((week + ROTATION) % n) + n) % n], week, until };
}

/** What the wins of a week pay. */
export const EVENT_PRIZES: { wins: number; prize: { coins?: number; tickets?: number } }[] = [
  { wins: 1, prize: { coins: 100 } },
  { wins: 3, prize: { tickets: 1 } },
  { wins: 5, prize: { coins: 200, tickets: 1 } },
];
export interface EventProgress { week: number; wins: number; games: number }
/** This week's progress (a new week starts from zero). */
export function eventProgress(p: EventProgress | undefined, day: string): EventProgress {
  const week = weekOf(day);
  return p && p.week === week ? p : { week, wins: 0, games: 0 };
}
/** Records a game; returns the prizes reached by it. */
export function recordEventGame(p: EventProgress, won: boolean): { wins: number; prize: { coins?: number; tickets?: number } }[] {
  p.games++;
  if (!won) return [];
  p.wins++;
  return EVENT_PRIZES.filter((x) => x.wins === p.wins);
}
