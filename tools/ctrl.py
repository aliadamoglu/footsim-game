"""Kontrol modu testi: klavye girdisi ile hareket/pas/şut/duran top. python3 tools/ctrl.py"""
import asyncio, sys, json
from playwright.async_api import async_playwright
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
        await page.wait_for_timeout(2500)
        await page.evaluate("() => { FS.App.engine.stopRenderLoop(); FS.App.setSpeed(1); }")
        step = """async (secs) => { const App = FS.App, m = App.match; const dt = 1/60; let t = 0; while (t < secs) { m.update(dt); App.updateVisuals(dt); App.director.update(dt, m, App.ballMesh); App.updateHUD(dt); t += dt; } App.scene.render(); const h = FS.Human; return { state: m.state, clock: m.clockText(), restart: m.restart && m.restart.type + '/' + m.restart.team, human: h.player && h.player.shortName, hp: h.player && [h.player.x, h.player.z].map(v => +v.toFixed(1)), ball: [m.ball.x, m.ball.z].map(v => +v.toFixed(1)), hasBall: h.player && h.player.hasBall, charging: h.charging, events: m.events.length, last: m.events.slice(-3).map(e => e.type) }; }"""
        async def run(secs, label):
            r = await page.evaluate(step, secs)
            print(label, json.dumps(r, ensure_ascii=False))
            return r
        r = await run(1.0, 'start')
        # kickoff: insan takımı başlıyorsa boşluk ile başlat
        await page.keyboard.down('Space'); await run(0.2, 'space-down'); await page.keyboard.up('Space'); r = await run(1.5, 'after-kickoff')
        # hareket: sağa koş (sprint)
        await page.keyboard.down('ArrowRight'); await page.keyboard.down('Shift'); await run(2.0, 'run-right'); await page.keyboard.up('Shift'); await page.keyboard.up('ArrowRight')
        # oyuncu değiştir
        await page.keyboard.press('q'); await run(0.5, 'switch')
        # pas: boşluk kısa
        await page.keyboard.down('Space'); await run(0.15, 'pass-hold'); await page.keyboard.up('Space'); await run(1.5, 'pass-release')
        # şut: X basılı tut
        await page.keyboard.down('ArrowRight'); await run(1.0, 'move')
        await page.keyboard.down('x'); await run(0.6, 'shot-hold'); await page.keyboard.up('x'); await page.keyboard.up('ArrowRight'); await run(2.0, 'shot-release')
        # savunma: baskı + kayma
        await page.keyboard.down('Space'); await run(1.0, 'press'); await page.keyboard.up('Space')
        await page.keyboard.press('x'); await run(1.0, 'slide')
        # kamera ve kontrol bırak/al
        await page.keyboard.press('v'); await run(0.5, 'cam-v')
        await page.keyboard.press('t'); await run(0.5, 't-release')
        await page.keyboard.press('t'); await run(0.5, 't-take')
        # duraklat/aç
        await page.keyboard.press('p'); await page.wait_for_timeout(200); paused = await page.evaluate("() => FS.App.paused"); print('paused', paused); await page.keyboard.press('p')
        await page.keyboard.press('2'); sp = await page.evaluate("() => FS.App.settings.speed"); print('speed', sp)
        # uzun süre insan kontrolüyle oyna (rastgele girdi) - hata avı
        keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
        import random
        random.seed(3)
        for i in range(40):
            k = random.choice(keys); await page.keyboard.down(k)
            act = random.choice(['Space', 'x', 'c', 'd', 'e', None, None])
            if act: await page.keyboard.down(act)
            await run(0.5, f'rnd{i}') if i % 10 == 0 else await page.evaluate(step, 0.5)
            if act: await page.keyboard.up(act)
            await page.keyboard.up(k)
        r = await run(0.1, 'end')
        await page.screenshot(path='/home/user/futbol-sim/tools/shot_ctrl.png')
        print('\n'.join(errors[:20]) or 'no console errors')
        await browser.close()
asyncio.run(main())
