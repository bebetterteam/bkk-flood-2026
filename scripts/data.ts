/**
 * pipeline ข้อมูลพื้นที่ศึกษาทั้งสาย แบบแผ่น
 *   node scripts/data.ts [--stage=fetch|build|report] [--tile=r2c1 | --tiles=built|all|r2c1,r3c3]
 * ไม่ระบุแผ่น = ทุกแผ่นใน config.built; ขั้นที่ใช้ร่วมทุกแผ่น (DEM ดิบ, texture, ขอบเขต, index) รันครั้งเดียว
 * --tiles=all = ทุกแผ่นที่ตัด กทม. ตาม index.json (ข้อมูลรวมหลายร้อย MB — ระวัง)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { OUT_ROOT, ROOT, loadConfig } from './lib/config.ts';

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const cfg = loadConfig();
const stages = arg('stage') ? [arg('stage')!] : ['fetch', 'build', 'report'];
const sel = arg('tile') ?? arg('tiles') ?? 'built';
const tiles =
  sel === 'built'
    ? cfg.built
    : sel === 'all'
      ? (JSON.parse(readFileSync(OUT_ROOT + 'index.json', 'utf8')).tiles as { id: string }[]).map((t) => t.id)
      : sel.split(',');

const run = (script: string, env: Record<string, string> = {}, ...args: string[]) => {
  console.log(`\n▶ ${script} ${args.join(' ')}${env.TILE ? ` [${env.TILE}]` : ''}`);
  execFileSync(process.execPath, [ROOT + 'scripts/' + script, ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
};
const perTile = (...scripts: string[]) => {
  for (const TILE of tiles) for (const s of scripts) run(s, { TILE });
};

if (stages.includes('fetch')) {
  run('fetch-dem.ts');
  run('fetch-dem.ts', {}, '--source=copernicus');
  run('fetch-boundary.ts');
  run('fetch-textures.ts');
  perTile('fetch-osm.ts');
}
if (stages.includes('build')) {
  if (!existsSync(OUT_ROOT + 'index.json')) run('build-index.ts'); // ชื่อแผ่นสำหรับ meta.json
  perTile('build-dem.ts', 'build-osm.ts', 'build-osm-real.ts');
  run('build-index.ts'); // อัปเดตสถานะ built
}
if (stages.includes('report')) perTile('report.ts', 'report-real.ts');
