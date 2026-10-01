/* benkanspedos.com, scroll variation A: one stage that transforms.
 *
 * 720 blocks on one lit stage. Each world is a full set of targets for those
 * same blocks (position, rotation, scale, colour, glow). Scroll position picks
 * two neighbouring worlds and a blend between them, so the scene rebuilds
 * itself in either direction. Nothing here is a video or an image.
 *
 * Block index ranges are fixed across worlds so the same pieces carry through:
 *   CORE  0..26     the glowing cube (the AI): idle, then scanner, then engine
 *   TILE  27..334   paper sheets, then survey tiles, then floor, then windows
 *   LINE  335..719  everything built: the line, people, towers, the envelope
 */
import * as THREE from './vendor/three.module.min.js';

const root = document.documentElement;
const canvas = document.getElementById('stage');
const REDUCED = root.classList.contains('rm');

const N = 720, CORE_N = 27, TILE0 = 27, TILE_N = 308, LINE0 = 335, LINE_N = 385;
const GX = 22, GZ = 14;
const TAU = Math.PI * 2, DEG = Math.PI / 180;

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const _col = new THREE.Color();
const lin = (hex) => { _col.set(hex); return [_col.r, _col.g, _col.b]; };
const srgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
// Backgrounds blend around the hue wheel (OKLCH) so night to dawn passes through violet and rose, not grey.
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toS = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
function oklch([r, g, b]) {
  r = toLin(r); g = toLin(g); b = toLin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(a, bb), Math.atan2(bb, a)];
}
function fromOklch(L, C, h) {
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [toS(clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)), toS(clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)), toS(clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s))];
}
function mixLch(A, B, t) {
  const ha = A[1] < 0.025 ? B[2] : A[2], hb = B[1] < 0.025 ? A[2] : B[2];
  let dh = hb - ha; if (dh > Math.PI) dh -= TAU; if (dh < -Math.PI) dh += TAU;
  return fromOklch(lerp(A[0], B[0], t), lerp(A[1], B[1], t), ha + dh * t);
}

/* ---------- a world: one full pose for every block ---------- */
function quatE(out, o, yaw, pitch, roll) {
  const c1 = Math.cos(pitch / 2), s1 = Math.sin(pitch / 2);
  const c2 = Math.cos(yaw / 2), s2 = Math.sin(yaw / 2);
  const c3 = Math.cos(roll / 2), s3 = Math.sin(roll / 2);
  out[o] = s1 * c2 * c3 + c1 * s2 * s3;
  out[o + 1] = c1 * s2 * c3 - s1 * c2 * s3;
  out[o + 2] = c1 * c2 * s3 - s1 * s2 * c3;
  out[o + 3] = c1 * c2 * c3 + s1 * s2 * s3;
}
class World {
  constructor() {
    this.p = new Float32Array(N * 3);
    this.q = new Float32Array(N * 4);
    this.s = new Float32Array(N * 3);
    this.c = new Float32Array(N * 3);
    this.g = new Float32Array(N);
    this.k = new Float32Array(N); // arrival order when this world assembles, 0..1
    this.h = new Float32Array(N).fill(1); // halo weight: dense clusters share one glow instead of stacking
    for (let i = 0; i < CORE_N; i++) this.h[i] = 0.16;
    for (let i = 0; i < N; i++) this.q[i * 4 + 3] = 1;
    this.update = null; // (time, local) => void, rewrites the moving blocks
  }
  put(i, x, y, z, sx, sy, sz, col, glow = 0, yaw = 0, pitch = 0, roll = 0) {
    this.P(i, x, y, z); this.S(i, sx, sy, sz); this.C(i, col); this.g[i] = glow;
    quatE(this.q, i * 4, yaw, pitch, roll);
    return i;
  }
  P(i, x, y, z) { const p = this.p; p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z; }
  S(i, x, y, z) { const s = this.s; s[i * 3] = x; s[i * 3 + 1] = y; s[i * 3 + 2] = z; }
  C(i, c) { const a = this.c; a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
  Q(i, q) { const a = this.q; a[i * 4] = q.x; a[i * 4 + 1] = q.y; a[i * 4 + 2] = q.z; a[i * 4 + 3] = q.w; }
  E(i, yaw, pitch = 0, roll = 0) { quatE(this.q, i * 4, yaw, pitch, roll); }
  hide(i) { this.S(i, 0, 0, 0); this.g[i] = 0; }
}
const pool = (a, n) => {
  let i = a; const end = a + n;
  return {
    next() { if (i >= end) throw new Error('block pool exhausted at ' + a); return i++; },
    left() { return end - i; },
  };
};
const hideRest = (W, P) => { while (P.left()) W.hide(P.next()); };

const _Q = new THREE.Quaternion(), _Q2 = new THREE.Quaternion(), _V = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), XA = new THREE.Vector3(1, 0, 0);

const tileX = (cx) => cx - (GX - 1) / 2;
const tileZ = (cz) => cz - (GZ - 1) / 2;

/* ============================================================
   WORLD 0  Idle. The AI is on. The work is a heap of paper.
   ============================================================ */
function worldIdle() {
  const W = new World(), R = rng(7);
  const paper = ['#e9ecf3', '#d9deea', '#f4f5f8', '#cfd5e3'].map(lin);
  const ice = lin('#d4f1ff'), coreCol = lin('#7fd2ff');
  for (let n = 0; n < CORE_N; n++) { W.put(n, 0, 5, 0, 0.6, 0.6, 0.6, coreCol, 0.7); W.k[n] = R() * 0.4; }

  const pts = [];
  for (let n = 0; n < TILE_N; n++) {
    const r = 7.6 * Math.pow(R(), 0.6), a = R() * TAU, h = Math.max(0, 1 - r / 7.6);
    pts.push({
      x: r * Math.cos(a) * 1.22, z: r * Math.sin(a) * 0.95, y: 0.03 + R() * h * h * 1.5,
      yaw: R() * TAU, pi: (R() - 0.5) * 0.55 * h + (R() - 0.5) * 0.06, ro: (R() - 0.5) * 0.55 * h,
      air: R() < 0.085, c: paper[(R() * 4) | 0], ph: R() * TAU,
    });
  }
  pts.sort((a, b) => a.x - b.x);
  const air = [];
  pts.forEach((o, n) => {
    const i = TILE0 + n;
    if (o.air) { o.y = 1.5 + R() * 3.6; o.x *= 0.6; o.i = i; air.push(o); }
    W.put(i, o.x, o.y, o.z, 1.0, 0.025, 1.36, o.c, 0, o.yaw, o.pi, o.ro);
    W.k[i] = R();
  });

  const L = pool(LINE0, LINE_N);
  [[-5.8, 3.3, 26], [5.6, -2.9, 22], [3.1, 4.7, 18], [-2.6, -4.6, 14]].forEach(([sx, sz, n]) => {
    const lean = (R() - 0.5) * 0.024, yaw0 = R() * TAU;
    for (let k = 0; k < n; k++) {
      const i = L.next();
      W.put(i, sx + k * lean + (R() - 0.5) * 0.09, 0.05 + k * 0.052, sz + (R() - 0.5) * 0.09, 1.0, 0.045, 1.36, paper[(R() * 4) | 0], 0, yaw0 + (R() - 0.5) * 0.28);
      W.k[i] = R();
    }
  });
  const motes = [];
  for (let n = 0; n < 70; n++) {
    const i = L.next();
    const o = { i, x: (R() - 0.5) * 24, y: 0.8 + R() * 8.5, z: (R() - 0.5) * 15, ph: R() * TAU, sp: 0.15 + R() * 0.4 };
    motes.push(o);
    W.put(i, o.x, o.y, o.z, 0.05, 0.05, 0.05, ice, 0.8);
    W.k[i] = R();
  }
  hideRest(W, L);

  const QF = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.6155, 0, 0.7854));
  W.update = (t) => {
    _Q2.setFromAxisAngle(UP, t * 0.32);
    _Q.copy(_Q2).multiply(QF);
    const pitch = 0.84 * (1 + 0.04 * Math.sin(t * 1.4)), cy = 5.2 + Math.sin(t * 0.7) * 0.14;
    for (let n = 0; n < CORE_N; n++) {
      _V.set((n % 3 - 1) * pitch, (((n / 3) | 0) % 3 - 1) * pitch, (((n / 9) | 0) - 1) * pitch).applyQuaternion(_Q);
      W.P(n, _V.x, cy + _V.y, _V.z); W.Q(n, _Q);
      W.g[n] = 0.62 + 0.22 * Math.sin(t * 1.4 + n);
    }
    for (const o of air) {
      W.P(o.i, o.x + Math.sin(t * 0.21 + o.ph) * 0.5, o.y + Math.sin(t * 0.4 + o.ph) * 0.4, o.z + Math.cos(t * 0.17 + o.ph) * 0.4);
      W.E(o.i, o.yaw + t * 0.12, Math.sin(t * 0.5 + o.ph) * 0.55, Math.cos(t * 0.37 + o.ph) * 0.4);
    }
    for (const o of motes) {
      W.P(o.i, o.x + Math.sin(t * o.sp + o.ph) * 0.5, o.y + Math.sin(t * o.sp * 0.7 + o.ph * 2) * 0.5, o.z);
      W.g[o.i] = 0.45 + 0.4 * Math.sin(t * o.sp * 3 + o.ph);
    }
  };
  W.paper = paper;
  return W;
}

/* ============================================================
   WORLD 1  Survey. The sheets file into a grid, the scan finds the heat.
   ============================================================ */
const PEAKS = [[-5, -1, 1], [0.5, 1, 0.9], [5, -0.5, 0.96], [-8, 4, 0.62], [8, 4.5, 0.68], [2, -5, 0.58], [-9, -5, 0.42]];
function heatAt(x, z, n) {
  let h = 0;
  for (const [px, pz, w] of PEAKS) { const d2 = (x - px) ** 2 + (z - pz) ** 2; h = Math.max(h, w * Math.exp(-d2 / 2.5)); }
  return clamp(h + n * 0.1);
}
const RAMP = [[0, '#1b4a48'], [0.25, '#2f8f78'], [0.5, '#e8c04a'], [0.75, '#ff9838'], [1, '#ff5a26']].map(([t, c]) => [t, lin(c)]);
function ramp(h) {
  for (let i = 1; i < RAMP.length; i++) if (h <= RAMP[i][0]) return mix3(RAMP[i - 1][1], RAMP[i][1], (h - RAMP[i - 1][0]) / (RAMP[i][0] - RAMP[i - 1][0]));
  return RAMP[RAMP.length - 1][1];
}
function tileHeat() {
  const R = rng(21), out = [];
  for (let cx = 0; cx < GX; cx++) for (let cz = 0; cz < GZ; cz++) out.push(heatAt(tileX(cx), tileZ(cz), R()));
  return out;
}
const HEAT = tileHeat();

function worldSurvey(idle) {
  const W = new World(), R = rng(33);
  const scanCol = lin('#c4fff0'), tick = lin('#7fa9a2'), flagCol = lin('#f3fff9');
  const tiles = [];
  for (let cx = 0; cx < GX; cx++) for (let cz = 0; cz < GZ; cz++) {
    const n = cx * GZ + cz, i = TILE0 + n, x = tileX(cx), z = tileZ(cz), h = HEAT[n];
    const raw = [idle.c[i * 3], idle.c[i * 3 + 1], idle.c[i * 3 + 2]];
    tiles.push({ i, x, z, h, raw, hot: ramp(h), rise: Math.pow(h, 1.8) * 4.4, glow: sstep(0.3, 1, h) * 0.75 });
    W.h[i] = 0.3;
    W.put(i, x, 0.05, z, 0.9, 0.1, 0.9, raw);
    W.k[i] = (cx / GX) * 0.75 + R() * 0.25;
  }
  for (let n = 0; n < CORE_N; n++) { W.put(n, -12.6, 1.5, (n - 13) * 0.5, 0.24, 0.24, 0.24, scanCol, 1.1); W.h[n] = 0.34; W.k[n] = n / CORE_N * 0.3; }

  const L = pool(LINE0, LINE_N);
  for (let n = 0; n < 45; n++) { // ruler along the front edge
    const i = L.next(), long = n % 4 === 0;
    W.put(i, -11 + n * 0.5, 0.03, 7.45 + (long ? 0.12 : 0), 0.05, 0.05, long ? 0.5 : 0.26, tick);
    W.k[i] = (n / 45) * 0.8 + 0.1;
  }
  for (let n = 0; n < 29; n++) { // ruler along the left edge
    const i = L.next(), long = n % 4 === 0;
    W.put(i, -11.45 - (long ? 0.12 : 0), 0.03, -7 + n * 0.5, long ? 0.5 : 0.26, 0.05, 0.05, tick);
    W.k[i] = R() * 0.3;
  }
  const flags = [];
  for (const [px, pz] of PEAKS.slice(0, 3)) {
    const x = Math.round(px + 10.5) - 10.5, z = Math.round(pz + 6.5) - 6.5;
    const top = Math.pow(heatAt(x, z, 0.5), 1.8) * 4.4 + 0.1;
    const pole = L.next(), flag = L.next();
    W.put(pole, x, top + 0.6, z, 0.05, 1.2, 0.05, flagCol, 0.2);
    W.put(flag, x + 0.28, top + 1.02, z, 0.5, 0.3, 0.04, flagCol, 0.5);
    W.k[pole] = W.k[flag] = 0.9;
    flags.push({ pole, flag, x, top });
  }
  hideRest(W, L);

  W.update = (t, local) => {
    const sx = -12.6 + 25.2 * local;
    for (const o of tiles) {
      const s = sstep(-0.7, 0.7, sx - o.x), sy = 0.1 + s * o.rise;
      W.S(o.i, 0.9, sy, 0.9); W.P(o.i, o.x, sy / 2, o.z);
      W.C(o.i, mix3(o.raw, o.hot, s)); W.g[o.i] = s * o.glow * (0.85 + 0.15 * Math.sin(t * 2 + o.x));
    }
    for (let n = 0; n < CORE_N; n++) W.P(n, sx, 1.7 + 0.1 * Math.sin(t * 3 + n * 0.6), (n - 13) * 0.5);
    for (const f of flags) {
      const s = sstep(0.4, 1.6, sx - f.x);
      W.S(f.pole, 0.05 * s, 1.2 * s, 0.05 * s); W.S(f.flag, 0.5 * s, 0.3 * s, 0.04);
    }
  };
  W.update(0, 0);
  return W;
}

/* ============================================================
   WORLDS 2 and 3  The line, then the line with the team on it.
   ============================================================ */
function buildLine(W, L, pal, R) {
  const H = { slats: [], docs: [], out: [], cab: [], pipes: [], core0: 0 };
  // floor: the survey map stays underfoot, with the hot spots still warm
  for (let cx = 0; cx < GX; cx++) for (let cz = 0; cz < GZ; cz++) {
    const n = cx * GZ + cz, i = TILE0 + n, h = HEAT[n];
    const base = pal.floor[(cx + cz) % 2];
    W.put(i, tileX(cx), 0.05, tileZ(cz), 0.94, 0.1, 0.94, mix3(base, pal.warm, sstep(0.45, 1, h) * 0.8), 0);
    W.h[i] = 0.4;
    W.k[i] = R() * 0.3;
  }
  const key = (i, x) => { W.k[i] = clamp((x + 11) / 22) * 0.7 + 0.15 + R() * 0.15; };
  for (let n = 0; n < 40; n++) {
    const i = L.next(), x0 = -9 + n * 0.45;
    W.put(i, x0, 0.96, 0, 0.38, 0.08, 1.5, pal.slat); key(i, x0);
    H.slats.push({ i, x0 });
  }
  for (const z of [-0.82, 0.82]) { const i = L.next(); W.put(i, 0, 1.04, z, 18.3, 0.14, 0.1, pal.white); key(i, -8); }
  for (const x of [-8, -4.8, -1.6, 1.6, 4.8, 8]) for (const z of [-0.78, 0.78]) { const i = L.next(); W.put(i, x, 0.5, z, 0.12, 0.84, 0.12, pal.leg); key(i, x); }
  const gate = (x, lampCol) => {
    for (const z of [-1.15, 1.15]) { const i = L.next(); W.put(i, x, 1.25, z, 0.34, 2.3, 0.34, pal.white); key(i, x); }
    const lin_ = L.next(); W.put(lin_, x, 2.56, 0, 0.5, 0.34, 2.64, pal.accent); key(lin_, x);
    const lamp = L.next(); W.put(lamp, x, 2.33, 0, 0.16, 0.1, 1.7, lampCol, 0.8); W.h[lamp] = 0.7; key(lamp, x);
    return lamp;
  };
  H.lamp1 = gate(-5, pal.ice);
  for (const x of [-0.95, 0.95]) for (const z of [-1.15, 1.15]) { const i = L.next(); W.put(i, x, 1.65, z, 0.2, 3.1, 0.2, pal.white); key(i, x); }
  for (const z of [-1.15, 1.15]) { const i = L.next(); W.put(i, 0, 3.2, z, 2.1, 0.2, 0.2, pal.accent); key(i, 0); }
  for (const x of [-0.95, 0.95]) { const i = L.next(); W.put(i, x, 3.2, 0, 0.2, 0.2, 2.5, pal.accent); key(i, x); }
  H.lamp3 = gate(5, pal.go);
  { const i = L.next(); W.put(i, 5, 0.6, 2.35, 1.0, 1.0, 0.6, pal.white); key(i, 5); }
  { const i = L.next(); W.put(i, 5, 1.38, 2.3, 0.84, 0.52, 0.06, pal.slat, 0, 0, -0.35); key(i, 5); }
  for (let k = 0; k < 16; k++) {
    const i = L.next();
    W.put(i, 0, 1.03, 0, 0.62, 0.03, 0.84, pal.docRaw); W.k[i] = 0.6 + R() * 0.4;
    H.docs.push({ i, ph: k / 16, yaw: (R() - 0.5) * 1.3, z: (R() - 0.5) * 0.55 });
  }
  for (let k = 0; k < 30; k++) { // intake heap
    const i = L.next(), a = R() * TAU, r = Math.pow(R(), 0.7) * 1.25;
    W.put(i, -10.3 + Math.cos(a) * r * 0.6, 0.13 + R() * (1.25 - r) * 0.75, Math.sin(a) * r, 0.62, 0.03, 0.84, pal.docRaw, 0, R() * TAU, (R() - 0.5) * 0.5, (R() - 0.5) * 0.5);
    W.k[i] = R() * 0.2;
  }
  for (let k = 0; k < 24; k++) { // finished stack
    const i = L.next();
    W.put(i, 10.2, 0.13 + k * 0.045, 0, 0.62, 0.04, 0.84, pal.docDone, 0, (R() - 0.5) * 0.05); W.k[i] = 0.9;
    H.out.push(i);
  }
  [-3.2, 0, 3.2].forEach((x, c) => { // the systems the team already runs
    const i = L.next(); W.put(i, x, 1.25, -4.7, 1.3, 2.3, 0.9, pal.cabinet); key(i, x);
    for (let k = 0; k < 3; k++) { const l = L.next(); W.put(l, x - 0.35, 2.0 - k * 0.3, -4.22, 0.12, 0.12, 0.06, pal.ice, 1); key(l, x); H.cab.push({ i: l, sp: 1.3 + c + k * 0.7 }); }
    const p = L.next(); W.put(p, x, 0.2, -3.45, 0.14, 0.14, 1.7, pal.pipe, 0.25); key(p, x); H.pipes.push(p);
  });
  { const i = L.next(); W.put(i, 0, 0.2, -2.6, 6.54, 0.14, 0.14, pal.pipe, 0.25); key(i, 0); H.pipes.push(i); }
  { const i = L.next(); W.put(i, 0, 0.2, -1.85, 0.14, 0.14, 1.5, pal.pipe, 0.25); key(i, 0); H.pipes.push(i); }
  for (let n = 0; n < CORE_N; n++) { W.put(n, 0, 2.25, 0, 0.3, 0.3, 0.3, pal.core, 0.6); W.k[n] = 0.45 + (n / CORE_N) * 0.2; }
  H.pal = pal;
  return H;
}
const BELT_V = 18.8 * 0.055;
function updateLine(W, H, t) {
  const u = t * 0.055, pal = H.pal;
  let pulse = 0, p1 = 0, p3 = 0;
  for (const d of H.docs) {
    const f = (d.ph + u) % 1, x = -9.4 + 18.8 * f;
    const a = sstep(-5.6, -4.4, x), m = sstep(-0.4, 0.7, x), v = sstep(4.6, 5.4, x);
    const sc = sstep(0, 0.04, f) * (1 - sstep(0.96, 1, f));
    W.P(d.i, x, 1.03, d.z * (1 - a)); W.E(d.i, d.yaw * (1 - a));
    W.S(d.i, 0.62 * sc, 0.03, 0.84 * sc);
    W.C(d.i, mix3(mix3(pal.docRaw, pal.docMid, m), pal.docDone, v)); W.g[d.i] = m * (1 - v) * 0.35;
    pulse = Math.max(pulse, Math.exp(-x * x / 0.5));
    p1 = Math.max(p1, Math.exp(-((x + 5) ** 2) / 0.4)); p3 = Math.max(p3, Math.exp(-((x - 5) ** 2) / 0.4));
  }
  for (const s of H.slats) {
    const x = -9 + ((((s.x0 + 9 + BELT_V * t) % 18) + 18) % 18);
    const sc = sstep(0, 0.5, x + 9) * sstep(0, 0.5, 9 - x);
    W.P(s.i, x, 0.96, 0); W.S(s.i, 0.38 * sc, 0.08, 1.5);
  }
  const c = (u * 16) % 24, fade = 1 - sstep(22.6, 24, c);
  H.out.forEach((i, j) => { const s = sstep(j, j + 0.8, c) * fade; W.S(i, 0.62 * s, 0.04, 0.84 * s); });
  W.g[H.lamp1] = 0.5 + p1 * 0.9; W.g[H.lamp3] = 0.5 + p3 * 1.0;
  for (const l of H.cab) W.g[l.i] = Math.sin(t * l.sp + l.sp * 3) > 0 ? 1.1 : 0.15;
  H.pipes.forEach((i, j) => { W.g[i] = 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(t * 2.2 - j * 0.8)) + pulse * 0.3; });
  _Q.setFromAxisAngle(UP, t * 0.5);
  const pitch = 0.36 + pulse * 0.05;
  for (let n = 0; n < CORE_N; n++) {
    _V.set((n % 3 - 1) * pitch, (((n / 3) | 0) % 3 - 1) * pitch, (((n / 9) | 0) - 1) * pitch).applyQuaternion(_Q);
    W.P(n, _V.x, 2.3 + _V.y, _V.z); W.Q(n, _Q); W.g[n] = 0.5 + pulse * 0.8;
  }
}
function worldLine() {
  const W = new World(), R = rng(51), L = pool(LINE0, LINE_N);
  const pal = {
    floor: ['#2347a0', '#274dab'].map(lin), warm: lin('#4f7fe0'), white: lin('#eef2fb'), slat: lin('#132048'), leg: lin('#c4cfe8'),
    accent: lin('#ff7a33'), ice: lin('#c8f4ff'), core: lin('#7fd2ff'), go: lin('#8dffb8'), docRaw: lin('#f4f1e6'), docMid: lin('#bfeaff'), docDone: lin('#d2f5d8'),
    cabinet: lin('#d5def2'), pipe: lin('#ff8a4a'),
  };
  const H = buildLine(W, L, pal, R);
  hideRest(W, L);
  W.update = (t) => updateLine(W, H, t);
  W.update(0, 0);
  return W;
}
function worldTeam() {
  const W = new World(), R = rng(51), L = pool(LINE0, LINE_N);
  const pal = {
    floor: ['#f1cfab', '#f4d6b6'].map(lin), warm: lin('#f6b98a'), white: lin('#fffaf2'), slat: lin('#4d3d35'), leg: lin('#e2d2bf'),
    accent: lin('#e8642c'), ice: lin('#fff3c4'), core: lin('#ffb347'), go: lin('#7fe0a0'), docRaw: lin('#fffdf6'), docMid: lin('#ffe9c2'), docDone: lin('#d6f2d4'),
    cabinet: lin('#f6eadb'), pipe: lin('#e8642c'),
  };
  const H = buildLine(W, L, pal, R);
  const R2 = rng(77);
  const cloth = ['#2f4b3c', '#27455c', '#5a3d5c', '#3a3f4a', '#1f5a5a', '#6b4a2b', '#2f4b3c', '#27455c'].map(lin);
  const head = lin('#fff6ea'), clay = lin('#d9521f');
  const people = [];
  const person = (x, z, yaw, col) => {
    const b = L.next(), h = L.next(), o = { b, h, x, z, yaw, ph: R2() * TAU };
    W.put(b, x, 0.72, z, 0.62, 1.24, 0.44, col, 0, yaw); W.put(h, x, 1.6, z, 0.44, 0.44, 0.44, head, 0, yaw);
    W.k[b] = W.k[h] = 0.35 + R2() * 0.6;
    return o;
  };
  [[-5.7, 1.95, 2.4], [-4.3, -1.95, -0.4], [1.0, 2.05, 2.9], [-0.9, -2.1, 0.3], [5.0, 3.05, 3.14], [6.2, -1.85, -0.5], [9.5, 1.5, 2.2], [1.7, -3.55, 0.2]]
    .forEach(([x, z, yaw], n) => people.push(person(x, z, yaw, cloth[n])));
  const ben = person(-1.6, 2.4, 2.6, clay);
  const paperW = lin('#fffdf6');
  [[-6.9, 2.5, -0.5], [2.6, 2.75, 0.2], [7.0, 2.9, 0.5]].forEach(([x, z, yaw]) => { // job aids, posted where the work happens
    const p = L.next(), b = L.next();
    W.put(p, x, 0.85, z, 0.08, 1.5, 0.08, pal.slat); W.put(b, x, 1.9, z, 1.15, 0.8, 0.06, paperW, 0, yaw, -0.12);
    W.k[p] = W.k[b] = 0.5 + R2() * 0.4;
  });
  ['#2f4b3c', '#e8642c', '#27455c', '#fffdf6'].forEach((c, k) => { // the documentation
    const i = L.next(); W.put(i, 8.3, 0.18 + k * 0.15, -2.4, 0.62, 0.14, 0.82, lin(c), 0, 0.3 + (R2() - 0.5) * 0.3); W.k[i] = 0.8;
  });
  hideRest(W, L);
  W.update = (t, local) => {
    updateLine(W, H, t);
    for (const o of people) {
      const bob = Math.abs(Math.sin(t * 1.6 + o.ph)) * 0.035, yaw = o.yaw + Math.sin(t * 0.6 + o.ph) * 0.25;
      W.P(o.b, o.x, 0.72 + bob, o.z); W.P(o.h, o.x, 1.6 + bob * 1.6, o.z); W.E(o.b, yaw); W.E(o.h, yaw + Math.sin(t * 0.9 + o.ph) * 0.3);
    }
    // Ben steps back from the line, then walks off the floor. The line keeps running.
    const w = sstep(0.3, 0.92, local), x = lerp(-1.6, 9.4, w), z = lerp(2.4, 7.6, w * w);
    const gone = 1 - sstep(0.8, 0.97, local), hop = Math.abs(Math.sin(w * 26)) * 0.09 * (w > 0 && w < 1 ? 1 : 0);
    const yaw = lerp(2.6, 1.1, sstep(0, 0.2, w));
    W.P(ben.b, x, 0.72 + hop, z); W.P(ben.h, x, 1.6 + hop, z); W.E(ben.b, yaw); W.E(ben.h, yaw);
    W.S(ben.b, 0.62 * gone, 1.24 * gone, 0.44 * gone); W.S(ben.h, 0.44 * gone, 0.44 * gone, 0.44 * gone);
  };
  W.update(0, 0);
  return W;
}

/* ============================================================
   WORLD 4  Twenty one floors. One per year. The top two are lit differently.
   ============================================================ */
function worldTower() {
  const W = new World(), R = rng(91), L = pool(LINE0, LINE_N);
  const FLOORS = 21, fp = 0.5, y0 = 0.5;
  const slab = lin('#1a2740'), dark = lin('#2a3c58'), warm = lin('#ffe2a8'), gold = lin('#ffc35e'), body = lin('#131d31');
  const wins = [];
  let w = 0;
  for (let f = 0; f < FLOORS; f++) {
    const top = f >= FLOORS - 2, y = y0 + f * fp + 0.27;
    for (let side = 0; side < 4; side++) for (let n = 0; n < 4; n++) {
      const i = w < TILE_N ? TILE0 + w : L.next(); w++;
      const o = (n - 1.5) * 1.02, yaw = side % 2 ? Math.PI / 2 : 0;
      const x = side === 0 ? o : side === 2 ? -o : side === 1 ? 2.06 : -2.06;
      const z = side === 0 ? 2.06 : side === 2 ? -2.06 : side === 1 ? o : -o;
      const lit = top || R() < 0.68, g = top ? 0.95 : lit ? 0.3 + R() * 0.35 : 0;
      W.put(i, x, y, z, 0.88, 0.34, 0.07, top ? gold : lit ? warm : dark, g, yaw); W.h[i] = top ? 0.34 : 0.12;
      W.k[i] = (f / FLOORS) * 0.8 + R() * 0.2;
      if (lit) wins.push({ i, g, sp: 0.4 + R() * 1.2, ph: R() * TAU, top });
    }
    const s = L.next(); W.put(s, 0, y0 + f * fp, 0, 4.3, 0.09, 4.3, slab); W.k[s] = (f / FLOORS) * 0.8;
  }
  const put = (x, y, z, sx, sy, sz, c, g = 0, k = 0.1) => { const i = L.next(); W.put(i, x, y, z, sx, sy, sz, c, g); W.k[i] = k; return i; };
  put(0, y0 + FLOORS * fp / 2, 0, 3.8, FLOORS * fp, 3.8, body, 0, 0.3);
  put(0, y0 + FLOORS * fp, 0, 4.3, 0.09, 4.3, slab, 0, 0.85);
  put(0, 0.25, 0, 6.6, 0.5, 6.6, slab, 0, 0);
  put(0, y0 + FLOORS * fp + 0.85, 0, 0.09, 1.7, 0.09, slab, 0, 0.95);
  const beacon = put(0, y0 + FLOORS * fp + 1.75, 0, 0.16, 0.16, 0.16, lin('#ff5b3a'), 1.6, 1);
  [[-7.5, -5, 3.2], [-10.5, 0.5, 2.2], [8, -8.5, 4.4], [-2.5, -13, 2.6], [-5, -9.5, 5.2], [3.5, -11, 3.6], [13, -14, 6], [-13, -7, 4]]
    .forEach(([x, z, h]) => put(x, h / 2, z, 2.7, h, 2.7, body, 0, R() * 0.4));
  hideRest(W, L);
  for (let n = 0; n < CORE_N; n++) { // the light inside the top two floors
    const f = n < 9 ? FLOORS - 2 : n < 18 ? FLOORS - 1 : FLOORS - 1.5, m = n % 9;
    W.put(n, (m % 3 - 1) * 1.1, y0 + f * fp + 0.27, (((m / 3) | 0) - 1) * 1.1, 0.4, 0.3, 0.4, gold, 1.0); W.h[n] = 0.3;
    W.k[n] = 0.92;
  }
  W.update = (t) => {
    for (const o of wins) W.g[o.i] = o.top ? 0.85 + 0.2 * Math.sin(t * 1.1 + o.ph) : o.g * (0.72 + 0.28 * Math.sin(t * o.sp + o.ph));
    W.g[beacon] = Math.sin(t * 2.4) > 0.3 ? 2 : 0.3;
    for (let n = 0; n < CORE_N; n++) W.g[n] = 0.9 + 0.3 * Math.sin(t * 1.1 + n * 0.3);
  };
  return W;
}

/* ============================================================
   WORLD 5  ConvoWize. A conversation, and a note from the coach.
   ============================================================ */
function worldTalk() {
  const W = new World(), R = rng(123), L = pool(LINE0, LINE_N), T = pool(TILE0, TILE_N);
  const P = 0.44, groups = [];
  const cells = (w, h, r) => {
    const out = [];
    for (let cx = 0; cx < w; cx++) for (let cy = 0; cy < h; cy++) {
      if (Math.min(cx, w - 1 - cx) + Math.min(cy, h - 1 - cy) < r) continue;
      out.push([cx - (w - 1) / 2, cy - (h - 1) / 2]);
    }
    return out;
  };
  const bubble = (cx, cy, cz, w, h, r, tail, col, glow, k0, sp, ph) => {
    const G = { items: [], sp, ph };
    const add = (i, x, y, z) => { G.items.push({ i, x, y, z }); };
    for (const [ux, uy] of cells(w, h, r).concat(tail)) {
      const i = T.next(), x = cx + ux * P, y = cy + uy * P;
      W.put(i, x, y, cz, 0.42, 0.42, 0.5, col, glow); W.h[i] = 0.1; add(i, x, y, cz);
      W.k[i] = clamp(k0 + Math.hypot(ux, uy) * 0.05 + R() * 0.08);
    }
    groups.push(G);
    return { G, add };
  };
  const white = lin('#f6f0fb'), coral = lin('#ff8f66'), gold = lin('#ffd27a'), inkA = lin('#4a3560'), inkC = lin('#8a6416');
  const A = bubble(-2.2, 6.1, 0, 17, 9, 2, [[-6, -5], [-5, -5], [-6, -6]], white, 0, 0.05, 0.9, 0);
  [[12, 2], [9.5, 0], [6, -2]].forEach(([len, row]) => {
    const i = L.next(), x = -2.2 - 6.2 * P + len * P / 2, y = 6.1 + row * P;
    W.put(i, x, y, 0.3, len * P, 0.2, 0.12, inkA); W.k[i] = 0.6; A.add(i, x, y, 0.3);
  });
  const B = bubble(2.9, 3.0, 0, 13, 7, 2, [[4, -4], [3, -4], [4, -5]], coral, 0, 0.3, 0.9, 2.1);
  const Cc = bubble(5.0, 7.5, 0.9, 9, 5, 1, [[-3, -3], [-2, -3]], gold, 0.1, 0.5, 1.1, 4.2);
  [[5, 0.7], [3.4, -0.7]].forEach(([len, row]) => {
    const i = L.next(), x = 5.0 - 2.9 * P + len * P / 2, y = 7.5 + row * P;
    W.put(i, x, y, 1.2, len * P, 0.18, 0.1, inkC); W.k[i] = 0.8; Cc.add(i, x, y, 1.2);
  });
  hideRest(W, T);
  const motes = [];
  for (let n = 0; n < 46; n++) {
    const i = L.next(), o = { i, x: (R() - 0.5) * 22, y: 0.8 + R() * 9.5, z: -2 - R() * 6, ph: R() * TAU, sp: 0.2 + R() * 0.4 };
    W.put(i, o.x, o.y, o.z, 0.07, 0.07, 0.07, lin('#ffd6f2'), 0.7); W.k[i] = R(); motes.push(o);
  }
  hideRest(W, L);
  const dotCol = lin('#fff7f0');
  for (let n = 0; n < CORE_N; n++) { W.put(n, 2.9, 3, 0.34, 0.2, 0.2, 0.14, dotCol, 0.5); W.h[n] = 0.22; W.k[n] = 0.55 + R() * 0.2; }
  W.update = (t) => {
    for (const G of groups) { const dy = Math.sin(t * G.sp + G.ph) * 0.13; for (const o of G.items) W.P(o.i, o.x, o.y + dy, o.z); }
    const by = Math.sin(t * 0.9 + 2.1) * 0.13;
    for (let n = 0; n < CORE_N; n++) {
      const d = (n / 9) | 0, m = n % 9, hop = Math.pow(Math.max(0, Math.sin(t * 3.2 - d * 0.75)), 3) * 0.36;
      W.P(n, 2.9 + (d - 1) * 1.05 + (m % 3 - 1) * 0.21, 3.0 + by + hop + (((m / 3) | 0) - 1) * 0.21, 0.34);
      W.g[n] = 0.35 + hop * 1.6;
    }
    for (const o of motes) { W.P(o.i, o.x + Math.sin(t * o.sp + o.ph) * 0.6, o.y + Math.cos(t * o.sp * 0.8 + o.ph) * 0.5, o.z); W.g[o.i] = 0.35 + 0.35 * Math.sin(t * o.sp * 3 + o.ph); }
  };
  W.update(0, 0);
  return W;
}

/* ============================================================
   WORLD 6  Two client systems, both running.
   ============================================================ */
function worldClients() {
  const W = new World(), R = rng(201), L = pool(LINE0, LINE_N), T = pool(TILE0, TILE_N);
  const plinth = ['#4c8a5c', '#529362'].map(lin), ink = lin('#11231a'), warm = lin('#ffd98a'), white = lin('#f4f5ee');
  const ice = lin('#d6fff0'), top = 0.3, cL = -4.5, cR = 4.5;
  for (const cx0 of [cL, cR]) for (let a = 0; a < 7; a++) for (let b = 0; b < 6; b++) {
    const i = T.next(); W.put(i, cx0 + (a - 3), 0.15, b - 2.5, 0.95, 0.3, 0.95, plinth[(a + b) % 2]); W.k[i] = R() * 0.5;
  }
  hideRest(W, T);
  const put = (x, y, z, sx, sy, sz, c, g = 0, yaw = 0, pitch = 0) => { const i = L.next(); W.put(i, x, y, z, sx, sy, sz, c, g, yaw, pitch); W.k[i] = 0.3 + R() * 0.6; return i; };
  // left: documents out of a commercial building, through a gate, into a finished stack
  const bx = cL - 2.0, bz = -1.25, bl = 1.6, wins = [];
  for (let f = 0; f < 6; f++) {
    const y = top + 0.33 + f * 0.66;
    put(bx, y, bz, 2.3, 0.56, 2.3, ink);
    for (let n = 0; n < 3; n++) {
      wins.push(put(bx + (n - 1) * 0.68, y, bz + 1.17, 0.42, 0.3, 0.05, warm, 0.5));
      wins.push(put(bx + 1.17, y, bz + (n - 1) * 0.68, 0.05, 0.3, 0.42, warm, 0.5));
    }
  }
  put(cL, top + 0.6, bl, 4.4, 0.14, 1.2, ink);
  for (const x of [cL - 1.9, cL + 1.9]) for (const z of [bl - 0.45, bl + 0.45]) put(x, top + 0.27, z, 0.14, 0.54, 0.14, white);
  for (const z of [bl - 0.85, bl + 0.85]) put(cL + 0.2, top + 0.9, z, 0.28, 1.8, 0.28, white);
  put(cL + 0.2, top + 1.9, bl, 0.4, 0.28, 2.0, lin('#ff8a4a'));
  const docsL = [];
  for (let k = 0; k < 5; k++) docsL.push({ i: put(cL, top + 0.69, bl, 0.62, 0.03, 0.84, white), ph: k / 5, yaw: (R() - 0.5) * 1.2 });
  const outL = [];
  for (let k = 0; k < 10; k++) outL.push(put(cL + 2.85, top + 0.03 + k * 0.05, bl, 0.62, 0.045, 0.84, white));
  // right: source material into an engine, lessons out onto the board
  ['#f4f5ee', '#e8a05a', '#9cc4a4', '#f4f5ee', '#d9622b'].forEach((c, k) => put(cR - 2.3, top + 0.13 + k * 0.25, 1.5, 1.2, 0.24, 0.86, lin(c), 0, (R() - 0.5) * 0.5));
  put(cR - 0.2, top + 0.42, 1.5, 1.5, 0.84, 1.5, ink);
  put(cR + 1.1, top + 2.05, -1.7, 4.5, 3.95, 0.12, ink);
  const cards = [], tints = ['#f4f5ee', '#ffe2b0', '#cfe8d4', '#f4f5ee'].map(lin);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) cards.push(put(cR + 1.1 + (c - 1.5) * 1.06, top + 0.82 + (2 - r) * 1.22, -1.58, 0.92, 1.04, 0.07, tints[(r + c) % 4]));
  const feed = [];
  for (let k = 0; k < 4; k++) feed.push({ i: put(cR - 1.2, 1.5, 1.5, 0.18, 0.18, 0.18, ice, 0.9), ph: k / 4 });
  hideRest(W, L);
  for (let n = 0; n < CORE_N; n++) { W.put(n, 0, 2, 0, 0.12, 0.12, 0.12, ice, 0.8); W.k[n] = 0.5 + R() * 0.3; }
  W.update = (t) => {
    const u = t * 0.16; let pulse = 0;
    for (const d of docsL) {
      const f = (d.ph + u) % 1, x = cL - 2.05 + 4.1 * f, a = sstep(cL - 0.3, cL + 0.5, x), sc = sstep(0, 0.07, f) * (1 - sstep(0.93, 1, f));
      W.P(d.i, x, top + 0.69, bl); W.E(d.i, d.yaw * (1 - a)); W.S(d.i, 0.62 * sc, 0.03, 0.84 * sc);
      pulse = Math.max(pulse, Math.exp(-((x - cL - 0.2) ** 2) / 0.25));
    }
    const c = (u * 5) % 10, fade = 1 - sstep(9, 10, c);
    outL.forEach((i, j) => { const s = sstep(j, j + 0.8, c) * fade; W.S(i, 0.62 * s, 0.045, 0.84 * s); });
    for (let n = 0; n < 13; n++) { W.P(n, cL + 0.2, top + 1.7, bl + (n - 6) * 0.125); W.S(n, 0.12, 0.09, 0.11); W.g[n] = 0.5 + pulse * 0.9; }
    for (let n = 13; n < CORE_N; n++) {
      const a = ((n - 13) / 14) * TAU + t * 0.9;
      W.P(n, cR - 0.2 + Math.cos(a) * 0.62, top + 1.5 + Math.sin(a * 2 + t) * 0.14, 1.5 + Math.sin(a) * 0.62); W.E(n, -a);
      W.S(n, 0.18, 0.18, 0.18); W.g[n] = 0.6 + 0.3 * Math.sin(t * 3 + n);
    }
    const cc = (t * 0.55) % 14, cf = 1 - sstep(13, 14, cc);
    cards.forEach((i, j) => { const s = sstep(j, j + 0.7, cc) * cf; W.S(i, 0.92 * s, 1.04 * s, 0.07); W.g[i] = Math.max(0, 1 - Math.abs(cc - j - 0.7)) * 0.7 * cf; });
    for (const o of feed) {
      const f = (o.ph + t * 0.3) % 1, s = Math.sin(f * Math.PI);
      W.P(o.i, lerp(cR - 2.3, cR - 0.2, f), top + 1.45 + s * 0.8, 1.5); W.S(o.i, 0.18 * s, 0.18 * s, 0.18 * s);
    }
    wins.forEach((i, j) => { W.g[i] = 0.4 + 0.15 * Math.sin(t * 0.8 + j * 1.7); W.h[i] = 0.2; });
  };
  W.update(0, 0);
  return W;
}

/* ============================================================
   WORLD 7  Three steps. Each one has to earn the next.
   ============================================================ */
function worldSteps() {
  const W = new World(), R = rng(301), L = pool(LINE0, LINE_N), T = pool(TILE0, TILE_N);
  const P = 0.66, stone = lin('#fbf3da'), green = lin('#5b8763'), bright = lin('#86b98c');
  const ink = lin('#1f2a1c'), white = lin('#fffdf4'), clay = lin('#e8642c'), teal = lin('#5d8f78');
  const steps = [{ x: -6.0, n: 5, h: 1 }, { x: -1.3, n: 6, h: 3 }, { x: 4.6, n: 7, h: 5 }];
  steps.forEach((st, k) => {
    st.cubes = []; st.decor = []; st.top = st.h * P;
    for (let ix = 0; ix < st.n; ix++) for (let iz = 0; iz < st.n; iz++) for (let iy = 0; iy < st.h; iy++) {
      const edge = ix === 0 || iz === 0 || ix === st.n - 1 || iz === st.n - 1 || iy === st.h - 1;
      if (!edge) continue;
      const i = T.next(), x = st.x + (ix - (st.n - 1) / 2) * P, y = (iy + 0.5) * P, z = (iz - (st.n - 1) / 2) * P;
      W.put(i, x, y, z, 0.63, 0.63, 0.63, stone); W.k[i] = k * 0.22 + (iy / 5) * 0.3 + R() * 0.15;
      st.cubes.push({ i, x, y, z, v: 0.94 + R() * 0.12 });
    }
  });
  hideRest(W, T);
  const dec = (k, x, y, z, sx, sy, sz, c, g = 0) => {
    const i = L.next(); W.put(i, x, y, z, sx, sy, sz, c, g); W.k[i] = 0.5 + k * 0.15 + R() * 0.1;
    const o = { i, x, y, z, sx, sy, sz, g }; steps[k].decor.push(o); return o;
  };
  // step 1: the written map
  { const s = steps[0], y = s.top;
    dec(0, s.x, y + 0.03, 0, 2.1, 0.05, 2.6, white);
    for (let a = 0; a < 4; a++) for (let b = 0; b < 5; b++) { const hot = a === 2 && b === 1; dec(0, s.x + (a - 1.5) * 0.44, y + 0.08 + (hot ? 0.2 : 0), (b - 2) * 0.44, 0.36, hot ? 0.5 : 0.06, 0.36, hot ? clay : teal, hot ? 0.9 : 0); } }
  // step 2: one workflow, shipped
  const docs = [];
  const miniLine = (k, x, y, z, len) => {
    dec(k, x, y + 0.2, z, len, 0.1, 0.62, ink);
    for (const dz of [-0.42, 0.42]) dec(k, x, y + 0.5, z + dz, 0.14, 0.9, 0.14, white);
    dec(k, x, y + 1.0, z, 0.2, 0.14, 1.0, clay);
    dec(k, x, y + 0.86, z, 0.1, 0.06, 0.6, lin('#fff0c2'), 1.2);
    for (let d = 0; d < 2; d++) docs.push({ o: dec(k, x, y + 0.28, z, 0.34, 0.03, 0.46, white), x0: x - len / 2 + 0.2, len: len - 0.4, ph: d / 2 + R() * 0.3 });
  };
  miniLine(1, steps[1].x, steps[1].top, 0, 3.2);
  // step 3: more, once the first has earned it
  for (const z of [-1.35, 0, 1.35]) miniLine(2, steps[2].x, steps[2].top, z, 3.8);
  hideRest(W, L);
  for (let n = 0; n < CORE_N; n++) { W.put(n, 0, 3, 0, 0.2, 0.2, 0.2, clay, 0.55); W.h[n] = 0.3; W.k[n] = 0.7 + R() * 0.2; }
  W.update = (t, local) => {
    const f = sstep(0.28, 0.4, local) + sstep(0.61, 0.73, local);
    steps.forEach((st, k) => {
      const reach = clamp(f - k + 1), act = Math.max(0, 1 - Math.abs(f - k));
      const col = mix3(mix3(stone, green, reach), bright, act * 0.45), lift = act * 0.14;
      for (const c of st.cubes) { W.C(c.i, [col[0] * c.v, col[1] * c.v, col[2] * c.v]); W.P(c.i, c.x, c.y + lift, c.z); }
      const grow = k === 0 ? 1 : sstep(0.15, 1, reach);
      for (const o of st.decor) { W.S(o.i, o.sx * grow, o.sy * grow, o.sz * grow); W.P(o.i, o.x, o.y + lift, o.z); W.g[o.i] = o.g * grow; }
    });
    for (const d of docs) { const u = (d.ph + t * 0.22) % 1, s = Math.sin(u * Math.PI); W.p[d.o.i * 3] = d.x0 + d.len * u; W.s[d.o.i * 3] *= Math.min(1, s * 4); W.s[d.o.i * 3 + 2] *= Math.min(1, s * 4); }
    const k0 = Math.floor(clamp(f, 0, 1.999)), u = f - k0, a = steps[k0], b = steps[k0 + 1] || a;
    const mx = lerp(a.x, b.x, u), my = lerp(a.top, b.top, u) + 1.9 + Math.sin(u * Math.PI) * 1.4 + Math.sin(t * 1.3) * 0.1;
    _Q.setFromEuler(new THREE.Euler(t * 0.5, t * 0.7, 0));
    for (let n = 0; n < CORE_N; n++) {
      _V.set((n % 3 - 1) * 0.25, (((n / 3) | 0) % 3 - 1) * 0.25, (((n / 9) | 0) - 1) * 0.25).applyQuaternion(_Q);
      W.P(n, mx + _V.x, my + _V.y, _V.z); W.Q(n, _Q);
    }
  };
  W.update(0, 0);
  return W;
}

/* ============================================================
   WORLD 8  The envelope. The one thing this page asks for.
   ============================================================ */
function worldLetter() {
  const W = new World(), R = rng(401), L = pool(LINE0, LINE_N);
  const P = 0.44, topY = (GZ * P) / 2, halfW = (GX * P) / 2;
  const green = lin('#55805e'), seam = lin('#456c4e'), flapC = lin('#63906b'), flapE = lin('#4b7454');
  const paper = lin('#fffdf6'), ink = lin('#3a473d'), clay = lin('#d9521f');
  const parts = []; // {i, x,y,z, hinge:boolean} in the envelope's own frame
  const add = (i, x, y, z, hinge, k) => { parts.push({ i, x, y, z, hinge }); W.k[i] = k; };
  for (let cx = 0; cx < GX; cx++) for (let cz = 0; cz < GZ; cz++) {
    const i = TILE0 + cx * GZ + cz, x = (cx - (GX - 1) / 2) * P, y = (cz - (GZ - 1) / 2) * P;
    const u = Math.abs(x) / halfW, v = (y + topY) / (2 * topY), onSeam = Math.abs(v - (1 - u) * 0.6) < 0.05;
    W.put(i, x, y, 0.06, 0.445, 0.445, 0.08, onSeam ? seam : mix3(green, seam, R() * 0.12));
    add(i, x, y, 0.06, false, (v * 0.7) + R() * 0.15);
  }
  [22, 20, 16, 14, 12, 8, 6, 2].forEach((n, r) => {
    for (let c = 0; c < n; c++) {
      const i = L.next(), x = (c - (n - 1) / 2) * P, d = (r + 0.5) * P, edge = c === 0 || c === n - 1 || r === 7;
      W.put(i, x, topY - d, 0.16, 0.445, 0.445, 0.06, edge ? flapE : flapC);
      add(i, x, -d, 0.18, true, 0.75 + R() * 0.2);
    }
  });
  const letter = L.next(); W.put(letter, 0, 0, -0.05, 8.9, 5.4, 0.04, paper); W.k[letter] = 0.5;
  const bars = [[6.8, 1.9], [6.2, 1.4], [6.6, 0.9], [5.2, 0.4], [6.4, -0.1], [3.0, -0.6]].map(([len, y]) => {
    const i = L.next(); W.put(i, 0, 0, 0, len, 0.13, 0.02, ink); W.k[i] = 0.55; return { i, x: -3.5 + len / 2, y };
  });
  hideRest(W, L);
  const seal = [];
  for (let n = 0; n < CORE_N; n++) {
    const ring = n === 0 ? 0 : n < 9 ? 1 : 2, a = ring === 1 ? ((n - 1) / 8) * TAU : ((n - 9) / 18) * TAU, r = ring * 0.27;
    W.put(n, 0, 0, 0, 0.22, 0.22, 0.12, clay, 0.3); W.h[n] = 0.3; W.k[n] = 0.9;
    seal.push({ i: n, x: Math.cos(a) * r, d: 3.05 + Math.sin(a) * r });
  }
  const QG = new THREE.Quaternion(), QH = new THREE.Quaternion(), QT = new THREE.Quaternion(), V = new THREE.Vector3();
  W.update = (t, local) => {
    const open = sstep(0.12, 0.7, local), rise = sstep(0.34, 0.95, local), phi = -open * 3.3;
    QG.setFromEuler(new THREE.Euler(-0.16, Math.sin(t * 0.5) * 0.09, 0, 'YXZ'));
    QH.setFromAxisAngle(XA, phi); QT.copy(QG).multiply(QH);
    const cy = 4.3 + Math.sin(t * 0.8) * 0.1, c = Math.cos(phi), s = Math.sin(phi);
    const place = (i, x, y, z, q) => { V.set(x, y, z).applyQuaternion(QG); W.P(i, V.x, cy + V.y, V.z); W.Q(i, q); };
    for (const o of parts) {
      if (!o.hinge) { place(o.i, o.x, o.y, o.z, QG); continue; }
      place(o.i, o.x, topY + o.y * c - o.z * s, -0.02 + o.y * s + o.z * c, QT);
    }
    for (const o of seal) { const y = -o.d, z = 0.27; place(o.i, o.x, topY + y * c - z * s, -0.02 + y * s + z * c, QT); W.g[o.i] = 0.28 + 0.1 * Math.sin(t * 2); }
    const ly = -0.25 + rise * 3.0;
    place(letter, 0, ly, -0.05, QG);
    for (const b of bars) place(b.i, b.x, ly + b.y, 0, QG);
  };
  W.update(0, 0);
  return W;
}

/* ---------- environment and camera per world ---------- */
const ENV = [
  { top: '#070B18', bot: '#131A36', spot: '#1e2f6e', spotI: 0.6, sky: '#9fb1ff', gnd: '#141a38', hemi: 1.1, key: '#e3e9ff', keyI: 3.4, kaz: -50, kel: 52, sh: 0.55, shc: '#02030a', tone: 'dark' },
  { top: '#051617', bot: '#0C2A29', spot: '#10504a', spotI: 0.5, sky: '#8fd8c8', gnd: '#06201f', hemi: 1.2, key: '#e6fff6', keyI: 3.0, kaz: -35, kel: 58, sh: 0.5, shc: '#010807', tone: 'dark' },
  { top: '#0A1C48', bot: '#153273', spot: '#2b55b8', spotI: 0.5, sky: '#a9c4ff', gnd: '#0b1d4a', hemi: 1.6, key: '#ffffff', keyI: 3.8, kaz: -40, kel: 50, sh: 0.45, shc: '#040c26', tone: 'dark' },
  { top: '#F4BE97', bot: '#FBE7CF', spot: '#fff3de', spotI: 0.45, sky: '#ffe9d2', gnd: '#e8a77c', hemi: 2.0, key: '#fff0d8', keyI: 4.2, kaz: 60, kel: 26, sh: 0.34, shc: '#7a3a1c', tone: 'light' },
  { top: '#0B1528', bot: '#22395C', spot: '#3a5b8f', spotI: 0.45, sky: '#8fa9d8', gnd: '#131f38', hemi: 1.2, key: '#b9c8ee', keyI: 2.4, kaz: -60, kel: 35, sh: 0.45, shc: '#03060f', tone: 'dark' },
  { top: '#1E0F2B', bot: '#3A1F4A', spot: '#5b2f72', spotI: 0.5, sky: '#e2c8ff', gnd: '#2a1438', hemi: 1.7, key: '#fff1f6', keyI: 3.6, kaz: -30, kel: 40, sh: 0.4, shc: '#0d0414', tone: 'dark' },
  { top: '#173021', bot: '#2C5238', spot: '#3f7350', spotI: 0.5, sky: '#d8f0d4', gnd: '#16301f', hemi: 1.7, key: '#fffbe8', keyI: 3.8, kaz: -45, kel: 48, sh: 0.42, shc: '#06140b', tone: 'dark' },
  { top: '#F0CF7A', bot: '#F8ECC6', spot: '#fff7dc', spotI: 0.45, sky: '#fff3cf', gnd: '#d9b45c', hemi: 2.0, key: '#fff6de', keyI: 4.0, kaz: -50, kel: 40, sh: 0.3, shc: '#6b4a0c', tone: 'light' },
  { top: '#E3E8D8', bot: '#F1F2EC', spot: '#ffffff', spotI: 0.4, sky: '#ffffff', gnd: '#cfd6c2', hemi: 2.1, key: '#fffdf5', keyI: 3.8, kaz: -35, kel: 50, sh: 0.25, shc: '#2a3a2c', tone: 'light' },
].map((e) => ({ ...e, top: srgb(e.top), bot: srgb(e.bot), topL: oklch(srgb(e.top)), botL: oklch(srgb(e.bot)), spot: srgb(e.spot), sky: lin(e.sky), gnd: lin(e.gnd), key: lin(e.key), shc: lin(e.shc) }));

// az/el in degrees, R = radius the framing must contain, t = look-at target, spin = degrees of orbit across the hold
const CAM = [
  { az: 32, el: 16, R: 8.2, t: [0, 2.9, 0], spin: 16, m: { R: 7.2 } },
  { az: 26, el: 44, R: 12.6, t: [0, 0.9, 0], spin: 12, m: { az: 68, el: 40, R: 10.2, spin: 16 } },
  { az: 24, el: 24, R: 9.6, t: [0, 1.5, 0], spin: 16, m: { az: 50, R: 8.3, spin: 20 } },
  { az: -20, el: 20, R: 9.6, t: [0.4, 1.5, 0.6], spin: -14, m: { az: -50, R: 8.5, spin: -20 } },
  { az: 38, el: 7, R: 7.4, t: [0, 6.0, 0], spin: 44 },
  { az: -16, el: 3, R: 6.9, t: [0.9, 5.2, 0], spin: 14 },
  { az: 18, el: 25, R: 8.5, t: [0, 1.6, 0], spin: 14, m: { az: 48, R: 7.6 } },
  { az: 32, el: 22, R: 8.6, t: [-0.5, 2.0, 0], spin: -16, m: { R: 7.9 } },
  { az: -12, el: 5, R: 6.6, t: [0, 5.6, 0], spin: 10, m: { R: 6.1 } },
];
const CAM_PHONE = CAM.map((c) => ({ ...c, ...(c.m || {}) }));

/* ============================================================
   Boot
   ============================================================ */
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
} catch (e) {
  renderer = null; // no WebGL: the static page is already complete
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(26, 1, 1, 400);
const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
const key = new THREE.DirectionalLight(0xffffff, 1);
key.castShadow = true;
scene.add(hemi, key, key.target);

const WORLDS = (() => {
  const idle = worldIdle();
  return [idle, worldSurvey(idle), worldLine(), worldTeam(), worldTower(), worldTalk(), worldClients(), worldSteps(), worldLetter()];
})();

// per-block flight character
const FLY = (() => {
  const R = rng(999), lift = new Float32Array(N), tum = new Float32Array(N), ax = new Float32Array(N * 3), drop = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    lift[i] = 0.5 + R() * 2.2; tum[i] = (R() - 0.5) * 5; drop[i] = R();
    const a = R() * TAU, z = R() * 2 - 1, r = Math.sqrt(1 - z * z);
    ax[i * 3] = r * Math.cos(a); ax[i * 3 + 1] = z; ax[i * 3 + 2] = r * Math.sin(a);
  }
  return { lift, tum, ax, drop };
})();

/* ---------- meshes ---------- */
const blockGeo = new THREE.BoxGeometry(1, 1, 1);
const aGlow = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
aGlow.setUsage(THREE.DynamicDrawUsage);
blockGeo.setAttribute('aGlow', aGlow);
const blockMat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 });
blockMat.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vGlow;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow;');
};
const blocks = new THREE.InstancedMesh(blockGeo, blockMat, N);
blocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
blocks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
blocks.instanceColor.setUsage(THREE.DynamicDrawUsage);
blocks.castShadow = true; blocks.receiveShadow = true; blocks.frustumCulled = false;
scene.add(blocks);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.4 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
scene.add(ground);

const haloGeo = new THREE.InstancedBufferGeometry();
{
  const pg = new THREE.PlaneGeometry(1, 1);
  haloGeo.index = pg.index; haloGeo.setAttribute('position', pg.getAttribute('position')); haloGeo.setAttribute('uv', pg.getAttribute('uv'));
}
const hCenter = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
const hSize = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
const hColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
[hCenter, hSize, hColor].forEach((a) => a.setUsage(THREE.DynamicDrawUsage));
haloGeo.setAttribute('aCenter', hCenter); haloGeo.setAttribute('aSize', hSize); haloGeo.setAttribute('aColor', hColor);
haloGeo.instanceCount = 0;
const haloMat = new THREE.ShaderMaterial({
  transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uGain: { value: 1 } },
  vertexShader: `attribute vec3 aCenter; attribute float aSize; attribute vec3 aColor; varying vec2 vUv; varying vec3 vCol;
    void main(){ vUv = uv; vCol = aColor; vec4 mv = modelViewMatrix * vec4(aCenter, 1.0); mv.xy += position.xy * aSize; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float uGain; varying vec2 vUv; varying vec3 vCol;
    void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.4); gl_FragColor = vec4(vCol * uGain, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
});
const halos = new THREE.Mesh(haloGeo, haloMat);
halos.frustumCulled = false; halos.renderOrder = 10;
scene.add(halos);

const bgMat = new THREE.ShaderMaterial({
  depthTest: false, depthWrite: false,
  uniforms: { uTop: { value: new THREE.Vector3() }, uBot: { value: new THREE.Vector3() }, uSpot: { value: new THREE.Vector3() }, uSpotPos: { value: new THREE.Vector2(0.5, 0.5) }, uSpotR: { value: 0.5 }, uAspect: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
  fragmentShader: `uniform vec3 uTop, uBot, uSpot; uniform vec2 uSpotPos; uniform float uSpotR, uAspect; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 c = mix(uBot, uTop, smoothstep(0.0, 1.0, vUv.y));
      vec2 d = (vUv - uSpotPos) * vec2(uAspect, 1.0);
      c += uSpot * exp(-dot(d, d) / (uSpotR * uSpotR));
      c += (hash(gl_FragCoord.xy) - 0.5) / 160.0;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
bg.frustumCulled = false; bg.renderOrder = -10;
scene.add(bg);

/* ---------- blend two worlds into the instance buffers ---------- */
const STAG = 0.46;
const mtx = blocks.instanceMatrix.array, icol = blocks.instanceColor.array;
function blend(A, B, p, intro) {
  const ap = A.p, aq = A.q, as = A.s, ac = A.c, ag = A.g;
  const bp = B.p, bq = B.q, bs = B.s, bc = B.c, bg_ = B.g, bk = B.k, ah = A.h, bh = B.h;
  const { lift, tum, ax, drop } = FLY;
  let hn = 0;
  for (let i = 0; i < N; i++) {
    const i3 = i * 3, i4 = i * 4;
    let e = 0;
    if (p > 0) { const t = clamp((p - bk[i] * STAG) / (1 - STAG)); e = ease(t); }
    let sax = as[i3], say = as[i3 + 1], saz = as[i3 + 2];
    const sbx = bs[i3], sby = bs[i3 + 1], sbz = bs[i3 + 2];
    let pax = ap[i3], pay = ap[i3 + 1], paz = ap[i3 + 2], pbx = bp[i3], pby = bp[i3 + 1], pbz = bp[i3 + 2];
    const aHid = sax + say + saz < 1e-3, bHid = sbx + sby + sbz < 1e-3;
    if (aHid && bHid) { mtx.fill(0, i * 16, i * 16 + 15); mtx[i * 16 + 15] = 1; aGlow.array[i] = 0; continue; }
    // A block that changes size class (a slat becoming a tower core) does not fly: it sinks
    // away where it was and rises where it is going, so nothing huge tumbles across the stage.
    let swap = 1;
    if (!aHid && !bHid) {
      const ba = Math.max(sax, say, saz), bb = Math.max(sbx, sby, sbz);
      if (ba > bb * 3.2 || bb > ba * 3.2) {
        if (e < 0.5) { swap = 1 - e * 2; e = 0; } else { swap = e * 2 - 1; e = 1; }
        swap = swap * swap * (3 - 2 * swap);
      }
    }
    // a block with nothing to do in one world appears or leaves in place
    if (aHid) { pax = pbx; pay = pby - 0.7; paz = pbz; } else if (bHid) { pbx = pax; pby = pay - 0.7; pbz = paz; }
    const dx = pbx - pax, dy = pby - pay, dz = pbz - paz, d2 = dx * dx + dy * dy + dz * dz;
    let x = pax + dx * e, y = pay + dy * e, z = paz + dz * e;
    let qx, qy, qz, qw;
    if (aHid) { qx = bq[i4]; qy = bq[i4 + 1]; qz = bq[i4 + 2]; qw = bq[i4 + 3]; }
    else if (bHid) { qx = aq[i4]; qy = aq[i4 + 1]; qz = aq[i4 + 2]; qw = aq[i4 + 3]; }
    else {
      let bx = bq[i4], by = bq[i4 + 1], bz = bq[i4 + 2], bw = bq[i4 + 3];
      if (aq[i4] * bx + aq[i4 + 1] * by + aq[i4 + 2] * bz + aq[i4 + 3] * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; }
      qx = aq[i4] + (bx - aq[i4]) * e; qy = aq[i4 + 1] + (by - aq[i4 + 1]) * e; qz = aq[i4 + 2] + (bz - aq[i4 + 2]) * e; qw = aq[i4 + 3] + (bw - aq[i4 + 3]) * e;
      if (d2 > 0.3 && e > 0 && e < 1) {
        const arc = Math.sin(Math.PI * e), far = Math.min(1, Math.sqrt(d2) / 5);
        y += arc * lift[i] * far;
        const ha = arc * tum[i] * far * 0.5, s = Math.sin(ha), c = Math.cos(ha), tx = ax[i3] * s, ty = ax[i3 + 1] * s, tz = ax[i3 + 2] * s;
        const nx = c * qx + tx * qw + ty * qz - tz * qy, ny = c * qy + ty * qw + tz * qx - tx * qz, nz = c * qz + tz * qw + tx * qy - ty * qx, nw = c * qw - tx * qx - ty * qy - tz * qz;
        qx = nx; qy = ny; qz = nz; qw = nw;
      }
      const il = 1 / Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw); qx *= il; qy *= il; qz *= il; qw *= il;
    }
    let sx = sax + (sbx - sax) * e, sy = say + (sby - say) * e, sz = saz + (sbz - saz) * e;
    if (swap < 1) { sx *= swap; sy *= swap; sz *= swap; y -= (1 - swap) * Math.min(1.2, sy * 0.5 + 0.2); }
    if (intro < 1) {
      const u = ease(clamp((intro - drop[i] * 0.55) / 0.45));
      y += (1 - u) * (3 + drop[i] * 9); sx *= u; sy *= u; sz *= u;
    }
    const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz, xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2, wx = qw * x2, wy = qw * y2, wz = qw * z2;
    const o = i * 16;
    mtx[o] = (1 - (yy + zz)) * sx; mtx[o + 1] = (xy + wz) * sx; mtx[o + 2] = (xz - wy) * sx; mtx[o + 3] = 0;
    mtx[o + 4] = (xy - wz) * sy; mtx[o + 5] = (1 - (xx + zz)) * sy; mtx[o + 6] = (yz + wx) * sy; mtx[o + 7] = 0;
    mtx[o + 8] = (xz + wy) * sz; mtx[o + 9] = (yz - wx) * sz; mtx[o + 10] = (1 - (xx + yy)) * sz; mtx[o + 11] = 0;
    mtx[o + 12] = x; mtx[o + 13] = y; mtx[o + 14] = z; mtx[o + 15] = 1;
    const r = ac[i3] + (bc[i3] - ac[i3]) * e, g = ac[i3 + 1] + (bc[i3 + 1] - ac[i3 + 1]) * e, b = ac[i3 + 2] + (bc[i3 + 2] - ac[i3 + 2]) * e;
    icol[i3] = r; icol[i3 + 1] = g; icol[i3 + 2] = b;
    const gl = ((aHid ? 0 : ag[i]) + ((bHid ? 0 : bg_[i]) - (aHid ? 0 : ag[i])) * e) * swap;
    aGlow.array[i] = gl;
    const big = Math.max(sx, sy, sz);
    if (gl > 0.08 && big > 0.02) {
      const h3 = hn * 3, m = Math.min(1.6, gl) * 0.5 * (ah[i] + (bh[i] - ah[i]) * e);
      hCenter.array[h3] = x; hCenter.array[h3 + 1] = y; hCenter.array[h3 + 2] = z;
      hSize.array[hn] = Math.min(4.2, big * 2.0 + 0.8) * (0.85 + Math.min(1.6, gl) * 0.35);
      hColor.array[h3] = r * m; hColor.array[h3 + 1] = g * m; hColor.array[h3 + 2] = b * m;
      hn++;
    }
  }
  haloGeo.instanceCount = hn;
  blocks.instanceMatrix.needsUpdate = true; blocks.instanceColor.needsUpdate = true; aGlow.needsUpdate = true;
  hCenter.needsUpdate = hSize.needsUpdate = hColor.needsUpdate = true;
}

/* ---------- environment + camera for a blend ---------- */
const tgt = new THREE.Vector3();
let floorTone = [0, 0, 0]; // the colour behind the words right now
function setEnv(a, b, u, glowGain) {
  const A = ENV[a], B = ENV[b], U = bgMat.uniforms;
  const bot = floorTone = mixLch(A.botL, B.botL, u);
  U.uTop.value.fromArray(mixLch(A.topL, B.topL, u)); U.uBot.value.fromArray(bot);
  const sp = mix3(A.spot, B.spot, u), si = lerp(A.spotI, B.spotI, u) * (1 - 0.6 * Math.sin(Math.PI * u));
  U.uSpot.value.set((sp[0] - bot[0]) * si, (sp[1] - bot[1]) * si, (sp[2] - bot[2]) * si);
  hemi.color.fromArray(mix3(A.sky, B.sky, u)); hemi.groundColor.fromArray(mix3(A.gnd, B.gnd, u)); hemi.intensity = lerp(A.hemi, B.hemi, u);
  key.color.fromArray(mix3(A.key, B.key, u)); key.intensity = lerp(A.keyI, B.keyI, u);
  const kaz = lerp(A.kaz, B.kaz, u) * DEG, kel = lerp(A.kel, B.kel, u) * DEG;
  key.position.set(tgt.x + 50 * Math.cos(kel) * Math.sin(kaz), 50 * Math.sin(kel), tgt.z + 50 * Math.cos(kel) * Math.cos(kaz));
  key.target.position.set(tgt.x, 0, tgt.z);
  ground.material.opacity = lerp(A.sh, B.sh, u); ground.material.color.fromArray(mix3(A.shc, B.shc, u));
  haloMat.uniforms.uGain.value = glowGain;
}
const FOVT = Math.tan((26 * DEG) / 2);
function setCam(a, b, u, la, lb, time, view, focus, sway, cams = CAM) {
  const A = cams[a], B = cams[b];
  const az = (lerp(A.az + A.spin * (la - 0.5), B.az + B.spin * (lb - 0.5), u) + Math.sin(time * 0.13) * 1.6) * DEG + sway.x;
  const el = clamp((lerp(A.el, B.el, u) + Math.sin(time * 0.1) * 0.6) * DEG + sway.y, 0.02, 1.4);
  const R = lerp(A.R, B.R, u);
  tgt.set(lerp(A.t[0], B.t[0], u), lerp(A.t[1], B.t[1], u), lerp(A.t[2], B.t[2], u));
  const fit = Math.min(focus.h / view.h, (focus.w / view.w) * (view.w / view.h));
  const d = (R * 1.06) / (FOVT * Math.max(0.12, fit));
  camera.position.set(tgt.x + d * Math.cos(el) * Math.sin(az), tgt.y + d * Math.sin(el), tgt.z + d * Math.cos(el) * Math.cos(az));
  camera.lookAt(tgt);
  camera.aspect = view.w / view.h;
  camera.setViewOffset(view.w, view.h, view.w / 2 - focus.x, view.h / 2 - focus.y, view.w, view.h);
  bgMat.uniforms.uSpotPos.value.set(focus.x / view.w, 1 - (focus.y + focus.h * 0.12) / view.h);
  bgMat.uniforms.uSpotR.value = 0.34 * Math.max(0.55, Math.min(1.4, focus.w / view.h));
  bgMat.uniforms.uAspect.value = view.w / view.h;
}
function shadowSetup(size) {
  const c = key.shadow.camera;
  c.left = -19; c.right = 19; c.top = 19; c.bottom = -19; c.near = 5; c.far = 120; c.updateProjectionMatrix();
  key.shadow.mapSize.set(size, size); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03; key.shadow.radius = 3;
}

/* ============================================================
   Reduced motion: no stage. Render one still per world into the page.
   ============================================================ */
function renderStills() {
  const w = 1200, h = 860;
  shadowSetup(2048);
  renderer.setPixelRatio(1); renderer.setSize(w, h, false);
  renderer.setClearColor(0x000000, 0);
  bg.visible = false;
  // frame tighter than the live stage does: a still has no camera move to leave room for
  const view = { w, h }, focus = { x: w / 2, y: h / 2, w: w * 1.5, h: h * 1.25 }, sway = { x: 0, y: 0 };
  document.querySelectorAll('figure.still[data-scene]').forEach((fig) => {
    const s = +fig.dataset.scene, Wd = WORLDS[s];
    if (Wd.update) Wd.update(2.6, 0.66);
    blend(Wd, Wd, 0, 1);
    setCam(s, s, 0, 0.5, 0.5, 0, view, focus, sway);
    setEnv(s, s, 0, 1);
    halos.visible = ENV[s].tone !== 'light'; // additive glow has nothing to add to on a pale page
    renderer.render(scene, camera);
    const img = new Image();
    img.alt = ''; img.width = w; img.height = h; img.src = canvas.toDataURL('image/png');
    fig.insertBefore(img, fig.firstChild);
  });
  root.classList.add('stills');
  renderer.dispose();
}

/* ============================================================
   The pinned stage
   ============================================================ */
function runStage() {
  const beats = [...document.querySelectorAll('.beat')].map((el) => ({
    el, pin: el.querySelector('.pin'), copy: el.querySelector('.copy'),
    scenes: el.dataset.scenes.split(',').map(Number),
    steps: [...el.querySelectorAll('[data-r],[data-rm]')].map((n) => ({ n, r: n.dataset.r ? n.dataset.r.split(',').map(Number) : null, rm: n.dataset.rm ? n.dataset.rm.split(',').map(Number) : null })),
  }));
  const captions = [...document.querySelectorAll('figure.still[data-scene]')].reduce((m, f) => { m[+f.dataset.scene] = f.textContent.trim(); return m; }, {});
  const capEl = document.getElementById('caption'), progEl = document.querySelector('#progress i'), cueEl = document.querySelector('.cue');
  const railLinks = [...document.querySelectorAll('.rail a')], lastBeat = beats[beats.length - 1];
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  const view = { w: 1, h: 1 };
  let vh = 1, mobile = false, KF = [], holds = [], focusOf = [], beatOf = [], docMax = 1, dpr = 1, snap = true;
  let scrollY = window.scrollY, ySmooth = scrollY;
  const phone = matchMedia('(max-width: 56rem)');

  function layout() {
    view.w = canvas.clientWidth; view.h = canvas.clientHeight;
    mobile = phone.matches;
    dpr = Math.min(window.devicePixelRatio || 1, 2) * quality;
    renderer.setPixelRatio(dpr); renderer.setSize(view.w, view.h, false);
    vh = beats[0].pin.offsetHeight;
    const sy = window.scrollY;
    KF = []; holds = []; focusOf = []; beatOf = [];
    beats.forEach((b, bi) => {
      b.T = b.el.getBoundingClientRect().top + sy; b.L = b.el.offsetHeight - vh;
      const c = b.copy, pad = mobile ? 0 : 28;
      // on a phone the stage owns whatever the words leave free, and the words change height as steps swap
      b.dyn = mobile && b.steps.some((st) => st.rm && !st.r);
      if (b.dyn) b.steps.forEach((st) => { st.top = c.offsetTop + st.n.offsetTop; });
      const f = mobile
        ? { x0: 0, x1: view.w, y0: 58, y1: Math.max(view.h * 0.3, c.offsetTop - 6) }
        : { x0: c.offsetLeft + c.offsetWidth - pad, x1: view.w - 40, y0: 64, y1: vh - 48 };
      const F = { x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2, w: f.x1 - f.x0, h: f.y1 - f.y0 };
      const n = b.scenes.length, seg = b.L / n;
      b.scenes.forEach((s, j) => {
        const h0 = b.T + j * seg + (j ? seg * 0.17 : 0), h1 = b.T + (j + 1) * seg - (j < n - 1 ? seg * 0.17 : 0);
        // the stage arrives a little before the words do, and leaves as they leave
        const a = j === 0 ? b.T - vh * 0.12 : h0, z = j === n - 1 ? b.T + b.L + vh * 0.04 : h1;
        KF.push({ y: a, P: s }, { y: z, P: s });
        holds[s] = [bi === 0 ? b.T : a, z]; focusOf[s] = F; beatOf[s] = b;
      });
    });
    docMax = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    shadowSetup(mobile ? 1024 : 2048);
    snap = true;
  }
  const PofY = (y) => {
    if (y <= KF[0].y) return KF[0].P;
    for (let i = 1; i < KF.length; i++) if (y <= KF[i].y) { const a = KF[i - 1], b = KF[i]; return b.y === a.y ? b.P : a.P + ((y - a.y) / (b.y - a.y)) * (b.P - a.P); }
    return KF[KF.length - 1].P;
  };
  const localOf = (s, y) => clamp((y - holds[s][0]) / (holds[s][1] - holds[s][0]));

  /* words: each beat fades as its pin arrives and leaves, steps swap inside it */
  function words(y) {
    const last = beats.length - 1;
    beats.forEach((b, bi) => {
      const fin = bi === 0 ? 1 : sstep(b.T - vh * 0.24, b.T - vh * 0.02, y);
      const fout = bi === last ? 1 : 1 - sstep(b.T + b.L + vh * 0.01, b.T + b.L + vh * 0.2, y);
      const o = fin * fout;
      if (b._o !== o) { b._o = o; b.copy.style.opacity = o.toFixed(3); b.copy.style.pointerEvents = o < 0.5 ? 'none' : ''; }
      if (o < 0.01 || !b.steps.length) return;
      const p = (y - b.T) / b.L;
      for (const st of b.steps) {
        const r = st.r || (mobile ? st.rm : null);
        if (!r) { if (st._on !== -1) { st._on = -1; st.n.style.opacity = ''; st.n.style.transform = ''; st.n.style.pointerEvents = ''; } continue; }
        const f = 0.035, vin = r[0] <= 0 ? 1 : sstep(r[0], r[0] + f, p), vout = r[1] >= 1 ? 1 : 1 - sstep(r[1] - f, r[1], p);
        const v = vin * vout, ty = (1 - vin) * 16 - (1 - vout) * 16;
        if (st._on === v) continue;
        st._on = v; st.n.style.opacity = v.toFixed(3); st.n.style.transform = `translate3d(0,${ty.toFixed(1)}px,0)`; st.n.style.pointerEvents = v < 0.5 ? 'none' : '';
      }
    });
  }
  let shown = -1, capTimer = 0;
  function chrome(P, y) {
    const s = clamp(Math.round(P), 0, WORLDS.length - 1);
    if (s !== shown) {
      shown = s;
      root.dataset.tone = ENV[s].tone;
      const bi = beats.findIndex((b) => b.scenes.includes(s));
      railLinks.forEach((a, i) => a.classList.toggle('on', i === bi));
      capEl.classList.remove('on'); clearTimeout(capTimer);
      capTimer = setTimeout(() => { capEl.textContent = captions[s] || ''; capEl.classList.add('on'); }, 380);
      if (themeMeta) themeMeta.content = '#' + ENV[s].top.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
    }
    progEl.style.setProperty('--p', clamp(y / docMax).toFixed(4));
    const cueO = 1 - sstep(0, vh * 0.22, y);
    if (cueEl && cueEl._o !== cueO) { cueEl._o = cueO; cueEl.style.opacity = cueO.toFixed(3); }
    capEl.classList.toggle('end', y > docMax - 70); // the footer owns the last strip of the page
  }

  /* pointer: a small lean of the camera on devices that have one */
  const sway = { x: 0, y: 0 }, swayT = { x: 0, y: 0 };
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    window.addEventListener('pointermove', (e) => { swayT.x = (e.clientX / window.innerWidth - 0.5) * -0.16; swayT.y = (e.clientY / window.innerHeight - 0.5) * 0.07; }, { passive: true });
  }

  let quality = 1, slow = 0, fast = 0, scrim = '';
  let t0 = performance.now(), last = t0, intro = 0, visible = true, raf = 0;
  const focus = { x: 0, y: 0, w: 1, h: 1 }, focusT = { x: 0, y: 0, w: 1, h: 1 }, shot = { x: 0, y: 0, w: 1, h: 1 };
  const focusFor = (s, y) => {
    const F = focusOf[s], b = beatOf[s];
    if (!b.dyn) return F;
    let sv = 0, st = 0;
    for (const o of b.steps) { const v = o._on > 0 ? o._on : 0; sv += v; st += v * o.top; }
    const top = sv > 0.01 ? st / sv : (y < b.T ? b.steps[0] : b.steps[b.steps.length - 1]).top;
    const y1 = Math.max(view.h * 0.3, top - 6);
    return { x: F.x, w: F.w, y: (58 + y1) / 2, h: y1 - 58 };
  };
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const time = (now - t0) / 1000;
    ySmooth += (scrollY - ySmooth) * (1 - Math.exp(-dt * 7.5));
    if (Math.abs(scrollY - ySmooth) < 0.05) ySmooth = scrollY;
    sway.x += (swayT.x - sway.x) * (1 - Math.exp(-dt * 3)); sway.y += (swayT.y - sway.y) * (1 - Math.exp(-dt * 3));
    intro = Math.min(1, intro + dt / 2.1);

    const P = PofY(ySmooth), a = Math.min(WORLDS.length - 1, Math.floor(P)), b = Math.min(WORLDS.length - 1, a + 1), p = P - a;
    const A = WORLDS[a], B = WORLDS[b], la = localOf(a, ySmooth), lb = localOf(b, ySmooth);
    if (A.update) A.update(time, la);
    if (p > 0 && B !== A && B.update) B.update(time, lb);
    blend(A, p > 0 ? B : A, p, intro);
    const u = sstep(0, 1, p), FA = focusFor(a, ySmooth), FB = focusFor(b, ySmooth);
    focusT.x = lerp(FA.x, FB.x, u); focusT.y = lerp(FA.y, FB.y, u); focusT.w = lerp(FA.w, FB.w, u); focusT.h = lerp(FA.h, FB.h, u);
    const fk = snap ? 1 : 1 - Math.exp(-dt * 6); snap = false;
    focus.x += (focusT.x - focus.x) * fk; focus.y += (focusT.y - focus.y) * fk; focus.w += (focusT.w - focus.w) * fk; focus.h += (focusT.h - focus.h) * fk;
    // past the last pin the page scrolls its footer in; the stage rides up with the words
    const over = Math.max(0, scrollY - (lastBeat.T + lastBeat.L));
    shot.x = focus.x; shot.w = focus.w; shot.h = Math.max(view.h * 0.2, focus.h - over * (mobile ? 1 : 0.5)); shot.y = focus.y - over * (mobile ? 0.5 : 0.75);
    setCam(a, b, u, la, lb, time, view, shot, sway, mobile ? CAM_PHONE : CAM);
    const lightA = ENV[a].tone === 'light' ? 0.3 : 1, lightB = ENV[b].tone === 'light' ? 0.3 : 1;
    setEnv(a, b, u, lerp(lightA, lightB, u));
    renderer.render(scene, camera);
    if (mobile) { // the scrim under the words always matches the world behind them
      const sc = `rgba(${Math.round(floorTone[0] * 255)},${Math.round(floorTone[1] * 255)},${Math.round(floorTone[2] * 255)},.86)`;
      if (sc !== scrim) { scrim = sc; root.style.setProperty('--scrim-live', sc); }
    }

    words(scrollY); chrome(PofY(scrollY), scrollY);

    // hold a steady frame rate: step resolution down if frames run long, back up if there is room
    if (dt > 0.03) { slow++; fast = 0; } else { fast++; if (fast > 240) slow = 0; }
    if (slow > 40 && quality > 0.55) { quality = Math.max(0.55, quality - 0.15); slow = 0; layout(); }
  }
  window.addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });
  let rw = window.innerWidth, rt = 0;
  window.addEventListener('resize', () => {
    // phone URL bars resize the window on every scroll; only a real size change relays out
    if (window.innerWidth === rw && Math.abs(canvas.clientHeight - view.h) < 2) return;
    rw = window.innerWidth; clearTimeout(rt); rt = setTimeout(layout, 80);
  });
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (!visible) cancelAnimationFrame(raf); else { last = performance.now(); raf = requestAnimationFrame(frame); }
  });
  document.addEventListener('focusin', (e) => {
    const b = beats.find((x) => x.el.contains(e.target));
    if (!b) return;
    const st = b.steps.find((x) => x.n.contains(e.target)), r = st && (st.r || (mobile ? st.rm : null));
    const y = b.T + (r ? (r[0] + 0.06) * b.L : 0), on = r ? st._on > 0.9 : window.scrollY >= b.T - 2 && window.scrollY <= b.T + b.L + 2;
    if (!on) window.scrollTo(0, y);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  window.addEventListener('load', layout);

  layout();
  raf = requestAnimationFrame(frame);
  requestAnimationFrame(() => root.classList.add('stage-ready'));
  window.__stage = { WORLDS, beats, layout, state: () => ({ P: PofY(scrollY), quality, view, mobile, KF }) };
}

try {
  if (!renderer) { root.classList.remove('stage-on'); root.classList.add('stage-off'); }
  else if (REDUCED || root.classList.contains('stage-off')) renderStills();
  else runStage();
} catch (e) {
  root.classList.remove('stage-on', 'stage-ready'); root.classList.add('stage-off');
  console.error('stage failed, showing the static page', e);
}
