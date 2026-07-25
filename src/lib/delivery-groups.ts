// Agrupación del paquete de entrega (/entrega y Entregas finales): a qué sección va cada tipo
// de entregable y cuánta vigencia le queda al enlace. Módulo PURO (sin BD) para poder testearlo
// con vitest e importarlo desde componentes cliente.

export const DELIVERY_GROUP_ORDER = ["reels", "videos", "fotos", "otros"] as const;
export type DeliveryGroupKey = (typeof DELIVERY_GROUP_ORDER)[number];

export const DELIVERY_GROUP_LABEL: Record<DeliveryGroupKey, string> = {
  reels: "Reels y shorts",
  videos: "Videos",
  fotos: "Fotos",
  otros: "Otros",
};

// DeliverableType → sección. Vertical corto = reels; horizontal/largo = videos; el resto, por
// su naturaleza. Tipos desconocidos (futuros) caen en «otros» en vez de romper.
export function deliveryGroupOf(type: string): DeliveryGroupKey {
  switch (type) {
    case "REEL":
    case "SHORT":
    case "REEL_CELULAR":
    case "TEASER":
      return "reels";
    case "VIDEO_LARGO":
    case "PODCAST":
      return "videos";
    case "FOTOGRAFIA":
      return "fotos";
    default:
      return "otros";
  }
}

// Días que le quedan al enlace: null = sin límite; 0 = expira hoy; negativo nunca (expirado
// se corta antes de llegar aquí). Se redondea hacia ARRIBA: «quedan 30 días» hasta el último.
export function deliveryDaysLeft(expiresAt: Date | null, now: Date = new Date()): number | null {
  if (!expiresAt) return null;
  const ms = expiresAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

// Texto del contador para la sala y el panel («quedan 30 días», «expira hoy»).
export function deliveryCountdownLabel(daysLeft: number | null): string | null {
  if (daysLeft === null) return null;
  if (daysLeft <= 0) return "expira hoy";
  if (daysLeft === 1) return "queda 1 día";
  return `quedan ${daysLeft} días`;
}
