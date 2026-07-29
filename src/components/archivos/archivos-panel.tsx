"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Folder,
  FolderOpen,
  ChevronRight,
  FileText,
  FileSpreadsheet,
  Presentation,
  FileType,
  File as FileIcon,
  Link2,
  Upload,
  FolderPlus,
  MoreHorizontal,
  Trash2,
  Download,
  Eye,
  Pencil,
  HardDrive,
  Copy,
  Check,
  CheckSquare,
  MessageCircle,
  Search,
  LayoutGrid,
  List as ListIcon,
  Users,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { tone, TONES } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import { EmojiSelect } from "@/components/emoji-select";
import {
  type ArchivoItem,
  type CarpetaItem,
  type ProyectoRef,
  type OpsVivo,
  type FiltroArchivos,
  esImagen,
  formatPeso,
  fechaRelativa,
  pasaFiltro,
  coincide,
  normaliza,
} from "@/lib/archivos/tipos";
import {
  addFile,
  addNasRoute,
  uploadProjectFiles,
  createFolder,
  updateFolder,
  deleteFolder,
  deleteFile,
} from "@/app/(app)/proyectos/[id]/actions";
import { addClientLink, addClientNasRoute, deleteClientFile } from "@/app/(app)/clientes/actions";

// ══════════════════════════════════════════════════════════════════════════════
// EL PANEL DE ARCHIVOS — un solo componente, dos alcances.
//
// · alcance "proyecto": lo que siempre fue la pestaña Archivos del proyecto (carpetas,
//   Operaciones_LAB en vivo, nueva carpeta, vincular NAS).
// · alcance "cliente": TODOS los archivos de los proyectos visibles del cliente, agrupados
//   por proyecto y con el chip de origen, más el material de marca (ClientFile) fijo arriba.
//
// La única rama de render entre alcances es el chip del proyecto. Si aparece un segundo
// `if (esCliente)` en el JSX, la abstracción está mal: los recortes por rol se hacen en el
// SERVIDOR al construir los ArchivoItem, nunca aquí.
// ══════════════════════════════════════════════════════════════════════════════

export type AlcanceArchivos =
  | { tipo: "proyecto"; projectId: string }
  | {
      tipo: "cliente";
      clientId: string;
      // Proyectos en los que ESTE usuario puede escribir: alimentan el selector de subida.
      proyectosEscribibles: ProyectoRef[];
    };

type Agrupado = "origen" | "fecha" | "tipo" | "plano";

export function ArchivosPanel({
  alcance,
  items,
  carpetas = [],
  ops = null,
  canUpload = false,
  canLinks = false, // añadir enlaces (Drive/web)
  canRutas = false, // añadir rutas SMB (nunca el portal del cliente)
  canFolders = false, // crear/editar carpetas (solo proyecto)
  canEditMarca = false, // editar el material de marca (solo cliente)
  slotHerramientas = null, // p. ej. «Nuevo documento» + «Vincular carpeta del NAS» del proyecto
  slotPie = null, // p. ej. los enlaces de subida por proyecto en la ficha del cliente
  ahora, // Date.now() del SERVIDOR: mantiene puro el render (filtro «lo último», grupos por fecha)
}: {
  alcance: AlcanceArchivos;
  items: ArchivoItem[];
  carpetas?: CarpetaItem[];
  ops?: OpsVivo | null;
  canUpload?: boolean;
  canLinks?: boolean;
  canRutas?: boolean;
  canFolders?: boolean;
  canEditMarca?: boolean;
  slotHerramientas?: React.ReactNode;
  slotPie?: React.ReactNode;
  ahora: number;
}) {
  const router = useRouter();
  const esCliente = alcance.tipo === "cliente";

  // ── Estado de la cabecera: herramienta abierta, buscador, filtro, agrupado, vista ──
  const [tool, setTool] = React.useState<null | "upload" | "link" | "nas" | "folder">(null);
  const flip = (t: NonNullable<typeof tool>) => setTool((cur) => (cur === t ? null : t));
  const [q, setQ] = React.useState("");
  const [filtro, setFiltro] = React.useState<FiltroArchivos>("todo");
  const [vista, setVista] = React.useState<"lista" | "cuadricula">("lista");
  React.useEffect(() => {
    // En microtask: el lint (react-hooks/set-state-in-effect) prohíbe el setState síncrono aquí.
    const t = setTimeout(() => {
      const v = localStorage.getItem("files-view");
      if (v === "cuadricula" || v === "lista") setVista(v);
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const cambiaVista = (v: "lista" | "cuadricula") => {
    setVista(v);
    localStorage.setItem("files-view", v);
  };
  const [agrupado, setAgrupado] = React.useState<Agrupado>("origen");

  // ── Filtrado (el buscador busca donde el panel enseña: nombre, ruta, carpeta, tarea, proyecto) ──
  const filtrando = q.trim().length > 0 || filtro !== "todo";
  const visibles = items.filter((f) => coincide(f, q) && pasaFiltro(f, filtro, ahora));
  const marca = visibles.filter((f) => f.esMarca);
  const deProyectos = visibles.filter((f) => !f.esMarca);

  // ── Línea de contexto ──
  const nProyectos = esCliente ? new Set(items.filter((f) => f.proyecto).map((f) => f.proyecto!.id)).size : 0;
  const masReciente = items.length
    ? items.reduce((a, b) => (a.createdAt > b.createdAt ? a : b))
    : null;

  // ── Pastillas de filtro: las de conteo 0 no se pintan ──
  const pastillas: { key: FiltroArchivos; label: string }[] = [
    { key: "todo", label: "Todo" },
    ...(esCliente ? [{ key: "marca" as const, label: "De marca" }] : []),
    { key: "reciente", label: "Lo último (7 días)" },
    { key: "cliente", label: "Que subió el cliente" },
    { key: "enlaces", label: "Enlaces y Drive" },
    { key: "rutas", label: "Rutas NAS" },
    { key: "sincarpeta", label: esCliente ? "Sin carpeta" : "Sueltos" },
  ];
  const cuenta = (k: FiltroArchivos) => items.filter((f) => coincide(f, q) && pasaFiltro(f, k, ahora)).length;

  // ── Agrupación ──
  type Grupo = { key: string; titulo: string; emoji: string | null; color: string | null; proyectoId: string | null; carpetaId: string | null; files: ArchivoItem[] };
  const grupos: Grupo[] = (() => {
    if (agrupado === "plano") {
      return [{ key: "__plano__", titulo: "", emoji: null, color: null, proyectoId: null, carpetaId: null, files: deProyectos }];
    }
    const mapa = new Map<string, Grupo>();
    const meter = (key: string, titulo: string, emoji: string | null, color: string | null, proyectoId: string | null, carpetaId: string | null, f?: ArchivoItem) => {
      let g = mapa.get(key);
      if (!g) {
        g = { key, titulo, emoji, color, proyectoId, carpetaId, files: [] };
        mapa.set(key, g);
      }
      if (f) g.files.push(f);
    };
    // En el proyecto, agrupado por carpeta, TODAS las carpetas existen como grupo — también las
    // vacías (sin esto no se podrían renombrar ni borrar, y parecerían desaparecidas). Al
    // filtrar sí se esconden las vacías: ahí mandan los resultados.
    if (!esCliente && agrupado === "origen" && !filtrando) {
      for (const c of carpetas) meter(c.id, c.name, c.icon, c.color, null, c.id);
    }
    for (const f of deProyectos) {
      if (agrupado === "fecha") {
        const dias = (ahora - new Date(f.createdAt).getTime()) / 86_400_000;
        const [k, t] = dias < 7 ? ["a", "Esta semana"] : dias < 31 ? ["b", "Este mes"] : ["c", "Anterior"];
        meter(k, t, null, null, null, null, f);
      } else if (agrupado === "tipo") {
        const t = f.kind === "NAS" ? "Rutas de red" : f.kind === "LINK" || f.kind === "DRIVE" ? "Enlaces" : /\.(mp4|m4v|mov|mkv|webm|ogv)$/i.test(f.name) ? "Video" : esImagen(f) || /\.(nef|cr[23]|arw|dng|tiff?)$/i.test(f.name) ? "Imagen" : "Documentos y otros";
        meter(t, t, null, null, null, null, f);
      } else if (esCliente) {
        // Agrupado por ORIGEN en el cliente = por proyecto.
        const p = f.proyecto;
        meter(p?.id ?? "?", p?.name ?? "Sin proyecto", p?.emoji ?? null, null, p?.id ?? null, null, f);
      } else {
        // Agrupado por ORIGEN en el proyecto = por carpeta (los sueltos, al final).
        const c = f.carpeta;
        meter(c?.id ?? "\uffff", c?.name ?? "Sueltos", c?.icon ?? null, c?.color ?? null, null, c?.id ?? null, f);
      }
    }
    const lista = [...mapa.values()];
    if (esCliente && agrupado === "origen") {
      // El proyecto con el archivo más reciente, primero.
      lista.sort((a, b) => (b.files[0]?.createdAt ?? "").localeCompare(a.files[0]?.createdAt ?? ""));
    } else {
      lista.sort((a, b) => a.key.localeCompare(b.key));
    }
    // En el proyecto se respeta el orden de carpetas que llega del servidor (position):
    if (!esCliente && agrupado === "origen") {
      const orden = new Map(carpetas.map((c, i) => [c.id, i]));
      lista.sort((a, b) => (a.carpetaId ? orden.get(a.carpetaId) ?? 998 : 999) - (b.carpetaId ? orden.get(b.carpetaId) ?? 998 : 999));
    }
    return lista;
  })();

  // Dentro del grupo: en el cliente, lo último primero; en el proyecto, el orden estable de
  // siempre (createdAt asc), para no descolocar a quien ya conoce su pestaña.
  const ordenaGrupo = (files: ArchivoItem[]) =>
    esCliente ? [...files].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : files;

  // Grupos abiertos: los 3 primeros de entrada, y TODOS cuando se filtra. Default reactivo
  // (abierto[key] ?? índice < 3): no se congela en el primer render como el useState de antes.
  const [abierto, setAbierto] = React.useState<Record<string, boolean>>({});
  const estaAbierto = (key: string, i: number) => (filtrando ? true : abierto[key] ?? i < 3);
  const alterna = (key: string, i: number) => setAbierto((o) => ({ ...o, [key]: !estaAbierto(key, i) }));

  // ── Subida con acuse: dice qué subió y qué OMITIÓ (antes se lo tragaba en silencio) ──
  type ResultadoSubida = { ok: boolean; subidos: number; omitidos: string[]; error?: string };
  const [subida, accionSubir, subiendo] = React.useActionState<ResultadoSubida | null, FormData>(
    async (_prev, fd) => {
      const projectId = alcance.tipo === "proyecto" ? alcance.projectId : String(fd.get("projectId") ?? "");
      if (!projectId) return { ok: false, subidos: 0, omitidos: [], error: "Elige a qué proyecto va" };
      try {
        const r = await uploadProjectFiles(projectId, fd);
        router.refresh();
        if (r.ok && !r.omitidos.length) setTool(null);
        return r;
      } catch {
        return { ok: false, subidos: 0, omitidos: [], error: "No se pudo subir. Inténtalo otra vez." };
      }
    },
    null,
  );

  // Enlaces y rutas: en el cliente llevan selector de destino (Marca del cliente | proyecto).
  const conRefresh = (fn: (fd: FormData) => Promise<unknown>) => async (fd: FormData) => {
    await fn(fd);
    router.refresh();
    setTool(null);
  };
  const destinoDe = (fd: FormData): { marca: boolean; projectId: string } => {
    if (alcance.tipo === "proyecto") return { marca: false, projectId: alcance.projectId };
    const d = String(fd.get("destino") ?? "marca");
    return d === "marca" ? { marca: true, projectId: "" } : { marca: false, projectId: d };
  };
  const enviarEnlace = conRefresh(async (fd) => {
    const destino = destinoDe(fd);
    if (destino.marca && alcance.tipo === "cliente") await addClientLink(alcance.clientId, fd);
    else if (destino.projectId) await addFile(destino.projectId, fd);
  });
  const enviarRuta = conRefresh(async (fd) => {
    const destino = destinoDe(fd);
    if (destino.marca && alcance.tipo === "cliente") await addClientNasRoute(alcance.clientId, fd);
    else if (destino.projectId) await addNasRoute(destino.projectId, fd);
  });

  const inputCls = "min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
  const vacio = items.length === 0 && !ops;

  const proyectosSelector = alcance.tipo === "cliente" ? alcance.proyectosEscribibles : [];

  return (
    <div className="space-y-3">
      {/* Línea de contexto: los números de un vistazo, sin caja. */}
      {items.length > 0 ? (
        <p className="text-xs text-muted-foreground tabular-nums">
          <b className="font-semibold text-foreground/80">{items.filter((f) => !f.esMarca).length} archivos</b>
          {esCliente ? <> · {nProyectos} {nProyectos === 1 ? "proyecto" : "proyectos"} · {items.filter((f) => f.esMarca).length} de marca</> : <> · {carpetas.length} {carpetas.length === 1 ? "carpeta" : "carpetas"}</>}
          {masReciente ? <> — lo último, {fechaRelativa(masReciente.createdAt)}</> : null}
        </p>
      ) : null}

      {/* Barra de acciones */}
      {canUpload || canLinks || canRutas || canFolders || slotHerramientas ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {canUpload ? (
            <ToolBtn active={tool === "upload"} onClick={() => flip("upload")} icon={Upload}>
              {esCliente ? "Subir a un proyecto…" : "Subir archivos"}
            </ToolBtn>
          ) : null}
          {canLinks ? <ToolBtn active={tool === "link"} onClick={() => flip("link")} icon={Link2}>Añadir enlace</ToolBtn> : null}
          {canRutas ? <ToolBtn active={tool === "nas"} onClick={() => flip("nas")} icon={HardDrive}>Ruta de red (SMB)</ToolBtn> : null}
          {canFolders ? <ToolBtn active={tool === "folder"} onClick={() => flip("folder")} icon={FolderPlus}>Nueva carpeta</ToolBtn> : null}
          {slotHerramientas}
        </div>
      ) : null}

      {/* Formulario activo */}
      {tool === "upload" && canUpload ? (
        <form action={accionSubir} className="space-y-2 rounded-lg border border-border bg-muted/30 p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {esCliente ? (
              <select name="projectId" required defaultValue="" className="rounded-md border border-input bg-background px-2 py-2 text-sm">
                <option value="" disabled>Proyecto…</option>
                {proyectosSelector.map((p) => (
                  <option key={p.id} value={p.id}>{p.emoji ? `${p.emoji} ` : ""}{p.name}</option>
                ))}
              </select>
            ) : (
              <SelectorCarpeta carpetas={carpetas} />
            )}
            <input type="file" name="files" multiple required className="min-w-44 flex-1 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium" />
            <SubmitButton pendingText="Subiendo…" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Subir
            </SubmitButton>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {esCliente ? "Los archivos siempre viven dentro de un proyecto. Elige a cuál va este. " : ""}Máx. 100 MB por archivo.
          </p>
          {subida?.error ? <p className="text-xs font-medium text-destructive">{subida.error}</p> : null}
          {subida && !subida.error ? (
            <p className={cn("text-xs", subida.omitidos.length ? "text-amber-600 dark:text-amber-400" : "text-emerald-600")}>
              {subida.subidos ? `Se ${subida.subidos === 1 ? "subió 1 archivo" : `subieron ${subida.subidos} archivos`}.` : "No se subió nada."}
              {subida.omitidos.length ? ` Omitidos: ${subida.omitidos.join("; ")}.` : ""}
            </p>
          ) : null}
          {!subiendo && esCliente && proyectosSelector.length === 0 ? (
            <p className="text-xs text-muted-foreground">No puedes escribir en ningún proyecto de este cliente.</p>
          ) : null}
        </form>
      ) : null}
      {tool === "link" && canLinks ? (
        <form action={enviarEnlace} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
          {esCliente ? <SelectorDestino proyectos={proyectosSelector} conMarca={canEditMarca} /> : null}
          <input name="name" required placeholder="Nombre (ej. Brand kit)" className={inputCls} />
          <input name="url" type="url" required placeholder="https:// (Drive, web…)" className={inputCls} />
          {!esCliente ? <SelectorCarpeta carpetas={carpetas} /> : null}
          <SubmitButton pendingText="Añadiendo…" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Añadir
          </SubmitButton>
        </form>
      ) : null}
      {tool === "nas" && canRutas ? (
        <form action={enviarRuta} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
          {esCliente ? <SelectorDestino proyectos={proyectosSelector} conMarca={canEditMarca} /> : null}
          <input name="name" required placeholder="Nombre (ej. Material rodaje)" className={inputCls} />
          <input name="path" required placeholder="\\NAS\Labstream\…" className={cn(inputCls, "flex-[2] font-mono")} />
          {!esCliente ? <SelectorCarpeta carpetas={carpetas} /> : null}
          <SubmitButton pendingText="Añadiendo…" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Añadir ruta
          </SubmitButton>
        </form>
      ) : null}
      {tool === "folder" && canFolders && alcance.tipo === "proyecto" ? (
        <form action={conRefresh((fd) => createFolder(alcance.projectId, fd))} className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
          <input name="name" required placeholder="Nombre de la carpeta" className={inputCls} />
          <EmojiSelect name="icon" fallback="📁" />
          <SelectorColor />
          <SubmitButton pendingText="Creando…" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Crear
          </SubmitButton>
        </form>
      ) : null}

      {/* Controles: buscador + agrupado + vista. UNA fila. */}
      {!vacio ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-44 flex-1 sm:max-w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={esCliente && nProyectos > 0 ? `Buscar en ${nProyectos} ${nProyectos === 1 ? "proyecto" : "proyectos"}…` : "Buscar archivo…"}
              className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select
            value={agrupado}
            onChange={(e) => setAgrupado(e.target.value as Agrupado)}
            aria-label="Agrupar por"
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-muted-foreground"
          >
            <option value="origen">{esCliente ? "Agrupar: Proyecto" : "Agrupar: Carpeta"}</option>
            <option value="fecha">Agrupar: Fecha</option>
            <option value="tipo">Agrupar: Tipo</option>
            <option value="plano">Sin agrupar</option>
          </select>
          <div className="ml-auto inline-flex overflow-hidden rounded-md border border-border text-xs">
            {([["lista", ListIcon], ["cuadricula", LayoutGrid]] as const).map(([v, Icon]) => (
              <button
                key={v}
                type="button"
                title={v === "lista" ? "Lista" : "Cuadrícula (miniaturas)"}
                aria-pressed={vista === v}
                onClick={() => cambiaVista(v)}
                className={cn("px-2.5 py-1.5", vista === v ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Pastillas de filtro: una sola fila, las vacías no se pintan. */}
      {!vacio ? (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {pastillas.map((p) => {
            const n = cuenta(p.key);
            if (!n && p.key !== "todo") return null;
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={filtro === p.key}
                onClick={() => setFiltro(filtro === p.key ? "todo" : p.key)}
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  filtro === p.key ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {p.label} <span className="opacity-60 tabular-nums">· {n}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Carpeta VIVA de Operaciones_LAB — ahora OBEDECE al buscador y a las pastillas. */}
      {ops ? <BloqueOps ops={ops} q={q} oculto={filtro !== "todo" && filtro !== "reciente"} /> : null}

      {/* Estados vacíos que enseñan el camino */}
      {vacio ? (
        <div className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          <FolderOpen className="mx-auto mb-2 size-6 opacity-50" />
          {esCliente ? (
            <>
              <p className="font-medium text-foreground/80">Esta cuenta todavía no tiene archivos.</p>
              <p className="mt-1">Sube algo a uno de sus proyectos, o añade un enlace de marca (Drive, web).</p>
            </>
          ) : (
            <p>Aún no hay archivos. Sube uno, añade un enlace o crea una carpeta.</p>
          )}
        </div>
      ) : marca.length === 0 && deProyectos.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          <p>Nada coincide con ese filtro.</p>
          <button type="button" onClick={() => { setQ(""); setFiltro("todo"); }} className="mt-1.5 text-primary hover:underline">
            Quitar filtros
          </button>
        </div>
      ) : vista === "cuadricula" ? (
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
          {[...marca, ...ordenaGrupo(deProyectos)].map((f) => (
            <TarjetaArchivo key={f.id} f={f} conProyecto={esCliente} />
          ))}
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Grupo FIJO de marca (solo cliente): no pertenece a ningún proyecto. */}
          {marca.length > 0 ? (
            <section className="overflow-hidden rounded-xl border border-primary/30 bg-card">
              <div className="flex items-center gap-2 border-b border-border bg-primary/[0.05] px-3 py-2">
                <Sparkles className="size-4 text-primary" />
                <span className="text-sm font-semibold">Marca del cliente</span>
                <span className="text-xs tabular-nums text-muted-foreground">{marca.length}</span>
                <span className="text-[10.5px] text-muted-foreground">· No pertenece a ningún proyecto</span>
              </div>
              <ul className="divide-y divide-border">
                {marca.map((f) => (
                  <FilaArchivo key={f.id} f={f} conProyecto={false} alcance={alcance} onCambio={() => router.refresh()} />
                ))}
              </ul>
            </section>
          ) : null}

          {grupos.map((g, i) =>
            g.key === "__plano__" ? (
              <section key={g.key} className="overflow-hidden rounded-xl border border-border bg-card">
                <ul className="divide-y divide-border">
                  {ordenaGrupo(g.files).map((f) => (
                    <FilaArchivo key={f.id} f={f} conProyecto={esCliente} alcance={alcance} onCambio={() => router.refresh()} />
                  ))}
                </ul>
              </section>
            ) : (
              <section key={g.key} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="group/row flex items-center gap-1.5 border-b border-border bg-muted/30 px-2 py-1.5">
                  <button type="button" onClick={() => alterna(g.key, i)} className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left" aria-expanded={estaAbierto(g.key, i)}>
                    <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", estaAbierto(g.key, i) && "rotate-90")} />
                    {g.emoji ? (
                      <span className="text-base leading-none">{g.emoji}</span>
                    ) : g.carpetaId ? (
                      estaAbierto(g.key, i) ? <FolderOpen className="size-4 shrink-0" style={g.color ? { color: tone(g.color).hex } : undefined} /> : <Folder className="size-4 shrink-0" style={g.color ? { color: tone(g.color).hex } : undefined} />
                    ) : g.proyectoId ? (
                      <Users className="size-4 shrink-0 text-muted-foreground" />
                    ) : null}
                    <span className="truncate text-sm font-medium">{g.titulo}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{g.files.length}</span>
                  </button>
                  {g.proyectoId ? (
                    <Link href={`/proyectos/${g.proyectoId}?tab=archivos`} className="shrink-0 whitespace-nowrap text-xs text-primary hover:underline">
                      Abrir proyecto →
                    </Link>
                  ) : null}
                  {g.carpetaId && canFolders && alcance.tipo === "proyecto" ? (
                    <MenuCarpeta carpeta={{ id: g.carpetaId, name: g.titulo, icon: g.emoji, color: g.color }} projectId={alcance.projectId} onCambio={() => router.refresh()} />
                  ) : null}
                </div>
                {estaAbierto(g.key, i) ? (
                  g.files.length ? (
                    <ul className="divide-y divide-border">
                      {ordenaGrupo(g.files).map((f) => (
                        <FilaArchivo key={f.id} f={f} conProyecto={esCliente && agrupado !== "origen"} alcance={alcance} onCambio={() => router.refresh()} />
                      ))}
                    </ul>
                  ) : (
                    <p className="px-4 py-2 text-xs text-muted-foreground">Carpeta vacía</p>
                  )
                ) : null}
              </section>
            ),
          )}
        </div>
      )}

      {slotPie}
    </div>
  );
}

// ── Piezas ──────────────────────────────────────────────────────────────────────

function ToolBtn({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="size-4" /> {children}
    </button>
  );
}

function SelectorCarpeta({ carpetas }: { carpetas: CarpetaItem[] }) {
  if (!carpetas.length) return null;
  return (
    <select name="folderId" defaultValue="" className="rounded-md border border-input bg-background px-2 py-2 text-sm">
      <option value="">Sin carpeta</option>
      {carpetas.map((f) => (
        <option key={f.id} value={f.id}>{f.name}</option>
      ))}
    </select>
  );
}

// Destino del enlace/ruta en la ficha del cliente: la marca (ClientFile) o uno de sus proyectos.
function SelectorDestino({ proyectos, conMarca }: { proyectos: ProyectoRef[]; conMarca: boolean }) {
  return (
    <select name="destino" required defaultValue={conMarca ? "marca" : ""} className="rounded-md border border-input bg-background px-2 py-2 text-sm">
      {conMarca ? <option value="marca">✳ Marca del cliente</option> : <option value="" disabled>Destino…</option>}
      {proyectos.map((p) => (
        <option key={p.id} value={p.id}>{p.emoji ? `${p.emoji} ` : ""}{p.name}</option>
      ))}
    </select>
  );
}

function SelectorColor({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <select name="color" defaultValue={defaultValue} className="rounded-md border border-input bg-background px-2 py-2 text-sm">
      <option value="">Sin color</option>
      {TONES.map((t) => (
        <option key={t.key} value={t.key}>{t.label}</option>
      ))}
    </select>
  );
}

// Menú de la carpeta (renombrar, emoji, color, eliminar). Visible también en móvil y con
// teclado: opacity-100 en táctil, focus-visible lo revela, y tiene nombre accesible.
function MenuCarpeta({ carpeta, projectId, onCambio }: { carpeta: CarpetaItem; projectId: string; onCambio: () => void }) {
  return (
    <details data-autoclose className="relative shrink-0">
      <summary
        title="Opciones de la carpeta"
        aria-label={`Opciones de la carpeta ${carpeta.name}`}
        className="flex size-7 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 md:opacity-0 md:group-hover/row:opacity-100 md:focus-visible:opacity-100"
      >
        <MoreHorizontal className="size-4" />
      </summary>
      <div className="absolute right-0 z-10 mt-1 w-64 rounded-lg border border-border bg-popover p-3 shadow-lg">
        <form
          action={async (fd) => {
            await updateFolder(carpeta.id, projectId, fd);
            onCambio();
          }}
          className="space-y-2"
        >
          <input name="name" defaultValue={carpeta.name} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
          <div className="flex gap-2">
            <EmojiSelect name="icon" defaultValue={carpeta.icon} fallback="📁" />
            <SelectorColor defaultValue={carpeta.color ?? ""} />
          </div>
          <SubmitButton pendingText="Guardando…" className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
            Guardar
          </SubmitButton>
        </form>
        <form
          action={async () => {
            await deleteFolder(carpeta.id, projectId);
            onCambio();
          }}
          className="mt-2 border-t border-border pt-2"
        >
          <ConfirmSubmit
            message={`¿Eliminar la carpeta «${carpeta.name}»? Sus archivos quedan sin carpeta.`}
            confirmLabel="Eliminar carpeta"
            className="text-xs text-destructive hover:underline"
          >
            Eliminar carpeta
          </ConfirmSubmit>
        </form>
      </div>
    </details>
  );
}

function iconoDe(name: string, kind: string) {
  if (kind === "NAS") return { Icon: HardDrive, color: "text-amber-600" };
  if (kind === "DRIVE") return { Icon: Link2, color: "text-emerald-600" };
  if (kind === "LINK") return { Icon: Link2, color: "text-muted-foreground" };
  if (/\.(docx?|odt|rtf)$/i.test(name)) return { Icon: FileText, color: "text-blue-600" };
  if (/\.(xlsx?|csv|ods)$/i.test(name)) return { Icon: FileSpreadsheet, color: "text-emerald-600" };
  if (/\.(pptx?|odp)$/i.test(name)) return { Icon: Presentation, color: "text-orange-600" };
  if (/\.pdf$/i.test(name)) return { Icon: FileType, color: "text-red-600" };
  return { Icon: FileIcon, color: "text-muted-foreground" };
}

function CopiarRuta({ path }: { path: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(path);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* sin portapapeles */
        }
      }}
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      title={`Copiar ruta: ${path}`}
    >
      {done ? <><Check className="size-3.5" /> Copiada</> : <><Copy className="size-3.5" /> Copiar ruta</>}
    </button>
  );
}

// La FILA: miniatura/icono + nombre + metadatos (proyecto · carpeta · peso · fecha · autor)
// + chips + acciones. La información que el modelo ya guardaba y el panel viejo tiraba.
function FilaArchivo({ f, conProyecto, alcance, onCambio }: { f: ArchivoItem; conProyecto: boolean; alcance: AlcanceArchivos; onCambio: () => void }) {
  const { Icon, color } = iconoDe(f.name, f.kind);
  const peso = formatPeso(f.size);
  const esImg = esImagen(f);
  const verHref = f.kind === "LOCAL" || f.kind === "OPS" ? `/api/files-asset/${f.id}` : f.url;
  return (
    <li className="group/file flex items-start gap-2.5 px-3 py-2 hover:bg-muted/40">
      {esImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/files-asset/${f.id}?thumb=1`} alt="" loading="lazy" className="mt-0.5 size-9 shrink-0 rounded-md object-cover ring-1 ring-border" />
      ) : (
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md bg-muted/60 ring-1 ring-border">
          <Icon className={cn("size-4", color)} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-5">{f.name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
          {conProyecto && f.proyecto ? (
            <Link
              href={`/proyectos/${f.proyecto.id}?tab=archivos`}
              className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/[0.06] px-1.5 py-px font-semibold text-primary hover:bg-primary/15"
            >
              {f.proyecto.emoji ? <span>{f.proyecto.emoji}</span> : null}
              <span className="max-w-[9rem] truncate">{f.proyecto.name}</span>
            </Link>
          ) : null}
          {f.carpeta ? <span className="truncate">{f.carpeta.icon ? `${f.carpeta.icon} ` : ""}{f.carpeta.name}</span> : null}
          {peso ? <span className="tabular-nums">{peso}</span> : null}
          <span>{fechaRelativa(f.createdAt)}</span>
          {f.autor ? <span className="truncate">{f.autor}</span> : null}
          {f.viaClientLink ? <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">cliente</span> : null}
          {f.chat ? (
            <Link href={`/chat/${f.chat.channelId}?msg=${f.chat.messageId}`} title="Compartido en el chat — abrir el mensaje" className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/10 px-1.5 py-px text-[10px] font-medium text-orange-600 hover:bg-orange-500/20">
              <MessageCircle className="size-3" /> chat
            </Link>
          ) : null}
          {f.task ? (
            <span title={`Tarea: ${f.task.title}`} className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">
              <CheckSquare className="size-3" />
              <span className="max-w-[7rem] truncate">{f.task.title}</span>
            </span>
          ) : null}
          {f.kind === "OPS" && !f.missing ? (
            <span title={f.path ? `Operaciones_LAB/${f.path}` : "Vive en Operaciones_LAB"} className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-px text-[10px] font-medium text-emerald-600">
              <HardDrive className="size-3" /> NAS
            </span>
          ) : null}
          {f.missing ? (
            <span className="rounded-full bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-600" title="No se encontró en Operaciones_LAB: lo movieron o renombraron desde el NAS.">
              ¿movido?
            </span>
          ) : null}
          {f.version > 1 ? (
            <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium" title={`Guardado ${f.version} veces desde OnlyOffice (no es un historial: no hay copias anteriores)`}>
              v{f.version}
            </span>
          ) : null}
          {f.enUso ? (
            <span className="rounded-full bg-red-500/10 px-1.5 py-px text-[10px] font-medium text-red-600" title="Es el archivo de un entregable (versión, foto o portada): borrarlo deja esa entrega sin material.">
              en un entregable
            </span>
          ) : null}
          {f.dentro?.length ? (
            <span className="rounded-full bg-emerald-500/10 px-1.5 py-px text-[10px] font-medium text-emerald-600" title={`${f.dentro.join(", ")} ${f.dentro.length === 1 ? "lo tiene" : "lo tienen"} abierto ahora`}>
              {f.dentro.length === 1 ? f.dentro[0].split(" ")[0] : `${f.dentro.length} dentro`}
            </span>
          ) : null}
          {f.comentarios ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/10 px-1.5 py-px text-[10px] font-medium text-orange-600" title={`${f.comentarios} comentario${f.comentarios === 1 ? "" : "s"} sin resolver`}>
              <MessageCircle className="size-3" /> {f.comentarios}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2.5 pt-1 opacity-100 md:opacity-0 md:group-hover/file:opacity-100 md:group-focus-within/file:opacity-100">
        {f.kind === "NAS" && f.path ? (
          <CopiarRuta path={f.path} />
        ) : f.missing ? (
          // Un OPS que ya no está en el disco NO enlaza a un 404: manda al explorador a buscarlo.
          <a href={`/operaciones${f.path && f.path.includes("/") ? `?path=${encodeURIComponent(f.path.split("/").slice(0, -1).join("/"))}` : ""}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Búscalo en Operaciones
          </a>
        ) : f.kind === "LOCAL" || f.kind === "OPS" ? (
          <>
            <a
              href={verHref!}
              target={esImg ? undefined : "_blank"}
              rel="noreferrer"
              {...(esImg ? { "data-lightbox": "", "data-lightbox-name": f.name } : {})}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              title="Ver"
            >
              <Eye className="size-3.5" />
            </a>
            {f.editable && !f.missing ? (
              <a href={`/docs/file/${f.id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline" title="Editar">
                <Pencil className="size-3.5" />
              </a>
            ) : null}
            <a href={`/api/files-asset/${f.id}?download=1`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" title="Descargar">
              <Download className="size-3.5" />
            </a>
          </>
        ) : f.url ? (
          <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink className="size-3.5" /> Abrir
          </a>
        ) : null}
        {f.puedeEliminar ? (
          <form
            action={async () => {
              if (f.esMarca && alcance.tipo === "cliente") await deleteClientFile(f.id, alcance.clientId);
              else if (f.proyecto) await deleteFile(f.id, f.proyecto.id);
              else if (alcance.tipo === "proyecto") await deleteFile(f.id, alcance.projectId);
              onCambio();
            }}
          >
            <ConfirmSubmit
              message={
                f.enUso
                  ? `«${f.name}» es el archivo de un entregable. Si lo eliminas, esa entrega se queda sin material.`
                  : f.kind === "OPS"
                    ? `¿Quitar «${f.name}» del proyecto? El archivo NO se borra: sigue en Operaciones_LAB (y aparecerá en la sección «en vivo»).`
                    : `¿Eliminar «${f.name}»?`
              }
              confirmLabel={f.enUso ? "Eliminar de todos modos" : f.kind === "OPS" ? "Quitar del proyecto" : "Eliminar"}
              className="text-muted-foreground hover:text-destructive"
              title="Eliminar"
            >
              <Trash2 className="size-3.5" />
            </ConfirmSubmit>
          </form>
        ) : null}
      </div>
    </li>
  );
}

// Tarjeta de la cuadrícula: miniatura real (vía ?thumb=1, que no audita), icono grande para el
// resto, y el chip del proyecto en el pie cuando el alcance es el cliente.
function TarjetaArchivo({ f, conProyecto }: { f: ArchivoItem; conProyecto: boolean }) {
  const { Icon, color } = iconoDe(f.name, f.kind);
  const esImg = esImagen(f);
  const href = f.missing ? null : f.kind === "LOCAL" || f.kind === "OPS" ? `/api/files-asset/${f.id}` : f.url;
  const cuerpo = (
    <>
      {esImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/files-asset/${f.id}?thumb=1`} alt={f.name} loading="lazy" className="aspect-square w-full bg-muted/40 object-cover" />
      ) : (
        <div className="grid aspect-square w-full place-items-center bg-muted/40">
          <Icon className={cn("size-8", color)} />
        </div>
      )}
      <div className="px-2 py-1.5">
        <p className="truncate text-[11px] font-medium" title={f.name}>{f.name}</p>
        {conProyecto && f.proyecto ? (
          <p className="truncate text-[10px] font-semibold text-primary">
            {f.proyecto.emoji ? `${f.proyecto.emoji} ` : ""}
            {f.proyecto.name}
          </p>
        ) : f.missing ? (
          <p className="text-[10px] font-medium text-amber-600">¿movido?</p>
        ) : null}
      </div>
    </>
  );
  const cls = "block overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/40";
  if (href) {
    return (
      <a
        href={href}
        target={esImg ? undefined : "_blank"}
        rel="noreferrer"
        {...(esImg ? { "data-lightbox": "", "data-lightbox-name": f.name } : {})}
        className={cls}
        title={f.kind === "LOCAL" || f.kind === "OPS" ? "Ver" : "Abrir enlace"}
      >
        {cuerpo}
      </a>
    );
  }
  return (
    <div className={cls} title={f.path ?? f.name}>
      {cuerpo}
      {f.path && f.kind === "NAS" ? (
        <div className="px-2 pb-1.5">
          <CopiarRuta path={f.path} />
        </div>
      ) : null}
    </div>
  );
}

// Operaciones_LAB en vivo. Antes ignoraba el buscador: la lista de abajo decía «nada coincide»
// mientras este bloque seguía pintando todo. Ahora filtra, dice el peso y colapsa con honestidad.
function BloqueOps({ ops, q, oculto }: { ops: OpsVivo; q: string; oculto: boolean }) {
  const live = ops.live.filter((f) => !q.trim() || normaliza(f.name).includes(normaliza(q)) || normaliza(f.rel).includes(normaliza(q)));
  const IMG = /\.(jpe?g|png|webp|gif|avif)$/i;
  if (oculto) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <HardDrive className="size-4 text-[#F47A20]" />
        <span className="text-sm font-medium">Operaciones_LAB/{ops.folder}</span>
        <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">en vivo</span>
        <span className="ml-auto flex items-center gap-2">
          <a href={`/operaciones?path=${encodeURIComponent(ops.folder)}`} className="text-xs text-primary hover:underline">Abrir en Operaciones</a>
        </span>
      </div>
      {!ops.ok ? (
        <p className="px-3 py-3 text-sm text-amber-600 dark:text-amber-400">
          La carpeta no responde: ¿la movieron o renombraron desde el NAS? Vincula la nueva ubicación.
        </p>
      ) : (
        <>
          {ops.dirs.length && !q.trim() ? (
            <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
              {ops.dirs.map((d) => (
                <a key={d.rel} href={`/operaciones?path=${encodeURIComponent(d.rel)}`} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">
                  <Folder className="size-3.5 text-[#F47A20]" /> {d.name}
                </a>
              ))}
            </div>
          ) : null}
          {live.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-muted-foreground">
              {q.trim() ? "Nada de la carpeta en vivo coincide con la búsqueda." : "Nada suelto en la carpeta: todo lo que hay está registrado abajo. Lo que el equipo suelte por el Finder aparecerá aquí."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {live.map((f) => {
                const { Icon, color } = iconoDe(f.name, "OPS");
                const peso = formatPeso(f.size);
                return (
                  <li key={f.rel} className="group/live flex items-center gap-2.5 py-2 pl-3 pr-2 hover:bg-muted/40">
                    {IMG.test(f.name) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/ops/thumb?path=${encodeURIComponent(f.rel)}&v=${Math.round(f.mtimeMs)}`} alt="" loading="lazy" className="size-8 shrink-0 rounded object-cover ring-1 ring-border" />
                    ) : (
                      <Icon className={cn("size-4 shrink-0", color)} />
                    )}
                    <a href={`/api/ops/file?path=${encodeURIComponent(f.rel)}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm hover:underline">{f.name}</a>
                    {peso ? <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:inline">{peso}</span> : null}
                    <span className="hidden shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 sm:inline-flex" title="Está en el disco pero llegó por fuera de la app (Finder/SMB)">desde el NAS</span>
                    <div className="flex items-center gap-2.5 opacity-100 md:opacity-0 md:group-hover/live:opacity-100">
                      {ops.ooReady && /\.(docx?|odt|rtf|txt|xlsx?|ods|csv|pptx?|odp|pdf)$/i.test(f.name) ? (
                        <a href={`/docs/ops?path=${encodeURIComponent(f.rel)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline" title="Editar en OnlyOffice"><Pencil className="size-3.5" /></a>
                      ) : null}
                      <a href={`/api/ops/file?path=${encodeURIComponent(f.rel)}&download=1`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" title="Descargar"><Download className="size-3.5" /></a>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
