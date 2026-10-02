/** ตรวจว่า onBeforeCompile ของวัสดุโหมดสมจริงแทนที่ chunk ได้จริงใน shader ของ three.js เวอร์ชันที่ใช้ */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { groundMaterial, roadMaterial, wallMaterial, type Textures } from '../src/scene/realistic/materials';
import { floodMaterial } from '../src/scene/realistic/flood/floodWater';

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
  it('น้ำท่วม: ความหนาต่อพิกเซล, flow map, ฝน, ฟอง', () => {
    const sh = compile(floodMaterial(tx));
    expect(sh.vertexShader).toContain('vWPos = (modelMatrix');
    expect(sh.fragmentShader).toContain('gThick = F.r - F.g');
    expect(sh.fragmentShader).toContain('if (gThick < 0.004) discard');
    expect(sh.fragmentShader).toContain('rainRipples(');
    expect(sh.fragmentShader).toContain('roughnessFactor = mix(0.07 + uRain');
    expect(sh.fragmentShader).toContain('normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz)');
    expect(sh.uniforms.uField).toBeDefined();
  });
  it('ผนัง: คราบน้ำและเส้นระดับน้ำสูงสุด', () => {
    const sh = compile(wallMaterial(tx));
    expect(sh.vertexShader).toContain('vWPos = (modelMatrix');
    expect(sh.fragmentShader).toContain('float under = wet');
    expect(sh.uniforms.uMax).toBeDefined();
  });
});
