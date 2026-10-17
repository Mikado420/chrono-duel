/* Balance simulator: `npm run sim -- [games] [LvA] [LvB]` (the AI's Lv, 1–12; default Lv4 for both) */
import { setExpertWeights } from '../core/ai';
import { SIM_LV, lvAi } from './lvplay';
import { PRESET_DECKS, validateDeck } from '../core/decks';
import { PACK_TEST_DECKS } from './packDecks';
import { actor, apply, createGame, mulberry32, type GameEvent, type PlayerIndex } from '../core/engine';

import { RULES } from '../core/rules';
if (process.env.RULES) Object.assign(RULES as Record<string, unknown>, JSON.parse(process.env.RULES));
if (process.env.EXPW) setExpertWeights(JSON.parse(process.env.EXPW));
const N = +(process.argv[2] ?? 400);
const lvOf = (x: string | undefined, d: number) => { const v = x === undefined ? d : +x.replace(/^Lv/i, ''); if (!Number.isInteger(v) || v < 1 || v > 12) throw new Error(`Lv は 1〜12 で指定してください（${x}）`); return v; };
const LA = lvOf(process.argv[3], SIM_LV);
const LB = lvOf(process.argv[4], LA);

interface Stat { aWins: number; games: number; firstWins: number; secondWins: number; draws: number; ko: number; actions: number; resv: number; triggers: number; hpGap: number; cardUse: Record<string, number> }
const blank = (): Stat => ({ aWins: 0, games: 0, firstWins: 0, secondWins: 0, draws: 0, ko: 0, actions: 0, resv: 0, triggers: 0, hpGap: 0, cardUse: {} });

function play(deckA: string[], deckB: string[], seed: number, st: Stat): PlayerIndex | -1 {
  const first = (seed % 2) as PlayerIndex;
  const { state } = createGame([deckA, deckB], seed, first);
  const rand = mulberry32(seed * 7 + 1);
  const ais = [lvAi(LA, '', rand), lvAi(LB, '', rand)];
  let guard = 0;
  const played: [Set<string>, Set<string>] = [new Set(), new Set()];
  while (!state.over && guard++ < 400) {
    const pi = actor(state);
    if (pi === -1) break;
    const a = ais[pi](state, pi);
    const ev: GameEvent[] = apply(state, a);
    for (const e of ev) {
      if (e.e === 'summon' || e.e === 'cast' || e.e === 'reserve') played[e.pi].add(e.e === 'summon' ? e.unit.card : e.card);
      if (e.e === 'summon') st.cardUse[e.unit.card] = (st.cardUse[e.unit.card] ?? 0) + 1;
      if (e.e === 'cast') st.cardUse[e.card] = (st.cardUse[e.card] ?? 0) + 1;
      if (e.e === 'reserve') { st.resv++; st.cardUse['予約:' + e.card] = (st.cardUse['予約:' + e.card] ?? 0) + 1; }
      if (e.e === 'trigger') st.triggers++;
      if (e.e === 'echo') played[e.pi].add(e.card);
    }
  }
  st.games++;
  st.actions += state.actions;
  const w = state.over?.winner ?? -1;
  if (state.over?.reason === 'ko') st.ko++;
  else st.hpGap += Math.abs(state.players[0].hp - state.players[1].hp);
  if (w === 0) st.aWins++;
  for (const pi of [0, 1] as PlayerIndex[]) for (const c of played[pi]) { const r = (cardWin[c] ??= [0, 0]); r[1]++; if (w === pi) r[0]++; else if (w === -1) r[0] += 0.5; }
  if (w === -1) st.draws++;
  else if (w === first) st.firstWins++;
  else st.secondWins++;
  return w;
}

const cardWin: Record<string, [number, number]> = {};
const all = blank();
const matrix: Record<string, Record<string, number>> = {};
const DECKS = process.env.PACK === 'only' ? PACK_TEST_DECKS : process.env.PACK ? [...PRESET_DECKS, ...PACK_TEST_DECKS] : PRESET_DECKS;
for (const d of DECKS) { const v = validateDeck(d.cards); if (!v.ok) throw new Error(`${d.id}: ${v.problems.join(', ')}`); }
const t0 = Date.now();
let seed = 1;
for (const A of DECKS) {
  matrix[A.name] = {};
  for (const B of DECKS) {
    let aw = 0, n = 0;
    for (let i = 0; i < N / DECKS.length ** 2; i++) {
      const w = play(A.cards, B.cards, seed++, all);
      n++;
      if (w === 0) aw++;
      else if (w === -1) aw += 0.5;
    }
    matrix[A.name][B.name] = Math.round((aw / n) * 100);
  }
}
const pct = (x: number) => ((x / all.games) * 100).toFixed(1) + '%';
console.log(`games ${all.games} (Lv${LA} vs Lv${LB}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`A(Lv${LA}) wins ${pct(all.aWins)}  first ${pct(all.firstWins)}  second ${pct(all.secondWins)}  draw ${pct(all.draws)}  KO ${pct(all.ko)}`);
console.log(`actions/player ${(all.actions / all.games / 2).toFixed(1)}  reservations/game ${(all.resv / all.games).toFixed(2)}  timeout hp gap ${(all.hpGap / Math.max(1, all.games - all.ko)).toFixed(1)}`);
console.log('win% row vs column:');
console.table(matrix);
console.log(Object.entries(all.cardUse).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${(v / all.games).toFixed(2)}`).join('  '));

console.log('win% when played: ' + Object.entries(cardWin).sort((a, b) => b[1][0] / b[1][1] - a[1][0] / a[1][1]).map(([k, [w, n]]) => `${k}:${Math.round((w / n) * 100)}`).join('  '));
