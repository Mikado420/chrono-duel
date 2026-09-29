/**
 * One online match room. Platform independent: the Cloudflare Durable Object (server/src/worker.ts) and the
 * local dev server (server/dev.ts) both drive this class, and the tests use fake connections.
 *
 * The room owns the authoritative GameState. Clients send intentions; the room validates them against the
 * engine's legal actions and answers each player with a redacted view (see core/net.ts).
 */
import { validateDeck } from '../core/decks';
import { actor, apply, createGame, legalActions, other, type GameState, type PlayerIndex } from '../core/engine';
import {
  NET, cleanName, sameAction, viewEvents, viewResult, viewState,
  type ClientMsg, type EndKind, type ErrCode, type Phase, type Presence, type RematchState, type ServerMsg,
} from '../core/net';

export interface Conn { cid: string; send(m: ServerMsg): void; close(code: number, reason: string): void }
export interface RoomEnv { now(): number; uuid(): string; seed(): number }

interface PlayerRec { token: string; name: string; deck: string[]; cid: string | null; offlineSince: number | null; strikes: number; rematch: boolean }
interface Outcome { winner: PlayerIndex | -1; reason: EndKind }
export interface RoomSnapshot {
  v: 1; code: string; phase: Phase; players: [PlayerRec | null, PlayerRec | null]; game: GameState | null;
  first: PlayerIndex; deadline: number | null; result: Outcome | null; emptySince: number | null;
}

/** An empty lobby or finished room is dropped after this long. */
const IDLE_MS = 10 * 60_000;

export class Room {
  private phase: Phase = 'lobby';
  private players: [PlayerRec | null, PlayerRec | null] = [null, null];
  private game: GameState | null = null;
  private first: PlayerIndex = 0;
  private deadline: number | null = null;
  private result: Outcome | null = null;
  private emptySince: number | null;
  private conns: [Conn | null, Conn | null] = [null, null];

  constructor(readonly code: string, private env: RoomEnv, snap?: RoomSnapshot) {
    this.emptySince = env.now();
    if (snap) {
      this.phase = snap.phase; this.players = snap.players; this.game = snap.game; this.first = snap.first;
      this.deadline = snap.deadline; this.result = snap.result; this.emptySince = snap.emptySince;
    }
  }

  snapshot(): RoomSnapshot {
    return structuredClone({ v: 1 as const, code: this.code, phase: this.phase, players: this.players, game: this.game, first: this.first, deadline: this.deadline, result: this.result, emptySince: this.emptySince });
  }

  // ------------------------------------------------------------------ queries
  private slotOf(conn: Conn): PlayerIndex | null {
    const i = this.players.findIndex((p) => p && p.cid === conn.cid);
    return i < 0 ? null : (i as PlayerIndex);
  }
  private presence(of: PlayerIndex): Presence | null {
    const p = this.players[of];
    if (!p) return null;
    return { name: p.name, online: p.cid !== null, left: p.offlineSince === null ? null : Math.max(0, p.offlineSince + NET.RECONNECT_MS - this.env.now()) };
  }
  private rematchState(slot: PlayerIndex): RematchState { return { me: !!this.players[slot]?.rematch, foe: !!this.players[other(slot)]?.rematch }; }
  private left(): number | null { return this.deadline === null ? null : Math.max(0, this.deadline - this.env.now()); }
  expired(): boolean {
    return this.players.every((p) => !p) || (this.emptySince !== null && this.env.now() >= this.emptySince + IDLE_MS);
  }
  nextAlarm(): number | null {
    const c: number[] = [];
    for (const p of this.players) if (p && p.offlineSince !== null) c.push(p.offlineSince + NET.RECONNECT_MS);
    if (this.phase === 'playing' && this.deadline !== null) c.push(this.deadline);
    if (this.emptySince !== null) c.push(this.emptySince + IDLE_MS);
    return c.length ? Math.min(...c) : null;
  }

  // ------------------------------------------------------------------ sending
  private send(slot: PlayerIndex, m: ServerMsg) { this.conns[slot]?.send(m); }
  private both(f: (slot: PlayerIndex) => ServerMsg) { for (const s of [0, 1] as PlayerIndex[]) this.send(s, f(s)); }
  private err(conn: Conn, code: ErrCode, msg: string) { conn.send({ t: 'error', code, msg }); }
  private sendFoe() { this.both((s) => ({ t: 'foe', foe: this.presence(other(s)) })); }
  private sendTimer() { const left = this.left(); this.both(() => ({ t: 'timer', left })); }
  private gameMsg(slot: PlayerIndex, fresh: boolean): ServerMsg {
    const g = this.game!;
    return {
      t: 'game', state: viewState(g, slot), first: this.first === slot ? 0 : 1, fresh, left: this.left(),
      result: this.result ? viewResult(this.result, slot) : null, foe: this.presence(other(slot))!, rematch: this.rematchState(slot),
    };
  }
  private touch() {
    const anyOnline = this.players.some((p) => p && p.cid !== null);
    this.emptySince = anyOnline ? null : (this.emptySince ?? this.env.now());
  }

  // ------------------------------------------------------------------ connection lifecycle
  /** Re-bind a socket that survived a restart of the host (Durable Object hibernation). */
  attach(conn: Conn) {
    const s = this.slotOf(conn);
    if (s === null) conn.close(4000, 'unknown connection');
    else this.conns[s] = conn;
  }

  onClose(conn: Conn) {
    const s = this.slotOf(conn);
    if (s === null) return;
    const p = this.players[s]!;
    p.cid = null; p.offlineSince = this.env.now();
    this.conns[s] = null;
    // the clock of a player who is not there does not run; the room waits for them (up to RECONNECT_MS)
    if (this.phase === 'playing' && actor(this.game!) === s && this.deadline !== null) { this.deadline = null; this.sendTimer(); }
    this.sendFoe();
    this.touch();
  }

  onMessage(conn: Conn, m: ClientMsg) {
    if (!m || typeof m !== 'object' || typeof (m as { t?: unknown }).t !== 'string') return this.err(conn, 'bad', 'bad message');
    if (m.t === 'hello') return this.hello(conn, m);
    const s = this.slotOf(conn);
    if (s === null) return this.err(conn, 'bad', 'say hello first');
    switch (m.t) {
      case 'act': return this.act(s, conn, m);
      case 'surrender':
        if (this.phase === 'playing') this.finish(other(s), 'surrender');
        return;
      case 'rematch': return this.rematch(s, conn);
      case 'leave': return this.leave(s, conn);
      default: return this.err(conn, 'bad', 'unknown message');
    }
  }

  private hello(conn: Conn, m: Extract<ClientMsg, { t: 'hello' }>) {
    const name = cleanName(m.name);
    let slot = this.slotOf(conn);
    if (slot === null && typeof m.token === 'string' && m.token) {
      const i = this.players.findIndex((p) => p && p.token === m.token);
      if (i >= 0) slot = i as PlayerIndex;
    }
    if (slot !== null) return this.rebind(slot, conn);

    const occupied = this.players.some((p) => p);
    if (m.mode === 'create' && occupied) return this.err(conn, 'taken', 'このあいことばは使用中です');
    if (m.mode === 'join' && !occupied) return this.err(conn, 'gone', 'そのあいことばの部屋は見つかりませんでした。あいことばを確かめてください');
    if (this.phase !== 'lobby') return this.err(conn, this.players.some((p) => p) ? 'full' : 'gone', '対戦中の部屋には入れません');
    const free = this.players.findIndex((p) => !p);
    if (free < 0) return this.err(conn, 'full', '部屋はもう満員です');
    const deck = Array.isArray(m.deck) && m.deck.every((c) => typeof c === 'string') ? m.deck : null;
    if (!deck || !validateDeck(deck).ok) return this.err(conn, 'deck', 'デッキが正しくありません');

    const s = free as PlayerIndex;
    this.players[s] = { token: this.env.uuid(), name, deck: deck.slice(), cid: conn.cid, offlineSince: null, strikes: 0, rematch: false };
    this.conns[s] = conn;
    this.touch();
    this.send(s, { t: 'welcome', token: this.players[s]!.token, code: this.code, phase: this.phase, foe: this.presence(other(s)) });
    this.sendFoe();
    if (this.players[0] && this.players[1]) this.startGame();
  }

  private rebind(s: PlayerIndex, conn: Conn) {
    const p = this.players[s]!;
    const old = this.conns[s];
    if (old && old.cid !== conn.cid) old.close(4001, 'replaced by a newer connection');
    this.conns[s] = conn; p.cid = conn.cid; p.offlineSince = null;
    this.touch();
    const resumed = this.phase === 'playing' && this.deadline === null;
    if (resumed) this.arm(0);
    this.send(s, { t: 'welcome', token: p.token, code: this.code, phase: this.phase, foe: this.presence(other(s)) });
    if (this.phase !== 'lobby' && this.game) this.send(s, this.gameMsg(s, false));
    if (resumed) this.send(other(s), { t: 'timer', left: this.left() });
    this.sendFoe();
  }

  private leave(s: PlayerIndex, conn: Conn) {
    if (this.phase === 'playing') this.finish(other(s), 'surrender');
    this.players[s] = null; this.conns[s] = null;
    if (this.phase === 'lobby' || !this.players.some((p) => p)) { this.phase = 'lobby'; this.game = null; this.result = null; this.deadline = null; }
    conn.close(1000, 'left');
    this.sendFoe();
    this.touch();
  }

  // ------------------------------------------------------------------ game flow
  private startGame() {
    const seed = this.env.seed() >>> 0;
    this.first = this.game ? other(this.first) : ((seed & 1) as PlayerIndex);
    this.game = createGame([this.players[0]!.deck, this.players[1]!.deck], seed, this.first).state;
    this.phase = 'playing'; this.result = null;
    for (const p of this.players) if (p) { p.strikes = 0; p.rematch = false; }
    this.arm(14); // the opening deal takes a moment to play
    this.both((s) => this.gameMsg(s, true));
  }

  /** Starts the clock of whoever is to act, unless they are away (then the clock waits for them). */
  private arm(eventCount: number) {
    const g = this.game!;
    const a = actor(g);
    const p = a === -1 ? null : this.players[a];
    if (g.over || a === -1 || !p || p.cid === null) { this.deadline = null; return; }
    this.deadline = this.env.now() + NET.TURN_MS + Math.min(NET.ANIM_MAX_MS, eventCount * NET.ANIM_MS_PER_EVENT);
  }

  private act(s: PlayerIndex, conn: Conn, m: Extract<ClientMsg, { t: 'act' }>) {
    if (this.phase !== 'playing' || !this.game) return this.err(conn, 'phase', '対戦中ではありません');
    const g = this.game;
    if (m.n !== g.actions) { this.err(conn, 'stale', '状態がずれています'); this.send(s, this.gameMsg(s, false)); return; }
    if (actor(g) !== s) return this.err(conn, 'turn', 'あなたの番ではありません');
    const legal = legalActions(g, s).some((x) => sameAction(x, m.a));
    if (!legal) return this.err(conn, 'illegal', 'その行動はできません');
    this.players[s]!.strikes = 0;
    this.applyAndSend(m.a, false);
  }

  private applyAndSend(a: Parameters<typeof apply>[1], auto: boolean) {
    const g = this.game!;
    const ev = apply(g, a);
    if (g.over) {
      this.result = { winner: g.over.winner, reason: g.over.reason };
      this.phase = 'over'; this.deadline = null;
    } else this.arm(ev.length);
    this.both((s) => ({ t: 'events', events: viewEvents(ev, s), state: viewState(g, s), left: this.left(), auto }));
    if (this.result) this.both((s) => ({ t: 'over', result: viewResult(this.result!, s) }));
  }

  private finish(winner: PlayerIndex, reason: EndKind) {
    if (this.phase !== 'playing') return;
    this.result = { winner, reason };
    this.phase = 'over'; this.deadline = null;
    for (const p of this.players) if (p) p.rematch = false;
    this.both((s) => ({ t: 'over', result: viewResult(this.result!, s) }));
  }

  private rematch(s: PlayerIndex, conn: Conn) {
    if (this.phase !== 'over' || !this.players[0] || !this.players[1]) return this.err(conn, 'phase', '再戦できません');
    this.players[s]!.rematch = true;
    if (this.players[0].rematch && this.players[1].rematch) return this.startGame();
    this.both((x) => ({ t: 'rematch', rematch: this.rematchState(x) }));
  }

  // ------------------------------------------------------------------ timers
  onAlarm() {
    const now = this.env.now();
    // players who stayed away too long
    for (const s of [0, 1] as PlayerIndex[]) {
      const p = this.players[s];
      if (!p || p.offlineSince === null || now < p.offlineSince + NET.RECONNECT_MS) continue;
      if (this.phase === 'playing') this.finish(other(s), 'disconnect');
      this.players[s] = null; this.conns[s] = null;
      if (this.phase === 'lobby') this.game = null;
      this.sendFoe();
    }
    // the acting player ran out of time: wait on their behalf, and give up on someone who keeps doing so
    if (this.phase === 'playing' && this.game && this.deadline !== null && now >= this.deadline) {
      const a = actor(this.game);
      const p = a === -1 ? null : this.players[a];
      if (p) {
        p.strikes++;
        if (p.strikes >= NET.MAX_AFK) this.finish(other(a as PlayerIndex), 'timeout');
        else this.applyAndSend({ t: 'wait' }, true);
      }
    }
    this.touch();
  }
}
