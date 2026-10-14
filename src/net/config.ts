import { store } from '../ui/storage';
import { NET } from '../core/net';
export { serverUrl } from './server';

export function inviteLink(code: string): string {
  return `${location.origin}${location.pathname}#/room/${code}`;
}
/** A room code from an invite link (#/room/ABCDE), or null. */
export function codeFromHash(hash: string): string | null {
  const m = hash.match(/^#\/room\/([A-Za-z0-9]{5})$/);
  return m ? m[1].toUpperCase() : null;
}

/** いつもの部屋: a room code of this player's own that never changes (made from the device's account id). */
export function myRoomCode(): string {
  const id = store.account().id;
  let h = 2166136261;
  for (const ch of `room:${id}`) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619) >>> 0; }
  let c = '';
  for (let i = 0; i < NET.CODE_LEN; i++) { c += NET.CODE_CHARS[h % NET.CODE_CHARS.length]; h = (Math.floor(h / NET.CODE_CHARS.length) ^ Math.imul(h, 2654435761)) >>> 0; }
  return c;
}
