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

export interface Env {
  ROOMS: DurableObjectNamespace<RoomDO>;
  /** Comma separated list of allowed Origin headers. Empty or unset allows any origin. */
  ALLOWED_ORIGINS?: string;
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

interface Attachment { cid: string }

export class RoomDO extends DurableObject<Env> {
  private room: Room | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // keep-alive pings are answered without waking the object
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      const snap = await ctx.storage.get<RoomSnapshot>('room');
      if (!snap) return;
      this.room = new Room(snap.code, roomEnv, snap);
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
    this.room ??= new Room(code, roomEnv);
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

