/** Test decks built around 第2弾「歯車の迷宮」(balance runs only, not shown in the game). Call registerSet2() first. */
import type { DeckDef } from '../core/decks';

const expand = (m: Record<string, number>) => Object.entries(m).flatMap(([k, n]) => Array(n).fill(k) as string[]);

export const SET2_TEST_DECKS: DeckDef[] = [
  { id: 'g_bells', name: '鐘楼', cards: expand({ g_belltoy: 2, g_ringer: 2, g_clerk: 2, g_warden: 1, g_archer: 2, g_turret: 1, g_engineer: 1, g_ringmaster: 1, g_resonance: 1, g_sentry: 1, g_saint: 1, g_quake: 1, arrow: 2, g_hammer: 1, g_seres: 1 }) },
  { id: 'g_maze', name: '迷宮', cards: expand({ g_cog: 2, g_runner: 2, g_walker: 2, g_charger: 2, g_detour: 2, g_flanker: 2, g_courier: 1, g_reroute: 2, g_tune: 1, g_drill: 1, g_architect: 1, g_phantom: 1, g_gearstorm: 1 }) },
  { id: 'g_mid', name: '歯車', cards: expand({ g_walker: 2, g_belltoy: 2, g_oiler: 1, g_charger: 2, g_archer: 1, g_waker: 2, g_jammer: 1, g_colossus: 1, g_bigcog: 1, g_trap: 2, g_hammer: 1, g_spanner: 2, g_overclock: 1, g_gearlord: 1 }) },
  { id: 'g_quiet', name: '静寂', cards: expand({ g_wall: 2, g_warden: 2, g_sentry: 1, g_clerk: 2, g_hush: 2, g_silence: 2, g_erase: 1, g_shield: 1, g_hammer: 2, g_maze: 1, g_rewire: 1, g_mirror: 1, g_overdrive: 1, g_carpenter: 1 }) },
];
