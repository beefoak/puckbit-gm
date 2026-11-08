'use strict';
// ================= RNG / helpers =================
const R = {
  rand: (a = 0, b = 1) => a + Math.random() * (b - a),
  int: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  gauss: (m = 0, s = 1) => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  chance: (p) => Math.random() < p,
  weighted: (items, wfn) => {
    let tot = 0; const ws = items.map(i => { const w = Math.max(0, wfn(i)); tot += w; return w; });
    let r = Math.random() * tot;
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  },
  shuffle: (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
  poisson: (lam) => { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; },
};
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function seasonLabel(y) { return y + '-' + String((y + 1) % 100).padStart(2, '0'); }
function fmtM(v) { return '$' + (Math.round(v * 100) / 100).toFixed(v >= 10 ? 1 : 2) + 'M'; }
function sum(arr, f) { let s = 0; for (const x of arr) s += f ? f(x) : x; return s; }

// ================= Positions / ratings =================
const POSITIONS = ['C', 'LW', 'RW', 'D', 'G'];
const FWD = ['C', 'LW', 'RW'];
const POS_NAMES = { C: 'Center', LW: 'Left Wing', RW: 'Right Wing', D: 'Defense', G: 'Goaltender' };
const ROSTER_TEMPLATE = { C: 5, LW: 4, RW: 4, D: 8, G: 2 }; // 23
const ROSTER_MIN = { C: 4, LW: 3, RW: 3, D: 6, G: 2 };
const HEALTHY_NEED = { C: 4, LW: 4, RW: 4, D: 6, G: 2 };
const ROSTER_LIMIT = 23;
const FARM_LIMIT = 22;

const ATTRS = ['spd', 'skt', 'str', 'end', 'sht', 'shp', 'hnd', 'pas', 'ofi', 'dfi', 'chk', 'blk', 'fo', 'dis', 'rfx', 'gpos', 'glv', 'reb'];
const SKATER_ATTRS = ['spd', 'skt', 'str', 'end', 'sht', 'shp', 'hnd', 'pas', 'ofi', 'dfi', 'chk', 'blk', 'fo', 'dis'];
const GOALIE_ATTRS = ['rfx', 'gpos', 'glv', 'reb', 'skt', 'end', 'dis'];
const ATTR_NAMES = { spd: 'Speed', skt: 'Skating', str: 'Strength', end: 'Endurance', sht: 'Shot Accuracy', shp: 'Shot Power', hnd: 'Puck Handling', pas: 'Passing', ofi: 'Offensive IQ', dfi: 'Defensive IQ', chk: 'Checking', blk: 'Shot Blocking', fo: 'Faceoffs', dis: 'Discipline', rfx: 'Reflexes', gpos: 'Positioning', glv: 'Glove Hand', reb: 'Rebound Control' };
const ATTR_SHORT = { spd: 'SPD', skt: 'SKT', str: 'STR', end: 'END', sht: 'SHT', shp: 'PWR', hnd: 'HND', pas: 'PAS', ofi: 'OFF', dfi: 'DEF', chk: 'CHK', blk: 'BLK', fo: 'FO', dis: 'DIS', rfx: 'RFX', gpos: 'POS', glv: 'GLV', reb: 'REB' };
const OVR_WEIGHTS = {
  C: { ofi: .17, pas: .17, hnd: .14, sht: .12, spd: .09, skt: .09, fo: .09, dfi: .07, shp: .03, str: .03 },
  LW: { sht: .2, ofi: .15, hnd: .14, pas: .11, spd: .12, skt: .1, shp: .08, dfi: .05, str: .05 },
  RW: { sht: .2, ofi: .15, hnd: .14, pas: .11, spd: .12, skt: .1, shp: .08, dfi: .05, str: .05 },
  D: { dfi: .24, skt: .12, pas: .12, chk: .1, blk: .1, str: .09, spd: .06, shp: .07, hnd: .05, ofi: .05 },
  G: { rfx: .32, gpos: .3, glv: .16, reb: .14, skt: .04, end: .04 },
};
const ATH_BASE = {
  C: { spd: 78, skt: 80, str: 70, end: 76 }, LW: { spd: 80, skt: 79, str: 70, end: 74 }, RW: { spd: 80, skt: 79, str: 70, end: 74 },
  D: { spd: 74, skt: 76, str: 79, end: 77 }, G: { spd: 50, skt: 72, str: 64, end: 74 },
};
const CROSS = {
  C: { chk: 54, blk: 48, rfx: 20, gpos: 20, glv: 20, reb: 20 },
  LW: { chk: 56, blk: 46, fo: 42, rfx: 20, gpos: 20, glv: 20, reb: 20 },
  RW: { chk: 56, blk: 46, fo: 42, rfx: 20, gpos: 20, glv: 20, reb: 20 },
  D: { fo: 28, sht: 56, rfx: 20, gpos: 20, glv: 20, reb: 20 },
  G: { sht: 22, shp: 30, hnd: 38, pas: 42, ofi: 25, dfi: 40, chk: 20, blk: 30, fo: 15 },
};
const PEAK = { C: [25, 30], LW: [24, 29], RW: [24, 29], D: [26, 31], G: [27, 32] };
const HTWT = { C: [73, 196], LW: [73, 197], RW: [73, 197], D: [75, 208], G: [75, 201] };
const POS_DRAFT_W = { C: 5, LW: 4, RW: 4, D: 7, G: 1.8 };
const POS_VALUE = { C: 1.12, LW: 1, RW: 1, D: 1.05, G: 1.15 };

// ================= Names & nationalities =================
const NATS = {
  CAN: { name: 'Canada', flag: '#d52b1e' }, USA: { name: 'USA', flag: '#3c3b6e' }, SWE: { name: 'Sweden', flag: '#006aa7' },
  FIN: { name: 'Finland', flag: '#ffffff' }, RUS: { name: 'Russia', flag: '#0039a6' }, CZE: { name: 'Czechia', flag: '#11457e' },
  SVK: { name: 'Slovakia', flag: '#0b4ea2' }, GER: { name: 'Germany', flag: '#000000' }, SUI: { name: 'Switzerland', flag: '#d52b1e' },
  DEN: { name: 'Denmark', flag: '#c8102e' }, LAT: { name: 'Latvia', flag: '#9e3039' },
};
const NA_FIRST = ['Adam', 'Alex', 'Andrew', 'Austin', 'Ben', 'Blake', 'Brad', 'Brady', 'Brandon', 'Brayden', 'Brent', 'Brett', 'Brian', 'Brock', 'Bryce', 'Cale', 'Cam', 'Carter', 'Chris', 'Clayton', 'Cody', 'Cole', 'Colton', 'Connor', 'Corey', 'Curtis', 'Dale', 'Dallas', 'Dan', 'Darcy', 'Darryl', 'Dave', 'Derek', 'Doug', 'Drew', 'Dylan', 'Eric', 'Evan', 'Garrett', 'Gavin', 'Glenn', 'Grant', 'Greg', 'Hunter', 'Jack', 'Jake', 'Jamie', 'Jared', 'Jason', 'Jeff', 'Jesse', 'Joel', 'Jordan', 'Josh', 'Justin', 'Kevin', 'Kirk', 'Kris', 'Kyle', 'Lance', 'Landon', 'Liam', 'Logan', 'Luke', 'Mark', 'Matt', 'Max', 'Mike', 'Mitch', 'Nathan', 'Nick', 'Noah', 'Owen', 'Pat', 'Paul', 'Pete', 'Quinn', 'Randy', 'Reid', 'Rick', 'Rob', 'Ryan', 'Sam', 'Scott', 'Sean', 'Shane', 'Shawn', 'Spencer', 'Steve', 'Tanner', 'Taylor', 'Ted', 'Todd', 'Travis', 'Trent', 'Trevor', 'Troy', 'Tyler', 'Wade', 'Wes', 'Zach', 'Mason', 'Ethan', 'Caleb', 'Jaxon', 'Macklin', 'Cutter', 'Beckett'];
const OLD_FIRST = ['Butch', 'Cy', 'Dickie', 'Dutch', 'Ernie', 'Frank', 'Fred', 'Hap', 'Hec', 'Howie', 'Lorne', 'Murray', 'Norm', 'Ralph', 'Red', 'Rod', 'Stan', 'Terry', 'Ward', 'Wally', 'Gord', 'Ken', 'Bob', 'Bill', 'Don', 'Al', 'Barry', 'Bernie', 'Bud', 'Chico', 'Gump', 'Moose', 'Punch', 'Sid', 'Tod', 'Vic', 'Wilf'];
const FR_FIRST = ['Alexandre', 'Antoine', 'Benoit', 'Claude', 'Denis', 'Gilles', 'Guy', 'Jacques', 'Jean', 'Jean-Luc', 'Louis', 'Luc', 'Marc-Andre', 'Mathieu', 'Maxime', 'Michel', 'Olivier', 'Patrice', 'Philippe', 'Pierre', 'Rejean', 'Serge', 'Simon', 'Sylvain', 'Yanni', 'Yves', 'Gaston', 'Henri', 'Raymond', 'Jean-Guy'];
const NA_LAST = ['Abbott', 'Anderson', 'Armstrong', 'Bailey', 'Barnes', 'Bell', 'Bennett', 'Boyd', 'Brennan', 'Burke', 'Byrne', 'Cameron', 'Campbell', 'Carlson', 'Carroll', 'Clarke', 'Coleman', 'Collins', 'Cook', 'Cooper', 'Crawford', 'Cullen', 'Daley', 'Doherty', 'Donovan', 'Douglas', 'Doyle', 'Duncan', 'Dunn', 'Elliott', 'Ferguson', 'Finley', 'Fleming', 'Fletcher', 'Foster', 'Fraser', 'Gallagher', 'Gardner', 'Gibson', 'Gordon', 'Graham', 'Grant', 'Hall', 'Hamilton', 'Harper', 'Harris', 'Hayes', 'Henderson', 'Hughes', 'Hunter', 'Jackson', 'Johnston', 'Kane', 'Keller', 'Kennedy', 'Kerr', 'Knight', 'Lambert', 'Lawson', 'MacDonald', 'MacKay', 'MacLean', 'MacLeod', 'Martin', 'McAllister', 'McCabe', 'McCarthy', 'McGrath', 'McKenzie', 'McLeod', 'McNeil', 'Miller', 'Mitchell', 'Moore', 'Morrison', 'Murphy', 'Murray', 'Nelson', "O'Brien", "O'Connor", "O'Neill", 'Parker', 'Patterson', 'Peters', 'Phillips', 'Porter', 'Quinn', 'Reid', 'Reynolds', 'Richardson', 'Robertson', 'Ross', 'Russell', 'Ryan', 'Sanderson', 'Scott', 'Shaw', 'Simpson', 'Sinclair', 'Smith', 'Stewart', 'Sullivan', 'Sutherland', 'Taylor', 'Thompson', 'Turner', 'Walker', 'Wallace', 'Ward', 'Watson', 'Webb', 'White', 'Wilson', 'Wright', 'Young', 'Kowalchuk', 'Hrycak', 'Wozniak', 'Boychuk', 'Petrie', 'Brodie', 'Steen', 'Hextall', 'Gorman', 'Tkachyk', 'Mahovlich', 'Delvecchio', 'Larkin', 'Kelso', 'Bannerman'];
const FR_LAST = ['Beaulieu', 'Belanger', 'Bouchard', 'Boucher', 'Caron', 'Cote', 'Desjardins', 'Dubois', 'Dufresne', 'Fortin', 'Gagnon', 'Gauthier', 'Girard', 'Lachance', 'Lapointe', 'Leblanc', 'Leclerc', 'Lefebvre', 'Levesque', 'Martel', 'Morin', 'Ouellet', 'Paquette', 'Pelletier', 'Picard', 'Poirier', 'Savard', 'Thibault', 'Tremblay', 'Vachon', 'Gendron', 'Lavoie', 'Bergevin', 'Robitaille', 'Plante', 'Richer'];
const EU_NAMES = {
  SWE: [['Anders', 'Elias', 'Erik', 'Filip', 'Gustav', 'Henrik', 'Isak', 'Jesper', 'Johan', 'Jonas', 'Lars', 'Linus', 'Magnus', 'Mattias', 'Niklas', 'Oscar', 'Rasmus', 'Viktor', 'William', 'Anton', 'Lucas', 'Hampus', 'Nils', 'Oliver', 'Leo', 'Ludvig'], ['Andersson', 'Berg', 'Bergstrom', 'Eriksson', 'Forsman', 'Gustafsson', 'Holm', 'Johansson', 'Karlsson', 'Larsson', 'Lindberg', 'Lindgren', 'Lindholm', 'Lundell', 'Nilsson', 'Nyberg', 'Olsson', 'Persson', 'Sandstrom', 'Sjoberg', 'Svensson', 'Wikstrom', 'Ekman', 'Ohlund', 'Hagelin', 'Brannstrom']],
  FIN: [['Aleksi', 'Antti', 'Eetu', 'Jani', 'Jari', 'Jesse', 'Joonas', 'Juho', 'Jussi', 'Kaapo', 'Kasperi', 'Mikko', 'Niko', 'Olli', 'Patrik', 'Sami', 'Teemu', 'Tuomas', 'Valtteri', 'Ville', 'Urho', 'Aatu'], ['Aaltonen', 'Hakala', 'Korhonen', 'Koskinen', 'Lehtonen', 'Makinen', 'Nieminen', 'Saarinen', 'Salo', 'Virtanen', 'Hamalainen', 'Jokinen', 'Kallio', 'Leino', 'Peltonen', 'Rasanen', 'Toivonen', 'Lappalainen', 'Heikkinen', 'Vaananen']],
  RUS: [['Alexei', 'Andrei', 'Artemi', 'Dmitri', 'Evgeni', 'Igor', 'Ilya', 'Ivan', 'Kirill', 'Maxim', 'Mikhail', 'Nikita', 'Nikolai', 'Pavel', 'Sergei', 'Vadim', 'Valeri', 'Viktor', 'Vladimir', 'Yegor', 'Matvei', 'Arseni'], ['Antonov', 'Belov', 'Bogdanov', 'Fedotov', 'Gusev', 'Ivanov', 'Kozlov', 'Kuznetsov', 'Morozov', 'Nikitin', 'Orlov', 'Petrov', 'Popov', 'Romanov', 'Smirnov', 'Sokolov', 'Volkov', 'Zaitsev', 'Lebedev', 'Kasatkin', 'Barabanov', 'Tikhonov']],
  CZE: [['David', 'Dominik', 'Filip', 'Jakub', 'Jan', 'Jiri', 'Lukas', 'Martin', 'Michal', 'Milan', 'Ondrej', 'Pavel', 'Petr', 'Radek', 'Roman', 'Tomas', 'Vaclav', 'Marek', 'Adam', 'Vojtech'], ['Cerny', 'Dvorak', 'Hajek', 'Horak', 'Jelinek', 'Kral', 'Kubalik', 'Novak', 'Novotny', 'Prochazka', 'Ruzicka', 'Svoboda', 'Vesely', 'Zeman', 'Kopecky', 'Simek', 'Blaha', 'Hronek', 'Necas', 'Vrana']],
  SVK: [['Marian', 'Zdeno', 'Tomas', 'Juraj', 'Martin', 'Richard', 'Simon', 'Adam', 'Peter', 'Pavol', 'Erik', 'Milos'], ['Hudak', 'Kovac', 'Varga', 'Tatar', 'Slafkovsky', 'Nemec', 'Halak', 'Sekera', 'Gaborik', 'Visnovsky', 'Bondra', 'Stastny']],
  GER: [['Lukas', 'Leon', 'Moritz', 'Tim', 'Nico', 'Dominik', 'Kevin', 'Jonas', 'Tobias', 'Marco'], ['Muller', 'Schmidt', 'Weber', 'Fischer', 'Wagner', 'Becker', 'Hoffmann', 'Seider', 'Peterka', 'Kahun']],
  SUI: [['Yannick', 'Nico', 'Roman', 'Timo', 'Kevin', 'Pius', 'Janis', 'Denis'], ['Meier', 'Josi', 'Hischier', 'Fiala', 'Niederreiter', 'Siegenthaler', 'Moser', 'Bertschy']],
  DEN: [['Mikkel', 'Frederik', 'Nicklas', 'Oliver', 'Lars', 'Jannik'], ['Jensen', 'Nielsen', 'Hansen', 'Larsen', 'Andersen', 'Bodker', 'Ehlers', 'Storm']],
  LAT: [['Kaspars', 'Zemgus', 'Arturs', 'Elvis', 'Rudolfs', 'Sandis'], ['Ozolins', 'Girgensons', 'Balinskis', 'Merzlikins', 'Daugavins', 'Bluger', 'Silovs', 'Irbe']],
};
// Rough share of league players by birthplace in a given season.
function natWeights(year) {
  const e = clamp((year - 1975) / 25, 0, 1), r = clamp((year - 1989) / 6, 0, 1);
  return { CAN: 0.95 - e * 0.5, USA: 0.03 + e * 0.24, SWE: 0.01 + e * 0.07, FIN: 0.005 + e * 0.05, RUS: r * 0.06, CZE: e * 0.045, SVK: r * 0.015, GER: e * 0.015, SUI: e * 0.012, DEN: e * 0.008, LAT: r * 0.006 };
}
function rollNat(year) { const w = natWeights(year); return R.weighted(Object.keys(w), k => w[k]); }
function rollName(nat, birthYear) {
  if (nat === 'CAN' || nat === 'USA') {
    const fr = nat === 'CAN' && R.chance(0.22);
    let fn = fr ? R.pick(FR_FIRST) : R.pick(NA_FIRST);
    if (!fr && birthYear < 1955 && R.chance(0.45)) fn = R.pick(OLD_FIRST);
    return [fn, fr ? R.pick(FR_LAST) : R.pick(NA_LAST)];
  }
  const n = EU_NAMES[nat] || EU_NAMES.SWE; return [R.pick(n[0]), R.pick(n[1])];
}
const JUNIOR = { CAN: ['OHL', 'WHL', 'QMJHL', 'NCAA'], USA: ['USHL', 'NCAA', 'USNTDP', 'OHL'], SWE: ['SHL', 'Allsvenskan'], FIN: ['Liiga', 'Mestis'], RUS: ['KHL', 'MHL'], CZE: ['Extraliga', 'OHL'], SVK: ['Tipos Extraliga', 'WHL'], GER: ['DEL'], SUI: ['National League'], DEN: ['Metal Ligaen', 'SHL'], LAT: ['OHL', 'KHL'] };

// ================= Stats =================
// Skaters: gp g a pm pim sog ppg ppa shg gwg hit blk tk gv fow fol toi(sec) ixg cf ca hat
// Goalies: gs w l otl t sa ga so gtoi xga
const STAT_KEYS = ['gp', 'g', 'a', 'pm', 'pim', 'sog', 'ppg', 'ppa', 'shg', 'gwg', 'hit', 'blk', 'tk', 'gv', 'fow', 'fol', 'toi', 'ixg', 'cf', 'ca', 'hat', 'gs', 'w', 'l', 'otl', 't', 'sa', 'ga', 'so', 'gtoi', 'xga'];
function emptyStats() { const o = {}; for (const k of STAT_KEYS) o[k] = 0; return o; }
function addStats(dst, src) { for (const k of STAT_KEYS) { const v = src[k]; if (v) dst[k] = (dst[k] || 0) + v; } }
function compactStats(s) { const o = {}; for (const k of STAT_KEYS) if (s[k]) o[k] = k === 'ixg' || k === 'xga' ? Math.round(s[k] * 10) / 10 : s[k]; return o; }
function st(s, k) { return (s && s[k]) || 0; }
function pts(s) { return st(s, 'g') + st(s, 'a'); }
function svPct(s) { return st(s, 'sa') ? (st(s, 'sa') - st(s, 'ga')) / st(s, 'sa') : 0; }
function gaa(s) { const m = st(s, 'gtoi') / 60; return m ? st(s, 'ga') * 60 / m : 0; }
function fmtSv(v) { return v ? v.toFixed(3).replace(/^0/, '') : '-'; }
function fmtToi(sec) { sec = Math.round(sec); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }

// ================= Players =================
function calcOvr(p) { const w = OVR_WEIGHTS[p.pos]; let s = 0; for (const k in w) s += p.attrs[k] * w[k]; return Math.round(s); }
function clampAttrs(p) { for (const k of ATTRS) p.attrs[k] = Math.round(clamp(p.attrs[k], 15, 99)); }
function rollNum(pos) { return pos === 'G' ? R.pick([1, 29, 30, 31, 32, 33, 34, 35, 37, 39, 40, 41, 50, 60, 70, 72, 80]) : R.int(2, 98); }

function createPlayer(L, pos, T, age, opts) {
  opts = opts || {};
  const yr = opts.year || L.year || 2026;
  const nat = opts.nat || rollNat(yr);
  const [fn, ln] = rollName(nat, yr - age);
  const a = {}; const base = ATH_BASE[pos], w = OVR_WEIGHTS[pos], cross = CROSS[pos] || {};
  // archetype tilt: some players lean shooter, some playmaker, some physical
  const tilt = pos === 'G' ? null : R.pick(['shoot', 'pass', 'phys', 'speed', 'def', 'bal', 'bal']);
  for (const k of ATTRS) {
    if (k in base) a[k] = base[k] + (T - 70) * 0.55 + R.gauss(0, 4);
    else if (k in w) a[k] = T + R.gauss(0, 5);
    else a[k] = (cross[k] || 50) + R.gauss(0, 8);
  }
  if (tilt === 'shoot') { a.sht += 6; a.shp += 5; a.pas -= 4; }
  else if (tilt === 'pass') { a.pas += 6; a.ofi += 3; a.sht -= 4; }
  else if (tilt === 'phys') { a.str += 8; a.chk += 10; a.hnd -= 4; a.dis -= 8; }
  else if (tilt === 'speed') { a.spd += 7; a.skt += 4; a.str -= 4; }
  else if (tilt === 'def') { a.dfi += 7; a.blk += 6; a.ofi -= 4; }
  a.dis = 62 + R.gauss(0, 12) + (tilt === 'phys' ? -8 : 0);
  const p = {
    id: L.nextPid++, fn, ln, nat, pos, age, college: R.pick(JUNIOR[nat] || ['OHL']), attrs: a, ovr: 0, pot: 0, tid: -1, exp: 0,
    injury: null, ir: false, farm: false, injHist: [], stats: emptyStats(), pstats: emptyStats(),
    career: [], ovrHist: [], draft: null, awards: [], skin: nat === 'CAN' || nat === 'USA' ? R.weighted([0, 1, 2, 3, 4], i => [5, 4, 1.2, 0.6, 0.5][i]) : R.weighted([0, 1, 2], i => [6, 3, 0.4][i]),
    hand: R.chance(pos === 'G' ? 0.85 : 0.62) ? 'L' : 'R',
  };
  clampAttrs(p);
  const diff = T - calcOvr(p);
  for (const k in w) a[k] += diff;
  clampAttrs(p);
  p.ovr = calcOvr(p);
  const [htM, wtM] = HTWT[pos];
  const era = clamp((yr - 1960) / 50, 0, 1); // players got bigger
  p.ht = Math.round(R.gauss(htM - 2.5 + era * 2.5, 1.8)); p.wt = Math.round(R.gauss(wtM - 15 + era * 15 + (a.str - 70) * 0.6, 9));
  p.num = rollNum(pos);
  const pk = PEAK[pos];
  if (age < pk[0]) p.pot = clamp(Math.round(p.ovr + (pk[0] - age) * R.rand(0.8, 3.2) + R.rand(0, 4)), p.ovr, 99);
  else p.pot = clamp(p.ovr + R.int(0, 2), p.ovr, 99);
  p.style = playerStyle(p);
  return p;
}
function playerStyle(p) {
  const a = p.attrs;
  if (p.pos === 'G') return a.rfx - a.gpos > 5 ? 'Athletic' : a.gpos - a.rfx > 5 ? 'Positional' : 'Hybrid';
  if (p.pos === 'D') { if (a.ofi + a.pas > a.dfi + a.blk + 8) return 'Offensive D'; if (a.chk + a.str > 175) return 'Physical D'; if (a.dfi + a.blk > a.ofi + a.pas + 10) return 'Shutdown D'; return 'Two-Way D'; }
  if (a.chk + a.str > 175 && a.dis < 55 && a.sht < 72) return 'Enforcer';
  if (a.sht >= a.pas + 6) return a.str >= 80 ? 'Power Forward' : 'Sniper';
  if (a.pas >= a.sht + 6) return 'Playmaker';
  if (a.dfi >= a.ofi + 3) return 'Two-Way';
  if (a.spd >= 88) return 'Speedster';
  if (a.chk >= 75) return 'Grinder';
  return 'Balanced';
}
const GEN_PEAK_BONUS = 3;
function potGrade(v, gen) { return gen ? 'S' : v >= 90 ? 'A+' : v >= 85 ? 'A' : v >= 80 ? 'B+' : v >= 75 ? 'B' : v >= 70 ? 'C+' : v >= 65 ? 'C' : v >= 60 ? 'D' : 'F'; }
function htStr(h) { return Math.floor(h / 12) + "'" + (h % 12) + '"'; }
function fullName(p) { return p.fn + ' ' + p.ln; }
function shortName(p) { return p.fn[0] + '. ' + p.ln; }

// Yearly development: young players grow toward potential, veterans decline past their peak window.
function progressPlayer(p) {
  const pk0 = PEAK[p.pos], w = OVR_WEIGHTS[p.pos], before = p.ovr;
  const pk = p.gen ? [pk0[0], pk0[1] + GEN_PEAK_BONUS] : pk0;
  let delta;
  if (p.age <= pk[0]) { const room = Math.max(0, p.pot - p.ovr); delta = room * R.rand(0.1, 0.42) + R.gauss(0, 1.8); }
  else if (p.age <= pk[1]) { const room = Math.max(0, p.pot - p.ovr); delta = room * R.rand(0, 0.35) + R.gauss(0, 1.5); }
  else { const yrs = p.age - pk[1]; delta = (-(R.rand(0.4, 2.2) + yrs * R.rand(0.5, 1.4)) + R.gauss(0, 1.2)) * (p.gen ? 0.5 : 1); }
  if (p.age < 25 && R.chance(0.05)) delta += R.rand(3, 8);
  if (R.chance(p.gen ? 0.015 : 0.04)) delta -= R.rand(2, 5);
  for (const k in w) p.attrs[k] += delta * R.rand(0.6, 1.4);
  if (p.age > pk[1]) { const k = p.gen ? 0.5 : 1; p.attrs.spd -= R.rand(0.3, 1.6) * k; p.attrs.skt -= R.rand(0.2, 1) * k; p.attrs.end -= R.rand(0, 1) * k; }
  else { p.attrs.ofi += R.rand(0, 1.2); p.attrs.dfi += R.rand(0, 1.2); p.attrs.dis += R.rand(0, 1); }
  clampAttrs(p);
  p.ovr = calcOvr(p);
  if (p.age > pk[1]) p.pot = p.ovr;
  else if (p.age >= pk[0]) p.pot = Math.max(p.ovr, Math.min(p.pot, p.ovr + R.int(0, 4)));
  else p.pot = clamp(Math.round(p.pot + R.gauss(0, 2)), p.ovr, 99);
  p.style = playerStyle(p);
  return p.ovr - before;
}

// ================= Injuries (durations in games) =================
const INJURIES = [
  ['Upper-Body Injury', 22, 1, 6], ['Lower-Body Injury', 22, 1, 8], ['Concussion', 6, 3, 18], ['Broken Foot (blocked shot)', 3, 10, 25],
  ['Sprained Ankle', 8, 3, 12], ['Groin Strain', 8, 2, 9], ['Broken Hand', 3, 12, 25], ['Shoulder Separation', 4, 8, 20],
  ['Torn ACL', 0.7, 50, 82, { spd: [2, 5], skt: [2, 4] }], ['MCL Sprain', 4, 8, 20], ['Hip Surgery', 0.6, 40, 70, { skt: [2, 5] }],
  ['Broken Jaw (puck)', 1.2, 10, 20], ['Facial Laceration', 3, 1, 2], ['Back Spasms', 4, 1, 4], ['Torn Labrum', 0.8, 30, 60, { str: [1, 3] }],
  ['Broken Finger', 3, 4, 10], ['Knee Contusion', 5, 1, 4],
];
const ILLNESSES = [['Flu', 4, 1, 3], ['Illness', 4, 1, 2], ['Personal Leave', 2, 1, 4], ['Mumps', 0.4, 4, 8]];
const INJ_RATE = { C: 0.0065, LW: 0.0065, RW: 0.0065, D: 0.007, G: 0.002 }; // per game, scaled by ice time
