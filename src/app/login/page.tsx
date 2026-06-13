import { authentikEnabled } from "@/lib/oidc";
import { LoginForm } from "./login-form";

const ERRORS: Record<string, string> = {
  sso: "El acceso con Authentik no está disponible ahora.",
  state: "La sesión de acceso expiró. Inténtalo de nuevo.",
  dominio: "Ese correo no pertenece al equipo de Labstream.",
  inactivo: "Tu usuario está inactivo. Contacta a un administrador.",
  oidc: "No se pudo completar el acceso con Authentik.",
  rol: "Falta configurar el rol por defecto.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <LoginForm ssoEnabled={authentikEnabled} errorMsg={error ? ERRORS[error] : undefined} />;
}
