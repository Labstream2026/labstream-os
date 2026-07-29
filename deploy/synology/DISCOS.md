# Conectar los discos: Operaciones_LAB y la galería de LabTem

La app puede leer Y ESCRIBIR en dos discos montados dentro del contenedor:

- **Operaciones_LAB** (`/volume5` del NAS de producción) → explorador `/operaciones`, carpeta
  por proyecto, subidas de Archivos directas a la share (`kind OPS`).
- **Entregas_LAB** (LabTem, el segundo NAS, `192.168.0.223`) → la galería `/galeria`, carpeta
  por CLIENTE con subcarpeta por proyecto, entregables que apuntan a archivos del disco
  (`kind GALERIA`) y sala del cliente con enlace firmado.

Todo está gateado: sin variable el módulo no aparece; sin el permiso `escribir_discos` nadie
escribe; sin el **centinela** (abajo) la galería queda en solo lectura aunque el montaje sea rw.

## 0 · ANTES DE NADA: sacar los respaldos de Operaciones_LAB

Los backups viven hoy DENTRO de la share (`Backups_LabstreamOS`) y cada `.tar.gz` lleva el
`.env` de producción. Montada la share en la app, cualquiera del equipo los vería. La app los
esconde y bloquea por código, pero la corrección real es moverlos:

    sudo mkdir -p /volume5/backups-labstream
    sudo mv /volume5/Operaciones_LAB/Backups_LabstreamOS/* /volume5/backups-labstream/ 2>/dev/null
    sudo rmdir /volume5/Operaciones_LAB/Backups_LabstreamOS

Y actualizar la copia real del script de backup en el NAS con el `BACKUP_DEST` nuevo
(`deploy/backup-nas.sh` de este repo ya lo trae). Corre un backup a mano y comprueba que
aterriza en la carpeta nueva ANTES de seguir.

## 1 · Montar LabTem en el NAS de producción (NFS **soft**)

Docker solo monta rutas del host, así que son dos montajes encadenados: LabTem→producción por
NFS, y esa ruta→contenedor por bind.

**En LabTem (DSM):** Panel de control → Servicios de archivos → NFS → activar. En la carpeta
compartida `Entregas_LAB` → Permisos NFS → añadir regla para la IP del NAS de producción
(`192.168.0.22`), lectura/escritura, y **squash: asignar todos los usuarios a admin** (es lo
que hace que el UID 1001 del contenedor pueda escribir sin pelear con los permisos del equipo).

**En producción:** NO montar con File Station (monta en duro: si LabTem se apaga, cada lectura
se queda COLGADA y congela la app entera, no solo la galería). Tarea programada de DSM
(«Activada al arrancar», usuario root):

    mkdir -p /volume1/entregas-labtem
    mount -t nfs -o soft,timeo=100,retrans=3,nolock,noatime,vers=4.1 \
      192.168.0.223:/volume1/Entregas_LAB /volume1/entregas-labtem

Con `soft`, si LabTem muere la operación devuelve error a los ~30 s y la app lo cuenta con un
mensaje claro en vez de congelarse. Ejecuta la tarea una vez a mano y comprueba:

    ls /volume1/entregas-labtem

## 2 · El centinela de escritura

En la RAÍZ de la share, creado desde LabTem (o por SMB):

    touch "/volume1/Entregas_LAB/.labstream-escritura"

Es lo único que separa «disco real montado» de «el montaje se cayó y esto es la carpeta local
vacía de debajo»: sin él, la app no escribe ni un byte (y los botones salen apagados con el
motivo). En Operaciones no hace falta: es un volumen local, no se «cae».

## 3 · Papelera e instantáneas (la red de seguridad)

En las DOS shares (Operaciones_LAB en producción, Entregas_LAB en LabTem):

- Panel de control → Carpeta compartida → editar → **activar la papelera de reciclaje**.
  «Borrar» desde la app = mover a `#recycle` — solo es reversible si la papelera existe.
- Snapshot Replication → instantáneas programadas (diaria, retener 7). **Ninguna copia de
  seguridad cubre estos discos** (`backup-nas.sh` solo respalda la BD y `data/storage`); las
  instantáneas son la única marcha atrás ante un estropicio por SMB o por la app.

## 4 · El override de compose (sobrevive a los deploys)

El deploy (`claude-job.sh`) SOBREESCRIBE `docker-compose.yml` en cada corrida, pero no toca
`docker-compose.override.yml` (comprobado en producción). Ahí viven los montajes. Deja este
contenido EXACTO en `/volume1/docker/labstream-os/docker-compose.override.yml` — reemplaza el
override actual, que monta la galería en `:ro`:

    services:
      app:
        environment:
          NAS_GALERIA_DIR: /entregas
          NAS_OPS_DIR: /nas/operaciones
        volumes:
          - /volume1/entregas-labtem:/entregas
          - /volume5/Operaciones_LAB:/nas/operaciones

(Si prefieres arrancar prudente: deja `:ro` al final de la línea de Operaciones el primer día
y quítalo cuando el equipo tenga los permisos afinados. La galería necesita rw para que
funcione subir/crear carpetas; su freno es el centinela + el permiso.)

## 5 · Recrear el contenedor (la primera vez, a la fuerza)

    cd /volume1/docker/labstream-os
    sudo docker compose -p labstream-os config | grep -A6 "volumes:" | head -12   # deben salir los 3 montajes
    sudo docker compose -p labstream-os up -d --force-recreate app

(`up -d` a secas NO recrea por un cambio de solo-volúmenes; es la misma trampa de siempre.)

Comprobación desde adentro:

    sudo docker compose -p labstream-os exec app sh -c \
      'ls -ld "$NAS_GALERIA_DIR" "$NAS_OPS_DIR"; touch "$NAS_GALERIA_DIR/.prueba" && echo "galeria ESCRIBE" && rm "$NAS_GALERIA_DIR/.prueba"'

## 6 · Después del deploy

1. Abrir **/ajustes** una vez: ahí corre el backfill que le da `escribir_discos` a los roles
   que ya podían subir archivos. Sin ese paso, los botones de escribir no le salen a nadie.
2. En **/galeria**: entrar a una carpeta → «Vincular a cliente» → elegirlo. Las subidas de ese
   cliente y las subcarpetas de sus proyectos cuelgan de ahí.
3. El generador de copias ligeras corre EN LABTEM: `deploy/labtem/genera-proxies.sh`
   (instrucciones dentro del script). Sin él, los videos salen como «preparando» y la
   reproducción rápida por iGPU no existe.

## Riesgo conocido que queda abierto

`claude-job.sh` lanza las migraciones en un contenedor que HEREDA estos montajes. Con NFS
**soft** el peor caso es un error a los ~30 s (no un cuelgue), pero si algún día el deploy se
queda pegado con LabTem apagado: desmonta (`umount -f /volume1/entregas-labtem`), corre el
deploy, y vuelve a montar.
