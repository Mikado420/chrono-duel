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
  { id: 'rush_haste', name: '秒針ラッシュ（加速型）', arch: 'アグロ', type: '秒針ラッシュ', plan: 'rush', cards: ex({scout:2,archer:2,e_page:2,pendulum:2,ghost:2,gear:2,lancer:2,haste:2,bolt:2,arrow:2}) },
  { id: 'rush_lance', name: '秒針ラッシュ（貫通槍兵型）', arch: 'アグロ', type: '秒針ラッシュ', plan: 'rush', cards: ex({scout:2,archer:2,e_page:2,gear:2,lancer:2,e_raider:2,sentinel:1,haste:2,bolt:2,arrow:2,insight:1}) },
  { id: 'rush_sprite', name: '秒針ラッシュ（妖精火力型）', arch: 'アグロ', type: '秒針ラッシュ', plan: 'rush', cards: ex({scout:2,e_sprite:2,archer:2,e_page:2,gear:2,e_raider:2,haste:2,bolt:2,arrow:2,e_shot:1,e_eternal:1}) },
  { id: 'raid_rev', name: '急襲アグロ（逆転針型）', arch: 'アグロ', type: '急襲アグロ', plan: 'p_rush', cards: ex({scout:2,e_page:2,archer:2,e_blade:2,gear:2,e_raider:2,e_reverse:2,stop:1,haste:2,bolt:2,arrow:1}) },
  { id: 'raid_break', name: '急襲アグロ（破約型）', arch: 'アグロ', type: '急襲アグロ', plan: 'antiv', cards: ex({scout:2,e_page:2,archer:2,e_blade:2,e_raider:2,e_reverse:2,e_break:2,e_peek:2,haste:2,bolt:2}) },
  { id: 'raid_ram', name: '急襲アグロ（槌兵型）', arch: 'アグロ', type: '急襲アグロ', plan: 'p_rush', cards: ex({scout:2,e_page:2,archer:2,x_ram:2,gear:2,e_raider:2,e_reverse:2,haste:2,bolt:2,arrow:2}) },
  { id: 'wide_march', name: '影法師ワイド（歩兵ラリー型）', arch: 'アグロ', type: '影法師ワイド', plan: 'shadow', cards: ex({e_sprite:2,scout:2,e_page:2,ghost:2,e_twin:2,e_march:2,gear:2,haste:2,e_draw:2,bolt:1,e_eternal:1}) },
  { id: 'wide_mage', name: '影法師ワイド（残響術士型）', arch: 'アグロ', type: '影法師ワイド', plan: 'shadow', cards: ex({e_sprite:2,scout:2,e_page:2,ghost:2,e_twin:2,e_march:2,e_mage:2,haste:2,e_reverse:2,e_eternal:1,bolt:1}) },
  // テンポ
  { id: 'tempo_guard', name: '急襲時計（守衛型）', arch: 'テンポ', type: '急襲時計', plan: 'tempo', cards: ex({warden:2,e_sprite:2,e_guard:2,e_reverse:2,stop:1,bolt:2,arrow:2,insight:1,rewind:1,e_draw:2,collapse:1,e_eternal:1,x_mirea:1}) },
  { id: 'tempo_haste', name: '急襲時計（加速騎兵型）', arch: 'テンポ', type: '急襲時計', plan: 'tempo', cards: ex({x_seer:2,e_page:2,x_sentry:1,e_raider:2,e_reverse:2,stop:1,haste:2,insight:2,rewind:2,bolt:2,arrow:2}) },
  { id: 'tempo_mix', name: '急襲時計（騎兵守衛型）', arch: 'テンポ', type: '急襲時計', plan: 'tempo', cards: ex({warden:2,e_guard:2,e_raider:2,e_reverse:2,stop:1,bolt:2,arrow:2,insight:2,e_draw:2,collapse:1,e_eternal:1,x_mirea:1}) },
  { id: 'tempo_decoy', name: '急襲時計（囮の書型）', arch: 'テンポ', type: '急襲時計', plan: 'tempo', cards: ex({x_seer:2,e_page:2,warden:2,e_raider:2,e_reverse:2,stop:1,x_decoy:2,insight:2,bolt:2,arrow:2,rewind:1}) },
  { id: 'lock_delay', name: '時間牢獄（遅延術師型）', arch: 'テンポ', type: '時間牢獄', plan: 'lock', cards: ex({warden:2,e_guard:2,delayer:2,sentinel:1,cage:2,e_reverse:2,stop:1,bolt:2,arrow:1,rewind:2,e_peek:2,collapse:1}) },
  { id: 'lock_sentry', name: '時間牢獄（衛士型）', arch: 'テンポ', type: '時間牢獄', plan: 'lock', cards: ex({warden:2,x_sentry:2,e_guard:2,delayer:2,cage:2,e_reverse:2,stop:1,bolt:2,rewind:2,insight:2,e_eternal:1}) },
  { id: 'lock_mirea', name: '時間牢獄（ミレア型）', arch: 'テンポ', type: '時間牢獄', plan: 'lock', cards: ex({warden:2,x_seer:2,e_guard:2,delayer:2,cage:2,e_reverse:2,stop:1,bolt:2,insight:2,rewind:2,x_mirea:1}) },
  // バーン
  { id: 'burn_heal', name: '籠城バーン（回復厚め型）', arch: 'バーン', type: '籠城バーン', plan: 'burn', cards: ex({e_sprite:2,warden:2,e_guard:2,bolt:2,e_eternal:1,e_shot:2,arrow:2,e_pray:2,rewind:2,stop:1,insight:2}) },
  { id: 'burn_mirea', name: '籠城バーン（ミレア型）', arch: 'バーン', type: '籠城バーン', plan: 'burn', cards: ex({e_sprite:2,warden:2,e_guard:2,bolt:2,e_eternal:1,e_shot:2,arrow:2,e_pray:1,rewind:2,insight:2,e_reverse:1,x_mirea:1}) },
  { id: 'burn_sentry', name: '籠城バーン（衛士型）', arch: 'バーン', type: '籠城バーン', plan: 'burn', cards: ex({e_sprite:2,warden:2,x_sentry:2,bolt:2,e_eternal:1,e_shot:2,arrow:2,e_pray:2,rewind:2,insight:2,stop:1}) },
  { id: 'rburn_mage', name: '予約バーン（残響術士型）', arch: 'バーン', type: '予約バーン', plan: 'burn', cards: ex({e_sprite:2,warden:2,e_mage:2,e_guard:1,bolt:2,e_eternal:1,e_shot:2,arrow:2,e_reverse:2,insight:2,e_draw:2}) },
  { id: 'rburn_decoy', name: '予約バーン（囮の書型）', arch: 'バーン', type: '予約バーン', plan: 'burn', cards: ex({e_sprite:2,warden:2,e_guard:2,bolt:2,e_eternal:1,x_decoy:2,e_reverse:2,stop:1,arrow:2,insight:2,e_pray:2}) },
  // コントロール
  { id: 'break_usurp', name: '破約コントロール（簒奪者型）', arch: 'コントロール', type: '破約コントロール', plan: 'control', cards: ex({warden:2,x_sentry:2,oracle:1,breaker:1,x_usurper:2,heavy:2,e_break:2,arrow:2,collapse:1,rewind:2,insight:2,dragon:1}) },
  { id: 'break_obliv', name: '破約コントロール（忘却型）', arch: 'コントロール', type: '破約コントロール', plan: 'control', cards: ex({warden:2,x_seer:2,x_sentry:2,breaker:1,heavy:2,e_atra:1,x_oblivion:2,e_break:2,arrow:2,collapse:1,rewind:2,dragon:1}) },
  { id: 'sweep_dragon', name: '全体除去（竜型）', arch: 'コントロール', type: '全体除去', plan: 'control', cards: ex({warden:2,pendulum:2,scribe:2,heavy:2,e_atra:1,dragon:1,collapse:1,e_storm:1,arrow:2,e_shot:2,rewind:2,insight:2}) },
  { id: 'sweep_gust', name: '全体除去（送り返し型）', arch: 'コントロール', type: '全体除去', plan: 'control', cards: ex({warden:2,x_sentry:2,e_guard:2,heavy:2,e_atra:1,x_gust:2,collapse:1,e_storm:1,arrow:2,e_shot:1,rewind:2,insight:2}) },
  // ミッドレンジ
  { id: 'mid_scribe', name: '均衡ミッド（記録係型）', arch: 'ミッドレンジ', type: '均衡ミッド', plan: 'balance', cards: ex({scout:2,archer:2,pendulum:1,gear:2,scribe:2,lancer:2,delayer:1,heavy:2,dragon:1,arrow:2,bolt:1,collapse:1,insight:1}) },
  { id: 'mid_bell', name: '均衡ミッド（歩哨型）', arch: 'ミッドレンジ', type: '均衡ミッド', plan: 'balance', cards: ex({archer:2,x_seer:2,gear:2,sentinel:2,lancer:2,heavy:2,arrow:2,bolt:2,insight:2,e_draw:1,dragon:1}) },
  { id: 'mid_ram', name: '均衡ミッド（槌兵型）', arch: 'ミッドレンジ', type: '均衡ミッド', plan: 'balance', cards: ex({archer:2,x_seer:2,x_ram:2,gear:2,lancer:2,e_raider:2,heavy:2,arrow:2,bolt:2,insight:2}) },
  { id: 'mid_sentry', name: '衛士ミッド（予約狩り型）', arch: 'ミッドレンジ', type: '衛士ミッド', plan: 'oracle', cards: ex({x_seer:2,x_sentry:2,archer:2,oracle:1,gear:2,lancer:2,breaker:1,heavy:2,arrow:2,bolt:2,e_peek:2}) },
  // 耐久
  { id: 'fort_titan', name: '巨像城塞（巨像型）', arch: '耐久', type: '巨像城塞', plan: 'titan', cards: ex({warden:2,pendulum:2,scribe:2,e_guard:2,heavy:2,sentinel:1,titan:1,cage:2,arrow:2,rewind:2,collapse:1,insight:1}) },
  { id: 'fort_dragon', name: '巨像城塞（竜＋巨像型）', arch: '耐久', type: '巨像城塞', plan: 'titan', cards: ex({warden:2,x_seer:2,e_guard:2,heavy:2,breaker:1,dragon:1,titan:1,arrow:2,rewind:2,e_pray:2,insight:2,stop:1}) },
  { id: 'charge_taunt', name: '充填巨兵（挑発巨兵型）', arch: '耐久', type: '充填巨兵', plan: 'charge', cards: ex({warden:2,e_blade:2,pendulum:2,e_guard:2,e_colossus:2,heavy:1,titan:1,e_slash:2,e_pray:2,rewind:2,insight:2}) },
  { id: 'charge_clock', name: '充填巨兵（時計稼ぎ型）', arch: '耐久', type: '充填巨兵', plan: 'charge', cards: ex({warden:2,e_blade:2,x_seer:2,e_guard:2,e_colossus:2,e_slash:2,e_reverse:2,stop:1,rewind:2,insight:2,titan:1}) },
  // コンボ
  { id: 'verna_titan', name: 'ヴェルナループ（巨像フィニッシュ型）', arch: 'コンボ', type: 'ヴェルナループ', plan: 'verna', cards: ex({e_sprite:2,ghost:1,cage:1,e_peek:2,e_draw:2,e_pray:2,e_reverse:2,rewind:2,stop:1,e_eternal:1,e_storm:1,e_colossus:1,e_verna:1,titan:1}) },
  { id: 'verna_mage', name: 'ヴェルナループ（術士加速型）', arch: 'コンボ', type: 'ヴェルナループ', plan: 'verna', cards: ex({e_sprite:2,e_tuner:2,e_mage:2,e_peek:2,e_draw:2,e_pray:2,e_reverse:2,rewind:2,bolt:2,e_eternal:1,e_verna:1}) },
  { id: 'verna_guard', name: 'ヴェルナループ（守衛ロック型）', arch: 'コンボ', type: 'ヴェルナループ', plan: 'verna', cards: ex({warden:2,e_guard:2,e_sprite:2,e_draw:2,e_pray:2,e_reverse:2,rewind:2,insight:1,stop:1,bolt:2,e_eternal:1,e_verna:1}) },
  { id: 'reso_bell', name: '共鳴サーカス（鐘守型）', arch: 'コンボ', type: '共鳴サーカス', plan: 'reso', cards: ex({e_sprite:2,e_tuner:2,e_twin:2,e_bellkeeper:2,e_mage:1,e_peek:2,e_draw:2,e_pray:2,e_shot:2,e_storm:1,e_eternal:1,e_verna:1}) },
  { id: 'reso_rev', name: '共鳴サーカス（逆転共鳴型）', arch: 'コンボ', type: '共鳴サーカス', plan: 'reso', cards: ex({e_sprite:2,e_tuner:2,e_bellkeeper:2,e_mage:1,warden:2,e_reverse:2,e_draw:2,e_pray:2,e_shot:2,bolt:2,e_eternal:1}) },
];
/** The 作戦 a deck id plays with (its own id when it has none listed here). */
const PLAN_OF = new Map(ROSTER_DECKS.map((d) => [d.id, d.plan]));
export const planOf = (id: string) => PLAN_OF.get(id) ?? id;
