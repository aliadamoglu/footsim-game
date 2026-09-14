/* Headless sim testi: Node ile maçı hızlıca oynat, istatistik ve olayları yazdır */
const path = require('path');
const files = ['js/core/math.js', 'js/core/pitch.js', 'js/core/entities.js', 'js/data/teams.js', 'js/data/teams_ext.js', 'js/sim/weather.js', 'js/sim/ball.js', 'js/sim/actions.js', 'js/sim/ai.js', 'js/sim/tactics.js', 'js/sim/officials.js', 'js/sim/match.js'];
for (const f of files) require(path.join(__dirname, '..', f));
const FS = globalThis.FS;

const args = process.argv.slice(2);
const home = args[0] || 'GS', away = args[1] || 'RMA';
const seed = parseInt(args[2] || '7', 10);
const halfSec = parseFloat(args[3] || '180');
const verbose = args.includes('-v');

const m = new FS.Match([FS.getTeam(home), FS.getTeam(away)], { halfRealSec: halfSec, seed });
const counts = {};
m.on((ev) => {
  counts[ev.type] = (counts[ev.type] || 0) + 1;
  if (verbose && ['goal', 'foul', 'card', 'offside', 'penalty', 'corner', 'save', 'sub', 'halftime', 'fulltime', 'nearmiss', 'injury', 'advantage'].includes(ev.type)) {
    const who = ev.p ? ev.p.name : ev.scorer ? ev.scorer.name : ev.offender ? ev.offender.name : ev.in ? ev.in.name : '';
    console.log(ev.minute.padStart(5), ev.type.padEnd(10), who, ev.card || '', ev.score ? ev.score.join('-') : '');
  }
});
const dt = 1 / 60;
let steps = 0;
const t0 = Date.now();
const maxSteps = halfSec * 2 * 60 * 3;
let stuck = 0, lastClock = -1;
const stateTime = {};
while (!m.finished && steps < maxSteps) {
  if (m.state === 'halftime') m.startSecondHalf();
  m.update(dt);
  steps++;
  stateTime[m.state] = (stateTime[m.state] || 0) + dt;
  if (m.clock === lastClock) stuck++; else stuck = 0;
  lastClock = m.clock;
  if (stuck > 60 * 30) { console.log('STUCK in state', m.state, m.restart && m.restart.type); break; }
}
const ms = Date.now() - t0;
const T = m.teams;
console.log(`\n${T[0].name} ${T[0].score} - ${T[1].score} ${T[1].name}   (seed ${seed}, ${steps} adım, ${ms} ms, ${(steps / 60 / (ms / 1000)).toFixed(0)}x gerçek zaman)`);
const s0 = T[0].stats, s1 = T[1].stats;
const pp = m.possessionPct();
const row = (k, a, b) => console.log(k.padEnd(14), String(a).padStart(6), String(b).padStart(6));
row('Topla oynama', pp[0] + '%', pp[1] + '%');
row('Şut', s0.shots, s1.shots); row('İsabetli', s0.shotsOn, s1.shotsOn); row('xG', s0.xg.toFixed(2), s1.xg.toFixed(2));
row('Pas', s0.passes, s1.passes); row('Pas isabet', s0.passes ? Math.round((100 * s0.passesOk) / s0.passes) + '%' : '-', s1.passes ? Math.round((100 * s1.passesOk) / s1.passes) + '%' : '-');
row('Korner', s0.corners, s1.corners); row('Faul', s0.fouls, s1.fouls); row('Ofsayt', s0.offsides, s1.offsides);
row('Sarı', s0.yellows, s1.yellows); row('Kırmızı', s0.reds, s1.reds); row('Kurtarış', s0.saves, s1.saves);
row('Değişiklik', T[0].subsUsed, T[1].subsUsed);
console.log('\nOlaylar:', JSON.stringify(counts));
console.log('Durum süreleri (s):', Object.fromEntries(Object.entries(stateTime).map(([k, v]) => [k, +v.toFixed(1)])));
const dists = m.allOnPitch().map((p) => p.stats.dist);
console.log('Ortalama koşu mesafesi (m):', (dists.reduce((a, b) => a + b, 0) / dists.length).toFixed(0), 'min', Math.min(...dists).toFixed(0), 'max', Math.max(...dists).toFixed(0));
const scorers = [];
for (const t of T) for (const p of t.players.concat(t.subs)) if (p.stats.goals) scorers.push(p.name + ' ' + p.stats.goals);
console.log('Gol atanlar:', scorers.join(', ') || '-');
