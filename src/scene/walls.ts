import * as THREE from 'three';
import type { Grid } from '../sim/grid';
import { N, NX, latAt, lonAt } from '../sim/coords';
import { WALL_RIVER } from '../sim/grid';
import { wallTop, type SimParams } from '../sim/simulate';
import { CELL, VEX, wx, wz } from './coords';

const WCOL: Record<number, THREE.Color> = {
  1: new THREE.Color(0x9aa3ab),
  2: new THREE.Color(0x8a6a44),
  3: new THREE.Color(0x6f7b4a),
  4: new THREE.Color(0x8a6a44),
};

/** เขื่อนและคันกั้นน้ำ (instanced box ต่อเซลล์) */
export function createWalls(scene: THREE.Scene, grid: Grid) {
  const cells: number[] = [];
  for (let c = 0; c < N; c++) if (grid.wallType[c]) cells.push(c);
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    new THREE.MeshStandardMaterial({ roughness: 0.8 }),
    cells.length,
  );
  scene.add(mesh);

  function update(hEff: Float32Array, P: SimParams): void {
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      s = new THREE.Vector3(),
      p = new THREE.Vector3();
    cells.forEach((c, k) => {
      const i = c % NX,
        j = (c / NX) | 0,
        w = grid.wallType[c];
      const on = w === WALL_RIVER ? P.walls : P.dikes;
      const top = wallTop(grid, P, c),
        base = hEff[c];
      const hh = on ? Math.max(0.02, (top - base) * VEX) : 0.0001;
      p.set(wx(lonAt(i)), base * VEX, wz(latAt(j)));
      s.set(CELL * 1.02, hh, CELL * 1.02);
      m.compose(p, q, s);
      mesh.setMatrixAt(k, m);
      mesh.setColorAt(k, WCOL[w]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  return { update };
}
