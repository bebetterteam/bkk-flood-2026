/** max-heap สำหรับ priority-flood (key = ระดับน้ำ, val = index เซลล์) */
export class Heap {
  k: number[] = [];
  v: number[] = [];
  n = 0;
  push(key: number, val: number): void {
    let i = this.n++;
    const k = this.k,
      v = this.v;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] >= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): number {
    const k = this.k,
      v = this.v,
      top = v[0];
    const n = --this.n;
    const lk = k[n],
      lv = v[n];
    let i = 0;
    while (true) {
      const l = 2 * i + 1;
      if (l >= n) break;
      const r = l + 1;
      const m = r < n && k[r] > k[l] ? r : l;
      if (k[m] <= lk) break;
      k[i] = k[m];
      v[i] = v[m];
      i = m;
    }
    k[i] = lk;
    v[i] = lv;
    return top;
  }
}
