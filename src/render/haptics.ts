/**
 * Vibration on phones that support it (navigator.vibrate). Two switches in the settings:
 * `big` for the moments that matter (a legend, the finishing blow, a heavy hit on your base) and
 * `tap` for a short tick on your own actions. Silent everywhere else (iOS Safari has no vibration).
 */
const state = { big: true, tap: true, reduced: false };
function buzz(p: number | number[]) {
  try { if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(p); } catch { /* not allowed here */ }
}
export const haptics = {
  set(o: { big: boolean; tap: boolean }) { state.big = o.big; state.tap = o.tap; },
  /** A short tick for your own action. */
  tap() { if (state.tap) buzz(10); },
  /** A heavier pulse for a big moment. */
  big(kind: 'hit' | 'legend' | 'win' | 'lose' = 'hit') {
    if (!state.big) return;
    buzz(kind === 'legend' ? [30, 60, 30, 60, 80] : kind === 'win' ? [40, 50, 90] : kind === 'lose' ? 60 : [24, 40, 24]);
  },
};
