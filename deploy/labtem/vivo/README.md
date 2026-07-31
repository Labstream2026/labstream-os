# LabTem · transcodificación EN VIVO

Convierte un vídeo **mientras se reproduce**, en vez de servir una copia hecha de antemano.

## Qué es y qué no es

La fábrica de al lado (`../`) prepara de madrugada una copia ligera y una escalera HLS de cada
pieza. Eso resuelve el caso normal y tiene una ventaja que esto nunca tendrá: **una copia hecha
sirve a cuantas personas quieran verla y no gasta GPU**.

Esto es lo contrario: **se paga por espectador y por minuto** —cada uno ocupa la tarjeta
mientras mira— y a cambio ofrece **cualquier calidad al instante, sin ocupar disco**.

Son complementarios, no sustitutos. La copia sigue siendo la vía por defecto.

## Por qué vive en LabTem y no en la app

La GPU está aquí. El NAS de producción —donde corre la app— tiene el mismo chip gráfico
físicamente (una UHD 630 en un i5-10400), pero **su DSM no trae el driver**: cero módulos i915
en disco, comprobado. Levantarlo significaría tocar el kernel del servidor que sostiene el
negocio entero.

Así que el trabajo se queda donde la GPU sí funciona, y la app se lo pide por la red local.

## Rendimiento medido (31-jul-2026, en la máquina)

Decodificando, escalando y codificando **todo en la GPU**, en una sola pasada:

| Salida | Velocidad | Un espectador ocupa |
|---|---|---|
| 1080p | **14,1× tiempo real** | ~1/14 de la tarjeta |
| 720p | **16,3× tiempo real** | ~1/16 |
| 480p | **17,8× tiempo real** | ~1/18 |

El tope de plazas (`MAX_A_LA_VEZ`, por defecto 6) **no lo pone la GPU** —a 14× cabrían muchos
más— sino el dejarle aire a la fábrica nocturna y al resto del NAS. Al llenarse se contesta
**503 con `Retry-After`**, y quien llama debe caer a la copia de disco: mejor eso que servir a
todo el mundo a tirones.

## Cómo se usa

```
GET /salud                                              → { ok, enCurso, max }
GET /info?rel=<ruta>                                    → qué admite esta pieza
GET /vivo?rel=<ruta>&alto=<720>&desde=<segundos>        → el chorro
     cabecera (en /info y /vivo):  x-labtem-secreto: <el del .env>
```

`/vivo` devuelve **MP4 fragmentado** (`frag_keyframe+empty_moov`), que es el que se puede
enviar mientras se genera — un MP4 normal guarda su índice al final y no serviría.

`desde` va **antes** de la entrada en la orden de ffmpeg, así que saltar al minuto 20 es
inmediato: busca el punto en vez de decodificar y tirar todo lo anterior. De ahí que buscar en
la barra se implemente reconvirtiendo desde el punto pedido, y no se note.

### Por qué existe `/info`

Devuelve `{ codec, w, h, duracion, audio, gpu, alturas[], libres }` tras un ffprobe. Hacen falta
las cuatro cosas y ninguna se puede adivinar desde la app:

- **`gpu`** — si esta tarjeta no decodifica ese códec (ProRes, DNxHD, RAW) no hay tiempo real
  que valga. Sin preguntarlo, la única forma de saberlo sería que alguien eligiera una calidad,
  ocupara una plaza y recibiera un error.
- **`duracion`** — un chorro que se genera sobre la marcha no sabe dónde termina, así que el
  reproductor no puede pintar una barra de tiempo. Con la duración del original, sí.
- **`audio` y `alturas[].codecs`** — al otro lado quien reproduce es MediaSource, y **exige que
  se le declare el códec exacto antes del primer byte**. Por eso el nivel de salida está clavado
  (`-level 41` hasta 1080p, `51` por encima) y la cadena que le corresponde se publica aquí: las
  dos se calculan en la misma función para que no puedan separarse. Si la declaración no acierta,
  el navegador rechaza el chorro entero sin reproducir nada y sin decir por qué.
- **`alturas[]`** nunca ofrece más de lo que el material da: subir un 720p a 1080p pesa el doble
  y no enseña un detalle más.

## Montarlo

```bash
mkdir -p /volume5/docker/labtem-vivo   # copiar ahí servidor.mjs y compose.yaml
cd /volume5/docker/labtem-vivo
printf 'LABTEM_VIVO_SECRETO=%s\n' "$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')" | sudo tee .env
sudo chmod 600 .env
docker compose up -d
curl -s http://192.168.0.40:8099/salud
```

## Seguridad

- **LabTem no se expone a internet, nunca.** El puerto se publica solo en `192.168.0.40`, y
  quien habla con esto es el NAS de producción.
- **Secreto compartido en cabecera**, no en la URL: las URLs acaban en registros y en
  historiales. Sin él, 401.
- **La ruta llega desde fuera**, así que se valida con la misma dureza que en la app: nada de
  `..`, nada absoluto, y el resultado tiene que caer dentro de `Entregas_LAB` **después** de
  resolver enlaces simbólicos (si se validara antes, un enlace dentro de la raíz apuntando
  afuera pasaría el filtro).
- **La altura de salida se compara contra una lista cerrada**: entra por la URL y termina en la
  línea de órdenes de ffmpeg.
- El material se monta **en solo lectura**. La única que escribe en `Entregas_LAB` es la fábrica.

## El lado de la app

No hay una ruta nueva: se colgó de las **dos que ya servían el vídeo**, con su mismo permiso.

| Quién mira | Ruta |
|---|---|
| Equipo, sala de revisión | `/api/files-asset/<id>?t=…&vivo=720&desde=90` |
| Cliente, sala de entrega | `/api/galeria-publica/media?t=…&rel=…&vivo=720&desde=90` |

Eso importa más de lo que parece: **esto no solo entrega bytes, pone a trabajar la GPU**. Una
puerta propia habría sido una forma cómoda de dejar el NAS sin tarjeta desde fuera. Y la ruta
del archivo nunca la elige el navegador — en revisión sale de la base de datos, y en la sala del
cliente ya pasó por `alcanceAutoriza` antes de llegar aquí.

`src/lib/labtem-vivo.ts` es lo único que habla con este servicio (config, salud con memoria de
15 s, `/info` con memoria de 5 min por pieza, y el chorro). `src/lib/vivo-cliente.ts` es el motor
del navegador. **Sin las variables `LABTEM_VIVO_URL` y `LABTEM_VIVO_SECRETO` el modo no existe** y
la app se comporta exactamente como antes.

### Cómo se reproduce algo que aún no existe

Puesto tal cual en el `src` de un `<video>`, el chorro se reproduce pero la barra queda vacía:
sin índice no hay duración ni forma de buscar. Así que se le da de comer por **MediaSource**, que
sí deja declarar la duración de antemano. A partir de ahí el `<video>` es uno normal, con sus
controles de siempre — y **buscar** se implementa reconvirtiendo desde el punto pedido, que en
esta máquina es instantáneo. La pieza que lo cuadra es `timestampOffset`: el chorro nuevo llega
numerado desde cero y se le suma el punto de partida, así que aterriza en su sitio.

Lo ya visto **no se tira**: retroceder a un trozo que sigue en memoria se reproduce al instante
y sin volver a molestar a la GPU.

Y si algo falla —las seis plazas llenas, el chorro cortado, el navegador sin memoria de vídeo—
el motor se apaga solo y devuelve el reproductor a la copia de disco. Una mejora no puede costar
la reproducción.

**En iOS no hay modo al vuelo**: Safari del móvil no trae MediaSource. Allí quedan la copia y la
escalera, que es justo lo que había antes de todo esto.
