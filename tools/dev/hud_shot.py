"""HUD ekran görüntüsü: mod (watch|control), boyut, mobil; oyun 'play' durumuna gelince olay bandını zorla gösterir.
Kullanım: W=1280 H=720 [MOBILE=1] python3 tools/dev/hud_shot.py control out.png"""
import asyncio, sys, os
from playwright.async_api import async_playwright
ARGS=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']
W=int(os.environ.get('W','1280')); H=int(os.environ.get('H','720')); MOBILE=os.environ.get('MOBILE')=='1'
MODE=sys.argv[1]; OUT=sys.argv[2]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        kw = dict(viewport={'width':W,'height':H})
        if MOBILE: kw.update(has_touch=True, is_mobile=True, device_scale_factor=2)
        ctx = await b.new_context(**kw); pg = await ctx.new_page()
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:8000/index.html'); await pg.wait_for_timeout(800)
        if MODE=='control': await pg.click('#modeSeg label:nth-child(2)')
        await pg.click('input[name=wx][value=clear]', force=True)
        await pg.click('#btnStart'); await pg.wait_for_timeout(1500)
        res = await pg.evaluate('''async () => {
          const A = FS.App; A.engine.stopRenderLoop(); A.skipScene();
          const m = A.match; const d = A.director;
          const step = () => { m.update(1/60); d.update(1/60, m, A.ballMesh); FS.WeatherFX.update(1/60, d.pos); A.updateVisuals(1/60); A.updateHUD(1/60); };
          for (let i=0;i<60*8 && m.state!=='play';i++) step();
          for (let i=0;i<60*6;i++) { if (FS.Human.active) FS.Human.keys = { ArrowUp: true }; step(); if (d.skipping()) d.skip(); }
          A.showBanner('SARI KART', 'Romelu Lukaku (FEN)', 60000, null, 'yellow');
          A.addCommentary('Faul. Lukaku → Gündoğan, hakem kartına uzanıyor.');
          A.scene.render();
          const r = (id) => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
          const banner = r('banner'), hud = r('hudControls'), comm = r('commentary'), bar = r('bar'), joy = r('joyBase'), tb = r('touchBtns');
          const ov = (a, b) => a && b && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
          return { state: m.state, banner, hud, comm, bar, joy, tb, overlaps: { bannerHud: ov(banner, hud), bannerBar: ov(banner, bar), bannerJoy: ov(banner, joy), bannerTb: ov(banner, tb), commBanner: ov(comm, banner), hudComm: ov(hud, comm) }, barH: getComputedStyle(document.getElementById('game')).getPropertyValue('--barH'), sw: window.innerWidth, docW: document.documentElement.scrollWidth };
        }''')
        print(res)
        await pg.screenshot(path=OUT)
        print('ERRS', errs[:5]); await b.close()
asyncio.run(main())
