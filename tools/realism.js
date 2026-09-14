/* Gerçekçilik ölçümü: pas isabeti (tür/mesafe), hücum dizisi uzunluğu, top tutma süresi, baskı, koşu profili */
const path = require('path');
const files = ['js/core/math.js', 'js/core/pitch.js', 'js/core/entities.js', 'js/data/teams.js', 'js/data/teams_ext.js', 'js/sim/weather.js', 'js/sim/ball.js', 'js/sim/actions.js', process.env.AI_PATH || 'js/sim/ai.js', 'js/sim/tactics.js', 'js/sim/officials.js', 'js/sim/match.js'];
for (const f of files) require(f.startsWith('/') ? f : path.join(__dirname, '..', f));
const FS = globalThis.FS, M = FS.M, AI = FS.AI;
const N = parseInt(process.argv[2] || '6', 10);
const rows = []; const seq = []; const carry = []; let goals = 0, shots = 0, fouls = 0, tackles = 0, offs = 0, boxEntries = 0, stuck = 0;
let moveSamples = 0, sprintS = 0, jogS = 0, walkS = 0, stillS = 0, pressSamples = 0, pressSum = 0;
const pairs = [['GS', 'RMA'], ['FB', 'BAR'], ['BJK', 'MCI'], ['TS', 'LIV'], ['ARS', 'BAY'], ['PSG', 'INT'], ['GS', 'FB'], ['BAR', 'RMA'], ['NAP', 'ATM'], ['SAM', 'GOZ'], ['COR', 'ERZ'], ['BOD', 'SAB'], ['MUN', 'AVL'], ['SLA', 'LSK'], ['KON', 'KAS'], ['BVB', 'RBL']];
for (let i = 0; i < N; i++) {
  const pr = pairs[i % pairs.length];
  const m = new FS.Match([FS.getTeam(pr[0]), FS.getTeam(pr[1])], { halfRealSec: 180, seed: 100 + i });
  let pending = null, curSeq = 0, curTeam = -1, owner = null, ownT = 0, inBox = false, last = -1, stk = 0;
  m.on((ev) => {
    if (ev.type === 'pass' && ev.kind !== 'gk') {
      if (pending) { const np = ev.p; pending.res = np === pending.tg ? 'ok' : np && np.team === pending.p.team ? 'mate' : np ? 'int' : 'none'; rows.push(pending); }
      const b = m.ball; const tg = ev.target;
      pending = { kind: ev.kind, d: tg ? M.dist(b.x, b.z, tg.x, tg.z) : 0, t: m.t, p: ev.p, tg, pressure: FS.Actions.pressureOn(ev.p, m.playersOnPitch(1 - ev.p.team)) };
    }
    if (ev.type === 'throwin' || ev.type === 'goalkick' || ev.type === 'corner') { if (pending) { pending.res = 'out'; rows.push(pending); pending = null; } }
    if (ev.type === 'foul') fouls++; if (ev.type === 'tackle') tackles++; if (ev.type === 'offside') offs++;
  });
  let st = 0;
  while (!m.finished && st < 180 * 2 * 60 * 3) {
    if (m.state === 'halftime') m.startSecondHalf();
    m.update(1 / 60); st++;
    if (m.clock === last) stk++; else stk = 0; last = m.clock; if (stk > 1800) { stuck++; break; }
    if (m.state !== 'play') continue;
    const b = m.ball;
    if (pending && b.owner && b.owner !== pending.p) { const o = b.owner; pending.res = o === pending.tg ? 'ok' : (o.team === pending.p.team ? 'mate' : 'int'); rows.push(pending); pending = null; }
    if (pending && m.t - pending.t > 4) { pending.res = 'none'; rows.push(pending); pending = null; }
    if (b.owner) {
      if (b.owner.team !== curTeam) { if (curSeq > 0) seq.push(curSeq); curSeq = 0; curTeam = b.owner.team; }
      if (b.owner !== owner) { if (owner) carry.push(ownT); owner = b.owner; ownT = 0; curSeq++; }
      ownT += 1 / 60;
      const dir = m.dirOf(b.owner.team); const ib = FS.PITCH.inPenaltyArea(b.x, b.z, dir); if (ib && !inBox) boxEntries++; inBox = ib;
      if (st % 6 === 0) { pressSamples++; pressSum += FS.Actions.pressureOn(b.owner, m.playersOnPitch(1 - b.owner.team)); }
    }
    if (st % 10 === 0) for (const p of m.allOnPitch()) { const sp = Math.hypot(p.vx, p.vz); moveSamples++; if (sp > 7) sprintS++; else if (sp > 2.5) jogS++; else if (sp > 0.3) walkS++; else stillS++; }
  }
  goals += m.teams[0].score + m.teams[1].score; shots += m.teams[0].stats.shots + m.teams[1].stats.shots;
}
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0) + '%';
const by = (f) => { const g = {}; for (const r of rows) { const k = f(r); g[k] = g[k] || { n: 0, ok: 0, int: 0, mate: 0, out: 0, none: 0 }; g[k].n++; g[k][r.res]++; } return g; };
const fmt = (g) => Object.entries(g).sort().map(([k, v]) => `  ${k}: n=${v.n} ok=${pct(v.ok, v.n)} int=${pct(v.int, v.n)} mate=${pct(v.mate, v.n)} out=${pct(v.out, v.n)} none=${pct(v.none, v.n)}`).join('\n');
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const q = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * f)] : 0; };
console.log(`PASSES/match ${(rows.length / N).toFixed(0)}  completed ${pct(rows.filter((r) => r.res === 'ok').length, rows.length)} (to target) / ${pct(rows.filter((r) => r.res === 'ok' || r.res === 'mate').length, rows.length)} (kept)`);
console.log('by kind\n' + fmt(by((r) => r.kind)));
console.log('by dist\n' + fmt(by((r) => (r.d < 8 ? 'a<8' : r.d < 15 ? 'b8-15' : r.d < 25 ? 'c15-25' : r.d < 35 ? 'd25-35' : 'e35+'))));
console.log(`SEQUENCES: n/match ${(seq.length / N).toFixed(0)} median ${med(seq)} p75 ${q(seq, 0.75)} p90 ${q(seq, 0.9)} 1-touch ${pct(seq.filter((s) => s <= 1).length, seq.length)}  5+ ${pct(seq.filter((s) => s >= 5).length, seq.length)}`);
console.log(`CARRY s: median ${med(carry).toFixed(2)} p25 ${q(carry, 0.25).toFixed(2)} p75 ${q(carry, 0.75).toFixed(2)} p90 ${q(carry, 0.9).toFixed(2)}  <0.3s ${pct(carry.filter((c) => c < 0.3).length, carry.length)}`);
console.log(`PRESSURE on carrier mean ${(pressSum / Math.max(1, pressSamples)).toFixed(2)}  at pass: <0.1 ${pct(rows.filter((r) => r.pressure < 0.1).length, rows.length)} 0.1-0.4 ${pct(rows.filter((r) => r.pressure >= 0.1 && r.pressure < 0.4).length, rows.length)} 0.4+ ${pct(rows.filter((r) => r.pressure >= 0.4).length, rows.length)}`);
console.log(`MOVE: sprint ${pct(sprintS, moveSamples)} jog ${pct(jogS, moveSamples)} walk ${pct(walkS, moveSamples)} still ${pct(stillS, moveSamples)}`);
console.log(`MATCH: goals ${(goals / N).toFixed(2)} shots ${(shots / N).toFixed(1)} boxEntries ${(boxEntries / N).toFixed(1)} fouls ${(fouls / N).toFixed(1)} tackles ${(tackles / N).toFixed(1)} offsides ${(offs / N).toFixed(1)} stuck ${stuck}`);
