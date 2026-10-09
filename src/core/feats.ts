/**
 * 勝ち方の記録: what a won game looked like, read from the events as they are played (seat 0 is always "me").
 * Only rules every set shares are looked at (the clock, reservations, lanes, the base, the deck), so new cards,
 * playmats or sets never change what a feat means.
 */
import { cardDef } from './cards';
import type { GameEvent, GameState } from './engine';
import { RULES } from './rules';

export type Feat = 'winDoom' | 'winLate' | 'winSwift' | 'winLanes' | 'winLegend' | 'winResv' | 'winFlawless' | 'winComeback' | 'winEmpty' | 'winPerfect' | 'winUntouched';

export class FeatTracker {
  /** What my last damage came from (a unit's attack, a spell, a reservation, an echo, a summon). */
  private src: { card: string; resv: boolean } | null = null;
  private finisher: { card: string; resv: boolean } | null = null;
  private hit = false;
  private minHp: number = RULES.BASE_HP;
  see(e: GameEvent) {
    switch (e.e) {
      case 'attack': this.src = e.pi === 0 && e.card ? { card: e.card, resv: false } : null; break;
      case 'cast': this.src = e.pi === 0 ? { card: e.card, resv: false } : null; break;
      case 'trigger': this.src = e.pi === 0 ? { card: e.card, resv: !e.echo } : null; break;
      case 'echo': this.src = e.pi === 0 ? { card: e.card, resv: false } : null; break;
      case 'summon': this.src = e.pi === 0 ? { card: e.unit.card, resv: false } : null; break;
      case 'act': if (e.pi === 1) this.src = null; break;
      case 'dmgBase':
        if (e.pi === 1 && e.hp <= 0 && !this.finisher) this.finisher = e.doom ? null : this.src;
        if (e.pi === 0) { this.hit = true; this.minHp = Math.min(this.minHp, e.hp); }
        break;
    }
  }
  /** The feats of a game I won (none for a loss or a draw). */
  result(s: GameState): Feat[] {
    if (s.over?.winner !== 0) return [];
    const me = s.players[0], foe = s.players[1], ko = s.over.reason === 'ko';
    const out: Feat[] = [];
    const legend = (() => { try { return !!this.finisher && cardDef(this.finisher.card).rarity === 'L'; } catch { return false; } })();
    if (s.doom > 0) out.push('winDoom');
    if (me.time > foe.time) out.push('winLate');
    if (ko && me.time < RULES.DOOM_AT) out.push('winSwift');
    if (me.field.every(Boolean)) out.push('winLanes');
    if (ko && legend) out.push('winLegend');
    if (ko && this.finisher?.resv) out.push('winResv');
    if (me.hp >= RULES.BASE_HP) out.push('winFlawless');
    if (this.minHp <= 3) out.push('winComeback');
    if (me.hand.length === 0 && me.deck.length === 0) out.push('winEmpty');
    if (ko && me.time === RULES.END) out.push('winPerfect');
    if (!this.hit) out.push('winUntouched');
    return out;
  }
}
