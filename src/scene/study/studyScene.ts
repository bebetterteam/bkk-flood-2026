/** ฉากโหมด "พื้นที่ศึกษา (ข้อมูลจริง)": พื้นจาก DEM, ตึก OSM (มาตราส่วนจริง), แม่น้ำ, เขื่อน, น้ำ */
import * as THREE from 'three';
import { LABELS, STUDY_LABELS } from '../../data/places';
import type { StudyData } from '../../data/studyArea';
import type { SimParams } from '../../sim/simulate';
import type { StudyGrid } from '../../sim/studyGrid';
import { clamp } from '../../sim/math';
import { STUDY_UNIT_M, studyFrame, type Frame } from '../frame';
import { gridGeometry, type ViewMode } from '../terrain';
import { createWater } from '../water';
import { createWalls } from '../walls';
import { createLabels } from '../labels';
import { createRain, createRiverFlow } from '../particles';
import { createInfra } from '../infra';
import { buildBuildingTiles, type BuildingArrays } from './buildingGeometry';

/** สเกลสีความสูงของพื้นที่ศึกษา [ม., สี] (ช่วงกว้างกว่าภาพรวมเพราะ DEM ยังไม่ได้ปรับ datum) */
export const STUDY_ELEV: [number, number][] = [
  [0, 0x6b46c1],
  [1.5, 0x2f80ed],
  [3, 0x22a39f],
  [4, 0x7cc36b],
  [5, 0xe9c46a],
  [7, 0xe07a3f],
  [10, 0x962828],
];
const ELEV_C = STUDY_ELEV.map(([h, c]) => [h, new THREE.Color(c)] as const);
function elevColor(h: number, out: THREE.Color) {
  if (h <= ELEV_C[0][0]) return out.copy(ELEV_C[0][1]);
  for (let k = 1; k < ELEV_C.length; k++)
    if (h <= ELEV_C[k][0])
      return out
        .copy(ELEV_C[k - 1][1])
        .lerp(ELEV_C[k][1], (h - ELEV_C[k - 1][0]) / (ELEV_C[k][0] - ELEV_C[k - 1][0]));
  return out.copy(ELEV_C[ELEV_C.length - 1][1]);
}
const COL = {
  low: new THREE.Color(0xb9c4a0),
  high: new THREE.Color(0xd6cfc2),
  canal: new THREE.Color(0x3c8fb0),
  bed: new THREE.Color(0x7b6c55),
};

export interface StudyScene {
  group: THREE.Group;
  frame: Frame;
  grid: StudyGrid;
  water: ReturnType<typeof createWater>;
  labels: ReturnType<typeof createLabels>;
  buildings: BuildingArrays;
  updateTerrain(hEff: Float32Array, viewMode: ViewMode, P: SimParams): void;
  updateWalls(hEff: Float32Array, P: SimParams): void;
  tick(dt: number, P: SimParams): void;
  pickBuilding(ray: THREE.Raycaster): { b: number; point: THREE.Vector3 } | null;
  /** ชื่อประเภทอาคาร (แท็ก building) จาก index */
  buildingTypeName(i: number): string;
  /** ขนาดพื้นที่ (หน่วยโลก) */
  size: [number, number];
  /** ส่วนที่โหมดสมจริงใช้ร่วม/ซ่อน */
  internals: {
    terrainGeometry: THREE.BufferGeometry;
    /** วัตถุแบบเรียบง่ายที่ต้องซ่อนเมื่อเปิดโหมดสมจริง */
    simpleObjects: THREE.Object3D[];
    /** y ที่ตึกเลื่อนลงตามการทรุดตัว (หน่วยโลก) */
    subsidenceY(): number;
  };
}

export function createStudyScene(
  parent: THREE.Object3D,
  labelBox: HTMLElement,
  grid: StudyGrid,
  data: StudyData,
  terrainExaggeration: number,
): StudyScene {
  const group = new THREE.Group();
  group.visible = false;
  parent.add(group);
  const f = studyFrame(grid.meta, terrainExaggeration);
  const { nx, nz } = f;
  const W = nx * f.cell,
    D = nz * f.cell;

  // พื้น
  const geo = gridGeometry(f);
  const terrainMesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
  );
  group.add(terrainMesh);
  const water = createWater(group, grid, f);
  // ฐานใต้แผนที่
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(W, 4, D),
    new THREE.MeshStandardMaterial({ color: 0x5b5246, roughness: 1 }),
  );
  base.position.set(0, -1.6 * f.vex - 2.05, 0);
  group.add(base);
  const walls = createWalls(group, grid, f);

  // ตึก: มาตราส่วนจริง (เมตร → หน่วยโลก) วางบนพื้นที่ขยายแนวดิ่งแล้ว
  const bm = data.buildings.meta;
  const kx = bm.metersPerDegree[0],
    ky = bm.metersPerDegree[1];
  const toLL = (xm: number, ym: number): [number, number] => [
    bm.bbox.south + ym / ky,
    bm.bbox.west + xm / kx,
  ];
  const { tiles, arrays } = buildBuildingTiles(
    bm,
    data.buildings.bin,
    (xm, ym) => {
      const [lat, lon] = toLL(xm, ym);
      return [f.wx(lon), f.wz(lat)];
    },
    (xm, ym) => {
      const [lat, lon] = toLL(xm, ym);
      return grid.demMsl[f.cellAt(lat, lon)] * f.vex;
    },
    1 / STUDY_UNIT_M,
  );
  const bGroup = new THREE.Group();
  group.add(bGroup);
  const bMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    side: THREE.DoubleSide,
    roughness: 0.8,
  });
  const bMeshes = tiles.map((T) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(T.position, 3));
    g.setAttribute('color', new THREE.BufferAttribute(T.color, 3));
    g.setIndex(new THREE.BufferAttribute(T.index, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const m = new THREE.Mesh(g, bMat);
    m.userData.faceBuilding = T.faceBuilding;
    bGroup.add(m);
    return m;
  });

  const labels = createLabels(
    labelBox,
    [...LABELS.filter(([, la, lo]) => f.inBounds(la, lo)), ...STUDY_LABELS],
    f,
    3,
  );
  // สถานีสูบ/อุโมงค์ (วางอุโมงค์บนพื้นให้มองเห็น — ของจริงอยู่ใต้ดิน)
  const infra = createInfra(group, f, { r: 4, h: 10, tube: 2, tunnelOnGround: true });
  const rnd = (() => {
    let a = 7;
    return () => {
      a = (a * 16807) % 2147483647;
      return a / 2147483647;
    };
  })();
  const rain = createRain(group, rnd, { w: W, h: 150, d: D, size: 0.8, speed: 7 });
  const flow = createRiverFlow(group, rnd, f, { size: 1.6, spread: 25, clip: true });

  const tc = new THREE.Color();
  function updateTerrain(hEff: Float32Array, viewMode: ViewMode, P: SimParams): void {
    const pos = geo.attributes.position.array as Float32Array,
      col = geo.attributes.color.array as Float32Array;
    for (let c = 0; c < nx * nz; c++) {
      pos[c * 3 + 1] = hEff[c] * f.vex;
      if (grid.kind[c]) tc.copy(COL.bed);
      else if (viewMode === 'elev') elevColor(grid.demMsl[c] - (P.subs / 100) * grid.subW[c], tc);
      else {
        tc.copy(COL.low).lerp(COL.high, clamp((hEff[c] - 1) / 4, 0, 1));
        if (grid.canal[c]) tc.lerp(COL.canal, 0.75);
      }
      col[c * 3] = tc.r;
      col[c * 3 + 1] = tc.g;
      col[c * 3 + 2] = tc.b;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.computeVertexNormals();
    // ตึกทรุดตามพื้น (subW ในพื้นที่นี้คงที่ — ใช้ค่าเฉลี่ย)
    bGroup.position.y = -(P.subs / 100) * meanSubW * f.vex;
    walls.update(hEff, P);
    infra.update(hEff, P);
  }
  let meanSubW = 0;
  for (let c = 0; c < nx * nz; c++) meanSubW += grid.subW[c] / (nx * nz);

  const hits: THREE.Intersection[] = [];
  function pickBuilding(ray: THREE.Raycaster) {
    hits.length = 0;
    ray.intersectObjects(bMeshes, false, hits);
    const h = hits[0];
    if (!h || h.faceIndex == null) return null;
    const fb = (h.object as THREE.Mesh).userData.faceBuilding as Uint32Array;
    return { b: fb[h.faceIndex], point: h.point.clone().setY(h.point.y - bGroup.position.y) };
  }

  return {
    group,
    frame: f,
    grid,
    water,
    labels,
    buildings: arrays,
    updateTerrain,
    updateWalls(hEff, P) {
      walls.update(hEff, P);
      infra.update(hEff, P);
    },
    tick(dt, P) {
      rain.tick(dt, P);
      flow.tick(dt, P);
    },
    pickBuilding,
    buildingTypeName: (i) => bm.typeNames[i] ?? 'other',
    size: [W, D],
    internals: {
      terrainGeometry: geo,
      simpleObjects: [terrainMesh, bGroup, rain.points, flow.points],
      subsidenceY: () => bGroup.position.y,
    },
  };
}
