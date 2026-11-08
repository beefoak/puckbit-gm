'use strict';
// ================= Player morale (BETA) =================
// p.morale 0-100 (60 = neutral-good). Moves with winning and losing, injuries, trades and how the GM
// handles off-field events. In games, morale nudges every rating up or down (MORALE_FX below).
const MORALE_BASE = 60;
const mor = (p) => p.morale ?? MORALE_BASE;
// rating shift applied during games
function moraleFx(p) { const m = mor(p); return m >= 90 ? 3 : m >= 78 ? 2 : m >= 66 ? 1 : m >= 45 ? 0 : m >= 32 ? -1 : m >= 20 ? -2 : -3; }
function moraleLabel(m) { return m >= 78 ? ['FIRED UP', 'good'] : m >= 66 ? ['HAPPY', 'good'] : m >= 45 ? ['STEADY', 'dim'] : m >= 30 ? ['FRUSTRATED', 'gold'] : ['MISERABLE', 'bad']; }
function bumpMorale(L, p, d, why) {
  if (!p || !d) return;
  p.morale = clamp(Math.round((mor(p) + d) * 10) / 10, 0, 100);
  if (why && p.tid === L.userTeam) { p.morLog = p.morLog || []; p.morLog.unshift({ y: L.year, w: L.phase === 'regular' ? L.day : 0, d: Math.round(d * 10) / 10, why }); if (p.morLog.length > 8) p.morLog.length = 8; }
}
function teamMorale(L, tid) { const r = L.teams[tid].roster.map(id => L.players[id]); return r.length ? r.reduce((a, p) => a + mor(p), 0) / r.length : MORALE_BASE; }
function bumpTeamMorale(L, tid, d, why, except) { for (const id of L.teams[tid].roster) if (id !== except) bumpMorale(L, L.players[id], d, why); }

// Temporarily shift ratings for a game; returns a function that restores them.
function applyMoraleShift(L, tids) {
  const saved = [];
  for (const tid of tids) for (const id of L.teams[tid].roster) {
    const p = L.players[id]; if (!p) continue;
    const fx = moraleFx(p); if (!fx) continue;
    saved.push([p, p.attrs]);
    const a = {}; for (const k in p.attrs) a[k] = clamp(p.attrs[k] + fx, 1, 99);
    p.attrs = a;
  }
  return () => { for (const [p, a] of saved) p.attrs = a; };
}

// After each game: winners get a lift, losers a dip. Starters feel it more; blowouts and streaks amplify it.
function moraleAfterGame(L, g, playoff) {
  if (g.hs === g.as) return; if (!g.box) { g = Object.assign({}, g, { box: {} }); }
  const win = g.hs > g.as ? g.home : g.away, lose = win === g.home ? g.away : g.home;
  const margin = Math.abs(g.hs - g.as);
  const box = g.box || {};
  for (const [tid, sign] of [[win, 1], [lose, -1]]) {
    const t = L.teams[tid];
    const base = (playoff ? 2.2 : 0.9) + (margin >= 4 ? 0.4 : 0) + Math.min(3, Math.abs(t.rec.strk || 0)) * 0.12;
    for (const id of t.roster) {
      const p = L.players[id]; if (!p) continue;
      const played = box[id] && (box[id].toi || box[id].gtoi) ? 1 : 0.4; if (p.farm) continue;
      bumpMorale(L, p, sign * base * played);
    }
  }
}
// Weekly drift back toward neutral, plus the grind of sitting injured.
function moraleWeek(L) {
  for (const t of L.teams) for (const id of t.roster) {
    const p = L.players[id]; if (!p) continue;
    let d = (MORALE_BASE - mor(p)) * 0.08;
    if (p.injury && !p.injury.susp) d -= 0.6;
    bumpMorale(L, p, d);
  }
  if (typeof coachMoraleWeek === 'function') coachMoraleWeek(L);
}
function moraleInjury(L, p, weeks, illness) { weeks = weeks / 4;
  if (p.tid < 0) return;
  bumpMorale(L, p, illness ? -2 : weeks >= 8 ? -14 : weeks >= 4 ? -9 : -4, illness ? null : `Injured (${p.injury.name}, ${Math.round(weeks * 4)} gm)`);
  // losing a star hurts the locker room a little
  if (!illness && weeks >= 4 && p.ovr >= 82) bumpTeamMorale(L, p.tid, -1.5, `Lost ${p.ln} to injury`, p.id);
}
// Players who change teams in a trade are uprooted; the locker room reacts to stars leaving or arriving.
function moraleTrade(L, a, b, movedA, movedB) {
  const side = (from, to, moved) => {
    for (const p of moved) {
      bumpMorale(L, p, -6, `Traded to ${L.teams[to].abbr}`);
      if (p.ovr >= 80) { bumpTeamMorale(L, from, -2.5, `${p.ln} was traded away`); bumpTeamMorale(L, to, 2, `Team traded for ${p.ln}`, p.id); }
    }
  };
  side(a, b, movedA); side(b, a, movedB);
}
function moraleOffseason(L) { for (const p of Object.values(L.players)) if (p.morale !== undefined) { p.morale = Math.round((MORALE_BASE + (p.morale - MORALE_BASE) * 0.5) * 10) / 10; p.morLog = []; } }

// ---------- UI helpers ----------
function moraleChip(p, long) {
  const m = mor(p), [lbl, cls] = moraleLabel(m), fx = moraleFx(p);
  return `<span class="mor ${cls}">${Math.round(m)}${long ? ' ' + lbl : ''}${fx ? ` <b>${fx > 0 ? '+' : ''}${fx}</b>` : ''}</span>`;
}
function moraleWhy(p) {
  const fx = moraleFx(p);
  const head = fx ? `Ratings ${fx > 0 ? '+' : ''}${fx} in games. ` : 'No rating effect. ';
  return head + (p.morLog || []).slice(0, 4).map(e => `${e.d > 0 ? '+' : ''}${e.d} ${e.why}`).join('; ');
}
