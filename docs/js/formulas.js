/**
 * Расчётные формулы бурового калькулятора.
 *
 * Все функции чистые и работают в единицах СИ:
 *   плотность — кг/м³, давление — Па, длина и диаметр — м,
 *   объём — м³, расход — м³/с, время — с, сила — Н.
 * Перевод в «промысловые» единицы (г/см³, МПа, мм, л/с) делается в app.js.
 */

/** Ускорение свободного падения, м/с² (значение, принятое в учебной литературе). */
export const G = 9.81;

/** Плотность стали по умолчанию, кг/м³. */
export const STEEL_DENSITY = 7850;

/** Плотность пресной воды, кг/м³ (для коэффициента аномальности). */
export const WATER_DENSITY = 1000;

/**
 * Гидростатическое давление столба жидкости.
 *   P = ρ · g · h
 * @param {number} rho  плотность жидкости, кг/м³
 * @param {number} h    высота столба (глубина по вертикали), м
 * @param {number} [g=G] ускорение свободного падения, м/с²
 * @returns {number} давление, Па
 */
export function hydrostaticPressure(rho, h, g = G) {
  return rho * g * h;
}

/**
 * Градиент гидростатического давления.
 *   grad P = ρ · g
 * @param {number} rho плотность, кг/м³
 * @param {number} [g=G]
 * @returns {number} градиент, Па/м
 */
export function pressureGradient(rho, g = G) {
  return rho * g;
}

/**
 * Коэффициент аномальности пластового давления
 * (отношение давления к гидростатическому давлению столба пресной воды).
 *   kа = P / (ρв · g · H)
 * @param {number} p давление, Па
 * @param {number} h глубина по вертикали, м
 * @param {number} [g=G]
 * @returns {number} безразмерный коэффициент
 */
export function anomalyCoefficient(p, h, g = G) {
  return p / (WATER_DENSITY * g * h);
}

/**
 * Эквивалентная циркуляционная плотность (ЭЦП).
 *   ρэкв = ρ + ΔPкп / (g · H)
 * @param {number} rho  плотность раствора, кг/м³
 * @param {number} dPan потери давления в кольцевом пространстве выше расчётной точки, Па
 * @param {number} tvd  глубина расчётной точки по вертикали, м
 * @param {number} [g=G]
 * @returns {number} ЭЦП, кг/м³
 */
export function equivalentCirculatingDensity(rho, dPan, tvd, g = G) {
  return rho + dPan / (g * tvd);
}

/**
 * Нормативное превышение гидростатического давления над пластовым
 * (ФНП «Правила безопасности в нефтяной и газовой промышленности»):
 *   H ≤ 1200 м: ΔP = min(10 % · Pпл; 1,5 МПа)
 *   H > 1200 м: ΔP = min(5 % · Pпл; capDeep), capDeep = 2,5…3,0 МПа
 * @param {number} pRes  пластовое давление, Па
 * @param {number} depth глубина кровли пласта по вертикали, м
 * @param {number} [capDeep=2.5e6] верхний предел для интервалов глубже 1200 м, Па
 * @returns {{fraction:number, cap:number, dP:number, limited:boolean}}
 *   fraction — доля от Pпл, cap — предел, Па, dP — принятая репрессия, Па,
 *   limited — сработало ли ограничение сверху
 */
export function overbalanceMargin(pRes, depth, capDeep = 2.5e6) {
  const shallow = depth <= 1200;
  const fraction = shallow ? 0.10 : 0.05;
  const cap = shallow ? 1.5e6 : capDeep;
  const byFraction = fraction * pRes;
  const dP = Math.min(byFraction, cap);
  return { fraction, cap, dP, limited: byFraction > cap };
}

/**
 * Плотность бурового раствора, обеспечивающая заданную репрессию на пласт.
 *   ρ = (Pпл + ΔP) / (g · H)
 * @param {number} pRes  пластовое давление, Па
 * @param {number} depth глубина кровли пласта по вертикали, м
 * @param {number} dP    репрессия (превышение над пластовым), Па
 * @param {number} [g=G]
 * @returns {number} плотность, кг/м³
 */
export function requiredMudDensity(pRes, depth, dP, g = G) {
  return (pRes + dP) / (g * depth);
}

/**
 * Площадь круга.
 *   S = π · d² / 4
 * @param {number} d диаметр, м
 * @returns {number} площадь, м²
 */
export function circleArea(d) {
  return (Math.PI * d * d) / 4;
}

/**
 * Площадь кольцевого сечения.
 *   Sкп = π · (D² − d²) / 4
 * @param {number} D внутренний диаметр внешней границы (скважина или обсадная колонна), м
 * @param {number} d наружный диаметр трубы, м
 * @returns {number} площадь, м²
 */
export function annularArea(D, d) {
  return (Math.PI * (D * D - d * d)) / 4;
}

/**
 * Внутренний объём труб.
 *   Vтр = π · dвн² / 4 · L
 * @param {number} dIn внутренний диаметр трубы, м
 * @param {number} L   длина, м
 * @returns {number} объём, м³
 */
export function pipeVolume(dIn, L) {
  return circleArea(dIn) * L;
}

/**
 * Объём кольцевого (затрубного) пространства.
 *   Vкп = π · (D² − dн²) / 4 · L
 * @param {number} D    диаметр скважины или внутренний диаметр обсадной колонны, м
 * @param {number} dOut наружный диаметр труб, м
 * @param {number} L    длина, м
 * @returns {number} объём, м³
 */
export function annularVolume(D, dOut, L) {
  return annularArea(D, dOut) * L;
}

/**
 * Объём ствола без колонны труб.
 *   Vств = π · D² / 4 · L
 * @param {number} D диаметр, м
 * @param {number} L длина, м
 * @returns {number} объём, м³
 */
export function holeVolume(D, L) {
  return circleArea(D) * L;
}

/**
 * Объёмы по конструкции скважины, заданной интервалами (сверху вниз).
 * Для каждого интервала:
 *   Vтр  = π·dвн²/4·L,  Vкп = π·(D² − dн²)/4·L,
 *   Vств = π·D²/4·L,    Vмет = π·(dн² − dвн²)/4·L
 * @param {Array<{length:number, D:number, dOut:number, dIn:number}>} intervals
 *   длины и диаметры в м
 * @returns {{pipe:number, annulus:number, hole:number, steel:number,
 *            total:number, length:number,
 *            rows:Array<{pipe:number, annulus:number, hole:number, steel:number}>}}
 *   pipe — внутренний объём труб, annulus — затрубье, hole — ствол без труб,
 *   steel — объём металла, total = pipe + annulus (раствор в скважине с трубами), м³
 */
export function wellVolumes(intervals) {
  const rows = intervals.map(({ length, D, dOut, dIn }) => ({
    pipe: pipeVolume(dIn, length),
    annulus: annularVolume(D, dOut, length),
    hole: holeVolume(D, length),
    steel: annularVolume(dOut, dIn, length),
  }));
  const sum = (key) => rows.reduce((s, r) => s + r[key], 0);
  const pipe = sum('pipe');
  const annulus = sum('annulus');
  return {
    pipe,
    annulus,
    hole: sum('hole'),
    steel: sum('steel'),
    total: pipe + annulus,
    length: intervals.reduce((s, i) => s + i.length, 0),
    rows,
  };
}

/**
 * Время прокачки объёма насосом.
 *   t = V / Q
 * Применяется для времени цикла (V = Vтр + Vкп + Vпов),
 * времени выхода забойной пачки (V = Vкп) и времени «до долота» (V = Vтр).
 * @param {number} volume объём, м³
 * @param {number} q      подача насоса, м³/с
 * @returns {number} время, с
 */
export function pumpTime(volume, q) {
  return volume / q;
}

/**
 * Средняя скорость восходящего потока в кольцевом пространстве.
 *   v = Q / Sкп = 4·Q / (π · (D² − d²))
 * @param {number} q подача, м³/с
 * @param {number} D диаметр скважины / внутренний диаметр колонны, м
 * @param {number} d наружный диаметр труб, м
 * @returns {number} скорость, м/с
 */
export function annularVelocity(q, D, d) {
  return q / annularArea(D, d);
}

/**
 * Коэффициент плавучести (облегчения) колонны в растворе.
 *   k = 1 − ρр / ρст
 * @param {number} rhoMud   плотность раствора, кг/м³
 * @param {number} [rhoSteel=STEEL_DENSITY] плотность материала труб, кг/м³
 * @returns {number} безразмерный коэффициент
 */
export function buoyancyFactor(rhoMud, rhoSteel = STEEL_DENSITY) {
  return 1 - rhoMud / rhoSteel;
}

/**
 * Вес колонны в растворе.
 *   Gр = k · q · L · g,  k = 1 − ρр / ρст
 * @param {number} qLin     масса 1 м труб (с учётом замков), кг/м
 * @param {number} L        длина колонны, м
 * @param {number} rhoMud   плотность раствора, кг/м³
 * @param {number} [rhoSteel=STEEL_DENSITY]
 * @param {number} [g=G]
 * @returns {number} вес, Н
 */
export function buoyedWeight(qLin, L, rhoMud, rhoSteel = STEEL_DENSITY, g = G) {
  return buoyancyFactor(rhoMud, rhoSteel) * qLin * L * g;
}
