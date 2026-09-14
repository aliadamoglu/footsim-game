/* Hakem üçlüsü: orta hakem (diyagonal sistem) + iki yardımcı hakem (ofsayt çizgisini takip eder, bayrak kaldırır)
   Görsel işaretler (players.js okur): cardT/cardColor (kart gösterme), flagT (bayrak), earT (VAR kulaklık), pointT/pointDir (işaret),
   signalT/signalKind ('nogoal' → kollar çapraz, 'goal' → orta noktayı gösterir, 'advantage' → iki kol ileri). */
(function (root) {
  const FS = (root.FS = root.FS || {});
  const M = FS.M, P = FS.PITCH, A = FS.Actions, AI = FS.AI;
  const O = (FS.Officials = {});

  function lum(hex) { const h = hex.replace('#', ''); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }

  O.create = function (match) {
    const mk = (name, role) => {
      const p = FS.createPlayer(2, [0, name, 'CM', 74], -1, null, false);
      p.role = role; p.team = 2; p.number = ''; p.shortName = name; p.maxSpeed = 7.6; p.accel = 7.5; p.official = true;
      p.cardT = 0; p.cardColor = null; p.flagT = 0; p.earT = 0; p.pointT = 0; p.pointDir = 0; p.signalT = 0; p.signalKind = null; p.whistleT = 0;
      p.stamina = 1;
      return p;
    };
    const ref = mk('Hakem', 'REF');
    const ar = [mk('Yardımcı hakem 1', 'AR'), mk('Yardımcı hakem 2', 'AR')];
    // AR0: +z (uzak) kenar, x ≥ 0 yarısı; AR1: -z (ana tribün) kenar, x ≤ 0 yarısı
    ar[0].side = 1; ar[0].halfSign = 1; ar[1].side = -1; ar[1].halfSign = -1;
    // forma rengi: takımlardan biri koyu (siyah/lacivert) giyiyorsa sarı, aksi hâlde siyah
    const dark = match.teams.some((t) => lum(t.kit.c1) < 0.22 || (t.kit.c2 && lum(t.kit.c2) < 0.12 && t.kit.pattern === 'stripes'));
    const kit = dark ? { c1: '#e8d92c', c2: '#e8d92c', shorts: '#111111', socks: '#111111', num: '#111111', pattern: 'plain' } : { c1: '#151515', c2: '#151515', shorts: '#151515', socks: '#151515', num: '#ffd400', pattern: 'plain' };
    const team = { index: 2, id: 'REF', name: 'Hakemler', short: 'REF', kit, gkKit: kit, players: [ref].concat(ar), subs: [], stats: {} };
    ref.x = 0; ref.z = -6; ar[0].x = 10; ar[0].z = P.halfW + 0.9; ar[1].x = -10; ar[1].z = -(P.halfW + 0.9);
    ref.facing = Math.PI / 2; ar[0].facing = -Math.PI / 2; ar[1].facing = Math.PI / 2;
    // 4. hakem: orta çizgi hizasında, kulübelerin arasında (ana tribün tarafı); değişiklik / uzatma tabelasını kaldırır
    const fourth = mk('Dördüncü hakem', 'FOURTH');
    fourth.x = 0; fourth.z = -(P.halfW + 2.6); fourth.facing = Math.PI / 2; fourth.boardT = 0; fourth.boardKind = null; fourth.boardText = ''; fourth.boardOut = null; fourth.boardIn = null; fourth.lockFacing = true;
    team.players.push(fourth);
    const off = { referee: ref, assistants: ar, fourth, team, all: [ref].concat(ar, [fourth]) };
    match.referee = ref; match.assistants = ar;
    return off;
  };

  function decay(p, dt) {
    for (const k of ['cardT', 'flagT', 'earT', 'pointT', 'signalT', 'whistleT', 'boardT']) if (p[k] > 0) p[k] -= dt;
  }

  /* Oyuncu çarpışmalarından kaçınma (hakem oyuncuların içinden geçmesin) */
  function avoid(match, p, tx, tz) {
    let ax = 0, az = 0;
    for (const q of match.allOnPitch()) {
      const d = M.dist(p.x, p.z, q.x, q.z);
      if (d < 2.0 && d > 1e-3) { const w = (2.0 - d) / 2.0; ax += ((p.x - q.x) / d) * w * 3; az += ((p.z - q.z) / d) * w * 3; }
    }
    const b = match.ball; const db = M.dist(p.x, p.z, b.x, b.z);
    if (db < 2.2 && db > 1e-3 && b.speed > 2) { const w = (2.2 - db) / 2.2; ax += ((p.x - b.x) / db) * w * 4; az += ((p.z - b.z) / db) * w * 4; }
    return { x: tx + ax, z: tz + az };
  }

  O.update = function (match, dt) {
    const off = match.officials; if (!off) return;
    const ref = off.referee, ball = match.ball, st = match.state;
    for (const p of off.all) decay(p, dt);
    if (st === 'lineup') { // seremoni: hakemler match.updateLineup tarafından yürütülür (tünel → dizilme → tokalaşma)
      const f4 = off.fourth; if (f4) { A.stop(f4, dt); f4.facing = Math.PI / 2; f4.lockFacing = true; }
      return;
    }

    /* ---------- orta hakem ---------- */
    let tx, tz, sprint = false, cap = 5.6, arrive = 2.0, faceAt = null;
    const r = match.restart;
    if (st === 'play' || st === 'advantage') {
      const dirP = match.dirOf(match.possession);
      // diyagonal: topun 8-14 m gerisinde, yardımcı hakemin karşı tarafında kal
      tx = ball.x - dirP * 10;
      tz = ball.z * 0.45 + (ball.x * dirP > 0 ? -1 : 1) * 6 * (dirP > 0 ? 1 : -1);
      const dBall = M.dist(ref.x, ref.z, ball.x, ball.z);
      sprint = dBall > 26; cap = dBall > 18 ? 7.4 : 5.6;
      if (ball.owner && ball.owner.team !== 2) faceAt = ball;
      else faceAt = ball;
    } else if (st === 'whistle') {
      const f = match.lastFoul;
      if (f && f.offender && f.offender.onPitch !== false && match.t - (f.tRef || -99) < 8) {
        // faul yerine koş, ihlali yapan oyuncunun 1.8 m önünde dur
        const o = f.offender; const d = M.dist(ref.x, ref.z, o.x, o.z);
        const n = d > 1e-3 ? { x: (ref.x - o.x) / d, z: (ref.z - o.z) / d } : { x: 1, z: 0 };
        tx = o.x + n.x * 1.8; tz = o.z + n.z * 1.8; cap = 6.5; arrive = 1.0; sprint = d > 14; faceAt = o;
      } else { tx = ball.x - 3; tz = ball.z + 3; cap = 4; faceAt = ball; }
    } else if (st === 'goal') {
      // gol: orta noktaya doğru koşarak işaret eder
      tx = 0; tz = ref.z > 0 ? 4 : -4; cap = 5.5; faceAt = { x: 0, z: 0 };
    } else if (st === 'var') {
      tx = ref.x; tz = ref.z; faceAt = { x: ref.x, z: ref.z - 5 }; // ana tribüne (kameraya) dönük: kulaklık dinler
    } else if ((st === 'setup' || st === 'ready') && r) {
      const dir = match.dirOf(r.team); const goal = P.goalCenter(dir);
      if (r.type === 'penalty') { tx = goal.x - dir * 16.5; tz = 6 * (ref.z >= 0 ? 1 : -1); faceAt = { x: r.x, z: r.z }; }
      else if (r.type === 'corner') { tx = goal.x - dir * 15; tz = -Math.sign(r.z || 1) * 8; faceAt = { x: r.x, z: r.z }; }
      else if (r.type === 'kickoff') { tx = -dir * 3; tz = -10; faceAt = { x: 0, z: 0 }; }
      else if (r.type === 'freekick') { const dg = M.dist(r.x, r.z, goal.x, goal.z); tx = dg < 30 ? r.x + dir * 4 : r.x - dir * 6; tz = r.z + (r.z > 0 ? -7 : 7); faceAt = { x: r.x, z: r.z }; }
      else { tx = r.x - dir * 8; tz = r.z * 0.5 + (r.z > 0 ? -8 : 8); faceAt = { x: r.x, z: r.z }; }
      cap = 5.2;
    } else { tx = ref.x; tz = ref.z; }
    tx = M.clamp(tx, -P.halfL + 1, P.halfL - 1); tz = M.clamp(tz, -P.halfW + 1, P.halfW - 1);
    const t2 = st === 'play' || st === 'whistle' ? avoid(match, ref, tx, tz) : { x: tx, z: tz };
    const dRef = M.dist(ref.x, ref.z, t2.x, t2.z);
    if (dRef > 0.6) A.moveToward(ref, t2.x, t2.z, sprint, dt, { speedCap: cap, arrive });
    else { A.stop(ref, dt); if (faceAt) { const want = Math.atan2(faceAt.z - ref.z, faceAt.x - ref.x); ref.facing += M.angleDiff(ref.facing, want) * Math.min(1, dt * 6); } }
    ref.stamina = 1;

    /* ---------- 4. hakem: yerinde durur, sahaya bakar; değişiklikte giren oyuncuya döner ---------- */
    const f4 = off.fourth;
    if (f4) {
      const waiting = match.allOnPitch().find((q) => q.enterWait > 0);
      const fx = waiting ? M.clamp(waiting.x - Math.sign(waiting.x || 1) * 1.6, -4, 4) : 0;
      if (Math.abs(f4.x - fx) > 0.3) A.moveToward(f4, fx, f4.z, false, dt, { speedCap: 1.6, arrive: 0.6 }); else A.stop(f4, dt);
      f4.facing = Math.PI / 2; f4.lockFacing = true; f4.stamina = 1;
    }

    /* ---------- yardımcı hakemler ---------- */
    for (const ar of off.assistants) {
      const zLine = ar.side * (P.halfW + 0.9);
      let ax;
      {
        // bu yarıya hücum eden takım: dir === halfSign
        const attTeam = match.dirOf(0) === ar.halfSign ? 0 : 1;
        const lineAX = AI.offsideLineAX(match, attTeam); // hücum ekseninde (0 = orta çizgi)
        ax = M.clamp(lineAX * ar.halfSign, Math.min(0, ar.halfSign * P.halfL), Math.max(0, ar.halfSign * P.halfL));
        if (st === 'setup' || st === 'ready') { if (r && r.type === 'corner' && Math.sign(r.x) === ar.halfSign) ax = ar.halfSign * (P.halfL - 0.5); }
        ar.z += (zLine - ar.z) * Math.min(1, dt * 3);
      }
      const d = Math.abs(ax - ar.x);
      if (d > 0.4) A.moveToward(ar, ax, ar.z, d > 12, dt, { speedCap: d > 6 ? 7.2 : 4.5, arrive: 1.0 });
      else A.stop(ar, dt);
      // sahaya dönük yan koşu: yüz her zaman saha içine
      ar.facing = ar.side > 0 ? -Math.PI / 2 : Math.PI / 2;
      ar.lockFacing = true; ar.stamina = 1;
    }
  };

  /* Olay tetikleyicileri (match.js çağırır) */
  O.onFoulWhistle = function (match, foul) { const ref = match.referee; if (!ref) return; ref.whistleT = 1.2; ref.pointT = 1.6; ref.pointDir = match.dirOf(foul.victim.team); foul.tRef = match.t; match.lastFoul = foul; };
  O.onCard = function (match, card) { const ref = match.referee; if (!ref) return; ref.cardT = card === 'red' ? 3.0 : 2.4; ref.cardTotal = ref.cardT; ref.cardColor = card; };
  O.onOffside = function (match, p) { if (!match.assistants) return; const dir = match.dirOf(p.team); const ar = match.assistants.find((a) => a.halfSign === dir) || match.assistants[0]; ar.flagT = 3.2; if (match.referee) { match.referee.whistleT = 1.0; } };
  O.onThrowIn = function (match, x, z, team) { if (!match.assistants) return; const ar = match.assistants.find((a) => Math.sign(x || 1) === a.halfSign) || match.assistants[0]; ar.flagT = 2.2; };
  O.onGoal = function (match) { const ref = match.referee; if (!ref) return; ref.pointT = 2.0; ref.pointDir = 0; ref.signalT = 2.0; ref.signalKind = 'goal'; };
  O.onVarCheck = function (match) { const ref = match.referee; if (!ref) return; ref.earT = 7.0; ref.signalT = 0; };
  O.onVarDecision = function (match, decision) { const ref = match.referee; if (!ref) return; ref.earT = 0; ref.signalT = 3.0; ref.signalKind = decision === 'nogoal' ? 'nogoal' : 'goal'; if (decision !== 'nogoal') { ref.pointT = 2.5; ref.pointDir = 0; } };
  O.onAdvantage = function (match) { const ref = match.referee; if (!ref) return; ref.signalT = 1.8; ref.signalKind = 'advantage'; };
})(typeof window !== 'undefined' ? window : globalThis);
