"use client";

import { useTransition } from "react";
import { TONES, tone } from "@/lib/colors";
import { setProjectColor } from "./[id]/actions";

// Punto de color con menú para asignar el color del proyecto (calendario).
export function ProjectColorPicker({ projectId, color }: { projectId: string; color: string | null }) {
  const [pending, start] = useTransition();
  const t = tone(color);
  return (
    <label className="relative inline-flex cursor-pointer items-center" title="Color del proyecto">
      <span className="size-3.5 rounded-full" style={{ backgroundColor: color ? t.hex : "transparent", border: color ? "none" : "1.5px dashed #94a3b8" }} />
      <select
        value={color ?? ""}
        disabled={pending}
        onChange={(e) => start(() => setProjectColor(projectId, e.target.value))}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="">Sin color</option>
        {TONES.map((to) => (
          <option key={to.key} value={to.key}>{to.label}</option>
        ))}
      </select>
    </label>
  );
}
