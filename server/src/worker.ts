/**
 * Cloudflare Worker + Durable Object host for online rooms.
 *
 * One Durable Object per room code. All game logic lives in src/server/room.ts (shared with the tests and the
 * local dev server); this file only moves bytes: WebSocket <-> Room, snapshot persistence and alarms.
 * It uses the WebSocket Hibernation API, so an idle room costs nothing and survives the object being evicted.
 */
import { DurableObject } from 'cloudflare:workers';
import { normalizeCode, type ClientMsg, type ServerMsg } from '../../src/core/net';
import { Room, type Conn, type RoomEnv, type RoomSnapshot } from '../../src/server/room';
import { Leaderboard, handleApi, type KV } from '../../src/server/leaderboard';
import { PlayStats, type RoomLog } from '../../src/server/stats';
import { Transfer } from '../../src/server/transfer';
import { Replays } from '../../src/server/replays';

export interface Env {
  ROOMS: DurableObjectNamespace<RoomDO>;
  /** One object holds the friends' ranking. */
  RANKING: DurableObjectNamespace<RankingDO>;
  /** Comma separated list of allowed Origin headers. Empty or unset allows any origin. */
  ALLOWED_ORIGINS?: string;
  /** Secret for reading the game records (POST /api/logs). Set with `wrangler secret put ADMIN_TOKEN`; unset = no reading. */
  ADMIN_TOKEN?: string;
}

const roomEnv: RoomEnv = {
  now: () => Date.now(),
  uuid: () => crypto.randomUUID(),
  seed: () => crypto.getRandomValues(new Uint32Array(1))[0],
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/health') return new Response('chrono-duel online ok\n', { headers: { 'content-type': 'text/plain' } });
    if (url.pathname.startsWith('/api/')) return api(req, env);
    const m = url.pathname.match(/^\/ws\/([A-Za-z0-9]+)$/);
    const code = m ? normalizeCode(m[1]) : null;
    if (!code) return new Response('not found', { status: 404 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
    const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const origin = req.headers.get('Origin');
    if (allowed.length && (!origin || !allowed.includes(origin))) return new Response('origin not allowed', { status: 403 });
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(req);
  },
} satisfies ExportedHandler<Env>;

/** Origins allowed to call the API from a browser (same list as the game sockets). */
function corsFor(req: Request, env: Env): Record<string, string> | null {
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get('Origin');
  if (allowed.length && (!origin || !allowed.includes(origin))) return null;
  return { 'access-control-allow-origin': origin ?? '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'Origin' };
}
async function api(req: Request, env: Env): Promise<Response> {
  const cors = corsFor(req, env);
  if (!cors) return new Response('origin not allowed', { status: 403 });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const res = await env.RANKING.get(env.RANKING.idFromName('friends')).fetch(req);
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
  return out;
}

export class RankingDO extends DurableObject<Env> {
  private lb: Leaderboard;
  private stats: PlayStats;
  private transfer: Transfer;
  private replays: Replays;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const kv: KV = {
      get: async <T>(k: string) => (await ctx.storage.get<T>(k)) ?? undefined,
      put: async (k, v) => { await ctx.storage.put(k, v); },
      list: async <T>(prefix: string) => [...(await ctx.storage.list<T>({ prefix })).values()],
      page: async <T>(prefix: string, after: string | undefined, limit: number) => [...(await ctx.storage.list<T>({ prefix, limit, ...(after ? { startAfter: after } : {}) })).entries()],
      delete: async (k) => { await ctx.storage.delete(k); },
    };
    this.transfer = new Transfer(kv, () => Date.now(), () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32);
    this.replays = new Replays(kv, () => Date.now(), () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32);
    this.lb = new Leaderboard(kv, () => Date.now());
    this.stats = new PlayStats(kv, () => Date.now(), env.ADMIN_TOKEN);
  }
  /** Called by the rooms (RPC) when an online game ends. */
  async keepRoom(r: RoomLog): Promise<void> { await this.stats.keepRoom(r); }
  async fetch(req: Request): Promise<Response> {
    const text = await req.text();
    // a game record (actions of both sides) makes a report a few KB; leave room for long games. A whole save
    // (引き継ぎ) is bigger.
    const path = new URL(req.url).pathname;
    if (text.length > (path === '/api/transfer/issue' ? 700_000 : 131_072)) return Response.json({ error: 'too large' }, { status: 413 });
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : {}; } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
    const r = await handleApi(this.lb, path, req.method, body, this.stats, { transfer: this.transfer, replays: this.replays });
    return Response.json(r.body, { status: r.status });
  }
}

interface Attachment { cid: string }

export class RoomDO extends DurableObject<Env> {
  private room: Room | null = null;
  /** Like `roomEnv`, plus handing finished games to the statistics (in the background). */
  private env2: RoomEnv;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.env2 = { ...roomEnv, onLog: (r) => ctx.waitUntil(env.RANKING.get(env.RANKING.idFromName('friends')).keepRoom(r).catch(() => {})) };
    // keep-alive pings are answered without waking the object
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      const snap = await ctx.storage.get<RoomSnapshot>('room');
      if (!snap) return;
      this.room = new Room(snap.code, this.env2, snap);
      for (const ws of ctx.getWebSockets()) this.room.attach(this.conn(ws));
    });
  }

  private conn(ws: WebSocket): Conn {
    const { cid } = ws.deserializeAttachment() as Attachment;
    return {
      cid,
      send: (m: ServerMsg) => { try { ws.send(JSON.stringify(m)); } catch { /* the socket is gone; its close handler follows */ } },
      close: (code: number, reason: string) => { try { ws.close(code, reason); } catch { /* already closed */ } },
    };
  }

  async fetch(req: Request): Promise<Response> {
    const code = normalizeCode(new URL(req.url).pathname.split('/').pop() ?? '');
    if (!code) return new Response('bad room code', { status: 400 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ cid: crypto.randomUUID() } satisfies Attachment);
    this.room ??= new Room(code, this.env2);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== 'string' || data.length > 8192) return;
    let msg: ClientMsg;
    try { msg = JSON.parse(data) as ClientMsg; } catch { return; }
    const conn = this.conn(ws);
    if (!this.room) { conn.send({ t: 'error', code: 'gone', msg: 'この部屋はもうありません' }); conn.close(4404, 'room gone'); return; }
    this.room.onMessage(conn, msg);
    await this.settle();
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    this.room?.onClose(this.conn(ws));
    try { ws.close(1000, 'bye'); } catch { /* already closed */ }
    await this.settle();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.room?.onClose(this.conn(ws));
    await this.settle();
  }

  async alarm(): Promise<void> {
    this.room?.onAlarm();
    await this.settle();
  }

  /** Persist the room and schedule the next timer, or delete everything once nobody needs the room. */
  private async settle(): Promise<void> {
    const room = this.room;
    if (!room) return;
    if (room.expired()) {
      this.room = null;
      for (const ws of this.ctx.getWebSockets()) { try { ws.close(1000, 'room closed'); } catch { /* ignore */ } }
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.ctx.storage.put('room', room.snapshot());
    const at = room.nextAlarm();
    if (at === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(Math.max(at, Date.now() + 50));
  }
}

