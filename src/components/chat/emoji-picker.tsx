"use client";

import * as React from "react";

// Selector de emojis sin dependencias (set curado por categorías).
const GROUPS: { label: string; emojis: string[] }[] = [
  { label: "Caras", emojis: ["😀","😄","😁","😂","🤣","😊","😉","😍","😘","😎","🤩","🥳","🤔","🤨","😴","😮","😢","😭","😤","😡","🥺","😅","🙃","😏"] },
  { label: "Gestos", emojis: ["👍","👎","👏","🙌","🙏","👌","✌️","🤝","💪","👀","🫡","🤙","👋","🤞","✋","🫶"] },
  { label: "Corazones", emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","✨","⭐","🔥","💯","🎉","🎊","🚀"] },
  { label: "Trabajo", emojis: ["✅","☑️","❌","⚠️","📌","📎","📁","📄","📷","🎬","🎥","🎙️","🎧","💡","📊","📈","🗓️","⏰","☕","💻"] },
];

export function EmojiPicker({ onPick, align = "left", openUp = true, footer }: { onPick: (emoji: string) => void; align?: "left" | "right"; openUp?: boolean; footer?: React.ReactNode }) {
  return (
    <div className={`absolute z-30 w-64 rounded-xl border border-border bg-popover p-2 shadow-lg ${openUp ? "bottom-10" : "top-10"} ${align === "right" ? "right-0" : "left-0"}`}>
      <div className="max-h-56 space-y-2 overflow-y-auto">
        {GROUPS.map((g) => (
          <div key={g.label}>
            <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
            <div className="grid grid-cols-8 gap-0.5">
              {g.emojis.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => onPick(e)}
                  className="flex size-7 items-center justify-center rounded text-lg hover:bg-muted"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {footer ? <div className="mt-1 border-t border-border pt-1">{footer}</div> : null}
    </div>
  );
}

// Reacciones rápidas (para el botón "+" sobre un mensaje).
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "✅"];
