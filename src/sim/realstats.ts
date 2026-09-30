/* Real-game statistics from the server: `npm run stats:real -- <server-url> [version]`
 * e.g. npm run stats:real -- https://chrono-duel-online.xxx.workers.dev
 * Prints the per-card table and writes real-stats-<version>.csv (Excel/Numbers can open it). */
import { writeFileSync } from 'node:fs';
import { CARDS } from '../core/cards';
import { impacts, type StatsAgg } from '../server/stats';
import { STATS } from '../wiki/stats';

const proc = process as unknown as { argv: string[]; env: Record<string, string | undefined>; exit(code: number): never };
const url = (proc.argv[2] ?? proc.env.ONLINE_URL ?? '').replace(/^ws/, 'http').replace(/\/$/, '');
if (!url) { console.error('使い方: npm run stats:real -- <サーバーのURL> [バージョン]'); proc.exit(1); }
const ver = proc.argv[3];
const res = await fetch(url + '/api/stats', { method: 'POST', headers: { 'content-type': 'application/json', origin: proc.env.ORIGIN ?? '' }, body: JSON.stringify(ver ? { v: ver } : {}) });
if (!res.ok) { console.error(`サーバーが ${res.status} を返しました`); proc.exit(1); }
const { versions, agg: got } = (await res.json()) as { versions: string[]; agg: StatsAgg | null };
console.log('バージョン:', versions.join(', ') || '(なし)');
if (!got) { console.log('まだデータがありません'); proc.exit(0); }
const agg = got as StatsAgg;
const games = Object.entries(agg.games).map(([k, [g, w]]) => `${k} ${g}戦(勝率${Math.round((100 * w) / g)}%)`).join(' / ');
console.log(`Ver. ${agg.v}: ${games}`);
const rows = impacts(agg).sort((a, b) => b.lift - a.lift);
const lines = ['カード,使われた試合,使ったときの勝率,影響,デッキに入っていた試合,AI同士の勝率'];
for (const x of rows) {
  const name = CARDS[x.id]?.name ?? x.id;
  const ai = STATS.win[x.id];
  console.log(`${name.padEnd(12, '　')} 使用${String(x.used).padStart(5)}  勝率${x.winUsed.toFixed(0).padStart(4)}%  影響${(x.lift > 0 ? '+' : '') + x.lift.toFixed(1)}${x.used < 20 ? '（少数）' : ''}`);
  lines.push([name, x.used, x.winUsed.toFixed(1), x.lift.toFixed(1), x.inDeck, ai ?? ''].join(','));
}
const out = `real-stats-${agg.v}.csv`;
writeFileSync(out, '﻿' + lines.join('\n') + '\n');
console.log(`→ ${out}`);
