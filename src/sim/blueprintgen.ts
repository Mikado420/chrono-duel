/*
 * Prints the 設計図 lines for the rated rivals' decks (src/sim/rosterDecks.ts): `npx tsx src/sim/blueprintgen.ts [games]`.
 * core = what the 型 is built on (the cards shared by every build of the type, then the cards that tell the build apart),
 * list / roles from the list itself, play measured at 'hard' against every roster deck (the same opponents playProfile uses).
 */
import { ROSTER_DECKS } from './rosterDecks';
import { listProfile, rolesOf, styleOf } from '../meta/blueprints';
import { playProfile } from './evolve';
import { cardDef } from '../core/cards';

const proc = process as unknown as { argv: string[]; stdout: { write(s: string): void } };
const N = +(proc.argv[2] ?? 80);
const count = (cs: string[]) => { const m: Record<string, number> = {}; for (const c of cs) m[c] = (m[c] ?? 0) + 1; return m; };
const R: Record<string, number> = { L: 4, E: 3, R: 2, C: 1 };
for (const d of ROSTER_DECKS) {
  const mine = count(d.cards);
  const sibs = ROSTER_DECKS.filter((x) => x.type === d.type && x.id !== d.id).map((x) => count(x.cards));
  // how much of a card is peculiar to this build: copies beyond what every sibling has
  const own = (c: string) => mine[c] - (sibs.length ? Math.min(...sibs.map((s) => s[c] ?? 0)) : 0);
  const shared = (c: string) => (sibs.length ? Math.min(mine[c], ...sibs.map((s) => s[c] ?? 0)) : mine[c]);
  const weight = (c: string) => { const k = cardDef(c); return R[k.rarity] * 10 + k.cost; };
  const byWeight = (a: string, b: string) => weight(b) - weight(a);
  const core: Record<string, number> = {};
  for (const c of Object.keys(mine).filter((c) => own(c) > 0).sort(byWeight).slice(0, 2)) core[c] = Math.min(mine[c], 2);
  for (const c of Object.keys(mine).filter((c) => shared(c) > 0 && !core[c]).sort(byWeight)) { if (Object.keys(core).length >= 5) break; core[c] = Math.min(shared(c), 2); }
  const p = playProfile(d.cards, N, 7000, d.id);
  const play = { end: p.end, koShare: p.koShare, dmg20: p.dmg20, atk: p.atk, resv: p.resv, hpEnd: p.hpEnd };
  proc.stdout.write(`  ${d.id}: { style: '${styleOf(p)}', core: ${JSON.stringify(core)}, list: ${JSON.stringify(listProfile(d.cards))}, roles: ${JSON.stringify(rolesOf(d.cards))}, play: ${JSON.stringify(play)} },\n`);
}
