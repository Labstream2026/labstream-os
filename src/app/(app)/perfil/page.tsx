import { redirect } from "next/navigation";

// «Mi perfil» vive ahora en AJUSTES (Mi cuenta → Perfil). Este redirect conserva los
// enlaces y marcadores viejos; los componentes de esta carpeta (ProfileForm, etc.)
// siguen aquí y los monta /ajustes.
export default function PerfilPage() {
  redirect("/ajustes?s=perfil");
}
