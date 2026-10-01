/* Game records from real players: `npm run logs -- <server URL> <admin token> [version] [options]`
 *
 * Downloads every game record of a version (the newest by default), keeps a copy in logs/<version>.jsonl and replays
 * each game to measure how it was played. Only human seats are counted (the player in a game against the AI, both
 * players online).
 *
 * Options
 *   --player <name>   that player's games one by one, and the decks they used
 *   --game <id>       one game move by move (the id is shown by --player)
 *   --file <path>     read a saved logs/<version>.jsonl instead of downloading
 *   --csv <path>      one row per human seat (for a spreadsheet)
 *
 * Examples
 *   npm run logs -- https://chrono-duel-online.<you>.workers.dev <token>
 *   npm run logs -- --file logs/0.12.2.jsonl --player レジあいす
 *   npm run logs -- http://localhost:8787 dev          (dev server; its token is "dev")
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cardDef } from '../core/cards';
import { replay } from '../core/gamelog';
import { narrate } from '../core/narrate';
import type { PlayerIndex } from '../core/engine';
import type { StoredLog } from '../server/stats';

const proc = process as unknown as { argv: string[]; exit(c: number): never };
const args = proc.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const player = opt('--player'), gameId = opt('--game'), file = opt('--file'), csv = opt('--csv');
const [url, token, version] = args;

interface Seat {
  rec: StoredLog; seat: PlayerIndex; name: string; deck: string; foe: string; won: number; reason: string;
  actions: number; attacks: number; attacksOnBase: number; baseDmgUnits: number; baseDmgOther: number; dmgTaken: number;
  heals: number; reserves: number; hpLeft: number; foeHpLeft: number; cards: string[];
}

async function download(): Promise<{ v: string; items: StoredLog[] }> {
  if (!url || !token) { console.error('使い方: npm run logs -- <サーバーのURL> <管理用トークン> [バージョン] [--player 名前] [--csv 出力.csv]\n  または: npm run logs -- --file logs/<バージョン>.jsonl'); proc.exit(1); }
  const base = url.replace(/^ws/, 'http').replace(/\/$/, '');
  const items: StoredLog[] = [];
  let after: string | null = null, v = version ?? '';
  for (;;) {
    const res = await fetch(`${base}/api/logs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, v: version, after, limit: 200 }) });
    if (res.status === 403) { console.error('トークンが違います（サーバーの ADMIN_TOKEN と同じ値を使ってください）'); proc.exit(1); }
    if (!res.ok) { console.error(`サーバーエラー ${res.status}`); proc.exit(1); }
    const page = (await res.json()) as { v: string | null; items: StoredLog[]; next: string | null };
    if (!page.v) { console.log('まだ記録がありません'); proc.exit(0); }
    v = page.v!; items.push(...page.items); after = page.next;
    process.stdout.write(`\r${items.length}試合を取得…`);
    if (!after) break;
  }
  process.stdout.write('\n');
  mkdirSync('logs', { recursive: true });
  writeFileSync(`logs/${v}.jsonl`, items.map((x) => JSON.stringify(x)).join('\n') + '\n');
  console.log(`→ logs/${v}.jsonl`);
  return { v, items };
}

function seatsOf(rec: StoredLog): Seat[] {
  const humans: PlayerIndex[] = rec.src === 'room' ? [0, 1] : [0];
  const st = humans.map(() => ({ attacks: 0, attacksOnBase: 0, baseDmgUnits: 0, baseDmgOther: 0, dmgTaken: 0, heals: 0, reserves: 0, cards: new Set<string>() }));
  const end = replay(rec.log, (_s, _a, pi, ev) => {
    let byUnit = false;
    for (const e of ev) {
      if (e.e === 'attack') byUnit = true;
      if (e.e === 'trigger') byUnit = false;
      humans.forEach((seat, k) => {
        const x = st[k];
        if (e.e === 'attack' && e.pi === seat) { x.attacks++; if (!e.target) x.attacksOnBase++; }
        if (e.e === 'dmgBase' && e.pi !== seat) { if (byUnit && pi === seat) x.baseDmgUnits += e.amount; else x.baseDmgOther += e.amount; }
        if (e.e === 'dmgBase' && e.pi === seat) x.dmgTaken += e.amount;
        if (e.e === 'heal' && e.pi === seat) x.heals += e.amount;
        if (e.e === 'reserve' && e.pi === seat) x.reserves++;
        if ((e.e === 'summon' && e.pi === seat && e.fromHand >= 0) || ((e.e === 'cast' || e.e === 'reserve') && e.pi === seat)) x.cards.add(e.e === 'summon' ? e.unit.card : e.card);
      });
    }
  });
  if (!end) return []; // stored records always replay; a mismatch means an engine change since (another version)
  return humans.map((seat, k) => {
    const foeSeat = (1 - seat) as PlayerIndex;
    const name = rec.names?.[seat] || (rec.src === 'report' ? `未登録(${(rec.id ?? '').slice(-6)})` : '?');
    const deck = rec.src === 'report' ? rec.deckNames?.[0] || '?' : 'オンライン';
    const foe = rec.src === 'report' ? `${rec.deckNames?.[1] || '?'}（AI ${rec.ai ?? ''}）` : rec.names?.[foeSeat] ?? '?';
    const won = rec.winner === -1 ? 0.5 : rec.winner === seat ? 1 : 0;
    return {
      rec, seat, name, deck, foe, won, reason: rec.reason, actions: rec.log.actions.length,
      ...st[k], cards: [...st[k].cards], hpLeft: end.players[seat].hp, foeHpLeft: end.players[foeSeat].hp,
    };
  });
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : '—');
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pad = (s: string, n: number) => s + '　'.repeat(Math.max(0, n - [...s].length));
function table(title: string, groups: Map<string, Seat[]>, min = 1) {
  console.log(`\n■ ${title}`);
  console.log(`${pad('', 14)} 試合  勝率  攻撃/試合  拠点ダメのうちユニット  時間切れ決着`);
  for (const [k, xs] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    if (xs.length < min) continue;
    const dmgU = xs.reduce((a, x) => a + x.baseDmgUnits, 0), dmgAll = xs.reduce((a, x) => a + x.baseDmgUnits + x.baseDmgOther, 0);
    console.log(`${pad(k.slice(0, 14), 14)} ${String(xs.length).padStart(4)}  ${pct(xs.reduce((a, x) => a + x.won, 0), xs.length).padStart(4)}  ${avg(xs.map((x) => x.attacks)).toFixed(1).padStart(8)}  ${pct(dmgU, dmgAll).padStart(20)}  ${pct(xs.filter((x) => x.reason === 'time').length, xs.length).padStart(10)}`);
  }
}
const groupBy = (xs: Seat[], key: (x: Seat) => string) => { const m = new Map<string, Seat[]>(); for (const x of xs) { const k = key(x); m.set(k, [...(m.get(k) ?? []), x]); } return m; };

(async () => {
  const { v, items } = file
    ? { v: file.replace(/^.*\//, '').replace(/\.jsonl$/, ''), items: readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as StoredLog) }
    : await download();
  if (gameId) {
    const r = items.find((x) => x.gid === gameId);
    if (!r) { console.error(`試合 ${gameId} が見つかりません`); proc.exit(1); }
    console.log(narrate(r.log, [r.names?.[0] || '席0', r.src === 'report' ? 'AI' : r.names?.[1] || '席1']));
    return;
  }
  const seats = items.flatMap(seatsOf);
  const broken = items.length - new Set(seats.map((s) => s.rec.gid)).size;
  console.log(`\nバージョン ${v}：${items.length}試合（AI戦 ${items.filter((x) => x.src === 'report').length}・オンライン ${items.filter((x) => x.src === 'room').length}）、人間の席 ${seats.length}${broken ? `、再現できない記録 ${broken}` : ''}`);
  if (!seats.length) return;

  const reasons = groupBy(seats, (x) => x.reason);
  console.log(`決着: ${[...reasons].map(([k, xs]) => `${({ ko: '拠点破壊', time: '時間切れ', surrender: '降参', timeout: '時間切れ放置', disconnect: '切断' } as Record<string, string>)[k] ?? k} ${pct(xs.length, seats.length)}`).join(' / ')}`);
  table('モード別', groupBy(seats, (x) => (x.rec.mode === 'free' ? `フリー ${x.rec.ai}` : x.rec.mode === 'rated' ? `レート ${x.rec.ai}` : 'オンライン')));
  table('攻撃の回数と勝率（降参・切断を除く）', groupBy(seats.filter((x) => x.reason === 'ko' || x.reason === 'time'), (x) => (x.attacks <= 2 ? '攻撃 0〜2回' : x.attacks <= 5 ? '攻撃 3〜5回' : x.attacks <= 9 ? '攻撃 6〜9回' : '攻撃 10回以上')));
  table('デッキ別（3試合以上）', groupBy(seats, (x) => x.deck), 3);
  table('プレイヤー別（3試合以上）', groupBy(seats, (x) => x.name), 3);

  if (player) {
    const mine = seats.filter((x) => x.name === player);
    console.log(`\n■ ${player} の試合（${mine.length}）`);
    for (const x of mine) {
      const d = new Date(x.rec.at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
      console.log(`${d}  [${x.rec.gid}]  ${x.won === 1 ? '勝ち' : x.won === 0 ? '負け' : '引分'}（${x.reason}）  ${x.deck} vs ${x.foe}  攻撃${x.attacks}（拠点へ${x.attacksOnBase}） 拠点ダメ ユニット${x.baseDmgUnits}/その他${x.baseDmgOther} 回復${x.heals} 予約${x.reserves}  残り体力 ${x.hpLeft}-${x.foeHpLeft}`);
    }
    // the decks they actually used (seat 0 decks of their reports, card counts)
    const decks = groupBy(mine, (x) => x.rec.log.decks[x.seat].slice().sort().join(','));
    for (const [k, xs] of decks) {
      const count = new Map<string, number>(); for (const c of k.split(',')) count.set(c, (count.get(c) ?? 0) + 1);
      console.log(`\nデッキ（${xs.length}試合、勝率 ${pct(xs.reduce((a, x) => a + x.won, 0), xs.length)}）: ${[...count].map(([c, n]) => `${cardDef(c).name}×${n}`).join('・')}`);
    }
  }

  if (csv) {
    const head = '日時,ID,モード,AI,名前,デッキ,相手,結果,決着,行動数,攻撃,拠点への攻撃,拠点ダメ(ユニット),拠点ダメ(その他),受けたダメ,回復,予約,残り体力,相手の残り体力,使ったカード';
    const rows = seats.map((x) => [new Date(x.rec.at).toISOString(), x.rec.gid, x.rec.mode, x.rec.ai ?? '', x.name, x.deck, x.foe, x.won, x.reason, x.actions, x.attacks, x.attacksOnBase, x.baseDmgUnits, x.baseDmgOther, x.dmgTaken, x.heals, x.reserves, x.hpLeft, x.foeHpLeft, x.cards.map((c) => cardDef(c).name).join(' ')].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
    writeFileSync(csv, '﻿' + [head, ...rows].join('\n') + '\n');
    console.log(`\n→ ${csv}`);
  }
})();
