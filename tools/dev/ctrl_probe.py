"""Kontrol-kamera tutarlılığı: 'ileri' basılıyken oyuncu kameranın baktığı yönde mi gidiyor, sağ basılınca sağa mı?
Ölçüm: 3 sn ileri → yer değiştirme vektörü ile kamera yaw'ı arasındaki açı; ardından 'sağ' için."""
import asyncio, sys, json
from playwright.async_api import async_playwright
ARGS=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        pg = await b.new_page(viewport={'width':1280,'height':720})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:8000/index.html'); await pg.wait_for_timeout(800)
        await pg.click('#modeSeg label:nth-child(2)')
        await pg.click('input[name=wx][value=clear]', force=True)
        await pg.click('#btnStart'); await pg.wait_for_timeout(1500)
        res = await pg.evaluate('''async () => {
          const A = FS.App; A.engine.stopRenderLoop(); A.skipScene();
          const m = A.match; const d = A.director; const H = FS.Human; const M = FS.M;
          const step = () => { m.update(1/60); d.update(1/60, m, A.ballMesh); A.updateVisuals(1/60); };
          for (let i=0;i<60*8 && m.state!=='play';i++) step();
          const out = [];
          const run = (keys, secs, label) => {
            const p0 = H.player; const sx = p0.x, sz = p0.z; const yaw0 = d.pf.yaw;
            let maxTurn = 0, yawPrev = yaw0;
            for (let i=0;i<secs*60;i++) { H.keys = keys; step(); if (m.state!=='play') break; const dy = Math.abs(M.angleDiff(yawPrev, d.pf.yaw))*60; maxTurn = Math.max(maxTurn, dy); yawPrev = d.pf.yaw; }
            const p = H.player; const dx = p.x - sx, dz = p.z - sz; const mv = Math.atan2(dz, dx);
            out.push({ label, same: p === p0, dist: +Math.hypot(dx, dz).toFixed(1), moveDir: +mv.toFixed(2), camYaw0: +yaw0.toFixed(2), camYawEnd: +d.pf.yaw.toFixed(2), angMoveVsCam0: +M.angleDiff(yaw0, mv).toFixed(2), maxYawRate: +maxTurn.toFixed(2), state: m.state });
          };
          for (let i=0;i<60;i++) { H.keys = {}; step(); }
          run({ ArrowUp: true }, 3, 'forward');
          for (let i=0;i<30;i++) { H.keys = {}; step(); }
          run({ ArrowRight: true }, 3, 'right');
          for (let i=0;i<30;i++) { H.keys = {}; step(); }
          run({ ArrowDown: true }, 3, 'back');
          for (let i=0;i<30;i++) { H.keys = {}; step(); }
          run({ ArrowLeft: true }, 3, 'left');
          return out;
        }''')
        for r in res: print(r)
        print('ERRS', errs[:5]); await b.close()
asyncio.run(main())
