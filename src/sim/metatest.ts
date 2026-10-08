/* Home-screen progression checks: `npm run test:meta` */
import assert from 'node:assert/strict';
import { BEGINNER, LOGIN_CALENDAR, NEW_META, checkLogin, claimMission, claimPresents, claimable, dailyMissions, dailyView, deckShares, rankOf, recentShares, recordBattle, recordMatch, track } from '../meta/progress';
import { TITLES, earnedTitles, titleById } from '../meta/titles';

const m = NEW_META();
// login bonus: once a day, 7-day cycle, lands in the present box
assert.equal(checkLogin(m, '2026-10-01'), 1);
assert.equal(checkLogin(m, '2026-10-01'), null, 'once a day');
for (let d = 2; d <= 8; d++) checkLogin(m, `2026-10-0${d}`.replace('0-', ''));
assert.equal(m.loginDays, 8);
assert.equal(m.presents.length, 8);
const got = claimPresents(m, undefined, '2026-10-08');
assert.equal(m.presentLog.length, 8, 'taken presents are kept in the log');
assert.equal(m.presentLog[0].got, '2026-10-08');
const expect = LOGIN_CALENDAR.reduce((a, p) => ({ c: a.c + (p.coins ?? 0), t: a.t + (p.tickets ?? 0) }), { c: 0, t: 0 });
assert.equal(got.coins, expect.c + LOGIN_CALENDAR[0].coins!);
assert.equal(got.tickets, expect.t);
assert.equal(m.presents.length, 0);

// daily missions: three a day, deterministic, reset daily
const a = dailyMissions('2026-10-05').map((x) => x.id), b = dailyMissions('2026-10-05').map((x) => x.id);
assert.deepEqual(a, b);
assert.equal(new Set(a).size, 3);
const days = new Set(Array.from({ length: 20 }, (_, i) => dailyMissions(`2026-11-${String(i + 1).padStart(2, '0')}`).map((x) => x.id).join()));
assert.ok(days.size > 3, 'missions vary by day');
const today = '2026-10-05';
recordBattle(m, { won: true, played: true, hard: false, online: false, spells: 3, summons: 4, reserves: 3, attacks: 12 }, today);
recordBattle(m, { won: false, played: true, hard: false, online: false, spells: 2, summons: 5, reserves: 0, attacks: 3 }, today);
const dv = dailyView(m, today);
assert.ok(dv.find((x) => x.m.id === 'd_play2')!.done);
assert.ok(claimable(m, today) > 0);
for (const x of dv) assert.ok(claimMission(m, x.m.id, today), `claim ${x.m.id}`);
assert.equal(claimMission(m, 'd_play2', today), null, 'no double claim');
assert.ok(claimMission(m, 'all', today), 'all-clear bonus');
assert.equal(claimMission(m, 'all', today), null);
track(m, 'play', 0, '2026-10-06');
assert.ok(dailyView(m, '2026-10-06').every((x) => !x.claimed && x.now === 0), 'new day resets');
// beginner missions keep counting across days
assert.ok(claimMission(m, 'b_play', today));
assert.ok(claimMission(m, 'b_win', today));
assert.equal(claimMission(m, 'b_hard', today), null);
assert.equal(BEGINNER.length, 8);

// rank: EXP, rank-ups deliver presents, unplayed matches count for nothing
const r = NEW_META();
const res = recordBattle(r, { won: true, played: false, hard: true, online: false, spells: 0, summons: 0, reserves: 0, attacks: 0 }, today);
assert.equal(res.exp, 0);
let ups = 0;
for (let i = 0; i < 12; i++) { const x = recordBattle(r, { won: true, played: true, hard: true, online: false, spells: 0, summons: 0, reserves: 0, attacks: 0 }, today); ups += x.after - x.before; }
assert.equal(rankOf(r.exp).rank - 1, ups);
assert.equal(r.presents.length, ups, 'one present per rank-up');
assert.ok(r.presents.some((p) => p.prize.tickets), 'rank 5 gives a ticket');
console.log(`rank after 12 hard wins: ${rankOf(r.exp).rank}`);

// match history and deck shares
const hm = NEW_META();
for (let i = 0; i < 25; i++) recordMatch(hm, { at: i, mode: 'free', result: i % 2 ? 'win' : 'lose', foe: 'AI', deck: i < 15 ? '均衡の刻' : '秒針突撃', deckId: i < 15 ? 'balance' : 'rush', myHp: 5, foeHp: 0, reason: 'ko' });
assert.equal(hm.history.length, 25);
assert.equal(hm.history[0].deckId, 'rush', 'newest first');
assert.equal(hm.deckUse.balance.n, 15);
const rec = recentShares(hm, 20);
assert.equal(rec[0].id, 'rush'); assert.equal(rec[0].n, 10);
assert.ok(Math.abs(rec.reduce((a, r) => a + r.share, 0) - 1) < 1e-9, 'shares add up to one');
const tail = deckShares({ a: { name: 'a', n: 5 }, b: { name: 'b', n: 4 }, c: { name: 'c', n: 3 }, d: { name: 'd', n: 2 }, e: { name: 'e', n: 1 } }, 3);
assert.equal(tail.length, 4); assert.equal(tail[3].name, 'その他'); assert.equal(tail[3].n, 3);
for (let i = 0; i < 40; i++) recordMatch(hm, { at: i, mode: 'free', result: 'win', foe: 'AI', deck: 'x', deckId: 'x', myHp: 1, foeHp: 0, reason: 'ko' });
assert.equal(hm.history.length, 30, 'history is capped');

// titles
const zero = { wins: 0, battles: 0, counters: {}, loginDays: 0, rank: 1, packs: 0, collected: 0, ownsLegend: false, ratedGames: 0, ratedPeak: 1000 };
assert.deepEqual(earnedTitles(zero), []);
assert.ok(earnedTitles({ ...zero, wins: 1 }).includes('first'));
assert.ok(!earnedTitles({ ...zero, ratedPeak: 1200 }).includes('smith'), 'rated titles need a rated game');
assert.ok(earnedTitles({ ...zero, ratedGames: 3, ratedPeak: 1200 }).includes('smith'));
assert.equal(new Set(TITLES.map((t) => t.id)).size, TITLES.length, 'title ids are unique');
assert.ok(TITLES.every((t) => t.name.length <= 12), 'titles fit the name plates');
assert.equal(titleById('nope'), undefined);
console.log(`titles: ${TITLES.length}`);
console.log('all meta tests passed');
