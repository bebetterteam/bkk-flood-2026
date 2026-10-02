/**
 * เงาสะท้อนบนผิวน้ำ (planar reflection) — ใช้เฉพาะคุณภาพ "สมจริง+" เพราะต้องเรนเดอร์ฉากซ้ำอีกรอบ
 * กล้องเสมือนสะท้อนข้ามระนาบ y = ระดับน้ำใกล้จุดที่มอง + ตัดด้วย oblique near plane (แนวทางเดียวกับ three Reflector)
 */
import * as THREE from 'three';

export function createReflection(renderer: THREE.WebGLRenderer) {
  const size = new THREE.Vector2();
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const vcam = new THREE.PerspectiveCamera();
  const textureMatrix = new THREE.Matrix4();
  const plane = new THREE.Plane(),
    clip = new THREE.Vector4(),
    q = new THREE.Vector4();
  const n = new THREE.Vector3(0, 1, 0);
  const pw = new THREE.Vector3(),
    cw = new THREE.Vector3(),
    view = new THREE.Vector3(),
    target = new THREE.Vector3(),
    lookAt = new THREE.Vector3(),
    rot = new THREE.Matrix4();
  let enabled = false;

  /** เรนเดอร์ภาพสะท้อนที่ระดับ y (โลก) — ซ่อน hide ระหว่างเรนเดอร์ */
  function render(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    y: number,
    hide: THREE.Object3D[],
  ): void {
    if (!enabled) return;
    renderer.getDrawingBufferSize(size);
    const w = Math.max(1, Math.floor(size.x / 2)),
      h = Math.max(1, Math.floor(size.y / 2));
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    pw.set(0, y, 0);
    cw.setFromMatrixPosition(camera.matrixWorld);
    if (cw.y < y + 0.01) return; // กล้องอยู่ใต้น้ำ
    rot.extractRotation(camera.matrixWorld);
    // ตำแหน่ง/ทิศของกล้องเสมือน (สะท้อนข้ามระนาบแนวนอน)
    view.set(cw.x, 2 * y - cw.y, cw.z);
    lookAt.set(0, 0, -1).applyMatrix4(rot).add(cw);
    target.set(lookAt.x, 2 * y - lookAt.y, lookAt.z);
    vcam.position.copy(view);
    vcam.up.set(0, 1, 0).applyMatrix4(rot).reflect(n);
    vcam.lookAt(target);
    vcam.far = camera.far;
    vcam.near = camera.near;
    vcam.fov = camera.fov;
    vcam.aspect = camera.aspect;
    vcam.updateMatrixWorld();
    vcam.projectionMatrix.copy(camera.projectionMatrix);
    textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    textureMatrix.multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse);
    // oblique near plane: ตัดทุกอย่างใต้ผิวน้ำออกจากภาพสะท้อน
    plane.setFromNormalAndCoplanarPoint(n, pw).applyMatrix4(vcam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = vcam.projectionMatrix.elements;
    q.x = (Math.sign(clip.x) + pm[8]) / pm[0];
    q.y = (Math.sign(clip.y) + pm[9]) / pm[5];
    q.z = -1;
    q.w = (1 + pm[10]) / pm[14];
    clip.multiplyScalar(2 / clip.dot(q));
    pm[2] = clip.x;
    pm[6] = clip.y;
    pm[10] = clip.z + 1 - 0.003;
    pm[14] = clip.w;

    const vis = hide.map((o) => o.visible);
    hide.forEach((o) => (o.visible = false));
    const prevRT = renderer.getRenderTarget(),
      autoShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false; // ใช้ shadow map จากเฟรมหลัก ไม่เรนเดอร์เงาซ้ำ
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, vcam);
    renderer.setRenderTarget(prevRT);
    renderer.shadowMap.autoUpdate = autoShadow;
    hide.forEach((o, k) => (o.visible = vis[k]));
  }

  return {
    texture: rt.texture,
    textureMatrix,
    render,
    setEnabled(on: boolean) {
      enabled = on;
    },
    isEnabled: () => enabled,
  };
}
