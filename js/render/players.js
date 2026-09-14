/* Prosedürel oyuncu modelleri: gövde parçaları + basit prosedürel animasyon (koşu, vuruş, kayma, düşme, dalış)
   Forma dokuları DynamicTexture ile çizilir (düz / çubuklu / yarım / sash + numara). */
(function (root) {
  const FS = (root.FS = root.FS || {});
  const M = FS.M;

  const SKIN_TONES = ['#f1c9a5', '#e0ac7e', '#c68642', '#8d5524', '#5c3a1e', '#f5d5b8', '#a86b3c'];
  const HAIR = ['#111111', '#2b1a10', '#4a2c17', '#8a6a3a', '#d9c07a', '#222222'];

  FS.makeKitTexture = function (scene, kit, number, isGK) {
    const W = 512, H = 512;
    const dt = new BABYLON.DynamicTexture('kit' + number + (isGK ? 'gk' : ''), { width: W, height: H }, scene, true);
    const ctx = dt.getContext();
    const c1 = kit.c1, c2 = kit.c2 || kit.c1;
    ctx.fillStyle = c1; ctx.fillRect(0, 0, W, H);
    // Silindir UV'si: u=0 açı 0 (+x), u artarken -z yönüne... ön yüz u≈0.75 (açı 90°, +z) — biz modeli döndürerek +z'yi ön alacağız.
    // Desenler yatay eksen boyunca (u) uygulanır; gövde silindirin 4 tarafını da kaplar.
    if (kit.pattern === 'stripes') {
      const n = 10; const sw = W / n;
      for (let i = 0; i < n; i++) if (i % 2) { ctx.fillStyle = c2; ctx.fillRect(i * sw, 0, sw, H); }
    } else if (kit.pattern === 'halves') {
      ctx.fillStyle = c2; ctx.fillRect(0, 0, W * 0.25, H); ctx.fillRect(W * 0.75, 0, W * 0.25, H);
      // ön yüz u≈0.75 merkezli: sol yarısı (u 0.75..1.0) c2, sağ yarısı c1
    } else if (kit.pattern === 'sash') {
      ctx.strokeStyle = c2; ctx.lineWidth = 46;
      ctx.beginPath(); ctx.moveTo(W * 0.62, 0); ctx.lineTo(W * 0.88, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W * 0.12, 0); ctx.lineTo(W * 0.38, H); ctx.stroke();
    } else if (kit.pattern === 'hoops') {
      const n = 8; const sh = H / n;
      for (let i = 0; i < n; i++) if (i % 2) { ctx.fillStyle = c2; ctx.fillRect(0, i * sh, W, sh); }
    }
    // Doğrulandı (yakın plan ekran görüntüsü): model önü (+z) dokuda u≈0.70-0.75, sırt u≈0.25. Büyük numara sırtta, küçük numara göğüste.
    ctx.fillStyle = kit.num || '#ffffff';
    ctx.font = 'bold 190px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.translate(W * 0.25, H * 0.42); ctx.scale(-1, 1); ctx.fillText(String(number), 0, 0); ctx.restore();
    // küçük göğüs numarası
    ctx.font = 'bold 64px Arial';
    ctx.save(); ctx.translate(W * 0.70, H * 0.32); ctx.scale(-1, 1); ctx.fillText(String(number), 0, 0); ctx.restore();
    dt.update();
    dt.hasAlpha = false;
    return dt;
  };

  FS.hexToColor3 = (hex) => BABYLON.Color3.FromHexString(hex);

  /* Oyuncu görsel sınıfı */
  class PlayerView {
    constructor(scene, p, team, shared) {
      this.p = p; this.scene = scene;
      const isGK = p.role === 'GK';
      const kit = isGK ? team.gkKit : team.kit;
      this.kit = kit; this.team = team;
      const r = (this.root = new BABYLON.TransformNode('pl' + p.id, scene));
      const body = (this.body = new BABYLON.TransformNode('body' + p.id, scene)); body.parent = r;
      const h = 1.78 + (M.hashRand(p.name, 'h') - 0.5) * 0.16;
      this.height = h;
      const skin = SKIN_TONES[Math.floor(M.hashRand(p.name, 'skin') * SKIN_TONES.length)];
      const hair = HAIR[Math.floor(M.hashRand(p.name, 'hair') * HAIR.length)];
      const mk = (name, col) => { const m = new BABYLON.StandardMaterial(name + p.id, scene); m.diffuseColor = FS.hexToColor3(col); m.specularColor = new BABYLON.Color3(0.08, 0.08, 0.08); return m; };
      const skinMat = shared.skin[skin] || (shared.skin[skin] = mk('skin' + skin, skin));
      const hairMat = shared.hair[hair] || (shared.hair[hair] = mk('hair' + hair, hair));
      const shortsKey = (isGK ? 'gk' : '') + kit.shorts + team.index;
      const shortsMat = shared.shorts[shortsKey] || (shared.shorts[shortsKey] = mk('shorts', kit.shorts));
      const socksKey = (isGK ? 'gk' : '') + kit.socks + team.index;
      const socksMat = shared.socks[socksKey] || (shared.socks[socksKey] = mk('socks', kit.socks));
      const bootMat = shared.boots || (shared.boots = mk('boots', M.chance(0.5) ? '#111111' : '#ffffff'));
      const shirtMat = new BABYLON.StandardMaterial('shirt' + p.id, scene);
      shirtMat.diffuseTexture = FS.makeKitTexture(scene, kit, p.number, isGK); shirtMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
      this.shirtMat = shirtMat;

      // Ölçüler
      const legL = h * 0.47, torsoH = h * 0.30, headR = h * 0.065;
      this.legL = legL;
      // Torso (silindir; +z ön → modelde x ekseni ileri olacak şekilde döndürme root'ta)
      const torso = BABYLON.MeshBuilder.CreateCylinder('torso', { height: torsoH, diameterTop: 0.36, diameterBottom: 0.30, tessellation: 12 }, scene);
      torso.position.y = legL + torsoH / 2; torso.material = shirtMat; torso.parent = body;
      // Kollar (omuzdan pivot)
      this.arms = [];
      for (const s of [-1, 1]) {
        const piv = new BABYLON.TransformNode('armPiv', scene); piv.parent = body; piv.position.set(s * 0.21, legL + torsoH - 0.04, 0);
        const up = BABYLON.MeshBuilder.CreateCylinder('uarm', { height: 0.30, diameter: 0.085, tessellation: 8 }, scene);
        up.position.y = -0.15; up.material = isGK ? shirtMat : shirtMat; up.parent = piv;
        const sleeve = BABYLON.MeshBuilder.CreateCylinder('sleeve', { height: 0.14, diameter: 0.11, tessellation: 8 }, scene); sleeve.position.y = -0.06; sleeve.material = shirtMat; sleeve.parent = piv;
        const elbow = new BABYLON.TransformNode('elbow', scene); elbow.parent = piv; elbow.position.y = -0.30;
        const lo = BABYLON.MeshBuilder.CreateCylinder('larm', { height: 0.28, diameter: 0.07, tessellation: 8 }, scene);
        lo.position.y = -0.14; lo.material = skinMat; lo.parent = elbow;
        const hand = BABYLON.MeshBuilder.CreateSphere('hand', { diameter: 0.09, segments: 6 }, scene); hand.position.y = -0.29; hand.material = isGK ? shared.glove || (shared.glove = mk('glove', '#eeeeee')) : skinMat; hand.parent = elbow;
        this.arms.push({ piv, elbow });
      }
      // Bacaklar (kalçadan pivot)
      this.legs = [];
      for (const s of [-1, 1]) {
        const piv = new BABYLON.TransformNode('legPiv', scene); piv.parent = body; piv.position.set(s * 0.10, legL, 0);
        const thigh = BABYLON.MeshBuilder.CreateCylinder('thigh', { height: legL * 0.5, diameterTop: 0.15, diameterBottom: 0.11, tessellation: 8 }, scene);
        thigh.position.y = -legL * 0.25; thigh.material = skinMat; thigh.parent = piv;
        const shorts = BABYLON.MeshBuilder.CreateCylinder('shorts', { height: legL * 0.28, diameterTop: 0.17, diameterBottom: 0.15, tessellation: 8 }, scene);
        shorts.position.y = -legL * 0.14; shorts.material = shortsMat; shorts.parent = piv;
        const knee = new BABYLON.TransformNode('knee', scene); knee.parent = piv; knee.position.y = -legL * 0.5;
        const shin = BABYLON.MeshBuilder.CreateCylinder('shin', { height: legL * 0.5, diameterTop: 0.10, diameterBottom: 0.08, tessellation: 8 }, scene);
        shin.position.y = -legL * 0.25; shin.material = socksMat; shin.parent = knee;
        const foot = BABYLON.MeshBuilder.CreateBox('foot', { width: 0.09, height: 0.06, depth: 0.24 }, scene);
        foot.position.set(0, -legL * 0.5 + 0.03, 0.06); foot.material = bootMat; foot.parent = knee;
        this.legs.push({ piv, knee });
      }
      // Kalça/şort üst
      const hips = BABYLON.MeshBuilder.CreateCylinder('hips', { height: 0.12, diameter: 0.30, tessellation: 10 }, scene);
      hips.position.y = legL + 0.02; hips.material = shortsMat; hips.parent = body;
      // Boyun ve kafa
      const neck = BABYLON.MeshBuilder.CreateCylinder('neck', { height: 0.08, diameter: 0.10, tessellation: 8 }, scene);
      neck.position.y = legL + torsoH + 0.03; neck.material = skinMat; neck.parent = body;
      const headPiv = (this.headPiv = new BABYLON.TransformNode('headPiv', scene)); headPiv.parent = body; headPiv.position.y = legL + torsoH + 0.07 + headR;
      const head = BABYLON.MeshBuilder.CreateSphere('head', { diameter: headR * 2, segments: 10 }, scene); head.material = skinMat; head.parent = headPiv;
      const hairM = BABYLON.MeshBuilder.CreateSphere('hair', { diameter: headR * 2.06, segments: 10, slice: 0.55 }, scene); hairM.material = hairMat; hairM.parent = headPiv; hairM.position.y = 0.01;
      // yüz (yakın planlarda önü/arkayı okutur): gözler, kaşlar, burun, ağız — model önü +z
      const faceMat = shared.face || (shared.face = (() => { const m = new BABYLON.StandardMaterial('face', scene); m.diffuseColor = new BABYLON.Color3(0.08, 0.06, 0.05); m.specularColor = BABYLON.Color3.Black(); return m; })());
      const whiteMat = shared.eyeWhite || (shared.eyeWhite = (() => { const m = new BABYLON.StandardMaterial('eyeW', scene); m.diffuseColor = new BABYLON.Color3(0.95, 0.95, 0.95); m.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3); return m; })());
      for (const sx of [-1, 1]) {
        const eyeW = BABYLON.MeshBuilder.CreateSphere('eyeW', { diameter: headR * 0.42, segments: 6 }, scene); eyeW.material = whiteMat; eyeW.parent = headPiv; eyeW.position.set(sx * headR * 0.36, headR * 0.12, headR * 0.86); eyeW.scaling.z = 0.5;
        const pupil = BABYLON.MeshBuilder.CreateSphere('pupil', { diameter: headR * 0.2, segments: 6 }, scene); pupil.material = faceMat; pupil.parent = headPiv; pupil.position.set(sx * headR * 0.36, headR * 0.12, headR * 0.96);
        const brow = BABYLON.MeshBuilder.CreateBox('brow', { width: headR * 0.44, height: headR * 0.08, depth: headR * 0.08 }, scene); brow.material = hairMat; brow.parent = headPiv; brow.position.set(sx * headR * 0.36, headR * 0.4, headR * 0.9); brow.rotation.z = sx * 0.15;
      }
      const nose = BABYLON.MeshBuilder.CreateBox('nose', { width: headR * 0.18, height: headR * 0.34, depth: headR * 0.22 }, scene); nose.material = skinMat; nose.parent = headPiv; nose.position.set(0, -headR * 0.08, headR * 0.98);
      const mouth = BABYLON.MeshBuilder.CreateBox('mouth', { width: headR * 0.42, height: headR * 0.06, depth: headR * 0.05 }, scene); mouth.material = faceMat; mouth.parent = headPiv; mouth.position.set(0, -headR * 0.48, headR * 0.9);
      // kulaklar
      for (const sx of [-1, 1]) { const ear = BABYLON.MeshBuilder.CreateSphere('ear', { diameter: headR * 0.34, segments: 6 }, scene); ear.material = skinMat; ear.parent = headPiv; ear.position.set(sx * headR * 0.98, -headR * 0.02, 0); ear.scaling.x = 0.45; }
      // Hakem aksesuarları: kart (sağ el), bayrak (yardımcı hakem), tabela (4. hakem)
      if (p.official) {
        const hand = this.arms[1].elbow;
        const cardMat = (this.cardMat = new BABYLON.StandardMaterial('cardMat' + p.id, scene)); cardMat.emissiveColor = new BABYLON.Color3(1, 0.85, 0); cardMat.diffuseColor = new BABYLON.Color3(1, 0.85, 0); cardMat.backFaceCulling = false; cardMat.specularColor = BABYLON.Color3.Black();
        const card = (this.card = BABYLON.MeshBuilder.CreatePlane('card', { width: 0.09, height: 0.125 }, scene)); card.material = cardMat; card.parent = hand; card.position.set(0.03, -0.36, 0.02); card.rotation.x = -0.2; card.setEnabled(false);
        if (p.role === 'AR') {
          const stick = BABYLON.MeshBuilder.CreateCylinder('flagStick', { height: 0.5, diameter: 0.02, tessellation: 6 }, scene); stick.parent = hand; stick.position.set(0, -0.32, 0.05); stick.material = shared.flagStick || (shared.flagStick = mk('flagStick', '#dddddd'));
          const fm = shared.flagCloth || (shared.flagCloth = (() => { const m = new BABYLON.StandardMaterial('flagCloth', scene); const t = new BABYLON.DynamicTexture('flagTex', { width: 64, height: 48 }, scene, false); const c = t.getContext(); for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { c.fillStyle = (i + j) % 2 ? '#ff5a1f' : '#ffe94d'; c.fillRect(i * 16, j * 16, 16, 16); } t.update(); m.diffuseTexture = t; m.emissiveColor = new BABYLON.Color3(0.35, 0.3, 0.1); m.backFaceCulling = false; m.specularColor = BABYLON.Color3.Black(); return m; })());
          const cloth = BABYLON.MeshBuilder.CreatePlane('flag', { width: 0.3, height: 0.22 }, scene); cloth.material = fm; cloth.parent = hand; cloth.position.set(0.15, -0.55, 0.05); cloth.rotation.y = Math.PI / 2;
          this.flag = { stick, cloth };
        }
        if (p.role === 'FOURTH') {
          const bt = (this.boardTex = new BABYLON.DynamicTexture('boardTex' + p.id, { width: 256, height: 160 }, scene, false));
          const bm = new BABYLON.StandardMaterial('boardMat' + p.id, scene); bm.diffuseTexture = bt; bm.emissiveTexture = bt; bm.emissiveColor = new BABYLON.Color3(0.9, 0.9, 0.9); bm.backFaceCulling = false; bm.specularColor = BABYLON.Color3.Black();
          const board = (this.board = BABYLON.MeshBuilder.CreatePlane('board', { width: 0.62, height: 0.39 }, scene)); board.material = bm; board.parent = body; board.position.set(0, legL + torsoH + 0.62, 0.05); board.setEnabled(false);
          this.boardKey = '';
        }
      }
      // Numara/İsim etiketi (billboard, render katmanı kontrol eder)
      this.label = null;
      // Gölge için mesh listesi
      this.meshes = r.getChildMeshes();
      for (const m of this.meshes) { m.isPickable = false; }
      // animasyon durumu
      this.phase = M.random() * Math.PI * 2;
      this.blend = { run: 0, kick: 0, slide: 0, fall: 0, dive: 0, hold: 0, chest: 0, kneel: 0, idle: 1 };
      this.kickFoot = M.hashRand(p.name, 'foot') > 0.8 ? 0 : 1; // %20 solak (0 = sol bacak vurur)
      this.lastFacing = 0;
      this.leanX = 0; this.leanZ = 0;
      this.dead = false;
    }

    // Takım/kaleci forması güncelle (rol değişince)
    setHighlight(on, color) {
      if (!this.ring) {
        const ring = BABYLON.MeshBuilder.CreateTorus('ring', { diameter: 1.1, thickness: 0.06, tessellation: 24 }, this.scene);
        const rm = new BABYLON.StandardMaterial('ringMat', this.scene); rm.emissiveColor = new BABYLON.Color3(1, 1, 1); rm.disableLighting = true; rm.alpha = 0.85;
        ring.material = rm; ring.position.y = 0.03; ring.parent = this.root; ring.isPickable = false; this.ring = ring;
      }
      this.ring.setEnabled(on);
      if (on && color) this.ring.material.emissiveColor = color;
    }

    update(dt, ball) {
      const p = this.p;
      const r = this.root;
      if (!p.onPitch && !p.subbedOff && !p.red) { r.setEnabled(false); return; }
      r.setEnabled(true);
      r.position.x = p.x; r.position.z = p.z; r.position.y = 0;
      // yön: modelde +z ön → yaw = -(facing) + 90°  (Babylon sol el: rotation.y pozitif = saat yönü bakıldığında...). Deneysel: rotation.y = -facing + PI/2 → +x'e bakan oyuncu facing=0.
      const yaw = -p.facing + Math.PI / 2;
      r.rotation.y = yaw;
      // hedef karışımlar
      const b = this.blend;
      const speed = p.speed;
      const walkT = M.clamp01((speed - 0.25) / 1.2);           // yürüme 0.25..1.5 m/s
      const runT = M.clamp01((speed - 1.6) / 2.6);             // koşu 1.6..4.2 m/s (tam koşu)
      const sprintT = M.clamp01((speed - 5.5) / 2.5);          // sprint 5.5..8 m/s
      const tgt = { run: Math.max(walkT * 0.35, runT), kick: p.kickAnim > 0 ? 1 : 0, slide: p.tackleT > 0 ? 1 : 0, fall: p.fallT > 0 ? 1 : 0, dive: p.diveT > 0 ? 1 : 0, hold: p.holding ? 1 : 0, chest: p.chestAnim > 0 ? 1 : 0, kneel: p.celKneelT > 0 ? 1 : 0, idle: 0 };
      tgt.idle = 1 - Math.max(tgt.run, tgt.kick, tgt.slide, tgt.fall, tgt.dive, tgt.hold, tgt.chest, tgt.kneel);
      const k = 1 - Math.exp(-dt * 12);
      for (const key in b) b[key] += (tgt[key] - b[key]) * k;
      // adım fazı: adım frekansı hızla artar; yürüyüşte ~1.6 Hz, koşuda ~2.6-3.2 Hz. Faz ilerlemesi hızla sürekli (kayma yok).
      // top sürerken adımlar kısalır ve sıklaşır (top ayakta kalır), gövde daha dik
      const dribble = p.hasBall && !p.holding && speed > 1 ? 1 : 0;
      const strideLen = (0.55 + 0.95 * M.clamp01(speed / 8) * (0.9 + 0.2 * (this.height - 1.7))) * (1 - 0.22 * dribble); // m/adım
      const strideHz = speed > 0.25 ? M.clamp(speed / strideLen / 2, 0.8, 3.4) : 0;
      this.phase += dt * strideHz * Math.PI * 2;
      const ph = this.phase;
      const gait = Math.max(walkT, runT);
      const swing = (0.22 * walkT + (0.5 + 0.45 * M.clamp01(speed / 8)) * runT) * (1 - b.kick * 0.5) * (1 - 0.18 * dribble);
      const L = this.legs, A_ = this.arms;
      // bacaklar: kalça salınımı + diz bükülmesi (salınım fazında bükül, yere basarken düz)
      const legA = Math.sin(ph) * swing;
      L[0].piv.rotation.x = legA; L[1].piv.rotation.x = -legA;
      const kneeAmp = (0.5 * walkT + 1.7 * runT) * M.clamp01(swing / 0.6 + 0.3);
      L[0].knee.rotation.x = Math.max(0, -Math.sin(ph - 0.9)) * kneeAmp * 0.9 + 0.05 * gait;
      L[1].knee.rotation.x = Math.max(0, Math.sin(ph - 0.9)) * kneeAmp * 0.9 + 0.05 * gait;
      // kollar: bacaklara zıt; koşuda dirsek 90°, yürüyüşte sarkık ve düşük genlikli; küçük asimetri (kişiye özgü)
      const armAmp = 0.35 * walkT + 0.95 * runT;
      const asym = (M.hashRand(p.name, 'arm') - 0.5) * 0.25;
      A_[0].piv.rotation.x = -Math.sin(ph) * armAmp * (1 + asym); A_[1].piv.rotation.x = Math.sin(ph) * armAmp * (1 - asym);
      A_[0].piv.rotation.z = 0.12 + 0.08 * (1 - gait) + 0.12 * sprintT; A_[1].piv.rotation.z = -(0.12 + 0.08 * (1 - gait) + 0.12 * sprintT);
      A_[0].elbow.rotation.x = -0.35 - 0.35 * walkT - 1.25 * runT; A_[1].elbow.rotation.x = -0.35 - 0.35 * walkT - 1.25 * runT;
      // idle: nefes + ağırlık aktarma (kişiye özgü periyot) + ara sıra küçük duruş değişimi
      const idleT = (this.idleT = (this.idleT || 0) + dt);
      const per = 2.6 + M.hashRand(p.name, 'idlep') * 1.6;
      const breathe = Math.sin(idleT * (Math.PI * 2) / 3.1 + p.id) * 0.008 * b.idle;
      const shiftW = Math.sin(idleT * (Math.PI * 2) / per + p.id * 1.7) * b.idle;
      // ağırlık aktarma: kalça yana kayar, bir diz hafif bükülür
      this.body.position.x = shiftW * 0.03;
      L[0].knee.rotation.x += Math.max(0, shiftW) * 0.12 * b.idle; L[1].knee.rotation.x += Math.max(0, -shiftW) * 0.12 * b.idle;
      // idle'da eller belde / kollar sarkık varyasyonu
      const handsOnHips = M.hashRand(p.name, 'hips') > 0.6 && b.idle > 0.8 && p.role !== 'GK';
      if (handsOnHips) { A_[0].piv.rotation.z = 0.55; A_[1].piv.rotation.z = -0.55; A_[0].elbow.rotation.x = -1.1; A_[1].elbow.rotation.x = -1.1; A_[0].piv.rotation.x = 0.35; A_[1].piv.rotation.x = 0.35; }
      // seremoni: tokalaşma (sağ kol öne uzanır), tribün selamı (dizilirken kollar arkada/yanda)
      if (p.shakeAnim > 0.01) { const sa = p.shakeAnim; A_[1].piv.rotation.x = M.lerp(A_[1].piv.rotation.x, -1.2, sa); A_[1].elbow.rotation.x = M.lerp(A_[1].elbow.rotation.x, -0.5, sa); A_[1].piv.rotation.z = M.lerp(A_[1].piv.rotation.z, -0.1, sa); }
      else if (p.ceremonyStage === 2 && b.idle > 0.7) { A_[0].piv.rotation.x = 0.55; A_[1].piv.rotation.x = 0.55; A_[0].elbow.rotation.x = -0.9; A_[1].elbow.rotation.x = -0.9; A_[0].piv.rotation.z = 0.2; A_[1].piv.rotation.z = -0.2; }
      // gövde eğimi: hız ve ivme (öne eğilme sprintte belirgin)
      const ax = (p.vx - (this.pvx || 0)) / Math.max(dt, 1e-3), az = (p.vz - (this.pvz || 0)) / Math.max(dt, 1e-3);
      this.pvx = p.vx; this.pvz = p.vz;
      const fwd = { x: Math.cos(p.facing), z: Math.sin(p.facing) };
      const accFwd = M.clamp((ax * fwd.x + az * fwd.z) / 12, -0.4, 0.4);
      const leanTarget = (0.06 * walkT + 0.14 * runT * M.clamp01(speed / 7) + 0.08 * sprintT) * (1 - 0.35 * dribble) + accFwd * 0.25;
      this.leanX += (leanTarget - this.leanX) * (1 - Math.exp(-dt * 6));
      // yana yatma (dönüşte): hız × dönüş oranı (merkezkaç)
      const turn = M.angleDiff(this.lastFacing, p.facing) / Math.max(dt, 1e-3); this.lastFacing = p.facing;
      const leanZt = M.clamp(-turn * 0.02 * (0.5 + speed / 8), -0.3, 0.3) * gait;
      this.leanZ += (leanZt - this.leanZ) * (1 - Math.exp(-dt * 5));
      this.body.rotation.x = this.leanX; this.body.rotation.z = this.leanZ;
      // kalça: her adımda dikey sekme (yürüyüşte az, koşuda fazla) + adım fazıyla yaw salınımı
      this.body.position.y = breathe + Math.abs(Math.sin(ph)) * (0.012 * walkT + 0.04 * runT) - 0.01 * runT;
      this.body.rotation.y = Math.sin(ph) * (0.05 * walkT + 0.12 * runT);
      // omuz karşı-rotasyonu: gövde üst kısmı kalçaya ters döner → kollar buna binince doğal koşu
      const shoulder = -Math.sin(ph) * (0.03 * walkT + 0.08 * runT);
      A_[0].piv.rotation.y = shoulder; A_[1].piv.rotation.y = shoulder;
      // vuruş animasyonları (kickAnim 1→0; sim temas anında 1 yapar → poz temas duruşundan takip hareketine akar)
      if (b.kick > 0.01) {
        const kp = 1 - p.kickAnim; // 0 temas → 1 bitiş
        const kf = this.kickFoot, sf = 1 - kf; // vuran / destek bacağı
        const sgn = kf === 1 ? 1 : -1; // kol/kalça aynalama
        const st = p.kickStyle;
        const KL = L[kf], SL = L[sf], KA = A_[kf], SA = A_[sf];
        if (st === 'header' || st === 'jumpHeader') {
          // kafa vuruşu: gövde geriden öne kırbaç, baş öne; yüksek topta sıçrama (kalkış-iniş yayı), kollar geride denge
          const jump = st === 'jumpHeader' ? Math.sin(Math.min(1, kp / 0.8) * Math.PI) * 0.42 : 0;
          const whip = kp < 0.2 ? M.lerp(-0.35, 0.3, M.easeOutQuad(kp / 0.2)) : M.lerp(0.3, 0.05, M.easeOutCubic((kp - 0.2) / 0.8));
          this.body.rotation.x = M.lerp(this.body.rotation.x, whip, b.kick);
          this.headPiv.rotation.x = M.lerp(this.headPiv.rotation.x, kp < 0.2 ? -0.45 + kp * 4 : 0.35 - (kp - 0.2) * 0.4, b.kick);
          this.body.position.y += jump * b.kick;
          for (const i of [0, 1]) { A_[i].piv.rotation.x = M.lerp(A_[i].piv.rotation.x, kp < 0.3 ? 0.9 : 0.3, b.kick); A_[i].piv.rotation.z = M.lerp(A_[i].piv.rotation.z, (i === 0 ? 1 : -1) * 0.7, b.kick); A_[i].elbow.rotation.x = M.lerp(A_[i].elbow.rotation.x, -0.6, b.kick); }
          if (jump > 0.02) { for (const i of [0, 1]) { L[i].piv.rotation.x = M.lerp(L[i].piv.rotation.x, -0.5, b.kick); L[i].knee.rotation.x = M.lerp(L[i].knee.rotation.x, 1.3, b.kick); } }
        } else if (st === 'throw') {
          // taç atışı: iki kol baş üstünde geride → öne savurma, gövde geriye yaylanıp öne kırılır
          const ph2 = kp < 0.35 ? M.easeOutQuad(kp / 0.35) : 1;
          const armX = M.lerp(-3.0, -1.2, ph2), back = M.lerp(-0.35, 0.28, ph2);
          for (const i of [0, 1]) { A_[i].piv.rotation.x = M.lerp(A_[i].piv.rotation.x, armX, b.kick); A_[i].piv.rotation.z = M.lerp(A_[i].piv.rotation.z, (i === 0 ? 1 : -1) * 0.2, b.kick); A_[i].elbow.rotation.x = M.lerp(A_[i].elbow.rotation.x, M.lerp(-1.3, -0.3, ph2), b.kick); }
          this.body.rotation.x = M.lerp(this.body.rotation.x, back, b.kick);
          L[0].piv.rotation.x = M.lerp(L[0].piv.rotation.x, 0.35, b.kick); L[1].piv.rotation.x = M.lerp(L[1].piv.rotation.x, -0.35, b.kick); L[0].knee.rotation.x = M.lerp(L[0].knee.rotation.x, 0.4, b.kick);
        } else if (st === 'gkOverarm') {
          // kaleci üstten atış: tek kol büyük yay (arkadan öne), gövde döner, adım atar
          const ph2 = kp < 0.4 ? M.easeOutQuad(kp / 0.4) : 1;
          A_[1].piv.rotation.x = M.lerp(A_[1].piv.rotation.x, M.lerp(-3.1, -0.6, ph2), b.kick); A_[1].piv.rotation.z = M.lerp(A_[1].piv.rotation.z, -0.4, b.kick); A_[1].elbow.rotation.x = M.lerp(A_[1].elbow.rotation.x, M.lerp(-0.9, -0.1, ph2), b.kick);
          A_[0].piv.rotation.x = M.lerp(A_[0].piv.rotation.x, -0.8, b.kick); A_[0].piv.rotation.z = M.lerp(A_[0].piv.rotation.z, 0.6, b.kick);
          this.body.rotation.y = M.lerp(this.body.rotation.y, M.lerp(0.5, -0.3, ph2), b.kick); this.body.rotation.x = M.lerp(this.body.rotation.x, M.lerp(-0.15, 0.25, ph2), b.kick);
          L[0].piv.rotation.x = M.lerp(L[0].piv.rotation.x, -0.5, b.kick); L[0].knee.rotation.x = M.lerp(L[0].knee.rotation.x, 0.5, b.kick); L[1].piv.rotation.x = M.lerp(L[1].piv.rotation.x, 0.4, b.kick);
        } else if (st === 'gkRoll') {
          // kaleci yerden yuvarlama: öne eğilir, kol alçaktan sallanır
          const ph2 = kp < 0.4 ? M.easeOutQuad(kp / 0.4) : 1;
          this.body.rotation.x = M.lerp(this.body.rotation.x, M.lerp(0.55, 0.35, ph2), b.kick);
          A_[1].piv.rotation.x = M.lerp(A_[1].piv.rotation.x, M.lerp(0.9, -1.4, ph2), b.kick); A_[1].elbow.rotation.x = M.lerp(A_[1].elbow.rotation.x, -0.05, b.kick);
          for (const i of [0, 1]) { L[i].knee.rotation.x = M.lerp(L[i].knee.rotation.x, 0.9, b.kick); L[i].piv.rotation.x = M.lerp(L[i].piv.rotation.x, i === 1 ? 0.5 : -0.5, b.kick); }
        } else if (st === 'volley') {
          // vole: vuran bacak yükseğe savrulur, gövde geriye yatar, kollar açık denge
          const sw = kp < 0.4 ? M.lerp(-0.9, 1.45, M.easeOutCubic(kp / 0.4)) : M.lerp(1.45, 0.2, M.easeOutCubic((kp - 0.4) / 0.6));
          KL.piv.rotation.x = M.lerp(KL.piv.rotation.x, sw, b.kick); KL.knee.rotation.x = M.lerp(KL.knee.rotation.x, kp < 0.25 ? 0.6 : 0.1, b.kick);
          SL.knee.rotation.x = M.lerp(SL.knee.rotation.x, 0.4, b.kick); SL.piv.rotation.x = M.lerp(SL.piv.rotation.x, 0.1, b.kick);
          this.body.rotation.x = M.lerp(this.body.rotation.x, -0.42, b.kick); this.body.rotation.y = M.lerp(this.body.rotation.y, sgn * (kp < 0.4 ? 0.3 : -0.25), b.kick);
          SA.piv.rotation.x = M.lerp(SA.piv.rotation.x, -1.2, b.kick); SA.piv.rotation.z = M.lerp(SA.piv.rotation.z, sgn * 1.1, b.kick); SA.elbow.rotation.x = M.lerp(SA.elbow.rotation.x, -0.2, b.kick);
          KA.piv.rotation.x = M.lerp(KA.piv.rotation.x, 0.6, b.kick); KA.piv.rotation.z = M.lerp(KA.piv.rotation.z, -sgn * 0.8, b.kick);
          this.body.position.y -= 0.02 * b.kick;
        } else {
          // yerden vuruş: temasta bacak hafif önde, hızlı takip (follow-through) yukarı-öne, sonra toparlanma; destek bacağı bükük, kalça döner, kollar denge
          const sw = kp < 0.12 ? M.lerp(-0.55, 0.25, kp / 0.12) : kp < 0.5 ? M.lerp(0.25, 1.05, M.easeOutCubic((kp - 0.12) / 0.38)) : M.lerp(1.05, 0.1, M.easeInOutQuad((kp - 0.5) / 0.5));
          KL.piv.rotation.x = M.lerp(KL.piv.rotation.x, sw, b.kick);
          KL.knee.rotation.x = M.lerp(KL.knee.rotation.x, kp < 0.12 ? 0.9 : kp < 0.5 ? 0.25 : 0.5, b.kick);
          SL.knee.rotation.x = M.lerp(SL.knee.rotation.x, 0.4, b.kick); SL.piv.rotation.x = M.lerp(SL.piv.rotation.x, -0.15, b.kick); // destek bacağı
          SA.piv.rotation.x = M.lerp(SA.piv.rotation.x, -0.9, b.kick); SA.piv.rotation.z = M.lerp(SA.piv.rotation.z, sgn * 1.0, b.kick);
          KA.piv.rotation.x = M.lerp(KA.piv.rotation.x, 0.5, b.kick); KA.piv.rotation.z = M.lerp(KA.piv.rotation.z, -sgn * 0.5, b.kick);
          this.body.rotation.x = M.lerp(this.body.rotation.x, kp < 0.3 ? 0.12 : 0.02, b.kick);
          this.body.rotation.y = M.lerp(this.body.rotation.y, sgn * (kp < 0.3 ? 0.2 : -0.22), b.kick); // kalça dönüşü
          this.body.position.y -= 0.03 * b.kick;
        }
      }
      // göğüs / uyluk kontrolü: gövde geri yaslanır, kollar açılır; uylukta bir bacak kalkar
      if (b.chest > 0.01) {
        if (p.chestKind === 'thigh') { const KL = L[this.kickFoot]; KL.piv.rotation.x = M.lerp(KL.piv.rotation.x, -1.35, b.chest); KL.knee.rotation.x = M.lerp(KL.knee.rotation.x, 1.5, b.chest); this.body.rotation.x = M.lerp(this.body.rotation.x, -0.05, b.chest); }
        else { this.body.rotation.x = M.lerp(this.body.rotation.x, -0.3, b.chest); for (const i of [0, 1]) { L[i].knee.rotation.x = M.lerp(L[i].knee.rotation.x, 0.35, b.chest); } }
        for (const i of [0, 1]) { A_[i].piv.rotation.x = M.lerp(A_[i].piv.rotation.x, 0.4, b.chest); A_[i].piv.rotation.z = M.lerp(A_[i].piv.rotation.z, (i === 0 ? 1 : -1) * 0.9, b.chest); A_[i].elbow.rotation.x = M.lerp(A_[i].elbow.rotation.x, -0.5, b.chest); }
        this.headPiv.rotation.x = M.lerp(this.headPiv.rotation.x, -0.35, b.chest);
      }
      // NOT: gövde pivotu AYAKLARDA (root y=0). Yatık pozlarda gövde döndürülünce zaten yere iner; position.y'yi
      // eksiye çekmek modeli zeminin altına gömer (eski hata: "tünelleme"). Aşağıdaki pozlar kalça ~0.2 m yükseklikte kalacak,
      // hiçbir uzuv y<0'a inmeyecek şekilde ayarlandı; ayrıca updateGroundClamp() son güvenlik olarak en alçak noktayı zeminde tutar.
      // kayarak müdahale: kalça yerde, gövde ~57° geriye yaslı, ön bacak yerde uzanmış, arka bacak altta bükülü, bir el yerde destek
      if (b.slide > 0.01) {
        const tb = -1.0;
        this.body.rotation.x = M.lerp(this.body.rotation.x, tb, b.slide);
        this.body.position.y = M.lerp(this.body.position.y, 0.2 - this.legL * Math.cos(tb), b.slide);
        L[1].piv.rotation.x = M.lerp(L[1].piv.rotation.x, -0.33, b.slide); L[1].knee.rotation.x = M.lerp(L[1].knee.rotation.x, 0.05, b.slide);
        L[0].piv.rotation.x = M.lerp(L[0].piv.rotation.x, -0.2, b.slide); L[0].knee.rotation.x = M.lerp(L[0].knee.rotation.x, 2.6, b.slide);
        A_[0].piv.rotation.x = M.lerp(A_[0].piv.rotation.x, -1.6, b.slide); A_[0].piv.rotation.z = M.lerp(A_[0].piv.rotation.z, 0.5, b.slide);
        A_[1].piv.rotation.x = M.lerp(A_[1].piv.rotation.x, 0.2, b.slide); A_[1].piv.rotation.z = M.lerp(A_[1].piv.rotation.z, -0.35, b.slide); A_[1].elbow.rotation.x = M.lerp(A_[1].elbow.rotation.x, -0.1, b.slide);
      }
      // düşme: yüzükoyun yerde; kollar öne uzanmış (biri dirsekten bükülü), bir bacak dizden hafif kalkık; kalkarken doğal doğrulma
      // Gövde pivotu ayaklarda olduğundan yatan model öne uzanır; ayakları 0.7 m geri kaydırarak gövde sim konumunun (p.x,p.z)
      // ÜZERİNDE ortalanır → düşerken/kalkarken model ileri-geri kaymaz ("ışınlanma" yok). Sim'deki engel segmenti aynı geometri.
      this.body.position.z = -0.7 * b.fall;
      if (b.fall > 0.01) {
        const tb = 1.5;
        this.body.rotation.x = M.lerp(this.body.rotation.x, tb, b.fall);
        this.body.position.y = M.lerp(this.body.position.y, 0.17, b.fall);
        this.body.rotation.z = M.lerp(this.body.rotation.z, 0, b.fall);
        L[0].piv.rotation.x = M.lerp(L[0].piv.rotation.x, -0.12, b.fall); L[0].knee.rotation.x = M.lerp(L[0].knee.rotation.x, 0.05, b.fall);
        L[1].piv.rotation.x = M.lerp(L[1].piv.rotation.x, -0.05, b.fall); L[1].knee.rotation.x = M.lerp(L[1].knee.rotation.x, 0.6, b.fall);
        A_[0].piv.rotation.x = M.lerp(A_[0].piv.rotation.x, -2.9, b.fall); A_[0].piv.rotation.z = M.lerp(A_[0].piv.rotation.z, 0.35, b.fall); A_[0].elbow.rotation.x = M.lerp(A_[0].elbow.rotation.x, -0.1, b.fall);
        A_[1].piv.rotation.x = M.lerp(A_[1].piv.rotation.x, -2.2, b.fall); A_[1].piv.rotation.z = M.lerp(A_[1].piv.rotation.z, -0.3, b.fall); A_[1].elbow.rotation.x = M.lerp(A_[1].elbow.rotation.x, -1.2, b.fall);
        this.headPiv.rotation.x = M.lerp(this.headPiv.rotation.x, -0.5, b.fall); // baş hafif yukarıda (yüz yere gömülmesin)
      }
      // kaleci dalışı: yana uzanma, kollar açık (alçak dalışta gövde yere paralel ~0.25 m yükseklikte; yüksek dalışta havada)
      if (b.dive > 0.01) {
        const side = p.diveTarget ? Math.sign((p.diveTarget.z - p.z) * (Math.cos(p.facing) >= 0 ? 1 : -1) || 1) : 1;
        const low = p.diveTarget ? p.diveTarget.y < 1.0 : true;
        this.body.rotation.z = M.lerp(this.body.rotation.z, side * (low ? 1.4 : 0.9), b.dive);
        this.body.position.y = M.lerp(this.body.position.y, low ? 0.08 : 0.15, b.dive);
        A_[0].piv.rotation.z = M.lerp(A_[0].piv.rotation.z, 2.9, b.dive); A_[1].piv.rotation.z = M.lerp(A_[1].piv.rotation.z, -2.9, b.dive);
        A_[0].elbow.rotation.x = M.lerp(A_[0].elbow.rotation.x, 0, b.dive); A_[1].elbow.rotation.x = M.lerp(A_[1].elbow.rotation.x, 0, b.dive);
      }
      // kaleci topu tutuyor: kollar önde
      if (b.hold > 0.01) {
        A_[0].piv.rotation.x = M.lerp(A_[0].piv.rotation.x, -1.3, b.hold); A_[1].piv.rotation.x = M.lerp(A_[1].piv.rotation.x, -1.3, b.hold);
        A_[0].piv.rotation.z = M.lerp(A_[0].piv.rotation.z, 0.5, b.hold); A_[1].piv.rotation.z = M.lerp(A_[1].piv.rotation.z, -0.5, b.hold);
        A_[0].elbow.rotation.x = M.lerp(A_[0].elbow.rotation.x, -1.2, b.hold); A_[1].elbow.rotation.x = M.lerp(A_[1].elbow.rotation.x, -1.2, b.hold);
      }
      // kaleci hazır duruş: hafif çömelme
      if (p.role === 'GK' && (p.state === 'gk_set') && b.idle > 0.5) {
        const bounce = Math.abs(Math.sin((this.idleT || 0) * 5.5)) * 0.02; // parmak ucunda hafif sekme
        L[0].knee.rotation.x = Math.max(L[0].knee.rotation.x, 0.55); L[1].knee.rotation.x = Math.max(L[1].knee.rotation.x, 0.55);
        L[0].piv.rotation.x = Math.min(L[0].piv.rotation.x, -0.28); L[1].piv.rotation.x = Math.min(L[1].piv.rotation.x, -0.28);
        this.body.position.y -= 0.09 - bounce;
        this.body.rotation.x = Math.max(this.body.rotation.x, 0.18);
        A_[0].piv.rotation.z = 0.75; A_[1].piv.rotation.z = -0.75; A_[0].piv.rotation.x = -0.5; A_[1].piv.rotation.x = -0.5;
        A_[0].elbow.rotation.x = -1.5; A_[1].elbow.rotation.x = -1.5;
      }
      // gol sevinci: 7 stil (sim golcü/takım arkadaşına celStyle atar; yoksa isme göre sabit)
      if (p.celebrateT > 0 || p.celKneelT > 0) {
        const ct = (this.idleT || 0) * 6 + p.id;
        const style = p.celStyle != null ? p.celStyle : Math.floor(M.hashRand(p.name, 'cel') * 3);
        if (style === 0) { // iki kol havada, zıplama
          A_[0].piv.rotation.x = -2.9; A_[1].piv.rotation.x = -2.9; A_[0].elbow.rotation.x = -0.3; A_[1].elbow.rotation.x = -0.3;
          this.body.position.y += Math.max(0, Math.sin(ct)) * 0.12 * b.idle;
        } else if (style === 1) { // yumruk sallama
          A_[1].piv.rotation.x = -2.2 + Math.sin(ct) * 0.5; A_[1].elbow.rotation.x = -1.6; A_[0].piv.rotation.x = 0.3;
        } else if (style === 2) { // kollar açık 'uçak', koşarak; gövde hafif yana yatar
          A_[0].piv.rotation.z = 1.4; A_[1].piv.rotation.z = -1.4; A_[0].piv.rotation.x = -0.6; A_[1].piv.rotation.x = -0.6; A_[0].elbow.rotation.x = -0.1; A_[1].elbow.rotation.x = -0.1;
          this.body.rotation.z += Math.sin(ct * 0.5) * 0.12;
        } else if (style === 3) { // diz kayması (celKneelT sim'de) — kayarken kollar açık, sonra yumruklar sıkılı
          if (b.kneel > 0.01) {
            const legL = this.legL;
            this.body.position.y = M.lerp(this.body.position.y, -legL * 0.5, b.kneel);
            for (const i of [0, 1]) { L[i].piv.rotation.x = M.lerp(L[i].piv.rotation.x, 0.0, b.kneel); L[i].knee.rotation.x = M.lerp(L[i].knee.rotation.x, 1.62, b.kneel); }
            this.body.rotation.x = M.lerp(this.body.rotation.x, -0.32, b.kneel);
            const late = p.celKneelT < 1.2;
            for (const i of [0, 1]) { A_[i].piv.rotation.x = M.lerp(A_[i].piv.rotation.x, late ? -1.6 : -0.9, b.kneel); A_[i].piv.rotation.z = M.lerp(A_[i].piv.rotation.z, (i === 0 ? 1 : -1) * (late ? 0.5 : 1.5), b.kneel); A_[i].elbow.rotation.x = M.lerp(A_[i].elbow.rotation.x, late ? -1.3 : -0.1, b.kneel); }
            this.headPiv.rotation.x = M.lerp(this.headPiv.rotation.x, -0.5, b.kneel);
          } else { A_[0].piv.rotation.z = 1.2; A_[1].piv.rotation.z = -1.2; A_[0].piv.rotation.x = -0.5; A_[1].piv.rotation.x = -0.5; }
        } else if (style === 4) { // gökyüzünü işaret: bir kol dümdüz yukarı, baş yukarı
          A_[1].piv.rotation.x = -3.05; A_[1].piv.rotation.z = -0.05; A_[1].elbow.rotation.x = 0; A_[0].piv.rotation.x = 0.2;
          this.headPiv.rotation.x = -0.55;
        } else if (style === 5) { // eller kulakta (tribüne 'duyamıyorum')
          for (const i of [0, 1]) { A_[i].piv.rotation.x = -0.5; A_[i].piv.rotation.z = (i === 0 ? 1 : -1) * 1.15; A_[i].elbow.rotation.x = -2.5; }
          this.headPiv.rotation.x = -0.2; this.body.rotation.x = Math.min(this.body.rotation.x, -0.1);
        } else { // 6: kucaklaşma — golcüye yakınken kollar öne sarılır, uzaktayken kollar yukarı koşar
          const near = p.celHugNear;
          if (near) { for (const i of [0, 1]) { A_[i].piv.rotation.x = -1.35; A_[i].piv.rotation.z = (i === 0 ? 1 : -1) * 0.25; A_[i].elbow.rotation.x = -1.5; } this.body.rotation.x = Math.max(this.body.rotation.x, 0.12); }
          else { A_[0].piv.rotation.x = -2.6; A_[1].piv.rotation.x = -2.6; A_[0].elbow.rotation.x = -0.5; A_[1].elbow.rotation.x = -0.5; }
        }
      }
      // itiraz: faul sonrası kollar iki yana açık ("ben mi?"), baş sağa sola
      if (p.protestT > 0) {
        const pt = (this.idleT || 0) * 4 + p.id;
        A_[0].piv.rotation.z = M.lerp(A_[0].piv.rotation.z, 1.15, 0.8); A_[1].piv.rotation.z = M.lerp(A_[1].piv.rotation.z, -1.15, 0.8);
        A_[0].piv.rotation.x = -0.55; A_[1].piv.rotation.x = -0.55; A_[0].elbow.rotation.x = -0.7; A_[1].elbow.rotation.x = -0.7;
        this.body.rotation.x = Math.min(this.body.rotation.x, -0.06);
      }
      // hakem işaretleri
      if (p.official) this.updateOfficial(p, A_, L, dt);
      // kenara yürüyen (değişiklik / ihraç) oyuncu: baş önde ve hafif eğik, topa bakmaz
      const walkingOff = !!p.walkTo;
      if (walkingOff) {
        const hk = 1 - Math.exp(-dt * 6);
        this.headPiv.rotation.y += (0 - this.headPiv.rotation.y) * hk;
        this.headPiv.rotation.x += ((p.red ? 0.42 : 0.22) - this.headPiv.rotation.x) * hk;
        this.body.rotation.x = Math.max(this.body.rotation.x, p.red ? 0.1 : 0.05); // omuzlar düşük
      } else if (p.protestT > 0) {
        const hk = 1 - Math.exp(-dt * 8);
        this.headPiv.rotation.y += (Math.sin((this.idleT || 0) * 5 + p.id) * 0.35 - this.headPiv.rotation.y) * hk;
        this.headPiv.rotation.x += (-0.15 - this.headPiv.rotation.x) * hk;
      }
      // kafa: topa bak; topsuz oyuncular arada etrafa (omuz üstü) bakınır; hareket yumuşatılmış
      if (ball && b.fall < 0.5 && !walkingOff && !(p.protestT > 0)) {
        const dx = ball.x - p.x, dz = ball.z - p.z;
        let want = M.angleDiff(p.facing, Math.atan2(dz, dx));
        const dist = M.len(dx, dz);
        // omuz kontrolü: 3-6 sn'de bir kısa bakış (kişiye özgü faz)
        const lookPer = 4.5 + M.hashRand(p.name, 'look') * 2.5;
        const lookPh = ((this.idleT || 0) + M.hashRand(p.name, 'lookph') * 10) % lookPer;
        if (!p.hasBall && dist > 8 && lookPh < 0.7) want += (M.hashRand(p.name, 'lookdir') > 0.5 ? 1 : -1) * 1.2 * Math.sin((lookPh / 0.7) * Math.PI);
        const ty = M.clamp(-want, -1.2, 1.2), tx = M.clamp(Math.atan2(1.6 - ball.y, Math.max(dist, 0.5)) * 0.6, -0.5, 0.6);
        const hk = 1 - Math.exp(-dt * 9);
        this.headPiv.rotation.y += (ty - this.headPiv.rotation.y) * hk;
        this.headPiv.rotation.x += (tx - this.headPiv.rotation.x) * hk;
      }
      if (this.ring) this.ring.rotation.y += dt * 1.5;
      // zemin kelepçesi: yatık pozlarda ve kalkış geçişlerinde hiçbir uzuv çimin altına inmesin; ayakta dururken de
      // ayak tabanı zeminde kalsın (idle pozlarında diz bükülmesi gövdeyi zemine gömmesin)
      if (b.fall > 0.001 || b.slide > 0.001 || b.dive > 0.001 || b.kneel > 0.001) this.updateGroundClamp();
      else if (this.body.position.y < 0) this.body.position.y = 0;
    }

    /* En alçak uzuv noktasını bulur; zeminin altına inmişse tüm gövdeyi o kadar yukarı kaldırır (tünelleme yok).
       Yalnızca yatık pozlarda çağrılır (koşu/yürüyüşte ayaklar zaten zeminde). */
    updateGroundClamp() {
      const body = this.body;
      body.computeWorldMatrix(true);
      let minY = Infinity;
      const probes = this._probes || (this._probes = this.meshes.filter((m) => /^(head|hand|foot|shin|larm|torso|hips|thigh|uarm)$/.test(m.name)));
      for (const m of probes) {
        m.computeWorldMatrix(true);
        const bb = m.getBoundingInfo().boundingBox;
        if (bb.minimumWorld.y < minY) minY = bb.minimumWorld.y;
      }
      const floor = 0.02;
      if (minY < floor) body.position.y += floor - minY;
      else if (minY > floor + 0.08 && this.blend.fall + this.blend.slide + this.blend.dive + this.blend.kneel > 0.5) body.position.y -= Math.min(minY - floor, 0.05); // havada asılı kalmasın
    }

    /* Hakem jestleri: kart, bayrak, kulaklık, işaret, VAR sinyali, düdük, tabela */
    updateOfficial(p, A_, L, dt) {
      const up = (i) => { A_[i].piv.rotation.x = -2.95; A_[i].piv.rotation.z = (i === 0 ? 1 : -1) * 0.12; A_[i].elbow.rotation.x = -0.05; };
      if (this.card) {
        const show = p.cardT > 0;
        if (show !== this.card.isEnabled()) this.card.setEnabled(show);
        if (show) {
          this.cardMat.emissiveColor = p.cardColor === 'red' ? new BABYLON.Color3(0.9, 0.05, 0.05) : new BABYLON.Color3(1, 0.85, 0); this.cardMat.diffuseColor = this.cardMat.emissiveColor;
          // kart: cebe uzanma (0.25 s) → kolu dimdik kaldırma (0.3 s, yumuşak) → tutma; baş oyuncuya dönük, gövde dik
          const el = Math.max(0, (p.cardTotal || 2.4) - p.cardT);
          const raise = el < 0.25 ? 0 : M.easeOutCubic(Math.min(1, (el - 0.25) / 0.3));
          A_[1].piv.rotation.x = M.lerp(0.35, -3.05, raise); A_[1].piv.rotation.z = M.lerp(-0.25, -0.08, raise); A_[1].elbow.rotation.x = M.lerp(-1.6, -0.05, raise);
          this.card.setEnabled(el > 0.2);
          this.body.rotation.x = Math.min(this.body.rotation.x, -0.04);
          this.headPiv.rotation.x = -0.1 + raise * 0.15;
        }
      }
      if (this.flag) {
        if (p.flagT > 0) up(1);
        else { A_[1].piv.rotation.x = 0.15; A_[1].piv.rotation.z = -0.2; A_[1].elbow.rotation.x = -0.1; } // bayrak aşağıda, yanda
      }
      if (p.earT > 0) { A_[1].piv.rotation.x = -0.55; A_[1].piv.rotation.z = -1.25; A_[1].elbow.rotation.x = -2.55; } // el kulakta (VAR dinliyor)
      if (p.whistleT > 0) { A_[0].piv.rotation.x = -1.0; A_[0].piv.rotation.z = 0.35; A_[0].elbow.rotation.x = -2.5; } // düdük ağızda
      if (p.signalT > 0) {
        if (p.signalKind === 'nogoal') { for (const i of [0, 1]) { A_[i].piv.rotation.x = -1.5; A_[i].piv.rotation.z = (i === 0 ? -1 : 1) * 0.55; A_[i].elbow.rotation.x = 0; } } // kollar çapraz: gol yok
        else if (p.signalKind === 'advantage') { for (const i of [0, 1]) { A_[i].piv.rotation.x = -1.45; A_[i].piv.rotation.z = (i === 0 ? 1 : -1) * 0.25; A_[i].elbow.rotation.x = 0; } } // iki kol ileri: avantaj
      }
      if (p.pointT > 0 && !(p.cardT > 0)) { A_[1].piv.rotation.x = -1.55; A_[1].piv.rotation.z = -0.05; A_[1].elbow.rotation.x = 0; } // işaret: kol düz ileri
      if (this.board) {
        const show = p.boardT > 0;
        if (show !== this.board.isEnabled()) this.board.setEnabled(show);
        if (show) {
          up(0); up(1);
          const key = p.boardKind === 'sub' ? 'sub' + p.boardOut + '-' + p.boardIn : 'add' + p.boardText;
          if (key !== this.boardKey) {
            this.boardKey = key; const c = this.boardTex.getContext();
            c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#0b0d14'; c.fillRect(0, 0, 256, 160); c.textAlign = 'center'; c.textBaseline = 'middle';
            // düzlemin ön yüzü -z'ye bakar; sahadan (+z) bakıldığında yazı aynalanır → x ekseninde çevirerek çiz
            c.save(); c.translate(256, 0); c.scale(-1, 1);
            if (p.boardKind === 'sub') {
              c.font = 'bold 92px Arial'; c.fillStyle = '#ff3b3b'; c.fillText(String(p.boardOut), 64, 80); c.fillStyle = '#39d353'; c.fillText(String(p.boardIn), 192, 80);
              c.fillStyle = '#ffffff'; c.fillRect(126, 20, 4, 120);
            } else { c.font = 'bold 120px Arial'; c.fillStyle = '#ffd400'; c.fillText(p.boardText, 128, 82); }
            c.restore();
            this.boardTex.update();
          }
        }
      }
    }

    dispose() { this.root.dispose(false, true); this.shirtMat.dispose(true, true); this.dead = true; }
  }

  FS.PlayerView = PlayerView;
})(typeof window !== 'undefined' ? window : globalThis);
