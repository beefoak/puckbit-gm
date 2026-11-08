'use strict';
// ================= Live rink viewer =================
// Runs a recording HockeyGame a few seconds ahead of the playback clock and draws it on a pixel rink.
// The engine supplies puck keyframes (carries, passes, shots, loose pucks, faceoffs), on-ice units and
// events; the viewer skates every player toward his slot in the formation, sends the nearest checkers
// at the puck, chases loose pucks, and adds whistles, goal celebrations and intermissions.
const Rink = (() => {
  const S = 3, PAD = 18, CW = RK.L * S + PAD * 2, CH = RK.W * S + PAD * 2;
  const X = (x) => PAD + x * S, Y = (y) => PAD + y * S;
  const DIG = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
  const SPEEDS = [2, 5, 10, 20, 40];
  const HOLD = { fo: 2.2, fz: 1.0, goal: 5, int: 4, so: 1.2 };
  let V = null; // the active viewer

  // ---------- static rink art ----------
  function rinkPath(ctx, inset) {
    const x0 = X(0) + inset, y0 = Y(0) + inset, x1 = X(RK.L) - inset, y1 = Y(RK.W) - inset, r = 28 * S - inset;
    ctx.beginPath();
    ctx.moveTo(x0 + r, y0); ctx.lineTo(x1 - r, y0); ctx.arcTo(x1, y0, x1, y0 + r, r); ctx.lineTo(x1, y1 - r); ctx.arcTo(x1, y1, x1 - r, y1, r);
    ctx.lineTo(x0 + r, y1); ctx.arcTo(x0, y1, x0, y1 - r, r); ctx.lineTo(x0, y0 + r); ctx.arcTo(x0, y0, x0 + r, y0, r); ctx.closePath();
  }
  function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function drawBackground(home, away) {
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    const rnd = seeded(home.id * 97 + away.id * 13 + 7);
    // crowd
    c.fillStyle = '#141a2c'; c.fillRect(0, 0, CW, CH);
    const fans = [home.c1, home.c2, home.c1, '#d8d8d8', '#3a3f55', '#8a5a3a', away.c1, '#c9a27a', '#222'];
    for (let y = 0; y < CH; y += 3) for (let x = 0; x < CW; x += 3) if (rnd() < 0.55) { c.fillStyle = fans[Math.floor(rnd() * fans.length)]; c.fillRect(x, y, 2, 2); }
    // benches (top) and penalty boxes (bottom)
    c.fillStyle = '#0b0f1e'; c.fillRect(X(76), 0, 22 * S, PAD - 2); c.fillRect(X(102), 0, 22 * S, PAD - 2);
    c.fillStyle = home.c1; c.fillRect(X(76), PAD - 5, 22 * S, 2); c.fillStyle = away.c1; c.fillRect(X(102), PAD - 5, 22 * S, 2);
    c.fillStyle = '#0b0f1e'; c.fillRect(X(86), CH - PAD + 2, 12 * S, PAD - 2); c.fillRect(X(102), CH - PAD + 2, 12 * S, PAD - 2);
    // boards + ice
    rinkPath(c, -4); c.fillStyle = '#e8e8e8'; c.fill();
    rinkPath(c, -2); c.fillStyle = '#ffd23f'; c.fill();
    rinkPath(c, 0); c.fillStyle = '#eef4f9'; c.fill();
    c.save(); rinkPath(c, 0); c.clip();
    for (let i = 0; i < 900; i++) { c.fillStyle = rnd() < 0.5 ? '#e1eaf2' : '#f7fbff'; c.fillRect(X(rnd() * RK.L), Y(rnd() * RK.W), 1 + Math.floor(rnd() * 3), 1); }
    // lines
    const vline = (x, w, col) => { c.fillStyle = col; c.fillRect(Math.round(X(x) - w * S / 2), Y(0), Math.max(2, Math.round(w * S)), RK.W * S); };
    vline(11, 0.6, '#d33'); vline(189, 0.6, '#d33');
    vline(75, 1.2, '#2457c5'); vline(125, 1.2, '#2457c5'); vline(100, 1.2, '#d33');
    // center logo
    c.globalAlpha = 0.22; c.fillStyle = home.c1; c.beginPath(); c.arc(X(100), Y(42.5), 11 * S, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 0.5; c.fillStyle = home.c2; c.font = `${4 * S}px "Press Start 2P", monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(home.abbr, X(100), Y(42.5) + 1);
    c.globalAlpha = 1;
    // circles + dots
    const ring = (x, y, r, col) => { c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.arc(X(x), Y(y), r * S, 0, Math.PI * 2); c.stroke(); };
    const dot = (x, y, col, r) => { c.fillStyle = col; c.beginPath(); c.arc(X(x), Y(y), (r || 1) * S, 0, Math.PI * 2); c.fill(); };
    ring(100, 42.5, 15, '#2457c5'); dot(100, 42.5, '#2457c5', 0.8);
    for (const x of [31, 169]) for (const y of [20.5, 64.5]) {
      ring(x, y, 15, '#d33'); dot(x, y, '#d33');
      c.fillStyle = '#d33'; for (const dx of [-2, 2]) for (const dy of [-15.5, 15.5]) c.fillRect(X(x + dx) - 1, Y(y + dy) - 2, 2, 4);
    }
    for (const x of [80, 120]) for (const y of [20.5, 64.5]) dot(x, y, '#d33');
    // creases + nets
    for (const [gx, dir] of [[11, 1], [189, -1]]) {
      c.fillStyle = '#9fd0ff'; c.beginPath(); c.moveTo(X(gx), Y(36.5)); c.arc(X(gx), Y(42.5), 6 * S, dir > 0 ? -Math.PI / 2 : Math.PI / 2, dir > 0 ? Math.PI / 2 : Math.PI * 1.5); c.closePath(); c.fill();
      c.strokeStyle = '#d33'; c.lineWidth = 1; c.stroke();
      const nx = dir > 0 ? X(gx - 3.5) : X(gx), nw = 3.5 * S;
      c.fillStyle = 'rgba(255,255,255,.75)'; c.fillRect(nx, Y(39.5), nw, 6 * S);
      c.fillStyle = 'rgba(120,120,120,.45)'; for (let yy = Y(39.5); yy < Y(45.5); yy += 2) c.fillRect(nx, yy, nw, 1);
      c.strokeStyle = '#c11'; c.lineWidth = 2; c.strokeRect(nx, Y(39.5), nw, 6 * S);
    }
    c.restore();
    return cv;
  }

  // ---------- sprites ----------
  function digits(c, n, x, y, col) {
    const s = String(n); let ox = x - (s.length * 4 - 1) / 2;
    c.fillStyle = col;
    for (const ch of s) { const g = DIG[+ch]; if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') c.fillRect(Math.round(ox + (i % 3)), Math.round(y + Math.floor(i / 3)), 1, 1); ox += 4; }
  }
  function drawSkater(c, sp, t, facing, hasPuck, puck) {
    const x = Math.round(X(sp.x)), y = Math.round(Y(sp.y));
    const tm = sp.team;
    c.fillStyle = 'rgba(0,30,60,.18)'; c.fillRect(x - 5, y + 5, 10, 3);
    // skates/legs (stride animation)
    const st = Math.hypot(sp.vx, sp.vy) > 4 ? Math.round(Math.sin(t * 9 + sp.ph) * 1.5) : 0;
    c.fillStyle = '#111'; c.fillRect(x - 3 + st, y + 4, 3, 2); c.fillRect(x + 1 - st, y + 4, 3, 2);
    c.fillStyle = tm.c2; c.fillRect(x - 3, y + 1, 7, 3);
    // jersey
    c.fillStyle = tm.c1; c.fillRect(x - 4, y - 6, 9, 8);
    c.fillStyle = tm.c2; c.fillRect(x - 4, y - 1, 9, 1);
    digits(c, sp.num, x + 0.5, y - 5, '#fff');
    // helmet
    c.fillStyle = tm.c2; c.fillRect(x - 2, y - 10, 5, 4); c.fillStyle = '#f1c9a0'; c.fillRect(x - 1 + (facing > 0 ? 1 : -1), y - 8, 3, 2);
    // stick
    const tx = hasPuck ? X(puck.x) : x + facing * 9, ty = hasPuck ? Y(puck.y) + 1 : y + 6;
    c.strokeStyle = '#7a5230'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + facing * 4, y - 2); c.lineTo(tx, ty); c.stroke();
    c.fillStyle = '#111'; c.fillRect(Math.round(tx) - 1, Math.round(ty) - 1, 3, 2);
    if (sp.mine && hasPuck) { c.fillStyle = '#ffd23f'; c.fillRect(x - 1, y - 15, 3, 2); c.fillRect(x, y - 13, 1, 1); }
  }
  function drawGoalie(c, sp, facing) {
    const x = Math.round(X(sp.x)), y = Math.round(Y(sp.y)); const tm = sp.team;
    c.fillStyle = 'rgba(0,30,60,.18)'; c.fillRect(x - 7, y + 5, 14, 3);
    c.fillStyle = '#f4f4f4'; c.fillRect(x - 6, y - 1, 5, 7); c.fillRect(x + 1, y - 1, 5, 7);
    c.fillStyle = tm.c2; c.fillRect(x - 6, y + 2, 5, 1); c.fillRect(x + 1, y + 2, 5, 1);
    c.fillStyle = tm.c1; c.fillRect(x - 5, y - 8, 11, 8);
    digits(c, sp.num, x + 0.5, y - 7, '#fff');
    c.fillStyle = '#ddd'; c.fillRect(x - 2, y - 12, 5, 5); c.fillStyle = '#333'; c.fillRect(x - 1, y - 10, 3, 2);
    c.fillStyle = '#b5532b'; c.fillRect(x + (facing > 0 ? 5 : -8), y - 6, 3, 4); // glove
    c.fillStyle = '#7a5230'; c.fillRect(x + (facing > 0 ? -7 : 5), y + 4, 2, 3);
  }

  // ---------- viewer state ----------
  function open(L, g, playoff, cb) {
    if (V) close(true);
    const opts = Object.assign(gameOpts(L, g, playoff), { record: true });
    const game = new HockeyGame(L, g.home, g.away, opts);
    const userSide = g.home === L.userTeam ? 0 : g.away === L.userTeam ? 1 : -1;
    const teams = [L.teams[g.home], L.teams[g.away]];
    V = {
      L, g, playoff, cb, game, userSide, teams, bg: drawBackground(teams[0], teams[1]),
      T: 0, speed: 2, hl: false, paused: false, hold: 0, holdKind: null, holdInfo: null,
      fi: 0, li: [0, 0], ei: 0, units: [[], []], sprites: new Map(), puck: { x: 100, y: 42.5 }, trail: [],
      perStarts: [], per: 1, so: false, committed: false, last: performance.now(), raf: 0, flash: 0, banner: null,
      lastFrameIdx: -1, finalShown: false, hp: 0, heldFrame: -1,
    };
    ensure(0.5);
    buildDom();
    snapUnits();
    V.raf = requestAnimationFrame(loop);
  }
  function ensure(ahead) {
    const G = V.game; let guard = 0;
    while (!G.done && (G.frames.length < 2 || G.frames[G.frames.length - 1].t < V.T + ahead) && guard++ < 4000) G.step();
    if (G.done) G.finish();
    // keep keyframes monotonic and drop celebration markers (the viewer stages its own)
    const F = G.frames;
    for (let i = Math.max(1, V.lastFrameIdx); i < F.length; i++) { if (F[i].t < F[i - 1].t) F[i].t = F[i - 1].t; }
    V.lastFrameIdx = F.length - 1;
  }
  const endT = () => { const G = V.game; return Math.max(G.t, G.frames.length ? G.frames[G.frames.length - 1].t : 0); };

  // ---------- DOM ----------
  function teamBlock(s, right) {
    const t = V.teams[s];
    return `<div class="gv-team ${right ? 'r' : ''}">${right ? '' : crestImg(t, 40)}<div><div class="px small">${esc(t.city.toUpperCase())}</div><div class="px">${esc(t.name.toUpperCase())}</div><div class="dim small">${recStr(t.rec)}</div></div>${right ? crestImg(t, 40) : ''}</div>`;
  }
  function crestImg(t, n) { return typeof crest === 'function' ? crest(t.id, n) : `<span class="swatch" style="background:${t.c1}"></span>`; }
  function buildDom() {
    const el = document.createElement('div'); el.className = 'gv'; el.id = 'gv';
    const us = V.userSide;
    const tacBtns = us < 0 ? '' : `<div class="gv-ctrl"><span class="px small dim">TACTICS</span>
      <select id="gvAggr" title="Aggressive teams shoot and forecheck more but take more penalties"><option value="-1">Defensive</option><option value="0" selected>Balanced</option><option value="1">Aggressive</option></select>
      <select id="gvPull" title="When to pull your goalie for an extra attacker"><option value="auto">Goalie: auto pull</option><option value="now">Goalie: PULL NOW</option><option value="never">Goalie: never pull</option></select>
      <label class="chk"><input type="checkbox" id="gvBench"> Shorten bench</label></div>`;
    el.innerHTML = `<div class="gv-box">
      <div class="gv-top">${teamBlock(1, false)}
        <div class="gv-mid"><div style="display:flex;gap:14px;align-items:center;justify-content:center"><span class="gv-score" id="gvS1">0</span><div><div class="gv-clock" id="gvClock">20:00</div><div class="gv-per" id="gvPer">1st</div></div><span class="gv-score" id="gvS0">0</span></div><div id="gvPP"></div></div>
        ${teamBlock(0, true)}</div>
      <div class="gv-main"><div>
        <canvas class="rink" id="gvCanvas" width="${CW}" height="${CH}"></canvas>
        <div class="gv-ctrl" id="gvCtrl"></div>${tacBtns}
        <div id="gvFinal"></div></div>
        <div class="gv-side"><div class="gv-shots" id="gvShots"></div><div class="px small gold">ON ICE</div><div id="gvIce" class="small"></div><div class="px small gold">PLAY-BY-PLAY</div><ul class="pbp" id="gvPbp"></ul></div>
      </div></div>`;
    document.body.appendChild(el);
    document.body.style.overflow = 'hidden';
    V.el = el; V.ctx = el.querySelector('#gvCanvas').getContext('2d'); V.ctx.imageSmoothingEnabled = false;
    drawCtrl();
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
  }
  function drawCtrl() {
    const c = V.el.querySelector('#gvCtrl'); if (!c) return;
    if (V.game.done && V.T >= endT() - 0.01) { c.innerHTML = ''; return; }
    c.innerHTML = `<button class="btn tiny ${V.paused ? '' : 'alt'}" data-gv="pause">${V.paused ? '▶ PLAY' : '❚❚ PAUSE'}</button>` +
      SPEEDS.map((s, i) => `<button class="chip ${!V.hl && V.speed === i ? 'on' : ''}" data-gv="speed" data-i="${i}">${s}x</button>`).join('') +
      `<button class="chip ${V.hl ? 'on' : ''}" data-gv="hl" title="Fast-forward between scoring chances">HIGHLIGHTS</button>
       <button class="btn tiny" data-gv="period" title="Skip to the end of this period">END PERIOD »</button>
       <button class="btn tiny danger" data-gv="skip" title="Simulate the rest instantly">SIM TO FINAL »»</button>`;
  }
  function onClick(e) {
    const b = e.target.closest('[data-gv]'); if (!b) return;
    const a = b.dataset.gv;
    if (a === 'pause') V.paused = !V.paused;
    else if (a === 'speed') { V.speed = +b.dataset.i; V.hl = false; V.paused = false; }
    else if (a === 'hl') { V.hl = !V.hl; V.paused = false; }
    else if (a === 'skip') { skipTo(Infinity); }
    else if (a === 'period') { skipPeriod(); }
    else if (a === 'box') { if (typeof showBoxModal === 'function') showBoxModal(V.g); }
    else if (a === 'done') { close(false); return; }
    drawCtrl();
  }
  function onChange(e) {
    const us = V.userSide; if (us < 0) return;
    const tac = V.game.tac[us];
    if (e.target.id === 'gvAggr') tac.aggr = +e.target.value;
    if (e.target.id === 'gvPull') tac.pull = e.target.value;
    if (e.target.id === 'gvBench') tac.bench = e.target.checked ? 1 : 0;
  }
  function skipTo(t) {
    const G = V.game;
    if (t === Infinity) { let guard = 0; while (!G.done && guard++ < 30000) G.step(); G.finish(); ensure(0); t = endT(); }
    else ensure(t - V.T + 1);
    V.T = Math.min(t, endT()); V.hold = 0; V.holdKind = null; V.banner = null;
    const F = G.frames; V.hp = 0; while (V.hp < F.length && F[V.hp].t <= V.T) V.hp++;
    catchUp(); snapUnits();
  }
  function skipPeriod() {
    const G = V.game; let guard = 0;
    const per = V.per;
    while (!G.done && guard++ < 30000 && !G.events.some(e => e.ty === 'per' && e.t > V.T && e.per > per)) G.step();
    const nx = G.events.find(e => e.ty === 'per' && e.t > V.T && e.per > per);
    if (G.done) G.finish();
    skipTo(nx ? nx.t : Infinity);
  }
  function close(silent) {
    if (!V) return;
    const G = V.game;
    let guard = 0; while (!G.done && guard++ < 30000) G.step(); G.finish();
    cancelAnimationFrame(V.raf);
    if (V.el) V.el.remove();
    document.body.style.overflow = '';
    const v = V; V = null;
    if (!v.committed) { v.committed = true; v.cb.commit(G.result()); }
    if (v.cb.closed) v.cb.closed();
  }

  // ---------- timeline helpers ----------
  function catchUp() {
    const G = V.game;
    // events, periods and the play-by-play
    const pbp = V.el.querySelector('#gvPbp'); let html = '';
    while (V.ei < G.events.length && G.events[V.ei].t <= V.T) {
      const e = G.events[V.ei++];
      if (e.ty === 'per') { V.perStarts[e.per] = e.t; V.per = e.per; if (e.per === 5) V.so = true; }
      if (e.ty === 'hit' || e.ty === 'blk' || e.ty === 'miss') { if (!V.hl && R.chance(0.6)) continue; }
      const cls = e.ty === 'goal' || e.ty === 'so-g' ? 'goal' : e.ty === 'pen' || e.ty === 'fight' ? 'pen' : e.ty === 'per' || e.ty === 'end' ? 'per' : '';
      const tag = e.s >= 0 ? `<b>${esc(V.teams[e.s].abbr)}</b> ` : '';
      html = `<li class="${cls}"><span class="dim">${e.ty === 'per' || e.ty === 'end' || V.so ? '' : clockStr(e.clk) + ' '}</span>${e.ty === 'per' || e.ty === 'end' || e.ty === 'goal' ? '' : tag}${esc(e.txt)}</li>` + html;
      if (e.ty === 'goal') { V.flash = 1; }
    }
    if (html) { pbp.insertAdjacentHTML('afterbegin', html); while (pbp.children.length > 160) pbp.lastChild.remove(); }
    // units
    for (let s = 0; s < 2; s++) {
      let changed = false;
      while (V.li[s] < G.lines.length) {
        const ln = G.lines[V.li[s]];
        if (ln.t > V.T) break;
        V.li[s]++;
        if (ln.s === s) { V.units[s] = ln.u; changed = true; }
      }
      // G.lines mixes both sides; advance per-side pointers independently
      if (changed) syncSprites(s);
    }
  }
  function syncSprites(s) {
    const L = V.L, want = new Set(V.units[s].map(x => x[0]));
    for (const sp of V.sprites.values()) if (sp.side === s && !want.has(sp.id) && !sp.leaving) { sp.leaving = true; sp.leftAt = V.T; }
    for (const [id, role] of V.units[s]) {
      let sp = V.sprites.get(id);
      const p = L.players[id];
      if (!sp) {
        const gate = benchGate(s);
        sp = { id, side: s, team: V.teams[s], num: p ? p.num : 0, x: gate[0], y: gate[1], vx: 0, vy: 0, ph: Math.random() * 6, spd: p ? p.attrs.spd : 60, mine: s === V.userSide, name: p ? shortName(p) : '' };
        if (role === 'G') { const [gx, gy] = goalieSpot(s); sp.x = gx; sp.y = gy; }
        V.sprites.set(id, sp);
      }
      sp.leaving = false; sp.role = role;
    }
  }
  function snapUnits() {
    // place everyone instantly (period start / skip)
    V.li = [0, 0]; V.units = [[], []];
    const G = V.game;
    for (let s = 0; s < 2; s++) { let last = null; for (const ln of G.lines) { if (ln.t > V.T) break; if (ln.s === s) last = ln; } if (last) V.units[s] = last.u; }
    let i0 = 0; while (i0 < G.lines.length && G.lines[i0].t <= V.T) i0++;
    V.li = [i0, i0];
    V.sprites.clear();
    for (let s = 0; s < 2; s++) { syncSprites(s); }
    const puck = puckAt(V.T); V.puck = puck;
    for (const sp of V.sprites.values()) { const tg = targetFor(sp, puck, V.T); sp.x = tg[0]; sp.y = tg[1]; }
  }
  const benchGate = (s) => [s === 0 ? 87 : 113, 1.5];
  const goalieSpot = (s) => { const d = dirOf(s, Math.min(V.per, 4)); return [d > 0 ? 13.5 : RK.L - 13.5, 42.5]; };
  function frameIdx(T) {
    const F = V.game.frames;
    if (V.fi >= F.length) V.fi = Math.max(0, F.length - 1);
    while (V.fi > 0 && F[V.fi].t > T) V.fi--;
    while (V.fi + 1 < F.length && F[V.fi + 1].t <= T) V.fi++;
    return V.fi;
  }
  // Where the puck is at time T and who (if anyone) controls it.
  function puckAt(T) {
    const F = V.game.frames; if (!F.length) return { x: 100, y: 42.5, h: 0, fly: false, s: 0 };
    const i = frameIdx(T), A = F[i], B = F[i + 1];
    if (!B || T <= A.t) return { x: A.x, y: A.y, h: A.k === 'c' || A.k === 'fz' ? A.h : 0, fly: false, s: A.s, k: A.k, A, B };
    if (B.k === 'fo' || B.k === 'int' || B.k === 'cel') return { x: A.x, y: A.y, h: A.k === 'c' ? A.h : 0, fly: false, s: A.s, k: A.k, A, B };
    const d = Math.hypot(B.x - A.x, B.y - A.y);
    const span = B.t - A.t;
    const fly = B.k === 'p' || B.k === 's' || B.k === 'g' || B.k === 'l' || B.k === 'fz' || (B.k === 'c' && B.h !== A.h);
    if (!fly) { const f = span > 0 ? (T - A.t) / span : 1; const e = f * f * (3 - 2 * f); return { x: A.x + (B.x - A.x) * e, y: A.y + (B.y - A.y) * e, h: A.h, fly: false, s: B.s, k: 'c', A, B }; }
    const v = B.k === 's' || B.k === 'g' ? 95 : B.k === 'p' ? 60 : 40;
    const flight = Math.min(span, Math.max(0.25, d / v));
    const tr = B.t - flight;
    if (A.h && A.k !== 'fo' && T < tr) {
      // carried a few feet before the release
      const f = (T - A.t) / Math.max(0.01, tr - A.t); const rx = A.x + (B.x - A.x) * 0.12, ry = A.y + (B.y - A.y) * 0.12;
      return { x: A.x + (rx - A.x) * f, y: A.y + (ry - A.y) * f, h: A.h, fly: false, s: A.s, k: 'c', A, B, rel: tr };
    }
    const sx = A.h && A.k !== 'fo' ? A.x + (B.x - A.x) * 0.12 : A.x, sy = A.h && A.k !== 'fo' ? A.y + (B.y - A.y) * 0.12 : A.y;
    const t0 = A.h && A.k !== 'fo' ? tr : A.t;
    const f = clamp((T - t0) / Math.max(0.01, B.t - t0), 0, 1);
    const e = B.k === 'l' ? 1 - (1 - f) * (1 - f) : f;
    return { x: sx + (B.x - sx) * e, y: sy + (B.y - sy) * e, h: 0, fly: true, s: B.s, k: B.k, A, B, to: B.h };
  }
  function targetFor(sp, pk, T) {
    const s = sp.side, per = Math.min(V.per, 4);
    if (sp.leaving) return benchGate(s);
    if (V.holdKind === 'fo' && V.holdInfo) return foSpot(sp, V.holdInfo);
    if (V.holdKind === 'goal' && V.holdInfo) {
      if (s === V.holdInfo.s && sp.role !== 'G') { const sc = V.holdInfo.at; return [sc[0] + Math.cos(sp.ph) * 3, sc[1] + Math.sin(sp.ph) * 3]; }
    }
    if (V.holdKind === 'int') return sp.role === 'G' ? goalieSpot(s) : benchGate(s);
    const [pu, py] = toAbs(s, per, pk.x, pk.y);
    if (sp.role === 'G') { const [u, y] = formTarget('G', false, pu, py); return toAbs(s, per, u, y); }
    const poss = pk.s === s;
    if (pk.h === sp.id) return [pk.x - dirOf(s, per) * 1.2, pk.y + 0.8];
    if (pk.fly && pk.to === sp.id) return [pk.B.x, pk.B.y];
    if (V.chase && V.chase[s] === sp.id) return pk.fly && pk.B ? [(pk.x + pk.B.x) / 2, (pk.y + pk.B.y) / 2] : [pk.x - dirOf(s, per) * 2.5, pk.y + (sp.y < pk.y ? -1.5 : 1.5)];
    let [u, y] = formTarget(sp.role, poss, pu, py);
    u += Math.sin(T * 0.7 + sp.ph) * 2.5; y += Math.cos(T * 0.9 + sp.ph) * 2;
    return toAbs(s, per, clamp(u, 6, 194), clamp(y, 5, 80));
  }
  function foSpot(sp, fo) {
    const s = sp.side, d = dirOf(s, Math.min(V.per, 4)); // d: direction this side attacks
    if (sp.role === 'G') return goalieSpot(s);
    const off = { C: [-1.6, 0], LW: [-3, -14], RW: [-3, 14], LD: [-17, -9], RD: [-17, 9], X: [-8, 0] }[sp.role] || [-8, 0];
    const yflip = d > 0 ? 1 : -1;
    return [clamp(fo.x + off[0] * d, 4, 196), clamp(fo.y + off[1] * yflip, 4, 81)];
  }
  function chooseChasers(pk) {
    V.chase = [0, 0];
    for (let s = 0; s < 2; s++) {
      const loose = pk.fly && (pk.k === 'l' || (pk.k === 'c' && pk.to));
      const defending = pk.s !== s && !pk.fly;
      if (!loose && !defending) continue;
      let best = 0, bd = 1e9;
      for (const sp of V.sprites.values()) { if (sp.side !== s || sp.leaving || sp.role === 'G') continue; const d = Math.hypot(sp.x - pk.x, sp.y - pk.y); if (d < bd) { bd = d; best = sp.id; } }
      if (best && (loose || bd < 30)) V.chase[s] = best;
    }
  }

  // ---------- main loop ----------
  function loop(now) {
    if (!V) return;
    const tStart = performance.now();
    try { loopBody(now); } catch (e) { console.error(e); }
    if (V) { V.ms = performance.now() - tStart; V.raf = requestAnimationFrame(loop); }
  }
  function loopBody(now) {
    const dtR = Math.min(0.25, (now - V.last) / 1000); V.last = now;
    let rate = SPEEDS[V.speed];
    if (V.hl) { const F = V.game.frames, i = frameIdx(V.T); let hot = false; for (let j = i; j < Math.min(F.length, i + 6); j++) if ((F[j].k === 's' || F[j].k === 'g') && F[j].t - V.T < 4) hot = true; rate = hot ? 5 : 70; }
    if (V.paused) rate = 0;
    let gdt = dtR * rate;
    const finished = V.game.done && V.T >= endT() - 0.01;
    // holds (whistles, goals, intermissions) freeze the game clock while players reposition
    let adv = gdt;
    if (V.hold > 0) { V.hold -= Math.max(gdt, V.paused ? 0 : dtR * 1.6); adv = 0; if (V.hold <= 0) endHold(); }
    if (!finished && adv > 0) {
      ensure(adv + 6);
      const F = V.game.frames; const i0 = frameIdx(V.T); let newT = Math.min(V.T + adv, endT());
      // stop at the next whistle-type frame to start a hold
      void i0;
      while (V.hp < F.length && F[V.hp].t <= newT) {
        const j = V.hp++, k = F[j].k;
        if (k === 'fo' || k === 'g' || k === 'int' || k === 'fz') { newT = Math.max(V.T, F[j].t); startHold(F[j], j); break; }
      }
      V.T = newT;
      catchUp();
    }
    // physics substeps
    const pk = puckAt(V.T);
    V.puck = V.holdKind === 'fo' && V.holdInfo ? { x: V.holdInfo.x, y: V.holdInfo.y, h: 0, s: pk.s } : pk;
    chooseChasers(V.puck);
    const simDt = Math.max(gdt, V.hold > 0 ? dtR * 1.6 : 0);
    const n = Math.min(40, Math.ceil(simDt / 0.05));
    for (let k = 0; k < n; k++) moveAll(simDt / n);
    for (const [id, sp] of V.sprites) if (sp.leaving && (Math.hypot(sp.x - benchGate(sp.side)[0], sp.y - benchGate(sp.side)[1]) < 3 || V.T - sp.leftAt > 6)) V.sprites.delete(id);
    // puck trail
    V.trail.push([V.puck.x, V.puck.y]); if (V.trail.length > 5) V.trail.shift();
    draw(dtR);
    updateHud();
    if (V.game.done && V.T >= endT() - 0.01 && !V.finalShown && V.hold <= 0) showFinal();
  }
  function startHold(f, j) {
    V.heldFrame = j;
    if (f.k === 'fo') { V.hold = HOLD.fo; V.holdKind = 'fo'; V.holdInfo = { x: f.x, y: f.y }; }
    else if (f.k === 'fz') { V.hold = HOLD.fz; V.holdKind = 'fz'; V.holdInfo = null; }
    else if (f.k === 'g') {
      V.hold = V.so ? HOLD.so : HOLD.goal; V.holdKind = V.so ? 'fz' : 'goal';
      const ge = V.game.events.find(e => e.ty === 'goal' && Math.abs(e.t - f.t) < 1.5);
      const scorer = ge && ge.pid ? V.L.players[ge.pid] : null;
      const sp = ge && ge.pid ? V.sprites.get(ge.pid) : null;
      const at = sp ? [clamp(sp.x + (dirOf(f.s, Math.min(V.per, 4)) > 0 ? -12 : 12), 20, 180), sp.y < 42.5 ? 8 : 77] : [100, 8];
      V.holdInfo = { s: f.s, at };
      if (!V.so) { V.banner = { txt: 'GOAL!', sub: scorer ? `${fullName(scorer)}` : '', col: V.teams[f.s].c1, s: f.s, t: 0 }; V.flash = 1; V.goalLight = { x: f.x > 100 ? 193 : 7, t: HOLD.goal }; }
    }
    else if (f.k === 'int') {
      V.hold = HOLD.int; V.holdKind = 'int';
      const per = V.game.events.filter(e => e.ty === 'per' && e.t <= f.t + 0.01).length;
      V.banner = { txt: `END OF ${['', '1ST', '2ND', '3RD', 'OT'][Math.min(4, per - 1)] || 'PERIOD'}`, sub: `${V.teams[1].abbr} ${scoreAt(f.t)[1]}  -  ${V.teams[0].abbr} ${scoreAt(f.t)[0]}`, col: '#000', t: 0 };
      V.zamboni = 0;
    }
  }
  function endHold() {
    const k = V.holdKind; V.hold = 0; V.holdKind = null; V.holdInfo = null;
    if (k === 'int') { V.banner = null; catchUp(); snapUnits(); V.holdKind = null; }
    if (k === 'goal') V.banner = null;
  }
  function moveAll(dt) {
    if (dt <= 0) return;
    const pk = V.puck;
    for (const sp of V.sprites.values()) {
      const [tx, ty] = targetFor(sp, pk, V.T);
      const dx = tx - sp.x, dy = ty - sp.y, d = Math.hypot(dx, dy);
      const carrier = pk.h === sp.id;
      const max = (sp.role === 'G' ? 14 : 17 + sp.spd * 0.16) * (carrier ? 1.7 : 1) * (sp.leaving ? 0.8 : 1);
      const want = Math.min(max, d * (carrier ? 9 : 2.6));
      const ux = d > 0.01 ? dx / d : 0, uy = d > 0.01 ? dy / d : 0;
      const acc = carrier ? 30 : 6;
      sp.vx += (ux * want - sp.vx) * Math.min(1, acc * dt); sp.vy += (uy * want - sp.vy) * Math.min(1, acc * dt);
      sp.x += sp.vx * dt; sp.y += sp.vy * dt;
      if (!sp.leaving) { sp.x = clamp(sp.x, 2, 198); sp.y = clamp(sp.y, 1.5, 83.5); }
    }
    // keep skaters from stacking on one spot
    const arr = [...V.sprites.values()];
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j]; const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < 3) { const push = (3 - d) * 0.5; a.x -= dx / d * push; a.y -= dy / d * push; b.x += dx / d * push; b.y += dy / d * push; }
    }
  }
  function scoreAt(T) { let sc = [0, 0]; for (const e of V.game.events) { if (e.t > T + 1e-6) break; if (e.sc) sc = e.sc; } if (V.game.done && T >= endT() - 0.01) sc = V.game.score.slice(); return sc; }
  function clockStr(c) { c = Math.max(0, Math.ceil(c)); return `${Math.floor(c / 60)}:${String(c % 60).padStart(2, '0')}`; }

  // ---------- drawing ----------
  function draw(dtR) {
    const c = V.ctx;
    c.drawImage(V.bg, 0, 0);
    // goal light
    if (V.goalLight && V.goalLight.t > 0) { V.goalLight.t -= dtR; if (Math.floor(V.goalLight.t * 6) % 2 === 0) { c.fillStyle = '#ff2b2b'; c.fillRect(X(V.goalLight.x) - 4, Y(42.5) - 18, 8, 5); } }
    const per = Math.min(V.per, 4);
    const sprites = [...V.sprites.values()].sort((a, b) => a.y - b.y);
    const pk = V.puck;
    // zamboni during intermission
    if (V.holdKind === 'int') {
      V.zamboni = (V.zamboni || 0) + dtR * 22;
      const zx = 20 + (V.zamboni % 160), zy = 20 + Math.floor(V.zamboni / 160) % 3 * 22;
      c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(X(zx - 16), Y(zy - 3), 16 * S, 6 * S);
      c.fillStyle = '#2457c5'; c.fillRect(X(zx), Y(zy - 4), 7 * S, 8 * S); c.fillStyle = '#fff'; c.fillRect(X(zx + 4), Y(zy - 3), 2 * S, 3 * S);
    }
    if (V.so) {
      // shootout: shooter and goalie only
      const F = V.game.frames, i = frameIdx(V.T), f = F[i];
      const sh = f && f.h ? V.L.players[f.h] : null;
      const s = f ? f.s : 0, gid = V.game.g[1 - s];
      const gp = V.L.players[gid];
      drawGoalie(c, { x: dirOf(s, 1) > 0 ? 186 : 14, y: 42.5, team: V.teams[1 - s], num: gp ? gp.num : 0 }, dirOf(s, 1) > 0 ? -1 : 1);
      if (sh) drawSkater(c, { x: pk.x - dirOf(s, 1) * 1.5, y: pk.y, vx: 5, vy: 0, team: V.teams[s], num: sh.num, ph: 0, mine: s === V.userSide }, V.T, dirOf(s, 1), true, pk);
    } else {
      for (const sp of sprites) {
        const facing = sp.vx > 3 ? 1 : sp.vx < -3 ? -1 : dirOf(sp.side, per);
        if (sp.role === 'G' && !sp.leaving) drawGoalie(c, sp, dirOf(sp.side, per)); else drawSkater(c, sp, V.T, facing, pk.h === sp.id, pk);
      }
    }
    // puck + trail
    if (pk.fly) for (let i = 0; i < V.trail.length - 1; i++) { c.fillStyle = `rgba(20,20,30,${0.08 + i * 0.06})`; c.fillRect(Math.round(X(V.trail[i][0])) - 1, Math.round(Y(V.trail[i][1])) - 1, 2, 2); }
    c.fillStyle = '#000'; c.fillRect(Math.round(X(pk.x)) - 1, Math.round(Y(pk.y)) - 1, 3, 3);
    c.fillStyle = '#555'; c.fillRect(Math.round(X(pk.x)) - 1, Math.round(Y(pk.y)) - 1, 3, 1);
    // carrier label
    if (pk.h && !V.holdKind) { const p = V.L.players[pk.h]; const sp = V.sprites.get(pk.h); if (p && sp) label(c, shortName(p), X(sp.x), Y(sp.y) - 20, pk.s === V.userSide ? '#ffd23f' : '#fff'); }
    // banner
    if (V.banner) {
      V.banner.t += dtR;
      const b = V.banner, w = CW, y0 = CH / 2 - 30;
      c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(0, y0, w, 60);
      c.fillStyle = b.col; c.fillRect(0, y0, w, 4); c.fillRect(0, y0 + 56, w, 4);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '20px "Press Start 2P", monospace'; c.fillStyle = Math.floor(b.t * 4) % 2 && b.txt === 'GOAL!' ? '#ff4d5e' : '#ffd23f'; c.fillText(b.txt, CW / 2, y0 + 22);
      c.font = '9px "Press Start 2P", monospace'; c.fillStyle = '#fff'; c.fillText(b.sub, CW / 2, y0 + 44);
    }
    if (V.paused) { c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 0, CW, CH); c.font = '12px "Press Start 2P", monospace'; c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText('PAUSED', CW / 2, CH / 2); }
  }
  function label(c, txt, x, y, col) {
    c.font = '7px "Press Start 2P", monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = c.measureText(txt).width + 6;
    c.fillStyle = 'rgba(0,0,0,.65)'; c.fillRect(Math.round(x - w / 2), Math.round(y - 5), Math.round(w), 10);
    c.fillStyle = col; c.fillText(txt, Math.round(x), Math.round(y) + 1);
  }
  function updateHud() {
    const el = V.el, G = V.game;
    const sc = scoreAt(V.T);
    el.querySelector('#gvS0').textContent = sc[0]; el.querySelector('#gvS1').textContent = sc[1];
    const per = V.per, ps = V.perStarts[per] || 0;
    const len = per > 3 && !V.playoff ? 300 : 1200;
    const fin = G.done && V.T >= endT() - 0.01;
    el.querySelector('#gvClock').textContent = fin ? 'FINAL' : V.so ? 'SO' : clockStr(len - (V.T - ps));
    el.querySelector('#gvPer').textContent = fin ? (G.so ? 'Shootout' : G.ot ? 'Overtime' : '') : V.so ? 'Shootout' : per <= 3 ? ['', '1st', '2nd', '3rd'][per] + ' period' : V.playoff ? `OT${per - 3 > 1 ? per - 3 : ''}` : 'OT 3-on-3';
    // strength
    const n = V.units.map(u => u.filter(x => x[1] !== 'G').length), noG = V.units.map(u => u.length && !u.some(x => x[1] === 'G'));
    let pp = '';
    if (!fin && !V.so) {
      if (noG[0] || noG[1]) pp = `<span class="gv-pp">${esc(V.teams[noG[0] ? 0 : 1].abbr)} EMPTY NET</span> `;
      if (n[0] !== n[1] && n[0] && n[1] && !(per > 3 && !V.playoff && Math.max(...n) <= 3)) {
        const s = n[0] > n[1] ? 0 : 1; const pe = [...G.events].reverse().find(e => e.ty === 'pen' && e.t <= V.T && e.s === 1 - s);
        const left = pe ? Math.max(0, 120 - (V.T - pe.t)) : 0;
        pp += `<span class="gv-pp">${esc(V.teams[s].abbr)} POWER PLAY ${n[s]}v${n[1 - s]}${left ? ' ' + clockStr(left) : ''}</span>`;
      }
    }
    const ppEl = el.querySelector('#gvPP'); if (ppEl.innerHTML !== pp) ppEl.innerHTML = pp;
    const sog = [0, 0]; for (const [t, s] of G.sogT) { if (t > V.T) break; sog[s]++; }
    const shots = `<b>${sog[1]}</b><span class="px small dim">SHOTS</span><b>${sog[0]}</b>`;
    const shEl = el.querySelector('#gvShots'); if (shEl.innerHTML !== shots) shEl.innerHTML = shots;
    const ice = [1, 0].map(s => `<div><b style="color:${V.teams[s].c1 === '#000000' ? '#aaa' : 'var(--acc)'}">${esc(V.teams[s].abbr)}</b> ${V.units[s].map(([id, r]) => { const p = V.L.players[id]; return p ? `<span title="${esc(fullName(p))}">${r === 'G' ? 'G' : '#' + p.num} ${esc(p.ln)}</span>` : ''; }).join(' · ')}</div>`).join('');
    const iEl = el.querySelector('#gvIce'); if (iEl.innerHTML !== ice) iEl.innerHTML = ice;
  }
  function showFinal() {
    V.finalShown = true;
    const G = V.game, res = G.result();
    // commit now so the box score is real
    if (!V.committed) { V.committed = true; V.cb.commit(res); }
    const stars = (res.stars || []).map((id, i) => {
      const p = V.L.players[id]; if (!p) return ''; const b = res.box[id];
      const line = p.pos === 'G' ? `${b.sa - b.ga} saves` : `${b.g}G ${b.a}A${b.sog ? ', ' + b.sog + ' SOG' : ''}`;
      return `<div class="star"><div class="px">${'★'.repeat(3 - i)} ${['1ST', '2ND', '3RD'][i]} STAR</div><img src="${Faces.portrait(p, V.L.teams[p.tid] || null, 2)}" width="60" style="image-rendering:pixelated"><div>${esc(fullName(p))}</div><div class="dim small">${esc(V.L.teams[p.tid] ? V.L.teams[p.tid].abbr : '')} · ${line}</div></div>`;
    }).join('');
    const w = res.hs > res.as ? 0 : 1;
    const won = V.userSide >= 0 ? (w === V.userSide ? '<span class="good">WIN</span>' : '<span class="bad">LOSS</span>') : '';
    V.el.querySelector('#gvFinal').innerHTML = `<section class="panel"><h3 class="px">FINAL${G.so ? ' (SO)' : G.ot ? ' (OT)' : ''} · ${esc(V.teams[1].abbr)} ${res.as} - ${esc(V.teams[0].abbr)} ${res.hs} ${won}</h3>
      <div class="stars">${stars}</div><div class="center"><button class="btn alt" data-gv="box">BOX SCORE</button> <button class="btn" data-gv="done">CONTINUE &gt;</button></div></section>`;
    drawCtrl();
  }
  return { open, close, isOpen: () => !!V, advance: (sec, step) => { step = step || 0.05; for (let t = 0; t < sec && V; t += step) loopBody(V.last + step * 1000); }, debug: () => V && { ms: V.ms, T: V.T, hold: V.hold, kind: V.holdKind, frames: V.game.frames.length, sprites: V.sprites.size }, CW, CH, drawBackground };
})();
