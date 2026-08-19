import Link from "next/link";
import { SearchX } from "lucide-react";

// ── El 404 DENTRO de la app ─────────────────────────────────────────────────
// Las 21 llamadas a notFound() del área interna —incluidas las de «no tienes permiso», que
// a propósito no se distinguen de «no existe»— caían en la pantalla blanca de Next, en
// inglés, sin barra lateral ni salida. Justo cuando la barra superior tiene un buscador que
// fabrica enlaces todo el día. Al vivir dentro de (app), esta página conserva el layout: el
// menú sigue ahí y nadie queda varado.
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-muted">
        <SearchX className="size-7 text-muted-foreground" />
      </span>
      <h1 className="mt-4 text-lg font-semibold">Esto no está donde el enlace decía</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
        Puede que lo hayan movido o archivado, que el enlace sea viejo, o que tu cuenta no
        tenga acceso a esta sección. Nada se dañó.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Link href="/" className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90">
          Ir al inicio
        </Link>
        <Link href="/proyectos" className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium hover:bg-muted">
          Ver los proyectos
        </Link>
      </div>
      <p className="mt-4 text-[11.5px] text-muted-foreground">
        ¿Buscabas algo concreto? <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">Ctrl</kbd>+<kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">K</kbd> busca en toda la app — proyectos terminados incluidos.
      </p>
    </div>
  );
}
