# Labstream Correcciones · integración con DaVinci Resolve

Las correcciones que los clientes dejan en [os.labstreamsas.com](https://os.labstreamsas.com),
dentro de Resolve. Hay **dos piezas**:

| Pieza | Qué es | Para quién |
|---|---|---|
| **Panel (fase 2, recomendado)** — `panel/` | Ventana de Workflow Integration que muestra el panel web `/resolve`: login normal (Authentik), clientes → proyectos → videos → correcciones **con las capturas del cliente**, saltar al timecode y marcadores | Todo el equipo (requiere Resolve **Studio**, Win/Mac) |
| **Script (fase 1, respaldo)** — `labstream_correcciones.py` | Panel nativo simple que funciona pegando el enlace de revisión de UN entregable | Freelancers sin cuenta, o Resolve gratuito |

## Panel (fase 2) — instalación

1. Copia la carpeta `panel/` a la máquina del editor.
2. **Windows**: clic derecho en `panel/instalar-panel-windows.ps1` → *Ejecutar con PowerShell* (pide admin).
   **Mac**: doble clic en `panel/instalar-panel-mac.command` (pide contraseña). Si macOS no lo deja
   ejecutar (pasa cuando la carpeta llegó por zip/Drive y perdió el permiso), ábrelo desde Terminal:
   `bash instalar-panel-mac.command` — hace exactamente lo mismo.
   El instalador copia el plugin a la carpeta de Workflow Integrations de Resolve y toma el módulo
   `WorkflowIntegration.node` del propio Resolve instalado (por eso requiere Studio).
3. Reinicia Resolve → **Workspace ▸ Workflow Integrations ▸ Labstream Correcciones**.
4. La primera vez, inicia sesión como siempre (Authentik o correo/contraseña). La sesión queda
   guardada en el panel.

### Qué hace

- **Vista por video**: eliges cliente → proyecto → video, y el panel queda enfocado en las
  correcciones de ESE video (prioridad, autor, timecode, estado, hilos y **capturas/dibujos
  del cliente** con zoom).
- **Clic en el timecode** → el cabezal de Resolve salta a ese momento (maneja el inicio
  01:00:00:00 del timeline y drop-frame; campo *Offset* por si hay claqueta).
- **✓ Hecha / Reabrir** → sincroniza con la web y avisa al equipo (queda registrado quién).
- **Sincronizar marcadores** → pinta cada corrección en el timeline: 🔴 obligatoria pendiente,
  🟡 sugerencia, 🟢 hecha. Usa la marca interna `lsos:` y nunca toca tus marcadores.
- Solo muestra **revisión de entregables** — sin tareas, chat ni nada más de la app.
- **Modo paleta**: Resolve no permite acoplar ventanas de terceros a sus paneles, así que el
  panel hace lo más parecido — flota SIEMPRE encima de Resolve (no se esconde al hacer clic en
  el timeline; **F2** lo alterna), recuerda su posición y tamaño, y la primera vez se pega al
  borde derecho de la pantalla como barra lateral.

### Ligereza

El plugin NO empaca Electron ni Node: Resolve 19.0.2+ trae su propio runtime. La carpeta
instalada pesa **menos de 0.5 MB** y no consume nada mientras la ventana está cerrada.

## Script (fase 1) — respaldo

Ver instrucciones en la versión anterior de este README (instalar `labstream_correcciones.py`
en la carpeta Scripts/Utility de Resolve con `instalar-windows.ps1` / `instalar-mac.command`;
requiere Python 3; se autentica pegando el enlace `/review/…` del entregable).

## Para desarrollo

- Panel web: `src/app/resolve/` (page + panel-client). Protegido por sesión (proxy + layout);
  el rol `cliente` no entra. Server action reutilizada: `resolveReviewComment`.
- Puente nativo: `panel/com.labstream.correcciones/` (main.js valida IPC; preload expone
  `window.labstream` con `jump`, `syncMarkers`, `info`). Matemática de TC en `timecode.js`
  (`node timecode.js` corre el selftest SMPTE) — espejo del selftest de Python.
- Probar el panel web sin Resolve: abre `https://os.labstreamsas.com/resolve` en un navegador
  angosto; sin puente, los botones de timeline se degradan con aviso.
- URL alternativa para pruebas: variable de entorno `LABSTREAM_PANEL_URL` antes de abrir Resolve.
- API por enlace de revisión (fase 1): `src/app/api/resolve-plugin/route.ts`.
