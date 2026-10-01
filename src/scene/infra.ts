import * as THREE from 'three';
import { PUMPS, TUNNEL } from '../data/places';
import { cellAt } from '../sim/coords';
import type { SimParams } from '../sim/simulate';
import { VEX, wx, wz } from './coords';

/** สถานีสูบน้ำ + อุโมงค์ระบายน้ำ */
export function createInfra(scene: THREE.Object3D) {
  const group = new THREE.Group();
  scene.add(group);
  const pumps = PUMPS.map(([la, lo]) => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.5, 16),
      new THREE.MeshStandardMaterial({ color: 0xd94b2b }),
    );
    m.userData = { la, lo };
    group.add(m);
    return m;
  });
  const tunnelPts = TUNNEL.map(([la, lo]) => new THREE.Vector3(wx(lo), 0, wz(la)));
  const tunnel = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tunnelPts), 20, 0.12, 8),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.85 }),
  );
  group.add(tunnel);

  function update(hEff: Float32Array, P: SimParams): void {
    pumps.forEach((m) => {
      const { la, lo } = m.userData as { la: number; lo: number };
      const c = cellAt(la, lo);
      m.position.set(wx(lo), Math.max(hEff[c], 1) * VEX + 0.25, wz(la));
    });
    tunnel.position.y = 1.1 * VEX;
    group.visible = P.drains;
  }
  return { update };
}
