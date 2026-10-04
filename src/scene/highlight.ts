/** ไฮไลท์ระบบป้องกันที่เลือก (เรืองแสงกะพริบช้า) + หาชิ้นที่คลิกโดน */
import * as THREE from 'three';

export type InfraKind = 'wall' | 'dike' | 'pump' | 'tunnel';
/** id = ชิ้นเฉพาะ (index สถานีสูบ / ชนิดคัน WALL_*) — ไม่มี = ทั้งชนิด */
export type Selection = { kind: InfraKind; id?: number } | null;

export interface InfraPart {
  kind: InfraKind;
  id?: number;
  mesh: THREE.Mesh;
}

const GLOW = new THREE.Color(0xffc23d);

export function createHighlighter(parts: InfraPart[]) {
  let active: InfraPart[] = [];
  let t = 0;
  const saved = new Map<THREE.Mesh, { emissive: THREE.Color; intensity: number; scale: THREE.Vector3 }>();

  const matOf = (m: THREE.Mesh) => m.material as THREE.MeshStandardMaterial;

  function restore(): void {
    for (const p of active) {
      const s = saved.get(p.mesh);
      if (!s) continue;
      const mat = matOf(p.mesh);
      mat.emissive.copy(s.emissive);
      mat.emissiveIntensity = s.intensity;
      p.mesh.scale.copy(s.scale);
    }
    saved.clear();
    active = [];
  }

  function set(sel: Selection): void {
    restore();
    if (!sel) return;
    active = parts.filter((p) => p.kind === sel.kind && (sel.id === undefined || p.id === sel.id));
    for (const p of active) {
      const mat = matOf(p.mesh);
      saved.set(p.mesh, {
        emissive: mat.emissive.clone(),
        intensity: mat.emissiveIntensity,
        scale: p.mesh.scale.clone(),
      });
      mat.emissive.copy(GLOW);
    }
    t = 0;
  }

  function tick(dt: number): void {
    if (!active.length) return;
    t += dt;
    const k = 0.5 + 0.5 * Math.sin(t * 4);
    for (const p of active) {
      matOf(p.mesh).emissiveIntensity = 0.35 + 0.85 * k;
      // สถานีสูบเล็กมากในภาพรวม: ขยายเป็นจังหวะให้เห็น
      if (p.kind === 'pump') p.mesh.scale.copy(saved.get(p.mesh)!.scale).multiplyScalar(1 + 0.35 * k);
    }
  }

  function visible(o: THREE.Object3D): boolean {
    for (let x: THREE.Object3D | null = o; x; x = x.parent) if (!x.visible) return false;
    return true;
  }

  /** ชิ้นที่มองเห็นและรังสีชนใกล้สุด (พร้อมระยะ ไว้เทียบกับพื้นที่บังอยู่) */
  function pick(ray: THREE.Raycaster): { part: InfraPart; distance: number } | null {
    const vis = parts.filter((p) => visible(p.mesh));
    const hits = ray.intersectObjects(
      vis.map((p) => p.mesh),
      false,
    );
    if (!hits.length) return null;
    const part = vis.find((p) => p.mesh === hits[0].object);
    return part ? { part, distance: hits[0].distance } : null;
  }

  return { set, tick, pick, dispose: restore };
}
