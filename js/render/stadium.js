/* Stadyum ve saha oluşturma (Babylon.js) — prosedürel, dış kaynak yok */
(function (root) {
  const FS = (root.FS = root.FS || {});
  const P = FS.PITCH;

  FS.buildStadium = function (scene, opts) {
    const o = Object.assign({ homeColor: '#cc2222', awayColor: '#2244cc' }, opts || {});
    const nodes = {};
    const root_ = new BABYLON.TransformNode('stadium', scene);

    /* ---------- Saha dokusu (çizgiler + çim şeritleri) ---------- */
    const texW = 2048, texH = 1376;
    const dt = new BABYLON.DynamicTexture('pitchTex', { width: texW, height: texH }, scene, true);
    dt.anisotropicFilteringLevel = 16;
    const ctx = dt.getContext();
    const totalL = P.length + 2 * P.margin, totalW = P.width + 2 * P.margin;
    const sx = texW / totalL, sz = texH / totalW; // piksel/metre
    const X = (x) => (x + totalL / 2) * sx, Z = (z) => (z + totalW / 2) * sz;
    // çim tabanı
    ctx.fillStyle = '#2f7d32'; ctx.fillRect(0, 0, texW, texH);
    // biçme şeritleri (uzun eksene dik 14 şerit)
    const stripes = 14, sw = P.length / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#3a9a3f' : '#328a37';
      ctx.fillRect(X(-P.halfL + i * sw), Z(-P.halfW - 1.5), sw * sx + 1, (P.width + 3) * sz);
    }
    // kenar kuşak biraz daha koyu
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(0, 0, texW, Z(-P.halfW - 1.5)); ctx.fillRect(0, Z(P.halfW + 1.5), texW, texH);
    ctx.fillRect(0, 0, X(-P.halfL - 1.5), texH); ctx.fillRect(X(P.halfL + 1.5), 0, texW, texH);
    // çim gürültüsü
    for (let i = 0; i < 26000; i++) {
      const x = Math.random() * texW, y = Math.random() * texH;
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(x, y, 2, 2);
    }
    // çizgiler
    ctx.strokeStyle = '#f4f4f4'; ctx.fillStyle = '#f4f4f4';
    ctx.lineWidth = 0.12 * sx; ctx.lineCap = 'butt';
    const line = (x1, z1, x2, z2) => { ctx.beginPath(); ctx.moveTo(X(x1), Z(z1)); ctx.lineTo(X(x2), Z(z2)); ctx.stroke(); };
    const rect = (x1, z1, x2, z2) => { ctx.strokeRect(X(x1), Z(z1), (x2 - x1) * sx, (z2 - z1) * sz); };
    rect(-P.halfL, -P.halfW, P.halfL, P.halfW);
    line(0, -P.halfW, 0, P.halfW);
    ctx.beginPath(); ctx.ellipse(X(0), Z(0), P.centerRadius * sx, P.centerRadius * sz, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(X(0), Z(0), 0.2 * sx, 0.2 * sz, 0, 0, Math.PI * 2); ctx.fill();
    for (const d of [1, -1]) {
      const gx = P.halfL * d;
      rect(Math.min(gx, gx - d * P.penAreaDepth), -P.penAreaHalfW, Math.max(gx, gx - d * P.penAreaDepth), P.penAreaHalfW);
      rect(Math.min(gx, gx - d * P.goalAreaDepth), -P.goalAreaHalfW, Math.max(gx, gx - d * P.goalAreaDepth), P.goalAreaHalfW);
      const ps = gx - d * P.penSpotDist;
      ctx.beginPath(); ctx.ellipse(X(ps), Z(0), 0.2 * sx, 0.2 * sz, 0, 0, Math.PI * 2); ctx.fill();
      // ceza yayı: penaltı noktasından 9.15 m, ceza sahası dışında kalan kısım
      const a0 = Math.acos(5.5 / 9.15);
      ctx.beginPath();
      if (d > 0) ctx.ellipse(X(ps), Z(0), 9.15 * sx, 9.15 * sz, 0, Math.PI - a0, Math.PI + a0);
      else ctx.ellipse(X(ps), Z(0), 9.15 * sx, 9.15 * sz, 0, -a0, a0);
      ctx.stroke();
      // köşe yayları
      for (const s of [1, -1]) {
        ctx.beginPath();
        const cx = X(gx), cz = Z(P.halfW * s);
        const start = d > 0 ? (s > 0 ? Math.PI : Math.PI / 2) : (s > 0 ? 1.5 * Math.PI : 0);
        ctx.ellipse(cx, cz, 1 * sx, 1 * sz, 0, start, start + Math.PI / 2); ctx.stroke();
      }
      // kale arkası çizgi (kale ağzı)
      line(gx, -P.goalWidth / 2, gx, P.goalWidth / 2);
    }
    dt.update();
    const pitchMat = new BABYLON.StandardMaterial('pitchMat', scene);
    pitchMat.diffuseTexture = dt; pitchMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    const pitch = BABYLON.MeshBuilder.CreateGround('pitch', { width: totalL, height: totalW, subdivisions: 2 }, scene);
    pitch.material = pitchMat; pitch.receiveShadows = true; pitch.parent = root_;
    // UV: ground'ta u = x ekseni, v = z ekseni (Babylon: height = z, ve v ters). Dokumuzda Z(z) yukarıdan aşağı → ground'un -z tarafı v=0 mı? Test: ground v=0 at z=-height/2.
    // Babylon CreateGround: (row 0) z = -height/2 → v = 1 - 0 = 1? Kontrol için doku dikey simetrik (çizgiler simetrik), X ekseni simetrik. Tek asimetri yok, sorun olmaz.
    nodes.pitch = pitch;

    /* ---------- Kaleler ---------- */
    const postMat = new BABYLON.StandardMaterial('postMat', scene);
    postMat.diffuseColor = new BABYLON.Color3(0.95, 0.95, 0.95); postMat.specularColor = new BABYLON.Color3(0.4, 0.4, 0.4);
    const netMat = new BABYLON.StandardMaterial('netMat', scene);
    netMat.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.9); netMat.emissiveColor = new BABYLON.Color3(0.25, 0.25, 0.25); netMat.alpha = 0.22; netMat.backFaceCulling = false; netMat.wireframe = true;
    for (const d of [1, -1]) {
      const g = new BABYLON.TransformNode('goal' + d, scene); g.parent = root_;
      const gx = P.halfL * d, hw = P.goalWidth / 2, h = P.goalHeight, dep = P.goalDepth;
      const pr = P.postRadius * 2;
      for (const s of [1, -1]) {
        const post = BABYLON.MeshBuilder.CreateCylinder('post', { height: h, diameter: pr }, scene);
        post.position.set(gx, h / 2, hw * s); post.material = postMat; post.parent = g;
        // arka destek
        const back = BABYLON.MeshBuilder.CreateCylinder('back', { height: dep, diameter: pr * 0.6 }, scene);
        back.rotation.x = Math.PI / 2; back.position.set(gx + d * dep / 2, 0.06, hw * s); back.material = postMat; back.parent = g;
        const diag = BABYLON.MeshBuilder.CreateCylinder('diag', { height: Math.sqrt(dep * dep + h * h), diameter: pr * 0.6 }, scene);
        diag.position.set(gx + d * dep / 2, h / 2, hw * s); diag.rotation.z = d * Math.atan2(dep, h); diag.material = postMat; diag.parent = g;
      }
      const bar = BABYLON.MeshBuilder.CreateCylinder('bar', { height: P.goalWidth + pr, diameter: pr }, scene);
      bar.rotation.x = Math.PI / 2; bar.position.set(gx, h, 0); bar.material = postMat; bar.parent = g;
      const backBar = BABYLON.MeshBuilder.CreateCylinder('bbar', { height: P.goalWidth + pr, diameter: pr * 0.6 }, scene);
      backBar.rotation.x = Math.PI / 2; backBar.position.set(gx + d * dep, 0.06, 0); backBar.material = postMat; backBar.parent = g;
      // ağ: arka, yan, üst (ızgaralı düzlemler)
      const net = (w, hh, px, py, pz, rx, ry) => {
        const m = BABYLON.MeshBuilder.CreateGround('net', { width: w, height: hh, subdivisions: Math.round(Math.max(w, hh) * 3) }, scene);
        m.rotation.x = rx; m.rotation.y = ry; m.position.set(px, py, pz); m.material = netMat; m.parent = g; m.isPickable = false; return m;
      };
      net(P.goalWidth, h, gx + d * dep, h / 2, 0, Math.PI / 2, Math.PI / 2); // arka
      net(dep, h, gx + d * dep / 2, h / 2, hw, Math.PI / 2, 0); net(dep, h, gx + d * dep / 2, h / 2, -hw, Math.PI / 2, 0); // yan
      const top = net(P.goalWidth, dep, gx + d * dep / 2, h, 0, 0, Math.PI / 2); // üst (eğimli)
      top.rotation.z = 0;
      nodes['goal' + d] = g;
    }

    /* ---------- Reklam panoları ---------- */
    const boardTex = new BABYLON.DynamicTexture('boards', { width: 2048, height: 128 }, scene, true);
    const bctx = boardTex.getContext();
    const ads = [['#0a58ca', '#ffffff', 'FOOTSIM'], ['#111111', '#f5d547', 'ARENA'], ['#c8102e', '#ffffff', 'BABYLON.JS'], ['#1a7f37', '#ffffff', 'SİMÜLASYON'], ['#ff7a00', '#111111', '2026-27 SEZONU'], ['#6cabdd', '#111111', 'CANLI YAYIN']];
    const aw = 2048 / ads.length;
    ads.forEach((a, i) => { bctx.fillStyle = a[0]; bctx.fillRect(i * aw, 0, aw, 128); bctx.fillStyle = a[1]; bctx.font = 'bold 56px Arial'; bctx.textAlign = 'center'; bctx.textBaseline = 'middle'; bctx.fillText(a[2], i * aw + aw / 2, 64); });
    boardTex.update();
    const boardMat = new BABYLON.StandardMaterial('boardMat', scene);
    boardMat.diffuseTexture = boardTex; boardMat.emissiveColor = new BABYLON.Color3(0.35, 0.35, 0.35); boardMat.backFaceCulling = true;
    const bh = 1.0;
    // Plane'in ön yüzü -z'ye bakar (normal 0,0,-1). Kameraya/sahaya dönük olması için: sahanın -z kenarındaki pano +z'ye (sahaya) bakmalı → ry = PI
    const mkBoard = (len, px, pz, ry) => {
      // İki yüz: biri sahaya, biri dışarıya bakar (ikisinde de yazı düzgün okunur)
      const grp = new BABYLON.TransformNode('boardGrp', scene); grp.position.set(px, bh / 2, pz); grp.rotation.y = ry; grp.parent = root_;
      for (const side of [1, -1]) {
        const b = BABYLON.MeshBuilder.CreatePlane('board', { width: len, height: bh }, scene);
        b.position.z = side * 0.06; b.rotation.y = side > 0 ? Math.PI : 0; b.material = boardMat; b.parent = grp;
      }
      return grp;
    };
    const bm = P.margin - 0.6;
    mkBoard(P.length + 2 * bm, 0, -(P.halfW + bm), Math.PI);      // -z kenarı → +z'ye bak
    mkBoard(P.length + 2 * bm, 0, P.halfW + bm, 0);               // +z kenarı → -z'ye bak
    mkBoard(P.width + 2 * bm, -(P.halfL + bm), 0, -Math.PI / 2);  // -x kenarı → +x'e bak
    mkBoard(P.width + 2 * bm, P.halfL + bm, 0, Math.PI / 2);      // +x kenarı → -x'e bak

    /* ---------- Tribünler ---------- */
    const standMat = new BABYLON.StandardMaterial('standMat', scene);
    standMat.diffuseColor = new BABYLON.Color3(0.32, 0.33, 0.36); standMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    // kalabalık dokusu
    const crowdTex = new BABYLON.DynamicTexture('crowd', { width: 1024, height: 256 }, scene, false);
    const cctx = crowdTex.getContext();
    const mkCrowd = (baseHex) => {
      cctx.fillStyle = '#2a2b2e'; cctx.fillRect(0, 0, 1024, 256);
      const pal = [baseHex, baseHex, baseHex, '#e8e8e8', '#222', '#ccc', '#4a3b2a', '#f2d2b6', '#7a1f1f', '#20406a'];
      for (let i = 0; i < 9000; i++) {
        const x = Math.random() * 1024, y = Math.random() * 256;
        cctx.fillStyle = pal[Math.floor(Math.random() * pal.length)];
        cctx.fillRect(x, y, 5, 7);
        cctx.fillStyle = '#f0c8a8'; cctx.fillRect(x + 1, y - 3, 3, 3);
      }
      crowdTex.update();
    };
    mkCrowd(o.homeColor);
    const crowdMat = new BABYLON.StandardMaterial('crowdMat', scene);
    crowdMat.diffuseTexture = crowdTex; crowdMat.emissiveColor = new BABYLON.Color3(0.12, 0.12, 0.12); crowdMat.specularColor = BABYLON.Color3.Black(); crowdMat.backFaceCulling = false;
    const standRoot = new BABYLON.TransformNode('stands', scene); standRoot.parent = root_;
    // Tribün: kesiti (yatay mesafe d, yükseklik y) olan bir şerit; ana kamera -z tarafında 23 m yükseklikte, 34 m dışarıda.
    // Tribün başlangıcı saha kenarından 8 m sonra; ilk kat 26 m derin ve 13 m yüksek → kamera (y=23, d=34) kesitin ÜSTÜNDE kalır (o noktada tribün yüksekliği 13 m).
    const tiers = [{ start: 8, depth: 26, height: 12 }, { start: 38, depth: 24, height: 14, base: 15 }];
    const sides = [
      { len: P.length + 20, cx: 0, cz: 0, axis: 'z', dir: -1, edge: P.halfW },
      { len: P.length + 20, cx: 0, cz: 0, axis: 'z', dir: 1, edge: P.halfW },
      { len: P.width + 20, cx: 0, cz: 0, axis: 'x', dir: -1, edge: P.halfL },
      { len: P.width + 20, cx: 0, cz: 0, axis: 'x', dir: 1, edge: P.halfL },
    ];
    for (const s of sides) {
      let topY = 0;
      for (const t of tiers) {
        const base = t.base || 0.5;
        const d0 = s.edge + t.start, d1 = d0 + t.depth;
        const y0 = base, y1 = base + t.height;
        // Eğik yüzey: 4 köşe ile özel mesh (ribbon)
        const A = (d, y) => (s.axis === 'z' ? new BABYLON.Vector3(-s.len / 2, y, s.dir * d) : new BABYLON.Vector3(s.dir * d, y, -s.len / 2));
        const B = (d, y) => (s.axis === 'z' ? new BABYLON.Vector3(s.len / 2, y, s.dir * d) : new BABYLON.Vector3(s.dir * d, y, s.len / 2));
        const ribbon = BABYLON.MeshBuilder.CreateRibbon('tier', { pathArray: [[A(d0, y0), B(d0, y0)], [A(d1, y1), B(d1, y1)]], sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
        ribbon.material = crowdMat; ribbon.parent = standRoot;
        // ön duvar (alt kat)
        const wall = BABYLON.MeshBuilder.CreateBox('tierBlock', { width: s.axis === 'z' ? s.len : 0.6, height: y0 + 0.4, depth: s.axis === 'z' ? 0.6 : s.len }, scene);
        if (s.axis === 'z') wall.position.set(0, (y0 + 0.4) / 2, s.dir * d0); else wall.position.set(s.dir * d0, (y0 + 0.4) / 2, 0);
        wall.material = standMat; wall.parent = standRoot;
        // arka/alt gövde
        const body = BABYLON.MeshBuilder.CreateBox('tierBlock', { width: s.axis === 'z' ? s.len : 2, height: y1, depth: s.axis === 'z' ? 2 : s.len }, scene);
        if (s.axis === 'z') body.position.set(0, y1 / 2, s.dir * (d1 + 1)); else body.position.set(s.dir * (d1 + 1), y1 / 2, 0);
        body.material = standMat; body.parent = standRoot;
        topY = y1;
      }
      // çatı: üst tribünün üstünde, dışarıya doğru
      const roofD0 = s.edge + 30, roofD1 = s.edge + 66;
      const roof = BABYLON.MeshBuilder.CreateBox('roof', { width: s.axis === 'z' ? s.len + 4 : roofD1 - roofD0, height: 0.5, depth: s.axis === 'z' ? roofD1 - roofD0 : s.len + 4 }, scene);
      if (s.axis === 'z') roof.position.set(0, topY + 9, s.dir * (roofD0 + roofD1) / 2); else roof.position.set(s.dir * (roofD0 + roofD1) / 2, topY + 9, 0);
      roof.material = standMat; roof.parent = standRoot;
    }
    // Işık kuleleri (görsel)
    const lightMat = new BABYLON.StandardMaterial('lm', scene); lightMat.emissiveColor = new BABYLON.Color3(1, 1, 0.92); lightMat.disableLighting = true;
    for (const cx of [-1, 1]) for (const cz of [-1, 1]) {
      const pole = BABYLON.MeshBuilder.CreateCylinder('pole', { height: 46, diameter: 1.2 }, scene);
      pole.position.set(cx * (P.halfL + 62), 23, cz * (P.halfW + 62)); pole.material = standMat; pole.parent = root_;
      const head = BABYLON.MeshBuilder.CreateBox('head', { width: 9, height: 5, depth: 1 }, scene);
      head.position.set(cx * (P.halfL + 62), 48, cz * (P.halfW + 62)); head.lookAt(new BABYLON.Vector3(0, 0, 0)); head.material = lightMat; head.parent = root_;
    }
    // zemin (dış)
    const groundOuter = BABYLON.MeshBuilder.CreateGround('outer', { width: 600, height: 600 }, scene);
    groundOuter.position.y = -0.05; const gm = new BABYLON.StandardMaterial('gm', scene); gm.diffuseColor = new BABYLON.Color3(0.16, 0.17, 0.19); gm.specularColor = BABYLON.Color3.Black(); groundOuter.material = gm; groundOuter.parent = root_;

    /* ---------- Köşe bayrakları ---------- */
    const flagMat = new BABYLON.StandardMaterial('flag', scene); flagMat.diffuseColor = new BABYLON.Color3(1, 0.85, 0.1); flagMat.backFaceCulling = false;
    for (const cx of [-1, 1]) for (const cz of [-1, 1]) {
      const pole = BABYLON.MeshBuilder.CreateCylinder('fp', { height: 1.5, diameter: 0.05 }, scene);
      pole.position.set(cx * P.halfL, 0.75, cz * P.halfW); pole.material = postMat; pole.parent = root_;
      const flag = BABYLON.MeshBuilder.CreatePlane('fl', { width: 0.4, height: 0.3 }, scene);
      flag.position.set(cx * P.halfL - cx * 0.2, 1.35, cz * P.halfW); flag.material = flagMat; flag.parent = root_;
    }

    /* ---------- Yedek kulübeleri (alçak, şeffaf; panoların önünde kameraya engel olmasın) ---------- */
    const benchMat = new BABYLON.StandardMaterial('bench', scene); benchMat.diffuseColor = new BABYLON.Color3(0.08, 0.09, 0.11); benchMat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
    const benchGlass = new BABYLON.StandardMaterial('benchGlass', scene); benchGlass.diffuseColor = new BABYLON.Color3(0.6, 0.7, 0.8); benchGlass.alpha = 0.22; benchGlass.backFaceCulling = false;
    for (const sx_ of [-1, 1]) {
      const bz = -(P.halfW + P.margin - 1.2);
      const seat = BABYLON.MeshBuilder.CreateBox('dugoutSeat', { width: 9, height: 0.45, depth: 0.9 }, scene);
      seat.position.set(sx_ * 12, 0.225, bz); seat.material = benchMat; seat.parent = root_;
      const back = BABYLON.MeshBuilder.CreateBox('dugoutBack', { width: 9.4, height: 1.6, depth: 0.08 }, scene);
      back.position.set(sx_ * 12, 0.8, bz - 0.55); back.material = benchGlass; back.parent = root_;
      const roof = BABYLON.MeshBuilder.CreateBox('dugoutRoof', { width: 9.4, height: 0.06, depth: 1.6 }, scene);
      roof.position.set(sx_ * 12, 1.62, bz + 0.2); roof.material = benchGlass; roof.parent = root_;
    }
    /* ---------- Tünel ağzı (ana tribün, orta çizgi hizası): panoda açıklık + karanlık koridor ---------- */
    {
      const tz = -(P.halfW + P.margin - 0.6);
      const dark = new BABYLON.StandardMaterial('tunnelDark', scene); dark.diffuseColor = new BABYLON.Color3(0.03, 0.03, 0.04); dark.specularColor = BABYLON.Color3.Black(); dark.backFaceCulling = false;
      const frameMat = new BABYLON.StandardMaterial('tunnelFrame', scene); frameMat.diffuseColor = new BABYLON.Color3(0.55, 0.57, 0.6); frameMat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);
      // koridor: 3.2 m geniş, 2.6 m yüksek, 9 m derin (panonun arkasına, tribün altına)
      const W = 3.4, H = 2.7, D = 2.6; // kısa koridor: tribün kesitine (z≈-42) girmez, arkası karanlık
      const floor = BABYLON.MeshBuilder.CreateGround('tunnelFloor', { width: W, height: D }, scene); floor.position.set(0, 0.01, tz - D / 2 + 0.3); floor.material = dark; floor.parent = root_;
      const back = BABYLON.MeshBuilder.CreateBox('tunnelBack', { width: W, height: H, depth: 0.1 }, scene); back.position.set(0, H / 2, tz - D + 0.3); back.material = dark; back.parent = root_;
      for (const sx of [-1, 1]) { const wall = BABYLON.MeshBuilder.CreateBox('tunnelWall', { width: 0.25, height: H, depth: D }, scene); wall.position.set(sx * (W / 2 + 0.12), H / 2, tz - D / 2 + 0.3); wall.material = frameMat; wall.parent = root_; }
      const top = BABYLON.MeshBuilder.CreateBox('tunnelTop', { width: W + 0.5, height: 0.3, depth: D }, scene); top.position.set(0, H + 0.15, tz - D / 2 + 0.3); top.material = frameMat; top.parent = root_;
      // pano önünde açıklık hissi: panonun tünel kısmını karartan panel
      const cover = BABYLON.MeshBuilder.CreateBox('tunnelCover', { width: W + 0.5, height: 1.2, depth: 0.2 }, scene); cover.position.set(0, 0.6, tz + 0.02); cover.material = dark; cover.parent = root_;
      // "TÜNEL" tabelası
      const signTex = new BABYLON.DynamicTexture('tunnelSign', { width: 512, height: 96 }, scene, true); const sc = signTex.getContext();
      sc.fillStyle = '#10131c'; sc.fillRect(0, 0, 512, 96); sc.fillStyle = '#ffd400'; sc.font = 'bold 52px Arial'; sc.textAlign = 'center'; sc.textBaseline = 'middle'; sc.fillText('OYUNCU TÜNELİ', 256, 50); signTex.update();
      const signMat = new BABYLON.StandardMaterial('tunnelSignMat', scene); signMat.diffuseTexture = signTex; signMat.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0.5); signMat.backFaceCulling = false;
      const sign = BABYLON.MeshBuilder.CreatePlane('tunnelSignP', { width: W + 0.4, height: 0.7 }, scene); sign.position.set(0, H + 0.7, tz + 0.15); sign.rotation.y = Math.PI; sign.material = signMat; sign.parent = root_;
      nodes.tunnel = { x: 0, z: tz, depth: D };
    }
    nodes.root = root_;
    return nodes;
  };
})(typeof window !== 'undefined' ? window : globalThis);
