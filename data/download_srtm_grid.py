"""Download a grid of SRTM elevations covering the Cochabamba municipality.

Dataset:    NASA SRTM (Shuttle Radar Topography Mission), 1 arc-second (~30 m) global
Access:     Open Topo Data public API, dataset srtm30m (https://www.opentopodata.org/datasets/srtm/)
            Limits of the public API: 100 locations per request, 1 request per second, 1000 requests per day.
Use:        altitude of any plot inside the municipality, to correct NASA POWER temperature by height.
Output:     data/processed/srtm_grid.json (regular grid, row 0 = southern edge)
Usage:      python data/download_srtm_grid.py [points_per_side]
"""
import json
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "processed" / "srtm_grid.json"
API = "https://api.opentopodata.org/v1/srtm30m"


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 40
    cov = json.loads((ROOT / "data" / "gamc_layers.json").read_text(encoding="utf-8"))["coverage_wgs84"]
    lats = [cov["min_lat"] + i * (cov["max_lat"] - cov["min_lat"]) / (n - 1) for i in range(n)]
    lons = [cov["min_lon"] + j * (cov["max_lon"] - cov["min_lon"]) / (n - 1) for j in range(n)]
    points = [(la, lo) for la in lats for lo in lons]
    elev = []
    for k in range(0, len(points), 100):
        chunk = points[k:k + 100]
        locs = "|".join(f"{la:.5f},{lo:.5f}" for la, lo in chunk)
        for attempt in range(3):
            r = requests.get(API, params={"locations": locs}, timeout=60)
            if r.status_code == 200:
                break
            print(f"  request {k // 100 + 1}: HTTP {r.status_code}, retrying")
            time.sleep(3)
        r.raise_for_status()
        results = r.json()["results"]
        elev.extend(round(x["elevation"]) if x["elevation"] is not None else None for x in results)
        print(f"  request {k // 100 + 1}/{(len(points) + 99) // 100}: {len(results)} points")
        time.sleep(1.1)
    valid = [e for e in elev if e is not None]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "source": "NASA SRTM 30 m via Open Topo Data (dataset srtm30m)",
        "downloaded": time.strftime("%Y-%m-%d"),
        "min_lat": cov["min_lat"], "max_lat": cov["max_lat"], "min_lon": cov["min_lon"], "max_lon": cov["max_lon"],
        "n_lat": n, "n_lon": n, "order": "row-major, row 0 is the southern edge, column 0 is the western edge",
        "elevation_m": elev,
    }), encoding="utf-8")
    print(f"Saved {OUT.name}: {len(elev)} points, elevation {min(valid)}-{max(valid)} m")


if __name__ == "__main__":
    main()
