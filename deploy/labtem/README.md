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

## Cómo se entra a LabTem

**SSH en el puerto 20**, no el 22 (está así configurado en DSM). Dos IPs, la misma máquina:
`192.168.0.223` (la que usa el montaje NFS de producción) y `192.168.0.40`.

```bash
ssh -p 20 -i ~/.ssh/editorias_nas Labstream@192.168.0.40
```

## Qué hace falta en LabTem (verificado EN LA MÁQUINA el 30-jul-2026)

| Pieza | Por qué |
|---|---|
| **Container Manager** | corre el contenedor (Docker 24.0.2) |
| **SynoCli Video Drivers** | expone `/dev/dri/renderD128` **y trae el driver iHD de Intel** — ver abajo, es la pieza que falta cuando «no funciona la GPU» |
| **FFmpeg de SynoCommunity** | trae los parches de jellyfin (VAAPI/QSV). Hay tres instalados (`ffmpeg` 4.4, `ffmpeg5`, `ffmpeg6`) y **los tres** traen `h264_qsv`, `libx264`, `mjpeg` y `libwebp`. Se usa el 6 por velocidad |
| **Carpeta compartida `Entregas_LAB`** en el volumen 5 | los 7 TB |

Medido aquí, 300 fotogramas de 1080p: **ffmpeg6 por QSV 109 fps · ffmpeg5 por QSV 81 fps**.
La ventaja real de la GPU no es la velocidad bruta sino que **deja la CPU libre** para servir
archivos mientras transcodifica.

### Qué va por GPU y qué no (medido en la máquina, 30-jul-2026)

| Pieza | Por GPU | Ahorro de CPU |
|---|---|---|
| copia `.mp4` | decodifica **y** codifica | −90 % |
| escalera `.hls` | una decodificación, tres escalados | +77 % de tiempo sobre el mp4 solo |
| **tira `.sprite.jpg`** | decodifica y escala | **−94 %** ← la más cara de todas |
| póster `.poster.jpg` | decodifica y escala | −48 % (poco: el `-ss` ya salta el archivo) |
| foto `.webp` | **no, y no hay manera** | — |

La **tira** era, sin que nadie lo mirara, la pieza más cara de la fábrica: para repartir 20
fotogramas a lo largo del video hay que **recorrerlo entero** (`fps=` descarta casi todo, pero
para descartarlo hay que decodificarlo). Sobre un vertical de 50 min: **948 s de CPU por
software contra 56 s por GPU**. Era eso lo que disparaba el monitor de DSM al 66 % «sin usar la
GPU» — la copia ya iba por GPU; la tira no.

Trabajo completo (mp4 + póster + tira) sobre el mismo archivo, antes y después:
**25,2 s → 12,2 s de CPU (−51 %)**, con el mismo tiempo de reloj.

**Las fotos no tienen GPU posible y no es un fallo de configuración:** no existe codificador
WebP por hardware —el formato no está en ningún motor de vídeo, ni de Intel ni de nadie— y el
mosaico propietario de un RAW tampoco lo decodifica la GPU. Da igual: una foto se despacha en
menos de un segundo, mientras que un video son minutos.

Comprobar la GPU antes de nada:

```bash
ls -l /dev/dri && grep '^videodriver:' /etc/group
```

Tiene que salir `renderD128` (grupo `videodriver`, GID **937**).

## La receta de la GPU dentro de Docker (esto es lo que cuesta)

El ffmpeg de Synology **no arranca tal cual** en `debian:12-slim`, y los dos errores que da no
mencionan ni la GPU ni la pieza que falta:

1. `libdrm.so.2: cannot open shared object file` → libdrm existe en DSM pero no en Debian, y el
   paquete `ffmpeg6` **no la trae**. Está en `synocli-videodriver` (y en el paquete `ffmpeg` 4.4).
2. `Failed to initialise VAAPI connection: -1 (unknown libva error)` → ya arranca, pero libva
   busca los drivers en una carpeta `dri/` que aquí **no existe**: el `iHD_drv_video.so` está
   **suelto** en `synocli-videodriver/target/lib/`.

Por eso el compose monta **dos** carpetas y fija tres variables:

```yaml
volumes:
  - /var/packages/ffmpeg6/target:/opt/ffmpeg:ro
  - /var/packages/synocli-videodriver/target:/opt/vd:ro
environment:
  LD_LIBRARY_PATH: /opt/ffmpeg/lib:/opt/vd/lib
  LIBVA_DRIVERS_PATH: /opt/vd/lib
  LIBVA_DRIVER_NAME: iHD
```

Prueba de que la GPU codifica **desde el contenedor** (es la que vale; la del host puede pasar
y la de dentro fallar):

```bash
docker exec labtem-proxies sh -c '/opt/ffmpeg/bin/ffmpeg -hide_banner -v error \
  -init_hw_device qsv=hw:/dev/dri/renderD128 -filter_hw_device hw \
  -f lavfi -i testsrc=size=1920x1080:rate=30:duration=5 \
  -vf "format=nv12,hwupload=extra_hw_frames=64" -c:v h264_qsv -f null -' && echo GPU-OK
```

## Montarlo

Instalado el 30-jul-2026 en **`/volume5/docker/labtem-proxies/`** por SSH:

```bash
mkdir -p /volume5/docker/labtem-proxies/estado
# copiar compose.yaml y hacer-proxies.sh ahí
cd /volume5/docker/labtem-proxies && docker compose up -d
```

> ⚠️ **Fuera de `Entregas_LAB` a propósito.** Ese share lo sincroniza **Synology Drive** desde un
> PC externo: una fábrica plantada dentro (en `.labstream/`) fue **revertida por el sync** en
> cuestión de horas, script y respaldo incluidos. En `/volume5/docker/` el sync no llega.

> Si se prefiere por interfaz: **Container Manager → Proyecto → Crear**, nunca por el asistente
> de contenedor — ese ignora `devices:` y `group_add:` **en silencio**, y el ffmpeg de dentro se
> queda sin GPU pareciendo sano.

## Por qué el contenedor está dormido y no «corriendo un servicio»

No es un servicio: es una caja de herramientas. Si arrancara, trabajara y saliera, el Proyecto
quedaría en «detenido» y Container Manager lo reiniciaría en bucle. Duerme, y la tarea programada
de DSM le grita cada noche.

Instalado el 30-jul-2026 como línea en `/etc/crontab` (respaldo previo en
`/etc/crontab.bak-claude-20260730`), a las **3:00 cada día**:

```
0	3	*	*	*	root	/usr/local/bin/docker exec labtem-proxies /opt/hacer-proxies.sh
```

> Los campos van separados por **TAB**, no por espacios: DSM no lee la línea si son espacios.
> Tras editar: `synoservice --restart crond`.
>
> Si algún día DSM regenera `/etc/crontab` (pasa al crear o editar tareas desde el Programador)
> la línea se pierde. Recrearla ahí mismo es equivalente: **Programador de tareas → Crear →
> Tarea programada → Script definido por usuario**, usuario `root`, con ese mismo comando.

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
- **El compose monta `hacer-proxies.sh` como archivo suelto, y eso va por inodo.** Sustituirlo
  con `mv` (o con cualquier escritura atómica) deja al contenedor viendo **el viejo para
  siempre**, aunque en el host se vea el nuevo. Hay que copiarlo **en el sitio** (`cat >` o
  `cp -f`, que truncan y reescriben el mismo inodo).
  Y con una pasada en marcha, **ni eso**: bash lee el guion a medida que lo ejecuta, así que
  reescribirlo en caliente le desplaza los bytes bajo los pies y acaba ejecutando basura.
  Se instala **entre pasadas**, o se espera a la línea `Fin en` del registro.
- **Los RAW de cámara no los abre ningún ffmpeg** (ARW de Sony, CR2/CR3, NEF, RAF…): cada
  fabricante comprime el sensor a su manera y el error que da —«Invalid data found»— parece un
  archivo corrupto. Pero **todos llevan dentro un JPEG de vista previa**, a menudo a resolución
  completa (los ARW de aquí, a 4240×2832), y de ahí sale la copia. Se localiza por sus marcas
  `FF D8 FF` / `FF D9`; ojo, que esas parejas de bytes **también salen por casualidad entre los
  datos del sensor**, así que hay que probar los candidatos de mayor a menor y dejar que
  ffprobe confirme cuál es una imagen de verdad.
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

**Antes de culpar a la fábrica, mira el tamaño del original.** En la revisión del 30-jul-2026,
los 69 fallos anotados eran, sin excepción, archivos que la fábrica no podía procesar porque no
había nada que procesar:

- **62** eran ficheros vacíos que Synology Drive dejó en las carpetas de un cliente y que el
  propio sync borró unas horas después (quedaron sus 186 marcas `.fallo` —tres por archivo— y
  ni un solo proxy).
- **6** eran subidas por SMB cortadas a medias: **0 bytes** en disco.
- **1** era un `.mov` de 68 MB con el índice a medio escribir (`moov atom not found`): en
  QuickTime el índice va **al final**, así que una grabación o una copia interrumpida deja el
  vídeo entero pero ilegible.

O sea: `ffprobe no reconoce el archivo` casi nunca significa «códec raro». Significa «aquí no
hay vídeo». Compruébalo con `stat -c %s`.

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
