/**
 * uniform ที่ใช้ร่วมระหว่างผิวน้ำและผนังตึก (คราบน้ำ/เส้นระดับน้ำ)
 * texture ถูกตั้งค่าจริงโดย createFloodWater — ก่อนหน้านั้นเป็น texture ว่าง (ผนังไม่มีคราบ)
 */
import * as THREE from 'three';

const empty = () => {
  // ค่าเริ่มต้น = แห้ง (ระดับน้ำ −100 ต่ำกว่าพื้น 0)
  const t = new THREE.DataTexture(new Float32Array([-100, 0, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
  t.needsUpdate = true;
  return t;
};

export const floodShared = {
  /** RGBA: ระดับน้ำ (ม.), พื้น (ม.), ทิศไหล x, z */
  uField: { value: empty() as THREE.Texture },
  /** R: ระดับน้ำสูงสุดที่เคยแสดง (ม.) */
  uMax: { value: empty() as THREE.Texture },
  /** footprint ตึก (0/1) ความละเอียด ~4 ม. */
  uBMask: { value: empty() as THREE.Texture },
  /** x0, z0 (โลก), 1/กว้าง, 1/ยาว ของกริด */
  uFieldXf: { value: new THREE.Vector4(0, 0, 1, 1) },
  /** จำนวนช่อง nx, nz */
  uFieldSize: { value: new THREE.Vector2(1, 1) },
  /** ความสูง (ม.) → y โลก */
  uVex: { value: 0.3 },
  /** เมตรต่อ 1 หน่วยโลก (แนวนอน/ตึก) */
  uUnitM: { value: 10 },
  uRain: { value: 0 },
};

/** GLSL: อ่าน field แบบ bilinear ด้วย texelFetch (texture float ไม่ต้องพึ่ง extension กรองแบบ linear) */
export const FIELD_GLSL = /* glsl */ `
uniform sampler2D uField;
uniform sampler2D uMax;
uniform vec4 uFieldXf;
uniform vec2 uFieldSize;
uniform float uVex;
uniform float uUnitM;
vec4 fieldTexel(sampler2D t, ivec2 p) {
  return texelFetch(t, clamp(p, ivec2(0), ivec2(uFieldSize) - 1), 0);
}
vec4 fieldAt(sampler2D t, vec2 xz) {
  vec2 p = (xz - uFieldXf.xy) * uFieldXf.zw * uFieldSize - 0.5;
  vec2 i = floor(p), f = p - i;
  ivec2 q = ivec2(i);
  vec4 a = fieldTexel(t, q), b = fieldTexel(t, q + ivec2(1, 0)), c = fieldTexel(t, q + ivec2(0, 1)), d = fieldTexel(t, q + ivec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;
