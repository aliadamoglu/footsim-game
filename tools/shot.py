"""Playwright ile ekran görüntüsü + konsol hata yakalama"""
import asyncio, sys, json
from playwright.async_api import async_playwright

async def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'watch'
    wait = float(sys.argv[2]) if len(sys.argv) > 2 else 12
    cam = sys.argv[3] if len(sys.argv) > 3 else None
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'])
        page = await browser.new_page(viewport={'width': 1280, 'height': 720})
        errors = []
        page.on('console', lambda m: errors.append(f'[{m.type}] {m.text}') if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: errors.append(f'[pageerror] {e}'))
        await page.goto('http://localhost:8000/index.html')
        await page.wait_for_timeout(800)
        await page.screenshot(path='/home/user/futbol-sim/tools/shot_menu.png')
        if mode != 'menu':
            if mode == 'control':
                await page.check('input[name=mode][value=home]')
            await page.click('#btnStart')
            await page.wait_for_timeout(wait * 1000)
            if cam:
                await page.select_option('#camSelect', cam)
                await page.wait_for_timeout(2500)
            info = await page.evaluate("""() => { const m = FS.App.match; return { state: m.state, clock: m.clockText(), score: [m.teams[0].score, m.teams[1].score], fps: FS.App.engine.getFps().toFixed(0), meshes: FS.App.scene.meshes.length, cam: FS.App.director.userMode, shot: FS.App.director.shot && FS.App.director.shot.kind, events: m.events.length } }""")
            print(json.dumps(info))
            await page.screenshot(path=f'/home/user/futbol-sim/tools/shot_{mode}{"_"+cam if cam else ""}.png')
        print('\n'.join(errors[:30]) or 'no console errors')
        await browser.close()

asyncio.run(main())
