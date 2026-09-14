/* Fizik sağlık taraması: NaN, yer altı top, aşırı hız, saha dışı kaçış, direk içinden geçiş, top-oyuncu iç içe kalma, uzun süre sahipsiz top */
const path = require('path');
for (const f of ['js/core/math.js','js/core/pitch.js','js/core/entities.js','js/data/teams.js', 'js/data/teams_ext.js','js/sim/weather.js','js/sim/ball.js','js/sim/actions.js','js/sim/ai.js', 'js/sim/tactics.js','js/sim/officials.js','js/sim/match.js']) require(path.join(__dirname, '../..', f));
const FS = globalThis.FS, M = FS.M, P = FS.PITCH;
const seeds = process.argv.slice(2).map(Number); if (!seeds.length) seeds.push(1);
const wx = process.env.WX || 'clear';
for (const seed of seeds) {
  const m = new FS.Match([FS.getTeam('GS'), FS.getTeam('RMA')], { halfRealSec: 180, seed, weather: wx, ceremony: 0 });
  const st = { nan: 0, under: 0, ballFast: 0, maxBallV: 0, ballFar: 0, playerFast: 0, maxPV: 0, playerNaN: 0, inBody: 0, inBodyMax: 0, noOwnerLong: 0, postPass: 0, highY: 0, maxY: 0, states: {} };
  let frames = 0, noOwnT = 0, inBodyRun = 0, prev = null;
  while (m.state !== 'fulltime' && frames < 60 * 60 * 9) {
    if (m.state === 'halftime') m.startSecondHalf();
    const b = m.ball; const px = b.x, pz = b.z, py = b.y;
    m.update(1 / 60); frames++;
    st.states[m.state] = (st.states[m.state] || 0) + 1;
    if (!isFinite(b.x) || !isFinite(b.y) || !isFinite(b.z) || !isFinite(b.vx) || !isFinite(b.vy) || !isFinite(b.vz)) { st.nan++; break; }
    if (b.y < -0.02) st.under++;
    const v = Math.hypot(b.vx, b.vy, b.vz); st.maxBallV = Math.max(st.maxBallV, v); if (v > 42) st.ballFast++;
    if (b.y > st.maxY) st.maxY = b.y; if (b.y > 25) st.highY++;
    if (Math.abs(b.x) > P.halfL + 8 || Math.abs(b.z) > P.halfW + 8) st.ballFar++;
    // direk/üst direk içinden geçiş: kale ağzı düzlemini (x=±halfL) 'direk' bölgesinde kesip kaleye girmek
    const gx = P.halfL; const crossed = (Math.abs(px) < gx) !== (Math.abs(b.x) < gx) && Math.abs(b.z) < 4.4 && b.y < 2.9;
    if (crossed) { const t = (gx - Math.abs(px)) / ((Math.abs(b.x) - Math.abs(px)) || 1e-6); const zc = pz + (b.z - pz) * t, yc = py + (b.y - py) * t; const postR = P.goalHalfW || 3.66; const inPost = (Math.abs(Math.abs(zc) - postR) < 0.06 && yc < 2.44) || (Math.abs(yc - 2.44) < 0.06 && Math.abs(zc) < postR + 0.06); if (inPost) st.postPass++; }
    if (m.state === 'play') {
      for (const p of m.allOnPitch()) {
        if (!isFinite(p.x) || !isFinite(p.z)) { st.playerNaN++; }
        const sp = Math.hypot(p.vx, p.vz); if (sp > st.maxPV) st.maxPV = sp; if (sp > 10.5) st.playerFast++;
      }
      // top sahipsizken oyuncu gövdesinin içinde (r<0.25) uzun süre kalıyor mu?
      if (!b.owner && b.y < 1.2) { let inside = false; for (const p of m.allOnPitch()) { if (p.fallT > 0 || p.tackleT > 0 || p.diveT > 0) continue; if (M.dist(p.x, p.z, b.x, b.z) < 0.22) { inside = true; break; } } inBodyRun = inside ? inBodyRun + 1 : 0; if (inBodyRun > 20) st.inBody++; st.inBodyMax = Math.max(st.inBodyMax, inBodyRun); } else inBodyRun = 0;
      noOwnT = b.owner ? 0 : noOwnT + 1 / 60; if (noOwnT > 12) { st.noOwnerLong++; noOwnT = 0; }
    }
  }
  console.log(JSON.stringify({ seed, wx, frames, ...st, maxBallV: +st.maxBallV.toFixed(1), maxPV: +st.maxPV.toFixed(1), maxY: +st.maxY.toFixed(1), score: [m.teams[0].score, m.teams[1].score] }));
}
