/* birchdesign: "Las, który wyrasta". Animowany las brzozowy na canvasie (hero strony i ekran logowania panelu).
   Pnie są rysowane raz jako sprite'y (kora, znaczki, gałęzie z liśćmi), potem tylko przesuwane i lekko kołysane.
   Wejście: pnie wyrastają od dołu (najpierw daleki plan), potem delikatny ruch: mgła, promienie, pyłki, liście.
   Parametr ?still w adresie rysuje od razu kadr końcowy (do zrzutu / zdjęcia zastępczego). */
(() => {
  'use strict';
  const cv = document.getElementById('forest');
  if (!cv || !cv.getContext) return;
  const host = cv.parentElement;
  const ctx = cv.getContext('2d', { alpha: false });
  const _m = location.search.match(/[?&]still(?:=([\d.]+))?/);
  const STILL = !!_m, STILL_T = _m && _m[1] ? parseFloat(_m[1]) : 99;
  const FULL = STILL && STILL_T >= 99;
  const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => 1 - Math.pow(1 - clamp(t), 3);
  const rngMaker = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  const MIST = [226, 233, 222];            // kolor mgły (szałwia, jasna)
  const LEAF = ['#b0521d', '#c8742f', '#d99a45', '#e3b25a', '#a24a1a', '#cf8a3a'];
  const canFilter = 'filter' in ctx;

  let W = 0, H = 0, DPR = 1, U = 1;
  let trunks = [], layers = [], mistA, mistB, rays, parts = [], t0 = 0, raf = 0, visible = true, started = false;
  let mx = 0, my = 0, tmx = 0, tmy = 0, scrollP = 0;
  const HX = wide => wide ? 0.655 : 0.62;           // pozycja głównej brzozy (ułamek szerokości)
  const TREE = cv.dataset.tree === '1';          // hero: jedna brzoza wyrasta na oczach
  const TS = TREE ? 4.3 : 0;                      // las wokół zaczyna rosnąć dopiero, gdy drzewo jest wysokie
  let tree = null, gust = 0, curX = -999, curY = -999, falling = [], lastT = 0;
  const PIN = document.getElementById('heroPin');
  const SCROLL = TREE && cv.dataset.scroll === '1' && !!PIN && window.matchMedia('(min-width: 901px)').matches && !calm;   // wzrost steruje przewijanie
  const TG_MAX = 8.3, AUTO_G = 0.28;       // pełny czas wzrostu (s); od tego ułamka drzewo samo urośnie na starcie
  let Gs = 0, lastG = -1, lastRt = 0, BARK = null, GRAIN = null, grass = null, orbs = [];
  let LOW = false, ftSum = 0, ftN = 0, lastNow = 0;   // tryb oszczędny włącza się sam, gdy komputer nie wyrabia

  /* ---------- tekstury (kora, ziarno filmu) ---------- */
  function makeBark() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 512; const g = c.getContext('2d'), im = g.createImageData(128, 512), rr = rngMaker(5); let row = 0.5;
    for (let y = 0; y < 512; y++) { row = row * 0.72 + rr() * 0.28; for (let x = 0; x < 128; x++) { const n = rr(); const v = 255 - (row * 58 + n * 42 + (n > 0.975 ? 55 : 0)), i = (y * 128 + x) * 4; im.data[i] = v; im.data[i + 1] = v; im.data[i + 2] = v - 5; im.data[i + 3] = 255; } }
    g.putImageData(im, 0, 0); return c;
  }
  function makeGrain() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d'), im = g.createImageData(256, 256), rr = rngMaker(77);
    for (let i = 0; i < 256 * 256; i++) { const v = 128 + (rr() - 0.5) * 150; im.data[i * 4] = v; im.data[i * 4 + 1] = v; im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0); return c;
  }
  BARK = makeBark(); GRAIN = makeGrain();

  /* ---------- sprite pnia ---------- */
  function makeTrunk(w, h, rnd, o) {
    const pad = Math.ceil(o.pad || w * 1.6);
    const cw = Math.ceil(w + pad * 2), ch = Math.ceil(h + pad * 0.4);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    const cx0 = cw / 2, top = pad * 0.2, hh = h;
    const ph = rnd() * 6.28, lean = (rnd() - 0.5) * w * 0.35, sw = w * (0.05 + rnd() * 0.12), fq = 0.0026 + rnd() * 0.0025;
    const cxAt = y => cx0 + Math.sin(y * fq + ph) * sw + lean * (y / hh - 1);
    const wAt = y => w * (0.82 + 0.18 * (y / hh));
    const L = [], R = [];
    for (let y = 0; y <= hh + 1; y += 5) { const cx = cxAt(y), ww = wAt(y) * (1 + (rnd() - 0.5) * 0.012); L.push([cx - ww / 2, top + y]); R.push([cx + ww / 2, top + y]); }
    const outline = () => { g.beginPath(); L.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]); g.closePath(); };

    // gałęzie z liśćmi (za pniem)
    const branches = [];
    if (o.leaves) {
      const nb = o.leaves;
      for (let i = 0; i < nb; i++) {
        const y = hh * (0.13 + rnd() * 0.46), side = o.sides ? o.sides[(rnd() * o.sides.length) | 0] : (rnd() < 0.5 ? -1 : 1), len = h * (0.07 + rnd() * 0.15), ang = (0.45 + rnd() * 0.8);
        branches.push({ y, side, len, ang, k: (rnd() - 0.5) * 0.5 });
      }
    }
    const drawLeaf = (x, y, s, rot) => {
      g.save(); g.translate(x, y); g.rotate(rot);
      g.globalAlpha = 0.55 + rnd() * 0.45; g.fillStyle = LEAF[(rnd() * LEAF.length) | 0];
      g.beginPath(); g.ellipse(0, 0, s, s * 0.55, 0, 0, 6.283); g.fill(); g.restore(); g.globalAlpha = 1;
    };
    branches.forEach(b => {
      const x0 = cxAt(b.y) + b.side * wAt(b.y) * 0.35, y0 = top + b.y;
      const ex = x0 + b.side * b.len * (0.75 + b.ang * 0.3), ey = y0 - b.len * (0.12 + b.k * 0.3);
      const cx1 = x0 + b.side * b.len * 0.3, cy1 = y0 - b.len * (0.85 + b.ang * 0.2);
      const pt = t => ({ x: (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx1 + t * t * ex, y: (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy1 + t * t * ey });
      g.strokeStyle = o.dark ? '#2a2822' : '#3a372f'; g.lineCap = 'round';
      const segs = 8;
      for (let k = 0; k < segs; k++) {
        const p1 = pt(k / segs), p2 = pt((k + 1) / segs);
        g.lineWidth = Math.max(1, w * 0.05 * (1 - k / segs * 0.75));
        g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.stroke();
      }
      const n = 12 + ((rnd() * 10) | 0);
      for (let k = 0; k < n; k++) {
        const q = pt(0.3 + rnd() * 0.7);
        drawLeaf(q.x + (rnd() - 0.5) * w * 0.55, q.y + rnd() * w * 0.55, w * (0.12 + rnd() * 0.17) * o.leafK, rnd() * 3.14);
      }
      // cienkie witki zwisające z końców
      for (let k = 0; k < 3; k++) {
        const q = pt(0.55 + rnd() * 0.45), len = h * (0.025 + rnd() * 0.05);
        g.strokeStyle = 'rgba(40,38,30,.5)'; g.lineWidth = Math.max(1, w * 0.016);
        g.beginPath(); g.moveTo(q.x, q.y); g.quadraticCurveTo(q.x + b.side * len * 0.12, q.y + len * 0.5, q.x + b.side * len * 0.06, q.y + len); g.stroke();
        for (let m = 0; m < 4; m++) drawLeaf(q.x + b.side * len * 0.07 + (rnd() - 0.5) * w * 0.2, q.y + len * (0.3 + m * 0.2), w * (0.1 + rnd() * 0.07) * o.leafK, rnd() * 3.14);
      }
    });

    // korpus: walec z cieniowaniem
    const x0 = cx0 - w * 0.6, x1 = cx0 + w * 0.6;
    const gr = g.createLinearGradient(x0, 0, x1, 0);
    gr.addColorStop(0.00, '#a8a897'); gr.addColorStop(0.12, '#efede2'); gr.addColorStop(0.32, '#faf8f0');
    gr.addColorStop(0.58, '#e6e3d6'); gr.addColorStop(0.82, '#bcbaa9'); gr.addColorStop(1.00, '#8b8d7e');
    outline(); g.fillStyle = gr; g.fill();

    g.save(); outline(); g.clip();
    // włókna
    for (let i = 0; i < 9; i++) {
      const off = (rnd() - 0.5) * 0.9; g.strokeStyle = `rgba(70,70,58,${0.05 + rnd() * 0.08})`; g.lineWidth = Math.max(1, w * 0.012);
      g.beginPath(); for (let y = 0; y <= hh; y += 20) { const x = cxAt(y) + off * wAt(y) * 0.5 + Math.sin(y * 0.02 + i) * w * 0.01; y ? g.lineTo(x, top + y) : g.moveTo(x, top + y); } g.stroke();
    }
    // sęki i ciemniejsze pasy
    const nodes = 4 + ((rnd() * 3) | 0);
    for (let i = 0; i < nodes; i++) {
      const y = hh * (0.05 + (i + rnd() * 0.6) / nodes * 0.92), th = w * (0.16 + rnd() * 0.3);
      const gg = g.createLinearGradient(0, top + y - th, 0, top + y + th);
      gg.addColorStop(0, 'rgba(60,58,48,0)'); gg.addColorStop(0.5, `rgba(60,58,48,${0.16 + rnd() * 0.2})`); gg.addColorStop(1, 'rgba(60,58,48,0)');
      g.fillStyle = gg; g.fillRect(cx0 - w, top + y - th, w * 2, th * 2);
    }
    // czarne znaczki (przetchlinki): szersze w środku, zwężone przy krawędzi
    const dens = o.dens || 1;
    for (let y = hh * 0.015; y < hh; y += (12 + rnd() * 40) / dens) {
      const cxp = cxAt(y), ww = wAt(y), n = rnd() < 0.3 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const dx = (rnd() - 0.5) * ww * 0.78, edge = Math.abs(dx) / (ww / 2);
        const len = ww * (0.16 + rnd() * 0.42) * (1 - edge * edge * 0.55), th = Math.max(1.3, w * (0.025 + rnd() * 0.075));
        g.fillStyle = `rgba(24,26,21,${0.58 + rnd() * 0.36})`;
        g.beginPath(); g.ellipse(cxp + dx, top + y + k * th * 2.2, len / 2, th / 2, (rnd() - 0.5) * 0.12, 0, 6.283); g.fill();
      }
    }
    // faktura kory (szum), jak na zdjęciu
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.42; g.fillStyle = g.createPattern(BARK, 'repeat'); g.fillRect(0, 0, cw, ch); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    // podstawa: ciemniejsza i bardziej chropowata
    const gb = g.createLinearGradient(0, top + hh * 0.84, 0, top + hh);
    gb.addColorStop(0, 'rgba(34,34,28,0)'); gb.addColorStop(1, 'rgba(34,34,28,.62)');
    g.fillStyle = gb; g.fillRect(cx0 - w, top + hh * 0.84, w * 2, hh * 0.16 + 2);
    g.restore();

    // rozmycie i zblednięcie we mgle (perspektywa powietrzna)
    let out = c;
    if (o.mist) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(${MIST[0]},${MIST[1]},${MIST[2]},${o.mist})`; g.fillRect(0, 0, cw, ch); g.globalCompositeOperation = 'source-over'; }
    if (o.blur && canFilter) {
      const b = document.createElement('canvas'); b.width = cw; b.height = ch; const bg = b.getContext('2d');
      bg.filter = `blur(${o.blur}px)`; bg.drawImage(c, 0, 0); out = b;
    }
    return { img: out, w: cw, h: ch, cx: cx0, top, hh, base: top + hh };
  }

  /* ---------- scena ---------- */
  function build() {
    DPR = Math.min(window.devicePixelRatio || 1, LOW ? 1 : 1.5);
    const r = host.getBoundingClientRect();
    W = Math.max(320, Math.round(r.width)); H = Math.max(320, Math.round(r.height));
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.fillStyle = '#c3cebe'; ctx.fillRect(0, 0, cv.width, cv.height);   // bez czarnego mignięcia przed pierwszą klatką
    U = Math.min(H, W * 1.15);
    const rnd = rngMaker(7);
    const wide = W / H > 1.15;
    const X = a => wide ? a : lerp(0.15, 0.95, a);
    layers = [
      { name: 'far', par: 10, scl: 0.05, items: [] },
      { name: 'mid', par: 26, scl: 0.14, items: [] },
      { name: 'near', par: 62, scl: 0.28, items: [] }
    ];
    const far = [0.03, 0.12, 0.2, 0.3, 0.38, 0.47, 0.55, 0.63, 0.71, 0.8, 0.88, 0.96];
    far.forEach((x, i) => {
      if (!wide && i % 2) return;   // na wąskim ekranie rzadszy las
      if (TREE && Math.abs(X(x) - HX(wide)) < 0.075) return;   // wokół głównej brzozy zostaje miejsce
      const w = U * (0.013 + rnd() * 0.012);
      layers[0].items.push({ x: X(x) + (rnd() - 0.5) * 0.02, w, h: H * 1.18, spr: makeTrunk(w * DPR, H * 1.18 * DPR, rnd, { blur: 2.4 * DPR, mist: x < 0.42 ? 0.66 : 0.5, dens: 1.4, leaves: 0, leafK: 1, pad: w * DPR * 1.4 }), t0: TS + i * 0.07, dur: 1.9 });
    });
    const mid = [0.4, 0.5, 0.6, 0.69, 0.78, 0.87, 0.95];
    mid.forEach((x, i) => {
      if (!wide && i % 2) return;
      if (TREE && Math.abs(X(x) - HX(wide)) < 0.085) return;
      const w = U * (0.034 + rnd() * 0.02);
      layers[1].items.push({ x: X(x) + (rnd() - 0.5) * 0.02, w, h: H * 1.2, spr: makeTrunk(w * DPR, H * 1.2 * DPR, rnd, { blur: 0.7 * DPR, mist: 0.18, dens: 1, leaves: 3, leafK: 0.9, pad: U * 0.13 * DPR, sides: x < 0.55 ? [1] : null }), t0: TS + 0.35 + i * 0.12, dur: 2.2 });
    });
    const near = [{ x: 0.89, w: 0.1 }, { x: 1.02, w: 0.15 }, { x: 0.012, w: 0.12 }];
    near.forEach((n, i) => {
      const w = U * n.w * (wide ? 1 : 0.8);
      layers[2].items.push({ x: n.x, w, h: H * 1.25, spr: makeTrunk(w * DPR, H * 1.25 * DPR, rnd, { blur: i === 1 ? 3.2 * DPR : 0, mist: 0, dens: 0.85, leaves: 4, leafK: 0.72, pad: U * 0.2 * DPR, dark: true, sides: n.x < 0.5 ? [-1] : null }), t0: TS + 0.9 + i * 0.22, dur: 2.5 });
    });
    // mgła: dwie pozioma tekstury z miękkich plam
    const mk = (seed, alpha) => {
      const c = document.createElement('canvas'); c.width = Math.round(W * 1.7 * DPR); c.height = Math.round(H * DPR); const g = c.getContext('2d'); const rr = rngMaker(seed);
      for (let i = 0; i < 16; i++) {
        const x = rr() * c.width, y = c.height * (0.25 + rr() * 0.7), rad = c.height * (0.2 + rr() * 0.3);
        const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${MIST[0]},${MIST[1]},${MIST[2]},${alpha})`); gr.addColorStop(1, `rgba(${MIST[0]},${MIST[1]},${MIST[2]},0)`);
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      return c;
    };
    mistA = mk(11, 0.34); mistB = mk(23, 0.3);
    // promienie słońca
    rays = document.createElement('canvas'); rays.width = Math.round(W * DPR); rays.height = Math.round(H * DPR);
    const g = rays.getContext('2d'), sx = rays.width * 0.8, sy = -rays.height * 0.1;
    for (let i = 0; i < 9; i++) {
      const a = 1.78 + i * 0.075 + rnd() * 0.03, wd = 0.02 + rnd() * 0.035, len = rays.height * 1.7;
      const gr = g.createLinearGradient(sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len);
      gr.addColorStop(0, 'rgba(255,248,225,.5)'); gr.addColorStop(0.7, 'rgba(255,248,225,.12)'); gr.addColorStop(1, 'rgba(255,248,225,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.cos(a - wd) * len, sy + Math.sin(a - wd) * len); g.lineTo(sx + Math.cos(a + wd) * len, sy + Math.sin(a + wd) * len); g.closePath(); g.fill();
    }
    // pyłki i liście
    const pr = rngMaker(99); parts = [];
    tree = TREE ? buildTree() : null;
    buildExtras();
    for (let i = 0; i < 46; i++) parts.push({ x: pr() * W, y: pr() * H, r: 0.8 + pr() * 2.2, v: 3 + pr() * 7, a: 0.25 + pr() * 0.5, ph: pr() * 6.28, leaf: false });
    for (let i = 0; i < 11; i++) parts.push({ x: pr() * W, y: pr() * H, r: 5 + pr() * 6, v: 14 + pr() * 14, a: 0.9, ph: pr() * 6.28, leaf: true, col: LEAF[(pr() * LEAF.length) | 0], rot: pr() * 6.28, spin: (pr() - 0.5) * 1.4 });
  }

  /* ---------- główna brzoza: rysowana na żywo, rośnie od pędu do korony ---------- */
  const easeIO = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const easeBack = x => { x = clamp(x); const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const TRUNK_T0 = 0.5, TRUNK_DUR = 4.6;
  const trunkAt = t => { const x = clamp((t - TRUNK_T0) / TRUNK_DUR); return 1 - Math.pow(1 - x, 1.7); };
  const timeAt = a => { let lo = TRUNK_T0, hi = TRUNK_T0 + TRUNK_DUR; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (trunkAt(m) < a) lo = m; else hi = m; } return hi; };
  const bez = (p0, p1, p2, t) => { const u = 1 - t; return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]; };

  function buildTree() {
    const rnd = rngMaker(31), wide = W / H > 1.15, small = W < 700;
    const xb = HX(wide) * W, yb = H * 1.01, Ht = H * (wide ? 0.95 : 0.82), wB = U * (wide ? 0.072 : 0.09);
    const ph = rnd() * 6.28, sw = wB * 0.2, fq = 0.0031, lean = wB * 1.1 * (rnd() < 0.5 ? -1 : 1) * (wide ? 1 : 0.6);
    const N = 72, pts = [];
    for (let i = 0; i <= N; i++) {
      const f = i / N, flare = 1 + 0.45 * Math.pow(Math.max(0, 1 - f / 0.07), 2);
      pts.push({ f, x: xb + Math.sin(f * Ht * fq + ph) * sw + lean * f * f, y: yb - f * Ht, w: wB * (1 - 0.56 * f) * flare });
    }
    const at = f => { const i = Math.min(N - 1, Math.floor(f * N)), k = f * N - i, a = pts[i], b = pts[i + 1]; return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k) }; };
    // znaczki, sęki, włókna
    const marks = []; for (let f = 0.025; f < 1; f += (0.006 + rnd() * 0.02)) { const n = rnd() < 0.3 ? 2 : 1; for (let k = 0; k < n; k++) marks.push({ f: f + k * 0.004, dx: (rnd() - 0.5) * 0.8, len: 0.16 + rnd() * 0.44, th: 0.03 + rnd() * 0.075, a: 0.58 + rnd() * 0.36 }); }
    const nodes = []; for (let i = 0; i < 6; i++) nodes.push({ f: 0.08 + (i + rnd() * 0.6) / 6 * 0.9, a: 0.14 + rnd() * 0.2 });
    const fibers = []; for (let i = 0; i < 8; i++) fibers.push({ o: (rnd() - 0.5) * 0.85, a: 0.05 + rnd() * 0.08 });
    // gałęzie
    const nb = small ? 10 : 15, branches = [];
    for (let k = 0; k < nb; k++) {
      const a = 0.27 + (k / (nb - 1)) * 0.66 + (rnd() - 0.5) * 0.025, side = (k % 2 ? 1 : -1) * (rnd() < 0.12 ? -1 : 1);
      const len = U * (0.3 - 0.17 * a) * (0.82 + rnd() * 0.4), ang = 0.5 + rnd() * 0.55, droop = 0.35 + rnd() * 0.65, ph2 = rnd() * 6.28;
      const br = { a, side, len, ang, droop, ph: ph2, ts: timeAt(a) + 0.05, dur: 1.9 + rnd() * 0.8, twigs: [], leaves: [] };
      const nt = small ? 2 : 3;
      for (let j = 0; j < nt; j++) {
        const s0 = 0.34 + (j + rnd() * 0.5) / nt * 0.55, sd = rnd() < 0.5 ? -1 : 1;
        const tw = { s0, side: side * (rnd() < 0.7 ? 1 : -1) * sd * (rnd() < 0.3 ? -1 : 1), len: len * (0.28 + rnd() * 0.22), droop: 0.5 + rnd() * 0.5, ph: rnd() * 6.28, leaves: [] };
        tw.side = tw.side || side;
        const nl = small ? 4 : 7; for (let q = 0; q < nl; q++) tw.leaves.push({ s: 0.3 + rnd() * 0.7, ox: (rnd() - 0.5) * U * 0.014, oy: rnd() * U * 0.016, sz: U * (0.0075 + rnd() * 0.0075), rot: rnd() * 3.14, col: LEAF[(rnd() * LEAF.length) | 0], ph: rnd() * 6.28, al: 0.7 + rnd() * 0.3 });
        br.twigs.push(tw);
      }
      const nl = small ? 6 : 11; for (let q = 0; q < nl; q++) br.leaves.push({ s: 0.25 + rnd() * 0.75, ox: (rnd() - 0.5) * U * 0.018, oy: rnd() * U * 0.02, sz: U * (0.009 + rnd() * 0.009), rot: rnd() * 3.14, col: LEAF[(rnd() * LEAF.length) | 0], ph: rnd() * 6.28, al: 0.72 + rnd() * 0.28 });
      branches.push(br);
    }
    return { pts, at, marks, nodes, fibers, branches, xb, yb, Ht, wB, N };
  }

  const branchPt = (b0, side, len, ang, droop, s, sw) => {   // punkt na gałęzi: rośnie w górę i na zewnątrz, potem opada
    const P0 = b0, P1 = [b0[0] + side * len * 0.32, b0[1] - len * (0.55 + 0.2 * ang)], P2 = [b0[0] + side * len * (0.68 + 0.3 * ang), b0[1] - len * (0.42 - 0.5 * droop)];
    const q = bez(P0, P1, P2, s); q[0] += sw * s * s; return q;
  };

  function drawLeaf(x, y, sz, rot, col, al) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = al; ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(0, 0, sz, sz * 0.55, 0, 0, 6.283); ctx.fill();
    ctx.globalAlpha = al * 0.32; ctx.fillStyle = '#fff0b8'; ctx.beginPath(); ctx.ellipse(-sz * 0.12, -sz * 0.14, sz * 0.72, sz * 0.26, 0, 0, 6.283); ctx.fill();
    if (sz > 5) { ctx.globalAlpha = al * 0.4; ctx.strokeStyle = '#5a2a0c'; ctx.lineWidth = Math.max(0.6, sz * 0.06); ctx.beginPath(); ctx.moveTo(-sz * 0.9, 0); ctx.lineTo(sz * 0.9, 0); ctx.stroke(); }
    ctx.restore();
  }

  function drawTree(t, rtime) {
    const tr = tree; if (!tr) return;
    const T = FULL ? 1 : trunkAt(t), f = clamp(T);
    if (f <= 0.002) return;
    const windT = FULL || calm ? 0 : rtime;
    ctx.save(); ctx.scale(DPR, DPR);
    ctx.translate(-mx * 18, 0);
    // cień przy ziemi
    ctx.save(); ctx.globalAlpha = 0.28 * clamp(f * 6); const sg = ctx.createRadialGradient(tr.xb, tr.yb - 4, 0, tr.xb, tr.yb - 4, tr.wB * 2.6); sg.addColorStop(0, 'rgba(40,50,38,.7)'); sg.addColorStop(1, 'rgba(40,50,38,0)');
    ctx.fillStyle = sg; ctx.translate(0, 0); ctx.fillRect(tr.xb - tr.wB * 3, tr.yb - tr.wB, tr.wB * 6, tr.wB * 2); ctx.restore();
    // korpus do aktualnej wysokości
    const n = Math.min(tr.N, Math.floor(f * tr.N)), L = [], R = [];
    const tp = (fi) => { const k = clamp((f - fi) / 0.1); return f >= 0.995 ? 1 : 0.1 + 0.9 * k * k * (3 - 2 * k); };   // czubek zwęża się jak młody pęd
    for (let i = 0; i <= n; i++) { const q = tr.pts[i], m = tp(q.f); L.push([q.x - q.w * m / 2, q.y]); R.push([q.x + q.w * m / 2, q.y]); }
    const tip = tr.at(f); L.push([tip.x - tip.w * 0.05, tip.y]); R.push([tip.x + tip.w * 0.05, tip.y]);
    const outline = () => { ctx.beginPath(); L.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]); ctx.closePath(); };
    const x0 = tr.xb - tr.wB * 0.62, x1 = tr.xb + tr.wB * 0.62 + tr.wB * 1.1;
    const gr = ctx.createLinearGradient(x0 - tr.wB * 0.5, 0, x1, 0);
    gr.addColorStop(0, '#a8a897'); gr.addColorStop(0.1, '#efede2'); gr.addColorStop(0.3, '#faf8f0'); gr.addColorStop(0.55, '#e6e3d6'); gr.addColorStop(0.82, '#bcbaa9'); gr.addColorStop(1, '#8b8d7e');
    // gradient liczony względem lokalnej osi pnia (pień lekko się wygina): rysujemy po segmentach pasów
    const seg = 3;
    ctx.save(); outline(); ctx.clip();
    for (let i = 0; i < L.length - 1; i += seg) {
      const j = Math.min(L.length - 1, i + seg), cx = (L[i][0] + R[i][0]) / 2, w = (R[i][0] - L[i][0]) * 0.6;
      const g2 = ctx.createLinearGradient(cx - w, 0, cx + w, 0);
      g2.addColorStop(0, '#a8a897'); g2.addColorStop(0.12, '#efede2'); g2.addColorStop(0.32, '#faf8f0'); g2.addColorStop(0.58, '#e6e3d6'); g2.addColorStop(0.84, '#bcbaa9'); g2.addColorStop(1, '#8b8d7e');
      ctx.fillStyle = g2; ctx.fillRect(cx - w - 2, Math.min(L[i][1], L[j][1]) - 1, w * 2 + 4, Math.abs(L[i][1] - L[j][1]) + 3);
    }
    // włókna i sęki
    tr.fibers.forEach(fb => { ctx.strokeStyle = `rgba(70,70,58,${fb.a})`; ctx.lineWidth = Math.max(1, tr.wB * 0.014); ctx.beginPath(); for (let i = 0; i <= n; i += 2) { const q = tr.pts[i]; const x = q.x + fb.o * q.w * 0.5; i ? ctx.lineTo(x, q.y) : ctx.moveTo(x, q.y); } ctx.stroke(); });
    tr.nodes.forEach(nd => { if (nd.f > f) return; const q = tr.at(nd.f), th = tr.wB * 0.3; const g3 = ctx.createLinearGradient(0, q.y - th, 0, q.y + th); g3.addColorStop(0, 'rgba(60,58,48,0)'); g3.addColorStop(0.5, `rgba(60,58,48,${nd.a})`); g3.addColorStop(1, 'rgba(60,58,48,0)'); ctx.fillStyle = g3; ctx.fillRect(q.x - tr.wB, q.y - th, tr.wB * 2, th * 2); });
    // czarne znaczki: pojawiają się tuż za rosnącym czubkiem
    tr.marks.forEach(m => { const k = clamp((f - m.f) / 0.05); if (k <= 0) return; const q = tr.at(m.f), len = q.w * m.len * (1 - Math.pow(Math.abs(m.dx) * 2, 2) * 0.55) * easeIO(k), th = Math.max(1.3, tr.wB * m.th);
      ctx.fillStyle = `rgba(24,26,21,${m.a})`; ctx.beginPath(); ctx.ellipse(q.x + m.dx * q.w, q.y, len / 2, th / 2, 0, 0, 6.283); ctx.fill(); });
    ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.45; ctx.fillStyle = ctx.createPattern(BARK, 'repeat'); ctx.fillRect(tr.xb - tr.wB * 2, tr.yb - tr.Ht - 10, tr.wB * 4, tr.Ht + 20); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // podstawa ciemniejsza
    const gb = ctx.createLinearGradient(0, tr.yb - tr.Ht * 0.14, 0, tr.yb); gb.addColorStop(0, 'rgba(34,34,28,0)'); gb.addColorStop(1, 'rgba(34,34,28,.6)');
    ctx.fillStyle = gb; ctx.fillRect(tr.xb - tr.wB * 2, tr.yb - tr.Ht * 0.14, tr.wB * 4, tr.Ht * 0.14 + 4);
    ctx.restore();
    // czubek: pęd z listkiem na końcu, dopóki rośnie
    if (f < 0.995) { const sz = tr.wB * 0.2 + 2.5, w2 = Math.sin(rtime * 2.4) * 0.08; drawLeaf(tip.x - sz * 0.6, tip.y - sz * 0.3, sz, -2.1 + w2, '#c8a24a', 0.95); drawLeaf(tip.x + sz * 0.6, tip.y - sz * 0.5, sz, -1.0 + w2, '#d99a45', 0.95); }
    // gałęzie, witki i liście
    const gx = gust, wnd = (ph) => Math.sin(windT * 0.9 + ph) * 0.012 + gx * Math.sin(windT * 6.5 + ph * 2) * 0.034;
    tr.branches.forEach(br => {
      const bp = easeIO((t - br.ts) / br.dur); if (!FULL && bp <= 0.001) return; const P = FULL ? 1 : bp;
      const q0 = tr.at(br.a), b0 = [q0.x + br.side * q0.w * 0.3, q0.y], sway = wnd(br.ph) * br.len;
      ctx.strokeStyle = '#3a372f'; ctx.lineCap = 'round';
      const segs = 12; let prev = b0;
      for (let k = 1; k <= segs; k++) { const s = P * k / segs, pt = branchPt(b0, br.side, br.len, br.ang, br.droop, s, sway); ctx.lineWidth = Math.max(1, tr.wB * 0.06 * (1 - 0.8 * s)); ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(pt[0], pt[1]); ctx.stroke(); prev = pt; }
      // witki
      br.twigs.forEach(tw => {
        const tp = easeIO((P - tw.s0) / 0.45); if (!FULL && tp <= 0.001) return; const TP = FULL ? 1 : tp;
        const a0 = branchPt(b0, br.side, br.len, br.ang, br.droop, tw.s0, sway), tl = tw.len, tsw = wnd(tw.ph) * tl * 1.4;
        const tpt = s2 => { const u = 1 - s2, P0 = a0, P1 = [a0[0] + tw.side * tl * 0.3, a0[1] - tl * 0.35], P2 = [a0[0] + tw.side * tl * 0.75, a0[1] + tl * (-0.05 + 0.55 * tw.droop)]; const q = [u * u * P0[0] + 2 * u * s2 * P1[0] + s2 * s2 * P2[0], u * u * P0[1] + 2 * u * s2 * P1[1] + s2 * s2 * P2[1]]; q[0] += tsw * s2 * s2; return q; };
        let pv = a0; ctx.strokeStyle = 'rgba(48,44,36,.9)';
        for (let k = 1; k <= 8; k++) { const pt = tpt(TP * k / 8); ctx.lineWidth = Math.max(0.8, tr.wB * 0.03 * (1 - 0.7 * k / 8)); ctx.beginPath(); ctx.moveTo(pv[0], pv[1]); ctx.lineTo(pt[0], pt[1]); ctx.stroke(); pv = pt; }
        tw.leaves.forEach(lf => { const k = FULL ? 1 : easeBack((TP - lf.s * 0.7) / 0.3); if (k <= 0.01) return; const pp = tpt(Math.min(lf.s, TP || 0.001));
          let lx = pp[0] + lf.ox, ly = pp[1] + lf.oy, rot = lf.rot + Math.sin(windT * 2.2 + lf.ph) * 0.12 * (1 + gx * 3);
          const dx = lx - curX, dy = ly - curY, dd = Math.hypot(dx, dy); if (dd < 110 && dd > 0.1) { const fo = Math.pow(1 - dd / 110, 2) * 16; lx += dx / dd * fo; ly += dy / dd * fo * 0.6; rot += fo * 0.05; }
          drawLeaf(lx, ly, lf.sz * Math.min(1, k) * (k > 1 ? 1 + (k - 1) * 0.3 : 1), rot, lf.col, lf.al); });
      });
      br.leaves.forEach(lf => { const k = FULL ? 1 : easeBack((P - lf.s * 0.75) / 0.28); if (k <= 0.01) return; const pp = branchPt(b0, br.side, br.len, br.ang, br.droop, Math.min(lf.s, P || 0.001), sway);
        let lx = pp[0] + lf.ox, ly = pp[1] + lf.oy, rot = lf.rot + Math.sin(windT * 2.2 + lf.ph) * 0.12 * (1 + gx * 3);
        const dx = lx - curX, dy = ly - curY, dd = Math.hypot(dx, dy); if (dd < 110 && dd > 0.1) { const fo = Math.pow(1 - dd / 110, 2) * 16; lx += dx / dd * fo; ly += dy / dd * fo * 0.6; rot += fo * 0.05; }
        drawLeaf(lx, ly, lf.sz * Math.min(1, k) * (k > 1 ? 1 + (k - 1) * 0.3 : 1), rot, lf.col, lf.al);
        // przy mocnym podmuchu jeden liść odrywa się i spada
        if (!STILL && gx > 0.55 && Math.random() < 0.0035 && falling.length < 30) falling.push({ x: lx, y: ly, vx: (Math.random() - 0.3) * 40, vy: 10 + Math.random() * 20, rot, vr: (Math.random() - 0.5) * 3, sz: lf.sz, col: lf.col, life: 0 });
      });
    });
    ctx.globalAlpha = 1; ctx.restore();
  }

  /* ---------- rysowanie ---------- */
  function drawTrunk(it, layer, t, sway) {
    const s = it.spr, p = ease((t - it.t0) / it.dur);
    if (p <= 0) return;
    const par = layer.par * U / 900 * DPR;
    const zoom = 1 + scrollP * layer.scl;
    const baseX = it.x * W * DPR + mx * par * -1;
    const baseY = (H * 1.02 + scrollP * H * layer.scl * 0.12) * DPR;
    const dx = baseX - s.cx, dy = baseY - s.base;
    ctx.save();
    ctx.translate(baseX, baseY); ctx.rotate(sway); ctx.scale(zoom, zoom); ctx.translate(-baseX, -baseY);
    if (p >= 0.999) ctx.drawImage(s.img, dx, dy);
    else {
      // wzrost od dołu, górny skraj miękki (paski z rosnącą przezroczystością)
      const N = 22, rows = s.hh / N;
      for (let k = 0; k < N; k++) {
        const a = clamp((p * 1.12 - k / N * 1.0) * N * 0.9);
        if (a <= 0) continue;
        const syTop = s.base - (k + 1) * rows, sh = rows + 1;
        ctx.globalAlpha = a;
        ctx.drawImage(s.img, 0, Math.max(0, syTop), s.w, sh + (syTop < 0 ? syTop : 0), dx, dy + Math.max(0, syTop), s.w, sh + (syTop < 0 ? syTop : 0));
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  const scrollProgress = () => { const r = PIN.getBoundingClientRect(), total = Math.max(1, PIN.offsetHeight - innerHeight); return clamp(-r.top / total); };

  function buildExtras() {
    // trawy na pierwszym planie (rozmyte), bokeh i flary
    const gc = document.createElement('canvas'); gc.width = Math.round(W * DPR); gc.height = Math.round(H * DPR * 0.3); const g = gc.getContext('2d'), rr = rngMaker(404);
    if (canFilter) g.filter = `blur(${2.2 * DPR}px)`;
    for (let i = 0; i < 150; i++) {
      const edge = rr() < 0.7, x = edge ? (rr() < 0.5 ? Math.pow(rr(), 1.6) * 0.3 : 1 - Math.pow(rr(), 1.6) * 0.3) * gc.width : rr() * gc.width,
        h = gc.height * (0.1 + rr() * (edge ? 0.5 : 0.22)), lw = (1.2 + rr() * 2.2) * DPR, lean = (rr() - 0.5) * h * 0.9;
      g.strokeStyle = `rgba(${34 + (rr() * 18) | 0},${48 + (rr() * 22) | 0},${34 + (rr() * 14) | 0},${0.55 + rr() * 0.4})`; g.lineWidth = lw; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, gc.height + 4); g.quadraticCurveTo(x + lean * 0.15, gc.height - h * 0.7, x + lean, gc.height - h); g.stroke();
    }
    grass = gc;
    const rb = rngMaker(909); orbs = [];
    for (let i = 0; i < 14; i++) orbs.push({ x: rb() * W, y: rb() * H, r: 22 + rb() * 80, a: 0.05 + rb() * 0.1, ph: rb() * 6.28, sp: 4 + rb() * 9 });
  }

  function frame(now) {
    raf = 0;
    if (!started) { started = true; t0 = now; }
    if (lastNow && !STILL) { const d = now - lastNow; if (d > 0 && d < 200 && now - t0 > 2500) { ftSum += d; ftN++; if (ftN >= 40) { if (!LOW && ftSum / ftN > 27) { LOW = true; build(); } ftSum = 0; ftN = 0; } } }
    lastNow = now;
    const rt = STILL ? STILL_T : (now - t0) / 1000;            // czas rzeczywisty: wiatr, mgła, pyłki
    const dtr = Math.min(0.06, Math.max(0.001, rt - lastRt)); lastRt = rt;
    let tg = rt;                                                // czas wzrostu
    if (TREE && !STILL) {
      if (SCROLL) {
        const target = Math.max(AUTO_G * ease(rt / 3.4), AUTO_G + (1 - AUTO_G) * scrollProgress());
        Gs += (target - Gs) * (1 - Math.pow(0.0006, dtr));
        tg = Gs * TG_MAX;
      } else tg = rt;
    } else if (TREE && STILL) tg = STILL_T;
    const G = TREE ? clamp(tg / TG_MAX) : 1;
    if (TREE && Math.abs(G - lastG) > 0.002) { lastG = G; window.dispatchEvent(new CustomEvent('forestgrowth', { detail: { g: G, scroll: SCROLL } })); }
    mx += (tmx - mx) * 0.06; my += (tmy - my) * 0.06;
    const cw = cv.width, ch = cv.height;
    // tło: szałwiowy gradient
    let g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, '#d4ddcf'); g.addColorStop(0.55, '#c3cebe'); g.addColorStop(1, '#a9b6a3');
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    // słońce
    g = ctx.createRadialGradient(cw * 0.8, -ch * 0.05, 0, cw * 0.8, -ch * 0.05, ch * 1.05);
    g.addColorStop(0, 'rgba(255,248,226,.9)'); g.addColorStop(0.35, 'rgba(255,246,222,.35)'); g.addColorStop(1, 'rgba(255,246,222,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    // napis Birch za drzewami
    const wa = ease((tg - 0.2) / 2.2);
    if (wa > 0.01) {
      ctx.save(); ctx.globalAlpha = 0.15 * wa; ctx.fillStyle = '#3f5844';
      const fs = Math.min(ch * 0.62, cw * 0.34);
      ctx.font = `400 ${fs}px "Instrument Serif", Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('Birch', cw * 0.66 - mx * 14 * DPR, ch * 0.5);
      ctx.restore();
    }
    // promienie (rosną razem z drzewem)
    const pulse = 0.75 + 0.25 * Math.sin(rt * 0.5);
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = (STILL ? 1 : ease(tg / 2.5)) * 0.55 * pulse;
    ctx.drawImage(rays, Math.sin(rt * 0.18) * 14 * DPR, 0); ctx.restore();
    // kamera: w trybie przewijania zaczyna nisko przy pędzie i odjeżdża wraz ze wzrostem
    let zk = 1, zx = cw * 0.7;
    if (TREE && !STILL) { if (SCROLL) { zk = 1 + 0.5 * Math.pow(1 - G, 1.4); zx = tree.xb * DPR; } else zk = 1 + 0.1 * Math.pow(1 - clamp(tg / 9), 2); }
    ctx.save(); ctx.translate(zx, ch); ctx.scale(zk, zk); ctx.translate(-zx, -ch);
    // warstwy
    const sw = (i, ph) => calm || STILL ? 0 : Math.sin(rt * 0.5 + ph + i) * 0.0035;
    const drawLayer = (L, k) => L.items.forEach((it, i) => drawTrunk(it, L, tg, sw(i, k)));
    drawLayer(layers[0], 0);
    const mdrift = (rt * 5 * DPR) % (mistA.width - cw);
    ctx.globalAlpha = 1; ctx.drawImage(mistA, -mdrift - mx * 20 * DPR, 0);
    drawLayer(layers[1], 1.3);
    if (TREE) { gust *= 0.965; drawTree(tg, rt); }
    ctx.globalAlpha = 0.9; ctx.drawImage(mistB, -((mistB.width - cw) - (rt * 8 * DPR) % (mistB.width - cw)) - mx * 40 * DPR, 0); ctx.globalAlpha = 1;
    drawLayer(layers[2], 2.1);
    ctx.restore();
    // przedni plan: mgła przy ziemi
    g = ctx.createLinearGradient(0, ch * 0.62, 0, ch);
    g.addColorStop(0, `rgba(${MIST[0]},${MIST[1]},${MIST[2]},0)`); g.addColorStop(1, `rgba(${MIST[0]},${MIST[1]},${MIST[2]},.62)`);
    ctx.fillStyle = g; ctx.fillRect(0, ch * 0.62, cw, ch * 0.38);
    // pyłki i spadające liście
    const lv = ease((tg - 2.6) / 2);
    parts.forEach(p => {
      const sp = STILL ? 0 : rt;
      let x = (p.x + Math.sin(sp * 0.4 + p.ph) * 26 - sp * (p.leaf ? 6 : 4)) % W; if (x < 0) x += W;
      let y = p.leaf ? (p.y + sp * p.v) % (H + 40) - 20 : (p.y - sp * p.v * 0.6) % H; if (y < 0) y += H;
      const al = p.a * (p.leaf ? lv : ease((tg - 1.2) / 2));
      if (al < 0.01) return;
      ctx.globalAlpha = al;
      if (p.leaf) {
        ctx.save(); ctx.translate((x - mx * 50) * DPR, y * DPR); ctx.rotate(p.rot + sp * p.spin); ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.ellipse(0, 0, p.r * DPR, p.r * 0.55 * DPR, 0, 0, 6.283); ctx.fill(); ctx.restore();
      } else { ctx.fillStyle = '#fff8e6'; ctx.beginPath(); ctx.arc((x - mx * 30) * DPR, y * DPR, p.r * DPR, 0, 6.283); ctx.fill(); }
    });
    ctx.globalAlpha = 1;
    // oderwane liście
    if (falling.length) {
      const dt = dtr;
      falling = falling.filter(l => { l.life += dt; l.vy += 28 * dt; l.vx += Math.sin(l.life * 3 + l.rot) * 30 * dt; l.x += l.vx * dt; l.y += l.vy * dt; l.rot += l.vr * dt; return l.y < H + 20 && l.life < 14; });
      falling.forEach(l => { ctx.save(); ctx.scale(DPR, DPR); drawLeaf(l.x, l.y, l.sz, l.rot, l.col, Math.max(0, 1 - l.life / 14)); ctx.restore(); });
    }
    lastT = rt;
    // pierwszy plan: rozmyte trawy, bokeh i flary światła (głębia jak w filmie)
    if (grass) {
      const sx = STILL ? 0 : Math.sin(rt * 0.6) * 3 * DPR;
      ctx.globalAlpha = 0.9 * ease((tg - 1) / 2); ctx.drawImage(grass, sx - mx * 30 * DPR, ch - grass.height + 6 * DPR); ctx.globalAlpha = 1;
    }
    if (!LOW) { ctx.save(); ctx.globalCompositeOperation = 'screen';
    orbs.forEach(o => { const ox = (o.x + (STILL ? 0 : Math.sin(rt * 0.12 + o.ph) * o.sp * 3) - mx * 40) * DPR, oy = (o.y + (STILL ? 0 : Math.cos(rt * 0.1 + o.ph) * o.sp * 2)) * DPR, r = o.r * DPR;
      const og = ctx.createRadialGradient(ox, oy, 0, ox, oy, r); og.addColorStop(0, `rgba(255,244,214,${o.a})`); og.addColorStop(0.7, `rgba(255,244,214,${o.a * 0.5})`); og.addColorStop(1, 'rgba(255,244,214,0)'); ctx.fillStyle = og; ctx.fillRect(ox - r, oy - r, r * 2, r * 2); });
    [[0.34, 60, 0.1], [0.52, 38, 0.08], [0.76, 90, 0.07], [1.02, 46, 0.09]].forEach(f => { const fx = cw * 0.8 + (cw * 0.42 - cw * 0.8) * f[0] * 1.4, fy = -ch * 0.05 + (ch * 0.62 + ch * 0.05) * f[0] * 1.4, fr = f[1] * DPR * (U / 900);
      const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr); fg.addColorStop(0, `rgba(255,236,200,${f[2]})`); fg.addColorStop(1, 'rgba(255,236,200,0)'); ctx.fillStyle = fg; ctx.fillRect(fx - fr, fy - fr, fr * 2, fr * 2); });
    ctx.restore(); }
    // winieta
    g = ctx.createRadialGradient(cw * 0.55, ch * 0.45, ch * 0.45, cw * 0.55, ch * 0.45, ch * 1.15);
    g.addColorStop(0, 'rgba(60,78,62,0)'); g.addColorStop(1, 'rgba(60,78,62,.22)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    // grading: ciepłe światło u góry, chłodny cień na dole (soft-light), potem delikatne ziarno
    if (!LOW) { ctx.save(); ctx.globalCompositeOperation = 'soft-light';
    g = ctx.createLinearGradient(cw, 0, 0, ch); g.addColorStop(0, 'rgba(255,205,140,.42)'); g.addColorStop(0.55, 'rgba(255,230,200,0)'); g.addColorStop(1, 'rgba(70,110,110,.36)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch); ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.17;
    const gox = STILL ? 0 : ((Math.random() * 256) | 0), goy = STILL ? 0 : ((Math.random() * 256) | 0);
    ctx.translate(-gox, -goy); ctx.fillStyle = ctx.createPattern(GRAIN, 'repeat'); ctx.fillRect(0, 0, cw + 256, ch + 256); ctx.restore(); }
    if (!STILL && !calm && visible) raf = requestAnimationFrame(frame);
    else if (!STILL && !calm && !visible) raf = 0;
    const doneAt = TREE ? (SCROLL ? 0.985 : 0.97) : 0;
    if (TREE ? G >= doneAt : tg > 3.6) { if (!window.__forestDone) { window.__forestDone = true; host.classList.add('forest--done'); } }
    else if (TREE && window.__forestDone && G < 0.9) { window.__forestDone = false; host.classList.remove('forest--done'); }
  }

  /* ---------- sterowanie ---------- */
  let ready = false;
  const kick = () => { if (ready && !raf) raf = requestAnimationFrame(frame); };
  const sizeOk = () => { const r = host.getBoundingClientRect(); return r.width > 50 && r.height > 50; };
  let rt = 0;
  const rebuild = () => { build(); if (STILL || calm) { started = true; t0 = performance.now() - 99999; raf = 0; requestAnimationFrame(frame); } else kick(); };
  const init = () => {
    if (!sizeOk()) return;           // ukryty ekran (np. logowanie panelu): zaczniemy, gdy dostanie rozmiar
    ready = true; build();
    if (STILL || calm) { t0 = performance.now() - 99999; started = true; requestAnimationFrame(frame); host.classList.add('forest--done'); }
    else kick();
  };
  const onSize = () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (!sizeOk()) return;
      if (!ready) { init(); return; }
      const r = host.getBoundingClientRect();
      if (Math.abs(r.width - W) > 24 || Math.abs(r.height - H) > 24) rebuild();
    }, 200);
  };
  if ('ResizeObserver' in window) new ResizeObserver(onSize).observe(host); else addEventListener('resize', onSize);
  if (!STILL && !calm) {
    addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      const nx = e.clientX / innerWidth - 0.5; gust = Math.min(1, gust + Math.abs(nx - tmx) * 7 + Math.abs(e.movementX || 0) * 0.002);
      tmx = nx; tmy = e.clientY / innerHeight - 0.5;
      const r = host.getBoundingClientRect(); curX = e.clientX - r.left; curY = e.clientY - r.top;
    }, { passive: true });
    addEventListener('scroll', () => { scrollP = SCROLL ? 0 : clamp(scrollY / Math.max(1, H)); if (SCROLL) kick(); }, { passive: true });
    new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) kick(); }).observe(host);
  }
  window.birchReplay = () => { if (!ready || STILL) return; t0 = performance.now(); Gs = 0; lastG = -1; falling = []; gust = 0; host.classList.remove('forest--done'); window.__forestDone = false; kick(); };
  // czekamy chwilę na font (napis Birch), ale nie dłużej niż 600 ms
  let go = false; const once = () => { if (!go) { go = true; init(); } };
  try { document.fonts.load('400 100px "Instrument Serif"').then(once, once); } catch (e) { once(); }
  setTimeout(once, 600);
})();
