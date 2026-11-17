# Yatiri X Global

La segunda versión de Yatiri X: la misma herramienta, pero para **cualquier lugar del planeta**.

- En línea: https://yatirix-global.netlify.app
- Versión original (Cochabamba): https://yatirix-cochabamba.netlify.app

## Qué añade a la versión de Cochabamba

| Área | Novedad |
| --- | --- |
| Alcance | Clima de 45 años de **NASA POWER** calculado en el navegador para el punto exacto que eliges (ET0 FAO-56, heladas, inicio de lluvias según el hemisferio). Altitud mundial con Open Topo Data. Los datos municipales (GAMC) siguen solo en Cochabamba. |
| Planeta 3D | La Tierra con relieve exagerable, día y noche según la posición real del Sol, luces de ciudades, nubes, atmósfera, satélites Terra, GPM y SMAP en órbita, franjas climáticas en color, relieves notables con nombre y capas NASA GIBS (color real, lluvia IMERG, temperatura, vegetación, humedad SMAP). Mientras carga, pasan fotos reales de cultivos, plagas y climas. |
| Tiri | Avatar animado (piensa, habla, alerta, celebra), burbuja que habla primero, **voz** (lectura en voz alta y micrófono), agente con herramientas reales que puede mover la web, resumen proactivo tras cada análisis, vigilancia de terrenos guardados con avisos del navegador y consejos por pestaña. |
| Idiomas | 13: castellano, quechua, aimara, guaraní, inglés, portugués, francés, alemán, italiano, suajili, hindi, chino y árabe (de derecha a izquierda). Inglés y portugués van pre-generados; el resto se traduce al vuelo y queda guardado. |
| Planeta, más detalle | Satélites Terra, GPM y SMAP modelados con paneles solares, antenas, la antena giratoria de SMAP y luces; toca uno para ver qué mide. Nubes con interruptor y sombras sobre el suelo, línea del amanecer, brillo del océano. La Luna en órbita con sus mares y cráteres en su posición real (textura ilustrativa). Y un secreto que lleva a la Luna, con bandera incluida: pista, pregúntale a Tiri. |
| Relieve 3D | Bloque de 2,3 km: cauces de lluvia y cuenca de tu terreno calculados con el relieve, ríos, canales y lagunas de OpenStreetMap, agua animada, vistas de satélite, altura con curvas de nivel y pendiente, simulación de agua estancada y, en los costados, capas del suelo con el agua subterránea moviéndose (esquema). |
| Suelo 3D | Corte de 2 m con las 6 profundidades de SoilGrids, raíces del próximo cultivo (FAO-56), lluvia infiltrándose según la textura, nivel freático ilustrativo y minerales probables según pH y textura. |
| Cochabamba y Bolivia | Pestaña exclusiva: zona agroecológica de Cochabamba (Valle Central, Valle Bajo, Valle Alto, Cono Sur, zona andina, trópico), datos del GAMC dentro de su municipio, cifras del departamento con su fuente, cultivos nativos con fotos, calendario agrícola andino con fiestas, riesgo de salinidad con calculadora de sodio (modelo del Valle Alto), geología y minería, y leyes bolivianas (1715, 3545, 144, 2878, 300, 071, 338, 3525, 1333; seguro MINKA). Carga con la kantuta que florece, banderas de Cochabamba y Bolivia ondeando y fotos reales de Cochabamba. |
| Visualización | Reloj climático radial (lluvia, heladas, semanas secas y ciclo de los cultivos), crecimiento del próximo cultivo semana a semana, escenas animadas del tiempo por día, modo de alto contraste. |

## Cómo correrla

```bash
cd global
node server.mjs
```

Abre http://localhost:4173 (o el puerto de `PORT`). Necesita `global/.env` con `GEMINI_API_KEY` para Tiri y las
traducciones; sin clave, Tiri responde con reglas y la web queda en castellano y quechua.

Diccionario de un idioma nuevo, pre-generado:

```bash
node scripts/build_lang.mjs en pt
```

## Uso de IA

Ver `../docs/uso-de-ia.md`. Las cifras (clima, relieve, suelo, pronóstico) vienen de NASA y las fuentes citadas,
no de un modelo de lenguaje.
