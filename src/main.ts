import './ui/style.css';
import './ui/skin.css';
import { Application, Container } from 'pixi.js';
import type { DeckDef } from './core/decks';
import { audio } from './render/audio';
import { Backdrop } from './render/backdrop';
import { preloadBacks } from './render/looks';
import { BattleScene, type BattleConfig, type BattleResult } from './render/battle';
import { Fx } from './render/fx';
import { COLORS, DESIGN } from './render/theme';
import { Tweener } from './render/tween';
import { PackOpenScene } from './render/packOpen';
import { MIN_ACTIONS, applyReward, canOpen, localDate, openPack, packById, reward, type Reward } from './meta/economy';
import { bump, dailyView, grantEventPrize, grantSeasonReward, recordBattle, recordMatch, track } from './meta/progress';
import { haptics } from './render/haptics';
import { LOOKS, PITY, refundRetired } from './meta/economy';
import { deckKey, deckLook, favCard, shownTitle } from './ui/profile';
import { CARD_LIST } from './core/cards';
import { SEASON_REWARDS, TIERS, applyRatingReset, finishRated, foeById, foeLevel, makeOpponent, rollSeason, startRated, tierOf, type RatedGame } from './meta/rating';
import { seasonById } from './meta/ranks';
import { eventOf, eventProgress, recordEventGame } from './meta/events';
import { levelOfLv } from './core/ai';
import { quirksOf, type RivalCfg } from './core/rival';
import { rivalById, rivalCfg, rivalDeckCards, rivalDeckName } from './meta/roster';
import { deckBook, loadReplay, refreshDeckBook, replayFromHash, replayLink, reportMatch, saveLiveGame, shareReplay, syncRated, takeLiveGame } from './net/api';
import type { GameLog } from './core/gamelog';
import type { SharedReplay } from './server/replays';
import { bookKey, listFor } from './meta/deckbook';
import { VERSION } from './version';
import { codeFromHash } from './net/config';
import { OnlineFlow } from './net/flow';
import { registerServiceWorker } from './pwa';
import { Screens, type MissionDelta, type VsSide } from './ui/screens';
import { store } from './ui/storage';

async function loadFonts() {
  const fams = ['700 30px "Shippori Mincho B1"', '800 30px "Shippori Mincho B1"', '500 20px "Zen Kaku Gothic New"', '700 20px "Zen Kaku Gothic New"', '700 30px "Cinzel"'];
  const all = Promise.all(fams.map((f) => document.fonts?.load(f, 'クロノ刻0123').catch(() => null)));
  await Promise.race([all, new Promise((r) => setTimeout(r, 3500))]);
}

async function boot() {
  await loadFonts();
  void preloadBacks(); // themed card backs are pictures; get them ready while the home screen comes up
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
  let pendingNotice = '';
  /** The record of the last game against the AI, for sharing it as a replay. */
  let lastShare: { log: GameLog; info: { names: [string, string]; decks: [string, string]; mode: string } } | null = null;
  const root = document.getElementById('ui')!;

  const applySettings = () => {
    const s = store.settings;
    audio.setVolume(s.volume);
    audio.setBgmVolume(s.bgm ?? 0.5);
    audio.setMuted(s.muted);
    tw.speed = s.speed;
    tw.reduced = s.reduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.body.classList.toggle('reduced', !!s.reduced);
    haptics.set({ big: s.vibeBig !== false, tap: s.vibeTap !== false });
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
  let battleStartedAt = Date.now();
  /** The id of the game against the AI in progress (the same id is used if it has to be reported as abandoned). */
  let liveGid = '';
  /** The stored deck a battle was played with (by id, else by matching its cards). */
  const myDeckOf = (cfg: BattleConfig | null): DeckDef | undefined => {
    if (!cfg) return undefined;
    const cards = cfg.net ? flow.myDeck : cfg.myDeck;
    const key = [...cards].sort().join(',');
    return (cfg.myDeckId ? store.deckById(cfg.myDeckId) : undefined) ?? store.allDecks().find((d) => [...d.cards].sort().join(',') === key);
  };
  const onResult = (r: BattleResult) => {
    const online = !!lastCfg?.net;
    saveLiveGame(null);
    if (lastCfg?.net?.watch) { screens.resultWatch(r, () => { endBattle(); flow.leave(); screens.onlineMenu(); }); return; }
    if (lastCfg?.replay) { const again = lastCfg; tw.speed = store.settings.speed || 1; screens.replayEnd(() => { screens.clear(); run(again); }, () => { endBattle(); screens.home(); }); return; }
    // games against the AI keep their full record: it can be shared as a replay
    lastShare = r.log && !lastCfg?.net && r.reason !== 'surrender' ? {
      log: r.log,
      info: { names: [store.settings.name || 'プレイヤー', lastCfg?.rated ? lastCfg.foeName ?? '相手' : `AI（${lastCfg?.aiDeckName ?? ''}）`], decks: [lastCfg?.myDeckName ?? '', lastCfg?.aiDeckName ?? ''], mode: lastCfg?.rated ? 'rated' : 'free' },
    } : null;
    const today0 = localDate();
    const before = dailyView(store.meta, today0).map((v) => ({ id: v.m.id, now: v.now }));
    const rec = online ? store.onlineRecord : store.record;
    if (r.winner === 0) rec.win++;
    else if (r.winner === 1) rec.lose++;
    else rec.draw++;
    if (online) store.saveOnlineRecord(); else store.saveRecord();
    // coins for playing
    const today = localDate();
    const rw: Reward = reward(store.wallet, { mode: online ? 'online' : lastCfg?.rated ? 'rated' : 'ai', level: lastCfg?.level ?? 'normal', lv: !lastCfg?.rated ? lastCfg?.rival?.lv : undefined, winner: r.winner, reason: r.reason, myActions: r.myActions, today });
    applyReward(store.wallet, rw, today);
    store.saveWallet();
    // rank and missions
    const xp = recordBattle(store.meta, {
      won: r.winner === 0, played: r.myActions >= MIN_ACTIONS, hard: !online && (lastCfg?.level === 'hard' || lastCfg?.level === 'expert'), online,
      spells: r.stats.spells, summons: r.stats.summons, reserves: r.stats.reserves, attacks: r.stats.attacks,
    }, today);
    const missions: MissionDelta[] = dailyView(store.meta, today0).flatMap((v) => {
      const b = before.find((x) => x.id === v.m.id)?.now ?? 0;
      return v.now > b ? [{ text: v.m.text, before: b, after: v.now, goal: v.m.goal }] : [];
    });
    const deck = myDeckOf(lastCfg);
    // 勝ち方 and wins with a deck of your own (titles)
    if (r.winner === 0 && r.myActions >= MIN_ACTIONS) {
      for (const f of r.feats ?? []) bump(store.meta, f);
      if (deck && store.customDecks.some((d) => d.id === deck.id)) bump(store.meta, 'customWin');
    }
    if (r.myActions >= MIN_ACTIONS) recordMatch(store.meta, {
      at: Date.now(), mode: online ? 'online' : lastCfg?.rated ? 'rated' : 'free', result: r.winner === 0 ? 'win' : r.winner === 1 ? 'lose' : 'draw',
      foe: online ? flow.foe?.name ?? lastCfg?.aiDeckName ?? '' : lastCfg?.rated ? lastCfg.foeName ?? '' : lastCfg?.aiDeckName ?? '',
      deck: deck?.name ?? lastCfg?.myDeckName ?? '', deckId: deck?.id ?? '', myHp: r.myHp, foeHp: r.foeHp, reason: r.reason,
    });
    store.saveMeta();
    const card = deck ? deckKey(deck) : favCard();
    // rated play: the rating moves now; the ranking server gets the result in the background
    let rated: RatedGame | null = null;
    if (!online && lastCfg?.rated) {
      rated = finishRated(store.rated, r.winner === 0 ? 1 : r.winner === -1 ? 0.5 : 0, r.myActions, Date.now(), newId());
      store.saveRated();
      void syncRated();
    }
    // イベント: the week's wins pay out at 1, 3 and 5
    if (lastCfg?.event) {
      const today1 = localDate();
      const ev = eventOf(today1).event;
      const p = (store.meta.event = eventProgress(store.meta.event, today1));
      if (r.myActions >= MIN_ACTIONS || r.winner === 0) {
        for (const x of recordEventGame(p, r.winner === 0)) grantEventPrize(store.meta, `${ev.name}で${x.wins}勝`, x.prize, today1);
      }
      store.saveMeta();
    }
    // play statistics: this seat's deck, the cards it used, the result and the game record (anonymous, fails soft)
    // (an event's games start from a changed position, so they are left out)
    if (!lastCfg?.event) void reportMatch({
      gid: !online && liveGid ? liveGid : newId(), id: store.account().id, v: VERSION,
      mode: online ? 'online' : lastCfg?.rated ? 'rated' : 'free', ai: online ? undefined : lastCfg?.level,
      deck: online ? flow.myDeck : lastCfg?.myDeck ?? [], played: r.played,
      score: r.winner === 0 ? 1 : r.winner === -1 ? 0.5 : 0, reason: r.reason, actions: r.myActions, ms: Date.now() - battleStartedAt,
      // games against the AI carry the whole record (online games are recorded by the server)
      ...(!online && r.log ? { log: r.log, deckName: lastCfg?.myDeckName, foe: lastCfg?.aiDeckName } : {}),
      // rated play: who the rival was and which list it played, and the player's rating before (環境の集計)
      ...(rated && lastCfg?.rival ? { rival: `rv:${lastCfg.rival.name}`, rivalLv: lastCfg.rival.lv, rivalDeck: lastCfg.rival.deck, rivalDeckV: lastCfg.aiDeckV ?? 1, rating: rated.before } : {}),
    });
    // the final board stays visible behind the result screen until the player moves on
    if (online) screens.resultOnline(r, endBattle, rw, xp, missions, card);
    else if (rated) {
      const rd = store.deckById(rated.deck);
      screens.result(r, () => { screens.clear(); if (rd && rd.valid) startRatedGame(rd); else { endBattle(); screens.rated(); } }, endBattle, rw, xp, rated, missions, card);
    } else screens.result(r, () => { screens.clear(); if (lastCfg) startFree(lastCfg); }, endBattle, rw, xp, null, missions, card);
  };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  /**
   * Starts a rated game. The opponent is an AI whose strength follows the rating (only the strongest from 時の賢者
   * up), presented as a player: a matchmaking wait, a name and a rating, never "AI" or a difficulty.
   */
  const startRatedGame = (deck: DeckDef) => {
    const recent = store.rated.history.slice(0, 5).map((g) => g.foe);
    // how the player's last game against each rival ended (a rival that lost may come back with its other deck)
    const last: Record<string, number> = {};
    for (const g of [...store.rated.history].reverse()) if (g.foe) last[g.foe] = g.score;
    const o = makeOpponent(store.rated.rating, store.settings.name, recent, Math.random, last);
    const r = rivalById(o.ai);
    const level = foeLevel(o.ai);
    const aiDeckId = o.deck ?? 'balance';
    // the rival's list: the deck book's (checked against its 設計図), or the built-in one
    const list = listFor(deckBook(), bookKey(aiDeckId, r?.lv ?? 1), newId(), rivalDeckCards(aiDeckId));
    endBattle();
    screens.matching(o, deck, (first) => {
      // the game only counts (and a disconnect only loses) once it has actually started
      startRated(store.rated, o, deck.id, Date.now());
      store.saveRated();
      screens.clear();
      run({
        myDeck: deck.cards, myDeckName: deck.name, myDeckId: deck.id, aiDeck: list.cards, aiDeckV: list.v, aiDeckName: rivalDeckName(aiDeckId), level,
        rival: r ? rivalCfg(r, aiDeckId) : undefined, aiSpec: r ? undefined : foeById(o.ai)?.spec, rated: true, foeName: o.name, first, looks: looksFor(deck.id, true),
      });
    }, () => screens.rated());
  };
  // looks that are no longer sold: their price comes back as coins
  const refund = refundRetired(store.wallet);
  if (refund) {
    store.saveWallet();
    // decks that used them fall back to the standard look (deckLook ignores looks that no longer exist)
    pendingNotice = `販売を終えた着せ替え（スリーブ・文字盤・マット）の代金 ${refund} コインをお返ししました`;
  }
  // the ranks were redrawn: ratings go back to the start of the rank (刻匠 and above to 刻匠)
  {
    const before = store.rated.rating;
    if (applyRatingReset(store.rated)) {
      store.saveRated();
      if (store.rated.games > 0) pendingNotice = [pendingNotice, `ランクの見直しにともない、レートを ${before} から ${store.rated.rating}（${tierOf(store.rated.rating).tier.name}）に調整しました`].filter(Boolean).join('\n');
    }
  }
  // a new season (one per card set): the best rank of the last one pays out, the rating starts one rank lower
  {
    const before = store.rated.rating;
    const ended = rollSeason(store.rated, localDate());
    store.saveRated();
    if (ended) {
      const s = seasonById(ended.season), t = TIERS.find((x) => x.id === ended.tier)!;
      grantSeasonReward(store.meta, `${s?.name ?? `第${ended.season}季`}の報酬（最高ランク ${t.name}）`, SEASON_REWARDS[ended.tier], localDate());
      store.saveMeta();
      pendingNotice = [pendingNotice, `${s?.name ?? ''}が終わりました。最高ランク「${t.name}」の報酬をプレゼントに送りました。新しいシーズンはレート ${store.rated.rating}（${before} から）で始まります`].filter(Boolean).join('\n');
    }
  }
  // a rated game left unfinished last time (app closed, tab killed) counts as a loss
  if (store.rated.pending) {
    const g = finishRated(store.rated, 0, 0, Date.now(), newId());
    store.saveRated();
    if (g) pendingNotice = [pendingNotice, `前回のレート戦は途中で終了したため敗北として記録されました（レート ${g.before} → ${g.after}）`].filter(Boolean).join('\n');
  }
  void syncRated();
  void refreshDeckBook();
  // a game against the AI left unfinished last time (app closed) is still recorded, as abandoned
  const leftOver = takeLiveGame();
  void reportMatch(leftOver ?? undefined);

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
    track(store.meta, 'pack', 1, localDate()); store.saveMeta();
    packScene = new PackOpenScene(tw, fx, app.ticker, o, {
      again: () => {
        const pay = canOpen(store.wallet, pack);
        return { label: pay === 'ticket' ? 'チケット1枚' : pay ? `${pack.price} コイン` : `コイン不足（${store.wallet.coins}/${pack.price}）`, enabled: !!pay };
      },
      pityLeft: () => Math.max(0, PITY - store.wallet.pity),
      shards: () => store.wallet.shards,
      back: deckLook(store.settings.lastDeck ?? '', 'back'),
      onAgain: () => openPackScene(packId),
      onClose: () => { closePack(); screens.shop(); },
    }, extra);
    shake.addChild(packScene);
    shake.addChild(fx.layer);
  };
  /** Card back, dial and mat of a deck; the AI shows a random back and (often) a random mat. */
  const looksFor = (deckId: string, ai: boolean) => {
    const pick = (k: 'back' | 'mat') => { const l = LOOKS.filter((x) => x.kind === k); return l[Math.floor(Math.random() * l.length)].id; };
    return {
      back: deckLook(deckId, 'back'), dial: deckLook(deckId, 'dial'), mat: deckLook(deckId, 'mat'), still: store.settings.reduced,
      foeBack: ai ? pick('back') : undefined, foeMat: ai && Math.random() < 0.6 ? pick('mat') : undefined,
    };
  };
  /** A free game against the AI: the VS screen, then the board (paused until the VS screen goes). */
  const startFree = (cfg: BattleConfig) => {
    const first = (Math.random() < 0.5 ? 0 : 1) as 0 | 1;
    const c: BattleConfig = { ...cfg, first, looks: cfg.myDeckId ? looksFor(cfg.myDeckId, true) : cfg.looks };
    const deck = c.myDeckId ? store.deckById(c.myDeckId) : undefined;
    const aiCard = [...new Set(cfg.aiDeck)].sort((a, b) => 'CREL'.indexOf(CARD_LIST.find((x) => x.id === b)?.rarity ?? 'C') - 'CREL'.indexOf(CARD_LIST.find((x) => x.id === a)?.rarity ?? 'C'))[0] ?? 'dragon';
    showVs(
      { name: store.settings.name || 'あなた', card: deck ? deckKey(deck) : favCard(), first: first === 0, title: shownTitle()?.id, deck: cfg.myDeckName },
      { name: cfg.rival ? `AI Lv${cfg.rival.lv} ・ ${cfg.aiDeckName}` : `AI ・ ${cfg.aiDeckName}`, card: aiCard, first: first === 1 },
      () => run(c));
  };
  /** Starts the board under the VS screen with the clock stopped, and lets it run when the VS screen goes. */
  const showVs = (me: VsSide, foe: VsSide, start: () => void, live = false) => {
    start();
    if (live) { screens.versus(me, foe, () => {}); return; }
    const speed = tw.speed;
    tw.speed = 0;
    screens.versus(me, foe, () => { tw.speed = store.settings.speed || speed || 1; });
  };
  /** The AI of free play and events: the rated opponents' brain at `lv`, moving without a person's pauses. */
  const aiAt = (lv: number, deck: string): { rival: RivalCfg; level: ReturnType<typeof levelOfLv> } => ({ rival: { name: 'AI', lv, persona: 'steady', deck, quirks: quirksOf('AI') }, level: levelOfLv(lv) });
  /** This week's event: its decks and opening, then the VS screen as for a free game. */
  const startEvent = (deck: DeckDef | null, drafted?: string[]) => {
    const ev = eventOf(localDate()).event;
    const set = ev.setup(drafted ?? deck?.cards ?? null);
    const myDeck = set.myDeck ?? deck?.cards ?? [];
    startFree({ myDeck, myDeckName: deck && ev.ownDeck ? deck.name : ev.draft ? '継承したデッキ' : 'イベントのデッキ', myDeckId: ev.ownDeck ? deck?.id : undefined, aiDeck: set.aiDeck, aiDeckName: set.aiDeckName, ...aiAt(set.lv, set.aiDeckId ?? ''), event: { id: ev.id, name: ev.name, open: set.open, turnMs: set.turnMs } });
  };
  /** Plays a shared game back (from a replay link). */
  const watchReplay = (r: SharedReplay) => {
    screens.clear();
    run({ myDeck: r.log.decks[0], myDeckName: r.info.decks[0], aiDeck: r.log.decks[1], aiDeckName: r.info.decks[1], level: 'normal', replay: { log: r.log, names: [r.info.names[0] || 'プレイヤー', r.info.names[1] || '相手'] }, looks: { back: 'back:brass', dial: deckLook(store.settings.lastDeck ?? '', 'dial'), still: store.settings.reduced } });
  };
  const run = (cfg: BattleConfig) => {
    endBattle();
    lastCfg = cfg;
    battleStartedAt = Date.now();
    liveGid = cfg.net ? '' : newId();
    const gid = liveGid;
    const live: BattleConfig = cfg.net || cfg.event ? cfg : {
      ...cfg,
      onProgress: (log, n) => saveLiveGame({
        gid, id: store.account().id, v: VERSION, mode: cfg.rated ? 'rated' : 'free', ai: cfg.level, deck: cfg.myDeck, played: [],
        score: 0, reason: 'disconnect', actions: n, ms: Date.now() - battleStartedAt, log, deckName: cfg.myDeckName, foe: cfg.aiDeckName,
      }),
    };
    audio.bgm('battle', true);
    live.attackPreview = store.settings.attackPreview !== false;
    if (!live.looks && cfg.net) {
      // online: your looks, and the opponent's card back and mat as they chose them
      const mine = looksFor(myDeckOf(cfg)?.id ?? store.settings.lastDeck ?? '', false);
      const foe = cfg.net.init.foe;
      // looking on at others: only your clock face (the players' own backs and mats are theirs to show)
      live.looks = cfg.net.watch ? { back: 'back:brass', dial: mine.dial, still: mine.still } : { ...mine, foeBack: foe?.back, foeMat: foe?.mat };
    }
    battle = new BattleScene(tw, fx, app.ticker, live, onResult, () => {
      if (cfg.net?.watch) { screens.watchMenu(() => {}, () => { endBattle(); flow.leave(); screens.onlineMenu(); }); return; }
      if (cfg.replay) { const sp = tw.speed; tw.speed = 0; screens.watchMenu(() => { tw.speed = sp; }, () => { endBattle(); tw.speed = store.settings.speed || 1; screens.home(); }, 'リプレイ'); return; }
      const speed = tw.speed;
      if (!cfg.net) tw.speed = 0; // pause animations and the AI while the menu is open (a live match cannot wait)
      const resume = () => { tw.speed = store.settings.speed || speed; };
      screens.battleMenu(resume, () => { resume(); battle?.surrender(); });
    }, log, () => setLogOpen(!document.body.classList.contains('log-open')));
    document.body.classList.add('in-battle');
    if (!store.settings.guided && !cfg.net?.watch && !cfg.replay) {
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
    showWatch: () => { endBattle(); screens.watchLobby(); },
    profile: () => ({ title: shownTitle()?.id, fav: favCard(), back: deckLook(store.settings.lastDeck ?? '', 'back'), mat: deckLook(store.settings.lastDeck ?? '', 'mat') }),
    showConnecting: (msg) => screens.connecting(msg),
    showError: (msg) => { endBattle(); screens.error(msg, () => screens.onlineMenu()); },
    startBattle: (link) => {
      screens.clear();
      const cfg: BattleConfig = { myDeck: [], myDeckName: '', aiDeck: [], aiDeckName: link.foeName, level: 'normal', net: link };
      if (!link.init.fresh) { run(cfg); return; }
      const f = link.init.foe, first = link.init.first;
      if (link.watch) {
        const [a, b] = link.watch.names, [sa, sb] = flow.seats;
        showVs({ name: a, card: sa?.fav ?? 'gear', first: first === 0, title: sa?.title }, { name: b, card: sb?.fav ?? 'gear', first: first === 1, title: sb?.title }, () => run(cfg), true);
        return;
      }
      const deck = myDeckOf(cfg);
      showVs({ name: store.settings.name || 'あなた', card: deck ? deckKey(deck) : favCard(), first: first === 0, title: shownTitle()?.id, deck: deck?.name },
        { name: f.name, card: f.fav ?? 'gear', first: first === 1, title: f.title }, () => run(cfg), true);
    },
    hasBattle: () => battle !== null,
  });
  closePackRef = closePack;
  const screens: Screens = new Screens({
    openPack: (id: string) => openPackScene(id),
    startRated: (deck: DeckDef) => startRatedGame(deck),
    takeNotice: () => { const n = pendingNotice; pendingNotice = ''; return n; },
    root,
    flow: () => flow,
    startBattle: (deck: DeckDef, ai: DeckDef, lv: number) => startFree({ myDeck: deck.cards, myDeckName: deck.name, myDeckId: deck.id, aiDeck: ai.cards, aiDeckName: ai.name, ...aiAt(lv, ai.id) }),
    applySettings,
    openLog: () => setLogOpen(true),
    startEvent: (deck: DeckDef | null, drafted?: string[]) => startEvent(deck, drafted),
    canShareReplay: () => !!lastShare,
    shareReplay: async () => {
      if (!lastShare) return null;
      const r = await shareReplay(lastShare.log, lastShare.info);
      if ('error' in r) { screens.toast(r.error); return null; }
      return replayLink(r.id);
    },
  });

  if (location.hash === '#debug' || /[?&]debug\b/.test(location.search)) (window as unknown as { __cd: unknown }).__cd = { battle: () => battle?.debug(), app, screens, audio };
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  document.getElementById('loading')?.remove();
  const invite = codeFromHash(location.hash);
  const rid = replayFromHash(location.hash);
  if (rid) {
    history.replaceState(null, '', location.pathname + location.search);
    screens.title();
    void (async () => {
      const r = await loadReplay(rid);
      if ('error' in r) { screens.toast(r.error); return; }
      watchReplay(r);
    })();
  } else if (invite) {
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
