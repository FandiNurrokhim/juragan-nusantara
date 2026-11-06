// 👹 Monster raksasa mode Normal: model organik (tabung meruncing halus, bukan kotak), bar HP,
// animasi muncul, mengaum, kena serang, mati, dan semburan energi ke petak yang diamuk.
import * as THREE from 'three';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const SKIN = new THREE.Color('#2f3b36'), BELLY = new THREE.Color('#6f6a52');

// Tabung halus mengikuti kurva dengan jari-jari berubah. Sisi depan (+z) diberi warna perut yang lebih terang.
function taperTube(pts, radius, { segs = 40, radial = 20, belly = 0.6, squash = 1 } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => v3(...p)));
  const fr = curve.computeFrenetFrames(segs, false);
  const pos = [], col = [], uv = [], idx = [], c = new THREE.Color(), dir = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, ctr = curve.getPointAt(t), r = radius(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      dir.copy(fr.normals[i]).multiplyScalar(Math.cos(a) * squash).addScaledVector(fr.binormals[i], Math.sin(a));
      pos.push(ctr.x + dir.x * r, ctr.y + dir.y * r, ctr.z + dir.z * r);
      c.copy(SKIN).lerp(BELLY, Math.max(0, dir.z) * belly);
      col.push(c.r, c.g, c.b);
      uv.push(t * 3, j / radial);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// Tekstur sisik untuk bumpMap
function scaleTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); g.fillStyle = '#777'; g.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 420; k++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 4 + Math.random() * 9, s = 110 + Math.random() * 130;
    g.fillStyle = `rgb(${s},${s},${s})`; g.beginPath(); g.ellipse(x, y, r, r * 0.75, Math.random() * 3, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 4);
  return t;
}
// Lempeng punggung bergerigi
function plateGeo() {
  const s = new THREE.Shape();
  s.moveTo(-0.42, 0); s.quadraticCurveTo(-0.34, 0.34, -0.14, 0.42); s.lineTo(-0.18, 0.62); s.quadraticCurveTo(-0.04, 0.72, 0, 1);
  s.quadraticCurveTo(0.04, 0.72, 0.18, 0.62); s.lineTo(0.14, 0.42); s.quadraticCurveTo(0.34, 0.34, 0.42, 0); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -0.025); g.rotateY(Math.PI / 2);
  return g;
}

function buildModel() {
  const root = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.05, bumpMap: scaleTexture(), bumpScale: 0.05, emissive: '#ff2a1a', emissiveIntensity: 0 });
  const plateM = new THREE.MeshStandardMaterial({ color: '#c9d6d8', roughness: 0.45, emissive: '#25b8ff', emissiveIntensity: 0.55 });
  const bone = new THREE.MeshStandardMaterial({ color: '#efe8d2', roughness: 0.4 });
  const eyeM = new THREE.MeshStandardMaterial({ color: '#ffd23a', emissive: '#ff9a1a', emissiveIntensity: 1.6 });
  const mouthM = new THREE.MeshStandardMaterial({ color: '#5a0f12', emissive: '#25b8ff', emissiveIntensity: 0.1, roughness: 0.6 });
  const part = (geo, mat = skin, parent = root) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; parent.add(m); return m; };

  // Badan dari leher sampai pinggul
  const bodyR = t => 0.36 + 0.42 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.62) * (1 - t * 0.12) - (t > 0.97 ? (t - 0.97) * 14 : 0);
  part(taperTube([[0, 3.7, 0.52], [0, 3.2, 0.36], [0, 2.5, 0.14], [0, 1.9, -0.1], [0, 1.45, -0.36]], bodyR, { segs: 44, radial: 26 }));
  // Ekor (grup sendiri supaya bisa berayun)
  const tail = new THREE.Group(); tail.position.set(0, 1.55, -0.45); root.add(tail);
  part(taperTube([[0, 0.05, 0.1], [0, -0.4, -0.75], [0.25, -0.95, -1.55], [0.85, -1.25, -2.3], [1.65, -1.34, -2.75], [2.5, -1.3, -2.95]], t => 0.62 * Math.pow(1 - t, 0.85) + 0.012, { segs: 52, radial: 20, belly: 0.3 }), skin, tail);
  // Kaki
  for (const sd of [-1, 1]) {
    part(taperTube([[sd * 0.5, 1.75, -0.12], [sd * 0.78, 1.15, 0.12], [sd * 0.76, 0.6, -0.02], [sd * 0.74, 0.18, 0.04]], t => 0.44 - t * 0.14, { radial: 22 }));
    part(taperTube([[sd * 0.74, 0.2, -0.18], [sd * 0.75, 0.15, 0.3], [sd * 0.78, 0.1, 0.72]], t => (t < 0.08 ? 0.05 + t * 3 : 0.3 - t * 0.17), { segs: 18, radial: 18, squash: 0.6 }));
    for (const dx of [-0.17, 0, 0.17]) { const cl = part(new THREE.ConeGeometry(0.06, 0.2, 10), bone); cl.position.set(sd * 0.78 + dx, 0.07, 0.82); cl.rotation.x = Math.PI / 2; }
  }
  // Lengan kecil dengan cakar
  for (const sd of [-1, 1]) {
    part(taperTube([[sd * 0.62, 3.0, 0.42], [sd * 0.98, 2.62, 0.68], [sd * 0.88, 2.26, 1.02]], t => 0.24 - t * 0.12, { segs: 22, radial: 14 }));
    for (const a of [-0.35, 0, 0.35]) { const cl = part(new THREE.ConeGeometry(0.035, 0.17, 8), bone); cl.position.set(sd * 0.88 + a * 0.2, 2.17, 1.1); cl.rotation.x = Math.PI * 0.8; }
  }
  // Kepala: tengkorak, rahang yang bisa membuka, gigi, mata menyala
  const head = new THREE.Group(); head.position.set(0, 3.78, 0.6); root.add(head);
  part(taperTube([[0, -0.12, -0.28], [0, 0.1, 0.12], [0, 0.12, 0.55], [0, 0.03, 0.95], [0, -0.04, 1.2]], t => (t > 0.94 ? 0.2 - (t - 0.94) * 3 : 0.44 - t * 0.24), { segs: 30, radial: 22, squash: 1.12, belly: 0.15 }), skin, head);
  for (const sd of [-1, 1]) {
    part(taperTube([[sd * 0.25, 0.38, 0.1], [sd * 0.27, 0.36, 0.42], [sd * 0.18, 0.24, 0.72]], t => 0.09 - t * 0.05, { segs: 12, radial: 10, belly: 0 }), skin, head); // alis
    const eye = part(new THREE.SphereGeometry(0.075, 16, 12), eyeM, head); eye.position.set(sd * 0.27, 0.26, 0.5); eye.castShadow = false;
    const pupil = part(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: '#120a05' }), head); pupil.position.set(sd * 0.31, 0.27, 0.56);
  }
  const jaw = new THREE.Group(); jaw.position.set(0, -0.18, 0.05); head.add(jaw);
  part(taperTube([[0, -0.02, -0.12], [0, -0.12, 0.35], [0, -0.08, 0.8], [0, -0.03, 1.02]], t => (t > 0.92 ? 0.14 - (t - 0.92) * 1.6 : 0.3 - t * 0.17), { segs: 22, radial: 18, squash: 1.05, belly: 0.5 }), skin, jaw);
  const tongue = part(new THREE.SphereGeometry(0.2, 14, 10), mouthM, jaw); tongue.scale.set(0.9, 0.22, 2.1); tongue.position.set(0, 0.03, 0.42); tongue.castShadow = false;
  const toothG = new THREE.ConeGeometry(0.032, 0.13, 8);
  for (let k = 0; k < 8; k++) for (const sd of [-1, 1]) {
    const z = 0.28 + k * 0.1, w = 0.24 - k * 0.018;
    const up = part(toothG, bone, head); up.position.set(sd * w, -0.15, z); up.rotation.x = Math.PI;
    const dn = part(toothG, bone, jaw); dn.position.set(sd * (w - 0.03), 0.04, z - 0.04);
  }
  // Lempeng punggung: tiga baris mengikuti leher, badan, dan ekor
  const pg = plateGeo(), plates = [];
  const addPlate = (x, y, z, s, tilt, parent, lean = 0) => { const m = part(pg, plateM, parent); m.position.set(x, y, z); m.scale.setScalar(s); m.rotation.set(tilt, 0, lean); plates.push(m); };
  [[3.72, 0.1, 0.42], [3.34, 0.0, 0.58], [2.94, -0.2, 0.74], [2.52, -0.46, 0.86], [2.1, -0.72, 0.8], [1.7, -0.98, 0.7]].forEach(([y, z, s]) => {
    addPlate(0, y, z, s, -0.45, root);
    for (const sd of [-1, 1]) addPlate(sd * 0.26, y - 0.08, z + 0.1, s * 0.62, -0.45, root, -sd * 0.28);
  });
  [[-0.15, -0.72, 0.62, 0], [-0.55, -1.2, 0.5, 0.05], [-0.92, -1.72, 0.4, 0.2], [-1.15, -2.2, 0.3, 0.6], [-1.22, -2.58, 0.22, 1.25]].forEach(([y, z, s, x]) => addPlate(x, y, z, s, -0.9, tail));
  root.userData = { head, jaw, tail, skin, plateM, eyeM, mouthM };
  return root;
}

// Bar HP mengambang di atas kepala
function hpSprite() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 116;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.renderOrder = 20; sp.scale.set(2.7, 0.61, 1);
  sp.userData.draw = (hp, maxHp) => {
    const g = c.getContext('2d'), p = Math.max(0, hp / maxHp); g.clearRect(0, 0, 512, 116);
    const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
    g.fillStyle = 'rgba(20,18,22,.92)'; rr(4, 4, 504, 108, 22); g.fill();
    g.fillStyle = '#fff'; g.font = '800 34px system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText('👹 MONSTER', 22, 34);
    g.textAlign = 'right'; g.fillText(`${Math.max(0, Math.ceil(hp))} / ${maxHp}`, 490, 34);
    g.fillStyle = '#3a3a42'; rr(20, 62, 472, 34, 12); g.fill();
    if (p > 0) { g.fillStyle = p > 0.5 ? '#35c46a' : p > 0.25 ? '#f2b21f' : '#e8392b'; rr(20, 62, Math.max(24, 472 * p), 34, 12); g.fill(); }
    tex.needsUpdate = true;
  };
  return sp;
}

const SCALE = 1.12, RISE_MS = 2400, GONE_MS = 2200;
export function createKaiju(scene, pos, shake) {
  let model = null, hpBar = null, state = 'none', t0 = 0, roarAt = -1e9, hitAt = -1e9, lastSeq = null, shownHp = 0, targetHp = 0, maxHp = 1, beam = null;
  const ensure = () => {
    if (model) return;
    model = buildModel(); model.position.copy(pos); model.scale.setScalar(SCALE); model.visible = false; scene.add(model);
    hpBar = hpSprite(); hpBar.position.set(pos.x, pos.y + 5.75, pos.z); hpBar.visible = false; scene.add(hpBar);
  };
  function fire(target) {
    if (beam) { scene.remove(beam.m); beam.m.geometry.dispose(); beam.m.material.dispose(); beam = null; }
    const from = new THREE.Vector3(0, -0.05, 1.05); model.userData.head.localToWorld(from);
    const dir = target.clone().sub(from), len = dir.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.09, len, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#7fe2ff', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(from).addScaledVector(dir, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    scene.add(m); beam = { m, t0: performance.now() };
  }
  return {
    // st: S.kaiju (atau null), fx: S.kaijuFx { seq, kind, tile }, pointOf: titik tengah petak
    sync(st, fx, pointOf) {
      const now = performance.now(), fresh = lastSeq === null;
      if (st) {
        ensure(); targetHp = st.hp; maxHp = st.maxHp;
        if (state === 'none' || state === 'gone') { state = 'rise'; t0 = fresh ? now - RISE_MS : now; shownHp = st.hp; model.visible = hpBar.visible = true; hpBar.userData.draw(shownHp, maxHp); if (!fresh) { roarAt = now; shake(1600); } }
      } else if (model && (state === 'rise' || state === 'live')) { state = 'gone'; t0 = now; hpBar.visible = false; targetHp = 0; }
      if (fx && fx.seq !== lastSeq) {
        if (!fresh && model) {
          if (fx.kind === 'hit' || fx.kind === 'die') { hitAt = now; roarAt = now; shake(500); }
          if (fx.kind === 'miss') roarAt = now;
          if (fx.kind === 'stomp') { roarAt = now; shake(700); if (fx.tile != null) fire(pointOf(fx.tile)); }
        }
        lastSeq = fx.seq;
      } else if (lastSeq === null) lastSeq = 0;
    },
    update(now) {
      if (!model || state === 'none') return;
      const { head, jaw, tail, skin, plateM, eyeM, mouthM } = model.userData, sec = now / 1000;
      let y = 0;
      if (state === 'rise') { const k = Math.min(1, (now - t0) / RISE_MS); y = -7.5 * Math.pow(1 - k, 3); if (k >= 1) state = 'live'; }
      if (state === 'gone') { const k = (now - t0) / GONE_MS; y = -8 * k * k; model.rotation.x = 0.2 * k; if (k >= 1) { state = 'none'; model.visible = false; model.rotation.x = 0; return; } }
      model.position.y = pos.y + y;
      // napas dan ayunan
      const roar = Math.max(0, 1 - (now - roarAt) / 1300), r = Math.sin(Math.min(1, roar * 1.6) * Math.PI / 2);
      model.scale.set(SCALE * (1 + Math.sin(sec * 1.6) * 0.012), SCALE * (1 + Math.sin(sec * 1.6 + 1) * 0.008), SCALE);
      model.rotation.y = Math.sin(sec * 0.45) * 0.12;
      tail.rotation.y = Math.sin(sec * 1.1) * 0.22; tail.rotation.x = Math.sin(sec * 0.8) * 0.03;
      head.rotation.y = Math.sin(sec * 0.7) * 0.2; head.rotation.x = -0.38 - r * 0.32 + Math.sin(sec * 1.3) * 0.03; // menengadah ke arah kamera
      jaw.rotation.x = 0.08 + r * 0.62 + Math.max(0, Math.sin(sec * 0.9) - 0.92) * 2;
      plateM.emissiveIntensity = 0.5 + 0.2 * Math.sin(sec * 2.4) + r * 1.9;
      mouthM.emissiveIntensity = 0.1 + r * 2.4;
      eyeM.emissiveIntensity = 1.5 + r * 2;
      skin.emissiveIntensity = Math.max(0, 1 - (now - hitAt) / 450) * 0.9;
      if (hpBar.visible && Math.abs(shownHp - targetHp) > 0.5) { shownHp += (targetHp - shownHp) * 0.12; hpBar.userData.draw(shownHp, maxHp); }
      else if (hpBar.visible && shownHp !== targetHp) { shownHp = targetHp; hpBar.userData.draw(shownHp, maxHp); }
      if (beam) {
        const k = (now - beam.t0) / 850;
        beam.m.material.opacity = 0.9 * Math.max(0, 1 - k); beam.m.scale.x = beam.m.scale.z = 1 + Math.sin(sec * 40) * 0.2;
        if (k >= 1) { scene.remove(beam.m); beam.m.geometry.dispose(); beam.m.material.dispose(); beam = null; }
      }
    }
  };
}

// 🛑 Palang berhenti Polisi: dua tiang dan palang merah-putih yang turun saat Polisi berdiri di propertinya.
export function barrierModel(width) {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: '#d9261c', roughness: 0.4 }), white = new THREE.MeshStandardMaterial({ color: '#f6f3ea', roughness: 0.4 });
  const lamp = new THREE.MeshStandardMaterial({ color: '#ff3b2f', emissive: '#ff1e12', emissiveIntensity: 1.4 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const L = width * 0.9;
  add(new THREE.CylinderGeometry(0.04, 0.05, 0.55, 12), white, -L / 2, 0.275, 0);
  add(new THREE.CylinderGeometry(0.04, 0.05, 0.42, 12), white, L / 2, 0.21, 0);
  add(new THREE.SphereGeometry(0.06, 12, 10), lamp, -L / 2, 0.6, 0);
  // palang berputar di tiang kiri
  const arm = new THREE.Group(); arm.position.set(-L / 2, 0.42, 0); g.add(arm);
  const n = 7;
  for (let k = 0; k < n; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(L / n, 0.075, 0.05), k % 2 ? white : red); s.position.x = (k + 0.5) * L / n; s.castShadow = true; arm.add(s); }
  // rambu STOP di tengah palang
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#d9261c'; x.beginPath(); for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; x.lineTo(64 + 60 * Math.cos(a), 64 + 60 * Math.sin(a)); } x.closePath(); x.fill();
  x.lineWidth = 6; x.strokeStyle = '#fff'; x.stroke(); x.fillStyle = '#fff'; x.font = '900 40px Arial Black, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('STOP', 64, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.CircleGeometry(0.17, 8), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide })); sign.position.set(L / 2, 0, 0.04); arm.add(sign);
  g.userData = { arm, lamp, t0: performance.now() };
  return g;
}
export function updateBarrier(g, now) {
  const { arm, lamp, t0 } = g.userData, k = Math.min(1, (now - t0) / 500);
  arm.rotation.z = (1 - k) * (1 - k) * 1.3; // turun dari posisi terangkat
  lamp.emissiveIntensity = Math.floor(now / 350) % 2 ? 0.2 : 1.8;
}
