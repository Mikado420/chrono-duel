/**
 * イベント: one each week (Monday to Sunday, Japan time), in turn. Each one changes how a game against the AI is set
 * up — the decks, the opening — without touching the rules, so every card works as usual.
 * Winning pays out at 1, 3 and 5 wins of the week (as presents).
 */
import type { AiLevel } from '../core/ai';
import { CARD_LIST, cardDef, setOf } from '../core/cards';
import { PRESET_DECKS, maxCopies } from '../core/decks';
import type { GameState, PlayerIndex } from '../core/engine';
import { RULES } from '../core/rules';

export interface EventSetup {
  /** Your deck: null means the deck you choose. */
  myDeck: string[] | null;
  aiDeck: string[];
  aiDeckName: string;
  level: AiLevel;
  /** Changes the opening position (after the opening hands are dealt). */
  open?: (s: GameState) => void;
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
  setup(myDeck: string[] | null, rand?: () => number): EventSetup;
}

/** Cards that can be put in a deck today (sets still to come are left out). */
const pool = () => CARD_LIST.filter((c) => setOf(c) !== 'gear');
function randomDeck(rand: () => number, pick: (c: ReturnType<typeof pool>[number]) => boolean = () => true): string[] {
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

export const EVENTS: EventDef[] = [
  {
    id: 'feast', name: '伝説の宴', blurb: '秘宝と伝説だけで組まれた豪華なデッキ同士の戦い', ownDeck: false,
    rules: ['あなたもAIも、秘宝・伝説・希少のカードだけでできたデッキを毎回くじで受け取ります', '伝説が飛び交う派手な一戦を楽しもう'],
    setup: (_d, rand = Math.random) => {
      const strong = (c: ReturnType<typeof pool>[number]) => c.rarity === 'L' || c.rarity === 'E' || c.rarity === 'R';
      return { myDeck: randomDeck(rand, strong), aiDeck: randomDeck(rand, strong), aiDeckName: '宴の客人', level: 'normal' };
    },
  },
  {
    id: 'mirror', name: '鏡の刻', blurb: 'あなたとAIがまったく同じデッキで戦う', ownDeck: false,
    rules: ['毎回くじで決まる20枚を、あなたとAIの両方が使います', 'デッキの差がないので、腕前だけが勝負を分けます'],
    setup: (_d, rand = Math.random) => { const d = randomDeck(rand); return { myDeck: d, aiDeck: d.slice(), aiDeckName: '鏡の向こう', level: 'hard' }; },
  },
  {
    id: 'overclock', name: '時の加速', blurb: '時計が12刻から始まり、手札も多い', ownDeck: true,
    rules: ['お互いの時計が12刻から始まり、手札を2枚多く持って始まります', 'すぐに終焉（20刻）がやってくる、速くて激しい一戦です', '自分のデッキで挑みます'],
    setup: (d, rand = Math.random) => {
      const ai = presetOf(rand);
      return {
        myDeck: d, aiDeck: ai.cards, aiDeckName: ai.name, level: 'hard',
        open: (s) => {
          for (const p of s.players) {
            p.time = 12;
            for (let i = 0; i < 2 && p.deck.length && p.hand.length < RULES.MAX_HAND; i++) p.hand.push({ uid: s.nextUid++, card: p.deck.shift()! });
          }
        },
      };
    },
  },
  {
    id: 'storm', name: '予約の嵐', blurb: 'お互い、予約が2つ仕掛けられた状態で始まる', ownDeck: true,
    rules: ['お互いの山札から術を2枚ずつ、6刻と12刻にあらかじめ予約した状態で始まります（相手の予約は見えません）', '読み合いから始まる一戦。自分のデッキで挑みます'],
    setup: (d, rand = Math.random) => {
      const ai = presetOf(rand);
      return {
        myDeck: d, aiDeck: ai.cards, aiDeckName: ai.name, level: 'normal',
        open: (s) => {
          s.players.forEach((p, i) => {
            const spells = p.deck.filter((c) => { const def = cardDef(c); return def.kind === 'spell' && !def.reserveOnly; });
            const reserveOnly = p.deck.filter((c) => cardDef(c).reserveOnly);
            const picks = [...reserveOnly, ...spells].slice(0, RULES.MAX_RESV);
            picks.forEach((card, k) => {
              const at = p.deck.indexOf(card);
              if (at >= 0) p.deck.splice(at, 1);
              p.resv.push({ uid: s.nextUid++, card, T: k === 0 ? 6 : 12, revealed: false });
            });
            void i;
          });
        },
      };
    },
  },
  {
    id: 'chaos', name: '混沌の刻', blurb: 'デッキはすべてくじ。何が出るかわからない', ownDeck: false,
    rules: ['あなたもAIも、全カードからくじで選ばれた20枚で戦います', '毎回ちがうデッキ。引いたカードで勝ち筋を見つけよう'],
    setup: (_d, rand = Math.random) => ({ myDeck: randomDeck(rand), aiDeck: randomDeck(rand), aiDeckName: '混沌の使者', level: 'normal' }),
  },
  {
    id: 'trial', name: '強者の試練', blurb: '最強のAIに自分のデッキで挑む', ownDeck: true,
    rules: ['AIの強さは「超つよい」。こちらは手札を1枚多く持って始まります', '勝てたら一人前。自分のデッキで挑みます'],
    setup: (d, rand = Math.random) => {
      const ai = presetOf(rand);
      return {
        myDeck: d, aiDeck: ai.cards, aiDeckName: ai.name, level: 'expert',
        open: (s) => { const p = s.players[0 as PlayerIndex]; if (p.deck.length && p.hand.length < RULES.MAX_HAND) p.hand.push({ uid: s.nextUid++, card: p.deck.shift()! }); },
      };
    },
  },
];

/** The week a day falls in (weeks start on Monday). */
export function weekOf(day: string): number {
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Math.floor((ms - Date.parse('1970-01-05T00:00:00Z')) / (7 * 86_400_000));
}
/** The event of the week of `day`, and the last day it runs. */
export function eventOf(day: string): { event: EventDef; week: number; until: string } {
  const week = weekOf(day);
  const until = new Date(Date.parse('1970-01-05T00:00:00Z') + (week * 7 + 6) * 86_400_000).toISOString().slice(0, 10);
  return { event: EVENTS[((week % EVENTS.length) + EVENTS.length) % EVENTS.length], week, until };
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
