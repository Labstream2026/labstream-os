// Cuántos fotogramas trae la tira de barrido de un video.
//
// Vive en su PROPIO módulo, sin nada de Node dentro, porque lo necesitan las dos orillas: el
// servidor para nombrar y servir el fichero, y la cuadrícula (componente cliente) para saber en
// cuántos trozos partir el barrido. Importarlo de `nas-galeria.ts` arrastraba `sharp` —y con él
// `child_process`— al bundle del navegador, y la página entera se caía con «Module not found».
//
// El número es un CONTRATO con LabTem: es el `TIRA_FOTOGRAMAS` de hacer-proxies.sh, y el propio
// script cuenta con que no cambie («si el video se queda corto, tile rellena en negro:
// preferible a una tira con menos casillas, porque el CSS cuenta con que siempre son 20»).
// Cambiarlo aquí sin cambiarlo allá desalinea el barrido.
export const TIRA_FOTOGRAMAS = 20;
