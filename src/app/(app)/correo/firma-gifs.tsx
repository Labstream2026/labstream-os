"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, PenLine, Plus, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { elegirFirma, eliminarGif, eliminarPlantillaFirma, guardarFirma, guardarPlantillaFirma } from "./acciones";
import type { GifVM } from "./compositor";

// ── Panel «Firma y GIFs» ────────────────────────────────────────────────────
// La firma corporativa se ESTRUCTURA una vez como plantilla (layout, logo, colores, con
// {{nombre}} y {{cargo}}); cada colaborador solo la elige, pone su nombre y su cargo, y la
// vista previa le enseña EXACTAMENTE cómo va a salir. Quien prefiera, arma la suya propia.

export type PlantillaFirmaVM = { id: string; nombre: string; html: string; tieneImagen: boolean; autor: string | null };

// Sustitución de campos para la VISTA PREVIA (la misma regla del servidor, en cliente).
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const conCampos = (html: string, nombre: string, cargo: string) =>
  html.replace(/\{\{\s*nombre\s*\}\}/gi, esc(nombre || "Tu nombre")).replace(/\{\{\s*cargo\s*\}\}/gi, esc(cargo));

export function PanelFirma({ firmaHtml, imagenUrl, plantillas, seleccion }: {
  /** El HTML de la firma PERSONALIZADA guardada (vacío = nunca ha armado una). */
  firmaHtml: string;
  imagenUrl: string | null;
  plantillas: PlantillaFirmaVM[];
  /** Lo elegido hoy: plantilla activa (o null) + nombre/cargo afinados. */
  seleccion: { templateId: string | null; usaPropia: boolean; nombre: string; cargo: string };
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = React.useState(seleccion.templateId);
  const [nombre, setNombre] = React.useState(seleccion.nombre);
  const [cargo, setCargo] = React.useState(seleccion.cargo);
  const [estado, setEstado] = React.useState<"quieto" | "guardando" | "listo" | string>("quieto");
  const [editando, setEditando] = React.useState<PlantillaFirmaVM | null | "nueva">(null);

  const activa = plantillas.find((p) => p.id === templateId) ?? null;

  const aplicar = () => {
    setEstado("guardando");
    void elegirFirma({ templateId, nombre, cargo }).then((r) => {
      if (!r.ok) { setEstado(r.error ?? "No se pudo guardar."); return; }
      setEstado("listo");
      router.refresh();
    });
  };

  const cls = "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Tu firma</h3>
      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
        Elige la plantilla del estudio, pon tu nombre y tu cargo, y listo — la vista previa es exactamente lo que saldrá en tus correos.
      </p>

      {/* 1 · Elegir plantilla (o la básica) */}
      <div className="mt-3 flex flex-wrap gap-2">
        <BotonPlantilla activa={templateId === null && !seleccion.usaPropia} onClick={() => setTemplateId(null)} nombre="Básica" detalle="nombre + cargo + Labstream" />
        {plantillas.map((p) => (
          <BotonPlantilla key={p.id} activa={templateId === p.id} onClick={() => setTemplateId(p.id)} nombre={p.nombre} detalle={p.autor ? `de ${p.autor}` : "del estudio"} />
        ))}
        <button type="button" onClick={() => setEditando("nueva")}
          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-3 py-2 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
          <Plus className="size-3.5" /> Nueva plantilla
        </button>
      </div>

      {/* 2 · Nombre y cargo (los campos que cada quien SÍ cambia) */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-[12px] font-medium">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} className={cls} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[12px] font-medium">Cargo</span>
          <input value={cargo} onChange={(e) => setCargo(e.target.value)} maxLength={120} placeholder="Productora, Editor…" className={cls} />
        </label>
      </div>

      {/* 3 · Vista previa VIVA */}
      <div className="mt-3 rounded-lg border border-dashed border-border bg-background px-4 py-3">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Así va a salir</p>
        {activa ? (
          <div className="text-[13px] leading-relaxed [&_a]:text-primary [&_a]:underline [&_img]:max-w-[260px]">
            <div dangerouslySetInnerHTML={{ __html: conCampos(activa.html, nombre, cargo) }} />
            {activa.tieneImagen ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={`/api/correo/firma-plantilla/${activa.id}`} alt="" className="mt-2 max-w-[260px]" />
            ) : null}
          </div>
        ) : (
          <div className="text-[13px] leading-relaxed">
            —<br /><b>{nombre || "Tu nombre"}</b>{cargo ? ` · ${cargo}` : ""}<br />
            Labstream Studio · <span className="text-primary underline">labstreamsas.com</span>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={aplicar} disabled={estado === "guardando"}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {estado === "guardando" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Usar esta firma
        </button>
        {activa ? (
          <button type="button" onClick={() => setEditando(activa)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-[12.5px] font-medium text-muted-foreground hover:bg-accent">
            <PenLine className="size-3.5" /> Editar la plantilla
          </button>
        ) : null}
        {estado === "listo" ? <span className="text-[12px] font-medium text-emerald-600 dark:text-emerald-400">Guardada: sale en tu próximo correo ✓</span> : null}
        {estado !== "quieto" && estado !== "guardando" && estado !== "listo" ? <span className="text-[12px] font-medium text-destructive">{estado}</span> : null}
      </div>

      {/* Personalizada: para quien prefiere armar la suya letra a letra. */}
      <details className="mt-4 border-t border-border pt-3">
        <summary className="cursor-pointer text-[12px] font-medium text-muted-foreground hover:text-foreground">
          Prefiero una firma personalizada (solo mía) {seleccion.usaPropia ? "· activa ✓" : ""}
        </summary>
        <FirmaPropia firmaHtml={firmaHtml} imagenUrl={imagenUrl} />
      </details>

      {editando ? (
        <EditorPlantillaFirma
          plantilla={editando === "nueva" ? null : editando}
          nombreMuestra={nombre || "Tu nombre"}
          cargoMuestra={cargo}
          cerrar={() => setEditando(null)}
          alGuardar={(id) => { setEditando(null); setTemplateId(id); router.refresh(); }}
        />
      ) : null}
    </div>
  );
}

function BotonPlantilla({ activa, onClick, nombre, detalle }: { activa: boolean; onClick: () => void; nombre: string; detalle: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("rounded-lg border px-3 py-2 text-left", activa ? "border-primary/50 bg-primary/10" : "border-border hover:bg-muted")}>
      <span className={cn("block text-[12.5px] font-semibold", activa && "text-primary")}>{nombre}</span>
      <span className="block text-[10.5px] text-muted-foreground">{detalle}</span>
    </button>
  );
}

// ── El EDITOR de una plantilla corporativa ──────────────────────────────────
// Aquí se estructura la firma de Labstream: texto con formato, los campos {{nombre}} y
// {{cargo}} donde van, y el logo compartido. La vista previa de abajo usa los datos de
// muestra del que edita — se ve el resultado final mientras se arma.
function EditorPlantillaFirma({ plantilla, nombreMuestra, cargoMuestra, cerrar, alGuardar }: {
  plantilla: PlantillaFirmaVM | null;
  nombreMuestra: string;
  cargoMuestra: string;
  cerrar: () => void;
  alGuardar: (id: string) => void;
}) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const [nombre, setNombre] = React.useState(plantilla?.nombre ?? "");
  const [html, setHtml] = React.useState(
    plantilla?.html ??
      `<b>{{nombre}}</b> · {{cargo}}<br>Labstream Studio · <a href="https://labstreamsas.com">labstreamsas.com</a><br><span style="color:#71717a">Bogotá, Colombia</span>`,
  );
  const [nombreImagen, setNombreImagen] = React.useState<string | null>(null);
  const [quitarImagen, setQuitarImagen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, arranca] = React.useTransition();
  const [pendienteBorrar, arrancaBorrar] = React.useTransition();
  const router = useRouter();

  const manda = (cmd: string, valor?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, valor);
    setHtml(editorRef.current?.innerHTML ?? "");
  };
  const insertaCampo = (campo: "nombre" | "cargo") => manda("insertHTML", `{{${campo}}}`);

  const guardar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (plantilla) fd.set("id", plantilla.id);
    fd.set("html", editorRef.current?.innerHTML ?? "");
    if (quitarImagen) fd.set("quitarImagen", "1");
    setError(null);
    arranca(async () => {
      const r = await guardarPlantillaFirma(fd);
      if (!r.ok || !r.id) { setError(r.error ?? "No se pudo guardar."); return; }
      alGuardar(r.id);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={cerrar}>
      <form onSubmit={guardar} onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-2xl">
        <h3 className="text-sm font-semibold">{plantilla ? `Editar «${plantilla.nombre}»` : "Nueva plantilla de firma del estudio"}</h3>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          Estructura la firma UNA vez con los campos <b>{"{{nombre}}"}</b> y <b>{"{{cargo}}"}</b> — cada colaborador solo pondrá los suyos.
          Cambiarla aquí la cambia para todos los que la usan.
        </p>

        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-[12px] font-medium">Nombre de la plantilla</span>
          <input name="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={80} placeholder="Labstream 2026"
            className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-0.5 rounded-t-lg border border-b-0 border-input px-1.5 py-1">
          {([["bold", "N", "Negrita"], ["italic", "C", "Cursiva"], ["underline", "S", "Subrayado"]] as const).map(([cmd, l, t]) => (
            <button key={cmd} type="button" title={t} onMouseDown={(e) => { e.preventDefault(); manda(cmd); }}
              className="rounded px-2 py-1 text-[12px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground">{l}</button>
          ))}
          <button type="button" title="Enlace" onMouseDown={(e) => {
            e.preventDefault();
            const url = window.prompt("Dirección del enlace (https://…)");
            if (url && /^https?:\/\//i.test(url)) manda("createLink", url);
          }} className="rounded px-2 py-1 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground">🔗</button>
          <span className="mx-1 h-4 w-px bg-border" />
          <button type="button" onMouseDown={(e) => { e.preventDefault(); insertaCampo("nombre"); }}
            className="rounded bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/20">+ {"{{nombre}}"}</button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); insertaCampo("cargo"); }}
            className="rounded bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/20">+ {"{{cargo}}"}</button>
        </div>
        <div
          ref={editorRef}
          contentEditable
          role="textbox"
          aria-label="Estructura de la firma"
          onInput={() => setHtml(editorRef.current?.innerHTML ?? "")}
          dangerouslySetInnerHTML={{ __html: html }}
          className="min-h-24 rounded-b-lg border border-input px-3 py-2 text-[13px] leading-relaxed outline-none focus:ring-2 focus:ring-ring [&_a]:text-primary [&_a]:underline"
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          {plantilla?.tieneImagen && !quitarImagen && !nombreImagen ? (
            <span className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/correo/firma-plantilla/${plantilla.id}`} alt="" className="max-h-14 rounded-md border border-border" />
              <button type="button" onClick={() => setQuitarImagen(true)} className="text-[11.5px] font-medium text-destructive hover:underline">Quitar</button>
            </span>
          ) : null}
          <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            <Upload className="size-3.5" /> {nombreImagen ?? "Logo o banner (PNG a 2×, máx. 500 KB)"}
            <input type="file" name="imagen" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
              onChange={(e) => { setNombreImagen(e.target.files?.[0]?.name ?? null); setQuitarImagen(false); }} />
          </label>
        </div>

        {/* Vista previa con los datos de muestra del que edita */}
        <div className="mt-3 rounded-lg border border-dashed border-border bg-background px-4 py-3">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Vista previa (con tus datos de muestra)</p>
          <div className="text-[13px] leading-relaxed [&_a]:text-primary [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: conCampos(html, nombreMuestra, cargoMuestra) }} />
          {plantilla?.tieneImagen && !quitarImagen ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={`/api/correo/firma-plantilla/${plantilla.id}`} alt="" className="mt-2 max-w-[260px]" />
          ) : null}
        </div>

        {error ? <p className="mt-2 text-[12px] font-medium text-destructive">{error}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pendiente}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Guardar plantilla
          </button>
          <button type="button" onClick={cerrar} className="rounded-md border border-border px-3 py-2 text-[12.5px] font-medium hover:bg-accent">Cancelar</button>
          {plantilla ? (
            <button type="button" disabled={pendienteBorrar}
              onClick={() => {
                if (!window.confirm(`¿Eliminar «${plantilla.nombre}» para todo el equipo? Quienes la usan vuelven a la firma básica.`)) return;
                arrancaBorrar(async () => { await eliminarPlantillaFirma(plantilla.id); cerrar(); router.refresh(); });
              }}
              className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-destructive hover:underline disabled:opacity-50">
              <Trash2 className="size-3.5" /> Eliminar
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

// La firma PERSONALIZADA de siempre, plegada bajo el flujo principal.
function FirmaPropia({ firmaHtml, imagenUrl }: { firmaHtml: string; imagenUrl: string | null }) {
  const router = useRouter();
  const editorRef = React.useRef<HTMLDivElement>(null);
  const [quitarImagen, setQuitarImagen] = React.useState(false);
  const [nombreImagen, setNombreImagen] = React.useState<string | null>(null);
  const [estado, setEstado] = React.useState<"quieto" | "guardando" | "listo" | string>("quieto");
  const inicial = React.useRef(firmaHtml);

  const guardar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("firmaHtml", editorRef.current?.innerHTML ?? "");
    if (quitarImagen) fd.set("quitarImagen", "1");
    setEstado("guardando");
    void guardarFirma(fd).then((r) => {
      if (!r.ok) { setEstado(r.error ?? "No se pudo guardar."); return; }
      setEstado("listo");
      setNombreImagen(null);
      setQuitarImagen(false);
      router.refresh();
    });
  };

  const manda = (cmd: string, valor?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, valor);
  };

  return (
    <form onSubmit={guardar} className="mt-3">
      <div className="flex items-center gap-0.5 rounded-t-lg border border-b-0 border-input px-1.5 py-1">
        {([["bold", "N", "Negrita"], ["italic", "C", "Cursiva"], ["underline", "S", "Subrayado"]] as const).map(([cmd, l, t]) => (
          <button key={cmd} type="button" title={t} onMouseDown={(e) => { e.preventDefault(); manda(cmd); }}
            className="rounded px-2 py-1 text-[12px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground">{l}</button>
        ))}
        <button type="button" title="Enlace" onMouseDown={(e) => {
          e.preventDefault();
          const url = window.prompt("Dirección del enlace (https://…)");
          if (url && /^https?:\/\//i.test(url)) manda("createLink", url);
        }} className="rounded px-2 py-1 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground">🔗</button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-label="Texto de la firma personalizada"
        data-placeholder="p. ej. Diana Ruiz · Productora — 300 000 0000"
        dangerouslySetInnerHTML={{ __html: inicial.current }}
        className="min-h-20 rounded-b-lg border border-input px-3 py-2 text-[13px] leading-relaxed outline-none focus:ring-2 focus:ring-ring empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_a]:text-primary [&_a]:underline"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {imagenUrl && !quitarImagen ? (
          <span className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagenUrl} alt="Imagen de la firma" className="max-h-16 rounded-md border border-border" />
            <button type="button" onClick={() => setQuitarImagen(true)} className="text-[11.5px] font-medium text-destructive hover:underline">Quitar imagen</button>
          </span>
        ) : (
          <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            <Upload className="size-3.5" /> {nombreImagen ?? "Imagen propia (PNG a 2×, máx. 500 KB)"}
            <input type="file" name="imagen" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
              onChange={(e) => { setNombreImagen(e.target.files?.[0]?.name ?? null); setQuitarImagen(false); }} />
          </label>
        )}
        <button type="submit" disabled={estado === "guardando"}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-[13px] font-semibold hover:bg-accent disabled:opacity-50">
          {estado === "guardando" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Usar la personalizada
        </button>
      </div>
      {estado === "listo" ? <p className="mt-2 text-[12px] font-medium text-emerald-600 dark:text-emerald-400">Guardada y activa ✓</p> : null}
      {estado !== "quieto" && estado !== "guardando" && estado !== "listo" ? <p className="mt-2 text-[12px] font-medium text-destructive">{estado}</p> : null}
      <p className="mt-2 text-[11px] text-muted-foreground">
        💡 Las imágenes viajan INCRUSTADAS: se ven siempre (Gmail no las esconde) y en nítido — súbelas al doble del tamaño final.
      </p>
    </form>
  );
}

export function BibliotecaGifs({ gifs }: { gifs: (GifVM & { autor: string | null })[] }) {
  const router = useRouter();
  const [pendiente, arranca] = React.useTransition();
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold">GIFs del estudio</h3>
      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
        La biblioteca compartida del equipo: se insertan desde el redactor (😊) y viajan incrustados, animados de verdad en la bandeja del cliente.
      </p>
      {gifs.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted-foreground">
          Aún no hay GIFs. Sube el primero desde el redactor: botón 😊 → «Subir GIF».
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {gifs.map((g) => (
            <figure key={g.id} className="group relative overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/correo/gif/${g.id}`} alt={g.nombre} loading="lazy" className="aspect-square w-full object-cover" />
              <figcaption className="truncate px-1.5 py-1 text-[10.5px] text-muted-foreground">{g.nombre}{g.autor ? ` · ${g.autor}` : ""}</figcaption>
              <button type="button" title="Quitar de la biblioteca" disabled={pendiente}
                onClick={() => arranca(async () => { await eliminarGif(g.id); router.refresh(); })}
                className="absolute right-1 top-1 hidden rounded-full bg-background/90 p-1.5 text-destructive shadow group-hover:block">
                <Trash2 className="size-3.5" />
              </button>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
