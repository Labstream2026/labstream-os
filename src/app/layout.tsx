import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { PwaRegister } from "@/components/pwa-register";
import { getOrgSettings, brandCss } from "@/lib/org-settings";
import { setProjectStatusOverrides } from "@/lib/project-status";
import { getSession } from "@/lib/auth";
import { getUserPreference } from "@/lib/user-preference";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Labstream OS",
  description: "Sistema operativo colaborativo para producción audiovisual de Labstream Studio.",
  // Permite "Añadir a pantalla de inicio" con aspecto de app en iOS.
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Labstream OS" },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

// `viewport-fit=cover` hace que funcionen las áreas seguras (notch / barra de inicio) que
// ya usan la barra inferior y la superior. `themeColor` tiñe la barra del navegador móvil
// según el tema (claro/oscuro), igualando el fondo de la app.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0e" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Color de marca configurable por el admin (Configuración → Marca): se inyecta como CSS para
  // re-teñir --primary/--ring en toda la app. getOrgSettings es resiliente (si falla la BD,
  // devuelve null y se usa el color por defecto de globals.css).
  const org = await getOrgSettings();
  const css = brandCss(org.primaryColor);
  // Calienta la caché de estados de proyecto personalizados (config global) para este request,
  // así statusMeta() (síncrono, usado en toda la app) refleja las etiquetas/colores del admin.
  setProjectStatusOverrides(org.projectStatuses);
  // Densidad de la interfaz por usuario (compacta = tamaño base menor en <html>, escala todo el
  // rem de Tailwind). Se lee aquí porque <html> vive en el layout raíz; en páginas públicas (sin
  // sesión) queda normal. getSession/getUserPreference están cacheados por petición (sin coste
  // extra en el shell autenticado, que ya los pide).
  const session = await getSession();
  const density = session ? (await getUserPreference(session.id)).density : "normal";
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full${density === "compact" ? " density-compact" : ""}`}
    >
      <body className="min-h-full">
        {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          {children}
        </ThemeProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
