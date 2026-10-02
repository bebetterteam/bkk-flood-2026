/**
 * กด Space ค้างแล้วลากเมาส์ซ้าย = เลื่อนแผนที่ (pan) แบบ Figma; ปล่อย Space = กลับเป็นหมุนมุมมองตามเดิม
 * ไม่ทำงานขณะพิมพ์ในช่องข้อความ และกัน Space ไม่ให้ไปกดปุ่ม/ช่องติ๊กที่โฟกัสอยู่
 */
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable ||
    (t instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button'].includes(t.type)) ||
    t instanceof HTMLTextAreaElement);

export function enableSpacePan(controls: OrbitControls, canvas: HTMLElement) {
  const normal = controls.mouseButtons.LEFT,
    normalScreenPan = controls.screenSpacePanning;
  let held = false,
    dragging = false;

  const setCursor = () => {
    canvas.style.cursor = held ? (dragging ? 'grabbing' : 'grab') : '';
  };
  const press = () => {
    if (held) return;
    held = true;
    controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    controls.screenSpacePanning = false; // เลื่อนขนานพื้น เหมือนลากแผนที่
    setCursor();
  };
  const release = () => {
    if (!held) return;
    held = false;
    // ถ้ายังลากอยู่ ให้ลากต่อจนปล่อยเมาส์ (OrbitControls จำโหมดตอนกดเมาส์แล้ว) แค่คืนค่าสำหรับครั้งถัดไป
    controls.mouseButtons.LEFT = normal;
    controls.screenSpacePanning = normalScreenPan;
    setCursor();
  };

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || isTyping(e.target)) return;
    e.preventDefault(); // กันหน้าเลื่อน/กดปุ่มที่โฟกัสอยู่
    press();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space' || isTyping(e.target)) return;
    e.preventDefault();
    release();
  });
  window.addEventListener('blur', release);
  canvas.addEventListener('pointerdown', () => {
    dragging = true;
    setCursor();
  });
  window.addEventListener('pointerup', () => {
    dragging = false;
    setCursor();
  });

  return { isPanning: () => held };
}
