'use strict';
// ================= UI: front office (cap, FA, trades, draft, coaches, arena) =================

// ---------- Needs & grades ----------
function needChip(pos, v, short) { const l = needLevel(v); return `<span class="nd ${l[2]}" title="${POS_NAME[pos]}: ${l[1]} need (${v.toFixed(1)}/10)">${short ? pos : pos + ' ' + l[1]}</span>`; }
function needRow(need) { return `<span class="needrow">${POSITIONS.map(p => needChip(p, need[p], true)).join('')}</span>`; }
function needBars(need) { return `<div class="needs">${POSITIONS.map(p => { const l = needLevel(need[p]); return `<div class="need-row"><span class="px small">${p}</span><div class="bar"><i class="${l[2]}" style="width:${Math.max(4, need[p] * 10)}%"></i></div><span class="small">${l[1]}</span></div>`; }).join('')}</div>`; }
function gradeB(g) { return `<span class="grade g${g[0]}">${g}</span>`; }
function impactHtml(imp, label) {
  const ch = POSITIONS.filter(p => Math.abs(imp.na[p] - imp.nb[p]) >= 0.4).map(p => { const better = imp.na[p] < imp.nb[p]; return `<span class="${better ? 'good' : 'bad'}">${p} ${imp.nb[p].toFixed(1)}→${imp.na[p].toFixed(1)}${needLevel(imp.na[p])[1] !== needLevel(imp.nb[p])[1] ? ' (' + needLevel(imp.na[p])[1] + ')' : ''}</span>`; });
  const d = imp.sa - imp.sb;
  return `<p class="small"><b>${label}</b> strength ${imp.sb.toFixed(1)} → <b class="${d > 0.05 ? 'good' : d < -0.05 ? 'bad' : ''}">${imp.sa.toFixed(1)}</b> · rank #${imp.rb} → #${imp.ra}${ch.length ? ' · need: ' + ch.join(', ') : ' · needs unchanged'}</p>`;
}
function impactVerdict(imp) {
  const fills = POSITIONS.filter(p => imp.nb[p] >= 5.5 && imp.na[p] <= imp.nb[p] - 0.8), holes = POSITIONS.filter(p => imp.na[p] >= 6.5 && imp.na[p] >= imp.nb[p] + 0.8);
  const out = [];
  if (fills.length) out.push(`<span class="good">Fills your ${fills.map(p => POS_NAME[p].toLowerCase()).join(' and ')} need</span>`);
  if (holes.length) out.push(`<span class="bad">Opens a hole at ${holes.map(p => POS_NAME[p].toLowerCase()).join(' and ')}</span>`);
  const d = imp.sa - imp.sb;
  out.push(d > 0.15 ? '<span class="good">Makes you better now</span>' : d < -0.15 ? '<span class="bad">Makes you weaker now</span>' : '<span class="dim">About even for this season</span>');
  return out.join(' · ');
}
function recapModal(kind, year) {
  year = year || G.year;
  const html = gradesPanel(kind, year);
  if (!html) { toast(kind === 'fa' ? 'Free agency is over. Training camp opens.' : 'Draft complete.'); return; }
  openModal(`<h2 class="px center">${kind === 'fa' ? 'FREE AGENCY RECAP' : 'DRAFT RECAP'}</h2>${html}<div class="center"><button class="btn" data-act="closeModal">${kind === 'fa' ? 'ON TO TRAINING CAMP &gt;' : 'ON TO RE-SIGNING &gt;'}</button></div>`, true);
}
function autoToggles(keys) {
  const a = autoGM(G), lab = { resign: 'AUTO RE-SIGN', fa: 'AUTO FREE AGENCY', scout: 'AUTO SCOUTING' }, tip = { resign: 'When free agency opens, expiring players you did not re-sign or let walk are kept or let go by role, age and positional need.', fa: 'Each free-agency day, make offers to the best affordable upgrades at your biggest needs (up to two signings a day).', scout: 'Spend scouting points over a 10-point reserve on prospects at your need positions, and everything left before the draft.' };
  return `<div class="filters">${keys.map(k => `<button class="chip ${a[k] ? 'on' : ''}" data-act="autoGM" data-k="${k}" title="${tip[k]}">${lab[k]}: ${a[k] ? 'ON' : 'OFF'}</button>`).join('')}</div>`;
}
function gradesPanel(kind, year) {
  const gb = G.grades && G.grades[year] && G.grades[year][kind]; if (!gb) return '';
  const rows = G.teams.map(t => ({ t, e: gb[t.id] })).filter(r => r.e).sort((a, b) => b.e.z - a.e.z);
  const u = gb[G.userTeam];
  const list = (arr) => arr && arr.length ? arr.map(x => `${esc(x[0])} <span class="dim">${x[1]} ${x[2]}</span>`).join(', ') : '<span class="dim">none</span>';
  const pickTxt = (x) => `#${x[4]} ${esc(x[0])} <span class="dim">${x[1]} · ${x[2]} now, ${potGrade(x[3])} pot, proj ${x[5]}</span>`;
  let card = '';
  if (u) card = `<div class="report">${gradeB(u.g)}<div><p>${kind === 'fa' ? 'Strength' : 'Projected strength (2 seasons out)'} ${u.sb.toFixed(1)} → <b>${u.sa.toFixed(1)}</b> · league rank #${u.rb} → <b>#${u.ra}</b></p>${kind === 'fa'
    ? `<p class="small">Re-signed (${u.nRe}): ${list(u.re)}</p><p class="small">Added (${u.nIn}): ${list(u.in)}</p><p class="small">Lost (${u.nOut}): ${list(u.out)}</p>`
    : `<p class="small">Needs going in: ${u.needs.length ? u.needs.map(p => POS_NAME[p]).join(', ') : 'none major'} · value vs. draft slot: <span class="${u.vos >= 0 ? 'good' : 'bad'}">${u.vos >= 0 ? '+' : ''}${u.vos}</span></p><p class="small">${u.picks.length ? u.picks.map(pickTxt).join('<br>') : 'No picks.'}</p>`}</div></div>`;
  const key = (e) => kind === 'fa' ? (e.in[0] ? `+ ${esc(e.in[0][0])} (${e.in[0][1]} ${e.in[0][2]})` : '') + (e.out[0] ? ` <span class="bad">− ${esc(e.out[0][0])} (${e.out[0][1]} ${e.out[0][2]})</span>` : '') : (e.picks[0] ? pickTxt(e.picks[0]) : '<span class="dim">no picks</span>');
  return panel(`${year} ${kind === 'fa' ? 'FREE AGENCY' : 'DRAFT'} GRADES`, `${card}<div class="scroll"><table class="tbl small"><tr><th>#</th><th>TEAM</th><th>GRADE</th><th>STRENGTH</th><th>RANK</th><th>${kind === 'fa' ? 'BIGGEST MOVES' : 'TOP PICK'}</th></tr>${rows.map((r, i) => `<tr class="${r.t.id === G.userTeam ? 'me-row' : ''}"><td class="dim">${i + 1}</td><td>${teamLink(r.t.id)}</td><td>${gradeB(r.e.g)}</td><td>${r.e.sb.toFixed(1)} → ${r.e.sa.toFixed(1)}</td><td>#${r.e.rb} → #${r.e.ra}</td><td>${key(r.e)}</td></tr>`).join('')}</table></div><p class="dim small">Grades are curved across the league: each team's change in ${kind === 'fa' ? 'strength' : 'projected strength'} against everyone else's, plus where it ranks afterward${kind === 'draft' ? ', the value it got for each slot and whether its early picks filled its needs' : ''}.</p>`);
}

// ---------- Contracts & cap ----------
function vContracts() {
  const u = TM(G.userTeam);
  const ps = rosterPlayers(G, u).sort((a, b) => (b.contract ? b.contract.sal : 0) - (a.contract ? a.contract.sal : 0));
  const exp = expiring(G, u);
  let h = '';
  if (G.phase === 'resign') {
    h += panel(`EXPIRING CONTRACTS · ${exp.length}`, exp.length ? `<p class="dim small">Make an offer to keep a player. Unsigned players hit free agency when it opens. Cap space now: <b>${fmtM(capSpace(G, u))}</b> (expiring deals don't count).</p>
      ${autoToggles(['resign'])}<p class="dim small">${autoGM(G).resign ? 'Anyone you neither re-sign nor mark LET WALK is decided automatically when free agency opens, following the advice column.' : 'Auto re-sign is off: anyone you do not re-sign becomes a free agent.'} <button class="btn tiny alt" data-act="autoResignNow">AUTO RE-SIGN NOW</button></p>
      <div class="scroll"><table class="tbl"><tr><th>OVR</th><th>POS</th><th>NAME</th><th>AGE</th><th>LAST DEAL</th><th>ASKING</th><th>MOOD</th><th>ADVICE</th><th></th></tr>${exp.map(p => { const a = askingContract(G, p), ad = resignAdvice(G, p); return `<tr class="${p.walk === G.year ? 'dim' : ''}"><td>${ovrB(p.ovr)}</td><td>${p.pos}</td><td>${pLink(p)}</td><td>${p.age}</td><td>${p.contract ? fmtM(p.contract.sal) : '-'}</td><td>${fmtM(a.sal)} × ${a.yrs}</td><td>${typeof moraleChip === 'function' ? moraleChip(p) : ''}</td><td class="small"><b class="${ad.keep ? 'good' : 'bad'}">${ad.keep ? 'KEEP' : 'LET GO'}</b> <span class="dim">${esc(ad.reason)}</span></td><td>${p.refused === G.year ? '<span class="bad small">WALKING</span>' : `<button class="btn tiny" data-act="negotiate" data-id="${p.id}" data-k="resign">NEGOTIATE</button><button class="btn tiny alt" data-act="walk" data-id="${p.id}">${p.walk === G.year ? 'UNDO' : 'LET WALK'}</button>`}</td></tr>`; }).join('')}</table></div>` : '<p class="dim">No expiring deals.</p>', 'recpanel');
  }
  h += panel(`PAYROLL ${fmtM(payroll(G, u))} · CAP ${fmtM(G.cap)} · SPACE <span class="${capSpace(G, u) < 0 ? 'bad' : 'good'}">${fmtM(capSpace(G, u))}</span>`, `<div class="scroll tall"><table class="tbl"><tr><th>POS</th><th>NAME</th><th>AGE</th><th>OVR</th><th>SALARY</th><th>THROUGH</th><th>MARKET</th><th></th></tr>${ps.map(p => `<tr class="${p.farm ? 'dim' : ''}"><td>${p.pos}</td><td>${pLink(p)}${p.farm ? ' <span class="small">(farm)</span>' : ''}</td><td>${p.age}</td><td>${ovrB(p.ovr)}</td><td>${p.contract ? fmtM(p.contract.sal) : '-'}${p.contract && p.contract.elc ? ' <span class="small">ELC</span>' : ''}</td><td>${p.contract ? seasonLabel(p.contract.exp) : '-'}</td><td class="small">${fmtM(marketValue(G, p))}</td><td>${G.phase !== 'resign' && p.contract && p.contract.exp === G.year && !p.contract.elc ? `<button class="btn tiny alt" data-act="negotiate" data-id="${p.id}" data-k="extend">EXTEND</button>` : ''}</td></tr>`).join('')}</table></div>`);
  const dead = (u.dead || []).filter(d => d.y >= G.year);
  if (dead.length) h += panel('DEAD MONEY (BUYOUTS)', `<table class="tbl small">${dead.map(d => `<tr><td>${seasonLabel(d.y)}</td><td>${esc(d.name)}</td><td>${fmtM(d.amt)}</td></tr>`).join('')}</table>`);
  h += panel('CAP HISTORY', `<p class="small">${(G.capHist || []).map(c => `${seasonLabel(c.year)}: ${fmtM(c.cap)}`).join(' · ')}</p><p class="dim small">Farm-team salaries don't count against the cap. Entry-level contracts (ELC) run three seasons. Releasing a player under contract costs a buyout spread over twice the remaining years.</p>`);
  return h;
}
function negotiateModal(pid, kind) {
  const p = G.players[+pid]; if (!p) return;
  const a = askingContract(G, p);
  UI.neg = { pid: p.id, kind, sal: UI.neg && UI.neg.pid === p.id ? UI.neg.sal : a.sal, yrs: UI.neg && UI.neg.pid === p.id ? UI.neg.yrs : a.yrs };
  const N = UI.neg;
  const odds = kind === 'fa' ? (G.phase === 'regular' || G.phase === 'preseason' ? Math.min(0.98, faOdds(G, p, N.sal, N.yrs) + 0.25) : faOdds(G, p, N.sal, N.yrs)) : resignOdds(G, p, N.sal, N.yrs);
  openModal(`<h3 class="px">${kind === 'fa' ? 'FREE AGENT OFFER' : kind === 'extend' ? 'CONTRACT EXTENSION' : 'RE-SIGN'}: ${esc(fullName(p).toUpperCase())}</h3>
    <p>${p.pos} · age ${p.age} · ${ovrB(p.ovr)} ${potB(p.pot, p.gen)} · asking <b>${fmtM(a.sal)} × ${a.yrs} yrs</b> · market ${fmtM(marketValue(G, p))}</p>
    <div class="edit-grid"><label>Salary ($M/yr) <input type="number" step="0.05" min="${minSalary(G)}" max="${maxSalary(G)}" value="${N.sal}" data-change="negSal"></label>
    <label>Years <select data-change="negYrs">${[1, 2, 3, 4, 5, 6, 7, 8].map(y => `<option ${y === N.yrs ? 'selected' : ''}>${y}</option>`).join('')}</select></label></div>
    <div class="meter"><div class="bar"><i class="${odds >= 0.6 ? 'o-great' : odds >= 0.35 ? 'o-good' : 'm-bad'}" style="width:${Math.round(odds * 100)}%"></i></div><p>Chance he accepts: <b>${Math.round(odds * 100)}%</b> · Your cap space: ${fmtM(capSpace(G, TM(G.userTeam)))}</p></div>
    <div class="center"><button class="btn" data-act="negSubmit">MAKE OFFER</button></div>`);
}

// ---------- Free agents ----------
function vFA() {
  let ps = G.fa.map(id => G.players[id]).filter(Boolean).filter(p => UI.faPos === 'ALL' || (UI.faPos === 'F' ? FWD.includes(p.pos) : p.pos === UI.faPos));
  ps.sort((a, b) => b.ovr - a.ovr);
  const u = TM(G.userTeam), need = teamNeeds(G, u);
  const fa = G.grades && G.grades[G.year] && G.grades[G.year].fa;
  return (fa && G.phase !== 'fa' ? gradesPanel('fa', G.year) : '') + panel(`FREE AGENTS · ${G.fa.length} · CAP SPACE ${fmtM(capSpace(G, u))}`, `<div class="filters">${['ALL', 'F', 'C', 'LW', 'RW', 'D', 'G'].map(k => `<button class="chip ${UI.faPos === k ? 'on' : ''}" data-act="faPos" data-k="${k}">${k}</button>`).join('')}</div>
    ${G.phase === 'fa' ? `<p class="dim small">Free agency day ${G.faDay}/5. AI teams sign players every day, and holdouts lower their price as days pass.</p>` : '<p class="dim small">Players left unsigned after free agency can be signed any time, usually at a discount.</p>'}
    <p class="small">Your needs: ${needRow(need)}</p>${autoToggles(['fa'])}
    <div class="scroll tall"><table class="tbl"><tr><th>OVR</th><th>POT</th><th>POS</th><th>FIT</th><th>NAME</th><th>AGE</th><th>STYLE</th><th>LAST TEAM</th><th>ASKING</th><th></th></tr>${ps.slice(0, 200).map(p => { const a = askingContract(G, p); return `<tr><td>${ovrB(p.ovr)}</td><td>${potB(p.pot, p.gen)}</td><td>${p.pos}</td><td>${needChip(p.pos, need[p.pos], true)}</td><td>${pLink(p)} ${p.injury ? '<span class="inj small">INJ</span>' : ''}</td><td>${p.age}</td><td class="small">${esc(p.style || playerStyle(p))}</td><td>${p.lastTeam !== undefined && TM(p.lastTeam) ? TM(p.lastTeam).abbr : '-'}</td><td>${fmtM(a.sal)} × ${a.yrs}</td><td><button class="btn tiny" data-act="faOffer" data-id="${p.id}">OFFER</button></td></tr>`; }).join('')}</table></div>`);
}

// ---------- Trade ----------
function assetKey(a) { return a.type === 'pick' ? `pk_${a.year}_${a.rd}_${a.orig}` : 'p' + a.pid; }
function assetsOf(tid) {
  const t = TM(tid);
  const players = rosterPlayers(G, t).sort((a, b) => b.ovr - a.ovr).map(p => ({ type: 'player', pid: p.id }));
  const picks = teamPicks(G, tid).map(pk => ({ type: 'pick', year: pk.year, rd: pk.rd, orig: pk.orig }));
  return [...players, ...picks];
}
function assetRow(a, side, sel, need) {
  if (a.type === 'pick') return `<tr class="asset ${sel ? 'sel' : ''}" data-act="trSel" data-side="${side}" data-k="${assetKey(a)}"><td class="cbox">${sel ? '■' : '□'}</td><td colspan="2">${a.year} Round ${a.rd} pick <span class="dim">(${esc(TM(a.orig).abbr)}${a.year === G.year + 1 && (G.phase === 'regular' || G.phase === 'playoffs') ? ', proj. #' + projectedSlot(G, a.orig) : ''})</span></td><td></td><td class="small dim">value ${Math.round(pickValue(G, a))}</td></tr>`;
  const p = G.players[a.pid];
  return `<tr class="asset ${sel ? 'sel' : ''}" data-act="trSel" data-side="${side}" data-k="${assetKey(a)}"><td class="cbox">${sel ? '■' : '□'}</td><td>${ovrB(p.ovr)} ${p.pos}</td><td>${esc(fullName(p))} <span class="dim small">${p.age}y${p.farm ? ' farm' : ''}${p.injury ? ' INJ' : ''}</span>${need && need[p.pos] >= 6.5 && !p.farm ? ` <span class="nd ${side === 'mine' ? 'nd-high' : 'nd-ok'}">${side === 'mine' ? 'THEY NEED' : 'FILLS NEED'}</span>` : ''}</td><td class="small">${p.contract ? fmtM(p.contract.sal) + '→' + String(p.contract.exp).slice(2) : ''}</td><td class="small dim">${potGrade(p.pot, p.gen)}</td></tr>`;
}
function vTrade() {
  const T = UI.tr;
  let h = '';
  if (G.offers.length) {
    h += panel(`TRADE OFFERS · ${G.offers.length}`, G.offers.map(o => { const desc = (arr) => arr.map(a => a.type === 'pick' ? `${a.year} R${a.rd} pick (${TM(a.orig).abbr})` : G.players[a.pid] ? `${G.players[a.pid].pos} ${pLink(G.players[a.pid])} (${G.players[a.pid].ovr})` : '?').join(', ');
      const ids = (arr) => arr.filter(a => a.type === 'player' && G.players[a.pid]).map(a => a.pid);
      const imp = tradeImpact(G, G.userTeam, ids(o.want), ids(o.give));
      return `<div class="offer-card"><div class="offer-head">${crest(o.partner, 24)} <b>${esc(TM(o.partner).city)} ${esc(TM(o.partner).name)}</b> <span class="small dim">their needs:</span> ${needRow(teamNeeds(G, TM(o.partner)))} <span class="small dim">your needs:</span> ${needRow(teamNeeds(G, TM(G.userTeam)))}</div><p>They want: ${desc(o.want)}</p><p>They offer: ${desc(o.give)}</p>${impactHtml(imp, 'YOU:')}<p class="small">${impactVerdict(imp)}</p><button class="btn tiny" data-act="acceptOffer" data-id="${o.id}">ACCEPT</button><button class="btn tiny alt" data-act="declineOffer" data-id="${o.id}">DECLINE</button></div>`; }).join(''), 'recpanel');
  }
  if (G.phase === 'playoffs') return h + panel('TRADE', '<p class="dim">No trades during the playoffs.</p>');
  const partner = T.partner === null ? null : +T.partner;
  h += panel('TRADE PARTNER', `<select data-change="trPartner"><option value="">- pick a team -</option>${G.teams.filter(t => t.id !== G.userTeam).map(t => `<option value="${t.id}" ${t.id === partner ? 'selected' : ''}>${esc(t.city + ' ' + t.name)} (${recStr(t.rec)})</option>`).join('')}</select>${G.phase === 'regular' ? ` <span class="dim small">Deadline: day ${G.deadlineDay}${G.day > G.deadlineDay ? ' (passed)' : ''}</span>` : ''}`);
  if (partner === null) return h;
  const mine = assetsOf(G.userTeam), theirs = assetsOf(partner);
  const selM = new Set(T.mine), selT = new Set(T.theirs);
  const give = mine.filter(a => selM.has(assetKey(a))), get = theirs.filter(a => selT.has(assetKey(a)));
  const ev = evaluateTrade(G, partner, give, get);
  const ratio = clamp(ev.ratio, 0, 2);
  const myNeed = teamNeeds(G, TM(G.userTeam)), theirNeed = teamNeeds(G, TM(partner));
  const pids = (arr) => arr.filter(a => a.type === 'player').map(a => a.pid);
  let impact = '';
  if (give.some(a => a.type === 'player') || get.some(a => a.type === 'player')) {
    const mi = tradeImpact(G, G.userTeam, pids(give), pids(get)), ti = tradeImpact(G, partner, pids(get), pids(give));
    impact = `${impactHtml(mi, 'YOU:')}<p class="small">${impactVerdict(mi)}</p>${impactHtml(ti, TM(partner).abbr + ':')}`;
  }
  const salIn = sum(get.filter(a => a.type === 'player' && !G.players[a.pid].farm), a => G.players[a.pid].contract ? G.players[a.pid].contract.sal : 0), salOut = sum(give.filter(a => a.type === 'player' && !G.players[a.pid].farm), a => G.players[a.pid].contract ? G.players[a.pid].contract.sal : 0);
  h += panel('THE DEAL', `<div class="meter"><div class="bar"><i class="${ev.ok ? 'o-great' : ratio > 0.85 ? 'o-good' : 'm-bad'}" style="width:${Math.round(ratio / 2 * 100)}%"></i><span class="mark" style="left:50%"></span></div></div>
    <p>${!give.length && !get.length ? 'Select assets on both sides.' : ev.reason ? `<span class="bad">${esc(ev.reason)}</span>` : ev.ok ? `<span class="good">The ${esc(TM(partner).name)} would accept this deal.</span>` : `<span class="bad">The ${esc(TM(partner).name)} want more (${Math.round(ratio * 100)}% of what they need).</span>`}</p>
    ${impact}
    <p class="small">Your needs: ${needRow(myNeed)} · ${esc(TM(partner).abbr)} needs: ${needRow(theirNeed)}</p>
    <p class="small dim">Your cap after: ${fmtM(capSpace(G, TM(G.userTeam)) + salOut - salIn)} space. Teams value players at positions they need a little higher.</p>
    <button class="btn" data-act="trPropose" ${ev.ok ? '' : 'disabled'}>PROPOSE TRADE</button><button class="btn alt" data-act="trAsk" title="Ask what they'd give for your selected player">WHAT WOULD THEY OFFER?</button><button class="btn tiny alt" data-act="trClear">CLEAR</button>`, 'dealpanel');
  h += `<div class="grid2">${panel(`YOU GIVE · ${esc(TM(G.userTeam).abbr)}`, `<div class="scroll tall"><table class="tbl small assets">${mine.map(a => assetRow(a, 'mine', selM.has(assetKey(a)), theirNeed)).join('')}</table></div>`)}${panel(`YOU GET · ${esc(TM(partner).abbr)}`, `<div class="scroll tall"><table class="tbl small assets">${theirs.map(a => assetRow(a, 'theirs', selT.has(assetKey(a)), myNeed)).join('')}</table></div>`)}</div>`;
  return h;
}
function tradeAssetByKey(tid, k) { return assetsOf(tid).find(a => assetKey(a) === k); }

// ---------- Draft & scouting ----------
function vDraft() {
  const D = G.draft;
  const pool = D ? D.pool : G.prospects;
  let h = '';
  if (D) {
    const pick = D.picks[D.cur];
    const onClock = pick && pick.tid === G.userTeam;
    h += `<div class="draft-banner ${onClock ? 'mine' : ''}"><div><div class="px">${G.year} DRAFT · ${draftDone(G) ? 'COMPLETE' : `ROUND ${pick.rd} · PICK #${pick.ovr}`}</div>${!draftDone(G) ? `<div>On the clock: ${teamLink(pick.tid, true)}</div>` : ''}${G.lottery && G.lottery.year === G.year ? `<div class="small dim">Lottery winners: ${G.lottery.winners.map(w => `${TM(w.tid).abbr} (from #${w.from})`).join(', ')}</div>` : ''}</div>
      <div>${onClock ? '<span class="px gold blink2">YOUR PICK - CHOOSE A PLAYER BELOW</span> <button class="btn alt" data-act="autoPick" title="Take the best fit on your board">AUTO PICK</button>' : !draftDone(G) ? '<button class="btn alt" data-act="draftToMe">SIM TO MY PICK</button>' : ''}<button class="btn" data-act="finishDraft" title="Any of your picks left are made automatically: best fit on your board">»» FINISH DRAFT</button></div></div>`;
  } else h += panel(`${G.year + 1} DRAFT CLASS · SCOUTING POINTS: ${G.scoutPts}`, `<p class="dim small">You earn 3 scouting points every two weeks of the season. Each scouting level sharpens the estimates (costs 2, 3 and 5 points). The class profile: <b>${esc(G.classProfile ? G.classProfile.overall : 'avg')}</b>.</p>`);
  const need = draftNeeds(G, TM(G.userTeam));
  const dPos = UI.dPos || 'ALL', fitSort = UI.dSort === 'fit';
  let ids = pool.map((id, i) => ({ id, i, p: G.players[id] })).filter(x => x.p && (dPos === 'ALL' || (dPos === 'F' ? FWD.includes(x.p.pos) : x.p.pos === dPos)));
  if (fitSort) ids.sort((a, b) => fitScore(b.p, need) - fitScore(a.p, need));
  ids = ids.slice(0, 160);
  const rows = ids.map(({ i, p }) => { return `<tr><td class="dim">${i + 1}</td><td>${p.pos}</td><td>${needChip(p.pos, need[p.pos], true)}</td><td>${pLink(p)}</td><td>${p.age}</td><td class="small">${esc(p.nat)} · ${esc(p.college || '')}</td><td>${ovrB(p.sOvr)}</td><td>${potB(p.sPot)}</td><td><span class="pips">${[0, 1, 2].map(k => `<i class="${(p.sc || 0) > k ? 'on' : ''}"></i>`).join('')}</span></td><td class="acts">${D && !draftDone(G) && D.picks[D.cur].tid === G.userTeam ? `<button class="btn tiny" data-act="draftPick" data-id="${p.id}">DRAFT</button>` : ''}${(p.sc || 0) < 3 ? `<button class="btn tiny alt" data-act="scout" data-id="${p.id}">SCOUT (${[2, 3, 5][p.sc || 0]})</button>` : ''}</td></tr>`; }).join('');
  h += `<div class="grid-draft ${D && !draftDone(G) ? 'drafting' : ''}">`;
  const filt = autoToggles(['scout']) + `<div class="filters">${['ALL', 'F', 'C', 'LW', 'RW', 'D', 'G'].map(k => `<button class="chip ${dPos === k ? 'on' : ''}" data-act="dPos" data-k="${k}">${k}</button>`).join('')} <button class="chip ${fitSort ? '' : 'on'}" data-act="dSort" data-k="board">BOARD ORDER</button><button class="chip ${fitSort ? 'on' : ''}" data-act="dSort" data-k="fit" title="Board value plus a bonus at positions you need">BEST FIT</button> <button class="btn tiny alt" data-act="autoScout" title="Spend scouting points on top prospects at your need positions">AUTO-SCOUT NEEDS</button></div>`;
  h += panel(`BIG BOARD${D ? ` · SCOUTING POINTS ${G.scoutPts}` : ''}`, `${filt}<div class="scroll tall bigboard"><table class="tbl small"><tr><th>#</th><th>POS</th><th>FIT</th><th>NAME</th><th>AGE</th><th>FROM</th><th>OVR*</th><th>POT*</th><th>SCOUTED</th><th></th></tr>${rows}</table></div><p class="dim small">* scouting estimates.</p>`);
  let side = '';
  if (D) {
    const made = D.picks.filter(p => p.pid).slice(-40).reverse();
    side += `<div><h4 class="px">YOUR PICKS</h4><table class="tbl small">${D.picks.filter(p => p.tid === G.userTeam).map(p => `<tr><td>R${p.rd} #${p.ovr}</td><td>${p.pid ? pidLink(p.pid, p.name) + ` <span class="dim">${p.pos}</span>` : '<span class="dim">-</span>'}</td></tr>`).join('')}</table>
</div>
      <div><h4 class="px">RECENT PICKS</h4><table class="tbl small">${made.map(p => `<tr><td class="dim">#${p.ovr}</td><td>${crest(p.tid, 14)} ${esc(TM(p.tid).abbr)}</td><td>${pidLink(p.pid, p.name)} <span class="dim">${p.pos}</span></td></tr>`).join('')}</table></div>`;
  } else {
    const yrs = Object.keys(G.draftHistory).map(Number).sort((a, b) => b - a);
    if (yrs.length) { const y = yrs[0]; side += `<h4 class="px">${y} DRAFT · FIRST ROUND</h4><table class="tbl small">${G.draftHistory[y].filter(p => p.rd === 1).map(p => `<tr class="${p.tid === G.userTeam ? 'me-row' : ''}"><td class="dim">#${p.ovr}</td><td>${crest(p.tid, 14)} ${esc(TM(p.tid).abbr)}</td><td>${pidLink(p.pid, p.name)} <span class="dim">${p.pos}</span></td></tr>`).join('')}</table>`; }
    else side += '<p class="dim">Draft history appears after your first draft.</p>';
  }
  side = `<div><h4 class="px">YOUR NEEDS</h4>${needBars(need)}<p class="dim small">Draft needs blend today's depth chart with how it looks in two seasons, when today's prospects are ready.</p></div>` + side;
  h += panel('DRAFT ROOM', `<div class="droom">${side}</div>`) + `</div>`;
  if (!D) { const ys = Object.keys(G.grades || {}).map(Number).filter(y => G.grades[y].draft).sort((a, b) => b - a); if (ys.length) h += gradesPanel('draft', ys[0]); }
  return h;
}

// ---------- Coaches ----------
function coachLink(c) { return c ? `<a class="plink" data-act="coach" data-id="${c.id}">${esc(coachName(c))}</a>` : '<span class="dim">Vacant</span>'; }
function quirkChips(c) {
  const ks = Object.keys(c.quirks || {});
  if (!ks.length) return '<span class="dim small">No notable quirks</span>';
  return ks.map(k => QUIRKS[k] ? `<span class="quirk ${QUIRKS[k].neg ? 'neg' : 'pos'}" title="${esc(QUIRKS[k].blurb)}">${esc(QUIRKS[k].name)} ${'★'.repeat(c.quirks[k])}</span>` : '').join(' ');
}
function coachBars(c) { return COACH_RATINGS.map(([k, n]) => `<div class="abar"><span>${n}</span><div class="bar"><i class="${ovrCls(c[k])}" style="width:${c[k]}%"></i></div><b>${c[k]}</b></div>`).join(''); }
function coachStyleLine(c, role) {
  if (role === 'AC') return `<b>${esc(c.offStyle)}</b> <span class="dim small">${esc(OFF_STYLES[c.offStyle].blurb)}</span>`;
  if (role === 'DC') return `<b>${esc(c.defStyle)}</b> <span class="dim small">${esc(DEF_STYLES[c.defStyle].blurb)}</span>`;
  if (role === 'GC') return `<span class="dim small">Goaltending specialist</span>`;
  return `<span class="dim small">${c.side === 'off' ? 'Offensive' : 'Defensive'} background · prefers ${esc(c.offStyle)} / ${esc(c.defStyle)}</span>`;
}
function hcRecord(c) { return c.cw + c.cl + c.ct ? `${c.cw}-${c.cl}-${c.ct} as HC` : 'No HC record'; }
function staffCard(role, c) {
  const u = TM(G.userTeam), off = !['regular', 'playoffs'].includes(G.phase);
  if (!c) return `<div class="coach-card vacant"><div class="px small">${ROLE_NAMES[role]}</div><p class="bad">VACANT</p><p class="dim small">Hire from the candidates below. If the season starts with this job open, the team promotes a cheap assistant.</p><button class="btn tiny" data-act="coachRole" data-v="${role}">SEE ${role} CANDIDATES</button></div>`;
  const styles = role === 'AC' ? Object.keys(OFF_STYLES) : role === 'DC' ? Object.keys(DEF_STYLES) : null;
  const cur = role === 'AC' ? c.offStyle : c.defStyle;
  return `<div class="coach-card"><div class="coach-top"><img class="pface sm" src="${Faces.portrait(c, u, 2)}" alt="">
    <div><div class="px small gold">${ROLE_NAMES[role]}</div><div class="px">${coachLink(c)}</div><div class="dim small">Age ${c.age} · OVR <b>${coachOvr(c, role)}</b> · REP ${c.rep} · ${hcRecord(c)}${c.titles ? ` · <span class="gold">🏆×${c.titles}</span>` : ''}</div></div></div>
    <div class="small">${coachStyleLine(c, role)}</div>
    ${styles ? `<div class="small">System <select data-change="coachStyle" data-role="${role}" ${off && !qLvl(c, 'stubborn') ? '' : 'disabled'}>${styles.map(s => `<option ${s === cur ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select> <span class="dim">${off ? (qLvl(c, 'stubborn') ? 'stubborn - won\'t change' : 'offseason: can change') : 'locked during the season'}</span></div>` : ''}
    <div class="coach-bars">${coachBars(c)}</div><div>${quirkChips(c)}</div>
    <div class="small dim">Contract ${fmtM(c.contract ? c.contract.sal : 0)}/yr through ${c.contract ? c.contract.exp : '-'} · buyout ${fmtM(coachBuyout(G, c))}</div>
    <div class="pact"><button class="btn tiny alt" data-act="coachClinic" data-id="${c.id}" ${c.clinic === G.year ? 'disabled' : ''} title="Raises his main ratings 1-3 and may tame a bad quirk. Once per year.">${c.clinic === G.year ? 'CLINIC DONE' : `CLINIC ${fmtM(role === 'HC' ? 1 : 0.5)}`}</button><button class="btn tiny danger" data-act="coachFire" data-v="${role}" ${G.phase === 'playoffs' ? 'disabled' : ''}>FIRE</button></div></div>`;
}
function vCoaches() {
  const u = TM(G.userTeam), S = staffOf(G, u.id);
  let h = '';
  if (G.coachLoss && G.coachLoss.year >= G.year - 1) h += `<div class="beta-note bad-note">Your ${G.coachLoss.role} ${esc(G.coachLoss.name)} left to become head coach of the ${esc(TM(G.coachLoss.to).city)} ${esc(TM(G.coachLoss.to).name)}.</div>`;
  h += panel(`YOUR STAFF <span class="dim small">payroll ${fmtM(staffPayroll(G, u.id))}/yr · ops cash ${fmtM(G.ops ? G.ops.cash : 0)}</span>`,
    `<div class="coach-grid">${COACH_ROLES.map(r => staffCard(r, S[r])).join('')}</div>
    <p class="dim small">The associate coach's offensive rating and system drive your attack and power play; the assistant's drive your defense and penalty kill; the goalie coach adds to your goalies' reflexes and positioning. The head coach adds game management (when to pull the goalie, line matching), motivation and, with the staff, offseason development for players 26 and under. Coaching salaries come from the arena budget, not the cap.</p>`);
  const role = UI.coachRole || (COACH_ROLES.find(r => !S[r]) || 'AC');
  const pool = G.coachPool.map(id => G.coaches[id]).filter(Boolean).sort((a, b) => coachOvr(b, role) - coachOvr(a, role));
  const vacant = !S[role];
  h += panel(`AVAILABLE COACHES <span class="dim small">${vacant ? `you can hire a ${role}` : `your ${role} job is filled - fire first to hire`}</span>`,
    `<div class="filters">${COACH_ROLES.map(r => `<button class="chip ${role === r ? 'on' : ''}" data-act="coachRole" data-v="${r}">${r}${!S[r] ? ' (OPEN)' : ''}</button>`).join('')}</div>
    <div class="scroll tall"><table class="tbl"><tr><th>NAME</th><th>AGE</th><th>${role} OVR</th><th>OFF</th><th>DEF</th><th>DEV</th><th>MOT</th><th>GM</th><th>GK</th><th>SYSTEM</th><th>QUIRKS</th><th>ASKING</th><th></th></tr>
    ${pool.map(c => `<tr><td>${coachLink(c)}</td><td>${c.age}</td><td>${ovrB(coachOvr(c, role))}</td><td>${c.off}</td><td>${c.def}</td><td>${c.dev}</td><td>${c.mot}</td><td>${c.gm}</td><td>${c.gk}</td><td class="small">${esc(role === 'DC' ? c.defStyle : role === 'AC' ? c.offStyle : role === 'GC' ? '-' : c.side === 'off' ? 'Offense' : 'Defense')}</td><td>${quirkChips(c)}</td><td>${fmtM(coachAsk(c, role))}</td><td>${vacant ? `<button class="btn tiny" data-act="coachHire" data-id="${c.id}" data-v="${role}">HIRE</button>` : ''}</td></tr>`).join('')}</table></div>`);
  const C = G.carousel;
  if (C && C.moves.length) {
    const tag = { fired: ['FIRED', 'bad'], promoted: ['PROMOTED', 'good'], poached: ['POACHED', 'bad'], hired: ['HIRED', 'dim'], retired: ['RETIRED', 'dim'], left: ['LEFT', 'dim'] };
    h += panel(`${seasonLabel(C.year)} COACHING CAROUSEL`, `<table class="tbl">${C.moves.map(m => `<tr class="${m.tids.includes(u.id) ? 'me-row' : ''}"><td><span class="${(tag[m.type] || ['', ''])[1]} px small">${(tag[m.type] || [m.type])[0]}</span></td><td>${m.tids.map(t => crest(t, 16)).join('')}</td><td>${esc(m.text)}</td></tr>`).join('')}</table>`);
  }
  h += panel('LEAGUE COACHING STAFFS', `<div class="scroll tall"><table class="tbl"><tr><th>TEAM</th><th>HEAD COACH</th><th>OVR</th><th>CAREER</th><th>OFFENSE</th><th>DEFENSE</th></tr>${G.teams.map(t => { const s = staffOf(G, t.id); return `<tr class="${t.id === u.id ? 'me-row' : ''}"><td>${teamLink(t.id)}</td><td>${coachLink(s.HC)}</td><td>${s.HC ? ovrB(coachOvr(s.HC, 'HC')) : ''}</td><td class="dim small">${s.HC ? hcRecord(s.HC) : ''}</td><td>${coachLink(s.AC)} <span class="dim small">${s.AC ? esc(s.AC.offStyle) : ''}</span></td><td>${coachLink(s.DC)} <span class="dim small">${s.DC ? esc(s.DC.defStyle) : ''}</span></td></tr>`; }).join('')}</table></div>`);
  return h;
}
function coachModal(cid) {
  const c = G.coaches[cid]; if (!c) return;
  const t = c.tid >= 0 ? TM(c.tid) : null;
  let h = `<div class="pcard" style="--c1:${t ? t.c1 : '#444'}"><img class="pface" src="${Faces.portrait(c, t)}" alt=""><div class="pinfo">
    <div class="px pname">${esc(coachName(c))}</div><div>${t ? `${ROLE_NAMES[c.role]} · ${teamLink(t.id, true)}` : 'Available'}</div>
    <div class="dim">Age ${c.age} · REP ${c.rep} · ${hcRecord(c)}${c.titles ? ` · ${c.titles} Mug title${c.titles > 1 ? 's' : ''}` : ''}</div>
    <div class="small">${coachStyleLine(c, c.tid >= 0 ? c.role : 'HC')}</div><div>${quirkChips(c)}</div></div></div>
    <div class="grid2"><div>${coachBars(c)}<p class="dim small">HC ${coachOvr(c, 'HC')} · AC ${coachOvr(c, 'AC')} · DC ${coachOvr(c, 'DC')} · GC ${coachOvr(c, 'GC')}</p></div>
    <div>${Object.keys(c.quirks).filter(k => QUIRKS[k]).map(k => `<p class="small"><b class="${QUIRKS[k].neg ? 'bad' : 'good'}">${esc(QUIRKS[k].name)} ${'★'.repeat(c.quirks[k])}</b> ${esc(QUIRKS[k].blurb)}</p>`).join('')}</div></div>`;
  if (c.hist.length) h += `<h4 class="px">CAREER</h4><div class="scroll"><table class="tbl"><tr><th>SEASON</th><th>TEAM</th><th>ROLE</th><th>RECORD</th><th>RESULT</th><th>OFF RK</th><th>DEF RK</th></tr>${c.hist.slice().reverse().map(e => `<tr><td>${seasonLabel(e.y)}</td><td>${esc(e.abbr)}</td><td>${e.role}</td><td>${e.w}-${e.l}-${e.t || 0}</td><td class="small">${esc(e.res)}</td><td>${ordinal(e.off)}</td><td>${ordinal(e.def)}</td></tr>`).join('')}</table></div>`;
  openModal(h, true);
}

// ---------- Arena ops ----------
function fanMeterHtml(v, big) {
  const [lbl, cls] = fanMood(v);
  const col = v >= 65 ? 'var(--good)' : v >= 45 ? '#8fb3ff' : v >= 30 ? 'var(--acc)' : 'var(--bad)';
  return `<div class="fanmeter ${big ? 'big' : ''}"><div class="fm-bar"><i style="width:${Math.round(v)}%;background:${col}"></i></div><span class="px ${cls}">${Math.round(v)} · ${lbl}</span></div>`;
}
function vOps() {
  const O = G.ops; if (!O) return panel('ARENA OPERATIONS', '<p class="dim">Not available.</p>');
  const fp = fairPrices(G), S = O.season;
  let h = '';
  if (O.event) h += `<div class="warn">⚠ <b>${esc(O.event.title)}</b> needs your response. <button class="btn tiny" data-act="opsEvent">RESPOND</button></div>`;
  h += `<div class="grid2">`;
  const recent = O.fanLog.slice(0, 8);
  h += panel('FAN HAPPINESS', fanMeterHtml(O.fans, true) + `<p class="dim small">Driven by winning, prices, the arena experience and how you handle events. Happy fans buy more tickets, food and jerseys, and make your home crowd louder (crowd boost ×${crowdFactor(G).toFixed(2)}).</p>` +
    (recent.length ? `<table class="tbl">${recent.map(e => `<tr><td class="dim small">${e.w ? 'Day ' + e.w : seasonLabel(e.y)}</td><td class="${e.d > 0 ? 'good' : 'bad'} r">${e.d > 0 ? '+' : ''}${e.d}</td><td class="small">${esc(e.why)}</td></tr>`).join('')}</table>` : '<p class="dim">No changes yet.</p>'));
  const rev = Object.values(S.rev).reduce((a, b) => a + b, 0), exp = Object.values(S.exp).reduce((a, b) => a + b, 0);
  const row = (l, v, neg) => `<tr><td>${l}</td><td class="r ${neg ? 'bad' : ''}">${neg ? '-' : ''}${fmtM(v)}</td></tr>`;
  const lh = O.lastHome;
  h += panel(`FINANCES · CASH <span class="${O.cash < 0 ? 'bad' : 'good'}">${fmtM(O.cash)}</span>`,
    `<div class="grid2"><table class="tbl"><tr><th>REVENUE</th><th></th></tr>${row('Season tickets', S.rev.season)}${row('Game tickets', S.rev.tickets)}${row('Concessions', S.rev.food)}${row('Parking', S.rev.parking)}${row('Merchandise', S.rev.merch)}${S.rev.other ? row('Other', S.rev.other) : ''}<tr><td><b>Total</b></td><td class="r"><b>${fmtM(rev)}</b></td></tr></table>
    <table class="tbl"><tr><th>EXPENSES</th><th></th></tr>${row('Maintenance', S.exp.maint, 1)}${row('Upgrades', S.exp.upgrades, 1)}${row('Game-night staff', S.exp.gameday, 1)}${row('Food & jersey costs', S.exp.goods, 1)}${row('Events', S.exp.events, 1)}<tr><td><b>Profit</b></td><td class="r ${rev - exp >= 0 ? 'good' : 'bad'}"><b>${fmtM(rev - exp)}</b></td></tr></table></div>` +
    `<p class="small">Season ticket holders: <b>${O.sth.toLocaleString()}</b> · Capacity ${opsCapacity(G).toLocaleString()}${S.games ? ` · Avg attendance ${Math.round(S.att / S.games).toLocaleString()}` : ''}</p>` +
    (lh ? `<p class="small dim">Last home game (${lh.playoff ? 'playoffs' : 'day ' + lh.w} vs ${TM(lh.opp).abbr}): ${lh.att.toLocaleString()} fans (${Math.round(lh.att / lh.cap * 100)}%) · tickets ${fmtM(lh.tick)} · food ${fmtM(lh.food)} · parking ${fmtM(lh.park)}</p>` : ''));
  h += `</div>`;
  const gate = projectedGate(G);
  const pr = (k, label, unit, note) => { const [l, c] = priceLabel(O.prices[k] / fp[k]); return `<tr><td><b>${label}</b><div class="dim small">${note}</div></td><td>$<input class="price-in" type="number" data-change="opsPrice" data-k="${k}" value="${O.prices[k]}" min="1"> <span class="dim small">${unit}</span></td><td class="dim small">fair ~$${fp[k]}</td><td class="${c} px small">${l}</td></tr>`; };
  h += panel('PRICING', `<table class="tbl">${pr('season', 'Season tickets', 'per seat / season', G.phase === 'regular' || G.phase === 'playoffs' ? 'Applies when next season starts' : `Projected: ${projectedSTH(G).toLocaleString()} sold`)}
    ${pr('ticket', 'Single-game tickets', 'each', `Projected crowd ${Math.round(gate.att / gate.cap * 100)}% (${gate.att.toLocaleString()})`)}
    ${pr('food', 'Concessions', 'avg item', 'Higher prices = fewer sales and grumpier fans')}
    ${pr('jersey', 'Jerseys', 'each', `Demand ~${jerseyDemand(G).reduce((a, d) => a + d.demand, 0).toLocaleString()} / week`)}</table>`);
  const cards = FACILITIES.map(([k]) => {
    const f = O.stadium[k], F = FAC[k], c = upgradeCost(G, k);
    const cc = f.cond >= 70 ? 'o-great' : f.cond >= 50 ? 'o-good' : f.cond >= 35 ? 'o-avg' : 'o-low';
    const le = k === 'locker' ? lockerEffect(G) : 0;
    const note = k === 'locker' ? `<div class="small ${le < 0 ? 'bad' : le > 0 ? 'good' : 'dim'}">Team morale ${le > 0 ? '+' : ''}${Math.round(le * 10) / 10}/wk</div>` : k === 'ice' ? `<div class="small dim">Home ice quality ×${iceFactor(G).toFixed(2)}</div>` : f.cond < 25 ? '<div class="small bad">Fans furious · may fail on game night</div>' : f.cond < 45 ? '<div class="small bad">Fans are complaining</div>' : '';
    return `<div class="fac"><div class="px small">${F.name} <span class="gold">LV ${f.lvl}/5</span></div><div class="dim small">${F.blurb}</div>${note}
      <div class="rbar"><span>COND</span><div class="bar"><i class="${cc}" style="width:${Math.round(f.cond)}%"></i></div><b>${Math.round(f.cond)}</b></div>
      <div class="small">Upkeep <select data-change="opsMaint" data-k="${k}">${MAINT_LEVELS.map((m, i) => `<option value="${i}" ${f.maint === i ? 'selected' : ''}>${m}${i ? ' $' + Math.round(MAINT_COST[i] * 1000) + 'K/wk' : ''}</option>`).join('')}</select>
      ${c === null ? '<span class="good small">MAXED</span>' : `<button class="btn tiny ${O.cash >= c ? '' : 'alt'}" data-act="opsUpgrade" data-k="${k}" ${O.cash >= c ? '' : 'disabled'}>UPGRADE ${fmtM(c)}</button>`}</div></div>`;
  }).join('');
  h += panel(`ARENA <span class="dim small">avg condition ${Math.round(avgCond(G))} · upkeep ${fmtM(maintPerWeek(G))}/week</span>`, `<p class="dim small">Facilities wear with every home game. Upkeep slows it; upgrades restore condition to 100 and add a level.</p><div class="facs">${cards}</div>`);
  const J = O.jersey, plan = jerseyPlan(G);
  h += panel(`JERSEY SALES <span class="dim small">production ${jerseyCapacity(G).toLocaleString()}/week</span>`,
    `<div class="pact"><button class="chip ${J.auto ? 'on' : ''}" data-act="opsJAuto" data-v="1">AUTO (FOLLOW DEMAND)</button><button class="chip ${J.auto ? '' : 'on'}" data-act="opsJAuto" data-v="0">MANUAL ALLOCATION</button></div>
    <div class="scroll"><table class="tbl"><tr><th>PLAYER</th><th>POP</th><th>DEMAND/WK</th><th>MAKING/WK</th><th>IN STOCK</th><th>SOLD</th><th>ALLOCATION</th></tr>${plan.map(r => `<tr><td>${r.p.pos} ${pLink(r.p)}</td><td>${r.pop}</td><td>${r.demand.toLocaleString()}</td><td>${r.make.toLocaleString()}</td><td>${(J.stock[r.p.id] || 0).toLocaleString()}</td><td>${(J.sold[r.p.id] || 0).toLocaleString()}</td>
      <td>${J.auto ? '<span class="dim small">auto</span>' : `<select data-change="opsJAlloc" data-id="${r.p.id}">${[0, 1, 2, 3, 4, 5].map(n => `<option ${r.weight === n ? 'selected' : ''}>${n}</option>`).join('')}</select>`}</td></tr>`).join('')}</table></div>`);
  h += `<div class="grid2">`;
  h += panel('EVENT LOG', O.eventLog.length ? `<table class="tbl">${O.eventLog.slice(0, 12).map(e => `<tr><td class="dim small">${seasonLabel(e.y)}${e.w ? ' d' + e.w : ''}</td><td><b>${esc(e.title)}</b><div class="small">${esc(e.choice)}</div><div class="dim small">${esc(e.fx)}${e.extra ? ' · ' + esc(e.extra) : ''}</div></td></tr>`).join('')}</table>` : '<p class="dim">Nothing has happened yet. Something will.</p>');
  h += panel('PAST SEASONS', O.hist.length ? `<table class="tbl"><tr><th>SEASON</th><th>FANS</th><th>AVG CROWD</th><th>REVENUE</th><th>PROFIT</th></tr>${O.hist.slice().reverse().map(x => { const r = Object.values(x.rev).reduce((a, b) => a + b, 0), e = Object.values(x.exp).reduce((a, b) => a + b, 0); return `<tr><td>${seasonLabel(x.year)}</td><td>${x.fans}</td><td>${x.att.toLocaleString()}</td><td>${fmtM(r)}</td><td class="${r - e >= 0 ? 'good' : 'bad'}">${fmtM(r - e)}</td></tr>`; }).join('')}</table>` : '<p class="dim">Your first season is underway.</p>');
  return h + `</div>`;
}
function opsEventModal() {
  const ev = G.ops && G.ops.event; if (!ev) return;
  const e = OPS_EVENTS.find(x => x.id === ev.id);
  const p = ev.ctx && ev.ctx.pid !== undefined ? G.players[ev.ctx.pid] : null;
  openModal(`<h3 class="px">⚠ ${esc(ev.title.toUpperCase())}</h3><p>${esc(ev.text)}</p>${p ? `<p class="small dim">${p.pos} ${pLink(p)} · ${ovrB(p.ovr)} · popularity ${playerPopularity(G, p)}</p>` : ''}
    <div class="small">FAN HAPPINESS ${fanMeterHtml(G.ops.fans)}</div><p class="small">Operations cash: <b>${fmtM(G.ops.cash)}</b></p>
    <div class="ev-choices">${e.choices.map((c, i) => { const fx = eventChoiceFx(G, ev, i); return `<button class="btn ev-choice" data-act="opsChoose" data-v="${i}"><b>${esc(c.label)}</b><span class="small">${esc(fxSummary(G, fx, ev) || 'no immediate effect')}${c.risk ? ' · risky' : ''}</span></button>`; }).join('')}</div>
    <p class="dim small">You have to respond before the season can continue.</p>`);
}
