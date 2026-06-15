// Página amigable para enlaces públicos que ya no sirven (caducados, revocados o
// inválidos). Se muestra en vez de un 404 pelado en las vistas de cliente.
export function PublicLinkInvalid({
  title = "Este enlace ya no está disponible",
  message = "El enlace pudo caducar o ser revocado. Escríbele a tu contacto para que te comparta uno nuevo.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 px-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-neutral-200 text-2xl">🔗</div>
        <h1 className="text-xl font-bold text-neutral-800">{title}</h1>
        <p className="mt-2 text-sm text-neutral-500">{message}</p>
      </div>
    </div>
  );
}
