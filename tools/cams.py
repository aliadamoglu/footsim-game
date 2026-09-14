"""Tüm kamera modlarını aynı maç anında görüntüle: python3 tools/cams.py [simSec]"""
import asyncio, sys, json
from playwright.async_api import async_playwright
simsec = float(sys.argv[1]) if len(sys.argv) > 1 else 60
modes = ['broadcast', 'tv2', 'low', 'drone', 'goal', 'player', 'auto']
async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'])
        page = await browser.new_page(viewport={'width': 1280, 'height': 720})
        errors = []
        page.on('console', lambda m: errors.append(f'[{m.type}] {m.text}') if m.type in ('error',) else None)
        page.on('pageerror', lambda e: errors.append(f'[pageerror] {e}'))
        await page.goto('http://localhost:8000/index.html')
        await page.wait_for_timeout(500)
        await page.check('input[name=mode][value=home]')
        await page.click('#btnStart')
        await page.wait_for_timeout(3000)
        await page.evaluate("""async (simsec) => {
          const App = FS.App, m = App.match; App.engine.stopRenderLoop();
          let simT = 0, steps = 0;
          while (simT < simsec) { m.update(1/60); simT += 1/60; steps++; if (steps % 30 === 0) { App.updateVisuals(1/60); App.director.update(1/60, m, App.ballMesh); } if (steps % 600 === 0) await new Promise(r => setTimeout(r, 0)); }
        }""", simsec)
        for mode in modes:
            info = await page.evaluate("""async (mode) => {
              const App = FS.App, m = App.match; const dt = 1/30;
              App.director.setUserMode(mode); document.getElementById('camSelect').value = mode;
              let t = 0; while (t < 4) { m.update(dt); App.updateVisuals(dt); App.director.update(dt, m, App.ballMesh); App.updateHUD(dt); t += dt; }
              App.scene.render();
              const d = App.director; const h = FS.Human;
              return { mode, state: m.state, cam: d.cam.position.asArray().map(v => +v.toFixed(1)), fov: +d.cam.fov.toFixed(2), ball: [m.ball.x, m.ball.z].map(v => +v.toFixed(1)), human: h.player && h.player.shortName, active: h.active };
            }""", mode)
            print(json.dumps(info, ensure_ascii=False))
            await page.screenshot(path=f'/home/user/futbol-sim/tools/shot_cam_{mode}.png')
        # istatistik paneli + yardım
        await page.keyboard.press('Tab'); await page.wait_for_timeout(300)
        await page.evaluate("() => FS.App.scene.render()")
        await page.screenshot(path='/home/user/futbol-sim/tools/shot_stats.png')
        await page.keyboard.press('Tab'); await page.keyboard.press('h'); await page.wait_for_timeout(300)
        await page.screenshot(path='/home/user/futbol-sim/tools/shot_help.png')
        print('\n'.join(errors[:20]) or 'no console errors')
        await browser.close()
asyncio.run(main())
