"""Poz doğrulama: fall|slide|dive için yatış → kalkış karelerini yandan çeker; model merkezi ile sim konumu farkını ölçer.
Kullanım: python3 tools/dev/pose_shot.py fall /tmp/out_prefix"""
import asyncio, sys
from playwright.async_api import async_playwright
ARGS=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']
POSE=sys.argv[1]; OUT=sys.argv[2]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        pg = await b.new_page(viewport={'width':900,'height':500})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:8000/index.html'); await pg.wait_for_timeout(800)
        await pg.click('#modeSeg label:nth-child(2)'); await pg.click('input[name=wx][value=clear]', force=True)
        await pg.click('#btnStart'); await pg.wait_for_timeout(1500)
        for phase in ['lying','getup1','getup2','stood']:
            res = await pg.evaluate('''async ([pose, phase]) => {
              const A = FS.App; A.engine.stopRenderLoop(); A.skipScene(); const m = A.match;
              const step = () => { m.update(1/60); A.updateVisuals(1/60); };
              for (let i=0;i<60*8 && m.state!=='play';i++) step();
              const p = m.playersOnPitch(0).find(q=>q.role!=='GK'); const v = p.view;
              const hold = () => { p.x = 0; p.z = 0; p.facing = 0; p.vx=p.vz=0; p.speed=0; for (const q of m.allOnPitch()) if (q!==p && Math.hypot(q.x,q.z)<6) q.x += 8; m.ball.x = 20; m.ball.z = 20; m.ball.owner=null; };
              const setPose = (t) => { if (pose==='fall') p.fallT = t; else if (pose==='slide') p.tackleT = t; else { p.diveT = t; p.diveTarget = {x:0,y:0.5,z:2}; } };
              const frames = { lying: 45, getup1: 3, getup2: 8, stood: 30 };
              if (phase==='lying') setPose(2.0);
              if (phase==='getup1') setPose(0);
              for (let i=0;i<frames[phase];i++) { hold(); step(); if (phase==='lying') setPose(2.0); }
              const cam = A.director.cam; cam.position.set(0.3, 1.3, -5.0); cam.setTarget(new BABYLON.Vector3(0.3, 0.4, 0)); cam.fov = 0.7;
              A.scene.render();
              let mn=1e9, sx=0, sz=0, n=0; for (const msh of v.meshes){ msh.computeWorldMatrix(true); const bb = msh.getBoundingInfo().boundingBox; mn=Math.min(mn, bb.minimumWorld.y); sx += bb.centerWorld.x; sz += bb.centerWorld.z; n++; }
              return { phase, blend: +v.blend[pose==='fall'?'fall':pose==='slide'?'slide':'dive'].toFixed(2), minY:+mn.toFixed(3), bodyY:+v.body.position.y.toFixed(3), centerX:+(sx/n).toFixed(2), centerZ:+(sz/n).toFixed(2) };
            }''', [POSE, phase])
            print(res)
            await pg.screenshot(path=f'{OUT}_{phase}.png')
        print('ERRS', errs[:5]); await b.close()
asyncio.run(main())
