/**
 * Turns a game record into a readable play-by-play (Japanese), one block per action: who did what, everything that
 * followed from it (damage with the hit points left, destroyed units, reservations and echoes firing), and the board
 * afterwards. Used by the admin page of the wiki (#admin) and `npm run logs -- … --game <id>`.
 */
import { cardDef } from './cards';
import { replay, type GameLog } from './gamelog';
import { clone, type GameEvent, type GameState, type PlayerIndex } from './engine';

const nm = (id: string) => `「${cardDef(id).name}」`;
const lane = (l: number) => `${['左', '中', '右'][l] ?? l + 1}`;

function board(s: GameState, names: [string, string]): string {
  const side = (pi: PlayerIndex) => {
    const p = s.players[pi];
    const f = p.field.map((u) => (u ? `${cardDef(u.card).name} ${u.atk}/${u.hp}${u.readyAt > p.time ? `(準備${u.readyAt})` : ''}` : '—')).join(' | ');
    const resv = p.resv.map((r) => `${r.T}${r.echo ? '残響' : '予約'}${r.revealed || r.echo ? ':' + cardDef(r.card).name : ''}`).join(',');
    return `  ${names[pi]}：拠点${p.hp} 時計${p.time} 手札${p.hand.length}［${f}］${resv ? ` ピン ${resv}` : ''}`;
  };
  return `${side(0)}\n${side(1)}`;
}

/** The whole game as text. `names` are the two seats (seat 0 first). */
export function narrate(log: GameLog, names: [string, string]): string {
  const out: string[] = [];
  let prev: GameState | null = null;
  let n = 0;
  const first = replay({ ...log, actions: [] });
  if (!first) return '記録を再現できませんでした';
  out.push(`先手：${names[log.first]}`);
  out.push(board(first, names));
  prev = clone(first);
  const end = replay(log, (s, a, pi, ev) => {
    n++;
    const who = (p: PlayerIndex) => names[p];
    // a live copy of the two boards (card names by lane), kept in step with the events
    const field = prev!.players.map((p) => p.field.map((u) => u?.card ?? null));
    const lines: string[] = [];
    for (const e of ev as GameEvent[]) {
      switch (e.e) {
        case 'act': {
          const x = e.action;
          if (x.t === 'draw') lines.push(`${who(e.pi)}：ドロー`);
          else if (x.t === 'wait') lines.push(`${who(e.pi)}：待機`);
          else if (x.t === 'attack') { const c = field[e.pi][x.lane]; lines.push(`${who(e.pi)}：${lane(x.lane)}の${c ? nm(c) : 'ユニット'}で攻撃`); }
          else if (x.t === 'move') { const c = field[e.pi][x.lane]; lines.push(`${who(e.pi)}：${c ? nm(c) : 'ユニット'}を${lane(x.lane)}→${lane(x.to)}へ転移`); }
          break;
        }
        case 'time': lines.push(`  （${who(e.pi)}の時計 ${e.from}→${e.to}）`); break;
        case 'summon': field[e.pi][e.lane] = e.unit.card; lines.push(e.fromHand >= 0 ? `${who(e.pi)}：${nm(e.unit.card)}を${lane(e.lane)}に召喚（${e.unit.atk}/${e.unit.hp}）` : `  ${who(e.pi)}の${lane(e.lane)}に${nm(e.unit.card)}が出た（${e.unit.atk}/${e.unit.hp}）`); break;
        case 'cast': lines.push(`${who(e.pi)}：${nm(e.card)}を使用`); break;
        case 'reserve': lines.push(`${who(e.pi)}：${nm(e.card)}を${e.T}刻に予約`); break;
        case 'echo': lines.push(`  ${who(e.pi)}の${nm(e.card)}の残響が${e.T}刻に入った`); break;
        case 'trigger': lines.push(`  ★${e.T}刻：${who(e.pi)}の${nm(e.card)}の${e.echo ? '残響' : '予約'}が発動`); break;
        case 'attack': lines.push(`  → ${e.target ? `${who(e.target.pi)}の${lane(e.target.lane)}の${field[e.target.pi][e.target.lane] ? nm(field[e.target.pi][e.target.lane]!) : 'ユニット'}へ` : '拠点へ'}`); break;
        case 'dmgUnit': { const c = field[e.pi][e.lane]; lines.push(`  ${who(e.pi)}の${lane(e.lane)}の${c ? nm(c) : 'ユニット'}に${e.amount}ダメージ（残り体力${e.hp}）`); break; }
        case 'dmgBase': lines.push(`  ${who(e.pi)}の拠点に${e.amount}ダメージ${e.doom ? '（終焉込み）' : ''}（残り${e.hp}）`); break;
        case 'heal': lines.push(`  ${who(e.pi)}の拠点が${e.amount}回復（${e.hp}）`); break;
        case 'destroy': field[e.pi][e.lane] = null; lines.push(`  ✕ ${who(e.pi)}の${lane(e.lane)}の${nm(e.unit.card)}が破壊された`); break;
        case 'move': { const c = field[e.pi][e.from]; field[e.pi][e.to] = c; field[e.pi][e.from] = null; if (ev[0]?.e !== 'act' || ev[0].action.t !== 'move') lines.push(`  ${who(e.pi)}の${c ? nm(c) : 'ユニット'}が${lane(e.from)}→${lane(e.to)}へ`); break; }
        case 'swap': { const t = field[e.pi][e.a]; field[e.pi][e.a] = field[e.pi][e.b]; field[e.pi][e.b] = t; lines.push(`  ${who(e.pi)}のユニットが入れ替わった`); break; }
        case 'rotate': { const f = field[e.pi]; f.unshift(f.pop()!); lines.push(`  ${who(e.pi)}のユニットが右へずれた`); break; }
        case 'buff': { const c = field[e.pi][e.lane]; lines.push(`  ${who(e.pi)}の${c ? nm(c) : 'ユニット'}が${e.atk}/${e.hp}に`); break; }
        case 'stun': { const c = field[e.pi][e.lane]; lines.push(`  ${who(e.pi)}の${c ? nm(c) : 'ユニット'}の準備が${e.readyAt}刻まで遅れた`); break; }
        case 'readyAll': lines.push(`  ${who(e.pi)}のユニットが準備完了`); break;
        case 'clock': lines.push(`  ${who(e.pi)}の時計が${e.delta > 0 ? '+' : ''}${e.delta}（${e.to}）`); break;
        case 'bell': lines.push(`  ${who(e.pi)}：${e.at}刻の鐘`); break;
        case 'moveResv': lines.push(`  ${who(e.pi)}の予約が${e.T}刻へ動いた`); break;
        case 'reveal': lines.push(`  ${who(e.pi)}の予約が公開された`); break;
        case 'breakResv': lines.push(`  ${who(e.pi)}の${nm(e.card)}の予約が壊された`); break;
        case 'fizzle': lines.push(`  ${who(e.pi)}の${nm(e.card)}は不発`); break;
        case 'burn': lines.push(`  ${who(e.pi)}の手札がいっぱいで${nm(e.card)}が燃えた`); break;
        case 'deckout': lines.push(`  ${who(e.pi)}の山札が切れた`); break;
        case 'doom': lines.push(`  終焉の刻：ユニットの拠点ダメージ+${e.level}`); break;
        case 'end': lines.push(`■ 終了：${e.winner === -1 ? '引き分け' : `${who(e.winner)}の勝ち`}（${e.reason === 'ko' ? '拠点破壊' : '時間切れ'}）`); break;
        default: break;
      }
    }
    out.push(`\n#${n} [${who(pi)}] ${a.t}`);
    out.push(...lines);
    out.push(board(s, names));
    prev = clone(s);
  });
  if (!end) out.push('\n（ここから先は再現できませんでした）');
  else if (!end.over) out.push('\n■ ここで終了（降参・切断・時間切れ放置）');
  return out.join('\n');
}
