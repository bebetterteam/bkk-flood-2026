import { UA } from './config.ts';

/** เรียก Overpass: เซิร์ฟเวอร์หลักจาก config + mirror สาธารณะ (สลับเมื่อ 429/504) */
export async function overpass(primary: string, query: string): Promise<unknown> {
  const endpoints = [
    primary,
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ];
  for (let attempt = 1; ; attempt++) {
    const url = endpoints[(attempt - 1) % endpoints.length];
    let why: string;
    try {
      // เซิร์ฟเวอร์ตั้ง timeout 180 วิ — รอเกินนั้นมากแปลว่าการเชื่อมต่อค้าง
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(240_000),
      });
      if (r.ok) return await r.json();
      why = `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`;
    } catch (e) {
      why = (e as Error).message;
    }
    if (attempt >= 8) throw new Error(`Overpass ${why}`);
    console.warn(`  ${new URL(url).host} ${why.slice(0, 40)} ลองเซิร์ฟเวอร์ถัดไป…`);
    await new Promise((res) => setTimeout(res, 5000 * attempt));
  }
}
