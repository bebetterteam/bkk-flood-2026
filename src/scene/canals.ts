import * as THREE from 'three';
import { CANALS } from '../data/geo';
import { cellAt } from '../sim/coords';
import { VEX, wx, wz } from './coords';

/** คลองเป็นริบบอนแบนวางบนพื้น */
export function createCanals(scene: THREE.Scene) {
  const group = new THREE.Group();
  scene.add(group);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3c8fb0, roughness: 0.4 });

  function update(hEff: Float32Array): void {
    group.clear();
    for (const poly of CANALS) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k < poly.length - 1; k++) {
        const a = poly[k],
          b = poly[k + 1];
        const n = Math.ceil(Math.hypot(a[0] - b[0], a[1] - b[1]) / 0.002);
        for (let t = 0; t < n; t++) {
          const la = a[0] + ((b[0] - a[0]) * t) / n,
            lo = a[1] + ((b[1] - a[1]) * t) / n;
          pts.push(new THREE.Vector3(wx(lo), hEff[cellAt(la, lo)] * VEX + 0.03, wz(la)));
        }
      }
      const pos: number[] = [],
        ind: number[] = [];
      for (let k = 0; k < pts.length; k++) {
        const a = pts[Math.max(0, k - 1)],
          b = pts[Math.min(pts.length - 1, k + 1)];
        const dx = b.x - a.x,
          dz = b.z - a.z,
          L = Math.hypot(dx, dz) || 1,
          nx = (-dz / L) * 0.09,
          nz = (dx / L) * 0.09;
        pos.push(pts[k].x + nx, pts[k].y, pts[k].z + nz, pts[k].x - nx, pts[k].y, pts[k].z - nz);
        if (k < pts.length - 1) {
          const o = k * 2;
          ind.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(ind);
      g.computeVertexNormals();
      group.add(new THREE.Mesh(g, mat));
    }
  }
  return { update };
}
