/* Dokunmatik kontroller (mobil/tablet)
   - Sol alt: sabit, her zaman görünür sanal joystick (yön okları + topuz; bölgeye dokununca parmağın altına kayar) → FS.Human eksenine yön verir
   - Topuza çift dokunuş: sprint kilidi
   - Sağ alt: aksiyon düğmeleri (Pas, Şut, Orta/Uzun, Ara pası; basılı tut = güç), Sprint (aç/kapat), Oyuncu değiştir
   - Yalnızca dokunmatik cihazda ve insan kontrolü açıkken görünür; #game.touchctl sınıfı HUD yerleşimini uyarlar */
(function (root) {
  const FS = (root.FS = root.FS || {});
  const T = (FS.Touch = { inited: false, axis: { x: 0, y: 0, l: 0 }, joy: null, sprint: false, visible: false });
  const $ = (id) => document.getElementById(id);

  // Dokunmatik cihaz mı? Birincil işaretçi 'kaba' (parmak) ise, sayfada bir dokunma görüldüyse ya da dokunmatik ekranlı küçük cihazsa.
  // (Dokunmatik ekranlı dizüstülerde klavye kullanan biri boş yere düğme görmesin diye yalnızca maxTouchPoints'e bakılmaz.)
  T.isTouch = function () {
    try {
      if (T.touchSeen) return true;
      if (window.matchMedia && matchMedia('(pointer: coarse)').matches) return true;
      return (navigator.maxTouchPoints || 0) > 0 && Math.min(window.innerWidth, window.innerHeight) <= 900;
    } catch (e) { return false; }
  };

  T.init = function () {
    if (T.inited) return; T.inited = true;
    const H = FS.Human;
    const layer = $('touchLayer'), zone = $('joyZone'), base = $('joyBase'), knob = $('joyKnob');
    if (!layer || !zone) return;
    /* --- Sanal joystick (sabit, her zaman görünür) ---
       - Topuz merkezden en fazla R px uzaklaşır; DEAD px ölü bölge; eksen (-1..1) + büyüklük l → FS.Human.axis()
       - Bölgenin herhangi bir yerine dokunulursa joystick gövdesi parmağın altına kayar (rahat kavrama); bırakınca yerine döner
       - Yön okları: 8 yönde hangi yöne itildiğini gösterir (hafif titreşim destekleniyorsa yön değişiminde tık)
       - Çift dokunuş (topuza hızlı iki kez) → sprint kilidi aç/kapat (SPRINT düğmesiyle aynı) */
    const R = 46, DEAD = 6;
    const arrows = { up: base.querySelector('.joyArrow.up'), down: base.querySelector('.joyArrow.down'), left: base.querySelector('.joyArrow.left'), right: base.querySelector('.joyArrow.right') };
    let lastDir = '';
    const setArrows = (ax, ay, l) => {
      const dir = l < 0.15 ? '' : (ay > 0.45 ? 'up' : ay < -0.45 ? 'down' : '') + (ax > 0.45 ? 'right' : ax < -0.45 ? 'left' : '');
      if (dir !== lastDir) {
        lastDir = dir;
        for (const k in arrows) arrows[k].classList.toggle('on', dir.includes(k));
        if (dir && navigator.vibrate) { try { navigator.vibrate(6); } catch (err) { /* yoksay */ } }
      }
    };
    const setAxis = (dx, dy) => {
      const l = Math.hypot(dx, dy);
      const m = Math.max(0, Math.min(l, R) - DEAD) / (R - DEAD);
      T.axis = l > DEAD ? { x: (dx / l) * m, y: (-dy / l) * m, l: m } : { x: 0, y: 0, l: 0 };
      const k = Math.min(l, R); const kx = l > 0 ? (dx / l) * k : 0, ky = l > 0 ? (dy / l) * k : 0;
      knob.style.transform = `translate(${kx}px, ${ky}px)`;
      setArrows(T.axis.x, T.axis.y, T.axis.l);
    };
    const baseCenter = () => { const r = base.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; };
    let lastTap = 0;
    zone.addEventListener('pointerdown', (e) => {
      if (T.joy) return;
      const c = baseCenter();
      const inside = Math.hypot(e.clientX - c.x, e.clientY - c.y) <= c.r + 10;
      let ox = 0, oy = 0;
      if (!inside) { // joystick parmağın altına kaysın (bölge içinde kalacak şekilde)
        const zr = zone.getBoundingClientRect();
        ox = Math.max(zr.left + c.r - c.x, Math.min(zr.right - c.r - c.x, e.clientX - c.x));
        oy = Math.max(zr.top + c.r - c.y, Math.min(zr.bottom - c.r - c.y, e.clientY - c.y));
        base.style.transform = `translate(${ox}px, ${oy}px)`;
      }
      T.joy = { id: e.pointerId, x0: c.x + ox, y0: c.y + oy };
      base.classList.add('active');
      // sprint kilidi: topuza çift dokunuş
      const now = performance.now();
      if (inside && now - lastTap < 280) { T.sprint = !T.sprint; H.keys.ShiftLeft = T.sprint; base.classList.toggle('sprint', T.sprint); const sb = layer.querySelector('[data-key="Shift"]'); if (sb) sb.classList.toggle('on', T.sprint); }
      lastTap = now;
      setAxis(e.clientX - T.joy.x0, e.clientY - T.joy.y0);
      try { zone.setPointerCapture(e.pointerId); } catch (err) { /* yoksay */ }
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (!T.joy || e.pointerId !== T.joy.id) return;
      setAxis(e.clientX - T.joy.x0, e.clientY - T.joy.y0);
      e.preventDefault();
    });
    const end = (e) => {
      if (!T.joy || e.pointerId !== T.joy.id) return;
      T.joy = null; T.axis = { x: 0, y: 0, l: 0 };
      knob.style.transform = 'translate(0px, 0px)'; base.style.transform = ''; base.classList.remove('active');
      setArrows(0, 0, 0);
    };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    zone.addEventListener('contextmenu', (e) => e.preventDefault());
    T.resetJoy = () => { T.joy = null; T.axis = { x: 0, y: 0, l: 0 }; knob.style.transform = 'translate(0px, 0px)'; base.style.transform = ''; base.classList.remove('active'); setArrows(0, 0, 0); };

    // aksiyon düğmeleri
    for (const b of layer.querySelectorAll('button[data-key]')) {
      const code = b.dataset.key;
      const down = (e) => {
        e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch (err) { /* yoksay */ }
        if (!H.active) return;
        if (code === 'Shift') { T.sprint = !T.sprint; H.keys.ShiftLeft = T.sprint; b.classList.toggle('on', T.sprint); base.classList.toggle('sprint', T.sprint); return; }
        b.classList.add('down');
        if (code === 'KeyQ') { H.requestSwitch(); return; }
        if (code === 'KeyE') { H.gkRush = true; return; }
        H.keys[code] = true; H.beginCharge(code);
      };
      const up = (e) => {
        b.classList.remove('down');
        if (code === 'Shift' || code === 'KeyQ' || code === 'KeyE') return;
        H.keys[code] = false;
        if (H.charging === code) H.releaseCharge(code);
      };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    // uygulama arka plana düşerse tuşları bırak
    window.addEventListener('blur', () => T.resetJoy());
    // ilk dokunuşta katmanı aç (dokunmatik ekranlı bilgisayarlar); ekran döndürme/boyut değişiminde yeniden değerlendir
    window.addEventListener('touchstart', () => { if (!T.touchSeen) { T.touchSeen = true; if (H.active) T.show(true); } }, { passive: true });
    window.addEventListener('resize', () => { if (H.active) T.show(true); });
  };

  /* Katmanı göster/gizle: yalnızca dokunmatik cihazda ve kontrol modunda */
  T.show = function (on) {
    const layer = $('touchLayer'); if (!layer) return;
    const vis = !!on && T.isTouch();
    T.visible = vis;
    layer.classList.toggle('show', vis);
    const game = $('game'); if (game) game.classList.toggle('touchctl', vis);
    if (!vis) { if (T.resetJoy) T.resetJoy(); if (T.sprint) { T.sprint = false; if (FS.Human) FS.Human.keys.ShiftLeft = false; const sb = layer.querySelector('[data-key="Shift"]'); if (sb) sb.classList.remove('on'); const jb = $('joyBase'); if (jb) jb.classList.remove('sprint'); } }
  };
})(typeof window !== 'undefined' ? window : globalThis);
