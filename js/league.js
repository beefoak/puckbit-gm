'use strict';
// ================= League state & season flow =================
const SAVE_KEY = 'phl_gm_v1';
const AWARD_NAMES = {
  MVP: ['Hartley Memorial Trophy', 'MVP'], SCOR: ['Art Rossi Trophy', 'Scoring champion'], GOAL: ['Rocket Ritchie Trophy', 'Top goal scorer'],
  BESTG: ['Vezner Trophy', 'Top goaltender'], BESTD: ['Norrie Trophy', 'Top defenseman'], ROY: ['Caldwell Trophy', 'Rookie of the year'],
  BDF: ['Selkirk Trophy', 'Top defensive forward'], PMVP: ['Conn Smithers Trophy', 'Playoff MVP'], COY: ['Jack Addams Award', 'Coach of the year'],
  AS1: ['First All-Star Team', 'First All-Star'], MUG: ["Stanley's Mug", 'Champion'],
};
const MUG = "Stanley's Mug";

function newRec() { return { gp: 0, w: 0, l: 0, otl: 0, t: 0, gf: 0, ga: 0, rw: 0, row: 0, strk: 0, l10: [], h2h: {}, home: [0, 0, 0], away: [0, 0, 0] }; }
function newTS() { return { sog: 0, sa: 0, att: 0, atta: 0, ppo: 0, ppg: 0, pko: 0, ppga: 0, pim: 0, hit: 0, blk: 0, fow: 0, fol: 0, xgf: 0, xga: 0, shg: 0 }; }
function recPts(r) { return r.w * 2 + r.otl + r.t; }
function recPct(r) { return r.gp ? recPts(r) / (r.gp * 2) : 0; }
function recStr(r) { return r.w + '-' + r.l + '-' + (r.otl + r.t); }
function news(L, text, tid) {
  L.news.unshift({ y: L.year, d: L.day, text, tid: tid === undefined ? -1 : tid });
  if (L.news.length > 300) L.news.length = 300;
}
function playerValue(p) {
  let v = p.ovr;
  if (p.age <= 23) v += (p.pot - p.ovr) * 0.5; else if (p.age <= 26) v += (p.pot - p.ovr) * 0.25;
  v -= Math.max(0, p.age - 31) * 1.6;
  if (p.injury) v -= Math.min(15, p.injury.games) * 0.4;
  return v;
}
function teamName(L, tid) { const t = L.teams[tid]; return t.city + ' ' + t.name; }
// Name of any franchise in any season (current teams use the user's custom names in their current era).
function fidInfo(L, fid, year) {
  const e = eraOf(fid, year) || FRANCHISES[fid].eras[FRANCHISES[fid].eras.length - 1];
  if (fid < N_CUR && e[1] === NOW && L.teams[fid]) { const t = L.teams[fid]; return { city: t.city, name: t.name, abbr: t.abbr, c1: t.c1, c2: t.c2 }; }
  return { city: e[2], name: e[3], abbr: e[4], c1: e[5], c2: e[6] };
}

// ---------- Creation ----------
function newLeague(userTeam, customNames, onProgress) {
  const L = {
    version: 1, year: 1960, phase: 'preseason', day: 0, userTeam, autoLines: true, autoRoster: false, nextPid: 1, players: {}, teams: [],
    schedule: [], fa: [], news: [], awards: {}, champions: [], seasons: {}, retired: [], hof: [], draftHistory: {}, playoffs: null, draft: null,
    records: null, fran: {}, defunctHist: [], flags: {}, offers: [], trades: [],
  };
  for (let i = 0; i < N_CUR; i++) {
    const f = FRANCHISES[i], e = f.eras[f.eras.length - 1], cn = customNames && customNames[i];
    L.teams.push({ id: i, conf: f.conf, div: f.div, city: e[2], name: (cn && cn.name) || e[3], abbr: (cn && cn.abbr) || e[4], c1: e[5], c2: e[6], roster: [], rec: newRec(), ts: newTS(), history: [], prevPts: null, lines: null, gShare: 0.76 });
  }
  genHistory(L, onProgress);
  balanceRosters(L);
  L.year = 2026; L.phase = 'preseason'; L.day = 0;
  L.cap = START_CAP; L.capHist = [{ year: L.year, cap: L.cap }];
  assignInitialContracts(L);
  if (typeof initOps === 'function') initOps(L);
  if (typeof initCoaches === 'function') initCoaches(L);
  for (const t of L.teams) { aiManageRoster(L, t, true); t.lines = autoLines(L, t); }
  L.prospects = generateDraftClass(L, 240);
  L.scoutPts = 30;
  news(L, `Welcome to the ${seasonLabel(L.year)} season! You are now GM of the ${teamName(L, userTeam)}. Set your lines, then start the season.`, userTeam);
  return L;
}
// Even out the inherited rosters so a fresh league starts with a real race (salary cap era parity)
function teamPower(L, t) {
  const ps = rosterPlayers(L, t), by = pos => ps.filter(p => pos.includes(p.pos)).map(p => p.ovr).sort((a, b) => b - a);
  const avg = (a, n) => a.length ? sum(a.slice(0, n)) / Math.min(n, a.length) : 40;
  return avg(by(['C', 'LW', 'RW']), 12) * 0.5 + avg(by(['D']), 6) * 0.3 + avg(by(['G']), 1) * 0.2;
}
function balanceRosters(L) {
  for (let it = 0; it < 120; it++) {
    const ranked = L.teams.map(t => [t, teamPower(L, t)]).sort((a, b) => b[1] - a[1]);
    const [rich, hi] = ranked[0], [poor, lo] = ranked[ranked.length - 1];
    if (hi - lo < 3.5) break;
    const rp = rosterPlayers(L, rich).sort((a, b) => b.ovr - a.ovr);
    const star = rp[R.int(0, Math.min(6, rp.length - 1))]; if (!star) break;
    const back = rosterPlayers(L, poor).filter(p => p.pos === star.pos && p.ovr < star.ovr).sort((a, b) => b.ovr - a.ovr)[0];
    if (!back) continue;
    rich.roster = rich.roster.filter(id => id !== star.id); poor.roster = poor.roster.filter(id => id !== back.id);
    rich.roster.push(back.id); poor.roster.push(star.id); star.tid = poor.id; back.tid = rich.id;
  }
}
function addFreeAgent(L, pos, T, age) {
  const p = createPlayer(L, pos, clamp(T, 35, 80), age);
  p.exp = Math.max(0, age - 20); p.tid = -1; L.players[p.id] = p; L.fa.push(p.id);
  return p;
}

// ---------- Roster management ----------
const rosterPlayers = (L, team) => team.roster.map(id => L.players[id]).filter(Boolean);
function activeRoster(L, team) { return rosterPlayers(L, team).filter(p => !p.farm && !p.ir); }
function nhlRoster(L, team) { return rosterPlayers(L, team).filter(p => !p.farm); }
function farmRoster(L, team) { return rosterPlayers(L, team).filter(p => p.farm); }
function posCounts(players) { const c = {}; POSITIONS.forEach(ps => c[ps] = 0); players.forEach(p => c[p.pos]++); return c; }
function releasePlayer(L, p, silent) {
  const team = L.teams[p.tid]; if (!team) return;
  team.roster = team.roster.filter(id => id !== p.id);
  if (typeof releaseDeadMoney === 'function') releaseDeadMoney(L, team, p);
  p.tid = -1; p.ir = false; p.farm = false; L.fa.push(p.id);
  if (!silent && team.id === L.userTeam) news(L, `${team.abbr} released ${p.pos} ${fullName(p)}.`, team.id);
}
function signPlayer(L, team, p, silent, contract) {
  L.fa = L.fa.filter(id => id !== p.id);
  if (contract) p.contract = contract;
  else if (!p.contract || p.contract.exp < L.year) { const a = askingContract(L, p); p.contract = { sal: a.sal, exp: L.year + a.yrs - 1 + (L.phase === 'regular' || L.phase === 'playoffs' ? 0 : 0) }; }
  p.tid = team.id; p.ir = false; p.farm = false; team.roster.push(p.id);
  if (!silent && (team.id === L.userTeam || p.ovr >= 76)) news(L, `${team.abbr} signed ${p.pos} ${fullName(p)} (${p.ovr} OVR, ${fmtM(p.contract.sal)} x ${p.contract.exp - L.year + 1}).`, team.id);
}
function sendDown(L, p) { if (p.tid < 0) return 'Not on a team.'; if (farmRoster(L, L.teams[p.tid]).length >= FARM_LIMIT) return 'The farm team is full.'; p.farm = true; p.ir = false; return null; }
function callUp(L, p) { p.farm = false; return null; }

function bestFA(L, pos, healthyOnly, budget) {
  let best = null, bv = -1e9;
  for (const id of L.fa) {
    const p = L.players[id]; if (!p || p.pos !== pos || (healthyOnly && p.injury)) continue;
    if (budget !== undefined && askingContract(L, p).sal > Math.max(budget, minSalary(L))) continue;
    const v = playerValue(p); if (v > bv) { bv = v; best = p; }
  }
  return best;
}
// AI (and the user's team when auto roster is on): IR for long injuries, keep healthy bodies at every
// position by calling up from the farm or signing cheap free agents, and keep the active roster at 23.
function aiManageRoster(L, team, init) {
  const all = rosterPlayers(L, team);
  if (!init) { // fast path: nothing changed
    let act = 0, dirty = false; const hc = { C: 0, LW: 0, RW: 0, D: 0, G: 0 };
    for (const p of all) { if (p.farm) continue; if (p.injury ? (p.injury.games >= 7 && !p.ir) : p.ir) { dirty = true; break; } if (!p.ir) { act++; if (!p.injury) hc[p.pos]++; } }
    if (!dirty && act === ROSTER_LIMIT && POSITIONS.every(ps => hc[ps] >= HEALTHY_NEED[ps])) return;
  }
  for (const p of all) {
    if (p.farm) continue;
    if (p.injury && p.injury.games >= 7) p.ir = true;
    else if (!p.injury && p.ir) p.ir = false;
  }
  for (const pos of POSITIONS) {
    let guard = 0;
    while (guard++ < 6) {
      const act = activeRoster(L, team);
      const healthyN = act.filter(p => (pos === 'G' ? p.pos === 'G' : p.pos === pos) && !p.injury).length;
      if (healthyN >= HEALTHY_NEED[pos]) break;
      const fp = farmRoster(L, team).filter(p => p.pos === pos && !p.injury).sort((a, b) => b.ovr - a.ovr)[0];
      if (fp) { fp.farm = false; continue; }
      let fa = bestFA(L, pos, true, typeof capSpace === 'function' ? capSpace(L, team) : undefined);
      if (!fa) fa = addFreeAgent(L, pos, R.gauss(54, 4), R.int(24, 31));
      signPlayer(L, team, fa, true, { sal: minSalary(L), exp: L.year });
    }
  }
  // trim to 23 active: send down young players first, release the rest
  let guard = 0;
  while (activeRoster(L, team).length > ROSTER_LIMIT && guard++ < 40) {
    const act = activeRoster(L, team); const cnt = posCounts(act);
    const cands = act.filter(p => cnt[p.pos] > (p.pos === 'G' ? 2 : ROSTER_MIN[p.pos])).sort((a, b) => playerValue(a) - playerValue(b));
    const p = cands[0] || act.sort((a, b) => playerValue(a) - playerValue(b))[0];
    if ((p.age <= 25 || init) && farmRoster(L, team).length < FARM_LIMIT) p.farm = true; else releasePlayer(L, p, true);
  }
  // fill to 23 from the farm
  guard = 0;
  while (activeRoster(L, team).length < ROSTER_LIMIT && guard++ < 10) {
    const cnt = posCounts(activeRoster(L, team));
    const fp = farmRoster(L, team).filter(p => !p.injury).sort((a, b) => (b.ovr - (cnt[b.pos] >= ROSTER_TEMPLATE[b.pos] ? 5 : 0)) - (a.ovr - (cnt[a.pos] >= ROSTER_TEMPLATE[a.pos] ? 5 : 0)))[0];
    if (!fp) break; fp.farm = false;
  }
  // farm size
  const farm = farmRoster(L, team).sort((a, b) => playerValue(a) - playerValue(b));
  while (farm.length > FARM_LIMIT) releasePlayer(L, farm.shift(), true);
  if (team.id !== L.userTeam || L.autoLines) team.lines = null;
}

// ---------- Schedule ----------
// 82 games: 4 vs five division rivals and 3 vs the other two, 3 vs the other division in the conference,
// home and away vs the other conference. Packed into game days (each team at most one game per day).
function makeSchedule(L) {
  const T = L.teams, pairs = [];
  const add = (a, b, n) => { for (let i = 0; i < n; i++) pairs.push(i % 2 === 0 ? (R.chance(0.5) ? [a, b] : [b, a]) : null); };
  const games = [];
  for (const conf of CONFS) for (const div of DIVS[conf]) {
    const ids = R.shuffle(T.filter(t => t.conf === conf && t.div === div).map(t => t.id));
    const three = new Set(); ids.forEach((id, i) => { const j = ids[(i + 1) % ids.length]; three.add([id, j].sort().join('-')); });
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j], n = three.has([a, b].sort().join('-')) ? 3 : 4;
      for (let k = 0; k < n; k++) games.push(k % 2 === 0 ? [a, b] : [b, a]);
      if (n === 3 && R.chance(0.5)) { const g = games[games.length - 1]; games[games.length - 1] = [g[1], g[0]]; }
    }
  }
  for (const a of T) for (const b of T) {
    if (a.id >= b.id) continue;
    if (a.conf === b.conf && a.div !== b.div) { games.push([a.id, b.id], [b.id, a.id]); games.push(R.chance(0.5) ? [a.id, b.id] : [b.id, a.id]); }
    else if (a.conf !== b.conf) games.push([a.id, b.id], [b.id, a.id]);
  }
  R.shuffle(games);
  const left = {}; T.forEach(t => left[t.id] = 0); games.forEach(([h, a]) => { left[h]++; left[a]++; });
  const out = []; let rem = games.slice(), day = 0, last = {};
  while (rem.length && day < 400) {
    day++;
    const busy = new Set(); const next = [];
    rem.sort((x, y) => (left[y[0]] + left[y[1]]) - (left[x[0]] + left[x[1]]) + R.rand(-6, 6));
    let n = 0; const cap = R.int(10, 16);
    for (const g of rem) {
      const [h, a] = g;
      if (n >= cap || busy.has(h) || busy.has(a) || ((last[h] === day - 1 || last[a] === day - 1) && R.chance(0.55))) { next.push(g); continue; }
      busy.add(h); busy.add(a); last[h] = day; last[a] = day; left[h]--; left[a]--; n++;
      out.push({ id: `g${L.year}_${out.length}`, day, home: h, away: a, played: false });
    }
    rem = next;
  }
  L.lastDay = day;
  L.deadlineDay = Math.round(day * 0.78);
  return out;
}

// ---------- Games ----------
function updateRecords(L, g) {
  const h = L.teams[g.home], a = L.teams[g.away];
  const apply = (t, o, gf, ga, home) => {
    const r = t.rec; r.gp++; r.gf += gf; r.ga += ga;
    const res = gf > ga ? 'W' : (g.ot || g.so) ? 'O' : 'L';
    if (res === 'W') { r.w++; if (!g.ot && !g.so) r.rw++; if (!g.so) r.row++; } else if (res === 'O') r.otl++; else r.l++;
    const hr = home ? r.home : r.away; hr[res === 'W' ? 0 : res === 'L' ? 1 : 2]++;
    r.l10.push(res); if (r.l10.length > 10) r.l10.shift();
    r.strk = res === 'W' ? (r.strk > 0 ? r.strk + 1 : 1) : (r.strk < 0 ? r.strk - 1 : -1);
    const x = r.h2h[o.id] || (r.h2h[o.id] = [0, 0]); x[0] += res === 'W' ? 2 : res === 'O' ? 1 : 0; x[1]++;
  };
  apply(h, a, g.hs, g.as, true); apply(a, h, g.as, g.hs, false);
}
function addTeamStats(L, res) {
  for (const s of [0, 1]) {
    const t = L.teams[s === 0 ? res.home : res.away], m = res.ts[s], o = res.ts[1 - s]; if (!t.ts) t.ts = newTS();
    const T = t.ts;
    T.sog += m.sog; T.sa += o.sog; T.att += m.att; T.atta += o.att; T.ppo += m.ppo; T.ppg += m.ppg; T.pko += o.ppo; T.ppga += o.ppg;
    T.pim += m.pim; T.hit += m.hit; T.blk += m.blk; T.fow += m.fow; T.fol += o.fow; T.xgf += m.xg; T.xga += o.xg; T.shg += m.shg;
  }
}
function gameSummary(L, res) {
  return { goals: res.goals.map(g => ({ s: g.s, per: g.per, clk: Math.round(g.clk), sc: g.scorer, as: g.assists, pp: g.pp ? 1 : 0, sh: g.sh ? 1 : 0, en: g.en ? 1 : 0 })), stars: res.stars, sog: [res.ts[0].sog, res.ts[1].sog], g: res.g };
}
function compactBox(res) { const b = {}; for (const id in res.box) { const c = compactStats(res.box[id]); c.tid = res.box[id].tid; if (Object.keys(c).length > 1) b[id] = c; } return b; }
function gameOpts(L, g, playoff) {
  const backup = [g.home, g.away].map(tid => { const t = L.teams[tid]; return !playoff && R.chance(1 - (t.gShare || 0.76)); });
  const crowd = g.home === L.userTeam && typeof crowdFactor === 'function' ? crowdFactor(L) : 1;
  const ice = g.home === L.userTeam && typeof iceFactor === 'function' ? iceFactor(L) : 1;
  return { playoff, backup, crowd, ice };
}
// Apply a finished game's result to the league (stats, standings, injuries, fans, morale, records).
function applyResult(L, g, res, playoff) {
  g.played = true; g.hs = res.hs; g.as = res.as; g.ot = res.ot; g.so = res.so;
  g.sum = gameSummary(L, res);
  const isUser = g.home === L.userTeam || g.away === L.userTeam;
  if (isUser || playoff) { g.box = compactBox(res); g.tst = res.ts.map(x => ({ sog: x.sog, ppg: x.ppg, ppo: x.ppo, hit: x.hit, blk: x.blk, fow: x.fow, pim: x.pim, xg: Math.round(x.xg * 10) / 10 })); }
  for (const pid in res.box) { const p = L.players[pid]; if (p) addStats(playoff ? p.pstats : p.stats, res.box[pid]); }
  if (!playoff) { updateRecords(L, g); addTeamStats(L, res); checkGameRecords(L, res, g); }
  postGameInjuries(L, res);
  if (typeof opsAfterGame === 'function') opsAfterGame(L, g, playoff);
  if (typeof moraleAfterGame === 'function') moraleAfterGame(L, g, playoff);
  milestones(L, res, playoff);
}
function playGame(L, g, playoff) { const res = simGame(L, g.home, g.away, gameOpts(L, g, playoff)); applyResult(L, g, res, playoff); return res; }

// ---------- Injuries ----------
function injurePlayer(L, p, inj, illness) {
  const games = R.int(inj[2], inj[3]);
  p.injury = { name: inj[0], games, fresh: true, ill: !!illness };
  p.injHist.push({ y: L.year, d: L.day, name: inj[0], games });
  if (typeof moraleInjury === 'function') moraleInjury(L, p, games, illness);
  if (inj[4]) { for (const k in inj[4]) { const [a, b] = inj[4][k]; p.attrs[k] = clamp(p.attrs[k] - R.int(a, b), 15, 99); } p.ovr = calcOvr(p); }
  if (games >= 7 && p.tid >= 0 && !p.farm) p.ir = true;
  if (p.tid >= 0 && !p.farm && (p.tid === L.userTeam || p.ovr >= 82)) {
    const t = L.teams[p.tid];
    news(L, `${t.abbr} ${p.pos} ${fullName(p)} ${illness ? 'is sick' : 'is injured'} (${inj[0]}) - ${games <= 2 ? 'day-to-day' : `out ${games} games`}.`, p.tid);
  }
}
function postGameInjuries(L, res) {
  for (const id in res.box) {
    const p = L.players[id]; if (!p || p.injury) continue;
    const b = res.box[id]; const toi = p.pos === 'G' ? b.gtoi : b.toi; if (!toi) continue;
    const rate = INJ_RATE[p.pos] * (toi / (p.pos === 'G' ? 3600 : 1100)) * (p.age > 32 ? 1.2 : 1) * (1 + (b.hit + b.blk) * 0.04);
    if (R.chance(rate)) injurePlayer(L, p, R.weighted(INJURIES, i => i[1]), false);
  }
}
function healDay(L, playedTids) {
  for (const id in L.players) {
    const p = L.players[id]; if (p.tid === -2) continue;
    if (p.injury) {
      if (p.injury.fresh) { p.injury.fresh = false; continue; }
      const played = p.tid >= 0 && !p.farm ? playedTids.has(p.tid) : R.chance(0.5);
      if (played && --p.injury.games <= 0) {
        if (p.tid >= 0 && !p.farm && (p.tid === L.userTeam || p.ovr >= 82) && !p.injury.susp) news(L, `${L.teams[p.tid].abbr} ${p.pos} ${fullName(p)} is back from ${p.injury.name}.`, p.tid);
        p.injury = null; p.ir = false;
      }
    } else if (p.tid >= 0 && playedTids.has(p.tid) && R.chance(0.0012)) injurePlayer(L, p, R.weighted(ILLNESSES, i => i[1]), true);
  }
}

// ---------- Days ----------
function dayGames(L, day) { return L.schedule.filter(g => g.day === (day === undefined ? L.day : day)); }
function userGameToday(L) {
  if (L.phase === 'regular') return dayGames(L).find(g => !g.played && (g.home === L.userTeam || g.away === L.userTeam)) || null;
  if (L.phase === 'playoffs' && L.playoffs) return playoffTodayGames(L).find(g => g.home === L.userTeam || g.away === L.userTeam) || null;
  return null;
}
function playDayGames(L, skipUser) {
  if (L.phase !== 'regular') return;
  for (const g of dayGames(L)) { if (g.played) continue; if (skipUser && (g.home === L.userTeam || g.away === L.userTeam)) continue; playGame(L, g, false); }
}
function endDay(L) {
  const played = new Set(); for (const g of dayGames(L)) { played.add(g.home); played.add(g.away); }
  healDay(L, played);
  for (const t of L.teams) if (played.has(t.id) && (t.id !== L.userTeam || L.autoRoster)) aiManageRoster(L, t);
  if (L.day % 7 === 0) weekly(L);
  L.day++;
  if (typeof scoutDay === 'function') scoutDay(L);
  if (L.day > L.lastDay) endRegularSeason(L);
}
function weekly(L) {
  if (typeof moraleWeek === 'function') moraleWeek(L);
  if (typeof opsWeek === 'function') opsWeek(L);
  if (typeof maybeTradeOffer === 'function' && L.phase === 'regular' && L.day <= L.deadlineDay) maybeTradeOffer(L);
  if (typeof aiTrades === 'function' && L.phase === 'regular' && L.day <= L.deadlineDay) aiTrades(L);
  if (L.phase === 'regular' && L.day === Math.floor(L.deadlineDay / 7) * 7) news(L, `The trade deadline is day ${L.deadlineDay}. Last chance to buy or sell.`, L.userTeam);
}
function simDay(L) {
  if (L.phase === 'regular') { playDayGames(L, false); endDay(L); }
  else if (L.phase === 'playoffs') simPlayoffDay(L);
}

// ---------- Standings ----------
function cmpTeams(a, b) {
  const pa = recPts(a.rec), pb = recPts(b.rec);
  const pca = recPct(a.rec), pcb = recPct(b.rec);
  if (pca !== pcb && (a.rec.gp !== b.rec.gp)) return pcb - pca;
  if (pa !== pb) return pb - pa;
  if (a.rec.rw !== b.rec.rw) return b.rec.rw - a.rec.rw;
  if (a.rec.row !== b.rec.row) return b.rec.row - a.rec.row;
  if (a.rec.w !== b.rec.w) return b.rec.w - a.rec.w;
  const da = a.rec.gf - a.rec.ga, db = b.rec.gf - b.rec.ga; if (da !== db) return db - da;
  return a.id - b.id;
}
function divStandings(L, conf, div) { return L.teams.filter(t => t.conf === conf && t.div === div).sort(cmpTeams); }
function confStandings(L, conf) { return L.teams.filter(t => t.conf === conf).sort(cmpTeams); }
function playoffSeeds(L, conf) {
  const [d1, d2] = DIVS[conf].map(d => divStandings(L, conf, d));
  const top = new Set([...d1.slice(0, 3), ...d2.slice(0, 3)].map(t => t.id));
  const wc = confStandings(L, conf).filter(t => !top.has(t.id)).slice(0, 2);
  return { d1: d1.slice(0, 3).map(t => t.id), d2: d2.slice(0, 3).map(t => t.id), wc: wc.map(t => t.id) };
}
function clinchMarks(L) {
  const out = {};
  for (const conf of CONFS) { const s = playoffSeeds(L, conf); s.d1.concat(s.d2).forEach((id, i) => out[id] = i % 3 === 0 ? 'y' : 'x'); s.wc.forEach(id => out[id] = 'w'); }
  return out;
}

// ---------- Awards ----------
function skaterScore(s) { return st(s, 'g') * 1.25 + st(s, 'a') * 0.9 + st(s, 'pm') * 0.15; }
function goalieScore(s) { if (st(s, 'gs') < 25) return -99; return (svPct(s) - 0.895) * 800 + st(s, 'w') * 0.75 + st(s, 'so') * 1.5; }
function bdfScore(p, s) { return p.attrs.dfi * 0.35 + st(s, 'pm') * 0.6 + st(s, 'blk') * 0.06 + st(s, 'tk') * 0.12 + pts(s) * 0.2 + (st(s, 'fow') + st(s, 'fol') > 300 ? (st(s, 'fow') / (st(s, 'fow') + st(s, 'fol')) - 0.5) * 60 : 0); }
function dScore(p, s) { return pts(s) * 0.85 + st(s, 'pm') * 0.35 + st(s, 'blk') * 0.04 + st(s, 'toi') / Math.max(1, st(s, 'gp')) / 60 * 1.2 + p.ovr * 0.3; }
// entries: [{p, s, tid, tpts}] - works for the live league and for generated history.
function pickAwards(entries, rookieFn) {
  const sk = entries.filter(e => e.p.pos !== 'G' && st(e.s, 'gp') >= 20), gs = entries.filter(e => e.p.pos === 'G');
  const top = (arr, f, n) => arr.map(e => [e, f(e)]).sort((a, b) => b[1] - a[1]).slice(0, n || 3).map(x => x[0]);
  const A = {};
  const mvpC = [...sk.map(e => [e, skaterScore(e.s) + e.tpts * 0.25]), ...gs.map(e => [e, goalieScore(e.s) * 1.05 + e.tpts * 0.25])].sort((a, b) => b[1] - a[1]);
  A.MVP = mvpC.slice(0, 3).map(x => x[0]);
  A.SCOR = top(sk, e => pts(e.s) + st(e.s, 'g') * 0.01);
  A.GOAL = top(sk, e => st(e.s, 'g') + pts(e.s) * 0.001);
  A.BESTG = top(gs, e => goalieScore(e.s));
  A.BESTD = top(sk.filter(e => e.p.pos === 'D'), e => dScore(e.p, e.s));
  A.ROY = top(entries.filter(e => rookieFn(e.p) && st(e.s, 'gp') >= 20), e => e.p.pos === 'G' ? goalieScore(e.s) * 0.9 : skaterScore(e.s));
  A.BDF = top(sk.filter(e => FWD.includes(e.p.pos)), e => bdfScore(e.p, e.s));
  const as = {};
  as.C = top(sk.filter(e => e.p.pos === 'C'), e => skaterScore(e.s), 1); as.LW = top(sk.filter(e => e.p.pos === 'LW'), e => skaterScore(e.s), 1);
  as.RW = top(sk.filter(e => e.p.pos === 'RW'), e => skaterScore(e.s), 1); as.D = A.BESTD.slice(0, 2); as.G = A.BESTG.slice(0, 1);
  A.AS1 = as;
  return A;
}
function awardLine(p, s) {
  if (p.pos === 'G') return `${st(s, 'w')} W, ${fmtSv(svPct(s))} SV%, ${gaa(s).toFixed(2)} GAA, ${st(s, 'so')} SO`;
  return `${st(s, 'g')} G, ${st(s, 'a')} A, ${pts(s)} PTS, ${st(s, 'pm') > 0 ? '+' : ''}${st(s, 'pm')}`;
}
function awardEntry(L, e) { return { pid: e.p.id, name: fullName(e.p), pos: e.p.pos, fid: e.tid, abbr: e.abbr, line: awardLine(e.p, e.s) }; }
function giveAward(p, y, k) { p.awards.push({ y, k }); }
function computeAwards(L) {
  const entries = Object.values(L.players).filter(p => p.tid >= 0 && p.stats.gp > 0).map(p => ({ p, s: p.stats, tid: p.tid, abbr: L.teams[p.tid].abbr, tpts: recPts(L.teams[p.tid].rec) }));
  const A = pickAwards(entries, p => p.exp === 0 && p.age <= 25);
  const out = {};
  for (const k of ['MVP', 'SCOR', 'GOAL', 'BESTG', 'BESTD', 'ROY', 'BDF']) {
    out[k] = A[k].map(e => awardEntry(L, e));
    if (A[k][0]) { giveAward(A[k][0].p, L.year, k); const w = out[k][0]; news(L, `${AWARD_NAMES[k][0]} (${AWARD_NAMES[k][1]}): ${w.name} (${w.pos}, ${w.abbr}) - ${w.line}`, w.fid); }
  }
  out.AS1 = {}; for (const pos in A.AS1) { out.AS1[pos] = A.AS1[pos].map(e => awardEntry(L, e)); A.AS1[pos].forEach(e => giveAward(e.p, L.year, 'AS1')); }
  // coach of the year: biggest jump in points
  const coy = L.teams.map(t => [t, t.prevPts === null ? recPts(t.rec) : (recPts(t.rec) - t.prevPts) * 1.5 + recPts(t.rec) * 0.5]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  out.COY = coy.map(([t]) => { const hc = L.coaches && L.coaches[t.staff && t.staff.HC]; return { fid: t.id, name: hc ? coachName(hc) : 'Head coach', abbr: t.abbr, pos: 'HC', line: `${recStr(t.rec)}, ${recPts(t.rec)} pts` }; });
  L.awards[L.year] = out;
}

// ---------- Season end / playoffs ----------
function endRegularSeason(L) {
  L.phase = 'playoffs';
  computeAwards(L);
  seasonRecords(L);
  startPlayoffs(L);
}
function startPlayoffs(L) {
  const P = { series: [], round: 0, games: [], day: 0, champion: null, seeds: {} };
  L.playoffs = P;
  for (const conf of CONFS) {
    const s = playoffSeeds(L, conf); P.seeds[conf] = s;
    const w1 = L.teams[s.d1[0]], w2 = L.teams[s.d2[0]];
    const d1Best = cmpTeams(w1, w2) <= 0;
    const wcA = d1Best ? s.wc[1] : s.wc[0], wcB = d1Best ? s.wc[0] : s.wc[1];
    const mk = (a, b, slot, la, lb) => { const [hi, lo] = cmpTeams(L.teams[a], L.teams[b]) <= 0 ? [a, b] : [b, a]; P.series.push({ id: `${conf[0]}${slot}`, r: 0, conf, slot, hi, lo, w: [0, 0], done: false, winner: null, lbl: hi === a ? [la, lb] : [lb, la] }); };
    const dn = DIVS[conf];
    mk(s.d1[0], wcA, 0, dn[0][0] + '1', 'WC'); mk(s.d1[1], s.d1[2], 1, dn[0][0] + '2', dn[0][0] + '3');
    mk(s.d2[0], wcB, 2, dn[1][0] + '1', 'WC'); mk(s.d2[1], s.d2[2], 3, dn[1][0] + '2', dn[1][0] + '3');
  }
  const inP = new Set(P.series.flatMap(x => [x.hi, x.lo]));
  news(L, `${L.teams[L.userTeam].abbr} ${inP.has(L.userTeam) ? 'clinched a playoff spot!' : 'missed the playoffs.'} The ${MUG} playoffs begin.`, L.userTeam);
}
function curSeries(L) { const P = L.playoffs; return P.series.filter(s => s.r === P.round); }
function playoffTodayGames(L) {
  const P = L.playoffs; if (!P || P.champion !== null) return [];
  const out = [];
  for (const s of curSeries(L)) {
    if (s.done) continue;
    const k = s.w[0] + s.w[1];
    const id = `p${L.year}_${s.id}${s.r}_${k}`;
    let g = P.games.find(x => x.id === id);
    if (!g) { const hiHome = [0, 1, 4, 6].includes(k); g = { id, sid: s.id, r: s.r, k, home: hiHome ? s.hi : s.lo, away: hiHome ? s.lo : s.hi, played: false, day: P.day }; P.games.push(g); }
    out.push(g);
  }
  return out;
}
function seriesResult(L, g) {
  const s = L.playoffs.series.find(x => x.id === g.sid && x.r === g.r);
  const win = g.hs > g.as ? g.home : g.away;
  s.w[win === s.hi ? 0 : 1]++;
  if (s.w[0] === 4 || s.w[1] === 4) {
    s.done = true; s.winner = s.w[0] === 4 ? s.hi : s.lo;
    const lose = s.winner === s.hi ? s.lo : s.hi;
    const nr = L.playoffs.series.filter(x => x.r === s.r).length === 1 ? 4 : s.r;
    if (s.winner === L.userTeam || lose === L.userTeam || s.r >= 2) news(L, `${roundName(s.r, 4)}: ${L.teams[s.winner].abbr} beat ${L.teams[lose].abbr} ${Math.max(...s.w)}-${Math.min(...s.w)}.`, L.userTeam);
  }
}
function simPlayoffDay(L, skipUser) {
  const P = L.playoffs; if (!P || P.champion !== null) return;
  for (const g of playoffTodayGames(L)) {
    if (g.played) continue;
    if (skipUser && (g.home === L.userTeam || g.away === L.userTeam)) continue;
    playGame(L, g, true); seriesResult(L, g);
  }
  if (!skipUser) endPlayoffDay(L);
}
function endPlayoffDay(L) {
  const P = L.playoffs;
  const played = new Set(P.games.filter(g => g.day === P.day).flatMap(g => [g.home, g.away]));
  healDay(L, played);
  for (const t of L.teams) if (t.id !== L.userTeam || L.autoRoster) aiManageRoster(L, t);
  P.day++;
  if (P.day % 7 === 0) { if (typeof opsWeek === 'function') opsWeek(L); if (typeof moraleWeek === 'function') moraleWeek(L); }
  if (curSeries(L).every(s => s.done)) advanceRound(L);
}
function advanceRound(L) {
  const P = L.playoffs, r = P.round, cur = curSeries(L);
  if (r === 3) { crownChampion(L, cur[0]); return; }
  P.round++;
  const mk = (a, b, conf, slot) => { const [hi, lo] = cmpTeams(L.teams[a], L.teams[b]) <= 0 ? [a, b] : [b, a]; P.series.push({ id: `${conf ? conf[0] : 'F'}${slot}`, r: P.round, conf, slot, hi, lo, w: [0, 0], done: false, winner: null }); };
  if (r < 2) for (const conf of CONFS) { const c = cur.filter(s => s.conf === conf).sort((a, b) => a.slot - b.slot); for (let i = 0; i < c.length; i += 2) mk(c[i].winner, c[i + 1].winner, conf, i / 2); }
  else { const e = cur.find(s => s.conf === 'Eastern').winner, w = cur.find(s => s.conf === 'Western').winner; mk(e, w, null, 0); }
}
function crownChampion(L, s) {
  const P = L.playoffs; P.champion = s.winner;
  const champ = s.winner, runner = s.winner === s.hi ? s.lo : s.hi;
  // playoff MVP: the best playoff performer, usually on the champion
  const cands = Object.values(L.players).filter(p => p.tid >= 0 && p.pstats.gp > 0);
  let mvp = null, mv = -1e9;
  for (const p of cands) {
    const ps = p.pstats; let v = p.pos === 'G' ? (st(ps, 'sa') ? (svPct(ps) - 0.9) * 320 + st(ps, 'w') * 1.3 : 0) : st(ps, 'g') * 1.3 + st(ps, 'a') + st(ps, 'pm') * 0.2;
    if (p.tid === champ) v *= 1.35; else if (p.tid !== runner) v *= 0.4;
    if (v > mv) { mv = v; mvp = p; }
  }
  if (mvp) giveAward(mvp, L.year, 'PMVP');
  for (const id of L.teams[champ].roster) { const p = L.players[id]; if (p && !p.farm && (p.pstats.gp > 0)) giveAward(p, L.year, 'MUG'); }
  const fs = `${Math.max(...s.w)}-${Math.min(...s.w)}`;
  const ci = fidInfo(L, champ, L.year), ri = fidInfo(L, runner, L.year);
  L.champions.push({ year: L.year, champ, runner, score: fs, champName: ci.city + ' ' + ci.name, champAbbr: ci.abbr, runnerName: ri.city + ' ' + ri.name, runnerAbbr: ri.abbr, mvp: mvp ? { name: fullName(mvp), pos: mvp.pos, pid: mvp.id, line: mvp.pos === 'G' ? `${mvp.pstats.w} W, ${fmtSv(svPct(mvp.pstats))}` : `${mvp.pstats.g} G, ${mvp.pstats.a} A` } : null });
  if (L.awards[L.year]) L.awards[L.year].PMVP = mvp ? [{ pid: mvp.id, name: fullName(mvp), pos: mvp.pos, abbr: L.teams[mvp.tid].abbr, fid: mvp.tid, line: L.champions[L.champions.length - 1].mvp.line }] : [];
  news(L, `${MUG.toUpperCase()}: The ${teamName(L, champ)} are champions, beating the ${L.teams[runner].abbr} ${fs}! Playoff MVP: ${mvp ? fullName(mvp) : '-'}.`, champ);
  L.phase = 'postseason';
}
function playoffResult(L, tid) {
  const P = L.playoffs; if (!P) return 'Missed Playoffs';
  if (P.champion === tid) return 'WON THE MUG';
  const lost = P.series.filter(s => (s.hi === tid || s.lo === tid) && s.done && s.winner !== tid)[0];
  if (lost) return ['Lost First Round', 'Lost Second Round', 'Lost Conf. Final', 'Lost Mug Final'][lost.r];
  if (P.series.some(s => s.hi === tid || s.lo === tid)) return 'In Playoffs';
  return 'Missed Playoffs';
}

// ---------- Records ----------
function emptyRecords() {
  const m = () => [];
  return { game: { g: m(), a: m(), pts: m(), sv: m(), tg: m() }, season: { g: m(), a: m(), pts: m(), pim: m(), pm: m(), ppg: m(), w: m(), so: m(), gaa: m(), sv: m() }, team: { pts: m(), gf: m(), ga: m(), w: m() } };
}
function pushRec(list, e, low) {
  list.push(e); list.sort((a, b) => low ? a.v - b.v : b.v - a.v);
  if (list.length > 10) list.length = 10;
  return list.indexOf(e);
}
function checkGameRecords(L, res, g) {
  const R0 = L.records.game;
  for (const id in res.box) {
    const b = res.box[id], p = L.players[id]; if (!p) continue;
    const opp = L.teams[b.tid === g.home ? g.away : g.home].abbr, tm = L.teams[b.tid].abbr;
    const base = { pid: p.id, name: fullName(p), tm, y: L.year, opp };
    if (b.g >= 3 && pushRec(R0.g, { ...base, v: b.g }) === 0) news(L, `RECORD: ${fullName(p)} scores ${b.g} goals in a game!`, b.tid);
    if (b.a >= 4) pushRec(R0.a, { ...base, v: b.a });
    if (b.g + b.a >= 5) pushRec(R0.pts, { ...base, v: b.g + b.a });
    if (p.pos === 'G' && b.sa - b.ga >= 40) pushRec(R0.sv, { ...base, v: b.sa - b.ga });
  }
  for (const [tid, sc, o] of [[g.home, g.hs, g.away], [g.away, g.as, g.home]]) if (sc >= 7) pushRec(R0.tg, { v: sc, name: L.teams[tid].city + ' ' + L.teams[tid].name, tm: L.teams[tid].abbr, y: L.year, opp: L.teams[o].abbr });
}
// Season records from a list of {p (or name/pos), s, abbr, y}
function seasonRecordEntries(L, entries, y, gpN) {
  const S = L.records.season;
  for (const e of entries) {
    const s = e.s, base = { pid: e.pid, name: e.name, tm: e.abbr, y };
    if (e.pos === 'G') {
      if (st(s, 'w')) pushRec(S.w, { ...base, v: st(s, 'w') });
      if (st(s, 'so')) pushRec(S.so, { ...base, v: st(s, 'so') });
      if (st(s, 'gs') >= Math.max(25, gpN * 0.45) && st(s, 'gtoi')) { pushRec(S.gaa, { ...base, v: Math.round(gaa(s) * 100) / 100 }, true); pushRec(S.sv, { ...base, v: Math.round(svPct(s) * 1000) / 1000 }); }
    } else {
      for (const k of ['g', 'a', 'pim', 'pm', 'ppg']) if (st(s, k) > 0) pushRec(S[k], { ...base, v: st(s, k) });
      if (pts(s)) pushRec(S.pts, { ...base, v: pts(s) });
    }
  }
}
function teamRecordEntries(L, rows, y) {
  const T = L.records.team;
  for (const r of rows) { const base = { name: r.city + ' ' + r.name, tm: r.abbr, y, gp: r.gp }; pushRec(T.pts, { ...base, v: r.pts }); pushRec(T.gf, { ...base, v: r.gf }); if (r.gp >= 70) pushRec(T.ga, { ...base, v: r.ga }, true); pushRec(T.w, { ...base, v: r.w }); }
}
function seasonRecords(L) {
  const before = JSON.stringify(L.records.season.g[0]) + JSON.stringify(L.records.season.pts[0]);
  seasonRecordEntries(L, Object.values(L.players).filter(p => p.tid >= 0 && p.stats.gp).map(p => ({ pid: p.id, name: fullName(p), pos: p.pos, abbr: L.teams[p.tid].abbr, s: p.stats })), L.year, 82);
  teamRecordEntries(L, L.teams.map(t => ({ city: t.city, name: t.name, abbr: t.abbr, gp: t.rec.gp, w: t.rec.w, pts: recPts(t.rec), gf: t.rec.gf, ga: t.rec.ga })), L.year);
  const after = JSON.stringify(L.records.season.g[0]) + JSON.stringify(L.records.season.pts[0]);
  if (before !== after) news(L, `A single-season league record fell this year! Check the record book.`, -1);
}
const MILESTONES = { g: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900], pts: [500, 1000, 1500, 2000], w: [100, 200, 300, 400, 500, 600] };
function careerTotals(p) { const t = emptyStats(); p.career.forEach(c => addStats(t, c)); addStats(t, p.stats); return t; }
function milestones(L, res, playoff) {
  if (playoff) return;
  for (const id in res.box) {
    const b = res.box[id]; const p = L.players[id]; if (!p || (!b.g && !b.a && !b.w)) continue;
    const tot = careerTotals(p), prev = { g: tot.g - b.g, pts: pts(tot) - b.g - b.a, w: tot.w - b.w };
    for (const k in MILESTONES) { const now = k === 'pts' ? pts(tot) : tot[k]; for (const m of MILESTONES[k]) if (prev[k] < m && now >= m) news(L, `MILESTONE: ${fullName(p)} (${L.teams[p.tid].abbr}) reached ${m} career ${k === 'g' ? 'goals' : k === 'pts' ? 'points' : 'wins'}!`, p.tid); }
  }
}

// ---------- Franchise leaders ----------
// L.fran[fid] = { pid: [gp, g, a, pim, w, so, name, pos, pm] }
function franAdd(L, fid, pid, name, pos, s) {
  const F = L.fran[fid] || (L.fran[fid] = {});
  const e = F[pid] || (F[pid] = [0, 0, 0, 0, 0, 0, name, pos, 0]);
  e[0] += st(s, 'gp'); e[1] += st(s, 'g'); e[2] += st(s, 'a'); e[3] += st(s, 'pim'); e[4] += st(s, 'w'); e[5] += st(s, 'so'); e[8] += st(s, 'pm');
}
function franTrim(L, keepIds) {
  for (const fid in L.fran) {
    const F = L.fran[fid], keep = new Set();
    const ids = Object.keys(F);
    for (const k of [0, 1, 2, 3, 4, 5]) ids.slice().sort((a, b) => (k === 2 ? F[b][1] + F[b][2] - F[a][1] - F[a][2] : F[b][k] - F[a][k])).slice(0, 12).forEach(id => keep.add(id));
    ids.slice().sort((a, b) => F[b][2] - F[a][2]).slice(0, 12).forEach(id => keep.add(id));
    for (const id of ids) if (!keep.has(id) && !(keepIds && keepIds.has(+id))) delete F[id];
  }
}
function franLeaders(L, fid, k, n) {
  const F = L.fran[fid] || {};
  const val = (e) => k === 'pts' ? e[1] + e[2] : e[{ gp: 0, g: 1, a: 2, pim: 3, w: 4, so: 5, pm: 8 }[k]];
  const live = {}; // add the current season
  for (const t of L.teams) if (t.id === fid) for (const id of t.roster) { const p = L.players[id]; if (p && p.stats.gp) live[id] = p; }
  return Object.entries(F).map(([id, e]) => { const p = live[id]; const ee = p ? e.slice() : e; if (p) { ee[0] += st(p.stats, 'gp'); ee[1] += st(p.stats, 'g'); ee[2] += st(p.stats, 'a'); ee[3] += st(p.stats, 'pim'); ee[4] += st(p.stats, 'w'); ee[5] += st(p.stats, 'so'); } return { pid: +id, name: ee[6], pos: ee[7], v: val(ee) }; })
    .filter(x => x.v > 0 && (k !== 'w' && k !== 'so' ? x.pos !== 'G' || k === 'gp' : x.pos === 'G')).sort((a, b) => b.v - a.v).slice(0, n || 10);
}

// ---------- Hall of Fame ----------
const AW_HOF = { MVP: 14, SCOR: 7, GOAL: 5, BESTG: 10, BESTD: 10, ROY: 2, BDF: 4, PMVP: 6, AS1: 3, MUG: 2 };
function hofScore(tot, awards, pos) {
  let s = awards.reduce((a, x) => a + (AW_HOF[x.k] || 0), 0);
  if (pos === 'G') s += st(tot, 'w') * 0.12 + st(tot, 'so') * 0.25 + st(tot, 'gs') * 0.01;
  else s += pts(tot) * (pos === 'D' ? 0.075 : 0.05) + st(tot, 'g') * 0.025 + st(tot, 'gp') * 0.012;
  return Math.round(s);
}
const HOF_LINE = 85;
function retireRecord(L, p, lastYear) {
  const tot = emptyStats(); const ptot = { gp: 0, g: 0, a: 0, w: 0 };
  p.career.forEach(c => { addStats(tot, c); ptot.gp += c.pgp || 0; ptot.g += c.pg || 0; ptot.a += c.pa || 0; ptot.w += c.pw || 0; });
  const peak = Math.max(p.ovr, ...p.ovrHist.map(h => h.o));
  const score = hofScore(tot, p.awards, p.pos);
  const teams = []; p.career.forEach(c => { if (c.tm && !teams.includes(c.tm)) teams.push(c.tm); });
  const notable = p.awards.length > 0 || tot.gp >= 500 || pts(tot) >= 300 || tot.w >= 120 || peak >= 85;
  if (!notable) return null;
  const r = { pid: p.id, name: fullName(p), pos: p.pos, nat: p.nat, from: p.career.length ? p.career[0].year : lastYear, to: lastYear, seasons: p.career.length, tot: compactStats(tot), ptot, awards: p.awards.slice(), teams, peak, score, hof: false, skin: p.skin, fn: p.fn, ln: p.ln, id: p.id };
  if (score >= 45) r.career = p.career.slice();
  L.retired.push(r);
  return r;
}
function retireChance(p) {
  const pk = PEAK[p.pos][1] + (p.gen ? GEN_PEAK_BONUS : 0);
  let c = 0;
  if (p.age >= 41) c = 0.9; else if (p.age >= pk + 6) c = 0.55; else if (p.age >= pk + 4) c = 0.28; else if (p.age > pk + 1) c = 0.08;
  if (p.ovr < 56 && p.age >= 28) c += 0.3;
  if (p.ovr >= 84) c *= 0.5;
  if (p.tid === -1 && p.age >= 30) c += 0.25;
  return clamp(c, 0, 0.97);
}
// Committee: anyone eligible (retired 3+ seasons) clearly over the line gets in. The user votes on the others.
function hofBallot(L) { return L.retired.filter(r => !r.hof && L.year - r.to >= 3 && L.year - r.to <= 18 && r.score >= HOF_LINE * 0.7).sort((a, b) => b.score - a.score).slice(0, 12); }
function hofInduct(L, r, year) { r.hof = true; r.hofYear = year; L.hof.push(r.pid); }
function hofCommittee(L, year) { for (const r of L.retired) if (!r.hof && year - r.to >= 3 && r.score >= HOF_LINE) hofInduct(L, r, year); }

// ---------- Offseason ----------
function pushCareerLine(L, p, season, abbr) {
  if (!(p.stats.gp > 0 || p.pstats.gp > 0)) return;
  const c = compactStats(p.stats); c.year = season; c.tm = abbr; c.ovr = p.ovr;
  if (p.pstats.gp) { c.pgp = p.pstats.gp; c.pg = p.pstats.g; c.pa = p.pstats.a; if (p.pos === 'G') { c.pw = p.pstats.w; c.psa = p.pstats.sa; c.pga = p.pstats.ga; } }
  p.career.push(c);
}
function runOffseason(L) {
  const season = L.year;
  if (!L.hofVoted || L.hofVoted !== season) hofCommittee(L, season + 1);
  if (typeof opsSeasonEnd === 'function') opsSeasonEnd(L);
  if (typeof moraleOffseason === 'function') moraleOffseason(L);
  for (const t of L.teams) {
    t.history.push({ year: season, abbr: t.abbr, city: t.city, name: t.name, gp: t.rec.gp, w: t.rec.w, l: t.rec.l, otl: t.rec.otl, t: 0, pts: recPts(t.rec), gf: t.rec.gf, ga: t.rec.ga, result: playoffResult(L, t.id), conf: t.conf, div: t.div });
    t.prevPts = recPts(t.rec);
  }
  // season snapshot for the history pages
  L.seasons[season] = {
    gp: 82, teams: L.teams.map(t => ({ fid: t.id, abbr: t.abbr, city: t.city, name: t.name, gp: t.rec.gp, w: t.rec.w, l: t.rec.l, t: 0, otl: t.rec.otl, pts: recPts(t.rec), gf: t.rec.gf, ga: t.rec.ga, conf: t.conf, div: t.div })),
    po: L.playoffs ? [0, 1, 2, 3].map(r => L.playoffs.series.filter(s => s.r === r).map(s => ({ hi: s.hi, lo: s.lo, w: s.w.slice(), winner: s.winner }))) : [],
    aw: L.awards[season], lead: seasonLeaders(L),
  };
  if (typeof coachSeasonEnd === 'function') coachSeasonEnd(L);
  for (const p of Object.values(L.players)) {
    if (p.tid === -2) continue;
    if (p.tid >= 0) { franAdd(L, p.tid, p.id, fullName(p), p.pos, p.stats); p.ovrHist.push({ y: season, o: p.ovr }); }
    pushCareerLine(L, p, season, p.tid >= 0 ? L.teams[p.tid].abbr : 'FA');
  }
  franTrim(L, new Set(Object.values(L.players).filter(p => p.tid >= 0).map(p => p.id)));
  // draft order: non-playoff teams by a lottery for the top 2 picks, then reverse standings; playoff teams by round reached
  const order = computeDraftOrder(L);
  L.year++;
  L.flags = {};
  if (typeof bizOffseason === 'function') bizOffseason(L);
  let retiredCount = 0;
  for (const p of Object.values(L.players)) {
    if (p.tid === -2) continue;
    p.age++; p.exp++;
    const d = progressPlayer(p) + (typeof coachDevelop === 'function' ? coachDevelop(L, p) : 0);
    if (p.tid === L.userTeam && Math.abs(d) >= 4) news(L, `${p.pos} ${fullName(p)} ${d > 0 ? 'improved' : 'declined'} ${d > 0 ? '+' : ''}${d} to ${p.ovr} OVR.`, p.tid);
    p.stats = emptyStats(); p.pstats = emptyStats();
    if (p.injury) { p.injury.games -= 40; if (p.injury.games <= 0) { p.injury = null; p.ir = false; } }
    if (R.chance(retireChance(p))) {
      retiredCount++;
      const r = retireRecord(L, p, L.year - 1);
      if (r && (p.tid === L.userTeam || r.score >= 50)) news(L, `${p.pos} ${fullName(p)} retires after ${p.career.length} seasons (${p.pos === 'G' ? r.tot.w + ' wins' : pts(r.tot) + ' points'}).`, p.tid);
      if (p.tid >= 0) { const t = L.teams[p.tid]; t.roster = t.roster.filter(id => id !== p.id); } else L.fa = L.fa.filter(id => id !== p.id);
      delete L.players[p.id];
    }
  }
  for (const t of L.teams) { t.rec = newRec(); t.ts = newTS(); }
  L.schedule = []; L.playoffs = null; L.day = 0;
  // draft (auto scouting spends what's left first)
  if (typeof autoScoutTick === 'function') autoScoutTick(L, 0);
  const pool = (L.prospects && L.prospects.length) ? L.prospects.slice() : generateDraftClass(L, 240);
  L.prospects = [];
  const picks = [];
  for (let rd = 1; rd <= 7; rd++) order.forEach((orig, i) => picks.push({ rd, pk: i + 1, ovr: (rd - 1) * 32 + i + 1, tid: typeof getPickOwner === 'function' ? getPickOwner(L, L.year, rd, orig) : orig, orig, pid: null }));
  if (L.pickOwn) delete L.pickOwn[L.year];
  L.draft = { year: L.year, picks, pool: sortBoard(L, pool), cur: 0 };
  L.phase = 'draft';
  gradeSnapshot(L, 'draft');
  news(L, `${retiredCount} players retired. The ${L.year} Draft order is set - ${L.teams[picks[0].tid].abbr} pick first overall.`, L.userTeam);
}
function seasonLeaders(L) {
  const sk = Object.values(L.players).filter(p => p.tid >= 0 && p.pos !== 'G' && p.stats.gp);
  const gs = Object.values(L.players).filter(p => p.tid >= 0 && p.pos === 'G' && p.stats.gs >= 25);
  const e = (p, v) => ({ pid: p.id, name: fullName(p), abbr: L.teams[p.tid].abbr, v });
  return {
    pts: sk.sort((a, b) => pts(b.stats) - pts(a.stats)).slice(0, 5).map(p => e(p, pts(p.stats))),
    g: sk.sort((a, b) => b.stats.g - a.stats.g).slice(0, 5).map(p => e(p, p.stats.g)),
    a: sk.sort((a, b) => b.stats.a - a.stats.a).slice(0, 5).map(p => e(p, p.stats.a)),
    w: gs.sort((a, b) => b.stats.w - a.stats.w).slice(0, 5).map(p => e(p, p.stats.w)),
    sv: gs.sort((a, b) => svPct(b.stats) - svPct(a.stats)).slice(0, 5).map(p => e(p, fmtSv(svPct(p.stats)))),
  };
}
function computeDraftOrder(L) {
  const inP = new Set(L.playoffs ? L.playoffs.series.flatMap(s => [s.hi, s.lo]) : []);
  const non = L.teams.filter(t => !inP.has(t.id)).sort((a, b) => -cmpTeams(a, b));
  // lottery: two draws for the top picks, weighted toward the worst teams; a team can move up at most 10 spots
  const odds = [18.5, 13.5, 11.5, 9.5, 8.5, 7.5, 6.5, 6, 5, 3.5, 3, 2.5, 2, 1.5, 0.5, 0.5];
  const lot = non.map((t, i) => ({ t, w: odds[i] || 0.5, i }));
  const winners = [];
  for (let k = 0; k < 2; k++) { const pool = lot.filter(x => !winners.includes(x) && x.i - k <= 10); if (!pool.length) break; winners.push(R.weighted(pool, x => x.w)); }
  const rest = non.filter(t => !winners.some(w => w.t === t));
  const nonOrder = [...winners.map(w => w.t), ...rest];
  if (winners[0] && winners[0].i > 0) news(L, `DRAFT LOTTERY: The ${winners[0].t.city} ${winners[0].t.name} jump from #${winners[0].i + 1} to win the first overall pick!`, winners[0].t.id);
  L.lottery = { year: L.year + 1, winners: winners.map(w => ({ tid: w.t.id, from: w.i + 1 })) };
  const P = L.playoffs;
  const elim = (tid) => { if (!P) return 0; if (P.champion === tid) return 5; const s = P.series.filter(x => (x.hi === tid || x.lo === tid)); return Math.max(...s.map(x => x.r)) + (s.some(x => x.winner === tid && x.r === 3) ? 2 : 1); };
  const po = L.teams.filter(t => inP.has(t.id)).sort((a, b) => elim(a.id) - elim(b.id) || -cmpTeams(a, b));
  return [...nonOrder, ...po].map(t => t.id);
}

// ---------- Draft ----------
const CLASS_SHIFT = { weak: -3, avg: 0, strong: 3 };
function generateDraftClass(L, n) {
  const ids = [];
  const overall = R.weighted(['weak', 'avg', 'strong'], x => x === 'avg' ? 0.6 : 0.2);
  L.classProfile = { year: L.phase === 'draft' ? L.year : L.year + 1, overall };
  for (let i = 0; i < n; i++) {
    const pos = R.weighted(POSITIONS, ps => POS_DRAFT_W[ps]);
    const q = Math.pow(Math.random(), 2.4);
    const age = R.chance(0.7) ? 18 : 19;
    const p = createPlayer(L, pos, 38 + q * 30 + CLASS_SHIFT[overall] * (0.4 + q) + R.gauss(0, 2), age);
    p.tid = -2; p.exp = 0;
    p.pot = clamp(Math.round(p.ovr + R.rand(8, 24) + q * 10 + (age === 18 ? 3 : 0)), p.ovr, 99);
    if (pos === 'G') p.pot = clamp(p.pot - 2, p.ovr, 99);
    p.sc = 0; p.errO = R.gauss(0, 1); p.errP = R.gauss(0, 1);
    updateScout(p);
    L.players[p.id] = p; ids.push(p.id);
  }
  const nGen = R.chance(overall === 'strong' ? 0.4 : overall === 'weak' ? 0.12 : 0.25) ? 1 : 0;
  for (let i = 0; i < nGen; i++) {
    const pos = R.weighted(['C', 'C', 'LW', 'RW', 'D', 'D', 'G'], () => 1);
    const p = createPlayer(L, pos, R.rand(72, 78), 18); p.tid = -2; p.exp = 0; p.gen = true; p.pot = R.int(96, 99); p.sc = 0; p.errO = R.gauss(0, 0.4); p.errP = R.gauss(0, 0.3); updateScout(p);
    L.players[p.id] = p; ids.push(p.id);
  }
  return sortBoard(L, ids);
}
// scouting fog: your view = truth + error * spread[level]
const SCOUT_SPREAD = [[7, 10], [4.5, 6.5], [2.5, 3.5], [1, 1.5]];
function updateScout(p) {
  const lv = clamp(p.sc || 0, 0, 3), sp = SCOUT_SPREAD[lv];
  p.sOvr = clamp(Math.round(p.ovr + p.errO * sp[0]), 25, 99);
  p.sPot = clamp(Math.round(p.pot + p.errP * sp[1]), p.sOvr, 99);
}
function scoutPlayer(L, p) {
  if ((p.sc || 0) >= 3) return 'Already fully scouted.';
  const cost = [2, 3, 5][p.sc || 0];
  if (L.scoutPts < cost) return `Need ${cost} scouting points.`;
  L.scoutPts -= cost; p.sc = (p.sc || 0) + 1; updateScout(p); return null;
}
function sortBoard(L, ids) { return ids.sort((a, b) => { const A = L.players[a], B = L.players[b]; return (B.sPot * 0.6 + B.sOvr * 0.4) - (A.sPot * 0.6 + A.sOvr * 0.4); }); }
function scoutDay(L) { if (L.phase === 'regular' && L.day % 14 === 0) { L.scoutPts += 3; if (typeof autoScoutTick === 'function') autoScoutTick(L, 10); } }
function draftPlayer(L, pid) {
  const D = L.draft, pick = D.picks[D.cur], p = L.players[pid], team = L.teams[pick.tid];
  p.tid = team.id; p.farm = true; team.roster.push(p.id);
  p.draft = { year: D.year, rd: pick.rd, pk: pick.pk, ovr: pick.ovr, tid: team.id, abbr: team.abbr };
  p.contract = { sal: elcSalary(L, pick.ovr), exp: D.year + 2, elc: true };
  pick.proj = p.sOvr; pick.projPot = p.sPot;
  p.sc = 3; delete p.errO; delete p.errP;
  D.pool = D.pool.filter(id => id !== pid);
  pick.pid = pid; pick.name = fullName(p); pick.pos = p.pos; pick.pOvr = p.ovr; pick.pPot = p.pot; pick.nat = p.nat;
  D.cur++;
  if (pick.rd === 1 && pick.pk <= 3 || team.id === L.userTeam) news(L, `Draft R${pick.rd} #${pick.ovr}: ${team.abbr} select ${p.pos} ${fullName(p)} (${p.nat}, ${p.college}).`, team.id);
}
function aiDraftPick(L) {
  const D = L.draft, pick = D.picks[D.cur], team = L.teams[pick.tid];
  if (team.id === L.userTeam && typeof userAutoPick === 'function') { const up = userAutoPick(L); if (up) { draftPlayer(L, up.id); return; } }
  const dn = draftNeeds(L, team), need = {};
  for (const ps of POSITIONS) need[ps] = clamp((dn[ps] - 5) * 0.8, -1.5, 4);
  let best = null, bv = -1e9;
  for (const pid of D.pool.slice(0, 60)) {
    const p = L.players[pid];
    const o = p.ovr + R.gauss(0, 4), pt = p.pot + R.gauss(0, 5);
    const v = pt * 0.65 + o * 0.35 + need[p.pos] + (p.pos === 'G' ? -2 : 0) + R.gauss(0, 1.5);
    if (v > bv) { bv = v; best = p; }
  }
  draftPlayer(L, best.id);
}
function draftDone(L) { return !L.draft || L.draft.cur >= L.draft.picks.length; }
function simDraftToUser(L) { while (!draftDone(L) && L.draft.picks[L.draft.cur].tid !== L.userTeam) aiDraftPick(L); }
function simDraftAll(L) { while (!draftDone(L)) aiDraftPick(L); }
function finishDraft(L) {
  simDraftAll(L);
  const D = L.draft;
  L.draftHistory[D.year] = D.picks.map(p => ({ ovr: p.ovr, rd: p.rd, pk: p.pk, tid: p.tid, name: p.name, pos: p.pos, pid: p.pid, nat: p.nat }));
  D.pool.forEach((pid, i) => { const p = L.players[pid]; if (i < 40) { p.tid = -1; p.sc = 3; L.fa.push(pid); } else delete L.players[pid]; });
  L.draft = null;
  for (const t of L.teams) { const f = farmRoster(L, t).sort((a, b) => playerValue(a) - playerValue(b)); while (f.length > FARM_LIMIT) releasePlayer(L, f.shift(), true); }
  computeDraftGrades(L, D);
  gradeSnapshot(L, 'fa');
  L.phase = 'resign';
  if (typeof startResign === 'function') startResign(L);
  news(L, `The ${D.year} Draft is complete. Draftees report to your farm team. Re-sign your expiring players before free agency opens.`, L.userTeam);
}
function startSeason(L) {
  const u = L.teams[L.userTeam];
  if (activeRoster(L, u).length > ROSTER_LIMIT) return `Your active roster has ${activeRoster(L, u).length} players. Send players to the farm or release them to get down to ${ROSTER_LIMIT}.`;
  const cnt = posCounts(activeRoster(L, u).filter(p => !p.injury));
  if (cnt.G < 2) return 'You need two healthy goaltenders on the active roster.';
  if (cnt.D < 6) return 'You need at least six healthy defensemen on the active roster.';
  if (cnt.C + cnt.LW + cnt.RW < 12) return 'You need at least twelve healthy forwards on the active roster.';
  if (payroll(L, u) > L.cap) return `You are ${fmtM(payroll(L, u) - L.cap)} over the ${fmtM(L.cap)} salary cap.`;
  for (const t of L.teams) if (t.id !== L.userTeam) { aiCapComply(L, t); aiManageRoster(L, t); }
  L.schedule = makeSchedule(L);
  L.day = 1; L.phase = 'regular';
  if (typeof coachSeasonStart === 'function') coachSeasonStart(L);
  if (typeof opsSeasonStart === 'function') opsSeasonStart(L);
  L.prospects = generateDraftClass(L, 240);
  L.scoutPts = (L.scoutPts || 0) + 20;
  news(L, `The ${seasonLabel(L.year)} regular season begins! ${L.lastDay} game days, trade deadline after day ${L.deadlineDay}.`, L.userTeam);
  return null;
}
function nextPhaseFromPost(L) { runOffseason(L); }

// ---------- Save / Load ----------
// Saves live in IndexedDB. localStorage is only a fallback: every GitHub Pages site on the same
// account shares one origin and one ~5 MB localStorage quota, so other games' saves can fill it.
// The save string is cached in memory so the save API stays synchronous for callers.
const SaveStore = (() => {
  const DB = 'phl_gm', OS = 'saves';
  let db = null, cache = null, writing = false, pending = null;
  const S = { onError: null };
  function openDB() {
    return new Promise((res) => {
      try {
        if (typeof indexedDB === 'undefined') return res(null);
        const rq = indexedDB.open(DB, 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore(OS);
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => res(null);
        rq.onblocked = () => res(null);
      } catch (e) { res(null); }
    });
  }
  function req(mode, fn) {
    return new Promise((res, rej) => {
      const tx = db.transaction(OS, mode), r = fn(tx.objectStore(OS));
      tx.oncomplete = () => res(r.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  }
  function lsGet() { try { return localStorage.getItem(SAVE_KEY); } catch (e) { return null; } }
  function lsSet(v) { try { localStorage.setItem(SAVE_KEY, v); return true; } catch (e) { return false; } }
  function lsDel() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* */ } }
  S.init = async function () {
    db = await openDB();
    if (db) {
      try { cache = (await req('readonly', s => s.get(SAVE_KEY))) || null; } catch (e) { cache = null; }
      const old = lsGet();
      if (!cache && old) { // migrate an old localStorage save, then free the shared quota
        try { await req('readwrite', s => s.put(old, SAVE_KEY)); cache = old; lsDel(); } catch (e) { cache = old; }
      } else if (cache && old) lsDel();
    } else cache = lsGet();
  };
  async function flush() {
    if (writing) return; writing = true;
    while (pending !== null) {
      const v = pending; pending = null;
      let ok = false;
      if (db) { try { await req('readwrite', s => v === '' ? s.delete(SAVE_KEY) : s.put(v, SAVE_KEY)); ok = true; } catch (e) { console.error('IndexedDB save failed', e); } }
      if (!ok && v !== '') ok = lsSet(v);
      if (!ok && v !== '' && S.onError) S.onError();
    }
    writing = false;
  }
  S.get = () => cache;
  S.set = (v) => { cache = v; pending = v; flush(); return true; };
  S.del = () => { cache = null; pending = ''; lsDel(); flush(); };
  return S;
})();
function serializeLeague(L) {
  return JSON.stringify(L, function (k, v) {
    if ((k === 'stats' || k === 'pstats') && v && typeof v === 'object' && 'ixg' in v) return compactStats(v);
    return v;
  });
}
function saveLeague(L) {
  try {
    const raw = serializeLeague(L);
    const data = typeof LZString !== 'undefined' ? 'LZ1:' + LZString.compressToUTF16(raw) : raw;
    return SaveStore.set(data);
  } catch (e) { console.error('save failed', e); return false; }
}
function loadLeague() {
  try {
    let s = SaveStore.get(); if (!s) return null;
    if (s.startsWith('LZ1:')) s = LZString.decompressFromUTF16(s.slice(4));
    const L = JSON.parse(s); if (!L || L.version !== 1) return null;
    for (const id in L.players) { const p = L.players[id]; p.stats = Object.assign(emptyStats(), p.stats); p.pstats = Object.assign(emptyStats(), p.pstats); }
    if (typeof migrateOps === 'function') migrateOps(L);
    if (typeof migrateCoaches === 'function') migrateCoaches(L);
    if (typeof autoGM === 'function') autoGM(L);
    return L;
  } catch (e) { console.error(e); return null; }
}
function hasSave() { return !!SaveStore.get(); }
function deleteSave() { SaveStore.del(); }
function saveSize() { return (SaveStore.get() || '').length; }
