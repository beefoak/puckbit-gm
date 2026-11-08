'use strict';
// ================= Coaching staffs =================
// Head coach (HC), associate coach running the offense and power play (AC), assistant running the
// defense and penalty kill (DC) and a goalie coach (GC). Systems shape how a team plays; quirks
// grow or fade over a career. After each season the carousel fires, retires and hires.
const COACH_ROLES = ['HC', 'AC', 'DC', 'GC'];
const cOrd = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const ROLE_NAMES = { HC: 'HEAD COACH', AC: 'ASSOCIATE COACH (OFFENSE / PP)', DC: 'ASSISTANT COACH (DEFENSE / PK)', GC: 'GOALIE COACH' };
const COACH_RATINGS = [['off', 'OFFENSE'], ['def', 'DEFENSE'], ['dev', 'DEVELOPMENT'], ['mot', 'MOTIVATION'], ['gm', 'GAME MGMT'], ['gk', 'GOALTENDING']];
const OFF_STYLES = {
  'RUN & GUN': { blurb: 'Stretch passes and odd-man rushes: more chances both ways.', off: 2.5, def: -1.5, aggr: 0.6 },
  'CYCLE GAME': { blurb: 'Grind it down low and wear out the defense. Steady pressure.', off: 1.2, def: 0.3, aggr: 0.2 },
  'DUMP & CHASE': { blurb: 'Get it deep and hunt it down. Physical, safe, low event.', off: 0.4, def: 1, aggr: 0.5 },
  'PUCK POSSESSION': { blurb: 'Hold onto it, make the extra pass, outshoot everyone.', off: 1.8, def: 0.6, aggr: -0.2 },
  'BALANCED': { blurb: 'No weaknesses, no extremes.', off: 1, def: 0.5, aggr: 0 },
};
const DEF_STYLES = {
  'NEUTRAL ZONE TRAP': { blurb: 'Clog the middle and kill the game. Fewer goals both ways.', off: -1.2, def: 2.4, aggr: -0.4 },
  'AGGRESSIVE FORECHECK': { blurb: 'Pressure all over the ice: turnovers, hits and penalties.', off: 1, def: 0.6, aggr: 0.8 },
  'COLLAPSE & BLOCK': { blurb: 'Protect the house and block everything.', off: -0.4, def: 1.8, aggr: -0.2 },
  '1-3-1': { blurb: 'A patient structure that takes away the middle.', off: 0, def: 1.4, aggr: 0 },
  'MAN-TO-MAN': { blurb: 'Tight coverage everywhere. Brilliant or a mess.', off: 0.3, def: 1.2, aggr: 0.3 },
};
const QUIRKS = {
  gambler: { name: 'Gambler', blurb: 'Pulls the goalie early and rolls the dice.' },
  matchup: { name: 'Matchup Guru', blurb: 'Gets the right lines out: a small edge every game.' },
  players: { name: "Players' Coach", blurb: 'Players love him: steady morale boost.' },
  disciplinarian: { name: 'Disciplinarian', blurb: 'Fewer penalties, a small drain on morale.' },
  ppwizard: { name: 'Power Play Wizard', blurb: 'His power play is a weapon.' },
  pkspecialist: { name: 'PK Specialist', blurb: 'His penalty kill frustrates everyone.' },
  teacher: { name: 'Teacher', blurb: 'Young players develop faster.' },
  biggame: { name: 'Big-Game Coach', blurb: 'His teams play better in the playoffs.' },
  bigname: { name: 'Big Name', blurb: 'His reputation grows quickly - other teams notice.' },
  oldschool: { name: 'Old School', neg: true, blurb: 'Loves fighters and grinders; takes more penalties.' },
  hothead: { name: 'Hothead', neg: true, blurb: 'Blows up at players during losing streaks.' },
  stubborn: { name: 'Stubborn', neg: true, blurb: 'Refuses to change his system.' },
};
const QUIRK_CLASH = { players: 'hothead', hothead: 'players', disciplinarian: 'oldschool', oldschool: 'disciplinarian' };

function makeCoach(L, role, q, age) {
  L.nextCid = (L.nextCid || 0) + 1;
  q = q === undefined ? clamp(R.gauss(62, 8), 40, 90) : q;
  age = age === undefined ? R.int(36, 62) : age;
  const side = role === 'AC' ? 'off' : role === 'DC' ? 'def' : R.chance(0.5) ? 'off' : 'def';
  const r = (b) => Math.round(clamp(b + R.gauss(0, 5), 25, 97));
  const [fn, ln] = rollName(R.weighted(['CAN', 'USA', 'SWE', 'FIN', 'CZE', 'RUS'], k => ({ CAN: 6, USA: 3, SWE: 0.6, FIN: 0.5, CZE: 0.3, RUS: 0.3 })[k]), 1970);
  const c = {
    id: 'c' + L.nextCid, fn, ln, age, skin: R.weighted([0, 1, 2, 3], i => [6, 3, 0.6, 0.4][i]), role, tid: -1, side,
    off: r(side === 'off' ? q + 4 : q - 12), def: r(side === 'def' ? q + 4 : q - 12), dev: r(q - 4), mot: r(q - 2), gm: r(role === 'HC' ? q : q - 8), gk: r(role === 'GC' ? q + 6 : q - 22),
    offStyle: R.pick(Object.keys(OFF_STYLES)), defStyle: R.pick(Object.keys(DEF_STYLES)),
    quirks: {}, rep: Math.round(clamp(q - 12 + R.gauss(0, 6), 5, 90)), hist: [], contract: null, clinic: 0, titles: 0, cw: 0, cl: 0, ct: 0,
  };
  c.pot = Math.round(clamp(Math.max(c.off, c.def, role === 'GC' ? c.gk : 0) + (age < 45 ? R.int(4, 14) : R.int(0, 5)), 50, 99));
  const keys = Object.keys(QUIRKS);
  for (let i = 0, n = R.chance(0.35) ? 2 : 1; i < n; i++) addQuirk(c, R.pick(keys), R.int(1, 2));
  L.coaches[c.id] = c;
  return c;
}
function addQuirk(c, k, lvl) { if (QUIRK_CLASH[k] && c.quirks[QUIRK_CLASH[k]]) return; c.quirks[k] = clamp(lvl, 1, 3); }
function qLvl(c, k) { return c && c.quirks ? c.quirks[k] || 0 : 0; }
function coachOvr(c, role) {
  role = role || c.role;
  if (role === 'AC') return Math.round(c.off * 0.75 + c.dev * 0.15 + c.mot * 0.1);
  if (role === 'DC') return Math.round(c.def * 0.75 + c.dev * 0.15 + c.mot * 0.1);
  if (role === 'GC') return Math.round(c.gk * 0.8 + c.dev * 0.2);
  return Math.round(Math.max(c.off, c.def) * 0.3 + Math.min(c.off, c.def) * 0.15 + c.dev * 0.15 + c.mot * 0.2 + c.gm * 0.2);
}
function coachAsk(c, role) {
  const o = coachOvr(c, role), base = role === 'HC' ? 1 + Math.max(0, o - 50) * 0.12 : role === 'GC' ? 0.3 + Math.max(0, o - 50) * 0.025 : 0.4 + Math.max(0, o - 50) * 0.04;
  return Math.round((base * (1 + c.rep / 400)) * 20) / 20;
}
function coachName(c) { return c ? c.fn + ' ' + c.ln : 'Vacant'; }
function staffOf(L, tid) { const s = L.teams[tid].staff || {}; return { HC: L.coaches[s.HC], AC: L.coaches[s.AC], DC: L.coaches[s.DC], GC: L.coaches[s.GC] }; }
function assignCoach(L, c, tid, role, yrs) {
  const t = L.teams[tid];
  L.coachPool = L.coachPool.filter(id => id !== c.id);
  c.tid = tid; c.role = role; t.staff[role] = c.id;
  c.contract = { sal: coachAsk(c, role), exp: L.year + (yrs || (role === 'HC' ? 3 : 2)) };
}
function releaseCoach(L, c) {
  if (c.tid >= 0) { const t = L.teams[c.tid]; for (const r of COACH_ROLES) if (t.staff[r] === c.id) t.staff[r] = null; }
  c.tid = -1; c.contract = null;
  if (!L.coachPool.includes(c.id)) L.coachPool.push(c.id);
}
function initCoaches(L) {
  L.coaches = {}; L.coachPool = []; L.carousel = null;
  for (const t of L.teams) {
    t.staff = { HC: null, AC: null, DC: null, GC: null };
    for (const role of COACH_ROLES) {
      const c = makeCoach(L, role, clamp(R.gauss(role === 'HC' ? 66 : 62, 7), 45, 90), role === 'HC' ? R.int(40, 66) : R.int(34, 62));
      assignCoach(L, c, t.id, role, R.int(0, 3));
      if (role === 'HC') { const yrs = R.int(0, 6); c.cw = Math.round(yrs * R.rand(30, 48)); c.cl = yrs * 82 - c.cw; }
    }
  }
  refillCoachPool(L);
}
function migrateCoaches(L) {
  if (!L.coaches) initCoaches(L);
  L.coachPool = L.coachPool || [];
  for (const t of L.teams) t.staff = t.staff || { HC: null, AC: null, DC: null, GC: null };
}
function refillCoachPool(L) {
  const live = L.coachPool.filter(id => L.coaches[id]); L.coachPool = live;
  const need = { HC: 8, AC: 10, DC: 10, GC: 8 };
  for (const id of live) need[L.coaches[id].role] = (need[L.coaches[id].role] || 0) - 1;
  for (const role of COACH_ROLES) for (let i = 0; i < need[role]; i++) {
    const young = R.chance(0.7);
    const c = makeCoach(L, role, clamp(R.gauss(young ? 57 : 62, 7), 40, 82), young ? R.int(31, 46) : R.int(47, 63));
    L.coachPool.push(c.id);
  }
}

// ---------- in-game effects (rating points added to the whole lineup) ----------
const NO_COACH = { off: 52, def: 52, dev: 50, mot: 50, gm: 50, gk: 50, quirks: {}, offStyle: 'BALANCED', defStyle: '1-3-1' };
function coachMods(L, team, playoff) {
  const s = team.staff || {}, C = L.coaches || {};
  const hc = C[s.HC] || NO_COACH, ac = C[s.AC] || NO_COACH, dc = C[s.DC] || NO_COACH, gc = C[s.GC] || NO_COACH;
  const os = OFF_STYLES[ac.offStyle] || OFF_STYLES.BALANCED, ds = DEF_STYLES[dc.defStyle] || DEF_STYLES['1-3-1'];
  const m = {
    off: (ac.off * 0.7 + hc.off * 0.3 - 65) * 0.06 + os.off + ds.off - 1,
    def: (dc.def * 0.7 + hc.def * 0.3 - 65) * 0.06 + os.def + ds.def - 1,
    gk: (gc.gk - 62) * 0.05,
    disc: qLvl(hc, 'disciplinarian') * 3 - qLvl(hc, 'oldschool') * 3,
    fo: qLvl(hc, 'matchup') * 0.6,
    pullEarly: qLvl(hc, 'gambler') * 25 + (hc.gm - 60) * 0.4,
    aggr: os.aggr + ds.aggr + qLvl(hc, 'oldschool') * 0.3,
  };
  m.off += qLvl(ac, 'ppwizard') * 0.5 + qLvl(hc, 'matchup') * 0.3; m.def += qLvl(dc, 'pkspecialist') * 0.5 + qLvl(hc, 'matchup') * 0.3;
  m.off -= qLvl(ac, 'stubborn') * 0.3; m.def -= qLvl(dc, 'stubborn') * 0.3;
  if (playoff) { const b = qLvl(hc, 'biggame') * 0.8 + (hc.mot - 65) * 0.03; m.off += b; m.def += b; }
  return m;
}
function coachMoraleWeek(L) {
  if (!L.coaches || typeof bumpTeamMorale !== 'function') return;
  for (const t of L.teams) {
    const hc = L.coaches[t.staff && t.staff.HC]; if (!hc) continue;
    let d = (hc.mot - 70) * 0.012 + qLvl(hc, 'players') * 0.15 - qLvl(hc, 'disciplinarian') * 0.08;
    if (qLvl(hc, 'hothead') && (t.rec.strk || 0) <= -3) d -= qLvl(hc, 'hothead') * 0.5;
    if (Math.abs(d) >= 0.05) bumpTeamMorale(L, t.id, d, t.id === L.userTeam && L.day % 28 === 14 && Math.abs(d) >= 0.3 ? (d > 0 ? `Plays hard for coach ${hc.ln}` : `Tired of coach ${hc.ln}`) : null);
  }
  if (L.ops && L.phase === 'regular' && typeof opsSpend === 'function') opsSpend(L, staffPayroll(L, L.userTeam) / 26, 'coaching');
}
function staffPayroll(L, tid) { const s = staffOf(L, tid); return COACH_ROLES.reduce((a, r) => a + (s[r] && s[r].contract ? s[r].contract.sal : 0), 0); }
function coachDevelop(L, p) {
  if (!L.coaches || p.tid < 0 || p.age > 27) return 0;
  const s = staffOf(L, p.tid), hc = s.HC || NO_COACH;
  const co = (p.pos === 'G' ? s.GC : p.pos === 'D' ? s.DC : s.AC) || NO_COACH;
  let b = (hc.dev * 0.4 + co.dev * 0.6 - 65) * 0.05 + (qLvl(hc, 'teacher') + qLvl(co, 'teacher')) * 0.4;
  if (p.pos === 'G') b += (co.gk - 65) * 0.04;
  b = clamp(b, -1.5, 3);
  if (Math.abs(b) < 0.2) return 0;
  const before = p.ovr;
  for (const k in OVR_WEIGHTS[p.pos]) p.attrs[k] += b * R.rand(0.6, 1.4);
  clampAttrs(p); p.ovr = calcOvr(p); p.pot = Math.max(p.pot, p.ovr);
  return p.ovr - before;
}

// ---------- user actions ----------
function coachHire(L, cid, role) {
  const c = L.coaches[cid], t = L.teams[L.userTeam];
  if (!c || c.tid !== -1) return 'That coach is no longer available.';
  if (t.staff[role]) return `Fire your ${role} first.`;
  assignCoach(L, c, t.id, role);
  news(L, `The ${t.name} hire ${coachName(c)} as ${ROLE_NAMES[role].toLowerCase()} (${fmtM(c.contract.sal)}/yr through ${c.contract.exp}).`, t.id);
  return null;
}
function coachBuyout(L, c) { return c.contract ? Math.round(c.contract.sal * 0.5 * Math.max(1, c.contract.exp - L.year + (L.phase === 'regular' ? 1 : 0)) * 10) / 10 : 0; }
function coachFire(L, role) {
  const t = L.teams[L.userTeam], c = L.coaches[t.staff[role]]; if (!c) return 'No one to fire.';
  if (L.phase === 'playoffs') return 'Not during the playoffs.';
  const cost = coachBuyout(L, c);
  if (L.ops) opsSpend(L, cost, 'coaching');
  releaseCoach(L, c);
  if (typeof bumpTeamMorale === 'function' && role === 'HC') bumpTeamMorale(L, t.id, qLvl(c, 'hothead') ? 2 : qLvl(c, 'players') ? -4 : -1, `Coach ${c.ln} was fired`);
  news(L, `The ${t.name} fired ${role} ${coachName(c)}${cost ? ` (buyout ${fmtM(cost)})` : ''}.`, t.id);
  return null;
}
function coachClinic(L, cid) {
  const c = L.coaches[cid]; if (!c || c.tid !== L.userTeam) return 'Not on your staff.';
  if (c.clinic === L.year) return `${c.ln} already went to a clinic this year.`;
  const cost = c.role === 'HC' ? 0.6 : 0.3;
  if (L.ops && L.ops.cash < cost) return `Not enough operations cash (${fmtM(cost)}).`;
  if (L.ops) opsSpend(L, cost, 'coaching');
  c.clinic = L.year;
  const main = c.role === 'AC' ? ['off'] : c.role === 'DC' ? ['def'] : c.role === 'GC' ? ['gk'] : [c.side, 'gm'];
  const gains = [];
  for (const k of main) { const g = c[k] < c.pot + 2 ? R.int(1, 3) : R.int(0, 1); c[k] = Math.min(99, c[k] + g); if (g) gains.push(`${k.toUpperCase()} +${g}`); }
  const extra = R.pick(['dev', 'mot', 'gm']); if (R.chance(0.6)) { c[extra] = Math.min(99, c[extra] + 1); gains.push(`${extra.toUpperCase()} +1`); }
  const bad = Object.keys(c.quirks).filter(k => QUIRKS[k].neg);
  if (bad.length && R.chance(0.35)) { const k = R.pick(bad); c.quirks[k]--; if (!c.quirks[k]) delete c.quirks[k]; gains.push(`worked on being ${QUIRKS[k].name.toLowerCase()}`); }
  return `${coachName(c)} came back from the clinic: ${gains.join(', ') || 'no real change'}.`;
}
function coachSetStyle(L, role, style) {
  const c = staffOf(L, L.userTeam)[role]; if (!c) return 'No coach in that role.';
  if (['regular', 'playoffs'].includes(L.phase)) return 'Systems can only be changed in the offseason.';
  if (qLvl(c, 'stubborn')) return `${coachName(c)} is stubborn and refuses to change his system.`;
  if (role === 'AC' && OFF_STYLES[style]) c.offStyle = style;
  else if (role === 'DC' && DEF_STYLES[style]) c.defStyle = style;
  return null;
}
function coachSeasonStart(L) {
  if (!L.coaches) return;
  const t = L.teams[L.userTeam];
  for (const role of COACH_ROLES) if (!t.staff[role]) {
    const c = L.coachPool.map(id => L.coaches[id]).sort((a, b) => coachOvr(b, role) / coachAsk(b, role) - coachOvr(a, role) / coachAsk(a, role))[0];
    if (c) { assignCoach(L, c, t.id, role, 1); news(L, `With no ${role} hired, the team promoted ${coachName(c)} on a 1-year deal.`, t.id); }
  }
}

// ---------- the carousel ----------
function coachGrow(L, c) {
  c.age++;
  const keys = c.role === 'AC' ? ['off'] : c.role === 'DC' ? ['def'] : c.role === 'GC' ? ['gk'] : [c.side, 'gm'];
  const good = c.lastPerf && (c.lastPerf.wp >= 0.6 || c.lastPerf.champ || (c.role === 'AC' && c.lastPerf.off <= 8) || (c.role === 'DC' && c.lastPerf.def <= 8));
  for (const k of [...keys, 'dev', 'mot']) {
    let d = c.age < 50 ? R.gauss(0.8, 1) : c.age > 62 ? -R.rand(0, 1.5) : R.gauss(0.2, 0.8);
    if (good) d += 0.5;
    if (d > 0 && c[k] >= c.pot) d *= 0.2;
    c[k] = Math.round(clamp(c[k] + d, 25, 99));
  }
  for (const k of Object.keys(c.quirks)) {
    if (QUIRKS[k].neg) { if (R.chance(0.12 + (good ? 0.08 : 0) + (c.age > 50 ? 0.06 : 0))) { c.quirks[k]--; if (!c.quirks[k]) delete c.quirks[k]; } }
    else if (good && c.quirks[k] < 3 && R.chance(0.25)) c.quirks[k]++;
  }
  if (R.chance(0.07)) { const k = R.pick(Object.keys(QUIRKS)); if (!c.quirks[k]) addQuirk(c, k, 1); }
}
function coachSeasonEnd(L) {
  if (!L.coaches) return;
  const season = L.year, moves = [], u = L.userTeam;
  const log = (type, text, tids) => moves.push({ type, text, tids: tids || [] });
  const byGf = L.teams.slice().sort((a, b) => b.rec.gf - a.rec.gf).map(t => t.id), byGa = L.teams.slice().sort((a, b) => a.rec.ga - b.rec.ga).map(t => t.id);
  const offRk = (tid) => byGf.indexOf(tid) + 1, defRk = (tid) => byGa.indexOf(tid) + 1;
  const champ = L.playoffs ? L.playoffs.champion : -1;
  for (const t of L.teams) for (const role of COACH_ROLES) {
    const c = L.coaches[t.staff[role]]; if (!c) continue;
    const r = t.rec, wp = recPct(r), result = playoffResult(L, t.id);
    c.hist.push({ y: season, tid: t.id, abbr: t.abbr, role, w: r.w, l: r.l, t: r.otl, res: result, off: offRk(t.id), def: defRk(t.id) });
    if (c.hist.length > 40) c.hist.shift();
    if (role === 'HC') { c.cw += r.w; c.cl += r.l; c.ct += r.otl; }
    if (t.id === champ) c.titles++;
    const perf = role === 'HC' ? wp * 100 + (t.id === champ ? 15 : result === 'Missed Playoffs' ? -5 : 5) : role === 'AC' ? (33 - offRk(t.id)) * 3 : role === 'DC' ? (33 - defRk(t.id)) * 3 : (33 - defRk(t.id)) * 2;
    const hot = (role === 'AC' && offRk(t.id) <= 2) || (role === 'DC' && defRk(t.id) <= 2);
    c.rep = Math.round(clamp(c.rep * 0.55 + perf * 0.45 + (t.id === champ ? 12 : 0) + (hot ? 6 : 0) + qLvl(c, 'bigname') * 3, 0, 100));
    c.lastPerf = { wp, off: offRk(t.id), def: defRk(t.id), champ: t.id === champ, hot, result };
  }
  const hcScore = (c) => {
    let s = coachOvr(c, 'HC') * 0.7 + c.rep * 0.45 + R.rand(0, 8) - (c.age > 62 ? 6 : 0);
    const lp = c.lastPerf;
    if (lp && c.role !== 'HC') { if (lp.champ) s += 14; if (lp.hot) s += 7; }
    if (c.role === 'GC') s -= 15;
    return s;
  };
  for (const t of L.teams) {
    if (t.id === u) continue;
    const hc = L.coaches[t.staff.HC];
    if (hc) {
      const wp = recPct(t.rec), tenure = hc.hist.filter(h => h.tid === t.id && h.role === 'HC').length;
      let fire = wp < 0.38 ? 0.7 : wp < 0.45 ? 0.4 : wp < 0.52 && tenure >= 3 ? 0.25 : 0;
      if (tenure <= 1) fire *= 0.4;
      if (hc.lastPerf && hc.lastPerf.champ) fire = 0;
      if (R.chance(fire)) { log('fired', `${t.abbr} fired head coach ${coachName(hc)} after a ${recStr(t.rec)} season.`, [t.id]); releaseCoach(L, hc); }
    }
    for (const role of ['AC', 'DC']) {
      const c = L.coaches[t.staff[role]]; if (!c) continue;
      const rk = role === 'AC' ? offRk(t.id) : defRk(t.id);
      if (rk >= 28 && R.chance(0.3)) { log('fired', `${t.abbr} fired ${role} ${coachName(c)} (${cOrd(rk)} in ${role === 'AC' ? 'goals scored' : 'goals allowed'}).`, [t.id]); releaseCoach(L, c); }
    }
  }
  for (const c of Object.values(L.coaches)) {
    coachGrow(L, c);
    if (c.age >= 66 && R.chance(clamp((c.age - 64) * 0.12, 0, 0.9))) {
      if (c.tid >= 0) log('retired', `${L.teams[c.tid].abbr} ${c.role} ${coachName(c)} retired at ${c.age}${c.titles ? ` with ${c.titles} Mug title${c.titles > 1 ? 's' : ''}` : ''}.`, [c.tid]);
      releaseCoach(L, c); L.coachPool = L.coachPool.filter(id => id !== c.id); delete L.coaches[c.id];
    }
  }
  for (const t of L.teams) for (const role of COACH_ROLES) {
    const c = L.coaches[t.staff[role]]; if (!c || !c.contract || c.contract.exp > season) continue;
    if (t.id === u) { c.contract = { sal: coachAsk(c, role), exp: season + (role === 'HC' ? 3 : 2) }; news(L, `${role} ${coachName(c)} re-signed through ${c.contract.exp} at ${fmtM(c.contract.sal)}/yr.`, u); continue; }
    if (c.rep >= 40 || R.chance(0.5)) c.contract = { sal: coachAsk(c, role), exp: season + R.int(2, 4) };
    else { log('left', `${t.abbr} let ${role} ${coachName(c)} go when his contract ran out.`, [t.id]); releaseCoach(L, c); }
  }
  const open = L.teams.filter(t => t.id !== u && !t.staff.HC).sort((a, b) => recPct(a.rec) - recPct(b.rec));
  for (const t of open) {
    const cands = [...L.coachPool.map(id => L.coaches[id]), ...L.teams.filter(x => x.id !== t.id).flatMap(x => ['AC', 'DC'].map(r => L.coaches[x.staff[r]]))].filter(Boolean);
    const pick = cands.map(c => ({ c, s: hcScore(c) })).sort((a, b) => b.s - a.s)[0]; if (!pick) continue;
    const c = pick.c, from = c.tid, fromRole = c.role;
    if (from >= 0) {
      log(from === u ? 'poached' : 'promoted', `${t.abbr} hired ${L.teams[from].abbr} ${fromRole} ${coachName(c)} as head coach.`, [t.id, from]);
      L.teams[from].staff[fromRole] = null;
      if (from === u) news(L, `Your ${ROLE_NAMES[fromRole].toLowerCase()} ${coachName(c)} left to become head coach of the ${t.city} ${t.name}. Hire a replacement on the COACHES tab.`, u);
    } else log('hired', `${t.abbr} hired ${coachName(c)} as head coach.`, [t.id]);
    assignCoach(L, c, t.id, 'HC', R.int(3, 5));
  }
  for (const t of L.teams) {
    if (t.id === u) continue;
    for (const role of ['AC', 'DC', 'GC']) {
      if (t.staff[role]) continue;
      if (!L.coachPool.length) refillCoachPool(L);
      const c = L.coachPool.map(id => L.coaches[id]).filter(x => x.role === role || role !== 'GC').sort((a, b) => coachOvr(b, role) + R.rand(0, 6) - coachOvr(a, role) - R.rand(0, 6))[0];
      if (c) assignCoach(L, c, t.id, role);
    }
  }
  refillCoachPool(L);
  for (const c of Object.values(L.coaches)) c.lastPerf = null;
  L.carousel = { year: season, moves };
  const mine = moves.filter(m => m.tids.includes(u));
  news(L, `Coaching carousel: ${moves.filter(m => m.type === 'fired').length} firings, ${moves.filter(m => m.type === 'promoted' || m.type === 'poached').length} assistants promoted to head coach.${mine.length ? ' ' + mine.map(m => m.text).join(' ') : ''}`, u);
}
