/* Video kaydı (YouTube için) — canvas.captureStream + WebAudio karışımı → MediaRecorder
   - Kaydet: HUD'daki düğme ya da R tuşu. Durdur: aynı düğme → kaydetme ekranı (önizleme, dosya adı, İndir / Paylaş / Sil)
   - Biçim: tarayıcı destekliyorsa MP4 (H.264/AAC, Safari ve yeni Chrome), yoksa WebM (VP9/VP8 + Opus). YouTube ikisini de kabul eder.
   - Ses: FS.Audio.bus'tan alınır (kalabalık, düdük, spiker); kullanıcı sesi kapatsa bile kayda girer.
   - Görüntü: WebGL kanvası her karede bir kompozit kanvasa kopyalanır ve üstüne yayın tarzı skor tabelası + gol/kart bandı + saat çizilir
     (HTML HUD videoya girmez; bu sayede video "TV yayını" gibi görünür). Çözünürlük en fazla 1920 px genişlik.
   - Sahne durakladığında/ara sahnede kayıt sürer (yayın gibi); menüye dönülürse kayıt otomatik durdurulur. */
(function (root) {
  const FS = (root.FS = root.FS || {});
  const R = (FS.Recorder = { rec: null, chunks: [], t0: 0, blob: null, url: null, mime: '', ext: 'webm', active: false, timer: null, supported: false });
  const $ = (id) => document.getElementById(id);

  const CANDIDATES = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm',
  ];
  R.pickMime = function () {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
    for (const m of CANDIDATES) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* devam */ } }
    return '';
  };
  R.isSupported = function () {
    const c = $('renderCanvas');
    return !!(c && c.captureStream && typeof MediaRecorder !== 'undefined' && R.pickMime());
  };

  R.init = function () {
    R.supported = R.isSupported();
    const btn = $('btnRec'); if (!btn) return;
    if (!R.supported) { btn.disabled = true; btn.title = 'Bu tarayıcı video kaydını desteklemiyor (Chrome, Edge, Firefox veya Safari 14.1+ deneyin)'; }
    btn.onclick = () => { R.toggle(); btn.blur(); };
    $('recSave').onclick = () => R.download();
    $('recDiscard').onclick = () => R.discard();
    $('recShare').onclick = () => R.share();
    $('recDlg').addEventListener('click', (e) => { if (e.target === $('recDlg')) { /* dışarı tıklama kapatmaz: kayıt kaybolmasın */ } });
  };

  R.toggle = function () { if (R.active) R.stop(); else R.start(); };

  R.start = function () {
    if (R.active || !R.supported) return;
    const canvas = $('renderCanvas');
    if (R.url) { URL.revokeObjectURL(R.url); R.url = null; R.blob = null; }
    // kompozit kanvas: oyun görüntüsü + yayın grafikleri; en fazla 1920 px genişlik (1080p)
    const sw = canvas.width || canvas.clientWidth || 1280, sh = canvas.height || canvas.clientHeight || 720;
    const scale = Math.min(1, 1920 / sw);
    const comp = (R.comp = document.createElement('canvas'));
    comp.width = Math.max(2, Math.round(sw * scale) & ~1); comp.height = Math.max(2, Math.round(sh * scale) & ~1); // çift sayı: H.264 uyumu
    R.cctx = comp.getContext('2d', { alpha: false });
    R.frames = 0;
    R.onFrame(); // ilk kare
    let stream;
    try { stream = comp.captureStream(60); } catch (e) { try { stream = comp.captureStream(); } catch (e2) { FS.App.toast('Kayıt başlatılamadı'); return; } }
    // ses karışımı: WebAudio bus → MediaStreamDestination (ses hiç açılmadıysa kayıt için başlat, hoparlörü sessiz tut)
    R.audioDest = null;
    const Au = FS.Audio;
    if (Au && !Au.enabled) { try { Au.init(); if (Au.master) Au.master.gain.value = 0; } catch (e) { /* ses yok */ } }
    if (Au && Au.enabled && Au.ctx && Au.bus) {
      try {
        const dest = Au.ctx.createMediaStreamDestination();
        Au.bus.connect(dest); R.audioDest = dest;
        for (const tr of dest.stream.getAudioTracks()) stream.addTrack(tr);
      } catch (e) { console.warn('Kayıt ses karışımı eklenemedi:', e); }
    }
    const mime = R.pickMime();
    const isMp4 = /mp4/.test(mime);
    let rec;
    try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 }); }
    catch (e) { try { rec = new MediaRecorder(stream); } catch (e2) { FS.App.toast('Kayıt başlatılamadı: ' + e2.message); return; } }
    R.mime = rec.mimeType || mime; R.ext = /mp4/.test(R.mime) ? 'mp4' : 'webm';
    R.chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) R.chunks.push(e.data); };
    rec.onstop = () => R.onStopped();
    rec.onerror = (e) => { console.warn('MediaRecorder hata:', e); FS.App.toast('Kayıt hatası'); };
    rec.start(1000); // 1 sn'lik parçalar: uzun kayıtlarda bellek/kurtarma
    R.rec = rec; R.stream = stream; R.active = true; R.t0 = performance.now();
    $('btnRec').classList.add('rec'); $('btnRecLabel').textContent = 'Durdur'; FS.setIcon($('btnRec').querySelector('[data-icon]'), 'square', 15);
    $('recTag').classList.add('show');
    R.timer = setInterval(R.tick, 500); R.tick();
    FS.App.toast(`Kayıt başladı (${isMp4 ? 'MP4' : 'WebM'}) · durdurmak için R`);
  };

  R.tick = function () {
    const s = Math.floor((performance.now() - R.t0) / 1000);
    $('recTime').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  R.stop = function () {
    if (!R.active) return;
    R.active = false;
    clearInterval(R.timer); R.timer = null;
    R.dur = (performance.now() - R.t0) / 1000;
    R.stopping = true;
    const rec = R.rec;
    // Kaydetme ekranı MUTLAKA açılmalı: onstop bazı tarayıcılarda (özellikle duraklatılmış/arka plandaki sekmede ya da
    // captureStream'e kare gelmezken) geç gelir ya da hiç gelmez → 1.5 sn içinde gelmezse eldeki parçalarla ekran açılır.
    clearTimeout(R.stopGuard);
    R.stopGuard = setTimeout(() => { if (R.stopping) { console.warn('MediaRecorder onstop gelmedi — eldeki parçalarla devam'); R.onStopped(); } }, 1500);
    try {
      if (rec && rec.state === 'recording') { try { rec.requestData(); } catch (e) { /* bazı tarayıcılarda yok */ } rec.stop(); }
      else if (rec && rec.state === 'paused') { rec.resume(); rec.stop(); }
      else R.onStopped();
    } catch (e) { R.onStopped(); }
    $('btnRec').classList.remove('rec'); $('btnRecLabel').textContent = 'Kaydet'; FS.setIcon($('btnRec').querySelector('[data-icon]'), 'video', 15);
    $('recTag').classList.remove('show');
  };

  R.onStopped = function () {
    if (!R.stopping) return; // iki kez çağrılmasın (onstop + zaman aşımı)
    R.stopping = false; clearTimeout(R.stopGuard);
    try { if (R.audioDest) { FS.Audio.bus.disconnect(R.audioDest); R.audioDest = null; } } catch (e) { /* yoksay */ }
    try { if (R.stream) for (const tr of R.stream.getTracks()) tr.stop(); } catch (e) { /* yoksay */ }
    R.stream = null; R.rec = null; R.comp = null; R.cctx = null;
    if (!R.chunks.length) { FS.App.toast('Kayıt boş — hiçbir kare alınamadı'); if (FS.App.syncPauseMenu) FS.App.syncPauseMenu(); return; }
    R.blob = new Blob(R.chunks, { type: R.mime.split(';')[0] });
    R.chunks = [];
    R.url = URL.createObjectURL(R.blob);
    R.openDialog();
  };

  /* Her render karesinden sonra çağrılır (App.frame): oyun görüntüsünü kopyala, yayın grafiklerini çiz */
  R.onFrame = function () {
    if (!R.cctx) return;
    const c = R.cctx, comp = R.comp, src = $('renderCanvas');
    try { c.drawImage(src, 0, 0, comp.width, comp.height); } catch (e) { return; }
    R.frames++;
    R.drawOverlay(c, comp.width, comp.height);
  };
  R.drawOverlay = function (c, W, H) {
    const App = FS.App, m = App.match; if (!m) return;
    const k = Math.max(0.6, Math.min(1.6, W / 1280)); // ölçek
    const T = m.teams;
    const font = (px, w) => `${w || 700} ${Math.round(px * k)}px "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
    c.save();
    c.textBaseline = 'middle';
    // --- skor tabelası (sol üst) ---
    const x0 = 24 * k, y0 = 20 * k, h = 40 * k, r = 8 * k;
    c.font = font(19, 800);
    const wHome = c.measureText(T[0].short).width, wAway = c.measureText(T[1].short).width;
    c.font = font(21, 900);
    const scoreTxt = `${T[0].score} - ${T[1].score}`; const wScore = c.measureText(scoreTxt).width + 30 * k;
    c.font = font(16, 600);
    const clockTxt = m.clockText(); const halfTxt = m.state === 'halftime' ? 'DA' : m.state === 'fulltime' ? 'MS' : m.half === 1 ? '1Y' : '2Y';
    const wClock = c.measureText(clockTxt).width + c.measureText(halfTxt).width + 40 * k;
    const wTeam = (w) => w + 44 * k;
    const total = wTeam(wHome) + wScore + wTeam(wAway) + wClock;
    // arka plan
    const rr = (x, y, w, hh, rad) => { c.beginPath(); c.moveTo(x + rad, y); c.arcTo(x + w, y, x + w, y + hh, rad); c.arcTo(x + w, y + hh, x, y + hh, rad); c.arcTo(x, y + hh, x, y, rad); c.arcTo(x, y, x + w, y, rad); c.closePath(); };
    c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 12 * k; c.shadowOffsetY = 3 * k;
    c.fillStyle = 'rgba(8,10,20,.78)'; rr(x0, y0, total, h, r); c.fill();
    c.shadowColor = 'transparent';
    let x = x0;
    const team = (ti, w, left) => {
      const kit = T[ti].kit || {}; const col = kit.c1 || '#fff';
      const bx = left ? x + 12 * k : x + w + 44 * k - 12 * k - 8 * k;
      c.fillStyle = col; c.fillRect(bx, y0 + 8 * k, 8 * k, h - 16 * k);
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1; c.strokeRect(bx + 0.5, y0 + 8 * k + 0.5, 8 * k - 1, h - 16 * k - 1);
      c.fillStyle = '#fff'; c.font = font(19, 800); c.textAlign = 'left';
      c.fillText(T[ti].short, left ? x + 28 * k : x + 14 * k, y0 + h / 2 + 1);
      x += w + 44 * k;
    };
    team(0, wHome, true);
    c.fillStyle = 'rgba(255,255,255,.92)'; c.fillRect(x, y0, wScore, h);
    c.fillStyle = '#000'; c.font = font(21, 900); c.textAlign = 'center'; c.fillText(scoreTxt, x + wScore / 2, y0 + h / 2 + 1); x += wScore;
    team(1, wAway, false);
    c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(x, y0, wClock, h);
    c.fillStyle = 'rgba(255,255,255,.6)'; c.font = font(12, 700); c.textAlign = 'left'; c.fillText(halfTxt, x + 12 * k, y0 + h / 2 + 1);
    c.fillStyle = '#fff'; c.font = font(16, 600); c.fillText(clockTxt, x + 12 * k + c.measureText(halfTxt).width + 12 * k, y0 + h / 2 + 1);
    // --- band (gol / kart / VAR / penaltı): HTML banner görünürken aynı metin ---
    const b = document.getElementById('banner');
    if (b && b.classList.contains('show')) {
      const title = (document.getElementById('bannerTitle').textContent || '').trim(), sub = (document.getElementById('bannerSub').textContent || '').trim();
      if (title) {
        c.font = font(26, 900); const tw = c.measureText(title).width;
        c.font = font(14, 500); const sw2 = c.measureText(sub).width;
        const bw = Math.max(320 * k, Math.max(tw, sw2) + 60 * k), bh = (sub ? 64 : 46) * k, bx = W / 2 - bw / 2, by = 78 * k;
        c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 14 * k; c.shadowOffsetY = 4 * k;
        c.fillStyle = 'rgba(8,10,20,.8)'; rr(bx, by, bw, bh, 8 * k); c.fill(); c.shadowColor = 'transparent';
        c.fillStyle = b.classList.contains('yellow') ? '#ffd400' : b.classList.contains('red') ? '#e53935' : b.classList.contains('var') ? '#7fb3ff' : (b.style.borderLeftColor || '#fff');
        c.fillRect(bx, by, 6 * k, bh);
        c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = font(26, 900);
        c.fillText(title, bx + 24 * k, by + (sub ? 22 : 23) * k);
        if (sub) { c.fillStyle = 'rgba(255,255,255,.85)'; c.font = font(14, 500); c.fillText(sub, bx + 24 * k, by + 46 * k); }
      }
    }
    // tekrar etiketi
    if (App.replayMode) { c.fillStyle = 'rgba(200,20,40,.85)'; rr(W - 24 * k - 120 * k, 22 * k, 120 * k, 30 * k, 5 * k); c.fill(); c.fillStyle = '#fff'; c.font = font(13, 800); c.textAlign = 'center'; c.fillText('● TEKRAR', W - 24 * k - 60 * k, 37 * k + 1); }
    // filigran
    c.globalAlpha = 0.55; c.fillStyle = '#fff'; c.font = font(13, 800); c.textAlign = 'right'; c.fillText('footsim · 2026-27', W - 18 * k, H - 16 * k); c.globalAlpha = 1;
    c.restore();
  };

  R.defaultName = function () {
    const m = FS.App.match; const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    const tail = m ? `${m.teams[0].short}-${m.teams[1].short}_${m.teams[0].score}-${m.teams[1].score}` : 'mac';
    return `footsim_${tail}_${stamp}`;
  };

  R.openDialog = function () {
    const dlg = $('recDlg'); const v = $('recPreview');
    v.src = R.url; v.load();
    // MediaRecorder çıktısında süre bilgisi yoktur (Infinity): sona sarıp başa dönerek tarayıcıya süreyi hesaplat
    v.onloadedmetadata = () => { if (v.duration === Infinity) { v.currentTime = 1e101; v.ontimeupdate = () => { v.ontimeupdate = null; v.currentTime = 0; }; } };
    const mb = (R.blob.size / 1048576).toFixed(1);
    const dur = R.dur || 0;
    $('recInfo').textContent = `Süre ${Math.floor(dur / 60)}:${String(Math.floor(dur % 60)).padStart(2, '0')} · Boyut ${mb} MB · Biçim ${R.ext.toUpperCase()} (${R.mime.split(';')[0]})`;
    $('recFmt').textContent = R.ext === 'mp4' ? 'MP4 doğrudan YouTube\'a yüklenebilir.' : 'WebM dosyaları YouTube tarafından doğrudan kabul edilir (dönüştürme gerekmez).';
    $('recName').value = R.defaultName();
    const canShare = !!(navigator.canShare && (() => { try { return navigator.canShare({ files: [new File([R.blob], 'a.' + R.ext, { type: R.blob.type })] }); } catch (e) { return false; } })());
    $('recShare').classList.toggle('hidden', !canShare);
    // Diyalog her zaman en üstte: menüden (#menu) ya da oyundan (#game, duraklatma menüsü açıkken) çağrılabilir.
    if (dlg.parentElement !== document.body) document.body.appendChild(dlg);
    dlg.classList.remove('hidden');
    // kayıt ekranı açıkken oyun duraklasın; duraklatma menüsü açıksa gizlenir ve kapanınca geri gelir
    const pm = document.getElementById('pauseMenu');
    R.pauseMenuWasOpen = !!(pm && !pm.classList.contains('hidden') && FS.App.match);
    R.pausedBefore = FS.App.paused; FS.App.paused = true; if (pm) pm.classList.add('hidden');
    FS.applyIcons(dlg);
    // tam ekran oyun kanvası varken diyalog odak alsın (klavye kısayolları yazı alanına karışmasın)
    try { $('recName').focus({ preventScroll: true }); $('recName').select(); } catch (e) { /* yoksay */ }
  };
  R.closeDialog = function () {
    const dlg = $('recDlg'); dlg.classList.add('hidden');
    const v = $('recPreview'); try { v.pause(); } catch (e) { /* yoksay */ } v.removeAttribute('src'); v.load();
    if (R.pauseMenuWasOpen && FS.App.match && FS.App.setPaused) { R.pauseMenuWasOpen = false; FS.App.setPaused(true); return; } // duraklatma menüsüne geri dön
    if (!R.pausedBefore) FS.App.paused = false;
    // duraklat düğmesi görünümünü eşitle
    const pb = $('btnPause'); if (pb) { FS.setIcon(pb, FS.App.paused ? 'play' : 'pause'); pb.classList.toggle('on', FS.App.paused); }
  };
  R.safeName = function () {
    let n = ($('recName').value || R.defaultName()).trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_');
    if (!n) n = R.defaultName();
    if (!n.toLowerCase().endsWith('.' + R.ext)) n += '.' + R.ext;
    return n;
  };
  R.download = function () {
    if (!R.blob) return;
    const a = document.createElement('a'); a.href = R.url; a.download = R.safeName(); document.body.appendChild(a); a.click(); a.remove();
    FS.App.toast('Video indirildi: ' + a.download);
    R.closeDialog();
  };
  R.share = async function () {
    if (!R.blob) return;
    try {
      const f = new File([R.blob], R.safeName(), { type: R.blob.type });
      await navigator.share({ files: [f], title: 'footsim maç videosu' });
      R.closeDialog();
    } catch (e) { if (e && e.name !== 'AbortError') FS.App.toast('Paylaşılamadı: ' + e.message); }
  };
  R.discard = function () {
    if (R.url) URL.revokeObjectURL(R.url);
    R.url = null; R.blob = null;
    R.closeDialog();
    FS.App.toast('Kayıt silindi');
  };
})(typeof window !== 'undefined' ? window : globalThis);
