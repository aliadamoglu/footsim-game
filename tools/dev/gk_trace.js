// Kaleci tutma (holding) tutarlılık izi: holding && ball.owner!==gk kaç karede oluşuyor, hangi yolla?
const path = require('path');
const files = ['js/core/math.js','js/core/pitch.js','js/core/entities.js','js/data/teams.js', 'js/data/teams_ext.js','js/sim/weather.js','js/sim/ball.js','js/sim/actions.js','js/sim/ai.js', 'js/sim/tactics.js','js/sim/officials.js','js/sim/match.js'];
for (const f of files) require(path.join(__dirname, '../..', f));
const FS = globalThis.FS;
const seeds = process.argv.slice(2).map(Number); if (!seeds.length) seeds.push(5);
for (const seed of seeds) {
  const m = new FS.Match([FS.getTeam('GS'), FS.getTeam('RMA')], { halfRealSec: 180, seed, weather: 'clear', ceremony: 0 });
  let steps = 0, inconsistent = 0, holdFrames = 0, firstBad = null, sessions = 0, prevHold = [false, false], ballJump = 0, lastBall = null;
  while (m.state !== 'fulltime' && steps < 60 * 60 * 12) {
    if (m.state === 'halftime') m.startSecondHalf();
    m.update(1 / 60); steps++;
    const b = m.ball;
    [0, 1].forEach((t) => {
      const g = m.gkOf(t);
      if (g.holding) {
        holdFrames++;
        if (!prevHold[t]) sessions++;
        if (b.owner !== g) { inconsistent++; if (!firstBad) firstBad = { t: +m.t.toFixed(2), gk: g.name, state: g.state, owner: b.owner ? b.owner.name : null, lk: b.lastKick && b.lastKick.kind, lkt: b.lastKick && +b.lastKick.t.toFixed(2), hasBall: g.hasBall, holdT: +g.holdT.toFixed(2) }; }
      }
      prevHold[t] = g.holding;
    });
    if (lastBall && m.state === 'play') { const j = Math.hypot(b.x - lastBall.x, b.z - lastBall.z); if (j > 1.5) ballJump++; }
    lastBall = { x: b.x, z: b.z };
  }
  console.log(JSON.stringify({ seed, sessions, holdFrames, inconsistent, ballJumpFrames: ballJump, firstBad, score: [m.teams[0].score, m.teams[1].score] }));
}
