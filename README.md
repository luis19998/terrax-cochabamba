# Yatiri X

*Conocemos tu tierra, cultivamos un mejor futuro.*

Decision-support web app for smallholder farmers in the municipality of Cochabamba, Bolivia. Built for the NASA
Space Apps Challenge 2026, challenge "Field Shift: Adapting Farms with NASA Data", with the optional local focus of
the Cochabamba site ("Agrotecnología y Gestión del Agua para Agricultores").

Live beta: https://yatirix-cochabamba.netlify.app

## What it does

A landing page explains the problem (droughts, frost and overflowing canals; decisions made by habit), who it
affects, what is at risk and what can be saved, with an example computed live from NASA data. Then the farmer goes
through five steps: locate the plot (GPS, map, search or drawing its boundary), crops and soil, water, priorities,
and "Analyse my land". The results cover:

- **General state** of the plot, with a colour per domain and the first actions to take;
- **Climate and forecast:** daily and weekly probabilities of rain and frost from 31 forecast scenarios, monthly
  probabilities from 45 years of NASA POWER, recent rain and soil moisture against normal, a 45-year calendar and
  what-if sliders;
- **Soil:** pH, texture and organic carbon (SoilGrids or the farmer's lab results), likely deficiencies,
  fertiliser guidance per crop and suitability of each crop;
- **Relief:** altitude, slope, position in the landscape, erosion and waterlogging;
- **Water:** crop water need (FAO-56), how much rain covers, irrigation needed in m³ for the drawn plot, scarce months;
- **Risks** with precautions, and crops that do not suit the plot;
- **What to sow:** three three-year rotations (current, best, water-saving) with reasons, evidence, gaps and risks;
- **Pests, home-made repellents and invasive species** (general knowledge base, to be validated);
- **Legal:** what the municipality's layers say about the place and where to check ownership and water rights;
- **Profit or loss** from the farmer's own yield, price and cost, weighted by frost risk;
- **Sources** and the scoring rule.

Three views (simple, medium, advanced), Spanish and a Quechua draft, a PDF report, plots saved on the device only,
and **Tiri**, the assistant, on the web and through a WhatsApp Cloud API webhook.

When there is not enough data, the app says so instead of inventing results.

## Run it

Requires Node.js 20 or later.

```
npm install
copy .env.example .env      # then fill in the values you have
node server.mjs             # http://localhost:4173
```

Everything works without keys except the municipal map layers (`GAMC_API_KEY`). Tiri answers from fixed rules unless
`GEMINI_API_KEY` or `ANTHROPIC_API_KEY` is set.

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
| `web/` | Static web app. `js/engine.js` rotation and water engine, `js/assess.js` hazard rules, `data/knowledge.json` pests, repellents, invasive species, fertiliser and legal guidance |
| `api/` | API shared by the local server and the hosted function: plot data, probabilistic outlook, Tiri, WhatsApp webhook |
| `server.mjs` | Local server |
| `netlify/functions/api.mjs` | Hosted function serving `/api/*` |
| `data/` | Download and processing scripts; `processed/` holds the outputs |
| `docs/` | Team notes in Spanish: data sources, decisions, AI use, references, WhatsApp setup |

## API

| Route | Use |
| --- | --- |
| `POST /api/recommend` | Three strategies, weekly calendar and a three-sentence explanation |
| `GET /api/plot?lat=&lon=` | Altitude, slope, recent weather, forecast and municipal zone of a point |
| `GET /api/soil?lat=&lon=` | Soil properties from SoilGrids (slow service, may return null) |
| `GET /api/outlook?lat=&lon=` | Probabilities for the next 16 days, 2 weeks and 3 months |
| `POST /api/tiri` | Assistant: `{ question, lat, lon, history }` |
| `GET/POST /api/whatsapp` | WhatsApp Cloud API webhook |

## Data and credits

Climate: NASA POWER. Elevation and relief: NASA SRTM. Map imagery: NASA SMAP, GPM IMERG and MODIS through NASA GIBS.
Municipal layers: Gobierno Autónomo Municipal de Cochabamba. Soil: SoilGrids (ISRIC). Forecast: GFS Ensemble (NOAA)
and Open-Meteo. Base map: OpenStreetMap. Full list in `docs/referencias.md`.

The crop table, hazard thresholds, knowledge base and Quechua text are drafts that still need local validation.
The tool supports decisions; it does not replace farmers or local experts.
