/* Card power check: `npm run balance -- [card ids…|all] [--games N] [--level hard] [--csv out.csv]`
 *
 * How strong is a card compared with a plain one? Four host decks (均衡・秒針突撃・城塞・残響) each carry two
 * 振り子兵 (a vanilla 2-cost 2/3). The card replaces them (one copy for a legend) and each deck plays every test
 * deck with the chosen AI. The card's value is the change in win % against the unchanged host, averaged over the
 * hosts. Around ±3 is noise at the default size; above +7 or below −6 is worth a look.
 *
 * Examples
 *   npm run balance -- e_slash collapse          two cards
 *   npm run balance -- all --csv balance.csv     every card (≈ 30–40 min on 2 cores)
 *   npm run balance -- bolt --games 80           more games → less noise
 * To try a change, edit src/core/cards.ts (or the engine) and run again: the numbers use the code as it is.
 */
import { fork } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chooseAction, type AiLevel } from '../core/ai';
import { CARDS, CARD_LIST, cardDef } from '../core/cards';
import { PRESET_DECKS } from '../core/decks';
import { actor, apply, createGame, mulberry32, type PlayerIndex } from '../core/engine';
import { PACK_TEST_DECKS } from './packDecks';

const REF = 'pendulum';
const OPP = [...PRESET_DECKS, ...PACK_TEST_DECKS];
const get = (id: string) => OPP.find((d) => d.id === id)!.cards.slice();
const HOSTS: Record<string, { name: string; cards: string[] }> = {
  balance: { name: '均衡', cards: get('balance') },
  rush: { name: '秒針突撃', cards: get('rush') },
  titan: { name: '城塞', cards: get('titan') },
  // the echo test deck has no 振り子兵, so two of its weakest slots become the reference first
  echo: { name: '残響', cards: get('p_echo').map((c) => (c === 'e_march' ? REF : c)) },
};
interface Job { host: string; card: string | null; per: number }
interface Res { wins: number; games: number; used: number }

function deckFor(host: string, card: string | null): string[] {
  const d = HOSTS[host].cards.slice();
  if (!card) return d;
  const n = cardDef(card).rarity === 'L' ? 1 : 2;
  for (let k = 0; k < n; k++) d[d.indexOf(REF)] = card;
  return d;
}
function runJob(j: Job, level: AiLevel): Res {
  const r: Res = { wins: 0, games: 0, used: 0 };
  const deck = deckFor(j.host, j.card);
  let seed = 50000; // the same seeds for every card: less noise between rows
  for (const opp of OPP) for (let i = 0; i < j.per; i++, seed++) {
    const { state } = createGame([deck, opp.cards], seed, (seed % 2) as PlayerIndex);
    const rand = mulberry32(seed * 7 + 1);
    let used = false;
    for (let g = 0; !state.over && g < 400; g++) {
      const pi = actor(state);
      if (pi === -1) break;
      for (const e of apply(state, chooseAction(state, pi, level, rand))) {
        if (!j.card || !('pi' in e) || e.pi !== 0) continue;
        if ((e.e === 'summon' && e.fromHand >= 0 && e.unit.card === j.card) || ((e.e === 'cast' || e.e === 'reserve') && e.card === j.card)) used = true;
      }
    }
    const w = state.over?.winner ?? -1;
    r.games++; r.wins += w === 0 ? 1 : w === -1 ? 0.5 : 0;
    if (used) r.used++;
  }
  return r;
}

// ------------------------------------------------------------------ worker process
/** The bits of the Node process object a worker needs (kept narrow so the browser typecheck stays happy). */
const proc = process as unknown as { argv: string[]; execArgv: string[]; on(ev: 'message', f: (m: { i: number; job: Job } | 'bye') => void): void; send(m: unknown): void; exit(code: number): never; stdout: { write(s: string): void } };
if (proc.argv[2] === '--worker') {
  const level = proc.argv[3] as AiLevel;
  proc.on('message', (m) => {
    if (m === 'bye') proc.exit(0);
    else proc.send({ i: m.i, res: runJob(m.job, level) });
  });
} else void main();

async function main() {
  const args = proc.argv.slice(2);
  const opt = (k: string, d: string) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
  const per = +opt('--games', '40');
  const level = opt('--level', 'hard') as AiLevel;
  const csv = opt('--csv', '');
  const workers = Math.max(1, +opt('--jobs', String(cpus().length)));
  let cards = args.length && args[0] !== 'all' ? args : CARD_LIST.map((c) => c.id).filter((id) => id !== REF);
  const unknown = cards.filter((c) => !CARDS[c] || CARDS[c].token);
  if (unknown.length) { console.error(`知らないカードID: ${unknown.join(', ')}（src/core/cards.ts のIDを使います）`); proc.exit(1); }
  if (cards.includes(REF)) { console.log(`${REF} は基準カードなので除きます`); cards = cards.filter((c) => c !== REF); }

  const hosts = Object.keys(HOSTS);
  const jobs: Job[] = [...hosts.map((h) => ({ host: h, card: null, per: per * 5 })), ...cards.flatMap((c) => hosts.map((h) => ({ host: h, card: c, per })))];
  const games = jobs.reduce((n, j) => n + j.per * OPP.length, 0);
  console.log(`${cards.length}枚 × ${hosts.length}デッキ、AI「${level}」、合計 約${games.toLocaleString()}戦（${workers}並列）`);

  const results: Res[] = new Array(jobs.length);
  let next = 0, done = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, () => new Promise<void>((resolve) => {
    const w = fork(fileURLToPath(import.meta.url), ['--worker', level], { execArgv: proc.execArgv });
    const feed = () => { if (next < jobs.length) { const i = next++; w.send({ i, job: jobs[i] }); } else { w.send('bye'); resolve(); } };
    w.on('message', (m: { i: number; res: Res }) => {
      results[m.i] = m.res; done++;
      const pct = Math.round((100 * done) / jobs.length);
      const eta = Math.round(((Date.now() - t0) / done) * (jobs.length - done) / 60000);
      proc.stdout.write(`\r進み具合 ${pct}%（残り約${eta}分）   `);
      feed();
    });
    feed();
  })));
  proc.stdout.write('\n');

  const base = Object.fromEntries(hosts.map((h, i) => [h, results[i].wins / results[i].games]));
  const rows = cards.map((c) => {
    const per = hosts.map((h, k) => { const r = results[hosts.length + cards.indexOf(c) * hosts.length + k]; return { d: (r.wins / r.games - base[h]) * 100, r }; });
    const avg = per.reduce((a, x) => a + x.d, 0) / per.length;
    // standard error of the average difference (binomial, card games and host games)
    const se = Math.sqrt(per.reduce((a, x, k) => { const p = base[hosts[k]]; return a + p * (1 - p) / x.r.games + p * (1 - p) / results[k].games; }, 0)) / per.length * 100;
    const used = per.reduce((a, x) => a + x.r.used, 0) / per.reduce((a, x) => a + x.r.games, 0);
    return { c, avg, per: per.map((x) => x.d), se, used };
  }).sort((a, b) => b.avg - a.avg);

  const tier = (v: number) => (v >= 7 ? '強すぎ' : v >= 3.5 ? '強い' : v > -3 ? '適正' : v > -6 ? '弱い' : '弱すぎ');
  const f = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}`;
  console.log(`\n基準（振り子兵のまま）の勝率: ${hosts.map((h) => `${HOSTS[h].name} ${(base[h] * 100).toFixed(1)}%`).join(' / ')}`);
  console.log(`\n${'カード'.padEnd(10, '　')} 価値     誤差   ${hosts.map((h) => HOSTS[h].name.padEnd(5, '　')).join('')} 使用率  評価`);
  for (const r of rows) console.log(`${cardDef(r.c).name.padEnd(10, '　')} ${f(r.avg).padStart(6)}  ±${r.se.toFixed(1)}  ${r.per.map((d) => f(d).padStart(6) + '　').join('')} ${(r.used * 100).toFixed(0).padStart(4)}%  ${tier(r.avg)}`);
  if (csv) {
    const lines = ['ID,カード,コスト,レア度,価値,誤差,' + hosts.map((h) => HOSTS[h].name).join(',') + ',使用率,評価'];
    for (const r of rows) { const d = cardDef(r.c); lines.push([r.c, d.name, d.cost, d.rarity, r.avg.toFixed(1), r.se.toFixed(1), ...r.per.map((x) => x.toFixed(1)), (r.used * 100).toFixed(0) + '%', tier(r.avg)].join(',')); }
    writeFileSync(csv, '﻿' + lines.join('\n') + '\n');
    console.log(`→ ${csv}`);
  }
}
