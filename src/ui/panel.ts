/**
 * แผงควบคุม: หัว (ชื่อ + ปุ่มระดับ/พับ) · peek (ชิป preset + ผลหลัก 1 บรรทัด) · แท็บ · เนื้อหา · คำเตือนสั้น
 * มือถือ = bottom sheet (แท็บ), แนวนอน/แท็บเล็ต = แผงข้างมีแท็บ, เดสก์ท็อป = เลื่อนยาวทุกหมวด (ซ่อนแถบแท็บ)
 * การวางตำแหน่ง/ลาก/พับอยู่ใน layout.ts
 */
import { PRESETS, presetParams } from '../sim/presets';
import type { SimParams } from '../sim/simulate';
import { $ } from './dom';
import { icon } from './icons';
import { DISCLAIMER, LEARN, SLIDERS, T, TOGGLES, UI } from './strings';

export interface PanelCallbacks {
  /** reset = เริ่มแอนิเมชันน้ำใหม่ */
  onChange: (reset: boolean) => void;
}
export type TabId = keyof typeof UI.tabs;
const TAB_IDS: TabId[] = ['here', 'scen', 'fac', 'res', 'learn'];

const kpi = () =>
  `<div class="kpi" aria-live="off"><span>${UI.kpiRiver} <b class="k-river">–</b> / <span class="k-wall">–</span></span>` +
  `<span class="mini" aria-hidden="true"><i class="k-fill"></i><s class="k-mark"></s></span>` +
  `<span>${UI.kpiArea} <b class="k-area">–</b>${T.km2}</span></div>`;
const disc = (cls: string) => `<p class="disc-s ${cls}">${icon('warn')}<span>${UI.discShort}</span></p>`;

export function renderPanel(root: HTMLElement): void {
  const sliders = SLIDERS.map(
    (s) =>
      `<div class="ctl"><div class="row"><label for="${s.key}">${s.dot ? `<span class="dot" style="background:var(${s.dot})"></span>` : ''}${s.label}</label><span class="val" id="v-${s.key}"></span></div>` +
      `<input type="range" id="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}"${s.hint ? ` aria-describedby="h-${s.key}"` : ''}>${s.hint ? `<div class="hint" id="h-${s.key}">${s.hint}</div>` : ''}</div>`,
  ).join('');
  const toggles = TOGGLES.map(
    (t) =>
      `<label class="switch"><input type="checkbox" role="switch" id="${t.key}"><span>${t.label}</span></label>`,
  ).join('');
  const tabs = TAB_IDS.map(
    (id) =>
      `<button type="button" role="tab" id="tab-${id}" aria-controls="tp-${id}" aria-selected="false" tabindex="-1"${id === 'here' ? ' hidden' : ''}>${UI.tabs[id]}${id === 'here' ? '<i class="badge" aria-hidden="true"></i>' : ''}</button>`,
  ).join('');
  root.setAttribute('aria-label', UI.panelLabel);
  root.innerHTML = `
  <div class="p-head">
    <div class="p-grip" aria-hidden="true"></div>
    <div class="brand"><img src="${import.meta.env.BASE_URL}images/logo-128.png" alt="" width="44" height="44"><h1>${T.title}</h1></div>
    <div class="p-ctl">
      <button type="button" class="icon-btn p-down" aria-label="${UI.sheetDown}">${icon('down')}</button>
      <button type="button" class="icon-btn p-up" aria-label="${UI.sheetUp}">${icon('up')}</button>
      <button type="button" class="icon-btn p-collapse" aria-label="${UI.collapse}" aria-controls="panel">${icon('left')}</button>
    </div>
  </div>
  <div class="p-peek">
    <div class="chips" id="preset-chips" role="group" aria-label="${UI.presetChips}"></div>
    ${kpi()}
  </div>
  ${disc('p-disc-peek')}
  <div class="p-tabs" role="tablist" aria-label="${UI.tabsLabel}">${tabs}</div>
  <div class="p-body">
    <section class="tp" role="tabpanel" id="tp-here" aria-labelledby="tab-here" hidden></section>
    <section class="tp" role="tabpanel" id="tp-scen" aria-labelledby="tab-scen">
      <p class="sub">${T.sub}</p>
      <h2>${T.hPresets}</h2>
      <div class="presets" id="presets"></div>
      <h2>${T.hDefenses}</h2>
      <div class="toggles">${toggles}</div>
      <p class="disc study-note" id="study-note" style="display:none"></p>
    </section>
    <section class="tp" role="tabpanel" id="tp-fac" aria-labelledby="tab-fac">
      <h2>${T.hFactors}</h2>
      ${sliders}
    </section>
    <section class="tp" role="tabpanel" id="tp-res" aria-labelledby="tab-res">
      <h2>${T.hResults}</h2>
      <div class="gauge">
        <div class="t"><span>${T.gaugeTitle}</span><b id="g-river"></b></div>
        <div class="bar"><i id="g-fill"></i><b id="g-wall"></b></div>
        <div class="t t-axis"><span>${T.gaugeMin}</span><span id="g-walltxt"></span><span>${T.gaugeMax}</span></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="k">${T.statArea}</div><div class="v" id="s-area">–</div></div>
        <div class="stat"><div class="k">${T.statDeep}</div><div class="v" id="s-deep">–</div></div>
      </div>
      <div class="causes" id="causes"></div>
      <ul id="explain"></ul>
    </section>
    <section class="tp" role="tabpanel" id="tp-learn" aria-labelledby="tab-learn">
      <details open>
        <summary>${T.learnSummary}</summary>
        ${LEARN.map((p) => `<p>${p}</p>`).join('')}
      </details>
      <p class="disc disc-full">${icon('warn')} ${DISCLAIMER}</p>
    </section>
  </div>
  ${disc('p-disc-foot')}`;
  // การ์ดผลหลักตอนพับแผง (แท็บเล็ต/แนวนอน/เดสก์ท็อป)
  const mini = document.createElement('div');
  mini.id = 'mini';
  mini.innerHTML = `<button type="button" class="icon-btn p-expand" aria-label="${UI.expand}" aria-controls="panel">${icon('panel')}</button><div>${kpi()}${disc('')}</div>`;
  root.after(mini);
}

export function bindPanel(P: SimParams, cb: PanelCallbacks) {
  const pb = $('presets'),
    chips = $('preset-chips');
  const setPreset = (k: number) =>
    [pb, chips].forEach((box) =>
      [...box.children].forEach((x, i) => {
        x.classList.toggle('on', i === k);
        x.setAttribute('aria-pressed', String(i === k));
      }),
    );

  function syncUI(): void {
    for (const s of SLIDERS) {
      $<HTMLInputElement>(s.key).value = String(P[s.key]);
      $('v-' + s.key).textContent = s.fmt(P[s.key]);
    }
    for (const t of TOGGLES) $<HTMLInputElement>(t.key).checked = P[t.key];
  }

  PRESETS.forEach((pr, k) => {
    const pick = () => {
      Object.assign(P, presetParams(pr));
      syncUI();
      setPreset(k);
      cb.onChange(true);
    };
    for (const [box, cls] of [
      [pb, ''],
      [chips, 'chip'],
    ] as const) {
      const b = document.createElement('button');
      b.type = 'button';
      if (cls) b.className = cls;
      b.textContent = pr.name;
      b.setAttribute('aria-pressed', 'false');
      b.onclick = pick;
      box.appendChild(b);
    }
  });

  let tm: ReturnType<typeof setTimeout> | undefined;
  for (const s of SLIDERS)
    $(s.key).addEventListener('input', (e) => {
      P[s.key] = +(e.target as HTMLInputElement).value;
      $('v-' + s.key).textContent = s.fmt(P[s.key]);
      setPreset(-1);
      clearTimeout(tm);
      tm = setTimeout(() => cb.onChange(false), 60);
    });
  for (const t of TOGGLES)
    $(t.key).addEventListener('change', (e) => {
      P[t.key] = (e.target as HTMLInputElement).checked;
      cb.onChange(false);
    });

  // ---- แท็บ (ARIA tabs: ลูกศรซ้าย/ขวา, Home/End) ----
  const tabBtn = (id: TabId) => $<HTMLButtonElement>('tab-' + id);
  let current: TabId = 'scen';
  function selectTab(id: TabId, focus = false): void {
    current = id;
    for (const t of TAB_IDS) {
      const on = t === id;
      tabBtn(t).setAttribute('aria-selected', String(on));
      tabBtn(t).tabIndex = on ? 0 : -1;
      $('tp-' + t).classList.toggle('on', on);
    }
    if (focus) tabBtn(id).focus();
    $('panel').querySelector('.p-body')!.scrollTop = 0;
  }
  const visibleTabs = () => TAB_IDS.filter((t) => !tabBtn(t).hidden);
  for (const t of TAB_IDS) {
    tabBtn(t).onclick = () => selectTab(t);
    tabBtn(t).onkeydown = (e) => {
      const v = visibleTabs(),
        i = v.indexOf(t);
      const next =
        e.key === 'ArrowRight'
          ? v[(i + 1) % v.length]
          : e.key === 'ArrowLeft'
            ? v[(i - 1 + v.length) % v.length]
            : e.key === 'Home'
              ? v[0]
              : e.key === 'End'
                ? v[v.length - 1]
                : null;
      if (next) {
        e.preventDefault();
        selectTab(next, true);
      }
    };
  }
  selectTab('scen');

  syncUI();
  /** ทำเครื่องหมาย preset แรกเมื่อเริ่ม */
  const markFirstPreset = () => setPreset(0);
  return {
    syncUI,
    markFirstPreset,
    selectTab,
    /** แท็บ "ที่นี่" (การ์ดหมุด) — แสดง/ซ่อน; select = เปิดแท็บนี้ทันที */
    setHereTab(show: boolean, select: boolean): void {
      tabBtn('here').hidden = !show;
      $('tp-here').hidden = !show;
      if (show && select) selectTab('here');
      else if (!show && current === 'here') selectTab('scen');
    },
    currentTab: () => current,
  };
}
