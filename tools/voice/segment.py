# Sessizlik tabanlı bölütleme: her banka için beklenen parça sayısına ulaşana kadar eşik/aralık ayarı yapılır.
import wave, numpy as np, json, sys, os
B = json.load(open('tools/voice/manifest2.json')); combos = json.load(open('tools/voice/combos.json'))
def load(f):
    w = wave.open(f); sr = w.getframerate(); a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768; return sr, a
def segments(a, sr, thr_db, min_sil, min_seg=0.18, hop=0.005):
    win = int(sr * 0.02); hopn = int(sr * hop)
    n = (len(a) - win) // hopn
    rms = np.array([np.sqrt((a[i * hopn:i * hopn + win] ** 2).mean()) for i in range(n)])
    db = 20 * np.log10(rms + 1e-6)
    voiced = db > thr_db
    segs = []; i = 0
    while i < n:
        if voiced[i]:
            j = i
            while j < n:
                # sessizlik uzunluğu ölç
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
report = []
for bank, parts in combos.items():
    items = [it for p in parts for it in B[p]]
    f = f'audio/voice/{bank}.wav'
    if not os.path.exists(f): print('missing', f); continue
    sr, a = load(f)
    want = len(items); best = None
    for thr in (-38, -40, -42, -36, -44, -34, -46, -32):
        for ms in (0.22, 0.18, 0.26, 0.15, 0.30, 0.12, 0.35, 0.10):
            segs = segments(a, sr, thr, ms)
            d = len(segs) - want
            if best is None or abs(d) < abs(best[0]): best = (d, thr, ms, segs)
            if d == 0: break
        if best[0] == 0: break
    d, thr, ms, segs = best
    report.append((bank, want, len(segs), thr, ms))
    if d != 0:
        # en yakın çözüm: fazla varsa en kısa boşlukları birleştir, eksikse en uzun parçaları böl (uyarı)
        while len(segs) > want:
            gaps = [(segs[i + 1][0] - segs[i][1], i) for i in range(len(segs) - 1)]
            g, i = min(gaps); segs[i] = (segs[i][0], segs[i + 1][1]); del segs[i + 1]
        if len(segs) < want: print('!! UNDER-SEGMENTED', bank, len(segs), want)
    pad0, pad1 = 0.04, 0.09
    for (k, txt), (s0, s1) in zip(items, segs):
        st = max(0, s0 - pad0); en = min(len(a) / sr, s1 + pad1)
        out[k] = [bank, round(st, 3), round(en - st, 3)]
    # süre/metin korelasyonu (yanlış hizalama kontrolü)
    lens = np.array([len(t) for k, t in items]); durs = np.array([out[k][2] for k, t in items])
    print(bank, 'want', want, 'got', len(segs), 'thr', thr, 'sil', ms, 'corr %.2f' % np.corrcoef(lens, durs)[0, 1], 'dur min %.2f max %.2f' % (durs.min(), durs.max()))
json.dump(out, open('tools/voice/sprites2.json', 'w'), ensure_ascii=False)
print('total', len(out))
