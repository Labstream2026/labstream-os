// Limpieza de usuarios DEMO (los del seed, con contraseña local) y sus mensajes.
// Los usuarios reales entran por Authentik y NO tienen passwordHash → se conservan.
//
// Uso (dentro del contenedor, como las migraciones):
//   docker compose -p <proyecto> exec -T -u root app npx tsx prisma/cleanup-demo.ts            # DRY-RUN (no borra)
//   docker compose -p <proyecto> exec -T -u root app npx tsx prisma/cleanup-demo.ts --apply     # borra de verdad
//
// Variables opcionales:
//   KEEP_EMAILS="a@x.com,b@y.com"  → conserva estos correos aunque tengan contraseña
//   LABSTREAM_FORCE=1              → permite borrar aunque no quedara ningún admin activo (peligroso)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const FORCE = process.env.LABSTREAM_FORCE === "1";
const KEEP = (process.env.KEEP_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

async function main() {
  const all = await prisma.user.findMany({
    select: { id: true, email: true, name: true, active: true, passwordHash: true, role: { select: { key: true } } },
  });

  // Demo = tiene contraseña local y no está en la lista de conservados.
  const demo = all.filter((u) => u.passwordHash && !KEEP.includes(u.email.toLowerCase()));
  const demoIds = demo.map((d) => d.id);
  const keep = all.filter((u) => !demoIds.includes(u.id));
  const survivingAdmins = keep.filter((u) => u.active && u.role.key === "admin");

  const msgCount = demoIds.length
    ? await prisma.chatMessage.count({ where: { authorId: { in: demoIds } } })
    : 0;

  console.log("=== Limpieza de demo ===");
  console.log(`Usuarios totales: ${all.length}`);
  console.log(`\nA BORRAR (demo, con contraseña): ${demo.length}`);
  for (const u of demo) console.log(`  - ${u.email}  [${u.role.key}]`);
  console.log(`\nA CONSERVAR: ${keep.length}`);
  for (const u of keep) console.log(`  - ${u.email}  [${u.role.key}]  ${u.passwordHash ? "(contraseña, en KEEP)" : "(Authentik)"}`);
  console.log(`\nMensajes de chat de usuarios demo que se borrarán: ${msgCount}`);
  console.log(`Admins activos que quedarían: ${survivingAdmins.length}` + (survivingAdmins.length ? ` (${survivingAdmins.map((a) => a.email).join(", ")})` : ""));

  if (demo.length === 0) {
    console.log("\nNada que borrar. ✔");
    return;
  }

  if (!APPLY) {
    console.log("\n[DRY-RUN] No se ha borrado nada. Ejecuta con --apply para confirmar.");
    return;
  }

  if (survivingAdmins.length === 0 && !FORCE) {
    console.error("\n⛔ ABORTADO: no quedaría ningún admin activo. Entra primero por Authentik y");
    console.error("   asigna el rol admin a tu cuenta real, o usa KEEP_EMAILS para conservar un admin.");
    console.error("   (Si de verdad quieres continuar sin admin, repite con LABSTREAM_FORCE=1.)");
    process.exitCode = 1;
    return;
  }

  // 1) Borrar los mensajes de los usuarios demo (cascada: respuestas, reacciones, adjuntos).
  const delMsgs = await prisma.chatMessage.deleteMany({ where: { authorId: { in: demoIds } } });
  // 2) Borrar los usuarios demo (cascada: membresías, reacciones, notificaciones, votos,
  //    asistencias, visores de credenciales; el contenido en propiedad queda con autor nulo).
  const delUsers = await prisma.user.deleteMany({ where: { id: { in: demoIds } } });

  console.log(`\n✔ Borrados ${delMsgs.count} mensajes y ${delUsers.count} usuarios demo.`);
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
