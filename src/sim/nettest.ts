/* Online room tests with fake connections: `npm run test:net` */
import assert from 'node:assert/strict';
import { PRESET_DECKS } from '../core/decks';
import { legalActions, mulberry32, type GameState } from '../core/engine';
import { NET, viewState, watchState, type ClientMsg, type ServerMsg } from '../core/net';
import { Room, type Conn, type RoomEnv } from '../server/room';
import type { RoomLog } from '../server/stats';
import { replay } from '../core/gamelog';

let clock = 1_000_000;
let uid = 0;
const roomLogs: RoomLog[] = [];
const env: RoomEnv = { now: () => clock, uuid: () => `tok${++uid}`, seed: (() => { const r = mulberry32(42); return () => Math.floor(r() * 2 ** 32); })(), onLog: (r) => roomLogs.push(r) };

class Client {
  inbox: ServerMsg[] = [];
  view: GameState | null = null;
  token = '';
  open = true;
  closedWith: number | null = null;
  result: ServerMsg | null = null;
  conn: Conn;
  constructor(public room: () => Room, public name: string, public deck = PRESET_DECKS[0].cards) {
    this.conn = { cid: `c${++uid}`, send: (m) => this.recv(m), close: (code) => { this.open = false; this.closedWith = code; } };
  }
  recv(m: ServerMsg) {
    this.inbox.push(m);
    if (m.t === 'welcome') this.token = m.token;
    if (m.t === 'game' || m.t === 'events') this.view = m.state;
    if (m.t === 'events') for (const e of m.events) if ((e.e === 'draw' || e.e === 'reserve') && e.pi === 1) assert.equal(e.card, '?', `${e.e} of the opponent leaked its card`);
    if (m.t === 'over') this.result = m;
  }
  send(m: ClientMsg) { this.room().onMessage(this.conn, m); }
  hello(token?: string) { this.send({ t: 'hello', name: this.name, deck: this.deck, token }); }
  last<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }> | undefined { return [...this.inbox].reverse().find((m) => m.t === t) as never; }
  errors() { return this.inbox.filter((m) => m.t === 'error').map((m) => (m as { code: string }).code); }
}

let room = new Room('ABCDE', env);
const R = () => room;
const secrets = (v: GameState) => {
  assert.ok(v.players[1].hand.every((h) => h.card === '?'), 'opponent hand leaked');
  assert.ok(v.players.every((p) => p.deck.every((c) => c === '?')), 'deck leaked');
  assert.ok(v.players[1].resv.every((r) => r.revealed || r.card === '?'), 'reservation leaked');
};
const truth = () => (room as unknown as { game: GameState }).game;

// ---------------------------------------------------------------- lobby
{
  const a = new Client(R, 'アリス'), b = new Client(R, 'ボブ'), c = new Client(R, 'キャロル');
  const bad = new Client(R, 'x', ['scout']);
  bad.hello();
  assert.deepEqual(bad.errors(), ['deck'], 'invalid deck rejected');
  a.hello();
  assert.equal(a.last('welcome')?.foe, null);
  b.hello();
  assert.equal(a.last('foe')?.foe?.name, 'ボブ');
  assert.equal(a.last('game')?.fresh, true, 'game starts when both are in');
  assert.equal(b.last('game')?.fresh, true);
  c.hello();
  assert.deepEqual(c.errors(), ['full'], 'third player is turned away');
  assert.notEqual(a.last('game')!.first, b.last('game')!.first, 'first player is seen from each side');

  // ---------------------------------------------------------------- views stay in sync with the truth and never leak
  const rand = mulberry32(7);
  let steps = 0;
  const players = [a, b];
  while (!a.result && steps++ < 400) {
    const g = truth();
    for (const p of players) { secrets(p.view!); }
    const slot = players.findIndex((p, i) => JSON.stringify(viewState(g, i as 0 | 1)) === JSON.stringify(p.view));
    assert.notEqual(slot, -1);
    for (const [i, p] of players.entries()) assert.deepEqual(p.view, viewState(g, i as 0 | 1), `view of player ${i} drifted`);
    const actorIdx = players.findIndex((p) => legalActions(p.view!, 0).length > 0);
    assert.notEqual(actorIdx, -1, 'someone must be able to act');
    const p = players[actorIdx];
    const legal = legalActions(p.view!, 0);
    // prefer real plays over waiting so games finish and reservations happen
    const better = legal.filter((x) => x.t !== 'wait' && x.t !== 'draw');
    const pool = better.length && rand() < 0.85 ? better : legal;
    const act = pool[Math.floor(rand() * pool.length)];
    // the other player can not act
    const other = players[1 - actorIdx];
    other.send({ t: 'act', n: other.view!.actions, a: { t: 'wait' } });
    assert.ok(other.errors().includes('turn'), 'acting out of turn is refused');
    p.send({ t: 'act', n: p.view!.actions - 1, a: act });
    assert.ok(p.errors().includes('stale'), 'stale action counter is refused');
    p.send({ t: 'act', n: p.view!.actions, a: act });
  }
  assert.ok(a.result && b.result, 'game ended');
  const ra = (a.result as Extract<ServerMsg, { t: 'over' }>).result, rb = (b.result as Extract<ServerMsg, { t: 'over' }>).result;
  assert.equal(ra.winner === -1 ? -1 : 1 - ra.winner, rb.winner, 'winners mirror each other');
  console.log(`full game ok: ${truth().actions} actions, ${ra.reason}, winner ${ra.winner}`);
  // the room hands over the whole game once, and it replays to the same end
  assert.equal(roomLogs.length, 1, 'one record per game');
  const rl = roomLogs[0];
  assert.deepEqual(rl.names, ['アリス', 'ボブ']);
  assert.equal(rl.log.actions.length, truth().actions);
  const re = replay(rl.log);
  assert.ok(re?.over, 'the record replays to the end');
  assert.deepEqual(re.over, truth().over, 'the replay ends the same way');
  assert.equal(rl.winner, truth().over!.winner);
  a.send({ t: 'act', n: 0, a: { t: 'wait' } });
  assert.ok(a.errors().includes('phase'));

  // ---------------------------------------------------------------- rematch swaps who starts
  const f0 = a.last('game')!.first;
  a.send({ t: 'rematch' });
  assert.deepEqual(b.last('rematch')?.rematch, { me: false, foe: true });
  b.send({ t: 'rematch' });
  const g2 = a.last('game')!;
  assert.equal(g2.fresh, true);
  assert.notEqual(g2.first, f0, 'first player alternates');
  assert.equal(a.view!.actions, 0);

  // ---------------------------------------------------------------- hosting restarts: snapshot round trip keeps the game
  const snap = JSON.parse(JSON.stringify(room.snapshot()));
  room = new Room('ABCDE', env, snap);
  room.attach(a.conn); room.attach(b.conn);
  const actorIdx = players.findIndex((p) => legalActions(p.view!, 0).length > 0);
  players[actorIdx].send({ t: 'act', n: 0, a: { t: 'wait' } });
  assert.equal(players[actorIdx].last('events')?.events[0].e, 'act', 'restored room keeps playing');

}

// ---------------------------------------------------------------- turn timer: auto wait, then forfeit for repeated timeouts
{
  room = new Room('WXYZ2', env);
  const a = new Client(R, 'アリス'), b = new Client(R, 'ボブ');
  a.hello(); b.hello();
  assert.ok(room.nextAlarm()! > clock, 'an alarm is armed for the acting player');
  let autos = 0, guard = 0;
  while (!a.result && guard++ < 20) {
    clock = room.nextAlarm()! + 1;
    const before = truth().actions;
    room.onAlarm();
    const ev = [a, b].map((p) => p.last('events')).find((e) => e?.auto);
    if (!a.result) { assert.equal(truth().actions, before + 1, 'a timeout plays exactly one wait'); autos++; assert.ok(ev); }
  }
  assert.ok(autos >= 2 && autos <= 2 * NET.MAX_AFK, `timeouts wait first (${autos})`);
  assert.equal((a.result as Extract<ServerMsg, { t: 'over' }>).result.reason, 'timeout');
  console.log(`timer ok: ${autos} auto waits, then forfeit`);
}

// ---------------------------------------------------------------- disconnect and forfeit
{
  room = new Room('FGHJK', env);
  const a = new Client(R, 'アリス'), b = new Client(R, 'ボブ');
  a.hello(); b.hello();
  const players = [a, b];
  const actorIdx = players.findIndex((p) => legalActions(p.view!, 0).length > 0);
  const away = players[actorIdx], stay = players[1 - actorIdx];
  room.onClose(away.conn);
  assert.equal(stay.last('foe')?.foe?.online, false);
  assert.equal(room.nextAlarm(), clock + NET.RECONNECT_MS, 'clock pauses while the acting player is away');
  clock += 20_000;
  const away2 = new Client(R, away.name, away.deck);
  away2.hello(away.token);
  assert.equal(away2.last('game')?.fresh, false, 'reconnect resyncs the game');
  assert.ok(away2.last('game')!.left! > 0, 'clock resumes');
  assert.equal(stay.last('foe')?.foe?.online, true);
  // stale socket of the same player is closed when a newer one arrives
  const away3 = new Client(R, away.name, away.deck);
  away3.hello(away.token);
  assert.equal(away2.closedWith, 4001);
  room.onClose(away2.conn); // its close arrives late: must not knock out the new connection
  assert.equal(stay.last('foe')?.foe?.online, true, 'late close of a replaced socket is ignored');
  // gone for good
  room.onClose(away3.conn);
  clock += NET.RECONNECT_MS + 1;
  room.onAlarm();
  const over = stay.last('over');
  assert.equal(over?.result.reason, 'disconnect');
  assert.equal(over?.result.winner, 0);
  console.log('disconnect ok');
}

// ---------------------------------------------------------------- leaving and surrender
{
  room = new Room('LMNPQ', env);
  const a = new Client(R, 'アリス'), b = new Client(R, 'ボブ');
  a.hello();
  a.send({ t: 'leave' });
  assert.ok(room.expired(), 'empty lobby expires');
  room = new Room('RSTUV', env);
  const c = new Client(R, 'c'), d = new Client(R, 'd');
  c.hello(); d.hello();
  c.send({ t: 'surrender' });
  assert.equal(d.last('over')?.result.winner, 0);
  assert.equal(c.last('over')?.result.winner, 1);
  d.send({ t: 'leave' });
  assert.equal(c.last('foe')?.foe, null);
  c.send({ t: 'rematch' });
  assert.ok(c.errors().includes('phase'), 'no rematch against nobody');
  void b;
  console.log('leave/surrender ok');
}
// ---------------------------------------------------------------- create needs an empty room, join needs a waiting host
{
  room = new Room('ZZZZZ', env);
  const lost = new Client(R, 'x');
  lost.send({ t: 'hello', name: 'x', deck: lost.deck, mode: 'join' });
  assert.deepEqual(lost.errors(), ['gone'], 'joining an empty room is refused');
  assert.ok(room.expired(), 'a refused join leaves nothing behind');
  const host = new Client(R, 'h'), clash = new Client(R, 'c'), guest = new Client(R, 'g');
  host.send({ t: 'hello', name: 'h', deck: host.deck, mode: 'create' });
  assert.equal(host.last('welcome')?.code, 'ZZZZZ');
  clash.send({ t: 'hello', name: 'c', deck: clash.deck, mode: 'create' });
  assert.deepEqual(clash.errors(), ['taken'], 'a code in use can not be created twice');
  guest.send({ t: 'hello', name: 'g', deck: guest.deck, mode: 'join' });
  assert.equal(guest.last('game')?.fresh, true, 'join with a host waiting starts the game');
  console.log('create/join ok');
}
// ---------------------------------------------------------------- 第1弾 cards over the wire: charge values must round-trip, echoes stay public
{
  const { PACK_TEST_DECKS } = await import('./packDecks');
  const rand = mulberry32(3);
  let charged = 0, echoesSeen = 0, games = 0;
  for (; games < 12 && (charged === 0 || echoesSeen === 0); games++) {
  room = new Room('PQRST', env);
  const a = new Client(R, 'a', PACK_TEST_DECKS[1].cards), b = new Client(R, 'b', PACK_TEST_DECKS[0].cards);
  a.hello(); b.hello();
  let steps = 0;
  while (!a.result && steps++ < 400) {
    const ps = [a, b];
    const i = ps.findIndex((p) => legalActions(p.view!, 0).length > 0);
    const p = ps[i];
    const legal = legalActions(p.view!, 0);
    const pool = legal.filter((x) => x.t !== 'wait' && x.t !== 'draw');
    const src = pool.length && rand() < 0.9 ? pool : legal;
    const act = src[Math.floor(rand() * src.length)];
    if ('x' in act && act.x) charged++;
    const before = truth().actions;
    p.send({ t: 'act', n: p.view!.actions, a: act });
    assert.equal(truth().actions, before + 1, `legal action ${JSON.stringify(act)} was accepted`);
    for (const q of ps) { secrets(q.view!); echoesSeen += q.view!.players[1].resv.filter((r) => r.echo && r.card !== '?').length; }
  }
  assert.ok(a.result, 'pack game ended');
  }
  assert.ok(charged > 0 && echoesSeen > 0, 'charge and echoes were exercised');
  console.log(`pack cards ok: ${games} games, ${charged} charged plays accepted, opponent echoes visible`);
}
// ---------------------------------------------------------------- spectators: both hands hidden, nothing to play, they leave quietly
{
  room = new Room('WATCH', env);
  const a = new Client(R, 'アリス'), b = new Client(R, 'ボブ'), w = new Client(R, '見る人');
  w.send({ t: 'hello', name: 'w', deck: [], mode: 'watch' });
  assert.deepEqual(w.errors(), ['gone'], 'nothing to watch in an empty room');
  a.send({ t: 'hello', name: 'アリス', deck: a.deck, mode: 'create', profile: { title: 'first', fav: 'dragon' } });
  assert.ok(room.expired() === false);
  w.inbox = [];
  w.send({ t: 'hello', name: 'w', deck: [], mode: 'watch' });
  assert.equal(w.last('watching')?.phase, 'lobby', 'a spectator can wait in the lobby');
  assert.equal(w.last('watching')?.seats[0]?.name, 'アリス');
  assert.equal(w.last('watching')?.seats[0]?.title, 'first', 'a known title is passed on');
  // lobby setup: a new deck and name before the game starts; bad decks and fake titles are refused
  a.send({ t: 'setup', deck: ['scout'] });
  assert.ok(a.errors().includes('deck'));
  a.send({ t: 'setup', name: 'アリス2', deck: PRESET_DECKS[1].cards, profile: { title: 'no-such-title', fav: 'dragon' } });
  assert.equal(w.last('watching')?.seats[0]?.name, 'アリス2');
  assert.equal(w.last('watching')?.seats[0]?.title, undefined, 'unknown titles are dropped');
  b.send({ t: 'hello', name: 'ボブ', deck: b.deck, mode: 'join' });
  assert.equal(b.last('foe')?.foe?.name, 'アリス2');
  assert.equal(b.last('foe')?.foe?.fav, 'dragon');
  const g = w.last('game')!;
  assert.equal(g.fresh, true, 'the spectator gets the start of the game');
  const hidden = (v: GameState) => {
    assert.ok(v.players.every((p) => p.hand.every((h) => h.card === '?')), 'a hand leaked to a spectator');
    assert.ok(v.players.every((p) => p.resv.every((r) => r.revealed || r.card === '?')), 'a reservation leaked to a spectator');
  };
  hidden(g.state);
  w.send({ t: 'act', n: 0, a: { t: 'wait' } });
  assert.equal(truth().actions, 0, 'spectators can not play');
  const rand = mulberry32(11);
  let steps = 0;
  while (!a.result && steps++ < 400) {
    const ps = [a, b];
    const i = ps.findIndex((p) => legalActions(p.view!, 0).length > 0);
    const legal = legalActions(ps[i].view!, 0);
    const pool = legal.filter((x) => x.t !== 'wait' && x.t !== 'draw');
    const src = pool.length && rand() < 0.85 ? pool : legal;
    ps[i].send({ t: 'act', n: ps[i].view!.actions, a: src[Math.floor(rand() * src.length)] });
    const ev = w.last('events')!;
    for (const e of ev.events) if (e.e === 'draw' || e.e === 'reserve') assert.equal(e.card, '?', `${e.e} leaked to a spectator`);
    assert.deepEqual(ev.state, watchState(truth()), 'the spectator view follows the game');
  }
  assert.ok(w.last('over'), 'the spectator sees the end');
  const ra = (a.result as Extract<ServerMsg, { t: 'over' }>).result;
  assert.deepEqual(w.last('over')!.result, ra, 'seat 0 is the spectator\'s point of view');
  // a spectator leaving does not touch the players
  w.send({ t: 'leave' });
  assert.equal(w.closedWith, 1000);
  assert.equal(room.expired(), false);
  console.log('spectators ok');
}
console.log('all net tests passed');
