/**
 * Turns the themed look art (lookArt.ts) into canvases, once per look and size, and keeps them.
 * SVG pictures load asynchronously, so card backs are prepared when the game starts and faces and mats before a
 * battle; anything not ready yet falls back to the plain brass look and swaps in when it arrives.
 */
import { BACK_ART, DIAL_ART, DIAL_S, DIAL_VIEW, MAT_ART, MAT_VIEW, backSvg, dialPartSvg, matFlatSvg, matPartSvg, spinSvg } from './lookArt';
import { FONTS } from './theme';

/** Card size (cardArt.ts CARD_W/CARD_H; repeated here so the two modules do not import each other). */
const CARD_W = 340, CARD_H = 476;

const done = new Map<string, HTMLCanvasElement>();
const busy = new Map<string, Promise<HTMLCanvasElement>>();

function loadImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('svg failed'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}
/** Draws an SVG into a canvas of w×h pixels (cached by `key`). */
export function raster(key: string, svg: string, w: number, h: number, after?: (c: CanvasRenderingContext2D) => void): Promise<HTMLCanvasElement> {
  const hit = done.get(key);
  if (hit) return Promise.resolve(hit);
  let p = busy.get(key);
  if (!p) {
    p = loadImage(svg).then((img) => {
      const cv = document.createElement('canvas');
      cv.width = Math.round(w); cv.height = Math.round(h);
      const c = cv.getContext('2d')!;
      c.drawImage(img, 0, 0, cv.width, cv.height);
      after?.(c);
      done.set(key, cv);
      busy.delete(key);
      return cv;
    });
    p.catch(() => busy.delete(key));
    busy.set(key, p);
  }
  return p;
}

// ------------------------------------------------------------------ card backs
export const isArtBack = (id: string) => id in BACK_ART;
/** The finished back (with the CHRONO DUEL line), or undefined while it is still loading. */
export const artBack = (id: string) => done.get('back:' + id);
export function loadBack(id: string): Promise<HTMLCanvasElement> {
  const b = BACK_ART[id];
  return raster('back:' + id, backSvg(id, CARD_W, CARD_H), CARD_W, CARD_H, (c) => {
    c.fillStyle = b.ink; c.font = `700 24px ${FONTS.display}`; c.textAlign = 'center';
    c.fillText('CHRONO DUEL', CARD_W / 2, (b.textY * CARD_H) / 336);
  });
}
/** Every themed back, so decks and opponents can show them right away. */
export async function preloadBacks() {
  try { await document.fonts?.ready; } catch { /* fonts are optional */ }
  await Promise.allSettled(Object.keys(BACK_ART).map(loadBack));
}

// ------------------------------------------------------------------ clock faces
export const isArtDial = (id: string | undefined): id is string => !!id && id in DIAL_ART;
export interface DialCanvases { under: HTMLCanvasElement; over: HTMLCanvasElement; pulse?: HTMLCanvasElement; spins: HTMLCanvasElement[] }
/** Pixels per design unit (twice the board scale, so faces stay sharp on phones). */
const DIAL_PX = DIAL_S * 2;
export async function loadDial(id: string): Promise<DialCanvases> {
  const a = DIAL_ART[id].art;
  const W = DIAL_VIEW.w * DIAL_PX, H = DIAL_VIEW.h * DIAL_PX;
  const [under, over, pulse, ...spins] = await Promise.all([
    raster(`dial:${id}:under`, dialPartSvg(id, 'under', DIAL_PX), W, H),
    raster(`dial:${id}:over`, dialPartSvg(id, 'over', DIAL_PX), W, H),
    a.pulse ? raster(`dial:${id}:pulse`, dialPartSvg(id, 'pulse', DIAL_PX), W, H) : Promise.resolve(undefined),
    ...(a.spins ?? []).map((s, i) => raster(`dial:${id}:spin${i}`, spinSvg(s, a.defs, DIAL_PX), s.r * 2 * DIAL_PX, s.r * 2 * DIAL_PX)),
  ]);
  return { under, over, pulse, spins: spins as HTMLCanvasElement[] };
}

// ------------------------------------------------------------------ playmats
export const isArtMat = (id: string | undefined): id is string => !!id && id in MAT_ART;
export interface MatCanvases { under: HTMLCanvasElement; over: HTMLCanvasElement; glow?: HTMLCanvasElement; drift?: HTMLCanvasElement; spins: HTMLCanvasElement[] }
/** Pixels per design unit: the 390-wide mat on a 720-wide board, with headroom for tall screens and sharp phones. */
const MAT_PX = 2.6;
export async function loadMat(id: string): Promise<MatCanvases> {
  const m = MAT_ART[id];
  const W = MAT_VIEW.w * MAT_PX, H = MAT_VIEW.h * MAT_PX;
  const [under, over, glow, drift, ...spins] = await Promise.all([
    raster(`mat:${id}:under`, matPartSvg(id, 'under', MAT_PX), W, H),
    raster(`mat:${id}:over`, matPartSvg(id, 'over', MAT_PX), W, H),
    m.glow ? raster(`mat:${id}:glow`, matPartSvg(id, 'glow', MAT_PX), W, H) : Promise.resolve(undefined),
    m.drift ? raster(`mat:${id}:drift`, matPartSvg(id, 'drift', MAT_PX), W, H) : Promise.resolve(undefined),
    ...(m.spins ?? []).map((s, i) => raster(`mat:${id}:spin${i}`, spinSvg(s, m.defs, MAT_PX), s.r * 2 * MAT_PX, s.r * 2 * MAT_PX)),
  ]);
  return { under, over, glow, drift, spins: spins as HTMLCanvasElement[] };
}
/** The opponent's mat: one still picture. */
export const loadFlatMat = (id: string) => raster(`mat:${id}:flat`, matFlatSvg(id, MAT_VIEW.w * 2), MAT_VIEW.w * 2, MAT_VIEW.h * 2);

/** Everything a battle with these looks needs (waits at most `ms`, then the battle starts and the rest pops in). */
export async function prepareLooks(l: { back?: string; foeBack?: string; dial?: string; mat?: string; foeMat?: string } | undefined, ms = 1500) {
  if (!l) return;
  const jobs: Promise<unknown>[] = [];
  for (const b of [l.back, l.foeBack]) if (b && isArtBack(b)) jobs.push(loadBack(b));
  if (isArtDial(l.dial)) jobs.push(loadDial(l.dial));
  if (isArtMat(l.mat)) jobs.push(loadMat(l.mat));
  if (isArtMat(l.foeMat)) jobs.push(loadFlatMat(l.foeMat));
  await Promise.race([Promise.allSettled(jobs), new Promise((r) => setTimeout(r, ms))]);
}
