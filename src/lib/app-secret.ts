// Secreto único de la app para HMAC y cifrado (tokens de archivos, cotizaciones,
// propuestas, revisiones y cifrado de credenciales). Centraliza la verificación
// para que NINGÚN servicio caiga silenciosamente a un secreto débil en producción.
//
// En producción se EXIGE un secreto fuerte (openssl rand -base64 32); si falta o
// es un placeholder, se lanza error. En desarrollo se usa un fallback fijo para no
// frenar el trabajo local.

function isWeakSecret(s: string | undefined): boolean {
  return !s || s.length < 16 || s === "dev-secret-cambiar" || /genera-uno|cambiar|changeme|example|secret-aqui/i.test(s);
}

export function appSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (isWeakSecret(secret)) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEXTAUTH_SECRET ausente o inseguro en producción. Genera uno con: openssl rand -base64 32");
    }
    return "dev-secret-cambiar";
  }
  return secret as string;
}
