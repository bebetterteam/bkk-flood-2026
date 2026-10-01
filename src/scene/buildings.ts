import * as THREE from 'three';
import type { Grid } from '../sim/grid';
import { LAT0, LAT1, LON0, LON1, cellAt } from '../sim/coords';
import { gauss } from '../sim/math';
import { VEX, wx, wz } from './coords';

interface Building {
  c: number;
  x: number;
  z: number;
  hu: number;
  w: number;
  d: number;
  shade: number;
}

/**
 * ตึกสุ่มแบบกำหนด seed (ความสูงขยายเกินจริงเพื่อให้เห็นชัด)
 * ลำดับการเรียก rnd() มีผลกับฝน/อนุภาคที่สร้างต่อจากนี้ อย่าเปลี่ยนลำดับ
 */
export function createBuildings(scene: THREE.Object3D, grid: Grid, rnd: () => number) {
  const data: Building[] = [];
  for (let tries = 0; tries < 40000 && data.length < 2800; tries++) {
    const lat = LAT0 + rnd() * (LAT1 - LAT0),
      lon = LON0 + rnd() * (LON1 - LON0);
    const c = cellAt(lat, lon);
    if (grid.kind[c] || grid.wallType[c] || grid.intertidal[c]) continue;
    const u = grid.urban[c];
    if (rnd() > u * 0.9) continue;
    const tall =
      gauss(lat, lon, 13.724, 100.53, 0.012) +
      gauss(lat, lon, 13.737, 100.56, 0.012) +
      gauss(lat, lon, 13.758, 100.566, 0.01) +
      gauss(lat, lon, 13.722, 100.513, 0.008) +
      gauss(lat, lon, 13.752, 100.54, 0.01) +
      0.4 * gauss(lat, lon, 13.82, 100.56, 0.02);
    const m = 12 + rnd() * 25 * u + Math.min(1, tall) * rnd() * 230;
    data.push({
      c,
      x: wx(lon),
      z: wz(lat),
      hu: 0.22 + m * 0.009,
      w: 0.1 + rnd() * 0.18,
      d: 0.1 + rnd() * 0.18,
      shade: 0.78 + rnd() * 0.2,
    });
  }
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    new THREE.MeshStandardMaterial({ roughness: 0.7 }),
    data.length,
  );
  scene.add(mesh);

  function update(hEff: Float32Array): void {
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      s = new THREE.Vector3(),
      p = new THREE.Vector3(),
      col = new THREE.Color();
    data.forEach((b, k) => {
      p.set(b.x, hEff[b.c] * VEX, b.z);
      s.set(b.w, b.hu, b.d);
      m.compose(p, q, s);
      mesh.setMatrixAt(k, m);
      col.setRGB(b.shade, b.shade * 0.99, b.shade * 0.96);
      mesh.setColorAt(k, col);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  return { update };
}
