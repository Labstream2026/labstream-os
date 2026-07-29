import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, hasPermission } from "@/lib/auth";
import { EmojiSelect } from "@/components/emoji-select";
import { SubmitButton } from "@/components/submit-button";
import { TONES } from "@/lib/colors";
import { galeriaEnabled, galeriaReady, galeriaWritable } from "@/lib/nas-galeria";
import { createClient } from "../actions";

export default async function NuevoClientePage() {
  const session = await getSession();
  // Crear cliente requiere el permiso crear_clientes (la acción también lo valida).
  if (!hasPermission(session, "crear_clientes")) redirect("/");

  // Carpeta en la Galería al crear: la regla de la casa es que TODO cliente tenga la suya en
  // la raíz de Entregas_LAB. La casilla llega marcada; solo se ofrece si el disco está listo
  // y quien crea puede escribir en él — si no, el alta sigue y la carpeta queda para Ajustes.
  const galeriaOn = galeriaEnabled() && (await galeriaReady());
  const escrituraLista = galeriaOn && (await galeriaWritable());
  const puedeCarpeta = escrituraLista && session?.role !== "demo" && hasPermission(session, "escribir_discos");
  const motivoSinCarpeta = !galeriaOn
    ? "La galería no está conectada en este servidor."
    : !escrituraLista
      ? "La galería está en solo lectura (falta el montaje rw + el centinela en LabTem)."
      : "Necesitas el permiso «Escribir en los discos» para crearla.";

  return (
    <div className="mx-auto max-w-xl px-4 py-6 sm:px-8 sm:py-10">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← Inicio
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Nuevo cliente</h1>
      <p className="mt-1 text-sm text-muted-foreground">Crea un cliente para asociarle proyectos.</p>

      <form action={createClient} className="mt-8 space-y-5">
        <Field label="Nombre">
          <input
            name="name"
            required
            placeholder="Ej. Acme Studios"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>
        <div className="grid grid-cols-[80px_1fr] gap-3">
          <Field label="Icono">
            <EmojiSelect name="emoji" fallback="🏢" marks="sectores" className="w-full" />
          </Field>
          <Field label="Empresa (opcional)">
            <input
              name="company"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
        </div>
        <Field label="Descripción (opcional)">
          <input
            name="description"
            placeholder="Ej. Productora audiovisual"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>

        {/* Color del cliente: tiñe su cabecera, sus proyectos y su carpeta en la Galería.
            Radios CSS puros (sin JS): el aro marca el elegido. OJO: fuera de <Field> —es un
            <label> y anidar los labels de los radios dentro rompería los clics. */}
        <div>
          <span className="mb-1.5 block text-sm font-medium">Color <span className="font-normal text-muted-foreground">· tiñe su cabecera, sus proyectos y su carpeta de la Galería</span></span>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <label className="cursor-pointer" title="Sin color">
              <input type="radio" name="accentColor" value="" defaultChecked className="peer sr-only" />
              <span className="flex size-7 items-center justify-center rounded-full border border-border text-[10px] text-muted-foreground peer-checked:ring-2 peer-checked:ring-ring peer-checked:ring-offset-1">
                ∅
              </span>
            </label>
            {TONES.map((t) => (
              <label key={t.key} className="cursor-pointer" title={t.label}>
                <input type="radio" name="accentColor" value={t.key} className="peer sr-only" />
                <span className={`block size-7 rounded-full border border-black/10 peer-checked:ring-2 peer-checked:ring-ring peer-checked:ring-offset-1 ${t.dot}`} />
              </label>
            ))}
          </div>
        </div>

        {/* Carpeta en la Galería: casi obligatoria — la casilla llega MARCADA. */}
        <div className="rounded-lg border border-border bg-card p-3.5">
          {puedeCarpeta ? (
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" name="crearCarpeta" defaultChecked className="mt-0.5 size-4 accent-primary" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">Crear su carpeta en la Galería</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  En la <strong>raíz</strong> de la galería de entregas, con el nombre del cliente y teñida con su color.
                  Sus proyectos crearán subcarpetas ahí automáticamente. Déjalo marcado salvo que sepas lo que haces.
                </span>
              </span>
            </label>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Carpeta en la Galería:</span> ahora mismo no se puede crear — {motivoSinCarpeta}{" "}
              El cliente se creará igual y podrás crearla o vincularla después desde su ficha (Ajustes).
            </p>
          )}
        </div>

        <SubmitButton pendingText="Creando…" className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Crear cliente
        </SubmitButton>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
