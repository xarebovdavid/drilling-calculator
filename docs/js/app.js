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

/* ---------- вывод ---------- */

function renderResults(calc, data) {
  const box = document.querySelector(`[data-results="${calc}"]`);
  if (!data) {
    box.innerHTML = `
      <div class="results-head"><h3>Результат</h3></div>
      <p class="placeholder">Исправьте исходные данные — поля с ошибкой выделены.</p>`;
    return;
  }
  const items = data.items.map((it) => `
      <div class="result${it.primary ? ' primary' : ''}">
        <div class="result-label">${it.label}</div>
        <div class="result-value">${it.value}<span class="result-unit">${it.unit || ''}</span></div>
        ${it.sub ? `<div class="result-sub">${it.sub}</div>` : ''}
      </div>`).join('');
  const formula = data.formula.map((l) => `<div class="f-line">${l}</div>`).join('');
  box.innerHTML = `
    <div class="results-head">
      <h3>Результат</h3>
      <button type="button" class="btn small ghost copy-btn" title="Скопировать результат">Копировать</button>
    </div>
    <div class="result-grid">${items}</div>
    ${data.extra || ''}
    <div class="formula" aria-label="Расчёт">${formula}</div>
    ${data.notes ? `<div class="notes">${data.notes}</div>` : ''}`;
  box.querySelector('.copy-btn').addEventListener('click', (e) => copy(e.currentTarget, data.copy));
}

async function copy(button, text) {
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Скопировано';
  } catch {
    button.textContent = 'Не удалось';
  }
  setTimeout(() => { button.textContent = 'Копировать'; }, 1500);
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
    <td><select data-k="type" aria-label="Тип интервала">
      <option value="casing"${it.type === 'casing' ? ' selected' : ''}>Обсадная колонна</option>
      <option value="open"${it.type === 'open' ? ' selected' : ''}>Открытый ствол</option>
    </select></td>
    <td><input data-k="length" inputmode="decimal" aria-label="Длина, м" value="${n(it.length)}"></td>
    <td><input data-k="D" inputmode="decimal" aria-label="D, мм" value="${n(it.D)}"></td>
    <td><input data-k="dOut" inputmode="decimal" aria-label="Наружный диаметр труб, мм" value="${n(it.dOut)}"></td>
    <td><input data-k="dIn" inputmode="decimal" aria-label="Внутренний диаметр труб, мм" value="${n(it.dIn)}"></td>
    <td><button type="button" class="icon-btn" data-remove aria-label="Удалить интервал">×</button></td>`;
  return tr;
}

function setIntervals(list) {
  const body = $('intervals-body');
  body.innerHTML = '';
  list.forEach((it) => body.appendChild(intervalRow(it)));
}

function readIntervals() {
  const rows = [...$('intervals-body').querySelectorAll('tr')];
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
  $('intervals-error').innerHTML = errors.join('<br>');
  return errors.length ? null : list;
}

function calcVolumes() {
  const list = readIntervals();
  if (!list) {
    lastVolumes = null;
    $('well-svg').innerHTML = '';
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

/* Схема скважины (SVG): по вертикали — глубина, по горизонтали — диаметры в своём масштабе. */
function drawWell(list) {
  const W = 320, H = 440, top = 34, bottom = 16, cx = 120;
  const total = list.reduce((s, i) => s + i.length, 0);
  const maxD = Math.max(...list.map((i) => i.D));
  const kx = 64 / (maxD / 2);              // половина максимального диаметра = 64 px
  const ky = (H - top - bottom) / total;
  const parts = [];
  const labels = [];
  let y = top;
  let depth = 0;

  parts.push(`<rect x="0" y="${top}" width="${W}" height="${H - top}" class="w-rock"/>`);
  parts.push(`<line x1="0" y1="${top}" x2="${W}" y2="${top}" class="w-ground"/>`);

  list.forEach((it, i) => {
    const h = it.length * ky;
    const R = (it.D / 2) * kx, ro = (it.dOut / 2) * kx, ri = (it.dIn / 2) * kx;
    parts.push(`<rect x="${cx - R}" y="${y}" width="${2 * R}" height="${h}" class="w-mud"/>`);
    if (it.type === 'casing') {
      parts.push(`<rect x="${cx - R - 5}" y="${y}" width="5" height="${h}" class="w-casing"/>`);
      parts.push(`<rect x="${cx + R}" y="${y}" width="5" height="${h}" class="w-casing"/>`);
      parts.push(`<rect x="${cx - R - 9}" y="${y}" width="4" height="${h}" class="w-cement"/>`);
      parts.push(`<rect x="${cx + R + 5}" y="${y}" width="4" height="${h}" class="w-cement"/>`);
    } else {
      parts.push(`<line x1="${cx - R}" y1="${y}" x2="${cx - R}" y2="${y + h}" class="w-wall"/>`);
      parts.push(`<line x1="${cx + R}" y1="${y}" x2="${cx + R}" y2="${y + h}" class="w-wall"/>`);
    }
    parts.push(`<rect x="${cx - ro}" y="${y}" width="${2 * ro}" height="${h}" class="w-pipe"/>`);
    parts.push(`<rect x="${cx - ri}" y="${y}" width="${2 * ri}" height="${h}" class="w-bore"/>`);

    depth += it.length;
    const yEnd = y + h;
    labels.push(`<line x1="${cx + 76}" y1="${yEnd}" x2="${cx + 84}" y2="${yEnd}" class="w-tick"/>`);
    labels.push(`<text x="${cx + 88}" y="${yEnd + 4}" class="w-depth">${num(depth)} м</text>`);
    if (h > 26) {
      const kind = it.type === 'casing' ? `колонна D<tspan class="w-sub" dy="2">вн</tspan><tspan dy="-2"> ${num(it.D, 1)}</tspan>` : `ствол ${num(it.D, 1)}`;
      labels.push(`<text x="${cx + 88}" y="${y + h / 2 - 3}" class="w-label">${kind}</text>`);
      labels.push(`<text x="${cx + 88}" y="${y + h / 2 + 11}" class="w-label muted">трубы ${num(it.dOut, 1)}×${num((it.dOut - it.dIn) / 2, 2)}</text>`);
    }
    y = yEnd;
    if (i === list.length - 1) {
      const b = Math.max(ro, 6);
      parts.push(`<path d="M${cx - b} ${y - 1} L${cx + b} ${y - 1} L${cx} ${y + 10} Z" class="w-bit"/>`);
    }
  });

  labels.push(`<text x="${cx + 88}" y="${top + 4}" class="w-depth">0 м</text>`);
  labels.push(`<text x="${cx}" y="${top - 12}" text-anchor="middle" class="w-label muted">устье</text>`);

  $('well-svg').innerHTML = `
    <svg viewBox="0 0 ${W} ${H + 14}" role="img" aria-label="Схема конструкции скважины">
      ${parts.join('')}${labels.join('')}
    </svg>
    <div class="legend">
      <span><i class="lg w-mud"></i>раствор</span>
      <span><i class="lg w-pipe"></i>трубы</span>
      <span><i class="lg w-casing"></i>обсадная колонна</span>
      <span><i class="lg w-cement"></i>цемент</span>
    </div>
    <p class="hint">Масштаб по горизонтали и вертикали разный.</p>`;
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
      sub: `${fmt(tUp / 60, 1)} мин` },
    { label: 'Время до долота', value: fmtTime(tPipe), unit: '', sub: `${fmt(tPipe / 60, 1)} мин` },
    { label: 'Полный цикл циркуляции', value: fmtTime(tCycle), unit: '', sub: `${fmt(tCycle / 60, 1)} мин` },
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
    form.addEventListener('input', run);
    form.addEventListener('change', run);
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
    btn.closest('tr').remove();
    calcVolumes();
  });
  $('add-interval').addEventListener('click', () => {
    const rows = readIntervalsRaw();
    const last = rows[rows.length - 1] || { type: 'open', D: 215.9, dOut: 127, dIn: 108.6 };
    $('intervals-body').appendChild(intervalRow({ ...last, type: 'open', length: 100 }));
    calcVolumes();
  });
  $('take-volumes').addEventListener('click', () => {
    calcVolumes();
    fillCircFromVolumes();
    calcCirc();
  });

  // Порядок важен: объёмы считаются до циркуляции.
  calcVolumes();
  Object.entries(CALCS).forEach(([k, fn]) => { if (k !== 'volumes') fn(); });
}

function readIntervalsRaw() {
  return [...$('intervals-body').querySelectorAll('tr')].map((tr) => {
    const g = (k) => tr.querySelector(`[data-k="${k}"]`).value;
    return { type: g('type'), D: g('D'), dOut: g('dOut'), dIn: g('dIn') };
  });
}

/* ---------- вкладки ---------- */

function initTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const select = (name, focus = false) => {
    if (!CALCS[name]) name = 'hydro';
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(`panel-${t.dataset.tab}`).hidden = !on;
      if (on && focus) t.focus();
      if (on) {
        // Прокрутить только полосу вкладок (без прокрутки страницы).
        const bar = t.parentElement;
        const left = t.offsetLeft - bar.offsetLeft;
        if (left < bar.scrollLeft || left + t.offsetWidth > bar.scrollLeft + bar.clientWidth) {
          bar.scrollLeft = left - 16;
        }
      }
    });
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
  window.addEventListener('hashchange', () => select(location.hash.slice(1)));
  select(location.hash.slice(1));
}

initForms();
initTabs();
