// Marca de la empresa para documentos de cara al cliente (cotizaciones, propuestas).
// Centralizada para no repetir el nombre/contacto por el código. Puede sobreescribirse
// por variables de entorno sin tocar el código (útil para marca blanca o rebranding).
export const COMPANY = {
  name: process.env.NEXT_PUBLIC_COMPANY_NAME || "Labstream",
  legalName: process.env.NEXT_PUBLIC_COMPANY_LEGAL || "Labstream SAS",
  tagline: process.env.NEXT_PUBLIC_COMPANY_TAGLINE || "Producción de contenidos innovadores",
  email: process.env.NEXT_PUBLIC_COMPANY_EMAIL || "hola@labstream.co",
  whatsapp: process.env.NEXT_PUBLIC_COMPANY_WHATSAPP || "573017548378",
  accent: process.env.NEXT_PUBLIC_COMPANY_ACCENT || "#6366f1",
};
