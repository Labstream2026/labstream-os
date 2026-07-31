import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Hasta ahora las pruebas vivían sin configuración: ninguna importaba un módulo que usara el
// alias `@/`, así que la resolución por defecto de vitest bastaba. En cuanto una lo hace, falla
// con «Cannot find package '@/lib/storage'» —el alias lo resuelve Next al compilar, y vitest no
// pasa por ahí—. El error señala al módulo importado, no al alias, así que despista.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
