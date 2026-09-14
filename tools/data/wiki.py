"""Wikipedia API yardımcıları (İngilizce Vikipedi): wikitext bölümleri, infobox alanları, {{Fs player}} kadro satırları."""
import json, re, sys, time, urllib.request, urllib.parse
UA = {'User-Agent': 'footsim-research/1.0 (local football sim; contact: none)'}
API = 'https://en.wikipedia.org/w/api.php'
def api(params, retries=6):
    params = dict(params, format='json', formatversion='2')
    url = API + '?' + urllib.parse.urlencode(params)
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(8 * (i + 1)); continue
            if i == retries - 1: raise
            time.sleep(1.5)
        except Exception as e:
            if i == retries - 1: raise
            time.sleep(1.5)
def wikitext(title, section=None):
    p = {'action': 'parse', 'page': title, 'prop': 'wikitext', 'redirects': 1}
    if section is not None: p['section'] = section
    r = api(p)
    if 'error' in r: return None
    return r['parse']['wikitext']
def sections(title):
    r = api({'action': 'parse', 'page': title, 'prop': 'sections', 'redirects': 1})
    if 'error' in r: return []
    return [(s['index'], s['line'], s['level']) for s in r['parse']['sections']]
def find_section(title, names):
    for idx, line, lvl in sections(title):
        l = line.lower()
        if any(n in l for n in names): return idx, line
    return None, None
def batch_section0(titles):
    """50'ye kadar sayfanın giriş bölümü (infobox dahil) wikitext'i → {title: text}"""
    out = {}
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        r = api({'action': 'query', 'prop': 'revisions', 'rvprop': 'content', 'rvslots': 'main', 'rvsection': '0', 'titles': '|'.join(chunk), 'redirects': 1})
        norm = {}
        for n in r['query'].get('normalized', []): norm[n['to']] = n['from']
        red = {}
        for n in r['query'].get('redirects', []): red[n['to']] = n['from']
        for pg in r['query']['pages']:
            if 'revisions' not in pg: continue
            txt = pg['revisions'][0]['slots']['main']['content']
            t = pg['title']; orig = red.get(t, t); orig = norm.get(orig, orig)
            out[orig] = txt; out[t] = txt
        time.sleep(0.3)
    return out
def strip_markup(s):
    s = re.sub(r'<ref[^>]*/>', '', s); s = re.sub(r'<ref[^>]*>.*?</ref>', '', s, flags=re.S)
    s = re.sub(r'\{\{nowrap\|([^}]*)\}\}', r'\1', s)
    s = re.sub(r'\{\{[^{}]*\}\}', '', s)
    s = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]*)\]\]', r'\1', s)
    s = re.sub(r"'''?", '', s); s = re.sub(r'<[^>]+>', '', s)
    return s.strip()
def infobox_fields(txt):
    """Basit infobox ayrıştırıcı: |alan = değer (iç içe şablonlara toleranslı)"""
    f = {}
    m = re.search(r'\{\{Infobox football club(.*)', txt, flags=re.S)
    if not m: return f
    body = m.group(1)
    depth = 0; cur = ''; parts = []
    for ch in body:
        if ch == '{': depth += 1
        elif ch == '}':
            depth -= 1
            if depth < 0: break
        if ch == '|' and depth == 0: parts.append(cur); cur = ''
        else: cur += ch
    parts.append(cur)
    for p in parts:
        if '=' in p:
            k, v = p.split('=', 1); f[k.strip().lower()] = v.strip()
    return f
FS_RE = re.compile(r'\{\{(?:Fs player|Football squad player|fs player|football squad player)2?\s*\|(.*?)\}\}', re.S)
def parse_squad(txt):
    rows = []
    for m in FS_RE.finditer(txt):
        kv = {}
        for part in re.split(r'\|(?![^\[]*\]\])', m.group(1)):
            if '=' in part:
                k, v = part.split('=', 1); kv[k.strip().lower()] = v.strip()
        name = kv.get('name', '')
        link = None
        lm = re.match(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', name)
        if lm: link = lm.group(1); disp = lm.group(2) or lm.group(1)
        else: disp = strip_markup(name)
        disp = strip_markup(disp)
        rows.append({'no': kv.get('no', '').strip(), 'nat': kv.get('nat', ''), 'pos': kv.get('pos', ''), 'name': disp, 'link': link, 'other': strip_markup(kv.get('other', ''))})
    return rows
if __name__ == '__main__':
    print(json.dumps(sections(sys.argv[1])[:40], ensure_ascii=False))
