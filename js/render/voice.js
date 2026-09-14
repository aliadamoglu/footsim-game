/* Türkçe spiker v2 — cümle kuran sprite motoru
   - audio/voice/sprites.json: { anahtar: [banka, başlangıçSn, süreSn, kazanç] } → audio/voice/<banka>.mp3 (Web Audio ile çözülür)
   - Oyuncu adları iki tonda: "Osimhen" (düz, cümle içi) ve "x:Osimhen" (ünlemli, gol/şut için); takımlar kulüp kısaltmasıyla (GS, FB, RMA …)
   - Cümle = [tepki?] + [özne: ad/takım] + [yüklem] (+ skor): "Ne pozisyon! Osimhen! ... vuruyor!" gibi; tekrar önleme ve öncelikli kuyruk
   - Öncelik: gol/karar (3) > kart/penaltı/kurtarış (2) > duran top/faul/değişiklik (1) > renk cümleleri (0)
   - Yüksek öncelikli olaylar konuşmayı keser (interrupt); bayat satırlar (ttl) atılır; kalabalık sesi konuşurken kısılır (duck) */
(function (root) {
  const FS = (root.FS = root.FS || {});
  const M = FS.M;
  const V = (FS.Voice = {
    ready: false, loading: false, sprites: null, banks: {}, queue: [], playing: null, enabled: true,
    lastSaidT: {}, recent: [], idleT: 0, t: 0, gain: null, volume: 1.0, flavorT: 5, failed: false,
    lastNameT: {}, lastEventT: {}, stats: { said: 0 },
  });
  const GAP = 0.10; // kelimeler arası boşluk (s)
  const PAUSE = 0.28; // cümleler arası boşluk (s) — '|' ayırıcı
  const PRIO_TTL = [3.0, 6, 10, 30]; // önceliğe göre bekleme ömrü (s)

  /* ---------- yükleme ---------- */
  V.load = function (ctx, dest) {
    if (V.loading || V.ready || V.failed) return;
    V.loading = true; V.ctx = ctx;
    const g = (V.gain = ctx.createGain()); g.gain.value = V.volume; g.connect(dest || ctx.destination);
    fetch('audio/voice/sprites.json').then((r) => r.json()).then((sp) => {
      V.sprites = sp;
      const bankNames = Array.from(new Set(Object.values(sp).map((s) => s[0])));
      return Promise.all(bankNames.map((b) => fetch('audio/voice/' + b + '.mp3').then((r) => { if (!r.ok) throw new Error(b); return r.arrayBuffer(); }).then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej))).then((buf) => { V.banks[b] = buf; })));
    }).then(() => { V.ready = true; V.loading = false; }).catch((e) => { console.warn('Spiker sesleri yüklenemedi:', e); V.failed = true; V.loading = false; });
  };
  V.has = (k) => !!(V.sprites && V.sprites[k]);
  // oyuncu adı: düz ya da ünlemli ('x:' öneki); yoksa null
  V.nameKey = (p, excl) => {
    if (!p) return null;
    const k = p.shortName;
    if (!V.sprites) return k;
    if (excl && V.has('x:' + k)) return 'x:' + k;
    return V.has(k) ? k : (V.has('x:' + k) ? 'x:' + k : null);
  };
  const pick = (arr) => arr[Math.floor(M.random() * arr.length)];
  // son 40 sn'de söylenmemiş bir seçenek tercih et
  V.fresh = function (arr) {
    const ok = arr.filter((k) => !V.recent.includes(k));
    return pick(ok.length ? ok : arr);
  };

  /* ---------- kuyruk ---------- */
  // keys: sprite anahtarları (boş/eksik atlanır; '|' = cümle arası duraklama); prio 0..3; opts { ttl, interrupt, chance, dedupe, minGap }
  V.say = function (keys, prio, opts) {
    if (!V.enabled || V.failed) return false;
    const o = opts || {};
    if (o.chance != null && !M.chance(o.chance)) return false;
    const ks = (Array.isArray(keys) ? keys : [keys]).filter((k) => k && (k === '|' || !V.sprites || V.has(k)));
    if (!ks.some((k) => k !== '|')) return false;
    const dk = o.dedupe || ks.find((k) => k !== '|');
    if (o.minGap && V.lastSaidT[dk] != null && V.t - V.lastSaidT[dk] < o.minGap) return false;
    V.lastSaidT[dk] = V.t;
    prio = prio == null ? 1 : prio;
    const item = { keys: ks, prio, born: V.t, ttl: o.ttl != null ? o.ttl : PRIO_TTL[prio], tag: o.tag || null };
    if (o.interrupt) { V.stop(); V.queue = V.queue.filter((q) => q.prio >= prio); }
    if (prio >= 2) V.queue = V.queue.filter((q) => q.prio >= 1);
    // aynı etiketli bekleyen satır varsa değiştir (örn. üst üste iki 'shot')
    if (item.tag) V.queue = V.queue.filter((q) => q.tag !== item.tag);
    V.queue.push(item);
    V.queue.sort((a, b) => b.prio - a.prio || a.born - b.born);
    return true;
  };
  V.stop = function () {
    if (V.playing) { for (const s of V.playing.srcs) { try { s.stop(); } catch (e) { /* zaten bitti */ } } V.playing = null; }
  };
  V.clear = function () { V.stop(); V.queue = []; };
  V.durationOf = (keys) => keys.reduce((a, k) => a + (k === '|' ? PAUSE : (V.sprites && V.sprites[k] ? V.sprites[k][2] : 0) + GAP), 0);

  V.playNow = function (item) {
    const ctx = V.ctx; let when = ctx.currentTime + 0.03; const srcs = [];
    for (const k of item.keys) {
      if (k === '|') { when += PAUSE; continue; }
      const s = V.sprites[k]; if (!s) continue;
      const [bank, st, du] = s; const buf = V.banks[bank]; if (!buf) continue;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const g = ctx.createGain(); g.gain.value = s[3] || 1; src.connect(g); g.connect(V.gain);
      // kısa giriş/çıkış rampası: sprite sınırlarında çıtırtı olmasın
      g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(s[3] || 1, when + 0.012);
      g.gain.setValueAtTime(s[3] || 1, when + du - 0.03); g.gain.linearRampToValueAtTime(0, when + du);
      src.start(when, st, du); srcs.push(src); when += du + GAP;
      V.recent.push(k); if (V.recent.length > 40) V.recent.shift();
    }
    V.playing = { item, srcs, endT: when };
    V.stats.said++;
  };

  V.update = function (dt) {
    V.t += dt;
    if (!V.ready) return;
    const now = V.ctx.currentTime;
    if (V.playing && now >= V.playing.endT) V.playing = null;
    if (V.playing) { V.idleT = 0; return; }
    V.idleT += dt;
    while (V.queue.length) {
      const it = V.queue.shift();
      if (V.t - it.born > it.ttl) continue; // bayat
      V.playNow(it); return;
    }
  };
  V.isSpeaking = () => !!V.playing;
  V.duck = () => (V.playing ? 0.55 : 1);

  /* ---------- skor / takım anahtarları ---------- */
  V.scoreKeys = function (score, scoringTeam) {
    const a = score[0], b = score[1];
    const hi = Math.max(a, b), lo = Math.min(a, b);
    const out = [];
    if (scoringTeam != null) {
      const forT = score[scoringTeam], agT = score[1 - scoringTeam];
      if (forT === agT) out.push('equal');
      else if (forT === agT + 1) out.push('lead');
      else if (forT > agT) out.push('extend');
      else out.push('reduce');
    }
    const k = 's' + hi + lo;
    if (V.has(k)) out.push(k);
    return out;
  };
  // sprite listesi henüz inmediyse anahtarı yine de döndür (çalma anında eksikler atlanır)
  V.teamKey = (match, ti) => (ti != null && match.teams[ti] && (!V.sprites || V.has(match.teams[ti].id)) ? match.teams[ti].id : null);

  /* ---------- cümle yardımcıları ---------- */
  // ad + yüklem: aynı ad 6 sn içinde tekrar anılmışsa ad düşer ("... vuruyor!")
  V.subj = function (p, excl, force) {
    if (!p) return [];
    const k = p.shortName;
    if (!force && V.lastNameT[k] != null && V.t - V.lastNameT[k] < 6) return [];
    const nk = V.nameKey(p, excl); if (!nk) return [];
    V.lastNameT[k] = V.t;
    return [nk];
  };
  V.sentence = function (parts) { return [].concat(...parts.filter(Boolean)); };

  /* ---------- olay → söz ---------- */
  V.onEvent = function (ev, match) {
    if (!V.enabled || !match) return;
    const T = match.teams;
    const tk = (ti) => V.teamKey(match, ti);
    const S = V.sentence, subj = V.subj;
    switch (ev.type) {
      case 'kickoff_taken': {
        if (ev.first && ev.half === 1) V.say(S([subj(ev.taker, false, true), ['v_kickoff', '|', 'kickoff']]), 2, { ttl: 4 });
        else if (ev.first && ev.half === 2) V.say(['h2start', '|', 'secondhalf'], 3, { ttl: 8 });
        break;
      }
      case 'secondhalf': break;
      case 'lineup': break;
      case 'goal': {
        if (ev.varPending) { V.say(S([[V.fresh(['r_gooal', 'goal'])], subj(ev.scorer, true, true)]), 3, { interrupt: true }); break; }
        const sc = V.scoreKeys(ev.score, ev.team);
        const scorer = ev.scorer;
        const goalsNow = scorer && scorer.stats ? scorer.stats.goals : 1;
        if (ev.ownGoal) { V.say(S([['r_no', '|', 'owngoal'], subj(scorer, false, true), ['v_owngoal', '|'], sc]), 3, { interrupt: true }); break; }
        const opener = V.fresh(['goal', 'r_gooal', 'l_andgoal', 'l_whatgoal', 'l_greatgoal']);
        const pred = ev.penalty ? 'v_penscored' : goalsNow >= 3 ? 'v_hattrick' : goalsNow === 2 ? 'v_brace' : V.fresh(['v_goal', 'v_goal2', 'v_goal3', 'v_helpless']);
        const assist = ev.assist && !ev.penalty && M.chance(0.6) ? ['|', 'l_assist'].concat(subj(ev.assist, false, true)) : [];
        const tkey = tk(ev.team); const tPred = sc[0] === 'lead' ? 't_lead' : sc[0] === 'equal' ? 't_equal' : sc[0] === 'extend' ? 't_extend' : 't_reduce';
        V.say(S([[opener], subj(scorer, true, true), [pred], assist, ['|'], tkey ? [tkey, tPred] : [], ['|'], sc.slice(1)]), 3, { interrupt: true });
        break;
      }
      case 'var_check': V.say(['var_go', '|', 'var_check'], 3, { ttl: 6 }); break;
      case 'var_decision': {
        const sc = V.scoreKeys(ev.score, ev.team);
        if (ev.decision === 'goal') V.say(S([[ev.tight ? 'var_no_offside' : 'var_goal_ok', '|', 'goal2'], subj(ev.scorer, true, true), ['|'], sc.slice(1)]), 3, { interrupt: true });
        else V.say(S([['var_goal_no', '|'], subj(ev.scorer, false, true), ['v_offside']]), 3, { interrupt: true });
        break;
      }
      case 'shot': {
        if (ev.penalty) { V.say(S([subj(ev.p, false, true), ['v_shoot']]), 2, { ttl: 1.0, tag: 'shot' }); break; }
        const q = ev.q || 0;
        const far = match.ball && Math.abs(match.ball.x) < 30;
        const pred = ev.header ? 'v_header' : far ? 'v_longshot' : q > 0.25 ? V.fresh(['v_shoot', 'v_shoot2', 'v_hard']) : V.fresh(['v_shoot', 'v_shoot2']);
        const lead = q > 0.3 ? [V.fresh(['l_bigchance', 'r_care', 'r_what'])] : [];
        V.say(S([lead, subj(ev.p, true), [pred]]), 1, { ttl: 1.2, chance: 0.5 + Math.min(0.5, q * 2.5) + (ev.header ? 0.2 : 0), minGap: 2.5, dedupe: 'shot', tag: 'shot' });
        break;
      }
      case 'save': {
        const big = match.lastShot && match.lastShot.q > 0.25;
        const lead = ev.catch ? [] : [V.fresh(big ? ['l_whatsave', 'l_gkflew', 'r_wow'] : ['l_gkflew', 'save'])];
        V.say(S([lead, subj(ev.p, !ev.catch), [ev.catch ? V.fresh(['v_catch', 'v_gkclaim', 'v_hands']) : V.fresh(['v_save', 'v_savecorner', 'v_gkfeet'])]]), 2, { ttl: 2.5, chance: ev.catch ? 0.6 : 0.95, minGap: 3, dedupe: 'save' });
        break;
      }
      case 'nearmiss': {
        const post = match.ball.hitPost;
        V.say(S([[post ? V.fresh(['l_post', 'post']) : V.fresh(['l_justwide', 'l_over', 'r_close', 'nearmiss', 'r_missed'])], post ? [] : subj(match.lastShot && match.lastShot.p, false), post ? [] : [V.fresh(['v_nearmiss', 'v_wide'])]]), 2, { ttl: 2.5 });
        break;
      }
      case 'block': V.say(S([subj(ev.p, false), ['v_block']]), 0, { ttl: 1.2, chance: 0.4, minGap: 6, dedupe: 'clear' }); break;
      case 'clearance': V.say(S([subj(ev.p, false), [V.fresh(['v_clear', 'v_danger', 'v_headclear'])]]), 0, { ttl: 1.2, chance: 0.35, minGap: 6, dedupe: 'clear' }); break;
      case 'corner': V.say(S([['corner'], tk(ev.team) ? ['|', tk(ev.team), 't_corner'] : []]), 1, { ttl: 5, chance: 0.9 }); break;
      case 'throwin': V.say(['throwin'], 1, { ttl: 3, chance: 0.3, minGap: 25 }); break;
      case 'goalkick': V.say(S([['goalkick'], M.chance(0.4) ? subj(ev.taker, false).concat(['v_goalkick']) : []]), 1, { ttl: 3, chance: 0.4, minGap: 25 }); break;
      case 'freekick': if (!ev.indirect) V.say(S([['freekick'], tk(ev.team) ? ['|', tk(ev.team), 't_freekick'] : []]), 1, { ttl: 4, chance: 0.7 }); break;
      case 'penalty': V.say(S([['penalty', '|'], tk(ev.team) ? [tk(ev.team), 't_penalty'] : []]), 3, { interrupt: true }); break;
      case 'offside': V.say(S([['offside', '|'], subj(ev.p, false, true), ['v_offside']]), 2, { ttl: 4 }); break;
      case 'foul': {
        if (ev.card || ev.inBox) break;
        V.say(S([['foul', '|'], subj(ev.offender, false, true), [V.fresh(['v_foul', 'v_foul2'])]]), 1, { ttl: 3, chance: 0.7 });
        break;
      }
      case 'advantage': V.say([V.fresh(['advantage', 'l_adv'])], 1, { ttl: 2 }); break;
      case 'injury': V.say(S([subj(ev.p, false, true), ['v_injury', '|', 'injury']]), 1, { ttl: 4 }); break;
      case 'card': {
        if (ev.card === 'red') V.say(S([['red', '|'], subj(ev.p, true, true), [ev.second ? 'v_secondyellow' : 'v_red'], ['|', 'sentoff'], tk(ev.p.team) ? ['|', tk(ev.p.team), 't_ten'] : []]), 3, { interrupt: true });
        else V.say(S([['yellow', '|'], subj(ev.p, false, true), ['v_yellow']]), 2, { ttl: 5 });
        break;
      }
      case 'sub': {
        if (ev.atBreak) break;
        V.say(S([['sub', '|'], subj(ev.out, false, true), ['v_subout', '|'], subj(ev.in, false, true), [ev.emergency ? 'v_subin' : V.fresh(['v_subin', 'v_fresh'])]]), 1, { ttl: 8 });
        break;
      }
      case 'addedtime': { const m = M.clamp(Math.round(ev.minutes || 1), 1, 5); V.say(['added', 'min' + m], 2, { ttl: 5 }); break; }
      case 'halftime': V.say(S([['ht_end', '|', 'l_score'], V.scoreKeys(ev.score, null)]), 3, { interrupt: true }); break;
      case 'fulltime': {
        const draw = ev.score[0] === ev.score[1];
        const w = draw ? null : ev.score[0] > ev.score[1] ? 0 : 1;
        const winPart = draw ? ['ft_shared'] : (tk(w) ? ['ft_winner', tk(w), '|', tk(w), 't_wins'] : ['ft_win']);
        V.say(S([['ft_end', '|', 'l_score'], V.scoreKeys(ev.score, null), ['|'], winPart, ['|', 'ft_bye']]), 3, { interrupt: true, ttl: 30 });
        break;
      }
      case 'pass': {
        if (ev.kind === 'through') V.say(S([subj(ev.p, false), ['v_through']]), 0, { ttl: 1.0, chance: 0.45, minGap: 8, tag: 'pass' });
        else if (ev.kind === 'cross') V.say(S([subj(ev.p, false), ['v_cross']]), 0, { ttl: 1.0, chance: 0.5, minGap: 7, tag: 'pass' });
        else if (ev.kind === 'lofted') V.say(S([subj(ev.p, false), [V.fresh(['v_longball', 'v_switch'])]]), 0, { ttl: 1.0, chance: 0.3, minGap: 10, tag: 'pass' });
        else if (ev.kind === 'ground' && ev.target) V.say(S([subj(ev.p, false), [V.fresh(['v_pass', 'v_forward', 'v_wing', 'v_back2'])], ['|'], subj(ev.target, false)]), 0, { ttl: 0.9, chance: 0.07, minGap: 12, tag: 'pass' });
        break;
      }
      case 'onetwo': V.say(S([subj(ev.p, false), ['v_onetwo']]), 0, { ttl: 1.2, chance: 0.5, minGap: 12, tag: 'pass' }); break;
      case 'turnover': V.say(S([subj(ev.p, false), [V.fresh(['v_steal', 'v_intercept', 'v_won'])]]), 0, { ttl: 1.4, chance: 0.4, minGap: 7, dedupe: 'steal' }); break;
      case 'tackle': if (ev.clean && ev.sliding) V.say(S([subj(ev.p, false), [V.fresh(['v_slide', 'v_slideclear', 'v_justintime'])]]), 0, { ttl: 1.4, chance: 0.6, minGap: 7, dedupe: 'steal' }); break;
      case 'counter': V.say([V.fresh(['l_counter', 'l_fast', 'counter'])], 1, { ttl: 1.5, minGap: 15 }); break;
      case 'dribble': V.say(S([subj(ev.p, false), [V.fresh(['v_beat', 'v_shake', 'v_pace', 'v_beat2'])]]), 0, { ttl: 1.4, chance: 0.6, minGap: 8 }); break;
      case 'oneonone': V.say(S([['r_care'], subj(ev.p, true), ['v_oneonone']]), 1, { ttl: 1.4, minGap: 10 }); break;
      case 'box': V.say(S([subj(ev.p, false), ['v_box']]), 0, { ttl: 1.2, chance: 0.45, minGap: 8 }); break;
      case 'intro': V.say(['intro'], 3, { ttl: 20, interrupt: true }); break;
    }
  };

  /* ---------- maç öncesi anlatım (seremoni sırasında) ---------- */
  // ctx: { home, away (takım index/id), career: { comp, week, homePos, awayPos, derby, first, last, final, leader } }
  V.preMatch = function (match, ctx) {
    if (!V.enabled) return;
    const c = (ctx && ctx.career) || null;
    const hk = V.teamKey(match, 0), ak = V.teamKey(match, 1);
    const lines = [];
    lines.push([V.fresh(['pre_welcome', 'c_night'])]);
    if (c) {
      if (c.final) lines.push(['c_final']); else if (c.cup) lines.push(['c_cup']);
      else if (c.comp === 'ucl') lines.push(['c_ucl']); else if (c.comp === 'league') lines.push([c.first ? 'c_first' : c.last ? 'c_last' : V.fresh(['c_league', 'c_week', 'pre_season'])]);
      if (c.derby) lines.push(['c_derby']);
      if (c.homePos && c.homePos <= 12 && hk) lines.push(['pre_home', hk, 'o' + c.homePos]);
      if (c.awayPos && c.awayPos <= 12 && ak) lines.push(['pre_away', ak, 'o' + c.awayPos]);
      if (c.leader === 0 || c.leader === 1) lines.push(['c_leader']);
      if (c.streak) lines.push([c.streak > 0 ? 'c_streak' : 'c_crisis']);
    } else {
      lines.push([V.fresh(['pre_stars', 'pre_season', 'pre_full'])]);
      if (hk) lines.push(['pre_home', hk, 't_home']);
      if (ak) lines.push(['pre_away', ak, 't_away']);
    }
    lines.push(['pre_tunnel']); lines.push([V.fresh(['pre_refs', 'pre_captains'])]);
    const keys = [].concat(...lines.map((l, i) => (i ? ['|'] : []).concat(l)));
    V.say(keys, 3, { ttl: 40, interrupt: true, tag: 'pre1' });
    // dizilme: tribün selamı + hazırlık (öncekiler bitince sıraya girer)
    V.say([V.fresh(['pre_salute', 'pre_full', 'c_atmosphere']), '|', 'pre_shake', '|', 'pre_positions', '|', 'pre_refready'], 2, { ttl: 40, tag: 'pre2' });
  };
  /* Seremoni atlandı: çalan maç öncesi anlatımı kes, bekleyen açılış satırlarını at */
  V.skipPreMatch = function () {
    if (V.playing && V.playing.item && V.playing.item.tag && V.playing.item.tag.startsWith('pre')) V.stop();
    V.queue = V.queue.filter((q) => !(q.tag && q.tag.startsWith('pre')));
  };

  /* ---------- Renk yorumu: oyun akarken sessizlik uzarsa bağlama göre cümle ---------- */
  V.flavor = function (dt, match) {
    if (!V.ready || !match || match.state !== 'play') return;
    V.flavorT -= dt;
    if (V.flavorT > 0 || V.playing || V.queue.length) return;
    V.flavorT = M.rand(6, 11);
    const o = match.ball.owner;
    const S = V.sentence, subj = V.subj;
    const sc = [match.teams[0].score, match.teams[1].score];
    const minute = match.clock / 60;
    const r = M.random();
    // maç durumu cümleleri (arada bir)
    if (r < 0.18) {
      const inHalf = minute - (match.half === 2 ? 45 : 0);
      if (inHalf > 40) { V.say([match.half === 1 ? 'l_lastmin1' : 'l_lastmin2'], 0, { ttl: 2, minGap: 60, dedupe: 'lastmin' }); return; }
      if (sc[0] === sc[1] && minute > 20) { V.say([V.fresh(['l_stilldraw', 'l_seekeq'])], 0, { ttl: 2, minGap: 50, dedupe: 'state' }); return; }
      if (sc[0] !== sc[1]) { V.say([sc[0] > sc[1] ? 'l_homelead' : 'l_awaylead', '|', 'l_score'].concat(V.scoreKeys(sc, null)), 0, { ttl: 2, minGap: 50, dedupe: 'state' }); return; }
    }
    if (!o || o.role === 'GK') { if (r > 0.6) V.say([V.fresh(['l_midfield', 'l_tempo', 'l_passing', 'l_defence'])], 0, { ttl: 1.5, minGap: 40, dedupe: 'flow' }); return; }
    // top sahibine göre: konum + ad + yüklem
    const dir = match.dirOf(o.team); const ax = o.x * dir;
    const where = ax > 36 ? 'r_inbox' : ax > 12 ? V.fresh(['r_wing', 'r_right', 'r_left', 'l_attack']) : ax > -12 ? 'r_mid' : 'r_ownhalf';
    const pred = ax > 30 ? V.fresh(['v_advance', 'v_lookpass', 'v_holdup']) : ax > 0 ? V.fresh(['v_enterhalf', 'v_advance', 'v_dribble', 'v_lookpass']) : V.fresh(['v_onball', 'v_pass', 'v_control', 'v_lookpass']);
    const s = subj(o, false, true); if (!s.length) return;
    V.say(S([M.chance(0.5) ? [where] : [], s, [pred]]), 0, { ttl: 1.5, minGap: 20, dedupe: 'onball:' + o.shortName });
  };
})(typeof window !== 'undefined' ? window : globalThis);
