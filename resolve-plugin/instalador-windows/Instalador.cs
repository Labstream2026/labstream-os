// Instalador de Windows del panel «Labstream Correcciones» para DaVinci Resolve.
//
// Un solo .exe con el kit completo embebido (kit.zip como recurso): el editor hace doble clic,
// acepta el aviso de administrador y listo. Hace lo mismo que instalar-panel-windows.ps1, que
// sigue existiendo dentro del zip como camino alternativo:
//   1. comprueba que haya DaVinci Resolve (y avisa si está abierto),
//   2. busca WorkflowIntegration.node en el SDK del PROPIO Resolve del equipo (es binario de
//      Blackmagic por plataforma: no puede viajar dentro de este instalador),
//   3. extrae el plugin a ProgramData y pone el .node al lado.
//
// Se compila con el csc del .NET Framework que trae Windows (C# 5: nada de $"...", ni ?.) —
// lo lanza scripts/empaquetar-plugin.mjs, que además genera InfoInstalador con la versión.
// El manifiesto va asInvoker y la elevación se pide desde el código: así el modo --probar
// puede correr SIN administrador (escribe en una carpeta de prueba, no en ProgramData), que es
// como se verifica el instalador en la máquina de desarrollo sin tocar la instalación real.

using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Principal;
using System.Text;
using System.Windows.Forms;

internal static class Programa
{
    private const string CARPETA = "com.labstream.correcciones";

    [STAThread]
    private static int Main(string[] args)
    {
        bool probar = args.Length > 0 && args[0] == "--probar";
        bool yaElevado = args.Length > 0 && args[0] == "--elevado";
        try
        {
            if (probar)
            {
                string dir = args.Length > 1 ? args[1] : Path.Combine(Path.GetTempPath(), "labstream-prueba-instalador");
                return Probar(dir);
            }
            return Instalar(yaElevado);
        }
        catch (Exception e)
        {
            if (!probar) Aviso("No se pudo instalar:\n\n" + e.Message, MessageBoxIcon.Error);
            return 1;
        }
    }

    private static int Instalar(bool yaElevado)
    {
        // Elevación desde el código (el manifiesto es asInvoker a propósito, ver cabecera).
        if (!EsAdmin())
        {
            // La marca --elevado corta la recursión: si el hijo llega aquí SIN ser admin (UAC
            // apagado por directiva, cuenta estándar sin credenciales), sin ella se relanzaría
            // a sí mismo en cadena, para siempre y sin ningún mensaje.
            if (yaElevado)
            {
                Aviso("No pude obtener permisos de administrador.\n\nEjecuta el instalador con clic derecho → «Ejecutar como administrador», o pídele a quien administre este equipo que lo corra.", MessageBoxIcon.Error);
                return 1;
            }
            var psi = new ProcessStartInfo(Application.ExecutablePath, "--elevado");
            psi.UseShellExecute = true;
            psi.Verb = "runas";
            try { Process.Start(psi); }
            catch { Aviso("La instalación necesita permisos de administrador: el plugin se copia a una carpeta del sistema, que es donde Resolve lo busca.", MessageBoxIcon.Warning); }
            return 0;
        }

        string resolveExe = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "Blackmagic Design", "DaVinci Resolve", "Resolve.exe");
        if (!File.Exists(resolveExe))
        {
            Aviso("No encuentro DaVinci Resolve instalado en este equipo.\n\nInstala DaVinci Resolve STUDIO y vuelve a ejecutar este instalador.", MessageBoxIcon.Error);
            return 1;
        }

        if (Process.GetProcessesByName("Resolve").Length > 0)
        {
            var r = MessageBox.Show(
                "DaVinci Resolve está abierto. Si sigo, no verá el panel nuevo hasta que lo reinicies (y algún archivo podría estar bloqueado).\n\n¿Continuar de todas formas?",
                "Labstream Correcciones", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
            if (r != DialogResult.Yes) return 0;
        }

        string nodo = BuscarNodo();
        if (nodo == null)
        {
            Aviso("No encuentro el SDK de Workflow Integrations (WorkflowIntegration.node).\n\n" +
                  "Esto casi siempre significa que este equipo tiene la versión GRATUITA de DaVinci Resolve: " +
                  "los Workflow Integrations solo existen en DaVinci Resolve STUDIO (el de pago).",
                  MessageBoxIcon.Error);
            return 1;
        }

        string destino = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Blackmagic Design", "DaVinci Resolve", "Support", "Workflow Integration Plugins", CARPETA);
        InstalarEn(destino, nodo);

        Aviso("Instalado (versión " + InfoInstalador.Version + ").\n\n" +
              "Abre DaVinci Resolve y ve a:\nWorkspace → Workflow Integrations → Labstream Correcciones\n\n" +
              "De aquí en adelante el panel se actualiza solo.", MessageBoxIcon.Information);
        return 0;
    }

    // El mismo recorrido, pero a una carpeta de prueba y sin ventanas: deja constancia en
    // resultado.txt y en el código de salida (0 todo bien, 2 sin SDK, 1 error).
    private static int Probar(string dir)
    {
        var log = new StringBuilder();
        int salida = 0;
        Directory.CreateDirectory(dir);
        try
        {
            log.AppendLine("version: " + InfoInstalador.Version);
            log.AppendLine("admin: " + EsAdmin());

            string nodo = BuscarNodo();
            log.AppendLine("nodo: " + (nodo != null ? nodo : "NO ENCONTRADO"));
            if (nodo == null) salida = 2;

            string destino = Path.Combine(dir, "instalado", CARPETA);
            InstalarEn(destino, nodo);
            string[] archivos = Directory.GetFiles(destino);
            log.AppendLine("instalados: " + archivos.Length + " archivos en " + destino);
            foreach (string a in archivos)
                log.AppendLine("  " + Path.GetFileName(a) + "  " + new FileInfo(a).Length + " B");

            // Lo mínimo que hace funcional al plugin.
            string[] imprescindibles = { "main.js", "preload.js", "timecode.js", "manifest.xml", "package.json" };
            foreach (string n in imprescindibles)
            {
                if (!File.Exists(Path.Combine(destino, n)))
                {
                    log.AppendLine("FALTA: " + n);
                    salida = 1;
                }
            }
            log.AppendLine(salida == 0 ? "RESULTADO: OK" : "RESULTADO: fallo " + salida);
        }
        catch (Exception e)
        {
            log.AppendLine("ERROR: " + e);
            salida = 1;
        }
        File.WriteAllText(Path.Combine(dir, "resultado.txt"), log.ToString());
        return salida;
    }

    // Extrae el kit embebido y copia el plugin (y el .node si lo hay) al destino.
    private static void InstalarEn(string destino, string nodo)
    {
        string tmp = Path.Combine(Path.GetTempPath(), "labstream-kit-" + Process.GetCurrentProcess().Id);
        if (Directory.Exists(tmp)) Directory.Delete(tmp, true);
        Directory.CreateDirectory(tmp);
        try
        {
            string zip = Path.Combine(tmp, "kit.zip");
            using (Stream recurso = Assembly.GetExecutingAssembly().GetManifestResourceStream("kit.zip"))
            {
                if (recurso == null) throw new Exception("El instalador está corrupto: no trae el kit embebido.");
                using (FileStream f = File.Create(zip)) recurso.CopyTo(f);
            }
            ZipFile.ExtractToDirectory(zip, tmp);

            string origen = Path.Combine(tmp, CARPETA);
            if (!Directory.Exists(origen)) throw new Exception("El kit embebido no trae la carpeta del plugin.");

            Directory.CreateDirectory(destino);
            foreach (string archivo in Directory.GetFiles(origen))
                File.Copy(archivo, Path.Combine(destino, Path.GetFileName(archivo)), true);
            if (nodo != null)
                File.Copy(nodo, Path.Combine(destino, "WorkflowIntegration.node"), true);
        }
        finally
        {
            try { Directory.Delete(tmp, true); } catch { }
        }
    }

    // El .node vive en el SDK del Resolve local; se busca en las mismas rutas que el .ps1.
    private static string BuscarNodo()
    {
        string[] raices =
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "Blackmagic Design", "DaVinci Resolve", "Support", "Developer", "Workflow Integrations"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Blackmagic Design", "DaVinci Resolve", "Support", "Developer", "Workflow Integrations"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                "Blackmagic Design", "DaVinci Resolve", "Developer", "Workflow Integrations"),
        };
        foreach (string raiz in raices)
        {
            try
            {
                if (!Directory.Exists(raiz)) continue;
                string[] hallados = Directory.GetFiles(raiz, "WorkflowIntegration.node", SearchOption.AllDirectories);
                if (hallados.Length > 0) return hallados[0];
            }
            catch { }
        }
        return null;
    }

    private static bool EsAdmin()
    {
        using (WindowsIdentity id = WindowsIdentity.GetCurrent())
            return new WindowsPrincipal(id).IsInRole(WindowsBuiltInRole.Administrator);
    }

    private static void Aviso(string texto, MessageBoxIcon icono)
    {
        MessageBox.Show(texto, "Labstream Correcciones", MessageBoxButtons.OK, icono);
    }
}
