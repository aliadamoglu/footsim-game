"""Taktik paneli + TV grafikleri + özet testi (Playwright). Kullanım: python3 tools/dev/tactics_shot.py /tmp/shots/tac"""
import sys, time
from playwright.sync_api import sync_playwright
out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots/tac'
ARGS = ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
errors = []
with sync_playwright() as p:
    br = p.chromium.launch(args=ARGS)
    pg = br.new_page(viewport={'width': 1280, 'height': 720})
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append('console:' + m.text) if m.type == 'error' and not any(k in m.text for k in ['GL_', 'swiftshader', 'WebGL', 'Automatic fallback', 'favicon', '404']) else None)
    pg.goto('http://localhost:8000/index.html'); pg.wait_for_timeout(1200)
    pg.evaluate("() => { FS.App.settings.home='GS'; FS.App.settings.away='RMA'; FS.App.settings.humanTeam=0; document.querySelector('input[name=mode][value=home]').checked = true; FS.App.renderTeamGrid(); FS.App.updateMenuSummary(); }")
    pg.click('#btnStart'); pg.wait_for_timeout(2500)
    pg.evaluate("() => { FS.App.engine.stopRenderLoop(); }")
    step = """(n) => { const A = FS.App; for (let i = 0; i < n; i++) { A.match.update(1/60); A.director.update(1/60, A.match, A.ballMesh); if (FS.WeatherFX && FS.WeatherFX.active) FS.WeatherFX.update(1/60, A.director.pos); A.updateVisuals(1/60); A.updateHUD(1/60); } A.scene.render(); return A.match.state; }"""
    # 1) lineup intro: run into 'line' phase
    st = pg.evaluate(step, 60 * 12)
    li = pg.evaluate("() => ({ st: FS.App.match.state, ph: FS.App.match.lineupPhase, vis: !document.getElementById('lineupIntro').classList.contains('hidden') })")
    print('lineup', li)
    # force lineup intro event display if phase reached
    if not li['vis']:
        pg.evaluate("() => FS.App.showLineupIntro(0)")
        pg.evaluate("() => FS.App.scene.render()")
    pg.screenshot(path=out + '_lineup.png')
    # 2) skip to play, open tactics panel
    pg.evaluate("() => { FS.App.skipScene(); }")
    pg.evaluate(step, 60 * 3)
    pg.keyboard.press('KeyG'); pg.wait_for_timeout(200)
    pg.evaluate("() => FS.App.scene.render()")
    info = pg.evaluate("() => ({ open: FS.TacticsUI.open, hidden: document.getElementById('tacPanel').classList.contains('hidden'), forms: document.querySelectorAll('#tacBody [data-form]').length, sliders: document.querySelectorAll('#tacBody input[type=range]').length, w: document.getElementById('tacPanel').getBoundingClientRect().width })")
    print('tactics panel', info)
    pg.screenshot(path=out + '_panel.png')
    # click 4-4-2 + preset allOut
    pg.click('#tacBody [data-form="4-4-2"]'); pg.click('#tacBody [data-preset="allOut"]')
    pg.click('#tacBody [data-instr="cutInside"]')
    r = pg.evaluate("() => { const t = FS.App.match.teams[0]; return { formation: t.formation, preset: t.tactics.preset, men: t.mentality, roles: FS.App.match.playersOnPitch(0).map(p => p.role).join(' '), instr: t.tactics.instr }; }")
    print('after click', r)
    pg.evaluate(step, 60 * 2)
    pg.screenshot(path=out + '_panel2.png')
    pg.keyboard.press('KeyG')
    # 3) lower third
    pg.evaluate("() => FS.App.showLowerThird('stats', 'İLK YARI', 8000)")
    pg.evaluate(step, 30)
    lt = pg.evaluate("() => { const el = document.getElementById('lowerThird'); const r = el.getBoundingClientRect(); return { show: el.classList.contains('show'), x: r.x, y: r.y, w: r.width, h: r.height, barTop: document.getElementById('bar').getBoundingClientRect().top }; }")
    print('lower third', lt)
    pg.screenshot(path=out + '_lt.png')
    # 4) force a goal: wait for play state, then shoot from close range
    for _ in range(12):
        if pg.evaluate("() => FS.App.match.state") == 'play': break
        pg.evaluate(step, 60)
    print('state before goal', pg.evaluate("() => FS.App.match.state"))
    pg.evaluate("""() => { const m = FS.App.match; const dir = m.dirOf(0); const st = m.playersOnPitch(0).find(p => p.role === 'ST') || m.playersOnPitch(0)[5];
      const b = m.ball; st.x = dir * 44; st.z = 2; for (const q of m.playersOnPitch(1)) if (q.role === 'GK') { q.x = dir * 45; q.z = -20; } b.x = st.x + dir * 0.5; b.z = st.z; b.y = 0.11; FS.Actions.takeControl(st, b); FS.Actions.shoot(st, b, { x: dir * 52.5, z: 1.0, y: 0.8 }, 0.9, {}); m.onShot(st, { q: 0.4 }); }""")
    st = pg.evaluate(step, 60 * 4)
    g = pg.evaluate("() => ({ st: FS.App.match.state, score: [FS.App.match.teams[0].score, FS.App.match.teams[1].score], hl: (FS.App.match.highlights || []).length, styles: FS.App.match.playersOnPitch(0).map(p => p.celStyle).join(',') })")
    print('goal', g)
    pg.screenshot(path=out + '_goal.png')
    st = pg.evaluate(step, 60 * 3)
    pg.screenshot(path=out + '_goal2.png')
    # 5) fulltime highlights: jump clock to end
    pg.evaluate("() => { FS.App.skipScene(); const m = FS.App.match; m.half = 2; m.clock = 90 * 60 + 200; m.announcedAdded = 1; }")
    st = pg.evaluate(step, 60 * 6)
    ft = pg.evaluate("() => ({ st: FS.App.match.state, ov: !document.getElementById('overlay').classList.contains('hidden'), hlBtn: document.getElementById('btnHighlights').style.display })")
    print('fulltime', ft)
    pg.wait_for_timeout(2600)
    st = pg.evaluate(step, 60 * 2)
    pg.evaluate("() => FS.App.scene.render()")
    hl = pg.evaluate("() => ({ replay: !!FS.App.director.replay, tag: document.getElementById('hlTag').classList.contains('show'), info: document.getElementById('hlInfo').textContent, ov: !document.getElementById('overlay').classList.contains('hidden'), skip: document.getElementById('btnSkip').classList.contains('show') })")
    print('highlights', hl)
    pg.screenshot(path=out + '_hl.png')
    st = pg.evaluate(step, 60 * 14)
    hl2 = pg.evaluate("() => ({ replay: !!FS.App.director.replay, shot: FS.App.director.shot && FS.App.director.shot.kind, ov: !document.getElementById('overlay').classList.contains('hidden'), watch: FS.App._hlWatch })")
    print('after reel', hl2)
    pg.screenshot(path=out + '_end.png')
    br.close()
print('errors:', errors[:10])
