/** ตรวจว่า onBeforeCompile ของวัสดุโหมดสมจริงแทนที่ chunk ได้จริงใน shader ของ three.js เวอร์ชันที่ใช้ */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  groundMaterial,
  roadMaterial,
  wallMaterial,
  waterMaterial,
  type Textures,
} from '../src/scene/realistic/materials';

const t = () => new THREE.Texture();
const tx = Object.fromEntries(
  [
    'asphalt',
    'asphaltN',
    'pavement',
    'pavementN',
    'grass',
    'grassN',
    'plaster',
    'plasterN',
    'roofClay',
    'roofClayN',
    'water',
  ].map((k) => [k, t()]),
) as unknown as Textures;

function compile(m: THREE.Material) {
  const sh = {
    uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader,
  };
  m.onBeforeCompile(
    sh as unknown as THREE.WebGLProgramParametersWithUniforms,
    undefined as unknown as THREE.WebGLRenderer,
  );
  return sh;
}

describe('shader ของโหมดสมจริง', () => {
  it('พื้น: ใส่ mask และ wet', () => {
    const sh = compile(groundMaterial(tx, new THREE.DataTexture()));
    expect(sh.vertexShader).toContain('vMaskUv = maskUv');
    expect(sh.fragmentShader).toContain('gMask = texture2D(uMask, vMaskUv)');
    expect(sh.fragmentShader).toContain('roughnessFactor = mix(roughnessFactor, 0.28');
    expect(sh.uniforms.uMask).toBeDefined();
  });
  it('ผนัง: หน้าต่าง + ปรับ roughness/metalness', () => {
    const sh = compile(wallMaterial(tx));
    expect(sh.vertexShader).toContain('vFacade = facade');
    expect(sh.fragmentShader).toContain('winMask = wx * wy');
    expect(sh.fragmentShader).toContain('roughnessFactor = mix(roughnessFactor, 0.06, winMask)');
    expect(sh.fragmentShader).toContain('metalnessFactor = mix(metalnessFactor');
  });
  it('ถนน: เส้นจราจร', () => {
    const sh = compile(roadMaterial(tx));
    expect(sh.vertexShader).toContain('vRoad = roadInfo');
    expect(sh.fragmentShader).toContain('float lanes = floor(vRoad.w / 16.0)');
    expect(sh.fragmentShader).toContain('roughnessFactor = mix(roughnessFactor, 0.18, uWet)');
  });
  it('น้ำ: normal map 2 ชั้นเคลื่อนไหว', () => {
    const sh = compile(waterMaterial(tx));
    expect(sh.fragmentShader).toContain('uTime * 0.012');
    expect(sh.fragmentShader).not.toContain('#include <normal_fragment_maps>');
  });
});
