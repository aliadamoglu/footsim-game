/* Varlıklar: formasyonlar, oyuncu özellikleri, takım/oyuncu fabrikaları */
(function (root) {
  const FS = (root.FS = root.FS || {});
  const M = FS.M;

  // Formasyon slotları: hücum-uzayı koordinatları (metre).
  // x: -52.5 (kendi kalesi) .. +52.5 (rakip kale), z: - sol / + sağ (hücum yönüne göre)
  FS.FORMATIONS = {
    '4-2-3-1': [
      { role: 'GK', x: -49, z: 0 },
      { role: 'RB', x: -30, z: 23 }, { role: 'CB', x: -33, z: 8 }, { role: 'CB', x: -33, z: -8 }, { role: 'LB', x: -30, z: -23 },
      { role: 'DM', x: -17, z: 7 }, { role: 'DM', x: -17, z: -7 },
      { role: 'RW', x: -2, z: 25 }, { role: 'AM', x: -4, z: 0 }, { role: 'LW', x: -2, z: -25 },
      { role: 'ST', x: 10, z: 0 },
    ],
    '4-3-3': [
      { role: 'GK', x: -49, z: 0 },
      { role: 'RB', x: -30, z: 23 }, { role: 'CB', x: -33, z: 8 }, { role: 'CB', x: -33, z: -8 }, { role: 'LB', x: -30, z: -23 },
      { role: 'CM', x: -10, z: 12 }, { role: 'DM', x: -19, z: 0 }, { role: 'CM', x: -10, z: -12 },
      { role: 'RW', x: 4, z: 25 }, { role: 'ST', x: 10, z: 0 }, { role: 'LW', x: 4, z: -25 },
    ],
    '3-5-2': [
      { role: 'GK', x: -49, z: 0 },
      { role: 'CB', x: -32, z: 13 }, { role: 'CB', x: -35, z: 0 }, { role: 'CB', x: -32, z: -13 },
      { role: 'RWB', x: -14, z: 27 }, { role: 'CM', x: -12, z: 10 }, { role: 'DM', x: -20, z: 0 }, { role: 'CM', x: -12, z: -10 }, { role: 'LWB', x: -14, z: -27 },
      { role: 'ST', x: 10, z: 7 }, { role: 'ST', x: 10, z: -7 },
    ],
  };

  // Mevkiye göre özellik profilleri (genel güce göre sapmalar)
  const PROFILES = {
    GK: { pace: -25, acc: -20, pass: -18, shoot: -45, drib: -35, tackle: -30, str: 0, stam: -5, vision: -10, comp: 0, gk: 0 },
    CB: { pace: -8, acc: -8, pass: -10, shoot: -25, drib: -18, tackle: 6, str: 8, stam: 0, vision: -10, comp: 0, gk: -60 },
    RB: { pace: 4, acc: 3, pass: -4, shoot: -20, drib: -6, tackle: 2, str: -4, stam: 6, vision: -6, comp: -2, gk: -60 },
    LB: { pace: 4, acc: 3, pass: -4, shoot: -20, drib: -6, tackle: 2, str: -4, stam: 6, vision: -6, comp: -2, gk: -60 },
    RWB: { pace: 6, acc: 5, pass: -2, shoot: -16, drib: -3, tackle: -2, str: -5, stam: 8, vision: -4, comp: -2, gk: -60 },
    LWB: { pace: 6, acc: 5, pass: -2, shoot: -16, drib: -3, tackle: -2, str: -5, stam: 8, vision: -4, comp: -2, gk: -60 },
    DM: { pace: -6, acc: -6, pass: 2, shoot: -14, drib: -6, tackle: 4, str: 4, stam: 4, vision: 2, comp: 2, gk: -60 },
    CM: { pace: -3, acc: -2, pass: 4, shoot: -8, drib: -2, tackle: -4, str: -2, stam: 5, vision: 4, comp: 2, gk: -60 },
    AM: { pace: 0, acc: 2, pass: 6, shoot: -2, drib: 5, tackle: -16, str: -8, stam: 0, vision: 7, comp: 3, gk: -60 },
    RW: { pace: 8, acc: 8, pass: -2, shoot: -3, drib: 7, tackle: -20, str: -10, stam: 0, vision: -1, comp: 0, gk: -60 },
    LW: { pace: 8, acc: 8, pass: -2, shoot: -3, drib: 7, tackle: -20, str: -10, stam: 0, vision: -1, comp: 0, gk: -60 },
    ST: { pace: 3, acc: 4, pass: -8, shoot: 8, drib: 0, tackle: -24, str: 4, stam: -2, vision: -4, comp: 4, gk: -60 },
  };

  FS.buildAttributes = function (name, role, overall) {
    const prof = PROFILES[role] || PROFILES.CM;
    const j = (k) => (M.hashRand(name, k) - 0.5) * 8; // ±4 deterministik sapma
    const a = (k, d) => M.clamp(overall + d + j(k), 30, 99);
    return {
      overall,
      pace: a('pace', prof.pace),
      acc: a('acc', prof.acc),
      pass: a('pass', prof.pass),
      shoot: a('shoot', prof.shoot),
      drib: a('drib', prof.drib),
      tackle: a('tackle', prof.tackle),
      str: a('str', prof.str),
      stam: a('stam', prof.stam),
      vision: a('vision', prof.vision),
      comp: a('comp', prof.comp),
      gk: role === 'GK' ? M.clamp(overall + j('gk'), 40, 99) : 25,
      agi: a('agi', (prof.acc + prof.drib) / 2), // çeviklik: dönüş hızı / ilk adım
      aggression: M.clamp(50 + (M.hashRand(name, 'agg') - 0.5) * 50 + (role === 'CB' || role === 'DM' ? 10 : 0), 20, 95),
      // hız (m/s): 6.5 .. 9.6 (sprint), FIFA'daki 99 pace ≈ 9.6 m/s
      // aşağıda türetilir
    };
  };

  let _pid = 1;
  FS.createPlayer = function (teamIndex, def, slotIndex, slot, isSub) {
    const [number, name, pos, overall] = def;
    const role = slot ? slot.role : pos;
    const attrs = FS.buildAttributes(name, role, overall);
    const p = {
      id: _pid++,
      team: teamIndex,
      number,
      name,
      shortName: FS.shortName(name),
      pos, // doğal mevki
      role, // sahadaki görev (slot)
      slot: slotIndex,
      attrs,
      maxSpeed: 6.6 + (attrs.pace / 99) * 3.0, // m/s
      accel: 5.5 + (attrs.acc / 99) * 4.5, // m/s^2
      // dinamik durum
      x: 0, z: 0, y: 0,
      vx: 0, vz: 0,
      facing: 0, // radyan, +x = 0
      speed: 0,
      stamina: 1,
      fatigue: 0,
      state: 'idle',
      hasBall: false,
      onPitch: !isSub,
      isSub: !!isSub,
      yellow: 0,
      red: false,
      subbedOff: false,
      enterWait: 0, // değişiklikte çizgide bekleme süresi
      protestT: 0, // faul sonrası itiraz jesti
      walkTo: null, // saha dışına yürüyüş hedefi
      hidden: false, // tünele girdi (görünmez)
      // eylem zamanlayıcıları
      kickCd: 0, // topa tekrar dokunma bekleme
      tackleCd: 0,
      tackleT: 0, // aktif kayma süresi
      fallT: 0, // yerde kalma süresi
      stunT: 0, // sersemleme süresi
      injured: false,
      lockFacing: false,
      runTimer: 0,
      runVec: null,
      wantSprint: false,
      tackleDir: 0,
      decisionT: 0,
      firstTouchT: 0,
      intent: null,
      kickAnim: 0,
      diveT: 0, diveDir: { z: 0, y: 0 }, diveTotal: 0,
      celebrateT: 0,
      holdT: 0, // kaleci elde tutma süresi
      holding: false,
      offsideFlag: false,
      targetX: 0, targetZ: 0,
      wantSprint: false,
      runTimer: 0, runVec: null,
      stats: { goals: 0, assists: 0, shots: 0, shotsOn: 0, passes: 0, passesOk: 0, tackles: 0, fouls: 0, saves: 0, dist: 0, touches: 0 },
      lastTouchT: -99,
      // görselleştirme yardımcıları (renderer doldurur)
      view: null,
    };
    return p;
  };

  const SHORT_OVERRIDE = { 'Vinícius Júnior': 'Vinícius', 'Alisson Becker': 'Alisson', 'Kim Min-jae': 'Kim Min-jae', 'Oh Hyeon-gyu': 'Hyeon-gyu' };
  const PARTICLES = ['de', 'di', 'da', 'van', 'von', 'mac', 'dos', 'del', 'der', 'le', 'la'];
  FS.shortName = function (name) {
    if (SHORT_OVERRIDE[name]) return SHORT_OVERRIDE[name];
    const parts = name.replace(/'/g, '’').split(' ');
    if (parts.length === 1) return name;
    // Türk isimlerinde soyadı, yabancılarda son kelime; "De Bruyne", "Van Dijk", "Mac Allister" gibi parçacıklı soyadları korunur
    const last = parts[parts.length - 1];
    if (last.length <= 3 && parts.length > 2) return parts[parts.length - 2] + ' ' + last;
    if (parts.length > 2 && PARTICLES.includes(parts[parts.length - 2].toLowerCase())) return parts[parts.length - 2] + ' ' + last;
    return last;
  };

  FS.createTeam = function (teamIndex, def, opts) {
    const formationName = def.formation;
    const slots = FS.FORMATIONS[formationName];
    const players = def.xi.map((d, i) => FS.createPlayer(teamIndex, d, i, slots[i], false));
    const subs = def.bench.map((d, i) => FS.createPlayer(teamIndex, d, -1, null, true));
    const kitKey = opts && opts.kit ? opts.kit : 'home';
    return {
      index: teamIndex,
      id: def.id,
      name: def.name,
      short: def.short,
      def,
      formation: formationName,
      slots: slots.map((s) => Object.assign({}, s)),
      players,
      subs,
      kit: def.kits[kitKey],
      gkKit: def.kits.gk,
      kitKey,
      mentality: def.mentality,
      subsUsed: 0,
      subWindows: 0,
      score: 0,
      stats: { possessionT: 0, shots: 0, shotsOn: 0, corners: 0, fouls: 0, offsides: 0, yellows: 0, reds: 0, passes: 0, passesOk: 0, saves: 0, xg: 0 },
      controlled: opts && opts.human,
      rating: Math.round(def.xi.reduce((a, d) => a + d[3], 0) / def.xi.length),
    };
  };

  FS.teamPlayersOnPitch = (team) => team.players.filter((p) => p.onPitch && !p.red);
  FS.teamGK = (team) => team.players.find((p) => p.role === 'GK' && p.onPitch && !p.red);

  // Formasyon slotunu dünya koordinatına çevir
  FS.slotToWorld = function (slot, dir) {
    return { x: slot.x * dir, z: -slot.z * dir };
  };
})(typeof window !== 'undefined' ? window : globalThis);
