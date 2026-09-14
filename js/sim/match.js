/* Maç motoru: durum makinesi, kurallar, hakem, duran toplar, istatistikler, olaylar */
(function (root) {
  const FS = (root.FS = root.FS || {});
  const M = FS.M, P = FS.PITCH, A = FS.Actions, AI = FS.AI;

  const DELIBERATE_KICKS = new Set(['ground', 'lofted', 'through', 'cross', 'throw', 'clear']);

  class Match {
    constructor(teamDefs, opts) {
      const o = (this.opts = Object.assign({ halfRealSec: 180, humanTeam: null, seed: null, weather: 'clear' }, opts || {}));
      if (o.seed != null) M.seed(o.seed);
      // Hava koşulları: 'clear'|'night'|'cloudy'|'rain'|'storm'|'snow'|'fog'|'hot'|'random' → FS.Weather nesnesi (fizik çarpanları + rüzgâr)
      this.weather = FS.Weather ? FS.Weather.create(o.weather) : null;
      FS.WEATHER = this.weather; FS.WEATHER_ROLL = this.weather ? this.weather.ball.roll : 1;
      const sameKit = teamDefs[0].kits.home.c1 === teamDefs[1].kits.home.c1;
      this.teams = [
        FS.createTeam(0, teamDefs[0], { kit: 'home', human: o.humanTeam === 0 }),
        FS.createTeam(1, teamDefs[1], { kit: sameKit || FS.kitClash(teamDefs[0].kits.home, teamDefs[1].kits.home) ? 'away' : 'home', human: o.humanTeam === 1 }),
      ];
      this.ball = new FS.Ball();
      this.ball.setWeather(this.weather);
      if (FS.Tactics) for (const t of this.teams) FS.Tactics.ensure(t); // taktik durumu (diziliş/hat/pres/tempo/genişlik/talimatlar)
      this.half = 1;
      this.clock = 0; // maç saati (saniye)
      this.timeScale = (45 * 60) / o.halfRealSec;
      FS.STAMINA_MUL = 0.42 * (15 / this.timeScale); // 2x3 dk maçta 90. dakikada ortalama kondisyon ~%55
      this.t = 0; // gerçek zaman
      this.addedTime = 0; // bu yarı için birikmiş uzatma (maç saniyesi)
      this.announcedAdded = null;
      this.state = 'pre';
      this.stateT = 0;
      this.possession = 0;
      this.events = [];
      this.listeners = [];
      this.commentary = [];
      this.restart = null;
      this.lastRestart = null;
      this.restartTaker = null;
      this.touchesSinceRestart = 0;
      this.offsideFlagged = [];
      this.offsideTeam = -1;
      this.advantage = null;
      this.pendingCards = [];
      this.kickoffTeam = M.chance(0.5) ? 0 : 1;
      this.firstKickoffTeam = this.kickoffTeam;
      this.ballPath = null;
      this.roles = [{}, {}];
      this.lastShot = null;
      this.gkHoldLimit = 8; // IFAB 2025/26: 8 saniye
      this.timeSpeedMul = 1;
      this.replayBuffer = [];
      this.walkers = []; // saha dışına yürüyen oyuncular (değişiklik / ihraç) — ara sahne için
      this.extraSetupDelay = 0;
      this.finished = false;
      this.paused = false;
      this.injuryStops = 0;
      this.humanTeam = o.humanTeam;
      this.tightOnside = [];
      this.varReview = null;
      this.lastFoul = null;
      this.officials = FS.Officials ? FS.Officials.create(this) : null; // hakem üçlüsü + 4. hakem
      this.placeForKickoff(this.kickoffTeam, true);
      if (o.ceremony) this.startLineup(o.ceremony === true ? 9 : o.ceremony); // seremoni: takımlar dizilir, sonra yerlerine yürür
    }

    /* ---------------- Genel yardımcılar ---------------- */
    dirOf(teamIdx) { return P.attackDir(teamIdx, this.half); }
    playersOnPitch(teamIdx) { return this.teams[teamIdx].players.filter((p) => p.onPitch && !p.red); }
    allOnPitch() { return this.playersOnPitch(0).concat(this.playersOnPitch(1)); }
    gkOf(teamIdx) { return FS.teamGK(this.teams[teamIdx]); }
    chaserOf(t) { return this.roles[t].chaser; }
    chaser2Of(t) { return this.roles[t].chaser2; }
    presserOf(t) { return this.roles[t].presser; }
    coverOf(t) { return this.roles[t].cover; }
    on(fn) { this.listeners.push(fn); }
    emit(type, data) {
      const ev = Object.assign({ type, clock: this.clock, half: this.half, t: this.t, minute: this.minuteLabel() }, data || {});
      this.events.push(ev);
      for (const l of this.listeners) l(ev);
      return ev;
    }
    say(text) { this.commentary.push({ t: this.t, text }); if (this.commentary.length > 60) this.commentary.shift(); this.emit('commentary', { text }); }
    minuteLabel() {
      const base = this.half === 1 ? 0 : 45 * 60;
      const limit = 45 * 60;
      const inHalf = this.clock - base;
      if (inHalf > limit) return (this.half === 2 ? '90' : '45') + '+' + Math.max(1, Math.ceil((inHalf - limit) / 60)) + "'";
      return Math.min(90, Math.floor(this.clock / 60) + 1) + "'";
    }
    clockText() {
      const base = this.half === 1 ? 0 : 45 * 60;
      const inHalf = this.clock - base;
      if (inHalf > 45 * 60) {
        const extra = inHalf - 45 * 60;
        return (this.half === 1 ? '45' : '90') + ':00 +' + M.fmtClock(extra);
      }
      return M.fmtClock(Math.min(this.clock, this.half === 1 ? 45 * 60 : 90 * 60));
    }

    /* ---------------- Yerleşim ---------------- */
    placeForKickoff(kickTeam, initial) {
      const ball = this.ball;
      ball.reset(0, 0);
      for (let ti = 0; ti < 2; ti++) {
        const team = this.teams[ti];
        const dir = this.dirOf(ti);
        for (const p of team.players) {
          if (!p.onPitch) continue;
          const s = team.slots[p.slot];
          let ax = Math.min(s.x, -3), az = s.z;
          if (ti === kickTeam) {
            // başlama vuruşunu yapan: iki oyuncu orta noktada
            if (p.role === 'ST' && !team._kickA) { team._kickA = p; ax = -0.6; az = 0.3; }
            else if ((p.role === 'AM' || p.role === 'CM' || p.role === 'ST') && !team._kickB && team._kickA !== p) { team._kickB = p; ax = -1.5; az = -1.5; }
          } else {
            // orta yuvarlak dışında
            const d = M.len(ax, az);
            if (d < P.centerRadius + 0.5) { const n = M.norm(ax || -1, az); ax = n.x * (P.centerRadius + 0.8); az = n.z * (P.centerRadius + 0.8); ax = Math.min(ax, -P.centerRadius - 0.5); }
          }
          const w = AI.toWorld(ax, az, dir);
          p.spX = w.x; p.spZ = w.z;
          if (initial) { p.x = w.x; p.z = w.z; p.vx = p.vz = 0; }
          // devre arası/gol sonrası yeniden diziliş: yarım kalan dalış/düşme/kayma pozları sıfırlanır (yoksa kaleci dalış hedefine 'kayar')
          p.diveT = 0; p.diveResolved = false; p.fallT = 0; p.tackleT = 0; p.stunT = 0; p.lockFacing = false; p.holding = false; p.hasBall = false;
          p.facing = dir > 0 ? 0 : Math.PI;
          p.hasBall = false; p.holding = false; p.intent = null; p.runTimer = 0;
          p.celKneelT = 0; p.celKneelDone = false; p.celTarget = null; p.celHugNear = false; p.celStyle = null;
        }
        let taker = team._kickA, other = team._kickB;
        team._kickA = team._kickB = null;
        if (ti === kickTeam) {
          const outfield = this.playersOnPitch(ti).filter((p) => p.role !== 'GK');
          if (!taker) { taker = outfield.sort((a, b) => (b.x * dir) - (a.x * dir))[0]; const w = AI.toWorld(-0.6, 0.3, dir); taker.spX = w.x; taker.spZ = w.z; if (initial) { taker.x = w.x; taker.z = w.z; } }
          if (!other || other === taker) { other = outfield.find((p) => p !== taker); if (other) { const w = AI.toWorld(-1.5, -1.5, dir); other.spX = w.x; other.spZ = w.z; if (initial) { other.x = w.x; other.z = w.z; } } }
          this.restart = { type: 'kickoff', team: ti, x: 0, z: 0, taker, other, timer: initial ? 2.5 : 3.5 };
        }
      }
      this.setState('setup');
    }

    setState(s) { this.state = s; this.stateT = 0; }

    /* ---------------- Ana döngü ---------------- */
    update(dtReal) {
      if (this.paused || this.finished) return;
      let dt = Math.min(dtReal, 0.1) * this.timeSpeedMul;
      while (dt > 0) { const s = Math.min(dt, 1 / 60); this.step(s); dt -= s; }
    }

    step(dt) {
      this.t += dt; this.stateT += dt;
      if (this.weather && FS.Weather) { FS.Weather.update(this.weather, dt); if (FS.WEATHER !== this.weather) { FS.WEATHER = this.weather; FS.WEATHER_ROLL = this.weather.ball.roll; } }
      const st = this.state;
      if (st === 'pre' || st === 'halftime' || st === 'fulltime') return;
      // maç saati: oyun sürerken ve duran top hazırlanırken (futbolda saat durmaz)
      if (st === 'play' || st === 'setup' || st === 'ready' || st === 'goal' || st === 'whistle' || st === 'advantage' || st === 'var') this.clock += dt * this.timeScale;
      // zamanlayıcılar
      for (const p of this.allOnPitch()) {
        p.kickCd = Math.max(0, p.kickCd - dt);
        p.tackleCd = Math.max(0, p.tackleCd - dt);
        p.kickAnim = Math.max(0, p.kickAnim - dt * 3.2);
        if (p.kickAnim <= 0 && p.kickStyle) p.kickStyle = null;
        if (p.chestAnim > 0) p.chestAnim -= dt;
        if (p.fallT > 0) p.fallT -= dt;
        if (p.stunT > 0) p.stunT -= dt;
        if (p.celebrateT > 0) p.celebrateT -= dt;
        if (p.protestT > 0) p.protestT -= dt;
        if (p.tackleT > 0) { // kayarak müdahale hareketi
          p.tackleT -= dt;
          p.vx = Math.cos(p.tackleDir) * 6.5 * Math.max(0, p.tackleT / 0.55); p.vz = Math.sin(p.tackleDir) * 6.5 * Math.max(0, p.tackleT / 0.55);
          A.integrate(p, dt, false);
        }
      }
      if (this.ball.lastKick) this.ball.lastKick.t += dt;
      this.updateWalkers(dt);
      if (this.officials) FS.Officials.update(this, dt);
      this.replayBuffer.push(this.snapshot());
      if (this.replayBuffer.length > 60 * 20) this.replayBuffer.shift();

      switch (st) {
        case 'setup': this.updateSetup(dt); break;
        case 'ready': this.updateReady(dt); break;
        case 'play': this.updatePlay(dt); break; // (çakışma çözümü updatePlay içinde, top etkileşimlerinden önce)
        case 'goal': this.updateGoalState(dt); break;
        case 'whistle': this.updateWhistle(dt); break;
        case 'halfend': this.updateHalfEnd(dt); break;
        case 'lineup': this.updateLineup(dt); break;
        case 'var': this.updateVar(dt); break;
      }
      // oyun dışı anlarda da (diziliş, gol sevinci, faul sonrası) oyuncular birbirinin içine girmesin; seremoni sırası hariç
      if (st !== 'play' && st !== 'lineup') this.resolveOverlaps();
    }

    /* ---------------- Seremoni: takımlar orta çizgide dizilir (ana tribüne dönük) ---------------- */
    /* Seremoni aşamaları (this.lineupPhase): 'tunnel' (tünelden çıkış, sıra hâlinde) → 'line' (dizilme, tribün selamı) →
       'handshake' (deplasman ekibi ev sahibi + hakemlerin önünden geçerek tokalaşır) → 'disperse' (yerlerine dağılır → setup).
       Tünel ağzı: ana tribün tarafı (-z), orta çizgi hizasında (x≈0, z≈-(halfW+margin)). */
    startLineup(dur) {
      const zLine = -3.0;
      const home = this.playersOnPitch(0), away = this.playersOnPitch(1);
      const byNum = (a, b) => (a.role === 'GK' ? -1 : b.role === 'GK' ? 1 : a.number - b.number);
      const homeS = home.slice().sort(byNum), awayS = away.slice().sort(byNum);
      homeS.forEach((p, i) => { p.lineX = -2.4 - i * 1.0; p.lineZ = zLine; });
      awayS.forEach((p, i) => { p.lineX = 2.4 + i * 1.0; p.lineZ = zLine; });
      const all = home.concat(away);
      const o = this.officials;
      if (o) {
        o.referee.lineX = 0; o.referee.lineZ = zLine; o.assistants[0].lineX = -1.2; o.assistants[0].lineZ = zLine; o.assistants[1].lineX = 1.2; o.assistants[1].lineZ = zLine;
      }
      // tünel sırası: hakemler önde, sonra kaptan/ev sahibi ve deplasman dönüşümlü (iki sıra: ev sahibi x=-0.7, deplasman x=+0.7)
      const tunnelZ = -(P.halfW + P.margin + 1.5); // pano arkası
      const order = [];
      if (o) { order.push({ p: o.referee, col: 0 }); order.push({ p: o.assistants[0], col: -1 }); order.push({ p: o.assistants[1], col: 1 }); }
      for (let i = 0; i < 11; i++) { if (homeS[i]) order.push({ p: homeS[i], col: -1 }); if (awayS[i]) order.push({ p: awayS[i], col: 1 }); }
      this.tunnelQueue = order;
      order.forEach((e, i) => {
        const p = e.p; const row = Math.floor((i + 1) / 2);
        p.x = e.col * 0.75; p.z = tunnelZ - row * 0.95;
        p.vx = p.vz = 0; p.speed = 0; p.facing = Math.PI / 2; p.lockFacing = false; p.hidden = true; p.tunnelIdx = i; p.ceremonyStage = 0;
        p.hasBall = false; p.intent = null; p.celebrateT = 0;
      });
      for (const p of all) p.spWalk = null;
      this.lineupDur = dur || 9;
      this.lineupPhase = 'tunnel'; this.lineupPhaseT = 0;
      this.setState('lineup');
      this.emit('lineup', {});
      this.emit('tunnel', {});
    }
    updateLineup(dt) {
      const o = this.officials;
      const all = this.allOnPitch();
      const offs = o ? o.all.filter((q) => q !== o.fourth) : [];
      const walkers = all.concat(offs);
      this.lineupPhaseT += dt;
      const ph = this.lineupPhase;
      if (ph === 'tunnel') {
        // sıradaki herkes tünel ağzına doğru yürür; ağzı geçince görünür olur ve kendi sırasındaki yere gider
        const mouthZ = -(P.halfW + P.margin - 0.4);
        let arrived = 0;
        for (const p of walkers) {
          const stage = p.ceremonyStage || 0;
          if (stage === 0) {
            // tünel içinde: sıra hâlinde ilerle (önündeki 0.9 m'den yakın olmasın)
            const ahead = this.tunnelQueue[(p.tunnelIdx || 0) - 2];
            const canGo = !ahead || ahead.p.z - p.z > 0.85 || ahead.p.ceremonyStage > 0;
            const col = p.tunnelIdx === 0 ? 0 : (p.tunnelIdx % 2 === 1 ? -0.75 : 0.75);
            if (canGo) A.moveToward(p, col, mouthZ + 1.5, false, dt, { speedCap: 1.5, arrive: 0.6 });
            else A.stop(p, dt);
            if (p.z > mouthZ - 2.0) p.hidden = false; // tünel arka duvarını geçince görünür (karanlıktan çıkar)
            if (p.z > mouthZ + 0.8) { p.ceremonyStage = 1; }
          } else if (stage === 1) {
            // sahaya girdi: dizilme yerine doğru yürü (önce çizgi hizasına, sonra yana)
            const tz = p.lineZ, tx = p.lineX;
            const d = M.dist(p.x, p.z, tx, tz);
            if (d > 0.45) A.moveToward(p, tx, tz, false, dt, { speedCap: 1.9, arrive: 0.8 });
            else { A.stop(p, dt); p.ceremonyStage = 2; }
          } else { A.stop(p, dt); p.facing += M.angleDiff(p.facing, -Math.PI / 2) * Math.min(1, dt * 5); arrived++; }
        }
        if (arrived >= walkers.length || this.lineupPhaseT > 26) { this.lineupPhase = 'line'; this.lineupPhaseT = 0; this.emit('lineup_line', {}); }
      } else if (ph === 'line') {
        // tribüne dönük dururlar (1.8 s), sonra tokalaşma
        for (const p of walkers) { A.stop(p, dt); p.facing += M.angleDiff(p.facing, -Math.PI / 2) * Math.min(1, dt * 5); }
        if (this.lineupPhaseT > 2.2) {
          this.lineupPhase = 'handshake'; this.lineupPhaseT = 0;
          // deplasman oyuncuları sıra hâlinde hakemlerin ve ev sahibinin önünden (z = line + 1.2) geçip kendi taraflarına döner
          const away = this.playersOnPitch(1).slice().sort((a, b) => a.lineX - b.lineX);
          away.forEach((p, i) => { p.shakeT = -i * 0.55; p.shakeDone = false; });
          this.emit('handshake', {});
        }
      } else if (ph === 'handshake') {
        const away = this.playersOnPitch(1);
        const home = this.playersOnPitch(0);
        const endX = -2.4 - 10 * 1.0 - 1.5;
        let done = 0;
        for (const p of away) {
          p.shakeT = (p.shakeT || 0) + dt;
          if (p.shakeDone) { const tx = p.lineX, tz = p.lineZ - 2.6; const d = M.dist(p.x, p.z, tx, tz); if (d > 0.4) A.moveToward(p, tx, tz, false, dt, { speedCap: 2.2, arrive: 0.8 }); else { A.stop(p, dt); p.facing += M.angleDiff(p.facing, -Math.PI / 2) * Math.min(1, dt * 5); } done++; continue; }
          if (p.shakeT < 0) { A.stop(p, dt); continue; }
          // sıra boyunca -x yönünde yürü; sıranın sonunu geçince kendi tarafına dön (ön sıradan, z = line - 2.6)
          const tz = p.lineZ + 1.1;
          if (p.x > endX) { A.moveToward(p, endX - 1, tz, false, dt, { speedCap: 1.6, arrive: 0.3 }); p.facing = Math.PI; }
          else p.shakeDone = true;
        }
        // ev sahibi ve hakemler el uzatır (geçen oyuncuya döner)
        for (const p of home.concat(offs)) {
          A.stop(p, dt);
          let near = null, nd = 3;
          for (const q of away) { if (q.shakeDone || q.shakeT < 0) continue; const d = M.dist(p.x, p.z, q.x, q.z); if (d < nd) { nd = d; near = q; } }
          const want = near ? Math.atan2(near.z - p.z, near.x - p.x) : -Math.PI / 2;
          p.facing += M.angleDiff(p.facing, want) * Math.min(1, dt * 6);
          p.shakeAnim = near && nd < 1.6 ? 1 : Math.max(0, (p.shakeAnim || 0) - dt * 2);
        }
        if (done >= away.length || this.lineupPhaseT > 16) { this.lineupPhase = 'disperse'; this.lineupPhaseT = 0; this.emit('lineup_end', {}); this.endLineup(); }
      }
      if (this.stateT > this.lineupDur + 30) this.endLineup();
    }
    endLineup() {
      if (this.state !== 'lineup') return;
      for (const p of this.allOnPitch()) { p.lockFacing = false; p.hidden = false; p.ceremonyStage = 3; p.shakeAnim = 0; }
      if (this.officials) for (const q of this.officials.all) { q.hidden = false; q.ceremonyStage = 3; }
      this.lineupPhase = 'done';
      if (this.restart) this.restart.timer = 5.5;
      this.setState('setup');
    }

    /* ---------------- VAR: gol kontrolü (ofsayt / rutin) ---------------- */
    startVar(info) {
      const tight = info.var === 'offside';
      // karar önceden belirlenir: sıkı ofsayt kontrollerinde %28 iptal, rutin kontrol her zaman geçerli
      const disallow = tight ? M.chance(0.28) : false;
      this.varReview = { t: 0, dur: tight ? 7.5 : 6.0, decideAt: tight ? 5.9 : 4.6, info, decision: disallow ? 'nogoal' : 'goal', tight, decided: false };
      this.addedTime += 60;
      for (const p of this.allOnPitch()) { p.celebrateT = 0; p.intent = null; }
      this.setState('var');
      if (this.officials) FS.Officials.onVarCheck(this);
      this.emit('var_check', { team: info.team, scorer: info.scorer, tight });
      this.say('VAR inceliyor: ' + (tight ? 'ofsayt kontrolü.' : 'gol kontrolü.'));
    }
    updateVar(dt) {
      const vr = this.varReview; if (!vr) { this.setState('setup'); return; }
      vr.t += dt;
      const info = vr.info;
      // oyuncular bekler: hücum edenler orta sahaya doğru yavaşça yürür, savunanlar yerinde
      for (const p of this.allOnPitch()) {
        if (p.team === info.team && M.dist(p.x, p.z, 0, 0) > 14 && vr.decision === 'goal') A.moveToward(p, p.x * 0.6, p.z * 0.6, false, dt, { speedCap: 1.6, arrive: 2 });
        else A.stop(p, dt);
      }
      this.ball.step(dt);
      if (!vr.decided && vr.t >= vr.decideAt) {
        vr.decided = true;
        if (vr.decision === 'goal') {
          this.emit('var_decision', { decision: 'goal', key: vr.tight ? 'var_no_offside' : 'var_goal_ok', team: info.team, scorer: info.scorer, score: info.score, tight: vr.tight });
          this.say('VAR kararı: gol geçerli!' + (vr.tight ? ' Ofsayt yok.' : ''));
        } else {
          // iptal: skor ve istatistikler geri alınır
          this.teams[info.team].score = Math.max(0, this.teams[info.team].score - 1);
          info.scorer.stats.goals = Math.max(0, info.scorer.stats.goals - 1);
          if (info.assist) info.assist.stats.assists = Math.max(0, info.assist.stats.assists - 1);
          this.teams[info.team].stats.offsides++;
          const score = [this.teams[0].score, this.teams[1].score];
          this.emit('var_decision', { decision: 'nogoal', key: 'var_goal_no', team: info.team, scorer: info.scorer, score, tight: vr.tight });
          this.say('VAR kararı: GOL İPTAL — ' + info.scorer.name + ' ofsayt pozisyonunda.');
        }
        if (this.officials) FS.Officials.onVarDecision(this, vr.decision);
        for (const p of this.playersOnPitch(info.team)) if (vr.decision === 'goal') p.celebrateT = 1.4;
      }
      if (vr.t >= vr.dur) {
        const decision = vr.decision; this.varReview = null;
        if (decision === 'goal') { this.placeForKickoff(1 - info.team, false); this.considerSubstitutions(); this.showPendingCards(); }
        else { const pos = info.varPos || { x: info.scorer.x, z: info.scorer.z }; this.beginRestart('freekick', 1 - info.team, M.clamp(pos.x, -P.halfL + 1, P.halfL - 1), M.clamp(pos.z, -P.halfW + 1, P.halfW - 1), { indirect: true }); }
      }
    }

    snapshot() {
      const b = this.ball;
      const ps = [];
      const list = this.officials ? this.allOnPitch().concat(this.officials.all) : this.allOnPitch();
      for (const p of list) ps.push([p.id, p.x, p.z, p.facing, p.speed, p.kickAnim, p.fallT > 0 ? 1 : 0, p.tackleT > 0 ? 1 : 0, p.diveT > 0 ? 1 : 0, p.holding ? 1 : 0, p.kickStyle || 0, p.chestAnim > 0 ? p.chestKind : 0]);
      return { t: this.t, bx: b.x, by: b.y, bz: b.z, ps };
    }

    /* ---------------- Rol hesapları ---------------- */
    updateRoles() {
      const ball = this.ball;
      if (!ball.owner) this.ballPath = ball.predictPath(4, 0.1);
      for (let t = 0; t < 2; t++) {
        const prev = this.roles[t] || {};
        const r = (this.roles[t] = {});
        const ps = this.playersOnPitch(t);
        const dir = this.dirOf(t);
        // kovalayan: serbest topa en hızlı ulaşan (kaleci yalnızca kendi ceza sahasında)
        if (!ball.owner) {
          let best = null, bt = 1e9, best2 = null, bt2 = 1e9;
          for (const p of ps) {
            if (p.fallT > 0 || p.stunT > 0 || p.tackleT > 0) continue;
            if (p.role === 'GK' && !(p.gkUpT > 0) && !P.inPenaltyArea(ball.x, ball.z, -dir)) continue;
            if (this.restartTaker === p && this.touchesSinceRestart === 0) continue; // çift dokunma yasağı
            const ip = this.interceptPoint(p);
            // rol histerezisi: mevcut kovalayan/ikinci adam 0.15 s avantajlı (iki oyuncu rol değiştirip durmasın)
            const tt = ip.t + (p.role === 'GK' ? 0.4 : 0) - (p === prev.chaser ? 0.15 : p === prev.chaser2 ? 0.1 : 0);
            if (tt < bt) { best2 = best; bt2 = bt; best = p; bt = tt; } else if (tt < bt2) { best2 = p; bt2 = tt; }
          }
          // pasın hedefi olan oyuncu, en hızlı ulaşandan çok geride değilse top ona bırakılır (herkes aynı topa koşmaz)
          const lk = ball.lastKick;
          const tgt = lk && lk.team === t && lk.target && lk.target.onPitch && lk.t < 3.5 && lk.kind !== 'shot' && lk.kind !== 'header' && lk.kind !== 'clear' ? lk.target : null;
          if (tgt && tgt !== best && !(tgt.fallT > 0 || tgt.stunT > 0 || tgt.tackleT > 0) && tgt.role !== 'GK') {
            const ipT = this.interceptPoint(tgt);
            if (ipT.t < bt + 0.6) { best2 = best; bt2 = bt; best = tgt; bt = ipT.t; }
          }
          r.chaser = best; r.chaser2 = best2;
        } else if (ball.owner.team !== t) {
          // baskı yapan: taşıyıcıya en yakın (kaleci hariç), kademe: ikinci en yakın savunma/orta saha
          let best = null, bd = 1e9, best2 = null, bd2 = 1e9;
          for (const p of ps) {
            if (p.role === 'GK' || p.fallT > 0 || p.stunT > 0) continue;
            // rol histerezisi: mevcut baskıcı 1.2 m, kademe 0.8 m avantajlı
            const d = M.distP(p, ball.owner) - (p === prev.presser ? 1.2 : p === prev.cover ? 0.8 : 0);
            if (d < bd) { best2 = best; bd2 = bd; best = p; bd = d; } else if (d < bd2) { best2 = p; bd2 = d; }
          }
          r.presser = best; r.cover = best2;
        }
      }
    }

    interceptPoint(p) {
      const ball = this.ball;
      const path = this.ballPath;
      if (!path || path.length < 2) return { x: ball.x, z: ball.z, t: AI.timeToReach(p, ball.x, ball.z) };
      const lk = ball.lastKick;
      const react = lk && lk.team !== p.team && lk.t < 0.6 ? 0.32 - lk.t * 0.3 : 0.1; // rakip pası okuyup harekete geçene kadar gecikir
      // pasın hedefi topa 'gider' (iyimser buluşma: top zaten ona geliyor, erken davranmak zararsız); rakip için gerçekçi ivmelenme modeli
      const eager = lk && lk.team === p.team && lk.target === p;
      const spE = p.maxSpeed * 0.92 * (0.8 + 0.2 * p.stamina);
      for (let i = 0; i < path.length; i++) {
        const q = path[i];
        if (q.y > 2.3) continue; // kafanın üstünde
        const tNeed = eager ? M.dist(p.x, p.z, q.x, q.z) / spE + 0.05 : AI.timeToReach(p, q.x, q.z, { react });
        if (tNeed <= q.t) return { x: q.x, z: q.z, t: q.t };
      }
      const last = path[path.length - 1];
      return { x: last.x, z: last.z, t: Math.max(last.t, AI.timeToReach(p, last.x, last.z)) };
    }

    /* ---------------- Duran top hazırlığı ---------------- */
    beginRestart(type, team, x, z, extra) {
      const r = (this.restart = Object.assign({ type, team, x, z, timer: 3.0 + (this.extraSetupDelay || 0), indirect: false }, extra || {}));
      this.extraSetupDelay = 0;
      const ball = this.ball;
      ball.reset(x, z); ball.inNet = false;
      for (const p of this.allOnPitch()) { p.hasBall = false; p.holding = false; p.intent = null; p.runTimer = 0; p.diveT = 0; p.diveResolved = false; p.lockFacing = false; if (p.gkUpT > 0 && type !== 'corner') p.gkUpT = 0; }
      this.possession = team;
      this.assignRestartPositions(r);
      // insan takımının duran topu: kontrol (ve üçüncü şahıs kamera) atıcıya geçer (kaleci hariç — kale vuruşunu AI kaleci kullanır)
      if (FS.Human && FS.Human.active && team === this.humanTeam && r.taker && r.taker.role !== 'GK') FS.Human.player = r.taker;
      this.emit(type, { team, x, z, taker: r.taker, indirect: r.indirect });
      this.setState('setup');
      // oyuncu değişikliği fırsatı
      this.considerSubstitutions();
      // bekleyen kartları göster
      this.showPendingCards();
    }

    assignRestartPositions(r) {
      const attTeam = this.teams[r.team], defTeam = this.teams[1 - r.team];
      const dir = this.dirOf(r.team);
      const att = this.playersOnPitch(r.team), def = this.playersOnPitch(1 - r.team);
      const goal = P.goalCenter(dir);
      const dGoal = M.dist(r.x, r.z, goal.x, goal.z);
      // varsayılan: formasyon ev pozisyonları (topa göre şekil)
      this.possession = r.team;
      this.instantShape = true; AI.updateTeamShape(this, attTeam); AI.updateTeamShape(this, defTeam); this.instantShape = false;
      for (const p of att.concat(def)) { p.spX = p.homeX; p.spZ = p.homeZ; }
      const byRole = (list, roles) => list.filter((p) => roles.includes(p.role));
      const sortByAttr = (list, k) => list.slice().sort((a, b) => b.attrs[k] - a.attrs[k]);
      const nearestTo = (list, x, z) => list.slice().sort((a, b) => M.dist(a.x, a.z, x, z) - M.dist(b.x, b.z, x, z))[0];

      if (r.type === 'kickoff') return; // placeForKickoff halletti
      if (r.type === 'throwin') {
        const cands = att.filter((p) => p.role !== 'GK');
        // en yakın bek/kanat atar
        r.taker = nearestTo(cands, r.x, r.z);
        r.taker.spX = r.x - dir * 0.2 + 0; r.taker.spZ = r.z + Math.sign(r.z) * 0.6;
        // alıcılar: 3 oyuncu 6-12 m yakınına
        let k = 0;
        for (const p of att) {
          if (p === r.taker || p.role === 'GK') continue;
          const d = M.dist(p.homeX, p.homeZ, r.x, r.z);
          if (d < 22 && k < 3) { k++; p.spX = r.x + dir * (k === 1 ? 6 : k === 2 ? -5 : 11); p.spZ = r.z - Math.sign(r.z) * (k === 3 ? 12 : 6); }
        }
        // savunma: 2 m mesafe kuralı
        for (const p of def) { if (M.dist(p.spX, p.spZ, r.x, r.z) < 2.5) { p.spX = r.x - dir * 3; p.spZ = r.z - Math.sign(r.z) * 3; } }
        r.timer = 1.6;
        return;
      }
      if (r.type === 'goalkick') {
        const gk = this.gkOf(r.team);
        r.taker = gk;
        gk.spX = r.x - dir * 1.0; gk.spZ = r.z;
        // savunma oyuncuları ceza sahası dışında; kendi oyuncuları açılır
        for (const p of def) if (P.inPenaltyArea(p.spX, p.spZ, -dir)) p.spX = (P.halfL - P.penAreaDepth - 2) * -dir;
        for (const p of att) { if (p.role === 'CB') { p.spX = r.x + dir * 8; p.spZ = (p.slot % 2 === 0 ? 1 : -1) * 14; } }
        r.timer = 2.2;
        return;
      }
      if (r.type === 'corner') {
        const side = Math.sign(r.z);
        // taker: en iyi pas atan kanat/orta saha
        let cands = sortByAttr(att.filter((p) => p.role !== 'GK' && !AI.isDef(p.role)), 'pass');
        if (!cands.length) cands = att.filter((p) => p.role !== 'GK');
        r.taker = cands[0];
        r.taker.spX = r.x - dir * 0.5; r.taker.spZ = r.z + side * 0.5;
        // hücum: 6 oyuncu ceza sahasına, 2 kenar/kısa, kaleci ve 2 CB geride
        const attackers = att.filter((p) => p !== r.taker && p.role !== 'GK');
        const boxSpots = [[6, -3 * side], [8, 4 * side], [11, 0], [5, 8 * side], [10, -6 * side], [16, 2 * side]];
        let bi = 0;
        const sorted = sortByAttr(attackers, 'str');
        for (const p of sorted) {
          if (bi < 6) { p.spX = goal.x - dir * boxSpots[bi][0]; p.spZ = boxSpots[bi][1]; bi++; }
          else if (bi === 6) { p.spX = r.x - dir * 6; p.spZ = r.z - side * 6; bi++; } // kısa korner seçeneği
          else { p.spX = goal.x - dir * 30; p.spZ = (bi % 2 ? 10 : -10); bi++; }
        }
        // son dakika: geride olan takımın kalecisi kornere çıkar (taktik talimatı)
        const attGK = this.gkOf(r.team);
        if (attGK && FS.Tactics && FS.Tactics.gkUp(this, attTeam)) { attGK.spX = goal.x - dir * 7; attGK.spZ = 2 * side; attGK.gkUpT = 14; attGK.gkReturn = true; this.emit('gkup', { team: r.team, p: attGK }); }
        // savunma: kaleci çizgide, 2 direk oyuncusu, markaj
        const gk = this.gkOf(1 - r.team);
        if (gk) { gk.spX = goal.x - dir * 0.8; gk.spZ = -side * 1.0; }
        const defenders = def.filter((p) => p.role !== 'GK');
        const defSorted = sortByAttr(defenders, 'str');
        let di = 0;
        for (const p of defSorted) {
          if (di === 0) { p.spX = goal.x - dir * 0.6; p.spZ = side * 3.2; }
          else if (di < 7 && sorted[di - 1]) { const tgt = sorted[di - 1]; p.spX = tgt.spX - dir * 1.0; p.spZ = tgt.spZ + (M.random() - 0.5); }
          else if (di === 7) { p.spX = r.x - dir * 4; p.spZ = r.z - side * 4; } // kısa korneri kapat
          else { p.spX = goal.x - dir * 22; p.spZ = (di % 2 ? 6 : -6); }
          di++;
        }
        r.timer = 3.2;
        return;
      }
      if (r.type === 'penalty') {
        const takers = sortByAttr(att.filter((p) => p.role !== 'GK'), 'comp');
        r.taker = this.pickPenaltyTaker(att) || takers[0];
        r.taker.spX = r.x - dir * 2.2; r.taker.spZ = r.z - 0.6;
        const gk = this.gkOf(1 - r.team);
        if (gk) { gk.spX = goal.x - dir * 0.3; gk.spZ = 0; }
        // diğerleri ceza sahası ve yay dışında, topun gerisinde
        let i = 0;
        for (const p of att.concat(def)) {
          if (p === r.taker || p === gk) continue;
          if (p.role === 'GK') { p.spX = -goal.x + dir * 6; p.spZ = 0; continue; }
          const ang = (i / 14) * Math.PI - Math.PI / 2; i++;
          const rad = 11 + 1.5 + (p.team === r.team ? 0 : 0.8);
          const ax = r.x * dir - Math.cos(ang) * rad * 0.9; const az = Math.sin(ang) * (rad + 8);
          const w = AI.toWorld(Math.min(ax, P.halfL - P.penAreaDepth - 1.2), az, dir);
          p.spX = w.x; p.spZ = w.z;
        }
        r.timer = 4.0;
        return;
      }
      if (r.type === 'freekick') {
        const central = Math.abs(r.z) < 22;
        const shootable = !r.indirect && dGoal < 32 && central;
        const crossable = dGoal < 45 && !shootable;
        const cands = sortByAttr(att.filter((p) => p.role !== 'GK'), shootable ? 'shoot' : 'pass');
        r.taker = cands[0];
        r.shootable = shootable; r.crossable = crossable;
        const toGoal = M.norm(goal.x - r.x, goal.z - r.z);
        r.taker.spX = r.x - toGoal.x * 2.5 - toGoal.z * 1.0; r.taker.spZ = r.z - toGoal.z * 2.5 + toGoal.x * 1.0;
        // baraj
        if (dGoal < 35) {
          const n = shootable ? (dGoal < 20 ? 5 : dGoal < 26 ? 4 : 3) : 2;
          const defenders = def.filter((p) => p.role !== 'GK').sort((a, b) => a.attrs.pace - b.attrs.pace);
          const wallX = r.x + toGoal.x * 9.15, wallZ = r.z + toGoal.z * 9.15;
          const perp = { x: -toGoal.z, z: toGoal.x };
          // barajı yakın direği örtecek şekilde kaydır
          const nearPostSign = r.z > 0 ? 1 : -1;
          const shift = nearPostSign * 0.6 * (dir > 0 ? 1 : -1) * (perp.z > 0 ? 1 : -1);
          r.wall = [];
          for (let i = 0; i < n && i < defenders.length; i++) {
            const off = (i - (n - 1) / 2) * 0.75 + shift * 0.8;
            const p = defenders[i];
            p.spX = wallX + perp.x * off; p.spZ = wallZ + perp.z * off;
            p.inWall = true; r.wall.push(p);
          }
          const gk = this.gkOf(1 - r.team);
          if (gk) { gk.spX = goal.x - dir * 1.0; gk.spZ = M.clamp(-r.z * 0.12 + (r.z > 0 ? 1.3 : -1.3), -2.5, 2.5); }
          // hücum: ceza sahasına oyuncular (şut ise 3-4, orta ise 5-6)
          const boxers = sortByAttr(att.filter((p) => p !== r.taker && p.role !== 'GK' && !AI.isDef(p.role)), 'str').slice(0, shootable ? 3 : 5);
          const spots = [[8, -4], [10, 4], [14, 0], [7, 6], [12, -7]];
          boxers.forEach((p, i) => { p.spX = goal.x - dir * spots[i][0]; p.spZ = spots[i][1]; });
          // savunma diğerleri: ofsayt hattı ceza sahası çizgisinde
          for (const p of def) if (!p.inWall && p.role !== 'GK' && P.inPenaltyArea(p.spX, p.spZ, dir) === false && M.dist(p.spX, p.spZ, goal.x, goal.z) > 20) { /* keep */ }
          for (const p of def) if (!p.inWall && p.role !== 'GK') { const inBox = M.dist(p.spX, p.spZ, goal.x, goal.z) < 24; if (inBox || AI.isDef(p.role)) { p.spX = goal.x - dir * (P.penAreaDepth + 1.5); p.spZ = M.clamp(p.spZ, -18, 18); } }
        }
        // 9.15 m mesafe kuralı (baraj dışındakiler)
        for (const p of def) if (!p.inWall && M.dist(p.spX, p.spZ, r.x, r.z) < 9.15) { const n2 = M.norm(p.spX - r.x || 1, p.spZ - r.z); p.spX = r.x + n2.x * 9.5; p.spZ = r.z + n2.z * 9.5; }
        r.timer = dGoal < 35 ? 4.0 : 2.4;
        return;
      }
      if (r.type === 'dropball') {
        r.taker = nearestTo(att.filter((p) => p.role !== 'GK'), r.x, r.z);
        r.taker.spX = r.x - dir * 0.5; r.taker.spZ = r.z;
        for (const p of def) if (M.dist(p.spX, p.spZ, r.x, r.z) < 4.5) { p.spX = r.x - dir * 5; }
        r.timer = 1.5;
      }
    }

    pickPenaltyTaker(att) {
      // takım penaltıcısı: en yüksek soğukkanlılık+şut
      return att.filter((p) => p.role !== 'GK').sort((a, b) => (b.attrs.comp + b.attrs.shoot) - (a.attrs.comp + a.attrs.shoot))[0];
    }

    ensureTaker(r) {
      if (r.taker && r.taker.onPitch && !r.taker.red && !(r.taker.enterWait > 0)) return;
      const att = this.playersOnPitch(r.team);
      const ready = att.filter((p) => p.role !== 'GK' && !(p.enterWait > 0)); // çizgide bekleyen yeni oyuncu duran topu kullanmaz
      r.taker = (ready.length ? ready : att.filter((p) => p.role !== 'GK')).sort((a, b) => M.dist(a.x, a.z, r.x, r.z) - M.dist(b.x, b.z, r.x, r.z))[0] || att[0];
      r.taker.spX = r.x - this.dirOf(r.team) * 0.8; r.taker.spZ = r.z;
    }

    updateSetup(dt) {
      const r = this.restart;
      this.ensureTaker(r);
      r.timer -= dt;
      let allReady = true;
      const ball = this.ball;
      ball.vx = ball.vy = ball.vz = 0; ball.x = r.x; ball.z = r.z; ball.y = P.BALL_R;
      for (const p of this.allOnPitch()) {
        if (p.fallT > 0 || p.tackleT > 0) continue;
        if (p.enterWait > 0) { p.enterWait -= dt; A.stop(p, dt); allReady = false; continue; } // giren oyuncu çizgide bekliyor
        const d = M.dist(p.x, p.z, p.spX, p.spZ);
        if (d > 0.5) { A.moveToward(p, p.spX, p.spZ, d > 12, dt, { arrive: 1.0, speedCap: d > 20 ? undefined : 4.5 }); if (d > 2.5) allReady = false; }
        else { A.stop(p, dt); if (p === r.taker) A.faceTo(p, r.x, r.z); else A.faceTo(p, ball.x, ball.z); }
      }
      // kalecinin topu elinde tuttuğu hızlı dağıtım hariç, herkes yerinde olunca veya süre dolunca
      if ((allReady && r.timer < 1.0) || r.timer < -3) {
        this.setState('ready');
        r.readyT = 0;
      }
    }

    updateReady(dt) {
      const r = this.restart;
      r.readyT += dt;
      const ball = this.ball;
      const taker = r.taker;
      for (const p of this.allOnPitch()) { if (p !== taker) { if (p.enterWait > 0) { p.enterWait -= dt; A.stop(p, dt); continue; } const d = M.dist(p.x, p.z, p.spX, p.spZ); if (d > 0.4) A.moveToward(p, p.spX, p.spZ, d > 12, dt, { arrive: 1 }); else A.stop(p, dt); } }
      // atıcı topa yaklaşır
      const dT = M.dist(taker.x, taker.z, ball.x, ball.z);
      const humanTakes = this.humanTeam === r.team && (r.type === 'penalty' || r.type === 'freekick' || r.type === 'corner' || r.type === 'kickoff' || r.type === 'throwin' || r.type === 'goalkick') && FS.Human && FS.Human.active;
      if (humanTakes && r.readyT < 8) {
        // insan: giriş bekle (Human modülü executeRestart çağırır)
        if (dT > 1.4) A.moveToward(taker, ball.x - Math.cos(taker.facing) * 1.0, ball.z - Math.sin(taker.facing) * 1.0, false, dt, { arrive: 0.5 });
        else { A.stop(taker, dt); A.faceTo(taker, r.type === 'throwin' ? ball.x + this.dirOf(r.team) * 4 : ball.x + this.dirOf(r.team) * 5, r.type === 'throwin' ? -Math.sign(r.z) * 5 + ball.z : 0); }
        if (FS.Human.wantsRestart(this, r)) { this.executeRestart(FS.Human.restartChoice(this, r)); }
        return;
      }
      if (r.readyT < 0.6) { A.stop(taker, dt); return; }
      // atıcı topun 0.8 m yakınına kadar yürür; executeRestart'taki son hizalama böylece ≤0.3 m kalır (görünür sıçrama yok)
      if (dT > 0.8) { A.moveToward(taker, ball.x, ball.z, false, dt, { arrive: 0.55, speedCap: 3.2 }); return; }
      this.executeRestart(null);
    }

    executeRestart(choice) {
      const r = this.restart;
      const taker = r.taker;
      const ball = this.ball;
      const dir = this.dirOf(r.team);
      const goal = P.goalCenter(dir);
      const att = this.playersOnPitch(r.team);
      // ofsayt bayrağını sıfırla
      this.offsideFlagged = []; this.offsideTeam = -1;
      taker.x = ball.x - Math.cos(taker.facing) * 0.5; taker.z = ball.z - Math.sin(taker.facing) * 0.5;
      const isDirect = !r.indirect;
      let kind = 'pass';
      switch (r.type) {
        case 'kickoff': {
          const mate = r.other || att.find((p) => p !== taker && p.role !== 'GK');
          A.faceTo(taker, mate.x, mate.z);
          A.pass(taker, ball, { x: mate.x - dir * 0.5, z: mate.z }, 'ground', { arrive: 3 });
          if (ball.lastKick) ball.lastKick.target = mate;
          const first = (this.half === 1 && this.clock < 5) || (this.half === 2 && this.clock < 45 * 60 + 5);
          this.emit('kickoff_taken', { first, half: this.half, taker });
          if (first && this.half === 1 && this.weather && this.weather.id !== 'clear' && this.weather.id !== 'night' && FS.Weather) {
            const w = this.weather;
            const line = w.id === 'rain' ? 'Yağmur altında oynanacak bir maç; ıslak zeminde top hızlı kayacak.' : w.id === 'storm' ? 'Sağanak yağış ve sert rüzgâr var; zor koşullarda oynanacak bir maç bizi bekliyor.' : w.id === 'snow' ? 'Karla kaplı zeminde turuncu topla oynanıyor; oyuncular için zemin çok kaygan.' : w.id === 'fog' ? 'Yoğun sis var; görüş mesafesi düşük, uzun paslar riskli.' : w.id === 'hot' ? `Termometreler ${w.tempC} dereceyi gösteriyor; sıcak, oyuncuların kondisyonunu zorlayacak.` : `Kapalı hava, ${w.windText}.`;
            this.say('Ve maç başlıyor! ' + line);
          } else this.say(first && this.half === 1 ? 'Ve maç başlıyor!' : 'Oyun yeniden başladı.');
          break;
        }
        case 'throwin': {
          const target = choice && choice.target ? choice.target : this.bestThrowTarget(taker);
          A.faceTo(taker, target.x, target.z);
          A.throwIn(taker, ball, { x: target.x + target.vx * 0.3, z: target.z + target.vz * 0.3 });
          if (ball.lastKick) { ball.lastKick.target = target; target.expectPassT = this.t; }
          kind = 'throw';
          break;
        }
        case 'goalkick': {
          // kısa (CB) ya da uzun
          const short = M.chance(0.55) && !(choice && choice.long);
          if (short && !(choice && choice.long)) {
            const cbs = att.filter((p) => p.role === 'CB' || p.role === 'RB' || p.role === 'LB');
            const t = M.pick(cbs.length ? cbs : att.filter((p) => p !== taker));
            A.faceTo(taker, t.x, t.z);
            A.pass(taker, ball, { x: t.x, z: t.z }, 'ground', { arrive: 4 });
            if (ball.lastKick) ball.lastKick.target = t;
          } else {
            const ts = att.filter((p) => AI.isAtt(p.role) || AI.isMid(p.role));
            const t = M.pick(ts);
            A.faceTo(taker, t.x, t.z);
            A.gkLongKick(taker, ball, { x: t.x + dir * 3, z: t.z });
          }
          break;
        }
        case 'corner': {
          const side = Math.sign(r.z);
          const short = M.chance(0.15) || (choice && choice.short);
          if (short) {
            const mate = att.filter((p) => p !== taker).sort((a, b) => M.distP(a, taker) - M.distP(b, taker))[0];
            A.faceTo(taker, mate.x, mate.z);
            A.pass(taker, ball, { x: mate.x, z: mate.z }, 'ground', { arrive: 4 });
            if (ball.lastKick) ball.lastKick.target = mate;
          } else {
            // hedef bölge: yakın direk / penaltı noktası / uzak direk
            const zones = [[5.5, -2.5 * side], [10, 0.5 * side], [7, 5 * side], [9, -5 * side]];
            const zi = choice && choice.zone != null ? choice.zone : M.randi(0, zones.length - 1);
            const z = zones[zi];
            const aim = { x: goal.x - dir * z[0], z: z[1] + M.randn() * 0.8 };
            A.faceTo(taker, aim.x, aim.z);
            // içe dönük falso (inswing) ya da dışa
            const inswing = M.chance(0.6);
            A.pass(taker, ball, aim, 'cross', { spinDir: (inswing ? 1 : -1) * side * dir, errMul: 0.7 });
            kind = 'cross';
            // hücumcular koşuya başlar
            for (const p of att) if (p !== taker && P.inPenaltyArea(p.x, p.z, dir)) { p.runTimer = 0.9; const n = M.norm(goal.x - dir * 4 - p.x, 0 - p.z); p.runVec = { ax: n.x * dir, az: n.z * dir }; }
          }
          this.teams[r.team].stats.corners++;
          break;
        }
        case 'penalty': {
          const gk = this.gkOf(1 - r.team);
          const side = choice && choice.side != null ? choice.side : (M.chance(0.5) ? 1 : -1);
          const high = choice && choice.high != null ? choice.high : M.chance(0.35);
          const power = choice && choice.power != null ? choice.power : M.rand(0.75, 1);
          // kaleci tahmini
          const readSkill = gk ? gk.attrs.gk / 99 : 0.5;
          const guessRight = M.chance(0.33 + readSkill * 0.28);
          const gkSide = guessRight ? side : (M.chance(0.6) ? -side : 0);
          const aimZ = side * M.rand(2.2, 3.3);
          const aimY = high ? M.rand(1.5, 2.15) : M.rand(0.25, 0.9);
          A.faceTo(taker, goal.x, aimZ);
          A.shoot(taker, ball, { x: goal.x, z: aimZ, y: aimY }, power, { style: 'normal', errMul: 0.75 + (1 - taker.attrs.comp / 99) * 0.6, pressure: 0.25 });
          this.onShot(taker, { q: 0.78, penalty: true });
          if (gk) {
            const dz = gkSide * M.rand(2.0, 3.0);
            gk.diveT = 0.55; gk.diveTotal = 0.55; gk.diveTarget = { x: gk.x, z: dz, y: high ? 1.7 : 0.6 };
            // penaltı kurtarış olasılığı: doğru köşe ve yükseklik uyumu
            const sameSide = gkSide === side;
            let pSave = sameSide ? 0.42 + readSkill * 0.3 : gkSide === 0 && Math.abs(aimZ) < 2.4 ? 0.5 : 0.03;
            if (high && sameSide) pSave *= 0.75;
            if (power > 0.92) pSave *= 0.8;
            gk.diveOutcome = M.chance(pSave) ? (M.chance(0.35 * (this.weather ? this.weather.gkHandling : 1)) ? 'catch' : 'parry') : 'miss';
            gk.diveIsPenalty = true;
          }
          this.say(taker.name + ' penaltı noktasında...');
          break;
        }
        case 'freekick': {
          const dGoal = M.dist(ball.x, ball.z, goal.x, goal.z);
          const wantShoot = r.shootable && (choice ? choice.shoot : M.chance(0.75)) && isDirect;
          if (wantShoot) {
            // duvarın üstünden köşeye
            const gk = this.gkOf(1 - r.team);
            const side = gk ? (gk.z > 0 ? -1 : 1) : (M.chance(0.5) ? 1 : -1);
            const aim = { x: goal.x, z: side * M.rand(2.0, 3.1), y: M.rand(1.5, 2.2) };
            const d = M.dist(ball.x, ball.z, aim.x, aim.z);
            const sol = A.solveKick(d, aim.y, { vMin: 18, vMax: 30, elevMin: 0.12, elevMax: 0.42, wallDist: 9.15, wallH: 2.05, maxApex: 4.5, preferFast: true });
            const skill = taker.attrs.shoot / 99;
            const angErr = (0.03 + (1 - skill) * 0.05) * (choice && choice.power ? 1 : 1);
            const ang = Math.atan2(aim.z - ball.z, aim.x - ball.x) + M.randn() * angErr;
            const v = sol ? sol.v : 24, elev = (sol ? sol.elev : 0.3) + M.randn() * 0.02;
            A.faceTo(taker, aim.x, aim.z);
            ball.owner = null; taker.hasBall = false;
            ball.vx = Math.cos(ang) * v * Math.cos(elev); ball.vy = v * Math.sin(elev); ball.vz = Math.sin(ang) * v * Math.cos(elev);
            ball.spin = -side * dir * M.rand(0.3, 0.55);
            ball.lastTouch = taker; ball.lastKick = { p: taker, kind: 'shot', t: 0, team: taker.team, x: ball.x, z: ball.z };
            taker.kickCd = 0.6; taker.kickAnim = 1; taker.stats.shots++;
            this.onShot(taker, { q: 0.08 + skill * 0.06, freekick: true });
            kind = 'shot';
            this.say(taker.name + ' doğrudan kaleye vuruyor!');
          } else if (r.crossable || (r.shootable && !isDirect)) {
            // ceza sahasına orta
            const aim = { x: goal.x - dir * M.rand(6, 11), z: M.rand(-5, 5) };
            A.faceTo(taker, aim.x, aim.z);
            A.pass(taker, ball, aim, 'cross', { spinDir: (r.z > 0 ? 1 : -1) * dir, errMul: 0.8 });
            for (const p of att) if (p !== taker && M.dist(p.x, p.z, goal.x, goal.z) < 26) { p.runTimer = 0.9; const n = M.norm(aim.x - p.x, aim.z - p.z); p.runVec = { ax: n.x * dir, az: n.z * dir }; }
            kind = 'cross';
          } else {
            const opt = AI.bestPassOption(this, taker, 0) || { target: att.find((p) => p !== taker), kind: 'ground' };
            const tgt = opt.target;
            A.faceTo(taker, tgt.x, tgt.z);
            A.pass(taker, ball, opt.aim || { x: tgt.x, z: tgt.z }, opt.kind === 'through' ? 'ground' : opt.kind, { arrive: 4 });
            if (ball.lastKick) ball.lastKick.target = tgt;
          }
          for (const p of this.allOnPitch()) p.inWall = false;
          break;
        }
        case 'dropball': {
          A.faceTo(taker, goal.x, taker.z);
          A.pass(taker, ball, { x: taker.x + dir * 8, z: taker.z }, 'ground', { arrive: 3 });
          break;
        }
      }
      // ilk dokunuş sonrası atıcı topa tekrar dokunamaz
      this.restartTaker = taker; this.touchesSinceRestart = 0;
      this.lastRestart = { type: r.type, team: r.team, t: this.t, kind };
      this.noOffsideFromRestart = r.type === 'throwin' || r.type === 'goalkick' || r.type === 'corner';
      // korner / serbest vuruş ortası için ofsayt anlık görüntüsü (korner ve taçta ofsayt yok)
      if (r.type === 'freekick' || r.type === 'kickoff' || r.type === 'dropball') this.snapshotOffside(taker);
      this.setState('play');
    }

    bestThrowTarget(taker) {
      const dir = this.dirOf(taker.team);
      let best = null, bs = -1e9;
      for (const m of this.playersOnPitch(taker.team)) {
        if (m === taker || m.role === 'GK') continue;
        const d = M.distP(taker, m);
        if (d > 25 || d < 2) continue;
        const open = Math.min(8, AI.nearestOpp(this, taker.team, m.x, m.z).d);
        const sc = open * 1.5 - d * 0.15 + (m.x - taker.x) * dir * 0.1;
        if (sc > bs) { bs = sc; best = m; }
      }
      return best || this.playersOnPitch(taker.team).find((m) => m !== taker);
    }

    /* ---------------- Oyun ---------------- */
    updatePlay(dt) {
      const ball = this.ball;
      this.updateRoles();
      // takım şekli (her karede — ucuz)
      AI.updateTeamShape(this, this.teams[0]); AI.updateTeamShape(this, this.teams[1]);
      // insan kontrolü
      let humanP = null;
      if (FS.Human && FS.Human.active && this.humanTeam != null) humanP = FS.Human.update(this, dt);
      // oyuncu güncellemeleri
      for (const p of this.allOnPitch()) {
        if (p === humanP) continue;
        if (p.fallT > 0 || p.stunT > 0 || p.tackleT > 0) { if (p.hasBall && p.fallT > 0) A.releaseControl(p, ball); if (p.tackleT <= 0) A.stop(p, dt); continue; }
        if (p.role === 'GK' && p.diveT > 0) { this.updateDive(p, dt); continue; }
        // Kaleci topu elinde tutuyorsa (holding) taşıyıcı mantığına (ayakla hızlı pas) DEĞİL, dağıtım mantığına gider —
        // eski hata: takeControl → hasBall → updateCarrier topu anında tekmeliyor, holding bayrağı kalıyor → gkDistribute topu
        // yeniden ele yapıştırıyor → yakala/tekmele/yapıştır döngüsü (top kalecinin elinde titriyordu).
        if (p.hasBall && !p.holding) AI.updateCarrier(this, p, dt);
        else AI.updateOffBall(this, p, dt);
      }
      // top
      if (ball.owner) {
        const o = ball.owner;
        if (o.holding) { // top göğüs hizasında, ellerde (tek kaynak: burada konumlanır; AI dağıtım yalnız karar verir)
          ball.x = o.x + Math.cos(o.facing) * 0.32; ball.z = o.z + Math.sin(o.facing) * 0.32; ball.y = 1.05; ball.vx = ball.vz = ball.vy = 0; ball.spin = 0;
          o.holdT += dt; if (o.holdT > this.gkHoldLimit) this.gkHoldViolation(o);
        }
        else A.dribbleBall(o, ball, dt, o.wantSprint);
      } else ball.step(dt);
      this.resolveOverlaps();
      // etkileşimler
      this.updateGKSaves(dt);
      this.updateBallInteractions(dt);
      // kurallar
      if (this.checkGoal()) return;
      if (this.checkOutOfPlay()) return;
      this.updateAdvantage(dt);
      // topa sahip olma istatistiği
      const possTeam = ball.owner ? ball.owner.team : ball.lastTouch ? ball.lastTouch.team : this.possession;
      this.possession = possTeam;
      this.teams[possTeam].stats.possessionT += dt;
      // yarı sonu kontrolü
      this.checkHalfEnd();
    }

    /* Yerdeki oyuncunun gövde segmenti (dünya): render pozlarıyla aynı geometri.
       - düşme: gövde sim konumu üzerinde ortalı (ayaklar 0.7 m geride, baş 1.0 m ileride, bakış yönünde)
       - kayarak müdahale: ön ayak sim konumunda, gövde 1.2 m geride
       - kaleci dalışı: gövde dalış hedefine doğru 1.3 m uzanır */
    bodySegment(p) {
      const fx = Math.cos(p.facing), fz = Math.sin(p.facing);
      if (p.fallT > 0) return { x0: p.x - fx * 0.7, z0: p.z - fz * 0.7, x1: p.x + fx * 1.0, z1: p.z + fz * 1.0 };
      if (p.tackleT > 0) return { x0: p.x - fx * 1.2, z0: p.z - fz * 1.2, x1: p.x + fx * 0.1, z1: p.z + fz * 0.1 };
      if (p.diveT > 0) {
        const tg = p.diveTarget; let ux = fz, uz = -fx; // varsayılan: yana
        if (tg) { const dx = tg.x - p.x, dz = tg.z - p.z, l = M.len(dx, dz); if (l > 0.05) { ux = dx / l; uz = dz / l; } }
        return { x0: p.x, z0: p.z, x1: p.x + ux * 1.3, z1: p.z + uz * 1.3 };
      }
      return null;
    }
    static segClosest(sg, x, z) { // segment üzerindeki en yakın nokta
      const dx = sg.x1 - sg.x0, dz = sg.z1 - sg.z0; const l2 = dx * dx + dz * dz || 1e-6;
      const t = M.clamp(((x - sg.x0) * dx + (z - sg.z0) * dz) / l2, 0, 1);
      return { x: sg.x0 + dx * t, z: sg.z0 + dz * t };
    }

    /* Oyuncular birbirinin içinden geçmesin: konum ayrışması + hız düzeltmesi (omuz omuza mücadele).
       - Ayaktaki oyuncular: dikey kapsül (yarıçap 0.36 m → çift 0.72 m merkez mesafesi); tam ayrışma + birbirine doğru olan hız bileşeni sıfırlanır.
       - Yerde yatan / kayan / dalan oyuncu: YATAY KAPSÜL (gövde ayaklardan bakış yönünde uzanır; düşmede ~1.5 m, kaymada ~1.0 m, dalışta
         yana ~1.3 m). Ayaktaki oyuncu bu segmente 0.36+0.28 m'den fazla yaklaşamaz → yerdekinin üzerinden/içinden geçmez, etrafından dolaşır.
         Yerdeki oyuncu itilmez (sabit engel).
       - İkisi de yerdeyse hafif ayrışma (yığın olmasın).
       - Çözüm 3 yinelemeli (Gauss-Seidel); 22 oyuncu için ucuz. */
    resolveOverlaps() {
      const list = this.allOnPitch();
      const n = list.length;
      const R_STAND = 0.36, R_DOWN = 0.28;
      const restartSetup = this.state === 'setup' || this.state === 'ready';
      // yerdeki oyuncuların gövde segmentleri (bir kez hesapla)
      const seg = new Array(n);
      for (let i = 0; i < n; i++) seg[i] = this.bodySegment(list[i]);
      const closest = Match.segClosest;
      for (let iter = 0; iter < 3; iter++) {
        for (let i = 0; i < n; i++) {
          const a = list[i]; const aS = seg[i]; const aDown = !!aS;
          for (let j = i + 1; j < n; j++) {
            const b = list[j]; const bS = seg[j]; const bDown = !!bS;
            if (aDown && bDown) {
              // ikisi de yerde: merkezler arası hafif ayrışma
              const R = 0.9; let dx = b.x - a.x, dz = b.z - a.z; const d2 = dx * dx + dz * dz; if (d2 >= R * R) continue;
              let d = Math.sqrt(d2); if (d < 1e-4) { dx = 1; dz = 0; d = 1e-4; } else { dx /= d; dz /= d; }
              const pen = (R - d) * 0.15; a.x -= dx * pen; a.z -= dz * pen; b.x += dx * pen; b.z += dz * pen;
              continue;
            }
            if (aDown || bDown) {
              // ayaktaki (up) ↔ yatan (dn): up, dn'nin gövde segmentinden R_STAND+R_DOWN uzak kalır; dn itilmez
              const up = aDown ? b : a, sg = aDown ? aS : bS;
              const R = R_STAND + R_DOWN;
              const c = closest(sg, up.x, up.z);
              let dx = up.x - c.x, dz = up.z - c.z; const d2 = dx * dx + dz * dz; if (d2 >= R * R) continue;
              let d = Math.sqrt(d2);
              if (d < 1e-4) { // tam üstünde: segmente dik yönde it
                const sx = sg.x1 - sg.x0, sz = sg.z1 - sg.z0; const sl = Math.sqrt(sx * sx + sz * sz) || 1; dx = -sz / sl; dz = sx / sl; d = 1e-4;
                if ((up.vx * dx + up.vz * dz) > 0) { dx = -dx; dz = -dz; }
              } else { dx /= d; dz /= d; }
              const pen = R - d;
              up.x += dx * pen; up.z += dz * pen;
              const vn = up.vx * dx + up.vz * dz; // segmente doğru hız bileşeni (<0: içine giriyor)
              if (vn < 0) { up.vx -= dx * vn; up.vz -= dz * vn; }
              continue;
            }
            // ikisi de ayakta
            const R = R_STAND * 2;
            let dx = b.x - a.x, dz = b.z - a.z; const d2 = dx * dx + dz * dz;
            if (d2 >= R * R) continue;
            let d = Math.sqrt(d2);
            if (d < 1e-4) { // tam üst üste: deterministik küçük ayrım
              const ang = (a.id * 0.7 + b.id * 1.3) % (Math.PI * 2); dx = Math.cos(ang); dz = Math.sin(ang); d = 1e-4;
            } else { dx /= d; dz /= d; }
            const pen = R - d;
            // ağırlıklar: top süren (gövde koruması) ve güçlü oyuncu daha az itilir
            const wa = M.clamp(0.5 + (b.attrs.str - a.attrs.str) / 400 + (a.hasBall ? -0.15 : 0) + (b.hasBall ? 0.15 : 0), 0.2, 0.8), wb = 1 - wa;
            // duran top dizilişinde yerine yürüyen oyuncular birbirini tam iter (yığın olmasın)
            const soft = restartSetup ? 1 : 0.9;
            a.x -= dx * pen * wa * soft; a.z -= dz * pen * wa * soft; b.x += dx * pen * wb * soft; b.z += dz * pen * wb * soft;
            // hız düzeltmesi: birbirine doğru olan bağıl hız bileşeni kaldırılır (içine doğru koşmaya devam etmez, kayarak yanından geçer)
            const rvx = b.vx - a.vx, rvz = b.vz - a.vz;
            const vn = rvx * dx + rvz * dz; // <0: yaklaşıyorlar
            if (vn < 0) { const imp = -vn * 0.9; a.vx -= dx * imp * wa; a.vz -= dz * imp * wa; b.vx += dx * imp * wb; b.vz += dz * imp * wb; }
          }
        }
      }
      // hızlar değiştiyse speed alanını tazele (animasyon/karar mantığı okur)
      for (const p of list) p.speed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    }

    /* Kaleci dalışı */
    updateDive(gk, dt) {
      gk.diveT -= dt;
      const tg = gk.diveTarget;
      const f = 1 - Math.exp(-dt * 9);
      gk.x += (tg.x - gk.x) * f; gk.z += (tg.z - gk.z) * f;
      gk.vx = 0; gk.vz = 0;
      const ball = this.ball;
      const d = M.dist(gk.x, gk.z, ball.x, ball.z);
      if (!gk.diveResolved && d < 1.15 && Math.abs(ball.y - Math.min(tg.y, 2.2)) < 1.1) {
        gk.diveResolved = true;
        const out = gk.diveOutcome;
        if (out === 'catch') {
          A.takeControl(gk, ball); gk.holding = true; gk.holdT = 0; gk.stats.saves++; this.teams[gk.team].stats.saves++;
          this.emit('save', { p: gk, catch: true }); this.say(gk.shortName + ' topu güvenle kontrol etti!');
          gk.diveT = Math.min(gk.diveT, 0.25);
        } else if (out === 'parry') {
          const dir = this.dirOf(gk.team);
          const sideZ = Math.sign(ball.z || (M.chance(0.5) ? 1 : -1));
          const sp = M.clamp(ball.speed3 * M.rand(0.3, 0.5), 5, 12);
          // yana ya da öne çelme
          const toSide = M.chance(0.6);
          const behind = !toSide && M.chance(0.35); // üstten/yandan kornere çeldi
          const vx = behind ? -dir * sp * 0.7 : toSide ? dir * sp * 0.2 : dir * sp * 0.75, vz = toSide ? sideZ * sp * 0.95 : sideZ * sp * 0.6;
          A.deflect(gk, ball, vx, vz, behind ? Math.max(sp, 7) : sp, behind ? M.rand(3, 6) : M.rand(1, 4), 'save');
          gk.stats.saves++; this.teams[gk.team].stats.saves++;
          this.emit('save', { p: gk, catch: false }); this.say('Kurtardı ' + gk.shortName + '! Top yine ceza sahasında.');
        } else { /* kaçırdı */ }
      }
      if (gk.diveT <= 0) { gk.diveT = 0; gk.diveResolved = false; gk.diveIsPenalty = false; gk.lockFacing = false; }
    }

    updateGKSaves(dt) {
      const ball = this.ball;
      if (ball.owner) return;
      for (let t = 0; t < 2; t++) {
        const gk = this.gkOf(t);
        if (!gk || gk.diveT > 0 || gk.fallT > 0) continue;
        const dir = this.dirOf(t);
        const goal = P.goalCenter(-dir);
        const toward = ball.vx * -dir;
        if (toward < 5) continue;
        const dx = (gk.x - ball.x);
        let tArr = dx / ball.vx;
        if (!(tArr > 0.02 && tArr < 1.4)) continue;
        // varış noktası: falso dahil yörünge tahmini
        let pz = ball.z + ball.vz * tArr;
        let py = ball.y + ball.vy * tArr - 0.5 * 9.81 * tArr * tArr;
        const path = this.ballPath;
        if (path) { for (let i = 1; i < path.length; i++) { if ((path[i].x - gk.x) * dir <= 0) { const a = path[i - 1], b = path[i]; const f = M.clamp01((a.x - gk.x) / ((a.x - b.x) || 1e-6)); pz = a.z + (b.z - a.z) * f; py = a.y + (b.y - a.y) * f; tArr = a.t + (b.t - a.t) * f; break; } } }
        if (py < P.BALL_R) py = P.BALL_R;
        if (Math.abs(pz - goal.z) > 6 || py > 3.4) continue;
        if (M.dist(gk.x, gk.z, goal.x, goal.z) > 20) continue;
        const skill = gk.attrs.gk / 99;
        const reaction = 0.09 + (1 - skill) * 0.1;
        const d = Math.sqrt((pz - gk.z) * (pz - gk.z) + (py - 1.0) * (py - 1.0));
        const reach = 0.7 + Math.max(0, tArr - reaction) * (8.5 + skill * 3);
        if (d > reach + 0.6) { continue; }
        // kurtarış olasılığı
        const sp = ball.speed3;
        let pSave = 1.05 - d * 0.17 - sp * 0.010 + skill * 0.32 - (py > 2.0 ? 0.08 : 0) - (py < 0.5 && d > 1.5 ? 0.06 : 0);
        // uzaktan gelen top: kalecinin görme/ayarlanma süresi var → kurtarış şansı artar
        pSave += M.clamp((tArr - 0.35) * 0.6, 0, 0.3);
        if (d > reach) pSave *= 0.35;
        pSave = M.clamp(pSave, 0.08, 0.97);
        const isShot = ball.lastKick && (ball.lastKick.kind === 'shot' || ball.lastKick.kind === 'header');
        const canHandle = this.gkMayHandle(gk);
        const catchable = sp < 17 && d < 1.1 && canHandle;
        const roll = M.random();
        let outcome = roll < pSave ? (catchable && M.chance(0.75 * (this.weather ? this.weather.gkHandling : 1)) ? 'catch' : 'parry') : 'miss'; // ıslak top elden kaçar
        if (!isShot && !canHandle) outcome = roll < pSave ? 'parry' : 'miss';
        gk.diveT = Math.max(0.25, Math.min(tArr + 0.25, 0.9)); gk.diveTotal = gk.diveT;
        gk.diveTarget = { x: gk.x, z: M.clamp(pz, gk.z - 3.2, gk.z + 3.2), y: M.clamp(py, 0.2, 2.3) };
        gk.diveOutcome = outcome; gk.diveResolved = false;
        gk.facing = Math.atan2(ball.z - gk.z, ball.x - gk.x); gk.lockFacing = true;
      }
    }

    // Geri pas kuralı: takım arkadaşının bilerek ayakla oynadığı top / taç atışı elle tutulamaz
    gkMayHandle(gk) {
      const lk = this.ball.lastKick;
      if (!lk) return true;
      if (lk.team !== gk.team) return true;
      if (lk.p === gk) return true;
      if (lk.kind === 'header' || lk.kind === 'deflect' || lk.kind === 'save') return true; // kafa/göğüs/sekme serbest
      return !DELIBERATE_KICKS.has(lk.kind);
    }

    gkHoldViolation(gk) {
      // IFAB 2025/26: 8 saniyeden uzun tutma → rakibe korner
      const dir = this.dirOf(gk.team);
      A.releaseControl(gk, this.ball);
      this.emit('whistle', { reason: '8sec' });
      this.say('Hakem kaleciyi 8 saniye kuralından yakaladı: korner!');
      this.beginRestart('corner', 1 - gk.team, -dir * P.halfL, (gk.z >= 0 ? 1 : -1) * P.halfW);
    }

    /* ---------------- Top etkileşimleri ---------------- */
    /* Alıcı için buluşma noktası: en erken nokta yerine, koşu yönünü en az bozan (dönüş cezalı) uygun nokta */
    receivePoint(p) {
      const ball = this.ball;
      const path = this.ballPath;
      const first = this.interceptPoint(p);
      if (!path || path.length < 2 || p.speed < 2.5) return first;
      const cur = Math.atan2(p.vz, p.vx);
      let best = null, bc = 1e9;
      for (let i = 0; i < path.length; i++) {
        const q = path[i];
        if (q.t < first.t - 1e-6) continue;
        if (q.t > first.t + 1.6) break;
        if (q.y > 2.3) continue;
        const tNeed = AI.timeToReach(p, q.x, q.z, { react: 0.1 });
        if (tNeed > q.t) continue;
        const ang = Math.abs(M.angleDiff(cur, Math.atan2(q.z - p.z, q.x - p.x)));
        const cost = q.t + ang * 0.5;
        if (cost < bc) { bc = cost; best = { x: q.x, z: q.z, t: q.t }; }
      }
      return best || first;
    }

    updateBallInteractions(dt) {
      const ball = this.ball;
      const owner = ball.owner;
      if (owner && owner.holding) return;
      // adaylar
      const cands = [];
      const lk = ball.lastKick;
      for (const p of this.allOnPitch()) {
        if (p === owner) continue;
        const d = M.dist(p.x, p.z, ball.x, ball.z);
        if (p.kickCd > 0 || p.fallT > 0 || p.stunT > 0 || p.tackleT > 0 || p.diveT > 0) {
          // topu oynayamayacak durumda: gövdeye çarpan hızlı top yavaşlayarak seker (içinden geçmez)
          // yerde yatan / kayan / dalan oyuncu: gövde segmenti alçak bir engel → segment mesafesi kullanılır (render pozuyla aynı geometri)
          let dBody = d, bodyH = 1.9;
          const sg = this.bodySegment(p);
          if (sg) { const c = Match.segClosest(sg, ball.x, ball.z); dBody = M.dist(ball.x, ball.z, c.x, c.z); bodyH = p.diveT > 0 ? 1.2 : 0.45; }
          if (dBody < 0.32 && ball.y < bodyH && ball.speed3 > 6 && !(lk && lk.p === p && lk.t < 0.5) && !owner) {
            const ang = Math.atan2(ball.vz, ball.vx) + Math.PI + M.randn() * 1.0;
            const sp = Math.min(6, ball.speed3 * M.rand(0.15, 0.3));
            A.deflect(p, ball, Math.cos(ang), Math.sin(ang), sp, ball.y > 0.4 ? M.rand(0.5, 1.5) : 0.3, 'deflect');
            p.kickCd = Math.max(p.kickCd, 0.3);
            return;
          }
          continue;
        }
        if (d < 1.9) cands.push({ p, d });
      }
      if (!cands.length) return;
      cands.sort((a, b) => a.d - b.d);
      for (const c of cands) {
        const p = c.p;
        if (this.restartTaker === p && this.touchesSinceRestart === 0 && this.lastRestart && this.t - this.lastRestart.t < 4) {
          // çift dokunma: yalnızca top gerçekten ona geri geliyorsa ihlal say
          if (c.d < 0.5 && ball.speed < 3) { this.doubleTouch(p); return; }
          continue;
        }
        // 'bırak geç': takım arkadaşımın pası başka bir arkadaşa gidiyor ve o topu alabilecekse önüne atlamam
        if (lk && lk.team === p.team && lk.target && lk.target !== p && lk.target !== lk.p && lk.t < 2.5 && ball.speed3 > 3.5 && this.chaserOf(p.team) === lk.target && c.d > 0.35) continue;
        // alıcının önceliği: pasın hedefi topa en az benim kadar yakınsa ve oynayabilecek durumdaysa, rakip olarak araya giremem (ancak sonra müdahale edebilirim)
        if (lk && lk.team !== p.team && lk.target && lk.target.onPitch && lk.t < 3 && !ball.owner) {
          const tg = lk.target;
          if (tg.kickCd <= 0 && tg.stunT <= 0 && tg.fallT <= 0 && M.dist(tg.x, tg.z, ball.x, ball.z) < c.d + 0.35 && ball.y < 1.25) continue;
        }
        if (ball.owner && ball.owner !== p) {
          // top sahibinden uzaklaşmış (ağır dokunuş) → çalma
          const od = M.dist(ball.owner.x, ball.owner.z, ball.x, ball.z);
          if (od < 0.7 || c.d > 0.75 || ball.y > 0.8) continue;
          if (ball.owner.team === p.team) continue;
          const pWin = 0.35 + (p.attrs.tackle - ball.owner.attrs.drib) / 200 + (p.attrs.str - ball.owner.attrs.str) / 300;
          if (M.chance(pWin)) { const prev = ball.owner; A.releaseControl(prev, ball); prev.stunT = 0.35; this.tryControl(p, 0.9); this.emit('tackle', { p, victim: prev, clean: true }); return; }
          p.kickCd = 0.6; continue;
        }
        // kaleci: yüksek topu (orta / aşırtma) elle alma
        if (p.role === 'GK' && ball.y > 1.25 && ball.y < 2.7 && c.d < 1.15 && P.inPenaltyArea(ball.x, ball.z, -this.dirOf(p.team)) && this.gkMayHandle(p)) {
          const skill = p.attrs.gk / 99;
          if (M.chance(0.55 + skill * 0.4 - ball.speed3 * 0.012)) {
            this.registerTouch(p); if (this.checkOffsideOnTouch(p)) return;
            A.takeControl(p, ball); p.holding = true; p.holdT = 0;
            if (ball.lastKick && ball.lastKick.team !== p.team && (ball.lastKick.kind === 'shot' || ball.lastKick.kind === 'header') && ball.lastKick.t < 2.5) { p.stats.saves++; this.teams[p.team].stats.saves++; this.emit('save', { p, catch: true }); }
            return;
          }
          // yumrukladı
          const dir = this.dirOf(p.team); A.deflect(p, ball, dir * 0.6 + M.randn() * 0.4, M.randn(), M.rand(8, 10.5), M.rand(2, 3), 'save'); p.stats.saves++; this.teams[p.team].stats.saves++; this.emit('save', { p, catch: false }); return;
        }
        // şut bloğu: hızlı top vücuda çarpar
        if (ball.speed3 > 16 && c.d < 0.7 && ball.y < 1.9 && ball.lastKick && ball.lastKick.team !== p.team && ball.lastKick.t > 0.08) {
          if (M.chance(0.75)) {
            // blok: %55 geri seker, %45 yön değiştirerek devam eder (yana/arkaya → çoğu korner)
            const fwd = M.chance(0.45);
            const ang = Math.atan2(ball.vz, ball.vx) + (fwd ? (M.chance(0.5) ? 1 : -1) * M.rand(0.5, 1.3) : Math.PI + M.randn() * 1.2);
            A.deflect(p, ball, Math.cos(ang), Math.sin(ang), fwd ? Math.min(14, ball.speed3 * M.rand(0.35, 0.6)) : Math.min(9, ball.speed3 * M.rand(0.12, 0.3)), M.rand(0.4, 2.2), 'deflect');
            p.kickCd = 0.45; this.emit('block', { p });
            return;
          }
        }
        // göğüs/uyluk kontrolü: bana atılan havadan pas, yakınımda rakip yoksa kafayla değil göğüsle/uylukla indirilir
        const mine = lk && lk.team === p.team && lk.target === p && lk.kind !== 'cross';
        if (mine && ball.y > 0.5 && ball.y < 2.0 && c.d < 1.1) { const od = AI.nearestOpp(this, p.team, p.x, p.z).d; if (od > 1.7 || (od > 1.0 && ball.y < 1.5)) { p.chestAnim = ball.y > 1.1 ? 0.6 : 0.45; p.chestKind = ball.y > 1.1 ? 'chest' : 'thigh'; ball.y = 0.3; if (this.tryControl(p, od > 1.7 ? 0.92 : 0.8)) return; } }
        // hava topu (kafa)
        if (ball.y > 1.25 && ball.y < 2.55 && c.d < 1.0) { if (this.tryHeader(p)) return; continue; }
        if (ball.y > 1.25) continue;
        // erişim: pasın hedefi olan oyuncu topa doğru ayağını uzatır (öncelik); rakip hızlı giden topu ancak tam önündeyse keser
        let reach = A.CONTROL_R + (p.role === 'GK' ? 0.45 : 0.1);
        if (lk && lk.team === p.team && lk.target === p) reach = A.CONTROL_R + 0.45;
        else if (lk && lk.team !== p.team && lk.t < 3 && ball.speed3 > 9 && (lk.kind === 'ground' || lk.kind === 'through')) reach = A.CONTROL_R - 0.2;
        if (lk && lk.team !== p.team && p.role !== 'GK' && lk.t < 3 && ball.speed3 > 3) {
          // rakibin pası: tepki süresi dolmadan (≈0.2 s) ayak uzatılamaz, top ancak gövdeye/ayağa çarparsa kesilir;
          // benden uzaklaşan topa (yanımdan geçmiş) 0.5 m dışından yetişilmez
          if (lk.t < 0.2) reach = Math.min(reach, 0.42);
          const away = (ball.vx * (p.x - ball.x) + ball.vz * (p.z - ball.z)) < 0;
          if (away && c.d > 0.5) continue;
        }
        if (c.d > reach) continue;
        // kaleci: el ile tutma
        if (p.role === 'GK' && P.inPenaltyArea(ball.x, ball.z, -this.dirOf(p.team)) && this.gkMayHandle(p) && ball.speed3 < 19) {
          this.registerTouch(p);
          if (this.checkOffsideOnTouch(p)) return;
          A.takeControl(p, ball); p.holding = true; p.holdT = 0;
          if (ball.lastKick && ball.lastKick.team !== p.team && (ball.lastKick.kind === 'shot' || ball.lastKick.kind === 'header') && ball.lastKick.t < 2.5) { p.stats.saves++; this.teams[p.team].stats.saves++; this.emit('save', { p, catch: true }); }
          return;
        }
        if (this.tryControl(p, 1)) return;
      }
    }

    registerTouch(p) {
      const ball = this.ball;
      if (this.restartTaker && p !== this.restartTaker) this.touchesSinceRestart++;
      else if (this.restartTaker === p && this.touchesSinceRestart > 0) this.restartTaker = null;
      p.lastTouchT = this.t;
      // pas tamamlandı mı?
      const lk = ball.lastKick;
      if (lk && lk.p !== p && (lk.kind === 'ground' || lk.kind === 'lofted' || lk.kind === 'through' || lk.kind === 'cross' || lk.kind === 'throw')) {
        if (lk.team === p.team) { lk.p.stats.passesOk++; this.teams[lk.team].stats.passesOk++; this.lastCompletedPass = { from: lk.p, to: p, t: this.t }; }
        lk.completed = true;
      }
    }

    tryControl(p, mul) {
      const ball = this.ball;
      const sp = ball.speed3;
      const skill = p.attrs.drib / 99;
      const lk0 = ball.lastKick;
      const intended = lk0 && lk0.team === p.team && lk0.target === p;
      const pr = A.pressureOn(p, this.playersOnPitch(1 - p.team));
      // profesyonel ilk dokunuş: sakin ortamda neredeyse her zaman başarılı; çok hızlı/ havadan top, koşarken alma ve baskı zorlaştırır
      const spEff = ball.vy < -2.5 ? sp * 0.55 : sp; // düşen top yumuşatılarak alınır
      let pCtrl = (0.80 + skill * 0.20 - Math.max(0, spEff - 7) * 0.025 - (ball.y > 0.5 ? 0.10 : 0) - (p.speed > 6 ? 0.06 : 0) - pr * 0.12 + (intended ? 0.04 : -0.04)) * mul;
      if (p.role === 'GK') pCtrl += 0.15;
      this.registerTouch(p);
      if (this.checkOffsideOnTouch(p)) return true;
      // avantaj: fauller sonrası top kontrolü
      if (M.chance(M.clamp(pCtrl, 0.15, 0.97))) {
        const prevTeam = ball.lastTouch ? ball.lastTouch.team : -1;
        A.takeControl(p, ball);
        p.wantSprint = false; p.intent = null;
        // ilk dokunuş: top ayağa yapışmaz, hızın bir kısmı korunur ve oyuncu kısa süre topu önüne alır (hemen pas/şut yok)
        if (!(FS.Human && FS.Human.active && FS.Human.player === p)) p.decisionT = Math.max(p.decisionT, M.rand(0.35, 0.65) + sp * 0.015);
        p.firstTouchT = 0.28;
        // topu ne kadar taşıyacağı (baskı yoksa): savunmacılar sabırlı, kanatlar/forvetler çabuk
        const roleHold = FS.AI.isDef(p.role) || p.role === 'DM' ? M.rand(1.4, 3.0) : (p.role === 'CM' || p.role === 'AM') ? M.rand(1.1, 2.4) : M.rand(0.8, 1.8);
        p.holdMax = roleHold * (1.1 - (this.teams[p.team].mentality || 0.5) * 0.3);
        if (prevTeam !== -1 && prevTeam !== p.team) this.onTurnover(p);
        // savunmacı bilinçli oynadı → ofsayt bayrakları sıfırlanır
        if (this.offsideTeam !== -1 && this.offsideTeam !== p.team) { this.offsideFlagged = []; this.offsideTeam = -1; }
        // gol beklentisi: ceza sahasında pas alma
        return true;
      }
      // kötü kontrol (ağır dokunuş): top birkaç metre önüne/kenara açılır, oyuncu peşinden gider
      const ang = Math.atan2(ball.vz, ball.vx) + M.randn() * 0.6;
      const ns = M.clamp(sp * 0.25, 1.5, 4.5);
      A.deflect(p, ball, Math.cos(ang), Math.sin(ang), ns, ball.y > 0.3 ? 0.7 : 0.2, 'deflect');
      p.kickCd = 0.35;
      return true;
    }

    tryHeader(p) {
      const ball = this.ball;
      const dir = this.dirOf(p.team);
      const goal = P.goalCenter(dir), ownGoal = P.goalCenter(-dir);
      // hava topu mücadelesi: yakın rakip varsa güç/zamanlama karşılaştır
      let contest = null;
      for (const o of this.playersOnPitch(1 - p.team)) if (M.distP(o, p) < 1.4 && o.kickCd <= 0 && o.fallT <= 0) { contest = o; break; }
      if (contest) {
        const pWin = 0.5 + (p.attrs.str - contest.attrs.str) / 250 + (M.random() - 0.5) * 0.3;
        if (pWin < 0.5) { p.kickCd = 0.4; return false; }
      }
      this.registerTouch(p);
      if (this.checkOffsideOnTouch(p)) return true;
      const dGoal = M.dist(p.x, p.z, goal.x, goal.z);
      const dOwn = M.dist(p.x, p.z, ownGoal.x, ownGoal.z);
      p.kickAnim = 1; p.kickStyle = ball.y > 2.0 ? 'jumpHeader' : 'header'; // animasyon: kafa vuruşu (yüksek topta sıçrayarak)
      if (dGoal < 16 && Math.abs(p.z) < 14) {
        // kafa şut
        const gk = this.gkOf(1 - p.team);
        const side = gk ? (gk.z > 0 ? -1 : 1) : (M.chance(0.5) ? 1 : -1);
        A.shoot(p, ball, { x: goal.x, z: side * M.rand(1.2, 3), y: M.rand(0.3, 1.4) }, 0.6 + (p.attrs.str / 99) * 0.3, { style: 'header', pressure: contest ? 0.6 : 0.2 });
        this.onShot(p, { q: 0.12 + (p.attrs.str / 99) * 0.08, header: true });
        return true;
      }
      if (dOwn < 30) {
        // savunma kafası: kaleden uzağa, dışa
        const n = M.norm(p.x - ownGoal.x + dir * 6, p.z * 1.5 || (M.chance(0.5) ? 1 : -1));
        A.deflect(p, ball, n.x, n.z, 10 + M.rand(0, 6), 3.5, 'header');
        this.emit('clearance', { p });
        return true;
      }
      // kafa pası: en açık yakın takım arkadaşına (hafif havadan, ayağına; kafayla 14 m'den uzağa kontrollü pas olmaz)
      let best = null, bs = -1e9, bd = 0;
      for (const m of this.playersOnPitch(p.team)) { if (m === p) continue; const d = M.distP(m, p); if (d < 3 || d > 14) continue; const fwd = (m.x - p.x) * dir; const open = Math.min(8, AI.nearestOpp(this, p.team, m.x, m.z).d); const sc = open * 1.5 - d * 0.15 + (fwd > 0 ? 1.5 : 0); if (sc > bs) { bs = sc; best = m; bd = d; } }
      if (best) { const n = M.norm(best.x + best.vx * 0.4 - p.x, best.z + best.vz * 0.4 - p.z); A.deflect(p, ball, n.x, n.z, M.clamp(bd * 0.75, 4, 11), 1.2 + bd * 0.08, 'header'); ball.lastKick.target = best; this.onPass(p, best, 'header'); }
      else { A.deflect(p, ball, dir, 0, 8, 2, 'header'); }
      return true;
    }

    onTurnover(p) { /* istatistik/kamera için */ this.lastTurnoverT = this.t; this.emit('turnover', { p }); }

    /* ---------------- Ofsayt ---------------- */
    snapshotOffside(kicker, isShot) {
      const team = kicker.team;
      const dir = this.dirOf(team);
      const ball = this.ball;
      const defs = this.playersOnPitch(1 - team).map((d) => d.x * dir).sort((a, b) => b - a);
      const secondLast = defs.length >= 2 ? defs[1] : defs.length ? defs[0] : P.halfL;
      const ballAX = ball.x * dir;
      this.offsideFlagged = [];
      this.offsideTeam = team;
      if (!isShot) this.tightOnside = []; // milimetrik ofsaytta olmayanlar: gol olursa VAR kontrolü (şut anı listeyi silmez: son pasın durumu geçerli)
      for (const m of this.playersOnPitch(team)) {
        if (m === kicker) continue;
        const ax = m.x * dir;
        if (ax > 0.05 && ax > ballAX + 0.05 && ax > secondLast + 0.05) { this.offsideFlagged.push(m); m.offsideFlag = true; }
        else { m.offsideFlag = false; if (!isShot && ax > 0.05 && ax > secondLast - 0.9 && ax > ballAX - 0.9) this.tightOnside.push({ p: m, x: m.x, z: m.z, defX: Math.max(secondLast, ballAX) * dir, t: this.t }); }
      }
    }
    checkOffsideOnTouch(p) {
      if (this.offsideTeam !== p.team || !this.offsideFlagged.includes(p)) return false;
      if (this.noOffsideFromRestart && this.touchesSinceRestart <= 1 && this.lastRestart && this.t - this.lastRestart.t < 3) return false;
      // ofsayt! endirekt serbest vuruş
      const x = p.x, z = p.z;
      this.offsideFlagged = []; this.offsideTeam = -1;
      this.teams[p.team].stats.offsides++;
      A.releaseControl(p, this.ball);
      if (this.officials) FS.Officials.onOffside(this, p);
      this.emit('offside', { p });
      this.say('Bayrak kalktı: ' + p.name + ' ofsayt pozisyonunda.');
      this.whistleThen(() => this.beginRestart('freekick', 1 - p.team, x, z, { indirect: true }), 1.4);
      return true;
    }

    doubleTouch(p) {
      this.emit('whistle', { reason: 'doubletouch' });
      this.say('Topa iki kez dokundu: endirekt serbest vuruş.');
      this.restartTaker = null;
      this.whistleThen(() => this.beginRestart('freekick', 1 - p.team, this.ball.x, this.ball.z, { indirect: true }), 1.2);
    }

    /* ---------------- Müdahaleler ve fauller ---------------- */
    attemptTackle(tackler, owner, sliding) {
      const ball = this.ball;
      if (!owner || ball.owner !== owner) return;
      if (owner.holding) return; // elindeki topa müdahale yok (kaleciye faul sayılır; burada hiç girişilmez)
      tackler.tackleCd = sliding ? 1.6 : 0.7;
      const skill = tackler.attrs.tackle / 99, drib = owner.attrs.drib / 99;
      // arkadan mı? (taşıyıcının bakış yönü ile müdahale vektörü)
      const vx = owner.x - tackler.x, vz = owner.z - tackler.z;
      const l = M.len(vx, vz) || 1;
      const fx = Math.cos(owner.facing), fz = Math.sin(owner.facing);
      const behind = (vx / l) * fx + (vz / l) * fz > 0.45;
      const dir = this.dirOf(tackler.team);
      if (sliding) { tackler.tackleT = 0.55; tackler.tackleDir = Math.atan2(ball.z - tackler.z, ball.x - tackler.x); }
      const feint = owner.intent && owner.intent.takeOn && owner.intent.cutT != null && owner.intent.cutT < 0.6; // yön değiştirme anında savunmacı yanlış ayakta
      const slip = this.weather ? this.weather.slip : 1; // ıslak/karlı zemin: kayarak müdahale daha uzun kayar ama kontrolsüz
      let pWin = 0.40 + (skill - drib) * 0.45 - (behind ? 0.14 : 0) - (sliding ? 0.04 : 0) + (owner.speed > 6 ? 0.06 : 0) + (owner.stamina < 0.4 ? 0.08 : 0) - (feint ? 0.18 : 0) - (slip > 1 ? (slip - 1) * 0.05 : 0);
      pWin = M.clamp(pWin, 0.12, 0.8);
      let pFoul = (0.10 + (behind ? 0.22 : 0) + (sliding ? 0.14 : 0) + (1 - skill) * 0.12 + (tackler.attrs.aggression / 99) * 0.08 + (tackler.stamina < 0.4 ? 0.06 : 0)) * (slip > 1 ? 1 + (slip - 1) * 0.12 : 1);
      const r = M.random();
      tackler.stats.tackles++;
      if (r < pWin) {
        // temiz kazanım: top serbest, müdahale yönünde
        A.releaseControl(owner, ball);
        owner.stunT = 0.45;
        const ang = Math.atan2(-vz, -vx) + M.randn() * 0.7;
        const sp = sliding ? M.rand(5, 9) : M.rand(2.5, 5);
        A.deflect(tackler, ball, Math.cos(ang), Math.sin(ang), sp, sliding ? 0.6 : 0.1, 'tackle');
        tackler.kickCd = sliding ? 0.5 : 0.15;
        this.emit('tackle', { p: tackler, victim: owner, clean: true, sliding });
        if (sliding && M.chance(0.3)) this.say('Harika bir kayarak müdahale, ' + tackler.shortName + '!');
      } else if (r < pWin + pFoul * (1 - pWin)) {
        this.commitFoul(tackler, owner, { sliding, behind });
      } else {
        // ıskaladı (ıslak zeminde daha uzun kayar / yerde kalır)
        if (sliding) tackler.fallT = 0.35 * (slip > 1 ? 1 + (slip - 1) * 0.6 : 1);
        this.emit('tackle', { p: tackler, victim: owner, clean: false, sliding });
      }
    }

    commitFoul(offender, victim, info) {
      const ball = this.ball;
      const dir = this.dirOf(victim.team);
      const goal = P.goalCenter(dir);
      const x = victim.x, z = victim.z;
      offender.stats.fouls++; this.teams[offender.team].stats.fouls++;
      victim.fallT = M.rand(0.9, 1.8);
      A.releaseControl(victim, ball);
      // topa hafif ivme (düşerken)
      ball.vx += M.randn() * 1.5; ball.vz += M.randn() * 1.5;
      // kart değerlendirmesi
      const dGoal = M.dist(x, z, goal.x, goal.z);
      let defendersBetween = 0;
      // müdahale edebilecek savunmacı: faul noktasıyla hizada ya da önünde (3 m tolerans), kaleye mağdurdan uzak değil ve yanal olarak yetişebilir
      for (const d of this.playersOnPitch(offender.team)) { if (d === offender || d.role === 'GK') continue; if ((d.x - x) * dir > -3 && Math.abs(d.z - z) < 15 && M.dist(d.x, d.z, goal.x, goal.z) < dGoal + 2) defendersBetween++; }
      const towardGoal = Math.abs(M.angleDiff(victim.facing, Math.atan2(goal.z - z, goal.x - x))) < 0.8;
      // bariz gol şansı: kaleye yakın, merkeze yakın (geniş açıdan gol 'bariz' değildir), önünde savunmacı yok, kaleye doğru
      const dogso = dGoal < 30 && defendersBetween === 0 && towardGoal && (Math.abs(z) < 14 || dGoal < 16);
      const inBox = P.inPenaltyArea(x, z, dir);
      // gerçek maç oranları: ~12 faul → ~2 sarı, kırmızı ~0.1/maç. Dikkatsiz/ciddi müdahale sarı; ciddi faullü oyun (arkadan kayarak, yüksek hız) nadiren kırmızı
      const reckless = (info.sliding && info.behind) || (info.sliding && victim.speed > 6) || M.chance((offender.attrs.aggression / 99) * 0.12);
      const promising = dGoal < 45 && towardGoal && defendersBetween <= 1;
      let card = null;
      if (dogso) card = inBox && !M.chance(0.15) ? 'yellow' : 'red'; // ceza sahasında topa müdahale girişimi → sarı + penaltı; dışarıda bariz gol şansı → kırmızı
      else if (info.sliding && info.behind && victim.speed > 5 && M.chance(0.05)) card = 'red'; // ciddi faullü oyun
      else if (reckless && M.chance(0.5)) card = 'yellow';
      else if (promising && M.chance(0.3)) card = 'yellow'; // umut vadeden atağı kesme
      else if (M.chance(0.05)) card = 'yellow';
      // sakatlık
      let injury = false;
      if (M.chance((info.sliding ? 0.05 : 0.02) * (this.weather ? this.weather.injury : 1))) { injury = true; }
      const foul = { offender, victim, x, z, card, inBox, dogso, injury, info };
      this.emit('foul', foul);
      // Avantaj: faul sonrası top mağdurun takım arkadaşının yakınında ve ileri koşu varsa
      const mates = this.playersOnPitch(victim.team).filter((m) => m !== victim && M.dist(m.x, m.z, ball.x, ball.z) < 5 && (m.x - x) * dir > -2);
      const oppsNear = this.playersOnPitch(offender.team).filter((o) => o !== offender && M.dist(o.x, o.z, ball.x, ball.z) < 4).length;
      if (!inBox && !dogso && mates.length > 0 && oppsNear <= 1 && dGoal < 60 && M.chance(0.7)) {
        this.advantage = { foul, t: 0, maxT: 3.0 };
        if (this.officials) FS.Officials.onAdvantage(this);
        this.emit('advantage', foul);
        this.say('Hakem avantajı uyguluyor!');
        return;
      }
      this.callFoul(foul);
    }

    callFoul(foul) {
      const { offender, victim, x, z, card, inBox, injury } = foul;
      const victimDir = this.dirOf(victim.team);
      offender.protestT = card ? 2.6 : 1.2; // kollar açık itiraz
      if (this.officials) FS.Officials.onFoulWhistle(this, foul);
      this.say((card === 'red' ? 'KIRMIZI KART! ' : card === 'yellow' ? 'Sarı kart. ' : 'Faul. ') + offender.name + ' → ' + victim.name);
      if (injury) { victim.injured = true; victim.fallT = 4; this.addedTime += 60; this.emit('injury', { p: victim }); this.say(victim.name + ' yerde kaldı, sağlık ekibi geliyor.'); }
      const restartFn = () => {
        if (card) this.giveCard(offender, card);
        if (inBox) { this.teams[victim.team].stats.penalties = (this.teams[victim.team].stats.penalties || 0) + 1; this.beginRestart('penalty', victim.team, (P.halfL - P.penSpotDist) * victimDir, 0); }
        else this.beginRestart('freekick', victim.team, x, z, { indirect: false });
      };
      const willRed = card === 'red' || (card === 'yellow' && offender.yellow >= 1);
      this.whistleThen(restartFn, willRed ? 3.2 : card ? 2.4 : 1.4, 'foul', { offender, victim, card: willRed ? 'red' : card });
    }

    giveCard(p, card) {
      if (card === 'yellow') {
        p.yellow++;
        this.teams[p.team].stats.yellows++;
        if (this.officials) FS.Officials.onCard(this, 'yellow');
        if (p.yellow >= 2) { card = 'red'; this.emit('card', { p, card: 'yellow', second: true }); this._secondYellow = true; }
        else { this.emit('card', { p, card: 'yellow' }); return; }
      }
      if (card === 'red') {
        p.red = true; p.onPitch = false; p.hasBall = false;
        this.teams[p.team].stats.reds++;
        if (this.officials) FS.Officials.onCard(this, 'red');
        this.emit('card', { p, card: 'red', second: !!this._secondYellow }); this._secondYellow = false;
        this.say(p.name + ' oyundan ihraç edildi! ' + this.teams[p.team].name + ' 10 kişi kaldı.');
        // kaleci atıldıysa: yedek kaleci gir (değişiklik hakkı varsa) yoksa saha oyuncusu kaleye
        if (p.role === 'GK') this.emergencyGK(p.team);
        // ihraç edilen oyuncu yavaşça kenara, oradan tünele yürür (ara sahne)
        this.startWalkOff(p, 'red');
        if (this.restart && this.state === 'setup') this.restart.timer = Math.max(this.restart.timer, 6.2); else this.extraSetupDelay = 3.2;
      }
    }

    emergencyGK(teamIdx) {
      const team = this.teams[teamIdx];
      const subGK = team.subs.find((s) => s.pos === 'GK' && !s.onPitch);
      if (subGK && team.subsUsed < 5) {
        // en az değerli saha oyuncusunu çıkar
        const out = this.playersOnPitch(teamIdx).filter((p) => p.role !== 'GK').sort((a, b) => a.attrs.overall - b.attrs.overall)[0];
        this.substitute(teamIdx, out, subGK, 'GK', true);
      } else {
        const p = this.playersOnPitch(teamIdx).sort((a, b) => b.attrs.gk - a.attrs.gk)[0];
        p.role = 'GK'; p.slot = 0; this.say(p.name + ' kaleye geçti!');
      }
    }

    updateAdvantage(dt) {
      const adv = this.advantage;
      if (!adv) return;
      adv.t += dt;
      const ball = this.ball;
      const victimTeam = adv.foul.victim.team;
      const possTeam = ball.owner ? ball.owner.team : ball.lastTouch ? ball.lastTouch.team : victimTeam;
      if (possTeam !== victimTeam && adv.t > 0.4) {
        // avantaj gerçekleşmedi → faul geri çağrılır
        this.advantage = null;
        this.say('Avantaj yok, hakem faule dönüyor.');
        this.callFoul(adv.foul);
        return;
      }
      if (adv.t > adv.maxT || this.state !== 'play') {
        // avantaj tamamlandı; kart varsa ilk duraklamada göster
        if (adv.foul.card) this.pendingCards.push({ p: adv.foul.offender, card: adv.foul.card });
        this.advantage = null;
        this.emit('advantage_end', adv.foul);
      }
    }

    showPendingCards() {
      while (this.pendingCards.length) { const c = this.pendingCards.shift(); this.giveCard(c.p, c.card); this.say('Avantaj sonrası kart: ' + c.p.name); }
    }

    whistleThen(fn, delay, reason, extra) {
      this.emit('whistle', Object.assign({ reason: reason || 'stop', delay }, extra || {}));
      this.setState('whistle');
      this._whistleFn = fn; this._whistleDelay = delay;
      this.ball.owner = null;
      for (const p of this.allOnPitch()) p.hasBall = false;
    }
    updateWhistle(dt) {
      // oyuncular yavaşlar, top serbest sürtünme ile durur
      for (const p of this.allOnPitch()) if (p.fallT <= 0 && p.tackleT <= 0) A.stop(p, dt);
      this.ball.step(dt);
      if (this.stateT >= this._whistleDelay) { const fn = this._whistleFn; this._whistleFn = null; fn(); }
    }

    /* ---------------- Gol / Oyun dışı ---------------- */
    checkGoal() {
      const ball = this.ball;
      for (const dir of [1, -1]) {
        if (P.isGoal(ball.x, ball.y, ball.z, dir)) {
          // dir yönündeki kaleye gol: bu kaleye hücum eden takım puan alır
          const scoringTeam = this.dirOf(0) === dir ? 0 : 1;
          const lt = ball.lastTouch;
          const ownGoal = lt && lt.team !== scoringTeam;
          const scorer = ownGoal ? lt : (lt || ball.lastKick.p);
          // gol atılan takım ve pas veren
          let assist = null;
          const lk = ball.lastKick;
          if (!ownGoal && this.lastCompletedPass && this.lastCompletedPass.to === scorer && this.t - this.lastCompletedPass.t < 8 && this.lastCompletedPass.from.team === scoringTeam) assist = this.lastCompletedPass.from;
          this.teams[scoringTeam].score++;
          if (!ownGoal) { scorer.stats.goals++; if (assist) assist.stats.assists++; } else scorer.stats.ownGoals = (scorer.stats.ownGoals || 0) + 1;
          this.addedTime += 45; // gol sevinci ~45 sn
          for (const p of this.playersOnPitch(scoringTeam)) { p.celebrateT = 3.5; p.celStyle = null; p.celKneelT = 0; p.celHugNear = false; }
          // sevinç koreografisi: golcü stili (isme göre sabit karakter + duruma göre): diz kayması, köşe bayrağı, gökyüzü, 'duyamıyorum'; takım arkadaşları kucaklaşmaya koşar
          if (!ownGoal) {
            const r = M.hashRand(scorer.name, 'celst' + this.teams[scoringTeam].score);
            const dGoalDiff = this.teams[scoringTeam].score - this.teams[1 - scoringTeam].score;
            let st = r < 0.22 ? 3 : r < 0.42 ? 0 : r < 0.58 ? 4 : r < 0.72 ? 2 : r < 0.86 ? 5 : 1;
            const wasPen = !!(lk && this.lastRestart && this.lastRestart.type === 'penalty' && this.touchesSinceRestart === 0);
            if (wasPen && st === 3) st = 1;
            if (dGoalDiff < 0 && st !== 0) st = 0; // hâlâ gerideyken: kutlama kısa, topu alıp orta sahaya (kollar havada koşar)
            scorer.celStyle = st; scorer.celRunT = 0;
            for (const p of this.playersOnPitch(scoringTeam)) if (p !== scorer && p.role !== 'GK') p.celStyle = M.hashRand(p.name, 'celm') < 0.7 ? 6 : 0;
          }
          const info = { team: scoringTeam, scorer, assist, ownGoal, penalty: !!(lk && this.lastRestart && this.lastRestart.type === 'penalty' && this.touchesSinceRestart === 0), score: [this.teams[0].score, this.teams[1].score], x: ball.x, z: ball.z, t: this.t };
          // VAR: son pasta milimetrik ofsayt şüphesi varsa ofsayt kontrolü; aksi hâlde %15 rutin kontrol
          const tight = !ownGoal && !info.penalty && this.tightOnside.find((o) => o.p === scorer && this.t - o.t < 10);
          info.var = tight ? 'offside' : (!ownGoal && !info.penalty && M.chance(0.15) ? 'routine' : null);
          if (tight) { info.varPos = { x: tight.x, z: tight.z }; info.varDefX = tight.defX; info.varT = tight.t; }
          info.varPending = !!info.var;
          this.goalInfo = info;
          // maç sonu özet için gol anı kaydı (son 4.5 s'nin tekrar kareleri kopyalanır; tampon 20 s'lik)
          const clipFrames = this.replayBuffer.filter((f) => f.t >= this.t - 4.6).map((f) => f);
          if (clipFrames.length > 10) { this.highlights = this.highlights || []; this.highlights.push({ kind: 'goal', minute: this.minuteLabel(), scorer, team: scoringTeam, ownGoal, frames: clipFrames, score: info.score.slice(), x: ball.x, z: ball.z }); }
          if (this.officials) FS.Officials.onGoal(this);
          this.emit('goal', info);
          this.say((ownGoal ? 'KENDİ KALESİNE! ' : 'GOOOL! ') + scorer.name + ' — ' + this.teams[0].short + ' ' + this.teams[0].score + ' - ' + this.teams[1].score + ' ' + this.teams[1].short);
          this.setState('goal');
          return true;
        }
      }
      return false;
    }

    updateGoalState(dt) {
      const ball = this.ball;
      ball.step(dt);
      const info = this.goalInfo;
      // sevinç koreografisi: golcü stiline göre koşu hedefi (köşe bayrağı / kamera önü / diz kayması), takım arkadaşları golcüye koşup sarılır, rakipler durur
      const sc = info.scorer;
      const sdir = this.dirOf(sc.team);
      const st = sc.celStyle != null ? sc.celStyle : 2;
      const side = Math.sign(sc.z || 1);
      // hedef: köşe bayrağı (stil 2/4), kamera tarafı yan çizgi (stil 5), kısa koşu + diz kayması (stil 3), zıplama yerinde (0), yumruk koşusu (1)
      let cx, cz;
      if (st === 2 || st === 4) { cx = sdir * 46; cz = side * 30; }
      else if (st === 5) { cx = M.clamp(sc.x, -30, 30); cz = -30; }
      else if (st === 3) { if (sc.celTarget == null) sc.celTarget = { x: M.clamp(sc.x + sdir * 3 * 0 + (side * 0), -45, 45), z: M.clamp(sc.z + side * 10, -28, 28) }; cx = sc.celTarget.x; cz = sc.celTarget.z; }
      else if (st === 1) { cx = sdir * 30; cz = side * 22; }
      else { cx = sc.x; cz = sc.z; }
      for (const p of this.allOnPitch()) {
        if (p.team === info.team && p.celebrateT > 0 && p.role !== 'GK') {
          if (p === sc) {
            const d = M.dist(p.x, p.z, cx, cz);
            if (st === 3) {
              if (p.celKneelT > 0) { p.celKneelT -= dt; p.vx *= 0.94; p.vz *= 0.94; p.speed = M.len(p.vx, p.vz); p.lockFacing = true; if (p.speed > 0.2) { p.x += p.vx * dt; p.z += p.vz * dt; } }
              else if (p.celKneelDone) A.stop(p, dt);
              else if (d > 2.0) A.moveToward(p, cx, cz, true, dt);
              else { p.celKneelT = 2.2; p.celKneelDone = true; }
            } else if (d > 2) A.moveToward(p, cx, cz, true, dt);
            else { A.stop(p, dt); if (st === 5 || st === 2) { p.facing = st === 5 ? -Math.PI / 2 : Math.atan2(-sc.z, -sc.x * 0.2); p.lockFacing = true; } }
          } else {
            // takım arkadaşları: golcünün etrafında halka (kucaklaşma), ilk gelenler 1.2 m'ye kadar
            const ang = M.hashRand(p.name, 'hug') * Math.PI * 2;
            const rad = 1.1 + (M.hashRand(p.name, 'hugr') > 0.5 ? 0 : 0.9);
            const tx = sc.x + Math.cos(ang) * rad, tz = sc.z + Math.sin(ang) * rad;
            const d = M.dist(p.x, p.z, tx, tz);
            p.celHugNear = M.distP(p, sc) < 2.4;
            if (d > 0.8) A.moveToward(p, tx, tz, d > 6, dt, { arrive: 0.6, speedCap: d < 3 ? 2.5 : undefined }); else { A.stop(p, dt); A.faceTo(p, sc.x, sc.z); }
          }
        } else A.stop(p, dt);
      }
      if (info.varPending && this.stateT > 3.4) { info.varPending = false; this.startVar(info); return; }
      if (this.stateT > 5.0) {
        const concede = 1 - info.team;
        this.placeForKickoff(concede, false);
        this.considerSubstitutions();
        this.showPendingCards();
      }
    }

    checkOutOfPlay() {
      const ball = this.ball;
      if (ball.owner && !ball.owner.holding) {
        // top süren oyuncu çizgiyi geçerse
        if (P.fullyOutTouch(ball.z) || P.fullyOutGoalLine(ball.x)) { /* aşağıda işlenir */ } else return false;
      }
      const lt = ball.lastTouch;
      const ltTeam = lt ? lt.team : this.possession;
      if (P.fullyOutTouch(ball.z)) {
        const x = M.clamp(ball.x, -P.halfL + 0.5, P.halfL - 0.5), z = Math.sign(ball.z) * P.halfW;
        const team = 1 - ltTeam;
        this.say('Taç: ' + this.teams[team].name);
        if (this.officials) FS.Officials.onThrowIn(this, x, z, team);
        this.beginRestart('throwin', team, x, z);
        return true;
      }
      if (P.fullyOutGoalLine(ball.x)) {
        const endDir = Math.sign(ball.x); // hangi kale çizgisi
        const attackingThatEnd = this.dirOf(0) === endDir ? 0 : 1; // bu çizgiye hücum eden takım
        const defendingTeam = 1 - attackingThatEnd;
        // yakın kaçış olayı
        const lk = ball.lastKick;
        if (lk && (lk.kind === 'shot' || lk.kind === 'header') && lk.team === attackingThatEnd && Math.abs(ball.z) < 7 && lk.t < 3) {
          this.emit('nearmiss', { p: lk.p, dz: Math.abs(ball.z) - P.goalWidth / 2, high: ball.y - P.goalHeight });
          if (ball.hitPost) this.say('DİREK! ' + lk.p.name + ' çok yaklaştı!'); else this.say('Az farkla auta gitti, ' + lk.p.name + '.');
        }
        if (ltTeam === attackingThatEnd) {
          // aut: kale vuruşu
          const gx = (P.halfL - P.goalAreaDepth) * endDir, gz = Math.sign(ball.z || 1) * 5.5;
          this.beginRestart('goalkick', defendingTeam, gx, gz);
        } else {
          // korner
          const cz = Math.sign(ball.z || (M.chance(0.5) ? 1 : -1)) * P.halfW;
          this.say('Korner: ' + this.teams[attackingThatEnd].name);
          this.beginRestart('corner', attackingThatEnd, P.halfL * endDir, cz);
        }
        return true;
      }
      return false;
    }

    /* ---------------- Olay kancaları ---------------- */
    onShot(p, info) {
      const team = this.teams[p.team];
      team.stats.shots++;
      const q = info && info.q != null ? info.q : 0.1;
      team.stats.xg += q;
      this.lastShot = { p, t: this.t, q };
      this.emit('shot', { p, q, penalty: info && info.penalty, freekick: info && info.freekick, header: info && info.header });
      // isabet: yörünge kale çerçevesine gidiyor mu?
      const dir = this.dirOf(p.team);
      const ball = this.ball;
      const gx = P.halfL * dir;
      // isabet: sürtünme/falso dahil gerçek yörünge tahmini ile kale çizgisini geçtiği noktaya bak
      const path = ball.predictPath(4, 0.1);
      let onTarget = false;
      if (path && path.length > 1) {
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1], b = path[i];
          if ((a.x - gx) * dir < 0 && (b.x - gx) * dir >= 0) {
            const f = (gx - a.x) / ((b.x - a.x) || 1e-6);
            const pz = a.z + (b.z - a.z) * f, py = a.y + (b.y - a.y) * f;
            onTarget = Math.abs(pz) < P.goalWidth / 2 + 0.1 && py < P.goalHeight + 0.1;
            break;
          }
        }
      }
      this.lastShot.onTarget = onTarget;
      if (onTarget) { team.stats.shotsOn++; p.stats.shotsOn++; }
      this.snapshotOffside(p, true); // şut da pas gibi ofsayt anlık görüntüsü oluşturur (sekme sonrası)
      if (q > 0.3) this.say(p.name + ' vuruyor!');
    }
    onPass(p, target, kind) {
      this.teams[p.team].stats.passes++;
      // hedef alıcı: kovalama rolü ve kontrol önceliği için
      const lk = this.ball.lastKick;
      if (lk && lk.p === p && target && target !== p) { lk.target = target; target.expectPassT = this.t; }
      this.snapshotOffside(p);
      this.noOffsideFromRestart = false;
      this.emit('pass', { p, target, kind });
    }
    onDistribution(p, target) {
      this.teams[p.team].stats.passes++;
      // hedef alıcı: kovalama rolü, 'bırak geç' ve kontrol önceliği için (saha oyuncusu paslarıyla aynı)
      const lk = this.ball.lastKick;
      if (lk && lk.p === p && target && target !== p) { lk.target = target; target.expectPassT = this.t; }
      this.snapshotOffside(p);
      this.emit('pass', { p, target, kind: 'gk' });
    }

    /* ---------------- Oyuncu değişikliği ---------------- */
    /* Kullanıcı ara sahneyi atladı: duran top beklemesini ve çizgide bekleyen oyuncuları hızlandır */
    skipWait() {
      if (this.state === 'lineup') this.endLineup();
      if (this.state === 'setup' && this.restart) this.restart.timer = Math.min(this.restart.timer, 1.0);
      if (this.state === 'whistle' && this._whistleDelay != null) this._whistleDelay = Math.min(this._whistleDelay, this.stateT + 0.4);
      for (const p of this.allOnPitch()) if (p.enterWait > 0.3) p.enterWait = 0.3;
    }

    /* Saha dışına yürüyüş: değişiklikte çıkan oyuncu / kırmızı kart gören oyuncu.
       1. aşama: en yakın kenar çizgisinin 3 m dışı; 2. aşama: kulübe (kenar boyunca) veya tünel; uzak kenardan çıkanlar tünele gitmiş sayılır (gizlenir). */
    startWalkOff(p, why) {
      const benchX = (p.team === 0 ? -1 : 1) * (7.6 + (p.number % 4) * 1.1);
      const nearSide = p.z < 8 ? -1 : 1; // kulübe tarafı (-z) tercih edilir
      const first = { x: M.clamp(p.x, -P.halfL + 2, P.halfL - 2), z: nearSide * (P.halfW + 3.2), speed: why === 'red' ? 1.35 : 1.7 };
      if (nearSide > 0) first.next = { x: first.x, z: first.z + 0.6, speed: 1.2, hide: true }; // uzak taraf: tünele
      else if (why === 'red') first.next = { x: (p.team === 0 ? -1 : 1) * 2, z: -(P.halfW + 3.8), speed: 1.5, hide: true, face: Math.PI / 2 }; // soyunma odasına
      else first.next = { x: benchX, z: -(P.halfW + 3.0), speed: 1.8, face: Math.PI / 2 }; // kulübeye
      p.walkTo = first; p.hidden = false; p.hasBall = false; p.intent = null; p.lockFacing = false;
      if (!this.walkers.includes(p)) this.walkers.push(p);
    }
    updateWalkers(dt) {
      for (let i = this.walkers.length - 1; i >= 0; i--) {
        const p = this.walkers[i]; const w = p.walkTo;
        if (!w) { this.walkers.splice(i, 1); continue; }
        const d = M.dist(p.x, p.z, w.x, w.z);
        if (d < 0.5) {
          A.stop(p, dt);
          if (p.speed < 0.15) {
            if (w.face != null) p.facing = w.face;
            if (w.hide) p.hidden = true;
            p.walkTo = w.next || null;
            if (!p.walkTo) this.walkers.splice(i, 1);
          }
          continue;
        }
        A.moveToward(p, w.x, w.z, false, dt, { arrive: 1.0, speedCap: w.speed || 1.7 });
      }
    }

    considerSubstitutions() {
      this._subScenes = 0;
      // otomatik teknik direktör: duraklamalarda skor/dakika/eksik oyuncuya göre taktik ve diziliş (insan takımı 'otomatik' kapalıysa dokunulmaz)
      if (FS.Tactics) for (let t = 0; t < 2; t++) { const team = this.teams[t]; if (!(team.tactics && !team.tactics.auto && (team.controlled || team.tactics.managed))) FS.Tactics.autoUpdate(this, team); }
      for (let t = 0; t < 2; t++) {
        const team = this.teams[t];
        if (team.subsUsed >= 5) continue;
        const minute = this.clock / 60;
        const inHalftime = this.state === 'halftime';
        if (!inHalftime && team.subWindows >= 3) continue;
        const candidates = [];
        for (const p of this.playersOnPitch(t)) {
          if (p.role === 'GK') continue;
          let need = 0;
          if (p.injured) need = 10;
          else if (p.stamina < 0.42 && minute > 55) need = 4 + (0.42 - p.stamina) * 10;
          else if (p.yellow > 0 && p.attrs.aggression > 70 && minute > 70 && AI.isDef(p.role)) need = 2.5;
          else if (minute > 78 && p.stamina < 0.55) need = 2;
          if (need > 0) candidates.push({ p, need });
        }
        if (!candidates.length) continue;
        candidates.sort((a, b) => b.need - a.need);
        const plan = [];
        const taken = new Set();
        for (const c of candidates) {
          if (team.subsUsed + plan.length >= 5) break;
          if (c.need < 2.5 && plan.length > 0) break;
          const sub = this.pickSub(team, c.p, taken);
          if (sub) { plan.push({ out: c.p, in: sub }); taken.add(sub); }
        }
        if (!plan.length) continue;
        if (!inHalftime) team.subWindows++;
        // aynı duraklamadaki çoklu değişiklikler birlikte yapılır (girenler yan yana bekler, birlikte girer)
        plan.forEach((s) => this.substitute(t, s.out, s.in, s.out.role, false, 0));
        // değişiklik sahnesi (çıkan 2.4 s + giren 2.2 s; iki takım da değiştiriyorsa iki sahne) sığsın diye duran top bekleme süresi uzar
        this._subScenes = (this._subScenes || 0) + 1;
        if (this.restart && this.state === 'setup') this.restart.timer = Math.max(this.restart.timer, 1.2 + 4.6 * Math.min(2, this._subScenes));
      }
    }
    pickSub(team, out, taken) {
      const avail = team.subs.filter((s) => !s.onPitch && !s.used && s.pos !== 'GK' && !(taken && taken.has(s)));
      if (!avail.length) return null;
      const same = avail.filter((s) => s.pos === out.role || (AI.isAtt(s.pos) && AI.isAtt(out.role)) || (AI.isMid(s.pos) && AI.isMid(out.role)) || (AI.isDef(s.pos) && (AI.isDef(out.role) || AI.isWB(out.role))));
      const pool = same.length ? same : avail;
      return pool.sort((a, b) => b.attrs.overall - a.attrs.overall)[0];
    }
    substitute(teamIdx, out, sub, role, emergency, delay) {
      const team = this.teams[teamIdx];
      const atBreak = this.state === 'halftime' || this.state === 'pre';
      out.onPitch = false; out.subbedOff = true; out.hasBall = false;
      sub.onPitch = true; sub.used = true; sub.isSub = false; sub.role = role; sub.slot = out.slot;
      // yedek listesinden sahadaki kadroya taşı (playersOnPitch / teamGK team.players üzerinden çalışır)
      const si = team.subs.indexOf(sub); if (si >= 0) team.subs.splice(si, 1);
      if (!team.players.includes(sub)) team.players.push(sub);
      // yeni oyuncu özellikleri role göre yeniden hesaplanır
      sub.attrs = FS.buildAttributes(sub.name, role, sub.attrs.overall);
      sub.maxSpeed = 6.6 + (sub.attrs.pace / 99) * 3.0; sub.accel = 5.5 + (sub.attrs.acc / 99) * 4.5;
      // yeni oyuncu orta çizgiden, yedek kulübesi tarafından girer (IFAB: orta çizgi, oyun durmuşken)
      sub.x = (teamIdx === 0 ? -1 : 1) * (1.2 + 1.4 * (team.subsUsed % 5)); sub.z = -(P.halfW + 1.2); sub.vx = sub.vz = 0; sub.speed = 0; sub.facing = Math.PI / 2; sub.stamina = 1;
      sub.spX = out.spX != null ? out.spX : out.homeX; sub.spZ = out.spZ != null ? out.spZ : out.homeZ; sub.homeX = out.homeX; sub.homeZ = out.homeZ;
      // çıkan oyuncu sahayı terk edene kadar giren oyuncu çizgide bekler (IFAB 3.3)
      sub.enterWait = atBreak ? 0 : 3.2 + (delay || 0);
      if (atBreak) { // devre arası: doğrudan yer değiştir, tören yok
        sub.x = out.x; sub.z = out.z; out.hidden = true; out.x = (teamIdx === 0 ? -1 : 1) * 20; out.z = -(P.halfW + 3);
      } else this.startWalkOff(out, 'sub'); // çıkan oyuncu en yakın kenardan yürüyerek çıkar, kulübeye gider
      team.subsUsed++;
      this.addedTime += 30;
      if (this.officials && this.officials.fourth && !atBreak) { const f = this.officials.fourth; f.boardT = 5; f.boardKind = 'sub'; f.boardOut = out.number; f.boardIn = sub.number; }
      this.emit('sub', { team: teamIdx, out, in: sub, emergency, atBreak });
      this.say('Oyuncu değişikliği (' + team.short + '): ' + sub.name + ' giriyor, ' + out.name + ' çıkıyor.');
      if (FS.Human && FS.Human.active) FS.Human.onSubstitution(this, out, sub);
    }

    /* ---------------- Yarı / maç sonu ---------------- */
    checkHalfEnd() {
      const base = this.half === 1 ? 0 : 45 * 60;
      const inHalf = this.clock - base;
      const regulation = 45 * 60;
      if (inHalf >= regulation - 60 && this.announcedAdded == null) {
        this.announcedAdded = Math.max(1, Math.min(9, Math.ceil(this.addedTime / 60) + (this.half === 2 ? 2 : 1)));
        if (this.officials && this.officials.fourth) { this.officials.fourth.boardT = 6; this.officials.fourth.boardText = '+' + this.announcedAdded; this.officials.fourth.boardKind = 'added'; }
        this.emit('addedtime', { minutes: this.announcedAdded });
        this.say('Dördüncü hakem uzatmayı gösterdi: +' + this.announcedAdded);
      }
      if (this.announcedAdded != null && inHalf >= regulation + this.announcedAdded * 60) {
        // tarafsız an: top hücum eden takımın son üçte birinde değilse bitir
        const ball = this.ball;
        const attTeam = this.possession;
        const dir = this.dirOf(attTeam);
        const inFinalThird = ball.x * dir > 18;
        const over = inHalf - (regulation + this.announcedAdded * 60);
        if (!inFinalThird || over > 40) this.endHalf();
      }
    }
    endHalf() {
      this.emit('whistle', { reason: 'half' });
      if (this.half === 1) {
        this.setState('halftime');
        this.emit('halftime', { score: [this.teams[0].score, this.teams[1].score] });
        this.say('İlk yarı sona erdi.');
      } else {
        this.setState('fulltime'); this.finished = true;
        this.emit('fulltime', { score: [this.teams[0].score, this.teams[1].score] });
        this.say('Maç sona erdi! ' + this.teams[0].name + ' ' + this.teams[0].score + ' - ' + this.teams[1].score + ' ' + this.teams[1].name);
      }
    }
    /* Maç süresini oyun içinde değiştir: yarı başına gerçek saniye. Saat (maç dakikası) korunur, sadece akış hızı değişir. */
    setHalfLength(halfRealSec) {
      halfRealSec = Math.max(30, halfRealSec);
      this.opts.halfRealSec = halfRealSec;
      this.timeScale = (45 * 60) / halfRealSec;
      FS.STAMINA_MUL = 0.42 * (15 / this.timeScale);
      this.emit('commentary', { text: 'Maç temposu güncellendi: yarı başına ' + (halfRealSec / 60).toFixed(1).replace(/\.0$/, '') + ' dk.' });
    }
    startSecondHalf() {
      this.half = 2; this.clock = 45 * 60; this.addedTime = 0; this.announcedAdded = null;
      for (const p of this.allOnPitch()) { p.stamina = Math.min(1, p.stamina + 0.25); }
      this.considerSubstitutions();
      this.kickoffTeam = 1 - this.firstKickoffTeam;
      this.placeForKickoff(this.kickoffTeam, true);
      this.emit('secondhalf', {});
      this.say('İkinci yarı başlıyor.');
    }
    updateHalfEnd() {}

    /* ---------------- Yardımcı: istatistik özeti ---------------- */
    possessionPct() {
      const a = this.teams[0].stats.possessionT, b = this.teams[1].stats.possessionT;
      const tot = a + b || 1;
      return [Math.round((a / tot) * 100), Math.round((b / tot) * 100)];
    }
  }

  FS.kitClash = function (k1, k2) {
    const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const a = hex(k1.c1), b = hex(k2.c1);
    const d = Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
    return d < 110;
  };

  FS.Match = Match;
})(typeof window !== 'undefined' ? window : globalThis);
