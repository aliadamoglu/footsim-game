/* Top fiziği: yerçekimi, hava direnci (kuadratik), Magnus (falso), sekme, yuvarlanma sürtünmesi,
   kale direği/üst direk çarpışması, ağ sönümlemesi. */
(function (root) {
  const FS = (root.FS = root.FS || {});
  const M = FS.M, P = FS.PITCH;
  const R = P.BALL_R;
  const G = 9.81;
  const DRAG = 0.0085;      // kuadratik hava direnci katsayısı (1/m)
  const ROLL_DECEL = 2.4;   // çim üzerinde yuvarlanma yavaşlaması (m/s^2)
  const BOUNCE = 0.52;      // dikey geri sekme oranı
  const BOUNCE_FRICTION = 0.85; // sekmede yatay hız kaybı
  const WIND_TMP = { x: 0, z: 0 };

  class Ball {
    constructor() { this.reset(0, 0); this.history = []; }
    setWeather(w) { this.weather = w || null; }
    reset(x, z) {
      this.x = x; this.y = R; this.z = z;
      this.vx = 0; this.vy = 0; this.vz = 0;
      this.spin = 0;          // yatay falso (rad/s etkisi)
      this.owner = null;      // topu süren oyuncu
      this.lastTouch = null;  // son dokunan oyuncu (deflection dahil)
      this.lastKick = null;   // son bilinçli vuruş {p, t, kind}
      this.prevTouch = null;
      this.inNet = false;
      this.rotAxis = { x: 0, y: 0, z: 1 }; this.rotSpeed = 0; // görsel dönüş
      this.airborne = false;
    }
    get speed() { return Math.sqrt(this.vx * this.vx + this.vz * this.vz); }
    get speed3() { return Math.sqrt(this.vx * this.vx + this.vy * this.vy + this.vz * this.vz); }
    isOnGround() { return this.y <= R + 0.02; }

    // Serbest top fiziği (sahip yokken)
    step(dt) {
      const W = this.weather; // hava koşulları (null → nötr)
      const wb = W ? W.ball : null;
      const rollMul = wb ? wb.roll : 1, bounceMul = wb ? wb.bounce : 1, dragMul = wb ? wb.drag : 1;
      // Yerçekimi
      this.vy -= G * dt;
      // Hava direnci
      const s3 = this.speed3;
      if (s3 > 0.01) {
        const k = 1 / (1 + DRAG * dragMul * s3 * dt); // kuadratik direncin kapalı çözümü (büyük dt'de negatif hız üretmez)
        this.vx *= k; this.vy *= k; this.vz *= k;
      }
      // Rüzgâr: uçan topu iter (yerde çok az)
      if (W && W.windSpeed >= 0.5 && FS.Weather) {
        const wa = FS.Weather.windAccel(W, this, WIND_TMP);
        this.vx += wa.x * dt; this.vz += wa.z * dt;
      }
      // Magnus: yatay hız vektörünü döndür (falso)
      if (Math.abs(this.spin) > 0.001 && s3 > 2) {
        const ang = this.spin * dt;
        const c = Math.cos(ang), s = Math.sin(ang);
        const nx = this.vx * c - this.vz * s, nz = this.vx * s + this.vz * c;
        this.vx = nx; this.vz = nz;
        this.spin *= Math.max(0, 1 - 0.6 * dt);
      }
      // Entegrasyon (önceki konum sürekli çarpışma tespiti için saklanır)
      const px0 = this.x, py0 = this.y, pz0 = this.z;
      this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;

      // Zemin
      if (this.y <= R) {
        this.y = R;
        if (this.vy < 0) {
          if (this.vy < -1.2 * (bounceMul < 0.8 ? 1.6 : 1)) { // ıslak/karlı zeminde küçük sekmeler hemen ölür
            this.vy = -this.vy * BOUNCE * bounceMul;
            this.vx *= BOUNCE_FRICTION * (bounceMul < 0.8 ? 0.92 : 1); this.vz *= BOUNCE_FRICTION * (bounceMul < 0.8 ? 0.92 : 1);
          } else this.vy = 0;
        }
        if (this.vy === 0) {
          // yuvarlanma sürtünmesi (hava: ıslak çim kaygan → küçük çarpan; kar → büyük çarpan)
          const s = this.speed;
          if (s > 0) {
            const ns = Math.max(0, s - (ROLL_DECEL * rollMul + 0.012 * s * s) * dt);
            const f = ns / s; this.vx *= f; this.vz *= f;
          }
          this.airborne = false;
        }
      } else this.airborne = this.y > R + 0.05;

      // Kale çerçeveleri
      this.collideGoal(1, dt, px0, py0, pz0); this.collideGoal(-1, dt, px0, py0, pz0);
      // Saha dışı sınır (reklam panoları)
      const lim = P.halfL + P.margin + 1.5, limZ = P.halfW + P.margin + 1.0;
      if (Math.abs(this.x) > lim) { this.x = M.sign(this.x) * lim; this.vx = -this.vx * 0.35; }
      if (Math.abs(this.z) > limZ) { this.z = M.sign(this.z) * limZ; this.vz = -this.vz * 0.35; }
      // Görsel dönüş
      const s = this.speed3;
      this.rotSpeed = s / R;
      if (s > 0.05) { // dönme ekseni hız vektörüne dik (yatay)
        this.rotAxis.x = -this.vz / s; this.rotAxis.y = 0; this.rotAxis.z = this.vx / s;
      }
    }

    collideGoal(dir, dt, px0, py0, pz0) {
      dt = dt || 1 / 60;
      if (px0 == null) { px0 = this.x - this.vx * dt; py0 = this.y - this.vy * dt; pz0 = this.z - this.vz * dt; }
      const gx = P.halfL * dir;
      const hw = P.goalWidth / 2, h = P.goalHeight, pr = P.postRadius;
      const rr = R + pr;
      // Sürekli çarpışma: hızlı şutta (30 m/s → 0.5 m/adım) top direğin "içinden" atlamasın.
      // Bu adımda kat edilen doğru parçası (önceki konum → şimdiki) ile direk ekseni arasındaki en yakın nokta bulunur.
      const segHit = (ax, az, bx, bz, cx, cz) => { // 2B: (a→b) parçasının c merkezli, rr yarıçaplı daireye İLK giriş anı (t) ve temas noktası
        const ex = bx - ax, ez = bz - az;
        const fx = ax - cx, fz = az - cz;
        const d0 = Math.sqrt(fx * fx + fz * fz);
        if (d0 < rr) return { t: 0, d: d0, qx: ax, qz: az }; // zaten içeride: mevcut noktadan dışarı it
        const A = ex * ex + ez * ez, B = 2 * (fx * ex + fz * ez), C = d0 * d0 - rr * rr;
        if (A < 1e-12) return { t: 0, d: d0, qx: ax, qz: az };
        const disc = B * B - 4 * A * C;
        if (disc < 0) return { t: 0, d: Infinity, qx: ax, qz: az };
        const t = (-B - Math.sqrt(disc)) / (2 * A);
        if (t < 0 || t > 1) return { t: 0, d: Infinity, qx: ax, qz: az };
        return { t, d: rr - 1e-6, qx: ax + ex * t, qz: az + ez * t };
      };
      // Direkler (x–z düzleminde daire, y < h + pr)
      for (const zs of [-hw, hw]) {
        const hit = segHit(px0, pz0, this.x, this.z, gx, zs);
        const yAt = py0 + (this.y - py0) * hit.t;
        if (hit.d < rr && yAt < h + pr) {
          let nx = hit.qx - gx, nz = hit.qz - zs; const d = Math.sqrt(nx * nx + nz * nz);
          if (d < 1e-6) { const sp = Math.sqrt(this.vx * this.vx + this.vz * this.vz) || 1; nx = -this.vx / sp; nz = -this.vz / sp; } else { nx /= d; nz /= d; }
          const vn = this.vx * nx + this.vz * nz;
          if (vn < 0) { this.vx -= 1.75 * vn * nx; this.vz -= 1.75 * vn * nz; this.hitPost = true; }
          this.x = gx + nx * rr; this.z = zs + nz * rr; this.y = yAt;
        }
      }
      // Üst direk (x–y düzleminde daire, |z| < hw + pr)
      {
        const hit = segHit(px0, py0, this.x, this.y, gx, h);
        const zAt = pz0 + (this.z - pz0) * hit.t;
        if (hit.d < rr && Math.abs(zAt) < hw + pr) {
          let nx = hit.qx - gx, ny = hit.qz - h; const d = Math.sqrt(nx * nx + ny * ny);
          if (d < 1e-6) { const sp = Math.sqrt(this.vx * this.vx + this.vy * this.vy) || 1; nx = -this.vx / sp; ny = -this.vy / sp; } else { nx /= d; ny /= d; }
          const vn = this.vx * nx + this.vy * ny;
          if (vn < 0) { this.vx -= 1.75 * vn * nx; this.vy -= 1.75 * vn * ny; this.hitPost = true; }
          this.x = gx + nx * rr; this.y = h + ny * rr; this.z = zAt;
        }
      }
      // Ağ: kale çizgisi gerisinde, kale ağzı içinde. Yan ağın DIŞINDAN gelen top (direğin yanından auta giden şut) ağın içine
      // ışınlanmasın: giriş yalnızca kale ağzından (|z| < hw − R ve y < h − R) olur; dışarıdan gelen top yan/üst ağa dıştan çarpar.
      const behind = (this.x - gx) * dir;
      const behind0 = (px0 - gx) * dir;
      if (behind < -3) return; // top bu kaleden uzakta
      // ağız: top merkezi direk merkezleri arasında ve üst direğin altında (direğe değen top zaten yukarıda sekti)
      const insideMouth = Math.abs(this.z) < hw && this.y < h;
      if (behind > 0 && !this.inNet && behind0 <= 0 && insideMouth) this.inNet = true; // kale çizgisini ağız içinden geçti
      else if (behind > 0 && !this.inNet && behind < 0.25 && insideMouth) this.inNet = true; // sınır durumu (çizgi üstünde başlayan top)
      if (behind > 0 && this.inNet) {
        const depth = P.goalDepth - R;
        // arka ağ
        if (behind > depth) { this.x = gx + depth * dir; this.vx *= -0.15; }
        // yan ağlar
        if (Math.abs(this.z) > hw - R) { this.z = M.sign(this.z) * (hw - R); this.vz *= -0.15; }
        // üst ağ
        if (this.y > h - R) { this.y = h - R; this.vy *= -0.15; }
        // ağ sönümlemesi (dt'ye bağlı: alt adım boyutundan bağımsız davranış)
        const k = Math.exp(-4.5 * dt);
        this.vx *= k; this.vz *= k; this.vy *= k;
      } else if (behind > 0 && !this.inNet && behind < P.goalDepth + R && this.y < h + 0.5) {
        // ağın dışı (yan ağ / üst ağ dış yüzeyi): direğin yanından auta giden top ağ kumaşına dıştan çarpıp sönümlenir (içine ışınlanmaz)
        const outsideSide = Math.abs(this.z) >= hw && Math.abs(this.z) < hw + R + 0.1;
        const aboveTop = this.y >= h && this.y < h + R + 0.1 && Math.abs(this.z) < hw;
        if (outsideSide && (this.vz * -M.sign(this.z)) > 0) { this.z = M.sign(this.z) * (hw + R + 0.05); this.vz *= -0.2; }
        if (aboveTop && this.vy < 0) { this.y = h + R + 0.05; this.vy *= -0.2; }
      } else if (behind <= 0) this.inNet = false; // bu kalenin önüne çıktı (diğer kale için çağrı, uzaktaki bayrağı sıfırlamaz)
    }

    // Verilen süre için yörünge tahmini (yer/hava; çarpışmasız). Sonuç: örnek noktaları
    predictPath(maxT, stepT) {
      const pts = [];
      let x = this.x, y = this.y, z = this.z, vx = this.vx, vy = this.vy, vz = this.vz, spin = this.spin;
      const wb = this.weather ? this.weather.ball : null;
      const rollMul = wb ? wb.roll : 1, bounceMul = wb ? wb.bounce : 1;
      const dt = 1 / 30;
      let t = 0, acc = 0;
      pts.push({ t: 0, x, y, z, s: Math.sqrt(vx * vx + vz * vz) });
      while (t < maxT) {
        vy -= G * dt;
        const s3 = Math.sqrt(vx * vx + vy * vy + vz * vz);
        if (s3 > 0.01) { const k = 1 / (1 + DRAG * s3 * dt); vx *= k; vy *= k; vz *= k; }
        if (Math.abs(spin) > 0.001 && s3 > 2) { const ang = spin * dt, c = Math.cos(ang), sn = Math.sin(ang); const nx = vx * c - vz * sn, nz = vx * sn + vz * c; vx = nx; vz = nz; spin *= Math.max(0, 1 - 0.6 * dt); }
        x += vx * dt; y += vy * dt; z += vz * dt;
        if (y <= R) {
          y = R;
          if (vy < 0) { if (vy < -1.2 * (bounceMul < 0.8 ? 1.6 : 1)) { vy = -vy * BOUNCE * bounceMul; vx *= BOUNCE_FRICTION; vz *= BOUNCE_FRICTION; } else vy = 0; }
          if (vy === 0) { const s = Math.sqrt(vx * vx + vz * vz); if (s > 0) { const ns = Math.max(0, s - (ROLL_DECEL * rollMul + 0.012 * s * s) * dt); vx *= ns / s; vz *= ns / s; } }
        }
        t += dt; acc += dt;
        if (acc >= stepT - 1e-6) { acc = 0; pts.push({ t, x, y, z, vy, s: Math.sqrt(vx * vx + vz * vz) }); }
        if (Math.abs(vx) + Math.abs(vz) + Math.abs(vy) < 0.05 && y <= R + 1e-3) { pts.push({ t, x, y, z, vy: 0, s: 0 }); break; }
      }
      return pts;
    }
  }

  // Yer pasının hedefe ulaşması için gerekli ilk hız (varış hızı ~vEnd)
  // Gerçek yuvarlanma modeli: a = ROLL_DECEL + 0.012·v² + hava direnci → ileri simülasyonla ikili arama (ölçülmüş)
  FS.groundPassSpeed = function (d, vEnd) {
    const ve = vEnd == null ? 3.5 : vEnd;
    // Oyuncular zemini "hisseder": yuvarlanma çarpanı hava durumundan (FS.WEATHER_ROLL, Match tarafından ayarlanır)
    const rollMul = FS.WEATHER_ROLL || 1;
    const arriveSpeed = (v0) => {
      let x = 0, v = v0, t = 0;
      const dt = 1 / 30;
      while (t < 8) {
        const k = 1 / (1 + DRAG * v * dt);
        v *= k;
        v = Math.max(0, v - (ROLL_DECEL * rollMul + 0.012 * v * v) * dt);
        x += v * dt; t += dt;
        if (x >= d) return v;
        if (v < 0.05) return -1;
      }
      return -1;
    };
    let lo = 4, hi = 30;
    for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (arriveSpeed(mid) < ve) lo = mid; else hi = mid; }
    return M.clamp(hi, 5, 28);
  };
  // Havadan pas: menzil için (açı: rad) gerekli hız; hava direnci için tolerans
  FS.loftedSpeed = function (d, angle) {
    const v = Math.sqrt((d * G) / Math.max(0.2, Math.sin(2 * angle)));
    return M.clamp(v * (1 + d * 0.0035), 6, 34);
  };

  FS.Ball = Ball;
  FS.BALL_CONST = { R, G, DRAG, ROLL_DECEL };
})(typeof window !== 'undefined' ? window : globalThis);
