import { formatLongDate } from "@/lib/ui";
import { COMPANY } from "@/lib/branding";

// ── El DOCUMENTO de la hoja de llamado ──────────────────────────────────────
// La hoja que se imprime y se manda: quién va (con citación y confirmación), dónde es, el
// cronograma del día y los equipos que se llevan. Sobre el membrete oficial, tamaño A4 —
// misma carta institucional que la cotización. La usan la vista interna, la impresión y el
// enlace público (freelancers): un solo render, cero copias que mientan.

export type LlamadoPersonaDoc = {
  nombre: string;
  rol: string | null;
  citacion: string | null; // null = la general
  telefono: string | null;
  confirmado: boolean;
};

export type LlamadoBloque = { hora: string; actividad: string; notas: string };

export type LlamadoDoc = {
  proyecto: string;
  cliente: string | null;
  titulo: string | null;
  fecha: Date | string;
  citacionGeneral: string | null;
  locacion: string | null;
  direccion: string | null;
  indicaciones: string | null;
  clienteEnSet: string | null;
  notas: string | null;
  personas: LlamadoPersonaDoc[];
  bloques: LlamadoBloque[];
  equipos: { nombre: string; cantidad: number }[];
  responsableEquipos: string | null;
};

export function LlamadoDocument({ doc, mostrarConfirmacion = true }: { doc: LlamadoDoc; mostrarConfirmacion?: boolean }) {
  const th = "border border-neutral-800 px-2.5 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide";
  const td = "border border-neutral-800 px-2.5 py-1.5 align-middle";

  return (
    <div
      className="llamado-doc relative mx-auto bg-white text-neutral-900 shadow-sm print:shadow-none"
      style={{ width: "210mm", minHeight: "297mm" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/membrete.png" alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill" />

      <div className="relative flex min-h-[297mm] flex-col px-[20mm] pb-[32mm] pt-[36mm] text-[12px] leading-relaxed">
        {/* Cabecera */}
        <div className="flex items-end justify-between gap-4 border-b-2 border-neutral-800 pb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">Hoja de llamado</p>
            <h1 className="mt-0.5 text-[20px] font-bold leading-tight">{doc.titulo || `Rodaje — ${doc.proyecto}`}</h1>
            <p className="text-[12px] text-neutral-600">
              {doc.proyecto}
              {doc.cliente ? ` · ${doc.cliente}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold capitalize">{formatLongDate(doc.fecha)}</p>
            {doc.citacionGeneral ? (
              <p className="mt-0.5 text-[15px] font-bold">
                Citación general: <span className="tabular-nums">{doc.citacionGeneral}</span>
              </p>
            ) : null}
          </div>
        </div>

        {/* Locación */}
        {doc.locacion || doc.direccion ? (
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">📍 Locación</p>
              {doc.locacion ? <p className="font-semibold">{doc.locacion}</p> : null}
              {doc.direccion ? <p>{doc.direccion}</p> : null}
            </div>
            {doc.indicaciones ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Cómo llegar / parqueadero</p>
                <p className="whitespace-pre-wrap">{doc.indicaciones}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Personas citadas */}
        <p className="mt-5 mb-1 text-[10px] font-bold uppercase tracking-wide text-neutral-500">👥 Equipo citado ({doc.personas.length})</p>
        <table className="w-full border-collapse text-[11.5px]">
          <thead>
            <tr>
              <th className={th}>Nombre</th>
              <th className={th}>Rol</th>
              <th className={`${th} w-20 text-center`}>Citación</th>
              <th className={th}>Teléfono</th>
              {mostrarConfirmacion ? <th className={`${th} w-24 text-center`}>Confirmó</th> : null}
            </tr>
          </thead>
          <tbody>
            {doc.personas.map((p, i) => (
              <tr key={i}>
                <td className={`${td} font-medium`}>{p.nombre}</td>
                <td className={td}>{p.rol ?? "—"}</td>
                <td className={`${td} text-center font-semibold tabular-nums`}>{p.citacion ?? doc.citacionGeneral ?? "—"}</td>
                <td className={`${td} tabular-nums`}>{p.telefono ?? "—"}</td>
                {mostrarConfirmacion ? (
                  <td className={`${td} text-center`}>{p.confirmado ? <span className="font-bold text-emerald-700">✓</span> : <span className="text-neutral-400">·</span>}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Cronograma */}
        {doc.bloques.length ? (
          <>
            <p className="mt-5 mb-1 text-[10px] font-bold uppercase tracking-wide text-neutral-500">🕐 Cronograma del día</p>
            <table className="w-full border-collapse text-[11.5px]">
              <tbody>
                {doc.bloques.map((b, i) => (
                  <tr key={i}>
                    <td className={`${td} w-16 text-center font-bold tabular-nums`}>{b.hora || "—"}</td>
                    <td className={`${td} font-medium`}>{b.actividad}</td>
                    <td className={`${td} text-neutral-600`}>{b.notas || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-4">
          {/* Equipos (del plan vinculado) */}
          {doc.equipos.length ? (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-neutral-500">🎥 Equipos a llevar{doc.responsableEquipos ? ` — alista ${doc.responsableEquipos}` : ""}</p>
              <ul className="list-inside space-y-0.5">
                {doc.equipos.map((e, i) => (
                  <li key={i}>
                    · {e.nombre}
                    {e.cantidad > 1 ? <b> ×{e.cantidad}</b> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="space-y-3">
            {doc.clienteEnSet ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">🤝 Cliente en set</p>
                <p>{doc.clienteEnSet}</p>
              </div>
            ) : null}
            {doc.notas ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">📝 Notas</p>
                <p className="whitespace-pre-wrap">{doc.notas}</p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Pie */}
        <div className="mt-auto pt-6 text-[10.5px] text-neutral-600">
          <p>
            Cualquier novedad, avísala de una — llegar tarde sin avisar frena a todo el equipo.
            <span className="mx-2">·</span>
            {COMPANY.name} · {COMPANY.phone} · {COMPANY.email}
          </p>
        </div>
      </div>
    </div>
  );
}
