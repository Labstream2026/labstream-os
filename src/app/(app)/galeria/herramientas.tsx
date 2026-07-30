"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, Upload, Link2, Folder, ChevronDown, ChevronRight, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { tone } from "@/lib/colors";
import { cerrarMenu } from "@/components/ui/barra-menu";
import { crearCarpetaGaleria, subirArchivoGaleria, vincularCarpetaCliente, vincularCarpetaProyecto } from "./herramientas-actions";

// ── Barra de herramientas de la galería ──
// Vive APARTE de galeria-cliente.tsx a propósito: aquel es el visor (línea de tiempo) y lo
// mantiene otra sesión; esta barra añade navegación por subcarpetas, crear/subir y el vínculo
// con cliente/proyecto sin tocarlo. Comparten estado por la URL (?rel=), nada más.

// `dueno`: el CLIENTE al que está vinculada la carpeta — su chip se tiñe con el color del
// cliente (la misma paleta de su cabecera), y el título dice de quién es.
export type SubcarpetaChip = { rel: string; name: string; dueno?: { nombre: string; color: string | null } | null };
export type VinculoChip = { tipo: "cliente" | "proyecto"; id: string; nombre: string; color?: string | null };
export type OpcionVinculo = { id: string; nombre: string };

export function GaleriaHerramientas({
  rel,
  subcarpetas,
  vinculos,
  clientes,
  proyectos,
  puedeEscribir,
  escrituraLista,
}: {
  rel: string;
  subcarpetas: SubcarpetaChip[];
  vinculos: VinculoChip[];
  clientes: OpcionVinculo[];
  proyectos: OpcionVinculo[];
  puedeEscribir: boolean;
  // El centinela y el montaje rw están: sin esto los botones de escribir se muestran apagados
  // con el motivo, en vez de fallar al primer clic.
  escrituraLista: boolean;
}) {
  const router = useRouter();
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [ocupado, setOcupado] = React.useState<string | null>(null); // qué está corriendo, para el spinner

  const navegar = React.useCallback(
    (destino: string) => {
      router.push(destino ? `/galeria?rel=${encodeURIComponent(destino)}` : "/galeria");
    },
    [router],
  );

  // ── Migas: Raíz / carpeta / subcarpeta ──
  const migas = rel ? rel.split("/") : [];

  // ── Nueva carpeta (input inline, sin modal) ──
  const [creando, setCreando] = React.useState(false);
  const [nombre, setNombre] = React.useState("");
  const crear = async () => {
    const n = nombre.trim();
    if (!n) return;
    setOcupado("carpeta");
    setAviso(null);
    const r = await crearCarpetaGaleria(rel, n);
    setOcupado(null);
    if ("error" in r) return setAviso(r.error);
    setCreando(false);
    setNombre("");
    if (r.rel) navegar(r.rel);
  };

  // ── Subir: de a un archivo por petición (el body de una action aguanta 100 MB) ──
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [progreso, setProgreso] = React.useState<{ hecho: number; total: number } | null>(null);
  const subir = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setAviso(null);
    setOcupado("subida");
    const errores: string[] = [];
    let hecho = 0;
    setProgreso({ hecho: 0, total: files.length });
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.set("file", file);
      try {
        const r = await subirArchivoGaleria(rel, fd);
        if ("error" in r) errores.push(r.error);
      } catch {
        errores.push(`«${file.name}» no se pudo subir (¿conexión cortada?).`);
      }
      hecho += 1;
      setProgreso({ hecho, total: files.length });
    }
    setOcupado(null);
    setProgreso(null);
    if (inputRef.current) inputRef.current.value = "";
    setAviso(errores.length ? errores.join(" · ") : `Subid${hecho === 1 ? "o 1 archivo" : `os ${hecho} archivos`}. Los videos salen como «preparando» hasta que LabTem fabrique su copia ligera.`);
    router.refresh();
  };

  // ── Vincular la carpeta actual ──
  const [vinculando, setVinculando] = React.useState<null | "cliente" | "proyecto">(null);
  const vincular = async (tipo: "cliente" | "proyecto", id: string) => {
    if (!id) return;
    setOcupado("vinculo");
    setAviso(null);
    const r = tipo === "cliente" ? await vincularCarpetaCliente(id, rel) : await vincularCarpetaProyecto(id, rel);
    setOcupado(null);
    setVinculando(null);
    if ("error" in r) return setAviso(r.error);
    router.refresh();
  };
  const desvincular = async (v: VinculoChip) => {
    setOcupado("vinculo");
    setAviso(null);
    const r = v.tipo === "cliente" ? await vincularCarpetaCliente(v.id, null) : await vincularCarpetaProyecto(v.id, null);
    setOcupado(null);
    if ("error" in r) return setAviso(r.error);
    router.refresh();
  };

  const botonCls = "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="mb-4 space-y-2">
      {/* Migas: solo DENTRO de una carpeta. En la raíz eran un «Galería» suelto sin nada que
          navegar, compitiendo con el título de la página justo debajo. */}
      {/* En ESCRITORIO el árbol lateral ya dice dónde estás y deja ir a cualquier nivel de un
          clic: repetirlo aquí era ruido. En móvil el árbol es un cajón, así que las migas se
          quedan — son la única pista de ubicación visible sin abrirlo. */}
      {rel && (
        <div className="flex flex-wrap items-center gap-1 text-sm md:hidden">
          <button type="button" onClick={() => navegar("")} className="rounded px-1.5 py-0.5 hover:bg-accent">
            Galería
          </button>
          {migas.map((seg, i) => {
            const destino = migas.slice(0, i + 1).join("/");
            const ultimo = i === migas.length - 1;
            return (
              <React.Fragment key={destino}>
                <ChevronRight className="size-3.5 text-muted-foreground" />
                <button
                  type="button"
                  onClick={() => navegar(destino)}
                  className={cn("max-w-[16rem] truncate rounded px-1.5 py-0.5 hover:bg-accent", ultimo && "font-semibold")}
                >
                  {seg.replace(/_/g, " ")}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {((rel && subcarpetas.length > 0) || puedeEscribir || vinculos.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Chips de subcarpeta: solo dentro de una carpeta (la línea de tiempo la aplana y
              esto la devuelve a la vista). En la raíz DUPLICABAN el índice: las mismas 30
              entregas como chips y como tarjetas, una debajo de la otra. */}
          {(rel ? subcarpetas : []).map((s) => (
            <button
              key={s.rel}
              type="button"
              onClick={() => navegar(s.rel)}
              title={s.dueno ? `Carpeta de ${s.dueno.nombre}` : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs",
                // Carpeta de un cliente → teñida con SU color (hover un pelín más presente vía brightness).
                s.dueno ? cn(tone(s.dueno.color ?? "slate").chip, "font-medium hover:brightness-95 dark:hover:brightness-110") : "bg-card hover:bg-accent",
              )}
            >
              <Folder className={cn("size-3.5", s.dueno ? "opacity-70" : "text-muted-foreground")} />
              <span className="max-w-[14rem] truncate">{s.name.replace(/_/g, " ")}</span>
            </button>
          ))}

          {vinculos.map((v) => (
            <span
              key={`${v.tipo}-${v.id}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs",
                // El chip del vínculo de cliente también lleva su color: se ve al entrar a la carpeta.
                v.tipo === "cliente" && v.color ? tone(v.color).chip : "border-primary/30 bg-primary/5",
              )}
            >
              <Link2 className="size-3.5" />
              {v.tipo === "cliente" ? "Cliente:" : "Proyecto:"} <span className="font-medium">{v.nombre}</span>
              {puedeEscribir && (
                <button type="button" title="Desvincular" onClick={() => desvincular(v)} className="ml-0.5 rounded hover:bg-accent">
                  <X className="size-3" />
                </button>
              )}
            </span>
          ))}

          {puedeEscribir && (
            <span className="ml-auto flex flex-wrap items-center gap-1.5">
              <input ref={inputRef} type="file" multiple hidden onChange={(e) => void subir(e.target.files)} />

              {/* «Añadir ▾»: crear carpeta y subir viven plegados en un solo botón. Con el
                  input de nueva carpeta abierto, el menú cede su sitio a ese formulario. */}
              {creando ? (
                <span className="inline-flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void crear();
                      if (e.key === "Escape") setCreando(false);
                    }}
                    placeholder="Nombre de la carpeta"
                    className="h-8 w-48 rounded-md border bg-background px-2 text-xs"
                  />
                  <button type="button" onClick={() => void crear()} disabled={ocupado === "carpeta" || !nombre.trim()} className={botonCls}>
                    {ocupado === "carpeta" ? <Loader2 className="size-3.5 animate-spin" /> : "Crear"}
                  </button>
                  <button type="button" onClick={() => setCreando(false)} className={botonCls}>
                    Cancelar
                  </button>
                </span>
              ) : !escrituraLista || ocupado === "subida" ? (
                <button
                  type="button"
                  disabled
                  title={escrituraLista ? undefined : "La galería está en solo lectura (falta el montaje rw + el centinela en LabTem)"}
                  className={botonCls}
                >
                  {progreso ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> {progreso.hecho}/{progreso.total}
                    </>
                  ) : (
                    <>
                      <Plus className="size-3.5" /> Añadir
                    </>
                  )}
                </button>
              ) : (
                /* <details data-autoclose>: DetailsAutoClose (en el shell) lo cierra al pulsar
                   fuera y COLOCA la caja (fixed + volteo si no cabe abajo), como todos los menús. */
                <details data-autoclose className="group/add relative">
                  <summary className={cn(botonCls, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
                    <Plus className="size-3.5" /> Añadir
                    <ChevronDown className="size-3 opacity-70 transition-transform group-open/add:rotate-180" />
                  </summary>
                  <div className="absolute right-0 z-20 mt-1 flex w-44 flex-col rounded-lg border bg-popover p-1 shadow-lg">
                    <button
                      type="button"
                      onClick={(e) => {
                        cerrarMenu(e);
                        setCreando(true);
                      }}
                      className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-accent"
                    >
                      <FolderPlus className="size-3.5 text-muted-foreground" /> Nueva carpeta
                    </button>
                    {/* En la raíz no se sube (el servidor lo rechaza): la opción ni aparece. */}
                    {rel ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          cerrarMenu(e);
                          inputRef.current?.click();
                        }}
                        className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-accent"
                      >
                        <Upload className="size-3.5 text-muted-foreground" /> Subir archivos…
                      </button>
                    ) : null}
                  </div>
                </details>
              )}

              {rel && vinculos.length === 0 && (
                <>
                  {vinculando ? (
                    <select
                      autoFocus
                      defaultValue=""
                      onChange={(e) => void vincular(vinculando, e.target.value)}
                      onBlur={() => setVinculando(null)}
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                    >
                      <option value="" disabled>
                        {vinculando === "cliente" ? "¿De qué cliente es esta carpeta?" : "¿De qué proyecto?"}
                      </option>
                      {(vinculando === "cliente" ? clientes : proyectos).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.nombre}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <details data-autoclose className="group/vinc relative">
                      <summary className={cn(botonCls, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
                        <Link2 className="size-3.5" /> Vincular
                        <ChevronDown className="size-3 opacity-70 transition-transform group-open/vinc:rotate-180" />
                      </summary>
                      <div className="absolute right-0 z-20 mt-1 flex w-44 flex-col rounded-lg border bg-popover p-1 shadow-lg">
                        <button
                          type="button"
                          onClick={(e) => {
                            cerrarMenu(e);
                            setVinculando("cliente");
                          }}
                          className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-accent"
                        >
                          <Link2 className="size-3.5 text-muted-foreground" /> A un cliente…
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            cerrarMenu(e);
                            setVinculando("proyecto");
                          }}
                          className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-accent"
                        >
                          <Link2 className="size-3.5 text-muted-foreground" /> A un proyecto…
                        </button>
                      </div>
                    </details>
                  )}
                </>
              )}
            </span>
          )}
        </div>
      )}

      {aviso && (
        <p className="rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground">
          {aviso}
          <button type="button" onClick={() => setAviso(null)} className="ml-2 underline">
            cerrar
          </button>
        </p>
      )}
    </div>
  );
}
