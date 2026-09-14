"""Oyuncu takip kamerası ölçümü (hafif): N saniye oyun, her 10 karede kontrol edilen oyuncunun ekrandaki izdüşümü/mesafesi.
Kullanım: python3 tools/dev/cam_probe.py [saniye] [ekran görüntüsü yolu]"""
import asyncio, sys, json
from playwright.async_api import async_playwright
ARGS=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']
SECS=float(sys.argv[1]) if len(sys.argv)>1 else 40
OUT=sys.argv[2] if len(sys.argv)>2 else None
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        pg = await b.new_page(viewport={'width':1280,'height':720})
        errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:8000/index.html')
        await pg.wait_for_timeout(800)
        await pg.click('#modeSeg label:nth-child(2)')
        await pg.click('input[name=wx][value=clear]', force=True)
        await pg.click('#btnStart')
        await pg.wait_for_timeout(1500)
        res = await pg.evaluate('''async (secs) => {
          const A = FS.App; A.engine.stopRenderLoop(); A.skipScene();
          const m = A.match; const d = A.director; const H = FS.Human; const cam = d.cam; const eng = A.engine;
          const step = () => { m.update(1/60); d.update(1/60, m, A.ballMesh); A.updateVisuals(1/60); };
          for (let i=0;i<60*8 && m.state!=='play';i++) step();
          const n = Math.round(secs*60);
          const st = { frames:0, play:0, shot:0, meas:0, offscreen:0, far:0, close:0, high:0, behindOk:0, switches:0, samples:[], bad:[] };
          let lastP = null, keyT = 0, keyDir = 0;
          const w = eng.getRenderWidth(), h = eng.getRenderHeight();
          for (let i=0;i<n;i++) {
            keyT -= 1/60; if (keyT <= 0) { keyT = 1 + Math.random()*1.5; keyDir = Math.floor(Math.random()*5); }
            H.keys = {}; if (keyDir===0) H.keys.ArrowUp = true; else if (keyDir===1) H.keys.ArrowLeft = true; else if (keyDir===2) H.keys.ArrowRight = true; else if (keyDir===3) { H.keys.ArrowUp = true; H.keys.ArrowRight = true; }
            step(); st.frames++;
            if (m.state !== 'play') continue; st.play++;
            if (d.shot || d.replay) { st.shot++; continue; }
            const hp = H.player; if (!hp) continue;
            if (lastP && lastP !== hp) st.switches++; lastP = hp;
            if (i % 10) continue;
            st.meas++;
            const vm = cam.getViewMatrix(true), pm = cam.getProjectionMatrix(true); const tm = vm.multiply(pm);
            const v = BABYLON.Vector3.Project(new BABYLON.Vector3(hp.x, 1.0, hp.z), BABYLON.Matrix.Identity(), tm, cam.viewport.toGlobal(w, h));
            const pos = cam.position; const dist = Math.hypot(hp.x - pos.x, hp.z - pos.z);
            const sx = v.x / w, sy = v.y / h;
            // kamera oyuncunun arkasında mı? (kamera→oyuncu vektörü ile oyuncunun hareket/bakış yönü arasındaki açı)
            const fwd = hp.speed > 1 ? Math.atan2(hp.vz, hp.vx) : hp.facing;
            const c2p = Math.atan2(hp.z - pos.z, hp.x - pos.x);
            const ang = Math.abs(FS.M.angleDiff(fwd, c2p));
            let bad = null;
            if (v.z > 1 || v.z < 0 || sx < 0 || sx > 1 || sy < 0 || sy > 1) { st.offscreen++; bad = 'offscreen'; }
            else if (dist > 11) { st.far++; bad = 'far'; }
            else if (dist < 2.5) { st.close++; bad = 'close'; }
            else if (sy < 0.3) { st.high++; bad = 'high'; }
            if (ang < 1.0) st.behindOk++;
            const rec = { t:+m.t.toFixed(1), name: hp.shortName, sx:+sx.toFixed(2), sy:+sy.toFixed(2), dist:+dist.toFixed(1), camY:+pos.y.toFixed(1), ang:+ang.toFixed(2), sp:+hp.speed.toFixed(1), ball: hp.hasBall, bad };
            if (bad && st.bad.length < 25) st.bad.push(rec);
            if (i % 300 === 0) st.samples.push(rec);
          }
          return st;
        }''', SECS)
        print(json.dumps({k:v for k,v in res.items() if k not in ('samples','bad')}))
        print('SAMPLES'); [print(s) for s in res['samples']]
        print('BAD'); [print(s) for s in res['bad']]
        if OUT:
            await pg.evaluate('() => FS.App.scene.render()')
            await pg.screenshot(path=OUT)
        print('ERRS', errs[:5])
        await b.close()
asyncio.run(main())
