/* İnsan oyuncu kontrolü (klavye + gamepad)
   Klavye: Yön tuşları/WASD hareket, Shift sprint, Space/K pas, X/L şut (basılı tut = güç), C/J uzun top/orta, Q oyuncu değiştir,
           savunmada: Space baskı/kapma, X kayarak müdahale, E kaleci çıkışı, D ara pası
*/
(function (root) {
  const FS = (root.FS = root.FS || {});
  const M = FS.M, P = FS.PITCH, A = FS.Actions, AI = FS.AI;
  const H = (FS.Human = {
    active: false, team: null, player: null,
    keys: {}, power: 0, charging: null, chargeT: 0,
    switchCd: 0, pendingAction: null, lastPassT: -9, autoSwitchT: 0, cursorLock: 0,
    restartReq: null, camDir: 1,
  });

  H.init = function (canvas) {
    const inField = (e) => e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    window.addEventListener('keydown', (e) => {
      if (inField(e)) return;
      if (e.repeat) { H.keys[e.code] = true; return; }
      H.keys[e.code] = true;
      if (!H.active) return;
      if (['Space', 'KeyX', 'KeyC', 'KeyK', 'KeyL', 'KeyJ', 'KeyD'].includes(e.code)) { H.beginCharge(e.code); }
      if (e.code === 'KeyQ') H.requestSwitch();
      if (e.code === 'KeyE') H.gkRush = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      if (inField(e)) return;
      H.keys[e.code] = false;
      if (!H.active) return;
      if (H.charging === e.code) H.releaseCharge(e.code);
    });
    window.addEventListener('blur', () => { H.keys = {}; H.charging = null; });
  };

  H.beginCharge = function (code) { if (H.charging) return; H.charging = code; H.chargeT = 0; };
  H.releaseCharge = function (code) {
    const t = H.chargeT; H.charging = null;
    const power = M.clamp(0.3 + t * 1.1, 0.3, 1);
    const act = code === 'Space' || code === 'KeyK' ? 'pass' : code === 'KeyX' || code === 'KeyL' ? 'shoot' : code === 'KeyC' || code === 'KeyJ' ? 'lob' : 'through';
    H.pendingAction = { act, power, t: 0 };
    H.restartReq = { act, power };
  };
  H.requestSwitch = function () { H.switchReq = true; };

  H.axis = function () {
    let x = 0, y = 0;
    if (H.keys.ArrowLeft || H.keys.KeyA) x -= 1;
    if (H.keys.ArrowRight || H.keys.KeyD && !H.keys.ArrowRight) x += H.keys.KeyD ? 0 : 1; // D ara pası için ayrıldı; sağ ok kullan
    if (H.keys.ArrowRight) x = 1;
    if (H.keys.ArrowUp || H.keys.KeyW) y += 1;
    if (H.keys.ArrowDown || H.keys.KeyS) y -= 1;
    // dokunmatik joystick
    if (FS.Touch && FS.Touch.visible && FS.Touch.axis.l > 0) { x = FS.Touch.axis.x; y = FS.Touch.axis.y; }
    // gamepad
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of gps) {
      if (!gp) continue;
      const ax = gp.axes[0] || 0, ay = -(gp.axes[1] || 0);
      if (Math.abs(ax) > 0.2) x = ax; if (Math.abs(ay) > 0.2) y = ay;
      H.gpButtons(gp);
    }
    const l = Math.sqrt(x * x + y * y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y, l: Math.min(1, l) };
  };
  H.prevGp = {};
  H.gpButtons = function (gp) {
    const map = { 0: 'Space', 2: 'KeyX', 1: 'KeyC', 3: 'KeyD', 4: 'KeyQ', 5: 'Shift' };
    for (const i in map) {
      const pressed = gp.buttons[i] && gp.buttons[i].pressed;
      const was = H.prevGp[i];
      if (pressed && !was) { if (map[i] === 'KeyQ') H.requestSwitch(); else if (map[i] === 'Shift') H.keys.ShiftLeft = true; else H.beginCharge(map[i]); }
      if (!pressed && was) { if (map[i] === 'Shift') H.keys.ShiftLeft = false; else if (H.charging === map[i]) H.releaseCharge(map[i]); }
      H.prevGp[i] = pressed;
    }
  };

  H.enable = function (match, teamIdx) {
    H.active = true; H.team = teamIdx; match.humanTeam = teamIdx;
    match.teams[teamIdx].controlled = true;
    H.player = H.pickAuto(match);
  };
  H.disable = function (match) { H.active = false; if (match) { match.humanTeam = null; match.teams.forEach((t) => (t.controlled = false)); } H.player = null; };

  // Otomatik oyuncu seçimi: top bizdeyse taşıyıcı, değilse topa en yakın (kaleci hariç)
  H.pickAuto = function (match, excl) {
    const ball = match.ball;
    const ps = match.playersOnPitch(H.team).filter((p) => p.role !== 'GK' && p !== excl && p.fallT <= 0);
    if (ball.owner && ball.owner.team === H.team && ball.owner.role !== 'GK') return ball.owner;
    let best = null, bt = 1e9;
    for (const p of ps) { const ip = match.interceptPoint(p); const t = ip.t + M.dist(p.x, p.z, ip.x, ip.z) * 0.01; if (t < bt) { bt = t; best = p; } }
    return best || ps[0];
  };

  H.onSubstitution = function (match, out, sub) { if (H.player === out) H.player = sub; };

  // Duran top: insan seçim yapmak istiyor mu?
  H.wantsRestart = function (match, r) { return !!H.restartReq; };
  H.restartChoice = function (match, r) {
    const req = H.restartReq; H.restartReq = null;
    const ax = H.axis();
    const dir = match.dirOf(r.team);
    if (r.type === 'penalty') {
      // sol/sağ ok = ekrandaki sol/sağ köşe (kamera kale arkasında ya da atıcının arkasında olabilir); kamera yandan bakıyorsa sağ = +z (uzak direk)
      const sr = H.screenRight(); const zSign = Math.abs(sr.z) > 0.3 ? Math.sign(sr.z) : 1;
      return { side: ax.x !== 0 ? Math.sign(ax.x) * zSign : (M.chance(0.5) ? 1 : -1), high: ax.y > 0.3, power: req.power };
    }
    if (r.type === 'freekick') return { shoot: req.act === 'shoot', power: req.power };
    if (r.type === 'corner') return { short: req.act === 'pass', zone: req.act === 'lob' ? 2 : req.act === 'shoot' ? 0 : 1 };
    if (r.type === 'goalkick') return { long: req.act !== 'pass' };
    if (r.type === 'throwin') return { target: H.aimTarget(match, r.taker, ax) || match.bestThrowTarget(r.taker) };
    return {};
  };

  // Girdi ekseni → dünya yönü. Oyuncu takip kamerasında "yukarı" = kameranın baktığı yön, "sağ" = kameranın sağı;
  // yayın/diğer kameralarda (−z tarafından bakış) yukarı = +z (uzak taraf), sağ = +x.
  H.worldDir = function (ax) {
    let yaw = FS.App && FS.App.director && FS.App.director.userMode === 'player' ? FS.App.director.controlYaw() : null;
    if (yaw == null) { H.latch = null; return { x: ax.x, z: ax.y }; }
    // Yön kilidi: tuş/çubuk basılı kaldığı sürece, kamera dönse de koşu yönü (dünya) değişmez; girdi yönü ~25°'den çok değişince
    // ya da bırakılınca kilit yenilenir (FIFA/PES'teki gibi — kamera dönerken oyuncu savrulmaz).
    if (ax.l < 0.2) H.latch = null;
    else {
      const L = H.latch;
      // (kamera dönünce kilit YENİLENMEZ: yenilense oyuncu tuş basılıyken daire çizerdi — kamera arkasına dolanırken koşu yönü sabit kalır)
      if (!L || Math.abs(M.angleDiff(Math.atan2(L.ay, L.ax), Math.atan2(ax.y, ax.x))) > 0.45) H.latch = { yaw, ax: ax.x, ay: ax.y };
      yaw = H.latch.yaw;
    }
    const fx = Math.cos(yaw), fz = Math.sin(yaw);   // ileri (kameranın baktığı yön, yer düzlemi)
    // Babylon sol-el sistemi: sağ = yukarı × ileri = (sin yaw, 0, −cos yaw). Kontrol: yaw=π/2 (+z'ye bakış, yayın kamerası) → sağ = +x ✓
    const sx = fz, sz = -fx;
    return { x: fx * ax.y + sx * ax.x, z: fz * ax.y + sz * ax.x };
  };
  // Ekranın sağı dünya uzayında hangi yön? (penaltıda sol/sağ köşe seçimi için) — etkin kameradan okunur
  H.screenRight = function () {
    try { const d = FS.App && FS.App.director; if (d && d.cam) { const r = d.cam.getDirection(BABYLON.Axis.X); return { x: r.x, z: r.z }; } } catch (e) { /* başsız test */ }
    return { x: 1, z: 0 };
  };
  H.aimTarget = function (match, p, ax, opts) {
    const o = opts || {};
    const dir = match.dirOf(p.team);
    let wd = ax.l > 0.2 ? H.worldDir(ax) : { x: Math.cos(p.facing), z: Math.sin(p.facing) };
    const wn = M.norm(wd.x, wd.z);
    let best = null, bs = -1e9;
    for (const m of match.playersOnPitch(p.team)) {
      if (m === p) continue;
      const dx = m.x - p.x, dz = m.z - p.z; const d = M.len(dx, dz);
      if (d < 2 || d > (o.maxD || 45)) continue;
      const cos = (dx * wn.x + dz * wn.z) / d;
      if (cos < 0.5) continue;
      let sc = cos * 10 - d * 0.08 + (o.forward ? (dx * dir) * 0.1 : 0) + Math.min(6, AI.nearestOpp(match, p.team, m.x, m.z).d) * 0.3;
      if (sc > bs) { bs = sc; best = m; }
    }
    return best;
  };

  /* Her karede: kontrol edilen oyuncuyu güncelle; döndürülen oyuncu AI tarafından atlanır */
  H.update = function (match, dt) {
    if (!H.active || H.team == null) return null;
    const ball = match.ball;
    H.switchCd = Math.max(0, H.switchCd - dt);
    if (H.charging) H.chargeT += dt;
    // oyuncu seçimi
    let p = H.player;
    if (!p || !p.onPitch || p.red || p.role === 'GK') { p = H.player = H.pickAuto(match); }
    if (p) p.faceAt = null; // insan kontrolünde yüz, hareket yönünü izler
    if (ball.owner && ball.owner.team === H.team && ball.owner !== p && ball.owner.role !== 'GK') { p = H.player = ball.owner; }
    if (H.switchReq) { H.switchReq = false; if (!(ball.owner && ball.owner === p)) { p = H.player = H.pickAuto(match, p); H.switchCd = 0.5; } }
    // otomatik geçiş: savunmada top sahibi değilse ve başka oyuncu çok daha yakınsa (0.8 sn'de bir)
    if (!(ball.owner && ball.owner.team === H.team)) {
      H.autoSwitchT += dt;
      if (H.autoSwitchT > 0.8 && H.switchCd <= 0 && H.axis().l < 0.2) {
        H.autoSwitchT = 0;
        const alt = H.pickAuto(match, null);
        if (alt && alt !== p && AI.timeToReach(alt, ball.x, ball.z) + 0.6 < AI.timeToReach(p, ball.x, ball.z)) { p = H.player = alt; }
      }
    }
    if (!p) return null;
    if (p.enterWait > 0) { p.enterWait -= dt; A.stop(p, dt); return p; } // yeni giren oyuncu: çizgide bekle
    if (p.fallT > 0 || p.stunT > 0 || p.tackleT > 0) { A.stop(p, dt); return p; }
    const ax = H.axis();
    const sprint = !!(H.keys.ShiftLeft || H.keys.ShiftRight);
    const dir = match.dirOf(H.team);
    const goal = P.goalCenter(dir);
    const act = H.pendingAction; H.pendingAction = null;
    if (p.hasBall) {
      p.wantSprint = sprint;
      // hareket
      if (ax.l > 0.15) {
        const wd = H.worldDir(ax);
        A.moveToward(p, p.x + wd.x * 5, p.z + wd.z * 5, sprint, dt, { arrive: 0.1, speedCap: p.maxSpeed * (sprint ? 0.92 : 0.7) * ax.l });
      } else A.stop(p, dt);
      // şarj göstergesi
      H.power = H.charging ? M.clamp(0.3 + H.chargeT * 1.1, 0.3, 1) : 0;
      if (act) {
        const pressure = A.pressureOn(p, match.playersOnPitch(1 - H.team));
        if (act.act === 'shoot') {
          const gk = match.gkOf(1 - H.team);
          const side = ax.l > 0.2 ? Math.sign(ax.y || (gk && gk.z > 0 ? -1 : 1)) : (gk ? (gk.z > 0 ? -1 : 1) : 1);
          const aimZ = side * M.lerp(1.0, 3.2, Math.abs(ax.y));
          const aimY = act.power > 0.85 ? M.rand(1.2, 2.0) : M.rand(0.3, 1.0);
          A.faceTo(p, goal.x, aimZ);
          A.shoot(p, ball, { x: goal.x, z: aimZ, y: aimY }, act.power, { pressure, style: act.power < 0.5 ? 'finesse' : 'normal' });
          match.onShot(p, { q: AI.shotQuality(match, p, ball.x, ball.z) });
        } else if (act.act === 'pass' || act.act === 'through') {
          const tgt = H.aimTarget(match, p, ax, { forward: act.act === 'through' });
          if (tgt) {
            const lead = act.act === 'through' ? 7 : 0.5;
            const aim = { x: tgt.x + tgt.vx * lead * 0.35 + (act.act === 'through' ? dir * lead : 0), z: tgt.z + tgt.vz * lead * 0.35 };
            A.faceTo(p, aim.x, aim.z);
            A.pass(p, ball, aim, act.act === 'through' ? 'through' : 'ground', { pressure, power: 0.9 + act.power * 0.3 });
            match.onPass(p, tgt, act.act);
            if (act.act === 'through') { tgt.runTimer = 1.6; const n = M.norm(aim.x - tgt.x, aim.z - tgt.z); tgt.runVec = { ax: n.x * dir, az: n.z * dir }; }
          } else {
            // boşluğa pas
            const wd = ax.l > 0.2 ? H.worldDir(ax) : { x: Math.cos(p.facing), z: Math.sin(p.facing) };
            const d = 8 + act.power * 18;
            A.pass(p, ball, { x: p.x + wd.x * d, z: p.z + wd.z * d }, 'ground', { pressure });
            match.onPass(p, p, 'ground');
          }
        } else if (act.act === 'lob') {
          const tgt = H.aimTarget(match, p, ax, { maxD: 60 });
          const inCrossZone = Math.abs(p.z) > 14 && (p.x * dir) > 25;
          if (inCrossZone && !tgt) {
            const aim = { x: goal.x - dir * (6 + (1 - act.power) * 6), z: (M.random() - 0.5) * 8 };
            A.faceTo(p, aim.x, aim.z);
            A.pass(p, ball, aim, 'cross', { pressure, spinDir: -Math.sign(p.z) * dir });
            match.onPass(p, p, 'cross');
          } else if (tgt) {
            const kind = inCrossZone && Math.abs(tgt.z) < 12 ? 'cross' : 'lofted';
            A.faceTo(p, tgt.x, tgt.z);
            A.pass(p, ball, { x: tgt.x + tgt.vx * 0.6, z: tgt.z + tgt.vz * 0.6 }, kind, { pressure, spinDir: -Math.sign(p.z) * dir });
            match.onPass(p, tgt, kind);
          } else {
            const wd = ax.l > 0.2 ? H.worldDir(ax) : { x: Math.cos(p.facing), z: Math.sin(p.facing) };
            const d = 12 + act.power * 30;
            A.pass(p, ball, { x: p.x + wd.x * d, z: p.z + wd.z * d }, 'lofted', { pressure });
            match.onPass(p, p, 'lofted');
          }
        }
      }
      return p;
    }
    // topsuz
    H.power = 0;
    if (ax.l > 0.15) {
      const wd = H.worldDir(ax);
      A.moveToward(p, p.x + wd.x * 5, p.z + wd.z * 5, sprint, dt, { arrive: 0.1, speedCap: p.maxSpeed * (sprint ? 1 : 0.72) * ax.l });
    } else {
      // basılı tuş yoksa: top serbestse topa git, değilse AI pozisyonuna
      if (!ball.owner) { const ip = match.interceptPoint(p); A.moveToward(p, ip.x, ip.z, sprint, dt, { arrive: 0.5 }); }
      else if (ball.owner.team !== H.team && (H.keys.Space || H.keys.KeyK)) { const o = ball.owner; A.moveToward(p, o.x + o.vx * 0.2, o.z + o.vz * 0.2, true, dt, { arrive: 0.3 }); }
      else A.stop(p, dt);
    }
    // savunma eylemleri
    if (act && ball.owner && ball.owner.team !== H.team) {
      const o = ball.owner; const d = M.distP(p, o);
      if (o.holding) { /* kalecinin elindeki topa müdahale yok */ }
      else if (act.act === 'shoot' && d < 3.2 && p.tackleCd <= 0) match.attemptTackle(p, o, true);
      else if ((act.act === 'pass') && d < 1.6 && p.tackleCd <= 0) match.attemptTackle(p, o, false);
    }
    // kaleci çıkışı (E)
    if (H.gkRush) { H.gkRush = false; const gk = match.gkOf(H.team); if (gk && ball.owner && ball.owner.team !== H.team) { gk.rushT = 1.2; } }
    return p;
  };
})(typeof window !== 'undefined' ? window : globalThis);
