import { Container, Graphics, Text } from 'pixi.js';
import { audio } from './audio';
import { COLORS, FONTS } from './theme';

export function label(text: string, size: number, color: number = COLORS.ivory, opts: { font?: string; weight?: '400' | '500' | '700'; align?: 'left' | 'center' | 'right'; spacing?: number; wrap?: number } = {}): Text {
  const t = new Text({
    text,
    style: {
      fontFamily: opts.font ?? FONTS.body, fontSize: size, fill: color, fontWeight: opts.weight ?? '500', align: opts.align ?? 'left',
      letterSpacing: opts.spacing ?? 0, wordWrap: !!opts.wrap, wordWrapWidth: opts.wrap ?? 0, breakWords: true, lineHeight: size * 1.4,
    },
  });
  return t;
}

/** Brass-edged button drawn in Pixi. */
export class Button extends Container {
  private bg = new Graphics();
  private txt: Text;
  private sub?: Text;
  private _enabled = true;
  private pressed = false;
  constructor(text: string, private w: number, private h: number, private tone: 'primary' | 'plain' | 'danger' = 'plain', subText?: string, private onTap?: () => void) {
    super();
    this.txt = label(text, h > 60 ? 26 : 22, tone === 'primary' ? 0x241705 : COLORS.ivory, { weight: '700', align: 'center' });
    this.txt.anchor.set(0.5);
    this.addChild(this.bg, this.txt);
    if (subText) {
      this.sub = label(subText, 16, tone === 'primary' ? 0x3d2a0c : COLORS.mute, { font: FONTS.num, weight: '700', align: 'center' });
      this.sub.anchor.set(0.5);
      this.addChild(this.sub);
    }
    this.layout();
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerdown', (e) => { e.stopPropagation(); if (!this._enabled) return; this.pressed = true; this.draw(); });
    this.on('pointerupoutside', () => { this.pressed = false; this.draw(); });
    this.on('pointerup', (e) => {
      e.stopPropagation();
      const was = this.pressed; this.pressed = false; this.draw();
      if (!this._enabled) { audio.play('deny'); return; }
      if (was) { audio.play('select'); this.onTap?.(); }
    });
    this.on('pointerover', () => { this.alpha = this._enabled ? 1 : 0.45; this.scale.set(this._enabled ? 1.03 : 1); });
    this.on('pointerout', () => { this.scale.set(1); });
  }
  set tap(fn: () => void) { this.onTap = fn; }
  setText(t: string, sub?: string) { this.txt.text = t; if (this.sub && sub !== undefined) this.sub.text = sub; this.layout(); }
  get enabled() { return this._enabled; }
  set enabled(v: boolean) { this._enabled = v; this.alpha = v ? 1 : 0.42; this.draw(); }
  private layout() {
    if (this.sub) { this.txt.y = -9; this.sub.y = 15; } else this.txt.y = 0;
    this.draw();
  }
  private draw() {
    const { w, h } = this;
    const g = this.bg.clear();
    const fill = this.tone === 'primary' ? COLORS.brass : this.tone === 'danger' ? COLORS.foeDeep : COLORS.ink3;
    g.roundRect(-w / 2, -h / 2 + (this.pressed ? 2 : 0), w, h, h / 2.6).fill({ color: fill, alpha: this.tone === 'plain' ? 0.92 : 1 });
    g.roundRect(-w / 2, -h / 2 + (this.pressed ? 2 : 0), w, h, h / 2.6).stroke({ color: this.tone === 'primary' ? 0xfff0c8 : COLORS.brassDeep, width: 2, alpha: 0.9 });
    if (!this.pressed) g.roundRect(-w / 2 + 4, -h / 2 + 3, w - 8, h * 0.42, h / 3).fill({ color: 0xffffff, alpha: 0.06 });
  }
}
