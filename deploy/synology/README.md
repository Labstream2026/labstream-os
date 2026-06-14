# Conectar correo y calendario de Synology

Todo está gateado por variables de entorno: sin ellas la app funciona igual, solo
que las funciones de correo/calendario quedan "Sin configurar" (lo ves en
Configuración → Integraciones).

Edita `/volume1/docker/labstream-os/.env` en el NAS y luego recrea el contenedor:

    cd /volume1/docker/labstream-os
    sudo docker compose -p labstream-os up -d --no-deps --force-recreate app

## Correo (Synology MailPlus, SMTP)
Necesitas un buzón del equipo en MailPlus (p. ej. `no-reply@labstreamsas.com` o el
de un miembro). En DSM → MailPlus Server están el host y los puertos.

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

## Verificar
- **Correo:** Configuración → Integraciones → "Activo" + botón de prueba funciona.
- **Calendario:** crea una cita desde una tabla de proyecto (columna tipo EVENT) y
  revisa que aparezca en el Synology Calendar.
