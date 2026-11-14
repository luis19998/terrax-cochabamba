"""Probe the GAMC WMS layers of project 04 (read-only).

Saves the legend and an overview map of each layer and samples GetFeatureInfo on a coarse grid
to learn which attributes each layer exposes. Output goes to data/raw/gamc/ (not committed).

Source: GAMC geoservices portal, https://recursosgamc.cochabamba.bo/api-doc
Usage:  python scripts/probe_gamc.py [grid_size]
"""
import json
import math
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "raw" / "gamc"
R = 6378137.0


def load_env():
    env = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def merc(lon, lat):
    return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def main():
    grid = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    env = load_env()
    cfg = json.loads((ROOT / "data" / "gamc_layers.json").read_text(encoding="utf-8"))
    url, key = env["GAMC_WMS_URL"], env["GAMC_API_KEY"]
    cov = cfg["coverage_wgs84"]
    OUT.mkdir(parents=True, exist_ok=True)
    session = requests.Session()

    minx, miny = merc(cov["min_lon"], cov["min_lat"])
    maxx, maxy = merc(cov["max_lon"], cov["max_lat"])
    width = 1000
    height = round(width * (maxy - miny) / (maxx - minx))

    for layer in cfg["layers"]:
        base = {"key": key, "service_id": layer["service_id"]}
        r = session.get(url, params={**base, "REQUEST": "GetLegendGraphic", "VERSION": "1.0.0", "FORMAT": "image/png"}, timeout=40)
        print(f"{layer['id']}: legend HTTP {r.status_code} {r.headers.get('content-type')} {len(r.content)} bytes")
        if r.ok and r.headers.get("content-type", "").startswith("image"):
            (OUT / f"legend_{layer['id']}.png").write_bytes(r.content)

        r = session.get(url, params={**base, "SERVICE": "WMS", "VERSION": "1.1.1", "REQUEST": "GetMap", "LAYERS": "",
                                     "FORMAT": "image/png", "TRANSPARENT": "false", "SRS": "EPSG:3857",
                                     "BBOX": f"{minx},{miny},{maxx},{maxy}", "WIDTH": width, "HEIGHT": height}, timeout=60)
        print(f"{layer['id']}: map HTTP {r.status_code} {r.headers.get('content-type')} {len(r.content)} bytes")
        if r.ok and r.headers.get("content-type", "").startswith("image"):
            (OUT / f"map_{layer['id']}.png").write_bytes(r.content)

        found, keys, hits = {}, set(), 0
        for i in range(grid):
            for j in range(grid):
                lon = cov["min_lon"] + (i + 0.5) * (cov["max_lon"] - cov["min_lon"]) / grid
                lat = cov["min_lat"] + (j + 0.5) * (cov["max_lat"] - cov["min_lat"]) / grid
                x, y = merc(lon, lat)
                half = 60.0
                params = {**base, "SERVICE": "WMS", "VERSION": "1.1.1", "REQUEST": "GetFeatureInfo", "LAYERS": "",
                          "SRS": "EPSG:3857", "BBOX": f"{x - half},{y - half},{x + half},{y + half}",
                          "WIDTH": 101, "HEIGHT": 101, "X": 50, "Y": 50,
                          "INFO_FORMAT": "application/json", "FEATURE_COUNT": 5}
                try:
                    r = session.get(url, params=params, timeout=40)
                    data = r.json()
                except Exception as exc:  # noqa: BLE001
                    print(f"  {layer['id']} ({lat:.4f},{lon:.4f}) error: {exc}")
                    continue
                feats = data.get("features", [])
                if feats:
                    hits += 1
                for f in feats:
                    props = f.get("properties", {})
                    keys.update(props.keys())
                    label = json.dumps(props, ensure_ascii=False, sort_keys=True)
                    found.setdefault(label, []).append([round(lat, 4), round(lon, 4)])
                time.sleep(0.05)
        (OUT / f"features_{layer['id']}.json").write_text(json.dumps(found, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{layer['id']}: {hits}/{grid * grid} sample points with features, {len(found)} distinct, keys: {sorted(keys)}")
        for label, pts in list(found.items())[:12]:
            print(f"   {len(pts):3d} pts  {label[:230]}")


if __name__ == "__main__":
    main()
