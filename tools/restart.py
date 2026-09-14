"""Menü → maç → menü → farklı takımlarla maç: sahne yeniden kurulumu hatasız mı?"""
import asyncio, json
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
        await page.click('#btnStart'); await page.wait_for_timeout(2500)
        info1 = await page.evaluate("() => ({ teams: FS.App.match.teams.map(t => t.short), meshes: FS.App.scene.meshes.length })")
        await page.click('#btnMenu'); await page.wait_for_timeout(300)
        # farklı takım seç: takım kartlarına tıkla
        cards = await page.evaluate("() => Array.from(document.querySelectorAll('.teamCard')).map(c => c.dataset.code || c.textContent.trim().slice(0, 12))")
        print('cards', cards[:14])
        await page.evaluate("() => { const c = document.querySelectorAll('.teamCard'); c[4].click(); }")
        await page.wait_for_timeout(200)
        await page.evaluate("() => { const c = document.querySelectorAll('.teamCard'); c[6].click(); }")
        await page.wait_for_timeout(200)
        sel = await page.evaluate("() => [FS.App.settings.home, FS.App.settings.away, FS.App.settings.side]")
        print('settings', sel)
        await page.check('input[name=len][value=\"1.5\"]')
        await page.click('#btnStart'); await page.wait_for_timeout(2500)
        info2 = await page.evaluate("() => ({ teams: FS.App.match.teams.map(t => t.short), meshes: FS.App.scene.meshes.length, halfSec: FS.App.match.opts.halfRealSec, len: document.getElementById('lenSelect').value })")
        print(json.dumps(info1), json.dumps(info2))
        # oyun içi süre değişikliği
        await page.select_option('#lenSelect', '5'); await page.wait_for_timeout(300)
        ts = await page.evaluate("() => ({ halfSec: FS.App.match.opts.halfRealSec, ts: FS.App.match.timeScale.toFixed(2) })")
        print('after lenSelect', ts)
        await page.evaluate("() => FS.App.scene.render()")
        await page.screenshot(path='/home/user/futbol-sim/tools/shot_restart.png')
        print('\n'.join(errors[:20]) or 'no console errors')
        await browser.close()
asyncio.run(main())
