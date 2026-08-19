"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Code2, Loader2, PenLine, Plus, Trash2, Upload, Wand2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { elegirFirma, eliminarGif, eliminarPlantillaFirma, guardarFirma, guardarPlantillaFirma } from "./acciones";
import { DISENO_BASE, generarHtmlFirma, normalizarDiseno, PALETA_FIRMA, REDES_SUGERIDAS, type DisenoFirma } from "@/lib/correo/firma-diseno";
import type { GifVM } from "./compositor";

// ── Panel «Firma y GIFs» ────────────────────────────────────────────────────
// La firma se ELIGE viendo: cada plantilla se pinta de verdad (con tu nombre) sobre tarjeta
// BLANCA — el fondo real de la bandeja del cliente, no el tema de la app. Y se DISEÑA con un
// formulario (datos + layout + color): el HTML de correo lo genera la casa, nadie lo escribe.

export type PlantillaFirmaVM = { id: string; nombre: string; html: string; tieneImagen: boolean; autor: string | null; config: unknown };

// Sustitución de campos para la VISTA PREVIA — el ESPEJO exacto de aplicarPlantillaFirma
// del servidor, barrido de líneas vacías incluido: la previa no puede mentir.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const conCampos = (html: string, nombre: string, cargo: string) =>
  html
    .replace(/\{\{\s*nombre\s*\}\}/gi, esc(nombre || "Tu nombre"))
    .replace(/\{\{\s*cargo\s*\}\}/gi, esc(cargo))
    .replace(/<span[^>]*>\s*<\/span>(<br\s*\/?>|\s*·\s*)?/gi, "");

/** El html listo para pintar: campos puestos y el cid del logo resuelto a su URL. */
const previewDe = (p: PlantillaFirmaVM, nombre: string, cargo: string) => {
  const integrado = /cid:firma@labstream/i.test(p.html);
  let html = conCampos(p.html, nombre, cargo);
  if (integrado) html = html.replace(/cid:firma@labstream/gi, p.tieneImagen ? `/api/correo/firma-plantilla/${p.id}` : "");
  return { html, anexarImg: p.tieneImagen && !integrado };
};

/** Tarjeta BLANCA de vista previa: el fondo del correo real, en cualquier tema de la app. */
function LienzoCorreo({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-white text-[#18181b] shadow-sm [&_a]:text-inherit", className)}>
      {children}
    </div>
  );
}

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
  const basicaHtml = `—<br><b>${esc(nombre || "Tu nombre")}</b>${cargo ? ` · ${esc(cargo)}` : ""}<br>Labstream Studio · <span style="color:#0369a1;text-decoration:underline">labstreamsas.com</span>`;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Tu firma</h3>
      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
        Tu nombre y tu cargo, y abajo eliges el diseño VIENDO cada firma ya con tus datos — sobre blanco, como la verá el cliente.
      </p>

      {/* 1 · Los campos que cada quien SÍ cambia */}
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

      {/* 2 · La galería: cada plantilla PINTADA de verdad, elegible con un clic */}
      <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
        <TarjetaFirma
          nombre="Básica"
          detalle="nombre + cargo + Labstream"
          activa={templateId === null && !seleccion.usaPropia}
          onClick={() => setTemplateId(null)}
        >
          <div className="text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: basicaHtml }} />
        </TarjetaFirma>
        {plantillas.map((p) => {
          const previa = previewDe(p, nombre, cargo);
          return (
            <TarjetaFirma
              key={p.id}
              nombre={p.nombre}
              detalle={p.autor ? `de ${p.autor}` : "del estudio"}
              activa={templateId === p.id}
              onClick={() => setTemplateId(p.id)}
              onEditar={() => setEditando(p)}
            >
              <div dangerouslySetInnerHTML={{ __html: previa.html }} />
              {previa.anexarImg ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={`/api/correo/firma-plantilla/${p.id}`} alt="" className="mt-2 max-w-[220px]" />
              ) : null}
            </TarjetaFirma>
          );
        })}
        <button
          type="button"
          onClick={() => setEditando("nueva")}
          className="flex w-44 shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border text-muted-foreground hover:border-primary/40 hover:bg-muted hover:text-foreground"
        >
          <Wand2 className="size-5" />
          <span className="text-[12.5px] font-semibold">Diseñar nueva</span>
          <span className="px-3 text-center text-[10.5px]">datos + layout + color, sin tocar HTML</span>
        </button>
      </div>

      {/* 3 · La elegida, en grande — el fondo blanco es el del correo real */}
      <LienzoCorreo className="mt-1 px-5 py-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">Así la ve el cliente</p>
        {activa ? (
          (() => {
            const previa = previewDe(activa, nombre, cargo);
            return (
              <div className="text-[13px] leading-relaxed">
                <div dangerouslySetInnerHTML={{ __html: previa.html }} />
                {previa.anexarImg ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={`/api/correo/firma-plantilla/${activa.id}`} alt="" className="mt-2 max-w-[260px]" />
                ) : null}
              </div>
            );
          })()
        ) : (
          <div className="text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: basicaHtml }} />
        )}
      </LienzoCorreo>

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
        <DisenadorFirma
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

// Una plantilla en la galería: la firma DE VERDAD, en miniatura, sobre blanco.
function TarjetaFirma({ nombre, detalle, activa, onClick, onEditar, children }: {
  nombre: string;
  detalle: string;
  activa: boolean;
  onClick: () => void;
  onEditar?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="w-64 shrink-0">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={activa}
        className={cn(
          "group relative block h-36 w-full overflow-hidden rounded-xl border bg-white text-left text-[#18181b] shadow-sm transition-shadow hover:shadow-md",
          activa ? "border-primary ring-2 ring-primary" : "border-border",
        )}
      >
        {/* La firma se pinta a tamaño real y se ESCALA: miniatura fiel, no una maqueta. */}
        <div className="pointer-events-none w-[420px] origin-top-left scale-[0.6] p-4 text-[13px] leading-relaxed">{children}</div>
        {activa ? (
          <span className="absolute right-2 top-2 rounded-full bg-primary p-1 text-primary-foreground"><Check className="size-3" /></span>
        ) : null}
        {onEditar ? (
          <span
            role="button"
            tabIndex={0}
            title="Editar esta plantilla"
            onClick={(e) => { e.stopPropagation(); onEditar(); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onEditar(); } }}
            className="absolute bottom-2 right-2 hidden rounded-full border border-border bg-white p-1.5 text-[#71717a] shadow group-hover:block hover:text-[#18181b]"
          >
            <PenLine className="size-3.5" />
          </span>
        ) : null}
      </button>
      <p className="mt-1.5 px-1 text-[11.5px]">
        <span className={cn("font-semibold", activa && "text-primary")}>{nombre}</span>
        <span className="text-muted-foreground"> · {detalle}</span>
      </p>
    </div>
  );
}

// ── El DISEÑADOR de la plantilla corporativa ────────────────────────────────
// Formulario a la izquierda (datos, layout, color, logo), la firma VIVA a la derecha —
// generada por la MISMA función que usará el servidor al guardar: la previa es exacta por
// construcción. El modo HTML queda para quien quiere el control total.
function DisenadorFirma({ plantilla, nombreMuestra, cargoMuestra, cerrar, alGuardar }: {
  plantilla: PlantillaFirmaVM | null;
  nombreMuestra: string;
  cargoMuestra: string;
  cerrar: () => void;
  alGuardar: (id: string) => void;
}) {
  const router = useRouter();
  const configInicial = React.useMemo(() => (plantilla?.config ? normalizarDiseno(plantilla.config) : null), [plantilla]);
  // Plantilla vieja escrita a mano (sin config) → abre en HTML; lo demás, en el diseñador.
  const [modo, setModo] = React.useState<"diseno" | "html">(plantilla && !configInicial ? "html" : "diseno");
  const [d, setD] = React.useState<DisenoFirma>(configInicial ?? DISENO_BASE);
  const [nombre, setNombre] = React.useState(plantilla?.nombre ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, arranca] = React.useTransition();
  const [pendienteBorrar, arrancaBorrar] = React.useTransition();

  // El logo: el guardado, el recién elegido (previa instantánea por blob) o ninguno.
  const [archivoLogo, setArchivoLogo] = React.useState<File | null>(null);
  const [blobLogo, setBlobLogo] = React.useState<string | null>(null);
  const [quitarImagen, setQuitarImagen] = React.useState(false);
  const conImagen = !!archivoLogo || (!!plantilla?.tieneImagen && !quitarImagen);
  const urlLogo = blobLogo ?? (plantilla?.tieneImagen ? `/api/correo/firma-plantilla/${plantilla.id}` : null);
  React.useEffect(() => () => { if (blobLogo) URL.revokeObjectURL(blobLogo); }, [blobLogo]);

  // Modo HTML (avanzado): el editor de siempre.
  const editorRef = React.useRef<HTMLDivElement>(null);
  const htmlInicial = React.useRef(
    plantilla?.html ??
      `<b>{{nombre}}</b> · {{cargo}}<br>Labstream Studio · <a href="https://labstreamsas.com">labstreamsas.com</a>`,
  );
  const manda = (cmd: string, valor?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, valor);
  };

  // La previa: LA MISMA función del servidor + los datos de muestra del que edita.
  const htmlPrevia = React.useMemo(() => {
    const base = generarHtmlFirma(d, { conImagen });
    return conCampos(base, nombreMuestra, cargoMuestra).replace(/cid:firma@labstream/gi, urlLogo ?? "");
  }, [d, conImagen, urlLogo, nombreMuestra, cargoMuestra]);

  const guardar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (plantilla) fd.set("id", plantilla.id);
    if (modo === "diseno") fd.set("config", JSON.stringify(d));
    else fd.set("html", editorRef.current?.innerHTML ?? "");
    if (quitarImagen && !archivoLogo) fd.set("quitarImagen", "1");
    setError(null);
    arranca(async () => {
      const r = await guardarPlantillaFirma(fd);
      if (!r.ok || !r.id) { setError(r.error ?? "No se pudo guardar."); return; }
      alGuardar(r.id);
    });
  };

  const campo = "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-ring";
  const usaLogoLateral = conImagen && (d.layout === "clasica" || d.layout === "apilada");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={cerrar}>
      <form onSubmit={guardar} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">{plantilla ? `Editar «${plantilla.nombre}»` : "Diseñar la firma del estudio"}</h3>
          <p className="hidden text-[11px] text-muted-foreground sm:block">— cambiarla la cambia para todos los que la usan</p>
          <button type="button" onClick={cerrar} aria-label="Cerrar" className="ml-auto rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
          {/* ── Izquierda: el formulario ── */}
          <div className="space-y-4 border-border p-4 lg:overflow-y-auto lg:border-r">
            <label className="block text-sm">
              <span className="mb-1 block text-[12px] font-medium">Nombre de la plantilla</span>
              <input name="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={80} placeholder="Labstream 2026" className={campo} />
            </label>

            {modo === "html" ? (
              <>
                <div>
                  <div className="flex flex-wrap items-center gap-0.5 rounded-t-lg border border-b-0 border-input px-1.5 py-1">
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
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); manda("insertHTML", "{{nombre}}"); }}
                      className="rounded bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/20">+ {"{{nombre}}"}</button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); manda("insertHTML", "{{cargo}}"); }}
                      className="rounded bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/20">+ {"{{cargo}}"}</button>
                  </div>
                  <div
                    ref={editorRef}
                    contentEditable
                    role="textbox"
                    aria-label="HTML de la firma"
                    dangerouslySetInnerHTML={{ __html: htmlInicial.current }}
                    className="min-h-28 rounded-b-lg border border-input px-3 py-2 text-[13px] leading-relaxed outline-none focus:ring-2 focus:ring-ring [&_a]:text-primary [&_a]:underline"
                  />
                </div>
                <button type="button" onClick={() => setModo("diseno")} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline">
                  <Wand2 className="size-3.5" /> Volver al diseñador {configInicial ? "" : "(al guardar, reemplaza este HTML)"}
                </button>
              </>
            ) : (
              <>
                {/* Layout: cuatro formas, dibujadas */}
                <div>
                  <span className="mb-1.5 block text-[12px] font-medium">Diseño</span>
                  <div className="grid grid-cols-4 gap-2">
                    {([
                      ["clasica", "Clásica", <div key="c" className="flex items-center gap-1"><span className="size-3.5 rounded-sm bg-current opacity-40" /><span className="h-4 w-px bg-current" /><span className="space-y-0.5"><span className="block h-0.5 w-5 bg-current" /><span className="block h-0.5 w-4 bg-current opacity-50" /></span></div>],
                      ["apilada", "Apilada", <div key="a" className="space-y-1"><span className="block h-0.5 w-6 bg-current" /><span className="block h-0.5 w-5 bg-current opacity-50" /><span className="block size-3 rounded-sm bg-current opacity-40" /></div>],
                      ["banner", "Banner", <div key="b" className="space-y-1"><span className="block h-0.5 w-6 bg-current" /><span className="block h-0.5 w-5 bg-current opacity-50" /><span className="block h-2 w-8 rounded-sm bg-current opacity-40" /></div>],
                      ["texto", "Solo texto", <div key="t" className="space-y-1"><span className="block h-0.5 w-6 bg-current" /><span className="block h-0.5 w-5 bg-current opacity-50" /><span className="block h-0.5 w-4 bg-current opacity-30" /></div>],
                    ] as const).map(([valor, etiqueta, dibujo]) => (
                      <button key={valor} type="button" onClick={() => setD((p) => ({ ...p, layout: valor }))}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-muted-foreground",
                          d.layout === valor ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted",
                        )}>
                        {dibujo}
                        <span className="text-[10.5px] font-semibold">{etiqueta}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color de acento (la paleta del estudio) */}
                <div>
                  <span className="mb-1.5 block text-[12px] font-medium">Color de acento</span>
                  <div className="flex gap-1.5">
                    {PALETA_FIRMA.map((hex) => (
                      <button key={hex} type="button" aria-label={`Acento ${hex}`} onClick={() => setD((p) => ({ ...p, acento: hex }))}
                        className={cn("size-7 rounded-full border-2", d.acento === hex ? "border-primary ring-2 ring-primary/30" : "border-transparent")}
                        style={{ background: hex }} />
                    ))}
                  </div>
                </div>

                {/* Datos del estudio */}
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className="text-sm"><span className="mb-1 block text-[12px] font-medium">Empresa</span>
                    <input value={d.empresa} onChange={(e) => setD((p) => ({ ...p, empresa: e.target.value }))} maxLength={80} className={campo} /></label>
                  <label className="text-sm"><span className="mb-1 block text-[12px] font-medium">Ciudad</span>
                    <input value={d.ciudad} onChange={(e) => setD((p) => ({ ...p, ciudad: e.target.value }))} maxLength={80} placeholder="Bogotá, Colombia" className={campo} /></label>
                  <label className="text-sm"><span className="mb-1 block text-[12px] font-medium">Sitio web</span>
                    <input value={d.web} onChange={(e) => setD((p) => ({ ...p, web: e.target.value }))} maxLength={120} placeholder="labstreamsas.com" className={campo} /></label>
                  <label className="text-sm"><span className="mb-1 block text-[12px] font-medium">Teléfono / WhatsApp</span>
                    <input value={d.telefono} onChange={(e) => setD((p) => ({ ...p, telefono: e.target.value }))} maxLength={40} placeholder="+57 300 000 0000" className={campo} /></label>
                </div>

                {/* Redes (hasta 4) */}
                <div>
                  <span className="mb-1.5 block text-[12px] font-medium">Redes</span>
                  <div className="space-y-1.5">
                    {d.redes.map((r, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <input value={r.etiqueta} list="firma-redes" placeholder="Instagram" maxLength={24}
                          onChange={(e) => setD((p) => ({ ...p, redes: p.redes.map((x, j) => (j === i ? { ...x, etiqueta: e.target.value } : x)) }))}
                          className={cn(campo, "w-32 shrink-0")} />
                        <input value={r.url} placeholder="instagram.com/labstream" maxLength={300}
                          onChange={(e) => setD((p) => ({ ...p, redes: p.redes.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) }))}
                          className={campo} />
                        <button type="button" aria-label="Quitar red" onClick={() => setD((p) => ({ ...p, redes: p.redes.filter((_, j) => j !== i) }))}
                          className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"><X className="size-3.5" /></button>
                      </div>
                    ))}
                    {d.redes.length < 4 ? (
                      <button type="button" onClick={() => setD((p) => ({ ...p, redes: [...p.redes, { etiqueta: "", url: "" }] }))}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"><Plus className="size-3.5" /> Añadir red</button>
                    ) : null}
                    <datalist id="firma-redes">{REDES_SUGERIDAS.map((r) => <option key={r} value={r} />)}</datalist>
                  </div>
                </div>

                {/* Logo */}
                <div className="flex flex-wrap items-center gap-3">
                  {urlLogo && !archivoLogo && plantilla?.tieneImagen && !quitarImagen ? (
                    <span className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={urlLogo} alt="" className="max-h-12 rounded-md border border-border" />
                      <button type="button" onClick={() => setQuitarImagen(true)} className="text-[11.5px] font-medium text-destructive hover:underline">Quitar</button>
                    </span>
                  ) : null}
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Upload className="size-3.5" /> {archivoLogo?.name ?? "Logo o banner (PNG a 2×, máx. 500 KB)"}
                    <input type="file" name="imagen" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        setArchivoLogo(f);
                        setQuitarImagen(false);
                        setBlobLogo((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : null; });
                      }} />
                  </label>
                  {usaLogoLateral ? (
                    <span className="flex items-center gap-1">
                      {([110, 160, 220] as const).map((w) => (
                        <button key={w} type="button" onClick={() => setD((p) => ({ ...p, anchoImagen: w }))}
                          className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", d.anchoImagen === w ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
                          {w === 110 ? "Chico" : w === 160 ? "Medio" : "Grande"}
                        </button>
                      ))}
                    </span>
                  ) : null}
                </div>

                <button type="button" onClick={() => setModo("html")} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:underline">
                  <Code2 className="size-3.5" /> Prefiero escribir el HTML a mano
                </button>
              </>
            )}
          </div>

          {/* ── Derecha: la firma VIVA, sobre el blanco del correo ── */}
          <div className="bg-muted/30 p-4 lg:overflow-y-auto">
            <LienzoCorreo className="px-5 py-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">Así va a salir — con tus datos de muestra</p>
              {modo === "diseno" ? (
                <div className="text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: htmlPrevia }} />
              ) : (
                <p className="text-[12px] text-[#71717a]">En modo HTML la previa vive abajo del panel principal — guarda y mírala en la galería.</p>
              )}
            </LienzoCorreo>
            <p className="mt-2 text-[11px] text-muted-foreground">
              El logo viaja INCRUSTADO (se ve siempre, nítido — Gmail no lo esconde). Cada colaborador solo pone su nombre y su cargo.
            </p>
          </div>
        </div>

        {/* ── Pie: guardar / cancelar / eliminar ── */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          {error ? <p className="w-full text-[12px] font-medium text-destructive">{error}</p> : null}
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
