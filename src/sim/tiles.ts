/**
 * แผ่น (tile) ของพื้นที่ศึกษา: ตารางแผ่นขนาดเท่ากันครอบกรุงเทพฯ โหลด/จำลองทีละแผ่น
 * id = `r{แถว}c{คอลัมน์}` แถว 0 = เหนือสุด คอลัมน์ 0 = ตะวันตกสุด (ใช้ร่วมกับ scripts/)
 */
export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}
export interface Tiling {
  /** มุมตะวันตกเฉียงใต้ของตาราง */
  south: number;
  west: number;
  dLat: number;
  dLon: number;
  rows: number;
  cols: number;
}

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
export const tileId = (row: number, col: number) => `r${row}c${col}`;

export function parseTileId(id: string): [number, number] {
  const m = /^r(\d+)c(\d+)$/.exec(id);
  if (!m) throw new Error('id แผ่นไม่ถูกต้อง: ' + id);
  return [+m[1], +m[2]];
}

export function tileBbox(t: Tiling, id: string): Bbox {
  const [row, col] = parseTileId(id);
  if (row >= t.rows || col >= t.cols) throw new Error('แผ่นอยู่นอกตาราง: ' + id);
  const north = r6(t.south + (t.rows - row) * t.dLat);
  return {
    south: r6(north - t.dLat),
    west: r6(t.west + col * t.dLon),
    north,
    east: r6(t.west + (col + 1) * t.dLon),
  };
}

/** แผ่นที่จุดนี้อยู่ (ขอบเหนือ/ตะวันออกเป็นของแผ่นถัดไป) หรือ null ถ้าอยู่นอกตาราง */
export function tileAt(t: Tiling, lat: number, lon: number): string | null {
  const row = t.rows - 1 - Math.floor((lat - t.south) / t.dLat + 1e-9),
    col = Math.floor((lon - t.west) / t.dLon + 1e-9);
  if (row < 0 || row >= t.rows || col < 0 || col >= t.cols) return null;
  return tileId(row, col);
}

export function allTiles(t: Tiling): string[] {
  const out: string[] = [];
  for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++) out.push(tileId(r, c));
  return out;
}

/** แผ่นข้างเคียงตามทิศ หรือ null ถ้าตกขอบตาราง */
export function neighborTile(t: Tiling, id: string, dir: 'n' | 's' | 'e' | 'w'): string | null {
  const [r, c] = parseTileId(id);
  const nr = r + (dir === 's' ? 1 : dir === 'n' ? -1 : 0),
    nc = c + (dir === 'e' ? 1 : dir === 'w' ? -1 : 0);
  return nr < 0 || nr >= t.rows || nc < 0 || nc >= t.cols ? null : tileId(nr, nc);
}

export const inBbox = (b: Bbox, lat: number, lon: number) =>
  lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east;
