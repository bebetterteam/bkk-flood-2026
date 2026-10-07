/** แสดงผลลัพธ์: เกจระดับน้ำ ตัวเลขพื้นที่ แถบสาเหตุ และข้อความอธิบาย */
import { clamp } from '../sim/math';
import type { SimParams, SimResult } from '../sim/simulate';
import { $ } from './dom';
import { CAUSES, EXPLAIN, T } from './strings';

/** ตลิ่งธรรมชาติเมื่อไม่มีเขื่อน (ม.รทก.) — ใช้ในเกจเท่านั้น */
const BANK = 1.8;

export function renderResults(s: SimResult, P: SimParams): void {
  $('g-river').textContent = s.riverMid.toFixed(2) + T.mMsl;
  $('g-fill').style.width = clamp((s.riverMid / 4) * 100, 0, 100) + '%';
  const wl = P.walls ? s.coreWall : BANK;
  $('g-fill').style.background =
    (P.walls && s.riverMid > s.coreWall) || (!P.walls && s.riverMid > BANK) ? 'var(--warn)' : 'var(--river)';
  $('g-wall').style.left = clamp((wl / 4) * 100, 0, 100) + '%';
  $('g-walltxt').textContent = (P.walls ? T.wallCrest : T.bank) + wl.toFixed(2) + T.m;
  $('s-area').textContent = Math.round(s.area).toLocaleString() + T.km2;
  // ผลหลัก 1 บรรทัด (peek ของ sheet + การ์ดตอนพับแผง)
  const over = (P.walls && s.riverMid > s.coreWall) || (!P.walls && s.riverMid > BANK);
  const all = (cls: string, f: (el: HTMLElement) => void) =>
    document.querySelectorAll<HTMLElement>('.' + cls).forEach(f);
  all('k-river', (el) => {
    el.textContent = s.riverMid.toFixed(2);
    el.classList.toggle('bad', over);
  });
  all('k-wall', (el) => (el.textContent = (P.walls ? T.wallCrest : T.bank) + wl.toFixed(2) + T.m));
  all('k-area', (el) => (el.textContent = Math.round(s.area).toLocaleString()));
  all('k-fill', (el) => {
    el.style.width = clamp((s.riverMid / 4) * 100, 0, 100) + '%';
    el.style.background = over ? 'var(--warn)' : 'var(--river)';
  });
  all('k-mark', (el) => (el.style.left = clamp((wl / 4) * 100, 0, 100) + '%'));
  $('s-deep').textContent = Math.round(s.deep).toLocaleString() + T.km2;
  const mx = Math.max(1, ...s.by);
  $('causes').innerHTML = CAUSES.map(
    ([n, c], k) =>
      `<div class="cause"><span><span class="dot" style="background:${c}"></span>${n}</span><span class="cb"><i style="width:${(s.by[k] / mx) * 100}%;background:${c}"></i></span><span class="n">${Math.round(s.by[k])}${T.km2}</span></div>`,
  ).join('');
  $('explain').innerHTML = explain(s, P)
    .map(([c, t]) => `<li class="${c}">${t}</li>`)
    .join('');
}

/** รายการข้อความอธิบาย [class, ข้อความ] */
export function explain(s: SimResult, P: SimParams): [string, string][] {
  const L: [string, string][] = [];
  if (s.excess > 0) L.push(['warn', EXPLAIN.rainOver(P.rain, s.cap, s.excess)]);
  else if (P.rain > 0) L.push(['ok', EXPLAIN.rainOk(P.rain, s.cap)]);
  if (s.cap < (P.drains ? 60 : 25) - 1) L.push(['', EXPLAIN.capReduced(s.cap)]);
  if (P.walls) {
    if (s.riverMid > s.coreWall) L.push(['warn', EXPLAIN.overtop(s.riverMid, s.coreWall)]);
    else if (s.riverMid > 2.0) L.push(['', EXPLAIN.highButHeld(s.riverMid, s.coreWall)]);
  } else L.push(['warn', EXPLAIN.noWalls]);
  if (P.tide >= 1.6) L.push([s.by[2] > 1 ? 'warn' : '', EXPLAIN.tide(P.tide, s.by[2] > 1)]);
  if (s.by[3] > 1) L.push(['warn', EXPLAIN.north(P.flow, P.dikes)]);
  if (P.subs > 0) L.push(['', EXPLAIN.subs(P.subs)]);
  if (!L.length || s.area < 1) L.push(['ok', EXPLAIN.none]);
  return L;
}
