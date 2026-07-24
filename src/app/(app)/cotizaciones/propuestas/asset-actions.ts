"use server";

import crypto from "node:crypto";
import { unlink } from "node:fs/promises";
import { noAutorizado } from "@/lib/authz-error";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { saveBuffer, absPath } from "@/lib/storage";
import { optimizeToWebp, isOptimizableImage } from "@/lib/image";
import {
  ASSET_CATEGORY_KEYS,
  MAX_ASSET_BYTES,
  VIDEO_RE,
  IMAGE_RE,
  assetUrl,
  type AssetKind,
} from "@/lib/proposals/assets";

// ── Biblioteca compartida de medios de propuestas ──
// Subir una vez, etiquetar por categoría, reutilizar en cualquier propuesta. Todo pasa por
// `crear_cotizaciones` (quien arma propuestas), igual que el resto del constructor.

export type AssetRow = {
  id: string;
  kind: AssetKind;
  category: string;
  name: string;
  mime: string;
  size: number;
  url: string;
  createdAt: string;
};

async function requirePerm() {
  const session = await getSession();
  if (!hasPermission(session, "crear_cotizaciones")) noAutorizado();
  return session!;
}

function isKind(v: string): v is AssetKind {
  return v === "VIDEO" || v === "LOGO" || v === "IMAGE";
}

// Lista la biblioteca, opcionalmente acotada por tipo y categoría.
export async function listProposalAssets(filter?: { kind?: string; category?: string }): Promise<AssetRow[]> {
  await requirePerm();
  const kind = filter?.kind && isKind(filter.kind) ? filter.kind : undefined;
  const category = filter?.category && ASSET_CATEGORY_KEYS.includes(filter.category) ? filter.category : undefined;
  const rows = await db.proposalAsset.findMany({
    where: { ...(kind ? { kind } : {}), ...(category ? { category } : {}) },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { id: true, kind: true, category: true, name: true, mime: true, size: true, createdAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as AssetKind,
    category: r.category,
    name: r.name,
    mime: r.mime,
    size: r.size,
    url: assetUrl(r.id),
    createdAt: r.createdAt.toISOString(),
  }));
}

// Sube un medio a la biblioteca. Los videos se guardan TAL CUAL (el equipo ya los exporta
// listos); las imágenes y logos se optimizan a WebP salvo el SVG, que perdería su naturaleza
// vectorial —y un logo vectorial es justo lo que se quiere conservar—.
export async function uploadProposalAsset(formData: FormData): Promise<{ ok: true; asset: AssetRow } | { ok: false; error: string }> {
  const session = await requirePerm();
  const file = formData.get("file");
  const kindRaw = String(formData.get("kind") ?? "");
  const category = String(formData.get("category") ?? "general");
  const nameRaw = String(formData.get("name") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No llegó ningún archivo." };
  if (!isKind(kindRaw)) return { ok: false, error: "Tipo de medio inválido." };
  if (!ASSET_CATEGORY_KEYS.includes(category)) return { ok: false, error: "Categoría desconocida." };

  const kind: AssetKind = kindRaw;
  const isVideo = kind === "VIDEO";
  const okExt = isVideo ? VIDEO_RE.test(file.name) : IMAGE_RE.test(file.name);
  const okMime = isVideo ? file.type.startsWith("video/") : file.type.startsWith("image/");
  if (!okExt && !okMime) {
    return { ok: false, error: isVideo ? "Sube un video MP4, WebM o MOV." : "Sube una imagen (PNG, JPG, WebP o SVG)." };
  }
  if (file.size > MAX_ASSET_BYTES[kind]) {
    return { ok: false, error: `El archivo supera ${Math.round(MAX_ASSET_BYTES[kind] / (1024 * 1024))} MB.` };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const relDir = `proposal-lib/${kind.toLowerCase()}`;
  let rel: string;
  let mime: string;
  let size: number;

  const optimizable = !isVideo && !/\.svg$/i.test(file.name) && isOptimizableImage(file.name, file.type);
  const webp = optimizable ? await optimizeToWebp(buf, { maxEdge: kind === "LOGO" ? 800 : 2000 }) : null;
  if (webp) {
    rel = await saveBuffer(relDir, `${crypto.randomUUID()}.webp`, webp);
    mime = "image/webp";
    size = webp.length;
  } else {
    // Nombre saneado: el original solo aporta la extensión.
    const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase();
    rel = await saveBuffer(relDir, `${crypto.randomUUID()}${ext}`, buf);
    mime = file.type || (isVideo ? "video/mp4" : "application/octet-stream");
    size = buf.length;
  }

  const created = await db.proposalAsset.create({
    data: {
      kind,
      category,
      name: (nameRaw || file.name.replace(/\.[a-z0-9]+$/i, "")).slice(0, 120),
      rel,
      mime,
      size,
      createdById: session.id,
    },
    select: { id: true, kind: true, category: true, name: true, mime: true, size: true, createdAt: true },
  });

  return {
    ok: true,
    asset: {
      id: created.id,
      kind: created.kind as AssetKind,
      category: created.category,
      name: created.name,
      mime: created.mime,
      size: created.size,
      url: assetUrl(created.id),
      createdAt: created.createdAt.toISOString(),
    },
  };
}

// Renombrar o recategorizar sin volver a subir (lo que más se hace: llegó un video sin nombre
// claro y luego se ordena).
export async function updateProposalAsset(id: string, data: { name?: string; category?: string }): Promise<{ ok: boolean; error?: string }> {
  await requirePerm();
  const name = data.name?.trim();
  if (data.category && !ASSET_CATEGORY_KEYS.includes(data.category)) return { ok: false, error: "Categoría desconocida." };
  await db.proposalAsset.update({
    where: { id },
    data: { ...(name ? { name: name.slice(0, 120) } : {}), ...(data.category ? { category: data.category } : {}) },
  });
  return { ok: true };
}

// Borra el medio de la biblioteca y su archivo del NAS. OJO: las propuestas que ya lo usaban
// guardan la URL dentro de su JSON, así que ahí quedaría un hueco — por eso se avisa en la UI.
export async function deleteProposalAsset(id: string): Promise<{ ok: boolean; error?: string }> {
  await requirePerm();
  const a = await db.proposalAsset.findUnique({ where: { id }, select: { rel: true } });
  if (!a) return { ok: false, error: "Ese medio ya no existe." };
  await db.proposalAsset.delete({ where: { id } });
  await unlink(absPath(a.rel)).catch(() => {});
  return { ok: true };
}
