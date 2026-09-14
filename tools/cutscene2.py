"""Ara sahne dizisi testi (FPS'ten bağımsız): sim + yönetmeni sayfa içinde sabit adımla ilerlet, çekim geçişlerini logla, istenen çekimde kare al."""
import asyncio, json, sys
from playwright.async_api import async_playwright

STEP = """async (args) => {
  const { simsec, wantShot, forceRed, forceSub } = args; const App = FS.App, m = App.match, d = App.director;
  const log = []; let last = null; let simT = 0; let steps = 0; let captured = false;
  if (forceRed) { const p = m.playersOnPitch(1).find(p => p.role !== 'GK' && Math.abs(p.z) < 12) || m.playersOnPitch(1)[3]; const v = m.playersOnPitch(0).find(q => q.role !== 'GK'); m.setState('play'); m.callFoul({ offender: p, victim: v, x: p.x, z: p.z, card: 'red', inBox: false, dogso: true, injury: false, info: {} }); }
  if (forceSub) { const outs = m.playersOnPitch(0).filter(p => p.role !== 'GK').slice(0, 2); outs.forEach(o => o.injured = true); m.whistleThen(() => m.beginRestart('throwin', 1, 10, -34, {}), 0.3, 'stop'); }
  while (simT < simsec) {
    m.update(1/60); d.update(1/60, m, App.ballMesh); App.updateVisuals(1/60); simT += 1/60; steps++;
    const k = d.shot ? d.shot.kind + (d.shot.group ? '(' + d.shot.group.length + ')' : '') : null;
    if (k !== last) { log.push(simT.toFixed(1) + 's ' + (k || 'LIVE') + ' [' + m.state + ']' + (d.forceCut ? ' cut' : '')); last = k; }
    if (wantShot && k && k.startsWith(wantShot) && d.shotT > 0.8 && !captured) { captured = true; break; }
    if (steps % 600 === 0) await new Promise(r => setTimeout(r, 0));
  }
  App.updateHUD(0.6); App.scene.render();
  return { log, captured, state: m.state, cam: d.cam.position.asArray().map(v => +v.toFixed(1)) };
}"""

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader'])
        page = await browser.new_page(viewport={'width':1024,'height':576})
        errs=[]
        page.on('pageerror', lambda e: errs.append(f'[pageerror] {e}'))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        await page.goto('http://localhost:8000/index.html'); await page.wait_for_timeout(500)
        await page.click('#btnStart'); await page.wait_for_timeout(2500)
        await page.evaluate("() => { FS.App.paused = true; FS.App.engine.stopRenderLoop(); }")
        # uzun maç (2x10 dk) → devre arasına girmesin; kickoff → play
        await page.evaluate("() => FS.App.match.setHalfLength(600)")
        r = await page.evaluate(STEP, {'simsec': 14, 'wantShot': None, 'forceRed': False, 'forceSub': False}); print('warmup', r['log'][-2:], r['state'])
        for i in range(6):
            if (await page.evaluate("() => FS.App.match.state")) == 'play': break
            r = await page.evaluate(STEP, {'simsec': 5, 'wantShot': None, 'forceRed': False, 'forceSub': False})
        # çift değişiklik sahnesi
        r = await page.evaluate(STEP, {'simsec': 20, 'wantShot': 'subEnter', 'forceRed': False, 'forceSub': True}); print('SUB', json.dumps(r, ensure_ascii=False))
        await page.screenshot(path='/home/user/futbol-sim/tools/cs2_subEnter.png')
        r = await page.evaluate(STEP, {'simsec': 20, 'wantShot': None, 'forceRed': False, 'forceSub': False}); print('after', json.dumps(r['log'], ensure_ascii=False), r['state'])
        # kırmızı kart dizisi
        r = await page.evaluate(STEP, {'simsec': 30, 'wantShot': 'sideWide', 'forceRed': True, 'forceSub': False}); print('RED', json.dumps(r, ensure_ascii=False))
        await page.screenshot(path='/home/user/futbol-sim/tools/cs2_sideWide.png')
        # atla
        await page.evaluate("() => FS.App.skipScene()")
        r = await page.evaluate(STEP, {'simsec': 12, 'wantShot': None, 'forceRed': False, 'forceSub': False}); print('after skip', json.dumps(r['log'], ensure_ascii=False), r['state'])
        print('\n'.join(errs) or 'no errors')
        await browser.close()
asyncio.run(main())
