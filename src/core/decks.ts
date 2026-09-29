import { CARDS, cardDef } from './cards';
import { RULES } from './rules';

export interface DeckDef { id: string; name: string; cards: string[]; blurb?: string }

const expand = (m: Record<string, number>) => Object.entries(m).flatMap(([k, n]) => Array(n).fill(k) as string[]);

export const PRESET_DECKS: DeckDef[] = [
  {
    id: 'balance', name: '均衡の刻', blurb: '攻守のバランスが取れた入門デッキ',
    cards: expand({ scout: 2, archer: 2, pendulum: 2, warden: 1, gear: 2, scribe: 1, lancer: 1, delayer: 1, heavy: 1, dragon: 1, arrow: 2, cage: 1, bolt: 1, collapse: 1, insight: 1 }),
  },
  {
    id: 'rush', name: '秒針突撃', blurb: '軽いユニットで小刻みに攻める速攻型',
    cards: expand({ scout: 2, archer: 2, pendulum: 2, ghost: 2, gear: 2, lancer: 2, sentinel: 1, delayer: 1, haste: 2, arrow: 2, bolt: 2 }),
  },
  {
    id: 'titan', name: '永劫の城塞', blurb: '挑発で耐え、大型で押し潰す重量型',
    cards: expand({ pendulum: 2, warden: 2, gear: 2, scribe: 2, sentinel: 1, heavy: 2, breaker: 1, dragon: 1, titan: 1, arrow: 1, cage: 2, collapse: 1, rewind: 2 }),
  },
  {
    id: 'oracle', name: '予言の書架', blurb: '予約と時計操作で相手の未来を縛る',
    cards: expand({ scout: 2, pendulum: 2, ghost: 2, oracle: 1, delayer: 2, gear: 2, heavy: 1, breaker: 1, stop: 1, arrow: 2, cage: 1, bolt: 2, collapse: 1 }),
  },
];

export interface DeckIssue { ok: boolean; count: number; problems: string[] }
export function validateDeck(cards: string[]): DeckIssue {
  const problems: string[] = [];
  if (cards.length !== RULES.DECK_SIZE) problems.push(`デッキは${RULES.DECK_SIZE}枚ちょうどにしてください（現在${cards.length}枚）`);
  const counts: Record<string, number> = {};
  for (const c of cards) {
    if (!CARDS[c] || CARDS[c].token) { problems.push(`不明なカード: ${c}`); continue; }
    counts[c] = (counts[c] ?? 0) + 1;
  }
  for (const [c, n] of Object.entries(counts)) {
    const d = cardDef(c);
    const max = d.rarity === 'L' ? RULES.MAX_LEGEND_COPIES : RULES.MAX_COPIES;
    if (n > max) problems.push(`「${d.name}」は${max}枚までです`);
  }
  return { ok: problems.length === 0, count: cards.length, problems };
}
export const maxCopies = (id: string) => (cardDef(id).rarity === 'L' ? RULES.MAX_LEGEND_COPIES : RULES.MAX_COPIES);

for (const d of PRESET_DECKS) {
  const v = validateDeck(d.cards);
  if (!v.ok) throw new Error(`preset ${d.id}: ${v.problems.join(', ')}`);
}
