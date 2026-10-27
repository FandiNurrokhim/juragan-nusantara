// Lubang hitam milik Alien: pusaran di petak terpilih, pusaran kecil di bawah bidak Alien,
// busur energi saat lubang dibuka, dan efek tersedot saat lawan terjebak.
import * as THREE from 'three';

const GROW_MS = 700;
const glowMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });

// Pusaran: inti hitam, cakram akresi berwarna pemilik, partikel yang berputar masuk.
function vortex(color, size = 1) {
  const g = new THREE.Group(), spin = [];
  const halo = new THREE.Mesh(new THREE.CircleGeometry(0.62, 48), glowMat('#12061f', 0.55)); halo.rotation.x = -Math.PI / 2; halo.position.y = 0.012; g.add(halo);
  [[0.24, 0.36, color, 0.95], [0.36, 0.48, '#8e2de2', 0.7], [0.48, 0.58, color, 0.35]].forEach(([r0, r1, c, o], k) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 48, 1, 0, Math.PI * 1.6), glowMat(c, o));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02 + k * 0.006; g.add(ring); spin.push([ring, 2.6 - k * 0.7]);
  });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16), new THREE.MeshBasicMaterial({ color: '#000' })); core.position.y = 0.1; core.scale.y = 0.6; g.add(core);
  const lens = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 40), glowMat('#e9d5ff', 0.8)); lens.position.y = 0.1; g.add(lens);
  const dotG = new THREE.SphereGeometry(0.022, 6, 4), dotM = glowMat('#d8b4fe', 0.9), dots = [];
  for (let k = 0; k < 18; k++) { const d = new THREE.Mesh(dotG, dotM); d.userData.ph = k / 18; g.add(d); dots.push(d); }
  const beamM = glowMat(color, 0.22), beam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.5, 1, 24, 1, true), beamM); beam.position.y = -0.5; g.add(beam);
  g.scale.setScalar(size);
  g.userData.update = sec => {
    beamM.opacity = 0.16 + 0.08 * Math.sin(sec * 4);
    for (const [r, v] of spin) r.rotation.z = sec * v;
    lens.rotation.x = Math.PI / 2 + Math.sin(sec * 1.3) * 0.35; lens.rotation.y = sec * 0.8;
    halo.material.opacity = 0.45 + 0.12 * Math.sin(sec * 3);
    for (const d of dots) {
      const u = (sec * 0.45 + d.userData.ph) % 1, rad = 0.62 * (1 - u), a = d.userData.ph * Math.PI * 2 + u * 7;
      d.position.set(Math.cos(a) * rad, 0.03 + 0.07 * u, Math.sin(a) * rad); d.scale.setScalar(1 - u * 0.6);
    }
  };
  return g;
}

export function createBlackholes(scene) {
  const holes = new Map(), auras = new Map(), arcs = [], sucks = [];
  return {
    // holes: { ownerId: tile }. pointOf(tile) -> Vector3 tengah petak.
    sync(list, pointOf, colorOf) {
      for (const [id, h] of holes) if (list[id] !== h.tile || h.color !== colorOf(id)) { scene.remove(h.obj); holes.delete(id); }
      for (const [id, tile] of Object.entries(list)) {
        if (holes.has(id)) continue;
        const color = colorOf(id) || '#8e5bd6', obj = vortex(color, 1.3);
        obj.position.copy(pointOf(tile)); obj.position.y += 0.95; obj.rotation.x = 0.35; scene.add(obj); holes.set(id, { tile, color, obj, t0: performance.now() });
      }
    },
    // pusaran kecil di bawah bidak Alien selama lubang hitamnya aktif
    aura(id, on, pos, color) {
      let a = auras.get(id);
      if (!on) { if (a) { scene.remove(a); auras.delete(id); } return; }
      if (!a) { a = vortex(color || '#8e5bd6', 0.8); a.children.at(-1).visible = false; scene.add(a); auras.set(id, a); }
      a.position.set(pos.x, pos.y - 0.02, pos.z);
    },
    // busur energi dari Alien ke petak lubang hitam
    arc(from, to, color) {
      const mid = from.clone().lerp(to, 0.5); mid.y += 1.4 + from.distanceTo(to) * 0.15;
      const curve = new THREE.QuadraticBezierCurve3(from.clone().setY(from.y + 0.3), mid, to.clone().setY(to.y + 0.1));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.035, 8), glowMat(color || '#8e2de2', 0.9));
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), glowMat('#f3e8ff', 1));
      scene.add(tube, head); arcs.push({ tube, head, curve, t0: performance.now() });
    },
    // lawan tersedot: cincin menyempit + kilat ungu
    suck(pos) {
      const g = new THREE.Group(); g.position.copy(pos); scene.add(g);
      const rs = [0, 1, 2, 3].map(() => { const r = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 48), glowMat('#a855f7', 0.85)); r.rotation.x = -Math.PI / 2; g.add(r); return r; });
      const flash = new THREE.Mesh(new THREE.CircleGeometry(0.7, 40), glowMat('#1e0a33', 0.7)); flash.rotation.x = -Math.PI / 2; flash.position.y = 0.015; g.add(flash);
      sucks.push({ g, rs, flash, t0: performance.now() });
    },
    update(now) {
      const sec = now / 1000;
      for (const h of holes.values()) {
        // tampil terus selama lubang hitam aktif; muncul dengan membesar dari titik kecil
        const k = Math.min(1, (now - h.t0) / GROW_MS);
        h.obj.userData.update(sec); h.obj.scale.setScalar(1.3 * (1 - Math.pow(1 - k, 3)));
      }
      for (const a of auras.values()) a.userData.update(sec * 1.3);
      for (let k = arcs.length - 1; k >= 0; k--) {
        const f = arcs[k], t = (now - f.t0) / 1300;
        f.head.position.copy(f.curve.getPoint(Math.min(1, t)));
        f.tube.material.opacity = 0.9 * (t < 1 ? 1 : Math.max(0, 1 - (t - 1) * 3));
        f.head.material.opacity = t < 1 ? 1 : 0;
        if (t > 1.35) { scene.remove(f.tube, f.head); f.tube.geometry.dispose(); f.tube.material.dispose(); f.head.geometry.dispose(); f.head.material.dispose(); arcs.splice(k, 1); }
      }
      for (let k = sucks.length - 1; k >= 0; k--) {
        const f = sucks[k], t = (now - f.t0) / 1800;
        f.rs.forEach((r, j) => { const u = Math.min(1, Math.max(0, t * 1.5 - j * 0.18)); r.scale.setScalar(2.2 - u * 2.1); r.position.y = 0.03 + 0.5 * (1 - u); r.material.opacity = u > 0 && u < 1 ? 0.85 : 0; });
        f.flash.material.opacity = 0.7 * (1 - t);
        if (t >= 1) { scene.remove(f.g); f.g.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); sucks.splice(k, 1); }
      }
    }
  };
}
