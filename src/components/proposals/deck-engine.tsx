"use client";

import * as React from "react";

// Motor del DECK — reproduce EL MISMO comportamiento visible que el engine.js del referente
// (propuestas.labstreamsas.com/contenido/): revelado escalonado, punto activo y cambio de tema al
// pasar de sección, contadores que suben de 0, una rueda = una diapositiva, y flechas/teclado.
//
// Dos diferencias de implementación, ambas obligadas por el entorno de la app (y sin efecto visible):
//  1) El root layout hace de <body> el scroller y el smooth NATIVO está roto en scrollers anidados,
//     así que #main es el scroller propio del deck y el desplazamiento suave lo hace un tween por rAF
//     (ease-in-out, para que se sienta como el del navegador) escribiendo #main.scrollTop directo.
//  2) El estado (revelado/punto/tema/progreso/contadores) se actualiza de forma SÍNCRONA en el evento
//     scroll de #main —en vez de con IntersectionObserver— para que sea determinista y verificable.
// El resultado en pantalla es el mismo que el referente.
export function DeckEngine() {
  React.useEffect(() => {
    const main = document.getElementById("main");
    const dotsWrap = document.getElementById("dots");
    const prog = document.getElementById("progress");
    if (!main) return;

    const sections = Array.from(main.querySelectorAll(":scope > section")) as HTMLElement[];
    if (!sections.length) return;

    // ---------- PUNTOS DE NAVEGACIÓN (con el data-label de cada sección) ----------
    const dotEls: HTMLElement[] = [];
    if (dotsWrap) {
      dotsWrap.innerHTML = "";
      sections.forEach((s, i) => {
        const a = document.createElement("a");
        a.setAttribute("data-i", String(i));
        const lb = document.createElement("span");
        lb.className = "lb";
        lb.textContent = s.getAttribute("data-label") || `0${i + 1}`;
        a.appendChild(lb);
        a.addEventListener("click", () => goTo(i));
        dotsWrap.appendChild(a);
        dotEls.push(a);
      });
    }

    const counters = Array.from(main.querySelectorAll<HTMLElement & { _done?: boolean }>(".count"));

    // Lanza el conteo 0 → data-target en 1100 ms (igual que el referente).
    const startCount = (el: HTMLElement & { _done?: boolean }) => {
      if (el._done) return;
      el._done = true;
      const target = parseFloat(el.getAttribute("data-target") || "0");
      let t0: number | null = null;
      const dur = 1100;
      const step = (ts: number) => {
        if (t0 === null) t0 = ts;
        const k = Math.min((ts - t0) / dur, 1);
        el.textContent = String(Math.round(k * target));
        if (k < 1) requestAnimationFrame(step);
        else el.textContent = String(target);
      };
      requestAnimationFrame(step);
    };

    // ---------- ESTADO (revelado + punto activo + tema + progreso + contadores) ----------
    // Síncrono: se llama en cada evento scroll y tras cada paso del tween. Idempotente.
    let activeIdx = -1;
    const update = () => {
      const top = main!.getBoundingClientRect().top;
      const vh = main!.clientHeight;
      const mid = vh / 2;
      const rects = sections.map((s) => s.getBoundingClientRect());

      // Revelado (la sección entra ~15% en el viewport → .in, que el CSS revela con escalonado).
      sections.forEach((s, i) => {
        const r = rects[i];
        if (r.top - top < vh * 0.85 && r.bottom - top > vh * 0.15) s.classList.add("in");
      });

      // Punto activo + tema = sección cuyo centro está más cerca del centro del viewport.
      let best = 0, bd = Infinity;
      rects.forEach((r, i) => {
        const d = Math.abs(r.top - top + r.height / 2 - mid);
        if (d < bd) { bd = d; best = i; }
      });
      if (best !== activeIdx) {
        activeIdx = best;
        dotEls.forEach((d, k) => d.classList.toggle("active", k === best));
        document.body.classList.toggle("t-light", sections[best]?.getAttribute("data-theme") === "light");
      }

      // Barra de progreso.
      const max = main!.scrollHeight - main!.clientHeight;
      if (prog) prog.style.width = `${(max > 0 ? (main!.scrollTop / max) * 100 : 0).toFixed(2)}%`;

      // Contadores: arrancan cuando entran a la vista.
      for (const c of counters) {
        if (c._done) continue;
        const r = c.getBoundingClientRect();
        if (r.top - top < vh * 0.9 && r.bottom - top > 0) startCount(c);
      }
    };
    main.addEventListener("scroll", update, { passive: true });

    // current(): la sección más cercana al centro (para rueda/teclado/flechas).
    const current = () => (activeIdx < 0 ? 0 : activeIdx);

    // ---------- SCROLL SUAVE (rAF, sustituye al scrollIntoView nativo, roto en scrollers anidados) ----------
    // ease-in-out cúbico: acelera y desacelera como el smooth del navegador; duración según distancia.
    let anim = 0;
    const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    function smoothTo(to: number) {
      const max = main!.scrollHeight - main!.clientHeight;
      to = Math.max(0, Math.min(to, max));
      const from = main!.scrollTop;
      const dist = to - from;
      if (Math.abs(dist) < 2) { update(); return; }
      if (anim) cancelAnimationFrame(anim);
      const start = performance.now();
      const dur = Math.max(360, Math.min(760, 240 + Math.abs(dist) * 0.32));
      const step = (now: number) => {
        const k = Math.min((now - start) / dur, 1);
        main!.scrollTop = from + dist * easeInOut(k);
        if (k < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    }
    function goTo(i: number) {
      i = Math.max(0, Math.min(i, sections.length - 1));
      sections[i].classList.add("in"); // revela el destino ya
      smoothTo(sections[i].offsetTop);
    }

    // ---------- TECLADO (flechas, RePág/AvPág, espacio) ----------
    const NEXT = ["ArrowDown", "PageDown", "ArrowRight", " ", "Spacebar"];
    const PREV = ["ArrowUp", "PageUp", "ArrowLeft"];
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable)) return;
      const isNext = NEXT.includes(e.key);
      const isPrev = PREV.includes(e.key);
      if (!isNext && !isPrev) return;
      e.preventDefault();
      goTo(current() + (isNext ? 1 : -1));
    };
    window.addEventListener("keydown", onKey);

    // ---------- FLECHAS EN PANTALLA ----------
    const bp = document.getElementById("navprev");
    const bn = document.getElementById("navnext");
    const gp = () => goTo(current() - 1);
    const gn = () => goTo(current() + 1);
    bp?.addEventListener("click", gp);
    bn?.addEventListener("click", gn);

    // ---------- RUEDA (una rueda del mouse = una diapositiva; deja el scroll interno si desborda) ----------
    let wheelLock = false;
    const onWheel = (e: WheelEvent) => {
      if (wheelLock) { e.preventDefault(); return; }
      if (Math.abs(e.deltaY) < 4) return;
      const i = current();
      const r = sections[i].getBoundingClientRect();
      const top = main!.getBoundingClientRect().top;
      const vh = main!.clientHeight;
      const dir = e.deltaY > 0 ? 1 : -1;
      if (dir > 0 && r.bottom - top > vh + 2) return; // aún hay contenido abajo en esta sección
      if (dir < 0 && r.top - top < -2) return; // aún hay contenido arriba
      if ((dir > 0 && i >= sections.length - 1) || (dir < 0 && i <= 0)) return;
      e.preventDefault();
      wheelLock = true;
      goTo(i + dir);
      window.setTimeout(() => { wheelLock = false; }, 780);
    };
    main.addEventListener("wheel", onWheel, { passive: false });

    // ---------- AUTOPLAY DE VIDEOS DE FONDO ----------
    const playVids = () => {
      main.querySelectorAll("video").forEach((v) => {
        v.muted = true;
        v.setAttribute("muted", "");
        v.playsInline = true;
        const p = v.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      });
    };

    // Al volver a primer plano (Chrome pausa rAF/animaciones en 2º plano): recalcula y reanuda video.
    const onVisible = () => {
      if (!document.hidden) { update(); playVids(); }
    };
    document.addEventListener("visibilitychange", onVisible);

    // Re-alinear a la diapositiva actual si cambia el tamaño (dvh en móvil, rotación).
    const onResize = () => { smoothTo(sections[current()].offsetTop); update(); };
    window.addEventListener("resize", onResize);

    // ---------- ARRANQUE ----------
    sections[0].classList.add("in");
    update();
    playVids();

    return () => {
      main.removeEventListener("scroll", update);
      window.removeEventListener("keydown", onKey);
      bp?.removeEventListener("click", gp);
      bn?.removeEventListener("click", gn);
      main.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisible);
      if (anim) cancelAnimationFrame(anim);
    };
  }, []);
  return null;
}
