/* Home-screen progression checks: `npm run test:meta` */
import assert from 'node:assert/strict';
import { BEGINNER, LOGIN_CALENDAR, NEW_META, checkLogin, claimMission, claimPresents, claimable, dailyMissions, dailyView, rankOf, recordBattle, track } from '../meta/progress';

const m = NEW_META();
// login bonus: once a day, 7-day cycle, lands in the present box
assert.equal(checkLogin(m, '2026-10-01'), 1);
assert.equal(checkLogin(m, '2026-10-01'), null, 'once a day');
for (let d = 2; d <= 8; d++) checkLogin(m, `2026-10-0${d}`.replace('0-', ''));
assert.equal(m.loginDays, 8);
assert.equal(m.presents.length, 8);
const got = claimPresents(m);
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
console.log('all meta tests passed');
