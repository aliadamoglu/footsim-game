/* Transfer merkezi ekranı: kadro yönetimi (ilk 11 ↔ yedek), pazar, teklif/pazarlık, satış, bütçe & maaş tavanı */
(function (root) {
  const FS = (root.FS = root.FS || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const POS_TR = { GK: 'KL', CB: 'STP', RB: 'SĞB', LB: 'SLB', RWB: 'SĞK', LWB: 'SLK', DM: 'ÖOS', CM: 'MOS', AM: 'OOS', RW: 'SĞA', LW: 'SLA', ST: 'SF' };
  const GROUP_TR = { ALL: 'Tümü', GK: 'Kaleci', DEF: 'Savunma', MID: 'Orta saha', ATT: 'Hücum' };

  const UI = (FS.TransferUI = {
    team: 'GS', selXi: -1, selBench: -1, filter: { pos: 'ALL', minOvr: 0, maxPrice: null, q: '' }, tab: 'market', sort: 'overall', msg: null, offerP: null, sellP: null,
  });

  UI.open = function (teamId) {
    UI.team = teamId || UI.team;
    UI.selXi = UI.selBench = -1; UI.msg = null;
    $('menu').classList.add('hidden');
    $('transfer').classList.remove('hidden');
    UI.render();
  };
  UI.close = function () {
    $('transfer').classList.add('hidden');
    if (UI.returnTo === 'career' && FS.CareerUI) { UI.returnTo = null; FS.CareerUI.open(); return; }
    $('menu').classList.remove('hidden');
    if (FS.App && FS.App.renderTeamGrid) { FS.App.renderTeamGrid(); FS.App.updateMenuSummary(); }
  };

  UI.render = function () {
    const T = FS.Transfer; const id = UI.team;
    const team = FS.getTeam(id); const fin = T.finance(id); const sq = T.squadOf(id); const bill = T.wageBill(id);
    const form = FS.FORMATIONS[team.formation];
    // --- başlık / finans
    { // kulüp listesi: lig başlıklarıyla gruplu (52 kulüp)
      const groups = []; for (const t of FS.TEAMS) { let g = groups.find((x) => x.league === t.league); if (!g) { g = { league: t.league, items: [] }; groups.push(g); } g.items.push(t); }
      $('trTeam').innerHTML = groups.map((g) => `<optgroup label="${esc(g.league)}">${g.items.map((t) => `<option value="${t.id}" ${t.id === id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>`).join('');
    }
    const capPct = Math.min(100, Math.round((bill / fin.wageCap) * 100));
    $('trFinance').innerHTML = `
      <div class="fin"><span>Transfer bütçesi</span><b class="${fin.budget < 5 ? 'bad' : ''}">${T.fmt(fin.budget)}</b></div>
      <div class="fin"><span>Maaş yükü / tavan (yıllık)</span><b class="${capPct > 92 ? 'warn' : ''}">${T.fmt(bill)} / ${T.fmt(fin.wageCap)}</b><i class="capbar"><u style="width:${capPct}%"></u></i></div>
      <div class="fin"><span>Kadro</span><b>${T.squadSize(id)} / 23 <small>(min 16)</small></b></div>
      <div class="fin"><span>Prestij · Hafta</span><b class="stars">${FS.icon('star', 14, 'on').repeat(Math.round(fin.prestige * 5))}${FS.icon('star', 14, 'off').repeat(5 - Math.round(fin.prestige * 5))} · ${T.state.week}</b></div>`;
    // --- kadro
    const rowP = (p, i, isXi) => {
      const sel = isXi ? UI.selXi === i : UI.selBench === i;
      const slot = isXi ? form[i] : null;
      const misfit = isXi && slot && slot.role !== p.pos && T.posGroup(slot.role) !== T.posGroup(p.pos);
      return `<tr class="${sel ? 'sel' : ''} ${misfit ? 'misfit' : ''}" data-k="${isXi ? 'xi' : 'bench'}" data-i="${i}" title="${isXi ? 'Yedekle yer değiştirmek için tıkla' : 'İlk 11 ile yer değiştirmek için tıkla'}">
        <td class="no">${p.number}</td><td class="nm">${esc(p.name)}${misfit ? ' <em title="Mevki uyumsuz: güç cezası">' + FS.icon('triangle-alert', 12) + '</em>' : ''}</td>
        <td class="pos">${slot ? `<small>${POS_TR[slot.role] || slot.role}</small> ` : ''}${POS_TR[p.pos] || p.pos}</td>
        <td class="ovr"><b class="o${Math.min(9, Math.floor((p.overall - 50) / 5))}">${p.overall}</b></td><td>${p.age}</td>
        <td class="num">${T.fmt(p.value)}</td><td class="num">${T.fmt(p.wage)}</td>
        <td class="act">${isXi ? '' : `<button class="mini sell" data-k="sell" data-i="${i}" title="Satışa çıkar">Sat</button>`}</td></tr>`;
    };
    const head = `<tr><th>#</th><th>Oyuncu</th><th>Mevki</th><th>Güç</th><th>Yaş</th><th>Değer</th><th>Maaş</th><th></th></tr>`;
    $('trXi').innerHTML = `<table class="sq">${head}${sq.xi.map((p, i) => rowP(p, i, true)).join('')}</table>`;
    $('trBench').innerHTML = `<table class="sq">${head}${sq.bench.map((p, i) => rowP(p, i, false)).join('')}</table>` + (sq.bench.length > 9 ? `<p class="note">Not: maça en iyi 9 yedek (kaleci dahil) götürülür.</p>` : '');
    $('trSquadHint').textContent = UI.selXi >= 0 ? `${sq.xi[UI.selXi].name} seçildi → yer değiştireceği yedeğe tıkla` : UI.selBench >= 0 ? `${sq.bench[UI.selBench].name} seçildi → çıkaracağın ilk 11 oyuncusuna tıkla` : 'İlk 11 ↔ yedek değişimi: önce bir oyuncuya, sonra diğer listeden birine tıkla. Ortalama güç: ' + Math.round(sq.xi.reduce((a, p) => a + p.overall, 0) / Math.max(1, sq.xi.length));
    // --- pazar
    const f = UI.filter;
    let list = T.market(id, { pos: f.pos, minOvr: f.minOvr || 0, maxPrice: f.maxPrice, q: f.q });
    list.sort((a, b) => (UI.sort === 'asking' ? a.asking - b.asking : UI.sort === 'age' ? a.age - b.age : UI.sort === 'value' ? b.value - a.value : b.overall - a.overall));
    const shown = list.slice(0, 80);
    $('trMarket').innerHTML = `<table class="mk"><tr><th>Kulüp</th><th>Oyuncu</th><th>Mevki</th><th data-s="overall" class="sortable ${UI.sort === 'overall' ? 'on' : ''}">Güç</th><th data-s="age" class="sortable ${UI.sort === 'age' ? 'on' : ''}">Yaş</th><th data-s="value" class="sortable ${UI.sort === 'value' ? 'on' : ''}">Değer</th><th data-s="asking" class="sortable ${UI.sort === 'asking' ? 'on' : ''}">İstenen</th><th>Maaş talebi</th><th></th></tr>` +
      shown.map((p, i) => `<tr><td class="club">${p.free ? '<i>Serbest</i>' : esc(p.club)}${p.starter ? ' <small>11</small>' : ''}</td><td class="nm">${esc(p.name)}</td><td>${POS_TR[p.pos] || p.pos}</td><td class="ovr"><b class="o${Math.min(9, Math.floor((p.overall - 50) / 5))}">${p.overall}</b></td><td>${p.age}</td><td class="num">${p.free ? '—' : T.fmt(p.value)}</td><td class="num">${p.free ? 'Bedelsiz' : T.fmt(p.asking)}</td><td class="num">${T.fmt(p.wageAsk)}/yıl</td><td class="act"><button class="mini buy" data-m="${i}" ${p.asking > fin.budget ? 'title="Bütçe yetersiz — pazarlık deneyebilirsin"' : ''}>Teklif</button></td></tr>`).join('') +
      `</table>` + (list.length > 80 ? `<p class="note">${list.length} sonuçtan ilk 80 gösteriliyor — filtreyi daralt.</p>` : list.length === 0 ? `<p class="note">Filtreye uyan oyuncu yok.</p>` : '');
    UI._market = shown;
    // --- geçmiş
    const hist = T.state.history.slice(0, 14);
    $('trHistory').innerHTML = hist.length ? `<ul>${hist.map((h) => `<li><span class="wk">H${h.week}</span> ${h.type === 'in' ? `<b>${esc(h.club)}</b> ← ${esc(h.name)} <small>(${esc(h.from)})</small> ${h.fee > 0 ? T.fmt(h.fee) : 'bedelsiz'}${h.wage ? `, maaş ${T.fmt(h.wage)}` : ''}` : `<b>${esc(h.club)}</b> → ${esc(h.name)} <small>(${esc(h.to)})</small> ${T.fmt(h.fee)}`}</li>`).join('')}</ul>` : '<p class="note">Henüz transfer yapılmadı.</p>';
    // --- mesaj
    const m = $('trMsg'); if (UI.msg) { m.textContent = UI.msg.text; m.className = 'trmsg show ' + (UI.msg.ok ? 'ok' : 'err'); } else m.className = 'trmsg';
  };

  /* ---------------- Teklif diyaloğu ---------------- */
  UI.windowClosed = () => !!(FS.Career && FS.Career.state && UI.returnTo === 'career' && !FS.Career.transferWindowOpen());
  UI.openOffer = function (p) {
    if (UI.windowClosed()) { UI.msg = { ok: false, text: 'Transfer penceresi kapalı (sezonun ilk 4 haftası ve devre arasından sonraki 4 hafta açık). Kadro düzenlemesi serbest.' }; UI.render(); return; }
    UI.offerP = p; const T = FS.Transfer; const fin = T.finance(UI.team);
    $('ofTitle').textContent = `${p.name} — ${p.free ? 'serbest oyuncu' : p.club}`;
    $('ofInfo').innerHTML = `${POS_TR[p.pos] || p.pos} · güç <b>${p.overall}</b> · ${p.age} yaş · piyasa değeri ${p.free ? '—' : T.fmt(p.value)}<br>` +
      `${p.free ? 'Bonservis yok.' : `${p.club} istiyor: <b>${T.fmt(p.asking)}</b>${p.starter ? ' (ilk 11 oyuncusu, prim dahil)' : ''}`} · Oyuncu maaş talebi: <b>${T.fmt(p.wageAsk)}/yıl</b><br>` +
      `<small>Bütçen ${T.fmt(fin.budget)} · maaş payın ${T.fmt(Math.max(0, fin.wageCap - T.wageBill(UI.team)))}. Düşük teklifler karşı teklifle döner; oyuncu prestiji düşük kulübe daha yüksek maaş ister.</small>`;
    $('ofFee').value = p.free ? 0 : Math.min(p.asking, Math.max(0, fin.budget)).toFixed(1); $('ofFee').disabled = !!p.free;
    $('ofWage').value = p.wageAsk.toFixed(1);
    $('ofResult').textContent = ''; $('ofResult').className = 'ofres'; $('ofAccept').classList.add('hidden');
    $('offerDlg').classList.remove('hidden');
  };
  UI.sendOffer = function () {
    const p = UI.offerP; if (!p) return;
    const res = FS.Transfer.makeOffer(UI.team, p, { fee: parseFloat($('ofFee').value) || 0, wage: parseFloat($('ofWage').value) || 0 });
    const r = $('ofResult'); r.textContent = res.reason; r.className = 'ofres ' + (res.ok ? 'ok' : 'err');
    if (res.ok) { UI.msg = { ok: true, text: res.reason }; setTimeout(() => { $('offerDlg').classList.add('hidden'); UI.render(); }, 900); }
    else if (res.counter && (res.counter.fee != null || res.counter.wage != null)) {
      UI.counter = res.counter;
      $('ofAccept').textContent = `Karşı teklifi doldur: ${res.counter.fee != null && !p.free ? FS.Transfer.fmt(res.counter.fee) + ' + ' : ''}maaş ${FS.Transfer.fmt(res.counter.wage)}`;
      $('ofAccept').classList.remove('hidden');
    } else $('ofAccept').classList.add('hidden');
  };

  /* ---------------- Satış diyaloğu ---------------- */
  UI.openSell = function (p) {
    if (UI.windowClosed()) { UI.msg = { ok: false, text: 'Transfer penceresi kapalı (sezonun ilk 4 haftası ve devre arasından sonraki 4 hafta açık). Kadro düzenlemesi serbest.' }; UI.render(); return; }
    UI.sellP = p; const T = FS.Transfer;
    const offers = T.offersFor(UI.team, p);
    $('slTitle').textContent = `${p.name} satışa çıkarıldı`;
    $('slInfo').innerHTML = `${POS_TR[p.pos] || p.pos} · güç <b>${p.overall}</b> · ${p.age} yaş · değer ${T.fmt(p.value)} · maaş ${T.fmt(p.wage)}/yıl`;
    $('slOffers').innerHTML = offers.length ? offers.map((o, i) => `<div class="offer"><span><b>${esc(o.clubName)}</b> teklif ediyor</span><b>${T.fmt(o.fee)}</b><button class="mini" data-o="${i}">Kabul et</button></div>`).join('') : '<p class="note">Bu hafta teklif gelmedi (yaş/mevki/bütçe). Serbest bırakabilir ya da sonraki maçtan sonra yeniden deneyebilirsin.</p>';
    UI._offers = offers;
    $('sellDlg').classList.remove('hidden');
  };

  /* ---------------- Olaylar ---------------- */
  UI.init = function () {
    if (!$('transfer')) return;
    $('trTeam').onchange = (e) => { UI.team = e.target.value; UI.selXi = UI.selBench = -1; UI.msg = null; UI.render(); };
    $('btnTrBack').onclick = () => UI.close();
    $('btnTrPlay').onclick = () => { if (UI.returnTo === 'career') { UI.close(); return; } if (FS.App) { FS.App.settings.home = UI.team; if (FS.App.settings.away === UI.team) FS.App.settings.away = FS.TEAMS.find((t) => t.id !== UI.team).id; } UI.close(); };
    $('btnTrReset').onclick = () => { if (confirm('Tüm transferler, kadro değişiklikleri ve bütçeler sezon başına sıfırlansın mı?')) { FS.Transfer.reset(); UI.msg = { ok: true, text: 'Sezon başı kadroları ve bütçeler geri yüklendi.' }; UI.render(); } };
    // kadro tıklamaları (delegasyon)
    const squadClick = (e) => {
      const btn = e.target.closest('button[data-k=sell]');
      if (btn) { const sq = FS.Transfer.squadOf(UI.team); UI.openSell(sq.bench[+btn.dataset.i]); e.stopPropagation(); return; }
      const tr = e.target.closest('tr[data-k]'); if (!tr) return;
      const k = tr.dataset.k, i = +tr.dataset.i;
      if (k === 'xi') { if (UI.selBench >= 0) UI.doSwap(i, UI.selBench); else UI.selXi = UI.selXi === i ? -1 : i; }
      else { if (UI.selXi >= 0) UI.doSwap(UI.selXi, i); else UI.selBench = UI.selBench === i ? -1 : i; }
      UI.render();
    };
    $('trXi').onclick = squadClick; $('trBench').onclick = squadClick;
    // pazar
    $('trPos').onchange = (e) => { UI.filter.pos = e.target.value; UI.render(); };
    $('trMinOvr').oninput = (e) => { UI.filter.minOvr = parseInt(e.target.value, 10) || 0; $('trMinOvrV').textContent = UI.filter.minOvr || '—'; UI.render(); };
    $('trMaxPrice').oninput = (e) => { const v = parseFloat(e.target.value); UI.filter.maxPrice = isNaN(v) || v <= 0 ? null : v; UI.render(); };
    $('trQ').oninput = (e) => { UI.filter.q = e.target.value.trim(); UI.render(); };
    $('trMarket').onclick = (e) => {
      const th = e.target.closest('th.sortable'); if (th) { UI.sort = th.dataset.s; UI.render(); return; }
      const b = e.target.closest('button[data-m]'); if (b) UI.openOffer(UI._market[+b.dataset.m]);
    };
    // teklif diyaloğu
    $('ofSend').onclick = () => UI.sendOffer();
    $('ofAccept').onclick = () => { const c = UI.counter; if (!c) return; if (c.fee != null && !UI.offerP.free) $('ofFee').value = (+c.fee).toFixed(1); if (c.wage != null) $('ofWage').value = (+c.wage).toFixed(1); $('ofAccept').classList.add('hidden'); };
    $('ofClose').onclick = () => { $('offerDlg').classList.add('hidden'); UI.render(); };
    // satış diyaloğu
    $('slOffers').onclick = (e) => {
      const b = e.target.closest('button[data-o]'); if (!b) return;
      const o = UI._offers[+b.dataset.o]; const res = FS.Transfer.sell(UI.team, UI.sellP, o.club, o.fee);
      UI.msg = { ok: res.ok, text: res.reason }; $('sellDlg').classList.add('hidden'); UI.render();
    };
    $('slRelease').onclick = () => { if (!confirm(`${UI.sellP.name} bedelsiz serbest bırakılsın mı? (maaş yükü düşer, bonservis gelmez)`)) return; const res = FS.Transfer.sell(UI.team, UI.sellP, null, 0); UI.msg = { ok: res.ok, text: res.reason }; $('sellDlg').classList.add('hidden'); UI.render(); };
    $('slClose').onclick = () => $('sellDlg').classList.add('hidden');
    // sekmeler
    document.querySelectorAll('#trTabs button').forEach((b) => (b.onclick = () => { document.querySelectorAll('#trTabs button').forEach((x) => x.classList.toggle('on', x === b)); document.querySelectorAll('.trTab').forEach((x) => x.classList.toggle('hidden', x.id !== b.dataset.t)); }));
    window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && !$('transfer').classList.contains('hidden')) { if (!$('offerDlg').classList.contains('hidden')) $('offerDlg').classList.add('hidden'); else if (!$('sellDlg').classList.contains('hidden')) $('sellDlg').classList.add('hidden'); else UI.close(); } });
  };
  UI.doSwap = function (xi, bench) {
    const res = FS.Transfer.swap(UI.team, xi, bench);
    UI.msg = res.ok ? { ok: true, text: 'Kadro güncellendi.' } : { ok: false, text: res.reason };
    UI.selXi = UI.selBench = -1;
  };

  window.addEventListener('DOMContentLoaded', () => UI.init());
})(typeof window !== 'undefined' ? window : globalThis);
