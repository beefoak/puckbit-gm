'use strict';
// ================= UI: shell, team pages, league pages =================
let G = null;
const UI = { tab: 'home', rPos: 'ALL', rSort: 'ovr', rDir: -1, stMode: 'sk', stScope: 'reg', stTeam: 'ALL', stSort: 'pts', stPos: 'ALL', stDir: -1, schedDay: null, stand: 'div', histTab: 'mug', histYear: null, histFid: null, recTab: 'season', awYear: null, newsAll: false, watch: true, lineSel: null, faPos: 'ALL', tr: { partner: null, mine: [], theirs: [] }, busy: false };

const $ = (s) => document.querySelector(s);
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3200); }
function persist() { if (!saveLeague(G)) toast('Could not save - browser storage is full or blocked.'); }
const TM = (tid) => G.teams[tid];
const panel = (title, body, cls) => `<section class="panel ${cls || ''}">${title ? `<h3 class="px">${title}</h3>` : ''}${body}</section>`;
function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

// ---------- pixel sweater crests ----------
const CREST = [
  '..11......11..',
  '.1111.22.1111.',
  '11111.22.11111',
  '11111111111111',
  '11111111111111',
  '.111111111111.',
  '..1111111111..',
  '..1111111111..',
  '..2222222222..',
  '..1111111111..',
  '..2222222222..',
  '..1111111111..',
  '..1111111111..',
];
const _crest = {};
function crestFor(c1, c2, size) {
  const key = c1 + c2;
  if (!_crest[key]) {
    const W = CREST[0].length, H = CREST.length, sc = 4;
    const cv = document.createElement('canvas'); cv.width = (W + 2) * sc; cv.height = (H + 2) * sc;
    const c = cv.getContext('2d');
    const at = (x, y) => (CREST[y] && CREST[y][x]) || '.';
    for (let y = -1; y <= H; y++) for (let x = -1; x <= W; x++) {
      const v = at(x, y);
      if (v === '.') { const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) !== '.'); if (nb) { c.fillStyle = '#000'; c.fillRect((x + 1) * sc, (y + 1) * sc, sc, sc); } continue; }
      c.fillStyle = v === '1' ? c1 : c2; c.fillRect((x + 1) * sc, (y + 1) * sc, sc, sc);
    }
    _crest[key] = cv.toDataURL();
  }
  return `<img class="helm" alt="" src="${_crest[key]}" width="${size}" height="${Math.round(size * 15 / 16)}">`;
}
function crest(tid, size) { const t = TM(tid); return t ? crestFor(t.c1, t.c2, size || 20) : ''; }
function fidCrest(fid, year, size) { const f = fidInfo(G, fid, year); return crestFor(f.c1, f.c2, size || 18); }
function teamLink(tid, full) { const t = TM(tid); return `<a class="tlink" data-act="team" data-id="${tid}">${crest(tid, 20)}<span>${full ? esc(t.city + ' ' + t.name) : t.abbr}</span></a>`; }
function fidLink(fid, year, full) {
  const f = fidInfo(G, fid, year);
  const inner = `${fidCrest(fid, year, 18)}<span>${esc(full ? f.city + ' ' + f.name : f.abbr)}</span>`;
  return fid < N_CUR ? `<a class="tlink" data-act="team" data-id="${fid}">${inner}</a>` : `<span class="tlink">${inner}</span>`;
}
function pLink(p, short) { return `<a class="plink" data-act="player" data-id="${p.id}">${esc(short ? shortName(p) : fullName(p))}</a>`; }
function pidLink(pid, name) { return G.players[pid] || G.retired.some(r => r.pid === pid) ? `<a class="plink" data-act="player" data-id="${pid}">${esc(name)}</a>` : esc(name); }
function ovrCls(v) { return v >= 88 ? 'o-elite' : v >= 78 ? 'o-great' : v >= 68 ? 'o-good' : v >= 58 ? 'o-avg' : 'o-low'; }
function ovrB(v) { return `<span class="ovr ${ovrCls(v)}">${v}</span>`; }
function potB(v, gen) { return gen ? '<span class="pot pot-s" title="Generational talent">S</span>' : `<span class="pot">${potGrade(v)}</span>`; }
function statusTag(p) { if (!p.injury) return p.farm ? '<span class="dim">FARM</span>' : '<span class="ok">OK</span>'; return `<span class="${p.injury.ill ? 'ill' : 'inj'}">${p.ir ? 'IR ' : ''}${esc(p.injury.name)} ${p.injury.games <= 2 ? 'DTD' : p.injury.games + 'g'}</span>`; }
function contractStr(p) { return p.contract ? `${fmtM(p.contract.sal)} → ${seasonLabel(p.contract.exp)}${p.contract.elc ? ' ELC' : ''}` : '<span class="dim">none</span>'; }
const f1 = (n, d) => d ? (n / d).toFixed(1) : '0.0';
const pct = (n, d) => d ? (n / d * 100).toFixed(1) : '-';

// ---------- Top level ----------
function render() {
  const app = $('#app');
  if (!G) { app.innerHTML = renderStart(); return; }
  app.innerHTML = renderHeader() + `<div class="layout">${renderNav()}<main id="main">${renderTab()}</main></div><footer class="foot">PUCKBIT GM · a fictional league, not affiliated with any pro league · autosaves in this browser</footer>`;
  if (UI.tab === 'home') drawHomeRink();
}
const NAMES_KEY = 'phl_team_names';
function startNames() {
  if (!UI.names) {
    let saved = null; try { saved = JSON.parse(localStorage.getItem(NAMES_KEY) || 'null'); } catch (e) { saved = null; }
    UI.names = FRANCHISES.slice(0, N_CUR).map((f, i) => { const e = f.eras[f.eras.length - 1]; return { name: saved && saved[i] && saved[i].name || e[3], abbr: saved && saved[i] && saved[i].abbr || e[4] }; });
  }
  return UI.names;
}
function setStartName(i, field, raw) {
  const names = startNames(), e = FRANCHISES[i].eras[FRANCHISES[i].eras.length - 1];
  if (field === 'name') { const v = raw.replace(/[<>]/g, '').trim().slice(0, 18); names[i].name = v || e[3]; }
  else {
    const v = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (v.length < 2) { toast('Abbreviations need 2-4 letters.'); render(); return; }
    if (names.some((n, j) => j !== i && n.abbr === v)) { toast(`${v} is already taken.`); render(); return; }
    names[i].abbr = v;
  }
  try { localStorage.setItem(NAMES_KEY, JSON.stringify(names)); } catch (e) { /* ignore */ }
}
function renderStart() {
  const saved = hasSave();
  let h = `<div class="start"><div class="logo px">PUCK<span>BIT</span> GM</div>
  <p class="tag">Run a pro hockey franchise with 66 seasons of league history behind it. Draft, trade, build your arena, hire your coaches, and chase Stanley's Mug.</p>
  <div class="center"><button class="btn alt" data-act="helpOpen">? HOW TO PLAY</button></div>`;
  if (UI.loading) return h + `<div class="center" style="margin-top:40px"><p class="px gold blink2">${esc(UI.loading)}</p><p class="dim">Simulating every season since 1960: expansions, relocations, drafts, trades, dynasties.</p></div></div>`;
  if (saved) h += `<div class="center" style="margin-top:14px"><button class="btn big" data-act="continue">&gt; CONTINUE SAVED GAME</button></div>`;
  h += `<h2 class="px">${UI.editNames ? 'NAME YOUR LEAGUE' : saved ? 'OR START A NEW FRANCHISE' : 'CHOOSE YOUR TEAM'}</h2>
  <div class="center">${UI.editNames ? `<p class="dim">Rename any team and its abbreviation (2-4 letters). Cities, colors and history stay the same.</p><button class="btn" data-act="namesDone">DONE - PICK A TEAM</button><button class="btn alt" data-act="namesReset">RESET TO DEFAULTS</button>` : `<button class="btn alt" data-act="namesEdit">CUSTOMIZE TEAM NAMES</button>`}</div><div class="pick-grid">`;
  for (const conf of CONFS) for (const div of DIVS[conf]) {
    h += `<div class="pick-div"><div class="px small">${conf.toUpperCase()} · ${div.toUpperCase()}</div>`;
    FRANCHISES.slice(0, N_CUR).forEach((f, i) => {
      if (f.conf !== conf || f.div !== div) return;
      const e = f.eras[f.eras.length - 1], nm = startNames()[i];
      const since = f.eras[0][0], moved = f.eras.length > 1 ? `<span class="dim small"> · est. ${since}${f.eras.length > 1 ? ' as ' + esc(f.eras[0][2]) : ''}</span>` : `<span class="dim small"> · est. ${since}</span>`;
      if (UI.editNames) h += `<div class="name-edit" style="--c1:${e[5]}">${crestFor(e[5], e[6], 30)}<div><div class="small">${esc(e[2])}</div><input class="tn" maxlength="18" value="${esc(nm.name)}" data-change="tname" data-i="${i}" data-f="name" aria-label="${esc(e[2])} team name"><input class="ta" maxlength="4" value="${esc(nm.abbr)}" data-change="tname" data-i="${i}" data-f="abbr" aria-label="${esc(e[2])} abbreviation"></div></div>`;
      else h += `<button class="pick-team" data-act="newgame" data-id="${i}" style="--c1:${e[5]};--c2:${e[6]}">${crestFor(e[5], e[6], 34)}<span>${esc(e[2])}<br><b>${esc(nm.name)}</b>${moved}</span></button>`;
    });
    h += `</div>`;
  }
  return h + `</div></div>`;
}

function phaseLabel() {
  const y = seasonLabel(G.year);
  switch (G.phase) {
    case 'regular': return `${y} · DAY ${G.day}/${G.lastDay}`;
    case 'playoffs': return `${y} · ${roundName(G.playoffs.round, 4).toUpperCase()}`;
    case 'postseason': return `${y} · SEASON OVER`;
    case 'draft': return `${G.year} DRAFT`;
    case 'resign': return `${y} · RE-SIGNING`;
    case 'fa': return `${y} · FREE AGENCY DAY ${Math.min(G.faDay, 5)}/5`;
    case 'preseason': return `${y} · PRESEASON`;
  }
  return y;
}
function capChip() { const u = TM(G.userTeam); const sp = capSpace(G, u); return `<a class="plink ${sp < 0 ? 'bad' : ''}" data-act="tab" data-tab="contracts">CAP ${fmtM(payroll(G, u))}/${fmtM(G.cap)}</a>`; }
function phaseButtons() {
  if (UI.busy) return `<span class="px small gold blink2">SIMULATING…</span><button class="btn danger tiny" data-act="stopSim">STOP</button>`;
  if (G.ops && G.ops.event) return `<span class="px small bad blink2">⚠ ${esc(G.ops.event.title.toUpperCase())}</span><button class="btn" data-act="opsEvent">RESPOND &gt;</button>`;
  switch (G.phase) {
    case 'regular': {
      const ug = userGameToday(G);
      const lbl = ug ? `&gt; ${UI.watch ? 'WATCH' : 'PLAY'} ${ug.home === G.userTeam ? 'vs' : '@'} ${TM(ug.home === G.userTeam ? ug.away : ug.home).abbr}` : '&gt; SIM DAY (NO GAME)';
      return `<button class="btn" data-act="playDay">${lbl}</button><button class="btn alt" data-act="simDays" data-n="7">» WEEK</button>${G.day <= G.deadlineDay ? `<button class="btn alt" data-act="simDays" data-n="deadline">» DEADLINE</button>` : ''}<button class="btn alt" data-act="simDays" data-n="season">»» PLAYOFFS</button>`;
    }
    case 'playoffs': {
      const ug = userGameToday(G);
      const lbl = ug ? `&gt; ${UI.watch ? 'WATCH' : 'PLAY'} GAME ${ug.k + 1} ${ug.home === G.userTeam ? 'vs' : '@'} ${TM(ug.home === G.userTeam ? ug.away : ug.home).abbr}` : '&gt; SIM PLAYOFF DAY';
      return `<button class="btn" data-act="playDay">${lbl}</button><button class="btn alt" data-act="simDays" data-n="round">» ROUND</button><button class="btn alt" data-act="simDays" data-n="playoffs">»» CROWN A CHAMPION</button>`;
    }
    case 'postseason': return G.hofVoted === G.year ? `<button class="btn alt" data-act="tab" data-tab="hof">HALL OF FAME</button><button class="btn" data-act="offseason">&gt; BEGIN OFFSEASON</button>` : `<button class="btn" data-act="hofBallot">HALL OF FAME VOTE</button><button class="btn alt" data-act="offseason" title="The selection committee inducts the clear cases for you">SKIP VOTE &gt; OFFSEASON</button>`;
    case 'draft': {
      const D = G.draft, onClock = D && !draftDone(G) && D.picks[D.cur].tid === G.userTeam;
      return `${onClock ? '<span class="px small gold blink2">YOU ARE ON THE CLOCK</span>' : ''}<button class="btn alt" data-act="tab" data-tab="draft">DRAFT BOARD</button>${!onClock && !draftDone(G) ? '<button class="btn alt" data-act="draftToMe">SIM TO MY PICK</button>' : ''}<button class="btn" data-act="finishDraft">»» FINISH DRAFT</button>`;
    }
    case 'resign': return `<button class="btn alt" data-act="tab" data-tab="contracts">EXPIRING DEALS (${expiring(G, TM(G.userTeam)).length})</button><button class="btn" data-act="startFA">OPEN FREE AGENCY &gt;</button>`;
    case 'fa': return `<button class="btn alt" data-act="tab" data-tab="fa">FREE AGENTS</button><button class="btn" data-act="faDay">${G.faDay >= 5 ? 'CLOSE FREE AGENCY &gt;' : `NEXT FA DAY (${G.faDay}/5) &gt;`}</button>`;
    case 'preseason': return `<button class="btn alt" data-act="tab" data-tab="lines">LINES</button><button class="btn alt" data-act="autoCut">AUTO-SET ROSTER</button><button class="btn" data-act="startSeason">&gt; START ${seasonLabel(G.year)}</button>`;
  }
  return '';
}
function renderHeader() {
  const u = TM(G.userTeam);
  const offers = G.offers.length ? `<button class="btn tiny gold-btn blink2" data-act="tab" data-tab="trade">✉ ${G.offers.length} TRADE OFFER${G.offers.length > 1 ? 'S' : ''}</button>` : '';
  return `<header class="top" style="--c1:${u.c1};--c2:${u.c2}">
    <div class="brand px">PUCKBIT GM</div>
    <div class="me">${crest(u.id, 44)}<div><div class="px tname">${esc(u.city)} ${esc(u.name)}</div><div class="sub">${recStr(u.rec)} · ${recPts(u.rec)} PTS · ${phaseLabel()} · ${capChip()}${G.ops ? ` · <a class="plink fan-chip ${fanMood(G.ops.fans)[1]}" data-act="tab" data-tab="ops">FANS ${Math.round(G.ops.fans)}</a>` : ''}</div></div></div>
    <div class="actions">${phaseButtons()}</div>
    <div class="menu"><label class="chk"><input type="checkbox" data-change="watch" ${UI.watch ? 'checked' : ''}> Watch my games live</label>
    <label class="chk" title="Let the AI call up and send down players when injuries hit"><input type="checkbox" data-change="autoRoster" ${G.autoRoster ? 'checked' : ''}> Auto-manage roster</label>
    ${offers}<button class="btn tiny alt" data-act="tab" data-tab="help">? HELP</button><button class="btn tiny alt" data-act="save">SAVE</button><button class="btn tiny danger" data-act="quit">NEW GAME</button></div>
  </header>`;
}
const NAV_GROUPS = [
  ['TEAM', [['home', 'Home'], ['roster', 'Roster'], ['lines', 'Lines'], ['injuries', 'Injuries'], ['coaches', 'Coaches']]],
  ['FRONT OFFICE', [['contracts', 'Contracts & Cap'], ['fa', 'Free Agents'], ['trade', 'Trade'], ['draft', 'Draft & Scouting'], ['ops', 'Arena Ops']]],
  ['LEAGUE', [['schedule', 'Schedule'], ['standings', 'Standings'], ['playoffs', 'Playoffs'], ['stats', 'Stats'], ['teamstats', 'Team Stats'], ['news', 'News']]],
  ['ARCHIVE', [['history', "Stanley's Mug"], ['awards', 'Awards'], ['records', 'Records'], ['hof', 'Hall of Fame']]],
  ['', [['help', '? Help']]],
];
function renderNav() {
  const show = ([k]) => k !== 'playoffs' || G.playoffs || G.seasons[G.year];
  const cur = NAV_GROUPS.flatMap(g => g[1]).find(([k]) => k === UI.tab);
  const groups = NAV_GROUPS.map(([title, tabs]) => `<div class="nav-group">${title ? `<div class="nav-title px">${title}</div>` : ''}${tabs.filter(show).map(([k, n]) => `<button class="tab ${UI.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${n}</button>`).join('')}</div>`).join('');
  return `<nav class="side ${UI.navOpen ? 'open' : ''}"><button class="nav-toggle px" data-act="navToggle">${UI.navOpen ? '✕' : '☰'} MENU <span class="dim">· ${cur ? cur[1] : 'Home'}</span></button><div class="nav-body">${groups}</div></nav>`;
}
function renderTab() {
  const f = { home: vHome, roster: vRoster, lines: vLines, injuries: vInjuries, coaches: vCoaches, contracts: vContracts, fa: vFA, trade: vTrade, draft: vDraft, ops: vOps, schedule: vSchedule, standings: vStandings, playoffs: vPlayoffs, stats: vStats, teamstats: vTeamStats, news: vNews, history: vHistory, awards: vAwards, records: vRecords, hof: vHof, help: vHelp }[UI.tab] || vHome;
  try { return f(); } catch (e) { console.error(e); return panel('ERROR', `<p class="bad">This page hit an error: ${esc(e.message)}</p>`); }
}

// ---------- Home ----------
function teamRatings(L, team) {
  const lines = gameLines(L, team);
  const P = (id) => L.players[id];
  const avg = (ids, f) => { const xs = ids.filter(Boolean).map(id => f(P(id).attrs)); return xs.length ? Math.round(sum(xs) / xs.length) : 0; };
  const fw = lines.F.flat(), dm = lines.D.flat();
  const off = avg([...fw.slice(0, 9), ...dm.slice(0, 4)], a => offR(a) * 0.6 + shotR(a) * 0.4);
  const def = avg([...fw, ...dm], a => defR(a));
  const g = lines.G[0] ? Math.round(gkR(P(lines.G[0]).attrs)) : 0;
  const ovr = Math.round(off * 0.4 + def * 0.35 + g * 0.25);
  return { off, def, g, ovr };
}
function drawHomeRink() {
  const cv = $('#homeRink'); if (!cv) return;
  const u = TM(G.userTeam); const ctx = cv.getContext('2d');
  ctx.drawImage(Rink.drawBackground(u, u), 0, 0);
}
function vHome() {
  const u = TM(G.userTeam); const r = teamRatings(G, u);
  const ds = divStandings(G, u.conf, u.div); const rk = ds.findIndex(t => t.id === u.id) + 1;
  const bar = (l, v) => `<div class="rbar"><span>${l}</span><div class="bar"><i style="width:${clamp((v - 45) * 2, 4, 100)}%" class="${ovrCls(v)}"></i></div><b>${v}</b></div>`;
  let h = `<canvas id="homeRink" class="banner" width="${Rink.CW}" height="${Rink.CH}"></canvas><div class="grid2">`;
  const mugs = G.champions.filter(c => c.champ === u.id).length;
  h += panel('FRANCHISE', `<div class="franchise">${crest(u.id, 72)}<div><div class="px big-name">${esc(u.city)}<br>${esc(u.name)}</div>
    <div class="sub">${recStr(u.rec)} · ${recPts(u.rec)} pts · ${ordinal(rk)} in ${esc(u.div)} · GF ${u.rec.gf} GA ${u.rec.ga}${u.rec.strk ? ` · Streak ${u.rec.strk > 0 ? 'W' + u.rec.strk : 'L' + -u.rec.strk}` : ''}</div>
    <div class="sub">${mugs ? `<span class="mug">🏆</span> ${mugs} Stanley's Mug title${mugs > 1 ? 's' : ''}` : 'Still chasing a first Mug'} · ${franchiseLine(u.id)}</div></div></div>
    ${bar('OFFENSE', r.off)}${bar('DEFENSE', r.def)}${bar('GOALTENDING', r.g)}${bar('OVERALL', r.ovr)}
    <div class="sub">Team morale: ${typeof moraleChip === 'function' ? moraleChip({ morale: teamMorale(G, u.id) }, true) : '-'}</div>
    <div class="sub">Active roster ${activeRoster(G, u).length}/${ROSTER_LIMIT} · Farm ${farmRoster(G, u).length}/${FARM_LIMIT} · IR ${rosterPlayers(G, u).filter(p => p.ir).length}</div>${rosterWarnings(u)}`);
  h += panel(G.phase === 'regular' || G.phase === 'playoffs' ? 'NEXT UP' : 'THE SEASON', homeGameCard());
  h += `</div><div class="grid3">`;
  h += panel(`${esc(u.div.toUpperCase())} DIVISION`, miniDiv(u.conf, u.div));
  const tops = nhlRoster(G, u).sort((a, b) => b.ovr - a.ovr).slice(0, 7);
  h += panel('TOP PLAYERS', `<table class="tbl">${tops.map(p => `<tr><td>${ovrB(p.ovr)}</td><td>${p.pos}</td><td>${pLink(p)}</td><td class="dim small">${esc(statLine(p))}</td></tr>`).join('')}</table>`);
  const inj = rosterPlayers(G, u).filter(p => p.injury).sort((a, b) => b.ovr - a.ovr);
  h += panel('INJURY REPORT', inj.length ? `<table class="tbl">${inj.slice(0, 8).map(p => `<tr><td>${p.pos}</td><td>${pLink(p, true)}</td><td>${statusTag(p)}</td></tr>`).join('')}</table>` : '<p class="dim">Everybody is healthy.</p>');
  h += `</div>`;
  const items = G.news.filter(n => UI.newsAll || n.tid === G.userTeam || n.tid === -1).slice(0, 40);
  h += panel(`NEWS <button class="btn tiny alt" data-act="newsAll">${UI.newsAll ? 'SHOW MINE' : 'SHOW ALL'}</button>`, newsList(items));
  return h;
}
function franchiseLine(fid) {
  const f = FRANCHISES[fid]; if (!f) return '';
  if (f.eras.length === 1) return `Est. ${f.eras[0][0]}`;
  return f.eras.map(e => `${esc(e[2])} ${esc(e[3])} (${e[0]}${e[1] === NOW ? '-' : '-' + e[1]})`).join(' → ');
}
function newsList(items) { return `<ul class="news">${items.map(n => `<li><span class="dim">${seasonLabel(n.y)}${n.d ? ' D' + n.d : ''}</span> ${n.tid >= 0 && TM(n.tid) ? crest(n.tid, 16) : '★'} ${esc(n.text)}</li>`).join('') || '<li class="dim">No news yet.</li>'}</ul>`; }
function statLine(p) {
  const s = p.stats;
  if (p.pos === 'G') return s.gp ? `${s.w}-${s.l}-${s.otl + s.t}, ${fmtSv(svPct(s))}, ${gaa(s).toFixed(2)}` : '';
  return s.gp ? `${s.gp} GP, ${s.g}G ${s.a}A ${pts(s)}P, ${s.pm > 0 ? '+' : ''}${s.pm}` : '';
}
function rosterWarnings(u) {
  const act = activeRoster(G, u), healthy = posCounts(act.filter(p => !p.injury));
  const w = [];
  if (act.length > ROSTER_LIMIT) w.push(`Active roster ${act.length} > ${ROSTER_LIMIT}: send players to the farm`);
  if (healthy.G < 2) w.push(`Only ${healthy.G} healthy goalie(s)`);
  if (healthy.D < 6) w.push(`Only ${healthy.D} healthy defensemen`);
  if (healthy.C + healthy.LW + healthy.RW < 12) w.push(`Only ${healthy.C + healthy.LW + healthy.RW} healthy forwards`);
  if (capSpace(G, u) < 0) w.push(`Over the cap by ${fmtM(-capSpace(G, u))}`);
  return w.length ? `<div class="warn">⚠ ${w.join('<br>⚠ ')}</div>` : '';
}
function miniDiv(conf, div) {
  const marks = G.phase === 'regular' ? {} : {};
  return `<table class="tbl small"><tr><th></th><th>TEAM</th><th>GP</th><th>W-L-OT</th><th>PTS</th></tr>${divStandings(G, conf, div).map((t, i) => `<tr class="${t.id === G.userTeam ? 'me-row' : ''}"><td class="dim">${i + 1}${marks[t.id] || ''}</td><td>${teamLink(t.id)}</td><td>${t.rec.gp}</td><td>${recStr(t.rec)}</td><td><b>${recPts(t.rec)}</b></td></tr>`).join('')}</table>`;
}
function homeGameCard() {
  const u = TM(G.userTeam);
  if (G.phase === 'resign') return `<p>The new league year has begun. The cap is now <b>${fmtM(G.cap)}</b>.</p><p>You have <b>${expiring(G, u).length}</b> expiring contracts. Re-sign the ones you want before free agency opens.</p><button class="btn" data-act="tab" data-tab="contracts">REVIEW EXPIRING DEALS</button>`;
  if (G.phase === 'fa') return `<p>Free agency day ${G.faDay}/5. Cap space: <b>${fmtM(capSpace(G, u))}</b>.</p><p class="dim">Players get more willing to sign as days pass, if nobody else grabs them first.</p><button class="btn" data-act="tab" data-tab="fa">SHOP FREE AGENTS</button>`;
  if (G.phase === 'draft') { const mine = G.draft.picks.filter(p => p.tid === G.userTeam && !p.pid); return `<p>The ${G.year} Draft is underway. Your remaining picks: ${mine.map(p => `R${p.rd} #${p.ovr}`).join(', ') || 'none'}</p><button class="btn" data-act="tab" data-tab="draft">GO TO DRAFT BOARD</button>`; }
  if (G.phase === 'preseason') return `<p>Training camp. Set your lines, trim the active roster to ${ROSTER_LIMIT} (extra players go to the farm team), get under the cap and start the season.</p>${rosterWarnings(u) || '<p class="good">Roster is legal.</p>'}<button class="btn" data-act="tab" data-tab="lines">SET LINES</button>`;
  if (G.phase === 'postseason') {
    const c = G.champions[G.champions.length - 1];
    return `<div class="champ"><div class="mug" style="font-size:44px">🏆</div><div class="px gold">${seasonLabel(c.year)} STANLEY'S MUG CHAMPIONS</div>${fidLink(c.champ, c.year, true)}<div class="dim">def. ${esc(c.runnerName)} ${esc(c.score)}</div>${c.mvp ? `<div class="small">Conn Smithers: ${pidLink(c.mvp.pid, c.mvp.name)} (${esc(c.mvp.line)})</div>` : ''}<div>Your season: <b>${esc(playoffResult(G, G.userTeam))}</b></div></div>`;
  }
  const ug = userGameToday(G);
  const nxt = ug || (G.phase === 'regular' ? G.schedule.find(g => !g.played && (g.home === G.userTeam || g.away === G.userTeam)) : null);
  let h = '';
  if (nxt) {
    const opp = nxt.home === G.userTeam ? nxt.away : nxt.home;
    h += `<div class="match"><div class="mteam">${crest(u.id, 44)}<div class="px small">${u.abbr}</div><div class="dim small">${recStr(u.rec)}</div></div><div class="vs px">${nxt.home === G.userTeam ? 'VS' : '@'}</div><div class="mteam">${crest(opp, 44)}<div class="px small">${TM(opp).abbr}</div><div class="dim small">${recStr(TM(opp).rec)}</div></div></div>
      <p class="center dim">${ug ? 'Today' : `Day ${nxt.day}`}${G.phase === 'playoffs' && nxt.k !== undefined ? ` · Game ${nxt.k + 1}` : ''}</p>`;
  } else if (G.phase === 'regular') h += '<p class="dim">No games left.</p>';
  else if (G.phase === 'playoffs') h += `<p>${G.playoffs.series.some(s => !s.done && (s.hi === G.userTeam || s.lo === G.userTeam)) ? 'Your series continues.' : 'You are out of the playoffs. Sim ahead to see who lifts the Mug.'}</p>`;
  const last = allUserGames().filter(g => g.played).pop();
  if (last) h += `<div class="lastgame"><div class="px small dim">LAST GAME</div>${scoreChip(last)}</div>`;
  return h;
}
function allUserGames() { const pg = G.playoffs ? G.playoffs.games.filter(g => g.home === G.userTeam || g.away === G.userTeam) : []; return [...G.schedule.filter(g => g.home === G.userTeam || g.away === G.userTeam), ...pg]; }
function scoreChip(g) {
  const fin = g.played ? (g.so ? 'F/SO' : g.ot ? 'F/OT' : 'F') : '';
  const row = (tid, sc, win) => `<div class="gc-row ${win ? 'win' : ''}">${crest(tid, 16)}<span>${TM(tid).abbr}</span><b>${g.played ? sc : ''}</b></div>`;
  return `<div class="gchip ${g.played ? 'click' : ''}" ${g.played ? `data-act="box" data-id="${g.id}"` : ''}>${row(g.away, g.as, g.played && g.as > g.hs)}${row(g.home, g.hs, g.played && g.hs > g.as)}<div class="dim small">${fin || (g.k !== undefined ? 'Game ' + (g.k + 1) : 'Day ' + g.day)}</div></div>`;
}

// ---------- Roster ----------
function vRoster() {
  const u = TM(G.userTeam);
  let ps = rosterPlayers(G, u);
  const showFarm = UI.rPos === 'FARM';
  ps = ps.filter(p => showFarm ? p.farm : !p.farm && (UI.rPos === 'ALL' || (UI.rPos === 'F' ? FWD.includes(p.pos) : p.pos === UI.rPos)));
  const key = { ovr: p => p.ovr, pot: p => p.pot, age: p => p.age, pos: p => POSITIONS.indexOf(p.pos), sal: p => p.contract ? p.contract.sal : 0, pts: p => p.pos === 'G' ? p.stats.w : pts(p.stats), name: p => p.ln }[UI.rSort] || (p => p.ovr);
  ps.sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * UI.rDir);
  const th = (k, l) => `<th class="sort ${UI.rSort === k ? 'on' : ''}" data-act="rSort" data-k="${k}">${l}</th>`;
  const filt = ['ALL', 'F', 'C', 'LW', 'RW', 'D', 'G', 'FARM'].map(k => `<button class="chip ${UI.rPos === k ? 'on' : ''}" data-act="rPos" data-k="${k}">${k === 'FARM' ? `FARM (${farmRoster(G, u).length})` : k}</button>`).join('');
  const rows = ps.map(p => `<tr><td>${ovrB(p.ovr)}</td><td>${potB(p.pot, p.gen)}</td><td>${p.pos}</td><td class="dim">#${p.num}</td><td>${pLink(p)}${p.gen ? ' <span class="pot-s pot">S</span>' : ''}</td><td>${p.age}</td><td class="small">${esc(p.style || playerStyle(p))}</td><td>${statusTag(p)}</td><td class="small">${typeof moraleChip === 'function' ? moraleChip(p) : ''}</td><td class="small">${esc(statLine(p))}</td><td class="small">${contractStr(p)}</td>
    <td>${p.farm ? `<button class="btn tiny" data-act="callUp" data-id="${p.id}">CALL UP</button>` : `<button class="btn tiny alt" data-act="sendDown" data-id="${p.id}">FARM</button>`}</td></tr>`).join('');
  return panel(`ROSTER · ${activeRoster(G, u).length}/${ROSTER_LIMIT} ACTIVE · ${farmRoster(G, u).length}/${FARM_LIMIT} FARM`, `<div class="filters">${filt}</div>${rosterWarnings(u)}
    <div class="scroll"><table class="tbl"><tr>${th('ovr', 'OVR')}${th('pot', 'POT')}${th('pos', 'POS')}<th>#</th>${th('name', 'NAME')}${th('age', 'AGE')}<th>STYLE</th><th>STATUS</th><th>MOOD</th>${th('pts', 'SEASON')}${th('sal', 'CONTRACT')}<th></th></tr>${rows}</table></div>
    <p class="dim small">Farm (AHL) players don't count against the cap or the ${ROSTER_LIMIT}-man active roster. Injured players out 7+ games go on IR automatically. Click a name for ratings, career stats, and to release or trade him.</p>`);
}
function vInjuries() {
  const all = Object.values(G.players).filter(p => p.injury && p.tid >= 0 && (UI.injAll || p.tid === G.userTeam)).sort((a, b) => b.injury.games - a.injury.games);
  return panel(`INJURIES <button class="btn tiny alt" data-act="injAll">${UI.injAll ? 'MY TEAM' : 'WHOLE LEAGUE'}</button>`, all.length ? `<table class="tbl"><tr><th>TEAM</th><th>POS</th><th>PLAYER</th><th>OVR</th><th>INJURY</th><th>OUT</th></tr>${all.map(p => `<tr><td>${teamLink(p.tid)}</td><td>${p.pos}</td><td>${pLink(p)}</td><td>${ovrB(p.ovr)}</td><td class="${p.injury.ill ? 'ill' : 'inj'}">${esc(p.injury.name)}${p.ir ? ' (IR)' : ''}</td><td>${p.injury.games <= 2 ? 'day-to-day' : p.injury.games + ' games'}</td></tr>`).join('')}</table>` : '<p class="dim">No injuries.</p>');
}

// ---------- Lines editor ----------
function userLines() {
  const u = TM(G.userTeam);
  if (G.autoLines || !u.lines) u.lines = autoLines(G, u);
  return u.lines;
}
function vLines() {
  const u = TM(G.userTeam), Ls = userLines();
  const P = (id) => G.players[id];
  const sel = UI.lineSel;
  const slot = (grp, i, j, role) => {
    const id = grp === 'G' ? Ls.G[i] : Ls[grp][i][j]; const p = P(id);
    const isSel = sel && sel.grp === grp && sel.i === i && sel.j === j;
    const bad = p && (p.injury || p.tid !== u.id || p.farm);
    const fit = p && role && role !== 'G' && (['D', 'LD', 'RD'].includes(role) ? p.pos !== 'D' : !FWD.includes(p.pos)) ? ' <span class="bad small">OOP</span>' : '';
    return `<div class="slot-row ${isSel ? 'sel' : ''} ${bad ? 'inj' : ''}" data-act="lineSlot" data-g="${grp}" data-i="${i}" data-j="${j === undefined ? '' : j}"><span class="rl">${role}</span><span class="nm">${p ? `${esc(shortName(p))} <span class="dim small">${p.pos}</span>${fit}${p.injury ? ' <span class="inj small">INJ</span>' : ''}` : '<span class="dim">- empty -</span>'}</span>${p ? ovrB(p.ovr) : '<span></span>'}</div>`;
  };
  const card = (title, body, note) => `<div class="line-card"><h4 class="px"><span>${title}</span><span class="dim">${note || ''}</span></h4>${body}</div>`;
  const lineOvr = (ids) => { const ps = ids.map(P).filter(Boolean); return ps.length ? Math.round(sum(ps, p => p.ovr) / ps.length) : 0; };
  let h = `<div class="bar-row"><div class="filters"><button class="chip ${G.autoLines ? 'on' : ''}" data-act="autoLines" data-v="1">AUTO LINES</button><button class="chip ${G.autoLines ? '' : 'on'}" data-act="autoLines" data-v="0">MANUAL</button><button class="btn tiny alt" data-act="resetLines">REBUILD FROM BEST</button><button class="btn tiny alt" data-act="rebuildSpecial">REBUILD PP/PK</button></div>
    <span class="dim small">${sel ? 'Now click another slot or a player in the pool to swap.' : 'Click a slot, then another slot or a pool player to swap them.'}</span></div>`;
  h += `<div class="lines-grid">`;
  Ls.F.forEach((ln, i) => { h += card(`LINE ${i + 1}`, ['C', 'LW', 'RW'].map((r, j) => slot('F', i, j, r)).join(''), `OVR ${lineOvr(ln)} · ${['~31%', '~28%', '~23%', '~18%'][i]} TOI`); });
  Ls.D.forEach((ln, i) => { h += card(`D PAIR ${i + 1}`, ['LD', 'RD'].map((r, j) => slot('D', i, j, r)).join(''), `OVR ${lineOvr(ln)}`); });
  h += card('GOALIES', slot('G', 0, undefined, 'G') + slot('G', 1, undefined, 'G') + `<div class="small" style="margin-top:6px">Starter plays <select data-change="gShare">${[0.6, 0.65, 0.7, 0.76, 0.82, 0.88, 0.94].map(v => `<option value="${v}" ${Math.abs((u.gShare || 0.76) - v) < 0.01 ? 'selected' : ''}>${Math.round(v * 100)}%</option>`).join('')}</select> of regular-season games</div>`, '');
  Ls.PP.forEach((ln, i) => { h += card(`POWER PLAY ${i + 1}`, ln.map((id, j) => slot('PP', i, j, j < 3 ? 'F' : j === 3 ? (i === 0 ? 'F' : 'D') : 'D')).join(''), `OVR ${lineOvr(ln)}`); });
  Ls.PK.forEach((ln, i) => { h += card(`PENALTY KILL ${i + 1}`, ln.map((id, j) => slot('PK', i, j, j < 2 ? 'F' : 'D')).join(''), `OVR ${lineOvr(ln)}`); });
  h += `</div>`;
  // pool
  const used = new Set([...Ls.F.flat(), ...Ls.D.flat(), ...Ls.G]);
  const pool = nhlRoster(G, u).filter(p => !used.has(p.id)).sort((a, b) => POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || b.ovr - a.ovr);
  h += panel('SCRATCHES & EXTRAS', pool.length ? `<div class="pool-list">${pool.map(p => `<div class="slot-row ${p.injury ? 'inj' : ''}" data-act="linePool" data-id="${p.id}"><span class="rl">${p.pos}</span><span class="nm">${esc(fullName(p))} ${statusTag(p)}</span>${ovrB(p.ovr)}</div>`).join('')}</div>` : '<p class="dim">Everyone on the active roster is in the lineup.</p>');
  h += `<p class="dim small">Injured players in your lines are replaced automatically on game day by the best healthy extra. OOP = out of position (a forward on defense or vice versa) - it works, but his defensive or offensive ratings carry less weight. Your power-play and penalty-kill units can reuse players from the regular lines.</p>`;
  return h;
}
function lineGet(Ls, s) { return s.grp === 'G' ? Ls.G[s.i] : Ls[s.grp][s.i][s.j]; }
function lineSet(Ls, s, id) { if (s.grp === 'G') Ls.G[s.i] = id; else Ls[s.grp][s.i][s.j] = id; }
function onLineSlot(grp, i, j) {
  const Ls = userLines(); const cur = { grp, i: +i, j: j === '' ? undefined : +j };
  if (!UI.lineSel) { UI.lineSel = cur; render(); return; }
  const a = UI.lineSel; UI.lineSel = null;
  if (a.grp === cur.grp && a.i === cur.i && a.j === cur.j) { render(); return; }
  G.autoLines = false;
  const ida = lineGet(Ls, a), idb = lineGet(Ls, cur);
  const special = (x) => x.grp === 'PP' || x.grp === 'PK';
  if (special(a) !== special(cur)) {
    // copying a regular-line player into a special-teams unit
    if (special(cur)) { if (!Ls[cur.grp][cur.i].includes(ida)) lineSet(Ls, cur, ida); }
    else if (!Ls[a.grp][a.i].includes(idb)) lineSet(Ls, a, idb);
  } else { lineSet(Ls, a, idb); lineSet(Ls, cur, ida); }
  persist(); render();
}
function onLinePool(pid) {
  const Ls = userLines(); const s = UI.lineSel;
  if (!s) { toast('Click a lineup slot first, then the player to put there.'); return; }
  UI.lineSel = null; G.autoLines = false;
  const p = G.players[+pid];
  if (s.grp === 'G' && p.pos !== 'G') { toast('Only goalies can play goal.'); render(); return; }
  if (s.grp !== 'G' && p.pos === 'G') { toast('Goalies stay in the crease.'); render(); return; }
  if ((s.grp === 'PP' || s.grp === 'PK') && Ls[s.grp][s.i].includes(p.id)) { render(); return; }
  lineSet(Ls, s, p.id); persist(); render();
}

// ---------- Schedule ----------
function vSchedule() {
  if (!G.schedule.length) return panel('SCHEDULE', `<p class="dim">The ${seasonLabel(G.year)} schedule is released when the season starts.</p>`);
  const mine = G.schedule.filter(g => g.home === G.userTeam || g.away === G.userTeam);
  const day = UI.schedDay === null ? Math.max(1, Math.min(G.day, G.lastDay)) : UI.schedDay;
  const games = dayGames(G, day);
  let h = panel(`LEAGUE SCOREBOARD · DAY ${day} <span><button class="btn tiny alt" data-act="schedDay" data-d="${day - 1}" ${day <= 1 ? 'disabled' : ''}>◀</button><button class="btn tiny alt" data-act="schedDay" data-d="${day + 1}" ${day >= G.lastDay ? 'disabled' : ''}>▶</button><button class="btn tiny" data-act="schedDay" data-d="today">TODAY</button></span>`,
    games.length ? `<div class="games">${games.map(scoreChip).join('')}</div>` : '<p class="dim">No games on this day.</p>');
  let w = 0, l = 0, o = 0;
  const rows = mine.map(g => {
    const home = g.home === G.userTeam, opp = home ? g.away : g.home;
    let res = '';
    if (g.played) { const us = home ? g.hs : g.as, them = home ? g.as : g.hs; const win = us > them; if (win) w++; else if (g.ot || g.so) o++; else l++; res = `<span class="${win ? 'good' : 'bad'}">${win ? 'W' : g.ot || g.so ? 'OTL' : 'L'} ${us}-${them}${g.so ? ' SO' : g.ot ? ' OT' : ''}</span> <span class="dim small">${w}-${l}-${o}</span>`; }
    return `<tr class="${g.day === G.day && !g.played ? 'me-row' : ''} ${g.played ? 'clickrow' : ''}" ${g.played ? `data-act="box" data-id="${g.id}"` : ''}><td class="dim">${g.day}</td><td>${home ? 'vs' : '@'}</td><td>${teamLink(opp)}</td><td>${res || '<span class="dim">-</span>'}</td></tr>`;
  }).join('');
  h += panel(`${esc(TM(G.userTeam).abbr)} SCHEDULE · ${mine.length} GAMES`, `<div class="scroll tall"><table class="tbl"><tr><th>DAY</th><th></th><th>OPPONENT</th><th>RESULT</th></tr>${rows}</table></div><p class="dim small">Trade deadline: day ${G.deadlineDay}. Click a played game for the box score.</p>`);
  return h;
}
function findGame(id) { return G.schedule.find(g => g.id === id) || (G.playoffs && G.playoffs.games.find(g => g.id === id)); }

// ---------- Standings ----------
function standRows(teams, marks, showConf) {
  return teams.map((t, i) => {
    const r = t.rec, l10 = r.l10.slice(-10); const l10s = `${l10.filter(x => x === 'W').length}-${l10.filter(x => x === 'L').length}-${l10.filter(x => x === 'O').length}`;
    return `<tr class="${t.id === G.userTeam ? 'me-row' : ''}"><td class="dim">${i + 1}</td><td>${teamLink(t.id, true)} ${marks[t.id] ? `<span class="rk">${marks[t.id]}</span>` : ''}</td>${showConf ? `<td class="dim small">${t.conf[0]}</td>` : ''}<td>${r.gp}</td><td>${r.w}</td><td>${r.l}</td><td>${r.otl}</td><td><b>${recPts(r)}</b></td><td>${recPct(r).toFixed(3).replace(/^0/, '')}</td><td>${r.rw}</td><td>${r.row}</td><td>${r.gf}</td><td>${r.ga}</td><td class="${r.gf - r.ga > 0 ? 'good' : r.gf - r.ga < 0 ? 'bad' : ''}">${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td>${r.home.join('-')}</td><td>${r.away.join('-')}</td><td>${l10s}</td><td>${r.strk ? (r.strk > 0 ? 'W' + r.strk : 'L' + -r.strk) : '-'}</td></tr>`;
  }).join('');
}
const STAND_HEAD = (conf) => `<tr><th></th><th>TEAM</th>${conf ? '<th>C</th>' : ''}<th>GP</th><th>W</th><th>L</th><th>OTL</th><th>PTS</th><th>P%</th><th>RW</th><th>ROW</th><th>GF</th><th>GA</th><th>DIFF</th><th>HOME</th><th>AWAY</th><th>L10</th><th>STRK</th></tr>`;
function vStandings() {
  const marks = G.phase !== 'preseason' && G.day > 1 ? clinchMarks(G) : {};
  const modes = [['div', 'DIVISION'], ['conf', 'CONFERENCE'], ['wc', 'WILD CARD'], ['league', 'LEAGUE']];
  let h = `<div class="filters">${modes.map(([k, l]) => `<button class="chip ${UI.stand === k ? 'on' : ''}" data-act="stand" data-k="${k}">${l}</button>`).join('')}</div>`;
  if (UI.stand === 'league') return h + panel('LEAGUE STANDINGS', `<div class="scroll"><table class="tbl">${STAND_HEAD(true)}${standRows(G.teams.slice().sort(cmpTeams), marks, true)}</table></div>`);
  for (const conf of CONFS) {
    if (UI.stand === 'conf') { h += panel(`${conf.toUpperCase()} CONFERENCE`, `<div class="scroll"><table class="tbl">${STAND_HEAD()}${standRows(confStandings(G, conf), marks)}</table></div>`); continue; }
    if (UI.stand === 'wc') {
      const s = playoffSeeds(G, conf); const top = new Set([...s.d1, ...s.d2]);
      let b = '';
      for (const [i, div] of DIVS[conf].entries()) b += `<tr><td colspan="17" class="divh px small">${div.toUpperCase()}</td></tr>${standRows((i ? s.d2 : s.d1).map(TM), marks)}`;
      b += `<tr><td colspan="17" class="divh px small">WILD CARD</td></tr>${standRows(confStandings(G, conf).filter(t => !top.has(t.id)), marks)}`;
      h += panel(`${conf.toUpperCase()} CONFERENCE`, `<div class="scroll"><table class="tbl">${STAND_HEAD()}${b}</table></div>`); continue;
    }
    for (const div of DIVS[conf]) h += panel(`${div.toUpperCase()} DIVISION`, `<div class="scroll"><table class="tbl">${STAND_HEAD()}${standRows(divStandings(G, conf, div), marks)}</table></div>`);
  }
  return h + `<p class="dim small">y = division leader, x = in playoff position, w = wild card. Wins are worth 2 points, overtime/shootout losses 1. Top three in each division plus two wild cards per conference make the playoffs.</p>`;
}

// ---------- Playoffs ----------
function seriesCard(s, info) {
  const T = (tid) => info ? info(tid) : { link: teamLink(tid), id: tid };
  const mine = s.hi === G.userTeam || s.lo === G.userTeam;
  const row = (tid, w, lbl) => `<div class="srow ${s.winner === tid ? 'win' : ''}"><span class="seed">${lbl || ''}</span>${T(tid).link}<b>${w}</b></div>`;
  return `<div class="series ${mine && !info ? 'mine' : ''}">${row(s.hi, s.w[0], s.lbl && s.lbl[0])}${row(s.lo, s.w[1], s.lbl && s.lbl[1])}${s.done || s.winner !== null && s.winner !== undefined ? '' : '<div class="dim small">in progress</div>'}</div>`;
}
function vPlayoffs() {
  const P = G.playoffs;
  if (!P) {
    const last = G.seasons[G.year - 1] || G.seasons[G.year];
    return panel('PLAYOFFS', `<p class="dim">The playoffs start after day ${G.lastDay || 105} of the regular season.</p>`) + (last && last.po ? bracketHtml(last.po, G.year - 1) : '');
  }
  let h = '';
  if (P.champion !== null) { const c = G.champions[G.champions.length - 1]; h += panel('', `<div class="champ"><div class="mug" style="font-size:44px">🏆</div><div class="px gold">${seasonLabel(G.year)} STANLEY'S MUG CHAMPIONS</div><div class="px">${esc(c.champName.toUpperCase())}</div><div class="dim">def. ${esc(c.runnerName)} ${esc(c.score)}</div>${c.mvp ? `<div>Conn Smithers Trophy: ${pidLink(c.mvp.pid, c.mvp.name)} (${esc(c.mvp.pos)}, ${esc(c.mvp.line)})</div>` : ''}</div>`, 'recpanel'); }
  h += `<div class="bracket">`;
  for (let r = 0; r < 4; r++) {
    const ss = P.series.filter(s => s.r === r);
    h += `<div class="round"><div class="px small">${roundName(r, 4).toUpperCase()}</div>${ss.length ? ss.map(s => seriesCard(s)).join('') : '<div class="dim small">TBD</div>'}</div>`;
  }
  h += `</div>`;
  const today = playoffTodayGames(G);
  if (today.length) h += panel(`TODAY · PLAYOFF DAY ${P.day + 1}`, `<div class="games">${today.map(scoreChip).join('')}</div>`);
  const played = P.games.filter(g => g.played).slice(-24).reverse();
  if (played.length) h += panel('RECENT PLAYOFF GAMES', `<div class="games">${played.map(scoreChip).join('')}</div>`);
  return h;
}
function bracketHtml(po, year) {
  const info = (fid) => ({ link: fidLink(fid, year) });
  let h = `<div class="bracket">`;
  po.forEach((ss, r) => { h += `<div class="round"><div class="px small">${roundName(r, po.length).toUpperCase()}</div>${ss.map(s => seriesCard(Object.assign({ done: true }, s), info)).join('')}</div>`; });
  return h + `</div>`;
}

// ---------- Stats ----------
const SK_COLS = {
  basic: [['GP', 'gp'], ['G', 'g'], ['A', 'a'], ['PTS', s => pts(s)], ['+/-', 'pm'], ['PIM', 'pim'], ['PPG', 'ppg'], ['PPP', s => st(s, 'ppg') + st(s, 'ppa')], ['SHG', 'shg'], ['GWG', 'gwg'], ['SOG', 'sog'], ['SH%', s => pct(st(s, 'g'), st(s, 'sog'))], ['TOI/GP', s => st(s, 'gp') ? fmtToi(st(s, 'toi') / st(s, 'gp')) : '-'], ['FO%', s => pct(st(s, 'fow'), st(s, 'fow') + st(s, 'fol'))]],
  adv: [['GP', 'gp'], ['P/60', s => st(s, 'toi') ? (pts(s) / st(s, 'toi') * 3600).toFixed(2) : '-'], ['CF', 'cf'], ['CA', 'ca'], ['CF%', s => pct(st(s, 'cf'), st(s, 'cf') + st(s, 'ca'))], ['ixG', s => st(s, 'ixg').toFixed(1)], ['G-ixG', s => (st(s, 'g') - st(s, 'ixg')).toFixed(1)], ['HIT', 'hit'], ['BLK', 'blk'], ['TK', 'tk'], ['GV', 'gv'], ['TK-GV', s => st(s, 'tk') - st(s, 'gv')], ['HAT', 'hat'], ['STARS', 'gs']],
};
const G_COLS = [['GP', 'gp'], ['GS', 'gs'], ['W', 'w'], ['L', 'l'], ['OTL', s => st(s, 'otl') + st(s, 't')], ['SA', 'sa'], ['GA', 'ga'], ['SV%', s => fmtSv(svPct(s))], ['GAA', s => gaa(s).toFixed(2)], ['SO', 'so'], ['xGA', s => st(s, 'xga').toFixed(1)], ['GSAx', s => (st(s, 'xga') - st(s, 'ga')).toFixed(1)], ['TOI', s => fmtToi(st(s, 'gtoi'))]];
function colVal(s, c) { return typeof c[1] === 'function' ? c[1](s) : st(s, c[1]); }
function vStats() {
  const scope = UI.stScope, isG = UI.stMode === 'g';
  const cols = isG ? G_COLS : SK_COLS[UI.stMode === 'adv' ? 'adv' : 'basic'];
  let ps = Object.values(G.players).filter(p => p.tid >= 0 && (isG ? p.pos === 'G' : p.pos !== 'G') && (UI.stTeam === 'ALL' || p.tid === +UI.stTeam) && (UI.stPos === 'ALL' || isG || (UI.stPos === 'F' ? FWD.includes(p.pos) : p.pos === UI.stPos)));
  const S = (p) => scope === 'po' ? p.pstats : p.stats;
  ps = ps.filter(p => st(S(p), 'gp') > 0);
  if (isG && scope === 'reg' && UI.stTeam === 'ALL') { const minGs = Math.max(1, Math.floor(G.day / 7)); ps = ps.filter(p => st(S(p), 'gs') >= minGs || UI.stSort === 'gp'); }
  const sc = cols.find(c => c[0] === UI.stSort) || cols[isG ? 7 : 3];
  const num = (v) => typeof v === 'number' ? v : parseFloat(v) || (v === '-' ? -1e9 : 0);
  const low = isG && (sc[0] === 'GAA' || sc[0] === 'GA' || sc[0] === 'L');
  ps.sort((a, b) => (num(colVal(S(b), sc)) - num(colVal(S(a), sc))) * (low ? -1 : 1) * (UI.stDir === 1 ? -1 : 1));
  const modes = [['sk', 'SKATERS'], ['adv', 'ADVANCED'], ['g', 'GOALIES']];
  const teams = `<select data-change="stTeam"><option value="ALL">All teams</option>${G.teams.map(t => `<option value="${t.id}" ${String(t.id) === String(UI.stTeam) ? 'selected' : ''}>${esc(t.abbr)}</option>`).join('')}</select>`;
  let h = `<div class="filters">${modes.map(([k, l]) => `<button class="chip ${UI.stMode === k ? 'on' : ''}" data-act="stMode" data-k="${k}">${l}</button>`).join('')} <button class="chip ${scope === 'reg' ? 'on' : ''}" data-act="stScope" data-k="reg">REGULAR SEASON</button><button class="chip ${scope === 'po' ? 'on' : ''}" data-act="stScope" data-k="po">PLAYOFFS</button> ${teams}
    ${isG ? '' : ['ALL', 'F', 'C', 'LW', 'RW', 'D'].map(k => `<button class="chip ${UI.stPos === k ? 'on' : ''}" data-act="stPos" data-k="${k}">${k}</button>`).join('')}</div>`;
  const rows = ps.slice(0, 150).map((p, i) => `<tr class="${p.tid === G.userTeam ? 'me-row' : ''}"><td class="dim">${i + 1}</td><td>${pLink(p)}</td><td>${teamLink(p.tid)}</td><td>${p.pos}</td>${cols.map(c => `<td class="${c === sc ? 'gold' : ''}">${colVal(S(p), c)}</td>`).join('')}</tr>`).join('');
  h += panel(`${scope === 'po' ? 'PLAYOFF' : seasonLabel(G.year)} ${isG ? 'GOALTENDING' : UI.stMode === 'adv' ? 'ADVANCED SKATER STATS' : 'SCORING'}`, ps.length ? `<div class="scroll tall"><table class="tbl small adv"><tr><th>#</th><th>PLAYER</th><th>TEAM</th><th>POS</th>${cols.map(c => `<th class="sort ${c === sc ? 'on' : ''}" data-act="stSort" data-k="${esc(c[0])}">${esc(c[0])}</th>`).join('')}</tr>${rows}</table></div>` : '<p class="dim">No games played yet.</p>');
  h += `<p class="dim small">CF/CA: 5-on-5 shot attempts for/against while on the ice (Corsi). ixG: individual expected goals from shot location, type, rebounds, rushes and manpower. GSAx: goals saved above expected (xGA - GA). P/60: points per 60 minutes. STARS: three-star selections.</p>`;
  return h;
}
function vTeamStats() {
  const rows = G.teams.map(t => {
    const r = t.rec, s = t.ts, gp = r.gp || 1;
    return { t, gfpg: r.gf / gp, gapg: r.ga / gp, pp: s.ppo ? s.ppg / s.ppo * 100 : 0, pk: s.pko ? 100 - s.ppga / s.pko * 100 : 0, sog: s.sog / gp, sa: s.sa / gp, fo: s.fow + s.fol ? s.fow / (s.fow + s.fol) * 100 : 0, cf: s.att + s.atta ? s.att / (s.att + s.atta) * 100 : 0, xgf: s.xgf / gp, xga: s.xga / gp, pim: s.pim / gp, hit: s.hit / gp, blk: s.blk / gp, shp: s.sog ? r.gf / s.sog * 100 : 0, svp: s.sa ? (1 - r.ga / s.sa) * 100 : 0, shg: s.shg };
  });
  const cols = [['GF/G', 'gfpg', 2], ['GA/G', 'gapg', 2], ['PP%', 'pp', 1], ['PK%', 'pk', 1], ['SOG/G', 'sog', 1], ['SA/G', 'sa', 1], ['SH%', 'shp', 1], ['SV%', 'svp', 1], ['FO%', 'fo', 1], ['SAT%', 'cf', 1], ['xGF/G', 'xgf', 2], ['xGA/G', 'xga', 2], ['PIM/G', 'pim', 1], ['HIT/G', 'hit', 1], ['BLK/G', 'blk', 1], ['SHG', 'shg', 0]];
  const k = UI.tsSort || 'gfpg'; const low = ['gapg', 'sa', 'xga', 'pim'].includes(k);
  rows.sort((a, b) => (b[k] - a[k]) * (low ? -1 : 1));
  return panel(`${seasonLabel(G.year)} TEAM STATS`, `<div class="scroll"><table class="tbl small"><tr><th>#</th><th>TEAM</th><th>GP</th>${cols.map(c => `<th class="sort ${k === c[1] ? 'on' : ''}" data-act="tsSort" data-k="${c[1]}">${c[0]}</th>`).join('')}</tr>${rows.map((r, i) => `<tr class="${r.t.id === G.userTeam ? 'me-row' : ''}"><td class="dim">${i + 1}</td><td>${teamLink(r.t.id)}</td><td>${r.t.rec.gp}</td>${cols.map(c => `<td class="${k === c[1] ? 'gold' : ''}">${r[c[1]].toFixed(c[2])}</td>`).join('')}</tr>`).join('')}</table></div><p class="dim small">SAT% is the share of all shot attempts (including misses and blocks) a team takes. xGF/xGA are expected goals for and against per game.</p>`);
}
function vNews() { return panel(`LEAGUE NEWS <button class="btn tiny alt" data-act="newsAll">${UI.newsAll ? 'SHOW MINE' : 'SHOW ALL'}</button>`, newsList(G.news.filter(n => UI.newsAll || n.tid === G.userTeam || n.tid === -1).slice(0, 300))); }

// ---------- Modals ----------
function openModal(html, wide) { const m = $('#modal'); m.innerHTML = `<div class="modal-box ${wide ? 'wide' : ''}"><button class="x" data-act="closeModal">✕</button>${html}</div>`; m.classList.remove('hidden'); m.scrollTop = 0; }
function closeModal() { const m = $('#modal'); m.classList.add('hidden'); m.innerHTML = ''; }
function showBoxModal(g) {
  if (typeof g === 'string') g = findGame(g);
  if (!g || !g.played) return;
  const P = (id) => G.players[id];
  const sum = g.sum || { goals: [], sog: [0, 0] };
  let h = `<div class="rp-score"><div class="rs">${crest(g.away, 40)}<div><div class="px">${TM(g.away).abbr}</div></div><span class="px big">${g.as}</span></div><div class="rs mid"><span class="px small">FINAL${g.so ? '/SO' : g.ot ? '/OT' : ''}</span><span class="dim small">${g.k !== undefined ? 'Playoffs G' + (g.k + 1) : 'Day ' + g.day}</span></div><div class="rs"><span class="px big">${g.hs}</span><div><div class="px">${TM(g.home).abbr}</div></div>${crest(g.home, 40)}</div></div>`;
  if (sum.stars && sum.stars.length) h += `<div class="stars">${sum.stars.map((id, i) => { const p = P(id); return p ? `<div class="star"><div class="px">${'★'.repeat(3 - i)}</div><img src="${Faces.portrait(p, TM(p.tid) || null, 2)}" width="48" style="image-rendering:pixelated"><div class="small">${pLink(p, true)}</div></div>` : ''; }).join('')}</div>`;
  // scoring summary
  const tm = [g.home, g.away];
  const perName = (n) => n <= 3 ? ['', '1st', '2nd', '3rd'][n] : n === 4 ? 'OT' : 'OT' + (n - 3);
  h += `<h4 class="px">SCORING</h4>${sum.goals.length ? `<table class="tbl small">${sum.goals.map(x => { const p = P(x.sc); return `<tr><td class="dim">${perName(x.per)} ${Math.floor(x.clk / 60)}:${String(x.clk % 60).padStart(2, '0')}</td><td>${crest(tm[x.s], 14)} ${TM(tm[x.s]).abbr}</td><td>${p ? pLink(p) : '?'}${x.as.length ? ` <span class="dim">(${x.as.map(id => P(id) ? esc(shortName(P(id))) : '?').join(', ')})</span>` : ' <span class="dim">(unassisted)</span>'} ${x.pp ? '<span class="gold small">PPG</span>' : ''}${x.sh ? '<span class="gold small">SHG</span>' : ''}${x.en ? '<span class="dim small">EN</span>' : ''}</td></tr>`; }).join('')}</table>` : '<p class="dim">No goals.</p>'}${g.so ? '<p class="dim small">Decided in a shootout.</p>' : ''}`;
  if (g.tst) {
    const T = g.tst; const row = (l, a, b) => `<tr><td>${a}</td><td class="center px small dim">${l}</td><td class="r">${b}</td></tr>`;
    h += `<h4 class="px">TEAM STATS</h4><table class="tbl tstats"><tr><th>${TM(g.away).abbr}</th><th></th><th class="r">${TM(g.home).abbr}</th></tr>${row('SHOTS', T[1].sog, T[0].sog)}${row('xG', T[1].xg, T[0].xg)}${row('POWER PLAY', T[1].ppg + '/' + T[1].ppo, T[0].ppg + '/' + T[0].ppo)}${row('FACEOFFS', T[1].fow, T[0].fow)}${row('HITS', T[1].hit, T[0].hit)}${row('BLOCKS', T[1].blk, T[0].blk)}${row('PIM', T[1].pim, T[0].pim)}</table>`;
  } else h += `<p class="dim small">Shots: ${TM(g.away).abbr} ${sum.sog[1]} - ${TM(g.home).abbr} ${sum.sog[0]}. Full box scores are kept for your games and the playoffs.</p>`;
  if (g.box) {
    for (const tid of [g.away, g.home]) {
      const ids = Object.keys(g.box).filter(id => g.box[id].tid === tid && P(id));
      const sk = ids.filter(id => P(id).pos !== 'G').sort((a, b) => (st(g.box[b], 'toi')) - (st(g.box[a], 'toi')));
      const gs = ids.filter(id => P(id).pos === 'G' && st(g.box[id], 'gtoi') > 0);
      h += `<h4 class="px">${crest(tid, 16)} ${esc(TM(tid).name.toUpperCase())}</h4><div class="scroll"><table class="tbl small"><tr><th>SKATER</th><th>G</th><th>A</th><th>+/-</th><th>SOG</th><th>HIT</th><th>BLK</th><th>PIM</th><th>FO</th><th>TOI</th></tr>${sk.map(id => { const b = g.box[id]; return `<tr><td>${P(id).pos} ${pLink(P(id), true)}</td><td>${st(b, 'g')}</td><td>${st(b, 'a')}</td><td>${st(b, 'pm')}</td><td>${st(b, 'sog')}</td><td>${st(b, 'hit')}</td><td>${st(b, 'blk')}</td><td>${st(b, 'pim')}</td><td>${st(b, 'fow') + st(b, 'fol') ? st(b, 'fow') + '/' + (st(b, 'fow') + st(b, 'fol')) : ''}</td><td>${fmtToi(st(b, 'toi'))}</td></tr>`; }).join('')}
        <tr><th>GOALIE</th><th>SA</th><th>GA</th><th>SV%</th><th>DEC</th><th colspan="5">TOI</th></tr>${gs.map(id => { const b = g.box[id]; return `<tr><td>${pLink(P(id), true)}</td><td>${st(b, 'sa')}</td><td>${st(b, 'ga')}</td><td>${fmtSv(svPct(b))}</td><td>${st(b, 'w') ? 'W' : st(b, 'l') ? 'L' : st(b, 'otl') ? 'OTL' : ''}</td><td colspan="5">${fmtToi(st(b, 'gtoi'))}</td></tr>`; }).join('')}</table></div>`;
    }
  }
  openModal(h, true);
}
function ratingBars(p) {
  const keys = p.pos === 'G' ? GOALIE_ATTRS : SKATER_ATTRS;
  return keys.map(k => `<div class="abar"><span>${ATTR_NAMES[k]}</span><div class="bar"><i class="${ovrCls(p.attrs[k])}" style="width:${p.attrs[k]}%"></i></div><b>${p.attrs[k]}</b></div>`).join('');
}
function careerTable(p, lines, cur) {
  const isG = p.pos === 'G';
  const head = isG ? '<tr><th>SEASON</th><th>TM</th><th>GP</th><th>W</th><th>L</th><th>OT</th><th>SV%</th><th>GAA</th><th>SO</th><th>PO GP</th></tr>' : '<tr><th>SEASON</th><th>TM</th><th>GP</th><th>G</th><th>A</th><th>PTS</th><th>+/-</th><th>PIM</th><th>PPG</th><th>SOG</th><th>PO G-A</th></tr>';
  const row = (c, lbl, tm) => isG ? `<tr><td>${lbl}</td><td>${esc(tm || '')}</td><td>${st(c, 'gp')}</td><td>${st(c, 'w')}</td><td>${st(c, 'l')}</td><td>${st(c, 'otl') + st(c, 't')}</td><td>${fmtSv(svPct(c))}</td><td>${st(c, 'gtoi') ? gaa(c).toFixed(2) : '-'}</td><td>${st(c, 'so')}</td><td>${c.pgp || ''}</td></tr>`
    : `<tr><td>${lbl}</td><td>${esc(tm || '')}</td><td>${st(c, 'gp')}</td><td>${st(c, 'g')}</td><td>${st(c, 'a')}</td><td><b>${pts(c)}</b></td><td>${st(c, 'pm')}</td><td>${st(c, 'pim')}</td><td>${st(c, 'ppg')}</td><td>${st(c, 'sog')}</td><td>${c.pgp ? `${c.pg}-${c.pa}` : ''}</td></tr>`;
  const tot = emptyStats(); lines.forEach(c => addStats(tot, c)); if (cur) addStats(tot, cur.s);
  return `<div class="scroll tall"><table class="tbl small">${head}${lines.map(c => row(c, seasonLabel(c.year), c.tm)).join('')}${cur ? row(cur.s, seasonLabel(G.year) + '*', cur.tm) : ''}<tr class="tot">${row(tot, 'CAREER', '').replace(/^<tr>|<\/tr>$/g, '')}</tr></table></div>`;
}
function awardChips(awards) {
  if (!awards || !awards.length) return '';
  const cnt = {}; awards.forEach(a => { cnt[a.k] = (cnt[a.k] || []).concat(a.y); });
  return `<div class="banners">${Object.entries(cnt).map(([k, ys]) => `<span class="trait tp" title="${ys.map(seasonLabel).join(', ')}">${k === 'MUG' ? "🏆 Stanley's Mug" : k === 'AS1' ? 'All-Star' : esc((AWARD_NAMES[k] || [k])[0])} ×${ys.length}</span>`).join('')}</div>`;
}
function showPlayer(pid) {
  pid = +pid;
  const p = G.players[pid];
  if (!p) { const r = G.retired.find(x => x.pid === pid); if (r) return showRetired(r); return; }
  const t = p.tid >= 0 ? TM(p.tid) : null, mine = p.tid === G.userTeam;
  let h = `<div class="pcard" style="--c1:${t ? t.c1 : '#444'}"><img class="pface" src="${Faces.portrait(p, t)}" alt="" title="${esc(Faces.describe(p))}"><div class="pinfo">
    <div class="px pname">${esc(fullName(p))} <span class="dim">#${p.num}</span></div>
    <div>${POS_NAMES[p.pos]} · ${t ? teamLink(t.id, true) : p.tid === -2 ? 'Draft prospect' : 'Free agent'}${p.farm ? ' <span class="dim">(farm)</span>' : ''}</div>
    <div class="dim">Age ${p.age} · ${esc(p.nat)} · ${htStr(p.ht)}, ${p.wt} lb · shoots ${p.hand === 'L' ? 'left' : 'right'} · ${esc(p.style || playerStyle(p))}${p.college ? ' · from ' + esc(p.college) : ''}</div>
    <div class="ratings">${p.tid === -2 ? `<span>Scouted ${ovrB(p.sOvr)} / ${potB(p.sPot)}</span>` : `<span>OVR ${ovrB(p.ovr)}</span><span>POT ${potB(p.pot, p.gen)}</span>`}${typeof moraleChip === 'function' && p.tid >= 0 ? `<span>${moraleChip(p, true)}</span>` : ''}<span>${statusTag(p)}</span></div>
    <div class="small">Contract: ${contractStr(p)}${p.draft ? ` · Drafted ${p.draft.year} R${p.draft.rd} #${p.draft.ovr} by ${esc(p.draft.abbr)}` : ' · Undrafted'}</div>
    <div class="pact">${mine ? `${p.farm ? `<button class="btn tiny" data-act="callUp" data-id="${p.id}">CALL UP</button>` : `<button class="btn tiny alt" data-act="sendDown" data-id="${p.id}">SEND TO FARM</button>`}<button class="btn tiny alt" data-act="tradeBlock" data-id="${p.id}">SHOP IN TRADE</button><button class="btn tiny danger" data-act="release" data-id="${p.id}">RELEASE</button>` : ''}
      ${p.tid === -1 ? `<button class="btn tiny" data-act="faOffer" data-id="${p.id}">OFFER CONTRACT</button>` : ''}
      ${p.tid >= 0 && !mine ? `<button class="btn tiny alt" data-act="tradeFor" data-id="${p.id}">TRADE FOR HIM</button>` : ''}</div></div></div>`;
  h += awardChips(p.awards);
  if (p.tid !== -2) h += `<div class="grid2"><div><h4 class="px">RATINGS</h4>${ratingBars(p)}</div><div><h4 class="px">OVR BY SEASON</h4>${ovrHistory(p)}${p.injHist && p.injHist.length ? `<h4 class="px">INJURY HISTORY</h4><table class="tbl small">${p.injHist.slice(-6).reverse().map(i => `<tr><td>${seasonLabel(i.y)}</td><td>${esc(i.name)}</td><td>${i.games}g</td></tr>`).join('')}</table>` : ''}${typeof moraleWhy === 'function' && p.tid >= 0 ? `<h4 class="px">MOOD</h4><div class="small">${moraleWhy(p)}</div>` : ''}</div></div>`;
  else h += `<p class="dim">Ratings are scouting estimates (scouting level ${p.sc || 0}/3). Spend scouting points on the draft board to sharpen them.</p>`;
  if (p.career.length || p.stats.gp) { h += `<h4 class="px">CAREER</h4>${careerTable(p, p.career, p.stats.gp ? { s: p.stats, tm: t ? t.abbr : 'FA' } : null)}`; }
  openModal(h, true);
}
function ovrHistory(p) {
  const hist = [...(p.ovrHist || []), { y: G.year, o: p.ovr }].slice(-16);
  return `<div class="ohist">${hist.map(x => `<div class="ob"><b>${x.o}</b><i class="${ovrCls(x.o)}" style="height:${clamp((x.o - 35) * 1.5, 4, 100)}px"></i><span>${String(x.y).slice(2)}</span></div>`).join('')}</div>`;
}
function showRetired(r) {
  let h = `<div class="pcard" style="--c1:#444"><div class="pinfo"><div class="px pname">${esc(r.name)} ${r.hof ? '<span class="hof-badge">HALL OF FAME</span>' : ''}</div><div>${POS_NAMES[r.pos] || r.pos} · ${esc(r.nat || '')} · Retired after ${seasonLabel(r.to)}</div>
    <div class="dim">${r.seasons} seasons (${r.from}-${r.to}) · Teams: ${r.teams.map(esc).join(', ')} · Peak OVR ${r.peak}${r.hof ? ` · Inducted ${r.hofYear}` : ''}</div></div></div>`;
  h += awardChips(r.awards);
  const t = r.tot, isG = r.pos === 'G';
  h += `<h4 class="px">CAREER TOTALS</h4><table class="tbl">${isG ? `<tr><th>GP</th><th>W</th><th>L</th><th>SV%</th><th>GAA</th><th>SO</th><th>PO W</th></tr><tr><td>${st(t, 'gp')}</td><td>${st(t, 'w')}</td><td>${st(t, 'l')}</td><td>${fmtSv(svPct(t))}</td><td>${st(t, 'gtoi') ? gaa(t).toFixed(2) : '-'}</td><td>${st(t, 'so')}</td><td>${r.ptot.w}</td></tr>` : `<tr><th>GP</th><th>G</th><th>A</th><th>PTS</th><th>+/-</th><th>PIM</th><th>PO GP</th><th>PO PTS</th></tr><tr><td>${st(t, 'gp')}</td><td>${st(t, 'g')}</td><td>${st(t, 'a')}</td><td><b>${pts(t)}</b></td><td>${st(t, 'pm')}</td><td>${st(t, 'pim')}</td><td>${r.ptot.gp}</td><td>${r.ptot.g + r.ptot.a}</td></tr>`}</table><p class="dim small">Hall of Fame score: ${Math.round(r.score)} (line: ${HOF_LINE}).</p>`;
  openModal(h, true);
}
function showTeam(tid) {
  tid = +tid; const t = TM(tid); if (!t) return;
  const ps = nhlRoster(G, t).sort((a, b) => POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || b.ovr - a.ovr);
  const r = teamRatings(G, t);
  const mugs = G.champions.filter(c => c.champ === tid);
  const S = typeof staffOf === 'function' ? staffOf(G, tid) : {};
  let h = `<div class="pcard" style="--c1:${t.c1}">${crest(tid, 72)}<div class="pinfo"><div class="px pname">${esc(t.city)} ${esc(t.name)}</div><div>${esc(t.conf)} Conference · ${esc(t.div)} Division · ${recStr(t.rec)}, ${recPts(t.rec)} pts</div>
    <div class="dim">${franchiseLine(tid)}</div><div>OFF ${r.off} · DEF ${r.def} · G ${r.g} · Payroll ${fmtM(payroll(G, t))}${S.HC ? ` · HC ${esc(coachName(S.HC))}` : ''}</div>
    <div>${mugs.length ? `🏆 ${mugs.length} Mug${mugs.length > 1 ? 's' : ''}: ${mugs.map(c => seasonLabel(c.year)).join(', ')}` : '<span class="dim">No Stanley\'s Mug titles</span>'}</div>
    ${tid !== G.userTeam ? `<div class="pact"><button class="btn tiny alt" data-act="tradeWith" data-id="${tid}">TRADE WITH ${esc(t.abbr)}</button></div>` : ''}</div></div>`;
  h += `<div class="grid2"><div><h4 class="px">ROSTER</h4><div class="scroll tall"><table class="tbl small"><tr><th>OVR</th><th>POS</th><th>NAME</th><th>AGE</th><th>SEASON</th><th>CONTRACT</th></tr>${ps.map(p => `<tr><td>${ovrB(p.ovr)}</td><td>${p.pos}</td><td>${pLink(p)} ${p.injury ? '<span class="inj small">INJ</span>' : ''}</td><td>${p.age}</td><td class="small">${esc(statLine(p))}</td><td class="small">${contractStr(p)}</td></tr>`).join('')}</table></div></div>`;
  const hist = t.history.slice().reverse().slice(0, 30);
  h += `<div><h4 class="px">FRANCHISE LEADERS</h4>${franLeadersHtml(tid)}<h4 class="px">RECENT SEASONS</h4><div class="scroll tall"><table class="tbl small"><tr><th>SEASON</th><th>TEAM</th><th>REC</th><th>PTS</th><th>RESULT</th></tr>${hist.map(x => `<tr><td>${seasonLabel(x.year)}</td><td>${esc(x.abbr)}</td><td>${x.w}-${x.l}-${(x.otl || 0) + (x.t || 0)}</td><td>${x.pts}</td><td class="${x.result === 'WON THE MUG' ? 'gold' : x.result === 'Missed Playoffs' ? 'dim' : ''} small">${esc(x.result)}</td></tr>`).join('')}</table></div></div></div>`;
  openModal(h, true);
}
function franLeadersHtml(fid) {
  const cats = [['pts', 'POINTS'], ['g', 'GOALS'], ['a', 'ASSISTS'], ['gp', 'GAMES'], ['w', 'GOALIE WINS'], ['so', 'SHUTOUTS']];
  return `<div class="grid2">${cats.map(([k, l]) => { const ls = franLeaders(G, fid, k, 5); return `<div><div class="px small dim">${l}</div><table class="tbl small">${ls.map((e, i) => `<tr><td class="dim">${i + 1}</td><td>${pidLink(e.pid, e.name)}</td><td class="r"><b>${e.v}</b></td></tr>`).join('') || '<tr><td class="dim">-</td></tr>'}</table></div>`; }).join('')}</div>`;
}
