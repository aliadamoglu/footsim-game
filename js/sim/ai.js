/* Takım ve oyuncu yapay zekâsı
   - Takım şekli (blok kaydırma, savunma hattı, genişlik)
   - Topsuz hareket: baskı, kapatma, kademe, koşular, pas seçeneği oluşturma
   - Top sahibi karar: şut / pas (yer, hava, ara, orta) / dripling / uzaklaştırma
   - Kaleci: pozisyon alma, çıkış, dağıtım
*/
(function (root) {
  const FS = (root.FS = root.FS || {});
  const M = FS.M, P = FS.PITCH, A = FS.Actions;
  const AI = (FS.AI = {});

  const isDef = (r) => r === 'CB' || r === 'RB' || r === 'LB';
  const isWB = (r) => r === 'RWB' || r === 'LWB';
  const isMid = (r) => r === 'DM' || r === 'CM' || r === 'AM';
  const isAtt = (r) => r === 'ST' || r === 'RW' || r === 'LW';
  AI.isDef = isDef; AI.isMid = isMid; AI.isAtt = isAtt; AI.isWB = isWB;

  // Hücum uzayına dönüşüm: ax ileri (+ rakip kale), az = sağ(+)
  AI.toAttack = (x, z, dir) => ({ ax: x * dir, az: z * dir });
  AI.toWorld = (ax, az, dir) => ({ x: ax * dir, z: az * dir });

  /* -------------------- Ofsayt hattı -------------------- */
  // Hücum eden takım için ofsayt çizgisi (hücum uzayı ax cinsinden)
  AI.offsideLineAX = function (match, attTeamIdx) {
    const dir = match.dirOf(attTeamIdx);
    const defs = match.playersOnPitch(1 - attTeamIdx);
    const xs = defs.map((d) => d.x * dir).sort((a, b) => b - a); // en ileri (kaleye yakın) önce
    const secondLast = xs.length >= 2 ? xs[1] : xs.length ? xs[0] : P.halfL;
    const ballAX = match.ball.x * dir;
    return Math.max(secondLast, ballAX, 0);
  };

  /* -------------------- Takım şekli -------------------- */
  AI.updateTeamShape = function (match, team) {
    const dir = match.dirOf(team.index);
    const ball = match.ball;
    const b = AI.toAttack(ball.x, ball.z, dir);
    const poss = match.possession === team.index;
    const players = match.playersOnPitch(team.index);
    const men = team.mentality;
    const tac = team.tactics || (FS.Tactics ? FS.Tactics.ensure(team) : { line: 0.5, press: 0.5, tempo: 0.5, width: 0.5, instr: { overlap: true } });
    const scoreDiff = team.score - match.teams[1 - team.index].score;
    const late = match.clock > 70 * 60;
    let push = poss ? 0.62 : 0.72; // blok kaydırma katsayısı
    if (late && scoreDiff < 0) push += 0.05;
    if (late && scoreDiff > 0 && !poss) push -= 0.08;

    // Pres tetikleyicisi: rakip kendi yarı sahasında kötü kontrol / geri pas / kaleci ayakta → yüksek pres (2.5 sn)
    // Blok modu: 'high' (yüksek pres), 'mid' (orta blok), 'low' (alçak blok: son dakikalarda öndeyken)
    team.pressT = Math.max(0, (team.pressT || 0) - (1 / 60));
    if (!poss) {
      const o = ball.owner; const lk = ball.lastKick;
      const trigger = (o && o.role === 'GK' && !o.holding) || (lk && lk.team !== team.index && lk.kind === 'ground' && (lk.x * dir) < -15 && !ball.owner && ball.speed < 9) || (o && o.stunT > 0) || (o && (o.x * dir) < -22 && o.facing != null && Math.abs(M.angleDiff(o.facing, Math.atan2(0, -dir))) < 0.8);
      // pres tetikleyicisi taktik pres düzeyine bağlı: düşük preste yalnızca bariz fırsatlarda (sersemleyen rakip / çok derin top)
      if (trigger && (tac.press > 0.3 || (o && o.stunT > 0) || (o && (o.x * dir) < -30))) team.pressT = 2.5 * (0.6 + tac.press * 0.8);
    }
    // yüksek pres: taktik pres 0.6+ ise rakip yarı sahasında sürekli; 'otobüs'te (pres < 0.25) yalnızca tetikleyiciyle
    // ayrıca yoğun pres taktiğinde top rakip yarı sahasındayken öne çıkıp baskı: pres 0.9 → orta çizgiden itibaren, 0.7 → son 30 m
    const frontZone = (1 - tac.press) * 60 - 6;
    const highPress = !poss && (team.pressT > 0 || (tac.press > 0.55 && b.ax < -12 && !(late && scoreDiff > 0 && tac.press < 0.75)) || (tac.press > 0.6 && b.ax > frontZone));
    const lowBlock = !poss && ((late && scoreDiff > 0 && tac.line < 0.6) || tac.line < 0.25);
    team.block = highPress ? 'high' : lowBlock ? 'low' : 'mid';

    // savunma hattı (taktik: hat yüksekliği 0 = çok derin … 1 = çok yüksek)
    const lineOff = (tac.line - 0.5) * 12;
    let line;
    if (poss) line = M.clamp(b.ax - 24 + (men - 0.5) * 10 + lineOff, -42, 8 + (tac.line - 0.5) * 8);
    else line = M.clamp(b.ax - (highPress ? 9 : lowBlock ? 15 : 11) + lineOff * 0.6, -45, (highPress ? 5 : 2) + (tac.line - 0.5) * 6);
    // top kendi ceza sahasına yakınsa hat en fazla topun 4 m gerisinde
    if (!poss && b.ax < -30) line = Math.min(line, b.ax - 3);
    team.defLineAX = line;

    // kompaktlık: savunmada hatlar arası mesafe dar, top tarafına kayma güçlü; yüksek preste daha da dar ve topa yakın
    // taktik genişlik: 0 = çok dar, 1 = çok geniş
    const widthMul = (poss ? 1.12 : highPress ? 0.74 : lowBlock ? 0.74 : 0.78) * (0.8 + tac.width * 0.4);
    const lateralShift = b.az * (poss ? 0.18 : highPress ? 0.44 : 0.38);
    const compact = !poss ? (highPress ? 0.86 : lowBlock ? 0.78 : 0.95) : 1; // hat aralığı çarpanı

    for (const p of players) {
      const s = team.slots[p.slot];
      if (!s) continue;
      let ax, az;
      if (p.role === 'GK') { ax = -49; az = M.clamp(b.az * 0.12, -3.5, 3.5); }
      else if (isDef(p.role)) {
        ax = line + (s.x + 33) * 0.5; // CB'ler hatta, bekler biraz ileri (slot farkı)
        az = s.z * widthMul + lateralShift;
        if (poss && (p.role === 'RB' || p.role === 'LB')) ax += tac.instr && tac.instr.overlap ? 6 + men * 6 : 2; // bekler biner (talimat)
        if (poss && (p.role === 'RB' || p.role === 'LB') && tac.instr && tac.instr.cutInside) az *= 1.12; // kanatlar içe kesince genişliği bekler verir
      } else if (isWB(p.role)) {
        ax = line + 12 * compact + (poss ? (tac.instr && tac.instr.overlap ? 12 + men * 6 : 7) : 0);
        az = s.z * (poss ? 1.05 : 0.85) + lateralShift;
      } else if (isMid(p.role)) {
        const off = s.x + 17; // DM 0, CM ~7, AM ~13
        ax = line + (12 + off) * compact + (poss ? 6 + men * 4 : 0);
        az = s.z * widthMul + lateralShift;
      } else { // hücumcular
        const off = s.x + 2; // RW/LW ~0 (4-3-3'te 6), ST ~12
        ax = line + (26 + off) * compact + (poss ? 4 + men * 4 : -2);
        const wingIn = poss && (p.role === 'RW' || p.role === 'LW') && tac.instr && tac.instr.cutInside ? 0.62 : 1; // kanatlar içe kat eder
        az = s.z * (poss ? 1.05 : 0.7) * wingIn * (0.85 + tac.width * 0.3) + lateralShift * 0.6;
        // yüksek pres: forvetler pas kanallarını kapatmak için topa yaklaşır
        if (highPress) ax = Math.max(ax, b.ax - 4);
      }
      // savunmadayken herkes topun gerisinde kalmaya çalışır (forvetler hariç)
      if (!poss && !isAtt(p.role) && p.role !== 'GK') ax = Math.min(ax, b.ax - 1.5);
      if (!poss && isAtt(p.role)) ax = Math.min(ax, b.ax + 6);
      // hücumdayken ofsayt hattını ihlal etme (koşu yoksa)
      if (poss && p.role !== 'GK' && !p.hasBall) {
        const ol = AI.offsideLineAX(match, team.index);
        if (ax > ol - 0.8 && !(p.runTimer > 0)) ax = ol - 0.8;
      }
      ax = M.clamp(ax, -50, 50); az = M.clamp(az, -32, 32);
      const w = AI.toWorld(ax, az, dir);
      // Ev pozisyonu yumuşatılır: top sahipliği/top konumu değişince hedef anında zıplamaz (oyuncular kararsız yön değiştirmez).
      // Hücum↔savunma geçişinde ~0.8 s, normalde ~0.35 s zaman sabiti; oyun dışı/duran top konumlandırmasında anında.
      if (p.homeX == null || match.state !== 'play' || match.instantShape) { p.homeX = w.x; p.homeZ = w.z; }
      else {
        const dtS = 1 / 60;
        const tau = (p.homeTeamPoss !== poss) ? 0.8 : 0.35;
        const k = 1 - Math.exp(-dtS / tau);
        p.homeX += (w.x - p.homeX) * k; p.homeZ += (w.z - p.homeZ) * k;
        if (M.dist(p.homeX, p.homeZ, w.x, w.z) < 0.3) { p.homeX = w.x; p.homeZ = w.z; p.homeTeamPoss = poss; }
      }
      if (p.homeTeamPoss == null) p.homeTeamPoss = poss;
    }
  };

  /* -------------------- Yardımcılar -------------------- */
  AI.nearestOpp = function (match, teamIdx, x, z, excl) {
    let best = null, bd = 1e9;
    for (const o of match.playersOnPitch(1 - teamIdx)) {
      if (o === excl) continue;
      const d = M.dist(x, z, o.x, o.z);
      if (d < bd) { bd = d; best = o; }
    }
    return { p: best, d: bd };
  };
  // Bir noktaya varış süresi: mevcut hız bileşeni + ivmelenme + dönüş cezası (gerçekçi; sabit tepe hız varsayımı değil)
  AI.timeToReach = function (p, x, z, opts) {
    const dx = x - p.x, dz = z - p.z;
    const D = Math.sqrt(dx * dx + dz * dz);
    if (D < 1e-3) return 0;
    const vmax = p.maxSpeed * 0.9 * (0.8 + 0.2 * p.stamina) * (p.injured ? 0.62 : 1);
    const a = Math.max(2, p.accel * 0.85);
    let v0 = (p.vx * dx + p.vz * dz) / D; // hedefe doğru hız bileşeni
    let turn = 0;
    if (p.speed > 1.5) { const ang = Math.abs(M.angleDiff(Math.atan2(p.vz, p.vx), Math.atan2(dz, dx))); turn = (ang / Math.PI) * 0.45 * Math.min(1, p.speed / 5); }
    v0 = M.clamp(v0, 0, vmax);
    const dAcc = (vmax * vmax - v0 * v0) / (2 * a);
    let t;
    if (D <= dAcc) t = (-v0 + Math.sqrt(v0 * v0 + 2 * a * D)) / a;
    else t = (vmax - v0) / a + (D - dAcc) / vmax;
    return t + turn + (opts && opts.react != null ? opts.react : 0.1);
  };


  // Pas koridoru riski: rakiplerin koridora yakınlığı (0 güvenli .. 1 kesin kesilir)
  AI.laneRisk = function (match, teamIdx, ax, az, bx, bz, lofted) {
    let risk = 0;
    const L = M.dist(ax, az, bx, bz);
    const v0 = lofted ? 16 : FS.groundPassSpeed(L, 5);
    for (const o of match.playersOnPitch(1 - teamIdx)) {
      const c = M.segClosest(o.x, o.z, ax, az, bx, bz);
      const along = c.t * L;
      // vuruş anında hemen önümde duran rakip (0.3–2.6 m ileride, koridora 1.1 m'den yakın): top daha kalkmadan/hızlanmadan bloklanır
      // (havadan top da ilk 2 m'de diz–kalça yüksekliğindedir)
      if (c.t < 0.98 && along > 0.3 && along < 2.6 && c.d < 1.1 && o.fallT <= 0 && o.stunT <= 0) { risk = Math.max(risk, M.clamp01((1.1 - c.d) / 0.5) * 0.9); continue; }
      if (c.t <= 0.02 || c.t >= 0.98) continue;
      // top oraya varana kadar geçen süre (yavaşlayan top: ölçülmüş yaklaşıklık) ve ~0.25 s tepki süresi
      const tBall = lofted ? 0.6 + along * 0.034 : along / Math.max(4, v0 - along * 0.25);
      const tr = Math.max(0, tBall - 0.25);
      // rakibin koridora doğru mevcut hız bileşeni + ivmelenme (4.5 m/s², tepe 7 m/s)
      const vAlong = M.clamp(((c.x - o.x) * o.vx + (c.z - o.z) * o.vz) / Math.max(0.3, c.d), 0, 7);
      const tAcc = Math.min(tr, (7 - vAlong) / 4.5);
      const cover = vAlong * tAcc + 2.25 * tAcc * tAcc + 7 * Math.max(0, tr - tAcc);
      const reach = 1.0 + cover + (c.t > 0.85 ? 0.5 : 0);
      let r = 0;
      if (lofted) {
        // havadan: yalnızca kalkış (ilk 8 m) ve iniş (son 6 m) bölgelerinde top kafa hizasında; ayrıca iniş noktasına rakip top havadayken yetişirse hava topu mücadelesi
        if (along > 8 && along < L - 6) r = 0;
        else r = M.clamp01((reach * 0.7 + 0.6 - c.d) / 1.4);
      } else r = M.clamp01((reach + 0.8 - c.d) / 1.6); // menzil sınırında 0.5, 0.8 m içinde 1, 0.8 m dışında 0
      // alıcının arkasındaki (kale tarafındaki) rakip ayağa oynanan topu alıcının gövdesinden geçip kesemez: alıcı topu korur
      if (!lofted && c.t > 0.8) {
        const beyond = ((o.x - bx) * (bx - ax) + (o.z - bz) * (bz - az)) > -0.3 * L * M.dist(o.x, o.z, bx, bz);
        if (beyond && M.dist(o.x, o.z, bx, bz) < 4) r *= 0.3;
      }
      risk = Math.max(risk, r);
    }
    if (lofted) {
      const T = 0.6 + L * 0.034; // uçuş süresi (ölçülmüş)
      for (const o of match.playersOnPitch(1 - teamIdx)) {
        const dO = M.dist(o.x, o.z, bx, bz);
        const tOpp = 0.3 + (dO < 2.5 ? dO / 2.5 : 1 + (dO - 2.5) / 5.5);
        const contest = M.clamp01((T + 0.35 - tOpp) / 0.7);
        risk = Math.max(risk, 0.6 * contest);
      }
    }
    return risk;
  };

  // Şut kalitesi tahmini (xG benzeri)
  AI.shotQuality = function (match, p, x, z) {
    const dir = match.dirOf(p.team);
    const g = P.goalCenter(dir);
    const d = M.dist(x, z, g.x, g.z);
    const dx = Math.abs(g.x - x), dz = Math.abs(z);
    const angle = Math.atan2(P.goalWidth / 2 + dz, Math.max(0.5, dx)) - Math.atan2(dz - P.goalWidth / 2, Math.max(0.5, dx)); // kale açısı (rad)
    let q = M.clamp01(angle / 0.9) * Math.exp(-d / 17);
    // kaleci pozisyonu: çıkmışsa bonus
    const gk = match.gkOf(1 - p.team);
    if (gk) { const gd = M.dist(gk.x, gk.z, g.x, g.z); if (gd > 6) q *= 1.35; if (gd > 12 && d < 40) q *= 1.6; }
    // koridordaki savunmacılar
    let block = 0;
    for (const o of match.playersOnPitch(1 - p.team)) {
      if (o.role === 'GK') continue;
      const c = M.segClosest(o.x, o.z, x, z, g.x, g.z);
      if (c.t > 0.05 && c.t < 0.95 && c.d < 1.2) block += 0.35;
    }
    q *= Math.max(0.15, 1 - block);
    return M.clamp01(q * (0.7 + 0.5 * (p.attrs.shoot / 99)));
  };

  /* -------------------- Topsuz oyuncu -------------------- */
  AI.updateOffBall = function (match, p, dt) {
    const team = match.teams[p.team];
    const ball = match.ball;
    const dir = match.dirOf(p.team);
    const poss = match.possession === team.index;
    const ownerIsUs = ball.owner && ball.owner.team === p.team;
    p.faceAt = null;

    if (p.role === 'GK') return AI.updateGK(match, p, dt);

    // --- Tepki süresi: rakibin pasına anında değil, 0.2–0.4 s sonra tepki verilir (o ana kadar mevcut hareket sürer)
    const lk0 = ball.lastKick;
    if (!ball.owner && lk0 && lk0.team !== p.team && (lk0.kind === 'ground' || lk0.kind === 'through' || lk0.kind === 'lofted' || lk0.kind === 'cross' || lk0.kind === 'throw')) {
      const reactT = 0.18 + (1 - p.attrs.comp / 99) * 0.15 + (1 - p.attrs.vision / 99) * 0.1;
      if (lk0.t < reactT) {
        if (p.speed > 0.6) { const n = M.norm(p.vx, p.vz); A.moveToward(p, p.x + n.x * 3, p.z + n.z * 3, false, dt, { arrive: 0, speedCap: p.speed }); }
        else A.stop(p, dt);
        p.state = 'react';
        return;
      }
    }

    // --- Serbest top: en hızlı ulaşan kovalar
    if (!ball.owner) {
      const chaser = match.chaserOf(p.team);
      if (chaser === p) {
        const ip = match.interceptPoint(p);
        const lk = ball.lastKick;
        // rakibin pası bir alıcıya gidiyor ve alıcı topa benden önce varacaksa: topa değil, alıcının üstüne kapan (1.6 m mesafe, kale tarafı)
        if (lk && lk.team !== p.team && lk.target && lk.target.onPitch && lk.t < 3.5) {
          const ipT = match.interceptPoint(lk.target);
          if (ipT.t + 0.1 < ip.t) {
            // alıcının 3 m kale tarafına yerleş (topu alır almaz üstüne gitmek yerine önce kapat: gerçek savunmacı gibi)
            const og = P.goalCenter(-dir);
            const n = M.norm(og.x - ipT.x, og.z - ipT.z);
            const hp = team.block === 'high';
            const gap = hp ? 2.0 : 3.2;
            const tx = ipT.x + n.x * gap, tz = ipT.z + n.z * gap;
            const dd = M.dist(p.x, p.z, tx, tz);
            A.moveToward(p, tx, tz, dd > (hp ? 2 : 6), dt, { arrive: 1.2 });
            p.state = 'closedown';
            return;
          }
        }
        // yavaş/duran topa koşarken son metrelerde yavaşla (topu kontrollü al); bana atılan pasta rakip yakınsa topa 'saldır'
        const mine = lk && lk.team === p.team && lk.target === p;
        const rp = ip;
        const contested = mine && AI.nearestOpp(match, p.team, rp.x, rp.z).d < 5;
        A.moveToward(p, rp.x, rp.z, true, dt, { arrive: contested ? 0.35 : ball.speed < 4 ? 1.6 : 0.7 });
        p.state = 'chase';
        return;
      }
      // ikinci oyuncu destek verir
      const chaser2 = match.chaser2Of(p.team);
      if (chaser2 === p) {
        const ip = match.interceptPoint(p);
        const dIp = M.dist(p.x, p.z, ip.x, ip.z);
        // ikinci adam: topa doğru kademe alır; yalnızca top yakınsa (ilk adam kaybederse alacak kadar) sprint, yoksa tempolu
        const tx = (ip.x + p.homeX) * 0.5, tz = (ip.z + p.homeZ) * 0.5;
        A.moveToward(p, tx, tz, dIp < 12, dt, { arrive: 1.2, speedCap: dIp < 12 ? undefined : 4.2 });
        p.state = 'support';
        return;
      }
    }

    if (poss || ownerIsUs) return AI.attackOffBall(match, p, dt);
    return AI.defendOffBall(match, p, dt);
  };

  AI.attackOffBall = function (match, p, dt) {
    const team = match.teams[p.team];
    const ball = match.ball;
    const dir = match.dirOf(p.team);
    const realOwner = ball.owner;
    // pasımız havadayken alıcıyı 'sanal taşıyıcı' say: destek hedefleri eve dönüp yeniden hesaplanmaz (ileri-geri koşu yok)
    const lkO = ball.lastKick;
    const owner = realOwner || (lkO && lkO.team === p.team && lkO.target && lkO.target.onPitch && lkO.t < 3 && lkO.kind !== 'shot' && lkO.kind !== 'header' && lkO.kind !== 'clear' ? lkO.target : null);
    const b = AI.toAttack(ball.x, ball.z, dir);
    const me = AI.toAttack(p.x, p.z, dir);
    const home = AI.toAttack(p.homeX, p.homeZ, dir);
    const ol = AI.offsideLineAX(match, p.team);
    let tx = home.ax, tz = home.az;
    let sprint = false;

    // Koşu zamanlayıcısı
    p.runCoolT = (p.runCoolT || 0) - dt;
    if (p.runTimer > 0 && p.runVec) {
      p.runTimer -= dt;
      if (p.runTimer <= 0) p.runCoolT = 1.6; // koşu bitti: hemen geri dönme, yavaşla ve yürüyerek yerleş
      tx = me.ax + p.runVec.ax * 10; tz = me.az + p.runVec.az * 10;
      sprint = true;
      // koşuya çıkarken ofsayta düşme: hat +0.3 sınırı (top gelene kadar)
      if (tx > ol - 0.3 && !(ball.lastKick && ball.lastKick.kind === 'through' && ball.lastKick.team === p.team && !ball.owner)) tx = ol - 0.3;
      // ceza sahasına girince yavaşla ve pozisyon al
      if (me.ax > 44) { p.runTimer = 0; }
    } else {
      // Koşu başlat: hücumcular ve 8/10'lar, top sahibi kendi yarı sahamızın ötesinde ve önünde boşluk varsa
      if (owner && owner !== p && (isAtt(p.role) || p.role === 'AM' || p.role === 'CM' || isWB(p.role)) && b.ax > -15 && me.ax > b.ax - 12) {
        const spaceAhead = AI.nearestOpp(match, p.team, p.x + dir * 8, p.z).d;
        const tacI = team.tactics && team.tactics.instr;
        const counterBoost = tacI && tacI.counter && match.lastTurnoverT != null && match.t - match.lastTurnoverT < 5 ? 2.2 : 1; // hızlı kontra: top kazanılınca derinlik koşuları
        const pr = (isAtt(p.role) ? 0.45 : 0.18) * dt * (0.5 + p.attrs.pace / 120) * (spaceAhead > 5 ? 1.5 : 0.6) * counterBoost * (0.7 + (team.tactics ? team.tactics.tempo : 0.5) * 0.6);
        if (me.ax < ol - 1 && M.chance(pr)) {
          // koşu yönü: ileri, hafif içe/dışa
          const az = M.clamp((M.random() - 0.5) * 0.8 - me.az * 0.02, -0.5, 0.5);
          const n = M.norm(1, az);
          p.runTimer = M.rand(1.4, 2.6);
          p.runVec = { ax: n.x, az: n.z };
        }
      }
      // Pas seçeneği oluşturma: top sahibine yakın oyuncular pas alınabilir açıya/boşluğa kayar
      if (owner && owner !== p) {
        const dToOwner = M.distP(p, owner);
        // 30/36 m histerezisi: sınırda ev pozisyonu ↔ destek hedefi arasında gidip gelme olmasın
        const inRange = dToOwner < 30 || (p.supportTgt && p.supportOwner === owner && dToOwner < 36);
        if (inRange) {
          const o = AI.toAttack(owner.x, owner.z, dir);
          // adaylar: ev pozisyonu etrafında noktalar + taşıyıcıya doğru 'kısa gel' noktası + topun uzağına açılma.
          // Rol farkı: santrfor son savunma hattında kalır (stoperleri sabitler), yalnızca top derindeyken bağlantı için iner;
          // kanatlar genişliği korur (çizgide kalır) ve hat boyunca hareket eder; orta saha/bekler pas açısı için serbestçe kayar.
          let best = null, bs = -1e9;
          const isST = p.role === 'ST', isWing = p.role === 'RW' || p.role === 'LW';
          let cands;
          if (isST) { cands = [[0, 0], [0, 4], [0, -4], [-2, 0], [1, 6], [1, -6], [-4, 3], [-4, -3]]; if (o.ax < -8) cands.push([-9, 0], [-12, 4], [-12, -4]); }
          else if (isWing) { const sg = Math.sign(home.az || 1); cands = [[0, 0], [4, 0], [-4, 0], [-8, 0], [0, -sg * 4], [-3, -sg * 6], [3, -sg * 2]]; if (o.ax < -10) cands.push([-14, 0]); }
          else {
            cands = [[0, 0], [5, 0], [-4, 0], [0, 5], [0, -5], [4, 4], [4, -4], [8, 0], [-7, 0], [0, 8], [0, -8]];
            const toB = M.norm(o.ax - home.ax, o.az - home.az);
            cands.push([toB.x * 6, toB.z * 6]); // taşıyıcıya doğru kısa gel
            cands.push([toB.x * 11, toB.z * 11]);
          }
          // hedefi her karede değil, 0.7–1.3 s'de bir yenile (gerçek oyuncu kararlı hareket eder; kararsız sprintler yok)
          p.supportT = (p.supportT || 0) - dt;
          if (p.supportT <= 0 || !p.supportTgt || p.supportOwner !== owner) {
            const openW = isST ? 0.5 : isWing ? 0.8 : 1.3;
            const scoreAt = (cax, caz) => {
              const w = AI.toWorld(cax, caz, dir);
              const open = Math.min(9, AI.nearestOpp(match, p.team, w.x, w.z).d);
              const risk = AI.laneRisk(match, p.team, ball.x, ball.z, w.x, w.z, false);
              const dOwn = M.dist(w.x, w.z, owner.x, owner.z);
              // ideal pas mesafesi 8–18 m; çok yakın ya da çok uzak cezalı (forvetler için uzaklık cezası yok: onlar kısa seçenek değil)
              const distScore = dOwn < 5 ? -8 : dOwn < 8 ? -2 : dOwn <= 18 ? 1.5 : dOwn <= 26 ? 0 : (isST || isWing ? 0 : -3);
              // forvetler markajı kabul eder (açıklık ağırlığı düşük), hattı korur (yüksekte kalma bonusu)
              return open * openW - risk * (isST ? 4 : 10) + distScore - M.dist(w.x, w.z, p.homeX, p.homeZ) * 0.12 + (cax - home.ax) * (isST || isWing ? 0.35 : 0.2);
            };
            for (const c of cands) {
              const cax = home.ax + c[0], caz = home.az + c[1];
              if (cax > ol - 0.8 || Math.abs(caz) > 33) continue;
              // mevcut hedefe yakın adaylar hafif bonus (sürekli yön değiştirmeme)
              const stick = p.supportTgt ? -M.dist(cax, caz, p.supportTgt.ax, p.supportTgt.az) * 0.08 : 0;
              const sc = scoreAt(cax, caz) + stick;
              if (sc > bs) { bs = sc; best = { ax: cax, az: caz }; }
            }
            // histerezis: mevcut hedef hâlâ geçerliyse ve yeni hedef belirgin biçimde daha iyi değilse hedefte kal
            // (gerçek oyuncu her saniye fikir değiştirmez; özellikle geri dönüş gerektiren değişimler için eşik daha yüksek)
            const cur = p.supportTgt;
            if (cur && best && cur.ax <= ol - 0.8 && Math.abs(cur.az) <= 33) {
              const curSc = scoreAt(cur.ax, cur.az);
              const jump = M.dist(cur.ax, cur.az, best.ax, best.az);
              const dCur = M.dist(me.ax, me.az, cur.ax, cur.az);
              const backtrack = jump > 2 && dCur > 1.5 && ((best.ax - me.ax) * (cur.ax - me.ax) + (best.az - me.az) * (cur.az - me.az)) < 0; // yeni hedef ters yönde
              const sameOwner = p.supportOwner === owner;
              const margin = (sameOwner ? 2.0 : 1.0) + (backtrack ? 3.0 : 0) + Math.min(2, jump * 0.15);
              if (bs < curSc + margin) best = cur;
            }
            p.supportTgt = best; p.supportOwner = owner; p.supportT = M.rand(0.7, 1.3);
          } else best = p.supportTgt;
          if (best) { tx = best.ax; tz = best.az; }
        }
      }
      // Bana pas atıldı: topa doğru git (bekleme), topu karşıla; havadan top: düşeceği noktanın altına gir
      if (!realOwner && ball.lastKick && ball.lastKick.team === p.team && ball.lastKick.target === p && ball.lastKick.t < 3.5) {
        let ip = match.interceptPoint(p);
        if (ball.y > 1.0 && match.ballPath) { const land = match.ballPath.find((q) => q.t > 0.05 && q.y < 0.9 && q.vy <= 0) || match.ballPath.find((q) => q.y < 1.2); if (land) ip = land; }
        const a = AI.toAttack(ip.x, ip.z, dir);
        tx = a.ax; tz = a.az; sprint = M.dist(me.ax, me.az, tx, tz) > 6;
        const w2 = AI.toWorld(tx, tz, dir);
        A.moveToward(p, w2.x, w2.z, sprint, dt, { arrive: 0.5 });
        p.state = 'receive';
        return;
      }
      // Orta bekleniyor: kanattan top → ceza sahasına doldur (bir kez girince en az 2.5 s orada kal: ileri-geri koşu yok)
      p.boxFillT = (p.boxFillT || 0) - dt;
      if (owner && owner !== p && (isAtt(p.role) || p.role === 'AM' || p.role === 'CM') && ((b.ax > 25 && Math.abs(b.az) > 14) || (p.boxFillT > 0 && b.ax > 18))) {
        if (b.ax > 25 && Math.abs(b.az) > 14) p.boxFillT = 2.5;
        const side = p.boxSide || (p.boxSide = Math.sign(-b.az || 1));
        const targets = [[44, -3], [42, 4], [39, 0], [46, 6 * side], [36, -6]];
        const idx = Math.abs(p.id) % targets.length;
        tx = Math.min(ol - 0.5, targets[idx][0]); tz = targets[idx][1] + (M.hashRand(p.name, 'box') - 0.5) * 4;
        sprint = M.dist(me.ax, me.az, tx, tz) > 8;
      } else p.boxSide = null;
    }
    // Ofsayt disiplini
    if (tx > ol - 0.4 && p.runTimer <= 0) tx = ol - 0.4;
    const w = AI.toWorld(tx, tz, dir);
    const d = M.dist(p.x, p.z, w.x, w.z);
    // varış/bekleme histerezisi: durduktan sonra hedef 1.8 m'den az kaydıysa tekrar kalkma (mikro düzeltme titremesi yok)
    if (d < 0.8 || (p.state === 'idle' && d < 1.8 && p.runTimer <= 0)) { A.stop(p, dt); p.state = 'idle'; A.faceTo(p, ball.x, ball.z); return; }
    if (p.runTimer <= 0) {
      const toT = M.norm(w.x - p.x, w.z - p.z);
      const vAlong = p.vx * toT.x + p.vz * toT.z; // hedefe doğru hız bileşeni (negatif: hedef arkamda)
      // hedefi hafif geçtim (< 4 m) ve hâlâ hızlıysam: geri dönmek yerine bulunduğum yeri benimse (gerçek oyuncu 3 m için geri koşmaz)
      if (d < 4 && p.speed > 2.5 && vAlong < -0.5 * p.speed && me.ax <= ol - 0.8 && Math.abs(me.az) <= 33) {
        if (p.supportTgt && p.supportOwner === owner) p.supportTgt = { ax: me.ax, az: me.az };
        A.stop(p, dt); p.state = 'idle'; A.faceTo(p, ball.x, ball.z); return;
      }
      // geri çekilmeme: top bizde ve önümdeyken 6 m'den kısa geri düzeltmeler için koşulmaz, pozisyon tutulur
      if (owner && b.ax > me.ax + 2 && tx < me.ax - 0.5 && d < 6 && p.speed < 2.5) { A.stop(p, dt); p.state = 'idle'; A.faceTo(p, ball.x, ball.z); return; }
    }
    // pozisyon alma tempolu koşuyla; yalnızca çok uzaktaysa ya da hızlı geçiş (top bizde ve çok önde) varsa sprint.
    // Topa uzak oyuncular küçük düzeltmeleri yürüyerek/hafif koşuyla yapar (gerçek maçta oyuncuların çoğu çoğu zaman yürür)
    const transition = owner && (b.ax - me.ax) > 15;
    const dBall = M.dist(p.x, p.z, ball.x, ball.z);
    const doSprint = sprint || d > 22 || (transition && d > 8);
    let cap = doSprint ? undefined : d < 3 ? 2.2 : d < 8 ? 3.6 : dBall > 30 ? 4.2 : undefined;
    // koşu sonrası soğuma: geri/yan yerleşme yürüyerek (sprintten sonra 180° dönüp geri koşulmaz)
    if (p.runCoolT > 0 && !sprint) cap = Math.min(cap || 9, p.speed > 4 ? p.speed : 2.5);
    A.moveToward(p, w.x, w.z, doSprint && !(p.runCoolT > 0), dt, { arrive: 1.2, speedCap: cap });
    p.state = 'move';
  };

  AI.defendOffBall = function (match, p, dt) {
    const team = match.teams[p.team];
    const ball = match.ball;
    const dir = match.dirOf(p.team);
    const owner = ball.owner;
    const ownGoal = P.goalCenter(-dir);
    let tx = p.homeX, tz = p.homeZ, sprint = false;

    const presser = match.presserOf(p.team);
    const cover = match.coverOf(p.team);
    if (presser === p && owner && owner.holding) {
      // elinde top olan kaleciye müdahale edilemez: ~3.6 m önünde bekle (kısa dağıtım kanalını kapat), üstüne yürüme
      const gdx = ownGoal.x - owner.x, gdz = ownGoal.z - owner.z; const gl = M.len(gdx, gdz) || 1;
      tx = owner.x + (gdx / gl) * 3.6; tz = owner.z + (gdz / gl) * 3.6;
      p.state = 'jockey'; p.jockeyT = 0; p.faceAt = ball;
      if (M.dist(p.x, p.z, tx, tz) < 0.7) A.stop(p, dt); else A.moveToward(p, tx, tz, false, dt, { arrive: 0.7, speedCap: 4.2 });
      return;
    }
    if (presser === p) {
      // topa/taşıyıcıya baskı: kale ile top arasına gir. Önce 'jokey' (1.6 m mesafede bekle, geri geri kapat),
      // top açıldığında / taşıyıcı sabırsızlandığında / tehlikeli bölgede müdahaleye gir.
      const target = owner || ball;
      const gdx = ownGoal.x - target.x, gdz = ownGoal.z - target.z;
      const gl = M.len(gdx, gdz) || 1;
      const d = M.distP(p, target);
      let commit = true;
      if (owner) {
        p.jockeyT = d < 3.2 ? (p.jockeyT || 0) + dt : 0;
        const agg = p.attrs.aggression / 99;
        const ballLoose = M.dist(owner.x, owner.z, ball.x, ball.z) > 0.65 || owner.firstTouchT > 0.1;
        const toMe = Math.atan2(p.z - owner.z, p.x - owner.x);
        const facingMe = Math.abs(M.angleDiff(owner.facing, toMe)) < 1.1; // top bana dönük (açıkta)
        const dGoalO = M.dist(owner.x, owner.z, ownGoal.x, ownGoal.z);
        commit = (ballLoose && d < 2.4) || p.jockeyT > 0.9 + (1 - agg) * 1.4 || (dGoalO < 24 && facingMe && d < 2.2) || (team.block === 'high' && p.jockeyT > 0.45) || (owner.speed > 5.5 && facingMe && d < 2.5) || owner.stunT > 0;
      }
      const ahead = commit ? 0.6 : 2.0;
      tx = target.x + (gdx / gl) * ahead; tz = target.z + (gdz / gl) * ahead;
      if (owner) {
        // taşıyıcının hızını gecikmeli algıla (≈0.3 s): ani yön değişimlerinde (çalım) savunmacı bir an yanlış tarafa gider
        const k = 1 - Math.exp(-dt / 0.3);
        p.trkVx = (p.trkVx == null ? owner.vx : p.trkVx + (owner.vx - p.trkVx) * k);
        p.trkVz = (p.trkVz == null ? owner.vz : p.trkVz + (owner.vz - p.trkVz) * k);
        tx += p.trkVx * 0.3; tz += p.trkVz * 0.3;
      } else { p.trkVx = p.trkVz = null; }
      // uzaktan baskıya sprintle yalnızca yüksek preste / kontra tehlikesinde; normalde tempolu yaklaş (enerji ve pozisyon)
      const danger = owner && (owner.x * dir) < -10;
      sprint = commit || (d > 4 && (team.block === 'high' || danger || d < 9));
      p.state = commit ? 'press' : 'jockey';
      if (!commit && d < 6) p.faceAt = ball; // jokey: yüz topa dönük, geri geri/yan adımlarla kapat
      // jokey: geri geri/yan adımlarla en fazla ~4.8 m/s; taşıyıcı patlarsa önce dönmesi gerekir (çalım burada başarılı olur)
      A.moveToward(p, tx, tz, sprint, dt, { arrive: commit ? 0.5 : 0.9, speedCap: !commit && d < 3.5 ? Math.min(4.8, Math.max(3.2, (owner ? owner.speed : 0) + 1.0)) : undefined });
      if (commit) AI.maybeTackle(match, p, dt);
      return;
    }
    if (cover === p && owner) {
      if (team.block === 'high') {
        // yüksek pres: kademe yerine taşıyıcının en yakın kısa pas seçeneğini kapat (pas gölgesi)
        let opt = null, od = 1e9;
        for (const m of match.playersOnPitch(owner.team)) { if (m === owner || m.role === 'GK') continue; const dd = M.distP(m, owner); if (dd < od && dd < 18) { od = dd; opt = m; } }
        if (opt) { const gdx = owner.x - opt.x, gdz = owner.z - opt.z; const gl = M.len(gdx, gdz) || 1; tx = opt.x + (gdx / gl) * 1.5; tz = opt.z + (gdz / gl) * 1.5; }
        else { tx = owner.x + (ownGoal.x - owner.x) * 0.15; tz = owner.z + (p.z > owner.z ? 3 : -3); }
        p.state = 'press2';
        A.moveToward(p, tx, tz, true, dt, { arrive: 0.6 });
        if (M.distP(p, owner) < 2.2) AI.maybeTackle(match, p, dt);
        return;
      }
      // kademe: taşıyıcının 5 m gerisinde, kale tarafında
      const gdx = ownGoal.x - owner.x, gdz = ownGoal.z - owner.z;
      const gl = M.len(gdx, gdz) || 1;
      tx = owner.x + (gdx / gl) * 6; tz = owner.z + (gdz / gl) * 6 + (p.z > owner.z ? 2.5 : -2.5);
      sprint = M.dist(p.x, p.z, tx, tz) > 4;
      p.state = 'cover';
      if (!sprint) p.faceAt = ball;
      A.moveToward(p, tx, tz, sprint, dt, { arrive: 0.8 });
      AI.maybeTackle(match, p, dt);
      return;
    }
    // Markaj: bölgemdeki en tehlikeli rakip (kaleye yakın ve bana yakın)
    let mark = null, ms = -1e9;
    const prevMark = p.markTgt && p.markTgt.onPitch && p.markTgt !== owner ? p.markTgt : null;
    p.markHoldT = (p.markHoldT || 0) - dt;
    for (const o of match.playersOnPitch(1 - p.team)) {
      if (o === owner || o.role === 'GK') continue;
      const dHome = M.dist(o.x, o.z, p.homeX, p.homeZ);
      // histerezis: mevcut adamım 11 m'ye kadar bırakılmaz, yenisi 9 m içinde olmalı; mevcut adam puan avantajlı (≈5 m) ve en az 1.5 s tutulur
      if (dHome > (o === prevMark ? 11 : 9)) continue;
      const threat = -M.dist(o.x, o.z, ownGoal.x, ownGoal.z) * 0.1 - dHome * 0.3 + (o === prevMark ? (p.markHoldT > 0 ? 6 : 1.5) : 0);
      if (threat > ms) { ms = threat; mark = o; }
    }
    if (mark !== prevMark) p.markHoldT = 1.5;
    p.markTgt = mark;
    if (mark) {
      const gdx = ownGoal.x - mark.x, gdz = ownGoal.z - mark.z;
      const gl = M.len(gdx, gdz) || 1;
      const tight = (M.dist(mark.x, mark.z, ownGoal.x, ownGoal.z) < 25 ? 1.6 : 3.0) * (team.block === 'high' ? 0.7 : team.block === 'low' ? 1.15 : 1);
      tx = mark.x + (gdx / gl) * tight; tz = mark.z + (gdz / gl) * tight;
      // savunma hattını koru: hattın çok gerisine düşme
      if (isDef(p.role)) {
        const lineW = team.defLineAX * dir;
        if ((tx - lineW) * dir < -3) tx = lineW - 3 * dir;
      }
      p.state = 'mark';
    } else p.state = 'zone';
    const d = M.dist(p.x, p.z, tx, tz);
    // durma histerezisi: yerleştikten sonra 1.5 m'lik kaymalar için tekrar kalkma
    if (d < 0.6 || (p.settled && d < 1.5)) { p.settled = true; A.stop(p, dt); A.faceTo(p, ball.x, ball.z); return; }
    p.settled = false;
    // markaj/bölge düzeltmeleri: topa yakınsa tempolu, uzaksa yürüyerek/hafif koşuyla; geçiş anında (top hızla bize geliyor) sprint
    const dBall = M.dist(p.x, p.z, ball.x, ball.z);
    const ballComing = ball.owner ? (ball.owner.vx * dir < -3) : (ball.vx * dir < -6);
    // sprint yalnızca gerçek tehlikede: top bize doğru geliyor, yüksek pres, çok uzak kaldım ya da adamım tehlikeli bölgede ve top yakın
    const markDanger = mark && M.dist(mark.x, mark.z, ownGoal.x, ownGoal.z) < 32 && dBall < 25;
    const doSprint = d > 6 && (markDanger || ballComing || team.block === 'high' || d > 18);
    const cap = doSprint ? undefined : d < 2.5 ? 2.2 : d < 7 ? 3.6 : dBall > 30 ? 4.2 : 4.8;
    // savunma pozisyonu alırken (yavaş düzeltmeler) yüz topa dönük: geri geri/yan adım; uzun mesafede koşu yönüne döner
    if (!doSprint && dBall < 40) p.faceAt = ball;
    A.moveToward(p, tx, tz, doSprint, dt, { arrive: 1.0, speedCap: cap });
    // yakınsa topa müdahale
    if (owner && M.distP(p, owner) < 2.2) AI.maybeTackle(match, p, dt);
  };

  AI.maybeTackle = function (match, p, dt) {
    const ball = match.ball;
    const owner = ball.owner;
    if (!owner || owner.team === p.team || p.tackleCd > 0 || p.tackleT > 0) return;
    if (owner.holding) return; // kaleci topu elinde tutuyor: müdahale edilemez (kural), sadece baskı yapılır
    const d = M.dist(p.x, p.z, ball.x, ball.z);
    const agg = p.attrs.aggression / 99;
    const dir = match.dirOf(p.team);
    const inOwnBox = P.inPenaltyArea(ball.x, ball.z, -dir);
    // kendi ceza sahasında son adam/tehlike: müdahale daha temkinli ama sıfır değil (penaltılar gerçekçi sıklıkta olsun)
    if (d < 1.25) {
      if (M.chance(dt * (2.5 + agg * 3) * (inOwnBox ? 0.7 : 1))) match.attemptTackle(p, owner, false);
    } else if (d < 2.6 && owner.speed > 3.5) {
      // kayarak: taşıyıcı uzaklaşıyorsa daha istekli; ceza sahasında umutsuz durumda (kaleye dönük, yakın) yine de kayar
      const goal = P.goalCenter(-dir);
      const desperate = inOwnBox && M.dist(owner.x, owner.z, goal.x, goal.z) < 16 && Math.abs(M.angleDiff(owner.facing, Math.atan2(goal.z - owner.z, goal.x - owner.x))) < 0.9;
      const pr = dt * (0.35 + agg * 1.1) * (inOwnBox ? (desperate ? 0.8 : 0.35) : 1);
      if (M.chance(pr)) match.attemptTackle(p, owner, true);
    }
  };

  /* -------------------- Kaleci -------------------- */
  AI.updateGK = function (match, p, dt) {
    const ball = match.ball;
    const dir = match.dirOf(p.team);
    const goal = P.goalCenter(-dir);
    const ownBox = -dir;
    if (p.diveT > 0) return; // dalış animasyonu sürüyor (match yönetir)
    if (p.holding) return AI.gkDistribute(match, p, dt);
    // Kaleci hücumda (son dakika korneri): rakip ceza sahasında forvet gibi davranır; top temizlenince / rakip kontraya çıkınca sprintle döner
    if (p.gkUpT > 0) {
      p.gkUpT -= dt;
      const oppGoal = P.goalCenter(dir);
      const ballAX = ball.x * dir;
      const oppHas = ball.owner && ball.owner.team !== p.team;
      if (ballAX < 8 || (oppHas && ballAX < 30) || match.state !== 'play') p.gkUpT = 0;
      else {
        const ol = AI.offsideLineAX(match, p.team);
        const tx = Math.min(ol - 0.6, 52.5 - 8) * dir, tz = M.clamp(ball.z * 0.3, -6, 6);
        const d = M.dist(p.x, p.z, tx, tz);
        if (d < 1.0) { A.stop(p, dt); A.faceTo(p, ball.x, ball.z); } else A.moveToward(p, tx, tz, d > 4, dt, { arrive: 0.8 });
        p.state = 'gk_up'; return;
      }
    }
    if (p.gkReturn) { // hücumdan dönüş: kaleye sprint
      const d = M.dist(p.x, p.z, goal.x + dir * 3, goal.z);
      if (d > 4) { A.moveToward(p, goal.x + dir * 3, goal.z, true, dt, { arrive: 1.0 }); p.state = 'gk_return'; return; }
      p.gkReturn = false;
    }

    // Top bize doğru şut/ilerliyor mu?
    const towardUs = (ball.vx * -dir) > 4 && (ball.x - goal.x) * -dir < 0; // topa göre kale ileride
    const dGoalBall = M.dist(ball.x, ball.z, goal.x, goal.z);
    const threatTeamHasBall = ball.owner && ball.owner.team !== p.team;

    // Çıkış kararı: serbest top ceza sahasında ve ben en hızlıysam
    if (!ball.owner && P.inPenaltyArea(ball.x, ball.z, ownBox) && ball.y < 2.2) {
      const chaser = match.chaserOf(1 - p.team);
      const tMe = AI.timeToReach(p, ball.x, ball.z), tOpp = chaser ? AI.timeToReach(chaser, ball.x, ball.z) : 9;
      if (tMe < tOpp + 0.15 || ball.speed < 2) {
        const ip = match.interceptPoint(p);
        A.moveToward(p, ip.x, ip.z, true, dt, { arrive: 0.4 });
        p.state = 'gk_rush'; return;
      }
    }
    // Bire bir: taşıyıcı sahaya girdi, savunmacı yok → daralt
    if (threatTeamHasBall && dGoalBall < 22) {
      const o = ball.owner;
      const nd = AI.nearestOpp(match, 1 - p.team, o.x, o.z, null); // taşıyıcıya en yakın bizim oyuncu
      const dOwnDef = nd.p && nd.p.role !== 'GK' ? nd.d : 99;
      if (dOwnDef > 3.5 && dGoalBall < 16) {
        const dx = o.x - goal.x, dz = o.z - goal.z, l = M.len(dx, dz) || 1;
        const out = M.clamp(dGoalBall * 0.45, 2.5, 7);
        A.moveToward(p, goal.x + (dx / l) * out, goal.z + (dz / l) * out, true, dt, { arrive: 0.6 });
        p.state = 'gk_close'; return;
      }
    }
    // Standart pozisyon: top-kale açıortayı üzerinde, açıya göre 1.5–4 m önde
    const dx = ball.x - goal.x, dz = ball.z - goal.z;
    const l = M.len(dx, dz) || 1;
    const far = dGoalBall > 45;
    const out = far ? M.clamp(dGoalBall * 0.2, 4, 12) : M.clamp(1.2 + (dGoalBall / 30) * 3.5, 1.2, 4.5);
    let tx = goal.x + (dx / l) * out, tz = goal.z + (dz / l) * out;
    // kale ağzının ötesine sapma
    tz = M.clamp(tz, -3.2, 3.2);
    tx = M.clamp(tx * dir, -P.halfL + 0.4, -P.halfL + 16) * dir; // kendi çizgisinin önünde kal
    const d = M.dist(p.x, p.z, tx, tz);
    if (d < 0.35) { A.stop(p, dt); A.faceTo(p, ball.x, ball.z); p.state = 'gk_set'; return; }
    A.moveToward(p, tx, tz, d > 3, dt, { arrive: 0.8 });
    p.facing = Math.atan2(ball.z - p.z, ball.x - p.x); p.lockFacing = true;
    p.state = 'gk_set';
  };

  AI.gkDistribute = function (match, p, dt) {
    const ball = match.ball;
    const dir = match.dirOf(p.team);
    // tutarlılık: top artık bende değilse (çalındı/serbest) tutma durumu biter
    if (ball.owner !== p) { p.holding = false; p.holdT = 0; return; }
    // holdT sayacı ve topun eldeki konumu match.updatePlay'de (tek kaynak); 8 saniye kuralı da orada
    const opp = AI.nearestOpp(match, p.team, p.x, p.z);
    // ceza sahası içinde topu taşıyabilir (yüz ilerde, yürüyerek)
    const tx = (-P.halfL + 12) * dir, tz = p.z * 0.6;
    const tacG = match.teams[p.team].tactics;
    const wasteTime = tacG && tacG.tempo < 0.4 && match.teams[p.team].score > match.teams[1 - p.team].score && match.clock > 75 * 60; // öndeyken zaman yönetimi: elde uzun tutar (8 sn sınırı içinde)
    if (p.holdT < (wasteTime ? 5.0 : 1.2)) { A.moveToward(p, tx, tz, false, dt, { speedCap: 3.5 }); if (p.speed < 0.8) A.faceTo(p, tx, tz); return; }
    const mustRelease = p.holdT > 6.0; // 8 sn kuralı yaklaşıyor: ne olursa olsun oyna
    if (opp.d < 4.5 && !mustRelease) {
      // önümde rakip: topu içinden atmak yerine ceza sahası içinde yana/geriye açıl (kanal aç), sonra dağıt
      const away = M.norm(p.x - opp.p.x, p.z - opp.p.z);
      const side = M.norm(-away.z, away.x); const sgn = (p.z > 0 ? -1 : 1);
      let ax = p.x + away.x * 1.5 + side.x * sgn * 3.0, az = p.z + away.z * 1.5 + side.z * sgn * 3.0;
      // ceza sahasında kal, kale çizgisine 3 m'den fazla yaklaşma
      ax = dir > 0 ? M.clamp(ax, -P.halfL + 3, -P.halfL + 15.5) : M.clamp(ax, P.halfL - 15.5, P.halfL - 3);
      az = M.clamp(az, -18.5, 18.5);
      if (p.holdT < 4.5 || opp.d < 2.2) { A.moveToward(p, ax, az, false, dt, { arrive: 0.5, speedCap: 3.6 }); if (p.speed < 0.8) A.faceTo(p, tx, tz); return; }
    }
    // seçenek: kısa el pası (açık bek/CB), orta mesafe atış, uzun vuruş — kanal riski yüksek adaylar elenir (zorunlu değilse)
    const mates = match.playersOnPitch(p.team).filter((m) => m !== p);
    let best = null, bs = -1e9;
    for (const m of mates) {
      const d = M.distP(p, m);
      const open = Math.min(12, AI.nearestOpp(match, p.team, m.x, m.z).d);
      const risk = AI.laneRisk(match, p.team, ball.x, ball.z, m.x, m.z, d > 25);
      if (risk > 0.5 && !mustRelease) continue;
      const prog = (m.x - p.x) * dir;
      let sc = open * 1.5 - risk * 12 + prog * 0.05;
      if (d < 8) sc -= 4;
      if (d > 45) sc -= 3;
      if (sc > bs) { bs = sc; best = { m, d, open, risk }; }
    }
    // Karar: takım stili (mentalite) + skor durumu → kısa oyun kurma / hızlı kontra / uzun top
    const team = match.teams[p.team]; const scoreDiff = team.score - match.teams[1 - p.team].score; const late = match.clock > 78 * 60;
    const oppHigh = match.playersOnPitch(1 - p.team).filter((o) => (o.x * dir) < -25).length; // kaç rakip önümüzde baskıda
    const longBall = team.tactics && team.tactics.instr && team.tactics.instr.longBall;
    const buildUp = !longBall && (team.mentality < 0.62 || p.attrs.pass > 70); // topçu kaleci / oyun kuran takım
    const counter = mates.find((m) => isAtt(m.role) && (m.x * dir) > 5 && AI.nearestOpp(match, p.team, m.x, m.z).d > 8 && m.speed > 3 && AI.laneRisk(match, p.team, ball.x, ball.z, m.x + dir * 8, m.z, true) < 0.5);
    if (counter && p.holdT < 2.2 && M.chance(0.75)) {
      // hızlı kontra: koşan forvete uzun/ hızlı top
      A.faceTo(p, counter.x, counter.z);
      A.gkLongKick(p, ball, { x: counter.x + dir * 8 + counter.vx * 0.6, z: counter.z + counter.vz * 0.6 });
      match.onDistribution(p, counter);
    } else if (!longBall && best && best.open > 5 && best.risk < 0.35 && best.d < 40 && (buildUp || oppHigh < 3 || late && scoreDiff > 0 ? true : M.chance(0.55))) {
      A.faceTo(p, best.m.x, best.m.z);
      A.gkThrow(p, ball, { x: best.m.x + best.m.vx * 0.4, z: best.m.z + best.m.vz * 0.4 }, best.d > 22);
      match.onDistribution(p, best.m);
    } else {
      // uzun top: hedef, alıcının önündeki 'iniş noktası' — hava topunu alıcı rakipten önce karşılamalı (kazanma olasılığı puanlanır)
      const targets = mates.filter((m) => isAtt(m.role) || isMid(m.role));
      let t = null, ts = -1e9, tAim = null;
      for (const m of targets) {
        const d0 = M.distP(p, m); if (d0 > 62) continue;
        // iniş noktası: alıcının 4 m önü, hız öngörüsüyle
        const aim = { x: M.clamp(m.x + dir * 4 + m.vx * 0.8, -P.halfL + 3, P.halfL - 3), z: M.clamp(m.z + m.vz * 0.8, -P.halfW + 3, P.halfW - 3) };
        const nd = AI.nearestOpp(match, p.team, aim.x, aim.z);
        const tMate = AI.timeToReach(m, aim.x, aim.z), tOpp = nd.p ? AI.timeToReach(nd.p, aim.x, aim.z) : 9;
        const riskL = AI.laneRisk(match, p.team, ball.x, ball.z, aim.x, aim.z, true);
        const sc = M.clamp(tOpp - tMate, -3, 3) * 2.5 + Math.min(10, nd.d) * 0.6 + (m.x * dir) * 0.06 + (isAtt(m.role) ? 1.0 : 0) + (m.attrs.str > 75 ? 1.5 : 0) + M.rand(0, 1.5) - riskL * 12 - (d0 > 50 ? 3 : 0);
        if (sc > ts) { ts = sc; t = m; tAim = aim; }
      }
      t = t || mates[0]; tAim = tAim || { x: t.x + dir * 4, z: t.z };
      A.faceTo(p, tAim.x, tAim.z);
      A.gkLongKick(p, ball, tAim);
      match.onDistribution(p, t);
    }
    p.state = 'gk_kick';
  };

  /* -------------------- Top sahibi -------------------- */
  AI.updateCarrier = function (match, p, dt) {
    const team = match.teams[p.team];
    const ball = match.ball;
    const dir = match.dirOf(p.team);
    const goal = P.goalCenter(dir);
    const me = AI.toAttack(p.x, p.z, dir);
    const opps = match.playersOnPitch(1 - p.team);
    const pressure = A.pressureOn(p, opps);
    const nearest = AI.nearestOpp(match, p.team, p.x, p.z);
    const dGoal = M.dist(p.x, p.z, goal.x, goal.z);
    const scoreDiff = team.score - match.teams[1 - team.index].score;
    const minute = match.clock / 60;
    const urgency = minute > 75 && scoreDiff < 0 ? 1.3 : minute > 80 && scoreDiff > 0 ? 0.8 : 1;

    p.decisionT -= dt;
    if (p.takeOnCd > 0) p.takeOnCd -= dt;
    if (match.ball.ownerSince !== p) { match.ball.ownerSince = p; p.gotBallT = match.t; }
    // Kaleci top ayağındaysa: hızlı dağıt (hücuma çıkmış kaleci hariç: forvet gibi karar verir)
    if (p.role === 'GK' && !(p.gkUpT > 0)) {
      if (p.decisionT > 0 && nearest.d > 6) { A.stop(p, dt); return; }
      p.decisionT = 0.35;
      return AI.carrierPass(match, p, pressure, true) || A.clear(p, ball, dir, {});
    }

    // Anlık tehdit: rakip çok yakınsa hemen karar
    const closing = nearest.p ? ((nearest.p.vx - p.vx) * (p.x - nearest.p.x) + (nearest.p.vz - p.vz) * (p.z - nearest.p.z)) > 0 : false;
    const urgent = nearest.d < 1.15 && closing && p.decisionT > 0.08 && !(p.intent && p.intent.takeOn);
    if (p.decisionT > 0 && !urgent) {
      // önceki niyeti sürdür
      return AI.executeIntent(match, p, dt, pressure);
    }
    p.decisionT = M.rand(0.22, 0.38);

    // 1) Şut
    const q = AI.shotQuality(match, p, ball.x, ball.z);
    const shootThresh = (0.028 + pressure * 0.02 + Math.max(0, dGoal - 18) * 0.007) / urgency;
    const facingGoal = Math.abs(M.angleDiff(p.facing, Math.atan2(goal.z - p.z, goal.x - p.x))) < 1.4;
    if (dGoal < 36 && q > shootThresh && facingGoal && M.chance(0.55 + q * 2)) {
      p.intent = { type: 'shoot', q };
      return AI.executeIntent(match, p, dt, pressure);
    }
    // 2) Uzaklaştırma: kendi ceza sahasında baskı altında
    if (P.inPenaltyArea(p.x, p.z, -dir) && pressure > 0.5 && !p.role.startsWith('GK')) {
      const passed = AI.carrierPass(match, p, pressure, false, { safeOnly: true });
      if (!passed) A.clear(p, ball, dir, { z: p.z > 0 ? 1 : -1 });
      p.intent = null;
      return;
    }
    // 3) Pas mı, dripling mi?
    const spaceAhead = AI.spaceAhead(match, p, dir);
    // top elimde ne kadar kaldı (uzun süre sürükleme = amaçsız dripling; pas eğilimi artar)
    const carryT = match.t - (p.gotBallT || match.t);
    const dribScore = (spaceAhead / 12) * (0.6 + 0.6 * (p.attrs.drib / 99)) * (me.ax > -20 ? 1 : 0.7) * (1 - pressure * 0.6) * (carryT > 3.5 ? 0.55 : 1);
    const passOpt = AI.bestPassOption(match, p, pressure);
    const passScore = passOpt ? passOpt.score : -1;
    // Kanatta ve ceza sahası hizasında: orta
    if (me.ax > 26 && Math.abs(me.az) > 12 && dGoal > 13) {
      const crossOpt = passOpt && passOpt.kind === 'cross' ? passOpt : AI.bestPassOption(match, p, pressure, { crossOnly: true });
      const inBox = crossOpt ? match.playersOnPitch(p.team).filter((m) => m !== p && P.inPenaltyArea(m.x, m.z, dir)).length : 0;
      if (crossOpt && crossOpt.kind === 'cross' && (inBox >= 1 || me.ax > 36) && (pressure > 0.3 || spaceAhead < 4 || Math.abs(me.az) > 22 || carryT > 1.2 || M.chance(0.3))) { p.intent = { type: 'pass', opt: crossOpt }; return AI.executeIntent(match, p, dt, pressure); }
    }
    // Verkaç (duvar pası): topu az önce bana veren oyuncuyla — ilk dokunuşla geri ver, o koşuya çıksın
    if (passOpt && passOpt.kind === 'ground' && pressure > 0.35 && me.ax > -10) {
      const lp = match.lastCompletedPass;
      if (lp && lp.to === p && lp.from === passOpt.target && passOpt.target.runTimer > 0 && match.t - lp.t < 1.4 && passOpt.d < 12 && M.chance(0.25 + p.attrs.pass / 400)) {
        p.intent = { type: 'pass', opt: passOpt, oneTwo: true };
        return AI.executeIntent(match, p, dt, pressure);
      }
    }
    // Karar: topu bir süre taşı (kafayı kaldır, rakibi çek), sonra en iyi seçeneğe oyna.
    // Baskı arttıkça bekleme kısalır; çok iyi bir seçenek (uzun risksiz kazanım) hemen oynanır.
    const holdMax = p.holdMax != null ? p.holdMax : 1.0;
    const mustRelease = pressure > 0.78 || (pressure > 0.55 && carryT > 1.0) || carryT > holdMax + 2.5;
    const great = passOpt && passOpt.risk < 0.15 && passOpt.gain > 10 && (passOpt.kind !== 'lofted' || (passOpt.d < 30 && AI.nearestOpp(match, p.team, passOpt.target.x, passOpt.target.z).d > 5));
    const timeUp = carryT > holdMax * (1 - pressure * 0.6);
    // Çalım (1'e 1): son üçte bölgede, tek rakip karşımda ve ikinci savunmacı yakın değilse, iyi dripling yapan oyuncu adamını geçmeyi dener
    const takeOn = me.ax > 15 && (isAtt(p.role) || p.role === 'AM' || isWB(p.role)) && p.attrs.drib > 68 && nearest.d < 3.5 && nearest.d > 0.9 && pressure < 0.7 && spaceAhead < 4
      && AI.nearestOpp(match, p.team, p.x, p.z, nearest.p).d > 4.5 && (p.takeOnCd || 0) <= 0 && M.chance(0.35 + (p.attrs.drib - 68) / 60);
    if (takeOn) { p.intent = { type: 'dribble', takeOn: true, side: (M.hashRand(p.name, 'foot') > 0.5 ? 1 : -1) * (M.chance(0.7) ? 1 : -1) }; p.takeOnCd = 2.5; p.decisionT = M.rand(0.5, 0.8); return AI.executeIntent(match, p, dt, pressure); }
    const noSpace = (spaceAhead < 1.6 && passScore > -2) || (spaceAhead < 3 && pressure > 0.4 && passScore > 1);
    // son üçte bölgede önüm açıksa topu ceza sahasına doğru taşı (pas aramak yerine): gol tehdidi yaratır
    const driveIn = me.ax > 18 && spaceAhead > 5 && dGoal > 15 && pressure < 0.5 && !great && Math.abs(me.az) < 24;
    if (driveIn && !mustRelease) { p.intent = { type: 'dribble' }; return AI.executeIntent(match, p, dt, pressure); }
    if (passOpt && (mustRelease || great || (timeUp && (passScore > dribScore * 4 || spaceAhead < 6)) || noSpace)) {
      p.intent = { type: 'pass', opt: passOpt, why: mustRelease ? (pressure > 0.78 ? 'press' : carryT > holdMax + 2.5 ? 'carryMax' : 'pressT') : great ? 'great' : timeUp ? 'timeUp' : 'noSpace' };
    } else if (spaceAhead > 2.5 || !passOpt) {
      p.intent = { type: 'dribble', calm: !timeUp && pressure < 0.3 };
    } else {
      p.intent = passOpt ? { type: 'pass', opt: passOpt } : { type: 'dribble' };
    }
    return AI.executeIntent(match, p, dt, pressure);
  };

  AI.spaceAhead = function (match, p, dir) {
    // önümdeki 60° koni içinde en yakın rakip mesafesi (kaleye doğru)
    const goal = P.goalCenter(dir);
    const ang = Math.atan2(goal.z - p.z, goal.x - p.x);
    let best = 14;
    for (const o of match.playersOnPitch(1 - p.team)) {
      const dx = o.x - p.x, dz = o.z - p.z;
      const d = M.len(dx, dz);
      if (d > 14) continue;
      const a = Math.abs(M.angleDiff(ang, Math.atan2(dz, dx)));
      if (a < 0.6 || d < 1.8) best = Math.min(best, d);
    }
    // saha kenarı
    const edge = Math.min(P.halfW - Math.abs(p.z), (P.halfL - p.x * dir));
    return Math.min(best, Math.max(0, edge));
  };

  AI.executeIntent = function (match, p, dt, pressure) {
    const ball = match.ball;
    const dir = match.dirOf(p.team);
    const goal = P.goalCenter(dir);
    const it = p.intent;
    if (!it) { p.intent = { type: 'dribble' }; }
    switch (p.intent.type) {
      case 'shoot': {
        // hedef: kaleci pozisyonuna göre uzak köşe
        const gk = match.gkOf(1 - p.team);
        const side = gk ? (gk.z > 0 ? -1 : 1) : (M.chance(0.5) ? 1 : -1);
        const dGoal = M.dist(p.x, p.z, goal.x, goal.z);
        const skill = p.attrs.shoot / 99;
        // uzaktan / baskı altında nişan daha az köşeye (güvenli); yakından köşeye
        const corner = dGoal > 20 ? M.rand(0.8, 2.4) : M.rand(1.6, 3.2);
        const aimZ = side * corner * (0.7 + 0.3 * skill);
        const chip = gk && M.dist(gk.x, gk.z, goal.x, goal.z) > 9 && dGoal < 35 && dGoal > 12 && M.chance(0.6 + skill * 0.3);
        const finesse = dGoal < 22 && Math.abs(p.z) > 4 && M.chance(0.45 + skill * 0.3);
        const aimY = chip ? 1.8 : (M.chance(0.55) ? M.rand(0.2, 0.7) : M.rand(1.2, 2.1));
        const power = chip ? 0.5 : M.clamp(0.4 + dGoal / 50 + M.rand(-0.1, 0.12), 0.35, 0.95);
        A.faceTo(p, goal.x + 0, goal.z + aimZ);
        A.shoot(p, ball, { x: goal.x, z: aimZ, y: aimY }, power, { pressure, style: chip ? 'chip' : finesse ? 'finesse' : 'normal', spinDir: -side * dir });
        match.onShot(p, { q: it.q });
        p.intent = null; p.decisionT = 0.4;
        return;
      }
      case 'pass': {
        const opt = p.intent.opt;
        if (!opt || !opt.target.onPitch) { p.intent = null; return; }
        // vuruş anında koridor kontrolü: karar verildikten sonra (0.2–0.4 s) rakip pas hattına girdiyse pası zorlamak yerine
        // gövdeyle koru / yön değiştir ve yeni karar ver (gerçek oyuncu ayağının önündeki rakibe pas atmaz)
        if (!p.intent.forced) {
          let blocked = false;
          for (const o of match.playersOnPitch(1 - p.team)) {
            if (o.fallT > 0 || o.stunT > 0) continue;
            const c = M.segClosest(o.x, o.z, ball.x, ball.z, opt.aim.x, opt.aim.z);
            const along = c.t * M.dist(ball.x, ball.z, opt.aim.x, opt.aim.z);
            if (along > 0.3 && along < 2.6 && c.d < 0.9) { blocked = true; break; }
          }
          if (blocked) {
            p.intent.blockedN = (p.intent.blockedN || 0) + 1;
            if (p.intent.blockedN < 12) {
              // topu rakipten uzak tarafa çek (gövde koruması), kısa bekleme ve yeniden karar
              const near = AI.nearestOpp(match, p.team, p.x, p.z);
              const awayX = near.p ? p.x - near.p.x : -dir, awayZ = near.p ? p.z - near.p.z : 0;
              const n = M.norm(awayX + (goal.x - p.x) * 0.05, awayZ);
              A.moveToward(p, p.x + n.x * 2.5, p.z + n.z * 2.5, false, dt, { arrive: 0.6, speedCap: 3.2 });
              p.wantSprint = false; p.state = 'shield';
              p.decisionT = Math.min(p.decisionT, 0.12);
              return;
            }
            p.intent.forced = true; // 0.2 s boyunca açılmadı: yine de oyna (ya da baskı zaten mustRelease dedirtir)
          }
        }
        // alıcıya dön ve at
        A.faceTo(p, opt.aim.x, opt.aim.z);
        A.pass(p, ball, opt.aim, opt.kind, { pressure, arrive: opt.kind === 'through' ? 6.5 : 4.2, spinDir: opt.spinDir });
        match.onPass(p, opt.target, opt.kind);
        // alıcının koşusu
        if (opt.kind === 'through') { opt.target.runTimer = 1.6; const n = M.norm(opt.aim.x - opt.target.x, opt.aim.z - opt.target.z); opt.target.runVec = { ax: n.x * dir, az: n.z * dir }; }
        // verkaç: pası verdikten sonra rakibin arkasına koş (duvar pasının ikinci ayağı)
        if (p.intent.oneTwo || (opt.kind === 'ground' && opt.d < 12 && pressure > 0.35 && p.role !== 'CB' && p.role !== 'DM' && M.chance(0.3))) {
          const near = AI.nearestOpp(match, p.team, p.x, p.z);
          const side = near.p ? -Math.sign((near.p.z - p.z) * dir || 1) : (M.chance(0.5) ? 1 : -1);
          const n = M.norm(1, side * 0.45);
          p.runTimer = M.rand(1.3, 2.0); p.runVec = { ax: n.x, az: n.z };
          p.wantReturn = match.t; // pası geri isteme işareti (alıcı verkaçı tamamlamayı tercih eder)
          match.emit('onetwo', { p, target: opt.target });
        }
        p.intent = null; p.decisionT = 0.5;
        return;
      }
      case 'dribble':
      default: {
        // hedef yön: kale; en yakın rakipten kaç; boş koridora sür
        const near = AI.nearestOpp(match, p.team, p.x, p.z);
        const meA = AI.toAttack(p.x, p.z, dir);
        let tx = goal.x - dir * 6, tz = p.z * 0.85;
        // kanat oyuncuları çizgiye yakın kalır; ceza sahası hizasına gelince içe kat (ters ayak şutu için)
        if (p.role === 'RW' || p.role === 'LW' || isWB(p.role)) tz = meA.ax > 30 && Math.abs(p.z) < 20 ? p.z * 0.45 : p.z * 0.95;
        let vx = tx - p.x, vz = tz - p.z;
        const l = M.len(vx, vz) || 1; vx /= l; vz /= l;
        if (p.intent.takeOn && near.p) {
          // çalım (1'e 1): rakibe yavaş yaklaş → rakibin AÇIK tarafına (ağırlığının olmadığı yöne) 55° keskin kesme ile yanal boşluk aç
          // → önüne alıp patlama; rakip geride kalınca kaleye dön. Rakip kilitlenir (başka rakibe göre yeniden hesaplanmaz).
          const it = p.intent;
          if (!it.def || !it.def.onPitch || M.distP(p, it.def) > 6) it.def = near.p;
          const def = it.def;
          const relZ = (def.z - p.z) * dir;            // hücum eksenine dik yanal konum (hücum uzayında)
          const defAhead = (def.x - p.x) * dir;         // rakip önümde mi (+)
          const dDef = M.distP(p, def);
          if (!it.sideLocked) {
            let side = Math.abs(relZ) > 0.3 ? -Math.sign(relZ) : (it.side || 1);
            if (Math.abs(p.z * dir + side * 3) > 31) side = -side; // dışarı doğru çalım yapma
            it.side = side; it.sideLocked = true; it.lat0 = Math.abs(relZ);
          }
          const side = it.side;
          const lat = Math.abs(relZ);
          const phase = dDef > 2.4 && defAhead > 0 ? 'approach' : (defAhead > -0.4 && lat < 1.25) ? 'cut' : 'burst';
          it.phase = phase;
          if (phase === 'approach') { A.moveToward(p, p.x + dir * 4, p.z, false, dt, { arrive: 0.1, speedCap: 3.6 }); }
          else if (phase === 'cut') {
            // hedef: 1.2 m ileri, 1.8 m yana (keskin kesme); top sürücü hızlanır
            A.moveToward(p, p.x + dir * 1.2, p.z + side * dir * 1.8, true, dt, { arrive: 0.1 });
            it.cutT = (it.cutT || 0) + dt;
          } else {
            // patlama: rakibin yanından ileri (hafif yana açılarak), sonra kaleye doğru
            const ahead = defAhead < -0.8 ? 0.15 : 0.5;
            A.moveToward(p, p.x + dir * 6, p.z + side * dir * 6 * ahead, true, dt, { arrive: 0.1 });
            it.cutT = (it.cutT || 0) + dt * 0.5;
          }
          p.wantSprint = phase !== 'approach';
          p.state = 'dribble';
          p.decisionT = Math.max(p.decisionT, 0.15);
          if (dDef > 3.5 || defAhead < -1.2 || (it.cutT || 0) > 1.6) { it.takeOn = false; p.decisionT = 0; } // geçti ya da vazgeçti
          return;
        }
        if (near.p && near.d < 5) {
          // rakipten uzağa yan kaçış (ama geri dönmeden: ileri bileşen korunur)
          let ax = p.x - near.p.x, az = p.z - near.p.z; const al = M.len(ax, az) || 1; ax /= al; az /= al;
          const w = (5 - near.d) / 5 * 1.4;
          vx += ax * w; vz += az * w;
          if (vx * dir < 0.1 && meA.ax > -30) vx = dir * 0.1; // topu geri sürükleme
          // sahanın dışına sürükleme
          if (Math.abs(p.z) > 30) vz -= Math.sign(p.z) * 0.8;
          if (p.x * dir > 50) vx -= dir * 0.8;
        }
        const n = M.norm(vx, vz);
        // sakin taşıma (rakip uzakta, acele yok): kontrollü tempoda ilerle; kontra/açık alan: sprint; rakip önümde (jokey): yandan/çaprazdan sür
        const calm = p.intent.calm && near.d > 5;
        const jockeyed = near.p && near.d < 3.8 && Math.abs(M.angleDiff(Math.atan2(near.p.z - p.z, near.p.x - p.x), Math.atan2(n.z, n.x))) < 0.9;
        const sprint = !calm && !jockeyed && near.d > 3 && p.stamina > 0.3 && Math.abs(p.z) < 33;
        A.moveToward(p, p.x + n.x * 6, p.z + n.z * 6, sprint, dt, { arrive: 0.1, speedCap: calm ? 4.2 : jockeyed ? 4.8 : undefined });
        p.state = 'dribble';
        return;
      }
    }
  };

  // En iyi pas seçeneği
  AI.bestPassOption = function (match, p, pressure, opts) {
    const o = opts || {};
    const team = match.teams[p.team];
    const ball = match.ball;
    const dir = match.dirOf(p.team);
    const me = AI.toAttack(p.x, p.z, dir);
    const ol = AI.offsideLineAX(match, p.team);
    const goal = P.goalCenter(dir);
    let best = null;
    for (const m of match.playersOnPitch(p.team)) {
      if (m === p) continue;
      const mm = AI.toAttack(m.x, m.z, dir);
      const d = M.distP(p, m);
      if (d < 3 || d > 55) continue;
      // ofsayt (yalnızca rakip yarı sahada)
      const offside = mm.ax > ol + 0.05 && mm.ax > 0;
      const open = Math.min(7, AI.nearestOpp(match, p.team, m.x, m.z).d);
      const prog = mm.ax - me.ax;
      const nearGoal = M.dist(m.x, m.z, goal.x, goal.z);
      // pas türü adayları
      const cands = [];
      // top yolda iken alıcının gideceği yer (yer pası süresi ≈ d/12)
      const tFly = d / 12;
      // alıcı pası görünce topa doğru gelir: koşudaysa / hızlı hareket ediyorsa adımına (öngörülü), yavaşsa ayağına (0.3 s öngörü)
      const lead = (m.runTimer > 0 || m.speed > 3.5) ? Math.min(1, tFly) * 0.75 : Math.min(0.3, tFly);
      const gx = m.x + m.vx * lead, gz = m.z + m.vz * lead;
      const riskG = AI.laneRisk(match, p.team, ball.x, ball.z, gx, gz, false);
      // koridorda başka bir takım arkadaşı varsa yer pası ona çarpar: bu adayı atla
      let mateBlock = false;
      for (const q of match.playersOnPitch(p.team)) { if (q === p || q === m) continue; const cq = M.segClosest(q.x, q.z, ball.x, ball.z, gx, gz); if (cq.t > 0.06 && cq.t < 0.94 && cq.d < 1.1) { mateBlock = true; break; } }
      if (!offside && d < 38 && !mateBlock) cands.push({ kind: 'ground', aim: { x: gx, z: gz }, risk: riskG, gain: prog });
      if (d > 14) {
        const riskL = AI.laneRisk(match, p.team, ball.x, ball.z, m.x, m.z, true) * 0.6 + 0.08;
        // hava topu: alıcının biraz iç tarafına (taç çizgisine sekip çıkmasın), kale çizgisini aşmasın
        const lz = M.clamp(m.z + m.vz * 0.6 - Math.sign(m.z) * (Math.abs(m.z) > 22 ? 2.5 : 0), -(P.halfW - 4), P.halfW - 4);
        const lx = M.clamp(m.x + m.vx * 0.6, -(P.halfL - 4), P.halfL - 4);
        if (!offside) cands.push({ kind: 'lofted', aim: { x: lx, z: lz }, risk: riskL, gain: prog });
      }
      // ara pası: alıcının önündeki boşluğa (koşan ya da hızlı oyuncu)
      if (mm.ax > -5 && (isAtt(m.role) || m.role === 'AM' || m.role === 'CM' || isWB(m.role))) {
        const lead = M.clamp(6 + (m.attrs.pace / 99) * 6, 6, 12);
        const aimAX = Math.min(mm.ax + lead, 49), aimAZ = mm.az * 0.85;
        const aimW = AI.toWorld(aimAX, aimAZ, dir);
        const openT = Math.min(10, AI.nearestOpp(match, p.team, aimW.x, aimW.z).d);
        const riskT = AI.laneRisk(match, p.team, ball.x, ball.z, aimW.x, aimW.z, false);
        // alıcı ofsaytta değilse ve boşluğa ulaşabilirse
        const tMate = AI.timeToReach(m, aimW.x, aimW.z);
        const nd = AI.nearestOpp(match, p.team, aimW.x, aimW.z);
        const tOpp = nd.p ? AI.timeToReach(nd.p, aimW.x, aimW.z) : 9;
        // ara pası yalnızca alıcı boşluğa rakipten net önce varıyorsa ve koridor temizse
        if (!offside && tMate < tOpp - 0.25 && openT > 4 && mm.ax > me.ax - 3 && d > 7 && riskT < 0.4) cands.push({ kind: 'through', aim: aimW, risk: riskT, gain: aimAX - me.ax, openOverride: openT });
      }
      // orta: kanattan ceza sahasına
      if (me.ax > 24 && Math.abs(me.az) > 11 && mm.ax > 30 && Math.abs(mm.az) < 15 && (isAtt(m.role) || m.role === 'AM' || m.role === 'CM')) {
        // hedef: alıcının önü (koşuya orta) — kafa/ilk dokunuş için ceza sahası içi
        cands.push({ kind: 'cross', aim: { x: m.x + m.vx * 0.5 + dir * 1.5, z: m.z + m.vz * 0.5 }, risk: 0.3 - open * 0.02, gain: prog + 5 + (m.attrs.str > 75 ? 1.5 : 0), spinDir: -Math.sign(me.az) * dir });
      }
      // verkaç dönüşü: bana az önce pas verip koşuya çıkan arkadaş
      const wall = m.runTimer > 0 && m.wantReturn != null && match.t - m.wantReturn < 2.2 && (match.lastCompletedPass && match.lastCompletedPass.from === m && match.lastCompletedPass.to === p);
      for (const c of cands) {
        const op = c.openOverride != null ? c.openOverride : open;
        if (o.crossOnly && c.kind !== 'cross') continue;
        if (o.safeOnly && (c.risk > 0.25 || c.gain < -5)) continue;
        const tacP = team.tactics; const tempo = tacP ? tacP.tempo : 0.5;
        // tempo düşükken risk daha ağır cezalandırılır (top tutma), yüksekken ileri/riskli pas ödüllenir
        let sc = op * 1.3 - c.risk * 20 * (1 + (0.5 - tempo) * 0.8) + c.gain * 0.5 * (0.7 + tempo * 0.6) + (nearGoal < 20 ? 3 : 0);
        if (tacP && tacP.instr && tacP.instr.longBall && c.kind === 'lofted' && c.gain > 10) sc += 3.5; // uzun top talimatı
        if (tempo < 0.4 && c.gain < 0 && c.risk < 0.15) sc += 1.5; // top tutma: güvenli geri/yan pas kabul
        // ilerleme: rakip yarı sahaya / son üçte bölgeye giren pas değerli; geri pas (baskı yokken) cezalı, tamamen geri (kaleciye doğru 15+ m) daha da
        if (c.gain > 5 && mm.ax > 17) sc += 2;
        if (c.gain > 3 && me.ax < 0 && mm.ax > 0) sc += 1;
        if (c.gain < -4 && pressure < 0.45) sc -= 2.5;
        // mesafe: 6–20 m arası paslar en güvenilir; çok kısa (rakip üstümüze gelir) ve uzun paslar cezalı
        if (d < 6) sc -= 2; else if (d > 22) sc -= (d - 22) * 0.2;
        if (c.kind === 'through') {
          sc += 2.0 * (team.mentality) + (nearGoal < 30 ? 1.5 : 0) - 3.0;
          // zamanlama: alıcı zaten koşuda ve hattın hemen gerisindeyse (ofsayt hattını kıracak) büyük bonus; durgun alıcıya ara pası cezalı
          if (m.runTimer > 0 && mm.ax > ol - 4) sc += 5; else if (m.speed < 2) sc -= 3;
          if (me.ax < -10) sc -= 3; // kendi yarı sahamızdan ara pası nadir
        }
        if (c.kind === 'lofted') sc -= 4.5 - (d > 28 && c.risk < 0.2 && op > 6 ? 2.5 : 0) + (d < 20 ? 3 : 0);
        if (wall && c.kind !== 'cross') sc += 5; // duvar pasını tamamla
        if (d > 35) sc -= 3;
        if (c.gain < -12) sc -= 4; // çok geri
        // baskı altında kısa güvenli paslar tercih
        if (pressure > 0.5 && d < 15 && c.risk < 0.2) sc += 3;
        // alıcı hareket halinde ve önü açıksa bonus
        const vAlong = (m.vx * dir);
        if (vAlong > 3) sc += 1.5;
        // aynı oyuncuya üst üste pas (ping-pong) ve az önce pası alan oyuncuya hemen geri (verkaç değilse) hafif ceza
        if (!wall && match.lastCompletedPass && match.lastCompletedPass.from === m && match.lastCompletedPass.to === p && match.t - match.lastCompletedPass.t < 3 && c.gain < 3) sc -= 2.5;
        c.score = sc; c.target = m; c.d = d;
        if (!best || sc > best.score) best = c;
      }
    }
    if (o.crossOnly) return best && best.score > -6 ? best : null;
    if (best && best.score < (o.safeOnly ? -2 : 0)) return o.safeOnly ? null : best;
    return best;
  };

  AI.carrierPass = function (match, p, pressure, isGK, opts) {
    const opt = AI.bestPassOption(match, p, pressure, opts);
    if (!opt) return false;
    const ball = match.ball;
    A.faceTo(p, opt.aim.x, opt.aim.z);
    A.pass(p, ball, opt.aim, opt.kind, { pressure, errMul: isGK ? 1.1 : 1 });
    match.onPass(p, opt.target, opt.kind);
    return true;
  };
})(typeof window !== 'undefined' ? window : globalThis);
