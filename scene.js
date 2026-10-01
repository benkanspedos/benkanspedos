/* benkanspedos.com, scroll variation C: scale.
   One canvas, four nested worlds, each found inside the last:
     district (the portfolio) > office (through one window) > screen (the task) > workflow (inside one field)
   Scroll drives a camera through them and back out. Everything drawn here is a pure
   function of (camera, story position, clock), so scrolling backwards just works and the
   reduced-motion page can render the same frames as stills. No image assets. */
(function () {
  'use strict';

  var root = document.documentElement;
  var MODE = root.classList.contains('live') ? 'live' : root.classList.contains('still') ? 'still' : '';
  if (!MODE) return;

  // ------------------------------------------------------------------ utils
  var PI = Math.PI, TAU = PI * 2;
  function clamp(v, a, b) { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(a, b, v) { var t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); }
  function hash(a, b, c) { var h = Math.sin(a * 127.1 + (b || 0) * 311.7 + (c || 0) * 74.7) * 43758.5453; return h - Math.floor(h); }
  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function css(c, al) {
    return al === undefined || al >= 1
      ? 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'
      : 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + al.toFixed(3) + ')';
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function setT(ctx, L, T) { ctx.setTransform(T.a * L.dpr, 0, 0, T.a * L.dpr, T.x * L.dpr, T.y * L.dpr); }
  function setScreen(ctx, L) { ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0); }

  var F_MONO = '"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace';
  var F_BODY = '"Hanken Grotesk",system-ui,-apple-system,"Segoe UI",sans-serif';
  var F_DISP = '"Big Shoulders Display","Arial Narrow",Impact,sans-serif';

  /* Text is always set in screen space so tiny world-unit sizes never reach the font engine. */
  function wtext(ctx, L, T, str, x, y, size, weight, family, color, align, alpha, minPx, maxPx) {
    var px = size * T.a;
    if (minPx) px = Math.max(px, minPx);
    if (maxPx) px = Math.min(px, maxPx);
    if (px < 4 || alpha <= 0.01) return 0;
    ctx.save();
    setScreen(ctx, L);
    ctx.font = weight + ' ' + px.toFixed(2) + 'px ' + family;
    ctx.fillStyle = color;
    ctx.globalAlpha *= alpha === undefined ? 1 : alpha;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, T.x + x * T.a, T.y + y * T.a);
    ctx.restore();
    return px;
  }

  // ------------------------------------------------------------------ palette
  var C = {
    off: hex('#2B2658'), dim: hex('#C98548'), gold: hex('#FFD98A'), goldHot: hex('#FFF4D2'),
    ground: hex('#0F0D22'), groundN: hex('#0A0918'),
    ink: hex('#16132E'), plum: hex('#241F4A'), paper: hex('#FBF3E4')
  };
  var SKY = [
    [0.00, hex('#121034'), hex('#060512')],
    [0.42, hex('#33275D'), hex('#0B0A22')],
    [0.66, hex('#7B4572'), hex('#121032')],
    [0.85, hex('#DB8561'), hex('#1B173F')],
    [1.00, hex('#FFC98A'), hex('#2A2256')]
  ];
  var TONE = [hex('#1E1A42'), hex('#262152'), hex('#19163A'), hex('#2B1F4A')];
  var TONE_N = [hex('#15122F'), hex('#1A163A'), hex('#110F28'), hex('#1B1533')];

  var glow = document.createElement('canvas');
  glow.width = glow.height = 64;
  (function () {
    var g = glow.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,214,120,.6)');
    gr.addColorStop(0.45, 'rgba(255,200,104,.2)');
    gr.addColorStop(1, 'rgba(255,190,90,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  })();

  // ------------------------------------------------------------------ world: the district
  var GROUND = 2000, FH = 64, LOBBY = 90, PARAPET = 26;
  var BLD = [
    { x: 300, w: 340, floors: 3, bays: 6, r: 0.78, k: 0.8, tone: 2 },
    { x: 690, w: 280, floors: 5, bays: 5, r: 0.6, k: 1.25, tone: 0 },
    { x: 1020, w: 420, floors: 4, bays: 7, r: 0.66, k: 1.12, tone: 3 },   // engagement building
    { x: 1490, w: 170, floors: 8, bays: 3, r: 0.56, k: 1.5, tone: 2 },
    { x: 1700, w: 480, floors: 11, bays: 8, r: 0.64, k: 1.16, tone: 1 },  // focus building
    { x: 2230, w: 300, floors: 6, bays: 5, r: 0.72, k: 0.95, tone: 3 },   // receipt: product
    { x: 2580, w: 360, floors: 16, bays: 6, r: 0.6, k: 1.2, tone: 0 },    // receipt: the big org
    { x: 2990, w: 380, floors: 8, bays: 6, r: 0.8, k: 0.72, tone: 2 },    // receipt: client
    { x: 3420, w: 300, floors: 5, bays: 5, r: 0.62, k: 1.2, tone: 1 },    // receipt: client
    { x: 3760, w: 180, floors: 3, bays: 3, r: 0.7, k: 0.9, tone: 3 }
  ];
  var FOCUS = BLD[4], ENG = BLD[2], TF = 5, TC = 4;
  var RECEIPT = { 6: 'INTUIT · 21 YEARS', 5: 'CONVOWIZE · LIVE', 7: 'REAL ESTATE FIRM', 8: 'E-LEARNING VENDOR' };
  var ENG_FLAGS = [[2, 2], [1, 5], [3, 0]];
  var ENG_EXPAND = [[1, 5], [3, 0], [2, 3], [2, 1], [1, 2], [1, 4], [0, 5], [3, 1]];

  BLD.forEach(function (b, i) {
    b.i = i;
    b.h = LOBBY + b.floors * FH + PARAPET;
    b.top = GROUND - b.h;
    b.px = (b.w - 44) / b.bays;
    b.ww = b.px * b.r;
    b.wh = b.ww * b.k;
    b.wins = [];
    var maxD = 0, f, c;
    if (b === FOCUS) for (f = 0; f < b.floors; f++) for (c = 0; c < b.bays; c++) maxD = Math.max(maxD, Math.hypot((c - TC) * 0.9, f - TF));
    for (f = 0; f < b.floors; f++) for (c = 0; c < b.bays; c++) {
      var w = {
        f: f, c: c,
        x: b.x + 22 + c * b.px + (b.px - b.ww) / 2,
        y: b.top + PARAPET + f * FH + (FH - b.wh) / 2 + 2,
        w: b.ww, h: b.wh,
        dim: hash(i * 7.3 + 1, f, c) < 0.13 ? 0.55 + hash(i, f * 3, c) * 0.35 : 0,
        kind: Math.floor(hash(i + 2, f, c * 5) * 3),
        th: 9, target: false, pilot: false, quick: false, blinds: hash(i, c, f * 9) < 0.35
      };
      if (b === FOCUS) {
        if (f === TF && c === TC) { w.target = true; w.dim = 1; w.th = 0; }
        else if (f === TF && c === TC + 1) { w.pilot = true; w.dim = 0.5; }
        else if (hash(f, c, 9.1) > 0.14) w.th = Math.hypot((c - TC) * 0.9, f - TF) / maxD * 0.8 + hash(f, c, 4.2) * 0.14;
      } else if (RECEIPT[i]) {
        if (hash(f, c, i) > 0.12) w.th = (b.floors - 1 - f) / b.floors * 0.74 + hash(f, c, i + 5) * 0.2;
      } else if (b === ENG) {
        if (f === ENG_FLAGS[0][0] && c === ENG_FLAGS[0][1]) w.quick = true;
        for (var k = 0; k < ENG_EXPAND.length; k++) if (ENG_EXPAND[k][0] === f && ENG_EXPAND[k][1] === c) w.th = k / ENG_EXPAND.length * 0.86;
        w.dim = 0;
      }
      b.wins.push(w);
    }
  });
  function winAt(b, f, c) { return b.wins[f * b.bays + c]; }

  // ------------------------------------------------------------------ nested worlds
  var PO = winAt(FOCUS, TF, TC);               // the office lives in this pane of glass
  var OW = 720, OH = OW * PO.h / PO.w, kO = PO.w / OW;
  var SCR = { x: 300, y: 316, w: 230, h: 143.75 };  // the monitor, in office units
  var SW = 1600, SH = 1000, kS = SCR.w / SW;
  var FLD = { x: 840, y: 520, w: 300, h: 84 };      // one form field, in screen units
  var PWD = 1500, PHT = 420, kP = FLD.w / PWD;
  function o2d(r) { return { x: PO.x + r.x * kO, y: PO.y + r.y * kO, w: r.w * kO, h: r.h * kO }; }
  function s2d(r) { return o2d({ x: SCR.x + r.x * kS, y: SCR.y + r.y * kS, w: r.w * kS, h: r.h * kS }); }
  function p2d(r) { return s2d({ x: FLD.x + r.x * kP, y: FLD.y + r.y * kP, w: r.w * kP, h: r.h * kP }); }

  // ------------------------------------------------------------------ camera
  /* A view is {s, cx, cy} in district units: screen = (world - c) * s + viewport/2. */
  function fit(L, rect, reg, k, bottom) {
    var rw = (reg.x1 - reg.x0) * L.w, rh = (reg.y1 - reg.y0) * L.h;
    var s = Math.min(rw / rect.w, rh / rect.h) * (k || 1);
    var rcx = (reg.x0 + reg.x1) / 2 * L.w, rcy = (reg.y0 + reg.y1) / 2 * L.h;
    var cy = bottom
      ? rect.y + rect.h - (reg.y1 * L.h - L.h / 2) / s
      : rect.y + rect.h / 2 - (rcy - L.h / 2) / s;
    return { s: s, cx: rect.x + rect.w / 2 - (rcx - L.w / 2) / s, cy: cy };
  }
  /* Zoom between two views along the path that keeps their shared fixed point still. */
  function between(A, B, t) {
    var ls = Math.log(B.s / A.s);
    if (Math.abs(ls) < 1e-4) return { s: A.s, cx: lerp(A.cx, B.cx, t), cy: lerp(A.cy, B.cy, t) };
    var s = A.s * Math.exp(ls * t);
    var w = (1 / s - 1 / A.s) / (1 / B.s - 1 / A.s);
    return { s: s, cx: lerp(A.cx, B.cx, w), cy: lerp(A.cy, B.cy, w) };
  }
  function pad(r, p) { return { x: r.x - r.w * p, y: r.y - r.h * p, w: r.w * (1 + 2 * p), h: r.h * (1 + 2 * p) }; }
  function push(L, v, k, reg) {
    var rx = ((reg.x0 + reg.x1) / 2 - 0.5) * L.w, ry = ((reg.y0 + reg.y1) / 2 - 0.5) * L.h;
    var wx = v.cx + rx / v.s, wy = v.cy + ry / v.s, s = v.s * k;
    return { s: s, cx: wx - rx / s, cy: wy - ry / s };
  }

  var BEATS = ['hero', 'findA', 'findB', 'buildA', 'buildB', 'stickA', 'stickB', 'rec1', 'rec2', 'rec3', 'eng1', 'eng2', 'eng3', 'contact'];

  function buildViews(L) {
    var b = FOCUS, e = ENG;
    function hr(k) { return (L.heroes && L.heroes[k]) || L.hero; }
    // on a phone each beat gets its own stage: whatever is left above its text
    function st(k) { return (L.stages && L.stages[k]) || L.stage; }
    var sp = st('buildB');
    var sxf = sp.x1 - sp.x0, syf = sp.y1 - sp.y0, sa = (sxf * L.w) / (syf * L.h);
    // the workflow world must fill the whole viewport, so size its focus rect from the stage
    var Fh = Math.min((PHT - 20) * syf, (PWD - 60) * sxf / sa) * 0.96, Fw = Fh * sa;
    var vwP = Fw / sxf, vhP = Fh / syf;
    var F = { x: (PWD - vwP) / 2 + sp.x0 * vwP, y: (PHT - vhP) / 2 + sp.y0 * vhP, w: Fw, h: Fh };
    L.pipe = { cx: F.x + Fw / 2, cy: F.y + Fh / 2, w: Fw * 0.9, h: Math.min(Fh * 0.9, Fw * 0.9 * 1.5) };
    var heroRect = L.phone ? { x: 1230, y: 800, w: 1660, h: 1350 } : { x: 250, y: 940, w: 3560, h: 1210 };
    var G = GROUND + 150;
    var bRect = { x: b.x - 90, y: b.top - 150, w: b.w + 180, h: b.h + 210 };
    var m = L.phone ? 9 : 14;
    var two = { x: PO.x - m, y: PO.y - m, w: b.px + PO.w + 2 * m, h: PO.h + 2 * m + 12 };
    var three = { x: PO.x - b.px * 1.12, y: PO.y - FH * 1.08, w: PO.w + b.px * 2.24, h: PO.h + FH * 2.16 };
    var scr = pad(o2d(SCR), 0.06);
    var eRect = { x: e.x - 70, y: e.top - 120, w: e.w + 140, h: e.h + 180 };
    var q = winAt(e, ENG_FLAGS[0][0], ENG_FLAGS[0][1]);
    var qRect = { x: q.x - e.px * 1.15, y: q.y - FH * 0.85, w: q.w + e.px * 2.3, h: q.h + FH * 1.7 };

    var endRect = L.phone ? { x: 1440, y: 800, w: 1990, h: 1350 } : heroRect;
    var hero = fit(L, heroRect, hr('hero'), 1, true), end = fit(L, endRect, hr('contact'), 1, true);
    var office = pad(PO, 0.03), pipe = fit(L, p2d(F), sp);
    var v = {
      hero: [hero, between(hero, fit(L, bRect, st('findA')), 0.1)],
      findA: [fit(L, bRect, st('findA')), fit(L, two, st('findA'))],
      findB: [fit(L, office, st('findB')), fit(L, o2d({ x: 120, y: 262, w: 560, h: 330 }), st('findB'))],
      buildA: [fit(L, scr, st('buildA')), fit(L, pad(s2d(FLD), 0.24), st('buildA'))],
      buildB: [pipe, push(L, pipe, 1.1, sp)],
      stickA: [fit(L, scr, st('stickA')), fit(L, office, st('stickA'))],
      stickB: [fit(L, three, st('stickB')), fit(L, bRect, st('stickB'))],
      rec1: [fit(L, { x: 1640, y: 640, w: 1380, h: G - 640 }, st('rec1'), 1, true)],
      rec2: [fit(L, { x: 1640, y: 640, w: 1780, h: G - 640 }, st('rec2'), 1, true)],
      rec3: [fit(L, { x: 1480, y: 640, w: 2320, h: G - 640 }, st('rec3'), 1, true)],
      eng1: [fit(L, eRect, st('eng1'))],
      eng2: [fit(L, qRect, st('eng2'))],
      eng3: [fit(L, eRect, st('eng3')), fit(L, { x: 880, y: 1080, w: 1420, h: 1080 }, st('eng3'))],
      contact: [push(L, end, 1.07, hr('contact')), end]
    };
    ['rec1', 'rec2', 'rec3'].forEach(function (k) { v[k][1] = push(L, v[k][0], 0.93, st(k)); });
    v.eng1[1] = push(L, v.eng1[0], 1.12, st('eng1'));
    v.eng2[1] = push(L, v.eng2[0], 1.08, st('eng2'));
    return BEATS.map(function (k) { return v[k]; });
  }

  /* Story position tau: beat i is pinned on [i, i+.5] and travels to the next on [i+.5, i+1]. */
  function camAt(views, tau) {
    var last = views.length - 1;
    tau = clamp(tau, 0, last + 0.5);
    var i = Math.min(Math.floor(tau), last), f = tau - i;
    if (f <= 0.5 || i === last) return between(views[i][0], views[i][1], clamp(f * 2));
    var t = (f - 0.5) * 2;
    return between(views[i][1], views[i + 1][0], lerp(t, t * t * (3 - 2 * t), 0.65));
  }

  function stateAt(tau) {
    function r(a, b) { return smooth(a, b, tau); }
    return {
      tau: tau,
      scrim: r(0.55, 1.0) * (1 - r(12.55, 13.0)),
      ret: r(1.14, 1.3) * (1 - r(1.5, 1.7)),
      diag: r(2.12, 2.3) * (1 - r(2.5, 2.72)),
      pb: r(3.84, 4.4),
      adopt: r(4.42, 4.5),
      session: r(5.1, 5.42),
      litF: r(5.82, 6.5),
      lit: { 6: r(6.8, 7.36), 5: r(7.8, 8.32), 7: r(8.78, 9.22), 8: r(8.9, 9.36) },
      tag: {
        6: r(6.92, 7.1) * (1 - r(7.52, 7.75)), 5: r(7.9, 8.08) * (1 - r(8.52, 8.75)),
        7: r(8.9, 9.08) * (1 - r(9.52, 9.8)), 8: r(8.98, 9.16) * (1 - r(9.52, 9.8))
      },
      night: r(6.4, 9.6),
      survey: r(9.82, 10.08) * (1 - r(11.45, 11.75)),
      scan: r(10.08, 10.44),
      quick: r(10.84, 11.14),
      expand: r(11.8, 12.36)
    };
  }

  // ------------------------------------------------------------------ draw: district
  var STARS = [];
  (function () { for (var i = 0; i < 190; i++) STARS.push({ x: -1700 + hash(i, 1) * 7400, y: -1500 + hash(i, 2) * 2950, r: 0.6 + hash(i, 3) * 0.9, p: hash(i, 4) * TAU }); })();
  var SAGUARO = [[-1180, 0.9], [-760, 1.25], [-420, 0.8], [-150, 1.1], [70, 0.75], [185, 1.0], [4040, 1.05], [4180, 0.8], [4470, 1.2], [4800, 0.85], [5260, 1.1]];
  var LAMPS = [270, 665, 995, 1465, 1680, 2205, 2555, 2965, 3395, 3740, 3970];
  // x, y, width, height, drift (units/s), strength
  var CLOUDS = [[300, 1410, 980, 26, 3, 1], [1500, 1235, 720, 20, 2.2, 0.8], [2550, 1500, 1150, 30, 3.4, 1], [3350, 1150, 620, 18, 1.8, 0.7], [-700, 1300, 860, 22, 2.6, 0.9], [900, 1040, 520, 14, 1.5, 0.6], [4300, 1380, 900, 24, 2.8, 0.9], [5300, 1210, 640, 18, 2, 0.7]];
  // lane y, speed (units/s, sign is direction), phase
  var CARS = [[GROUND + 58, 82, 0], [GROUND + 58, 96, 2900], [GROUND + 34, -74, 1400], [GROUND + 34, -88, 4300]];

  /* A transform for a distant layer: it shares the camera's centre and horizon but scales
     with zoom^p (p < 1), which is what makes the push-in feel like travel instead of a crop. */
  function farT(L, T, p) {
    var a0 = L.a0 || T.a, af = a0 * Math.pow(T.a / a0, p), cxw = (L.w / 2 - T.x) / T.a;
    return { a: af, x: L.w / 2 - cxw * af, y: T.y + GROUND * T.a - GROUND * af };
  }

  function ridge(ctx, L, T, yH, base, amp, f, ph) {
    ctx.beginPath();
    ctx.moveTo(-4, yH + 2);
    for (var sx = -4; sx <= L.w + 8; sx += 8) {
      var wx = (sx - T.x) / T.a;
      var h = base + amp * (Math.sin(wx * f + ph) * 0.5 + Math.abs(Math.sin(wx * f * 2.3 + ph * 1.7)) * 0.42 + Math.sin(wx * f * 6.1 + ph * 0.6) * 0.11 + Math.sin(wx * f * 13.7) * 0.04);
      ctx.lineTo(sx, yH - h * T.a);
    }
    ctx.lineTo(L.w + 8, yH + 2);
    ctx.closePath();
    ctx.fill();
  }

  function saguaro(ctx, x, k) {
    var g = GROUND + 4;
    rr(ctx, x - 9 * k, g - 124 * k, 18 * k, 124 * k, 9 * k); ctx.fill();
    rr(ctx, x - 33 * k, g - 76 * k, 28 * k, 11 * k, 5 * k); ctx.fill();
    rr(ctx, x - 33 * k, g - 108 * k, 11 * k, 43 * k, 5.5 * k); ctx.fill();
    rr(ctx, x + 5 * k, g - 94 * k, 26 * k, 11 * k, 5 * k); ctx.fill();
    rr(ctx, x + 20 * k, g - 132 * k, 11 * k, 49 * k, 5.5 * k); ctx.fill();
  }

  function winGold(b, w, S) {
    if (b === FOCUS) return w.target ? S.adopt : w.th < 2 ? smooth(w.th, w.th + 0.07, S.litF) : 0;
    if (b === ENG) return Math.max(w.quick ? S.quick : 0, w.th < 2 ? smooth(w.th, w.th + 0.1, S.expand) : 0);
    var l = S.lit[b.i];
    return l !== undefined && w.th < 2 ? smooth(w.th, w.th + 0.08, l) : 0;
  }

  var WALL_DIM = [178, 112, 64], WALL_GOLD = [248, 206, 132];

  function miniOffice(ctx, w, gold, kind) {
    var x = w.x, y = w.y, W = w.w, H = w.h;
    var wall = gold > 0 ? mixc(WALL_DIM, WALL_GOLD, gold) : WALL_DIM;
    if (kind === 3) wall = [128, 84, 60];
    ctx.fillStyle = css(wall); ctx.fillRect(x, y, W, H);
    ctx.fillStyle = 'rgba(255,244,214,.7)'; ctx.fillRect(x + W * 0.26, y, W * 0.48, H * 0.02);
    ctx.fillStyle = 'rgba(42,22,44,.6)'; ctx.fillRect(x, y + H * 0.79, W, H * 0.21);
    var dark = '#17142F';
    if (kind === 3) { // the shelved pilot
      ctx.fillStyle = '#5E3E34'; ctx.fillRect(x + W * 0.1, y + H * 0.5, W * 0.8, H * 0.03);
      ctx.fillStyle = '#B58A5C'; ctx.fillRect(x + W * 0.3, y + H * 0.27, W * 0.4, H * 0.23);
      ctx.fillStyle = '#9A7148'; ctx.fillRect(x + W * 0.3, y + H * 0.27, W * 0.4, H * 0.035);
      ctx.fillStyle = '#D8B98A'; ctx.fillRect(x + W * 0.485, y + H * 0.27, W * 0.03, H * 0.23);
      ctx.fillStyle = '#F6ECD9'; ctx.fillRect(x + W * 0.345, y + H * 0.36, W * 0.31, H * 0.085);
      ctx.strokeStyle = 'rgba(255,240,220,.28)'; ctx.lineWidth = W * 0.004;
      ctx.beginPath();
      ctx.moveTo(x, y + H * 0.2); ctx.lineTo(x + W * 0.2, y);
      ctx.moveTo(x, y + H * 0.11); ctx.lineTo(x + W * 0.11, y);
      ctx.moveTo(x, y); ctx.lineTo(x + W * 0.15, y + H * 0.13);
      ctx.stroke();
      return;
    }
    ctx.fillStyle = '#EAD2AC'; ctx.fillRect(x + W * 0.1, y + H * 0.63, W * 0.8, H * 0.028);
    ctx.fillStyle = '#A87C54'; ctx.fillRect(x + W * 0.1, y + H * 0.658, W * 0.8, H * 0.02);
    ctx.fillRect(x + W * 0.14, y + H * 0.678, W * 0.035, H * 0.112);
    ctx.fillRect(x + W * 0.825, y + H * 0.678, W * 0.035, H * 0.112);
    if (kind !== 2) {
      ctx.fillStyle = dark; ctx.fillRect(x + W * 0.44, y + H * 0.41, W * 0.32, H * 0.19);
      ctx.fillRect(x + W * 0.585, y + H * 0.6, W * 0.03, H * 0.03);
      ctx.fillStyle = gold > 0.5 ? '#FFF2C8' : '#C4D2E6';
      ctx.fillRect(x + W * 0.455, y + H * 0.425, W * 0.29, H * 0.16);
    }
    if (kind === 0 || gold > 0.5) {
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.arc(x + W * 0.29, y + H * 0.535, W * 0.068, 0, TAU); ctx.fill();
      rr(ctx, x + W * 0.18, y + H * 0.61, W * 0.22, H * 0.25, W * 0.05); ctx.fill();
    }
    if (kind === 2) {
      ctx.fillStyle = '#3F7C5B';
      ctx.beginPath(); ctx.ellipse(x + W * 0.72, y + H * 0.5, W * 0.05, H * 0.09, 0.3, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + W * 0.78, y + H * 0.52, W * 0.045, H * 0.08, -0.4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#7A4B3A'; ctx.fillRect(x + W * 0.71, y + H * 0.57, W * 0.09, H * 0.06);
    }
  }

  function drawBuilding(ctx, L, T, S, t, b, officeOn) {
    var a = T.a, n = S.night, i, w;
    var tone = mixc(TONE[b.tone], TONE_N[b.tone], n), lift = b === ENG ? Math.max(S.survey, S.quick, S.expand) * 0.5 : 0;
    if (lift > 0) tone = mixc(tone, [58, 50, 112], lift);
    ctx.fillStyle = css(tone); ctx.fillRect(b.x, b.top, b.w, b.h + 2);
    ctx.fillStyle = css(mixc(tone, [128, 112, 200], 0.2)); ctx.fillRect(b.x - 3, b.top, b.w + 6, 8);
    ctx.fillStyle = 'rgba(248,164,104,' + (0.6 * (1 - n * 0.92)).toFixed(3) + ')'; ctx.fillRect(b.x, b.top + 8, 3, b.h - 8);
    // roof kit
    ctx.fillStyle = css(mixc(tone, [0, 0, 0], 0.25));
    for (i = 0; i < 3; i++) if (hash(b.i, i, 3.3) > 0.45) {
      var bw = 26 + hash(b.i, i, 1.1) * 40, bh = 10 + hash(b.i, i, 2.2) * 16;
      ctx.fillRect(b.x + 14 + hash(b.i, i, 5.5) * (b.w - 28 - bw), b.top - bh, bw, bh);
    }
    if (b.floors >= 16) {
      ctx.fillRect(b.x + b.w / 2 - 2, b.top - 120, 4, 120);
      ctx.fillRect(b.x + b.w / 2 - 16, b.top - 44, 32, 4);
      var blink = 0.25 + 0.75 * smooth(0.55, 0.9, Math.sin(t * 2.4));
      ctx.fillStyle = 'rgba(255,92,80,' + blink.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.top - 122, 4.5, 0, TAU); ctx.fill();
    }
    // lobby
    var ly = GROUND - LOBBY + 18, lh = LOBBY - 30;
    ctx.fillStyle = css(mixc(mixc(tone, C.dim, 0.42), mixc(tone, C.dim, 0.3), n)); ctx.fillRect(b.x + 16, ly, b.w - 32, lh);
    ctx.fillStyle = css(tone);
    for (i = 1; i < b.bays; i++) ctx.fillRect(b.x + 22 + i * b.px - 2.5, ly, 5, lh);
    ctx.fillRect(b.x + b.w / 2 - 15, ly + 8, 30, lh - 8);
    ctx.fillStyle = css(mixc(tone, [128, 112, 200], 0.24)); ctx.fillRect(b.x + b.w / 2 - 44, ly - 7, 88, 5);
    if (a > 1.1) {
      ctx.fillStyle = 'rgba(255,255,255,.04)';
      for (i = 0; i <= b.floors; i++) ctx.fillRect(b.x, b.top + PARAPET + i * FH - 1, b.w, 1.6);
    }

    var wpx = b.ww * a, x0 = -T.x / a - 60, x1 = (L.w - T.x) / a + 60, y0 = -T.y / a - 60, y1 = (L.h - T.y) / a + 60;
    var wins = b.wins, nW = wins.length, g;
    var k = smooth(0.8, 1.15, a);   // 0: flat panes. 1: framed windows with a room behind each lit one
    if (k < 1) {
      ctx.fillStyle = css(mixc(mixc(C.off, [26, 22, 54], n), [72, 64, 138], lift));
      ctx.beginPath();
      for (i = 0; i < nW; i++) { w = wins[i]; ctx.rect(w.x, w.y, w.w, w.h); }
      ctx.fill();
      ctx.fillStyle = css(C.dim);
      for (i = 0; i < nW; i++) {
        w = wins[i];
        if (w.dim > 0 && !(w.target && officeOn)) {
          ctx.globalAlpha = w.target ? 1 : w.dim * (0.9 + 0.1 * Math.sin(t * 0.7 + w.f * 3 + w.c));
          if (w.target) ctx.fillStyle = css([222, 160, 98]);
          ctx.fillRect(w.x, w.y, w.w, w.h);
          if (w.target) ctx.fillStyle = css(C.dim);
        }
      }
      ctx.fillStyle = css(C.gold);
      var any = false;
      for (i = 0; i < nW; i++) {
        w = wins[i]; g = winGold(b, w, S);
        if (g > 0.01 && !(w.target && officeOn)) { any = true; ctx.globalAlpha = g * (0.8 + 0.2 * hash(w.f, w.c, b.i + 0.5)); ctx.fillRect(w.x, w.y, w.w, w.h); }
      }
      if (any && wpx > 3.5) {
        ctx.globalCompositeOperation = 'lighter';
        for (i = 0; i < nW; i++) {
          w = wins[i]; g = winGold(b, w, S);
          if (g > 0.01) { ctx.globalAlpha = g * 0.5; ctx.drawImage(glow, w.x - w.w * 0.9, w.y - w.h * 0.75, w.w * 2.8, w.h * 2.5); }
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
    }
    if (k <= 0) return;
    // close up: frames, sills, and a small room behind every lit pane
    var frame = css(mixc(mixc([58, 51, 110], [40, 35, 84], n), [86, 76, 156], lift)), sill = css(mixc(mixc([92, 82, 160], [60, 53, 120], n), [120, 108, 196], lift));
    for (i = 0; i < nW; i++) {
      w = wins[i];
      if (w.x > x1 || w.x + w.w < x0 || w.y > y1 || w.y + w.h < y0) continue;
      ctx.globalAlpha = k;
      ctx.fillStyle = frame; ctx.fillRect(w.x - 2, w.y - 2, w.w + 4, w.h + 4);
      ctx.fillStyle = sill; ctx.fillRect(w.x - 3.5, w.y + w.h + 2, w.w + 7, 2.4);
      if (w.target && officeOn) continue;
      g = winGold(b, w, S);
      if (w.target) { ctx.fillStyle = css(mixc([222, 160, 98], C.gold, g)); ctx.fillRect(w.x, w.y, w.w, w.h); continue; }
      if (w.dim > 0 || g > 0.01) {
        miniOffice(ctx, w, g, w.pilot ? 3 : w.kind);
        if (w.pilot) wtext(ctx, L, T, 'AI PILOT', w.x + w.w * 0.5, w.y + w.h * 0.404, w.h * 0.05, '500', F_MONO, '#3A2A22', 'center', 1);
        if (g > 0.01 && g < 1 && w.dim === 0) { ctx.fillStyle = css(mixc(C.off, [26, 22, 54], n), 1 - g); ctx.fillRect(w.x, w.y, w.w, w.h); }
        if (g > 0.3) {
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = g * 0.5 * k;
          ctx.drawImage(glow, w.x - w.w * 0.7, w.y - w.h * 0.6, w.w * 2.4, w.h * 2.2);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = k;
        }
      } else {
        ctx.fillStyle = css(mixc(mixc([36, 31, 78], [24, 21, 52], n), [70, 62, 134], lift)); ctx.fillRect(w.x, w.y, w.w, w.h);
        ctx.fillStyle = 'rgba(170,150,230,.10)';
        ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(w.x + w.w * 0.7, w.y); ctx.lineTo(w.x, w.y + w.h * 0.8); ctx.closePath(); ctx.fill();
        if (w.blinds) {
          ctx.fillStyle = 'rgba(200,190,240,.09)';
          for (var j = 0; j < 7; j++) ctx.fillRect(w.x, w.y + w.h * (0.06 + j * 0.075), w.w, w.h * 0.03);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawDistrict(ctx, L, T, S, t, officeOn) {
    var W = L.w, H = L.h, a = T.a, n = S.night, i;
    setScreen(ctx, L);
    var yH = T.y + GROUND * a;
    var Tk = farT(L, T, 0.16), Tc = farT(L, T, 0.3), Tm = farT(L, T, 0.36), Tn = farT(L, T, 0.56);
    var yT = Tk.y - 1700 * Tk.a;
    var g = ctx.createLinearGradient(0, yT, 0, yH);
    for (i = 0; i < SKY.length; i++) g.addColorStop(SKY[i][0], css(mixc(SKY[i][1], SKY[i][2], n)));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (n < 0.98) {
      var sx = Tc.x + 1150 * Tc.a, sy = yH + 60 * Tc.a;
      g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 1500 * Tc.a);
      g.addColorStop(0, 'rgba(255,206,140,' + (0.6 * (1 - n)).toFixed(3) + ')');
      g.addColorStop(0.5, 'rgba(250,150,110,' + (0.16 * (1 - n)).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(250,150,110,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, Math.min(H, yH + 2));
    }
    if (a < 5) {
      ctx.fillStyle = '#FFF4DC';
      for (i = 0; i < STARS.length; i++) {
        var s = STARS[i], px = Tk.x + s.x * Tk.a, py = Tk.y + s.y * Tk.a;
        if (px < -2 || px > W + 2 || py < -2 || py > H + 2) continue;
        var al = (0.14 + 0.86 * n) * clamp((1500 - s.y) / 1100 + 0.05) * (0.72 + 0.28 * Math.sin(t * 1.4 + s.p));
        if (al < 0.03) continue;
        ctx.globalAlpha = al; ctx.fillRect(px, py, s.r * 1.4, s.r * 1.4);
      }
      ctx.globalAlpha = 1;
      // now and then, a shooting star
      if (n > 0.5) {
        var cyc = t / 9, ph = cyc - Math.floor(cyc), seed = Math.floor(cyc);
        if (ph < 0.075) {
          var k = ph / 0.075, hx = (0.15 + hash(seed, 1.7) * 0.7) * W + k * 150, hy = (0.08 + hash(seed, 2.9) * 0.22) * H + k * 62;
          g = ctx.createLinearGradient(hx - 84, hy - 35, hx, hy);
          g.addColorStop(0, 'rgba(255,244,220,0)'); g.addColorStop(1, 'rgba(255,244,220,' + (Math.sin(k * PI) * (n - 0.5) * 1.8).toFixed(3) + ')');
          ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(hx - 84, hy - 35); ctx.lineTo(hx, hy); ctx.stroke();
        }
      }
      // crescent moon
      var mx = Tk.x + 3300 * Tk.a, my = Tk.y + 330 * Tk.a, mr = Math.max(46 * Tk.a, 7);
      if (mx > -mr && mx < W + mr && my > -mr && my < H + mr) {
        ctx.save();
        ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.clip();
        ctx.beginPath(); ctx.rect(mx - 2 * mr, my - 2 * mr, 4 * mr, 4 * mr);
        ctx.arc(mx + mr * 0.46, my - mr * 0.16, mr * 0.9, 0, TAU, true);
        ctx.fillStyle = css(mixc([255, 232, 196], [255, 244, 222], n), 0.75 + 0.25 * n);
        ctx.fill('evenodd');
        ctx.restore();
      }
    }
    // long thin clouds catching the last light, drifting
    if (a < 3) {
      for (i = 0; i < CLOUDS.length; i++) {
        var c = CLOUDS[i], cx = Tc.x + (((c[0] + t * c[4] + 2600) % 9000) - 2600) * Tc.a, cy = Tc.y + c[1] * Tc.a, cw = c[2] * Tc.a, ch = Math.max(c[3] * Tc.a, 1.5);
        if (cx > W || cx + cw < 0 || cy > H || cy + ch < 0) continue;
        ctx.fillStyle = css(mixc([255, 170, 130], [70, 62, 130], n), (0.24 - 0.12 * n) * c[5]);
        rr(ctx, cx, cy, cw, ch, ch / 2); ctx.fill();
        ctx.fillStyle = css(mixc([255, 214, 170], [96, 86, 160], n), (0.2 - 0.1 * n) * c[5]);
        rr(ctx, cx + cw * 0.18, cy + ch * 0.9, cw * 0.6, ch * 0.6, ch * 0.3); ctx.fill();
      }
    }
    ctx.fillStyle = css(mixc([88, 60, 122], [22, 19, 56], n)); ridge(ctx, L, Tm, yH, 250, 190, 0.0015, 1.2);
    ctx.fillStyle = css(mixc([52, 38, 92], [14, 12, 38], n)); ridge(ctx, L, Tn, yH, 110, 110, 0.0029, 4.1);
    ctx.fillStyle = css(mixc(C.ground, C.groundN, n));
    if (yH < H) ctx.fillRect(0, yH, W, H - yH);

    setT(ctx, L, T);
    var x0 = -T.x / a, x1 = (W - T.x) / a;
    ctx.fillStyle = css(mixc([40, 34, 82], [26, 22, 56], n)); ctx.fillRect(x0, GROUND, x1 - x0, 11);
    ctx.fillStyle = css(mixc([24, 20, 50], [16, 14, 36], n)); ctx.fillRect(x0, GROUND + 26, x1 - x0, 52);
    if (a > 0.2) {
      ctx.fillStyle = 'rgba(255,214,160,.3)';
      for (var dx = Math.floor(x0 / 96) * 96; dx < x1; dx += 96) ctx.fillRect(dx, GROUND + 50, 44, 3.2);
    }
    // a little traffic
    if (a > 0.1 && a < 12) {
      for (i = 0; i < CARS.length; i++) {
        var car = CARS[i], dir = car[1] > 0 ? 1 : -1;
        var carX = ((((t * car[1] + car[2]) % 7200) + 7200) % 7200) - 1500;
        if (carX < x0 - 120 || carX > x1 + 120) continue;
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.8;
        ctx.drawImage(glow, carX + dir * 34 - 38, car[0] - 34, 76, 60);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        ctx.fillStyle = css(mixc([34, 29, 74], [22, 19, 50], n)); rr(ctx, carX - 24, car[0] - 9, 48, 13, 4); ctx.fill();
        rr(ctx, carX - 13 - dir * 3, car[0] - 17, 26, 10, 4); ctx.fill();
        ctx.fillStyle = '#FFF1C4'; ctx.fillRect(carX + dir * 21 - 1.5, car[0] - 5, 3, 3.4);
        ctx.fillStyle = '#FF5C50'; ctx.fillRect(carX - dir * 23 - 1, car[0] - 5, 2, 3.4);
      }
    }
    ctx.fillStyle = css(mixc([16, 13, 34], [9, 8, 22], n));
    for (i = 0; i < SAGUARO.length; i++) if (SAGUARO[i][0] > x0 - 60 && SAGUARO[i][0] < x1 + 60) saguaro(ctx, SAGUARO[i][0], SAGUARO[i][1]);
    var intro = S.intro === undefined ? 1 : S.intro;
    for (i = 0; i < BLD.length; i++) {
      var b = BLD[i];
      if (b.x + b.w < x0 - 20 || b.x > x1 + 20) continue;
      if (intro < 1) {
        var e = clamp(intro * 1.7 - Math.abs(b.i - FOCUS.i) * 0.1), up = 1 - Math.pow(1 - e, 3);
        if (up <= 0) continue;
        ctx.save();
        ctx.beginPath(); ctx.rect(b.x - 10, GROUND - 3000, b.w + 20, 3000); ctx.clip();
        ctx.translate(0, (1 - up) * (b.h + 150));
        drawBuilding(ctx, L, T, S, t, b, officeOn);
        ctx.restore();
      } else drawBuilding(ctx, L, T, S, t, b, officeOn);
    }
    for (i = 0; i < LAMPS.length; i++) {
      var lx = LAMPS[i];
      if (lx < x0 - 80 || lx > x1 + 80) continue;
      ctx.fillStyle = css(mixc([14, 12, 32], [9, 8, 22], n));
      ctx.fillRect(lx - 1.6, GROUND - 66, 3.2, 70); ctx.fillRect(lx - 1.6, GROUND - 68, 16, 3);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (0.55 + 0.35 * n) * smooth(0.75, 1, intro);
      ctx.drawImage(glow, lx - 22, GROUND - 98, 70, 70);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.fillStyle = '#FFE9B8'; ctx.fillRect(lx + 8, GROUND - 65, 9, 3);
    }
  }

  // ------------------------------------------------------------------ draw: office
  function person(ctx, x, y, k, col) { // seated, seen from behind; (x,y) is the top of the head
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y + 44 * k, 43 * k, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 4 * k, y + 4 * k, 17 * k, 0, TAU); ctx.fill();
    ctx.fillRect(x - 13 * k, y + 78 * k, 26 * k, 30 * k);
    ctx.beginPath();
    ctx.moveTo(x - 86 * k, y + 330 * k);
    ctx.lineTo(x - 86 * k, y + 188 * k);
    ctx.quadraticCurveTo(x - 86 * k, y + 110 * k, x - 30 * k, y + 102 * k);
    ctx.lineTo(x + 30 * k, y + 102 * k);
    ctx.quadraticCurveTo(x + 86 * k, y + 110 * k, x + 86 * k, y + 188 * k);
    ctx.lineTo(x + 86 * k, y + 330 * k);
    ctx.closePath(); ctx.fill();
  }

  function drawOffice(ctx, L, T, S, t, px) {
    var A = S.adopt, SE = S.session, i, g;
    setT(ctx, L, T);
    g = ctx.createLinearGradient(0, 0, 0, 650);
    g.addColorStop(0, css(mixc([166, 102, 58], [226, 170, 92], A * 0.7)));
    g.addColorStop(1, css(mixc([216, 158, 98], [255, 220, 146], A * 0.7)));
    ctx.fillStyle = g; ctx.fillRect(0, 0, OW, OH);
    g = ctx.createRadialGradient(360, 30, 10, 360, 30, 600);
    g.addColorStop(0, 'rgba(255,234,176,.62)'); g.addColorStop(1, 'rgba(255,234,176,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, OW, 660);
    ctx.fillStyle = '#FFF3CF'; rr(ctx, 215, -4, 290, 16, 7); ctx.fill();
    ctx.fillStyle = '#39213A'; ctx.fillRect(0, 655, OW, OH - 655);
    ctx.fillStyle = '#6E4038'; ctx.fillRect(0, 644, OW, 11);
    ctx.fillStyle = 'rgba(255,220,150,.07)'; ctx.fillRect(120, 655, 480, OH - 655);

    if (px > 100) {
      // a stacking plan on the wall: the reader's own kind of drawing
      ctx.fillStyle = '#39213A'; rr(ctx, 50, 132, 126, 164, 4); ctx.fill();
      ctx.fillStyle = '#F7EBD6'; ctx.fillRect(58, 140, 110, 148);
      var bars = ['#7B4572', '#DB8561', '#33275D', '#C9A45C', '#7B4572', '#33275D', '#DB8561'];
      for (i = 0; i < 7; i++) {
        ctx.fillStyle = bars[i]; ctx.fillRect(68, 152 + i * 18, 46 + hash(i, 8) * 40, 12);
        ctx.fillStyle = '#CDBFA6'; ctx.fillRect(68 + 50 + hash(i, 8) * 40, 152 + i * 18, 36 - hash(i, 8) * 30, 12);
      }
      // shelf with binders and a plant
      ctx.fillStyle = '#6E4038'; ctx.fillRect(452, 196, 236, 10);
      var bc = ['#33275D', '#F0DFC4', '#9C4A4A', '#2F5D62', '#F0DFC4', '#33275D', '#C9A45C'];
      var bx = 462;
      for (i = 0; i < 7; i++) {
        var bw2 = 17 + hash(i, 6) * 9, bh2 = 58 + hash(i, 7) * 26;
        ctx.fillStyle = bc[i]; ctx.fillRect(bx, 196 - bh2, bw2, bh2);
        ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.fillRect(bx + bw2 * 0.25, 196 - bh2 + 10, bw2 * 0.5, 12);
        bx += bw2 + 2;
      }
      ctx.fillStyle = '#3F7C5B';
      ctx.beginPath(); ctx.ellipse(650, 150, 13, 30, -0.35, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(668, 156, 12, 26, 0.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(659, 142, 9, 30, 0.05, 0, TAU); ctx.fill();
      ctx.fillStyle = '#9C4A4A'; ctx.fillRect(644, 172, 30, 24);
    }

    // a second person, there for the working session
    if (SE > 0.01) {
      ctx.save();
      ctx.translate((1 - SE) * (1 - SE) * 230, 0);
      ctx.fillStyle = '#3A2F6E';
      ctx.beginPath(); ctx.arc(612, 318, 36, 0, TAU); ctx.fill();
      ctx.fillRect(601, 348, 22, 22);
      ctx.beginPath();
      ctx.moveTo(564, 560); ctx.lineTo(568, 404); ctx.quadraticCurveTo(572, 364, 612, 362);
      ctx.quadraticCurveTo(652, 364, 656, 404); ctx.lineTo(662, 560); ctx.closePath(); ctx.fill();
      ctx.fillRect(578, 556, 30, 100); ctx.fillRect(616, 556, 30, 100);
      ctx.strokeStyle = '#3A2F6E'; ctx.lineWidth = 17; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(580, 404); ctx.lineTo(558, 446); ctx.lineTo(536, 424); ctx.stroke();
      ctx.restore();
    }

    // desk
    ctx.fillStyle = '#F0D9B5'; ctx.fillRect(96, 520, 610, 18);
    ctx.fillStyle = '#B5855A'; ctx.fillRect(96, 538, 610, 16);
    ctx.fillStyle = '#9A6E48'; ctx.fillRect(122, 554, 112, 92); ctx.fillRect(668, 554, 20, 92);
    ctx.fillStyle = '#B5855A'; ctx.fillRect(132, 564, 92, 34); ctx.fillRect(132, 604, 92, 34);

    // lamp
    g = ctx.createLinearGradient(0, 400, 0, 520);
    g.addColorStop(0, 'rgba(255,236,170,.5)'); g.addColorStop(1, 'rgba(255,236,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(138, 404); ctx.lineTo(184, 404); ctx.lineTo(262, 520); ctx.lineTo(96, 520); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#241F4A'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(112, 514); ctx.lineTo(112, 428); ctx.lineTo(150, 388); ctx.stroke();
    ctx.fillStyle = '#241F4A'; rr(ctx, 92, 512, 42, 8, 3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(144, 374); ctx.lineTo(178, 380); ctx.lineTo(190, 406); ctx.lineTo(132, 406); ctx.closePath(); ctx.fill();

    // monitor
    ctx.fillStyle = '#15122C';
    ctx.fillRect(405, 470, 20, 42); rr(ctx, 368, 510, 94, 10, 4); ctx.fill();
    rr(ctx, 290, 306, 250, 164, 9); ctx.fill();
    ctx.fillStyle = css(mixc([243, 238, 228], [255, 243, 207], A)); ctx.fillRect(SCR.x, SCR.y, SCR.w, SCR.h);
    ctx.fillStyle = '#2A2550'; rr(ctx, 322, 511, 150, 9, 3); ctx.fill();
    if (A > 0.01) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = A * 0.55;
      ctx.drawImage(glow, 150, 190, 530, 400);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }

    // the stack: sixteen sheets before, three after
    var sheets = Math.round(lerp(16, 3, A));
    for (i = 0; i < sheets; i++) {
      var jx = (hash(i, 2.7) - 0.5) * 9;
      ctx.fillStyle = '#FBF3E4'; ctx.fillRect(566 + jx, 520 - 5 * (i + 1), 76, 4.2);
      ctx.fillStyle = '#D5C2A0'; ctx.fillRect(566 + jx, 520 - 5 * (i + 1) + 4.2, 76, 0.8);
    }
    if (px > 100 && A < 0.99) {
      ctx.save();
      ctx.globalAlpha = 1 - A;
      ctx.translate(608, 396); ctx.rotate(-0.07);
      ctx.fillStyle = 'rgba(60,30,20,.18)'; ctx.fillRect(-33, -25, 70, 58);
      ctx.fillStyle = '#FFE79C'; ctx.fillRect(-36, -29, 70, 58);
      ctx.restore();
      wtext(ctx, L, T, '50×', 607, 389, 25, '500', F_MONO, '#241F4A', 'center', 1 - A);
      wtext(ctx, L, T, 'a week', 607, 411, 11.5, '500', F_MONO, '#241F4A', 'center', 1 - A);
    }

    // job aid, pinned up once the build ships
    if (SE > 0.01 && px > 100) {
      ctx.save();
      ctx.globalAlpha = SE; ctx.translate(244, 236 - (1 - SE) * 26); ctx.rotate(0.035);
      ctx.fillStyle = 'rgba(60,30,20,.2)'; ctx.fillRect(-42, -54, 90, 118);
      ctx.fillStyle = '#FFF8E7'; ctx.fillRect(-45, -58, 90, 118);
      ctx.fillStyle = '#F2B84B'; ctx.fillRect(-45, -58, 90, 24);
      for (i = 0; i < 4; i++) {
        ctx.strokeStyle = '#8A7A5E'; ctx.lineWidth = 1.6; ctx.strokeRect(-35, -22 + i * 19, 10, 10);
        ctx.strokeStyle = '#B67A12'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(-33, -17 + i * 19); ctx.lineTo(-30.5, -14 + i * 19); ctx.lineTo(-25.5, -21 + i * 19); ctx.stroke();
        ctx.fillStyle = '#CDBFA6'; ctx.fillRect(-18, -19.5 + i * 19, 40 + hash(i, 3.1) * 14, 5);
      }
      ctx.fillStyle = '#C0483F'; ctx.beginPath(); ctx.arc(0, -60, 3.6, 0, TAU); ctx.fill();
      ctx.restore();
      wtext(ctx, L, T, 'JOB AID', 245.5, 190.5 - (1 - SE) * 26, 11, '500', F_MONO, '#241F4A', 'center', SE);
    }

    // the person doing it
    ctx.fillStyle = '#241F4A'; rr(ctx, 138, 596, 178, 190, 26); ctx.fill();
    var bob = Math.sin(t * 1.3) * 1.4 + Math.sin(t * 0.37) * 0.8;
    person(ctx, 228 + bob * 0.5, 414 + Math.abs(bob) * 0.5, 1, '#16132E');
    ctx.strokeStyle = 'rgba(255,236,196,' + (0.34 + 0.3 * A).toFixed(3) + ')'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(228 + bob * 0.5, 458 + Math.abs(bob) * 0.5, 42, -1.1, 0.9); ctx.stroke();
  }

  // ------------------------------------------------------------------ draw: screen
  var S_COLS = [840, 1190], S_ROWS = [300, 410, 520, 630];

  function drawScreen(ctx, L, T, S, t, px) {
    var A = S.adopt, i, x, y;
    setT(ctx, L, T);
    ctx.fillStyle = css(mixc([243, 238, 228], [250, 243, 224], A)); ctx.fillRect(0, 0, SW, SH);
    ctx.fillStyle = '#E2D9C8'; ctx.fillRect(0, 0, SW, 72);
    ctx.fillStyle = '#C9BBA3';
    for (i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(42 + i * 34, 36, 10, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(70,50,30,.10)'; rr(ctx, 84, 124, 650, 838, 8); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; rr(ctx, 70, 110, 650, 838, 8); ctx.fill();
    ctx.fillStyle = '#FBF8F2'; rr(ctx, 800, 110, 730, 838, 12); ctx.fill();
    ctx.strokeStyle = '#DDD3C0'; ctx.lineWidth = 2; ctx.stroke();

    if (px > 70) {
      // the document being read
      ctx.fillStyle = '#241F4A'; ctx.fillRect(120, 162, 330, 24);
      ctx.fillStyle = '#B8AC98'; ctx.fillRect(120, 204, 220, 10); ctx.fillRect(120, 224, 180, 10);
      ctx.fillStyle = '#DAD0BE';
      var lw = [550, 540, 558, 500, 380];
      for (i = 0; i < 5; i++) ctx.fillRect(120, 272 + i * 22, lw[i], 9);
      ctx.fillStyle = '#EDE5D6'; ctx.fillRect(120, 404, 550, 36);
      var row = Math.floor(t / 1.7) % 8, run = Math.floor(t * 3.4) % 13;
      for (i = 0; i < 8; i++) {
        y = 470 + i * 56;
        ctx.fillStyle = '#E8DFCE'; ctx.fillRect(120, y + 22, 550, 2);
        if (A < 0.99 && i === row) { ctx.fillStyle = css([255, 217, 138], 1 - A); ctx.fillRect(532, y - 14, 142, 30); }
        ctx.fillStyle = '#C9BEAA';
        ctx.fillRect(132, y - 6, 70 + hash(i, 1.3) * 50, 12);
        ctx.fillRect(272, y - 6, 60 + hash(i, 2.3) * 60, 12);
        ctx.fillRect(412, y - 6, 50 + hash(i, 3.3) * 50, 12);
        ctx.fillStyle = '#241F4A'; ctx.fillRect(544, y - 6, 60 + hash(i, 4.3) * 56, 12);
        if (A > 0.01 && i === run) { ctx.fillStyle = css([255, 217, 138], A * 0.8); ctx.fillRect(120, y - 16, 550, 34); }
        if (A > 0.01 && i < run) tick(ctx, 692, y, 11, A);
      }
      // the form it gets retyped into
      ctx.fillStyle = '#241F4A'; ctx.fillRect(840, 160, 260, 22);
      ctx.fillStyle = '#B8AC98'; ctx.fillRect(840, 196, 380, 10);
      for (i = 0; i < 8; i++) {
        x = S_COLS[i % 2]; y = S_ROWS[i >> 1];
        ctx.fillStyle = '#B8AC98'; ctx.fillRect(x, y - 22, 110 + hash(i, 6.1) * 50, 9);
        if (i === 4) continue;
        ctx.fillStyle = '#FFFFFF'; rr(ctx, x, y, 300, 84, 9); ctx.fill();
        ctx.strokeStyle = '#CFC4AE'; ctx.lineWidth = 2; ctx.stroke();
        var filled = i < 4 ? 1 : A;
        if (filled > 0.01) {
          ctx.fillStyle = css(C.plum, filled); ctx.fillRect(x + 22, y + 34, 110 + hash(i, 7.7) * 90, 16);
          if (A > 0.01) tick(ctx, x + 262, y + 42, 13, A);
        }
      }
      ctx.fillStyle = '#241F4A'; rr(ctx, 1190, 776, 300, 66, 10); ctx.fill();
      ctx.fillStyle = '#FBF3E4'; ctx.fillRect(1290, 803, 100, 12);
    }
    // the field the next world lives in
    ctx.fillStyle = '#14112B'; rr(ctx, FLD.x - 5, FLD.y - 5, FLD.w + 10, FLD.h + 10, 12); ctx.fill();
    ctx.strokeStyle = css(C.gold); ctx.lineWidth = 4; ctx.stroke();

    if (px > 70) {
      // status chip
      if (A < 0.99) { ctx.fillStyle = css(C.plum, 1 - A); rr(ctx, 1100, 17, 440, 38, 19); ctx.fill(); }
      if (A > 0.01) { ctx.fillStyle = css([242, 184, 75], A); rr(ctx, 1100, 17, 440, 38, 19); ctx.fill(); }
      wtext(ctx, L, T, 'BY HAND · 50× A WEEK', 1320, 37, 19, '500', F_MONO, '#FBF3E4', 'center', 1 - A);
      wtext(ctx, L, T, 'RUNNING · REVIEW GATE ON', 1320, 37, 19, '500', F_MONO, '#241F4A', 'center', A);
      // the pointer, going back and forth, back and forth
      if (A < 0.99) {
        var k = 0.5 - 0.5 * Math.cos(t * 1.85);
        var cx = lerp(600, FLD.x + 80, k), cy = lerp(470 + row * 56 + 10, FLD.y + 60, k) - Math.sin(k * PI) * 60;
        ctx.save(); ctx.globalAlpha = 1 - A; ctx.translate(cx, cy); ctx.scale(2.6, 2.6);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 17); ctx.lineTo(4.6, 13); ctx.lineTo(7.6, 20); ctx.lineTo(10.4, 18.8); ctx.lineTo(7.4, 12); ctx.lineTo(13, 12); ctx.closePath();
        ctx.fillStyle = '#16132E'; ctx.fill(); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.restore();
      }
    }
  }
  function tick(ctx, x, y, r, al) {
    ctx.fillStyle = css([242, 184, 75], al); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = css(C.plum, al); ctx.lineWidth = r * 0.24; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x - r * 0.42, y + r * 0.02); ctx.lineTo(x - r * 0.1, y + r * 0.36); ctx.lineTo(x + r * 0.46, y - r * 0.32); ctx.stroke();
  }

  // ------------------------------------------------------------------ draw: workflow
  var NODES = [
    { u: 0.2, v: 0.13, label: 'DOCUMENTS IN', sub: ['as they arrive'] },
    { u: 0.8, v: 0.38, label: 'AGENT WORKFLOW', sub: ['Claude-driven'] },
    { u: 0.2, v: 0.63, label: 'REVIEW GATE', sub: ['a person approves'] },
    { u: 0.8, v: 0.88, label: 'YOUR SYSTEMS', sub: ['the tools your team', 'already runs'] }
  ];
  function bez(p0, p1, p2, p3, q) {
    var m = 1 - q;
    return [m * m * m * p0[0] + 3 * m * m * q * p1[0] + 3 * m * q * q * p2[0] + q * q * q * p3[0],
            m * m * m * p0[1] + 3 * m * m * q * p1[1] + 3 * m * q * q * p2[1] + q * q * q * p3[1]];
  }

  function drawPipeline(ctx, L, T, S, t, px) {
    var pb = S.pb, i, k, n, q;
    setT(ctx, L, T);
    ctx.fillStyle = '#14112B'; ctx.fillRect(0, 0, PWD, PHT);
    // before the build, seen from the screen: one more field being typed by hand
    var typing = (1 - smooth(0, 0.14, pb)) * (1 - smooth(L.w * 0.45, L.w * 1.2, px));
    if (typing > 0.01) {
      var count = Math.floor(t * 3.2) % 10;
      ctx.globalAlpha = typing;
      ctx.fillStyle = '#E9E2F2';
      for (i = 0; i < count; i++) ctx.fillRect(110 + i * 112, 135, 84, 150);
      if (Math.sin(t * 6) > -0.2) { ctx.fillStyle = css(C.gold); ctx.fillRect(110 + count * 112, 105, 22, 210); }
      ctx.globalAlpha = 1;
    }
    if (px < 60) return;
    var bw = L.pipe.w, bh = L.pipe.h, side = Math.min(bw, bh), x0 = L.pipe.cx - bw / 2, y0 = L.pipe.cy - bh / 2;
    function P(u, v) { return [x0 + u * bw, y0 + v * bh]; }
    // dot grid
    if (T.a > 0.35) {
      var step = side / 16, gx0 = Math.max(0, -T.x / T.a), gx1 = Math.min(PWD, (L.w - T.x) / T.a), gy0 = Math.max(0, -T.y / T.a), gy1 = Math.min(PHT, (L.h - T.y) / T.a);
      ctx.fillStyle = 'rgba(140,128,214,.2)';
      var ds = Math.max(1.1 / T.a, side * 0.004);
      for (var gx = PWD / 2 + Math.ceil((gx0 - PWD / 2) / step) * step; gx < gx1; gx += step)
        for (var gy = PHT / 2 + Math.ceil((gy0 - PHT / 2) / step) * step; gy < gy1; gy += step) ctx.fillRect(gx - ds / 2, gy - ds / 2, ds, ds);
    }
    if (pb <= 0.001) return;

    var R = side * 0.09, lw = Math.max(side * 0.0065, 1.2 / T.a);
    var flow = smooth(0.92, 1, pb);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // edges, then tokens riding them
    for (k = 0; k < 3; k++) {
      var ep = smooth(k * 0.24 + 0.14, k * 0.24 + 0.36, pb);
      if (ep <= 0) continue;
      var a0 = P(NODES[k].u, NODES[k].v), a3 = P(NODES[k + 1].u, NODES[k + 1].v);
      var p0 = [a0[0], a0[1] + R], p3 = [a3[0], a3[1] - R], dy = p3[1] - p0[1];
      var p1 = [p0[0], p0[1] + dy * 0.62], p2 = [p3[0], p3[1] - dy * 0.62];
      ctx.strokeStyle = 'rgba(255,215,121,.85)'; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]);
      for (i = 1; i <= 36; i++) {
        q = bez(p0, p1, p2, p3, Math.min(i / 36, ep)); ctx.lineTo(q[0], q[1]);
        if (i / 36 >= ep) break;
      }
      ctx.stroke();
      if (flow > 0.01) for (i = 0; i < 3; i++) {
        var u = (t * 0.2 + i / 3 + k * 0.17) % 1, pt = bez(p0, p1, p2, p3, u), al = flow * Math.sqrt(Math.sin(u * PI));
        ctx.globalAlpha = al;
        if (k === 0) { // a page
          ctx.fillStyle = '#F7F0E5'; ctx.fillRect(pt[0] - side * 0.017, pt[1] - side * 0.023, side * 0.034, side * 0.046);
          ctx.fillStyle = '#14112B'; ctx.fillRect(pt[0] - side * 0.01, pt[1] - side * 0.011, side * 0.02, side * 0.005); ctx.fillRect(pt[0] - side * 0.01, pt[1] + side * 0.001, side * 0.014, side * 0.005);
        } else if (k === 1) { // the values pulled out of it
          ctx.fillStyle = '#F7F0E5';
          for (var d = -1; d <= 1; d++) { ctx.beginPath(); ctx.arc(pt[0] + d * side * 0.02, pt[1], side * 0.0075, 0, TAU); ctx.fill(); }
        } else { // approved
          ctx.globalAlpha = 1; tick(ctx, pt[0], pt[1], side * 0.02, al);
        }
        ctx.globalAlpha = 1;
      }
    }
    // nodes
    for (k = 0; k < 4; k++) {
      var ap = smooth(k * 0.24, k * 0.24 + 0.16, pb);
      if (ap <= 0) continue;
      var nd = NODES[k], c = P(nd.u, nd.v), r = R * (0.6 + 0.4 * ap);
      ctx.globalAlpha = ap;
      ctx.fillStyle = '#211C4B'; rr(ctx, c[0] - r, c[1] - r, r * 2, r * 2, r * 0.3); ctx.fill();
      ctx.strokeStyle = css(C.gold); ctx.lineWidth = lw; ctx.stroke();
      ctx.strokeStyle = css(C.goldHot); ctx.fillStyle = css(C.goldHot); ctx.lineWidth = lw * 0.9;
      if (k === 0) {
        for (i = 2; i >= 0; i--) {
          ctx.fillStyle = '#211C4B'; rr(ctx, c[0] - r * 0.42 + i * r * 0.14, c[1] - r * 0.52 - i * r * 0.12 + r * 0.12, r * 0.7, r * 0.9, r * 0.06); ctx.fill(); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(c[0] - r * 0.26, c[1] - r * 0.12); ctx.lineTo(c[0] + r * 0.12, c[1] - r * 0.12); ctx.moveTo(c[0] - r * 0.26, c[1] + r * 0.12); ctx.lineTo(c[0] + r * 0.02, c[1] + r * 0.12); ctx.stroke();
      } else if (k === 1) {
        var pr = r * (0.5 + 0.06 * Math.sin(t * 2.6));
        ctx.beginPath();
        for (i = 0; i < 8; i++) { var ang = i * PI / 4 - PI / 2, rad = i % 2 ? pr * 0.34 : pr; ctx[i ? 'lineTo' : 'moveTo'](c[0] + Math.cos(ang) * rad, c[1] + Math.sin(ang) * rad); }
        ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(c[0] + r * 0.52, c[1] - r * 0.5, r * 0.09, 0, TAU); ctx.fill();
      } else if (k === 2) {
        ctx.beginPath(); ctx.arc(c[0] - r * 0.08, c[1] - r * 0.24, r * 0.24, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(c[0] - r * 0.56, c[1] + r * 0.56); ctx.quadraticCurveTo(c[0] - r * 0.56, c[1] + r * 0.1, c[0] - r * 0.08, c[1] + r * 0.1); ctx.quadraticCurveTo(c[0] + r * 0.4, c[1] + r * 0.1, c[0] + r * 0.4, c[1] + r * 0.56); ctx.stroke();
        tick(ctx, c[0] + r * 0.5, c[1] - r * 0.46, r * 0.26, ap);
      } else {
        var cells = flow > 0.01 ? Math.floor(t * 1.5) % 10 : 0, cs = r * 0.34;
        for (i = 0; i < 9; i++) {
          var gxx = c[0] - cs * 1.62 + (i % 3) * cs * 1.12, gyy = c[1] - cs * 1.62 + Math.floor(i / 3) * cs * 1.12;
          if (i < cells) { ctx.fillStyle = css(C.gold); ctx.fillRect(gxx, gyy, cs, cs); }
          ctx.strokeRect(gxx, gyy, cs, cs);
        }
      }
      ctx.globalAlpha = 1;
      // labels sit beside the node, toward the middle
      if (side * T.a < 190) continue;
      var left = nd.u < 0.5, lx = T.x + (c[0] + (left ? 1 : -1) * (R + side * 0.04)) * T.a;
      var fs = clamp(side * 0.034 * T.a, 9.5, 17), gap = fs * 1.42, sub = nd.sub;
      var ly = T.y + c[1] * T.a - sub.length * gap / 2;
      ctx.save(); setScreen(ctx, L);
      ctx.globalAlpha = ap; ctx.textAlign = left ? 'left' : 'right'; ctx.textBaseline = 'middle';
      ctx.font = '500 ' + fs.toFixed(2) + 'px ' + F_MONO; ctx.fillStyle = '#FFE9B0';
      ctx.fillText(nd.label, lx, ly);
      ctx.font = '400 ' + (fs * 0.96).toFixed(2) + 'px ' + F_BODY; ctx.fillStyle = '#B4ADCB';
      for (i = 0; i < sub.length; i++) ctx.fillText(sub[i], lx, ly + gap * (i + 1));
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ draw: overlays
  function brackets(ctx, x, y, w, h, len, al) {
    ctx.strokeStyle = 'rgba(255,246,222,' + al.toFixed(3) + ')'; ctx.lineWidth = 1.5; ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x, y + len); ctx.lineTo(x, y); ctx.lineTo(x + len, y);
    ctx.moveTo(x + w - len, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + len);
    ctx.moveTo(x + w, y + h - len); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - len, y + h);
    ctx.moveTo(x + len, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - len);
    ctx.stroke();
  }
  function tag(ctx, L, str, x, y, al, align, size) {
    size = size || (L.phone ? 9.5 : 10.5);
    ctx.font = '500 ' + size + 'px ' + F_MONO;
    var tw = ctx.measureText(str).width + size * 0.12 * str.length, pw = tw + 14, ph = size + 10;
    var px = align === 'left' ? x : align === 'right' ? x - pw : x - pw / 2;
    px = clamp(px, 6, L.w - pw - 6);
    ctx.globalAlpha = al;
    ctx.fillStyle = 'rgba(12,10,30,.82)'; rr(ctx, px, y - ph / 2, pw, ph, 3); ctx.fill();
    ctx.fillStyle = '#FFE9B0'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = (size * 0.12).toFixed(2) + 'px';
    ctx.fillText(str, px + 7, y + 0.5);
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
    ctx.globalAlpha = 1;
    return px + pw / 2;
  }

  function drawOverlay(ctx, L, T, S, t) {
    var a = T.a, i, x, y, w, h;
    setScreen(ctx, L);
    function sx(v) { return T.x + v * a; }
    function sy(v) { return T.y + v * a; }
    // the two windows the first beat is about
    var ret = S.ret * smooth(62, 96, PO.w * a);   // wait until the two windows are big enough to label
    if (ret > 0.01) {
      var pw = winAt(FOCUS, TF, TC + 1), m = Math.max(5, PO.w * a * 0.07);
      brackets(ctx, sx(PO.x) - m, sy(PO.y) - m, PO.w * a + 2 * m, PO.h * a + 2 * m, Math.max(8, PO.w * a * 0.16), ret);
      y = sy(PO.y + PO.h + 5.2) + 15;
      tag(ctx, L, 'BY HAND, 50× A WEEK', sx(PO.x + PO.w / 2), y, ret, 'center');
      // side by side when the windows are wide enough apart, otherwise one under the other
      var apart = (pw.x - PO.x) * a, drop = apart < (L.phone ? 152 : 172) ? (L.phone ? 24 : 26) : 0;
      tag(ctx, L, 'AI PILOT, SHELVED', sx(pw.x + pw.w / 2), y + drop, ret, 'center');
    }
    // the diagnosis lands on the task
    if (S.diag > 0.01) {
      var r = o2d({ x: 282, y: 296, w: 372, h: 236 }), grow = (1 - S.diag) * 26;
      brackets(ctx, sx(r.x) - grow, sy(r.y) - grow, r.w * a + 2 * grow, r.h * a + 2 * grow, 16, S.diag);
      tag(ctx, L, 'THE TASK', sx(r.x) - grow + 4, sy(r.y) - grow - 14, S.diag, 'left');
    }
    // receipts, named where they light up
    for (var id in RECEIPT) {
      var al = S.tag[id];
      if (al > 0.01) {
        var b = BLD[id], bx = sx(b.x + b.w / 2), by = sy(b.top - (b.floors >= 16 ? 128 : 30));
        var ty = id === '5' ? sy(FOCUS.top - 46) : by - 24;
        ctx.strokeStyle = 'rgba(255,233,176,' + (al * 0.8).toFixed(3) + ')'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bx, by + 4); ctx.lineTo(bx, ty + 8); ctx.stroke();
        if (id === '5') tag(ctx, L, RECEIPT[id], Math.max(bx + 14, sx(BLD[6].x) - 6), ty - (1 - al) * 8, al, 'right');
        else tag(ctx, L, RECEIPT[id], bx - (id === '7' ? 8 : 0), ty - (1 - al) * 8, al, id === '7' ? 'left' : 'center');
      }
    }
    // the diagnostic: a survey of one building
    if (S.survey > 0.01) {
      var e = ENG, top = e.top + PARAPET, bot = GROUND - LOBBY, al2 = S.survey;
      x = sx(e.x) - 12; y = sy(top); h = (bot - top) * a; w = e.w * a;
      ctx.strokeStyle = 'rgba(255,246,222,' + (al2 * 0.7).toFixed(3) + ')'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h);
      for (i = 0; i <= e.floors; i++) { ctx.moveTo(x - 5, y + i * FH * a); ctx.lineTo(x, y + i * FH * a); }
      ctx.stroke();
      var scanY = y + h * S.scan;
      if (S.scan < 0.995) {
        var g = ctx.createLinearGradient(0, scanY - 46, 0, scanY);
        g.addColorStop(0, 'rgba(255,233,176,0)'); g.addColorStop(1, 'rgba(255,233,176,' + (al2 * 0.22).toFixed(3) + ')');
        ctx.fillStyle = g; ctx.fillRect(x + 12, scanY - 46, w, 46);
        ctx.strokeStyle = 'rgba(255,233,176,' + (al2 * 0.95).toFixed(3) + ')'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x - 6, scanY); ctx.lineTo(x + 12 + w + 8, scanY); ctx.stroke();
      }
      for (i = 0; i < ENG_FLAGS.length; i++) {
        var fw = winAt(e, ENG_FLAGS[i][0], ENG_FLAGS[i][1]);
        var seen = smooth(0, 0.06, S.scan - (fw.y + fw.h - top) / (bot - top)) * al2;
        if (seen < 0.01) continue;
        var m2 = Math.max(3.5, fw.w * a * 0.1);
        brackets(ctx, sx(fw.x) - m2, sy(fw.y) - m2, fw.w * a + 2 * m2, fw.h * a + 2 * m2, Math.max(5, fw.w * a * 0.2), seen);
        var bs = clamp(fw.w * a * 0.36, 11, 18);
        ctx.globalAlpha = seen; ctx.fillStyle = '#FFE9B0';
        ctx.beginPath(); ctx.arc(sx(fw.x + fw.w) + m2, sy(fw.y) - m2, bs / 2, 0, TAU); ctx.fill();
        ctx.fillStyle = '#16132E'; ctx.font = '500 ' + (bs * 0.62).toFixed(1) + 'px ' + F_MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), sx(fw.x + fw.w) + m2, sy(fw.y) - m2 + 0.5);
        ctx.globalAlpha = 1;
      }
    }
  }

  // ------------------------------------------------------------------ the frame
  function covers(L, r) { return r.x <= 0 && r.y <= 0 && r.x + r.w >= L.w && r.y + r.h >= L.h; }
  function onscreen(L, r) { return r.x < L.w && r.y < L.h && r.x + r.w > 0 && r.y + r.h > 0; }
  function clipRect(ctx, L, r) { setScreen(ctx, L); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); }

  function render(ctx, L, cam, S, t) {
    var TD = { a: cam.s, x: L.w / 2 - cam.cx * cam.s, y: L.h / 2 - cam.cy * cam.s };
    var TO = { a: TD.a * kO, x: TD.x + PO.x * TD.a, y: TD.y + PO.y * TD.a };
    var TS = { a: TO.a * kS, x: TO.x + SCR.x * TO.a, y: TO.y + SCR.y * TO.a };
    var TP = { a: TS.a * kP, x: TS.x + FLD.x * TS.a, y: TS.y + FLD.y * TS.a };
    var oR = { x: TO.x, y: TO.y, w: OW * TO.a, h: OH * TO.a };
    var sR = { x: TS.x, y: TS.y, w: SW * TS.a, h: SH * TS.a };
    var pR = { x: TP.x, y: TP.y, w: PWD * TP.a, h: PHT * TP.a };
    var inO = covers(L, oR), inS = covers(L, sR), inP = covers(L, pR);
    var oOn = oR.w > 22 && onscreen(L, oR), sOn = sR.w > 16 && onscreen(L, sR), pOn = pR.w > 10 && onscreen(L, pR);

    if (!inO) drawDistrict(ctx, L, TD, S, t, oOn);
    if (oOn && !inS) {
      ctx.save(); clipRect(ctx, L, oR);
      drawOffice(ctx, L, TO, S, t, oR.w);
      var refl = 0.26 * clamp(1 - (oR.w - 60) / 280);
      if (refl > 0.01) {
        setScreen(ctx, L);
        var g = ctx.createLinearGradient(oR.x, oR.y, oR.x + oR.w, oR.y + oR.h);
        g.addColorStop(0, 'rgba(150,138,224,' + refl.toFixed(3) + ')'); g.addColorStop(0.5, 'rgba(150,138,224,0)');
        ctx.fillStyle = g; ctx.fillRect(oR.x, oR.y, oR.w, oR.h);
      }
      ctx.restore();
    }
    if (sOn && !inP) { ctx.save(); clipRect(ctx, L, sR); drawScreen(ctx, L, TS, S, t, sR.w); ctx.restore(); }
    if (pOn) { ctx.save(); clipRect(ctx, L, pR); drawPipeline(ctx, L, TP, S, t, pR.w); ctx.restore(); }
    drawOverlay(ctx, L, TD, S, t);
    setScreen(ctx, L);
    return { oW: oR.w, sW: sR.w, pW: pR.w };
  }

  // ------------------------------------------------------------------ still mode (reduced motion)
  var STILL_T = { hero: 0, findA: 0.93, findB: 0.55, buildA: 0.12, buildB: 1, stickA: 0.9, stickB: 1, rec1: 0.6, rec2: 0.6, rec3: 0.6, eng1: 0.5, eng2: 0.5, eng3: 0.15, contact: 1 };

  function runStills() {
    var beats = [].slice.call(document.querySelectorAll('[data-beat]'));
    var figs = beats.map(function (el) {
      var fig = document.createElement('div');
      fig.className = 'still'; fig.setAttribute('aria-hidden', 'true');
      var c = document.createElement('canvas');
      fig.appendChild(c);
      // the opening leads with its headline; everywhere else the picture comes first
      if (el.getAttribute('data-beat') === 'hero') { fig.className += ' after'; el.appendChild(fig); }
      else el.insertBefore(fig, el.firstChild);
      return c;
    });
    function paint() {
      figs.forEach(function (c, n) {
        var key = beats[n].getAttribute('data-beat'), i = BEATS.indexOf(key);
        var w = c.clientWidth || 640, h = c.clientHeight || 480, dpr = Math.min(window.devicePixelRatio || 1, 2);
        c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
        var L = { w: w, h: h, dpr: dpr, phone: w < 520, stage: { x0: 0.05, x1: 0.95, y0: 0.06, y1: 0.94 }, hero: { x0: 0, x1: 1, y0: 0.3, y1: 0.97 } };
        var views = buildViews(L); L.a0 = views[0][0].s;
        var cam = between(views[i][0], views[i][1], STILL_T[key]);
        var S = stateAt(i === 0 ? 0 : i + 0.45);
        S.diag = key === 'findB' ? 1 : S.diag;
        render(c.getContext('2d'), L, cam, S, 3.7);
      });
    }
    paint();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(paint);
    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(paint, 180); });
  }

  // ------------------------------------------------------------------ live mode
  function runLive() {
    var canvas = document.getElementById('scene'), ctx = canvas.getContext('2d');
    var scrim = document.querySelector('.scrim'), magEl = document.getElementById('mag');
    var levelEls = [].slice.call(document.querySelectorAll('#levels li')), cue = document.querySelector('.cue');
    var phoneMQ = window.matchMedia('(max-width: 820px)');
    var beatEls = BEATS.map(function (k) { return document.querySelector('[data-beat="' + k + '"]'); });
    var cards = beatEls.map(function (el) { return el.querySelector('.card'); });
    var L = null, views = null, dStart = [], dEnd = [], heroS = 1;
    var coarse = window.matchMedia('(pointer: coarse)').matches;

    function measure() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      dpr = Math.min(dpr, Math.sqrt(4.6e6 / (w * h)));
      var phone = phoneMQ.matches;
      if (!L || L.w !== w || L.h !== h || L.dpr !== dpr) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      L = {
        w: w, h: h, dpr: dpr, phone: phone,
        stage: phone ? { x0: 0.05, x1: 0.95, y0: 0.105, y1: 0.485 } : { x0: 0.465, x1: 0.975, y0: 0.12, y1: 0.9 },
        hero: phone ? { x0: 0, x1: 1, y0: 0.66, y1: 0.955 } : { x0: 0, x1: 1, y0: 0.47, y1: 0.955 }
      };
      if (phone) {
        L.stages = {};
        beatEls.forEach(function (el, i) {
          var pin = el.querySelector('.pin'), o = parseFloat(getComputedStyle(pin).top) || 0;
          var top = (o + pin.offsetHeight - cards[i].offsetHeight) / h;
          L.stages[BEATS[i]] = { x0: 0.05, x1: 0.95, y0: 0.105, y1: clamp(top - 0.06, 0.36, 0.7) };
        });
        L.stage = L.stages.buildB;
      }
      if (phone || h < 560) {   // short screens: keep the skyline under the opening text
        L.heroes = {};
        ['hero', 'contact'].forEach(function (k) {
          var i = BEATS.indexOf(k), pin = beatEls[i].querySelector('.pin');
          var bottom = (parseFloat(getComputedStyle(pin).paddingTop) + cards[i].offsetHeight) / h;
          L.heroes[k] = { x0: 0, x1: 1, y0: clamp(bottom + 0.05, 0.4, 0.72), y1: 0.955 };
        });
      }
      views = buildViews(L);
      heroS = views[0][0].s; L.a0 = heroS;
      var sy = window.scrollY || window.pageYOffset;
      dStart = []; dEnd = [];
      beatEls.forEach(function (el) {
        var pin = el.querySelector('.pin'), top = el.getBoundingClientRect().top + sy;
        var cs = getComputedStyle(el), gap = parseFloat(cs.paddingTop) || 0, o = parseFloat(getComputedStyle(pin).top) || 0;
        dStart.push(top + gap - o);
        dEnd.push(top + el.offsetHeight - pin.offsetHeight - o);
      });
      dStart[0] = 0;
    }

    function tauAt(s) {
      var n = dStart.length;
      if (s <= dStart[0]) return 0;
      for (var i = 0; i < n; i++) {
        if (s <= dEnd[i]) return i + 0.5 * clamp((s - dStart[i]) / Math.max(1, dEnd[i] - dStart[i]));
        if (i < n - 1 && s < dStart[i + 1]) return i + 0.5 + 0.5 * (s - dEnd[i]) / Math.max(1, dStart[i + 1] - dEnd[i]);
      }
      return n - 0.5;
    }

    var lastOp = [], lastScrim = -1, lastMag = '', lastLv = -1, lastCue = -1, lastPr = -1, bar = document.querySelector('.progress i');
    function chrome(s, tau, S, cam, info) {
      var n = dStart.length, i;
      for (i = 0; i < n; i++) {
        var op = 1;
        if (i > 0) { var lin = dStart[i] - dEnd[i - 1]; op = smooth(0.5, 0.93, (s - dEnd[i - 1]) / lin); }
        if (i < n - 1) { var lout = dStart[i + 1] - dEnd[i]; op = Math.min(op, 1 - smooth(0.02, 0.4, (s - dEnd[i]) / lout)); }
        op = Math.round(op * 100) / 100;
        if (lastOp[i] !== op) { cards[i].style.opacity = op; cards[i].style.pointerEvents = op < 0.05 ? 'none' : ''; lastOp[i] = op; }
      }
      var sc = Math.round(S.scrim * 100) / 100;
      if (sc !== lastScrim) { scrim.style.opacity = sc; lastScrim = sc; }
      var mag = cam.s / heroS;
      var txt = '×' + (mag < 9.95 ? (Math.round(mag * 10) / 10).toFixed(1) : Math.round(mag).toLocaleString('en-US'));
      if (txt !== lastMag) { magEl.textContent = txt; lastMag = txt; }
      var stw = (L.stage.x1 - L.stage.x0) * L.w;
      var lv = info.pW > stw * 2.2 ? 4 : info.sW > stw * 0.55 ? 3 : info.oW > stw * 0.5 ? 2 : cam.s > heroS * 1.5 ? 1 : 0;
      if (lv !== lastLv) { levelEls.forEach(function (el, k) { el.classList.toggle('on', k === lv); }); lastLv = lv; }
      var pr = Math.round(clamp(s / Math.max(1, dEnd[n - 1])) * 1000) / 1000;
      if (bar && pr !== lastPr) { bar.style.transform = 'scaleX(' + pr + ')'; lastPr = pr; }
      var cu = Math.round((1 - smooth(0.02, 0.2, tau)) * 100) / 100;
      if (cue && cu !== lastCue) { cue.style.opacity = cu; lastCue = cu; }
    }

    var ss = window.scrollY || 0, lastT = 0, lastDraw = 0, lastSS = -1, dirty = true, introT0 = null;
    // with a mouse, the scene leans a few pixels toward the pointer; the far layers lean less
    var ptr = { x: 0, y: 0, tx: 0, ty: 0 };
    if (!coarse) window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      ptr.tx = e.clientX / L.w - 0.5; ptr.ty = e.clientY / L.h - 0.5;
    }, { passive: true });
    function frame(now) {
      requestAnimationFrame(frame);
      if (document.hidden) return;
      var dt = Math.min(64, now - lastT); lastT = now;
      var target = window.scrollY || window.pageYOffset;
      var k = 1 - Math.exp(-dt / (coarse ? 55 : 95));
      ss += (target - ss) * k;
      if (Math.abs(target - ss) < 0.4) ss = target;
      var pk = 1 - Math.exp(-dt / 220), px0 = ptr.x, py0 = ptr.y;
      ptr.x += (ptr.tx - ptr.x) * pk; ptr.y += (ptr.ty - ptr.y) * pk;
      var moved = Math.abs(ss - lastSS) > 0.05 || Math.abs(ptr.x - px0) + Math.abs(ptr.y - py0) > 0.0004;
      if (!moved && !dirty && now - lastDraw < 33) return;   // idle: ambient motion at ~30fps
      lastSS = ss; lastDraw = now; dirty = false;
      var tau = tauAt(ss), S = stateAt(tau), cam = camAt(views, tau);
      if (introT0 === null) introT0 = tau < 0.4 ? now : -1e9;
      S.intro = clamp((now - introT0) / 1500);
      if (S.intro < 1) dirty = true;
      cam = { s: cam.s, cx: cam.cx + ptr.x * 26 / cam.s, cy: cam.cy + ptr.y * 14 / cam.s };
      var t0 = window.__perf ? performance.now() : 0;
      var info = render(ctx, L, cam, S, now / 1000);
      if (window.__perf) window.__perf.push(performance.now() - t0);
      chrome(ss, tau, S, cam, info);
    }

    measure();
    ss = window.scrollY || 0;
    var rt;
    function remeasure() { measure(); dirty = true; }
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(remeasure, 60); });
    window.addEventListener('orientationchange', function () { setTimeout(remeasure, 250); });
    window.addEventListener('load', remeasure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
    requestAnimationFrame(frame);

    // exposed for inspection from the console and from test scripts
    window.__scene = { tauAt: tauAt, stateAt: stateAt, beats: BEATS, ranges: function () { return { dStart: dStart.slice(), dEnd: dEnd.slice() }; } };
  }

  try {
    if (MODE === 'live') runLive(); else runStills();
  } catch (err) {
    // the article underneath is complete without the scene
    root.className = '';
    if (window.console) console.error('scene failed, showing the plain page', err);
  }

  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var onChange = function () { window.location.reload(); };
  if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
})();
