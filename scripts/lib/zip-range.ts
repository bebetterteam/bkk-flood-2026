/** ดึงไฟล์เดียวออกจาก zip ขนาดใหญ่บนเว็บด้วย HTTP Range (ไม่ต้องโหลดทั้งไฟล์) */
import { inflateRawSync } from 'node:zlib';
import { UA } from './config.ts';

async function range(url: string, start: number, end: number): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, { headers: { Range: `bytes=${start}-${end}`, 'User-Agent': UA } });
      if (r.status !== 206) throw new Error(`HTTP ${r.status} (ต้องการ 206 Partial Content)`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (attempt >= 4) throw e;
      console.warn(`  range ${start}-${end} ล้มเหลว (${(e as Error).message}) ลองใหม่…`);
      await new Promise((res) => setTimeout(res, 2000 * attempt));
    }
  }
}

export async function fetchZipEntry(url: string, match: (name: string) => boolean) {
  const head = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA } });
  const size = Number(head.headers.get('content-length'));
  if (!size) throw new Error('ไม่ทราบขนาดไฟล์ zip');
  const tail = await range(url, Math.max(0, size - 65_557), size - 1);
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('ไม่พบ End of Central Directory');
  let cdSize = tail.readUInt32LE(eocd + 12);
  let cdOffset = tail.readUInt32LE(eocd + 16);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    // ZIP64
    const loc = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]));
    const z64off = Number(tail.readBigUInt64LE(loc + 8));
    const z64 = await range(url, z64off, z64off + 56 - 1);
    cdSize = Number(z64.readBigUInt64LE(40));
    cdOffset = Number(z64.readBigUInt64LE(48));
  }
  const cd = await range(url, cdOffset, cdOffset + cdSize - 1);
  const names: string[] = [];
  for (let p = 0; p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50;) {
    const method = cd.readUInt16LE(p + 10);
    let csize = cd.readUInt32LE(p + 20);
    let usize = cd.readUInt32LE(p + 24);
    const nlen = cd.readUInt16LE(p + 28),
      xlen = cd.readUInt16LE(p + 30),
      clen = cd.readUInt16LE(p + 32);
    let lho = cd.readUInt32LE(p + 42);
    const name = cd.subarray(p + 46, p + 46 + nlen).toString('utf8');
    // ZIP64 extra field
    let x = p + 46 + nlen;
    const xe = x + xlen;
    while (x + 4 <= xe) {
      const id = cd.readUInt16LE(x),
        len = cd.readUInt16LE(x + 2);
      if (id === 1) {
        let q = x + 4;
        if (usize === 0xffffffff) {
          usize = Number(cd.readBigUInt64LE(q));
          q += 8;
        }
        if (csize === 0xffffffff) {
          csize = Number(cd.readBigUInt64LE(q));
          q += 8;
        }
        if (lho === 0xffffffff) lho = Number(cd.readBigUInt64LE(q));
      }
      x += 4 + len;
    }
    names.push(name);
    if (match(name)) {
      const lh = await range(url, lho, lho + 29);
      const dataStart = lho + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      const comp = await range(url, dataStart, dataStart + csize - 1);
      const data = method === 0 ? comp : method === 8 ? inflateRawSync(comp) : null;
      if (!data) throw new Error('compression method ไม่รองรับ: ' + method);
      if (data.length !== usize) throw new Error(`ขนาดไม่ตรง ${data.length} ≠ ${usize}`);
      return { name, data, zipSize: size };
    }
    p += 46 + nlen + xlen + clen;
  }
  throw new Error('ไม่พบไฟล์ใน zip; ตัวอย่างชื่อ: ' + names.slice(0, 10).join(', '));
}
