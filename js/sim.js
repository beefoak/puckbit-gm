'use strict';
// ================= Game engine =================
// A game is simulated beat by beat (2-6 seconds of hockey each): faceoffs, breakouts, zone entries,
// passing in the offensive zone, shots, saves, rebounds, hits, penalties, power plays, line changes,
// pulled goalies, overtime and shootouts. The same engine runs instantly for box scores and step by
// step for the live rink view; when recording, it emits puck keyframes and on-ice units for the renderer.

let SIM_XG = 1.2;
const RK = { L: 200, W: 85, NET: 189, BL: 125 };
function dirOf(side, per) { const h = per % 2 === 1 ? 1 : -1; return side === 0 ? h : -h; }
function toAbs(side, per, u, y) { return dirOf(side, per) > 0 ? [u, y] : [RK.L - u, RK.W - y]; }
const offR = (a) => a.ofi * 0.3 + a.hnd * 0.25 + a.pas * 0.25 + a.spd * 0.2;
const defR = (a) => a.dfi * 0.4 + a.skt * 0.2 + a.chk * 0.15 + a.blk * 0.15 + a.str * 0.1;
const gkR = (a) => a.rfx * 0.35 + a.gpos * 0.35 + a.glv * 0.15 + a.reb * 0.15;
const shotR = (a) => a.sht * 0.7 + a.shp * 0.3;

// Where each slot wants to be, in its own team's frame (u = 0 own end boards, 189 = the net it attacks).
// poss: does this team have the puck; pu/py: puck in this team's frame.
function formTarget(role, poss, pu, py) {
  let u, y;
  if (role === 'G') return [13.5, 42.5 + clamp((py - 42.5) * 0.16, -4, 4)];
  if (poss) {
    if (pu >= 125) { const T = { C: [168, 42.5], LW: [160, 17], RW: [160, 68], LD: [134, 20], RD: [134, 65], X: [178, 52] }[role]; u = T[0]; y = T[1]; }
    else if (pu > 75) { const T = { C: [pu + 4, 42.5], LW: [pu + 14, 13], RW: [pu + 14, 72], LD: [pu - 24, 27], RD: [pu - 24, 58], X: [pu + 20, 50] }[role]; u = T[0]; y = T[1]; }
    else { const T = { C: [pu + 16, 42.5], LW: [pu + 32, 11], RW: [pu + 32, 74], LD: [Math.max(pu - 8, 16), 23], RD: [Math.max(pu - 8, 16), 62], X: [pu + 40, 42] }[role]; u = T[0]; y = T[1]; }
    y += (py - 42.5) * 0.18;
  } else {
    if (pu <= 75) { const T = { LD: [22, 31], RD: [22, 54], C: [33, 42.5], LW: [57, 22], RW: [57, 63], X: [40, 42] }[role]; u = T[0]; y = T[1]; u += (pu - 30) * 0.15; y += (py - 42.5) * 0.35; }
    else if (pu < 125) { const T = { LD: [pu - 30, 30], RD: [pu - 30, 55], C: [pu - 9, 42.5], LW: [pu + 2, 20], RW: [pu + 2, 65], X: [pu, 42] }[role]; u = T[0]; y = T[1]; y += (py - 42.5) * 0.25; }
    else { const T = { LD: [128, 24], RD: [128, 61], C: [pu - 14, 42.5], LW: [pu - 4, 22], RW: [pu - 4, 63], X: [pu, 42] }[role]; u = T[0]; y = T[1]; y += (py - 42.5) * 0.3; }
  }
  return [clamp(u, 6, 194), clamp(y, 5, 80)];
}

// ---------- lineups ----------
function healthy(L, ids) { return ids.map(id => L.players[id]).filter(p => p && !p.injury && !p.farm); }
// Auto lines: best players by position; forwards can fill other forward spots with a small penalty.
function autoLines(L, team) {
  const pool = healthy(L, team.roster);
  const used = new Set();
  // natural positions first, then fill any gaps from other positions (forwards before defensemen)
  const take = (pos, n) => { const out = []; for (const p of pool.filter(p => !used.has(p.id) && p.pos === pos).sort((a, b) => b.ovr - a.ovr)) { if (out.length >= n) break; out.push(p.id); used.add(p.id); } return out; };
  const fill = (out, n, alts) => { for (const alt of alts) { if (out.length >= n) break; for (const p of pool.filter(p => !used.has(p.id) && p.pos === alt).sort((a, b) => b.ovr - a.ovr)) { if (out.length >= n) break; out.push(p.id); used.add(p.id); } } return out; };
  const G = take('G', 2);
  const C = take('C', 4), LW = take('LW', 4), RW = take('RW', 4), D = take('D', 6);
  fill(C, 4, ['LW', 'RW', 'D']); fill(LW, 4, ['RW', 'C', 'D']); fill(RW, 4, ['LW', 'C', 'D']); fill(D, 6, ['C', 'LW', 'RW']);
  const F = [0, 1, 2, 3].map(i => [C[i] || 0, LW[i] || 0, RW[i] || 0]);
  const Dp = [0, 1, 2].map(i => [D[i * 2] || 0, D[i * 2 + 1] || 0]);
  const lines = { F, D: Dp, G, PP: [], PK: [] };
  buildSpecial(L, lines);
  return lines;
}
function buildSpecial(L, lines) {
  const P = (id) => L.players[id];
  const fw = lines.F.flat().filter(Boolean), dm = lines.D.flat().filter(Boolean);
  const off = (id) => { const a = P(id).attrs; return offR(a) + shotR(a) * 0.4; };
  const dfn = (id) => { const a = P(id).attrs; return defR(a) + a.dis * 0.1; };
  const fo = fw.slice().sort((a, b) => off(b) - off(a)), do_ = dm.slice().sort((a, b) => off(b) - off(a));
  lines.PP = [[...fo.slice(0, 4), do_[0]], [...fo.slice(4, 7), do_[1], do_[2]]].map(u => u.filter(Boolean));
  const fd = fw.slice().sort((a, b) => dfn(b) - dfn(a)), dd = dm.slice().sort((a, b) => dfn(b) - dfn(a));
  lines.PK = [[fd[0], fd[1], dd[0], dd[1]], [fd[2], fd[3], dd[2], dd[3]]].map(u => u.filter(Boolean));
}
// Lines for a game: the team's saved lines with injured/missing players replaced by the best healthy subs.
function gameLines(L, team, startBackup) {
  const auto = autoLines(L, team);
  let lines = team.lines && team.id === L.userTeam && !L.autoLines ? JSON.parse(JSON.stringify(team.lines)) : auto;
  const ok = (id) => { const p = L.players[id]; return p && !p.injury && !p.farm && p.tid === team.id; };
  const usedAll = new Set([...lines.F.flat(), ...lines.D.flat(), ...lines.G].filter(ok));
  const subs = healthy(L, team.roster).filter(p => !usedAll.has(p.id)).sort((a, b) => b.ovr - a.ovr);
  const sub = (pos) => { let i = subs.findIndex(p => pos === 'G' ? p.pos === 'G' : pos === 'D' ? p.pos === 'D' : FWD.includes(p.pos)); if (i < 0 && pos !== 'G') i = subs.findIndex(p => p.pos !== 'G'); if (i < 0) return 0; return subs.splice(i, 1)[0].id; };
  lines.F = lines.F.map(l => l.map(id => ok(id) ? id : sub('F')));
  lines.D = lines.D.map(l => l.map(id => ok(id) ? id : sub('D')));
  lines.G = [0, 1].map(i => ok(lines.G[i]) ? lines.G[i] : sub('G'));
  if (!lines.G[0]) lines.G[0] = lines.G[1];
  if (!lines.G[0]) { const any = healthy(L, team.roster).find(p => !lines.F.flat().includes(p.id) && !lines.D.flat().includes(p.id)) || healthy(L, team.roster)[0]; lines.G[0] = any ? any.id : team.roster[0]; }
  if (startBackup && lines.G[1]) lines.G = [lines.G[1], lines.G[0]];
  if (!lines.PP || !lines.PP.length || lines.PP.flat().some(id => !ok(id)) || lines.PK.flat().some(id => !ok(id))) buildSpecial(L, lines);
  return lines;
}

// ---------- the game ----------
const PEN_TYPES = [['Tripping', 16], ['Hooking', 14], ['Slashing', 12], ['Holding', 10], ['Interference', 11], ['High-sticking', 8], ['Roughing', 9], ['Cross-checking', 7], ['Delay of game', 5], ['Holding the stick', 3], ['Too many men', 2], ['Unsportsmanlike conduct', 2], ['Elbowing', 2], ['Boarding', 1.5]];

class HockeyGame {
  constructor(L, home, away, opts) {
    opts = opts || {};
    this.L = L; this.tid = [home, away]; this.playoff = !!opts.playoff; this.rec = !!opts.record; this.neutral = !!opts.neutral;
    this.t = 0; this.per = 1; this.perLen = 1200; this.clock = 1200; this.score = [0, 0]; this.done = false; this.ot = false; this.so = null;
    this.frames = []; this.lines = []; this.events = []; this.sogT = []; this.box = {}; this.ts = [this.teamStat(), this.teamStat()];
    this.goals = []; this.pen = [[], []]; this.pulled = [false, false]; this.tac = [{ aggr: 0, pull: 'auto', bench: 0 }, { aggr: 0, pull: 'auto', bench: 0 }];
    this.crowd = opts.crowd || 1; this.ice = opts.ice || 1;
    this.unit = [null, null]; this.skc = [[], []]; this.uOff = [70, 70]; this.uDef = [70, 70]; this.uBlk = [60, 60]; this.uDis = [60, 60]; this.lastStrength = '';
    this.T = [0, 1].map(s => {
      const team = L.teams[this.tid[s]];
      const lines = gameLines(L, team, opts.backup && opts.backup[s]);
      const mods = typeof coachMods === 'function' ? coachMods(L, team, this.playoff) : { off: 0, def: 0, pp: 0, pk: 0, gk: 0, disc: 0, fo: 0, pullEarly: 0, aggr: 0 };
      return { team, lines, mods, fIdx: 0, dIdx: 0, ppIdx: 0, fSince: 0, dSince: 0, fToi: [0, 0, 0, 0], dToi: [0, 0, 0], shiftF: 44, shiftD: 52 };
    });
    this.eff = {};
    for (let s = 0; s < 2; s++) {
      const T = this.T[s], ids = [...T.lines.F.flat(), ...T.lines.D.flat(), ...T.lines.G].filter(Boolean);
      const homeB = s === 0 && !this.neutral ? 1.2 * this.crowd : 0;
      for (const id of new Set(ids)) {
        const p = L.players[id]; const a = { ...p.attrs }; const fx = (typeof moraleFx === 'function' ? moraleFx(p) : 0) + homeB;
        if (fx) for (const k in a) a[k] = clamp(a[k] + fx, 1, 99);
        if (p.pos === 'G') { a.rfx += T.mods.gk; a.gpos += T.mods.gk; }
        a.ofi += T.mods.off; a.dfi += T.mods.def; a.fo += T.mods.fo; a.dis += T.mods.disc;
        this.eff[id] = a;
        this.box[id] = { tid: this.tid[s], ...emptyStats() };
        if (p.pos !== 'G') this.box[id].gp = 1;
      }
    }
    this.g = [this.T[0].lines.G[0], this.T[1].lines.G[0]];
    this.box[this.g[0]].gp = 1; this.box[this.g[0]].gs = 1; this.box[this.g[1]].gp = 1; this.box[this.g[1]].gs = 1;
    this.ph = 'fo'; this.foAt = { s: 0, u: 100, y: 42.5 }; this.poss = 0; this.zone = 'N'; this.carrier = 0; this.chain = []; this.rush = false; this.beat = 0; this.reb = false;
    this.pu = 100; this.py = 42.5;
    this.setUnits(0, true); this.setUnits(1, true);
    this.event(-1, 'per', '1st period');
  }
  teamStat() { return { sog: 0, att: 0, ppo: 0, ppg: 0, pim: 0, hit: 0, blk: 0, fow: 0, gv: 0, tk: 0, xg: 0, pptime: 0, shg: 0, sat: 0 }; }
  P(id) { return this.L.players[id]; }
  A(id) { return this.eff[id]; }
  // ----- manpower -----
  skaters(s) {
    if (this.manK !== this.manKey()) { this.manK = this.manKey(); this.man = [this.skCalc(0), this.skCalc(1)]; }
    return this.man[s];
  }
  manKey() { return this.per * 1000 + this.pen[0].length * 100 + this.pen[1].length * 10 + (this.pulled[0] ? 2 : 0) + (this.pulled[1] ? 1 : 0) + (this.penV || 0) * 10000; }
  skCalc(s) {
    if (this.per > 3 && !this.playoff) { const pk = this.pen[s].filter(x => !x.coinc).length, po = this.pen[1 - s].filter(x => !x.coinc).length; return Math.min(5, 3 + Math.max(0, po - pk)) + (this.pulled[s] ? 1 : 0); }
    return 5 - Math.min(2, this.pen[s].filter(x => !x.coinc).length) + (this.pulled[s] ? 1 : 0);
  }
  strengthKey() { return this.skaters(0) + 'v' + this.skaters(1); }
  boxed(s) { return new Set(this.pen[s].map(x => x.pid)); }
  // ----- units on the ice -----
  setUnits(s, full) {
    const T = this.T[s], me = this.skaters(s), them = this.skaters(1 - s), boxed = this.boxed(s);
    const ok = (id) => id && !boxed.has(id);
    const fill = (ids, n) => { const out = ids.filter(ok).slice(0, n); if (out.length < n) { const extra = [...T.lines.F.flat(), ...T.lines.D.flat()].filter(id => ok(id) && !out.includes(id)); while (out.length < n && extra.length) out.push(extra.shift()); } return out; };
    let ids, roles;
    const n = me - (this.pulled[s] ? 1 : 0);
    const ot3 = this.per > 3 && !this.playoff;
    if (ot3) {
      const k = T.fIdx % 3; const F = T.lines.F[k], D = T.lines.D[k];
      ids = fill([F[0], F[1], D[0], F[2], D[1]], n); roles = ['C', 'LW', 'LD', 'RW', 'RD'].slice(0, n);
    } else if (me > them && me >= 5) {
      const u = T.lines.PP[T.ppIdx % T.lines.PP.length] || [];
      ids = fill(u, n); roles = ['C', 'LW', 'RW', 'RD', 'LD'];
    } else if (me < them || n < 5) {
      if (n === 5) { const F = T.lines.F[T.fIdx], D = T.lines.D[T.dIdx]; ids = fill([...F, ...D], 5); roles = ['C', 'LW', 'RW', 'LD', 'RD']; }
      else if (me < them) { const u = T.lines.PK[T.ppIdx % T.lines.PK.length] || []; ids = fill(n === 4 ? u : [u[0], u[2], u[3]], n); roles = n === 4 ? ['C', 'LW', 'LD', 'RD'] : ['C', 'LD', 'RD']; }
      else { const F = T.lines.F[T.fIdx], D = T.lines.D[T.dIdx]; ids = fill([F[0], F[1], D[0], D[1]], n); roles = ['C', 'LW', 'LD', 'RD'].slice(0, n); }
    } else {
      const F = T.lines.F[T.fIdx], D = T.lines.D[T.dIdx];
      ids = fill([...F, ...D], 5); roles = ['C', 'LW', 'RW', 'LD', 'RD'];
    }
    const unit = ids.map((id, i) => [id, roles[i] || 'RW']);
    if (this.pulled[s]) { const extra = [...T.lines.F.flat()].find(id => ok(id) && !ids.includes(id)); if (extra) unit.push([extra, 'X']); }
    if (!this.pulled[s]) unit.push([this.g[s], 'G']);
    this.unit[s] = unit;
    const sk = unit.filter(x => x[1] !== 'G'); this.skc[s] = sk;
    const n2 = sk.length || 1;
    this.uOff[s] = sum(sk, ([id]) => offR(this.A(id))) / n2; this.uDef[s] = sum(sk, ([id]) => defR(this.A(id))) / n2;
    this.uBlk[s] = sum(sk, ([id]) => this.A(id).blk) / n2; this.uDis[s] = sum(sk, ([id]) => this.A(id).dis) / n2;
    if (full) { T.fSince = this.t; T.dSince = this.t; }
    if (this.rec) this.lines.push({ t: this.t, s, u: unit.map(x => x.slice()) });
  }
  sk(s) { return this.skc[s]; }
  roleOf(s, id) { const e = this.unit[s].find(x => x[0] === id); return e ? e[1] : 'C'; }
  pidRole(s, role) { const e = this.unit[s].find(x => x[1] === role); return e ? e[0] : (this.sk(s)[0] || [0])[0]; }
  changes() {
    const key = this.strengthKey();
    if (key !== this.lastStrength) { this.lastStrength = key; this.setUnits(0, true); this.setUnits(1, true); return; }
    for (let s = 0; s < 2; s++) {
      const T = this.T[s]; let ch = false;
      const special = this.skaters(0) !== this.skaters(1) || (this.per > 3 && !this.playoff);
      if (special) { if (this.t - T.fSince > 58) { T.ppIdx++; T.fIdx = (T.fIdx + 1) % 4; T.dIdx = (T.dIdx + 1) % 3; T.fSince = this.t; T.dSince = this.t; ch = true; } }
      else {
        if (this.t - T.fSince > T.shiftF) { T.fIdx = this.nextLine(T.fToi, s, [0.31, 0.28, 0.23, 0.18]); T.fSince = this.t; T.shiftF = R.rand(36, 52); ch = true; }
        if (this.t - T.dSince > T.shiftD) { T.dIdx = this.nextLine(T.dToi, s, [0.40, 0.34, 0.26]); T.dSince = this.t; T.shiftD = R.rand(44, 60); ch = true; }
      }
      if (ch) this.setUnits(s, false);
    }
  }
  nextLine(toi, s, share) {
    if (this.tac[s].bench) share = share.length === 4 ? [0.42, 0.33, 0.2, 0.05] : [0.46, 0.36, 0.18];
    const late = this.per >= 3 && this.clock < 180 && Math.abs(this.score[0] - this.score[1]) <= 1;
    if (late) share = share.length === 4 ? [0.5, 0.35, 0.15, 0] : [0.5, 0.35, 0.15];
    let best = 0, bv = 1e9; const tot = sum(toi) + 1;
    for (let i = 0; i < share.length; i++) { if (!share[i]) continue; const v = toi[i] / tot - share[i]; if (v < bv) { bv = v; best = i; } }
    return best;
  }
  // ----- recording -----
  abs(s, u, y) { return toAbs(s, this.per, u, y); }
  frame(s, u, y, h, k, dt) {
    this.pu = s === this.poss ? u : RK.L - u; this.py = s === this.poss ? y : RK.W - y;
    if (!this.rec) return;
    const [x, yy] = this.abs(s, u, y);
    this.frames.push({ t: this.t + (dt || 0), x: Math.round(x * 10) / 10, y: Math.round(yy * 10) / 10, h: h || 0, k: k || 'c', s });
  }
  event(s, ty, txt, extra) { if (this.rec || ty === 'goal' || ty === 'pen' || ty === 'fight') this.events.push({ t: this.t, per: this.per, clk: this.clock, s, ty, txt, sc: this.score.slice(), ...(extra || {}) }); }
  posOf(s, id, pu, py) { const r = this.roleOf(s, id); return formTarget(r, s === this.poss, pu, py); }
  // ----- time -----
  tick(dt) {
    dt = Math.min(dt, this.clock);
    for (let s = 0; s < 2; s++) {
      for (const [id, r] of this.unit[s]) { const b = this.box[id]; if (!b) continue; if (r === 'G') b.gtoi += dt; else b.toi += dt; }
      const T = this.T[s]; T.fToi[T.fIdx] += dt; T.dToi[T.dIdx] += dt;
      if ((this.pen[0].length || this.pen[1].length) && this.skaters(s) > this.skaters(1 - s)) this.ts[s].pptime += dt;
    }
    this.t += dt; this.clock -= dt;
    // penalties expire
    for (let s = 0; s < 2; s++) {
      const pn = this.pen[s]; if (!pn.length) continue;
      let exp = false; for (const x of pn) if (x.until <= this.t) exp = true;
      if (exp) { this.pen[s] = pn.filter(x => x.until > this.t); this.lastStrength = ''; this.penV = (this.penV || 0) + 1; }
    }
    return dt;
  }
  // ----- main loop -----
  step() {
    if (this.done) return false;
    if (this.clock <= 0) { this.endPeriod(); return !this.done; }
    this.goaliePull();
    this.changes();
    if (this.ph === 'fo') this.faceoff();
    else this.play();
    if (this.clock <= 0 && !this.done) this.endPeriod();
    return !this.done;
  }
  run() { let guard = 0; while (this.step() && guard++ < 20000); this.finish(); return this; }
  endPeriod() {
    const tied = this.score[0] === this.score[1];
    if (this.per >= 3 && !tied) { this.done = true; this.finish(); return; }
    if (this.per >= 4 && !this.playoff) { this.shootout(); return; }
    this.per++;
    this.pulled = [false, false];
    if (this.per > 3) this.ot = true;
    this.clock = this.per > 3 && !this.playoff ? 300 : 1200;
    this.event(-1, 'per', this.per <= 3 ? ['', '1st', '2nd', '3rd'][this.per] + ' period' : this.playoff ? `Overtime ${this.per - 3 > 1 ? this.per - 3 : ''}`.trim() : 'Overtime (3-on-3)');
    if (this.rec) this.frames.push({ t: this.t, x: 100, y: 42.5, h: 0, k: 'int', s: 0 });
    this.lastStrength = ''; this.setUnits(0, true); this.setUnits(1, true);
    this.ph = 'fo'; this.foAt = { s: 0, u: 100, y: 42.5 };
  }
  goaliePull() {
    if (this.per !== 3 && !(this.per > 3 && this.playoff)) { if (this.pulled[0] || this.pulled[1]) { this.pulled = [false, false]; this.lastStrength = ''; } return; }
    for (let s = 0; s < 2; s++) {
      const diff = this.score[1 - s] - this.score[s], tac = this.tac[s].pull;
      let want = false;
      if (tac === 'now') want = diff > 0 || this.per === 3;
      else if (tac === 'never') want = false;
      else if (this.per === 3 && diff >= 1 && diff <= 3) want = this.clock < (diff === 1 ? 85 : diff === 2 ? 150 : 210) + this.T[s].mods.pullEarly;
      if (want !== this.pulled[s]) {
        if (want && this.ph === 'play' && this.poss !== s) continue; // pull when you have the puck or at a faceoff
        this.pulled[s] = want; this.lastStrength = '';
        this.event(s, 'info', want ? `${this.T[s].team.abbr} pull ${shortName(this.P(this.g[s]))} for an extra attacker` : `${shortName(this.P(this.g[s]))} returns to the ${this.T[s].team.abbr} net`);
      }
    }
  }
  // ----- faceoff -----
  faceoff() {
    const at = this.foAt; const [ax, ay] = toAbs(at.s, this.per, at.u, at.y);
    if (R.chance(this.fightChance())) this.fight();
    const cs = [0, 1].map(s => { const sk = this.sk(s); let best = sk[0][0], bv = -1; for (const [id, r] of sk) { const v = this.A(id).fo + (r === 'C' ? 6 : 0); if (v > bv) { bv = v; best = id; } } return best; });
    const pw = clamp(0.5 + (this.A(cs[0]).fo - this.A(cs[1]).fo) * 0.009, 0.25, 0.75);
    const w = R.chance(pw) ? 0 : 1, l = 1 - w;
    this.box[cs[w]].fow++; this.box[cs[l]].fol++; this.ts[w].fow++;
    this.poss = w;
    // convert dot position into the winner's frame
    const wu = dirOf(w, this.per) > 0 ? ax : RK.L - ax, wy = dirOf(w, this.per) > 0 ? ay : RK.W - ay;
    if (this.rec) this.frames.push({ t: this.t, x: ax, y: ay, h: 0, k: 'fo', s: w });
    this.zone = wu < 75 ? 'D' : wu > 125 ? 'O' : 'N';
    const back = R.chance(0.65) ? (wy < 42.5 ? 'LD' : 'RD') : 'C';
    this.carrier = this.pidRole(w, back);
    const [cu, cy] = this.zone === 'O' && back !== 'C' ? [133, wy < 42.5 ? 22 : 63] : this.zone === 'D' && back !== 'C' ? [Math.max(16, wu - 12), wy] : [wu - 6, wy];
    this.tick(R.rand(1, 2.5));
    this.frame(w, cu, cy, this.carrier, 'c');
    this.ph = 'play'; this.chain = []; this.rush = false; this.beat = 0; this.reb = false;
  }
  fightChance() {
    if (this.per > 3) return 0;
    let e = 0; for (let s = 0; s < 2; s++) for (const [id] of this.sk(s)) { const a = this.A(id); if (a.str + a.chk > 175 && a.dis < 55) e++; }
    return 0.0028 * (1 + e * 1.4) * (this.playoff ? 0.4 : 1);
  }
  fight() {
    const pick = (s) => R.weighted(this.sk(s), ([id]) => { const a = this.A(id); return Math.pow(Math.max(1, a.str + a.chk - 120), 1.5) * (110 - a.dis); })[0];
    const a = pick(0), b = pick(1);
    this.penV = (this.penV || 0) + 1;
    for (const [s, id] of [[0, a], [1, b]]) { this.pen[s].push({ pid: id, until: this.t + 300, coinc: true, type: 'Fighting' }); this.box[id].pim += 5; this.ts[s].pim += 5; }
    this.event(-1, 'fight', `FIGHT! ${shortName(this.P(a))} (${this.T[0].team.abbr}) and ${shortName(this.P(b))} (${this.T[1].team.abbr}) drop the gloves - 5 minutes each`);
    this.setUnits(0, false); this.setUnits(1, false);
  }
  // ----- penalties -----
  penaltyCheck(dt) {
    for (let s = 0; s < 2; s++) {
      const sk = this.sk(s); if (!sk.length) continue;
      const dis = this.uDis[s];
      const aggr = 1 + (this.tac[s].aggr || 0) * 0.18 + this.T[s].mods.aggr * 0.1;
      const lam = 3.15 / 3600 * dt * clamp((108 - dis) / 44, 0.45, 2.2) * aggr * (s === this.poss ? 0.65 : 1.35) * (this.per > 3 ? 0.4 : 1) * (this.per === 3 && this.clock < 300 ? 0.75 : 1);
      if (!R.chance(lam)) continue;
      if (this.pen[s].filter(x => !x.coinc).length >= 2) continue;
      const off = R.weighted(sk, ([id]) => Math.max(5, 108 - this.A(id).dis))[0];
      const type = R.weighted(PEN_TYPES, x => x[1])[0];
      const dbl = type === 'High-sticking' && R.chance(0.2);
      const min = dbl ? 4 : 2;
      this.pen[s].push({ pid: off, until: this.t + min * 60, type, minor: true }); this.penV = (this.penV || 0) + 1;
      this.box[off].pim += min; this.ts[s].pim += min;
      if (this.skaters(1 - s) > this.skaters(s) || true) this.ts[1 - s].ppo++;
      this.event(s, 'pen', `${this.T[s].team.abbr} penalty: ${shortName(this.P(off))}, ${type}${dbl ? ' (double minor)' : ''} - ${min}:00`);
      // whistle: faceoff in the offending team's zone
      this.ph = 'fo'; this.foAt = { s, u: 31, y: R.chance(0.5) ? 20.5 : 64.5 };
      this.lastStrength = '';
      return true;
    }
    return false;
  }
  // ----- possession play -----
  give(s, zone, role) {
    this.poss = s; this.zone = zone; this.chain = []; this.rush = false; this.beat = 0; this.reb = false;
    this.carrier = this.pidRole(s, role || (zone === 'D' ? R.pick(['LD', 'RD']) : R.pick(['C', 'LW', 'RW'])));
  }
  unitOff(s) { return this.uOff[s]; }
  unitDef(s) { return this.uDef[s]; }
  hit(by, on) {
    const sk = this.sk(by); if (!sk.length) return;
    const h = R.weighted(sk, ([id]) => Math.pow(this.A(id).chk, 2))[0];
    this.box[h].hit++; this.ts[by].hit++;
    if (this.rec && R.chance(0.45)) this.event(by, 'hit', `${shortName(this.P(h))} lays a big hit${on ? ' on ' + shortName(this.P(on)) : ''}`);
  }
  play() {
    const s = this.poss, o = 1 - s;
    const adv = this.skaters(s) - this.skaters(o);
    const offA = this.unitOff(s), defB = this.unitDef(o);
    const iceT = (1 - this.ice) * 0.05;
    const aggr = this.tac[s].aggr || 0, aggrB = this.tac[o].aggr || 0;
    const dt0 = this.zone === 'O' ? R.rand(2.6, 5.4) : R.rand(3, 6.5);
    if (this.penaltyCheck(dt0)) { this.tick(dt0 * 0.5); return; }
    // random hits along the way
    if (R.chance(0.008 + aggrB * 0.006)) this.hit(o, this.carrier);
    if (R.chance(0.005 + aggr * 0.004)) this.hit(s);
    const pu = this.pu, py = this.py;
    if (this.zone === 'D') {
      const p = clamp(0.84 + (offA - defB) * 0.008 - aggrB * 0.03 + adv * 0.04 - iceT, 0.58, 0.96);
      this.tick(dt0);
      if (R.chance(p)) {
        const rcv = R.pick(['LW', 'RW', 'C']); const id = this.pidRole(s, rcv); const [ru, ry] = formTarget(rcv, true, 82, py);
        this.chain.push(this.carrier); this.carrier = id; this.zone = 'N';
        this.frame(s, ru, ry, id, 'p');
      } else if (R.chance(0.2) && adv >= 0) {
        // icing
        this.frame(s, 192, R.rand(10, 75), 0, 'l');
        this.event(s, 'info', `Icing on ${this.T[s].team.abbr}`);
        this.ph = 'fo'; this.foAt = { s, u: 31, y: R.chance(0.5) ? 20.5 : 64.5 };
      } else {
        const lost = this.carrier; this.box[lost].gv++; this.ts[s].gv++;
        this.give(o, 'O', R.pick(['C', 'LW', 'RW']));
        const tk = this.carrier; this.box[tk].tk++; this.ts[o].tk++;
        this.frame(o, RK.L - pu + R.rand(-4, 4), RK.W - py, tk, 'c');
        if (R.chance(0.2)) this.hit(o, lost);
      }
      return;
    }
    if (this.zone === 'N') {
      this.tick(dt0);
      if (R.chance(0.028)) { this.frame(s, 128, py, this.carrier, 'c'); this.event(s, 'info', 'Offside'); this.ph = 'fo'; this.foAt = { s, u: 112, y: R.chance(0.5) ? 20.5 : 64.5 }; return; }
      const ca = this.A(this.carrier);
      const carry = R.chance(clamp(0.5 + (ca.spd + ca.hnd - 150) * 0.006 + aggr * 0.05 + adv * 0.1, 0.18, 0.88));
      if (carry) {
        const p = clamp(0.64 + (offA - defB) * 0.012 + adv * 0.09 - iceT, 0.32, 0.93);
        if (R.chance(p)) { this.zone = 'O'; this.rush = true; this.beat = 0; this.frame(s, R.rand(138, 150), clamp(py + R.rand(-10, 10), 12, 73), this.carrier, 'c'); }
        else {
          const lost = this.carrier; this.box[lost].gv++; this.ts[s].gv++;
          if (R.chance(0.25)) this.hit(o, lost);
          this.give(o, 'N'); this.box[this.carrier].tk++; this.ts[o].tk++;
          this.frame(o, RK.L - 118, RK.W - py, this.carrier, 'c');
        }
      } else {
        const cy = R.chance(0.5) ? R.rand(6, 14) : R.rand(71, 79);
        this.frame(s, 186, cy, 0, 'l');
        const p = clamp(0.40 + (offA - defB) * 0.01 + aggr * 0.05 + adv * 0.1, 0.2, 0.68);
        if (R.chance(0.2)) this.hit(R.chance(0.5) ? s : o);
        if (R.chance(p)) { this.zone = 'O'; this.rush = false; this.beat = 0; this.carrier = this.pidRole(s, cy < 42 ? 'LW' : 'RW'); this.frame(s, 180, cy < 42 ? 12 : 73, this.carrier, 'c', 1.2); }
        else { this.give(o, 'D', cy < 42 ? 'RD' : 'LD'); this.frame(o, 16, RK.W - cy, this.carrier, 'c', 1.2); }
      }
      return;
    }
    // ---- offensive zone ----
    this.beat++;
    const forced = this.reb;
    let pa = 0.19 + (this.rush && this.beat === 1 ? 0.24 : 0) + adv * 0.09 + aggr * 0.045 + (this.pulled[s] ? 0.06 : 0) + (this.beat > 5 ? 0.06 : 0);
    if (forced || R.chance(pa)) { this.tick(forced ? R.rand(0.6, 1.4) : dt0 * 0.7); this.shot(forced); return; }
    this.tick(dt0);
    const pt = clamp(0.16 + (defB - offA) * 0.006 - adv * 0.05 + this.beat * 0.012 + aggrB * 0.02 + iceT, 0.05, 0.36);
    if (R.chance(pt)) {
      const lost = this.carrier;
      const kind = R.weighted(['tk', 'hit', 'gv', 'clear'], k => ({ tk: 4, hit: 2, gv: 3, clear: 2 })[k]);
      if (kind === 'hit') this.hit(o, lost);
      if (kind === 'gv') { this.box[lost].gv++; this.ts[s].gv++; }
      this.give(o, kind === 'clear' ? 'N' : 'D');
      if (kind === 'tk') { this.box[this.carrier].tk++; this.ts[o].tk++; }
      const [nu, ny] = kind === 'clear' ? [100, RK.W - py] : [RK.L - pu, RK.W - py];
      this.frame(o, nu, ny, kind === 'clear' ? 0 : this.carrier, kind === 'clear' ? 'l' : 'c');
      if (kind === 'clear') this.frame(o, 100, ny, this.carrier, 'c', 1);
      return;
    }
    // pass to a teammate (rarely a goalie-pull extra attacker setup)
    const mates = this.sk(s).filter(([id]) => id !== this.carrier);
    if (!mates.length) return;
    const [id, role] = R.weighted(mates, ([mid, r]) => (r === 'C' ? 1.3 : r === 'LD' || r === 'RD' ? 0.9 : 1.1) * (this.A(mid).ofi / 70));
    this.chain.push(this.carrier); if (this.chain.length > 3) this.chain.shift();
    this.carrier = id;
    const [tu, ty] = formTarget(role, true, 150, 42.5);
    this.frame(s, tu + R.rand(-6, 6), ty + R.rand(-6, 6), id, 'p');
  }
  shot(rebound) {
    const s = this.poss, o = 1 - s;
    const sk = this.sk(s); const adv = this.skaters(s) - this.skaters(o);
    let shooter = this.carrier, role = this.roleOf(s, shooter);
    if (!rebound && !R.chance(0.22)) {
      const pick = R.weighted(sk, ([id, r]) => { const a = this.A(id); const w = Math.pow((a.sht + a.ofi) / 140, 1.1); return (r === 'LD' || r === 'RD') ? w * 0.55 : w; });
      shooter = pick[0]; role = pick[1];
    }
    const a = this.A(shooter);
    const isD = (role === 'LD' || role === 'RD') && !rebound;
    let dist, ang, kind;
    if (rebound) { dist = R.rand(5, 14); ang = R.rand(-35, 35); kind = 'rebound'; }
    else if (isD) { dist = R.rand(48, 62); ang = R.rand(-30, 30); kind = R.chance(0.45) ? 'slap shot' : 'wrist shot'; }
    else { dist = clamp(R.gauss(this.rush ? 28 : 24, 9), 6, 50); ang = R.rand(-55, 55); kind = R.pick(['wrist shot', 'wrist shot', 'snap shot', 'backhand', 'one-timer']); }
    let tip = null;
    if (isD && R.chance(0.14)) { const fs = sk.filter(([, r]) => !['LD', 'RD'].includes(r)); if (fs.length) { tip = R.pick(fs)[0]; } }
    const [su, sy] = [RK.NET - Math.cos(ang * Math.PI / 180) * dist, 42.5 + Math.sin(ang * Math.PI / 180) * dist];
    this.frame(s, clamp(su, 100, 186), clamp(sy, 6, 79), shooter, 'c');
    const emptyNet = this.pulled[o];
    let xg = 0.36 * Math.exp(-dist / 15) * (1 - Math.abs(ang) / 110);
    if (kind === 'one-timer' && this.chain.length) xg *= 1.35;
    if (rebound) xg *= 2.0;
    if (this.rush && this.beat <= 1) xg *= 1.25;
    if (tip) xg *= 1.7;
    if (adv > 0) xg *= 1 + adv * 0.6;
    if (emptyNet) xg = clamp(0.25 + 0.65 * Math.exp(-dist / 90), 0.3, 0.9);
    xg = clamp(xg, 0.008, 0.95);
    const ts = this.ts[s]; ts.att++;
    const even = this.skaters(0) === this.skaters(1);
    // Corsi (5v5 shot attempts, blocked shots included)
    if (even && !emptyNet) { for (const [id] of sk) this.box[id].cf++; for (const [id] of this.sk(o)) this.box[id].ca++; }
    // blocked
    const blkO = this.sk(o); const blkAvg = this.uBlk[o];
    const pb = clamp((isD ? 0.4 : 0.24) + (blkAvg - 70) * 0.004 + (this.tac[o].aggr < 0 ? 0.04 : 0) - (rebound ? 0.08 : 0), 0.05, 0.45);
    if (!emptyNet && blkO.length && R.chance(pb)) {
      const b = R.weighted(blkO, ([id, r]) => this.A(id).blk * (r === 'LD' || r === 'RD' ? 1.6 : 1))[0];
      this.box[b].blk++; this.ts[o].blk++;
      if (this.rec) this.event(o, 'blk', `${shortName(this.P(b))} blocks a ${kind} from ${shortName(this.P(shooter))}`);
      this.frame(s, clamp(su + 6, 100, 186), sy, 0, 'l', 0.3);
      if (R.chance(0.34)) { const m = R.pick(sk)[0]; this.carrier = m; this.frame(s, clamp(su + R.rand(-8, 8), 126, 180), clamp(sy + R.rand(-12, 12), 8, 77), m, 'c', 1); this.chain = []; }
      else { this.give(o, 'D'); this.frame(o, RK.L - su - 4, RK.W - sy, this.carrier, 'c', 1); }
      return;
    }
    const shooterQ = tip ? this.A(tip) : a;
    const pm = clamp(0.25 - (shooterQ.sht - 70) * 0.004 + dist * 0.0012 + (emptyNet ? -0.08 : 0), 0.1, 0.42);
    if (R.chance(pm)) {
      const wide = sy < 42.5 ? R.rand(32, 37) : R.rand(48, 53);
      this.frame(s, 193, wide, 0, 's', 0.35);
      if (this.rec && R.chance(0.25)) this.event(s, 'miss', `${shortName(this.P(shooter))} misses the net`);
      if (R.chance(0.11)) { this.ph = 'fo'; this.foAt = { s, u: 169, y: sy < 42.5 ? 20.5 : 64.5 }; return; }
      if (R.chance(0.34)) { const m = R.pick(sk)[0]; this.carrier = m; this.frame(s, R.rand(176, 186), sy < 42.5 ? 10 : 75, m, 'c', 1.2); this.chain = []; this.rush = false; }
      else { this.give(o, 'D', sy < 42.5 ? 'RD' : 'LD'); this.frame(o, 14, RK.W - (sy < 42.5 ? 10 : 75), this.carrier, 'c', 1.2); }
      return;
    }
    // on goal
    const real = tip || shooter;
    this.box[real].sog++; this.box[real].ixg += xg; ts.sog++; ts.xg += xg; if (this.rec) this.sogT.push([this.t, s]);
    const gid = this.g[o];
    if (!emptyNet) { this.box[gid].sa++; this.box[gid].xga += xg; }
    const qa = this.A(real), gq = emptyNet ? 0 : gkR(this.A(gid));
    const sf = 1 + (shotR(qa) - 72) * 0.013, gf = emptyNet ? 1 : 1 + (gq - 72) * 0.015;
    const pg = emptyNet ? xg : clamp(xg * SIM_XG * sf / gf, 0.004, 0.95);
    if (R.chance(pg)) { this.goal(s, real, tip ? shooter : null, kind, tip ? 'tip' : null, emptyNet, sy); return; }
    // save
    const gy = 42.5 + R.rand(-3, 3);
    this.frame(s, 186.5, gy, 0, 's', 0.3);
    const ga = this.A(gid);
    const rebP = clamp(0.24 - (ga.reb - 70) * 0.006 + (isD ? 0.04 : 0), 0.06, 0.38);
    if (this.rec && (xg > 0.12 || R.chance(0.3))) this.event(o, 'save', `${shortName(this.P(gid))} stops ${shortName(this.P(real))}'s ${tip ? 'deflection' : kind}`);
    const r = Math.random();
    if (r < 0.34) { this.frame(o, 13.5, RK.W - gy, gid, 'fz', 0.4); this.ph = 'fo'; this.foAt = { s, u: 169, y: sy < 42.5 ? 20.5 : 64.5 }; return; }
    if (r < 0.34 + rebP) {
      const ru = R.rand(172, 181), ry = 42.5 + R.rand(-12, 12);
      this.frame(s, ru, ry, 0, 'l', 0.6);
      if (R.chance(0.44)) { const m = R.weighted(sk, ([id, rr]) => (rr === 'LD' || rr === 'RD' ? 0.4 : 1) * this.A(id).ofi)[0]; this.carrier = m; this.chain = [real]; this.reb = true; this.frame(s, ru, ry, m, 'c', 1.1); }
      else { this.give(o, 'D'); this.frame(o, RK.L - ru, RK.W - ry, this.carrier, 'c', 1.1); }
      return;
    }
    if (R.chance(0.64)) { this.give(o, 'D'); this.frame(o, 16, RK.W - gy + R.rand(-15, 15), this.carrier, 'c', 1); }
    else { const m = R.pick(sk)[0]; this.carrier = m; this.chain = []; this.reb = false; this.rush = false; this.frame(s, R.rand(176, 186), R.chance(0.5) ? 10 : 75, m, 'c', 1.2); }
  }
  goal(s, scorer, tipFrom, kind, tip, emptyNet, sy) {
    const o = 1 - s;
    const adv = this.skaters(s) - this.skaters(o);
    this.score[s]++;
    this.frame(s, 190.5, 42.5 + R.rand(-2.5, 2.5), 0, 'g', 0.35);
    const b = this.box[scorer]; b.g++;
    const assists = [];
    for (let i = this.chain.length - 1; i >= 0 && assists.length < 2; i--) { const id = this.chain[i]; if (id !== scorer && !assists.includes(id) && this.box[id] && this.box[id].tid === this.tid[s]) assists.push(id); }
    if (tipFrom && !assists.includes(tipFrom)) assists.unshift(tipFrom);
    if (assists.length > 2) assists.length = 2;
    // passes not modelled as discrete beats still earn helpers: fill from teammates on the ice
    const mates = this.unit[s].filter(([id, r]) => r !== 'G' && id !== scorer && !assists.includes(id));
    while (assists.length < 2 && mates.length && R.chance(assists.length ? 0.8 : 0.93)) {
      const m = R.weighted(mates, ([id, r]) => (r === 'LD' || r === 'RD' ? 0.55 : 1) * Math.max(10, this.A(id).pas * 0.6 + this.A(id).ofi * 0.4 - 35) ** 1.5);
      assists.push(m[0]); mates.splice(mates.indexOf(m), 1);
    }
    if (R.chance(0.04)) assists.length = 0;
    assists.forEach(id => this.box[id].a++);
    const pp = adv > 0 && !this.pulled[s] ? true : adv > 0 && this.pulled[s] && this.skaters(o) < 5;
    const sh = adv < 0 && !this.pulled[o] ? true : false;
    if (pp) { b.ppg++; assists.forEach(id => this.box[id].ppa++); this.ts[s].ppg++; }
    if (sh) { b.shg++; this.ts[s].shg++; }
    if (!pp) { for (const [id] of this.sk(s)) this.box[id].pm++; for (const [id] of this.sk(o)) this.box[id].pm--; }
    if (!emptyNet) this.box[this.g[o]].ga++;
    // power-play goal ends the earliest minor
    if (pp) { const mi = this.pen[o].filter(x => x.minor && !x.coinc).sort((a, b) => a.until - b.until)[0]; if (mi) { mi.until = this.t; this.pen[o] = this.pen[o].filter(x => x !== mi); this.lastStrength = ''; this.penV = (this.penV || 0) + 1; } }
    const tag = [pp ? 'PPG' : '', sh ? 'SHG' : '', emptyNet ? 'EN' : ''].filter(Boolean).join(' ');
    const ast = assists.length ? ` (${assists.map(id => shortName(this.P(id))).join(', ')})` : ' (unassisted)';
    this.goals.push({ s, t: this.t, per: this.per, clk: this.clock, scorer, assists, pp, sh, en: emptyNet, sc: this.score.slice() });
    this.event(s, 'goal', `GOAL ${this.T[s].team.abbr}! ${fullName(this.P(scorer))}${tip ? ' tips it in' : ` scores on a ${kind}`}${ast}${tag ? ' - ' + tag : ''}`, { pid: scorer });
    this.tick(Math.min(1, this.clock));
    if (this.rec) this.frames.push({ t: this.t + 3, x: 100, y: 42.5, h: 0, k: 'cel', s });
    if (this.per > 3) { this.done = true; this.finish(); return; }
    this.ph = 'fo'; this.foAt = { s: 0, u: 100, y: 42.5 };
  }
  shootout() {
    const order = [0, 1].map(s => { const T = this.T[s]; return [...T.lines.F.flat(), ...T.lines.D.flat()].filter(Boolean).sort((a, b) => (this.A(b).sht + this.A(b).hnd) - (this.A(a).sht + this.A(a).hnd)); });
    const made = [0, 0]; const log = [];
    this.per = 5; this.event(-1, 'per', 'Shootout');
    for (let r = 0; r < 20; r++) {
      for (let s = 0; s < 2; s++) {
        const id = order[s][r % order[s].length]; const a = this.A(id), g = this.A(this.g[1 - s]);
        const p = clamp(0.32 * (1 + (a.sht + a.hnd - 150) * 0.012) / (1 + (gkR(g) - 72) * 0.025), 0.12, 0.6);
        const ok = R.chance(p); if (ok) made[s]++;
        log.push({ s, pid: id, ok });
        this.event(s, ok ? 'so-g' : 'so-m', `SO: ${shortName(this.P(id))} ${ok ? 'scores' : 'is stopped by ' + shortName(this.P(this.g[1 - s]))}`);
        if (this.rec) { this.frames.push({ t: this.t, x: 100, y: 42.5, h: id, k: 'c', s }); this.t += 4; const [nx] = toAbs(s, 1, ok ? 190.5 : 186.5, 42.5); this.frames.push({ t: this.t, x: nx, y: 42.5, h: 0, k: ok ? 'g' : 's', s }); this.t += 2; }
      }
      if (r >= 2 && made[0] !== made[1]) break;
      if (r < 3) { const left = 2 - r; if (made[0] > made[1] + left || made[1] > made[0] + left) break; }
    }
    const w = made[0] > made[1] ? 0 : 1;
    this.so = { made, log };
    this.score[w]++;
    this.done = true; this.finish();
  }
  // ----- wrap up -----
  finish() {
    if (this.fin) return; this.fin = true; this.done = true;
    const w = this.score[0] > this.score[1] ? 0 : 1, l = 1 - w;
    const gw = this.box[this.g[w]], gl = this.box[this.g[l]];
    gw.w = 1; if (this.ot || this.so) gl.otl = 1; else gl.l = 1;
    if (this.box[this.g[l]].ga === 0 || true) { /* shutouts below */ }
    for (let s = 0; s < 2; s++) { const gb = this.box[this.g[s]]; if (this.score[1 - s] - (this.so && 1 - s === w ? 1 : 0) === 0 && gb.gtoi >= 3500) gb.so = 1; }
    // game-winning goal: the goal that put the winner one ahead of the loser's final total
    const lose = this.score[l];
    const gwg = this.goals.filter(g => g.s === w)[lose];
    if (gwg && !this.so) this.box[gwg.scorer].gwg = 1;
    for (const id in this.box) { const b = this.box[id]; if (b.g >= 3) b.hat = 1; }
    // three stars
    const sc = Object.entries(this.box).map(([id, b]) => {
      const p = this.P(id); if (!p) return [id, -99];
      const v = p.pos === 'G' ? (b.gtoi > 0 ? (b.sa - b.ga) * 0.13 - b.ga * 0.6 + (b.w ? 1.5 : 0) + (b.so ? 2 : 0) : -99) : b.g * 3 + b.a * 1.8 + b.pm * 0.4 + (b.gwg ? 1 : 0) + b.sog * 0.15 + (b.tid === this.tid[w] ? 0.5 : 0);
      return [id, v];
    }).sort((a, b) => b[1] - a[1]);
    this.stars = sc.slice(0, 3).map(x => +x[0]);
    if (this.rec) this.event(-1, 'end', `Final${this.so ? ' (SO)' : this.ot ? ' (OT)' : ''}: ${this.T[0].team.abbr} ${this.score[0]} - ${this.T[1].team.abbr} ${this.score[1]}`);
  }
  result() {
    return { home: this.tid[0], away: this.tid[1], hs: this.score[0], as: this.score[1], ot: this.ot && !this.so, so: !!this.so, box: this.box, ts: this.ts, goals: this.goals, stars: this.stars, events: this.events.filter(e => ['goal', 'pen', 'fight', 'per', 'so-g', 'so-m'].includes(e.ty)), g: this.g.slice() };
  }
}
function simGame(L, home, away, opts) { return new HockeyGame(L, home, away, opts).run().result(); }
