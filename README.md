# Terrax

Decision-support tool for crop rotation, irrigation water and land risks in the peri-urban farmland of
Cochabamba, Bolivia, with an assistant called Terra. Built for the NASA Space Apps Challenge 2026, challenge
"Field Shift: Adapting Farms with NASA Data", with the optional local focus of the Cochabamba site.

Live beta: https://terrax-cochabamba.netlify.app

A farmer taps a plot on the map and gets:

- three rotation strategies for the next three years (the current one, the best-scoring one and a water-saving
  one), each with the reasons, the supporting data, the information gaps and the risks to review with a technician;
- the hazards of the plot: frost, water shortage, waterlogging, erosion and landslides, with what to do about each;
- the crops that do not suit the plot, soil advice when soil data exists, and recent weather against the normal;
- the crop water balance, a 7 and 14 day forecast and a week-by-week risk calendar;
- a profit calculator that uses the farmer's own yield, price and cost;
- Terra, an assistant that answers from the plot data, on the web and through a WhatsApp webhook.

Sections without data behind them are hidden rather than filled in.

## Run it

Requires Node.js 20 or later.

```
npm install
copy .env.example .env      # then fill in the values you have
node server.mjs             # http://localhost:4173
```

Everything works without keys except the municipal map layers (`GAMC_API_KEY`). Terra answers from fixed rules
unless `ANTHROPIC_API_KEY` is set, in which case Claude writes the answer from the same data.

## Rebuild the data

Requires Python 3.12 with pandas, numpy, requests and pymannkendall.

```
python data/download_power.py       # NASA POWER daily, 1981-2025 (one request, saved to data/raw/)
python data/download_srtm_grid.py   # NASA SRTM elevation grid of the municipality
python data/process_power.py        # weekly dataset used by the web app
```

## Layout

| Path | Content |
| --- | --- |
| `web/` | Static web app. `js/engine.js` is the rotation and water engine, `js/assess.js` the hazard rules |
| `api/` | API shared by the local server and the hosted function: plot data, Terra, WhatsApp webhook |
| `server.mjs` | Local server |
| `netlify/functions/api.mjs` | Hosted function serving `/api/*` |
| `data/` | Download and processing scripts; `processed/` holds the outputs |
| `docs/` | Team notes in Spanish: data sources, decisions, AI use, references, WhatsApp setup |

## API

| Route | Use |
| --- | --- |
| `POST /api/recommend` | Three strategies, weekly calendar and a three-sentence explanation |
| `GET /api/plot?lat=&lon=` | Altitude, slope, recent weather, forecast and municipal zone of a point |
| `POST /api/terra` | Assistant: `{ question, lat, lon, history }` |
| `GET/POST /api/whatsapp` | WhatsApp Cloud API webhook |

## Data and credits

Climate: NASA POWER. Elevation and slope: NASA SRTM. Municipal layers: Gobierno Autónomo Municipal de Cochabamba.
Soil: SoilGrids (ISRIC). Forecast: Open-Meteo. Base map: OpenStreetMap. Full list in `docs/referencias.md`.

The crop table and the hazard thresholds are general starting values that still need local agronomic validation.
The tool supports decisions; it does not replace farmers or local experts.
