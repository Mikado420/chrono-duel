import { cleanName, randomCode, type ClientMsg, type LinkStatus, type NetLink, type Phase, type Presence, type RematchState, type ServerMsg } from '../core/net';
import { store } from '../ui/storage';
import { serverUrl } from './config';
import { OnlineClient } from './client';

type GameMsg = Extract<ServerMsg, { t: 'game' }>;

/** What the flow needs from the app shell. */
export interface FlowHost {
  showLobby(): void;
  showConnecting(msg: string): void;
  showError(msg: string): void;
  startBattle(link: NetLink): void;
  hasBattle(): boolean;
}

/** Keeps a saved room this long for rejoining after a reload. */
const RESUME_MS = 10 * 60_000;

/** Client side of an online room: connection, lobby state, and the hand-off to the battle screen. */
export class OnlineFlow {
  code = '';
  myName = '';
  foe: Presence | null = null;
  rematch: RematchState = { me: false, foe: false };
  phase: Phase = 'lobby';
  linkStatus: LinkStatus = 'closed';

  private client: OnlineClient | null = null;
  private changeFns = new Set<() => void>();
  private msgFns = new Set<(m: ServerMsg) => void>();
  private statusFns = new Set<(s: LinkStatus) => void>();
  private resuming = false;

  constructor(private host: FlowHost) {}

  get available() { return serverUrl() !== null; }
  onChange(fn: () => void) { this.changeFns.add(fn); return () => { this.changeFns.delete(fn); }; }
  private emit() { this.changeFns.forEach((f) => f()); }

  create(name: string, deck: string[], tries = 0) {
    this.lastCreate = { name, deck, tries };
    this.enter(randomCode(), name, deck, 'create');
  }

  join(code: string, name: string, deck: string[]) {
    this.lastCreate = null;
    this.enter(code, name, deck, 'join');
  }

  private lastCreate: { name: string; deck: string[]; tries: number } | null = null;
  private enter(code: string, name: string, deck: string[], mode: 'create' | 'join') {
    this.myName = cleanName(name);
    this.resuming = false;
    // the mode only matters for the first hello; reconnects carry the seat token instead
    this.connect(code, (token) => (token ? { t: 'hello', name: this.myName, deck, token } : { t: 'hello', name: this.myName, deck, mode }), null);
  }

  /** Rejoin the room saved by a previous page load. Returns false if there is nothing to resume. */
  resume(): boolean {
    const s = store.session;
    if (!s || Date.now() - s.at > RESUME_MS || !serverUrl()) { store.saveSession(null); return false; }
    this.myName = s.name;
    this.resuming = true;
    this.connect(s.code, (token) => ({ t: 'hello', name: s.name, deck: [], token: token ?? undefined }), s.token);
    return true;
  }

  leave() {
    this.client?.send({ t: 'leave' } satisfies ClientMsg);
    this.stop();
    store.saveSession(null);
  }
  requestRematch() { this.client?.send({ t: 'rematch' }); }

  private stop() {
    const c = this.client;
    this.client = null;
    c?.close();
    this.foe = null;
    this.rematch = { me: false, foe: false };
    this.linkStatus = 'closed';
  }

  private connect(code: string, hello: (token: string | null) => ClientMsg, token: string | null) {
    this.stop();
    const url = serverUrl();
    if (!url) { this.host.showError('オンライン対戦のサーバーが設定されていません'); return; }
    this.code = code;
    this.phase = 'lobby';
    const c = new OnlineClient(url, code, hello, token);
    this.client = c;
    c.onMessage((m) => this.handle(c, m));
    c.onStatus((s) => {
      if (this.client !== c) return;
      this.linkStatus = s;
      this.statusFns.forEach((f) => f(s));
      this.emit();
      if (s === 'closed') this.fail(this.resuming ? '前回の対戦に戻れませんでした' : 'サーバーに接続できませんでした。時間をおいて、もう一度お試しください');
    });
    this.host.showConnecting(this.resuming ? '前回の対戦に戻っています…' : '接続しています…');
    c.open();
  }

  private fail(msg: string) {
    this.stop();
    store.saveSession(null);
    this.host.showError(msg);
  }

  private link(init: GameMsg): NetLink {
    return {
      foeName: init.foe.name,
      init,
      status: () => this.linkStatus,
      send: (m) => this.client?.send(m),
      subscribe: (fn) => { this.msgFns.add(fn); return () => { this.msgFns.delete(fn); }; },
      onStatus: (fn) => { this.statusFns.add(fn); return () => { this.statusFns.delete(fn); }; },
    };
  }

  private handle(c: OnlineClient, m: ServerMsg) {
    if (c !== this.client) return;
    this.msgFns.forEach((f) => f(m));
    switch (m.t) {
      case 'welcome':
        this.resuming = false;
        this.phase = m.phase;
        this.foe = m.foe;
        store.saveSession({ code: m.code, token: m.token, name: this.myName, at: Date.now() });
        if (m.phase === 'lobby') this.host.showLobby();
        this.emit();
        break;
      case 'foe': this.foe = m.foe; this.emit(); break;
      case 'game':
        this.foe = m.foe;
        this.rematch = m.rematch;
        this.phase = m.result ? 'over' : 'playing';
        store.saveSession({ code: this.code, token: store.session?.token ?? '', name: this.myName, at: Date.now() });
        // a fresh game replaces whatever is on screen; a resync is handled by the battle screen itself
        if (m.fresh || !this.host.hasBattle()) this.host.startBattle(this.link(m));
        this.emit();
        break;
      case 'rematch': this.rematch = m.rematch; this.emit(); break;
      case 'over': this.phase = 'over'; this.emit(); break;
      case 'error':
        // a freshly drawn room code happened to be in use: draw another one
        if (m.code === 'taken' && this.lastCreate && this.lastCreate.tries < 5) { const l = this.lastCreate; this.create(l.name, l.deck, l.tries + 1); break; }
        if (m.code === 'taken') { this.fail(m.msg); break; }
        if (m.code === 'full' || m.code === 'gone' || m.code === 'deck' || m.code === 'bad') this.fail(this.resuming ? '前回の対戦に戻れませんでした' : m.msg);
        break;
      default: break;
    }
  }
}

