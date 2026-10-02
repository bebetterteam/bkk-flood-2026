/** โหลดข้อมูลเพิ่มเติมของโหมดสมจริง (ถนน สวน ต้นไม้) — สร้างด้วย scripts/build-osm-real.ts */
export interface RoadsMeta {
  count: number;
  vertices: number;
  quantMeters: number;
  extentMeters: [number, number];
  metersPerDegree: [number, number];
  bbox: { south: number; west: number; north: number; east: number };
  offsets: Record<string, [number, number]>;
  classes: string[];
}
export interface GreenPolygon {
  kind: 'grass' | 'wood' | 'temple' | 'pitch' | 'cemetery';
  outer: number[][];
  holes: number[][][];
}
export interface RealisticData {
  roads: { meta: RoadsMeta; bin: ArrayBuffer };
  green: GreenPolygon[];
  trees: { count: number; quantMeters: number; xy: Uint16Array };
}

export async function loadRealisticData(
  base = import.meta.env.BASE_URL + 'data/study-area/',
): Promise<RealisticData> {
  const get = async (f: string) => {
    const r = await fetch(base + f);
    if (!r.ok) throw new Error(`โหลด ${f} ไม่สำเร็จ (HTTP ${r.status})`);
    return r;
  };
  const [rm, rb, green, tm, tb] = await Promise.all([
    get('roads.json').then((r) => r.json()),
    get('roads.bin').then((r) => r.arrayBuffer()),
    get('green.json').then((r) => r.json()),
    get('trees.json').then((r) => r.json()),
    get('trees.bin').then((r) => r.arrayBuffer()),
  ]);
  return {
    roads: { meta: rm, bin: rb },
    green: green.polygons,
    trees: { count: tm.count, quantMeters: tm.quantMeters, xy: new Uint16Array(tb) },
  };
}
