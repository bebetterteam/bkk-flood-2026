/** ดาวน์โหลด DEM ดิบ → data/raw/  ใช้: node scripts/fetch-dem.ts [--source=copernicus] */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { RAW, UA, loadConfig } from './lib/config.ts';
import { fetchZipEntry } from './lib/zip-range.ts';

const cfg = loadConfig();
const source = process.argv.find((a) => a.startsWith('--source='))?.split('=')[1] ?? cfg.dem.source;
mkdirSync(RAW + 'dem', { recursive: true });

if (source === 'fabdem') {
  const out = RAW + 'dem/' + cfg.dem.fabdemTile;
  if (existsSync(out)) console.log('มีแล้ว:', out);
  else {
    console.log('ดึง', cfg.dem.fabdemTile, 'จาก', cfg.dem.fabdemZipUrl, '(HTTP Range)');
    const { name, data, zipSize } = await fetchZipEntry(cfg.dem.fabdemZipUrl, (n) =>
      n.endsWith(cfg.dem.fabdemTile),
    );
    writeFileSync(out, data);
    console.log(
      `ได้ ${name} ${(data.length / 1e6).toFixed(1)} MB (zip ทั้งไฟล์ ${(zipSize / 1e9).toFixed(2)} GB ไม่ต้องโหลด)`,
    );
  }
} else {
  const out = RAW + 'dem/copernicus_N13E100.tif';
  if (existsSync(out)) console.log('มีแล้ว:', out);
  else {
    const r = await fetch(cfg.dem.copernicusUrl, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    writeFileSync(out, Buffer.from(await r.arrayBuffer()));
    console.log('ได้', out);
  }
}
