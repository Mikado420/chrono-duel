/**
 * Local development server for online play: `npm run dev:server` (ws://localhost:8787).
 * Runs the same Room logic as the Cloudflare Worker, in memory, with a tiny built-in WebSocket implementation
 * (text frames only) so it needs no extra packages. Not for production.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { normalizeCode, type ClientMsg, type ServerMsg } from '../src/core/net';
import { Room, type Conn, type RoomEnv } from '../src/server/room';

const PORT = Number(process.env.PORT ?? 8787);
const env: RoomEnv = { now: () => Date.now(), uuid: () => randomUUID(), seed: () => Math.floor(Math.random() * 2 ** 32) };
const rooms = new Map<string, { room: Room; timer: ReturnType<typeof setTimeout> | null }>();

function frame(opcode: number, payload: Buffer): Buffer {
  const n = payload.length;
  const head = n < 126 ? Buffer.from([0x80 | opcode, n]) : n < 65536 ? Buffer.from([0x80 | opcode, 126, n >> 8, n & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | opcode; b[1] = 127; b.writeBigUInt64BE(BigInt(n), 2); return b; })();
  return Buffer.concat([head, payload]);
}

function accept(code: string, req: IncomingMessage, socket: Duplex) {
  const key = req.headers['sec-websocket-key'];
  if (typeof key !== 'string') { socket.destroy(); return; }
  const acceptKey = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey}\r\n\r\n`);

  let entry = rooms.get(code);
  if (!entry) { entry = { room: new Room(code, env), timer: null }; rooms.set(code, entry); }
  const e = entry;
  let closed = false;
  const conn: Conn = {
    cid: randomUUID(),
    send: (m: ServerMsg) => { if (!closed) socket.write(frame(1, Buffer.from(JSON.stringify(m)))); },
    close: (c: number, reason: string) => {
      if (closed) return;
      closed = true;
      const p = Buffer.alloc(2 + Buffer.byteLength(reason)); p.writeUInt16BE(c, 0); p.write(reason, 2);
      socket.end(frame(8, p));
    },
  };
  const after = () => {
    if (e.timer) clearTimeout(e.timer);
    e.timer = null;
    if (e.room.expired()) { rooms.delete(code); return; }
    const at = e.room.nextAlarm();
    if (at !== null) e.timer = setTimeout(() => { e.room.onAlarm(); after(); }, Math.max(0, at - Date.now()));
  };

  let buf = Buffer.alloc(0);
  socket.on('data', (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 15;
      let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const masked = (buf[1] & 128) !== 0;
      if (buf.length < off + (masked ? 4 : 0) + len) return;
      const mask = masked ? buf.subarray(off, off + 4) : null;
      if (masked) off += 4;
      const data = Buffer.from(buf.subarray(off, off + len));
      if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(off + len);
      if (op === 8) { conn.close(1000, 'bye'); return; }
      if (op === 9) { socket.write(frame(10, data)); continue; }
      if (op !== 1) continue;
      const text = data.toString('utf8');
      if (text === 'ping') { socket.write(frame(1, Buffer.from('pong'))); continue; }
      let msg: ClientMsg;
      try { msg = JSON.parse(text) as ClientMsg; } catch { continue; }
      e.room.onMessage(conn, msg);
      after();
    }
  });
  const gone = () => { if (!closed) closed = true; e.room.onClose(conn); after(); };
  socket.on('close', gone);
  socket.on('error', gone);
}

const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('chrono-duel dev server ok\n'); });
server.on('upgrade', (req, socket) => {
  const m = (req.url ?? '').match(/^\/ws\/([A-Za-z0-9]+)/);
  const code = m ? normalizeCode(m[1]) : null;
  if (!code) { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return; }
  accept(code, req, socket);
});
server.listen(PORT, () => console.log(`chrono-duel dev server: ws://localhost:${PORT}/ws/<CODE>`));
