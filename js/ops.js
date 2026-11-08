'use strict';
// ================= Operations (BETA) =================
// Fan happiness, arena upkeep and upgrades, pricing, jersey stock and random events for the user's team.
// Money here is the operations budget in $M (game-day and merchandise business), separate from the salary cap.

const FACILITIES = [
  // key, name, blurb, upgrade cost multiplier, wear per home game
  ['seats', 'SEATING', 'Comfort and capacity. Each level adds 700 seats.', 1.6, 0.46],
  ['bath', 'RESTROOMS', 'Lines, cleanliness and plumbing. Fans notice.', 0.7, 0.54],
  ['parking', 'PARKING GARAGE', 'Traffic, access and parking revenue.', 0.8, 0.38],
  ['food', 'CONCESSIONS', 'Menu, speed and food quality. Drives food sales.', 0.9, 0.44],
  ['store', 'PRO SHOP', 'Jersey production and merchandise sales.', 0.6, 0.21],
  ['board', 'JUMBOTRON & SOUND', 'Game-night atmosphere, goal horn and crowd noise.', 1.2, 0.27],
  ['ice', 'ICE PLANT & ZAMBONIS', 'Ice quality. Bad ice means bouncing pucks and sloppy hockey for both teams.', 1.1, 0.4],
  ['locker', 'LOCKER ROOM', 'Lockers, training room and recovery. Wears every week; players notice it, not fans.', 1.0, 0.6],
];
// Facilities fans see on game day (the locker room is for the players).
const FAN_FACS = ['seats', 'bath', 'parking', 'food', 'store', 'board', 'ice'];
const FAC_GRIPES = { seats: 'Broken seats all over the stands', bath: 'The restrooms are a disgrace', parking: 'The parking garage is a mess', food: 'Concession lines are endless and the food is bad', store: 'The pro shop is a mess', board: 'The jumbotron keeps cutting out', ice: 'The ice is terrible - pucks bouncing everywhere' };
const FAC = Object.fromEntries(FACILITIES.map(f => [f[0], { key: f[0], name: f[1], blurb: f[2], mult: f[3], wear: f[4] }]));
const UPG_COST = [0, 4, 8, 14, 22];                  // $M to go from level n to n+1, times the facility multiplier
const MAINT_LEVELS = ['NONE', 'BASIC', 'STANDARD', 'PREMIUM'];
const MAINT_COST = [0, 0.02, 0.05, 0.09];            // $M per facility per week
const MAINT_EFF = [0, 0.55, 1.05, 1.35];             // share of wear that gets fixed: standard holds steady, premium slowly improves
const BASE_CAPACITY = 17200;
const HOME_GAMES = 41;
const JERSEY_COST = 38;                               // $ per jersey to produce
const POS_POP = { C: 7, LW: 6, RW: 6, D: 3, G: 5 };
const OPS_START_CASH = 25;

function initOps(L) {
  const stadium = {};
  for (const f of FACILITIES) stadium[f[0]] = { lvl: R.int(1, 2), cond: R.int(62, 82), maint: 2 };
  L.ops = {
    cash: OPS_START_CASH, fans: R.int(52, 64), stadium,
    prices: { season: 3200, ticket: 95, food: 13, jersey: 170 },
    jersey: { auto: true, alloc: {}, stock: {}, sold: {} },
    sth: Math.round((BASE_CAPACITY + (stadium.seats.lvl - 1) * 700) * 0.55), season: opsEmptySeason(), /* first season: tickets already sold */ hist: [], fanLog: [], event: null, eventLog: [], seen: {}, lastHome: null, newEvent: 0,
  };
}
function opsEmptySeason() { return { rev: { season: 0, tickets: 0, food: 0, parking: 0, merch: 0, other: 0 }, exp: { maint: 0, upgrades: 0, gameday: 0, goods: 0, events: 0 }, att: 0, games: 0 }; }
function migrateOps(L) {
  if (!L.ops) { initOps(L); L.ops.sth = Math.round(opsCapacity(L) * 0.55); }
  const O = L.ops;
  O.jersey = O.jersey || { auto: true, alloc: {}, stock: {}, sold: {} };
  O.season = O.season || opsEmptySeason();
  O.hist = O.hist || []; O.fanLog = O.fanLog || []; O.eventLog = O.eventLog || []; O.seen = O.seen || {};
  if (!O.stadium.ice) O.stadium.ice = { lvl: 2, cond: 70, maint: 2 };
  if (!O.stadium.locker) O.stadium.locker = { lvl: R.int(1, 2), cond: R.int(60, 78), maint: 2 };
}

// ---------- Derived numbers ----------
function opsCapacity(L) { return BASE_CAPACITY + (L.ops.stadium.seats.lvl - 1) * 700; }
function userWinPct(L) { const r = L.teams[L.userTeam].rec; return r.gp ? recPct(r) : 0.5; }
function fairPrices(L) {
  const O = L.ops;
  const m = clamp(0.75 + O.fans / 200 + (userWinPct(L) - 0.5) * 0.4, 0.6, 1.4);
  const ticket = Math.round(95 * m);
  return { ticket, season: Math.round(ticket * HOME_GAMES * 0.82 / 10) * 10, food: 13, jersey: Math.round(160 * (0.85 + O.fans / 400)) };
}
function priceIdx(L, k) { return L.ops.prices[k] / fairPrices(L)[k]; }
function priceLabel(idx) { return idx < 0.85 ? ['BARGAIN', 'good'] : idx <= 1.08 ? ['FAIR', 'dim'] : idx <= 1.25 ? ['PRICEY', 'gold'] : ['GOUGING', 'bad']; }
function avgCond(L) { const s = L.ops.stadium; return FAN_FACS.reduce((a, k) => a + s[k].cond, 0) / FAN_FACS.length; }
function avgLvl(L) { const s = L.ops.stadium; return FAN_FACS.reduce((a, k) => a + s[k].lvl, 0) / FAN_FACS.length; }
function fanMood(v) { return v >= 80 ? ['ELECTRIC', 'good'] : v >= 65 ? ['HAPPY', 'good'] : v >= 45 ? ['CONTENT', 'dim'] : v >= 30 ? ['RESTLESS', 'gold'] : ['ANGRY', 'bad']; }
// Ice quality for home games (1 = good league ice).
function iceFactor(L) { if (!L.ops || !L.ops.stadium.ice) return 1; const x = L.ops.stadium.ice; return clamp(0.72 + x.cond / 260 + (x.lvl - 1) * 0.03, 0.6, 1.08); }
// Home crowd strength, used by the game sim (1 = normal home-field advantage).
function crowdFactor(L) { if (!L.ops) return 1; const s = L.ops.stadium; return clamp(0.65 + L.ops.fans / 100 * 0.55 + (s.board.lvl - 1) * 0.05 + (Math.min(s.board.cond, s.seats.cond) - 60) / 400, 0.6, 1.4); }
function maintPerWeek(L) { const s = L.ops.stadium; return FACILITIES.reduce((a, f) => a + MAINT_COST[s[f[0]].maint], 0); }
function upgradeCost(L, key) { const f = L.ops.stadium[key]; return f.lvl >= 5 ? null : Math.round(UPG_COST[f.lvl] * FAC[key].mult * 10) / 10; }

function fanChange(L, d, why) {
  const O = L.ops; if (!d) return;
  O.fans = clamp(O.fans + d, 0, 100);
  O.fanLog.unshift({ y: L.year, w: L.phase === 'regular' ? L.day : 0, d: Math.round(d * 10) / 10, why });
  if (O.fanLog.length > 40) O.fanLog.length = 40;
}
function opsSpend(L, amt, cat) { L.ops.cash -= amt; L.ops.season.exp[cat] = (L.ops.season.exp[cat] || 0) + amt; }
function opsEarn(L, amt, cat) { L.ops.cash += amt; L.ops.season.rev[cat] = (L.ops.season.rev[cat] || 0) + amt; }

// ---------- Attendance and game-day revenue ----------
function projectedSTH(L) {
  const idx = priceIdx(L, 'season');
  return Math.round(opsCapacity(L) * clamp(0.3 + L.ops.fans * 0.0045 - (idx - 1) * 0.8, 0.12, 0.78));
}
function projectedGate(L, playoff) {
  const O = L.ops, cap = opsCapacity(L), s = O.stadium;
  const idx = priceIdx(L, 'ticket');
  const D = clamp(0.55 + O.fans * 0.006 + (userWinPct(L) - 0.5) * 0.3 - (idx - 1) * 0.9 + (s.seats.cond - 70) / 400 + (s.parking.cond - 70) / 600 + (playoff ? 0.35 : 0), 0.2, 1.3);
  const sth = Math.min(O.sth, cap);
  const singles = Math.round(clamp(D * cap - sth, 0, cap - sth));
  const att = Math.min(cap, Math.round(sth * (playoff ? 1 : 0.94) + singles));
  return { cap, att, singles, sth, D };
}
function opsHomeGame(L, g, playoff) {
  const O = L.ops, s = O.stadium, P = O.prices, fp = fairPrices(L);
  const gate = projectedGate(L, playoff);
  const tick = gate.singles * P.ticket * (playoff ? 1.5 : 1) / 1e6;
  const fIdx = P.food / fp.food;
  const items = clamp(2.2 * (1 - (fIdx - 1) * 0.9) * (0.7 + s.food.cond / 333) * (1 + (s.food.lvl - 1) * 0.08), 0.3, 3.2);
  const food = gate.att * items * P.food / 1e6;
  const park = gate.att / 3.2 * 25 * (1 + (s.parking.lvl - 1) * 0.1) * (0.6 + s.parking.cond / 250) / 1e6;
  opsEarn(L, tick, 'tickets'); opsEarn(L, food, 'food'); opsEarn(L, park, 'parking');
  opsSpend(L, food * 0.3, 'goods'); opsSpend(L, 0.25 + gate.att / 18000 * 0.1, 'gameday');
  O.season.att += gate.att; O.season.games++;
  O.lastHome = { y: L.year, w: L.day, att: gate.att, cap: gate.cap, tick, food, park, playoff: !!playoff, opp: g.home === L.userTeam ? g.away : g.home };
  // wear and tear from a full house
  for (const k of FAN_FACS) s[k].cond = clamp(s[k].cond - FAC[k].wear * (0.6 + gate.att / gate.cap * 0.5), 0, 100);
  O.homeWeek = true; O.homeGames = (O.homeGames || 0) + 1;
  // fans react to the experience
  const priceHit = (P.ticket / fp.ticket - 1) * 0.6 + (fIdx - 1) * 0.4;
  if (Math.abs(priceHit) > 0.05) fanChange(L, clamp(-priceHit * 1.1, -0.8, 0.3), priceHit > 0 ? 'Prices are too high at the arena' : 'Fans love the affordable game night');
  const st = clamp(((avgCond(L) - 65) / 22 + (avgLvl(L) - 1.5) * 0.25) * 0.22, -0.6, 0.35);
  if (Math.abs(st) > 0.06) fanChange(L, st, st > 0 ? 'The arena experience is great' : 'The arena is falling apart');
  // individual facilities that have gone downhill draw their own complaints, and can fail outright
  for (const k of FAN_FACS) {
    const c = s[k].cond;
    if (c < 45) fanChange(L, -clamp((45 - c) / 50, 0.1, 0.7), FAC_GRIPES[k]);
    if (c < 25 && R.chance(0.07)) facilityFailure(L, k);
  }
}
const FAIL_TEXT = { seats: 'A section of upper-bowl seats was roped off mid-game after bolts sheared', bath: 'Half the restrooms backed up during the game', parking: 'A level of the parking garage was closed before puck drop', food: 'Concession stands lost power and closed by the second intermission', store: 'The pro shop was closed after a roof leak', board: 'The jumbotron died in the first period', ice: 'The ice plant failed - the game was delayed 50 minutes on slushy ice' };
function facilityFailure(L, k) {
  const cost = Math.round(R.rand(0.4, 1.4) * FAC[k].mult * 10) / 10;
  opsSpend(L, cost, 'events');
  L.ops.stadium[k].cond = clamp(L.ops.stadium[k].cond + 12, 0, 100);
  fanChange(L, -3.5, `${FAC[k].name.charAt(0) + FAC[k].name.slice(1).toLowerCase()} failed on game day`);
  news(L, `${FAIL_TEXT[k]}. Emergency repairs cost ${fmtM(cost)}.`, L.userTeam);
}
// Locker room: players live in it every week. A run-down one drags morale; a great one lifts it and speeds recovery.
function lockerEffect(L) { const x = L.ops.stadium.locker; return x.cond < 50 ? -(50 - x.cond) / 18 : x.cond >= 75 ? 0.12 * x.lvl : 0; }
function lockerWeek(L) {
  const x = L.ops.stadium.locker, d = lockerEffect(L), team = L.teams[L.userTeam];
  if (typeof bumpTeamMorale === 'function' && d) {
    const why = L.day % 28 < 7 ? (d < -0.4 ? 'The locker room is falling apart' : d > 0.3 ? 'Loves the team facilities' : null) : null;
    bumpTeamMorale(L, L.userTeam, d, why);
  }
  if (x.cond < 30 && L.day % 28 < 7) news(L, `Players are grumbling about the state of the locker room (condition ${Math.round(x.cond)}).`, L.userTeam);
  // a modern training room gets players back sooner
  if (x.lvl >= 3 && x.cond >= 60) for (const id of team.roster) {
    const p = L.players[id];
    if (p.injury && !p.injury.susp && !p.injury.ill && p.injury.games > 1 && R.chance(0.15 * (x.lvl - 2))) p.injury.games--;
  }
}
// Called from playGame for every game.
function opsAfterGame(L, g, playoff) {
  if (!L.ops) return;
  const u = L.userTeam; if (g.home !== u && g.away !== u) return;
  if (g.home === u && !g.neutral) opsHomeGame(L, g, playoff);
  const us = g.home === u ? g.hs : g.as, them = g.home === u ? g.as : g.hs;
  const opp = L.teams[g.home === u ? g.away : g.home].abbr;
  // swings taper at the extremes: happy fans have less room to climb, miserable ones stop caring as much
  const f = L.ops.fans;
  const ot = g.ot || g.so;
  if (us > them) fanChange(L, ((playoff ? 1.6 : 0.5) + (g.home === u ? 0.12 : 0) + (us - them >= 4 ? 0.15 : 0)) * clamp(1.3 - f / 100, 0.4, 1.2), `${playoff ? 'Playoff win' : 'Win'} vs ${opp}`);
  else if (us < them) fanChange(L, -((playoff ? 1.2 : ot ? 0.2 : 0.5) + (them - us >= 4 ? 0.2 : 0)) * clamp(0.3 + f / 100, 0.4, 1.2), `${playoff ? 'Playoff loss' : ot ? 'OT loss' : 'Loss'} vs ${opp}`);
}

// ---------- Weekly upkeep, merchandise, fan drift, events ----------
function opsWeek(L) {
  if (!L.ops) return;
  const O = L.ops, s = O.stadium;
  opsSpend(L, maintPerWeek(L), 'maint');
  for (const f of FACILITIES) {
    const x = s[f[0]];
    const hg = O.homeGames || 0;
    const wear = f[0] === 'locker' ? 1.3 : f[4] * (hg ? 0.4 : 1.2);
    const fix = f[0] === 'locker' ? 1.3 * MAINT_EFF[x.maint] : f[4] * MAINT_EFF[x.maint] * Math.max(1.2, hg * 1.05);
    x.cond = clamp(x.cond - wear + fix, 0, 100);
  }
  O.homeWeek = false; O.homeGames = 0;
  if (['regular', 'playoffs'].includes(L.phase)) lockerWeek(L);
  merchWeek(L);
  fanChange(L, (55 - O.fans) * 0.025, null); // drift toward neutral (not logged)
  O.fanLog = O.fanLog.filter(e => e.why);
  maybeOpsEvent(L, L.phase === 'playoffs' ? 0.06 : 0.13);
}

// ---------- Jerseys ----------
function playerPopularity(L, p) {
  const s = p.stats || {};
  const fp = (s.g || 0) * 4 + (s.a || 0) * 2 + (s.hit || 0) * 0.1 + (s.w || 0) * 2.5 + (s.so || 0) * 5;
  const v = (p.ovr - 55) * 1.2 + (POS_POP[p.pos] || 0) + (p.awards || []).length * 4 + fp / 20 + (p.gen ? 10 : 0) + (p.exp <= 1 ? 5 : 0) + (p.popAdj || 0);
  return Math.max(1, Math.round(v));
}
function jerseyTop(L, n) {
  return L.teams[L.userTeam].roster.map(id => L.players[id]).filter(p => p && !p.farm).map(p => ({ p, pop: playerPopularity(L, p) })).sort((a, b) => b.pop - a.pop).slice(0, n || 12);
}
function jerseyCapacity(L) { return Math.round(2200 * (1 + (L.ops.stadium.store.lvl - 1) * 0.25)); }
function jerseyDemand(L) {
  const O = L.ops, idx = priceIdx(L, 'jersey');
  const total = 2600 * (0.5 + O.fans / 100) * clamp(1 - (idx - 1) * 1.2, 0.15, 1.6) * (1 + (O.stadium.store.lvl - 1) * 0.1) * (0.75 + O.stadium.store.cond / 400);
  const top = jerseyTop(L, 12);
  const w = top.map(x => Math.pow(x.pop, 1.5)); const sw = w.reduce((a, b) => a + b, 0) || 1;
  return top.map((x, i) => ({ p: x.p, pop: x.pop, demand: Math.round(total * w[i] / sw) }));
}
// Weekly production. AUTO restocks each player to ~1.2 weeks of expected demand (no overstock), squeezed
// proportionally if the store can't make that many. MANUAL splits the whole capacity by your weights (0-5),
// so you can push stock toward players you expect to break out.
function jerseyPlan(L) {
  const J = L.ops.jersey, dem = jerseyDemand(L), cap = jerseyCapacity(L);
  if (J.auto) {
    const want = dem.map(d => Math.max(0, Math.round(d.demand * 1.2 - (J.stock[d.p.id] || 0))));
    const sw = want.reduce((a, b) => a + b, 0), k = sw > cap ? cap / sw : 1;
    return dem.map((d, i) => ({ ...d, make: Math.round(want[i] * k), weight: null }));
  }
  const w = dem.map(d => J.alloc[d.p.id] ?? 1);
  const sw = w.reduce((a, b) => a + b, 0) || 1;
  return dem.map((d, i) => ({ ...d, make: Math.round(cap * w[i] / sw), weight: w[i] }));
}
function merchWeek(L) {
  const O = L.ops, J = O.jersey, price = O.prices.jersey;
  if (!['regular', 'playoffs'].includes(L.phase)) return;
  let rev = 0, made = 0;
  for (const r of jerseyPlan(L)) {
    const id = r.p.id;
    J.stock[id] = (J.stock[id] || 0) + r.make; made += r.make;
    const sold = Math.min(J.stock[id], Math.round(r.demand * R.rand(0.85, 1.15)));
    J.stock[id] -= sold; J.sold[id] = (J.sold[id] || 0) + sold;
    rev += sold * price;
  }
  opsEarn(L, rev / 1e6, 'merch'); opsSpend(L, made * JERSEY_COST / 1e6, 'goods');
  clearanceJerseys(L);
}
// Stock for players no longer on the team goes to the clearance rack at a loss.
function clearanceJerseys(L) {
  const J = L.ops.jersey, u = L.userTeam;
  for (const id in J.stock) {
    const p = L.players[id];
    if (p && p.tid === u) continue;
    const n = J.stock[id]; delete J.stock[id];
    if (n > 0) { opsEarn(L, n * L.ops.prices.jersey * 0.25 / 1e6, 'merch'); if (n >= 200) news(L, `${n.toLocaleString()} unsold ${p ? fullName(p) : 'former player'} jerseys went to the clearance rack.`, u); }
  }
}

// ---------- Season start / end ----------
function opsSeasonStart(L) {
  if (!L.ops) return;
  const O = L.ops;
  O.sth = projectedSTH(L);
  O.season = opsEmptySeason();
  O.jersey.sold = {};
  opsEarn(L, O.sth * O.prices.season / 1e6, 'season');
  news(L, `${O.sth.toLocaleString()} season tickets sold at $${O.prices.season} (${fmtM(O.sth * O.prices.season / 1e6)}).`, L.userTeam);
  const idx = priceIdx(L, 'season');
  if (idx > 1.15) fanChange(L, -clamp((idx - 1) * 8, 1, 5), 'Season ticket prices went up too much');
  else if (idx < 0.9) fanChange(L, 2, 'Season ticket holders love the price');
  maybeOpsEvent(L, 0.35);
}
function opsSeasonEnd(L) {
  if (!L.ops) return;
  const O = L.ops, u = L.userTeam;
  const res = playoffResult(L, u);
  if (res === 'WON THE MUG') fanChange(L, 14, "Stanley's Mug champions!");
  else if (res === 'Lost Mug Final') fanChange(L, 5, 'Run to the final');
  else if (res !== 'Missed Playoffs') fanChange(L, 3, 'Made the playoffs');
  else fanChange(L, -5, 'Missed the playoffs');
  O.hist.push({ year: L.year, fans: Math.round(O.fans), cash: Math.round(O.cash * 10) / 10, sth: O.sth, att: O.season.games ? Math.round(O.season.att / O.season.games) : 0, rev: { ...O.season.rev }, exp: { ...O.season.exp } });
  if (O.hist.length > 30) O.hist.shift();
  // offseason weather and wear
  for (const f of FACILITIES) { const x = O.stadium[f[0]]; x.cond = clamp(x.cond - 6 + MAINT_EFF[x.maint] * 5, 0, 100); }
  opsSpend(L, maintPerWeek(L) * 16, 'maint'); // offseason upkeep
  for (const p of Object.values(L.players)) if (p.popAdj) p.popAdj = Math.round(p.popAdj * 0.5);
}

// ---------- Actions ----------
function opsUpgrade(L, key) {
  const c = upgradeCost(L, key); if (c === null) return 'Already at the top level.';
  if (L.ops.cash < c) return `Not enough cash (${fmtM(c)} needed).`;
  opsSpend(L, c, 'upgrades');
  const f = L.ops.stadium[key]; f.lvl++; f.cond = 100;
  if (L.phase === 'regular') fanChange(L, -0.5, `Construction at the ${FAC[key].name.toLowerCase()}`);
  fanChange(L, 1 + f.lvl * 0.3, `New ${FAC[key].name.toLowerCase()} (level ${f.lvl})`);
  news(L, `Arena upgrade: ${FAC[key].name.toLowerCase()} renovated to level ${f.lvl} for ${fmtM(c)}.`, L.userTeam);
  return null;
}
function opsSetPrice(L, k, v) {
  const lim = { season: [800, 12000], ticket: [25, 400], food: [4, 30], jersey: [60, 400] }[k];
  if (!lim || !isFinite(v)) return;
  L.ops.prices[k] = Math.round(clamp(v, lim[0], lim[1]));
}

// ---------- Random events ----------
// Each event: when it can happen (w), who it involves (setup), and 3 required responses.
// Choice effects: cash ($M, negative = cost), fans, cond {facility: delta}, pop (player popularity),
// susp (games suspended), release, risk [chance, {effects}, text].
const lowCond = (k, base) => (L) => base * (L.ops.stadium[k].cond < 45 ? 3 : L.ops.stadium[k].cond < 65 ? 1.6 : 0.5);
const OPS_EVENTS = [
  { id: 'sewage', kind: 'org', w: lowCond('bath', 1), title: 'Sewage pipe bursts',
    text: () => 'A sewage line has burst under the main concourse. Two restroom blocks are flooded and the smell is drifting into the lower bowl. Game night is coming.',
    choices: [
      { label: 'Emergency repair, close the section', fx: { cash: -2, fans: -1, cond: { bath: 30 } } },
      { label: 'Patch it for now', fx: { cash: -0.5, fans: -2, cond: { bath: -10 } }, risk: [0.35, { fans: -6, cond: { bath: -15 } }, 'The patch failed during the next game. Fans were not amused.'] },
      { label: 'Ignore it until the offseason', fx: { fans: -8, cond: { bath: -30 } } },
    ] },
  { id: 'railing', kind: 'org', w: lowCond('seats', 0.8), title: 'Glass panel shatters onto fans',
    text: () => 'A pane of glass behind the net shattered on a big hit and showered the front row. A season ticket holder needed stitches and the video is everywhere.',
    choices: [
      { label: 'Settle and replace all railings', fx: { cash: -3, fans: 1, cond: { seats: 20 } } },
      { label: 'Settle quietly', fx: { cash: -1.2, fans: -3 } },
      { label: 'Deny responsibility', fx: { fans: -9 }, risk: [0.45, { cash: -4 }, 'The family sued and won. Expensive.'] },
    ] },
  { id: 'flood', kind: 'org', w: lowCond('parking', 0.8), title: 'Garage flooded',
    text: () => 'A burst water main flooded the lower levels of the parking garage two days before a home game.',
    choices: [
      { label: 'Pump it out and repave', fx: { cash: -1.5, cond: { parking: 25 } } },
      { label: 'Run free shuttles from downtown', fx: { cash: -0.4, fans: 1, cond: { parking: -5 } } },
      { label: 'Let fans figure it out', fx: { fans: -5, cond: { parking: -15 } } },
    ] },
  { id: 'foodpoison', kind: 'org', w: lowCond('food', 0.8), title: 'Food poisoning at the stadium',
    text: () => 'Dozens of fans got sick after eating arena poutine. The health department is asking questions.',
    choices: [
      { label: 'Refund everyone and deep clean', fx: { cash: -1, fans: -1, cond: { food: 25 } } },
      { label: 'Blame the vendor and switch suppliers', fx: { cash: -0.3, fans: -3, cond: { food: 10 } } },
      { label: 'Downplay it', fx: { fans: -8 }, risk: [0.35, { cash: -1.5 }, 'The health department fined the team.'] },
    ] },
  { id: 'outage', kind: 'org', w: lowCond('board', 0.7), title: 'Power outage during the game',
    text: () => 'The jumbotron and half the arena lights went dark for 40 minutes during the second intermission. Fans sat in the dark booing.',
    choices: [
      { label: 'Comp tickets for everyone there', fx: { cash: -1.8, fans: 3, cond: { board: 15 } } },
      { label: 'Apologize with discount codes', fx: { cash: -0.3, fans: -1, cond: { board: 5 } } },
      { label: 'Say nothing', fx: { fans: -6 } },
    ] },
  { id: 'lockergripe', kind: 'org', w: lowCond('locker', 0.6), title: 'Players go public about the facilities',
    text: () => 'Two veterans told reporters the dressing room is "worse than my junior rink" - moldy showers, a broken hot tub and a skate sharpener from the 80s.',
    choices: [
      { label: 'Renovate the locker room now', fx: { cash: -3, morTeam: 3, cond: { locker: 35 } } },
      { label: 'Promise fixes after the season', fx: { cash: -0.5, morTeam: -1, cond: { locker: 8 } } },
      { label: 'Tell them to stop complaining', fx: { morTeam: -5, fans: -2 } },
    ] },
  { id: 'scalpers', kind: 'org', w: () => 0.6, title: 'Counterfeit ticket ring',
    text: () => 'Hundreds of fake tickets were sold online for the next home game. Fans with fake tickets are being turned away at the doors.',
    choices: [
      { label: 'Honor the fake tickets', fx: { cash: -0.8, fans: 4 } },
      { label: 'Offer partial refunds', fx: { cash: -0.3 } },
      { label: 'Not our problem', fx: { fans: -6 } },
    ] },
  { id: 'hospital', kind: 'org', w: () => 0.7, title: "Children's hospital fundraiser",
    text: () => "The local children's hospital asked the team to host a skate-with-the-players fundraiser at the arena.",
    choices: [
      { label: 'Host it and match donations', fx: { cash: -1, fans: 5, morTeam: 2 } },
      { label: 'Send a few players to visit', fx: { fans: 2, morTeam: 1 } },
      { label: 'Decline politely', fx: { fans: -3 } },
    ] },
  { id: 'sponsor', kind: 'org', w: () => 0.6, title: 'Sponsorship offer',
    text: () => 'An energy drink company offers $6M to paint a giant logo under the center-ice circle, plus an ad on every TV timeout.',
    choices: [
      { label: 'Take the full deal', fx: { cash: 6, fans: -3 } },
      { label: 'Negotiate a smaller ad', fx: { cash: 3, fans: -1 } },
      { label: 'Decline, keep it classic', fx: { fans: 1 } },
    ] },
  { id: 'zamboni', kind: 'org', w: lowCond('ice', 1), title: 'Zamboni breaks down',
    text: () => 'One of the ice resurfacers died on the ice during the first intermission and leaked hydraulic fluid. The backup is barely running.',
    choices: [
      { label: 'Buy a new machine now', fx: { cash: -1.2, fans: 1, cond: { ice: 25 } } },
      { label: 'Rent one for the season', fx: { cash: -0.4, cond: { ice: 8 } } },
      { label: 'Patch up the old one', fx: { fans: -2, cond: { ice: -12 } }, risk: [0.35, { fans: -4, cond: { ice: -15 } }, 'It broke again mid-game. The players hated the ice.'] },
    ] },
  { id: 'hats', kind: 'org', w: () => 0.5, title: 'Hat trick cleanup',
    text: () => 'After a hat trick, fans threw thousands of hats on the ice. A local shelter asked whether the team would donate them.',
    choices: [
      { label: 'Donate them and match with new ones', fx: { cash: -0.2, fans: 3 } },
      { label: 'Donate them', fx: { fans: 1 } },
      { label: 'Throw them out', fx: { fans: -2 } },
    ] },
  { id: 'winter', kind: 'org', w: (L) => L.phase === 'regular' ? 0.6 : 0, title: 'Blizzard on game night',
    text: () => 'A blizzard is shutting down the roads before a home game. Half the season ticket holders cannot get downtown.',
    choices: [
      { label: 'Credit everyone a future game', fx: { cash: -0.8, fans: 3 } },
      { label: 'Free hot chocolate for those who make it', fx: { cash: -0.05, fans: 1 } },
      { label: 'Business as usual', fx: { fans: -3 } },
    ] },
  { id: 'protest', kind: 'org', w: (L) => priceIdx(L, 'ticket') > 1.12 || priceIdx(L, 'season') > 1.12 ? 1.5 : 0, title: 'Fans protest prices',
    text: () => 'A fan group is organizing a walkout over ticket prices and unfurled a banner in the upper bowl.',
    choices: [
      { label: 'Cut single-game prices 10%', fx: { fans: 5, price: { ticket: 0.9 } } },
      { label: 'Meet with fan reps, freeze prices', fx: { fans: 2 } },
      { label: 'Ignore them', fx: { fans: -6 } },
    ] },
  { id: 'mascot', kind: 'org', w: () => 0.5, title: 'Mascot goes viral',
    text: (L, c) => `Your mascot belly-slid across the ${c.opp} logo during warmups and the clip has 10 million views.`,
    setup: (L) => ({ opp: L.teams[R.pick(L.teams.filter(t => t.id !== L.userTeam)).id].name }),
    choices: [
      { label: 'Embrace it', fx: { fans: 3 }, risk: [0.3, { cash: -0.5 }, 'The league fined the team for unsportsmanlike conduct.'] },
      { label: 'Apologize', fx: { fans: -1 } },
      { label: 'Fire the mascot', fx: { fans: -4, morTeam: -1 } },
    ] },
  { id: 'grant', kind: 'org', w: (L) => FACILITIES.some(f => L.ops.stadium[f[0]].cond < 60) ? 0.6 : 0, title: 'City renovation grant',
    text: (L, c) => `The city will cover half of a renovation of the ${FAC[c.fac].name.toLowerCase()} if the team pays the other half (${fmtM(c.cost)}).`,
    setup: (L) => { const f = FACILITIES.map(x => x[0]).filter(k => L.ops.stadium[k].lvl < 5).sort((a, b) => L.ops.stadium[a].cond - L.ops.stadium[b].cond)[0]; return f ? { fac: f, cost: Math.round(upgradeCost(L, f) / 2 * 10) / 10 } : null; },
    choices: [
      { label: 'Accept the grant', fx: { grant: true, fans: 2 } },
      { label: 'Just do repairs instead', fxFn: (L, c) => ({ cash: -1, cond: { [c.fac]: 20 } }) },
      { label: 'Decline', fx: {} },
    ] },
  // ----- player events -----
  { id: 'arrest', kind: 'player', w: () => 0.9, title: 'Player arrested',
    text: (L, c) => `${c.name} was arrested overnight on a DUI charge. Cameras were there.`,
    setup: (L) => playerForEvent(L, false),
    choices: [
      { label: 'Suspend him 5 games', fx: { fans: 2, pop: -10, susp: 5, mor: -12 } },
      { label: 'Stand by him', fx: { fans: -6, pop: -5, mor: 8 } },
      { label: 'Release him', fx: { fans: 3, release: true, morTeam: -2 } },
    ] },
  { id: 'fight', kind: 'player', w: () => 0.7, title: 'Nightclub fight',
    text: (L, c) => `${c.name} was involved in a fight at a nightclub. No charges yet, but there is video.`,
    setup: (L) => playerForEvent(L, false),
    choices: [
      { label: 'Suspend him 2 games', fx: { fans: 1, pop: -6, susp: 2, mor: -8 } },
      { label: 'Fine him and move on', fx: { cash: 0.1, pop: -4, mor: -5 } },
      { label: 'No comment', fx: { fans: -4, pop: -2, mor: 3 } },
    ] },
  { id: 'callout', kind: 'player', w: (L) => L.teams[L.userTeam].rec.strk <= -2 ? 1.2 : 0.2, title: 'Player blasts the fans',
    text: (L, c) => `After the loss, ${c.name} said the home crowd "sounds like a library" and that fans "don't deserve this team."`,
    setup: (L) => playerForEvent(L, true),
    choices: [
      { label: 'Make him apologize publicly', fx: { fans: 1, pop: -3, mor: -6 } },
      { label: 'Fine him', fx: { fans: 2, pop: -6, cash: 0.05, mor: -8, morTeam: 1 } },
      { label: 'Back your player', fx: { fans: -5, pop: 4, mor: 8, morTeam: -2 } },
    ] },
  { id: 'charity', kind: 'player', w: () => 0.8, title: 'Player charity foundation',
    text: (L, c) => `${c.name} is launching a foundation to buy youth hockey gear and asked if the team will help.`,
    setup: (L) => playerForEvent(L, true),
    choices: [
      { label: 'Match his donation', fx: { cash: -0.5, fans: 3, pop: 10, mor: 10, morTeam: 1 } },
      { label: 'Promote it on team channels', fx: { fans: 1, pop: 5, mor: 5 } },
      { label: 'Stay out of it', fx: { pop: -2, mor: -6 } },
    ] },
  { id: 'number', kind: 'player', w: () => 0.5, title: 'Jersey number change',
    text: (L, c) => `${c.name} wants to switch jersey numbers. Every jersey with his old number in stock would have to be cleared out.`,
    setup: (L) => playerForEvent(L, true),
    choices: [
      { label: 'Approve the change', fxFn: (L, c) => ({ cash: -((L.ops.jersey.stock[c.pid] || 0) * JERSEY_COST / 1e6), pop: 4, mor: 6, clearStock: true, renumber: true }) },
      { label: 'Approve it after this season', fx: { pop: 1, mor: 1 } },
      { label: 'Deny it', fx: { pop: -3, mor: -8 } },
    ] },
  { id: 'autographs', kind: 'player', w: () => 0.6, title: 'Fan favorite moment',
    text: (L, c) => `${c.name} stayed two hours after practice signing sticks for every kid in line. It's all over social media.`,
    setup: (L) => playerForEvent(L, true),
    choices: [
      { label: 'Build a marketing campaign around him', fx: { cash: -0.2, fans: 2, pop: 9, mor: 6 } },
      { label: 'Thank him publicly', fx: { fans: 1, pop: 4, mor: 3 } },
      { label: 'Nothing', fx: { mor: -2 } },
    ] },
];
function playerForEvent(L, famous) {
  const ps = L.teams[L.userTeam].roster.map(id => L.players[id]).filter(p => p && !p.injury && !p.farm);
  if (!ps.length) return null;
  const p = famous ? R.weighted(ps, x => Math.pow(playerPopularity(L, x), 1.5)) : R.weighted(ps, x => 1 + playerPopularity(L, x) * 0.2);
  return { pid: p.id, name: `${p.pos} ${fullName(p)}` };
}
function maybeOpsEvent(L, chance) {
  const O = L.ops; if (!O || O.event) return;
  if (!R.chance(chance)) return;
  const pool = OPS_EVENTS.map(e => ({ e, w: e.w(L) * ((O.seen[e.id] || 0) >= L.year - 1 ? 0.3 : 1) })).filter(x => x.w > 0);
  if (!pool.length) return;
  const e = R.weighted(pool, x => x.w).e;
  const ctx = e.setup ? e.setup(L) : {};
  if (!ctx) return;
  O.event = { id: e.id, ctx, title: e.title, text: e.text(L, ctx), y: L.year, w: L.day, phase: L.phase };
  O.seen[e.id] = L.year;
  O.newEvent = (O.newEvent || 0) + 1;
}
function eventChoiceFx(L, ev, i) { const e = OPS_EVENTS.find(x => x.id === ev.id); const c = e.choices[i]; return c.fxFn ? c.fxFn(L, ev.ctx) : c.fx; }
function fxSummary(L, fx, ev) {
  const out = [];
  if (fx.cash) out.push(fx.cash > 0 ? `+${fmtM(fx.cash)}` : `-${fmtM(-fx.cash)}`);
  if (fx.fans) out.push(`fans ${fx.fans > 0 ? '+' : ''}${fx.fans}`);
  if (fx.cond) for (const k in fx.cond) out.push(`${FAC[k].name.toLowerCase()} ${fx.cond[k] > 0 ? '+' : ''}${fx.cond[k]}`);
  if (fx.pop) out.push(`popularity ${fx.pop > 0 ? '+' : ''}${fx.pop}`);
  if (fx.mor) out.push(`his morale ${fx.mor > 0 ? '+' : ''}${fx.mor}`);
  if (fx.morTeam) out.push(`team morale ${fx.morTeam > 0 ? '+' : ''}${fx.morTeam}`);
  if (fx.susp) out.push(`suspended ${fx.susp} game${fx.susp > 1 ? 's' : ''}`);
  if (fx.release) out.push('released');
  if (fx.price) out.push('ticket price -10%');
  if (fx.grant && ev) out.push(`-${fmtM(ev.ctx.cost)}, ${FAC[ev.ctx.fac].name.toLowerCase()} +1 level`);
  return out.join(' · ');
}
function applyFx(L, fx, ev, why) {
  const O = L.ops, p = ev.ctx && ev.ctx.pid !== undefined ? L.players[ev.ctx.pid] : null;
  if (fx.cash) { if (fx.cash > 0) opsEarn(L, fx.cash, 'other'); else opsSpend(L, -fx.cash, 'events'); }
  if (fx.fans) fanChange(L, fx.fans, why);
  if (fx.cond) for (const k in fx.cond) O.stadium[k].cond = clamp(O.stadium[k].cond + fx.cond[k], 0, 100);
  if (fx.price) for (const k in fx.price) opsSetPrice(L, k, O.prices[k] * fx.price[k]);
  if (fx.morTeam && typeof bumpTeamMorale === 'function') bumpTeamMorale(L, L.userTeam, fx.morTeam, why, p ? p.id : undefined);
  if (fx.grant) { const f = O.stadium[ev.ctx.fac]; opsSpend(L, ev.ctx.cost, 'upgrades'); f.lvl = Math.min(5, f.lvl + 1); f.cond = 100; }
  if (p) {
    if (fx.pop) p.popAdj = (p.popAdj || 0) + fx.pop;
    if (fx.mor && typeof bumpMorale === 'function') bumpMorale(L, p, fx.mor, why);
    if (fx.susp && p.tid === L.userTeam) { p.injury = { name: 'Suspension', games: fx.susp, fresh: false, ill: true, susp: true }; news(L, `${L.teams[p.tid].abbr} ${p.pos} ${fullName(p)} suspended ${fx.susp} game${fx.susp > 1 ? 's' : ''} by the team.`, p.tid); }
    if (fx.clearStock) delete O.jersey.stock[p.id];
    if (fx.renumber) { const used = new Set(L.teams[L.userTeam].roster.map(id => L.players[id].num)); let n = R.int(1, 99), g = 0; while (used.has(n) && g++ < 200) n = R.int(1, 99); p.num = n; }
    if (fx.release && p.tid === L.userTeam) releasePlayer(L, p);
  }
}
function opsRespond(L, i) {
  const O = L.ops, ev = O.event; if (!ev) return null;
  const e = OPS_EVENTS.find(x => x.id === ev.id); const c = e.choices[i]; if (!c) return null;
  const fx = eventChoiceFx(L, ev, i);
  applyFx(L, fx, ev, ev.title);
  let extra = null;
  if (c.risk && R.chance(c.risk[0])) { applyFx(L, c.risk[1], ev, `${ev.title}: it backfired`); extra = c.risk[2] + ' (' + fxSummary(L, c.risk[1], ev) + ')'; }
  O.eventLog.unshift({ y: L.year, w: ev.phase === 'regular' ? ev.w : 0, title: ev.title, choice: c.label, fx: fxSummary(L, fx, ev), extra });
  if (O.eventLog.length > 30) O.eventLog.length = 30;
  O.event = null;
  return { choice: c.label, fx: fxSummary(L, fx, ev), extra };
}
