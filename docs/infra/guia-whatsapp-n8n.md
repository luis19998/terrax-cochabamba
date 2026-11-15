# Guía paso a paso: WhatsApp con el número del equipo y los avisos con n8n

Tiempo total: 1 a 2 horas, más la espera de aprobación de Meta (de minutos a un día). Hazla en este orden: cada
parte usa algo de la anterior. Cuando veas **«Anota»**, guarda el dato en un lugar privado (nunca en el chat del
grupo ni en GitHub).

Qué vas a lograr:

- La gente escribe al número boliviano y **Tiri responde** (en castellano o quechua).
- Quien escribe **ALERTAS** (o **WILLAWAY**) recibe **avisos de helada y lluvia fuerte** y un **resumen cada lunes**,
  enviados por **n8n** desde ese número.

---

## Parte A. Preparar el chip (5 minutos)

1. Pon el chip boliviano en un teléfono con señal. Debe poder recibir SMS o llamadas.
2. Ese número **no puede tener WhatsApp ni WhatsApp Business activo**. Si ya lo usaste: abre WhatsApp en ese
   teléfono → *Ajustes → Cuenta → Eliminar cuenta*. Espera 5 minutos.

## Parte B. Crear la app en Meta (20 minutos)

1. Entra a **https://developers.facebook.com** con una cuenta de Facebook del equipo y acepta ser desarrollador.
2. Arriba: **Mis apps → Crear app**. Tipo de uso: **Otro** → tipo de app **Empresa (Business)**. Nombre:
   `Yatiri X`. Si te pide un portafolio comercial, crea uno con el nombre del equipo.
3. En el panel de la app, busca el producto **WhatsApp** y pulsa **Configurar**.
4. Ve a **WhatsApp → Configuración de la API (API Setup)** → **Agregar número de teléfono**:
   - Nombre visible: `Yatiri X`
   - Categoría: Agricultura (o Educación)
   - Número: **+591** y los 8 dígitos del chip
   - Verificación por **SMS** → escribe el código que llega al teléfono.
5. **Anota el «Identificador del número de teléfono» (Phone number ID)** que aparece junto al número.
   Es un número largo; no es el teléfono.

## Parte C. Token permanente (15 minutos)

El token que aparece en *API Setup* vence en 24 horas. Para uno que no vence:

1. Entra a **https://business.facebook.com** → **Configuración** (engranaje) → **Usuarios → Usuarios del sistema**.
2. **Agregar** → nombre `yatirix-bot`, rol **Administrador**.
3. Con ese usuario elegido: **Asignar activos** → **Apps** → `Yatiri X` → control total. Repite con
   **Cuentas de WhatsApp** → la cuenta creada → control total.
4. **Generar token** → app `Yatiri X` → caducidad **Nunca** → marca los permisos
   `whatsapp_business_messaging` y `whatsapp_business_management` → Generar.
5. **Anota el token** (empieza con `EAA…`). Solo se muestra una vez.

## Parte D. Plantilla de avisos (5 minutos + espera de aprobación)

WhatsApp solo deja que una empresa escriba primero usando plantillas aprobadas.

1. **https://business.facebook.com/wa/manage/message-templates** → **Crear plantilla**.
2. Categoría **Utilidad**, nombre `aviso_terreno`, idioma **Español**.
3. Cuerpo, exactamente:

   > Aviso de Yatiri X para tu terreno: {{1}}

4. En el ejemplo de `{{1}}` escribe: `posible helada esta noche: 6 de cada 10 escenarios bajan de 0 °C; cubre los almácigos`.
5. **Enviar**. Espera el estado **Aprobada** (de minutos a un día). Meta no tiene plantillas en quechua: el texto
   en quechua viaja dentro de esta misma plantilla.

## Parte E. Variables en Netlify (10 minutos)

1. **https://app.netlify.com** → proyecto **yatirix-cochabamba** → **Site configuration → Environment variables →
   Add a variable**.
2. Crea una por una (marca *Contains secret values* en las secretas):

   | Variable | Valor | ¿Secreta? |
   | --- | --- | --- |
   | `WHATSAPP_TOKEN` | el token de la Parte C | sí |
   | `WHATSAPP_PHONE_NUMBER_ID` | el ID de la Parte B | no |
   | `WHATSAPP_VERIFY_TOKEN` | una frase inventada, sin espacios, por ejemplo `yatirix-cbba-2026-xyz` | sí |
   | `WHATSAPP_PUBLIC_NUMBER` | `591` + los 8 dígitos (solo números) | no |
   | `WHATSAPP_ALERT_TEMPLATE` | `aviso_terreno` (cuando esté aprobada) | no |
   | `ALERTS_SECRET` | el valor de `ALERTS_SECRET_PRODUCCION` del archivo `C:\Users\luisc\Documents\field-shift\.env` | sí |
   | `WHATSAPP_APP_SECRET` | opcional: Meta → tu app → *Configuración → Básica → Clave secreta de la app* | sí |

3. **Vuelve a publicar** el sitio para que tome las variables: *Deploys → Trigger deploy → Deploy site* (o pídele a
   Claude que lo publique).
4. Comprueba: abre `https://yatirix-cochabamba.netlify.app/api/health`. Debe decir `"whatsapp":true` y mostrar tu
   número en `"whatsapp_number"`.

## Parte F. Conectar Meta con la web (webhook) (5 minutos)

1. Meta → tu app → **WhatsApp → Configuración (Configuration)** → **Webhook → Editar**:
   - URL de devolución de llamada: `https://yatirix-cochabamba.netlify.app/api/whatsapp`
   - Token de verificación: la frase de `WHATSAPP_VERIFY_TOKEN`
   - **Verificar y guardar**. Si falla, revisa que redeployaste en la Parte E.
2. En **Campos del webhook**, **suscríbete a `messages`**.
3. **Prueba:** desde otro celular escribe «hola» al número. Tiri debe responder pidiendo la ubicación. Escribe
   `Distrito 9`, luego `ALERTAS`. Con eso quedas suscrito.

Hasta aquí ya funcionan Tiri por WhatsApp y los avisos diarios de las 18:00 enviados por Netlify. Las partes G a I
pasan los envíos a n8n para controlar horarios y agregar flujos sin tocar código.

## Parte G. Abrir n8n (5 minutos)

- **En esta PC (para la demo):** abre una terminal y ejecuta `npx n8n`. Abre http://localhost:5678 y crea tu
  usuario la primera vez.
- **En la PC servidor (RTX 4090):** con Docker, como explica `SERVIDOR.md`, para que quede encendido siempre.

## Parte H. Importar los flujos y poner las credenciales (15 minutos)

1. En n8n: **Overview → Create → Import from file**. Importa uno por uno los archivos de
   `C:\Users\luisc\Documents\field-shift\n8n\workflows\`:
   `1-avisos-urgentes.json`, `2-resumen-semanal.json`, `3-aviso-de-prueba.json`, `4-vigilancia.json`.
2. Crea las credenciales: **Overview → Credentials → Create credential → Header Auth**:

   | Nombre de la credencial | Name | Value |
   | --- | --- | --- |
   | `Yatiri X: clave de avisos (x-alerts-secret)` | `x-alerts-secret` | el mismo valor de `ALERTS_SECRET` |
   | `WhatsApp Cloud API: token (Authorization)` | `Authorization` | `Bearer ` + el token de la Parte C (con espacio después de Bearer) |

3. Abre cada flujo y haz **doble clic** en cada nodo con triángulo rojo. En **Credential for Header Auth** elige:
   - **Pedir mensajes a Yatiri X** y **Marcar enviados** → la clave de avisos.
   - **Enviar por WhatsApp**, **Avisar falla al equipo** y **Avisar al equipo** → el token de WhatsApp.
4. En el nodo **Configuración** de cada flujo:
   - `phone_number_id`: el ID de la Parte B.
   - `team_phone`: un celular del equipo (`591…`, solo números) para recibir avisos de fallas. Ese celular debe
     haber escrito al número en las últimas 24 horas.
5. Pulsa **Save** en cada flujo.

## Parte I. Probar y activar (10 minutos)

1. Abre **Yatiri X · Aviso de prueba (demo)** → **Execute workflow** (o «Probar ahora»).
   - Si nadie está suscrito, se detiene en «Separar mensajes»: es normal. Suscríbete primero (Parte F, paso 3).
   - Si está bien, cada suscrito recibe «Prueba de aviso de Yatiri X…» en su idioma.
2. Activa los flujos **1, 2 y 4** con el interruptor **Active** (arriba a la derecha). El 3 se usa a mano en la demo.
3. Cuando n8n quede encendido de forma estable en el servidor, agrega en Netlify la variable `ALERTS_SENDER` con
   valor `n8n` y vuelve a publicar. Desde ahí, Netlify deja de enviar a las 18:00 y lo hace n8n (7:00, 12:00 y
   17:00, y el resumen de los lunes).

## Si algo falla

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| n8n: «Credentials not found» | El nodo no tiene credencial elegida | Parte H, paso 3 |
| n8n: «Clave de avisos incorrecta» (403) | `ALERTS_SECRET` distinto en Netlify y en n8n, o falta redeploy | Copia el mismo valor y vuelve a publicar |
| Meta no verifica el webhook | `WHATSAPP_VERIFY_TOKEN` distinto o sin redeploy | Revisa la variable y publica de nuevo |
| Tiri no responde por WhatsApp | No te suscribiste a `messages` o el token venció | Parte F, paso 2; usa el token permanente |
| Los avisos no llegan a quien no escribió hace poco | La plantilla no está aprobada o falta `WHATSAPP_ALERT_TEMPLATE` | Parte D y Parte E |
| `/api/health` dice `"whatsapp":false` | Faltan `WHATSAPP_TOKEN` o `WHATSAPP_PHONE_NUMBER_ID` | Parte E y redeploy |

Reglas que el sistema ya respeta: solo escribe a quien envió ALERTAS o WILLAWAY; BAJA borra todo; un mensaje por
segundo; un aviso urgente por persona por día. Revisa en la página de precios de WhatsApp Business la tarifa vigente
para Bolivia antes de enviar a muchas personas.
