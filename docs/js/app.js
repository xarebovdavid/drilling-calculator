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

/* Справочники. Обсадные трубы — ГОСТ 632-80 / API 5CT: наружный диаметр и типичные
   толщины стенки (первая подставляется по умолчанию). Долота — ГОСТ 20692 / API. */
const CASING_TYPES = {
  shaft: { name: 'Шахтное направление', short: 'Шахт. направление' },
  conductor: { name: 'Направление', short: 'Направление' },
  surface: { name: 'Кондуктор', short: 'Кондуктор' },
  intermediate: { name: 'Техническая', short: 'Техн. колонна', title: 'Техническая (промежуточная) колонна' },
  production: { name: 'Эксплуатационная', short: 'Экспл. колонна' },
  liner: { name: 'Хвостовик', short: 'Хвостовик', title: 'Хвостовик (потайная колонна): от головы до башмака' },
};
const CASING_ORDER = ['shaft', 'conductor', 'surface', 'intermediate', 'production', 'liner'];

const CASING_SIZES = [
  [114.3, [6.4, 5.2, 5.7, 7.4, 8.6]],
  [127, [7.5, 5.6, 6.4, 9.2]],
  [139.7, [7.7, 6.2, 7.0, 9.2, 10.5]],
  [146.1, [7.7, 6.5, 7.0, 8.5, 9.5, 10.7]],
  [168.3, [8.9, 7.3, 8.0, 10.6, 12.1]],
  [177.8, [9.2, 6.9, 8.1, 10.4, 11.5, 12.7]],
  [193.7, [9.5, 7.6, 8.3, 10.9, 12.7]],
  [219.1, [8.9, 6.7, 7.7, 10.2, 11.4, 12.7]],
  [244.5, [8.9, 7.9, 10.0, 11.1, 12.0, 13.8]],
  [273.1, [8.9, 7.1, 10.2, 11.4, 12.6]],
  [298.5, [9.5, 8.5, 11.1, 12.4]],
  [323.9, [9.5, 8.5, 11.0, 12.4]],
  [339.7, [9.7, 8.4, 10.9, 12.2]],
  [406.4, [11.1, 9.5, 12.6]],
  [426, [10, 11, 12]],
  [473.1, [11.1]],
  [508, [11.1, 12.7, 16.1]],
  [530, [10, 12]],
  [720, [10, 12]],
];
const BIT_SIZES = [120.6, 123.8, 139.7, 142.9, 146, 152.4, 155.6, 165.1, 190.5, 215.9, 220.7, 244.5,
  269.9, 295.3, 311.1, 349.2, 393.7, 444.5, 490, 508, 660.4];

/* Элементы бурильной колонны и типоразмеры [Dн, dвн, название] в мм. */
const STRING_KINDS = {
  motor: { name: 'ВЗД', full: 'ВЗД', cls: 'motor',
    presets: [[240, 90], [195, 70], [172, 60], [127, 45], [120, 40], [106, 35]].map(([od, id]) => [od, id, `ВЗД ${num(od, 1)}`]) },
  dc: { name: 'УБТ', full: 'УБТ', cls: 'dc',
    presets: [[229, 76.2], [203, 71.4], [178, 71.4], [165, 57.2], [146, 74], [120.6, 57.2]]
      .map(([od, id]) => [od, id, `УБТ ${num(od, 1)}×${num(id, 1)}`]) },
  hw: { name: 'ТБТ', full: 'ТБТ', cls: 'hw',
    presets: [[127, 76.2], [101.6, 65.1], [88.9, 52.4]].map(([od, id]) => [od, id, `ТБТ ${num(od, 1)}`]) },
  dp: { name: 'Бурильные трубы', full: 'СБТ / ЛБТ', cls: 'dp',
    presets: [[127, 108.6, 'СБТ 127×9,19'], [127, 101.6, 'СБТ 127×12,7'], [114.3, 97.2, 'СБТ 114,3×8,56'],
      [101.6, 84.8, 'СБТ 101,6×8,38'], [88.9, 70.2, 'СБТ 88,9×9,35'], [73, 54.6, 'СБТ 73×9,19'],
      [147, 125, 'ЛБТ 147×11'], [129, 111, 'ЛБТ 129×9']] },
};

/* Готовые примеры. Каждая следующая колонна проходит в Dвн предыдущей, долото — в последнюю. */
const VOL_PRESETS = {
  // Наклонно направленная скважина Западной Сибири: бурение под эксплуатационную колонну.
  default: {
    casings: [
      { type: 'conductor', od: 323.9, wall: 9.5, top: 0, shoe: 50 },
      { type: 'surface', od: 244.5, wall: 8.9, top: 0, shoe: 750 },
    ],
    bit: 215.9, depth: 2900, k: 1, onBottom: true, bitDepth: 2850,
    string: [
      { kind: 'motor', od: 172, id: 60, length: 9 },
      { kind: 'dc', od: 178, id: 71.4, length: 75 },
      { kind: 'hw', od: 127, id: 76.2, length: 150 },
      { kind: 'dp', od: 127, id: 108.6 },
    ],
  },
  // Глубокая скважина с хвостовиком и комбинированной (ступенчатой) колонной труб.
  liner: {
    casings: [
      { type: 'conductor', od: 426, wall: 10, top: 0, shoe: 50 },
      { type: 'surface', od: 323.9, wall: 9.5, top: 0, shoe: 600 },
      { type: 'intermediate', od: 244.5, wall: 10, top: 0, shoe: 2000 },
      { type: 'liner', od: 177.8, wall: 9.2, top: 1900, shoe: 3200 },
    ],
    bit: 155.6, depth: 3600, k: 1, onBottom: true, bitDepth: 3550,
    string: [
      { kind: 'motor', od: 120, id: 40, length: 6 },
      { kind: 'dc', od: 120.6, id: 57.2, length: 50 },
      { kind: 'hw', od: 88.9, id: 52.4, length: 120 },
      { kind: 'dp', od: 88.9, id: 70.2, length: 1800 },
      { kind: 'dp', od: 101.6, id: 84.8 },
    ],
  },
};

let lastVolumes = null;
let uidSeq = 0;
const nextUid = () => `u${++uidSeq}`;
const n2s = (v) => (v === '' || v === undefined || v === null || Number.isNaN(v) ? '' : String(v).replace('.', ','));
const mm = (v) => num(v, 1);
const wallsFor = (od) => (CASING_SIZES.find(([d]) => d === od) || [0, []])[1];
const kText = (k) => fmt(k, Math.round(k * 10) === k * 10 ? 1 : 2);

function presetIndex(kind, od, id) {
  return STRING_KINDS[kind].presets.findIndex(([o, i]) => Math.abs(o - od) < 1e-6 && Math.abs(i - id) < 1e-6);
}
function sectionName(s) {
  const K = STRING_KINDS[s.kind];
  const i = presetIndex(s.kind, s.od, s.id);
  return i >= 0 ? K.presets[i][2] : `${K.name === 'Бурильные трубы' ? 'БТ' : K.name} ${mm(s.od)}×${mm(s.id)}`;
}

/** Строки, которые не удаляются в данный момент (удаляемая строка ещё видна, пока сворачивается). */
const liveRows = (id) => [...$(id).querySelectorAll('.vrow:not([data-removing])')];

/* ----- строки ввода ----- */

function casingRow(c) {
  const row = document.createElement('div');
  row.className = 'vrow';
  row.dataset.uid = nextUid();
  const known = CASING_SIZES.some(([od]) => od === c.od);
  const liner = c.type === 'liner';
  row.innerHTML = `<div class="vrow-in casing-grid">
    <label class="rf rf-type"><span class="rf-l">Колонна</span>
      <select data-k="type">${CASING_ORDER.map((k) => `<option value="${k}"${k === c.type ? ' selected' : ''}${CASING_TYPES[k].title ? ` title="${CASING_TYPES[k].title}"` : ''}>${CASING_TYPES[k].name}</option>`).join('')}</select></label>
    <div class="rf rf-od"><span class="rf-l">D<sub>н</sub>, мм</span>
      <select data-k="odSel" aria-label="Наружный диаметр колонны, мм">${CASING_SIZES.map(([od]) => `<option value="${od}"${od === c.od ? ' selected' : ''}>${mm(od)}</option>`).join('')}<option value="custom"${known ? '' : ' selected'}>другой…</option></select>
      <input data-k="od" inputmode="decimal" autocomplete="off" aria-label="Свой наружный диаметр, мм" placeholder="Dн, мм" value="${n2s(c.od)}"${known ? ' hidden' : ''}></div>
    <label class="rf rf-wall"><span class="rf-l">Стенка, мм</span><input data-k="wall" inputmode="decimal" autocomplete="off" value="${n2s(c.wall)}"></label>
    <div class="rf rf-idv"><span class="rf-l">D<sub>вн</sub>, мм</span><output data-k="idv" aria-label="Внутренний диаметр, мм">—</output></div>
    <label class="rf rf-top"><span class="rf-l">Голова, м</span><input data-k="top" inputmode="decimal" autocomplete="off" value="${liner ? n2s(c.top) : '0'}"${liner ? '' : ' disabled'}></label>
    <label class="rf rf-shoe"><span class="rf-l">Башмак, м</span><input data-k="shoe" inputmode="decimal" autocomplete="off" value="${n2s(c.shoe)}"></label>
    <button type="button" class="icon-btn" data-remove aria-label="Удалить колонну">×</button>
  </div>`;
  return row;
}

function presetOptions(kind, od, id) {
  const sel = presetIndex(kind, od, id);
  // В списке — без повторения типа элемента («178×71,4» вместо «УБТ 178×71,4»), ЛБТ подписаны.
  const short = (name, od, id) => (kind === 'hw' || kind === 'motor' ? `${mm(od)}×${mm(id)}` : name.replace(/^(УБТ|СБТ) /, ''));
  return `${STRING_KINDS[kind].presets.map(([od, id, name], i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${short(name, od, id)}</option>`).join('')}
    <option value="custom"${sel < 0 ? ' selected' : ''}>свой размер</option>`;
}

function sectionRow(s) {
  const row = document.createElement('div');
  row.className = 'vrow';
  row.dataset.uid = nextUid();
  row.innerHTML = `<div class="vrow-in string-grid">
    <label class="rf rf-kind"><span class="rf-l">Элемент</span>
      <select data-k="kind">${Object.entries(STRING_KINDS).map(([k, K]) => `<option value="${k}"${k === s.kind ? ' selected' : ''}>${K.full}</option>`).join('')}</select></label>
    <label class="rf rf-preset"><span class="rf-l">Типоразмер</span><select data-k="preset">${presetOptions(s.kind, s.od, s.id)}</select></label>
    <label class="rf rf-sod"><span class="rf-l">D<sub>н</sub>, мм</span><input data-k="od" inputmode="decimal" autocomplete="off" value="${n2s(s.od)}"></label>
    <label class="rf rf-sid"><span class="rf-l">d<sub>вн</sub>, мм</span><input data-k="id" inputmode="decimal" autocomplete="off" value="${n2s(s.id)}"></label>
    <label class="rf rf-len"><span class="rf-l">L, м</span><input data-k="length" inputmode="decimal" autocomplete="off" value="${n2s(s.length)}"></label>
    <button type="button" class="icon-btn" data-remove aria-label="Удалить секцию">×</button>
  </div>`;
  return row;
}

/** Плавное появление/сворачивание строки (высота + прозрачность). */
function animateRow(row, dir) {
  if (REDUCED.matches || !row.animate) {
    if (dir === 'out') row.remove();
    return;
  }
  const open = { height: `${row.offsetHeight}px`, paddingBottom: '8px', opacity: 1, transform: 'none' };
  const shut = { height: '0px', paddingBottom: '0px', opacity: 0, transform: 'translateY(-6px)' };
  row.classList.add('clip');
  const anim = row.animate(dir === 'in' ? [shut, open] : [open, shut],
    { duration: dir === 'in' ? 360 : 280, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
  const done = () => {
    clearTimeout(row._fallback);
    if (dir === 'out') { row.remove(); return; }
    row.classList.remove('clip');
    anim.cancel();
  };
  anim.onfinish = done;
  // Если кадры не идут (вкладка в фоне), строка всё равно удаляется/раскрывается.
  row._fallback = setTimeout(() => { if (anim.playState !== 'finished') { anim.cancel(); done(); } }, 600);
}

function setBit(d) {
  const known = BIT_SIZES.includes(d);
  $('vol-bit').value = known ? String(d) : 'custom';
  $('vol-bit-custom').value = n2s(d);
}

function applyPreset(name) {
  const p = VOL_PRESETS[name];
  const cas = $('casing-rows');
  const str = $('string-rows');
  cas.innerHTML = '';
  str.innerHTML = '';
  p.casings.forEach((c) => cas.appendChild(casingRow(c)));
  p.string.forEach((s) => str.appendChild(sectionRow(s)));
  setBit(p.bit);
  $('vol-depth').value = n2s(p.depth);
  $('vol-k').value = kText(p.k);
  $('vol-onbottom').checked = p.onBottom;
  $('vol-bitdepth').value = n2s(p.bitDepth);
  ['vol-bit-custom', 'vol-depth', 'vol-k', 'vol-bitdepth'].forEach((id) => setError($(id), ''));
}

/** SI-модель скважины для formulas.js из данных в мм / м. */
function toWell(d) {
  return {
    casings: d.casings.map((c) => ({ od: c.od / 1000, id: c.id / 1000, top: c.top, shoe: c.shoe })),
    hole: { D: d.bit / 1000, depth: d.depth, k: d.k },
    bitDepth: d.bitDepth,
    string: d.string.map((s) => ({ od: s.od / 1000, id: s.id / 1000, length: s.length })),
  };
}

function presetData(name) {
  const p = VOL_PRESETS[name];
  return {
    casings: p.casings.map((c) => ({ ...c, id: c.od - 2 * c.wall })),
    bit: p.bit, depth: p.depth, k: p.k,
    bitDepth: p.onBottom ? p.depth : p.bitDepth,
    string: p.string,
  };
}

/* ----- синхронизация зависимых полей ----- */

function syncVolumeUi() {
  const custom = $('vol-bit').value === 'custom';
  $('vol-bit-custom').closest('.custom-size').hidden = !custom;
  const onBottom = $('vol-onbottom').checked;
  document.querySelector('.bit-depth-field').hidden = onBottom;

  liveRows('casing-rows').forEach((row) => {
    const g = (k) => row.querySelector(`[data-k="${k}"]`);
    const od = parseNum(g('od').value);
    const wall = parseNum(g('wall').value);
    const idv = od - 2 * wall;
    g('idv').textContent = Number.isFinite(idv) && idv > 0 ? mm(idv) : '—';
    const walls = wallsFor(od);
    g('wall').title = walls.length ? `Типичные толщины для ${mm(od)} мм: ${walls.slice().sort((a, b) => a - b).map((w) => mm(w)).join('; ')}` : '';
  });

  const rows = liveRows('string-rows');
  rows.forEach((row, i) => {
    const len = row.querySelector('[data-k="length"]');
    const top = i === rows.length - 1;
    if (len.readOnly !== top) {
      len.readOnly = top;
      len.classList.toggle('computed', top);
      len.setAttribute('aria-label', top ? 'Длина верхней секции до устья, м (вычисляется)' : 'Длина секции, м');
      len.title = top ? 'Вычисляется: глубина долота минус длина остальных секций' : '';
      if (top) len.classList.remove('invalid');
    }
    row.querySelector('[data-remove]').disabled = rows.length === 1;
  });
}

/* ----- чтение и проверка ----- */

function numIn(el, min, max) {
  const v = parseNum(el.value);
  const bad = el.value.trim() === '' || Number.isNaN(v) || v < min || v > max;
  el.classList.toggle('invalid', bad);
  el.setAttribute('aria-invalid', String(bad));
  return bad ? null : v;
}
function flag(...els) {
  els.forEach((el) => { el.classList.add('invalid'); el.setAttribute('aria-invalid', 'true'); });
}

function readBit() {
  if ($('vol-bit').value !== 'custom') {
    setError($('vol-bit-custom'), '');
    return Number($('vol-bit').value);
  }
  return read('vol-bit-custom');
}

/** Читает обе карточки, проверяет геометрию. Возвращает { d, well, res } или null. */
function readVolumes() {
  const cErr = [];
  const sErr = [];

  // Обсадные колонны
  const casingRows = liveRows('casing-rows');
  const casings = casingRows.map((row, i) => {
    const g = (k) => row.querySelector(`[data-k="${k}"]`);
    const type = g('type').value;
    const name = `${i + 1}. ${CASING_TYPES[type].short}`;
    g('type').classList.remove('invalid');
    g('odSel').classList.remove('invalid');
    const liner = type === 'liner';
    const od = numIn(g('od'), 50, 1000);
    const wall = numIn(g('wall'), 2, 50);
    const top = liner ? numIn(g('top'), 0, 15000) : 0;
    const shoe = numIn(g('shoe'), 1, 15000);
    if ([od, wall, top, shoe].includes(null)) {
      cErr.push(`${name}: проверьте числа — D<sub>н</sub> 50…1000 мм, стенка 2…50 мм, глубины до 15 000 м.`);
      return null;
    }
    if (2 * wall >= od * 0.8) {
      flag(g('wall'));
      cErr.push(`${name}: стенка ${mm(wall)} мм слишком толстая для D<sub>н</sub> ${mm(od)} мм.`);
      return null;
    }
    if (liner && top >= shoe) {
      flag(g('top'));
      cErr.push(`${name}: голова (${num(top)} м) должна быть выше башмака (${num(shoe)} м).`);
      return null;
    }
    return { uid: row.dataset.uid, type, name, od, wall, id: od - 2 * wall, top, shoe, row };
  });
  const casingsOk = !casings.includes(null);
  if (casingsOk) {
    casings.forEach((c, i) => {
      const g = (k) => c.row.querySelector(`[data-k="${k}"]`);
      const p = casings[i - 1];
      if (!p) {
        if (c.type === 'liner') {
          flag(g('type'));
          cErr.push(`${c.name}: хвостовик не может быть первой колонной — его подвешивают в предыдущей.`);
        }
        return;
      }
      if (c.shoe <= p.shoe) {
        flag(g('shoe'));
        cErr.push(`${c.name}: башмак (${num(c.shoe)} м) должен быть глубже башмака предыдущей колонны (${num(p.shoe)} м).`);
      }
      if (c.od >= p.id) {
        flag(g('od'), g('odSel'));
        cErr.push(`${c.name}: D<sub>н</sub> ${mm(c.od)} мм не проходит в предыдущую колонну (D<sub>вн</sub> ${mm(p.id)} мм).`);
      }
      if (c.type === 'liner' && (c.top >= p.shoe || c.top < p.top)) {
        flag(g('top'));
        cErr.push(`${c.name}: голова (${num(c.top)} м) должна быть внутри предыдущей колонны — в интервале ${num(p.top)}–${num(p.shoe)} м.`);
      }
    });
  }

  // Открытый ствол
  const bit = readBit();
  const depth = read('vol-depth');
  const k = read('vol-k');
  const last = casingsOk && casings.length ? casings[casings.length - 1] : null;
  if (last && bit !== null && bit >= last.id) {
    flag($('vol-bit'), $('vol-bit-custom'));
    cErr.push(`Долото ${mm(bit)} мм не проходит в последнюю колонну — ${CASING_TYPES[last.type].short.toLowerCase()} (D<sub>вн</sub> ${mm(last.id)} мм).`);
  } else {
    $('vol-bit').classList.remove('invalid');
  }
  let depthOk = depth !== null;
  if (last && depthOk && depth < last.shoe) {
    setError($('vol-depth'), `Забой не может быть выше башмака последней колонны (${num(last.shoe)} м)`);
    depthOk = false;
  }

  // Бурильная колонна
  const onBottom = $('vol-onbottom').checked;
  let bitDepth = depthOk ? depth : null;
  if (!onBottom) {
    bitDepth = read('vol-bitdepth');
    if (bitDepth !== null && depthOk && bitDepth > depth) {
      setError($('vol-bitdepth'), `Не глубже забоя (${num(depth)} м)`);
      bitDepth = null;
    }
  } else {
    setError($('vol-bitdepth'), '');
  }

  const sRows = liveRows('string-rows');
  const string = sRows.map((row, i) => {
    const g = (k2) => row.querySelector(`[data-k="${k2}"]`);
    const kind = g('kind').value;
    const top = i === sRows.length - 1;
    const od = numIn(g('od'), 20, 600);
    const id = numIn(g('id'), 0, 600);
    const length = top ? 0 : numIn(g('length'), 0.1, 15000);
    const label = `${i + 1}. ${STRING_KINDS[kind].name}`;
    if ([od, id, length].includes(null)) {
      sErr.push(`${label}: проверьте числа — D<sub>н</sub> 20…600 мм, d<sub>вн</sub> от 0, длина от 0,1 м.`);
      return null;
    }
    if (id >= od) {
      flag(g('id'));
      sErr.push(`${label}: d<sub>вн</sub> (${mm(id)} мм) должен быть меньше D<sub>н</sub> (${mm(od)} мм).`);
      return null;
    }
    return { uid: row.dataset.uid, kind, od, id, length: top ? null : length, row };
  });

  // Длина верхней секции — до устья.
  const topLen = sRows.length ? sRows[sRows.length - 1].querySelector('[data-k="length"]') : null;
  const bhaLen = string.slice(0, -1).reduce((s, x) => (s === null || x === null ? null : s + x.length), 0);
  if (topLen) {
    const L = bitDepth !== null && bhaLen !== null ? bitDepth - bhaLen : null;
    topLen.value = L === null ? '' : num(L, 2);
    topLen.classList.toggle('invalid', L !== null && L <= 0);
  }
  if (bitDepth !== null && bhaLen !== null && sRows.length && bhaLen >= bitDepth) {
    sErr.push(`Секции ниже верхней занимают ${num(bhaLen, 2)} м — это не меньше глубины долота (${num(bitDepth)} м): верхней секции не остаётся длины.`);
  }

  const ok = casingsOk && !cErr.length && !sErr.length && bit !== null && depthOk && k !== null
    && bitDepth !== null && !string.includes(null) && string.length > 0;

  let result = null;
  if (ok) {
    const d = {
      casings: casings.map(({ row, ...c }) => c),
      bit, depth, k, bitDepth, onBottom,
      string: string.map(({ row, ...s }) => s),
    };
    const well = toWell(d);
    const res = F.wellSectionVolumes(well);
    // Каждая секция должна помещаться в то, что снаружи (колонну или номинальный ствол).
    const seen = new Set();
    res.segments.forEach((g) => {
      if (g.section < 0 || g.od < g.D - 1e-9) return;
      const s = d.string[g.section];
      const key = `${g.section}|${g.casing}`;
      if (seen.has(key)) return;
      seen.add(key);
      flag(string[g.section].row.querySelector('[data-k="od"]'));
      const outer = g.casing < 0
        ? `открытый ствол ${mm(bit)} мм`
        : `${CASING_TYPES[d.casings[g.casing].type].short.toLowerCase()} (D<sub>вн</sub> ${mm(d.casings[g.casing].id)} мм)`;
      sErr.push(`${sectionName(s)} (D<sub>н</sub> ${mm(s.od)} мм) не помещается: снаружи ${outer} на ${num(g.top)}–${num(g.bottom)} м.`);
    });
    if (!sErr.length) result = { d, well, res };
  }

  setHTML($('casing-error'), cErr.join('<br>'));
  setHTML($('string-error'), sErr.join('<br>'));
  return result;
}

/* ----- расчёт и вывод ----- */

function calcVolumes() {
  syncVolumeUi();
  const bitNow = readBitQuiet();
  $('bit-text').textContent = bitNow ? `Долото ${mm(bitNow)} мм` : 'Долото';
  const r = readVolumes();
  if (!r) {
    lastVolumes = null;
    if (well.svg) $('well-svg').classList.add('is-stale');
    return renderResults('volumes', null);
  }
  const { d, res } = r;
  lastVolumes = res;
  const below = res.belowBit > 0;

  const items = [
    { label: 'Раствор в скважине с инструментом', value: fmt(res.total, 2), unit: ' м³', primary: true,
      sub: `V<sub>тр</sub> + V<sub>кп</sub> + V<sub>под</sub> · забой ${num(d.depth)} м, долото ${d.onBottom ? 'на забое' : `на ${num(d.bitDepth)} м`}` },
    { label: 'Внутри колонны V<sub>тр</sub>', value: fmt(res.pipe, 2), unit: ' м³', sub: 'от устья до долота' },
    { label: 'Кольцевое пространство V<sub>кп</sub>', value: fmt(res.annulus, 2), unit: ' м³', sub: 'от долота до устья' },
    { label: 'Под долотом V<sub>под</sub>', value: fmt(res.belowBit, 2), unit: ' м³',
      sub: below ? `${num(d.depth - d.bitDepth)} м ствола ниже долота` : 'долото на забое' },
    { label: 'Ствол без инструмента V<sub>ств</sub>', value: fmt(res.hole, 2), unit: ' м³',
      sub: `в т. ч. открытый ствол ${fmt(res.openHole, 2)} м³` },
    { label: 'Объём металла V<sub>мет</sub>', value: fmt(res.steel, 2), unit: ' м³',
      sub: 'вытесняется колонной — долив при подъёме' },
  ];

  const outerName = (g) => (g.casing < 0
    ? `ствол ${mm(g.D * 1000)}${d.k !== 1 ? ` · k<sub>к</sub> ${kText(d.k)}` : ''}`
    : `${CASING_TYPES[d.casings[g.casing].type].short} <span class="muted">${mm(g.D * 1000)}</span>`);
  const rowsHtml = res.segments.map((g) => {
    const bb = g.section < 0;
    return `<tr${bb ? ' class="below"' : ''}>
      <td>${num(g.top)}–${num(g.bottom)}</td>
      <td>${outerName(g)}</td>
      <td>${bb ? 'под долотом' : sectionName(d.string[g.section])}</td>
      <td>${fmt((bb ? g.holeArea : g.annulusArea) * 1000, 2)}</td>
      <td>${bb ? '—' : fmt(g.pipe, 2)}</td>
      <td>${fmt(bb ? g.belowBit : g.annulus, 2)}</td>
    </tr>`;
  }).join('');
  const extra = `
    <div class="table-scroll"><table class="breakdown">
      <thead><tr><th>Интервал, м</th><th>Снаружи (D, мм)</th><th>Внутри</th><th title="Удельный объём кольцевого пространства">КП, л/м</th><th>V<sub>тр</sub>, м³</th><th>V<sub>кп</sub>, м³</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot><tr><td colspan="4">Итого</td><td>${fmt(res.pipe, 2)}</td><td>${fmt(res.annulus, 2)}${below ? ` + ${fmt(res.belowBit, 2)}` : ''}</td></tr></tfoot>
    </table></div>
    <p class="hint">Снаружи — D<sub>вн</sub> самой внутренней колонны или диаметр долота в открытом стволе.
      ${below ? 'Строки «под долотом» — полное сечение ствола, их объём входит в V<sub>под</sub>, а не в V<sub>кп</sub>.' : ''}</p>`;

  const g0 = res.segments[0];
  const hasLiner = d.casings.some((c) => c.type === 'liner');
  renderResults('volumes', {
    items,
    extra,
    formula: [
      `Интервалы: устье, ${hasLiner ? 'голова хвостовика, ' : ''}башмаки, стыки секций колонны, долото, забой — всего ${res.segments.length}`,
      `<i>S</i><sub>ств</sub> = π·<i>D</i><sub>вн</sub>²/4 в колонне; &nbsp; <i>S</i><sub>ств</sub> = <i>k</i><sub>к</sub>·π·<i>D</i><sub>д</sub>²/4 в открытом стволе`,
      `<i>V</i><sub>тр</sub> = Σ π·<i>d</i><sub>вн</sub>²/4 · <i>L</i> = <b>${fmt(res.pipe, 2)} м³</b>`,
      `<i>V</i><sub>кп</sub> = Σ (<i>S</i><sub>ств</sub> − π·<i>d</i><sub>н</sub>²/4) · <i>L</i> = <b>${fmt(res.annulus, 2)} м³</b>`,
      `${num(g0.top)}–${num(g0.bottom)} м: (${g0.outer === 'open' && d.k !== 1 ? `${kText(d.k)}·` : ''}π·${num(g0.D, 4)}²/4 − π·${num(g0.od, 4)}²/4) · ${num(g0.length)} = ${fmt(g0.annulus, 3)} м³`,
      below
        ? `<i>V</i><sub>под</sub> = <i>S</i><sub>ств</sub> · (<i>H</i><sub>заб</sub> − <i>H</i><sub>д</sub>) = <b>${fmt(res.belowBit, 2)} м³</b> (${num(d.depth - d.bitDepth)} м)`
        : `<i>V</i><sub>под</sub> = 0 — долото на забое`,
      `<i>V</i> = <i>V</i><sub>тр</sub> + <i>V</i><sub>кп</sub> + <i>V</i><sub>под</sub> = ${fmt(res.pipe, 2)} + ${fmt(res.annulus, 2)} + ${fmt(res.belowBit, 2)} = <b>${fmt(res.total, 2)} м³</b>`,
      `Проверка: <i>V</i><sub>ств</sub> = <i>V</i> + <i>V</i><sub>мет</sub> = ${fmt(res.total, 2)} + ${fmt(res.steel, 2)} = ${fmt(res.hole, 2)} м³`,
    ],
    notes: `<p>Колонна, перекрытая следующей (например, направление внутри кондуктора не видно — раствор внутри
      самой внутренней колонны), на объём не влияет. Хвостовик перекрывает интервал от головы до башмака; выше
      головы снаружи бурильной колонны — предыдущая колонна.</p>
      <p>k<sub>к</sub> умножает площадь сечения открытого ствола (k<sub>к</sub> = V<sub>факт</sub>/V<sub>ном</sub>);
      в обсадных колоннах не применяется. V<sub>под</sub> не входит в V<sub>кп</sub>: время выхода забойной пачки
      отсчитывается от долота. ВЗД — условно как труба с проходным каналом d<sub>вн</sub>; замки и высадки не учитываются.</p>`,
    copy: plain('Объёмы скважины', items),
  });
  drawWell(d, res);
}

function readBitQuiet() {
  const v = $('vol-bit').value === 'custom' ? parseNum($('vol-bit-custom').value) : Number($('vol-bit').value);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/* ----- обработчики строк ----- */

function initVolumes() {
  $('vol-bit').innerHTML = `${BIT_SIZES.map((b) => `<option value="${b}">${mm(b)}</option>`).join('')}<option value="custom">другой…</option>`;

  const casRows = $('casing-rows');
  const strRows = $('string-rows');

  casRows.addEventListener('change', (e) => {
    const row = e.target.closest('.vrow');
    const g = (k) => row.querySelector(`[data-k="${k}"]`);
    const k = e.target.dataset.k;
    if (k === 'odSel') {
      const custom = e.target.value === 'custom';
      g('od').hidden = !custom;
      if (custom) {
        g('od').focus();
      } else {
        const od = Number(e.target.value);
        g('od').value = n2s(od);
        g('wall').value = n2s(wallsFor(od)[0]);
      }
    }
    if (k === 'type') {
      const liner = e.target.value === 'liner';
      const top = g('top');
      if (liner && top.disabled) {
        const prev = row.previousElementSibling;
        const prevShoe = prev ? parseNum(prev.querySelector('[data-k="shoe"]').value) : NaN;
        top.value = n2s(Number.isFinite(prevShoe) ? Math.max(0, prevShoe - 100) : 0);
      }
      if (!liner) top.value = '0';
      top.disabled = !liner;
    }
  });

  strRows.addEventListener('change', (e) => {
    const row = e.target.closest('.vrow');
    const g = (k) => row.querySelector(`[data-k="${k}"]`);
    const k = e.target.dataset.k;
    if (k === 'kind') {
      // Новый тип элемента: ближайший по наружному диаметру типоразмер.
      const od = parseNum(g('od').value);
      const list = STRING_KINDS[e.target.value].presets;
      const best = list.reduce((b, p) => (Math.abs(p[0] - od) < Math.abs(b[0] - od) ? p : b), list[0]);
      g('od').value = n2s(best[0]);
      g('id').value = n2s(best[1]);
      g('preset').innerHTML = presetOptions(e.target.value, best[0], best[1]);
    }
    if (k === 'preset' && e.target.value !== 'custom') {
      const p = STRING_KINDS[g('kind').value].presets[Number(e.target.value)];
      g('od').value = n2s(p[0]);
      g('id').value = n2s(p[1]);
    }
  });
  strRows.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (k !== 'od' && k !== 'id') return;
    const row = e.target.closest('.vrow');
    const g = (k2) => row.querySelector(`[data-k="${k2}"]`);
    const i = presetIndex(g('kind').value, parseNum(g('od').value), parseNum(g('id').value));
    g('preset').value = i >= 0 ? String(i) : 'custom';
  });

  const onRemove = (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    const row = btn.closest('.vrow');
    if (row.dataset.removing) return;
    row.dataset.removing = '1';
    row.querySelectorAll('input, select, button').forEach((el) => { el.disabled = true; });
    calcVolumes();
    animateRow(row, 'out');
  };
  casRows.addEventListener('click', onRemove);
  strRows.addEventListener('click', onRemove);

  $('add-casing').addEventListener('click', () => {
    const rows = liveRows('casing-rows');
    const lastRow = rows[rows.length - 1];
    const val = (row, k) => parseNum(row.querySelector(`[data-k="${k}"]`).value);
    let c;
    if (!lastRow) {
      c = { type: 'conductor', od: 323.9, wall: 9.5, top: 0, shoe: 50 };
    } else {
      const prevType = lastRow.querySelector('[data-k="type"]').value;
      const prevId = val(lastRow, 'od') - 2 * val(lastRow, 'wall');
      const prevShoe = val(lastRow, 'shoe');
      const depth = parseNum($('vol-depth').value);
      // Следующий по порядку тип и самый большой стандартный Dн, проходящий в предыдущую колонну с зазором.
      const nextType = { shaft: 'conductor', conductor: 'surface', surface: 'intermediate', intermediate: 'production' }[prevType] || 'production';
      const fit = CASING_SIZES.filter(([od]) => od < prevId - 12).pop() || CASING_SIZES[0];
      const room = Number.isFinite(depth) && depth - prevShoe > 20;
      const shoe = room ? Math.round((prevShoe + (depth - prevShoe) / 2) / 10) * 10 : (prevShoe || 0) + 100;
      c = { type: nextType, od: fit[0], wall: fit[1][0], top: 0, shoe };
      // Бурение продолжается долотом, которое проходит в новую колонну.
      const id = fit[0] - 2 * fit[1][0];
      const bit = readBitQuiet();
      if (bit && bit >= id) {
        const nb = BIT_SIZES.filter((b) => b < id - 3).pop();
        if (nb) setBit(nb);
      }
    }
    const row = casingRow(c);
    casRows.appendChild(row);
    animateRow(row, 'in');
    calcVolumes();
  });

  $('add-section').addEventListener('click', () => {
    const rows = liveRows('string-rows');
    const top = rows[rows.length - 1];
    const below = rows[rows.length - 2];
    const val = (row, k) => row.querySelector(`[data-k="${k}"]`).value;
    const s = below
      ? { kind: val(below, 'kind'), od: parseNum(val(below, 'od')), id: parseNum(val(below, 'id')), length: 25 }
      : { kind: 'dc', od: 178, id: 71.4, length: 25 };
    const row = sectionRow(s);
    strRows.insertBefore(row, top || null);
    animateRow(row, 'in');
    calcVolumes();
  });

  document.querySelector('[data-preset="liner"]').addEventListener('click', () => {
    applyPreset('liner');
    calcVolumes();
  });
}

/* ---------- Схема скважины (SVG) ----------
   По вертикали — глубина: интервалы между характерными глубинами (башмаки, голова хвостовика,
   стыки секций, долото, забой) не бывают короче MIN_SEG px — короткие растягиваются, длинные
   сжимаются пропорционально, все отметки подписаны. По горизонтали — диаметры в своём масштабе.
   Модель сцены (числа в px) плавно интерполируется между состояниями; при первом показе
   скважина «пробуривается» сверху вниз. */
const SVGNS = 'http://www.w3.org/2000/svg';
const WG = { W: 360, H: 540, top: 40, bottom: 20, axisX: 48, cx: 124, RMAX: 58, MIN_SEG: 18 };
WG.labelX = WG.cx + WG.RMAX + 22;
const well = { svg: null, cache: new Map(), used: new Set(), sig: '', cur: null, target: null, reveal: 0, shown: false, raf: 0 };

function svgEl(tag, attrs = {}, parent = null) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}

const r2 = (v) => Math.round(v * 100) / 100;
function setA(el, attrs) {
  for (const k in attrs) {
    const v = typeof attrs[k] === 'number' ? r2(attrs[k]) : attrs[k];
    if (el[`_${k}`] !== v) { el.setAttribute(k, v); el[`_${k}`] = v; }
  }
  return el;
}
function setOpacity(el, on) {
  const v = on ? '1' : '0';
  if (el.style.opacity !== v) el.style.opacity = v;
}

/** Элемент сцены по ключу: создаётся один раз, лишние скрываются после отрисовки кадра. */
function E(key, tag, cls, layer) {
  let el = well.cache.get(key);
  if (!el) {
    el = svgEl(tag, cls ? { class: cls } : {}, layer);
    well.cache.set(key, el);
  }
  well.used.add(key);
  return el;
}

function ensureWellSvg() {
  if (well.svg) return;
  const { W, H, top, cx } = WG;
  $('well-svg').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Схема конструкции скважины и компоновки">
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
        <pattern id="wg-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" class="wg-hatch-bg"/><line x1="0" y1="0" x2="0" y2="5" class="wg-hatch-line"/>
        </pattern>
        <clipPath id="wg-reveal"><rect x="0" y="0" width="${W}" height="0"/></clipPath>
        <clipPath id="wg-ann"></clipPath>
        <clipPath id="wg-bore"></clipPath>
      </defs>
      <rect x="0" y="${top}" width="${W}" height="${H - top}" fill="url(#wg-rock)"/>
      <line x1="0" y1="${top}" x2="${W}" y2="${top}" class="w-ground"/>
      <g class="L-axis"><line class="w-axis"/></g>
      <g clip-path="url(#wg-reveal)">
        <g class="L-hole"></g>
        <g class="L-cas"></g>
        <g class="L-str"></g>
        <g clip-path="url(#wg-ann)"><rect class="w-flow up" x="0" y="${top}" width="${W}" height="${H - top + 52}" fill="url(#wg-flow-pat)"/></g>
        <g clip-path="url(#wg-bore)"><rect class="w-flow down" x="0" y="${top - 52}" width="${W}" height="${H - top + 52}" fill="url(#wg-flow-pat)"/></g>
        <g class="L-marks"></g>
      </g>
      <path class="w-bit"/>
      <g class="L-labels"></g>
      <text x="${cx}" y="${top - 12}" text-anchor="middle" class="w-label muted">устье</text>
    </svg>
    <div class="legend"></div>
    <p class="hint" id="well-hint"></p>`;
  const svg = $('well-svg').querySelector('svg');
  well.svg = svg;
  well.L = {
    axis: svg.querySelector('.L-axis'),
    hole: svg.querySelector('.L-hole'),
    cas: svg.querySelector('.L-cas'),
    str: svg.querySelector('.L-str'),
    marks: svg.querySelector('.L-marks'),
    labels: svg.querySelector('.L-labels'),
    ann: svg.querySelector('#wg-ann'),
    bore: svg.querySelector('#wg-bore'),
  };
  well.axisLine = svg.querySelector('.w-axis');
  well.revealRect = svg.querySelector('#wg-reveal rect');
  well.bit = svg.querySelector('.w-bit');
  well.legend = $('well-svg').querySelector('.legend');
  well.hint = $('well-hint');
}

/** Кусочно-линейная шкала глубин: каждый интервал между отметками не короче MIN_SEG px. */
function depthScale(keys) {
  const Ht = WG.H - WG.top - WG.bottom;
  const L = keys.slice(1).map((d, i) => d - keys[i]);
  let fixed = L.map(() => false);
  let s = 0;
  for (let it = 0; it < 20; it += 1) {
    const nFixed = fixed.filter(Boolean).length;
    const free = L.reduce((a, l, i) => a + (fixed[i] ? 0 : l), 0);
    s = free > 0 ? (Ht - WG.MIN_SEG * nFixed) / free : 0;
    const next = L.map((l, i) => fixed[i] || l * s < WG.MIN_SEG);
    if (next.every((v, i) => v === fixed[i])) break;
    fixed = next;
  }
  let px = L.map((l, i) => (fixed[i] ? WG.MIN_SEG : l * s));
  if (!(s > 0) || px.reduce((a, b) => a + b, 0) > Ht + 0.5) px = L.map(() => Ht / Math.max(1, L.length));
  const ys = [WG.top];
  px.forEach((p) => ys.push(ys[ys.length - 1] + p));
  const y = (d) => {
    if (d <= keys[0]) return ys[0];
    for (let i = 0; i < L.length; i += 1) {
      if (d <= keys[i + 1]) return ys[i] + (L[i] ? ((d - keys[i]) / L[i]) * px[i] : 0);
    }
    return ys[ys.length - 1];
  };
  return { y, compressed: fixed.some(Boolean) };
}

/** Модель сцены в px по исходным данным (мм, м) и раскладке колонны. */
function wellScene(d, res) {
  const { cx } = WG;
  const keySet = new Set([0, d.depth, d.bitDepth]);
  d.casings.forEach((c) => { keySet.add(c.top); keySet.add(c.shoe); });
  res.string.forEach((s) => { keySet.add(s.top); keySet.add(s.bottom); });
  const sc = depthScale([...keySet].filter((v) => v >= 0 && v <= d.depth).sort((a, b) => a - b));
  const maxD = Math.max(d.bit * Math.sqrt(d.k), ...d.casings.map((c) => c.od * 1.2));
  const R = (v) => (v / 2) * (WG.RMAX / (maxD / 2));

  const cas = d.casings.map((c, i) => {
    const p = d.casings[i - 1];
    return {
      key: c.uid, type: c.type,
      y0: sc.y(c.top), y1: sc.y(c.shoe), ro: R(c.od), ri: R(c.id), rh: R(c.od * 1.2),
      pri: p ? R(p.id) : 0, py1: p ? sc.y(p.shoe) : sc.y(c.top),
    };
  });
  const lastShoe = Math.max(0, ...d.casings.map((c) => c.shoe));
  const hole = { y0: sc.y(lastShoe), y1: sc.y(d.depth), r: R(d.bit), rk: R(d.bit * Math.sqrt(d.k)) };
  const str = res.string.map((s, i) => ({
    key: d.string[i].uid, kind: d.string[i].kind,
    y0: sc.y(s.top), y1: sc.y(s.bottom), ro: R(d.string[i].od), ri: R(d.string[i].id),
  }));
  const bit = { y: sc.y(d.bitDepth), r: R(d.bit) };

  // Отметки глубин на оси.
  const ticks = [{ key: 't0', y: WG.top, text: '0' }];
  const seen = new Set([0]);
  const addTick = (key, depth) => {
    if (seen.has(depth)) return;
    seen.add(depth);
    ticks.push({ key, y: sc.y(depth), text: num(depth) });
  };
  d.casings.forEach((c) => { if (c.top > 0) addTick(`th${c.uid}`, c.top); addTick(`ts${c.uid}`, c.shoe); });
  addTick('tb', d.bitDepth);
  addTick('td', d.depth);

  // Выноски справа.
  const callouts = d.casings.map((c, i) => ({
    key: `c${c.uid}`, ax: cx + cas[i].ro + 3, ay: cas[i].y1,
    l1: `${CASING_TYPES[c.type].short} ${mm(c.od)} мм`, l2: `${num(c.top)}–${num(c.shoe)} м`,
  }));
  if (d.depth > lastShoe) {
    callouts.push({
      key: 'hole', ax: cx + hole.rk + 2, ay: (hole.y0 + hole.y1) / 2,
      l1: `Открытый ствол ${mm(d.bit)} мм`,
      l2: `${num(lastShoe)}–${num(d.depth)} м${d.k !== 1 ? ` · kк ${kText(d.k)}` : ''}`,
    });
  }
  // КНБК — секции от долота до первых бурильных труб (ВЗД, УБТ, ТБТ).
  let nBha = d.string.findIndex((s) => s.kind === 'dp');
  if (nBha < 0) nBha = d.string.length - 1;
  if (nBha > 0) {
    const topBha = res.string[nBha - 1].top;
    const kinds = [...new Set(d.string.slice(0, nBha).map((s) => STRING_KINDS[s.kind].name))];
    callouts.push({
      key: 'bha', ax: cx + Math.max(...str.slice(0, nBha).map((s) => s.ro)) + 3, ay: (sc.y(topBha) + bit.y) / 2,
      l1: `КНБК ${num(d.bitDepth - topBha, 1)} м`, l2: kinds.join(' · '),
    });
  }
  if (d.bitDepth < d.depth || d.depth <= lastShoe) {
    callouts.push({ key: 'bit', ax: cx + bit.r + 2, ay: bit.y, l1: `Долото ${mm(d.bit)} мм`, l2: `на ${num(d.bitDepth)} м` });
  }
  return { cas, hole, str, bit, ticks, callouts, compressed: sc.compressed };
}

const lerp = (a, b, k) => a + (b - a) * k;
function lerpObj(f, t, k) {
  const o = { ...t };
  for (const key in t) if (typeof t[key] === 'number' && typeof f[key] === 'number') o[key] = lerp(f[key], t[key], k);
  return o;
}
function lerpList(fl, tl, k, born) {
  return tl.map((t) => lerpObj(fl.find((x) => x.key === t.key) || born(t), t, k));
}
function lerpScene(f, t, k) {
  return {
    ...t,
    cas: lerpList(f.cas, t.cas, k, (x) => ({ ...x, y1: x.y0, py1: x.y0 })),
    str: lerpList(f.str, t.str, k, (x) => ({ ...x, ro: 0, ri: 0 })),
    ticks: lerpList(f.ticks, t.ticks, k, (x) => x),
    callouts: lerpList(f.callouts, t.callouts, k, (x) => x),
    hole: lerpObj(f.hole, t.hole, k),
    bit: lerpObj(f.bit, t.bit, k),
  };
}

/** Рисует сцену; reveal — доля «пробуренной» глубины (0…1). */
function paintWell(s, reveal) {
  const { cx, top, axisX, labelX, H, RMAX } = WG;
  const L = well.L;
  well.used = new Set();
  const bottomY = s.hole.y1;
  const revealY = top + (bottomY - top) * reveal;
  setA(well.revealRect, { height: Math.max(0, revealY + 1) });

  // Открытый ствол: каверны (если kк > 1), раствор, стенки.
  const h = s.hole;
  const hh = Math.max(0, h.y1 - h.y0);
  setA(E('hk', 'rect', 'w-mud cav', L.hole), { x: cx - h.rk, y: h.y0, width: 2 * h.rk, height: hh });
  setA(E('hm', 'rect', 'w-mud', L.hole), { x: cx - h.r, y: h.y0, width: 2 * h.r, height: hh });
  setA(E('hwl', 'line', 'w-wall', L.hole), { x1: cx - h.rk, y1: h.y0, x2: cx - h.rk, y2: h.y1 });
  setA(E('hwr', 'line', 'w-wall', L.hole), { x1: cx + h.rk, y1: h.y0, x2: cx + h.rk, y2: h.y1 });

  // Обсадные колонны — от внешней к внутренней: цемент, металл, раствор внутри.
  s.cas.forEach((c) => {
    const k = c.key;
    const aEnd = Math.min(c.py1, c.y1);
    setA(E(`${k}ca`, 'rect', 'w-cement', L.cas), { x: cx - c.pri, y: c.y0, width: 2 * c.pri, height: Math.max(0, aEnd - c.y0) });
    const bStart = Math.max(c.y0, c.py1);
    setA(E(`${k}cb`, 'rect', 'w-cement', L.cas), { x: cx - c.rh, y: bStart, width: 2 * c.rh, height: Math.max(0, c.y1 - bStart) });
    setA(E(`${k}st`, 'rect', 'w-casing', L.cas), { x: cx - c.ro, y: c.y0, width: 2 * c.ro, height: Math.max(0, c.y1 - c.y0) });
    setA(E(`${k}md`, 'rect', 'w-mud', L.cas), { x: cx - c.ri, y: c.y0, width: 2 * c.ri, height: Math.max(0, c.y1 - c.y0) });
    // башмак — треугольники снаружи колонны
    const sy = c.y1;
    setA(E(`${k}shl`, 'path', 'w-shoe', L.marks), { d: `M${r2(cx - c.ro)} ${r2(sy)}H${r2(cx - c.ro - 6)}L${r2(cx - c.ro)} ${r2(sy - 8)}Z` });
    setA(E(`${k}shr`, 'path', 'w-shoe', L.marks), { d: `M${r2(cx + c.ro)} ${r2(sy)}H${r2(cx + c.ro + 6)}L${r2(cx + c.ro)} ${r2(sy - 8)}Z` });
    if (c.type === 'liner') {
      // подвеска хвостовика
      const y = c.y0;
      setA(E(`${k}hgl`, 'path', 'w-hanger', L.marks), { d: `M${r2(cx - c.ro)} ${r2(y + 9)}L${r2(cx - c.pri)} ${r2(y)}V${r2(y + 4)}L${r2(cx - c.ro)} ${r2(y + 13)}Z` });
      setA(E(`${k}hgr`, 'path', 'w-hanger', L.marks), { d: `M${r2(cx + c.ro)} ${r2(y + 9)}L${r2(cx + c.pri)} ${r2(y)}V${r2(y + 4)}L${r2(cx + c.ro)} ${r2(y + 13)}Z` });
    }
  });

  // Бурильная колонна: металл и канал.
  s.str.forEach((t) => {
    const hgt = Math.max(0, t.y1 - t.y0);
    setA(E(`${t.key}so`, 'rect', null, L.str), { class: `w-str ${STRING_KINDS[t.kind].cls}`, x: cx - t.ro, y: t.y0, width: 2 * t.ro, height: hgt });
    setA(E(`${t.key}si`, 'rect', 'w-bore', L.str), { x: cx - t.ri, y: t.y0, width: 2 * t.ri, height: hgt });
    setA(E(`${t.key}bc`, 'rect', null, L.bore), { x: cx - t.ri, y: t.y0, width: 2 * t.ri, height: hgt });
  });

  // Поток вверх по кольцевому пространству (от долота до устья).
  const cuts = new Set([top, s.bit.y]);
  s.cas.forEach((c) => { cuts.add(c.y0); cuts.add(c.y1); });
  s.str.forEach((t) => { cuts.add(t.y0); cuts.add(t.y1); });
  const ys = [...cuts].filter((y) => y >= top && y <= s.bit.y).sort((a, b) => a - b);
  let n = 0;
  for (let i = 0; i + 1 < ys.length; i += 1) {
    const a = ys[i];
    const b = ys[i + 1];
    if (b - a < 0.05) continue;
    const mid = (a + b) / 2;
    let outer = h.r;
    const covering = s.cas.filter((c) => c.y0 <= mid && mid < c.y1);
    if (covering.length) outer = Math.min(...covering.map((c) => c.ri));
    const sec = s.str.find((t) => t.y0 <= mid && mid < t.y1);
    const inner = sec ? sec.ro : 0;
    const w = Math.max(0, outer - inner);
    setA(E(`an${n}l`, 'rect', null, L.ann), { x: cx - outer, y: a, width: w, height: b - a });
    setA(E(`an${n}r`, 'rect', null, L.ann), { x: cx + inner, y: a, width: w, height: b - a });
    n += 1;
  }

  // Долото: на забое «бурения» во время прорисовки, затем на своей глубине.
  const by = Math.min(s.bit.y, revealY);
  const br = s.bit.r;
  well.bit.setAttribute('d', `M${r2(cx - br)} ${r2(by - 9)}H${r2(cx + br)}L${r2(cx + br * 0.72)} ${r2(by - 3)}L${r2(cx + br * 0.28)} ${r2(by)}H${r2(cx - br * 0.28)}L${r2(cx - br * 0.72)} ${r2(by - 3)}Z`);

  // Ось глубин.
  setA(well.axisLine, { x1: axisX, y1: top, x2: axisX, y2: Math.max(top, Math.min(revealY, bottomY)) });
  s.ticks.forEach((t) => {
    const on = revealY >= t.y - 1;
    const tick = setA(E(`${t.key}k`, 'line', 'w-tick w-fade', L.axis), { x1: axisX - 3, y1: t.y, x2: axisX + 3, y2: t.y });
    const guide = setA(E(`${t.key}g`, 'line', 'w-guide w-fade', L.axis), { x1: axisX + 5, y1: t.y, x2: cx - RMAX - 4, y2: t.y });
    const txt = setA(E(`${t.key}t`, 'text', 'w-tickt w-fade', L.axis), { x: axisX - 6, y: t.y + (t.key === 't0' ? -4 : 3.5), 'text-anchor': 'end' });
    if (txt.textContent !== t.text) txt.textContent = t.text;
    [tick, guide, txt].forEach((el) => setOpacity(el, on));
  });

  // Выноски: по возрастанию глубины, без наложений.
  const GAP = 28;
  const cs = s.callouts.map((c) => ({ ...c, ly: Math.max(c.ay, top + 8) })).sort((a, b) => a.ay - b.ay);
  for (let i = 1; i < cs.length; i += 1) cs[i].ly = Math.max(cs[i].ly, cs[i - 1].ly + GAP);
  const maxLy = H - 18;
  for (let i = cs.length - 1; i >= 0; i -= 1) {
    const lim = i === cs.length - 1 ? maxLy : cs[i + 1].ly - GAP;
    if (cs[i].ly > lim) cs[i].ly = lim;
  }
  cs.forEach((c) => {
    const on = revealY >= c.ay - 1;
    const lead = setA(E(`${c.key}ld`, 'path', 'w-leader w-fade', L.labels), {
      d: `M${r2(c.ax)} ${r2(c.ay)}H${r2(Math.max(c.ax, labelX - 16))}L${r2(labelX - 5)} ${r2(c.ly - 4)}`,
    });
    const dot = setA(E(`${c.key}dt`, 'circle', 'w-dot w-fade', L.labels), { cx: c.ax, cy: c.ay, r: 2 });
    const t1 = setA(E(`${c.key}t1`, 'text', 'w-co1 w-fade', L.labels), { x: labelX, y: c.ly });
    const t2 = setA(E(`${c.key}t2`, 'text', 'w-co2 w-fade', L.labels), { x: labelX, y: c.ly + 13 });
    if (t1.textContent !== c.l1) t1.textContent = c.l1;
    if (t2.textContent !== c.l2) t2.textContent = c.l2;
    [lead, dot, t1, t2].forEach((el) => setOpacity(el, on));
  });

  // Скрыть элементы, которых нет в этом кадре.
  for (const [k, el] of well.cache) {
    const on = well.used.has(k);
    if (el._shown !== on) { el.style.display = on ? '' : 'none'; el._shown = on; }
  }
}

function animateWell(from, fromReveal, dur) {
  cancelAnimationFrame(well.raf);
  const to = well.target;
  if (REDUCED.matches || !well.shown || !from) {
    well.cur = to;
    well.reveal = well.shown ? 1 : 0;
    paintWell(to, well.reveal);
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = easeInOut(k);
    well.cur = lerpScene(from, to, e);
    well.reveal = lerp(fromReveal, 1, e);
    paintWell(well.cur, well.reveal);
    if (k < 1) well.raf = requestAnimationFrame(step);
  };
  well.raf = requestAnimationFrame(step);
}

function drawWell(d, res) {
  ensureWellSvg();
  $('well-svg').classList.remove('is-stale');
  // Порядок слоёв зависит от набора строк: при его изменении элементы создаются заново.
  const sig = `${d.casings.map((c) => c.uid).join(',')}|${d.string.map((s) => s.uid).join(',')}`;
  if (sig !== well.sig) {
    well.sig = sig;
    for (const el of well.cache.values()) el.remove();
    well.cache.clear();
  }
  const prev = well.cur;
  well.target = wellScene(d, res);
  const kinds = [...new Set(d.string.map((s) => s.kind))];
  setHTML(well.legend, [
    '<span><i class="lg w-mud"></i>раствор</span>',
    '<span><i class="lg w-casing"></i>обсадная колонна</span>',
    '<span><i class="lg w-cement"></i>цемент</span>',
    ...['dp', 'hw', 'dc', 'motor'].filter((k) => kinds.includes(k))
      .map((k) => `<span><i class="lg w-str ${STRING_KINDS[k].cls}"></i>${{ dp: 'бурильные трубы', hw: 'ТБТ', dc: 'УБТ', motor: 'ВЗД' }[k]}</span>`),
  ].join(''));
  setHTML(well.hint, well.target.compressed
    ? 'Шкала глубин нелинейная: короткие интервалы растянуты для читаемости, отметки глубин точные. Диаметры — в своём масштабе.'
    : 'Масштаб по горизонтали и вертикали разный.');
  animateWell(prev, well.reveal, 650);
}

/** Первый показ вкладки «Объёмы»: ствол прорисовывается сверху вниз. */
function revealWell() {
  if (well.shown) return;
  well.shown = true;
  if (!well.target) return;
  well.reveal = 0;
  animateWell(well.target, 0, 1400);
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
  if (form.dataset.calc === 'volumes') applyPreset('default');
  if (form.dataset.calc === 'circ') {
    const prev = lastVolumes;
    lastVolumes = F.wellSectionVolumes(toWell(presetData('default')));
    fillCircFromVolumes();
    lastVolumes = prev;
  }
}

function initForms() {
  initVolumes();
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
