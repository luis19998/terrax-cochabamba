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

## 2026-11-14, cuentas en la nube

- **Cuentas con Supabase (aprobado por el líder).** Proyecto `yatirix` en São Paulo, plan gratuito. Acceso por correo
  con enlace, sin contraseña. Es opcional: sin cuenta, los terrenos siguen solo en el dispositivo.
- **Tabla `parcels` con seguridad por fila.** Cada persona lee y cambia solo sus filas; quien no inició sesión no ve
  nada. Probado con dos usuarios de prueba dentro de una transacción que se deshizo. Migración en
  `supabase/migrations/`.
- **Sincronización.** Al entrar se juntan los terrenos del equipo y de la cuenta; si un terreno está en los dos, gana
  el guardado más reciente. Guardar y quitar se hacen en los dos lados.
- **Llave pública fuera del repositorio.** La URL y la llave publicable llegan por `/api/config` desde las variables de
  Netlify (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`). Esa llave está hecha para el navegador; los datos los protege
  la seguridad por fila.
- **Pendiente en el panel de Supabase:** Site URL y direcciones de retorno del enlace, y el límite de correos del
  servicio gratuito (pocos por hora). Ver `README.md`.

## 2026-11-14, quechua, mapa y n8n

- **Toda la web en quechua.** El botón dice «Quechua». Se traduce la página ya dibujada, así entran también los
  resultados calculados. Orden: correcciones a mano (`web/data/qu-corrections.json`), diccionario publicado
  (`web/data/qu.json`, 1.071 textos) y, si falta algo, Gemini en el servidor con memoria. Números, cultivos y meses se
  reemplazan por marcas: una traducción sirve para cualquier terreno, y cada cultivo sale con su nombre quechua
  (maíz: sara, haba: jawas). Quechua de Bolivia: se corrige solo el progresivo peruano (-sha- pasa a -chka-).
- **Límite de Gemini gratuito.** Gemini 3.5 Flash permite solo 20 consultas por día y 2.5 Flash también se agotó al
  traducir el 14 de noviembre: ese día Tiri respondió por reglas. Por eso el diccionario va en el repositorio, 296
  textos los tradujo Claude a mano y las consultas a Gemini quedan para frases nuevas. Recomendación: una clave
  aparte para traducir (`TRANSLATE_MODEL` y otra cuenta) o un plan de pago antes de la final.
- **Vista sencilla con otras palabras.** No solo esconde partes: cambia «Necesita cuidados» por «Tu terreno necesita
  cuidados», porcentajes por «casi seguro / puede pasar», «pendiente 34 %» por «muy inclinado», y Tiri responde en
  frases cortas.
- **Mapa.** Cambio entre satélite con nombres, satélite, mapa normal y relieve. El terreno se marca con un punto,
  por esquinas (con «quitar la última» y área en vivo) o con el dedo o el mouse, y las esquinas se pueden mover.
- **WhatsApp con n8n.** Yatiri X decide qué decir y a quién; n8n decide cuándo y envía desde el número dedicado:
  avisos urgentes 3 veces al día, resumen semanal los lunes, aviso de prueba y vigilancia del servicio. Cada persona
  recibe su idioma. Probado en n8n local con una API de WhatsApp simulada.

## 2026-11-15, catálogo amplio, varias parcelas y «Otro»

- **87 cultivos** (51 nuevos): raíces andinas (isaño, yacón, racacha, camote), granos (centeno, triticale, sorgo,
  cañahua), leguminosas (lenteja, garbanzo, maní, vainita, trébol), forrajes, hortalizas, aromáticas (quirquiña,
  huacataya, muña…), frutales (durazno, manzano, vid, palto…) y flores (clavel, gladiolo). Ciclo y Kc de FAO-56,
  pH y heladas de FAO ECOCROP. Frutales, aromáticas y flores van al catálogo pero no a la rotación de tres años.
- **Calor mínimo.** Los cultivos de clima cálido llevan la temperatura media que necesitan en el ciclo (ECOCROP).
  Antes el motor solo miraba la helada y recomendaba sandía a 2.600 m; ahora le baja el puntaje si el valle no llega
  a ese calor, y el catálogo lo explica.
- **Rendimiento.** Con 87 cultivos, la búsqueda de rotaciones combina solo los 22 de mejor clima para cada terreno
  (más los que la persona prefiere o ya siembra): menos de medio segundo.
- **Plagas ordenadas.** Biblioteca de 59 plagas y enfermedades con especie real, señales, prevención y remedio
  casero, asignadas a cada cultivo. Vistas: mis cultivos, catálogo completo con filtros por tipo y cultivo, 16
  especies invasoras (plantas y animales) y 12 remedios caseros. Lo que muestra cada ficha depende de la vista.
- **Varios cultivos por campaña** y **«Otro».** Si algo no está en la lista, Gemini estima ciclo, Kc, helada, pH y
  familia (`/api/crop-profile`); los valores se acotan a rangos razonables y la web los marca como estimados por IA.
- **Varias parcelas.** Cada terreno tiene su color en el mapa y se ven todos juntos. En los resultados se cambia de
  terreno arriba; lo único que muestra todos a la vez es la pestaña «Comparar» (tabla y mapa).
- **Tiri más arriba** para que el logo de Netlify no lo tape, con otra altura en teléfonos.

## 2026-11-15, animaciones y fuente

- **Fuente Plus Jakarta Sans** (licencia OFL), desde `@fontsource/plus-jakarta-sans`, copiada a `web/vendor/fonts`
  con `scripts/copy_fonts.mjs` (solo el subconjunto latino, unos 25 kB por grosor).
- **Animaciones al estilo de la web de Space Apps Cochabamba, sin librerías:** paisaje vivo en la portada (cerros en
  capas con parallax, sol, nubes y semillas flotando), logo con satélites en órbita, título palabra por palabra y con
  degradado de marca, contadores, cinta de fuentes de datos, aparición con desenfoque al bajar, tarjetas que se
  inclinan en 3D con luz, botones magnéticos, barra de progreso, transiciones entre pantallas y pestañas, y la rueda
  de rotación que se dibuja sola. Todo se detiene si el teléfono pide menos movimiento. omegle.com no se pudo
  analizar: el navegador de trabajo lo bloquea por seguridad.
- **«Vista» pasa a llamarse «Información»** (quechua: «Willakuy»).
- **Pendiente:** número de WhatsApp en Meta, `ALERTS_SECRET` en Netlify y credenciales de n8n.

## 2026-11-15, 147 cultivos y más animaciones

- **147 cultivos** (60 más): ajipa, mauka y maca; chía, linaza, girasol, canola, trigo sarraceno, mijo; pallar,
  soya, caupí; pasto sudán, cebada forrajera, pasto ovillo, trébol rojo; choclo, achojcha, hinojo, col de Bruselas,
  berro y otras hortalizas; aromáticas (albahaca, romero, toronjil, cedrón, paico…); frutales (cítricos, damasco,
  olivo, pacay, lúcuma, frambuesa, arándano, maracuyá…) y flores (rosa, crisantemo, cala, astromelia…).
- **Cultivos poco comunes en los valles** (`local: false`: trigo sarraceno, mijo, soya, sandía, kale…) quedan en el
  catálogo, pero solo entran en una rotación si el agricultor los prefiere o ya los siembra. Antes de este cambio
  el motor recomendaba «trigo sarraceno → garbanzo → mijo», posible por clima pero sin semilla ni mercado local.
- **Perennes y frutales** se evalúan una sola vez (plantación con las primeras lluvias): el cálculo completo baja de
  0,9 a 0,4 segundos con 147 cultivos.
- **Animaciones en todos los apartados:** pasos que entran según la dirección, cultivo elegido que rebota, avisos,
  listas y datos escalonados, barras que se llenan, calendario que se revela, días del pronóstico en cascada,
  filas de la comparación, tarjetas que se elevan, Tiri que se abre desde el botón y mensajes que entran.
- **Guía paso a paso** de WhatsApp y n8n: `docs/infra/guia-whatsapp-n8n.md`.
