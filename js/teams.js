'use strict';
// ================= Franchises =================
// Every franchise has eras: [firstSeason, lastSeason, city, nickname, abbr, primary, secondary].
// Seasons are labelled by the year they start (1985 = the 1985-86 season). Teams are fictional
// stand-ins that follow the real league's expansions, relocations and folds since 1960.
const NOW = 9999;
const FRANCHISES = [
  // ---- Eastern / Atlantic ----
  { conf: 'Eastern', div: 'Atlantic', eras: [[1960, NOW, 'Boston', 'Grizzlies', 'BOS', '#111111', '#FFB81C']] },
  { conf: 'Eastern', div: 'Atlantic', eras: [[1970, NOW, 'Buffalo', 'Bison', 'BUF', '#003087', '#FFB81C']] },
  { conf: 'Eastern', div: 'Atlantic', eras: [[1960, NOW, 'Detroit', 'Motormen', 'DET', '#CE1126', '#FFFFFF']] },
  { conf: 'Eastern', div: 'Atlantic', eras: [[1993, NOW, 'Florida', 'Cougars', 'FLA', '#C8102E', '#041E42']] },
  { conf: 'Eastern', div: 'Atlantic', eras: [[1960, NOW, 'Montreal', 'Monarchs', 'MTL', '#AF1E2D', '#192168']] },
  { conf: 'Eastern', div: 'Atlantic', eras: [[1992, NOW, 'Ottawa', 'Centurions', 'OTT', '#C8102E', '#111111']] },
  { conf: 'Eastern', div: 'Atlantic', eras: [[1992, NOW, 'Tampa Bay', 'Thunder', 'TB', '#002868', '#FFFFFF']] },
  { conf: 'Eastern', div: 'Atlantic', eras: [[1960, NOW, 'Toronto', 'Northmen', 'TOR', '#00205B', '#FFFFFF']] },
  // ---- Eastern / Metropolitan ----
  { conf: 'Eastern', div: 'Metropolitan', eras: [[1979, 1996, 'Hartford', 'Harpoons', 'HFD', '#00843D', '#003087'], [1997, NOW, 'Carolina', 'Cyclones', 'CAR', '#CE1126', '#111111']] },
  { conf: 'Eastern', div: 'Metropolitan', eras: [[2000, NOW, 'Columbus', 'Cannons', 'CBJ', '#002654', '#CE1126']] },
  { conf: 'Eastern', div: 'Metropolitan', eras: [[1974, 1975, 'Kansas City', 'Pioneers', 'KC', '#0B3D91', '#FFC72C'], [1976, 1981, 'Colorado', 'Peaks', 'CLR', '#0B3D91', '#E03A3E'], [1982, NOW, 'New Jersey', 'Demons', 'NJ', '#CE1126', '#111111']] },
  { conf: 'Eastern', div: 'Metropolitan', eras: [[1972, NOW, 'New York', 'Anchors', 'NYA', '#00539B', '#F47D30']] },
  { conf: 'Eastern', div: 'Metropolitan', eras: [[1960, NOW, 'New York', 'Guardsmen', 'NYG', '#0038A8', '#CE1126']] },
  { conf: 'Eastern', div: 'Metropolitan', eras: [[1967, NOW, 'Philadelphia', 'Brawlers', 'PHI', '#F74902', '#111111']] },
  { conf: 'Eastern', div: 'Metropolitan', eras: [[1967, NOW, 'Pittsburgh', 'Ironbirds', 'PIT', '#111111', '#FCB514']] },
  { conf: 'Eastern', div: 'Metropolitan', eras: [[1974, NOW, 'Washington', 'Eagles', 'WSH', '#C8102E', '#041E42']] },
  // ---- Western / Central ----
  { conf: 'Western', div: 'Central', eras: [[1960, NOW, 'Chicago', 'Gales', 'CHI', '#CF0A2C', '#111111']] },
  { conf: 'Western', div: 'Central', eras: [[1979, 1994, 'Quebec', 'Northlanders', 'QUE', '#0050A0', '#FFFFFF'], [1995, NOW, 'Colorado', 'Rockslides', 'COL', '#6F263D', '#236192']] },
  { conf: 'Western', div: 'Central', eras: [[1967, 1992, 'Minnesota', 'Polaris', 'MNP', '#00843D', '#FFC72C'], [1993, NOW, 'Dallas', 'Rustlers', 'DAL', '#006847', '#8F8F8C']] },
  { conf: 'Western', div: 'Central', eras: [[2000, NOW, 'Minnesota', 'Northwoods', 'MIN', '#154734', '#A6192E']] },
  { conf: 'Western', div: 'Central', eras: [[1998, NOW, 'Nashville', 'Saberkats', 'NSH', '#FFB81C', '#041E42']] },
  { conf: 'Western', div: 'Central', eras: [[1967, NOW, 'St. Louis', 'Blue Notes', 'STL', '#002F87', '#FCB514']] },
  { conf: 'Western', div: 'Central', eras: [[1979, 1995, 'Winnipeg', 'Pilots', 'WPG', '#041E42', '#AC162C'], [1996, 2013, 'Phoenix', 'Desert Dogs', 'PHX', '#8C2633', '#E2D6B5'], [2014, 2023, 'Arizona', 'Desert Dogs', 'ARI', '#8C2633', '#E2D6B5'], [2024, NOW, 'Utah', 'Glaciers', 'UTA', '#69B3E7', '#111111']] },
  { conf: 'Western', div: 'Central', eras: [[1999, 2010, 'Atlanta', 'Firebirds', 'ATL', '#041E42', '#5C88DA'], [2011, NOW, 'Winnipeg', 'Pilots', 'WPG', '#041E42', '#7B8A9C']] },
  // ---- Western / Pacific ----
  { conf: 'Western', div: 'Pacific', eras: [[1993, 2005, 'Anaheim', 'Mallards', 'ANA', '#3A1F5D', '#00857C'], [2006, NOW, 'Anaheim', 'Mallards', 'ANA', '#F47A38', '#111111']] },
  { conf: 'Western', div: 'Pacific', eras: [[1972, 1979, 'Atlanta', 'Blaze', 'AFL', '#C8102E', '#F1BE48'], [1980, NOW, 'Calgary', 'Blaze', 'CGY', '#C8102E', '#F1BE48']] },
  { conf: 'Western', div: 'Pacific', eras: [[1979, NOW, 'Edmonton', 'Roughnecks', 'EDM', '#041E42', '#FF4C00']] },
  { conf: 'Western', div: 'Pacific', eras: [[1967, 1987, 'Los Angeles', 'Crowns', 'LA', '#5B2C83', '#FFC72C'], [1988, NOW, 'Los Angeles', 'Crowns', 'LA', '#111111', '#A2AAAD']] },
  { conf: 'Western', div: 'Pacific', eras: [[1991, NOW, 'San Jose', 'Stingrays', 'SJ', '#006D75', '#111111']] },
  { conf: 'Western', div: 'Pacific', eras: [[2021, NOW, 'Seattle', 'Leviathans', 'SEA', '#001628', '#99D9D9']] },
  { conf: 'Western', div: 'Pacific', eras: [[1970, NOW, 'Vancouver', 'Orcas', 'VAN', '#00205B', '#00843D']] },
  { conf: 'Western', div: 'Pacific', eras: [[2017, NOW, 'Vegas', 'Paladins', 'VGK', '#B4975A', '#333F42']] },
  // ---- Defunct ----
  { conf: null, div: null, defunct: 1978, note: 'Merged into the Minnesota Polaris in 1978', eras: [[1967, 1975, 'California', 'Sea Lions', 'CSL', '#006272', '#FFC72C'], [1976, 1977, 'Cleveland', 'Counts', 'CLE', '#C8102E', '#111111']] },
];
const N_CUR = 32;
const DEFUNCT_FID = 32;
const CONFS = ['Eastern', 'Western'];
const DIVS = { Eastern: ['Atlantic', 'Metropolitan'], Western: ['Central', 'Pacific'] };
function eraOf(fid, year) { const f = FRANCHISES[fid]; for (const e of f.eras) if (year >= e[0] && year <= e[1]) return e; return null; }
function franchiseActive(fid, year) { return !!eraOf(fid, year); }
function activeFids(year) { const out = []; FRANCHISES.forEach((f, i) => { if (eraOf(i, year)) out.push(i); }); return out; }
function franchiseFirst(fid) { return FRANCHISES[fid].eras[0][0]; }
// Season length by era (start year); 2004-05 was lost to a lockout.
function seasonGames(y) {
  if (y === 2004) return 0;
  if (y <= 1966) return 70; if (y <= 1969) return 74; if (y <= 1973) return 78; if (y <= 1991) return 80;
  if (y <= 1993) return 84; if (y === 1994 || y === 2012) return 48; if (y === 2019) return 70; if (y === 2020) return 56;
  return 82;
}
// League-wide goals per team per game by era.
function eraGF(y) {
  const pts = [[1960, 2.95], [1967, 3.0], [1972, 3.35], [1977, 3.45], [1981, 4.0], [1986, 3.85], [1992, 3.6], [1996, 2.95], [2000, 2.65], [2005, 3.05], [2009, 2.8], [2014, 2.7], [2018, 3.02], [2022, 3.15], [2026, 3.08]];
  if (y <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (y <= pts[i][0]) { const [a, va] = pts[i - 1], [b, vb] = pts[i]; return va + (vb - va) * (y - a) / (b - a); }
  return pts[pts.length - 1][1];
}
const eraTies = (y) => y <= 2003;          // tie games before the shootout
const eraOTL = (y) => y >= 1999;           // the loser point
const eraOT = (y) => y >= 1983;            // regular-season overtime
function playoffSize(nTeams) { return nTeams <= 6 ? 4 : nTeams <= 14 ? 8 : 16; }
const ROUND_NAMES = ['First Round', 'Second Round', 'Conference Final', "Stanley's Mug Final"];
function roundName(r, nRounds) { return ROUND_NAMES[4 - nRounds + r] || 'Round ' + (r + 1); }
