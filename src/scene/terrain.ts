import * as THREE from 'three';
import type { Grid } from '../sim/grid';
import { NX, NZ, idx, latAt, lonAt } from '../sim/coords';
import { clamp, fbm, gauss } from '../sim/math';
import { coastLat } from '../data/geo';
import { VEX } from './coords';
import { overviewFrame, type Frame } from './frame';

export type ViewMode = 'real' | 'elev';

/** BufferGeometry แบบกริด nx × nz (ใช้ทั้งพื้นและผิวน้ำ) */
export function gridGeometry(f: Frame = overviewFrame): THREE.BufferGeometry {
  const { nx, nz } = f;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(nx * nz * 3),
    col = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      pos[c * 3] = f.x(i);
      pos[c * 3 + 2] = f.z(j);
    }
  const ind = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let k = 0;
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i,
        b = a + 1,
        c = a + nx,
        d = c + 1;
      ind[k++] = a;
      ind[k++] = c;
      ind[k++] = b;
      ind[k++] = b;
      ind[k++] = c;
      ind[k++] = d;
    }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(ind, 1));
  return g;
}

const C = (hex: number) => new THREE.Color(hex);
const COL = {
  urban: C(0xcfc8bb),
  sub: C(0xb8c49a),
  green: C(0x7fa865),
  rice: C(0xb9c78a),
  mangrove: C(0x5a8a58),
  bed: C(0x7b6c55),
  wet: C(0x9fb58a),
};
/** สเกลสีแผนที่ความสูง [ม.รทก., สี] */
export const ELEV: [number, THREE.Color][] = [
  [-0.5, C(0x5b2a86)],
  [0.25, C(0x6b46c1)],
  [0.75, C(0x2f80ed)],
  [1.25, C(0x22a39f)],
  [1.75, C(0x7cc36b)],
  [2.25, C(0xe9c46a)],
  [3, C(0xe07a3f)],
];
function elevColor(h: number, out: THREE.Color): THREE.Color {
  if (h <= ELEV[0][0]) return out.copy(ELEV[0][1]);
  for (let k = 1; k < ELEV.length; k++) {
    if (h <= ELEV[k][0]) {
      const t = (h - ELEV[k - 1][0]) / (ELEV[k][0] - ELEV[k - 1][0]);
      return out.copy(ELEV[k - 1][1]).lerp(ELEV[k][1], t);
    }
  }
  return out.copy(ELEV[ELEV.length - 1][1]);
}

export function createTerrain(scene: THREE.Object3D, grid: Grid) {
  const geo = gridGeometry();
  scene.add(
    new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
    ),
  );

  function update(hEff: Float32Array, viewMode: ViewMode): void {
    const pos = geo.attributes.position.array as Float32Array,
      col = geo.attributes.color.array as Float32Array,
      tc = new THREE.Color();
    const { kind, urban, intertidal } = grid;
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NX; i++) {
        const c = idx(i, j),
          lat = latAt(j),
          lon = lonAt(i);
        pos[c * 3 + 1] = hEff[c] * VEX;
        if (kind[c]) tc.copy(COL.bed);
        else if (viewMode === 'elev') elevColor(hEff[c], tc);
        else {
          const u = urban[c];
          tc.copy(lon > 100.73 || lon < 100.4 ? COL.rice : COL.sub).lerp(COL.urban, clamp(u * 1.4, 0, 1));
          if (gauss(lat, lon, 13.675, 100.565, 0.016) > 0.35) tc.copy(COL.green);
          if (intertidal[c] || lat - coastLat(lon) < 0.02) tc.copy(COL.mangrove);
          if (hEff[c] < 0.6) tc.lerp(COL.wet, 0.4);
          const n = (fbm(lat * 2, lon * 2) - 0.5) * 0.08;
          tc.offsetHSL(0, 0, n);
        }
        col[c * 3] = tc.r;
        col[c * 3 + 1] = tc.g;
        col[c * 3 + 2] = tc.b;
      }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.computeVertexNormals();
  }
  return { update };
}
