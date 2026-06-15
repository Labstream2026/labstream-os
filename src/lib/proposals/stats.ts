// Tarjetas de estadística por plantilla para el bloque `stats`.
// { n: número/etiqueta, p: frase, f: fuente }

export type Stat = { n: string; p: string; f: string };

export const STATS_TPL: Record<string, Stat[]> = {
  marca_personal: [
    { n: "73%", p: "confía más en el liderazgo de opinión que en el marketing tradicional", f: "Edelman & LinkedIn" },
    { n: "44%", p: "de los decisores ha contratado a alguien por el contenido de su marca personal", f: "CareerBuilder" },
    { n: "99%", p: "de los compradores B2B dice que el thought leadership influye en su decisión", f: "Edelman" },
    { n: "×3", p: "más alcance tiene el contenido de personas que el de páginas de marca", f: "LinkedIn" },
  ],
  contenido_empresa: [
    { n: "89%", p: "dice que la calidad del video impacta su confianza en una marca", f: "Wyzowl 2025" },
    { n: "84%", p: "de los consumidores quiere ver más videos de las marcas que sigue", f: "Wyzowl" },
    { n: "×1.8", p: "más conversión generan las páginas con video frente a las que no lo tienen", f: "Unbounce" },
    { n: "91%", p: "de las empresas usa el video como herramienta de marketing", f: "Wyzowl" },
  ],
  contenido_medico: [
    { n: "73%", p: "de los pacientes busca información de salud en internet antes de consultar", f: "Pew Research" },
    { n: "×2", p: "más recordación logra el contenido en video frente al texto", f: "Forrester" },
    { n: "82%", p: "confía más en un profesional con presencia digital educativa", f: "Medscape" },
    { n: "+57%", p: "de intención de agendar cita tras ver contenido educativo", f: "Google Health" },
  ],
  video_institucional: [
    { n: "95%", p: "del mensaje se retiene cuando se ve en video (vs 10% en texto)", f: "Insivia" },
    { n: "×12", p: "más probabilidades de ser compartido que el texto y las imágenes juntas", f: "Wordstream" },
    { n: "88%", p: "de los profesionales del marketing reporta buen ROI del video", f: "Wyzowl" },
  ],
  streaming: [
    { n: "×3", p: "más tiempo de atención genera el video en vivo frente al pregrabado", f: "Livestream" },
    { n: "80%", p: "prefiere ver un live de una marca antes que leer un blog", f: "Livestream" },
    { n: "+27%", p: "de duración de visualización en transmisiones multicámara", f: "Vimeo" },
  ],
  cubrimiento_fotografico: [
    { n: "×2.3", p: "más interacción reciben las publicaciones con fotografía profesional", f: "HubSpot" },
    { n: "67%", p: "considera la calidad de imagen como decisiva al comprar", f: "MDG Advertising" },
  ],
  cubrimiento_evento: [
    { n: "×4", p: "más alcance logran los eventos con cobertura audiovisual", f: "Bizzabo" },
    { n: "70%", p: "del público recuerda mejor una marca tras ver el highlight del evento", f: "EventMB" },
  ],
};

export function statsFor(tpl: string): Stat[] {
  return STATS_TPL[tpl] ?? STATS_TPL.contenido_empresa;
}
