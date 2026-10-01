/** อ่าน GeoTIFF แล้ว resample แบบ bilinear ลงกริดของพื้นที่ศึกษา */
import { readFileSync } from 'node:fs';
import { fromArrayBuffer } from 'geotiff';
import { M_PER_DEG_LAT, mPerDegLon, type StudyConfig } from './config.ts';

export interface GridSpec {
  nx: number;
  nz: number;
  /** ขนาดช่อง (องศา) */
  dlat: number;
  dlon: number;
  /** ขนาดช่อง (เมตร) โดยประมาณ */
  cellMetersX: number;
  cellMetersZ: number;
}

/** กริดที่ครอบ bbox พอดี ช่องใกล้เคียง cellMeters × cellMeters */
export function gridSpec(cfg: StudyConfig): GridSpec {
  const { south, west, north, east } = cfg.bbox;
  const latC = (south + north) / 2;
  const nz = Math.round(((north - south) * M_PER_DEG_LAT) / cfg.cellMeters);
  const nx = Math.round(((east - west) * mPerDegLon(latC)) / cfg.cellMeters);
  const dlat = (north - south) / nz,
    dlon = (east - west) / nx;
  return { nx, nz, dlat, dlon, cellMetersX: dlon * mPerDegLon(latC), cellMetersZ: dlat * M_PER_DEG_LAT };
}

export async function resampleDem(path: string, cfg: StudyConfig, spec: GridSpec) {
  const buf = readFileSync(path);
  const tiff = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const img = await tiff.getImage();
  const [ox, oy] = img.getOrigin();
  const [rx, ry] = img.getResolution(); // ry < 0
  const W = img.getWidth(),
    H = img.getHeight();
  const nodata = img.getGDALNoData();
  const { south, west, north, east } = cfg.bbox;
  // อ่านเฉพาะหน้าต่างที่ครอบ bbox (+ขอบ 2 px)
  const x0 = Math.max(0, Math.floor((west - ox) / rx) - 2),
    x1 = Math.min(W, Math.ceil((east - ox) / rx) + 2);
  const y0 = Math.max(0, Math.floor((north - oy) / ry) - 2),
    y1 = Math.min(H, Math.ceil((south - oy) / ry) + 2);
  const [win] = (await img.readRasters({ window: [x0, y0, x1, y1] })) as unknown as Float32Array[];
  const ww = x1 - x0;
  // GDAL: origin คือมุมซ้ายบนของพิกเซล ค่าพิกเซลอยู่ที่กึ่งกลาง → ลบ 0.5
  const sample = (lat: number, lon: number) => {
    const fx = (lon - ox) / rx - 0.5 - x0,
      fy = (lat - oy) / ry - 0.5 - y0;
    const ix = Math.floor(fx),
      iy = Math.floor(fy),
      tx = fx - ix,
      ty = fy - iy;
    const v = (i: number, j: number) => win[j * ww + i];
    const a = v(ix, iy),
      b = v(ix + 1, iy),
      c = v(ix, iy + 1),
      d = v(ix + 1, iy + 1);
    if ([a, b, c, d].some((q) => q === nodata || !Number.isFinite(q))) return NaN;
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  };
  const out = new Float32Array(spec.nx * spec.nz);
  let missing = 0;
  for (let j = 0; j < spec.nz; j++)
    for (let i = 0; i < spec.nx; i++) {
      const lat = north - (j + 0.5) * spec.dlat,
        lon = west + (i + 0.5) * spec.dlon;
      const h = sample(lat, lon);
      if (Number.isNaN(h)) missing++;
      out[j * spec.nx + i] = h;
    }
  return {
    heights: out,
    missing,
    source: { width: W, height: H, resolution: [rx, ry], origin: [ox, oy], nodata },
  };
}
