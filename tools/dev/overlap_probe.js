// Oyuncu iç içe geçme ölçümü: kare başına çift sayısı (ayakta-ayakta < 0.6 m; yatan gövde segmentine < 0.5 m)
const path = require('path');
const files = ['js/core/math.js','js/core/pitch.js','js/core/entities.js','js/data/teams.js', 'js/data/teams_ext.js','js/sim/weather.js','js/sim/ball.js','js/sim/actions.js','js/sim/ai.js', 'js/sim/tactics.js','js/sim/officials.js','js/sim/match.js'];
for (const f of files) require(path.join(__dirname, '../..', f));
const FS = globalThis.FS; const M = FS.M;
const seeds = process.argv.slice(2).map(Number); if (!seeds.length) seeds.push(5);
let segDist = null;
for (const seed of seeds) {
  const m = new FS.Match([FS.getTeam('GS'), FS.getTeam('RMA')], { halfRealSec: 180, seed, weather: 'clear', ceremony: 0 });
  segDist = (p, x, z) => { const sg = m.bodySegment(p); if (!sg) return 9; const c = FS.Match.segClosest(sg, x, z); return M.dist(x, z, c.x, c.z); };
  let steps = 0, playFrames = 0, standOverlap = 0, downOverlap = 0, worstStand = 9, worstDown = 9, downFrames = 0, maxSpeed = 0, teleports = 0;
  const last = new Map();
  while (m.state !== 'fulltime' && steps < 60 * 60 * 12) {
    if (m.state === 'halftime') m.startSecondHalf();
    m.update(1 / 60); steps++;
    const list = m.allOnPitch();
    for (const p of list) { const l = last.get(p.id); if (l && m.state === 'play') { const j = M.dist(p.x, p.z, l.x, l.z); if (j > 0.6) { teleports++; if (process.env.TP) console.log('TP', m.state, p.name, p.role, +j.toFixed(2), 'fall', +p.fallT.toFixed(2), 'tk', +p.tackleT.toFixed(2), 'dive', +(p.diveT||0).toFixed(2), 'hasBall', !!p.hasBall, 't', +m.t.toFixed(1), 'lastRestart', m.lastRestart && +(m.t - m.lastRestart.t).toFixed(2), m.lastRestart && m.lastRestart.type, 'sub', m.subsPending); } } last.set(p.id, { x: p.x, z: p.z }); if (p.speed > maxSpeed) maxSpeed = p.speed; }
    if (m.state !== 'play') continue;
    playFrames++;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const aD = a.fallT > 0 || a.tackleT > 0 || a.diveT > 0, bD = b.fallT > 0 || b.tackleT > 0 || b.diveT > 0;
      if (!aD && !bD) { const d = M.distP(a, b); if (d < 0.6) { standOverlap++; worstStand = Math.min(worstStand, d); } }
      else if (aD !== bD) { const dn = aD ? a : b, up = aD ? b : a; const d = segDist(dn, up.x, up.z); downFrames++; if (d < 0.45) { downOverlap++; worstDown = Math.min(worstDown, d); } }
    }
  }
  console.log(JSON.stringify({ seed, playFrames, standOverlapPairs: standOverlap, perMin: +(standOverlap / (playFrames / 3600)).toFixed(1), worstStand: +worstStand.toFixed(2), downPairsChecked: downFrames, downOverlap, worstDown: +worstDown.toFixed(2), teleports, maxSpeed: +maxSpeed.toFixed(1), score: [m.teams[0].score, m.teams[1].score] }));
}
