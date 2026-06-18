import { authentikEnabled } from "@/lib/oidc";
import { safeNext } from "@/lib/safe-next";
import { LoginForm } from "./login-form";

const ERRORS: Record<string, string> = {
  sso: "El acceso con Authentik no está disponible ahora.",
  state: "La sesión de acceso expiró. Inténtalo de nuevo.",
  nonce: "La sesión de acceso no coincide. Inténtalo de nuevo.",
  expirado: "El acceso tardó demasiado. Inténtalo de nuevo.",
  email_no_verificado: "Tu correo no está verificado en Authentik. Contacta a un administrador.",
  dominio: "Ese correo no pertenece al equipo de Labstream.",
  inactivo: "Tu usuario está inactivo. Contacta a un administrador.",
  oidc: "No se pudo completar el acceso con Authentik.",
  email: "Authentik no entregó un correo para tu cuenta.",
  rol: "Falta configurar el rol por defecto.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  return (
    <LoginForm
      ssoEnabled={authentikEnabled}
      errorMsg={error ? ERRORS[error] : undefined}
      next={safeNext(next)}
    />
  );
}
