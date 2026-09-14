"""Kulüp verisi üretici: clubs/*.json (Vikipedi) → js/data/teams_ext.js
- Mevki eşleme (Vikipedi 'position' → oyun rolleri), diziliş seçimi (kadro yapısına göre 4-2-3-1 / 4-3-3 / 3-5-2)
- Güç (overall): kulüp taban gücü (UEFA katsayısı/lig seviyesi) + forma numarası/kaptanlık/yaş/rol sinyalleri
- Mevcut 12 kulüp (teams.js) korunur; onlara yalnızca meta (teknik direktör, kapasite, UEFA torbası) eklenir
"""
import json, re, unicodedata, hashlib, sys
pages = json.load(open('clubs/pages.json')); squads = json.load(open('clubs/squads_raw.json'))
ppos = json.load(open('clubs/player_pos.json')); sl_mgr = json.load(open('clubs/sl_managers.json'))
sl_teams = {t['page']: t for t in json.load(open('clubs/sl_teams.json'))}
META = json.load(open('clubs/meta.json'))  # elle: id, kısa ad, TR ad, şehir, stadyum, forma renkleri, taban güç, mentalite
EXISTING = {'GS','FB','BJK','TS','RMA','BAR','MCI','LIV','ARS','BAY','PSG','INT'}

def h(s, salt=''):
    return int(hashlib.md5((s + '|' + salt).encode()).hexdigest()[:8], 16) / 0xFFFFFFFF

def map_one(p, f, no):
    p = p.strip().lower()
    if not p: return None
    if 'goalkeeper' in p: return 'GK'
    if 'centre-back' in p or 'centre back' in p or 'center-back' in p or 'central defender' in p: return 'CB'
    if 'right-back' in p or 'right back' in p or 'right wing-back' in p: return 'RB'
    if 'left-back' in p or 'left back' in p or 'left wing-back' in p: return 'LB'
    if 'full-back' in p or 'wing-back' in p or 'fullback' in p: return 'RB' if h(p + str(no), 'fb') < 0.5 else 'LB'
    if 'defensive midfielder' in p or 'holding' in p: return 'DM'
    if 'attacking midfielder' in p or 'playmaker' in p or 'second striker' in p: return 'AM'
    if 'central midfielder' in p or 'box-to-box' in p or p in ('midfielder', 'midfield', 'central midfield'): return 'CM'
    if 'left winger' in p or 'left-winger' in p or 'left midfielder' in p or 'left wing' in p: return 'LW'
    if 'right winger' in p or 'right-winger' in p or 'right midfielder' in p or 'right wing' in p: return 'RW'
    if 'winger' in p or 'wide' in p: return 'RW' if h(p + str(no), 'w') < 0.5 else 'LW'
    if 'striker' in p or 'centre-forward' in p or 'centre forward' in p or 'forward' in p: return 'ST'
    if 'defender' in p: return 'CB'
    if 'midfielder' in p: return 'CM'
    return None

def map_pos(wpos, fs_pos, no):
    """Vikipedi 'position' (virgülle ayrılmış; ilki asıl mevki) → oyun rolü; boşsa kadro tablosundaki GK/DF/MF/FW."""
    f = (fs_pos or '').upper()
    for tok in re.split(r'[,/]| and ', wpos or ''):
        r = map_one(tok, f, no)
        if r:
            # kadro tablosuyla çelişen (ör. sayfa 'Midfielder' ama tablo FW) → tabloya göre düzelt
            if f == 'GK' and r != 'GK': return 'GK'
            if f == 'FW' and r in ('CB', 'RB', 'LB', 'DM', 'CM'): return 'ST' if r != 'CM' else 'AM'
            if f == 'DF' and r in ('ST', 'RW', 'LW', 'AM'): return 'CB' if r in ('ST', 'AM') else ('RB' if r == 'RW' else 'LB')
            if f == 'MF' and r == 'GK': return 'CM'
            return r
    return {'GK': 'GK', 'DF': 'CB', 'MF': 'CM', 'FW': 'ST'}.get(f, 'CM')

FORMS = {
    '4-2-3-1': ['GK','RB','CB','CB','LB','DM','DM','RW','AM','LW','ST'],
    '4-3-3':   ['GK','RB','CB','CB','LB','CM','DM','CM','RW','ST','LW'],
    '3-5-2':   ['GK','CB','CB','CB','RWB','CM','DM','CM','LWB','ST','ST'],
}
# rol uyum matrisi: (istenen rol → oyuncu doğal mevkii → ceza)
COMPAT = {
    'GK': {'GK': 0},
    'CB': {'CB': 0, 'DM': 5, 'RB': 5, 'LB': 5, 'CM': 12},
    'RB': {'RB': 0, 'LB': 3, 'CB': 4, 'RW': 6, 'CM': 12, 'DM': 10},
    'LB': {'LB': 0, 'RB': 3, 'CB': 4, 'LW': 6, 'CM': 12, 'DM': 10},
    'RWB': {'RB': 0, 'RW': 3, 'LB': 3, 'CM': 6},
    'LWB': {'LB': 0, 'LW': 3, 'RB': 3, 'CM': 6},
    'DM': {'DM': 0, 'CM': 2, 'CB': 5, 'AM': 8},
    'CM': {'CM': 0, 'DM': 2, 'AM': 2, 'RW': 7, 'LW': 7},
    'AM': {'AM': 0, 'CM': 3, 'RW': 3, 'LW': 3, 'ST': 5},
    'RW': {'RW': 0, 'LW': 2, 'AM': 3, 'ST': 5, 'RB': 8},
    'LW': {'LW': 0, 'RW': 2, 'AM': 3, 'ST': 5, 'LB': 8},
    'ST': {'ST': 0, 'RW': 4, 'LW': 4, 'AM': 5},
}

def player_rating(club_base, row, pos, born, captain_rank, idx, nplayers, has_stars=False):
    """Kulüp tabanından sapma: kaptanlık, düşük forma numarası (1-11 → asil), yaş (24-30 zirve), sıralama.
    Yıldız listesi olan kulüplerde listede olmayanlar 'kadro oyuncusu' sayılır (taban −3.5)."""
    r = club_base - (3.5 if has_stars else 0)
    no = int(row['no']) if row['no'].isdigit() else 99
    if no <= 11: r += 1.5
    elif no <= 23: r += 0.5
    elif no >= 40: r -= 2.5
    if captain_rank == 1: r += 2.0
    elif captain_rank == 2: r += 1.0
    age = 2026 - born if born else 26
    if age <= 19: r -= 6
    elif age <= 21: r -= 3
    elif age <= 23: r -= 1
    elif age >= 36: r -= 6
    elif age >= 34: r -= 4
    elif age >= 32: r -= 1.5
    if born is None and no >= 30: r -= 4  # sayfasız + yüksek numara: genç/altyapı
    if not row.get('link'): r -= 3
    r += (h(row['name'], 'ovr') - 0.5) * 5  # deterministik ±2.5
    return r, age

def build_club(page, info):
    meta = META[page]
    rows = squads.get(page, [])
    # kaptanlık
    def crank(o):
        o = (o or '').lower()
        if o.startswith('captain') or o == 'captain': return 1
        if 'vice' in o or '2nd' in o or 'second' in o or '3rd' in o or '4th' in o: return 2
        return 0
    players = []
    seen = set()
    for i, row in enumerate(rows):
        name = row['name'].strip()
        if not name or name in seen: continue
        o = (row.get('other') or '').lower()
        if re.search(r'\bat .* until\b|on loan to|posthumous|retired', o): continue  # kiralık gönderilen / anma
        seen.add(name)
        info_p = ppos.get(row.get('link') or '', {})
        pos = map_pos(info_p.get('pos'), row.get('pos'), row.get('no'))
        rating, age = player_rating(meta['base'], row, pos, info_p.get('born'), crank(row.get('other')), i, len(rows), bool(meta.get('stars')))
        no = int(row['no']) if row['no'].isdigit() else None
        players.append({'no': no, 'name': name, 'pos': pos, 'ovr': rating, 'age': age, 'idx': i})
    # ratings: kulüp içi dağılımı sıkıştır (en iyi ~ base+6, en kötü ~ base-8)
    if not players: return None
    # star overrides
    stars = meta.get('stars') or {}
    cap_ns = (max(stars.values()) - 2) if stars else 99
    def norm(t): return ''.join(ch for ch in unicodedata.normalize('NFD', t.lower()) if unicodedata.category(ch) != 'Mn')
    def star_of(name):
        if name in stars: return stars[name]
        n = norm(name); toks = n.split()
        for sname, v in stars.items():
            sn = norm(sname); st = sn.split()
            if sn == n or (len(toks) > 1 and len(st) > 1 and toks[0] == st[0] and toks[-1] == st[-1]): return v
        return None
    for p in players:
        v = star_of(p['name'])
        if v is not None: p['ovr'] = v
        else: p['ovr'] = min(p['ovr'], cap_ns)
    # formation choice
    cnt = {}
    for p in players: cnt[p['pos']] = cnt.get(p['pos'], 0) + 1
    form = meta.get('formation')
    if not form:
        wingers = cnt.get('RW', 0) + cnt.get('LW', 0); sts = cnt.get('ST', 0); cbs = cnt.get('CB', 0); ams = cnt.get('AM', 0)
        if cbs >= 5 and sts >= 3 and wingers <= 2: form = '3-5-2'
        elif ams >= 2: form = '4-2-3-1'
        else: form = '4-3-3'
    slots = FORMS[form]
    # ilk 11 seçimi: Macar algoritması (toplam "güç − mevki uyumsuzluk cezası" en yüksek 11)
    import numpy as np
    from scipy.optimize import linear_sum_assignment
    cost = np.zeros((len(players), 11))
    for pi, p in enumerate(players):
        for si, role in enumerate(slots):
            pen = COMPAT[role].get(p['pos'])
            if pen is None: pen = 1 if role == 'GK' and p['pos'] == 'GK' else (60 if (role == 'GK') != (p['pos'] == 'GK') else 16)
            cost[pi, si] = -(p['ovr'] - pen)
    ri, ci = linear_sum_assignment(cost)
    xi = [None] * 11
    for r, c in zip(ri, ci): xi[c] = players[r]
    avail = [p for p in players if p not in xi]
    # yedekler: GK + en iyi 7 (mevki çeşitliliği: en az 2 savunmacı, 2 orta saha, 2 hücumcu)
    bench = []
    gks = [p for p in avail if p['pos'] == 'GK']
    if gks: g = max(gks, key=lambda p: p['ovr']); bench.append(g); avail.remove(g)
    groups = {'D': ['CB','RB','LB'], 'M': ['DM','CM','AM'], 'A': ['RW','LW','ST']}
    for gname, poss in groups.items():
        cands = sorted([p for p in avail if p['pos'] in poss], key=lambda p: -p['ovr'])[:2]
        for c in cands: bench.append(c); avail.remove(c)
    rest = sorted([p for p in avail if p['pos'] != 'GK'], key=lambda p: -p['ovr'])
    while len(bench) < 8 and rest: bench.append(rest.pop(0))
    def fmt(p, role):
        no = p['no'] if p['no'] is not None else 30 + (p['idx'] % 60)
        return [no, p['name'], role, int(round(max(52, min(93, p['ovr']))))]
    xi_rows = [fmt(p, slots[i]) for i, p in enumerate(xi)]
    bench_rows = [fmt(p, p['pos']) for p in bench]
    # forma numarası çakışması (numarasız oyuncular / tablo hataları) → boş bir numara ver
    used = set()
    for r in xi_rows + bench_rows:
        if r[0] in used:
            n = 30
            while n in used or any(x[0] == n for x in xi_rows + bench_rows): n += 1
            r[0] = n
        used.add(r[0])
    ib = info.get('infobox', {})
    cap = meta.get('capacity')
    if not cap:
        c = re.search(r'[\d,\.]{4,}', ib.get('capacity', '') or ''); cap = int(c.group(0).replace(',', '').replace('.', '')) if c else None
    mgr = meta.get('manager') or re.sub(r'\s*\(.*?\)', '', re.sub(r'\[\[|\]\]', '', ib.get('manager', ''))).split('|')[-1].strip()
    return {
        'id': meta['id'], 'name': meta['name'], 'short': meta['short'], 'city': meta['city'], 'country': meta['country'], 'league': meta['league'],
        'stadium': meta['stadium'], 'capacity': cap, 'manager': mgr, 'founded': meta.get('founded'), 'uclPot': info.get('ucl_pot'),
        'formation': form, 'mentality': meta.get('mentality', 0.5), 'kits': meta['kits'], 'xi': xi_rows, 'bench': bench_rows,
    }

out = []
for page, info in pages.items():
    if page not in META: print('NO META', page); continue
    if META[page].get('existing'):
        m = META[page]; out.append({'id': m['id'], 'existing': True, 'manager': m['manager'], 'capacity': m['capacity'], 'founded': m['founded'], 'uclPot': info.get('ucl_pot')}); continue
    c = build_club(page, info)
    if c: out.append(c)
print('built', len(out))
json.dump(out, open('clubs/built.json', 'w'), ensure_ascii=False, indent=1)

# ---- js/data/teams_ext.js ----
def js_str(x): return json.dumps(x, ensure_ascii=False)
def kit_js(k): return '{ pattern: %s, c1: %s, c2: %s, shorts: %s, socks: %s, num: %s }' % tuple(js_str(k[f]) for f in ('pattern', 'c1', 'c2', 'shorts', 'socks', 'num'))
def row_js(r): return '[%d, %s, %s, %d]' % (r[0], js_str(r[1]), js_str(r[2]), r[3])
lines = ["/* 2026-27 ek kulüpler — Şampiyonlar Ligi lig aşaması (36) + Süper Lig (18) tamamlayıcı verisi.",
         "   Kaynak: Vikipedi kadro tabloları + oyuncu sayfaları (mevki/doğum yılı); tools/data/build_teams.py ile üretildi — ELLE DÜZENLEMEYİN.",
         "   Şema teams.js ile aynı; ek alanlar: country, capacity, manager, founded, uclPot. */",
         "(function (root) {", "  const FS = (root.FS = root.FS || {});", "  const EXT = ["]
meta_js = {}
for c in out:
    if c.get('existing'):
        meta_js[c['id']] = {'manager': c['manager'], 'capacity': c['capacity'], 'founded': c['founded'], 'uclPot': c['uclPot']}; continue
    meta_js[c['id']] = {'manager': c['manager'], 'capacity': c['capacity'], 'founded': c['founded'], 'uclPot': c['uclPot']}
    lines.append("    {")
    lines.append("      id: %s, name: %s, short: %s, city: %s, country: %s, league: %s, stadium: %s," % tuple(js_str(c[f]) for f in ('id', 'name', 'short', 'city', 'country', 'league', 'stadium')))
    lines.append("      capacity: %s, manager: %s, founded: %s, uclPot: %s," % (js_str(c['capacity']), js_str(c['manager']), js_str(c['founded']), js_str(c['uclPot'])))
    lines.append("      formation: %s, mentality: %s," % (js_str(c['formation']), c['mentality']))
    lines.append("      kits: { home: %s, away: %s, gk: %s }," % (kit_js(c['kits']['home']), kit_js(c['kits']['away']), kit_js(c['kits']['gk'])))
    lines.append("      xi: [" + ", ".join(row_js(r) for r in c['xi']) + "],")
    lines.append("      bench: [" + ", ".join(row_js(r) for r in c['bench']) + "],")
    lines.append("    },")
lines.append("  ];")
lines.append("  for (const t of EXT) if (!FS.TEAMS.some((x) => x.id === t.id)) FS.TEAMS.push(t);")
# doğum yılları (Vikipedi oyuncu sayfaları) — FS.Transfer.ageOf bunu kullanır
born = {}
for page, rows in squads.items():
    for r in rows:
        info_p = ppos.get(r.get('link') or '', {})
        if info_p.get('born') and r['name'] not in born: born[r['name'].strip()] = info_p['born']
lines.append("  /* Doğum yılı (Vikipedi) — transfer/kariyer modunda yaş hesabı için; eksik isimler için transfer.js kendi tahminini kullanır */")
lines.append("  FS.PLAYER_BORN = " + json.dumps(born, ensure_ascii=False, separators=(',', ':')) + ";")
lines.append("  /* Kulüp kartı için ek bilgi (mevcut 12 kulüp dâhil): teknik direktör, stadyum kapasitesi, kuruluş, ŞL torbası (null = ŞL'de değil) */")
lines.append("  FS.CLUB_META = " + json.dumps(meta_js, ensure_ascii=False, indent=None).replace('", "', '", "') + ";")
lines.append("  for (const t of FS.TEAMS) { const m = FS.CLUB_META[t.id]; if (m) { if (t.manager == null) t.manager = m.manager; if (t.capacity == null) t.capacity = m.capacity; if (t.founded == null) t.founded = m.founded; if (t.uclPot === undefined) t.uclPot = m.uclPot; } if (!t.country) t.country = t.league === 'Süper Lig' ? 'Türkiye' : t.league === 'LaLiga' ? 'İspanya' : t.league === 'Premier League' ? 'İngiltere' : t.league === 'Bundesliga' ? 'Almanya' : t.league === 'Serie A' ? 'İtalya' : t.league === 'Ligue 1' ? 'Fransa' : ''; }")
lines.append("})(typeof window !== 'undefined' ? window : globalThis);")
open('../../js/data/teams_ext.js', 'w').write('\n'.join(lines) + '\n')
print('teams_ext.js written')
