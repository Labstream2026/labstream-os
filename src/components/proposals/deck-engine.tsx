"use client";

import * as React from "react";

// Motor del DECK — PORTADO 1:1 del engine.js del referente (propuestas.labstreamsas.com/contenido/):
// mismo IntersectionObserver (revelado + tema + punto activo), mismos contadores animados, mismo
// current() (sección más cercana al centro), misma rueda (una = una diapositiva, 780 ms) y teclado.
// ÚNICA diferencia con el referente: el desplazamiento. El root layout de la app hace de <body> el
// scroller, así que #main es el scroller propio del deck y el smooth NATIVO (scrollIntoView) está
// roto en scrollers anidados en Chrome → aquí el suave lo hace un tween por rAF que escribe
// #main.scrollTop directo, con easing ease-in-out para que se SIENTA igual que el smooth del navegador.
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

    // ---------- SCROLL SUAVE (rAF, sustituye al scrollIntoView nativo) ----------
    // ease-in-out cúbico: acelera y desacelera como el smooth del navegador (el referente usa el
    // nativo). Duración ligada a la distancia para que un salto de una diapositiva y uno de varias
    // se sientan proporcionales, igual que el nativo.
    let anim = 0;
    const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    function smoothTo(to: number) {
      const max = main!.scrollHeight - main!.clientHeight;
      to = Math.max(0, Math.min(to, max));
      const from = main!.scrollTop;
      const dist = to - from;
      if (Math.abs(dist) < 2) return;
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
      sections[i].classList.add("in"); // revela el destino ya (no espera al observer)
      smoothTo(sections[i].offsetTop);
    }

    // ---------- current(): sección cuyo centro está más cerca del centro del viewport ----------
    // (idéntico al referente, pero medido dentro de #main en vez de la ventana).
    const current = () => {
      const mtop = main!.getBoundingClientRect().top;
      const mid = main!.clientHeight / 2;
      let best = 0, bd = Infinity;
      sections.forEach((s, i) => {
        const r = s.getBoundingClientRect();
        const d = Math.abs(r.top - mtop + r.height / 2 - mid);
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    };

    // ---------- OBSERVER: revelado + tema + punto activo (idéntico al referente, root:#main) ----------
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("in");
            if (en.intersectionRatio > 0.5) {
              const theme = (en.target as HTMLElement).getAttribute("data-theme");
              document.body.classList.toggle("t-light", theme === "light");
              const idx = sections.indexOf(en.target as HTMLElement);
              dotEls.forEach((d, i) => d.classList.toggle("active", i === idx));
            }
          }
        });
      },
      { root: main, threshold: [0.15, 0.5, 0.75] },
    );
    sections.forEach((s) => io.observe(s));

    // ---------- BARRA DE PROGRESO ----------
    const onScroll = () => {
      const max = main!.scrollHeight - main!.clientHeight;
      const p = max > 0 ? main!.scrollTop / max : 0;
      if (prog) prog.style.width = `${(p * 100).toFixed(2)}%`;
    };
    main.addEventListener("scroll", onScroll, { passive: true });

    // ---------- CONTADORES (números que suben de 0 al data-target en 1100 ms) ----------
    const cio = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          const el = en.target as HTMLElement & { _done?: boolean };
          if (en.isIntersecting && !el._done) {
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
          }
        });
      },
      { root: main, threshold: 0.8 },
    );
    main.querySelectorAll<HTMLElement>(".count").forEach((c) => cio.observe(c));

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
      const vh = main!.clientHeight;
      const dir = e.deltaY > 0 ? 1 : -1;
      if (dir > 0 && r.bottom > vh + 2) return; // aún hay contenido abajo en esta sección
      if (dir < 0 && r.top < -2) return; // aún hay contenido arriba
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

    // Al volver la pestaña a primer plano (Chrome pausa rAF/observer en 2º plano): revela lo visible,
    // recalcula progreso y reanuda el video.
    const onVisible = () => {
      if (!document.hidden) {
        playVids();
        onScroll();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    // Re-alinear a la diapositiva actual si cambia el tamaño (dvh en móvil, rotación).
    const onResize = () => { smoothTo(sections[current()].offsetTop); onScroll(); };
    window.addEventListener("resize", onResize);

    // ---------- ARRANQUE ----------
    sections[0].classList.add("in");
    document.body.classList.toggle("t-light", sections[0].getAttribute("data-theme") === "light");
    dotEls.forEach((d, i) => d.classList.toggle("active", i === 0));
    onScroll();
    playVids();

    return () => {
      io.disconnect();
      cio.disconnect();
      main.removeEventListener("scroll", onScroll);
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
