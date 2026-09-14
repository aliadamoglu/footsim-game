/* Prosedürel stadyum sesi (WebAudio) — kalabalık uğultusu, tezahürat dalgaları, düdük, top vuruşu */
(function (root) {
  const FS = (root.FS = root.FS || {});
  const Au = (FS.Audio = { ctx: null, enabled: false, crowdGain: null, excitement: 0 });

  Au.init = function () {
    if (Au.ctx) { if (Au.ctx.state === 'suspended') Au.ctx.resume(); return; }
    const ctx = (Au.ctx = new (window.AudioContext || window.webkitAudioContext)());
    // bus: tüm kaynakların toplandığı karışım hattı (video kaydı buradan alınır; sessize alınsa da kayda ses gider)
    // master: kullanıcı ses seviyesi / sessiz
    const bus = (Au.bus = ctx.createGain()); bus.gain.value = 1;
    const master = (Au.master = ctx.createGain()); master.gain.value = 0.7; bus.connect(master); master.connect(ctx.destination);
    // kalabalık: filtreli kahverengi gürültü
    const bufLen = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(2, bufLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let last = 0;
      for (let i = 0; i < bufLen; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.5;
    const cg = (Au.crowdGain = ctx.createGain()); cg.gain.value = 0.25;
    src.connect(bp); bp.connect(cg); cg.connect(bus); src.start();
    Au.crowdFilter = bp;
    // ikinci katman: yüksek frekans "ıslık/çığlık" — heyecanda artar
    const src2 = ctx.createBufferSource(); src2.buffer = buf; src2.loop = true; src2.playbackRate.value = 1.7;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
    const g2 = (Au.crowdHi = ctx.createGain()); g2.gain.value = 0.0;
    src2.connect(hp); hp.connect(g2); g2.connect(bus); src2.start();
    Au.enabled = true;
    // spiker sesleri (sprite bankaları) aynı bağlama yüklenir
    if (FS.Voice) FS.Voice.load(ctx, bus);
  };

  Au.update = function (dt, intensity, state) {
    if (!Au.enabled) return;
    const target = state === 'play' ? 0.18 + intensity * 0.25 : 0.14;
    Au.excitement += (Math.max(target, Au.excitement - dt * 0.15) - Au.excitement) * (1 - Math.exp(-dt * 2));
    const t = Au.ctx.currentTime;
    const duck = FS.Voice ? FS.Voice.duck() : 1; // spiker konuşurken kalabalık kısılır
    Au.crowdGain.gain.setTargetAtTime(Au.excitement * duck, t, 0.2);
    Au.crowdHi.gain.setTargetAtTime(Math.max(0, Au.excitement - 0.2) * 0.6 * duck, t, 0.2);
    Au.crowdFilter.frequency.setTargetAtTime(400 + Au.excitement * 900, t, 0.3);
  };

  Au.roar = function (amount) { if (!Au.enabled) return; Au.excitement = Math.min(1, Au.excitement + amount); };
  Au.groan = function () { if (!Au.enabled) return; Au.excitement = Math.min(0.8, Au.excitement + 0.25); };

  Au.whistle = function (pattern) {
    if (!Au.enabled) return;
    const ctx = Au.ctx; const t0 = ctx.currentTime;
    const seq = pattern === 'long' ? [[0, 0.9]] : pattern === 'triple' ? [[0, 0.35], [0.45, 0.35], [0.9, 1.0]] : [[0, 0.5]];
    for (const [st, du] of seq) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 2900;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 2900 * 1.01;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 38; const lg = ctx.createGain(); lg.gain.value = 250; lfo.connect(lg); lg.connect(o.frequency);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0 + st); g.gain.exponentialRampToValueAtTime(0.12, t0 + st + 0.02); g.gain.setValueAtTime(0.12, t0 + st + du - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t0 + st + du);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3000; f.Q.value = 3;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(Au.bus);
      o.start(t0 + st); o2.start(t0 + st); lfo.start(t0 + st); o.stop(t0 + st + du + 0.05); o2.stop(t0 + st + du + 0.05); lfo.stop(t0 + st + du + 0.05);
    }
  };

  Au.kick = function (power) {
    if (!Au.enabled) return;
    const ctx = Au.ctx; const t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(160, t0); o.frequency.exponentialRampToValueAtTime(50, t0 + 0.12);
    const g = ctx.createGain(); const v = 0.15 + power * 0.35; g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    o.connect(g); g.connect(Au.bus); o.start(t0); o.stop(t0 + 0.2);
    // tık (deri)
    const n = ctx.createBufferSource(); const b = ctx.createBuffer(1, 2000, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < 2000; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 300);
    n.buffer = b; const ng = ctx.createGain(); ng.gain.value = 0.15 * power; n.connect(ng); ng.connect(Au.bus); n.start(t0);
  };

  Au.post = function () {
    if (!Au.enabled) return;
    const ctx = Au.ctx; const t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 620;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.3, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
    o.connect(g); g.connect(Au.bus); o.start(t0); o.stop(t0 + 0.7);
  };
})(typeof window !== 'undefined' ? window : globalThis);
