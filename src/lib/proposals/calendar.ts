// Motor de calendario de contenido: fechas comerciales por país y mes +
// plan de publicación semanal por plantilla. El bloque `calendar` arma una
// grilla del mes elegido con las piezas del plan y los hitos comerciales.

export type Hito = { f: string; t: string; i: string };
export type MesCal = { foco: string; hitos: Hito[] };
export type PaisCal = Record<string, MesCal>;

// Colombia — los 12 meses (foco + hitos comerciales/culturales).
const CAL_CO: PaisCal = {
  Enero: {
    foco: "Mes de propósitos y recomienzo: planeación, retos y ofertas de temporada.",
    hitos: [
      { f: "6 ene", t: "Día de Reyes", i: "Cierre de temporada navideña y últimas rebajas." },
      { f: "Mediados", t: "Regreso a clases", i: "Rutinas, productividad y empezar bien el año." },
      { f: "Todo el mes", t: "Propósitos de año nuevo", i: "Retos y series de hábitos." },
    ],
  },
  Febrero: {
    foco: "Mes del amor y la amistad: campañas emocionales y colaboraciones.",
    hitos: [
      { f: "14 feb", t: "Amor y amistad (San Valentín)", i: "Regalos, parejas y experiencias." },
      { f: "Carnaval", t: "Carnaval de Barranquilla", i: "Color, cultura y contenido festivo." },
    ],
  },
  Marzo: {
    foco: "Mujer, bienestar y cierre de primer trimestre.",
    hitos: [
      { f: "8 mar", t: "Día de la Mujer", i: "Liderazgo femenino y reconocimiento." },
      { f: "21 mar", t: "Inicio de primavera / equinoccio", i: "Renovación y frescura." },
    ],
  },
  Abril: {
    foco: "Semana Santa, familia y descanso.",
    hitos: [
      { f: "Semana Santa", t: "Vacaciones de Semana Santa", i: "Viajes, descanso y planes en familia." },
      { f: "22 abr", t: "Día de la Tierra", i: "Sostenibilidad y propósito de marca." },
    ],
  },
  Mayo: {
    foco: "Mes de la madre: campañas emocionales de alto consumo.",
    hitos: [
      { f: "2.º domingo", t: "Día de la Madre", i: "Regalos, gratitud y testimonios." },
      { f: "1 may", t: "Día del Trabajo", i: "Equipo, oficios y comunidad." },
    ],
  },
  Junio: {
    foco: "Mitad de año, padres y orgullo.",
    hitos: [
      { f: "3.er domingo", t: "Día del Padre", i: "Regalos y homenajes." },
      { f: "Todo el mes", t: "Mes del Orgullo", i: "Diversidad e inclusión." },
    ],
  },
  Julio: {
    foco: "Vacaciones de mitad de año y temporada de viajes.",
    hitos: [
      { f: "20 jul", t: "Día de la Independencia", i: "Orgullo nacional y colombianidad." },
      { f: "Todo el mes", t: "Vacaciones escolares", i: "Planes, viajes y entretenimiento." },
    ],
  },
  Agosto: {
    foco: "Regreso a clases y reactivación comercial.",
    hitos: [
      { f: "7 ago", t: "Batalla de Boyacá", i: "Fecha patria." },
      { f: "Feria de las Flores", t: "Feria de Medellín", i: "Cultura, color y región." },
    ],
  },
  Septiembre: {
    foco: "Amor y amistad (Colombia) y arranque de Q4.",
    hitos: [
      { f: "3.er sábado", t: "Día de Amor y Amistad", i: "Amigo secreto, parejas y regalos." },
      { f: "Todo el mes", t: "Preparación de fin de año", i: "Adelanto de campañas." },
    ],
  },
  Octubre: {
    foco: "Halloween y activaciones de temporada.",
    hitos: [
      { f: "31 oct", t: "Halloween / Día de los Niños", i: "Disfraces, dulces y contenido lúdico." },
      { f: "Rosa", t: "Mes de la lucha contra el cáncer de mama", i: "Causa y concienciación." },
    ],
  },
  Noviembre: {
    foco: "Black Friday y pico de ventas del año.",
    hitos: [
      { f: "Último viernes", t: "Black Friday / Cyber Monday", i: "Ofertas y conversión máxima." },
      { f: "Todo el mes", t: "Antesala navideña", i: "Listas de deseos y adelantos." },
    ],
  },
  Diciembre: {
    foco: "Navidad, balance y cierre de año.",
    hitos: [
      { f: "7 dic", t: "Día de las Velitas", i: "Inicio de la Navidad en Colombia." },
      { f: "24–25 dic", t: "Navidad", i: "Familia, regalos y gratitud." },
      { f: "31 dic", t: "Fin de año", i: "Balance, agradecimiento y propósitos." },
    ],
  },
};

// Argentina, México y USA: meses clave (el resto cae al foco genérico).
const CAL_AR: PaisCal = {
  Marzo: { foco: "Mujer y otoño austral.", hitos: [{ f: "8 mar", t: "Día de la Mujer", i: "Liderazgo femenino." }, { f: "24 mar", t: "Día de la Memoria", i: "Fecha cívica." }] },
  Mayo: { foco: "Patria y trabajo.", hitos: [{ f: "1 may", t: "Día del Trabajador", i: "Equipo y oficios." }, { f: "25 may", t: "Revolución de Mayo", i: "Orgullo nacional." }] },
  Julio: { foco: "Independencia e invierno.", hitos: [{ f: "9 jul", t: "Día de la Independencia", i: "Fecha patria." }, { f: "Vacaciones", t: "Receso invernal", i: "Familia y planes." }] },
  Octubre: { foco: "Madre (Argentina) y primavera.", hitos: [{ f: "3.er domingo", t: "Día de la Madre", i: "Regalos y gratitud." }] },
  Noviembre: { foco: "Hot Sale / pico de ventas.", hitos: [{ f: "Cyber", t: "CyberMonday AR", i: "Ofertas y conversión." }] },
  Diciembre: { foco: "Fiestas y cierre.", hitos: [{ f: "24–25 dic", t: "Navidad", i: "Familia y regalos." }, { f: "31 dic", t: "Año Nuevo", i: "Balance." }] },
};

const CAL_MX: PaisCal = {
  Febrero: { foco: "Amor y amistad.", hitos: [{ f: "14 feb", t: "Día del Amor y la Amistad", i: "Parejas y regalos." }] },
  Mayo: { foco: "Madres (10 de mayo).", hitos: [{ f: "10 may", t: "Día de las Madres", i: "Alta fecha de consumo." }, { f: "5 may", t: "Batalla de Puebla", i: "Fecha cívica." }] },
  Septiembre: { foco: "Fiestas patrias.", hitos: [{ f: "16 sep", t: "Independencia de México", i: "Orgullo nacional." }] },
  Octubre: { foco: "Buen Fin / temporada alta.", hitos: [{ f: "Fin de mes", t: "El Buen Fin (antesala)", i: "Mayor evento de ventas." }] },
  Noviembre: { foco: "Día de Muertos y Buen Fin.", hitos: [{ f: "1–2 nov", t: "Día de Muertos", i: "Tradición y cultura." }, { f: "Mediados", t: "El Buen Fin", i: "Ofertas y conversión." }] },
  Diciembre: { foco: "Guadalupe-Reyes y fiestas.", hitos: [{ f: "12 dic", t: "Día de la Virgen de Guadalupe", i: "Tradición." }, { f: "24–25 dic", t: "Navidad", i: "Familia y regalos." }] },
};

const CAL_US: PaisCal = {
  Febrero: { foco: "Valentine's & Super Bowl.", hitos: [{ f: "14 feb", t: "Valentine's Day", i: "Parejas y regalos." }, { f: "Inicio", t: "Super Bowl", i: "Gran audiencia." }] },
  Mayo: { foco: "Mother's Day & Memorial Day.", hitos: [{ f: "2.º domingo", t: "Mother's Day", i: "Alta fecha de consumo." }, { f: "Último lunes", t: "Memorial Day", i: "Inicio del verano." }] },
  Julio: { foco: "Independence Day & verano.", hitos: [{ f: "4 jul", t: "Independence Day", i: "Orgullo y celebración." }] },
  Noviembre: { foco: "Thanksgiving & Black Friday.", hitos: [{ f: "4.º jueves", t: "Thanksgiving", i: "Familia y gratitud." }, { f: "Viernes sig.", t: "Black Friday / Cyber Monday", i: "Pico de ventas." }] },
  Diciembre: { foco: "Holidays & fin de año.", hitos: [{ f: "25 dic", t: "Christmas", i: "Regalos y familia." }, { f: "31 dic", t: "New Year's Eve", i: "Balance." }] },
};

export const CALENDARIOS: Record<string, PaisCal> = {
  Colombia: CAL_CO,
  Argentina: CAL_AR,
  México: CAL_MX,
  "Estados Unidos": CAL_US,
};

export const PAISES = Object.keys(CALENDARIOS);
export const MESES = Object.keys(CAL_CO);

// Plan de publicación semanal por plantilla (dow 1=lun..7=dom; t=código de contenido).
export type PlanItem = { dow: number; t: string; quin?: boolean };
export const PLAN_PUB: Record<string, PlanItem[]> = {
  marca_personal: [
    { dow: 1, t: "R" },
    { dow: 3, t: "H" },
    { dow: 4, t: "C" },
    { dow: 5, t: "R" },
    { dow: 2, t: "Y", quin: true },
  ],
  contenido_empresa: [
    { dow: 1, t: "C" },
    { dow: 2, t: "R" },
    { dow: 4, t: "R" },
    { dow: 5, t: "H" },
    { dow: 3, t: "Y", quin: true },
  ],
  contenido_medico: [
    { dow: 1, t: "C" },
    { dow: 3, t: "R" },
    { dow: 5, t: "H" },
    { dow: 2, t: "Y", quin: true },
  ],
};

// Significado de los códigos de contenido.
export const CONTENT_CODES: Record<string, { label: string; tone: string }> = {
  R: { label: "Reel", tone: "violet" },
  H: { label: "Historia", tone: "amber" },
  C: { label: "Carrusel", tone: "sky" },
  Y: { label: "Video largo / YouTube", tone: "rose" },
  E: { label: "Edición / extra", tone: "emerald" },
};

export function mesCal(pais: string, mes: string): MesCal {
  const p = CALENDARIOS[pais] ?? CAL_CO;
  return p[mes] ?? { foco: "Contenido de temporada y mensajes clave del mes.", hitos: [] };
}

export function planFor(tpl: string): PlanItem[] {
  return PLAN_PUB[tpl] ?? PLAN_PUB.contenido_empresa;
}

// Resumen del plan para mostrar al cliente: piezas/semana, total mensual aprox.
export function planSummary(tpl: string) {
  const plan = planFor(tpl);
  const weekly = plan.filter((p) => !p.quin).length;
  const biweekly = plan.filter((p) => p.quin).length;
  const monthly = weekly * 4 + biweekly * 2;
  return { weekly, monthly, plan };
}
