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
