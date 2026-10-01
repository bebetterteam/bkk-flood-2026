/** แผงควบคุมด้านซ้าย: presets, แถบเลื่อน, ระบบป้องกัน, ผลลัพธ์, เรียนรู้, คำเตือน */
import { PRESETS, presetParams } from '../sim/presets';
import type { SimParams } from '../sim/simulate';
import { $ } from './dom';
import { DISCLAIMER, LEARN, SLIDERS, T, TOGGLES } from './strings';

export interface PanelCallbacks {
  /** reset = เริ่มแอนิเมชันน้ำใหม่ */
  onChange: (reset: boolean) => void;
}

export function renderPanel(root: HTMLElement): void {
  const sliders = SLIDERS.map(
    (s) =>
      `<div class="ctl"><div class="row"><label>${s.dot ? `<span class="dot" style="background:var(${s.dot})"></span>` : ''}${s.label}</label><span class="val" id="v-${s.key}"></span></div>` +
      `<input type="range" id="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}">${s.hint ? `<div class="hint">${s.hint}</div>` : ''}</div>`,
  ).join('');
  const toggles = TOGGLES.map((t) => `<label><input type="checkbox" id="${t.key}"> ${t.label}</label>`).join(
    '',
  );
  root.innerHTML = `
  <h1>${T.title}</h1>
  <p class="sub">${T.sub}</p>
  <h2>${T.hPresets}</h2>
  <div class="presets" id="presets"></div>
  <h2>${T.hFactors}</h2>
  ${sliders}
  <h2>${T.hDefenses}</h2>
  <div class="toggles">${toggles}</div>
  <h2>${T.hResults}</h2>
  <div class="gauge">
    <div class="t"><span>${T.gaugeTitle}</span><b id="g-river"></b></div>
    <div class="bar"><i id="g-fill"></i><b id="g-wall"></b></div>
    <div class="t" style="color:var(--muted);font-size:11.5px"><span>${T.gaugeMin}</span><span id="g-walltxt"></span><span>${T.gaugeMax}</span></div>
  </div>
  <div class="stats">
    <div class="stat"><div class="k">${T.statArea}</div><div class="v" id="s-area">–</div></div>
    <div class="stat"><div class="k">${T.statDeep}</div><div class="v" id="s-deep">–</div></div>
  </div>
  <div class="causes" id="causes"></div>
  <ul id="explain"></ul>
  <details>
    <summary>${T.learnSummary}</summary>
    ${LEARN.map((p) => `<p>${p}</p>`).join('')}
  </details>
  <p class="disc study-note" id="study-note" style="display:none"></p>
  <p class="disc">${DISCLAIMER}</p>`;
}

export function bindPanel(P: SimParams, cb: PanelCallbacks) {
  const pb = $('presets');
  const clearPreset = () => [...pb.children].forEach((x) => x.classList.remove('on'));

  function syncUI(): void {
    for (const s of SLIDERS) {
      $<HTMLInputElement>(s.key).value = String(P[s.key]);
      $('v-' + s.key).textContent = s.fmt(P[s.key]);
    }
    for (const t of TOGGLES) $<HTMLInputElement>(t.key).checked = P[t.key];
  }

  PRESETS.forEach((pr) => {
    const b = document.createElement('button');
    b.textContent = pr.name;
    b.onclick = () => {
      Object.assign(P, presetParams(pr));
      syncUI();
      clearPreset();
      b.classList.add('on');
      cb.onChange(true);
    };
    pb.appendChild(b);
  });

  let tm: ReturnType<typeof setTimeout> | undefined;
  for (const s of SLIDERS)
    $(s.key).addEventListener('input', (e) => {
      P[s.key] = +(e.target as HTMLInputElement).value;
      $('v-' + s.key).textContent = s.fmt(P[s.key]);
      clearPreset();
      clearTimeout(tm);
      tm = setTimeout(() => cb.onChange(false), 60);
    });
  for (const t of TOGGLES)
    $(t.key).addEventListener('change', (e) => {
      P[t.key] = (e.target as HTMLInputElement).checked;
      cb.onChange(false);
    });

  syncUI();
  /** ทำเครื่องหมาย preset แรกเมื่อเริ่ม */
  const markFirstPreset = () => pb.children[0]?.classList.add('on');
  return { syncUI, markFirstPreset };
}
