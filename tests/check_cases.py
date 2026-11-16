#!/usr/bin/env python3
"""Независимая проверка контрольных примеров docs/data/cases.json.

Формулы записаны здесь заново (на Python, только stdlib), чтобы ожидаемые
значения в cases.json были подтверждены вторым, независимым от
docs/js/formulas.js расчётом. Тот же набор примеров прогоняется в браузере
на странице docs/tests.html против JS-реализации.

Запуск:  python3 tests/check_cases.py
Код возврата 0 — все примеры сошлись, 1 — есть расхождения.
"""

import json
import math
import sys
from pathlib import Path

G = 9.81
STEEL = 7850.0
WATER = 1000.0

CASES = Path(__file__).resolve().parent.parent / "docs" / "data" / "cases.json"


def hydrostatic_pressure(rho, h):
    return rho * G * h  # P = ρgh


def pressure_gradient(rho):
    return rho * G  # dP/dh = ρg


def anomaly_coefficient(p, h):
    return p / (WATER * G * h)  # kа = P / (ρв g H)


def ecd(rho, dp_an, tvd):
    return rho + dp_an / (G * tvd)  # ρэкв = ρ + ΔPкп/(gH)


def overbalance_margin(p_res, depth, cap_deep=2.5e6):
    # ФНП ПБ НГП: до 1200 м — 10 %, не более 1,5 МПа; глубже — 5 %, не более 2,5–3,0 МПа
    if depth <= 1200:
        fraction, cap = 0.10, 1.5e6
    else:
        fraction, cap = 0.05, cap_deep
    by_fraction = fraction * p_res
    return {"fraction": fraction, "cap": cap,
            "dP": min(by_fraction, cap), "limited": by_fraction > cap}


def required_mud_density(p_res, depth, dp):
    return (p_res + dp) / (G * depth)  # ρ = (Pпл + ΔP)/(gH)


def area(d):
    return math.pi * d ** 2 / 4.0


def pipe_volume(d_in, length):
    return area(d_in) * length


def annular_volume(d_outer, d_pipe, length):
    return (area(d_outer) - area(d_pipe)) * length


def hole_volume(d, length):
    return area(d) * length


def well_volumes(intervals):
    pipe = sum(pipe_volume(i["dIn"], i["length"]) for i in intervals)
    ann = sum(annular_volume(i["D"], i["dOut"], i["length"]) for i in intervals)
    hole = sum(hole_volume(i["D"], i["length"]) for i in intervals)
    steel = sum(annular_volume(i["dOut"], i["dIn"], i["length"]) for i in intervals)
    return {"pipe": pipe, "annulus": ann, "hole": hole, "steel": steel,
            "total": pipe + ann, "length": sum(i["length"] for i in intervals)}


# --- Конструкция + компоновка -------------------------------------------
# Раскладка колонны и разбиение на интервалы записаны иначе, чем в formulas.js,
# а суммарные объёмы считаются вообще другим путём: интеграл площади ствола по
# глубине минус вытеснение секций по их наружному диаметру.

def string_layout(bit_depth, sections):
    """Секции снизу вверх; верхняя дополняет колонну до устья."""
    out, bottom = [], bit_depth
    for n, s in enumerate(sections):
        length = bottom if n == len(sections) - 1 else s["length"]
        top = bottom - length
        out.append(dict(s, length=length, top=top, bottom=bottom))
        bottom = top
    return out


def bore_area(well, z):
    """Площадь сечения скважины на глубине z (без инструмента)."""
    inside = [c for c in well.get("casings", []) if c.get("top", 0) <= z < c["shoe"]]
    if inside:
        return area(min(c["id"] for c in inside))
    hole = well["hole"]
    return hole.get("k", 1) * area(hole["D"])


def bore_integral(well, a, b):
    """∫ S(z) dz от a до b: S кусочно-постоянна между головами и башмаками колонн."""
    marks = sorted({a, b} | {x for c in well.get("casings", [])
                             for x in (c.get("top", 0), c["shoe"]) if a < x < b})
    return sum(bore_area(well, (lo + hi) / 2) * (hi - lo) for lo, hi in zip(marks, marks[1:]))


def well_segments(well):
    hole = well["hole"]
    bit = well.get("bitDepth", hole["depth"])
    layout = string_layout(bit, well.get("string", []))
    marks = {0, bit, hole["depth"]}
    for c in well.get("casings", []):
        marks |= {c.get("top", 0), c["shoe"]}
    for s in layout:
        marks |= {s["top"], s["bottom"]}
    marks = sorted(m for m in marks if 0 <= m <= hole["depth"])
    segs = []
    for top, bottom in zip(marks, marks[1:]):
        z = (top + bottom) / 2
        inside = [c for c in well.get("casings", []) if c.get("top", 0) <= z < c["shoe"]]
        d_outer = min(c["id"] for c in inside) if inside else hole["D"]
        sec = next((s for s in layout if s["top"] <= z < s["bottom"]), None) if z < bit else None
        od, d_in = (sec["od"], sec["id"]) if sec else (0, 0)
        length = bottom - top
        s_bore = bore_area(well, z)
        key = (min(inside, key=lambda c: c["id"])["shoe"] if inside else None, id(sec) if sec else None)
        if segs and segs[-1]["_key"] == key:  # то же снаружи и внутри — продолжение интервала
            top = segs.pop()["top"]
            length = bottom - top
        segs.append({
            "_key": key,
            "top": top, "bottom": bottom, "length": length,
            "outer": "casing" if inside else "open", "D": d_outer, "od": od, "id": d_in,
            "pipe": area(d_in) * length,
            "annulus": (s_bore - area(od)) * length if sec else 0,
            "belowBit": 0 if sec else s_bore * length,
            "hole": s_bore * length,
            "steel": (area(od) - area(d_in)) * length,
        })
    for seg in segs:
        del seg["_key"]
    return segs


def well_section_volumes(well):
    hole = well["hole"]
    bit = well.get("bitDepth", hole["depth"])
    layout = string_layout(bit, well.get("string", []))
    pipe = sum(area(s["id"]) * s["length"] for s in layout)
    displacement = sum(area(s["od"]) * s["length"] for s in layout)
    annulus = bore_integral(well, 0, bit) - displacement
    below = bore_integral(well, bit, hole["depth"])
    last_shoe = max([c["shoe"] for c in well.get("casings", [])], default=0)
    return {
        "pipe": pipe, "annulus": annulus, "belowBit": below,
        "hole": bore_integral(well, 0, hole["depth"]),
        "openHole": bore_integral(well, last_shoe, hole["depth"]),
        "steel": displacement - pipe,
        "total": pipe + annulus + below,
        "bitDepth": bit, "depth": hole["depth"],
    }


def pump_time(volume, q):
    return volume / q  # t = V/Q


def annular_velocity(q, d_outer, d_pipe):
    return q / (area(d_outer) - area(d_pipe))  # v = Q/Sкп


def buoyancy_factor(rho_mud, rho_steel=STEEL):
    return 1.0 - rho_mud / rho_steel  # k = 1 − ρр/ρст


def buoyed_weight(q_lin, length, rho_mud, rho_steel=STEEL):
    return buoyancy_factor(rho_mud, rho_steel) * q_lin * length * G


FUNCS = {
    "hydrostaticPressure": hydrostatic_pressure,
    "pressureGradient": pressure_gradient,
    "anomalyCoefficient": anomaly_coefficient,
    "equivalentCirculatingDensity": ecd,
    "overbalanceMargin": overbalance_margin,
    "requiredMudDensity": required_mud_density,
    "pipeVolume": pipe_volume,
    "annularVolume": annular_volume,
    "holeVolume": hole_volume,
    "wellVolumes": well_volumes,
    "drillStringLayout": string_layout,
    "wellSegments": well_segments,
    "wellSectionVolumes": well_section_volumes,
    "pumpTime": pump_time,
    "annularVelocity": annular_velocity,
    "buoyancyFactor": buoyancy_factor,
    "buoyedWeight": buoyed_weight,
}


def close(actual, expected, rtol):
    if isinstance(expected, bool):
        return actual is expected
    if isinstance(expected, (int, float)):
        if expected == 0:
            return abs(actual) <= 1e-12
        return abs(actual - expected) <= rtol * abs(expected)
    if isinstance(expected, dict):
        return isinstance(actual, dict) and \
            all(k in actual and close(actual[k], v, rtol) for k, v in expected.items())
    if isinstance(expected, list):
        return isinstance(actual, list) and len(actual) == len(expected) and \
            all(close(a, e, rtol) for a, e in zip(actual, expected))
    return actual == expected


def subset(actual, expected):
    """Только те поля фактического результата, что есть в ожидаемом (для вывода)."""
    if isinstance(expected, dict) and isinstance(actual, dict):
        return {k: subset(actual.get(k), v) for k, v in expected.items()}
    if isinstance(expected, list) and isinstance(actual, list):
        return [subset(a, e) for a, e in zip(actual, expected)]
    return actual


def main():
    data = json.loads(CASES.read_text(encoding="utf-8"))
    rtol = data.get("rtol", 1e-9)
    failed = 0
    for case in data["cases"]:
        actual = FUNCS[case["fn"]](*case["args"])
        ok = close(actual, case["expected"], rtol)
        failed += not ok
        shown = subset(actual, case["expected"])
        if isinstance(shown, list):
            shown = f"[{len(shown)} элем.]"
        print(f"{'OK  ' if ok else 'FAIL'} {case['id']:<12} {case['fn']:<29} {shown}")
        if not ok:
            print(f"     ожидалось: {case['expected']}")
    total = len(data["cases"])
    print(f"\nИтого: {total - failed}/{total} примеров сошлись")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
