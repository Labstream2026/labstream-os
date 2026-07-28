// El ancla que devuelve OnlyOffice al mencionar a alguien con «+» dentro de un comentario:
// guarda el punto exacto del documento. Viaja en la URL del aviso como JSON en base64url y se
// le devuelve tal cual al editor al abrir, que salta solo hasta ahí. Para nosotros es opaca.

export function encodeActionLink(link: unknown): string {
  return Buffer.from(JSON.stringify(link), "utf8").toString("base64url");
}

// Si viene manipulada o es enorme, se ignora y el documento abre por el principio.
export function decodeActionLink(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw || raw.length > 4000) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}
