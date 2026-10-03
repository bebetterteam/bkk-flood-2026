/** สร้าง public/data/study-area/<tile>/dem.f32 + meta.json จาก DEM ดิบ */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { OUT, OUT_ROOT, RAW, TILE, loadConfig } from './lib/config.ts';
import { gridSpec, resampleDem } from './lib/dem.ts';

const cfg = loadConfig();
const spec = gridSpec(cfg);
const fab = RAW + 'dem/' + cfg.dem.fabdemTile;
const cop = RAW + 'dem/copernicus_N13E100.tif';
const useFab = cfg.dem.source === 'fabdem' && existsSync(fab);
const path = useFab ? fab : cop;
if (!existsSync(path)) throw new Error('ไม่พบ DEM ดิบ — รัน npm run data:fetch ก่อน');

const { heights, missing, source } = await resampleDem(path, cfg, spec);
if (missing) throw new Error(`DEM มีช่องว่าง ${missing} ช่อง`);
mkdirSync(OUT, { recursive: true });
writeFileSync(OUT + 'dem.f32', Buffer.from(heights.buffer));

// เก็บ Copernicus (DSM) บนกริดเดียวกันไว้ใน data/raw เพื่อเทียบในรายงาน (ไม่ใช้ในแอป)
if (useFab && existsSync(cop)) {
  const c = await resampleDem(cop, cfg, spec);
  writeFileSync(RAW + 'dem/copernicus_grid-' + TILE + '.f32', Buffer.from(c.heights.buffer));
}

// ชื่อแผ่น (เขตหลัก) จาก index.json ที่ build-index สร้าง
const tileName: string | undefined = existsSync(OUT_ROOT + 'index.json')
  ? JSON.parse(readFileSync(OUT_ROOT + 'index.json', 'utf8')).tiles.find((t: { id: string }) => t.id === TILE)
      ?.name
  : undefined;
const meta = {
  name: tileName ?? TILE,
  tile: TILE,
  bbox: cfg.bbox,
  nx: spec.nx,
  nz: spec.nz,
  dlat: spec.dlat,
  dlon: spec.dlon,
  cellMeters: [+spec.cellMetersX.toFixed(3), +spec.cellMetersZ.toFixed(3)],
  layout: 'Float32 little-endian, row-major, แถวแรก = ขอบเหนือ, ค่าที่กึ่งกลางช่อง',
  units: 'เมตร อ้างอิง geoid EGM2008 (ยังไม่ได้บวก verticalOffset)',
  verticalDatum: 'EGM2008',
  verticalOffset: cfg.verticalOffset,
  source: useFab
    ? {
        id: 'FABDEM V1-2',
        tile: cfg.dem.fabdemTile,
        url: cfg.dem.fabdemZipUrl,
        license: 'CC BY-NC-SA 4.0 (ห้ามใช้เชิงพาณิชย์)',
        citation:
          'Hawker, L., Uhe, P., Paulo, L., Sosa, J., Savage, J., Sampson, C., Neal, J. (2022). A 30 m global map of elevation with forests and buildings removed. Environmental Research Letters 17, 024016.',
      }
    : {
        id: 'Copernicus DEM GLO-30',
        url: cfg.dem.copernicusUrl,
        license: 'Copernicus DEM licence (ใช้ได้ฟรี ต้องระบุที่มา)',
        citation:
          '© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved',
      },
  sourceRaster: source,
  resampling: 'bilinear',
  generated: new Date().toISOString().slice(0, 10),
};
writeFileSync(OUT + 'meta.json', JSON.stringify(meta, null, 2) + '\n');
console.log(
  `DEM ${spec.nx}×${spec.nz} ช่อง ~${spec.cellMetersX.toFixed(1)}×${spec.cellMetersZ.toFixed(1)} ม. → ${OUT}`,
);
