import asyncio, sys, json
from playwright.async_api import async_playwright

JS = sys.argv[1] if len(sys.argv) > 1 else "({})"
wait = float(sys.argv[2]) if len(sys.argv) > 2 else 6
shot = sys.argv[3] if len(sys.argv) > 3 else 'debug'

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'])
        page = await browser.new_page(viewport={'width': 1280, 'height': 720})
        errors = []
        page.on('console', lambda m: errors.append(f'[{m.type}] {m.text}') if m.type in ('error',) else None)
        page.on('pageerror', lambda e: errors.append(f'[pageerror] {e}'))
        await page.goto('http://localhost:8000/index.html')
        await page.wait_for_timeout(500)
        await page.click('#btnStart')
        await page.wait_for_timeout(wait * 1000)
        res = await page.evaluate("() => { try { return JSON.stringify(" + JS + "); } catch (e) { return 'ERR ' + e.message; } }")
        print(res)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f'/home/user/futbol-sim/tools/shot_{shot}.png')
        print('\n'.join(errors[:20]) or 'no console errors')
        await browser.close()
asyncio.run(main())
