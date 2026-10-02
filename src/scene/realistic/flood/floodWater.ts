/**
 * น้ำท่วมแบบสมจริง (โหมดพื้นที่ศึกษา "สมจริง")
 * - ผิวน้ำ = กริดเดียวกับพื้น ตำแหน่งจุดตามระดับน้ำที่ขยายข้ามแนวฝั่ง (fields.ts)
 * - shader ต่อพิกเซล: ความหนาน้ำ = ระดับ − พื้น (bilinear) → ตัดขอบเรียบ, สีดูดกลืนตามความหนา, ตะกอน, ฟอง,
 *   normal ไหลตามทิศกระแส (flow map 2 เฟส), วงกระเพื่อมจากฝน
 * ข้อมูลการจำลองไม่เปลี่ยน — อ่านจากผลเดิม (hEff) และความลึกที่กำลังแสดง (water.cur)
 */
import * as THREE from 'three';
import type { BuildingsMeta } from '../../../data/studyArea';
import type { StudyGrid } from '../../../sim/studyGrid';
import type { SimResult } from '../../../sim/simulate';
import { rasterizePolygons } from '../../../sim/raster';
import type { Frame } from '../../frame';
import { gridGeometry } from '../../terrain';
import { maskMeta } from '../landscape';
import type { Textures } from '../materials';
import { flowField, waterLevel } from './fields';
import { FIELD_GLSL, floodShared } from './floodShared';

/** footprint ตึกเป็น mask 0/255 ความละเอียด ~4 ม. (ใช้ทำฟองรอบตึก) */
export function buildingFootprintMask(meta: BuildingsMeta, bin: ArrayBuffer, mPerPx = 4) {
  const v = <T>(C: new (b: ArrayBuffer, o: number, n: number) => T, k: string): T =>
    new C(bin, meta.offsets[k][0], meta.offsets[k][1]);
  const ringStart = v(Uint32Array, 'ringStart'),
    rvs = v(Uint32Array, 'ringVertStart'),
    rvc = v(Uint16Array, 'ringVertCount'),
    verts = v(Uint16Array, 'verts');
  const Q = meta.quantMeters;
  const [kx, ky] = meta.metersPerDegree;
  const { south, west } = meta.bbox;
  const polys: { outer: number[][]; holes: number[][][] }[] = [];
  for (let b = 0; b < meta.count; b++) {
    const r = ringStart[b];
    const outer: number[][] = [];
    for (let k = 0; k < rvc[r]; k++)
      outer.push([south + (verts[(rvs[r] + k) * 2 + 1] * Q) / ky, west + (verts[(rvs[r] + k) * 2] * Q) / kx]);
    polys.push({ outer, holes: [] });
  }
  const g = maskMeta(meta.bbox, meta.metersPerDegree, mPerPx);
  return { mask: rasterizePolygons(g, polys, new Uint8Array(g.nx * g.nz), 255), nx: g.nx, nz: g.nz };
}

const NOISE_GLSL = /* glsl */ `
float fhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fhash(i), fhash(i + vec2(1, 0)), u.x), mix(fhash(i + vec2(0, 1)), fhash(i + vec2(1, 1)), u.x), u.y);
}
// วงกระเพื่อมจากเม็ดฝน: เซลล์ละ 1 วง เริ่มเวลาสุ่ม ขยายออกแล้วจางหาย → คืนความชันของผิว (x, z)
vec2 rainRipples(vec2 p, float t) {
  vec2 cell = floor(p);
  vec2 acc = vec2(0.0);
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(float(i), float(j));
      vec2 center = c + vec2(fhash(c + 1.3), fhash(c + 7.9));
      float ph = fract(t * 1.1 + fhash(c));
      vec2 d = p - center;
      float r = length(d);
      float wave = sin((r - ph * 1.4) * 28.0) * smoothstep(0.0, 0.15, ph) * (1.0 - ph) * (1.0 - smoothstep(0.0, 0.18, abs(r - ph * 1.4)));
      acc += (d / max(r, 1e-3)) * wave;
    }
  return acc;
}
`;

/** uniform เงาสะท้อน (ตั้งค่าจาก createReflection เมื่อเปิด "สมจริง+") */
export const reflShared = {
  uRefl: { value: null as THREE.Texture | null },
  uReflMat: { value: new THREE.Matrix4() },
  uReflOn: { value: 0 },
};

export function floodMaterial(tx: Textures): THREE.MeshStandardMaterial {
  tx.water.wrapS = tx.water.wrapT = THREE.RepeatWrapping;
  const m = new THREE.MeshStandardMaterial({
    transparent: true,
    depthWrite: false,
    roughness: 0.06,
    metalness: 0,
    envMapIntensity: 0.7,
  });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, floodShared, reflShared);
    sh.uniforms.uWaterN = { value: tx.water };
    sh.uniforms.uTime = { value: 0 };
    m.userData.shader = sh;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWPos;\nvarying vec4 vRefl;\nuniform mat4 uReflMat;',
      )
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvRefl = uReflMat * vec4(vWPos, 1.0);',
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uBMask;\nuniform sampler2D uWaterN;\nuniform float uTime;\nuniform float uRain;\n${FIELD_GLSL}\n${NOISE_GLSL}\nfloat gThick; float gFoam; vec2 gFlow; vec2 gSlope;\nvarying vec4 vRefl;\nuniform sampler2D uRefl;\nuniform float uReflOn;`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        {
          vec4 F = fieldAt(uField, vWPos.xz);
          gThick = F.r - F.g; // ความหนาน้ำ (ม.) ต่อพิกเซล
          if (gThick < 0.004) discard; // ขอบฝั่งโค้งตามพื้นจริง
          gFlow = F.ba;
          float spd = length(gFlow);
          vec2 pm = vWPos.xz * uUnitM; // เมตร
          // ตะกอนขุ่นไหลตามกระแส
          vec2 adv = pm - gFlow * uTime * 4.0;
          float sed = 0.6 * vnoise(adv / 11.0) + 0.4 * vnoise(adv / 3.5);
          vec3 silt = vec3(0.47, 0.38, 0.25), deep = vec3(0.2, 0.15, 0.09);
          vec3 col = mix(silt, deep, 1.0 - exp(-gThick * 1.6));
          col *= 0.84 + 0.3 * sed;
          // ฟอง: ขอบตื้น + รอบตึก + ทางยาวตามกระแสแรง
          vec2 bm = (vWPos.xz - uFieldXf.xy) * uFieldXf.zw;
          vec2 o = 6.0 / uUnitM * uFieldXf.zw; // ~6 ม.
          float near = (texture2D(uBMask, bm + vec2(o.x, 0)).r + texture2D(uBMask, bm - vec2(o.x, 0)).r
            + texture2D(uBMask, bm + vec2(0, o.y)).r + texture2D(uBMask, bm - vec2(0, o.y)).r) * 0.25;
          float inside = texture2D(uBMask, bm).r;
          float shore = 1.0 - smoothstep(0.0, 0.08, gThick);
          vec2 sAxis = spd > 1e-3 ? gFlow / spd : vec2(1.0, 0.0);
          vec2 sp = vec2(dot(adv, sAxis) / 14.0, dot(adv, vec2(-sAxis.y, sAxis.x)) / 1.6);
          float streak = smoothstep(0.72, 0.93, vnoise(sp)) * smoothstep(0.1, 0.45, spd) * 0.6;
          float grain = 0.55 + 0.45 * vnoise(pm / 0.7 + uTime * 0.3);
          gFoam = clamp(shore * 0.85 + near * (1.0 - inside) * 0.9 + streak * 0.7, 0.0, 1.0) * grain;
          col = mix(col, vec3(0.74, 0.69, 0.58), gFoam * 0.8);
          // ความทึบ: น้ำท่วมกรุงเทพฯ ขุ่นมาก — 10 ซม. ยังพอเห็นพื้นจาง ๆ, 30 ซม. ขึ้นไปแทบทึบ
          float a = 0.38 + 0.6 * (1.0 - exp(-gThick * 7.0));
          diffuseColor = vec4(col, clamp(max(a, gFoam * 0.92), 0.0, 0.97));
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.07 + uRain * 0.12, 0.85, gFoam);',
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        {
          // flow map 2 เฟส: normal เลื่อนตามทิศไหล แล้วสลับเฟสไม่ให้ยืดเกิน
          vec2 uv = vWPos.xz * uUnitM / 7.0;
          vec2 fl = gFlow * 1.8;
          float p0 = fract(uTime * 0.16), p1 = fract(uTime * 0.16 + 0.5);
          float w = abs(p0 - 0.5) * 2.0;
          vec3 n0 = texture2D(uWaterN, uv - fl * p0).xyz * 2.0 - 1.0;
          vec3 n1 = texture2D(uWaterN, uv - fl * p1 + 0.37).xyz * 2.0 - 1.0;
          vec3 nd = texture2D(uWaterN, uv * 2.9 + vec2(uTime * 0.013, -uTime * 0.017)).xyz * 2.0 - 1.0;
          // รายละเอียดเล็ก (คลื่นย่อย/วงฝน) จางลงเมื่อ 1 พิกเซลครอบพื้นที่กว้าง (ไกลกล้อง) กันภาพกระพริบเป็นจุด
          float far = clamp(length(fwidth(vWPos.xz * uUnitM)) / 0.6, 0.0, 1.0);
          vec2 slope = mix(n0.xy, n1.xy, w) * (0.07 + length(gFlow) * 0.28) * (1.0 - 0.6 * far) + nd.xy * 0.04 * (1.0 - far);
          slope += rainRipples(vWPos.xz * uUnitM / 1.3, uTime) * 0.3 * uRain * (1.0 - far);
          slope *= 1.0 - gFoam * 0.6;
          gSlope = slope;
          vec3 wn = normalize(vec3(slope.x, 1.0, slope.y));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `if (uReflOn > 0.5) {
          // เงาสะท้อนตึก/ท้องฟ้า บิดตามคลื่น ผสมตาม fresnel (มองเฉียงสะท้อนมาก มองลงตรง ๆ เห็นน้ำขุ่น)
          vec4 rc = vRefl;
          rc.xy += gSlope * 0.15 * rc.w;
          vec3 refl = texture2DProj(uRefl, rc).rgb * 0.85;
          float cosT = clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
          float fres = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);
          outgoingLight = mix(outgoingLight, refl, clamp(fres * 0.9 + 0.05, 0.0, 0.55) * (1.0 - gFoam));
        }
        #include <opaque_fragment>`,
      );
  };
  return m;
}

export function createFloodWater(
  parent: THREE.Object3D,
  f: Frame,
  grid: StudyGrid,
  buildings: { meta: BuildingsMeta; bin: ArrayBuffer },
  tx: Textures,
) {
  const { nx, nz } = f;
  const N = nx * nz;
  const geo = gridGeometry(f);
  const nrm = new Float32Array(N * 3);
  for (let c = 0; c < N; c++) nrm[c * 3 + 1] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  const material = floodMaterial(tx);
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 2;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.visible = false;
  parent.add(mesh);

  // texture ข้อมูล (float RGBA ต่อช่อง) + ระดับน้ำสูงสุด + mask ตึก
  const field = new Float32Array(N * 4),
    maxLevel = new Float32Array(N * 4).fill(-100);
  const fieldTex = new THREE.DataTexture(field, nx, nz, THREE.RGBAFormat, THREE.FloatType);
  const maxTex = new THREE.DataTexture(maxLevel, nx, nz, THREE.RGBAFormat, THREE.FloatType);
  const bm = buildingFootprintMask(buildings.meta, buildings.bin);
  const bmTex = new THREE.DataTexture(bm.mask, bm.nx, bm.nz, THREE.RedFormat, THREE.UnsignedByteType);
  bmTex.magFilter = THREE.LinearFilter;
  bmTex.minFilter = THREE.LinearFilter;
  for (const t of [fieldTex, maxTex, bmTex]) t.needsUpdate = true;

  const cellX = f.x(1) - f.x(0),
    cellZ = f.z(1) - f.z(0);
  floodShared.uField.value = fieldTex;
  floodShared.uMax.value = maxTex;
  floodShared.uBMask.value = bmTex;
  floodShared.uFieldXf.value.set(f.x(0) - cellX / 2, f.z(0) - cellZ / 2, 1 / (nx * cellX), 1 / (nz * cellZ));
  floodShared.uFieldSize.value.set(nx, nz);
  floodShared.uVex.value = f.vex;

  const level = new Float32Array(N);
  let flow: Float32Array = new Float32Array(N * 2);
  let lastSim: SimResult | null = null,
    lastFlow = -1;
  const { bbox, dlat, dlon } = grid.meta;
  const latLon = (i: number, j: number): [number, number] => [
    bbox.north - (j + 0.5) * dlat,
    bbox.west + (i + 0.5) * dlon,
  ];

  /** คำนวณ field ใหม่ (เรียกเมื่อผลการจำลองเปลี่ยนหรือน้ำกำลังเคลื่อน) */
  function refresh(sim: SimResult, cur: Float32Array, riverFlow: number): void {
    const { hEff } = sim;
    if (sim !== lastSim || riverFlow !== lastFlow) {
      flow = flowField(nx, nz, grid.kind, hEff, latLon, Math.min(1, 0.25 + riverFlow / 5000), flow);
      lastSim = sim;
      lastFlow = riverFlow;
    }
    waterLevel(nx, nz, grid.kind, hEff, cur, level);
    const pos = geo.attributes.position.array as Float32Array;
    for (let c = 0; c < N; c++) {
      field[c * 4] = level[c];
      field[c * 4 + 1] = grid.kind[c] ? Math.min(hEff[c], level[c] - 0.5) : hEff[c];
      field[c * 4 + 2] = flow[c * 2];
      field[c * 4 + 3] = flow[c * 2 + 1];
      pos[c * 3 + 1] = level[c] * f.vex;
      // คราบระดับน้ำสูงสุด (เฉพาะช่องที่เคยมีน้ำจริง)
      if (!grid.kind[c] && level[c] - hEff[c] > 0.03 && level[c] > maxLevel[c * 4])
        maxLevel[c * 4] = level[c];
    }
    geo.attributes.position.needsUpdate = true;
    fieldTex.needsUpdate = true;
    maxTex.needsUpdate = true;
  }

  let t = 0;
  return {
    mesh,
    /** dt: วินาที; moving: น้ำกำลังเปลี่ยน (ต้องอัปโหลดใหม่) */
    tick(
      dt: number,
      sim: SimResult,
      cur: Float32Array,
      rain: number,
      riverFlow: number,
      moving: boolean,
    ): void {
      t += dt;
      if (moving || sim !== lastSim || riverFlow !== lastFlow) refresh(sim, cur, riverFlow);
      const sh = material.userData.shader as { uniforms: Record<string, THREE.IUniform> } | undefined;
      if (sh) sh.uniforms.uTime.value = t;
      floodShared.uRain.value += (Math.min(1, rain / 80) - floodShared.uRain.value) * Math.min(1, dt * 2);
    },
    /** ระดับน้ำ (ม.) ที่ช่อง c — ใช้วางวัตถุลอยน้ำ */
    levelAt: (c: number) => level[c],
    flowAt: (c: number): [number, number] => [flow[c * 2], flow[c * 2 + 1]],
  };
}

export type FloodWater = ReturnType<typeof createFloodWater>;
