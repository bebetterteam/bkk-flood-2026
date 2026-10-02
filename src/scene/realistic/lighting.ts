/** แสงของโหมดสมจริง: ท้องฟ้า (Sky), ดวงอาทิตย์พร้อมเงาที่ตามกล้อง, env map จากท้องฟ้า (สะท้อนบนกระจก/น้ำ) */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

/**
 * ดวงอาทิตย์ช่วงเช้าเดือนพฤษภาคม (~08:30 ที่ละติจูด 13.7°N): ทิศ ~75° (ตะวันออกค่อนเหนือ) สูง ~35°
 * เลือกมุมนี้เพราะมุมกล้องสำเร็จรูปมองจากทิศตะวันตกเฉียงใต้ เงาจะตกมาทางกล้อง (ตะวันตกเฉียงใต้) จึงเห็นชัด
 * — แดดบ่าย/แดดจากทิศใต้ เงาจะตกหลังตึกจนมองไม่เห็น (ตรวจด้วยภาพจริงแล้ว)
 * แปลงเป็นมุม theta ของ setFromSphericalCoords (วัดจาก +z = ใต้ ไปทาง +x = ตะวันออก): theta = 540° − ทิศเข็มทิศ
 */
const ELEVATION = 35,
  COMPASS = 75,
  AZIMUTH = (540 - COMPASS) % 360;

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

  // env map (แสงรอบตัว + เงาสะท้อนบนกระจก/น้ำ): ทรงกลมไล่สีฟ้า→ขอบฟ้า→พื้น *ไม่มีดวงอาทิตย์*
  // ถ้าใช้ Sky ตรง ๆ จุดดวงอาทิตย์ใน env map จะส่องแสงแบบไม่มีเงา ทำให้เงาตึกจางจนมองไม่เห็น
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const sphere = new THREE.SphereGeometry(100, 32, 16);
  const cols: number[] = [];
  const zen = new THREE.Color(0x5d8fc9),
    hor = new THREE.Color(0xdfe7ee),
    gnd = new THREE.Color(0x77706a),
    tmp = new THREE.Color();
  const sp = sphere.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const y = sp.getY(i) / 100;
    if (y >= 0) tmp.copy(hor).lerp(zen, Math.pow(y, 0.6));
    else tmp.copy(hor).lerp(gnd, Math.min(1, -y * 4));
    cols.push(tmp.r, tmp.g, tmp.b);
  }
  sphere.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  envScene.add(
    new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })),
  );
  const envMap = pmrem.fromScene(envScene, 0, 0.1, 500).texture;
  pmrem.dispose();
  sphere.dispose();

  const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // bias เป็นสัดส่วนของช่วงความลึกของกล้องเงา (far − near ≈ 1,300 หน่วย) ต้องเล็กมาก ไม่งั้นเงาตึกเตี้ยหายหมด
  sun.shadow.bias = -0.00003;
  sun.shadow.normalBias = 0.02;
  group.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xd6e6ff, 0x8c8272, 0.3);
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
    sun.position.set(tx + dir.x * 600, dir.y * 600, tz + dir.z * 600);
    if (cam.right !== half) {
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.near = 100;
      cam.far = 1400;
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
