/* Saha geometrisi (FIFA/IFAB standart ölçüleri, metre cinsinden)
   Koordinat sistemi: x = uzun eksen (kale-kale), z = kısa eksen, y = yükseklik.
   Ev sahibi (takım 0) ilk yarıda SOL kaleyi (x<0) korur, SAĞA (x>0) hücum eder.
*/
(function (root) {
  const FS = (root.FS = root.FS || {});
  const P = (FS.PITCH = {
    length: 105,
    width: 68,
    halfL: 52.5,
    halfW: 34,
    goalWidth: 7.32,
    goalHeight: 2.44,
    goalDepth: 2.2,
    postRadius: 0.06,
    penAreaDepth: 16.5,
    penAreaHalfW: 20.16, // (7.32/2 + 16.5)
    goalAreaDepth: 5.5,
    goalAreaHalfW: 9.16, // (7.32/2 + 5.5)
    penSpotDist: 11,
    centerRadius: 9.15,
    cornerArc: 1,
    margin: 6, // saha dışı kuşak (reklam panoları öncesi)
  });

  // Takımın hücum ettiği kale yönü: +1 => x>0 kalesine hücum eder, -1 => x<0
  P.attackDir = (teamIndex, half) => {
    // Takım 0 ilk yarıda sağa (+1) hücum eder, ikinci yarıda sola
    const base = teamIndex === 0 ? 1 : -1;
    return half === 1 ? base : -base;
  };

  P.goalCenter = (dir) => ({ x: P.halfL * dir, z: 0 }); // dir yönündeki kale
  P.ownGoalCenter = (teamIndex, half) => P.goalCenter(-P.attackDir(teamIndex, half));

  P.inPenaltyArea = (x, z, dir) => {
    // dir: hangi kalenin ceza sahası (+1 => x>0 uçtaki kale)
    const gx = P.halfL * dir;
    const dx = (gx - x) * dir; // kale çizgisinden içeri mesafe
    return dx >= 0 && dx <= P.penAreaDepth && Math.abs(z) <= P.penAreaHalfW;
  };
  P.inGoalArea = (x, z, dir) => {
    const gx = P.halfL * dir;
    const dx = (gx - x) * dir;
    return dx >= 0 && dx <= P.goalAreaDepth && Math.abs(z) <= P.goalAreaHalfW;
  };
  P.inside = (x, z) => Math.abs(x) <= P.halfL && Math.abs(z) <= P.halfW;
  // Topun tamamı çizgiyi geçmeli: top yarıçapı 0.11 m
  P.BALL_R = 0.11;
  P.fullyOutTouch = (z) => Math.abs(z) > P.halfW + P.BALL_R;
  P.fullyOutGoalLine = (x) => Math.abs(x) > P.halfL + P.BALL_R;
  // Kale çizgisi geçildi mi ve direkler arasında mı (gol)
  P.isGoal = (x, y, z, dir) => {
    // dir yönündeki kalede gol: topun tamamı çizgiyi geçmeli
    if (dir > 0 ? x <= P.halfL + P.BALL_R : x >= -P.halfL - P.BALL_R) return false;
    if (Math.abs(z) > P.goalWidth / 2 - P.BALL_R * 0.3) return false;
    if (y > P.goalHeight - P.BALL_R * 0.3) return false;
    return true;
  };
  P.penaltySpot = (dir) => ({ x: (P.halfL - P.penSpotDist) * dir, z: 0 });
  P.cornerSpot = (dir, side) => ({ x: P.halfL * dir, z: P.halfW * side });
  P.clampToPitch = (p, m) => {
    const mm = m == null ? 0.3 : m;
    p.x = FS.M.clamp(p.x, -P.halfL + mm, P.halfL - mm);
    p.z = FS.M.clamp(p.z, -P.halfW + mm, P.halfW - mm);
    return p;
  };
})(typeof window !== 'undefined' ? window : globalThis);
