/**
 * เขื่อนและคันกั้นน้ำของโหมดภาพรวม แบบต่อเนื่องตามแนวเส้น (แทนกล่องต่อเซลล์ที่เป็นขั้นบันได)
 * - เขื่อนริมเจ้าพระยา: กำแพงคอนกรีตบาง มีขอบบนสีอ่อน ทั้งสองฝั่งแม่น้ำ
 * - คันกั้นน้ำ (พระราชดำริ/ชายฝั่ง/สุวรรณภูมิ): คันดินสี่เหลี่ยมคางหมู ลาดหญ้า สันเป็นทาง
 * เฉพาะการแสดงผล — ความสูงอ่านจากช่องเขื่อนของกริด (wallTop) และพื้น (hEff) ที่ใกล้ที่สุด การจำลองยังใช้ช่องเดิม
 */
import * as THREE from 'three';
import { KING_DIKE, RIVER, SUVARNA, coastLat, LON0, LON1, type Polyline } from '../data/geo';
import { WALL_AIRPORT, WALL_COAST, WALL_KING, WALL_RIVER, type Grid } from '../sim/grid';
import { wallTop, type SimParams } from '../sim/simulate';
import { overviewFrame as f } from './frame';
import type { InfraPart } from './highlight';

/** ระยะจากเส้นกลางแม่น้ำถึงแนวเขื่อน (องศา) — ช่องแม่น้ำคือ d < 0.0042 */
const RIVER_OFFSET = 0.0048;

/**
 * หน้าตัด: [ระยะออกด้านข้าง (หน่วยโลก), ระยะเพิ่มต่อความสูง 1 หน่วย, สัดส่วนความสูง 0–1, สี]
 * เรียงรอบรูปจากโคนซ้ายถึงโคนขวา — คันดินกว้างขึ้นตามความสูง ไม่งั้นความสูงที่ขยายเกินจริงทำให้ดูเป็นหน้าผา
 */
type Profile = readonly (readonly [number, number, number, number])[];
const CONCRETE = 0xb3bac1,
  CONCRETE_FOOT = 0x7b838a,
  CAP = 0xe4e7ea,
  GRASS = 0x7a9a52,
  GRASS_FOOT = 0x56703a,
  CREST = 0xbfae8c;
const FLOODWALL: Profile = [
  [-0.035, 0, 0, CONCRETE_FOOT],
  [-0.035, 0, 0.92, CONCRETE],
  [-0.045, 0, 0.92, CAP],
  [-0.045, 0, 1, CAP],
  [0.045, 0, 1, CAP],
  [0.045, 0, 0.92, CAP],
  [0.035, 0, 0.92, CONCRETE],
  [0.035, 0, 0, CONCRETE_FOOT],
];
const DIKE: Profile = [
  [-0.06, -0.35, 0, GRASS_FOOT],
  [-0.06, 0, 1, GRASS],
  [-0.045, 0, 1, CREST],
  [0.045, 0, 1, CREST],
  [0.06, 0, 1, GRASS],
  [0.06, 0.35, 0, GRASS_FOOT],
];

/** แบ่งจุดเส้นให้ถี่ทุก step องศา */
function resample(line: Polyline, step: number): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < line.length - 1; k++) {
    const [a0, b0] = line[k],
      [a1, b1] = line[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(a1 - a0, b1 - b0) / step));
    for (let q = 0; q < n; q++) out.push([a0 + ((a1 - a0) * q) / n, b0 + ((b1 - b0) * q) / n]);
  }
  out.push([line[line.length - 1][0], line[line.length - 1][1]]);
  return out;
}

/** เลื่อนเส้นออกด้านข้าง (side = ±1) แล้วเกลี่ยให้โค้งเรียบ */
function offsetLine(pts: [number, number][], d: number, side: number): [number, number][] {
  const off = pts.map(([la, lo], k) => {
    const [pa, po] = pts[Math.max(0, k - 1)],
      [na, no] = pts[Math.min(pts.length - 1, k + 1)];
    const ta = na - pa,
      to = no - po,
      L = Math.hypot(ta, to) || 1;
    // ตั้งฉากใน (lat, lon): (−to, ta)/L
    return [la + (side * d * -to) / L, lo + (side * d * ta) / L] as [number, number];
  });
  for (let pass = 0; pass < 3; pass++)
    for (let k = 1; k < off.length - 1; k++)
      for (const a of [0, 1] as const) off[k][a] = (off[k - 1][a] + 2 * off[k][a] + off[k + 1][a]) / 4;
  return off;
}

interface Strip {
  pts: [number, number][];
  /** ช่องเขื่อนที่ใช้อ่านความสูงของแต่ละจุด */
  cells: number[];
}

/** หาช่องเขื่อนชนิด types ที่ใกล้จุดที่สุด (รัศมี 2 ช่อง); ไม่มี = −1 */
function nearestWallCell(grid: Grid, lat: number, lon: number, types: readonly number[]): number {
  const c0 = f.cellAt(lat, lon),
    i0 = c0 % f.nx,
    j0 = (c0 / f.nx) | 0;
  let best = -1,
    bd = 1e9;
  for (let dj = -2; dj <= 2; dj++)
    for (let di = -2; di <= 2; di++) {
      const i = i0 + di,
        j = j0 + dj;
      if (i < 0 || j < 0 || i >= f.nx || j >= f.nz) continue;
      const c = j * f.nx + i;
      if (!types.includes(grid.wallType[c])) continue;
      const d = (f.x(i) - f.wx(lon)) ** 2 + (f.z(j) - f.wz(lat)) ** 2;
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
  return best;
}

/** ตัดเส้นเป็นช่วงที่ทุกจุดอยู่ในกรอบและมีช่องเขื่อนรองรับ */
function strips(grid: Grid, pts: [number, number][], types: readonly number[]): Strip[] {
  const out: Strip[] = [];
  let cur: Strip | null = null;
  for (const p of pts) {
    const c = f.inBounds(p[0], p[1]) ? nearestWallCell(grid, p[0], p[1], types) : -1;
    if (c < 0) {
      cur = null;
      continue;
    }
    if (!cur) out.push((cur = { pts: [], cells: [] }));
    cur.pts.push(p);
    cur.cells.push(c);
  }
  return out.filter((s) => s.pts.length >= 2);
}

/** mesh เดียวต่อชนิด: แต่ละหน้าของหน้าตัดเป็นแถบแยก (ขอบคม) ลากตามเส้น + ฝาปิดหัวท้าย */
function buildMesh(list: Strip[], prof: Profile) {
  const pos: number[] = [],
    col: number[] = [],
    index: number[] = [];
  /** [strip, จุด, มุมหน้าตัด] → index ของ vertex ใน pos (สำหรับอัปเดตความสูง) */
  const meta: { s: number; k: number; p: number }[] = [];
  const color = new THREE.Color();
  const addV = (s: number, k: number, p: number) => {
    meta.push({ s, k, p });
    pos.push(0, 0, 0);
    color.setHex(prof[p][3]);
    col.push(color.r, color.g, color.b);
    return meta.length - 1;
  };
  list.forEach((st, s) => {
    const n = st.pts.length;
    for (let e = 0; e < prof.length - 1; e++) {
      const base: number[] = [];
      for (let k = 0; k < n; k++) base.push(addV(s, k, e), addV(s, k, e + 1));
      for (let k = 0; k < n - 1; k++) {
        const a = base[2 * k],
          b = base[2 * k + 1],
          c = base[2 * k + 2],
          d = base[2 * k + 3];
        index.push(a, c, b, b, c, d);
      }
    }
    // ฝาปิดหัว/ท้าย (fan จากมุมแรก)
    for (const k of [0, n - 1]) {
      const ids = prof.map((_, p) => addV(s, k, p));
      for (let p = 1; p < ids.length - 1; p++)
        if (k === 0) index.push(ids[0], ids[p], ids[p + 1]);
        else index.push(ids[0], ids[p + 1], ids[p]);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(index);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
  );

  // ทิศตั้งฉากในโลก (x, z) ต่อจุด — คงที่
  const normals = list.map((st) =>
    st.pts.map((_, k) => {
      const [pa, po] = st.pts[Math.max(0, k - 1)],
        [na, no] = st.pts[Math.min(st.pts.length - 1, k + 1)];
      const tx = f.wx(no) - f.wx(po),
        tz = f.wz(na) - f.wz(pa),
        L = Math.hypot(tx, tz) || 1;
      return [-tz / L, tx / L] as const;
    }),
  );

  function update(grid: Grid, hEff: Float32Array, P: SimParams): void {
    const arr = geo.attributes.position.array as Float32Array;
    meta.forEach(({ s, k, p }, v) => {
      const st = list[s],
        c = st.cells[k],
        [la, lo] = st.pts[k],
        [nx, nz] = normals[s][k];
      const base = hEff[c] * f.vex,
        top = Math.max(base + 0.02, wallTop(grid, P, c) * f.vex);
      const [d0, dh, h] = prof[p],
        dx = d0 + dh * (top - base);
      arr[v * 3] = f.wx(lo) + nx * dx;
      arr[v * 3 + 1] = base - 0.05 + (top - base + 0.05) * h; // จมโคนลงพื้นเล็กน้อยกันช่องว่าง
      arr[v * 3 + 2] = f.wz(la) + nz * dx;
    });
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }
  return { mesh, update };
}

export function createWallLines(scene: THREE.Object3D, grid: Grid) {
  const river = resample(RIVER, 0.0012);
  const riverStrips = [-1, 1].flatMap((side) =>
    strips(grid, offsetLine(river, RIVER_OFFSET, side), [WALL_RIVER]),
  );

  const coast: [number, number][][] = [[], []];
  for (let lo = LON0; lo <= LON1 + 1e-9; lo += 0.002)
    if (Math.abs(lo - 100.592) > 0.012) coast[lo < 100.592 ? 0 : 1].push([coastLat(lo) + 0.0125, lo]);
  const ring: [number, number][] = [];
  for (let a = 0; a <= 96; a++) {
    const t = (a / 96) * Math.PI * 2;
    ring.push([SUVARNA.lat + SUVARNA.r * Math.sin(t), SUVARNA.lon + SUVARNA.r * Math.cos(t)]);
  }
  const dikeStrips: [number, Strip[]][] = [
    [WALL_KING, strips(grid, resample(KING_DIKE, 0.002), [WALL_KING])],
    [WALL_COAST, coast.flatMap((c) => (c.length > 1 ? strips(grid, c, [WALL_COAST]) : []))],
    [WALL_AIRPORT, strips(grid, ring, [WALL_AIRPORT])],
  ];

  const walls = buildMesh(riverStrips, FLOODWALL);
  // คันแต่ละแนวเป็น mesh แยก (เลือก/ไฮไลท์ทีละแนวได้)
  const dikes = dikeStrips.map(([type, list]) => ({ type, ...buildMesh(list, DIKE) }));
  scene.add(walls.mesh, ...dikes.map((d) => d.mesh));

  function update(hEff: Float32Array, P: SimParams): void {
    walls.mesh.visible = P.walls;
    walls.update(grid, hEff, P);
    for (const d of dikes) {
      d.mesh.visible = P.dikes;
      d.update(grid, hEff, P);
    }
  }
  const parts: InfraPart[] = [
    { kind: 'wall', mesh: walls.mesh },
    ...dikes.map((d) => ({ kind: 'dike' as const, id: d.type, mesh: d.mesh })),
  ];
  return { update, parts };
}
