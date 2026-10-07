/**
 * โหมด "สมจริง" ของพื้นที่ศึกษา: ใช้ Frame/กริด/ผลจำลองเดียวกับโหมดเรียบง่าย เปลี่ยนเฉพาะการแสดงผล
 * พื้น (texture ตาม mask) · ถนน/ทางยกระดับ/ราง · ตึกมีหน้าต่างและหลังคา · ต้นไม้ · น้ำสะท้อนแสง · ท้องฟ้า เงา ฝน
 */
import * as THREE from 'three';
import type { RealisticData } from '../../data/realisticData';
import type { StudyData } from '../../data/studyArea';
import type { SimParams, SimResult } from '../../sim/simulate';
import type { StudyScene } from '../study/studyScene';
import { STUDY_UNIT_M } from '../frame';
import { buildRoadGeometry } from './roadGeometry';
import { buildRealBuildingTiles } from './buildingGeometryReal';
import { groundMask, maskMeta, placeTrees } from './landscape';
import {
  groundMaterial,
  loadTextures,
  roadMaterial,
  roofFlatMaterial,
  roofTileMaterial,
  wallMaterial,
} from './materials';
import { createLighting } from './lighting';
import { createWeather } from './weather';
import { createFloodWater, reflShared } from './flood/floodWater';
import { CAR_COLORS, carGeometry, createDebris, placeCars } from './flood/props';
import { createReflection } from './flood/reflection';
import { disposeObject } from '../dispose';

export type Quality = 'simple' | 'real' | 'high';

export async function createRealisticScene(opts: {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  stageLights: THREE.Light[];
  study: StudyScene;
  studyData: StudyData;
  data: RealisticData;
  /** เพดาน pixel ratio ตามคุณภาพ (null = คืนค่าปกติ) — ให้ adaptive quality คุม ถ้าไม่ระบุตั้งที่ renderer เอง */
  pixelCap?: (cap: number | null) => void;
}) {
  const { scene, renderer, study, studyData, data } = opts;
  const f = study.frame;
  const grid = study.grid;
  const unit = 1 / STUDY_UNIT_M;
  const tx = await loadTextures(renderer);

  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);
  /** วัตถุที่ต้องทรุดตามพื้น (ตึก ถนน เสา ต้นไม้) */
  const shift = new THREE.Group();
  root.add(shift);

  // เมตรท้องถิ่น ↔ โลก (ใช้ bbox/metersPerDegree เดียวกับไฟล์ข้อมูล)
  const rm = data.roads.meta;
  const [kx, ky] = rm.metersPerDegree;
  const toLL = (xm: number, ym: number): [number, number] => [
    rm.bbox.south + ym / ky,
    rm.bbox.west + xm / kx,
  ];
  const toWorld = (xm: number, ym: number): [number, number] => {
    const [la, lo] = toLL(xm, ym);
    return [f.wx(lo), f.wz(la)];
  };
  // ความสูงพื้นแบบ bilinear ระหว่างจุดกลางช่อง (ตรงกับผิว mesh มากกว่าค่าช่องเดียว)
  const { nx, nz, dlat, dlon, bbox } = grid.meta;
  const groundY = (xm: number, ym: number) => {
    const [la, lo] = toLL(xm, ym);
    const fi = Math.min(nx - 1.001, Math.max(0, (lo - bbox.west) / dlon - 0.5)),
      fj = Math.min(nz - 1.001, Math.max(0, (bbox.north - la) / dlat - 0.5));
    const i = Math.floor(fi),
      j = Math.floor(fj),
      ti = fi - i,
      tj = fj - j;
    const h = (a: number, b: number) => {
      const c = b * nx + a;
      return grid.kind[c] ? Math.max(grid.demMsl[c], 0) : grid.demMsl[c];
    };
    const v =
      h(i, j) * (1 - ti) * (1 - tj) +
      h(i + 1, j) * ti * (1 - tj) +
      h(i, j + 1) * (1 - ti) * tj +
      h(i + 1, j + 1) * ti * tj;
    return v * f.vex;
  };

  // ---- พื้น: ใช้ geometry เดียวกับโหมดเรียบง่าย (ขยับตามการทรุดอัตโนมัติ) + UV ----
  const tg = study.internals.terrainGeometry;
  {
    const uv = new Float32Array(nx * nz * 2),
      muv = new Float32Array(nx * nz * 2);
    const p = tg.attributes.position.array as Float32Array;
    for (let c = 0; c < nx * nz; c++) {
      // texture ทางเท้า 1 รอบ = 6 ม.
      uv[c * 2] = (p[c * 3] * STUDY_UNIT_M) / 6;
      uv[c * 2 + 1] = (p[c * 3 + 2] * STUDY_UNIT_M) / 6;
      muv[c * 2] = ((c % nx) + 0.5) / nx;
      muv[c * 2 + 1] = (Math.floor(c / nx) + 0.5) / nz;
    }
    tg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    tg.setAttribute('maskUv', new THREE.BufferAttribute(muv, 2));
  }
  const mm = maskMeta(bbox, rm.metersPerDegree);
  const maskTex = new THREE.DataTexture(groundMask(mm, data.green, studyData.inputs.canals), mm.nx, mm.nz);
  maskTex.magFilter = THREE.LinearFilter;
  maskTex.minFilter = THREE.LinearMipmapLinearFilter;
  maskTex.generateMipmaps = true;
  maskTex.needsUpdate = true;
  const ground = new THREE.Mesh(tg, groundMaterial(tx, maskTex));
  ground.receiveShadow = true;
  root.add(ground);

  // ---- ถนน ----
  const rg = buildRoadGeometry(rm, data.roads.bin, toWorld, groundY, unit);
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.BufferAttribute(rg.position, 3));
  roadGeo.setAttribute('uv', new THREE.BufferAttribute(rg.uv, 2));
  roadGeo.setAttribute('roadInfo', new THREE.BufferAttribute(rg.roadInfo, 4));
  roadGeo.setIndex(new THREE.BufferAttribute(rg.index, 1));
  roadGeo.computeVertexNormals();
  roadGeo.addGroup(0, rg.surfaceCount, 0);
  roadGeo.addGroup(rg.surfaceCount, rg.index.length - rg.surfaceCount, 1);
  const concrete = new THREE.MeshStandardMaterial({
    color: 0xb9b4aa,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const roads = new THREE.Mesh(roadGeo, [roadMaterial(tx), concrete]);
  roads.castShadow = true;
  roads.receiveShadow = true;
  shift.add(roads);
  // เสาทางยกระดับ
  const np = rg.pillars.length / 4;
  const pillars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), concrete, np);
  {
    const m = new THREE.Matrix4();
    for (let k = 0; k < np; k++) {
      const [x, y, z, h] = rg.pillars.subarray(k * 4, k * 4 + 4);
      m.makeScale(1.8 * unit, Math.max(0.01, h), 2.2 * unit).setPosition(x, y, z);
      pillars.setMatrixAt(k, m);
    }
  }
  pillars.castShadow = true;
  pillars.receiveShadow = true;
  shift.add(pillars);

  // ---- ตึก ----
  const wallM = wallMaterial(tx),
    flatM = roofFlatMaterial(tx),
    tileM = roofTileMaterial(tx);
  const bm = studyData.buildings.meta;
  const btiles = buildRealBuildingTiles(bm, studyData.buildings.bin, toWorld, groundY, unit);
  for (const T of btiles) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(T.position, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(T.uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(T.color, 3));
    g.setAttribute('facade', new THREE.BufferAttribute(T.facade, 1));
    g.setIndex(new THREE.BufferAttribute(T.index, 1));
    T.groups.forEach(([s, c], k) => g.addGroup(s, c, k));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, [wallM, flatM, tileM]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    shift.add(mesh);
  }

  // ---- ต้นไม้ (instanced: ลำต้น + พุ่มทรงเหลี่ยม) ----
  const trees = placeTrees(data, bbox, rm.metersPerDegree);
  const nt = trees.length / 4;
  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.12, 0.2, 1, 5, 1, true).translate(0, 0.5, 0),
    new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 1 }),
    nt,
  );
  const crown = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
    nt,
  );
  {
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      e = new THREE.Euler(),
      c = new THREE.Color();
    for (let k = 0; k < nt; k++) {
      const xm = trees[k * 4],
        ym = trees[k * 4 + 1],
        s = trees[k * 4 + 2],
        hue = trees[k * 4 + 3];
      const [x, z] = toWorld(xm, ym);
      const y = groundY(xm, ym);
      const h = (6 + s * 9) * unit,
        r = (2.2 + s * 3) * unit;
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(r * 0.9, h * 0.55, r * 0.9));
      trunk.setMatrixAt(k, m);
      q.setFromEuler(e.set(0, hue * 6.28, 0));
      m.compose(new THREE.Vector3(x, y + h * 0.62, z), q, new THREE.Vector3(r, r * 0.8, r));
      crown.setMatrixAt(k, m);
      q.identity();
      crown.setColorAt(k, c.setHSL(0.25 + hue * 0.07, 0.55, 0.12 + s * 0.07));
    }
  }
  crown.castShadow = true;
  crown.receiveShadow = true;
  trunk.castShadow = true;
  shift.add(trunk, crown);

  // ---- น้ำท่วมแบบสมจริง (mesh ใหม่ แทน mesh น้ำแบบเรียบง่ายเมื่อเปิดโหมดนี้) ----
  const wm = study.water.mesh;
  const flood = createFloodWater(root, f, grid, studyData.buildings, tx);

  // ---- รถจอดริมถนน (บอกขนาดความลึก: 30 ซม. ท่วมล้อ, 1 ม. ท่วมกระจก) ----
  const carPos = placeCars(rm, data.roads.bin, 5000);
  const nCar = carPos.length / 4;
  const cars = new THREE.InstancedMesh(
    carGeometry().scale(unit, unit, unit),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.25,
      envMapIntensity: 0.8,
    }),
    nCar,
  );
  {
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      up = new THREE.Vector3(0, 1, 0),
      one = new THREE.Vector3(1, 1, 1),
      p = new THREE.Vector3(),
      c = new THREE.Color();
    for (let k = 0; k < nCar; k++) {
      const [xm, ym, ang, hue] = carPos.subarray(k * 4, k * 4 + 4);
      const [x, z] = toWorld(xm, ym);
      p.set(x, groundY(xm, ym), z);
      cars.setMatrixAt(k, m.compose(p, q.setFromAxisAngle(up, ang), one));
      cars.setColorAt(k, c.setHex(CAR_COLORS[Math.floor(hue * CAR_COLORS.length) % CAR_COLORS.length]));
    }
  }
  cars.receiveShadow = true;
  shift.add(cars);

  // ---- ขยะลอยน้ำ + เงาสะท้อน (สมจริง+) ----
  const debris = createDebris(root, f, grid.cellM, unit, flood.levelAt, flood.flowAt);
  const refl = createReflection(renderer);
  reflShared.uRefl.value = refl.texture;
  reflShared.uReflMat.value = refl.textureMatrix;

  // ---- แสง ท้องฟ้า ฝน ----
  const [W, D] = study.size;
  const light = createLighting(renderer, root, Math.max(W, D));
  const weather = createWeather(root);

  let active = false;
  const saved = {
    toneMapping: renderer.toneMapping,
    exposure: renderer.toneMappingExposure,
    pixelRatio: renderer.getPixelRatio(),
  };

  function setQuality(q: Quality): void {
    const on = q !== 'simple';
    active = on;
    root.visible = on;
    for (const o of study.internals.simpleObjects) o.visible = !on;
    for (const l of opts.stageLights) l.visible = !on;
    wm.visible = !on;
    flood.mesh.visible = on;
    scene.environment = on ? light.envMap : null;
    renderer.shadowMap.enabled = on;
    renderer.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    renderer.toneMapping = on ? THREE.ACESFilmicToneMapping : saved.toneMapping;
    renderer.toneMappingExposure = on ? 0.75 : saved.exposure;
    light.setShadowQuality(q === 'high' ? 4096 : 2048);
    crown.castShadow = q === 'high';
    cars.castShadow = q === 'high';
    refl.setEnabled(q === 'high');
    reflShared.uReflOn.value = q === 'high' ? 1 : 0;
    if (opts.pixelCap) opts.pixelCap(on ? (q === 'high' ? 2 : 1.5) : null);
    else {
      renderer.setPixelRatio(q === 'high' ? Math.min(devicePixelRatio, 2) : Math.min(devicePixelRatio, 1.5));
      if (!on) renderer.setPixelRatio(saved.pixelRatio);
    }
  }

  /** เรียกเมื่อพื้นเปลี่ยน (การทรุดตัว) */
  function update(): void {
    shift.position.y = study.internals.subsidenceY();
  }

  /** sim: ผลการจำลองปัจจุบัน, moving: น้ำกำลังเปลี่ยนระดับ (ต้องคำนวณผิวน้ำใหม่) */
  function tick(
    dt: number,
    P: SimParams,
    camera: THREE.Camera,
    target: THREE.Vector3,
    sim: SimResult | null,
    moving: boolean,
  ): void {
    if (!active) return;
    light.follow(camera, target);
    weather.tick(dt, P.rain, target);
    if (!sim) return;
    flood.tick(dt, sim, study.water.cur, P.rain, P.flow, moving);
    debris.tick(dt, sim, sim.hEff, grid.kind, true);
    if (refl.isEnabled()) {
      // ระนาบสะท้อน = ระดับน้ำที่จุดที่กล้องมอง (ถ้าตรงนั้นมีน้ำ)
      const c = f.cellAt(f.latOfZ(target.z), f.lonOfX(target.x));
      const lvl = flood.levelAt(c);
      const wet = grid.kind[c] !== 0 || lvl - sim.hEff[c] > 0.02;
      reflShared.uReflOn.value = wet ? 1 : 0;
      if (wet)
        refl.render(scene, camera as THREE.PerspectiveCamera, lvl * f.vex, [
          flood.mesh,
          weather.lines,
          debris.mesh,
        ]);
    }
  }

  /** คืนค่า renderer/ฉากแบบเรียบง่าย แล้วคืนหน่วยความจำทั้งหมด (สลับแผ่น) */
  function dispose(): void {
    setQuality('simple');
    disposeObject(root);
    refl.dispose();
    light.envMap.dispose();
    reflShared.uRefl.value = null;
  }

  return { setQuality, update, tick, dispose, isActive: () => active };
}

export type RealisticScene = Awaited<ReturnType<typeof createRealisticScene>>;
