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
  Enero: { foco: "Verano austral: vacaciones, turismo y ocio.", hitos: [{ f: "Todo el mes", t: "Temporada de verano", i: "Costa, viajes y planes al aire libre." }, { f: "Propósitos", t: "Año nuevo", i: "Hábitos y nuevos comienzos." }] },
  Febrero: { foco: "Carnaval y San Valentín.", hitos: [{ f: "14 feb", t: "San Valentín", i: "Parejas y regalos." }, { f: "Carnaval", t: "Feriado de Carnaval", i: "Color y contenido festivo." }] },
  Marzo: { foco: "Mujer, vuelta a clases y otoño.", hitos: [{ f: "8 mar", t: "Día de la Mujer", i: "Liderazgo femenino." }, { f: "Inicio", t: "Vuelta a clases", i: "Rutinas y productividad." }, { f: "24 mar", t: "Día de la Memoria", i: "Fecha cívica." }] },
  Abril: { foco: "Otoño, Pascua y Malvinas.", hitos: [{ f: "2 abr", t: "Día del Veterano (Malvinas)", i: "Fecha cívica." }, { f: "Semana Santa", t: "Pascua", i: "Familia y descanso." }] },
  Mayo: { foco: "Patria y trabajo.", hitos: [{ f: "1 may", t: "Día del Trabajador", i: "Equipo y oficios." }, { f: "25 may", t: "Revolución de Mayo", i: "Orgullo nacional." }] },
  Junio: { foco: "Padre y mitad de año.", hitos: [{ f: "3.er domingo", t: "Día del Padre", i: "Regalos y homenajes." }, { f: "20 jun", t: "Día de la Bandera", i: "Fecha patria." }] },
  Julio: { foco: "Independencia, invierno y vacaciones.", hitos: [{ f: "9 jul", t: "Día de la Independencia", i: "Fecha patria." }, { f: "Receso", t: "Vacaciones de invierno", i: "Familia, planes y entretenimiento." }] },
  Agosto: { foco: "Niñez y reactivación.", hitos: [{ f: "3.er domingo", t: "Día de las Infancias", i: "Familias y juguetería." }, { f: "17 ago", t: "Paso a la inmortalidad de San Martín", i: "Fecha cívica." }] },
  Septiembre: { foco: "Primavera y estudiante.", hitos: [{ f: "21 sep", t: "Día de la Primavera y del Estudiante", i: "Juventud, aire libre y frescura." }] },
  Octubre: { foco: "Madre y diversidad.", hitos: [{ f: "3.er domingo", t: "Día de la Madre", i: "Alta fecha de consumo." }, { f: "12 oct", t: "Día del Respeto a la Diversidad Cultural", i: "Fecha cívica." }] },
  Noviembre: { foco: "Hot Sale / pico de ventas previo a fiestas.", hitos: [{ f: "Cyber", t: "CyberMonday AR", i: "Ofertas y conversión." }, { f: "20 nov", t: "Día de la Soberanía", i: "Fecha cívica." }] },
  Diciembre: { foco: "Fiestas y cierre de año.", hitos: [{ f: "24–25 dic", t: "Navidad", i: "Familia y regalos." }, { f: "31 dic", t: "Año Nuevo", i: "Balance y celebración." }] },
};

const CAL_MX: PaisCal = {
  Enero: { foco: "Reyes, cuesta de enero y propósitos.", hitos: [{ f: "6 ene", t: "Día de Reyes", i: "Rosca, regalos y cierre navideño." }, { f: "Todo el mes", t: "Propósitos de año nuevo", i: "Hábitos y nuevos comienzos." }] },
  Febrero: { foco: "Amor y amistad.", hitos: [{ f: "14 feb", t: "Día del Amor y la Amistad", i: "Parejas y regalos." }, { f: "5 feb", t: "Día de la Constitución", i: "Fecha cívica." }] },
  Marzo: { foco: "Primavera y mujer.", hitos: [{ f: "8 mar", t: "Día Internacional de la Mujer", i: "Liderazgo femenino." }, { f: "21 mar", t: "Natalicio de Benito Juárez", i: "Fecha cívica." }] },
  Abril: { foco: "Niño y vacaciones de Semana Santa.", hitos: [{ f: "30 abr", t: "Día del Niño", i: "Familias y juguetería." }, { f: "Semana Santa", t: "Vacaciones", i: "Viajes y descanso." }] },
  Mayo: { foco: "Madres (10 de mayo): pico de consumo.", hitos: [{ f: "10 may", t: "Día de las Madres", i: "Alta fecha de consumo." }, { f: "5 may", t: "Batalla de Puebla", i: "Fecha cívica." }, { f: "15 may", t: "Día del Maestro", i: "Educación y reconocimiento." }] },
  Junio: { foco: "Padre y mitad de año.", hitos: [{ f: "3.er domingo", t: "Día del Padre", i: "Regalos y homenajes." }] },
  Julio: { foco: "Verano y vacaciones.", hitos: [{ f: "Todo el mes", t: "Vacaciones de verano", i: "Viajes, ocio y entretenimiento." }] },
  Agosto: { foco: "Regreso a clases.", hitos: [{ f: "Fin de mes", t: "Regreso a clases", i: "Útiles, rutinas y productividad." }] },
  Septiembre: { foco: "Mes patrio.", hitos: [{ f: "15–16 sep", t: "Independencia de México", i: "Orgullo nacional y el Grito." }] },
  Octubre: { foco: "Antesala del Buen Fin y temporada alta.", hitos: [{ f: "Rosa", t: "Lucha contra el cáncer de mama", i: "Causa y concienciación." }, { f: "31 oct", t: "Halloween", i: "Disfraces y contenido lúdico." }] },
  Noviembre: { foco: "Día de Muertos y El Buen Fin (mayor evento de ventas).", hitos: [{ f: "1–2 nov", t: "Día de Muertos", i: "Tradición y cultura." }, { f: "Mediados", t: "El Buen Fin", i: "Ofertas y conversión máxima." }] },
  Diciembre: { foco: "Guadalupe-Reyes y fiestas.", hitos: [{ f: "12 dic", t: "Día de la Virgen de Guadalupe", i: "Tradición." }, { f: "16–24 dic", t: "Posadas", i: "Reuniones y celebración." }, { f: "24–25 dic", t: "Navidad", i: "Familia y regalos." }] },
};

const CAL_US: PaisCal = {
  Enero: { foco: "New Year & resolutions.", hitos: [{ f: "1 ene", t: "New Year's Day", i: "Hábitos y nuevos comienzos." }, { f: "3.er lunes", t: "Martin Luther King Jr. Day", i: "Causa y comunidad." }] },
  Febrero: { foco: "Valentine's & Super Bowl.", hitos: [{ f: "14 feb", t: "Valentine's Day", i: "Parejas y regalos." }, { f: "Inicio", t: "Super Bowl", i: "Gran audiencia." }, { f: "Black History Month", t: "Mes de la Historia Negra", i: "Causa y representación." }] },
  Marzo: { foco: "Spring & St. Patrick's.", hitos: [{ f: "17 mar", t: "St. Patrick's Day", i: "Contenido festivo." }, { f: "20 mar", t: "Inicio de la primavera", i: "Renovación y frescura." }] },
  Abril: { foco: "Easter & taxes.", hitos: [{ f: "Variable", t: "Easter", i: "Familia y temporada." }, { f: "22 abr", t: "Earth Day", i: "Sostenibilidad y propósito." }] },
  Mayo: { foco: "Mother's Day & Memorial Day.", hitos: [{ f: "2.º domingo", t: "Mother's Day", i: "Alta fecha de consumo." }, { f: "Último lunes", t: "Memorial Day", i: "Inicio del verano." }] },
  Junio: { foco: "Father's Day & Pride.", hitos: [{ f: "3.er domingo", t: "Father's Day", i: "Regalos y homenajes." }, { f: "Todo el mes", t: "Pride Month", i: "Diversidad e inclusión." }] },
  Julio: { foco: "Independence Day & verano.", hitos: [{ f: "4 jul", t: "Independence Day", i: "Orgullo y celebración." }] },
  Agosto: { foco: "Back to school.", hitos: [{ f: "Fin de mes", t: "Back to School", i: "Útiles, rutinas y productividad." }] },
  Septiembre: { foco: "Labor Day & otoño.", hitos: [{ f: "1.er lunes", t: "Labor Day", i: "Cierre del verano y ofertas." }] },
  Octubre: { foco: "Halloween & Breast Cancer Awareness.", hitos: [{ f: "31 oct", t: "Halloween", i: "Disfraces y contenido lúdico." }, { f: "Rosa", t: "Breast Cancer Awareness", i: "Causa y concienciación." }] },
  Noviembre: { foco: "Thanksgiving & Black Friday (pico de ventas).", hitos: [{ f: "4.º jueves", t: "Thanksgiving", i: "Familia y gratitud." }, { f: "Viernes sig.", t: "Black Friday / Cyber Monday", i: "Pico de ventas." }] },
  Diciembre: { foco: "Holidays & fin de año.", hitos: [{ f: "25 dic", t: "Christmas", i: "Regalos y familia." }, { f: "31 dic", t: "New Year's Eve", i: "Balance y celebración." }] },
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
