import { FILE_KIND_LABEL } from "@/lib/ui";
import { isEditableOffice } from "@/lib/onlyoffice";
import { addFile, deleteFile, uploadProjectFiles } from "./actions";

type FileAsset = { id: string; name: string; kind: string; url: string | null };
type Folder = { id: string; name: string; files: FileAsset[] };

export function FilesPanel({
  projectId,
  folders,
  looseFiles,
}: {
  projectId: string;
  folders: Folder[];
  looseFiles: FileAsset[];
}) {
  return (
    <div className="space-y-5">
      {/* Añadir archivo / enlace */}
      <form
        action={addFile.bind(null, projectId)}
        className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3"
      >
        <input
          name="name"
          required
          placeholder="Nombre del archivo o enlace…"
          className="min-w-44 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          name="url"
          required
          placeholder="https:// (Drive, link…)"
          className="min-w-44 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <select name="folderId" defaultValue="" className="rounded-md border border-input bg-background px-2 py-2 text-sm">
          <option value="">Sin carpeta</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Añadir
        </button>
      </form>

      {/* Subir archivos (locales, editables con OnlyOffice) */}
      <form
        action={uploadProjectFiles.bind(null, projectId)}
        className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border bg-card p-3"
      >
        <input
          type="file"
          name="files"
          multiple
          required
          className="min-w-44 flex-1 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
        <select name="folderId" defaultValue="" className="rounded-md border border-input bg-background px-2 py-2 text-sm">
          <option value="">Sin carpeta</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <button className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent">
          Subir archivos
        </button>
      </form>

      <div className="space-y-3">
        {folders.map((folder) => (
          <div key={folder.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="text-base">📁</span>
              <h3 className="text-sm font-semibold">{folder.name}</h3>
              <span className="text-xs text-muted-foreground">{folder.files.length}</span>
            </div>
            {folder.files.length > 0 ? (
              <ul className="mt-2 divide-y divide-border">
                {folder.files.map((file) => (
                  <FileRow key={file.id} file={file} projectId={projectId} />
                ))}
              </ul>
            ) : (
              <p className="mt-1 pl-7 text-xs text-muted-foreground">Vacía</p>
            )}
          </div>
        ))}

        {looseFiles.length > 0 ? (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">Sin carpeta</h3>
            <ul className="mt-2 divide-y divide-border">
              {looseFiles.map((file) => (
                <FileRow key={file.id} file={file} projectId={projectId} />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FileRow({ file, projectId }: { file: FileAsset; projectId: string }) {
  const icon = file.kind === "DRIVE" ? "🟢" : file.kind === "LOCAL" ? "📄" : "🔗";
  return (
    <li className="flex items-center gap-3 py-2">
      <span>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{file.name}</p>
        <p className="text-[11px] text-muted-foreground">{FILE_KIND_LABEL[file.kind] ?? file.kind}</p>
      </div>
      {file.kind === "LOCAL" ? (
        <>
          <a href={`/api/files-asset/${file.id}`} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground">
            Ver
          </a>
          {isEditableOffice(file.name) ? (
            <a href={`/docs/file/${file.id}`} className="text-xs text-primary hover:underline">
              Editar
            </a>
          ) : null}
          <a href={`/api/files-asset/${file.id}?download=1`} className="text-xs text-muted-foreground hover:text-foreground">
            Descargar
          </a>
        </>
      ) : file.url ? (
        <a href={file.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
          Abrir
        </a>
      ) : null}
      <form action={deleteFile.bind(null, file.id, projectId)}>
        <button className="text-xs text-muted-foreground hover:text-destructive" title="Eliminar">
          ✕
        </button>
      </form>
    </li>
  );
}
