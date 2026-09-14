"""Tam maç taraması (tarayıcı): mod watch|control, hata/istisna sayımı, kamera modu ve HUD çakışma özetleri.
Kullanım: [MOBILE=1 W=.. H=..] python3 tools/dev/fullmatch.py control"""
import asyncio, sys, os, json
from playwright.async_api import async_playwright
ARGS=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']
W=int(os.environ.get('W','1280')); H=int(os.environ.get('H','720')); MOBILE=os.environ.get('MOBILE')=='1'
MODE=sys.argv[1] if len(sys.argv)>1 else 'watch'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        kw = dict(viewport={'width':W,'height':H})
        if MOBILE: kw.update(has_touch=True, is_mobile=True, device_scale_factor=2)
        ctx = await b.new_context(**kw); pg = await ctx.new_page()
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('C:'+m.text[:200]) if m.type=='error' and 'GL_' not in m.text and 'WebGL' not in m.text and 'swiftshader' not in m.text.lower() else None)
        await pg.goto('http://localhost:8000/index.html'); await pg.wait_for_timeout(800)
        if MODE=='control': await pg.click('#modeSeg label:nth-child(2)')
        await pg.click('input[name=wx][value=clear]', force=True)
        await pg.click('#btnStart'); await pg.wait_for_timeout(1500)
        # 1.5 dk yarılar için oyun içi süre kısaltma
        res = await pg.evaluate('''async () => {
          const A = FS.App; A.engine.stopRenderLoop(); A.skipScene(); const m = A.match; const d = A.director; const H = FS.Human;
          m.setHalfLength(90);
          const step = () => { m.update(1/60); d.update(1/60, m, A.ballMesh); FS.WeatherFX.update(1/60, d.pos); A.updateVisuals(1/60); A.updateHUD(1/60); };
          const st = { frames: 0, states: {}, camModes: {}, holdInconsistent: 0, sinkFrames: 0, minBodyY: 9, worstOverlap: 9, renders: 0 };
          let keyT = 0, keyDir = 0, guard = 0;
          while (m.state !== 'fulltime' && guard++ < 60 * 60 * 9) {
            if (m.state === 'halftime') { m.startSecondHalf(); d.onEvent({ type: 'kickoff' }, m); }
            if (H.active) { keyT -= 1/60; if (keyT <= 0) { keyT = 1 + Math.random() * 2; keyDir = Math.floor(Math.random() * 6); } H.keys = {}; if (keyDir === 0) H.keys.ArrowUp = true; else if (keyDir === 1) H.keys.ArrowLeft = true; else if (keyDir === 2) H.keys.ArrowRight = true; else if (keyDir === 3) { H.keys.ArrowUp = true; H.keys.ShiftLeft = true; } if (Math.random() < 0.02 && H.player && H.player.hasBall) H.pendingAction = { act: Math.random() < 0.5 ? 'pass' : 'shoot', power: 0.6 }; }
            step(); st.frames++;
            st.states[m.state] = (st.states[m.state] || 0) + 1;
            const cm = d.userMode === 'auto' ? d.autoMode(m) : d.userMode; st.camModes[cm] = (st.camModes[cm] || 0) + 1;
            for (const t of [0, 1]) { const g = m.gkOf(t); if (g.holding && m.ball.owner !== g) st.holdInconsistent++; }
            if (st.frames % 30 === 0) {
              A.scene.render(); st.renders++;
              for (const p of m.allOnPitch()) { const v = p.view; if (!v) continue; if (v.body.position.y < st.minBodyY) st.minBodyY = v.body.position.y; if (v.body.position.y < -0.05) st.sinkFrames++; }
              const list = m.allOnPitch(); for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const a = list[i], b = list[j]; const aD = a.fallT > 0 || a.tackleT > 0 || a.diveT > 0, bD = b.fallT > 0 || b.tackleT > 0 || b.diveT > 0; if (!aD && !bD) { const dd = FS.M.distP(a, b); if (dd < st.worstOverlap) st.worstOverlap = dd; } }
            }
          }
          return { ...st, score: [m.teams[0].score, m.teams[1].score], shots: [m.teams[0].stats.shots, m.teams[1].stats.shots], state: m.state, minBodyY: +st.minBodyY.toFixed(3), worstOverlap: +st.worstOverlap.toFixed(2) };
        }''')
        print(json.dumps(res))
        print('ERRS', len(errs), errs[:6]); await b.close()
asyncio.run(main())
