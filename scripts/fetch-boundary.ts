/** ดึงขอบเขตกรุงเทพมหานครและ 50 เขต (OSM admin_level 4/6) → data/raw/boundary/bangkok.json  (© OpenStreetMap contributors, ODbL) */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { RAW, loadConfig } from './lib/config.ts';
import { overpass } from './lib/overpass.ts';

const cfg = loadConfig();
const out = RAW + 'boundary/bangkok.json';
mkdirSync(RAW + 'boundary', { recursive: true });
if (existsSync(out) && !process.argv.includes('--force')) console.log('มีแล้ว:', out);
else {
  const data = (await overpass(
    cfg.overpassUrl,
    `[out:json][timeout:180];
rel["boundary"="administrative"]["admin_level"="4"]["name"="กรุงเทพมหานคร"]->.bkk;
.bkk map_to_area->.a;
(.bkk; rel(area.a)["boundary"="administrative"]["admin_level"="6"];);
out geom;`,
  )) as { elements: unknown[] };
  writeFileSync(out, JSON.stringify(data));
  console.log(`ขอบเขต: ${data.elements.length} relation → ${out}`);
}
