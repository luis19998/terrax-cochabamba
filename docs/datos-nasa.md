# Datos de NASA y otras fuentes

Cada número que muestra la web sale de una de estas fuentes. Fecha de lectura: 14 de noviembre de 2026.

## En uso

| Fuente | Parámetros | Periodo | Resolución | Para qué | Límites |
| --- | --- | --- | --- | --- | --- |
| NASA POWER, comunidad AG, API diaria por punto | `T2M_MIN`, `T2M_MAX`, `T2M`, `PRECTOTCORR`, `RH2M`, `WS2M`, `ALLSKY_SFC_SW_DWN`, `GWETROOT` | 1981-01-01 a 2025-12-31 (16.436 días) | 0,5 × 0,625 grados; todo el municipio cae en una celda de 3.126 m de altitud media | Helada, semana seca, lluvia y evapotranspiración por semana | La celda suaviza las heladas de fondo de valle. La radiación falta en 1.095 días anteriores a 1984 |
| NASA SRTM de 30 m, vía Open Topo Data (`srtm30m`) | Altitud | — | Malla de 40 × 40 puntos sobre el municipio (2.541 a 4.013 m) | Ajustar la temperatura a la altitud de la parcela | La malla tiene un punto cada 540 m aproximadamente |

Corrección por altitud: `T_sitio = T_power + 0,0065 × (altitud_celda − altitud_sitio)`.

Evapotranspiración de referencia: Penman-Monteith de FAO-56 con los datos de POWER; en los días sin radiación se
usa Hargreaves (FAO-56, ecuación 52). Se calcula a 2.550 m y a 3.400 m y se interpola.

Resultados de control del proceso (`data/process_power.py`): lluvia media anual de 480 mm (mínimo 294, máximo 1.209);
evapotranspiración media anual de 1.690 mm a 2.550 m y 1.322 mm a 3.400 m; inicio de lluvias sin tendencia
(Mann-Kendall, p = 0,586).

## Fuentes que no son de NASA

| Fuente | Uso |
| --- | --- |
| Geoservicios del GAMC, proyecto 04 (WMS): Periurbanos, Drenaje e Influencia, Límite Distritos | Capas del mapa y ficha de la parcela (distrito, comuna, zona periurbana) |
| Open-Meteo | Pronóstico de 16 días: lluvia, temperatura mínima y evapotranspiración |
| OpenStreetMap | Mapa base |

## Pendiente

| Fuente | Estado |
| --- | --- |
| SMAP (humedad de suelo) | No integrada. Hace falta cuenta de NASA Earthdata. Por ahora se usa `GWETROOT` de POWER |
| GPM IMERG (lluvia) | No integrada. El parámetro `IMERG_PRECTOT` de POWER devolvió −999 para Cochabamba. Hace falta Earthdata |
| MODIS NDVI | No integrada. Opción rápida: capa de NASA GIBS en el mapa |
| SoilGrids (suelo) | La API respondió con pH de 6,3 y 6,7 en dos puntos rurales y sin valor en zonas urbanas. No entra aún en el puntaje |
