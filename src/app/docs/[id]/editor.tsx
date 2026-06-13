"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { EditorConfig } from "@/lib/onlyoffice";

declare global {
  interface Window {
    DocsAPI?: { DocEditor: new (el: string, config: unknown) => unknown };
  }
}

export function OnlyOfficeEditor({
  docsUrl,
  config,
  title,
  backHref,
}: {
  docsUrl: string;
  config: EditorConfig;
  title: string;
  backHref: string;
}) {
  React.useEffect(() => {
    const script = document.createElement("script");
    script.src = `${docsUrl}/web-apps/apps/api/documents/api.js`;
    script.async = true;
    script.onload = () => {
      if (window.DocsAPI) new window.DocsAPI.DocEditor("oo-editor", config);
    };
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, [docsUrl, config]);

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Volver
        </Link>
        <span className="truncate text-sm font-medium">{title}</span>
        <span className="ml-auto text-xs text-muted-foreground">Editando en OnlyOffice · se guarda solo</span>
      </header>
      <div id="oo-editor" className="flex-1" />
    </div>
  );
}
