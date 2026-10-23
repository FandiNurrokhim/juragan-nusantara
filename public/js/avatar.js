// Karakter avatar 3D: wajah dari foto pemain, baju, topi, aksesoris, dan warna pilihan.
// Dipakai di papan permainan dan di pratinjau editor avatar.
import * as THREE from 'three';

const geoCache = new Map();
const G = (key, make) => { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); };
const std = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, ...extra });
const GOLD = () => std('#e2b33c', { metalness: 0.75, roughness: 0.3 });

const shade = (hex, f) => {
  const c = new THREE.Color(hex);
  return '#' + c.multiplyScalar(f).getHexString();
};

/* ---------- Tekstur kanvas ---------- */
const texCache = new Map();
function canvasTex(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
// Motif kawung sederhana di atas warna dasar baju.
function batikTex(base, ink) {
  return canvasTex('batik' + base + ink, 256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 5;
    const s = 64;
    for (let y = 0; y <= h; y += s) for (let x = 0; x <= w; x += s) {
      for (let k = 0; k < 4; k++) {
        g.save(); g.translate(x, y); g.rotate(k * Math.PI / 2 + Math.PI / 4);
        g.beginPath(); g.ellipse(0, -s * 0.26, s * 0.13, s * 0.24, 0, 0, Math.PI * 2); g.stroke();
        g.restore();
      }
      g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(x + s / 2, y + s / 2, 7, 0, Math.PI * 2); g.fill();
    }
  });
}
function laceTex(base) {
  return canvasTex('lace' + base, 128, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.45)';
    for (let y = 8; y < h; y += 16) for (let x = (y / 16 % 2) * 8 + 4; x < w; x += 16) {
      g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill();
    }
  });
}
// Wajah bawaan kalau pemain belum mengunggah foto.
function defaultFace(skin) {
  return canvasTex('face' + skin, 256, 256, (g, w, h) => {
    g.fillStyle = skin; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a1d16';
    [[92, 118], [164, 118]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x, y, 13, 17, 0, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = '#fff';
    [[96, 111], [168, 111]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); });
    g.strokeStyle = '#2a1d16'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(72, 86); g.quadraticCurveTo(92, 76, 110, 84); g.stroke();
    g.beginPath(); g.moveTo(146, 84); g.quadraticCurveTo(164, 76, 184, 86); g.stroke();
    g.lineWidth = 8;
    g.beginPath(); g.arc(128, 150, 34, 0.18 * Math.PI, 0.82 * Math.PI); g.stroke();
    g.fillStyle = 'rgba(230,90,90,.28)';
    [[70, 160], [186, 160]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x, y, 20, 12, 0, 0, Math.PI * 2); g.fill(); });
  });
}

const photoCache = new Map();
const loader = new THREE.TextureLoader();
export function photoTexture(url) {
  if (!photoCache.has(url)) {
    const t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    photoCache.set(url, t);
  }
  return photoCache.get(url);
}

/* ---------- Geometri ---------- */
const HEAD_R = 0.3, HEAD_Y = 1.32, CAP = 0.98;
// Tutup bola di depan kepala dengan UV datar, supaya foto menempel melengkung di wajah.
function faceGeometry() {
  return G('face', () => {
    const r = HEAD_R + 0.004;
    const g = new THREE.SphereGeometry(r, 40, 20, 0, Math.PI * 2, 0, CAP);
    g.rotateX(Math.PI / 2);
    const pos = g.attributes.position, uv = g.attributes.uv, span = 2 * r * Math.sin(CAP);
    for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / span, 0.5 + pos.getY(i) / span);
    uv.needsUpdate = true;
    return g;
  });
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/**
 * Bangun avatar. spec = { color, look:{model,kulit,baju,topi,aksesoris}, photoUrl }
 * Tinggi kira-kira 1,9 satuan, alas di y = 0, menghadap +z.
 */
export function buildAvatar(spec) {
  const look = spec.look || {};
  const color = spec.color || '#e04848';
  const model = look.model || 'manusia';
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  root.userData.body = body;
  // Alas bidak
  body.add(mesh(G('base', () => new THREE.CylinderGeometry(0.42, 0.47, 0.1, 36)), std(color, { roughness: 0.4 }), 0, 0.05, 0));
  body.add(mesh(G('baseRim', () => new THREE.TorusGeometry(0.43, 0.025, 8, 40)), std('#f7f5ef'), 0, 0.1, 0)).children.at(-1).rotation.x = Math.PI / 2;
  if (CREATURES[model]) {
    const anchor = CREATURES[model](body, color, spec.photoUrl);
    if (anchor) addHeadwear(anchor, look.topi, color);
  } else buildHuman(root, body, spec, look, color, model === 'kepalasawit' ? 'sawit' : model === 'pejabat' ? 'gendut' : null);
  root.traverse(o => { if (o.isMesh) o.receiveShadow = false; });
  return root;
}

// variant: null (biasa), 'sawit' (kepala tandan sawit), 'gendut' (pejabat berperut buncit)
function buildHuman(root, body, spec, look, color, variant) {
  const fat = variant === 'gendut';
  const skin = look.kulit || '#e9b98f';
  const cloth = std(color);
  const skinM = std(skin, { roughness: 0.7 });
  const pants = std('#2b2f45');
  const shoe = std('#1d1d22');
  const white = std('#f7f5ef');

  const baju = look.baju || 'kaos';
  // Kaki + sepatu (kebaya memakai kain panjang)
  if (baju === 'kebaya') {
    const kain = batikTex('#7a4a22', '#e8c27a');
    body.add(mesh(G('skirt', () => new THREE.CylinderGeometry(0.2, 0.3, 0.44, 28)), std('#fff', { map: kain }), 0, 0.32, 0));
  } else {
    for (const s of [-1, 1]) {
      const lx = s * (fat ? 0.15 : 0.11);
      body.add(mesh(G('leg', () => new THREE.CylinderGeometry(0.085, 0.09, 0.36, 14)), pants, lx, 0.3, 0));
      const sh = mesh(G('shoe', () => new THREE.SphereGeometry(0.1, 14, 10)), shoe, lx, 0.13, 0.04);
      sh.scale.set(1, 0.55, 1.4); body.add(sh);
    }
  }

  // Badan
  let torsoMat = cloth, sleeveMat = cloth, longSleeve = true;
  if (baju === 'kaos') longSleeve = false;
  if (baju === 'batik') torsoMat = sleeveMat = std('#fff', { map: batikTex(color, shade(color, 0.45)) });
  if (baju === 'kebaya') torsoMat = sleeveMat = std('#fff', { map: laceTex(color) });
  if (fat) {
    // perut buncit + ikat pinggang
    const belly = mesh(G('belly', () => new THREE.SphereGeometry(0.4, 32, 22)), torsoMat, 0, 0.72, 0.02);
    belly.scale.set(1, 0.95, 0.95); body.add(belly);
    const belt = mesh(G('belt', () => new THREE.TorusGeometry(0.375, 0.035, 8, 36)), std('#1d1d22'), 0, 0.48, 0.02);
    belt.rotation.x = Math.PI / 2; belt.scale.set(1, 0.95, 1); body.add(belt);
    body.add(mesh(G('buckle', () => new THREE.BoxGeometry(0.1, 0.07, 0.03)), GOLD(), 0, 0.48, 0.38));
  } else {
    const torso = mesh(G('torso', () => new THREE.CylinderGeometry(0.235, 0.29, 0.56, 28)), torsoMat, 0, 0.74, 0);
    body.add(torso);
    body.add(mesh(G('shoulder', () => new THREE.SphereGeometry(0.235, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2)), torsoMat, 0, 1.0, 0)).children.at(-1).scale.y = 0.35;
  }

  // Lengan
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * (fat ? 0.38 : 0.29), fat ? 0.96 : 0.98, 0);
    arm.rotation.z = s * (fat ? 0.5 : 0.22);
    const sleeveGeo = longSleeve
      ? G('sleeveLong', () => new THREE.CylinderGeometry(0.07, 0.075, 0.42, 14))
      : G('sleeveShort', () => new THREE.CylinderGeometry(0.078, 0.08, 0.18, 14));
    arm.add(mesh(sleeveGeo, sleeveMat, 0, longSleeve ? -0.21 : -0.09, 0));
    if (!longSleeve) arm.add(mesh(G('forearm', () => new THREE.CylinderGeometry(0.058, 0.062, 0.26, 12)), skinM, 0, -0.3, 0));
    arm.add(mesh(G('hand', () => new THREE.SphereGeometry(0.072, 14, 10)), skinM, 0, -0.46, 0));
    arm.userData.side = s;
    body.add(arm);
    if (s === 1) root.userData.rightArm = arm;
  }

  // Detail baju (grup ini melebar mengikuti perut pejabat)
  const front = new THREE.Group();
  if (fat) front.scale.set(1.42, 1, 1.42);
  body.add(front);
  if (baju === 'kemeja' || baju === 'batik') {
    const collar = mesh(G('collar', () => new THREE.TorusGeometry(0.115, 0.032, 8, 24)), baju === 'kemeja' ? white : std(shade(color, 0.45)), 0, 1.03, 0);
    collar.rotation.x = Math.PI / 2; front.add(collar);
    if (baju === 'kemeja') for (let k = 0; k < 3; k++) front.add(mesh(G('button', () => new THREE.SphereGeometry(0.018, 8, 6)), white, 0, 0.92 - k * 0.14, 0.26 + k * 0.008));
  }
  if (baju === 'jas') {
    const shirt = mesh(G('shirtV', () => new THREE.CylinderGeometry(0.0, 0.1, 0.3, 3)), white, 0, 0.86, 0.225);
    shirt.rotation.x = Math.PI; shirt.scale.set(1, 1, 0.25); front.add(shirt);
    const tie = mesh(G('tie', () => new THREE.BoxGeometry(0.05, 0.26, 0.02)), std('#1f2340'), 0, 0.84, 0.262);
    front.add(tie);
    for (const s of [-1, 1]) {
      const lapel = mesh(G('lapel', () => new THREE.BoxGeometry(0.05, 0.3, 0.02)), std(shade(color, 0.7)), s * 0.085, 0.87, 0.25);
      lapel.rotation.z = s * 0.35; front.add(lapel);
    }
  }
  if (baju === 'hoodie') {
    const hood = mesh(G('hood', () => new THREE.TorusGeometry(0.17, 0.075, 10, 24)), std(shade(color, 0.85)), 0, 1.06, -0.1);
    hood.rotation.x = Math.PI / 2 - 0.5; front.add(hood);
    const pocket = mesh(G('pocket', () => new THREE.BoxGeometry(0.28, 0.12, 0.03)), std(shade(color, 0.85)), 0, 0.6, 0.27);
    pocket.rotation.x = -0.1; front.add(pocket);
    for (const s of [-1, 1]) front.add(mesh(G('string', () => new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6)), white, s * 0.05, 0.94, 0.25));
  }
  if (baju === 'kebaya') {
    const sash = mesh(G('sash', () => new THREE.TorusGeometry(0.27, 0.035, 8, 30)), std('#e8c27a', { metalness: 0.3 }), 0, 0.56, 0);
    sash.rotation.x = Math.PI / 2; front.add(sash);
    for (let k = 0; k < 3; k++) front.add(mesh(G('bros', () => new THREE.SphereGeometry(0.025, 10, 8)), GOLD(), 0, 0.95 - k * 0.12, 0.25 + k * 0.01));
  }

  // Leher + kepala
  body.add(mesh(G('neck', () => new THREE.CylinderGeometry(0.08, 0.085, 0.1, 12)), skinM, 0, fat ? 1.1 : 1.06, 0));
  if (fat) body.add(mesh(G('pin', () => new THREE.CylinderGeometry(0.045, 0.045, 0.015, 16)), GOLD(), -0.2, 0.95, 0.31)).children.at(-1).rotation.x = Math.PI / 2 - 0.5;
  const head = new THREE.Group();
  head.position.y = fat ? 1.4 : HEAD_Y;
  body.add(head);
  root.userData.head = head;
  if (variant === 'sawit') addSawitHead(head, spec.photoUrl);
  else {
    head.add(mesh(G('head', () => new THREE.SphereGeometry(HEAD_R, 36, 24)), skinM));
    const faceMat = new THREE.MeshStandardMaterial({ map: spec.photoUrl ? photoTexture(spec.photoUrl) : defaultFace(skin), roughness: 0.75 });
    const face = mesh(faceGeometry(), faceMat); face.castShadow = false; head.add(face);
    for (const s of [-1, 1]) head.add(mesh(G('ear', () => new THREE.SphereGeometry(0.06, 12, 10)), skinM, s * 0.3, 0, -0.02));
    // Rambut di atas & belakang kepala, tidak menutupi wajah
    addHair(head, look.rambut || 'pendek');
  }

  addHeadwear(head, look.topi, color);
  addAccessory(front, head, root, look.aksesoris);
}

/* ---------- Model selain manusia ---------- */
// Kepala tandan buah sawit: butir merah-oranye di sekeliling kepala, wajah (foto) di depan, pelepah di atas.
function addSawitHead(head, photoUrl) {
  head.add(mesh(G('head', () => new THREE.SphereGeometry(HEAD_R, 36, 24)), std('#5a1a0e', { roughness: 0.8 })));
  const face = mesh(faceGeometry(), new THREE.MeshStandardMaterial({ map: photoUrl ? photoTexture(photoUrl) : defaultFace('#e8762a'), roughness: 0.75 }));
  face.castShadow = false; head.add(face);
  const N = 70, fruits = new THREE.InstancedMesh(G('fruit', () => new THREE.SphereGeometry(0.06, 10, 8)), new THREE.MeshStandardMaterial({ roughness: 0.45 }), N);
  const m = new THREE.Matrix4(), c = new THREE.Color(), palette = ['#c8341c', '#e2591d', '#f08c1a', '#8f1f12'];
  let n = 0;
  for (let k = 0; k < N * 2 && n < N; k++) {
    const y = 1 - (k + 0.5) / N, r = Math.sqrt(1 - y * y), a = k * 2.39996;
    const v = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    if (v.z > 0.5 || y < -0.75) continue; // sisakan wajah dan leher
    m.makeTranslation(v.x * (HEAD_R + 0.02), v.y * (HEAD_R + 0.02), v.z * (HEAD_R + 0.02));
    fruits.setMatrixAt(n, m); fruits.setColorAt(n, c.set(palette[n % palette.length])); n++;
  }
  fruits.count = n; fruits.castShadow = true; head.add(fruits);
  const leafM = std('#2f8f3a', { roughness: 0.7 });
  for (let k = 0; k < 6; k++) {
    const leaf = mesh(G('frond', () => new THREE.ConeGeometry(0.06, 0.55, 4)), leafM);
    const a = k / 6 * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.12, HEAD_R + 0.15, Math.sin(a) * 0.12 - 0.04);
    leaf.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
    head.add(leaf);
  }
}
// Medali foto (untuk hewan) atau kaca depan berfoto (untuk kendaraan).
function photoBadge(url, r) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshStandardMaterial({ map: photoTexture(url), roughness: 0.7 })));
  g.add(mesh(G('badgeRing' + r, () => new THREE.TorusGeometry(r, 0.018, 8, 32)), std('#f7f5ef')));
  return g;
}
function windowPane(url, w, h) {
  return mesh(new THREE.PlaneGeometry(w, h), url ? new THREE.MeshStandardMaterial({ map: photoTexture(url), roughness: 0.4 }) : std('#2a3b4f', { roughness: 0.15, metalness: 0.4 }));
}
// Kepala hewan/atap kendaraan untuk topi: grup yang diposisikan & diskalakan seperti kepala manusia (r 0,3).
function hatAnchor(parent, x, y, z, scale) {
  const a = new THREE.Group(); a.position.set(x, y, z); a.scale.setScalar(scale); parent.add(a); return a;
}
const eye = (parent, x, y, z, r) => {
  parent.add(mesh(G('eye' + r, () => new THREE.SphereGeometry(r, 12, 10)), std('#111', { roughness: 0.2 }), x, y, z));
  parent.add(mesh(G('glint' + r, () => new THREE.SphereGeometry(r * 0.35, 8, 6)), std('#fff'), x + r * 0.3, y + r * 0.35, z + r * 0.75));
};

// Kepala berfoto ala manusia untuk tuyul & pocong.
function photoHead(head, photoUrl, skinHex, faceHex) {
  head.add(mesh(G('head', () => new THREE.SphereGeometry(HEAD_R, 36, 24)), std(skinHex, { roughness: 0.75 })));
  const face = mesh(faceGeometry(), new THREE.MeshStandardMaterial({ map: photoUrl ? photoTexture(photoUrl) : defaultFace(faceHex || skinHex), roughness: 0.75 }));
  face.castShadow = false; head.add(face);
}

const CREATURES = {
  monster(body, color, photo) {
    const hide = std(color, { roughness: 0.55 }), belly = std(shade(color, 1.3)), bone = std('#f3e6c8'), dark = std('#1d1d22');
    const blob = mesh(G('blob', () => new THREE.SphereGeometry(0.4, 32, 22)), hide, 0, 0.55, 0); blob.scale.set(1, 1.1, 0.95); body.add(blob);
    const tummy = mesh(G('tummy', () => new THREE.SphereGeometry(0.26, 24, 16)), belly, 0, 0.42, 0.18); tummy.scale.set(1, 0.9, 0.7); body.add(tummy);
    [[0.3, 0.7, 0.12], [-0.28, 0.5, 0.18], [0.12, 0.88, -0.25], [-0.2, 0.82, 0.22]].forEach(([x, y, z]) =>
      body.add(mesh(G('spot', () => new THREE.SphereGeometry(0.06, 10, 8)), std(shade(color, 0.6)), x, y, z)));
    body.add(mesh(G('bigEye', () => new THREE.SphereGeometry(0.16, 24, 16)), std('#ffffff', { roughness: 0.2 }), 0, 0.8, 0.27));
    body.add(mesh(G('iris', () => new THREE.SphereGeometry(0.085, 16, 12)), std('#f2b705', { roughness: 0.3 }), 0, 0.8, 0.39));
    body.add(mesh(G('pupil', () => new THREE.SphereGeometry(0.045, 12, 10)), dark, 0, 0.8, 0.455));
    body.add(mesh(G('mouth', () => new THREE.BoxGeometry(0.34, 0.07, 0.05)), dark, 0, 0.5, 0.36));
    for (const x of [-0.11, 0, 0.11]) { const t = mesh(G('tooth', () => new THREE.ConeGeometry(0.03, 0.07, 6)), bone, x, 0.47, 0.385); t.rotation.x = Math.PI; body.add(t); }
    for (const sd of [-1, 1]) {
      const horn = mesh(G('horn', () => new THREE.ConeGeometry(0.06, 0.24, 10)), bone, sd * 0.2, 1.02, 0); horn.rotation.z = -sd * 0.4; body.add(horn);
      const arm = mesh(G('mArm', () => new THREE.SphereGeometry(0.09, 12, 10)), hide, sd * 0.42, 0.55, 0.05); arm.scale.set(0.8, 1.4, 0.8); arm.rotation.z = sd * 0.5; body.add(arm);
      const foot = mesh(G('mFoot', () => new THREE.SphereGeometry(0.1, 12, 10)), hide, sd * 0.17, 0.14, 0.12); foot.scale.set(1, 0.5, 1.3); body.add(foot);
    }
    if (photo) { const b = photoBadge(photo, 0.1); b.position.set(0.22, 0.32, 0.31); b.rotation.y = 0.5; body.add(b); }
    return hatAnchor(body, 0, 0.8, 0, 0.9);
  },
  tuyul(body, color, photo) {
    const skin = std('#c7b7a3', { roughness: 0.7 }), kolor = std(color);
    for (const sd of [-1, 1]) {
      body.add(mesh(G('tLeg', () => new THREE.CylinderGeometry(0.065, 0.07, 0.2, 10)), skin, sd * 0.1, 0.2, 0));
      body.add(mesh(G('tFoot', () => new THREE.SphereGeometry(0.075, 10, 8)), skin, sd * 0.1, 0.12, 0.04)).children.at(-1).scale.set(1, 0.5, 1.3);
    }
    body.add(mesh(G('kolor', () => new THREE.CylinderGeometry(0.2, 0.22, 0.16, 20)), kolor, 0, 0.36, 0));
    const torso = mesh(G('tTorso', () => new THREE.SphereGeometry(0.2, 20, 14)), skin, 0, 0.56, 0); torso.scale.set(1, 1.15, 0.9); body.add(torso);
    body.add(mesh(G('navel', () => new THREE.SphereGeometry(0.015, 8, 6)), std('#8a7560'), 0, 0.5, 0.18));
    for (const sd of [-1, 1]) {
      const arm = mesh(G('tArm', () => new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10)), skin, sd * 0.24, 0.55, 0.02); arm.rotation.z = sd * 0.5; body.add(arm);
    }
    const head = new THREE.Group(); head.position.set(0, 1.02, 0); head.scale.setScalar(1.15); body.add(head);
    photoHead(head, photo, '#c7b7a3', '#c7b7a3');
    for (const sd of [-1, 1]) { const ear = mesh(G('tEar', () => new THREE.ConeGeometry(0.06, 0.2, 8)), skin, sd * 0.31, 0.04, -0.02); ear.rotation.z = -sd * 1.2; head.add(ear); }
    return head;
  },
  pocong(body, color, photo) {
    const cloth = std('#f1efe6', { roughness: 0.95 }), tie = std(color);
    body.add(mesh(G('shroud', () => new THREE.CylinderGeometry(0.22, 0.26, 0.95, 24)), cloth, 0, 0.58, 0));
    body.add(mesh(G('shroudTop', () => new THREE.SphereGeometry(0.22, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2)), cloth, 0, 1.05, 0));
    for (const y of [0.25, 0.62]) { const r = mesh(G('fold', () => new THREE.TorusGeometry(0.245, 0.012, 6, 28)), std('#dcd8cb'), 0, y, 0); r.rotation.x = Math.PI / 2; body.add(r); }
    const head = new THREE.Group(); head.position.set(0, 1.22, 0); head.scale.setScalar(0.92); body.add(head);
    photoHead(head, photo, '#f1efe6', '#d9d4c7');
    // tali kafan sewarna pemain: kepala, leher, kaki
    const knot = mesh(G('knot', () => new THREE.SphereGeometry(0.06, 12, 10)), tie, 0, 0.36, 0); head.add(knot);
    const puff = mesh(G('puff', () => new THREE.ConeGeometry(0.08, 0.16, 10)), cloth, 0, 0.46, 0); head.add(puff);
    for (const [y, r] of [[1.02, 0.2], [0.18, 0.255]]) { const t = mesh(G('tie' + r, () => new THREE.TorusGeometry(r, 0.03, 8, 28)), tie, 0, y, 0); t.rotation.x = Math.PI / 2; body.add(t); }
    return head;
  },
  kucing(body, color, photo) {
    const fur = std(color), white = std('#fff4e6'), pink = std('#f19bb0');
    const torso = mesh(G('catBody', () => new THREE.SphereGeometry(0.3, 24, 16)), fur, 0, 0.45, -0.02); torso.scale.set(1, 0.85, 1.3); body.add(torso);
    for (const [x, z] of [[-0.15, 0.2], [0.15, 0.2], [-0.15, -0.24], [0.15, -0.24]]) {
      body.add(mesh(G('catLeg', () => new THREE.CylinderGeometry(0.06, 0.06, 0.3, 10)), fur, x, 0.25, z));
      body.add(mesh(G('paw', () => new THREE.SphereGeometry(0.07, 10, 8)), white, x, 0.12, z + 0.02));
    }
    const tail = mesh(G('catTail', () => new THREE.TorusGeometry(0.22, 0.05, 8, 20, Math.PI)), fur, 0, 0.55, -0.45);
    tail.rotation.y = Math.PI / 2; body.add(tail);
    const head = new THREE.Group(); head.position.set(0, 0.86, 0.26); body.add(head);
    head.add(mesh(G('catHead', () => new THREE.SphereGeometry(0.26, 24, 18)), fur));
    const muzzle = mesh(G('muzzle', () => new THREE.SphereGeometry(0.11, 16, 12)), white, 0, -0.07, 0.19); muzzle.scale.set(1.3, 0.8, 0.8); head.add(muzzle);
    head.add(mesh(G('catNose', () => new THREE.SphereGeometry(0.035, 10, 8)), pink, 0, -0.02, 0.28));
    eye(head, -0.1, 0.05, 0.2, 0.05); eye(head, 0.1, 0.05, 0.2, 0.05);
    for (const sd of [-1, 1]) {
      const ear = mesh(G('catEar', () => new THREE.ConeGeometry(0.09, 0.17, 4)), fur, sd * 0.14, 0.23, 0); ear.rotation.z = -sd * 0.3; head.add(ear);
      const inner = mesh(G('catEarIn', () => new THREE.ConeGeometry(0.05, 0.11, 4)), pink, sd * 0.14, 0.22, 0.04); inner.rotation.z = -sd * 0.3; head.add(inner);
      for (const t of [-0.12, 0.12]) { const w = mesh(G('whisker', () => new THREE.BoxGeometry(0.2, 0.006, 0.006)), std('#222'), sd * 0.17, -0.06, 0.2); w.rotation.z = sd * t; head.add(w); }
    }
    if (photo) { const b = photoBadge(photo, 0.12); b.position.set(0, 0.5, 0.39); body.add(b); }
    return hatAnchor(head, 0, 0.02, 0, 0.85);
  },
  komodo(body, color, photo) {
    const skin = std(color, { roughness: 0.85 }), belly = std(shade(color, 1.25), { roughness: 0.85 });
    const torso = mesh(G('komBody', () => new THREE.SphereGeometry(0.3, 24, 16)), skin, 0, 0.33, -0.05); torso.scale.set(0.85, 0.6, 1.55); body.add(torso);
    const under = mesh(G('komBody', () => new THREE.SphereGeometry(0.3, 24, 16)), belly, 0, 0.28, -0.05); under.scale.set(0.75, 0.45, 1.45); body.add(under);
    for (const [x, z] of [[-0.25, 0.22], [0.25, 0.22], [-0.25, -0.3], [0.25, -0.3]]) {
      const leg = mesh(G('komLeg', () => new THREE.CylinderGeometry(0.05, 0.06, 0.28, 10)), skin, x, 0.2, z); leg.rotation.z = Math.sign(x) * 0.7; body.add(leg);
    }
    const tail = mesh(G('komTail', () => new THREE.ConeGeometry(0.14, 0.75, 12)), skin, 0, 0.3, -0.78); tail.rotation.x = -Math.PI / 2 - 0.15; body.add(tail);
    for (let k = 0; k < 5; k++) body.add(mesh(G('spike', () => new THREE.ConeGeometry(0.03, 0.08, 4)), belly, 0, 0.52 - k * 0.01, 0.25 - k * 0.15));
    const head = new THREE.Group(); head.position.set(0, 0.45, 0.52); body.add(head);
    const skull = mesh(G('komHead', () => new THREE.SphereGeometry(0.17, 20, 14)), skin); skull.scale.set(1, 0.8, 1.6); head.add(skull);
    eye(head, -0.1, 0.06, 0.1, 0.035); eye(head, 0.1, 0.06, 0.1, 0.035);
    const tongue = std('#d6243a');
    head.add(mesh(G('tongue', () => new THREE.BoxGeometry(0.03, 0.01, 0.2)), tongue, 0, -0.05, 0.36));
    for (const sd of [-1, 1]) { const f = mesh(G('fork', () => new THREE.BoxGeometry(0.015, 0.01, 0.07)), tongue, sd * 0.02, -0.05, 0.48); f.rotation.y = sd * 0.5; head.add(f); }
    if (photo) { const b = photoBadge(photo, 0.12); b.position.set(0, 0.68, 0.05); body.add(b); }
    return hatAnchor(head, 0, 0.06, -0.02, 0.6);
  },
  ayam(body, color, photo) {
    const feather = std(color), dark = std(shade(color, 0.6)), yellow = std('#f2b705'), red = std('#d6243a');
    const torso = mesh(G('chkBody', () => new THREE.SphereGeometry(0.3, 24, 18)), feather, 0, 0.62, 0); torso.scale.set(0.9, 1, 1.05); body.add(torso);
    for (const sd of [-1, 1]) { const w = mesh(G('wing', () => new THREE.SphereGeometry(0.22, 16, 12)), dark, sd * 0.25, 0.62, -0.02); w.scale.set(0.3, 0.75, 1); body.add(w); }
    [-0.5, -0.2, 0.2, 0.5].forEach((rz, k) => {
      const t = mesh(G('tailF', () => new THREE.ConeGeometry(0.07, 0.48, 6)), k % 2 ? std('#e2b33c', { metalness: 0.3 }) : dark, rz * 0.3, 0.92, -0.3);
      t.rotation.set(-0.7, 0, rz); body.add(t);
    });
    for (const sd of [-1, 1]) {
      body.add(mesh(G('chkLeg', () => new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8)), yellow, sd * 0.09, 0.25, 0.02));
      body.add(mesh(G('chkFoot', () => new THREE.BoxGeometry(0.1, 0.02, 0.14)), yellow, sd * 0.09, 0.11, 0.06));
    }
    const head = new THREE.Group(); head.position.set(0, 1.02, 0.17); body.add(head);
    head.add(mesh(G('chkHead', () => new THREE.SphereGeometry(0.16, 20, 14)), feather));
    [-0.06, 0, 0.06].forEach((z, k) => head.add(mesh(G('comb', () => new THREE.SphereGeometry(0.05, 10, 8)), red, 0, 0.15 + (k === 1 ? 0.03 : 0), z)));
    const beak = mesh(G('beak', () => new THREE.ConeGeometry(0.05, 0.13, 8)), yellow, 0, -0.01, 0.19); beak.rotation.x = Math.PI / 2; head.add(beak);
    const wattle = mesh(G('wattle', () => new THREE.SphereGeometry(0.04, 10, 8)), red, 0, -0.1, 0.13); wattle.scale.y = 1.5; head.add(wattle);
    eye(head, -0.08, 0.04, 0.12, 0.025); eye(head, 0.08, 0.04, 0.12, 0.025);
    if (photo) { const b = photoBadge(photo, 0.12); b.position.set(0, 0.64, 0.31); body.add(b); }
    return hatAnchor(head, 0, 0.0, 0, 0.55);
  },
  angkot(body, color, photo) {
    const paint = std(color, { roughness: 0.35, metalness: 0.2 }), glass = std('#2a3b4f', { roughness: 0.15, metalness: 0.4 });
    const tire = std('#1b1b1f', { roughness: 0.9 }), chrome = std('#d9d9de', { metalness: 0.8, roughness: 0.25 });
    body.add(mesh(G('carBody', () => new THREE.BoxGeometry(0.62, 0.32, 1.0)), paint, 0, 0.36, 0));
    body.add(mesh(G('carStripe', () => new THREE.BoxGeometry(0.632, 0.06, 1.01)), std('#f7f5ef'), 0, 0.42, 0));
    body.add(mesh(G('carCabin', () => new THREE.BoxGeometry(0.58, 0.3, 0.74)), paint, 0, 0.67, -0.08));
    body.add(mesh(G('carWin', () => new THREE.BoxGeometry(0.592, 0.16, 0.6)), glass, 0, 0.7, -0.1));
    const wind = windowPane(photo, 0.5, 0.22); wind.position.set(0, 0.69, 0.296); wind.rotation.x = -0.12; body.add(wind);
    for (const [x, z] of [[-0.32, 0.32], [0.32, 0.32], [-0.32, -0.32], [0.32, -0.32]]) {
      const w = mesh(G('wheel', () => new THREE.CylinderGeometry(0.12, 0.12, 0.08, 18)), tire, x, 0.14, z); w.rotation.z = Math.PI / 2; body.add(w);
      const hub = mesh(G('hub', () => new THREE.CylinderGeometry(0.05, 0.05, 0.085, 12)), chrome, x, 0.14, z); hub.rotation.z = Math.PI / 2; body.add(hub);
    }
    for (const sd of [-1, 1]) body.add(mesh(G('headlight', () => new THREE.SphereGeometry(0.045, 10, 8)), std('#fff6c8', { emissive: '#665a20' }), sd * 0.2, 0.38, 0.5));
    body.add(mesh(G('bumper', () => new THREE.BoxGeometry(0.64, 0.05, 0.05)), chrome, 0, 0.24, 0.51));
    return hatAnchor(body, 0, 0.65, -0.08, 0.8);
  },
  // Pesawat kecil berwarna pemain; foto tampil di kaca kokpit.
  pesawat(body, color, photo) {
    const paint = std(color, { roughness: 0.35, metalness: 0.25 }), white = std('#f7f5ef', { roughness: 0.4 });
    const dark = std('#2b2b30', { roughness: 0.6 }), tire = std('#1b1b1f', { roughness: 0.9 }), chrome = std('#d9d9de', { metalness: 0.8, roughness: 0.25 });
    const fus = mesh(G('planeBody', () => new THREE.CapsuleGeometry(0.17, 0.6, 8, 20)), paint, 0, 0.52, 0); fus.rotation.x = Math.PI / 2; body.add(fus);
    const band = mesh(G('planeBand', () => new THREE.CylinderGeometry(0.173, 0.173, 0.42, 20, 1, true)), white, 0, 0.52, -0.06); band.rotation.x = Math.PI / 2; band.scale.y = 1; body.add(band);
    for (let k = 0; k < 4; k++) for (const sd of [-1, 1]) {
      const w = mesh(G('planeWinS', () => new THREE.CircleGeometry(0.025, 12)), dark, sd * 0.172, 0.56, 0.08 - k * 0.1); w.rotation.y = sd * Math.PI / 2; body.add(w);
    }
    const cock = windowPane(photo, 0.22, 0.13); cock.position.set(0, 0.65, 0.33); cock.rotation.x = -0.75; body.add(cock);
    body.add(mesh(G('planeWing', () => new THREE.BoxGeometry(1.15, 0.035, 0.24)), paint, 0, 0.47, 0.04));
    for (const sd of [-1, 1]) {
      body.add(mesh(G('planeTip', () => new THREE.BoxGeometry(0.06, 0.037, 0.245)), white, sd * 0.55, 0.47, 0.04));
      const eng = mesh(G('planeEngine', () => new THREE.CylinderGeometry(0.06, 0.05, 0.2, 14)), chrome, sd * 0.3, 0.41, 0.07); eng.rotation.x = Math.PI / 2; body.add(eng);
      body.add(mesh(G('planeIntake', () => new THREE.CircleGeometry(0.045, 14)), dark, sd * 0.3, 0.41, 0.172));
    }
    const fin = mesh(G('planeFin', () => new THREE.BoxGeometry(0.035, 0.3, 0.2)), paint, 0, 0.74, -0.4); fin.rotation.x = -0.35; body.add(fin);
    body.add(mesh(G('planeStab', () => new THREE.BoxGeometry(0.46, 0.03, 0.14)), paint, 0, 0.56, -0.42));
    for (const [x, z] of [[0, 0.27], [-0.13, -0.04], [0.13, -0.04]]) {
      body.add(mesh(G('planeStrut', () => new THREE.CylinderGeometry(0.012, 0.012, 0.24, 6)), chrome, x, 0.24, z));
      const w = mesh(G('planeWheel', () => new THREE.CylinderGeometry(0.065, 0.065, 0.05, 14)), tire, x, 0.07, z); w.rotation.z = Math.PI / 2; body.add(w);
    }
    body.add(mesh(G('planeLight', () => new THREE.SphereGeometry(0.03, 10, 8)), std('#fff6c8', { emissive: '#665a20' }), 0, 0.5, 0.5));
    return hatAnchor(body, 0, 0.69, 0.15, 0.55);
  }
};

function addHeadwear(head, topi, color) {
  if (!topi || topi === 'none') return;
  const top = HEAD_R * 0.72;
  if (topi === 'peci') {
    const m = mesh(G('peci', () => new THREE.CylinderGeometry(0.215, 0.24, 0.18, 30)), std('#16161a', { roughness: 0.95 }), 0, top + 0.02, -0.02);
    m.rotation.x = -0.12; head.add(m);
  } else if (topi === 'topi') {
    const crown = mesh(G('capCrown', () => new THREE.SphereGeometry(0.315, 30, 14, 0, Math.PI * 2, 0, Math.PI / 2)), std(color), 0, 0.06, 0);
    crown.scale.y = 0.85; head.add(crown);
    const brim = mesh(G('capBrim', () => new THREE.CylinderGeometry(0.2, 0.2, 0.025, 24, 1, false, -Math.PI / 2, Math.PI)), std(shade(color, 0.7)), 0, 0.1, 0.22);
    brim.scale.set(1.1, 1, 1.3); brim.rotation.x = 0.12; head.add(brim);
    head.add(mesh(G('capBtn', () => new THREE.SphereGeometry(0.03, 8, 6)), std(shade(color, 0.7)), 0, 0.33, 0));
  } else if (topi === 'blangkon') {
    const m = mesh(G('blangkon', () => new THREE.SphereGeometry(0.322, 30, 16, 0, Math.PI * 2, 0, Math.PI * 0.55)), std('#fff', { map: batikTex('#5b3a1e', '#d9b36c') }), 0, 0.02, -0.01);
    m.scale.y = 0.8; head.add(m);
    head.add(mesh(G('mondolan', () => new THREE.SphereGeometry(0.1, 16, 12)), std('#5b3a1e'), 0, -0.02, -0.33));
  } else if (topi === 'helm') {
    const m = mesh(G('helm', () => new THREE.SphereGeometry(0.33, 30, 14, 0, Math.PI * 2, 0, Math.PI / 2)), std('#f6c21a', { roughness: 0.35 }), 0, 0.04, 0);
    head.add(m);
    head.add(mesh(G('helmBrim', () => new THREE.CylinderGeometry(0.4, 0.4, 0.03, 32)), std('#f6c21a', { roughness: 0.35 }), 0, 0.05, 0.02));
    const ridge = mesh(G('helmRidge', () => new THREE.TorusGeometry(0.33, 0.025, 8, 24, Math.PI)), std('#e2ab0b'), 0, 0.05, 0);
    ridge.rotation.y = Math.PI / 2; head.add(ridge);
  } else if (topi === 'caping') {
    head.add(mesh(G('caping', () => new THREE.ConeGeometry(0.62, 0.3, 36, 1, true)), std('#d8b46a', { side: THREE.DoubleSide, roughness: 0.95 }), 0, top + 0.12, 0));
    head.add(mesh(G('capingRing', () => new THREE.TorusGeometry(0.61, 0.015, 6, 40)), std('#8a6a32'), 0, top - 0.03, 0)).children.at(-1).rotation.x = Math.PI / 2;
  } else if (topi === 'mahkota') {
    const gold = GOLD();
    head.add(mesh(G('crownBand', () => new THREE.CylinderGeometry(0.21, 0.21, 0.12, 28, 1, true)), new THREE.MeshStandardMaterial({ color: '#e2b33c', metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide }), 0, top + 0.04, 0));
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * Math.PI * 2;
      head.add(mesh(G('crownSpike', () => new THREE.ConeGeometry(0.045, 0.13, 8)), gold, Math.sin(a) * 0.205, top + 0.16, Math.cos(a) * 0.205));
      if (k % 2 === 0) head.add(mesh(G('gem', () => new THREE.SphereGeometry(0.025, 8, 6)), std('#d6243a', { roughness: 0.2 }), Math.sin(a) * 0.215, top + 0.04, Math.cos(a) * 0.215));
    }
  }
}

// Rambut di atas & belakang kepala, tidak menutupi wajah (foto).
function addHair(head, style) {
  if (style === 'botak') return;
  const hairM = std('#2a1d16', { roughness: 0.9 });
  const cap = mesh(G('hair', () => new THREE.SphereGeometry(HEAD_R + 0.018, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.52)), hairM);
  cap.rotation.x = -1.02; head.add(cap);
  if (style === 'panjang') {
    const back = mesh(G('hairLong', () => new THREE.SphereGeometry(HEAD_R + 0.03, 24, 16)), hairM, 0, -0.22, -0.13);
    back.scale.set(1.02, 1.55, 0.55); head.add(back);
  } else if (style === 'kuncir') {
    head.add(mesh(G('bun', () => new THREE.SphereGeometry(0.09, 14, 10)), hairM, 0, 0.06, -0.33));
    const tail = mesh(G('tail', () => new THREE.ConeGeometry(0.07, 0.32, 10)), hairM, 0, -0.12, -0.37);
    tail.rotation.x = Math.PI + 0.35; head.add(tail);
  }
}

function addAccessory(body, head, root, acc) {
  if (!acc || acc === 'none') return;
  if (acc === 'kacamata') {
    const dark = std('#111', { roughness: 0.15, metalness: 0.4 });
    for (const s of [-1, 1]) {
      const lens = mesh(G('lens', () => new THREE.CylinderGeometry(0.085, 0.085, 0.02, 20)), dark, s * 0.105, 0.04, 0.3);
      lens.rotation.x = Math.PI / 2; lens.rotation.z = s * -0.25; head.add(lens);
      const arm = mesh(G('glassArm', () => new THREE.BoxGeometry(0.012, 0.012, 0.26)), dark, s * 0.22, 0.05, 0.16);
      arm.rotation.y = s * 0.3; head.add(arm);
    }
    head.add(mesh(G('bridge', () => new THREE.BoxGeometry(0.06, 0.015, 0.015)), dark, 0, 0.06, 0.31));
  } else if (acc === 'kalung') {
    const gold = GOLD();
    const chain = mesh(G('chain', () => new THREE.TorusGeometry(0.16, 0.02, 8, 30)), gold, 0, 0.98, 0.04);
    chain.rotation.x = Math.PI / 2 - 0.45; body.add(chain);
    body.add(mesh(G('pendant', () => new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16)), gold, 0, 0.86, 0.24)).children.at(-1).rotation.x = Math.PI / 2 - 0.2;
  } else if (acc === 'dasi') {
    const red = std('#c3262e');
    for (const s of [-1, 1]) {
      const wing = mesh(G('bow', () => new THREE.ConeGeometry(0.055, 0.1, 4)), red, s * 0.05, 1.02, 0.2);
      wing.rotation.z = s * Math.PI / 2; body.add(wing);
    }
    body.add(mesh(G('knot', () => new THREE.SphereGeometry(0.028, 10, 8)), red, 0, 1.02, 0.21));
  } else if (acc === 'kumis') {
    const brown = std('#2a1d16', { roughness: 0.9 });
    for (const s of [-1, 1]) {
      const m = mesh(G('mustache', () => new THREE.CapsuleGeometry(0.018, 0.07, 4, 8)), brown, s * 0.045, -0.075, 0.292);
      m.rotation.z = Math.PI / 2 + s * 0.35; head.add(m);
    }
  } else if (acc === 'masker') {
    const mask = mesh(G('mask', () => new THREE.SphereGeometry(HEAD_R + 0.012, 24, 10, Math.PI / 2 - 0.95, 1.9, 1.62, 0.62)), std('#bfe3f2', { roughness: 0.8, side: THREE.DoubleSide }));
    head.add(mask);
  } else if (acc === 'headphone') {
    const dark = std('#1d1d22', { roughness: 0.4 });
    head.add(mesh(G('hpBand', () => new THREE.TorusGeometry(0.335, 0.025, 8, 24, Math.PI)), dark));
    for (const s of [-1, 1]) {
      const cup = mesh(G('hpCup', () => new THREE.CylinderGeometry(0.085, 0.085, 0.07, 18)), std('#d9412f', { roughness: 0.4 }), s * 0.32, 0, 0);
      cup.rotation.z = Math.PI / 2; head.add(cup);
    }
  } else if (acc === 'selempang') {
    const strap = mesh(G('strap', () => new THREE.TorusGeometry(0.3, 0.02, 6, 30)), std('#5b3a1e'), 0, 0.76, 0);
    strap.rotation.set(Math.PI / 2, 0.6, 0); body.add(strap);
    body.add(mesh(G('sling', () => new THREE.BoxGeometry(0.17, 0.15, 0.07)), std('#7a4a22', { roughness: 0.6 }), 0.24, 0.52, 0.2));
  } else if (acc === 'koper') {
    const arm = root.userData.rightArm;
    const g = new THREE.Group(); g.position.set(0, -0.6, 0.02); g.rotation.z = -0.22;
    g.add(mesh(G('case', () => new THREE.BoxGeometry(0.3, 0.22, 0.09)), std('#3b2a1c', { roughness: 0.5 })));
    g.add(mesh(G('caseBand', () => new THREE.BoxGeometry(0.31, 0.03, 0.095)), GOLD()));
    const h = mesh(G('caseHandle', () => new THREE.TorusGeometry(0.05, 0.012, 6, 14, Math.PI)), GOLD(), 0, 0.11, 0); g.add(h);
    arm.add(g);
  }
}

/* ---------- Pratinjau editor ---------- */
// Kanvas kecil yang memutar avatar pelan-pelan. Bisa diputar dengan geser jari/mouse.
export function createPreview(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 1.35, 4.6);
  camera.lookAt(0, 0.95, 0);
  scene.add(new THREE.HemisphereLight('#ffffff', '#b9a98a', 1.6));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.position.set(2, 4, 3); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), new THREE.ShadowMaterial({ opacity: 0.18 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  let avatar = null, angle = 0, dragging = false, lastX = 0, alive = true, auto = true;
  canvas.addEventListener('pointerdown', e => { dragging = true; auto = false; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (dragging) { angle += (e.clientX - lastX) * 0.012; lastX = e.clientX; } });
  canvas.addEventListener('pointerup', () => { dragging = false; });

  function size() {
    const w = canvas.clientWidth || 200, h = canvas.clientHeight || 220;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const t0 = performance.now();
  function frame(now) {
    if (!alive) return;
    if (auto) angle = Math.sin((now - t0) / 1600) * 0.7; // bergoyang, wajah tetap terlihat
    if (avatar) {
      avatar.rotation.y = angle;
      avatar.userData.body.position.y = Math.abs(Math.sin((now - t0) / 380)) * 0.05;
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  size(); requestAnimationFrame(frame);
  return {
    set(spec) { if (avatar) scene.remove(avatar); avatar = buildAvatar(spec); scene.add(avatar); size(); },
    dispose() { alive = false; renderer.dispose(); }
  };
}
