/* Taktik sistemi
   - Takım başına taktik durumu: diziliş, savunma hattı, pres, tempo, genişlik, mentalite, talimatlar
   - Ön ayarlar (otobüs / savunma / dengeli / hücum / topyekûn)
   - Maç içinde diziliş değiştirme: oyuncular yeni slotlara mevki uyumuna göre yeniden dağıtılır
   - Otomatik teknik direktör: skor + dakika + eksik oyuncu durumuna göre taktik/diziliş değişikliği (duraklamalarda)
   - Son dakikalarda kalecinin kornere çıkması (gkUp)
   Okuyucular: ai.js (updateTeamShape, karar), match.js (top tutma süresi, korner), tactics_ui.js (panel) */
(function (root) {
  const FS = (root.FS = root.FS || {});
  const M = FS.M;
  const T = (FS.Tactics = {});

  /* ---- Ek dizilişler (hücum uzayı; ai.js rol sınıflarına göre yerleştirir) ---- */
  const F = FS.FORMATIONS;
  F['4-4-2'] = [
    { role: 'GK', x: -49, z: 0 },
    { role: 'RB', x: -30, z: 23 }, { role: 'CB', x: -33, z: 8 }, { role: 'CB', x: -33, z: -8 }, { role: 'LB', x: -30, z: -23 },
    { role: 'CM', x: -12, z: 22 }, { role: 'CM', x: -16, z: 7 }, { role: 'CM', x: -16, z: -7 }, { role: 'CM', x: -12, z: -22 },
    { role: 'ST', x: 10, z: 7 }, { role: 'ST', x: 10, z: -7 },
  ];
  F['4-1-4-1'] = [
    { role: 'GK', x: -49, z: 0 },
    { role: 'RB', x: -30, z: 23 }, { role: 'CB', x: -33, z: 8 }, { role: 'CB', x: -33, z: -8 }, { role: 'LB', x: -30, z: -23 },
    { role: 'DM', x: -20, z: 0 },
    { role: 'CM', x: -9, z: 22 }, { role: 'CM', x: -11, z: 7 }, { role: 'CM', x: -11, z: -7 }, { role: 'CM', x: -9, z: -22 },
    { role: 'ST', x: 10, z: 0 },
  ];
  F['5-3-2'] = [
    { role: 'GK', x: -49, z: 0 },
    { role: 'RB', x: -27, z: 25 }, { role: 'CB', x: -32, z: 13 }, { role: 'CB', x: -35, z: 0 }, { role: 'CB', x: -32, z: -13 }, { role: 'LB', x: -27, z: -25 },
    { role: 'CM', x: -12, z: 9 }, { role: 'DM', x: -19, z: 0 }, { role: 'CM', x: -12, z: -9 },
    { role: 'ST', x: 10, z: 6 }, { role: 'ST', x: 10, z: -6 },
  ];
  F['5-4-1'] = [
    { role: 'GK', x: -49, z: 0 },
    { role: 'RB', x: -27, z: 25 }, { role: 'CB', x: -32, z: 13 }, { role: 'CB', x: -35, z: 0 }, { role: 'CB', x: -32, z: -13 }, { role: 'LB', x: -27, z: -25 },
    { role: 'CM', x: -12, z: 20 }, { role: 'CM', x: -15, z: 6 }, { role: 'CM', x: -15, z: -6 }, { role: 'CM', x: -12, z: -20 },
    { role: 'ST', x: 10, z: 0 },
  ];
  F['3-4-3'] = [
    { role: 'GK', x: -49, z: 0 },
    { role: 'CB', x: -32, z: 13 }, { role: 'CB', x: -35, z: 0 }, { role: 'CB', x: -32, z: -13 },
    { role: 'RWB', x: -14, z: 27 }, { role: 'CM', x: -14, z: 8 }, { role: 'CM', x: -14, z: -8 }, { role: 'LWB', x: -14, z: -27 },
    { role: 'RW', x: 6, z: 22 }, { role: 'ST', x: 11, z: 0 }, { role: 'LW', x: 6, z: -22 },
  ];
  T.FORMATION_LIST = ['4-2-3-1', '4-3-3', '4-4-2', '4-1-4-1', '3-5-2', '3-4-3', '5-3-2', '5-4-1'];
  T.FORMATION_DESC = {
    '4-2-3-1': 'Çift pivot, serbest 10 numara', '4-3-3': 'Geniş kanatlar, yüksek pres', '4-4-2': 'Klasik iki forvet, düz orta saha',
    '4-1-4-1': 'Tek pivot, kompakt orta blok', '3-5-2': 'Kanat bekleri biner, ikili forvet', '3-4-3': 'Topyekûn hücum, riskli',
    '5-3-2': 'Beşli savunma, kontra', '5-4-1': 'Otobüs: iki hat, tek forvet',
  };

  /* ---- Ön ayarlar ---- */
  T.PRESETS = {
    parkBus: { label: 'Otobüs', icon: 'shield', line: 0.12, press: 0.15, tempo: 0.35, width: 0.4, mentality: 0.25, desc: 'Alçak blok, herkes topun gerisinde, zaman yönetimi' },
    defensive: { label: 'Savunma', icon: 'shield-half', line: 0.3, press: 0.35, tempo: 0.45, width: 0.45, mentality: 0.4, desc: 'Orta-alçak blok, sabırlı, kontra fırsatı' },
    balanced: { label: 'Dengeli', icon: 'scale', line: 0.5, press: 0.5, tempo: 0.5, width: 0.5, mentality: null, desc: 'Takımın doğal oyun planı' },
    attacking: { label: 'Hücum', icon: 'swords', line: 0.7, press: 0.72, tempo: 0.7, width: 0.62, mentality: 0.72, desc: 'Yüksek hat, yoğun pres, hızlı oyun' },
    allOut: { label: 'Topyekûn', icon: 'zap', line: 0.9, press: 0.9, tempo: 0.88, width: 0.7, mentality: 0.92, desc: 'Her şey hücuma: son dakika baskısı' },
  };
  T.PRESET_LIST = ['parkBus', 'defensive', 'balanced', 'attacking', 'allOut'];
  T.INSTRUCTIONS = {
    overlap: { label: 'Bekler biner', desc: 'Top bizdeyken bekler kanattan bindirme yapar (arkada boşluk riski)' },
    cutInside: { label: 'Kanatlar içe kat eder', desc: 'Kanat oyuncuları ceza sahasına doğru içe kayar; genişliği bekler verir' },
    longBall: { label: 'Uzun top', desc: 'Kaleci ve savunma ileriye uzun oynar, oyun kurma atlanır' },
    counter: { label: 'Hızlı kontra', desc: 'Top kazanılınca forvetler hemen derinlik koşusuna çıkar' },
    gkUp: { label: 'Kaleci kornere çıkar', desc: '88. dakikadan sonra 1 fark gerideyken kaleci rakip ceza sahasına gelir' },
  };

  /* ---- Mevki uyumu (slot rolü → oyuncunun doğal mevkisi) ---- */
  const FIT = {
    GK: { GK: 10 },
    CB: { CB: 10, DM: 6, RB: 5, LB: 5, RWB: 4, LWB: 4, CM: 3 },
    RB: { RB: 10, RWB: 9, LB: 6, LWB: 5, CB: 5, RW: 4, CM: 3, DM: 3 },
    LB: { LB: 10, LWB: 9, RB: 6, RWB: 5, CB: 5, LW: 4, CM: 3, DM: 3 },
    RWB: { RWB: 10, RB: 9, RW: 7, LWB: 6, LB: 5, CM: 4, AM: 3 },
    LWB: { LWB: 10, LB: 9, LW: 7, RWB: 6, RB: 5, CM: 4, AM: 3 },
    DM: { DM: 10, CM: 8, CB: 6, AM: 4, RB: 3, LB: 3 },
    CM: { CM: 10, DM: 8, AM: 8, RW: 4, LW: 4, ST: 3, RB: 3, LB: 3, RWB: 3, LWB: 3, CB: 2 },
    AM: { AM: 10, CM: 8, RW: 7, LW: 7, ST: 6, DM: 4 },
    RW: { RW: 10, LW: 8, AM: 7, ST: 6, RWB: 5, RB: 4, CM: 4 },
    LW: { LW: 10, RW: 8, AM: 7, ST: 6, LWB: 5, LB: 4, CM: 4 },
    ST: { ST: 10, RW: 7, LW: 7, AM: 6, CM: 3 },
  };
  T.fit = (slotRole, pos) => (FIT[slotRole] && FIT[slotRole][pos]) || 0;

  /* ---- Takım taktik durumu ---- */
  T.ensure = function (team) {
    if (team.tactics) return team.tactics;
    const t = (team.tactics = {
      preset: 'balanced', formation: team.formation, baseFormation: team.formation, baseMentality: team.mentality,
      line: 0.5, press: 0.5, tempo: 0.5, width: 0.5, mentality: team.mentality,
      instr: { overlap: true, cutInside: false, longBall: false, counter: true, gkUp: true },
      auto: true, lastAutoMin: -99, log: [],
    });
    // takımın doğal karakteri: hücumcu kulüpler yüksek hat/pres, savunmacılar daha derin
    const m = team.mentality;
    t.line = M.clamp(0.5 + (m - 0.55) * 1.2, 0.3, 0.7); t.press = M.clamp(0.5 + (m - 0.55) * 1.5, 0.3, 0.75); t.tempo = M.clamp(0.5 + (m - 0.55), 0.35, 0.65);
    return t;
  };

  T.applyPreset = function (team, key) {
    const t = T.ensure(team); const p = T.PRESETS[key]; if (!p) return;
    t.preset = key; t.line = p.line; t.press = p.press; t.tempo = p.tempo; t.width = p.width;
    t.mentality = p.mentality != null ? p.mentality : t.baseMentality;
    team.mentality = t.mentality;
  };
  T.set = function (team, key, val) {
    const t = T.ensure(team);
    if (key === 'mentality') { t.mentality = val; team.mentality = val; } else t[key] = val;
    t.preset = 'custom';
  };
  T.setInstruction = function (team, key, on) { const t = T.ensure(team); t.instr[key] = !!on; };

  /* ---- Diziliş değişikliği: oyuncuları yeni slotlara dağıt ---- */
  T.setFormation = function (match, team, name) {
    const slots = F[name]; if (!slots) return false;
    const t = T.ensure(team);
    const players = team.players.filter((p) => p.onPitch && !p.red);
    const dir = match ? match.dirOf(team.index) : 1;
    // aday çiftleri puanla: doğal mevki uyumu + mevcut rol + aynı taraf (sol/sağ) + güç
    const pairs = [];
    slots.forEach((s, si) => {
      for (const p of players) {
        let sc;
        if (s.role === 'GK') sc = p.role === 'GK' ? 100 : -1e9;
        else if (p.role === 'GK') sc = -1e9;
        else {
          sc = T.fit(s.role, p.pos) + (p.role === s.role ? 1.5 : 0) + p.attrs.overall / 100;
          const hz = p.homeZ != null ? -p.homeZ * dir : 0; // hücum uzayında z (sağ +)
          if (Math.abs(s.z) > 6 && Math.abs(hz) > 6) sc += Math.sign(s.z) === Math.sign(hz) ? 0.6 : -0.6;
          if (s.role === 'CB' || s.role === 'RB' || s.role === 'LB' || s.role === 'DM') sc += 0.3; // eksik oyuncuda savunma slotları öncelikli dolar
        }
        if (sc > -1e8) pairs.push({ si, p, sc });
      }
    });
    pairs.sort((a, b) => b.sc - a.sc);
    const usedS = new Set(), usedP = new Set(), assign = [];
    for (const pr of pairs) {
      if (usedS.has(pr.si) || usedP.has(pr.p)) continue;
      usedS.add(pr.si); usedP.add(pr.p); assign.push(pr);
    }
    team.slots = slots.map((s) => Object.assign({}, s));
    team.formation = name; t.formation = name;
    for (const a of assign) {
      const p = a.p, s = slots[a.si];
      p.slot = a.si;
      if (p.role !== s.role) {
        if (p.baseOverall == null) p.baseOverall = p.attrs.overall;
        const fit = T.fit(s.role, p.pos);
        const pen = fit >= 10 ? 0 : fit >= 7 ? 1 : fit >= 5 ? 3 : 6; // mevki dışı oynama cezası
        p.role = s.role;
        p.attrs = FS.buildAttributes(p.name, s.role, Math.max(40, p.baseOverall - pen));
        p.maxSpeed = 6.6 + (p.attrs.pace / 99) * 3.0; p.accel = 5.5 + (p.attrs.acc / 99) * 4.5;
      }
      p.supportTgt = null; p.markTgt = null; p.runTimer = 0; p.homeTeamPoss = null;
    }
    return true;
  };

  /* ---- Otomatik teknik direktör ---- */
  const DEF_VARIANT = { '4-2-3-1': '5-4-1', '4-3-3': '5-4-1', '4-4-2': '5-4-1', '4-1-4-1': '5-4-1', '3-5-2': '5-3-2', '3-4-3': '5-3-2', '5-3-2': '5-4-1', '5-4-1': '5-4-1' };
  const ATT_VARIANT = { '4-2-3-1': '3-4-3', '4-3-3': '3-4-3', '4-4-2': '3-4-3', '4-1-4-1': '3-4-3', '3-5-2': '3-4-3', '3-4-3': '3-4-3', '5-3-2': '3-5-2', '5-4-1': '4-4-2' };

  T.decide = function (match, team) {
    const t = T.ensure(team);
    const opp = match.teams[1 - team.index];
    const diff = team.score - opp.score;
    const min = match.clock / 60;
    const men = match.playersOnPitch(team.index).length - match.playersOnPitch(opp.index).length;
    let preset = 'balanced', formation = t.baseFormation;
    if (diff > 0) {
      if (min > 84) { preset = 'parkBus'; if (diff === 1) formation = DEF_VARIANT[t.baseFormation] || t.baseFormation; }
      else if (min > 70) preset = 'defensive';
    } else if (diff < 0) {
      if (min > 86 && diff >= -2) { preset = 'allOut'; formation = ATT_VARIANT[t.baseFormation] || t.baseFormation; }
      else if (min > 72) preset = 'attacking';
      else if (min > 55 && diff <= -2) preset = 'attacking';
    }
    if (men < 0) { // eksik: kompakt kal (gerideyken 80'e kadar dengeli, sonra yine risk)
      if (diff > 0) preset = 'parkBus';
      else if (diff === 0) preset = 'defensive';
      else if (min < 80) preset = 'balanced';
    } else if (men > 0 && diff <= 0 && min > 60) preset = diff < 0 ? 'attacking' : 'attacking'; // fazla oyuncu: baskı
    return { preset, formation };
  };

  /* Duraklamalarda çağrılır (match.js): en az 3 maç dakikası arayla karar; değişiklik varsa uygular ve olay yayar */
  T.autoUpdate = function (match, team) {
    const t = T.ensure(team);
    if (!t.auto) return;
    const min = match.clock / 60;
    if (min - t.lastAutoMin < 3) return;
    t.lastAutoMin = min;
    const d = T.decide(match, team);
    const changedPreset = d.preset !== t.preset;
    const changedForm = d.formation !== t.formation;
    if (!changedPreset && !changedForm) return;
    if (changedPreset) T.applyPreset(team, d.preset);
    if (changedForm) T.setFormation(match, team, d.formation);
    t.log.push({ min: Math.floor(min), preset: d.preset, formation: d.formation });
    match.emit('tactics', { team: team.index, preset: d.preset, formation: d.formation, changedFormation: changedForm, changedPreset, auto: true, minute: match.minuteLabel ? match.minuteLabel() : '' });
  };

  /* Kaleci kornere çıkar mı? (talimat açık, 88+ dk, 1 fark geride) */
  T.gkUp = function (match, team) {
    const t = T.ensure(team);
    if (!t.instr.gkUp) return false;
    const diff = team.score - match.teams[1 - team.index].score;
    return match.half === 2 && match.clock / 60 >= 88 && diff === -1;
  };

  /* Panel / spiker metni */
  T.describe = function (team) {
    const t = T.ensure(team);
    const p = T.PRESETS[t.preset];
    return `${t.formation} · ${p ? p.label : 'Özel'}`;
  };
  T.presetText = function (key, formation) {
    const map = { parkBus: 'otobüsü park ediyor', defensive: 'savunmaya çekiliyor', balanced: 'dengeli oyuna dönüyor', attacking: 'hücuma ağırlık veriyor', allOut: 'topyekûn hücuma kalkıyor' };
    return (map[key] || 'taktik değiştiriyor') + (formation ? ' (' + formation + ')' : '');
  };
})(typeof window !== 'undefined' ? window : globalThis);
