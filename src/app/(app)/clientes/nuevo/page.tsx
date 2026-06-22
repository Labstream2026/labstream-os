import Link from "next/link";
import { createClient } from "../actions";

export default function NuevoClientePage() {
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
          <Field label="Emoji">
            <input
              name="emoji"
              maxLength={4}
              placeholder="🏢"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-center text-sm outline-none focus:ring-2 focus:ring-ring"
            />
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

        <button className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Crear cliente
        </button>
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
