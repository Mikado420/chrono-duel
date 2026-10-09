/* 引き継ぎコード and shared replays on the server: `npx tsx src/sim/transfertest.ts` */
import assert from 'node:assert/strict';
import type { KV } from '../server/leaderboard';
import { TRANSFER_TTL, Transfer, normalizeTransferCode } from '../server/transfer';

const mem = new Map<string, unknown>();
const kv: KV = {
  get: async (k) => structuredClone(mem.get(k)) as never,
  put: async (k, v) => { mem.set(k, structuredClone(v)); },
  list: async (p) => [...mem.entries()].filter(([k]) => k.startsWith(p)).map(([, v]) => structuredClone(v)) as never,
  delete: async (k) => { mem.delete(k); },
};
let now = 1_800_000_000_000;
const tx = new Transfer(kv, () => now);

assert.equal(normalizeTransferCode('ab3d 7kq9'), 'AB3D-7KQ9');
assert.equal(normalizeTransferCode('AB3D-7KQ'), null);
assert.equal(normalizeTransferCode('AB0D-7KQ9'), null, 'no zero in codes');

// a save moves once, only the keys that belong to a save, and big saves are split and joined again
const big = 'x'.repeat(250_000);
const save = { 'cd.account': '{"id":"a","secret":"b"}', 'cd.wallet': '{"coins":123}', 'cd.meta': big, 'cd.adminToken': 'nope', 'cd.liveGame': '{}' };
const r1 = await tx.issue({ save });
assert.equal(r1.status, 200);
const { code, until } = r1.body as { code: string; until: number };
assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
assert.equal(until, now + TRANSFER_TTL);
const got = await tx.redeem({ code: code.toLowerCase().replace('-', ' ') });
assert.equal(got.status, 200);
const back = (got.body as { save: Record<string, string> }).save;
assert.equal(back['cd.wallet'], '{"coins":123}');
assert.equal(back['cd.meta'], big);
assert.equal(back['cd.adminToken'], undefined, 'device-only keys stay behind');
assert.equal(back['cd.liveGame'], undefined);
assert.equal((await tx.redeem({ code })).status, 404, 'a code works once');
assert.equal([...mem.keys()].filter((k) => k.startsWith('tx')).length, 0, 'nothing is left behind');

// codes run out after 24 hours, and old ones are swept when a new one is made
const r2 = (await tx.issue({ save })).body as { code: string };
now += TRANSFER_TTL + 1;
assert.equal((await tx.redeem({ code: r2.code })).status, 410);
const r3 = (await tx.issue({ save })).body as { code: string };
now += TRANSFER_TTL + 1;
await tx.issue({ save });
assert.equal(await kv.get(`tx:${r3.code}`), undefined, 'expired codes are swept');
assert.equal((await tx.issue({ save: { 'cd.wallet': '{}' } })).status, 400, 'a save without its account is refused');
assert.equal((await tx.issue({ save: { 'cd.account': 'a', 'cd.meta': 'y'.repeat(700_000) } })).status, 413);
console.log('transfer ok');
