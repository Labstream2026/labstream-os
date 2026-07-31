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
  test: {
    // `next build` con salida standalone COPIA el árbol de src dentro de .next, y vitest
    // encontraba ahí una segunda copia —congelada en el momento de la compilación— de cada
    // prueba. El síntoma es de los que hacen perder una tarde: la prueba falla señalando una
    // función «que no existe» mientras el archivo de verdad, abierto al lado, sí la exporta.
    // La pista está en la ruta del fallo, que empieza por `.next/standalone`.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
  },
});
