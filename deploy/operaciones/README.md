# Operaciones_LAB · encender la segunda GPU

> **Esto ya no hace falta para ver los fotogramas.** Desde el 30-jul-2026 la app lleva ffmpeg
> dentro y saca el fotograma de cada vídeo por CPU, una sola vez, guardándolo en su caché
> (`src/lib/video-poster.ts`). Medido en esta máquina: **0,17–0,67 s por archivo**, incluso con
> uno de 9 GB, porque el salto es por keyframe.
>
> Y hay un motivo más fuerte para no intentarlo: **este NAS corre el kernel `4.4.302+` de la
> plataforma `broadwellnk_sa3600`, que no trae el módulo `i915`.** La UHD 630 aparece en el bus
> PCI (`00:02.0 CometLake-S GT2`) pero no hay driver que la maneje: `broadwellnk` es un perfil
> de Xeon D, una CPU sin gráficos integrados. Instalar los paquetes de abajo **probablemente no
> creará `/dev/dri`**. LabTem sí funciona porque corre `epyc7002_sa6400` con kernel `5.10.55+`,
> que sí trae `i915` — la diferencia es la plataforma de DSM, no un paquete.
>
> Lo que queda por debajo se conserva por si algún día se migra la plataforma, y porque
> documenta la receta de la GPU, que costó encontrar.

Encender la GPU seguiría teniendo un sentido: la CPU dejaría de gastarse en esto y la fábrica
podría hacer además copias ligeras y tiras de barrido, como la de LabTem.

Esto **no** se despliega con `claude-job.sh`. Se monta a mano una vez, como la fábrica de
LabTem, y después trabaja sola.

## Lo que se comprobó en la máquina (30-jul-2026)

| | |
|---|---|
| CPU | `Intel(R) Core(TM) i5-10400` · 12 hilos |
| GPU integrada | **UHD Graphics 630** (el i5-10400 la lleva; la variante «F» no) |
| `/dev/dri` | **no existe** — el módulo `i915` no está cargado |
| Grupo `videodriver` | existe (GID **937**) pero **vacío** |
| Paquetes de vídeo | **ninguno** instalado |
| `ffmpeg` en el contenedor de la app | **no** |

Es decir: el hardware está, el software no. Por eso `/api/ops/thumb` solo sabe hacer
miniaturas de imágenes — `sharp` no abre vídeo.

## Paso 1 — instalar dos paquetes (esto lo haces tú, desde DSM)

Ambos son de **SynoCommunity**. Si la fuente no está añadida: *Centro de paquetes → Ajustes →
Orígenes de paquetes → Añadir* → `https://packages.synocommunity.com/`

1. **SynoCli Video Drivers** — es la pieza que falta cuando «no funciona la GPU». Expone
   `/dev/dri/renderD128` **y** trae el driver `iHD` de Intel.
2. **FFmpeg 6** — el binario con los parches de jellyfin (VAAPI/QSV).

Se hace por la interfaz a propósito: instalar paquetes de terceros por SSH se salta las
comprobaciones de dependencias de DSM, y esta es la máquina que sirve la app.

Comprobar que quedó bien:

```bash
ls -l /dev/dri && grep '^videodriver:' /etc/group
```

Tiene que aparecer `renderD128` y el grupo con GID **937**. Si el grupo cambia de número, hay
que cambiarlo también en `group_add` del compose.

## Paso 2 — montar la fábrica

```bash
mkdir -p /volume1/docker/ops-proxies/estado
# copiar aquí compose.yaml y hacer-proxies.sh (el de deploy/labtem/, sin tocar)
cd /volume1/docker/ops-proxies && docker compose up -d
```

> El script es **el mismo** de LabTem. Su raíz es configurable (`RAIZ="${RAIZ:-/material}"`),
> así que apuntarlo a otro disco es cuestión del compose. No se duplica lógica: si mejora
> allí, se vuelve a copiar.

Y la prueba que de verdad vale — que la GPU codifique **desde dentro del contenedor**, no
desde el host:

```bash
docker exec ops-proxies sh -c '/opt/ffmpeg/bin/ffmpeg -hide_banner -v error \
  -init_hw_device qsv=hw:/dev/dri/renderD128 -filter_hw_device hw \
  -f lavfi -i testsrc=size=1920x1080:rate=30:duration=5 \
  -vf "format=nv12,hwupload=extra_hw_frames=64" -c:v h264_qsv -f null -' && echo GPU-OK
```

## Paso 3 — que pase sola cada noche

En LabTem la pasada es a las 3:00. **Esta conviene ponerla a otra hora** (p. ej. las 4:00):
las dos fábricas leen y escriben mucho, y la de aquí comparte máquina con la app.

Programador de tareas → Crear → Tarea programada → Script definido por usuario, usuario
`root`:

```
/usr/local/bin/docker exec ops-proxies /opt/hacer-proxies.sh
```

Una pasada a mano, para no esperar a la madrugada:

```bash
docker exec -e LIMITE=3 ops-proxies /opt/hacer-proxies.sh
```

## Qué cambia en la app cuando esto corra

Nada que haya que tocar: ya está preparado, y el póster de la fábrica **tiene preferencia**
sobre el que saca la app. Es decir: montar esto no duplica trabajo, lo sustituye.

- `listOps` lee una vez la carpeta `.proxy` de cada nivel y marca qué piezas tienen póster.
- `opsThumb` saca la miniatura de `.proxy/<nombre>.poster.jpg` si existe; si no, la fabrica la
  app con su ffmpeg y la cachea.
- La cuadrícula de la pestaña Discos pinta ese fotograma en cuanto aparece.

Lo que **ni la fábrica ni la app** pueden abrir son los formatos de cámara propietarios (BRAW
de Blackmagic, R3D de RED): necesitan el SDK del fabricante. Esas piezas se quedan con su
icono y **no** dicen «preparando», que sería prometer algo que no va a llegar.

## Lo que este disco NO va a tener (y por qué está bien)

La fábrica de LabTem hace tres cosas: póster, copia ligera H.264 y tira de barrido. Aquí solo
importa **el póster**: Operaciones_LAB es material de TRABAJO del equipo, no material que se
le entrega a un cliente por el navegador. Las copias de revisión seguirán saliendo del disco
de entregas, que es donde vive lo que el cliente ve.

Si algún día se quisieran también aquí, el script ya las hace: es la misma pasada.
