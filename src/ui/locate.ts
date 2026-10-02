/**
 * รับตำแหน่ง 2 ทาง: GPS ของเครื่อง (Geolocation API) หรือคลิกปักหมุดบนแผนที่
 * ตำแหน่งไม่ถูกส่งหรือบันทึกที่ไหน — ส่งต่อให้ callback ในหน้านี้เท่านั้น
 */
import { PLACE } from './strings';

export interface PickedLocation {
  lat: number;
  lon: number;
  source: 'gps' | 'pin';
  accuracy?: number;
}

export interface LocateOptions {
  canvas: HTMLElement;
  /** แปลงตำแหน่งเมาส์บนจอ → lat/lon บนพื้น (null ถ้าคลิกนอกแผนที่) */
  pickAt: (clientX: number, clientY: number) => { lat: number; lon: number } | null;
  onLocation: (p: PickedLocation) => void;
  /** แสดงข้อความสถานะ/ข้อผิดพลาด (null = ล้าง) */
  onMessage: (msg: string | null) => void;
}

export function createLocate(bar: HTMLElement, o: LocateOptions) {
  const box = document.createElement('span');
  box.className = 'seg';
  box.innerHTML =
    `<button id="btn-locate" type="button">${PLACE.btnLocate}</button>` +
    `<button id="btn-pin" type="button">${PLACE.btnPin}</button>`;
  bar.prepend(box);
  const locateBtn = box.querySelector<HTMLButtonElement>('#btn-locate')!;
  const pinBtn = box.querySelector<HTMLButtonElement>('#btn-pin')!;

  // ---- GPS ----
  function locate(): void {
    if (!('geolocation' in navigator)) return o.onMessage(PLACE.errUnsupported);
    if (!isSecureContext) return o.onMessage(PLACE.errInsecure);
    setPicking(false);
    locateBtn.disabled = true;
    o.onMessage(PLACE.locating);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locateBtn.disabled = false;
        o.onMessage(null);
        o.onLocation({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          source: 'gps',
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        locateBtn.disabled = false;
        o.onMessage(
          err.code === err.PERMISSION_DENIED
            ? PLACE.errDenied
            : err.code === err.TIMEOUT
              ? PLACE.errTimeout
              : PLACE.errUnavailable,
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  // ---- ปักหมุด: คลิกที่ไม่ใช่การลาก (< 5 px) ----
  let picking = false;
  let down: { x: number; y: number } | null = null;
  function setPicking(on: boolean): void {
    picking = on;
    pinBtn.classList.toggle('on', on);
    o.canvas.classList.toggle('picking', on);
    o.onMessage(on ? PLACE.pickHint : null);
  }
  o.canvas.addEventListener('pointerdown', (e) => {
    down = picking && e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
  });
  o.canvas.addEventListener('pointerup', (e) => {
    if (!picking || !down || e.button !== 0) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 5) return; // ลาก = หมุน/เลื่อนแผนที่ ไม่ใช่ปักหมุด
    const p = o.pickAt(e.clientX, e.clientY);
    if (!p) return;
    setPicking(false);
    o.onLocation({ ...p, source: 'pin' });
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && picking) setPicking(false);
  });

  locateBtn.onclick = locate;
  pinBtn.onclick = () => setPicking(!picking);
  return { locate, setPicking, isPicking: () => picking };
}
