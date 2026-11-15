# Ficha de entrega · NASA Space Apps Challenge 2026 · Cochabamba

Textos listos para copiar en el formulario de entrega.

**Nombre del proyecto:** Yatiri X

**Lema:** Conocemos tu tierra, cultivamos un mejor futuro.

**Demo en vivo:** https://yatirix-cochabamba.netlify.app

**Repositorio:** https://github.com/luis19998/yatirix-cochabamba

## Resumen (corto)

Yatiri X es una plataforma web, en castellano y quechua, que ayuda a las familias productoras de los valles y zonas
periurbanas de Cochabamba a decidir qué sembrar, cuándo y con cuánta agua. Combina 45 años de clima de NASA POWER,
el relieve de NASA SRTM, imágenes de SMAP, GPM IMERG y MODIS, las capas del Gobierno Autónomo Municipal de
Cochabamba y un pronóstico probabilístico de 31 escenarios, para recomendar rotaciones de tres años, avisar de
heladas y lluvias fuertes y mostrar riesgos, plagas y cuidados de 147 cultivos.

## Descripción (larga)

**Problema.** En los valles de Cochabamba se elige qué sembrar y cuándo regar por costumbre, pero las lluvias son
cada vez más irregulares: llueven unos 480 mm al año mientras la evaporación pide más del triple, el agua de riego no
alcanza en los meses críticos y los canales se desbordan en época de lluvias. Repetir el mismo cultivo agota el
suelo y aumenta las plagas.

**Solución.** La persona marca su terreno en el mapa (un punto, por esquinas o con el dedo), cuenta qué sembró (uno o
varios cultivos, o «Otro» que la IA analiza) y qué agua tiene. Yatiri X calcula:

- **Qué sembrar:** tres rotaciones de tres años (la actual, la recomendada y la que ahorra agua) con puntaje
  explicado: clima, rotación, suelo y prioridades.
- **Cuándo:** la mejor semana de siembra de cada cultivo según el riesgo de helada y el agua de lluvia de 45 años.
- **Cuánta agua:** necesidad del cultivo (FAO-56 Penman-Monteith y coeficientes Kc), cuánto cubre la lluvia y cuánto
  hay que regar.
- **Predicciones:** probabilidad de lluvia, helada y lluvia fuerte en los próximos días, semanas y meses.
- **Riesgos:** heladas, sequía, anegamiento y erosión, con qué hacer y qué no hacer.
- **Plagas, cuidados y especies invasoras** (64 plagas y enfermedades, 16 invasoras, 12 remedios caseros).
- **Relieve en 3D**, comparación entre varias parcelas, informe en PDF y la asistente **Tiri**.

**Para quién.** Familias productoras, asociaciones de regantes y el municipio. Tres niveles de información
(sencilla, media, avanzada) y quechua para que la usen quienes leen poco o prefieren su idioma.

**Enfoque local.** Usa las capas oficiales del GAMC (zonas periurbanas, drenaje e influencia, distritos) para cada
parcela del municipio.

## Datos de NASA y de otras agencias

| Fuente | Uso |
| --- | --- |
| NASA POWER (diario 1981–2025: temperatura, lluvia, radiación, viento, humedad) | Clima de 45 años, heladas, evapotranspiración, calendario de siembra |
| NASA SRTM (elevación 30 m) | Altitud, pendiente, posición en el relieve, ajuste de temperatura, vista 3D |
| NASA SMAP L4 (humedad del suelo) vía NASA GIBS | Capa del mapa |
| NASA GPM IMERG (lluvia) vía NASA GIBS | Capa del mapa |
| NASA MODIS Terra NDVI (verdor) vía NASA GIBS | Capa del mapa |
| NOAA GFS Ensemble (31 escenarios) vía Open-Meteo | Pronóstico probabilístico de 16 días |
| ISRIC SoilGrids | pH, textura y carbono del suelo |
| GAMC Cochabamba (WMS) | Zonas periurbanas, drenaje, distritos |
| FAO-56 y FAO ECOCROP | Coeficientes de cultivo, ciclos, pH y temperaturas |

## Uso de inteligencia artificial

Ver `docs/uso-de-ia.md`. En resumen: el código y la base de conocimiento se escribieron con ayuda de **Claude
Code** (Anthropic) y fueron probados por el equipo; dentro del producto, **Gemini** (respaldo Claude Haiku) redacta
las respuestas de Tiri con los datos calculados, estima los valores de un cultivo «Otro» y traduce al quechua. Los
datos de clima, relieve y suelo **no** los genera la IA. No hay imágenes generadas por IA.

## Tecnologías

HTML, CSS y JavaScript sin compilación; Leaflet; three.js; Node.js; Netlify (web, funciones y tareas programadas);
Supabase (cuentas opcionales); n8n (automatizaciones); Gemini API.

## Estado y lo que falta

- Funciona en vivo: análisis, mapa, 3D, quechua, cuentas, Tiri en la web, comparación de parcelas.
- WhatsApp: código listo y probado con mensajes simulados; falta registrar el número en Meta
  (`docs/infra/guia-whatsapp-n8n.md`).
- n8n: boletín diario por Gmail listo para importar (`n8n/workflows/5-boletin-gmail.json`).
- Validación pendiente: valores de cultivos con INIAF, plagas con SENASAG, quechua con hablantes.
