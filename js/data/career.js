/* Kariyer modu — lig sezonu (çift devreli round-robin)
   - Türk kulübü: Süper Lig (18 kulüp, 34 hafta) · Avrupa kulübü: Şampiyonlar Ligi lig usulü (kulübün güç bandındaki 18 ŞL kulübü, 34 hafta)
   - Kullanıcı bir kulübü yönetir; haftanın maçı 3B oynanır (izle/kontrol), diğer maçlar sonuç motoruyla simüle edilir
   - Puan durumu, fikstür, form, gol krallığı, haftanın oyuncusu; sezon sonu şampiyon + ödüller, yeni sezona geçiş (yaş/gelişim)
   - Ekonomi FS.Transfer üzerinden (bütçe/maaş/transfer) — transfer penceresi: 1-4. hafta ve 11-14. hafta
   - Kalıcılık: localStorage 'footsim.career.v1' */
(function (root) {
  const FS = (root.FS = root.FS || {});
  const M = FS.M;
  const C = (FS.Career = {});
  const KEY = 'footsim.career.v1';
  C.state = null;

  const DERBIES = [['GS', 'FB'], ['GS', 'BJK'], ['FB', 'BJK'], ['TS', 'FB'], ['TS', 'GS'], ['TS', 'BJK'], ['TS', 'SAM'], ['TS', 'RIZ'], ['SAM', 'RIZ'], ['IBFK', 'KAS'], ['KAS', 'EYP'], ['GB', 'KON'],
    ['RMA', 'BAR'], ['RMA', 'ATM'], ['BAR', 'ATM'], ['BET', 'VIL'], ['MCI', 'LIV'], ['ARS', 'LIV'], ['MCI', 'ARS'], ['MCI', 'MUN'], ['LIV', 'MUN'], ['ARS', 'MUN'], ['AVL', 'MUN'],
    ['BAY', 'PSG'], ['INT', 'RMA'], ['BAY', 'BVB'], ['BVB', 'RBL'], ['BAY', 'VFB'], ['INT', 'NAP'], ['ROM', 'NAP'], ['INT', 'ROM'], ['PSV', 'FEY'], ['SCP', 'POR'], ['LIL', 'LEN'], ['PSG', 'LIL'], ['BOD', 'VIK'], ['SLA', 'SLB'], ['CLB', 'PSV']];
  C.isDerby = (a, b) => DERBIES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

  /* ---------- lig havuzu ---------- */
  // Türk kulüpleri: Süper Lig'in 18 takımı. Diğerleri: ŞL lig aşaması kulüplerinden, kulübün güç sırasına göre 18'lik pencere
  C.LEAGUE_SIZE = 18;
  C.leagueOf = function (clubId) {
    const club = FS.getTeam(clubId); if (!club) return { name: 'Lig', ids: FS.TEAMS.map((t) => t.id) };
    const baseStrength = (t) => t.xi.reduce((a, d) => a + d[3], 0) / Math.max(1, t.xi.length);
    if (club.league === 'Süper Lig') {
      const ids = FS.TEAMS.filter((t) => t.league === 'Süper Lig').map((t) => t.id);
      return { name: 'Süper Lig', short: 'SL', ids };
    }
    const pool = FS.TEAMS.filter((t) => t.league !== 'Süper Lig').sort((a, b) => baseStrength(b) - baseStrength(a));
    const n = Math.min(C.LEAGUE_SIZE, pool.length);
    const r = Math.max(0, pool.findIndex((t) => t.id === clubId));
    const start = M.clamp(r - Math.floor(n / 2) + 1, 0, pool.length - n);
    return { name: 'Şampiyonlar Ligi', short: 'ŞL', ids: pool.slice(start, start + n).map((t) => t.id) };
  };

  /* ---------- fikstür: çift devreli round-robin (Berger) ---------- */
  C.makeFixtures = function (ids, rng) {
    const n = ids.length; const arr = ids.slice();
    // rastgele başlangıç sırası
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const round = [];
      for (let i = 0; i < n / 2; i++) {
        const a = arr[i], b = arr[n - 1 - i];
        round.push(r % 2 === 0 ? [a, b] : [b, a]);
      }
      rounds.push(round);
      arr.splice(1, 0, arr.pop()); // döndür (ilk sabit)
    }
    const second = rounds.map((rd) => rd.map(([a, b]) => [b, a]));
    return rounds.concat(second).map((rd, i) => ({ week: i + 1, games: rd.map(([h, a]) => ({ home: h, away: a, hs: null, as: null, played: false })) }));
  };

  C.newCareer = function (clubId, opts) {
    const o = opts || {};
    const seed = o.seed || Math.floor(Math.random() * 1e9);
    const rng = M.seededRng ? M.seededRng(seed) : Math.random;
    const lg = C.leagueOf(clubId); const ids = lg.ids;
    const st = {
      version: 1, club: clubId, seasonNo: 1, season: '2026-27', week: 1, seed, league: lg.name, leagueIds: ids,
      fixtures: C.makeFixtures(ids, rng),
      table: {}, scorers: {}, assists: {}, motm: [], history: [], news: [], form: {}, awards: [],
      manager: { name: o.managerName || 'Menajer', wins: 0, draws: 0, losses: 0, titles: 0, rating: 50 },
      started: Date.now(),
    };
    for (const id of ids) { st.table[id] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }; st.form[id] = []; }
    C.state = st;
    if (FS.Transfer) FS.Transfer.reset(); // sezon başı kadrolar/bütçeler
    C.addNews('Sezon başladı: ' + FS.getTeam(clubId).name + ' teknik direktörlüğüne hoş geldiniz. ' + lg.name + ' — ' + st.fixtures.length + ' haftalık lig maratonu sizi bekliyor.');
    C.save();
    return st;
  };
  C.load = function () {
    try { const raw = root.localStorage && root.localStorage.getItem(KEY); if (raw) { const st = JSON.parse(raw); if (st && st.version === 1 && st.fixtures && Object.keys(st.table).every((id) => FS.getTeam(id))) { if (!st.leagueIds) { st.leagueIds = Object.keys(st.table); st.league = st.league || 'Lig'; } C.state = st; return st; } } } catch (e) { /* yok */ }
    C.state = null; return null;
  };
  C.save = function () { try { if (C.state) root.localStorage && root.localStorage.setItem(KEY, JSON.stringify(C.state)); } catch (e) { /* yoksay */ } };
  C.abandon = function () { C.state = null; try { root.localStorage && root.localStorage.removeItem(KEY); } catch (e) { /* yok */ } };
  C.active = () => !!C.state;
  C.addNews = function (text) { const st = C.state; if (!st) return; st.news.unshift({ week: st.week, text }); if (st.news.length > 40) st.news.length = 40; };

  /* ---------- güç / sonuç motoru (oynanmayan maçlar) ---------- */
  C.strength = function (id) {
    const def = FS.Transfer ? FS.Transfer.matchDef(id) : FS.getTeam(id);
    const xi = def.xi.reduce((a, d) => a + d[3], 0) / Math.max(1, def.xi.length);
    const bench = def.bench.slice(0, 5).reduce((a, d) => a + d[3], 0) / Math.max(1, Math.min(5, def.bench.length));
    return xi * 0.85 + bench * 0.15;
  };
  C.simResult = function (homeId, awayId) {
    const sh = C.strength(homeId), sa = C.strength(awayId);
    const diff = (sh - sa) / 6; // ~6 güç puanı = 1 gol beklenti farkı
    const base = 1.35;
    const lh = Math.max(0.2, base + 0.25 + diff * 0.55), la = Math.max(0.2, base - 0.1 - diff * 0.55);
    const pois = (l) => { let k = 0, p = Math.exp(-l), s = p; const u = M.random(); while (u > s && k < 8) { k++; p *= l / k; s += p; } return k; };
    return { hs: pois(lh), as: pois(la) };
  };
  C.pickScorers = function (id, goals, out) {
    const def = FS.Transfer ? FS.Transfer.matchDef(id) : FS.getTeam(id);
    const pool = def.xi.filter((d) => d[2] !== 'GK');
    const w = pool.map((d) => ({ d, w: (d[2] === 'ST' ? 5 : d[2] === 'RW' || d[2] === 'LW' || d[2] === 'AM' ? 3 : d[2] === 'CM' ? 1.4 : 0.5) * (d[3] / 80) }));
    const tot = w.reduce((a, x) => a + x.w, 0);
    for (let g = 0; g < goals; g++) { let u = M.random() * tot; for (const x of w) { u -= x.w; if (u <= 0) { const k = x.d[1]; out[k] = (out[k] || { n: 0, club: id }); out[k].n++; break; } } }
  };

  /* ---------- haftanın maçı ---------- */
  C.currentWeek = () => { const st = C.state; return st ? st.fixtures.find((f) => f.week === st.week) : null; };
  C.userGame = function () {
    const st = C.state; const wk = C.currentWeek(); if (!wk) return null;
    return wk.games.find((g) => g.home === st.club || g.away === st.club) || null;
  };
  C.isSeasonOver = () => { const st = C.state; return !!st && st.week > st.fixtures.length; };
  C.transferWindowOpen = () => { const st = C.state; if (!st) return false; const half = Math.ceil(st.fixtures.length / 2); return (st.week >= 1 && st.week <= 4) || (st.week > half && st.week <= half + 4); };

  /* Kullanıcının maçı bitti: sonucu işle, diğer maçları simüle et, haftayı ilerlet */
  C.recordUserMatch = function (match) {
    const st = C.state; if (!st) return null;
    const g = C.userGame(); if (!g || g.played) return null;
    const T = match.teams; const hs = T[0].score, as = T[1].score;
    if (T[0].id !== g.home || T[1].id !== g.away) { /* eşleşme farklıysa yine de yaz */ }
    g.hs = hs; g.as = as; g.played = true; g.user = true;
    C.applyResult(g);
    // gol krallığı / asist (gerçek maçtan)
    for (const t of T) for (const p of t.players.concat(t.subs)) {
      if (p.stats.goals) { const k = p.name; st.scorers[k] = st.scorers[k] || { n: 0, club: t.id }; st.scorers[k].n += p.stats.goals; }
      if (p.stats.assists) { const k = p.name; st.assists[k] = st.assists[k] || { n: 0, club: t.id }; st.assists[k].n += p.stats.assists; }
    }
    // maçın adamı: gol×3 + asist×2 + şut isabeti + kurtarış×1.5 + pas (yüksek katkı)
    let best = null, bs = -1;
    for (const t of T) for (const p of t.players.concat(t.subs)) {
      const s = p.stats; const sc = s.goals * 3 + s.assists * 2 + (s.shotsOn || 0) * 0.5 + (s.saves || 0) * 1.5 + (s.passesOk || 0) * 0.03 + (s.tackles || 0) * 0.4 - (s.ownGoals || 0) * 2;
      if (sc > bs) { bs = sc; best = { name: p.name, club: t.id, score: sc }; }
    }
    if (best) st.motm.push({ week: st.week, name: best.name, club: best.club });
    const mine = T[0].id === st.club ? 0 : 1; const gf = T[mine].score, ga = T[1 - mine].score;
    const mgr = st.manager; if (gf > ga) mgr.wins++; else if (gf === ga) mgr.draws++; else mgr.losses++;
    mgr.rating = M.clamp(mgr.rating + (gf > ga ? 3 : gf === ga ? 0.5 : -3) + (C.strength(T[1 - mine].id) - C.strength(T[mine].id)) * 0.15, 0, 100);
    // diğer maçlar
    const wk = C.currentWeek();
    for (const og of wk.games) { if (og.played) continue; const r = C.simResult(og.home, og.away); og.hs = r.hs; og.as = r.as; og.played = true; C.applyResult(og); C.pickScorers(og.home, r.hs, st.scorers); C.pickScorers(og.away, r.as, st.scorers); }
    // haberler
    const res = gf > ga ? 'galibiyet' : gf === ga ? 'beraberlik' : 'mağlubiyet';
    C.addNews(`${st.week}. hafta: ${T[0].name} ${hs}-${as} ${T[1].name} — ${FS.getTeam(st.club).short} için ${res}. ${best ? 'Maçın adamı: ' + best.name + '.' : ''}`);
    const pos = C.position(st.club);
    if (pos === 1) C.addNews(FS.getTeam(st.club).name + ' liderliğe yükseldi!');
    st.history.push({ week: st.week, home: g.home, away: g.away, hs, as });
    st.week++;
    if (C.isSeasonOver()) C.finishSeason();
    C.save();
    return { g, pos, motm: best };
  };
  C.applyResult = function (g) {
    const st = C.state; const th = st.table[g.home], ta = st.table[g.away];
    th.p++; ta.p++; th.gf += g.hs; th.ga += g.as; ta.gf += g.as; ta.ga += g.hs;
    if (g.hs > g.as) { th.w++; ta.l++; th.pts += 3; st.form[g.home].push('G'); st.form[g.away].push('M'); }
    else if (g.hs < g.as) { ta.w++; th.l++; ta.pts += 3; st.form[g.away].push('G'); st.form[g.home].push('M'); }
    else { th.d++; ta.d++; th.pts++; ta.pts++; st.form[g.home].push('B'); st.form[g.away].push('B'); }
    for (const id of [g.home, g.away]) if (st.form[id].length > 5) st.form[id].shift();
  };
  C.standings = function () {
    const st = C.state; if (!st) return [];
    return Object.keys(st.table).map((id) => Object.assign({ id, gd: st.table[id].gf - st.table[id].ga }, st.table[id]))
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.id.localeCompare(b.id));
  };
  C.position = (id) => C.standings().findIndex((r) => r.id === id) + 1;
  C.topScorers = (n) => Object.entries(C.state.scorers).map(([name, v]) => ({ name, n: v.n, club: v.club })).sort((a, b) => b.n - a.n).slice(0, n || 10);
  C.streak = function (id) { const f = (C.state.form[id] || []); let s = 0; for (let i = f.length - 1; i >= 0; i--) { if (f[i] === 'G' && s >= 0) s++; else if (f[i] === 'M' && s <= 0) s--; else break; } return s; };

  /* ---------- sezon sonu ---------- */
  C.finishSeason = function () {
    const st = C.state; const tab = C.standings();
    const champ = tab[0].id; const gk = C.topScorers(1)[0];
    st.awards.push({ season: st.season, champion: champ, topScorer: gk, userPos: C.position(st.club) });
    if (champ === st.club) st.manager.titles++;
    C.addNews(`Sezon tamamlandı! Şampiyon: ${FS.getTeam(champ).name}. Gol kralı: ${gk ? gk.name + ' (' + gk.n + ')' : '-'}. ${FS.getTeam(st.club).short} sezonu ${C.position(st.club)}. sırada bitirdi.`);
    // ödül parası (Transfer bütçesine)
    if (FS.Transfer) { const fin = FS.Transfer.finance(st.club); if (fin) { const pos = C.position(st.club); fin.budget = Math.round((fin.budget + (pos === 1 ? 40 : pos <= 3 ? 25 : pos <= 6 ? 12 : pos <= 10 ? 6 : 3)) * 10) / 10; FS.Transfer.save(); } }
    st.seasonOver = true;
    C.save();
  };
  /* Yeni sezon: oyuncu gelişimi (genç +, yaşlı −), tablo sıfır, yeni fikstür */
  C.nextSeason = function () {
    const st = C.state; if (!st) return;
    if (FS.Transfer && FS.Transfer.state) {
      const T = FS.Transfer;
      for (const id of Object.keys(T.state.squads)) {
        const sq = T.state.squads[id];
        for (const row of sq.xi.concat(sq.bench)) { const age = T.ageOf(row[1]) + 1; const delta = age <= 23 ? M.pick([1, 1, 2, 3]) : age <= 29 ? M.pick([-1, 0, 0, 1]) : age <= 32 ? M.pick([-2, -1, 0]) : M.pick([-3, -2, -1]); row[3] = M.clamp(row[3] + delta, 55, 95); }
      }
      T.state.week = 1; T.save();
    }
    const y = 2026 + st.seasonNo; st.seasonNo++; st.season = y + '-' + String((y + 1) % 100).padStart(2, '0');
    st.week = 1; st.seasonOver = false;
    const rng = M.seededRng ? M.seededRng(st.seed + st.seasonNo * 7919) : Math.random;
    st.fixtures = C.makeFixtures(st.leagueIds || Object.keys(st.table), rng);
    for (const id of Object.keys(st.table)) { st.table[id] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }; st.form[id] = []; }
    st.scorers = {}; st.assists = {}; st.motm = []; st.history = [];
    C.addNews('Yeni sezon ' + st.season + ' başladı. Oyuncular bir yaş aldı: gençler gelişti, tecrübeliler biraz güç kaybetti.');
    C.save();
  };

  /* Spiker bağlamı (maç öncesi) */
  C.voiceContext = function (match) {
    const st = C.state; if (!st) return null;
    const h = match.teams[0].id, a = match.teams[1].id;
    const tab = C.standings();
    const pos = (id) => tab.findIndex((r) => r.id === id) + 1;
    const played = st.table[h].p > 0;
    return { comp: st.league === 'Şampiyonlar Ligi' ? 'ucl' : 'league', week: st.week, derby: C.isDerby(h, a), first: st.week === 1, last: st.week === st.fixtures.length,
      homePos: played ? pos(h) : null, awayPos: played ? pos(a) : null, leader: played ? (pos(h) === 1 ? 0 : pos(a) === 1 ? 1 : null) : null,
      streak: C.streak(st.club) >= 3 ? 1 : C.streak(st.club) <= -3 ? -1 : 0 };
  };
})(typeof window !== 'undefined' ? window : globalThis);
