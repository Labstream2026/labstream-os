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
GET http://192.168.0.40:8099/vivo?rel=<ruta>&alto=<720>&desde=<segundos>
     cabecera:  x-labtem-secreto: <el del .env>
```

Devuelve **MP4 fragmentado** (`frag_keyframe+empty_moov`), que es el que se puede enviar
mientras se genera — un MP4 normal guarda su índice al final y no serviría.

`GET /salud` → `{ ok, enCurso, max }` para saber si hay plaza antes de intentarlo.

`desde` va **antes** de la entrada en la orden de ffmpeg, así que saltar al minuto 20 es
inmediato: busca el punto en vez de decodificar y tirar todo lo anterior.

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

## Lo que queda por hacer

Falta el lado de la app: una ruta que autorice (sesión o token de entrega, como ya hacen
`/api/files-asset` y `/api/galeria-publica/media`) y reenvíe la petición aquí con el secreto,
más el control en el reproductor para elegirlo. Mientras tanto el servicio está montado,
probado y esperando.
