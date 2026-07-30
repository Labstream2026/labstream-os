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
  ClipboardCopy,
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
  Pin,
  X,
  Undo2,
  Plus,
  ChevronDown,
  SlidersHorizontal,
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
  resumenArchivos,
  viveEnLaApp,
  CATEGORIAS_MARCA,
  categoriaLabel,
} from "@/lib/archivos/tipos";
import {
  addFile,
  addNasRoute,
  uploadProjectFiles,
  createFolder,
  updateFolder,
  deleteFolder,
  deleteFile,
  renameFile,
  moveFile,
  toggleFilePin,
  moverArchivosLote,
  fijarArchivosLote,
  quitarArchivosLote,
  copyGuionText,
  finishChunkedArchivo,
  restaurarArchivo,
  purgarArchivo,
} from "@/app/(app)/proyectos/[id]/actions";
import {
  addClientLink,
  addClientNasRoute,
  deleteClientFile,
  updateClientFileMeta,
  toggleClientFilePin,
} from "@/app/(app)/clientes/actions";
import { startChunkedUpload, type UploadProgress } from "@/lib/chunked-upload-client";

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

// Una entrada extra del menú «Añadir», para lo que solo existe en un alcance (p. ej. «Nuevo
// documento» y «Vincular carpeta del NAS», que son cosa del proyecto). Antes llegaban como
// BOTONES ya hechos por `slotHerramientas` y se plantaban en la fila; ahora llegan como datos y
// el panel decide dónde pintarlos — que es lo que permite recogerlos en el menú.
export type AccionExtra = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  // `true` = va al final, separada: lo que se usa una vez al año no compite con lo de cada día.
  ocasional?: boolean;
};

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
  canChunked = false, // subida por trozos (>100 MB): solo equipo, nunca portal ni demo
  papelera = [], // archivos borrados que aún se pueden recuperar (solo alcance proyecto)
  accionesExtra = [], // entradas EXTRA del menú «Añadir» (p. ej. Nuevo documento, Vincular carpeta del NAS)
  slotHerramientas = null, // los formularios/paneles que esas acciones despliegan DEBAJO de la barra
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
  canChunked?: boolean;
  papelera?: ArchivoItem[];
  accionesExtra?: AccionExtra[];
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

  // ── Línea de contexto ── (misma fuente que la pastilla de la pestaña, ver `resumenArchivos`)
  const resumen = resumenArchivos(items);
  const nProyectos = resumen.proyectos;

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
      lista.sort((a, b) => (b.files[0]?.updatedAt ?? "").localeCompare(a.files[0]?.updatedAt ?? ""));
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

  // Dentro del grupo: lo FIJADO primero —es la curación que antes vivía en una sección aparte
  // duplicando filas— y luego, en el cliente, lo último; en el proyecto, el orden estable de
  // siempre (createdAt asc), para no descolocar a quien ya conoce su pestaña.
  const ordenaGrupo = (files: ArchivoItem[]) => {
    const base = esCliente ? [...files].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [...files];
    return base.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  };

  // Grupos abiertos de entrada: los que TIENEN material, hasta llenar ~15 filas; y todos cuando
  // se filtra. Antes se abrían «los tres primeros», que por el orden 01/02/03 de la plantilla
  // son casi siempre las carpetas vacías — se entraba a la pestaña y lo que había quedaba
  // plegado. El default es reactivo (abierto[key] ?? …): no se congela en el primer render.
  const FILAS_DE_ENTRADA = 15;
  const abiertosPorDefecto = React.useMemo(() => {
    const set = new Set<string>();
    let filas = 0;
    for (const g of grupos) {
      if (g.files.length === 0) continue;
      set.add(g.key);
      filas += g.files.length;
      if (filas >= FILAS_DE_ENTRADA) break;
    }
    return set;
  }, [grupos]);
  const [abierto, setAbierto] = React.useState<Record<string, boolean>>({});
  const estaAbierto = (key: string, _i: number) => (filtrando ? true : abierto[key] ?? abiertosPorDefecto.has(key));
  const alterna = (key: string, i: number) => setAbierto((o) => ({ ...o, [key]: !estaAbierto(key, i) }));

  // ── Subida con acuse — y POR TROZOS para lo grande ──
  // Hasta 100 MB va directo por la server action. Con canChunked (equipo), lo que pase de ahí
  // usa el transporte reanudable de /api/upload/chunked (el del subidor pro de revisiones) y
  // se registra con finishChunkedArchivo. Todo desde el mismo formulario, sin pasos extra.
  type ResultadoSubida = { ok: boolean; subidos: number; omitidos: string[]; error?: string };
  const [subida, setSubida] = React.useState<ResultadoSubida | null>(null);
  const [subiendo, setSubiendo] = React.useState(false);
  const [progreso, setProgreso] = React.useState<{ nombre: string; pct: number; etaSec: number | null } | null>(null);
  const LIMITE_DIRECTO = 100 * 1024 * 1024;

  // El NÚCLEO de la subida, sin formulario: lo comparten el formulario de «Añadir» y el
  // arrastrar-y-soltar. Antes vivía dentro del onSubmit y por eso soltar archivos sobre el
  // panel no podía hacer nada.
  async function subirArchivos(files: File[], projectId: string, folderId?: string | null, alTerminar?: () => void) {
    if (!files.length) return;
    const grandes = canChunked ? files.filter((f) => f.size > LIMITE_DIRECTO) : [];
    const pequenos = files.filter((f) => !grandes.includes(f));
    setSubiendo(true);
    setSubida(null);
    try {
      let subidos = 0;
      const omitidos: string[] = [];
      if (pequenos.length) {
        const fdP = new FormData();
        for (const f of pequenos) fdP.append("files", f);
        if (folderId) fdP.set("folderId", String(folderId));
        const r = await uploadProjectFiles(projectId, fdP);
        subidos += r.subidos;
        omitidos.push(...r.omitidos);
      }
      for (const f of grandes) {
        setProgreso({ nombre: f.name, pct: 0, etaSec: null });
        const h = startChunkedUpload(f, {
          projectId,
          onProgress: (pr: UploadProgress) => setProgreso({ nombre: f.name, pct: pr.pct, etaSec: pr.etaSec }),
        });
        const { uploadId, crc32 } = await h.done;
        const fdG = new FormData();
        fdG.set("uploadId", uploadId);
        fdG.set("crc32", crc32);
        if (folderId) fdG.set("folderId", String(folderId));
        const r = await finishChunkedArchivo(projectId, fdG);
        if (r.ok) subidos++;
        else omitidos.push(`«${f.name}»: ${r.error ?? "no se pudo cerrar la subida"}`);
        setProgreso(null);
      }
      setSubida({ ok: subidos > 0, subidos, omitidos });
      router.refresh();
      if (subidos > 0 && omitidos.length === 0) alTerminar?.();
    } catch (err) {
      setSubida({ ok: false, subidos: 0, omitidos: [], error: err instanceof Error ? err.message : "No se pudo subir. Inténtalo otra vez." });
      setProgreso(null);
    } finally {
      setSubiendo(false);
    }
  }

  async function manejarSubida(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const projectId = alcance.tipo === "proyecto" ? alcance.projectId : String(fd.get("projectId") ?? "");
    if (!projectId) {
      setSubida({ ok: false, subidos: 0, omitidos: [], error: "Elige a qué proyecto va" });
      return;
    }
    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    const folderId = fd.get("folderId");
    await subirArchivos(files, projectId, folderId ? String(folderId) : null, () => {
      form.reset();
      setTool(null);
    });
  }

  // ── Arrastrar y soltar ──
  // Solo en el alcance PROYECTO: en la ficha del cliente un archivo no tiene destino evidente
  // (hay que elegir a qué proyecto va), y adivinarlo sería peor que no ofrecerlo.
  // El contador de arrastre evita el parpadeo: dragleave dispara también al pasar por encima de
  // cada hijo, así que sin contar entradas y salidas el resaltado se apagaría a mitad del panel.
  const puedeSoltar = canUpload && alcance.tipo === "proyecto";
  const [soltarEn, setSoltarEn] = React.useState<string | null | false>(false);
  const arrastres = React.useRef(0);
  const traeArchivos = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

  const zonaSoltar = (folderId: string | null) =>
    !puedeSoltar
      ? {}
      : {
          onDragEnter: (e: React.DragEvent) => {
            if (!traeArchivos(e)) return;
            arrastres.current++;
            setSoltarEn(folderId);
          },
          onDragOver: (e: React.DragEvent) => {
            if (!traeArchivos(e)) return;
            e.preventDefault(); // sin esto el navegador ABRE el archivo en vez de dejarlo soltar
            e.dataTransfer.dropEffect = "copy";
          },
          onDragLeave: () => {
            arrastres.current = Math.max(0, arrastres.current - 1);
            if (arrastres.current === 0) setSoltarEn(false);
          },
          onDrop: async (e: React.DragEvent) => {
            if (!traeArchivos(e)) return;
            e.preventDefault();
            e.stopPropagation(); // soltar sobre una carpeta no debe subir TAMBIÉN a la raíz
            arrastres.current = 0;
            setSoltarEn(false);
            const files = Array.from(e.dataTransfer.files).filter((f) => f.size > 0);
            if (alcance.tipo !== "proyecto" || !files.length) return;
            await subirArchivos(files, alcance.projectId, folderId);
          },
        };

  // ── Selección múltiple (solo alcance proyecto: las acciones en lote son por proyecto) ──
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const seleccionable = !esCliente && canUpload && vista === "lista";
  const toggleSel = (id: string) =>
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const limpiaSel = () => setSel(new Set());
  const [copiado, setCopiado] = React.useState(false);
  const idsFD = () => {
    const fd = new FormData();
    sel.forEach((id) => fd.append("ids", id));
    return fd;
  };

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
  // ¿Hay algo que este usuario pueda AÑADIR? Si no, el primario no se pinta (un menú con una
  // sola entrada, o vacío, es peor que no tenerlo).
  const hayAcciones = canUpload || canLinks || canRutas || (canFolders && alcance.tipo === "proyecto") || accionesExtra.length > 0;

  const proyectosSelector = alcance.tipo === "cliente" ? alcance.proyectosEscribibles : [];

  return (
    <div
      {...zonaSoltar(null)}
      className={cn(
        "relative space-y-3 rounded-xl transition-colors",
        soltarEn === null && arrastres.current > 0 && "outline-dashed outline-2 outline-offset-4 outline-primary/50",
      )}
    >
      {/* Aviso de que se puede soltar: aparece solo mientras hay algo arrastrándose encima. */}
      {puedeSoltar && soltarEn !== false ? (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-xl bg-background/70 backdrop-blur-[1px]">
          <p className="rounded-lg border border-primary/40 bg-card px-4 py-2 text-sm font-medium shadow-sm">
            Suelta para subir {soltarEn ? <>a «{carpetas.find((c) => c.id === soltarEn)?.name ?? "la carpeta"}»</> : "al proyecto"}
          </p>
        </div>
      ) : null}

      {/* Línea de contexto: los números de un vistazo, sin caja. El total sale de
          `resumenArchivos`, el MISMO cálculo que alimenta la pastilla de la pestaña: antes cada
          uno contaba lo suyo y se veía «Archivos 8» en el menú y «7 archivos» aquí. */}
      {resumen.total > 0 ? (
        <p className="text-xs text-muted-foreground tabular-nums">
          <b className="font-semibold text-foreground/80">{resumen.total} {resumen.total === 1 ? "archivo" : "archivos"}</b>
          {esCliente ? <> · {resumen.proyectos} {resumen.proyectos === 1 ? "proyecto" : "proyectos"}{resumen.deMarca ? <> · {resumen.deMarca} de marca</> : null}</> : <> · {carpetas.length} {carpetas.length === 1 ? "carpeta" : "carpetas"}</>}
          {resumen.ultimo ? <> — lo último, {fechaRelativa(resumen.ultimo)}</> : null}
        </p>
      ) : null}

      {/* ── UNA barra ──────────────────────────────────────────────────────────────
          Antes había TRES filas apiladas con hasta 15 controles antes del primer
          archivo: seis botones del mismo peso (subir un archivo pesaba igual que
          vincular una carpeta del NAS), la fila de vista, y una fila entera de
          pastillas de filtro ocupada de forma permanente para algo que casi siempre
          está en «Todo».
          Ahora: un primario «Añadir», el buscador (lo más usado, no se esconde) y dos
          menús discretos. Ninguna función se pierde; están todas a un clic dentro. */}
      {!vacio || hayAcciones ? (
        <div className="flex flex-wrap items-center gap-2">
          {hayAcciones ? (
            <MenuAnadir
              esCliente={esCliente}
              canUpload={canUpload}
              canLinks={canLinks}
              canRutas={canRutas}
              canFolders={canFolders && alcance.tipo === "proyecto"}
              accionesExtra={accionesExtra}
              activa={tool}
              onElegir={(t) => flip(t)}
            />
          ) : null}

          {!vacio ? (
            <div className="relative min-w-40 flex-1 sm:max-w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={esCliente && nProyectos > 0 ? `Buscar en ${nProyectos} ${nProyectos === 1 ? "proyecto" : "proyectos"}…` : "Buscar archivo…"}
                className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          ) : null}

          {/* Filtro puesto: UN chip con su ✕. Así se ve que estás filtrando sin gastar
              una fila entera, que es lo que hacía la tira de pastillas. */}
          {filtro !== "todo" ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-1 pl-2.5 pr-1 text-xs font-semibold text-primary">
              {pastillas.find((x) => x.key === filtro)?.label ?? filtro}
              <button type="button" onClick={() => setFiltro("todo")} aria-label="Quitar el filtro" className="rounded-full p-0.5 hover:bg-primary/20">
                <X className="size-3" />
              </button>
            </span>
          ) : null}

          {!vacio ? (
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <MenuFiltro pastillas={pastillas} cuenta={cuenta} activo={filtro} onElegir={setFiltro} />
              <MenuVista
                esCliente={esCliente}
                agrupado={agrupado}
                onAgrupar={setAgrupado}
                vista={vista}
                onVista={cambiaVista}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Formulario activo */}
      {tool === "upload" && canUpload ? (
        <form onSubmit={manejarSubida} className="space-y-2 rounded-lg border border-border bg-muted/30 p-2.5">
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
            <button type="submit" disabled={subiendo} className={cn("rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90", subiendo && "cursor-not-allowed opacity-60")}>
              {subiendo ? "Subiendo…" : "Subir"}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {esCliente ? "Los archivos siempre viven dentro de un proyecto. Elige a cuál va este. " : ""}
            {canChunked ? "Hasta 100 MB va directo; lo más grande sube por trozos (reanudable, con progreso)." : "Máx. 100 MB por archivo."}
          </p>
          {progreso ? (
            <div className="space-y-1">
              <p className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="truncate">Subiendo por trozos «{progreso.nombre}»…</span>
                <span className="tabular-nums">{progreso.pct}%{progreso.etaSec != null ? ` · ${progreso.etaSec > 90 ? `${Math.ceil(progreso.etaSec / 60)} min` : `${progreso.etaSec} s`}` : ""}</span>
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progreso.pct}%` }} />
              </div>
            </div>
          ) : null}
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

      {/* Los formularios que abren las acciones del menú se despliegan AQUÍ, debajo de la
          barra: el menú se cierra al elegir y lo que aparece es el formulario, no otro botón. */}
      {slotHerramientas}

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
          {/* Antes había aquí una sección «Fijado» con las filas repetidas: el mismo archivo se
              pintaba dos veces en la misma pantalla —una arriba y otra en su grupo—, cada copia
              con su propio botón de eliminar. La curación no se pierde: el 📌 sigue en la fila y
              esa fila sube al principio de su grupo (ver `ordenaGrupo`). */}
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
                {ordenaGrupo(marca).map((f) => (
                  <FilaArchivo key={f.id} f={f} conProyecto={false} alcance={alcance} carpetas={carpetas} canGestionar={canEditMarca} canMarcar={canEditMarca} onCambio={() => router.refresh()} />
                ))}
              </ul>
            </section>
          ) : null}

          {grupos.map((g, i) =>
            g.key === "__plano__" ? (
              <section key={g.key} className="overflow-hidden rounded-xl border border-border bg-card">
                <ul className="divide-y divide-border">
                  {ordenaGrupo(g.files).map((f) => (
                    <FilaArchivo key={f.id} f={f} conProyecto={esCliente} alcance={alcance} carpetas={carpetas} canGestionar={canUpload} canMarcar={canEditMarca} seleccionado={seleccionable ? sel.has(f.id) : undefined} onToggleSel={seleccionable ? toggleSel : undefined} onCambio={() => router.refresh()} />
                  ))}
                </ul>
              </section>
            ) : (
              <section
                key={g.key}
                {...(g.carpetaId ? zonaSoltar(g.carpetaId) : {})}
                className={cn(
                  "overflow-hidden rounded-xl border bg-card transition-colors",
                  soltarEn && soltarEn === g.carpetaId ? "border-primary ring-2 ring-primary/30" : "border-border",
                )}
              >
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
                        <FilaArchivo key={f.id} f={f} conProyecto={esCliente && agrupado !== "origen"} alcance={alcance} carpetas={carpetas} canGestionar={canUpload} canMarcar={canEditMarca} seleccionado={seleccionable ? sel.has(f.id) : undefined} onToggleSel={seleccionable ? toggleSel : undefined} onCambio={() => router.refresh()} />
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

      {/* ── Papelera: 30 días para arrepentirse ── */}
      {alcance.tipo === "proyecto" && papelera.length > 0 ? (
        <Papelera archivos={papelera} projectId={alcance.projectId} onCambio={() => router.refresh()} />
      ) : null}

      {/* ── Barra de acciones EN LOTE (aparece con la primera casilla marcada) ── */}
      {alcance.tipo === "proyecto" && sel.size > 0 ? (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-popover px-3 py-2 shadow-lg">
          <span className="text-sm font-semibold tabular-nums">{sel.size} seleccionado{sel.size === 1 ? "" : "s"}</span>
          <form
            action={async (fd) => {
              const datos = idsFD();
              datos.set("folderId", String(fd.get("folderId") ?? ""));
              await moverArchivosLote(alcance.projectId, datos);
              limpiaSel();
              router.refresh();
            }}
            className="flex items-center gap-1.5"
          >
            <select name="folderId" defaultValue="" className="rounded-md border border-input bg-background px-2 py-1.5 text-xs">
              <option value="">Sin carpeta</option>
              {carpetas.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <SubmitButton pendingText="Moviendo…" className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
              Mover
            </SubmitButton>
          </form>
          <form
            action={async () => {
              await fijarArchivosLote(alcance.projectId, idsFD());
              limpiaSel();
              router.refresh();
            }}
          >
            <SubmitButton pendingText="Fijando…" className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent" title="Fijar en la marca del cliente (o soltar si ya lo están todos)">
              <Pin className="size-3.5" /> Fijar
            </SubmitButton>
          </form>
          <button
            type="button"
            onClick={async () => {
              const lineas = items
                .filter((f) => sel.has(f.id))
                .map((f) => f.url ?? f.path ?? `${window.location.origin}/api/files-asset/${f.id}`);
              try {
                await navigator.clipboard.writeText(lineas.join("\n"));
                setCopiado(true);
                setTimeout(() => setCopiado(false), 1500);
              } catch {
                /* sin portapapeles */
              }
            }}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
          >
            {copiado ? <><Check className="size-3.5" /> Copiados</> : <><Copy className="size-3.5" /> Copiar enlaces</>}
          </button>
          <form
            action={async () => {
              const r = await quitarArchivosLote(alcance.projectId, idsFD());
              limpiaSel();
              router.refresh();
              if (r.rechazados) window.alert(`${r.rechazados} archivo${r.rechazados === 1 ? "" : "s"} no se pudieron quitar (vinculados a un entregable o sin permiso).`);
            }}
          >
            <ConfirmSubmit
              message={`¿Quitar ${sel.size} archivo${sel.size === 1 ? "" : "s"}? Los de Operaciones_LAB solo se desvinculan (siguen en el disco).`}
              confirmLabel={`Quitar ${sel.size}`}
              className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-3.5" /> Quitar
            </ConfirmSubmit>
          </form>
          <button type="button" onClick={limpiaSel} className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Deshacer la selección" aria-label="Deshacer la selección">
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      {slotPie}
    </div>
  );
}

// ── Piezas ──────────────────────────────────────────────────────────────────────

// ── Los tres menús de la barra ─────────────────────────────────────────────────
// Se apoyan en <details data-autoclose>, el mismo patrón que ya usan el menú de carpeta y el de
// archivo: el cierre al pulsar fuera o con Escape lo pone DetailsAutoClose una sola vez en el
// shell, así que aquí no hace falta ni un listener ni estado de «abierto».

const MENU_ITEM =
  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted";
const MENU_CAJA =
  "absolute z-20 mt-1 w-60 rounded-lg border border-border bg-popover p-1 shadow-lg";
const MENU_GRUPO =
  "px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70";

// Cierra el <details> que contiene al elemento. Los menús se cierran al elegir: dejarlos
// abiertos tapando la lista que acabas de filtrar es de las cosas que más molestan.
function cerrarMenu(e: React.MouseEvent<HTMLElement>) {
  e.currentTarget.closest("details")?.removeAttribute("open");
}

function MenuAnadir({
  esCliente,
  canUpload,
  canLinks,
  canRutas,
  canFolders,
  accionesExtra,
  activa,
  onElegir,
}: {
  esCliente: boolean;
  canUpload: boolean;
  canLinks: boolean;
  canRutas: boolean;
  canFolders: boolean;
  accionesExtra: AccionExtra[];
  activa: null | "upload" | "link" | "nas" | "folder";
  onElegir: (t: "upload" | "link" | "nas" | "folder") => void;
}) {
  const ocasionales = accionesExtra.filter((a) => a.ocasional);
  const frecuentes = accionesExtra.filter((a) => !a.ocasional);
  // El grupo «solo la referencia» agrupa lo que NO trae bytes: un enlace y una ruta de red no
  // suben nada, solo apuntan. Separarlo evita el error de «añadí el enlace pero no el archivo».
  const hayReferencia = canLinks || canRutas;

  return (
    <details data-autoclose className="relative shrink-0">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
          "bg-primary text-primary-foreground hover:bg-primary/90",
          activa && "ring-2 ring-primary/40",
        )}
      >
        <Plus className="size-4" />
        Añadir
        <ChevronDown className="size-3.5 opacity-70" />
      </summary>
      <div className={MENU_CAJA}>
        {canUpload || frecuentes.length ? <p className={MENU_GRUPO}>Traer material</p> : null}
        {canUpload ? (
          <button type="button" className={MENU_ITEM} onClick={(e) => { cerrarMenu(e); onElegir("upload"); }}>
            <Upload className="size-4 shrink-0 text-muted-foreground" />
            {esCliente ? "Subir a un proyecto…" : "Subir archivos"}
          </button>
        ) : null}
        {frecuentes.map((a) => (
          <button key={a.id} type="button" className={MENU_ITEM} onClick={(e) => { cerrarMenu(e); a.onClick(); }}>
            <a.icon className="size-4 shrink-0 text-muted-foreground" />
            {a.label}
          </button>
        ))}

        {hayReferencia ? (
          <>
            <div className="my-1 h-px bg-border" />
            <p className={MENU_GRUPO}>Solo la referencia</p>
            {canLinks ? (
              <button type="button" className={MENU_ITEM} onClick={(e) => { cerrarMenu(e); onElegir("link"); }}>
                <Link2 className="size-4 shrink-0 text-muted-foreground" />
                Añadir enlace
              </button>
            ) : null}
            {canRutas ? (
              <button type="button" className={MENU_ITEM} onClick={(e) => { cerrarMenu(e); onElegir("nas"); }}>
                <HardDrive className="size-4 shrink-0 text-muted-foreground" />
                Ruta de red (SMB)
              </button>
            ) : null}
          </>
        ) : null}

        {canFolders || ocasionales.length ? (
          <>
            <div className="my-1 h-px bg-border" />
            {canFolders ? (
              <button type="button" className={MENU_ITEM} onClick={(e) => { cerrarMenu(e); onElegir("folder"); }}>
                <FolderPlus className="size-4 shrink-0 text-muted-foreground" />
                Nueva carpeta
              </button>
            ) : null}
            {ocasionales.map((a) => (
              <button key={a.id} type="button" className={MENU_ITEM} onClick={(e) => { cerrarMenu(e); a.onClick(); }}>
                <a.icon className="size-4 shrink-0 text-muted-foreground" />
                {a.label}
              </button>
            ))}
          </>
        ) : null}
      </div>
    </details>
  );
}

function MenuFiltro({
  pastillas,
  cuenta,
  activo,
  onElegir,
}: {
  pastillas: { key: FiltroArchivos; label: string }[];
  cuenta: (k: FiltroArchivos) => number;
  activo: FiltroArchivos;
  onElegir: (k: FiltroArchivos) => void;
}) {
  // Los conteos van DENTRO del menú: son útiles al decidir, no mientras trabajas.
  const conAlgo = pastillas.filter((p) => p.key === "todo" || cuenta(p.key) > 0);
  if (conAlgo.length <= 1) return null; // sin nada que filtrar, el botón sería decorativo
  return (
    <details data-autoclose className="relative shrink-0">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
          activo !== "todo" ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <SlidersHorizontal className="size-3.5" />
        Filtrar
        <ChevronDown className="size-3 opacity-70" />
      </summary>
      <div className={cn(MENU_CAJA, "right-0")}>
        {conAlgo.map((p) => (
          <button
            key={p.key}
            type="button"
            className={cn(MENU_ITEM, activo === p.key && "font-semibold text-primary")}
            onClick={(e) => { cerrarMenu(e); onElegir(p.key); }}
          >
            {activo === p.key ? <Check className="size-3.5 shrink-0" /> : <span className="size-3.5 shrink-0" />}
            <span className="min-w-0 flex-1 truncate">{p.label}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{cuenta(p.key)}</span>
          </button>
        ))}
      </div>
    </details>
  );
}

function MenuVista({
  esCliente,
  agrupado,
  onAgrupar,
  vista,
  onVista,
}: {
  esCliente: boolean;
  agrupado: Agrupado;
  onAgrupar: (a: Agrupado) => void;
  vista: "lista" | "cuadricula";
  onVista: (v: "lista" | "cuadricula") => void;
}) {
  const grupos: { key: Agrupado; label: string }[] = [
    { key: "origen", label: esCliente ? "Proyecto" : "Carpeta" },
    { key: "fecha", label: "Fecha" },
    { key: "tipo", label: "Tipo" },
    { key: "plano", label: "Sin agrupar" },
  ];
  return (
    <details data-autoclose className="relative shrink-0">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
        {vista === "lista" ? <ListIcon className="size-3.5" /> : <LayoutGrid className="size-3.5" />}
        Vista
        <ChevronDown className="size-3 opacity-70" />
      </summary>
      <div className={cn(MENU_CAJA, "right-0")}>
        <p className={MENU_GRUPO}>Agrupar por</p>
        {grupos.map((g) => (
          <button
            key={g.key}
            type="button"
            className={cn(MENU_ITEM, agrupado === g.key && "font-semibold text-primary")}
            onClick={() => onAgrupar(g.key)}
          >
            {agrupado === g.key ? <Check className="size-3.5 shrink-0" /> : <span className="size-3.5 shrink-0" />}
            {g.label}
          </button>
        ))}
        <div className="my-1 h-px bg-border" />
        <p className={MENU_GRUPO}>Ver como</p>
        {([["lista", "Lista", ListIcon], ["cuadricula", "Cuadrícula", LayoutGrid]] as const).map(([v, label, Icon]) => (
          <button
            key={v}
            type="button"
            className={cn(MENU_ITEM, vista === v && "font-semibold text-primary")}
            onClick={() => onVista(v)}
          >
            {vista === v ? <Check className="size-3.5 shrink-0" /> : <span className="size-3.5 shrink-0" />}
            <Icon className="size-3.5 shrink-0 opacity-70" />
            {label}
          </button>
        ))}
      </div>
    </details>
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

// La FILA: casilla (lote) + miniatura/icono + nombre + metadatos (proyecto · carpeta · peso ·
// actividad · autor) + chips + acciones + menú ⋯ (renombrar, mover, fijar, categoría).
function FilaArchivo({
  f,
  conProyecto,
  alcance,
  carpetas = [],
  canGestionar = false,
  canMarcar = false,
  seleccionado,
  onToggleSel,
  onCambio,
}: {
  f: ArchivoItem;
  conProyecto: boolean;
  alcance: AlcanceArchivos;
  carpetas?: CarpetaItem[];
  // Puede renombrar/mover/fijar este archivo (subir_archivos en su proyecto, o editar la marca).
  canGestionar?: boolean;
  // Puede editar categoría/nota del material de marca.
  canMarcar?: boolean;
  seleccionado?: boolean;
  onToggleSel?: (id: string) => void;
  onCambio: () => void;
}) {
  const { Icon, color } = iconoDe(f.name, f.kind);
  const peso = formatPeso(f.size);
  const esImg = esImagen(f);
  const verHref = f.kind === "LOCAL" || f.kind === "OPS" ? `/api/files-asset/${f.id}` : f.url;
  const projectIdDe = f.proyecto?.id ?? (alcance.tipo === "proyecto" ? alcance.projectId : "");
  const catLabel = categoriaLabel(f.categoria);
  return (
    <li className="group/file flex items-start gap-2.5 px-3 py-2 hover:bg-muted/40">
      {onToggleSel ? (
        <input
          type="checkbox"
          checked={!!seleccionado}
          onChange={() => onToggleSel(f.id)}
          aria-label={`Seleccionar ${f.name}`}
          className="mt-3 size-3.5 shrink-0 accent-[hsl(var(--primary))]"
        />
      ) : null}
      {esImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/files-asset/${f.id}?thumb=1`} alt="" loading="lazy" className="mt-0.5 size-9 shrink-0 rounded-md object-cover ring-1 ring-border" />
      ) : (
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md bg-muted/60 ring-1 ring-border">
          <Icon className={cn("size-4", color)} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-5">
          {f.pinned ? <Pin className="mr-1 inline size-3 text-amber-600" aria-label="Fijado" /> : null}
          {f.name}
          {/* Los documentos editables se quedan DENTRO de la app a propósito (OnlyOffice guarda
              solo cada pocos segundos; tocarlos también por SMB acabaría en dos versiones
              peleándose). No es un problema, es una decisión: basta con poder consultarla. */}
          {viveEnLaApp(f) ? (
            <span
              title="Los documentos de Office se editan y guardan dentro de la app, no en el disco compartido: así el guardado automático no choca con nadie. Además entran en el respaldo diario."
              className="ml-1.5 rounded bg-muted px-1 py-px align-[1px] text-[10px] font-semibold text-muted-foreground"
            >
              en la app
            </span>
          ) : null}
        </p>
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
          {catLabel ? <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium">{catLabel}</span> : null}
          {f.carpeta ? <span className="truncate">{f.carpeta.icon ? `${f.carpeta.icon} ` : ""}{f.carpeta.name}</span> : null}
          {peso ? <span className="tabular-nums">{peso}</span> : null}
          <span title={new Date(f.updatedAt).toLocaleString("es-CO")}>{fechaRelativa(f.updatedAt)}</span>
          {f.autor ? <span className="truncate">{f.autor}</span> : null}
          {f.nota ? <span className="truncate italic" title={f.nota}>· {f.nota}</span> : null}
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
            <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium" title={`Guardado ${f.version} veces desde OnlyOffice — hay historial de versiones para volver atrás`}>
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
        {canGestionar ? <MenuArchivo f={f} alcance={alcance} carpetas={carpetas} projectId={projectIdDe} canMarcar={canMarcar} onCambio={onCambio} /> : null}
        {f.puedeEliminar ? (
          <form
            action={async () => {
              if (f.esMarca && alcance.tipo === "cliente") await deleteClientFile(f.id, alcance.clientId);
              else if (projectIdDe) await deleteFile(f.id, projectIdDe);
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

// Menú ⋯ del archivo: renombrar y mover (archivos de proyecto), categoría y nota (marca),
// y 📌 fijar/soltar en ambos. Mismo patrón details que el menú de la carpeta.
// Copia al portapapeles el TEXTO de un documento (el guion, normalmente): la extracción la hace
// el servidor, que es quien sabe abrir un .docx o un PDF.
function CopiarTextoGuion({ fileId }: { fileId: string }) {
  const [estado, setEstado] = React.useState<"" | "copiando" | "hecho">("");
  // El motivo REAL del servidor («OnlyOffice no está conectado…»), no un «no se pudo» genérico:
  // la extracción depende del Document Server y saberlo ahorra el viaje a preguntar.
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={estado === "copiando"}
        onClick={async () => {
          setEstado("copiando");
          setError(null);
          try {
            const r = await copyGuionText(fileId);
            if (r.ok && r.text) {
              await navigator.clipboard.writeText(r.text);
              setEstado("hecho");
              setTimeout(() => setEstado(""), 2200);
            } else {
              setEstado("");
              setError(r.error ?? "No se pudo extraer el texto.");
            }
          } catch {
            setEstado("");
            setError("No se pudo extraer el texto.");
          }
        }}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60"
      >
        <ClipboardCopy className="size-4 shrink-0 text-muted-foreground" />
        {estado === "copiando" ? "Extrayendo el texto…" : estado === "hecho" ? "Texto copiado" : "Copiar el texto"}
      </button>
      {error ? <p className="px-2 pb-1 text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}

function MenuArchivo({
  f,
  alcance,
  carpetas,
  projectId,
  canMarcar,
  onCambio,
}: {
  f: ArchivoItem;
  alcance: AlcanceArchivos;
  carpetas: CarpetaItem[];
  projectId: string;
  canMarcar: boolean;
  onCambio: () => void;
}) {
  const esMarcaEnCliente = !!f.esMarca && alcance.tipo === "cliente";
  return (
    <details data-autoclose className="relative shrink-0">
      <summary
        title="Más opciones"
        aria-label={`Más opciones de ${f.name}`}
        className="flex size-6 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <MoreHorizontal className="size-4" />
      </summary>
      <div className="absolute right-0 z-10 mt-1 w-64 space-y-2 rounded-lg border border-border bg-popover p-3 shadow-lg">
        {esMarcaEnCliente ? (
          canMarcar ? (
            <form
              action={async (fd) => {
                await updateClientFileMeta(f.id, alcance.clientId, fd);
                onCambio();
              }}
              className="space-y-2"
            >
              <select name="category" defaultValue={f.categoria ?? ""} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                <option value="">Sin categoría</option>
                {CATEGORIAS_MARCA.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
              <input name="note" defaultValue={f.nota ?? ""} placeholder="Nota de uso (ej. Solo para redes)" className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
              <SubmitButton pendingText="Guardando…" className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                Guardar
              </SubmitButton>
            </form>
          ) : null
        ) : (
          <>
            {/* «Copiar el texto» era lo ÚNICO que sabía hacer la sección Guiones y la lista no.
                Vive aquí, en el menú del archivo, que es donde se busca — y así aparece en
                cualquier guion, esté en la carpeta que esté. */}
            {f.editable ? <CopiarTextoGuion fileId={f.id} /> : null}
            <form
              action={async (fd) => {
                await renameFile(f.id, projectId, fd);
                onCambio();
              }}
              className="flex items-center gap-1.5"
            >
              <input name="name" defaultValue={f.name} aria-label="Nuevo nombre" className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
              <SubmitButton pendingText="…" className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground">
                Renombrar
              </SubmitButton>
            </form>
            {carpetas.length ? (
              <form
                action={async (fd) => {
                  await moveFile(f.id, projectId, fd);
                  onCambio();
                }}
                className="flex items-center gap-1.5"
              >
                <select name="folderId" defaultValue={f.carpeta?.id ?? ""} aria-label="Mover a la carpeta" className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                  <option value="">Sin carpeta</option>
                  {carpetas.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <SubmitButton pendingText="…" className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
                  Mover
                </SubmitButton>
              </form>
            ) : null}
          </>
        )}
        <form
          action={async () => {
            if (esMarcaEnCliente) await toggleClientFilePin(f.id, alcance.clientId);
            else await toggleFilePin(f.id, projectId);
            onCambio();
          }}
          className="border-t border-border pt-2"
        >
          <SubmitButton pendingText="…" className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent">
            <Pin className="size-3.5" /> {f.pinned ? "Soltar de fijados" : "Fijar en la marca del cliente"}
          </SubmitButton>
        </form>
      </div>
    </details>
  );
}

// La PAPELERA. Borrar ya no es definitivo: el archivo se queda aquí 30 días con sus vínculos
// intactos (fotos del entregable, portadas, historial) y vuelve entero al restaurarlo.
function Papelera({ archivos, projectId, onCambio }: { archivos: ArchivoItem[]; projectId: string; onCambio: () => void }) {
  const [abierta, setAbierta] = React.useState(false);
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
      >
        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", abierta && "rotate-90")} />
        <Trash2 className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Papelera</span>
        <span className="text-xs tabular-nums text-muted-foreground">{archivos.length}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">se borran solos a los 30 días</span>
      </button>
      {abierta ? (
        <ul className="divide-y divide-border border-t border-border">
          {archivos.map((f) => {
            const { Icon, color } = iconoDe(f.name, f.kind);
            const dias = f.diasRestantes ?? 30;
            return (
              <li key={f.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/40">
                <Icon className={cn("size-4 shrink-0 opacity-60", color)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-muted-foreground line-through">{f.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                    {f.proyecto ? <span>{f.proyecto.emoji ? `${f.proyecto.emoji} ` : ""}{f.proyecto.name}</span> : null}
                    {f.borradoEn ? <span>borrado {fechaRelativa(f.borradoEn)}</span> : null}
                    <span className={cn("font-medium", dias <= 5 && "text-amber-600")}>
                      {dias === 0 ? "se borra hoy" : `quedan ${dias} ${dias === 1 ? "día" : "días"}`}
                    </span>
                    {f.enUso ? (
                      <span className="rounded-full bg-red-500/10 px-1.5 py-px text-[10px] font-medium text-red-600" title="Al purgarse se llevará por delante la foto, portada o versión del entregable que sostiene.">
                        sostiene un entregable
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <form action={async () => { await restaurarArchivo(f.id, projectId); onCambio(); }}>
                    <SubmitButton pendingText="…" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent">
                      <Undo2 className="size-3.5" /> Restaurar
                    </SubmitButton>
                  </form>
                  <form action={async () => { await purgarArchivo(f.id, projectId); onCambio(); }}>
                    <ConfirmSubmit
                      message={
                        f.enUso
                          ? `¿Borrar «${f.name}» para siempre? Sostiene material de un entregable (una versión, una foto o una portada) y eso también se irá. No hay vuelta atrás.`
                          : `¿Borrar «${f.name}» para siempre? No hay vuelta atrás.`
                      }
                      confirmLabel="Borrar para siempre"
                      className="text-muted-foreground hover:text-destructive"
                      title="Borrar ya, sin esperar los 30 días"
                    >
                      <Trash2 className="size-3.5" />
                    </ConfirmSubmit>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
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
