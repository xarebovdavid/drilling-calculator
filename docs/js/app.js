/**
 * Интерфейс бурового калькулятора: ввод, проверка данных, перевод единиц,
 * вывод результатов с подстановкой чисел в формулы. Сами формулы — в formulas.js.
 */
import * as F from './formulas.js';

const $ = (id) => document.getElementById(id);
const KGF_CM2 = 0.0980665e6; // 1 кгс/см², Па
const TF = 9806.65;          // 1 тс, Н

/* ---------- форматирование ---------- */

function fmt(value, digits = 2) {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Число без лишних нулей (для подстановки исходных данных в формулу). */
function num(value, maxDigits = 4) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: maxDigits }).format(value);
}

function fmtTime(seconds) {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h} ч ${m} мин`;
  if (m) return `${m} мин ${sec} с`;
  return `${sec} с`;
}

/* ---------- ввод и проверка ---------- */

function parseNum(raw) {
  const s = String(raw).trim().replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return NaN;
  return Number(s);
}

function setError(input, message) {
  const field = input.closest('.field');
  const box = field && field.querySelector('.error');
  input.classList.toggle('invalid', Boolean(message));
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (box) box.textContent = message || '';
}

/** Читает поле, проверяет диапазон из data-min/data-max. Возвращает число или null. */
function read(id) {
  const el = $(id);
  const v = parseNum(el.value);
  const min = Number(el.dataset.min);
  const max = Number(el.dataset.max);
  let err = '';
  if (el.value.trim() === '') err = 'Введите значение';
  else if (Number.isNaN(v)) err = 'Введите число, например 1,25';
  else if (v < min || v > max) err = `Допустимо от ${num(min)} до ${num(max)}`;
  setError(el, err);
  return err ? null : v;
}

/** Читает несколько полей; если хоть одно неверно — null. */
function readAll(ids) {
  const out = {};
  let ok = true;
  for (const [key, id] of Object.entries(ids)) {
    out[key] = read(id);
    if (out[key] === null) ok = false;
  }
  return ok ? out : null;
}

/* ---------- анимация чисел ---------- */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
const easeOut = (t) => 1 - (1 - t) ** 4;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Число из отформатированной строки ru-RU («1 234,56») и форматтер с тем же числом знаков. */
function parseShown(s) {
  const m = /^(-?)([\d   ]+)(?:,(\d+))?$/.exec(String(s).trim());
  if (!m) return null;
  const digits = m[3] ? m[3].length : 0;
  const n = Number(`${m[1]}${m[2].replace(/\D/g, '')}${m[3] ? `.${m[3]}` : ''}`);
  return Number.isFinite(n) ? { n, format: (v) => fmt(v, digits) } : null;
}

/** Плавно меняет число в элементе от текущего к новому; в конце — точная исходная строка. */
function tweenValue(el, to, text, format, from = el._cur) {
  cancelAnimationFrame(el._raf);
  el._to = to;
  if (from === undefined || from === to || !format || REDUCED.matches) {
    el._cur = to;
    el.textContent = text;
    return;
  }
  const t0 = performance.now();
  const dur = 560;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    if (k >= 1) { el.textContent = text; el._cur = to; return; }
    el._cur = from + (to - from) * easeOut(k);
    el.textContent = format(el._cur);
    el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

function pulse(resultEl) {
  if (REDUCED.matches) return;
  const p = resultEl.querySelector('.pulse');
  if (p && p.animate) {
    p.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }],
      { duration: 900, easing: 'ease-out' });
  }
}

/* ---------- вывод ---------- */

const COPY_ICONS = `<span class="copy-ico" aria-hidden="true">
  <svg class="i-copy" viewBox="0 0 16 16"><rect x="5" y="5" width="9" height="9" rx="2"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/></svg>
  <svg class="i-check" viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 4.5"/></svg>
</span>`;

function setHTML(el, html) {
  if (el._html !== html) { el.innerHTML = html; el._html = html; }
}

/**
 * Выводит результат. Разметка строится один раз и дальше обновляется на месте,
 * чтобы числа можно было плавно анимировать, а кнопка «Копировать» не пересоздавалась.
 */
function renderResults(calc, data) {
  const box = document.querySelector(`[data-results="${calc}"]`);
  if (!data) {
    if (!box.querySelector('.result-grid')) {
      box.innerHTML = `
        <div class="results-head"><h3>Результат</h3></div>
        <p class="placeholder">Исправьте исходные данные — поля с ошибкой выделены.</p>`;
      return;
    }
    box.classList.add('is-stale');
    box.querySelector('.results-body').setAttribute('aria-hidden', 'true');
    box.querySelector('.stale-note').hidden = false;
    return;
  }

  const sig = `${data.items.map((it) => (it.primary ? 'p' : 'n')).join('')}|${data.formula.length}`;
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    // Если обычных плиток нечётное число, последняя растягивается на всю строку (без «дыры» в сетке).
    const regular = data.items.filter((it) => !it.primary);
    const wide = regular.length % 2 ? regular[regular.length - 1] : null;
    const items = data.items.map((it) => `
      <div class="result${it.primary ? ' primary' : ''}${it === wide ? ' wide' : ''}">
        <span class="pulse" aria-hidden="true"></span>
        <div class="result-label"></div>
        <div class="result-value"><span class="rv"></span><span class="result-unit"></span></div>
        <div class="result-sub"></div>
      </div>`).join('');
    box.innerHTML = `
      <div class="results-head">
        <h3>Результат</h3>
        <button type="button" class="btn small ghost copy-btn" title="Скопировать результат">${COPY_ICONS}<span class="copy-label">Копировать</span></button>
      </div>
      <p class="stale-note" hidden>Исправьте исходные данные — поля с ошибкой выделены.</p>
      <div class="results-body">
        <div class="result-grid">${items}</div>
        <div class="extra"></div>
        <div class="formula" aria-label="Расчёт"></div>
        <div class="notes"></div>
      </div>`;
    box.querySelector('.copy-btn').addEventListener('click', (e) => copy(e.currentTarget, box._copy));
  }

  box.classList.remove('is-stale');
  box.querySelector('.results-body').removeAttribute('aria-hidden');
  box.querySelector('.stale-note').hidden = true;
  box._copy = data.copy;

  const results = box.querySelectorAll('.result');
  data.items.forEach((it, i) => {
    const r = results[i];
    setHTML(r.querySelector('.result-label'), it.label);
    setHTML(r.querySelector('.result-unit'), it.unit || '');
    setHTML(r.querySelector('.result-sub'), it.sub || '');
    const rv = r.querySelector('.rv');
    const parsed = it.num !== undefined ? { n: it.num, format: it.format } : parseShown(it.value);
    const changed = rv._text !== undefined && rv._text !== it.value;
    rv._text = it.value;
    rv._format = parsed && parsed.format;
    if (parsed) tweenValue(rv, parsed.n, it.value, parsed.format);
    else { cancelAnimationFrame(rv._raf); rv._cur = undefined; rv._to = undefined; rv.textContent = it.value; }
    if (changed) pulse(r);
  });
  setHTML(box.querySelector('.extra'), data.extra || '');
  setHTML(box.querySelector('.formula'), data.formula.map((l) => `<div class="f-line">${l}</div>`).join(''));
  setHTML(box.querySelector('.notes'), data.notes || '');
}

/** Счёт от нуля при первом показе панели. */
function countUp(panel) {
  panel.querySelectorAll('.rv').forEach((rv) => {
    if (rv._to !== undefined && rv._format) tweenValue(rv, rv._to, rv._text, rv._format, 0);
  });
}

async function copy(button, text) {
  const label = button.querySelector('.copy-label');
  let ok = true;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    ok = false;
  }
  button.classList.remove('is-copied', 'is-failed');
  void button.offsetWidth; // перезапуск анимации галочки при повторном нажатии
  button.classList.add(ok ? 'is-copied' : 'is-failed');
  label.textContent = ok ? 'Скопировано' : 'Не удалось';
  clearTimeout(button._timer);
  button._timer = setTimeout(() => {
    button.classList.remove('is-copied', 'is-failed');
    label.textContent = 'Копировать';
  }, 1600);
}

/** Текст для буфера обмена из пунктов результата. */
function plain(title, items) {
  const strip = (html) => html.replace(/<[^>]+>/g, '');
  return [title, ...items.map((i) => `${strip(i.label)}: ${strip(i.value)} ${strip(i.unit || '')}`.trim())].join('\n');
}

/* ---------- 1. Гидростатика ---------- */

function calcHydro() {
  const v = readAll({ rho: 'hydro-rho', h: 'hydro-h' });
  if (!v) return renderResults('hydro', null);
  const rho = v.rho * 1000;
  const p = F.hydrostaticPressure(rho, v.h);
  const grad = F.pressureGradient(rho);
  const items = [
    { label: 'Гидростатическое давление', value: fmt(p / 1e6, 2), unit: ' МПа', primary: true,
      sub: `≈ ${fmt(p / KGF_CM2, 1)} кгс/см²` },
    { label: 'Градиент давления', value: fmt(grad / 1e3, 2), unit: ' кПа/м',
      sub: `${fmt(grad * 100 / 1e6, 3)} МПа на 100 м` },
  ];
  renderResults('hydro', {
    items,
    formula: [
      `<i>P</i> = <i>ρ</i>·<i>g</i>·<i>h</i> = ${num(rho)} · 9,81 · ${num(v.h)} = ${num(p, 0)} Па = <b>${fmt(p / 1e6, 2)} МПа</b>`,
      `grad <i>P</i> = <i>ρ</i>·<i>g</i> = ${num(rho)} · 9,81 = ${num(grad, 1)} Па/м = <b>${fmt(grad / 1e3, 2)} кПа/м</b>`,
    ],
    notes: `<p>Плотность переводится в СИ: 1 г/см³ = 1000 кг/м³. Глубина берётся по вертикали, а не по стволу —
      для наклонной скважины давление определяется вертикальной высотой столба.</p>`,
    copy: plain('Гидростатическое давление', items),
  });
}

/* ---------- 2. ЭЦП ---------- */

function calcEcd() {
  const v = readAll({ rho: 'ecd-rho', dp: 'ecd-dp', h: 'ecd-h' });
  if (!v) return renderResults('ecd', null);
  const rho = v.rho * 1000;
  const dp = v.dp * 1e6;
  const ecd = F.equivalentCirculatingDensity(rho, dp, v.h);
  const pStat = F.hydrostaticPressure(rho, v.h);
  const items = [
    { label: 'ЭЦП', value: fmt(ecd / 1000, 3), unit: ' г/см³', primary: true,
      sub: `прирост +${fmt((ecd - rho) / 1000, 3)} г/см³` },
    { label: 'Забойное давление в покое', value: fmt(pStat / 1e6, 2), unit: ' МПа' },
    { label: 'Забойное давление при циркуляции', value: fmt((pStat + dp) / 1e6, 2), unit: ' МПа' },
  ];
  renderResults('ecd', {
    items,
    formula: [
      `<i>ρ</i><sub>экв</sub> = <i>ρ</i> + Δ<i>P</i><sub>кп</sub> / (<i>g</i>·<i>H</i>)`,
      `= ${num(rho)} + ${num(dp, 0)} / (9,81 · ${num(v.h)}) = ${num(rho)} + ${fmt((ecd - rho), 2)} = <b>${fmt(ecd, 1)} кг/м³</b>`,
      `<i>P</i><sub>заб.ц</sub> = <i>ρ</i>·<i>g</i>·<i>H</i> + Δ<i>P</i><sub>кп</sub> = ${fmt(pStat / 1e6, 2)} + ${num(v.dp)} = <b>${fmt((pStat + dp) / 1e6, 2)} МПа</b>`,
    ],
    notes: `<p>ЭЦП сравнивают с эквивалентной плотностью начала поглощения или гидроразрыва
      наиболее слабого пласта в открытом стволе. Потери Δ<i>P</i><sub>кп</sub> учитываются только в кольцевом
      пространстве — потери в трубах и долоте на забой не передаются.</p>`,
    copy: plain('Эквивалентная циркуляционная плотность', items),
  });
}

/* ---------- 3. Плотность по пластовому давлению ---------- */

function syncDensityMode() {
  const mode = $('density-mode').value;
  document.querySelectorAll('[data-show-when^="density-mode="]').forEach((el) => {
    el.hidden = el.dataset.showWhen !== `density-mode=${mode}`;
  });
}

function calcDensity() {
  syncDensityMode();
  const mode = $('density-mode').value;
  const v = readAll({ p: 'density-p', h: 'density-h' });
  let extra = null;
  if (mode === 'pct') extra = read('density-pct');
  if (mode === 'abs') extra = read('density-abs');
  if (!v || (mode !== 'norm' && extra === null)) return renderResults('density', null);

  const pRes = v.p * 1e6;
  const cap = Number($('density-cap').value) * 1e6;
  const norm = F.overbalanceMargin(pRes, v.h, cap);
  let dP;
  let marginLine;
  if (mode === 'norm') {
    dP = norm.dP;
    const pct = norm.fraction * 100;
    marginLine = `<i>H</i> ${v.h <= 1200 ? '≤' : '&gt;'} 1200 м → Δ<i>P</i> = min(${pct} % · ${num(v.p)}; ${num(norm.cap / 1e6)}) = `
      + `min(${fmt(norm.fraction * v.p, 2)}; ${num(norm.cap / 1e6)}) = <b>${fmt(dP / 1e6, 2)} МПа</b>`;
  } else if (mode === 'pct') {
    dP = (extra / 100) * pRes;
    marginLine = `Δ<i>P</i> = ${num(extra)} % · ${num(v.p)} = <b>${fmt(dP / 1e6, 2)} МПа</b>`;
  } else {
    dP = extra * 1e6;
    marginLine = `Δ<i>P</i> = <b>${fmt(dP / 1e6, 2)} МПа</b> (задано)`;
  }

  const rho = F.requiredMudDensity(pRes, v.h, dP);
  const rhoUp = Math.ceil(rho / 10 - 1e-9) / 100; // г/см³, вверх до 0,01
  const pHydUp = F.hydrostaticPressure(rhoUp * 1000, v.h);
  const ka = F.anomalyCoefficient(pRes, v.h);

  const items = [
    { label: 'Расчётная плотность', value: fmt(rho / 1000, 3), unit: ' г/см³', primary: true,
      sub: `с округлением вверх: ${fmt(rhoUp, 2)} г/см³` },
    { label: 'Репрессия ΔP', value: fmt(dP / 1e6, 2), unit: ' МПа',
      sub: `${fmt(dP / pRes * 100, 1)} % от P<sub>пл</sub>` },
    { label: 'Коэффициент аномальности k<sub>а</sub>', value: fmt(ka, 3), unit: '',
      sub: ka > 1.1 ? 'АВПД' : ka < 0.8 ? 'АНПД' : 'близко к гидростатическому' },
    { label: `P<sub>гс</sub> при ${fmt(rhoUp, 2)} г/см³`, value: fmt(pHydUp / 1e6, 2), unit: ' МПа',
      sub: `фактическая репрессия ${fmt((pHydUp - pRes) / 1e6, 2)} МПа` },
  ];

  const warnings = [];
  if (mode === 'norm' && norm.limited) {
    warnings.push(`<p class="note-info">${norm.fraction * 100} % от P<sub>пл</sub> = ${fmt(norm.fraction * v.p, 2)} МПа
      больше предела — репрессия ограничена ${num(norm.cap / 1e6)} МПа.</p>`);
  }
  if (mode !== 'norm' && dP < norm.dP - 1) {
    warnings.push(`<p class="note-warn">Заданная репрессия меньше нормативной для этой глубины
      (${fmt(norm.dP / 1e6, 2)} МПа по ФНП). Отступление допускается только при обосновании в проекте.</p>`);
  }

  renderResults('density', {
    items,
    formula: [
      marginLine,
      `<i>ρ</i> = (<i>P</i><sub>пл</sub> + Δ<i>P</i>) / (<i>g</i>·<i>H</i>) = (${num(v.p)} + ${fmt(dP / 1e6, 2)})·10⁶ / (9,81 · ${num(v.h)}) = <b>${fmt(rho, 1)} кг/м³</b>`,
      `<i>k</i><sub>а</sub> = <i>P</i><sub>пл</sub> / (<i>ρ</i><sub>в</sub>·<i>g</i>·<i>H</i>) = ${num(v.p)}·10⁶ / (1000 · 9,81 · ${num(v.h)}) = <b>${fmt(ka, 3)}</b>`,
    ],
    notes: `${warnings.join('')}
      <p>H — глубина кровли пласта по вертикали. Плотность определяется для горизонта с максимальным
      градиентом пластового давления в интервале совместимых условий бурения.
      При глушении проявления P<sub>пл</sub> находят по избыточному давлению в бурильных трубах после
      герметизации устья: P<sub>пл</sub> = P<sub>изб.тр</sub> + ρ·g·H.</p>`,
    copy: plain('Плотность раствора по пластовому давлению', items),
  });
}

/* ---------- 4. Объёмы ---------- */

const EXAMPLE_INTERVALS = [
  { type: 'casing', length: 1500, D: 225, dOut: 127, dIn: 108.6 },
  { type: 'open', length: 1300, D: 215.9, dOut: 127, dIn: 108.6 },
  { type: 'open', length: 200, D: 215.9, dOut: 178, dIn: 71.4 },
];

let lastVolumes = null;

function intervalRow(it) {
  const tr = document.createElement('tr');
  const n = (v) => (v === '' || v === undefined ? '' : String(v).replace('.', ','));
  tr.innerHTML = `
    <td><div class="cell"><select data-k="type" aria-label="Тип интервала">
      <option value="casing"${it.type === 'casing' ? ' selected' : ''}>Обсадная колонна</option>
      <option value="open"${it.type === 'open' ? ' selected' : ''}>Открытый ствол</option>
    </select></div></td>
    <td><div class="cell"><input data-k="length" inputmode="decimal" autocomplete="off" aria-label="Длина, м" value="${n(it.length)}"></div></td>
    <td><div class="cell"><input data-k="D" inputmode="decimal" autocomplete="off" aria-label="D, мм" value="${n(it.D)}"></div></td>
    <td><div class="cell"><input data-k="dOut" inputmode="decimal" autocomplete="off" aria-label="Наружный диаметр труб, мм" value="${n(it.dOut)}"></div></td>
    <td><div class="cell"><input data-k="dIn" inputmode="decimal" autocomplete="off" aria-label="Внутренний диаметр труб, мм" value="${n(it.dIn)}"></div></td>
    <td><div class="cell"><button type="button" class="icon-btn" data-remove aria-label="Удалить интервал">×</button></div></td>`;
  return tr;
}

function setIntervals(list) {
  const body = $('intervals-body');
  body.innerHTML = '';
  list.forEach((it) => body.appendChild(intervalRow(it)));
}

/** Строки, которые не удаляются в данный момент (удаляемая строка ещё видна, пока сворачивается). */
const liveRows = () => [...$('intervals-body').querySelectorAll('tr:not([data-removing])')];

/** Плавное появление/сворачивание строки таблицы интервалов (высота + прозрачность). */
function animateRow(tr, dir) {
  const cells = [...tr.querySelectorAll('.cell')];
  if (REDUCED.matches || !cells[0].animate) {
    if (dir === 'out') tr.remove();
    return;
  }
  const h = `${tr.offsetHeight}px`;
  const open = { height: h, opacity: 1, transform: 'none' };
  const shut = { height: '0px', opacity: 0, transform: 'translateY(-6px)' };
  const frames = dir === 'in' ? [shut, open] : [open, shut];
  let anim;
  cells.forEach((c) => {
    c.classList.add('clip');
    anim = c.animate(frames, { duration: dir === 'in' ? 340 : 280, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
  });
  anim.onfinish = () => {
    if (dir === 'out') { tr.remove(); return; }
    cells.forEach((c) => { c.classList.remove('clip'); c.getAnimations().forEach((a) => a.cancel()); });
  };
}

function readIntervals() {
  const rows = liveRows();
  const errors = [];
  const list = rows.map((tr, i) => {
    const get = (k) => tr.querySelector(`[data-k="${k}"]`);
    const it = { type: get('type').value };
    let rowOk = true;
    for (const k of ['length', 'D', 'dOut', 'dIn']) {
      const el = get(k);
      const v = parseNum(el.value);
      const bad = Number.isNaN(v) || v < 0 || (k !== 'dIn' && v <= 0) || v > (k === 'length' ? 15000 : 1000);
      el.classList.toggle('invalid', bad);
      if (bad) rowOk = false;
      it[k] = v;
    }
    if (!rowOk) {
      errors.push(`Интервал ${i + 1}: проверьте числа (длина до 15 000 м, диаметры до 1000 мм).`);
    } else if (!(it.dIn < it.dOut && it.dOut < it.D)) {
      errors.push(`Интервал ${i + 1}: должно быть d<sub>вн</sub> &lt; d<sub>н</sub> &lt; D.`);
      ['D', 'dOut', 'dIn'].forEach((k) => get(k).classList.add('invalid'));
    }
    return it;
  });
  if (!rows.length) errors.push('Добавьте хотя бы один интервал.');
  setHTML($('intervals-error'), errors.join('<br>'));
  return errors.length ? null : list;
}

function calcVolumes() {
  const list = readIntervals();
  if (!list) {
    lastVolumes = null;
    $('well-svg').classList.add('is-stale');
    return renderResults('volumes', null);
  }
  const si = list.map((it) => ({ length: it.length, D: it.D / 1000, dOut: it.dOut / 1000, dIn: it.dIn / 1000 }));
  const r = F.wellVolumes(si);
  lastVolumes = r;

  const items = [
    { label: 'Внутренний объём труб V<sub>тр</sub>', value: fmt(r.pipe, 2), unit: ' м³' },
    { label: 'Кольцевое пространство V<sub>кп</sub>', value: fmt(r.annulus, 2), unit: ' м³' },
    { label: 'Раствор в скважине с трубами', value: fmt(r.total, 2), unit: ' м³', primary: true,
      sub: 'V<sub>тр</sub> + V<sub>кп</sub>' },
    { label: 'Ствол без труб V<sub>ств</sub>', value: fmt(r.hole, 2), unit: ' м³',
      sub: `объём металла ${fmt(r.steel, 2)} м³` },
  ];

  let depth = 0;
  const rowsHtml = list.map((it, i) => {
    const top = depth;
    depth += it.length;
    const row = r.rows[i];
    return `<tr>
      <td>${num(top)}–${num(depth)}</td>
      <td>${it.type === 'casing' ? 'колонна' : 'откр. ствол'}</td>
      <td>${fmt(row.pipe, 2)}</td>
      <td>${fmt(row.annulus, 2)}</td>
      <td>${fmt(row.annulus / it.length * 1000, 1)}</td>
    </tr>`;
  }).join('');
  const extra = `
    <div class="table-scroll"><table class="breakdown">
      <thead><tr><th>Интервал, м</th><th></th><th>V<sub>тр</sub>, м³</th><th>V<sub>кп</sub>, м³</th><th>КП, л/м</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table></div>`;

  const first = si[0];
  renderResults('volumes', {
    items,
    extra,
    formula: [
      `<i>V</i><sub>тр</sub> = Σ π·<i>d</i><sub>вн</sub>²/4 · <i>L</i>`,
      `<i>V</i><sub>кп</sub> = Σ π·(<i>D</i>² − <i>d</i><sub>н</sub>²)/4 · <i>L</i>`,
      `<i>V</i><sub>ств</sub> = Σ π·<i>D</i>²/4 · <i>L</i>, &nbsp; <i>V</i><sub>мет</sub> = Σ π·(<i>d</i><sub>н</sub>² − <i>d</i><sub>вн</sub>²)/4 · <i>L</i>`,
      `Интервал 1: <i>V</i><sub>кп</sub> = π·(${num(first.D)}² − ${num(first.dOut)}²)/4 · ${num(first.length)} = <b>${fmt(r.rows[0].annulus, 2)} м³</b>`,
    ],
    notes: `<p>Номинальный объём без учёта каверн: для открытого ствола фактический объём больше
      (по кавернометрии или коэффициенту кавернозности). V<sub>мет</sub> — объём, вытесняемый металлом труб
      (долив при подъёме колонны).</p>`,
    copy: plain('Объёмы скважины', items),
  });
  drawWell(list);
}

/* Схема скважины (SVG): по вертикали — глубина, по горизонтали — диаметры в своём масштабе.
   Элементы создаются один раз и при изменении геометрии плавно перестраиваются;
   при первом показе ствол «пробуривается» сверху вниз. */
const SVGNS = 'http://www.w3.org/2000/svg';
const WG = { W: 320, H: 440, top: 34, bottom: 16, cx: 120 };
const well = { svg: null, rows: [], cur: null, target: null, reveal: 0, shown: false, raf: 0 };

function svgEl(tag, attrs = {}, parent = null) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}

function wellModel(list) {
  const total = list.reduce((s, i) => s + i.length, 0);
  const maxD = Math.max(...list.map((i) => i.D));
  const kx = 64 / (maxD / 2);              // половина максимального диаметра = 64 px
  const ky = (WG.H - WG.top - WG.bottom) / total;
  let y = WG.top;
  let depth = 0;
  return list.map((it) => {
    const h = it.length * ky;
    depth += it.length;
    const row = {
      type: it.type, y, h, R: (it.D / 2) * kx, ro: (it.dOut / 2) * kx, ri: (it.dIn / 2) * kx,
      depth, D: it.D, dOut: it.dOut, dIn: it.dIn,
    };
    y += h;
    return row;
  });
}

function ensureWellSvg() {
  if (well.svg) return;
  const { W, H, top, cx } = WG;
  $('well-svg').innerHTML = `
    <svg viewBox="0 0 ${W} ${H + 14}" role="img" aria-label="Схема конструкции скважины">
      <defs>
        <linearGradient id="wg-rock" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" class="wg-rock-top"/><stop offset="1" class="wg-rock-bot"/>
        </linearGradient>
        <linearGradient id="wg-flow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" class="wg-flow-0"/><stop offset=".5" class="wg-flow-1"/><stop offset="1" class="wg-flow-0"/>
        </linearGradient>
        <pattern id="wg-flow-pat" width="8" height="48" patternUnits="userSpaceOnUse">
          <rect y="14" width="8" height="20" fill="url(#wg-flow)"/>
        </pattern>
        <clipPath id="wg-ann"></clipPath>
        <clipPath id="wg-bore"></clipPath>
      </defs>
      <rect x="0" y="${top}" width="${W}" height="${H - top + 14}" fill="url(#wg-rock)"/>
      <line x1="0" y1="${top}" x2="${W}" y2="${top}" class="w-ground"/>
      <g class="w-rows"></g>
      <g clip-path="url(#wg-ann)"><rect class="w-flow up" x="0" y="${top}" width="${W}" height="${H - top + 52}" fill="url(#wg-flow-pat)"/></g>
      <g clip-path="url(#wg-bore)"><rect class="w-flow down" x="0" y="${top - 52}" width="${W}" height="${H - top + 52}" fill="url(#wg-flow-pat)"/></g>
      <path class="w-bit"/>
      <g class="w-labels"></g>
      <text x="${cx + 88}" y="${top + 4}" class="w-depth">0 м</text>
      <text x="${cx}" y="${top - 12}" text-anchor="middle" class="w-label muted">устье</text>
    </svg>
    <div class="legend">
      <span><i class="lg w-mud"></i>раствор</span>
      <span><i class="lg w-pipe"></i>трубы</span>
      <span><i class="lg w-casing"></i>обсадная колонна</span>
      <span><i class="lg w-cement"></i>цемент</span>
    </div>
    <p class="hint">Масштаб по горизонтали и вертикали разный.</p>`;
  well.svg = $('well-svg').querySelector('svg');
  well.g = well.svg.querySelector('.w-rows');
  well.labels = well.svg.querySelector('.w-labels');
  well.ann = well.svg.querySelector('#wg-ann');
  well.boreClip = well.svg.querySelector('#wg-bore');
  well.bit = well.svg.querySelector('.w-bit');
}

/** Набор SVG-элементов под каждый интервал (число элементов зависит только от числа интервалов). */
function syncWellRows(n) {
  while (well.rows.length > n) {
    const r = well.rows.pop();
    r.all.forEach((el) => el.remove());
  }
  while (well.rows.length < n) {
    const g = svgEl('g', {}, well.g);
    const r = {
      mud: svgEl('rect', { class: 'w-mud' }, g),
      casL: svgEl('rect', { class: 'w-casing', width: 5 }, g),
      casR: svgEl('rect', { class: 'w-casing', width: 5 }, g),
      cemL: svgEl('rect', { class: 'w-cement', width: 4 }, g),
      cemR: svgEl('rect', { class: 'w-cement', width: 4 }, g),
      wallL: svgEl('line', { class: 'w-wall' }, g),
      wallR: svgEl('line', { class: 'w-wall' }, g),
      pipe: svgEl('rect', { class: 'w-pipe' }, g),
      bore: svgEl('rect', { class: 'w-bore' }, g),
      annL: svgEl('rect', {}, well.ann),
      annR: svgEl('rect', {}, well.ann),
      boreC: svgEl('rect', {}, well.boreClip),
      tick: svgEl('line', { class: 'w-tick w-fade' }, well.labels),
      depth: svgEl('text', { class: 'w-depth w-fade' }, well.labels),
      kind: svgEl('text', { class: 'w-label w-fade' }, well.labels),
      pipeTxt: svgEl('text', { class: 'w-label muted w-fade' }, well.labels),
    };
    r.g = g;
    r.all = [g, r.annL, r.annR, r.boreC, r.tick, r.depth, r.kind, r.pipeTxt];
    well.rows.push(r);
  }
}

const r2 = (v) => Math.round(v * 100) / 100;
function setA(el, attrs) {
  for (const k in attrs) el.setAttribute(k, r2(attrs[k]));
}
function setOpacity(el, on) {
  const v = on ? '1' : '0';
  if (el.style.opacity !== v) el.style.opacity = v;
}

/** Рисует модель: rows — текущая (возможно промежуточная) геометрия, reveal — доля «пробуренной» глубины. */
function paintWell(rows, reveal) {
  const { cx, top } = WG;
  const bottomY = rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].h : top;
  const revealY = top + (bottomY - top) * reveal;
  rows.forEach((m, i) => {
    const el = well.rows[i];
    const hv = Math.max(0, Math.min(m.h, revealY - m.y));
    const { y, R, ro, ri } = m;
    const casing = m.type === 'casing';
    setA(el.mud, { x: cx - R, y, width: 2 * R, height: hv });
    [el.casL, el.casR, el.cemL, el.cemR].forEach((e) => { e.style.display = casing ? '' : 'none'; });
    [el.wallL, el.wallR].forEach((e) => { e.style.display = casing ? 'none' : ''; });
    if (casing) {
      setA(el.casL, { x: cx - R - 5, y, height: hv });
      setA(el.casR, { x: cx + R, y, height: hv });
      setA(el.cemL, { x: cx - R - 9, y, height: hv });
      setA(el.cemR, { x: cx + R + 5, y, height: hv });
    } else {
      setA(el.wallL, { x1: cx - R, y1: y, x2: cx - R, y2: y + hv });
      setA(el.wallR, { x1: cx + R, y1: y, x2: cx + R, y2: y + hv });
    }
    setA(el.pipe, { x: cx - ro, y, width: 2 * ro, height: hv });
    setA(el.bore, { x: cx - ri, y, width: 2 * ri, height: hv });
    setA(el.annL, { x: cx - R, y, width: Math.max(0, R - ro), height: hv });
    setA(el.annR, { x: cx + ro, y, width: Math.max(0, R - ro), height: hv });
    setA(el.boreC, { x: cx - ri, y, width: 2 * ri, height: hv });

    const yEnd = y + m.h;
    const done = revealY >= yEnd - 0.5;
    setA(el.tick, { x1: cx + 76, y1: yEnd, x2: cx + 84, y2: yEnd });
    setA(el.depth, { x: cx + 88, y: yEnd + 4 });
    setA(el.kind, { x: cx + 88, y: y + m.h / 2 - 3 });
    setA(el.pipeTxt, { x: cx + 88, y: y + m.h / 2 + 11 });
    setOpacity(el.tick, done);
    setOpacity(el.depth, done);
    setOpacity(el.kind, done && m.h > 26);
    setOpacity(el.pipeTxt, done && m.h > 26);
  });
  if (rows.length) {
    const last = rows[rows.length - 1];
    const yb = Math.min(revealY, last.y + last.h);
    const b = Math.max(last.ro, 6);
    well.bit.setAttribute('d', `M${r2(cx - b)} ${r2(yb - 1)} L${r2(cx + b)} ${r2(yb - 1)} L${cx} ${r2(yb + 10)} Z`);
  }
}

function setWellText(rows) {
  rows.forEach((m, i) => {
    const el = well.rows[i];
    el.depth.textContent = `${num(m.depth)} м`;
    el.kind.innerHTML = m.type === 'casing'
      ? `колонна D<tspan class="w-sub" dy="2">вн</tspan><tspan dy="-2"> ${num(m.D, 1)}</tspan>`
      : `ствол ${num(m.D, 1)}`;
    el.pipeTxt.textContent = `трубы ${num(m.dOut, 1)}×${num((m.dOut - m.dIn) / 2, 2)}`;
  });
}

const lerp = (a, b, k) => a + (b - a) * k;
function lerpRows(from, to, k) {
  return to.map((t, i) => {
    const f = from[i];
    return {
      ...t, y: lerp(f.y, t.y, k), h: lerp(f.h, t.h, k),
      R: lerp(f.R, t.R, k), ro: lerp(f.ro, t.ro, k), ri: lerp(f.ri, t.ri, k),
    };
  });
}

function animateWell(fromRows, fromReveal, dur) {
  cancelAnimationFrame(well.raf);
  const to = well.target;
  if (REDUCED.matches || !well.shown) {
    well.cur = to;
    well.reveal = well.shown ? 1 : 0;
    paintWell(to, well.reveal);
    return;
  }
  // Новые интервалы вырастают из забоя прежней конструкции.
  const prevBottom = fromRows.length ? fromRows[fromRows.length - 1].y + fromRows[fromRows.length - 1].h : WG.top;
  const from = to.map((t, i) => fromRows[i] || { ...t, y: prevBottom, h: 0 });
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = easeInOut(k);
    well.cur = lerpRows(from, to, e);
    well.reveal = lerp(fromReveal, 1, e);
    paintWell(well.cur, well.reveal);
    if (k < 1) well.raf = requestAnimationFrame(step);
  };
  well.raf = requestAnimationFrame(step);
}

function drawWell(list) {
  ensureWellSvg();
  $('well-svg').classList.remove('is-stale');
  const prev = well.cur || [];
  well.target = wellModel(list);
  syncWellRows(well.target.length);
  setWellText(well.target);
  animateWell(prev.slice(0, well.target.length), well.reveal, 650);
}

/** Первый показ вкладки «Объёмы»: ствол прорисовывается сверху вниз. */
function revealWell() {
  if (well.shown) return;
  well.shown = true;
  if (!well.target) return;
  well.reveal = 0;
  animateWell(well.target, 0, 1300);
}

/* ---------- 5. Циркуляция ---------- */

function fillCircFromVolumes() {
  if (!lastVolumes) return;
  $('circ-vp').value = fmt(lastVolumes.pipe, 2).replace(/\s/g, '');
  $('circ-va').value = fmt(lastVolumes.annulus, 2).replace(/\s/g, '');
}

function calcCirc() {
  const v = readAll({ q: 'circ-q', vp: 'circ-vp', va: 'circ-va', vs: 'circ-vs' });
  if (!v) return renderResults('circ', null);
  const q = v.q / 1000;
  const tPipe = F.pumpTime(v.vp, q);
  const tUp = F.pumpTime(v.va, q);
  const vCycle = v.vp + v.va + v.vs;
  const tCycle = F.pumpTime(vCycle, q);
  const items = [
    { label: 'Выход забойной пачки (bottoms-up)', value: fmtTime(tUp), unit: '', primary: true,
      num: tUp, format: fmtTime, sub: `${fmt(tUp / 60, 1)} мин` },
    { label: 'Время до долота', value: fmtTime(tPipe), unit: '', num: tPipe, format: fmtTime,
      sub: `${fmt(tPipe / 60, 1)} мин` },
    { label: 'Полный цикл циркуляции', value: fmtTime(tCycle), unit: '', num: tCycle, format: fmtTime,
      sub: `${fmt(tCycle / 60, 1)} мин` },
    { label: 'Объём цикла', value: fmt(vCycle, 2), unit: ' м³' },
  ];
  renderResults('circ', {
    items,
    formula: [
      `<i>t</i> = <i>V</i> / <i>Q</i>, &nbsp; <i>Q</i> = ${num(v.q)} л/с = ${num(q, 5)} м³/с`,
      `<i>t</i><sub>кп</sub> = <i>V</i><sub>кп</sub> / <i>Q</i> = ${num(v.va)} / ${num(q, 5)} = <b>${num(tUp, 0)} с</b>`,
      `<i>t</i><sub>тр</sub> = <i>V</i><sub>тр</sub> / <i>Q</i> = ${num(v.vp)} / ${num(q, 5)} = <b>${num(tPipe, 0)} с</b>`,
      `<i>t</i><sub>ц</sub> = (<i>V</i><sub>тр</sub> + <i>V</i><sub>кп</sub> + <i>V</i><sub>пов</sub>) / <i>Q</i> = ${num(vCycle, 2)} / ${num(q, 5)} = <b>${num(tCycle, 0)} с</b>`,
    ],
    notes: `<p>Расчёт по номинальным объёмам. В открытом стволе с кавернами фактическое время выхода
      забойной пачки больше; его уточняют по времени выхода индикатора (карбида, краски).
      Подача — фактическая, с учётом коэффициента наполнения насоса.</p>`,
    copy: plain('Время циркуляции', items),
  });
}

/* ---------- 6. Скорость восходящего потока ---------- */

function calcVelocity() {
  const v = readAll({ q: 'vel-q', D: 'vel-D', d: 'vel-d' });
  if (v && v.d >= v.D) {
    setError($('vel-d'), 'Диаметр труб должен быть меньше D');
  }
  if (!v || v.d >= v.D) return renderResults('velocity', null);
  const q = v.q / 1000;
  const D = v.D / 1000;
  const d = v.d / 1000;
  const S = F.annularArea(D, d);
  const vel = F.annularVelocity(q, D, d);
  const items = [
    { label: 'Скорость восходящего потока', value: fmt(vel, 2), unit: ' м/с', primary: true,
      sub: `${fmt(vel * 60, 0)} м/мин` },
    { label: 'Площадь кольцевого сечения', value: fmt(S * 1e4, 1), unit: ' см²' },
    { label: 'Удельный объём КП', value: fmt(S * 1000, 2), unit: ' л/м' },
  ];
  renderResults('velocity', {
    items,
    formula: [
      `<i>S</i><sub>кп</sub> = π·(<i>D</i>² − <i>d</i><sub>н</sub>²)/4 = π·(${num(D)}² − ${num(d)}²)/4 = ${num(S, 6)} м²`,
      `<i>v</i> = <i>Q</i> / <i>S</i><sub>кп</sub> = ${num(q, 5)} / ${num(S, 6)} = <b>${fmt(vel, 3)} м/с</b>`,
    ],
    notes: `<p>Это средняя по сечению скорость. Для оценки выноса шлама её сравнивают со скоростью
      осаждения частиц в растворе; при эксцентричном положении колонны и в кавернах скорость
      на отдельных участках сечения ниже.</p>`,
    copy: plain('Скорость восходящего потока', items),
  });
}

/* ---------- 7. Вес колонны ---------- */

function calcBuoy() {
  const v = readAll({ q: 'buoy-q', l: 'buoy-l', rho: 'buoy-rho', steel: 'buoy-steel' });
  if (v && v.rho >= v.steel) setError($('buoy-rho'), 'Плотность раствора должна быть меньше плотности труб');
  if (!v || v.rho >= v.steel) return renderResults('buoy', null);
  const rho = v.rho * 1000;
  const rs = v.steel * 1000;
  const k = F.buoyancyFactor(rho, rs);
  const gAir = v.q * v.l * F.G;
  const gMud = F.buoyedWeight(v.q, v.l, rho, rs);
  const items = [
    { label: 'Вес в растворе', value: fmt(gMud / 1e3, 1), unit: ' кН', primary: true,
      sub: `≈ ${fmt(gMud / TF, 1)} тс` },
    { label: 'Коэффициент плавучести k', value: fmt(k, 4), unit: '' },
    { label: 'Вес в воздухе', value: fmt(gAir / 1e3, 1), unit: ' кН', sub: `≈ ${fmt(gAir / TF, 1)} тс` },
    { label: 'Облегчение', value: fmt((gAir - gMud) / 1e3, 1), unit: ' кН',
      sub: `${fmt((1 - k) * 100, 1)} % веса` },
  ];
  renderResults('buoy', {
    items,
    formula: [
      `<i>k</i> = 1 − <i>ρ</i><sub>р</sub>/<i>ρ</i><sub>ст</sub> = 1 − ${num(rho)}/${num(rs)} = <b>${fmt(k, 4)}</b>`,
      `<i>G</i><sub>возд</sub> = <i>q</i>·<i>L</i>·<i>g</i> = ${num(v.q)} · ${num(v.l)} · 9,81 = ${num(gAir, 0)} Н`,
      `<i>G</i><sub>р</sub> = <i>k</i>·<i>G</i><sub>возд</sub> = ${fmt(k, 4)} · ${num(gAir, 0)} = <b>${fmt(gMud / 1e3, 1)} кН</b>`,
    ],
    notes: `<p>Формула справедлива, когда раствор одной плотности внутри и снаружи колонны.
      Трение о стенки скважины в наклонном стволе не учитывается — показание индикатора веса
      при подъёме будет больше, при спуске меньше. 1 тс = 9,80665 кН.</p>`,
    copy: plain('Вес колонны в растворе', items),
  });
}

/* ---------- связка ---------- */

const CALCS = {
  hydro: calcHydro,
  ecd: calcEcd,
  density: calcDensity,
  volumes: () => { calcVolumes(); },
  circ: calcCirc,
  velocity: calcVelocity,
  buoy: calcBuoy,
};

function resetForm(form) {
  form.querySelectorAll('[data-default]').forEach((el) => {
    el.value = el.dataset.default;
    if (el.tagName === 'INPUT') setError(el, '');
  });
  if (form.dataset.calc === 'volumes') setIntervals(EXAMPLE_INTERVALS);
  if (form.dataset.calc === 'circ') {
    const prev = lastVolumes;
    lastVolumes = F.wellVolumes(EXAMPLE_INTERVALS.map((it) => ({
      length: it.length, D: it.D / 1000, dOut: it.dOut / 1000, dIn: it.dIn / 1000,
    })));
    fillCircFromVolumes();
    lastVolumes = prev;
  }
}

function initForms() {
  document.querySelectorAll('form[data-calc]').forEach((form) => {
    const name = form.dataset.calc;
    const run = CALCS[name];
    // Пересчёт «на лету» с короткой задержкой, чтобы не дёргать вывод на каждой клавише.
    let timer = 0;
    form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 80); });
    form.addEventListener('change', () => { clearTimeout(timer); run(); });
    form.addEventListener('submit', (e) => e.preventDefault());
    form.querySelector('[data-example]').addEventListener('click', () => {
      resetForm(form);
      run();
    });
    resetForm(form);
  });

  $('intervals-body').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    const tr = btn.closest('tr');
    if (tr.dataset.removing) return;
    tr.dataset.removing = '1';
    tr.querySelectorAll('input, select, button').forEach((el) => { el.disabled = true; });
    calcVolumes();
    animateRow(tr, 'out');
  });
  $('add-interval').addEventListener('click', () => {
    const rows = readIntervalsRaw();
    const last = rows[rows.length - 1] || { type: 'open', D: 215.9, dOut: 127, dIn: 108.6 };
    const tr = intervalRow({ ...last, type: 'open', length: 100 });
    $('intervals-body').appendChild(tr);
    animateRow(tr, 'in');
    calcVolumes();
  });
  $('take-volumes').addEventListener('click', () => {
    calcVolumes();
    fillCircFromVolumes();
    calcCirc();
    if (lastVolumes && !REDUCED.matches) {
      ['circ-vp', 'circ-va'].forEach((id) => {
        const c = $(id).closest('.control');
        c.classList.remove('flash');
        void c.offsetWidth;
        c.classList.add('flash');
      });
    }
  });

  // Порядок важен: объёмы считаются до циркуляции.
  calcVolumes();
  Object.entries(CALCS).forEach(([k, fn]) => { if (k !== 'volumes') fn(); });
}

function readIntervalsRaw() {
  return liveRows().map((tr) => {
    const g = (k) => tr.querySelector(`[data-k="${k}"]`).value;
    return { type: g('type'), D: g('D'), dOut: g('dOut'), dIn: g('dIn') };
  });
}

/* ---------- вкладки ---------- */

function initTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const bar = document.querySelector('.tabs');
  const indicator = document.createElement('span');
  indicator.className = 'tab-indicator no-anim';
  indicator.setAttribute('aria-hidden', 'true');
  bar.prepend(indicator);
  const shown = new Set();
  let current = null;

  const active = () => tabs.find((t) => t.getAttribute('aria-selected') === 'true');

  // Индикатор двигается только через transform (+ ширина одного абсолютного элемента).
  const moveIndicator = (tab, animate = true) => {
    if (!tab) return;
    indicator.classList.toggle('no-anim', !animate);
    indicator.style.width = `${tab.offsetWidth}px`;
    indicator.style.transform = `translateX(${tab.offsetLeft}px)`;
  };

  // Мягкое затухание краёв полосы вкладок, если она прокручивается (телефон).
  const updateFades = () => {
    const max = bar.scrollWidth - bar.clientWidth;
    bar.classList.toggle('fade-l', bar.scrollLeft > 2);
    bar.classList.toggle('fade-r', max > 2 && bar.scrollLeft < max - 2);
  };

  const scrollTabIntoView = (tab, smooth) => {
    if (bar.scrollWidth <= bar.clientWidth) return;
    const left = tab.offsetLeft - (bar.clientWidth - tab.offsetWidth) / 2;
    bar.scrollTo({ left: Math.max(0, left), behavior: smooth && !REDUCED.matches ? 'smooth' : 'auto' });
  };

  const select = (name, focus = false) => {
    if (!CALCS[name]) name = 'hydro';
    if (name === current) return;
    const first = current === null;
    current = name;
    // Если страница прокручена ниже шапки — новая панель начинается сразу под вкладками.
    const header = document.querySelector('.site-header');
    if (!first && window.scrollY > header.offsetHeight) window.scrollTo(0, header.offsetHeight);
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(`panel-${t.dataset.tab}`).hidden = !on;
      if (on && focus) t.focus({ preventScroll: true });
      if (on) {
        moveIndicator(t, !first);
        scrollTabIntoView(t, !first);
      }
    });
    if (!shown.has(name)) {
      shown.add(name);
      countUp($(`panel-${name}`));
      if (name === 'volumes') revealWell();
    }
  };

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => {
      history.replaceState(null, '', `#${t.dataset.tab}`);
      select(t.dataset.tab);
    });
    t.addEventListener('keydown', (e) => {
      const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!d) return;
      const next = tabs[(i + d + tabs.length) % tabs.length];
      history.replaceState(null, '', `#${next.dataset.tab}`);
      select(next.dataset.tab, true);
    });
  });
  bar.addEventListener('scroll', updateFades, { passive: true });
  window.addEventListener('hashchange', () => select(location.hash.slice(1)));
  const relayout = () => { moveIndicator(active(), false); updateFades(); };
  if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(bar);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  select(location.hash.slice(1));
  updateFades();
}

initForms();
initTabs();
