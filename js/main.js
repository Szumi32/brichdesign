/* =========================================================
   brichdesign — animacje i interakcje (GSAP + ScrollTrigger + Lenis)
   Spis: 0 Start · 1 Płynny scroll · 2 Las brzozowy (SVG)
         3 Preloader · 4 Hero · 5 Manifest · 6 Kafelki
         7 Wizyta (pin) · 8 Proces · 9 Kontakt · 10 Nagłówek/kursor
   Aby zmienić tempo/ruch — szukaj stałych w obiekcie CONFIG.
   ========================================================= */
(() => {
  'use strict';

  /* ---------- 0. START ---------- */
  const CONFIG = {
    heroScroll: 1.6,      // długość przypiętego hero (x wysokość okna)
    tourPerScene: 0.9,    // długość przewijania na jedną scenę „wizyty” (x wysokość okna)
    smooth: 0.09,         // płynność scrolla Lenis (mniej = bardziej „ciągnie”)
    leaves: 14,           // liczba spadających listków
  };
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const loader = $('#loader');

  // awaryjnie: gdy biblioteki się nie wczytały, pokaż statyczną stronę
  if (!window.gsap || !window.ScrollTrigger) {
    loader && loader.remove();
    document.querySelectorAll('.reveal,.line>span').forEach(el => { el.style.opacity = 1; el.style.transform = 'none'; });
    document.querySelectorAll('.manifest__text .w').forEach(el => (el.style.opacity = 1));
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  /* ---------- 1. PŁYNNY SCROLL ---------- */
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ lerp: CONFIG.smooth, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  const scrollToY = (y, d = 1.6) => lenis ? lenis.scrollTo(y, { duration: d }) : window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    const t = id.length > 1 && $(id);
    if (!t) return;
    e.preventDefault();
    const y = id === '#top' ? 0 : t.getBoundingClientRect().top + scrollY - 0;
    scrollToY(y);
  }));

  /* ---------- 2. LAS BRZOZOWY (SVG generowany proceduralnie) ---------- */
  // Generator liczb losowych z ziarnem — las wygląda tak samo przy każdym wejściu.
  const rng = seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const lerp = (a, b, t) => a + (b - a) * t;

  /* Generator brzozy. Każde drzewo to:
       · lekko pochylony, zwężający się pień z nieregularnym brzegiem i zgrubieniem u podstawy,
       · ciemna, spękana podstawa (kora brzozy czernieje przy ziemi),
       · poziome czarne znaczenia o kształcie soczewki — różnej szerokości, grupowane, gęstsze nisko,
       · odchodzące od pnia cienkie gałązki z listkami i (na bliskich planach) łuszczące się paski kory.
     Osobny SVG „korona” przyklejony do góry ekranu: zwisające gałązki (brzoza płacząca) i listowie. */
  const f = n => Math.round(n * 10) / 10;
  const LEAF = 'M0 -9C5 -5 7 2 4.5 7C3 9.5 -3 9.5 -4.5 7C-7 2 -5 -5 0 -9Z'; // liść jajowaty ze szpicem
  const bez = (t, a, b, c, d) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };

  function birchLayer(host, o) {
    const W = 1600, H = 1000, r = rng(o.seed);
    const R = (a, b) => a + (b - a) * r();
    const pick = arr => arr[Math.floor(r() * arr.length)];
    const leaf = (x, y, rot, s) => `<use href="#lf-${o.id}" transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${f(s)})" fill="${pick(o.leaves)}" opacity="${f(R(.7, 1) * 100) / 100}"/>`;

    const defs = `<defs><path id="lf-${o.id}" d="${LEAF}"/>
      <linearGradient id="bk-${o.id}" x1="0" x2="1"><stop offset="0" stop-color="${o.edge}"/><stop offset=".32" stop-color="${o.mid}"/><stop offset=".74" stop-color="${o.lit}"/><stop offset="1" stop-color="${o.rim}"/></linearGradient>
      <linearGradient id="bs-${o.id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#0a0806"/><stop offset=".62" stop-color="#17130f" stop-opacity=".92"/><stop offset="1" stop-color="#17130f" stop-opacity="0"/></linearGradient></defs>`;

    /* ---- drzewa ---- */
    const specs = [];
    for (let i = 0; i < o.count; i++) {
      let x; do { x = R(-40, W + 40); } while (o.gap && x > W * o.gap[0] && x < W * o.gap[1]);
      const tw = R(o.w[0], o.w[1]);
      specs.push({ x, tw, lean: R(-o.lean, o.lean) });
      if (r() < o.cluster) specs.push({ x: x + (r() < .5 ? -1 : 1) * tw * R(.9, 1.8), tw: tw * R(.5, .75), lean: R(-o.lean, o.lean) * 1.5 }); // pnie wielopniowe
    }
    specs.sort((a, b) => a.tw - b.tw); // cieńsze (dalsze) najpierw

    const tree = ({ x, tw, lean }) => {
      const top = H + 280, seg = Math.max(28, tw * 1.2), n = Math.ceil(top / seg);
      const ph = R(0, 6), bow = R(-1, 1) * Math.min(28, tw * .5 + 8);
      const C = [], Lf = [], Rt = [];
      for (let k = 0; k <= n; k++) {
        const t = k / n, y = -k * seg;
        const w = tw * (k === 0 ? 1.3 : k === 1 ? 1.1 : 1 - .24 * t);
        const cx = Math.sin(k * .6 + ph) * tw * .045 + bow * t * t;
        C.push([cx, y, w]);
        Lf.push(f(cx - w / 2 + (r() - .5) * tw * .05) + ' ' + f(y));
        Rt.push(f(cx + w / 2 + (r() - .5) * tw * .05) + ' ' + f(y));
      }
      const at = yy => { const k = Math.min(n - 1, Math.max(0, Math.floor(-yy / seg))), a = C[k], b = C[k + 1], t = (-yy - k * seg) / seg; return { cx: a[0] + (b[0] - a[0]) * t, w: a[2] + (b[2] - a[2]) * t }; };
      let g = `<g transform="translate(${f(x)} ${H + 8}) rotate(${f(R(-1, 1) * 0 + lean)})">`;
      g += `<path d="M${Lf.join('L')}L${Rt.reverse().join('L')}Z" fill="url(#bk-${o.id})"/>`;

      // ciemna, rozdarta podstawa
      const hb = tw * R(1.4, 2.4), b0 = C[0], bw = b0[2];
      let bd = `M${f(b0[0] - bw / 2)} 8L${f(b0[0] - bw / 2)} ${f(-hb * .5)}`;
      for (let i = 1; i <= 7; i++) bd += `L${f(b0[0] - bw / 2 + bw * i / 7)} ${f(-hb * R(.25, 1))}`;
      g += `<path d="${bd}L${f(b0[0] + bw / 2)} 8Z" fill="url(#bs-${o.id})"/>`;

      // znaczenia kory
      let my = -hb - R(8, 30);
      while (my > -top + 60) {
        const dens = 1 + (-my / H) * .9, cl = r() < .38 ? (r() < .45 ? 3 : 2) : 1;
        for (let c = 0; c < cl; c++) {
          const { cx, w } = at(my), mw = w * R(.3, 1), mx = cx - w / 2 + (w - mw) * r();
          const mh = Math.max(o.minH, w * R(.06, .15)), sl = R(-.5, .5) * mh;
          g += `<path d="M${f(mx)} ${f(my)}Q${f(mx + mw / 2)} ${f(my - mh * 1.15)} ${f(mx + mw)} ${f(my + sl)}Q${f(mx + mw / 2)} ${f(my + mh * .85)} ${f(mx)} ${f(my)}Z" fill="${r() < .82 ? o.dash : o.dash2}"/>`;
          my -= mh * R(1.4, 2.6) + 3;
        }
        my -= at(my).w * R(.45, 1.9) * dens + 8;
      }

      // łuszczące się paski kory (tylko bliskie plany)
      if (o.peel) for (let i = 0; i < 4; i++) {
        const yy = -R(150, 800), side = r() < .5 ? -1 : 1, { cx, w } = at(yy), ex = cx + side * w / 2;
        g += `<path d="M${f(ex)} ${f(yy)}q${f(side * tw * .16)} ${f(-tw * .12)} ${f(side * tw * .03)} ${f(-tw * R(.25, .45))}" stroke="${o.lit}" stroke-width="${f(tw * .03)}" stroke-linecap="round" fill="none"/>`;
      }

      // gałązki z listkami
      if (r() < o.branchP) for (let b = 0; b < (r() < .5 ? 1 : 2); b++) {
        const yy = -R(H * .3, H * .72), side = r() < .5 ? -1 : 1, { cx, w } = at(yy), sx = cx + side * w * .4, len = o.bl * R(.7, 1.3);
        const x1 = sx + side * len * .45, y1 = yy - len * R(.1, .45), x2 = sx + side * len, y2 = yy - len * R(-.1, .35);
        g += `<path d="M${f(sx)} ${f(yy)}Q${f(x1)} ${f(y1)} ${f(x2)} ${f(y2)}" stroke="${o.twig}" stroke-width="${f(o.tws)}" stroke-linecap="round" fill="none"/>`;
        const m = Math.round(R(6, 11));
        for (let j = 0; j < m; j++) {
          const t = .2 + .8 * j / (m - 1), u = 1 - t;
          const px = u * u * sx + 2 * u * t * x1 + t * t * x2, py = u * u * yy + 2 * u * t * y1 + t * t * y2;
          g += leaf(px + R(-6, 6) * o.ls, py + R(0, 12) * o.ls, R(120, 240) + side * R(-30, 30), o.ls * R(.8, 1.3));
        }
      }
      return g + '</g>';
    };
    let trees = specs.map(tree).join('');

    // runo leśne: źdźbła i opadłe liście
    for (let i = 0; i < o.grass; i++) {
      const x = R(-20, W + 20), h = R(40, 140) * o.gs, ln = R(-30, 30);
      trees += `<path d="M${f(x - 3)} ${H + 4}Q${f(x + ln * .4)} ${f(H - h * .55)} ${f(x + ln)} ${f(H - h)}Q${f(x + ln * .4 + 3)} ${f(H - h * .5)} ${f(x + 5)} ${H + 4}Z" fill="${o.grassCol}"/>`;
    }
    for (let i = 0; i < o.fallen; i++) trees += leaf(R(0, W), H - R(0, 80) * r(), R(0, 360), o.ls * R(.9, 1.6));

    /* ---- korona (przyklejona do góry): zwisające gałązki + listowie ---- */
    let can = `<defs><path id="lc-${o.id}" d="${LEAF}"/></defs>`;
    const cleaf = (x, y, rot, s) => `<use href="#lc-${o.id}" transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${f(s)})" fill="${pick(o.leaves)}" opacity="${f(R(.7, 1) * 100) / 100}"/>`;
    for (let i = 0; i < o.droop; i++) {
      const x = R(0, W), len = R(150, 400) * o.ds, sw = R(-60, 60) * o.ds;
      const p = [[x, -20], [x + sw * .3, len * .35], [x + sw, len * .7], [x + sw * .6, len]];
      can += `<path d="M${f(p[0][0])} ${p[0][1]}C${p.slice(1).map(q => f(q[0]) + ' ' + f(q[1])).join(' ')}" stroke="${o.twig}" stroke-width="${f(o.tws * .8)}" stroke-linecap="round" fill="none"/>`;
      const m = Math.round(R(6, 11));
      for (let j = 0; j < m; j++) {
        const t = .16 + .84 * j / m;
        can += cleaf(bez(t, p[0][0], p[1][0], p[2][0], p[3][0]) + R(-5, 5), bez(t, p[0][1], p[1][1], p[2][1], p[3][1]) + R(0, 8), 180 + R(-38, 38), o.ls * R(.8, 1.25));
      }
    }
    for (let i = 0; i < o.canopy; i++) can += cleaf(R(r() < .6 ? W * .5 : -20, W + 20), -30 + 170 * Math.pow(r(), 1.8), R(0, 360), o.ls * R(.8, 1.5));

    host.innerHTML =
      `<svg class="hero__crown" viewBox="0 0 ${W} 700" preserveAspectRatio="xMidYMin slice" aria-hidden="true">${can}</svg>` +
      `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${defs}${trees}</svg>`;
  }

  const GOLD = ['#f0cf78', '#e2b95f', '#d4a23f', '#f3dd9a', '#e8c46a', '#a8a047'];
  const HAZE = ['#e9bd9d', '#ebcb8f', '#dba98f', '#d8b38a'];
  const layers = {
    far: { id: 'far', seed: 14, count: 20, w: [6, 13], lean: 1.4, cluster: .25, minH: 1.5, branchP: 0, bl: 0, tws: 1, ls: .5, ds: .5, droop: 9, canopy: 34, grass: 0, gs: 1, fallen: 0,
           edge: '#8a7a86', mid: '#e3cdca', lit: '#f0dccb', rim: '#c79c8e', dash: 'rgba(48,34,50,.72)', dash2: 'rgba(80,62,78,.5)', twig: 'rgba(60,44,60,.7)', leaves: HAZE, grassCol: '#1a1424' },
    mid: { id: 'mid', seed: 29, count: 9, w: [20, 38], lean: 2.4, cluster: .35, gap: [.16, .56], minH: 2.8, branchP: .9, bl: 150, tws: 2, ls: .8, ds: .9, droop: 12, canopy: 40, grass: 12, gs: .5, fallen: 14,
           edge: '#7d726f', mid: '#ece0d4', lit: '#f7e8d4', rim: '#d3a98a', dash: 'rgba(18,14,13,.88)', dash2: 'rgba(62,50,46,.62)', twig: '#2a211b', leaves: GOLD, grassCol: '#0d0b0a', peel: false },
    near: { id: 'near', seed: 53, count: 4, w: [74, 118], lean: 1.4, cluster: 0, gap: [.12, .76], minH: 7, branchP: .8, bl: 260, tws: 4, ls: 1.3, ds: 1.6, droop: 6, canopy: 20, grass: 14, gs: 1, fallen: 16,
           edge: '#5f5a55', mid: '#efe9df', lit: '#f8efe0', rim: '#d9b393', dash: '#0e0b09', dash2: 'rgba(48,38,32,.78)', twig: '#241b16', leaves: GOLD, grassCol: '#090908', peel: true },
  };
  $$('.hero__layer').forEach(el => birchLayer(el, layers[el.dataset.layer]));

  // spadające złote listki
  const leafTweens = [];
  const leavesHost = $('#leaves');
  if (!reduce) {
    for (let i = 0; i < CONFIG.leaves; i++) {
      const el = document.createElement('i'); el.className = 'leaf'; leavesHost.appendChild(el);
      const size = gsap.utils.random(.5, 1.1);
      gsap.set(el, { scale: size, x: () => gsap.utils.random(0, innerWidth), y: -40, rotation: gsap.utils.random(0, 360), opacity: 0 });
      const tl = gsap.timeline({ repeat: -1, delay: gsap.utils.random(0, 9), paused: true });
      tl.to(el, { y: () => innerHeight + 60, duration: gsap.utils.random(9, 16), ease: 'none' }, 0)
        .to(el, { x: '+=' + gsap.utils.random(-160, 160), rotation: '+=' + gsap.utils.random(-300, 300), duration: gsap.utils.random(9, 16), ease: 'sine.inOut' }, 0)
        .to(el, { opacity: gsap.utils.random(.5, .9), duration: 1.2 }, 0)
        .to(el, { opacity: 0, duration: 1.4 }, '>-1.4');
      leafTweens.push(tl);
    }
  }

  /* ---------- 3. PRELOADER ---------- */
  let headerReady = false;
  const heroLines = $$('.hero__title .line > span');
  // elementy wjeżdżające po preloaderze (karta i statystyki fade'ują się osobno przy scrollu, więc animujemy ich dzieci)
  const heroReveal = [...$$('.hero .reveal'), ...$$('.hero__card > *'), ...$$('.hero__stats > div')];
  gsap.set(heroLines, { yPercent: 115 });
  gsap.set(heroReveal, { y: 30, opacity: 0 });
  gsap.set('.site-header', { yPercent: -100 });

  const num = $('#loaderNum');
  const counter = { v: 0 };
  const pageReady = Promise.race([
    Promise.all([document.fonts ? document.fonts.ready : 0, new Promise(r => (document.readyState === 'complete' ? r() : addEventListener('load', r)))]),
    new Promise(r => setTimeout(r, 4500)), // bezpiecznik
  ]);
  gsap.to(counter, { v: 90, duration: 1.4, ease: 'power2.out', onUpdate: () => (num.textContent = String(Math.round(counter.v)).padStart(3, '0')) });
  gsap.from('.loader__mark', { scale: .7, opacity: 0, duration: 1, ease: 'power3.out' });

  pageReady.then(() => {
    gsap.to(counter, { v: 100, duration: .4, onUpdate: () => (num.textContent = String(Math.round(counter.v)).padStart(3, '0')) });
    gsap.timeline({ delay: .5, onComplete: () => { loader.remove(); ScrollTrigger.refresh(); } })
      .to(loader, { yPercent: -100, duration: 1.1, ease: 'power4.inOut' })
      .to(heroLines, { yPercent: 0, duration: 1.3, stagger: .12, ease: 'power4.out' }, '-=.55')
      .to(heroReveal, { y: 0, opacity: 1, duration: 1, stagger: .12, ease: 'power3.out' }, '-=1')
      .to('.site-header', { yPercent: 0, duration: 1, ease: 'power3.out', onComplete: () => (headerReady = true) }, '-=1');
  });

  /* ---------- 4. HERO: „wjazd” w las przy przewijaniu ---------- */
  const heroNum = $('#heroNum');
  const heroItems = $$('#heroList li');
  const setHeroStep = n => {
    heroNum.textContent = String(n).padStart(2, '0');
    heroItems.forEach((li, i) => li.classList.toggle('is-on', i < n));
  };
  setHeroStep(1);

  const heroTl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: '#hero', start: 'top top', end: () => '+=' + innerHeight * CONFIG.heroScroll,
      pin: true, scrub: .8, anticipatePin: 1,
      onUpdate: self => setHeroStep(Math.min(heroItems.length, 1 + Math.floor(self.progress * heroItems.length))),
      onToggle: self => leafTweens.forEach(t => (self.isActive ? t.play() : t.pause())),
    },
  });
  heroTl
    .to('[data-layer="far"]',  { scale: 1.28 }, 0)
    .to('[data-layer="mid"]',  { scale: 2.1 }, 0)
    .to('[data-layer="near"]', { scale: 4.4 }, 0)
    .to('.hero__sun',   { scale: 1.5, opacity: .6 }, 0)
    .to('.hero__copy',  { y: -90, opacity: 0, duration: .45 }, 0.05)
    .to('.hero__card',  { y: -60, opacity: 0, duration: .45 }, 0.05)
    .to('.hero__stats, .hero__scroll', { opacity: 0, duration: .3 }, 0)
    .to('.hero__veil',  { opacity: 1, duration: .28 }, .72)
    .to('[data-layer="near"]', { opacity: 0, duration: .22 }, .78);

  /* ---------- 5. MANIFEST + sekcje z „reveal” ---------- */
  // dzielenie nagłówków na słowa: każde słowo rozjaśnia się wraz ze scrollem
  $$('[data-split]').forEach(el => {
    el.innerHTML = el.textContent.trim().split(/\s+/).map(w => `<span class="w">${w}</span>`).join(' ');
  });
  gsap.to('.manifest__text .w', {
    opacity: 1, ease: 'none', stagger: .1,
    scrollTrigger: { trigger: '.manifest__text', start: 'top 82%', end: 'bottom 48%', scrub: .6 },
  });
  // pozostałe elementy .reveal (poza hero) wjeżdżają z dołu
  ScrollTrigger.batch($$('.reveal').filter(el => !el.closest('.hero')), {
    start: 'top 88%', once: true,
    onEnter: els => gsap.fromTo(els, { y: 46, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, stagger: .12, ease: 'power3.out', overwrite: true }),
  });
  gsap.set($$('.reveal').filter(el => !el.closest('.hero')), { opacity: 0 });

  /* ---------- 6. KAFELKI: wejście + nachylenie 3D przy hover ---------- */
  const cards = $$('.card');
  ScrollTrigger.batch(cards, {
    start: 'top 90%', once: true,
    onEnter: els => gsap.fromTo(els, { y: 90, opacity: 0, clipPath: 'inset(12% 6% 0% 6% round 20px)' }, { y: 0, opacity: 1, clipPath: 'inset(0% 0% 0% 0% round 20px)', duration: 1.3, stagger: .14, ease: 'power4.out', clearProps: 'transform,opacity,clipPath' }),
  });
  gsap.set(cards, { opacity: 0 });

  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const cursor = $('#cursor');
  if (fine && !reduce) {
    gsap.set(cursor, { x: -200, y: -200, scale: 0 });
    const cx = gsap.quickTo(cursor, 'x', { duration: .45, ease: 'power3' });
    const cy = gsap.quickTo(cursor, 'y', { duration: .45, ease: 'power3' });
    let cursorOn = false;
    addEventListener('pointermove', e => { cx(e.clientX); cy(e.clientY); }, { passive: true });
    const showCursor = on => { if (on === cursorOn) return; cursorOn = on; gsap.to(cursor, { scale: on ? 1 : 0, duration: .5, ease: 'power3.out' }); };

    cards.forEach(card => {
      card.addEventListener('pointermove', e => {
        const b = card.getBoundingClientRect(), px = (e.clientX - b.left) / b.width, py = (e.clientY - b.top) / b.height;
        card.style.setProperty('--ry', ((px - .5) * 7).toFixed(2) + 'deg');
        card.style.setProperty('--rx', ((.5 - py) * 5).toFixed(2) + 'deg');
        card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      });
      card.addEventListener('pointerenter', () => showCursor(true));
      card.addEventListener('pointerleave', () => { showCursor(false); card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); });
    });
    // sceny wizyty też pokazują kursor
    $$('.scene').forEach(s => { s.addEventListener('pointerenter', () => showCursor(true)); s.addEventListener('pointerleave', () => showCursor(false)); });
  }

  /* ---------- 7. WIZYTA: przypięta sekwencja scen ---------- */
  // kolejność = ranking „co najbardziej rzuca się w oczy”; VK Cup celowo poza sekwencją
  const projects = [
    { cat: 'Turystyka',   name: 'Karpik',         desc: 'Domki nad Jeziorem Białym — cennik, kalendarz terminów i asystent odpowiadający gościom.', scope: 'Strona, rezerwacje, asystent', url: 'szumi32.github.io/karpik', href: 'https://szumi32.github.io/karpik/' },
    { cat: 'Produkt',     name: 'NOCTE',          desc: 'Koncepcja inteligentnej maski do snu. Czarne studio, produkt w świetle, konfigurator.', scope: 'Strona produktu, konfigurator', url: 'szumi32.github.io/nocte', href: 'https://szumi32.github.io/nocte/' },
    { cat: 'Usługi lokalne', name: 'PureDrive',   desc: 'Ręczna myjnia i detailing w garażu Galerii Wileńskiej — oferta, opinie klientów, karta lojalnościowa i dojazd.', scope: 'Strona, oferta, opinie', url: 'szumi32.github.io/puredrive', href: 'https://szumi32.github.io/puredrive/' },
    { cat: 'Medycyna',    name: 'Barańska Stomatolog', desc: 'Gabinet stomatologiczny w Piasecznie: logo, oferta usług, FAQ i umawianie wizyt.', scope: 'Strona, logo, usługi, FAQ', url: 'szumi32.github.io/baranska-stomatolog', href: 'https://szumi32.github.io/baranska-stomatolog/' },
    { cat: 'E-commerce',  name: 'SOLUM',          desc: 'Sklep z bransoletkami i breloczkami z kamieni naturalnych — jasny, spokojny, zorientowany na produkt.', scope: 'Sklep, koszyk, katalog', url: 'szumi32.github.io/solum', href: 'https://szumi32.github.io/solum/' },
    { cat: 'Gaming',      name: 'Furia RolePlay', desc: 'Portal serwera RP — sklep, ranking, podania, regulamin i panel administracji.', scope: 'Portal, sklep, panel', url: 'furiarp.eu', href: 'https://www.furiarp.eu/#top' },
  ];
  const N = projects.length;
  const scenes = $$('.scene'), glows = $$('.tour__glows i'), navBtns = $$('#tourNav button');
  const info = { idx: $('#tourIdx'), cat: $('#tourCat'), name: $('#tourName'), desc: $('#tourDesc'), scope: $('#tourScope'), url: $('#tourUrl'), link: $('#tourLink') };
  const cardEl = $('.tour__card');
  let active = -1;

  function setActive(i) {
    if (i === active) return;
    active = i;
    const p = projects[i];
    // karta: krótki zjazd w dół i powrót z nową treścią
    gsap.timeline()
      .to(cardEl, { y: 14, opacity: 0, duration: .22, ease: 'power2.in' })
      .add(() => {
        info.idx.textContent = String(i + 1).padStart(2, '0'); info.cat.textContent = p.cat; info.name.textContent = p.name;
        info.desc.textContent = p.desc; info.scope.textContent = p.scope; info.url.textContent = p.url;
        info.link.href = p.href; info.link.setAttribute('aria-label', 'Otwórz stronę ' + p.name);
      })
      .to(cardEl, { y: 0, opacity: 1, duration: .6, ease: 'power3.out' });
    glows.forEach((g, k) => gsap.to(g, { opacity: k === i ? 1 : 0, duration: 1, ease: 'power2.out', overwrite: true }));
    navBtns.forEach((b, k) => b.classList.toggle('is-on', k === i));
    scenes.forEach((s, k) => { s.classList.toggle('is-active', k === i); s.tabIndex = k === i ? 0 : -1; });
  }

  // stan początkowy scen: pierwsza widoczna, reszta „daleko za ekranem”
  const farState = { scale: .55, z: -700, y: 90, rotateX: 16, opacity: 0, filter: 'blur(14px)' };
  gsap.set(scenes, { xPercent: -50, yPercent: -50 });
  scenes.forEach((s, i) => gsap.set(s, i === 0 ? { scale: 1, z: 0, y: 0, rotateX: 0, opacity: 1, filter: 'blur(0px)' } : farState));

  // oś czasu: scena i wjeżdża (c-0.55 → c), potem „przelatuje” obok kamery (c → c+0.55)
  const tourTl = gsap.timeline({ defaults: { ease: 'none' } });
  scenes.forEach((s, i) => {
    if (i > 0) tourTl.fromTo(s, farState, { scale: 1, z: 0, y: 0, rotateX: 0, opacity: 1, filter: 'blur(0px)', duration: .55, immediateRender: false }, i - .55);
    if (i < N - 1) tourTl.to(s, { scale: 1.55, z: 420, y: -40, opacity: 0, filter: 'blur(12px)', duration: .55 }, i);
  });
  // długość osi = N-1, więc scena i leży dokładnie na progresie i/(N-1)

  const tourST = ScrollTrigger.create({
    trigger: '#tour', start: 'top top', end: () => '+=' + innerHeight * CONFIG.tourPerScene * (N - 1),
    pin: true, anticipatePin: 1, scrub: .7, animation: tourTl,
    onUpdate: self => {
      const i = Math.round(self.progress * (N - 1));
      setActive(Math.max(0, Math.min(N - 1, i)));
      gsap.set('#tourRail', { scaleX: self.progress });
    },
  });
  setActive(0);

  // „magnes”: po zatrzymaniu przewijania dociągnij do najbliższej sceny
  // (własny snap zamiast snap ScrollTrigger — działa poprawnie z Lenisem)
  let snapTimer;
  addEventListener('scroll', () => {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      const y = scrollY, span = tourST.end - tourST.start;
      if (y < tourST.start + 4 || y > tourST.end - 4) return;
      const i = Math.round(((y - tourST.start) / span) * (N - 1));
      const target = tourST.start + span * (i / (N - 1));
      if (Math.abs(target - y) > 3) scrollToY(target, .9);
    }, 170);
  }, { passive: true });

  // kliknięcie w kropkę przewija do sceny
  navBtns.forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.i;
    scrollToY(tourST.start + (tourST.end - tourST.start) * (i / (N - 1)), 1.4);
  }));

  /* ---------- 8. PROCES: pień brzozy rośnie, kroki się zapalają ---------- */
  gsap.to('#trunkFill', {
    scaleY: 1, ease: 'none',
    scrollTrigger: { trigger: '#steps', start: 'top 70%', end: 'bottom 60%', scrub: .5 },
  });
  $$('.step').forEach(step => ScrollTrigger.create({
    trigger: step, start: 'top 68%', end: 'bottom 40%',
    onToggle: self => step.classList.toggle('is-on', self.isActive || self.progress === 1),
  }));

  /* ---------- 9. KONTAKT: nagłówek słowo po słowie ---------- */
  gsap.fromTo('.contact__title .w', { yPercent: 60, opacity: 0, rotate: 3 }, {
    yPercent: 0, opacity: 1, rotate: 0, duration: 1.2, stagger: .1, ease: 'power4.out',
    scrollTrigger: { trigger: '.contact__title', start: 'top 85%', once: true },
  });

  /* ---------- 10. NAGŁÓWEK: schowaj przy zjeździe, pokaż przy powrocie ---------- */
  const header = $('#siteHeader');
  let lastY = 0, hidden = false;
  addEventListener('scroll', () => {
    const y = scrollY, down = y > lastY; lastY = y;
    header.classList.toggle('is-solid', y > 40);
    // chowamy tylko poza przypiętymi scenami, żeby nawigacja była pod ręką w hero i „wizycie”
    const pinned = (y < innerHeight * CONFIG.heroScroll) || (y >= tourST.start && y <= tourST.end);
    const want = down && !pinned && y > innerHeight * 2;
    if (!pinned && !down) { if (hidden) { hidden = false; gsap.to(header, { yPercent: 0, duration: .6, ease: 'power3.out', overwrite: true }); } }
    else if (pinned && hidden) { hidden = false; gsap.to(header, { yPercent: 0, duration: .6, ease: 'power3.out', overwrite: true }); }
    else if (want && !hidden && headerReady) { hidden = true; gsap.to(header, { yPercent: -100, duration: .6, ease: 'power3.out', overwrite: true }); }
  }, { passive: true });

  addEventListener('load', () => ScrollTrigger.refresh());
})();
