"use client";

import * as React from "react";
import type { EditorConfig } from "@/lib/onlyoffice";
import { OnlyOfficeEditor, type MentionUser } from "../../[id]/editor";
import { notifyDocMention } from "./mention-actions";
import { CommentsPanel } from "./comments-panel";
import { HistoryPanel } from "./history-panel";

// El editor de un archivo de PROYECTO con todo lo que la app le añade encima: comentarios,
// historial y menciones. Se separa del editor genérico (que también usa el chat) para que
// aquello siga siendo tonto y esto sea lo específico de los archivos del proyecto.
export function FileEditorShell({
  docsUrl,
  config,
  title,
  backHref,
  downloadHref,
  fileId,
  projectId,
  comentarios,
  mentions,
  presentes,
}: {
  docsUrl: string;
  config: EditorConfig;
  title: string;
  backHref: string;
  downloadHref: string;
  fileId: string;
  projectId: string;
  comentarios: number;
  mentions: MentionUser[];
  presentes: string[];
}) {
  const avisarMencion = React.useCallback(
    (emails: string[], comment: string, actionLink: unknown) => {
      void notifyDocMention(fileId, emails, comment, actionLink);
    },
    [fileId],
  );

  return (
    <OnlyOfficeEditor
      docsUrl={docsUrl}
      config={config}
      title={title}
      backHref={backHref}
      downloadHref={downloadHref}
      mentions={mentions}
      onMention={avisarMencion}
      presentes={presentes}
      extra={
        <>
          <CommentsPanel fileId={fileId} projectId={projectId} count={comentarios} />
          <HistoryPanel fileId={fileId} />
        </>
      }
    />
  );
}
