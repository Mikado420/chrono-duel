/**
 * The numbers in card text: −X (damage, and the clock or time going back) in vermilion, +X (healing, strengthening,
 * the clock or a delay going forward) in sky blue. "+1/-" raises the attack only. Shared by the card faces, the game's
 * card detail and the strategy wiki, so they colour the same pieces.
 */
export type FxSeg = { t: string; fx?: 'plus' | 'minus' };
/** A signed number: +3, −2, −(1+X), +X/+X, +1/+1, +1/-. */
export const FX_RE = /[+−]\(?[0-9X]+(?:\+X)?\)?(?:\/(?:[+−][0-9X]+|-))?/g;
export const FX_COLOR = { plus: '#7cc8ff', minus: '#ff6b3d' } as const;
export function fxSegments(text: string): FxSeg[] {
  const out: FxSeg[] = [];
  let at = 0;
  for (const m of text.matchAll(FX_RE)) {
    if (m.index! > at) out.push({ t: text.slice(at, m.index) });
    out.push({ t: m[0], fx: m[0][0] === '+' ? 'plus' : 'minus' });
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push({ t: text.slice(at) });
  return out;
}
