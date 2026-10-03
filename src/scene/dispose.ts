import * as THREE from 'three';

/** คืนหน่วยความจำ GPU ของทุก geometry/material/texture ใต้ obj แล้วถอดออกจาก parent (ใช้ตอนสลับแผ่น) */
export function disposeObject(obj: THREE.Object3D): void {
  const textures = new Set<THREE.Texture>();
  const collect = (v: unknown) => {
    if (v instanceof THREE.Texture) textures.add(v);
  };
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    if (m instanceof THREE.InstancedMesh) m.dispose();
    for (const mat of m.material ? ([] as THREE.Material[]).concat(m.material) : []) {
      for (const v of Object.values(mat)) collect(v);
      const u = (mat as THREE.ShaderMaterial).uniforms;
      if (u) for (const x of Object.values(u)) collect(x?.value);
      mat.dispose();
    }
    if (o instanceof THREE.Light) o.dispose();
  });
  for (const t of textures) t.dispose();
  obj.removeFromParent();
}
