/* Çoklu maç istatistik ortalaması (denge ayarı için) */
const path = require('path');
const files = ['js/core/math.js', 'js/core/pitch.js', 'js/core/entities.js', 'js/data/teams.js', 'js/data/teams_ext.js', 'js/sim/weather.js', 'js/sim/ball.js', 'js/sim/actions.js', 'js/sim/ai.js', 'js/sim/tactics.js', 'js/sim/officials.js', 'js/sim/match.js'];
for (const f of files) require(path.join(__dirname, '..', f));
const FS = globalThis.FS;
const N = parseInt(process.argv[2] || '8', 10);
const halfSec = parseFloat(process.argv[3] || '180');
const pairs = [['GS', 'RMA'], ['FB', 'BAR'], ['BJK', 'MCI'], ['TS', 'LIV'], ['ARS', 'BAY'], ['PSG', 'INT'], ['GS', 'FB'], ['BAR', 'RMA']];
const agg = { goals: 0, shots: 0, shotsOn: 0, passes: 0, passOk: 0, corners: 0, fouls: 0, offsides: 0, yellows: 0, reds: 0, saves: 0, subs: 0, pens: 0, dist: 0, n: 0, stuck: 0, throwins: 0, goalkicks: 0, nearmiss: 0, tackles: 0, advantage: 0, freekicks: 0 };
const results = [];
for (let i = 0; i < N; i++) {
  const pr = pairs[i % pairs.length];
  const m = new FS.Match([FS.getTeam(pr[0]), FS.getTeam(pr[1])], { halfRealSec: halfSec, seed: 100 + i });
  const c = {};
  m.on((ev) => { c[ev.type] = (c[ev.type] || 0) + 1; });
  let steps = 0, stuck = 0, last = -1;
  while (!m.finished && steps < halfSec * 2 * 60 * 3) {
    if (m.state === 'halftime') m.startSecondHalf();
    m.update(1 / 60); steps++;
    if (m.clock === last) stuck++; else stuck = 0; last = m.clock;
    if (stuck > 1800) { agg.stuck++; console.log('STUCK', pr, m.state, m.restart && m.restart.type); break; }
  }
  const T = m.teams;
  for (const t of T) { const s = t.stats; agg.goals += t.score; agg.shots += s.shots; agg.shotsOn += s.shotsOn; agg.passes += s.passes; agg.passOk += s.passesOk; agg.corners += s.corners; agg.fouls += s.fouls; agg.offsides += s.offsides; agg.yellows += s.yellows; agg.reds += s.reds; agg.saves += s.saves; agg.subs += t.subsUsed; agg.pens += s.penalties || 0; }
  agg.throwins += c.throwin || 0; agg.goalkicks += c.goalkick || 0; agg.nearmiss += c.nearmiss || 0; agg.tackles += c.tackle || 0; agg.advantage += c.advantage || 0; agg.freekicks += c.freekick || 0;
  const ds = m.allOnPitch().map((p) => p.stats.dist); agg.dist += ds.reduce((a, b) => a + b, 0) / ds.length;
  agg.n++;
  results.push(`${pr[0]} ${T[0].score}-${T[1].score} ${pr[1]} (poss ${m.possessionPct().join('/')}, shots ${T[0].stats.shots}/${T[1].stats.shots})`);
}
console.log(results.join('\n'));
const per = (k) => (agg[k] / agg.n).toFixed(1);
console.log(`\nMaç başına ortalama (${agg.n} maç): goller ${per('goals')}, şut ${per('shots')}, isabet ${per('shotsOn')}, pas ${per('passes')} (%${Math.round((100 * agg.passOk) / Math.max(1, agg.passes))}), korner ${per('corners')}, taç ${per('throwins')}, kale vuruşu ${per('goalkicks')}, faul ${per('fouls')}, serbest vuruş ${per('freekicks')}, avantaj ${per('advantage')}, ofsayt ${per('offsides')}, sarı ${per('yellows')}, kırmızı ${per('reds')}, pen ${per('pens')}, kurtarış ${per('saves')}, değişiklik ${per('subs')}, direk/yakın ${per('nearmiss')}, müdahale ${per('tackles')}, mesafe ${per('dist')} m, takılma ${agg.stuck}`);
