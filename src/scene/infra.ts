import * as THREE from 'three';
import { PUMPS, TUNNEL } from '../data/places';
import type { SimParams } from '../sim/simulate';
import { overviewFrame, type Frame } from './frame';

/** ขนาดในหน่วยโลก: รัศมี/ความสูงถังสูบ, รัศมีท่ออุโมงค์; tunnelOnGround = วางอุโมงค์บนพื้นให้มองเห็น (โหมดศึกษา) */
export interface InfraStyle {
  r: number;
  h: number;
  tube: number;
  tunnelOnGround: boolean;
}

/** สถานีสูบน้ำ + อุโมงค์ระบายน้ำ (ตำแหน่งประมาณ) */
export function createInfra(
  scene: THREE.Object3D,
  f: Frame = overviewFrame,
  style: InfraStyle = { r: 0.22, h: 0.5, tube: 0.12, tunnelOnGround: false },
) {
  const group = new THREE.Group();
  scene.add(group);
  const pumps = PUMPS.filter(([la, lo]) => f === overviewFrame || f.inBounds(la, lo)).map(([la, lo]) => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(style.r, style.r, style.h, 16),
      new THREE.MeshStandardMaterial({ color: 0xd94b2b }),
    );
    m.userData = { la, lo };
    group.add(m);
    return m;
  });
  const tunnelPts = TUNNEL.map(([la, lo]) => new THREE.Vector3(f.wx(lo), 0, f.wz(la)));
  const tunnel = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tunnelPts), 20, style.tube, 8),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.85 }),
  );
  group.add(tunnel);

  function update(hEff: Float32Array, P: SimParams): void {
    pumps.forEach((m) => {
      const { la, lo } = m.userData as { la: number; lo: number };
      const c = f.cellAt(la, lo);
      m.position.set(f.wx(lo), Math.max(hEff[c], 1) * f.vex + style.h / 2, f.wz(la));
    });
    if (style.tunnelOnGround) {
      const top = Math.max(...TUNNEL.map(([la, lo]) => hEff[f.cellAt(la, lo)]));
      tunnel.position.y = top * f.vex + style.tube;
    } else tunnel.position.y = 1.1 * f.vex;
    group.visible = P.drains;
  }
  return { update };
}
