/**
 * 引き継ぎコード: moving a player's save to another device. The old device uploads its save and gets a short code;
 * the new device sends the code back within 24 hours and receives the save. A code works once.
 * Platform independent (same tiny key-value store as the ranking).
 */
import type { ApiResult, KV } from './leaderboard';

/** Save keys that move (device-only things like sessions, caches and admin tokens stay behind). */
export const TRANSFER_KEYS = ['cd.account', 'cd.wallet', 'cd.meta', 'cd.decks', 'cd.deckLooks', 'cd.hiddenPresets', 'cd.record', 'cd.orecord', 'cd.rated', 'cd.settings'] as const;
export const TRANSFER_TTL = 24 * 3600_000;
/** Letters that cannot be mistaken for each other (no 0/O, 1/I/L). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_BYTES = 600_000;
/** Storage values are kept below the platform's per-value limit. */
const CHUNK = 100_000;

interface Ticket { code: string; at: number; parts: number; used?: boolean }
const bad = (status: number, error: string): ApiResult => ({ status, body: { error } });
/** XXXX-XXXX in upper case (spaces, dashes and lower case are fine); null if it cannot be a code. */
export function normalizeTransferCode(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const s = x.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== 8 || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export class Transfer {
  constructor(private kv: KV, private now: () => number, private rand: () => number = Math.random) {}

  /** POST /api/transfer/issue: { save: Record<key, string> } → { code, until }. */
  async issue(body: { save?: unknown }): Promise<ApiResult> {
    const save = body.save as Record<string, unknown> | undefined;
    if (!save || typeof save !== 'object') return bad(400, 'no save');
    const clean: Record<string, string> = {};
    for (const k of TRANSFER_KEYS) if (typeof save[k] === 'string') clean[k] = save[k] as string;
    if (!clean['cd.account']) return bad(400, 'no account');
    const text = JSON.stringify(clean);
    if (text.length > MAX_BYTES) return bad(413, 'too large');
    await this.sweep();
    let code = '';
    for (let tries = 0; tries < 8; tries++) {
      const raw = Array.from({ length: 8 }, () => ALPHABET[Math.floor(this.rand() * ALPHABET.length)]).join('');
      code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
      if (!(await this.kv.get<Ticket>(`tx:${code}`))) break;
    }
    const parts = Math.ceil(text.length / CHUNK);
    for (let i = 0; i < parts; i++) await this.kv.put(`txp:${code}:${i}`, text.slice(i * CHUNK, (i + 1) * CHUNK));
    const t: Ticket = { code, at: this.now(), parts };
    await this.kv.put(`tx:${code}`, t);
    return { status: 200, body: { code, until: t.at + TRANSFER_TTL } };
  }

  /** POST /api/transfer/redeem: { code } → { save } once, within 24 hours. */
  async redeem(body: { code?: unknown }): Promise<ApiResult> {
    const code = normalizeTransferCode(body.code);
    if (!code) return bad(400, 'bad code');
    const t = await this.kv.get<Ticket>(`tx:${code}`);
    if (!t || t.used) return bad(404, 'no such code');
    if (this.now() - t.at > TRANSFER_TTL) { await this.drop(t); return bad(410, 'expired'); }
    let text = '';
    for (let i = 0; i < t.parts; i++) text += (await this.kv.get<string>(`txp:${code}:${i}`)) ?? '';
    let save: Record<string, string>;
    try { save = JSON.parse(text) as Record<string, string>; } catch { return bad(500, 'broken save'); }
    await this.drop(t);
    return { status: 200, body: { save } };
  }

  private async drop(t: Ticket) {
    for (let i = 0; i < t.parts; i++) {
      if (this.kv.delete) await this.kv.delete(`txp:${t.code}:${i}`); else await this.kv.put(`txp:${t.code}:${i}`, '');
    }
    if (this.kv.delete) await this.kv.delete(`tx:${t.code}`); else await this.kv.put(`tx:${t.code}`, { ...t, used: true, parts: 0 });
  }
  /** Old codes are cleared out whenever a new one is made. */
  private async sweep() {
    const all = await this.kv.list<Ticket>('tx:');
    for (const t of all) if (t && !t.used && this.now() - t.at > TRANSFER_TTL) await this.drop(t);
  }
}
