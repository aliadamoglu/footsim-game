/* Top oyuncu gövdesinin içinden geçiyor mu? Kare-içi top segmenti (önceki→yeni konum) ayakta duran bir oyuncunun 0.26 m yakınından,
   o oyuncu topa dokunmadan (lastKick.p !== p) geçiyorsa 'passThru' sayılır. */
const path = require('path');
for (const f of ['js/core/math.js','js/core/pitch.js','js/core/entities.js','js/data/teams.js', 'js/data/teams_ext.js','js/sim/weather.js','js/sim/ball.js','js/sim/actions.js','js/sim/ai.js', 'js/sim/tactics.js','js/sim/officials.js','js/sim/match.js']) require(path.join(__dirname, '../..', f));
const FS = globalThis.FS, M = FS.M;
const seeds = process.argv.slice(2).map(Number); if (!seeds.length) seeds.push(1);
for (const seed of seeds) {
  const m = new FS.Match([FS.getTeam('GS'), FS.getTeam('RMA')], { halfRealSec: 180, seed, weather: 'clear', ceremony: 0 });
  let frames = 0, thru = 0, thruFast = 0; const who = {}; let lastKickId = null;
  const samples = [];
  while (m.state !== 'fulltime' && frames < 60 * 60 * 9) {
    if (m.state === 'halftime') m.startSecondHalf();
    const b = m.ball; const px = b.x, pz = b.z, py = b.y; const ownerBefore = b.owner; const lkBefore = b.lastKick;
    m.update(1 / 60); frames++;
    if (m.state !== 'play' || b.owner || ownerBefore) continue;
    if (b.y > 1.9 && py > 1.9) continue;
    const sp = Math.hypot(b.vx, b.vz); if (sp < 3) continue;
    for (const p of m.allOnPitch()) {
      if (p.fallT > 0 || p.tackleT > 0 || p.diveT > 0) continue;
      const c = M.segClosest(p.x, p.z, px, pz, b.x, b.z);
      if (c.d < 0.26 && c.t > 0 && c.t < 1) {
        const lk = b.lastKick; if (lk && lk.p === p && lk.t < 0.6) continue;
        thru++; if (sp > 8) thruFast++; const k = p.role + (lk ? ':' + lk.kind : ''); who[k] = (who[k] || 0) + 1;
        if (samples.length < 6) samples.push({ t: +m.t.toFixed(1), p: p.name, role: p.role, sp: +sp.toFixed(1), y: +b.y.toFixed(2), kickCd: +p.kickCd.toFixed(2), stun: +p.stunT.toFixed(2), lk: lk && lk.kind, lkTeam: lk && lk.team, pTeam: p.team, tgt: lk && lk.target && lk.target.name, lkT: lk && +lk.t.toFixed(2) });
      }
    }
  }
  console.log(JSON.stringify({ seed, frames, thru, thruFast, who, samples }));
}
