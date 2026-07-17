"use strict";
// Puente del panel: expone a la página (os.labstreamsas.com/resolve) SOLO estas tres
// operaciones, vía IPC aislado (contextIsolation + sandbox). La página nunca toca Node
// ni Electron directamente; main.js valida cada argumento al recibirlo.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("labstream", {
  shell: "workflow-integration",
  version: "2.0.0",
  jump: (args) => ipcRenderer.invoke("ls:jump", args),
  syncMarkers: (args) => ipcRenderer.invoke("ls:markers", args),
  info: () => ipcRenderer.invoke("ls:info"),
});
