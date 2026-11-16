# Uso de IA (declaración para la entrega)

Yatiri X usa inteligencia artificial en dos lugares distintos: **para construir** el proyecto y **dentro del
producto**. Todo lo que la IA produjo fue revisado por el equipo; los datos numéricos (clima, relieve, suelo,
pronóstico) **no** los genera la IA: vienen de NASA y de las fuentes citadas.

## 1. IA usada para construir el proyecto

| Herramienta | Para qué | Revisión humana |
| --- | --- | --- |
| **Claude Code** (Anthropic, modelos Claude Opus) | Escribir el código: web, motor de rotación y balance hídrico, API, scripts de datos NASA, animaciones, flujos de n8n, documentación | El equipo probó cada función en el navegador y con scripts de prueba (`scripts/try_*.mjs`) |
| **Claude Code** | Redactar la base de conocimiento (plagas, abono, especies invasoras, remedios) y la tabla de 147 cultivos con valores de referencia FAO-56 y FAO ECOCROP | Marcada como borrador para validar con INIAF y SENASAG (`needs_validation`) |
| **Claude Code** | Corregir a mano 299 textos en quechua (`web/data/qu-corrections.json`) | Pendiente de revisión por hablantes de quechua |
| **Google Gemini** (gemini-3.5-flash, gemini-2.5-flash, gemini-3.1-flash-lite) | Traducción automática al quechua del resto de la interfaz (`web/data/qu.json`, 1.844 textos) | Borrador; se corrigen formas peruanas automáticamente y a mano |

## 2. IA dentro del producto (lo que ve el usuario)

| Función | Modelo | Qué hace | Límites |
| --- | --- | --- | --- |
| **Tiri**, la asistente (web y WhatsApp) | Gemini 2.5 Flash; respaldo Claude Haiku 5.5; sin clave, reglas fijas | Redacta respuestas en castellano o quechua **usando solo los datos calculados de la parcela** | No inventa cifras ni dosis de agroquímicos; la web marca cada respuesta como «redactada con IA» o «automática» |
| **«Otro» cultivo** | Gemini | Estima ciclo, coeficientes de agua (Kc), helada, pH y familia de un cultivo que no está en la lista | Valores acotados a rangos razonables; la web los marca con la etiqueta **IA** y pide verificar con un técnico |
| **Traducción al quechua** | Gemini (en el servidor) | Traduce textos nuevos que no están en el diccionario | Se guarda la traducción; el diccionario revisado tiene prioridad |
| **Tiri agente** (solo Yatiri X Global) | Gemini con llamadas a funciones | Consulta herramientas reales (análisis del lugar, pronóstico, ficha del cultivo, buscar un lugar) y puede mover la web: abrir una pestaña, volar el planeta a un lugar, empezar un análisis, cambiar idioma o nivel de información | Las cifras salen de las herramientas, no del modelo; sin cuota responde el motor de reglas |
| **Tiri proactiva** (Yatiri X Global) | Sin IA: reglas sobre los datos | Habla primero tras cada análisis (riesgo principal, semana que viene, días para sembrar) y vigila los terrenos guardados (helada o lluvia fuerte en 48 h) | Textos armados con los datos calculados |
| **13 idiomas** (Yatiri X Global) | Gemini (en el servidor) | Traduce la web completa a aimara, guaraní, inglés, portugués, francés, alemán, italiano, suajili, hindi, chino y árabe; inglés y portugués van pre-generados (`global/web/data/en.json`, `pt.json`) | Borrador automático; aimara y guaraní necesitan revisión de hablantes |

## 3. Lo que NO hace la IA

- Los datos de clima, lluvia, heladas, relieve y suelo vienen de **NASA POWER, NASA SRTM, NASA SMAP, GPM IMERG,
  MODIS, SoilGrids, Open-Meteo/GFS** y del **GAMC**, procesados con fórmulas (FAO-56 Penman-Monteith, conteos de
  años y escenarios). No los produce un modelo de lenguaje.
- El puntaje de las rotaciones lo calcula un motor determinista (`web/js/engine.js`), no la IA.
- No hay imágenes, videos ni audios generados por IA: las fotos son reales (Wikimedia Commons, con autor y
  licencia) y el logo es el oficial del equipo.

## 4. Registro

| Fecha | Herramienta | Para qué |
| --- | --- | --- |
| 2026-11-14 | Claude Code | Instalación de herramientas, lectura del reto y del portal del GAMC, scripts NASA POWER y SRTM, motor, servidor e interfaz |
| 2026-11-14 | Claude Code | Yatiri X: portada, pasos, pronóstico probabilístico, base de conocimiento, relieve 3D, Tiri, WhatsApp (código) |
| 2026-11-14 | Gemini / Claude Haiku | Tiri dentro del producto |
| 2026-11-14 | Claude Code | Cuentas con Supabase, quechua en toda la web, modos de mapa, flujos de n8n |
| 2026-11-15 | Claude Code y Gemini | 147 cultivos, catálogo de plagas, «Otro» cultivo con Gemini, varias parcelas y comparación, animaciones, fuente Plus Jakarta Sans |
| 2026-11-15 | Claude Code | Flujo de n8n por Gmail, documentación de entrega |
| 2026-11-15 | Claude Code | Yatiri X Global: satélites detallados, nubes, Luna y secreto lunar, relieve 3D con cauces y cuenca, suelo 3D con raíces, agua y minerales probables |
| 2026-11-15 | Claude Code y Gemini | Yatiri X Global: planeta 3D, clima NASA POWER para cualquier punto, Tiri con avatar, voz y agente, 13 idiomas, reloj climático, crecimiento del cultivo y escenas del tiempo |
