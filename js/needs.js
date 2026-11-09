'use strict';
// ================= Roster needs, team strength and offseason grades =================
// Needs compare each position's depth chart, slot by slot, with the league average at that slot, and
// add an imbalance term (how weak the spot is relative to the team's other positions).
// Need runs 0-10: 5 is a league-average spot.

const NEED_SLOTS = { C: [1.3, 1.1, 0.9, 0.6], LW: [1.3, 1.1, 0.9, 0.6], RW: [1.3, 1.1, 0.9, 0.6], D: [1.3, 1.2, 1.0, 0.9, 0.7, 0.5], G: [1.7, 0.35] };
const NEED_LEVELS = [[8, 'CRITICAL', 'nd-crit'], [6.5, 'HIGH', 'nd-high'], [4.5, 'MODERATE', 'nd-mod'], [2.5, 'LOW', 'nd-low'], [-99, 'STRONG', 'nd-ok']];
const POS_NAME = { C: 'Center', LW: 'Left wing', RW: 'Right wing', D: 'Defense', G: 'Goalie' };
function needLevel(v) { return NEED_LEVELS.find(l => v >= l[0]); }

// Rating used for needs/strength. 'now' docks old players and long injuries a little;
// 'future' projects about two seasons out (young players grow toward potential, veterans decline).
function projOvr(p) {
  const up = Math.max(0, (p.pot || p.ovr) - p.ovr);
  if (p.age <= 20) return p.ovr + up * 0.5;
  if (p.age <= 22) return p.ovr + up * 0.45;
  if (p.age <= 25) return p.ovr + up * 0.3;
  if (p.age >= 31) return p.ovr - (p.age - 30) * 1.3;
  return p.ovr;
}
function effOvr(p, mode) {
  if (mode === 'future') return projOvr(p);
  let v = p.ovr;
  if (p.age >= 34) v -= (p.age - 33) * 0.8;
  if (p.injury && p.injury.games > 30) v -= 4;
  return v;
}
function slotOvrs(players, pos, mode) {
  const n = NEED_SLOTS[pos].length;
  const a = players.filter(p => p.pos === pos).map(p => effOvr(p, mode)).sort((x, y) => y - x).slice(0, n);
  while (a.length < n) a.push(40);
  return a;
}
const _needCache = new WeakMap();
function slotGap(players, pos, avg, mode) {
  const w = NEED_SLOTS[pos], s = slotOvrs(players, pos, mode);
  let g = 0, ws = 0; s.forEach((v, i) => { g += w[i] * (avg[i] - v); ws += w[i]; });
  return g / ws;
}
// League slot averages plus the spread of each position's gap, so a goalie hole and a wing hole read on the same scale.
function leagueSlotAvg(L, mode) {
  mode = mode || 'now';
  const key = [L.year, L.phase, L.day, L.faDay || 0, L.draft ? L.draft.cur : -1, L.trades ? L.trades.length : 0, mode].join('|');
  let c = _needCache.get(L);
  if (!c || c.key !== key) {
    const avg = {}, sd = {}, rosters = L.teams.map(t => rosterPlayers(L, t));
    for (const pos of POSITIONS) {
      const n = NEED_SLOTS[pos].length, tot = new Array(n).fill(0);
      for (const ps of rosters) slotOvrs(ps, pos, mode).forEach((v, i) => { tot[i] += v; });
      avg[pos] = tot.map(v => v / rosters.length);
      const gs = rosters.map(ps => slotGap(ps, pos, avg[pos], mode));
      sd[pos] = Math.max(1.5, Math.sqrt(sum(gs, g => g * g) / gs.length));
    }
    c = { key, avg, sd }; _needCache.set(L, c);
  }
  return c;
}
function rosterNeeds(L, players, mode) {
  const lg = leagueSlotAvg(L, mode), gap = {}, z = {}, need = {};
  for (const pos of POSITIONS) { gap[pos] = slotGap(players, pos, lg.avg[pos], mode); z[pos] = gap[pos] / lg.sd[pos]; }
  const mean = sum(POSITIONS, p => z[p]) / POSITIONS.length;
  for (const pos of POSITIONS) need[pos] = Math.round(clamp(5 + z[pos] * 1.5 + (z[pos] - mean) * 0.6, 0, 10) * 10) / 10;
  return { need, gap };
}
function teamNeeds(L, team, mode) { return rosterNeeds(L, rosterPlayers(L, team), mode).need; }
// The draft looks ahead: half today's holes, half the holes two seasons out.
function draftNeeds(L, team) {
  const a = teamNeeds(L, team, 'now'), b = teamNeeds(L, team, 'future'), out = {};
  for (const pos of POSITIONS) out[pos] = Math.round((a[pos] * 0.5 + b[pos] * 0.5) * 10) / 10;
  return out;
}
// Old 0-4 scale, still used as a bonus by AI free agency and trade valuation.
function teamNeedsSimple(L, team) {
  const n = teamNeeds(L, team), out = {};
  for (const pos of POSITIONS) out[pos] = clamp((n[pos] - 3) * 0.65, 0, 4.5);
  return out;
}
function topNeeds(need, min) { return POSITIONS.filter(p => need[p] >= (min || 6.5)).sort((a, b) => need[b] - need[a]); }

// ---------- Team strength ----------
const STR_F = [1.25, 1.2, 1.15, 1.1, 1.05, 1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7], STR_D = [1.25, 1.15, 1.05, 0.95, 0.85, 0.75], STR_G = [0.85, 0.15];
function rosterStrength(players, mode) {
  const top = (arr, w) => { const a = arr.map(p => effOvr(p, mode)).sort((x, y) => y - x); let s = 0, ws = 0; w.forEach((wi, i) => { s += wi * (a[i] !== undefined ? a[i] : 40); ws += wi; }); return s / ws; };
  return top(players.filter(p => FWD.includes(p.pos)), STR_F) * 0.5 + top(players.filter(p => p.pos === 'D'), STR_D) * 0.3 + top(players.filter(p => p.pos === 'G'), STR_G) * 0.2;
}
function teamStrength(L, team, mode) { return rosterStrength(rosterPlayers(L, team), mode); }
function rankOf(value, others) { return 1 + others.filter(o => o > value).length; }

// What a trade does to one team: needs and strength before/after. outIds leave, inIds arrive.
function tradeImpact(L, tid, outIds, inIds) {
  const before = rosterPlayers(L, L.teams[tid]), out = new Set(outIds);
  const after = before.filter(p => !out.has(p.id)).concat(inIds.map(id => L.players[id]).filter(Boolean));
  const others = L.teams.filter(t => t.id !== tid).map(t => teamStrength(L, t));
  const sb = rosterStrength(before), sa = rosterStrength(after);
  return { nb: rosterNeeds(L, before).need, na: rosterNeeds(L, after).need, sb, sa, rb: rankOf(sb, others), ra: rankOf(sa, others) };
}

// ---------- Offseason grades ----------
// Snapshots are taken when the draft opens and when it closes (= before re-signing and free agency).
// Each grade compares a team's change in strength with the rest of the league's, plus where it now ranks.
const GRADE_SCALE = [[1.5, 'A+'], [1.0, 'A'], [0.65, 'A-'], [0.35, 'B+'], [0.08, 'B'], [-0.2, 'B-'], [-0.5, 'C+'], [-0.8, 'C'], [-1.1, 'C-'], [-1.5, 'D'], [-1e9, 'F']];
function letterFor(z) { return GRADE_SCALE.find(g => z >= g[0])[1]; }
function curve(scores, sdFloor) {
  const v = Object.values(scores), m = sum(v) / v.length;
  const sd = Math.max(sdFloor, Math.sqrt(sum(v, x => (x - m) * (x - m)) / v.length));
  const out = {}; for (const k in scores) out[k] = (scores[k] - m) / sd; return out;
}
function ranksFrom(map) { const v = Object.values(map), out = {}; for (const k in map) out[k] = 1 + v.filter(x => x > map[k]).length; return out; }
const pinfo = (p) => [fullName(p), p.pos, p.ovr, p.age];

function gradeSnapshot(L, kind) {
  const teams = {};
  for (const t of L.teams) {
    const ps = rosterPlayers(L, t);
    teams[t.id] = kind === 'draft'
      ? { s: rosterStrength(ps, 'future'), need: draftNeeds(L, t) }
      : { s: rosterStrength(ps, 'now'), ids: ps.map(p => p.id), exp: ps.filter(p => p.contract && p.contract.exp < L.year).map(p => p.id), need: teamNeeds(L, t) };
  }
  L.gradeSnap = L.gradeSnap || {};
  L.gradeSnap[kind] = { year: L.year, teams };
}
function gradeBook(L) { L.grades = L.grades || {}; return (L.grades[L.year] = L.grades[L.year] || {}); }

function computeDraftGrades(L, D) {
  const snap = L.gradeSnap && L.gradeSnap.draft;
  if (!snap || snap.year !== D.year) return;
  // value over slot: compare each pick's true value with the k-th best player in hindsight
  const val = (p) => p.pot * 0.6 + p.ovr * 0.4;
  const cands = [...D.picks.map(pk => L.players[pk.pid]).filter(Boolean), ...D.pool.map(id => L.players[id]).filter(Boolean)].map(val).sort((a, b) => b - a);
  const before = {}, after = {}, vos = {}, fit = {}, picks = {};
  for (const t of L.teams) {
    before[t.id] = snap.teams[t.id].s; after[t.id] = teamStrength(L, t, 'future');
    const mine = D.picks.filter(pk => pk.tid === t.id && pk.pid && L.players[pk.pid]);
    let v = 0, w = 0, f = 0, fw = 0;
    for (const pk of mine) {
      const p = L.players[pk.pid], wt = pk.rd === 1 ? 1 : pk.rd === 2 ? 0.6 : pk.rd === 3 ? 0.35 : 0.12;
      v += (val(p) - (cands[pk.ovr - 1] || 40)) * wt; w += wt;
      if (pk.rd <= 2) { f += (snap.teams[t.id].need[p.pos] - 5) / 5 * wt; fw += wt; }
    }
    vos[t.id] = w ? v / w : -3; fit[t.id] = fw ? f / fw : 0;
    picks[t.id] = mine.slice(0, 4).map(pk => { const p = L.players[pk.pid]; return [fullName(p), p.pos, p.ovr, p.pot, pk.ovr, Math.round(projOvr(p))]; });
  }
  const rb = ranksFrom(before), ra = ranksFrom(after), mean = sum(Object.values(after)) / 32 - sum(Object.values(before)) / 32;
  const score = {};
  for (const t of L.teams) score[t.id] = ((after[t.id] - before[t.id]) - mean) * 2.2 + vos[t.id] * 0.18 + fit[t.id] * 0.8 + (rb[t.id] - ra[t.id]) * 0.06;
  const z = curve(score, 0.6), book = gradeBook(L), out = {};
  for (const t of L.teams) out[t.id] = { g: letterFor(z[t.id]), z: Math.round(z[t.id] * 100) / 100, sb: before[t.id], sa: after[t.id], rb: rb[t.id], ra: ra[t.id], vos: Math.round(vos[t.id] * 10) / 10, picks: picks[t.id], needs: topNeeds(snap.teams[t.id].need) };
  book.draft = out;
  delete L.gradeSnap.draft;
  const u = out[L.userTeam];
  news(L, `DRAFT GRADE: ${L.teams[L.userTeam].abbr} earned ${/^[AF]/.test(u.g) ? 'an' : 'a'} ${u.g}. Projected strength rank #${u.rb} → #${u.ra}.`, L.userTeam);
}

function computeFAGrades(L) {
  const snap = L.gradeSnap && L.gradeSnap.fa;
  if (!snap || snap.year !== L.year) return;
  const before = {}, after = {}, notes = {};
  for (const t of L.teams) {
    const S = snap.teams[t.id], ps = rosterPlayers(L, t), now = new Set(ps.map(p => p.id)), was = new Set(S.ids);
    before[t.id] = S.s; after[t.id] = rosterStrength(ps, 'now');
    const by = (a) => a.sort((x, y) => y[2] - x[2]).slice(0, 4);
    notes[t.id] = {
      re: by(S.exp.filter(id => now.has(id) && L.players[id]).map(id => pinfo(L.players[id]))),
      out: by(S.ids.filter(id => !now.has(id)).map(id => L.players[id]).filter(Boolean).map(pinfo)),
      in: by(ps.filter(p => !was.has(p.id)).map(pinfo)),
      nRe: S.exp.filter(id => now.has(id)).length, nOut: S.ids.filter(id => !now.has(id)).length, nIn: ps.filter(p => !was.has(p.id)).length,
    };
  }
  const rb = ranksFrom(before), ra = ranksFrom(after), mean = (sum(Object.values(after)) - sum(Object.values(before))) / 32;
  const score = {};
  for (const t of L.teams) score[t.id] = ((after[t.id] - before[t.id]) - mean) * 2 + (rb[t.id] - ra[t.id]) * 0.12 + (16.5 - ra[t.id]) / 16 * 0.6;
  const z = curve(score, 0.7), book = gradeBook(L), out = {};
  for (const t of L.teams) out[t.id] = { g: letterFor(z[t.id]), z: Math.round(z[t.id] * 100) / 100, sb: before[t.id], sa: after[t.id], rb: rb[t.id], ra: ra[t.id], ...notes[t.id] };
  book.fa = out;
  delete L.gradeSnap.fa;
  const u = out[L.userTeam];
  news(L, `FREE AGENCY GRADE: ${L.teams[L.userTeam].abbr} earned ${/^[AF]/.test(u.g) ? 'an' : 'a'} ${u.g}. Strength rank #${u.rb} → #${u.ra}.`, L.userTeam);
}

// Spend scouting points on the best unscouted prospects at the positions the team needs most.
function fitScore(p, need) { return p.sPot * 0.6 + p.sOvr * 0.4 + (need[p.pos] - 5) * 0.9; }
function autoScoutNeeds(L) {
  const need = draftNeeds(L, L.teams[L.userTeam]);
  const pool = (L.draft ? L.draft.pool : L.prospects).slice(0, 90).map(id => L.players[id]).filter(Boolean);
  let n = 0;
  for (let guard = 0; guard < 40; guard++) {
    const c = pool.filter(p => (p.sc || 0) < 3 && need[p.pos] >= 4.5 && [2, 3, 5][p.sc || 0] <= L.scoutPts)
      .sort((a, b) => fitScore(b, need) - fitScore(a, need))[0];
    if (!c || scoutPlayer(L, c)) break;
    n++;
  }
  return n;
}
