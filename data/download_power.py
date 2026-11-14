"""Download NASA POWER daily data for the Cochabamba municipality (one request, saved to disk).

Dataset:    NASA POWER (Prediction Of Worldwide Energy Resources), community AG, daily, point API
Parameters: T2M_MIN, T2M_MAX, T2M (deg C), PRECTOTCORR (mm/day), RH2M (%), WS2M (m/s),
            ALLSKY_SFC_SW_DWN (MJ/m2/day), GWETTOP, GWETROOT (0-1)
Period:     1981-01-01 to 2025-12-31
Resolution: meteorology on the MERRA-2 grid, 0.5 x 0.625 degrees. The whole municipality falls in one cell
            (centre -17.5, -66.25), so one download covers every district; altitude is corrected afterwards.
Source:     https://power.larc.nasa.gov/api/temporal/daily/point
Docs:       https://power.larc.nasa.gov/docs/services/api/temporal/daily/

POWER may block clients that repeat the same query: this script never downloads a file that already exists.
Usage:  python data/download_power.py
"""
import json
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "power"
API = "https://power.larc.nasa.gov/api/temporal/daily/point"
PARAMETERS = "T2M_MIN,T2M_MAX,T2M,PRECTOTCORR,RH2M,WS2M,ALLSKY_SFC_SW_DWN,GWETTOP,GWETROOT"
# Reference point inside the municipality (Cercado). Any point of the municipality returns the same cell.
POINT = {"id": "cochabamba_cercado", "lat": -17.3895, "lon": -66.1568}
START, END = "19810101", "20251231"


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    out = RAW / f"power_daily_{POINT['id']}_{START}_{END}.json"
    if out.exists():
        print(f"Already downloaded, reading from disk: {out.name} ({out.stat().st_size / 1e6:.1f} MB)")
        return 0
    params = {"parameters": PARAMETERS, "community": "AG", "latitude": POINT["lat"], "longitude": POINT["lon"],
              "start": START, "end": END, "format": "JSON"}
    t0 = time.time()
    r = requests.get(API, params=params, timeout=300)
    print(f"HTTP {r.status_code} in {time.time() - t0:.1f} s, {len(r.content) / 1e6:.1f} MB")
    r.raise_for_status()
    data = r.json()
    days = len(data["properties"]["parameter"]["T2M_MIN"])
    print(f"days: {days} | cell elevation: {data['geometry']['coordinates'][2]} m | fill value: {data['header']['fill_value']}")
    out.write_text(json.dumps(data), encoding="utf-8")
    print(f"Saved {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
