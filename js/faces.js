'use strict';
// ================= Procedural player portraits (BETA) =================
// Every player gets a pixel headshot built from his id: head shape, chin, eyes, brows, nose, mouth,
// facial hair, hair style and colour. Hair greys and recedes as he ages; his expression follows morale.
const Faces = (() => {
  const W = 32, H = 34, CX = 16, TOP = 5, ROWS = 23;
  const cache = {};
  const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e'];
  const OUTLINE = '#121212', LASH = '#1a1a1a', WHITE = '#f2f2f2';

  // ---------- helpers ----------
  function hash(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function pickW(r, items) { let tot = 0; for (const it of items) tot += it[1]; let x = r() * tot; for (const it of items) if ((x -= it[1]) < 0) return it[0]; return items[items.length - 1][0]; }
  const hex2 = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  function rgb(h) { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
  function mix(a, b, f) { const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => hex2(v + (B[i] - v) * f)).join(''); }
  function shade(c, f) { return f < 0 ? mix(c, '#000000', -f) : mix(c, '#ffffff', f); }

  // ---------- parts ----------
  // half-widths of the head for each of its 23 rows (forehead -> chin)
  const SHAPES = {
    oval:     [4, 6, 7, 8, 8, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 8, 8, 8, 7, 7, 6, 5, 4],
    round:    [5, 7, 8, 9, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 9, 9, 8, 7, 6, 5, 4],
    square:   [6, 8, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 8, 8, 7],
    oblong:   [4, 6, 7, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 7, 7, 6, 5, 4],
    heart:    [6, 8, 9, 10, 10, 10, 10, 10, 10, 10, 9, 9, 9, 9, 8, 8, 7, 7, 6, 5, 4, 3, 2],
    diamond:  [3, 5, 6, 7, 8, 8, 9, 9, 10, 10, 10, 10, 10, 9, 9, 8, 8, 7, 6, 5, 4, 3, 2],
    triangle: [5, 6, 7, 7, 8, 8, 8, 9, 9, 9, 9, 9, 10, 10, 10, 10, 10, 10, 10, 9, 8, 7, 6],
  };
  const CHINS = ['pointed', 'round', 'square', 'cleft', 'strong', 'narrow'];
  function headWidths(shape, chin) {
    const w = SHAPES[shape].slice();
    if (chin === 'strong') for (let r = 14; r <= 18; r++) w[r] += 1;
    const b = w[18];
    const tail = { pointed: [b - 1, b - 3, b - 5, b - 7], round: [b - 1, b - 2, b - 3, b - 5], square: [b, b - 1, b - 1, b - 2],
      cleft: [b, b - 1, b - 1, b - 2], strong: [b, b, b - 1, b - 2], narrow: [b - 2, b - 3, b - 4, b - 5] }[chin];
    for (let i = 0; i < 4; i++) w[19 + i] = Math.max(2, tail[i]);
    return w;
  }
  // left eye, 4 wide, inner corner on the right (mirrored for the right eye). K lash, W white, P iris, S lid shadow
  const EYES = {
    almond: ['.KKK', 'KWPW'], round: ['.KK.', 'WPPW'], narrow: ['KKKK', '.WP.'], hooded: ['SSSS', 'KWPK'],
    upturned: ['..KK', 'KWP.'], downturned: ['KKK.', '.WPW'], wide: ['KKKK', 'WWPW'], small: ['.KK.', '.PP.'],
  };
  // left brow, 4 wide, inner end on the right; last row sits just above the eye
  const BROWS = {
    thin: ['.BBB'], thick: ['.BBB', 'BBBB'], arched: ['.BB.', 'B..B'], flat: ['BBBB'],
    angled: ['BB..', '.BBB'], raised: ['..BB', 'BBB.'], bushy: ['BBBB', 'BBBB'],
  };
  // N nose shadow, D nostril
  const NOSES = {
    button: ['....', '.NN.', '.DD.'], straight: ['..N.', '..N.', '.DND'], wide: ['..N...', '..N...', 'DNNNND'],
    long: ['..N.', '..N.', '..N.', '.DND'], broad: ['.NN.', 'NNNN', 'DNND'], hooked: ['..N.', '...N', '.DND'], small: ['....', '..N.', '.DN.'],
  };
  // [rows, first row] - M lip, T teeth
  const MOUTHS = {
    grin: [['MTTTTM', '.MMMM.'], 16], smile: [['M..M', '.MM.'], 16], smirk: [['...M', 'MMM.'], 16],
    neutral: [['MMMM'], 17], flat: [['MMMMMM'], 17], frown: [['.MM.', 'M..M'], 17],
  };
  const FHAIR = [['none', 5], ['stubble', 3], ['goatee', 2], ['full', 2.5], ['mustache', 1], ['chinstrap', 1], ['soulpatch', 0.7], ['chops', 0.5]];
  const HAIR_COLORS = { black: '#1c1a19', dkbrown: '#3b2618', brown: '#5a3a22', ltbrown: '#8a5a32', dirty: '#b0864a', blond: '#dcbc66', red: '#a8431f', auburn: '#6e2a16' };
  const EYE_COLORS = { brown: '#4a2a12', dark: '#22140a', blue: '#3b6fb6', green: '#4d8a4a', hazel: '#7a6230' };

  // ---------- traits (deterministic per player) ----------
  function traits(p) {
    const r = rng(hash((p.faceSeed !== undefined ? p.faceSeed : p.id) + '|' + (p.fn || '') + (p.ln || '')));
    const skin = Math.max(0, Math.min(4, p.skin || 0));
    const light = skin <= 1;
    const t = {
      skin,
      shape: pickW(r, [['oval', 3], ['round', 2], ['square', 3], ['oblong', 2], ['heart', 1.2], ['diamond', 1.2], ['triangle', 1.5]]),
      chin: pickW(r, CHINS.map(c => [c, c === 'cleft' ? 0.6 : 1])),
      eyes: pickW(r, Object.keys(EYES).map(k => [k, 1])),
      gap: pickW(r, [[1, 1], [2, 3], [3, 1]]),
      brows: pickW(r, Object.keys(BROWS).map(k => [k, 1])),
      uni: r() < 0.05,
      nose: pickW(r, Object.keys(NOSES).map(k => [k, 1])),
      mouth: pickW(r, [['neutral', 3], ['smirk', 1.5], ['flat', 1.5]]),
      fhair: pickW(r, FHAIR),
      hair: pickW(r, light
        ? [['crew', 3], ['short', 3], ['buzz', 2], ['long', 1.2], ['mullet', 0.7], ['flattop', 0.5], ['mohawk', 0.4], ['curly', 1], ['bald', 0.5], ['locs', 0.3]]
        : [['buzz', 3], ['crew', 1.5], ['afro', 1.2], ['locs', 1.5], ['cornrows', 1], ['hightop', 0.8], ['curly', 1.5], ['bald', 1], ['mohawk', 0.5], ['short', 0.7], ['long', 0.3]]),
      hairCol: pickW(r, skin === 0 ? [['black', 2], ['dkbrown', 4], ['brown', 4], ['ltbrown', 3], ['dirty', 2], ['blond', 2], ['red', 1], ['auburn', 1]]
        : skin === 1 ? [['black', 4], ['dkbrown', 4], ['brown', 3], ['ltbrown', 1], ['auburn', 0.5]] : [['black', 8], ['dkbrown', 3], ['brown', 0.5]]),
      eyeCol: pickW(r, skin === 0 ? [['brown', 5], ['blue', 3], ['green', 1.5], ['hazel', 1.5]] : skin === 1 ? [['brown', 7], ['hazel', 2], ['green', 0.5]] : [['brown', 3], ['dark', 3]]),
      grayRoll: r(), recedeRoll: r(), stacheCurl: r() < 0.4,
    };
    // age: greying and a receding hairline creep in through the 30s
    const age = p.age || 25;
    t.gray = t.grayRoll < (age - 30) * 0.07 ? (age >= 36 && t.grayRoll < (age - 35) * 0.08 ? 'white' : 'gray') : null;
    if (t.recedeRoll < (age - 29) * 0.045 && ['crew', 'short', 'long', 'curly', 'mullet'].includes(t.hair)) t.hair = 'receding';
    return t;
  }
  // morale shows on his face
  function moodMouth(p, t) {
    const m = typeof mor === 'function' && p.tid >= 0 ? mor(p) : 60;
    return m >= 80 ? 'grin' : m >= 66 ? 'smile' : m >= 45 ? t.mouth : m >= 30 ? 'neutral' : 'frown';
  }

  // ---------- render ----------
  function render(p, team, mouth) {
    const t = traits(p);
    const g = Array.from({ length: H }, () => new Array(W).fill(null));
    const set = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H && c) g[y][x] = c; };
    const hw = headWidths(t.shape, t.chin);
    const inHead = (x, y) => { const r = y - TOP; return r >= 0 && r < ROWS && x >= CX - hw[r] && x <= CX + hw[r] - 1; };
    const edge = (x, y) => hw[y - TOP] - Math.abs(x - (CX - 0.5)) - 0.5; // 0 at the outermost face pixel
    const skin = SKINS[t.skin], skinD = shade(skin, -0.12), skinDD = shade(skin, -0.22);
    const baseHair = t.gray === 'white' ? '#e4e4e4' : t.gray === 'gray' ? mix(HAIR_COLORS[t.hairCol], '#a8a8a8', 0.65) : HAIR_COLORS[t.hairCol];
    const hair = baseHair, hairD = shade(hair, -0.28), hairL = shade(hair, 0.18);
    const c1 = team ? team.c1 : '#5a5f6a', c2 = team ? team.c2 : '#c8c8c8';
    const maxHw = Math.max(...hw);

    // shoulders + jersey
    for (let y = TOP + 24; y < H; y++) { const sw = Math.min(16, 9 + (y - TOP - 24) * 2); for (let x = CX - sw; x < CX + sw; x++) set(x, y, x >= CX + sw - 3 ? shade(c1, -0.2) : c1); }
    for (let y = TOP + 18; y <= TOP + 25; y++) for (let x = CX - 4; x < CX + 4; x++) set(x, y, shade(skin, -0.18));
    for (let x = CX - 5; x < CX + 5; x++) set(x, TOP + 24, c2);
    for (let x = CX - 5; x < CX + 5; x++) if (x < CX - 2 || x > CX + 1) set(x, TOP + 25, c2);
    set(CX - 2, TOP + 26, c2); set(CX + 1, TOP + 26, c2); set(CX - 1, TOP + 27, c2); set(CX, TOP + 27, c2);
    set(CX - 1, TOP + 26, shade(skin, -0.25)); set(CX, TOP + 26, shade(skin, -0.25));

    // hair behind the head
    const tex = (x, y) => ((x * 3 + y * 5) % 4 === 0 ? hairD : hair);
    if (t.hair === 'afro') {
      const rx = maxHw + 3.5, ry = 11, cy = TOP + 6;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x - CX + 0.5) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 && y <= TOP + 15) set(x, y, tex(x, y));
    } else if (t.hair === 'long' || t.hair === 'locs') {
      const bot = t.hair === 'long' ? TOP + 23 : TOP + 20, sw = maxHw + 2;
      for (let y = TOP - 2; y <= bot; y++) {
        const k = y < TOP + 4 ? sw - Math.ceil((TOP + 4 - y) * 0.9) : sw;
        for (let x = CX - k; x < CX + k; x++) set(x, y, t.hair === 'locs' ? (x % 2 ? hairD : hair) : (x === CX - k || x === CX + k - 1 ? hairD : hair));
      }
    } else if (t.hair === 'mullet') {
      for (let y = TOP + 10; y <= TOP + 25; y++) { const k = hw[Math.min(14, y - TOP)] + 1; for (let x = CX - k; x < CX + k; x++) set(x, y, y > TOP + 20 ? hairD : hair); }
    } else if (t.hair === 'flattop' || t.hair === 'hightop') {
      const top = t.hair === 'hightop' ? TOP - 5 : TOP - 4, k = hw[3] + (t.hair === 'hightop' ? 0 : 1);
      for (let y = top; y < TOP + 3; y++) for (let x = CX - k; x < CX + k; x++) {
        if (t.hair === 'hightop' && y === top && (x === CX - k || x === CX + k - 1)) continue;
        set(x, y, t.hair === 'hightop' ? tex(x, y) : (y === top ? hairL : hair));
      }
    } else if (t.hair === 'curly') {
      for (let y = TOP - 2; y < TOP + 1; y++) { const k = hw[0] + 2 - (y === TOP - 2 ? 1 : 0); for (let x = CX - k; x < CX + k; x++) if (!(y === TOP - 2 && x % 3 === 0)) set(x, y, tex(x, y)); }
    } else if (t.hair === 'mohawk') {
      for (let y = TOP - 5; y < TOP; y++) for (let x = CX - 2; x < CX + 2; x++) set(x, y, x === CX - 2 ? hairL : hair);
    } else if (['crew', 'short', 'cornrows'].includes(t.hair)) {
      const k = hw[0] + (t.hair === 'short' ? 1 : 0); for (let x = CX - k; x < CX + k; x++) set(x, TOP - 1, hair);
    }

    // ears
    for (let r = 9; r <= 13; r++) { const y = TOP + r; set(CX - hw[r] - 1, y, skinD); set(CX + hw[r], y, skinD); }
    set(CX - hw[11] - 1, TOP + 11, skinDD); set(CX + hw[11], TOP + 11, skinDD);
    // head
    for (let r = 0; r < ROWS; r++) for (let x = CX - hw[r]; x < CX + hw[r]; x++) set(x, TOP + r, x >= CX + hw[r] - 2 ? skinD : skin);
    if (t.chin === 'cleft') set(CX, TOP + 21, skinDD);
    // cheekbone shadow for strong / diamond faces
    if (t.shape === 'diamond' || t.chin === 'strong') for (const s of [-1, 1]) set(s < 0 ? CX - hw[14] + 1 : CX + hw[14] - 2, TOP + 14, skinD);

    // facial hair (only on the face)
    const fh = hair;
    const fset = (x, y, c) => { if (inHead(x, y)) set(x, y, c); };
    const stub = mix(skin, fh, 0.38);
    for (let y = TOP; y < TOP + ROWS; y++) for (let x = 0; x < W; x++) {
      if (!inHead(x, y)) continue;
      const r = y - TOP, e = edge(x, y), ax = Math.abs(x - (CX - 0.5));
      let on = false, col = fh;
      switch (t.fhair) {
        case 'stubble': on = (r >= 16 || (r >= 12 && e <= 1.5)) && (x + y) % 2 === 0; col = stub; break;
        case 'full': on = r >= 16 || (r >= 9 && e <= 1.5) || (r === 15 && ax < 4); col = (x + y) % 3 === 0 ? shade(fh, -0.2) : fh; break;
        case 'goatee': on = (r === 15 && ax < 4) || (r >= 18 && ax < 3); break;
        case 'mustache': on = (r === 15 && ax < 4) || (t.stacheCurl && r === 16 && ax >= 2.5 && ax < 4); break;
        case 'chinstrap': on = (r >= 11 && e <= 0.5) || r >= 21; break;
        case 'soulpatch': on = r === 19 && ax < 1; break;
        case 'chops': on = r >= 9 && r <= 18 && e <= 1.5; break;
      }
      if (on) fset(x, y, col);
    }

    // nose
    const nose = NOSES[t.nose], nx = CX - nose[0].length / 2;
    nose.forEach((row, i) => [...row].forEach((ch, j) => { if (ch !== '.') set(nx + j, TOP + 12 + i, ch === 'D' ? shade(skin, -0.45) : skinDD); }));
    // mouth
    const [mRows, mRow] = MOUTHS[mouth], mx = CX - mRows[0].length / 2, lip = shade(skin, -0.42);
    mRows.forEach((row, i) => [...row].forEach((ch, j) => { if (ch !== '.') set(mx + j, TOP + mRow + i, ch === 'T' ? WHITE : lip); }));
    // eyes
    const eye = EYES[t.eyes], iris = EYE_COLORS[t.eyeCol];
    const eyeCol = (ch) => ch === 'K' ? LASH : ch === 'W' ? WHITE : ch === 'P' ? iris : ch === 'S' ? skinDD : null;
    eye.forEach((row, i) => [...row].forEach((ch, j) => { const c = eyeCol(ch); if (!c) return; set(CX - t.gap - 4 + j, TOP + 10 + i, c); set(CX + t.gap + 3 - j, TOP + 10 + i, c); }));
    // brows
    const brow = BROWS[t.brows], bcol = t.hair === 'bald' && !t.gray ? shade(HAIR_COLORS[t.hairCol], -0.1) : shade(hair, -0.1), b0 = 10 - brow.length;
    brow.forEach((row, i) => [...row].forEach((ch, j) => { if (ch === 'B') { set(CX - t.gap - 4 + j, TOP + b0 + i, bcol); set(CX + t.gap + 3 - j, TOP + b0 + i, bcol); } }));
    if (t.uni) for (let x = CX - t.gap; x < CX + t.gap; x++) set(x, TOP + 9, bcol);

    // hair on the head
    const fade = (x, y) => ((x + y) % 2 ? hair : mix(hair, skin, 0.55));
    for (let y = TOP; y < TOP + 12; y++) for (let x = 0; x < W; x++) {
      if (!inHead(x, y)) continue;
      const r = y - TOP, e = edge(x, y), ax = Math.abs(x - (CX - 0.5));
      let c = null;
      switch (t.hair) {
        case 'buzz': if (r <= 3 || (r <= 8 && e <= 1)) c = fade(x, y); break;
        case 'crew': if (r <= 3 || (r <= 8 && e <= 1)) c = r === 0 && ax < 3 ? hairL : hair; break;
        case 'short': if (r <= 4 || (r === 5 && x < CX - 1) || (r <= 9 && e <= 1)) c = r === 1 && x === CX + 2 ? hairD : hair; break;
        case 'cornrows': if (r <= 4 || (r <= 9 && e <= 1)) c = x % 2 ? hairD : hair; break;
        case 'afro': case 'hightop': case 'curly': if (r <= 3 || (r <= 8 && e <= 1)) c = t.hair === 'afro' ? tex(x, y) : r <= 2 ? tex(x, y) : fade(x, y); break;
        case 'flattop': if (r <= 2) c = hair; else if (r <= 8 && e <= 1) c = fade(x, y); break;
        case 'mohawk': if (ax < 2 && r <= 4) c = hair; else if (r <= 3 && (x + y) % 3 === 0) c = mix(hair, skin, 0.6); break;
        case 'long': if (r <= 3 || (r <= 14 && e <= 1.5)) c = ax < 1 && r <= 3 ? hairD : hair; break;
        case 'locs': if (r <= 3 || (r <= 12 && e <= 1.5)) c = x % 2 ? hairD : hair; break;
        case 'mullet': if (r <= 3 || (r <= 9 && e <= 1)) c = hair; break;
        case 'receding': if (r >= 2 && r <= 9 && e <= (r <= 4 ? 2.5 : 1)) c = hair; else if (r <= 1 && (x + y) % 3 === 0) c = mix(hair, skin, 0.7); break;
        case 'bald': if (r === 1 && x >= CX - 4 && x <= CX - 3) c = shade(skin, 0.3); break;
      }
      if (c) set(x, y, c);
    }
    if (t.hair === 'long' || t.hair === 'locs') for (let y = TOP + 9; y <= TOP + 14; y++) { set(CX - hw[y - TOP] - 1, y, hair); set(CX + hw[y - TOP], y, hair); }

    // 1px outline around everything
    const out = g.map(row => row.slice());
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (g[y][x]) continue;
      if ((y > 0 && g[y - 1][x]) || (y < H - 1 && g[y + 1][x]) || (x > 0 && g[y][x - 1]) || (x < W - 1 && g[y][x + 1])) out[y][x] = OUTLINE;
    }
    return out;
  }

  function toCanvas(grid, scale) {
    const cv = document.createElement('canvas'); cv.width = W * scale; cv.height = H * scale;
    const ctx = cv.getContext('2d');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grid[y][x]) { ctx.fillStyle = grid[y][x]; ctx.fillRect(x * scale, y * scale, scale, scale); }
    return cv;
  }
  function portrait(p, team, scale) {
    scale = scale || 3;
    const t = traits(p), mouth = moodMouth(p, t);
    const key = [p.id, p.faceSeed, p.skin, t.gray, t.hair, mouth, team ? team.abbr : '-', scale].join('|');
    if (cache[key]) return cache[key];
    return (cache[key] = toCanvas(render(p, team, mouth), scale).toDataURL());
  }
  function describe(p) { const t = traits(p); return `${t.shape} face, ${t.chin} chin, ${t.eyes} eyes, ${t.brows} brows, ${t.nose} nose, ${t.fhair === 'none' ? 'clean-shaven' : t.fhair}, ${t.hair} ${t.gray || t.hairCol} hair`; }
  return { portrait, traits, describe, render, W, H };
})();
