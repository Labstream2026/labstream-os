// ── Reproducir un chorro que se está generando ───────────────────────────────────────────
//
// EL PROBLEMA. Un vídeo que LabTem convierte sobre la marcha no es un archivo: no tiene índice,
// no se sabe cuánto pesa y no admite pedir «los bytes del 5 al 9». Puesto directamente en el
// `src` de un `<video>`, el navegador lo reproduce —eso sí funciona— pero la barra de tiempo
// queda vacía, la duración sale `Infinity` y arrastrarla no lleva a ninguna parte. Un
// reproductor sin barra no es un reproductor: es un botón de play.
//
// LA SOLUCIÓN. Se le da de comer al `<video>` a través de MediaSource, que sí deja DECLARAR la
// duración de antemano —LabTem la manda en `/info`, que la saca del original—. A partir de ahí
// el navegador pinta una barra normal, con su duración real y sus controles de siempre.
//
// Y BUSCAR se implementa RECONVIRTIENDO desde el punto pedido. Suena caro y no lo es: en LabTem
// el salto va antes de la entrada en la orden de ffmpeg, así que empezar en el minuto 20 es
// buscar en el archivo, no decodificar veinte minutos para tirarlos (medido: instantáneo). El
// truco que lo cuadra es `timestampOffset`: el chorro nuevo llega numerado desde cero y se le
// suma el punto de partida, así que aterriza en su sitio de la línea de tiempo.
//
// Lo ya visto NO se tira. Si se retrocede a un trozo que sigue en memoria, se reproduce al
// instante y sin volver a molestar a la GPU.
//
// SIN MediaSource NO HAY MODO EN VIVO. Es iOS/iPadOS: Safari no lo trae en el móvil. Allí queda
// la copia de disco y la escalera, que es exactamente lo que había antes de todo esto.

/**
 * Lo que contesta `?vivo=info`: qué se puede hacer con esta pieza. Lo compone LabTem tras un
 * ffprobe del original, así que `alturas` nunca ofrece más de lo que el material da (subir un
 * 720p a 1080p pesa el doble y no enseña un detalle más).
 */
export type VivoDatos = {
  duracion: number | null;
  audio: boolean;
  gpu: boolean;
  alturas: { alto: number; kbps: number; codecs: string }[];
  libres?: number;
};

/**
 * Las calidades que de verdad se pueden ofrecer aquí: las que LabTem sabe hacer Y este
 * navegador sabe reproducir. Se cruzan las dos listas en un solo sitio para que el menú no
 * pueda enseñar una opción que al pulsarla no haga nada.
 *
 * Devuelve vacío —y con eso el modo desaparece— si falta la duración: sin ella la barra de
 * tiempo sería una mentira, y un reproductor con la barra rota es peor que uno sin barra.
 */
export function alturasUtiles(datos: VivoDatos | null): { alto: number; kbps: number; codecs: string }[] {
  if (!datos?.gpu || !datos.duracion || datos.duracion <= 0) return [];
  return datos.alturas.filter((a) => vivoSoportado(a.codecs));
}

export type OpcionesVivo = {
  video: HTMLVideoElement;
  /** Cómo construir la URL del chorro. `desde` va en segundos enteros. */
  url: (desde: number) => string;
  /** Duración REAL del original, en segundos. Es lo que hace que la barra signifique algo. */
  duracion: number;
  /** Cadena de códecs exacta, tal y como la publica LabTem (`avc1.640029,mp4a.40.2`). */
  codecs: string;
  /** Se llama cuando esto ya no puede seguir; quien escuche debe volver a la copia de disco. */
  alFallar?: (motivo: string) => void;
};

function tipoMime(codecs: string): string {
  return `video/mp4; codecs="${codecs}"`;
}

/**
 * ¿Puede este navegador reproducir así? Se pregunta ANTES de ofrecer el modo en vivo en el
 * menú: una opción que al pulsarla no hace nada es peor que no tenerla.
 */
export function vivoSoportado(codecs: string): boolean {
  if (typeof window === "undefined" || !("MediaSource" in window)) return false;
  try {
    return MediaSource.isTypeSupported(tipoMime(codecs));
  } catch {
    return false;
  }
}

// Cuánto pasado se conserva y cuánto futuro, cuando hay que hacer sitio. No es una preferencia:
// el navegador tiene un tope de memoria de vídeo y al llegar contesta con un error en vez de
// tragar. Sin liberar, una pieza larga en alta se corta a la mitad.
const GUARDAR_ATRAS = 30;
const GUARDAR_ADELANTE = 180;

export class ReproductorVivo {
  private op: OpcionesVivo;
  private ms: MediaSource | null = null;
  private sb: SourceBuffer | null = null;
  private objectUrl: string | null = null;
  private ctrl: AbortController | null = null;
  private cola: Uint8Array[] = [];
  private muerto = false;
  private desde = 0;
  private terminado = false; // el chorro llegó hasta el final del vídeo
  private reanudando = false;

  constructor(op: OpcionesVivo) {
    this.op = op;
    const ms = new MediaSource();
    this.ms = ms;
    this.objectUrl = URL.createObjectURL(ms);
    ms.addEventListener("sourceopen", this.alAbrir);
    op.video.src = this.objectUrl;
    op.video.addEventListener("seeking", this.alBuscar);
    op.video.addEventListener("waiting", this.alEsperar);
  }

  /** Empieza a reproducir desde este segundo. Se puede llamar más de una vez. */
  arrancar(desde: number): void {
    if (this.muerto) return;
    this.op.video.currentTime = Math.max(0, Math.min(desde, this.op.duracion - 0.1));
    void this.bombear(desde);
  }

  destruir(): void {
    if (this.muerto) return;
    this.muerto = true;
    this.ctrl?.abort();
    this.op.video.removeEventListener("seeking", this.alBuscar);
    this.op.video.removeEventListener("waiting", this.alEsperar);
    this.ms?.removeEventListener("sourceopen", this.alAbrir);
    this.sb?.removeEventListener("updateend", this.alTerminarPieza);
    this.cola = [];
    try {
      if (this.ms && this.ms.readyState === "open") this.ms.endOfStream();
    } catch {
      /* ya cerrado */
    }
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.ms = null;
    this.sb = null;
  }

  private fallar(motivo: string): void {
    if (this.muerto) return;
    const avisar = this.op.alFallar;
    this.destruir();
    avisar?.(motivo);
  }

  private alAbrir = (): void => {
    const ms = this.ms;
    if (!ms || this.muerto || ms.readyState !== "open") return;
    try {
      // ESTA línea es toda la razón de usar MediaSource: declarar cuánto dura algo que todavía
      // no existe. Sin ella la barra no significa nada.
      ms.duration = this.op.duracion;
      const sb = ms.addSourceBuffer(tipoMime(this.op.codecs));
      sb.mode = "segments";
      sb.addEventListener("updateend", this.alTerminarPieza);
      this.sb = sb;
      this.empujar();
    } catch {
      this.fallar("este navegador no admite el formato en vivo");
    }
  };

  private alTerminarPieza = (): void => {
    if (this.muerto) return;
    this.empujar();
    // Cuando ya no queda nada por meter y el chorro llegó al final del vídeo, se cierra: es lo
    // que hace que el `<video>` dé por terminada la reproducción en vez de quedarse esperando.
    if (this.terminado && !this.cola.length && this.ms?.readyState === "open" && !this.sb?.updating) {
      const b = this.sb?.buffered;
      const fin = b && b.length ? b.end(b.length - 1) : 0;
      if (fin >= this.op.duracion - 1) {
        try {
          this.ms.endOfStream();
        } catch {
          /* ya cerrado */
        }
      }
    }
  };

  // Buscar. Si el punto ya está en memoria no se toca nada —el navegador reproduce solo—; si
  // no, se le pide a LabTem que reconvierta desde ahí.
  private alBuscar = (): void => {
    if (this.muerto || this.reanudando) return;
    const t = this.op.video.currentTime;
    if (this.enMemoria(t)) return;
    void this.bombear(t);
  };

  // El chorro se cortó (el proxy inverso corta las conexiones calladas, y una pausa larga es
  // exactamente eso: nadie consume, ffmpeg se bloquea, la conexión enmudece). Se vuelve a pedir
  // desde donde se estaba, que además es barato. Sin esto, pausar un minuto mataba la sesión.
  private alEsperar = (): void => {
    if (this.muerto || this.ctrl || this.terminado) return;
    const t = this.op.video.currentTime;
    if (t >= this.op.duracion - 0.5 || this.enMemoria(t)) return;
    void this.bombear(t);
  };

  private enMemoria(t: number): boolean {
    const b = this.sb?.buffered;
    if (!b) return false;
    for (let i = 0; i < b.length; i++) {
      // Con medio segundo por delante basta para que el navegador siga sin parpadear.
      if (t >= b.start(i) && t < b.end(i) - 0.5) return true;
    }
    return false;
  }

  private async esperarLibre(): Promise<void> {
    const sb = this.sb;
    if (!sb || !sb.updating) return;
    await new Promise<void>((listo) => {
      const fin = () => {
        sb.removeEventListener("updateend", fin);
        listo();
      };
      sb.addEventListener("updateend", fin);
    });
  }

  private async bombear(desde: number): Promise<void> {
    if (this.muerto) return;
    const segundos = Math.max(0, Math.floor(desde));
    // Cortar el chorro anterior es lo que libera la plaza de la GPU al otro lado. Si no se
    // hiciera, saltar cinco veces por la barra dejaría cinco ffmpeg trabajando para nadie.
    this.ctrl?.abort();
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    this.desde = segundos;
    this.terminado = false;
    this.cola = [];

    let r: Response;
    try {
      r = await fetch(this.op.url(segundos), { signal: ctrl.signal, cache: "no-store" });
    } catch {
      if (!ctrl.signal.aborted) this.fallar("no se pudo pedir la conversión");
      return;
    }
    if (ctrl.signal.aborted || this.muerto) return;
    if (!r.ok || !r.body) {
      // 503 = las seis plazas ocupadas. Es un «ahora no», no un «nunca»: quien escuche decide,
      // y lo razonable es volver a la copia de disco en vez de dejar al espectador esperando.
      this.fallar(r.status === 503 ? "la GPU está ocupada" : "la conversión no está disponible");
      return;
    }

    // El desplazamiento se fija ANTES de meter un solo byte: el chorro llega numerado desde
    // cero y sin esto aterrizaría al principio de la línea de tiempo, pisando lo que ya había.
    await this.esperarLibre();
    if (ctrl.signal.aborted || this.muerto || !this.sb) return;
    try {
      this.sb.timestampOffset = segundos;
    } catch {
      /* con la fuente cerrándose ya no importa */
    }

    const lector = r.body.getReader();
    try {
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        if (ctrl.signal.aborted || this.muerto) return;
        if (value?.length) {
          this.cola.push(value);
          this.empujar();
        }
      }
      if (this.ctrl === ctrl) {
        this.terminado = true;
        this.ctrl = null;
        this.alTerminarPieza();
      }
    } catch {
      // Cortado a media conversión: si fue por un salto o por cerrar, no hay nada que decir.
      if (this.ctrl === ctrl) this.ctrl = null;
    }
  }

  private empujar(): void {
    const sb = this.sb;
    if (this.muerto || !sb || sb.updating || !this.cola.length) return;
    if (this.ms?.readyState !== "open") return;
    const trozo = this.cola.shift()!;
    try {
      sb.appendBuffer(trozo as BufferSource);
    } catch (e) {
      if ((e as DOMException)?.name === "QuotaExceededError") {
        // El navegador dice basta. Se devuelve el trozo a la cola y se hace sitio; al terminar
        // el borrado salta `updateend` y esto vuelve a intentarlo solo.
        this.cola.unshift(trozo);
        this.liberar();
      } else {
        this.fallar("el reproductor rechazó el vídeo");
      }
    }
  }

  // Hacer sitio: primero lo ya visto, y si no hay, lo que está muy por delante. Nunca se toca
  // el entorno inmediato de donde se está reproduciendo.
  private liberar(): void {
    const sb = this.sb;
    if (!sb || sb.updating) return;
    const t = this.op.video.currentTime;
    const b = sb.buffered;
    try {
      for (let i = 0; i < b.length; i++) {
        const corte = Math.min(b.end(i), t - GUARDAR_ATRAS);
        if (corte > b.start(i)) {
          sb.remove(b.start(i), corte);
          return;
        }
      }
      for (let i = b.length - 1; i >= 0; i--) {
        if (b.start(i) > t + GUARDAR_ADELANTE) {
          sb.remove(b.start(i), b.end(i));
          return;
        }
      }
    } catch {
      /* la fuente se cerró mientras tanto */
    }
    // No había nada que soltar y sigue sin caber: insistir sería un bucle.
    this.fallar("el navegador se quedó sin memoria de vídeo");
  }

  /** Desde qué segundo se está convirtiendo ahora mismo (para reanudar al cambiar de calidad). */
  get puntoActual(): number {
    return this.op.video.currentTime || this.desde;
  }
}
