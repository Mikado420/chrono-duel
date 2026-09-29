/** All tunable numbers in one place so balance passes only touch this file. */
export const RULES = {
  /** The game ends when both clocks reach this. */
  END: 40,
  BASE_HP: 15,
  START_HAND: 4,
  MAX_HAND: 7,
  DECK_SIZE: 20,
  MAX_COPIES: 2,
  MAX_LEGEND_COPIES: 1,
  /** Crossing these on your own clock draws a card. */
  BELLS: [8, 16, 24, 32] as readonly number[],
  /** From this world time, every hit on a base deals +1. */
  DOOM_AT: 20,
  /** Doom bonus grows by 1 every this many ticks after DOOM_AT. */
  DOOM_STEP: 8,
  MAX_RESV: 2,
  /** Pending echoes a player may have at once; further echoes fade without effect. */
  MAX_ECHO: 3,
  /** Earliest reservation = your clock after paying + this. */
  RESV_MIN_GAP: 1,
  COST_ATTACK: 1,
  COST_DRAW: 2,
  COST_WAIT: 1,
  LANES: 3,
} as const;
