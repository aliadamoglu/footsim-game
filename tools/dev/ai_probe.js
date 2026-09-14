/* Yapay zekâ davranış taraması: sahipsiz topa koşan yok mu, kaç kişi kovalıyor, kaleci pozisyonu, uzun şutlar, saha dışına dripling,
   sahipsiz topun uzun süre kalması, kaleciye geri pas oranı, oyuncuların saha dışı, kendi kalesine gol, pas sonrası koşu profili */
const path = require('path');
for (const f of ['js/core/math.js','js/core/pitch.js','js/core/entities.js','js/data/teams.js', 'js/data/teams_ext.js','js/sim/weather.js','js/sim/ball.js','js/sim/actions.js','js/sim/ai.js', 'js/sim/tactics.js','js/sim/officials.js','js/sim/match.js']) require(path.join(__dirname, '../..', f));
const FS = globalThis.FS, M = FS.M, P = FS.PITCH;
const seeds = process.argv.slice(2).map(Number); if (!seeds.length) seeds.push(1);
const tot = { frames: 0, loose: 0, looseNoChaser: 0, chasers3plus: 0, gkFar: 0, gkSamples: 0, shots: 0, longShots: 0, shotsOn: 0, backToGK: 0, backToGKNoPress: 0, passes: 0, outFromDribble: 0, throwins: 0, outOfBounds: 0, ownGoals: 0, goals: 0, offsides: 0, idleInPoss: 0, possSamples: 0, ballLooseRunMax: 0, corners: 0, fouls: 0, cards: 0, gkHold: 0, gkHoldLong: 0 };
for (const seed of seeds) {
  const m = new FS.Match([FS.getTeam('GS'), FS.getTeam('RMA')], { halfRealSec: 180, seed, weather: 'clear', ceremony: 0 });
  let lastOwner = null, looseRun = 0, lastKickKind = null;
  m.on((ev) => {
    if (ev.type === 'shot') { tot.shots++; const g = P.goalCenter(m.dirOf(ev.p.team)); if (M.dist(ev.p.x, ev.p.z, g.x, g.z) > 30) tot.longShots++; }
    if (ev.type === 'pass' && ev.kind !== 'gk') { tot.passes++; if (ev.target && ev.target.role === 'GK') { tot.backToGK++; if (FS.Actions.pressureOn(ev.p, m.playersOnPitch(1 - ev.p.team)) < 0.25) tot.backToGKNoPress++; } }
    if (ev.type === 'throwin') { tot.throwins++; const lk = m.ball.lastKick; if (lastOwner && lastKickKind === 'dribble') tot.outFromDribble++; }
    if (ev.type === 'corner') tot.corners++;
    if (ev.type === 'goal') { tot.goals++; if (ev.own) tot.ownGoals++; }
    if (ev.type === 'offside') tot.offsides++;
    if (ev.type === 'foul') tot.fouls++;
    if (ev.type === 'card') tot.cards++;
  });
  let frames = 0;
  while (m.state !== 'fulltime' && frames < 60 * 60 * 9) {
    if (m.state === 'halftime') m.startSecondHalf();
    m.update(1 / 60); frames++;
    if (m.state !== 'play') { looseRun = 0; continue; }
    tot.frames++;
    const b = m.ball;
    if (b.owner) { lastOwner = b.owner; lastKickKind = 'dribble'; looseRun = 0; } else { looseRun++; if (b.lastKick) lastKickKind = b.lastKick.kind; }
    tot.ballLooseRunMax = Math.max(tot.ballLooseRunMax, looseRun);
    if (frames % 10 === 0) {
      if (!b.owner && b.y < 1.5 && Math.abs(b.x) < P.halfL && Math.abs(b.z) < P.halfW) {
        tot.loose++;
        // kovalayan: topa doğru hareket eden (hız bileşeni > 1.5) ya da 1.5 m içindeki oyuncu
        let ch = 0; for (const p of m.allOnPitch()) { const dx = b.x - p.x, dz = b.z - p.z, d = M.len(dx, dz) || 1; const v = (p.vx * dx + p.vz * dz) / d; if (d < 1.5 || (v > 1.5 && d < 25)) ch++; }
        if (ch === 0 && looseRun > 60) tot.looseNoChaser++;
        if (ch >= 5) tot.chasers3plus++;
      }
      for (const t of [0, 1]) { const g = m.gkOf(t); const goal = P.goalCenter(-m.dirOf(t)); tot.gkSamples++; if (M.dist(g.x, g.z, goal.x, goal.z) > 16) tot.gkFar++; if (g.holding) { tot.gkHold++; if (g.holdT > 5.5) tot.gkHoldLong++; } }
      for (const p of m.allOnPitch()) if (Math.abs(p.x) > P.halfL + 2.5 || Math.abs(p.z) > P.halfW + 2.5) tot.outOfBounds++;
      if (b.owner) { tot.possSamples++; let idle = 0; for (const p of m.playersOnPitch(b.owner.team)) if (p !== b.owner && p.role !== 'GK' && p.speed < 0.3) idle++; if (idle >= 8) tot.idleInPoss++; }
    }
  }
  tot.shotsOn += m.teams[0].stats.shotsOn + m.teams[1].stats.shotsOn;
}
const N = seeds.length; const pm = (v) => +(v / N).toFixed(2);
console.log(JSON.stringify({ N, playMin: +(tot.frames / 3600 / N).toFixed(1), loosePct: +(100 * tot.loose / (tot.frames / 10)).toFixed(1), looseNoChaser: tot.looseNoChaser, chasers5plus: tot.chasers3plus, gkFarPct: +(100 * tot.gkFar / tot.gkSamples).toFixed(1), gkHoldLong: tot.gkHoldLong, shots: pm(tot.shots), shotsOn: pm(tot.shotsOn), longShotPct: +(100 * tot.longShots / Math.max(1, tot.shots)).toFixed(0), passes: pm(tot.passes), backToGK: pm(tot.backToGK), backToGKNoPress: pm(tot.backToGKNoPress), throwins: pm(tot.throwins), outFromDribble: pm(tot.outFromDribble), corners: pm(tot.corners), outOfBounds: tot.outOfBounds, ownGoals: tot.ownGoals, goals: pm(tot.goals), offsides: pm(tot.offsides), fouls: pm(tot.fouls), cards: pm(tot.cards), idleInPossPct: +(100 * tot.idleInPoss / Math.max(1, tot.possSamples)).toFixed(1), ballLooseRunMaxS: +(tot.ballLooseRunMax / 60).toFixed(1) }));
