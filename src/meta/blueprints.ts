/**
 * 設計図 (仕様書「デッキ構築の学習」): what each archetype must keep when its rivals' lists are improved. The cores
 * and ranges keep a beatdown deck a beatdown deck; the play numbers were measured with `つよい` vs every other deck
 * (16 decks × 300 games, 第2弾 264) and are what a changed list must still look like in simulation.
 * Shared by the game (it checks every delivered list before using it), the server and the daily tools.
 */
import { CARDS, cardDef } from '../core/cards';
import { RULES } from '../core/rules';
import { META_DECKS } from '../sim/metaDecks';
import { ROSTER_DECKS } from '../sim/rosterDecks';
import { SET2_TEST_DECKS } from '../sim/set2Decks';

export type Style = 'beat' | 'burn' | 'endure' | 'resv' | 'mid';
export const STYLE_NAMES: Record<Style, string> = { beat: 'ビートダウン', burn: 'バーン', endure: '耐久', resv: '予約・時計', mid: 'ミッドレンジ' };
export interface ListProfile { avgCost: number; cheap: number; units: number; taunt: number; big: number }
export interface PlayProfile { end: number; koShare: number; dmg20: number; atk: number; resv: number; hpEnd: number }
export interface Blueprint { style: Style; core: Record<string, number>; list: ListProfile; roles: Record<string, number>; play: PlayProfile }

export const BLUEPRINTS: Record<string, Blueprint> = {
  verna: { style: 'resv', core: {"e_verna": 1, "e_eternal": 1, "e_draw": 2, "e_pray": 2, "rewind": 2}, list: {"avgCost": 2.65, "cheap": 15, "units": 6, "taunt": 1, "big": 3}, roles: {"引く": 4, "回復": 4, "軽いユニット": 3, "直接ダメージ": 3, "大型ユニット": 2, "時計操作": 5, "予約への対策": 2, "単体除去": 1, "全体除去": 1, "挑発": 1}, play: {"end": 37.4, "koShare": 23, "dmg20": 2.9, "atk": 2.1, "resv": 5.6, "hpEnd": 9.1} },
  p_rush: { style: 'beat', core: {"e_page": 2, "e_raider": 2, "haste": 2, "bolt": 2}, list: {"avgCost": 2.05, "cheap": 16, "units": 12, "taunt": 0, "big": 0}, roles: {"軽いユニット": 8, "中型ユニット": 4, "時計操作": 1, "強化": 2, "単体除去": 3, "直接ダメージ": 2}, play: {"end": 33.3, "koShare": 69, "dmg20": 5.5, "atk": 4.7, "resv": 2.1, "hpEnd": 5.5} },
  antiv: { style: 'beat', core: {"e_page": 2, "e_raider": 2, "e_break": 2, "e_peek": 2}, list: {"avgCost": 2, "cheap": 18, "units": 8, "taunt": 0, "big": 0}, roles: {"軽いユニット": 6, "中型ユニット": 2, "予約への対策": 4, "時計操作": 2, "強化": 2, "単体除去": 2, "直接ダメージ": 2}, play: {"end": 31.1, "koShare": 79, "dmg20": 6.2, "atk": 3.5, "resv": 3.6, "hpEnd": 4.8} },
  rush: { style: 'beat', core: {"scout": 2, "archer": 2, "haste": 2, "bolt": 2}, list: {"avgCost": 2.3, "cheap": 14, "units": 14, "taunt": 0, "big": 0}, roles: {"軽いユニット": 8, "時計操作": 3, "中型ユニット": 6, "強化": 3, "単体除去": 2, "直接ダメージ": 2}, play: {"end": 34, "koShare": 70, "dmg20": 5.4, "atk": 5.1, "resv": 1.4, "hpEnd": 5} },
  balance: { style: 'mid', core: {"dragon": 1, "collapse": 1, "gear": 2, "arrow": 2}, list: {"avgCost": 2.7, "cheap": 12, "units": 14, "taunt": 1, "big": 2}, roles: {"軽いユニット": 6, "挑発": 1, "中型ユニット": 5, "引く": 2, "時計操作": 1, "大型ユニット": 2, "全体除去": 2, "単体除去": 3, "直接ダメージ": 1}, play: {"end": 36.7, "koShare": 52, "dmg20": 2.8, "atk": 4.9, "resv": 1.9, "hpEnd": 6.6} },
  p_balance: { style: 'mid', core: {"dragon": 1, "collapse": 1, "e_break": 1, "e_slash": 1}, list: {"avgCost": 2.8, "cheap": 11, "units": 14, "taunt": 1, "big": 2}, roles: {"軽いユニット": 6, "挑発": 1, "中型ユニット": 5, "引く": 2, "時計操作": 1, "大型ユニット": 2, "全体除去": 2, "単体除去": 2, "予約への対策": 1, "直接ダメージ": 1}, play: {"end": 36.7, "koShare": 54, "dmg20": 2.5, "atk": 4.9, "resv": 1.3, "hpEnd": 6.3} },
  titan: { style: 'endure', core: {"titan": 1, "warden": 2, "heavy": 2, "rewind": 2}, list: {"avgCost": 3.35, "cheap": 9, "units": 14, "taunt": 3, "big": 5}, roles: {"軽いユニット": 2, "挑発": 3, "中型ユニット": 5, "引く": 4, "強化": 1, "大型ユニット": 4, "予約への対策": 1, "全体除去": 2, "単体除去": 3, "回復": 2}, play: {"end": 37.7, "koShare": 36, "dmg20": 1, "atk": 4, "resv": 1.8, "hpEnd": 8.1} },
  p_titan: { style: 'endure', core: {"titan": 1, "e_colossus": 2, "warden": 2, "e_guard": 1}, list: {"avgCost": 3.25, "cheap": 9, "units": 14, "taunt": 4, "big": 5}, roles: {"軽いユニット": 2, "挑発": 4, "中型ユニット": 4, "引く": 2, "大型ユニット": 4, "予約への対策": 1, "単体除去": 3, "全体除去": 1, "回復": 2}, play: {"end": 38.4, "koShare": 23, "dmg20": 0.8, "atk": 3.7, "resv": 1.4, "hpEnd": 8.9} },
  p_echo: { style: 'mid', core: {"e_tuner": 2, "e_bellkeeper": 2, "e_twin": 2, "e_storm": 1, "e_mage": 1}, list: {"avgCost": 3, "cheap": 9, "units": 13, "taunt": 0, "big": 2}, roles: {"軽いユニット": 4, "直接ダメージ": 3, "中型ユニット": 7, "強化": 4, "単体除去": 5, "回復": 1, "引く": 1, "全体除去": 2, "大型ユニット": 2, "時計操作": 2}, play: {"end": 35.8, "koShare": 51, "dmg20": 2.8, "atk": 4.1, "resv": 1.6, "hpEnd": 7} },
  oracle: { style: 'mid', core: {"oracle": 1, "stop": 1, "delayer": 2, "bolt": 2, "breaker": 1}, list: {"avgCost": 2.6, "cheap": 12, "units": 13, "taunt": 0, "big": 2}, roles: {"軽いユニット": 6, "時計操作": 5, "中型ユニット": 5, "予約への対策": 2, "大型ユニット": 2, "単体除去": 3, "直接ダメージ": 2, "全体除去": 1}, play: {"end": 36.4, "koShare": 52, "dmg20": 3.9, "atk": 5, "resv": 1.8, "hpEnd": 5.5} },
  reso: { style: 'resv', core: {"e_tuner": 2, "e_bellkeeper": 2, "e_verna": 1, "e_mage": 1, "e_draw": 2}, list: {"avgCost": 2.6, "cheap": 12, "units": 10, "taunt": 0, "big": 1}, roles: {"軽いユニット": 4, "強化": 2, "中型ユニット": 5, "単体除去": 4, "大型ユニット": 1, "時計操作": 2, "直接ダメージ": 3, "引く": 2, "回復": 2, "予約への対策": 2, "全体除去": 1}, play: {"end": 35.5, "koShare": 52, "dmg20": 2.9, "atk": 3.5, "resv": 3.4, "hpEnd": 7.8} },
  lock: { style: 'resv', core: {"delayer": 2, "e_reverse": 2, "stop": 1, "cage": 2, "bolt": 2}, list: {"avgCost": 2.4, "cheap": 14, "units": 7, "taunt": 4, "big": 0}, roles: {"中型ユニット": 3, "時計操作": 5, "単体除去": 3, "挑発": 4, "強化": 1, "引く": 2, "回復": 2, "直接ダメージ": 2, "予約への対策": 2, "全体除去": 1}, play: {"end": 37.4, "koShare": 26, "dmg20": 4, "atk": 2.9, "resv": 5.7, "hpEnd": 7.8} },
  charge: { style: 'endure', core: {"e_colossus": 2, "e_blade": 2, "e_slash": 2, "titan": 1}, list: {"avgCost": 2.85, "cheap": 14, "units": 12, "taunt": 5, "big": 4}, roles: {"大型ユニット": 3, "軽いユニット": 4, "単体除去": 3, "挑発": 5, "引く": 3, "回復": 4}, play: {"end": 38.1, "koShare": 16, "dmg20": 0.7, "atk": 3, "resv": 2.2, "hpEnd": 10.1} },
  burn: { style: 'burn', core: {"bolt": 2, "e_eternal": 1, "e_sprite": 2, "e_shot": 2, "warden": 2}, list: {"avgCost": 2.1, "cheap": 17, "units": 6, "taunt": 4, "big": 0}, roles: {"直接ダメージ": 5, "単体除去": 6, "軽いユニット": 2, "挑発": 4, "引く": 2, "回復": 4, "時計操作": 1}, play: {"end": 35.6, "koShare": 34, "dmg20": 5.7, "atk": 1.7, "resv": 4, "hpEnd": 6.2} },
  control: { style: 'endure', core: {"e_break": 2, "breaker": 1, "collapse": 1, "e_storm": 1, "e_atra": 1, "dragon": 1}, list: {"avgCost": 3.3, "cheap": 10, "units": 8, "taunt": 0, "big": 5}, roles: {"大型ユニット": 5, "予約への対策": 5, "全体除去": 4, "中型ユニット": 3, "強化": 1, "単体除去": 4, "引く": 2, "回復": 2}, play: {"end": 36.7, "koShare": 37, "dmg20": 0.9, "atk": 3, "resv": 2.6, "hpEnd": 6.9} },
  shadow: { style: 'beat', core: {"e_twin": 2, "e_march": 2, "haste": 2, "ghost": 2}, list: {"avgCost": 2.1, "cheap": 14, "units": 13, "taunt": 0, "big": 0}, roles: {"軽いユニット": 8, "時計操作": 5, "中型ユニット": 5, "強化": 4, "直接ダメージ": 3, "引く": 2}, play: {"end": 34, "koShare": 59, "dmg20": 5.1, "atk": 5.4, "resv": 3, "hpEnd": 5} },
  g_bells: { style: 'endure', core: {"g_ringmaster": 1, "g_archer": 2, "g_turret": 1, "g_seres": 1, "g_saint": 1, "g_resonance": 1}, list: {"avgCost": 3.1, "cheap": 7, "units": 15, "taunt": 1, "big": 3}, roles: {"軽いユニット": 4, "強化": 3, "単体除去": 7, "中型ユニット": 8, "引く": 4, "回復": 2, "全体除去": 2, "挑発": 1, "大型ユニット": 2, "時計操作": 1}, play: {"end": 38.1, "koShare": 28, "dmg20": 0.9, "atk": 5.1, "resv": 1.1, "hpEnd": 9.2} },
  g_maze: { style: 'beat', core: {"g_architect": 1, "g_flanker": 2, "g_detour": 2, "g_reroute": 2}, list: {"avgCost": 2.3, "cheap": 12, "units": 16, "taunt": 0, "big": 2}, roles: {"軽いユニット": 9, "中型ユニット": 5, "直接ダメージ": 1, "強化": 3, "大型ユニット": 2, "全体除去": 1}, play: {"end": 34.3, "koShare": 67, "dmg20": 5, "atk": 5.3, "resv": 0.8, "hpEnd": 6.7} },
  g_mid: { style: 'endure', core: {"g_waker": 2, "g_bigcog": 1, "g_gearlord": 1, "g_oiler": 1}, list: {"avgCost": 3, "cheap": 10, "units": 14, "taunt": 0, "big": 3}, roles: {"軽いユニット": 5, "強化": 4, "中型ユニット": 6, "単体除去": 7, "大型ユニット": 3}, play: {"end": 36.9, "koShare": 45, "dmg20": 1.4, "atk": 5.3, "resv": 1.4, "hpEnd": 7.3} },
  g_quiet: { style: 'endure', core: {"g_hush": 2, "g_silence": 2, "g_erase": 1, "g_wall": 2}, list: {"avgCost": 2.6, "cheap": 8, "units": 8, "taunt": 3, "big": 1}, roles: {"挑発": 3, "中型ユニット": 5, "回復": 2, "引く": 2, "予約への対策": 5, "強化": 2, "単体除去": 2, "全体除去": 2}, play: {"end": 37.1, "koShare": 19, "dmg20": 1.1, "atk": 3.6, "resv": 3.4, "hpEnd": 7} },
  // レート戦の名簿のデッキ（src/sim/rosterDecks.ts、`npx tsx src/sim/blueprintgen.ts` で作成）
  second_aggro_pendulum: { style: 'beat', core: {"lancer":2,"pendulum":2,"bolt":2,"gear":2,"archer":2}, list: {"avgCost":2.1,"cheap":16,"units":14,"taunt":0,"big":0}, roles: {"軽いユニット":10,"時計操作":2,"中型ユニット":4,"強化":2,"直接ダメージ":2,"単体除去":2}, play: {"end":32.8,"koShare":73,"dmg20":6,"atk":6,"resv":1.4,"hpEnd":5} },
  second_aggro_lancer: { style: 'beat', core: {"lancer":2,"e_raider":2,"bolt":2,"gear":2,"archer":2}, list: {"avgCost":2.4,"cheap":13,"units":13,"taunt":0,"big":0}, roles: {"軽いユニット":6,"中型ユニット":7,"強化":3,"直接ダメージ":2,"単体除去":2,"引く":1}, play: {"end":30.3,"koShare":83,"dmg20":6.2,"atk":5.2,"resv":1.8,"hpEnd":5.6} },
  second_aggro_sprite: { style: 'beat', core: {"e_eternal":1,"e_raider":2,"bolt":2,"gear":2,"archer":2}, list: {"avgCost":2.1,"cheap":15,"units":12,"taunt":0,"big":0}, roles: {"軽いユニット":8,"直接ダメージ":5,"中型ユニット":4,"強化":2,"単体除去":3}, play: {"end":30.9,"koShare":86,"dmg20":7.2,"atk":4.6,"resv":1.8,"hpEnd":3.4} },
  raid_aggro_arrow: { style: 'beat', core: {"stop":1,"e_blade":2,"e_raider":2,"e_reverse":2,"bolt":2}, list: {"avgCost":2.1,"cheap":16,"units":12,"taunt":0,"big":0}, roles: {"軽いユニット":8,"中型ユニット":4,"時計操作":3,"強化":2,"直接ダメージ":2,"単体除去":1}, play: {"end":29.9,"koShare":78,"dmg20":6.7,"atk":5,"resv":1.8,"hpEnd":6} },
  raid_aggro_break: { style: 'beat', core: {"e_blade":2,"e_break":2,"e_raider":2,"e_reverse":2,"bolt":2}, list: {"avgCost":1.9,"cheap":18,"units":10,"taunt":0,"big":0}, roles: {"軽いユニット":8,"中型ユニット":2,"時計操作":2,"予約への対策":4,"強化":2,"直接ダメージ":2}, play: {"end":30.5,"koShare":97,"dmg20":6.3,"atk":4.5,"resv":2.7,"hpEnd":3.9} },
  raid_aggro_ram: { style: 'beat', core: {"x_ram":2,"gear":2,"e_raider":2,"e_reverse":2,"bolt":2}, list: {"avgCost":2.2,"cheap":14,"units":12,"taunt":0,"big":0}, roles: {"軽いユニット":6,"中型ユニット":6,"時計操作":2,"強化":2,"直接ダメージ":2,"単体除去":2}, play: {"end":31.2,"koShare":85,"dmg20":6.4,"atk":5,"resv":2.1,"hpEnd":5.1} },
  shadow_aggro_gear: { style: 'beat', core: {"e_draw":2,"gear":2,"e_eternal":1,"e_twin":2,"bolt":1}, list: {"avgCost":2.1,"cheap":13,"units":14,"taunt":0,"big":0}, roles: {"軽いユニット":8,"直接ダメージ":4,"時計操作":2,"中型ユニット":6,"強化":4,"引く":2}, play: {"end":32.5,"koShare":68,"dmg20":5,"atk":4.9,"resv":1.8,"hpEnd":2.5} },
  shadow_aggro_mage: { style: 'beat', core: {"e_mage":2,"e_reverse":2,"e_eternal":1,"e_twin":2,"bolt":1}, list: {"avgCost":2.2,"cheap":13,"units":14,"taunt":0,"big":0}, roles: {"軽いユニット":8,"直接ダメージ":4,"時計操作":6,"中型ユニット":6,"強化":4}, play: {"end":32.2,"koShare":69,"dmg20":5.4,"atk":5.5,"resv":1.6,"hpEnd":4.3} },
  raid_tempo_guard: { style: 'beat', core: {"x_mirea":1,"e_eternal":1,"stop":1,"e_reverse":2,"bolt":2}, list: {"avgCost":2.45,"cheap":15,"units":7,"taunt":4,"big":1}, roles: {"挑発":4,"軽いユニット":2,"直接ダメージ":5,"時計操作":3,"単体除去":2,"引く":5,"回復":1,"全体除去":1,"大型ユニット":1}, play: {"end":32.9,"koShare":62,"dmg20":6.3,"atk":1.8,"resv":4.5,"hpEnd":5.9} },
  raid_tempo_haste: { style: 'beat', core: {"e_raider":2,"x_seer":2,"stop":1,"e_reverse":2,"bolt":2}, list: {"avgCost":2.15,"cheap":17,"units":7,"taunt":1,"big":0}, roles: {"軽いユニット":4,"引く":6,"挑発":1,"予約への対策":1,"中型ユニット":2,"時計操作":3,"強化":2,"回復":2,"直接ダメージ":2,"単体除去":2}, play: {"end":33.3,"koShare":58,"dmg20":5.6,"atk":3.5,"resv":5,"hpEnd":6.9} },
  raid_tempo_raider_guard: { style: 'beat', core: {"x_mirea":1,"e_eternal":1,"stop":1,"e_reverse":2,"bolt":2}, list: {"avgCost":2.75,"cheap":13,"units":7,"taunt":4,"big":1}, roles: {"挑発":4,"中型ユニット":2,"時計操作":3,"直接ダメージ":3,"単体除去":2,"引く":5,"全体除去":1,"大型ユニット":1}, play: {"end":32.8,"koShare":62,"dmg20":6.3,"atk":2.3,"resv":4.1,"hpEnd":6} },
  raid_tempo_decoy: { style: 'resv', core: {"e_raider":2,"x_seer":2,"stop":1,"e_reverse":2,"bolt":2}, list: {"avgCost":2.2,"cheap":18,"units":8,"taunt":2,"big":0}, roles: {"軽いユニット":4,"引く":7,"挑発":2,"中型ユニット":2,"時計操作":3,"直接ダメージ":2,"単体除去":2,"回復":1}, play: {"end":35.7,"koShare":50,"dmg20":4.9,"atk":4,"resv":5.6,"hpEnd":6.1} },
  prison_control_delayer: { style: 'resv', core: {"sentinel":1,"collapse":1,"stop":1,"delayer":2,"e_reverse":2}, list: {"avgCost":2.4,"cheap":14,"units":7,"taunt":4,"big":0}, roles: {"挑発":4,"中型ユニット":3,"時計操作":5,"強化":1,"単体除去":3,"直接ダメージ":2,"引く":2,"回復":2,"予約への対策":2,"全体除去":1}, play: {"end":37.6,"koShare":24,"dmg20":3.9,"atk":3.6,"resv":5.3,"hpEnd":7.7} },
  prison_control_sentry: { style: 'resv', core: {"e_eternal":1,"x_sentry":2,"stop":1,"delayer":2,"e_reverse":2}, list: {"avgCost":2.5,"cheap":13,"units":8,"taunt":6,"big":0}, roles: {"挑発":6,"予約への対策":2,"中型ユニット":2,"時計操作":5,"単体除去":2,"直接ダメージ":3,"引く":4,"回復":2}, play: {"end":35.5,"koShare":36,"dmg20":5.3,"atk":2.4,"resv":4.6,"hpEnd":5.9} },
  prison_control_mirea: { style: 'resv', core: {"x_mirea":1,"x_seer":2,"stop":1,"delayer":2,"e_reverse":2}, list: {"avgCost":2.45,"cheap":15,"units":9,"taunt":4,"big":1}, roles: {"挑発":4,"軽いユニット":2,"引く":7,"中型ユニット":2,"時計操作":5,"単体除去":2,"直接ダメージ":2,"回復":2,"大型ユニット":1}, play: {"end":36.8,"koShare":24,"dmg20":4.1,"atk":3,"resv":4.5,"hpEnd":7.3} },
  siege_burn_pray: { style: 'burn', core: {"stop":1,"e_guard":2,"e_eternal":1,"bolt":2,"warden":2}, list: {"avgCost":2.2,"cheap":17,"units":6,"taunt":4,"big":0}, roles: {"軽いユニット":2,"直接ダメージ":5,"挑発":4,"単体除去":4,"回復":4,"引く":4,"時計操作":1}, play: {"end":35.4,"koShare":42,"dmg20":5.6,"atk":1.8,"resv":4.4,"hpEnd":5.8} },
  siege_burn_mirea: { style: 'burn', core: {"x_mirea":1,"e_reverse":1,"e_eternal":1,"bolt":2,"warden":2}, list: {"avgCost":2.35,"cheap":16,"units":7,"taunt":4,"big":1}, roles: {"軽いユニット":2,"直接ダメージ":5,"挑発":4,"単体除去":4,"回復":3,"引く":5,"時計操作":1,"大型ユニット":1}, play: {"end":33.1,"koShare":55,"dmg20":5.5,"atk":1.7,"resv":3.8,"hpEnd":5.5} },
  siege_burn_sentry: { style: 'burn', core: {"stop":1,"x_sentry":2,"e_eternal":1,"bolt":2,"warden":2}, list: {"avgCost":2.1,"cheap":17,"units":6,"taunt":4,"big":0}, roles: {"軽いユニット":2,"直接ダメージ":5,"挑発":4,"予約への対策":2,"単体除去":4,"回復":4,"引く":4,"時計操作":1}, play: {"end":34.1,"koShare":30,"dmg20":5.7,"atk":1.5,"resv":4.4,"hpEnd":5.2} },
  resv_burn_mage: { style: 'beat', core: {"e_mage":2,"e_draw":2,"e_eternal":1,"bolt":2,"e_reverse":2}, list: {"avgCost":2.3,"cheap":16,"units":7,"taunt":3,"big":0}, roles: {"軽いユニット":2,"直接ダメージ":5,"挑発":3,"中型ユニット":2,"時計操作":4,"単体除去":4,"引く":4}, play: {"end":32.9,"koShare":59,"dmg20":5.7,"atk":2.3,"resv":4.7,"hpEnd":4.4} },
  resv_burn_decoy: { style: 'resv', core: {"stop":1,"x_decoy":2,"e_eternal":1,"bolt":2,"e_reverse":2}, list: {"avgCost":2.2,"cheap":17,"units":6,"taunt":4,"big":0}, roles: {"軽いユニット":2,"直接ダメージ":5,"挑発":4,"引く":4,"時計操作":3,"単体除去":2,"回復":2}, play: {"end":34.2,"koShare":25,"dmg20":5.6,"atk":1.7,"resv":5.3,"hpEnd":4.6} },
  break_control_usurper: { style: 'mid', core: {"x_usurper":2,"oracle":1,"dragon":1,"breaker":1,"collapse":1}, list: {"avgCost":3.25,"cheap":10,"units":11,"taunt":4,"big":6}, roles: {"挑発":4,"予約への対策":8,"中型ユニット":1,"大型ユニット":6,"単体除去":2,"全体除去":2,"引く":4,"回復":2}, play: {"end":36.3,"koShare":46,"dmg20":0.7,"atk":3.8,"resv":2,"hpEnd":5.9} },
  break_control_oblivion: { style: 'mid', core: {"e_atra":1,"x_seer":2,"dragon":1,"breaker":1,"collapse":1}, list: {"avgCost":3.1,"cheap":12,"units":11,"taunt":4,"big":5}, roles: {"挑発":4,"軽いユニット":2,"引く":6,"予約への対策":5,"大型ユニット":5,"全体除去":3,"単体除去":2,"回復":2}, play: {"end":36.3,"koShare":63,"dmg20":0.8,"atk":3.9,"resv":1.9,"hpEnd":6.5} },
  sweep_control_dragon: { style: 'endure', core: {"dragon":1,"scribe":2,"e_atra":1,"e_storm":1,"collapse":1}, list: {"avgCost":3.05,"cheap":12,"units":10,"taunt":2,"big":4}, roles: {"挑発":2,"軽いユニット":2,"中型ユニット":2,"引く":6,"大型ユニット":4,"全体除去":4,"単体除去":4,"回復":2}, play: {"end":37.1,"koShare":44,"dmg20":1.4,"atk":4.2,"resv":2.4,"hpEnd":7.5} },
  sweep_control_gust: { style: 'endure', core: {"e_guard":2,"x_sentry":2,"e_atra":1,"e_storm":1,"collapse":1}, list: {"avgCost":3.1,"cheap":9,"units":9,"taunt":6,"big":3}, roles: {"挑発":6,"予約への対策":2,"大型ユニット":3,"全体除去":3,"単体除去":5,"引く":4,"回復":2}, play: {"end":37.1,"koShare":38,"dmg20":1.3,"atk":3.7,"resv":2.6,"hpEnd":7.5} },
  lancer_beat_scribe: { style: 'beat', core: {"dragon":1,"delayer":1,"lancer":2,"bolt":1,"heavy":2}, list: {"avgCost":3.05,"cheap":9,"units":15,"taunt":0,"big":3}, roles: {"軽いユニット":5,"中型ユニット":7,"引く":3,"時計操作":1,"大型ユニット":3,"全体除去":2,"単体除去":2,"直接ダメージ":1}, play: {"end":33,"koShare":65,"dmg20":2.9,"atk":5.6,"resv":1,"hpEnd":4.9} },
  lancer_beat_sentinel: { style: 'beat', core: {"dragon":1,"sentinel":2,"lancer":2,"bolt":1,"heavy":2}, list: {"avgCost":3.05,"cheap":11,"units":13,"taunt":0,"big":3}, roles: {"軽いユニット":4,"引く":5,"中型ユニット":6,"強化":2,"大型ユニット":3,"単体除去":2,"直接ダメージ":2,"全体除去":1}, play: {"end":33.7,"koShare":83,"dmg20":2.6,"atk":4.2,"resv":1.9,"hpEnd":4.2} },
  lancer_beat_ram: { style: 'beat', core: {"e_raider":2,"x_seer":2,"lancer":2,"bolt":1,"heavy":2}, list: {"avgCost":2.9,"cheap":10,"units":14,"taunt":0,"big":2}, roles: {"軽いユニット":4,"引く":4,"中型ユニット":8,"大型ユニット":2,"単体除去":2,"直接ダメージ":2}, play: {"end":33.8,"koShare":77,"dmg20":4.4,"atk":4.8,"resv":1.6,"hpEnd":4.7} },
  hunt_beat_oracle: { style: 'beat', core: {"breaker":1,"lancer":2,"oracle":1,"x_seer":2,"bolt":2}, list: {"avgCost":2.8,"cheap":10,"units":14,"taunt":2,"big":3}, roles: {"軽いユニット":4,"引く":2,"挑発":2,"予約への対策":6,"中型ユニット":5,"大型ユニット":3,"単体除去":2,"直接ダメージ":2}, play: {"end":34,"koShare":75,"dmg20":4.1,"atk":4.6,"resv":1.6,"hpEnd":4.6} },
  titan_control_cage: { style: 'endure', core: {"sentinel":1,"collapse":1,"titan":1,"heavy":2,"e_guard":2}, list: {"avgCost":3.05,"cheap":11,"units":12,"taunt":5,"big":3}, roles: {"挑発":5,"軽いユニット":2,"中型ユニット":3,"引く":5,"大型ユニット":2,"強化":1,"単体除去":4,"回復":2,"全体除去":1}, play: {"end":37.4,"koShare":53,"dmg20":0.9,"atk":4.7,"resv":2.5,"hpEnd":6.7} },
  titan_control_dragon: { style: 'endure', core: {"dragon":1,"stop":1,"titan":1,"heavy":2,"e_guard":2}, list: {"avgCost":3.25,"cheap":13,"units":11,"taunt":5,"big":5}, roles: {"挑発":5,"軽いユニット":2,"引く":6,"大型ユニット":4,"予約への対策":1,"全体除去":1,"単体除去":2,"回復":4,"時計操作":1}, play: {"end":37.7,"koShare":43,"dmg20":0.8,"atk":3.5,"resv":2.2,"hpEnd":10.7} },
  charge_beat_heavy: { style: 'endure', core: {"heavy":1,"pendulum":2,"titan":1,"e_colossus":2,"e_blade":2}, list: {"avgCost":2.9,"cheap":14,"units":12,"taunt":5,"big":4}, roles: {"挑発":5,"軽いユニット":4,"大型ユニット":3,"単体除去":2,"回復":4,"引く":4}, play: {"end":37.1,"koShare":40,"dmg20":0.6,"atk":3.8,"resv":1.8,"hpEnd":9} },
  charge_beat_seer: { style: 'endure', core: {"stop":1,"x_seer":2,"titan":1,"e_colossus":2,"e_blade":2}, list: {"avgCost":2.75,"cheap":15,"units":11,"taunt":5,"big":3}, roles: {"挑発":5,"軽いユニット":4,"引く":6,"大型ユニット":2,"単体除去":2,"時計操作":3,"回復":2}, play: {"end":37.2,"koShare":44,"dmg20":1,"atk":3.7,"resv":2.8,"hpEnd":8.1} },
  verna_loop_titan: { style: 'resv', core: {"titan":1,"stop":1,"e_verna":1,"e_eternal":1,"e_draw":2}, list: {"avgCost":2.65,"cheap":15,"units":6,"taunt":1,"big":3}, roles: {"軽いユニット":3,"直接ダメージ":3,"時計操作":5,"単体除去":1,"予約への対策":2,"引く":4,"回復":4,"全体除去":1,"大型ユニット":2,"挑発":1}, play: {"end":37,"koShare":18,"dmg20":2.2,"atk":2.2,"resv":5.2,"hpEnd":8.6} },
  verna_loop_tuner: { style: 'beat', core: {"e_mage":2,"bolt":2,"e_verna":1,"e_eternal":1,"e_draw":2}, list: {"avgCost":2.3,"cheap":16,"units":7,"taunt":0,"big":1}, roles: {"軽いユニット":4,"直接ダメージ":5,"強化":2,"中型ユニット":2,"時計操作":5,"予約への対策":2,"引く":4,"回復":4,"大型ユニット":1}, play: {"end":31.9,"koShare":68,"dmg20":6.6,"atk":1.7,"resv":4.7,"hpEnd":5.6} },
  verna_loop_guard: { style: 'resv', core: {"stop":1,"bolt":2,"e_verna":1,"e_eternal":1,"e_draw":2}, list: {"avgCost":2.4,"cheap":16,"units":7,"taunt":4,"big":1}, roles: {"挑発":4,"軽いユニット":2,"直接ダメージ":5,"引く":5,"回復":4,"時計操作":4,"大型ユニット":1}, play: {"end":34.3,"koShare":36,"dmg20":5.6,"atk":1.3,"resv":4.8,"hpEnd":5.4} },
  reso_combo_storm: { style: 'beat', core: {"e_verna":1,"e_storm":1,"e_eternal":1,"e_mage":1,"e_bellkeeper":2}, list: {"avgCost":2.6,"cheap":12,"units":10,"taunt":0,"big":1}, roles: {"軽いユニット":4,"直接ダメージ":3,"強化":2,"中型ユニット":5,"単体除去":4,"時計操作":2,"予約への対策":2,"引く":2,"回復":2,"全体除去":1,"大型ユニット":1}, play: {"end":33.5,"koShare":62,"dmg20":2.9,"atk":4.1,"resv":3.1,"hpEnd":6.8} },
  reso_combo_reverse: { style: 'beat', core: {"e_reverse":2,"bolt":2,"e_eternal":1,"e_mage":1,"e_bellkeeper":2}, list: {"avgCost":2.3,"cheap":16,"units":9,"taunt":2,"big":0}, roles: {"軽いユニット":4,"直接ダメージ":5,"強化":2,"中型ユニット":3,"単体除去":4,"時計操作":3,"挑発":2,"引く":2,"回復":2}, play: {"end":32.8,"koShare":73,"dmg20":5.7,"atk":3.3,"resv":3.3,"hpEnd":5} },
};

/** The first version of each archetype's list (what every later version is compared with). */
export function originList(id: string): string[] | undefined {
  return [...ROSTER_DECKS, ...META_DECKS, ...SET2_TEST_DECKS].find((d) => d.id === id)?.cards;
}

// ------------------------------------------------------------------ profiles
/** Roles a card plays besides its size (units are also counted by size: 軽い・中型・大型・挑発). */
export const ROLE_CARDS: Record<string, string[]> = {
  '単体除去': ['x_gust', 'arrow', 'cage', 'e_shot', 'e_slash', 'g_spanner', 'g_trap', 'g_hammer', 'g_jammer', 'g_ringer', 'g_archer', 'e_bellkeeper'],
  '全体除去': ['collapse', 'e_storm', 'dragon', 'e_atra', 'g_quake', 'g_gearstorm', 'g_maze', 'g_turret', 'g_rewire'],
  '直接ダメージ': ['bolt', 'e_eternal', 'e_sprite', 'g_courier'],
  '予約への対策': ['x_usurper', 'x_sentry', 'e_break', 'breaker', 'e_peek', 'oracle', 'g_hush', 'g_silence', 'g_erase'],
  '引く': ['x_oblivion', 'x_seer', 'x_decoy', 'x_mirea', 'insight', 'e_draw', 'scribe', 'rewind', 'g_blueprint', 'g_resonance', 'g_clerk', 'g_engineer'],
  '回復': ['rewind', 'e_pray', 'g_warden', 'g_saint'],
  '時計操作': ['stop', 'e_reverse', 'delayer', 'g_seres', 'e_mage', 'e_verna', 'ghost'],
  '強化': ['haste', 'g_reroute', 'g_tune', 'g_overclock', 'g_shield', 'g_overdrive', 'e_march', 'g_lever', 'e_tuner', 'sentinel', 'g_belltoy', 'g_ringmaster', 'g_oiler'],
};
export function sizeRole(id: string): string | null {
  const c = cardDef(id);
  if (c.kind !== 'unit') return null;
  return c.keywords?.includes('taunt') ? '挑発' : c.cost <= 2 ? '軽いユニット' : c.cost <= 4 ? '中型ユニット' : '大型ユニット';
}
export function rolesOf(cards: string[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const id of cards) {
    const s = sizeRole(id);
    if (s) r[s] = (r[s] ?? 0) + 1;
    for (const [k, ids] of Object.entries(ROLE_CARDS)) if (ids.includes(id)) r[k] = (r[k] ?? 0) + 1;
  }
  return r;
}
export function listProfile(cards: string[]): ListProfile {
  const cs = cards.map(cardDef);
  return {
    avgCost: Math.round((cs.reduce((a, c) => a + c.cost, 0) / Math.max(1, cs.length)) * 100) / 100,
    cheap: cs.filter((c) => c.cost <= 2).length,
    units: cs.filter((c) => c.kind === 'unit').length,
    taunt: cs.filter((c) => c.keywords?.includes('taunt')).length,
    big: cs.filter((c) => c.cost >= 5).length,
  };
}
/** 戦型 from play numbers, checked in this order (the first that fits). */
export function styleOf(p: Pick<PlayProfile, 'end' | 'koShare' | 'dmg20' | 'resv'> & { cast: number }): Style {
  if (p.end <= 34.5 && p.koShare >= 58) return 'beat';
  if (p.cast >= 3.8 && p.dmg20 >= 4) return 'burn';
  if (p.dmg20 <= 1.4 && p.end >= 36.7) return 'endure';
  if (p.resv >= 3.4) return 'resv';
  return 'mid';
}
/** Cards two lists share (each card counted up to the smaller number of copies). */
export function shared(a: string[], b: string[]): number {
  const m = new Map<string, number>();
  for (const c of a) m.set(c, (m.get(c) ?? 0) + 1);
  let n = 0;
  for (const c of b) { const k = m.get(c) ?? 0; if (k > 0) { n++; m.set(c, k - 1); } }
  return n;
}
/** Two lists belong together from this many shared cards (of 20). */
export const SAME_GROUP = 12;
/** The archetype a list belongs to: the nearest origin list sharing at least 12 cards, or null (未分類). */
export function classify(cards: string[]): string | null {
  let best: string | null = null, bn = SAME_GROUP - 1;
  // only the decks of today's environment (the roster's builds); the older archetypes are kept for old records
  for (const id of ROSTER_DECKS.map((d) => d.id)) {
    const o = originList(id);
    if (!o) continue;
    const n = shared(o, cards);
    if (n > bn) { bn = n; best = id; }
  }
  return best;
}

// ------------------------------------------------------------------ 型: what tells a build from its siblings
/** The decks of today's environment (the roster's 37 builds). Older archetypes stay only for old records. */
export const ROSTER_IDS = new Set(ROSTER_DECKS.map((d) => d.id));
const SIG = new Map<string, Record<string, number>>();
/**
 * The cards a build is named after (「急襲 テンポ（時計塔の守衛型）」 → 時計塔の守衛), at the number its first list
 * has. A changed list must keep them, or it stops being that 型 (and may turn into one of its siblings).
 */
export function signatureOf(id: string): Record<string, number> {
  let sig = SIG.get(id);
  if (sig) return sig;
  sig = {};
  const d = ROSTER_DECKS.find((x) => x.id === id), o = originList(id);
  const m = d?.name.match(/（(.+)型）$/);
  if (m && o) for (const nm of m[1].split('・')) {
    const c = Object.values(CARDS).find((x) => !x.token && x.name === nm);
    if (c && o.includes(c.id)) sig[c.id] = o.filter((x) => x === c.id).length;
  }
  SIG.set(id, sig);
  return sig;
}
/** The other build whose first list `cards` is at least as near to as to `id`'s own, if any (only for the roster's builds). */
export function tooNear(id: string, cards: string[]): string | null {
  const own = originList(id);
  if (!own || !ROSTER_IDS.has(id)) return null;
  const n = shared(own, cards);
  for (const d of ROSTER_DECKS) if (d.id !== id && shared(d.cards, cards) >= n) return d.id;
  return null;
}

// ------------------------------------------------------------------ the checks a changed list must pass
/** Most cards a list may differ from its archetype's first version by. */
export const MAX_FROM_ORIGIN = 6;
/**
 * Everything wrong with `cards` as a list of archetype `id` (empty = fine): legal deck, only cards in the game,
 * the core and the 型's named cards kept, nearer to its own first version than to any other build's, at most 6 cards away from the first version, the list and role numbers inside their ranges.
 */
export function checkList(id: string, cards: string[]): string[] {
  const bp = BLUEPRINTS[id];
  const o = originList(id);
  if (!bp || !o) return ['知らないアーキタイプ'];
  const out: string[] = [];
  if (cards.length !== RULES.DECK_SIZE) out.push(`${cards.length}枚`);
  const count: Record<string, number> = {};
  for (const c of cards) {
    if (!CARDS[c] || CARDS[c].token) { out.push(`ゲームにないカード ${c}`); continue; }
    count[c] = (count[c] ?? 0) + 1;
  }
  if (out.length) return out;
  for (const [c, n] of Object.entries(count)) if (n > (cardDef(c).rarity === 'L' ? RULES.MAX_LEGEND_COPIES : RULES.MAX_COPIES)) out.push(`${c}が多すぎる`);
  for (const [c, n] of Object.entries(bp.core)) if ((count[c] ?? 0) < n) out.push(`核の${c}が足りない`);
  for (const [c, n] of Object.entries(signatureOf(id))) if ((count[c] ?? 0) < n) out.push(`型の${c}が足りない`);
  const near = tooNear(id, cards);
  if (near) out.push(`${near}の最初の版と同じくらい近い`);
  if (RULES.DECK_SIZE - shared(o, cards) > MAX_FROM_ORIGIN) out.push(`最初の版から${RULES.DECK_SIZE - shared(o, cards)}枚違う`);
  const p = listProfile(cards), b = bp.list;
  if (Math.abs(p.avgCost - b.avgCost) > 0.3) out.push(`平均コスト${p.avgCost}`);
  if (Math.abs(p.cheap - b.cheap) > 3) out.push(`2コスト以下${p.cheap}枚`);
  if (Math.abs(p.units - b.units) > 2) out.push(`ユニット${p.units}枚`);
  if (p.taunt > b.taunt + 1) out.push(`挑発${p.taunt}枚`);
  if (p.big > b.big + 1) out.push(`5コスト以上${p.big}枚`);
  const r = rolesOf(cards);
  const coreRoles = new Set(Object.keys(bp.core).flatMap((c) => Object.keys(rolesOf([c]))));
  for (const k of new Set([...Object.keys(r), ...Object.keys(bp.roles)])) {
    const now = r[k] ?? 0, was = bp.roles[k] ?? 0;
    if (now > Math.max(2, was + 2) || now < was - 2) out.push(`${k}${now}枚`);
    if (coreRoles.has(k) && now < was) out.push(`核の役割「${k}」が減った`);
  }
  return out;
}
/** Whether simulated play numbers still look like the archetype (the same 戦型, each number within its range). */
export function checkPlay(id: string, p: PlayProfile & { cast: number }): string[] {
  const bp = BLUEPRINTS[id];
  if (!bp) return ['知らないアーキタイプ'];
  const b = bp.play, out: string[] = [];
  if (styleOf(p) !== bp.style) out.push(`戦型が${STYLE_NAMES[styleOf(p)]}になる`);
  // 歯車 sits on the 耐久 line (20刻までの拠点ダメージ1.4), so its range is narrower
  const dmgRange = id === 'g_mid' ? 1.0 : 1.5;
  if (Math.abs(p.end - b.end) > 1.5) out.push(`終わる刻${p.end}`);
  if (Math.abs(p.koShare - b.koShare) > 10) out.push(`KO勝ち${p.koShare}%`);
  if (Math.abs(p.dmg20 - b.dmg20) > dmgRange) out.push(`20刻までの拠点ダメージ${p.dmg20}`);
  if (b.atk > 0 && Math.abs(p.atk - b.atk) / b.atk > 0.3) out.push(`攻撃${p.atk}回`);
  if (b.resv > 0 && Math.abs(p.resv - b.resv) / b.resv > 0.3) out.push(`予約${p.resv}回`);
  if (Math.abs(p.hpEnd - b.hpEnd) > 1.5) out.push(`終了時の自拠点${p.hpEnd}`);
  return out;
}
