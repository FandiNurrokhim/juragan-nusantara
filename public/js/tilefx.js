// Efek sesaat di sebuah petak: pemadaman (petir), bencana alam (debu & batu), tarikan (cincin ungu), listrik menyala.
import * as THREE from 'three';

const DUR = { blackout: 1400, disaster: 1800, pull: 1500, restore: 1100 };

export function createTileFx(scene) {
  const live = [];
  // Blending biasa (bukan additive): di atas papan yang terang, warna additive jadi putih pucat.
  const glowMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });

  function bolt(g) {
    // petir zig-zag dari atas ke petak
    const m = glowMat('#ffc400'), pts = [[0, 2.2], [0.18, 1.6], [-0.1, 1.15], [0.15, 0.6], [0, 0.05]];
    for (let k = 0; k < pts.length - 1; k++) {
      const [x1, y1] = pts[k], [x2, y2] = pts[k + 1], len = Math.hypot(x2 - x1, y2 - y1);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.05, len, 0.05), m);
      seg.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0); seg.rotation.z = Math.atan2(x1 - x2, y2 - y1); g.add(seg);
    }
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32), glowMat('#2b2b55', 0.6)); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.02; g.add(glow);
    return t => { const on = Math.floor(t * 9) % 2 === 0 && t < 0.75; m.opacity = on ? 1 : 0.05; glow.material.opacity = 0.65 * (1 - t * 0.5); };
  }
  function quake(g) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.22, 40), new THREE.MeshBasicMaterial({ color: '#8b5a2b', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
    const rockM = new THREE.MeshStandardMaterial({ color: '#6b4a2a', roughness: 1 }), rocks = [];
    for (let k = 0; k < 14; k++) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), rockM), a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 0.8;
      r.userData.v = [Math.cos(a) * sp, 1.6 + Math.random() * 1.2, Math.sin(a) * sp]; g.add(r); rocks.push(r);
    }
    const flash = new THREE.Mesh(new THREE.CircleGeometry(0.75, 32), glowMat('#ff5a1f', 0.5)); flash.rotation.x = -Math.PI / 2; flash.position.y = 0.025; g.add(flash);
    return (t, sec) => {
      ring.scale.setScalar(1 + t * 5); ring.material.opacity = 0.85 * (1 - t);
      flash.material.opacity = 0.6 * Math.max(0, 1 - t * 2) * (0.6 + 0.4 * Math.sin(sec * 40));
      for (const r of rocks) { const [vx, vy, vz] = r.userData.v; r.position.set(vx * sec * 0.6, Math.max(0, vy * sec - 4.5 * sec * sec), vz * sec * 0.6); r.rotation.x = sec * 6; r.rotation.y = sec * 4; }
    };
  }
  function rings(g, color, inward) {
    const rs = [0, 1, 2].map(() => { const r = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 48), glowMat(color, 0.8)); r.rotation.x = -Math.PI / 2; r.position.y = 0.04; g.add(r); return r; });
    return t => rs.forEach((r, k) => {
      const u = Math.min(1, Math.max(0, t * 1.6 - k * 0.25));
      r.scale.setScalar(inward ? 1.8 - u * 1.6 : 0.2 + u * 1.8); r.material.opacity = u > 0 && u < 1 ? 0.85 * (1 - Math.abs(u - 0.5) * 1.4) : 0;
      r.position.y = 0.04 + (inward ? 0.25 * (1 - u) : 0);
    });
  }

  return {
    play(pos, kind) {
      const g = new THREE.Group(); g.position.copy(pos); scene.add(g);
      const step = kind === 'blackout' ? bolt(g) : kind === 'disaster' ? quake(g) : kind === 'pull' ? rings(g, '#8e2de2', true) : rings(g, '#f5b800', false);
      live.push({ g, step, t0: performance.now(), dur: DUR[kind] || 1200 });
    },
    update(now) {
      for (let k = live.length - 1; k >= 0; k--) {
        const f = live[k], sec = (now - f.t0) / 1000, t = Math.min(1, (now - f.t0) / f.dur);
        f.step(t, sec);
        if (t >= 1) {
          scene.remove(f.g);
          f.g.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.material.dispose && !o.material.isMeshStandardMaterial) o.material.dispose(); } });
          live.splice(k, 1);
        }
      }
    }
  };
}
