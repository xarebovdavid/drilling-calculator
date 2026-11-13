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
        return all(k in actual and close(actual[k], v, rtol) for k, v in expected.items())
    return actual == expected


def main():
    data = json.loads(CASES.read_text(encoding="utf-8"))
    rtol = data.get("rtol", 1e-9)
    failed = 0
    for case in data["cases"]:
        actual = FUNCS[case["fn"]](*case["args"])
        ok = close(actual, case["expected"], rtol)
        failed += not ok
        shown = actual if not isinstance(actual, dict) else \
            {k: actual[k] for k in case["expected"]}
        print(f"{'OK  ' if ok else 'FAIL'} {case['id']:<10} {case['fn']:<29} {shown}")
        if not ok:
            print(f"     ожидалось: {case['expected']}")
    total = len(data["cases"])
    print(f"\nИтого: {total - failed}/{total} примеров сошлись")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
