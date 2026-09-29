import type { Ticker } from 'pixi.js';

export type Ease = (t: number) => number;
export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outElastic: (t: number) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
} satisfies Record<string, Ease>;

interface Job { t: number; dur: number; step: (k: number) => void; ease: Ease; done: () => void }

/** Minimal tween runner driven by the Pixi ticker. Global speed multiplies every duration. */
export class Tweener {
  private jobs = new Set<Job>();
  speed = 1;
  reduced = false;
  constructor(ticker: Ticker) {
    ticker.add((tk) => this.update(tk.deltaMS));
  }
  private update(ms: number) {
    for (const j of [...this.jobs]) {
      j.t += ms * this.speed;
      const k = Math.min(1, j.t / j.dur);
      let dead = false;
      try { j.step(j.ease(k)); } catch { dead = true; } // target was destroyed mid-tween
      if (k >= 1 || dead) { this.jobs.delete(j); j.done(); }
    }
  }
  /** Tween numeric props of an object. */
  to(obj: object, props: Record<string, number>, dur: number, e: Ease = ease.outCubic): Promise<void> {
    const from: Record<string, number> = {};
    const target = props;
    const o = obj as unknown as Record<string, number>;
    try { for (const k of Object.keys(target)) from[k] = o[k]; } catch { return Promise.resolve(); }
    return this.run(dur, (v) => { for (const k of Object.keys(target)) o[k] = from[k] + (target[k] - from[k]) * v; }, e);
  }
  run(dur: number, step: (k: number) => void, e: Ease = ease.linear): Promise<void> {
    if (this.reduced) dur = Math.min(dur, 60);
    return new Promise((resolve) => {
      if (dur <= 0) { step(1); resolve(); return; }
      this.jobs.add({ t: 0, dur, step, ease: e, done: resolve });
    });
  }
  wait(ms: number): Promise<void> {
    return this.run(ms, () => {});
  }
}
