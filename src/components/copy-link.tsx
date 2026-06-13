"use client";

import { useState } from "react";
import { Link2, Check } from "lucide-react";

export function CopyLink({ url, label = "Copiar enlace de revisión" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent"
    >
      {copied ? <Check className="size-3.5 text-emerald-600" /> : <Link2 className="size-3.5" />}
      {copied ? "¡Copiado!" : label}
    </button>
  );
}
