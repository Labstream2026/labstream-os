"use client";

import * as React from "react";
import { Search } from "lucide-react";

// Selector de emojis sin dependencias. Set curado y amplio, por categorías, con
// palabras clave en español para el buscador. Lo usan el chat (reacciones/composer) y
// las portadas de cliente/proyecto.
type Emo = { e: string; k: string };
type Group = { label: string; emojis: Emo[] };

const GROUPS: Group[] = [
  {
    label: "Caras y emociones",
    emojis: [
      { e: "😀", k: "feliz sonrisa risa" }, { e: "😄", k: "feliz alegre" }, { e: "😁", k: "sonrisa dientes" },
      { e: "😂", k: "risa lagrimas jaja" }, { e: "🤣", k: "risa suelo jaja" }, { e: "😊", k: "feliz contento timido" },
      { e: "😉", k: "guino coqueto" }, { e: "😍", k: "amor corazones enamorado" }, { e: "😘", k: "beso amor" },
      { e: "😎", k: "genial gafas cool" }, { e: "🤩", k: "estrellas wow asombro" }, { e: "🥳", k: "fiesta celebrar" },
      { e: "🤔", k: "pensar duda" }, { e: "🤨", k: "ceja duda" }, { e: "😴", k: "dormir sueno cansado" },
      { e: "😮", k: "sorpresa asombro" }, { e: "😢", k: "triste llorar" }, { e: "😭", k: "llorar muy triste" },
      { e: "😤", k: "enojo bufar" }, { e: "😡", k: "enojado furioso rojo" }, { e: "🥺", k: "suplica ternura" },
      { e: "😅", k: "nervioso sudor risa" }, { e: "🙃", k: "ironia al reves" }, { e: "😏", k: "picaro" },
      { e: "😬", k: "incomodo mueca" }, { e: "🤯", k: "mente explotada wow" }, { e: "🥹", k: "emocion aguantar" },
      { e: "😇", k: "angel inocente" }, { e: "🤗", k: "abrazo" }, { e: "🤫", k: "silencio secreto" },
      { e: "🫠", k: "derretido" }, { e: "😴", k: "zzz dormir" }, { e: "🤓", k: "nerd gafas" }, { e: "🥱", k: "bostezo aburrido" },
    ],
  },
  {
    label: "Gestos y personas",
    emojis: [
      { e: "👍", k: "ok bien aprobado pulgar arriba like" }, { e: "👎", k: "mal no pulgar abajo dislike" },
      { e: "👏", k: "aplauso bravo" }, { e: "🙌", k: "celebrar manos arriba" }, { e: "🙏", k: "gracias porfavor rezar" },
      { e: "👌", k: "ok perfecto" }, { e: "✌️", k: "paz victoria" }, { e: "🤝", k: "acuerdo trato manos" },
      { e: "💪", k: "fuerza musculo" }, { e: "👀", k: "ojos mirar ver" }, { e: "🫡", k: "saludo militar entendido" },
      { e: "🤙", k: "llamame" }, { e: "👋", k: "hola adios saludo" }, { e: "🤞", k: "suerte dedos cruzados" },
      { e: "✋", k: "alto mano stop" }, { e: "🫶", k: "amor manos corazon" }, { e: "👉", k: "senalar derecha" },
      { e: "👈", k: "senalar izquierda" }, { e: "✍️", k: "escribir firmar" }, { e: "🧠", k: "cerebro idea mente" },
      { e: "🫵", k: "tu senalar" }, { e: "🙋", k: "preguntar levantar mano" }, { e: "🤦", k: "facepalm" }, { e: "🤷", k: "no se duda hombros" },
    ],
  },
  {
    label: "Corazones y símbolos",
    emojis: [
      { e: "❤️", k: "amor corazon rojo" }, { e: "🧡", k: "corazon naranja" }, { e: "💛", k: "corazon amarillo" },
      { e: "💚", k: "corazon verde" }, { e: "💙", k: "corazon azul" }, { e: "💜", k: "corazon morado" },
      { e: "🖤", k: "corazon negro" }, { e: "🤍", k: "corazon blanco" }, { e: "💔", k: "corazon roto" },
      { e: "✨", k: "brillo destello magia" }, { e: "⭐", k: "estrella" }, { e: "🌟", k: "estrella brillo" },
      { e: "🔥", k: "fuego fire genial top" }, { e: "💯", k: "cien perfecto" }, { e: "🎉", k: "fiesta celebrar confeti" },
      { e: "🎊", k: "fiesta confeti" }, { e: "🚀", k: "cohete lanzamiento rapido" }, { e: "💥", k: "explosion boom" },
      { e: "⚡", k: "rayo energia rapido" }, { e: "✅", k: "check hecho aprobado listo" }, { e: "☑️", k: "check casilla" },
      { e: "❌", k: "error no equis" }, { e: "⚠️", k: "advertencia cuidado alerta" }, { e: "❓", k: "pregunta duda" },
      { e: "❗", k: "importante exclamacion" }, { e: "💡", k: "idea bombilla" }, { e: "🏆", k: "trofeo ganar premio" },
      { e: "🥇", k: "medalla oro primero" }, { e: "🎯", k: "objetivo diana meta" }, { e: "♻️", k: "reciclar" },
    ],
  },
  {
    label: "Producción audiovisual",
    emojis: [
      { e: "🎬", k: "claqueta cine pelicula rodaje produccion" }, { e: "🎥", k: "camara cine video" },
      { e: "🎞️", k: "pelicula film rollo" }, { e: "📽️", k: "proyector cine" }, { e: "📹", k: "videocamara grabar" },
      { e: "📷", k: "camara foto" }, { e: "📸", k: "camara flash foto" }, { e: "🎙️", k: "microfono podcast estudio" },
      { e: "🎤", k: "microfono cantar voz" }, { e: "🎧", k: "audifonos audio musica" }, { e: "🎚️", k: "mezclador audio" },
      { e: "🎛️", k: "perillas control audio" }, { e: "🔊", k: "altavoz volumen sonido" }, { e: "🎵", k: "musica nota" },
      { e: "🎨", k: "arte color diseno pintura" }, { e: "✂️", k: "cortar editar tijeras" }, { e: "💡", k: "luz idea iluminacion" },
      { e: "🔦", k: "linterna luz" }, { e: "🖥️", k: "monitor pantalla edicion" }, { e: "💻", k: "laptop computador" },
      { e: "⌨️", k: "teclado" }, { e: "🖱️", k: "mouse raton" }, { e: "📱", k: "celular movil telefono" },
      { e: "🔋", k: "bateria carga" }, { e: "💾", k: "guardar disco" }, { e: "🗂️", k: "archivos carpetas" },
      { e: "📊", k: "grafico estadistica datos" }, { e: "📈", k: "subir crecer grafico" }, { e: "🎮", k: "juego control" },
    ],
  },
  {
    label: "Objetos y trabajo",
    emojis: [
      { e: "📌", k: "fijar pin chincheta" }, { e: "📎", k: "clip adjunto" }, { e: "📁", k: "carpeta archivo" },
      { e: "📂", k: "carpeta abierta" }, { e: "📄", k: "documento hoja" }, { e: "📝", k: "nota escribir lapiz" },
      { e: "📅", k: "calendario fecha" }, { e: "🗓️", k: "calendario agenda" }, { e: "⏰", k: "alarma reloj hora" },
      { e: "⏳", k: "tiempo reloj arena espera" }, { e: "☕", k: "cafe descanso" }, { e: "🔑", k: "llave acceso clave" },
      { e: "🔒", k: "candado privado seguro" }, { e: "🔓", k: "abierto candado" }, { e: "🔔", k: "campana notificacion aviso" },
      { e: "📣", k: "megafono anuncio" }, { e: "💰", k: "dinero plata pago" }, { e: "💵", k: "billete dinero" },
      { e: "🧾", k: "factura recibo cobro" }, { e: "✏️", k: "lapiz editar escribir" }, { e: "📍", k: "ubicacion lugar pin" },
      { e: "🔍", k: "buscar lupa" }, { e: "🛠️", k: "herramientas arreglar" }, { e: "⚙️", k: "ajustes engranaje config" },
      { e: "📦", k: "caja paquete entrega" }, { e: "🚩", k: "bandera marca" }, { e: "🏁", k: "meta final bandera" },
    ],
  },
  {
    label: "Naturaleza y comida",
    emojis: [
      { e: "🌞", k: "sol soleado" }, { e: "🌙", k: "luna noche" }, { e: "🌈", k: "arcoiris" }, { e: "🔥", k: "fuego" },
      { e: "🌊", k: "ola mar agua" }, { e: "🌱", k: "planta brote crecer" }, { e: "🌳", k: "arbol" }, { e: "🌸", k: "flor primavera" },
      { e: "🍀", k: "trebol suerte" }, { e: "🐶", k: "perro mascota" }, { e: "🐱", k: "gato mascota" }, { e: "🦄", k: "unicornio" },
      { e: "🦋", k: "mariposa" }, { e: "🐝", k: "abeja" }, { e: "🍎", k: "manzana fruta" }, { e: "🍕", k: "pizza comida" },
      { e: "🍔", k: "hamburguesa comida" }, { e: "🌮", k: "taco comida" }, { e: "🍣", k: "sushi comida" }, { e: "🍩", k: "dona postre" },
      { e: "🍰", k: "pastel torta cumpleanos" }, { e: "🍺", k: "cerveza brindis" }, { e: "🍷", k: "vino copa" }, { e: "🥂", k: "brindis celebrar copas" },
    ],
  },
  {
    label: "Viajes y lugares",
    emojis: [
      { e: "🏢", k: "edificio oficina empresa" }, { e: "🏠", k: "casa hogar" }, { e: "🏬", k: "tienda almacen" },
      { e: "🏭", k: "fabrica industria" }, { e: "🏟️", k: "estadio evento" }, { e: "✈️", k: "avion viaje vuelo" },
      { e: "🚗", k: "carro auto coche" }, { e: "🚀", k: "cohete" }, { e: "🛰️", k: "satelite" }, { e: "🗺️", k: "mapa" },
      { e: "🌍", k: "mundo tierra global" }, { e: "📡", k: "antena senal" }, { e: "🚦", k: "semaforo" }, { e: "🏝️", k: "isla playa" },
    ],
  },
];

const ALL: Emo[] = GROUPS.flatMap((g) => g.emojis.map((it) => ({ ...it, k: `${it.k} ${g.label.toLowerCase()}` })));

export function EmojiPicker({
  onPick,
  align = "left",
  openUp = true,
  footer,
}: {
  onPick: (emoji: string) => void;
  align?: "left" | "right";
  openUp?: boolean;
  footer?: React.ReactNode;
}) {
  const [q, setQ] = React.useState("");
  const query = q.trim().toLowerCase();
  // Resultados de búsqueda (sin duplicar emoji).
  const results = React.useMemo(() => {
    if (!query) return null;
    const seen = new Set<string>();
    return ALL.filter((it) => {
      if (seen.has(it.e) || !(it.e.includes(query) || it.k.includes(query))) return false;
      seen.add(it.e);
      return true;
    });
  }, [query]);

  return (
    <div className={`absolute z-30 w-72 rounded-xl border border-border bg-popover p-2 shadow-lg ${openUp ? "bottom-10" : "top-10"} ${align === "right" ? "right-0" : "left-0"}`}>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar emoji…"
          className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="max-h-56 space-y-2 overflow-y-auto">
        {results ? (
          results.length === 0 ? (
            <p className="px-1 py-3 text-center text-xs text-muted-foreground">Sin resultados para «{q.trim()}».</p>
          ) : (
            <div className="grid grid-cols-8 gap-0.5">
              {results.map((it) => (
                <button key={it.e} type="button" onClick={() => onPick(it.e)} title={it.k} className="flex size-7 items-center justify-center rounded text-lg hover:bg-muted">
                  {it.e}
                </button>
              ))}
            </div>
          )
        ) : (
          GROUPS.map((g) => (
            <div key={g.label}>
              <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
              <div className="grid grid-cols-8 gap-0.5">
                {g.emojis.map((it) => (
                  <button key={it.e + g.label} type="button" onClick={() => onPick(it.e)} title={it.k} className="flex size-7 items-center justify-center rounded text-lg hover:bg-muted">
                    {it.e}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      {footer ? <div className="mt-1 border-t border-border pt-1">{footer}</div> : null}
    </div>
  );
}

// Reacciones rápidas (para el botón "+" sobre un mensaje).
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "✅"];
