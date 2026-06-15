"use client";

import * as React from "react";
import { ProjectCard, type ProjectCardData } from "@/components/project-card";

export type BoardClient = {
  id: string;
  name: string;
  emoji: string | null;
  projects: ProjectCardData[];
};

// Tablero de proyectos agrupados por cliente, con dos disposiciones:
// vertical (secciones apiladas) u horizontal (un columna por cliente, lado a lado).
export function ProjectsBoard({ clients }: { clients: BoardClient[] }) {
  const [horizontal, setHorizontal] = React.useState(false);

  React.useEffect(() => {
    setHorizontal(window.localStorage.getItem("ui:proyectosBoard") === "h");
  }, []);
  const setMode = (h: boolean) => {
    setHorizontal(h);
    window.localStorage.setItem("ui:proyectosBoard", h ? "h" : "v");
  };

  const Header = ({ c }: { c: BoardClient }) => (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-base">{c.emoji}</span>
      <h2 className="text-sm font-semibold">{c.name}</h2>
      <span className="text-xs text-muted-foreground">· {c.projects.length}</span>
    </div>
  );

  return (
    <div>
      {/* Conmutador de disposición */}
      <div className="mb-4 flex justify-end">
        <div className="inline-flex overflow-hidden rounded-md border border-border text-xs">
          <button
            type="button"
            onClick={() => setMode(false)}
            className={cnToggle(!horizontal)}
            title="Apilados (vertical)"
          >
            ▤ Vertical
          </button>
          <button
            type="button"
            onClick={() => setMode(true)}
            className={cnToggle(horizontal)}
            title="Columnas por cliente (horizontal)"
          >
            ▥ Horizontal
          </button>
        </div>
      </div>

      {horizontal ? (
        <div className="flex gap-4 overflow-x-auto pb-3">
          {clients.map((c) => (
            <section key={c.id} className="w-72 shrink-0">
              <Header c={c} />
              <div className="space-y-3">
                {c.projects.map((p) => (
                  <ProjectCard key={p.id} project={p} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {clients.map((c) => (
            <section key={c.id}>
              <Header c={c} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {c.projects.map((p) => (
                  <ProjectCard key={p.id} project={p} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function cnToggle(active: boolean) {
  return [
    "px-3 py-1.5 font-medium transition-colors",
    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
  ].join(" ");
}
