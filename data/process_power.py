"""Turn the NASA POWER daily series into the weekly dataset the planner uses.

Input:   data/raw/power/power_daily_cochabamba_cercado_19810101_20251231.json (see download_power.py)
Output:  data/processed/climate_weekly.json and a copy in web/data/ for the web app

What is computed, per calendar year and per week of the year (52 weeks, week = (day_of_year - 1) // 7, last week
absorbs the remaining days):
  tmin_min   lowest daily minimum temperature of the week, deg C, at the POWER cell elevation (T2M_MIN)
  tmax_max   highest daily maximum temperature of the week, deg C, at the POWER cell elevation (T2M_MAX)
  tmean      mean temperature of the week, deg C, at the POWER cell elevation (T2M)
  rain       total precipitation of the week, mm (PRECTOTCORR)
  et0_low    reference evapotranspiration of the week, mm, at ET0_ALTITUDES[0]
  et0_high   reference evapotranspiration of the week, mm, at ET0_ALTITUDES[1]
  gwetroot   mean root-zone soil wetness of the week, 0-1 (GWETROOT)

Reference evapotranspiration follows FAO Irrigation and Drainage Paper 56 (Penman-Monteith, eq. 6) with POWER
radiation (ALLSKY_SFC_SW_DWN), temperature, humidity (RH2M) and wind at 2 m (WS2M). Days without radiation data
(before 1984) use the Hargreaves equation of the same paper (eq. 52).

Temperature is moved from the POWER cell elevation to the site with a fixed lapse rate:
  T_site = T_power + 0.0065 * (cell_elevation - site_elevation)
The web app applies that correction to tmin_min, tmax_max and tmean; ET0 is precomputed at two altitudes and
interpolated.

Rainy-season onset (per season starting 1 October): first day with at least ONSET_MM in ONSET_DAYS days that is
not followed by a dry spell of DRY_SPELL_DAYS or more days (rain < DRY_DAY_MM) within the next 30 days.
The trend of the onset date is tested with Mann-Kendall (pymannkendall).

Usage:  python data/process_power.py
"""
import json
import math
import time
from pathlib import Path

import numpy as np
import pandas as pd
import pymannkendall as mk

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "power" / "power_daily_cochabamba_cercado_19810101_20251231.json"
OUTS = [ROOT / "data" / "processed" / "climate_weekly.json", ROOT / "web" / "data" / "climate_weekly.json"]

LAPSE = 0.0065            # deg C per metre
ET0_ALTITUDES = [2550, 3400]  # metres: valley floor farmland and upper slopes of the municipality
ONSET_MM, ONSET_DAYS, DRY_DAY_MM, DRY_SPELL_DAYS = 20.0, 3, 1.0, 10


def sat_vp(t):
    return 0.6108 * np.exp(17.27 * t / (t + 237.3))


def et0_fao56(df, lat_deg, cell_elev, site_elev):
    """Daily reference evapotranspiration (mm/day) at site_elev. FAO-56 Penman-Monteith, Hargreaves as fallback."""
    delta_t = LAPSE * (cell_elev - site_elev)
    tmax, tmin = df["T2M_MAX"] + delta_t, df["T2M_MIN"] + delta_t
    tmean = (tmax + tmin) / 2
    doy = df.index.day_of_year.to_numpy()
    phi = math.radians(lat_deg)
    dr = 1 + 0.033 * np.cos(2 * np.pi * doy / 365)
    decl = 0.409 * np.sin(2 * np.pi * doy / 365 - 1.39)
    ws = np.arccos(-np.tan(phi) * np.tan(decl))
    ra = (24 * 60 / np.pi) * 0.0820 * dr * (ws * np.sin(phi) * np.sin(decl) + np.cos(phi) * np.cos(decl) * np.sin(ws))

    es = (sat_vp(tmax) + sat_vp(tmin)) / 2
    # actual vapour pressure from the POWER cell (humidity is kept, capped at saturation at the site)
    es_cell = (sat_vp(df["T2M_MAX"]) + sat_vp(df["T2M_MIN"])) / 2
    ea = np.minimum(df["RH2M"] / 100 * es_cell, es)
    slope = 4098 * sat_vp(tmean) / (tmean + 237.3) ** 2
    pressure = 101.3 * ((293 - 0.0065 * site_elev) / 293) ** 5.26
    gamma = 0.000665 * pressure
    rs = df["ALLSKY_SFC_SW_DWN"]
    rso = (0.75 + 2e-5 * site_elev) * ra
    rns = 0.77 * rs
    rnl = 4.903e-9 * ((tmax + 273.16) ** 4 + (tmin + 273.16) ** 4) / 2 * (0.34 - 0.14 * np.sqrt(ea)) \
        * (1.35 * np.minimum(rs / rso, 1.0) - 0.35)
    rn = rns - rnl
    u2 = df["WS2M"]
    pm = (0.408 * slope * rn + gamma * 900 / (tmean + 273) * u2 * (es - ea)) / (slope + gamma * (1 + 0.34 * u2))
    hargreaves = 0.0023 * (tmean + 17.8) * np.sqrt(np.maximum(tmax - tmin, 0)) * ra * 0.408
    et0 = pm.where(pm.notna(), hargreaves)
    return et0.clip(lower=0), int(pm.isna().sum())


def onset_offsets(rain):
    """Days after 1 October of the rainy-season onset, one value per season."""
    years, offsets = [], []
    for year in range(rain.index.year.min(), rain.index.year.max()):
        season = rain[f"{year}-10-01":f"{year + 1}-04-30"].to_numpy()
        found = None
        for d in range(len(season) - 33):
            if np.nansum(season[d:d + ONSET_DAYS]) < ONSET_MM:
                continue
            after = season[d + ONSET_DAYS:d + ONSET_DAYS + 30] < DRY_DAY_MM
            run = longest = 0
            for is_dry in after:
                run = run + 1 if is_dry else 0
                longest = max(longest, run)
            if longest < DRY_SPELL_DAYS:
                found = d
                break
        years.append(year)
        offsets.append(found)
    return years, offsets


def main():
    raw = json.loads(RAW.read_text(encoding="utf-8"))
    lon, lat, cell_elev = raw["geometry"]["coordinates"]
    params = raw["properties"]["parameter"]
    df = pd.DataFrame({k: pd.Series(v) for k, v in params.items()})
    df.index = pd.to_datetime(df.index, format="%Y%m%d")
    df = df.replace(-999.0, np.nan).sort_index()
    print(f"days: {len(df)} | {df.index[0].date()} to {df.index[-1].date()} | cell elevation {cell_elev} m")
    print("missing values per parameter:", {k: int(v) for k, v in df.isna().sum().items() if v})

    fallback_days = 0
    for name, alt in zip(["et0_low", "et0_high"], ET0_ALTITUDES):
        df[name], fallback_days = et0_fao56(df, lat, cell_elev, alt)
    print(f"ET0: Hargreaves fallback on {fallback_days} days without radiation; "
          f"annual mean at {ET0_ALTITUDES[0]} m = {df['et0_low'].groupby(df.index.year).sum().mean():.0f} mm, "
          f"at {ET0_ALTITUDES[1]} m = {df['et0_high'].groupby(df.index.year).sum().mean():.0f} mm")

    df["year"] = df.index.year
    df["week"] = np.minimum((df.index.day_of_year - 1) // 7, 51)
    g = df.groupby(["year", "week"])
    weekly = {
        "tmin_min": g["T2M_MIN"].min(), "tmax_max": g["T2M_MAX"].max(), "tmean": g["T2M"].mean(),
        "rain": g["PRECTOTCORR"].sum(min_count=1), "et0_low": g["et0_low"].sum(min_count=1),
        "et0_high": g["et0_high"].sum(min_count=1), "gwetroot": g["GWETROOT"].mean(),
    }
    years = sorted(df["year"].unique().tolist())
    decimals = {"gwetroot": 2}

    def table(series, name):
        wide = series.unstack("week").reindex(index=years, columns=range(52))
        rounded = wide.round(decimals.get(name, 1))
        return [[None if pd.isna(x) else float(x) for x in row] for row in rounded.to_numpy()]

    onset_years, offsets = onset_offsets(df["PRECTOTCORR"])
    valid = [(y, o) for y, o in zip(onset_years, offsets) if o is not None]
    test = mk.original_test([o for _, o in valid])
    print(f"rainy-season onset: {len(valid)}/{len(onset_years)} seasons, median {int(np.median([o for _, o in valid]))} days after 1 Oct, "
          f"Mann-Kendall trend={test.trend}, p={test.p:.3f}, slope={test.slope:.2f} days/year")

    annual_rain = df["PRECTOTCORR"].groupby(df.index.year).sum()
    low = LAPSE * (cell_elev - ET0_ALTITUDES[0])
    frost_weeks = (weekly["tmin_min"].unstack("week") + low <= 0).mean().round(2)
    print(f"annual rain: mean {annual_rain.mean():.0f} mm, min {annual_rain.min():.0f}, max {annual_rain.max():.0f}")
    print(f"frost (<= 0 C at {ET0_ALTITUDES[0]} m): weeks with probability >= 0.2 -> "
          f"{[int(w) for w, p in frost_weeks.items() if p >= 0.2]}, peak {frost_weeks.max()}")

    out = {
        "meta": {
            "dataset": "NASA POWER, community AG, daily point API (meteorology from MERRA-2, radiation from CERES SYN1deg)",
            "source_url": "https://power.larc.nasa.gov/api/temporal/daily/point",
            "parameters": ["T2M_MIN", "T2M_MAX", "T2M", "PRECTOTCORR", "RH2M", "WS2M", "ALLSKY_SFC_SW_DWN", "GWETROOT"],
            "period": f"{df.index[0].date()} to {df.index[-1].date()}",
            "grid": "0.5 x 0.625 degrees: the whole municipality falls in one cell",
            "point": {"lat": lat, "lon": lon},
            "cell_elevation_m": cell_elev,
            "lapse_rate_c_per_m": LAPSE,
            "week_definition": "week = (day_of_year - 1) // 7, 52 weeks, the last one absorbs the remaining days",
            "et0_method": "FAO-56 Penman-Monteith; Hargreaves (FAO-56 eq. 52) on days without radiation data",
            "et0_altitudes_m": ET0_ALTITUDES,
            "generated": time.strftime("%Y-%m-%d"),
        },
        "years": years,
        "weekly": {name: table(series, name) for name, series in weekly.items()},
        "onset": {
            "definition": f"first day from 1 October with >= {ONSET_MM:g} mm in {ONSET_DAYS} days, not followed within 30 days "
                          f"by a dry spell of {DRY_SPELL_DAYS} or more days (< {DRY_DAY_MM:g} mm/day)",
            "seasons": onset_years, "days_after_1_october": offsets,
            "mann_kendall": {"trend": test.trend, "p": round(float(test.p), 4), "slope_days_per_year": round(float(test.slope), 3)},
        },
    }
    text = json.dumps(out, separators=(",", ":"))
    for path in OUTS:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    print(f"Saved {OUTS[0].name}: {len(text) / 1024:.0f} KB, {len(years)} years")


if __name__ == "__main__":
    main()
