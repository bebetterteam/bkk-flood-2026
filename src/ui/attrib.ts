/** เครดิตข้อมูล: เดสก์ท็อปแสดงข้อความ, จอเล็กย่อเป็นปุ่ม ⓘ กดแล้วเปิดข้อความ */
import { icon } from './icons';
import { UI } from './strings';

export function createAttrib(root: HTMLElement) {
  root.innerHTML =
    `<button type="button" class="icon-btn at-btn" aria-label="${UI.attrib}" aria-expanded="false" aria-controls="at-text">${icon('info')}</button>` +
    `<div class="at-text" id="at-text"></div>`;
  const btn = root.querySelector<HTMLButtonElement>('.at-btn')!,
    text = root.querySelector<HTMLElement>('.at-text')!;
  const setOpen = (o: boolean) => {
    root.classList.toggle('open', o);
    btn.setAttribute('aria-expanded', String(o));
  };
  btn.onclick = () => setOpen(!root.classList.contains('open'));
  window.addEventListener('keydown', (e) => e.key === 'Escape' && setOpen(false));
  window.addEventListener('pointerdown', (e) => !root.contains(e.target as Node) && setOpen(false));
  return {
    setText(t: string): void {
      text.textContent = t;
    },
  };
}
