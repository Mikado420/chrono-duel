import './ui/style.css';
import { Application, Container } from 'pixi.js';
import type { DeckDef } from './core/decks';
import { audio } from './render/audio';
import { Backdrop } from './render/backdrop';
import { BattleScene, type BattleConfig, type BattleResult } from './render/battle';
import { Fx } from './render/fx';
import { COLORS, DESIGN } from './render/theme';
import { Tweener } from './render/tween';
import { PackOpenScene } from './render/packOpen';
import { applyReward, canOpen, localDate, openPack, packById, reward, type Reward } from './meta/economy';
import { codeFromHash } from './net/config';
import { OnlineFlow } from './net/flow';
import { registerServiceWorker } from './pwa';
import { Screens } from './ui/screens';
import { store } from './ui/storage';

async function loadFonts() {
  const fams = ['700 30px "Shippori Mincho B1"', '800 30px "Shippori Mincho B1"', '500 20px "Zen Kaku Gothic New"', '700 20px "Zen Kaku Gothic New"', '700 30px "Cinzel"'];
  const all = Promise.all(fams.map((f) => document.fonts?.load(f, 'クロノ刻0123').catch(() => null)));
  await Promise.race([all, new Promise((r) => setTimeout(r, 3500))]);
}

async function boot() {
  await loadFonts();
  const app = new Application();
  const stageEl = document.getElementById('stage')!;
  // sizing is driven by relayout() below rather than Pixi's resizeTo, so the canvas and the layout always agree
  await app.init({ width: stageEl.clientWidth || 360, height: stageEl.clientHeight || 640, antialias: true, background: COLORS.ink, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true });
  stageEl.appendChild(app.canvas);

  const tw = new Tweener(app.ticker);
  const backdrop = new Backdrop(app.ticker);
  const world = new Container();
  const shake = new Container();
  world.addChild(shake);
  app.stage.addChild(backdrop, world);
  const fx = new Fx(tw, app.ticker, shake);

  let battle: BattleScene | null = null;
  let extra = 0;
  let lastSize = '';
  /**
   * Fit the 720x1280 board to the screen. Phones report intermediate sizes while rotating (and iOS Safari
   * may not send a final resize event), so this runs from several sources and is cheap to call repeatedly.
   */
  const relayout = () => {
    const w = Math.round(stageEl.clientWidth), h = Math.round(stageEl.clientHeight);
    if (!w || !h) return;
    // iOS can leave the page scrolled or zoomed after a rotation; snap back
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    const key = `${w}x${h}`;
    if (key === lastSize) return;
    lastSize = key;
    app.renderer.resize(w, h);
    backdrop.resize(w, h);
    const s = Math.min(w / DESIGN.w, h / DESIGN.h);
    world.scale.set(s);
    world.x = Math.round((w - DESIGN.w * s) / 2);
    // on tall screens the battle board stretches downward instead of letterboxing
    extra = Math.max(0, Math.min(h / s - DESIGN.h, 320));
    world.y = Math.max(0, Math.round((h - (DESIGN.h + extra) * s) / 2));
    battle?.applyLayout(extra);
    // room beside the board for the log panel (tablets and desktops in landscape)
    const side = (w - DESIGN.w * s) / 2;
    document.body.classList.toggle('side-room', side >= 300);
    updateRotate();
  };
  // phones held sideways: the board would be a third of its size, so ask to turn the phone back
  const rotateEl = document.getElementById('rotate')!;
  let pausedForRotate = false;
  const updateRotate = () => {
    const w = window.innerWidth, h = window.innerHeight;
    const phoneLandscape = w > h && Math.min(w, h) < 540;
    rotateEl.classList.toggle('on', phoneLandscape);
    const offline = !!battle && !lastCfg?.net;
    document.getElementById('rotate-sub')!.textContent = battle ? (offline ? 'AI戦は一時停止しています' : 'オンライン対戦は続いています') : '';
    if (phoneLandscape && offline && !pausedForRotate) { pausedForRotate = true; tw.speed = 0; }
    else if (!phoneLandscape && pausedForRotate) { pausedForRotate = false; tw.speed = store.settings.speed || 1; }
  };
  const settle = () => { relayout(); for (const ms of [120, 350, 800, 1500]) setTimeout(relayout, ms); };
  window.addEventListener('resize', () => requestAnimationFrame(relayout));
  window.addEventListener('orientationchange', settle);
  window.visualViewport?.addEventListener('resize', () => requestAnimationFrame(relayout));
  if ('ResizeObserver' in window) new ResizeObserver(() => relayout()).observe(stageEl);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { lastSize = ''; settle(); } });

  let lastCfg: BattleConfig | null = null;
  relayout();
  let closePackRef: (() => void) | null = null;
  const root = document.getElementById('ui')!;

  const applySettings = () => {
    const s = store.settings;
    audio.setVolume(s.volume);
    audio.setMuted(s.muted);
    tw.speed = s.speed;
    tw.reduced = s.reduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };
  applySettings();

  const logEl = document.getElementById('log')!;
  const logHead = logEl.firstElementChild!;
  /** Portrait phones have no room for the log beside the board, so it slides in on demand. */
  let pausedForLog = false;
  const setLogOpen = (open: boolean) => {
    document.body.classList.toggle('log-open', open);
    if (open) logEl.scrollTop = 0;
    const offline = !!battle && !lastCfg?.net;
    if (open && offline && !pausedForLog && tw.speed > 0) { pausedForLog = true; tw.speed = 0; }
    else if (!open && pausedForLog) { pausedForLog = false; tw.speed = store.settings.speed || 1; }
  };
  document.getElementById('log-close')!.addEventListener('click', () => setLogOpen(false));
  document.getElementById('log-back')!.addEventListener('click', () => setLogOpen(false));
  const log = (text: string, side: 0 | 1 | -1) => {
    const ln = document.createElement('div');
    ln.className = `ln ${side === 0 ? 'you' : side === 1 ? 'foe' : ''}`;
    ln.textContent = text;
    logEl.insertBefore(ln, logHead.nextSibling);
    while (logEl.children.length > 120) logEl.lastChild?.remove();
  };
  const endBattle = () => {
    closePackRef?.();
    document.body.classList.remove('in-battle');
    setLogOpen(false);
    logEl.replaceChildren(logHead);
    if (battle) { shake.removeChild(battle); battle.destroy(); battle = null; }
    fx.layer.removeChildren();
  };
  const onResult = (r: BattleResult) => {
    const online = !!lastCfg?.net;
    const rec = online ? store.onlineRecord : store.record;
    if (r.winner === 0) rec.win++;
    else if (r.winner === 1) rec.lose++;
    else rec.draw++;
    if (online) store.saveOnlineRecord(); else store.saveRecord();
    // coins for playing
    const today = localDate();
    const rw: Reward = reward(store.wallet, { mode: online ? 'online' : 'ai', level: lastCfg?.level ?? 'normal', winner: r.winner, reason: r.reason, myActions: r.myActions, today });
    applyReward(store.wallet, rw, today);
    store.saveWallet();
    // the final board stays visible behind the result screen until the player moves on
    if (online) screens.resultOnline(r, endBattle, rw);
    else screens.result(r, () => { screens.clear(); if (lastCfg) run(lastCfg); }, endBattle, rw);
  };

  // ---- booster packs
  let packScene: PackOpenScene | null = null;
  const closePack = () => { if (packScene) { shake.removeChild(packScene); packScene.destroy(); packScene = null; } fx.layer.removeChildren(); };
  const openPackScene = (packId: string) => {
    const pack = packById(packId);
    if (!canOpen(store.wallet, pack)) return;
    closePack();
    screens.clear();
    const o = openPack(store.wallet, pack);
    store.saveWallet();
    packScene = new PackOpenScene(tw, fx, app.ticker, o, {
      again: () => {
        const pay = canOpen(store.wallet, pack);
        return { label: pay === 'ticket' ? 'チケット1枚' : pay ? `${pack.price} コイン` : `コイン不足（${store.wallet.coins}/${pack.price}）`, enabled: !!pay };
      },
      onAgain: () => openPackScene(packId),
      onClose: () => { closePack(); screens.shop(); },
    }, extra);
    shake.addChild(packScene);
    shake.addChild(fx.layer);
  };
  const run = (cfg: BattleConfig) => {
    endBattle();
    lastCfg = cfg;
    battle = new BattleScene(tw, fx, app.ticker, cfg, onResult, () => {
      const speed = tw.speed;
      if (!cfg.net) tw.speed = 0; // pause animations and the AI while the menu is open (a live match cannot wait)
      const resume = () => { tw.speed = store.settings.speed || speed; };
      screens.battleMenu(resume, () => { resume(); battle?.surrender(); });
    }, log, () => setLogOpen(!document.body.classList.contains('log-open')));
    document.body.classList.add('in-battle');
    if (!store.settings.guided) {
      const speed = tw.speed;
      tw.speed = 0;
      screens.guide(() => { store.settings.guided = true; store.saveSettings(); tw.speed = store.settings.speed || speed; });
    }
    battle.applyLayout(extra);
    updateRotate();
    shake.addChild(battle);
    shake.addChild(fx.layer);
  };
  const flow: OnlineFlow = new OnlineFlow({
    showLobby: () => { endBattle(); screens.lobby(); },
    showConnecting: (msg) => screens.connecting(msg),
    showError: (msg) => { endBattle(); screens.error(msg, () => screens.onlineMenu()); },
    startBattle: (link) => { screens.clear(); run({ myDeck: [], myDeckName: '', aiDeck: [], aiDeckName: link.foeName, level: 'normal', net: link }); },
    hasBattle: () => battle !== null,
  });
  closePackRef = closePack;
  const screens: Screens = new Screens({
    openPack: (id: string) => openPackScene(id),
    root,
    flow: () => flow,
    startBattle: (deck: DeckDef, ai: DeckDef, level) => run({ myDeck: deck.cards, myDeckName: deck.name, aiDeck: ai.cards, aiDeckName: ai.name, level }),
    applySettings,
  });

  if (location.hash === '#debug' || /[?&]debug\b/.test(location.search)) (window as unknown as { __cd: unknown }).__cd = { battle: () => battle?.debug(), app, screens };
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  document.getElementById('loading')?.remove();
  const invite = codeFromHash(location.hash);
  if (invite) {
    history.replaceState(null, '', location.pathname + location.search);
    screens.onlineMenu(invite);
  } else if (!flow.resume()) screens.title();
}

registerServiceWorker();
boot().catch((e) => {
  const el = document.getElementById('loading');
  if (el) el.textContent = `起動できませんでした：${e instanceof Error ? e.message : String(e)}`;
  console.error(e);
});
