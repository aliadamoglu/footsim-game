/* Sinematik kamera yönetmeni
   Prensipler:
   - Fiziksel yay-sönüm (2. derece sistem) ile takip → hiç kesik hareket yok, organik ivmelenme
   - Oyun okuma: kadraj hedefi = top + ilgi ağırlıklı oyuncular + hız öngörüsü (lead)
   - Zoom, hızı ve aksiyon yoğunluğunu (top hızı, kaleye yakınlık) izler
   - Operatör el titremesi (çok düşük genlikli düşük frekans gürültü) — yayın kamerası hissi
   - Olay kesmeleri: gol → yakın sevinç açısı → tekrar (farklı açı, yavaş çekim) → geniş plan
   - Duran toplar: penaltı/serbest vuruş için özel açılar; korner: kale arkası vinç
   - Kesmeler arası minimum süre; 30° kuralına saygı (küçük açı farklı kesme yok, blend et)
*/
(function (root) {
  const FS = (root.FS = root.FS || {});
  const M = FS.M, P = FS.PITCH;

  class Director {
    constructor(scene, canvas) {
      this.scene = scene;
      const cam = (this.cam = new BABYLON.UniversalCamera('cam', new BABYLON.Vector3(0, 28, -62), scene));
      cam.minZ = 0.3; cam.maxZ = 800; cam.fov = 0.6;
      cam.inputs.clear();
      // yay durumları
      this.pos = { x: 0, y: 28, z: -62, vx: 0, vy: 0, vz: 0 };
      this.look = { x: 0, y: 0.5, z: 0, vx: 0, vy: 0, vz: 0 };
      this.fov = { v: 0.6, vel: 0 };
      this.mode = 'broadcast';
      this.userMode = 'auto'; // auto | broadcast | tv2 | low | drone | goal | player
      this.shot = null; // aktif özel çekim
      this.shotT = 0;
      this.lastCutT = 0;
      this.t = 0;
      this.replay = null;
      this.shake = 0;
      this.interest = { x: 0, z: 0 };
      this.roll = 0;
      this.freeFly = false;
    }

    /* Anlık atlama (kesme) */
    cutTo(px, py, pz, lx, ly, lz, fov) {
      this.pos.x = px; this.pos.y = py; this.pos.z = pz; this.pos.vx = this.pos.vy = this.pos.vz = 0;
      this.look.x = lx; this.look.y = ly; this.look.z = lz; this.look.vx = this.look.vy = this.look.vz = 0;
      if (fov) { this.fov.v = fov; this.fov.vel = 0; }
      this.lastCutT = this.t;
    }

    /* Olay kancası */
    onEvent(ev, match) {
      const ball = match.ball;
      // Oyuncu takip (kontrol) modunda yönetmen kesmeleri oyunu bozmasın: sadece gol dizisi ve açılış/devre çekimleri
      if (this.userMode === 'player') {
        const ok = ['goal', 'kickoff', 'halftime', 'fulltime', 'sub', 'lineup', 'lineup_line', 'handshake', 'lineup_end', 'var_check', 'var_decision'].includes(ev.type) || ((ev.type === 'card' || ev.type === 'whistle') && ev.card === 'red');
        if (!ok) return;
      }
      if (ev.type === 'goal') {
        const scorer = ev.scorer;
        if (ev.varPending) {
          // VAR kontrolü gelecek: kısa sevinç → hakem kulaklık yakın plan (var_check olayı devamını kurar)
          this.queue = [{ kind: 'celebrate', dur: 3.2, target: scorer }];
        } else {
          // 1) sevinç yakın çekim 3 s, 2) iki tekrar (yavaş), 3) geniş
          this.queue = [
            { kind: 'celebrate', dur: 3.0, target: scorer },
            { kind: 'replay', dur: 5.2, angle: 'behindGoal', slow: 0.4, endT: match.t, from: match.t - 4.2 },
            { kind: 'replay', dur: 4.6, angle: 'lowSide', slow: 0.5, endT: match.t, from: match.t - 3.2 },
            { kind: 'celebrate', dur: 1.6, target: scorer, wide: true },
          ];
        }
        this.startNext(match);
      } else if (ev.type === 'var_check') {
        // VAR: hakem kulaklıkta (yakın plan) → monitör/ofsayt çizgisi tekrarı → hakem karar
        const ref = match.referee; const gi = match.goalInfo || {};
        const varT = gi.varT != null ? gi.varT : match.t - 4;
        const goalT = gi.t != null ? gi.t : match.t - 3.4;
        this.queue = [
          { kind: 'closeup', dur: 2.2, target: ref, soft: false, refShot: true },
          ev.tight
            ? { kind: 'replay', dur: 6.2, angle: 'lowSide', slow: 0.5, endT: varT + 0.9, from: varT - 1.2, varLine: true, freezeT: varT, holdDur: 1.9 } // pas anında donar, ofsayt çizgileri çizilir
            : { kind: 'replay', dur: 3.6, angle: 'behindGoal', slow: 0.4, endT: goalT + 0.2, from: goalT - 2.8 },
          { kind: 'closeup', dur: 2.6, target: ref, refShot: true, hold: true },
        ];
        this.startNext(match);
      } else if (ev.type === 'var_decision') {
        const ref = match.referee;
        if (ev.decision === 'goal') this.queue = [{ kind: 'closeup', dur: 1.6, target: ref, refShot: true }, { kind: 'celebrate', dur: 1.8, target: ev.scorer, wide: true }];
        else this.queue = [{ kind: 'closeup', dur: 2.0, target: ref, refShot: true }, { kind: 'closeup', dur: 1.8, target: ev.scorer, push: true }];
        this.startNext(match);
      } else if (ev.type === 'lineup') {
        // seremoni: tünel içi el kamerası → tünel ağzı alçak açı (çıkış) → geniş vinç → dizilme pan'ı (lineup_line olayında) → tokalaşma
        this.queue = [
          { kind: 'tunnelIn', dur: 6.5 },
          { kind: 'tunnelOut', dur: 9 },
          { kind: 'establishing', dur: 7, ceremony: true },
          { kind: 'lineupPan', dur: 30 },
        ];
        this.startNext(match);
      } else if (ev.type === 'lineup_line') {
        if (!this.shot || this.shot.kind !== 'lineupPan') { this.queue = [{ kind: 'lineupPan', dur: 30 }]; this.startNext(match); }
        else this.shotT = 0;
      } else if (ev.type === 'handshake') {
        this.queue = [{ kind: 'handshake', dur: 18 }];
        this.startNext(match);
      } else if (ev.type === 'lineup_end') {
        this.queue = [{ kind: 'establishing', dur: 5.5 }];
        this.startNext(match);
      } else if (ev.type === 'addedtime') {
        const f4 = match.officials && match.officials.fourth;
        if (f4 && !this.shot) { this.queue = [{ kind: 'boardShot', dur: 2.6, target: f4 }]; this.startNext(match); }
      } else if (ev.type === 'injury') {
        this.queue = [{ kind: 'closeup', dur: 3.4, target: ev.p, injury: true }];
        this.startNext(match);
      } else if (ev.type === 'nearmiss' || (ev.type === 'save' && !ev.catch && match.lastShot && match.lastShot.q > 0.15)) {
        // top oyun dışıysa (aut/korner hazırlığı) kısa tekrar
        this.pendingReplay = { kind: 'replay', dur: 3.6, angle: ev.type === 'save' ? 'behindGoal' : 'lowSide', slow: 0.45, endT: match.t + 0.3, from: match.t - 2.6 };
      } else if (ev.type === 'penalty' || (ev.type === 'freekick' && match.restart && match.restart.shootable)) {
        const build = { kind: ev.type === 'penalty' ? 'penaltyBuild' : 'freekickBuild', dur: ev.type === 'penalty' ? 3.2 : 3.0 };
        const sendOff = this.shot && (this.shot.kind === 'walkoff' || this.shot.kind === 'sideWide' || (this.shot.kind === 'closeup' && this.shot.push));
        if (sendOff) this.queue = (this.queue || []).concat([build]); // ihraç sahnesi bitince duran top hazırlığına geç
        else { this.queue = [build]; this.startNext(match); }
      } else if (ev.type === 'whistle' && ev.reason === 'foul' && ev.card && ev.offender) {
        // kart gelecek: düdükle birlikte faulü yapan oyuncuya yakın plan (kırmızıda yavaş push-in)
        this.queue = [{ kind: 'closeup', dur: (ev.delay || 2.4) + 1.0, target: ev.offender, push: ev.card === 'red' }];
        this.startNext(match);
      } else if (ev.type === 'card') {
        const same = this.shot && this.shot.kind === 'closeup' && this.shot.target === ev.p;
        const ref = match.referee;
        const refCard = ref ? [{ kind: 'closeup', dur: 1.5, target: ref, refShot: true, cardShot: true }] : [];
        if (ev.card === 'red') {
          // ihraç sahnesi: hakem kartı gösterir → oyuncu yakın plan (push-in) → kenara yürürken alçak steadicam → geniş plan
          this.queue = refCard.concat([
            { kind: 'closeup', dur: same ? 1.2 : 2.0, target: ev.p, push: true },
            { kind: 'walkoff', dur: 3.4, target: ev.p },
            { kind: 'sideWide', dur: 1.6, target: ev.p },
          ]);
          this.startNext(match);
        } else if (!same) { this.queue = refCard.concat([{ kind: 'closeup', dur: 2.0, target: ev.p }]); this.startNext(match); }
        else { this.queue = refCard; this.startNext(match); }
      } else if (ev.type === 'foul' && ev.injury) {
        this.queue = [{ kind: 'closeup', dur: 3.0, target: ev.victim }];
        this.startNext(match);
      } else if (ev.type === 'sub') {
        if (ev.atBreak) return; // devre arası değişikliği: tören yok
        // değişiklik sahnesi: çıkan oyuncu kenara yürürken yakın takip → 4. hakem tabelası açısı: giren oyuncu çizgide → sahaya koşarken
        const scene = [
          { kind: 'walkoff', dur: 2.4, target: ev.out },
          { kind: 'subEnter', dur: 2.2, target: ev.in, out: ev.out },
        ];
        const k = this.shot && this.shot.kind;
        const inSequence = k === 'walkoff' || k === 'subEnter' || k === 'sideWide' || (k === 'closeup' && this.shot.push);
        // aynı takımın aynı anda yaptığı çoklu değişiklik tek sahnede gösterilir (girenler birlikte girer); diğer takımınki arkaya eklenir
        const sameTeamPending = this.shot && this.shot.subTeam === ev.team || (this.queue || []).some((q) => q.subTeam === ev.team);
        scene.forEach((q) => (q.subTeam = ev.team));
        if (sameTeamPending) return;
        if (inSequence) { if ((this.queue || []).filter((q) => q.kind === 'subEnter').length < 1) this.queue = (this.queue || []).concat(scene); }
        else if (!this.shot || k === 'establishing' || k === 'closeup') { this.queue = scene; this.startNext(match); }
      } else if (ev.type === 'save' && ev.catch && match.lastShot && match.lastShot.q > 0.45) {
        // büyük kurtarış, top kalecide: kaleciye yakın plan (top oyunda ama kaleci topu tutuyor)
        if (!this.shot) { this.queue = [{ kind: 'closeup', dur: 1.8, target: ev.p, soft: true }]; this.startNext(match); }
      } else if (ev.type === 'corner' || ev.type === 'goalkick' || ev.type === 'throwin' || ev.type === 'freekick') {
        if (this.pendingReplay && !this.shot) { this.queue = [this.pendingReplay]; this.pendingReplay = null; this.startNext(match); }
      } else if (ev.type === 'kickoff') {
        if (match.clock < 3 || (match.half === 2 && match.clock < 45 * 60 + 3)) { this.queue = [{ kind: 'establishing', dur: 4.5 }]; this.startNext(match); }
      } else if (ev.type === 'halftime' || ev.type === 'fulltime') {
        this.queue = [{ kind: 'establishing', dur: 8 }]; this.startNext(match);
      }
    }

    startNext(match) {
      if (!this.queue || !this.queue.length) {
        // dizi bitti: yer seviyesindeki yakın çekimlerden canlı yayına KESME ile dön (tribüne doğru süzülme yok)
        const k = this.shot && this.shot.kind;
        if (k === 'closeup' || k === 'walkoff' || k === 'subEnter' || k === 'penaltyBuild' || k === 'freekickBuild' || k === 'lineupPan' || k === 'tunnelIn' || k === 'tunnelOut' || k === 'handshake' || k === 'boardShot' || (k === 'celebrate' && !this.shot.wide)) this.forceCut = true;
        this.shot = null; this.endReplay(); return;
      }
      // oyun yeniden başladıysa kenar sahnelerini (yürüyüş / giriş) atla; kalan kuyrukta en fazla 2 değişiklik sahnesi kalsın
      if (match.state === 'play') this.queue = this.queue.filter((q) => !['walkoff', 'subEnter', 'sideWide'].includes(q.kind));
      if (!this.queue.length) { this.forceCut = true; this.shot = null; this.endReplay(); return; }
      const s = this.queue.shift();
      const prev = this.shot;
      this.shot = s; this.shotT = 0;
      if (s.kind !== 'replay') this.endReplay();
      if (s.kind === 'replay') {
        // tekrar kayıt aralığını kopyala (özet klipleri hazır kare dizisiyle gelir)
        const buf = match.replayBuffer;
        const frames = s.frames || buf.filter((f) => f.t >= s.from && f.t <= s.endT);
        if (frames.length < 10) { this.startNext(match); return; }
        this.replay = { frames, i: 0, acc: 0, slow: s.slow, angle: s.angle };
        this.currentHighlight = s.highlight || null;
        if (this.onHighlight) this.onHighlight(this.currentHighlight);
        // açıyı kur
        const f0 = frames[0], fl = frames[frames.length - 1];
        const gDir = Math.sign(fl.bx - f0.bx) || 1;
        const goal = P.goalCenter(gDir);
        if (s.angle === 'behindGoal') {
          // kale arkası-yüksek: direğin yanından ve üstünden, şutun geldiği bölgeye bakar (ağ görüşü kapatmasın)
          const side = f0.bz > 0 ? 1 : -1;
          const dx = Math.abs(fl.bx - goal.x);
          this.cutTo(goal.x + gDir * 8, 6.5, side * 8, f0.bx, 0.9, f0.bz * 0.5, M.clamp(0.9 * 9 / Math.max(6, dx + 8), 0.3, 0.6));
        } else if (s.varLine) {
          // VAR ofsayt çizgisi: yan tribünden yüksek ve dik açı (çizgi okunur), ofsayt hattına odaklı
          const vp = (match.goalInfo && match.goalInfo.varPos) || { x: f0.bx, z: f0.bz };
          const cx = M.clamp(vp.x, -P.halfL + 6, P.halfL - 6);
          this.cutTo(cx - gDir * 6, 15, -(P.halfW + 20), cx, 0.3, vp.z * 0.5, 0.4);
        } else {
          // alçak yan kamera: pano arkasından, topun bulunduğu hatta yakın; uzun lens hissi
          const side = f0.bz > 0 ? 1 : -1;
          const cx = M.clamp((f0.bx + fl.bx) / 2 - gDir * 4, -P.halfL, P.halfL);
          const cz = side * (P.halfW + 6);
          const dd = M.dist(cx, cz, f0.bx, f0.bz);
          this.cutTo(cx, 2.4, cz, f0.bx, 1.0, f0.bz, M.clamp(0.9 * 8 / Math.max(6, dd), 0.25, 0.5));
        }
        this.replay.anchor = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
        this._replayFlag = true;
        if (this.onReplayStart) this.onReplayStart(true);
      } else if (s.kind === 'celebrate') {
        const p = s.target; if (!p) { this.startNext(match); return; }
        const side = p.z > 0 ? 1 : -1;
        if (s.wide) this.cutTo(p.x - 10, 9, p.z + side * 20, p.x, 1.2, p.z, 0.6);
        else this.cutTo(p.x + Math.cos(p.facing) * 6, 1.7, p.z + Math.sin(p.facing) * 6 + side * 2, p.x, 1.4, p.z, 0.42);
      } else if (s.kind === 'closeup') {
        const p = s.target; if (!p) { this.startNext(match); return; }
        if (prev && prev.kind === 'closeup' && prev.target === p) { s.cont = true; } // aynı oyuncuya devam: kesme yok
        else if (s.refShot) this.cutTo(p.x + Math.cos(p.facing) * 6.5, 1.8, p.z + Math.sin(p.facing) * 6.5 + 1.0, p.x, 1.35, p.z, 0.5);
        else this.cutTo(p.x + Math.cos(p.facing) * 4.5, 1.9, p.z + Math.sin(p.facing) * 4.5 + 1.5, p.x, 1.45, p.z, s.push ? 0.5 : 0.38);
      } else if (s.kind === 'walkoff') {
        // çıkan oyuncunun önünden, hafif yandan alçak takip (kamera geri geri gider)
        const p = s.target; if (!p || p.hidden) { this.startNext(match); return; }
        const c = this.walkoffCam(p, 0);
        this.cutTo(c.x, c.y, c.z, p.x, 1.05, p.z, 0.42);
      } else if (s.kind === 'subEnter') {
        // giren oyuncu(lar): kenar çizgisinde, 4. hakemin yanından alçak açı; saha içine doğru bakar
        const p = s.target; if (!p) { this.startNext(match); return; }
        const grp = match.playersOnPitch(p.team).filter((q) => q.enterWait > 0 || q === p);
        s.group = grp.length > 1 ? grp : null;
        const cx = grp.reduce((a, q) => a + q.x, 0) / grp.length;
        // kamera orta çizgi tarafında, kenar çizgisinin hemen içinde; arka planda o takımın kulübesi görünür
        const sx = cx < 0 ? 1 : -1;
        this.cutTo(cx + sx * (5 + grp.length), 1.6, -(P.halfW - 0.6), cx, 1.25, p.z + 1.5, 0.42 + 0.05 * (grp.length - 1));
      } else if (s.kind === 'sideWide') {
        const p = s.target; if (!p) { this.startNext(match); return; }
        this.cutTo(p.x * 0.7, 15, -(P.halfW + 28), p.x, 1, p.z, 0.5);
      } else if (s.kind === 'penaltyBuild') {
        const r = match.restart; const dir = match.dirOf(r.team); const goal = P.goalCenter(dir);
        this.cutTo(r.x - dir * 9, 1.6, r.z + 5, goal.x - dir * 2, 1.0, 0, 0.5);
      } else if (s.kind === 'freekickBuild') {
        const r = match.restart; const dir = match.dirOf(r.team); const goal = P.goalCenter(dir);
        this.cutTo(r.x - dir * 8, 2.2, r.z + (r.z > 0 ? -4 : 4), goal.x - dir * 4, 1.2, 0, 0.52);
      } else if (s.kind === 'establishing') {
        const e0 = this.estabPath(0);
        this.cutTo(e0.x, e0.y, e0.z, 0, 0, 0, 0.74);
      } else if (s.kind === 'lineupPan') {
        // dizilmiş takımların önünden (ana tribün tarafı) yavaş dolly: soldan sağa
        this.cutTo(-17, 2.0, -11.5, -13, 1.25, -3, 0.6);
      } else if (s.kind === 'tunnelIn') {
        // tünel içinden dışarıya: sıranın arkasından, tünel ağzından görünen saha/tribün (klasik "tünelden çıkış" planı)
        const tz = -(P.halfW + P.margin - 0.6);
        this.cutTo(0.45, 1.5, tz - 1.9, 0, 1.25, tz + 8, 0.7);
      } else if (s.kind === 'tunnelOut') {
        // tünel ağzının hemen dışında, alçak açı: oyuncular kameraya doğru çıkar ve yanından geçer
        const tz = -(P.halfW + P.margin - 0.6);
        this.cutTo(-6.5, 1.0, tz + 3.0, 0, 1.2, tz - 0.5, 0.5);
      } else if (s.kind === 'handshake') {
        // tokalaşma: sıranın önünden, deplasman oyuncularının geçtiği hattı takip eden alçak yan kamera
        this.cutTo(6, 1.5, -8.5, 0, 1.2, -3, 0.5);
      } else if (s.kind === 'boardShot') {
        const p = s.target; if (!p) { this.startNext(match); return; }
        this.cutTo(p.x + 2.5, 1.9, p.z + 5.5, p.x, 1.9, p.z, 0.34);
      }
    }

    /* Kenara yürüyen oyuncu için steadicam konumu: önünden geri geri gider; kenar çizgisine yaklaşınca yana kayar (panoların/tribünün içine girmez) */
    walkoffCam(p, prog) {
      const w = p.walkTo || { x: p.x, z: p.z - 5 };
      const dx = w.x - p.x, dz = w.z - p.z; const dist = Math.sqrt(dx * dx + dz * dz);
      const n = dist > 0.05 ? { x: dx / dist, z: dz / dist } : { x: 0, z: -1 };
      // yürüyüş yönüne dik eksen; saha merkezine (x=0) doğru olanı seç → kamera köşe/tribün içine girmez
      let lat = { x: -n.z, z: n.x }; if (lat.x * -p.x < 0) lat = { x: n.z, z: -n.x };
      const wSide = M.clamp01((7 - dist) / 6); // hedefe 7 m kala kamera önden yana (kenar boyunca) kayar
      const dd = 6.8 - prog * 1.6;
      const ox = n.x * (1 - wSide) + lat.x * wSide, oz = n.z * (1 - wSide) + lat.z * wSide;
      const ol = Math.sqrt(ox * ox + oz * oz) || 1;
      const off = 2.2 - prog * 0.8; // hafif yan sapma (tam karşıdan bakmasın)
      let x = p.x + (ox / ol) * dd - (oz / ol) * off * (1 - wSide), z = p.z + (oz / ol) * dd + (ox / ol) * off * (1 - wSide);
      x = M.clamp(x, -P.halfL - 3, P.halfL + 3); z = M.clamp(z, -(P.halfW + 4.4), P.halfW + 4.4);
      return { x, y: 1.55 - prog * 0.2, z };
    }

    /* Açılış vinç hareketi: köşeden ana tribün boyunca merkeze süzülür (tribün önünde, çatının altında kalır) */
    estabPath(prog) {
      return { x: M.lerp(-78, -14, prog), y: M.lerp(34, 26, prog), z: M.lerp(-66, -70, prog) };
    }

    /* Tekrar durumunu güvenle kapat (kesme/olay araya girdiğinde kare donmasın) */
    endReplay() {
      if (this.replay || this.replayFrame || this._replayFlag) {
        this.replay = null; this.replayFrame = null; this._replayFlag = false;
        if (this.currentHighlight) { this.currentHighlight = null; if (this.onHighlight) this.onHighlight(null); }
        if (this.onReplayStart) this.onReplayStart(false);
      }
    }
    setUserMode(m) { this.userMode = m; this.shot = null; this.queue = []; this.pendingReplay = null; this.endReplay(); this.forceCut = true; this.smoothI = null; this.pf = null; }
    /* Tekrar / ara sahne atla → canlı yayına kes */
    skipping() { return !!(this.shot || this.replay); }
    /* Maç sonu özeti: kaydedilmiş gol klipleri sırayla, dönüşümlü açılarla (kale arkası / alçak yan) yavaş çekimde oynatılır */
    playHighlights(match, clips) {
      if (!clips || !clips.length) return false;
      this.queue = clips.map((c, i) => ({ kind: 'replay', dur: 5.4, angle: i % 2 === 0 ? 'behindGoal' : 'lowSide', slow: 0.45, frames: c.frames, highlight: c }));
      this.queue.push({ kind: 'establishing', dur: 6 });
      this.highlightReel = true;
      this.startNext(match);
      return true;
    }
    skip() {
      if (!this.skipping()) return false;
      this.shot = null; this.queue = []; this.pendingReplay = null; this.endReplay(); this.forceCut = true; this.smoothI = null;
      return true;
    }

    /* Ana güncelleme */
    update(dtReal, match, ballMesh) {
      this.t += dtReal;
      const ball = match.ball;
      const dt = Math.min(dtReal, 0.05);
      let target = null; // {px,py,pz,lx,ly,lz,fov,freq,zeta}
      // --- özel çekimler
      if (this.shot) {
        this.shotT += dtReal;
        const s = this.shot;
        if (s.kind === 'replay' && !this.replay) { this.startNext(match); }
        else if (s.kind === 'replay' && this.replay) {
          const rp = this.replay;
          // dondurma: ofsayt anında kare sabit kalır (çizgiler okunsun)
          const cur = rp.frames[rp.i];
          if (s.freezeT != null && !rp.heldDone && cur.t >= s.freezeT) { rp.held = (rp.held || 0) + dtReal; if (rp.held >= s.holdDur) rp.heldDone = true; }
          else rp.acc += dtReal * rp.slow;
          while (rp.i < rp.frames.length - 1 && rp.frames[rp.i + 1].t - rp.frames[0].t <= rp.acc) rp.i++;
          const f = rp.frames[rp.i];
          this.replayFrame = f;
          // kamera: topu yumuşak takip (pan) + yavaş dolly; kadraj topa yakın kalsın (yavaş çekim: uzun lens)
          const nextF = rp.frames[Math.min(rp.frames.length - 1, rp.i + 8)];
          const prog = M.clamp01(this.shotT / s.dur);
          const a = rp.anchor;
          const dBall = M.dist(a.x, a.z, f.bx, f.bz);
          // uzaklığa göre odak: top uzaktaysa daha dar fov (zoom), yakınsa açık
          const fovT = M.clamp(0.9 * (rp.angle === 'behindGoal' ? 9 : 8) / Math.max(6, dBall), 0.22, rp.angle === 'behindGoal' ? 0.6 : 0.5);
          target = { px: a.x + (f.bx - a.x) * 0.12 * prog, py: a.y - prog * 0.6, pz: a.z + (f.bz - a.z) * 0.12 * prog, lx: (f.bx + nextF.bx) / 2, ly: Math.max(0.6, f.by), lz: (f.bz + nextF.bz) / 2, fov: fovT, freq: 1.6, zeta: 1, handheld: 0.6 };
          if (s.varLine) { // ofsayt hattı kadrajda kalsın: top ile hat arasına bak, sabit üst açı
            const vp = (match.goalInfo && match.goalInfo.varPos) || { x: f.bx, z: f.bz };
            target.px = a.x; target.py = a.y; target.pz = a.z; target.lx = M.lerp(f.bx, vp.x, 0.7); target.lz = M.lerp(f.bz, vp.z, 0.5) * 0.6; target.ly = 0.2; target.fov = M.clamp(0.3 + Math.abs(f.bx - vp.x) * 0.012, 0.36, 0.62); target.handheld = 0.2; target.freq = 1.0;
          }
          const frozen = s.freezeT != null && !rp.heldDone && cur.t >= s.freezeT;
          if ((rp.i >= rp.frames.length - 1 && !frozen) || this.shotT > s.dur) { this.replay = null; this.replayFrame = null; this.startNext(match); if (!this.shot || this.shot.kind !== 'replay') this.endReplay(); }
        } else if (s.kind === 'lineupPan') {
          const prog = M.clamp01(this.shotT / 9);
          const x = M.lerp(-17, 17, M.smoothstep(prog));
          target = { px: x, py: 2.0, pz: -11.5, lx: x + 4, ly: 1.25, lz: -3, fov: 0.6, freq: 0.6, zeta: 1, handheld: 0.5 };
          if (prog >= 1) { // pan bitti: geniş, tribünden sıraya bakan sabit plan
            target = { px: 0, py: 6.5, pz: -22, lx: 0, ly: 1.0, lz: -3, fov: 0.62, freq: 0.5, zeta: 1, handheld: 0.15 };
          }
          if (this.shotT > s.dur || match.state !== 'lineup' || (match.lineupPhase && match.lineupPhase !== 'line' && match.lineupPhase !== 'tunnel')) this.startNext(match);
        } else if (s.kind === 'tunnelIn') {
          // omuz üstü el kamerası: sıranın arkasından tünel ağzına ve sahaya bakar, hakemler çıktıkça yavaşça takip eder
          const tz = -(P.halfW + P.margin - 0.6);
          const q = match.tunnelQueue && match.tunnelQueue[0] ? match.tunnelQueue[0].p : null;
          const prog = M.clamp01(this.shotT / s.dur);
          const lz = q ? Math.max(q.z + 1.5, tz + 2) : tz + 8;
          target = { px: 0.45 - prog * 0.3, py: 1.5, pz: tz - 1.9 + prog * 0.9, lx: q ? q.x * 0.5 : 0, ly: 1.25, lz, fov: 0.7, freq: 1.2, zeta: 1, handheld: 1.6 };
          if (this.shotT > s.dur || match.state !== 'lineup' || match.lineupPhase !== 'tunnel') this.startNext(match);
        } else if (s.kind === 'tunnelOut') {
          const tz = -(P.halfW + P.margin - 0.6);
          // en öndeki henüz dizilmemiş oyuncu (tünel ağzına en yakın) hedef
          let lead = null; let bz = -1e9;
          if (match.tunnelQueue) for (const e of match.tunnelQueue) { const q = e.p; if ((q.ceremonyStage || 0) < 2 && !q.hidden && q.z > bz) { bz = q.z; lead = q; } }
          const lx = lead ? lead.x * 0.6 : 0, lz = lead ? M.clamp(lead.z, tz - 1, tz + 5) : tz - 0.5;
          const prog = M.clamp01(this.shotT / s.dur);
          // yandan alçak açı: sıra kameranın önünden geçer, arka planda tünel ağzı ve tribün
          target = { px: -6.5 + prog * 1.2, py: 1.0, pz: tz + 3.0 + prog * 0.6, lx, ly: 1.15, lz, fov: 0.5, freq: 1.1, zeta: 1, handheld: 1.3 };
          if (this.shotT > s.dur || match.state !== 'lineup' || match.lineupPhase !== 'tunnel') this.startNext(match);
        } else if (s.kind === 'handshake') {
          // sırada en önde tokalaşan deplasman oyuncusunu izle (yan kamera, hafif dolly)
          let lead = null, bx = 1e9;
          for (const q of match.playersOnPitch(1)) { if (q.shakeDone || (q.shakeT || 0) < 0) continue; if (q.x < bx) { bx = q.x; lead = q; } }
          const lx = lead ? lead.x : 0, lz = lead ? lead.z : -2;
          target = { px: lx + 5.5, py: 1.45, pz: -8.5, lx: lx - 1, ly: 1.2, lz: lz - 0.5, fov: 0.46, freq: 0.9, zeta: 1, handheld: 0.8 };
          if (this.shotT > s.dur || match.state !== 'lineup' || match.lineupPhase !== 'handshake') this.startNext(match);
        } else if (s.kind === 'boardShot') {
          const p = s.target; const prog = M.clamp01(this.shotT / s.dur);
          target = { px: p.x + 2.5 - prog * 0.6, py: 1.9, pz: p.z + 5.5 - prog * 0.8, lx: p.x, ly: 1.95, lz: p.z, fov: 0.34 - prog * 0.04, freq: 1, zeta: 1, handheld: 1.2 };
          if (this.shotT > s.dur || match.state === 'play') this.startNext(match);
        } else if (s.kind === 'celebrate' || s.kind === 'closeup') {
          const p = s.target;
          const prog = M.clamp01(this.shotT / s.dur);
          // push-in: kırmızı kartta kamera yavaşça oyuncuya yaklaşır ve lens daralır (dramatik)
          const d = s.wide ? 16 : s.kind === 'closeup' ? (s.push ? (s.cont ? 3.6 : M.lerp(6.5, 3.6, M.smoothstep(prog))) : 4.5) : 6;
          const fx = Math.cos(p.facing), fz = Math.sin(p.facing);
          const orbit = Math.sin(this.shotT * 0.5) * 0.35;
          const ox = fx * Math.cos(orbit) - fz * Math.sin(orbit), oz = fx * Math.sin(orbit) + fz * Math.cos(orbit);
          const fov = s.wide ? 0.6 : s.kind === 'closeup' ? (s.push ? (s.cont ? 0.3 : M.lerp(0.5, 0.3, M.smoothstep(prog))) : 0.36) : 0.42;
          target = { px: p.x + ox * d, py: s.wide ? 7 : 1.65 + (s.kind === 'closeup' ? 0.1 : 0), pz: p.z + oz * d, lx: p.x, ly: 1.35, lz: p.z, fov, freq: s.push ? 0.6 : 0.9, zeta: 1, handheld: s.push ? 1.4 : 1 };
          if (s.refShot) { const dd = s.hold ? 5.2 : 6.0; target.px = p.x + ox * dd; target.pz = p.z + oz * dd; target.py = 1.75; target.ly = s.cardShot ? 1.7 : 1.35; target.fov = s.hold ? 0.42 : 0.48; target.handheld = 1.2; }
          if (s.injury) { target.py = 1.1; target.ly = 0.6; target.fov = 0.4; }
          if (this.shotT > s.dur || (s.soft && match.state === 'play' && !match.ball.owner) || (s.soft && this.shotT > 0.4 && match.ball.owner !== p) || (s.refShot && !s.cardShot && match.state !== 'var' && this.shotT > 0.8)) this.startNext(match);
        } else if (s.kind === 'walkoff') {
          // kenara yürüyen oyuncunun önünde geri geri giden alçak steadicam
          const p = s.target;
          const prog = M.clamp01(this.shotT / s.dur);
          const c = this.walkoffCam(p, prog);
          target = { px: c.x, py: c.y, pz: c.z, lx: p.x, ly: 1.05, lz: p.z, fov: 0.42 - prog * 0.06, freq: 1.2, zeta: 1, handheld: 1.6 };
          if (this.shotT > s.dur || p.hidden || match.state === 'play') this.startNext(match);
        } else if (s.kind === 'subEnter') {
          // giren oyuncu bekler → koşar; kamera kenar çizgisinden onu içeri kadar pan'lar (takip)
          const p = s.target;
          const prog = M.clamp01(this.shotT / s.dur);
          const grp = s.group || [p];
          const cx = grp.reduce((a, q) => a + q.x, 0) / grp.length, cz = grp.reduce((a, q) => a + q.z, 0) / grp.length;
          const vx = grp.reduce((a, q) => a + q.vx, 0) / grp.length, vz = grp.reduce((a, q) => a + q.vz, 0) / grp.length;
          const sx = cx < 0 ? 1 : -1;
          target = { px: cx + sx * (5 + grp.length - 1 + prog * 1.5) - vx * 0.15, py: 1.6 + prog * 0.7, pz: -(P.halfW - 0.6) + prog * 1.5, lx: cx + vx * 0.35, ly: 1.25, lz: cz + vz * 0.35 + 1.5, fov: 0.42 + 0.05 * (grp.length - 1) + prog * 0.1, freq: 1.4, zeta: 1, handheld: 1.3 };
          if (this.shotT > s.dur || match.state === 'play') this.startNext(match);
        } else if (s.kind === 'sideWide') {
          const p = s.target;
          target = { px: p.x * 0.7, py: 15, pz: -(P.halfW + 28), lx: p.x, ly: 1, lz: p.z, fov: 0.5, freq: 0.7, zeta: 1, handheld: 0.5 };
          if (this.shotT > s.dur || match.state === 'play') this.startNext(match);
        } else if (s.kind === 'penaltyBuild' || s.kind === 'freekickBuild') {
          const r = match.restart; if (!r) { this.shot = null; }
          else {
            const dir = match.dirOf(r.team); const goal = P.goalCenter(dir);
            const taker = r.taker;
            // yavaş dolly: atıcının arkasından kaleye
            const prog = M.smoothstep(this.shotT / s.dur);
            target = { px: taker.x - dir * (7 - prog * 2.5), py: 1.7 + prog * 0.6, pz: taker.z + (s.kind === 'penaltyBuild' ? 4.5 : (r.z > 0 ? -4 : 4)) * (1 - prog * 0.3), lx: goal.x - dir * 3, ly: 1.0, lz: 0, fov: 0.5 - prog * 0.06, freq: 0.8, zeta: 1 };
            if (this.shotT > s.dur || match.state === 'play') this.startNext(match);
          }
        } else if (s.kind === 'establishing') {
          const prog = M.smoothstep(M.clamp01(this.shotT / s.dur));
          const e = this.estabPath(prog);
          target = { px: e.x, py: e.y, pz: e.z, lx: 0, ly: 0.5, lz: s.ceremony ? -6 : 0, fov: 0.74 - prog * 0.22, freq: 0.5, zeta: 1, handheld: 0.2 };
          if (this.shotT > s.dur || (match.state === 'play' && this.shotT > 3.5) || (s.ceremony && match.lineupPhase !== 'tunnel')) this.startNext(match);
        }
      }
      if (!target) {
        this.endReplay();
        target = this.liveTarget(match, dt);
      }
      // --- yay entegrasyonu
      const fq = target.freq || 1.1, zt = target.zeta || 1.0;
      if (this.forceCut) { this.cutTo(target.px, target.py, target.pz, target.lx, target.ly, target.lz, target.fov); this.forceCut = false; }
      [this.pos.x, this.pos.vx] = M.springStep(this.pos.x, this.pos.vx, target.px, dt, fq, zt);
      [this.pos.y, this.pos.vy] = M.springStep(this.pos.y, this.pos.vy, target.py, dt, fq, zt);
      [this.pos.z, this.pos.vz] = M.springStep(this.pos.z, this.pos.vz, target.pz, dt, fq, zt);
      const lf = (target.lookFreq || fq * 1.35);
      [this.look.x, this.look.vx] = M.springStep(this.look.x, this.look.vx, target.lx, dt, lf, zt);
      [this.look.y, this.look.vy] = M.springStep(this.look.y, this.look.vy, target.ly, dt, lf, zt);
      [this.look.z, this.look.vz] = M.springStep(this.look.z, this.look.vz, target.lz, dt, lf, zt);
      [this.fov.v, this.fov.vel] = M.springStep(this.fov.v, this.fov.vel, target.fov, dt, 0.7, 1);
      // --- operatör el titremesi + darbe sarsıntısı
      const hs = (target.handheld != null ? target.handheld : 1) * 0.0022;
      const nx = M.noise1(this.t * 1.1, 1.3) * hs, ny = M.noise1(this.t * 1.3, 7.1) * hs * 0.7;
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const sk = this.shake * this.shake;
      const shx = (Math.random() - 0.5) * sk * 0.06, shy = (Math.random() - 0.5) * sk * 0.06;
      const cam = this.cam;
      cam.position.set(this.pos.x, this.pos.y, this.pos.z);
      cam.fov = this.fov.v;
      cam.setTarget(new BABYLON.Vector3(this.look.x, this.look.y, this.look.z));
      cam.rotation.y += nx + shx; cam.rotation.x += ny + shy;
      // hafif dutch (roll) — hızlı pan'lerde
      const panVel = Math.sqrt(this.look.vx * this.look.vx + this.look.vz * this.look.vz);
      const rollT = target.roll != null ? target.roll : M.clamp(-this.look.vx * 0.0006 * (this.pos.z < 0 ? 1 : -1), -0.012, 0.012);
      this.roll += (rollT - this.roll) * (1 - Math.exp(-dt * 2));
      cam.rotation.z = this.roll;
    }

    /* Canlı yayın hedefi: modlara göre */
    liveTarget(match, dt) {
      const ball = match.ball;
      const mode = this.userMode === 'auto' ? this.autoMode(match) : this.userMode;
      // ilgi noktası: top + öngörü + yakın oyuncuların ağırlığı
      const lead = 0.45;
      const owner = ball.owner;
      let ix = ball.x + ball.vx * lead, iz = ball.z + ball.vz * lead;
      // hücum yönünde bir miktar önden kadraj (oyun okunması için)
      const possTeam = match.possession;
      const dir = match.dirOf(possTeam);
      const attackBias = match.state === 'play' ? 6 : 0;
      ix += dir * attackBias;
      // oyuncu kütle merkezi (yakındakiler)
      let sx = 0, sz = 0, sw = 0;
      for (const p of match.allOnPitch()) { const d = M.dist(p.x, p.z, ball.x, ball.z); if (d < 22) { const w = 1 - d / 22; sx += p.x * w; sz += p.z * w; sw += w; } }
      if (sw > 0) { ix = ix * 0.72 + (sx / sw) * 0.28; iz = iz * 0.72 + (sz / sw) * 0.28; }
      ix = M.clamp(ix, -P.halfL - 2, P.halfL + 2); iz = M.clamp(iz, -P.halfW - 2, P.halfW + 2);
      // yoğunluk: top hızı + kaleye yakınlık → zoom
      const gd = Math.min(M.dist(ball.x, ball.z, P.halfL, 0), M.dist(ball.x, ball.z, -P.halfL, 0));
      const rawInt = M.clamp01((30 - gd) / 30) * 0.6 + M.clamp01(ball.speed / 25) * 0.4;
      if (this.intensity == null) this.intensity = rawInt;
      this.intensity += (rawInt - this.intensity) * (1 - Math.exp(-dt * 1.8)); // zoom pompalaması olmasın: yavaş izle
      const intensity = this.intensity;
      if (ball.lastKick && ball.lastKick.t < 0.05 && ball.lastKick.kind === 'shot' && ball.speed3 > 22) this.shake = Math.max(this.shake, 0.18);
      // ilgi noktası yumuşatma: top sahibi değişimlerinde / sekmelerde kadraj sıçramasın
      if (!this.smoothI) this.smoothI = { x: ix, z: iz };
      const si = this.smoothI; const ks = 1 - Math.exp(-dt * 3.2);
      si.x += (ix - si.x) * ks; si.z += (iz - si.z) * ks; ix = si.x; iz = si.z;
      switch (mode) {
        case 'tv2': { // yüksek ana tribün, daha geniş (taktik)
          return { px: ix * 0.85, py: 38, pz: -84, lx: ix, ly: 0.5, lz: iz * 0.5, fov: 0.55 - intensity * 0.05, freq: 0.8, zeta: 1, handheld: 0.3 };
        }
        case 'low': { // alçak yan kamera, dramatik
          const side = -1;
          const camX = ix - dir * 8;
          return { px: camX, py: 2.6, pz: side * (P.halfW + 9), lx: ix, ly: 1.0, lz: iz, fov: 0.42 - intensity * 0.04, freq: 1.0, zeta: 1, handheld: 1.6 };
        }
        case 'drone': { // yüksekten dönen drone
          const ang = this.t * 0.06;
          return { px: ix * 0.5 + Math.cos(ang) * 60, py: 55, pz: iz * 0.5 + Math.sin(ang) * 60, lx: ix, ly: 0, lz: iz, fov: 0.6, freq: 0.5, zeta: 1, handheld: 0 };
        }
        case 'goal': { // kale arkası (hücum edilen kale)
          const g = P.goalCenter(dir);
          return { px: g.x + dir * 12, py: 7, pz: iz * 0.25, lx: M.lerp(ix, g.x - dir * 20, 0.3), ly: 0.8, lz: iz * 0.6, fov: 0.62, freq: 0.9, zeta: 1, handheld: 0.6 };
        }
        case 'player': return this.playerFollowTarget(match, dt);
        case 'ref': { // VAR beklerken: hakeme orta plan (ana tribün tarafından)
          const rf = match.referee;
          return { px: rf.x + 3, py: 2.2, pz: rf.z - 7, lx: rf.x, ly: 1.4, lz: rf.z, fov: 0.42, freq: 0.8, zeta: 1, handheld: 1.0 };
        }
        case 'broadcast':
        default: {
          // Ana yayın kamerası: orta tribün, ~20 m yükseklik, top hızıyla zoom ve pan
          const camH = 20 + (1 - intensity) * 3;
          const camZ = -(P.halfW + 34);
          const camX = ix * 0.9;
          // top kaleye yaklaştıkça sıkı kadraj
          const fov = 0.46 - intensity * 0.14 + M.clamp01(Math.abs(iz) / 40) * 0.04;
          return { px: camX, py: camH, pz: camZ, lx: ix, ly: 0.7, lz: iz * 0.75 + 2, fov, freq: 0.75 + intensity * 0.35, zeta: 1.05, handheld: 0.8 };
        }
      }
    }

    /* Oyuncu kamerası v5 — GERÇEK ÜÇÜNCÜ ŞAHIS (omuz üstü takip; FIFA "Pro" / PES oyuncu kamerası)
       - Kamera kontrol edilen oyuncunun SIRTININ ARKASINDA durur: yaw = oyuncunun BAKTIĞI yön (yumuşatılmış, hız sınırlı).
         Oyuncu döndüğünde kamera arkasına dolanır; oyuncu her zaman kadrajın alt-ortasında, önündeki saha açık görünür.
       - Kadraj katı: konum ve bakış noktası aynı (oyuncu, yaw, mesafe, yükseklik) durumundan türetilir → oyuncu kadrajdan kaymaz.
         Yay yalnızca oyuncunun konumunu yumuşatır (steadicam), sıkı (4 Hz).
       - Topsuz ve duran oyuncuda kamera topa doğru en fazla ~±70° kayar (top kadrajda kalsın); hareket başlayınca bakış yönüne döner.
       - Dikey telefon: kamera daha yüksek/uzak, bakış noktası yakın → oyuncu ekranın üst yarısında (dokunmatik kontrollerin üstünde).
       - Kontroller kameraya göre + tuş basılıyken yön kilidi (H.worldDir) → kamera dönerken oyuncu savrulmaz, daire çizmez.
       - Oyuncu değişimi: yakınsa hızlı yumuşak geçiş, uzaksa kesme. Kale ağı kaçınma (yan ağın dışına kayar). */
    playerFollowTarget(match, dt) {
      const ball = match.ball;
      const H = FS.Human;
      let p = (H && H.active && H.player) || ball.owner || null;
      if (!p) { // izleme modu: topa en yakın oyuncu (1.5 sn histerezis: sürekli atlama olmasın)
        this.pfWatchT = (this.pfWatchT || 0) + dt;
        if (!this.pfWatch || !this.pfWatch.onPitch || this.pfWatchT > 1.5) { let best = null, bd = 1e9; for (const q of match.allOnPitch()) { const d = M.dist(q.x, q.z, ball.x, ball.z); if (d < bd) { bd = d; best = q; } } this.pfWatch = best; this.pfWatchT = 0; }
        p = this.pfWatch || match.allOnPitch()[0];
      }
      const dir = match.dirOf(p.team);
      const attackYaw = Math.atan2(0, dir); // +x → 0, −x → π
      const st = this.pf || (this.pf = { yaw: p.facing, p: null, dist: 5.2, h: 2.1, switchT: 9, gside: null });
      const eng = this.cam.getEngine();
      const aspect = eng.getRenderWidth() / Math.max(1, eng.getRenderHeight());
      const portrait = aspect < 1;
      const sp = p.speed || 0;
      const spf = M.clamp01((sp - 3) / 4.5);           // 0 yürüyüş → 1 sprint
      const bdx = ball.x - p.x, bdz = ball.z - p.z;
      const bd = M.len(bdx, bdz);
      // --- hedef yaw: oyuncunun baktığı yön
      let want = p.facing;
      // topsuz ve yavaş/duran oyuncu: kamera topa doğru kayar (top görünür kalsın); hareket edince bakış yönüne döner
      if (!p.hasBall && bd > 3) {
        const wIdle = M.clamp01((1.6 - sp) / 1.1);
        const db = M.angleDiff(want, Math.atan2(bdz, bdx));
        want += M.clamp(db, -1.25, 1.25) * 0.55 * wIdle;
      }
      // duran top hazırlığı (insan takımı kullanacak): topa/kaleye dönük sabit kadraj
      const r = match.restart;
      if ((match.state === 'setup' || match.state === 'ready') && r && r.team === p.team && r.taker === p) {
        const g = P.goalCenter(dir);
        want = Math.atan2(g.z - p.z, g.x - p.x);
        if (r.type === 'goalkick' || r.type === 'kickoff') want = attackYaw;
        else if (r.type === 'throwin') want = Math.atan2(-Math.sign(r.z || 1), dir * 0.7); // taç: sahaya doğru çapraz-ileri bakış
      }
      // --- oyuncu değişimi: yakınsa hızlı-yumuşak geçiş, uzaksa kesme (yaw doğrudan yeni oyuncunun yönüne)
      if (st.p !== p) {
        const far = !st.p || !st.p.onPitch || M.distP(st.p, p) > 12;
        if (far) { this.forceCut = true; st.yaw = want; }
        st.p = p; st.switchT = 0;
        if (H && H.active) H.latch = null; // yön kilidi yeni kameraya göre yenilensin
      } else st.switchT += dt;
      const sw = M.clamp01(st.switchT / 0.7);
      // yaw yumuşatma: ölü bölge + üstel yaklaşım + hız sınırı (dönüşler hızlı ama savrulmadan)
      const dy = M.angleDiff(st.yaw, want);
      const dead = 0.035;
      const eff = Math.abs(dy) < dead ? 0 : dy - Math.sign(dy) * dead;
      const maxRate = (sw < 1 ? 5.0 : 2.8 + spf * 0.7); // rad/s (geçişte daha hızlı toparlanır)
      st.yaw += M.clamp(eff * (1 - Math.exp(-dt * 4.2)), -maxRate * dt, maxRate * dt);
      const cx = Math.cos(st.yaw), cz = Math.sin(st.yaw);
      // --- mesafe / yükseklik: yakın üçüncü şahıs; sprintte biraz geri; dikeyde yüksek ve uzak
      const wantDist = (portrait ? 6.2 : 5.2) + spf * 1.0 + (p.hasBall ? 0 : 0.3);
      const wantH = (portrait ? 3.0 : 2.1) + spf * 0.25;
      st.dist += (wantDist - st.dist) * (1 - Math.exp(-dt * 2.5));
      st.h += (wantH - st.h) * (1 - Math.exp(-dt * 2.5));
      // kamera konumu: oyuncunun tam arkasında (küçük hız öngörüsü: sprintte sürtünmesiz takip)
      let px = p.x - cx * st.dist + p.vx * 0.04, pz = p.z - cz * st.dist + p.vz * 0.04;
      px = M.clamp(px, -P.halfL - 7, P.halfL + 7); pz = M.clamp(pz, -P.halfW - 6, P.halfW + 6);
      // kale ağı/direk kaçınma: kamera kale çizgisinin gerisine (ağın içine/arkasına) düşerse yanal olarak ağın dışına kayar
      // ve hafif yükselir → ağ örgüsünün/direğin içinden bakılmaz. Geçiş sürekli (f), yan seçimi histerezisli (st.gside).
      let camH = st.h;
      {
        const behind = Math.abs(px) - (P.halfL - 1.2);
        const gz = P.goalWidth / 2 + 2.2;                 // yan ağın ~2 m dışı: bakış ışını ağ örgüsünü kesmez
        if (behind > 0 && Math.abs(pz) < gz) {
          if (!st.gside) st.gside = (p.z || pz) >= 0 ? 1 : -1;
          else if (st.gside * p.z < -1.2) st.gside = -st.gside;   // oyuncu diğer yana geçti → taraf değiştir (yay yumuşatır)
          const f = M.clamp01(behind / 1.5);
          pz = st.gside * M.lerp(Math.abs(pz), gz, f);
          camH = Math.max(camH, M.lerp(st.h, 3.2, f));
        } else if (behind <= -1 || Math.abs(pz) > gz + 1.5) st.gside = null;
      }
      // bakış noktası: oyuncunun önünde, ~1 m yükseklikte → oyuncu alt-orta (yatay) / üst yarı (dikey), önündeki saha açık
      const ahead = portrait ? 2.6 : 4.6 + spf * 1.4;
      const lx = p.x + cx * ahead, lz = p.z + cz * ahead;
      const ly = portrait ? 0.45 : 1.0;
      // yay: sıkı takip (oyuncu kadrajda sabit dursun); geçişte biraz daha sıkı
      const freq = M.lerp(5.0, 4.0, sw);
      const fov = (portrait ? 1.1 : 0.86) + spf * 0.06;
      return { px, py: camH, pz, lx, ly, lz, fov, freq, zeta: 1.0, lookFreq: freq, handheld: 0.2 + spf * 0.25, roll: 0 };
    }
    /* Oyuncu takip modunda kameranın yaw'ı (girdi eksenlerini kameraya göre çözmek için) */
    controlYaw() { return this.pf ? this.pf.yaw : null; }

    autoMode(match) {
      const ball = match.ball;
      const st = match.state;
      // duran toplarda özel açılar
      if ((st === 'setup' || st === 'ready') && match.restart) {
        const r = match.restart;
        if (r.type === 'corner') return 'goal';
        if (r.type === 'penalty') return 'goal';
      }
      if (st === 'var' && match.referee) return 'ref';
      // kaleye çok yakın anlarda kısa süre kale arkası? Hayır — yayın standardında ana kamera kalır; tekrarlar özel açıyı verir.
      return 'broadcast';
    }
  }

  FS.Director = Director;
})(typeof window !== 'undefined' ? window : globalThis);
