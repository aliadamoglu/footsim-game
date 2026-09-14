// Kaleci tutma oturumları: süre, dağıtım türü, top elden çıkarken hız
const path = require('path');
const files = ['js/core/math.js','js/core/pitch.js','js/core/entities.js','js/data/teams.js', 'js/data/teams_ext.js','js/sim/weather.js','js/sim/ball.js','js/sim/actions.js','js/sim/ai.js', 'js/sim/tactics.js','js/sim/officials.js','js/sim/match.js'];
for (const f of files) require(path.join(__dirname, '../..', f));
const FS = globalThis.FS;
const seed = +process.argv[2] || 5;
const m = new FS.Match([FS.getTeam('GS'), FS.getTeam('RMA')], { halfRealSec: 180, seed, weather: 'clear', ceremony: 0 });
let steps = 0; const sess = []; let cur = [null, null];
while (m.state !== 'fulltime' && steps < 60 * 60 * 12) {
  if (m.state === 'halftime') m.startSecondHalf();
  m.update(1 / 60); steps++;
  [0, 1].forEach((t) => {
    const g = m.gkOf(t); const b = m.ball;
    if (g.holding) { if (!cur[t]) { cur[t] = { gk: g.shortName, t0: +m.t.toFixed(1), maxSp: 0, minBo: 9, maxBo: 0 }; sess.push(cur[t]); } const c = cur[t]; c.maxSp = Math.max(c.maxSp, g.speed); const bo = Math.hypot(b.x - g.x, b.z - g.z); c.minBo = Math.min(c.minBo, bo); c.maxBo = Math.max(c.maxBo, bo); c.dur = +(m.t - c.t0).toFixed(2); c.state = g.state; }
    else if (cur[t]) { cur[t].release = b.lastKick ? b.lastKick.kind : '?'; cur[t].relSpeed = +b.speed3.toFixed(1); cur[t] = null; }
  });
}
for (const s of sess) console.log(JSON.stringify({ ...s, maxSp: +s.maxSp.toFixed(1), minBo: +s.minBo.toFixed(2), maxBo: +s.maxBo.toFixed(2) }));
console.log('score', m.teams[0].score, m.teams[1].score, 'saves', m.teams[0].stats.saves, m.teams[1].stats.saves);
