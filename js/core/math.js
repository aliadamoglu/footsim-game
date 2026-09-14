/* Matematik yardımcıları: vektör, rastgelelik (tohumlanabilir), yay-sönüm, easing */
(function (root) {
  const FS = (root.FS = root.FS || {});
  const M = (FS.M = {});

  // ---- Tohumlanabilir RNG (mulberry32) — headless testlerde deterministik sonuç için
  let _seed = (Date.now() ^ 0x9e3779b9) >>> 0;
  M.seed = function (s) { _seed = (s >>> 0) || 1; };
  M.random = function () {
    _seed = (_seed + 0x6d2b79f5) >>> 0;
    let t = _seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Bağımsız (global durumu bozmayan) tohumlu üreteç — fikstür çekilişi vb.
  M.seededRng = function (seed) {
    let s = (seed >>> 0) || 1;
    return function () { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  M.rand = (a, b) => a + M.random() * (b - a);
  M.randi = (a, b) => Math.floor(M.rand(a, b + 1));
  M.chance = (p) => M.random() < p;
  M.pick = (arr) => arr[Math.floor(M.random() * arr.length)];
  M.randn = function () { // Box-Muller
    let u = 0, v = 0;
    while (u === 0) u = M.random();
    while (v === 0) v = M.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  };
  M.hash = function (str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  // Tohumdan bağımsız, string-tabanlı deterministik jitter (oyuncu özellikleri için)
  M.hashRand = function (str, k) {
    let h = M.hash(str + '#' + k);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  };

  // ---- Skalar
  M.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  M.clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  M.lerp = (a, b, t) => a + (b - a) * t;
  M.invLerp = (a, b, v) => (b === a ? 0 : M.clamp01((v - a) / (b - a)));
  M.remap = (v, a, b, c, d) => M.lerp(c, d, M.invLerp(a, b, v));
  M.smoothstep = (t) => { t = M.clamp01(t); return t * t * (3 - 2 * t); };
  M.easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  M.easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  M.easeInCubic = (t) => t * t * t;
  M.easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
  M.easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  M.sigmoid = (x) => 1 / (1 + Math.exp(-x));
  M.sign = (v) => (v < 0 ? -1 : 1);

  // ---- 2B (x,z) vektör yardımcıları — sim, yatay düzlemde x/z kullanır
  M.len = (x, z) => Math.sqrt(x * x + z * z);
  M.dist = (ax, az, bx, bz) => Math.sqrt((ax - bx) * (ax - bx) + (az - bz) * (az - bz));
  M.distP = (a, b) => M.dist(a.x, a.z, b.x, b.z);
  M.norm = (x, z) => { const l = Math.sqrt(x * x + z * z) || 1; return { x: x / l, z: z / l }; };
  M.dot = (ax, az, bx, bz) => ax * bx + az * bz;
  M.angleOf = (x, z) => Math.atan2(z, x);
  M.angleDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  M.angleLerp = (a, b, t) => a + M.angleDiff(a, b) * t;
  M.rot = (x, z, ang) => { const c = Math.cos(ang), s = Math.sin(ang); return { x: x * c - z * s, z: x * s + z * c }; };
  // Noktadan doğru parçasına en yakın nokta parametresi t (0..1) ve mesafe
  M.segClosest = function (px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
    t = M.clamp01(t);
    const cx = ax + dx * t, cz = az + dz * t;
    return { t, x: cx, z: cz, d: M.dist(px, pz, cx, cz) };
  };

  // ---- Yay-sönüm (ikinci derece sistem) — kamera için "organik" takip.
  // state: {v: değer, vel}  freq: doğal frekans (Hz), zeta: sönüm oranı (1 = kritik)
  M.springStep = function (value, vel, target, dt, freq, zeta) {
    const w = 2 * Math.PI * freq;
    // yarı-örtük Euler (kararlı)
    const f = 1 + 2 * dt * zeta * w;
    const ww = w * w;
    const dtww = dt * ww;
    const det = 1 / (f + dt * dtww);
    const nv = (f * value + dt * vel + dt * dtww * target) * det;
    const nvel = (vel + dtww * (target - value)) * det;
    return [nv, nvel];
  };

  // ---- 1B gürültü (kamera el titremesi için) — birkaç sinüsün toplamı
  M.noise1 = function (t, seed) {
    const s = seed || 0;
    return (
      Math.sin(t * 0.37 + s) * 0.45 +
      Math.sin(t * 0.91 + s * 1.7) * 0.3 +
      Math.sin(t * 2.13 + s * 0.3) * 0.17 +
      Math.sin(t * 4.7 + s * 2.1) * 0.08
    );
  };

  // ---- Format
  M.pad2 = (n) => (n < 10 ? '0' + n : '' + n);
  M.fmtClock = function (sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return M.pad2(m) + ':' + M.pad2(s);
  };
})(typeof window !== 'undefined' ? window : globalThis);
