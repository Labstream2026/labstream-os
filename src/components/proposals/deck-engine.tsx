"use client";

import * as React from "react";

// Motor del DECK sobre el scroller #main (no la ventana). El root layout de la app hace de
// <body> el scroller y fija <html> al viewport, lo que CONGELA el scroll suave/nativo
// programático en un scroller anidado (Chrome). Por eso: #main es el scroller y el suave lo
// hace este motor por rAF escribiendo scrollTop directo (que sí funciona). Mantiene el look del
// referente: puntos (data-label), barra de progreso, revelado (.r→.in), tema claro/oscuro por
// sección, navegación por rueda/teclado/flechas y autoplay de video. Táctil = scroll nativo.
export function DeckEngine() {
  React.useEffect(() => {
    const main = document.getElementById("main");
    const dotsWrap = document.getElementById("dots");
    const prog = document.getElementById("progress");
    if (!main) return;

    const sections = Array.from(main.querySelectorAll(":scope > section")) as HTMLElement[];
    if (!sections.length) return;

    // Puntos de navegación (con el data-label de cada sección).
    const dots: HTMLElement[] = [];
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
        dots.push(a);
      });
    }

    let cur = 0;
    const setActive = (i: number) => {
      cur = i;
      dots.forEach((d, k) => d.classList.toggle("active", k === i));
      document.body.classList.toggle("t-light", sections[i]?.getAttribute("data-theme") === "light");
    };

    // Scroll suave PROPIO (rAF): escribe scrollTop directo, evitando el smooth nativo (roto en
    // scrollers anidados). Deja avanzar si la sección es más alta que el viewport.
    let anim = 0;
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    function goTo(i: number) {
      i = Math.max(0, Math.min(i, sections.length - 1));
      const to = sections[i].offsetTop;
      const from = main!.scrollTop;
      const dist = to - from;
      setActive(i);
      sections[i].classList.add("in"); // revela el destino ya (no espera al onScroll)
      if (Math.abs(dist) < 2) return;
      if (anim) cancelAnimationFrame(anim);
      const start = performance.now();
      const dur = Math.min(720, 260 + Math.abs(dist) * 0.28);
      const step = (now: number) => {
        const k = Math.min((now - start) / dur, 1);
        main!.scrollTop = from + dist * easeOutCubic(k);
        if (k < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    }

    // Revelado + punto activo + progreso, en cada scroll (throttle con rAF).
    let ticking = 0;
    const reveal = () => {
      const vh = window.innerHeight;
      for (const s of sections) {
        const r = s.getBoundingClientRect();
        if (r.top < vh * 0.85 && r.bottom > 0) s.classList.add("in");
      }
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = requestAnimationFrame(() => {
        ticking = 0;
        const st = main!.scrollTop;
        const max = main!.scrollHeight - main!.clientHeight;
        if (prog) prog.style.width = `${(max > 0 ? (st / max) * 100 : 0).toFixed(2)}%`;
        const i = Math.round(st / main!.clientHeight);
        if (i !== cur && sections[i]) setActive(i);
        reveal();
      });
    };
    main.addEventListener("scroll", onScroll, { passive: true });

    // Teclado (flechas, RePág/AvPág, espacio) — ignora si se escribe en un campo.
    const NEXT = ["ArrowDown", "PageDown", "ArrowRight", " ", "Spacebar"];
    const PREV = ["ArrowUp", "PageUp", "ArrowLeft"];
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable)) return;
      const next = NEXT.includes(e.key);
      const prev = PREV.includes(e.key);
      if (!next && !prev) return;
      e.preventDefault();
      goTo(cur + (next ? 1 : -1));
    };
    window.addEventListener("keydown", onKey);

    // Flechas en pantalla.
    const bp = document.getElementById("navprev");
    const bn = document.getElementById("navnext");
    const gp = () => goTo(cur - 1);
    const gn = () => goTo(cur + 1);
    bp?.addEventListener("click", gp);
    bn?.addEventListener("click", gn);

    // Rueda: una rueda = una diapositiva; deja hacer scroll interno si la sección desborda.
    let wlock = false;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 8) return;
      const r = sections[cur].getBoundingClientRect();
      const dir = e.deltaY > 0 ? 1 : -1;
      if (dir > 0 && r.bottom > main!.clientHeight + 2) return; // aún hay contenido abajo
      if (dir < 0 && r.top < -2) return; // aún hay contenido arriba
      if (wlock) { e.preventDefault(); return; }
      if ((dir > 0 && cur >= sections.length - 1) || (dir < 0 && cur <= 0)) return;
      e.preventDefault();
      wlock = true;
      goTo(cur + dir);
      window.setTimeout(() => { wlock = false; }, 740);
    };
    main.addEventListener("wheel", onWheel, { passive: false });

    // Autoplay de los videos de fondo (robusto en todos los navegadores).
    const playVids = () => {
      main.querySelectorAll("video").forEach((v) => {
        v.muted = true;
        const p = v.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      });
    };

    // Re-alinear a la diapositiva actual si cambia el tamaño (dvh en móvil, rotación).
    const onResize = () => goTo(cur);
    window.addEventListener("resize", onResize);

    // Si la pestaña estaba en segundo plano al cargar (Chrome pausa el rAF ahí), al volver a ser
    // visible revela lo que quedó a la vista y reanuda el autoplay del video de fondo.
    const onVisible = () => {
      if (!document.hidden) {
        reveal();
        onScroll();
        playVids();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    // Arranque.
    setActive(0);
    sections[0].classList.add("in");
    reveal();
    onScroll();
    playVids();

    return () => {
      main.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
      bp?.removeEventListener("click", gp);
      bn?.removeEventListener("click", gn);
      main.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisible);
      if (anim) cancelAnimationFrame(anim);
      if (ticking) cancelAnimationFrame(ticking);
    };
  }, []);
  return null;
}
