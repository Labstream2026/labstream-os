# LabTem · la fábrica de copias ligeras

Esto no se despliega con `claude-job.sh`: **vive en el segundo NAS (LabTem), no en producción**, y
se monta a mano una sola vez desde Container Manager. Aquí está el paso a paso y, sobre todo, las
tres o cuatro cosas que si se hacen «como parece lógico» no funcionan.

## Qué hace

LabTem guarda los **originales** de las entregas en `/volume5/Entregas_LAB`. De madrugada, este
contenedor recorre ese material y deja al lado de cada pieza, en una carpeta hermana `.proxy/`, lo
que el cliente verá desde el navegador:

```
Cliente X/Entrega mayo/toma.mxf  →  .proxy/toma.mxf.mp4          copia para reproducir
                                    .proxy/toma.mxf.poster.jpg   fotograma de la cuadrícula
                                    .proxy/toma.mxf.sprite.jpg   tira para el barrido con el ratón
Cliente X/Entrega mayo/foto.dng  →  .proxy/foto.dng.webp         copia que el navegador sí pinta
```

**Nunca se transcodifica al vuelo.** Cuando el cliente abre su sala, el trabajo pesado ya está
hecho: la app solo sirve archivos. Los nombres no son negociables — son exactamente los que calcula
`src/lib/nas-galeria.ts` (`proxyRelFor` / `posterRelFor`). Si cambian ahí, hay que cambiarlos aquí.

## Qué hace falta en LabTem (ya está, verificado el 28-jul-2026)

| Pieza | Por qué |
|---|---|
| **Container Manager** | corre el contenedor |
| **SynoCli Video Drivers** | es el paquete que expone `/dev/dri` en este DSM |
| **FFmpeg 5 de SynoCommunity** | trae los parches de jellyfin-ffmpeg (VAAPI/QSV). El contenedor **no instala ffmpeg**: monta el del NAS |
| **Carpeta compartida `Entregas_LAB`** en el volumen 5 | los 7 TB libres |

Comprobar la GPU antes de nada:

```bash
ls -l /dev/dri && /var/packages/ffmpeg5/target/bin/ffmpeg -hwaccels
```

Tiene que salir `renderD128` y, entre los hwaccels, `qsv`.

## Montarlo (Container Manager)

1. Copia `compose.yaml` y `hacer-proxies.sh` a una carpeta de LabTem, por ejemplo
   `/volume5/docker/labtem-proxies/`.
2. **Container Manager → Proyecto → Crear**, apuntando a esa carpeta.
3. Levántalo. El contenedor se queda dormido (`sleep infinity`) — es lo esperado, ver abajo.

> **Por la vía «Proyecto», no por el asistente de contenedor.** Container Manager solo respeta
> `devices:` y `group_add:` cuando el contenedor nace de un compose. Creado con el asistente los
> ignora **en silencio**: el contenedor arranca, parece sano, y el ffmpeg de dentro no ve la GPU.

## Por qué el contenedor está dormido y no «corriendo un servicio»

No es un servicio: es una caja de herramientas. Si arrancara, trabajara y saliera, el Proyecto
quedaría en «detenido» y Container Manager lo reiniciaría en bucle. Duerme, y la tarea programada
de DSM le grita cada noche.

**Programador de tareas → Crear → Tarea programada → Script definido por usuario** (usuario `root`,
de madrugada):

```bash
docker exec labtem-proxies /opt/hacer-proxies.sh
```

Pasadas manuales útiles:

```bash
docker exec -e LIMITE=3 labtem-proxies /opt/hacer-proxies.sh
```

```bash
docker exec labtem-proxies /opt/hacer-proxies.sh "Cliente X/Entrega mayo"
```

## Las trampas que ya costaron tiempo

- **QSV necesita NV12.** La cadena correcta es `-vf format=nv12,hwupload=extra_hw_frames=64`, en ese
  orden. Con `hwupload,format=qsv` el auto-escalador elige BGRA 4:4:4, que la Gen9.5 no sabe
  codificar en AVC, y el error que devuelve (`some encoding parameters are not supported`) no dice
  nada de eso.
- **`/dev/dri/renderD128` es `root:videodriver` con permisos 660.** Quien transcodifique tiene que
  ser root o estar en ese grupo. En el NAS el GID de `videodriver` es **937**, y por eso el compose
  lleva `group_add: 937`. Un usuario normal falla con `No VA display found` — que parece un problema
  de hardware y es de permisos.
- **`getent` no existe en DSM** (BusyBox). Para comprobar el GID: `grep videodriver /etc/group`.
- **No actualizar los paquetes del NAS.** Actualizar FFmpeg puede llevarse por delante la
  aceleración por hardware. Si algo se rompe: reparar o reinstalar la MISMA versión.

## Cómo saber si va bien

El script es **idempotente**: si la copia ya existe y es más nueva que el original, ni abre el
archivo. Una segunda pasada sobre material sin cambios tarda minutos, no horas. También es
**atómico** (escribe en un temporal y renombra, así que la app nunca ve media copia) y **no se
muere**: un archivo que falla se anota y sigue.

Deja dos marcas en `ESTADO` (`/volume5/docker/labtem-proxies/estado`):

- `.fallo` — este ffmpeg no supo abrirlo (un R3D, un HEIC raro). No se reintenta hasta que el
  original cambie; para forzarlo, `REINTENTAR_FALLOS=1`.
- `.omitido` — se decidió saltarlo a propósito.

Sin esas marcas, cada noche se volverían a intentar (y a fallar) los mismos archivos durante horas.

## Cómo llega esto a la app

LabTem **nunca se expone a internet**. Producción (192.168.0.22) monta `Entregas_LAB` por NFS en
**solo lectura**, y la app sirve la galería por su propio origen:

```bash
sudo mount -t nfs -o ro,nolock,vers=3 192.168.0.223:/volume5/Entregas_LAB /volume1/entregas-labtem
```

El montaje **no sobrevive al reinicio** (en Synology DSM reescribe `/etc/fstab`): hay que fijarlo con
una tarea de arranque **en el NAS de producción**, no en LabTem. Es el error fácil — compruébalo con
`hostname`, tiene que decir `Labstream`.

La sección `/galeria` de la app solo aparece si existe la variable `NAS_GALERIA_DIR` apuntando a ese
montaje. Sin ella, la app se comporta como si LabTem no existiera.
