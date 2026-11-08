'use strict';
// ================= UI: history, awards, records, Hall of Fame, help =================
function vHistory() {
  const tabs = [['mug', "STANLEY'S MUG"], ['seasons', 'SEASONS'], ['franchises', 'FRANCHISES'], ['team', 'TEAM HISTORY']];
  let h = `<div class="filters">${tabs.map(([k, l]) => `<button class="chip ${UI.histTab === k ? 'on' : ''}" data-act="histTab" data-k="${k}">${l}</button>`).join('')}</div>`;
  if (UI.histTab === 'seasons') return h + histSeason();
  if (UI.histTab === 'franchises') return h + histFranchises();
  if (UI.histTab === 'team') return h + histTeam();
  // Mug winners
  const tally = {};
  for (const c of G.champions) if (!c.lockout) tally[c.champ] = (tally[c.champ] || 0) + 1;
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 12);
  h += panel("MOST STANLEY'S MUGS", `<div class="banners">${top.map(([fid, n]) => { const f = fidInfo(G, +fid, NOW); return `<div class="pennant pn-champ" style="--c1:${f.c1};--c2:${f.c2}"><span class="pt">${esc(f.abbr)}</span><b>${n}</b><span class="pt">MUGS</span></div>`; }).join('')}</div>`);
  const rows = G.champions.slice().reverse().map(c => c.lockout
    ? `<tr><td>${seasonLabel(c.year)}</td><td colspan="4" class="dim">Season cancelled - lockout. No champion.</td></tr>`
    : `<tr class="${c.champ === G.userTeam ? 'me-row' : ''} clickrow" data-act="histSeason" data-y="${c.year}"><td>${seasonLabel(c.year)}</td><td>🏆 ${fidLink(c.champ, c.year, true)}</td><td>${fidLink(c.runner, c.year, true)}</td><td>${esc(c.score)}</td><td class="small">${c.mvp ? `${pidLink(c.mvp.pid, c.mvp.name)} <span class="dim">${esc(c.mvp.pos)}, ${esc(c.mvp.line)}</span>` : ''}</td></tr>`).join('');
  return h + panel(`STANLEY'S MUG CHAMPIONS · ${G.champions[0] ? G.champions[0].year : 1960}-PRESENT`, `<div class="scroll tall"><table class="tbl"><tr><th>SEASON</th><th>CHAMPION</th><th>FINALIST</th><th>SERIES</th><th>CONN SMITHERS</th></tr>${rows}</table></div><p class="dim small">Teams are shown under the name they played under that season. Click a row for that season's standings and awards.</p>`);
}
function histSeason() {
  const years = Object.keys(G.seasons).map(Number).sort((a, b) => b - a);
  if (!years.length) return panel('SEASONS', '<p class="dim">No completed seasons.</p>');
  const y = UI.histYear && G.seasons[UI.histYear] ? UI.histYear : years[0];
  const S = G.seasons[y];
  let h = `<div class="filters"><select data-change="histYear">${years.map(v => `<option value="${v}" ${v === y ? 'selected' : ''}>${seasonLabel(v)}</option>`).join('')}</select></div>`;
  if (S.lockout) return h + panel(seasonLabel(y), '<p>The entire season was lost to a lockout. No Stanley\'s Mug was awarded.</p>');
  const c = G.champions.find(x => x.year === y);
  if (c) h += panel('', `<div class="champ"><div class="px gold">🏆 ${seasonLabel(y)} CHAMPIONS</div>${fidLink(c.champ, y, true)}<div class="dim">def. ${esc(c.runnerName)} ${esc(c.score)}</div></div>`, 'recpanel');
  const rows = S.teams.slice().sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
  h += `<div class="grid2">`;
  h += panel(`${seasonLabel(y)} STANDINGS · ${S.gp} GAMES`, `<div class="scroll tall"><table class="tbl small"><tr><th>#</th><th>TEAM</th><th>W</th><th>L</th><th>${y >= 2005 ? 'OTL' : y >= 1999 ? 'T/OTL' : 'T'}</th><th>PTS</th><th>GF</th><th>GA</th></tr>${rows.map((t, i) => `<tr class="${t.fid === G.userTeam ? 'me-row' : ''}"><td class="dim">${i + 1}</td><td>${fidLink(t.fid, y)} <span class="dim small">${esc(t.city)}</span></td><td>${t.w}</td><td>${t.l}</td><td>${(t.t || 0) + (t.otl || 0)}</td><td><b>${t.pts}</b></td><td>${t.gf}</td><td>${t.ga}</td></tr>`).join('')}</table></div>`);
  let side = '';
  if (S.lead) {
    const L = (k, l) => S.lead[k] && S.lead[k].length ? `<div><div class="px small dim">${l}</div><table class="tbl small">${S.lead[k].slice(0, 5).map((e, i) => `<tr><td class="dim">${i + 1}</td><td>${pidLink(e.pid, e.name)} <span class="dim">${esc(e.abbr)}</span></td><td class="r"><b>${e.v}</b></td></tr>`).join('')}</table></div>` : '';
    side += `<div class="grid2">${L('pts', 'POINTS')}${L('g', 'GOALS')}${L('a', 'ASSISTS')}${L('w', 'GOALIE WINS')}${L('sv', 'SAVE %')}</div>`;
  }
  const aw = S.aw || G.awards[y];
  if (aw) side += `<h4 class="px">AWARDS</h4>${awardsTable(aw)}`;
  h += panel('LEADERS & AWARDS', side || '<p class="dim">-</p>');
  h += `</div>`;
  if (S.po && S.po.length) h += panel('PLAYOFF BRACKET', bracketHtml(S.po, y));
  return h;
}
function awardsTable(aw) {
  const keys = ['MVP', 'SCOR', 'GOAL', 'BESTG', 'BESTD', 'ROY', 'BDF', 'COY'];
  return `<table class="tbl small">${keys.filter(k => aw[k] && aw[k][0]).map(k => { const w = aw[k][0]; return `<tr><td><b>${esc(AWARD_NAMES[k][0])}</b><div class="dim small">${esc(AWARD_NAMES[k][1])}</div></td><td>${k === 'COY' ? esc(w.name) : pidLink(w.pid, w.name)} <span class="dim">${esc(w.pos || '')} ${esc(w.abbr || '')}</span><div class="dim small">${esc(w.line || '')}</div></td></tr>`; }).join('')}</table>`;
}
function histFranchises() {
  let h = '';
  const card = (fid) => {
    const f = FRANCHISES[fid];
    const titles = G.champions.filter(c => c.champ === fid);
    return `<div class="line-card"><h4 class="px"><span>${fid < N_CUR ? fidLink(fid, NOW, true) : esc(f.eras[f.eras.length - 1][2] + ' ' + f.eras[f.eras.length - 1][3])}</span><span class="gold">${titles.length ? '🏆×' + titles.length : ''}</span></h4>
      <ul class="lineage">${f.eras.map(e => `<li><span class="swatch" style="background:${e[5]}"></span> <b>${esc(e[2])} ${esc(e[3])}</b> <span class="dim">(${esc(e[4])}) ${e[0]}-${e[1] === NOW ? 'present' : e[1]}</span></li>`).join('')}</ul>
      ${fid === DEFUNCT_FID ? '<div class="dim small">Merged with the Minnesota franchise in 1978; its players were absorbed by Minnesota, which later moved to Dallas.</div>' : ''}
      ${titles.length ? `<div class="small dim">Titles: ${titles.map(c => seasonLabel(c.year)).join(', ')}</div>` : ''}</div>`;
  };
  const moved = FRANCHISES.map((f, i) => i).filter(i => FRANCHISES[i].eras.length > 1 || i >= N_CUR);
  h += panel('RELOCATED, RENAMED & DEFUNCT FRANCHISES', `<div class="lines-grid">${moved.map(card).join('')}</div>`);
  h += panel('ALL CURRENT FRANCHISES BY FOUNDING', `<div class="lines-grid">${FRANCHISES.slice(0, N_CUR).map((f, i) => i).filter(i => !moved.includes(i)).sort((a, b) => FRANCHISES[a].eras[0][0] - FRANCHISES[b].eras[0][0]).map(card).join('')}</div>`);
  return h;
}
function histTeam() {
  const fid = UI.histFid === null || UI.histFid === undefined ? G.userTeam : +UI.histFid;
  const isDef = fid >= N_CUR;
  const hist = isDef ? G.defunctHist.filter(r => r.fid === fid || r.fid === undefined) : TM(fid).history;
  const sel = `<select data-change="histFid">${FRANCHISES.map((f, i) => { const e = f.eras[f.eras.length - 1]; const nm = i < N_CUR ? TM(i).city + ' ' + TM(i).name : e[2] + ' ' + e[3] + ' (defunct)'; return `<option value="${i}" ${i === fid ? 'selected' : ''}>${esc(nm)}</option>`; }).join('')}</select>`;
  const best = hist.slice().sort((a, b) => b.pts / (b.gp || 1) - a.pts / (a.gp || 1))[0];
  const po = hist.filter(x => x.result !== 'Missed Playoffs').length;
  let h = `<div class="filters">${sel}</div>`;
  h += panel(`FRANCHISE HISTORY · ${hist.length} SEASONS · ${po} PLAYOFF APPEARANCES`, `${best ? `<p class="small">Best season: ${seasonLabel(best.year)} ${esc(best.city || '')} ${esc(best.name || best.abbr)}, ${best.w}-${best.l}-${(best.t || 0) + (best.otl || 0)}, ${best.pts} pts.</p>` : ''}
    <div class="scroll tall"><table class="tbl small"><tr><th>SEASON</th><th>TEAM</th><th>GP</th><th>W</th><th>L</th><th>T/OTL</th><th>PTS</th><th>GF</th><th>GA</th><th>RESULT</th></tr>${hist.slice().reverse().map(x => `<tr><td>${seasonLabel(x.year)}</td><td>${esc((x.city || '') + ' ' + (x.name || x.abbr))}</td><td>${x.gp}</td><td>${x.w}</td><td>${x.l}</td><td>${(x.t || 0) + (x.otl || 0)}</td><td><b>${x.pts}</b></td><td>${x.gf}</td><td>${x.ga}</td><td class="small ${x.result === 'WON THE MUG' ? 'gold' : x.result === 'Missed Playoffs' ? 'dim' : ''}">${esc(x.result || '')}</td></tr>`).join('')}</table></div>`);
  if (!isDef) h += panel('FRANCHISE LEADERS', franLeadersHtml(fid));
  return h;
}

// ---------- Awards ----------
function vAwards() {
  const years = [...new Set([...Object.keys(G.awards), ...Object.keys(G.seasons).filter(y => G.seasons[y].aw)].map(Number))].sort((a, b) => b - a);
  if (!years.length) return panel('AWARDS', '<p class="dim">Awards are handed out when the regular season ends.</p>');
  const y = UI.awYear && years.includes(UI.awYear) ? UI.awYear : years[0];
  const aw = G.awards[y] || G.seasons[y].aw;
  let h = `<div class="filters"><select data-change="awYear">${years.map(v => `<option value="${v}" ${v === y ? 'selected' : ''}>${seasonLabel(v)}</option>`).join('')}</select></div><div class="awards">`;
  for (const k of ['MVP', 'SCOR', 'GOAL', 'BESTG', 'BESTD', 'ROY', 'BDF', 'COY']) {
    if (!aw[k] || !aw[k].length) continue;
    h += panel(`${esc(AWARD_NAMES[k][0].toUpperCase())}`, `<div class="dim small">${esc(AWARD_NAMES[k][1])}</div>${aw[k].slice(0, 3).map((w, i) => `<div class="winner"><span class="px ${i ? 'dim' : 'gold'}">${i ? i + 1 : '★'}</span><div>${k === 'COY' ? esc(w.name) : pidLink(w.pid, w.name)} <span class="dim">${esc(w.pos || '')} · ${esc(w.abbr || '')}</span><div class="small dim">${esc(w.line || '')}</div></div></div>`).join('')}`);
  }
  h += `</div>`;
  const c = G.champions.find(x => x.year === y);
  if (c && c.mvp) h += panel('CONN SMITHERS TROPHY · PLAYOFF MVP', `<div class="winner"><span class="px gold">★</span><div>${pidLink(c.mvp.pid, c.mvp.name)} <span class="dim">${esc(c.mvp.pos)} · ${esc(c.champAbbr)}</span><div class="small dim">${esc(c.mvp.line)}</div></div></div>`);
  if (aw.AS1) h += panel('ALL-STAR TEAM', `<div class="allpro">${Object.entries(aw.AS1).map(([pos, ws]) => ws.map(w => `<div class="line-card"><div class="px small dim">${esc(pos)}</div>${pidLink(w.pid, w.name)} <span class="dim">${esc(w.abbr)}</span><div class="small dim">${esc(w.line)}</div></div>`).join('')).join('')}</div>`);
  return h;
}

// ---------- Records ----------
const REC_LABELS = {
  game: { g: 'Goals in a game', a: 'Assists in a game', pts: 'Points in a game', sv: 'Saves in a game', tg: 'Team goals in a game' },
  season: { g: 'Goals', a: 'Assists', pts: 'Points', pim: 'Penalty minutes', pm: 'Plus/minus', ppg: 'Power-play goals', w: 'Goalie wins', so: 'Shutouts', gaa: 'Lowest GAA (25+ GS)', sv: 'Best save % (25+ GS)' },
  team: { pts: 'Most points', gf: 'Most goals for', ga: 'Fewest goals against (70+ GP)', w: 'Most wins' },
};
function vRecords() {
  const tabs = [['season', 'SINGLE SEASON'], ['career', 'CAREER'], ['game', 'SINGLE GAME'], ['team', 'TEAM']];
  let h = `<div class="filters">${tabs.map(([k, l]) => `<button class="chip ${UI.recTab === k ? 'on' : ''}" data-act="recTab" data-k="${k}">${l}</button>`).join('')}</div>`;
  if (UI.recTab === 'career') return h + careerRecords();
  const R0 = G.records[UI.recTab] || {};
  const fmt = (k, v) => k === 'sv' && UI.recTab === 'season' ? fmtSv(v) : k === 'gaa' ? (+v).toFixed(2) : v;
  h += `<div class="records">`;
  for (const k in REC_LABELS[UI.recTab]) {
    const list = R0[k] || [];
    h += panel(REC_LABELS[UI.recTab][k].toUpperCase(), list.length ? `<table class="tbl small recs">${list.map((e, i) => `<tr class="${i === 0 ? 'rec-row' : ''}"><td class="dim">${i + 1}</td><td class="rholder">${e.pid ? pidLink(e.pid, e.name) : esc(e.name)} <span class="dim">${esc(e.tm || '')}${e.opp ? ' vs ' + esc(e.opp) : ''}</span></td><td class="dim">${seasonLabel(e.y)}</td><td class="r"><b>${fmt(k, e.v)}</b></td></tr>`).join('')}</table>` : '<p class="dim">No record yet.</p>');
  }
  return h + `</div>`;
}
function careerRecords() {
  const rows = [];
  for (const r of G.retired) rows.push({ pid: r.pid, name: r.name, pos: r.pos, t: r.tot, active: false });
  for (const p of Object.values(G.players)) if (p.tid >= -1 && (p.career.length || p.stats.gp)) rows.push({ pid: p.id, name: fullName(p), pos: p.pos, t: careerTotals(p), active: true });
  const cat = (l, f, filt) => { const ls = rows.filter(filt || (r => r.pos !== 'G')).map(r => ({ r, v: f(r.t) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 10); return panel(l, `<table class="tbl small recs">${ls.map((x, i) => `<tr class="${i === 0 ? 'rec-row' : ''}"><td class="dim">${i + 1}</td><td class="rholder">${pidLink(x.r.pid, x.r.name)} ${x.r.active ? '<span class="good small">active</span>' : ''}</td><td class="r"><b>${x.v}</b></td></tr>`).join('')}</table>`); };
  const isG = r => r.pos === 'G';
  return `<div class="records">${cat('POINTS', t => pts(t))}${cat('GOALS', t => st(t, 'g'))}${cat('ASSISTS', t => st(t, 'a'))}${cat('GAMES PLAYED', t => st(t, 'gp'), () => true)}${cat('PENALTY MINUTES', t => st(t, 'pim'))}${cat('GOALIE WINS', t => st(t, 'w'), isG)}${cat('SHUTOUTS', t => st(t, 'so'), isG)}${cat('POWER-PLAY GOALS', t => st(t, 'ppg'))}</div>`;
}

// ---------- Hall of Fame ----------
function vHof() {
  const ind = G.retired.filter(r => r.hof).sort((a, b) => (b.hofYear || 0) - (a.hofYear || 0) || b.score - a.score);
  let h = '';
  if (G.phase === 'postseason' && G.hofVoted !== G.year) h += `<div class="warn">The ${G.year + 1} Hall of Fame ballot is open. <button class="btn tiny" data-act="hofBallot">VOTE NOW</button></div>`;
  h += panel(`HALL OF FAME · ${ind.length} MEMBERS`, ind.length ? `<div class="scroll tall"><table class="tbl small"><tr><th>CLASS</th><th>PLAYER</th><th>POS</th><th>YEARS</th><th>TEAMS</th><th>CAREER</th><th>AWARDS</th></tr>${ind.map(r => `<tr><td>${r.hofYear || '-'}</td><td>${pidLink(r.pid, r.name)}</td><td>${r.pos}</td><td>${r.from}-${r.to}</td><td class="small">${r.teams.slice(0, 4).map(esc).join(', ')}${r.teams.length > 4 ? '…' : ''}</td><td class="small">${r.pos === 'G' ? `${r.tot.w || 0} W, ${r.tot.so || 0} SO` : `${r.tot.gp || 0} GP, ${r.tot.g || 0}G ${r.tot.a || 0}A, ${(r.tot.g || 0) + (r.tot.a || 0)} PTS`}</td><td class="small">${r.awards.filter(a => a.k !== 'AS1').length ? r.awards.filter(a => !['AS1'].includes(a.k)).length + ' major' : ''}</td></tr>`).join('')}</table></div>` : '<p class="dim">Nobody has been inducted yet.</p>');
  return h;
}
function hofBallotModal() {
  const b = hofBallot(G);
  if (!b.length) { G.hofVoted = G.year; persist(); render(); toast('No eligible candidates on the ballot this year.'); return; }
  UI.hofPick = UI.hofPick || [];
  openModal(`<h3 class="px">${G.year + 1} HALL OF FAME BALLOT</h3><p class="dim">Pick up to 4 players to induct. Players become eligible three seasons after retiring. The committee's line is a score of ${HOF_LINE}.</p>
    <table class="tbl small"><tr><th></th><th>PLAYER</th><th>POS</th><th>CAREER</th><th>SCORE</th></tr>${b.map(r => `<tr class="asset ${UI.hofPick.includes(r.pid) ? 'sel' : ''}" data-act="hofPick" data-id="${r.pid}"><td class="cbox">${UI.hofPick.includes(r.pid) ? '■' : '□'}</td><td>${esc(r.name)} <span class="dim">${r.from}-${r.to}</span></td><td>${r.pos}</td><td class="small">${r.pos === 'G' ? `${r.tot.w || 0} W, ${fmtSv(svPct(r.tot))}` : `${r.tot.gp || 0} GP, ${(r.tot.g || 0) + (r.tot.a || 0)} PTS`} · ${r.awards.length} awards</td><td class="${r.score >= HOF_LINE ? 'good' : ''}">${Math.round(r.score)}</td></tr>`).join('')}</table>
    <div class="center"><button class="btn" data-act="hofSubmit">INDUCT ${UI.hofPick.length} PLAYER${UI.hofPick.length === 1 ? '' : 'S'}</button></div>`, true);
}

// ---------- Help ----------
const HELP = [
  ['The basics', `<p>You are the general manager of one franchise in a 32-team league with history going back to 1960. Every past season was simulated when you started: champions, award winners, records, relocations and all. Your job: build a team that wins Stanley's Mug, without blowing the salary cap or the arena budget.</p><p>Use the buttons in the header to move through the season. The game autosaves after every action.</p>`],
  ['The season', `<ul><li><b>Regular season</b>: 82 games over about 105 days. Wins are 2 points, overtime and shootout losses 1.</li><li><b>Trade deadline</b> around day 80.</li><li><b>Playoffs</b>: top 3 in each division plus 2 wild cards per conference, best-of-seven series, 2-2-1-1-1 home ice. Playoff overtime is sudden-death 5-on-5 until someone scores.</li><li><b>Offseason</b>: Hall of Fame vote, aging and retirements, the 7-round draft with a lottery for the top picks, re-signing, 5 days of free agency, then training camp.</li></ul>`],
  ['Watching games live', `<p>Tick "Watch my games live" to watch your games on the rink. Players skate to their positions, pass, shoot and chase loose pucks; lines change on the fly; penalties create power plays and the losing team pulls its goalie late.</p><ul><li>Speeds from 2x to 40x, or HIGHLIGHTS to fast-forward between scoring chances.</li><li><b>Tactics</b>: Aggressive gets more shots and forechecking but more penalties; Defensive blocks more shots. Pull your goalie any time, or never. Shorten the bench to lean on your top lines.</li><li>Tactics take effect within a few seconds of game time.</li></ul>`],
  ['Lines', `<p>Four forward lines (C/LW/RW), three defense pairs, two goalies, two power-play units and two penalty-kill units. Click a slot, then another slot or a pool player, to swap. The first line plays about 31% of even-strength time and the fourth about 18%. Set how many games your starter plays; tired starters are less sharp.</p>`],
  ['Roster, farm & injuries', `<p>Up to ${ROSTER_LIMIT} players on the active roster, plus a farm (AHL) team of up to ${FARM_LIMIT}. Farm players don't count against the cap. New draft picks start on the farm on entry-level contracts. Players hurt for 7+ games go on IR and free up an active spot. Turn on "Auto-manage roster" to let the AI handle call-ups when injuries strike.</p>`],
  ['Ratings', `<p>Skaters: Speed, Skating, Strength, Endurance, Shot Accuracy, Shot Power, Puck Handling, Passing, Offensive IQ, Defensive IQ, Checking, Shot Blocking, Faceoffs, Discipline. Goalies: Reflexes, Positioning, Glove, Rebound Control. Players usually peak between 25 and 29 and decline in their 30s. Potential is a letter grade; generational talents show an <span class="pot pot-s">S</span>.</p>`],
  ['Cap & contracts', `<p>The cap starts at ${fmtM(START_CAP)} and grows a few percent per year. Releasing a player under contract creates dead money (a buyout spread over twice the remaining years). Expiring players can be re-signed in the RE-SIGNING phase; their odds depend on the money, the term, their mood and how good your team is.</p>`],
  ['Trades', `<p>Pick a partner, select players and picks on both sides and see how the other GM values the deal. AI teams also send you offers during the season (check the header). Contenders pay for veterans; rebuilding teams want youth and picks.</p>`],
  ['Draft & scouting', `<p>Scouting points accumulate during the season. Spend them on the draft board to narrow the estimates on prospects' current ability and potential. The worst teams have the best lottery odds for the first two picks.</p>`],
  ['Coaches', `<p>Hire a head coach, an associate coach (offense and power play), an assistant (defense and penalty kill) and a goalie coach. Systems like the Neutral Zone Trap or Run & Gun shape how your team plays. Coaches develop young players in the offseason and have quirks that grow over a career.</p>`],
  ['Arena operations', `<p>Run the arena: ticket, concession and jersey prices, facility upkeep and upgrades (including the ice plant and Zambonis - bad ice slows everyone down at home), and random events you must respond to. Happy fans fill the building and make your home crowd louder. Ops cash is separate from the salary cap.</p>`],
  ['Stats & history', `<p>Advanced stats include Corsi (CF%), individual expected goals (ixG), goals saved above expected for goalies (GSAx), points per 60 and takeaway/giveaway differential. The archive keeps every Stanley's Mug winner since 1960, every season's standings and awards, franchise lineages (relocations and the defunct Cleveland Counts), franchise leaders, the record book and the Hall of Fame.</p>`],
];
function vHelp() {
  return panel('HOW TO PLAY', HELP.map(([t, b], i) => `<details class="help-item panel" ${i === 0 ? 'open' : ''}><summary class="px small">${t.toUpperCase()}</summary><div class="help-body">${b}</div></details>`).join(''));
}
