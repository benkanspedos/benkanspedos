/* benkanspedos.com, scroll variation B: "The Long Drive".
   One continuous road, dawn to night. Scroll drives a truck from a vacant
   lot to a lit porch; the world is drawn on a canvas every frame, no image
   assets. Without JS, or with reduced motion, the page is a plain stacked
   document and each section gets one still frame of the same world. */
(function () {
  'use strict';

  var d = document, html = d.documentElement, win = window;
  var qs = location.search;
  var REDUCE = /[?&]static\b/.test(qs) ||
    (!/[?&]motion\b/.test(qs) && win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (!d.createElement('canvas').getContext) return;

  /* ---------------------------------------------------------- math */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sat(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function range(v, a, b) { return sat((v - a) / (b - a)); }
  function smooth(t) { t = sat(t); return t * t * (3 - 2 * t); }
  function easeOut(t) { t = sat(t); return 1 - Math.pow(1 - t, 3); }
  function easeIO(t) { t = sat(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeBack(t) { t = sat(t); var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function noise1(seed) {
    var r = rng(seed), vals = [], i;
    for (i = 0; i < 512; i++) vals.push(r());
    return function (x) {
      var i0 = Math.floor(x), f = x - i0; f = f * f * (3 - 2 * f);
      var a = vals[((i0 % 512) + 512) % 512], b = vals[(((i0 + 1) % 512) + 512) % 512];
      return a + (b - a) * f;
    };
  }

  /* ---------------------------------------------------------- color (OKLab) */
  function toLin(c) { c /= 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); }
  function toSrgb(c) { c = c <= .0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - .055; return Math.round(sat(c) * 255); }
  var LAB = {};
  function col(hex) {
    var v = LAB[hex]; if (v) return v;
    var n = parseInt(hex.slice(1), 16), r = toLin(n >> 16 & 255), g = toLin(n >> 8 & 255), b = toLin(n & 255);
    var l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b),
        m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b),
        s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
    return (LAB[hex] = [
      .2104542553 * l + .793617785 * m - .0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + .4505937099 * s,
      .0259040371 * l + .7827717662 * m - .808675766 * s]);
  }
  function css(L, alpha) {
    var l = L[0] + .3963377774 * L[1] + .2158037573 * L[2],
        m = L[0] - .1055613458 * L[1] - .0638541728 * L[2],
        s = L[0] - .0894841775 * L[1] - 1.291485548 * L[2];
    l = l * l * l; m = m * m * m; s = s * s * s;
    var r = toSrgb(4.0767416621 * l - 3.3077115913 * m + .2309699292 * s),
        g = toSrgb(-1.2684380046 * l + 2.6097574011 * m - .3413193965 * s),
        b = toSrgb(-.0041960863 * l - .7034186147 * m + 1.707614701 * s);
    return alpha == null ? 'rgb(' + r + ',' + g + ',' + b + ')' : 'rgba(' + r + ',' + g + ',' + b + ',' + alpha.toFixed(3) + ')';
  }
  function mixL(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  /* Time-of-day keys. `near` is what close things are tinted toward (their
     silhouette color), `far` is the haze distant layers dissolve into. */
  var KEYS = [
    { t: 0,   sky: ['#232150', '#4b3a78', '#b9668a', '#f6b88c'], near: '#2c2148', far: '#9a7aa6', amt: .78, haze: .86, night: .5,  star: .35, sun: '#ffe3b8', glow: '#ff9f7a', hud: '#fff4e2', cloud: '#e29aa6' },
    { t: .22, sky: ['#5fb0c6', '#8fcbd0', '#cfe6d2', '#f7ebc9'], near: '#e9d9b0', far: '#a9c6cf', amt: 0,   haze: .78, night: 0,   star: 0,   sun: '#fffbe6', glow: '#fff2c2', hud: '#13212a', cloud: '#ffffff' },
    { t: .45, sky: ['#3f9cc4', '#6fb9d0', '#b5dcd6', '#eaf0d2'], near: '#f0d9a8', far: '#93b9cc', amt: 0,   haze: .72, night: 0,   star: 0,   sun: '#ffffff', glow: '#fff6d0', hud: '#10202a', cloud: '#fbfbf2' },
    { t: .56, sky: ['#c3dcc6', '#e6e2b2', '#f8da94', '#fdc874'], near: '#8a4f34', far: '#dcb89c', amt: .26, haze: .74, night: 0,   star: 0,   sun: '#fffbe0', glow: '#ffe9b0', hud: '#1a1d24', cloud: '#fff1d0' },
    { t: .66, sky: ['#ee7f4a', '#f39a52', '#f8bd66', '#fde493'], near: '#3a123e', far: '#d86a7c', amt: .8,  haze: .82, night: .35, star: 0,   sun: '#fff6c4', glow: '#ffd27a', hud: '#2a0f2a', cloud: '#ffdca6' },
    { t: .74, sky: ['#5a2f78', '#b3477c', '#ef7a5c', '#ffbd66'], near: '#2a1038', far: '#a04f86', amt: .88, haze: .8,  night: .65, star: .15, sun: '#ffb070', glow: '#ff8a5c', hud: '#fff4e2', cloud: '#f08a7a' },
    { t: .82, sky: ['#15174a', '#3a2a72', '#8f3f7c', '#e86a70'], near: '#151238', far: '#5a3f86', amt: .88, haze: .8,  night: .9,  star: .6,  sun: '#ff8a70', glow: '#ff7a6a', hud: '#fff4e2', cloud: '#7a4a8a' },
    { t: 1,   sky: ['#050920', '#0a1338', '#12245a', '#1f3f7a'], near: '#070c24', far: '#1c2f66', amt: .88, haze: .78, night: 1,   star: 1,   sun: '#1f3f7a', glow: '#1f3f7a', hud: '#fff4e2', cloud: '#1a2a5a' }
  ].map(function (k) {
    return { t: k.t, sky: k.sky.map(col), near: col(k.near), far: col(k.far), amt: k.amt, haze: k.haze, night: k.night,
      star: k.star, sun: col(k.sun), glow: col(k.glow), hud: col(k.hud), cloud: col(k.cloud) };
  });
  function palette(T) {
    var i = 0; while (i < KEYS.length - 2 && T > KEYS[i + 1].t) i++;
    var a = KEYS[i], b = KEYS[i + 1], u = sat((T - a.t) / (b.t - a.t));
    return {
      sky: [mixL(a.sky[0], b.sky[0], u), mixL(a.sky[1], b.sky[1], u), mixL(a.sky[2], b.sky[2], u), mixL(a.sky[3], b.sky[3], u)],
      near: mixL(a.near, b.near, u), far: mixL(a.far, b.far, u),
      amt: lerp(a.amt, b.amt, u), haze: lerp(a.haze, b.haze, u), night: lerp(a.night, b.night, u), star: lerp(a.star, b.star, u),
      sun: mixL(a.sun, b.sun, u), glow: mixL(a.glow, b.glow, u), hud: mixL(a.hud, b.hud, u), cloud: mixL(a.cloud, b.cloud, u)
    };
  }

  /* Daylight colors. Everything is drawn in these and tinted by sh(). */
  var C = {
    far: '#7f93a8', mid: '#9a7f86', mesa: '#c27a52',
    bandA: '#d3a268', bandB: '#dcae6c', ground: '#e4b872', front: '#c98f55', fg: '#3b2a26',
    road: '#5a5560', roadEdge: '#8a8088', dash: '#f6e7b8',
    sag: '#4f7d55', sagHi: '#79a873', bush: '#7d9150', bush2: '#93a55c', pv: '#a9b653', oco: '#6c5b3b', ocoTip: '#d4552d',
    pear: '#5f9068', rock: '#b58463', grass: '#b99a55',
    wood: '#7a5a3c', board: '#f6ecd6', boardInk: '#232150', clay: '#d4552d', steel: '#59626b', steelLt: '#a9b1b5', tank: '#aeb8b6',
    stucco: '#eedbb4', terra: '#d58a5f', sage: '#a9bfa6', adobe: '#dba878', white: '#f1ece0', teal: '#2f8088',
    glass: '#44616d', paper: '#f4ecd8', card: '#c9a06a', conc: '#b9b3a6', wash: '#f0dcae', bank: '#c79a62', girder: '#7d4a36',
    steelRed: '#b8482c', crane: '#e9a51f', truck: '#cf5330', truck2: '#f1dfbd', tire: '#27232b', trim: '#e8e2d2', palm: '#4c7a52'
  };
  var DISP = '"Big Shoulders Display","Arial Narrow",Impact,sans-serif';
  var MONO = '"Overpass Mono",ui-monospace,Menlo,monospace';
  var WARM = '255,206,116';

  /* ---------------------------------------------------------- render state */
  var ctx, V, P, shc = {}, visW = 0;
  var HARD = 215, FRONT = 108;

  function sh(hex, depth, alpha) {
    var key = depth ? hex + depth : hex;
    if (alpha == null && shc[key]) return shc[key];
    var c = mixL(col(hex), P.near, P.amt);
    if (depth) c = mixL(c, P.far, Math.min(1, depth * P.haze));
    var out = css(c, alpha);
    if (alpha == null) shc[key] = out;
    return out;
  }
  /* A color that keeps some of its daylight identity after dark (lit things). */
  function shk(hex, keep) { return css(mixL(col(hex), P.near, P.amt * (1 - keep))); }
  function plane(f, yoff) { var k = V.s * V.dpr; ctx.setTransform(k, 0, 0, k, -V.cam * f * k, (V.gy + (yoff || 0)) * V.dpr); }
  function screen() { ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0); }
  function off(a, b) { return b < V.cam - 60 || a > V.cam + visW + 60; }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function circ(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); }
  function txt(str, x, y, size, weight, fam, color) {
    ctx.font = weight + ' ' + size + 'px ' + fam; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color; ctx.fillText(str, x, y);
  }
  function glow(x, y, r, rgb, a) {
    if (a <= .004) return;
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  var SHADE = 'rgba(26,12,40,.17)';

  /* ---------------------------------------------------------- chapters */
  var CH = [
    { id: 'hero',     L: 700,  vh: .85, vhN: .75,  t: 0,   drift: .3 },
    { id: 'find',     L: 1350, vh: 1.45, vhN: 1.3, t: .22, drift: .3 },
    { id: 'build',    L: 1450, vh: 1.55, vhN: 1.4, t: .45, drift: .3 },
    { id: 'stick',    L: 1500, vh: 1.55, vhN: 1.4, t: .66, drift: .06 },
    { id: 'receipts', L: 1500, vh: 1.4, vhN: 2,    t: .82, drift: .4 },
    { id: 'engage',   L: 1400, vh: 1.4, vhN: 2,    t: .93, drift: .5 },
    { id: 'contact',  L: 650,  vh: .8,             t: 1,   drift: 0 }
  ];
  var CAMMAX = 0;
  (function () { var x = 0; CH.forEach(function (c) { c.x0 = x; x += c.L; c.x1 = x; }); CAMMAX = x; })();
  function chap(id) { for (var i = 0; i < CH.length; i++) if (CH[i].id === id) return CH[i]; return null; }

  /* ---------------------------------------------------------- the world */
  var G = {}, MAXVIS = 2600;

  function ridge(seed, len, step, amp, base, freq, octs, shape) {
    var n = noise1(seed), out = [], x, o;
    for (x = 0; x <= len; x += step) {
      var v = 0, a = 1, f = freq, tot = 0;
      for (o = 0; o < octs; o++) { v += n(x * f + o * 37.13) * a; tot += a; a *= .5; f *= 2.07; }
      v /= tot; if (shape) v = shape(v);
      out.push(base + v * amp);
    }
    return out;
  }
  function inZone(x, pad) {
    for (var i = 0; i < G.zones.length; i++) if (x > G.zones[i][0] - pad && x < G.zones[i][1] + pad) return true;
    return false;
  }
  function makePlant(x, y, k, r, allow) {
    var q = r(), p = { x: x, y: y }, i, n;
    if (q < .2 && allow !== 'low') {
      p.kind = 0; p.h = (60 + r() * 86) * k; p.arms = [];
      n = r() < .22 ? 0 : (r() < .55 ? 1 : (r() < .8 ? 2 : 3));
      var side = r() < .5 ? 1 : -1;
      for (i = 0; i < n; i++) {
        var at = .32 + r() * .34;
        p.arms.push({ side: side, at: at, out: p.h * (.11 + r() * .07), up: p.h * Math.min(.92 - at, .2 + r() * .26) });
        side = -side;
      }
    } else if (q < .46) {
      p.kind = 1; p.c = r() < .5 ? C.bush : C.bush2; p.b = []; var rad = (7 + r() * 9) * k;
      n = 3 + (r() * 3 | 0);
      for (i = 0; i < n; i++) p.b.push([(r() * 2 - 1) * rad, rad * (.25 + r() * .6), rad * (.5 + r() * .5)]);
    } else if (q < .56 && allow !== 'low') {
      p.kind = 2; p.st = []; n = 6 + (r() * 4 | 0); var oh = (48 + r() * 44) * k;
      for (i = 0; i < n; i++) p.st.push([(i / (n - 1) - .5) * oh * (.7 + r() * .3), oh * (.75 + r() * .25)]);
    } else if (q < .7) {
      p.kind = 3; p.b = []; n = 4 + (r() * 3 | 0); var pr = (7 + r() * 5) * k;
      for (i = 0; i < n; i++) p.b.push([(r() * 2 - 1) * pr * 1.5, pr * (.6 + r() * 1.5), pr * (.55 + r() * .3), pr * (.8 + r() * .3), (r() - .5) * .9]);
    } else if (q < .78) {
      p.kind = 4; p.r = (5 + r() * 4) * k;
    } else if (q < .86 && allow !== 'low') {
      p.kind = 5; p.h = (52 + r() * 34) * k; p.b = [];
      for (i = 0; i < 6; i++) p.b.push([(r() * 2 - 1) * p.h * .42, p.h * (.7 + r() * .4), p.h * (.2 + r() * .14)]);
    } else if (q < .94) {
      p.kind = 6; p.w = (12 + r() * 22) * k; p.h = p.w * (.4 + r() * .3); p.sk = r();
    } else {
      p.kind = 7; p.h = (10 + r() * 10) * k;
    }
    return p;
  }

  function buildWorld(anchor) {
    var a = anchor, X = {}, i, x, r;
    CH.forEach(function (c) { X[c.id] = c.x0; });
    G.sign = X.hero + a + 255;
    G.mill = X.find + a + 300;
    G.stakes = [0, 1, 2, 3].map(function (n) { return X.find + a + 480 + n * 100; });
    G.bld = { x: X.find + a + 880, w: 340, h: 150 };
    G.crate = G.bld.x + G.bld.w + 58;
    G.br = { x0: X.build + a + 700, span: 420 }; G.br.x1 = G.br.x0 + G.br.span;
    G.town = X.stick + a + 400;
    G.lamps = []; for (i = 0; i < 8; i++) G.lamps.push(G.town - 74 + i * 166);
    G.rc = X.receipts + a + 300;
    G.signs = [X.engage + a + 400, X.engage + a + 790, X.engage + a + 1180];
    var tight = a < 150; G.end = CAMMAX + a; G.mail = G.end + (tight ? 100 : 128); G.office = G.end + (tight ? 150 : 196);
    G.zones = [
      [G.sign - 170, G.sign + 260], [G.mill - 50, G.mill + 120], [G.bld.x - 110, G.crate + 80],
      [G.br.x0 - 200, G.br.x1 + 90], [G.town - 100, G.town + 1130], [G.rc - 30, G.rc + 1160],
      [G.signs[0] - 30, G.signs[0] + 30], [G.signs[1] - 30, G.signs[1] + 30], [G.signs[2] - 30, G.signs[2] + 30],
      [G.mail - 40, G.office + 300]
    ];
    var xMax = CAMMAX + MAXVIS;

    /* main-plane plants */
    r = rng(11); G.plants = []; x = -260;
    while (x < xMax) {
      x += 46 + r() * 150;
      if (inZone(x, 16)) continue;
      G.plants.push(makePlant(x, -15 + r() * 10, 1, r));
    }
    G.plants.sort(function (p, q) { return p.y - q.y; });
    /* a hand-placed saguaro to frame the first view */
    G.plants.push({ kind: 0, x: G.sign + 300, y: -8, h: 168, arms: [{ side: -1, at: .42, out: 24, up: 62 }, { side: 1, at: .56, out: 22, up: 50 }] });

    /* poles and wires */
    G.poles = [];
    for (x = -180; x < xMax; x += 270) if (!inZone(x, 40)) G.poles.push(x);

    /* depth bands */
    G.bandA = scatterBand(21, .62, xMax, 60, .5);
    G.bandB = scatterBand(22, .8, xMax, 90, .72);

    /* front-of-road details and the foreground silhouettes */
    r = rng(31); G.frontBits = []; x = -200;
    while (x < xMax) { x += 60 + r() * 190; if (x > G.br.x0 - 90 && x < G.br.x1 + 90) continue; G.frontBits.push(makePlant(x, 44 + r() * 30, .8, r, 'low')); }
    r = rng(41); G.fg = []; x = -300;
    while (x < xMax * 1.5) {
      x += 240 + r() * 620;
      var q = r(), it = { x: x, kind: q < .34 ? 0 : q < .62 ? 1 : q < .84 ? 2 : 3, h: 52 + r() * 46, v: r() };
      G.fg.push(it);
    }

    /* ridges */
    var s1 = 8, s2 = 8, s3 = 6;
    G.far = { f: .1, step: s1, depth: 1, col: C.far, top: 320, h: ridge(3, xMax * .1 + MAXVIS, s1, 250, 60, 1 / 460, 4, function (v) { return Math.pow(v, 1.35); }) };
    G.mid = { f: .22, step: s2, depth: .72, col: C.mid, top: 220, h: ridge(5, xMax * .22 + MAXVIS, s2, 150, 36, 1 / 250, 4) };
    G.mesa = { f: .42, step: s3, depth: .42, col: C.mesa, top: 170, h: ridge(9, xMax * .42 + MAXVIS, s3, 138, 14, 1 / 330, 3, function (v) {
      var q = clamp(v * 1.5 - .25, 0, .999) * 3, fl = Math.floor(q), fr = q - fl; return (fl + smooth(range(fr, .34, .66))) / 3;
    }) };
    G.dune = noise1(17);

    /* sky furniture */
    r = rng(51); G.stars = [];
    for (i = 0; i < 190; i++) G.stars.push({ x: r(), y: Math.pow(r(), 1.3), r: .9 + r() * 1.7, a: .55 + r() * .45, sp: .0012 + r() * .003, ph: r() * 6.28 });
    for (i = 0; i < 230; i++) { var mx = r(); G.stars.push({ x: mx, y: clamp(.12 + mx * .5 + (r() + r() + r() - 1.5) * .13, 0, 1), r: .5 + r() * .7, a: .25 + r() * .4, sp: .001 + r() * .002, ph: r() * 6.28 }); }
    r = rng(61); G.clouds = [];
    for (x = -200; x < xMax * .06 + MAXVIS; x += 190 + r() * 320) G.clouds.push({ x: x, y: 250 + r() * 330, w: 110 + r() * 150, n: 2 + (r() * 2 | 0), v: r() });
  }
  function scatterBand(seed, f, xMax, gap, k) {
    var r = rng(seed), out = [], x = -200;
    while (x < xMax * f + MAXVIS) { x += gap * (.4 + r() * 1.5); out.push(makePlant(x, 0, k, r)); }
    return out;
  }

  /* ---------------------------------------------------------- sky */
  function drawSky() {
    screen();
    var g = ctx.createLinearGradient(0, 0, 0, V.gy);
    g.addColorStop(0, css(P.sky[0])); g.addColorStop(.48, css(P.sky[1])); g.addColorStop(.8, css(P.sky[2])); g.addColorStop(1, css(P.sky[3]));
    ctx.fillStyle = g; ctx.fillRect(0, 0, V.W, V.gy + 2);
  }
  function drawStars() {
    var a = P.star; if (a < .02) return;
    var w = V.W * 1.3, hh = V.gy * .94, i, st, k = V.W < 700 ? .8 : 1;
    ctx.fillStyle = '#fff';
    for (i = 0; i < G.stars.length; i++) {
      st = G.stars[i];
      var x = ((st.x * w - V.cam * .016 * V.s) % w + w) % w - V.W * .15, y = st.y * hh;
      var tw = V.still ? .85 : .6 + .4 * Math.sin(V.now * st.sp + st.ph);
      ctx.globalAlpha = a * st.a * tw * (1 - .75 * range(y, hh * .72, hh));
      var rr_ = st.r * k; ctx.fillRect(x, y, rr_, rr_);
    }
    ctx.globalAlpha = 1;
    /* a shooting star every so often, deep night only */
    if (!V.still && a > .8) {
      var cyc = V.now / 7000, ph = cyc - Math.floor(cyc), n = Math.floor(cyc);
      if (ph < .09) {
        var u = ph / .09, sx = V.W * (.25 + hash(n) * .6), sy = V.gy * (.08 + hash(n + 9) * .25), len = 130 * V.s;
        var x1 = sx - u * len * 1.6, y1 = sy + u * len * .7;
        var g = ctx.createLinearGradient(x1, y1, x1 + len * .6, y1 - len * .26);
        g.addColorStop(0, 'rgba(255,255,255,' + (.9 * Math.sin(u * 3.1416)).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + len * .6, y1 - len * .26); ctx.stroke();
      }
    }
  }
  function drawMoon() {
    var a = range(V.T, .74, .86); if (a <= 0) return;
    var s = V.s, nar = V.W < 700, r = (nar ? 46 : 56) * s, x = V.W * (nar ? .84 : .84);
    var y = V.gy - lerp(30, nar ? 200 : 236, smooth(range(V.T, .74, 1))) * s;
    glow(x, y, r * 3.2, '255,236,196', .22 * a);
    ctx.fillStyle = 'rgba(255,241,210,' + a.toFixed(3) + ')'; circ(x, y, r);
    ctx.fillStyle = 'rgba(214,196,176,' + (.5 * a).toFixed(3) + ')';
    circ(x - r * .3, y - r * .22, r * .2); circ(x + r * .28, y + r * .18, r * .27); circ(x - r * .08, y + r * .46, r * .12); circ(x + r * .4, y - r * .4, r * .1);
  }
  function drawSun() {
    var u = (V.T + .03) / .775; if (u > 1.1) return;
    var s = V.s, arc = V.gy - 90, lift = Math.pow(Math.max(0, Math.sin(3.1416 * clamp(u, 0, 1))), 1.25) - range(u, 1, 1.1) * .2;
    var x = lerp(V.W * .8, V.W * .17, sat(u)), y = V.gy - 26 * s - lift * arc * .9;
    /* at first light the sun sits on the far ridge wherever the ridge happens to be */
    var L = G.far, ri = clamp(Math.round((V.cam * L.f + x / s) / L.step), 0, L.h.length - 1);
    y = lerp(V.gy - (L.h[ri] + 6) * s, y, smooth(range(V.T, .03, .2)));
    var low = 1 - sat(lift * 1.6), r = lerp(30, 50, low) * s;
    glow(x, y, r * lerp(3.4, 6, low), css(P.glow).slice(4, -1), lerp(.5, .62, low));
    if (low > .05) {
      ctx.strokeStyle = css(P.sun, .16 * low); ctx.lineWidth = r * .34;
      ctx.beginPath(); ctx.arc(x, y, r * 1.62, 0, 6.2832); ctx.stroke();
      ctx.strokeStyle = css(P.sun, .09 * low);
      ctx.beginPath(); ctx.arc(x, y, r * 2.34, 0, 6.2832); ctx.stroke();
    }
    ctx.fillStyle = css(P.sun, lerp(.62, 1, low)); circ(x, y, r);
  }
  function drawClouds() {
    var vis = Math.max(0, 1 - P.night * 1.25); if (vis < .05) return;
    plane(.06);
    var drift = V.still ? 0 : V.now * .0022, x0 = V.cam * .06 - 300, x1 = x0 + visW + 600, i, j;
    ctx.fillStyle = css(mixL(P.sky[1], P.cloud, .8), .46 * vis);
    for (i = 0; i < G.clouds.length; i++) {
      var c = G.clouds[i], cx = c.x + drift; if (cx + c.w < x0 || cx > x1) continue;
      var h = 13 + c.v * 8;
      for (j = 0; j < c.n; j++) {
        var w = c.w * (j === 0 ? 1 : .55 + c.v * .3), ox = j === 0 ? 0 : c.w * (.12 + c.v * .2) * (j % 2 ? 1 : -.4);
        rr(cx + ox, -c.y - j * h * .72, w, h, h / 2); ctx.fill();
      }
    }
  }

  function drawBirds() {
    var a = range(V.T, .1, .2) * (1 - range(V.T, .5, .62)); if (a <= .01 || V.still) return;
    screen();
    var s = V.s, span = V.W + 500 * s, x = V.W + 100 * s - ((V.now * .03 * s + V.cam * .22 * s) % span + span) % span, i;
    ctx.strokeStyle = css(mixL(P.sky[0], col('#13212a'), .7), a); ctx.lineWidth = 1.5 * s; ctx.lineCap = 'round'; ctx.beginPath();
    for (i = 0; i < 6; i++) {
      var bx = x + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 20 * s + Math.ceil(i / 2) * 9 * s, by = V.gy - (250 + Math.ceil(i / 2) * 12) * s + Math.sin(V.now * .0015 + i) * 5 * s;
      var fl = Math.sin(V.now * .011 + i * 1.3) * 4.5 * s;
      ctx.moveTo(bx - 7 * s, by - fl); ctx.quadraticCurveTo(bx - 3 * s, by - 1.5 * s, bx, by + 1.5 * s); ctx.quadraticCurveTo(bx + 3 * s, by - 1.5 * s, bx + 7 * s, by - fl);
    }
    ctx.stroke(); ctx.lineCap = 'butt';
  }
  var TRAIN = [C.steel, C.clay, C.teal, C.truck2, C.clay, C.steel, C.sage, C.clay, C.teal];
  function drawTrain() {
    var a = range(V.T, .12, .2) * (1 - range(V.T, .58, .68)); if (a <= .01 || V.still) return;
    var f = .62, loop = visW + 1300, x = V.cam * f + visW + 120 - ((V.now * .028 + V.cam * .35) % loop + loop) % loop, i;
    ctx.globalAlpha = a;
    for (i = 0; i < TRAIN.length; i++) {
      var cx = x + i * 40, y = -58 - G.dune(cx / 150 + 4.2) * 9;
      ctx.fillStyle = sh(TRAIN[i], .3);
      if (i === 0) { ctx.fillRect(cx, y - 15, 36, 13); ctx.fillRect(cx + 22, y - 20, 12, 6); }
      else ctx.fillRect(cx, y - 13, 36, 11);
      ctx.fillStyle = sh(C.tire, .3); ctx.fillRect(cx + 3, y - 2.5, 30, 2.5);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------------------------------------------------- land */
  function drawRidge(L) {
    plane(L.f);
    var x0 = V.cam * L.f - 16, st = L.step, i0 = Math.max(0, Math.floor(x0 / st)), i1 = Math.min(L.h.length - 1, Math.ceil((x0 + visW + 32) / st)), i;
    var g = ctx.createLinearGradient(0, -L.top, 0, 0);
    g.addColorStop(0, sh(L.col, L.depth)); g.addColorStop(1, sh(L.col, Math.min(1.25, L.depth + .3)));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(i0 * st, 4);
    for (i = i0; i <= i1; i++) ctx.lineTo(i * st, -L.h[i]);
    ctx.lineTo(i1 * st, 4); ctx.closePath(); ctx.fill();
  }
  function drawBand(items, f, top, color, depth, seedOff) {
    plane(f);
    var x0 = V.cam * f - 30, x1 = x0 + visW + 60, x, i;
    ctx.fillStyle = sh(color, depth); ctx.beginPath(); ctx.moveTo(x0, 6);
    for (x = Math.floor(x0 / 40) * 40; x <= x1 + 40; x += 40) ctx.lineTo(x, -top - G.dune(x / 150 + seedOff) * 9);
    ctx.lineTo(x1 + 40, 6); ctx.closePath(); ctx.fill();
    for (i = 0; i < items.length; i++) {
      var p = items[i]; if (p.x < x0 - 60 || p.x > x1 + 60) continue;
      p.y = -top - G.dune(p.x / 150 + seedOff) * 9 + 3;
      drawPlant(p, depth);
    }
  }
  function drawGround() {
    plane(1);
    var x0 = V.cam - 30, x1 = x0 + visW + 60, x, bot = V.bot;
    ctx.fillStyle = sh(C.ground); ctx.beginPath(); ctx.moveTo(x0, 4);
    for (x = Math.floor(x0 / 40) * 40; x <= x1 + 40; x += 40) ctx.lineTo(x, -15 - G.dune(x / 170) * 7);
    ctx.lineTo(x1 + 40, 4); ctx.closePath(); ctx.fill();
    ctx.fillRect(x0, 0, x1 - x0, 32);
    ctx.fillStyle = sh(C.front); ctx.fillRect(x0, 30, x1 - x0, bot - 30);
    /* a lighter lip where the shoulder drops away */
    ctx.fillStyle = sh(C.bandB); ctx.fillRect(x0, 30, x1 - x0, 3);
  }
  function drawWash() {
    var b = G.br, x0 = b.x0, x1 = b.x1; if (off(x0 - 140, x1 + 140)) return;
    var bot = V.bot, xm = (x0 + x1) / 2;
    ctx.fillStyle = sh(C.wash); ctx.beginPath();
    ctx.moveTo(x0 + 92, -18); ctx.lineTo(x1 - 92, -18); ctx.lineTo(x1 - 6, 30); ctx.lineTo(x1 + 66, bot); ctx.lineTo(x0 - 66, bot); ctx.lineTo(x0 + 6, 30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = sh(C.bank); ctx.beginPath();
    ctx.moveTo(x0 + 92, -18); ctx.lineTo(x0 + 6, 30); ctx.lineTo(x0 - 66, bot); ctx.lineTo(x0 - 38, bot); ctx.lineTo(x0 + 24, 30); ctx.lineTo(x0 + 104, -18); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x1 - 92, -18); ctx.lineTo(x1 - 6, 30); ctx.lineTo(x1 + 66, bot); ctx.lineTo(x1 + 38, bot); ctx.lineTo(x1 - 24, 30); ctx.lineTo(x1 - 104, -18); ctx.closePath(); ctx.fill();
    /* the stream takes its color from the sky above it */
    ctx.fillStyle = css(mixL(P.sky[1], P.sky[3], .35), .9); ctx.beginPath();
    ctx.moveTo(xm - 8, -18); ctx.quadraticCurveTo(xm + 34, 10, xm - 30, 44); ctx.quadraticCurveTo(xm - 70, 70, xm - 46, bot);
    ctx.lineTo(xm + 44, bot); ctx.quadraticCurveTo(xm + 4, 74, xm + 22, 46); ctx.quadraticCurveTo(xm + 58, 12, xm + 8, -18); ctx.closePath(); ctx.fill();
  }
  function dashes(xa, xb, yo) {
    ctx.fillStyle = sh(C.dash);
    for (var x = Math.floor(xa / 66) * 66; x < xb; x += 66) {
      var a = Math.max(x, xa), b = Math.min(x + 34, xb);
      if (b > a) ctx.fillRect(a, 14 + yo, b - a, 3);
    }
  }
  function roadPiece(xa, xb) {
    if (xb <= xa) return;
    ctx.fillStyle = sh(C.road); ctx.fillRect(xa, 0, xb - xa, 30);
    ctx.fillStyle = sh(C.roadEdge); ctx.fillRect(xa, 0, xb - xa, 1.6); ctx.fillRect(xa, 28, xb - xa, 2);
    dashes(xa, xb, 0);
  }
  function drawRoad() {
    plane(1);
    var x0 = V.cam - 30, x1 = x0 + visW + 60, b = G.br;
    roadPiece(x0, Math.min(x1, b.x0 + 6)); roadPiece(Math.max(x0, b.x1 - 6), x1);
  }

  /* ---------------------------------------------------------- plants */
  function drawPlant(p, depth) {
    var x = p.x, y = p.y, i, b;
    switch (p.kind) {
      case 0:
        var h = p.h, w = Math.max(3, h * .15);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = sh(C.sag, depth); ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(x, y - w * .5); ctx.lineTo(x, y - h + w * .5); ctx.stroke();
        ctx.lineWidth = w * .74; ctx.beginPath();
        for (i = 0; i < p.arms.length; i++) {
          var a = p.arms[i], ay = y - h * a.at, ox = x + a.side * (w * .5 + a.out);
          ctx.moveTo(x + a.side * w * .2, ay); ctx.quadraticCurveTo(ox, ay, ox, ay - a.out * .7); ctx.lineTo(ox, ay - a.up);
        }
        ctx.stroke();
        ctx.strokeStyle = sh(C.sagHi, depth); ctx.lineWidth = w * .17;
        ctx.beginPath(); ctx.moveTo(x - w * .2, y - w * .6); ctx.lineTo(x - w * .2, y - h + w * .7); ctx.stroke();
        ctx.lineCap = 'butt';
        break;
      case 1:
        ctx.fillStyle = sh(p.c, depth); ctx.beginPath();
        for (i = 0; i < p.b.length; i++) { b = p.b[i]; ctx.moveTo(x + b[0] + b[2], y - b[1]); ctx.arc(x + b[0], y - b[1], b[2], 0, 6.2832); }
        ctx.fill();
        break;
      case 2:
        ctx.strokeStyle = sh(C.oco, depth); ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.beginPath();
        for (i = 0; i < p.st.length; i++) { b = p.st[i]; ctx.moveTo(x, y); ctx.quadraticCurveTo(x + b[0] * .25, y - b[1] * .6, x + b[0], y - b[1]); }
        ctx.stroke(); ctx.lineCap = 'butt';
        ctx.fillStyle = sh(C.ocoTip, depth);
        for (i = 0; i < p.st.length; i++) { b = p.st[i]; circ(x + b[0], y - b[1], 2); }
        break;
      case 3:
        ctx.fillStyle = sh(C.pear, depth);
        for (i = 0; i < p.b.length; i++) { b = p.b[i]; ctx.beginPath(); ctx.ellipse(x + b[0], y - b[1], b[2], b[3], b[4], 0, 6.2832); ctx.fill(); }
        break;
      case 4:
        ctx.fillStyle = sh(C.sag, depth); ctx.beginPath(); ctx.ellipse(x, y - p.r * .9, p.r, p.r * 1.05, 0, 0, 6.2832); ctx.fill();
        ctx.fillStyle = sh(C.crane, depth); circ(x, y - p.r * 1.9, p.r * .34);
        break;
      case 5:
        ctx.strokeStyle = sh(C.oco, depth); ctx.lineWidth = Math.max(2, p.h * .05); ctx.lineCap = 'round'; ctx.beginPath();
        ctx.moveTo(x, y); ctx.lineTo(x - p.h * .05, y - p.h * .4); ctx.lineTo(x - p.h * .24, y - p.h * .7);
        ctx.moveTo(x - p.h * .05, y - p.h * .4); ctx.lineTo(x + p.h * .22, y - p.h * .74); ctx.stroke(); ctx.lineCap = 'butt';
        ctx.fillStyle = sh(C.pv, depth); ctx.beginPath();
        for (i = 0; i < p.b.length; i++) { b = p.b[i]; ctx.moveTo(x + b[0] + b[2], y - b[1]); ctx.arc(x + b[0], y - b[1], b[2], 0, 6.2832); }
        ctx.fill();
        break;
      case 6:
        ctx.fillStyle = sh(C.rock, depth); ctx.beginPath();
        ctx.moveTo(x - p.w * .5, y); ctx.lineTo(x - p.w * .36, y - p.h * .8); ctx.lineTo(x - p.w * (.1 - p.sk * .2), y - p.h); ctx.lineTo(x + p.w * .34, y - p.h * .7); ctx.lineTo(x + p.w * .5, y);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = SHADE; ctx.beginPath(); ctx.moveTo(x - p.w * (.1 - p.sk * .2), y - p.h); ctx.lineTo(x + p.w * .34, y - p.h * .7); ctx.lineTo(x + p.w * .5, y); ctx.lineTo(x + p.w * .1, y); ctx.closePath(); ctx.fill();
        break;
      default:
        ctx.strokeStyle = sh(C.grass, depth); ctx.lineWidth = 1.3; ctx.beginPath();
        for (i = -2; i <= 2; i++) { ctx.moveTo(x, y); ctx.lineTo(x + i * p.h * .28, y - p.h * (1 - Math.abs(i) * .16)); }
        ctx.stroke();
    }
  }
  function drawPoles() {
    plane(1);
    var i, x, nx;
    ctx.strokeStyle = sh(C.wood); ctx.fillStyle = sh(C.wood);
    for (i = 0; i < G.poles.length; i++) {
      x = G.poles[i]; nx = G.poles[i + 1];
      if (x > V.cam + visW + 300) break;
      if (x < V.cam - 320) continue;
      ctx.fillRect(x - 2, -152, 4, 140); ctx.fillRect(x - 17, -146, 34, 3);
      if (nx && nx - x < 300) {
        ctx.lineWidth = .8; ctx.beginPath();
        ctx.moveTo(x - 15, -146); ctx.quadraticCurveTo((x + nx) / 2 - 15, -118, nx - 15, -146);
        ctx.moveTo(x + 15, -146); ctx.quadraticCurveTo((x + nx) / 2 + 15, -120, nx + 15, -146);
        ctx.stroke();
      }
    }
  }

  /* ---------------------------------------------------------- set pieces */
  function tumble(x, y, r, rot) {
    ctx.strokeStyle = sh(C.grass); ctx.lineWidth = 1; ctx.beginPath();
    for (var i = 0; i < 6; i++) { var a = rot + i * 1.05; ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.arc(x + Math.cos(a + .7) * r * .22, y + Math.sin(a + .7) * r * .22, r * (.78 + (i % 3) * .1), a, a + 2.5); }
    ctx.stroke();
  }
  function pieceSign() {
    var x = G.sign; if (off(x - 200, x + 520)) return;
    var i;
    ctx.fillStyle = sh(C.wood);
    for (i = -3; i <= 5; i++) ctx.fillRect(x + i * 48 - 1.4, -38, 2.8, 30);
    ctx.strokeStyle = sh(C.wood); ctx.lineWidth = .9; ctx.beginPath();
    ctx.moveTo(x - 146, -31); ctx.lineTo(x + 242, -31); ctx.moveTo(x - 146, -19); ctx.lineTo(x + 242, -19); ctx.stroke();
    ctx.fillRect(x - 62, -102, 7, 96); ctx.fillRect(x + 55, -102, 7, 96);
    ctx.fillStyle = shk(C.board, .58); rr(x - 90, -192, 180, 98, 4); ctx.fill();
    ctx.strokeStyle = sh(C.boardInk); ctx.lineWidth = 2; rr(x - 84, -186, 168, 86, 2); ctx.stroke();
    txt('COMING SOON', x, -166, 13, '600', MONO, sh(C.boardInk));
    txt('A.I.', x, -121, 56, '900', DISP, shk(C.clay, .5));
    txt('COMPLETION DATE: TBD', x, -106, 8.4, '600', MONO, sh(C.boardInk));
    /* one tumbleweed snagged on the fence, one that never stops crossing the lot */
    tumble(x + 152, -17, 10, .6);
    if (!V.still) {
      var t = (V.now * .00007) % 1, tx = x - 260 + t * 760, hop = Math.abs(Math.sin(t * 28)) * 9;
      tumble(tx, -9 - hop, 8, t * 60);
    }
  }
  function pieceMill() {
    var x = G.mill; if (off(x - 80, x + 130)) return;
    var i;
    ctx.strokeStyle = sh(C.steel); ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(x - 24, -8); ctx.lineTo(x - 4, -150); ctx.moveTo(x + 24, -8); ctx.lineTo(x + 4, -150);
    for (i = 0; i < 4; i++) {
      var y1 = -8 - i * 35.5, y2 = y1 - 35.5, w1 = 24 - i * 5, w2 = 24 - (i + 1) * 5;
      ctx.moveTo(x - w1, y1); ctx.lineTo(x + w2, y2); ctx.moveTo(x + w1, y1); ctx.lineTo(x - w2, y2); ctx.moveTo(x - w2, y2); ctx.lineTo(x + w2, y2);
    }
    ctx.stroke();
    var cy = -160, r = 35, rot = V.still ? .3 : V.now * .0012;
    ctx.fillStyle = shk(C.clay, .3); ctx.beginPath(); ctx.moveTo(x - 4, cy); ctx.lineTo(x - 62, cy - 13); ctx.lineTo(x - 62, cy + 13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = sh(C.steelLt);
    for (i = 0; i < 14; i++) {
      var a = rot + i * 6.2832 / 14;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 8, cy + Math.sin(a) * 8); ctx.lineTo(x + Math.cos(a - .15) * r, cy + Math.sin(a - .15) * r); ctx.lineTo(x + Math.cos(a + .15) * r, cy + Math.sin(a + .15) * r); ctx.fill();
    }
    ctx.strokeStyle = sh(C.steel); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, cy, r, 0, 6.2832); ctx.stroke();
    ctx.fillStyle = sh(C.steel); circ(x, cy, 5);
    ctx.fillStyle = sh(C.tank); ctx.fillRect(x + 46, -54, 62, 38);
    ctx.fillStyle = SHADE; ctx.fillRect(x + 46, -44, 62, 3); ctx.fillRect(x + 46, -30, 62, 3); ctx.fillRect(x + 92, -54, 16, 38);
    ctx.fillStyle = sh(C.steel); ctx.fillRect(x + 50, -16, 4, 10); ctx.fillRect(x + 100, -16, 4, 10); ctx.fillRect(x + 75, -16, 4, 10);
  }
  function pieceStakes() {
    var i, x, last = null;
    if (off(G.stakes[0] - 40, G.bld.x)) return;
    for (i = 0; i < G.stakes.length; i++) {
      x = G.stakes[i];
      var g = easeBack(range(V.px, x - 190, x - 110)); if (g <= 0) continue;
      last = x;
      ctx.fillStyle = sh(C.wood); ctx.fillRect(x - 1.2, -6 - 30 * g, 2.4, 30 * g);
      var fl = V.still ? 0 : Math.sin(V.now * .006 + i) * 2.4;
      ctx.fillStyle = shk(C.clay, .4); ctx.beginPath(); ctx.moveTo(x + 1, -6 - 30 * g); ctx.lineTo(x + 18, -1 - 30 * g + fl); ctx.lineTo(x + 1, 4 - 30 * g); ctx.fill();
    }
    if (last != null) {
      ctx.strokeStyle = shk(C.clay, .4); ctx.lineWidth = 1.3; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(G.stakes[0], -5); ctx.lineTo(Math.min(V.px + 120, G.bld.x - 60), -5); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  var HOT = [2, 9, 12];
  function pieceOffice() {
    var b = G.bld, x = b.x, w = b.w, h = b.h, y0 = -8; if (off(x - 100, x + w + 140)) return;
    var u = range(V.px, x - 400, x + 70), beam = x - 22 + u * (w + 44), r, c;
    /* surveyor's tripod */
    ctx.strokeStyle = sh(C.steel); ctx.lineWidth = 1.6; ctx.beginPath();
    ctx.moveTo(x - 62, -50); ctx.lineTo(x - 76, -6); ctx.moveTo(x - 62, -50); ctx.lineTo(x - 48, -6); ctx.moveTo(x - 62, -50); ctx.lineTo(x - 60, -6); ctx.stroke();
    ctx.fillStyle = shk(C.crane, .4); ctx.fillRect(x - 70, -58, 16, 8);
    /* body */
    ctx.fillStyle = sh(C.stucco); ctx.fillRect(x, y0 - h, w, h);
    ctx.fillStyle = SHADE; ctx.fillRect(x + w - 24, y0 - h, 24, h); ctx.fillRect(x, y0 - 7, w, 7);
    ctx.fillStyle = sh(C.terra); ctx.fillRect(x - 4, y0 - h - 9, w + 8, 11);
    var cols = 7, ww = 32, wh = 30, gap = (w - 40 - cols * ww) / (cols - 1);
    for (r = 0; r < 2; r++) for (c = 0; c < cols; c++) {
      var idx = r * cols + c, wx = x + 20 + c * (ww + gap), wy = y0 - h + 24 + r * 58;
      if (idx === 10) { ctx.fillStyle = sh(C.teal); ctx.fillRect(wx, wy + 2, ww, y0 - wy - 2); ctx.fillStyle = SHADE; ctx.fillRect(wx + ww / 2 - .7, wy + 2, 1.4, y0 - wy - 2); continue; }
      ctx.fillStyle = sh(C.glass); ctx.fillRect(wx, wy, ww, wh);
      /* paper stacks on every sill */
      ctx.fillStyle = sh(C.paper);
      var s1 = 6 + hash(idx) * 12, s2 = 5 + hash(idx + 40) * 15;
      ctx.fillRect(wx + 4, wy + wh - s1, 9, s1); ctx.fillRect(wx + 16, wy + wh - s2, 8, s2);
      var hot = HOT.indexOf(idx) >= 0, cx = wx + ww / 2;
      if (hot && u > 0 && beam > cx) {
        var pop = easeOut(range(beam, cx, cx + 46)), pulse = V.still ? .5 : .5 + .5 * Math.sin(V.now * .005 + idx);
        ctx.fillStyle = 'rgba(255,196,84,' + (.55 * pop).toFixed(3) + ')'; ctx.fillRect(wx, wy, ww, wh);
        ctx.strokeStyle = shk(C.clay, .8); ctx.lineWidth = 3; ctx.strokeRect(wx - 3.5, wy - 3.5, ww + 7, wh + 7);
        ctx.strokeStyle = 'rgba(212,85,45,' + (.5 * pop * (1 - pulse)).toFixed(3) + ')'; ctx.lineWidth = 2;
        ctx.strokeRect(wx - 5 - pulse * 7, wy - 5 - pulse * 7, ww + 10 + pulse * 14, wh + 10 + pulse * 14);
        /* a map pin over the roof, tied back to its window */
        var py = y0 - h - 12 - 26 * easeBack(pop);
        ctx.strokeStyle = shk(C.clay, .8); ctx.lineWidth = 1.2; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(cx, py + 8); ctx.lineTo(cx, wy - 4); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = shk(C.clay, .8); ctx.beginPath(); ctx.arc(cx, py, 7, 3.1416, 0); ctx.lineTo(cx, py + 11); ctx.closePath(); ctx.fill();
        ctx.fillStyle = shk(C.paper, .8); circ(cx, py - .5, 2.6);
      }
    }
    if (u > 0 && u < 1) {
      var fade = Math.min(1, u * 8, (1 - u) * 8);
      ctx.fillStyle = 'rgba(255,196,84,' + (.2 * fade).toFixed(3) + ')'; ctx.fillRect(beam - 15, y0 - h - 36, 30, h + 36);
      ctx.fillStyle = 'rgba(212,85,45,' + (.9 * fade).toFixed(3) + ')'; ctx.fillRect(beam - 1, y0 - h - 36, 2, h + 36);
      ctx.strokeStyle = 'rgba(212,85,45,' + (.6 * fade).toFixed(3) + ')'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(x - 62, -54); ctx.lineTo(beam, y0 - h * .55); ctx.stroke(); ctx.setLineDash([]);
    }
    /* the pilot nobody opened */
    var cxr = G.crate;
    ctx.fillStyle = sh(C.wood); ctx.fillRect(cxr - 5, -13, 62, 3); ctx.fillRect(cxr - 2, -10, 5, 4); ctx.fillRect(cxr + 24, -10, 5, 4); ctx.fillRect(cxr + 49, -10, 5, 4);
    ctx.fillStyle = sh(C.card); ctx.fillRect(cxr, -55, 52, 42);
    ctx.fillStyle = SHADE; ctx.fillRect(cxr + 40, -55, 12, 42); ctx.fillRect(cxr, -55, 52, 3);
    txt('AI', cxr + 21, -32, 17, '900', DISP, sh(C.boardInk)); txt('PILOT', cxr + 21, -20, 8, '600', MONO, sh(C.boardInk));
    tumble(cxr + 66, -15, 9, 1.4);
  }
  function pieceBridge() {
    var b = G.br; if (off(b.x0 - 230, b.x1 + 140)) return;
    var x0 = b.x0 + 6, span = b.span - 12, n = 6, seg = span / n, bp = range(V.px, b.x0 - 560, b.x0 - 80), i, j;
    var cx = b.x0 - 88;
    /* abutments and piers */
    ctx.fillStyle = sh(C.conc); ctx.fillRect(x0 - 16, 0, 16, 46); ctx.fillRect(x0 + span, 0, 16, 46);
    var pr = easeOut(range(bp, 0, .2));
    for (i = 1; i <= 2; i++) {
      var px = x0 + span * i / 3, ph = 54 * pr;
      ctx.fillStyle = sh(C.conc); ctx.fillRect(px - 8, 84 - ph, 16, ph); ctx.fillRect(px - 13, 84 - ph, 26, 6);
      ctx.fillStyle = SHADE; ctx.fillRect(px + 2, 84 - ph, 6, ph);
    }
    /* deck segments, flown in one at a time */
    var hookX = cx + 40, hookY = -150, carrying = false, c0 = cx + 40;
    for (i = 0; i < n; i++) {
      var li = range(bp, .16 + i * .09, .25 + i * .09); if (li <= 0) continue;
      var home = x0 + i * seg + seg / 2, from = i === 0 ? c0 : x0 + (i - 1) * seg + seg / 2;
      var sx = lerp(from, home, smooth(range(li, 0, .32))) - seg / 2, yo = -150 * (1 - easeOut(range(li, .26, 1)));
      ctx.fillStyle = sh(C.girder); ctx.fillRect(sx, 30 + yo, seg + .6, 9);
      ctx.fillStyle = sh(C.road); ctx.fillRect(sx, yo, seg + .6, 30);
      ctx.fillStyle = sh(C.roadEdge); ctx.fillRect(sx, yo, seg + .6, 1.6); ctx.fillRect(sx, 28 + yo, seg + .6, 2);
      if (li >= 1) dashes(sx, sx + seg, 0);
      if (li < 1) { hookX = sx + seg / 2; hookY = yo; carrying = true; }
    }
    if (!carrying) { hookX = bp < .16 ? c0 : x0 + span - seg / 2; hookY = bp < .16 ? -150 : lerp(0, -150, range(bp, .7, .8)); }
    /* truss, member by member */
    var top = -56, M = [], k;
    M.push([x0, 0, x0 + seg, top]);
    for (k = 1; k < n; k++) {
      M.push([x0 + k * seg, 0, x0 + k * seg, top]);
      if (k < n - 1) { M.push([x0 + k * seg, top, x0 + (k + 1) * seg, top]); if (k < n / 2) M.push([x0 + k * seg, top, x0 + (k + 1) * seg, 0]); else M.push([x0 + k * seg, 0, x0 + (k + 1) * seg, top]); }
    }
    M.push([x0 + span - seg, top, x0 + span, 0]);
    ctx.strokeStyle = shk(C.steelRed, .25); ctx.lineWidth = 4.2; ctx.lineCap = 'round'; ctx.beginPath();
    for (j = 0; j < M.length; j++) {
      var mp = easeOut(range(bp, .5 + j / M.length * .42, .5 + j / M.length * .42 + .07)); if (mp <= 0) continue;
      var m = M[j]; ctx.moveTo(m[0], m[1]); ctx.lineTo(lerp(m[0], m[2], mp), lerp(m[1], m[3], mp));
    }
    ctx.stroke(); ctx.lineCap = 'butt';
    /* tower crane on the near bank */
    ctx.strokeStyle = shk(C.crane, .3); ctx.lineWidth = 1.8; ctx.beginPath();
    ctx.moveTo(cx - 6, -8); ctx.lineTo(cx - 6, -206); ctx.moveTo(cx + 6, -8); ctx.lineTo(cx + 6, -206);
    for (i = 0; i < 9; i++) { var yy = -8 - i * 22; ctx.moveTo(cx - 6, yy); ctx.lineTo(cx + 6, yy - 22); ctx.moveTo(cx + 6, yy); ctx.lineTo(cx - 6, yy - 22); }
    ctx.moveTo(cx - 72, -206); ctx.lineTo(cx + 486, -206); ctx.moveTo(cx - 72, -197); ctx.lineTo(cx + 486, -197); ctx.lineTo(cx + 486, -206);
    for (i = 0; i < 24; i++) { var jx = cx + 6 + i * 20; ctx.moveTo(jx, -197); ctx.lineTo(jx + 10, -206); ctx.lineTo(jx + 20, -197); }
    ctx.moveTo(cx, -206); ctx.lineTo(cx, -226); ctx.lineTo(cx + 250, -206); ctx.moveTo(cx, -226); ctx.lineTo(cx - 66, -206);
    ctx.stroke();
    ctx.fillStyle = sh(C.conc); ctx.fillRect(cx - 76, -204, 24, 17);
    ctx.fillStyle = shk(C.crane, .3); ctx.fillRect(cx + 7, -198, 14, 15); ctx.fillRect(hookX - 6, -198, 12, 5);
    ctx.strokeStyle = sh(C.steel); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hookX, -193); ctx.lineTo(hookX, hookY); ctx.stroke();
    if (carrying) { ctx.beginPath(); ctx.moveTo(hookX, hookY - 14); ctx.lineTo(hookX - seg * .42, hookY); ctx.moveTo(hookX, hookY - 14); ctx.lineTo(hookX + seg * .42, hookY); ctx.stroke(); }
    else { ctx.fillStyle = sh(C.steel); ctx.fillRect(hookX - 3, hookY - 5, 6, 6); }
    /* materials, cones, and the gate that lifts when the span is done */
    ctx.fillStyle = shk(C.steelRed, .25); ctx.fillRect(cx + 22, -14, 60, 4); ctx.fillRect(cx + 26, -19, 54, 4); ctx.fillRect(cx + 32, -24, 44, 4);
    var open = easeIO(range(bp, .9, 1)), gx = b.x0 - 22;
    ctx.fillStyle = sh(C.steel); ctx.fillRect(gx - 2, -32, 4, 30);
    ctx.save(); ctx.translate(gx, -28); ctx.rotate(-open * 1.42);
    for (i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? shk(C.paper, .5) : shk(C.clay, .5); ctx.fillRect(i * 9, -3, 9, 6); }
    ctx.restore();
  }
  function cones() {
    var b = G.br, i; if (off(b.x0 - 140, b.x0)) return;
    for (i = 0; i < 3; i++) {
      var x = b.x0 - 118 + i * 30;
      ctx.fillStyle = shk(C.clay, .5); ctx.beginPath(); ctx.moveTo(x - 5, 33); ctx.lineTo(x, 17); ctx.lineTo(x + 5, 33); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shk(C.paper, .5); ctx.fillRect(x - 3, 25, 6, 2.4);
    }
  }
  function windows(x, top, w, rows, cols, ww, wh, rowGap, litFn) {
    var gap = cols > 1 ? (w - cols * ww) / (cols - 1) : 0, r, c, vis = range(P.night, .1, .45);
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
      var wx = x + c * (ww + gap), wy = top + r * rowGap;
      ctx.fillStyle = sh(C.glass); ctx.fillRect(wx, wy, ww, wh);
      var lit = litFn(wx, r * cols + c) * vis;
      if (lit > .01) { ctx.fillStyle = 'rgba(' + WARM + ',' + lit.toFixed(3) + ')'; ctx.fillRect(wx, wy, ww, wh); }
    }
  }
  function litBy(seed) {
    return function (wx, i) { var at = wx - 560 + hash(i + seed) * 400; return range(V.px, at, at + 30); };
  }
  function lamp(x) {
    var on = range(V.px, x - 330, x - 300), vis = range(P.night, .12, .6) * on;
    ctx.fillStyle = sh(C.steel); ctx.fillRect(x - 1.5, -104, 3, 98); ctx.fillRect(x - 1.5, -104, 18, 2.6); ctx.fillRect(x + 10, -103, 10, 4.5);
    if (vis > .01) {
      ctx.globalCompositeOperation = 'lighter';
      glow(x + 15, -98, 78, WARM, .5 * vis);
      var g = ctx.createRadialGradient(x + 15, 6, 0, x + 15, 6, 74);
      g.addColorStop(0, 'rgba(' + WARM + ',' + (.3 * vis).toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + WARM + ',0)');
      ctx.save(); ctx.translate(0, 6); ctx.scale(1, .2); ctx.translate(0, -6); ctx.fillStyle = g; ctx.fillRect(x - 60, -70, 150, 152); ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(255,240,200,' + vis.toFixed(3) + ')'; ctx.fillRect(x + 11, -99, 8, 2.4);
    }
  }
  function palm(x, h) {
    ctx.strokeStyle = sh(C.wood); ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, -6); ctx.quadraticCurveTo(x + 7, -h * .5, x + 2, -h); ctx.stroke();
    ctx.strokeStyle = sh(C.palm); ctx.lineWidth = 3; ctx.beginPath();
    for (var i = 0; i < 9; i++) { var a = -3.1416 + i * 3.1416 / 8, rx = Math.cos(a) * 30, ry = Math.sin(a) * 22; ctx.moveTo(x + 2, -h); ctx.quadraticCurveTo(x + 2 + rx * .6, -h + ry * 1.1 - 6, x + 2 + rx, -h + ry * .2 + 10); }
    ctx.stroke(); ctx.lineCap = 'butt';
  }
  function pieceTown() {
    var x = G.town, y0 = -8, i; if (off(x - 120, x + 1150)) return;
    var vis = range(P.night, .1, .45);
    palm(x + 192, 150); palm(x + 437, 168); palm(x + 928, 142);
    /* 1: corner shop with an awning */
    var bx = x, w = 180, h = 118;
    ctx.fillStyle = sh(C.terra); ctx.fillRect(bx, y0 - h, w, h); ctx.fillStyle = SHADE; ctx.fillRect(bx - 3, y0 - h - 7, w + 6, 9); ctx.fillRect(bx + w - 20, y0 - h, 20, h);
    windows(bx + 20, y0 - h + 16, 120, 1, 3, 26, 26, 0, litBy(1));
    ctx.fillStyle = sh(C.glass); ctx.fillRect(bx + 16, y0 - 52, 96, 44); ctx.fillRect(bx + 126, y0 - 52, 30, 52);
    var l1 = range(V.px, bx - 420, bx - 380) * vis; if (l1 > .01) { ctx.fillStyle = 'rgba(' + WARM + ',' + l1.toFixed(3) + ')'; ctx.fillRect(bx + 16, y0 - 52, 96, 44); ctx.fillRect(bx + 126, y0 - 52, 30, 52); }
    for (i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? shk(C.paper, .2) : shk(C.clay, .2); ctx.beginPath(); ctx.moveTo(bx + 10 + i * 20, y0 - 70); ctx.lineTo(bx + 30 + i * 20, y0 - 70); ctx.lineTo(bx + 27 + i * 20, y0 - 54); ctx.lineTo(bx + 5 + i * 20, y0 - 54); ctx.closePath(); ctx.fill(); }
    /* 2: three-story office */
    bx = x + 205; w = 220; h = 176;
    ctx.fillStyle = sh(C.stucco); ctx.fillRect(bx, y0 - h, w, h); ctx.fillStyle = SHADE; ctx.fillRect(bx - 3, y0 - h - 7, w + 6, 9); ctx.fillRect(bx + w - 22, y0 - h, 22, h); ctx.fillRect(bx, y0 - 6, w, 6);
    windows(bx + 18, y0 - h + 20, w - 54, 3, 5, 26, 30, 50, litBy(2));
    ctx.fillStyle = sh(C.teal); ctx.fillRect(bx + 92, y0 - 34, 30, 34);
    /* 3: the workshop, where the handover happens */
    bx = x + 450; w = 250; h = 112;
    ctx.fillStyle = sh(C.sage); ctx.fillRect(bx, y0 - h, w, h); ctx.fillStyle = SHADE; ctx.fillRect(bx - 3, y0 - h - 7, w + 6, 9); ctx.fillRect(bx + w - 22, y0 - h, 22, h);
    ctx.fillStyle = sh(C.glass); ctx.fillRect(bx + 22, y0 - 88, 156, 66);
    var l3 = range(V.px, bx - 360, bx - 300) * vis;
    ctx.fillStyle = 'rgba(' + WARM + ',' + (.25 + .75 * l3).toFixed(3) + ')'; ctx.fillRect(bx + 22, y0 - 88, 156, 66);
    ctx.fillStyle = shk(C.paper, .7 * l3 + .2); ctx.fillRect(bx + 34, y0 - 80, 54, 34);
    ctx.fillStyle = shk(C.clay, .7); ctx.fillRect(bx + 40, y0 - 73, 30, 2.4); ctx.fillStyle = sh(C.boardInk); ctx.fillRect(bx + 40, y0 - 66, 40, 2); ctx.fillRect(bx + 40, y0 - 60, 34, 2); ctx.fillRect(bx + 40, y0 - 54, 22, 2);
    ctx.fillStyle = sh(C.boardInk);
    var fx = [bx + 100, bx + 128, bx + 152, bx + 170];
    for (i = 0; i < fx.length; i++) {
      var fh = i === 0 ? 40 : 30 + (i % 2) * 3;
      circ(fx[i], y0 - 22 - fh, 5.2); ctx.beginPath(); ctx.moveTo(fx[i] - 8, y0 - 22); ctx.lineTo(fx[i] - 6, y0 - 22 - fh + 8); ctx.lineTo(fx[i] + 6, y0 - 22 - fh + 8); ctx.lineTo(fx[i] + 8, y0 - 22); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = sh(C.boardInk); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(bx + 96, y0 - 50); ctx.lineTo(bx + 84, y0 - 62); ctx.stroke();
    ctx.fillStyle = sh(C.teal); ctx.fillRect(bx + 196, y0 - 56, 30, 56);
    /* 4: four-story block */
    bx = x + 725; w = 190; h = 198;
    ctx.fillStyle = sh(C.adobe); ctx.fillRect(bx, y0 - h, w, h); ctx.fillStyle = SHADE; ctx.fillRect(bx - 3, y0 - h - 7, w + 6, 9); ctx.fillRect(bx + w - 20, y0 - h, 20, h); ctx.fillRect(bx, y0 - 6, w, 6);
    windows(bx + 18, y0 - h + 20, w - 54, 4, 4, 28, 28, 44, litBy(4));
    /* 5: arcade */
    bx = x + 940; w = 170; h = 128;
    ctx.fillStyle = sh(C.white); ctx.fillRect(bx, y0 - h, w, h); ctx.fillStyle = sh(C.terra); ctx.fillRect(bx - 4, y0 - h - 8, w + 8, 12); ctx.fillStyle = SHADE; ctx.fillRect(bx + w - 18, y0 - h, 18, h);
    windows(bx + 18, y0 - h + 22, w - 54, 1, 4, 24, 28, 0, litBy(5));
    for (i = 0; i < 3; i++) {
      var ax = bx + 16 + i * 48;
      ctx.fillStyle = sh(C.glass); ctx.beginPath(); ctx.moveTo(ax, y0); ctx.lineTo(ax, y0 - 36); ctx.arc(ax + 17, y0 - 36, 17, 3.1416, 0); ctx.lineTo(ax + 34, y0); ctx.closePath(); ctx.fill();
      var l5 = range(V.px, ax - 400 + i * 30, ax - 370 + i * 30) * vis;
      if (l5 > .01) { ctx.fillStyle = 'rgba(' + WARM + ',' + l5.toFixed(3) + ')'; ctx.fill(); }
    }
    for (i = 0; i < G.lamps.length; i++) lamp(G.lamps[i]);
  }
  function pieceReceipts() {
    var x = G.rc, y0 = -8, i; if (off(x - 60, x + 1180)) return;
    var vis = range(P.night, .1, .45), always = function (wx, n) { return hash(n * 3.7 + wx * .01) > .14 ? 1 : 0; };
    /* a long campus, lights on across every floor */
    ctx.fillStyle = sh(C.stucco); ctx.fillRect(x, y0 - 112, 440, 112); ctx.fillRect(x + 168, y0 - 152, 104, 152);
    ctx.fillStyle = SHADE; ctx.fillRect(x - 3, y0 - 118, 446, 8); ctx.fillRect(x + 165, y0 - 158, 110, 8);
    windows(x + 14, y0 - 96, 142, 3, 7, 13, 15, 30, always); windows(x + 284, y0 - 96, 142, 3, 7, 13, 15, 30, always);
    windows(x + 182, y0 - 138, 76, 4, 4, 13, 15, 30, always);
    /* a mast that is on the air */
    var tx = x + 620;
    ctx.strokeStyle = sh(C.steel); ctx.lineWidth = 1.6; ctx.beginPath();
    ctx.moveTo(tx - 13, y0); ctx.lineTo(tx - 1.5, -204); ctx.moveTo(tx + 13, y0); ctx.lineTo(tx + 1.5, -204);
    for (i = 0; i < 8; i++) { var ya = y0 - i * 24, wa = 13 - i * 1.45, wb = 13 - (i + 1) * 1.45; ctx.moveTo(tx - wa, ya); ctx.lineTo(tx + wb, ya - 24); ctx.moveTo(tx + wa, ya); ctx.lineTo(tx - wb, ya - 24); }
    ctx.stroke();
    ctx.fillStyle = sh(C.sage); ctx.fillRect(tx + 18, y0 - 34, 52, 34); ctx.fillStyle = SHADE; ctx.fillRect(tx + 16, y0 - 38, 56, 6);
    windows(tx + 28, y0 - 26, 14, 1, 1, 14, 14, 0, function () { return 1; });
    var blink = V.still ? 1 : (Math.sin(V.now * .004) > -.2 ? 1 : .15);
    ctx.globalCompositeOperation = 'lighter'; glow(tx, -208, 26, '255,90,70', .7 * vis * blink); ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255,110,90,' + (.35 + .65 * blink * vis).toFixed(3) + ')'; circ(tx, -208, 3.2);
    for (i = 0; i < 3; i++) {
      var ph = V.still ? .5 : ((V.now * .0007 + i / 3) % 1);
      ctx.strokeStyle = 'rgba(255,170,130,' + (vis * .7 * (1 - ph)).toFixed(3) + ')'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(tx, -208, 10 + ph * 34, -.9, .5); ctx.stroke();
      ctx.beginPath(); ctx.arc(tx, -208, 10 + ph * 34, 3.1416 - .5, 3.1416 + .9); ctx.stroke();
    }
    /* two more, both lit: client work in production */
    var bx = x + 800;
    ctx.fillStyle = sh(C.adobe); ctx.fillRect(bx, y0 - 150, 150, 150); ctx.fillStyle = SHADE; ctx.fillRect(bx - 3, y0 - 156, 156, 8); ctx.fillRect(bx + 132, y0 - 150, 18, 150);
    windows(bx + 16, y0 - 132, 100, 3, 3, 26, 28, 44, always);
    bx = x + 968;
    ctx.fillStyle = sh(C.white); ctx.fillRect(bx, y0 - 78, 170, 78);
    ctx.fillStyle = sh(C.terra); ctx.beginPath(); ctx.moveTo(bx - 8, y0 - 78); ctx.lineTo(bx + 85, y0 - 116); ctx.lineTo(bx + 178, y0 - 78); ctx.closePath(); ctx.fill();
    windows(bx + 16, y0 - 62, 138, 1, 4, 22, 38, 0, function () { return 1; });
    ctx.fillStyle = sh(C.steel); ctx.fillRect(bx + 196, y0 - 120, 2, 120);
    ctx.fillStyle = shk(C.clay, .3); ctx.fillRect(bx + 198, y0 - 120, 22, 13);
  }
  function routeSign(x, n) {
    if (off(x - 40, x + 40)) return;
    var hl = range(P.night, .3, .6), lit = hl * sat(1 - Math.abs((x - (V.tx + 250)) / 280));
    ctx.fillStyle = sh(C.steel); ctx.fillRect(x - 1.6, -72, 3.2, 66);
    var face = mixL(mixL(col(C.board), P.near, P.amt * .72), col('#fffbe8'), lit);
    if (lit > .02) { ctx.globalCompositeOperation = 'lighter'; glow(x, -92, 46, '255,240,190', .22 * lit); ctx.globalCompositeOperation = 'source-over'; }
    ctx.fillStyle = css(face); rr(x - 18, -116, 36, 46, 4); ctx.fill();
    var ink = css(mixL(mixL(col(C.boardInk), P.near, P.amt * .9), col('#141a44'), lit));
    ctx.strokeStyle = ink; ctx.lineWidth = 1.6; rr(x - 15, -113, 30, 40, 2.5); ctx.stroke();
    txt('STEP', x, -103, 6.4, '600', MONO, ink); txt(String(n), x, -78, 27, '900', DISP, ink);
  }
  function pieceEnd() {
    var x = G.office, y0 = -8, i; if (off(G.mail - 60, x + 420)) return;
    var vis = range(P.night, .1, .45), hl = range(P.night, .3, .6);
    /* adobe office */
    ctx.fillStyle = shk(C.adobe, .26); ctx.beginPath();
    ctx.moveTo(x, y0); ctx.lineTo(x, y0 - 96); ctx.lineTo(x + 58, y0 - 96); ctx.lineTo(x + 58, y0 - 108); ctx.lineTo(x + 192, y0 - 108); ctx.lineTo(x + 192, y0 - 96); ctx.lineTo(x + 250, y0 - 96); ctx.lineTo(x + 250, y0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = SHADE; ctx.fillRect(x + 228, y0 - 96, 22, 96);
    ctx.fillStyle = sh(C.wood); for (i = 0; i < 7; i++) circ(x + 22 + i * 34.5, y0 - 82, 3);
    ctx.fillStyle = sh(C.conc); ctx.fillRect(x + 204, y0 - 126, 16, 32);
    if (!V.still) for (i = 0; i < 4; i++) {
      var ph = (V.now * .00016 + i / 4) % 1;
      ctx.fillStyle = 'rgba(210,214,236,' + (.2 * (1 - ph)).toFixed(3) + ')'; circ(x + 212 + Math.sin(ph * 5 + i) * 6 + ph * 14, y0 - 128 - ph * 62, 4 + ph * 9);
    }
    /* windows, door, porch light */
    var wl = .3 + .7 * vis;
    for (i = 0; i < 2; i++) {
      var wx = x + 26 + i * 152;
      ctx.fillStyle = sh(C.glass); ctx.fillRect(wx, y0 - 68, 46, 40);
      ctx.fillStyle = 'rgba(' + WARM + ',' + wl.toFixed(3) + ')'; ctx.fillRect(wx, y0 - 68, 46, 40);
      ctx.fillStyle = sh(C.wood); ctx.fillRect(wx + 22, y0 - 68, 2, 40); ctx.fillRect(wx, y0 - 49, 46, 2); ctx.fillRect(wx - 3, y0 - 28, 52, 3);
    }
    ctx.fillStyle = shk(C.teal, .45 * vis); ctx.beginPath(); ctx.moveTo(x + 108, y0); ctx.lineTo(x + 108, y0 - 46); ctx.arc(x + 125, y0 - 46, 17, 3.1416, 0); ctx.lineTo(x + 142, y0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,238,190,' + (.4 + .6 * vis).toFixed(3) + ')'; circ(x + 125, y0 - 72, 3);
    /* the name over the door, lit from above */
    ctx.fillStyle = sh(C.wood); ctx.fillRect(x + 48, y0 - 138, 3, 32); ctx.fillRect(x + 199, y0 - 138, 3, 32);
    ctx.fillStyle = css(mixL(mixL(col(C.boardInk), P.near, P.amt * .6), col('#232150'), .5)); rr(x + 30, y0 - 148, 190, 30, 3); ctx.fill();
    ctx.strokeStyle = shk(C.board, .75); ctx.lineWidth = 1.2; rr(x + 33, y0 - 145, 184, 24, 2); ctx.stroke();
    txt('ESSENTIAL CONCEPTS LLC', x + 125, y0 - 126.5, 15.5, '800', DISP, shk(C.board, .9));
    /* string lights out to a post */
    var ax = x + 250, ay = y0 - 96, bx2 = x + 344, by = y0 - 84;
    ctx.fillStyle = sh(C.wood); ctx.fillRect(bx2 - 1.5, by, 3, 84 - 6 + 8);
    ctx.strokeStyle = sh(C.wood); ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx2) / 2, ay + 30, bx2, by); ctx.stroke();
    /* mailbox, flag goes up as you pull in */
    var mx = G.mail, f = easeBack(range(V.px, G.end - 230, G.end - 30));
    var metal = css(mixL(mixL(col(C.trim), P.near, P.amt), col(C.trim), hl * .75));
    ctx.fillStyle = sh(C.wood); ctx.fillRect(mx - 2.5, -48, 5, 42);
    ctx.fillStyle = metal; ctx.beginPath(); ctx.moveTo(mx - 18, -48); ctx.lineTo(mx - 18, -60); ctx.arc(mx - 8, -60, 10, 3.1416, -1.5708); ctx.lineTo(mx + 18, -70); ctx.lineTo(mx + 18, -48); ctx.closePath(); ctx.fill();
    ctx.fillStyle = SHADE; ctx.fillRect(mx - 18, -52, 36, 4);
    ctx.save(); ctx.translate(mx + 6, -52); ctx.rotate(-f * 1.5708);
    ctx.fillStyle = css(mixL(mixL(col(C.clay), P.near, P.amt * .5), col('#ff5a36'), hl * .7)); ctx.fillRect(0, -1.6, 16, 3.2); ctx.fillRect(10, -8, 7, 8);
    ctx.restore();
    /* glows last */
    if (vis > .01) {
      ctx.globalCompositeOperation = 'lighter';
      glow(x + 125, y0 - 72, 66, WARM, .5 * vis); glow(x + 49, y0 - 48, 70, WARM, .2 * vis); glow(x + 201, y0 - 48, 70, WARM, .2 * vis);
      glow(x + 125, y0 - 134, 110, WARM, .16 * vis);
      ctx.globalCompositeOperation = 'source-over';
    }
    for (i = 1; i < 9; i++) {
      var t = i / 9, lx = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * ((ax + bx2) / 2) + t * t * bx2, ly = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * (ay + 30) + t * t * by;
      var tw = V.still ? 1 : .8 + .2 * Math.sin(V.now * .003 + i * 1.7);
      if (vis > .01) { ctx.globalCompositeOperation = 'lighter'; glow(lx, ly + 2, 11, WARM, .5 * vis * tw); ctx.globalCompositeOperation = 'source-over'; }
      ctx.fillStyle = 'rgba(255,232,170,' + (.45 + .55 * vis).toFixed(3) + ')'; circ(lx, ly + 2, 2);
    }
  }

  /* ---------------------------------------------------------- truck */
  var dust = [];
  function wheel(cx, cy, rot) {
    ctx.fillStyle = sh(C.tire); circ(cx, cy, 13);
    ctx.fillStyle = shk(C.trim, .25); circ(cx, cy, 6.6);
    ctx.strokeStyle = sh(C.tire); ctx.lineWidth = 1.5; ctx.beginPath();
    for (var i = 0; i < 3; i++) { var a = rot + i * 2.0944; ctx.moveTo(cx - Math.cos(a) * 6, cy - Math.sin(a) * 6); ctx.lineTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6); }
    ctx.stroke();
    ctx.fillStyle = sh(C.tire); circ(cx, cy, 1.8);
  }
  function drawTruck() {
    plane(1);
    var x = V.tx, y = 17, hl = range(P.night, .28, .6), i;
    /* dust */
    if (dust.length) {
      var dc = mixL(col('#e9c98f'), P.near, P.amt * .7);
      for (i = 0; i < dust.length; i++) { var p = dust[i], u = p.life / p.max; ctx.fillStyle = css(dc, .36 * (1 - u) * (1 - P.night * .6)); circ(p.x, p.y, p.r * (.5 + u * 1.3)); }
    }
    var bob = V.still ? 0 : Math.sin(V.tx * .05) * .7 + Math.sin(V.now * .011) * .3 * V.moving + Math.sin(V.now * .034) * .22 * (1 - V.moving);
    ctx.save(); ctx.translate(x, y + bob);
    ctx.fillStyle = 'rgba(10,8,24,.24)'; ctx.beginPath(); ctx.ellipse(0, 1, 84, 4.5, 0, 0, 6.2832); ctx.fill();
    var body = shk(C.truck, .32), body2 = shk(C.truck2, .22), dark = sh(C.tire);
    /* cargo in the bed */
    ctx.fillStyle = sh(C.steel); ctx.fillRect(-64, -55, 22, 9);
    ctx.strokeStyle = shk(C.crane, .3); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-36, -47); ctx.lineTo(-20, -62); ctx.moveTo(-32, -47); ctx.lineTo(-14, -60); ctx.stroke();
    /* body */
    ctx.fillStyle = body; ctx.beginPath();
    ctx.moveTo(-77, -20); ctx.lineTo(-77, -47); ctx.lineTo(-10, -47); ctx.lineTo(-7, -72); ctx.lineTo(23, -72); ctx.lineTo(36, -48);
    ctx.lineTo(70, -45); ctx.quadraticCurveTo(78, -44, 78, -36); ctx.lineTo(78, -20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = body2; ctx.fillRect(-77, -32, 155, 9);
    ctx.fillStyle = shk(C.trim, .25); rr(-82, -25, 9, 5, 2); ctx.fill(); rr(73, -25, 9, 5, 2); ctx.fill();
    /* glass and driver */
    ctx.fillStyle = css(mixL(mixL(col('#bfe3e6'), P.near, P.amt * .75), P.sky[2], .25)); ctx.beginPath(); ctx.moveTo(-3, -49); ctx.lineTo(-1, -67.5); ctx.lineTo(20.5, -67.5); ctx.lineTo(30.5, -49); ctx.closePath(); ctx.fill();
    ctx.fillStyle = dark; circ(11, -58.5, 4.4); ctx.fillRect(4.5, -54, 13, 5);
    ctx.fillStyle = SHADE; ctx.fillRect(-9, -47, 1.2, 25); ctx.fillRect(33, -47, 1.2, 25); ctx.fillRect(22, -40, 6, 1.6);
    /* wheel wells and wheels */
    ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(-46, -13, 17, 3.1416, 0); ctx.fill(); ctx.beginPath(); ctx.arc(44, -13, 17, 3.1416, 0); ctx.fill();
    var rot = V.tx / 13; wheel(-46, -13, rot); wheel(44, -13, rot);
    /* lamps */
    ctx.fillStyle = hl > .05 ? 'rgba(255,244,200,' + (.5 + .5 * hl).toFixed(3) + ')' : shk(C.trim, .25); rr(73, -42, 5.5, 8, 2); ctx.fill();
    ctx.fillStyle = hl > .05 ? 'rgba(255,82,62,' + (.5 + .5 * hl).toFixed(3) + ')' : shk('#a02a20', .2); ctx.fillRect(-79, -44, 3, 9);
    ctx.restore();
    if (hl > .02) {
      ctx.globalCompositeOperation = 'lighter';
      var g = ctx.createLinearGradient(x + 78, 0, x + 78 + 380, 0);
      g.addColorStop(0, 'rgba(255,226,156,' + (.46 * hl).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,226,156,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x + 78, y - 40); ctx.lineTo(x + 458, y - 74); ctx.lineTo(x + 458, y + 8); ctx.lineTo(x + 78, y - 33); ctx.closePath(); ctx.fill();
      var g2 = ctx.createLinearGradient(x + 90, 0, x + 400, 0);
      g2.addColorStop(0, 'rgba(255,226,156,0)'); g2.addColorStop(.25, 'rgba(255,226,156,' + (.26 * hl).toFixed(3) + ')'); g2.addColorStop(1, 'rgba(255,226,156,0)');
      ctx.fillStyle = g2; ctx.beginPath(); ctx.ellipse(x + 240, y - 2, 170, 13, 0, 0, 6.2832); ctx.fill();
      glow(x + 77, y - 38, 26, '255,236,180', .6 * hl); glow(x - 78, y - 40, 16, '255,70,50', .5 * hl);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  function stepDust(dt, speed) {
    var i, sp = Math.abs(speed);
    if (sp > 90 && dust.length < 70 && Math.random() < Math.min(1, sp / 500)) {
      var dir = speed > 0 ? 1 : -1;
      dust.push({ x: V.tx - 46 * dir - dir * 6, y: 24 + Math.random() * 6, vx: -dir * (10 + Math.random() * 46), vy: -(6 + Math.random() * 22), life: 0, max: .5 + Math.random() * .7, r: 3 + Math.random() * 5 });
    }
    for (i = dust.length - 1; i >= 0; i--) {
      var p = dust[i]; p.life += dt; if (p.life >= p.max) { dust.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy *= .96;
    }
  }

  /* ---------------------------------------------------------- foreground */
  function drawFront() {
    plane(1);
    var i, x0 = V.cam - 60, x1 = x0 + visW + 120;
    for (i = 0; i < G.frontBits.length; i++) { var p = G.frontBits[i]; if (p.x < x0 || p.x > x1) continue; drawPlant(p, 0); }
    cones();
    /* closest plane: dark shapes that sweep past faster than the road */
    var f = 1.5, base = (V.Hs - V.gy) + 10 * V.s; plane(f, base);
    var fx0 = V.cam * f - 160, fx1 = fx0 + visW + 320, c = sh(C.fg);
    ctx.fillStyle = c; ctx.fillRect(fx0, -3, fx1 - fx0, 260);
    for (i = 0; i < G.fg.length; i++) {
      var it = G.fg[i]; if (it.x < fx0 || it.x > fx1) continue;
      var x = it.x, h = it.h, j;
      ctx.fillStyle = c; ctx.strokeStyle = c;
      if (it.kind === 0) {
        for (j = 0; j < 11; j++) {
          var ang = -3.1416 * (.06 + .88 * j / 10), len = h * (.85 + hash(i * 7 + j) * .5), bw = h * .1;
          ctx.beginPath(); ctx.moveTo(x - bw, 2); ctx.quadraticCurveTo(x + Math.cos(ang) * len * .5 - bw * .4, Math.sin(ang) * len * .62, x + Math.cos(ang) * len, Math.sin(ang) * len);
          ctx.quadraticCurveTo(x + Math.cos(ang) * len * .5 + bw * .6, Math.sin(ang) * len * .5, x + bw, 2); ctx.closePath(); ctx.fill();
        }
      } else if (it.kind === 1) {
        ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath();
        for (j = 0; j < 8; j++) { var dx = (j / 7 - .5) * h * 1.3; ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + dx * .25, -h * .8, x + dx, -h * 1.3 * (.8 + hash(i + j) * .2)); }
        ctx.stroke(); ctx.lineCap = 'butt';
      } else if (it.kind === 2) {
        ctx.lineWidth = 2; ctx.beginPath();
        for (j = -5; j <= 5; j++) { ctx.moveTo(x + j * 3, 0); ctx.quadraticCurveTo(x + j * 5, -h * .4, x + j * 9 + it.v * 10, -h * (.75 - Math.abs(j) * .06)); }
        ctx.stroke();
      } else {
        for (j = 0; j < 3; j++) ctx.fillRect(x + j * 120, -h * .9, 6, h * .9 + 4);
        ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x, -h * .72); ctx.lineTo(x + 246, -h * .72); ctx.moveTo(x, -h * .4); ctx.lineTo(x + 246, -h * .4); ctx.stroke();
      }
    }
  }

  /* ---------------------------------------------------------- frame */
  var PROF = /[?&]prof\b/.test(qs) ? (win.__prof = {}) : null;
  function plantsAndPieces() {
    var i, x0 = V.cam - 120, x1 = V.cam + visW + 120;
    for (i = 0; i < G.plants.length; i++) { var p = G.plants[i]; if (p.x > x0 && p.x < x1) drawPlant(p, 0); }
    pieceSign(); pieceMill(); pieceStakes(); pieceOffice(); pieceTown(); pieceReceipts();
    for (i = 0; i < 3; i++) routeSign(G.signs[i], i + 1);
    pieceEnd();
  }
  var STEPS = [
    ['sky', function () { drawSky(); drawStars(); drawMoon(); drawSun(); drawClouds(); drawBirds(); }],
    ['ridges', function () { drawRidge(G.far); drawRidge(G.mid); drawRidge(G.mesa); }],
    ['bands', function () { drawBand(G.bandA, .62, 58, C.bandA, .3, 4.2); drawTrain(); drawBand(G.bandB, .8, 35, C.bandB, .14, 9.7); }],
    ['ground', function () { drawGround(); drawWash(); drawPoles(); }],
    ['pieces', plantsAndPieces],
    ['road', function () { drawRoad(); pieceBridge(); }],
    ['truck', drawTruck],
    ['front', drawFront]
  ];
  function render(v) {
    V = v; ctx = v.ctx; visW = v.W / v.s; shc = {};
    P = palette(v.T);
    V.bot = (v.H - v.gy) / v.s + 6;
    for (var i = 0; i < STEPS.length; i++) {
      if (PROF) { var t0 = win.performance.now(); STEPS[i][1](); PROF[STEPS[i][0]] = (PROF[STEPS[i][0]] || 0) + win.performance.now() - t0; }
      else STEPS[i][1]();
    }
    if (PROF) PROF.frames = (PROF.frames || 0) + 1;
    screen();
  }

  /* ========================================================== static mode */
  var sections = [].slice.call(d.querySelectorAll('.panel'));
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  var SHORT = 470;
  if (REDUCE || win.innerHeight < SHORT) {
    html.classList.add('static');
    sections.forEach(function (sec) {
      var c = d.createElement('canvas'); c.className = 'postcard'; c.setAttribute('aria-hidden', 'true');
      sec.insertBefore(c, sec.firstChild);
    });
    var paintStatic = function () {
      var w = html.clientWidth, s = Math.min(w / 560, 1.25), dpr = Math.min(win.devicePixelRatio || 1, 2);
      var vw = w / s, anchor = vw * (w < 700 ? .21 : .2);
      buildWorld(anchor);
      var cams = {
        hero: 0, find: G.bld.x + 170 - vw * .56, build: G.br.x0 + 240 - vw * .5, stick: G.town + 330 - vw * .5,
        receipts: G.rc + 300 - vw * .5, engage: G.signs[1] - vw * .62, contact: CAMMAX
      };
      sections.forEach(function (sec, i) {
        var c = CH[i], cv = sec.querySelector('canvas.postcard');
        sec.style.setProperty('--pc-h', Math.round((HARD + FRONT) * s) + 'px');
        var h = sec.offsetHeight;
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
        var cam = cams[c.id], nt = i < CH.length - 1 ? CH[i + 1].t : c.t;
        render({ ctx: cv.getContext('2d', { alpha: false }), W: w, H: h, Hs: h, gy: h - FRONT * s, s: s, dpr: dpr,
          cam: cam, T: lerp(c.t, nt, c.drift * .5), tx: cam + anchor, px: 1e9, now: 0, still: true, moving: 0 });
      });
    };
    paintStatic();
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(paintStatic);
    win.addEventListener('resize', debounce(function () {
      if (!REDUCE && win.innerHeight >= SHORT) { location.reload(); return; }
      paintStatic();
    }, 180));
    return;
  }

  /* ========================================================== journey mode */
  html.classList.add('journey');
  var cv = d.getElementById('world'), mainCtx = cv.getContext('2d', { alpha: false });
  var track = d.querySelector('.track'), probeS = d.querySelector('.probe.s'), probeL = d.querySelector('.probe.l');
  var hud = d.querySelector('.hud'), fillEl = d.querySelector('.route .fill'), cue = d.querySelector('.cue');
  var routeLinks = [].slice.call(d.querySelectorAll('.route a'));
  var themeMeta = d.querySelector('meta[name="theme-color"]');
  var panels = CH.map(function (c) {
    var el = d.querySelector('[data-ch="' + c.id + '"]');
    return { c: c, el: el, inner: el.querySelector('.inner'), strip: el.querySelector('.strip'), dots: [].slice.call(el.querySelectorAll('.dots i')), x: null, op: null, on: null, sx: null, dot: -1 };
  });

  [].forEach.call(d.querySelectorAll('.word'), function (w) {
    var t = w.textContent; w.setAttribute('aria-label', t); w.textContent = '';
    t.split('').forEach(function (ch, i) { var sp = d.createElement('span'); sp.setAttribute('aria-hidden', 'true'); sp.textContent = ch; sp.style.setProperty('--lag', (i * .16).toFixed(2)); w.appendChild(sp); });
  });
  var W = 0, H = 0, Hs = 0, dpr = 1, S = 1, gy = 0, anchor = 0, textH = 0, hudH = 64, sMul = 1, TOTAL = 0, DELTA = 0, lastW = -1, lastH = -1;
  var st = { cur: 0, camPrev: 0, speed: 0, last: 0, touch: false, n: 0, t0: 0, cost: 0, costN: 0 };
  var dprCap = 2;
  var tPts = [], rPts = [];

  function measure() {
    W = html.clientWidth;
    Hs = probeS.offsetHeight || win.innerHeight; H = Math.max(probeL.offsetHeight || win.innerHeight, Hs);
    dpr = Math.min(win.devicePixelRatio || 1, dprCap);
    S = Math.min(W / 560, Hs / 700) * sMul;
    hudH = W <= 700 ? 56 : 64;
    gy = Math.round(Hs - FRONT * S);
    anchor = (W / S) * (W < 700 ? .21 : .2);
    textH = Math.max(160, Math.floor(gy - HARD * S - hudH - 4));
    html.style.setProperty('--text-h', textH + 'px');
  }
  function fitPanels() {
    for (var pass = 0; pass < 5; pass++) {
      var worst = 0;
      panels.forEach(function (p) {
        var f = 1; p.el.style.setProperty('--fit', '1');
        while (p.inner.offsetHeight > textH && f > .78) { f -= .04; p.el.style.setProperty('--fit', f.toFixed(2)); }
        worst = Math.max(worst, p.inner.offsetHeight - textH);
      });
      if (worst <= 4 || sMul < .62) break;
      sMul *= .92; measure();
    }
  }
  function layout() {
    var keep = TOTAL ? st.cur / TOTAL : 0;
    sMul = 1; measure();
    var narrow = W < 900;
    panels.forEach(function (p) { if (p.strip) p.strip.classList.toggle('slide', narrow); });
    fitPanels();
    /* measured here, once, so the frame loop never forces a layout */
    panels.forEach(function (p) { if (p.strip) { var card = p.strip.firstElementChild; p.stepW = narrow && card ? card.offsetWidth + 14 : 0; } });
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var y = 0;
    CH.forEach(function (c) { c.y0 = y; y += (narrow && c.vhN ? c.vhN : c.vh) * Hs; c.y1 = y; });
    TOTAL = y; DELTA = Hs * .2;
    track.style.height = Math.ceil(TOTAL + H) + 'px';
    buildWorld(anchor);
    /* time-of-day and rail control points */
    tPts = []; var last = CH.length - 1;
    CH.forEach(function (c, i) {
      var ds = i === 0 ? 0 : c.y0 + DELTA, de = i === last ? TOTAL : c.y1 - DELTA, nt = i < last ? CH[i + 1].t : c.t;
      tPts.push([ds, c.t, 0], [de, lerp(c.t, nt, c.drift), 1]);
    });
    function mid(id) { var c = chap(id); return (c.y0 + c.y1) / 2; }
    rPts = [[0, 0], [mid('find'), .16], [mid('build'), .5], [mid('stick'), .84], [TOTAL, 1]];
    lastW = W; lastH = win.innerHeight;
    if (keep) { win.scrollTo(0, keep * TOTAL); st.cur = keep * TOTAL; }
    forceDom = true;
  }
  function piece(pts, y, eased) {
    if (y <= pts[0][0]) return pts[0][1];
    for (var i = 1; i < pts.length; i++) if (y <= pts[i][0]) {
      var a = pts[i - 1], b = pts[i], u = (y - a[0]) / (b[0] - a[0] || 1);
      return lerp(a[1], b[1], eased && b[2] === 0 ? smooth(u) : u);
    }
    return pts[pts.length - 1][1];
  }
  function camAt(y) {
    for (var i = 0; i < CH.length; i++) { var c = CH[i]; if (y <= c.y1 || i === CH.length - 1) return lerp(c.x0, c.x1, sat((y - c.y0) / (c.y1 - c.y0))); }
    return CAMMAX;
  }
  function topOf(id) { var c = chap(id); return c === CH[0] ? 0 : Math.round(c.y0 + DELTA + 2); }

  var forceDom = true, lastHud = '', lastTheme = '', lastR = '', lastCue = '', lastRoute = '', themeAt = 0;
  function updateDom(y, now) {
    var D = Math.min(W * .92, 760), last = panels.length - 1;
    panels.forEach(function (p, i) {
      var c = p.c;
      var inU = i === 0 ? 1 : range(y, c.y0 - DELTA, c.y0 + DELTA), outU = i === last ? 0 : range(y, c.y1 - DELTA, c.y1 + DELTA);
      var x = Math.round(((1 - easeIO(inU)) - easeIO(outU)) * D * 10) / 10;
      var op = Math.round(smooth(range(inU, .5, .92)) * (1 - smooth(range(outU, .08, .5))) * 1000) / 1000;
      if (x !== p.x || forceDom) { p.x = x; p.el.style.setProperty('--x', x + 'px'); }
      if (op !== p.op || forceDom) { p.op = op; p.el.style.opacity = op; }
      var on = op > .5; if (on !== p.on || forceDom) { p.on = on; p.el.classList.toggle('on', on); }
      if (p.strip) {
        var sx = 0, dot = 0;
        if (p.strip.classList.contains('slide')) {
          var v = range(y, c.y0 + DELTA, c.y1 - DELTA), idx = smooth(range(v, .26, .4)) + smooth(range(v, .6, .74));
          sx = Math.round(-idx * p.stepW * 10) / 10; dot = Math.round(idx);
        }
        if (sx !== p.sx || forceDom) { p.sx = sx; p.strip.style.transform = sx ? 'translate3d(' + sx + 'px,0,0)' : ''; }
        if (dot !== p.dot || forceDom) { p.dot = dot; p.dots.forEach(function (el, k) { el.classList.toggle('on', k === dot); }); }
      }
    });
    var r = (piece(rPts, y) * 100).toFixed(2) + '%';
    if (r !== lastR) { lastR = r; fillEl.style.width = r; }
    var rf = parseFloat(r) / 100, ats = [.16, .5, .84], cur = -1;
    ['find', 'build', 'stick'].forEach(function (id, k) { var c = chap(id); if (y > c.y0 - DELTA && y < c.y1 - DELTA) cur = k; });
    var rk = cur + '|' + (rf >= .06) + (rf >= .4) + (rf >= .74);
    if (rk !== lastRoute) {
      lastRoute = rk;
      routeLinks.forEach(function (a, k) { a.classList.toggle('reached', rf >= ats[k] - .1); a.classList.toggle('now', k === cur); if (k === cur) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    }
    var hc = css(P.hud); if (hc !== lastHud) { lastHud = hc; hud.style.setProperty('--hud-fg', hc); }
    var co = (1 - range(y, 10, Hs * .3)).toFixed(2); if (co !== lastCue) { lastCue = co; cue.style.opacity = co; }
    if (themeMeta && now - themeAt > 250) { themeAt = now; var tc = css(P.sky[0]); if (tc !== lastTheme) { lastTheme = tc; themeMeta.setAttribute('content', tc); } }
    forceDom = false;
  }

  var raf = 0;
  function frame(now) {
    raf = win.requestAnimationFrame(frame);
    var dt = Math.min(64, now - st.last || 16); st.last = now; st.n++;
    var target = clamp(win.pageYOffset || html.scrollTop || 0, 0, TOTAL);
    var idle = Math.abs(target - st.cur) < .05;
    if (idle) st.cur = target; else st.cur += (target - st.cur) * (st.touch ? 1 : 1 - Math.exp(-dt / 80));
    if (idle && Math.abs(st.speed) < 2 && (st.n & 1) && !forceDom && now - st.t0 > 2400) return;   /* ambient motion only: half rate */
    if (!st.t0) st.t0 = now;
    var intro = st.cur < 4 ? (1 - easeOut((now - st.t0 - 250) / 1700)) * (anchor + 110) : 0;
    if (intro > .5) idle = false;
    var cam = camAt(st.cur), v = (cam - intro - st.camPrev) / dt * 1000; st.camPrev = cam - intro;
    st.speed = lerp(st.speed, v, .25);
    var view = { ctx: mainCtx, W: W, H: H, Hs: Hs, gy: gy, s: S, dpr: dpr, cam: cam, T: piece(tPts, st.cur, true),
      tx: cam + anchor - intro, px: cam + anchor, now: now, still: false, moving: sat(Math.abs(st.speed) / 200) };
    V = view; stepDust(dt / 1000, st.speed);
    var c0 = win.performance.now();
    render(view);
    updateDom(st.cur, now);
    st.cost += win.performance.now() - c0; st.costN++;
    if (st.costN >= 90) {
      if (st.cost / st.costN > 10 && dpr > 1) { dprCap = Math.max(1, dpr - .5); dpr = dprCap; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      st.cost = 0; st.costN = 0;
    }
  }
  function start() { if (!raf) { st.last = 0; raf = win.requestAnimationFrame(frame); } }
  function stop() { if (raf) { win.cancelAnimationFrame(raf); raf = 0; } }

  /* grain */
  (function () {
    var c = d.createElement('canvas'), n = 160; c.width = c.height = n;
    var g = c.getContext('2d'), im = g.createImageData(n, n), r = rng(7), i;
    for (i = 0; i < im.data.length; i += 4) { var v = r(); im.data[i] = im.data[i + 1] = im.data[i + 2] = v < .5 ? 0 : 255; im.data[i + 3] = Math.abs(v - .5) * 30 | 0; }
    g.putImageData(im, 0, 0);
    d.querySelector('.grain').style.backgroundImage = 'url(' + c.toDataURL() + ')';
  })();

  /* navigation: rail, hash, keyboard focus */
  function go(id, instant) {
    var c = chap(id === 'start' ? 'engage' : id === 'top' ? 'hero' : id === 'how' ? 'find' : id); if (!c) return false;
    win.scrollTo({ top: topOf(c.id), behavior: instant ? 'auto' : 'smooth' });
    return true;
  }
  d.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return;
    if (go(a.getAttribute('href').slice(1))) { e.preventDefault(); if (win.history && history.replaceState) history.replaceState(null, '', a.getAttribute('href')); }
  });
  d.querySelector('main').addEventListener('focusin', function (e) {
    var sec = e.target.closest('.panel'); if (!sec || sec.classList.contains('on')) return;
    win.scrollTo(0, topOf(sec.getAttribute('data-ch')));
  });
  win.addEventListener('touchstart', function () { st.touch = true; }, { passive: true });
  win.addEventListener('wheel', function () { st.touch = false; }, { passive: true });
  win.addEventListener('keydown', function () { st.touch = false; });
  d.addEventListener('visibilitychange', function () { if (d.hidden) stop(); else start(); });
  win.addEventListener('resize', debounce(function () {
    /* phone toolbars resize the window constantly; only a real change relays out */
    if (win.innerHeight < SHORT) { location.reload(); return; }
    if (html.clientWidth === lastW && Math.abs(win.innerHeight - lastH) < 130) return;
    layout();
  }, 140));
  if (win.matchMedia) {
    var mq = win.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.addEventListener) mq.addEventListener('change', function () { location.reload(); });
  }

  layout();
  if (location.hash.length > 1) { go(location.hash.slice(1), true); st.cur = win.pageYOffset; }
  if (d.fonts && d.fonts.ready) d.fonts.ready.then(layout);
  start();
})();
