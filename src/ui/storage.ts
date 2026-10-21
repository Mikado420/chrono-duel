import type { DeckDef } from '../core/decks';
import { CARDS } from '../core/cards';
import { PRESET_DECKS, validateDeck } from '../core/decks';
import { NEW_WALLET, missingCards, type Wallet } from '../meta/economy';
import { NEW_META, migrateMeta, type Meta } from '../meta/progress';
import { NEW_RATED, type Rated } from '../meta/rating';

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

export interface Settings {
  volume: number; bgm: number; muted: boolean; speed: number; reduced: boolean; /** AI strength for free play (Lv1–12). */ aiLv: number; /** The free-play opponent's deck: 'any' (all), 'any:basic', or 'p:' / 'r:' / 'c:' + a basic, environment or own deck id. */ aiDeck?: string; lastDeck: string; guided: boolean; name: string;
  /** Vibrate on the big moments (a legend, the finishing blow, a heavy hit on your base). */
  vibeBig: boolean;
  /** Short taps of vibration for your own actions (placing a card, attacking). */
  vibeTap: boolean;
  /** While a unit is held, show what the attack will do before it is made. */
  attackPreview: boolean;
  /** Ask before spending a ticket or coins on a pack. */
  packConfirm: boolean;
}
const DEFAULT_SETTINGS: Settings = { volume: 0.7, bgm: 0.5, muted: false, speed: 1, reduced: false, aiLv: 3, lastDeck: 'balance', guided: false, name: '', vibeBig: true, vibeTap: true, attackPreview: true, packConfirm: true };

/** Settings with the defaults filled in. Older saves kept a word for the AI's strength instead of its Lv; it becomes the Lv it stood for. */
function loadSettings(): Settings {
  const raw = read<Partial<Settings> & { level?: string }>('cd.settings', {});
  const { level, ...rest } = raw;
  const fromWord: Record<string, number> = { easy: 1, normal: 3, hard: 5, expert: 8 };
  return { ...DEFAULT_SETTINGS, ...(raw.aiLv === undefined && level && fromWord[level] ? { aiLv: fromWord[level] } : {}), ...rest } as Settings;
}

/** Per-deck looks and the card shown for the deck (presets included, so it is kept apart from the deck list). */
export interface DeckLook { back?: string; dial?: string; mat?: string; key?: string }

export interface OnlineSession { code: string; token: string; name: string; at: number }

export const store = {
  settings: loadSettings(),
  saveSettings() { write('cd.settings', this.settings); },

  customDecks: read<DeckDef[]>('cd.decks', []).filter((d) => d && Array.isArray(d.cards)),
  saveDecks() { write('cd.decks', this.customDecks); },

  deckLooks: read<Record<string, DeckLook>>('cd.deckLooks', {}),
  saveDeckLooks() { write('cd.deckLooks', this.deckLooks); },
  lookOf(deckId: string): DeckLook { return this.deckLooks[deckId] ?? {}; },

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

  /** Rated play against the AI. */
  // a saved record without `reset` predates the rating reset; a new player starts already reset
  rated: ((saved) => (saved ? { ...NEW_RATED(), reset: undefined, ...saved } : NEW_RATED()) as Rated)(read<Partial<Rated> | null>('cd.rated', null)),
  saveRated() { write('cd.rated', this.rated); },
  /** Anonymous identity for the friends' ranking (created on first use, kept on this device). */
  account(): { id: string; secret: string } {
    let a = read<{ id: string; secret: string } | null>('cd.account', null);
    if (!a || !a.id || !a.secret) {
      const u = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
      a = { id: u(), secret: u() };
      write('cd.account', a);
    }
    return a;
  },

  /** Rank, missions, login bonus, presents and news. */
  meta: migrateMeta({ ...NEW_META(), ...read<Partial<Meta>>('cd.meta', {}) } as Meta),
  saveMeta() { write('cd.meta', this.meta); },

  /** Starter decks the player removed from their list (they can be brought back at any time). */
  hiddenPresets: read<string[]>('cd.hiddenPresets', []),
  saveHiddenPresets() { write('cd.hiddenPresets', this.hiddenPresets); },
  /** `valid`: legal and every card is in the collection. `missing`: cards the player does not own enough of. */
  allDecks(): (DeckDef & { preset: boolean; valid: boolean; missing: string[] })[] {
    return [
      ...PRESET_DECKS.filter((d) => !this.hiddenPresets.includes(d.id)).map((d) => ({ ...d, preset: true, valid: true, missing: [] })),
      ...this.customDecks.map((d) => {
        const missing = missingCards(this.wallet, d.cards.filter((c) => CARDS[c] && !CARDS[c].token));
        return { ...d, preset: false, valid: validateDeck(d.cards).ok && missing.length === 0, missing };
      }),
    ];
  },
  deckById(id: string) { return this.allDecks().find((d) => d.id === id); },
};
