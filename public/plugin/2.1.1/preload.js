"use strict";
// Puente del panel: expone a la página (os.labstreamsas.com/resolve) SOLO estas operaciones,
// vía IPC aislado (contextIsolation + sandbox). La página nunca toca Node ni Electron
// directamente; main.js valida cada argumento al recibirlo.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("labstream", {
  shell: "workflow-integration",
  // La usa el panel para saber si hay versión nueva del PUENTE (la interfaz se actualiza sola,
  // es la propia página). Debe subir a la par que VERSION en main.js.
  version: "2.1.1",
  jump: (args) => ipcRenderer.invoke("ls:jump", args),
  syncMarkers: (args) => ipcRenderer.invoke("ls:markers", args),
  info: () => ipcRenderer.invoke("ls:info"),
  // Descarga la versión nueva a la carpeta del usuario; se estrena al reiniciar Resolve.
  update: () => ipcRenderer.invoke("ls:update"),
});
