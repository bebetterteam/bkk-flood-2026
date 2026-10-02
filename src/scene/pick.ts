/** หาจุดบนพื้นที่รังสีจากกล้องชน (ใช้ทั้ง tooltip และการปักหมุด) */
import * as THREE from 'three';
import type { Frame } from './frame';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * ตัดกับระนาบแนวนอนที่ความสูงพื้นแบบวนซ้ำ 3 รอบ (พื้นแทบแบนจึงลู่เข้าเร็ว)
 * คืน { point, lat, lon } หรือ null ถ้าชี้ออกนอกแผนที่/ขนานพื้น
 */
export function groundPoint(ray: THREE.Ray, f: Frame, hEff: Float32Array, out = new THREE.Vector3()) {
  let y = 1 * f.vex;
  const plane = new THREE.Plane();
  for (let it = 0; it < 3; it++) {
    plane.set(UP, -y);
    if (!ray.intersectPlane(plane, out)) return null;
    const lon = f.lonOfX(out.x),
      lat = f.latOfZ(out.z);
    if (!f.inBounds(lat, lon)) return null;
    y = Math.max(hEff[f.cellAt(lat, lon)], 0) * f.vex;
  }
  return { point: out, lat: f.latOfZ(out.z), lon: f.lonOfX(out.x) };
}
