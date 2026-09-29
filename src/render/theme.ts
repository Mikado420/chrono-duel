/** Visual identity: deep ink-teal board, aged brass, verdigris for the player, ember for the opponent. */
export const COLORS = {
  ink: 0x08141c,
  ink2: 0x0e202b,
  ink3: 0x16303d,
  line: 0x2d4f5c,
  brass: 0xe0b25c,
  brassDeep: 0x9c7432,
  ivory: 0xf1e7d0,
  mute: 0x8fa9ad,
  you: 0x5fd0b5,
  youDeep: 0x1f7f6d,
  foe: 0xe9674f,
  foeDeep: 0x8c2d22,
  heal: 0x8fe39a,
  doom: 0xd6334a,
  atk: 0xf08a4b,
  hp: 0x7fd6a0,
} as const;

export const CSS = {
  ink: '#08141c', ink2: '#0e202b', ink3: '#16303d', line: '#2d4f5c', brass: '#e0b25c', brassDeep: '#9c7432',
  ivory: '#f1e7d0', mute: '#8fa9ad', you: '#5fd0b5', foe: '#e9674f', doom: '#d6334a', atk: '#f08a4b', hp: '#7fd6a0',
} as const;

export const FONTS = {
  display: '"Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif CJK JP", serif',
  body: '"Zen Kaku Gothic New", "Hiragino Sans", "Noto Sans JP", "Noto Sans CJK JP", sans-serif',
  num: '"Cinzel", "Times New Roman", serif',
} as const;

/** Design resolution. The board is laid out in this space and scaled to fit the screen. */
export const DESIGN = { w: 720, h: 1280 } as const;
