# Yeni isim bankaları (manifest3.json) için sessizlik tabanlı bölütleme → sprites3.json
# segment.py ile aynı yaklaşım; mp3 doğrudan soundfile ile okunur.
import soundfile as sf, numpy as np, json, os, sys
B = json.load(open('tools/voice/manifest3.json'))
def load(f):
    a, sr = sf.read(f)
    if a.ndim > 1: a = a.mean(1)
    return sr, a.astype(np.float32)
def segments(a, sr, thr_db, min_sil, min_seg=0.15, hop=0.005):
    win = int(sr * 0.02); hopn = int(sr * hop)
    n = (len(a) - win) // hopn
    idx = np.arange(n)[:, None] * hopn + np.arange(win)[None, :]
    rms = np.sqrt((a[idx] ** 2).mean(1))
    db = 20 * np.log10(rms + 1e-6)
    voiced = db > thr_db
    segs = []; i = 0
    while i < n:
        if voiced[i]:
            j = i
            while j < n:
                if not voiced[j]:
                    k = j
                    while k < n and not voiced[k]: k += 1
                    if (k - j) * hop >= min_sil or k >= n: break
                    j = k
                else: j += 1
            segs.append((i * hop, min(len(a) / sr, j * hop)))
            i = j
        else: i += 1
    return [s for s in segs if s[1] - s[0] >= min_seg]
out = {}
for bank, items in B.items():
    f = 'audio/voice/%s.mp3' % bank
    if not os.path.exists(f): print('missing', f); continue
    sr, a = load(f)
    want = len(items); best = None
    for thr in (-38, -40, -42, -36, -44, -34, -46, -32, -48, -30):
        for ms in (0.22, 0.18, 0.26, 0.15, 0.30, 0.12, 0.35, 0.10, 0.40):
            segs = segments(a, sr, thr, ms)
            d = len(segs) - want
            if best is None or abs(d) < abs(best[0]): best = (d, thr, ms, segs)
            if d == 0: break
        if best[0] == 0: break
    d, thr, ms, segs = best
    names = [t for k, t in items]
    if d != 0:
        # DP hizalama: parça ↔ metin. Geçişler: 1↔1, 1 parça↔2 metin (kaçan sınır → içeriden böl), 2 parça↔1 metin (sahte bölünme → birleştir)
        durs0 = [s1 - s0 for s0, s1 in segs]
        rate = sum(durs0) / sum(len(t) for t in names)
        exp = [0.10 + len(t) * rate * 0.85 for t in names]
        INF = 1e18; n, m = len(segs), len(names)
        dp = [[INF] * (m + 1) for _ in range(n + 1)]; bt = [[None] * (m + 1) for _ in range(n + 1)]
        dp[0][0] = 0
        for i in range(1, n + 1):
            for j in range(1, m + 1):
                c = dp[i - 1][j - 1] + abs(durs0[i - 1] - exp[j - 1])
                if c < dp[i][j]: dp[i][j] = c; bt[i][j] = (1, 1)
                if j >= 2:
                    c = dp[i - 1][j - 2] + abs(durs0[i - 1] - exp[j - 1] - exp[j - 2] - 0.15) + 0.25
                    if c < dp[i][j]: dp[i][j] = c; bt[i][j] = (1, 2)
                if i >= 2:
                    gap = segs[i - 1][0] - segs[i - 2][1]
                    c = dp[i - 2][j - 1] + abs(durs0[i - 1] + durs0[i - 2] + gap - exp[j - 1]) + 0.25
                    if c < dp[i][j]: dp[i][j] = c; bt[i][j] = (2, 1)
        # geri izleme
        i, j = n, m; ops = []
        while i > 0 or j > 0:
            di, dj = bt[i][j]; ops.append((i, j, di, dj)); i -= di; j -= dj
        ops.reverse()
        new = []
        for (i, j, di, dj) in ops:
            if di == 1 and dj == 1: new.append(segs[i - 1])
            elif di == 2: new.append((segs[i - 2][0], segs[i - 1][1])); print('   merge', bank, 'items', j, names[j - 1])
            else:
                s0, s1 = segs[i - 1]
                # iki metnin beklenen süre oranına göre bölme bölgesi; en düşük enerjili nokta
                frac = exp[j - 2] / (exp[j - 2] + exp[j - 1])
                lo = s0 + (s1 - s0) * max(0.15, frac - 0.2); hi = s0 + (s1 - s0) * min(0.85, frac + 0.2)
                i0, i1 = int(lo * sr), int(hi * sr); win = int(sr * 0.03); step = int(sr * 0.005)
                seg = a[i0:i1]
                e = np.array([np.sqrt((seg[q:q + win] ** 2).mean()) for q in range(0, max(1, len(seg) - win), step)])
                cut = (i0 + int(np.argmin(e)) * step + win // 2) / sr
                print('   split', bank, 'items', j - 1, j, names[j - 2], '|', names[j - 1], 'dur %.2f' % (s1 - s0), 'at %.2f' % cut)
                new.append((s0, cut)); new.append((cut, s1))
        segs = new
        assert len(segs) == want, (bank, len(segs), want)
    pad0, pad1 = 0.04, 0.09
    for (k, txt), (s0, s1) in zip(items, segs):
        st = max(0, s0 - pad0); en = min(len(a) / sr, s1 + pad1)
        out[k] = [bank, round(st, 3), round(en - st, 3)]
    lens = np.array([len(t) for k, t in items]); durs = np.array([out[k][2] for k, t in items])
    print(bank, 'want', want, 'got', len(segs), 'thr', thr, 'sil', ms, 'corr %.2f' % np.corrcoef(lens, durs)[0, 1], 'dur min %.2f max %.2f' % (durs.min(), durs.max()))
json.dump(out, open('tools/voice/sprites3.json', 'w'), ensure_ascii=False)
print('total', len(out))
