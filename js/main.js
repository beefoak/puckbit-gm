'use strict';
// ================= Actions, simulation flow, boot =================
function afterSim(prevPhase) {
  if (prevPhase === 'regular' && G.phase === 'playoffs') { toast('The regular season is over. Awards are in and the playoffs begin!'); UI.tab = 'playoffs'; }
  if (prevPhase === 'playoffs' && G.phase === 'postseason') { const c = G.champions[G.champions.length - 1]; toast(`${c.champName} win Stanley's Mug!`); UI.tab = 'home'; }
  persist(); render();
  if (G.ops && G.ops.newEvent) { G.ops.newEvent = 0; if (G.ops.event) opsEventModal(); }
}
function playDay() {
  if (G.ops && G.ops.event) { opsEventModal(); return; }
  const prev = G.phase;
  const ug = userGameToday(G);
  if (G.phase === 'regular') {
    if (ug && UI.watch) {
      playDayGames(G, true);
      Rink.open(G, ug, false, { commit: (res) => { applyResult(G, ug, res, false); endDay(G); persist(); }, closed: () => afterSim(prev) });
      return;
    }
    simDay(G);
  } else if (G.phase === 'playoffs') {
    if (ug && UI.watch) {
      simPlayoffDay(G, true);
      Rink.open(G, ug, true, { commit: (res) => { applyResult(G, ug, res, true); seriesResult(G, ug); endPlayoffDay(G); persist(); }, closed: () => afterSim(prev) });
      return;
    }
    simPlayoffDay(G);
  }
  afterSim(prev);
}
function simDays(n) {
  if (UI.busy) return;
  if (G.ops && G.ops.event) { opsEventModal(); return; }
  const start = { day: G.day, round: G.playoffs ? G.playoffs.round : -1, phase: G.phase };
  const done = () => {
    if (G.ops && G.ops.event) return true;
    if (n === 'season') return G.phase !== 'regular';
    if (n === 'deadline') return G.phase !== 'regular' || G.day > G.deadlineDay;
    if (n === 'playoffs') return G.phase !== 'playoffs';
    if (n === 'round') return G.phase !== 'playoffs' || G.playoffs.round !== start.round;
    return G.phase !== start.phase || G.day >= start.day + (+n);
  };
  UI.busy = true; UI.stop = false; render();
  const chunk = () => {
    const t0 = performance.now();
    while (!done() && !UI.stop && performance.now() - t0 < 120) simDay(G);
    if (done() || UI.stop) { UI.busy = false; afterSim(start.phase); return; }
    const hdr = document.querySelector('header.top .sub'); if (hdr) hdr.textContent = `${recStr(TM(G.userTeam).rec)} · ${phaseLabel()}`;
    setTimeout(chunk, 0);
  };
  setTimeout(chunk, 20);
}
function newGame(tid) {
  UI.loading = 'BUILDING 66 SEASONS OF HISTORY…'; render();
  setTimeout(() => {
    try {
      G = newLeague(tid, startNames());
      UI.loading = null; UI.tab = 'home';
      persist(); render();
      toast(`Welcome to ${TM(tid).city}! Check the Stanley's Mug history page to see what you've inherited.`);
    } catch (e) { console.error(e); UI.loading = null; G = null; render(); toast('Could not create the league: ' + e.message); }
  }, 60);
}
function onAct(act, el) {
  const id = el.dataset.id;
  switch (act) {
    case 'continue': G = loadLeague(); if (!G) toast('Save could not be loaded.'); UI.tab = 'home'; render(); return;
    case 'newgame': if (hasSave() && !confirm('Start a new league? Your saved game will be overwritten.')) return; newGame(+id); return;
    case 'namesEdit': UI.editNames = true; render(); return;
    case 'namesDone': UI.editNames = false; render(); return;
    case 'namesReset': try { localStorage.removeItem(NAMES_KEY); } catch (e) { /* */ } UI.names = null; render(); return;
    case 'helpOpen': openModal(vHelp(), true); return;
    case 'tab': UI.tab = el.dataset.tab; UI.navOpen = false; closeModal(); render(); window.scrollTo(0, 0); return;
    case 'navToggle': UI.navOpen = !UI.navOpen; render(); return;
    case 'save': persist(); toast(`Saved (${Math.round(saveSize() / 1024)} KB).`); return;
    case 'quit': if (confirm('Quit to the title screen? Your league stays saved.')) { G = null; render(); } return;
    case 'closeModal': closeModal(); return;
    case 'playDay': playDay(); return;
    case 'simDays': simDays(el.dataset.n); return;
    case 'stopSim': UI.stop = true; return;
    case 'offseason': runOffseason(G); UI.hofPick = []; UI.tab = 'draft'; persist(); render(); toast(`Welcome to the ${G.year} Draft.`); return;
    case 'hofBallot': hofBallotModal(); return;
    case 'hofPick': { UI.hofPick = UI.hofPick || []; const pid = +id; if (UI.hofPick.includes(pid)) UI.hofPick = UI.hofPick.filter(x => x !== pid); else if (UI.hofPick.length < 4) UI.hofPick.push(pid); else toast('Up to 4 inductees per year.'); hofBallotModal(); return; }
    case 'hofSubmit': { const picks = (UI.hofPick || []).map(pid => G.retired.find(r => r.pid === pid)).filter(Boolean); picks.forEach(r => { hofInduct(G, r, G.year + 1); news(G, `HALL OF FAME: ${r.name} (${r.pos}) is inducted into the Hall of Fame.`, -1); }); G.hofVoted = G.year; UI.hofPick = []; closeModal(); persist(); render(); toast(picks.length ? `${picks.length} new Hall of Famer${picks.length > 1 ? 's' : ''}!` : 'Nobody inducted this year.'); return; }
    case 'draftToMe': simDraftToUser(G); persist(); render(); if (draftDone(G)) toast('The draft is over.'); return;
    case 'finishDraft': finishDraft(G); UI.tab = 'contracts'; persist(); render(); toast('Draft complete. Time to re-sign your players.'); return;
    case 'draftPick': draftPlayer(G, +id); simDraftToUser(G); persist(); render(); return;
    case 'scout': { const err = scoutPlayer(G, G.players[+id]); if (err) toast(err); persist(); render(); return; }
    case 'startFA': startFreeAgency(G); UI.tab = 'fa'; persist(); render(); return;
    case 'faDay': advanceFADay(G); if (G.phase === 'preseason') { UI.tab = 'home'; toast('Free agency is over. Training camp opens.'); } persist(); render(); return;
    case 'autoCut': { const u = TM(G.userTeam); aiManageRoster(G, u, true); if (G.autoLines) u.lines = autoLines(G, u); persist(); render(); toast('Roster set: extras sent to the farm.'); return; }
    case 'startSeason': { const err = startSeason(G); if (err) { toast(err); return; } UI.tab = 'home'; UI.schedDay = null; persist(); render(); toast(`The ${seasonLabel(G.year)} season is underway!`); return; }
    case 'rSort': UI.rDir = UI.rSort === el.dataset.k ? -UI.rDir : -1; UI.rSort = el.dataset.k; render(); return;
    case 'rPos': UI.rPos = el.dataset.k; render(); return;
    case 'callUp': { const p = G.players[+id]; callUp(G, p); news(G, `${TM(G.userTeam).abbr} called up ${p.pos} ${fullName(p)}.`, G.userTeam); persist(); closeModal(); render(); return; }
    case 'sendDown': { const err = sendDown(G, G.players[+id]); if (err) toast(err); persist(); closeModal(); render(); return; }
    case 'release': { const p = G.players[+id]; const yrs = p.contract ? p.contract.exp - G.year + 1 : 0; if (!confirm(`Release ${fullName(p)}?${yrs > 0 && !p.farm ? ` A buyout of his remaining ${yrs} year(s) becomes dead cap money.` : ''}`)) return; releasePlayer(G, p); persist(); closeModal(); render(); return; }
    case 'injAll': UI.injAll = !UI.injAll; render(); return;
    case 'newsAll': UI.newsAll = !UI.newsAll; render(); return;
    case 'autoLines': G.autoLines = el.dataset.v === '1'; if (G.autoLines) TM(G.userTeam).lines = autoLines(G, TM(G.userTeam)); persist(); render(); return;
    case 'resetLines': TM(G.userTeam).lines = autoLines(G, TM(G.userTeam)); G.autoLines = false; UI.lineSel = null; persist(); render(); return;
    case 'rebuildSpecial': buildSpecial(G, userLines()); persist(); render(); return;
    case 'lineSlot': onLineSlot(el.dataset.g, el.dataset.i, el.dataset.j); return;
    case 'linePool': onLinePool(id); return;
    case 'schedDay': UI.schedDay = el.dataset.d === 'today' ? null : clamp(+el.dataset.d, 1, G.lastDay); render(); return;
    case 'box': showBoxModal(id); return;
    case 'stand': UI.stand = el.dataset.k; render(); return;
    case 'stMode': UI.stMode = el.dataset.k; UI.stSort = el.dataset.k === 'g' ? 'SV%' : el.dataset.k === 'adv' ? 'CF%' : 'PTS'; render(); return;
    case 'stScope': UI.stScope = el.dataset.k; render(); return;
    case 'stPos': UI.stPos = el.dataset.k; render(); return;
    case 'stSort': UI.stDir = UI.stSort === el.dataset.k ? -UI.stDir : -1; UI.stSort = el.dataset.k; render(); return;
    case 'tsSort': UI.tsSort = el.dataset.k; render(); return;
    case 'team': showTeam(id); return;
    case 'player': showPlayer(id); return;
    case 'histTab': UI.histTab = el.dataset.k; render(); return;
    case 'histSeason': UI.histTab = 'seasons'; UI.histYear = +el.dataset.y; render(); window.scrollTo(0, 0); return;
    case 'recTab': UI.recTab = el.dataset.k; render(); return;
    case 'negotiate': UI.neg = null; negotiateModal(id, el.dataset.k); return;
    case 'faOffer': UI.neg = null; negotiateModal(id, 'fa'); return;
    case 'negSubmit': {
      const N = UI.neg, p = G.players[N.pid];
      let err;
      if (N.kind === 'fa') err = offerFA(G, p, N.sal, N.yrs);
      else { const before = p.contract ? p.contract.exp : 0; err = offerResign(G, p, N.sal, N.yrs); if (!err && N.kind === 'extend' && p.contract.exp <= before) p.contract.exp = before + N.yrs; }
      if (err) { toast(err); negotiateModal(N.pid, N.kind); return; }
      closeModal(); persist(); render(); toast(`${fullName(p)} signed: ${fmtM(N.sal)} × ${N.yrs}.`); return;
    }
    case 'faPos': UI.faPos = el.dataset.k; render(); return;
    case 'trSel': { const side = el.dataset.side, k = el.dataset.k; const arr = UI.tr[side]; UI.tr[side] = arr.includes(k) ? arr.filter(x => x !== k) : [...arr, k]; render(); return; }
    case 'trClear': UI.tr.mine = []; UI.tr.theirs = []; render(); return;
    case 'trAsk': {
      const partner = +UI.tr.partner; const mineP = UI.tr.mine.filter(k => k[0] === 'p').map(k => +k.slice(1));
      if (!mineP.length) { toast('Select one of your players first.'); return; }
      const offer = aiBuildOffer(G, partner, mineP[0]);
      if (!offer) { toast(`The ${TM(partner).name} have nothing they'd give for him.`); return; }
      UI.tr.mine = ['p' + mineP[0]]; UI.tr.theirs = offer.map(assetKey); render(); return;
    }
    case 'trPropose': {
      const partner = +UI.tr.partner;
      const give = UI.tr.mine.map(k => tradeAssetByKey(G.userTeam, k)).filter(Boolean), get = UI.tr.theirs.map(k => tradeAssetByKey(partner, k)).filter(Boolean);
      const ev = evaluateTrade(G, partner, give, get);
      if (!ev.ok) { toast(ev.reason || 'They turned it down.'); return; }
      executeTrade(G, G.userTeam, partner, give, get);
      UI.tr.mine = []; UI.tr.theirs = []; persist(); render(); toast('Trade completed!'); return;
    }
    case 'acceptOffer': { const err = acceptOffer(G, id); if (err) toast(err); else toast('Trade accepted!'); persist(); render(); return; }
    case 'declineOffer': G.offers = G.offers.filter(o => o.id !== id); persist(); render(); return;
    case 'tradeBlock': UI.tr = { partner: UI.tr.partner, mine: ['p' + id], theirs: [] }; UI.tab = 'trade'; closeModal(); render(); return;
    case 'tradeFor': { const p = G.players[+id]; UI.tr = { partner: p.tid, mine: [], theirs: ['p' + id] }; UI.tab = 'trade'; closeModal(); render(); return; }
    case 'tradeWith': UI.tr = { partner: +id, mine: [], theirs: [] }; UI.tab = 'trade'; closeModal(); render(); return;
    // coaches
    case 'coach': coachModal(id); return;
    case 'coachRole': UI.coachRole = el.dataset.v; UI.tab = 'coaches'; closeModal(); render(); return;
    case 'coachHire': { const err = coachHire(G, id, el.dataset.v); if (err) toast(err); else { persist(); toast('Coach hired.'); } render(); return; }
    case 'coachFire': { const c = staffOf(G, G.userTeam)[el.dataset.v]; if (!c) return; if (!confirm(`Fire ${coachName(c)}? Buyout: ${fmtM(coachBuyout(G, c))} from the arena budget.`)) return; UI.coachRole = el.dataset.v; const err = coachFire(G, el.dataset.v); if (err) toast(err); persist(); render(); return; }
    case 'coachClinic': { const msg = coachClinic(G, id); persist(); render(); toast(msg); return; }
    // ops
    case 'opsEvent': opsEventModal(); return;
    case 'opsChoose': { const r = opsRespond(G, +el.dataset.v); persist(); closeModal(); render(); if (r) toast(`${r.choice}: ${r.fx || 'done'}.${r.extra ? ' ' + r.extra : ''}`); return; }
    case 'opsUpgrade': { const err = opsUpgrade(G, el.dataset.k); if (err) toast(err); else { persist(); toast('Upgrade complete!'); } render(); return; }
    case 'opsJAuto': G.ops.jersey.auto = el.dataset.v === '1'; if (!G.ops.jersey.auto) for (const r of jerseyDemand(G)) if (G.ops.jersey.alloc[r.p.id] === undefined) G.ops.jersey.alloc[r.p.id] = clamp(Math.round(r.demand / Math.max(1, jerseyCapacity(G)) * 12), 0, 5); persist(); render(); return;
  }
}
function onChange(k, el) {
  switch (k) {
    case 'tname': setStartName(+el.dataset.i, el.dataset.f, el.value); return;
    case 'watch': UI.watch = el.checked; try { localStorage.setItem('phl_watch', UI.watch ? '1' : '0'); } catch (e) { /* */ } render(); return;
    case 'autoRoster': G.autoRoster = el.checked; persist(); return;
    case 'gShare': TM(G.userTeam).gShare = +el.value; persist(); return;
    case 'stTeam': UI.stTeam = el.value; render(); return;
    case 'histYear': UI.histYear = +el.value; render(); return;
    case 'histFid': UI.histFid = +el.value; render(); return;
    case 'awYear': UI.awYear = +el.value; render(); return;
    case 'negSal': UI.neg.sal = clamp(Math.round(+el.value * 100) / 100 || minSalary(G), minSalary(G), maxSalary(G)); negotiateModal(UI.neg.pid, UI.neg.kind); return;
    case 'negYrs': UI.neg.yrs = +el.value; negotiateModal(UI.neg.pid, UI.neg.kind); return;
    case 'trPartner': UI.tr = { partner: el.value === '' ? null : +el.value, mine: UI.tr.mine, theirs: [] }; render(); return;
    case 'coachStyle': { const err = coachSetStyle(G, el.dataset.role, el.value); if (err) toast(err); persist(); render(); return; }
    case 'opsPrice': opsSetPrice(G, el.dataset.k, +el.value); persist(); render(); return;
    case 'opsMaint': G.ops.stadium[el.dataset.k].maint = +el.value; persist(); render(); return;
    case 'opsJAlloc': G.ops.jersey.alloc[+el.dataset.id] = +el.value; persist(); render(); return;
  }
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el || el.closest('#gv')) return;
  if (el.disabled) return;
  if (UI.busy && !['stopSim', 'tab', 'player', 'team', 'closeModal', 'navToggle'].includes(el.dataset.act)) return;
  try { onAct(el.dataset.act, el); } catch (err) { console.error(err); toast('Error: ' + err.message); }
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]'); if (!el || el.closest('#gv')) return;
  try { onChange(el.dataset.change, el); } catch (err) { console.error(err); toast('Error: ' + err.message); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
try { UI.watch = localStorage.getItem('phl_watch') !== '0'; } catch (e) { /* */ }
render();
