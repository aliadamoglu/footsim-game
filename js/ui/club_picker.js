/* Kulüp seçici: lig/ülke sekmeleri + isim/şehir/ülke arama + kulüp kartı (stadyum, kapasite, teknik direktör, güç).
   Ana menü (ev sahibi/deplasman seçimi) ve kariyer (kulüp seçimi) aynı bileşeni kullanır. */
(function (root) {
  const FS = (root.FS = root.FS || {});
  const CP = (FS.ClubPicker = {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fold = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[İ]/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');

  /* Sekmeler: Süper Lig, ŞL torbaları/ülkeler değil — lig bazlı; küçük ligler "Diğer Avrupa" altında toplanır */
  const BIG = ['Süper Lig', 'Premier League', 'LaLiga', 'Serie A', 'Bundesliga', 'Ligue 1'];
  CP.tabs = function () {
    const SHORT = { 'Premier League': 'Premier Lig', 'Süper Lig': 'Süper Lig' };
    const tabs = [{ id: 'all', label: 'Tümü', test: () => true }, { id: 'ucl', label: 'Şampiyonlar Ligi', test: (t) => !!t.uclPot }];
    for (const lg of BIG) if (FS.TEAMS.some((t) => t.league === lg)) tabs.push({ id: lg, label: SHORT[lg] || lg, test: (t) => t.league === lg });
    if (FS.TEAMS.some((t) => !BIG.includes(t.league))) tabs.push({ id: 'other', label: 'Diğer Avrupa', test: (t) => !BIG.includes(t.league) });
    return tabs;
  };
  CP.strength = function (t) {
    const td = FS.Transfer ? FS.Transfer.teamDef(t.id) : t;
    return Math.round(td.xi.reduce((a, d) => a + d[3], 0) / Math.max(1, td.xi.length));
  };
  CP.stars = (ovr) => { const n = ovr >= 86 ? 5 : ovr >= 82 ? 4.5 : ovr >= 79 ? 4 : ovr >= 76 ? 3.5 : ovr >= 73 ? 3 : ovr >= 70 ? 2.5 : ovr >= 67 ? 2 : 1.5; return n; };
  CP.starHtml = function (n) {
    let h = '';
    for (let i = 1; i <= 5; i++) h += `<i class="st ${n >= i ? 'on' : n >= i - 0.5 ? 'half' : ''}">${FS.icon('star', 12)}</i>`;
    return `<span class="stars" title="${n} yıldız">${h}</span>`;
  };
  CP.fmtCap = (c) => (c ? c.toLocaleString('tr-TR') : '—');

  /* mount({gridId, tabsId, searchId, countId, isHome(t), isAway(t), onPick(t, e), storageKey}) */
  CP.mount = function (o) {
    const inst = { o, tab: 'all', q: '' };
    try { const saved = localStorage.getItem(o.storageKey || 'footsim.pickTab'); if (saved) inst.tab = saved; } catch (e) { /* yok */ }
    const tabs = CP.tabs();
    if (!tabs.some((t) => t.id === inst.tab)) inst.tab = 'all';
    const tabsEl = $(o.tabsId), grid = $(o.gridId), search = $(o.searchId), count = $(o.countId);
    const renderTabs = () => {
      tabsEl.innerHTML = tabs.map((t) => `<button type="button" data-tab="${t.id}" class="${inst.tab === t.id ? 'on' : ''}">${esc(t.label)}<small>${FS.TEAMS.filter(t.test).length}</small></button>`).join('');
      tabsEl.querySelectorAll('button').forEach((b) => (b.onclick = () => { inst.tab = b.dataset.tab; try { localStorage.setItem(o.storageKey || 'footsim.pickTab', inst.tab); } catch (e) { /* yok */ } renderTabs(); render(); }));
    };
    const render = () => {
      const tab = tabs.find((t) => t.id === inst.tab) || tabs[0];
      const q = fold(inst.q.trim());
      let list = FS.TEAMS.filter(tab.test);
      if (q) list = FS.TEAMS.filter((t) => fold(t.name + ' ' + t.short + ' ' + t.city + ' ' + (t.country || '') + ' ' + t.league + ' ' + (t.manager || '')).includes(q));
      const home = o.isHome, away = o.isAway;
      grid.innerHTML = '';
      if (count) count.textContent = q ? list.length + ' sonuç' : '';
      if (!list.length) { grid.innerHTML = `<div class="emptyPick">"${esc(inst.q)}" için kulüp bulunamadı.</div>`; return; }
      for (const t of list) {
        const el = document.createElement('div');
        el.className = 'teamCard' + (home && home(t) ? ' home' : '') + (away && away(t) ? ' away' : '');
        const ovr = CP.strength(t);
        el.innerHTML = `<div class="crest" style="background:${FS.App.kitCss(t.kits.home)}"></div><div class="tname">${esc(t.name)}</div><div class="tleague">${esc(t.league)}${t.uclPot ? ' · <span class="uclTag" title="Şampiyonlar Ligi ' + t.uclPot + '. torba">ŞL</span>' : ''}</div><div class="tpow">${CP.starHtml(CP.stars(ovr))}<b>${ovr}</b></div><button type="button" class="infoBtn" title="Kulüp kartı">${FS.icon('info', 14)}</button>`;
        el.onclick = (e) => { if (e.target.closest('.infoBtn')) { CP.openCard(t, o); return; } o.onPick(t, e); };
        grid.appendChild(el);
      }
    };
    if (search) { search.value = ''; search.oninput = () => { inst.q = search.value; render(); }; search.onkeydown = (e) => { if (e.key === 'Escape') { search.value = ''; inst.q = ''; render(); } }; }
    renderTabs(); render();
    inst.render = render; inst.renderTabs = renderTabs;
    return inst;
  };

  /* ---------- kulüp kartı ---------- */
  CP.openCard = function (t, o) {
    const dlg = $('clubDlg'); if (!dlg) return;
    CP.cardTeam = t; CP.cardOpts = o || {};
    const td = FS.Transfer ? FS.Transfer.teamDef(t.id) : t;
    const xi = td.xi, bench = td.bench;
    const avg = (rows) => Math.round(rows.reduce((a, d) => a + d[3], 0) / Math.max(1, rows.length));
    const grp = (rows, ps) => avg(rows.filter((d) => ps.includes(d[2])));
    const ovr = avg(xi);
    const best = xi.concat(bench).slice().sort((a, b) => b[3] - a[3])[0];
    const kit = (k) => FS.App.kitCss(k);
    $('ccKit').style.background = kit(t.kits.home);
    $('ccName').textContent = t.name;
    $('ccSub').innerHTML = `${esc(t.league)}${t.country ? ' · ' + esc(t.country) : ''}${t.uclPot ? ' · <span class="uclTag">Şampiyonlar Ligi · ' + t.uclPot + '. torba</span>' : ''}`;
    $('ccKitH').style.background = kit(t.kits.home); $('ccKitA').style.background = kit(t.kits.away); $('ccKitG').style.background = kit(t.kits.gk);
    const fin = FS.Transfer ? FS.Transfer.finance(t.id) : null;
    $('ccGrid').innerHTML = [
      ['map-pin', 'Stadyum', `${esc(t.stadium)}<small>${esc(t.city)}</small>`],
      ['users', 'Kapasite', CP.fmtCap(t.capacity)],
      ['user-round-check', 'Teknik direktör', esc(t.manager || '—')],
      ['calendar-days', 'Kuruluş', t.founded || '—'],
      ['layers', 'Diziliş', `${esc(t.formation)}<small>${t.mentality >= 0.65 ? 'hücumcu' : t.mentality >= 0.5 ? 'dengeli' : 'savunmacı'} anlayış</small>`],
      ['wallet', 'Bütçe', fin ? `${FS.Transfer.fmt(fin.budget)}<small>maaş tavanı ${FS.Transfer.fmt(fin.wageCap)}</small>` : '—'],
    ].map(([ic, k, v]) => `<div class="ccItem">${FS.icon(ic, 16)}<div><span>${k}</span><b>${v}</b></div></div>`).join('');
    const bar = (label, v) => `<div class="ccBar"><span>${label}</span><div class="track"><div class="fill" style="width:${Math.max(4, (v - 50) / 45 * 100)}%"></div></div><b>${v}</b></div>`;
    $('ccStrength').innerHTML = `<div class="ccOvr"><div class="big">${ovr}</div><div>${CP.starHtml(CP.stars(ovr))}<small>ilk 11 ortalaması · yedek ${avg(bench)}</small></div></div>` +
      bar('Hücum', grp(xi, ['ST', 'RW', 'LW', 'AM'])) + bar('Orta saha', grp(xi, ['CM', 'DM', 'AM', 'RWB', 'LWB'])) + bar('Savunma', grp(xi, ['CB', 'RB', 'LB', 'RWB', 'LWB', 'GK'])) +
      `<div class="ccStar">${FS.icon('sparkles', 14)} Yıldız oyuncu: <b>${esc(best[1])}</b> <small>${esc(best[2])} · ${best[3]}</small></div>`;
    $('ccXi').innerHTML = `<ol>${xi.map((d) => `<li><b>${d[0]}</b> ${esc(d[1])} <span>${d[2]}</span><em>${d[3]}</em></li>`).join('')}</ol><ol class="bench" start="12">${bench.map((d) => `<li><b>${d[0]}</b> ${esc(d[1])} <span>${d[2]}</span><em>${d[3]}</em></li>`).join('')}</ol>`;
    const inMenu = !!(o && o.menu);
    $('btnCcHome').style.display = inMenu ? '' : 'none'; $('btnCcAway').style.display = inMenu ? '' : 'none';
    $('btnCcHome').onclick = () => { CP.close(); o.setSide('home', t); };
    $('btnCcAway').onclick = () => { CP.close(); o.setSide('away', t); };
    $('btnCcCareer').onclick = () => { CP.close(); if (o && o.onCareer) o.onCareer(t); };
    $('btnCcClose').onclick = CP.close;
    dlg.onclick = (e) => { if (e.target === dlg) CP.close(); };
    dlg.classList.remove('hidden');
    if (FS.applyIcons) FS.applyIcons(dlg);
  };
  CP.close = () => { const dlg = $('clubDlg'); if (dlg) dlg.classList.add('hidden'); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const dlg = $('clubDlg'); if (dlg && !dlg.classList.contains('hidden')) { e.stopPropagation(); CP.close(); } } }, true);
})(typeof window !== 'undefined' ? window : globalThis);
