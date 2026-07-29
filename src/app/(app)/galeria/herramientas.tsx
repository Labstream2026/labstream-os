"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, Upload, Link2, Folder, ChevronRight, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { crearCarpetaGaleria, subirArchivoGaleria, vincularCarpetaCliente, vincularCarpetaProyecto } from "./herramientas-actions";

// ── Barra de herramientas de la galería ──
// Vive APARTE de galeria-cliente.tsx a propósito: aquel es el visor (línea de tiempo) y lo
// mantiene otra sesión; esta barra añade navegación por subcarpetas, crear/subir y el vínculo
// con cliente/proyecto sin tocarlo. Comparten estado por la URL (?rel=), nada más.

export type SubcarpetaChip = { rel: string; name: string };
export type VinculoChip = { tipo: "cliente" | "proyecto"; id: string; nombre: string };
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
      {/* Migas + subcarpetas: la línea de tiempo aplana el árbol, esto lo devuelve a la vista */}
      <div className="flex flex-wrap items-center gap-1 text-sm">
        <button type="button" onClick={() => navegar("")} className={cn("rounded px-1.5 py-0.5 hover:bg-accent", !rel && "font-semibold")}>
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

      {(subcarpetas.length > 0 || puedeEscribir || vinculos.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {subcarpetas.map((s) => (
            <button
              key={s.rel}
              type="button"
              onClick={() => navegar(s.rel)}
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs hover:bg-accent"
            >
              <Folder className="size-3.5 text-muted-foreground" />
              <span className="max-w-[14rem] truncate">{s.name.replace(/_/g, " ")}</span>
            </button>
          ))}

          {vinculos.map((v) => (
            <span key={`${v.tipo}-${v.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs">
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
              ) : (
                <button
                  type="button"
                  onClick={() => setCreando(true)}
                  disabled={!escrituraLista}
                  title={escrituraLista ? undefined : "La galería está en solo lectura (falta el montaje rw + el centinela en LabTem)"}
                  className={botonCls}
                >
                  <FolderPlus className="size-3.5" /> Nueva carpeta
                </button>
              )}

              <input ref={inputRef} type="file" multiple hidden onChange={(e) => void subir(e.target.files)} />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={!escrituraLista || !rel || ocupado === "subida"}
                title={!escrituraLista ? "La galería está en solo lectura (falta el montaje rw + el centinela en LabTem)" : !rel ? "Entra a una carpeta para subir ahí" : undefined}
                className={botonCls}
              >
                {progreso ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> {progreso.hecho}/{progreso.total}
                  </>
                ) : (
                  <>
                    <Upload className="size-3.5" /> Subir aquí
                  </>
                )}
              </button>

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
                    <>
                      <button type="button" onClick={() => setVinculando("cliente")} className={botonCls}>
                        <Link2 className="size-3.5" /> Vincular a cliente
                      </button>
                      <button type="button" onClick={() => setVinculando("proyecto")} className={botonCls}>
                        <Link2 className="size-3.5" /> Vincular a proyecto
                      </button>
                    </>
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
