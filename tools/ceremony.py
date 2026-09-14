import asyncio, json
from playwright.async_api import async_playwright
STEP = """(args) => { const App = FS.App, m = App.match, d = App.director; const log = []; let last = null; let t = 0;
  const n = Math.round(args.secs * 60);
  for (let i = 0; i < n; i++) { m.update(1/60); d.update(1/60, m, App.ballMesh); App.updateVisuals(1/60); App.updateHUD(1/60); if (FS.Voice.ready) { FS.Voice.update(1/60); FS.Voice.flavor(1/60, m); }
    t += 1/60; const k = (d.shot ? d.shot.kind : 'LIVE') + '[' + m.state + '/' + (m.lineupPhase||'-') + ']'; if (k !== last) { log.push(t.toFixed(1) + ' ' + k); last = k; }
    if (args.stopPhase && m.lineupPhase === args.stopPhase && !args._seen) { args._seen = true; if (!args.stopAfter) break; }
    if (args.stopShot && d.shot && d.shot.kind === args.stopShot) break; }
  App.scene.render();
  const vis = m.allOnPitch().filter(p => !p.hidden).length; const offv = m.officials.all.filter(p => !p.hidden).length;
  return { log, state: m.state, phase: m.lineupPhase, vis, offv, q: FS.Voice.queue.map(q => q.keys.join('+')), playing: FS.Voice.playing ? FS.Voice.playing.item.keys.join('+') : null, said: FS.Voice.stats.said }; }"""
async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'])
        page = await browser.new_page(viewport={'width':1280,'height':800})
        errs=[]
        page.on('pageerror', lambda e: errs.append(f'[pageerror] {e}'))
        page.on('console', lambda m: errs.append(m.text) if m.type in ('error','warning') and 'GL Driver' not in m.text else None)
        await page.goto('http://localhost:8000/index.html'); await page.wait_for_timeout(600)
        await page.click('#btnStart'); await page.wait_for_timeout(2500)
        await page.evaluate("() => { FS.App.paused = true; FS.App.engine.stopRenderLoop(); FS.App.match.setHalfLength(600); }")
        r = await page.evaluate(STEP, {'secs': 2.5}); print(r['log'], r['vis'], r['offv'], r['playing'], r['q'][:3])
        await page.screenshot(path='tools/shot_c1_tunnel.png')
        r = await page.evaluate(STEP, {'secs': 6, 'stopShot': 'tunnelOut'}); print(r['log'], r['vis'], r['offv'])
        r = await page.evaluate(STEP, {'secs': 3}); print(r['log'], r['vis'])
        await page.screenshot(path='tools/shot_c2_out.png')
        r = await page.evaluate(STEP, {'secs': 30, 'stopPhase': 'line'}); print(r['log'], r['vis'], r['offv'], r['phase'])
        r = await page.evaluate(STEP, {'secs': 1.0}); 
        await page.screenshot(path='tools/shot_c3_line.png')
        r = await page.evaluate(STEP, {'secs': 30, 'stopPhase': 'handshake'}); print(r['log'], r['phase'])
        r = await page.evaluate(STEP, {'secs': 3.0}); print(r['log'])
        await page.screenshot(path='tools/shot_c4_shake.png')
        r = await page.evaluate(STEP, {'secs': 40}); print(r['log'], r['state'], r['phase'], 'said', r['said'], r['q'][:4])
        await page.screenshot(path='tools/shot_c5_after.png')
        print('\n'.join(errs) or 'NO ERRORS')
        await browser.close()
asyncio.run(main())
