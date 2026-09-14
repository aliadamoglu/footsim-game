/* Oyuncu hareketi, top kontrolü, vuruşlar (pas / şut / orta / uzun top / kafa / kaleci dağıtımı)
   Hem yapay zekâ hem insan oyuncu bu ortak katmanı kullanır (adil ve tutarlı davranış). */
(function (root) {
  const FS = (root.FS = root.FS || {});
  const M = FS.M, P = FS.PITCH;
  const A = (FS.Actions = {});
  const G = 9.81;

  A.CONTROL_R = 0.8;     // top kontrol yarıçapı (m)
  A.KICK_CD = 0.42;      // vuruş sonrası tekrar dokunma bekleme (s)
  A.DRIBBLE_OFF = 0.42;  // top-ayak mesafesi (yürüyüş/koşu)
  A.SPRINT_OFF = 0.85;   // sprintte topu önüne itme mesafesi

  /* ---------------- Hareket ---------------- */
  A.moveToward = function (p, tx, tz, sprint, dt, opts) {
    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const stamF = 0.78 + 0.22 * p.stamina;
    const injF = p.injured ? 0.62 : 1;
    const WP = FS.WEATHER ? FS.WEATHER.player : null; // hava: ıslak/karlı zemin yavaşlatır, sıcak yormaz ama tempo düşer
    let maxS = p.maxSpeed * (sprint ? 1 : 0.68) * stamF * injF * (WP ? WP.speed : 1);
    if (p.hasBall) maxS *= sprint ? 0.9 : 0.86; // topla daha yavaş
    if (opts && opts.speedCap != null) maxS = Math.min(maxS, opts.speedCap);
    let desiredS = maxS;
    const arrive = opts && opts.arrive != null ? opts.arrive : 1.5;
    if (d < arrive) desiredS = maxS * Math.sqrt(d / arrive); // varış yavaşlaması (yumuşak)
    let nx = d > 1e-4 ? dx / d : 0, nz = d > 1e-4 ? dz / d : 0;
    // --- Organik yön değişimi: koşarken anında 180° dönülmez; istenen yön, mevcut hız yönüne göre sınırlı bir hızla döner.
    // Yüksek hızda dönüş yarıçapı büyür (momentum), düşük hızda çevik.
    if (p.speed > 1.2 && d > 0.3) {
      const cur = Math.atan2(p.vz, p.vx);
      const want = Math.atan2(nz, nx);
      const diff = M.angleDiff(cur, want);
      const agil = (0.7 + 0.6 * ((p.attrs.agi || p.attrs.acc || 60) / 99)) * (WP ? WP.turn : 1); // ıslak zeminde dönüş yarıçapı büyür
      const turnRate = agil * (p.speed > 6 ? 3.2 : p.speed > 3.5 ? 5.0 : 8.0) * dt; // rad/s
      // sert dönüşte önce fren: hedef hız, açı farkıyla düşer
      const brake = M.clamp01(1 - Math.abs(diff) / Math.PI * 1.4);
      desiredS *= 0.35 + 0.65 * brake;
      // hedefe yakınken dönüş yarıçapı (v/ω) hedef mesafesini aşmasın; yoksa oyuncu topun etrafında döner durur
      if (Math.abs(diff) > 0.3 && d < 4) desiredS = Math.min(desiredS, Math.max(1.3, (turnRate / dt) * d * 0.7));
      const ang = cur + M.clamp(diff, -turnRate, turnRate);
      // yön karışımı: hız düştükçe ve hedefe yaklaştıkça doğrudan hedefe kilitlen
      const w = M.clamp01((p.speed - 1.2) / 4) * M.clamp01((d - 0.4) / 2.5);
      const mx = Math.cos(ang) * w + nx * (1 - w), mz = Math.sin(ang) * w + nz * (1 - w);
      const ml = Math.sqrt(mx * mx + mz * mz) || 1; nx = mx / ml; nz = mz / ml;
    }
    const dvx = nx * desiredS, dvz = nz * desiredS;
    let ax = dvx - p.vx, az = dvz - p.vz;
    const al = Math.sqrt(ax * ax + az * az);
    // ivme profili: durağan kalkışta ilk adımlar patlayıcı, tepe hıza yaklaşırken ivme düşer (gerçek sprint eğrisi)
    const spdRatio = M.clamp01(p.speed / Math.max(1, maxS));
    const accCurve = 1.25 - 0.55 * spdRatio;
    const braking = al > 0 && (ax * p.vx + az * p.vz) < 0;
    const maxA = p.accel * accCurve * (p.hasBall ? 0.85 : 1) * (braking ? 1.6 : 1) * (WP ? WP.accel : 1) * dt;
    if (al > maxA) { ax *= maxA / al; az *= maxA / al; }
    p.vx += ax; p.vz += az;
    A.integrate(p, dt, sprint && d > 1);
  };

  A.stop = function (p, dt) {
    const s = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    if (s > 0) {
      // yüksek hızdan durma birkaç adım sürer (kayma değil, frenleme adımları)
      const dec = p.accel * (s > 5 ? 1.25 : 1.7) * dt;
      const ns = Math.max(0, s - dec);
      p.vx *= ns / s; p.vz *= ns / s;
    }
    A.integrate(p, dt, false);
  };

  A.integrate = function (p, dt, sprinting) {
    p.x += p.vx * dt; p.z += p.vz * dt;
    p.speed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    // yön: hız yönüne dön (top sürerken/vururken yön ayrı yönetilebilir)
    if (p.speed > 0.6 && !p.lockFacing) {
      let want = Math.atan2(p.vz, p.vx);
      // savunmacı geri geri / yan adımlarken (≤ 3.4 m/s) gövde topa dönük kalır (sırtını dönüp koşmaz); hızlanınca koşu yönüne döner
      if (p.faceAt && p.speed < 3.4) {
        const wantBall = Math.atan2(p.faceAt.z - p.z, p.faceAt.x - p.x);
        // yalnızca top yaklaşık önümdeyse (hareket yönüyle 150°'ye kadar fark): tam ters yöne koşarken mantıklı, yan/çapraz da olur
        want = wantBall;
      }
      const rate = (p.speed > 5 ? 5 : 9) * dt;
      const diff = M.angleDiff(p.facing, want);
      p.facing += M.clamp(diff, -rate, rate);
    }
    p.stats.dist += p.speed * dt;
    // kondisyon
    const wStam = FS.WEATHER ? FS.WEATHER.player.stamina : 1; // sıcakta hızlı tükenme
    const drain = (sprinting ? 0.020 * wStam : p.speed > 3 ? 0.006 * wStam : -0.010) * (FS.STAMINA_MUL || 1);
    const stamAttr = p.attrs.stam / 99;
    p.stamina = M.clamp(p.stamina - drain * dt * (drain > 0 ? (1.35 - 0.7 * stamAttr) : 1), 0.15, 1);
    // saha sınırı (biraz dışına çıkabilir)
    const lim = P.halfL + 4, limZ = p.ceremonyStage != null && p.ceremonyStage < 2 ? P.halfW + 22 : P.halfW + 4; // seremonide tünel (-z) serbest
    if (Math.abs(p.x) > lim) { p.x = M.sign(p.x) * lim; p.vx = 0; p.speed = Math.abs(p.vz); }
    if (Math.abs(p.z) > limZ) { p.z = M.sign(p.z) * limZ; p.vz = 0; p.speed = Math.abs(p.vx); }
  };

  A.faceTo = function (p, x, z) { p.facing = Math.atan2(z - p.z, x - p.x); };

  /* ---------------- Top sürme ---------------- */
  // Top sahibi hareket ederken topu ayağının önünde tutar (sprintte ileri iter)
  A.dribbleBall = function (p, ball, dt, sprint) {
    let off = sprint && p.speed > 4 ? A.SPRINT_OFF : A.DRIBBLE_OFF;
    // ilk dokunuş: top biraz daha önde ve daha gevşek takip edilir (yapışmaz)
    if (p.firstTouchT > 0) { p.firstTouchT -= dt; off += 0.35 * Math.min(1, p.firstTouchT / 0.28); }
    // top hedefi: yüz yönünde off metre (yavaşken durur)
    const dirx = Math.cos(p.facing), dirz = Math.sin(p.facing);
    const tx = p.x + dirx * off, tz = p.z + dirz * off;
    // yumuşak takip: top her karede hedefe doğru çekilir (dokunuş etkisi)
    const k = 1 - Math.exp(-dt * (p.firstTouchT > 0 ? 6 : p.speed > 4 ? 9 : 14));
    const nx = M.lerp(ball.x, tx, k), nz = M.lerp(ball.z, tz, k);
    ball.vx = (nx - ball.x) / dt; ball.vz = (nz - ball.z) / dt;
    ball.x = nx; ball.z = nz; ball.y = P.BALL_R; ball.vy = 0;
    ball.spin = 0;
    const s = ball.speed; ball.rotSpeed = s / P.BALL_R;
    if (s > 0.05) { ball.rotAxis.x = -ball.vz / s; ball.rotAxis.y = 0; ball.rotAxis.z = ball.vx / s; }
  };

  /* ---------------- Vuruş yardımcıları ---------------- */
  // Sürtünmeli fizikle ileriye simülasyon: hedef mesafede yükseklik (duvar/kale kontrolü için)
  A.simulateFlight = function (v, elev, maxDist) {
    // 2B: yatay mesafe d ve yükseklik y — dikey düzlemde; drag dahil
    const DRAG = FS.BALL_CONST.DRAG;
    let d = 0, y = P.BALL_R, vh = v * Math.cos(elev), vy = v * Math.sin(elev);
    const dt = 1 / 60; let t = 0;
    const samples = [];
    while (t < 6 && d < maxDist + 1) {
      vy -= G * dt;
      const s3 = Math.sqrt(vh * vh + vy * vy);
      const k = 1 / (1 + DRAG * s3 * dt); // ball.js ile aynı kapalı çözüm (tahmin = gerçek uçuş)
      vh *= k; vy *= k;
      d += vh * dt; y += vy * dt; t += dt;
      samples.push({ d, y, t });
      if (y < P.BALL_R && vy < 0) break;
    }
    return samples;
  };
  A.heightAt = (samples, dist) => {
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].d >= dist) {
        const a = samples[i - 1], b = samples[i];
        const f = (dist - a.d) / Math.max(1e-6, b.d - a.d);
        return { y: a.y + (b.y - a.y) * f, t: a.t + (b.t - a.t) * f };
      }
    }
    return null;
  };
  // Verilen yatay mesafede belirli yüksekliğe ulaşmak için (hız, açı) çözümü. Duvar kısıtı isteğe bağlı.
  A.solveKick = function (dist, targetY, opts) {
    const o = opts || {};
    const vMin = o.vMin || 14, vMax = o.vMax || 32;
    const eMin = o.elevMin != null ? o.elevMin : 0.02, eMax = o.elevMax != null ? o.elevMax : 0.5;
    let best = null;
    const evalAt = (v, e) => {
      const s = A.simulateFlight(v, e, dist);
      const h = A.heightAt(s, dist);
      if (!h) return;
      if (o.wallDist && o.wallH) { const hw = A.heightAt(s, o.wallDist); if (!hw || hw.y < o.wallH) return; }
      if (o.maxApex) { let apex = 0; for (const q of s) apex = Math.max(apex, q.y); if (apex > o.maxApex) return; }
      const err = Math.abs(h.y - targetY) + (o.preferFast ? (vMax - v) * 0.02 : 0) + (o.preferSlow ? (v - vMin) * 0.03 : 0);
      if (!best || err < best.err) best = { v, elev: e, err, t: h.t };
    };
    const dv = (vMax - vMin) / 9, de = (eMax - eMin) / 14;
    for (let v = vMin; v <= vMax + 1e-9; v += dv || 1) for (let e = eMin; e <= eMax + 1e-9; e += de || 1) evalAt(v, e);
    // ikinci aşama: kaba çözümün etrafında ince arama (hız adımı büyük olduğunda menzil hatasını giderir)
    if (best && dv > 0.3) {
      const v0 = best.v, e0 = best.elev;
      for (let v = Math.max(vMin, v0 - dv); v <= Math.min(vMax, v0 + dv) + 1e-9; v += dv / 6) for (let e = Math.max(eMin, e0 - de); e <= Math.min(eMax, e0 + de) + 1e-9; e += (de || 0.01) / 2) evalAt(v, e);
    }
    return best;
  };

  function applyKick(p, ball, vx, vy, vz, kind, spin) {
    ball.owner = null;
    p.hasBall = false;
    ball.vx = vx; ball.vy = vy; ball.vz = vz;
    ball.spin = spin || 0;
    ball.prevTouch = ball.lastTouch;
    ball.lastTouch = p;
    ball.lastKick = { p, kind, t: 0, x: ball.x, z: ball.z, team: p.team };
    ball.lastKickTime = 0;
    ball.hitPost = false;
    p.kickCd = kind === 'throw' ? 0.6 : A.KICK_CD;
    p.kickAnim = 1;
    // animasyon stili: taç (iki kol baş üstünden), kafa (tryHeader ayarlar; sıçrama dahil), vole (top havada), normal vuruş
    p.kickStyle = kind === 'throw' ? 'throw' : kind === 'header' ? (p.kickStyle === 'jumpHeader' ? 'jumpHeader' : 'header') : ball.y > 0.45 ? 'volley' : null;
    p.lockFacing = false;
    p.holding = false; p.holdT = 0; // top elden/ayaktan çıktı: tutma durumu her yolda biter
    p.stats.touches++;
  }

  // pressure: 0..1 — yakın rakip sayısına göre hata artışı
  A.pressureOn = function (p, opponents) {
    // en yakın rakip tam ağırlıkta, diğerleri yarım: 1.2 m'de tek rakip ≈ 0.55, 2 m'de ≈ 0.25, 2.5 m'de ≈ 0.1 (jokey mesafesi = düşük baskı)
    let best = 0, rest = 0;
    for (const o of opponents) {
      const d = M.dist(p.x, p.z, o.x, o.z);
      if (d >= 2.8) continue;
      const v = Math.pow((2.8 - d) / 2.8, 1.3);
      if (v > best) { rest += best; best = v; } else rest += v;
    }
    return M.clamp01(best + rest * 0.5);
  };

  /* Pas: kind = 'ground' | 'lofted' | 'through' | 'cross' */
  A.pass = function (p, ball, target, kind, ctx) {
    const c = ctx || {};
    const pressure = c.pressure || 0;
    const skill = p.attrs.pass / 99;
    // Açısal hata: profesyonel seviyede 20 m'lik pas ~0.5 m sapar; baskı ve koşarken vurmak hatayı artırır, havadan paslar daha zor
    let tx = target.x, tz = target.z;
    const dx = tx - ball.x, dz = tz - ball.z;
    const d = Math.max(0.5, Math.sqrt(dx * dx + dz * dz));
    // hava: ıslak top ayaktan kayar (control > 1); siste uzun paslar (görüş) ek hata alır
    const WX = FS.WEATHER; const wErr = WX ? WX.control * (WX.visibility < 1 ? 1 + (1 - WX.visibility) * M.clamp01((d - 15) / 25) * 1.2 : 1) : 1;
    const errScale = (c.errMul || 1) * wErr * (0.012 + (1 - skill) * 0.055) * (1 + pressure * 0.6) * (p.speed > 5 ? 1.2 : 1) * (kind === 'lofted' || kind === 'cross' ? 1.35 : 1);
    const ang = Math.atan2(dz, dx) + M.randn() * errScale;
    let v, vy = 0, spin = 0;
    if (kind === 'ground' || kind === 'through') {
      const vEnd = kind === 'through' ? (c.arrive || 6.0) : (c.arrive || 5.0);
      v = FS.groundPassSpeed(d, vEnd) * (1 + M.randn() * 0.035 * (1 + pressure * 0.7));
      if (c.power) v *= c.power;
      v = M.clamp(v, 4, 28);
      // hafif hava: uzun yer pasları biraz kalkar
      if (d > 30) vy = 1.3;
    } else {
      // havadan: mesafeye göre açı; 'cross' daha dik ve hızlı
      const elev = kind === 'cross' ? M.rand(0.30, 0.40) : d < 20 ? M.rand(0.42, 0.55) : M.rand(0.30, 0.42);
      const sol = A.solveKick(d, kind === 'cross' ? 1.75 : 0.4, { elevMin: elev - 0.03, elevMax: elev + 0.03, vMin: 8, vMax: 34 });
      v = (sol ? sol.v : FS.loftedSpeed(d, elev)) * (1 + M.randn() * (0.012 + (1 - skill) * 0.03) * (1 + pressure * 0.7));
      const e = (sol ? sol.elev : elev) + M.randn() * 0.015;
      vy = v * Math.sin(e); v = v * Math.cos(e);
      if (kind === 'cross') spin = (c.spinDir || 0) * M.rand(0.25, 0.45);
    }
    applyKick(p, ball, Math.cos(ang) * v, vy, Math.sin(ang) * v, kind, spin);
    p.stats.passes++;
    return { v, ang };
  };

  /* Şut: aim {x, z, y}, power 0..1, style: 'normal' | 'finesse' | 'chip' | 'header' | 'volley' */
  A.shoot = function (p, ball, aim, power, ctx) {
    const c = ctx || {};
    const pressure = c.pressure || 0;
    const skill = p.attrs.shoot / 99, comp = p.attrs.comp / 99;
    const style = c.style || 'normal';
    const dx = aim.x - ball.x, dz = aim.z - ball.z;
    const d = Math.max(1, Math.sqrt(dx * dx + dz * dz));
    const baseAng = Math.atan2(dz, dx);
    // hata: mesafe, baskı, güç ve yetenekle artar
    let angErr = (0.045 + (1 - skill) * 0.12) * (1 + pressure * 0.9) * (0.7 + power * 0.7) * (style === 'finesse' ? 0.8 : 1) * (style === 'header' ? 1.6 : 1) * (style === 'volley' ? 1.5 : 1);
    // uzaktan şutlar daha dağınık: 18 m ötesi her metrede %4 daha fazla açısal hata (gerçekte uzak şutların çoğu kaleciye ya da dışarı gider)
    if (d > 18) angErr *= 1 + (d - 18) * 0.06;
    angErr *= c.errMul || 1;
    if (p.speed > 5.5) angErr *= 1.25;
    // hava: ıslak top/karlı zemin şutu dağıtır; siste uzak şutlar isabetsiz
    if (FS.WEATHER) { const WX = FS.WEATHER; angErr *= 0.6 + 0.4 * WX.control; if (WX.visibility < 1 && d > 16) angErr *= 1 + (1 - WX.visibility) * 0.6; }
    const ang = baseAng + M.randn() * angErr;
    let v;
    if (style === 'header') v = 9 + power * 9 * (0.7 + 0.3 * skill);
    else if (style === 'chip') v = M.clamp(FS.loftedSpeed(d, 0.6) * 0.98, 8, 20);
    else v = (15 + power * 18) * (0.82 + 0.28 * skill) * (style === 'finesse' ? 0.85 : 1);
    v = M.clamp(v, 6, 36);
    // yükseklik çözümü: hedef y'ye ulaşacak eğim (drag dahil), hata eklenir
    let elev;
    if (style === 'chip') elev = 0.62;
    else if (style === 'header') elev = Math.atan2(Math.max(0, aim.y - ball.y), d) - 0.05;
    else {
      const sol = A.solveKick(d, aim.y, { vMin: v, vMax: v + 0.01, elevMin: -0.05, elevMax: 0.45 });
      elev = sol ? sol.elev : Math.atan2(aim.y - P.BALL_R, d);
    }
    const elevErr = (0.03 + (1 - comp) * 0.07) * (0.8 + power * 0.8) * (style === 'volley' ? 1.6 : 1) * (c.errMul || 1) * (1 + Math.max(0, d - 16) * 0.05);
    elev += Math.abs(M.randn()) * elevErr * (M.chance(0.65) ? 1 : -0.5); // yükseğe kaçırma daha olası
    const vy = v * Math.sin(elev), vh = v * Math.cos(elev);
    const spin = style === 'finesse' ? (c.spinDir || (M.chance(0.5) ? 1 : -1)) * M.rand(0.35, 0.6) : (M.randn() * 0.08);
    applyKick(p, ball, Math.cos(ang) * vh, vy, Math.sin(ang) * vh, style === 'header' ? 'header' : 'shot', spin);
    p.stats.shots++;
    return { v, ang, elev };
  };

  /* Uzaklaştırma: baskı altında topu ileriye/kenara güçlü vur */
  A.clear = function (p, ball, dirX, ctx) {
    const c = ctx || {};
    const ang0 = Math.atan2(c.z != null ? c.z : (M.chance(0.5) ? 1 : -1) * 0.7, dirX) + M.randn() * 0.15;
    const v = M.rand(19, 27);
    const elev = M.rand(0.35, 0.5);
    applyKick(p, ball, Math.cos(ang0) * v * Math.cos(elev), v * Math.sin(elev), Math.sin(ang0) * v * Math.cos(elev), 'clear', 0);
  };

  /* Kaleci: elle dağıtım (yer/havadan atış) */
  A.gkThrow = function (p, ball, target, lofted) {
    const dx = target.x - ball.x, dz = target.z - ball.z;
    const d = Math.max(1, Math.sqrt(dx * dx + dz * dz));
    const ang = Math.atan2(dz, dx) + M.randn() * 0.03;
    let v, vy;
    if (lofted) { const e = 0.38; v = M.clamp(FS.loftedSpeed(d, e), 8, 26); vy = v * Math.sin(e); v = v * Math.cos(e); }
    else { v = FS.groundPassSpeed(d, 4); vy = 0.6; }
    ball.y = 1.0;
    applyKick(p, ball, Math.cos(ang) * v, vy, Math.sin(ang) * v, 'throw', 0);
    p.kickStyle = lofted ? 'gkOverarm' : 'gkRoll'; // animasyon: tek kol üstten atış / yerden yuvarlama
    p.holding = false; p.holdT = 0;
    p.stats.passes++;
  };
  /* Kaleci degaj / uzun vuruş (elden ya da yerden) */
  A.gkLongKick = function (p, ball, target) {
    const dx = target.x - ball.x, dz = target.z - ball.z;
    const d = Math.max(5, Math.sqrt(dx * dx + dz * dz));
    const ang = Math.atan2(dz, dx) + M.randn() * 0.06;
    const e = M.rand(0.55, 0.68);
    const sol = A.solveKick(d, 0.5, { elevMin: e - 0.02, elevMax: e + 0.02, vMin: 15, vMax: 36 });
    const v = (sol ? sol.v : FS.loftedSpeed(d, e)) * (1 + M.randn() * 0.04);
    const el = sol ? sol.elev : e;
    if (p.holding) ball.y = 0.9;
    applyKick(p, ball, Math.cos(ang) * v * Math.cos(el), v * Math.sin(el), Math.sin(ang) * v * Math.cos(el), 'lofted', 0);
    p.holding = false; p.holdT = 0;
    p.stats.passes++;
  };

  /* Taç atışı */
  A.throwIn = function (p, ball, target) {
    const dx = target.x - ball.x, dz = target.z - ball.z;
    const d = Math.max(1, Math.sqrt(dx * dx + dz * dz));
    const ang = Math.atan2(dz, dx) + M.randn() * 0.05;
    const e = d < 12 ? 0.25 : 0.42;
    const v = M.clamp(FS.loftedSpeed(d, e) * 0.9, 5, 19);
    ball.y = 2.1;
    applyKick(p, ball, Math.cos(ang) * v * Math.cos(e), v * Math.sin(e), Math.sin(ang) * v * Math.cos(e), 'throw', 0);
    p.stats.passes++;
  };

  /* Kafa vuruşu / sekme yönlendirme (kontrolsüz dokunuş) */
  A.deflect = function (p, ball, dirX, dirZ, speed, up, kind) {
    const l = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
    applyKick(p, ball, (dirX / l) * speed, up || 0, (dirZ / l) * speed, kind || 'deflect', 0);
  };

  /* Topu kontrol altına alma (ilk dokunuş) */
  A.takeControl = function (p, ball) {
    ball.owner = p;
    p.hasBall = true;
    p.faceAt = null;
    ball.prevTouch = ball.lastTouch;
    ball.lastTouch = p;
    ball.vy = 0; ball.y = P.BALL_R; ball.spin = 0;
    ball.inNet = false;
    p.stats.touches++;
    p.holding = false;
  };
  A.releaseControl = function (p, ball) {
    if (ball.owner === p) ball.owner = null;
    p.hasBall = false;
    p.holding = false;
  };
})(typeof window !== 'undefined' ? window : globalThis);
