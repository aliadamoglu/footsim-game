/* Kariyer ekranı: kulüp seçimi, haftanın maçı kartı, puan durumu, fikstür, istatistik, haberler, sezon sonu ödülleri */
(function (root) {
  const FS = (root.FS = root.FS || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const UI = (FS.CareerUI = { tab: 'crTabTable', pickClub: 'GS', mode: 'control', crestCache: {} });

  const crest = (id, cls) => { const t = FS.getTeam(id); return `<i class="crest ${cls || 'sm'}" style="background:${FS.App.kitCss(t.kits.home)}"></i>`; };
  const formHtml = (arr) => `<span class="form">${(arr || []).map((f) => `<i class="${f}">${f}</i>`).join('')}</span>`;

  UI.open = function (preferClub) {
    $('menu').classList.add('hidden'); $('transfer').classList.add('hidden');
    $('career').classList.remove('hidden');
    if (!FS.Career.state) FS.Career.load();
    if (preferClub && !FS.Career.state) UI.pickClub = preferClub;
    UI.render();
  };
  UI.close = function () {
    $('career').classList.add('hidden'); $('menu').classList.remove('hidden');
    if (FS.App && FS.App.renderTeamGrid) { FS.App.renderTeamGrid(); FS.App.updateMenuSummary(); }
  };

  UI.render = function () {
    const C = FS.Career; const st = C.state;
    $('crNew').classList.toggle('hidden', !!st);
    $('crMain').classList.toggle('hidden', !st);
    $('btnCrAbandon').style.display = st ? '' : 'none';
    $('btnCrTransfer').style.display = st ? '' : 'none';
    if (!st) { UI.renderNew(); return; }
    const club = FS.getTeam(st.club);
    $('crSeason').textContent = st.season + ' · ' + club.short;
    $('crTag').textContent = `${st.manager.name} · ${club.name} · ${st.manager.wins}G ${st.manager.draws}B ${st.manager.losses}M · menajer notu ${Math.round(st.manager.rating)} · ${st.manager.titles} şampiyonluk`;
    UI.renderNext(); UI.renderFinance(); UI.renderTable(); UI.renderFixtures(); UI.renderStats(); UI.renderNews();
    document.querySelectorAll('#trTabsCr button').forEach((b) => b.classList.toggle('on', b.dataset.t === UI.tab));
    ['crTabTable', 'crTabFix', 'crTabStats', 'crTabNews'].forEach((id) => $(id).classList.toggle('hidden', id !== UI.tab));
    FS.applyIcons($('career'));
  };

  UI.renderNew = function () {
    if (!UI.pickClub) UI.pickClub = FS.App && FS.App.settings ? FS.App.settings.home : FS.TEAMS[0].id;
    if (!UI.picker) {
      UI.picker = FS.ClubPicker.mount({
        gridId: 'crGrid', tabsId: 'crLeagueTabs', searchId: 'crSearch', countId: 'crCount', storageKey: 'footsim.pickTabCr',
        isHome: (t) => UI.pickClub === t.id, isAway: () => false,
        onPick: (t) => { UI.pickClub = t.id; UI.picker.render(); UI.renderLeagueHint(); },
        onCareer: (t) => { UI.pickClub = t.id; UI.picker.render(); UI.renderLeagueHint(); },
      });
    } else UI.picker.render();
    UI.renderLeagueHint();
  };
  UI.renderLeagueHint = function () {
    const lg = FS.Career.leagueOf(UI.pickClub); const t = FS.getTeam(UI.pickClub); const el = $('crLeagueHint'); if (!el) return;
    el.innerHTML = `${crest(t.id)}<b>${esc(t.name)}</b> → <b>${esc(lg.name)}</b> · ${lg.ids.length} takım · ${(lg.ids.length - 1) * 2} hafta <small>(${lg.ids.slice(0, 6).map((id) => esc(FS.getTeam(id).short)).join(', ')}${lg.ids.length > 6 ? ', …' : ''})</small>`;
  };

  UI.renderNext = function () {
    const C = FS.Career; const st = C.state; const box = $('crNext');
    if (C.isSeasonOver()) {
      const aw = st.awards[st.awards.length - 1]; const ch = FS.getTeam(aw.champion);
      box.className = 'crNext over';
      box.innerHTML = `<div class="crAwards"><h3>${FS.icon('trophy', 20)} ${esc(st.season)} sezonu tamamlandı</h3>
        <p><b>Şampiyon:</b> ${crest(ch.id)}${esc(ch.name)}</p>
        <p><b>Gol kralı:</b> ${aw.topScorer ? esc(aw.topScorer.name) + ' (' + aw.topScorer.n + ' gol, ' + esc(FS.getTeam(aw.topScorer.club).short) + ')' : '-'}</p>
        <p><b>${esc(FS.getTeam(st.club).name)}:</b> ${aw.userPos}. sıra${aw.userPos === 1 ? ' — ŞAMPİYON! 🏆' : aw.userPos <= 3 ? ' — kürsü' : ''} · ödül parası bütçeye eklendi</p></div>
        <div class="go"><button id="btnCrNextSeason" class="primary">${FS.icon('arrow-right', 16)}<span>YENİ SEZON</span></button></div>`;
      $('btnCrNextSeason').onclick = () => { C.nextSeason(); UI.render(); };
      return;
    }
    const g = C.userGame(); const h = FS.getTeam(g.home), a = FS.getTeam(g.away);
    const tab = C.standings(); const pos = (id) => { const i = tab.findIndex((r) => r.id === id); return st.table[id].p ? (i + 1) + '.' : '-'; };
    const derby = C.isDerby(g.home, g.away);
    box.className = 'crNext';
    box.innerHTML = `
      <div class="side"><div class="kit" style="background:${FS.App.kitCss(h.kits.home)}"></div><div><div class="nm">${esc(h.name)}</div><div class="sub">${pos(g.home)} sıra ${formHtml(st.form[g.home])}</div></div></div>
      <div><div class="vs">${st.week}. HAFTA</div><div class="sub" style="text-align:center">${derby ? '🔥 DERBİ · ' : ''}${esc(h.stadium)}</div></div>
      <div class="side r"><div><div class="nm">${esc(a.name)}</div><div class="sub">${formHtml(st.form[g.away])} ${pos(g.away)} sıra</div></div><div class="kit" style="background:${FS.App.kitCss(a.kits.home)}"></div></div>
      <div class="go">
        <div class="seg"><button data-m="control" class="${UI.mode === 'control' ? 'on' : ''}">Yönet</button><button data-m="watch" class="${UI.mode === 'watch' ? 'on' : ''}">İzle</button><button data-m="sim" class="${UI.mode === 'sim' ? 'on' : ''}">Simüle</button></div>
        <button id="btnCrPlay" class="primary">${FS.icon('play', 16)}<span>MAÇA ÇIK</span></button>
        <div class="sub" style="text-align:center">${C.transferWindowOpen() ? '🟢 transfer penceresi açık' : '🔒 transfer penceresi kapalı'}</div>
      </div>`;
    box.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => { UI.mode = b.dataset.m; UI.renderNext(); }));
    $('btnCrPlay').onclick = () => UI.playWeek();
  };

  UI.renderFinance = function () {
    const C = FS.Career; const st = C.state; const T = FS.Transfer; const fin = T.finance(st.club); const bill = T.wageBill(st.club);
    const tab = C.standings(); const me = tab.find((r) => r.id === st.club); const p = C.position(st.club);
    const top = C.topScorers(1)[0];
    $('crFinance').innerHTML = `
      <div class="fin"><span>Lig sırası</span><b>${me.p ? p + '. <small>(' + me.pts + ' puan · ' + me.p + ' maç)</small>' : '-'}</b></div>
      <div class="fin"><span>Averaj · form</span><b>${me.gf}:${me.ga} <small>(${me.gf - me.ga >= 0 ? '+' : ''}${me.gf - me.ga})</small> ${formHtml(st.form[st.club])}</b></div>
      <div class="fin"><span>Transfer bütçesi · maaş yükü</span><b>${T.fmt(fin.budget)} <small>· ${T.fmt(bill)}/${T.fmt(fin.wageCap)}</small></b></div>
      <div class="fin"><span>Gol kralı</span><b>${top ? esc(top.name) + ' <small>' + top.n + ' gol · ' + esc(FS.getTeam(top.club).short) + '</small>' : '-'}</b></div>`;
  };

  UI.renderTable = function () {
    const C = FS.Career; const st = C.state; const tab = C.standings();
    $('crTable').innerHTML = `<table class="tbl"><thead><tr><th>#</th><th class="l">Takım</th><th>O</th><th>G</th><th>B</th><th>M</th><th>A</th><th>Y</th><th>Av</th><th>P</th><th class="l">Form</th></tr></thead><tbody>${tab.map((r, i) => {
      const t = FS.getTeam(r.id);
      return `<tr class="${r.id === st.club ? 'me' : ''} ${i === 0 ? 'top' : ''}"><td>${i + 1}</td><td class="l">${crest(r.id)}${esc(t.name)}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}</td><td>${r.ga}</td><td>${r.gd >= 0 ? '+' : ''}${r.gd}</td><td class="pts">${r.pts}</td><td class="l">${formHtml(st.form[r.id])}</td></tr>`;
    }).join('')}</tbody></table>`;
  };

  UI.renderFixtures = function () {
    const C = FS.Career; const st = C.state;
    const from = Math.max(1, st.week - 2), to = Math.min(st.fixtures.length, st.week + 3);
    const weeks = st.fixtures.filter((f) => f.week >= from && f.week <= to);
    $('crFix').innerHTML = weeks.map((wk) => `<div class="fixWeek"><h3 class="${wk.week === st.week ? 'now' : ''}">${wk.week}. hafta${wk.week === st.week ? ' — bu hafta' : ''}</h3>${wk.games.map((g) => {
      const h = FS.getTeam(g.home), a = FS.getTeam(g.away); const me = g.home === st.club || g.away === st.club;
      return `<div class="fixRow ${me ? 'me' : ''}"><div class="h">${esc(h.name)} ${crest(g.home)}</div><div class="sc ${g.played ? '' : 'tbd'}">${g.played ? g.hs + ' - ' + g.as : 'vs'}</div><div>${crest(g.away)}${esc(a.name)}${g.played && !g.user ? '<span class="sim">sim</span>' : ''}</div></div>`;
    }).join('')}</div>`).join('') + `<p class="note">Fikstür: ${st.fixtures.length} hafta, çift devreli · geçmiş 2 ve gelecek 3 hafta gösteriliyor.</p>`;
  };

  UI.renderStats = function () {
    const C = FS.Career; const st = C.state;
    const sc = C.topScorers(12);
    const motm = st.motm.slice(-8).reverse();
    const clubMotm = {}; for (const m of st.motm) clubMotm[m.name] = (clubMotm[m.name] || 0) + 1;
    const motmTop = Object.entries(clubMotm).sort((a, b) => b[1] - a[1]).slice(0, 5);
    $('crStats').innerHTML = `
      <div><h2>Gol krallığı</h2><table class="tbl"><thead><tr><th>#</th><th class="l">Oyuncu</th><th class="l">Kulüp</th><th>Gol</th></tr></thead><tbody>${sc.map((r, i) => `<tr><td>${i + 1}</td><td class="l">${esc(r.name)}</td><td class="l">${crest(r.club)}${esc(FS.getTeam(r.club).short)}</td><td class="pts">${r.n}</td></tr>`).join('') || '<tr><td colspan="4" class="l">Henüz gol yok.</td></tr>'}</tbody></table></div>
      <div><h2>Maçın adamı <small>(sizin maçlarınız)</small></h2><table class="tbl"><thead><tr><th>Hafta</th><th class="l">Oyuncu</th><th class="l">Kulüp</th></tr></thead><tbody>${motm.map((m) => `<tr><td>${m.week}</td><td class="l">${esc(m.name)}</td><td class="l">${crest(m.club)}${esc(FS.getTeam(m.club).short)}</td></tr>`).join('') || '<tr><td colspan="3" class="l">Henüz maç oynanmadı.</td></tr>'}</tbody></table>
      ${motmTop.length ? `<p class="motm">En çok: ${motmTop.map(([n, k]) => esc(n) + ' ×' + k).join(' · ')}</p>` : ''}
      <h2 style="margin-top:16px">Sezon geçmişi</h2><ul style="list-style:none;padding:0;margin:0;font-size:13px">${st.awards.map((a) => `<li>${esc(a.season)}: şampiyon ${crest(a.champion)}${esc(FS.getTeam(a.champion).name)} · siz ${a.userPos}.</li>`).join('') || '<li class="note">İlk sezon devam ediyor.</li>'}</ul></div>`;
  };

  UI.renderNews = function () {
    const st = FS.Career.state;
    $('crNews').innerHTML = `<ul>${st.news.map((n) => `<li><span class="wk">${n.week}. hf</span>${esc(n.text)}</li>`).join('')}</ul>`;
  };

  /* Haftanın maçına çık: 3B (yönet/izle) ya da anında simüle */
  UI.playWeek = function () {
    const C = FS.Career; const st = C.state; const g = C.userGame(); if (!g) return;
    if (UI.mode === 'sim') {
      const r = C.simResult(g.home, g.away);
      // sahte maç nesnesi: recordUserMatch skor + kadro istatistiği bekler
      const mk = (id, score) => ({ id, score, players: [], subs: [] });
      const fake = { teams: [mk(g.home, r.hs), mk(g.away, r.as)] };
      C.pickScorers(g.home, r.hs, st.scorers); C.pickScorers(g.away, r.as, st.scorers);
      if (FS.Transfer) FS.Transfer.afterMatch(g.home, g.away, r.hs, r.as);
      C.recordUserMatch(fake);
      UI.render();
      return;
    }
    const App = FS.App;
    App.settings.home = g.home; App.settings.away = g.away;
    App.settings.humanTeam = UI.mode === 'control' ? (g.home === st.club ? 0 : 1) : null;
    App.careerMatch = { week: st.week, home: g.home, away: g.away };
    $('career').classList.add('hidden');
    App.startMatch();
  };

  /* Maç bittiğinde (App çağırır) */
  UI.afterMatch = function (match) {
    const C = FS.Career; if (!C.state || !FS.App.careerMatch) return null;
    FS.App.careerMatch = null;
    return C.recordUserMatch(match);
  };

  UI.init = function () {
    $('btnCareer').onclick = () => UI.open();
    $('btnCrBack').onclick = () => UI.close();
    $('btnCrTransfer').onclick = () => { $('career').classList.add('hidden'); FS.TransferUI.open(FS.Career.state.club); FS.TransferUI.returnTo = 'career'; };
    $('btnCrAbandon').onclick = () => { if (confirm('Kariyer silinsin mi? Puan durumu ve sezon ilerlemesi kaybolur (kadro/bütçe kayıtları kalır).')) { FS.Career.abandon(); UI.render(); } };
    $('btnCrStart').onclick = () => { FS.Career.newCareer(UI.pickClub, { managerName: ($('crName').value || '').trim() || 'Menajer' }); UI.render(); };
    document.querySelectorAll('#trTabsCr button').forEach((b) => (b.onclick = () => { UI.tab = b.dataset.t; UI.render(); }));
  };
})(typeof window !== 'undefined' ? window : globalThis);
