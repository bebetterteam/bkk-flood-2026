/**
 * ดาวน์โหลด texture CC0 จาก Poly Haven (1K JPG) → public/textures/ แล้วย่อ/บีบอัดด้วย `sips` (มากับ macOS)
 * ถ้าไม่มี sips จะเก็บไฟล์ 1K ตามเดิม (ใหญ่กว่า) — ใช้: node scripts/fetch-textures.ts [--force]
 * + waternormals.jpg จากตัวอย่างของ three.js (MIT)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { ROOT, UA } from './lib/config.ts';

const OUT = ROOT + 'public/textures/';
mkdirSync(OUT, { recursive: true });
const force = process.argv.includes('--force');

/** [id Poly Haven, ชื่อไฟล์, ใช้ทำอะไร, ขนาด diffuse, ขนาด normal] */
const ASSETS: [string, string, string, number, number][] = [
  ['asphalt_02', 'asphalt', 'ผิวถนน', 1024, 512],
  ['concrete_pavement', 'pavement', 'ทางเท้า/พื้นเมือง', 1024, 512],
  ['leafy_grass', 'grass', 'สวน/หญ้า', 1024, 512],
  ['clay_roof_tiles_02', 'roof_clay', 'หลังคาวัด/บ้านกระเบื้อง', 1024, 512],
  ['grey_roof_tiles', 'roof_grey', 'หลังคาบ้าน', 512, 512],
  ['painted_plaster_wall', 'plaster', 'ผนังตึก', 1024, 512],
];

const hasSips = (() => {
  try {
    execFileSync('sips', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

async function download(url: string, path: string) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  writeFileSync(path, Buffer.from(await r.arrayBuffer()));
}
function shrink(path: string, size: number, quality: number) {
  if (!hasSips) return;
  execFileSync(
    'sips',
    ['-Z', String(size), '-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), path, '--out', path],
    {
      stdio: 'ignore',
    },
  );
}

const credits: string[] = [];
for (const [id, name, use, dSize, nSize] of ASSETS) {
  const info = (await (
    await fetch(`https://api.polyhaven.com/info/${id}`, { headers: { 'User-Agent': UA } })
  ).json()) as {
    name: string;
    authors: Record<string, string>;
  };
  const files = (await (
    await fetch(`https://api.polyhaven.com/files/${id}`, { headers: { 'User-Agent': UA } })
  ).json()) as Record<string, Record<string, { jpg?: { url: string } }>>;
  for (const [map, suffix, size, q] of [
    ['Diffuse', 'diff', dSize, 78],
    ['nor_gl', 'nor', nSize, 85],
  ] as const) {
    const path = `${OUT}${name}_${suffix}.jpg`;
    if (existsSync(path) && !force) continue;
    const url = files[map]?.['1k']?.jpg?.url;
    if (!url) throw new Error(`ไม่มีไฟล์ ${map} 1k ของ ${id}`);
    await download(url, path);
    shrink(path, size, q);
  }
  credits.push(
    `| \`${name}_*.jpg\` | ${use} | [${info.name}](https://polyhaven.com/a/${id}) | ${Object.keys(info.authors).join(', ')} | CC0 |`,
  );
  console.log('✓', id);
}
const wn = OUT + 'waternormals.jpg';
if (!existsSync(wn) || force) {
  await download(
    'https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/waternormals.jpg',
    wn,
  );
  shrink(wn, 512, 85);
}
console.log('✓ waternormals');

writeFileSync(
  OUT + 'LICENSE.md',
  `# Textures

ดาวน์โหลดด้วย \`node scripts/fetch-textures.ts\` (ย่อขนาดด้วย sips)

| ไฟล์ | ใช้ทำ | แหล่ง | ผู้สร้าง | License |
|---|---|---|---|---|
${credits.join('\n')}
| \`waternormals.jpg\` | normal map ผิวน้ำ | [three.js examples r160](https://github.com/mrdoob/three.js/blob/r160/examples/textures/waternormals.jpg) | three.js authors | MIT |

Poly Haven assets are CC0 (public domain) — https://polyhaven.com/license
`,
);
let total = 0;
for (const f of [
  'LICENSE.md',
  'waternormals.jpg',
  ...ASSETS.flatMap(([, n]) => [`${n}_diff.jpg`, `${n}_nor.jpg`]),
])
  total += statSync(OUT + f).size;
console.log(`รวม ${(total / 1e6).toFixed(2)} MB${hasSips ? '' : ' (ไม่มี sips — ไม่ได้ย่อ)'}`);
