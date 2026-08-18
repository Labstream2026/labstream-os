"use strict";
// Matemática pura de timecode del panel (espejo 1:1 de resolve-plugin/labstream_correcciones.py,
// cuyo selftest SMPTE ya está verificado). Sin dependencias: la usa main.js y el selftest
// (`node timecode.js` la autoprueba).

// Segundos del video exportado → frames de OFFSET desde el inicio del timeline.
function secondsToOffsetFrames(seconds, fps) {
  return Math.round(Number(seconds) * Number(fps));
}

// Frames ABSOLUTOS → timecode "HH:MM:SS:FF" (o con ';' final si es drop-frame).
// fps es la tasa real (23.976, 29.97…); el conteo del TC usa la nominal redondeada.
// Drop-frame: descarta 2 frames por minuto (4 en 59.94) salvo cada décimo minuto (SMPTE).
function framesToTimecode(totalFrames, fps, dropFrame) {
  fps = Number(fps);
  const nominal = Math.round(fps);
  let frames = Math.trunc(totalFrames);
  const pad = (n) => String(n).padStart(2, "0");
  if (dropFrame && (nominal === 30 || nominal === 60)) {
    const drop = nominal === 30 ? 2 : 4;
    const fpm = nominal * 60 - drop; // frames por minuto CON descarte (minutos 1-9)
    const fp10 = fpm * 10 + drop; // frames por bloque de 10 min (el minuto 0 va completo)
    const tens = Math.floor(frames / fp10);
    const rem = frames % fp10;
    let totalMin, fim;
    if (rem < nominal * 60) {
      totalMin = tens * 10;
      fim = rem;
    } else {
      const m2 = rem - nominal * 60;
      totalMin = tens * 10 + 1 + Math.floor(m2 / fpm);
      fim = (m2 % fpm) + drop; // re-inserta los descartados para el desglose ss;ff
    }
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    const ss = Math.floor(fim / nominal);
    const ff = fim % nominal;
    return `${pad(hh)}:${pad(mm)}:${pad(ss)};${pad(ff)}`;
  }
  const hh = Math.floor(frames / (3600 * nominal));
  let rem = frames % (3600 * nominal);
  const mm = Math.floor(rem / (60 * nominal));
  rem = rem % (60 * nominal);
  const ss = Math.floor(rem / nominal);
  const ff = rem % nominal;
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

// Color del marcador según prioridad/estado (mismos del panel y del script Python).
function markerColor(item) {
  if (item.resolved) return "Green";
  return item.priority === "SUGERENCIA" ? "Yellow" : "Red";
}

module.exports = { secondsToOffsetFrames, framesToTimecode, markerColor };

// Selftest: `node timecode.js` — mismos valores canónicos del selftest de Python.
if (require.main === module) {
  const checks = [
    ["offset 24fps", secondsToOffsetFrames(10, 24), 240],
    ["offset 29.97", secondsToOffsetFrames(60, 29.97), 1798],
    ["tc 24 arranque 01h", framesToTimecode(86400, 24, false), "01:00:00:00"],
    ["tc 24 +10s", framesToTimecode(86400 + 240, 24, false), "01:00:10:00"],
    ["tc 25 90000", framesToTimecode(90000, 25, false), "01:00:00:00"],
    ["tc 30 medio", framesToTimecode(30 * 61 + 5, 30, false), "00:01:01:05"],
    ["df 1 min", framesToTimecode(1800, 29.97, true), "00:01:00;02"],
    ["df 10 min", framesToTimecode(17982, 29.97, true), "00:10:00;00"],
    ["df 1 h", framesToTimecode(107892, 29.97, true), "01:00:00;00"],
    ["df justo antes", framesToTimecode(1799, 29.97, true), "00:00:59;29"],
    ["color obligatoria", markerColor({ priority: "OBLIGATORIA", resolved: false }), "Red"],
    ["color sugerencia", markerColor({ priority: "SUGERENCIA", resolved: false }), "Yellow"],
    ["color hecha", markerColor({ priority: "OBLIGATORIA", resolved: true }), "Green"],
  ];
  let ok = true;
  for (const [name, got, want] of checks) {
    if (got !== want) {
      ok = false;
      console.log(`FALLA ${name}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
    } else {
      console.log(`ok    ${name}: ${JSON.stringify(got)}`);
    }
  }
  console.log(`\nSELFTEST ${ok ? "OK" : "CON FALLAS"}`);
  process.exit(ok ? 0 : 1);
}
