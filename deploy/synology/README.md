# Conectar correo y calendario de Synology

Todo está gateado por variables de entorno: sin ellas la app funciona igual, solo
que las funciones de correo/calendario quedan "Sin configurar" (lo ves en
Configuración → Integraciones).

Edita `/volume1/docker/labstream-os/.env` en el NAS y luego recrea el contenedor:

    cd /volume1/docker/labstream-os
    sudo docker compose -p labstream-os up -d --no-deps --force-recreate app

## Correo — RECOMENDADO: Resend (API HTTP, puerto 443)
Si el ISP/NAS bloquea los puertos SMTP de salida (25/465/587), usa Resend: envía por
HTTPS (443), que nunca está bloqueado. No requiere abrir puertos.

1. Crea una cuenta en https://resend.com y **verifica un dominio** (p. ej.
   `labstreamsas.com`): Resend te da los registros **SPF/DKIM** (TXT/CNAME) para
   añadir en el DNS del dominio (en Squarespace, donde está el DNS de labstreamsas.com).
2. Crea una **API key** (Settings → API Keys).
3. En el `.env` del NAS (`/volume1/docker/labstream-os/.env`):

       RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
       RESEND_FROM=Labstream <no-reply@labstreamsas.com>   # el remitente DEBE ser del dominio verificado

4. Recrea la app y prueba: **Configuración → Integraciones → Enviar prueba**.

> Mientras el dominio no esté verificado, Resend solo deja enviar desde su dominio de
> pruebas `onboarding@resend.dev` y solo a tu propio correo de la cuenta. Para enviar
> a clientes/equipo, verifica `labstreamsas.com` (SPF/DKIM) primero.

Si `RESEND_API_KEY` está puesto, la app usa Resend y **ignora** la config SMTP de abajo.

## Correo — alternativa: SMTP (Synology MailPlus o relay externo)
Necesitas un buzón del equipo en MailPlus (p. ej. `no-reply@labstreamsas.com` o el
de un miembro). En DSM → MailPlus Server están el host y los puertos. También sirve
para un relay externo (SendGrid/Brevo/Mailjet); con relay usa el puerto **2525** si
587 está bloqueado, y deja `SMTP_TLS_REJECT_UNAUTHORIZED=true`.

    SMTP_HOST=mail.labstreamsas.com        # host del servidor de correo del NAS
    SMTP_PORT=587                          # 587 (STARTTLS) o 465 (SSL)
    SMTP_SECURE=false                      # true solo si usas 465
    SMTP_USER=no-reply@labstreamsas.com    # buzón que autentica/envía
    SMTP_PASSWORD=la-contraseña-del-buzón
    SMTP_FROM=Labstream <no-reply@labstreamsas.com>
    # Si el correo del NAS tiene cert auto-firmado y la prueba falla con error de
    # certificado, pon esto en false:
    SMTP_TLS_REJECT_UNAUTHORIZED=true

Tras configurarlo, en la app: **Configuración → Integraciones → Enviar prueba**.
Te debe llegar un correo de prueba a tu propio buzón.

> Nota: los correos que la app manda a clientes usan el buzón del miembro que lo
> envía como remitente (From) cuando es posible; si MailPlus no permite enviar en
> nombre de otro buzón, saldrán siempre desde `SMTP_USER`/`SMTP_FROM`.

## Calendario (Synology Calendar, CalDAV)
Sincroniza automáticamente las citas internas del equipo (las creadas en las
tablas de proyectos) al Synology Calendar. La URL es la de la colección de
calendario del NAS (en Synology Calendar → ajustes de CalDAV verás algo como
`https://nas.labstreamsas.com:PUERTO/caldav/<usuario>/<id-calendario>/`).

    CALDAV_URL=https://nas.labstreamsas.com:5006/caldav/equipo/personal/
    CALDAV_USER=usuario-del-calendario
    CALDAV_PASSWORD=la-contraseña
    # Si el NAS tiene cert auto-firmado y la prueba CalDAV falla por certificado:
    CALDAV_INSECURE_TLS=true

Verifica la conexión en Configuración → Integraciones → Calendario → "Probar".

> Los **clientes** nunca reciben citas automáticas. Solo cuando el equipo lo pide
> explícitamente (acción "Invitar cliente"), se les envía un `.ics` por correo que
> ellos deciden agregar a su propio calendario.

## Google Drive (videos de revisión) — MUY recomendado

La sala de revisión reproduce los videos de Drive **desde el propio servidor** (es lo
único que permite guardar el segundo exacto y la captura del fotograma en cada
corrección). Para leerlos, el servidor entra a Drive de una de dos formas:

- **Sin credencial (por defecto):** solo llega a los archivos compartidos como
  «Cualquiera con el enlace», y Google impone un tope de descargas **diario y por
  archivo**. El video que más revisa el equipo es el primero que se bloquea — y ahí la
  sala se queda sin segundo y sin captura hasta el día siguiente.
- **Con cuenta de servicio:** el cupo pasa al proyecto de Google Cloud (inalcanzable a
  esta escala) y además se leen los archivos compartidos con el correo de la cuenta,
  sin tener que hacerlos públicos.

Se crea una cuenta de servicio en Google Cloud con la API de Drive habilitada y permiso
de **solo lectura**, y se pega su clave JSON (tal cual, o en base64 si prefieres una
sola línea):

    GOOGLE_SERVICE_ACCOUNT_JSON=

Comparte con el correo de esa cuenta (`...@....iam.gserviceaccount.com`) las carpetas de
Drive donde el equipo deja los masters.

**Verificar:** al arrancar, el log lo confirma una sola vez —

    sudo docker compose -p labstream-os logs app | grep google-auth
    # [google-auth] cuenta de servicio activa: <correo de la cuenta>

Si no aparece esa línea, la app está en modo anónimo. Y si en la sala de revisión un
video no carga, la tarjeta del reproductor dice el motivo real (no es público, cupo
agotado, copia en camino o formato) — no hay que adivinar.

## Verificar
- **Correo:** Configuración → Integraciones → "Activo" + botón de prueba funciona.
- **Calendario:** crea una cita desde una tabla de proyecto (columna tipo EVENT) y
  revisa que aparezca en el Synology Calendar.
- **Drive:** ver el `grep google-auth` de arriba; y en Ajustes → Mantenimiento, la
  «Copia local de los videos de revisión» debe ir creciendo a medida que se revisa.
