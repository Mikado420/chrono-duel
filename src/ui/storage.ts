import type { DeckDef } from '../core/decks';
import { CARDS } from '../core/cards';
import { PRESET_DECKS, validateDeck } from '../core/decks';
import { NEW_WALLET, missingCards, type Wallet } from '../meta/economy';

/** localStorage wrapper that never throws (private mode, blocked storage). */
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function write(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable: keep in memory only */ }
}

export interface Settings { volume: number; muted: boolean; speed: number; reduced: boolean; level: 'normal' | 'hard'; lastDeck: string; guided: boolean; name: string }
const DEFAULT_SETTINGS: Settings = { volume: 0.7, muted: false, speed: 1, reduced: false, level: 'normal', lastDeck: 'balance', guided: false, name: '' };

export interface OnlineSession { code: string; token: string; name: string; at: number }

export const store = {
  settings: { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>('cd.settings', {}) } as Settings,
  saveSettings() { write('cd.settings', this.settings); },

  customDecks: read<DeckDef[]>('cd.decks', []).filter((d) => d && Array.isArray(d.cards)),
  saveDecks() { write('cd.decks', this.customDecks); },

  record: read<{ win: number; lose: number; draw: number }>('cd.record', { win: 0, lose: 0, draw: 0 }),
  saveRecord() { write('cd.record', this.record); },

  onlineRecord: read<{ win: number; lose: number; draw: number }>('cd.orecord', { win: 0, lose: 0, draw: 0 }),
  saveOnlineRecord() { write('cd.orecord', this.onlineRecord); },

  /** The room this device is sitting in, so a reload or a killed tab can rejoin the match. */
  session: read<OnlineSession | null>('cd.online', null),
  saveSession(s: OnlineSession | null) {
    this.session = s;
    if (s) write('cd.online', s);
    else { try { localStorage.removeItem('cd.online'); } catch { /* storage unavailable */ } }
  },

  /** Coins, pack tickets and the card collection. */
  wallet: { ...NEW_WALLET(), ...read<Partial<Wallet>>('cd.wallet', {}) } as Wallet,
  saveWallet() { write('cd.wallet', this.wallet); },

  /** `valid`: legal and every card is in the collection. `missing`: cards the player does not own enough of. */
  allDecks(): (DeckDef & { preset: boolean; valid: boolean; missing: string[] })[] {
    return [
      ...PRESET_DECKS.map((d) => ({ ...d, preset: true, valid: true, missing: [] })),
      ...this.customDecks.map((d) => {
        const missing = missingCards(this.wallet, d.cards.filter((c) => CARDS[c] && !CARDS[c].token));
        return { ...d, preset: false, valid: validateDeck(d.cards).ok && missing.length === 0, missing };
      }),
    ];
  },
  deckById(id: string) { return this.allDecks().find((d) => d.id === id); },
};
