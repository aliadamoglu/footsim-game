"""Ara sahne testi: maçı başlat, oyun akarken zorla değişiklik / kırmızı kart tetikle; yönetmen çekimlerini ve Atla düğmesini kontrol et, kareleri kaydet."""
import asyncio, json, sys
from playwright.async_api import async_playwright

FORCE_SUB = """() => { const m = FS.App.match; const t = m.teams[0];
  const out = m.playersOnPitch(0).find(p => p.role !== 'GK' && p.z < 0) || m.playersOnPitch(0).find(p => p.role !== 'GK');
  const sub = t.subs.find(s => !s.used && s.pos !== 'GK');
  // duran top hazırlığı sırasında gerçekleşsin (gerçek akış): oyun dışı yap
  m.whistleThen(() => { m.beginRestart('throwin', 1, 10, -34, {}); }, 0.3, 'stop');
  // beginRestart considerSubstitutions'ı çağırır; garanti için stamina düşür
  out.stamina = 0.2; m.clock = Math.max(m.clock, 60*60);
  return { out: out.name, sub: sub && sub.name }; }"""

FORCE_RED = """() => { const m = FS.App.match; const p = m.playersOnPitch(1).find(p => p.role !== 'GK' && p.z > -10 && p.z < 10) || m.playersOnPitch(1).find(p => p.role !== 'GK');
  const v = m.playersOnPitch(0).find(q => q.role !== 'GK');
  m.setState('play'); m.callFoul({ offender: p, victim: v, x: p.x, z: p.z, card: 'red', inBox: false, dogso: true, injury: false, info: {} });
  return p.name; }"""

INFO = """() => { const d = FS.App.director; const m = FS.App.match; return { shot: d.shot && d.shot.kind, q: (d.queue||[]).map(s=>s.kind), state: m.state, skip: document.getElementById('btnSkip').classList.contains('show'), cam: [d.cam.position.x.toFixed(1), d.cam.position.y.toFixed(1), d.cam.position.z.toFixed(1)], walkers: m.walkers.map(p => [p.name, p.x.toFixed(1), p.z.toFixed(1), p.speed.toFixed(1), !!p.hidden]) }; }"""

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader'])
        page = await browser.new_page(viewport={'width':1024,'height':576})
        errs=[]
        page.on('console', lambda m: errs.append(f'[{m.type}] {m.text}') if m.type in ('error','warning') else None)
        page.on('pageerror', lambda e: errs.append(f'[pageerror] {e}'))
        await page.goto('http://localhost:8000/index.html'); await page.wait_for_timeout(500)
        await page.click('#btnStart'); await page.wait_for_timeout(9000)
        print('start', json.dumps(await page.evaluate(INFO)))
        # --- değişiklik
        r = await page.evaluate(FORCE_SUB); print('force sub', r)
        seen = set()
        for i in range(16):
            await page.wait_for_timeout(700)
            info = await page.evaluate(INFO)
            k = info['shot']
            if k and k not in seen:
                seen.add(k); await page.screenshot(path=f'/home/user/futbol-sim/tools/cs_{k}.png'); print('  frame', k, json.dumps(info))
            elif i % 3 == 0: print('  ', json.dumps(info))
        # --- kırmızı kart (oyun akarken)
        await page.evaluate("() => FS.App.director.skip()")
        for i in range(30):
            await page.wait_for_timeout(500)
            if (await page.evaluate("() => FS.App.match.state")) == 'play': break
        r = await page.evaluate(FORCE_RED); print('force red', r)
        seen2 = set()
        skipped = False
        for i in range(60):
            await page.wait_for_timeout(500)
            info = await page.evaluate(INFO)
            k = info['shot']
            if k and (k not in seen2):
                seen2.add(k); await page.wait_for_timeout(600); await page.screenshot(path=f'/home/user/futbol-sim/tools/cs_red_{k}.png'); print('  frame', k, json.dumps(info))
            if k == 'sideWide' and not skipped:
                skipped = True
                await page.keyboard.press('Enter'); await page.wait_for_timeout(300)
                print('  after skip', json.dumps(await page.evaluate(INFO)))
            if skipped and info['state'] == 'play': break
            if i > 40: break
        print('\n'.join(errs[:20]) or 'no console errors')
        await browser.close()
asyncio.run(main())
