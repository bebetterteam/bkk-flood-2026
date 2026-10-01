import * as THREE from 'three';
import type { Grid } from '../sim/grid';
import type { SimResult } from '../sim/simulate';
import { overviewFrame, type Frame } from './frame';
import { gridGeometry } from './terrain';

const C = (hex: number) => new THREE.Color(hex);
const WC = {
  river: C(0x2b7fa8),
  sea: C(0x2a6c9c),
  shallow: C(0x9fd3e0),
  mid: C(0x3f8fd0),
  deep: C(0x1c3f8f),
  muddy: C(0xa58a5c),
};

/**
 * ผิวน้ำ: ความลึกที่แสดง (cur) ค่อย ๆ เข้าหาผลการจำลอง
 * น้ำภายนอกมาถึงแต่ละเซลล์ตามระยะ arrival × grid.arrivalScale วินาที (ภาพรวม 0.05), น้ำฝนค่อย ๆ ขังภายใน 3 วินาที
 */
export function createWater(scene: THREE.Object3D, grid: Grid, f: Frame = overviewFrame) {
  const N = f.nx * f.nz,
    VEX = f.vex;
  const geo = gridGeometry(f);
  const nrm = new Float32Array(N * 3);
  for (let c = 0; c < N; c++) nrm[c * 3 + 1] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.84,
      roughness: 0.3,
      metalness: 0.05,
      depthWrite: false,
    }),
  );
  mesh.renderOrder = 2;
  scene.add(mesh);

  /** ความลึกน้ำที่กำลังแสดงต่อเซลล์ (ม.) */
  const cur = new Float32Array(N);
  let simT = 0;

  function reset(): void {
    simT = 0;
    cur.fill(0);
  }

  /** คืน true เมื่อยังเคลื่อนตัวอยู่ */
  function update(dt: number, sim: SimResult): boolean {
    simT += dt;
    const { kind } = grid;
    const { hEff, tExt, tRain, arrival } = sim;
    const pos = geo.attributes.position.array as Float32Array,
      col = geo.attributes.color.array as Float32Array,
      tc = new THREE.Color();
    const rainK = Math.min(1, simT / 3);
    const k = Math.min(1, dt * 2.5);
    for (let c = 0; c < N; c++) {
      let tgt;
      if (kind[c]) tgt = tExt[c];
      else tgt = (tExt[c] > 0 && simT >= arrival[c] * grid.arrivalScale ? tExt[c] : 0) + tRain[c] * rainK;
      cur[c] += (tgt - cur[c]) * k;
      const d = cur[c];
      if (kind[c]) {
        pos[c * 3 + 1] = (hEff[c] + d) * VEX;
        tc.copy(kind[c] === 1 ? WC.river : WC.sea);
      } else if (d > 0.02) {
        pos[c * 3 + 1] = (hEff[c] + d) * VEX + 0.01;
        if (d < 0.3) tc.copy(WC.shallow).lerp(WC.mid, d / 0.3);
        else if (d < 1) tc.copy(WC.mid).lerp(WC.deep, (d - 0.3) / 0.7);
        else tc.copy(WC.deep);
        tc.lerp(WC.muddy, 0.15);
      } else {
        pos[c * 3 + 1] = hEff[c] * VEX - 0.1;
        tc.copy(WC.shallow);
      }
      col[c * 3] = tc.r;
      col[c * 3 + 1] = tc.g;
      col[c * 3 + 2] = tc.b;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    return simT < Math.max(3.5, sim.maxArr * grid.arrivalScale + 1);
  }
  return { cur, reset, update };
}
