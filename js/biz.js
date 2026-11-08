'use strict';
// ================= Salary cap, contracts, free agency, trades =================
const START_CAP = 95.5;
function minSalary(L) { return Math.round(L.cap * 0.0081 * 1000) / 1000; }
function maxSalary(L) { return Math.round(L.cap * 0.2 * 100) / 100; }
function elcSalary(L, ovrPick) { return Math.round((ovrPick <= 10 ? 0.975 : ovrPick <= 32 ? 0.925 : 0.85) * L.cap / START_CAP * 1000) / 1000; }
// What a player is worth on the open market.
function marketValue(L, p) {
  let v = p.ovr;
  if (p.age <= 25) v += (p.pot - p.ovr) * 0.35;
  if (p.age >= 31) v -= (p.age - 30) * 1.3;
  const m = p.pos === 'G' ? 0.88 : p.pos === 'D' ? 0.96 : 1;
  const sal = (minSalary(L) + 0.0115 * Math.pow(Math.max(0, v - 58), 2)) * m * L.cap / START_CAP;
  return clamp(Math.round(sal * 100) / 100, minSalary(L), maxSalary(L));
}
function askingContract(L, p) {
  const sal = marketValue(L, p);
  const yrs = p.age <= 24 ? R.int(2, 6) : p.age <= 29 ? R.int(3, 7) : p.age <= 32 ? R.int(2, 4) : R.int(1, 2);
  return { sal: Math.round(sal * (1 + ((p.id * 7) % 11 - 5) * 0.01) * 100) / 100, yrs: p.ovr < 62 ? 1 : yrs };
}
function underContract(L, p) { return p.contract && p.contract.exp >= L.year; }
function payroll(L, team) {
  let s = 0;
  for (const id of team.roster) { const p = L.players[id]; if (p && !p.farm && p.contract) s += p.contract.sal; }
  for (const d of team.dead || []) if (d.y === L.year) s += d.amt;
  return Math.round(s * 100) / 100;
}
function capSpace(L, team) { return Math.round((L.cap - payroll(L, team)) * 100) / 100; }
function releaseDeadMoney(L, team, p) {
  if (!p.contract || p.contract.exp < L.year || p.farm) return;
  team.dead = team.dead || [];
  const yrsLeft = p.contract.exp - L.year + 1;
  // buyout: two-thirds of the remaining money, spread over twice the remaining years
  const total = p.contract.sal * yrsLeft * (p.age < 26 ? 1 / 3 : 2 / 3);
  const span = yrsLeft * 2; const per = Math.round(total / span * 100) / 100;
  for (let i = 0; i < span; i++) team.dead.push({ y: L.year + i, amt: per, name: fullName(p) });
  p.contract = null;
}
function assignInitialContracts(L) {
  for (const p of Object.values(L.players)) {
    if (p.tid === -2) continue;
    const a = askingContract(L, p);
    if (p.farm && p.age <= 22) p.contract = { sal: elcSalary(L, 40), exp: L.year + R.int(0, 2), elc: true };
    else p.contract = { sal: a.sal, exp: L.year + R.int(0, Math.max(0, a.yrs - 1)) };
  }
  for (const t of L.teams) aiCapComply(L, t, true);
}
// AI teams over the cap shed their worst-value contracts (send down, then release).
function aiCapComply(L, team, init) {
  let guard = 0;
  while (payroll(L, team) > L.cap && guard++ < 30) {
    const act = nhlRoster(L, team).filter(p => p.contract);
    act.sort((a, b) => (playerValue(a) / Math.max(0.5, a.contract.sal)) - (playerValue(b) / Math.max(0.5, b.contract.sal)));
    const p = act.find(x => x.contract.sal > minSalary(L) * 1.5); if (!p) break;
    if (init) { p.contract.sal = Math.max(minSalary(L), Math.round(p.contract.sal * 0.8 * 100) / 100); continue; }
    if (p.age <= 25 && farmRoster(L, team).length < FARM_LIMIT) p.farm = true; else releasePlayer(L, p, true);
  }
}
function bizOffseason(L) {
  const g = R.rand(0.02, 0.055);
  L.cap = Math.round(L.cap * (1 + g) * 10) / 10;
  L.capHist.push({ year: L.year, cap: L.cap });
  news(L, `The salary cap rises ${(g * 100).toFixed(1)}% to ${fmtM(L.cap)} for ${seasonLabel(L.year)}.`, -1);
  for (const t of L.teams) if (t.dead) t.dead = t.dead.filter(d => d.y >= L.year);
}

// ---------- Re-signing ----------
function expiring(L, team) { return rosterPlayers(L, team).filter(p => p.contract && p.contract.exp < L.year); }
function startResign(L) {
  // AI re-signs keepers and lets others walk at the end of the phase
  for (const t of L.teams) {
    if (t.id === L.userTeam) continue;
    for (const p of expiring(L, t)) {
      const keep = playerValue(p) >= 66 || (p.age <= 24 && p.pot >= 72) || R.chance(0.3);
      if (keep && R.chance(0.82)) { const a = askingContract(L, p); p.contract = { sal: a.sal, exp: L.year + a.yrs - 1 }; }
    }
  }
}
function resignOdds(L, p, sal, yrs) {
  const ask = askingContract(L, p);
  const ratio = sal / ask.sal;
  const team = L.teams[p.tid];
  const mor = typeof p.morale === 'number' ? (p.morale - 60) / 100 : 0;
  const win = team.history.length ? (team.history[team.history.length - 1].pts - 90) / 200 : 0;
  const yrFit = 1 - Math.abs(yrs - ask.yrs) * 0.04;
  return clamp((0.35 + (ratio - 1) * 3.2 + mor + win) * yrFit + (p.age >= 33 ? 0.15 : 0), 0.02, 0.98);
}
function offerResign(L, p, sal, yrs) {
  if (p.refused === L.year) return `${fullName(p)} isn't returning your calls this offseason.`;
  const odds = resignOdds(L, p, sal, yrs);
  if (R.chance(odds)) { p.contract = { sal: Math.round(sal * 100) / 100, exp: L.year + yrs - 1 }; news(L, `${L.teams[p.tid].abbr} re-signed ${p.pos} ${fullName(p)}: ${fmtM(sal)} x ${yrs}.`, p.tid); return null; }
  if (R.chance(0.35)) { p.refused = L.year; return `${fullName(p)} rejected the offer and will test free agency.`; }
  return `${fullName(p)} rejected the offer. Try again with more money.`;
}
// End of the re-sign phase: unsigned players become free agents.
function startFreeAgency(L) {
  for (const t of L.teams) for (const p of expiring(L, t)) { t.roster = t.roster.filter(id => id !== p.id); p.tid = -1; p.farm = false; p.ir = false; p.contract = null; L.fa.push(p.id); p.lastTeam = t.id; }
  L.phase = 'fa'; L.faDay = 1;
  L.fa.sort((a, b) => playerValue(L.players[b]) - playerValue(L.players[a]));
  news(L, `Free agency is open: ${L.fa.length} players available. AI teams make their moves each FA day.`, L.userTeam);
}
function faOdds(L, p, sal, yrs) {
  const ask = askingContract(L, p); const ratio = sal / ask.sal;
  const t = L.teams[L.userTeam];
  const win = t.history.length ? (t.history[t.history.length - 1].pts - 90) / 220 : 0;
  const fans = L.ops ? (L.ops.fans - 55) / 400 : 0;
  const late = (L.faDay - 1) * 0.08;
  return clamp(0.3 + (ratio - 1) * 3 + win + fans + late - Math.abs(yrs - ask.yrs) * 0.04, 0.02, 0.97);
}
function offerFA(L, p, sal, yrs) {
  const t = L.teams[L.userTeam];
  if (sal > capSpace(L, t) && L.phase !== 'fa' && L.phase !== 'resign') return `Not enough cap space (${fmtM(capSpace(L, t))}).`;
  if (sal > capSpace(L, t) + 0.001) return `Not enough cap space (${fmtM(capSpace(L, t))}).`;
  if (p.faTried === `${L.year}-${L.faDay || L.day}`) return `${fullName(p)} is weighing other offers. Try again on the next day.`;
  if (sal < minSalary(L)) return `The league minimum is ${fmtM(minSalary(L))}.`;
  const odds = L.phase === 'regular' || L.phase === 'preseason' ? Math.min(0.98, faOdds(L, p, sal, yrs) + 0.25) : faOdds(L, p, sal, yrs);
  p.faTried = `${L.year}-${L.faDay || L.day}`;
  if (R.chance(odds)) { signPlayer(L, t, p, false, { sal: Math.round(sal * 100) / 100, exp: L.year + yrs - 1 }); return null; }
  return `${fullName(p)} turned down your offer (${Math.round(odds * 100)}% odds).`;
}
// AI teams sign free agents for their biggest needs.
function aiFreeAgencyDay(L) {
  const order = R.shuffle(L.teams.filter(t => t.id !== L.userTeam));
  for (const t of order) {
    let guard = 0;
    while (guard++ < 3) {
      const space = capSpace(L, t);
      const need = teamNeedsSimple(L, t);
      const best = L.fa.map(id => L.players[id]).filter(p => p && askingContract(L, p).sal <= space - 1 && (need[p.pos] > 0.5 || p.ovr >= 76)).sort((a, b) => playerValue(b) + need[b.pos] * 2 - playerValue(a) - need[a.pos] * 2)[0];
      if (!best || (playerValue(best) < 60 && nhlRoster(L, t).length >= ROSTER_LIMIT)) break;
      if (R.chance(0.45)) break;
      signPlayer(L, t, best, false);
      if (nhlRoster(L, t).length > ROSTER_LIMIT + 2) break;
    }
  }
}
function advanceFADay(L) {
  aiFreeAgencyDay(L);
  L.faDay++;
  if (L.faDay > 5) endFreeAgency(L);
}
function endFreeAgency(L) {
  for (const t of L.teams) if (t.id !== L.userTeam) { aiManageRoster(L, t); aiCapComply(L, t); }
  L.fa.sort((a, b) => playerValue(L.players[b]) - playerValue(L.players[a]));
  const keep = L.fa.slice(0, 160), drop = L.fa.slice(160);
  drop.forEach(id => { const p = L.players[id]; if (p) { if (p.age >= 27) retireRecord(L, p, L.year - 1); delete L.players[id]; } });
  L.fa = keep;
  L.phase = 'preseason';
  for (const t of L.teams) t.lines = t.id === L.userTeam && !L.autoLines ? t.lines : null;
  news(L, 'Free agency is winding down. Set your lines and start the season when ready.', L.userTeam);
}

// ---------- Draft picks ----------
function getPickOwner(L, year, rd, orig) { const k = `${year}_${rd}_${orig}`; return (L.pickOwn && L.pickOwn[year] && L.pickOwn[year][k] !== undefined) ? L.pickOwn[year][k] : orig; }
function setPickOwner(L, year, rd, orig, tid) { L.pickOwn = L.pickOwn || {}; L.pickOwn[year] = L.pickOwn[year] || {}; L.pickOwn[year][`${year}_${rd}_${orig}`] = tid; }
function teamPicks(L, tid) {
  const out = [];
  const years = L.phase === 'draft' ? [L.year + 1, L.year + 2] : [L.year + 1, L.year + 2];
  for (const y of years) for (let rd = 1; rd <= 3; rd++) for (const t of L.teams) if (getPickOwner(L, y, rd, t.id) === tid) out.push({ year: y, rd, orig: t.id, key: `pk_${y}_${rd}_${t.id}` });
  return out;
}
function projectedSlot(L, orig) {
  const sorted = L.teams.slice().sort((a, b) => cmpTeams(b, a)); // worst first
  return L.phase === 'regular' || L.phase === 'playoffs' ? sorted.findIndex(t => t.id === orig) + 1 : 16;
}
function pickValue(L, pk) {
  const slot = pk.year === L.year + 1 ? projectedSlot(L, pk.orig) : 16;
  const base = pk.rd === 1 ? 74 - slot * 0.45 : pk.rd === 2 ? 58 : 50;
  return (pk.year > L.year + 1 ? base - 2 : base);
}

// ---------- Trades ----------
function tradeValue(L, p, forTid) {
  let v = playerValue(p);
  const sal = p.contract ? p.contract.sal : 0, worth = marketValue(L, p);
  const yrs = p.contract ? Math.max(1, p.contract.exp - L.year + 1) : 1;
  v += clamp((worth - sal) * 1.2, -8, 8) * Math.min(3, yrs) / 2;
  if (p.pos === 'G' && p.ovr >= 78) v += 2;
  if (forTid !== undefined) { const need = teamNeedsSimple(L, L.teams[forTid]); v += need[p.pos] * 0.8; }
  // exponential: stars are worth far more than several decent players
  return Math.pow(Math.max(1, v - 45), 1.9);
}
function assetValue(L, a, forTid) { if (a.type === 'pick') return Math.pow(Math.max(1, pickValue(L, a) - 45), 1.9); const p = L.players[a.pid]; return p ? tradeValue(L, p, forTid) : 0; }
function evaluateTrade(L, partner, give, get) {
  // give: assets the user sends; get: assets the user receives
  const valIn = sum(give, a => assetValue(L, a, partner)), valOut = sum(get, a => assetValue(L, a, partner) * 1.08);
  const t = L.teams[partner], u = L.teams[L.userTeam];
  const salIn = sum(give.filter(a => a.type === 'player'), a => L.players[a.pid].farm ? 0 : L.players[a.pid].contract.sal);
  const salOut = sum(get.filter(a => a.type === 'player'), a => L.players[a.pid].farm ? 0 : L.players[a.pid].contract.sal);
  let reason = null;
  if (payroll(L, t) + salIn - salOut > L.cap + 0.01 && salIn > salOut) reason = `The ${t.name} can't fit the extra salary under the cap.`;
  if (payroll(L, u) - salIn + salOut > L.cap + 0.01 && salOut > salIn && L.phase !== 'resign' && L.phase !== 'draft') reason = 'That would put you over the salary cap.';
  if (L.phase === 'regular' && L.day > L.deadlineDay) reason = 'The trade deadline has passed.';
  if (L.phase === 'playoffs') reason = 'No trades during the playoffs.';
  const ratio = valOut ? valIn / valOut : (valIn ? 9 : 0);
  return { ok: !reason && ratio >= 1 && get.length > 0, ratio, reason, valIn, valOut };
}
function executeTrade(L, a, b, aGives, bGives) {
  const move = (asset, from, to) => {
    if (asset.type === 'pick') { setPickOwner(L, asset.year, asset.rd, asset.orig, to); return; }
    const p = L.players[asset.pid]; const tf = L.teams[from], tt = L.teams[to];
    tf.roster = tf.roster.filter(id => id !== p.id); tt.roster.push(p.id); p.tid = to; p.ir = !!(p.injury && p.injury.games >= 7); p.farm = p.farm && farmRoster(L, tt).length < FARM_LIMIT;
  };
  aGives.forEach(x => move(x, a, b)); bGives.forEach(x => move(x, b, a));
  const desc = (arr) => arr.map(x => x.type === 'pick' ? `${x.year} R${x.rd} pick (${L.teams[x.orig].abbr})` : `${L.players[x.pid].pos} ${fullName(L.players[x.pid])}`).join(', ') || 'nothing';
  const txt = `TRADE: ${L.teams[a].abbr} send ${desc(aGives)} to ${L.teams[b].abbr} for ${desc(bGives)}.`;
  news(L, txt, a === L.userTeam || b === L.userTeam ? L.userTeam : a);
  L.trades.unshift({ y: L.year, d: L.day, text: txt }); if (L.trades.length > 60) L.trades.length = 60;
  if (typeof moraleTrade === 'function') moraleTrade(L, a, b, aGives.filter(x => x.type === 'player').map(x => L.players[x.pid]), bGives.filter(x => x.type === 'player').map(x => L.players[x.pid]));
  for (const t of [L.teams[a], L.teams[b]]) { if (t.id !== L.userTeam || L.autoRoster) aiManageRoster(L, t); t.lines = t.id === L.userTeam && !L.autoLines ? t.lines : null; }
}
// What would the AI want for one of the user's players? Used for counter-offers and AI-initiated offers.
function aiBuildOffer(L, partner, wantPid) {
  const want = L.players[wantPid]; const target = tradeValue(L, want, partner) * 1.05;
  const t = L.teams[partner];
  const assets = [...rosterPlayers(L, t).filter(p => p.ovr < want.ovr + 3).map(p => ({ type: 'player', pid: p.id })), ...teamPicks(L, partner).map(pk => ({ type: 'pick', ...pk }))];
  assets.sort((a, b) => assetValue(L, b, L.userTeam) - assetValue(L, a, L.userTeam));
  const pick = []; let v = 0;
  for (const a of assets) { if (v >= target) break; const av = assetValue(L, a, L.userTeam); if (v + av > target * 1.35 && v > 0) continue; pick.push(a); v += av; if (pick.length >= 3) break; }
  return v >= target * 0.92 ? pick : null;
}
function maybeTradeOffer(L) {
  if (L.offers.length >= 2 || !R.chance(0.22)) return;
  const u = L.teams[L.userTeam];
  const mine = nhlRoster(L, u).filter(p => p.ovr >= 68 && !p.injury);
  if (!mine.length) return;
  const want = R.weighted(mine, p => Math.pow(p.ovr - 60, 2));
  const partner = R.pick(L.teams.filter(t => t.id !== L.userTeam)).id;
  const offer = aiBuildOffer(L, partner, want.id);
  if (!offer) return;
  L.offers.push({ id: 'o' + Date.now() + R.int(0, 999), partner, want: [{ type: 'player', pid: want.id }], give: offer, y: L.year, d: L.day });
  news(L, `TRADE OFFER: The ${L.teams[partner].name} want ${fullName(want)}. Check the Trades tab.`, L.userTeam);
}
function acceptOffer(L, id) {
  const o = L.offers.find(x => x.id === id); if (!o) return 'Offer expired.';
  L.offers = L.offers.filter(x => x.id !== id);
  const valid = o.want.every(a => L.players[a.pid] && L.players[a.pid].tid === L.userTeam) && o.give.every(a => a.type === 'pick' ? getPickOwner(L, a.year, a.rd, a.orig) === o.partner : L.players[a.pid] && L.players[a.pid].tid === o.partner);
  if (!valid) return 'The offer is no longer valid.';
  const ev = evaluateTrade(L, o.partner, o.want, o.give);
  if (ev.reason) return ev.reason;
  executeTrade(L, L.userTeam, o.partner, o.want, o.give);
  return null;
}
// Occasional AI-to-AI trades keep the league moving.
function aiTrades(L) {
  if (!R.chance(0.2)) return;
  const [a, b] = R.shuffle(L.teams.filter(t => t.id !== L.userTeam)).slice(0, 2);
  const pa = R.pick(nhlRoster(L, a).filter(p => p.ovr >= 66)); if (!pa) return;
  const pb = nhlRoster(L, b).filter(p => p.pos === pa.pos || R.chance(0.3)).sort((x, y) => Math.abs(tradeValue(L, x) - tradeValue(L, pa)) - Math.abs(tradeValue(L, y) - tradeValue(L, pa)))[0];
  if (!pb || Math.abs(tradeValue(L, pb) - tradeValue(L, pa)) > tradeValue(L, pa) * 0.15) return;
  if (payroll(L, a) - pa.contract.sal + pb.contract.sal > L.cap || payroll(L, b) - pb.contract.sal + pa.contract.sal > L.cap) return;
  executeTrade(L, a.id, b.id, [{ type: 'player', pid: pa.id }], [{ type: 'player', pid: pb.id }]);
}
