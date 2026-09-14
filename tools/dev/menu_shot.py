"""Menü duyarlılık taraması: farklı görünüm boyutlarında yatay taşma (scrollWidth > clientWidth), ekran dışına taşan öğeler, ekran görüntüsü.
Kullanım: python3 tools/dev/menu_shot.py out_prefix  (W/H listesi içeride)"""
import asyncio, sys, json
from playwright.async_api import async_playwright
ARGS=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']
OUT=sys.argv[1] if len(sys.argv)>1 else '/tmp/menu'
SIZES=[(1440,900,False),(1024,768,False),(820,1180,True),(390,844,True),(844,390,True),(360,740,True)]
VIEWS=['menu','career','transfer']
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        for (W,H,mob) in SIZES:
            kw = dict(viewport={'width':W,'height':H})
            if mob: kw.update(has_touch=True, is_mobile=True, device_scale_factor=2)
            ctx = await b.new_context(**kw); pg = await ctx.new_page()
            errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto('http://localhost:8000/index.html'); await pg.wait_for_timeout(700)
            for view in VIEWS:
                if view=='career': await pg.click('#btnCareer'); await pg.wait_for_timeout(300)
                if view=='transfer': await pg.click('#btnCrBack'); await pg.wait_for_timeout(200); await pg.click('#btnTransfer'); await pg.wait_for_timeout(300)
                res = await pg.evaluate('''() => {
                  const de = document.documentElement; const vw = de.clientWidth;
                  const over = []; const root = [...document.querySelectorAll('#menu,#career,#transfer')].find(e => !e.classList.contains('hidden'));
                  const walk = (el) => { for (const c of el.children) { const r = c.getBoundingClientRect(); if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) over.push({ id: c.id || c.className || c.tagName, l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) }); walk(c); } };
                  if (root) walk(root);
                  const seen = new Set(); const uniq = over.filter(o => { const k = String(o.id).slice(0, 30); if (seen.has(k)) return false; seen.add(k); return true; });
                  return { root: root && root.id, vw, scrollW: de.scrollWidth, bodyScrollW: document.body.scrollWidth, rootScrollW: root ? root.scrollWidth : 0, rootClientW: root ? root.clientWidth : 0, overflowCount: over.length, over: uniq.slice(0, 8) };
                }''')
                flag = 'OVERFLOW' if (res['scrollW']>res['vw']+1 or res['bodyScrollW']>res['vw']+1 or res['rootScrollW']>res['rootClientW']+1 or res['overflowCount']) else 'ok'
                print(W,H,view,flag,json.dumps(res, ensure_ascii=False)[:600])
                await pg.screenshot(path=f'{OUT}_{W}x{H}_{view}.png', full_page=False)
            if errs: print('ERRS', errs[:3])
            await ctx.close()
        await b.close()
asyncio.run(main())
