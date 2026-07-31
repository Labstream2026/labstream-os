// ── Copiar al portapapeles sin fallar en silencio ──────────────────────────────
// `navigator.clipboard` no siempre está: falta en contexto no seguro (http://), la puede negar
// el permiso, y dentro de un iframe hace falta que lo permita el documento de arriba. Cuando
// eso pasaba, el `.catch()` se comía el error y el botón NO cambiaba: pulsabas «Copiar enlace»,
// no pasaba absolutamente nada y no había forma de saber si había copiado o no.
//
// Devuelve si de verdad copió, para que quien llama pueda enseñar «¡Copiado!» o avisar. El
// respaldo con `execCommand` está obsoleto pero sigue funcionando justo donde el moderno no.
export async function copiarAlPortapapeles(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // seguimos al respaldo
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = texto;
    // Fuera de la vista pero SELECCIONABLE: con `display:none` o `hidden` no se puede copiar.
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
