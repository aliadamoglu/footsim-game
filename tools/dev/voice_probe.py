"""Spiker sağlaması: maç içinde söylenen sprite anahtarlarını kaydeder (yeni kulüplerin isimleri bankalarda mı?).
Kullanım: python3 tools/dev/voice_probe.py HOME AWAY"""
import asyncio, sys
from playwright.async_api import async_playwright
ARGS=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']
H = sys.argv[1] if len(sys.argv) > 1 else 'GOZ'; A = sys.argv[2] if len(sys.argv) > 2 else 'BVB'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={'width':1280,'height':720}); pg = await ctx.new_page()
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        warns=[]; pg.on('console', lambda m: warns.append(m.text) if m.type in ('warning','error') and 'GL' not in m.text and 'WebGL' not in m.text else None)
        await pg.goto('http://localhost:8000/index.html'); await pg.wait_for_timeout(700)
        await pg.evaluate(f"FS.App.settings.home='{H}'; FS.App.settings.away='{A}'; FS.App.renderTeamGrid(); FS.App.updateMenuSummary();")
        await pg.click('#btnStart'); await pg.wait_for_timeout(2500)
        # ses bankalarının (decodeAudioData) inmesini bekle
        for _ in range(40):
            if await pg.evaluate("!!FS.Voice.ready || !!FS.Voice.failed"): break
            await pg.wait_for_timeout(500)
        await pg.evaluate("FS.App.engine.stopRenderLoop(); FS.App.skipScene && FS.App.skipScene();")
        await pg.evaluate("() => { window.__spoken = []; const V = FS.Voice; const orig = V.playNow; V.playNow = function (it) { if (it && it.keys) window.__spoken.push(it.keys.join(' ')); return orig.call(V, it); }; return true; }")
        print('voice state', await pg.evaluate("({ready: FS.Voice.ready, failed: FS.Voice.failed, banks: Object.keys(FS.Voice.banks||{}).length, sprites: Object.keys(FS.Voice.sprites||{}).length})"))
        for i in range(2):
            r = await pg.evaluate("""() => { const A = FS.App; for (let i = 0; i < 60*35; i++) { A.match.update(1/60); A.director.update(1/60, A.match, A.ballMesh); FS.WeatherFX && FS.WeatherFX.update(1/60, A.director.pos); A.updateVisuals(1/60); A.updateHUD(1/60); if (FS.Voice.update) FS.Voice.update(1/60); } A.scene.render(); const m = A.match; return { state: m.state, score: m.teams.map(t => t.score) }; }""")
            print(r)
        spoken = await pg.evaluate("window.__spoken")
        print('spoken lines', len(spoken)); print('\n'.join(spoken[:30]))
        print('ERRS', errs[:5], 'WARN', warns[:5])
        await b.close()
asyncio.run(main())
