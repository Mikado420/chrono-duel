/**
 * リプレイ共有: a finished game is uploaded once and gets a short id; anyone with the link can watch it.
 * The server replays the record before keeping it, so only real, legal, finished games are shared.
 */
import { isGameLog, replay, type GameLog } from '../core/gamelog';
import { cleanName } from '../core/net';
import type { ApiResult, KV } from './leaderboard';

export interface ReplayInfo {
  /** Seat 0 (who shared it) and seat 1. */
  names: [string, string];
  /** Deck names, for the heading. */
  decks: [string, string];
  /** What kind of game it was ('free', 'rated', 'event'…). */
  mode: string;
  at: number;
}
export interface SharedReplay { id: string; log: GameLog; info: ReplayInfo; winner: 0 | 1 | -1 }
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const bad = (status: number, error: string): ApiResult => ({ status, body: { error } });
export const validReplayId = (x: unknown): x is string => typeof x === 'string' && /^[a-z2-9]{10}$/.test(x);

export class Replays {
  constructor(private kv: KV, private now: () => number, private rand: () => number = Math.random) {}

  /** POST /api/replay/save: { log, info } → { id }. */
  async save(body: { log?: unknown; info?: unknown }): Promise<ApiResult> {
    if (!isGameLog(body.log)) return bad(400, 'bad log');
    const end = replay(body.log);
    if (!end || !end.over) return bad(400, 'not a finished game');
    const i = (body.info ?? {}) as Partial<ReplayInfo>;
    const two = (x: unknown): [string, string] => (Array.isArray(x) ? [cleanName(x[0]), cleanName(x[1])] : ['', '']);
    const info: ReplayInfo = { names: two(i.names), decks: two(i.decks).map((d) => d.slice(0, 20)) as [string, string], mode: typeof i.mode === 'string' ? i.mode.slice(0, 12) : 'free', at: this.now() };
    let id = '';
    for (let tries = 0; tries < 8; tries++) {
      id = Array.from({ length: 10 }, () => ALPHABET[Math.floor(this.rand() * ALPHABET.length)]).join('');
      if (!(await this.kv.get(`rp:${id}`))) break;
    }
    const rec: SharedReplay = { id, log: body.log, info, winner: end.over.winner };
    await this.kv.put(`rp:${id}`, rec);
    return { status: 200, body: { id } };
  }

  /** POST /api/replay/get: { id } → the shared game. */
  async get(body: { id?: unknown }): Promise<ApiResult> {
    if (!validReplayId(body.id)) return bad(400, 'bad id');
    const rec = await this.kv.get<SharedReplay>(`rp:${body.id}`);
    return rec ? { status: 200, body: rec } : bad(404, 'no such replay');
  }
}
