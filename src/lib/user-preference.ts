import { cache } from "react";
import { db } from "@/lib/db";

// Preferencias por usuario que SINCRONIZAN entre dispositivos (panel lateral/chat, accesibilidad,
// página de inicio). Antes vivían en localStorage por navegador, así que no pasaban del móvil al
// escritorio. El layout las hidrata en el servidor (sin parpadeo) y se guardan al cambiarlas.
export type UserPrefs = {
  sidebarCollapsed: boolean;
  chatPanelOpen: boolean;
  reduceMotion: boolean;
  // Densidad de la interfaz: "normal" | "compact" (compacta reduce el tamaño base en <html>).
  density: string;
  startPage: string;
  // Vistas guardadas (filtros con nombre) por superficie. JSON: [{ surface, id, name, query }].
  // Sincronizan entre dispositivos (antes localStorage por navegador).
  savedViews: string | null;
};

export const DEFAULT_PREFS: UserPrefs = {
  sidebarCollapsed: false,
  chatPanelOpen: true,
  reduceMotion: false,
  density: "normal",
  startPage: "/",
  savedViews: null,
};

export type SavedView = { surface: string; id: string; name: string; query: string };
export function parseSavedViews(json: string | null | undefined, surface: string): { id: string; name: string; query: string }[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter((v) => v && v.surface === surface && typeof v.id === "string").map((v) => ({ id: String(v.id), name: String(v.name ?? ""), query: String(v.query ?? "") }));
  } catch { return []; }
}

// Páginas permitidas como "página de inicio" (lista blanca: nunca redirigir a una ruta arbitraria).
// Vive aquí (módulo normal) y no en el archivo "use server", que solo puede exportar funciones.
export const START_PAGES: { value: string; label: string }[] = [
  { value: "/", label: "Inicio" },
  { value: "/mis-tareas", label: "Mis tareas" },
  { value: "/chat", label: "Chats" },
  { value: "/proyectos", label: "Proyectos" },
  { value: "/calendario", label: "Calendario" },
  { value: "/notas", label: "Notas" },
];
export const START_PAGE_SET = new Set(START_PAGES.map((p) => p.value));

// Cacheado por petición (varios componentes del árbol lo piden). Si no hay fila, devuelve defaults.
export const getUserPreference = cache(async (userId: string): Promise<UserPrefs> => {
  const row = await db.userPreference.findUnique({ where: { userId } }).catch(() => null);
  if (!row) return DEFAULT_PREFS;
  return {
    sidebarCollapsed: row.sidebarCollapsed,
    chatPanelOpen: row.chatPanelOpen,
    reduceMotion: row.reduceMotion,
    density: row.density || "normal",
    startPage: row.startPage || "/",
    savedViews: row.savedViews ?? null,
  };
});
