"""Simülasyonu tarayıcı içinde hızlı ileri sar: match.update() döngüsü + her adımda App.onMatchEvent akışı çalışır.
   python3 tools/ff.py <simSaniye> [shotName] [mode watch|control]"""
import asyncio, sys, json
from playwright.async_api import async_playwright
simsec = float(sys.argv[1]) if len(sys.argv) > 1 else 120
shot = sys.argv[2] if len(sys.argv) > 2 else 'ff'
mode = sys.argv[3] if len(sys.argv) > 3 else 'watch'
async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'])
        page = await browser.new_page(viewport={'width': 1280, 'height': 720})
        errors = []
        page.on('console', lambda m: errors.append(f'[{m.type}] {m.text}') if m.type in ('error',) else None)
        page.on('pageerror', lambda e: errors.append(f'[pageerror] {e}'))
        await page.goto('http://localhost:8000/index.html')
        await page.wait_for_timeout(500)
        if mode == 'control':
            await page.check('input[name=mode][value=home]')
        await page.click('#btnStart')
        await page.wait_for_timeout(3000)
        # hızlı ileri sar: render döngüsünden bağımsız, 1/60 s adımlarla; her 2 sn simde bir görsel/HUD/director güncellemesi
        res = await page.evaluate("""async (simsec) => {
          const App = FS.App, m = App.match; const log = [];
          const t0 = performance.now(); let simT = 0; let steps = 0;
          const seen = new Set();
          while (simT < simsec && m.state !== 'fulltime') {
            if (m.state === 'halftime') { m.startSecondHalf(); App.director.onEvent({type:'kickoff'}, m); App.hideOverlay(); }
            m.update(1/60); simT += 1/60; steps++;
            if (steps % 30 === 0) { App.updateVisuals(1/60); App.director.update(1/60, m, App.ballMesh); App.updateHUD(0.5); }
            if (steps % 600 === 0) await new Promise(r => setTimeout(r, 0));
            if (performance.now() - t0 > 150000) { log.push('TIMEOUT'); break; }
          }
          const ev = m.events.filter(e => ['goal','card','penalty','offside','foul','corner','sub','save','injury','halftime','addedtime','fulltime'].includes(e.type)).slice(-40).map(e => e.type + '@' + e.minute + (e.p ? ' ' + e.p.shortName : '') + (e.scorer ? ' ' + e.scorer.shortName : '') + (e.card ? ' ' + e.card : '') + (e.reason ? ' ' + e.reason : ''));
          const counts = {}; for (const e of m.events) counts[e.type] = (counts[e.type] || 0) + 1;
          return { state: m.state, clock: m.clockText(), half: m.half, score: [m.teams[0].score, m.teams[1].score], steps, wallMs: Math.round(performance.now() - t0), counts, last: ev, replay: !!App.director.replayFrame, shot: App.director.shot && App.director.shot.kind, cam: App.director.cam.position.asArray().map(v => +v.toFixed(1)), log };
        }""", simsec)
        print(json.dumps(res, ensure_ascii=False))
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f'/home/user/futbol-sim/tools/shot_{shot}.png')
        print('\n'.join(errors[:20]) or 'no console errors')
        await browser.close()
asyncio.run(main())
