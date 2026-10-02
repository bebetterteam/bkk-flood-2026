/** แสงของโหมดสมจริง: ท้องฟ้า (Sky), ดวงอาทิตย์พร้อมเงาที่ตามกล้อง, env map จากท้องฟ้า (สะท้อนบนกระจก/น้ำ) */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

/** ทิศดวงอาทิตย์: บ่ายแก่ ๆ ทางตะวันตกเฉียงใต้ สูง 38° — ให้เห็นเงาตึกชัด */
const ELEVATION = 38,
  AZIMUTH = 235;

export function createLighting(renderer: THREE.WebGLRenderer, root: THREE.Object3D, extent: number) {
  const group = new THREE.Group();
  root.add(group);
  const dir = new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - ELEVATION),
    THREE.MathUtils.degToRad(AZIMUTH),
  );

  const sky = new Sky();
  sky.scale.setScalar(extent * 4);
  const u = sky.material.uniforms;
  u.turbidity.value = 8;
  u.rayleigh.value = 1.6;
  u.mieCoefficient.value = 0.006;
  u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(dir);
  group.add(sky);

  // env map: เรนเดอร์ท้องฟ้าแยกครั้งเดียวด้วย PMREM
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(1000);
  Object.assign(envSky.material.uniforms.sunPosition.value, dir);
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG'] as const)
    envSky.material.uniforms[k].value = u[k].value;
  envScene.add(envSky);
  const envMap = pmrem.fromScene(envScene, 0, 0.1, 2000).texture;
  pmrem.dispose();

  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  group.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xd6e6ff, 0x8c8272, 0.55);
  group.add(hemi);

  /** ให้กล่องเงาตามจุดที่กล้องมอง (ขนาดตามระยะกล้อง) */
  function follow(camera: THREE.Camera, target: THREE.Vector3): void {
    const dist = camera.position.distanceTo(target);
    const half = THREE.MathUtils.clamp(dist * 0.7, 40, 420);
    const cam = sun.shadow.camera;
    // จัดตำแหน่งให้ตรง texel ลดการกระพริบของเงาเวลากล้องเลื่อน
    const texel = (half * 2) / sun.shadow.mapSize.x;
    const tx = Math.round(target.x / texel) * texel,
      tz = Math.round(target.z / texel) * texel;
    sun.target.position.set(tx, 0, tz);
    sun.position.set(tx + dir.x * 900, dir.y * 900, tz + dir.z * 900);
    if (cam.right !== half) {
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.near = 1;
      cam.far = 2400;
      cam.updateProjectionMatrix();
    }
  }
  function setShadowQuality(size: number): void {
    if (sun.shadow.mapSize.x === size) return;
    sun.shadow.mapSize.set(size, size);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  return { group, sun, envMap, follow, setShadowQuality };
}
