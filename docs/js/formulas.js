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
 * Раскладка бурильной колонны по глубине.
 * Секции перечисляются от долота вверх (ВЗД, УБТ, ТБТ, бурильные трубы…).
 * Длина последней, верхней, секции не задаётся — она дополняет колонну до устья:
 *   Lверх = Hдол − Σ Li  (i = 1 … n − 1)
 * Подошва первой секции — на глубине долота, кровля каждой следующей — выше на её длину.
 * Если КНБК длиннее Hдол, длина верхней секции получится отрицательной —
 * такие данные отсекаются проверкой в интерфейсе.
 * @param {number} bitDepth глубина долота по стволу, м
 * @param {Array<{od:number, id:number, length?:number}>} sections
 *   секции снизу вверх; диаметры в м, длина в м (у верхней секции игнорируется)
 * @returns {Array<{od:number, id:number, length:number, top:number, bottom:number}>}
 *   секции в том же порядке (со всеми их полями) + длина, глубина кровли top и подошвы bottom, м
 */
export function drillStringLayout(bitDepth, sections) {
  let bottom = bitDepth;
  return sections.map((s, i) => {
    const length = i === sections.length - 1 ? bottom : s.length;
    const top = i === sections.length - 1 ? 0 : bottom - length;
    const out = { ...s, length, top, bottom };
    bottom = top;
    return out;
  });
}

/**
 * Разбиение скважины на интервалы наложением конструкции и компоновки.
 *
 * Границы интервалов — устье, головы хвостовиков, башмаки колонн, границы секций
 * бурильной колонны, глубина долота и забой; соседние интервалы с одинаковыми
 * колонной снаружи и секцией внутри объединяются. Внутри каждого интервала всё постоянно:
 *  - снаружи — внутренний диаметр самой внутренней обсадной колонны, перекрывающей
 *    интервал (колонна перекрывает глубины от top до башмака; у хвостовика top — голова,
 *    выше головы работает предыдущая колонна), а ниже последнего башмака — открытый ствол;
 *  - площадь открытого ствола умножается на коэффициент кавернозности:
 *    Sств = kк · π·Dд²/4 (kк — отношение фактического объёма ствола к номинальному,
 *    что равносильно эффективному диаметру Dд·√kк); в обсадной колонне Sств = π·Dвн²/4;
 *  - внутри — секция бурильной колонны с наружным dн и внутренним dвн диаметрами
 *    (ниже долота труб нет).
 * Для каждого интервала длиной L:
 *   Vтр = π·dвн²/4·L,  Vкп = (Sств − π·dн²/4)·L,  Vмет = π·(dн² − dвн²)/4·L,
 *   Vств = Sств·L,  ниже долота: Vпод = Sств·L
 *
 * @param {{
 *   casings?: Array<{od:number, id:number, shoe:number, top?:number}>,
 *   hole: {D:number, depth:number, k?:number},
 *   bitDepth?: number,
 *   string?: Array<{od:number, id:number, length?:number}>
 * }} well
 *   casings — обсадные колонны: Dн, Dвн, м; shoe — глубина башмака, top — голова (0 для колонн до устья), м;
 *   hole — открытый ствол: D — диаметр долота, м, depth — забой, м, k — коэффициент кавернозности (1);
 *   bitDepth — глубина долота (по умолчанию забой);
 *   string — секции бурильной колонны от долота вверх (см. drillStringLayout)
 * @returns {Array<{top:number, bottom:number, length:number,
 *   outer:'casing'|'open', casing:number, D:number, section:number, od:number, id:number,
 *   holeArea:number, pipeArea:number, annulusArea:number, steelArea:number,
 *   pipe:number, annulus:number, belowBit:number, hole:number, steel:number}>}
 *   интервалы сверху вниз; casing и section — индексы колонны и секции (−1, если нет);
 *   площади — м², объёмы — м³. Для интервала ниже долота annulus = 0, а его объём — в belowBit.
 */
export function wellSegments(well) {
  const casings = well.casings || [];
  const { hole } = well;
  const k = hole.k ?? 1;
  const bitDepth = well.bitDepth ?? hole.depth;
  const string = drillStringLayout(bitDepth, well.string || []);

  const cuts = new Set([0, hole.depth, bitDepth]);
  casings.forEach((c) => { cuts.add(c.top || 0); cuts.add(c.shoe); });
  string.forEach((s) => { cuts.add(s.top); cuts.add(s.bottom); });
  const depths = [...cuts].filter((d) => d >= 0 && d <= hole.depth).sort((a, b) => a - b);

  const segments = [];
  for (let i = 0; i + 1 < depths.length; i += 1) {
    const top = depths[i];
    const bottom = depths[i + 1];
    const mid = (top + bottom) / 2;
    const length = bottom - top;

    let casing = -1;
    casings.forEach((c, j) => {
      const covers = (c.top || 0) <= mid && mid < c.shoe;
      if (covers && (casing < 0 || c.id < casings[casing].id)) casing = j;
    });
    const D = casing < 0 ? hole.D : casings[casing].id;
    const holeArea = casing < 0 ? k * circleArea(D) : circleArea(D);

    const section = mid < bitDepth ? string.findIndex((s) => s.top <= mid && mid < s.bottom) : -1;
    const od = section < 0 ? 0 : string[section].od;
    const id = section < 0 ? 0 : string[section].id;
    const pipeArea = circleArea(id);
    const steelArea = circleArea(od) - circleArea(id);
    const annulusArea = holeArea - circleArea(od);
    const inString = section >= 0;

    // Соседние интервалы с тем же «снаружи» и «внутри» объединяются
    // (например, башмак направления, перекрытого кондуктором, границы не даёт).
    const prev = segments[segments.length - 1];
    if (prev && prev.casing === casing && prev.section === section) {
      prev.bottom = bottom;
      prev.length += length;
      prev.pipe = pipeArea * prev.length;
      prev.annulus = inString ? annulusArea * prev.length : 0;
      prev.belowBit = inString ? 0 : holeArea * prev.length;
      prev.hole = holeArea * prev.length;
      prev.steel = steelArea * prev.length;
      continue;
    }

    segments.push({
      top, bottom, length,
      outer: casing < 0 ? 'open' : 'casing', casing, D,
      section, od, id,
      holeArea, pipeArea, annulusArea, steelArea,
      pipe: pipeArea * length,
      annulus: inString ? annulusArea * length : 0,
      belowBit: inString ? 0 : holeArea * length,
      hole: holeArea * length,
      steel: steelArea * length,
    });
  }
  return segments;
}

/**
 * Объёмы скважины по конструкции и компоновке (сумма по интервалам wellSegments).
 *   Vтр   = Σ π·dвн²/4·L                  — внутри бурильной колонны (до долота)
 *   Vкп   = Σ (Sств − π·dн²/4)·L          — кольцевое пространство от долота до устья
 *   Vпод  = Σ Sств·L                      — ствол ниже долота (если долото не на забое)
 *   Vств  = Σ Sств·L                      — вся скважина без инструмента, до забоя
 *   Vмет  = Σ π·(dн² − dвн²)/4·L          — объём металла (вытеснение колонной)
 *   V     = Vтр + Vкп + Vпод              — раствор в скважине с инструментом
 * Проверочное тождество: Vств = V + Vмет.
 * @param {Parameters<typeof wellSegments>[0]} well см. wellSegments
 * @returns {{pipe:number, annulus:number, belowBit:number, hole:number, openHole:number,
 *   steel:number, total:number, bitDepth:number, depth:number,
 *   segments:ReturnType<typeof wellSegments>, string:ReturnType<typeof drillStringLayout>}}
 *   объёмы в м³ (openHole — объём открытого ствола с учётом kк), глубины в м,
 *   segments — интервалы, string — раскладка бурильной колонны
 */
export function wellSectionVolumes(well) {
  const segments = wellSegments(well);
  const bitDepth = well.bitDepth ?? well.hole.depth;
  const sum = (key, only = () => true) => segments.reduce((s, g) => s + (only(g) ? g[key] : 0), 0);
  const pipe = sum('pipe');
  const annulus = sum('annulus');
  const belowBit = sum('belowBit');
  return {
    pipe,
    annulus,
    belowBit,
    hole: sum('hole'),
    openHole: sum('hole', (g) => g.outer === 'open'),
    steel: sum('steel'),
    total: pipe + annulus + belowBit,
    bitDepth,
    depth: well.hole.depth,
    segments,
    string: drillStringLayout(bitDepth, well.string || []),
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
