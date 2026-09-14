/* Karar hataları: ofsayttaki arkadaşa pas, kötü açıdan/kendi yarı sahadan şut, anında kesilen (kör) pas, kaleci dağıtımı kaybı,
   5 m içindeki sahipsiz topa tepki vermeyen oyuncu, hücumda 2+ s toplu bekleyen taşıyıcı, çok yakın rakibe pas (open<0.8) */
const path = require('path');
for (const f of ['js/core/math.js','js/core/pitch.js','js/core/entities.js','js/data/teams.js', 'js/data/teams_ext.js','js/sim/weather.js','js/sim/ball.js','js/sim/actions.js','js/sim/ai.js', 'js/sim/tactics.js','js/sim/officials.js','js/sim/match.js']) require(path.join(__dirname, '../..', f));
const FS = globalThis.FS, M = FS.M, P = FS.PITCH, AI = FS.AI;
const seeds = process.argv.slice(2).map(Number); if (!seeds.length) seeds.push(1);
const T = { passes: 0, passOffside: 0, passOffsideFlag: 0, shots: 0, badAngleShots: 0, ownHalfShots: 0, blindPass: 0, gkDistLost: 0, gkDist: 0, looseIgnored: 0, passToMarked: 0, passBackNoPress: 0, dribbleIntoCrowd: 0, throughAttempts: 0, throughOk: 0, crossN: 0, crossOk: 0, lostInOwnBox: 0, shotsUnderNoPressureMissed: 0, offsideEvents: 0, samplesOff: [] };
for (const seed of seeds) {
  const m = new FS.Match([FS.getTeam('GS'), FS.getTeam('RMA')], { halfRealSec: 180, seed, weather: 'clear', ceremony: 0 });
  let pend = null; let gkPend = null;
  m.on((ev) => {
    if (ev.type === 'pass') {
      const p = ev.p, tg = ev.target;
      if (ev.kind === 'gk' || p.role === 'GK') { T.gkDist++; gkPend = { p, t: m.t }; return; }
      T.passes++;
      if (tg) {
        const dir = m.dirOf(p.team); const ol = AI.offsideLineAX(m, p.team); const ta = AI.toAttack(tg.x, tg.z, dir);
        if (ta.ax > ol + 0.1 && ta.ax > 0 && ev.kind !== 'cross') { T.passOffside++; if (T.samplesOff.length < 4) T.samplesOff.push({ t: +m.t.toFixed(1), kind: ev.kind, from: p.name, to: tg.name, ax: +ta.ax.toFixed(1), ol: +ol.toFixed(1) }); }
        const open = AI.nearestOpp(m, p.team, tg.x, tg.z).d; if (open < 0.8 && ev.kind === 'ground') T.passToMarked++;
        const pa = AI.toAttack(p.x, p.z, dir); const press = FS.Actions.pressureOn(p, m.playersOnPitch(1 - p.team));
        if (ta.ax < pa.ax - 8 && press < 0.15 && pa.ax > -20) T.passBackNoPress++;
        if (ev.kind === 'through') T.throughAttempts++; if (ev.kind === 'cross') T.crossN++;
      }
      pend = { p, tg, t: m.t, kind: ev.kind };
    }
    if (ev.type === 'shot') { T.shots++; const p = ev.p; const dir = m.dirOf(p.team); const g = P.goalCenter(dir); const ang = Math.abs(Math.atan2(Math.abs(p.z - g.z), Math.abs(g.x - p.x))); if (ang > 1.15 && M.dist(p.x, p.z, g.x, g.z) > 8) T.badAngleShots++; if (p.x * dir < 0) T.ownHalfShots++; }
    if (ev.type === 'offside') T.offsideEvents++;
  });
  let frames = 0;
  while (m.state !== 'fulltime' && frames < 60 * 60 * 9) {
    if (m.state === 'halftime') m.startSecondHalf();
    m.update(1 / 60); frames++;
    if (m.state !== 'play') continue;
    const b = m.ball;
    if (pend && b.owner && b.owner !== pend.p) { const o = b.owner; if (o.team !== pend.p.team && m.t - pend.t < 0.6) T.blindPass++; if (o === pend.tg) { if (pend.kind === 'through') T.throughOk++; if (pend.kind === 'cross') T.crossOk++; } pend = null; }
    if (pend && m.t - pend.t > 4) pend = null;
    if (gkPend && b.owner && b.owner !== gkPend.p) { if (b.owner.team !== gkPend.p.team) T.gkDistLost++; gkPend = null; }
    if (gkPend && m.t - gkPend.t > 5) gkPend = null;
    if (frames % 15 === 0 && !b.owner && b.y < 1 && Math.hypot(b.vx, b.vz) < 4) {
      for (const p of m.allOnPitch()) { if (p.fallT > 0 || p.stunT > 0 || p.tackleT > 0 || p.kickCd > 0) continue; const d = M.dist(p.x, p.z, b.x, b.z); if (d < 5 && d > 1 && p.speed < 0.5) { const ch = m.chaserOf(p.team); if (ch !== p && ch && M.dist(ch.x, ch.z, b.x, b.z) > d + 2) T.looseIgnored++; } }
    }
  }
}
console.log(JSON.stringify(T));
