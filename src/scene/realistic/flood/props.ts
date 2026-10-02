/**
 * วัตถุที่ช่วยให้ "เห็นความลึก": รถจอดริมถนน และเศษขยะลอยน้ำ
 * placeCars เป็น pure (เทสต์ใน Node) — คืนตำแหน่งเป็นเมตรท้องถิ่นจากมุม SW ของ bbox
 */
import * as THREE from 'three';
import type { RoadsMeta } from '../../../data/realisticData';
import { mulberry } from '../../../sim/math';
import { readRoads } from '../roadGeometry';

/** ประเภทถนนที่มีรถจอด และโอกาสมีรถต่อ 8 ม. */
const PARK: Record<string, number> = {
  residential: 0.42,
  service: 0.35,
  living_street: 0.45,
  unclassified: 0.35,
  tertiary: 0.3,
  secondary: 0.18,
};

/** [xm, ym, มุม (rad), สี 0..1] ต่อคัน */
export function placeCars(meta: RoadsMeta, bin: ArrayBuffer, maxCars = 7000, step = 8): Float32Array {
  const R = readRoads(meta, bin);
  const Q = meta.quantMeters;
  const rnd = mulberry(77);
  const out: number[] = [];
  for (let l = 0; l < meta.count && out.length / 4 < maxCars; l++) {
    const p = PARK[meta.classes[R.cls[l]]];
    if (!p || R.flags[l] & 6) continue; // ไม่จอดบนสะพาน/ทางยกระดับ/ราง
    const w = R.widthDm[l] / 10;
    if (w < 3.5) continue;
    const s0 = R.lineStart[l],
      n = R.lineCount[l];
    let lifted = false;
    for (let k = 0; k < n; k++) if (R.liftDm[s0 + k] > 0) lifted = true;
    if (lifted) continue;
    let carry = rnd() * step;
    for (let k = 0; k + 1 < n && out.length / 4 < maxCars; k++) {
      const ax = R.verts[(s0 + k) * 2] * Q,
        ay = R.verts[(s0 + k) * 2 + 1] * Q,
        bx = R.verts[(s0 + k + 1) * 2] * Q,
        by = R.verts[(s0 + k + 1) * 2 + 1] * Q;
      const L = Math.hypot(bx - ax, by - ay);
      if (L < 1e-3) continue;
      const tx = (bx - ax) / L,
        ty = (by - ay) / L;
      for (let d = carry; d < L && out.length / 4 < maxCars; d += step) {
        if (rnd() > p) continue;
        const side = rnd() < 0.5 ? -1 : 1;
        const off = Math.max(0, w / 2 - 1.1) * side;
        out.push(
          ax + tx * d - ty * off,
          ay + ty * d + tx * off,
          Math.atan2(ty, tx) + (rnd() < 0.08 ? Math.PI : 0),
          rnd(),
        );
        if (out.length / 4 >= maxCars) break;
      }
      carry = (carry - L) % step;
      if (carry < 0) carry += step;
    }
  }
  return new Float32Array(out);
}

/** รถ low‑poly 1 คัน (หน่วยเมตร, หน้ารถชี้ +x) สีตามส่วน: ตัวถัง 1 (คูณสี instance), กระจก/ล้อเข้ม */
export function carGeometry(): THREE.BufferGeometry {
  const parts: [THREE.BufferGeometry, number][] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
    new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  parts.push([box(4.3, 0.72, 1.74, 0, 0.62, 0), 1]); // ตัวถัง
  parts.push([box(2.2, 0.55, 1.58, -0.25, 1.24, 0), 0.12]); // ห้องโดยสาร/กระจก
  for (const [x, z] of [
    [1.35, 0.8],
    [-1.35, 0.8],
    [1.35, -0.8],
    [-1.35, -0.8],
  ])
    parts.push([
      new THREE.CylinderGeometry(0.33, 0.33, 0.24, 6).rotateX(Math.PI / 2).translate(x, 0.33, z),
      0.05,
    ]);
  const pos: number[] = [],
    nrm: number[] = [],
    col: number[] = [],
    idx: number[] = [];
  for (const [g, shade] of parts) {
    const gi = g.toNonIndexed();
    const base = pos.length / 3;
    const p = gi.attributes.position.array,
      n = gi.attributes.normal.array;
    for (let k = 0; k < p.length; k++) {
      pos.push(p[k]);
      nrm.push(n[k]);
    }
    for (let k = 0; k < p.length / 3; k++) {
      col.push(shade, shade, shade);
      idx.push(base + k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/** สีรถในกรุงเทพฯ (ขาว เงิน เทา ดำ + สีสดบางคัน แท็กซี่ชมพู/เขียวเหลือง) */
export const CAR_COLORS = [
  0xf2f2f2, 0xf2f2f2, 0xd9d9d9, 0xbfc3c7, 0x8a8f94, 0x2b2e33, 0x2b2e33, 0x8c1c1c, 0x1f3b73, 0xe85a9b,
  0x6dbb3a, 0xc9b27c,
];

/**
 * เศษขยะ/ไม้ลอยน้ำ: สุ่มวางในช่องที่ลึก > 30 ซม. ลอยตามผิวน้ำ โยกตามคลื่น และไหลช้า ๆ ตามกระแส
 * ตำแหน่งสุ่มใหม่เมื่อผลการจำลองเปลี่ยน (seed คงที่)
 */
export function createDebris(
  parent: THREE.Object3D,
  frame: { x(i: number): number; z(j: number): number; vex: number; nx: number },
  cellM: number,
  unit: number,
  levelAt: (c: number) => number,
  flowAt: (c: number) => [number, number],
  n = 1500,
) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({ roughness: 0.85, envMapIntensity: 0.5 }),
    n,
  );
  mesh.frustumCulled = false;
  parent.add(mesh);
  const cell = new Int32Array(n).fill(-1),
    ox = new Float32Array(n),
    oz = new Float32Array(n),
    rot = new Float32Array(n),
    ph = new Float32Array(n);
  const size: [number, number, number][] = [];
  const col = new THREE.Color();
  const DEBRIS = [0x6b4f33, 0x7a5c3e, 0x5a4a3a, 0xd9d4c7, 0x3f6fa8, 0xc23b2f, 0xe8e2cf];
  const rnd = mulberry(91);
  for (let k = 0; k < n; k++) {
    const kind = rnd();
    // ไม้แผ่น / ขวด-ถุงพลาสติก / กล่องโฟม
    size.push(kind < 0.45 ? [1.2 + rnd(), 0.08, 0.25] : kind < 0.8 ? [0.3, 0.12, 0.12] : [0.6, 0.25, 0.4]);
    mesh.setColorAt(k, col.setHex(DEBRIS[Math.floor(rnd() * DEBRIS.length)]));
  }
  let lastKey: unknown = null,
    t = 0;
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    p = new THREE.Vector3(),
    s = new THREE.Vector3();

  function reseed(hEff: Float32Array, kind: Uint8Array): void {
    const deep: number[] = [];
    for (let c = 0; c < hEff.length; c++) if (!kind[c] && levelAt(c) - hEff[c] > 0.3) deep.push(c);
    const r = mulberry(deep.length + 13);
    for (let k = 0; k < n; k++) {
      cell[k] = deep.length ? deep[Math.floor(r() * deep.length)] : -1;
      ox[k] = (r() - 0.5) * cellM;
      oz[k] = (r() - 0.5) * cellM;
      rot[k] = r() * Math.PI * 2;
      ph[k] = r() * 10;
    }
  }

  function tick(dt: number, key: unknown, hEff: Float32Array, kind: Uint8Array, visible: boolean): void {
    mesh.visible = visible;
    if (!visible) return;
    t += dt;
    if (key !== lastKey) {
      reseed(hEff, kind);
      lastKey = key;
    }
    for (let k = 0; k < n; k++) {
      const c = cell[k];
      const depth = c >= 0 ? levelAt(c) - hEff[c] : 0;
      if (c < 0 || depth < 0.12) {
        m.makeScale(0, 0, 0);
        mesh.setMatrixAt(k, m);
        continue;
      }
      const [fx, fz] = flowAt(c);
      ox[k] += fx * dt * 0.8;
      oz[k] += fz * dt * 0.8;
      if (Math.abs(ox[k]) > cellM / 2) ox[k] = -Math.sign(ox[k]) * (cellM / 2 - 0.1);
      if (Math.abs(oz[k]) > cellM / 2) oz[k] = -Math.sign(oz[k]) * (cellM / 2 - 0.1);
      const i = c % frame.nx,
        j = (c / frame.nx) | 0;
      const bob = Math.sin(t * 1.7 + ph[k]) * 0.03;
      p.set(
        frame.x(i) + ox[k] * unit,
        (levelAt(c) + bob) * frame.vex + 0.01 * unit,
        frame.z(j) + oz[k] * unit,
      );
      e.set(Math.sin(t + ph[k]) * 0.08, rot[k] + t * 0.05, Math.cos(t * 0.8 + ph[k]) * 0.08);
      const [a, b, d] = size[k];
      s.set(a * unit, b * unit, d * unit);
      mesh.setMatrixAt(k, m.compose(p, q.setFromEuler(e), s));
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { mesh, tick };
}
