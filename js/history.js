'use strict';
// ================= League history 1960-2025 =================
// The league is played season by season from 1960-61 with real (generated) players who are drafted,
// develop, get traded, retire and enter the Hall of Fame. Franchises join, relocate and fold on the real
// league's timeline. Games use a fast scoring model; player lines are drawn from team results and ratings.
// When it reaches the present, the survivors are today's rosters - their careers are this history.

const HIST_START = 1960, HIST_END = 2025;
const BRACKET = { 4: [1, 4, 2, 3], 8: [1, 8, 4, 5, 2, 7, 3, 6], 16: [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11] };
const HIST_TEMPLATE = { C: 5, LW: 4, RW: 4, D: 8, G: 2 };
const eraPIM = (y) => y < 1967 ? 1.0 : y < 1993 ? 1.7 : y < 2005 ? 1.3 : 0.85;
const eraSA = (y) => y < 1975 ? 31 : y < 1992 ? 32 : y < 2005 ? 29.5 : 30.5;

function genHistory(L, onProgress) {
  L.records = emptyRecords();
  const H = { fa: [] };
  const mk = (pos, T, age, y) => { const p = createPlayer(L, pos, T, age, { year: y }); p.exp = Math.max(0, age - 20); L.players[p.id] = p; return p; };
  const roster = (fid) => H[fid].map(id => L.players[id]).filter(Boolean);
  const active = (fid) => roster(fid).filter(p => !p.farm);
  const putOn = (fid, p) => { p.tid = fid; H[fid].push(p.id); H.fa = H.fa.filter(id => id !== p.id); };
  const remove = (fid, p) => { H[fid] = H[fid].filter(id => id !== p.id); };
  function newRoster(fid, y, q, expansion) {
    H[fid] = [];
    for (const pos of POSITIONS) for (let i = 0; i < HIST_TEMPLATE[pos]; i++) {
      const starter = i < (pos === 'D' ? 4 : pos === 'G' ? 1 : 3);
      let T = (starter ? R.gauss(72, 5.5) : R.gauss(63, 5)) + q;
      if (expansion) T -= 4;
      const age = Math.round(clamp(starter ? R.gauss(27, 3.5) : R.gauss(25, 3.5), 19, 36));
      putOn(fid, mk(pos, clamp(T, 42, 92), age, y));
    }
    for (let i = 0; i < 6; i++) { const p = mk(R.weighted(POSITIONS, ps => POS_DRAFT_W[ps]), R.gauss(55, 5), R.int(19, 22), y); p.farm = true; putOn(fid, p); }
  }
  // expansion: existing teams lose an unprotected player each, the rest are castoffs and kids
  function expansionRoster(fid, y, existing, nNew) {
    H[fid] = [];
    const per = nNew >= 4 ? 1 : 2;
    for (const f of existing) {
      const act = active(f).sort((a, b) => playerValue(b) - playerValue(a));
      for (let k = 0; k < per; k++) { const p = act[R.int(12, Math.min(act.length - 1, 19))]; if (p && !H[fid].includes(p.id)) { remove(f, p); putOn(fid, p); } }
    }
    const c = posCounts(roster(fid));
    for (const pos of POSITIONS) while (c[pos] < HIST_TEMPLATE[pos]) { putOn(fid, mk(pos, clamp(R.gauss(63, 5), 45, 80), R.int(21, 31), y)); c[pos]++; }
    for (let i = 0; i < 5; i++) { const p = mk(R.weighted(POSITIONS, ps => POS_DRAFT_W[ps]), R.gauss(54, 5), R.int(19, 21), y); p.farm = true; putOn(fid, p); }
  }
  function strength(fid) {
    const a = active(fid);
    const F = a.filter(p => FWD.includes(p.pos)).sort((x, y) => y.ovr - x.ovr).slice(0, 12);
    const D = a.filter(p => p.pos === 'D').sort((x, y) => y.ovr - x.ovr).slice(0, 6);
    const G = a.filter(p => p.pos === 'G').sort((x, y) => y.ovr - x.ovr);
    const wF = [1.3, 1.3, 1.3, 1.15, 1.15, 1.15, 0.9, 0.9, 0.9, 0.6, 0.6, 0.6], wD = [1.25, 1.25, 1, 1, 0.75, 0.75];
    const avg = (arr, w, f) => { let s = 0, n = 0; arr.forEach((p, i) => { s += f(p) * w[i]; n += w[i]; }); return n ? s / n : 55; };
    const off = avg(F, wF, p => p.ovr) * 0.8 + avg(D, wD, p => offR(p.attrs)) * 0.2;
    const def = avg(D, wD, p => p.ovr) * 0.6 + avg(F, wF, p => defR(p.attrs)) * 0.4;
    const g = G.length ? G[0].ovr * 0.8 + (G[1] ? G[1].ovr : 50) * 0.2 : 50;
    return { off, def, g };
  }
  // ----- one game (fast model) -----
  function lam(y, A, B, mean, home) { return eraGF(y) * Math.exp((A.off - mean.off) * 0.022 - (B.def - mean.def) * 0.016 - (B.g - mean.g) * 0.02) * (home ? 1.05 : 0.95); }
  function fastGame(y, h, a, S, mean, playoff) {
    let gh = R.poisson(lam(y, S[h], S[a], mean, true)), ga = R.poisson(lam(y, S[a], S[h], mean, false));
    let res = 'reg';
    if (gh === ga) {
      const ph = clamp(0.5 + ((S[h].off + S[h].g) - (S[a].off + S[a].g)) * 0.01, 0.25, 0.75);
      if (playoff || y >= 2005) { res = playoff ? 'ot' : (R.chance(0.6) ? 'ot' : 'so'); if (R.chance(ph)) gh++; else ga++; }
      else if (eraOT(y) && R.chance(0.42)) { res = 'ot'; if (R.chance(ph)) gh++; else ga++; }
      else res = 'tie';
    }
    return { gh, ga, res };
  }
  // ----- player season lines from team results -----
  function distribute(fid, y, N, gf, ga, rec, playoffMode) {
    const a = active(fid);
    const F = a.filter(p => FWD.includes(p.pos)).sort((x, y2) => y2.ovr - x.ovr), D = a.filter(p => p.pos === 'D').sort((x, y2) => y2.ovr - x.ovr), G = a.filter(p => p.pos === 'G').sort((x, y2) => y2.ovr - x.ovr);
    const lineup = [];
    F.forEach((p, i) => lineup.push({ p, share: i < 12 ? [1, 0.82, 0.62, 0.42][Math.floor(i / 3)] : 0.3, depth: i >= 12, toi: i < 12 ? [19, 16, 13.5, 11][Math.floor(i / 3)] : 9 }));
    D.forEach((p, i) => lineup.push({ p, share: i < 6 ? [1, 0.8, 0.62][Math.floor(i / 2)] : 0.3, depth: i >= 6, toi: i < 6 ? [24, 20, 16][Math.floor(i / 2)] : 13 }));
    const lines = {};
    for (const e of lineup) {
      let gp = e.depth ? R.int(0, Math.round(N * (playoffMode ? 0.2 : 0.45))) : N;
      if (!e.depth && !playoffMode && R.chance(0.28)) gp -= R.int(1, Math.round(N * 0.35));
      e.gp = Math.max(0, gp); e.f = N ? e.gp / N : 0;
    }
    const wG = lineup.map(e => e.share * e.f * Math.pow(Math.max(1, shotR(e.p.attrs) - 40) / 30, 1.8) * (e.p.pos === 'D' ? 0.28 : 1));
    const wA = lineup.map(e => e.share * e.f * Math.pow(Math.max(1, e.p.attrs.pas * 0.6 + e.p.attrs.ofi * 0.4 - 40) / 30, 1.7) * (e.p.pos === 'D' ? 0.8 : 1));
    const sG = sum(wG) || 1, sA = sum(wA) || 1;
    lineup.forEach((e, i) => {
      if (!e.gp) return;
      const s = {}; const at = e.p.attrs;
      s.gp = e.gp;
      const soft = (x, cap) => x <= cap ? x : cap + (x - cap) * 0.3;
      s.g = R.poisson(e.gp * soft(gf * 0.98 * wG[i] / sG / e.gp, eraGF(y) / 3.05 * 0.5)); s.a = R.poisson(e.gp * soft(gf * 1.68 * wA[i] / sA / e.gp, eraGF(y) / 3.05 * 0.72));
      s.pm = Math.round(e.f * e.share * (gf - ga) * 0.24 + R.gauss(0, 2 + e.gp / 14));
      s.pim = R.poisson(e.gp * 0.3 * Math.pow((108 - at.dis) / 45, 2) * eraPIM(y) * (at.str + at.chk > 170 ? 1.8 : 1));
      s.sog = Math.max(s.g, Math.round(s.g / clamp(0.065 + (at.sht - 60) * 0.0028, 0.04, 0.2) * R.rand(0.85, 1.15) + e.gp * 0.4));
      s.ppg = Math.round(s.g * R.rand(0.12, 0.32)); s.gwg = Math.round(s.g * R.rand(0.06, 0.2));
      s.toi = Math.round(e.gp * e.toi * 60 * R.rand(0.93, 1.07));
      if (y >= 2005) { s.hit = R.poisson(e.gp * (at.chk - 30) / 40); s.blk = R.poisson(e.gp * (e.p.pos === 'D' ? 1.3 : 0.45) * at.blk / 70); }
      lines[e.p.id] = s;
    });
    // goalies
    if (G.length) {
      const share = playoffMode ? 1 : clamp((y < 1967 ? 0.88 : y < 1990 ? 0.72 : 0.68) + (G[0].ovr - (G[1] ? G[1].ovr : 50)) * 0.012 + R.gauss(0, 0.05), 0.5, 0.92);
      const gs = [Math.round(N * share), N - Math.round(N * share)];
      const q = G.slice(0, 2).map(g => 1 + (74 - gkR(g.attrs)) * 0.025);
      const wGA = gs.map((n, i) => n * (q[i] || 1)); const sw = sum(wGA) || 1;
      const SA = Math.round(N * eraSA(y) * R.rand(0.93, 1.07));
      let wLeft = rec.w, lLeft = rec.l, oLeft = rec.otl, tLeft = rec.t;
      G.slice(0, 2).forEach((g, i) => {
        if (!gs[i]) return;
        const s = { gp: gs[i], gs: gs[i] };
        s.ga = Math.round(ga * 0.96 * wGA[i] / sw); s.sa = Math.max(s.ga + 5, Math.round(SA * gs[i] / N));
        s.gtoi = gs[i] * 3600;
        const fr = i === 0 ? gs[i] / N * (q[1] && q[0] < q[1] ? 1.04 : 0.98) : 1;
        s.w = i === 0 ? Math.min(wLeft, Math.round(rec.w * fr)) : wLeft; wLeft -= s.w;
        s.l = i === 0 ? Math.min(lLeft, Math.round(rec.l * gs[i] / N)) : lLeft; lLeft -= s.l;
        s.otl = i === 0 ? Math.min(oLeft, Math.round(rec.otl * gs[i] / N)) : oLeft; oLeft -= s.otl;
        s.t = i === 0 ? Math.min(tLeft, Math.round(rec.t * gs[i] / N)) : tLeft; tLeft -= s.t;
        const gaaV = s.ga / gs[i];
        s.so = R.poisson(gs[i] * clamp(0.075 * Math.exp(-(gaaV - 2) * 1.15), 0.004, 0.2));
        lines[g.id] = s;
      });
    }
    return lines;
  }
  const histFAAdd = (p) => { p.tid = -1; p.farm = false; H.fa.push(p.id); };
  // keep 23 active by position (best players), young extras to the farm, the rest to free agency
  function histRoster(fid, y) {
    const all = roster(fid);
    all.forEach(p => p.farm = false);
    const keep = new Set();
    for (const pos of POSITIONS) all.filter(p => p.pos === pos).sort((a, b) => (b.ovr + (b.age >= 30 ? 0 : 1)) - (a.ovr + (a.age >= 30 ? 0 : 1))).slice(0, HIST_TEMPLATE[pos]).forEach(p => keep.add(p.id));
    const extra = all.filter(p => !keep.has(p.id)).sort((a, b) => playerValue(b) - playerValue(a));
    let farmN = 0;
    for (const p of extra) {
      if (p.age <= 24 && farmN < 10) { p.farm = true; farmN++; }
      else { remove(fid, p); histFAAdd(p); }
    }
    // fill holes from free agency (or generate a journeyman)
    const c = posCounts(active(fid));
    for (const pos of POSITIONS) while (c[pos] < HIST_TEMPLATE[pos]) {
      const fp = roster(fid).find(p => p.farm && p.pos === pos);
      if (fp) { fp.farm = false; c[pos]++; continue; }
      const fa = H.fa.map(id => L.players[id]).filter(p => p && p.pos === pos).sort((a, b) => playerValue(b) - playerValue(a))[0];
      if (fa && fa.ovr >= 52) putOn(fid, fa); else putOn(fid, mk(pos, clamp(R.gauss(58, 5), 42, 72), R.int(22, 30), y));
      c[pos]++;
    }
  }
  function fidRowInfo(fid, y) { const e = eraOf(fid, y); return { city: e[2], name: e[3], abbr: e[4] }; }

  let genCount = 0;
  for (let y = HIST_START; y <= HIST_END; y++) {
    L.year = y;
    const fids = activeFids(y);
    const existing = fids.filter(f => H[f]);
    const newF = fids.filter(f => !H[f]);
    for (const f of newF) { if (y === HIST_START) newRoster(f, y, R.gauss(0, 2.5)); else expansionRoster(f, y, existing, newF.length); }
    // folded franchises (the Cleveland merger): best players go to the partner, the rest become free agents
    for (const f in H) {
      if (f === 'fa' || fids.includes(+f)) continue;
      const ps = roster(+f).sort((a, b) => playerValue(b) - playerValue(a));
      ps.forEach((p, i) => { remove(+f, p); if (i < 9 && H[18]) putOn(18, p); else histFAAdd(p); });
      delete H[f];
      if (+f === DEFUNCT_FID) { L.defunctHist.note = FRANCHISES[+f].note; }
    }
    for (const f of fids) histRoster(f, y);
    const N = seasonGames(y);
    if (N > 0) playHistSeason(y, fids, N);
    else { L.seasons[y] = { lockout: true }; L.champions.push({ year: y, lockout: true }); }
    // ---- offseason ----
    const yrsAll = Object.values(L.players);
    for (const p of yrsAll) {
      if (p.tid === -2) continue;
      if (p.tid >= 0 && !p.farm && p.stats.gp) p.ovrHist.push({ y, o: p.ovr });
      p.stats = emptyStats(); p.pstats = emptyStats();
      p.age++;
      progressPlayer(p);
      if (R.chance(retireChance(p))) {
        retireRecord(L, p, y);
        if (p.tid >= 0 && H[p.tid]) remove(p.tid, p); else H.fa = H.fa.filter(id => id !== p.id);
        delete L.players[p.id];
      }
    }
    hofCommittee(L, y + 1);
    // free-agent pool stays small
    H.fa = H.fa.filter(id => L.players[id]);
    if (H.fa.length > 140) { const drop = H.fa.map(id => L.players[id]).sort((a, b) => playerValue(a) - playerValue(b)).slice(0, H.fa.length - 140); drop.forEach(p => { H.fa = H.fa.filter(id => id !== p.id); delete L.players[p.id]; }); }
    // trades between teams
    const nextF = activeFids(y + 1).filter(f => H[f]);
    for (const f of nextF) for (const p of active(f)) {
      if (!R.chance(0.055)) continue;
      const g = R.pick(nextF.filter(x => x !== f)); if (g === undefined) continue;
      const q = active(g).filter(x => x.pos === p.pos).sort((a, b) => Math.abs(playerValue(a) - playerValue(p)) - Math.abs(playerValue(b) - playerValue(p)))[0];
      if (!q) continue;
      remove(f, p); remove(g, q); putOn(g, p); putOn(f, q);
    }
    // parity: free agency and cap pressure move talent from the strongest teams to the weakest
    if (y >= 1975) {
      const ranked = nextF.map(f => [f, strength(f)]).map(([f, s]) => [f, s.off + s.def + s.g * 0.5]).sort((a, b) => b[1] - a[1]);
      const moves = y >= 2005 ? 4 : 2;
      for (let i = 0; i < moves && i < ranked.length / 2; i++) {
        const rich = ranked[i][0], poor = ranked[ranked.length - 1 - i][0];
        const star = active(rich).sort((a, b) => b.ovr - a.ovr)[R.int(1, 5)]; if (!star) continue;
        const back = active(poor).filter(p => p.pos === star.pos).sort((a, b) => a.ovr - b.ovr)[0]; if (!back) continue;
        remove(rich, star); remove(poor, back); putOn(poor, star); putOn(rich, back);
      }
    }
    // the draft: worst teams pick first
    const order = nextF.slice().sort((a, b) => (L.seasons[y] && !L.seasons[y].lockout ? (L.seasons[y].teams.find(t => t.fid === a) || { pts: 999 }).pts - (L.seasons[y].teams.find(t => t.fid === b) || { pts: 999 }).pts : Math.random() - 0.5));
    let k = 0;
    for (let rd = 1; rd <= 3; rd++) for (const f of order) {
      const q = Math.pow(Math.random(), 1.4) * Math.exp(-k / 60);
      const pos = R.weighted(POSITIONS, ps => POS_DRAFT_W[ps]);
      const age = R.int(18, 20);
      const p = mk(pos, 44 + q * 22 + R.gauss(0, 3), age, y + 1);
      p.exp = 0; p.pot = clamp(Math.round(p.ovr + R.rand(8, 22) + q * 12), p.ovr, 99);
      if (k < 3 && R.chance(0.17)) { p.pot = R.int(94, 99); p.gen = R.chance(0.5); p.attrs = createPlayer(L, pos, R.rand(68, 76), age, { year: y + 1 }).attrs; L.nextPid--; p.ovr = calcOvr(p); genCount++; }
      p.farm = true; p.draft = { year: y + 1, rd, pk: k % order.length + 1, ovr: k + 1, tid: f, abbr: fidRowInfo(f, y + 1).abbr };
      putOn(f, p); k++;
    }
    if (onProgress) onProgress(y);
  }
  // ---- hand off to the present ----
  for (let fid = 0; fid < N_CUR; fid++) {
    const t = L.teams[fid]; t.roster = (H[fid] || []).filter(id => L.players[id]);
    for (const id of t.roster) L.players[id].tid = fid;
  }
  L.fa = H.fa.filter(id => L.players[id]);
  for (const id of L.fa) { const p = L.players[id]; p.tid = -1; p.farm = false; }
  while (L.fa.length < 90) { const p = createPlayer(L, R.weighted(POSITIONS, ps => POS_DRAFT_W[ps]), R.gauss(56, 5), R.int(23, 32), { year: 2026 }); p.exp = Math.max(0, p.age - 21); p.tid = -1; L.players[p.id] = p; L.fa.push(p.id); }
  for (const p of Object.values(L.players)) { p.stats = emptyStats(); p.pstats = emptyStats(); }
  franTrim(L, new Set(Object.keys(L.players).map(Number)));
  if (L.retired.length > 2200) L.retired = L.retired.sort((a, b) => b.score - a.score).slice(0, 2200);

  // ----- a regular season, playoffs and awards -----
  function playHistSeason(y, fids, N) {
    const S = {}; fids.forEach(f => S[f] = strength(f));
    const mean = { off: sum(fids, f => S[f].off) / fids.length, def: sum(fids, f => S[f].def) / fids.length, g: sum(fids, f => S[f].g) / fids.length };
    const rec = {}; fids.forEach(f => rec[f] = { gp: 0, w: 0, l: 0, t: 0, otl: 0, gf: 0, ga: 0 });
    // round-robin rounds (circle method), cycled until everyone has N games
    const ids = R.shuffle(fids.slice()); if (ids.length % 2) ids.push(-1);
    const n = ids.length, rounds = [];
    for (let r = 0; r < n - 1; r++) { const rd = []; for (let i = 0; i < n / 2; i++) { const a = ids[(r + i) % (n - 1)], b = i === 0 ? ids[n - 1] : ids[(r + n - 1 - i) % (n - 1)]; if (a >= 0 && b >= 0) rd.push(r % 2 ? [a, b] : [b, a]); } rounds.push(rd); }
    let guard = 0, ri = 0;
    while (fids.some(f => rec[f].gp < N) && guard++ < 400) {
      for (const [h, a] of rounds[ri % rounds.length]) {
        if (rec[h].gp >= N || rec[a].gp >= N) continue;
        const g = (ri / rounds.length | 0) % 2 ? fastGame(y, a, h, S, mean) : fastGame(y, h, a, S, mean);
        const [H2, A2] = (ri / rounds.length | 0) % 2 ? [a, h] : [h, a];
        const rh = rec[H2], ra = rec[A2]; rh.gp++; ra.gp++; rh.gf += g.gh; rh.ga += g.ga; ra.gf += g.ga; ra.ga += g.gh;
        if (g.res === 'tie') { rh.t++; ra.t++; }
        else { const [W, Lo] = g.gh > g.ga ? [rh, ra] : [ra, rh]; W.w++; if (g.res !== 'reg' && eraOTL(y)) Lo.otl++; else Lo.l++; }
      }
      ri++;
    }
    const rows = fids.map(f => { const r = rec[f], info = fidRowInfo(f, y); return { fid: f, ...info, gp: r.gp, w: r.w, l: r.l, t: r.t, otl: r.otl, pts: r.w * 2 + r.t + r.otl, gf: r.gf, ga: r.ga }; }).sort((a, b) => b.pts - a.pts || b.w - a.w || (b.gf - b.ga) - (a.gf - a.ga));
    // player lines
    const seasonLines = {};
    for (const f of fids) { const lines = distribute(f, y, N, rec[f].gf, rec[f].ga, rec[f], false); for (const id in lines) { seasonLines[id] = lines[id]; L.players[id].stats = Object.assign(emptyStats(), lines[id]); } }
    // playoffs
    const P = Math.min(playoffSize(fids.length), fids.length - (fids.length > 6 ? 2 : 2));
    const sizes = [16, 8, 4].filter(x => x <= P); const PS = sizes[0];
    const seeds = rows.slice(0, PS).map(r => r.fid);
    let bracket = BRACKET[PS].map(s => seeds[s - 1]);
    const nRounds = Math.log2(PS); const po = []; const pRec = {}; seeds.forEach(f => pRec[f] = { gp: 0, gf: 0, ga: 0, w: 0, l: 0 });
    let elim = {};
    for (let r = 0; r < nRounds; r++) {
      const next = [], rr = [];
      for (let i = 0; i < bracket.length; i += 2) {
        const a = bracket[i], b = bracket[i + 1];
        const [hi, lo] = seeds.indexOf(a) <= seeds.indexOf(b) ? [a, b] : [b, a];
        const w = [0, 0];
        while (w[0] < 4 && w[1] < 4) {
          const k = w[0] + w[1]; const hiHome = [0, 1, 4, 6].includes(k);
          const g = hiHome ? fastGame(y, hi, lo, S, mean, true) : fastGame(y, lo, hi, S, mean, true);
          const hg = hiHome ? g.gh : g.ga, lg = hiHome ? g.ga : g.gh;
          pRec[hi].gp++; pRec[lo].gp++; pRec[hi].gf += hg; pRec[hi].ga += lg; pRec[lo].gf += lg; pRec[lo].ga += hg;
          if (hg > lg) { w[0]++; pRec[hi].w++; pRec[lo].l++; } else { w[1]++; pRec[lo].w++; pRec[hi].l++; }
        }
        const winner = w[0] === 4 ? hi : lo; elim[winner === hi ? lo : hi] = r;
        rr.push({ hi, lo, w, winner }); next.push(winner);
      }
      po.push(rr); bracket = next;
    }
    const champ = bracket[0], fin = po[po.length - 1][0], runner = fin.winner === fin.hi ? fin.lo : fin.hi;
    // playoff lines
    for (const f of seeds) {
      const pl = distribute(f, y, pRec[f].gp, pRec[f].gf, pRec[f].ga, { w: pRec[f].w, l: pRec[f].l, otl: 0, t: 0 }, true);
      for (const id in pl) L.players[id].pstats = Object.assign(emptyStats(), pl[id]);
    }
    // awards
    const tpts = {}; rows.forEach(r => tpts[r.fid] = r.pts);
    const entries = Object.values(L.players).filter(p => p.tid >= 0 && !p.farm && p.stats.gp > 0).map(p => ({ p, s: p.stats, tid: p.tid, abbr: fidRowInfo(p.tid, y).abbr, tpts: tpts[p.tid] || 0 }));
    const A = pickAwards(entries, p => p.exp === 0);
    const aw = {};
    for (const k of ['MVP', 'SCOR', 'GOAL', 'BESTG', 'BESTD', 'ROY', 'BDF']) { aw[k] = A[k].map(e => awardEntry(L, e)); if (A[k][0]) giveAward(A[k][0].p, y, k); }
    aw.AS1 = {}; for (const pos in A.AS1) { aw.AS1[pos] = A.AS1[pos].map(e => awardEntry(L, e)); A.AS1[pos].forEach(e => giveAward(e.p, y, 'AS1')); }
    let mvp = null, mv = -1e9;
    for (const p of Object.values(L.players)) {
      if (p.tid < 0 || p.farm || !p.pstats.gp) continue;
      const ps = p.pstats; let v = p.pos === 'G' ? (ps.sa ? (svPct(ps) - 0.9) * 320 + ps.w * 1.3 : 0) : ps.g * 1.3 + ps.a + ps.pm * 0.15;
      if (p.tid === champ) v *= 1.4; else if (p.tid !== runner) v *= 0.4;
      if (v > mv) { mv = v; mvp = p; }
    }
    if (mvp) { giveAward(mvp, y, 'PMVP'); aw.PMVP = [{ pid: mvp.id, name: fullName(mvp), pos: mvp.pos, fid: mvp.tid, abbr: fidRowInfo(mvp.tid, y).abbr, line: mvp.pos === 'G' ? `${mvp.pstats.w} W, ${fmtSv(svPct(mvp.pstats))}` : `${mvp.pstats.g} G, ${mvp.pstats.a} A` }]; }
    for (const id of H[champ]) { const p = L.players[id]; if (p && !p.farm && p.pstats.gp) giveAward(p, y, 'MUG'); }
    const coy = rows[R.int(0, 3)];
    aw.COY = [{ fid: coy.fid, name: `${rollName('CAN', y - 50).join(' ')}`, abbr: coy.abbr, pos: 'HC', line: `${coy.w}-${coy.l}-${coy.t + coy.otl}, ${coy.pts} pts` }];
    L.awards[y] = aw;
    const ci = fidRowInfo(champ, y), rinf = fidRowInfo(runner, y);
    L.champions.push({ year: y, champ, runner, score: `${Math.max(...fin.w)}-${Math.min(...fin.w)}`, champName: ci.city + ' ' + ci.name, champAbbr: ci.abbr, runnerName: rinf.city + ' ' + rinf.name, runnerAbbr: rinf.abbr, mvp: aw.PMVP ? { name: aw.PMVP[0].name, pos: aw.PMVP[0].pos, pid: aw.PMVP[0].pid, line: aw.PMVP[0].line } : null });
    // leaders
    const sk = entries.filter(e => e.p.pos !== 'G'), gs = entries.filter(e => e.p.pos === 'G' && e.s.gs >= N * 0.4);
    const le = (e, v) => ({ pid: e.p.id, name: fullName(e.p), abbr: e.abbr, v });
    const lead = {
      pts: sk.slice().sort((a, b) => pts(b.s) - pts(a.s)).slice(0, 5).map(e => le(e, pts(e.s))), g: sk.slice().sort((a, b) => b.s.g - a.s.g).slice(0, 5).map(e => le(e, e.s.g)),
      a: sk.slice().sort((a, b) => b.s.a - a.s.a).slice(0, 5).map(e => le(e, e.s.a)), w: gs.slice().sort((a, b) => b.s.w - a.s.w).slice(0, 5).map(e => le(e, e.s.w)),
      sv: gs.slice().sort((a, b) => svPct(b.s) - svPct(a.s)).slice(0, 5).map(e => le(e, fmtSv(svPct(e.s)))),
    };
    L.seasons[y] = { gp: N, teams: rows, po, aw, lead, nRounds };
    // franchise histories
    for (const r of rows) {
      const e = elim[r.fid]; const result = r.fid === champ ? 'WON THE MUG' : e === undefined ? 'Missed Playoffs' : 'Lost ' + roundName(e, nRounds);
      const row = { year: y, abbr: r.abbr, city: r.city, name: r.name, gp: r.gp, w: r.w, l: r.l, t: r.t, otl: r.otl, pts: r.pts, gf: r.gf, ga: r.ga, result };
      if (r.fid < N_CUR) L.teams[r.fid].history.push(row); else L.defunctHist.push(row);
    }
    // careers, franchise leaders, records
    for (const p of Object.values(L.players)) {
      if (p.tid < 0 || (!p.stats.gp && !p.pstats.gp)) continue;
      const abbr = fidRowInfo(p.tid, y).abbr;
      pushCareerLine(L, p, y, abbr);
      franAdd(L, p.tid, p.id, fullName(p), p.pos, p.stats);
      if (p.stats.gp) p.exp++;
    }
    seasonRecordEntries(L, entries.map(e => ({ pid: e.p.id, name: fullName(e.p), pos: e.p.pos, abbr: e.abbr, s: e.s })), y, N);
    teamRecordEntries(L, rows, y);
  }
}
