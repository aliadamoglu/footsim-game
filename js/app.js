/* Uygulama: menü, sahne kurulumu, render döngüsü, HUD, olay-görsel bağlantıları */
(function (root) {
  const FS = (root.FS = root.FS || {});
  const M = FS.M, P = FS.PITCH;
  const $ = (id) => document.getElementById(id);

  const App = (FS.App = {
    engine: null, scene: null, match: null, director: null, views: new Map(), ballMesh: null,
    settings: { halfMin: 3, humanTeam: null, home: 'GS', away: 'FB', camera: 'auto', speed: 1, sound: true, tiltShift: false, weather: 'random' },
    running: false, lastT: 0, replayMode: false, showNames: true, hudTimer: 0, banner: null,
  });

  /* ---------------- Menü ---------------- */
  App.initMenu = function () {
    // takım ızgarası: FS.ClubPicker (lig sekmeleri + arama + kulüp kartı)
    const picker = FS.ClubPicker.mount({
      gridId: 'teamGrid', tabsId: 'leagueTabs', searchId: 'teamSearch', countId: 'teamCount', storageKey: 'footsim.pickTab', menu: true,
      isHome: (t) => App.settings.home === t.id, isAway: (t) => App.settings.away === t.id,
      onPick: (t, e) => {
        if (e.shiftKey || App.pickSide === 'away') { if (t.id !== App.settings.home) App.settings.away = t.id; App.pickSide = 'home'; }
        else { if (t.id !== App.settings.away) App.settings.home = t.id; App.pickSide = 'away'; }
        render(); App.updateMenuSummary();
      },
      setSide: (side, t) => {
        if (side === 'home') { if (t.id === App.settings.away) App.settings.away = App.settings.home; App.settings.home = t.id; App.pickSide = 'away'; }
        else { if (t.id === App.settings.home) App.settings.home = App.settings.away; App.settings.away = t.id; App.pickSide = 'home'; }
        render(); App.updateMenuSummary();
      },
      onCareer: (t) => { if (FS.CareerUI) FS.CareerUI.open(t.id); },
    });
    const render = () => picker.render();
    App.pickSide = 'home';
    App.renderTeamGrid = render;
    render();
    App.updateMenuSummary();
    $('btnTransfer').onclick = () => FS.TransferUI.open(App.settings.home);
    $('btnHelpMenu').onclick = () => { $('menuHelp').classList.toggle('hidden'); };
    $('btnCloseMenuHelp').onclick = () => $('menuHelp').classList.add('hidden');
    $('btnStart').onclick = () => {
      // menüden normal maç: mod radyosunu yeniden oku (kariyer maçı ayarları kalmış olabilir)
      const r = document.querySelector('input[name=mode]:checked'); App.settings.humanTeam = !r || r.value === 'watch' ? null : r.value === 'home' ? 0 : 1;
      App.careerMatch = null; App.careerResult = null;
      App.startMatch();
    };
    // mobil yapışık başlat çubuğu: hero'daki ana buton ekrandan çıkınca görünür
    const b2 = $('btnStart2'); if (b2) b2.onclick = () => $('btnStart').onclick();
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => { for (const e of es) $('menu').classList.toggle('showSticky', !e.isIntersecting); }, { root: $('menu'), threshold: 0 });
      io.observe($('btnStart'));
    }
    $('btnSwap').onclick = () => { const h = App.settings.home; App.settings.home = App.settings.away; App.settings.away = h; render(); App.updateMenuSummary(); };
    $('btnRandom').onclick = () => { const a = M.pick(FS.TEAMS); let b = M.pick(FS.TEAMS); while (b === a) b = M.pick(FS.TEAMS); App.settings.home = a.id; App.settings.away = b.id; render(); App.updateMenuSummary(); };
    document.querySelectorAll('input[name=mode]').forEach((r) => (r.onchange = () => { App.settings.humanTeam = r.value === 'watch' ? null : r.value === 'home' ? 0 : 1; }));
    document.querySelectorAll('input[name=len]').forEach((r) => (r.onchange = () => { App.settings.halfMin = parseFloat(r.value); }));
    document.querySelectorAll('input[name=wx]').forEach((r) => (r.onchange = () => { App.settings.weather = r.value; try { localStorage.setItem('footsim.weather', r.value); } catch (e) { /* yoksay */ } App.updateWxHint(); }));
    try { const w0 = localStorage.getItem('footsim.weather'); if (w0 && FS.Weather && (w0 === 'random' || FS.Weather.PRESETS[w0])) { App.settings.weather = w0; const r = document.querySelector(`input[name=wx][value="${w0}"]`); if (r) r.checked = true; } } catch (e) { /* yoksay */ }
    App.updateWxHint();
  };
  /* Spiker için kariyer bağlamı (lig haftası, sıralama, derbi...) — kariyer maçı değilse null */
  App.careerCtx = function (match) { return App.careerMatch && FS.Career && FS.Career.state ? FS.Career.voiceContext(match) : null; };
  App.kitCss = function (k) {
    if (k.pattern === 'stripes') return `repeating-linear-gradient(90deg, ${k.c1} 0 8px, ${k.c2} 8px 16px)`;
    if (k.pattern === 'halves') return `linear-gradient(90deg, ${k.c2} 50%, ${k.c1} 50%)`;
    if (k.pattern === 'sash') return `linear-gradient(135deg, ${k.c1} 40%, ${k.c2} 40%, ${k.c2} 60%, ${k.c1} 60%)`;
    if (k.pattern === 'hoops') return `repeating-linear-gradient(0deg, ${k.c1} 0 8px, ${k.c2} 8px 16px)`;
    return k.c1;
  };
  App.updateMenuSummary = function () {
    const h = FS.Transfer.teamDef(App.settings.home), a = FS.Transfer.teamDef(App.settings.away);
    $('sumHome').textContent = h.name; $('sumAway').textContent = a.name;
    $('sumHomeKit').style.background = App.kitCss(h.kits.home); $('sumAwayKit').style.background = App.kitCss(a.kits.home);
    $('sumStadium').textContent = h.stadium + ' · ' + h.city;
    $('lineupHome').innerHTML = h.xi.map((d) => `<li><b>${d[0]}</b> ${d[1]} <span>${d[2]}</span></li>`).join('');
    $('lineupAway').innerHTML = a.xi.map((d) => `<li><b>${d[0]}</b> ${d[1]} <span>${d[2]}</span></li>`).join('');
    $('formHome').textContent = h.formation; $('formAway').textContent = a.formation;
    const sub = $('lineupSub'); if (sub) sub.textContent = h.short + ' · ' + a.short;
    const sh = $('ssHome'), sa = $('ssAway'); if (sh) sh.textContent = h.name; if (sa) sa.textContent = a.name;
  };

  /* ---------------- Maç başlat ---------------- */
  App.startMatch = function () {
    $('menu').classList.add('hidden');
    $('game').classList.remove('hidden');
    if (App.settings.sound) FS.Audio.init();
    const canvas = $('renderCanvas');
    if (!App.engine) {
      App.engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true, antialias: true, adaptToDeviceRatio: false });
      // telefon/tablet: daha düşük iç çözünürlük ve gölge/bloom kalitesi (akıcılık)
      App.lowEnd = !!(FS.Touch && FS.Touch.isTouch() && Math.min(window.screen.width, window.screen.height) <= 900);
      App.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, App.lowEnd ? 1.0 : 1.5));
      window.addEventListener('resize', () => { App.engine.resize(); App.syncBarHeight(); });
      App.syncBarHeight();
      FS.Human.init(canvas);
    }
    if (App.scene) { App.scene.dispose(); App.views.clear(); }
    App.buildScene();
    const home = FS.Transfer.matchDef(App.settings.home), away = FS.Transfer.matchDef(App.settings.away);
    const match = (App.match = new FS.Match([home, away], { halfRealSec: App.settings.halfMin * 60, humanTeam: App.settings.humanTeam, ceremony: 12, weather: App.settings.weather || 'random' }));
    if (FS.WeatherFX) FS.WeatherFX.apply(App.scene, match.weather, { sun: App.sun, pipeline: App.pipeline });
    App.updateWxBadge();
    App.economyApplied = false; App._ltAcc = 0; App._hlWatch = false; clearTimeout(App._hlT); App.hideLowerThird(); App.hideLineupIntro();
    App.setPaused(false);
    if (App.settings.humanTeam != null) { FS.Human.enable(match, App.settings.humanTeam); App.settings.camera = 'auto'; } else FS.Human.disable(match);
    App.createPlayerViews();
    match.on((ev) => App.onMatchEvent(ev));
    App.updateScoreboard();
    App.running = true; App.lastT = performance.now();
    App.setCtrlHud(App.settings.humanTeam != null);
    if (FS.Touch) FS.Touch.show(App.settings.humanTeam != null);
    requestAnimationFrame(() => App.syncBarHeight());
    App.showRotateHint();
    App.director.setUserMode(App.settings.humanTeam != null ? 'player' : 'auto');
    $('camSelect').value = App.settings.humanTeam != null ? 'player' : 'auto';
    // açılış: vinç çekimi → seremoni (takımlar dizilir) → yayın (mod ayarlandıktan SONRA kuyruğa alınmalı)
    if (match.state === 'lineup') App.director.onEvent({ type: 'lineup' }, match); // tünel → çıkış → vinç → dizilme → tokalaşma
    else App.director.onEvent({ type: 'kickoff' }, match);
    if (FS.Voice) { FS.Voice.clear(); FS.Voice.preMatch(match, { career: App.careerCtx ? App.careerCtx(match) : null }); }
    App.setSpeed(1);
    $('lenSelect').value = String(App.settings.halfMin);
    if (!App.loopStarted) { App.loopStarted = true; App.engine.runRenderLoop(() => App.frame()); }
    // Duyuru
    const cm = App.careerMatch && FS.Career.state ? FS.Career.state : null;
    const wxTxt = match.weather && FS.Weather ? ` · ${FS.Weather.summary(match.weather)}` : '';
    App.showBanner(`${home.name} — ${away.name}`, (cm ? `${home.stadium} · footsim Ligi · ${cm.season} · ${cm.week}. hafta` : `${home.stadium} · footsim · 2026-27 Sezonu`) + wxTxt, 5000);
  };

  App.buildScene = function () {
    const scene = (App.scene = new BABYLON.Scene(App.engine));
    scene.clearColor = new BABYLON.Color4(0.02, 0.03, 0.06, 1);
    scene.ambientColor = new BABYLON.Color3(0.35, 0.35, 0.4);
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2; scene.fogDensity = 0.0022; scene.fogColor = new BABYLON.Color3(0.05, 0.06, 0.09);
    const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0.2, 1, 0.1), scene); hemi.intensity = 0.55; hemi.groundColor = new BABYLON.Color3(0.15, 0.2, 0.15);
    const sun = (App.sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.35, -1, 0.45), scene)); sun.intensity = 1.15; sun.position = new BABYLON.Vector3(40, 80, -50);
    sun.shadowMinZ = 10; sun.shadowMaxZ = 260;
    const sg = (App.shadow = new BABYLON.ShadowGenerator(App.lowEnd ? 1024 : 2048, sun)); sg.useBlurExponentialShadowMap = true; sg.blurKernel = App.lowEnd ? 8 : 16; sg.darkness = 0.45; sg.bias = 0.0008;
    // ikinci stadyum ışığı (dolgu)
    const fill = new BABYLON.DirectionalLight('fill', new BABYLON.Vector3(0.5, -1, -0.3), scene); fill.intensity = 0.35; fill.specular = BABYLON.Color3.Black();
    const home = FS.getTeam(App.settings.home), away = FS.getTeam(App.settings.away);
    App.stadium = FS.buildStadium(scene, { homeColor: home.kits.home.c1, awayColor: away.kits.home.c1 });
    // top
    const ball = BABYLON.MeshBuilder.CreateSphere('ball', { diameter: P.BALL_R * 2, segments: 16 }, scene);
    const bt = new BABYLON.DynamicTexture('ballTex', { width: 256, height: 128 }, scene, true);
    const bc = bt.getContext(); bc.fillStyle = '#f5f5f5'; bc.fillRect(0, 0, 256, 128); bc.fillStyle = '#111';
    for (let i = 0; i < 12; i++) { const x = (i % 4) * 64 + (Math.floor(i / 4) % 2) * 32, y = Math.floor(i / 4) * 42 + 10; bc.beginPath(); bc.moveTo(x + 14, y); bc.lineTo(x + 28, y + 10); bc.lineTo(x + 23, y + 26); bc.lineTo(x + 5, y + 26); bc.lineTo(x, y + 10); bc.closePath(); bc.fill(); }
    bt.update();
    const bm = new BABYLON.StandardMaterial('ballMat', scene); bm.diffuseTexture = bt; bm.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5); bm.specularPower = 48;
    ball.material = bm; App.ballMesh = ball; sg.addShadowCaster(ball);
    // top gölgesi (yükseklik için düz disk)
    const bs = BABYLON.MeshBuilder.CreateDisc('ballShadow', { radius: 0.16, tessellation: 16 }, scene); bs.rotation.x = Math.PI / 2; bs.position.y = 0.012;
    const bsm = new BABYLON.StandardMaterial('bsm', scene); bsm.diffuseColor = BABYLON.Color3.Black(); bsm.alpha = 0.35; bsm.disableLighting = true; bsm.emissiveColor = BABYLON.Color3.Black(); bs.material = bsm; App.ballShadow = bs;
    // kamera
    App.director = new FS.Director(scene, $('renderCanvas'));
    scene.activeCamera = App.director.cam;
    App.director.onReplayStart = (on) => { $('replayTag').style.display = on && !App.director.currentHighlight ? 'flex' : 'none'; App.replayMode = on; if (!on) $('hlTag').classList.remove('show'); };
    App.director.onHighlight = (h) => { const tag = $('hlTag'); if (h) { $('replayTag').style.display = 'none'; $('hlInfo').textContent = `${h.minute} ${h.scorer.shortName}${h.ownGoal ? ' (KK)' : ''} · ${h.score[0]}-${h.score[1]}`; tag.classList.add('show'); } else tag.classList.remove('show'); };
    // post-process: hafif vinyet + renk
    const pipeline = new BABYLON.DefaultRenderingPipeline('pp', true, scene, [App.director.cam]);
    pipeline.fxaaEnabled = true;
    pipeline.imageProcessingEnabled = true;
    pipeline.imageProcessing.vignetteEnabled = true; pipeline.imageProcessing.vignetteWeight = 1.6; pipeline.imageProcessing.vignetteColor = new BABYLON.Color4(0, 0, 0, 0);
    pipeline.imageProcessing.contrast = 1.12; pipeline.imageProcessing.exposure = 1.05;
    pipeline.bloomEnabled = !App.lowEnd; pipeline.bloomThreshold = 0.85; pipeline.bloomWeight = 0.18; pipeline.bloomKernel = 48;
    pipeline.depthOfFieldEnabled = false;
    App.pipeline = pipeline;
    // isim etiketleri için GUI
    App.gui = BABYLON.GUI ? BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI('ui', true, scene) : null;
    // Parçacık: gol konfetisi
    App.confetti = null;
  };

  App.createPlayerViews = function () {
    const shared = { skin: {}, hair: {}, shorts: {}, socks: {} };
    App.shared = shared;
    if (App.match.officials) {
      const off = App.match.officials;
      for (const p of off.all) { const v = new FS.PlayerView(App.scene, p, off.team, shared); p.view = v; App.views.set(p.id, v); for (const m of v.meshes) App.shadow.addShadowCaster(m); }
    }
    for (const team of App.match.teams) {
      for (const p of team.players.concat(team.subs)) {
        const v = new FS.PlayerView(App.scene, p, team, shared);
        p.view = v; App.views.set(p.id, v);
        for (const m of v.meshes) App.shadow.addShadowCaster(m);
        if (!p.onPitch) v.root.setEnabled(false);
        // yedekler saha kenarında
        if (p.isSub) { p.x = (team.index === 0 ? -1 : 1) * 12 + (p.number % 7) * 1.2; p.z = -(P.halfW + P.margin - 3.5); }
      }
    }
  };

  /* ---------------- Kare ---------------- */
  App.frame = function () {
    const now = performance.now();
    let dt = Math.min(0.1, (now - App.lastT) / 1000); App.lastT = now;
    const match = App.match; if (!match) return;
    const scene = App.scene;
    // Yarı devre arası otomatik devam (5 sn)
    if (match.state === 'halftime') { App.htTimer = (App.htTimer || 0) + dt; if (App.htTimer > 6) { App.htTimer = 0; match.startSecondHalf(); App.director.onEvent({ type: 'kickoff' }, match); App.hideOverlay(); } }
    if (App.running && !App.replayMode && !App.paused) match.update(dt * App.settings.speed);
    else if (App.replayMode) { /* tekrar sırasında sim durur: yayında olay zaten bitti (top oyun dışı) */ }

    // görseller
    App.updateVisuals(dt);
    App.director.update(dt, match, App.ballMesh);
    if (FS.WeatherFX && FS.WeatherFX.active) FS.WeatherFX.update(dt, App.director.pos);
    App.updateHUD(dt);
    if (FS.Audio.enabled) FS.Audio.update(dt, App.director.intensity || 0, match.state);
    if (FS.Voice && FS.Voice.ready && !App.paused) { FS.Voice.update(dt); FS.Voice.flavor(dt, match); }
    scene.render();
    if (FS.Recorder && FS.Recorder.active) FS.Recorder.onFrame(); // video kaydı: aynı görev içinde kopyala (drawing buffer temizlenmeden)
  };

  App.updateVisuals = function (dt) {
    const match = App.match;
    const rf = App.director.replayFrame;
    const ball = match.ball;
    if (rf) {
      // tekrar karesi: oyuncular ve top kayıttan
      App.ballMesh.position.set(rf.bx, rf.by, rf.bz);
      App.ballShadow.position.set(rf.bx, 0.012, rf.bz); App.ballShadow.scaling.setAll(1 + rf.by * 0.5);
      App.updateVarLines(!!(App.director.shot && App.director.shot.varLine));
      for (const arr of rf.ps) {
        const v = App.views.get(arr[0]); if (!v) continue;
        const p = v.p;
        // geçici olarak p değerlerini kaydedip görünümü besle
        const saved = [p.x, p.z, p.facing, p.speed, p.kickAnim, p.fallT, p.tackleT, p.diveT, p.holding, p.kickStyle, p.chestAnim, p.chestKind, p.celebrateT, p.celKneelT];
        p.x = arr[1]; p.z = arr[2]; p.facing = arr[3]; p.speed = arr[4]; p.kickAnim = arr[5]; p.fallT = arr[6]; p.tackleT = arr[7]; p.diveT = arr[8]; p.holding = !!arr[9];
        p.kickStyle = arr[10] || null; p.chestAnim = arr[11] ? 1 : 0; p.chestKind = arr[11] || null; p.celebrateT = 0; p.celKneelT = 0;
        v.update(dt * 0.45, { x: rf.bx, y: rf.by, z: rf.bz });
        [p.x, p.z, p.facing, p.speed, p.kickAnim, p.fallT, p.tackleT, p.diveT, p.holding, p.kickStyle, p.chestAnim, p.chestKind, p.celebrateT, p.celKneelT] = saved;
      }
      return;
    }
    App.updateVarLines(false);
    App.ballMesh.position.set(ball.x, ball.y, ball.z);
    // top dönüşü
    if (ball.rotSpeed > 0.01) { const ax = new BABYLON.Vector3(ball.rotAxis.x, ball.rotAxis.y, ball.rotAxis.z); App.ballMesh.rotate(ax, ball.rotSpeed * dt * App.settings.speed, BABYLON.Space.WORLD); }
    App.ballShadow.position.set(ball.x, 0.012, ball.z); App.ballShadow.scaling.setAll(1 + ball.y * 0.5); App.ballShadow.material.alpha = M.clamp(0.4 - ball.y * 0.06, 0.08, 0.4);
    for (const team of match.teams) for (const p of team.players.concat(team.subs)) {
      const v = p.view; if (!v) continue;
      if (p.hidden) { v.root.setEnabled(false); continue; } // tünelde / tünele girdi
      if (!p.onPitch) {
        if (p.red || p.subbedOff) { v.update(dt * App.settings.speed, ball); continue; } // kenara yürüyor / kulübede oturuyor (animasyonlu)
        if (p.isSub) { v.root.setEnabled(true); v.root.position.set(p.x, 0, p.z); v.root.rotation.y = Math.PI; continue; }
        v.root.setEnabled(false); continue;
      }
      v.update(dt * App.settings.speed, ball);
    }
    if (match.officials) for (const p of match.officials.all) if (p.view) { if (p.hidden) { p.view.root.setEnabled(false); continue; } p.view.update(dt * App.settings.speed, ball); }
    // kontrol halkası
    if (FS.Human.active && FS.Human.player) {
      for (const [, v] of App.views) if (v.ring && v.ring.isEnabled() && v.p !== FS.Human.player) v.setHighlight(false);
      const v = FS.Human.player.view; if (v) v.setHighlight(true, new BABYLON.Color3(1, 1, 1));
    }
  };

  /* VAR ofsayt çizgileri: hücumcu (kırmızı) ve son savunmacı (mavi) hattı — yalnızca VAR tekrarında görünür */
  App.updateVarLines = function (show) {
    const m = App.match; const info = m && m.goalInfo;
    if (!App.varLines) {
      const mk = (name, col) => { const l = BABYLON.MeshBuilder.CreateBox(name, { width: 0.18, height: 0.03, depth: P.width + 4 }, App.scene); const mat = new BABYLON.StandardMaterial(name + 'Mat', App.scene); mat.emissiveColor = col; mat.diffuseColor = col; mat.disableLighting = true; l.material = mat; l.isPickable = false; l.setEnabled(false); return l; };
      App.varLines = { att: mk('varAtt', new BABYLON.Color3(1, 0.15, 0.15)), def: mk('varDef', new BABYLON.Color3(0.2, 0.55, 1)) };
    }
    const on = show && info && info.varPos;
    App.varLines.att.setEnabled(!!on); App.varLines.def.setEnabled(!!on);
    if (on) { App.varLines.att.position.set(info.varPos.x, 0.02, 0); App.varLines.def.position.set(info.varDefX != null ? info.varDefX : info.varPos.x, 0.02, 0); }
  };

  /* ---------------- Olaylar ---------------- */
  const SILENT = { roar() {}, groan() {}, whistle() {}, kick() {}, post() {} };
  App.onMatchEvent = function (ev) {
    const match = App.match;
    if (!App.fastForward) App.director.onEvent(ev, match);
    if (FS.Voice && !App.fastForward) FS.Voice.onEvent(ev, match);
    const Au = App.fastForward ? SILENT : FS.Audio; // hızlı ileri sarmada ses efektleri çalmaz (HUD/skor güncellenir)
    switch (ev.type) {
      case 'goal': {
        App.updateScoreboard();
        App.showBanner(ev.ownGoal ? 'KENDİ KALESİNE GOL' : 'GOOOL!', `${ev.scorer.name} ${ev.minute}${ev.assist ? ' · Asist: ' + ev.assist.shortName : ''}${ev.penalty ? ' (P)' : ''}`, 5200, ev.team);
        Au.roar(0.9); Au.whistle('short');
        App.spawnConfetti(ev.team);
        break;
      }
      case 'shot': Au.kick(1); if (ev.q > 0.2) Au.roar(0.25); break;
      case 'pass': Au.kick(ev.kind === 'lofted' || ev.kind === 'cross' ? 0.6 : 0.3); break;
      case 'save': Au.roar(0.3); App.toast(`Kurtarış: ${ev.p.name}`); break;
      case 'nearmiss': Au.groan(); if (match.ball.hitPost) Au.post(); App.toast(match.ball.hitPost ? `DİREK! ${ev.p.name}` : `Az farkla dışarı — ${ev.p.name}`); break;
      case 'foul': Au.whistle('short'); Au.groan(); break;
      case 'card': App.showBanner(ev.card === 'red' ? 'KIRMIZI KART' : 'SARI KART', `${ev.p.name} (${match.teams[ev.p.team].short})${ev.second ? ' · ikinci sarı' : ''}`, 3000, null, ev.card); App.updateScoreboard(); break;
      case 'offside': App.toast(`Ofsayt — ${ev.p.name}`); Au.whistle('short'); break;
      case 'penalty': App.showBanner('PENALTI', match.teams[ev.team].name, 3000, ev.team); Au.roar(0.6); break;
      case 'corner': App.toast(`Korner — ${match.teams[ev.team].short}`); break;
      case 'sub': App.toast(`Değişiklik (${match.teams[ev.team].short}): ${FS.icon('arrow-up', 12, 'in')} ${ev.in.name} · ${FS.icon('arrow-down', 12, 'out')} ${ev.out.name}`, true); break;
      case 'injury': App.toast(`Sakatlık: ${ev.p.name}`); break;
      case 'advantage': App.toast('Avantaj!'); break;
      case 'addedtime': App.showBanner(`+${ev.minutes}`, 'Uzatma süresi', 2500); break;
      case 'halftime': Au.whistle('triple'); $('varTag').style.display = 'none'; App.hideLowerThird(); App.showOverlay('İLK YARI', true); break;
      case 'fulltime': {
        Au.whistle('triple'); App.running = false;
        if (!App.economyApplied) {
          App.economyApplied = true; FS.Transfer.afterMatch(match.teams[0].id, match.teams[1].id, match.teams[0].score, match.teams[1].score);
          App.careerResult = App.careerMatch && FS.CareerUI ? FS.CareerUI.afterMatch(match) : null;
        }
        App.hideLowerThird();
        App.showOverlay('MAÇ SONU', true);
        // maç sonu: gol varsa otomatik özet (2.2 sn sonra; 'Özeti izle' ile tekrar oynatılabilir)
        if (match.highlights && match.highlights.length) { clearTimeout(App._hlT); App._hlT = setTimeout(() => { if (App.match === match && match.state === 'fulltime') App.playHighlights(); }, 2200); }
        if (FS.Recorder && FS.Recorder.active) App.toast('Video kaydı sürüyor — durdurmak için R / Durdur');
        break;
      }
      case 'secondhalf': App.hideOverlay(); Au.whistle('long'); break;
      case 'kickoff_taken': if (ev.first) Au.whistle('long'); break;
      case 'var_check': App.showBanner('VAR İNCELEMESİ', ev.tight ? 'Olası ofsayt — gol kontrol ediliyor' : 'Gol kontrol ediliyor', 6500, null, 'var'); $('varTag').style.display = 'flex'; break;
      case 'var_decision': {
        $('varTag').style.display = 'none';
        App.updateScoreboard();
        if (ev.decision === 'goal') { App.showBanner('GOL GEÇERLİ', ev.tight ? 'VAR: ofsayt yok' : 'VAR: kontrol tamamlandı', 4000, ev.team, 'var'); Au.roar(0.7); App.spawnConfetti(ev.team); }
        else { App.showBanner('GOL İPTAL', `VAR: ${ev.scorer.name} ofsayt`, 4500, null, 'red'); Au.groan(); }
        break;
      }
      case 'whistle': if (ev.reason === '8sec' || ev.reason === 'doubletouch') Au.whistle('short'); break;
      case 'commentary': App.addCommentary(ev.text); break;
      case 'tackle': if (ev.clean && ev.sliding) Au.roar(0.12); break;
      case 'tactics': {
        const tm = match.teams[ev.team]; const P_ = FS.Tactics.PRESETS[ev.preset];
        App.showLowerThird('tactics', `${FS.icon(P_ ? P_.icon : 'layers', 15)} <b>${tm.short}</b> ${FS.Tactics.presetText(ev.preset, ev.changedFormation ? ev.formation : null)} <small>· ${ev.auto ? 'teknik direktör' : 'sen'}</small>`, 4500, tm);
        if (FS.TacticsUI && FS.TacticsUI.open) FS.TacticsUI.render(true);
        break;
      }
      case 'gkup': App.showLowerThird('msg', `${FS.icon('siren', 15)} <b>${match.teams[ev.team].short}</b> kaleci ${ev.p.shortName} kornere çıkıyor!`, 4000, match.teams[ev.team]); break;
      case 'lineup_line': App.showLineupIntro(0); App._liT = setTimeout(() => App.showLineupIntro(1), 6500); App._liT2 = setTimeout(() => App.hideLineupIntro(), 13000); break;
      case 'lineup_end': case 'kickoff_taken': App.hideLineupIntro(); break;
      case 'goal_lt': break;
    }
  };

  /* ---------------- HUD ---------------- */
  App.updateScoreboard = function () {
    const m = App.match; const T = m.teams;
    $('sbHome').textContent = T[0].short; $('sbAway').textContent = T[1].short;
    $('sbHomeC').style.background = App.kitCss(T[0].kit); $('sbAwayC').style.background = App.kitCss(T[1].kit);
    $('sbScore').textContent = `${T[0].score} - ${T[1].score}`;
    const cards = (t) => (t.stats.reds ? `<span class="rc"></span>`.repeat(t.stats.reds) : '');
    $('sbHomeCards').innerHTML = cards(T[0]); $('sbAwayCards').innerHTML = cards(T[1]);
  };
  /* Kontrol bilgi paneli (sol üst) aç/kapat; #game.ctrl sınıfı yorum akışını panelin altına kaydırır */
  App.setCtrlHud = function (on) {
    $('hudControls').style.display = on ? 'flex' : 'none';
    $('game').classList.toggle('ctrl', !!on);
    $('btnTakeControl').classList.toggle('on', !!on);
    App._ctrlPid = null;
  };
  App.updateHUD = function (dt) {
    const m = App.match;
    $('sbClock').textContent = m.clockText();
    $('sbHalf').textContent = m.state === 'halftime' ? 'DA' : m.state === 'fulltime' ? 'MS' : m.half === 1 ? '1Y' : '2Y';
    // güç çubuğu
    const pw = $('powerBar'); if (FS.Human.active) { pw.style.display = FS.Human.charging ? 'block' : 'none'; $('powerFill').style.width = Math.round(FS.Human.power * 100) + '%'; }
    // kontrol edilen oyuncu adı
    if (FS.Human.active && FS.Human.player) {
      const hp = FS.Human.player;
      if (App._ctrlPid !== hp.id) { App._ctrlPid = hp.id; $('ctrlName').textContent = `${hp.number} ${hp.name}`; $('ctrlTeamC').style.background = App.kitCss(m.teams[hp.team].kit); }
    }
    // duran top ipucu
    if (FS.Human.active) {
      const r = m.restart; let hint = '';
      if ((m.state === 'setup' || m.state === 'ready') && r && r.team === m.humanTeam) {
        const names = { kickoff: 'Başlama vuruşu', throwin: 'Taç', goalkick: 'Kale vuruşu', corner: 'Korner', freekick: 'Serbest vuruş', penalty: 'PENALTI', dropball: 'Hakem atışı' };
        hint = `${names[r.type] || r.type} — ` + (r.type === 'penalty' ? 'yön: sol/sağ ok (yukarı = üst köşe), X ile vur (basılı tut: güç)' : r.type === 'freekick' ? 'X şut · Boşluk pas · C orta' : r.type === 'corner' ? 'C uzak direk · X yakın direk · Boşluk kısa' : r.type === 'goalkick' ? 'Boşluk kısa · C uzun' : 'yön seç + Boşluk');
      }
      $('ctrlHint').textContent = hint;
    }
    // atla düğmesi: tekrar / ara sahne sırasında görünür
    const skippable = (App.director.skipping() || m.state === 'lineup' || m.state === 'var') && m.state !== 'halftime' && (m.state !== 'fulltime' || App._hlWatch);
    if (skippable !== App._skipVis) { App._skipVis = skippable; $('btnSkip').classList.toggle('show', skippable); }
    // TV alt bandı: oyun sürerken periyodik istatistik bandı (tekrar/duraklama sırasında değil)
    App.updatePresentation(dt);
    // maç sonu özeti bitti → sonuç ekranına dön
    if (App._hlWatch && m.state === 'fulltime' && !App.director.skipping()) { App._hlWatch = false; App.showOverlay('MAÇ SONU', true); }
    // istatistik paneli (her 0.5 sn)
    App.hudTimer += dt;
    if (App.hudTimer > 0.5) { App.hudTimer = 0; if (!$('statsPanel').classList.contains('hidden')) App.renderStats(); }
    // isim etiketleri
    App.updateLabels();
  };
  App.updateLabels = function () {
    const m = App.match; const scene = App.scene; const cam = App.director.cam;
    const layer = $('labels');
    if (!App.showNames || App.replayMode || m.state === 'lineup') { layer.innerHTML = ''; return; }
    const w = App.engine.getRenderWidth(), h = App.engine.getRenderHeight();
    const cw = layer.clientWidth, ch = layer.clientHeight;
    let html = '';
    const ball = m.ball;
    const owner = ball.owner;
    const human = FS.Human.player;
    for (const p of m.allOnPitch()) {
      const isOwner = p === owner, isHuman = p === human;
      const d = M.dist(p.x, p.z, ball.x, ball.z);
      // yayın hissi: sadece top sahibi (ve kontrol edilen oyuncu) etiketlenir; diğerleri yalnızca top çok yakınsa
      if (!isOwner && !isHuman && d > 6) continue;
      // kameraya çok uzak etiketleri gösterme (kalabalık olmasın)
      const camD = M.dist(p.x, p.z, cam.position.x, cam.position.z);
      if (!isOwner && !isHuman && camD > 60) continue;
      // oyuncu takip kamerasında kontrol edilen oyuncuya etiket yok: halka + alt HUD'daki isim yeterli (kadrajın ortasını kapatmasın)
      const followCam = App.director.userMode === 'player';
      if (isHuman && followCam) continue;
      const labelY = 2.15;
      // takip kamerasında kontrol edilen oyuncunun hemen yanındaki (kameraya çok yakın) diğer etiketler gizlenir
      if (followCam && !isHuman && !isOwner && camD < 14) continue;
      const v = BABYLON.Vector3.Project(new BABYLON.Vector3(p.x, labelY, p.z), BABYLON.Matrix.Identity(), scene.getTransformMatrix(), cam.viewport.toGlobal(w, h));
      if (v.z < 0 || v.z > 1) continue;
      const x = (v.x / w) * cw, y = (v.y / h) * ch;
      if (x < -50 || x > cw + 50 || y < -30 || y > ch + 30) continue;
      const team = m.teams[p.team];
      const kit = p.role === 'GK' ? team.gkKit : team.kit;
      html += `<div class="lbl ${isOwner ? 'owner' : ''} ${isHuman ? 'human' : ''}" style="left:${x}px;top:${y}px;border-color:${kit.c1}"><b>${p.number}</b> ${p.shortName}${p.yellow ? ' <i class="yc"></i>' : ''}</div>`;
    }
    // oyuncu takip kamerasında top ekran dışındaysa: kenarda topa işaret eden ok
    if (App.director.userMode === 'player' && FS.Human.active) {
      const v = BABYLON.Vector3.Project(new BABYLON.Vector3(ball.x, ball.y + 0.2, ball.z), BABYLON.Matrix.Identity(), scene.getTransformMatrix(), cam.viewport.toGlobal(w, h));
      let sx = (v.x / w) * cw, sy = (v.y / h) * ch;
      const behind = v.z > 1 || v.z < 0;
      if (behind) { sx = cw - sx; sy = ch - sy; } // kameranın arkasında: izdüşüm tersine döner
      const out = behind || sx < 0 || sx > cw || sy < 0 || sy > ch;
      if (out) {
        const m0 = 34; const cxp = cw / 2, cyp = ch / 2;
        const ang = Math.atan2(sy - cyp, sx - cxp);
        const kx = (cw / 2 - m0) / Math.max(1e-3, Math.abs(Math.cos(ang))), kz = (ch / 2 - m0) / Math.max(1e-3, Math.abs(Math.sin(ang)));
        const kk = Math.min(kx, kz);
        const ex = cxp + Math.cos(ang) * kk, ey = cyp + Math.sin(ang) * kk;
        html += `<div class="ballArrow" style="left:${ex}px;top:${ey}px;transform:translate(-50%,-50%) rotate(${ang}rad)"><span></span></div>`;
      }
    }
    layer.innerHTML = html;
  };
  App.renderStats = function () {
    const m = App.match; const T = m.teams; const pp = m.possessionPct();
    const row = (k, a, b) => `<tr><td>${a}</td><th>${k}</th><td>${b}</td></tr>`;
    const s0 = T[0].stats, s1 = T[1].stats;
    let html = `<table><tr class="head"><td>${T[0].short}</td><th></th><td>${T[1].short}</td></tr>`;
    html += row('Topla oynama', pp[0] + '%', pp[1] + '%') + row('Şut', s0.shots, s1.shots) + row('İsabetli şut', s0.shotsOn, s1.shotsOn) + row('xG', s0.xg.toFixed(2), s1.xg.toFixed(2));
    html += row('Pas', s0.passes, s1.passes) + row('Pas isabeti', s0.passes ? Math.round((100 * s0.passesOk) / s0.passes) + '%' : '-', s1.passes ? Math.round((100 * s1.passesOk) / s1.passes) + '%' : '-');
    html += row('Korner', s0.corners, s1.corners) + row('Faul', s0.fouls, s1.fouls) + row('Ofsayt', s0.offsides, s1.offsides) + row('Sarı kart', s0.yellows, s1.yellows) + row('Kırmızı kart', s0.reds, s1.reds) + row('Kurtarış', s0.saves, s1.saves) + row('Değişiklik', T[0].subsUsed + '/5', T[1].subsUsed + '/5');
    html += '</table>';
    // oyuncu listesi
    const plist = (t) => `<ul class="plist">` + t.players.concat(t.subs).filter((p) => p.onPitch || p.subbedOff || p.red).map((p) => `<li class="${p.onPitch ? '' : 'off'}"><b>${p.number}</b> ${p.shortName} <span class="stam"><i style="width:${Math.round(p.stamina * 100)}%;background:${p.stamina > 0.5 ? '#4caf50' : p.stamina > 0.3 ? '#ffb300' : '#e53935'}"></i></span>${p.stats.goals ? ' ' + FS.icon('volleyball', 11) + (p.stats.goals > 1 ? p.stats.goals : '') : ''}${p.stats.assists ? ' <i class="ast">A</i>' : ''}${p.yellow ? ' <i class="yc"></i>' : ''}${p.red ? ' <i class="rc"></i>' : ''}</li>`).join('') + '</ul>';
    html += `<div class="lists"><div>${plist(T[0])}</div><div>${plist(T[1])}</div></div>`;
    $('statsBody').innerHTML = html;
  };
  /* ---------------- TV grafikleri ---------------- */
  App.showLowerThird = function (kind, html, ms, team) {
    const el = $('lowerThird'); if (!el) return;
    el.className = 'lt ' + kind;
    const m = App.match;
    $('ltClock').textContent = m ? m.clockText() : '';
    if (kind === 'stats') {
      const T = m.teams; const pp = m.possessionPct(); const s0 = T[0].stats, s1 = T[1].stats;
      const bar = (lbl, a, b, fa, fb) => { const tot = (a + b) || 1; return `<div class="ltRow"><span class="v">${fa != null ? fa : a}</span><div class="barw"><span class="ltl">${lbl}</span><div class="bar"><i style="width:${Math.round((a / tot) * 100)}%;background:${T[0].kit.c1}"></i><i style="width:${Math.round((b / tot) * 100)}%;background:${T[1].kit.c1}"></i></div></div><span class="v">${fb != null ? fb : b}</span></div>`; };
      $('ltTitle').textContent = html || 'MAÇ İSTATİSTİKLERİ';
      $('ltBody').innerHTML = `<div class="ltTeams"><span><span class="c" style="background:${T[0].kit.c1}"></span>${T[0].short}</span><span>${T[0].score} - ${T[1].score}</span><span class="r">${T[1].short}<span class="c" style="background:${T[1].kit.c1}"></span></span></div>`
        + bar('TOPLA OYNAMA', pp[0], pp[1], pp[0] + '%', pp[1] + '%') + bar('xG', s0.xg, s1.xg, s0.xg.toFixed(2), s1.xg.toFixed(2)) + bar('ŞUT (İSABET)', s0.shots, s1.shots, `${s0.shots} (${s0.shotsOn})`, `${s1.shots} (${s1.shotsOn})`)
        + (s0.passes + s1.passes > 20 ? bar('PAS İSABETİ', s0.passesOk, s1.passesOk, s0.passes ? Math.round((100 * s0.passesOk) / s0.passes) + '%' : '-', s1.passes ? Math.round((100 * s1.passesOk) / s1.passes) + '%' : '-') : '');
    } else {
      $('ltTitle').textContent = kind === 'tactics' ? 'TAKTİK DEĞİŞİKLİĞİ' : 'CANLI';
      $('ltBody').innerHTML = `<div class="ltMsg">${html}</div>`;
    }
    el.style.borderLeft = team ? `5px solid ${team.kit.c1}` : '';
    el.classList.add('show');
    clearTimeout(App._ltT); App._ltT = setTimeout(() => el.classList.remove('show'), ms || 6000);
    App._ltLast = performance.now();
  };
  App.hideLowerThird = function () { const el = $('lowerThird'); if (el) el.classList.remove('show'); clearTimeout(App._ltT); };
  App.updatePresentation = function (dt) {
    const m = App.match; if (!m) return;
    if (m.state !== 'play' || App.replayMode || App.paused || App.fastForward) return;
    App._ltAcc = (App._ltAcc || 0) + dt * m.timeScale * App.settings.speed; // maç saniyesi
    const minute = m.clock / 60;
    // ilk bant 12. dakikadan sonra; sonra her ~15 maç dakikasında bir (gerçek zamanda ~1 dk), banner açıkken değil
    if (minute > 12 && App._ltAcc > 15 * 60 && !$('banner').classList.contains('show') && !(FS.Human && FS.Human.active && FS.Human.charging)) {
      App._ltAcc = 0;
      App.showLowerThird('stats', minute > 46 ? 'İKİNCİ YARI' : 'İLK YARI', 6500);
    }
  };
  /* Kadro tanıtımı (seremoni dizilişi sırasında): önce ev sahibi, sonra deplasman */
  App.showLineupIntro = function (ti) {
    const m = App.match; if (!m || m.state !== 'lineup') return;
    const T = m.teams[ti]; const el = $('lineupIntro');
    const meta = FS.CLUB_META && FS.CLUB_META[T.id];
    el.style.setProperty('--liC', T.kit.c1); $('liC').style.background = T.kit.c1;
    $('liTeam').textContent = T.name.toUpperCase(); const pr = FS.Tactics && T.tactics && FS.Tactics.PRESETS[T.tactics.preset]; $('liSub').textContent = `${T.formation}${pr ? ' · ' + pr.label : ''}${meta && meta.manager ? ' · TD: ' + meta.manager : ''}`;
    const xi = m.playersOnPitch(ti).slice().sort((a, b) => a.slot - b.slot);
    $('liGrid').innerHTML = xi.map((p, i) => `<div class="${p.role === 'GK' ? 'gk' : ''}" style="animation-delay:${i * 0.12}s"><b>${p.number}</b> ${p.name}<small>${p.role}</small></div>`).join('');
    el.classList.remove('hidden');
  };
  App.hideLineupIntro = function () { clearTimeout(App._liT); clearTimeout(App._liT2); const el = $('lineupIntro'); if (el) el.classList.add('hidden'); };
  /* Maç sonu özeti: kaydedilmiş gol klipleri (yönetmen tekrar modu) */
  App.playHighlights = function () {
    const m = App.match; if (!m || !m.highlights || !m.highlights.length) { App.toast('Özet için gol yok'); return false; }
    App.hideOverlay();
    if (App.director.userMode === 'player') { App.director.setUserMode('auto'); $('camSelect').value = 'auto'; } // özet her zaman yayın kameralarıyla
    App.director.playHighlights(m, m.highlights);
    App.toast(`Maç özeti: ${m.highlights.length} gol`);
    App._hlWatch = true;
    return true;
  };
  App.showBanner = function (title, sub, ms, team, card) {
    const b = $('banner');
    b.className = 'banner' + (card ? ' ' + card : '');
    if (team != null) { const k = App.match.teams[team].kit; b.style.borderLeftColor = k.c1; } else b.style.borderLeftColor = '#fff';
    $('bannerTitle').textContent = title; $('bannerSub').textContent = sub;
    b.classList.add('show'); $('game').classList.add('bannerOn'); // yorum akışı bandın altına kayar
    clearTimeout(App.bannerT); App.bannerT = setTimeout(() => { b.classList.remove('show'); $('game').classList.remove('bannerOn'); }, ms);
  };
  App.toast = function (text, html) {
    const box = $('toasts');
    // hızlı ileri sarma / yoğun olay akışında birikmesin: en fazla 4 bildirim, gerçek zamanla sil
    while (box.children.length >= 4) box.firstChild.remove();
    const t = document.createElement('div'); t.className = 'toast'; if (html) t.innerHTML = text; else t.textContent = text; box.appendChild(t);
    const born = performance.now(); t._born = born;
    setTimeout(() => t.classList.add('show'), 10);
    const life = 2600 / Math.max(1, App.settings.speed);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, life);
  };
  App.addCommentary = function (text) {
    const c = $('commentary'); const li = document.createElement('div'); li.textContent = `${App.match.minuteLabel()} ${text}`; c.prepend(li);
    while (c.children.length > 3) c.lastChild.remove();
    setTimeout(() => { if (li.parentNode) li.remove(); }, 9000); // eski satırlar kendiliğinden kalkar (skor tabelasının altı kalabalık olmasın)
  };
  App.showOverlay = function (title, withStats) {
    const m = App.match; const T = m.teams;
    $('ovTitle').textContent = title; $('ovScore').textContent = `${T[0].name} ${T[0].score} - ${T[1].score} ${T[1].name}`;
    const scorers = (t) => t.players.concat(t.subs).filter((p) => p.stats.goals || p.stats.ownGoals).map((p) => `${p.shortName}${p.stats.goals > 1 ? ' x' + p.stats.goals : ''}${p.stats.ownGoals ? ' (KK)' : ''}`).join(', ');
    $('ovScorers').textContent = [scorers(T[0]), scorers(T[1])].filter(Boolean).join('  |  ');
    App.renderStats(); $('ovStats').innerHTML = $('statsBody').innerHTML;
    if (m.state === 'fulltime' && FS.Transfer) {
      const f0 = FS.Transfer.finance(T[0].id), f1 = FS.Transfer.finance(T[1].id);
      const line = (t, f) => `${t.short}: ${f.lastDelta >= 0 ? '+' : ''}${f.lastDelta.toFixed(1)} M€ (hasılat + prim − haftalık maaş) → bütçe ${FS.Transfer.fmt(f.budget)}`;
      $('ovStats').innerHTML += `<div class="econ">${line(T[0], f0)}<br>${line(T[1], f1)}</div>`;
      if (App.careerResult && FS.Career.state) {
        const r = App.careerResult; const st = FS.Career.state; const club = FS.getTeam(st.club);
        const over = FS.Career.isSeasonOver();
        $('ovStats').innerHTML += `<div class="econ career">${FS.icon('trophy', 14)} Kariyer · ${r.g ? r.g.hs + '-' + r.g.as : ''} · ${club.short} ligde <b>${r.pos}.</b> sırada${r.motm ? ' · maçın adamı: <b>' + r.motm.name + '</b>' : ''}${over ? ' · <b>SEZON TAMAMLANDI</b>' : ' · sonraki hafta: ' + st.week}</div>`;
      }
    }
    $('overlay').classList.remove('hidden');
    $('btnContinue').style.display = m.state === 'halftime' ? 'inline-block' : 'none';
    $('btnMenu2').style.display = m.state === 'fulltime' ? 'inline-block' : 'none';
    $('btnHighlights').style.display = m.state === 'fulltime' && m.highlights && m.highlights.length ? 'inline-flex' : 'none';
    $('btnMenu2').innerHTML = App.careerResult ? FS.icon('trophy', 16) + ' Kariyere dön' : FS.icon('menu', 16) + ' Menü';
  };
  App.hideOverlay = function () { $('overlay').classList.add('hidden'); };
  App.setSpeed = function (s) { App.settings.speed = s; document.querySelectorAll('#speedBtns button').forEach((b) => b.classList.toggle('on', parseFloat(b.dataset.s) === s)); };

  App.spawnConfetti = function (team) {
    // Tribünden konfeti: golün atıldığı kale arkasındaki tribünün üst kenarından, sahaya doğru süzülür
    const scene = App.scene; const k = App.match.teams[team].kit;
    const info = App.match.goalInfo; const gx = info && info.x != null ? info.x : 0;
    const side = gx >= 0 ? 1 : -1;
    const ps = new BABYLON.ParticleSystem('confetti', 900, scene);
    const tex = new BABYLON.DynamicTexture('ct', { width: 16, height: 16 }, scene, false); const c = tex.getContext(); c.fillStyle = '#fff'; c.fillRect(0, 0, 16, 16); tex.update();
    ps.particleTexture = tex;
    ps.emitter = new BABYLON.Vector3(side * (P.halfL + 16), 14, 0);
    ps.minEmitBox = new BABYLON.Vector3(-2, 0, -30); ps.maxEmitBox = new BABYLON.Vector3(2, 6, 30);
    ps.color1 = BABYLON.Color4.FromHexString(k.c1 + 'ff'); ps.color2 = BABYLON.Color4.FromHexString((k.c2 || '#ffffff') + 'ff'); ps.colorDead = new BABYLON.Color4(1, 1, 1, 0);
    ps.minSize = 0.06; ps.maxSize = 0.14; ps.minLifeTime = 3; ps.maxLifeTime = 6; ps.emitRate = 220;
    ps.gravity = new BABYLON.Vector3(0, -1.6, 0); ps.direction1 = new BABYLON.Vector3(-side * 2, 1.5, -1); ps.direction2 = new BABYLON.Vector3(-side * 5, 3.5, 1);
    ps.minEmitPower = 0.6; ps.maxEmitPower = 1.4;
    ps.minAngularSpeed = -4; ps.maxAngularSpeed = 4; ps.targetStopDuration = 2.2; ps.disposeOnStop = true;
    ps.start();
  };

  /* ---------------- Oyun içi kontroller ---------------- */
  App.initGameUI = function () {
    $('camSelect').onchange = (e) => App.director.setUserMode(e.target.value);
    $('lenSelect').onchange = (e) => { const min = parseFloat(e.target.value); App.settings.halfMin = min; if (App.match) { App.match.setHalfLength(min * 60); App.toast(`Maç süresi: 2 × ${min} dk`); } };
    document.querySelectorAll('#speedBtns button').forEach((b) => (b.onclick = () => App.setSpeed(parseFloat(b.dataset.s))));
    $('btnStats').onclick = () => { $('statsPanel').classList.toggle('hidden'); App.renderStats(); };
    $('btnTactics').onclick = () => { if (FS.TacticsUI) FS.TacticsUI.toggle(); };
    $('pmTactics').onclick = () => { App.setPaused(false, true); if (FS.TacticsUI) FS.TacticsUI.show(true); };
    $('btnHighlights').onclick = () => App.playHighlights();
    if (FS.TacticsUI) FS.TacticsUI.init();
    $('btnCloseStats').onclick = () => App.closePanels();
    $('btnPause').onclick = () => App.setPaused(!App.paused);
    $('pmResume').onclick = () => App.setPaused(false);
    $('pmMenu').onclick = () => { App.setPaused(false); App.backToMenu(); };
    $('pmControl').onclick = () => { App.toggleControl(); App.syncPauseMenu(); };
    $('pmStats').onclick = () => { App.setPaused(false, true); $('statsPanel').classList.remove('hidden'); App.renderStats(); };
    $('pmHelp').onclick = () => { App.setPaused(false, true); $('helpPanel').classList.remove('hidden'); };
    $('pmRec').onclick = () => {
      if (!FS.Recorder) return;
      if (FS.Recorder.active) { FS.Recorder.stop(); App.syncPauseMenu(); } // menü açık kalır; kaydetme ekranı üstünde açılır, kapanınca menüye dönülür
      else { App.setPaused(false); FS.Recorder.start(); }
    };
    $('pmLen').onchange = (e) => { $('lenSelect').value = e.target.value; $('lenSelect').onchange({ target: $('lenSelect') }); };
    $('pmCam').onchange = (e) => { $('camSelect').value = e.target.value; App.director.setUserMode(e.target.value); };
    $('pauseMenu').addEventListener('click', (e) => { if (e.target === $('pauseMenu')) App.setPaused(false); });
    $('btnNames').onclick = () => { App.showNames = !App.showNames; $('btnNames').classList.toggle('on', App.showNames); };
    $('btnSound').onclick = () => { if (!FS.Audio.enabled) { FS.Audio.init(); $('btnSound').classList.add('on'); FS.setIcon($('btnSound'), 'volume-2'); if (FS.WeatherFX && FS.WeatherFX.pendingAudio) FS.WeatherFX.audio(FS.WeatherFX.pendingAudio); } else { const on = !(FS.Audio.master.gain.value > 0); FS.Audio.master.gain.value = on ? 0.7 : 0; $('btnSound').classList.toggle('on', on); FS.setIcon($('btnSound'), on ? 'volume-2' : 'volume-x'); } };
    $('btnVoice').onclick = () => { const V = FS.Voice; V.enabled = !V.enabled; if (!V.enabled) V.clear(); $('btnVoice').classList.toggle('on', V.enabled); FS.setIcon($('btnVoice'), V.enabled ? 'mic' : 'mic-off'); App.toast(V.enabled ? 'Spiker açık' : 'Spiker kapalı'); };
    $('btnMenu').onclick = () => { if (App.match && App.match.state !== 'fulltime') App.setPaused(true); else App.backToMenu(); }; // maç sürerken duraklatma menüsü (yanlışlıkla çıkış olmasın)
    $('btnMenu2').onclick = () => App.backToMenu();
    $('btnContinue').onclick = () => { if (App.match.state === 'halftime') { App.match.startSecondHalf(); App.director.onEvent({ type: 'kickoff' }, App.match); App.hideOverlay(); App.htTimer = 0; } };
    $('btnTakeControl').onclick = () => App.toggleControl();
    $('btnHelp').onclick = () => $('helpPanel').classList.toggle('hidden');
    $('btnCloseHelp').onclick = () => App.closePanels();
    $('btnSkip').onclick = () => { App.skipScene(); $('btnSkip').blur(); };
    if (FS.Touch) FS.Touch.init();
    if (FS.Recorder) FS.Recorder.init();
    $('btnFull').onclick = () => App.toggleFullscreen();
    window.addEventListener('keydown', (e) => {
      if (!App.match) return;
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return; // dosya adı vb. yazarken kısayollar çalışmasın
      if (e.code === 'KeyR' && FS.Recorder) { FS.Recorder.toggle(); return; }
      if (e.code === 'KeyF') { App.toggleFullscreen(); return; }
      if (e.code === 'Enter' || e.code === 'Backspace') { if (App.skipScene()) e.preventDefault(); }
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (e.code === 'Escape' && (!$('statsPanel').classList.contains('hidden') || !$('helpPanel').classList.contains('hidden') || !$('tacPanel').classList.contains('hidden'))) { App.closePanels(); return; }
        if (e.code === 'Escape' && !$('recDlg').classList.contains('hidden')) return;
        App.setPaused(!App.paused);
      }
      if (e.code === 'Tab') { e.preventDefault(); $('btnStats').click(); }
      if (e.code === 'KeyT') App.toggleControl();
      if (e.code === 'KeyH') $('helpPanel').classList.toggle('hidden');
      if (e.code === 'KeyG' && FS.TacticsUI) FS.TacticsUI.toggle();
      if (e.code === 'KeyV') { const sel = $('camSelect'); sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length; App.director.setUserMode(sel.value); }
      if (e.code === 'Digit1') App.setSpeed(1); if (e.code === 'Digit2') App.setSpeed(2); if (e.code === 'Digit3') App.setSpeed(4); if (e.code === 'Digit0') App.setSpeed(0.5);
    });
  };
  /* Hava durumu: menü ipucu ve skorbord rozeti */
  App.updateWxHint = function () {
    const el = $('wxHint'); if (!el || !FS.Weather) return;
    const id = App.settings.weather; const p = FS.Weather.PRESETS[id];
    // .hint bir flex kutu: metin tek bir <span> içinde olmalı (yoksa metin düğümü ikonun yanında ayrı sütun gibi kırpılır)
    el.innerHTML = FS.icon('info', 12) + `<span>${p ? `<b>${p.name}</b> · ${p.tempC}°C · ${p.desc}.` : 'Her maçta gerçekçi olasılıklarla rastgele hava (açık/bulutlu sık, kar ve sağanak seyrek).'} Islak zeminde top hızlanır ve sekmez, karda yavaşlar; siste uzun paslar, rüzgârda uzun toplar sapar; sıcakta kondisyon hızlı tükenir.</span>`;
  };
  App.updateWxBadge = function () {
    const el = $('sbWx'); const w = App.match && App.match.weather; if (!el) return;
    if (!w || !FS.Weather) { el.style.display = 'none'; return; }
    el.style.display = 'flex'; el.innerHTML = `${FS.icon(w.icon, 13)}<span>${w.tempC}°</span>`; el.title = FS.Weather.summary(w);
  };
  /* Alt barın gerçek yüksekliğini CSS değişkenine yazar (dikey telefonda bar iki satıra sarınca dokunma düğmeleri barın üstünde kalır) */
  App.syncBarHeight = function () {
    const g = $('game'), bar = $('bar'); if (!g || !bar) return;
    const h = Math.max(48, Math.round(bar.getBoundingClientRect().height || 64));
    g.style.setProperty('--barH', h + 'px');
  };
  /* "Telefonu yatay çevirin" ipucu: dikey küçük ekranda 5 sn görünür, sonra solar; ekran döndürülünce hemen kalkar */
  App.showRotateHint = function () {
    const el = $('rotateHint'); if (!el) return;
    clearTimeout(App._rotT1); clearTimeout(App._rotT2);
    el.classList.remove('hidden', 'gone');
    App._rotT1 = setTimeout(() => el.classList.add('gone'), 5000);
    App._rotT2 = setTimeout(() => el.classList.add('hidden'), 5700);
    if (!App._rotBound) {
      App._rotBound = true;
      const onOrient = () => { if (window.innerWidth > window.innerHeight) { el.classList.add('hidden'); clearTimeout(App._rotT1); clearTimeout(App._rotT2); } };
      window.addEventListener('resize', onOrient);
      if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', onOrient);
    }
  };
  /* Duraklat / devam: duraklatma menüsü (Devam et, kontrol, istatistik, süre, kamera, çıkış) */
  App.setPaused = function (on, keepPausedSilently) {
    App.paused = !!on || !!keepPausedSilently;
    App.silentPause = !on && !!keepPausedSilently; // menüden açılan panel (istatistik/yardım) kapanınca oyun kendiliğinden sürer
    FS.setIcon($('btnPause'), App.paused ? 'play' : 'pause'); $('btnPause').classList.toggle('on', App.paused);
    $('pauseMenu').classList.toggle('hidden', !on);
    if (on) App.syncPauseMenu();
    if (FS.Human) { FS.Human.keys = {}; FS.Human.charging = null; } // basılı tuşlar takılı kalmasın
  };
  App.closePanels = function () {
    $('statsPanel').classList.add('hidden'); $('helpPanel').classList.add('hidden'); $('tacPanel').classList.add('hidden'); if (FS.TacticsUI) FS.TacticsUI.open = false;
    if (App.silentPause) App.setPaused(true); // menüden gelinmişti: menüye dön
  };
  App.syncPauseMenu = function () {
    const m = App.match; if (!m) return;
    $('pmScore').innerHTML = `${m.teams[0].name} <b>${m.teams[0].score} - ${m.teams[1].score}</b> ${m.teams[1].name}<small>${m.clockText()} · ${m.half === 1 ? '1. YARI' : '2. YARI'}</small>`;
    $('pmLen').value = $('lenSelect').value; $('pmCam').value = $('camSelect').value;
    $('pmControl').querySelector('span').textContent = FS.Human.active ? 'Kontrolü bırak (izle)' : 'Kontrolü devral';
    $('pmRec').querySelector('span').textContent = FS.Recorder && FS.Recorder.active ? 'Kaydı durdur' : 'Video kaydı başlat';
  };
  /* Tekrar / ara sahneyi atla (Enter, Backspace, Atla düğmesi) */
  App.skipScene = function () {
    const m = App.match;
    if (!App.director || !(App.director.skipping() || (m && (m.state === 'lineup' || m.state === 'var')))) return false;
    if (m && m.state === 'fulltime') { App.director.skip(); $('hlTag').classList.remove('show'); return true; } // özet atlandı → frame() sonuç ekranını geri getirir
    App.hideLineupIntro();
    const wasLineup = !!(m && (m.state === 'lineup' || m.lineupPhase === 'tunnel' || m.lineupPhase === 'walk'));
    App.director.skip();
    if (m && m.state === 'var' && m.varReview) { const vr = m.varReview; if (!vr.decided) vr.t = Math.max(vr.t, vr.decideAt - 0.05); else vr.t = Math.max(vr.t, vr.dur - 0.05); }
    $('varTag').style.display = 'none';
    if (m && m.state !== 'halftime' && m.state !== 'fulltime') {
      // Ara sahnenin (sevinç, tekrar, yürüyüş) kapladığı süreyi sessizce ileri sar: oyun yeniden başlamaya hazır olana kadar
      // (en fazla 14 sn simülasyon). Böylece "Atla" sonrası oyuncuların yerlerine yürümesini beklemek gerekmez.
      if (m.state === 'lineup') m.endLineup();
      m.skipWait();
      App.fastForward = true;
      let steps = 0;
      const stopStates = ['ready', 'play', 'halftime', 'fulltime', 'pre'];
      while (steps < 60 * 30 && !stopStates.includes(m.state)) {
        if (m.state === 'setup' && m.restart && m.restart.timer > 1.0) m.restart.timer = 1.0;
        if (m.state === 'goal' && m.stateT < 4.9) m.stateT = 4.9;
        if (m.state === 'var' && m.varReview) { const vr = m.varReview; if (!vr.decided && vr.t < vr.decideAt - 0.05) vr.t = vr.decideAt - 0.05; else if (vr.decided && vr.t < vr.dur - 0.05) vr.t = vr.dur - 0.05; }
        m.update(1 / 60); steps++;
      }
      App.fastForward = false;
    }
    if (FS.Voice) {
      // Atlanan sahnenin anlatımı da kesilir: açılış konuşması (seremoni) tamamen, diğer bekleyen düşük öncelikli satırlar atılır
      FS.Voice.skipPreMatch();
      FS.Voice.queue = FS.Voice.queue.filter((q) => q.prio >= 2 && !(q.tag && q.tag.startsWith('pre')));
      if (wasLineup) FS.Voice.clear();
    }
    App.director.forceCut = true;
    App.toast('Atlandı');
    return true;
  };
  App.toggleControl = function () {
    const m = App.match; if (!m) return;
    if (FS.Human.active) { FS.Human.disable(m); App.director.setUserMode('auto'); $('camSelect').value = 'auto'; App.setCtrlHud(false); App.toast('İzleme modu'); for (const [, v] of App.views) if (v.ring) v.setHighlight(false); }
    else { const team = App.settings.humanTeam != null ? App.settings.humanTeam : 0; FS.Human.enable(m, team); App.director.setUserMode('player'); $('camSelect').value = 'player'; App.setCtrlHud(true); App.toast(`Kontrol: ${m.teams[team].name} (T ile bırak)`); }
    if (FS.Touch) FS.Touch.show(FS.Human.active);
    requestAnimationFrame(() => App.syncBarHeight());
  };
  App.toggleFullscreen = function () {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      const p = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null;
      if (p && p.then) p.then(() => { try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* desteklenmiyor */ } }).catch(() => App.toast('Tam ekran açılamadı'));
    } else if (document.exitFullscreen) document.exitFullscreen();
  };
  App.backToMenu = function () {
    if (FS.Recorder && FS.Recorder.active) FS.Recorder.stop(); // kayıt sürüyorsa durdur → kaydetme ekranı menü üstünde açılır
    if (FS.WeatherFX) FS.WeatherFX.dispose();
    if (FS.Touch) FS.Touch.show(false);
    $('pauseMenu').classList.add('hidden'); App.paused = false;
    App.running = false; App.hideOverlay(); $('statsPanel').classList.add('hidden'); $('tacPanel').classList.add('hidden'); if (FS.TacticsUI) FS.TacticsUI.open = false;
    App.hideLowerThird(); App.hideLineupIntro(); $('hlTag').classList.remove('show'); clearTimeout(App._hlT); App._hlWatch = false; App._ltAcc = 0;
    $('game').classList.add('hidden'); $('menu').classList.remove('hidden');
    if (App.match) { FS.Human.disable(App.match); }
    if (FS.Voice) FS.Voice.clear();
    App.match = null;
    if (App.renderTeamGrid) { App.renderTeamGrid(); App.updateMenuSummary(); }
    if (App.careerResult && FS.CareerUI) { App.careerResult = null; FS.CareerUI.open(); }
    App.careerMatch = null;
  };

  window.addEventListener('DOMContentLoaded', () => { FS.applyIcons(); App.initMenu(); App.initGameUI(); if (FS.CareerUI) FS.CareerUI.init(); if (FS.Career) FS.Career.load(); });
})(typeof window !== 'undefined' ? window : globalThis);
