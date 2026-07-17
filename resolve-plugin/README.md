# Labstream Correcciones · plugin para DaVinci Resolve

Panel dentro de Resolve que trae las correcciones que los clientes dejan en
[os.labstreamsas.com](https://os.labstreamsas.com) directamente al timeline:

- **Lista del checklist** con prioridad (obligatoria/sugerencia), autor, timecode y estado.
- **Doble clic** (o botón «Ir al timecode») → el cabezal salta al punto exacto.
- **Marcar hecha / Reabrir** → sincroniza con la web y avisa al equipo (in-app).
- **Sincronizar marcadores** → pinta cada corrección como marcador del timeline:
  🔴 obligatoria pendiente · 🟡 sugerencia pendiente · 🟢 hecha.

Funciona en **Windows y Mac**, con Resolve **18 o superior** (gratis y Studio).

## Requisitos

- **Python 3** instalado en la máquina (Resolve no lo trae):
  - **Windows**: [python.org/downloads](https://www.python.org/downloads/) → marcar **“Add python.exe to PATH”** al instalar.
  - **Mac**: normalmente ya está (`python3 --version` en Terminal). Si no: `xcode-select --install`,
    o instalador de python.org (en ese caso ejecutar también su **Install Certificates.command**).
- Reiniciar Resolve después de instalar Python.

## Instalación

**Automática** (con este repo o la carpeta `resolve-plugin` copiada a la máquina):

- Windows: clic derecho en `instalar-windows.ps1` → *Ejecutar con PowerShell*.
- Mac: doble clic en `instalar-mac.command` (la primera vez: clic derecho → Abrir).

**Manual**: copiar `labstream_correcciones.py` a la carpeta de scripts de Resolve:

| SO | Carpeta |
|---|---|
| Windows | `%APPDATA%\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility` |
| Mac | `~/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility` |

(Crear la carpeta `Utility` si no existe.)

## Uso

1. Abre el proyecto y el timeline en Resolve (página **Edit**).
2. Menú **Workspace ▸ Scripts ▸ labstream_correcciones**.
3. Pega el **enlace de revisión** del entregable (el mismo `https://os.labstreamsas.com/review/…`
   que se comparte con el cliente) y pulsa **Cargar**. El panel lo recuerda por proyecto.
4. Escribe **tu nombre** (una vez): así el aviso al equipo dice quién marcó cada corrección.
5. Trabaja: doble clic para saltar al timecode, **Marcar hecha** al terminar cada punto,
   **Sincronizar marcadores** para verlas sobre el timeline.

### Detalles útiles

- **Offset (s)**: si tu timeline tiene claqueta/cortinilla antes del contenido (p. ej. 2 s),
  pon ese número y todos los saltos y marcadores se corren.
- El timecode del cliente es relativo al **video exportado**; el panel suma solo el inicio
  del timeline (01:00:00:00, etc.) automáticamente. Soporta drop-frame (29.97/59.94).
- Los marcadores del plugin llevan la marca interna `lsos:` — al re-sincronizar se
  actualizan/retiran solos y **no toca** los marcadores tuyos.
- «✏️» delante del texto = la corrección tiene un **dibujo del cliente**: míralo en la web.
- El filtro **Versión** muestra solo las correcciones de esa versión del entregable.
- Si el equipo **revoca** el enlace de revisión en la web, el plugin deja de tener acceso.

## Problemas comunes

| Síntoma | Causa / arreglo |
|---|---|
| El script no aparece en Workspace ▸ Scripts | Archivo en la carpeta equivocada, o falta reiniciar Resolve |
| El menú no abre nada / error de Python | Falta Python 3 o Resolve no lo detecta (reinstalar marcando *Add to PATH* y reiniciar) |
| «Error de certificados TLS» en Mac | Ejecutar el **Install Certificates.command** del Python de python.org |
| El salto cae unos frames corrido | Ajusta **Offset (s)** (claqueta) o revisa que el timeline sea la misma edición que el export |

## Para desarrollo

- Pruebas de la lógica pura (sin Resolve ni red): `python3 labstream_correcciones.py --selftest`
- API del lado servidor: `src/app/api/resolve-plugin/route.ts` (GET checklist, POST marcar hecha),
  autenticada con el token firmado del enlace de revisión. Ruta pública en `src/proxy.ts`.
