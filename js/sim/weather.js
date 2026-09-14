/* Hava koşulları — simülasyon tarafı (Node + tarayıcı ortak)
   Ön ayarlar: clear (açık), night (gece açık), cloudy (bulutlu), rain (yağmur), storm (sağanak + rüzgâr), snow (kar), fog (sis), hot (sıcak).
   Fiziğe etkileri (hepsi katsayı; oyun kuralları değişmez):
     - ball.roll      : zemin yuvarlanma yavaşlaması çarpanı (ıslak çim kaygan → top daha uzun yuvarlanır; kar → çok yavaş)
     - ball.bounce    : sekme katsayısı çarpanı (ıslak/karlı zeminde top ölü sekme yapar)
     - ball.drag      : hava direnci çarpanı (yağmurda hafif fazla, sıcak/kuru havada hafif az)
     - wind {x,z}     : m/s yatay rüzgâr; uçan topu iter, yerdeki topu çok az etkiler (rüzgâr gücüne göre). Sağanakta salınımlı (gust).
     - player.speed   : koşu hızı çarpanı, player.accel : ivme, player.turn : dönüş çevikliği (ıslak zemin/kar kayar)
     - player.stamina : kondisyon tükenme çarpanı (sıcakta hızlı yorulma)
     - control        : top kontrolü/pas isabeti hata çarpanı (ıslak top kayar; sis görüşü azaltır → uzun pas hatası artar)
     - slip           : kayma/düşme ihtimali çarpanı (müdahale ve sert dönüşlerde)
     - gkHandling     : kaleci topu tutma ihtimali çarpanı (ıslak top elden kaçar → daha çok çelme/parry)
     - injury         : sakatlanma çarpanı
   Görsel taraf js/render/weather_fx.js içinde (Babylon parçacıkları, sis, ışık, zemin parlaklığı). */
(function (root) {
  const FS = (root.FS = root.FS || {});
  const M = FS.M;

  const PRESETS = {
    clear:  { id: 'clear',  name: 'Açık',        icon: 'sun',           tempC: 21, desc: 'Kuru zemin, hafif esinti',
              ball: { roll: 1.0, bounce: 1.0, drag: 1.0 }, windSpeed: 1.0, gust: 0.2,
              player: { speed: 1.0, accel: 1.0, turn: 1.0, stamina: 1.0 }, control: 1.0, slip: 1.0, gkHandling: 1.0, injury: 1.0, visibility: 1.0 },
    night:  { id: 'night',  name: 'Gece',        icon: 'moon',          tempC: 14, desc: 'Projektör ışığında akşam maçı',
              ball: { roll: 0.97, bounce: 1.0, drag: 1.0 }, windSpeed: 0.8, gust: 0.2,
              player: { speed: 1.0, accel: 1.0, turn: 1.0, stamina: 0.97 }, control: 1.0, slip: 1.05, gkHandling: 1.0, injury: 1.0, visibility: 1.0 },
    cloudy: { id: 'cloudy', name: 'Bulutlu',     icon: 'cloud',         tempC: 16, desc: 'Kapalı gökyüzü, orta rüzgâr',
              ball: { roll: 1.0, bounce: 1.0, drag: 1.0 }, windSpeed: 3.5, gust: 0.4,
              player: { speed: 1.0, accel: 1.0, turn: 1.0, stamina: 1.0 }, control: 1.0, slip: 1.0, gkHandling: 1.0, injury: 1.0, visibility: 1.0 },
    rain:   { id: 'rain',   name: 'Yağmur',      icon: 'cloud-rain',    tempC: 12, desc: 'Islak zemin: top hızlanır, kayar; sekme ölür',
              ball: { roll: 0.86, bounce: 0.72, drag: 1.04 }, windSpeed: 4.0, gust: 0.5,
              player: { speed: 0.975, accel: 0.95, turn: 0.9, stamina: 1.05 }, control: 1.18, slip: 1.8, gkHandling: 0.85, injury: 1.15, visibility: 0.9 },
    storm:  { id: 'storm',  name: 'Sağanak',     icon: 'cloud-lightning', tempC: 10, desc: 'Şiddetli yağmur ve sert, dönen rüzgâr',
              ball: { roll: 0.8, bounce: 0.62, drag: 1.06 }, windSpeed: 8.0, gust: 1.0,
              player: { speed: 0.96, accel: 0.92, turn: 0.85, stamina: 1.1 }, control: 1.35, slip: 2.4, gkHandling: 0.75, injury: 1.25, visibility: 0.75 },
    snow:   { id: 'snow',   name: 'Kar',         icon: 'snowflake',     tempC: -2, desc: 'Karlı zemin: top yavaş, oyuncular kayar (turuncu top)',
              ball: { roll: 1.45, bounce: 0.55, drag: 1.02 }, windSpeed: 3.0, gust: 0.5,
              player: { speed: 0.93, accel: 0.86, turn: 0.78, stamina: 1.08 }, control: 1.35, slip: 2.2, gkHandling: 0.9, injury: 1.2, visibility: 0.8 },
    fog:    { id: 'fog',    name: 'Sis',         icon: 'cloud-fog',     tempC: 8,  desc: 'Görüş düşük: uzun paslar ve şutlar isabetsiz',
              ball: { roll: 0.95, bounce: 0.95, drag: 1.0 }, windSpeed: 0.5, gust: 0.1,
              player: { speed: 1.0, accel: 1.0, turn: 0.97, stamina: 1.0 }, control: 1.2, slip: 1.2, gkHandling: 0.95, injury: 1.0, visibility: 0.45 },
    hot:    { id: 'hot',    name: 'Sıcak',       icon: 'thermometer-sun', tempC: 34, desc: 'Bunaltıcı sıcak: kondisyon hızlı tükenir, tempo düşer',
              ball: { roll: 1.03, bounce: 1.05, drag: 0.97 }, windSpeed: 0.8, gust: 0.2,
              player: { speed: 0.985, accel: 0.98, turn: 1.0, stamina: 1.45 }, control: 1.0, slip: 0.95, gkHandling: 1.0, injury: 1.1, visibility: 1.0 },
  };
  const ORDER = ['clear', 'night', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'hot'];

  const W = (FS.Weather = { PRESETS, ORDER });

  /* Rastgele hava: gerçekçi ağırlıklar (açık/bulutlu sık, kar/sağanak seyrek) */
  W.random = function () {
    const wts = { clear: 30, night: 18, cloudy: 18, rain: 14, storm: 5, snow: 4, fog: 5, hot: 6 };
    let tot = 0; for (const k in wts) tot += wts[k];
    let r = M.rand(0, tot);
    for (const k of ORDER) { r -= wts[k]; if (r <= 0) return k; }
    return 'clear';
  };

  /* Bir maç için hava durumu nesnesi. Rüzgâr yönü rastgele, gücü ön ayardan; sağanakta gust (ani esinti) salınımı. */
  W.create = function (id) {
    if (id === 'random' || !id) id = W.random();
    const p = PRESETS[id] || PRESETS.clear;
    const ang = M.rand(0, Math.PI * 2);
    const w = {
      id: p.id, name: p.name, icon: p.icon, desc: p.desc, tempC: p.tempC,
      ball: Object.assign({}, p.ball), player: Object.assign({}, p.player),
      control: p.control, slip: p.slip, gkHandling: p.gkHandling, injury: p.injury, visibility: p.visibility,
      windSpeed: p.windSpeed, windAng: ang, gust: p.gust,
      wind: { x: Math.cos(ang) * p.windSpeed, z: Math.sin(ang) * p.windSpeed },
      wet: p.id === 'rain' || p.id === 'storm', snow: p.id === 'snow', night: p.id === 'night' || p.id === 'storm',
      t: 0,
    };
    w.windText = W.windText(w);
    return w;
  };

  /* Zamanla değişen rüzgâr (ani esintiler): her karede çağrılır (ucuz) */
  W.update = function (w, dt) {
    if (!w) return;
    w.t += dt;
    const g = w.gust;
    // iki farklı frekansta salınım + yön sapması → doğal esinti
    const amp = 1 + g * (0.45 * Math.sin(w.t * 0.37) + 0.3 * Math.sin(w.t * 1.31 + 1.7));
    const dAng = g * 0.5 * Math.sin(w.t * 0.21 + 0.6);
    const sp = w.windSpeed * Math.max(0.1, amp);
    w.wind.x = Math.cos(w.windAng + dAng) * sp; w.wind.z = Math.sin(w.windAng + dAng) * sp;
  };

  W.windText = function (w) {
    const s = w.windSpeed;
    if (s < 1.5) return 'rüzgâr yok';
    const dirs = ['doğu', 'güneydoğu', 'güney', 'güneybatı', 'batı', 'kuzeybatı', 'kuzey', 'kuzeydoğu']; // +x doğu, +z güney (yayın kamerasından bakış)
    const i = Math.round(((w.windAng % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 4)) % 8;
    return `${Math.round(s * 3.6)} km/s ${dirs[i]} rüzgârı`;
  };

  /* Kısa özet (menü/skorbord/spiker) */
  W.summary = function (w) {
    if (!w) return '';
    return `${w.name} · ${w.tempC}°C · ${w.windText}`;
  };

  /* Uçan topa rüzgâr ivmesi (m/s²): hız farkına orantılı (kuadratik sürükleme yaklaşımı). Yerde top için zayıf. */
  W.windAccel = function (w, ball, out) {
    out.x = 0; out.z = 0;
    if (!w || w.windSpeed < 0.5) return out;
    const air = ball.y > FS.PITCH.BALL_R + 0.08;
    const k = air ? 0.045 : 0.006; // hava: rüzgâr hız farkı × k
    const rx = w.wind.x - ball.vx, rz = w.wind.z - ball.vz;
    const rl = Math.sqrt(rx * rx + rz * rz);
    out.x = rx * rl * k; out.z = rz * rl * k;
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
