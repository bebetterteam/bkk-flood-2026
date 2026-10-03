/**
 * ขอบเขต กทม./เขต (OSM) → public/data/bangkok-districts.json (เส้นเขตแบบย่อ)
 * + public/data/study-area/index.json (แผ่นที่ตัด กทม., เขตในแต่ละแผ่น, แผ่นที่มีข้อมูล)
 * ต้องรัน scripts/fetch-boundary.ts ก่อน; รันซ้ำได้ทุกเมื่อ (ไม่ขึ้นกับ --tile)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { OUT_ROOT, RAW, ROOT, loadConfig, type StudyConfig } from './lib/config.ts';
import { simplifyRing, type Ring } from './lib/geom.ts';
import { osmTools, pointInRing, type OsmEl } from './lib/osm.ts';
import { allTiles, tileBbox } from '../src/sim/tiles.ts';

const base = loadConfig();
const T = base.tiling;
// พิกัดเมตรท้องถิ่นของทั้งตาราง (ใช้ประกอบ ring ของ relation)
const all: StudyConfig = {
  ...base,
  bbox: { south: T.south, west: T.west, north: T.south + T.rows * T.dLat, east: T.west + T.cols * T.dLon },
};
const { polygonsOf, P } = osmTools(all);
const els: OsmEl[] = JSON.parse(readFileSync(RAW + 'boundary/bangkok.json', 'utf8')).elements;

interface Area {
  name: string;
  nameEn: string;
  polys: { outer: Ring; holes: Ring[] }[];
}
const toArea = (e: OsmEl): Area => ({
  name: e.tags!.name,
  nameEn: (e.tags!['name:en'] ?? '').replace(/ District$/, ''),
  polys: polygonsOf(e),
});
const bkk = toArea(els.find((e) => e.tags?.admin_level === '4')!);
const districts = els
  .filter((e) => e.tags?.admin_level === '6')
  .map(toArea)
  .sort((a, b) => a.name.localeCompare(b.name, 'th'));
if (districts.length !== 50) console.warn(`⚠ ได้ ${districts.length} เขต (คาด 50)`);

const inArea = (a: Area, x: number, y: number) =>
  a.polys.some((p) => pointInRing(x, y, p.outer) && !p.holes.some((h) => pointInRing(x, y, h)));

// ---- แผ่น: สุ่มจุดแบบตาราง 60×60 (~150 ม.) หาสัดส่วนที่อยู่ใน กทม. และเขตที่ครอบ ----
const S = 60;
const built = new Set(base.built);
const tiles = allTiles(T).flatMap((id) => {
  const b = tileBbox(T, id);
  const count = new Map<string, number>();
  let inBkk = 0;
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const [x, y] = P.toXY(b.south + ((j + 0.5) / S) * T.dLat, b.west + ((i + 0.5) / S) * T.dLon);
      if (!inArea(bkk, x, y)) continue;
      inBkk++;
      const d = districts.find((a) => inArea(a, x, y));
      if (d) count.set(d.name, (count.get(d.name) ?? 0) + 1);
    }
  if (!inBkk) return [];
  const ds = [...count].sort((a, b) => b[1] - a[1]);
  const short = (n: string) => n.replace(/^เขต/, '');
  const hasData = existsSync(`${OUT_ROOT}${id}/meta.json`);
  if (built.has(id) && !hasData)
    console.warn(`⚠ ${id} อยู่ใน built แต่ยังไม่มีข้อมูล — รัน npm run data -- --tile=${id}`);
  return [
    {
      id,
      bbox: b,
      name: ds
        .slice(0, 2)
        .map(([n]) => short(n))
        .join(' – '),
      districts: ds.map(([n, c]) => [n, +(c / (S * S)).toFixed(3)] as [string, number]),
      bangkokShare: +(inBkk / (S * S)).toFixed(3),
      built: built.has(id) && hasData,
    },
  ];
});

// ---- เส้นเขต (ย่อ 25 ม.) lat/lon 5 หลัก ----
const ll = (r: Ring) => r.map(([x, y]) => P.toLatLon(x, y).map((v) => +v.toFixed(5)));
const rings = (a: Area) => a.polys.map((p) => ll(simplifyRing(p.outer, 25)));
writeFileSync(
  ROOT + 'public/data/bangkok-districts.json',
  JSON.stringify({
    attribution: '© OpenStreetMap contributors (ODbL)',
    bangkok: rings(bkk),
    districts: districts.map((d) => ({ name: d.name, nameEn: d.nameEn, rings: rings(d) })),
  }) + '\n',
);
writeFileSync(
  OUT_ROOT + 'index.json',
  JSON.stringify({ tiling: T, defaultTile: base.defaultTile, tiles }, null, 1) + '\n',
);
console.log(
  `แผ่นที่ตัด กทม. ${tiles.length} จาก ${T.rows * T.cols}, มีข้อมูล ${tiles.filter((t) => t.built).length}: ` +
    tiles
      .filter((t) => t.built)
      .map((t) => `${t.id} (${t.name})`)
      .join(', '),
);
const missing = districts.filter((d) => !tiles.some((t) => t.districts.some(([n]) => n === d.name)));
if (missing.length) console.warn('⚠ เขตที่ไม่มีแผ่นครอบ:', missing.map((d) => d.name).join(', '));
