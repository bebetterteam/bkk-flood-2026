/**
 * วัสดุของโหมดสมจริง: MeshStandardMaterial + แก้ shader (onBeforeCompile) เพื่อให้ยังได้แสง เงา และ env map ของ three.js
 * - พื้น: ทางเท้า/หญ้า/ป่า/คลอง/ลานวัดตาม mask + พื้นเปียกเมื่อฝนตก
 * - ผนังตึก: หน้าต่างตามชั้น (3.2 ม.) ตามชนิดหน้าต่าง, กระจกสะท้อนท้องฟ้า
 * - ถนน: เส้นจราจร (กึ่งกลางเหลือง/แบ่งเลน/ขอบทาง) และรางรถไฟ
 */
import * as THREE from 'three';

export interface Textures {
  asphalt: THREE.Texture;
  asphaltN: THREE.Texture;
  pavement: THREE.Texture;
  pavementN: THREE.Texture;
  grass: THREE.Texture;
  grassN: THREE.Texture;
  plaster: THREE.Texture;
  plasterN: THREE.Texture;
  roofClay: THREE.Texture;
  roofClayN: THREE.Texture;
  water: THREE.Texture;
}

export async function loadTextures(
  renderer: THREE.WebGLRenderer,
  base = import.meta.env.BASE_URL + 'textures/',
): Promise<Textures> {
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const load = async (f: string, srgb: boolean) => {
    const t = await loader.loadAsync(base + f);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const [
    asphalt,
    asphaltN,
    pavement,
    pavementN,
    grass,
    grassN,
    plaster,
    plasterN,
    roofClay,
    roofClayN,
    water,
  ] = await Promise.all([
    load('asphalt_diff.jpg', true),
    load('asphalt_nor.jpg', false),
    load('pavement_diff.jpg', true),
    load('pavement_nor.jpg', false),
    load('grass_diff.jpg', true),
    load('grass_nor.jpg', false),
    load('plaster_diff.jpg', true),
    load('plaster_nor.jpg', false),
    load('roof_clay_diff.jpg', true),
    load('roof_clay_nor.jpg', false),
    load('waternormals.jpg', false),
  ]);
  return {
    asphalt,
    asphaltN,
    pavement,
    pavementN,
    grass,
    grassN,
    plaster,
    plasterN,
    roofClay,
    roofClayN,
    water,
  };
}

/** uniform ที่ใช้ร่วมกัน (ความเปียก 0..1, เวลา) */
export const shared = { uWet: { value: 0 }, uTime: { value: 0 } };

const AA = /* glsl */ `
float bandAA(float x, float a, float b, float w) {
  return smoothstep(a - w, a + w, x) - smoothstep(b - w, b + w, x);
}
float hash12(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

export function groundMaterial(tx: Textures, mask: THREE.DataTexture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    map: tx.pavement,
    normalMap: tx.pavementN,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.92,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMask = { value: mask };
    sh.uniforms.uGrass = { value: tx.grass };
    sh.uniforms.uWet = shared.uWet;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 maskUv;\nvarying vec2 vMaskUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMaskUv = maskUv;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D uMask;\nuniform sampler2D uGrass;\nuniform float uWet;\nvarying vec2 vMaskUv;\nvec4 gMask;',
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        {
        vec3 pave = texture2D(map, vMapUv).rgb;
        vec3 grassC = texture2D(uGrass, vMapUv * 0.5).rgb;
        gMask = texture2D(uMask, vMaskUv);
        vec3 col = pave * vec3(0.92, 0.9, 0.86);
        col = mix(col, grassC, gMask.r);
        col = mix(col, grassC * vec3(0.55, 0.75, 0.5), gMask.g);
        col = mix(col, pave * vec3(1.12, 1.06, 0.95), gMask.a * 0.85);
        col = mix(col, vec3(0.11, 0.16, 0.15), gMask.b);
        col *= mix(1.0, 0.62, uWet * (1.0 - gMask.b));
        diffuseColor.rgb *= col;
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.28, uWet * (1.0 - 0.7 * max(gMask.r, gMask.g)));
        roughnessFactor = mix(roughnessFactor, 0.12, gMask.b);`,
      );
  };
  return m;
}

export function wallMaterial(tx: Textures): THREE.MeshStandardMaterial {
  tx.plaster.repeat.set(0.25, 0.25); // 1 รอบ texture = 4 ม.
  tx.plasterN.repeat.set(0.25, 0.25);
  const m = new THREE.MeshStandardMaterial({
    map: tx.plaster,
    normalMap: tx.plasterN,
    normalScale: new THREE.Vector2(0.5, 0.5),
    vertexColors: true,
    roughness: 0.85,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWet = shared.uWet;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float facade;\nvarying float vFacade;\nvarying vec2 vWallUv;',
      )
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvFacade = facade;\nvWallUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uWet;\nvarying float vFacade;\nvarying vec2 vWallUv;\nfloat winMask = 0.0;\n${AA}`,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `#include <map_fragment>
        if (vFacade > 0.5) {
          float sx = vFacade < 1.5 ? 3.6 : (vFacade < 2.5 ? 3.0 : 2.4);
          vec2 g = vec2(vWallUv.x / sx, vWallUv.y / 3.2);
          vec2 f = fract(g);
          vec2 w = fwidth(g) * 0.8 + 1e-4;
          float wx = vFacade > 2.5 ? bandAA(f.x, 0.04, 0.96, w.x) : bandAA(f.x, 0.28, 0.72, w.x);
          float wy = vFacade > 2.5 ? bandAA(f.y, 0.1, 0.94, w.y) : bandAA(f.y, 0.32, 0.8, w.y);
          winMask = wx * wy * step(0.4, g.y);
          // ชั้นล่างของตึกพาณิชย์: กระจกหน้าร้าน
          if (vFacade > 2.5 && g.y < 1.0) winMask = bandAA(f.x, 0.06, 0.94, w.x) * bandAA(f.y, 0.08, 0.85, w.y);
          float r = hash12(floor(g));
          vec3 glass = vFacade > 2.5 ? vec3(0.16, 0.22, 0.27) + r * 0.05 : vec3(0.07, 0.08, 0.09) + r * 0.06;
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, winMask);
          // ขอบหน้าต่างและคราบฝน
          diffuseColor.rgb *= 1.0 - 0.08 * (1.0 - smoothstep(0.0, 0.08, f.y));
        }
        diffuseColor.rgb *= mix(1.0, 0.8, uWet);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.06, winMask);',
      )
      .replace(
        '#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, vFacade > 2.5 ? 0.85 : 0.4, winMask);',
      );
  };
  return m;
}

export function roofFlatMaterial(tx: Textures): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: tx.pavement,
    normalMap: tx.pavementN,
    vertexColors: true,
    roughness: 0.95,
    flatShading: true,
    side: THREE.DoubleSide,
  });
}

export function roofTileMaterial(tx: Textures): THREE.MeshStandardMaterial {
  tx.roofClay.repeat.set(1.5, 1.5);
  tx.roofClayN.repeat.set(1.5, 1.5);
  return new THREE.MeshStandardMaterial({
    map: tx.roofClay,
    normalMap: tx.roofClayN,
    vertexColors: true,
    roughness: 0.7,
    flatShading: true,
    side: THREE.DoubleSide,
  });
}

export function roadMaterial(tx: Textures): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    map: tx.asphalt,
    normalMap: tx.asphaltN,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughness: 0.9,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWet = shared.uWet;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 roadInfo;\nvarying vec4 vRoad;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvRoad = roadInfo;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uWet;\nvarying vec4 vRoad;\nfloat paintMask = 0.0;\n${AA}`,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `#include <map_fragment>
        {
        float x = vRoad.x, along = vRoad.y, w = vRoad.z;
        float lanes = floor(vRoad.w / 16.0);
        float mark = mod(vRoad.w, 16.0);
        float aw = fwidth(x) + 1e-3;
        float dash = step(0.45, fract(along / 9.0));
        vec3 paintC = vec3(0.92, 0.92, 0.88);
        if (mark >= 8.0) {
          // ราง: หินโรยทาง + หมอน + ราง 2 เส้น
          vec3 ballast = vec3(0.36, 0.33, 0.3) * (0.8 + 0.4 * texture2D(map, vMapUv * 2.0).r);
          float sleeper = bandAA(fract(along / 0.6), 0.1, 0.55, fwidth(along / 0.6) + 1e-3) * bandAA(x, w * 0.5 - 1.3, w * 0.5 + 1.3, aw);
          diffuseColor.rgb = mix(ballast, vec3(0.42, 0.38, 0.33), sleeper);
          float rails = bandAA(x, w * 0.5 - 0.79, w * 0.5 - 0.71, aw) + bandAA(x, w * 0.5 + 0.71, w * 0.5 + 0.79, aw);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.62, 0.64), clamp(rails, 0.0, 1.0));
          paintMask = clamp(rails, 0.0, 1.0);
        } else {
          float p = 0.0;
          float yel = 0.0;
          if (mod(mark, 2.0) >= 1.0) { yel = bandAA(x, w * 0.5 - 0.08, w * 0.5 + 0.08, aw); }
          if (mod(floor(mark / 2.0), 2.0) >= 1.0) {
            for (int i = 1; i < 8; i++) {
              if (float(i) >= lanes) break;
              float c = w * float(i) / lanes;
              p = max(p, bandAA(x, c - 0.07, c + 0.07, aw) * dash);
            }
          }
          if (mod(floor(mark / 4.0), 2.0) >= 1.0) {
            p = max(p, bandAA(x, 0.3, 0.45, aw));
            p = max(p, bandAA(x, w - 0.45, w - 0.3, aw));
          }
          diffuseColor.rgb *= vec3(0.78);
          diffuseColor.rgb = mix(diffuseColor.rgb, paintC, p * 0.9);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.72, 0.16), yel * 0.9);
          paintMask = max(p, yel);
        }
        diffuseColor.rgb *= mix(1.0, 0.6, uWet * (1.0 - paintMask));
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.18, uWet);\nroughnessFactor = mix(roughnessFactor, 0.5, paintMask);',
      );
  };
  return m;
}

/** น้ำท่วม/แม่น้ำ: ใช้สีตามความลึกจาก vertex color + normal map เคลื่อนไหว + สะท้อน env map */
export function waterMaterial(tx: Textures): THREE.MeshStandardMaterial {
  tx.water.repeat.set(1, 1);
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    color: 0xc9b99a, // โทนน้ำขุ่น
    transparent: true,
    opacity: 0.9,
    roughness: 0.06,
    metalness: 0.1,
    normalMap: tx.water,
    normalScale: new THREE.Vector2(0.35, 0.35),
    depthWrite: false,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        vec3 n1 = texture2D(normalMap, vNormalMapUv + vec2(uTime * 0.012, uTime * 0.007)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, vNormalMapUv * 1.7 - vec2(uTime * 0.009, -uTime * 0.011)).xyz * 2.0 - 1.0;
        vec3 mapN = normalize(vec3((n1.xy + n2.xy) * normalScale, n1.z * n2.z));
        normal = normalize(tbn * mapN);`,
      );
  };
  return m;
}
