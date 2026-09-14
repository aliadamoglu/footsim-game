/* =====================================================================
   FOOTSIM — Transfer & Bütçe sistemi
   - Her kulübün transfer bütçesi (M€) ve maaş bütçesi (M€/yıl)
   - Oyuncu piyasa değeri: güç × yaş eğrisi × mevki çarpanı × kulüp prestiji
   - Teklif / pazarlık: satıcı kulüp "istenen bedel" belirler; oyuncu maaş ister;
     teklif kabul / ret / karşı teklif (deterministik RNG'li)
   - Serbest oyuncu havuzu (bedelsiz, sadece maaş)
   - Satış: piyasa değerinin altında hızlı satış, veya "listeye koy" → gelen teklifler
   - Kadro kuralları: 11 ilk on bir + en fazla 9 yedek (en az 1 GK yedek), toplam ≤ 23; ilk 11'de 1 GK
   - Kalıcılık: localStorage ('footsim.save.v1'); FS.Transfer.reset() ile sıfırlanır
   ===================================================================== */
(function (root) {
  const FS = (root.FS = root.FS || {});
  const M = FS.M;
  const T = (FS.Transfer = {});
  const SAVE_KEY = 'footsim.save.v1';

  /* ---------------- Kulüp finansları (M€) ---------------- */
  // transfer bütçesi, yıllık maaş tavanı, prestij (0-1: satıcıdan istenen fiyat ve oyuncunun gelme isteği)
  T.CLUB_FINANCE = {
    GS: { budget: 60, wageCap: 95, prestige: 0.62 },
    FB: { budget: 55, wageCap: 90, prestige: 0.58 },
    BJK: { budget: 40, wageCap: 70, prestige: 0.52 },
    TS: { budget: 30, wageCap: 55, prestige: 0.45 },
    RMA: { budget: 180, wageCap: 420, prestige: 1.0 },
    BAR: { budget: 90, wageCap: 330, prestige: 0.95 },
    MCI: { budget: 200, wageCap: 400, prestige: 0.93 },
    LIV: { budget: 160, wageCap: 330, prestige: 0.92 },
    ARS: { budget: 150, wageCap: 300, prestige: 0.88 },
    BAY: { budget: 130, wageCap: 320, prestige: 0.92 },
    PSG: { budget: 190, wageCap: 380, prestige: 0.9 },
    INT: { budget: 70, wageCap: 200, prestige: 0.84 },
  };

  // Yaş: veri setinde yok → isimden deterministik (22-34) üretilir; bilinen yıldızlar için tablo
  const KNOWN_AGE = {
    'Victor Osimhen': 27, 'Leroy Sané': 30, 'İlkay Gündoğan': 35, 'Rafael Leão': 27, 'Lucas Torreira': 30, 'Uğurcan Çakır': 30,
    'Davinson Sánchez': 30, 'Mohamed Salah': 34, 'Ederson': 33, 'Romelu Lukaku': 33, "N'Golo Kanté": 35, 'Kylian Mbappé': 27, 'Vinícius Júnior': 26,
    'Jude Bellingham': 23, 'Lamine Yamal': 19, 'Robert Lewandowski': 38, 'Pedri': 23, 'Erling Haaland': 26, 'Rodri': 30, 'Florian Wirtz': 23,
    'Alexander Isak': 27, 'Bukayo Saka': 25, 'Viktor Gyökeres': 28, 'Harry Kane': 33, 'Jamal Musiala': 23, 'Ousmane Dembélé': 29,
    'Désiré Doué': 21, 'Lautaro Martínez': 29, 'Marcus Thuram': 29, 'Thibaut Courtois': 34, 'Gianluigi Donnarumma': 27, 'Alisson': 34,
    'Marc-André ter Stegen': 34, 'Manuel Neuer': 40, 'Yann Sommer': 37, 'Dušan Vlahović': 26, 'Leandro Trossard': 31, 'Marco Asensio': 30,
    'Youssef En-Nesyri': 29, 'Ciro Immobile': 36, 'Kerem Aktürkoğlu': 27, 'Barış Alper Yılmaz': 26, 'Arda Güler': 21, 'Kenan Yıldız': 21,
    'Semih Kılıçsoy': 21, 'Cole Palmer': 24, 'Declan Rice': 27, 'Martin Ødegaard': 27, 'Federico Valverde': 28, 'Joshua Kimmich': 31,
    'Michael Olise': 24, 'Achraf Hakimi': 27, 'Nicolò Barella': 29, 'Hakan Çalhanoğlu': 32, 'Alessandro Bastoni': 27,
    // serbest oyuncu havuzu
    'Sergio Ramos': 40, 'Kevin De Bruyne': 35, 'Ángel Di María': 38, 'Memphis Depay': 32, 'Christian Eriksen': 34, 'Jesús Navas': 40, 'Thomas Müller': 37,
    'Keylor Navas': 39, 'Toni Kroos': 36, 'Marco Reus': 37, 'Ivan Perišić': 37, 'Dominic Calvert-Lewin': 29, 'Emre Demir': 22, 'Yusuf Kaya': 24, 'Mert Aslan': 23, 'Deniz Er': 25, 'Arda Kızıl': 21,
  };
  T.ageOf = function (name) {
    if (KNOWN_AGE[name]) return KNOWN_AGE[name];
    if (FS.PLAYER_BORN && FS.PLAYER_BORN[name]) return M.clamp(2026 - FS.PLAYER_BORN[name], 16, 42);
    return 21 + Math.floor(M.hashRand(name, 'age') * 13); // 21..33
  };

  const POS_MUL = { GK: 0.8, CB: 0.95, RB: 0.9, LB: 0.9, RWB: 0.9, LWB: 0.9, DM: 1.0, CM: 1.05, AM: 1.15, RW: 1.2, LW: 1.2, ST: 1.25 };

  /* Piyasa değeri (M€). 99 güç ~ 200 M€, 80 ~ 25 M€, 70 ~ 6 M€. */
  T.marketValue = function (overall, age, pos) {
    const base = 0.9 * Math.exp((overall - 60) * 0.155); // 60→0.9, 70→4.3, 80→20, 85→43, 90→95, 95→205
    let ageF = 1;
    if (age <= 21) ageF = 1.35; else if (age <= 24) ageF = 1.25; else if (age <= 27) ageF = 1.1; else if (age <= 29) ageF = 1.0;
    else if (age <= 31) ageF = 0.75; else if (age <= 33) ageF = 0.5; else ageF = 0.3;
    const v = base * ageF * (POS_MUL[pos] || 1);
    return Math.max(0.3, Math.round(v * 10) / 10);
  };
  /* Yıllık maaş talebi (M€/yıl) */
  T.wageOf = function (overall, age, prestige) {
    const base = 0.4 * Math.exp((overall - 60) * 0.12); // 80→4.4, 85→8, 90→14.6, 95→26
    const ageF = age >= 32 ? 0.8 : 1;
    return Math.max(0.2, Math.round(base * ageF * (0.85 + 0.3 * (prestige || 0.5)) * 10) / 10);
  };

  /* ---------------- Kayıt / durum ---------------- */
  // state: { budgets: {GS: {budget, wageCap}}, squads: {GS: {xi: [...], bench: [...]}}, freeAgents: [...], history: [...], season: '2026-27' }
  T.state = null;

  /* Elle tanımlanmamış kulüpler için finans: ilk 11 gücü + ŞL torbası + lig ölçeğinden türetilir */
  T.financeOf = function (t) {
    if (T.CLUB_FINANCE[t.id]) return Object.assign({}, T.CLUB_FINANCE[t.id]);
    const ovr = t.xi.reduce((a, d) => a + d[3], 0) / Math.max(1, t.xi.length);
    const big5 = ['Premier League', 'LaLiga', 'Bundesliga', 'Serie A', 'Ligue 1'].includes(t.league);
    const pot = t.uclPot || 5;
    const prestige = M.clamp(0.25 + (ovr - 66) * 0.03 + (t.uclPot ? (5 - pot) * 0.04 : 0) + (big5 ? 0.06 : 0), 0.2, 0.9);
    const budget = Math.round(8 + Math.max(0, ovr - 66) * (big5 ? 9 : 3.5) + (t.uclPot ? (5 - pot) * 12 : 0));
    const wageCap = Math.round(30 + Math.max(0, ovr - 64) * (big5 ? 16 : 6));
    return { budget, wageCap, prestige: Math.round(prestige * 100) / 100 };
  };
  T.defaultState = function () {
    const st = { version: 1, season: '2026-27', budgets: {}, squads: {}, freeAgents: [], history: [], week: 1 };
    for (const t of FS.TEAMS) {
      st.budgets[t.id] = T.financeOf(t);
      st.squads[t.id] = { xi: t.xi.map((d) => d.slice()), bench: t.bench.map((d) => d.slice()) };
      // Maaş tavanı: mevcut maaş yükünün üstünde 1-2 transferlik pay bırak (kadro verisine göre türetilir)
      const prestige = st.budgets[t.id].prestige;
      const bill = t.xi.concat(t.bench).reduce((a, d) => a + T.wageOf(d[3], T.ageOf(d[1]), prestige), 0);
      st.budgets[t.id].wageCap = Math.round(Math.max(st.budgets[t.id].wageCap, bill * 1.22 + 6));
    }
    // Serbest oyuncu havuzu (gerçekçi: sözleşmesi biten/tecrübeli isimler + kurgusal gençler)
    st.freeAgents = [
      [9, 'Sergio Ramos', 'CB', 74], [17, 'Kevin De Bruyne', 'AM', 84], [7, 'Ángel Di María', 'RW', 76], [11, 'Memphis Depay', 'ST', 76],
      [10, 'Christian Eriksen', 'CM', 76], [22, 'Jesús Navas', 'RB', 70], [25, 'Thomas Müller', 'AM', 77], [1, 'Keylor Navas', 'GK', 74],
      [8, 'Toni Kroos', 'CM', 82], [14, 'Marco Reus', 'AM', 75], [21, 'Ivan Perišić', 'LW', 75], [4, 'Dominic Calvert-Lewin', 'ST', 74],
      [30, 'Emre Demir', 'AM', 68], [27, 'Yusuf Kaya', 'LB', 66], [33, 'Mert Aslan', 'CB', 67], [13, 'Deniz Er', 'GK', 66], [19, 'Arda Kızıl', 'ST', 69],
    ];
    return st;
  };

  T.load = function () {
    try {
      const raw = root.localStorage && root.localStorage.getItem(SAVE_KEY);
      if (raw) {
        const st = JSON.parse(raw);
        if (st && st.version === 1 && st.squads) {
          // sonradan eklenen kulüpler (kayıt eskiyse) varsayılanlarıyla tamamlanır
          const def = T.defaultState(); let added = false;
          for (const id of Object.keys(def.squads)) if (!st.squads[id]) { st.squads[id] = def.squads[id]; st.budgets[id] = def.budgets[id]; added = true; }
          T.state = st; if (added) T.save(); return st;
        }
      }
    } catch (e) { /* özel mod / erişim yok */ }
    T.state = T.defaultState();
    return T.state;
  };
  T.save = function () { try { root.localStorage && root.localStorage.setItem(SAVE_KEY, JSON.stringify(T.state)); } catch (e) { /* yoksay */ } };
  T.reset = function () { T.state = T.defaultState(); T.save(); return T.state; };

  /* Takım tanımını (FS.TEAMS öğesi) kayıtlı kadroyla birleştirilmiş kopya olarak döndür */
  T.teamDef = function (id) {
    const base = FS.getTeam(id); if (!base) return null;
    const st = T.state || T.load();
    const sq = st.squads[id];
    if (!sq) return base;
    return Object.assign({}, base, { xi: sq.xi.map((d) => d.slice()), bench: sq.bench.map((d) => d.slice()) });
  };
  T.finance = function (id) { const st = T.state || T.load(); return st.budgets[id]; };

  /* Oyuncu satırı [no, isim, mevki, güç] → zengin nesne */
  T.enrich = function (row, clubId) {
    const [number, name, pos, overall] = row;
    const age = T.ageOf(name);
    const prestige = clubId ? (T.CLUB_FINANCE[clubId] || {}).prestige || 0.5 : 0.5;
    return { number, name, pos, overall, age, value: T.marketValue(overall, age, pos), wage: T.wageOf(overall, age, prestige), club: clubId || null, row };
  };
  T.squadOf = function (id) {
    const st = T.state || T.load(); const sq = st.squads[id];
    return { xi: sq.xi.map((r) => T.enrich(r, id)), bench: sq.bench.map((r) => T.enrich(r, id)) };
  };
  T.wageBill = function (id) {
    const s = T.squadOf(id);
    return Math.round(s.xi.concat(s.bench).reduce((a, p) => a + p.wage, 0) * 10) / 10;
  };
  T.squadSize = function (id) { const sq = (T.state || T.load()).squads[id]; return sq.xi.length + sq.bench.length; };

  /* ---------------- Pazar listesi ---------------- */
  // Tüm diğer kulüplerin oyuncuları + serbest oyuncular. Filtre: mevki, min güç, max fiyat.
  T.market = function (buyerId, filter) {
    const st = T.state || T.load();
    const f = filter || {};
    const out = [];
    for (const t of FS.TEAMS) {
      if (t.id === buyerId) continue;
      const sq = st.squads[t.id];
      sq.xi.forEach((r, i) => out.push(Object.assign(T.enrich(r, t.id), { starter: true, idx: i })));
      sq.bench.forEach((r, i) => out.push(Object.assign(T.enrich(r, t.id), { starter: false, idx: i })));
    }
    st.freeAgents.forEach((r, i) => out.push(Object.assign(T.enrich(r, null), { free: true, idx: i, value: 0 })));
    return out.filter((p) => {
      if (f.pos && f.pos !== 'ALL') { const g = T.posGroup(p.pos); if (f.pos !== p.pos && f.pos !== g) return false; }
      if (f.minOvr && p.overall < f.minOvr) return false;
      if (f.maxPrice != null && T.askingPrice(p, buyerId) > f.maxPrice) return false;
      if (f.q) { const q = f.q.toLowerCase(); if (!p.name.toLowerCase().includes(q) && !(p.club || 'serbest').toLowerCase().includes(q)) return false; }
      return true;
    }).map((p) => Object.assign(p, { asking: T.askingPrice(p, buyerId), wageAsk: T.wageAsk(p, buyerId) }));
  };
  T.posGroup = (pos) => (pos === 'GK' ? 'GK' : ['CB', 'RB', 'LB', 'RWB', 'LWB'].includes(pos) ? 'DEF' : ['DM', 'CM', 'AM'].includes(pos) ? 'MID' : 'ATT');

  /* Satıcının istediği bedel: değer × (ilk 11 ise +25%) × (satıcı prestiji yüksekse +) × (alıcı zenginse +) */
  T.askingPrice = function (p, buyerId) {
    if (p.free) return 0;
    const seller = T.CLUB_FINANCE[p.club] || { prestige: 0.5 };
    const buyer = T.CLUB_FINANCE[buyerId] || { prestige: 0.5, budget: 30 };
    let m = 1.0;
    if (p.starter) m += 0.25;
    if (p.overall >= 85) m += 0.2; // yıldız primi
    m += (seller.prestige - 0.5) * 0.3;
    m += buyer.budget > 120 ? 0.15 : 0;
    return Math.round(p.value * m * 10) / 10;
  };
  /* Oyuncunun alıcıdan maaş talebi: prestij düşükse daha yüksek maaş ister */
  T.wageAsk = function (p, buyerId) {
    const buyer = T.CLUB_FINANCE[buyerId] || { prestige: 0.5 };
    const base = T.wageOf(p.overall, p.age, 0.5);
    const m = 1 + (0.7 - buyer.prestige) * 0.6; // prestij 1.0 → 0.82×, 0.45 → 1.15×
    return Math.round(base * Math.max(0.75, m) * 10) / 10;
  };

  /* ---------------- Teklif / pazarlık ---------------- */
  // Alıcı: { fee, wage } önerir → sonuç { ok, reason, counter: {fee, wage}? }
  T.makeOffer = function (buyerId, p, offer) {
    const st = T.state || T.load();
    const fin = st.budgets[buyerId];
    const asking = T.askingPrice(p, buyerId), wageAsk = T.wageAsk(p, buyerId);
    const fee = Math.max(0, +offer.fee || 0), wage = Math.max(0, +offer.wage || 0);
    // kadro kuralı
    const size = T.squadSize(buyerId);
    if (size >= 23) return { ok: false, reason: 'Kadro dolu (23). Önce oyuncu sat.' };
    if (p.pos === 'GK') { const gks = T.squadOf(buyerId); if (gks.xi.concat(gks.bench).filter((x) => x.pos === 'GK').length >= 3) return { ok: false, reason: 'Kadroda zaten 3 kaleci var.' }; }
    if (fee > fin.budget) return { ok: false, reason: `Bütçe yetersiz: teklif ${fee} M€, bütçe ${fin.budget.toFixed(1)} M€.` };
    const bill = T.wageBill(buyerId);
    if (bill + wage > fin.wageCap) return { ok: false, reason: `Maaş tavanı aşılıyor: ${(bill + wage).toFixed(1)} / ${fin.wageCap} M€.` };
    // deterministik ama teklifle değişen rastgelelik
    const rnd = M.hashRand(p.name + buyerId, 'offer' + Math.round(fee * 10) + '_' + Math.round(wage * 10) + '_' + st.week);
    // kulüp kararı
    let clubOk = true, counterFee = null;
    if (!p.free) {
      const ratio = fee / Math.max(0.1, asking);
      const pAccept = M.clamp01((ratio - 0.8) / 0.25) * 0.95 + (p.starter ? -0.1 : 0.05); // 0.8×→0, 1.05×→~0.95
      clubOk = rnd < pAccept;
      if (!clubOk) counterFee = Math.round(Math.max(fee, asking * (0.95 + (1 - rnd) * 0.15)) * 10) / 10;
    }
    // oyuncu kararı
    const buyer = T.CLUB_FINANCE[buyerId] || { prestige: 0.5 };
    const seller = p.free ? { prestige: 0.3 } : T.CLUB_FINANCE[p.club] || { prestige: 0.5 };
    const wRatio = wage / Math.max(0.1, wageAsk);
    let pPlayer = M.clamp01((wRatio - 0.85) / 0.2) * 0.9; // maaş
    pPlayer += (buyer.prestige - seller.prestige) * 0.4; // prestij farkı
    if (!p.starter && !p.free) pPlayer += 0.15; // yedek: gitmeye daha istekli
    if (p.age >= 32) pPlayer += 0.1;
    pPlayer = M.clamp01(pPlayer);
    const rnd2 = M.hashRand(p.name + buyerId, 'player' + Math.round(wage * 10) + '_' + st.week);
    const playerOk = rnd2 < pPlayer;
    if (!clubOk && !playerOk) return { ok: false, reason: `${p.club} teklifi reddetti ve ${p.name} maaş şartlarını yetersiz buldu.`, counter: { fee: counterFee, wage: Math.round(wageAsk * 1.05 * 10) / 10 } };
    if (!clubOk) return { ok: false, reason: `${p.club} teklifi reddetti. Karşı teklif: ${counterFee} M€.`, counter: { fee: counterFee, wage } };
    if (!playerOk) {
      const why = buyer.prestige < seller.prestige - 0.2 ? `${p.name} kulübünüzün projesine ikna olmadı (prestij).` : `${p.name} maaş teklifini yetersiz buldu.`;
      return { ok: false, reason: why, counter: { fee, wage: Math.round(wageAsk * (buyer.prestige < seller.prestige - 0.2 ? 1.3 : 1.08) * 10) / 10 } };
    }
    // Transfer gerçekleşir
    T.executeTransfer(buyerId, p, fee, wage);
    return { ok: true, reason: `${p.name} ${fee > 0 ? fee + ' M€ bonservisle' : 'bedelsiz'} kadronuza katıldı (maaş ${wage} M€/yıl).` };
  };

  T.executeTransfer = function (buyerId, p, fee, wage) {
    const st = T.state || T.load();
    // satıcıdan çıkar
    if (p.free) st.freeAgents = st.freeAgents.filter((r) => r[1] !== p.name);
    else {
      const sq = st.squads[p.club];
      sq.xi = sq.xi.filter((r) => r[1] !== p.name); sq.bench = sq.bench.filter((r) => r[1] !== p.name);
      // satıcı kadrosunda 11 kalmadıysa yedekten/serbestten tamamla
      T.fixSquad(p.club);
      st.budgets[p.club].budget = Math.round((st.budgets[p.club].budget + fee) * 10) / 10;
    }
    // alıcıya ekle (numara çakışması varsa yeni numara)
    const bsq = st.squads[buyerId];
    const used = new Set(bsq.xi.concat(bsq.bench).map((r) => r[0]));
    let num = p.number; while (used.has(num)) num = num >= 99 ? 12 : num + 1;
    bsq.bench.push([num, p.name, p.pos, p.overall]);
    st.budgets[buyerId].budget = Math.round((st.budgets[buyerId].budget - fee) * 10) / 10;
    st.history.unshift({ week: st.week, type: 'in', club: buyerId, from: p.club || 'Serbest', name: p.name, fee, wage });
    T.save();
  };

  /* Satış: oyuncu listeye konur; anında teklif üretilir (AI kulüpler değerin %60-110'u) */
  T.offersFor = function (sellerId, p) {
    const st = T.state || T.load();
    const offers = [];
    for (const t of FS.TEAMS) {
      if (t.id === sellerId) continue;
      const fin = st.budgets[t.id];
      const r = M.hashRand(p.name + t.id, 'sell' + st.week);
      if (r < 0.45) continue; // ilgi yok
      // ihtiyaç: aynı mevki grubunda zayıflık
      const sq = T.squadOf(t.id);
      const grp = T.posGroup(p.pos);
      const best = Math.max(...sq.xi.filter((x) => T.posGroup(x.pos) === grp).map((x) => x.overall), 0);
      let m = 0.6 + r * 0.5 + (p.overall > best ? 0.15 : 0) + (fin.prestige - 0.5) * 0.2;
      const fee = Math.round(Math.min(fin.budget, p.value * m) * 10) / 10;
      if (fee < p.value * 0.5 || fee <= 0.2) continue;
      if (T.squadSize(t.id) >= 23) continue;
      offers.push({ club: t.id, clubName: t.name, fee });
    }
    return offers.sort((a, b) => b.fee - a.fee).slice(0, 4);
  };
  T.sell = function (sellerId, p, buyerId, fee) {
    const st = T.state || T.load();
    const sq = st.squads[sellerId];
    const total = sq.xi.length + sq.bench.length;
    if (total <= 16) return { ok: false, reason: 'Kadro çok küçük (en az 16 oyuncu kalmalı).' };
    const gkCount = sq.xi.concat(sq.bench).filter((r) => r[2] === 'GK').length;
    if (p.pos === 'GK' && gkCount <= 1) return { ok: false, reason: 'Tek kaleciyi satamazsınız.' };
    sq.xi = sq.xi.filter((r) => r[1] !== p.name); sq.bench = sq.bench.filter((r) => r[1] !== p.name);
    T.fixSquad(sellerId);
    st.budgets[sellerId].budget = Math.round((st.budgets[sellerId].budget + fee) * 10) / 10;
    if (buyerId && st.squads[buyerId]) {
      const b = st.squads[buyerId];
      const used = new Set(b.xi.concat(b.bench).map((r) => r[0]));
      let num = p.number; while (used.has(num)) num = num >= 99 ? 12 : num + 1;
      b.bench.push([num, p.name, p.pos, p.overall]);
      st.budgets[buyerId].budget = Math.round((st.budgets[buyerId].budget - fee) * 10) / 10;
    } else st.freeAgents.push([p.number, p.name, p.pos, p.overall]);
    st.history.unshift({ week: st.week, type: 'out', club: sellerId, to: buyerId || 'Serbest', name: p.name, fee });
    T.save();
    return { ok: true, reason: `${p.name} ${fee} M€ karşılığında ${buyerId ? FS.getTeam(buyerId).name : 'serbest kaldı'}${buyerId ? "'a satıldı" : ''}.` };
  };

  /* ---------------- Kadro yönetimi ---------------- */
  // İlk 11 ile yedek arasında yer değiştir (aynı slota girer; mevki uyumsuzluğu güç cezasıyla yansır — role attrs yeniden hesaplanır)
  T.swap = function (id, xiIndex, benchIndex) {
    const st = T.state || T.load(); const sq = st.squads[id];
    const a = sq.xi[xiIndex], b = sq.bench[benchIndex];
    if (!a || !b) return { ok: false, reason: 'Geçersiz seçim.' };
    const slotRole = FS.FORMATIONS[FS.getTeam(id).formation][xiIndex].role;
    if ((slotRole === 'GK') !== (b[2] === 'GK')) return { ok: false, reason: slotRole === 'GK' ? 'Bu slota yalnızca kaleci girebilir.' : 'Kaleciyi saha oyuncusu slotuna koyamazsınız.' };
    sq.xi[xiIndex] = b; sq.bench[benchIndex] = a;
    T.save();
    return { ok: true };
  };
  // Kadro bütünlüğü: ilk 11 eksikse yedekten doldur, yedek 9'u aşarsa fazlasını tut ama maça 9 taşı
  T.fixSquad = function (id) {
    const st = T.state || T.load(); const sq = st.squads[id];
    const form = FS.FORMATIONS[FS.getTeam(id).formation];
    while (sq.xi.length < 11 && sq.bench.length) {
      const slotRole = form[sq.xi.length].role;
      let bi = sq.bench.findIndex((r) => (slotRole === 'GK') === (r[2] === 'GK') && (slotRole === 'GK' || T.posGroup(r[2]) === T.posGroup(slotRole)));
      if (bi < 0) bi = sq.bench.findIndex((r) => (slotRole === 'GK') === (r[2] === 'GK'));
      if (bi < 0) break;
      sq.xi.push(sq.bench.splice(bi, 1)[0]);
    }
    // kaleci yoksa serbestten çek
    if (!sq.xi.some((r) => r[2] === 'GK') && !sq.bench.some((r) => r[2] === 'GK')) {
      const gi = st.freeAgents.findIndex((r) => r[2] === 'GK');
      if (gi >= 0) sq.bench.push(st.freeAgents.splice(gi, 1)[0]);
    }
  };

  /* Maç için kullanılacak takım tanımı: xi tam 11, yedek ≤ 9 (en iyi 9) */
  T.matchDef = function (id) {
    const def = T.teamDef(id);
    T.fixSquad(id);
    const st = T.state; const sq = st.squads[id];
    const bench = sq.bench.slice().sort((a, b) => b[3] - a[3]);
    const gk = bench.find((r) => r[2] === 'GK');
    let pick = bench.filter((r) => r !== gk).slice(0, gk ? 8 : 9); if (gk) pick.unshift(gk);
    return Object.assign({}, def, { xi: sq.xi.map((r) => r.slice()), bench: pick.map((r) => r.slice()) });
  };

  /* Maç sonrası ekonomi: hasılat (prestij × sonuç), maaş haftalığı düşer */
  T.afterMatch = function (homeId, awayId, homeScore, awayScore) {
    const st = T.state || T.load();
    for (const [id, gf, ga] of [[homeId, homeScore, awayScore], [awayId, awayScore, homeScore]]) {
      const fin = st.budgets[id]; if (!fin) continue;
      const gate = (id === homeId ? 2.2 : 0.6) * (0.6 + fin.prestige); // M€ hasılat
      const prize = gf > ga ? 1.5 : gf === ga ? 0.6 : 0.2;
      const wages = T.wageBill(id) / 38; // haftalık maaş
      fin.budget = Math.round((fin.budget + gate + prize - wages) * 10) / 10;
      fin.lastDelta = Math.round((gate + prize - wages) * 10) / 10;
    }
    st.week++;
    T.save();
  };

  T.fmt = (v) => (v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(1)) + ' M€';
})(typeof window !== 'undefined' ? window : globalThis);
