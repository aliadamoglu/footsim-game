/* Hava koşulları — görsel/işitsel taraf (Babylon.js)
   - Yağmur / sağanak: kameraya bağlı düşen damla parçacıkları (rüzgârla eğik), zemin parlaklığı (ıslak çim), koyu gökyüzü, ara sıra şimşek
   - Kar: yavaş süzülen kar taneleri, beyazlaşan zemin dokusu (kar örtüsü) ve turuncu maç topu
   - Sis: yoğun sahne sisi (görüş mesafesi düşer), soluk ışık
   - Gece: koyu gök, projektör ağırlıklı soğuk ışık, güçlü gölgeler
   - Sıcak: sıcak ton, yüksek pozlama, hafif ısı dalgalanması yok (ucuz kalsın)
   - Ses: yağmur/rüzgâr katmanı (WebAudio gürültü), gök gürültüsü */
(function (root) {
  const FS = (root.FS = root.FS || {});
  const FX = (FS.WeatherFX = { active: null, systems: [], t: 0 });

  const LOOKS = {
    clear:  { clear: [0.32, 0.50, 0.78], fog: 0.0018, fogCol: [0.55, 0.66, 0.82], sun: 1.15, sunCol: [1, 0.97, 0.9], hemi: 0.6, ambient: [0.4, 0.4, 0.45], exposure: 1.05, contrast: 1.12, pitchTint: [1, 1, 1], wet: 0 },
    night:  { clear: [0.02, 0.03, 0.06], fog: 0.0022, fogCol: [0.05, 0.06, 0.09], sun: 1.15, sunCol: [0.95, 0.97, 1], hemi: 0.55, ambient: [0.35, 0.35, 0.4], exposure: 1.05, contrast: 1.12, pitchTint: [1, 1, 1], wet: 0 },
    cloudy: { clear: [0.42, 0.46, 0.52], fog: 0.0024, fogCol: [0.5, 0.53, 0.58], sun: 0.8, sunCol: [0.9, 0.92, 0.95], hemi: 0.7, ambient: [0.45, 0.45, 0.48], exposure: 1.0, contrast: 1.08, pitchTint: [0.94, 0.96, 0.96], wet: 0 },
    rain:   { clear: [0.22, 0.25, 0.3], fog: 0.0036, fogCol: [0.28, 0.31, 0.36], sun: 0.65, sunCol: [0.85, 0.88, 0.95], hemi: 0.6, ambient: [0.4, 0.42, 0.46], exposure: 0.96, contrast: 1.1, pitchTint: [0.82, 0.9, 0.86], wet: 1 },
    storm:  { clear: [0.1, 0.11, 0.15], fog: 0.0048, fogCol: [0.14, 0.15, 0.19], sun: 0.55, sunCol: [0.8, 0.85, 0.95], hemi: 0.5, ambient: [0.35, 0.37, 0.42], exposure: 0.95, contrast: 1.14, pitchTint: [0.76, 0.86, 0.82], wet: 1 },
    snow:   { clear: [0.6, 0.63, 0.68], fog: 0.0042, fogCol: [0.68, 0.7, 0.74], sun: 0.75, sunCol: [0.95, 0.96, 1], hemi: 0.8, ambient: [0.5, 0.5, 0.54], exposure: 1.02, contrast: 1.05, pitchTint: [1, 1, 1], wet: 0, snow: 1 },
    fog:    { clear: [0.5, 0.52, 0.55], fog: 0.012, fogCol: [0.56, 0.58, 0.61], sun: 0.6, sunCol: [0.9, 0.9, 0.92], hemi: 0.75, ambient: [0.5, 0.5, 0.52], exposure: 1.0, contrast: 1.02, pitchTint: [0.92, 0.94, 0.92], wet: 0 },
    hot:    { clear: [0.55, 0.68, 0.9], fog: 0.0016, fogCol: [0.75, 0.8, 0.9], sun: 1.35, sunCol: [1, 0.93, 0.8], hemi: 0.65, ambient: [0.45, 0.42, 0.38], exposure: 1.12, contrast: 1.1, pitchTint: [1.02, 0.98, 0.86], wet: 0 },
  };

  const C3 = (a) => new BABYLON.Color3(a[0], a[1], a[2]);

  /* Sahne kurulduktan sonra (App.buildScene sonrası) ve maç nesnesi hazırken çağrılır */
  FX.apply = function (scene, weather, ctx) {
    FX.dispose();
    if (!weather) return;
    const look = LOOKS[weather.id] || LOOKS.clear;
    FX.active = weather; FX.scene = scene; FX.ctx = ctx || {}; FX.t = 0; FX.look = look;
    // --- ışık / sis / renk ---
    scene.clearColor = new BABYLON.Color4(look.clear[0], look.clear[1], look.clear[2], 1);
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2; scene.fogDensity = look.fog; scene.fogColor = C3(look.fogCol);
    scene.ambientColor = C3(look.ambient);
    const sun = ctx.sun, hemi = scene.getLightByName('hemi');
    if (sun) { sun.intensity = look.sun; sun.diffuse = C3(look.sunCol); FX.sunBase = look.sun; }
    if (hemi) hemi.intensity = look.hemi;
    if (ctx.pipeline && ctx.pipeline.imageProcessing) { ctx.pipeline.imageProcessing.exposure = look.exposure; ctx.pipeline.imageProcessing.contrast = look.contrast; }
    // gece dışı: stadyum projektörleri sönük (gündüz maçı)
    const lm = scene.getMaterialByName('lm'); if (lm) lm.emissiveColor = weather.night ? new BABYLON.Color3(1, 1, 0.92) : new BABYLON.Color3(0.55, 0.55, 0.55);
    // --- zemin: ıslak parlaklık / kar örtüsü / renk tonu ---
    const pm = scene.getMaterialByName('pitchMat');
    if (pm) {
      FX.pitchSpec0 = pm.specularColor.clone(); FX.pitchPow0 = pm.specularPower; FX.pitchDiff0 = pm.diffuseColor.clone();
      pm.diffuseColor = C3(look.pitchTint);
      if (look.wet) { pm.specularColor = new BABYLON.Color3(0.45, 0.45, 0.5); pm.specularPower = 24; } // ıslak çim: yansıma
      if (look.snow) FX.snowCover(scene, pm);
    }
    // --- top rengi (kar: turuncu kış topu) ---
    const bm = scene.getMaterialByName('ballMat');
    if (bm) { FX.ballEm0 = bm.emissiveColor ? bm.emissiveColor.clone() : null; FX.ballDiff0 = bm.diffuseColor.clone(); if (look.snow) { bm.diffuseColor = new BABYLON.Color3(1, 0.45, 0.05); bm.emissiveColor = new BABYLON.Color3(0.25, 0.08, 0); } }
    // --- parçacıklar ---
    if (weather.id === 'rain' || weather.id === 'storm') FX.rain(scene, weather.id === 'storm' ? 2600 : 1400, weather);
    if (weather.id === 'snow') FX.snow(scene, 1500, weather);
    // --- ses ---
    FX.audio(weather);
  };

  /* Yağmur: kameranın etrafında 40×40 m'lik kutuda doğan uzun ince damlalar; rüzgâr yönünde eğik düşer */
  FX.rain = function (scene, count, weather) {
    const low = FS.App && FS.App.lowEnd; if (low) count = Math.round(count * 0.45);
    const ps = new BABYLON.ParticleSystem('rain', count, scene);
    ps.particleTexture = FX.dropTexture(scene);
    const em = new BABYLON.TransformNode('rainEmitter', scene); ps.emitter = em;
    ps.minEmitBox = new BABYLON.Vector3(-16, 12, -16); ps.maxEmitBox = new BABYLON.Vector3(16, 20, 16);
    ps.color1 = new BABYLON.Color4(0.85, 0.9, 1, 0.8); ps.color2 = new BABYLON.Color4(0.9, 0.95, 1, 0.55); ps.colorDead = new BABYLON.Color4(0.85, 0.9, 1, 0);
    ps.minSize = 0.045; ps.maxSize = 0.075; ps.minScaleY = 12; ps.maxScaleY = 20; // uzun ince çizgiler
    ps.minLifeTime = 1.2; ps.maxLifeTime = 1.6;
    ps.emitRate = count / 1.3;
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    ps.gravity = new BABYLON.Vector3(0, -2, 0);
    const w = weather.wind;
    ps.direction1 = new BABYLON.Vector3(w.x * 0.9, -16, w.z * 0.9); ps.direction2 = new BABYLON.Vector3(w.x * 1.1, -20, w.z * 1.1);
    ps.minEmitPower = 1; ps.maxEmitPower = 1.2; ps.updateSpeed = 0.016;
    ps.isBillboardBased = true; ps.billboardMode = BABYLON.ParticleSystem.BILLBOARDMODE_STRETCHED;
    ps.start(); ps.preWarmCycles = 60;
    FX.systems.push(ps); FX.emitter = em; FX.rainPs = ps;
    // zemin sıçraması: az sayıda kısa ömürlü küçük halkalar (ucuz)
    const sp = new BABYLON.ParticleSystem('splash', low ? 120 : 300, scene);
    sp.particleTexture = FX.dropTexture(scene);
    sp.emitter = em; sp.minEmitBox = new BABYLON.Vector3(-18, -19.9, -18); sp.maxEmitBox = new BABYLON.Vector3(18, -19.8, 18);
    sp.color1 = new BABYLON.Color4(0.8, 0.85, 0.95, 0.35); sp.color2 = new BABYLON.Color4(0.9, 0.95, 1, 0.2); sp.colorDead = new BABYLON.Color4(1, 1, 1, 0);
    sp.minSize = 0.05; sp.maxSize = 0.12; sp.minLifeTime = 0.15; sp.maxLifeTime = 0.3; sp.emitRate = low ? 150 : 400;
    sp.direction1 = new BABYLON.Vector3(-0.5, 1.5, -0.5); sp.direction2 = new BABYLON.Vector3(0.5, 2.5, 0.5); sp.gravity = new BABYLON.Vector3(0, -9, 0);
    sp.minEmitPower = 0.3; sp.maxEmitPower = 0.6; sp.updateSpeed = 0.016; sp.start();
    FX.systems.push(sp);
  };

  /* Kar: yavaş, salınarak düşen taneler */
  FX.snow = function (scene, count, weather) {
    const low = FS.App && FS.App.lowEnd; if (low) count = Math.round(count * 0.5);
    const ps = new BABYLON.ParticleSystem('snow', count, scene);
    ps.particleTexture = FX.flakeTexture(scene);
    const em = new BABYLON.TransformNode('snowEmitter', scene); ps.emitter = em;
    ps.minEmitBox = new BABYLON.Vector3(-26, 10, -26); ps.maxEmitBox = new BABYLON.Vector3(26, 18, 26);
    ps.color1 = new BABYLON.Color4(1, 1, 1, 0.9); ps.color2 = new BABYLON.Color4(0.95, 0.97, 1, 0.7); ps.colorDead = new BABYLON.Color4(1, 1, 1, 0);
    ps.minSize = 0.06; ps.maxSize = 0.16; ps.minLifeTime = 6; ps.maxLifeTime = 9; ps.emitRate = count / 7;
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    const w = weather.wind;
    ps.direction1 = new BABYLON.Vector3(w.x * 0.5 - 0.4, -1.6, w.z * 0.5 - 0.4); ps.direction2 = new BABYLON.Vector3(w.x * 0.7 + 0.4, -2.4, w.z * 0.7 + 0.4);
    ps.minEmitPower = 1; ps.maxEmitPower = 1; ps.updateSpeed = 0.016;
    ps.minAngularSpeed = -1; ps.maxAngularSpeed = 1;
    // salınım: noise doku yerine ucuz yol → her karede küçük yanal ivme (update'te)
    ps.start(); ps.preWarmCycles = 200;
    FX.systems.push(ps); FX.emitter = em; FX.snowPs = ps;
  };

  /* Kar örtüsü: saha dokusunun üstüne yarı saydam beyaz katman (çizgiler görünür kalır) */
  FX.snowCover = function (scene, pm) {
    const tex = pm.diffuseTexture; if (!tex || !tex.getContext) return;
    const ctx = tex.getContext(); const sz = tex.getSize();
    FX.pitchTexBackup = ctx.getImageData(0, 0, sz.width, sz.height);
    ctx.fillStyle = 'rgba(235,238,242,0.82)'; ctx.fillRect(0, 0, sz.width, sz.height);
    // kar üzerinde dağınık lekeler (ayak izleri / çim görünen yerler)
    ctx.fillStyle = 'rgba(120,150,110,0.18)';
    for (let i = 0; i < 260; i++) { const x = Math.random() * sz.width, y = Math.random() * sz.height, r = 4 + Math.random() * 18; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.5, Math.random() * 3, 0, Math.PI * 2); ctx.fill(); }
    // çizgiler karda süpürülmüş: belirgin koyu gri-mavi (gerçekte kar maçlarında çizgiler kırmızı/mavi boyanır ya da süpürülür)
    tex.update();
    // dış zemin de beyaz
    const gm = scene.getMaterialByName('gm'); if (gm) { FX.gm0 = gm.diffuseColor.clone(); gm.diffuseColor = new BABYLON.Color3(0.82, 0.84, 0.88); }
  };

  FX.dropTexture = function (scene) {
    if (FX._drop && !FX._drop.isDisposed?.()) return FX._drop;
    const t = new BABYLON.DynamicTexture('dropTex', { width: 16, height: 64 }, scene, false);
    const c = t.getContext(); c.clearRect(0, 0, 16, 64);
    const g = c.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(6, 0, 4, 64); t.update(); t.hasAlpha = true;
    FX._drop = t; return t;
  };
  FX.flakeTexture = function (scene) {
    if (FX._flake && !FX._flake.isDisposed?.()) return FX._flake;
    const t = new BABYLON.DynamicTexture('flakeTex', { width: 32, height: 32 }, scene, false);
    const c = t.getContext(); c.clearRect(0, 0, 32, 32);
    const g = c.createRadialGradient(16, 16, 2, 16, 16, 14); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(16, 16, 14, 0, Math.PI * 2); c.fill(); t.update(); t.hasAlpha = true;
    FX._flake = t; return t;
  };

  /* Her karede: yayıcı kamerayı izler, rüzgâr esintisiyle yön güncellenir, şimşek */
  FX.update = function (dt, camPos) {
    const w = FX.active; if (!w) return;
    FX.t += dt;
    if (FX.emitter && camPos) { FX.emitter.position.set(camPos.x, Math.max(0, camPos.y - 8), camPos.z); }
    const ps = FX.rainPs || FX.snowPs;
    if (ps) {
      const k = FX.rainPs ? 1.0 : 0.6;
      ps.direction1.x = w.wind.x * 0.9 * k - (FX.snowPs ? 0.4 : 0); ps.direction1.z = w.wind.z * 0.9 * k - (FX.snowPs ? 0.4 : 0);
      ps.direction2.x = w.wind.x * 1.1 * k + (FX.snowPs ? 0.4 : 0); ps.direction2.z = w.wind.z * 1.1 * k + (FX.snowPs ? 0.4 : 0);
    }
    // sağanak: şimşek (ortalama 14 sn'de bir), kısa parlama + gök gürültüsü
    if (w.id === 'storm' && FX.ctx.sun) {
      if (FX.flashT > 0) { FX.flashT -= dt; const f = Math.max(0, FX.flashT / 0.25); FX.ctx.sun.intensity = FX.sunBase + f * 2.2; FX.scene.ambientColor.set(0.35 + f * 0.5, 0.37 + f * 0.5, 0.42 + f * 0.5); if (FX.flashT <= 0) { FX.ctx.sun.intensity = FX.sunBase; FX.scene.ambientColor = C3(FX.look.ambient); } }
      else if (Math.random() < dt / 14) { FX.flashT = 0.25; setTimeout(() => FX.thunder(), 600 + Math.random() * 1800); }
    }
  };

  /* --- ses: yağmur/rüzgâr katmanı --- */
  FX.audio = function (weather) {
    const Au = FS.Audio; if (!Au || !Au.enabled || !Au.ctx) { FX.pendingAudio = weather; return; }
    FX.pendingAudio = null;
    const ctx = Au.ctx;
    const rainLvl = weather.id === 'storm' ? 0.22 : weather.id === 'rain' ? 0.14 : 0;
    const windLvl = Math.min(0.2, weather.windSpeed * 0.02);
    if (rainLvl > 0 || windLvl > 0.03) {
      const len = ctx.sampleRate * 3; const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const g = ctx.createGain(); g.gain.value = 0;
      // yağmur: yüksek geçiren beyaz gürültü; rüzgâr: alçak geçiren, yavaş salınımlı
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800; const gr = ctx.createGain(); gr.gain.value = rainLvl;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 350; const gw = ctx.createGain(); gw.gain.value = windLvl;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13; const lg = ctx.createGain(); lg.gain.value = windLvl * 0.6; lfo.connect(lg); lg.connect(gw.gain); lfo.start();
      src.connect(hp); hp.connect(gr); gr.connect(g); src.connect(lp); lp.connect(gw); gw.connect(g); g.connect(Au.bus);
      src.start(); g.gain.setTargetAtTime(1, ctx.currentTime, 1.5);
      FX.audioNodes = { src, g, lfo };
    }
  };
  FX.thunder = function () {
    const Au = FS.Audio; if (!Au || !Au.enabled || !Au.ctx) return;
    const ctx = Au.ctx, t0 = ctx.currentTime;
    const len = ctx.sampleRate * 2.5; const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.03 * w) / 1.03; d[i] = last * 4 * Math.exp(-i / (len * 0.35)); }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.7, t0 + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.4);
    src.connect(lp); lp.connect(g); g.connect(Au.bus); src.start(t0); src.stop(t0 + 2.5);
    if (Au.roar) Au.roar(0.08);
  };

  FX.dispose = function () {
    for (const ps of FX.systems) { try { ps.dispose(); } catch (e) { /* yoksay */ } }
    FX.systems = []; FX.rainPs = null; FX.snowPs = null; FX.emitter = null; FX.flashT = 0;
    if (FX.audioNodes) { try { const { src, g, lfo } = FX.audioNodes; g.gain.setTargetAtTime(0, FS.Audio.ctx.currentTime, 0.3); setTimeout(() => { try { src.stop(); lfo.stop(); } catch (e) { /* yoksay */ } }, 1500); } catch (e) { /* yoksay */ } FX.audioNodes = null; }
    FX.active = null; FX._drop = null; FX._flake = null; // sahne yeniden kuruluyor: dokular sahneyle birlikte gider
  };
})(typeof window !== 'undefined' ? window : globalThis);
