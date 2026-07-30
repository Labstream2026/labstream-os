"use client";

import * as React from "react";
import { Archive, ArchiveRestore, Trash2, Link2, Link2Off, Rocket, RotateCcw, MoreHorizontal, Check, CheckSquare, Square } from "lucide-react";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { MENU_CAJA, MENU_ITEM, MenuSeparador, cerrarMenu } from "@/components/ui/barra-menu";
import { cn } from "@/lib/utils";
import { setDeliverableArchived, deleteDeliverable, setDeliverablePublished } from "../proyectos/[id]/actions";
import { useSelection } from "./selection";

// Acciones de GESTIÓN de un entregable en la bandeja /revisiones — solo para quien puede gestionar
// el proyecto (canManage). Reutiliza los mismos server actions del panel del proyecto: archivar NO
// toca el enlace de entrega (sigue vivo); solo "Borrar" lo mata. `linkActive` = el enlace de
// revisión sigue funcionando (ni revocado ni caducado).
//
// Antes esto era una BARRA de cuatro botones al pie de cada tarjeta. Con doce tarjetas en pantalla
// eran casi sesenta botones compitiendo con el video que quieres ver, y cada tarjeta pagaba ~44 px
// de alto por acciones que se usan una vez en la vida de la pieza. Ahora es un solo ⋯ en la esquina
// de la miniatura, con el patrón de menú de la casa: <details data-autoclose>, que se cierra al
// pulsar fuera, con Escape y al enviar el formulario de borrado (DetailsAutoClose, en el shell).
//
// Publicar: SOLO productores (`canPublish` = gestiona + permiso de aprobar) y SOLO sobre algo ya
// aprobado por el cliente (`publishable`). "Publicado" es un sello con fecha, aparte del estado —por
// eso vive aquí y no en la máquina de estados—.
export function DeliverableAdminActions({
  deliverableId,
  projectId,
  reviewUrl,
  linkActive,
  archived,
  name,
  canPublish,
  published,
  publishable,
}: {
  deliverableId: string;
  projectId: string;
  reviewUrl: string;
  linkActive: boolean;
  archived: boolean;
  name: string;
  canPublish: boolean;
  published: boolean;
  publishable: boolean;
}) {
  const [pending, start] = React.useTransition();
  const [copiado, setCopiado] = React.useState(false);
  // ── De qué lado se abre el menú ──
  // El ⋯ vive en la esquina de una tarjeta de ~130 px y el panel mide 240: alineado a la derecha
  // se sale por la izquierda de la tarjeta. En la columna de la izquierda eso lo mete DEBAJO del
  // panel lateral de clientes, que gana el apilamiento. Así que se mide al abrir y se vuelca al
  // lado donde cabe, tomando como frontera el borde de <main> (no el de la ventana: la referencia
  // es la zona de contenido, que cambia según si la barra lateral está plegada).
  const [aLaIzquierda, setALaIzquierda] = React.useState(false);
  const cajaRef = React.useRef<HTMLDivElement>(null);

  function alAbrir(e: React.SyntheticEvent<HTMLDetailsElement>) {
    if (!e.currentTarget.open) return;
    const caja = cajaRef.current;
    const zona = caja?.closest("main")?.getBoundingClientRect();
    if (!caja || !zona) return;
    const r = caja.getBoundingClientRect();
    const margen = 8;
    if (!aLaIzquierda && r.left < zona.left + margen) setALaIzquierda(true);
    else if (aLaIzquierda && r.right > zona.right - margen) setALaIzquierda(false);
  }
  // Marcar la pieza es lo que hace aparecer la barra de lote, que ya sabe mandarla al cliente por
  // correo o WhatsApp, archivarla y publicarla. Se ofrece desde el menú para no tener además una
  // casilla suelta encima de la miniatura, donde ya viven el chip de urgencia y el de comentarios.
  const seleccion = useSelection(deliverableId);

  function copiar() {
    navigator.clipboard?.writeText(reviewUrl).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  }

  return (
    <details data-autoclose className="relative" onToggle={alAbrir}>
      <summary
        className={cn(
          "flex size-7 cursor-pointer list-none items-center justify-center rounded-md bg-black/55 text-white transition-colors hover:bg-black/75",
          // Marcada: el ⋯ se tiñe, así se ve cuáles están en la selección sin abrir nada.
          seleccion?.marcado && "bg-primary text-primary-foreground hover:bg-primary",
          pending && "opacity-60",
        )}
        aria-label={`Acciones de «${name}»`}
        title="Acciones"
      >
        <MoreHorizontal className="size-4" />
      </summary>
      <div ref={cajaRef} className={cn(MENU_CAJA, aLaIzquierda ? "left-0" : "right-0")}>
        {/* Publicar va PRIMERO: en la pestaña de Aprobados es el paso que el equipo repite para
            pasar una pieza a Publicados, así que es lo primero que la mano busca. */}
        {canPublish && published ? (
          <button
            type="button"
            disabled={pending}
            className={cn(MENU_ITEM, "text-violet-700 dark:text-violet-300")}
            onClick={(e) => { cerrarMenu(e); start(() => setDeliverablePublished(deliverableId, projectId, false)); }}
            title="Vuelve a Aprobados"
          >
            <RotateCcw className="size-4 shrink-0" /> Quitar el sello de publicado
          </button>
        ) : canPublish && publishable ? (
          <button
            type="button"
            disabled={pending}
            className={cn(MENU_ITEM, "font-semibold text-violet-700 dark:text-violet-300")}
            onClick={(e) => { cerrarMenu(e); start(() => setDeliverablePublished(deliverableId, projectId, true)); }}
            title="Ya salió al aire"
          >
            <Rocket className="size-4 shrink-0" /> Marcar publicado
          </button>
        ) : null}

        {linkActive ? (
          // A propósito NO cierra el menú: el «¡Copiado!» es la única señal de que funcionó, y si
          // el menú se cerrara al pulsar, nadie la vería.
          <button type="button" className={MENU_ITEM} onClick={copiar}>
            {copiado ? <Check className="size-4 shrink-0 text-emerald-600" /> : <Link2 className="size-4 shrink-0 text-muted-foreground" />}
            {copiado ? "¡Copiado!" : "Copiar enlace del cliente"}
          </button>
        ) : (
          <span className={cn(MENU_ITEM, "cursor-default text-muted-foreground hover:bg-transparent")} title="Revocado o caducado">
            <Link2Off className="size-4 shrink-0" /> Enlace inactivo
          </span>
        )}

        {seleccion ? (
          <button
            type="button"
            className={MENU_ITEM}
            onClick={(e) => { cerrarMenu(e); seleccion.toggle(); }}
            title="Marcada, la barra de abajo la envía al cliente, la archiva o la publica junto a otras"
          >
            {seleccion.marcado
              ? <><CheckSquare className="size-4 shrink-0 text-primary" /> Quitar de la selección</>
              : <><Square className="size-4 shrink-0 text-muted-foreground" /> Seleccionar (enviar, archivar…)</>}
          </button>
        ) : null}

        <button
          type="button"
          disabled={pending}
          className={MENU_ITEM}
          onClick={(e) => { cerrarMenu(e); start(() => setDeliverableArchived(deliverableId, projectId, !archived)); }}
          title={archived ? "Devolver a la bandeja activa" : "Sale de la bandeja; el enlace sigue vivo"}
        >
          {archived
            ? <><ArchiveRestore className="size-4 shrink-0 text-muted-foreground" /> Devolver a la bandeja</>
            : <><Archive className="size-4 shrink-0 text-muted-foreground" /> Archivar</>}
        </button>

        {/* Borrar queda último y separado. Dentro de un menú es un clic MÁS fácil de pulsar sin
            querer que un botón al final de una fila, así que el freno de verdad es la
            confirmación, que enumera lo que se pierde —incluido el enlace de entrega—. */}
        <MenuSeparador />
        <form action={deleteDeliverable.bind(null, deliverableId, projectId)}>
          <ConfirmSubmit
            message={`¿Borrar el entregable «${name}» con TODAS sus versiones, comentarios y decisiones? También deja de funcionar su enlace de entrega. No se puede deshacer.`}
            className={cn(MENU_ITEM, "text-destructive hover:bg-destructive/10")}
            title="Borrar todo (mata el enlace)"
          >
            <Trash2 className="size-4 shrink-0" /> Borrar todo
          </ConfirmSubmit>
        </form>
      </div>
    </details>
  );
}
