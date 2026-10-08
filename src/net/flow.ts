import { cleanName, randomCode, type ClientMsg, type LinkStatus, type NetLink, type Phase, type Presence, type Profile, type RematchState, type ServerMsg } from '../core/net';
import { store } from '../ui/storage';
import { serverUrl } from './config';
import { OnlineClient } from './client';

type GameMsg = Extract<ServerMsg, { t: 'game' }>;

/** What the flow needs from the app shell. */
export interface FlowHost {
  showLobby(): void;
  /** Looking on: the seats changed (or the spectator just arrived) while no game is on screen. */
  showWatch(): void;
  /** What this player shows of themselves (title, featured card). */
  profile(): Profile;
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
  /** The deck this player brought (empty when resuming a game after a reload). */
  myDeck: string[] = [];
  foe: Presence | null = null;
  rematch: RematchState = { me: false, foe: false };
  phase: Phase = 'lobby';
  linkStatus: LinkStatus = 'closed';
  /** Looking on instead of playing. */
  watching = false;
  /** Who sits in the room, as a spectator sees it. */
  seats: [Presence | null, Presence | null] = [null, null];
  watchers = 0;

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

  /** Look on at a friend's room. Nothing is saved for resuming: a spectator just opens the room again. */
  watch(code: string, name: string) {
    this.lastCreate = null;
    this.myName = cleanName(name);
    this.myDeck = [];
    this.resuming = false;
    this.connect(code, () => ({ t: 'hello', name: this.myName, deck: [], mode: 'watch' }), null, true);
  }

  /** In the lobby: bring another deck or change the name shown to the other player. */
  setup(change: { name?: string; deck?: string[] }) {
    if (change.name !== undefined) this.myName = cleanName(change.name);
    if (change.deck) this.myDeck = change.deck.slice();
    this.client?.send({ t: 'setup', ...change, profile: this.host.profile() });
    this.emit();
  }

  private lastCreate: { name: string; deck: string[]; tries: number } | null = null;
  private enter(code: string, name: string, deck: string[], mode: 'create' | 'join') {
    this.myName = cleanName(name);
    this.myDeck = deck.slice();
    this.resuming = false;
    // the mode only matters for the first hello; reconnects carry the seat token instead
    // the deck may change in the lobby, so a reconnect sends the latest one
    this.connect(code, (token) => (token ? { t: 'hello', name: this.myName, deck: this.myDeck, token, profile: this.host.profile() } : { t: 'hello', name: this.myName, deck: this.myDeck, mode, profile: this.host.profile() }), null);
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
    const watching = this.watching;
    this.stop();
    if (!watching) store.saveSession(null);
  }
  requestRematch() { this.client?.send({ t: 'rematch' }); }

  private stop() {
    const c = this.client;
    this.client = null;
    c?.close();
    this.foe = null;
    this.rematch = { me: false, foe: false };
    this.linkStatus = 'closed';
    this.watching = false;
    this.seats = [null, null];
    this.watchers = 0;
  }

  private connect(code: string, hello: (token: string | null) => ClientMsg, token: string | null, watch = false) {
    this.stop();
    this.watching = watch;
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
    this.host.showConnecting(this.resuming ? '前回の対戦に戻っています…' : watch ? '観戦する部屋に入っています…' : '接続しています…');
    c.open();
  }

  private fail(msg: string) {
    const watching = this.watching;
    this.stop();
    if (!watching) store.saveSession(null);
    this.host.showError(msg);
  }

  private link(init: GameMsg): NetLink {
    return {
      foeName: init.foe.name,
      ...(this.watching ? { watch: { names: [this.seats[0]?.name ?? 'プレイヤー1', this.seats[1]?.name ?? init.foe.name] as [string, string] } } : {}),
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
      case 'watching':
        this.seats = m.seats;
        this.watchers = m.watchers;
        this.phase = m.phase;
        if (!this.host.hasBattle()) this.host.showWatch();
        this.emit();
        break;
      case 'game':
        this.foe = m.foe;
        this.rematch = m.rematch;
        this.phase = m.result ? 'over' : 'playing';
        if (!this.watching) store.saveSession({ code: this.code, token: store.session?.token ?? '', name: this.myName, at: Date.now() });
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

