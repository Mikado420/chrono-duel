import type { ClientMsg, LinkStatus, ServerMsg } from '../core/net';

const PING_MS = 15_000;
const DEAD_MS = 40_000;
/** Stop retrying after this long without a connection. */
const GIVE_UP_MS = 90_000;

/** One room connection with keep-alive and automatic reconnection (the server keeps your seat for a minute). */
export class OnlineClient {
  status: LinkStatus = 'closed';
  private ws: WebSocket | null = null;
  private msgFns = new Set<(m: ServerMsg) => void>();
  private statusFns = new Set<(s: LinkStatus) => void>();
  private wanted = false;
  private retry = 0;
  private downSince = 0;
  private lastPong = 0;
  private retryTimer = 0;
  private pingTimer = 0;
  private token: string | null;

  constructor(readonly url: string, readonly code: string, private hello: (token: string | null) => ClientMsg, token: string | null) {
    this.token = token;
  }

  onMessage(fn: (m: ServerMsg) => void) { this.msgFns.add(fn); return () => this.msgFns.delete(fn); }
  onStatus(fn: (s: LinkStatus) => void) { this.statusFns.add(fn); return () => this.statusFns.delete(fn); }
  private setStatus(s: LinkStatus) { if (this.status !== s) { this.status = s; this.statusFns.forEach((f) => f(s)); } }

  open() {
    this.wanted = true;
    this.downSince = Date.now();
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('online', this.onOnline);
    this.connect();
  }

  send(m: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  close() {
    this.wanted = false;
    clearTimeout(this.retryTimer);
    clearInterval(this.pingTimer);
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('online', this.onOnline);
    const ws = this.ws;
    this.ws = null;
    try { ws?.close(1000, 'bye'); } catch { /* already closed */ }
    this.setStatus('closed');
  }

  private connect() {
    if (!this.wanted) return;
    this.setStatus(this.retry === 0 && this.status !== 'reconnecting' ? 'connecting' : 'reconnecting');
    let ws: WebSocket;
    try { ws = new WebSocket(`${this.url}/ws/${this.code}`); } catch { this.scheduleRetry(); return; }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.retry = 0;
      this.lastPong = Date.now();
      this.setStatus('open');
      ws.send(JSON.stringify(this.hello(this.token)));
      clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => this.keepAlive(), PING_MS);
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws || typeof ev.data !== 'string') return;
      this.lastPong = Date.now();
      if (ev.data === 'pong') return;
      let m: ServerMsg;
      try { m = JSON.parse(ev.data) as ServerMsg; } catch { return; }
      if (m.t === 'welcome') this.token = m.token;
      this.msgFns.forEach((f) => f(m));
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      clearInterval(this.pingTimer);
      // 4001: another tab took this seat. 4404: the room no longer exists. Both are final.
      if (ev.code === 4001 || ev.code === 4404 || ev.code === 1000) { this.wanted = false; this.setStatus('closed'); return; }
      this.scheduleRetry();
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  private scheduleRetry() {
    if (!this.wanted) return;
    if (Date.now() - this.downSince > GIVE_UP_MS) { this.wanted = false; this.setStatus('closed'); return; }
    this.setStatus('reconnecting');
    const delay = Math.min(4000, 400 * 2 ** this.retry++);
    clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => this.connect(), delay);
  }

  private keepAlive() {
    if (Date.now() - this.lastPong > DEAD_MS) { try { this.ws?.close(); } catch { /* ignore */ } return; }
    try { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send('ping'); } catch { /* ignore */ }
  }

  /** Phones freeze background tabs: check the socket the moment the player comes back. */
  private onVisible = () => {
    if (document.visibilityState !== 'visible' || !this.wanted) return;
    if (this.ws?.readyState === WebSocket.OPEN) { this.lastPong = Math.min(this.lastPong, Date.now() - DEAD_MS + 4000); this.keepAlive(); }
    else if (this.status === 'reconnecting') { this.retry = 0; clearTimeout(this.retryTimer); this.connect(); }
  };
  private onOnline = () => { if (this.wanted && this.status === 'reconnecting') { this.retry = 0; clearTimeout(this.retryTimer); this.connect(); } };
}
