import asyncio, json
from playwright.async_api import async_playwright
ARGS=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=ARGS); pg=await b.new_page(viewport={'width':1280,'height':800})
        errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
        await pg.goto('http://localhost:8000/index.html'); await pg.wait_for_timeout(800)
        await pg.evaluate("localStorage.clear()")
        await pg.click('#btnCareer'); await pg.wait_for_timeout(300)
        await pg.screenshot(path='tools/shot_k1_new.png')
        # pick BJK
        await pg.evaluate("FS.CareerUI.pickClub='BJK'; FS.CareerUI.renderNew()")
        await pg.fill('#crName','Test Hoca'); await pg.click('#btnCrStart'); await pg.wait_for_timeout(300)
        await pg.screenshot(path='tools/shot_k2_main.png')
        print('week1 game', await pg.evaluate("JSON.stringify(FS.Career.userGame())"))
        # simulate 3 weeks quickly via sim mode
        for i in range(3):
            await pg.evaluate("FS.CareerUI.mode='sim'; FS.CareerUI.renderNext()"); await pg.click('#btnCrPlay'); await pg.wait_for_timeout(200)
        print('after 3 sims week', await pg.evaluate("FS.Career.state.week"), 'pos', await pg.evaluate("FS.Career.position('BJK')"))
        await pg.click('#trTabsCr button[data-t=crTabFix]'); await pg.wait_for_timeout(200)
        await pg.screenshot(path='tools/shot_k3_fix.png')
        await pg.click('#trTabsCr button[data-t=crTabTable]'); await pg.wait_for_timeout(200)
        # play week 4 in 3D (watch mode) with fast-forward
        await pg.evaluate("FS.CareerUI.mode='watch'; FS.CareerUI.renderNext()"); await pg.click('#btnCrPlay'); await pg.wait_for_timeout(1500)
        print('careerMatch', await pg.evaluate("JSON.stringify(FS.App.careerMatch)"), 'human', await pg.evaluate("FS.App.settings.humanTeam"))
        print('voice queue', await pg.evaluate("FS.Voice.queue.map(q=>q.keys.join('+')).join(' | ')"))
        await pg.evaluate("""() => { const App=FS.App; App.paused=true; App.engine.stopRenderLoop(); const m=App.match; m.setHalfLength(60); }""")
        # step until fulltime
        res = await pg.evaluate("""() => { const App=FS.App, m=App.match, d=App.director; let n=0; const log=[];
          while (m.state!=='fulltime' && n<60*60*20) { m.update(1/60); d.update(1/60,m,App.ballMesh); App.updateVisuals(1/60); App.updateHUD(1/60); if(FS.Voice.ready){FS.Voice.update(1/60); FS.Voice.flavor(1/60,m);} n++; if (m.state==='halftime' && m.stateT>1) { m.startSecondHalf(); d.onEvent({type:'kickoff'}, m); App.hideOverlay(); } }
          for (const ev of []) {}
          return {state:m.state, n, score:[m.teams[0].score,m.teams[1].score]}; }""")
        print('sim', res)
        await pg.evaluate("FS.App.scene.render()")
        await pg.wait_for_timeout(500)
        await pg.screenshot(path='tools/shot_k4_ft.png')
        print('careerResult', await pg.evaluate("JSON.stringify(FS.App.careerResult)"), 'week', await pg.evaluate("FS.Career.state.week"))
        await pg.click('#btnMenu2'); await pg.wait_for_timeout(300)
        print('career visible', await pg.evaluate("!document.getElementById('career').classList.contains('hidden')"))
        await pg.screenshot(path='tools/shot_k5_back.png')
        # reload → persisted?
        await pg.reload(); await pg.wait_for_timeout(800)
        print('persist week', await pg.evaluate("FS.Career.load() && FS.Career.state.week"))
        print('ERRORS' if errs else 'NO ERRORS', errs[:5])
        await b.close()
asyncio.run(main())
