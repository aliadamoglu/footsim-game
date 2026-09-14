"""Gole kadar hızlı sar, sonra yönetmen dizisini (sevinç → tekrar → tekrar → geniş) adım adım ilerletip ekran görüntüsü al.
   python3 tools/goalshot.py [maxSimSec]"""
import asyncio, sys, json
from playwright.async_api import async_playwright
maxsim = float(sys.argv[1]) if len(sys.argv) > 1 else 500
async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'])
        page = await browser.new_page(viewport={'width': 1280, 'height': 720})
        errors = []
        page.on('console', lambda m: errors.append(f'[{m.type}] {m.text}') if m.type in ('error',) else None)
        page.on('pageerror', lambda e: errors.append(f'[pageerror] {e}'))
        for attempt in range(4):
          await page.goto('http://localhost:8000/index.html')
          await page.wait_for_timeout(500)
          await page.click('#btnStart')
          await page.wait_for_timeout(3000)
          res = await page.evaluate("""async (maxsim) => {
          const App = FS.App, m = App.match; App.engine.stopRenderLoop();
          let simT = 0, steps = 0, n0 = m.events.length; let goalEv = null;
          while (simT < maxsim && m.state !== 'fulltime') {
            if (m.state === 'halftime') { m.startSecondHalf(); App.director.onEvent({type:'kickoff'}, m); App.hideOverlay(); }
            m.update(1/60); simT += 1/60; steps++;
            if (steps % 30 === 0) { App.updateVisuals(1/60); App.director.update(1/60, m, App.ballMesh); }
            if (steps % 600 === 0) await new Promise(r => setTimeout(r, 0));
            for (let k = n0; k < m.events.length; k++) if (m.events[k].type === 'goal') { goalEv = m.events[k]; break; }
            if (goalEv) break;
            n0 = m.events.length;
          }
          window.__goal = goalEv; window.__simT = simT;
          return goalEv ? { minute: goalEv.minute, scorer: goalEv.scorer.name, score: goalEv.score, x: goalEv.x, z: goalEv.z, state: m.state, shot: App.director.shot && App.director.shot.kind, queue: App.director.queue.map(q => q.kind), replayBuf: m.replayBuffer.length } : { nogoal: true, simT };
        }""", maxsim)
          print(json.dumps(res, ensure_ascii=False))
          if 'nogoal' not in res: break
        if 'nogoal' in res:
            await browser.close(); return
        # adım adım ilerlet ve belirli anlarda görüntü al
        checkpoints = [(1.2, 'celebrate'), (3.6, 'replay1a'), (6.0, 'replay1b'), (9.5, 'replay2'), (13.4, 'wide'), (17.0, 'after')]
        t = 0.0
        for (ct, name) in checkpoints:
            info = await page.evaluate("""async ([t, ct]) => {
              const App = FS.App, m = App.match; const dt = 1/30;
              while (t < ct) { m.update(dt); App.updateVisuals(dt); App.director.update(dt, m, App.ballMesh); App.updateHUD(dt); t += dt; }
              App.scene.render();
              const d = App.director;
              return { t: +t.toFixed(2), state: m.state, shot: d.shot && d.shot.kind, angle: d.replay && d.replay.angle, replay: !!d.replayFrame, cam: d.cam.position.asArray().map(v => +v.toFixed(1)), fov: +d.cam.fov.toFixed(2), tag: document.getElementById('replayTag') && getComputedStyle(document.getElementById('replayTag')).display };
            }""", [t, ct])
            t = ct
            print(name, json.dumps(info))
            await page.screenshot(path=f'/home/user/futbol-sim/tools/shot_goal_{name}.png')
        print('\n'.join(errors[:20]) or 'no console errors')
        await browser.close()
asyncio.run(main())
