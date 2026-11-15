# Decisiones

Este archivo solo crece por el final.

## 2026-11-14

- **Sin hardware.** El sensor ESP32 se descarta por tiempo. Decide: líder.
- **Enfoque municipal.** El producto trabaja sobre el municipio de Cochabamba con las tres capas del GAMC del
  proyecto 04 (Periurbanos, Drenaje e Influencia, Límite Distritos). Los puntos de ejemplo son del Distrito 9 y del
  Distrito 13, comprobados con esas capas.
- **Una sola celda de clima.** Todo el municipio cae en una celda de NASA POWER. La diferencia entre parcelas sale
  de la altitud (NASA SRTM).
- **Propuesta para D1 y D4, por confirmar con el equipo.** El motor de rotación está en JavaScript
  (`web/js/engine.js`) y corre igual en el navegador y en el servidor. La web es estática y no necesita compilación.
  `server.mjs` sirve la web y la API. Python queda solo para preparar los datos. Motivo: en 12 horas es la forma más
  corta de tener una demo que no depende de nada en vivo.
- **Tres estrategias.** El reto pide comparar al menos tres rotaciones, incluida la actual. Se muestran la actual,
  la de mejor puntaje y una que pide menos riego.
- **Puntaje.** Clima 45, rotación 30, suelo 10 y prioridades 15. La rotación vale 70 % por cómo sigue cada cultivo
  al anterior y 30 % por variedad de familias. El suelo queda en valor neutro hasta tener datos de la parcela.
- **Tabla de cultivos sin validar.** `web/data/crops.json` lleva `needs_validation: true`. El rol de datos debe
  contrastar ciclos, umbrales de helada, coeficientes Kc y rangos de pH con FAO-56, ECOCROP e INIAF.
- **Clave del GAMC fuera del navegador.** Va en `.env` y la añade el servidor (`/api/gamc/wms`).
- **Pronóstico con Open-Meteo.** Es la fuente abierta complementaria que pide el enfoque local. Se cita aparte de NASA.

## 2026-11-14, tarde

- **Nombre.** El producto se llama Terrax y la asistente, Terra. Decide: líder.
- **Terra siempre disponible.** Responde por reglas con los datos de la parcela. Si el servidor tiene
  `ANTHROPIC_API_KEY`, Claude redacta la respuesta con los mismos datos; si el modelo falla, vuelve a las reglas.
- **IA en la nube, no local.** Un modelo local exige una PC encendida y un túnel; la web pública corre en funciones
  sin servidor. El modelo local queda como respaldo sin conexión para la demo.
- **WhatsApp directo.** `/api/whatsapp` atiende el webhook de Meta sin pasar por n8n. Pasos en `docs/infra/whatsapp.md`.
- **Solo lo que tiene dato.** Suelo, clima reciente y pendiente se ocultan si la fuente no responde. No se muestran
  propiedad de la tierra, precios, plagas ni especies invasoras porque no hay una fuente oficial integrada.
- **Ganancia con números del agricultor.** La calculadora usa el rendimiento, el precio y el costo que escribe la
  persona, y el riesgo de helada del motor.
- **SoilGrids lento.** El 14 de noviembre tardó entre 43 y más de 60 segundos por consulta. La web espera 8 segundos
  y sigue sin suelo. Pendiente: precalcular el suelo de una malla del municipio.
- **Gemini como motor de Terra.** Si hay `GEMINI_API_KEY`, Terra redacta con Gemini (API REST de Google); si no, con
  Claude; si no hay ninguna, por reglas. El modelo se elige solo (el `flash` más nuevo) salvo que se fije `GEMINI_MODEL`.

## 2026-11-14, noche

- **Nombre: Yatiri X, asistente Tiri.** Colores oficiales: verde pistache y café. Lema: «conocemos tu tierra,
  cultivamos un mejor futuro». Decide: líder.
- **Web principal con portada.** Explica el problema, a quién afecta, qué se arriesga y qué se ahorra, con un ejemplo
  calculado en vivo con datos de la NASA. Después, cinco pasos: ubicación, cultivo y suelo, agua, prioridades, análisis.
- **Tres vistas.** Sencilla (estado con colores y lo principal), media (explicaciones) y avanzada (tablas, rangos,
  nombres científicos y descarga de datos en JSON).
- **Español y quechua.** El quechua es un borrador de la interfaz: lo debe revisar un hablante. Los textos
  calculados siguen en español.
- **Pronóstico probabilístico.** Días y semanas: 31 escenarios del GFS Ensemble (NOAA) vía Open-Meteo, comparados
  con lo normal de NASA POWER. Meses: frecuencias de 45 años de NASA POWER. El modelo estacional crudo se descartó:
  el 14 de noviembre daba de 3 a 4 veces la lluvia normal de diciembre y no hay climatología propia para corregirlo.
- **Imágenes de NASA en el mapa.** SMAP (humedad del suelo), GPM IMERG (lluvia) y MODIS (verdor) vía NASA GIBS, sin
  cuenta de Earthdata. Son capas visuales: los números de humedad siguen viniendo de NASA POWER.
- **Plagas, repelentes, especies invasoras, abono y legal.** Base de conocimiento general en
  `web/data/knowledge.json`, marcada como borrador para validar con SENASAG e INIAF. En lo legal, solo lo que dice el
  GAMC del lugar y dónde verificar: no hay registros oficiales de propiedad.
- **Datos del usuario solo en su dispositivo.** Los terrenos se guardan en el navegador (localStorage), sin servidor.
- **Informe PDF con la impresión del navegador.** Muestra todas las secciones abiertas.
- **La clave de Gemini recibida no funciona.** Google la rechazó con 401 (por cabecera, por parámetro y como token).
  Tiri sigue respondiendo con reglas hasta tener una clave válida.

## 2026-11-14, madrugada del domingo

- **Gemini resuelto.** La clave anterior estaba revocada o era inválida: las dos nuevas (formato `AQ.`) responden con
  `gemini-2.5-flash` por la cabecera `x-goog-api-key`. El código no tenía el error: usaba la cabecera correcta y no
  validaba el prefijo. Si un modelo da 404, Tiri pasa a `gemini-2.5-flash`.
- **Logo oficial y menú de AgroVision.** Portada y resultados siguen la distribución de seis tarjetas: ubicación,
  suelo, clima y pronóstico, relieve y topografía, humedad y agua, predicciones, más «Comenzar análisis». El resto
  (riesgos, qué sembrar, plagas, legal, ganancias, fuentes) va como pestañas secundarias.
- **Imágenes reales.** Mapa y vista del terreno con Esri World Imagery; fotos de cultivos, plagas y especies invasoras
  de Wikimedia Commons, con autor y licencia de cada una (`scripts/fetch_images.mjs`).
- **Relieve en 3D.** Elevación de las teselas Terrarium de AWS Open Data (basadas en SRTM, píxel de unos 9 m) con la
  imagen satelital encima, en 2,3 km alrededor del terreno, con three.js. Las teselas pasan por `/api/terrain` porque
  el origen no permite leerlas desde el navegador. Se carga solo al pulsar «Ver el relieve en 3D».

## 2026-11-15, mañana

- **35 cultivos.** Se agregaron tubérculos andinos, granos, leguminosas, hortalizas y frutilla. Las rotaciones de tres
  años usan solo cultivos de 90 días o más (y perennes o descanso); las hortalizas de ciclo corto aparecen en el
  catálogo «Todas las siembras» para intercalar.
- **Aptitud con agua limitada.** Con riego pero agua solo algunos meses o escasa, un cultivo que pide mucho riego pasa
  a «con cuidados».
- **Qué hacer y qué no.** Lista por terreno armada con los riesgos, los cultivos que no convienen y buenas prácticas.
- **Íconos propios con sombreado** en lugar de emojis, y una planta que crece mientras se analiza.
- **Datos del usuario.** Siguen solo en el dispositivo, con copia en archivo para pasarlos a otro equipo. Cuentas en
  la nube: propuesta de Supabase (acceso por correo o teléfono y tabla protegida por usuario), pendiente de aprobación.
- **Avisos por WhatsApp con el número boliviano del equipo.** ALERTAS suscribe, BAJA borra. Suscripciones en Netlify
  Blobs. Envío diario a las 18:00 de Bolivia con una plantilla aprobada por Meta. Pasos en `docs/infra/whatsapp.md`.
