'use strict';
// ================= Auto GM: what happens for the user's team when they don't act =================
// Draft: unmade picks go to the best fit on the user's own (scouted) board.
// Re-signing: expiring players not handled by the user are kept or let go by role, age and need.
// Free agency: each FA day (before the AI teams), offer the best affordable upgrades at needs of 6+ (up to two signings).
// Scouting: points above a small reserve are spent on prospects at need positions; all of them before the draft.

function autoGM(L) {
  if (!L.autoGM) L.autoGM = { resign: true, fa: true, scout: true };
  return L.autoGM;
}

// ---------- Draft ----------
function userAutoPick(L) {
  const need = draftNeeds(L, L.teams[L.userTeam]);
  let best = null, bv = -1e9;
  for (const pid of L.draft.pool.slice(0, 60)) {
    const p = L.players[pid]; if (!p) continue;
    const v = fitScore(p, need) + (p.pos === 'G' ? -1.5 : 0);
    if (v > bv) { bv = v; best = p; }
  }
  return best;
}

// ---------- Re-signing ----------
// score > 0 means keep. Built from: how far above a replacement-level player he is at his position,
// upside (young) or decline (old), and how big a hole his leaving would open.
function resignAdvice(L, p) {
  const team = L.teams[p.tid], roster = rosterPlayers(L, team);
  const lg = leagueSlotAvg(L, 'now'), slots = lg.avg[p.pos];
  const repl = slots[slots.length - 1];
  const needIfGone = rosterNeeds(L, roster.filter(x => x.id !== p.id)).need[p.pos];
  const depth = 1 + roster.filter(x => x.pos === p.pos && x.id !== p.id && x.ovr > p.ovr).length;
  let score = (p.ovr - repl) * 0.6 + (needIfGone - 5) * 1.1;
  if (p.age <= 24) score += Math.max(0, p.pot - p.ovr) * 0.3;
  if (p.age >= 32) score -= (p.age - 31) * 1.4;
  if (p.farm && p.age >= 24 && p.pot - p.ovr < 5) score -= 3;
  const reasons = [];
  if (depth <= Math.ceil(slots.length / 2) && !p.farm) reasons.push(`#${depth} ${p.pos} on the depth chart`);
  if (needIfGone >= 6.5) reasons.push(`leaving opens a ${needLevel(needIfGone)[1].toLowerCase()} need`);
  if (p.age <= 24 && p.pot - p.ovr >= 6) reasons.push('young with upside');
  if (p.age >= 32) reasons.push(`aging (${p.age})`);
  if (p.ovr <= repl + 1) reasons.push('replacement level');
  return { keep: score > 0.5, score: Math.round(score * 10) / 10, reason: reasons.join(', ') || (score > 0.5 ? 'solid contributor' : 'easy to replace') };
}
// Re-sign the user's remaining expiring players worth keeping, best first, while cap space lasts.
function autoResignUser(L) {
  const team = L.teams[L.userTeam];
  const cands = expiring(L, team).filter(p => p.walk !== L.year && p.refused !== L.year)
    .map(p => ({ p, a: resignAdvice(L, p) })).filter(x => x.a.keep).sort((x, y) => y.a.score - x.a.score);
  const kept = [], lost = [];
  for (const { p } of cands) {
    const ask = askingContract(L, p);
    let done = false;
    for (const mult of [1, 1.1, 1.2]) {
      const sal = Math.round(ask.sal * mult * 100) / 100;
      if (sal > capSpace(L, team) - 0.5) break;
      if (R.chance(resignOdds(L, p, sal, ask.yrs))) { p.contract = { sal, exp: L.year + ask.yrs - 1 }; done = true; break; }
    }
    if (done) { kept.push(p); news(L, `${team.abbr} re-signed ${p.pos} ${fullName(p)}: ${fmtM(p.contract.sal)} x ${p.contract.exp - L.year + 1} (auto).`, team.id); }
    else lost.push(p);
  }
  return { kept, lost };
}

// ---------- Free agency ----------
function autoFAUser(L) {
  const team = L.teams[L.userTeam], signed = [];
  for (let k = 0; k < 2; k++) {
    if (nhlRoster(L, team).length >= ROSTER_LIMIT + 2) break;
    const roster = rosterPlayers(L, team), need = teamNeeds(L, team);
    let got = null;
    for (const pos of topNeeds(need, 6)) {
      const slot = slotOvrs(roster, pos, 'now');
      const bar = slot[Math.min(slot.length - 1, pos === 'G' ? 0 : 2)]; // must beat the weak end of the top group
      const space = capSpace(L, team) - 1;
      const cands = L.fa.map(id => L.players[id]).filter(p => p && p.pos === pos && !p.injury && p.ovr > bar + 1 && askingContract(L, p).sal <= space)
        .sort((a, b) => playerValue(b) - playerValue(a)).slice(0, 3);
      for (const c of cands) {
        if (c.faTried === `${L.year}-${L.faDay}`) continue;
        const ask = askingContract(L, c), sal = Math.min(space, Math.round(ask.sal * 1.15 * 100) / 100);
        c.faTried = `${L.year}-${L.faDay}`;
        if (R.chance(faOdds(L, c, sal, ask.yrs))) {
          signPlayer(L, team, c, true, { sal, exp: L.year + ask.yrs - 1 });
          news(L, `${team.abbr} signed ${c.pos} ${fullName(c)} (${c.ovr} OVR, ${fmtM(sal)} x ${ask.yrs}) to fill a ${POS_NAME[pos].toLowerCase()} need (auto).`, team.id);
          got = c; break;
        }
      }
      if (got) break;
    }
    if (!got) break;
    signed.push(got);
  }
  return signed;
}

// ---------- Scouting ----------
function autoScoutTick(L, reserve) {
  if (!autoGM(L).scout || L.scoutPts <= reserve) return 0;
  const keep = L.scoutPts; let n = 0;
  L.scoutPts = keep - reserve;
  n = autoScoutNeeds(L, true);
  L.scoutPts += reserve;
  return n;
}
