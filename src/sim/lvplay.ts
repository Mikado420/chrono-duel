/**
 * The AI for the simulation tools, given as Lv1–12 like everywhere else: the same brain the players meet
 * (src/core/rival.ts), with a neutral persona and name. Lv4 is the usual choice for measuring (about 0.1 s a game);
 * Lv5 and up search and take seconds a game, so they suit a final check with a few games.
 */
import { chooseRival, newMind, quirksOf, type RivalCfg, type RivalMind } from '../core/rival';
import { type Action, type GameState, type PlayerIndex } from '../core/engine';

/** The Lv the tools measure with unless told otherwise. */
export const SIM_LV = 4;
/** One AI player for one game: Lv `lv`, playing the plan of deck `deck` (a roster or archetype id; '' for none). */
export function lvAi(lv: number, deck: string, rand: () => number): (s: GameState, pi: PlayerIndex) => Action {
  const cfg: RivalCfg = { name: 'sim', lv, persona: 'steady', deck, quirks: quirksOf('sim') };
  const mind: RivalMind = newMind(rand);
  return (s, pi) => {
    // a tool's AI never gives up: it plays the game out (the surrender check happens once a game)
    const m = chooseRival(s, pi, cfg, mind, rand);
    return m.surrender ? chooseRival(s, pi, cfg, mind, rand).action : m.action;
  };
}
/** Reads `--lv N` (or LV=N) from a tool's arguments, else SIM_LV. */
export function lvArg(argv: string[], env: Record<string, string | undefined> = {}): number {
  const i = argv.indexOf('--lv');
  const v = i >= 0 ? +argv[i + 1] : env.LV ? +env.LV.replace(/^Lv/i, '') : SIM_LV;
  if (!Number.isInteger(v) || v < 1 || v > 12) throw new Error(`Lv は 1〜12 で指定してください（${argv[i + 1] ?? env.LV}）`);
  return v;
}
/** Both seats of one game played by the AI of Lv `lv` (each seat with its own memory), for tests and quick runs. */
export function lvBoth(lv: number, rand: () => number = Math.random, decks: [string, string] = ['', '']): (s: GameState, pi: PlayerIndex) => Action {
  const ais = [lvAi(lv, decks[0], rand), lvAi(lv, decks[1], rand)];
  return (s, pi) => ais[pi](s, pi);
}
