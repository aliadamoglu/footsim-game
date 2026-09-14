/* Taktik paneli (maç içi): diziliş, ön ayar, hat/pres/tempo/genişlik kaydırıcıları, talimatlar, otomatik TD anahtarı.
   - Kontrol edilen takım için düzenlenebilir; izleme modunda iki takımın taktiği salt okunur izlenir ve otomatik TD günlüğü görünür.
   - Diziliş değişikliği anında uygulanır (oyuncular yeni ev pozisyonlarına yürür); duran topta anında yerleşir. */
(function (root) {
  const FS = (root.FS = root.FS || {});
  const U = (FS.TacticsUI = {});
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  U.team = 0;
  U.open = false;

  U.init = function () {
    const panel = $('tacPanel'); if (!panel) return;
    $('btnCloseTac').onclick = () => U.show(false);
    panel.addEventListener('input', (e) => {
      const el = e.target; if (!el.dataset.tac) return;
      const team = U.curTeam(); if (!team || !U.editable(team)) return;
      FS.Tactics.set(team, el.dataset.tac, parseFloat(el.value) / 100);
      U.render(false);
    });
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-form],[data-preset],[data-instr],[data-side],[data-auto],[data-manage]'); if (!b) return;
      const team = U.curTeam(); if (!team) return;
      const m = FS.App.match;
      if (b.dataset.side != null) { U.team = parseInt(b.dataset.side, 10); U.render(true); return; }
      if (b.dataset.manage != null) { const t = FS.Tactics.ensure(team); t.managed = !t.managed; if (t.managed) t.auto = false; else t.auto = true; FS.App.toast(t.managed ? `${team.short} taktiklerini sen yönetiyorsun` : `${team.short}: yapay zekâ yönetiyor`); U.render(true); return; }
      if (!U.editable(team)) return;
      if (b.dataset.form) { FS.Tactics.setFormation(m, team, b.dataset.form); team.tactics.preset = team.tactics.preset; m.instantShape = m.state !== 'play'; if (m.state !== 'play') { FS.AI.updateTeamShape(m, team); for (const p of m.playersOnPitch(team.index)) { p.spX = p.homeX; p.spZ = p.homeZ; } m.instantShape = false; } FS.App.toast(`Diziliş: ${b.dataset.form}`); m.emit('tactics', { team: team.index, preset: team.tactics.preset, formation: b.dataset.form, changedFormation: true, auto: false, minute: m.minuteLabel() }); }
      if (b.dataset.preset) { FS.Tactics.applyPreset(team, b.dataset.preset); FS.App.toast(`Taktik: ${FS.Tactics.PRESETS[b.dataset.preset].label}`); m.emit('tactics', { team: team.index, preset: b.dataset.preset, formation: team.tactics.formation, changedPreset: true, auto: false, minute: m.minuteLabel() }); }
      if (b.dataset.instr) FS.Tactics.setInstruction(team, b.dataset.instr, !team.tactics.instr[b.dataset.instr]);
      if (b.dataset.auto != null) { team.tactics.auto = !team.tactics.auto; FS.App.toast(team.tactics.auto ? 'Otomatik teknik direktör açık' : 'Taktikler elle yönetiliyor'); }
      U.render(true);
    });
  };

  U.curTeam = function () { const m = FS.App.match; return m ? m.teams[U.team] : null; };
  // düzenlenebilir: kontrol edilen takım ya da izleme modunda 'yönetiyorum' anahtarı açılan takım (teknik direktör modu)
  U.editable = function (team) { const m = FS.App.match; return !!(m && (m.humanTeam === team.index || (team.tactics && team.tactics.managed))); };

  U.show = function (on) {
    const panel = $('tacPanel'); if (!panel) return;
    U.open = !!on;
    panel.classList.toggle('hidden', !on);
    if (on) { const m = FS.App.match; if (m && m.humanTeam != null) U.team = m.humanTeam; U.render(true); }
  };
  U.toggle = function () { U.show(!U.open); };

  /* Mini saha: slotlar (hücum uzayı → soldan sağa hücum) */
  U.pitchSvg = function (team) {
    const slots = FS.FORMATIONS[team.tactics.formation] || team.slots;
    const players = FS.App.match.playersOnPitch(team.index);
    const c1 = team.kit.c1, c2 = team.kit.c2 || '#fff';
    let dots = '';
    slots.forEach((s, i) => {
      const p = players.find((q) => q.slot === i);
      const x = 6 + ((s.x + 52.5) / 105) * 88, y = 50 - (s.z / 68) * 88;
      const off = p && p.role !== p.pos && FS.Tactics.fit(p.role, p.pos) < 7;
      dots += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="4.2" fill="${s.role === 'GK' ? team.gkKit.c1 : c1}" stroke="${off ? '#ff8a65' : c2}" stroke-width="${off ? 1.6 : 0.9}"/><text y="1.4" font-size="3.6" text-anchor="middle" fill="#fff" font-weight="700">${p ? p.number : ''}</text><text y="9" font-size="3" text-anchor="middle" fill="rgba(255,255,255,.75)">${p ? esc(p.shortName).slice(0, 10) : s.role}</text></g>`;
    });
    // hat/pres göstergeleri: savunma hattı çizgisi (line) ve pres bölgesi
    const t = team.tactics;
    const lineX = 6 + ((-33 + (t.line - 0.5) * 16 + 52.5) / 105) * 88;
    const pressX = 94 - ((1 - t.press) * 0.55) * 88;
    return `<svg viewBox="0 0 100 100" class="tacPitch" preserveAspectRatio="xMidYMid meet">
      <rect x="4" y="4" width="92" height="92" rx="2" fill="#173d22" stroke="rgba(255,255,255,.35)" stroke-width=".8"/>
      <line x1="50" y1="4" x2="50" y2="96" stroke="rgba(255,255,255,.3)" stroke-width=".6"/><circle cx="50" cy="50" r="8" fill="none" stroke="rgba(255,255,255,.3)" stroke-width=".6"/>
      <rect x="4" y="30" width="14" height="40" fill="none" stroke="rgba(255,255,255,.3)" stroke-width=".6"/><rect x="82" y="30" width="14" height="40" fill="none" stroke="rgba(255,255,255,.3)" stroke-width=".6"/>
      <line x1="${lineX.toFixed(1)}" y1="6" x2="${lineX.toFixed(1)}" y2="94" stroke="#7fb3ff" stroke-width=".8" stroke-dasharray="2 1.5"/>
      <rect x="${pressX.toFixed(1)}" y="4" width="${(96 - pressX).toFixed(1)}" height="92" fill="rgba(255,80,80,.14)"/>
      ${dots}
      <text x="50" y="99" font-size="3" text-anchor="middle" fill="rgba(255,255,255,.55)">hücum yönü →   ┈ savunma hattı   ▮ pres bölgesi</text>
    </svg>`;
  };

  U.render = function (full) {
    const m = FS.App.match; if (!m || !U.open) return;
    const T = FS.Tactics;
    const team = m.teams[U.team]; const t = T.ensure(team);
    const edit = U.editable(team);
    $('tacTitle').innerHTML = `${FS.icon('layers', 14)}<b class="tacName">Taktik — ${esc(team.name)}</b>${edit ? '' : '<small>(izleme)</small>'}`;
    const sides = m.teams.map((tm, i) => `<button data-side="${i}" class="${i === U.team ? 'on' : ''}"><span class="c" style="background:${tm.kit.c1}"></span>${esc(tm.short)}</button>`).join('');
    const forms = T.FORMATION_LIST.map((f) => `<button data-form="${f}" class="${f === t.formation ? 'on' : ''}" title="${esc(T.FORMATION_DESC[f] || '')}" ${edit ? '' : 'disabled'}>${f}</button>`).join('');
    const presets = T.PRESET_LIST.map((k) => { const p = T.PRESETS[k]; return `<button data-preset="${k}" class="${k === t.preset ? 'on' : ''}" title="${esc(p.desc)}" ${edit ? '' : 'disabled'}>${FS.icon(p.icon, 13)}<span>${p.label}</span></button>`; }).join('');
    const slider = (k, label, lo, hi) => `<label class="tacSl"><span>${label}</span><input type="range" min="0" max="100" value="${Math.round(t[k] * 100)}" data-tac="${k}" ${edit ? '' : 'disabled'}><small>${lo}</small><small class="r">${hi}</small></label>`;
    const instr = Object.keys(T.INSTRUCTIONS).map((k) => { const d = T.INSTRUCTIONS[k]; return `<button data-instr="${k}" class="chip ${t.instr[k] ? 'on' : ''}" title="${esc(d.desc)}" ${edit ? '' : 'disabled'}>${FS.icon(t.instr[k] ? 'square-check' : 'square', 13)}<span>${d.label}</span></button>`; }).join('');
    const log = (t.log || []).slice(-4).reverse().map((l) => `<li>${l.min}' ${T.presetText(l.preset, l.formation)}</li>`).join('') || '<li>Henüz değişiklik yok</li>';
    const roles = m.playersOnPitch(team.index).filter((p) => p.role !== p.pos && T.fit(p.role, p.pos) < 7).map((p) => `${esc(p.shortName)} (${p.pos}→${p.role})`).join(', ');
    $('tacBody').innerHTML = `
      <div class="tacSides">${sides}<span class="sp"></span>${m.humanTeam !== team.index ? `<button data-manage="1" class="chip ${t.managed ? 'on' : ''}" title="İzleme modunda bu takımın teknik direktörü ol: diziliş ve taktikleri sen belirle">${FS.icon(t.managed ? 'square-check' : 'square', 13)}<span>Ben yönetiyorum</span></button>` : ''}${edit ? `<button data-auto="1" class="chip auto ${t.auto ? 'on' : ''}" title="Skor ve dakikaya göre taktikleri yapay zekâ yönetsin">${FS.icon(t.auto ? 'square-check' : 'square', 13)}<span>Otomatik TD</span></button>` : ''}</div>
      <div class="tacCols">
        <div class="tacLeft">${U.pitchSvg(team)}${roles ? `<div class="tacWarn">${FS.icon('triangle-alert', 12)} Mevki dışı: ${roles}</div>` : ''}</div>
        <div class="tacRight">
          <h4>Diziliş</h4><div class="tacGrid forms">${forms}</div>
          <h4>Oyun planı</h4><div class="tacGrid presets">${presets}</div>
          ${slider('line', 'Savunma hattı', 'derin', 'yüksek')}${slider('press', 'Pres', 'bekle', 'yoğun')}${slider('tempo', 'Tempo', 'top tut', 'hızlı')}${slider('width', 'Genişlik', 'dar', 'geniş')}${slider('mentality', 'Mentalite', 'savunma', 'hücum')}
          <h4>Talimatlar</h4><div class="tacChips">${instr}</div>
          <h4>Teknik direktör günlüğü</h4><ul class="tacLog">${log}</ul>
        </div>
      </div>`;
  };
})(typeof window !== 'undefined' ? window : globalThis);
