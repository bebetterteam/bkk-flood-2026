/** ดึงข้อมูล OSM ผ่าน Overpass → data/raw/osm/*.json  (© OpenStreetMap contributors, ODbL) */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { RAW, UA, loadConfig } from './lib/config.ts';

const cfg = loadConfig();
const { south: s, west: w, north: n, east: e } = cfg.bbox;
const dir = RAW + 'osm/';
mkdirSync(dir, { recursive: true });
const force = process.argv.includes('--force');

/** เซิร์ฟเวอร์หลักจาก config + mirror สาธารณะ (สลับเมื่อ 429/504) */
const ENDPOINTS = [
  cfg.overpassUrl,
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

async function overpass(query: string): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    const url = ENDPOINTS[(attempt - 1) % ENDPOINTS.length];
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'data=' + encodeURIComponent(query),
    });
    if (r.ok) return r.json();
    if (attempt >= 6) throw new Error(`Overpass HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    console.warn(`  ${new URL(url).host} HTTP ${r.status} ลองเซิร์ฟเวอร์ถัดไป…`);
    await new Promise((res) => setTimeout(res, 5000 * attempt));
  }
}

async function save(name: string, query: string) {
  const path = dir + name + '.json';
  if (existsSync(path) && !force) return console.log('มีแล้ว:', name);
  const t = Date.now();
  const data = (await overpass(query)) as { elements: unknown[] };
  writeFileSync(path, JSON.stringify(data));
  console.log(`${name}: ${data.elements.length} elements (${((Date.now() - t) / 1000).toFixed(1)} วิ)`);
}

// geometry ของแม่น้ำ/คลองดึงแบบเต็ม (ไม่ clip) เพื่อให้ประกอบ ring ของ multipolygon ได้ครบ แล้วค่อย clip ตอน build
// ตึก: แบ่ง 2×2 ส่วนเพื่อไม่ให้ Overpass timeout (ตึกที่คร่อมเส้นแบ่งอาจซ้ำ — build-osm ตัดซ้ำด้วย id)
const midLat = (s + n) / 2,
  midLon = (w + e) / 2;
const parts = [
  [s, w, midLat, midLon],
  [s, midLon, midLat, e],
  [midLat, w, n, midLon],
  [midLat, midLon, n, e],
];
for (const [k, [a, b, c, d]] of parts.entries()) {
  await save(
    `buildings-${k}`,
    `[out:json][timeout:180];(way["building"](${a},${b},${c},${d});relation["building"]["type"="multipolygon"](${a},${b},${c},${d}););out geom;`,
  );
}
const bb = `${s},${w},${n},${e}`;
await save(
  'river',
  `[out:json][timeout:180];(way["water"="river"](${bb});relation["water"="river"](${bb});way["waterway"="riverbank"](${bb});relation["waterway"="riverbank"](${bb}););out geom;`,
);
await save(
  'canals',
  `[out:json][timeout:180];(way["waterway"="canal"](${bb});way["water"="canal"](${bb});relation["water"="canal"](${bb}););out geom;`,
);

// ---- MVP 3: สำหรับโหมดสมจริง ----
// ถนน (แบ่ง 2×2 เหมือนตึก; geometry ไม่ clip — build ตัดเอง)
for (const [k, [a, b, c, d]] of parts.entries()) {
  await save(`roads-${k}`, `[out:json][timeout:180];way["highway"](${a},${b},${c},${d});out geom;`);
}
await save(
  'green',
  `[out:json][timeout:180];(way["leisure"~"^(park|garden|pitch|golf_course)$"](${bb});relation["leisure"~"^(park|garden)$"](${bb});way["landuse"~"^(grass|forest|recreation_ground|meadow|village_green|cemetery)$"](${bb});relation["landuse"~"^(grass|forest|recreation_ground)$"](${bb});way["natural"~"^(wood|scrub|grassland)$"](${bb});way["amenity"="place_of_worship"]["building"!~"."](${bb}););out geom;`,
);
await save('trees', `[out:json][timeout:180];node["natural"="tree"](${bb});out;`);
await save(
  'rail',
  `[out:json][timeout:180];way["railway"~"^(rail|subway|light_rail|monorail)$"](${bb});out geom;`,
);
