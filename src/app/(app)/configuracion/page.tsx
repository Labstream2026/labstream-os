import { redirect } from "next/navigation";

// «Configuración» vive ahora en AJUSTES (grupos Equipo y Sistema). Este redirect conserva
// los enlaces viejos; los paneles de esta carpeta (Usuarios, Roles, API…) siguen aquí y
// los monta /ajustes.
export default function ConfiguracionPage() {
  redirect("/ajustes");
}
