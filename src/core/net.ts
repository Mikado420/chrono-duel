/**
 * Online play: wire protocol and per-player views.
 *
 * The server owns the one true GameState. Each client only ever receives a *view*: indices are flipped so the
 * viewer is always player 0 (what the renderer expects), and everything the viewer must not know is masked
 * (opponent hand, both deck orders, opponent reservations that have not been revealed).
 */
import { other, type Action, type GameEvent, type GameState, type PlayerIndex, type PlayerState } from './engine';

export const NET = {
  /** Time a player has to act once the previous action has been shown. */
  TURN_MS: 45_000,
  /** Extra time for the animations of the events that led to this turn. */
  ANIM_MS_PER_EVENT: 350,
  ANIM_MAX_MS: 6_000,
  /** How long a dropped player may take to come back before forfeiting. */
  RECONNECT_MS: 60_000,
  /** Consecutive timeouts before a player is treated as away and forfeits. */
  MAX_AFK: 3,
  CODE_LEN: 5,
  /** No I, O, 0, 1: easy to read out loud. */
  CODE_CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  NAME_MAX: 12,
} as const;

export const HIDDEN = '?';

export type Phase = 'lobby' | 'playing' | 'over';
export type EndKind = 'ko' | 'time' | 'surrender' | 'timeout' | 'disconnect';
/** Result seen by one player: winner 0 is "me". */
export interface NetResult { winner: PlayerIndex | -1; reason: EndKind }

export type ClientMsg =
  /** `mode`: 'create' needs an empty room, 'join' needs someone already waiting. A rejoin with `token` ignores it. */
  | { t: 'hello'; name: string; deck: string[]; token?: string; mode?: 'create' | 'join' }
  | { t: 'act'; n: number; a: Action }
  | { t: 'rematch' }
  | { t: 'surrender' }
  | { t: 'leave' };

export type ErrCode = 'bad' | 'deck' | 'full' | 'stale' | 'turn' | 'illegal' | 'phase' | 'gone' | 'taken';

export type ServerMsg =
  | { t: 'welcome'; token: string; code: string; phase: Phase; foe: Presence | null }
  | { t: 'foe'; foe: Presence | null }
  /** Start of a game (fresh) or a resync after reconnecting. `first` is 0 when the viewer moves first. */
  | { t: 'game'; state: GameState; first: PlayerIndex; fresh: boolean; left: number | null; result: NetResult | null; foe: Presence; rematch: RematchState }
  | { t: 'events'; events: GameEvent[]; state: GameState; left: number | null; auto?: boolean }
  /** Time the acting player has left, in ms (durations, not timestamps, so clock skew does not matter). null = paused. */
  | { t: 'timer'; left: number | null }
  | { t: 'over'; result: NetResult }
  | { t: 'rematch'; rematch: RematchState }
  | { t: 'error'; code: ErrCode; msg: string };

/** `left`: ms until an absent player forfeits. */
export interface Presence { name: string; online: boolean; left: number | null }
export interface RematchState { me: boolean; foe: boolean }

// ------------------------------------------------------------------ helpers
export function cleanName(raw: unknown): string {
  const s = String(raw ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, NET.NAME_MAX);
  return s || 'プレイヤー';
}
export function randomCode(rand: () => number = Math.random): string {
  let c = '';
  for (let i = 0; i < NET.CODE_LEN; i++) c += NET.CODE_CHARS[Math.floor(rand() * NET.CODE_CHARS.length)];
  return c;
}
export function normalizeCode(raw: string): string | null {
  const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === NET.CODE_LEN && [...c].every((ch) => NET.CODE_CHARS.includes(ch)) ? c : null;
}
export function sameAction(x: Action, y: Action): boolean {
  if (x.t !== y.t) return false;
  const a = x as unknown as Record<string, unknown>, b = y as unknown as Record<string, unknown>;
  return ['hand', 'lane', 'T', 'to'].every((k) => a[k] === b[k]) && (a.x ?? 0) === (b.x ?? 0);
}

// ------------------------------------------------------------------ views
const mapSide = (v: PlayerIndex) => (p: PlayerIndex): PlayerIndex => (p === v ? 0 : 1);

function viewPlayer(p: PlayerState, own: boolean): PlayerState {
  return {
    hp: p.hp,
    time: p.time,
    deck: p.deck.map(() => HIDDEN),
    hand: p.hand.map((h) => (own ? { ...h } : { uid: h.uid, card: HIDDEN })),
    field: p.field.map((u) => (u ? { ...u } : null)),
    resv: p.resv.map((r) => ({ ...r, card: own || r.revealed ? r.card : HIDDEN })),
  };
}

/** The game as `v` may see it, with `v` as player 0. */
export function viewState(s: GameState, v: PlayerIndex): GameState {
  const f = mapSide(v);
  return {
    players: [viewPlayer(s.players[v], true), viewPlayer(s.players[other(v)], false)],
    last: f(s.last),
    doom: s.doom,
    over: s.over ? { winner: s.over.winner === -1 ? -1 : f(s.over.winner), reason: s.over.reason } : null,
    nextUid: s.nextUid,
    actions: s.actions,
  };
}

/** One event as `v` may see it. */
export function viewEvent(e: GameEvent, v: PlayerIndex): GameEvent {
  const f = mapSide(v);
  switch (e.e) {
    case 'doom': return e;
    case 'end': return { ...e, winner: e.winner === -1 ? -1 : f(e.winner) };
    case 'attack': return { ...e, pi: f(e.pi), target: e.target ? { pi: f(e.target.pi), lane: e.target.lane } : null };
    case 'draw': return { ...e, pi: f(e.pi), card: e.pi === v ? e.card : HIDDEN };
    case 'reserve': return { ...e, pi: f(e.pi), card: e.pi === v ? e.card : HIDDEN };
    default: return { ...e, pi: f(e.pi) } as GameEvent;
  }
}
export const viewEvents = (evs: GameEvent[], v: PlayerIndex): GameEvent[] => evs.map((e) => viewEvent(e, v));

export function viewResult(r: { winner: PlayerIndex | -1; reason: EndKind }, v: PlayerIndex): NetResult {
  return { winner: r.winner === -1 ? -1 : mapSide(v)(r.winner), reason: r.reason };
}

// ------------------------------------------------------------------ what the battle screen needs from the network layer
export type LinkStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';
export interface NetLink {
  foeName: string;
  /** The `game` message that started (or resumed) this battle. */
  init: Extract<ServerMsg, { t: 'game' }>;
  status(): LinkStatus;
  send(m: ClientMsg): void;
  subscribe(fn: (m: ServerMsg) => void): () => void;
  onStatus(fn: (s: LinkStatus) => void): () => void;
}
