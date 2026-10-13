/**
 * The rated rivals' decks (名簿のデッキ), rebuilt from scratch in 0.22.x: 7 archetypes > 15 deck types > 37 builds (型).
 * 急襲時計の守衛型と加速騎兵型 are the very lists the two strongest players used in 0.22.0 rated play.
 * Strength was measured by round robins of the same rival brain on both sides (Lv4, every build × 40 games; Lv6, the
 * best build of each type × 10 games). At Lv6 the clock and reservation decks lead (急襲時計 67%, ヴェルナ 65%, 時間牢獄
 * 64%, 籠城バーン 62%) and the plain beatdown and midrange decks trail (27–43%), so the roster gives the simple decks to
 * the low Lv, the middle ones to Lv4–7 and the clock / reservation decks from Lv7–8 up (see roster.ts).
 * `plan` names the 作戦 (src/core/plans.ts) the deck plays with. Ids are stored in rated records: never rename one.
 */
export interface RosterDeck { id: string; name: string; arch: string; type: string; plan: string; cards: string[] }
const ex = (o: Record<string, number>) => Object.entries(o).flatMap(([k, n]) => Array(n).fill(k) as string[]);

export const ROSTER_DECKS: RosterDeck[] = [
  // アグロ
  { id: 'second_aggro_pendulum', name: '秒針 アグロ（振り子兵型）', arch: 'アグロ', type: '秒針 アグロ', plan: 'rush', cards: ex({scout:2,archer:2,e_page:2,pendulum:2,ghost:2,gear:2,lancer:2,haste:2,bolt:2,arrow:2}) },
  { id: 'second_aggro_lancer', name: '秒針 アグロ（突撃槍兵型）', arch: 'アグロ', type: '秒針 アグロ', plan: 'rush', cards: ex({scout:2,archer:2,e_page:2,gear:2,lancer:2,e_raider:2,sentinel:1,haste:2,bolt:2,arrow:2,insight:1}) },
  { id: 'second_aggro_sprite', name: '秒針 アグロ（こだまの妖精型）', arch: 'アグロ', type: '秒針 アグロ', plan: 'rush', cards: ex({scout:2,e_sprite:2,archer:2,e_page:2,gear:2,e_raider:2,haste:2,bolt:2,arrow:2,e_shot:1,e_eternal:1}) },
  { id: 'raid_aggro_arrow', name: '急襲 アグロ（時の矢型）', arch: 'アグロ', type: '急襲 アグロ', plan: 'p_rush', cards: ex({scout:2,e_page:2,archer:2,e_blade:2,gear:2,e_raider:2,e_reverse:2,stop:1,haste:2,bolt:2,arrow:1}) },
  { id: 'raid_aggro_break', name: '急襲 アグロ（破約の刃型）', arch: 'アグロ', type: '急襲 アグロ', plan: 'antiv', cards: ex({scout:2,e_page:2,archer:2,e_blade:2,e_raider:2,e_reverse:2,e_break:2,e_peek:2,haste:2,bolt:2}) },
  { id: 'raid_aggro_ram', name: '急襲 アグロ（城崩しの槌兵型）', arch: 'アグロ', type: '急襲 アグロ', plan: 'p_rush', cards: ex({scout:2,e_page:2,archer:2,x_ram:2,gear:2,e_raider:2,e_reverse:2,haste:2,bolt:2,arrow:2}) },
  { id: 'shadow_aggro_gear', name: '影法師 アグロ（歯車騎士型）', arch: 'アグロ', type: '影法師 アグロ', plan: 'shadow', cards: ex({e_sprite:2,scout:2,e_page:2,ghost:2,e_twin:2,e_march:2,gear:2,haste:2,e_draw:2,bolt:1,e_eternal:1}) },
  { id: 'shadow_aggro_mage', name: '影法師 アグロ（残響術士型）', arch: 'アグロ', type: '影法師 アグロ', plan: 'shadow', cards: ex({e_sprite:2,scout:2,e_page:2,ghost:2,e_twin:2,e_march:2,e_mage:2,haste:2,e_reverse:2,e_eternal:1,bolt:1}) },
  // テンポ
  { id: 'raid_tempo_guard', name: '急襲 テンポ（時計塔の守衛型）', arch: 'テンポ', type: '急襲 テンポ', plan: 'tempo', cards: ex({warden:2,e_sprite:2,e_guard:2,e_reverse:2,stop:1,bolt:2,arrow:2,insight:1,rewind:1,e_draw:2,collapse:1,e_eternal:1,x_mirea:1}) },
  { id: 'raid_tempo_haste', name: '急襲 テンポ（加速型）', arch: 'テンポ', type: '急襲 テンポ', plan: 'tempo', cards: ex({x_seer:2,e_page:2,x_sentry:1,e_raider:2,e_reverse:2,stop:1,haste:2,insight:2,rewind:2,bolt:2,arrow:2}) },
  { id: 'raid_tempo_raider_guard', name: '急襲 テンポ（奇襲の騎兵・時計塔の守衛型）', arch: 'テンポ', type: '急襲 テンポ', plan: 'tempo', cards: ex({warden:2,e_guard:2,e_raider:2,e_reverse:2,stop:1,bolt:2,arrow:2,insight:2,e_draw:2,collapse:1,e_eternal:1,x_mirea:1}) },
  { id: 'raid_tempo_decoy', name: '急襲 テンポ（囮の書型）', arch: 'テンポ', type: '急襲 テンポ', plan: 'tempo', cards: ex({x_seer:2,e_page:2,warden:2,e_raider:2,e_reverse:2,stop:1,x_decoy:2,insight:2,bolt:2,arrow:2,rewind:1}) },
  { id: 'prison_control_delayer', name: '牢獄 コントロール（遅延術師型）', arch: 'コントロール', type: '牢獄 コントロール', plan: 'lock', cards: ex({warden:2,e_guard:2,delayer:2,sentinel:1,cage:2,e_reverse:2,stop:1,bolt:2,arrow:1,rewind:2,e_peek:2,collapse:1}) },
  { id: 'prison_control_sentry', name: '牢獄 コントロール（時計塔の衛士型）', arch: 'コントロール', type: '牢獄 コントロール', plan: 'lock', cards: ex({warden:2,x_sentry:2,e_guard:2,delayer:2,cage:2,e_reverse:2,stop:1,bolt:2,rewind:2,insight:2,e_eternal:1}) },
  { id: 'prison_control_mirea', name: '牢獄 コントロール（記憶の司書ミレア型）', arch: 'コントロール', type: '牢獄 コントロール', plan: 'lock', cards: ex({warden:2,x_seer:2,e_guard:2,delayer:2,cage:2,e_reverse:2,stop:1,bolt:2,insight:2,rewind:2,x_mirea:1}) },
  // バーン
  { id: 'siege_burn_pray', name: '籠城 バーン（残響の祈り型）', arch: 'バーン', type: '籠城 バーン', plan: 'burn', cards: ex({e_sprite:2,warden:2,e_guard:2,bolt:2,e_eternal:1,e_shot:2,arrow:2,e_pray:2,rewind:2,stop:1,insight:2}) },
  { id: 'siege_burn_mirea', name: '籠城 バーン（記憶の司書ミレア型）', arch: 'バーン', type: '籠城 バーン', plan: 'burn', cards: ex({e_sprite:2,warden:2,e_guard:2,bolt:2,e_eternal:1,e_shot:2,arrow:2,e_pray:1,rewind:2,insight:2,e_reverse:1,x_mirea:1}) },
  { id: 'siege_burn_sentry', name: '籠城 バーン（時計塔の衛士型）', arch: 'バーン', type: '籠城 バーン', plan: 'burn', cards: ex({e_sprite:2,warden:2,x_sentry:2,bolt:2,e_eternal:1,e_shot:2,arrow:2,e_pray:2,rewind:2,insight:2,stop:1}) },
  { id: 'resv_burn_mage', name: '予約 バーン（残響術士型）', arch: 'バーン', type: '予約 バーン', plan: 'burn', cards: ex({e_sprite:2,warden:2,e_mage:2,e_guard:1,bolt:2,e_eternal:1,e_shot:2,arrow:2,e_reverse:2,insight:2,e_draw:2}) },
  { id: 'resv_burn_decoy', name: '予約 バーン（囮の書型）', arch: 'バーン', type: '予約 バーン', plan: 'burn', cards: ex({e_sprite:2,warden:2,e_guard:2,bolt:2,e_eternal:1,x_decoy:2,e_reverse:2,stop:1,arrow:2,insight:2,e_pray:2}) },
  // コントロール
  { id: 'break_control_usurper', name: '破約 コントロール（時の簒奪者型）', arch: 'コントロール', type: '破約 コントロール', plan: 'control', cards: ex({warden:2,x_sentry:2,oracle:1,breaker:1,x_usurper:2,heavy:2,e_break:2,arrow:2,collapse:1,rewind:2,insight:2,dragon:1}) },
  { id: 'break_control_oblivion', name: '破約 コントロール（忘却の砂型）', arch: 'コントロール', type: '破約 コントロール', plan: 'control', cards: ex({warden:2,x_seer:2,x_sentry:2,breaker:1,heavy:2,e_atra:1,x_oblivion:2,e_break:2,arrow:2,collapse:1,rewind:2,dragon:1}) },
  { id: 'sweep_control_dragon', name: '一掃 コントロール（夜明けの竜型）', arch: 'コントロール', type: '一掃 コントロール', plan: 'control', cards: ex({warden:2,pendulum:2,scribe:2,heavy:2,e_atra:1,dragon:1,collapse:1,e_storm:1,arrow:2,e_shot:2,rewind:2,insight:2}) },
  { id: 'sweep_control_gust', name: '一掃 コントロール（送り返しの風型）', arch: 'コントロール', type: '一掃 コントロール', plan: 'control', cards: ex({warden:2,x_sentry:2,e_guard:2,heavy:2,e_atra:1,x_gust:2,collapse:1,e_storm:1,arrow:2,e_shot:1,rewind:2,insight:2}) },
  // ミッドレンジ
  { id: 'lancer_beat_scribe', name: '槍兵 ビート（刻の記録係型）', arch: 'ビート', type: '槍兵 ビート', plan: 'balance', cards: ex({scout:2,archer:2,pendulum:1,gear:2,scribe:2,lancer:2,delayer:1,heavy:2,dragon:1,arrow:2,bolt:1,collapse:1,insight:1}) },
  { id: 'lancer_beat_sentinel', name: '槍兵 ビート（鐘楼の歩哨型）', arch: 'ビート', type: '槍兵 ビート', plan: 'balance', cards: ex({archer:2,x_seer:2,gear:2,sentinel:2,lancer:2,heavy:2,arrow:2,bolt:2,insight:2,e_draw:1,dragon:1}) },
  { id: 'lancer_beat_ram', name: '槍兵 ビート（城崩しの槌兵型）', arch: 'ビート', type: '槍兵 ビート', plan: 'balance', cards: ex({archer:2,x_seer:2,x_ram:2,gear:2,lancer:2,e_raider:2,heavy:2,arrow:2,bolt:2,insight:2}) },
  { id: 'hunt_beat_oracle', name: '予約狩り ビート（予見の巫女型）', arch: 'ビート', type: '予約狩り ビート', plan: 'oracle', cards: ex({x_seer:2,x_sentry:2,archer:2,oracle:1,gear:2,lancer:2,breaker:1,heavy:2,arrow:2,bolt:2,e_peek:2}) },
  // 耐久
  { id: 'titan_control_cage', name: '巨像 コントロール（停滞の檻型）', arch: 'コントロール', type: '巨像 コントロール', plan: 'titan', cards: ex({warden:2,pendulum:2,scribe:2,e_guard:2,heavy:2,sentinel:1,titan:1,cage:2,arrow:2,rewind:2,collapse:1,insight:1}) },
  { id: 'titan_control_dragon', name: '巨像 コントロール（夜明けの竜型）', arch: 'コントロール', type: '巨像 コントロール', plan: 'titan', cards: ex({warden:2,x_seer:2,e_guard:2,heavy:2,breaker:1,dragon:1,titan:1,arrow:2,rewind:2,e_pray:2,insight:2,stop:1}) },
  { id: 'charge_beat_heavy', name: '充填 ビート（刻の重装兵型）', arch: 'ビート', type: '充填 ビート', plan: 'charge', cards: ex({warden:2,e_blade:2,pendulum:2,e_guard:2,e_colossus:2,heavy:1,titan:1,e_slash:2,e_pray:2,rewind:2,insight:2}) },
  { id: 'charge_beat_seer', name: '充填 ビート（星読みの占者型）', arch: 'ビート', type: '充填 ビート', plan: 'charge', cards: ex({warden:2,e_blade:2,x_seer:2,e_guard:2,e_colossus:2,e_slash:2,e_reverse:2,stop:1,rewind:2,insight:2,titan:1}) },
  // コンボ
  { id: 'verna_loop_titan', name: 'ヴェルナ ループ（永劫の巨像型）', arch: 'ループ', type: 'ヴェルナ ループ', plan: 'verna', cards: ex({e_sprite:2,ghost:1,cage:1,e_peek:2,e_draw:2,e_pray:2,e_reverse:2,rewind:2,stop:1,e_eternal:1,e_storm:1,e_colossus:1,e_verna:1,titan:1}) },
  { id: 'verna_loop_tuner', name: 'ヴェルナ ループ（調律師型）', arch: 'ループ', type: 'ヴェルナ ループ', plan: 'verna', cards: ex({e_sprite:2,e_tuner:2,e_mage:2,e_peek:2,e_draw:2,e_pray:2,e_reverse:2,rewind:2,bolt:2,e_eternal:1,e_verna:1}) },
  { id: 'verna_loop_guard', name: 'ヴェルナ ループ（時計塔の守衛型）', arch: 'ループ', type: 'ヴェルナ ループ', plan: 'verna', cards: ex({warden:2,e_guard:2,e_sprite:2,e_draw:2,e_pray:2,e_reverse:2,rewind:2,insight:1,stop:1,bolt:2,e_eternal:1,e_verna:1}) },
  { id: 'reso_combo_storm', name: '共鳴 コンボ（残響の嵐型）', arch: 'コンボ', type: '共鳴 コンボ', plan: 'reso', cards: ex({e_sprite:2,e_tuner:2,e_twin:2,e_bellkeeper:2,e_mage:1,e_peek:2,e_draw:2,e_pray:2,e_shot:2,e_storm:1,e_eternal:1,e_verna:1}) },
  { id: 'reso_combo_reverse', name: '共鳴 コンボ（逆転の針型）', arch: 'コンボ', type: '共鳴 コンボ', plan: 'reso', cards: ex({e_sprite:2,e_tuner:2,e_bellkeeper:2,e_mage:1,warden:2,e_reverse:2,e_draw:2,e_pray:2,e_shot:2,bolt:2,e_eternal:1}) },
];

/** The ids the decks had before they were renamed (0.22.x): old records and the server's deck book may still carry them. */
export const LEGACY_DECK_IDS: Record<string, string> = {
  rush_haste: 'second_aggro_pendulum',
  rush_lance: 'second_aggro_lancer',
  rush_sprite: 'second_aggro_sprite',
  raid_rev: 'raid_aggro_arrow',
  raid_break: 'raid_aggro_break',
  raid_ram: 'raid_aggro_ram',
  wide_march: 'shadow_aggro_gear',
  wide_mage: 'shadow_aggro_mage',
  tempo_guard: 'raid_tempo_guard',
  tempo_haste: 'raid_tempo_haste',
  tempo_mix: 'raid_tempo_raider_guard',
  tempo_decoy: 'raid_tempo_decoy',
  burn_heal: 'siege_burn_pray',
  burn_mirea: 'siege_burn_mirea',
  burn_sentry: 'siege_burn_sentry',
  rburn_mage: 'resv_burn_mage',
  rburn_decoy: 'resv_burn_decoy',
  lock_delay: 'prison_control_delayer',
  lock_sentry: 'prison_control_sentry',
  lock_mirea: 'prison_control_mirea',
  break_usurp: 'break_control_usurper',
  break_obliv: 'break_control_oblivion',
  sweep_dragon: 'sweep_control_dragon',
  sweep_gust: 'sweep_control_gust',
  fort_titan: 'titan_control_cage',
  fort_dragon: 'titan_control_dragon',
  mid_scribe: 'lancer_beat_scribe',
  mid_bell: 'lancer_beat_sentinel',
  mid_ram: 'lancer_beat_ram',
  mid_sentry: 'hunt_beat_oracle',
  charge_taunt: 'charge_beat_heavy',
  charge_clock: 'charge_beat_seer',
  verna_titan: 'verna_loop_titan',
  verna_mage: 'verna_loop_tuner',
  verna_guard: 'verna_loop_guard',
  reso_bell: 'reso_combo_storm',
  reso_rev: 'reso_combo_reverse',
};
/** An id as it is today (an old id becomes the new one). */
export const canonDeck = (id: string): string => LEGACY_DECK_IDS[id] ?? id;
/** The 作戦 a deck id plays with (its own id when it has none listed here). */
const PLAN_OF = new Map(ROSTER_DECKS.map((d) => [d.id, d.plan]));
export const planOf = (id: string) => PLAN_OF.get(canonDeck(id)) ?? canonDeck(id);
